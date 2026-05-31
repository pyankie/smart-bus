import { Test, TestingModule } from '@nestjs/testing';
import { ScanResult, TicketStatus } from '@prisma-generated/client';
import { SyncService } from '../../src/modules/sync/sync.service';
import { QrService } from '../../src/modules/tickets/qr.service';
import { MockPrismaProvider, MockPrismaService } from '../utils/mock-prisma';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('SyncService', () => {
  let service: SyncService;
  let prisma: MockPrismaService;
  let qrService: QrService;

  const mockDriverId = 'driver-123';
  const mockTicketId = 'ticket-456';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        MockPrismaProvider,
        {
          provide: QrService,
          useValue: {
            verify: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('secret') },
        },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
    prisma = module.get<PrismaService>(PrismaService) as unknown as MockPrismaService;
    qrService = module.get<QrService>(QrService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('reconcile', () => {
    it('should handle invalid signature gracefully', async () => {
      jest.spyOn(qrService, 'verify').mockReturnValueOnce(false);

      const dto = {
        scans: [
          {
            qrPayload: 'invalid_payload',
            qrSignature: 'bad_sig',
            scannedAt: new Date().toISOString(),
          },
        ],
      };

      const result = await service.reconcile(mockDriverId, dto);
      expect(result.failed).toBe(1);
      expect(result.processed).toBe(0);
      expect(result.results[0].action).toBe('INVALID');
    });

    it('should handle malformed JSON payload', async () => {
      jest.spyOn(qrService, 'verify').mockReturnValueOnce(true);

      const dto = {
        scans: [
          {
            qrPayload: 'not_json',
            qrSignature: 'sig',
            scannedAt: new Date().toISOString(),
          },
        ],
      };

      const result = await service.reconcile(mockDriverId, dto);
      expect(result.failed).toBe(1);
      expect(result.results[0].action).toBe('INVALID');
    });

    it('should return INVALID if ticket is not found in DB', async () => {
      jest.spyOn(qrService, 'verify').mockReturnValueOnce(true);
      prisma.ticket.findUnique.mockResolvedValueOnce(null);

      const payload = JSON.stringify({ ticketId: mockTicketId });
      const dto = {
        scans: [
          {
            qrPayload: payload,
            qrSignature: 'sig',
            scannedAt: new Date().toISOString(),
          },
        ],
      };

      const result = await service.reconcile(mockDriverId, dto);
      expect(result.failed).toBe(1);
      expect(result.results[0].action).toBe('INVALID');
    });

    it('should skip idempotent scans', async () => {
      jest.spyOn(qrService, 'verify').mockReturnValueOnce(true);
      prisma.ticket.findUnique.mockResolvedValueOnce({
        id: mockTicketId,
        status: TicketStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 100000),
        passengerId: 'user-1',
        fareAmount: 15,
      } as any);

      // Simulate existing scan event
      prisma.scanEvent.findFirst.mockResolvedValueOnce({ result: ScanResult.VALID } as any);

      const payload = JSON.stringify({ ticketId: mockTicketId });
      const dto = {
        scans: [
          {
            qrPayload: payload,
            qrSignature: 'sig',
            scannedAt: new Date().toISOString(),
          },
        ],
      };

      const result = await service.reconcile(mockDriverId, dto);
      expect(result.processed).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.results[0].action).toBe('IDEMPOTENT_SKIP');
    });

    it('should process EXPIRED ticket properly', async () => {
      jest.spyOn(qrService, 'verify').mockReturnValueOnce(true);
      const scannedAtDate = new Date();
      prisma.ticket.findUnique.mockResolvedValueOnce({
        id: mockTicketId,
        status: TicketStatus.ACTIVE,
        expiresAt: new Date(scannedAtDate.getTime() - 100000), // expired before scan
        passengerId: 'user-1',
        fareAmount: 15,
      } as any);

      prisma.scanEvent.findFirst.mockResolvedValueOnce(null);
      prisma.trip.findFirst.mockResolvedValueOnce({ id: 'trip-1' } as any);

      const payload = JSON.stringify({ ticketId: mockTicketId });
      const dto = {
        scans: [
          {
            qrPayload: payload,
            qrSignature: 'sig',
            scannedAt: scannedAtDate.toISOString(),
          },
        ],
      };

      const result = await service.reconcile(mockDriverId, dto);
      expect(result.processed).toBe(1);
      expect(result.results[0].action).toBe('EXPIRED');
      expect(prisma.scanEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: ScanResult.EXPIRED,
          }),
        }),
      );
    });

    it('should process ALREADY_USED_SERVER_WINS correctly', async () => {
      jest.spyOn(qrService, 'verify').mockReturnValueOnce(true);
      const scannedAtDate = new Date();
      
      prisma.ticket.findUnique.mockResolvedValueOnce({
        id: mockTicketId,
        status: TicketStatus.USED,
        expiresAt: new Date(scannedAtDate.getTime() + 100000),
        usedAt: new Date(scannedAtDate.getTime() - 10000), // Used earlier on server
        passengerId: 'user-1',
        fareAmount: 15,
      } as any);

      prisma.scanEvent.findFirst.mockResolvedValueOnce(null); // No idempotent scan
      prisma.trip.findFirst.mockResolvedValueOnce({ id: 'trip-1' } as any);
      
      // cross device mock
      prisma.scanEvent.findFirst.mockResolvedValueOnce(null); 

      const payload = JSON.stringify({ ticketId: mockTicketId });
      const dto = {
        scans: [
          {
            qrPayload: payload,
            qrSignature: 'sig',
            scannedAt: scannedAtDate.toISOString(),
          },
        ],
      };

      const result = await service.reconcile(mockDriverId, dto);
      expect(result.processed).toBe(1);
      expect(result.results[0].action).toBe('ALREADY_USED_SERVER_WINS');
      expect(prisma.scanEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: ScanResult.ALREADY_USED,
          }),
        }),
      );
    });

    it('should process ALREADY_USED_OFFLINE_WINS correctly', async () => {
      jest.spyOn(qrService, 'verify').mockReturnValueOnce(true);
      const scannedAtDate = new Date(Date.now() - 20000); // 20 secs ago
      
      prisma.ticket.findUnique.mockResolvedValueOnce({
        id: mockTicketId,
        status: TicketStatus.USED,
        expiresAt: new Date(scannedAtDate.getTime() + 100000),
        usedAt: new Date(), // Used now on server (later than scan)
        passengerId: 'user-1',
        fareAmount: 15,
      } as any);

      prisma.scanEvent.findFirst.mockResolvedValueOnce(null); // No idempotent scan
      prisma.trip.findFirst.mockResolvedValueOnce({ id: 'trip-1' } as any);
      
      // cross device mock
      prisma.scanEvent.findFirst.mockResolvedValueOnce(null); 

      const payload = JSON.stringify({ ticketId: mockTicketId });
      const dto = {
        scans: [
          {
            qrPayload: payload,
            qrSignature: 'sig',
            scannedAt: scannedAtDate.toISOString(),
          },
        ],
      };

      const result = await service.reconcile(mockDriverId, dto);
      expect(result.processed).toBe(1);
      expect(result.results[0].action).toBe('ALREADY_USED_OFFLINE_WINS');
      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { usedAt: scannedAtDate },
        }),
      );
    });

    it('should mark unused ticket as MARKED_USED and handle REFUNDED rollback', async () => {
      jest.spyOn(qrService, 'verify').mockReturnValueOnce(true);
      const scannedAtDate = new Date();
      
      prisma.ticket.findUnique.mockResolvedValueOnce({
        id: mockTicketId,
        status: TicketStatus.REFUNDED,
        expiresAt: new Date(scannedAtDate.getTime() + 100000),
        usedAt: null,
        passengerId: 'user-1',
        fareAmount: 15,
      } as any);

      prisma.scanEvent.findFirst.mockResolvedValueOnce(null); // No idempotent scan
      prisma.trip.findFirst.mockResolvedValueOnce({ id: 'trip-1' } as any);

      const payload = JSON.stringify({ ticketId: mockTicketId });
      const dto = {
        scans: [
          {
            qrPayload: payload,
            qrSignature: 'sig',
            scannedAt: scannedAtDate.toISOString(),
          },
        ],
      };

      const result = await service.reconcile(mockDriverId, dto);
      expect(result.processed).toBe(1);
      expect(result.results[0].action).toBe('MARKED_USED');
      expect(prisma.$transaction).toHaveBeenCalled(); // Since status was REFUNDED
      expect(prisma.scanEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: ScanResult.VALID,
          }),
        }),
      );
    });
  });
});
