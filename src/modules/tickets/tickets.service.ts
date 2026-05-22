import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TicketStatus } from '@prisma-generated/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPagination, buildPaginationMeta } from '../../common/utils/pagination.util';
import {
  DEFAULT_LOCALE,
  Locale,
  localize,
} from '../../common/utils/localized-string';
import {
  MessageTemplates,
  renderAllLocales,
} from '../../common/utils/message-templates';
import { NotificationsService } from '../notifications/notifications.service';
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
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private prisma: PrismaService,
    private walletService: WalletService,
    private routesService: RoutesService,
    private qrService: QrService,
    private notificationsService: NotificationsService,
  ) {}

  async purchase(
    userId: string,
    dto: PurchaseTicketDto,
    idempotencyKey: string,
    locale: Locale = DEFAULT_LOCALE,
  ) {
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

      const updated = await tx.ticket.update({
        where: { id: ticket.id },
        data: { qrPayload: payload, qrSignature: signature },
        include: TICKET_INCLUDE,
      });
      return this.localizeTicket(updated, locale);
    });
  }

  async findAllForUser(userId: string, query: TicketQueryDto, locale: Locale = DEFAULT_LOCALE) {
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
      items: items.map((t) => this.localizeTicket(t, locale)),
      meta: buildPaginationMeta(query.page ?? 1, query.limit ?? 20, total),
    };
  }

  async findOneForUser(userId: string, ticketId: string, locale: Locale = DEFAULT_LOCALE) {
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

    return this.localizeTicket(ticket, locale);
  }

  async dropSignal(passengerId: string, ticketId: string, locale: Locale = DEFAULT_LOCALE) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { dropoffStop: { select: { name: true } } },
    });

    if (!ticket || ticket.passengerId !== passengerId) {
      throw new NotFoundException('Ticket not found');
    }

    if (ticket.status !== TicketStatus.USED) {
      throw new UnprocessableEntityException('Drop signal is only available for boarded tickets');
    }

    const scanEvent = await this.prisma.scanEvent.findFirst({
      where: { ticketId },
      orderBy: { scannedAt: 'desc' },
      select: { tripId: true, trip: { select: { driverId: true } } },
    });

    if (!scanEvent?.trip) {
      throw new UnprocessableEntityException('No active trip linked to this ticket');
    }

    const stopName = localize(ticket.dropoffStop.name, locale);
    const driverId = scanEvent.trip.driverId;

    try {
      await this.notificationsService.sendPush(
        driverId,
        'Drop Requested',
        `A passenger is requesting to drop off at ${stopName}`,
        { ticketId, stopName },
      );
    } catch {
      this.logger.warn(`Push failed for drop signal: driverId=${driverId}, ticketId=${ticketId}`);
    }

    return { signaled: true, dropoffStop: stopName };
  }

  private localizeTicket<T extends {
    route: { name: unknown } & Record<string, unknown>;
    boardingStop: { name: unknown } & Record<string, unknown>;
    dropoffStop: { name: unknown } & Record<string, unknown>;
  }>(ticket: T, locale: Locale) {
    return {
      ...ticket,
      route: { ...ticket.route, name: localize(ticket.route.name, locale) },
      boardingStop: { ...ticket.boardingStop, name: localize(ticket.boardingStop.name, locale) },
      dropoffStop: { ...ticket.dropoffStop, name: localize(ticket.dropoffStop.name, locale) },
    };
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
        renderAllLocales(MessageTemplates.TICKET_REFUND_DESCRIPTION),
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
