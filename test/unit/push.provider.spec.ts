import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PushProvider } from '../../src/modules/notifications/providers/push.provider';

jest.mock('firebase-admin/app', () => ({
  cert: jest.fn((value) => value),
  getApps: jest.fn(),
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: jest.fn(),
}));

describe('PushProvider', () => {
  const createProvider = (values: Record<string, unknown>) =>
    new PushProvider({
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService);

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('stays disabled when Firebase credentials are missing', async () => {
    const provider = createProvider({});

    provider.onModuleInit();
    await provider.send('token-1', 'Title', 'Body');

    expect(initializeApp).not.toHaveBeenCalled();
    expect(getMessaging).not.toHaveBeenCalled();
  });

  it('initializes Firebase and sends push messages when configured', async () => {
    (getApps as jest.Mock).mockReturnValue([]);
    const send = jest.fn().mockResolvedValue('message-id');
    (getMessaging as jest.Mock).mockReturnValue({ send });
    const provider = createProvider({
      'app.firebase.projectId': 'project-1',
      'app.firebase.clientEmail': 'firebase@example.com',
      'app.firebase.privateKey': 'private-key',
    });

    provider.onModuleInit();
    await provider.send('token-1', 'Title', 'Body', { ticketId: 'ticket-1' });

    expect(cert).toHaveBeenCalledWith({
      projectId: 'project-1',
      clientEmail: 'firebase@example.com',
      privateKey: 'private-key',
    });
    expect(initializeApp).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'token-1',
        notification: { title: 'Title', body: 'Body' },
        data: { ticketId: 'ticket-1' },
      }),
    );
  });

  it('does not initialize another Firebase app when one already exists', () => {
    (getApps as jest.Mock).mockReturnValue([{ name: '[DEFAULT]' }]);
    const provider = createProvider({
      'app.firebase.projectId': 'project-1',
      'app.firebase.clientEmail': 'firebase@example.com',
      'app.firebase.privateKey': 'private-key',
    });

    provider.onModuleInit();

    expect(initializeApp).not.toHaveBeenCalled();
  });
});
