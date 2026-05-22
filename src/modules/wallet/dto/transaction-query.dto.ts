import { ApiPropertyOptional } from '@nestjs/swagger';
import { WalletTransactionStatus, WalletTransactionType } from '@prisma-generated/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class TransactionQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(WalletTransactionType)
  @ApiPropertyOptional({ enum: WalletTransactionType })
  type?: WalletTransactionType;

  @IsOptional()
  @IsEnum(WalletTransactionStatus)
  @ApiPropertyOptional({ enum: WalletTransactionStatus })
  status?: WalletTransactionStatus;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  @ApiPropertyOptional()
  toDate?: string;
}
