import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type SmsSendResult = {
  externalId?: string;
};

@Injectable()
export class SmsProvider {
  private readonly logger = new Logger(SmsProvider.name);

  constructor(private config: ConfigService) {}

  async send(phone: string, message: string): Promise<SmsSendResult> {
    const apiKey = this.config.get<string>('SMS_PROVIDER_API_KEY');
    const endpoint =
      this.config.get<string>('SMS_PROVIDER_URL') ?? 'https://smsethiopia.com/api/sms/send';
    const env = this.config.get<string>('app.env') ?? 'development';

    if (!apiKey || !endpoint) {
      if (env === 'development') {
        this.logger.log(`SMS dev mode: skipped provider call for ${this.maskPhone(phone)}`);
        return {};
      }

      throw new Error('SMS provider is not configured');
    }

    const payload = {
      msisdn: this.toSmsEthiopiaMsisdn(phone),
      text: message,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        KEY: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    const parsed = this.tryParseJson(text);

    if (!response.ok) {
      throw new Error(
        `SMS provider request failed (${response.status}): ${parsed?.message ?? text ?? 'unknown error'}`,
      );
    }

    if (parsed?.status && parsed.status !== 'success') {
      throw new Error(`SMS provider rejected message: ${parsed.message ?? 'unknown error'}`);
    }

    return {
      externalId: parsed?.message,
    };
  }

  private toSmsEthiopiaMsisdn(phone: string): string {
    const normalized = phone.trim();
    if (normalized.startsWith('0')) return `251${normalized.slice(1)}`;
    if (normalized.startsWith('+')) return normalized.slice(1);
    return normalized;
  }

  private tryParseJson(value: string): { status?: string; message?: string } | null {
    try {
      return JSON.parse(value) as { status?: string; message?: string };
    } catch {
      return null;
    }
  }

  private maskPhone(phone: string): string {
    const normalized = phone.trim();
    if (normalized.length < 7) return '***';
    return `${normalized.slice(0, 4)}*****${normalized.slice(-3)}`;
  }
}
