import { ApiProperty } from '@nestjs/swagger';

export class FareResponseDto {
  @ApiProperty()
  fromStopId!: string;

  @ApiProperty()
  toStopId!: string;

  @ApiProperty({ description: 'Boarding stop sequence number' })
  fromStopSequence!: number;

  @ApiProperty({ description: 'Alighting stop sequence number' })
  toStopSequence!: number;

  @ApiProperty({ description: 'Fare amount in ETB' })
  amount!: number;
}
