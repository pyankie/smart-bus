import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPagination, buildPaginationMeta } from '../../common/utils/pagination.util';
import { RouteQueryDto } from './dto/route-query.dto';
import { RouteSearchDto } from './dto/route-search.dto';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { StopDto } from './dto/stop.dto';
import { FareDto } from './dto/fare.dto';
import { RouteSegmentDto } from './dto/route-segment.dto';
import { RouteResponseDto } from './dto/route-response.dto';
import { StopResponseDto } from './dto/stop-response.dto';

const ACTIVE_ROUTE_FILTER = { isActive: true, deletedAt: null };
const STOPS_AND_FARES_AND_SEGMENTS = {
  stops: { orderBy: { sequence: 'asc' as const } },
  fares: true,
  segments: { include: { fromStop: true, toStop: true } },
};

@Injectable()
export class RoutesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: RouteQueryDto) {
    const sortBy = this.normalizeSortBy(query.sortBy);
    const pagination = buildPagination({ ...query, sortBy });

    const [items, total] = await Promise.all([
      this.prisma.route.findMany({
        where: ACTIVE_ROUTE_FILTER,
        include: STOPS_AND_FARES_AND_SEGMENTS,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: pagination.orderBy,
      }),
      this.prisma.route.count({ where: ACTIVE_ROUTE_FILTER }),
    ]);

