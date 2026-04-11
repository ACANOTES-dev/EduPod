# Pre-Launch Checklist

**Consolidated from:** PRE-LAUNCH-REVIEW.md (2026-03-18) + production-readiness.md (2026-03-16)
**Last updated:** 2026-03-25
**Status:** PENDING
**Purpose:** Every item in this document must be verified before going live with real tenants. Items marked with ⚠️ were flagged during code review and may have been fixed since — verify current state.

---

## Part 1 — Module QA Testing

These modules had logic changes during code review. Test each operation listed.
**Note:** Features have evolved significantly since 2026-03-18. Some items may already be resolved. Verify current state before checking off.

### 1.1 Finance — Payments & Allocations

- [ ] Create a manual payment for a household
- [ ] Allocate a payment to a single invoice — verify invoice balance updates correctly
- [ ] Allocate a payment across multiple invoices — verify all balances update
- [ ] Attempt to over-allocate (amount exceeding payment) — should be rejected
- [ ] Concurrent allocation test: open two browser tabs, allocate same payment to different invoices — neither should over-allocate

### 1.2 Finance — Stripe Integration

- [ ] Stripe checkout for partially-paid invoice uses **outstanding balance**, not original total
- [ ] Completed checkout creates payment with correct `payment_intent` ID (not session ID)
- [ ] Duplicate webhook delivery — idempotency prevents double payment creation
- [ ] Stripe refund uses payment_intent ID
- [ ] Webhook returns HTTP 400 when tenant_id missing from metadata

### 1.3 Finance — Invoices

- [ ] Draft → issued transition works
- [ ] Void invoice with no allocations — succeeds
- [ ] Void invoice with allocations — rejected
- [ ] Floating-point residual (e.g. balance 0.003) correctly shows as `paid`
- [ ] Write off partially-paid invoice → `written_off`

### 1.4 Finance — Refunds

- [ ] Refund request for `posted` payment — succeeds
- [ ] Refund request for `refunded_partial` payment — succeeds
- [ ] Concurrent approval+rejection — only one succeeds
- [ ] Execute refund — payment status updates to `refunded_partial` or `refunded_full`
- [ ] Concurrent execution of two refunds — no over-refund

### 1.5 Finance — Fee Generation

