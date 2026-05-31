import { AnomalySeverity, AnomalySource } from '@prisma-generated/client';
import { AnomalyService } from '../../src/modules/validation/anomaly.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MockPrismaProvider, MockPrismaService } from '../utils/mock-prisma';

describe('AnomalyService', () => {
  let service: AnomalyService;
  let prisma: MockPrismaService;

  beforeEach(() => {
    prisma = MockPrismaProvider.useFactory();
    service = new AnomalyService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not persist low-severity audits', async () => {
    await service.record(
      {
        eventId: 'event-1',
        anomalyScore: 0.05,
        severity: 'LOW',
        reasons: ['Passed local validation pipeline'],
        source: 'fallback',
      },
      'scan-1',
    );

    expect(prisma.anomalyFlag.create).not.toHaveBeenCalled();
  });

  it('persists medium and high audits with the mapped source', async () => {
    await service.record(
      {
        eventId: 'event-1',
        anomalyScore: 0.82,
        severity: 'HIGH',
        reasons: ['Duplicate ticket scan'],
        source: 'ml',
      },
      'scan-1',
    );

    expect(prisma.anomalyFlag.create).toHaveBeenCalledWith({
      data: {
        scanEventId: 'scan-1',
        source: AnomalySource.ML,
        severity: AnomalySeverity.HIGH,
        anomalyScore: 0.82,
        reasons: ['Duplicate ticket scan'],
      },
    });
  });

  it('swallows persistence failures so scan flow can continue', async () => {
    prisma.anomalyFlag.create.mockRejectedValueOnce(new Error('db down'));

    await expect(
      service.record(
        {
          eventId: 'event-1',
          anomalyScore: 0.5,
          severity: 'MEDIUM',
          reasons: ['Minor geographic deviation'],
          source: 'fallback',
        },
        null,
      ),
    ).resolves.toBeUndefined();

    expect(prisma.anomalyFlag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: AnomalySource.RULE_FALLBACK,
          severity: AnomalySeverity.MEDIUM,
        }),
      }),
    );
  });
});
