import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class AnalyticsFilterDto {
  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional()
  toDate?: string;

  @IsOptional()
  @IsUUID()
  @ApiPropertyOptional()
  routeId?: string;

  @IsOptional()
  @IsUUID()
  @ApiPropertyOptional()
  driverId?: string;
}
