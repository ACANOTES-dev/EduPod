# Phase 9 — Implementation Plan: Offline Cache, Hardening, Release

## Section 1 — Overview

Phase 9 is the final hardening and release-readiness phase. **No new features are built.** The focus is on: (1) PWA service worker for offline read-only caching of key operational views, (2) comprehensive test suites that validate every security boundary, PDF template, RTL layout, and critical business workflow, (3) load and performance testing, (4) operational documentation (runbooks, backup drills, production readiness checklist), and (5) a demo environment with realistic sample data.

This phase depends on the entire system being stable across all prior phases (P0–P8). It imports no new modules but exercises the full breadth of existing services, endpoints, and frontend pages.

### Prior-Phase Dependencies

- **All 46 backend modules** (P0–P8) — tested for RLS, permissions, business logic
- **All 14 PDF templates** (P5–P6B) — snapshot-tested in both locales
- **All 208+ frontend pages** (P0–P8) — visual regression in en/ar, dark mode, mobile
- **All 30+ BullMQ processors** (P0–P8) — exercised in integration tests
- **Playwright visual regression foundation** (P0) — `apps/web/e2e/` with en-ltr and ar-rtl projects
- **Existing RLS leakage tests** (P1, P2, P3, P4A, P4B, P5, P6) — extended to cover P6B, P7, P8 tables
- **Seed data** (all phases) — both Al Noor and Cedar tenants with full dev-data
- **CI pipeline** (`.github/workflows/ci.yml`) — extended with new test stages

---

## Section 2 — Database Changes

**No schema changes.** Phase 9 does not create, modify, or migrate any tables. All work targets the test layer, service worker, documentation, and CI pipeline.

The only database-adjacent activity is the **backup restore drill** (Section 6), which validates the existing backup/restore procedure documented in the runbook.

---

## Section 3 — API Endpoints

**No new API endpoints.** Phase 9 tests existing endpoints exhaustively but does not add any.

One **modification** to an existing endpoint:

### `GET /api/v1/health/ready` (modify)
- **Current**: returns `{ status: 'ok' }`
- **Enhancement**: add checks for PostgreSQL connectivity, Redis connectivity, Meilisearch availability, and BullMQ queue responsiveness. Returns `503` if any critical dependency is unhealthy.
- **Purpose**: Kubernetes/ECS readiness probe for zero-downtime deployments
- **No permission required** (public health endpoint)
- **Response schema**:
  ```typescript
  {
    status: 'ok' | 'degraded' | 'unhealthy',
    checks: {
      postgres: { status: 'ok' | 'fail', latency_ms: number },
      redis: { status: 'ok' | 'fail', latency_ms: number },
      meilisearch: { status: 'ok' | 'fail', latency_ms: number },
    },
    version: string,
    uptime_seconds: number,
  }
  ```
- **Service method**: `HealthService.getReadiness()`

---

## Section 4 — Service Layer

### 4.1 `HealthService` (modify)

**File**: `apps/api/src/modules/health/health.service.ts`

- **`getReadiness()`**: New method. Checks PostgreSQL (lightweight query `SELECT 1`), Redis (`PING`), Meilisearch (`GET /health`). Measures latency. Returns structured status. Does NOT set RLS context (platform-level check).

### 4.2 No Other Service Changes

All other service classes remain unchanged. Tests exercise them via their existing interfaces.

---

## Section 5 — Frontend Pages and Components

### 5.1 Service Worker (`apps/web/public/sw.js`)

**Type**: Static JavaScript file served from `/public/`
**Not a page** — this is the PWA offline cache engine.

**Caching strategy**:
- **App shell** (precache at install): `/_next/static/**`, locale JSON bundles (`/messages/en.json`, `/messages/ar.json`), Noto Sans Arabic font files, manifest.json, favicon
- **Operational views** (runtime cache, stale-while-revalidate): timetable page (`/[locale]/(school)/scheduling/*`), class roster pages (`/[locale]/(school)/classes/*`), announcements list (`/[locale]/(school)/communications`)
- **API data** (runtime cache, network-first with 5-minute stale fallback): `GET /api/v1/schedules/timetable/*`, `GET /api/v1/classes`, `GET /api/v1/announcements?status=published`
- **Never cache**: mutations (POST/PUT/PATCH/DELETE), auth endpoints, PDF render endpoints
- **Cache versioning**: `CACHE_VERSION` constant bumped on each deploy, old caches purged in `activate` event
- **Offline fallback page**: `/offline.html` — minimal page with "You are offline. Cached data shown below may be stale." message in both en/ar

