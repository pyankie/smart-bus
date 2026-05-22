import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength, Matches } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[A-Za-zÀ-ÖØ-öø-ÿ\s.-]+$/, {
    message: 'fullName may only contain letters, spaces, hyphens, and periods',
  })
  @ApiPropertyOptional({ example: 'Abebe Kebede Tekle' })
  fullName?: string;

  @IsOptional()
  @IsEmail()
  @ApiPropertyOptional({ example: 'abebe@example.com' })
  email?: string;
}
