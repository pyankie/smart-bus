import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { TripStatus } from '@prisma-generated/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class TripQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TripStatus)
  @ApiPropertyOptional({ enum: TripStatus })
  status?: TripStatus;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({ description: 'Filter trips from this date (ISO 8601)' })
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional({ description: 'Filter trips up to this date (ISO 8601)' })
  toDate?: string;
}
