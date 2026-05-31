import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { WalletTransactionType, WalletTransactionStatus } from '@prisma-generated/client';
import { WalletService } from '../../src/modules/wallet/wallet.service';
import { PaymentProvider } from '../../src/modules/wallet/providers/payment.provider';
import { ConfigService } from '@nestjs/config';
import { MockPrismaProvider, MockPrismaService } from '../utils/mock-prisma';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('WalletService', () => {
  let service: WalletService;
  let prisma: MockPrismaService;
  let paymentProvider: PaymentProvider;

  const mockUserId = 'user-123';
  const mockWalletId = 'wallet-456';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        MockPrismaProvider,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => {
            if (key === 'app.wallet.minTopupAmount') return 10;
            if (key === 'app.wallet.maxTopupAmount') return 10000;
            return null;
          })},
        },
        {
          provide: PaymentProvider,
          useValue: {
            initiate: jest.fn().mockResolvedValue({ externalRef: 'ext-ref', paymentUrl: 'http://pay.url' }),
            verifyWebhookSignature: jest.fn().mockReturnValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
    prisma = module.get<PrismaService>(PrismaService) as unknown as MockPrismaService;
    paymentProvider = module.get<PaymentProvider>(PaymentProvider);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getBalance', () => {
    it('should return the wallet balance', async () => {
      prisma.wallet.findUnique.mockResolvedValueOnce({ id: mockWalletId, balance: 250 } as any);

      await expect(service.getBalance(mockUserId)).resolves.toEqual({
        balance: 250,
        currency: 'ETB',
      });
    });

    it('should throw NotFoundException if wallet is missing', async () => {
      prisma.wallet.findUnique.mockResolvedValueOnce(null);

      await expect(service.getBalance(mockUserId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('initiateTopup', () => {
    it('should reject reused idempotency keys', async () => {
      prisma.walletTransaction.findUnique.mockResolvedValueOnce({ id: 'tx-old' } as any);

      await expect(
        service.initiateTopup(mockUserId, { amount: 100, paymentMethod: 'card' }, 'idem-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject amounts outside configured bounds', async () => {
      prisma.walletTransaction.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.initiateTopup(mockUserId, { amount: 5, paymentMethod: 'card' }, 'idem-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create a pending transaction and return provider checkout URL', async () => {
      prisma.walletTransaction.findUnique.mockResolvedValueOnce(null);
      prisma.wallet.findUnique.mockResolvedValueOnce({
        id: mockWalletId,
        user: { fullName: 'Ada Lovelace', phone: '0911000000' },
      } as any);
      prisma.walletTransaction.create.mockResolvedValueOnce({
        id: 'tx-1',
        amount: 100,
        status: WalletTransactionStatus.PENDING,
      } as any);

      const result = await service.initiateTopup(
        mockUserId,
        { amount: 100, paymentMethod: 'card' },
        'idem-1',
      );

      expect(paymentProvider.initiate).toHaveBeenCalledWith(
        100,
        'card',
        'null/api/v1/webhook/payment',
        {
          firstName: 'Ada',
          lastName: 'Lovelace',
          phone: '0911000000',
        },
      );
      expect(prisma.walletTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            walletId: mockWalletId,
            status: WalletTransactionStatus.PENDING,
            idempotencyKey: 'idem-1',
          }),
        }),
      );
      expect(result.paymentUrl).toBe('http://pay.url');
    });
  });

  describe('getTransactions', () => {
    it('should return localized transactions with pagination metadata', async () => {
      prisma.wallet.findUnique.mockResolvedValueOnce({ id: mockWalletId, balance: 50 } as any);
      prisma.walletTransaction.findMany.mockResolvedValueOnce([
        {
          id: 'tx-1',
          description: { en: 'Refund', am: 'Temelash' },
        },
      ] as any);
      prisma.walletTransaction.count.mockResolvedValueOnce(1);

      const result = await service.getTransactions(
        mockUserId,
        {
          page: 2,
          limit: 5,
          sortBy: 'unknown',
          sortOrder: 'asc',
          status: WalletTransactionStatus.COMPLETED,
        } as any,
        'am',
      );

      expect(prisma.walletTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            walletId: mockWalletId,
            status: WalletTransactionStatus.COMPLETED,
          }),
          skip: 5,
          take: 5,
          orderBy: { createdAt: 'asc' },
        }),
      );
      expect(result.items[0].description).toBe('Temelash');
      expect(result.meta).toEqual({ page: 2, limit: 5, total: 1, totalPages: 1 });
    });
  });

  describe('debit', () => {
    it('should throw NotFoundException if wallet is not found', async () => {
      prisma.wallet.findUnique.mockResolvedValueOnce(null);
      await expect(service.debit(prisma as any, mockUserId, 100, 'ticket-1', 'idemp-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw HttpException if balance is insufficient', async () => {
      prisma.wallet.findUnique.mockResolvedValueOnce({ id: mockWalletId, balance: 50 } as any);
      await expect(service.debit(prisma as any, mockUserId, 100, 'ticket-1', 'idemp-1')).rejects.toThrow(HttpException);
    });

    it('should deduct balance and create a transaction log', async () => {
      prisma.wallet.findUnique.mockResolvedValueOnce({ id: mockWalletId, balance: 150 } as any);
      prisma.walletTransaction.create.mockResolvedValueOnce({ id: 'tx-1' } as any);

      await service.debit(prisma as any, mockUserId, 100, 'ticket-1', 'idemp-1');

      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: mockWalletId },
        data: { balance: 50 }, // 150 - 100
      });
      expect(prisma.walletTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: WalletTransactionType.TICKET_PURCHASE,
            status: WalletTransactionStatus.COMPLETED,
            amount: 100,
            balanceAfter: 50,
          }),
        }),
      );
    });
  });

  describe('credit', () => {
    it('should throw NotFoundException if wallet is not found', async () => {
      prisma.wallet.findUnique.mockResolvedValueOnce(null);
      await expect(service.credit(prisma as any, mockUserId, 100, 'ticket-1', { en: 'Refund', am: '' })).rejects.toThrow(NotFoundException);
    });

    it('should add balance and create a refund transaction log', async () => {
      prisma.wallet.findUnique.mockResolvedValueOnce({ id: mockWalletId, balance: 50 } as any);
      prisma.walletTransaction.create.mockResolvedValueOnce({ id: 'tx-1' } as any);

      await service.credit(prisma as any, mockUserId, 100, 'ticket-1', { en: 'Refund', am: '' });

      expect(prisma.wallet.update).toHaveBeenCalledWith({
        where: { id: mockWalletId },
        data: { balance: 150 }, // 50 + 100
      });
      expect(prisma.walletTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: WalletTransactionType.REFUND,
            status: WalletTransactionStatus.COMPLETED,
            amount: 100,
            balanceAfter: 150,
          }),
        }),
      );
    });
  });

  describe('processWebhook', () => {
    it('should reject missing or invalid signatures', async () => {
      const rawBody = Buffer.from('{}');

      await expect(service.processWebhook(rawBody, undefined)).rejects.toThrow(BadRequestException);

      jest.spyOn(paymentProvider, 'verifyWebhookSignature').mockReturnValueOnce(false);
      await expect(service.processWebhook(rawBody, 'bad-sig')).rejects.toThrow(BadRequestException);
    });

    it('should update transaction and balance if payment is successful', async () => {
      const payload = { status: 'success', tx_ref: 'ext-ref' };
      const rawBody = Buffer.from(JSON.stringify(payload));
      
      prisma.walletTransaction.findFirst.mockResolvedValueOnce({
        id: 'tx-1',
        walletId: mockWalletId,
        amount: 100,
        status: WalletTransactionStatus.PENDING,
      } as any);

      // Inner transaction mock responses
      prisma.wallet.findUniqueOrThrow.mockResolvedValueOnce({ id: mockWalletId, balance: 50 } as any);

      await service.processWebhook(rawBody, 'valid-sig');

      expect(paymentProvider.verifyWebhookSignature).toHaveBeenCalledWith(rawBody, 'valid-sig');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.wallet.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { balance: 150 },
        }),
      );
      expect(prisma.walletTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tx-1' },
          data: expect.objectContaining({ status: WalletTransactionStatus.COMPLETED }),
        }),
      );
    });

    it('should ignore unknown or already-completed provider references', async () => {
      const rawBody = Buffer.from(JSON.stringify({ status: 'success', tx_ref: 'missing' }));

      prisma.walletTransaction.findFirst.mockResolvedValueOnce(null);
      await service.processWebhook(rawBody, 'valid-sig');
      expect(prisma.$transaction).not.toHaveBeenCalled();

      prisma.walletTransaction.findFirst.mockResolvedValueOnce({
        id: 'tx-1',
        status: WalletTransactionStatus.COMPLETED,
      } as any);
      await service.processWebhook(rawBody, 'valid-sig');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should mark pending transactions as failed when provider status is not successful', async () => {
      const rawBody = Buffer.from(JSON.stringify({ status: 'failed', tx_ref: 'ext-ref' }));
      prisma.walletTransaction.findFirst.mockResolvedValueOnce({
        id: 'tx-1',
        status: WalletTransactionStatus.PENDING,
      } as any);

      await service.processWebhook(rawBody, 'valid-sig');

      expect(prisma.walletTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tx-1' },
          data: expect.objectContaining({ status: WalletTransactionStatus.FAILED }),
        }),
      );
    });
  });
});
