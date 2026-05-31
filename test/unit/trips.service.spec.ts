import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ScanResult, TripStatus } from '@prisma-generated/client';
import { TripsService } from '../../src/modules/trips/trips.service';
import { RoutesService } from '../../src/modules/routes/routes.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MockPrismaProvider, MockPrismaService } from '../utils/mock-prisma';

describe('TripsService', () => {
  let service: TripsService;
  let prisma: MockPrismaService;
  let routesService: jest.Mocked<Pick<RoutesService, 'findById'>>;

  beforeEach(() => {
    prisma = MockPrismaProvider.useFactory();
    routesService = { findById: jest.fn().mockResolvedValue({ id: 'route-1' }) };
    service = new TripsService(prisma as unknown as PrismaService, routesService as unknown as RoutesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('lists driver trips with passenger counts and normalized sorting', async () => {
    prisma.trip.findMany.mockResolvedValueOnce([
      { id: 'trip-1', _count: { scanEvents: 4 }, route: { id: 'route-1' } },
    ] as any);
    prisma.trip.count.mockResolvedValueOnce(1);

    const result = await service.findAllForDriver('driver-1', {
      page: 2,
      limit: 5,
      sortBy: 'invalid',
      status: TripStatus.SCHEDULED,
    } as any);

    expect(prisma.trip.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ driverId: 'driver-1', status: TripStatus.SCHEDULED }),
        skip: 5,
        take: 5,
        orderBy: { scheduledFor: 'desc' },
      }),
    );
    expect(result.items[0]).toMatchObject({ id: 'trip-1', passengerCount: 4 });
  });

  it('returns trip details with a scan summary', async () => {
    prisma.trip.findUnique.mockResolvedValueOnce({
      id: 'trip-1',
      driverId: 'driver-1',
      scanEvents: [
        { result: ScanResult.VALID, isInspection: false },
        { result: ScanResult.EXPIRED, isInspection: false },
        { result: ScanResult.ALREADY_USED, isInspection: false },
        { result: ScanResult.INVALID_SIGNATURE, isInspection: false },
        { result: ScanResult.VALID, isInspection: true },
      ],
    } as any);

    const result = await service.findById('driver-1', 'trip-1');

    expect(result.summary).toEqual({
      totalScans: 5,
      validScans: 1,
      expiredScans: 1,
      alreadyUsedScans: 1,
      invalidSignatureScans: 1,
      inspectionScans: 1,
    });
    expect(result.passengerCount).toBe(1);
  });

  it('starts trips only when scheduled and no active trip exists', async () => {
    prisma.trip.findUnique.mockResolvedValueOnce({
      id: 'trip-1',
      driverId: 'driver-1',
      status: TripStatus.SCHEDULED,
    } as any);
    prisma.trip.findFirst.mockResolvedValueOnce(null);
    prisma.trip.update.mockResolvedValueOnce({ id: 'trip-1', status: TripStatus.IN_PROGRESS } as any);

    await expect(service.startTrip('driver-1', 'trip-1')).resolves.toMatchObject({
      status: TripStatus.IN_PROGRESS,
    });

    prisma.trip.findUnique.mockResolvedValueOnce({
      id: 'trip-1',
      driverId: 'driver-1',
      status: TripStatus.COMPLETED,
    } as any);
    await expect(service.startTrip('driver-1', 'trip-1')).rejects.toThrow(BadRequestException);

    prisma.trip.findUnique.mockResolvedValueOnce({
      id: 'trip-1',
      driverId: 'driver-1',
      status: TripStatus.SCHEDULED,
    } as any);
    prisma.trip.findFirst.mockResolvedValueOnce({ id: 'active-trip' } as any);
    await expect(service.startTrip('driver-1', 'trip-1')).rejects.toThrow(ConflictException);
  });

  it('ends in-progress trips and rejects missing or wrong-state trips', async () => {
    prisma.trip.findUnique.mockResolvedValueOnce(null);
    await expect(service.endTrip('driver-1', 'missing')).rejects.toThrow(NotFoundException);

    prisma.trip.findUnique.mockResolvedValueOnce({
      id: 'trip-1',
      driverId: 'driver-1',
      status: TripStatus.SCHEDULED,
    } as any);
    await expect(service.endTrip('driver-1', 'trip-1')).rejects.toThrow(BadRequestException);

    prisma.trip.findUnique.mockResolvedValueOnce({
      id: 'trip-1',
      driverId: 'driver-1',
      status: TripStatus.IN_PROGRESS,
    } as any);
    prisma.trip.update.mockResolvedValueOnce({
      id: 'trip-1',
      status: TripStatus.COMPLETED,
      scanEvents: [{ result: ScanResult.VALID, isInspection: false }],
    } as any);

    await expect(service.endTrip('driver-1', 'trip-1')).resolves.toMatchObject({
      status: TripStatus.COMPLETED,
      passengerCount: 1,
    });
  });

  it('creates, cancels, and fetches active trips', async () => {
    prisma.trip.create.mockResolvedValueOnce({ id: 'trip-1', status: TripStatus.SCHEDULED } as any);

    await service.create({
      routeId: 'route-1',
      driverId: 'driver-1',
      scheduledFor: '2026-06-01T08:00:00Z',
      busIdentifier: 'BUS-1',
    });

    expect(routesService.findById).toHaveBeenCalledWith('route-1');
    expect(prisma.trip.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          routeId: 'route-1',
          driverId: 'driver-1',
          status: TripStatus.SCHEDULED,
        }),
      }),
    );

    prisma.trip.findUnique.mockResolvedValueOnce({ id: 'trip-1', status: TripStatus.SCHEDULED } as any);
    prisma.trip.update.mockResolvedValueOnce({ id: 'trip-1', status: TripStatus.CANCELLED } as any);
    await expect(service.cancel('trip-1')).resolves.toMatchObject({ status: TripStatus.CANCELLED });

    prisma.trip.findFirst.mockResolvedValueOnce({ id: 'trip-1', status: TripStatus.IN_PROGRESS } as any);
    await expect(service.getActiveTrip('driver-1')).resolves.toMatchObject({ id: 'trip-1' });
  });
});
