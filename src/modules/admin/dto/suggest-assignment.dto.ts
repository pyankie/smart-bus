import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsUUID } from 'class-validator';

export class SuggestAssignmentDto {
  @IsUUID()
  @ApiProperty({ description: 'Target route ID' })
  routeId!: string;

  @IsISO8601()
  @ApiProperty({ description: 'ISO 8601 timestamp of the scheduled trip' })
  scheduledFor!: string;
}
