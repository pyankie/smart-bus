import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class TopupDto {
  @IsInt()
  @Min(1000) // PROPOSAL — confirm
  @Max(1000000) // PROPOSAL — confirm
  @ApiProperty({ description: 'Amount in santim (minor units)', example: 5000 })
  amount!: number;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Payment method from provider', example: 'card' })
  paymentMethod!: string;
}
