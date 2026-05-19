import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @Matches(/^0[79][0-9]{8}$/, {
    message: 'Phone must be a valid Ethiopian mobile number (09XXXXXXXX for Ethiotelecom, 07XXXXXXXX for Safaricom)',
  })
  @ApiProperty({ example: '0912345678' })
  phone!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[a-zA-Z\s.\-]+$/, {
    message: 'Full name may contain letters, spaces, hyphens, and periods',
  })
  @ApiProperty({ example: 'Abebe Kebede Tekle' })
  fullName!: string;

  @IsOptional()
  @IsEmail()
  @ApiPropertyOptional({ example: 'abebe@example.com' })
  email?: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Ethiopian national ID (Fayda ID)' })
  fid!: string;

  @IsString()
  @MinLength(6)
  @Matches(/(?=.*[a-zA-Z])(?=.*[0-9])/, {
    message: 'Password must contain letters and numbers',
  })
  @ApiProperty({ minLength: 6 })
  password!: string;
}
