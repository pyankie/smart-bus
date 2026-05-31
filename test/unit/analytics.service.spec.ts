import { Test, TestingModule } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { AnalyticsService } from '../../src/modules/analytics/analytics.service';
import { MockPrismaProvider, MockPrismaService } from '../utils/mock-prisma';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        MockPrismaProvider,
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    prisma = module.get<PrismaService>(PrismaService) as unknown as MockPrismaService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboard', () => {
    it('should calculate dashboard metrics correctly', async () => {
      prisma.user.count.mockResolvedValueOnce(100);
      prisma.ticket.findMany.mockResolvedValueOnce([{ passengerId: 'user-1' }, { passengerId: 'user-2' }] as any);
      prisma.ticket.count.mockResolvedValueOnce(50); // totalPurchased
      prisma.ticket.count.mockResolvedValueOnce(20); // totalUsed
      prisma.ticket.count.mockResolvedValueOnce(5);  // totalExpired
      prisma.ticket.count.mockResolvedValueOnce(2);  // totalRefunded
      prisma.ticket.aggregate.mockResolvedValueOnce({ _sum: { fareAmount: 1000 } } as any); // revenue
      prisma.walletTransaction.aggregate.mockResolvedValueOnce({ _sum: { amount: 100 } } as any); // refunds
      prisma.trip.count.mockResolvedValueOnce(10);
      prisma.scanEvent.count.mockResolvedValueOnce(30);
      
      // Mocks for detectAnomalies
      prisma.$queryRaw.mockResolvedValueOnce([]); // queryCrossDeviceDuplicates
      prisma.$queryRaw.mockResolvedValueOnce([]); // queryExpiredTicketUse
      prisma.$queryRaw.mockResolvedValueOnce([]); // queryHighFailureDrivers
      prisma.$queryRaw.mockResolvedValueOnce([]); // queryRapidRepeatScans

      const result = await service.getDashboard({});

      expect(result.totalUsers).toBe(100);
      expect(result.activeUsersInPeriod).toBe(2);
      expect(result.totalTicketsPurchased).toBe(50);
      expect(result.totalRevenue).toBe(1000);
      expect(result.netRevenue).toBe(900);
    });
  });

  describe('exportReport', () => {
    it('should throw UnprocessableEntityException for non-csv formats', async () => {
      await expect(service.exportReport({ format: 'pdf', type: 'tickets' } as any)).rejects.toThrow(UnprocessableEntityException);
    });

    it('should export tickets correctly', async () => {
      prisma.ticket.findMany.mockResolvedValueOnce([
        { id: '1', passengerId: 'p1', routeId: 'r1', status: 'USED', fareAmount: 15 },
      ] as any);

      const result = await service.exportReport({ format: 'csv', type: 'tickets' });
      expect(result.filename).toMatch(/tickets-report-.*\.csv/);
      expect(result.content).toContain('id,passengerId,routeId,status,fareAmount');
      expect(result.content).toContain('1,p1,r1,USED,15');
    });

    it('should export revenue correctly', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        { date: '2026-05-30', routeId: 'r1', routeNumber: '1', routeName: 'Route 1', revenue: 1000n },
      ]);

      const result = await service.exportReport({ format: 'csv', type: 'revenue' });
      expect(result.content).toContain('date,routeId,routeNumber,routeName,revenue');
      expect(result.content).toContain('2026-05-30,r1,1,Route 1,1000');
    });
  });
});
