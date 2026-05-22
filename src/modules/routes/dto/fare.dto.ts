import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, Min } from 'class-validator';

export class FareDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({ minimum: 1, description: 'Sequence number of the boarding stop' })
  fromStopSequence!: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({ minimum: 1, description: 'Sequence number of the dropoff stop' })
  toStopSequence!: number;

  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  @ApiProperty({ minimum: 0.01, description: 'Fare amount in ETB' })
  amount!: number;
}
