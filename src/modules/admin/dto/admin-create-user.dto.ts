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

export class AdminCreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[A-Za-zÀ-ÖØ-öø-ÿ\s.-]+$/, {
    message: 'fullName may only contain letters, spaces, hyphens, and periods',
  })
  @ApiProperty({ example: 'Dawit Bekele' })
  fullName!: string;

  @IsString()
  @Matches(/^\+251[0-9]{9}$/, { message: 'phone must be a valid Ethiopian number (+251XXXXXXXXX)' })
  @ApiProperty({ example: '+251911234567' })
  phone!: string;

  @IsOptional()
  @IsEmail()
  @ApiPropertyOptional()
  email?: string;

  @IsEnum(UserRole)
  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @IsString()
  @MinLength(6)
  @Matches(/(?=.*[a-zA-Z])(?=.*[0-9])/, {
    message: 'password must contain at least one letter and one digit',
  })
  @ApiProperty({ minLength: 6, description: 'Plain-text temporary password' })
  password!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @ApiPropertyOptional({ description: 'Ethiopian national ID — required when role is PASSENGER' })
  fid?: string;
}
