import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, GoneException } from '@nestjs/common';
import { ValidationService } from '../../src/modules/validation/validation.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MockPrismaProvider, MockPrismaService } from '../utils/mock-prisma';
import { QrService } from '../../src/modules/tickets/qr.service';
import { TripsService } from '../../src/modules/trips/trips.service';
import { MlService } from '../../src/modules/ml/ml.service';
import { AnomalyService } from '../../src/modules/validation/anomaly.service';
import { TicketStatus, ScanResult } from '@prisma-generated/client';

describe('Passenger Boarding Simulation', () => {
  let validationService: ValidationService;
  let prisma: MockPrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidationService,
        MockPrismaProvider,
        { provide: QrService, useValue: { verify: jest.fn().mockReturnValue(true) } },
        { provide: TripsService, useValue: { getActiveTrip: jest.fn().mockResolvedValue({ id: 'trip-1' }) } },
        { provide: MlService, useValue: { detectScanAnomaly: jest.fn().mockResolvedValue(null) } },
        { provide: AnomalyService, useValue: { record: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    validationService = module.get<ValidationService>(ValidationService);
    prisma = module.get<PrismaService>(PrismaService) as unknown as MockPrismaService;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should process a fast sequence of passenger boardings successfully', async () => {
    const tickets = [
      { id: 't1', status: TicketStatus.ACTIVE, expiresAt: new Date(Date.now() + 100000), passengerId: 'p1' },
      { id: 't2', status: TicketStatus.ACTIVE, expiresAt: new Date(Date.now() + 100000), passengerId: 'p2' },
      { id: 't3', status: TicketStatus.ACTIVE, expiresAt: new Date(Date.now() + 100000), passengerId: 'p3' },
    ];

    let callCount = 0;
    prisma.ticket.findUnique.mockImplementation(async () => {
      const ticket = tickets[callCount++];
      return { ...ticket, route: { name: {} }, boardingStop: { name: {} }, dropoffStop: { name: {} } } as any;
    });

    prisma.ticket.updateMany.mockResolvedValue({ count: 1 } as any);
    prisma.scanEvent.create.mockResolvedValue({ id: 'scan-id' } as any);
    prisma.user.findUnique.mockResolvedValue({ fullName: 'Passenger Name' } as any);

    const driverId = 'driver-1';
    
    // Simulate rapid sequential scans
    const results = [];
    for (let i = 0; i < 3; i++) {
      const dto = {
        qrPayload: JSON.stringify({ ticketId: `t${i+1}` }),
        qrSignature: 'sig',
        latitude: 10,
        longitude: 20,
      };
      const res = await validationService.validateTicket(driverId, dto);
      results.push(res);
    }

    expect(results.length).toBe(3);
    expect(results[0].result).toBe(ScanResult.VALID);
    expect(results[1].result).toBe(ScanResult.VALID);
    expect(results[2].result).toBe(ScanResult.VALID);
    expect(prisma.ticket.updateMany).toHaveBeenCalledTimes(3);
    expect(prisma.scanEvent.create).toHaveBeenCalledTimes(3);
  });

  it('should accurately catch double scans and expired tickets during boarding', async () => {
    // 1st passenger: expired
    // 2nd passenger: valid
    // 3rd passenger: tries to use 2nd passenger's ticket (already used)

    prisma.ticket.findUnique.mockImplementation(async ({ where }: any) => {
      const id = where.id;
      if (id === 't-expired') return { id, status: TicketStatus.ACTIVE, expiresAt: new Date(Date.now() - 100000), passengerId: 'p1', route: { name: {} }, boardingStop: { name: {} }, dropoffStop: { name: {} } } as any;
      if (id === 't-valid') return { id, status: TicketStatus.ACTIVE, expiresAt: new Date(Date.now() + 100000), passengerId: 'p2', route: { name: {} }, boardingStop: { name: {} }, dropoffStop: { name: {} } } as any;
      if (id === 't-used') return { id, status: TicketStatus.USED, expiresAt: new Date(Date.now() + 100000), passengerId: 'p2', route: { name: {} }, boardingStop: { name: {} }, dropoffStop: { name: {} } } as any;
      return null;
    });

    prisma.ticket.updateMany.mockResolvedValue({ count: 1 } as any);
    prisma.scanEvent.create.mockResolvedValue({ id: 'scan-id' } as any);
    prisma.user.findUnique.mockResolvedValue({ fullName: 'Passenger Name' } as any);

    const driverId = 'driver-1';

    // 1st scan -> Expired
    await expect(
      validationService.validateTicket(driverId, { qrPayload: JSON.stringify({ ticketId: 't-expired' }), qrSignature: 'sig' })
    ).rejects.toThrow(GoneException);

    // 2nd scan -> Valid
    const res = await validationService.validateTicket(driverId, { qrPayload: JSON.stringify({ ticketId: 't-valid' }), qrSignature: 'sig' });
    expect(res.result).toBe(ScanResult.VALID);

    // 3rd scan -> Used (same ticket)
    await expect(
      validationService.validateTicket(driverId, { qrPayload: JSON.stringify({ ticketId: 't-used' }), qrSignature: 'sig' })
    ).rejects.toThrow(ConflictException);

    // Scan events should have logged the failures and success
    expect(prisma.scanEvent.create).toHaveBeenCalledTimes(3);
  });
});
