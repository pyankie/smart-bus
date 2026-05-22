import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ScanResult } from '@prisma-generated/client';

export class OfflineScanDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  qrPayload!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  qrSignature!: string;

  @IsDateString()
  @ApiProperty({ description: 'When the scan happened on the device (ISO 8601 UTC)' })
  scannedAt!: string;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional()
  inspectionMode?: boolean;

  @IsOptional()
  @IsEnum(ScanResult)
  @ApiPropertyOptional({
    description: 'The local validation result from the device',
    enum: ScanResult,
  })
  localResult?: ScanResult;
}
