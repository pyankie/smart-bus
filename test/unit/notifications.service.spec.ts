import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { NotificationChannel, NotificationStatus } from '@prisma-generated/client';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { PushProvider } from '../../src/modules/notifications/providers/push.provider';
import { SmsProvider } from '../../src/modules/notifications/providers/sms.provider';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MockPrismaProvider, MockPrismaService } from '../utils/mock-prisma';

describe('NotificationsService', () => {
  let prisma: MockPrismaService;
  let smsProvider: jest.Mocked<Pick<SmsProvider, 'send'>>;
  let pushProvider: jest.Mocked<Pick<PushProvider, 'send'>>;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = MockPrismaProvider.useFactory();
    smsProvider = { send: jest.fn().mockResolvedValue({ externalId: 'sms-1' }) };
    pushProvider = { send: jest.fn().mockResolvedValue(undefined) };
    service = new NotificationsService(
      prisma as unknown as PrismaService,
      smsProvider as unknown as SmsProvider,
      pushProvider as unknown as PushProvider,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('sends SMS and stores a redacted notification record', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1' } as any);

    await service.sendSms('0911000022', 'Your OTP is 123456');

    expect(smsProvider.send).toHaveBeenCalledWith('0911000022', 'Your OTP is 123456');
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        channel: NotificationChannel.SMS,
        status: NotificationStatus.SENT,
        body: 'OTP sent to 091100XXXXX22',
        metadata: { externalId: 'sms-1' },
        sentAt: expect.any(Date),
      }),
    });
  });

  it('records failed SMS attempts and rejects unknown phone numbers', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1' } as any);
    smsProvider.send.mockRejectedValueOnce(new Error('provider down'));

    await expect(service.sendSms('0911000022', 'Hello')).rejects.toThrow(ServiceUnavailableException);
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: NotificationStatus.FAILED,
        body: 'Hello',
        failureReason: 'provider down',
      }),
    });

    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.sendSms('0911000022', 'Hello')).rejects.toThrow(InternalServerErrorException);
  });

  it('sends push notifications and handles missing tokens or provider failures', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1', fcmToken: null } as any);
    await service.sendPush('user-1', 'Title', 'Body');
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: NotificationChannel.PUSH,
        status: NotificationStatus.FAILED,
        failureReason: 'No FCM token registered',
      }),
    });

    prisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1', fcmToken: 'token-1' } as any);
    await service.sendPush('user-1', 'Title', 'Body', { ticketId: 'ticket-1' });
    expect(pushProvider.send).toHaveBeenCalledWith('token-1', 'Title', 'Body', {
      ticketId: 'ticket-1',
    });
    expect(prisma.notification.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        channel: NotificationChannel.PUSH,
        status: NotificationStatus.SENT,
        title: 'Title',
        body: 'Body',
        sentAt: expect.any(Date),
      }),
    });

    prisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1', fcmToken: 'token-1' } as any);
    pushProvider.send.mockRejectedValueOnce('push down');
    await expect(service.sendPush('user-1', 'Title', 'Body')).rejects.toThrow(ServiceUnavailableException);
    expect(prisma.notification.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        status: NotificationStatus.FAILED,
        failureReason: 'push down',
      }),
    });
  });

  it('rejects push notifications for unknown users', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(service.sendPush('missing', 'Title', 'Body')).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
