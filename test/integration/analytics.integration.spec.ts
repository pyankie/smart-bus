import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AnalyticsModule } from '../../src/modules/analytics/analytics.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MockPrismaProvider, MockPrismaService } from '../utils/mock-prisma';

describe('AnalyticsController (Integration)', () => {
  let app: INestApplication;
  let prisma: MockPrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AnalyticsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(MockPrismaProvider.useFactory())
      .overrideProvider(ConfigService)
      .useValue({ get: jest.fn().mockReturnValue(undefined) })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    app.use((req: any, res: any, next: any) => {
      req.user = { sub: 'admin-123', role: 'ADMIN' };
      next();
    });

    await app.init();
    prisma = moduleFixture.get<PrismaService>(PrismaService) as unknown as MockPrismaService;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('GET /admin/analytics/dashboard', () => {
    it('should return 200 with dashboard data', async () => {
      prisma.user.count.mockResolvedValue(100);
      prisma.ticket.findMany.mockResolvedValue([]);
      prisma.ticket.count.mockResolvedValue(50);
      prisma.ticket.aggregate.mockResolvedValue({ _sum: { fareAmount: 1000 } } as any);
      prisma.walletTransaction.aggregate.mockResolvedValue({ _sum: { amount: 100 } } as any);
      prisma.trip.count.mockResolvedValue(10);
      prisma.scanEvent.count.mockResolvedValue(30);
      prisma.$queryRaw.mockResolvedValue([]);

      const response = await request(app.getHttpServer()).get('/admin/analytics/dashboard');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalUsers', 100);
      expect(response.body).toHaveProperty('netRevenue', 900);
    });
  });
});
