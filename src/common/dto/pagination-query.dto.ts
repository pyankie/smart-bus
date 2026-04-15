import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  limit?: number = 20;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ default: 'createdAt' })
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  sortOrder?: 'asc' | 'desc' = 'desc';
}
