import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateRouteDto {
  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  name?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  description?: string;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Duration must be at least 1 minute' })
  @ApiPropertyOptional({ description: 'Estimated duration in minutes' })
  estimatedDuration?: number;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Distance must be at least 1 meter' })
  @ApiPropertyOptional({ description: 'Estimated distance in meters' })
  estimatedDistance?: number;
}
