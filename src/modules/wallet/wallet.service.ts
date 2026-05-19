import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  WalletTransaction,
  WalletTransactionStatus,
  WalletTransactionType,
} from '@prisma-generated/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPagination, buildPaginationMeta } from '../../common/utils/pagination.util';
import {
  DEFAULT_LOCALE,
  Locale,
  localizeNullable,
  type LocalizedString,
} from '../../common/utils/localized-string';
import {
  MessageTemplates,
  renderAllLocales,
} from '../../common/utils/message-templates';
import { TopupDto } from './dto/topup.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { PaymentProvider } from './providers/payment.provider';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class WalletService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private payment: PaymentProvider,
  ) {}

  async getBalance(userId: string): Promise<{ balance: number; currency: 'ETB' }> {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    return { balance: wallet.balance, currency: 'ETB' };
  }

  async initiateTopup(
    userId: string,
    dto: TopupDto,
    idempotencyKey: string,
  ): Promise<{
    transaction: { id: string; amount: number; status: WalletTransactionStatus };
    paymentUrl: string;
  }> {
    const min = this.config.get<number>('app.wallet.minTopupAmount') ?? 10;
    const max = this.config.get<number>('app.wallet.maxTopupAmount') ?? 10000;

    const existing = await this.prisma.walletTransaction.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Idempotency key already used for a wallet transaction');
    }

    if (dto.amount < min || dto.amount > max) {
      throw new BadRequestException(`Amount must be between ${min} and ${max} ETB`);
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const callbackUrl =
      this.config.get<string>('app.chapa.callbackUrl') ??
      `${this.config.get<string>('app.publicUrl')}/api/v1/webhook/payment`;

    const [firstName, ...rest] = wallet.user.fullName.trim().split(/\s+/);
    const provider = await this.payment.initiate(dto.amount, dto.paymentMethod, callbackUrl, {
      firstName: firstName || 'User',
      lastName: rest.join(' ') || 'Passenger',
      phone: wallet.user.phone,
    });

    const created = await this.prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: WalletTransactionType.TOPUP,
        status: WalletTransactionStatus.PENDING,
        amount: dto.amount,
        externalRef: provider.externalRef,
        idempotencyKey,
        description: renderAllLocales(MessageTemplates.TOPUP_INITIATED_DESCRIPTION),
      },
    });

    return {
      transaction: {
        id: created.id,
        amount: created.amount,
        status: created.status,
      },
      paymentUrl: provider.paymentUrl,
    };
  }

  async getTransactions(
    userId: string,
    query: TransactionQueryDto,
    locale: Locale = DEFAULT_LOCALE,
  ) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const sortBy = this.normalizeSortBy(query.sortBy);
    const pagination = buildPagination({ ...query, sortBy });
    const where: Prisma.WalletTransactionWhereInput = {
      walletId: wallet.id,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.fromDate || query.toDate
        ? {
            createdAt: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: pagination.orderBy,
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);

    return {
      items: items.map((t) => ({ ...t, description: localizeNullable(t.description, locale) })),
      meta: buildPaginationMeta(query.page ?? 1, query.limit ?? 20, total),
    };
  }

  async debit(
    tx: TxClient,
    userId: string,
    amount: number,
    ticketId: string,
    idempotencyKey: string,
  ): Promise<WalletTransaction> {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    if (wallet.balance < amount) {
      throw new HttpException('Insufficient wallet balance', HttpStatus.PAYMENT_REQUIRED);
    }

    const newBalance = wallet.balance - amount;
    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });

    return tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: WalletTransactionType.TICKET_PURCHASE,
        status: WalletTransactionStatus.COMPLETED,
        amount,
        balanceAfter: newBalance,
        ticketId,
        idempotencyKey,
      },
    });
  }

  async credit(
    tx: TxClient,
    userId: string,
    amount: number,
    ticketId: string,
    description: LocalizedString,
  ): Promise<WalletTransaction> {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');

    const newBalance = wallet.balance + amount;
    await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });

    return tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: WalletTransactionType.REFUND,
        status: WalletTransactionStatus.COMPLETED,
        amount,
        balanceAfter: newBalance,
        ticketId,
        description,
      },
    });
  }

  async processWebhook(rawBody: Buffer, signature: string | undefined): Promise<void> {
    if (!signature) {
      throw new BadRequestException('Missing webhook signature');
    }

    const ok = this.payment.verifyWebhookSignature(rawBody, signature);
    if (!ok) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const payload = JSON.parse(rawBody.toString('utf8')) as {
      status?: string;
      tx_ref?: string;
      data?: { tx_ref?: string; status?: string };
    };

    const externalRef = payload.tx_ref ?? payload.data?.tx_ref;
    const status = (payload.status ?? payload.data?.status ?? '').toLowerCase();
    if (!externalRef) return;

    const txn = await this.prisma.walletTransaction.findFirst({
      where: { externalRef, type: WalletTransactionType.TOPUP },
      include: { wallet: true },
    });

    if (!txn) return;
    if (txn.status === WalletTransactionStatus.COMPLETED) return;

    if (status === 'success' || status === 'completed') {
      await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: txn.walletId } });
        const newBalance = wallet.balance + txn.amount;

        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
        await tx.walletTransaction.update({
          where: { id: txn.id },
          data: {
            status: WalletTransactionStatus.COMPLETED,
            balanceAfter: newBalance,
            description: renderAllLocales(MessageTemplates.TOPUP_COMPLETED_DESCRIPTION),
          },
        });
      });
      return;
    }

    await this.prisma.walletTransaction.update({
      where: { id: txn.id },
      data: {
        status: WalletTransactionStatus.FAILED,
        description: renderAllLocales(MessageTemplates.TOPUP_FAILED_DESCRIPTION),
      },
    });
  }

  private normalizeSortBy(value?: string): string {
    const allowed = new Set(['createdAt', 'amount', 'status', 'type']);
    if (!value || !allowed.has(value)) return 'createdAt';
    return value;
  }
}
