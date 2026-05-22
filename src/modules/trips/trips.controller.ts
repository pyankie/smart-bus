import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma-generated/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { TripQueryDto } from './dto/trip-query.dto';
import { TripsService } from './trips.service';

@ApiTags('Trips')
@ApiBearerAuth()
@Roles(UserRole.DRIVER)
@Controller('trips')
export class TripsController {
  constructor(private trips: TripsService) {}

  @Get()
  @ApiOperation({ summary: "List the driver's own trips with filters and pagination" })
  @ApiResponse({ status: 200, description: 'Paginated trip list' })
  findAll(@CurrentUser() user: JwtPayload, @Query() query: TripQueryDto) {
    return this.trips.findAllForDriver(user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get trip detail with scan summary' })
  @ApiResponse({ status: 200, description: 'Trip detail with summary' })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.trips.findById(user.sub, id);
  }

  @Patch(':id/start')
  @ApiOperation({ summary: 'Start a scheduled trip (SCHEDULED → IN_PROGRESS)' })
  @ApiResponse({ status: 200, description: 'Trip started' })
  @ApiResponse({ status: 400, description: 'Trip is not in SCHEDULED status' })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  @ApiResponse({ status: 409, description: 'Driver already has an in-progress trip' })
  startTrip(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.trips.startTrip(user.sub, id);
  }

  @Patch(':id/end')
  @ApiOperation({ summary: 'End an in-progress trip (IN_PROGRESS → COMPLETED)' })
  @ApiResponse({ status: 200, description: 'Trip completed with summary' })
  @ApiResponse({ status: 400, description: 'Trip is not in IN_PROGRESS status' })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  endTrip(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.trips.endTrip(user.sub, id);
  }
}
