import { ApiPropertyOptional } from '@nestjs/swagger';
import { TicketStatus } from '@prisma-generated/client';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class TicketQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  @ApiPropertyOptional({ enum: TicketStatus })
  status?: TicketStatus;

  @IsOptional()
  @IsUUID()
  @ApiPropertyOptional()
  routeId?: string;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional()
  toDate?: string;
}