### 5.2 Service Worker Registration (`apps/web/src/app/layout.tsx` modification)

- Register `sw.js` in the root layout's `useEffect`, only in production (`process.env.NODE_ENV === 'production'`)
- Check for updates on every navigation via `registration.update()`
- Show toast when new version available: "New version available. Reload to update."

### 5.3 Offline Fallback Page (`apps/web/public/offline.html`)

- Static HTML (no React)
- Bilingual heading: "You are offline" / "أنت غير متصل"
- Explains cached data may be stale
- Styled with inline CSS matching the design system's warm white background and emerald accent

### 5.4 PWA Icon Assets (`apps/web/public/icons/`)

- `icon-192x192.png` — 192px square, emerald-on-white "S" lettermark
- `icon-512x512.png` — 512px square, same design
- `icon-maskable-512x512.png` — maskable variant with safe zone padding
- Referenced in updated `manifest.json`

### 5.5 Updated Manifest (`apps/web/public/manifest.json`)

- Add `icons` array with all three icon entries
- Add `scope: "/"`
- Add `id: "/"`
- Add `categories: ["education"]`
- Keep existing `display: "standalone"`, `background_color`, `theme_color`

### 5.6 No New Route Pages

No new frontend routes are created. All visual regression, RTL, and E2E tests use existing pages.

---

## Section 6 — Background Jobs

**No new background jobs.** Phase 9 does not add any BullMQ processors or queues.

---

## Section 7 — Implementation Order

### Step 1: Health Endpoint Enhancement
1. Modify `HealthService` to add `getReadiness()` with dependency checks
2. Update `HealthController` to expose `GET /api/v1/health/ready`
3. Unit test for `getReadiness()`

### Step 2: PWA Service Worker & Offline Cache
1. Create `apps/web/public/sw.js` with caching strategies
2. Create `apps/web/public/offline.html`
3. Create PWA icon assets (placeholder PNGs)
4. Update `manifest.json` with icons and scope
5. Add service worker registration to root layout
6. Manual verification: build, serve, go offline, verify cached views load

### Step 3: RLS Leakage Test Suite — Complete Coverage
Extend the existing RLS test infrastructure to cover every tenant-scoped table. Create new test files for phases that lack RLS coverage:
1. `apps/api/test/p6b-rls-leakage.e2e-spec.ts` — payroll tables: `staff_compensation`, `payroll_runs`, `payroll_entries`, `payslips`
2. `apps/api/test/p7-rls-leakage.e2e-spec.ts` — communications tables: `announcements`, `notifications`, `notification_templates` (tenant-scoped subset), `parent_inquiries`, `parent_inquiry_messages`, `website_pages`, `contact_form_submissions`
3. `apps/api/test/p8-rls-leakage.e2e-spec.ts` — audit/compliance/import tables: `audit_logs` (tenant-scoped subset), `compliance_requests`, `import_jobs`, `search_index_status`
4. `apps/api/test/rls-comprehensive.e2e-spec.ts` — exhaustive table-level test that iterates over EVERY tenant-scoped table in the schema and verifies no cross-tenant leakage at the database layer (programmatic, not per-endpoint)

### Step 4: PDF Snapshot Test Suite
1. Create `apps/api/test/pdf-snapshots.e2e-spec.ts`
2. For each template (report-card, transcript, invoice, receipt, payslip, household-statement) × each locale (en, ar):
   - Render with deterministic seed data
   - Compare against stored snapshot (HTML output, not pixel-level PDF)
   - CI fails on unexpected changes
3. Store snapshots in `apps/api/test/__snapshots__/pdf/`

### Step 5: RTL Regression Test Suite
1. Create `apps/web/e2e/visual/rtl-regression.spec.ts`
2. Screenshot every major school-facing page in Arabic locale:
   - Dashboard, students list, student detail, staff list, staff detail
   - Households, classes, admissions, scheduling, attendance
   - Gradebook, finance (invoices, payments, fee structures), payroll
   - Communications, settings, reports
