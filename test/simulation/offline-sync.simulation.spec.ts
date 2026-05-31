import { Test, TestingModule } from '@nestjs/testing';
import { SyncService } from '../../src/modules/sync/sync.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MockPrismaProvider, MockPrismaService } from '../utils/mock-prisma';
import { QrService } from '../../src/modules/tickets/qr.service';
import { TicketStatus, ScanResult } from '@prisma-generated/client';

describe('Offline Syncing Simulation', () => {
  let syncService: SyncService;
  let prisma: MockPrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        MockPrismaProvider,
        {
          provide: QrService,
          useValue: { verify: jest.fn().mockReturnValue(true) }
        }
      ],
    }).compile();

    syncService = module.get<SyncService>(SyncService);
    prisma = module.get<PrismaService>(PrismaService) as unknown as MockPrismaService;
  });

  it('should successfully sync a batch of mixed offline scans (Valid, Expired, Already Used)', async () => {
    // We mock ticket fetching based on ticket ID
    prisma.ticket.findUnique.mockImplementation((async ({ where }: any) => {
      if (where.id === 'ticket-valid') return { id: 'ticket-valid', status: TicketStatus.ACTIVE, expiresAt: new Date(Date.now() + 100000) };
      if (where.id === 'ticket-expired') return { id: 'ticket-expired', status: TicketStatus.ACTIVE, expiresAt: new Date(Date.now() - 100000) };
      if (where.id === 'ticket-used') return { id: 'ticket-used', status: TicketStatus.USED, usedAt: new Date(Date.now() - 50000), expiresAt: new Date(Date.now() + 100000) };
      return null;
    }) as any);

    prisma.scanEvent.findFirst.mockResolvedValue(null);
    prisma.trip.findFirst.mockResolvedValue({ id: 'trip-1' } as any);

    const dto = {
      scans: [
        { qrPayload: JSON.stringify({ ticketId: 'ticket-valid' }), qrSignature: 'sig', scannedAt: new Date().toISOString() },
        { qrPayload: JSON.stringify({ ticketId: 'ticket-expired' }), qrSignature: 'sig', scannedAt: new Date().toISOString() },
        { qrPayload: JSON.stringify({ ticketId: 'ticket-used' }), qrSignature: 'sig', scannedAt: new Date().toISOString() },
        { qrPayload: JSON.stringify({ ticketId: 'ticket-invalid' }), qrSignature: 'sig', scannedAt: new Date().toISOString() },
      ]
    };

    const result = await syncService.reconcile('driver-1', dto);

    expect(result.totalReceived).toBe(4);
    expect(result.processed).toBe(3); // 3 valid forms, 1 completely invalid (not in DB)
    expect(result.failed).toBe(1);

    const actions = result.results.map(r => r.action);
    expect(actions).toContain('MARKED_USED');
    expect(actions).toContain('EXPIRED');
    expect(actions).toContain('ALREADY_USED_SERVER_WINS');
    expect(actions).toContain('INVALID');
    
    // Verify scan events created
    expect(prisma.scanEvent.create).toHaveBeenCalledTimes(3);
  });
});
