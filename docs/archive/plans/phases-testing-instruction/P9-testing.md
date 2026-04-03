# Phase 9 Testing Instructions — Offline Cache, Hardening, Release

---

## Section 1 — Unit Tests

### 1.1 HealthService.getReadiness()

**File**: `apps/api/src/modules/health/health.service.spec.ts`

| Test                     | Input                                    | Expected Output                                      |
| ------------------------ | ---------------------------------------- | ---------------------------------------------------- |
| All dependencies healthy | PG ok, Redis ok, Meili ok                | `status: 'ok'`, all checks `'ok'`                    |
| Meilisearch unavailable  | PG ok, Redis ok, Meili `available=false` | `status: 'degraded'`, meili `'fail'`                 |
| PostgreSQL down          | PG throws, Redis ok, Meili ok            | `status: 'unhealthy'`, pg `'fail'`                   |
| Redis down               | PG ok, Redis returns false, Meili ok     | `status: 'unhealthy'`, redis `'fail'`                |
| Latency measurements     | PG ok, Redis ok, Meili ok                | All `latency_ms >= 0`                                |
| Version and uptime       | Any                                      | `version` is string, `uptime_seconds` is number >= 0 |

---

## Section 2 — Integration Tests

### 2.1 Health Readiness Endpoint

**Endpoint**: `GET /api/health/ready`

| Test                     | Expected Status | Expected Body                                                                                                                                                          |
| ------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Happy path (all deps up) | 200             | `{ status: 'ok', checks: { postgres: { status: 'ok', ... }, redis: { status: 'ok', ... }, meilisearch: { status: 'ok', ... } }, version: '...', uptime_seconds: ... }` |
| No auth required         | 200             | Response returned without Bearer token                                                                                                                                 |

### 2.2 RLS Leakage Tests (P6B — Payroll)

**File**: `apps/api/test/p6b-rls-leakage.e2e-spec.ts`

**API-Level Tests** (authenticate as Cedar, verify no Al Noor data):

- GET /api/v1/payroll/compensation → no Al Noor staff compensation records
- GET /api/v1/payroll/runs → no Al Noor payroll runs
- GET /api/v1/payroll/runs/:id/entries → no Al Noor entries (if run exists)

**Table-Level Tests** (query as Cedar via rls_test_user role):

- `staff_compensation`: no Al Noor rows
- `payroll_runs`: no Al Noor rows
- `payroll_entries`: no Al Noor rows
- `payslips`: no Al Noor rows

### 2.3 RLS Leakage Tests (P7 — Communications)

**File**: `apps/api/test/p7-rls-leakage.e2e-spec.ts`

**API-Level Tests**:

- GET /api/v1/announcements → no Al Noor announcements
- GET /api/v1/notifications → no Al Noor notifications
- GET /api/v1/parent-inquiries → no Al Noor inquiries
- GET /api/v1/website/pages → no Al Noor pages
- GET /api/v1/contact-submissions → no Al Noor submissions

**Table-Level Tests**:

- `announcements`: no Al Noor rows
- `notifications`: no Al Noor rows
- `notification_templates`: no Al Noor rows; platform rows (NULL tenant_id) ARE visible
- `parent_inquiries`: no Al Noor rows
- `parent_inquiry_messages`: no Al Noor rows
- `website_pages`: no Al Noor rows
- `contact_form_submissions`: no Al Noor rows

### 2.4 RLS Leakage Tests (P8 — Audit/Compliance/Import)

**File**: `apps/api/test/p8-rls-leakage.e2e-spec.ts`

**Table-Level Tests**:

- `audit_logs`: no Al Noor rows; platform rows (NULL tenant_id) ARE visible
- `compliance_requests`: no Al Noor rows
- `import_jobs`: no Al Noor rows
- `search_index_status`: no Al Noor rows

### 2.5 Comprehensive RLS Sweep

**File**: `apps/api/test/rls-comprehensive.e2e-spec.ts`

