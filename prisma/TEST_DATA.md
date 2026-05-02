# SmartBus Test Data Documentation

> Comprehensive test data for frontend (Flutter mobile app & Web dashboard) integration testing

## Quick Start

Run the seed script to populate the database with test data:

```bash
npx prisma db seed
```

---

## Test Data Overview

The seed creates:
- **11 Users**: 1 super-admin, 2 admins, 3 drivers, 5 passengers
- **3 Routes**: With stops and complete fare matrices
- **5 Trips**: Scheduled, in-progress, and completed
- **6 Tickets**: Active, used, expired, and refunded states
- **Wallet Transactions**: Top-ups for all passengers
- **Scan Events**: Valid, expired, and offline scans
- **Notifications**: Sent, pending, and failed notifications
- **OTP Codes**: For password reset testing

---

## Test Users

### Super Admin
| Field    | Value              |
|----------|-------------------|
| Phone    | `+251900000000`   |
| Password | `Admin123!`       |
| Role     | `SUPER_ADMIN`     |

**Use for**: System-wide administration, full access to all features

---

### Admins

#### Admin 1
| Field    | Value              |
|----------|-------------------|
| Phone    | `+251900111111`   |
| Name     | Mulugeta Assefa   |
| Password | `Admin123!`       |
| Role     | `ADMIN`           |

#### Admin 2
| Field    | Value              |
|----------|-------------------|
| Phone    | `+251900222222`   |
| Name     | Tigist Haile      |
| Password | `Admin123!`       |
| Role     | `ADMIN`           |

**Use for**: Administrative operations, user management, analytics

---

### Drivers

#### Driver 1
| Field    | Value              |
|----------|-------------------|
| Phone    | `+251911111111`   |
| Name     | Dawit Bekele      |
| Password | `Driver123!`      |
| Role     | `DRIVER`          |
| Trips    | 1 completed trip  |

#### Driver 2
| Field    | Value              |
|----------|-------------------|
| Phone    | `+251911222222`   |
| Name     | Solomon Tesfaye   |
| Password | `Driver123!`      |
| Role     | `DRIVER`          |
| Trips    | 1 in-progress trip|

#### Driver 3
| Field    | Value              |
|----------|-------------------|
| Phone    | `+251911333333`   |
| Name     | Yohannes Tadesse  |
| Password | `Driver123!`      |
| Role     | `DRIVER`          |
| Trips    | Scheduled trips   |

**Use for**: Trip management, ticket scanning, validation features

---

### Passengers

#### Passenger 1 (Standard balance)
| Field    | Value                  |
|----------|------------------------|
| Phone    | `+251922222222`        |
| Email    | `abebe@example.com`    |
| FID      | `ETH-DEMO-0001`        |
| Name     | Abebe Kebede Tekle     |
| Password | `Passenger123!`        |
| Balance  | **1,000 ETB** (100,000 santim) |
| Tickets  | 1 active ticket        |

**Use for**: General passenger flows, ticket purchase, wallet top-up

#### Passenger 2 (Medium balance)
| Field    | Value                  |
|----------|------------------------|
| Phone    | `+251922333333`        |
| Email    | `sara@example.com`     |
| FID      | `ETH-DEMO-0002`        |
| Name     | Sara Alemayehu         |
| Password | `Passenger123!`        |
| Balance  | **500 ETB** (50,000 santim) |
| Tickets  | 1 used ticket          |

**Use for**: Testing ticket usage flow

#### Passenger 3 (High balance)
| Field    | Value                  |
|----------|------------------------|
| Phone    | `+251922444444`        |
| Email    | `mekdes@example.com`   |
| FID      | `ETH-DEMO-0003`        |
| Name     | Mekdes Yilma           |
| Password | `Passenger123!`        |
| Balance  | **2,000 ETB** (200,000 santim) |
| Tickets  | 1 expired ticket       |

**Use for**: Testing high-value transactions, bulk ticket purchases

#### Passenger 4 (Low balance - for testing insufficient funds)
| Field    | Value                  |
|----------|------------------------|
| Phone    | `+251922555555`        |
| Email    | `henok@example.com`    |
| FID      | `ETH-DEMO-0004`        |
| Name     | Henok Getachew         |
| Password | `Passenger123!`        |
| Balance  | **50 ETB** (5,000 santim) |
| Tickets  | 1 refunded ticket      |

