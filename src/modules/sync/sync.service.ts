import { Injectable } from '@nestjs/common';
import { ScanResult, TicketStatus } from '@prisma-generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QrService, type QrPayloadData } from '../tickets/qr.service';
import { BatchSyncDto, OfflineScanDto } from './dto';

export type ScanAction =
  | 'MARKED_USED'
  | 'ALREADY_USED_SERVER_WINS'
  | 'ALREADY_USED_OFFLINE_WINS'
  | 'EXPIRED'
  | 'INVALID'
  | 'INSPECTION_LOGGED'
  | 'IDEMPOTENT_SKIP';

export type ScanAnomaly =
  | 'CROSS_DEVICE_DUPLICATE'
  | 'TIME_DISCREPANCY'
  | 'RESULT_MISMATCH'
  | null;

export interface ScanItemResult {
  qrPayload: string;
  serverResult: ScanResult;
  localResult: ScanResult | null;
  action: ScanAction;
  ticketId: string | null;
  anomaly: ScanAnomaly;
}

export interface ReconciliationReport {
  totalReceived: number;
  processed: number;
  failed: number;
  anomalies: number;
  results: ScanItemResult[];
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SyncService {
  constructor(
    private prisma: PrismaService,
    private qrService: QrService,
  ) {}

  async reconcile(driverId: string, dto: BatchSyncDto): Promise<ReconciliationReport> {
    const syncedAt = new Date();
    const results: ScanItemResult[] = [];

    for (const scan of dto.scans) {
      const item = await this.processScan(driverId, scan, syncedAt);
      results.push(item);
    }

    const failed = results.filter((r) => r.action === 'INVALID').length;

    return {
      totalReceived: results.length,
      processed: results.length - failed,
      failed,
      anomalies: results.filter((r) => r.anomaly !== null).length,
      results,
    };
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async processScan(
    driverId: string,
    scan: OfflineScanDto,
    syncedAt: Date,
  ): Promise<ScanItemResult> {
    const scannedAt = new Date(scan.scannedAt);
    const isInspection = scan.inspectionMode ?? false;

    // Step 1: Verify QR signature
    if (!this.qrService.verify(scan.qrPayload, scan.qrSignature)) {
      return {
        qrPayload: scan.qrPayload,
        serverResult: ScanResult.INVALID_SIGNATURE,
        localResult: scan.localResult ?? null,
        action: 'INVALID',
        ticketId: this.tryExtractTicketId(scan.qrPayload),
        anomaly: this.checkResultMismatch(scan.localResult, ScanResult.INVALID_SIGNATURE),
      };
    }

    // Step 2: Decode payload
    let parsed: QrPayloadData;
    try {
      parsed = JSON.parse(scan.qrPayload) as QrPayloadData;
    } catch {
      return {
        qrPayload: scan.qrPayload,
        serverResult: ScanResult.INVALID_SIGNATURE,
        localResult: scan.localResult ?? null,
        action: 'INVALID',
        ticketId: null,
        anomaly: null,
      };
    }

    const ticketId = parsed.ticketId;

    // Step 3: Find ticket
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, status: true, expiresAt: true, usedAt: true },
    });

    if (!ticket) {
      return {
        qrPayload: scan.qrPayload,
        serverResult: ScanResult.INVALID_SIGNATURE,
        localResult: scan.localResult ?? null,
        action: 'INVALID',
        ticketId,
        anomaly: null,
      };
    }

    // Re-sync idempotency: same ticketId + driverId + scannedAt already processed
    const existingEvent = await this.prisma.scanEvent.findFirst({
      where: { ticketId, driverId, scannedAt, isOffline: true },
      select: { result: true },
    });
    if (existingEvent) {
      return {
        qrPayload: scan.qrPayload,
        serverResult: existingEvent.result,
        localResult: scan.localResult ?? null,
        action: 'IDEMPOTENT_SKIP',
        ticketId,
        anomaly: null,
      };
    }

    const timeDiscrepancy: ScanAnomaly =
      syncedAt.getTime() - scannedAt.getTime() > TWENTY_FOUR_HOURS_MS
        ? 'TIME_DISCREPANCY'
        : null;

    // Step 5: Check expiry at the time the offline scan occurred
    if (scannedAt > ticket.expiresAt) {
      const tripId = await this.resolveTripId(driverId, scannedAt);
      await this.prisma.scanEvent.create({
        data: {
          ticketId,
          driverId,
          tripId,
          result: ScanResult.EXPIRED,
          isInspection,
          isOffline: true,
          scannedAt,
          syncedAt,
        },
      });
      return {
        qrPayload: scan.qrPayload,
        serverResult: ScanResult.EXPIRED,
        localResult: scan.localResult ?? null,
        action: 'EXPIRED',
        ticketId,
        anomaly:
          timeDiscrepancy ?? this.checkResultMismatch(scan.localResult, ScanResult.EXPIRED),
      };
    }

