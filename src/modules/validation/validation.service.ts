import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ScanResult, TicketStatus } from '@prisma-generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MlService } from '../ml/ml.service';
import type { ScanAnomalyRequestDto } from '../ml/dto/scan-anomaly.dto';
import { QrService, type QrPayloadData } from '../tickets/qr.service';
import { TripsService } from '../trips/trips.service';
import { AnomalyService } from './anomaly.service';
import { buildPagination, buildPaginationMeta } from '../../common/utils/pagination.util';
import {
  DEFAULT_LOCALE,
  Locale,
  localize,
} from '../../common/utils/localized-string';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ValidateTicketDto } from './dto/validate-ticket.dto';

const TICKET_SELECT = {
  id: true,
  status: true,
  fareAmount: true,
  purchasedAt: true,
  expiresAt: true,
  passengerId: true,
  route: { select: { routeNumber: true, name: true } },
  boardingStop: { select: { id: true, name: true } },
  dropoffStop: { select: { name: true } },
} as const;

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  constructor(
    private prisma: PrismaService,
    private qrService: QrService,
    private tripsService: TripsService,
    private mlService: MlService,
    private anomalyService: AnomalyService,
  ) {}

  async validateTicket(driverId: string, dto: ValidateTicketDto, locale: Locale = DEFAULT_LOCALE) {
    const isInspection = dto.inspectionMode ?? false;
    const scannedAt = new Date();

    // Step 1 — signature check BEFORE any DB lookup
    if (!this.qrService.verify(dto.qrPayload, dto.qrSignature)) {
      await this.logScan({
        driverId,
        ticketId: this.tryExtractTicketId(dto.qrPayload),
        tripId: null,
        result: ScanResult.INVALID_SIGNATURE,
        isInspection,
        scannedAt,
      });
      throw new BadRequestException('Invalid QR signature');
    }

    // Step 2 — decode payload
    let parsed: QrPayloadData;
    try {
      parsed = JSON.parse(dto.qrPayload) as QrPayloadData;
    } catch {
      throw new BadRequestException('Malformed QR payload');
    }

    // Step 3 — fetch ticket
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: parsed.ticketId },
      select: TICKET_SELECT,
    });

    const activeTrip = await this.tripsService.getActiveTrip(driverId);
    const tripId = activeTrip?.id ?? null;

    if (!ticket) {
      await this.logScan({
        driverId,
        ticketId: null,
        tripId,
        result: ScanResult.INVALID_SIGNATURE,
        isInspection,
        scannedAt,
      });
      throw new BadRequestException('Ticket not found');
    }

    const passenger = await this.prisma.user.findUnique({
      where: { id: ticket.passengerId },
      select: { fullName: true },
    });

    // Step 4 — expiry check (real-time, not DB status)
    if (new Date() > ticket.expiresAt) {
      await this.logScan({
        driverId,
        ticketId: ticket.id,
        tripId,
        result: ScanResult.EXPIRED,
        isInspection,
        scannedAt,
      });
      throw new GoneException({
        result: ScanResult.EXPIRED,
        ticket: this.localizeTicket(ticket, locale),
        passenger,
        scannedAt,
        isInspection,
      });
    }

    // Step 5 — usage check
    if (!isInspection && (ticket.status === TicketStatus.USED)) {
      await this.logScan({
        driverId,
        ticketId: ticket.id,
        tripId,
        result: ScanResult.ALREADY_USED,
        isInspection,
        scannedAt,
      });
      throw new ConflictException({
        result: ScanResult.ALREADY_USED,
        ticket: this.localizeTicket(ticket, locale),
        passenger,
        scannedAt,
        isInspection,
      });
    }

    // Step 6 — mark used (or inspection skip)
    let finalResult: ScanResult;
    let finalTicket = ticket;

    if (isInspection) {
      finalResult = ScanResult.INSPECTION_ONLY;
    } else {
      // Atomic update — guards against concurrent double-scan
      const { count } = await this.prisma.ticket.updateMany({
        where: { id: ticket.id, status: TicketStatus.ACTIVE },
        data: { status: TicketStatus.USED, usedAt: scannedAt },
      });

      if (count === 0) {
        // Lost the race — another driver claimed it first
        await this.logScan({
          driverId,
          ticketId: ticket.id,
          tripId,
          result: ScanResult.ALREADY_USED,
          isInspection,
          scannedAt,
        });
        throw new ConflictException({
          result: ScanResult.ALREADY_USED,
          ticket,
          passenger,
          scannedAt,
          isInspection,
        });
      }

      finalResult = ScanResult.VALID;
      finalTicket = { ...ticket, status: TicketStatus.USED };
    }

    // Step 7 — log scan
    const scanEventId = await this.logScan({
      driverId,
      ticketId: ticket.id,
      tripId,
      result: finalResult,
      isInspection,
      scannedAt,
    });

    // Step 8 — dispatch ML anomaly audit (fire-and-forget, must not block scan)
    if (!isInspection) {
      this.dispatchAnomalyAudit({
        scanEventId,
        ticketId: ticket.id,
        passengerId: ticket.passengerId,
        boardingStopId: ticket.boardingStop?.id ?? null,
        result: finalResult,
        scannedAt,
        fareAmount: Number(ticket.fareAmount),
        purchasedAt: ticket.purchasedAt,
        expiresAt: ticket.expiresAt,
        deviceLat: dto.latitude,
        deviceLng: dto.longitude,
        deviceId: dto.deviceId,
      });
    }

    return {
      result: finalResult,
      ticket: this.localizeTicket(finalTicket, locale),
      passenger,
      scannedAt,
      isInspection,
    };
  }

  /**
   * Build the ML anomaly payload and dispatch without awaiting. Failures here
   * never propagate to the driver-facing scan response (NFR-PERF-02 ≤ 1s).
   */
  private dispatchAnomalyAudit(params: {
    scanEventId: string | null;
    ticketId: string;
    passengerId: string;
    boardingStopId: string | null;
    result: ScanResult;
    scannedAt: Date;
    fareAmount: number;
    purchasedAt: Date;
    expiresAt: Date;
    deviceLat?: number;
    deviceLng?: number;
    deviceId?: string;
  }): void {
    void (async () => {
      try {
        const stop = params.boardingStopId
          ? await this.prisma.stop.findUnique({
              where: { id: params.boardingStopId },
              select: { id: true, latitude: true, longitude: true },
            })
          : null;

        // If we have neither device GPS nor a stop with coordinates, audit
        // would degenerate to checks that don't depend on geo — still useful.
        const stopLat = Number(stop?.latitude ?? params.deviceLat ?? 0);
        const stopLng = Number(stop?.longitude ?? params.deviceLng ?? 0);

        const payload: ScanAnomalyRequestDto = {
          eventId: params.scanEventId ?? `EV-${params.ticketId}-${params.scannedAt.getTime()}`,
          result: params.result,
          isOffline: false,
          scannedAt: params.scannedAt.toISOString(),
          syncedAt: new Date().toISOString(),
          syncDelaySeconds: 0,
          scanMetadata: {
            latitude: params.deviceLat ?? stopLat,
            longitude: params.deviceLng ?? stopLng,
            deviceId: params.deviceId ?? 'unknown',
          },
          ticketContext: {
            ticketId: params.ticketId,
            passengerId: params.passengerId,
            fareAmount: params.fareAmount,
            purchasedAt: params.purchasedAt.toISOString(),
            expiresAt: params.expiresAt.toISOString(),
            qrSignatureValid: params.result !== ScanResult.INVALID_SIGNATURE,
          },
          boardingStop: {
            id: stop?.id ?? 'BS-UNKNOWN',
            latitude: stopLat,
            longitude: stopLng,
          },
        };

        const audit = await this.mlService.detectScanAnomaly(payload);
        await this.anomalyService.record(audit, params.scanEventId);
      } catch (err) {
        this.logger.warn(`Background anomaly audit failed: ${(err as Error).message}`);
      }
    })();
  }

  private localizeTicket<T extends {
    route: { routeNumber: string; name: unknown };
    boardingStop: { name: unknown };
    dropoffStop: { name: unknown };
  }>(ticket: T, locale: Locale) {
    return {
      ...ticket,
      route: { ...ticket.route, name: localize(ticket.route.name, locale) },
      boardingStop: { ...ticket.boardingStop, name: localize(ticket.boardingStop.name, locale) },
      dropoffStop: { ...ticket.dropoffStop, name: localize(ticket.dropoffStop.name, locale) },
    };
  }

  async getScansForTrip(driverId: string, tripId: string, query: PaginationQueryDto) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { driverId: true },
    });

    if (!trip || trip.driverId !== driverId) {
      throw new BadRequestException('Trip not found');
    }

    const pagination = buildPagination(query);

    const [items, total] = await Promise.all([
      this.prisma.scanEvent.findMany({
        where: { tripId, isInspection: false },
        skip: pagination.skip,
        take: pagination.take,
        orderBy: pagination.orderBy,
        select: {
          id: true,
          result: true,
          scannedAt: true,
          isInspection: true,
          ticket: {
            select: {
              id: true,
              fareAmount: true,
              passengerId: true,
              passenger: { select: { fullName: true } },
              dropoffStop: {
                select: {
                  id: true,
                  name: true,
                  latitude: true,
                  longitude: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.scanEvent.count({ where: { tripId, isInspection: false } }),
    ]);

    // Build a set of passengerIds seen before each item (ordered by scannedAt)
    const allPassengerScans = await this.prisma.scanEvent.findMany({
      where: { tripId, isInspection: false },
      orderBy: { scannedAt: 'asc' },
      select: { id: true, ticket: { select: { passengerId: true } } },
    });

    const seenBefore = new Map<string, boolean>();
    const scanOrder = new Map<string, boolean>();

    for (const scan of allPassengerScans) {
      const pid = scan.ticket.passengerId;
      scanOrder.set(scan.id, seenBefore.has(pid));
      seenBefore.set(pid, true);
    }

    const shaped = items.map(({ ticket, ...scan }) => ({
      ...scan,
      passenger: ticket.passenger,
      ticket: { id: ticket.id, fareAmount: ticket.fareAmount, dropoffStop: ticket.dropoffStop },
      isPreviouslySeen: scanOrder.get(scan.id) ?? false,
    }));

    return {
      items: shaped,
      meta: buildPaginationMeta(query.page ?? 1, query.limit ?? 20, total),
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async logScan(params: {
    driverId: string;
    ticketId: string | null;
    tripId: string | null;
    result: ScanResult;
    isInspection: boolean;
    scannedAt: Date;
  }): Promise<string | null> {
    if (!params.ticketId) return null; // ScanEvent.ticketId is non-nullable — skip if unknown
    const created = await this.prisma.scanEvent.create({
      data: {
        ticketId: params.ticketId,
        driverId: params.driverId,
        tripId: params.tripId,
        result: params.result,
        isInspection: params.isInspection,
        isOffline: false,
        scannedAt: params.scannedAt,
      },
      select: { id: true },
    });
    return created.id;
  }

  private tryExtractTicketId(payload: string): string | null {
    try {
      const parsed = JSON.parse(payload) as { ticketId?: string };
      return typeof parsed.ticketId === 'string' ? parsed.ticketId : null;
    } catch {
      return null;
    }
  }
}
