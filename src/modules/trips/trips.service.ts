import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ScanResult, TripStatus } from '@prisma-generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RoutesService } from '../routes/routes.service';
import { buildPagination, buildPaginationMeta } from '../../common/utils/pagination.util';
import { TripQueryDto } from './dto/trip-query.dto';
import { CreateTripDto } from './dto/create-trip.dto';

const TRIP_INCLUDE = {
  route: { select: { id: true, routeNumber: true, name: true } },
} as const;

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private routesService: RoutesService,
  ) {}

  // ─── Driver-facing ────────────────────────────────────────────────────────

  async findAllForDriver(driverId: string, query: TripQueryDto) {
    const sortBy = this.normalizeSortBy(query.sortBy);
    const pagination = buildPagination({ ...query, sortBy });

    const where = {
      driverId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.fromDate || query.toDate
        ? {
            scheduledFor: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        include: TRIP_INCLUDE,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: pagination.orderBy,
      }),
      this.prisma.trip.count({ where }),
    ]);

    return {
      items,
      meta: buildPaginationMeta(query.page ?? 1, query.limit ?? 20, total),
    };
  }

  async findById(driverId: string, tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        ...TRIP_INCLUDE,
        scanEvents: { select: { result: true, isInspection: true } },
      },
    });

    if (!trip || trip.driverId !== driverId) {
      throw new NotFoundException('Trip not found');
    }

    const summary = this.buildSummary(trip.scanEvents);
    const { scanEvents: _, ...tripData } = trip;

    return { ...tripData, summary };
  }

  async startTrip(driverId: string, tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });

    if (!trip || trip.driverId !== driverId) {
      throw new NotFoundException('Trip not found');
    }

    if (trip.status !== TripStatus.SCHEDULED) {
      throw new BadRequestException(
        `Cannot start a trip in ${trip.status} status`,
      );
    }

    const activeTrip = await this.prisma.trip.findFirst({
      where: { driverId, status: TripStatus.IN_PROGRESS },
    });

    if (activeTrip) {
      throw new ConflictException('Driver already has an in-progress trip');
    }

    return this.prisma.trip.update({
      where: { id: tripId },
      data: { status: TripStatus.IN_PROGRESS, startedAt: new Date() },
      include: TRIP_INCLUDE,
    });
  }

  async endTrip(driverId: string, tripId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        ...TRIP_INCLUDE,
        scanEvents: { select: { result: true, isInspection: true } },
      },
    });

    if (!trip || trip.driverId !== driverId) {
      throw new NotFoundException('Trip not found');
    }

    if (trip.status !== TripStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Cannot end a trip in ${trip.status} status`,
      );
    }

    const updated = await this.prisma.trip.update({
      where: { id: tripId },
      data: { status: TripStatus.COMPLETED, endedAt: new Date() },
      include: {
        ...TRIP_INCLUDE,
        scanEvents: { select: { result: true, isInspection: true } },
      },
    });

    const summary = this.buildSummary(updated.scanEvents);
    const { scanEvents: _, ...tripData } = updated;

    return { ...tripData, summary };
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  async create(dto: CreateTripDto) {
    await this.routesService.findById(dto.routeId);

    return this.prisma.trip.create({
      data: {
        routeId: dto.routeId,
        driverId: dto.driverId,
        scheduledFor: new Date(dto.scheduledFor),
        busIdentifier: dto.busIdentifier,
        status: TripStatus.SCHEDULED,
      },
      include: TRIP_INCLUDE,
    });
  }

  async cancel(tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });

    if (!trip) {
      throw new NotFoundException('Trip not found');
    }

    if (trip.status !== TripStatus.SCHEDULED) {
      throw new BadRequestException(
        `Cannot cancel a trip in ${trip.status} status`,
      );
    }

    return this.prisma.trip.update({
      where: { id: tripId },
      data: { status: TripStatus.CANCELLED },
      include: TRIP_INCLUDE,
    });
  }

  async getActiveTrip(driverId: string) {
    return this.prisma.trip.findFirst({
      where: { driverId, status: TripStatus.IN_PROGRESS },
      include: TRIP_INCLUDE,
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildSummary(scanEvents: { result: ScanResult; isInspection: boolean }[]) {
    const summary = {
      totalScans: scanEvents.length,
      validScans: 0,
      expiredScans: 0,
      alreadyUsedScans: 0,
      invalidSignatureScans: 0,
      inspectionScans: 0,
    };

    for (const event of scanEvents) {
      if (event.isInspection) {
        summary.inspectionScans++;
        continue;
      }
      switch (event.result) {
        case ScanResult.VALID:
          summary.validScans++;
          break;
        case ScanResult.EXPIRED:
          summary.expiredScans++;
          break;
        case ScanResult.ALREADY_USED:
          summary.alreadyUsedScans++;
          break;
        case ScanResult.INVALID_SIGNATURE:
          summary.invalidSignatureScans++;
          break;
        case ScanResult.INSPECTION_ONLY:
          summary.inspectionScans++;
          break;
      }
    }

    return summary;
  }

  private normalizeSortBy(value?: string): string {
    const allowed = new Set(['scheduledFor', 'createdAt', 'startedAt', 'endedAt']);
    if (!value || !allowed.has(value)) return 'scheduledFor';
    return value;
  }
}