3. Verify `dir="rtl"` on `<html>` element
4. Verify no physical directional CSS classes leak into rendered output (programmatic check via `page.evaluate`)
5. Verify LTR enforcement on emails, URLs, phone numbers via `dir="ltr"` span wrappers

### Step 6: Visual Regression Test Suite Hardening
1. Expand `apps/web/e2e/visual/` with page-specific spec files:
   - `dashboard.spec.ts` — school admin dashboard, teacher dashboard, parent dashboard
   - `students.spec.ts` — list, detail, new student form
   - `staff.spec.ts` — list, detail
   - `households.spec.ts` — list, detail, merge dialog
   - `classes.spec.ts` — list, detail, enrolments
   - `admissions.spec.ts` — forms builder, application list, application detail, public form
   - `scheduling.spec.ts` — period grid, timetable view, auto-scheduling dashboard
   - `attendance.spec.ts` — marking screen, exception dashboard
   - `gradebook.spec.ts` — grade entry grid, report card preview
   - `finance.spec.ts` — invoice list, payment recording, fee structure editor, statement
   - `payroll.spec.ts` — compensation list, payroll run detail, payslip preview, dashboard
   - `communications.spec.ts` — announcement list, new announcement, inquiry thread
   - `settings.spec.ts` — general, branding, roles, notifications, imports
   - `reports.spec.ts` — all report pages
2. Each spec runs in both `en-ltr` and `ar-rtl` projects (existing Playwright config)
3. Add `dark-mode.spec.ts` — re-test key pages (dashboard, student detail, invoice detail, gradebook) with `prefers-color-scheme: dark`
4. Add mobile viewport project to `playwright.config.ts`:
   ```typescript
   {
     name: 'mobile-en',
     use: { ...devices['iPhone 14'], locale: 'en-US' },
   },
   {
     name: 'mobile-ar',
     use: { ...devices['iPhone 14'], locale: 'ar-SA' },
   },
   ```
5. Add mobile spec: `mobile.spec.ts` — sidebar collapse, responsive tables, touch-friendly forms

### Step 7: Critical Workflow Integration Tests
Create 5 integration test suites in `apps/api/test/workflows/`:

1. **`admissions-conversion.e2e-spec.ts`** — Admissions conversion workflow:
   - Create admission form → submit application → review → approve → convert to student
   - Verify: student created, household created (with `needs_completion`), parent linked, Meilisearch index updated, audit log entry
   - Verify: transaction atomicity (partial failure rolls back)
   - Verify: duplicate detection flags

2. **`refund-lifo-reversal.e2e-spec.ts`** — Refund LIFO reversal:
   - Create fee structure → generate invoice → record payment with allocation → initiate refund
   - Verify: LIFO allocation reversal (most recent allocation reduced first)
   - Verify: invoice status re-derived (paid → partially_paid or issued)
   - Verify: receipt remains immutable
   - Verify: refund approval flow (if enabled)

3. **`household-merge.e2e-spec.ts`** — Household merge:
   - Create two households with students, parents, invoices, payments
   - Merge household B into household A
   - Verify: all students transferred, all financial records reassigned
   - Verify: household B archived, not deleted
   - Verify: concurrency guard (`SELECT ... FOR UPDATE`) prevents race conditions
   - Verify: Meilisearch re-indexed

4. **`payroll-finalisation.e2e-spec.ts`** — Payroll finalisation:
   - Create payroll run → populate entries → enter inputs → finalise
   - Verify: entries frozen (immutable after finalisation)
   - Verify: payslips auto-generated with correct sequence numbers
   - Verify: approval flow (when non-principal + approval required)
   - Verify: mid-month rate change reflected correctly in draft, snapshotted on finalise
   - Verify: cancellation only allowed in draft status

5. **`payment-allocation.e2e-spec.ts`** — Payment allocation:
   - Create multiple invoices for a household → record payment
   - Verify: FIFO auto-suggest allocates to oldest invoice first
   - Verify: over-allocation prevention (SUM constraint)
   - Verify: invoice status derivation (partially_paid, paid)
   - Verify: partial payment + second payment completes allocation
   - Verify: receipt generated per payment

