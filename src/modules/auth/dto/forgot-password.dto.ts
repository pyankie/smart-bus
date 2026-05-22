import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  @Matches(/^0[79][0-9]{8}$/, {
    message: 'Phone must be a valid Ethiopian mobile number (09XXXXXXXX or 07XXXXXXXX)',
  })
  @ApiProperty({ example: '0912345678' })
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Ethiopian national ID (Fayda ID)' })
  fid!: string;
}
