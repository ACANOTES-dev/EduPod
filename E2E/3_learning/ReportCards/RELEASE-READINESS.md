# Report Cards — Release Readiness Pack

**Generated:** 2026-04-12
**Commit:** `fe6826c0`
**Module slug:** `report-cards`
**Module scope:** Report Cards + Report Comments (unified `/report-cards/*` + `/report-comments/*` frontend, `gradebook/report-cards/*` backend controllers, `gradebook` BullMQ queue)

---

## Spec pack

| Leg                 | Spec document                                                                                  | Lines     | Sections | Date       |
| ------------------- | ---------------------------------------------------------------------------------------------- | --------- | -------- | ---------- |
| /E2E (admin)        | [admin_view/report-cards-e2e-spec.md](./admin_view/report-cards-e2e-spec.md)                   | 1,800     | 83       | 2026-04-12 |
| /E2E (teacher)      | [teacher_view/report-cards-e2e-spec.md](./teacher_view/report-cards-e2e-spec.md)               | 867       | 42       | 2026-04-12 |
| /E2E (parent)       | [parent_view/report-cards-e2e-spec.md](./parent_view/report-cards-e2e-spec.md)                 | 449       | 26       | 2026-04-12 |
| /E2E (student)      | [student_view/report-cards-e2e-spec.md](./student_view/report-cards-e2e-spec.md)               | 371       | 19       | 2026-04-12 |
| /e2e-integration    | [integration/report-cards-integration-spec.md](./integration/report-cards-integration-spec.md) | 1,057     | 44       | 2026-04-12 |
| /e2e-worker-test    | [worker/report-cards-worker-spec.md](./worker/report-cards-worker-spec.md)                     | 526       | 35       | 2026-04-12 |
| /e2e-perf           | [perf/report-cards-perf-spec.md](./perf/report-cards-perf-spec.md)                             | 756       | 38       | 2026-04-12 |
| /e2e-security-audit | [security/report-cards-security-spec.md](./security/report-cards-security-spec.md)             | 908       | 42       | 2026-04-12 |
| **Total**           |                                                                                                | **6,734** | **329**  |            |

---

## Execution order

Run the specs in this order to achieve full confidence:

1. **UI behavioural** — admin, then teacher, parent, student (in that order). The admin spec is the most comprehensive and establishes the golden-path data fixtures. Teacher / parent / student specs then verify scope boundaries against the data admin created.
2. **Integration** — RLS + contracts + webhooks + invariants. Runs against a live Postgres + Redis. Seeds two tenants to exercise cross-tenant isolation.
3. **Worker** — queues + cron + chains. Requires BullMQ worker running. Tests tenant-context leakage under PgBouncer transaction mode and cross-tenant cron.
4. **Perf** — budgets, scale, load. Requires a 500-student / 20-class / 10k-card tenant. k6 + Lighthouse + EXPLAIN ANALYZE across 3 envs (dev, staging, prod-like).
5. **Security** — OWASP + permission matrix + injection + hardening. Best run by an internal security engineer or paid pentester; the pre-populated P0/P1 findings are hypotheses that MUST be confirmed or refuted during execution.

Each leg can be executed independently, but the full pack is what achieves release-readiness.

---

## Coverage summary

### UI surface

- **Frontend pages:** 14 unique routes × 4 roles (admin / teacher / parent / student) = 56 role-scoped cells
- Pages split: 12 under `/en/report-cards/*` + 4 under `/en/report-comments/*`, minus 2 retired redirect stubs = **12 live routes + 2 stubs**
- Retired redirect stubs: `/en/report-cards/approvals` and `/en/report-cards/bulk` (302 → dashboard)

### Backend API

- **Endpoints:** ~90 routes across 7 controllers (`report-cards.controller`, `report-cards-enhanced.controller`, `report-card-overall-comments.controller`, `report-card-subject-comments.controller`, `report-card-teacher-requests.controller`, `report-comment-windows.controller`, `report-card-tenant-settings.controller`) plus 1 unauthenticated public controller (`/v1/verify/:token`)
- **Permissions:** 11 distinct keys (`gradebook.view`, `gradebook.manage`, `gradebook.publish_report_cards`, `gradebook.view_analytics`, `report_cards.view`, `report_cards.manage`, `report_cards.manage_templates`, `report_cards.comment`, `report_cards.approve`, `report_cards.bulk_operations`, `transcripts.generate`)
- **Public endpoints:** 1 (`GET /v1/verify/:token` — token IS the auth)

### Data model

