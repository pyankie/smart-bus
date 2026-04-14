import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { NotificationChannel, NotificationStatus } from '@prisma-generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SmsProvider } from './providers/sms.provider';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private smsProvider: SmsProvider,
  ) {}

  async sendSms(phone: string, message: string): Promise<void> {
    const userId = await this.requireUserIdByPhone(phone);

    try {
      const result = await this.smsProvider.send(phone, message);

      await this.prisma.notification.create({
        data: {
          userId,
          channel: NotificationChannel.SMS,
          status: NotificationStatus.SENT,
          body: this.redactOtpBody(phone, message),
          metadata: result.externalId ? { externalId: result.externalId } : undefined,
          sentAt: new Date(),
        },
      });
    } catch (error: unknown) {
      await this.prisma.notification.create({
        data: {
          userId,
          channel: NotificationChannel.SMS,
          status: NotificationStatus.FAILED,
          body: this.redactOtpBody(phone, message),
          failureReason: this.errorMessage(error),
        },
      });

      this.logger.error(`SMS send failed for ${phone}: ${this.errorMessage(error)}`);
      throw new ServiceUnavailableException('SMS delivery failed');
    }
  }

  private redactOtpBody(phone: string, body: string): string {
    if (!this.looksLikeOtp(body)) return body;
    const trimmed = phone.trim();
    return `OTP sent to ${trimmed.slice(0, 6)}XXXXX${trimmed.slice(-2)}`;
  }

  private looksLikeOtp(body: string): boolean {
    return /\b\d{4,8}\b/.test(body) || /otp/i.test(body);
  }

  private async requireUserIdByPhone(phone: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });

    if (!user) {
      throw new InternalServerErrorException('Cannot send SMS for unknown user');
    }

    return user.id;
  }
}
