import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID } from 'crypto';

export interface PaymentProviderResult {
  externalRef: string;
  paymentUrl: string;
}

@Injectable()
export class PaymentProvider {
  constructor(private config: ConfigService) {}

  async initiate(
    amount: number,
    method: string,
    callbackUrl: string,
    customer: {
      email?: string | null;
      firstName: string;
      lastName: string;
      phone: string;
    },
  ): Promise<PaymentProviderResult> {
    const secretKey = this.config.get<string>('CHAPA_SECRET_KEY');
    const baseUrl = this.config.get<string>('app.chapa.baseUrl') ?? 'https://api.chapa.co/v1';
    const returnUrl = this.config.get<string>('app.chapa.returnUrl') ?? callbackUrl;

    // Development fallback
    if (!secretKey) {
      return {
        externalRef: `mock-${randomUUID()}`,
        paymentUrl: `${returnUrl}?status=mock_success`,
      };
    }

    const txRef = randomUUID(); // max 36 chars — Chapa rejects longer tx_ref values

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amount.toString(),
          currency: 'ETB',
          email: customer.email ?? `${customer.phone}@smartbus.local`,
          first_name: customer.firstName,
          last_name: customer.lastName,
          phone_number: customer.phone,
          tx_ref: txRef,
          callback_url: callbackUrl,
          return_url: returnUrl,
          customization: {
            title: 'SmartBus Top-up', // max 16 chars enforced by Chapa
            description: `Wallet top-up via ${method}`,
          },
        }),
      });
    } catch {
      throw new ServiceUnavailableException('Payment provider unreachable');
    }

    let data: { status?: string; message?: string; data?: { checkout_url?: string; tx_ref?: string } };
    try {
      data = (await response.json()) as typeof data;
    } catch {
      throw new ServiceUnavailableException('Payment provider returned an invalid response');
    }

    if (!response.ok || data.status !== 'success' || !data.data?.checkout_url) {
      throw new ServiceUnavailableException(
        `Payment provider error: ${data.message ?? 'unknown error'}`,
      );
    }

    return {
      externalRef: data.data.tx_ref ?? txRef,
      paymentUrl: data.data.checkout_url,
    };
  }

  verifyWebhookSignature(payload: Buffer, signature: string): boolean {
    const secret = this.config.get<string>('app.chapa.webhookSecret');
    if (!secret) {
      throw new InternalServerErrorException('Webhook secret is not configured');
    }

    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    return expected === signature;
  }
}