    return {
      items: items.map((route) => this.transformRoute(route)),
      meta: buildPaginationMeta(query.page ?? 1, query.limit ?? 20, total),
    };
  }

  async search(query: RouteSearchDto) {
    const sortBy = this.normalizeSortBy(query.sortBy);
    const pagination = buildPagination({ ...query, sortBy });
    const { q, departure, destination } = query;

    const textWhere = q
      ? {
          OR: [
            { routeNumber: { contains: q, mode: 'insensitive' as const } },
            { name: { contains: q, mode: 'insensitive' as const } },
            { stops: { some: { name: { contains: q, mode: 'insensitive' as const } } } },
          ],
        }
      : {};

    let routes = await this.prisma.route.findMany({
      where: { ...ACTIVE_ROUTE_FILTER, ...textWhere },
      include: STOPS_AND_FARES_AND_SEGMENTS,
      skip: pagination.skip,
      take: pagination.take,
      orderBy: pagination.orderBy,
    });

    if (departure || destination) {
      routes = routes.filter((route) => {
        const stops = route.stops;
        const depStop = departure
          ? stops.find((s) => s.name.toLowerCase().includes(departure.toLowerCase()))
          : null;
        const destStop = destination
          ? stops.find((s) => s.name.toLowerCase().includes(destination.toLowerCase()))
          : null;

        if (departure && !depStop) return false;
        if (destination && !destStop) return false;
        // Both stops exist on the route — direction is a trip-level concern, not route-level
        return true;
      });
    }

    return { items: routes.map((route) => this.transformRoute(route)) };
  }

  async findById(id: string) {
    const route = await this.prisma.route.findUnique({
      where: { id },
      include: STOPS_AND_FARES_AND_SEGMENTS,
    });

    if (!route || !route.isActive || route.deletedAt) {
      throw new NotFoundException('Route not found');
    }

    return this.transformRoute(route);
  }

  async getFare(routeId: string, boardingStopId: string, dropoffStopId: string) {
    const [boardingStop, dropoffStop] = await Promise.all([
      this.prisma.stop.findFirst({ where: { id: boardingStopId, routeId } }),
      this.prisma.stop.findFirst({ where: { id: dropoffStopId, routeId } }),
    ]);

    if (!boardingStop || !dropoffStop) {
      throw new NotFoundException('Stop not found on this route');
    }

    const fare = await this.prisma.fare.findUnique({
      where: {
        routeId_fromStopId_toStopId: {
          routeId,
          fromStopId: boardingStopId,
          toStopId: dropoffStopId,
        },
      },
    });

    if (!fare) {
      throw new NotFoundException('No fare defined for this stop pair');
    }

    return { fare: fare.amount };
  }

  // ─── Admin Methods ─────────────────────────────────────────────────────────

  async create(dto: CreateRouteDto) {
    this.validateStops(dto.stops);
    if (dto.segments && dto.segments.length > 0) {
      this.validateSegments(dto.segments);
    }

    const routeNumber = dto.routeNumber.toUpperCase();

    return this.prisma.$transaction(async (tx) => {
      const route = await tx.route.create({
        data: {
          routeNumber,
          name: dto.name,
          description: dto.description,
          ...(dto.estimatedDuration !== undefined && {
            estimatedDuration: dto.estimatedDuration,
          }),
        },
      });

      await tx.stop.createMany({
        data: dto.stops.map((s) => ({
          routeId: route.id,
          name: s.name,
          sequence: s.sequence,
          latitude: s.latitude,
          longitude: s.longitude,
        })),
      });

      const stops = await tx.stop.findMany({
        where: { routeId: route.id },
        orderBy: { sequence: 'asc' },
      });

      if (dto.fares.length > 0) {
        await tx.fare.createMany({
          data: dto.fares.map((f) => ({
            routeId: route.id,
            fromStopId: f.fromStopId,
            toStopId: f.toStopId,
            amount: f.amount,
          })),
        });
      }

      if (dto.segments && dto.segments.length > 0) {
        await tx.routeSegment.createMany({
          data: dto.segments.map((s) => {
            const fromStop = stops.find((stop) => stop.sequence === s.fromStopSequence);
            const toStop = stops.find((stop) => stop.sequence === s.toStopSequence);
            if (!fromStop || !toStop) {
              throw new UnprocessableEntityException('Invalid stop sequence in segment');
            }
            return {
              routeId: route.id,
              fromStopId: fromStop.id,
              toStopId: toStop.id,
              distance: s.distance,
              duration: s.duration,
            };
          }),
        });
      }

      return tx.route.findUniqueOrThrow({
        where: { id: route.id },
        include: STOPS_AND_FARES_AND_SEGMENTS,
      });
    });
  }

  async update(id: string, dto: UpdateRouteDto) {
    await this.assertExists(id);

    return this.prisma.route.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.estimatedDuration !== undefined ? { estimatedDuration: dto.estimatedDuration } : {}),
        ...(dto.estimatedDistance !== undefined ? { estimatedDistance: dto.estimatedDistance } : {}),
      },
    });
  }

  async updateStops(routeId: string, stops: StopDto[]) {
    await this.assertExists(routeId);
    this.validateStops(stops);

    return this.prisma.$transaction(async (tx) => {
      await tx.stop.deleteMany({ where: { routeId } });
      await tx.stop.createMany({
        data: stops.map((s) => ({
          routeId,
          name: s.name,
          sequence: s.sequence,
          latitude: s.latitude,
          longitude: s.longitude,
        })),
      });

      return tx.stop.findMany({ where: { routeId }, orderBy: { sequence: 'asc' } });
    });
  }

  async updateFares(routeId: string, fares: FareDto[]) {
    await this.assertExists(routeId);

    return this.prisma.$transaction(async (tx) => {
      await tx.fare.deleteMany({ where: { routeId } });

      if (fares.length > 0) {
        await tx.fare.createMany({
          data: fares.map((f) => ({
            routeId,
            fromStopId: f.fromStopId,
            toStopId: f.toStopId,
            amount: f.amount,
          })),
        });
      }

      return tx.fare.findMany({ where: { routeId } });
    });
  }

  async updateSegments(routeId: string, segments: RouteSegmentDto[]) {
    await this.assertExists(routeId);
    this.validateSegments(segments);

    const stops = await this.prisma.stop.findMany({
      where: { routeId },
      orderBy: { sequence: 'asc' },
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.routeSegment.deleteMany({ where: { routeId } });

      if (segments.length > 0) {
        await tx.routeSegment.createMany({
          data: segments.map((s) => {
            const fromStop = stops.find((stop) => stop.sequence === s.fromStopSequence);
            const toStop = stops.find((stop) => stop.sequence === s.toStopSequence);
            if (!fromStop || !toStop) {
              throw new UnprocessableEntityException('Invalid stop sequence in segment');
            }
            return {
              routeId,
              fromStopId: fromStop.id,
              toStopId: toStop.id,
              distance: s.distance,
              duration: s.duration,
            };
          }),
        });
      }

      return tx.routeSegment.findMany({
        where: { routeId },
        include: { fromStop: true, toStop: true },
      });
    });
  }

  async softDelete(id: string) {
    await this.assertExists(id);
    await this.prisma.route.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private transformRoute(route: {
    id: string;
    routeNumber: string;
    name: string;
    description: string | null;
    isActive: boolean;
    estimatedDuration: number | null;
    estimatedDistance: number | null;
    createdAt: Date;
    updatedAt: Date;
    stops: {
      id: string;
      name: string;
      sequence: number;
      latitude?: number | null;
      longitude?: number | null;
    }[];
    fares: { fromStopId: string; toStopId: string; amount: number }[];
    segments?: {
      fromStop: { sequence: number };
      toStop: { sequence: number };
      distance: number;
      duration: number;
    }[];
  }): RouteResponseDto {
    const sortedStops = [...route.stops].sort((a, b) => a.sequence - b.sequence);
    const startStop = sortedStops[0];
    const endStop = sortedStops[sortedStops.length - 1];

    const fare =
      route.fares.find((f) => f.fromStopId === startStop.id && f.toStopId === endStop.id)
        ?.amount ?? 0;

    // Index forward-consecutive segments by their fromStop sequence
    const segByFromSeq = new Map<number, { distance: number; duration: number }>();
    for (const seg of route.segments ?? []) {
      if (seg.fromStop.sequence + 1 === seg.toStop.sequence) {
        segByFromSeq.set(seg.fromStop.sequence, {
          distance: seg.distance,
          duration: seg.duration,
        });
      }
    }

    const stops: StopResponseDto[] = sortedStops.map((stop) => {
      const toNext = segByFromSeq.get(stop.sequence) ?? null;
      const fromPrev = segByFromSeq.get(stop.sequence - 1) ?? null;
      return {
        id: stop.id,
        name: stop.name,
        sequence: stop.sequence,
        ...(stop.latitude != null && { latitude: stop.latitude }),
        ...(stop.longitude != null && { longitude: stop.longitude }),
        distanceFromPrevious: fromPrev?.distance ?? null,
        distanceToNext: toNext?.distance ?? null,
        durationFromPrevious: fromPrev?.duration ?? null,
        durationToNext: toNext?.duration ?? null,
      };
    });

    // Prefer summed-segment totals; fall back to stored estimates
    const segValues = [...segByFromSeq.values()];
    const distance =
      segValues.length > 0
        ? segValues.reduce((sum, s) => sum + s.distance, 0)
        : (route.estimatedDistance ?? 0);
    const duration =
      segValues.length > 0
        ? segValues.reduce((sum, s) => sum + s.duration, 0)
        : (route.estimatedDuration ?? 0);

    return {
      id: route.id,
      routeNumber: route.routeNumber,
      name: route.name,
      description: route.description ?? undefined,
      isActive: route.isActive,
      duration,
      distance,
      startStopName: startStop.name,
      endStopName: endStop.name,
      totalStops: sortedStops.length,
      price: fare,
      stops,
      createdAt: route.createdAt,
      updatedAt: route.updatedAt,
    };
  }

  private validateSegments(segments: RouteSegmentDto[]) {
    for (const seg of segments) {
      if (seg.toStopSequence !== seg.fromStopSequence + 1) {
        throw new UnprocessableEntityException(
          `Segment ${seg.fromStopSequence}→${seg.toStopSequence} is not forward-consecutive. Each segment must connect adjacent stops in ascending order.`,
        );
      }
    }
  }

  private validateStops(stops: StopDto[]) {
    if (stops.length < 2) {
      throw new UnprocessableEntityException('A route must have at least 2 stops');
    }

    const sequences = stops.map((s) => s.sequence).sort((a, b) => a - b);
    for (let i = 0; i < sequences.length; i++) {
      if (sequences[i] !== i + 1) {
        throw new UnprocessableEntityException('Stop sequences must be contiguous starting from 1');
      }
    }
  }

  private async assertExists(id: string) {
    const route = await this.prisma.route.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });
    if (!route || route.deletedAt) {
      throw new NotFoundException('Route not found');
    }
  }

  private normalizeSortBy(value?: string): string {
    const allowed = new Set(['createdAt', 'updatedAt', 'name', 'routeNumber']);
    if (!value || !allowed.has(value)) return 'createdAt';
    return value;
  }
}
