import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

@Injectable()
export class PushProvider implements OnModuleInit {
  private readonly logger = new Logger(PushProvider.name);
  private enabled = false;

  constructor(private config: ConfigService) {}

  onModuleInit(): void {
    const projectId = this.config.get<string>('app.firebase.projectId');
    const clientEmail = this.config.get<string>('app.firebase.clientEmail');
    const privateKey = this.config.get<string>('app.firebase.privateKey');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn(
        'Firebase credentials not set — push notifications are disabled. ' +
          'Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY to enable.',
      );
      return;
    }

    if (getApps().length === 0) {
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    }

    this.enabled = true;
    this.logger.log('Firebase Admin initialized — push notifications enabled');
  }

  async send(
    fcmToken: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.enabled) {
      this.logger.warn(`Push skipped (FCM not configured): title="${title}"`);
      return;
    }

    await getMessaging().send({
      token: fcmToken,
      notification: { title, body },
      ...(data ? { data } : {}),
      android: { priority: 'high' },
      apns: { headers: { 'apns-priority': '10' } },
    });
  }
}