### Step 8: Load/Performance Testing
1. Create `apps/api/test/load/` directory
2. Create `k6-config.ts` — k6 load test scripts (TypeScript transpiled):
   - **`login-flow.ts`**: 100 virtual users, 5 tenants (20 per tenant), login + fetch dashboard
   - **`search-load.ts`**: 50 VUs, concurrent search queries across students, staff, households
   - **`attendance-marking.ts`**: 30 VUs, concurrent attendance session creation + marking
   - **`invoice-generation.ts`**: 20 VUs, fee generation + invoice creation + payment recording
   - **`payroll-finalisation.ts`**: 10 VUs, concurrent payroll run creation + finalisation
3. Create `k6-thresholds.ts` — pass/fail thresholds:
   - p95 response time < 500ms for reads
   - p95 response time < 2000ms for writes
   - Error rate < 1%
   - RLS context switch overhead < 5ms per query
4. Create `apps/api/test/load/README.md` — instructions for running load tests locally and in CI

### Step 9: Demo Environment Setup
1. Create `packages/prisma/seed/demo-data.ts`:
   - 2 schools: "Al Noor International School" and "Cedar Academy"
   - Per school: 15 staff (mix of salaried/per-class), 80 students across 8 year groups, 40 households, 20 classes
   - Academic data: 2 academic years, 4 periods, grading scales, assessment categories
   - Finance data: fee structures, 30 invoices (mix of statuses), 20 payments, 5 refunds
   - Payroll data: 3 monthly payroll runs (1 finalised, 1 draft, 1 cancelled)
   - Scheduling: period grid, class requirements, 1 completed scheduling run with applied timetable
   - Attendance: 2 weeks of attendance data with realistic absence patterns
   - Gradebook: assessments with grades, 1 published report card batch
   - Communications: 5 announcements (mix of published/scheduled), 10 parent inquiries
   - Admissions: 15 applications across all statuses
   - Website: 3 published pages per locale
2. Create `scripts/seed-demo.sh`:
   - Resets database, runs migrations, applies RLS policies, runs demo seed
   - Outputs login credentials for each role per school
3. Update `package.json` with `"seed:demo"` script

### Step 10: Runbook Documentation
Create `docs/runbooks/` directory with operational documentation:

1. **`deployment.md`** — Step-by-step deployment procedure:
   - Pre-deployment checklist
   - Database migration process (Prisma + post-migrate RLS)
   - Rolling deployment via ECS (blue/green or rolling update)
   - Post-deployment verification (health checks, smoke tests)
   - Deployment rollback procedure

2. **`rollback.md`** — Rollback procedures:
   - Application rollback (ECS task definition revert)
   - Database rollback (when safe: Prisma migrate down, when not: point-in-time recovery)
   - Feature flag emergency disable (tenant module toggles)

3. **`tenant-provisioning.md`** — New school onboarding:
   - Platform admin tenant creation flow
   - Domain verification (Cloudflare DNS)
   - Module enablement
   - Initial user invitation (school_owner)
   - Branding configuration
   - Seed data (system roles, permissions)

4. **`incident-response.md`** — Incident handling:
   - Severity classification (P1–P4)
   - Escalation paths
   - RLS breach response procedure
   - Data breach notification timeline (GDPR)
   - Tenant suspension emergency procedure
   - Database restoration from backup

5. **`backup-restore.md`** — Backup and restore:
   - AWS RDS automated backup configuration (daily snapshots, 14-day retention, PITR)
   - Manual snapshot procedure
   - Point-in-time recovery steps
   - Cross-region backup verification
   - Redis persistence (AOF) and restoration
   - Backup restore drill checklist (used in Step 11)

### Step 11: Backup Restore Drill
1. Create `scripts/backup-drill.sh`:
   - Documents the manual steps for a backup restore drill
   - Creates a test RDS snapshot
   - Restores to a temporary instance
   - Runs a validation query set (count rows per table, verify RLS policies exist, verify trigger functions)
   - Cleans up temporary instance
2. Create `scripts/backup-drill-checklist.md`:
   - Printable checklist for quarterly backup drills
   - Sign-off fields for DBA and engineering lead

