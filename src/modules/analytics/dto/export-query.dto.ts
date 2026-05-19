import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';

export class ExportQueryDto {
  @IsEnum(['tickets', 'revenue', 'trips', 'anomalies'])
  @ApiProperty({ enum: ['tickets', 'revenue', 'trips', 'anomalies'] })
  type!: string;

  @IsEnum(['csv', 'pdf'])
  @ApiProperty({ enum: ['csv', 'pdf'] })
  format!: string;

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
