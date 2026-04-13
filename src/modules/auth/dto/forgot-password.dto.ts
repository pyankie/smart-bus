import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  @Matches(/^\+251[0-9]{9}$/, {
    message: 'Phone must be Ethiopian format +251XXXXXXXXX',
  })
  @ApiProperty({ example: '+251912345678' })
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Ethiopian national ID (Fayda ID)' })
  fid!: string;
}