Programmatic test that iterates over all 75+ tenant-scoped tables and verifies no cross-tenant leakage at the database layer. Uses the same `queryAsCedar()` / `assertNoAlNoorRows()` pattern.

Special handling for dual-policy tables (`roles`, `role_permissions`, `notification_templates`, `audit_logs`): verify NULL tenant_id rows ARE visible.

### 2.6 PDF Snapshot Tests

**File**: `apps/api/test/pdf-snapshots.e2e-spec.ts`

12 snapshot tests (6 templates × 2 locales):

- Invoice EN/AR
- Receipt EN/AR
- Payslip EN/AR
- Report Card EN/AR
- Transcript EN/AR
- Household Statement EN/AR

Each renders HTML with deterministic data and compares via `toMatchSnapshot()`. CI fails on unexpected changes. To update snapshots: `jest --updateSnapshot`.

### 2.7 Critical Workflow Integration Tests

**File locations**: `apps/api/test/workflows/*.e2e-spec.ts`

#### Admissions Conversion

- Happy path: application submitted → reviewed → accepted → converted to student
- Verify: student created, household created/linked, application status updated
- Cross-tenant: Cedar cannot see Al Noor applications

#### Refund LIFO Reversal

- Happy path: invoice → payment → allocations → refund request
- Verify: LIFO allocation reversal, invoice status re-derived
- Edge: receipt immutability after refund

#### Household Merge

- Happy path: merge household B into A
- Verify: students transferred, financial records reassigned, B archived
- Edge: concurrency guard (simultaneous merge attempts)
- Cross-tenant: Cedar cannot access Al Noor households

#### Payroll Finalisation

- Happy path: create run → enter inputs → finalise
- Verify: entries frozen, payslips generated, sequence numbers correct
- Edge: cancel only in draft, mid-month rate change handling

#### Payment Allocation

- Happy path: multi-invoice household → FIFO allocation → completion
- Verify: invoice status derivation (partially_paid → paid)
- Edge: over-allocation prevention

---

## Section 3 — RLS Leakage Tests

### Test Structure (applies to ALL RLS tests)

1. **Setup**: Create NestJS test app, login as Cedar owner
2. **API-level**: For each tenant-scoped endpoint:
   - Authenticate as Cedar (Tenant B)
   - Call the endpoint
   - Assert: response contains NO Al Noor (Tenant A) data
   - Assert: serialised response does not contain Al Noor email domains or identifiers
3. **Table-level**: For each tenant-scoped table:
   - Create `rls_test_user` role (no BYPASSRLS)
   - Open Prisma interactive transaction
   - `SET LOCAL app.current_tenant_id` to Cedar's ID
   - `SET LOCAL ROLE rls_test_user`
   - `SELECT tenant_id::text FROM "{table}"`
   - Assert: no rows have Al Noor's tenant_id

### Tables Already Covered (P1–P6)

16 (P1) + 14 (P2) + 4 (P3) + 6 (P4A) + 5 (P4B) + 7 (P5) + 10 (P6) = **62 tables**

### Tables Added in P9

4 (P6B) + 7 (P7) + 4 (P8) = **15 tables**

### Comprehensive Sweep

The `rls-comprehensive.e2e-spec.ts` provides a single test that programmatically verifies ALL 75+ tenant-scoped tables, serving as a catch-all safety net.

---

## Section 4 — Manual QA Checklist

### 4.1 PWA Offline Cache

**Setup**: Build the web app (`pnpm --filter @school/web build`), start (`pnpm --filter @school/web start`).

- [ ] **EN — Install PWA**: Open Chrome, navigate to `/en/dashboard`, verify "Install" prompt appears
- [ ] **EN — Timetable offline**: Navigate to `/en/scheduling`, go offline (DevTools → Network → Offline), refresh page → cached timetable loads
- [ ] **EN — Class roster offline**: Navigate to `/en/classes`, go offline, refresh → cached roster loads
- [ ] **EN — Announcements offline**: Navigate to `/en/communications`, go offline, refresh → cached list loads
- [ ] **EN — Offline fallback**: Navigate to uncached page (e.g., `/en/students`) while offline → see bilingual offline page
- [ ] **AR — Same tests in Arabic**: Repeat all above at `/ar/*`
- [ ] **Cache update**: Go online, navigate normally → service worker updates in background
- [ ] **No mutations cached**: Attempt POST/PUT while offline → fails gracefully (no stale mutation)

