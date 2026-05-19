import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ScanResult, TicketStatus, TripStatus, UserRole, UserStatus } from '@prisma-generated/client';
import { hash } from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { buildPagination, buildPaginationMeta } from '../../common/utils/pagination.util';
import { resolveLocale } from '../../common/utils/localized-string';
import { MessageTemplates, renderTemplate } from '../../common/utils/message-templates';
import { NotificationsService } from '../notifications/notifications.service';
import { RoutesService } from '../routes/routes.service';
import { CreateRouteDto } from '../routes/dto/create-route.dto';
import { UpdateRouteDto } from '../routes/dto/update-route.dto';
import { TripsService } from '../trips/trips.service';
import { CreateTripDto } from '../trips/dto/create-trip.dto';
import { UsersService } from '../users/users.service';
import { AdminActionQueryDto } from './dto/admin-action-query.dto';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { AdminTripQueryDto } from './dto/admin-trip-query.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';
import { UpdateFaresDto } from './dto/update-fares.dto';
import { UpdateStopsDto } from './dto/update-stops.dto';

// Roles an ADMIN (non-super) is not permitted to create or manage
const ELEVATED_ROLES = new Set<UserRole>([UserRole.ADMIN, UserRole.SUPER_ADMIN]);

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private routesService: RoutesService,
    private tripsService: TripsService,
    private notificationsService: NotificationsService,
  ) {}

  // ─── User Management ───────────────────────────────────────────────────────

  async listUsers(query: AdminUserQueryDto) {
    const sortBy = this.normalizeSortBy(query.sortBy, ['createdAt', 'updatedAt', 'fullName', 'phone']);
    const pagination = buildPagination({ ...query, sortBy });

    const where = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { fullName: { contains: query.q, mode: 'insensitive' as const } },
              { phone: { contains: query.q, mode: 'insensitive' as const } },
              { email: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      deletedAt: null,
    };

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        omit: { passwordHash: true },
        skip: pagination.skip,
        take: pagination.take,
        orderBy: pagination.orderBy,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, meta: buildPaginationMeta(query.page ?? 1, query.limit ?? 20, total) };
  }

  async getUserById(id: string) {
    const user = await this.usersService.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async createUser(actorId: string, actorRole: UserRole, dto: AdminCreateUserDto, ip?: string) {
    this.assertRolePrivilege(actorRole, dto.role);

    if (dto.role === UserRole.PASSENGER && !dto.fid) {
      throw new UnprocessableEntityException('FID is required when creating a PASSENGER account');
    }

    const passwordHash = await hash(dto.password);
    const created = await this.usersService.create({
      role: dto.role,
      fullName: dto.fullName,
      phone: dto.phone,
      email: dto.email,
      fid: dto.fid,
      passwordHash,
    });

    // Admin-created users are immediately active — no OTP verification needed
    const user = await this.usersService.updateStatus(created.id, UserStatus.ACTIVE);

    await this.logAction(actorId, 'user.create', 'User', user.id, {
      afterState: { role: user.role, phone: user.phone },
      ipAddress: ip,
    });

    return user;
  }

  async updateUser(
    actorId: string,
    actorRole: UserRole,
    targetId: string,
    dto: AdminUpdateUserDto,
    ip?: string,
  ) {
    const target = await this.getUserById(targetId);
    this.assertRolePrivilege(actorRole, target.role);

    const before = { fullName: target.fullName, email: target.email, phone: target.phone };

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.email !== undefined ? { email: dto.email?.trim().toLowerCase() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      },
      omit: { passwordHash: true },
    });

    await this.logAction(actorId, 'user.update', 'User', targetId, {
      beforeState: before,
      afterState: { fullName: updated.fullName, email: updated.email, phone: updated.phone },
      ipAddress: ip,
    });

    return updated;
  }

  async disableUser(actorId: string, actorRole: UserRole, targetId: string, ip?: string) {
    if (actorId === targetId) {
      throw new ForbiddenException('You cannot disable your own account');
    }

    const target = await this.getUserById(targetId);
    this.assertRolePrivilege(actorRole, target.role);

    const user = await this.usersService.updateStatus(targetId, UserStatus.DISABLED);

    await this.logAction(actorId, 'user.disable', 'User', targetId, {
      beforeState: { status: target.status },
      afterState: { status: UserStatus.DISABLED },
      ipAddress: ip,
    });

    return user;
  }

  async enableUser(actorId: string, actorRole: UserRole, targetId: string, ip?: string) {
    const target = await this.getUserById(targetId);
    this.assertRolePrivilege(actorRole, target.role);

    const user = await this.usersService.updateStatus(targetId, UserStatus.ACTIVE);

    await this.logAction(actorId, 'user.enable', 'User', targetId, {
      beforeState: { status: target.status },
      afterState: { status: UserStatus.ACTIVE },
      ipAddress: ip,
    });

    return user;
  }

  // ─── Route Management ──────────────────────────────────────────────────────

  async createRoute(actorId: string, dto: CreateRouteDto, ip?: string) {
    const route = await this.routesService.create(dto);

    await this.logAction(actorId, 'route.create', 'Route', route.id, {
      afterState: { routeNumber: route.routeNumber, name: route.name },
      ipAddress: ip,
    });

    return route;
  }

  async updateRoute(actorId: string, id: string, dto: UpdateRouteDto, ip?: string) {
    const before = await this.prisma.route.findUnique({
      where: { id },
      select: { name: true, isActive: true, estimatedDuration: true, estimatedDistance: true },
    });
    if (!before) throw new NotFoundException('Route not found');

    const updated = await this.routesService.update(id, dto);

    await this.logAction(actorId, 'route.update', 'Route', id, {
      beforeState: before as object,
      afterState: { name: updated.name, isActive: updated.isActive },
      ipAddress: ip,
    });

    return updated;
  }

  async deleteRoute(actorId: string, id: string, ip?: string) {
    const route = await this.prisma.route.findUnique({
      where: { id },
      select: { id: true, name: true, routeNumber: true, deletedAt: true },
    });
    if (!route || route.deletedAt) throw new NotFoundException('Route not found');

    const activeTickets = await this.prisma.ticket.count({
      where: { routeId: id, status: TicketStatus.ACTIVE },
    });
    if (activeTickets > 0) {
      throw new ConflictException('Route has active tickets and cannot be deleted');
    }

    await this.prisma.route.update({ where: { id }, data: { deletedAt: new Date() } });

    await this.logAction(actorId, 'route.delete', 'Route', id, {
      beforeState: { name: route.name, routeNumber: route.routeNumber },
      ipAddress: ip,
    });
  }

  async updateRouteStops(actorId: string, routeId: string, dto: UpdateStopsDto, ip?: string) {
    const stops = await this.routesService.updateStops(routeId, dto.stops);

    await this.logAction(actorId, 'route.update_stops', 'Route', routeId, { ipAddress: ip });

    return stops;
  }

  async updateRouteFares(actorId: string, routeId: string, dto: UpdateFaresDto, ip?: string) {
    const fares = await this.routesService.updateFares(routeId, dto.fares);

    await this.logAction(actorId, 'route.update_fares', 'Route', routeId, { ipAddress: ip });

    return fares;
  }

  // ─── Trip Management ───────────────────────────────────────────────────────

  async listTrips(query: AdminTripQueryDto) {
    const sortBy = this.normalizeSortBy(query.sortBy, ['scheduledFor', 'createdAt', 'startedAt', 'endedAt']);
    const pagination = buildPagination({ ...query, sortBy });

    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.routeId ? { routeId: query.routeId } : {}),
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(query.fromDate || query.toDate
        ? {
            scheduledFor: {
              ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
              ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
            },
          }
        : {}),
    };

    const [trips, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        include: {
          route: { select: { id: true, routeNumber: true, name: true } },
          driver: { select: { id: true, fullName: true, phone: true } },
          _count: {
            select: {
              scanEvents: { where: { result: ScanResult.VALID, isInspection: false } },
            },
          },
        },
        skip: pagination.skip,
        take: pagination.take,
        orderBy: pagination.orderBy,
      }),
      this.prisma.trip.count({ where }),
    ]);

    const items = trips.map(({ _count, ...trip }) => ({ ...trip, passengerCount: _count.scanEvents }));

    return { items, meta: buildPaginationMeta(query.page ?? 1, query.limit ?? 20, total) };
  }

  async createTrip(actorId: string, dto: CreateTripDto, ip?: string) {
    // 1. Validate driver exists and is active
    const driver = await this.usersService.findById(dto.driverId);
    if (!driver || driver.role !== UserRole.DRIVER) {
      throw new NotFoundException('Driver not found');
    }
    if (driver.status !== UserStatus.ACTIVE) {
      throw new UnprocessableEntityException('Driver is not active');
    }

    // 2. Check for same-day scheduling conflict (non-cancelled trips)
    const scheduledDate = new Date(dto.scheduledFor);
    const dayStart = new Date(scheduledDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(scheduledDate);
    dayEnd.setHours(23, 59, 59, 999);

    const conflict = await this.prisma.trip.findFirst({
      where: {
        driverId: dto.driverId,
        scheduledFor: { gte: dayStart, lte: dayEnd },
        status: { not: TripStatus.CANCELLED },
      },
    });
    if (conflict) {
      throw new ConflictException('Driver already has a trip scheduled on this day');
    }

    // 3. Create trip (TripsService validates route exists and is active)
    const trip = await this.tripsService.create(dto);

    // 4. Log action
    await this.logAction(actorId, 'trip.create', 'Trip', trip.id, {
      afterState: { driverId: dto.driverId, routeId: dto.routeId },
      ipAddress: ip,
    });

    // 5. Notify driver — non-fatal; failures are logged but do not roll back the trip
    const route = trip.route as { routeNumber: string };
    const driverLocale = resolveLocale(driver.preferredLocale);
    const formattedDate = scheduledDate.toLocaleDateString(
      driverLocale === 'am' ? 'am-ET' : 'en-ET',
      { dateStyle: 'medium' },
    );
    const title = renderTemplate(MessageTemplates.TRIP_ASSIGNMENT_TITLE, driverLocale);
    const body = renderTemplate(
      MessageTemplates.TRIP_ASSIGNMENT_BODY,
      driverLocale,
      route.routeNumber,
      formattedDate,
    );

    try {
      await this.notificationsService.sendPush(dto.driverId, title, body);
    } catch {
      this.logger.warn(`Push failed for trip assignment: driverId=${dto.driverId}, tripId=${trip.id}`);
    }

    try {
      await this.notificationsService.sendSms(driver.phone, `SmartBus: ${body}`);
    } catch {
      this.logger.warn(`SMS failed for trip assignment: driverId=${dto.driverId}, tripId=${trip.id}`);
    }

    return trip;
  }

  async cancelTrip(actorId: string, id: string, ip?: string) {
    const trip = await this.tripsService.cancel(id);

    await this.logAction(actorId, 'trip.cancel', 'Trip', id, {
      afterState: { status: TripStatus.CANCELLED },
      ipAddress: ip,
    });

    return trip;
  }

  // ─── Audit Log ─────────────────────────────────────────────────────────────

  async listActions(query: AdminActionQueryDto) {
    const sortBy = this.normalizeSortBy(query.sortBy, ['createdAt', 'action', 'targetType']);
    const pagination = buildPagination({ ...query, sortBy });

    const where = {
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.action
        ? { action: { contains: query.action, mode: 'insensitive' as const } }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.adminAction.findMany({
        where,
        include: { actor: { select: { id: true, fullName: true, role: true } } },
        skip: pagination.skip,
        take: pagination.take,
        orderBy: pagination.orderBy,
      }),
      this.prisma.adminAction.count({ where }),
    ]);

    return { items, meta: buildPaginationMeta(query.page ?? 1, query.limit ?? 20, total) };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private assertRolePrivilege(actorRole: UserRole, targetRole: UserRole): void {
    if (actorRole !== UserRole.SUPER_ADMIN && ELEVATED_ROLES.has(targetRole)) {
      throw new ForbiddenException('Only SUPER_ADMIN may manage ADMIN accounts');
    }
  }

  private async logAction(
    actorId: string,
    action: string,
    targetType: string,
    targetId: string,
    opts?: { beforeState?: object; afterState?: object; ipAddress?: string },
  ): Promise<void> {
    await this.prisma.adminAction.create({
      data: {
        actorId,
        action,
        targetType,
        targetId,
        beforeState: opts?.beforeState,
        afterState: opts?.afterState,
        ipAddress: opts?.ipAddress,
      },
    });
  }

  private normalizeSortBy(value: string | undefined, allowed: string[]): string {
    if (!value || !allowed.includes(value)) return allowed[0];
    return value;
  }
}