**Use for**: Testing insufficient balance error handling

#### Passenger 5 (Good balance)
| Field    | Value                  |
|----------|------------------------|
| Phone    | `+251922666666`        |
| Email    | `betelehem@example.com`|
| FID      | `ETH-DEMO-0005`        |
| Name     | Betelehem Wondimu      |
| Password | `Passenger123!`        |
| Balance  | **1,500 ETB** (150,000 santim) |
| Tickets  | 1 active ticket        |

**Use for**: General passenger testing

---

## Routes & Fares

### Route R01: Megenagna ↔ 4 Kilo
**Description**: Main route connecting Megenagna to 4 Kilo via Bole

**Stops**:
1. Megenagna
2. Bambis
3. Bole Michael
4. Mexico
5. 4 Kilo

**Sample Fares** (500 santim per stop):
- Megenagna → Bambis: 500 santim (5 ETB)
- Megenagna → Bole Michael: 1,000 santim (10 ETB)
- Megenagna → Mexico: 1,500 santim (15 ETB)
- Megenagna → 4 Kilo: 2,000 santim (20 ETB)

---

### Route R02: Mexico ↔ Piazza
**Description**: Central route from Mexico to Piazza via Merkato

**Stops**:
1. Mexico
2. Afincho Ber
3. Lideta
4. Merkato
5. Piazza

**Sample Fares**:
- Mexico → Afincho Ber: 500 santim (5 ETB)
- Mexico → Lideta: 1,000 santim (10 ETB)
- Mexico → Merkato: 1,500 santim (15 ETB)
- Mexico → Piazza: 2,000 santim (20 ETB)

---

### Route R03: CMC ↔ Gerji
**Description**: Northern route connecting CMC to Gerji

**Stops**:
1. CMC
2. Megenagna
3. Summit
4. Gerji Mebrat Hail
5. Gerji

**Sample Fares**:
- CMC → Megenagna: 500 santim (5 ETB)
- CMC → Summit: 1,000 santim (10 ETB)
- CMC → Gerji Mebrat Hail: 1,500 santim (15 ETB)
- CMC → Gerji: 2,000 santim (20 ETB)

---

## Trips

### Completed Trip
- **Route**: R01 (Megenagna ↔ 4 Kilo)
- **Driver**: Dawit Bekele (+251911111111)
- **Bus**: BUS-001
- **Status**: COMPLETED
- **Started**: Yesterday
- **Ended**: Yesterday (1 hour duration)

**Use for**: Viewing trip history, completed trip analytics

---

### In-Progress Trip
- **Route**: R02 (Mexico ↔ Piazza)
- **Driver**: Solomon Tesfaye (+251911222222)
- **Bus**: BUS-002
- **Status**: IN_PROGRESS
- **Started**: 30 minutes ago

**Use for**: Testing real-time scanning, active trip management

---

### Scheduled Trips (3 trips)
- Various routes and drivers
- **Status**: SCHEDULED
- Scheduled for future times (1hr, 2hr, 3hr from now)

**Use for**: Testing trip scheduling, future trip management

---

## Tickets

### Active Tickets (3 tickets)
- **Passenger 1**: Megenagna → Mexico (expires in 50 min)
- **Passenger 5**: Various routes (expires in 55 min)

**Status**: `ACTIVE`  
**Use for**: QR code generation, ticket validation, active ticket display

---

### Used Ticket (1 ticket)
- **Passenger**: Sara Alemayehu (+251922333333)
- **Route**: R02 (Mexico → Lideta)
- **Used**: 25 minutes ago in the in-progress trip

**Status**: `USED`  
**Use for**: Testing already-used ticket validation (should reject)

---

### Expired Ticket (1 ticket)
- **Passenger**: Mekdes Yilma (+251922444444)
- **Route**: R01
- **Expired**: 1 hour ago

**Status**: `EXPIRED`  
**Use for**: Testing expired ticket handling, expiry UI states

---

