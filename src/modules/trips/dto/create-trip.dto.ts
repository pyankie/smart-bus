import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTripDto {
  @IsUUID()
  @ApiProperty()
  routeId!: string;

  @IsUUID()
  @ApiProperty()
  driverId!: string;

  @IsDateString()
  @ApiProperty({ description: 'Scheduled start time (ISO 8601)' })
  scheduledFor!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ description: 'Bus license plate or fleet code' })
  busIdentifier?: string;
}
