import { ConfigService } from '@nestjs/config';
import { SmsProvider } from '../../src/modules/notifications/providers/sms.provider';

describe('SmsProvider', () => {
  const originalFetch = global.fetch;

  const createProvider = (values: Record<string, unknown>) =>
    new SmsProvider({
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService);

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('skips provider calls in development when SMS config is missing', async () => {
    const provider = createProvider({ 'app.env': 'development' });

    await expect(provider.send('0911000022', 'Hello')).resolves.toEqual({});
  });

  it('throws when provider config is missing outside development', async () => {
    const provider = createProvider({ 'app.env': 'production' });

    await expect(provider.send('0911000022', 'Hello')).rejects.toThrow('SMS provider is not configured');
  });

  it('sends normalized SMS payloads and returns the provider message id', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(JSON.stringify({ status: 'success', message: 'external-1' })),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = createProvider({
      SMS_PROVIDER_API_KEY: 'sms-key',
      SMS_PROVIDER_URL: 'https://sms.test',
      'app.env': 'production',
    });

    await expect(provider.send('0911000022', 'Hello')).resolves.toEqual({ externalId: 'external-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sms.test',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ KEY: 'sms-key' }),
        body: JSON.stringify({ msisdn: '251911000022', text: 'Hello' }),
      }),
    );
  });

  it('throws for failed HTTP responses and provider rejections', async () => {
    const provider = createProvider({
      SMS_PROVIDER_API_KEY: 'sms-key',
      SMS_PROVIDER_URL: 'https://sms.test',
      'app.env': 'production',
    });

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue(JSON.stringify({ message: 'server error' })),
    }) as unknown as typeof fetch;
    await expect(provider.send('+251911000022', 'Hello')).rejects.toThrow(
      'SMS provider request failed (500): server error',
    );

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      text: jest.fn().mockResolvedValue(JSON.stringify({ status: 'failed', message: 'rejected' })),
    }) as unknown as typeof fetch;
    await expect(provider.send('251911000022', 'Hello')).rejects.toThrow(
      'SMS provider rejected message: rejected',
    );
  });
});
