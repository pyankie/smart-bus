import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min, ValidateNested } from 'class-validator';
import { StopDto } from './stop.dto';

export class RouteSegmentDto {
  @IsInt()
  @Min(1, { message: 'From stop sequence must be at least 1' })
  @ApiProperty({ description: 'Sequence number of FROM stop' })
  fromStopSequence!: number;

  @IsInt()
  @Min(1, { message: 'To stop sequence must be at least 1' })
  @ApiProperty({ description: 'Sequence number of TO stop' })
  toStopSequence!: number;

  @IsInt()
  @Min(0, { message: 'Distance must be at least 0 meters' })
  @ApiProperty({ description: 'Distance in meters' })
  distance!: number;

  @IsInt()
  @Min(0, { message: 'Duration must be at least 0 minutes' })
  @ApiProperty({ description: 'Duration in minutes' })
  duration!: number;
}
