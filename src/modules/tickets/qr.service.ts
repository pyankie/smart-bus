import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

export interface QrPayloadData {
  ticketId: string;
  passengerId: string;
  routeId: string;
  boardingStopId: string;
  dropoffStopId: string;
  fareAmount: number;
  expiresAt: string;
  issuedAt: string;
}

@Injectable()
export class QrService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    const secret = config.get<string>('QR_SIGNING_SECRET');
    if (!secret) throw new Error('QR_SIGNING_SECRET is not configured');
    this.secret = secret;
  }

  sign(data: QrPayloadData): { payload: string; signature: string } {
    const payload = JSON.stringify(data);
    const signature = createHmac('sha256', this.secret).update(payload).digest('hex');
    return { payload, signature };
  }

  verify(payload: string, signature: string): boolean {
    const expected = createHmac('sha256', this.secret).update(payload).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }
}
