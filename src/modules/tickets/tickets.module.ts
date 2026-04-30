import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RoutesModule } from '../routes/routes.module';
import { WalletModule } from '../wallet/wallet.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { QrService } from './qr.service';

@Module({
  imports: [PrismaModule, CommonModule, WalletModule, RoutesModule],
  controllers: [TicketsController],
  providers: [TicketsService, QrService],
  exports: [TicketsService, QrService],
})
export class TicketsModule {}
