import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AdminUpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[A-Za-zÀ-ÖØ-öø-ÿ\s.-]+$/, {
    message: 'fullName may only contain letters, spaces, hyphens, and periods',
  })
  @ApiPropertyOptional()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  @ApiPropertyOptional()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+251[0-9]{9}$/, { message: 'phone must be a valid Ethiopian number (+251XXXXXXXXX)' })
  @ApiPropertyOptional({ description: 'Admins may reassign a phone number; users cannot self-update phone' })
  phone?: string;
}