### 4.2 Health Endpoint

- [ ] `GET /api/health` → returns `{ status: 'ok', checks: { postgres: 'up', redis: 'up' } }`
- [ ] `GET /api/health/ready` → returns detailed status with all three dependency checks and latency

### 4.3 RTL Regression (Arabic Locale)

For each page below, navigate in Arabic (ar) locale and verify:

- [ ] `dir="rtl"` on `<html>` element
- [ ] Sidebar is on the right side
- [ ] Text flows right-to-left
- [ ] Email addresses display LTR (wrapped in `dir="ltr"` spans)
- [ ] Phone numbers display LTR
- [ ] No physical CSS directional classes (ml-, mr-, pl-, pr-, text-left, text-right)

**Pages to check**:

- [ ] Dashboard (`/ar/dashboard`)
- [ ] Students list + detail (`/ar/students`, `/ar/students/[id]`)
- [ ] Staff list + detail (`/ar/staff`, `/ar/staff/[id]`)
- [ ] Households (`/ar/households`)
- [ ] Classes (`/ar/classes`)
- [ ] Admissions (`/ar/admissions`)
- [ ] Scheduling (`/ar/scheduling`)
- [ ] Attendance (`/ar/attendance`)
- [ ] Gradebook (`/ar/gradebook`)
- [ ] Finance: invoices, payments, fee structures (`/ar/finance/*`)
- [ ] Payroll: compensation, runs (`/ar/payroll/*`)
- [ ] Communications (`/ar/communications`)
- [ ] Settings (`/ar/settings/general`, `/ar/settings/branding`)

### 4.4 Dark Mode

- [ ] Toggle dark mode (via theme switcher or OS preference)
- [ ] Dashboard renders correctly (no white backgrounds, no unreadable text)
- [ ] Data tables have correct contrast
- [ ] Form inputs are readable
- [ ] Status badges have correct colours
- [ ] Charts are visible

### 4.5 Mobile Responsive

Test at 390×844 viewport (iPhone 14):

- [ ] Sidebar collapses to hamburger menu
- [ ] Tables scroll horizontally or stack vertically
- [ ] Forms are usable (inputs full-width, buttons reachable)
- [ ] Modals don't overflow viewport
- [ ] Touch targets are 44px minimum

### 4.6 PDF Templates

For each template, generate via the UI and verify:

- [ ] **Invoice** (EN/AR): school branding correct, line items render, totals correct, currency symbol
- [ ] **Receipt** (EN/AR): receipt number, payment details, allocation breakdown
- [ ] **Payslip** (EN/AR): employee details, salary breakdown, bank details masked
- [ ] **Report Card** (EN/AR): student info, subject grades, attendance summary, comments
- [ ] **Transcript** (EN/AR): multi-year academic history, correct period aggregation
- [ ] **Household Statement** (EN/AR): running balance, all entries, opening/closing balance

### 4.7 Cross-Tenant Isolation (Manual Smoke Test)

- [ ] Login as Al Noor admin → note a student name or invoice number
- [ ] Login as Cedar admin in a separate browser/incognito
- [ ] Verify the Al Noor student/invoice is NOT visible in Cedar
- [ ] Search for the Al Noor student name in Cedar → no results
- [ ] Try accessing an Al Noor-specific URL (e.g., `/api/v1/students/{alnoor_student_id}`) from Cedar session → 404

### 4.8 Demo Environment

- [ ] Run `pnpm seed:demo` → completes without errors
- [ ] Login as each role (owner, admin, teacher, parent) for both schools
- [ ] Verify academic structure seeded (year groups, subjects, periods)
- [ ] Navigate key pages — data is present and realistic
