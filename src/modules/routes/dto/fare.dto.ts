import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

export class FareDto {
  @IsUUID()
  @ApiProperty()
  fromStopId!: string;

  @IsUUID()
  @ApiProperty()
  toStopId!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({ minimum: 1, description: 'Fare amount in santim' })
  amount!: number;
}
