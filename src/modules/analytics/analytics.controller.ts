import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma-generated/client';
import type { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';
import { AnomalyQueryDto } from './dto/anomaly-query.dto';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { ExportQueryDto } from './dto/export-query.dto';
import { RevenueQueryDto } from './dto/revenue-query.dto';
import { TicketAnalyticsQueryDto } from './dto/ticket-analytics-query.dto';
import { TripAnalyticsQueryDto } from './dto/trip-analytics-query.dto';

@ApiTags('Admin Analytics')
@ApiBearerAuth()
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@Controller('admin')
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  @Get('analytics/dashboard')
  @ApiOperation({ summary: 'Aggregate dashboard stats for the given period' })
  @ApiResponse({ status: 200 })
  getDashboard(@Query() query: DashboardQueryDto) {
    return this.analytics.getDashboard(query);
  }

  @Get('analytics/revenue')
  @ApiOperation({ summary: 'Revenue breakdown by route and by day' })
  @ApiResponse({ status: 200 })
  getRevenue(@Query() query: RevenueQueryDto) {
    return this.analytics.getRevenue(query);
  }

  @Get('analytics/tickets')
  @ApiOperation({ summary: 'Ticket usage stats by status and route' })
  @ApiResponse({ status: 200 })
  getTickets(@Query() query: TicketAnalyticsQueryDto) {
    return this.analytics.getTickets(query);
  }

  @Get('analytics/trips')
  @ApiOperation({ summary: 'Trip summaries by status, route, and driver' })
  @ApiResponse({ status: 200 })
  getTrips(@Query() query: TripAnalyticsQueryDto) {
    return this.analytics.getTrips(query);
  }

  @Get('analytics/anomalies')
  @ApiOperation({ summary: 'Flagged anomalies (cross-device duplicate scans, expired use, high failure rates, rapid repeats)' })
  @ApiResponse({ status: 200 })
  getAnomalies(@Query() query: AnomalyQueryDto) {
    return this.analytics.getAnomalies(query);
  }

  @Get('reports/export')
  @ApiOperation({ summary: 'Export analytics data as CSV (PDF planned for v2)' })
  @ApiResponse({ status: 200, description: 'CSV file download' })
  @ApiResponse({ status: 422, description: 'Unsupported format or export type' })
  async exportReport(@Query() query: ExportQueryDto, @Res() res: Response) {
    const { content, filename } = await this.analytics.exportReport(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }
}
