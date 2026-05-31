import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, GoneException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ScanResult, TicketStatus } from '@prisma-generated/client';
import { ValidationService } from '../../src/modules/validation/validation.service';
import { QrService } from '../../src/modules/tickets/qr.service';
import { TripsService } from '../../src/modules/trips/trips.service';
import { MlService } from '../../src/modules/ml/ml.service';
import { AnomalyService } from '../../src/modules/validation/anomaly.service';
import { MockPrismaProvider, MockPrismaService } from '../utils/mock-prisma';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('ValidationService', () => {
  let service: ValidationService;
  let prisma: MockPrismaService;
  let qrService: QrService;
  let tripsService: TripsService;
  let mlService: MlService;
  let anomalyService: AnomalyService;

  const mockDriverId = 'driver-123';
  const mockTicketId = 'ticket-456';
  const mockTripId = 'trip-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidationService,
        MockPrismaProvider,
        {
          provide: QrService,
          useValue: {
            verify: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: TripsService,
          useValue: {
            getActiveTrip: jest.fn().mockResolvedValue({ id: mockTripId }),
          },
        },
        {
          provide: MlService,
          useValue: {
            detectScanAnomaly: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: AnomalyService,
          useValue: {
            record: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<ValidationService>(ValidationService);
    prisma = module.get<PrismaService>(PrismaService) as unknown as MockPrismaService;
    qrService = module.get<QrService>(QrService);
    tripsService = module.get<TripsService>(TripsService);
    mlService = module.get<MlService>(MlService);
    anomalyService = module.get<AnomalyService>(AnomalyService);
    
    prisma.scanEvent.create.mockResolvedValue({ id: 'scan-id' } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateTicket', () => {
    const validDto = {
      qrPayload: JSON.stringify({ ticketId: mockTicketId }),
      qrSignature: 'sig',
      latitude: 10,
      longitude: 20,
      deviceId: 'device-1',
    };

    it('should throw BadRequestException if signature is invalid', async () => {
      jest.spyOn(qrService, 'verify').mockReturnValueOnce(false);
      
      await expect(service.validateTicket(mockDriverId, validDto)).rejects.toThrow(BadRequestException);
      expect(prisma.scanEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ result: ScanResult.INVALID_SIGNATURE }),
        }),
      );
    });

    it('should throw NotFoundException if no active trip', async () => {
      jest.spyOn(tripsService, 'getActiveTrip').mockResolvedValueOnce(null);

      // We need a ticket mocked to pass step 3
      prisma.ticket.findUnique.mockResolvedValueOnce({} as any);

      await expect(service.validateTicket(mockDriverId, validDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw GoneException if ticket is expired', async () => {
      prisma.ticket.findUnique.mockResolvedValueOnce({
        id: mockTicketId,
        status: TicketStatus.ACTIVE,
        expiresAt: new Date(Date.now() - 100000), // expired
        passengerId: 'user-1',
        fareAmount: 15,
        route: { name: {} },
        boardingStop: { name: {} },
        dropoffStop: { name: {} },
      } as any);

      await expect(service.validateTicket(mockDriverId, validDto)).rejects.toThrow(GoneException);
      expect(prisma.scanEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ result: ScanResult.EXPIRED }),
        }),
      );
    });

    it('should throw ConflictException if ticket already used', async () => {
      prisma.ticket.findUnique.mockResolvedValueOnce({
        id: mockTicketId,
        status: TicketStatus.USED,
        expiresAt: new Date(Date.now() + 100000),
        passengerId: 'user-1',
        fareAmount: 15,
        route: { name: {} },
        boardingStop: { name: {} },
        dropoffStop: { name: {} },
      } as any);

      await expect(service.validateTicket(mockDriverId, validDto)).rejects.toThrow(ConflictException);
      expect(prisma.scanEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ result: ScanResult.ALREADY_USED }),
        }),
      );
    });

    it('should process valid ticket and dispatch ML anomaly', async () => {
      prisma.ticket.findUnique.mockResolvedValueOnce({
        id: mockTicketId,
        status: TicketStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 100000),
        passengerId: 'user-1',
        fareAmount: 15,
        route: { name: {} },
        boardingStop: { name: {} },
        dropoffStop: { name: {} },
      } as any);

      prisma.ticket.updateMany.mockResolvedValueOnce({ count: 1 } as any);
      prisma.scanEvent.create.mockResolvedValueOnce({ id: 'scan-1' } as any);
      prisma.user.findUnique.mockResolvedValueOnce({ fullName: 'John Doe' } as any);

      const result = await service.validateTicket(mockDriverId, validDto);
      
      expect(result.result).toBe(ScanResult.VALID);
      expect(prisma.ticket.updateMany).toHaveBeenCalled();
      expect(prisma.scanEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ result: ScanResult.VALID }),
        }),
      );
    });

    it('should handle race condition and throw ConflictException', async () => {
      prisma.ticket.findUnique.mockResolvedValueOnce({
        id: mockTicketId,
        status: TicketStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 100000),
        passengerId: 'user-1',
        fareAmount: 15,
        route: { name: {} },
        boardingStop: { name: {} },
        dropoffStop: { name: {} },
      } as any);

      // Simulate lost race condition (another driver scanned it exactly at the same time)
      prisma.ticket.updateMany.mockResolvedValueOnce({ count: 0 } as any);
      
      await expect(service.validateTicket(mockDriverId, validDto)).rejects.toThrow(ConflictException);
      expect(prisma.scanEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ result: ScanResult.ALREADY_USED }),
        }),
      );
    });
  });
});
