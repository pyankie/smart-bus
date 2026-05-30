import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TripStatus, UserRole, UserStatus } from '@prisma-generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DriverSuggestionDto,
  RouteAssignmentRequestDto,
  RouteAssignmentResponseDto,
} from './dto/route-assignment.dto';
import {
  ScanAnomalyRequestDto,
  ScanAnomalyResponseDto,
} from './dto/scan-anomaly.dto';

@Injectable()
export class MlService {
  private readonly logger = new Logger(MlService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Route Assignment Suggestions ─────────────────────────────────────────

  async getRouteAssignmentSuggestions(
    payload: RouteAssignmentRequestDto,
  ): Promise<RouteAssignmentResponseDto> {
    if (!this.config.get<boolean>('app.ml.enabled')) {
      this.logger.debug('ML disabled — using Prisma fallback for route suggestions');
      return this.fallbackRouteSuggestions(payload);
    }

    // Enrich payload with inline stats to bypass ML CSV lookup mismatch
    const enrichedPayload = await this.enrichWithInlineStats(payload);

    const url = `${this.serviceUrl()}/api/v1/ml/route-assignment`;
    const timeoutMs = this.config.get<number>('app.ml.routeTimeoutMs') ?? 3000;

    try {
      const response = await this.post(url, enrichedPayload, timeoutMs);
      if (!response.ok) {
        this.logger.warn(`ML route-assignment returned ${response.status}, using fallback`);
        return this.fallbackRouteSuggestions(payload);
      }
      const data = (await response.json()) as Omit<RouteAssignmentResponseDto, 'source'>;
      return { ...data, source: 'ml' };
    } catch (err) {
      this.logger.warn(`ML route-assignment unreachable (${(err as Error).message}), using fallback`);
      return this.fallbackRouteSuggestions(payload);
    }
  }

  // ─── Scan Anomaly Detection ───────────────────────────────────────────────

  async detectScanAnomaly(payload: ScanAnomalyRequestDto): Promise<ScanAnomalyResponseDto> {
    if (!this.config.get<boolean>('app.ml.enabled')) {
      return this.fallbackAnomalyAudit(payload);
    }

    const url = `${this.serviceUrl()}/api/v1/ml/detect-anomaly`;
    const timeoutMs = this.config.get<number>('app.ml.anomalyTimeoutMs') ?? 1500;

    try {
      const response = await this.post(url, payload, timeoutMs);
      if (!response.ok) {
        this.logger.warn(`ML detect-anomaly returned ${response.status}, using fallback`);
        return this.fallbackAnomalyAudit(payload);
      }
      const data = (await response.json()) as Omit<ScanAnomalyResponseDto, 'source'>;
      return { ...data, source: 'ml' };
    } catch (err) {
      this.logger.warn(`ML detect-anomaly unreachable (${(err as Error).message}), using fallback`);
      return this.fallbackAnomalyAudit(payload);
    }
  }

  // ─── Private: HTTP plumbing ───────────────────────────────────────────────

  private serviceUrl(): string {
    return this.config.get<string>('app.ml.serviceUrl') ?? 'http://localhost:8000';
  }

  private async post(url: string, body: unknown, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const token = this.config.get<string>('app.ml.token');

    try {
      return await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Internal-Token': token } : {}),
        },
        body: JSON.stringify(body),
      });
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── Private: Fallback heuristics & Enrichment ──────────────────────────

  private async enrichWithInlineStats(payload: RouteAssignmentRequestDto): Promise<RouteAssignmentRequestDto> {
    try {
      const [route, drivers, trips] = await Promise.all([
        this.prisma.route.findUnique({
          where: { id: payload.routeId },
          select: { estimatedDuration: true, estimatedDistance: true, stops: { select: { id: true } } },
        }),
        this.prisma.user.findMany({
          where: { id: { in: payload.candidateDriverIds }, role: UserRole.DRIVER, deletedAt: null },
          select: { id: true, fullName: true, status: true },
        }),
        this.prisma.trip.groupBy({
          by: ['driverId', 'status'],
          where: { driverId: { in: payload.candidateDriverIds }, routeId: payload.routeId },
          _count: { _all: true },
        }),
      ]);

      if (!route) return payload;

      const stats = new Map<string, { completed: number; total: number }>();
      for (const t of trips) {
        const cur = stats.get(t.driverId) ?? { completed: 0, total: 0 };
        cur.total += t._count._all;
        if (t.status === TripStatus.COMPLETED) cur.completed += t._count._all;
        stats.set(t.driverId, cur);
      }

      const inlineDriverProfiles = drivers.map((d) => {
        const s = stats.get(d.id) ?? { completed: 0, total: 0 };
        return {
          driverId: d.id,
          driverName: d.fullName,
          driverStatus: d.status,
          completedTripsOnRoute: s.completed,
          totalTripsOnRoute: s.total,
        };
      });

      const routeMetadata = {
        estimatedDuration: route.estimatedDuration ?? 0,
        estimatedDistance: route.estimatedDistance ?? 0,
        totalStops: route.stops.length,
      };

      return { ...payload, inlineDriverProfiles, routeMetadata };
    } catch (err) {
      this.logger.warn(`Failed to compute inline ML stats (${(err as Error).message}), sending basic payload`);
      return payload;
    }
  }

