# SmartBus Backend API

Backend service for the SmartBus digital ticketing and wallet system — a QR-based fare collection platform for public bus transit in Addis Ababa, Ethiopia.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Database Setup](#database-setup)
  - [Running the API](#running-the-api)
- [API Reference](#api-reference)
- [Authentication](#authentication)
- [Testing](#testing)
- [Code Quality](#code-quality)
- [Architecture Notes](#architecture-notes)

---

## Overview

SmartBus replaces the manual, cash-based fare collection system on Addis Ababa city buses with a mobile-first digital alternative. Passengers top up a wallet, purchase QR-coded tickets, and board buses where drivers scan the QR code — including in offline mode.

The backend exposes a versioned REST API consumed by the passenger app, the driver app, and the admin dashboard.

---

## Tech Stack

| Layer            | Technology                                          |
| ---------------- | --------------------------------------------------- |
| Runtime          | Node.js 20+ LTS                                     |
| Language         | TypeScript 5 (strict mode)                          |
| Framework        | NestJS 11                                           |
| ORM              | Prisma 6                                            |
| Database         | PostgreSQL 15 (can be used any latest 15+ version)  |
| Auth             | `@nestjs/passport` + `passport-jwt` + `@nestjs/jwt` |
| Password hashing | Argon2id (`argon2`)                                 |
| Validation       | `class-validator` + `class-transformer`             |
| Env validation   | Zod                                                 |
| API docs         | `@nestjs/swagger` (OpenAPI 3)                       |
| Testing          | Jest + Supertest                                    |
| Package manager  | npm                                                 |

---

## Project Structure

```
src/
├── main.ts                     # Bootstrap (Helmet, CORS, global pipes, Swagger)
├── app.module.ts               # Root module
├── common/
│   ├── config/                 # App config and environment validation (Zod)
│   ├── decorators/             # @CurrentUser, @Roles, @Public
│   ├── dto/                    # Shared DTOs (pagination)
│   ├── exceptions/             # Global exception filter
│   ├── guards/                 # JWT auth guard, roles guard, idempotency guard
│   ├── interceptors/           # Transform, logging, idempotency interceptors
│   └── utils/                  # Pagination helpers, crypto utilities
├── modules/
│   ├── auth/                   # Registration, OTP, login, token rotation, password reset
│   ├── users/                  # Profile management, FCM token registration
│   ├── notifications/          # SMS and Firebase push delivery
│   │   └── providers/          # SmsProvider, PushProvider
│   ├── health/                 # Health check endpoint
│   ├── routes/                 # Route and fare management (planned)
│   ├── tickets/                # Ticket lifecycle and QR signing (planned)
│   ├── validation/             # Ticket scanning and validation (planned)
│   ├── trips/                  # Trip management (planned)
│   ├── wallet/                 # Wallet and payment integration (planned)
│   ├── sync/                   # Offline sync and reconciliation (planned)
│   ├── analytics/              # Reporting (planned)
│   └── admin/                  # Admin operations (planned)
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts       # Singleton PrismaClient
└── jobs/                       # Scheduled tasks (ticket expiry, cleanup)

test/
└── unit/                       # Unit tests mirroring src/ structure
```

---

## Getting Started

### Prerequisites

- Node.js 20 LTS or later
- npm 10+
- Docker and Docker Compose (for the database)

### Installation

```bash
git clone https://github.com/pyankie/smart-bus.git
cd smart-bus
npm install
```

### Environment Variables

Copy the example file and fill in the required values:

```bash
cp .env.example .env
```

| Variable                 | Required | Description                                      |
| ------------------------ | -------- | ------------------------------------------------ |
| `DATABASE_URL`           | Yes      | PostgreSQL connection string                     |
| `JWT_SECRET`             | Yes      | Access token signing secret (min 32 chars)       |
| `JWT_REFRESH_SECRET`     | Yes      | Refresh token signing secret (min 32 chars)      |
| `JWT_ACCESS_EXPIRY`      | No       | Access token TTL (default: `15m`)                |
| `JWT_REFRESH_EXPIRY`     | No       | Refresh token TTL (default: `7d`)                |
| `SMS_PROVIDER_API_KEY`   | Yes      | SMS provider API key                             |
| `SMS_PROVIDER_URL`       | Yes      | SMS provider base URL                            |
| `PAYMENT_WEBHOOK_SECRET` | Yes      | Payment webhook signing secret                   |
| `FIREBASE_PROJECT_ID`    | No       | Firebase project ID (enables push notifications) |
| `FIREBASE_CLIENT_EMAIL`  | No       | Firebase service account email                   |
| `FIREBASE_PRIVATE_KEY`   | No       | Firebase private key (paste with literal `\n`)   |
| `PORT`                   | No       | Server port (default: `3000`)                    |
| `NODE_ENV`               | No       | `development` / `production` / `test`            |
| `SWAGGER_ENABLED`        | No       | Enable Swagger UI (default: `true`)              |
| `ENABLE_CRON`            | No       | Enable scheduled jobs (default: `false`)         |

Push notifications are optional. If the Firebase variables are not set, the server starts normally and push delivery is skipped with a warning.

### Database Setup

I used Docker compose because I had an existing PostgreSQL v15 image before. You can use any PostgreSQL 15+ instance (a locally installed too), just make sure to set the `DATABASE_URL` accordingly.
Start PostgreSQL:

```bash
docker compose up -d
```

Run migrations:

```bash
npm run prisma:migrate
```

Generate the Prisma client (run this after any schema change):

```bash
npm run prisma:generate
```

Optionally seed the database:

```bash
npm run prisma:seed
```

### Running the API

```bash
# Development (watch mode)
npm run start:dev

# Production
npm run build
npm run start:prod
```

The API is available at `http://localhost:3000/api/v1`.

Swagger UI is at `http://localhost:3000/docs` when `SWAGGER_ENABLED=true`.

---

## API Reference

All endpoints are under `/api/v1/`. Authenticated endpoints require a JWT access token in the `Authorization: Bearer <token>` header.

### Authentication

| Method | Endpoint                | Auth   | Description                                  |
| ------ | ----------------------- | ------ | -------------------------------------------- |
| POST   | `/auth/register`        | Public | Register a new user and trigger OTP delivery |
| POST   | `/auth/verify-otp`      | Public | Verify OTP (registration or password reset)  |
| POST   | `/auth/login`           | Public | Log in and receive access + refresh tokens   |
| POST   | `/auth/refresh`         | Public | Rotate the refresh token pair                |
| POST   | `/auth/logout`          | JWT    | Revoke the active refresh token              |
| POST   | `/auth/forgot-password` | Public | Send a password reset OTP                    |
| POST   | `/auth/reset-password`  | Public | Reset password with a valid OTP              |

### Users

| Method | Endpoint              | Auth | Description                              |
| ------ | --------------------- | ---- | ---------------------------------------- |
| GET    | `/users/me`           | JWT  | Get the current user's profile           |
| PATCH  | `/users/me`           | JWT  | Update the current user's profile        |
| PATCH  | `/users/me/fcm-token` | JWT  | Register or refresh the device FCM token |

### Health

| Method | Endpoint  | Auth   | Description            |
| ------ | --------- | ------ | ---------------------- |
| GET    | `/health` | Public | Service liveness check |

### Response format

Successful responses follow a consistent wrapper:

```json
{
  "success": true,
  "data": { ... }
}
```

Errors follow:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request",
  "timestamp": "2026-04-14T13:00:00.000Z"
}
```

### Idempotency

Wallet top-up and ticket purchase endpoints require an `Idempotency-Key: <uuid-v4>` request header. Duplicate requests within 24 hours return the original response without re-executing the operation.

---

## Authentication

### Credentials

Users can log in with any of the following identifiers:

- Phone number
- Email address
- FID (Fayda ID — Ethiopian national government ID)

FID is required at registration for passengers. It is optional for drivers and admins. All roles can use FID as a login identifier.

### Token lifecycle

- **Access token:** JWT, short-lived (default 15 minutes). Sent in `Authorization: Bearer` header.
- **Refresh token:** Longer-lived (default 7 days). Stored hashed in the database, rotated on every use.

### Login lockout

Login attempts are tracked per identifier in the `auth_security_events` table. Consecutive failures trigger progressive lockouts:

| Consecutive failures | Lockout duration |
| -------------------- | ---------------- |
| 3                    | 5 seconds        |
| 4                    | 30 seconds       |
| 5                    | 5 minutes        |
| 6                    | 15 minutes       |
| 7+                   | 1 hour           |

The server responds with `429 Too Many Requests` and a `Retry-After` header during a lockout.

---

## Testing

Unit tests live in `test/unit/`, mirroring the structure of `src/`.

```bash
# Run all unit tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:cov

# End-to-end tests
npm run test:e2e
```

Coverage target is 80% for service files. Test files use the same path aliases (`@common/*`, `@modules/*`) as source files.

---

## Code Quality

```bash
# Lint and auto-fix
npm run lint

# Format
npm run format
```

Pre-commit hooks (Husky + lint-staged) enforce linting and formatting on every commit. Commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
feat(auth): add refresh token rotation
fix(wallet): prevent negative balance on concurrent debit
chore(prisma): add index on scan_events.ticket_id
```

---

## Architecture Notes

**Modular monolith.** Each business domain is a self-contained NestJS module. Modules communicate through injected services, not direct database access across boundaries.

**Global guards and filters.** The JWT auth guard is applied globally. Routes opt out of authentication with the `@Public()` decorator. The global exception filter ensures every error response has the same shape.

**Idempotency.** Mutation endpoints that involve money or ticket state accept an `Idempotency-Key` header. The guard validates the key (UUID v4 via Zod), checks for a cached response, and the interceptor stores the response on the way out.

**Soft deletes.** User-facing entities carry a `deletedAt` timestamp. Hard deletes are not used for any entity that could affect audit trails or financial records.

**Offline support.** The driver app is designed to work without a network connection. The `sync` module (planned) reconciles locally-cached scan events with the server on reconnection.

**No external auth provider.** All credential storage — hashed passwords, phone numbers, FID — lives in the application's own PostgreSQL tables. There is no dependency on a third-party auth service.
