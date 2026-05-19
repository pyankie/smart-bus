import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class FareLookupDto {
  @IsUUID()
  @ApiProperty()
  boardingStopId!: string;

  @IsUUID()
  @ApiProperty()
  dropoffStopId!: string;
}
