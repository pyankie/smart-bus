import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, Max, Min } from 'class-validator';

export class TopupDto {
  @IsNumber()
  @Min(10)
  @Max(10000)
  @ApiProperty({ description: 'Amount in ETB', example: 50 })
  amount!: number;

  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Payment method from provider', example: 'card' })
  paymentMethod!: string;
}