### Step 12: Production Readiness Checklist
Create `docs/production-readiness.md`:
- [ ] All CI pipeline stages green (lint, type-check, test, build, visual regression)
- [ ] RLS leakage tests pass for all 75 tenant-scoped tables
- [ ] PDF snapshot tests pass for all 12 template variants
- [ ] Visual regression snapshots baseline established (en, ar, dark, mobile)
- [ ] Load test thresholds met (p95 < 500ms reads, < 2000ms writes, < 1% errors)
- [ ] Backup restore drill completed successfully
- [ ] Runbook documentation reviewed by ops team
- [ ] Demo environment seeded and accessible
- [ ] PWA service worker caches operational views offline
- [ ] Stripe webhook endpoint verified in test mode
- [ ] Resend email delivery verified in test mode
- [ ] Meilisearch indexes populated and search functional
- [ ] Sentry error tracking configured and verified
- [ ] CloudWatch alarms configured for: CPU > 80%, memory > 80%, 5xx rate > 1%, queue depth > 100
- [ ] DNS and SSL configured via Cloudflare for SaaS
- [ ] Environment variables audited (no secrets in code, all in Secrets Manager)
- [ ] CORS configuration restricted to known domains
- [ ] Rate limiting configured on auth endpoints
- [ ] CSP headers verified

### Step 13: CI Pipeline Extension
Update `.github/workflows/ci.yml`:
1. Add `rls-leakage` job after `test` — runs RLS-specific test files with longer timeout
2. Add `pdf-snapshots` job after `build` — runs PDF snapshot tests (requires Puppeteer/Chromium)
3. Add `critical-workflows` job after `test` — runs the 5 critical workflow integration tests
4. Keep existing `playwright-visual` job but extend timeout for expanded test suite
5. Add artifact upload for all test reports on failure

---

## Section 8 — Files to Create

### Test Files
```
apps/api/test/p6b-rls-leakage.e2e-spec.ts
apps/api/test/p7-rls-leakage.e2e-spec.ts
apps/api/test/p8-rls-leakage.e2e-spec.ts
apps/api/test/rls-comprehensive.e2e-spec.ts
apps/api/test/pdf-snapshots.e2e-spec.ts
apps/api/test/__snapshots__/pdf/.gitkeep
apps/api/test/workflows/admissions-conversion.e2e-spec.ts
apps/api/test/workflows/refund-lifo-reversal.e2e-spec.ts
apps/api/test/workflows/household-merge.e2e-spec.ts
apps/api/test/workflows/payroll-finalisation.e2e-spec.ts
apps/api/test/workflows/payment-allocation.e2e-spec.ts
apps/api/test/load/k6-config.ts
apps/api/test/load/login-flow.ts
apps/api/test/load/search-load.ts
apps/api/test/load/attendance-marking.ts
apps/api/test/load/invoice-generation.ts
apps/api/test/load/payroll-finalisation.ts
apps/api/test/load/k6-thresholds.ts
apps/api/test/load/README.md
```

### Visual Regression Tests
```
apps/web/e2e/visual/rtl-regression.spec.ts
apps/web/e2e/visual/dashboard.spec.ts
apps/web/e2e/visual/students.spec.ts
apps/web/e2e/visual/staff.spec.ts
apps/web/e2e/visual/households.spec.ts
apps/web/e2e/visual/classes.spec.ts
apps/web/e2e/visual/admissions.spec.ts
apps/web/e2e/visual/scheduling.spec.ts
apps/web/e2e/visual/attendance.spec.ts
apps/web/e2e/visual/gradebook.spec.ts
apps/web/e2e/visual/finance.spec.ts
apps/web/e2e/visual/payroll.spec.ts
apps/web/e2e/visual/communications.spec.ts
apps/web/e2e/visual/settings.spec.ts
apps/web/e2e/visual/reports.spec.ts
apps/web/e2e/visual/dark-mode.spec.ts
apps/web/e2e/visual/mobile.spec.ts
```

### PWA Files
```
apps/web/public/sw.js
apps/web/public/offline.html
apps/web/public/icons/icon-192x192.png
apps/web/public/icons/icon-512x512.png
apps/web/public/icons/icon-maskable-512x512.png
```

### Demo Data
```
packages/prisma/seed/demo-data.ts
scripts/seed-demo.sh
```

### Runbook Documentation
```
docs/runbooks/deployment.md
docs/runbooks/rollback.md
docs/runbooks/tenant-provisioning.md
docs/runbooks/incident-response.md
docs/runbooks/backup-restore.md
scripts/backup-drill.sh
scripts/backup-drill-checklist.md
docs/production-readiness.md
```

---

## Section 9 — Files to Modify

