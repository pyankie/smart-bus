import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsString,
  ValidateNested,
} from 'class-validator';

class ScanMetadataDto {
  @IsNumber() @ApiProperty() latitude!: number;
  @IsNumber() @ApiProperty() longitude!: number;
  @IsString() @IsNotEmpty() @ApiProperty() deviceId!: string;
}

class TicketContextDto {
  @IsString() @IsNotEmpty() @ApiProperty() ticketId!: string;
  @IsString() @IsNotEmpty() @ApiProperty() passengerId!: string;
  @IsNumber() @ApiProperty() fareAmount!: number;
  @IsISO8601() @ApiProperty() purchasedAt!: string;
  @IsISO8601() @ApiProperty() expiresAt!: string;
  @IsBoolean() @ApiProperty() qrSignatureValid!: boolean;
}

class StopContextDto {
  @IsString() @IsNotEmpty() @ApiProperty() id!: string;
  @IsNumber() @ApiProperty() latitude!: number;
  @IsNumber() @ApiProperty() longitude!: number;
}

export class ScanAnomalyRequestDto {
  @IsString() @IsNotEmpty() @ApiProperty() eventId!: string;

  @IsIn(['VALID', 'EXPIRED', 'ALREADY_USED', 'INVALID_SIGNATURE', 'INSPECTION_ONLY', 'NOT_FOUND'])
  @ApiProperty()
  result!:
    | 'VALID'
    | 'EXPIRED'
    | 'ALREADY_USED'
    | 'INVALID_SIGNATURE'
    | 'INSPECTION_ONLY'
    | 'NOT_FOUND';

  @IsBoolean() @ApiProperty() isOffline!: boolean;
  @IsISO8601() @ApiProperty() scannedAt!: string;
  @IsISO8601() @ApiProperty() syncedAt!: string;
  @IsNumber() @ApiProperty() syncDelaySeconds!: number;

  @ValidateNested()
  @Type(() => ScanMetadataDto)
  @ApiProperty({ type: ScanMetadataDto })
  scanMetadata!: ScanMetadataDto;

  @ValidateNested()
  @Type(() => TicketContextDto)
  @ApiProperty({ type: TicketContextDto })
  ticketContext!: TicketContextDto;

  @ValidateNested()
  @Type(() => StopContextDto)
  @ApiProperty({ type: StopContextDto })
  boardingStop!: StopContextDto;
}

export class ScanAnomalyResponseDto {
  @ApiProperty() eventId!: string;
  @ApiProperty({ description: 'Normalized fraud-risk score 0.0–1.0' }) anomalyScore!: number;
  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH'] }) severity!: 'LOW' | 'MEDIUM' | 'HIGH';
  @ApiProperty({ type: [String] }) reasons!: string[];
  @ApiProperty({ description: '"ml" or "fallback" — which engine produced this audit' })
  source!: 'ml' | 'fallback';
}
