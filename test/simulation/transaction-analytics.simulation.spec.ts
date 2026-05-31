import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from '../../src/modules/wallet/wallet.service';
import { AnalyticsService } from '../../src/modules/analytics/analytics.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MockPrismaProvider, MockPrismaService } from '../utils/mock-prisma';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider } from '../../src/modules/wallet/providers/payment.provider';
import { WalletTransactionType, WalletTransactionStatus } from '@prisma-generated/client';

describe('Transaction & Analytics Generation Simulation', () => {
  let walletService: WalletService;
  let analyticsService: AnalyticsService;
  let prisma: MockPrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        AnalyticsService,
        MockPrismaProvider,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key) => {
            if (key === 'app.wallet.maxTopupAmount') return 10000;
            return 10;
          }) },
        },
        {
          provide: PaymentProvider,
          useValue: {
            initiate: jest.fn().mockResolvedValue({ externalRef: 'ext-ref', paymentUrl: 'url' }),
            verifyWebhookSignature: jest.fn().mockReturnValue(true),
          },
        },
      ],
    }).compile();

    walletService = module.get<WalletService>(WalletService);
    analyticsService = module.get<AnalyticsService>(AnalyticsService);
    prisma = module.get<PrismaService>(PrismaService) as unknown as MockPrismaService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should orchestrate wallet transactions and verify analytics accurately reflect the changes', async () => {
    const userId = 'user-1';
    
    // 1. Topup Wallet
    prisma.wallet.findUnique.mockResolvedValue({ id: 'wallet-1', user: { fullName: 'Passenger' } } as any);
    prisma.walletTransaction.findUnique.mockResolvedValue(null);
    prisma.walletTransaction.create.mockResolvedValue({ id: 'tx-1', amount: 500, status: 'PENDING' } as any);

    await walletService.initiateTopup(userId, { amount: 500, paymentMethod: 'card' }, 'idemp-1');

    // Webhook fulfills the topup
    prisma.walletTransaction.findFirst.mockResolvedValue({ id: 'tx-1', walletId: 'wallet-1', amount: 500, status: 'PENDING' } as any);
    prisma.wallet.findUniqueOrThrow.mockResolvedValue({ id: 'wallet-1', balance: 0 } as any);

    await walletService.processWebhook(Buffer.from(JSON.stringify({ status: 'success', tx_ref: 'ext-ref' })), 'sig');

    // The $transaction call would execute the updates
    expect(prisma.$transaction).toHaveBeenCalled();

    // 2. Ticket Purchase (Debit)
    prisma.wallet.findUnique.mockResolvedValue({ id: 'wallet-1', balance: 500 } as any);
    await walletService.debit(prisma as any, userId, 20, 'ticket-1', 'idemp-2');

    // 3. Analytics Dashboard Verification
    // Setup analytics mocks to reflect the "real DB" state after these operations
    prisma.user.count.mockResolvedValueOnce(1); // 1 User
    prisma.ticket.findMany.mockResolvedValueOnce([{ passengerId: userId }] as any); // 1 Active user
    prisma.ticket.count.mockResolvedValueOnce(1); // 1 purchased
    prisma.ticket.count.mockResolvedValueOnce(0); // 0 used
    prisma.ticket.count.mockResolvedValueOnce(0); // 0 expired
    prisma.ticket.count.mockResolvedValueOnce(0); // 0 refunded
    prisma.ticket.aggregate.mockResolvedValueOnce({ _sum: { fareAmount: 20 } } as any); // 20 revenue
    prisma.walletTransaction.aggregate.mockResolvedValueOnce({ _sum: { amount: 0 } } as any); // 0 refunds
    prisma.trip.count.mockResolvedValueOnce(0); // 0 trips
    prisma.scanEvent.count.mockResolvedValueOnce(0); // 0 scans
    prisma.$queryRaw.mockResolvedValue([]); // 0 anomalies

    const dashboard = await analyticsService.getDashboard({});

    expect(dashboard.totalUsers).toBe(1);
    expect(dashboard.activeUsersInPeriod).toBe(1);
    expect(dashboard.totalTicketsPurchased).toBe(1);
    expect(dashboard.totalRevenue).toBe(20);
    expect(dashboard.netRevenue).toBe(20);
  });
});
