import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { StopDto } from '../../routes/dto/stop.dto';

export class UpdateStopsDto {
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => StopDto)
  @ApiProperty({ type: [StopDto], minItems: 2, description: 'Replaces all stops. Also clears existing fares and segments.' })
  stops!: StopDto[];
}