### Refunded Ticket (1 ticket)
- **Passenger**: Henok Getachew (+251922555555)
- **Route**: R03
- **Refunded**: 90 minutes ago

**Status**: `REFUNDED`  
**Use for**: Testing refund flow, refund history

---

## Wallet & Transactions

Each passenger has:
- Initial top-up transaction (completed)
- Balance as specified in passenger section

**Transaction Types Available**:
- `TOPUP`: Wallet recharge
- `TICKET_PURCHASE`: Ticket purchase deduction
- `REFUND`: Ticket refund credit
- `ADJUSTMENT`: Admin adjustment

**Use for**: Wallet balance display, transaction history, top-up flow

---

## Scan Events

### Valid Scan
- **Ticket**: Used ticket (Passenger 2)
- **Driver**: Solomon Tesfaye
- **Trip**: In-progress trip
- **Result**: `VALID`
- **Time**: 25 minutes ago

### Expired Scan
- **Ticket**: Expired ticket (Passenger 3)
- **Driver**: Dawit Bekele
- **Trip**: Completed trip
- **Result**: `EXPIRED`
- **Time**: 1 hour ago

### Offline Inspection Scan
- **Ticket**: Active ticket (Passenger 1)
- **Driver**: Yohannes Tadesse
- **Result**: `VALID`
- **Offline**: `true`
- **Inspection**: `true`
- **Time**: 15 minutes ago
- **Synced**: Not yet

**Use for**: Testing scan result display, offline sync, scan history

---

## Notifications

### Sent Notification
- **User**: Passenger 1
- **Channel**: `PUSH`
- **Status**: `SENT`
- **Title**: "Ticket Purchased"
- **Body**: "Your ticket for Route R01 has been purchased successfully."

### Pending Notification
- **User**: Passenger 2
- **Channel**: `SMS`
- **Status**: `PENDING`
- **Body**: "Your ticket expires in 20 minutes."

### Failed Notification
- **User**: Passenger 3
- **Channel**: `PUSH`
- **Status**: `FAILED`
- **Title**: "Low Balance Alert"
- **Body**: "Your wallet balance is below 100 ETB."
- **Failure Reason**: "FCM token expired"

**Use for**: Testing notification delivery, notification history, error handling

---

## Authentication & Security

### Login Methods

All users can login using:
1. **Phone + Password**
2. **Email + Password** (passengers only)
3. **FID + Password** (passengers only)

**Example Login (Passenger 1)**:
```json
{
  "identifier": "+251922222222",
  "identifierType": "PHONE",
  "password": "Passenger123!"
}
```

Or:
```json
{
  "identifier": "ETH-DEMO-0001",
  "identifierType": "FID",
  "password": "Passenger123!"
}
```

---

### Password Reset Flow

**OTP Code for Testing**: `123456`

Test password reset with Passenger 1:
1. Request password reset for `+251922222222`
2. Use OTP code `123456`
3. Set new password

---

## API Endpoints

**Swagger Documentation**: http://localhost:3000/docs  
**API Base URL**: http://localhost:3000/api/v1

### Key Endpoints

#### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh token
- `POST /api/v1/auth/forgot-password` - Request password reset
- `POST /api/v1/auth/reset-password` - Reset password with OTP

#### User Profile
- `GET /api/v1/users/me` - Get current user profile
- `PATCH /api/v1/users/me` - Update profile
- `PATCH /api/v1/users/me/fcm-token` - Register FCM token

#### Wallet
- `GET /api/v1/wallet/balance` - Get wallet balance
- `POST /api/v1/wallet/topup` - Initiate top-up (requires `Idempotency-Key` header)
- `GET /api/v1/wallet/transactions` - Transaction history

#### Routes
- `GET /api/v1/routes` - List routes
- `GET /api/v1/routes/search` - Search routes
- `GET /api/v1/routes/{id}` - Route details
- `GET /api/v1/routes/{id}/fare` - Get fare for stop pair

#### Tickets
- `POST /api/v1/tickets/purchase` - Purchase ticket (requires `Idempotency-Key` header)
- `GET /api/v1/tickets` - List own tickets
- `GET /api/v1/tickets/{id}` - Get ticket detail with QR

