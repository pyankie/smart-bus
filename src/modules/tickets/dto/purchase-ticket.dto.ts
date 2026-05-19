import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class PurchaseTicketDto {
  @IsUUID()
  @ApiProperty()
  routeId!: string;

  @IsUUID()
  @ApiProperty()
  boardingStopId!: string;

  @IsUUID()
  @ApiProperty()
  dropoffStopId!: string;
}
