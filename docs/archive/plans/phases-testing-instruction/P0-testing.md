# P0 Testing Instructions

## Section 1 — Unit Tests

### 1.1 Custom ESLint Rules

**File: `packages/eslint-config/tests/no-sequential-transaction.test.js`** (already exists)

| Test                               | Description                                                    |
| ---------------------------------- | -------------------------------------------------------------- |
| PASS: interactive transaction      | `prisma.$transaction(async (tx) => { ... })` should be allowed |
| FAIL: sequential/array transaction | `prisma.$transaction([query1, query2])` should report error    |
| PASS: non-transaction call         | `prisma.user.findMany()` should be allowed                     |

**File: `packages/eslint-config/tests/no-raw-sql-outside-rls.test.js`** (already exists)

| Test                                           | Description                        |
| ---------------------------------------------- | ---------------------------------- |
| FAIL: $executeRawUnsafe in service file        | Should report error                |
| FAIL: $queryRawUnsafe in service file          | Should report error                |
| PASS: $executeRawUnsafe in rls.middleware.ts   | Allowed in RLS middleware          |
| PASS: $executeRawUnsafe in tenant-aware-job.ts | Allowed in tenant-aware base class |
| PASS: $executeRawUnsafe in migration file      | Allowed in migrations              |
| PASS: $executeRawUnsafe in seed file           | Allowed in seed files              |

**File: `packages/eslint-config/tests/no-physical-css-direction.test.js`** (already exists)

| Test                              | Description                           |
| --------------------------------- | ------------------------------------- |
| FAIL: className with `ml-4`       | Should suggest `ms-4`                 |
| FAIL: className with `mr-4`       | Should suggest `me-4`                 |
| FAIL: className with `pl-4`       | Should suggest `ps-4`                 |
| FAIL: className with `pr-4`       | Should suggest `pe-4`                 |
| FAIL: className with `text-left`  | Should suggest `text-start`           |
| FAIL: className with `text-right` | Should suggest `text-end`             |
| FAIL: className with `rounded-l-` | Should suggest `rounded-s-`           |
| FAIL: className with `rounded-r-` | Should suggest `rounded-e-`           |
| FAIL: className with `border-l-`  | Should suggest `border-s-`            |
| FAIL: className with `border-r-`  | Should suggest `border-e-`            |
| FAIL: className with `left-0`     | Should suggest `start-0`              |
| FAIL: className with `right-0`    | Should suggest `end-0`                |
| PASS: className with `ms-4`       | Logical equivalent allowed            |
| PASS: className with `text-start` | Logical equivalent allowed            |
| PASS: non-JSX string literal      | Should not flag non-className strings |

### 1.2 Shared Package — Zod Schemas

**File: `packages/shared/src/schemas/pagination.schema.spec.ts`** (to create)

| Test                           | Description                 | Input         | Expected                                   |
| ------------------------------ | --------------------------- | ------------- | ------------------------------------------ |
| should accept valid pagination | `{ page: 1, pageSize: 20 }` | Valid object  | Parse succeeds                             |
| should use defaults            | `{}`                        | Empty object  | `{ page: 1, pageSize: 20, order: 'desc' }` |
| should reject page < 1         | `{ page: 0 }`               | Invalid page  | Zod error                                  |
| should reject pageSize > 100   | `{ pageSize: 200 }`         | Too large     | Zod error                                  |
| should accept valid sort order | `{ order: 'asc' }`          | Valid order   | Parse succeeds                             |
| should reject invalid order    | `{ order: 'random' }`       | Invalid value | Zod error                                  |

**File: `packages/shared/src/schemas/auth.schema.spec.ts`** (to create)

| Test                                           | Description                                          | Input          | Expected       |
| ---------------------------------------------- | ---------------------------------------------------- | -------------- | -------------- |
| loginSchema: accept valid credentials          | `{ email: "test@school.com", password: "Pass123!" }` | Valid          | Parse succeeds |
| loginSchema: reject empty email                | `{ email: "", password: "pass" }`                    | Invalid email  | Zod error      |
| loginSchema: reject invalid email              | `{ email: "not-email", password: "pass" }`           | Invalid email  | Zod error      |
| loginSchema: reject empty password             | `{ email: "a@b.com", password: "" }`                 | Empty password | Zod error      |
| refreshTokenSchema: accept valid token         | `{ refreshToken: "some-token" }`                     | Valid          | Parse succeeds |
| refreshTokenSchema: reject empty token         | `{ refreshToken: "" }`                               | Empty          | Zod error      |
| passwordResetRequestSchema: accept valid email | `{ email: "test@school.com" }`                       | Valid          | Parse succeeds |

### 1.3 API — AuthService

**File: `apps/api/src/modules/auth/auth.service.spec.ts`** (to create)

