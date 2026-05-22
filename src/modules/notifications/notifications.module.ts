import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PushProvider } from './providers/push.provider';
import { SmsProvider } from './providers/sms.provider';

@Module({
  providers: [NotificationsService, SmsProvider, PushProvider],
  exports: [NotificationsService],
})
export class NotificationsModule {}
