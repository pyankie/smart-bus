import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class AnomalyQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ default: 1 })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiPropertyOptional({ default: 20 })
  limit?: number = 20;

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
