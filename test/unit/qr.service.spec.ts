import { ConfigService } from '@nestjs/config';
import { QrService, QrPayloadData } from '../../src/modules/tickets/qr.service';

describe('QrService', () => {
  const payload: QrPayloadData = {
    ticketId: 'ticket-1',
    passengerId: 'passenger-1',
    routeId: 'route-1',
    boardingStopId: 'stop-1',
    dropoffStopId: 'stop-2',
    fareAmount: 25,
    expiresAt: new Date('2026-06-01T10:00:00Z').toISOString(),
    issuedAt: new Date('2026-06-01T09:00:00Z').toISOString(),
  };

  it('signs and verifies a QR payload', () => {
    const service = new QrService({ get: jest.fn().mockReturnValue('qr-secret') } as unknown as ConfigService);

    const signed = service.sign(payload);

    expect(JSON.parse(signed.payload)).toEqual(payload);
    expect(service.verify(signed.payload, signed.signature)).toBe(true);
  });

  it('rejects tampered or malformed signatures', () => {
    const service = new QrService({ get: jest.fn().mockReturnValue('qr-secret') } as unknown as ConfigService);
    const signed = service.sign(payload);

    expect(service.verify(`${signed.payload}x`, signed.signature)).toBe(false);
    expect(service.verify(signed.payload, 'not-hex')).toBe(false);
  });

  it('throws when QR signing secret is missing', () => {
    expect(() => new QrService({ get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService)).toThrow(
      'QR_SIGNING_SECRET is not configured',
    );
  });
});
