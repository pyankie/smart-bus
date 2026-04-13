# SmartBus — Software Requirements Specification (Backend API)

> Extracted from the SmartBus senior research project document.  
> Scope: **Backend API only** (NestJS / Prisma / PostgreSQL).

---

## 1. Purpose & Scope

SmartBus is a QR-based mobile digital ticketing and wallet system for Addis Ababa's public buses. This SRS covers the **backend API** that powers:

- Passenger mobile app (Flutter/Android)
- Driver mobile app (Flutter/Android)
- Admin web dashboard (Next.js)

The backend is the single source of truth for authentication, wallet balances, ticket lifecycle, route data, analytics, and audit logs.

---

## 2. Actors

| ID  | Actor                | Description                                                            |
| --- | -------------------- | ---------------------------------------------------------------------- |
| A01 | **Passenger**        | Registers, tops up wallet, purchases tickets, presents QR for scanning |
| A02 | **Driver**           | Logs in, scans/validates QR tickets, views trip summaries              |
| A03 | **Admin**            | Manages users/routes/assignments, views analytics & reports            |
| A04 | **Super-Admin**      | Admin + account recovery, security overrides, assignment management    |
| A05 | **Payment Provider** | External service sending top-up confirmations via webhooks             |
| A06 | **SMS/OTP Provider** | External service delivering OTP codes                                  |

---

## 3. Functional Requirements

### 3.1 Authentication & Identity

| ID         | Requirement                                                                 |
| ---------- | --------------------------------------------------------------------------- |
| FR-AUTH-01 | Register with phone, optional email, password, full name, FID               |
| FR-AUTH-02 | Verify phone via SMS OTP during registration                                |
| FR-AUTH-03 | Validate password: min 6 chars, must contain letters + numbers              |
| FR-AUTH-04 | Validate full name: up to grandfather's name                                |
| FR-AUTH-05 | Login with phone, email, or FID (user selects type)                         |
| FR-AUTH-06 | Progressive rate-limiting: 5s → 30s → 5min → 15min → 1hr after 1–5 failures |
| FR-AUTH-07 | Password reset via phone + FID with SMS OTP                                 |
| FR-AUTH-08 | Issue JWT access + refresh tokens on login                                  |
| FR-AUTH-09 | Invalidate session on sign-out (revoke refresh token)                       |
| FR-AUTH-10 | Track auth security events (failed logins, lockouts)                        |

### 3.2 Wallet & Payments

| ID        | Requirement                                                                    |
| --------- | ------------------------------------------------------------------------------ |
| FR-WAL-01 | Display wallet balance                                                         |
| FR-WAL-02 | Top up wallet via external payment gateway (webhook confirmation)              |
| FR-WAL-03 | Deduct fare from wallet on ticket purchase (atomic)                            |
| FR-WAL-04 | Auto-refund wallet when ticket expires unused                                  |
| FR-WAL-05 | Record all wallet transactions (top-up, payment, refund) with idempotency keys |
| FR-WAL-06 | Enforce min/max top-up amounts                                                 |

### 3.3 Routes & Fares

| ID        | Requirement                                                                 |
| --------- | --------------------------------------------------------------------------- |
| FR-RTE-01 | CRUD operations for routes (admin)                                          |
| FR-RTE-02 | Routes modeled as ordered collections of stops                              |
| FR-RTE-03 | Fare matrix between any two stops on a route                                |
| FR-RTE-04 | Search routes by departure, destination, intermediate stop, or route number |
| FR-RTE-05 | Serve route data for client-side caching (offline access)                   |

### 3.4 Ticket Management

| ID        | Requirement                                                                               |
| --------- | ----------------------------------------------------------------------------------------- |
| FR-TKT-01 | Purchase ticket: validate balance → debit wallet → issue ticket (atomic)                  |
| FR-TKT-02 | Ticket contains: QR payload, purchase timestamp, expiry (60 min), cryptographic signature |
| FR-TKT-03 | Mark ticket as "used" on successful scan                                                  |
| FR-TKT-04 | Reject already-used tickets (single-use enforcement)                                      |
| FR-TKT-05 | Auto-expire tickets after 60 minutes, trigger wallet refund                               |
| FR-TKT-06 | Ticket history with search/filter (stop, route number, price, date)                       |
| FR-TKT-07 | Support ticket data caching for offline display                                           |
| FR-TKT-08 | Idempotent ticket issuance to prevent double-purchasing                                   |

### 3.5 Ticket Validation (Driver)

| ID        | Requirement                                                                      |
| --------- | -------------------------------------------------------------------------------- |
| FR-VAL-01 | Validate ticket: decode QR → check signature → check expiry → check usage status |
| FR-VAL-02 | Log every scan event (timestamp, driver, ticket, result)                         |
| FR-VAL-03 | Support offline validation with local rules + queued sync                        |
| FR-VAL-04 | Inspection mode: rescan without modifying ticket state                           |
| FR-VAL-05 | Flag previously-scanned passengers in scanned-users list                         |
| FR-VAL-06 | Batch sync of queued offline validations                                         |

### 3.6 Trip Management

| ID        | Requirement                                                    |
| --------- | -------------------------------------------------------------- |
| FR-TRP-01 | Trip = route instance at a time, linking driver + bus          |
| FR-TRP-02 | Record transported-user statistics per trip                    |
| FR-TRP-03 | Driver trip history and summary (scanned count, route, timing) |

### 3.7 Admin Operations

