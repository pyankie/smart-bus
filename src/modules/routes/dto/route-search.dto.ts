import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class RouteSearchDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Route number, stop name, or general keyword' })
  q?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Departure stop name' })
  departure?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Destination stop name' })
  destination?: string;
}
