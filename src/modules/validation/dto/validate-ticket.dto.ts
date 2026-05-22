import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class ValidateTicketDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: "The QR payload string decoded from the passenger's QR code" })
  qrPayload!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'The QR signature string' })
  qrSignature!: string;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ description: 'If true, scan without marking ticket as used', default: false })
  inspectionMode?: boolean;

  // Optional context used by the ML anomaly audit. Drivers can omit; the audit
  // then runs against the boarding stop's recorded coordinates only.
  @IsOptional() @IsNumber() @ApiPropertyOptional() latitude?: number;
  @IsOptional() @IsNumber() @ApiPropertyOptional() longitude?: number;
  @IsOptional() @IsString() @ApiPropertyOptional() deviceId?: string;
}
