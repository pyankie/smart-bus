/**
 * Seed script — development only.
 * Run: npx prisma db seed
 *
 * Creates comprehensive test data for frontend testing:
 *  - Users: super-admin, 2 admins, 3 drivers, 5 passengers
 *  - Routes: 3 routes with stops and fare matrix
 *  - Trips: scheduled, in-progress, completed
 *  - Tickets: active, used, expired, refunded
 *  - Wallet transactions, scan events, notifications
 */

import { hash } from 'argon2';
import {
  PrismaClient,
  UserRole,
  UserStatus,
  TicketStatus,
  TripStatus,
  WalletTransactionType,
  WalletTransactionStatus,
  ScanResult,
  NotificationChannel,
  NotificationStatus,
  OtpPurpose,
} from '../prisma/generated/client/client';

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_IN_PROD !== 'true') {
  throw new Error('Seed must not run in production unless ALLOW_SEED_IN_PROD=true');
}

const prisma = new PrismaClient();

// ─── Fare helpers ────────────────────────────────────────────────────────────
// Simple linear pricing: 500 birr per stop-distance (e.g. 2 hops → 1,000 birr)
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
    description: 'Main route connecting Megenagna to 4 Kilo via Bole',
    stops: ['Megenagna', 'Bambis', 'Bole Michael', 'Mexico', '4 Kilo'],
  },
  {
    routeNumber: 'R02',
    name: 'Mexico ↔ Piazza',
    description: 'Central route from Mexico to Piazza via Merkato',
    stops: ['Mexico', 'Afincho Ber', 'Lideta', 'Merkato', 'Piazza'],
  },
  {
    routeNumber: 'R03',
    name: 'CMC ↔ Gerji',
    description: 'Northern route connecting CMC to Gerji',
    stops: ['CMC', 'Megenagna', 'Summit', 'Gerji Mebrat Hail', 'Gerji'],
  },
];

// ─── Users ───────────────────────────────────────────────────────────────────
const USERS = {
  superAdmin: {
    phone: '+251900000000',
    fullName: 'System Administrator',
    password: 'Admin123!',
    role: UserRole.SUPER_ADMIN,
  },
  admins: [
    {
      phone: '+251900111111',
      fullName: 'Mulugeta Assefa',
      password: 'Admin123!',
      role: UserRole.ADMIN,
    },
    {
      phone: '+251900222222',
      fullName: 'Tigist Haile',
      password: 'Admin123!',
      role: UserRole.ADMIN,
    },
  ],
  drivers: [
    {
      phone: '+251911111111',
      fullName: 'Dawit Bekele',
      password: 'Driver123!',
      role: UserRole.DRIVER,
    },
    {
      phone: '+251911222222',
      fullName: 'Solomon Tesfaye',
      password: 'Driver123!',
      role: UserRole.DRIVER,
    },
    {
      phone: '+251911333333',
      fullName: 'Yohannes Tadesse',
      password: 'Driver123!',
      role: UserRole.DRIVER,
    },
  ],
  passengers: [
    {
      phone: '+251922222222',
      fullName: 'Abebe Kebede Tekle',
      email: 'abebe@example.com',
      fid: 'ETH-DEMO-0001',
      password: 'Passenger123!',
      role: UserRole.PASSENGER,
      walletBalance: 100_000, // 1,000 ETB
    },
    {
      phone: '+251922333333',
      fullName: 'Sara Alemayehu',
      email: 'sara@example.com',
      fid: 'ETH-DEMO-0002',
      password: 'Passenger123!',
      role: UserRole.PASSENGER,
      walletBalance: 50_000, // 500 ETB
    },
    {
      phone: '+251922444444',
      fullName: 'Mekdes Yilma',
      email: 'mekdes@example.com',
      fid: 'ETH-DEMO-0003',
      password: 'Passenger123!',
      role: UserRole.PASSENGER,
      walletBalance: 200_000, // 2,000 ETB
    },
    {
      phone: '+251922555555',
      fullName: 'Henok Getachew',
      email: 'henok@example.com',
      fid: 'ETH-DEMO-0004',
      password: 'Passenger123!',
      role: UserRole.PASSENGER,
      walletBalance: 5_000, // 50 ETB (low balance for testing)
    },
    {
      phone: '+251922666666',
      fullName: 'Betelehem Wondimu',
      email: 'betelehem@example.com',
      fid: 'ETH-DEMO-0005',
      password: 'Passenger123!',
      role: UserRole.PASSENGER,
      walletBalance: 150_000, // 1,500 ETB
    },
  ],
};

