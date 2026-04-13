import { ApiProperty } from '@nestjs/swagger';
import { OtpPurpose } from '@prisma-generated/client';
import { IsEnum, IsString, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+251[0-9]{9}$/, {
    message: 'Phone must be Ethiopian format +251XXXXXXXXX',
  })
  @ApiProperty({ example: '+251912345678' })
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'Code must be 6 digits' })
  @ApiProperty({ example: '123456' })
  code!: string;

  @IsEnum(OtpPurpose)
  @ApiProperty({ enum: OtpPurpose, example: OtpPurpose.REGISTRATION })
  purpose!: OtpPurpose;
}
