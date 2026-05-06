import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { FareDto } from '../../routes/dto/fare.dto';

export class UpdateFaresDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FareDto)
  @ApiProperty({ type: [FareDto], description: 'Replaces all fares for this route' })
  fares!: FareDto[];
}
