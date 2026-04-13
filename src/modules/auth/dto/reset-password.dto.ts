import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
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

  @IsString()
  @MinLength(6)
  @Matches(/(?=.*[a-zA-Z])(?=.*[0-9])/, {
    message: 'Password must contain letters and numbers',
  })
  @ApiProperty({ minLength: 6 })
  newPassword!: string;
}
