import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { IsLocalizedString } from '../../../common/decorators/is-localized-string.decorator';
import type { LocalizedString } from '../../../common/utils/localized-string';

export class StopDto {
  @IsLocalizedString()
  @ApiProperty({ example: { en: 'Megenagna', am: 'መገናኛ' } })
  name!: LocalizedString;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({ minimum: 1 })
  sequence!: number;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @ApiPropertyOptional()
  longitude?: number;
}
