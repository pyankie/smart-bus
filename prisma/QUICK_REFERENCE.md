# SmartBus API - Quick Reference Card

> Quick reference for frontend developers (Flutter & Web Dashboard)

## Getting Started

```bash
# API Base URL (local development)
http://localhost:3000/api/v1

# Swagger Docs
http://localhost:3000/docs

# Seed test data
npx prisma db seed
```

---

## Test Credentials

### Passengers (Mobile App)

```
Phone: +251922222222 | Password: Passenger123! | FID: ETH-DEMO-0001 | Balance: 1,000 ETB
Phone: +251922333333 | Password: Passenger123! | FID: ETH-DEMO-0002 | Balance: 500 ETB
Phone: +251922555555 | Password: Passenger123! | FID: ETH-DEMO-0004 | Balance: 50 ETB (LOW)
```

### Drivers (Mobile App)

```
Phone: +251911111111 | Password: Driver123! | Name: Dawit Bekele
Phone: +251911222222 | Password: Driver123! | Name: Solomon Tesfaye (has active trip)
```

### Admins (Web Dashboard)

```
Phone: +251900000000 | Password: Admin123! | Role: SUPER_ADMIN
Phone: +251900111111 | Password: Admin123! | Role: ADMIN
```

---

## Common API Flows

### 1. Login

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "identifier": "+251922222222",
  "identifierType": "PHONE",
  "password": "Passenger123!"
}

Response: { accessToken, refreshToken }
```

### 2. Get Profile

```http
GET /api/v1/users/me
Authorization: Bearer <accessToken>

Response: { id, role, fullName, phone, email, fid }
```

### 3. Get Wallet Balance

```http
GET /api/v1/wallet/balance
Authorization: Bearer <accessToken>

Response: { balance, currency: "ETB" }
```

### 4. List Routes

```http
GET /api/v1/routes?page=1&limit=20
Authorization: Bearer <accessToken>

Response: { data: [...routes], meta: { total, page, limit } }
```

### 5. Get Route Details

```http
GET /api/v1/routes/{routeId}
Authorization: Bearer <accessToken>

Response: { id, routeNumber, name, stops: [...], fares: [...] }
```

### 6. Purchase Ticket

```http
POST /api/v1/tickets/purchase
Authorization: Bearer <accessToken>
Idempotency-Key: <uuid-v4>
Content-Type: application/json

{
  "routeId": "uuid",
  "boardingStopId": "uuid",
  "dropoffStopId": "uuid"
}

Response: { ticket: { id, qrPayload, qrSignature, expiresAt, ... } }
```

### 7. List My Tickets

```http
GET /api/v1/tickets?status=ACTIVE&page=1&limit=20
Authorization: Bearer <accessToken>

Response: { data: [...tickets], meta: { total, page, limit } }
```

### 8. Validate Ticket (Driver)

```http
POST /api/v1/tickets/validate
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "qrPayload": "...",
  "qrSignature": "...",
  "tripId": "uuid",
  "isInspection": false
}

Response: { result: "VALID", ticket: {...}, message: "..." }
```

### 9. Start Trip (Driver)

```http
PATCH /api/v1/trips/{tripId}/start
Authorization: Bearer <accessToken>

Response: { trip: { id, status: "IN_PROGRESS", startedAt, ... } }
```

### 10. End Trip (Driver)

```http
PATCH /api/v1/trips/{tripId}/end
Authorization: Bearer <accessToken>

Response: { trip: {...}, summary: { totalScans, validScans, ... } }
```

---

## Ticket States

| State      | Description                      | Can Scan? |
| ---------- | -------------------------------- | --------- |
| `ACTIVE`   | Valid, not yet used, not expired | Yes       |
| `USED`     | Already scanned by driver        | No        |
| `EXPIRED`  | Past expiry time (60 min)        | No        |
| `REFUNDED` | Refunded to passenger wallet     | No        |

---

## Currency

- **All amounts in santim** (1 ETB = 100 santim)
- Display conversion: `balance / 100` ETB
- Example: `100000 santim = 1,000 ETB`

---

## Auth Headers

```http
# Access Token (required for most endpoints)
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Idempotency Key (required for wallet top-up and ticket purchase)
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

---

## Test Scenarios

### Happy Path - Passenger

1. Login → Get profile → View routes
2. Select route & stops → Get fare → Purchase ticket
3. View ticket with QR code → Show to driver

### Happy Path - Driver

1. Login → View trips → Start trip
2. Scan passenger QR → Validate ticket
3. View scan list → End trip

### Error Scenarios

- **Insufficient Balance**: Login as `+251922555555` (50 ETB), try buying expensive ticket
- **Expired Ticket**: Passenger 3 (`+251922444444`) has expired ticket
- **Already Used**: Passenger 2 (`+251922333333`) has used ticket

---

## Sample Route Data

**Route R01**: Megenagna ↔ 4 Kilo

- Stops: Megenagna → Bambis → Bole Michael → Mexico → 4 Kilo
- Fare: 500 santim per stop (5 ETB per stop)

**Route R02**: Mexico ↔ Piazza

- Stops: Mexico → Afincho Ber → Lideta → Merkato → Piazza
- Fare: 500 santim per stop

**Route R03**: CMC ↔ Gerji

- Stops: CMC → Megenagna → Summit → Gerji Mebrat Hail → Gerji
- Fare: 500 santim per stop

---

## Common Errors

| Code | Error                | Cause                                     |
| ---- | -------------------- | ----------------------------------------- |
| 400  | Bad Request          | Invalid request body or params            |
| 401  | Unauthorized         | Missing or invalid access token           |
| 402  | Payment Required     | Insufficient wallet balance               |
| 404  | Not Found            | Resource doesn't exist                    |
| 409  | Conflict             | Duplicate idempotency key or already used |
| 410  | Gone                 | Ticket expired                            |
| 422  | Unprocessable Entity | Validation error                          |
| 429  | Too Many Requests    | Rate limit exceeded                       |

---

## Refresh Token

Tokens expire after 15 minutes. Refresh before expiry:

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "..."
}

Response: { accessToken, refreshToken }
```

---

## Notifications

Passengers can receive:

- Push notifications (via FCM)
- SMS notifications

Register FCM token:

```http
PATCH /api/v1/users/me/fcm-token
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "fcmToken": "..."
}
```

---

## Offline Support (Driver)

Drivers can scan tickets offline and sync later:

```http
POST /api/v1/sync/validations
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "scans": [
    {
      "qrPayload": "...",
      "qrSignature": "...",
      "scannedAt": "2024-01-15T10:30:00Z",
      "tripId": "uuid",
      "isInspection": false
    }
  ]
}

Response: { processed: 1, results: [...] }
```

---

## Debugging

1. **Check Swagger docs**: http://localhost:3000/docs
2. **Verify auth token**: Decode JWT at https://jwt.io
3. **Check wallet balance**: `GET /api/v1/wallet/balance`
4. **View transaction history**: `GET /api/v1/wallet/transactions`
5. **Inspect test data**: See `prisma/TEST_DATA.md`

---

## Support Files

- **Full documentation**: `/prisma/TEST_DATA.md`
- **API schema**: Swagger docs
- **Database schema**: `/prisma/schema.prisma`
