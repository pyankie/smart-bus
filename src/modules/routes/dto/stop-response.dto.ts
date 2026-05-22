import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StopResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: '1-based ordering along the route' })
  sequence!: number;

  @ApiPropertyOptional()
  latitude?: number;

  @ApiPropertyOptional()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Distance from previous stop in meters; null for the first stop' })
  distanceFromPrevious!: number | null;

  @ApiPropertyOptional({ description: 'Distance to next stop in meters; null for the last stop' })
  distanceToNext!: number | null;

  @ApiPropertyOptional({ description: 'Travel time from previous stop in minutes; null for the first stop' })
  durationFromPrevious!: number | null;

  @ApiPropertyOptional({ description: 'Travel time to next stop in minutes; null for the last stop' })
  durationToNext!: number | null;
}
