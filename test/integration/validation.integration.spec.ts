import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { ValidationModule } from '../../src/modules/validation/validation.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MockPrismaProvider, MockPrismaService } from '../utils/mock-prisma';
import { QrService } from '../../src/modules/tickets/qr.service';
import { TripsService } from '../../src/modules/trips/trips.service';
import { MlService } from '../../src/modules/ml/ml.service';
import { AnomalyService } from '../../src/modules/validation/anomaly.service';

describe('ValidationController (Integration)', () => {
  let app: INestApplication;
  let prisma: MockPrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), ValidationModule],
    })
      .overrideProvider(PrismaService)
      .useValue(MockPrismaProvider.useFactory())
      .overrideProvider(ConfigService)
      .useValue({ get: jest.fn().mockReturnValue(undefined) })
      .overrideProvider(QrService)
      .useValue({ verify: jest.fn().mockReturnValue(true) })
      .overrideProvider(TripsService)
      .useValue({ getActiveTrip: jest.fn().mockResolvedValue({ id: 'trip-1' }) })
      .overrideProvider(MlService)
      .useValue({ detectScanAnomaly: jest.fn().mockResolvedValue(null) })
      .overrideProvider(AnomalyService)
      .useValue({ record: jest.fn().mockResolvedValue(undefined) })
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

  describe('POST /tickets/validate', () => {
    it('should validate ticket and return 201 Created on success', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        id: 'ticket-1',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 10000),
        route: { name: { en: 'Test Route' } },
        boardingStop: { name: { en: 'Stop A' } },
        dropoffStop: { name: { en: 'Stop B' } },
      } as any);

      prisma.ticket.updateMany.mockResolvedValue({ count: 1 } as any);
      prisma.scanEvent.create.mockResolvedValue({ id: 'scan-1' } as any);

      const response = await request(app.getHttpServer())
        .post('/tickets/validate')
        .send({
          qrPayload: JSON.stringify({ ticketId: 'ticket-1' }),
          qrSignature: 'sig',
          latitude: 10,
          longitude: 20,
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('result', 'VALID');
    });

    it('should return 409 Conflict if ticket is already used', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        id: 'ticket-1',
        status: 'USED',
        expiresAt: new Date(Date.now() + 10000),
        route: { name: { en: 'Test Route' } },
        boardingStop: { name: { en: 'Stop A' } },
        dropoffStop: { name: { en: 'Stop B' } },
      } as any);

      const response = await request(app.getHttpServer())
        .post('/tickets/validate')
        .send({
          qrPayload: JSON.stringify({ ticketId: 'ticket-1' }),
          qrSignature: 'sig',
          latitude: 10,
          longitude: 20,
        });

      expect(response.status).toBe(409);
    });

    it('should return 410 Gone if ticket is expired', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        id: 'ticket-1',
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() - 10000), // Expired
        route: { name: { en: 'Test Route' } },
        boardingStop: { name: { en: 'Stop A' } },
        dropoffStop: { name: { en: 'Stop B' } },
      } as any);

      const response = await request(app.getHttpServer())
        .post('/tickets/validate')
        .send({
          qrPayload: JSON.stringify({ ticketId: 'ticket-1' }),
          qrSignature: 'sig',
          latitude: 10,
          longitude: 20,
        });

      expect(response.status).toBe(410);
    });
  });
});
