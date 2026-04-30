import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPagination, buildPaginationMeta } from '../../common/utils/pagination.util';
import { RouteQueryDto } from './dto/route-query.dto';
import { RouteSearchDto } from './dto/route-search.dto';
import { CreateRouteDto } from './dto/create-route.dto';
import { UpdateRouteDto } from './dto/update-route.dto';
import { StopDto } from './dto/stop.dto';
import { FareDto } from './dto/fare.dto';

const ACTIVE_ROUTE_FILTER = { isActive: true, deletedAt: null };
const STOPS_ORDERED = { stops: { orderBy: { sequence: 'asc' as const } } };

@Injectable()
export class RoutesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: RouteQueryDto) {
    const sortBy = this.normalizeSortBy(query.sortBy);
    const pagination = buildPagination({ ...query, sortBy });

    const [items, total] = await Promise.all([
      this.prisma.route.findMany({
        where: ACTIVE_ROUTE_FILTER,
        include: STOPS_ORDERED,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: pagination.orderBy,
      }),
      this.prisma.route.count({ where: ACTIVE_ROUTE_FILTER }),
    ]);

    return {
      items,
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
      include: STOPS_ORDERED,
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
        if (departure && destination && depStop && destStop) {
          return depStop.sequence < destStop.sequence;
        }
        return true;
      });
    }

    return { items: routes };
  }

  async findById(id: string) {
    const route = await this.prisma.route.findUnique({
      where: { id },
      include: {
        stops: { orderBy: { sequence: 'asc' } },
        fares: true,
      },
    });

    if (!route || !route.isActive || route.deletedAt) {
      throw new NotFoundException('Route not found');
    }

    return route;
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

    const routeNumber = dto.routeNumber.toUpperCase();

    return this.prisma.$transaction(async (tx) => {
      const route = await tx.route.create({
        data: {
          routeNumber,
          name: dto.name,
          description: dto.description,
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

      return tx.route.findUniqueOrThrow({
        where: { id: route.id },
        include: { stops: { orderBy: { sequence: 'asc' } }, fares: true },
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

  async softDelete(id: string) {
    await this.assertExists(id);
    await this.prisma.route.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private validateStops(stops: StopDto[]) {
    if (stops.length < 2) {
      throw new UnprocessableEntityException('A route must have at least 2 stops');
    }

    const sequences = stops.map((s) => s.sequence).sort((a, b) => a - b);
    for (let i = 0; i < sequences.length; i++) {
      if (sequences[i] !== i + 1) {
        throw new UnprocessableEntityException(
          'Stop sequences must be contiguous starting from 1',
        );
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