- [ ] Fee generation preview shows correct households and amounts
- [ ] Confirm creates invoices
- [ ] ⚠️ Known: concurrent confirmation can produce duplicates (see Part 2, #9)

### 1.6 Payroll

- [ ] New run includes all active staff with compensation records
- [ ] Null base_salary on salaried staff — rejected with clear error
- [ ] Null per_class_rate on per-class staff — rejected with clear error
- [ ] Update total_working_days — salaried entries recalculate
- [ ] Refresh entries — inactive staff excluded
- [ ] Optimistic concurrency on finalise (two tabs — conflict error)

### 1.7 Authentication & Sessions

- [ ] Access token has `type: 'access'`
- [ ] Refresh token as Bearer → 401 "Invalid token type"
- [ ] Tenant switch persists across page refreshes
- [ ] MFA login flow — TOTP required after password

### 1.8 Attendance

- [ ] Batch session generation — correct weekday mapping (Monday = weekday 0)
- [ ] Teacher dashboard — today's sessions on correct day
- [ ] Auto-lock disabled when `autoLockAfterDays` not configured
- [ ] Auto-lock with `autoLockAfterDays = 0` locks immediately
- [ ] Auto-lock uses `session_date` not `submitted_at`

### 1.9 Gradebook & Report Cards

- [ ] Period grade weighted averages are correct
- [ ] Empty category weights → clear error (not NaN)
- [ ] All-zero category weights → clear error
- [ ] Report card uses teacher's override when one exists
- [ ] Report card generation is idempotent (no duplicates)

### 1.10 Admissions

- [ ] Parent submits own draft — succeeds
- [ ] Submit another parent's draft → 403 "Not application owner"
- [ ] Convert accepted application → student and household created
- [ ] Double conversion → "Already converted" error

### 1.11 Webhooks

- [ ] Resend webhook signature verification works
- [ ] Twilio webhook signature verification works
- [ ] In production, both reject requests when secrets not configured

### 1.12 Worker Service

- [ ] Worker starts successfully
- [ ] BullMQ queues have retry/backoff configured
- [ ] Failed job shows `status: 'failed'` (not stuck on `running`)

### 1.13 Database & RLS

- [ ] FORCE ROW LEVEL SECURITY on `staff_compensation`, `payroll_runs`, `payroll_entries`, `payslips`
- [ ] Verify: `SELECT relforcerowsecurity FROM pg_class WHERE relname = 'payroll_runs';` → `true`
- [ ] Every tenant-scoped table has RLS policy
- [ ] No `$executeRawUnsafe` / `$queryRawUnsafe` outside RLS middleware

### 1.14 Mobile Responsiveness

- [ ] Sidebar scrolls and all menu items reachable on mobile
- [ ] Bottom user menu pinned at sidebar bottom
- [ ] Content area padding appropriate on mobile

---

## Part 2 — Known Gaps & Incomplete Functionality

⚠️ **These were identified on 2026-03-18. Some may have been fixed. Verify each before launch.**

### LAUNCH BLOCKERS

| #   | Gap                                       | Location (verify current)          | What's Missing                         | Impact if Not Fixed                          |
| --- | ----------------------------------------- | ---------------------------------- | -------------------------------------- | -------------------------------------------- |
| 1   | **Password reset does not send email**    | `auth.service.ts`                  | Token generated but no email sent      | Users cannot reset passwords                 |
| 2   | **Invitation does not send email**        | `invitations.service.ts`           | Record created but no email dispatched | Staff/parents can't receive invitation links |
| 3   | **Email notifications not dispatched**    | `notification-dispatch.service.ts` | Resend API integration placeholder     | No emails actually delivered                 |
| 4   | **WhatsApp notifications not dispatched** | `notification-dispatch.service.ts` | Twilio API integration placeholder     | WhatsApp channel non-functional              |

### POST-LAUNCH

| #   | Gap                                         | Location (verify current)        | What's Missing                                               | Impact                                       |
| --- | ------------------------------------------- | -------------------------------- | ------------------------------------------------------------ | -------------------------------------------- |
| 5   | **Meilisearch indexing not wired**          | `search-index.processor.ts`      | TODO: Push documents to Meilisearch                          | Global search returns no results             |
| 6   | **Scheduling solver not enqueued from API** | `scheduling-runs.service.ts`     | TODO: Enqueue solver job                                     | Auto-scheduling can't be triggered from UI   |
| 7   | **Student export pack placeholders**        | `students.service.ts`            | attendance/grades/report_cards arrays empty                  | Export shows empty sections                  |
| 8   | **Import processing limited to students**   | `import-processing.processor.ts` | Other types throw "not yet implemented"                      | Only student CSV imports work                |
| 9   | **Fee generation TOCTOU**                   | `fee-generation.service.ts`      | Duplicate detection outside transaction                      | Concurrent confirms can duplicate invoices   |
| 10  | **16 cascade delete schema issues**         | `schema.prisma`                  | Dangerous `onDelete: Cascade` on financial/attendance models | Deleting user could cascade-delete records   |
| 11  | **i18n incomplete on 22+ pages**            | Various frontend                 | Hardcoded English strings                                    | Arabic users see English on many pages       |
| 12  | **MFA token design flaw**                   | `auth.service.ts`                | mfa_pending token not consumed in step 2                     | MFA weaker than intended (still functional)  |
| 13  | **Recovery code disables MFA**              | `auth.service.ts`                | Recovery code permanently disables MFA                       | Leaked code removes MFA protection           |
| 14  | **Impersonation has no audit trail**        | `tenants.service.ts`             | No `impersonator_id` field                                   | Actions attributed to target user, not admin |
| 15  | **Duplicate approval requests possible**    | `approval-requests.service.ts`   | No uniqueness constraint                                     | Action can get stuck on duplicate approvals  |

---

## Part 3 — Secrets & Infrastructure

### Before deploying:

- [ ] **Rotate JWT secrets** — Production JWT_SECRET, JWT_REFRESH_SECRET, and ENCRYPTION_KEY must NOT match values in `.env.example` or `test/setup-env.ts`
- [ ] **Run post_migrate.sql** — FORCE ROW LEVEL SECURITY fix for payroll tables
- [ ] **Verify production .env has**: `RESEND_WEBHOOK_SECRET`, `TWILIO_AUTH_TOKEN`, `STRIPE_WEBHOOK_SECRET`, `NODE_ENV=production`

### CI/CD Hardening:

- [ ] Self-hosted GitHub Actions runner on `edupod-prod-1`
- [ ] Update `deploy.yml` to `runs-on: self-hosted`
- [ ] Re-lock Hetzner firewall SSH to operator IP only (currently `0.0.0.0/0`)

### After deploying:

- [ ] `pm2 restart api web worker` — all processes `online`
- [ ] `pm2 logs api` → "API running on http://localhost:3001"
- [ ] `pm2 logs worker` → "Worker service running"
- [ ] `https://edupod.app/api/v1/health` → 200
- [ ] Login page loads on tenant subdomain
- [ ] Dark/light mode toggle functional
- [ ] Mobile sidebar scrolls

---

## Part 4 — Infrastructure & Operations

Items from production-readiness checklist, adapted for Hetzner deployment.

### Backup & Recovery

- [ ] PostgreSQL backup strategy configured (pg_dump cron or Hetzner snapshots)
- [ ] Backup restore tested — restore to separate instance, verify data integrity
- [ ] Redis AOF persistence enabled
- [ ] Backup drill completed and documented (`scripts/backup-drill-checklist.md`)

### Monitoring & Alerting

- [ ] Sentry configured for API, Web, and Worker (error tracking)
- [ ] Sentry release tracking enabled (errors tagged with git SHA)
- [ ] Health check endpoint monitored externally (uptime service)
- [ ] PM2 process monitoring — auto-restart on crash

### DNS & SSL

- [ ] Production domain resolving correctly
- [ ] SSL certificates active for platform subdomains
- [ ] Cloudflare for SaaS configured for custom hostname provisioning
- [ ] HTTPS enforced (HTTP → HTTPS redirect)

### Security

- [ ] CORS restricted to known origins (not `*`)
- [ ] Rate limiting on auth endpoints (login, refresh, password reset)
- [ ] Rate limiting on public endpoints (admissions, contact forms)
- [ ] CSP headers configured
- [ ] `.env` files in `.gitignore`, not committed

### Database

- [ ] All Prisma migrations applied cleanly
- [ ] Post-migrate script runs without errors
- [ ] Connection pooling configured (PgBouncer in transaction mode)
- [ ] Slow query logging enabled (queries > 1 second)

### External Services

- [ ] Stripe: payment intents, webhooks, refunds verified
- [ ] Resend: transactional email delivery verified
- [ ] Meilisearch: indexed and tenant-isolated
- [ ] Twilio: WhatsApp delivery verified (if enabled)

### Demo Environment

- [ ] Demo environment functional at `demo.edupod.app`
- [ ] Seeded with representative sample data
- [ ] Separate database from production
- [ ] Covers English and Arabic tenants

### GDPR

- [ ] Personal data inventory documented
- [ ] Right to erasure procedure operational (compliance module)
- [ ] Right to data portability procedure operational
- [ ] Privacy policy and terms of service published
- [ ] Cookie consent on public-facing pages

---

## Part 5 — Deferred Items (Added During Development)

Items flagged during ongoing development work that are deferred to the pre-launch window. This section is a living document — new items are added as they're identified.

| #   | Item                                                                       | Source                                | Date Added | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------- | ------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Backup SSH key before going live                                           | Memory: project_pre_launch_actions.md | 2026-03-25 | Ensure SSH key is backed up securely                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2   | Verify system role permissions and tiers                                   | Roles refactor session (2026-03-25)   | 2026-03-25 | Review all 9 system roles: (1) confirm each role's `role_tier` is correct (some permissions were seeded at mismatched tiers, e.g. Teacher has admin-tier permissions like `students.view`); (2) verify default permission sets are appropriate for each role; (3) confirm School Vice-Principal and Student have the right initial permissions configured; (4) verify the School Owner (platform) role has correct immutable permissions excluding privacy-sensitive access to individual accounts                      |
| 3   | Verify per-tenant HMAC secret for staff wellbeing surveys                  | Staff Wellbeing spec (2026-03-27)     | 2026-03-27 | Verify HMAC secret auto-generation works on first survey creation, encrypted storage is correct (AES-256), and secrets are independent across both confirmed tenants. Test participation token flow end-to-end on both tenants.                                                                                                                                                                                                                                                                                         |
| 4   | Rotate SSH key passphrase                                                  | Conversation (2026-03-27)             | 2026-03-27 | Passphrase for `~/.ssh/id_ed25519` was exposed in a chat session. Walk user through: (1) `ssh-keygen -p -f ~/.ssh/id_ed25519` to change passphrase, (2) verify SSH to production still works, (3) update any keychain entries if macOS Keychain was storing the old passphrase.                                                                                                                                                                                                                                         |
| 5   | Implement DES File B or formally remove it from supported regulatory scope | Regulatory portal review              | 2026-03-28 | The Phase G wizard now explicitly excludes File B, but the backend still rejects it with `DES_FILE_B_NOT_IMPLEMENTED`. Resolve before launch by either implementing the pipeline or narrowing the supported surface area.                                                                                                                                                                                                                                                                                               |
| 6   | Apply `reason_pattern` matching during Tusla SAR categorisation            | Regulatory portal review              | 2026-03-28 | Coarse `attendance_status` mapping works today, but tenant-specific reason-text rules are still ignored during SAR generation. Implement keyword/pattern matching before live tenant onboarding if schools rely on custom categorisation.                                                                                                                                                                                                                                                                               |
| 7   | Run Homework module RLS integration tests                                  | Phase G Hardening                     | 2026-03-30 | Verify tenant isolation for all 6 homework tables. Test cross-tenant query returns empty results.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 8   | Performance test homework analytics queries                                | Phase G Hardening                     | 2026-03-30 | Simulate 200 students × 50 homework assignments. Verify completion rate aggregation response times under 500ms.                                                                                                                                                                                                                                                                                                                                                                                                         |
| 9   | Verify homework worker job performance                                     | Phase G Hardening                     | 2026-03-30 | Test digest job with large tenant (500+ students, 20+ daily homework). Verify no timeouts.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 10  | Dark mode audit for homework pages                                         | Phase G Hardening                     | 2026-03-30 | Verify all homework/diary pages render correctly in dark mode. Check charts, tables, forms.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 11  | RTL layout audit for homework pages                                        | Phase G Hardening                     | 2026-03-30 | Verify all homework pages support Arabic RTL layout. Check alignment, text direction, icon positioning.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 12  | Mobile responsiveness check for homework                                   | Phase G Hardening                     | 2026-03-30 | Test homework dashboard and forms on tablet view. Ensure touch targets are adequate.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 13  | Verify SMS / Email / WhatsApp providers per tenant before inbox launch     | New-inbox Wave 5 (2026-04-11)         | 2026-04-11 | Inbox is always-on and free, but fallback escalations rely on the three outbound channels. Before announcing the inbox to either confirmed tenant, verify: (1) Twilio / chosen SMS provider credentials are present and test-sends succeed; (2) transactional email provider (SendGrid/Postmark/AWS SES) is configured and a test send lands in a real inbox; (3) WhatsApp Business API is configured, templated messages approved, and consent is wired. At least 2 tenants must pass before go-live.                  |
| 14  | Full RLS leakage test sweep across the new inbox tables                    | New-inbox Wave 5 (2026-04-11)         | 2026-04-11 | 14 new tenant-scoped tables shipped in impl 01 (`conversations`, `conversation_participants`, `messages`, `message_reads`, `message_edits`, `message_attachments`, `broadcast_audience_definitions`, `broadcast_audience_snapshots`, `saved_audiences`, `tenant_messaging_policy`, `tenant_settings_inbox`, `safeguarding_keywords`, `message_flags`, `oversight_access_log`). Each has an RLS policy. Run the tenant-isolation leakage test pattern (see `.claude/rules/testing.md`) against every one before go-live. |
| 15  | Confirm starter safeguarding keyword list with each tenant                 | New-inbox Wave 5 (2026-04-11)         | 2026-04-11 | Every new tenant is seeded with 31 starter safeguarding keywords (see `packages/prisma/src/inbox-defaults.ts`). Before go-live, walk the safeguarding lead at each tenant through the keyword list, confirm the tone / language / severity ratings match school policy, and capture their sign-off. Some tenants may want additional keywords (bullying-specific, Arabic terms, school nicknames). Document the final list per tenant in the onboarding record.                                                         |
| 16  | Implement `POST /v1/inbox/settings/fallback/test` debug endpoint           | New-inbox impl 15 follow-up           | 2026-04-11 | Impl 15's frontend ships a "Test fallback now" button that currently hits 404. The backend endpoint is a small debug surface (enqueues `inbox:fallback-scan-tenant` on the notifications queue). Gate with `inbox.settings.write` + `AdminTierOnlyGuard` + an env flag `INBOX_ALLOW_TEST_FALLBACK=true`. Nice-to-have, not blocking, but should land before an admin tries to use the button at launch.                                                                                                                 |
| 17  | Full translation sweep for Wave 4 inbox compose sub-components             | New-inbox Wave 5 (2026-04-11)         | 2026-04-11 | The impl 16 polish pass translated compose-dialog and messaging-policy page. The remaining Wave 4 sub-components (`people-picker.tsx`, `channel-selector.tsx`, `attachment-uploader.tsx`, `audience-picker.tsx` under `inbox/_components/`) still carry inline English strings and `no-untranslated-strings` lint warnings. Translation keys exist in `en.json` / `ar.json` under `inbox.peoplePicker` / `inbox.channelSelector` / `inbox.attachmentUploader` / `inbox.audiencePicker` — just wire them before launch.  |
| 18  | Mobile responsiveness verification pass for inbox surfaces                 | New-inbox Wave 5 (2026-04-11)         | 2026-04-11 | The impl 16 spec's manual mobile QA pass (375px / 320px on every inbox / audiences / oversight / settings page, including compose dialog and audience picker) was not performed in the Wave 5 session — no test device was available. Before launch, run the mobile matrix (375, 414, 768, 1024) against every inbox page, check touch targets ≥ 44×44px, verify input `text-base` to prevent iOS auto-zoom, and confirm tables scroll horizontally where needed.                                                       |
| 19  | Cross-tenant end-to-end smoke pass for inbox v1                            | New-inbox Wave 5 (2026-04-11)         | 2026-04-11 | Execute the 15-step smoke script from `new-inbox/implementations/16-polish-translations-mobile-smoke.md` §5 against a live test tenant: setup → direct → group → broadcast → smart audience → permission gate → edit window → delete → safeguarding → freeze → search → fallback → channel selector → mobile. This is the product acceptance gate and should be run against both confirmed tenants before go-live.                                                                                                      |
|     |                                                                            |                                       |            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

---

## Sign-Off

| Check                                            | Verified By | Date | Notes |
| ------------------------------------------------ | ----------- | ---- | ----- |
| Part 1 — Module QA complete                      |             |      |       |
| Part 2 — Known gaps verified (fixed or accepted) |             |      |       |
| Part 3 — Secrets rotated and infra verified      |             |      |       |
| Part 4 — Infrastructure & operations ready       |             |      |       |
| Part 5 — All deferred items resolved             |             |      |       |

**This document must be fully signed off before going live with tenant data.**
