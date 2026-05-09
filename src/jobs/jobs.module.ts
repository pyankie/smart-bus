import { DynamicModule, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { WalletModule } from '../modules/wallet/wallet.module';
import { CleanupJob } from './cleanup.job';
import { TicketExpiryJob } from './ticket-expiry.job';

@Module({})
export class JobsModule {
  static register(): DynamicModule {
    if (process.env.ENABLE_CRON !== 'true') {
      return { module: JobsModule };
    }
    return {
      module: JobsModule,
      imports: [ScheduleModule.forRoot(), WalletModule],
      providers: [TicketExpiryJob, CleanupJob],
    };
  }
}
