import { Test, TestingModule } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { TicketStatus, TripStatus } from '@prisma-generated/client';
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

    it('should export trips correctly', async () => {
      prisma.trip.findMany.mockResolvedValueOnce([
        {
          id: 'trip-1',
          routeId: 'route-1',
          driverId: 'driver-1',
          busIdentifier: 'BUS-1',
          status: TripStatus.COMPLETED,
        },
      ] as any);

      const result = await service.exportReport({ format: 'csv', type: 'trips' });

      expect(result.filename).toMatch(/trips-report-.*\.csv/);
      expect(result.content).toContain('trip-1,route-1,driver-1,BUS-1,COMPLETED');
    });

    it('should export anomalies and reject unknown export types', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        { ticketId: 'ticket-1', drivers: ['driver-1', 'driver-2'], scannedAt: [new Date()] },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          ticketId: 'ticket-2',
          passengerId: 'passenger-1',
          usedAt: new Date(),
          expiresAt: new Date(Date.now() - 1000),
        },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([
        { driverId: 'driver-3', totalScans: 20n, failureCount: 5n, failureRate: 0.25 },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([{ passengerId: 'passenger-2', maxScansInWindow: 4n }]);

      const result = await service.exportReport({ format: 'csv', type: 'anomalies' });

      expect(result.content).toContain('CROSS_DEVICE_DUPLICATE');
      expect(result.content).toContain('HIGH_FAILURE_RATE');

      await expect(service.exportReport({ format: 'csv', type: 'unknown' } as any)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('getRevenue', () => {
    it('should aggregate totals by route and day', async () => {
      prisma.ticket.aggregate.mockResolvedValueOnce({ _sum: { fareAmount: 1250 } } as any);
      prisma.$queryRaw.mockResolvedValueOnce([
        { routeId: 'route-1', routeNumber: 'R1', routeName: 'Route 1', revenue: 1000n },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([{ date: '2026-05-30', revenue: 250n }]);

      const result = await service.getRevenue({ fromDate: '2026-05-01', toDate: '2026-05-31' });

      expect(result.total).toBe(1250);
      expect(result.byRoute).toEqual([
        { routeId: 'route-1', routeNumber: 'R1', routeName: 'Route 1', revenue: 1000 },
      ]);
      expect(result.byDay).toEqual([{ date: '2026-05-30', revenue: 250 }]);
    });
  });

  describe('getTickets', () => {
    it('should aggregate ticket usage stats', async () => {
      prisma.ticket.count.mockResolvedValueOnce(8);
      (prisma.ticket.groupBy as jest.Mock).mockResolvedValueOnce([
        { status: TicketStatus.USED, _count: { id: 5 } },
        { status: TicketStatus.EXPIRED, _count: { id: 3 } },
      ] as any);
      prisma.$queryRaw.mockResolvedValueOnce([
        { routeId: 'route-1', routeNumber: 'R1', routeName: 'Route 1', count: 8n },
      ]);
      prisma.ticket.aggregate.mockResolvedValueOnce({ _avg: { fareAmount: 16.7 } } as any);

      const result = await service.getTickets({ routeId: 'route-1' });

      expect(result.total).toBe(8);
      expect(result.byStatus).toEqual([
        { status: TicketStatus.USED, count: 5 },
        { status: TicketStatus.EXPIRED, count: 3 },
      ]);
      expect(result.byRoute[0].count).toBe(8);
      expect(result.averageFare).toBe(17);
    });
  });

  describe('getTrips', () => {
    it('should aggregate trip stats by status, route, and driver', async () => {
      prisma.trip.count.mockResolvedValueOnce(3);
      (prisma.trip.groupBy as jest.Mock).mockResolvedValueOnce([
        { status: TripStatus.COMPLETED, _count: { id: 2 } },
        { status: TripStatus.CANCELLED, _count: { id: 1 } },
      ] as any);
      prisma.$queryRaw.mockResolvedValueOnce([
        { routeId: 'route-1', routeNumber: 'R1', routeName: 'Route 1', count: 3n },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([{ driverId: 'driver-1', driverName: 'Ada', count: 3n }]);

      const result = await service.getTrips({ routeId: 'route-1', driverId: 'driver-1' });

      expect(result.total).toBe(3);
      expect(result.byStatus).toEqual([
        { status: TripStatus.COMPLETED, count: 2 },
        { status: TripStatus.CANCELLED, count: 1 },
      ]);
      expect(result.byRoute[0].count).toBe(3);
      expect(result.byDriver).toEqual([{ driverId: 'driver-1', driverName: 'Ada', count: 3 }]);
    });
  });

  describe('getAnomalies', () => {
    it('should combine anomaly query results and paginate them', async () => {
      prisma.$queryRaw.mockResolvedValueOnce([
        { ticketId: 'ticket-1', drivers: ['driver-1', 'driver-2'], scannedAt: [new Date()] },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          ticketId: 'ticket-2',
          passengerId: 'passenger-1',
          usedAt: new Date(),
          expiresAt: new Date(Date.now() - 1000),
        },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([
        { driverId: 'driver-3', totalScans: 20n, failureCount: 5n, failureRate: 0.25 },
      ]);
      prisma.$queryRaw.mockResolvedValueOnce([{ passengerId: 'passenger-2', maxScansInWindow: 4n }]);

      const result = await service.getAnomalies({ page: 1, limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.items[0]).toMatchObject({ type: 'CROSS_DEVICE_DUPLICATE', severity: 'HIGH' });
      expect(result.meta).toEqual({ page: 1, limit: 2, total: 4, totalPages: 2 });
    });
  });
});