| Test                                                     | Description                                                            |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| should sign a valid JWT token                            | Call `signAccessToken()` with mock payload, verify it returns a string |
| should verify a valid JWT token                          | Sign then verify, check payload matches                                |
| should reject expired JWT token                          | Sign with 0s expiry, verify throws                                     |
| should create session in Redis                           | Call `createSession()`, verify Redis SET was called                    |
| should delete session from Redis                         | Call `deleteSession()`, verify Redis DEL was called                    |
| should check brute force — below threshold               | 4 failed attempts → should NOT be locked                               |
| should check brute force — first threshold (5 attempts)  | 5 failed attempts → locked for 30s                                     |
| should check brute force — second threshold (8 attempts) | 8 failed attempts → locked for 2m                                      |
| should check brute force — third threshold (10 attempts) | 10 failed attempts → locked for 30m                                    |
| should increment failed login counter                    | Call `recordFailedLogin()`, verify Redis INCR                          |
| should reset failed login counter on success             | Call `resetFailedLogins()`, verify Redis DEL                           |

### 1.4 API — HealthService

**File: `apps/api/src/modules/health/health.service.spec.ts`** (to create)

| Test                                           | Description                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| should return healthy when PG and Redis are up | Mock both OK → `{ status: 'ok', checks: { postgres: 'up', redis: 'up' } }`            |
| should return unhealthy when PG is down        | Mock PG failure → `{ status: 'error', checks: { postgres: 'down', redis: 'up' } }`    |
| should return unhealthy when Redis is down     | Mock Redis failure → `{ status: 'error', checks: { postgres: 'up', redis: 'down' } }` |

### 1.5 API — ZodValidationPipe

**File: `apps/api/src/common/pipes/zod-validation.pipe.spec.ts`** (to create)

| Test                                              | Description                                                    |
| ------------------------------------------------- | -------------------------------------------------------------- |
| should pass through valid data                    | Provide valid input matching schema → returns transformed data |
| should throw BadRequestException for invalid data | Provide invalid input → throws with Zod error details          |

### 1.6 API — ResponseTransformInterceptor

**File: `apps/api/src/common/interceptors/response-transform.interceptor.spec.ts`** (to create)

| Test                                              | Description                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------- |
| should wrap response in { data: T } envelope      | Controller returns `{ id: 1 }` → response is `{ data: { id: 1 } }`        |
| should not double-wrap already-enveloped response | Controller returns `{ data: { id: 1 } }` → stays as-is if already wrapped |

### 1.7 API — AllExceptionsFilter

**File: `apps/api/src/common/filters/all-exceptions.filter.spec.ts`** (to create)

| Test                                           | Description                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| should format HttpException with correct shape | Throw 400 → `{ error: { code: 'BAD_REQUEST', message: '...' } }`                                       |
| should format unknown exceptions as 500        | Throw generic Error → `{ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } }` |
| should preserve status code from HttpException | Throw 404 → response status is 404                                                                     |

### 1.8 Worker — TenantAwareJob

**File: `apps/worker/src/base/tenant-aware-job.spec.ts`** (to create)

| Test                                      | Description                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| should reject job without tenant_id       | Call `execute({})` → throws "missing tenant_id"                                                   |
| should set RLS context via SET LOCAL      | Mock Prisma, call execute with valid tenant_id → verify `$executeRawUnsafe` called with SET LOCAL |
| should call processJob within transaction | Verify `processJob` is called inside `$transaction`                                               |

### 1.9 API — RLS Middleware

**File: `apps/api/src/common/middleware/rls.middleware.spec.ts`** (to create)

| Test                                     | Description                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| should return extended Prisma client     | Call `createRlsClient()` with tenant_id → returns client                  |
| should set tenant context in transaction | Execute a transaction → verify SET LOCAL is called with correct tenant_id |

---

## Section 2 — Integration Tests

### 2.1 Health Check Endpoint

**File: `apps/api/test/health.e2e-spec.ts`** (to create)

| Test                                        | Method | Path          | Expected                                                        |
| ------------------------------------------- | ------ | ------------- | --------------------------------------------------------------- |
| should return 200 when all services healthy | GET    | `/api/health` | `200 { status: 'ok', checks: { postgres: 'up', redis: 'up' } }` |

**Prerequisites:** Running PostgreSQL (port 5553) and Redis (port 5554) via docker-compose.

### 2.2 Auth Endpoints (Scaffold)

**File: `apps/api/test/auth.e2e-spec.ts`** (to create)

| Test                            | Method | Path                   | Expected                                     |
| ------------------------------- | ------ | ---------------------- | -------------------------------------------- |
| POST /login should return 501   | POST   | `/api/v1/auth/login`   | `501 { error: { code: 'NOT_IMPLEMENTED' } }` |
| POST /refresh should return 501 | POST   | `/api/v1/auth/refresh` | `501 { error: { code: 'NOT_IMPLEMENTED' } }` |
| POST /logout should return 501  | POST   | `/api/v1/auth/logout`  | `501 { error: { code: 'NOT_IMPLEMENTED' } }` |

