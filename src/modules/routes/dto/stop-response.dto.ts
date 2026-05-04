import { ApiProperty } from '@nestjs/swagger';

export class StopResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: '1-based ordering along the route' })
  sequence!: number;

  @ApiProperty({ required: false, description: 'Latitude coordinate' })
  latitude?: number;

  @ApiProperty({ required: false, description: 'Longitude coordinate' })
  longitude?: number;
}
