import {
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PaymentProvider } from '../../src/modules/wallet/providers/payment.provider';

describe('PaymentProvider', () => {
  const originalFetch = global.fetch;

  const createProvider = (values: Record<string, unknown>) =>
    new PaymentProvider({
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService);

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns a mock payment URL when Chapa secret is absent', async () => {
    const provider = createProvider({ 'app.chapa.returnUrl': 'https://return.test' });

    const result = await provider.initiate(100, 'card', 'https://callback.test', {
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '0911000000',
    });

    expect(result.externalRef).toMatch(/^mock-/);
    expect(result.paymentUrl).toBe('https://return.test?status=mock_success');
  });

  it('calls Chapa and maps a successful initialize response', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          status: 'success',
          data: { checkout_url: 'https://checkout.test', tx_ref: 'tx-1' },
        }),
      ),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = createProvider({
      CHAPA_SECRET_KEY: 'secret',
      'app.chapa.baseUrl': 'https://chapa.test',
      'app.chapa.returnUrl': 'https://return.test',
    });

    const result = await provider.initiate(150, 'mobile', 'https://callback.test', {
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '0911000000',
    });

    expect(result).toEqual({ externalRef: 'tx-1', paymentUrl: 'https://checkout.test' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://chapa.test/transaction/initialize',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer secret' }),
      }),
    );
  });

  it('throws service errors for network, invalid JSON, and provider failures', async () => {
    const provider = createProvider({ CHAPA_SECRET_KEY: 'secret' });

    global.fetch = jest.fn().mockRejectedValue(new Error('down')) as unknown as typeof fetch;
    await expect(
      provider.initiate(150, 'mobile', 'https://callback.test', {
        firstName: 'Ada',
        lastName: 'Lovelace',
        phone: '0911000000',
      }),
    ).rejects.toThrow(ServiceUnavailableException);

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('not-json'),
    }) as unknown as typeof fetch;
    await expect(
      provider.initiate(150, 'mobile', 'https://callback.test', {
        firstName: 'Ada',
        lastName: 'Lovelace',
        phone: '0911000000',
      }),
    ).rejects.toThrow(ServiceUnavailableException);

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue(JSON.stringify({ status: 'failed', message: 'bad request' })),
    }) as unknown as typeof fetch;
    await expect(
      provider.initiate(150, 'mobile', 'https://callback.test', {
        firstName: 'Ada',
        lastName: 'Lovelace',
        phone: '0911000000',
      }),
    ).rejects.toThrow('Payment provider error: bad request');
  });

  it('verifies webhook signatures and requires a configured secret', () => {
    const payload = Buffer.from('{"status":"success"}');
    const signature = createHmac('sha256', 'webhook-secret').update(payload).digest('hex');
    const provider = createProvider({ 'app.chapa.webhookSecret': 'webhook-secret' });

    expect(provider.verifyWebhookSignature(payload, signature)).toBe(true);
    expect(provider.verifyWebhookSignature(payload, 'invalid')).toBe(false);

    expect(() => createProvider({}).verifyWebhookSignature(payload, signature)).toThrow(
      InternalServerErrorException,
    );
  });
});
