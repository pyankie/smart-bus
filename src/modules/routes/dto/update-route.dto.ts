import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { IsPartialLocalizedString } from '../../../common/decorators/is-localized-string.decorator';
import type { PartialLocalizedString } from '../../../common/utils/localized-string';

export class UpdateRouteDto {
  @IsOptional()
  @IsPartialLocalizedString()
  @ApiPropertyOptional({ example: { en: 'Megenagna – Bole', am: 'መገናኛ – ቦሌ' } })
  name?: PartialLocalizedString;

  @IsOptional()
  @IsPartialLocalizedString()
  @ApiPropertyOptional({ example: { en: 'Express via Ring Road', am: 'በሪንግ ሮድ ፈጣን' } })
  description?: PartialLocalizedString;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Duration must be at least 1 minute' })
  @ApiPropertyOptional({ description: 'Estimated duration in minutes' })
  estimatedDuration?: number;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Distance must be at least 1 meter' })
  @ApiPropertyOptional({ description: 'Estimated distance in meters' })
  estimatedDistance?: number;
}
