import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { FareDto } from './fare.dto';
import { StopDto } from './stop.dto';
import { RouteSegmentDto } from './route-segment.dto';

export class CreateRouteDto {
  @IsString()
  @ApiProperty({ description: 'Unique route number, normalized to uppercase' })
  routeNumber!: string;

  @IsString()
  @ApiProperty()
  name!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  description?: string;

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

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => StopDto)
  @ApiProperty({ type: [StopDto], minItems: 2 })
  stops!: StopDto[];
  
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FareDto)
  @ApiProperty({ type: [FareDto] })
  fares!: FareDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RouteSegmentDto)
  @ApiProperty({ type: [RouteSegmentDto], required: false })
  segments?: RouteSegmentDto[];
}