| ID        | Requirement                                                   |
| --------- | ------------------------------------------------------------- |
| FR-ADM-01 | CRUD user accounts (create, view, update, disable, re-enable) |
| FR-ADM-02 | CRUD routes and manage stops/fare rules                       |
| FR-ADM-03 | Assign/reassign drivers to routes                             |
| FR-ADM-04 | Role-based access: admin, super-admin                         |
| FR-ADM-05 | Activity logs for all admin actions                           |
| FR-ADM-06 | Notify drivers of assignment changes                          |

### 3.8 Analytics & Reporting

| ID        | Requirement                                                           |
| --------- | --------------------------------------------------------------------- |
| FR-ANL-01 | System-wide stats: ticket usage, trip history, user activity, revenue |
| FR-ANL-02 | Filter by date range, route, driver                                   |
| FR-ANL-03 | Anomaly detection (repeated scans, suspicious patterns)               |
| FR-ANL-04 | Export reports (PDF/CSV)                                              |

### 3.9 Notifications

| ID        | Requirement                                             |
| --------- | ------------------------------------------------------- |
| FR-NTF-01 | Push notification: ticket scanned                       |
| FR-NTF-02 | Push notification: ticket nearing expiration            |
| FR-NTF-03 | Push notification: driver route assignment/reassignment |
| FR-NTF-04 | SMS OTP for registration and password reset             |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| ID          | Requirement                    | Target                             |
| ----------- | ------------------------------ | ---------------------------------- |
| NFR-PERF-01 | API response time              | ≤ 2 seconds                        |
| NFR-PERF-02 | QR validation response         | ≤ 1 second                         |
| NFR-PERF-03 | Wallet top-up confirmation     | ≤ 5 seconds after payment callback |
| NFR-PERF-04 | Concurrent active users        | ≥ 10,000                           |
| NFR-PERF-05 | Peak ticket transactions       | ≥ 100 per minute                   |
| NFR-PERF-06 | Offline data sync on reconnect | ≤ 10 seconds                       |

### 4.2 Reliability

| ID         | Requirement                                          |
| ---------- | ---------------------------------------------------- |
| NFR-REL-01 | Uptime ≥ 99.5% (excluding scheduled maintenance)     |
| NFR-REL-02 | Exactly-once ticket validation processing            |
| NFR-REL-03 | No ticket data loss during network disruption        |
| NFR-REL-04 | Atomic wallet transactions (no partial debit/credit) |

### 4.3 Security

| ID         | Requirement                                                   |
| ---------- | ------------------------------------------------------------- |
| NFR-SEC-01 | Argon2id for password hashing                                 |
| NFR-SEC-02 | AES-256 for sensitive data encryption at rest                 |
| NFR-SEC-03 | HTTPS (TLS) for all client–server communication               |
| NFR-SEC-04 | JWT with short-lived access + long-lived refresh tokens       |
| NFR-SEC-05 | Input validation against SQL injection, XSS, request spoofing |
| NFR-SEC-06 | Webhook signature verification (payment provider)             |
| NFR-SEC-07 | Progressive login rate-limiting                               |
| NFR-SEC-08 | Cryptographic signing of QR ticket payloads                   |

### 4.4 Scalability

| ID         | Requirement                                    |
| ---------- | ---------------------------------------------- |
| NFR-SCL-01 | Stateless backend for horizontal scaling       |
| NFR-SCL-02 | Add routes/stops without downtime              |
| NFR-SCL-03 | Database indexing for high-load query patterns |

### 4.5 Maintainability

| ID         | Requirement                                                                      |
| ---------- | -------------------------------------------------------------------------------- |
| NFR-MNT-01 | Modular architecture (auth, wallet, ticketing, scanning updatable independently) |
| NFR-MNT-02 | API documentation (Swagger/OpenAPI)                                              |
| NFR-MNT-03 | Versioned logs for debugging                                                     |
| NFR-MNT-04 | System logs retained ≥ 12 months                                                 |

### 4.6 Data Integrity

| ID        | Requirement                                                |
| --------- | ---------------------------------------------------------- |
| NFR-DI-01 | Consistent ticket records across server + client caches    |
| NFR-DI-02 | Immutable ticket data after issuance (except auto-expiry)  |
| NFR-DI-03 | Scanned-user lists cannot be altered by drivers            |
| NFR-DI-04 | All scan events logged with timestamps + driver ID         |
| NFR-DI-05 | Fraud detection ≥ 95% accuracy for anomalous scan patterns |

---

## 5. External Interfaces

| Interface         | Protocol          | Direction | Purpose                                           |
| ----------------- | ----------------- | --------- | ------------------------------------------------- |
| Passenger App     | REST/HTTPS + JSON | Inbound   | Auth, wallet, tickets, routes                     |
| Driver App        | REST/HTTPS + JSON | Inbound   | Auth, scan validation, trip summary, offline sync |
| Admin Dashboard   | REST/HTTPS + JSON | Inbound   | Management, analytics, reports                    |
| Payment Provider  | HTTPS webhooks    | Inbound   | Top-up confirmation                               |
| SMS/OTP Provider  | HTTPS             | Outbound  | OTP delivery                                      |
| Push Notification | FCM/HTTPS         | Outbound  | Alerts to mobile clients                          |

---

## 6. Constraints

- Initial deployment: Android only (8.0+ / API 26)
- No real-time GPS tracking or bus location
- No NFC/hardware turnstile integration
- Offline sync requires periodic internet
- Government approval needed for pilot deployment
- Ethiopian telecom/payment ecosystem integration
