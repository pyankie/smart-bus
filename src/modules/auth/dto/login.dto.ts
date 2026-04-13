import { ApiProperty } from '@nestjs/swagger';
import { IdentifierType } from '@prisma-generated/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Phone, email, or FID value' })
  identifier!: string;

  @IsEnum(IdentifierType)
  @ApiProperty({ enum: IdentifierType })
  identifierType!: IdentifierType;

  @IsString()
  @IsNotEmpty()
  @ApiProperty()
  password!: string;
}
