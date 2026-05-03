import { ApiProperty } from '@nestjs/swagger';

export class RouteResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  routeNumber!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ description: 'Estimated duration in minutes' })
  duration!: number;

  @ApiProperty({ description: 'Name of the first stop on the route' })
  startStopName!: string;

  @ApiProperty({ description: 'Name of the last stop on the route' })
  endStopName!: string;

  @ApiProperty({ description: 'Total number of stops on the route' })
  totalStops!: number;

  @ApiProperty({ description: 'Fare from first to last stop in santim' })
  price!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