  /**
   * Prisma-backed fallback ranking: for each candidate driver, count completed
   * trips on the target route and compute a basic completion rate. Used when
   * the ML service is disabled, unreachable, or returns an error.
   */
  private async fallbackRouteSuggestions(
    payload: RouteAssignmentRequestDto,
  ): Promise<RouteAssignmentResponseDto> {
    const drivers = await this.prisma.user.findMany({
      where: {
        id: { in: payload.candidateDriverIds },
        role: UserRole.DRIVER,
        deletedAt: null,
      },
      select: { id: true, fullName: true, status: true },
    });

    const trips = await this.prisma.trip.groupBy({
      by: ['driverId', 'status'],
      where: {
        driverId: { in: payload.candidateDriverIds },
        routeId: payload.routeId,
      },
      _count: { _all: true },
    });

    // driverId -> { COMPLETED, CANCELLED, total }
    const stats = new Map<string, { completed: number; cancelled: number; total: number }>();
    for (const t of trips) {
      const cur = stats.get(t.driverId) ?? { completed: 0, cancelled: 0, total: 0 };
      cur.total += t._count._all;
      if (t.status === TripStatus.COMPLETED) cur.completed += t._count._all;
      if (t.status === TripStatus.CANCELLED) cur.cancelled += t._count._all;
      stats.set(t.driverId, cur);
    }

    const suggestions: DriverSuggestionDto[] = drivers.map((d) => {
      if (d.status !== UserStatus.ACTIVE) {
        return {
          driverId: d.id,
          driverName: d.fullName,
          confidence: 0,
          reasons: [`Driver status is currently ${d.status}`],
        };
      }
      const s = stats.get(d.id) ?? { completed: 0, cancelled: 0, total: 0 };
      const completionRate = s.total > 0 ? s.completed / s.total : 0;
      // Confidence prior: 0.5 with no history, weighted by completion rate when present
      const confidence =
        s.total === 0 ? 0.5 : Math.min(0.95, 0.4 + 0.55 * completionRate);

      const reasons: string[] = [];
      if (s.completed >= 10) reasons.push(`High route familiarity (${s.completed} completed trips)`);
      else if (s.completed >= 3) reasons.push(`Moderate route familiarity (${s.completed} completed trips)`);
      if (s.total > 0)
        reasons.push(`Historical completion rate on this route: ${(completionRate * 100).toFixed(1)}%`);
      if (s.total === 0) reasons.push('New to this route — no historical data');
      reasons.push('Local Prisma fallback heuristic (ML service unavailable)');

      return {
        driverId: d.id,
        driverName: d.fullName,
        confidence: Number(confidence.toFixed(3)),
        reasons,
      };
    });

    suggestions.sort((a, b) => b.confidence - a.confidence);

    return {
      routeId: payload.routeId,
      suggestions,
      source: 'fallback',
    };
  }

  /**
   * Deterministic rule-engine fallback for scan anomaly detection. Mirrors the
   * critical rules in the Python service so we never miss obvious fraud when
   * the ML sidecar is unreachable.
   */
  private fallbackAnomalyAudit(payload: ScanAnomalyRequestDto): ScanAnomalyResponseDto {
    const reasons: string[] = [];
    let score = 0.05;

    if (!payload.ticketContext.qrSignatureValid || payload.result === 'INVALID_SIGNATURE') {
      reasons.push('Invalid cryptographic ticket signature');
      score = Math.max(score, 1.0);
    }
    if (payload.result === 'ALREADY_USED') {
      reasons.push('Duplicate ticket scan (ticket already sync-validated)');
      score = Math.max(score, 1.0);
    }
    if (payload.result === 'EXPIRED') {
      reasons.push('Expired ticket presented at boarding');
      score = Math.max(score, 0.95);
    }

    const distance = haversineMeters(
      payload.scanMetadata.latitude,
      payload.scanMetadata.longitude,
      payload.boardingStop.latitude,
      payload.boardingStop.longitude,
    );
    if (distance > 600) {
      reasons.push(`Impossible geo-location deviation (${Math.round(distance)}m from boarding stop)`);
      score = Math.max(score, 0.85);
    } else if (distance > 200) {
      reasons.push(`Minor geographic deviation (${Math.round(distance)}m from boarding stop)`);
      score = Math.max(score, 0.4);
    }

    if (payload.isOffline && payload.syncDelaySeconds > 172_800) {
      reasons.push(`Extreme offline sync delay (${(payload.syncDelaySeconds / 3600).toFixed(1)}h)`);
      score = Math.max(score, 0.8);
    }

    if (reasons.length === 0) reasons.push('Passed local validation pipeline');

    let severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (score >= 0.8) severity = 'HIGH';
    else if (score >= 0.4) severity = 'MEDIUM';

    return {
      eventId: payload.eventId,
      anomalyScore: Number(score.toFixed(3)),
      severity,
      reasons,
      source: 'fallback',
    };
  }
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
