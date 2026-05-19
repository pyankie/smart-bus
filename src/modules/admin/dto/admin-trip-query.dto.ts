import { ApiPropertyOptional } from '@nestjs/swagger';
import { TripStatus } from '@prisma-generated/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class AdminTripQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TripStatus)
  @ApiPropertyOptional({ enum: TripStatus })
  status?: TripStatus;

  @IsOptional()
  @IsUUID()
  @ApiPropertyOptional()
  routeId?: string;

  @IsOptional()
  @IsUUID()
  @ApiPropertyOptional()
  driverId?: string;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({ description: 'Filter trips on or after this date (ISO 8601)' })
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({ description: 'Filter trips on or before this date (ISO 8601)' })
  toDate?: string;
}
