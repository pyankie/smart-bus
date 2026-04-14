import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SmsProvider } from './providers/sms.provider';

@Module({
  providers: [NotificationsService, SmsProvider],
  exports: [NotificationsService],
})
export class NotificationsModule {}
