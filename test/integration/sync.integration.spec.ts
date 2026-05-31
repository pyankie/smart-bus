import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { SyncModule } from '../../src/modules/sync/sync.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MockPrismaProvider, MockPrismaService } from '../utils/mock-prisma';
import { QrService } from '../../src/modules/tickets/qr.service';

describe('SyncController (Integration)', () => {
  let app: INestApplication;
  let prisma: MockPrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), SyncModule],
    })
      .overrideProvider(PrismaService)
      .useValue(MockPrismaProvider.useFactory())
      .overrideProvider(ConfigService)
      .useValue({ get: jest.fn().mockReturnValue(undefined) })
      .overrideProvider(QrService)
      .useValue({ verify: jest.fn().mockReturnValue(true) })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    app.use((req: any, res: any, next: any) => {
      req.user = { sub: 'driver-123', role: 'DRIVER' };
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

  describe('POST /sync/validations', () => {
    it('should return 400 for empty batch', () => {
      return request(app.getHttpServer()).post('/sync/validations').send({ scans: [] }).expect(400); // Because class-validator requires ArrayNotEmpty
    });

    it('should process a batch of scans successfully', async () => {
      // Mock db responses to avoid throwing
      prisma.ticket.findUnique.mockResolvedValue({
        id: 'ticket-1',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 10000),
      } as any);
      prisma.trip.findFirst.mockResolvedValue({ id: 'trip-1' } as any);
      prisma.scanEvent.create.mockResolvedValue({ id: 'scan-1' } as any);

      const response = await request(app.getHttpServer())
        .post('/sync/validations')
        .send({
          scans: [
            {
              qrPayload: JSON.stringify({ ticketId: 'ticket-1' }),
              qrSignature: 'sig',
              scannedAt: new Date().toISOString(),
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totalReceived', 1);
      expect(response.body).toHaveProperty('processed', 1);
    });
  });
});