    // Step 4: Check if ticket was already used on the server
    if (ticket.status === TicketStatus.USED && ticket.usedAt) {
      const tripId = await this.resolveTripId(driverId, scannedAt);
      const crossDevice = await this.checkCrossDevice(ticketId, driverId);

      if (ticket.usedAt <= scannedAt) {
        // Server scan is earlier (or equal) — offline scan loses
        await this.prisma.scanEvent.create({
          data: {
            ticketId,
            driverId,
            tripId,
            result: ScanResult.ALREADY_USED,
            isInspection,
            isOffline: true,
            scannedAt,
            syncedAt,
          },
        });
        return {
          qrPayload: scan.qrPayload,
          serverResult: ScanResult.ALREADY_USED,
          localResult: scan.localResult ?? null,
          action: 'ALREADY_USED_SERVER_WINS',
          ticketId,
          anomaly:
            crossDevice ??
            timeDiscrepancy ??
            this.checkResultMismatch(scan.localResult, ScanResult.ALREADY_USED),
        };
      }

      // Offline scan is earlier — offline wins, update ticket.usedAt
      if (!isInspection) {
        await this.prisma.ticket.update({
          where: { id: ticketId },
          data: { usedAt: scannedAt },
        });
      }
      const serverResult = isInspection ? ScanResult.INSPECTION_ONLY : ScanResult.VALID;
      await this.prisma.scanEvent.create({
        data: {
          ticketId,
          driverId,
          tripId,
          result: serverResult,
          isInspection,
          isOffline: true,
          scannedAt,
          syncedAt,
        },
      });
      return {
        qrPayload: scan.qrPayload,
        serverResult,
        localResult: scan.localResult ?? null,
        action: 'ALREADY_USED_OFFLINE_WINS',
        ticketId,
        anomaly: crossDevice ?? this.checkResultMismatch(scan.localResult, serverResult),
      };
    }

    // Step 6: Valid, unused, not expired at scan time
    const tripId = await this.resolveTripId(driverId, scannedAt);

    if (isInspection) {
      await this.prisma.scanEvent.create({
        data: {
          ticketId,
          driverId,
          tripId,
          result: ScanResult.INSPECTION_ONLY,
          isInspection: true,
          isOffline: true,
          scannedAt,
          syncedAt,
        },
      });
      return {
        qrPayload: scan.qrPayload,
        serverResult: ScanResult.INSPECTION_ONLY,
        localResult: scan.localResult ?? null,
        action: 'INSPECTION_LOGGED',
        ticketId,
        anomaly:
          timeDiscrepancy ??
          this.checkResultMismatch(scan.localResult, ScanResult.INSPECTION_ONLY),
      };
    }

    // Mark ticket as USED with the device's offline timestamp
    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status: TicketStatus.USED, usedAt: scannedAt },
    });
    await this.prisma.scanEvent.create({
      data: {
        ticketId,
        driverId,
        tripId,
        result: ScanResult.VALID,
        isInspection: false,
        isOffline: true,
        scannedAt,
        syncedAt,
      },
    });

    return {
      qrPayload: scan.qrPayload,
      serverResult: ScanResult.VALID,
      localResult: scan.localResult ?? null,
      action: 'MARKED_USED',
      ticketId,
      anomaly: timeDiscrepancy ?? this.checkResultMismatch(scan.localResult, ScanResult.VALID),
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async resolveTripId(driverId: string, scannedAt: Date): Promise<string | null> {
    const trip = await this.prisma.trip.findFirst({
      where: {
        driverId,
        startedAt: { lte: scannedAt },
        OR: [{ endedAt: null }, { endedAt: { gte: scannedAt } }],
      },
      select: { id: true },
    });
    return trip?.id ?? null;
  }

  private async checkCrossDevice(ticketId: string, driverId: string): Promise<ScanAnomaly> {
    const foreignScan = await this.prisma.scanEvent.findFirst({
      where: { ticketId, driverId: { not: driverId } },
      select: { id: true },
    });
    return foreignScan ? 'CROSS_DEVICE_DUPLICATE' : null;
  }

  private checkResultMismatch(
    localResult: ScanResult | undefined,
    serverResult: ScanResult,
  ): ScanAnomaly {
    if (!localResult) return null;
    return localResult !== serverResult ? 'RESULT_MISMATCH' : null;
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
