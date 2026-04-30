import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class StopDto {
  @IsString()
  @ApiProperty()
  name!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({ minimum: 1 })
  sequence!: number;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional()
  longitude?: number;
}
