import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma-generated/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { IdempotencyGuard } from '../../common/guards/idempotency.guard';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';
import type { JwtPayload } from '../../common/interfaces/jwt-payload.interface';
import { TopupDto } from './dto/topup.dto';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { WalletService } from './wallet.service';

@ApiTags('Wallet')
@ApiBearerAuth()
@Roles(UserRole.PASSENGER)
@Controller('wallet')
export class WalletController {
  constructor(private wallet: WalletService) {}

  @Get('balance')
  @ApiOperation({ summary: 'Get wallet balance' })
  @ApiResponse({ status: 200, description: 'Wallet balance' })
  getBalance(@CurrentUser() user: JwtPayload) {
    return this.wallet.getBalance(user.sub);
  }

  @Post('topup')
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOperation({ summary: 'Initiate wallet top-up' })
  @ApiResponse({ status: 201, description: 'Top-up initiated' })
  initiateTopup(
    @CurrentUser() user: JwtPayload,
    @Body() dto: TopupDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.wallet.initiateTopup(user.sub, dto, idempotencyKey);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'List wallet transactions' })
  @ApiResponse({ status: 200, description: 'Transaction history' })
  getTransactions(@CurrentUser() user: JwtPayload, @Query() query: TransactionQueryDto) {
    return this.wallet.getTransactions(user.sub, query);
  }
}