### Backend
| File | Change |
|------|--------|
| `apps/api/src/modules/health/health.service.ts` | Add `getReadiness()` method with dependency checks |
| `apps/api/src/modules/health/health.controller.ts` | Add `GET /health/ready` endpoint calling `getReadiness()` |
| `apps/api/test/jest-e2e.json` | Add `workflows/` to test path pattern if not already covered |

### Frontend
| File | Change |
|------|--------|
| `apps/web/public/manifest.json` | Add icons array, scope, id, categories |
| `apps/web/src/app/layout.tsx` | Add service worker registration in production |
| `apps/web/e2e/playwright.config.ts` | Add mobile viewport projects, extend timeout |

### CI/CD
| File | Change |
|------|--------|
| `.github/workflows/ci.yml` | Add rls-leakage, pdf-snapshots, critical-workflows jobs |

### Root
| File | Change |
|------|--------|
| `package.json` | Add `"seed:demo"` script |

---

## Section 10 — Key Context for Executor

### RLS Test Pattern (CRITICAL — follow exactly)
The established RLS test pattern uses two layers:
1. **API-level**: Authenticate as Cedar (Tenant B), call each endpoint, assert no Al Noor (Tenant A) data appears. Uses `authGet()` helper from `apps/api/test/helpers.ts`.
2. **Table-level**: Create a non-superuser role (`rls_test_user`), `SET LOCAL ROLE` inside a Prisma interactive transaction, query each table, assert no cross-tenant rows.

Reference implementation: `apps/api/test/rls-leakage.e2e-spec.ts` (lines 1–250).

Key helpers from `apps/api/test/helpers.ts`:
- `createTestApp()` — bootstraps NestJS with all middleware
- `login(app, email, password, domain)` — returns `{ accessToken }`
- `authGet(app, path, token, host)` — GET with auth + host headers
- Constants: `AL_NOOR_TENANT_ID`, `CEDAR_TENANT_ID`, `AL_NOOR_DOMAIN`, `CEDAR_DOMAIN`, etc.

### Complete List of Tenant-Scoped Tables Requiring RLS Tests

**Already covered in existing tests:**
- P1: `tenants`, `tenant_domains`, `tenant_modules`, `tenant_branding`, `tenant_settings`, `tenant_notification_settings`, `tenant_sequences`, `tenant_stripe_configs`, `tenant_memberships`, `roles`, `role_permissions`, `membership_roles`, `invitations`, `approval_workflows`, `approval_requests`, `user_ui_preferences`
- P2: `academic_years`, `academic_periods`, `year_groups`, `subjects`, `classes`, `class_staff`, `class_enrolments`, `households`, `household_parents`, `household_emergency_contacts`, `parents`, `student_parents`, `students`, `staff_profiles`
- P3: `admission_form_definitions`, `admission_form_fields`, `applications`, `application_notes`
- P4A: `rooms`, `schedules`, `school_closures`, `attendance_sessions`, `attendance_records`, `daily_attendance_summaries`
- P4B: `schedule_period_templates`, `class_scheduling_requirements`, `staff_availability`, `staff_scheduling_preferences`, `scheduling_runs`
- P5: `grading_scales`, `assessment_categories`, `class_subject_grade_configs`, `assessments`, `grades`, `period_grade_snapshots`, `report_cards`
- P6: `fee_structures`, `discounts`, `household_fee_assignments`, `invoices`, `invoice_lines`, `installments`, `payments`, `payment_allocations`, `receipts`, `refunds`

**Missing — must be covered in P9:**
- P6B: `staff_compensation`, `payroll_runs`, `payroll_entries`, `payslips`
- P7: `announcements`, `notifications`, `notification_templates` (tenant-scoped rows only — has dual-policy), `parent_inquiries`, `parent_inquiry_messages`, `website_pages`, `contact_form_submissions`
- P8: `audit_logs` (tenant-scoped rows only — has dual-policy), `compliance_requests`, `import_jobs`, `search_index_status`

### PDF Template Rendering Pattern
The `PdfRenderingService` (at `apps/api/src/modules/pdf-rendering/pdf-rendering.service.ts`) exposes a `TEMPLATES` registry mapping template name → locale → render function. Each render function takes `(data, branding)` and returns an HTML string. Puppeteer converts HTML to PDF.

For **snapshot testing**, render the HTML output (not the PDF binary) and compare via Jest snapshots. This is deterministic and fast.

