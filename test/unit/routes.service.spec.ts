import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { RoutesService } from '../../src/modules/routes/routes.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MockPrismaProvider, MockPrismaService } from '../utils/mock-prisma';

describe('RoutesService', () => {
  let service: RoutesService;
  let prisma: MockPrismaService;

  const route = {
    id: 'route-1',
    routeNumber: 'R1',
    name: { en: 'Megenagna to Bole', am: 'Megenagna to Bole AM' },
    description: { en: 'Express route', am: 'Express route AM' },
    isActive: true,
    deletedAt: null,
    estimatedDuration: 50,
    estimatedDistance: 10000,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-02T00:00:00Z'),
    stops: [
      {
        id: 'stop-2',
        routeId: 'route-1',
        name: { en: 'Bole', am: 'Bole AM' },
        sequence: 2,
        latitude: 9.01,
        longitude: 38.76,
      },
      {
        id: 'stop-1',
        routeId: 'route-1',
        name: { en: 'Megenagna', am: 'Megenagna AM' },
        sequence: 1,
        latitude: 9,
        longitude: 38.75,
      },
    ],
    fares: [{ fromStopId: 'stop-1', toStopId: 'stop-2', amount: 20 }],
    segments: [
      {
        fromStopId: 'stop-1',
        toStopId: 'stop-2',
        distance: 4500,
        duration: 18,
        fromStop: { id: 'stop-1', sequence: 1 },
        toStop: { id: 'stop-2', sequence: 2 },
      },
    ],
  };

  beforeEach(() => {
    prisma = MockPrismaProvider.useFactory();
    service = new RoutesService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('lists active routes with transformed localized fields and pagination', async () => {
    prisma.route.findMany.mockResolvedValueOnce([route] as any);
    prisma.route.count.mockResolvedValueOnce(1);

    const result = await service.findAll({ page: 1, limit: 10, sortBy: 'bad-field' }, 'am');

    expect(prisma.route.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(result.items[0]).toMatchObject({
      id: 'route-1',
      name: 'Megenagna to Bole AM',
      startStopName: 'Megenagna AM',
      endStopName: 'Bole AM',
      price: 20,
      duration: 18,
      distance: 4500,
      totalStops: 2,
    });
    expect(result.items[0].stops[0]).toMatchObject({
      id: 'stop-1',
      distanceToNext: 4500,
      durationToNext: 18,
    });
    expect(result.meta).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
  });

  it('filters search results by departure and destination stop names', async () => {
    prisma.route.findMany.mockResolvedValueOnce([
      route,
      {
        ...route,
        id: 'route-2',
        stops: [
          { id: 'stop-3', name: { en: 'Mexico' }, sequence: 1 },
          { id: 'stop-4', name: { en: 'Piassa' }, sequence: 2 },
        ],
      },
    ] as any);

    const result = await service.search({ q: 'bole', departure: 'megenagna', destination: 'bole' }, 'en');

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('route-1');
  });

  it('finds a route by id or throws for inactive and missing routes', async () => {
    prisma.route.findUnique.mockResolvedValueOnce(route as any);
    await expect(service.findById('route-1')).resolves.toMatchObject({ id: 'route-1' });

    prisma.route.findUnique.mockResolvedValueOnce({ ...route, isActive: false } as any);
    await expect(service.findById('route-1')).rejects.toThrow(NotFoundException);

    prisma.route.findUnique.mockResolvedValueOnce(null);
    await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
  });

  it('looks up fares and rejects invalid stop pairs', async () => {
    prisma.stop.findFirst.mockResolvedValueOnce({ id: 'stop-1' } as any);
    prisma.stop.findFirst.mockResolvedValueOnce({ id: 'stop-2' } as any);
    prisma.fare.findUnique.mockResolvedValueOnce({ amount: 25 } as any);

    await expect(service.getFare('route-1', 'stop-1', 'stop-2')).resolves.toEqual({ fare: 25 });

    prisma.stop.findFirst.mockResolvedValueOnce(null);
    prisma.stop.findFirst.mockResolvedValueOnce({ id: 'stop-2' } as any);
    await expect(service.getFare('route-1', 'missing', 'stop-2')).rejects.toThrow(NotFoundException);
  });

  it('creates a route with normalized route number, stops, fares, and segments', async () => {
    prisma.route.create.mockResolvedValueOnce({ id: 'route-1' } as any);
    prisma.stop.findMany.mockResolvedValueOnce([
      { id: 'stop-1', sequence: 1 },
      { id: 'stop-2', sequence: 2 },
    ] as any);
    prisma.route.findUniqueOrThrow.mockResolvedValueOnce(route as any);

    const result = await service.create({
      routeNumber: 'r1',
      name: { en: 'Route 1', am: 'Route 1 AM' },
      stops: [
        { name: { en: 'A', am: 'A' }, sequence: 1 },
        { name: { en: 'B', am: 'B' }, sequence: 2 },
      ],
      fares: [{ fromStopSequence: 1, toStopSequence: 2, amount: 20 }],
      segments: [{ fromStopSequence: 1, toStopSequence: 2, distance: 1000, duration: 5 }],
    } as any);

    expect(prisma.route.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ routeNumber: 'R1' }) }),
    );
    expect(prisma.fare.createMany).toHaveBeenCalled();
    expect(prisma.routeSegment.createMany).toHaveBeenCalled();
    expect(result.id).toBe('route-1');
  });

  it('rejects invalid stops and non-consecutive segments', async () => {
    await expect(
      service.create({
        routeNumber: 'R1',
        name: { en: 'Route 1', am: 'Route 1 AM' },
        stops: [{ name: { en: 'A', am: 'A' }, sequence: 1 }],
        fares: [],
      } as any),
    ).rejects.toThrow(UnprocessableEntityException);

    await expect(
      service.create({
        routeNumber: 'R1',
        name: { en: 'Route 1', am: 'Route 1 AM' },
        stops: [
          { name: { en: 'A', am: 'A' }, sequence: 1 },
          { name: { en: 'B', am: 'B' }, sequence: 2 },
        ],
        fares: [],
        segments: [{ fromStopSequence: 1, toStopSequence: 3, distance: 1000, duration: 5 }],
      } as any),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('updates localized fields, stops, fares, segments, and soft deletes routes', async () => {
    prisma.route.findUnique.mockResolvedValue({ id: 'route-1', name: { en: 'Old' }, deletedAt: null } as any);
    prisma.route.update.mockResolvedValueOnce({ id: 'route-1', name: { en: 'New' } } as any);

    await service.update('route-1', {
      name: { en: 'New' },
      isActive: false,
      estimatedDuration: 30,
    } as any);

    expect(prisma.route.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: { en: 'New' }, isActive: false, estimatedDuration: 30 }),
      }),
    );

    await service.updateStops('route-1', [
      { name: { en: 'A', am: 'A' }, sequence: 1 },
      { name: { en: 'B', am: 'B' }, sequence: 2 },
    ] as any);
    expect(prisma.stop.deleteMany).toHaveBeenCalledWith({ where: { routeId: 'route-1' } });

    prisma.stop.findMany.mockResolvedValueOnce([
      { id: 'stop-1', sequence: 1 },
      { id: 'stop-2', sequence: 2 },
    ] as any);
    await service.updateFares('route-1', [{ fromStopSequence: 1, toStopSequence: 2, amount: 25 }]);
    expect(prisma.fare.createMany).toHaveBeenCalled();

    prisma.stop.findMany.mockResolvedValueOnce([
      { id: 'stop-1', sequence: 1 },
      { id: 'stop-2', sequence: 2 },
    ] as any);
    await service.updateSegments('route-1', [
      { fromStopSequence: 1, toStopSequence: 2, distance: 1000, duration: 5 },
    ]);
    expect(prisma.routeSegment.createMany).toHaveBeenCalled();

    await service.softDelete('route-1');
    expect(prisma.route.update).toHaveBeenLastCalledWith({
      where: { id: 'route-1' },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
