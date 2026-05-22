import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @Matches(/^0[79][0-9]{8}$/, {
    message: 'Phone must be a valid Ethiopian mobile number (09XXXXXXXX or 07XXXXXXXX)',
  })
  @ApiProperty({ example: '0912345678' })
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