Templates to test (6 types × 2 locales = 12 snapshots):
- `report-card` (en, ar)
- `transcript` (en, ar)
- `invoice` (en, ar)
- `receipt` (en, ar)
- `payslip` (en, ar)
- `household-statement` (en, ar)

### Playwright Visual Regression Pattern
Existing tests in `apps/web/e2e/visual/shell.spec.ts` demonstrate the pattern:
```typescript
test('should render X in English (LTR)', async ({ page }) => {
  await page.goto('/en/...');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveScreenshot('x-en.png', { fullPage: true });
});
```

The Playwright config already has `en-ltr` and `ar-rtl` projects. Tests run in both automatically. The executor should use `test.describe` per page/module, with tests for both locales.

For mobile tests, add new Playwright projects with iPhone 14 viewport. For dark mode, use `page.emulateMedia({ colorScheme: 'dark' })` before screenshots.

### Service Worker Implementation Notes
- **No `next-pwa` dependency** — implement a vanilla service worker. This avoids adding a build dependency and gives full control over caching strategies.
- The service worker must be a plain `.js` file in `public/` (Next.js serves it at the root).
- Use the Cache API directly with named caches (`school-os-static-v1`, `school-os-api-v1`).
- Stale-while-revalidate for navigation (serve cached, update in background).
- Network-first for API calls (fallback to cache when offline).
- The `activate` event must delete old cache versions.
- Registration goes in the root layout with `navigator.serviceWorker.register('/sw.js')`.

### k6 Load Testing Notes
- k6 scripts are written in JavaScript (k6 uses its own JS runtime).
- Tests run against a locally-deployed instance with docker-compose services.
- Seed the database with demo data before running load tests.
- k6 does not run in CI by default (too expensive) — it's a manual pre-release step.
- The `README.md` documents the exact commands to run.

### Demo Data Seeding
The existing seed files are:
- `packages/prisma/seed/permissions.ts` — seeds all permissions
- `packages/prisma/seed/system-roles.ts` — creates system roles per tenant
- `packages/prisma/seed/dev-data.ts` — creates dev fixtures (Al Noor + Cedar with basic data)

The `demo-data.ts` seed builds on top of `dev-data.ts` but adds richer, more realistic data suitable for demos and sales presentations. It should be idempotent (use `upsert` patterns) and run after the standard seed.

### Dual-Policy Tables
Three tables have nullable `tenant_id` and use dual RLS policies:
- `notification_templates` — platform templates (NULL tenant_id) + tenant overrides
- `audit_logs` — platform actions (NULL tenant_id) + tenant actions
- `role_permissions` — system roles (potentially shared) + tenant custom roles

For these tables, the RLS test must verify:
1. Tenant B cannot see Tenant A's tenant-scoped rows
2. Tenant B CAN see platform-scoped rows (NULL tenant_id) — this is expected, not a leak

### CI Pipeline Structure
The current pipeline runs sequentially: lint → type-check → test → build → playwright-visual. New jobs slot in as:
- `rls-leakage` — after `test` (needs PostgreSQL + Redis services)
- `pdf-snapshots` — after `build` (needs Chromium for Puppeteer)
- `critical-workflows` — after `test` (needs PostgreSQL + Redis services)
- `playwright-visual` — unchanged but with extended timeout (from default to 30 minutes)

All new test jobs need the same PostgreSQL and Redis service containers as the existing `test` job.

---

## Validation Checklist

- [x] Every table in the phase instruction file has a corresponding entry — No new tables; Section 2 confirms no schema changes
- [x] Every functional requirement has at least one implementation step:
  - PWA offline cache → Step 2
  - Locale/font bundle caching → Step 2 (part of SW precache)
  - RTL regression test suite → Step 5
  - PDF snapshot test suite → Step 4
  - RLS leakage test suite → Step 3
  - Visual regression hardening → Step 6
  - Integration tests for critical workflows → Step 7
  - Load/performance testing → Step 8
  - Database backup restore drill → Step 11
  - Runbook documentation → Step 10
  - Demo environment setup → Step 9
  - Production readiness checklist → Step 12
- [x] Every endpoint has a service method — only one modified endpoint (`/health/ready` → `HealthService.getReadiness()`)
- [x] No tables, endpoints, or features planned that aren't in the phase spec
- [x] Implementation order has no forward dependencies — each step is independently completable