### 2.3 Web Health Check

**File: `apps/web/e2e/health.spec.ts`** (to create, or test manually)

| Test              | Method | Path          | Expected               |
| ----------------- | ------ | ------------- | ---------------------- |
| should return 200 | GET    | `/api/health` | `200 { status: 'ok' }` |

---

## Section 3 — RLS Leakage Tests

No tenant-scoped tables exist in P0. RLS leakage tests will begin in P1 when the first tenant-scoped tables are created.

**Structural verification for P0:**

| Test                                                  | Description                              |
| ----------------------------------------------------- | ---------------------------------------- |
| TenantAwareJob rejects missing tenant_id              | Covered in unit tests (Section 1.8)      |
| RLS middleware sets SET LOCAL correctly               | Covered in unit tests (Section 1.9)      |
| ESLint blocks $executeRawUnsafe outside allowed files | Covered in lint rule tests (Section 1.1) |
| ESLint blocks sequential transactions                 | Covered in lint rule tests (Section 1.1) |

---

## Section 4 — Manual QA Checklist

### 4.1 Build & Tooling Verification

- [ ] Run `pnpm install` — completes without errors
- [ ] Run `pnpm type-check` — all 6 packages pass (0 errors)
- [ ] Run `pnpm lint` — all 6 packages pass (warnings OK, no errors)
- [ ] Run `pnpm build` — all 3 apps build successfully

### 4.2 Docker Services

- [ ] Run `docker compose up -d` — PostgreSQL, Redis, Meilisearch all healthy
- [ ] Verify PostgreSQL on port 5553: `psql -h localhost -p 5553 -U postgres -d school_os -c "SELECT 1"`
- [ ] Verify Redis on port 5554: `redis-cli -p 5554 ping` → PONG

### 4.3 API Server

- [ ] Start: `pnpm --filter api dev`
- [ ] Verify NestJS starts on port 5552
- [ ] GET `http://localhost:5552/api/health` → 200 with `{ status: 'ok', checks: { postgres: 'up', redis: 'up' } }`
- [ ] POST `http://localhost:5552/api/v1/auth/login` → 501
- [ ] POST `http://localhost:5552/api/v1/auth/refresh` → 501
- [ ] POST `http://localhost:5552/api/v1/auth/logout` → 501

### 4.4 Web App (English — LTR)

- [ ] Start: `pnpm --filter web dev`
- [ ] Open `http://localhost:5551/en`
- [ ] Verify redirect to `/en/dashboard`
- [ ] Verify `<html lang="en" dir="ltr">`
- [ ] Verify sidebar renders with nav sections (Overview, People, Academics, Operations, School)
- [ ] Verify top bar renders with search trigger
- [ ] Verify 4 stat cards render on dashboard
- [ ] Verify empty state renders below stat cards
- [ ] Press ⌘K (Mac) or Ctrl+K (Windows) → command palette opens
- [ ] Press Escape → command palette closes
- [ ] Toggle dark mode → theme switches, colours update
- [ ] Resize browser to < 1024px → sidebar collapses to mobile overlay
- [ ] GET `http://localhost:5551/api/health` → 200

### 4.5 Web App (Arabic — RTL)

- [ ] Open `http://localhost:5551/ar`
- [ ] Verify redirect to `/ar/dashboard`
- [ ] Verify `<html lang="ar" dir="rtl">`
- [ ] Verify sidebar renders on the RIGHT side
- [ ] Verify all text is right-aligned
- [ ] Verify nav labels are in Arabic
- [ ] Verify stat cards display correctly in RTL
- [ ] Verify no layout breaking or overflow issues

### 4.6 Platform Admin

- [ ] Open `http://localhost:5551/en/admin`
- [ ] Verify platform admin layout renders (English only)
- [ ] Verify stat cards render

### 4.7 Worker

- [ ] Start: `pnpm --filter worker dev`
- [ ] Verify NestJS starts on port 5556
- [ ] GET `http://localhost:5556/health` → 200

### 4.8 ESLint Custom Rules

- [ ] Create a test file with `ml-4` in a className → lint reports error with suggestion to use `ms-4`
- [ ] Create a test file with `prisma.$transaction([...])` → lint reports error
- [ ] Create a test file with `$executeRawUnsafe` in a service → lint reports error
- [ ] Verify same `$executeRawUnsafe` in `rls.middleware.ts` → lint passes

### 4.9 Prisma

- [ ] Run `pnpm --filter @school/prisma generate` — generates client without errors
- [ ] Verify `packages/prisma/schema.prisma` has datasource and generator, no models
