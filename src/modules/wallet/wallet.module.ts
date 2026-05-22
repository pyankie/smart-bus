import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { WalletController } from './wallet.controller';
import { PaymentProvider } from './providers/payment.provider';
import { WalletService } from './wallet.service';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [CommonModule],
  controllers: [WalletController, WebhookController],
  providers: [WalletService, PaymentProvider],
  exports: [WalletService],
})
export class WalletModule {}
