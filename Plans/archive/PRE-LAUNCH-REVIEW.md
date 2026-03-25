# Pre-Launch Review Checklist

**Created:** 2026-03-18 (post code review — 3 cycles, 18 agents + consultant audit)
**Status:** PENDING REVIEW
**Purpose:** Every item in this document must be verified before going live with tenants.

---

## Part 1 — Modules Requiring Manual QA Testing

These modules had logic changes during the code review. Test each operation listed.

### 1.1 Finance — Payments & Allocations

- [ ] Create a manual payment for a household
- [ ] Allocate a payment to a single invoice — verify invoice balance updates correctly
- [ ] Allocate a payment across multiple invoices — verify all balances update
- [ ] Attempt to over-allocate (amount exceeding payment) — should be rejected
- [ ] Concurrent allocation test: open two browser tabs, attempt to allocate the same payment to different invoices simultaneously — neither should over-allocate

### 1.2 Finance — Stripe Integration

- [ ] Create a Stripe checkout session for a partially-paid invoice — verify the checkout amount is the **outstanding balance**, not the original total
- [ ] Complete a Stripe checkout — verify a payment record is created with the correct `payment_intent` ID (not session ID)
- [ ] Trigger duplicate webhook delivery — verify idempotency prevents double payment creation
- [ ] Attempt a Stripe refund for a payment — verify the refund call uses the payment_intent ID
- [ ] Verify Stripe webhook returns HTTP 400 when tenant_id is missing from metadata

### 1.3 Finance — Invoices

- [ ] Issue a draft invoice — verify status transitions to `issued`
- [ ] Void an invoice with no allocations — should succeed
- [ ] Attempt to void an invoice with allocations — should be rejected
- [ ] Verify an invoice with a tiny floating-point residual (e.g. balance 0.003) correctly shows as `paid`
- [ ] Write off a partially-paid invoice — verify status becomes `written_off`

### 1.4 Finance — Refunds

- [ ] Create a refund request for a `posted` payment — should succeed
- [ ] Create a refund request for a `refunded_partial` payment — should succeed (this was previously blocked)
- [ ] Approve a refund — verify status changes to `approved`
- [ ] Attempt concurrent approval and rejection of the same refund — only one should succeed
- [ ] Execute a refund — verify payment status updates to `refunded_partial` or `refunded_full`
- [ ] Attempt concurrent execution of two refunds on the same payment — should not over-refund

### 1.5 Finance — Fee Generation

- [ ] Run fee generation preview — verify correct households and amounts
- [ ] Confirm fee generation — verify invoices are created
- [ ] Be aware: concurrent confirmation of the same fee generation can produce duplicates (known gap, documented below)

### 1.6 Payroll

- [ ] Create a payroll run — verify all active staff with compensation records are included
- [ ] Verify a salaried staff member with a **null** base_salary is rejected with a clear error (not zero-pay)
- [ ] Verify a per-class staff member with a **null** per_class_rate is rejected with a clear error
- [ ] Update a payroll run's total_working_days — verify salaried entries recalculate
- [ ] Refresh entries — verify inactive staff are excluded
- [ ] Finalise a payroll run — verify optimistic concurrency works (open in two tabs, modify in one, finalise in the other — should show conflict error)
- [ ] Verify payroll settings catch block: if tenant settings fail to load for a non-404 reason, it should throw (not silently default)

### 1.7 Authentication & Sessions

- [ ] Log in with valid credentials — verify access token with `type: 'access'` is issued
- [ ] Attempt to use a refresh token as a Bearer token — should return 401 "Invalid token type"
- [ ] Switch tenant — verify the new tenant context persists across page refreshes (session updated in Redis)
- [ ] Test dark/light mode toggle — verify it appears in both desktop TopBar and mobile sidebar
- [ ] Test MFA login flow — verify TOTP code is required after password

### 1.8 Attendance

- [ ] Generate attendance sessions via batch — verify correct weekday mapping (Monday should map to weekday 0 in the schema, not 1)
- [ ] Check teacher dashboard — verify today's sessions appear on the correct day
- [ ] Auto-lock: if `autoLockAfterDays` is not configured, sessions should NOT auto-lock (no default fallback to 7 days)
- [ ] Auto-lock: if `autoLockAfterDays` is set to 0, sessions should lock immediately (not be treated as disabled)
- [ ] Verify auto-lock uses `session_date` not `submitted_at`

### 1.9 Gradebook & Report Cards

