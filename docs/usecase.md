# SmartBus — Use Case Specifications (Backend API)

> Extracted from the SmartBus project document.  
> Scope: **Backend API endpoints** and business logic.

---

## Actors

| Actor               | Clients                 |
| ------------------- | ----------------------- |
| Passenger           | Mobile app (Flutter)    |
| Driver              | Mobile app (Flutter)    |
| Admin / Super-Admin | Web dashboard (Next.js) |
| Payment Provider    | Webhook caller          |
| SMS Provider        | External OTP service    |

---

## UC0001: Sign Up (Passenger)

**Trigger:** POST `/auth/register`
**Preconditions:** Phone/FID not already registered
**Main Flow:**

1. Client sends: phone, full name, optional email, FID, password
2. Server validates fields (name format, password strength, uniqueness)
3. Server sends SMS OTP to phone
4. Client submits OTP → POST `/auth/verify-otp`
5. Server verifies OTP, creates passenger account + wallet (balance = 0)
6. Returns success; client redirects to login

**Alt Flows:** Duplicate account → 409; Invalid fields → 422; OTP expired → 410; SMS failure → 503
**Postcondition:** Passenger row + wallet row created

---

## UC0002: Sign In (All Actors)

**Trigger:** POST `/auth/login`  
**Preconditions:** Account exists  
**Main Flow:**

1. Client sends: identifier (phone/email/FID), identifier type, password
2. Server checks rate-limit state → if locked, return 429 with retry-after
3. Server verifies credentials (Argon2id hash comparison)
4. On success → issue JWT access token + refresh token, reset fail counter
5. Return tokens + user profile

**Alt Flows:** Wrong password → increment fail counter, return 401; Account not found → 404; Account disabled → 403  
**Postcondition:** Valid session established

---

## UC0003: Sign Out

**Trigger:** POST `/auth/logout`  
**Preconditions:** Authenticated session  
**Main Flow:**

1. Server revokes refresh token (add to blacklist / delete from DB)
2. Return 204

**Postcondition:** Session invalidated

---

## UC0004: Reset Password

**Trigger:** POST `/auth/forgot-password`  
**Preconditions:** Account exists with matching phone + FID  
**Main Flow:**

1. Client sends: phone, FID
2. Server validates match, sends SMS OTP
3. Client submits OTP + new password → POST `/auth/reset-password`
4. Server verifies OTP, validates new password, updates hash

**Post:** Password updated; old sessions invalidated

---

## UC0005: Top Up Wallet

**Trigger:** POST `/wallet/topup`  
**Preconditions:** Authenticated passenger  
**Main Flow:**

1. Client sends: amount, payment method
2. Server validates amount (min/max), creates pending transaction with idempotency key
3. Server initiates payment with external provider, returns redirect/instructions
4. Payment provider sends webhook → POST `/webhook/payment`
5. Server verifies webhook signature, credits wallet, marks transaction complete

**Alt Flows:** Invalid amount → 422; Provider failure → 502; Duplicate webhook → idempotent ignore  
**Postcondition:** Wallet balance increased; transaction recorded

---

## UC0006: View/Search Routes

**Trigger:** GET `/routes` or GET `/routes/search?q=...`  
**Preconditions:** Authenticated user  
**Main Flow:**

1. Client requests route list or search (by departure, destination, stop, route number)
2. Server queries routes with stops and fares
3. Returns paginated route list with stop sequences and fares

**Postcondition:** Client has route data (can cache for offline)

---

## UC0007: Purchase Ticket & Generate QR

**Trigger:** POST `/tickets/purchase`  
**Preconditions:** Authenticated passenger, sufficient wallet balance  
**Main Flow:**

1. Client sends: route ID, boarding stop, drop-off stop
2. Server calculates fare from fare matrix
3. **Atomic transaction:** debit wallet → create ticket with 60-min expiry → generate QR payload with cryptographic signature
4. Return ticket details + signed QR payload

**Alt Flows:** Insufficient balance → 402; Server error → rollback, 500  
**Postcondition:** Ticket active; wallet debited; transaction logged

---

## UC0008: View Ticket & Wallet History

**Trigger:** GET `/tickets/history` or GET `/wallet/transactions`  
**Preconditions:** Authenticated passenger  
**Main Flow:**

1. Client sends filters (stop, route number, price, date range) + sort + pagination
2. Server queries and returns results

**Postcondition:** Client displays history

---

## UC0009: Scan & Validate Ticket

**Trigger:** POST `/tickets/validate`  
**Preconditions:** Authenticated driver, active trip  
**Main Flow:**

1. Client sends: QR payload (ticket ID, signature, metadata)
2. Server verifies cryptographic signature
3. Server checks ticket expiry
4. Server checks usage status (not already used)
5. Server marks ticket as "used", logs scan event
6. Returns validation result + passenger info

**Alt Flows:** Invalid signature → 400; Expired → 410; Already used → 409 + flag  
**Postcondition:** Ticket marked used; scan event logged

---

## UC0009-OFFLINE: Offline Scan Sync

**Trigger:** POST `/sync/validations`  
**Preconditions:** Driver back online with queued scans  
**Main Flow:**

1. Client sends batch of offline scan events (ticket ID, timestamp, local validation result)
2. Server reconciles: validates each, resolves conflicts (earliest timestamp wins)
3. Flags anomalies (duplicate scans across devices)
4. Returns reconciliation report

**Postcondition:** All offline scans persisted; anomalies flagged

---

## UC0010: View Trip Summary

**Trigger:** GET `/trips/:id/summary` or GET `/driver/trips`  
**Preconditions:** Authenticated driver  
**Main Flow:**

1. Server aggregates: scanned count, route, timing, metrics
2. Returns summary

---

## UC0011: Manage Users (Admin)

**Trigger:** CRUD on `/admin/users`  
**Preconditions:** Admin role  
**Main Flow:**

1. Admin creates/updates/disables/re-enables user accounts
2. Server validates permissions + input
3. Server applies changes, logs admin action

**Alt Flows:** Insufficient privilege → 403; Invalid data → 422

---

## UC0012: Manage Routes & Assign Drivers (Admin)

**Trigger:** CRUD on `/admin/routes`, POST `/admin/assignments`  
**Preconditions:** Admin role  
**Main Flow:**

1. Admin creates/updates routes with stops and fare rules
2. Admin assigns driver to route for a period
3. Server validates (no conflicts), updates DB, notifies driver

**Alt Flows:** Conflicting assignment → 409; Invalid route → 422

---

## UC0013: View Analytics & Reports (Admin)

**Trigger:** GET `/admin/analytics`, GET `/admin/reports/export`  
**Preconditions:** Admin role  
**Main Flow:**

1. Admin selects analytics type + filters (date, route, driver)
2. Server aggregates data
3. Returns dashboard data or generates export file (PDF/CSV)

**Alt Flows:** No data → empty result set; Service unavailable → 503
