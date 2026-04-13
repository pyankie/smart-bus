import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma-generated/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsEnum(UserRole)
  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[A-Za-zÀ-ÖØ-öø-ÿ\s.-]+$/, {
    message: 'fullName may only contain letters, spaces, hyphens, and periods',
  })
  @ApiProperty({ example: 'Abebe Kebede Tekle' })
  fullName!: string;

  @IsString()
  @Matches(/^\+251[0-9]{9}$/, { message: 'phone must be a valid Ethiopian number (+251XXXXXXXXX)' })
  @ApiProperty({ example: '+251912345678' })
  phone!: string;

  @IsOptional()
  @IsEmail()
  @ApiPropertyOptional({ example: 'abebe@example.com' })
  email?: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Pre-hashed password (Auth module responsibility)' })
  passwordHash!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @ApiPropertyOptional({ description: 'Ethiopian national ID — required for PASSENGER' })
  fid?: string;
}
