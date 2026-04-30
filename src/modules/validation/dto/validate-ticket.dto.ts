import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
}