- [ ] Compute period grades — verify weighted averages are correct
- [ ] Attempt grade computation with empty category weights — should throw a clear error, not produce NaN
- [ ] Attempt grade computation with all-zero category weights — should throw a clear error
- [ ] Generate a report card — verify `display_value` uses the teacher's override when one exists
- [ ] Verify report card generation is idempotent (generating twice for the same student/period doesn't create duplicates)

### 1.10 Admissions

- [ ] As a parent, submit your own draft application — should succeed
- [ ] Attempt to submit another parent's draft application (if you know the ID) — should return 403 "Not application owner"
- [ ] Convert an accepted application to a student — verify student and household are created
- [ ] Attempt to convert the same application again — should return "Already converted" error

### 1.11 Webhooks

- [ ] Verify Resend webhook signature verification works when `RESEND_WEBHOOK_SECRET` is configured
- [ ] Verify Twilio webhook signature verification works when `TWILIO_AUTH_TOKEN` is configured
- [ ] In production (`NODE_ENV=production`), verify both webhooks **reject** requests when their secrets are not configured (not silently bypass)

### 1.12 Worker Service

- [ ] Verify worker starts successfully (correct dist path, dotenv preload)
- [ ] Verify BullMQ queues have retry/backoff configured (check via Redis: `bull:payroll:meta` etc.)
- [ ] Trigger a payroll session generation job — on failure, verify Redis shows `status: 'failed'` (not stuck on `running`)

### 1.13 Database & RLS

- [ ] Run post_migrate.sql scripts — verify `FORCE ROW LEVEL SECURITY` is applied to `staff_compensation`, `payroll_runs`, `payroll_entries`, `payslips`
- [ ] Verify: `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'payroll_runs';` returns `true`

### 1.14 Mobile Responsiveness

- [ ] Open the app on iPhone (or mobile emulator) — verify sidebar scrolls and all menu items are reachable
- [ ] Verify bottom user menu is pinned at the bottom of the mobile sidebar
- [ ] Check content area padding is appropriate on mobile (not cramped)

---

## Part 2 — Known Gaps & Incomplete Functionality

These are features that have placeholder code or are explicitly deferred. They need to be completed before or shortly after launch depending on priority.

### LAUNCH BLOCKERS (must complete before going live with real tenants)

| # | Gap | Location | What's Missing | Impact if Not Fixed |
|---|-----|----------|----------------|---------------------|
| 1 | **Password reset does not send email** | `auth.service.ts:479` | Token is generated and stored but no email is sent. Comment: "actual email sending deferred to Phase 7". The reset confirmation endpoint works — only the email dispatch is missing. | Users cannot reset their passwords. They must contact an admin for manual reset via database. |
| 2 | **Invitation does not send email** | `invitations.service.ts:120` | Invitation record is created with a token, but no email is dispatched. Comment: "TODO: In production, send invitation email with token here". | New staff/parents cannot receive their invitation links. Admin must manually provide credentials. |
| 3 | **Email notifications not dispatched** | `notification-dispatch.service.ts:109-111` | Resend API integration is a placeholder. Email notifications are logged but never sent. Status left as `queued`. | Announcement emails, payment receipts, attendance alerts — none are actually delivered via email. |
| 4 | **WhatsApp notifications not dispatched** | `notification-dispatch.service.ts:80-82` | Twilio WhatsApp API integration is a placeholder. Same as above. | WhatsApp channel is non-functional. |

### POST-LAUNCH (important but not blocking day-1 operations)

| # | Gap | Location | What's Missing | Impact |
|---|-----|----------|----------------|--------|
| 5 | **Meilisearch indexing not wired** | `search-index.processor.ts:74`, `search-reindex.processor.ts:131,181,238,283` | Worker collects data but has `// TODO: Push documents to Meilisearch` — never actually sends to Meilisearch. | Global search returns no results. Command palette search non-functional. |
| 6 | **Scheduling solver not enqueued from API** | `scheduling-runs.service.ts:115` | `// TODO: Enqueue the solver job once BullMQ is registered in the API module.` | Auto-scheduling cannot be triggered from the UI. The solver worker exists but is never called. |
| 7 | **Student export pack has placeholder data** | `students.service.ts:658-660` | `attendance_summary: []`, `grades: []`, `report_cards: []` | Student export/report pack shows empty sections for attendance, grades, and report cards. |
| 8 | **Import processing limited to student type** | `import-processing.processor.ts:200-201` | Only student CSV imports are implemented. Other types throw "not yet implemented". | Staff imports, grade imports from other systems are not available. |
| 9 | **Fee generation TOCTOU** | `fee-generation.service.ts:161` | Duplicate detection runs outside the write transaction. Concurrent confirms can produce duplicate invoices. | Low probability but possible: two admins clicking "Confirm" simultaneously creates double invoices. |
| 10 | **16 cascade delete schema issues** | `schema.prisma` (multiple models) | Invoice, Refund, Grade, ComplianceRequest, StaffProfile, AttendanceRecord, and 10 other models have dangerous `onDelete: Cascade` or missing `onDelete`. Full spec prepared. | Deleting a user could cascade-delete financial records, attendance history, or payroll data. Mitigated by never hard-deleting users (use status-based deactivation instead). |
| 11 | **i18n incomplete on 22+ pages** | Various frontend files | Hardcoded English strings on school-facing pages (students, finance, households, attendance, gradebook, etc.) and public-facing pages (contact form, admissions form). | Arabic-locale users see English labels, buttons, column headers, and validation messages on many pages. |
| 12 | **MFA token design flaw** | `auth.service.ts:265-307` | The `mfa_pending` token issued in step 1 is never consumed/validated in step 2. The second step re-verifies password+TOTP without binding to the first step. | MFA is weaker than intended but still functional (password+TOTP required). |
| 13 | **Recovery code disables MFA** | `auth.service.ts:711-718` | Using a recovery code permanently disables MFA and deletes all recovery codes, instead of allowing a one-time bypass. | A leaked recovery code permanently removes MFA protection. |
| 14 | **Impersonation has no audit trail** | `tenants.service.ts:523-528` | Impersonation tokens are identical to real user tokens — no `impersonator_id` field, no audit distinction. | Actions during impersonation are attributed to the target user, not the platform admin. |
| 15 | **Duplicate approval requests possible** | `approval-requests.service.ts:345` | No uniqueness constraint prevents creating multiple pending approval requests for the same target. | An action can get stuck waiting for approvals that are already pending. |

---

## Part 3 — Infrastructure & Secrets Checklist

### Before deploying these code changes:

- [ ] **Rotate JWT secrets** — The values in `.env.example` were real hex strings committed to git history. Production JWT_SECRET, JWT_REFRESH_SECRET, and ENCRYPTION_KEY must be rotated to new values NOT matching the ones in `.env.example` or `test/setup-env.ts`.
- [ ] **Run post_migrate.sql on production database** — The FORCE ROW LEVEL SECURITY fix for payroll tables must be applied. Deploy script will do this automatically on next deploy.
- [ ] **Verify `RESEND_WEBHOOK_SECRET` is in production .env** — Without it, the Resend webhook endpoint will reject all requests in production.
- [ ] **Verify `TWILIO_AUTH_TOKEN` is in production .env** — Same for Twilio.
- [ ] **Verify `STRIPE_WEBHOOK_SECRET` is in production .env** — Same for Stripe.
- [ ] **Verify `NODE_ENV=production` in production .env** — Critical: controls Swagger visibility, webhook enforcement, and other production guards.

### CI/CD Hardening:

- [ ] Install a self-hosted GitHub Actions runner on `edupod-prod-1` — the runner pulls jobs from GitHub over HTTPS (outbound), eliminating the need for inbound SSH from GitHub Actions
- [ ] Update `deploy.yml` to use `runs-on: self-hosted` instead of `ubuntu-latest` + SSH action
- [ ] Re-lock the Hetzner firewall SSH rule back to operator IP only (currently open to `0.0.0.0/0` as a temporary workaround)

### After deploying:

- [ ] Run `pm2 restart api web worker` and verify all three processes are `online`
- [ ] Check `pm2 logs api --lines 10 --nostream` — should show "API running on http://localhost:3001"
- [ ] Check `pm2 logs worker --lines 10 --nostream` — should show "Worker service running"
- [ ] Hit `https://edupod.app/api/v1/health` — should return 200
- [ ] Hit `https://al-noor.edupod.app/en/login` — should load login page
- [ ] Verify dark/light mode toggle is visible and functional
- [ ] On mobile: verify sidebar scrolls and all menu items are reachable

---

## Part 4 — Sign-Off

| Check | Verified By | Date | Notes |
|-------|------------|------|-------|
| Part 1 — Manual QA complete | | | |
| Part 2 — Known gaps reviewed and accepted | | | |
| Part 3 — Secrets rotated and infra verified | | | |
| All Part 2 "Launch Blockers" resolved OR accepted as known limitations | | | |

**This document must be fully signed off before going live with tenant data.**
