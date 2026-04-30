import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

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
}
