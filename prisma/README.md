# SmartBus Database & Test Data

This directory contains the Prisma schema, migrations, and test data seeding scripts for the SmartBus backend.

## Files

- `schema.prisma` - Complete database schema with all models, relations, and indexes
- `seed.ts` - Comprehensive test data seeding script for development
- `TEST_DATA.md` - Full documentation of all test data (users, routes, tickets, etc.)
- `QUICK_REFERENCE.md` - Quick reference card for frontend developers

## Quick Start

### 1. Run Migrations

Apply all database migrations:

```bash
npx prisma migrate deploy
```

### 2. Generate Prisma Client

Generate the Prisma client for TypeScript:

```bash
npx prisma generate
```

### 3. Seed Test Data

Populate the database with comprehensive test data:

```bash
npx prisma db seed
```

## What Gets Seeded?

The seed script creates production-ready test data for frontend integration testing:

### Users (11 total)

- 1 Super Admin
- 2 Admins
- 3 Drivers (with trips assigned)
- 5 Passengers (with varying wallet balances)

### Routes & Transportation

- 3 Active routes with real Addis Ababa locations
- 5 stops per route
- Complete fare matrices (60 fares total)

### Trips (5 total)

- 1 Completed trip (historical data)
- 1 In-progress trip (for real-time testing)
- 3 Scheduled trips (future)

### Tickets (5 total)

- 2 Active tickets (ready to scan)
- 1 Used ticket (already scanned)
- 1 Expired ticket (past 60-min expiry)
- 1 Refunded ticket

### Additional Data

- Wallet transactions for all passengers
- Scan events (valid, expired, offline)
- Notifications (sent, pending, failed)
- OTP codes for password reset testing

## For Frontend Developers

### Flutter Mobile App

Start here: `QUICK_REFERENCE.md`

Quick test credentials:

- Passenger: `+251922222222` / `Passenger123!`
- Driver: `+251911222222` / `Driver123!` (has active trip)

### Web Dashboard

Start here: `TEST_DATA.md`

Quick test credentials:

- Super Admin: `+251900000000` / `Admin123!`
- Admin: `+251900111111` / `Admin123!`

## Reset Database

To completely reset and reseed:

```bash
# WARNING: This deletes ALL data!
npx prisma migrate reset

# The reset automatically runs the seed script
```

Or just reseed without losing data (upsert mode):

```bash
npx prisma db seed
```

## API Documentation

After starting the backend server:

- Swagger UI: http://localhost:3000/docs
- API Base URL: http://localhost:3000/api/v1

## Schema Changes

When making schema changes:

1. Edit `schema.prisma`
2. Create migration:
    ```bash
    npx prisma migrate dev --name your_migration_name
    ```
3. Update seed script if needed
4. Regenerate client:
    ```bash
    npx prisma generate
    ```

---

## Database Inspection

### Prisma Studio

Launch visual database browser:

```bash
npx prisma studio
```

Opens at http://localhost:5555

### Direct Query

```bash
# View tables
npx prisma db execute --stdin < <(echo "SELECT * FROM users LIMIT 5;")

# Or use psql directly
psql -h localhost -U smartbus -d smartbus
```

---

## Documentation Links

| Resource                 | Link                                         |
| ------------------------ | -------------------------------------------- |
| Full Test Data Docs      | [TEST_DATA.md](./TEST_DATA.md)               |
| Quick Reference          | [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)   |
| Schema Documentation     | [schema.prisma](./schema.prisma)             |
| Project Rules            | [../CLAUDE.md](../CLAUDE.md)                 |
| Prisma Docs              | https://www.prisma.io/docs                   |

---

## Tips

1. Always seed after reset: The seed script is idempotent and can be run multiple times
2. Use Swagger docs: Best way to understand API endpoints and request/response formats
3. Check wallet balances: Passenger 4 has low balance (50 ETB) for testing insufficient funds
4. Test with real scenarios: Use the in-progress trip for driver testing
5. OTP code: Use `123456` for password reset testing

---

## Troubleshooting

### Seed fails with "unique constraint violation"

The seed uses `upsert` operations, so this shouldn't happen. If it does:

```bash
npx prisma migrate reset  # Nuclear option
```

### "Prisma Client not generated"

```bash
npx prisma generate
```

### "Cannot connect to database"

Check your `.env` file has correct `DATABASE_URL`:

```env
DATABASE_URL="postgresql://smartbus:smartbus_dev@localhost:5432/smartbus"
```

---

## Support

For questions:

1. Check Swagger docs first: http://localhost:3000/docs
2. Review [TEST_DATA.md](./TEST_DATA.md) for data details
3. See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for API examples
4. Consult project rules: [../CLAUDE.md](../CLAUDE.md)
