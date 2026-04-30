import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TicketStatus } from '@prisma-generated/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPagination, buildPaginationMeta } from '../../common/utils/pagination.util';
import { WalletService } from '../wallet/wallet.service';
import { RoutesService } from '../routes/routes.service';
import { QrService } from './qr.service';
import { PurchaseTicketDto } from './dto/purchase-ticket.dto';
import { TicketQueryDto } from './dto/ticket-query.dto';

const TICKET_EXPIRY_MS = 60 * 60 * 1000; // 60 minutes

const TICKET_INCLUDE = {
  route: { select: { id: true, name: true, routeNumber: true } },
  boardingStop: { select: { id: true, name: true } },
  dropoffStop: { select: { id: true, name: true } },
} as const;

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private walletService: WalletService,
    private routesService: RoutesService,
    private qrService: QrService,
  ) {}

  async purchase(userId: string, dto: PurchaseTicketDto, idempotencyKey: string) {
    const { fare } = await this.routesService.getFare(
      dto.routeId,
      dto.boardingStopId,
      dto.dropoffStopId,
    );

    const ticketId = randomUUID();
    const purchasedAt = new Date();
    const expiresAt = new Date(purchasedAt.getTime() + TICKET_EXPIRY_MS);

    return this.prisma.$transaction(async (tx) => {
      await this.walletService.debit(tx, userId, fare, ticketId, idempotencyKey);

      const ticket = await tx.ticket.create({
        data: {
          id: ticketId,
          passengerId: userId,
          routeId: dto.routeId,
          boardingStopId: dto.boardingStopId,
          dropoffStopId: dto.dropoffStopId,
          fareAmount: fare,
          status: TicketStatus.ACTIVE,
          purchasedAt,
          expiresAt,
          qrPayload: '',
          qrSignature: '',
        },
      });

      const { payload, signature } = this.qrService.sign({
        ticketId: ticket.id,
        passengerId: userId,
        routeId: dto.routeId,
        boardingStopId: dto.boardingStopId,
        dropoffStopId: dto.dropoffStopId,
        fareAmount: fare,
        expiresAt: expiresAt.toISOString(),
        issuedAt: purchasedAt.toISOString(),
      });

      return tx.ticket.update({
        where: { id: ticket.id },
        data: { qrPayload: payload, qrSignature: signature },
        include: TICKET_INCLUDE,
      });
    });
  }

  async findAllForUser(userId: string, query: TicketQueryDto) {
    const sortBy = this.normalizeSortBy(query.sortBy);
    const pagination = buildPagination({ ...query, sortBy });

    const where = {
      passengerId: userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.routeId ? { routeId: query.routeId } : {}),
      ...(query.fromDate || query.toDate
        ? {
            purchasedAt: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: TICKET_INCLUDE,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: pagination.orderBy,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      items,
      meta: buildPaginationMeta(query.page ?? 1, query.limit ?? 20, total),
    };
  }

  async findOneForUser(userId: string, ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        route: true,
        boardingStop: true,
        dropoffStop: true,
      },
    });

    if (!ticket || ticket.passengerId !== userId) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  async markUsed(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.status !== TicketStatus.ACTIVE) {
      throw new ConflictException(`Cannot mark ticket as used: current status is ${ticket.status}`);
    }

    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: TicketStatus.USED, usedAt: new Date() },
    });
  }

  async expireAndRefund(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (ticket.status !== TicketStatus.ACTIVE && ticket.status !== TicketStatus.EXPIRED) {
      throw new ConflictException(
        `Cannot expire/refund ticket: current status is ${ticket.status}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (ticket.status === TicketStatus.ACTIVE) {
        await tx.ticket.update({
          where: { id: ticketId },
          data: { status: TicketStatus.EXPIRED },
        });
      }

      await this.walletService.credit(
        tx,
        ticket.passengerId,
        ticket.fareAmount,
        ticketId,
        'Ticket expired – refund issued',
      );

      return tx.ticket.update({
        where: { id: ticketId },
        data: { status: TicketStatus.REFUNDED, refundedAt: new Date() },
      });
    });
  }

  async findById(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private normalizeSortBy(value?: string): string {
    const allowed = new Set(['purchasedAt', 'createdAt', 'expiresAt', 'fareAmount']);
    if (!value || !allowed.has(value)) return 'purchasedAt';
    return value;
  }
}