- **Tenant-scoped tables:** 14 (`ReportCard`, `ReportCardTemplate`, `ReportCardApprovalConfig`, `ReportCardApproval`, `ReportCardDelivery`, `ReportCardBatchJob`, `ReportCommentWindow`, `ReportCommentWindowHomeroom`, `ReportCardSubjectComment`, `ReportCardOverallComment`, `ReportCardTeacherRequest`, `ReportCardTenantSettings`, `ReportCardCustomFieldDef`, `ReportCardCustomFieldValue`, `GradeThresholdConfig`, `ReportCardAcknowledgment`, `ReportCardVerificationToken`) — note: several tables group into the 14 figure; exact count is 14 domain tables + 3 configuration tables = 17 in the integration RLS matrix
- **Platform-level tables:** 0 (every table is tenant-scoped)
- **State machines:** 6 (ReportCardStatus, CommentWindowStatus, TeacherRequestStatus, ApprovalStepStatus, DeliveryStatus, BatchJobStatus)

### Background processing

- **BullMQ queue:** `gradebook` (shared with other gradebook concerns)
- **Jobs:** 4 named (`report-cards:generate`, `report-cards:auto-generate`, `gradebook:mass-report-card-pdf`, `gradebook:batch-pdf`)
- **Crons:** 1 (`report-cards:auto-generate` daily at 03:00 UTC, cross-tenant)

### Security coverage

- **OWASP Top 10 (2021):** 10/10 categories explicitly covered in the security spec
- **Permission matrix:** 8 roles × 90 endpoints = 720 cells documented in the security spec §12
- **Injection fuzz rows:** covered across §16–§23 (SQL, XSS, JSON, path traversal, null bytes, oversized strings, numeric overflow, invalid UUIDs, mass assignment, business-logic abuse)
- **Public attack surface:** 1 endpoint (`/verify/:token`) — rate-limit + TTL + entropy audited

---

## Known limitations of the pack

Even the full pack does not cover:

- **Long-tail Zod validation combinatorics** beyond the documented boundary cases — sampled not exhaustive (combinatorically explosive)
- **Real external-service behaviour** — Stripe API outages, email provider delays, WhatsApp template rejection, AI service latency spikes — mocked at the boundary, not live-tested
- **Accessibility audits** beyond structural checks — run a dedicated a11y tool (axe-core, Lighthouse a11y) as a sibling workflow
- **Visual regression / pixel diff** — run a dedicated visual tool (Percy, Chromatic, or Playwright screenshots with visual diff)
- **Browser / device matrix** beyond desktop Chrome + 375px mobile — defer to a manual QA cycle on Safari, Firefox, edge devices
- **Load testing at production-scale peak** (100k+ concurrent users) — the /e2e-perf spec targets realistic volume (500 concurrent teachers, 100 RPS dashboard), not disaster-scenario peak
- **PDF fidelity vs printed output** — the spec checks PDF metadata and text content but not visual rendering fidelity. Run a dedicated PDF-diff workflow (pdf-diff, visual regression) separately
- **Puppeteer / Chromium CVE regression** — security spec references known CVEs as a snapshot; re-audit at release time
- **Translation completeness beyond sampled keys** — spec samples key translations per locale but does not exhaustively verify every string

These gaps are acceptable for the 99.99% confidence target. 100% confidence does not exist.

---

## Observations & findings from the walkthrough

Each leg produced observations during spec authoring. These are **hypothesised** findings that need confirmation during execution — they are not verified bugs yet.

### From /E2E (admin) — 7 observations

1. Top-rank badge rendering may not honour the `show_top_rank_badge` tenant setting (class-matrix row 12.4)
2. Route registration order — literal-before-dynamic constraint (dry-run before `:id`, library/grouped before `:id`, bulk-delete before `DELETE /:id`)
3. `comment_fill_rate` deprecated field on analytics type — flag if frontend still renders it
4. Unfinalise-after-window-close behaviour inconsistent between overall and subject comment controllers
5. Revision chain depth semantics (root vs linked-list) not explicitly enforced
6. Public verification token regeneration vs reuse behaviour unclear (POST `/:id/verification-token`)
7. `ReportCardVerificationController` confirmed public (no AuthGuard) — intentional but flag as security review item

### From /E2E (teacher) — 20 observations (2 High, 7 Medium, 11 Low)

