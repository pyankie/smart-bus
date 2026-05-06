import { ApiProperty } from '@nestjs/swagger';
import { StopResponseDto } from './stop-response.dto';

export class SegmentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'From stop' })
  fromStop!: StopResponseDto;

  @ApiProperty({ description: 'To stop' })
  toStop!: StopResponseDto;

  @ApiProperty({ description: 'Distance in meters' })
  distance!: number;

  @ApiProperty({ description: 'Duration in minutes' })
  duration!: number;
}