// ─── Main ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('🌱  Seeding database…\n');

  // ─── 1. Create Users ───────────────────────────────────────────────────────
  console.log('👥  Creating users…');

  const passwordHash = await hash(USERS.superAdmin.password);
  const superAdmin = await prisma.user.upsert({
    where: { phone: USERS.superAdmin.phone },
    update: {},
    create: {
      role: USERS.superAdmin.role,
      status: UserStatus.ACTIVE,
      fullName: USERS.superAdmin.fullName,
      phone: USERS.superAdmin.phone,
      passwordHash,
    },
  });
  console.log(`  ✓ Super Admin: ${superAdmin.phone}`);

  const admins = [];
  for (const admin of USERS.admins) {
    const adminHash = await hash(admin.password);
    const user = await prisma.user.upsert({
      where: { phone: admin.phone },
      update: {},
      create: {
        role: admin.role,
        status: UserStatus.ACTIVE,
        fullName: admin.fullName,
        phone: admin.phone,
        passwordHash: adminHash,
      },
    });
    admins.push(user);
  }
  console.log(`  ✓ Admins: ${admins.length}`);

  const drivers = [];
  for (const driver of USERS.drivers) {
    const driverHash = await hash(driver.password);
    const user = await prisma.user.upsert({
      where: { phone: driver.phone },
      update: {},
      create: {
        role: driver.role,
        status: UserStatus.ACTIVE,
        fullName: driver.fullName,
        phone: driver.phone,
        passwordHash: driverHash,
      },
    });
    drivers.push(user);
  }
  console.log(`  ✓ Drivers: ${drivers.length}`);

  const passengers = [];
  for (const passenger of USERS.passengers) {
    const passengerHash = await hash(passenger.password);
    const user = await prisma.user.upsert({
      where: { phone: passenger.phone },
      update: {},
      create: {
        role: passenger.role,
        status: UserStatus.ACTIVE,
        fullName: passenger.fullName,
        phone: passenger.phone,
        email: passenger.email,
        fid: passenger.fid,
        passwordHash: passengerHash,
        wallet: {
          create: { balance: passenger.walletBalance },
        },
      },
      include: { wallet: true },
    });
    passengers.push(user);
  }
  console.log(`  ✓ Passengers: ${passengers.length}\n`);

  // ─── 2. Create Routes + Stops + Fares ──────────────────────────────────────
  console.log('🗺️  Creating routes, stops, and fares…');

  const routes = [];
  for (const routeDef of ROUTES) {
    const route = await prisma.route.upsert({
      where: { routeNumber: routeDef.routeNumber },
      update: {},
      create: {
        routeNumber: routeDef.routeNumber,
        name: routeDef.name,
        description: routeDef.description,
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

    routes.push({ ...route, stops });
    console.log(`  ✓ Route ${route.routeNumber}: ${stops.length} stops, ${fares.length} fares`);
  }
  console.log();

  // ─── 3. Create Trips ───────────────────────────────────────────────────────
  console.log('🚌  Creating trips…');

  const now = new Date();
  const trips = [];

  // Completed trip (yesterday)
  const completedTrip = await prisma.trip.create({
    data: {
      routeId: routes[0].id,
      driverId: drivers[0].id,
      busIdentifier: 'BUS-001',
      status: TripStatus.COMPLETED,
      scheduledFor: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      startedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      endedAt: new Date(now.getTime() - 23 * 60 * 60 * 1000),
    },
  });
  trips.push(completedTrip);

  // In-progress trip (started 30 min ago)
  const inProgressTrip = await prisma.trip.create({
    data: {
      routeId: routes[1].id,
      driverId: drivers[1].id,
      busIdentifier: 'BUS-002',
      status: TripStatus.IN_PROGRESS,
      scheduledFor: new Date(now.getTime() - 30 * 60 * 1000),
      startedAt: new Date(now.getTime() - 30 * 60 * 1000),
    },
  });
  trips.push(inProgressTrip);

  // Scheduled trips (future)
  for (let i = 0; i < 3; i++) {
    const scheduledTrip = await prisma.trip.create({
      data: {
        routeId: routes[i % routes.length].id,
        driverId: drivers[i % drivers.length].id,
        busIdentifier: `BUS-00${i + 3}`,
        status: TripStatus.SCHEDULED,
        scheduledFor: new Date(now.getTime() + (i + 1) * 60 * 60 * 1000),
      },
    });
    trips.push(scheduledTrip);
  }

  console.log(`  ✓ Trips: ${trips.length} (1 completed, 1 in-progress, 3 scheduled)\n`);

  // ─── 4. Create Wallet Transactions ─────────────────────────────────────────
  console.log('💰  Creating wallet transactions…');

  let txCount = 0;
  for (const passenger of passengers) {
    if (!passenger.wallet) continue;

    // Top-up transaction
    await prisma.walletTransaction.create({
      data: {
        walletId: passenger.wallet.id,
        type: WalletTransactionType.TOPUP,
        status: WalletTransactionStatus.COMPLETED,
        amount: passenger.wallet.balance,
        balanceAfter: passenger.wallet.balance,
        externalRef: `TOPUP-${passenger.id.substring(0, 8)}`,
        description: 'Initial wallet top-up',
      },
    });
    txCount++;
  }

  console.log(`  ✓ Wallet transactions: ${txCount}\n`);

  // ─── 5. Create Tickets ─────────────────────────────────────────────────────
  console.log('🎫  Creating tickets…');

  const tickets = [];

  // Active ticket (purchased 10 min ago, expires in 50 min)
  const activeTicket = await prisma.ticket.create({
    data: {
      passengerId: passengers[0].id,
      routeId: routes[0].id,
      boardingStopId: routes[0].stops[0].id,
      dropoffStopId: routes[0].stops[3].id,
      fareAmount: fareAmount(1, 4),
      status: TicketStatus.ACTIVE,
      qrPayload: JSON.stringify({
        ticketId: 'TEMP',
        passengerId: passengers[0].id,
        routeId: routes[0].id,
        boardingStopId: routes[0].stops[0].id,
        dropoffStopId: routes[0].stops[3].id,
        purchasedAt: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
        expiresAt: new Date(now.getTime() + 50 * 60 * 1000).toISOString(),
      }),
      qrSignature: 'MOCK_SIGNATURE_ACTIVE',
      purchasedAt: new Date(now.getTime() - 10 * 60 * 1000),
      expiresAt: new Date(now.getTime() + 50 * 60 * 1000),
    },
  });
  tickets.push(activeTicket);

  // Used ticket (used in the in-progress trip)
  const usedTicket = await prisma.ticket.create({
    data: {
      passengerId: passengers[1].id,
      routeId: routes[1].id,
      boardingStopId: routes[1].stops[0].id,
      dropoffStopId: routes[1].stops[2].id,
      fareAmount: fareAmount(1, 3),
      status: TicketStatus.USED,
      qrPayload: JSON.stringify({
        ticketId: 'TEMP',
        passengerId: passengers[1].id,
        routeId: routes[1].id,
        boardingStopId: routes[1].stops[0].id,
        dropoffStopId: routes[1].stops[2].id,
        purchasedAt: new Date(now.getTime() - 40 * 60 * 1000).toISOString(),
        expiresAt: new Date(now.getTime() + 20 * 60 * 1000).toISOString(),
      }),
      qrSignature: 'MOCK_SIGNATURE_USED',
      purchasedAt: new Date(now.getTime() - 40 * 60 * 1000),
      expiresAt: new Date(now.getTime() + 20 * 60 * 1000),
      usedAt: new Date(now.getTime() - 25 * 60 * 1000),
    },
  });
  tickets.push(usedTicket);

  // Expired ticket (purchased 2 hours ago, expired 1 hour ago)
  const expiredTicket = await prisma.ticket.create({
    data: {
      passengerId: passengers[2].id,
      routeId: routes[0].id,
      boardingStopId: routes[0].stops[1].id,
      dropoffStopId: routes[0].stops[4].id,
      fareAmount: fareAmount(2, 5),
      status: TicketStatus.EXPIRED,
      qrPayload: JSON.stringify({
        ticketId: 'TEMP',
        passengerId: passengers[2].id,
        routeId: routes[0].id,
        boardingStopId: routes[0].stops[1].id,
        dropoffStopId: routes[0].stops[4].id,
        purchasedAt: new Date(now.getTime() - 120 * 60 * 1000).toISOString(),
        expiresAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      }),
      qrSignature: 'MOCK_SIGNATURE_EXPIRED',
      purchasedAt: new Date(now.getTime() - 120 * 60 * 1000),
      expiresAt: new Date(now.getTime() - 60 * 60 * 1000),
    },
  });
  tickets.push(expiredTicket);

  // Refunded ticket
  const refundedTicket = await prisma.ticket.create({
    data: {
      passengerId: passengers[3].id,
      routeId: routes[2].id,
      boardingStopId: routes[2].stops[0].id,
      dropoffStopId: routes[2].stops[3].id,
      fareAmount: fareAmount(1, 4),
      status: TicketStatus.REFUNDED,
      qrPayload: JSON.stringify({
        ticketId: 'TEMP',
        passengerId: passengers[3].id,
        routeId: routes[2].id,
        boardingStopId: routes[2].stops[0].id,
        dropoffStopId: routes[2].stops[3].id,
        purchasedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
      }),
      qrSignature: 'MOCK_SIGNATURE_REFUNDED',
      purchasedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      expiresAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      refundedAt: new Date(now.getTime() - 90 * 60 * 1000),
    },
  });
  tickets.push(refundedTicket);

  // More active tickets for other passengers
  for (let i = 4; i < passengers.length; i++) {
    const route = routes[i % routes.length];
    const ticket = await prisma.ticket.create({
      data: {
        passengerId: passengers[i].id,
        routeId: route.id,
        boardingStopId: route.stops[0].id,
        dropoffStopId: route.stops[2].id,
        fareAmount: fareAmount(1, 3),
        status: TicketStatus.ACTIVE,
        qrPayload: JSON.stringify({
          ticketId: 'TEMP',
          passengerId: passengers[i].id,
          routeId: route.id,
          boardingStopId: route.stops[0].id,
          dropoffStopId: route.stops[2].id,
          purchasedAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
          expiresAt: new Date(now.getTime() + 55 * 60 * 1000).toISOString(),
        }),
        qrSignature: `MOCK_SIGNATURE_${i}`,
        purchasedAt: new Date(now.getTime() - 5 * 60 * 1000),
        expiresAt: new Date(now.getTime() + 55 * 60 * 1000),
      },
    });
    tickets.push(ticket);
  }

  console.log(
    `  ✓ Tickets: ${tickets.length} (${tickets.filter((t) => t.status === TicketStatus.ACTIVE).length} active, 1 used, 1 expired, 1 refunded)\n`,
  );

  // ─── 6. Create Scan Events ─────────────────────────────────────────────────
  console.log('📱  Creating scan events…');

  // Scan for used ticket
  await prisma.scanEvent.create({
    data: {
      ticketId: usedTicket.id,
      driverId: drivers[1].id,
      tripId: inProgressTrip.id,
      result: ScanResult.VALID,
      isInspection: false,
      isOffline: false,
      scannedAt: new Date(now.getTime() - 25 * 60 * 1000),
      syncedAt: new Date(now.getTime() - 25 * 60 * 1000),
    },
  });

  // Scan for expired ticket (should show EXPIRED)
  await prisma.scanEvent.create({
    data: {
      ticketId: expiredTicket.id,
      driverId: drivers[0].id,
      tripId: completedTrip.id,
      result: ScanResult.EXPIRED,
      isInspection: false,
      isOffline: false,
      scannedAt: new Date(now.getTime() - 60 * 60 * 1000),
      syncedAt: new Date(now.getTime() - 60 * 60 * 1000),
    },
  });

  // Offline scan (not yet synced)
  await prisma.scanEvent.create({
    data: {
      ticketId: activeTicket.id,
      driverId: drivers[2].id,
      result: ScanResult.VALID,
      isInspection: true,
      isOffline: true,
      scannedAt: new Date(now.getTime() - 15 * 60 * 1000),
    },
  });

  console.log(`  ✓ Scan events: 3 (1 valid, 1 expired, 1 offline inspection)\n`);

  // ─── 7. Create Notifications ───────────────────────────────────────────────
  console.log('🔔  Creating notifications…');

  // Sent notification
  await prisma.notification.create({
    data: {
      userId: passengers[0].id,
      channel: NotificationChannel.PUSH,
      status: NotificationStatus.SENT,
      title: 'Ticket Purchased',
      body: 'Your ticket for Route R01 has been purchased successfully.',
      sentAt: new Date(now.getTime() - 10 * 60 * 1000),
    },
  });

  // Pending notification
  await prisma.notification.create({
    data: {
      userId: passengers[1].id,
      channel: NotificationChannel.SMS,
      status: NotificationStatus.PENDING,
      body: 'Your ticket expires in 20 minutes.',
    },
  });

  // Failed notification
  await prisma.notification.create({
    data: {
      userId: passengers[2].id,
      channel: NotificationChannel.PUSH,
      status: NotificationStatus.FAILED,
      title: 'Low Balance Alert',
      body: 'Your wallet balance is below 100 ETB.',
      failureReason: 'FCM token expired',
    },
  });

  console.log(`  ✓ Notifications: 3 (1 sent, 1 pending, 1 failed)\n`);

  // ─── 8. Create OTP Codes (for testing reset flow) ─────────────────────────
  console.log('🔐  Creating OTP codes…');

  // Valid OTP for password reset (expires in 10 min)
  await prisma.otpCode.create({
    data: {
      userId: passengers[0].id,
      phone: passengers[0].phone,
      codeHash: await hash('123456'),
      purpose: OtpPurpose.PASSWORD_RESET,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      attempts: 0,
    },
  });

  console.log(`  ✓ OTP codes: 1 (for password reset testing)\n`);

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log('✅  Seed complete!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊  TEST DATA SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('👥  USERS:');
  console.log('   Super Admin:');
  console.log(`     • ${USERS.superAdmin.phone} / ${USERS.superAdmin.password}`);
  console.log('   Admins:');
  USERS.admins.forEach((admin) => {
    console.log(`     • ${admin.phone} / ${admin.password}`);
  });
  console.log('   Drivers:');
  USERS.drivers.forEach((driver) => {
    console.log(`     • ${driver.phone} / ${driver.password}`);
  });
  console.log('   Passengers:');
  USERS.passengers.forEach((passenger) => {
    console.log(`     • ${passenger.phone} / ${passenger.password}`);
    console.log(`       FID: ${passenger.fid}`);
    console.log(`       Balance: ${passenger.walletBalance / 100} ETB`);
  });

  console.log('\n🗺️  ROUTES:');
  routes.forEach((route) => {
    console.log(`   • ${route.routeNumber}: ${route.name}`);
    console.log(`     Stops: ${route.stops.map((s) => s.name).join(' → ')}`);
  });

  console.log('\n🚌  TRIPS:');
  console.log(`   • Total: ${trips.length}`);
  console.log(`     - Completed: ${trips.filter((t) => t.status === TripStatus.COMPLETED).length}`);
  console.log(
    `     - In Progress: ${trips.filter((t) => t.status === TripStatus.IN_PROGRESS).length}`,
  );
  console.log(`     - Scheduled: ${trips.filter((t) => t.status === TripStatus.SCHEDULED).length}`);

  console.log('\n🎫  TICKETS:');
  console.log(`   • Total: ${tickets.length}`);
  console.log(`     - Active: ${tickets.filter((t) => t.status === TicketStatus.ACTIVE).length}`);
  console.log(`     - Used: ${tickets.filter((t) => t.status === TicketStatus.USED).length}`);
  console.log(`     - Expired: ${tickets.filter((t) => t.status === TicketStatus.EXPIRED).length}`);
  console.log(
    `     - Refunded: ${tickets.filter((t) => t.status === TicketStatus.REFUNDED).length}`,
  );

  console.log('\n🌐  API DOCUMENTATION:');
  console.log('   • Swagger: http://localhost:3000/docs');
  console.log('   • API Base: http://localhost:3000/api/v1');

  console.log('\n💡  TESTING TIPS:');
  console.log('   1. Use passenger phones/FIDs to test login flows');
  console.log('   2. Use driver accounts to test trip management & scanning');
  console.log('   3. Use admin accounts to test administrative features');
  console.log('   4. Low-balance passenger (+251922555555) for insufficient funds testing');
  console.log('   5. Active tickets ready for purchase and validation testing');
  console.log('   6. OTP code "123456" available for password reset testing');
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch((err: unknown) => {
    console.error('❌  Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
