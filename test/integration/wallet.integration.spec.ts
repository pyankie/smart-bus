import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { WalletModule } from '../../src/modules/wallet/wallet.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MockPrismaProvider, MockPrismaService } from '../utils/mock-prisma';
import { PaymentProvider } from '../../src/modules/wallet/providers/payment.provider';

const IDEMPOTENCY_KEY = '550e8400-e29b-41d4-a716-446655440000';

describe('WalletController (Integration)', () => {
  let app: INestApplication;
  let prisma: MockPrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), WalletModule],
    })
      .overrideProvider(PrismaService)
      .useValue(MockPrismaProvider.useFactory())
      .overrideProvider(PaymentProvider)
      .useValue({
        initiate: jest
          .fn()
          .mockResolvedValue({ externalRef: 'ext-ref', paymentUrl: 'http://pay.url' }),
        verifyWebhookSignature: jest.fn().mockReturnValue(true),
      })
      .overrideProvider(ConfigService)
      .useValue({
        get: jest.fn((key) => {
          if (key === 'app.wallet.minTopupAmount') return 10;
          if (key === 'app.wallet.maxTopupAmount') return 10000;
          return null;
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    app.use((req: any, res: any, next: any) => {
      req.user = { sub: 'user-123', role: 'PASSENGER' };
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

  describe('GET /wallet/balance', () => {
    it('should return 200 and balance', async () => {
      prisma.wallet.findUnique.mockResolvedValue({ id: 'w-1', balance: 500 } as any);

      const response = await request(app.getHttpServer()).get('/wallet/balance');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('balance', 500);
    });
  });

  describe('POST /wallet/topup', () => {
    it('should return 201 and payment url', async () => {
      prisma.idempotencyKey.findUnique.mockResolvedValue(null);
      prisma.idempotencyKey.create.mockResolvedValue({} as any);
      prisma.walletTransaction.findUnique.mockResolvedValue(null);
      prisma.wallet.findUnique.mockResolvedValue({
        id: 'w-1',
        user: { fullName: 'John Doe' },
      } as any);
      prisma.walletTransaction.create.mockResolvedValue({
        id: 'tx-1',
        amount: 100,
        status: 'PENDING',
      } as any);

      const response = await request(app.getHttpServer())
        .post('/wallet/topup')
        .set('Idempotency-Key', IDEMPOTENCY_KEY)
        .send({
          amount: 100,
          paymentMethod: 'card',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('paymentUrl', 'http://pay.url');
    });

    it('should return 409 if idempotency key is reused', async () => {
      prisma.idempotencyKey.findUnique.mockResolvedValue(null);
      prisma.walletTransaction.findUnique.mockResolvedValue({ id: 'tx-old' } as any);

      const response = await request(app.getHttpServer())
        .post('/wallet/topup')
        .set('Idempotency-Key', IDEMPOTENCY_KEY)
        .send({
          amount: 100,
          paymentMethod: 'card',
        });

      expect(response.status).toBe(409);
    });
  });
});
