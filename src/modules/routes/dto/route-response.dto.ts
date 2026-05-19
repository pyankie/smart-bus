import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FareResponseDto } from './fare-response.dto';
import { StopResponseDto } from './stop-response.dto';

export class RouteResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  routeNumber!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ description: 'Total route duration in minutes (summed from segments, or stored estimate)' })
  duration!: number;

  @ApiProperty({ description: 'Total route distance in meters (summed from segments, or stored estimate)' })
  distance!: number;

  @ApiProperty()
  startStopName!: string;

  @ApiProperty()
  endStopName!: string;

  @ApiProperty()
  totalStops!: number;

  @ApiProperty({ description: 'Full-route fare (first to last stop) in ETB' })
  price!: number;

  @ApiProperty({ type: [FareResponseDto], description: 'All stop-pair fares for this route' })
  fares!: FareResponseDto[];

  @ApiProperty({ type: [StopResponseDto] })
  stops!: StopResponseDto[];

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
