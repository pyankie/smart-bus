import { ConfigService } from '@nestjs/config';
import { ScanResult, TripStatus, UserStatus } from '@prisma-generated/client';
import { MlService } from '../../src/modules/ml/ml.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MockPrismaProvider, MockPrismaService } from '../utils/mock-prisma';
import { ScanAnomalyRequestDto } from '../../src/modules/ml/dto/scan-anomaly.dto';

describe('MlService', () => {
  let prisma: MockPrismaService;
  const originalFetch = global.fetch;

  const createService = (values: Record<string, unknown>) =>
    new MlService(
      {
        get: jest.fn((key: string) => values[key]),
      } as unknown as ConfigService,
      prisma as unknown as PrismaService,
    );

  const anomalyPayload: ScanAnomalyRequestDto = {
    eventId: 'scan-1',
    result: ScanResult.VALID,
    isOffline: false,
    scannedAt: '2026-06-01T08:00:00Z',
    syncedAt: '2026-06-01T08:00:01Z',
    syncDelaySeconds: 1,
    scanMetadata: { latitude: 9.1, longitude: 38.8, deviceId: 'device-1' },
    ticketContext: {
      ticketId: 'ticket-1',
      passengerId: 'passenger-1',
      fareAmount: 20,
      purchasedAt: '2026-06-01T07:00:00Z',
      expiresAt: '2026-06-01T09:00:00Z',
      qrSignatureValid: true,
    },
    boardingStop: { id: 'stop-1', latitude: 9.1, longitude: 38.8 },
  };

  beforeEach(() => {
    prisma = MockPrismaProvider.useFactory();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('uses Prisma fallback route suggestions when ML is disabled', async () => {
    const service = createService({ 'app.ml.enabled': false });
    prisma.user.findMany.mockResolvedValueOnce([
      { id: 'driver-1', fullName: 'Ada', status: UserStatus.ACTIVE },
      { id: 'driver-2', fullName: 'Ben', status: UserStatus.DISABLED },
    ] as any);
    (prisma.trip.groupBy as jest.Mock).mockResolvedValueOnce([
      { driverId: 'driver-1', status: TripStatus.COMPLETED, _count: { _all: 8 } },
      { driverId: 'driver-1', status: TripStatus.CANCELLED, _count: { _all: 2 } },
    ] as any);

    const result = await service.getRouteAssignmentSuggestions({
      routeId: 'route-1',
      scheduledFor: '2026-06-01T08:00:00Z',
      candidateDriverIds: ['driver-1', 'driver-2'],
    });

    expect(result.source).toBe('fallback');
    expect(result.suggestions).toEqual([
      expect.objectContaining({ driverId: 'driver-1', confidence: 0.84 }),
      expect.objectContaining({ driverId: 'driver-2', confidence: 0 }),
    ]);
  });

  it('enriches route assignment requests and maps successful ML responses', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        routeId: 'route-1',
        suggestions: [{ driverId: 'driver-1', driverName: 'Ada', confidence: 0.91, reasons: ['ML rank'] }],
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = createService({
      'app.ml.enabled': true,
      'app.ml.serviceUrl': 'https://ml.test',
      'app.ml.routeTimeoutMs': 500,
      'app.ml.token': 'internal-token',
    });
    prisma.route.findUnique.mockResolvedValueOnce({
      estimatedDuration: 30,
      estimatedDistance: 12000,
      stops: [{ id: 'stop-1' }, { id: 'stop-2' }],
    } as any);
    prisma.user.findMany.mockResolvedValueOnce([
      { id: 'driver-1', fullName: 'Ada', status: UserStatus.ACTIVE },
    ] as any);
    (prisma.trip.groupBy as jest.Mock).mockResolvedValueOnce([
      { driverId: 'driver-1', status: TripStatus.COMPLETED, _count: { _all: 4 } },
    ] as any);

    const result = await service.getRouteAssignmentSuggestions({
      routeId: 'route-1',
      scheduledFor: '2026-06-01T08:00:00Z',
      candidateDriverIds: ['driver-1'],
    });

    expect(result.source).toBe('ml');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ml.test/api/v1/ml/route-assignment',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Internal-Token': 'internal-token' }),
        body: expect.stringContaining('inlineDriverProfiles'),
      }),
    );
  });

  it('falls back to anomaly rules when ML is disabled', async () => {
    const service = createService({ 'app.ml.enabled': false });

    const result = await service.detectScanAnomaly({
      ...anomalyPayload,
      result: ScanResult.ALREADY_USED,
      isOffline: true,
      syncDelaySeconds: 200_000,
      scanMetadata: { latitude: 9.9, longitude: 39.9, deviceId: 'device-1' },
    });

    expect(result.source).toBe('fallback');
    expect(result.severity).toBe('HIGH');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Duplicate ticket scan'),
        expect.stringContaining('Extreme offline sync delay'),
      ]),
    );
  });

  it('maps successful ML anomaly responses and falls back when ML returns an error', async () => {
    const service = createService({
      'app.ml.enabled': true,
      'app.ml.serviceUrl': 'https://ml.test',
      'app.ml.anomalyTimeoutMs': 500,
    });

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        eventId: 'scan-1',
        anomalyScore: 0.2,
        severity: 'LOW',
        reasons: ['ML clear'],
      }),
    }) as unknown as typeof fetch;

    await expect(service.detectScanAnomaly(anomalyPayload)).resolves.toMatchObject({
      source: 'ml',
      severity: 'LOW',
    });

    global.fetch = jest.fn().mockResolvedValueOnce({ ok: false, status: 503 }) as unknown as typeof fetch;

    await expect(service.detectScanAnomaly(anomalyPayload)).resolves.toMatchObject({
      source: 'fallback',
      severity: 'LOW',
    });
  });
});