#### Validation (Driver)
- `POST /api/v1/tickets/validate` - Validate passenger QR ticket
- `GET /api/v1/trips/{tripId}/scans` - List scanned passengers

#### Trips (Driver)
- `GET /api/v1/trips` - List driver's trips
- `GET /api/v1/trips/{id}` - Trip detail
- `PATCH /api/v1/trips/{id}/start` - Start trip
- `PATCH /api/v1/trips/{id}/end` - End trip

#### Sync (Driver - Offline)
- `POST /api/v1/sync/validations` - Sync offline scans

---

## Testing Scenarios

### Scenario 1: Passenger Registration & Login
1. Register new passenger with phone, FID, password
2. Verify OTP (use `123456` for testing)
3. Login with phone/FID
4. View profile

**Test Users**: Any passenger account

---

### Scenario 2: Wallet Top-up & Ticket Purchase
1. Login as passenger
2. Check wallet balance
3. Top-up wallet (use `Idempotency-Key` header)
4. Purchase ticket for a route (use `Idempotency-Key` header)
5. View ticket with QR code

**Test Users**: Passenger 1, 2, 3, or 5

---

### Scenario 3: Insufficient Balance
1. Login as Passenger 4 (+251922555555) - only 50 ETB
2. Try to purchase expensive ticket (e.g., Megenagna → 4 Kilo = 20 ETB is fine, but multiple tickets will fail)
3. Should receive `402 Payment Required` error

**Test User**: Passenger 4 (Henok Getachew)

---

### Scenario 4: Driver - Ticket Validation
1. Login as Driver 2 (Solomon Tesfaye) - has in-progress trip
2. Get active trip details
3. Scan passenger QR code (validate ticket)
4. View scan results
5. List all scans for the trip

**Test User**: Driver 2 (Solomon Tesfaye)

---

### Scenario 5: Ticket States
- **Active**: Passenger 1's ticket (can be scanned)
- **Used**: Passenger 2's ticket (should reject re-scan)
- **Expired**: Passenger 3's ticket (should reject)

**Test Users**: Passengers 1, 2, 3

---

### Scenario 6: Offline Sync
1. Login as driver
2. Scan tickets offline (store locally)
3. Sync batch of scans using `/api/v1/sync/validations`
4. View reconciliation report

**Test User**: Any driver

---

### Scenario 7: Trip Management
1. Login as Driver 1 (Dawit Bekele)
2. View scheduled trips
3. Start a scheduled trip
4. Scan passenger tickets
5. End trip
6. View trip summary

**Test User**: Driver 1 (Dawit Bekele)

---

### Scenario 8: Password Reset
1. Request password reset for Passenger 1 phone
2. Enter OTP `123456`
3. Set new password
4. Login with new password

**Test User**: Passenger 1 (Abebe Kebede Tekle)

---

### Scenario 9: Multi-Identifier Login
1. Login with phone: `+251922222222`
2. Logout
3. Login with email: `abebe@example.com`
4. Logout
5. Login with FID: `ETH-DEMO-0001`

**Test User**: Passenger 1 (Abebe Kebede Tekle)

---

## Important Notes

1. **Currency**: All amounts are in **santim** (1 ETB = 100 santim)
2. **Idempotency**: Wallet top-up and ticket purchase require `Idempotency-Key: <uuid>` header
3. **JWT Auth**: Most endpoints require `Authorization: Bearer <token>` header
4. **Ticket Expiry**: Tickets expire 60 minutes after purchase
5. **QR Signatures**: Current seed uses mock signatures - real implementation uses cryptographic signing
6. **Phone Format**: Ethiopian format `+251XXXXXXXXX`
7. **FID Format**: `ETH-DEMO-XXXX` (test format)

---

## Resetting Test Data

To reset and regenerate all test data:

```bash
# Reset database
npx prisma migrate reset

# Or just re-run seed (upsert logic handles duplicates)
npx prisma db seed
```

---

## Support

For questions about the test data or API usage, refer to:
- Swagger docs: http://localhost:3000/docs
- Project rules: `/CLAUDE.md`
- Database schema: `/prisma/schema.prisma`

---

**Last Updated**: Seed script version with comprehensive test data  
**Maintained by**: SmartBus Backend Team
