/**
 * Seed script — development only.
 * Run: npx prisma db seed
 *
 * Creates:
 *  - 1 super-admin
 *  - 1 driver
 *  - 1 passenger + wallet (1 000 ETB)
 *  - 2 routes × 5 stops + full directional fare matrix
 */

import { hash } from 'argon2';
import { PrismaClient, UserRole, UserStatus } from '@prisma-generated/client';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Seed must not run in production');
}

const prisma = new PrismaClient();

// ─── Fare helpers ────────────────────────────────────────────────────────────
// Simple linear pricing: 500 santim per stop-distance (e.g. 2 hops → 1 000)
function fareAmount(fromSeq: number, toSeq: number): number {
  return Math.abs(toSeq - fromSeq) * 500;
}

function buildFares(routeId: string, stops: { id: string; sequence: number }[]) {
  const fares: { routeId: string; fromStopId: string; toStopId: string; amount: number }[] = [];

  for (const from of stops) {
    for (const to of stops) {
      if (from.id === to.id) continue;
      fares.push({
        routeId,
        fromStopId: from.id,
        toStopId: to.id,
        amount: fareAmount(from.sequence, to.sequence),
      });
    }
  }

  return fares;
}

// ─── Routes ──────────────────────────────────────────────────────────────────
const ROUTES = [
  {
    routeNumber: 'R01',
    name: 'Megenagna ↔ 4 Kilo',
    stops: ['Megenagna', 'Bambis', 'Bole Michael', 'Mexico', '4 Kilo'],
  },
  {
    routeNumber: 'R02',
    name: 'Mexico ↔ Piazza',
    stops: ['Mexico', 'Afincho Ber', 'Lideta', 'Merkato', 'Piazza'],
  },
];

// ─── Main ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('🌱  Seeding database…');

  // Users
  const [adminHash, driverHash, passengerHash] = await Promise.all([
    hash('Admin123!'),
    hash('Driver123!'),
    hash('Passenger123!'),
  ]);

  const admin = await prisma.user.upsert({
    where: { phone: '+251900000000' },
    update: {},
    create: {
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      fullName: 'System Admin',
      phone: '+251900000000',
      passwordHash: adminHash,
    },
  });

  const driver = await prisma.user.upsert({
    where: { phone: '+251911111111' },
    update: {},
    create: {
      role: UserRole.DRIVER,
      status: UserStatus.ACTIVE,
      fullName: 'Dawit Bekele',
      phone: '+251911111111',
      passwordHash: driverHash,
    },
  });

  const passenger = await prisma.user.upsert({
    where: { phone: '+251922222222' },
    update: {},
    create: {
      role: UserRole.PASSENGER,
      status: UserStatus.ACTIVE,
      fullName: 'Abebe Kebede Tekle',
      phone: '+251922222222',
      fid: 'ETH-DEMO-0001',
      passwordHash: passengerHash,
      wallet: {
        create: { balance: 100_000 }, // 1 000 ETB
      },
    },
  });

  console.log(`  ✓ Users: ${admin.phone}, ${driver.phone}, ${passenger.phone}`);

  // Routes + stops + fares
  for (const routeDef of ROUTES) {
    const route = await prisma.route.upsert({
      where: { routeNumber: routeDef.routeNumber },
      update: {},
      create: {
        routeNumber: routeDef.routeNumber,
        name: routeDef.name,
        isActive: true,
      },
    });

    // Delete existing stops/fares so upsert stays idempotent on re-seed
    await prisma.fare.deleteMany({ where: { routeId: route.id } });
    await prisma.stop.deleteMany({ where: { routeId: route.id } });

    const stops = await Promise.all(
      routeDef.stops.map((name, idx) =>
        prisma.stop.create({
          data: { routeId: route.id, name, sequence: idx + 1 },
        }),
      ),
    );

    const fares = buildFares(route.id, stops);
    await prisma.fare.createMany({ data: fares });

    console.log(`  ✓ Route ${route.routeNumber}: ${stops.length} stops, ${fares.length} fares`);
  }

  console.log('✅  Seed complete.');
}

main()
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
