import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { TicketStatus } from '@prisma-generated/client';
import { TicketsService } from '../../src/modules/tickets/tickets.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WalletService } from '../../src/modules/wallet/wallet.service';
import { RoutesService } from '../../src/modules/routes/routes.service';
import { QrService } from '../../src/modules/tickets/qr.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { MockPrismaProvider, MockPrismaService } from '../utils/mock-prisma';

describe('TicketsService', () => {
  let service: TicketsService;
  let prisma: MockPrismaService;
  let walletService: jest.Mocked<Pick<WalletService, 'debit' | 'credit'>>;
  let routesService: jest.Mocked<Pick<RoutesService, 'getFare'>>;
  let qrService: jest.Mocked<Pick<QrService, 'sign'>>;
  let notificationsService: jest.Mocked<Pick<NotificationsService, 'sendPush'>>;

  const localizedTicket = {
    id: 'ticket-1',
    passengerId: 'passenger-1',
    route: { id: 'route-1', name: { en: 'Route 1', am: 'Route 1 AM' }, routeNumber: 'R1' },
    boardingStop: { id: 'stop-1', name: { en: 'Start', am: 'Start AM' } },
    dropoffStop: { id: 'stop-2', name: { en: 'End', am: 'End AM' } },
  };

  beforeEach(() => {
    prisma = MockPrismaProvider.useFactory();
    walletService = {
      debit: jest.fn().mockResolvedValue({ id: 'wallet-tx-1' }),
      credit: jest.fn().mockResolvedValue({ id: 'wallet-tx-2' }),
    };
    routesService = { getFare: jest.fn().mockResolvedValue({ fare: 25 }) };
    qrService = { sign: jest.fn().mockReturnValue({ payload: '{"ticketId":"ticket-1"}', signature: 'sig' }) };
    notificationsService = { sendPush: jest.fn().mockResolvedValue(undefined) };

    service = new TicketsService(
      prisma as unknown as PrismaService,
      walletService as unknown as WalletService,
      routesService as unknown as RoutesService,
      qrService as unknown as QrService,
      notificationsService as unknown as NotificationsService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('purchases a ticket, debits the wallet, signs the QR payload, and localizes the response', async () => {
    prisma.ticket.create.mockResolvedValueOnce({ id: 'ticket-1' } as any);
    prisma.ticket.update.mockResolvedValueOnce(localizedTicket as any);

    const result = await service.purchase(
      'passenger-1',
      {
        routeId: 'route-1',
        boardingStopId: 'stop-1',
        dropoffStopId: 'stop-2',
      },
      'idem-1',
      'am',
    );

    expect(routesService.getFare).toHaveBeenCalledWith('route-1', 'stop-1', 'stop-2');
    expect(walletService.debit).toHaveBeenCalledWith(
      prisma,
      'passenger-1',
      25,
      expect.any(String),
      'idem-1',
    );
    expect(qrService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        passengerId: 'passenger-1',
        routeId: 'route-1',
        fareAmount: 25,
      }),
    );
    expect(result.route.name).toBe('Route 1 AM');
  });

  it('lists and fetches tickets for a passenger', async () => {
    prisma.ticket.findMany.mockResolvedValueOnce([localizedTicket] as any);
    prisma.ticket.count.mockResolvedValueOnce(1);

    const list = await service.findAllForUser(
      'passenger-1',
      { page: 1, limit: 10, sortBy: 'bad-field' } as any,
      'en',
    );

    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { passengerId: 'passenger-1' },
        orderBy: { purchasedAt: 'desc' },
      }),
    );
    expect(list.items[0].route.name).toBe('Route 1');

    prisma.ticket.findUnique.mockResolvedValueOnce(localizedTicket as any);
    await expect(service.findOneForUser('passenger-1', 'ticket-1', 'am')).resolves.toMatchObject({
      route: { name: 'Route 1 AM' },
    });

    prisma.ticket.findUnique.mockResolvedValueOnce({ ...localizedTicket, passengerId: 'other' } as any);
    await expect(service.findOneForUser('passenger-1', 'ticket-1')).rejects.toThrow(NotFoundException);
  });

  it('sends drop signals only for used tickets linked to a trip', async () => {
    prisma.ticket.findUnique.mockResolvedValueOnce({
      id: 'ticket-1',
      passengerId: 'passenger-1',
      status: TicketStatus.USED,
      dropoffStop: { name: { en: 'End', am: 'End AM' } },
    } as any);
    prisma.scanEvent.findFirst.mockResolvedValueOnce({
      tripId: 'trip-1',
      trip: { driverId: 'driver-1' },
    } as any);

    await expect(service.dropSignal('passenger-1', 'ticket-1', 'en')).resolves.toEqual({
      signaled: true,
      dropoffStop: 'End',
    });
    expect(notificationsService.sendPush).toHaveBeenCalledWith(
      'driver-1',
      'Drop Requested',
      'A passenger is requesting to drop off at End',
      { ticketId: 'ticket-1', stopName: 'End' },
    );

    prisma.ticket.findUnique.mockResolvedValueOnce({
      id: 'ticket-1',
      passengerId: 'passenger-1',
      status: TicketStatus.ACTIVE,
      dropoffStop: { name: { en: 'End' } },
    } as any);
    await expect(service.dropSignal('passenger-1', 'ticket-1')).rejects.toThrow(
      UnprocessableEntityException,
    );
  });

  it('marks active tickets as used and rejects invalid statuses', async () => {
    prisma.ticket.findUnique.mockResolvedValueOnce({ id: 'ticket-1', status: TicketStatus.ACTIVE } as any);
    prisma.ticket.update.mockResolvedValueOnce({ id: 'ticket-1', status: TicketStatus.USED } as any);

    await expect(service.markUsed('ticket-1')).resolves.toMatchObject({ status: TicketStatus.USED });

    prisma.ticket.findUnique.mockResolvedValueOnce({ id: 'ticket-1', status: TicketStatus.USED } as any);
    await expect(service.markUsed('ticket-1')).rejects.toThrow(ConflictException);
  });

  it('expires and refunds active tickets', async () => {
    prisma.ticket.findUnique.mockResolvedValueOnce({
      id: 'ticket-1',
      passengerId: 'passenger-1',
      fareAmount: 25,
      status: TicketStatus.ACTIVE,
    } as any);
    prisma.ticket.update.mockResolvedValueOnce({ id: 'ticket-1', status: TicketStatus.EXPIRED } as any);
    prisma.ticket.update.mockResolvedValueOnce({ id: 'ticket-1', status: TicketStatus.REFUNDED } as any);

    await expect(service.expireAndRefund('ticket-1')).resolves.toMatchObject({
      status: TicketStatus.REFUNDED,
    });
    expect(walletService.credit).toHaveBeenCalledWith(
      prisma,
      'passenger-1',
      25,
      'ticket-1',
      expect.objectContaining({ en: expect.stringContaining('Ticket expired') }),
    );

    prisma.ticket.findUnique.mockResolvedValueOnce({ id: 'ticket-1', status: TicketStatus.USED } as any);
    await expect(service.expireAndRefund('ticket-1')).rejects.toThrow(ConflictException);
  });

  it('finds tickets by id or throws when missing', async () => {
    prisma.ticket.findUnique.mockResolvedValueOnce({ id: 'ticket-1' } as any);
    await expect(service.findById('ticket-1')).resolves.toEqual({ id: 'ticket-1' });

    prisma.ticket.findUnique.mockResolvedValueOnce(null);
    await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
  });
});
