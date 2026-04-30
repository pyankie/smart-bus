import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { FareDto } from './fare.dto';
import { StopDto } from './stop.dto';

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
}