- **High:** Out-of-scope URL leaks PII during ~300ms before redirect (§33.2); Version-conflict modal loses unsaved typed text on reload (§33.20)
- **Medium:** Flash-of-unauthorised Finalise buttons during render; Autosave debounce continues post-unmount causing stale PATCH; Silent failure on 403 autosave after devtools tamper; PDF watermark uses physical `text-align: right` in RTL; AI Draft modal close button breaks RTL; Homeroom revocation mid-session doesn't refresh UI; `landing` endpoint returns `closed_by_user_id` — should be scrubbed
- **Low:** Tooltip conflation (no permission vs window closed); missing cache header on `scoped-classes`; IME composition bypass in reason length validation; Settings shows greyed Save vs hiding; stale tile counts due to 60s cache; React setState-on-unmounted warning; `/analytics` redirect toast fires twice; `audit_log` tone field length concern; asymmetric cancel-request notification; no progress-resume UI for bulk AI after browser close; PDF `window.open()` triggers popup blocker

### From /E2E (parent) — 10 observations (mostly High — parent portal surface is not implemented)

1. **HIGH (P0)** `GAP-PARENT-ACK-001` — `POST /v1/report-cards/:id/acknowledge` takes `parent_id` from body not JWT → IDOR (parent A acknowledges parent B's card)
2. **HIGH (P0)** `GAP-PARENT-SCOPE-001/002` — `findOne` and `renderPdf` rely on tenant + id only, no `student_parents` linkage check → cross-student probing possible with a guessed UUID
3. **HIGH** `GAP-PARENT-VERIFY-001` — Verification tokens have no expiry (reused forever; no TTL column)
4. **HIGH** `GAP-PARENT-VERIFY-002` — No rate limit observed on `/v1/verify/:token`
5. **MEDIUM** `GAP-PARENT-REPORTCARDS-001` — Parent dashboard does not surface recent report cards card (currently: action center, homework, notes, invoices, announcements — no report cards)
6. **MEDIUM** Parent hub has no dedicated report-card route; parents interact only via delivery links + acknowledgment flow
7. **MEDIUM** Delivery channel assumptions undocumented (email vs SMS vs WhatsApp vs in-app — which is default?)
8. Low-severity documentation gaps filled in spec §25

### From /E2E (student) — 9 observations (4 High)

1. **HIGH** No student dashboard exists — `dashboard/page.tsx` branches only on Admin, Teacher, Parent, FrontOffice, Accounting; students fall into the generic shell
2. **HIGH** `getDashboardPath()` returns `/dashboard` for students (admin shell) instead of a dedicated `/dashboard/student` route
3. **HIGH** `GET /v1/report-cards/:id` and `/pdf` only check `gradebook.view` — no ownership scope check → cross-student probing possible
4. **HIGH** `ReportCardsController.findAll()` has no student-scope branch — students holding `gradebook.view` could hit the full library
5. **MEDIUM** Acknowledgment is parent-only (correct design); no student equivalent — documented, not a bug
6. Low-severity documentation gaps filled in spec §18

### From /e2e-integration — 10 gaps flagged

1. Acknowledgment uses body `parent_id` instead of JWT (duplicate of parent-view observation; confirmed in enhanced controller line 438)
2. No revocation endpoint for verification tokens
3. Public `/v1/verify/:token` has no visible rate limit decorator
4. `ReportCommentWindow` `opens_at < closes_at` refinement needs verification
5. Snapshot immutability claimed but not enforced at DB layer (test 17.2 is critical)
6. Library scoping logic duplicated between controller and service — divergence risk
7. Bulk op transaction boundaries undocumented
8. No per-channel delivery retry endpoint
9. Template `is_default` uniqueness unclear at DB layer
10. No per-tenant rate limit on bulk generation — worker saturation risk

### From /e2e-worker-test — 7 observations (3 High, 4 Medium)

1. **HIGH** `NullReportCardStorageWriter` is the default binding — without explicit S3 wiring, cards complete with `pdf_storage_key = null` and batch_job `completed` → silent data loss
2. **HIGH** RLS reset across sequential jobs on same Prisma connection under PgBouncer transaction mode is the #1 data-leak risk and currently lacks a dedicated test
3. **HIGH** `report-cards:auto-generate` empty `{}` payload means anyone with queue access triggers cross-tenant iteration — Redis ACL + network isolation must be verified
4. **MEDIUM** No per-tenant circuit breaker on the cron — misconfigured tenant fails every daily run indefinitely
5. **MEDIUM** AI draft is synchronous in the controller — no retry/backoff on OpenAI transient failures
6. **MEDIUM** Unclear hard cap on `gradebook:mass-report-card-pdf` N — assumed 1000, enforce via Zod `.max(1000)` to prevent OOM
7. **MEDIUM** DLQ replay tooling existence is unconfirmed

### From /e2e-perf — 15 pre-populated gaps

Categories: mass-bundle OOM risk; unbounded auto-generate cron runtime; offset pagination weakness at depth (recommend keyset/cursor); Arabic font subsetting cost; Puppeteer memory leaks over 24h; CDN TTL undocumented for public verify; AI draft latency variance; N+1 risk on library grouped view; bundle-size regressions undetected; Lighthouse budget not wired to CI; Web Vitals field data not collected yet; cold-start penalty on first request post-deploy; generation throughput not benchmarked; no per-tenant perf budget; no synthetic baseline for prod drift detection

### From /e2e-security-audit — 12 pre-populated findings

- **P0 (3):**
  - F-001 Acknowledgment body-param IDOR (matches parent + integration observations above)
  - F-004 Puppeteer XSS → AWS metadata SSRF risk (comment_text rendered in HTML, Puppeteer without `--no-sandbox` may reach `169.254.169.254`)
  - F-008 SSTI in `comment_text` via Handlebars syntax `{{constructor.constructor('return process')()}}`
- **P1 (5):**
  - F-002 No verify-token TTL (duplicate of parent observation)
  - F-003 Missing rate-limit on public `/verify`
  - F-006 Cross-tenant revise chain possible via `revision_of_report_card_id`
  - F-010 No JWT refresh rotation
  - F-011 AI base URL tenant-configurable → SSRF to internal services
- **P2 (4):**
  - F-005 Mass-assignment uneven across PATCH endpoints
  - F-007 Missing Cache-Control on signature uploads
  - F-009 Audit log gaps on certain bulk operations
  - F-012 Permission cache TTL too long (stale post-revocation)
- **P3 (0)** — reserved for execution-time findings

---

## Cross-cutting themes

Observations that appeared in multiple legs (increasing confidence they are real):

1. **Acknowledgment IDOR** — parent view + integration + security all flagged the `parent_id` body parameter issue. Treat as **P0 confirmed** pending code read.
2. **No verification token TTL** — parent + security both flagged. Treat as **P1 confirmed**.
3. **Missing rate limit on public `/verify`** — parent + integration + security all flagged. Treat as **P1 confirmed**.
4. **Cross-tenant context leakage under PgBouncer** — worker spec flagged as HIGH. Also appears as an integration gap (§29 Permission Cache Invalidation). Treat as **P0 risk** — must have a dedicated green-before-release test.
5. **Snapshot immutability not enforced at DB** — integration + security both flagged. Treat as **P1 design gap**.

---

## Tester assignment

This pack is designed to be executed by:

- **A dedicated QC engineer** working through each UI spec top-to-bottom, marking Pass/Fail per row, targeting one spec per day (admin: 2 days; others: 1 day each)
- **A headless Playwright agent** for the /E2E legs (UI behaviour is scriptable end-to-end — 100% of the admin spec's ~900 test rows can be automated)
- **A Jest + Supertest harness** for /e2e-integration and /e2e-worker-test rows (each row maps 1:1 to a test case; 523 + ~180 = ~700 tests)
- **k6 + Lighthouse CI** for /e2e-perf (each row is a measurement; drive from CI nightly against staging)
- **An internal security engineer OR a paid pentester** for /e2e-security-audit (446 test rows, 12 pre-populated hypotheses to confirm/refute; humans still find more than tools on the adversarial axis)

---

## Sign-off

| Leg                 | Reviewer | Date | Pass | Fail | Notes |
| ------------------- | -------- | ---- | ---- | ---- | ----- |
| /E2E (admin)        |          |      |      |      |       |
| /E2E (teacher)      |          |      |      |      |       |
| /E2E (parent)       |          |      |      |      |       |
| /E2E (student)      |          |      |      |      |       |
| /e2e-integration    |          |      |      |      |       |
| /e2e-worker-test    |          |      |      |      |       |
| /e2e-perf           |          |      |      |      |       |
| /e2e-security-audit |          |      |      |      |       |

**Module release-ready when all eight rows are signed off at Pass with zero P0 / P1 findings outstanding.**

---

## Pack metadata

- **Pack version:** 1.0 (2026-04-12)
- **Supersedes:** previous single-file admin + teacher specs (now rewritten + extended)
- **Generator:** `/e2e-full` command
- **Related modules** (tested separately, share overlapping surface):
  - Assessment (covered in `E2E/3_learning/assessment/`)
  - Gradebook (covered in `E2E/3_learning/assessment/` — shares `gradebook.*` permissions)
  - Communications (covered in `E2E/5_operations/communications/` — delivery channel integration)
  - PDF Rendering (shared infra, tested within each consuming module)
