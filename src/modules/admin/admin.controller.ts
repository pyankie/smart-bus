import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma-generated/client';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { CreateRouteDto } from '../routes/dto/create-route.dto';
import { UpdateRouteDto } from '../routes/dto/update-route.dto';
import { CreateTripDto } from '../trips/dto/create-trip.dto';
import { AdminService } from './admin.service';
import { AdminActionQueryDto } from './dto/admin-action-query.dto';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { AdminTripQueryDto } from './dto/admin-trip-query.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';
import { SuggestAssignmentDto } from './dto/suggest-assignment.dto';
import { UpdateFaresDto } from './dto/update-fares.dto';
import { UpdateStopsDto } from './dto/update-stops.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService) {}

  // ─── User Management ───────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'List all users (paginated, filterable)' })
  @ApiResponse({ status: 200 })
  listUsers(@Query() query: AdminUserQueryDto) {
    return this.admin.listUsers(query);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get user detail' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  getUserById(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getUserById(id);
  }

  @Post('users')
  @ApiOperation({ summary: 'Create a user (skips OTP; created with ACTIVE status)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 403, description: 'ADMIN cannot create ADMIN/SUPER_ADMIN accounts' })
  @ApiResponse({ status: 409, description: 'Phone/email/FID already in use' })
  createUser(
    @CurrentUser() actor: JwtPayload,
    @Req() req: Request,
    @Body() dto: AdminCreateUserDto,
  ) {
    return this.admin.createUser(actor.sub, actor.role, dto, this.extractIp(req));
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Update user profile (admin may also change phone)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  updateUser(
    @CurrentUser() actor: JwtPayload,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) targetId: string,
    @Body() dto: AdminUpdateUserDto,
  ) {
    return this.admin.updateUser(actor.sub, actor.role, targetId, dto, this.extractIp(req));
  }

  @Patch('users/:id/disable')
  @ApiOperation({ summary: 'Disable a user account' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403, description: 'Cannot disable self, or ADMIN cannot disable ADMIN' })
  @ApiResponse({ status: 404 })
  disableUser(
    @CurrentUser() actor: JwtPayload,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) targetId: string,
  ) {
    return this.admin.disableUser(actor.sub, actor.role, targetId, this.extractIp(req));
  }

  @Patch('users/:id/enable')
  @ApiOperation({ summary: 'Re-enable a user account' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 403 })
  @ApiResponse({ status: 404 })
  enableUser(
    @CurrentUser() actor: JwtPayload,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) targetId: string,
  ) {
    return this.admin.enableUser(actor.sub, actor.role, targetId, this.extractIp(req));
  }

  // ─── Route Management ──────────────────────────────────────────────────────

  @Post('routes')
  @ApiOperation({ summary: 'Create a route with stops, fares, and optional segments' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 409, description: 'Route number already in use' })
  @ApiResponse({ status: 422, description: 'Invalid stops or segment sequences' })
  createRoute(
    @CurrentUser('sub') actorId: string,
    @Req() req: Request,
    @Body() dto: CreateRouteDto,
  ) {
    return this.admin.createRoute(actorId, dto, this.extractIp(req));
  }

  @Patch('routes/:id')
  @ApiOperation({ summary: 'Update route metadata (name, description, active status, estimates)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  updateRoute(
    @CurrentUser('sub') actorId: string,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRouteDto,
  ) {
    return this.admin.updateRoute(actorId, id, dto, this.extractIp(req));
  }

  @Delete('routes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a route (blocked if active tickets exist)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404 })
  @ApiResponse({ status: 409, description: 'Route has active tickets' })
  async deleteRoute(
    @CurrentUser('sub') actorId: string,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.admin.deleteRoute(actorId, id, this.extractIp(req));
  }

  @Put('routes/:id/stops')
  @ApiOperation({ summary: 'Replace all stops (also clears existing fares and segments)' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  @ApiResponse({ status: 422 })
  updateRouteStops(
    @CurrentUser('sub') actorId: string,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) routeId: string,
    @Body() dto: UpdateStopsDto,
  ) {
    return this.admin.updateRouteStops(actorId, routeId, dto, this.extractIp(req));
  }

  @Put('routes/:id/fares')
  @ApiOperation({ summary: 'Replace all fares for a route' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404 })
  @ApiResponse({ status: 422, description: 'Invalid stop sequences' })
  updateRouteFares(
    @CurrentUser('sub') actorId: string,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) routeId: string,
    @Body() dto: UpdateFaresDto,
  ) {
    return this.admin.updateRouteFares(actorId, routeId, dto, this.extractIp(req));
  }

  // ─── Trip Management ───────────────────────────────────────────────────────

  @Get('trips')
  @ApiOperation({ summary: 'List all trips across all drivers (paginated, filterable)' })
  @ApiResponse({ status: 200 })
  listTrips(@Query() query: AdminTripQueryDto) {
    return this.admin.listTrips(query);
  }

  @Post('trips')
  @ApiOperation({ summary: 'Schedule a trip (assign driver to route)' })
  @ApiResponse({ status: 201 })
  @ApiResponse({ status: 404, description: 'Driver or route not found' })
  @ApiResponse({ status: 409, description: 'Driver already has a trip on that day' })
  @ApiResponse({ status: 422, description: 'Driver is not active' })
  createTrip(
    @CurrentUser('sub') actorId: string,
    @Req() req: Request,
    @Body() dto: CreateTripDto,
  ) {
    return this.admin.createTrip(actorId, dto, this.extractIp(req));
  }

  @Post('assignments/suggest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Suggest ranked driver assignments for a route (UC0012)',
    description:
      'Returns ML-ranked candidate drivers with confidence + reasons. Falls back to a Prisma heuristic when the ML service is disabled or unreachable.',
  })
  @ApiResponse({ status: 200 })
  suggestAssignments(@Body() dto: SuggestAssignmentDto) {
    return this.admin.suggestDriverAssignments(dto.routeId, dto.scheduledFor);
  }

  @Patch('trips/:id/cancel')
  @ApiOperation({ summary: 'Cancel a scheduled trip' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 400, description: 'Trip is not in SCHEDULED status' })
  @ApiResponse({ status: 404 })
  cancelTrip(
    @CurrentUser('sub') actorId: string,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admin.cancelTrip(actorId, id, this.extractIp(req));
  }

  // ─── Audit Log ─────────────────────────────────────────────────────────────

  @Get('actions')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'View audit log (SUPER_ADMIN only)' })
  @ApiResponse({ status: 200 })
  listActions(@Query() query: AdminActionQueryDto) {
    return this.admin.listActions(query);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private extractIp(req: Request): string | undefined {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    return req.ip;
  }
}
