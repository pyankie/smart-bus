import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FareLookupDto } from './dto/fare-lookup.dto';
import { RouteQueryDto } from './dto/route-query.dto';
import { RouteSearchDto } from './dto/route-search.dto';
import { RouteResponseDto } from './dto/route-response.dto';
import { RoutesService } from './routes.service';

@ApiTags('Routes')
@ApiBearerAuth()
@Controller('routes')
export class RoutesController {
  constructor(private routes: RoutesService) {}

  @Get()
  @ApiOperation({ summary: 'List active routes (paginated)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of active routes',
    type: RouteResponseDto,
    isArray: false,
  })
  findAll(@Query() query: RouteQueryDto) {
    return this.routes.findAll(query);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search routes by keyword, departure, or destination' })
  @ApiResponse({
    status: 200,
    description: 'Matching routes',
    type: RouteResponseDto,
    isArray: false,
  })
  search(@Query() query: RouteSearchDto) {
    return this.routes.search(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get route detail with stops and fares' })
  @ApiResponse({
    status: 200,
    description: 'Route detail',
    type: RouteResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Route not found' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.routes.findById(id);
  }

  @Get(':id/fare')
  @ApiOperation({ summary: 'Look up fare for a stop pair on a route' })
  @ApiResponse({ status: 200, description: 'Fare amount in ETB' })
  @ApiResponse({ status: 404, description: 'Fare not found' })
  getFare(
    @Param('id', ParseUUIDPipe) routeId: string,
    @Query() dto: FareLookupDto,
  ) {
    return this.routes.getFare(routeId, dto.boardingStopId, dto.dropoffStopId);
  }
}
