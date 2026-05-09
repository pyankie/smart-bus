import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, TicketStatus } from '@prisma-generated/client';
import { stringify } from 'csv-stringify/sync';
import { buildPaginationMeta } from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AnomalyQueryDto } from './dto/anomaly-query.dto';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { ExportQueryDto } from './dto/export-query.dto';
import { RevenueQueryDto } from './dto/revenue-query.dto';
import { TicketAnalyticsQueryDto } from './dto/ticket-analytics-query.dto';
import { TripAnalyticsQueryDto } from './dto/trip-analytics-query.dto';

const REVENUE_STATUSES = [TicketStatus.USED, TicketStatus.EXPIRED];

interface RawRevenueByDay {
  date: string;
  revenue: bigint;
}

interface RawRevenueByRoute {
  routeId: string;
  routeNumber: string;
  routeName: string;
  revenue: bigint;
}

interface RawCrossDeviceDuplicate {
  ticketId: string;
  drivers: string[];
  scannedAt: Date[];
}

interface RawExpiredUse {
  ticketId: string;
  passengerId: string;
  usedAt: Date;
  expiresAt: Date;
}

interface RawHighFailureDriver {
  driverId: string;
  totalScans: bigint;
  failureCount: bigint;
  failureRate: number;
}

interface RawRapidRepeat {
  passengerId: string;
  maxScansInWindow: bigint;
}

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(query: DashboardQueryDto) {
    const { from, to } = this.effectivePeriod(query.fromDate, query.toDate);
    const periodWhere = { gte: from, lte: to };

    const [
      totalUsers,
      activeUsersResult,
      totalTicketsPurchased,
      totalTicketsUsed,
      totalTicketsExpired,
      totalTicketsRefunded,
      revenueResult,
      refundResult,
      totalTrips,
      totalScans,
      anomalyCount,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.ticket.findMany({
        where: { purchasedAt: periodWhere },
        select: { passengerId: true },
        distinct: ['passengerId'],
      }),
      this.prisma.ticket.count({ where: { purchasedAt: periodWhere } }),
      this.prisma.ticket.count({ where: { status: TicketStatus.USED, purchasedAt: periodWhere } }),
      this.prisma.ticket.count({ where: { status: TicketStatus.EXPIRED, purchasedAt: periodWhere } }),
      this.prisma.ticket.count({ where: { status: TicketStatus.REFUNDED, purchasedAt: periodWhere } }),
      this.prisma.ticket.aggregate({
        where: { status: { in: REVENUE_STATUSES }, purchasedAt: periodWhere },
        _sum: { fareAmount: true },
      }),
      this.prisma.walletTransaction.aggregate({
        where: {
          type: 'REFUND',
          status: 'COMPLETED',
          createdAt: periodWhere,
        },
        _sum: { amount: true },
      }),
      this.prisma.trip.count({ where: { scheduledFor: periodWhere } }),
      this.prisma.scanEvent.count({ where: { scannedAt: periodWhere } }),
      this.countAnomalies(from, to),
    ]);

    const totalRevenue = revenueResult._sum.fareAmount ?? 0;
    const totalRefunds = refundResult._sum.amount ?? 0;

    return {
      period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
      totalUsers,
      activeUsersInPeriod: activeUsersResult.length,
      totalTicketsPurchased,
      totalTicketsUsed,
      totalTicketsExpired,
      totalTicketsRefunded,
      totalRevenue,
      totalRefunds,
      netRevenue: totalRevenue - totalRefunds,
      totalTrips,
      totalScans,
      anomalyCount,
    };
  }

  async getRevenue(query: RevenueQueryDto) {
    const { from, to } = this.effectivePeriod(query.fromDate, query.toDate);

    const whereFilter: Prisma.TicketWhereInput = {
      status: { in: REVENUE_STATUSES },
      purchasedAt: { gte: from, lte: to },
      ...(query.routeId ? { routeId: query.routeId } : {}),
    };

    const [totalResult, byRouteRaw, byDayRaw] = await Promise.all([
      this.prisma.ticket.aggregate({
        where: whereFilter,
        _sum: { fareAmount: true },
      }),
      this.prisma.$queryRaw<RawRevenueByRoute[]>`
        SELECT
          t.route_id      AS "routeId",
          r.route_number  AS "routeNumber",
          r.name          AS "routeName",
          SUM(t.fare_amount)::bigint AS revenue
        FROM tickets t
        JOIN routes r ON t.route_id = r.id
        WHERE t.status IN ('USED','EXPIRED')
          AND t.purchased_at >= ${from}
          AND t.purchased_at <= ${to}
          ${query.routeId ? Prisma.sql`AND t.route_id = ${query.routeId}::uuid` : Prisma.empty}
        GROUP BY t.route_id, r.route_number, r.name
        ORDER BY revenue DESC
      `,
      this.prisma.$queryRaw<RawRevenueByDay[]>`
        SELECT
          DATE(t.purchased_at)::text AS date,
          SUM(t.fare_amount)::bigint AS revenue
        FROM tickets t
        WHERE t.status IN ('USED','EXPIRED')
          AND t.purchased_at >= ${from}
          AND t.purchased_at <= ${to}
          ${query.routeId ? Prisma.sql`AND t.route_id = ${query.routeId}::uuid` : Prisma.empty}
        GROUP BY DATE(t.purchased_at)
        ORDER BY date ASC
      `,
    ]);

    return {
      period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
      total: totalResult._sum.fareAmount ?? 0,
      byRoute: byRouteRaw.map((r) => ({
        routeId: r.routeId,
        routeNumber: r.routeNumber,
        routeName: r.routeName,
        revenue: Number(r.revenue),
      })),
      byDay: byDayRaw.map((r) => ({
        date: r.date,
        revenue: Number(r.revenue),
      })),
    };
  }

  async getTickets(query: TicketAnalyticsQueryDto) {
    const { from, to } = this.effectivePeriod(query.fromDate, query.toDate);

    const baseWhere: Prisma.TicketWhereInput = {
      purchasedAt: { gte: from, lte: to },
      ...(query.routeId ? { routeId: query.routeId } : {}),
    };

    const [total, byStatusRaw, byRouteRaw, avgResult] = await Promise.all([
      this.prisma.ticket.count({ where: baseWhere }),
      this.prisma.ticket.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { id: true },
      }),
      this.prisma.$queryRaw<{ routeId: string; routeNumber: string; routeName: string; count: bigint }[]>`
        SELECT
          t.route_id      AS "routeId",
          r.route_number  AS "routeNumber",
          r.name          AS "routeName",
          COUNT(t.id)::bigint AS count
        FROM tickets t
        JOIN routes r ON t.route_id = r.id
        WHERE t.purchased_at >= ${from}
          AND t.purchased_at <= ${to}
          ${query.routeId ? Prisma.sql`AND t.route_id = ${query.routeId}::uuid` : Prisma.empty}
        GROUP BY t.route_id, r.route_number, r.name
        ORDER BY count DESC
      `,
      this.prisma.ticket.aggregate({
        where: { ...baseWhere, status: { in: REVENUE_STATUSES } },
        _avg: { fareAmount: true },
      }),
    ]);

    return {
      period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
      total,
      byStatus: byStatusRaw.map((r) => ({ status: r.status, count: r._count.id })),
      byRoute: byRouteRaw.map((r) => ({
        routeId: r.routeId,
        routeNumber: r.routeNumber,
        routeName: r.routeName,
        count: Number(r.count),
      })),
      averageFare: Math.round(avgResult._avg.fareAmount ?? 0),
    };
  }

  async getTrips(query: TripAnalyticsQueryDto) {
    const { from, to } = this.effectivePeriod(query.fromDate, query.toDate);

    const baseWhere: Prisma.TripWhereInput = {
      scheduledFor: { gte: from, lte: to },
      ...(query.routeId ? { routeId: query.routeId } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
    };

    const [total, byStatusRaw, byRouteRaw, byDriverRaw] = await Promise.all([
      this.prisma.trip.count({ where: baseWhere }),
      this.prisma.trip.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { id: true },
      }),
      this.prisma.$queryRaw<{ routeId: string; routeNumber: string; routeName: string; count: bigint }[]>`
        SELECT
          t.route_id      AS "routeId",
          r.route_number  AS "routeNumber",
          r.name          AS "routeName",
          COUNT(t.id)::bigint AS count
        FROM trips t
        JOIN routes r ON t.route_id = r.id
        WHERE t.scheduled_for >= ${from}
          AND t.scheduled_for <= ${to}
          ${query.routeId ? Prisma.sql`AND t.route_id = ${query.routeId}::uuid` : Prisma.empty}
          ${query.driverId ? Prisma.sql`AND t.driver_id = ${query.driverId}::uuid` : Prisma.empty}
        GROUP BY t.route_id, r.route_number, r.name
        ORDER BY count DESC
      `,
      this.prisma.$queryRaw<{ driverId: string; driverName: string; count: bigint }[]>`
        SELECT
          t.driver_id   AS "driverId",
          u.full_name   AS "driverName",
          COUNT(t.id)::bigint AS count
        FROM trips t
        JOIN users u ON t.driver_id = u.id
        WHERE t.scheduled_for >= ${from}
          AND t.scheduled_for <= ${to}
          ${query.routeId ? Prisma.sql`AND t.route_id = ${query.routeId}::uuid` : Prisma.empty}
          ${query.driverId ? Prisma.sql`AND t.driver_id = ${query.driverId}::uuid` : Prisma.empty}
        GROUP BY t.driver_id, u.full_name
        ORDER BY count DESC
      `,
    ]);

    return {
      period: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
      total,
      byStatus: byStatusRaw.map((r) => ({ status: r.status, count: r._count.id })),
      byRoute: byRouteRaw.map((r) => ({
        routeId: r.routeId,
        routeNumber: r.routeNumber,
        routeName: r.routeName,
        count: Number(r.count),
      })),
      byDriver: byDriverRaw.map((r) => ({
        driverId: r.driverId,
        driverName: r.driverName,
        count: Number(r.count),
      })),
    };
  }

  async getAnomalies(query: AnomalyQueryDto) {
    const { from, to } = this.effectivePeriod(query.fromDate, query.toDate);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const all = await this.detectAnomalies(from, to, query.routeId, query.driverId);
    const total = all.length;
    const items = all.slice((page - 1) * limit, page * limit);

    return { items, meta: buildPaginationMeta(page, limit, total) };
  }

  async exportReport(query: ExportQueryDto): Promise<{ content: string; filename: string }> {
    if (query.format !== 'csv') {
      throw new UnprocessableEntityException('Only CSV export is supported in v1');
    }

    const { from, to } = this.effectivePeriod(query.fromDate, query.toDate);
    const dateTag = from.toISOString().slice(0, 10);
    const filename = `${query.type}-report-${dateTag}.csv`;

    const content = await this.buildCsvExport(query.type, from, to, query.routeId, query.driverId);
    return { content, filename };
  }

  // ─── Private: anomaly queries ──────────────────────────────────────────────

  private async countAnomalies(from: Date, to: Date): Promise<number> {
    const all = await this.detectAnomalies(from, to);
    return all.length;
  }

  private async detectAnomalies(
    from: Date,
    to: Date,
    routeId?: string,
    driverId?: string,
  ) {
    const [crossDevice, expiredUse, highFailure, rapidRepeat] = await Promise.all([
      this.queryCrossDeviceDuplicates(from, to, routeId),
      this.queryExpiredTicketUse(from, to, routeId),
      this.queryHighFailureDrivers(from, to, driverId),
      this.queryRapidRepeatScans(from, to),
    ]);

    return [
      ...crossDevice.map((r) => ({
        type: 'CROSS_DEVICE_DUPLICATE' as const,
        ticketId: r.ticketId,
        drivers: r.drivers,
        scannedAt: r.scannedAt,
        severity: 'HIGH' as const,
      })),
      ...expiredUse.map((r) => ({
        type: 'TICKET_USED_AFTER_EXPIRY' as const,
        ticketId: r.ticketId,
        passengerId: r.passengerId,
        usedAt: r.usedAt,
        expiresAt: r.expiresAt,
        severity: 'HIGH' as const,
      })),
      ...highFailure.map((r) => ({
        type: 'HIGH_FAILURE_RATE' as const,
        driverId: r.driverId,
        failureRate: r.failureRate,
        totalScans: Number(r.totalScans),
        period: { from: from.toISOString(), to: to.toISOString() },
        severity: 'MEDIUM' as const,
      })),
      ...rapidRepeat.map((r) => ({
        type: 'RAPID_REPEAT_SCAN' as const,
        passengerId: r.passengerId,
        maxScansInWindow: Number(r.maxScansInWindow),
        severity: 'MEDIUM' as const,
      })),
    ];
  }

  private async queryCrossDeviceDuplicates(
    from: Date,
    to: Date,
    routeId?: string,
  ): Promise<RawCrossDeviceDuplicate[]> {
    return this.prisma.$queryRaw<RawCrossDeviceDuplicate[]>`
      SELECT
        se.ticket_id                                          AS "ticketId",
        array_agg(DISTINCT se.driver_id)                     AS "drivers",
        array_agg(se.scanned_at ORDER BY se.scanned_at)      AS "scannedAt"
      FROM scan_events se
      ${routeId ? Prisma.sql`JOIN tickets t ON se.ticket_id = t.id AND t.route_id = ${routeId}::uuid` : Prisma.empty}
      WHERE se.scanned_at >= ${from}
        AND se.scanned_at <= ${to}
      GROUP BY se.ticket_id
      HAVING COUNT(DISTINCT se.driver_id) > 1
    `;
  }

  private async queryExpiredTicketUse(
    from: Date,
    to: Date,
    routeId?: string,
  ): Promise<RawExpiredUse[]> {
    return this.prisma.$queryRaw<RawExpiredUse[]>`
      SELECT
        t.id            AS "ticketId",
        t.passenger_id  AS "passengerId",
        t.used_at       AS "usedAt",
        t.expires_at    AS "expiresAt"
      FROM tickets t
      WHERE t.used_at IS NOT NULL
        AND t.used_at > t.expires_at
        AND t.used_at >= ${from}
        AND t.used_at <= ${to}
        ${routeId ? Prisma.sql`AND t.route_id = ${routeId}::uuid` : Prisma.empty}
    `;
  }

  private async queryHighFailureDrivers(
    from: Date,
    to: Date,
    driverId?: string,
  ): Promise<RawHighFailureDriver[]> {
    return this.prisma.$queryRaw<RawHighFailureDriver[]>`
      SELECT
        se.driver_id                                                                        AS "driverId",
        COUNT(*)::bigint                                                                    AS "totalScans",
        COUNT(*) FILTER (WHERE se.result = 'INVALID_SIGNATURE')::bigint                    AS "failureCount",
        (COUNT(*) FILTER (WHERE se.result = 'INVALID_SIGNATURE'))::float / COUNT(*)        AS "failureRate"
      FROM scan_events se
      WHERE se.scanned_at >= ${from}
        AND se.scanned_at <= ${to}
        ${driverId ? Prisma.sql`AND se.driver_id = ${driverId}::uuid` : Prisma.empty}
      GROUP BY se.driver_id
      HAVING (COUNT(*) FILTER (WHERE se.result = 'INVALID_SIGNATURE'))::float / COUNT(*) > 0.1
    `;
  }

  private async queryRapidRepeatScans(from: Date, to: Date): Promise<RawRapidRepeat[]> {
    return this.prisma.$queryRaw<RawRapidRepeat[]>`
      WITH windowed AS (
        SELECT
          t.passenger_id,
          COUNT(*) OVER (
            PARTITION BY t.passenger_id
            ORDER BY se.scanned_at
            RANGE BETWEEN INTERVAL '10 minutes' PRECEDING AND CURRENT ROW
          ) AS scans_in_window
        FROM scan_events se
        JOIN tickets t ON se.ticket_id = t.id
        WHERE se.scanned_at >= ${from}
          AND se.scanned_at <= ${to}
      )
      SELECT
        passenger_id              AS "passengerId",
        MAX(scans_in_window)::bigint AS "maxScansInWindow"
      FROM windowed
      WHERE scans_in_window > 3
      GROUP BY passenger_id
    `;
  }

  // ─── Private: CSV export ───────────────────────────────────────────────────

  private async buildCsvExport(
    type: string,
    from: Date,
    to: Date,
    routeId?: string,
    driverId?: string,
  ): Promise<string> {
    const MAX_ROWS = 10_000;

    switch (type) {
      case 'tickets': {
        const rows = await this.prisma.ticket.findMany({
          where: {
            purchasedAt: { gte: from, lte: to },
            ...(routeId ? { routeId } : {}),
          },
          select: {
            id: true,
            passengerId: true,
            routeId: true,
            status: true,
            fareAmount: true,
            purchasedAt: true,
            expiresAt: true,
            usedAt: true,
          },
          take: MAX_ROWS,
          orderBy: { purchasedAt: 'desc' },
        });
        return stringify(rows, { header: true });
      }

      case 'revenue': {
        const rows = await this.prisma.$queryRaw<
          { date: string; routeId: string; routeNumber: string; routeName: string; revenue: bigint }[]
        >`
          SELECT
            DATE(t.purchased_at)::text   AS date,
            t.route_id                   AS "routeId",
            r.route_number               AS "routeNumber",
            r.name                       AS "routeName",
            SUM(t.fare_amount)::bigint   AS revenue
          FROM tickets t
          JOIN routes r ON t.route_id = r.id
          WHERE t.status IN ('USED','EXPIRED')
            AND t.purchased_at >= ${from}
            AND t.purchased_at <= ${to}
            ${routeId ? Prisma.sql`AND t.route_id = ${routeId}::uuid` : Prisma.empty}
          GROUP BY DATE(t.purchased_at), t.route_id, r.route_number, r.name
          ORDER BY date DESC, revenue DESC
          LIMIT ${MAX_ROWS}
        `;
        const serialized = rows.map((r) => ({ ...r, revenue: Number(r.revenue) }));
        return stringify(serialized, { header: true });
      }

      case 'trips': {
        const rows = await this.prisma.trip.findMany({
          where: {
            scheduledFor: { gte: from, lte: to },
            ...(routeId ? { routeId } : {}),
            ...(driverId ? { driverId } : {}),
          },
          select: {
            id: true,
            routeId: true,
            driverId: true,
            busIdentifier: true,
            status: true,
            scheduledFor: true,
            startedAt: true,
            endedAt: true,
          },
          take: MAX_ROWS,
          orderBy: { scheduledFor: 'desc' },
        });
        return stringify(rows, { header: true });
      }

      case 'anomalies': {
        const anomalies = await this.detectAnomalies(from, to, routeId, driverId);
        const capped = anomalies.slice(0, MAX_ROWS);
        const flat = capped.map((a) => ({
          type: a.type,
          severity: a.severity,
          ...('ticketId' in a ? { ticketId: a.ticketId } : {}),
          ...('driverId' in a ? { driverId: a.driverId } : {}),
          ...('passengerId' in a ? { passengerId: a.passengerId } : {}),
          ...('failureRate' in a ? { failureRate: a.failureRate } : {}),
          ...('totalScans' in a ? { totalScans: a.totalScans } : {}),
          ...('maxScansInWindow' in a ? { maxScansInWindow: a.maxScansInWindow } : {}),
        }));
        return stringify(flat, { header: true });
      }

      default:
        throw new UnprocessableEntityException(`Unknown export type: ${type}`);
    }
  }

  // ─── Private: helpers ──────────────────────────────────────────────────────

  private effectivePeriod(fromDate?: string, toDate?: string): { from: Date; to: Date } {
    const to = toDate ? new Date(toDate) : new Date();
    const from = fromDate ? new Date(fromDate) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    // Normalize to end of day for to, start of day for from when only dates provided
    to.setHours(23, 59, 59, 999);
    if (!fromDate) {
      from.setHours(0, 0, 0, 0);
    }
    return { from, to };
  }
}
