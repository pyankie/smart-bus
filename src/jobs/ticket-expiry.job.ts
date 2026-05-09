import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, TicketStatus } from '@prisma-generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../modules/wallet/wallet.service';

const BATCH_SIZE = 100;

@Injectable()
export class TicketExpiryJob {
  private readonly logger = new Logger(TicketExpiryJob.name);

  constructor(
    private prisma: PrismaService,
    private walletService: WalletService,
  ) {}

  @Cron('*/1 * * * *')
  async handleTicketExpiry(): Promise<void> {
    const expired = await this.prisma.ticket.findMany({
      where: { status: TicketStatus.ACTIVE, expiresAt: { lt: new Date() } },
      take: BATCH_SIZE,
    });

    if (expired.length === 0) return;

    let processed = 0;

    for (const ticket of expired) {
      try {
        await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await tx.ticket.update({
            where: { id: ticket.id },
            data: { status: TicketStatus.EXPIRED },
          });

          await this.walletService.credit(
            tx,
            ticket.passengerId,
            ticket.fareAmount,
            ticket.id,
            'Expired ticket refund',
          );

          await tx.ticket.update({
            where: { id: ticket.id },
            data: { status: TicketStatus.REFUNDED, refundedAt: new Date() },
          });
        });

        processed++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to expire ticket ${ticket.id}: ${message}`, {
          ticketId: ticket.id,
          passengerId: ticket.passengerId,
        });
      }
    }

    this.logger.log(`Expired and refunded ${processed} tickets`);

    // Full batch — there may be more; re-run immediately
    if (expired.length === BATCH_SIZE) {
      await this.handleTicketExpiry();
    }
  }
}
