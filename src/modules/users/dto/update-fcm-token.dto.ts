import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateFcmTokenDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'FCM device token obtained from the Firebase SDK on the client' })
  token!: string;
}
