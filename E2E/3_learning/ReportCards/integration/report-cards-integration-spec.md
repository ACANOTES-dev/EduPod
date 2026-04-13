# Report Cards — Integration Test Specification

**Module:** Report Cards (gradebook sub-domain)
**Test type:** Integration (jest + supertest against live Postgres + Redis)
**Last updated:** 2026-04-12
**Scope:** API-level contract, RLS isolation, webhook/chain behaviours, concurrency invariants, data integrity.

---

## 1. Purpose & How to Execute

### Purpose

This specification defines **integration-level** verification for the Report Cards module. Each row maps 1:1 to a jest/supertest test case intended to run against a real Postgres + Redis environment (NOT mocks). The focus is on:

- Row-Level Security (RLS) isolation between tenants (database layer).
- Request/response contract compliance against the canonical Zod schemas.
- Cross-module chain / webhook / side-effect behaviour (publish → delivery, approve → window open, etc.).
- Concurrency invariants (double-click publish, concurrent approvals, autosave collisions).
- Authorization leakage (role elevation, cross-user authorship, permission cache staleness).
- Data integrity (uniqueness, foreign-key cascades, snapshot immutability, token entropy).

Unit tests (pure function / service-level with mocked Prisma) live elsewhere. End-to-end browser tests live under `E2E/3_learning/ReportCards/admin_view/`, `.../teacher_view/`, `.../parent_view/`, `.../student_view/`. This document is the integration layer in between.

### Execution

```bash
# Integration suite — real DB, real Redis, real BullMQ worker
cd apps/api
DATABASE_URL=postgresql://postgres:postgres@localhost:5553/school_platform \
REDIS_URL=redis://localhost:5554 \
JWT_SECRET=<from CI secrets> \
pnpm test:integration --testPathPattern=report-cards
```

- Tests assume `CI=integration` env context (see `apps/api/test/setup-env.ts` — uses `??=` so CI env wins).
- Each test must seed in `beforeAll` and tear down in `afterAll` using an isolation strategy: either prefixed test-tenant IDs with a `DELETE CASCADE` in teardown, or a transactional wrapper that rolls back.
- All requests go via `supertest(app.getHttpServer())` with a real-minted JWT from `AuthService.sign()`.
- Every test MUST include a tenant_id in its context — no exceptions. The RLS middleware asserts this.
- Use `createRlsClient()` when test setup needs to pre-seed tenant-scoped rows; never reach around RLS with `$executeRawUnsafe`.
- Jobs posted to the `gradebook` queue during the test run are flushed through a real worker subscriber; tests that assert on chain behaviour `await` until the target side-effect row appears (with a 10-second poll cap).

### Pass/Fail Legend

- **PASS** — Observed response/DB state exactly matches Expected Result.
- **FAIL** — Any deviation: wrong status code, wrong payload shape, wrong side-effect, silent swallow.
- **FLAKY** — Sometimes-pass sometimes-fail; any flake counts as a failing test and is a release blocker.
- **N/A** — Scenario documented as not applicable (with reason).

---

## 2. Test Infrastructure Requirements

### Tenants

| Slot     | Tenant ID (fixture)                    | Name            | Purpose                                                |
| -------- | -------------------------------------- | --------------- | ------------------------------------------------------ |
| Tenant A | `11111111-1111-1111-1111-111111111111` | `integration-a` | Primary data owner. Most flows run here.               |
| Tenant B | `22222222-2222-2222-2222-222222222222` | `integration-b` | Cross-tenant prober. Attempts to read/mutate A's data. |

Both tenants must be seeded via `TenantsSeeder` with the `gradebook` and `report_cards` modules enabled (check `tenant_modules` flag per controller `@ModuleEnabled` guards).

### Users (per tenant)

| Role              | Fixture ID                    | Permissions granted                                                                                                                                   |
| ----------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin / owner     | `{tenantPrefix}-admin`        | Owner flag — bypasses permission guard entirely.                                                                                                      |
| Academic head     | `{tenantPrefix}-head`         | `report_cards.manage`, `report_cards.manage_templates`, `report_cards.approve`, `report_cards.bulk_operations`, `gradebook.*`, `transcripts.generate` |
| Teacher A (HRT)   | `{tenantPrefix}-teacher-hrt`  | `report_cards.view`, `report_cards.comment`, `gradebook.view`                                                                                         |
| Teacher B (subj)  | `{tenantPrefix}-teacher-subj` | `report_cards.comment`, `gradebook.view`                                                                                                              |
| Principal         | `{tenantPrefix}-principal`    | `report_cards.approve`, `gradebook.publish_report_cards`                                                                                              |
| Parent            | `{tenantPrefix}-parent`       | `gradebook.view` (scoped to own children via guardianship)                                                                                            |
| Student           | `{tenantPrefix}-student`      | `gradebook.view` (scoped to self)                                                                                                                     |
| Unauthorised user | `{tenantPrefix}-nobody`       | No report_cards permissions (only login).                                                                                                             |

### Academic Structure

- 1 academic year (current), 3 academic periods (`T1 closed`, `T2 current`, `T3 upcoming`).
- 2 year groups: `YG-A`, `YG-B`.
- 2 classes per year group (so 4 classes total per tenant).
- 30 students per class (so 120 students per tenant).
- HRT assignment: Teacher A is homeroom for `YG-A/Class-1`. Teacher B teaches `Math` across all classes.
- Curriculum: 6 subjects (`Math`, `English`, `Arabic`, `Science`, `Social`, `Art`).
- Gradebook pre-seeded with finalised grades for `T1` (enough for a full generation run to succeed).

### Templates & Config

- 1 default report card template per tenant (content_scope = `per_period`, locale = `en`).
- 1 approval config: 2-step (step 1 = academic head, step 2 = principal).
- 1 tenant settings row per tenant (signatures off by default).
- 1 grade threshold config (A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F < 60).

### Redis / BullMQ

- A real Redis instance on port 5554 (integration job environment).
- The `worker` app must be started before the test suite OR the test harness must spin up an in-process `Worker` subscribed to the `gradebook` queue.
- Tests that await chain side-effects use `waitForRowAsync({ table, where, timeoutMs: 10000 })`.

### Clock

- Jest fake timers are **not** used at the integration layer — we need real BullMQ + Postgres NOW() semantics.
- Tests that assert on `comment_window.opens_at` / `closes_at` use helpers that compute offsets from real `new Date()`.

---

## 3. RLS Matrix — Per Table

Each tenant-scoped table is tested for all four CRUD ops. Pattern:

1. As **tenant A**, seed a row directly via `createRlsClient(prisma, { tenant_id: A }).$transaction(...)`.
2. Switch to **tenant B** context (`createRlsClient(prisma, { tenant_id: B })`).
3. Attempt the op on the tenant-A row.
4. Expect: `findMany → []`, `findUnique → null`, `update → P2025` (record not found), `delete → P2025`.

| #    | Table                       | Op     | Setup Steps                                                                                   | Expected Result                                                        | Pass/Fail |
| ---- | --------------------------- | ------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------- |
| 3.1  | ReportCard                  | CREATE | Set RLS to tenant B, attempt `prisma.reportCard.create({ data: { tenant_id: A, ... } })`      | Throws `new row violates row-level security policy` (23514 or similar) |           |
| 3.2  | ReportCard                  | READ   | Seed RC under A; switch to B; `findMany({ where: {} })`                                       | `[]` — A's card is invisible                                           |           |
| 3.3  | ReportCard                  | UPDATE | Seed RC under A; switch to B; `update({ where: { id: A_rc_id }, data: { status: 'draft' } })` | `P2025` Prisma error — row not visible to B                            |           |
| 3.4  | ReportCard                  | DELETE | Seed RC under A; switch to B; `delete({ where: { id: A_rc_id } })`                            | `P2025` Prisma error                                                   |           |
| 3.5  | ReportCardTemplate          | CREATE | Same pattern as 3.1                                                                           | RLS policy violation                                                   |           |
| 3.6  | ReportCardTemplate          | READ   | Seed template under A; switch to B; list                                                      | `[]`                                                                   |           |
| 3.7  | ReportCardTemplate          | UPDATE | Seed template A; from B; attempt update                                                       | `P2025`                                                                |           |
| 3.8  | ReportCardTemplate          | DELETE | Seed template A; from B; attempt delete                                                       | `P2025`                                                                |           |
| 3.9  | ReportCardApprovalConfig    | CREATE | From B, attempt to insert with tenant_id = A                                                  | RLS policy violation (WITH CHECK clause)                               |           |
| 3.10 | ReportCardApprovalConfig    | READ   | Seed under A; from B; findMany                                                                | `[]`                                                                   |           |
| 3.11 | ReportCardApprovalConfig    | UPDATE | Seed under A; from B; update                                                                  | `P2025`                                                                |           |
| 3.12 | ReportCardApprovalConfig    | DELETE | Seed under A; from B; delete                                                                  | `P2025`                                                                |           |
| 3.13 | ReportCardApproval          | CREATE | From B, insert for A's card                                                                   | RLS violation                                                          |           |
| 3.14 | ReportCardApproval          | READ   | Seed approval step under A; from B; list pending                                              | `[]`                                                                   |           |
| 3.15 | ReportCardApproval          | UPDATE | Seed under A; from B; attempt status change                                                   | `P2025`                                                                |           |
| 3.16 | ReportCardApproval          | DELETE | Seed under A; from B; delete                                                                  | `P2025`                                                                |           |
| 3.17 | ReportCardDelivery          | CREATE | From B, insert targeting A's report card                                                      | RLS violation                                                          |           |
| 3.18 | ReportCardDelivery          | READ   | Seed under A; from B; findMany                                                                | `[]`                                                                   |           |
| 3.19 | ReportCardDelivery          | UPDATE | Seed under A; from B; mark as sent                                                            | `P2025`                                                                |           |
| 3.20 | ReportCardDelivery          | DELETE | Seed under A; from B; delete                                                                  | `P2025`                                                                |           |
| 3.21 | ReportCardBatchJob          | CREATE | From B, insert job row with tenant_id = A                                                     | RLS violation                                                          |           |
| 3.22 | ReportCardBatchJob          | READ   | Seed under A; from B; find by id                                                              | `null`                                                                 |           |
| 3.23 | ReportCardBatchJob          | UPDATE | Seed under A; from B; update progress                                                         | `P2025`                                                                |           |
| 3.24 | ReportCardBatchJob          | DELETE | Seed under A; from B; delete                                                                  | `P2025`                                                                |           |
| 3.25 | ReportCommentWindow         | CREATE | From B, create window for A                                                                   | RLS violation                                                          |           |
| 3.26 | ReportCommentWindow         | READ   | Seed under A; from B; find                                                                    | `[]`                                                                   |           |
| 3.27 | ReportCommentWindow         | UPDATE | Seed under A; from B; set status = open                                                       | `P2025`                                                                |           |
| 3.28 | ReportCommentWindow         | DELETE | Seed under A; from B; delete                                                                  | `P2025`                                                                |           |
| 3.29 | ReportCommentWindowHomeroom | CREATE | From B, insert homeroom mapping for A's window                                                | RLS violation (FK + RLS)                                               |           |
| 3.30 | ReportCommentWindowHomeroom | READ   | Seed under A; from B; findMany                                                                | `[]`                                                                   |           |
| 3.31 | ReportCommentWindowHomeroom | UPDATE | Seed under A; from B                                                                          | `P2025`                                                                |           |
| 3.32 | ReportCommentWindowHomeroom | DELETE | Seed under A; from B                                                                          | `P2025`                                                                |           |
| 3.33 | ReportCardSubjectComment    | CREATE | From B, insert comment for A's student                                                        | RLS violation                                                          |           |
| 3.34 | ReportCardSubjectComment    | READ   | Seed under A; from B                                                                          | `[]`                                                                   |           |
| 3.35 | ReportCardSubjectComment    | UPDATE | Seed under A; from B; finalise                                                                | `P2025`                                                                |           |
| 3.36 | ReportCardSubjectComment    | DELETE | Seed under A; from B                                                                          | `P2025`                                                                |           |
| 3.37 | ReportCardOverallComment    | CREATE | From B, insert for A's student                                                                | RLS violation                                                          |           |
| 3.38 | ReportCardOverallComment    | READ   | Seed under A; from B                                                                          | `[]`                                                                   |           |
| 3.39 | ReportCardOverallComment    | UPDATE | Seed under A; from B                                                                          | `P2025`                                                                |           |
| 3.40 | ReportCardOverallComment    | DELETE | Seed under A; from B                                                                          | `P2025`                                                                |           |
| 3.41 | ReportCardTeacherRequest    | CREATE | From B, insert request for A's window                                                         | RLS violation                                                          |           |
| 3.42 | ReportCardTeacherRequest    | READ   | Seed under A; from B; findMany                                                                | `[]`                                                                   |           |
| 3.43 | ReportCardTeacherRequest    | UPDATE | Seed under A; from B; approve                                                                 | `P2025`                                                                |           |
| 3.44 | ReportCardTeacherRequest    | DELETE | Seed under A; from B                                                                          | `P2025`                                                                |           |
| 3.45 | ReportCardTenantSettings    | CREATE | From B, insert with tenant_id = A (unique-per-tenant constraint kicks in too)                 | RLS violation                                                          |           |
| 3.46 | ReportCardTenantSettings    | READ   | Seed under A; from B; findUnique                                                              | `null`                                                                 |           |
| 3.47 | ReportCardTenantSettings    | UPDATE | Seed under A; from B; update branding                                                         | `P2025`                                                                |           |
| 3.48 | ReportCardTenantSettings    | DELETE | Seed under A; from B                                                                          | `P2025`                                                                |           |
| 3.49 | ReportCardCustomFieldDef    | CREATE | From B, insert for A                                                                          | RLS violation                                                          |           |
| 3.50 | ReportCardCustomFieldDef    | READ   | Seed under A; from B                                                                          | `[]`                                                                   |           |
| 3.51 | ReportCardCustomFieldDef    | UPDATE | Seed under A; from B                                                                          | `P2025`                                                                |           |
| 3.52 | ReportCardCustomFieldDef    | DELETE | Seed under A; from B                                                                          | `P2025`                                                                |           |
| 3.53 | ReportCardCustomFieldValue  | CREATE | From B, insert value for A's card                                                             | RLS violation                                                          |           |
| 3.54 | ReportCardCustomFieldValue  | READ   | Seed under A; from B                                                                          | `[]`                                                                   |           |
| 3.55 | ReportCardCustomFieldValue  | UPDATE | Seed under A; from B                                                                          | `P2025`                                                                |           |
| 3.56 | ReportCardCustomFieldValue  | DELETE | Seed under A; from B                                                                          | `P2025`                                                                |           |
| 3.57 | GradeThresholdConfig        | CREATE | From B, insert with tenant_id = A                                                             | RLS violation                                                          |           |
| 3.58 | GradeThresholdConfig        | READ   | Seed under A; from B                                                                          | `[]`                                                                   |           |
| 3.59 | GradeThresholdConfig        | UPDATE | Seed under A; from B                                                                          | `P2025`                                                                |           |
| 3.60 | GradeThresholdConfig        | DELETE | Seed under A; from B                                                                          | `P2025`                                                                |           |
| 3.61 | ReportCardAcknowledgment    | CREATE | From B, insert acknowledgment for A's delivery                                                | RLS violation                                                          |           |
| 3.62 | ReportCardAcknowledgment    | READ   | Seed under A; from B                                                                          | `[]`                                                                   |           |
| 3.63 | ReportCardAcknowledgment    | DELETE | Seed under A; from B                                                                          | `P2025`                                                                |           |
| 3.64 | ReportCardVerificationToken | CREATE | From B, insert targeting A's report card                                                      | RLS violation                                                          |           |
| 3.65 | ReportCardVerificationToken | READ   | Seed under A; from B; list tokens                                                             | `[]`                                                                   |           |
| 3.66 | ReportCardVerificationToken | UPDATE | Seed under A; from B; revoke                                                                  | `P2025`                                                                |           |
| 3.67 | ReportCardVerificationToken | DELETE | Seed under A; from B                                                                          | `P2025`                                                                |           |

### RLS Policy Sanity

| #    | Test Name                                                   | Setup Steps                                                                                           | Expected Result                                                                                           | Pass/Fail |
| ---- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| 3.68 | Every report_cards-prefixed table has RLS ENABLED + FORCED  | `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname LIKE 'report_card%'` | All rows return `relrowsecurity = true` AND `relforcerowsecurity = true`. No exceptions.                  |           |
| 3.69 | Every table has a `{table}_tenant_isolation` policy defined | `SELECT polname FROM pg_policy WHERE polrelid = '<oid>'`                                              | Every tenant-scoped table in the inventory has at least one policy named `{table_name}_tenant_isolation`. |           |
| 3.70 | Missing RLS context raises                                  | Open a Prisma transaction WITHOUT setting `app.current_tenant_id`; attempt `reportCard.findMany()`    | Either zero rows OR an explicit error. Never leaks A's data.                                              |           |

---

## 4. RLS Matrix — Cross-Tenant Endpoint Probes

Pattern: seed resource R under tenant A. Authenticate as tenant B. Hit the API endpoint referencing R's id. Expect **404 Not Found** (preferred) or **403 Forbidden** — **never 200 with A's data**.

| #    | Endpoint                                              | Method | Setup Steps                                                              | Expected Result                                                | Pass/Fail |
| ---- | ----------------------------------------------------- | ------ | ------------------------------------------------------------------------ | -------------------------------------------------------------- | --------- |
| 4.1  | `/v1/report-cards/:id`                                | GET    | Seed RC under A; auth as B head; GET /v1/report-cards/{A_rc_id}          | 404 NOT_FOUND                                                  |           |
| 4.2  | `/v1/report-cards/:id`                                | PATCH  | Seed RC under A; auth as B head; PATCH {A_rc_id} with status=draft       | 404 NOT_FOUND                                                  |           |
| 4.3  | `/v1/report-cards/:id/publish`                        | POST   | Seed RC under A; auth as B principal; POST publish                       | 404 NOT_FOUND                                                  |           |
| 4.4  | `/v1/report-cards/:id/revise`                         | POST   | Seed RC under A; auth as B head; POST revise                             | 404 NOT_FOUND                                                  |           |
| 4.5  | `/v1/report-cards/:id`                                | DELETE | Seed RC under A; auth as B head; DELETE                                  | 404 NOT_FOUND                                                  |           |
| 4.6  | `/v1/report-cards/:id/pdf`                            | GET    | Seed RC under A; auth as B head; request PDF                             | 404 NOT_FOUND                                                  |           |
| 4.7  | `/v1/report-cards/:id/submit-approval`                | POST   | Seed under A; auth as B head                                             | 404 NOT_FOUND                                                  |           |
| 4.8  | `/v1/report-cards/approvals/:id/approve`              | POST   | Seed approval step under A; auth as B principal                          | 404 NOT_FOUND                                                  |           |
| 4.9  | `/v1/report-cards/approvals/:id/reject`               | POST   | Seed approval step under A; auth as B principal; POST reject with reason | 404 NOT_FOUND                                                  |           |
| 4.10 | `/v1/report-cards/:id/deliver`                        | POST   | Seed RC under A; auth as B head                                          | 404 NOT_FOUND                                                  |           |
| 4.11 | `/v1/report-cards/:id/delivery-status`                | GET    | Seed RC under A; auth as B head                                          | 404 NOT_FOUND                                                  |           |
| 4.12 | `/v1/report-cards/:id/acknowledge`                    | POST   | Seed RC under A; auth as B parent with A's parent_id                     | 404 NOT_FOUND                                                  |           |
| 4.13 | `/v1/report-cards/:id/acknowledgment-status`          | GET    | Seed RC under A; auth as B head                                          | 404 NOT_FOUND                                                  |           |
| 4.14 | `/v1/report-cards/:id/verification-token`             | POST   | Seed RC under A; auth as B head                                          | 404 NOT_FOUND                                                  |           |
| 4.15 | `/v1/report-cards/:id/custom-field-values`            | PUT    | Seed RC under A; auth as B head; PUT values                              | 404 NOT_FOUND                                                  |           |
| 4.16 | `/v1/report-cards/:id/custom-field-values`            | GET    | Seed RC under A; auth as B head                                          | 404 NOT_FOUND                                                  |           |
| 4.17 | `/v1/report-cards/generation-runs/:id`                | GET    | Seed run under A; auth as B head; GET with A's run_id                    | 404 NOT_FOUND                                                  |           |
| 4.18 | `/v1/report-cards/generation-runs/dry-run`            | POST   | Auth as B; send body referencing A's class_id                            | 404 NOT_FOUND on the class FK (or 400 for tenant-scoped class) |           |
| 4.19 | `/v1/report-cards/generation-runs`                    | POST   | Auth as B; request a run referencing A's students                        | 404 NOT_FOUND (students not visible to B)                      |           |
| 4.20 | `/v1/report-cards/classes/:classId/matrix`            | GET    | Seed class under A; auth as B head; GET matrix                           | 404 NOT_FOUND or 403 CLASS_OUT_OF_SCOPE                        |           |
| 4.21 | `/v1/report-cards/library`                            | GET    | Seed data under A; auth as B head; list library                          | 200 with `data: []`, `meta.total = 0` — never leaks A          |           |
| 4.22 | `/v1/report-cards/library/grouped`                    | GET    | Seed under A; auth as B head                                             | 200 with `data: []`                                            |           |
| 4.23 | `/v1/report-cards/library/bundle-pdf`                 | GET    | Seed data under A; auth as B head; bundle with A's class_ids             | 404 (class not visible) or empty PDF with zero cards           |           |
| 4.24 | `/v1/report-cards/templates`                          | GET    | Seed template under A; auth as B                                         | `data: []`                                                     |           |
| 4.25 | `/v1/report-cards/templates/:id`                      | GET    | Seed under A; auth as B                                                  | 404 NOT_FOUND                                                  |           |
| 4.26 | `/v1/report-cards/templates/:id`                      | PATCH  | Seed under A; auth as B head                                             | 404 NOT_FOUND                                                  |           |
| 4.27 | `/v1/report-cards/templates/:id`                      | DELETE | Seed under A; auth as B head                                             | 404 NOT_FOUND                                                  |           |
| 4.28 | `/v1/report-cards/templates/content-scopes`           | GET    | Seed template A with custom scopes; auth as B                            | Only B's scopes returned (or empty if B has none)              |           |
| 4.29 | `/v1/report-cards/approval-configs`                   | GET    | Seed config under A; auth as B                                           | `[]`                                                           |           |
| 4.30 | `/v1/report-cards/approval-configs/:id`               | GET    | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.31 | `/v1/report-cards/approval-configs/:id`               | PATCH  | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.32 | `/v1/report-cards/approval-configs/:id`               | DELETE | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.33 | `/v1/report-cards/approvals/pending`                  | GET    | Seed approval for A's principal; auth as B principal                     | `data: []`                                                     |           |
| 4.34 | `/v1/report-cards/approvals/bulk-approve`             | POST   | Seed approvals under A; auth as B; POST with A's approval_ids            | 404 or `{approved: 0, skipped: N}`, never approves A's rows    |           |
| 4.35 | `/v1/report-cards/custom-fields`                      | GET    | Seed under A; auth as B                                                  | `[]`                                                           |           |
| 4.36 | `/v1/report-cards/custom-fields/:id`                  | GET    | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.37 | `/v1/report-cards/custom-fields/:id`                  | PATCH  | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.38 | `/v1/report-cards/custom-fields/:id`                  | DELETE | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.39 | `/v1/report-cards/grade-thresholds`                   | GET    | Seed under A; auth as B                                                  | `[]`                                                           |           |
| 4.40 | `/v1/report-cards/grade-thresholds/:id`               | GET    | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.41 | `/v1/report-cards/grade-thresholds/:id`               | PATCH  | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.42 | `/v1/report-cards/grade-thresholds/:id`               | DELETE | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.43 | `/v1/report-cards/students/:studentId/transcript`     | GET    | Seed student under A; auth as B head                                     | 404 NOT_FOUND (student not visible)                            |           |
| 4.44 | `/v1/report-cards/bulk/generate`                      | POST   | Auth as B head; POST with A's class_id                                   | 404 (class) or 400 (schema validation passes but FK fails)     |           |
| 4.45 | `/v1/report-cards/bulk/publish`                       | POST   | Seed cards under A; auth as B head; publish_bulk with A's card_ids       | `{ published: 0, skipped: N }` — never publishes A's rows      |           |
| 4.46 | `/v1/report-cards/bulk/deliver`                       | POST   | Seed cards under A; auth as B head; bulk-deliver                         | `{ delivered: 0, skipped: N }`                                 |           |
| 4.47 | `/v1/report-cards/bulk-delete`                        | POST   | Seed cards under A; auth as B head; bulk-delete with A's ids             | `{ deleted: 0 }` — A's cards remain intact                     |           |
| 4.48 | `/v1/report-cards/batch-pdf`                          | POST   | Auth as B; POST with A's class_id                                        | 404 on class FK                                                |           |
| 4.49 | `/v1/report-cards/analytics/dashboard`                | GET    | Data seeded in A; auth as B                                              | Dashboard shows B's totals (zero if B has no data), not A's    |           |
| 4.50 | `/v1/report-cards/analytics/class-comparison`         | GET    | Data in A; auth as B                                                     | Comparison returns B's classes only                            |           |
| 4.51 | `/v1/report-card-teacher-requests`                    | GET    | Seed request under A; auth as B teacher                                  | `data: []`                                                     |           |
| 4.52 | `/v1/report-card-teacher-requests/:id`                | GET    | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.53 | `/v1/report-card-teacher-requests/pending`            | GET    | Seed pending under A; auth as B admin                                    | `data: []`                                                     |           |
| 4.54 | `/v1/report-card-teacher-requests`                    | POST   | Auth as B teacher; submit request referencing A's window_id              | 404 (window not visible)                                       |           |
| 4.55 | `/v1/report-card-teacher-requests/:id/approve`        | POST   | Seed under A; auth as B admin                                            | 404                                                            |           |
| 4.56 | `/v1/report-card-teacher-requests/:id/reject`         | POST   | Seed under A; auth as B admin                                            | 404                                                            |           |
| 4.57 | `/v1/report-card-teacher-requests/:id/cancel`         | PATCH  | Seed under A; auth as B teacher                                          | 404                                                            |           |
| 4.58 | `/v1/report-comment-windows`                          | GET    | Seed window under A; auth as B                                           | `data: []`                                                     |           |
| 4.59 | `/v1/report-comment-windows/:id`                      | GET    | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.60 | `/v1/report-comment-windows/active`                   | GET    | Seed active window under A; auth as B                                    | `data: []`                                                     |           |
| 4.61 | `/v1/report-comment-windows/landing`                  | GET    | Seed data under A; auth as B                                             | B's own scope only                                             |           |
| 4.62 | `/v1/report-comment-windows`                          | POST   | Auth as B; POST with A's academic_period_id                              | 404 (period not visible)                                       |           |
| 4.63 | `/v1/report-comment-windows/:id`                      | PATCH  | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.64 | `/v1/report-comment-windows/:id/open`                 | POST   | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.65 | `/v1/report-comment-windows/:id/close`                | POST   | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.66 | `/v1/report-comment-windows/:id/reopen`               | POST   | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.67 | `/v1/report-comment-windows/:id/extend`               | PATCH  | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.68 | `/v1/report-card-subject-comments`                    | GET    | Seed under A; auth as B teacher                                          | `data: []`                                                     |           |
| 4.69 | `/v1/report-card-subject-comments/:id`                | GET    | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.70 | `/v1/report-card-subject-comments/:id`                | PATCH  | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.71 | `/v1/report-card-subject-comments/:id/finalise`       | POST   | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.72 | `/v1/report-card-overall-comments`                    | GET    | Seed under A; auth as B                                                  | `data: []`                                                     |           |
| 4.73 | `/v1/report-card-overall-comments/:id`                | GET    | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.74 | `/v1/report-card-overall-comments/:id`                | PATCH  | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.75 | `/v1/report-card-overall-comments/:id/finalise`       | POST   | Seed under A; auth as B                                                  | 404                                                            |           |
| 4.76 | `/v1/report-card-tenant-settings`                     | GET    | Seed under A; auth as B                                                  | Returns B's settings (or default), not A's                     |           |
| 4.77 | `/v1/report-card-tenant-settings`                     | PATCH  | Seed under A; auth as B head; PATCH                                      | Updates B's settings only; A's row untouched (verify after)    |           |
| 4.78 | `/v1/report-card-tenant-settings/principal-signature` | POST   | Auth as B; upload; verify stored under B                                 | File key prefix is `/tenants/{B_id}/...`, not A                |           |
| 4.79 | `/v1/report-card-tenant-settings/principal-signature` | DELETE | Seed signature under A; auth as B; DELETE                                | 404 or silent no-op; A's signature still present               |           |
| 4.80 | `/v1/report-cards/templates/convert-from-image`       | POST   | Auth as B; upload image; result stored tenant_id = B                     | Template created under B, A's template store unaffected        |           |

---

## 5. Contract Matrix — Request/Response Schemas

Each endpoint is validated against its canonical Zod schema (see `@school/shared`). Tests inject payloads designed to trip validation.

| #    | Endpoint                                           | Input / Mutation                                              | Expected Result                                                           | Pass/Fail |
| ---- | -------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- | --------- |
| 5.1  | POST /v1/report-cards/generate                     | Omit `student_ids`                                            | 400 VALIDATION; field `student_ids: required`                             |           |
| 5.2  | POST /v1/report-cards/generate                     | `student_ids: []` (empty array)                               | 400 VALIDATION; `student_ids: must contain at least 1 element`            |           |
| 5.3  | POST /v1/report-cards/generate                     | `academic_period_id: "not-a-uuid"`                            | 400 VALIDATION; `academic_period_id: invalid uuid`                        |           |
| 5.4  | POST /v1/report-cards/generate                     | `student_ids: ["not-a-uuid"]`                                 | 400 VALIDATION                                                            |           |
| 5.5  | POST /v1/report-cards/generate                     | Extra field `evil: "x"`                                       | Field is stripped (zod strip) OR 400 (if schema uses `.strict()`)         |           |
| 5.6  | POST /v1/report-cards/generation-runs              | Missing `class_ids`                                           | 400 VALIDATION                                                            |           |
| 5.7  | POST /v1/report-cards/generation-runs              | `content_scope: "unknown_scope"`                              | 400 VALIDATION                                                            |           |
| 5.8  | POST /v1/report-cards/generation-runs              | Valid payload, non-existent `template_id`                     | 404 TEMPLATE_NOT_FOUND                                                    |           |
| 5.9  | POST /v1/report-cards/generation-runs/dry-run      | Missing `class_ids`                                           | 400 VALIDATION                                                            |           |
| 5.10 | POST /v1/report-cards/templates                    | Omit required `name`                                          | 400 VALIDATION                                                            |           |
| 5.11 | POST /v1/report-cards/templates                    | `locale: "de"` (not in enum)                                  | 400 VALIDATION; locale must be en \| ar                                   |           |
| 5.12 | POST /v1/report-cards/templates                    | `content_scope: ""` (empty string)                            | 400 VALIDATION                                                            |           |
| 5.13 | PATCH /v1/report-cards/templates/:id               | Valid update, but `name: null`                                | 400 (name is not nullable) OR 200 (if schema permits) — must match schema |           |
| 5.14 | POST /v1/report-cards/approval-configs             | `steps: []`                                                   | 400 VALIDATION; at least one step required                                |           |
| 5.15 | POST /v1/report-cards/approval-configs             | Two steps with duplicate `order`                              | 400 VALIDATION                                                            |           |
| 5.16 | POST /v1/report-cards/approval-configs             | `steps[0].role_key` not in valid role enum                    | 400 VALIDATION                                                            |           |
| 5.17 | POST /v1/report-cards/approvals/:id/reject         | Missing `reason`                                              | 400 VALIDATION                                                            |           |
| 5.18 | POST /v1/report-cards/approvals/:id/reject         | `reason: ""` (empty)                                          | 400 VALIDATION (min-length)                                               |           |
| 5.19 | POST /v1/report-cards/approvals/bulk-approve       | `approval_ids: []`                                            | 400 VALIDATION                                                            |           |
| 5.20 | POST /v1/report-cards/bulk/generate                | Missing `class_id`                                            | 400                                                                       |           |
| 5.21 | POST /v1/report-cards/bulk/publish                 | `report_card_ids` contains 101 items (cap is 100)             | 400 VALIDATION (max items)                                                |           |
| 5.22 | POST /v1/report-cards/bulk/deliver                 | `report_card_ids` with duplicates                             | 400 OR dedupe silently — must match schema                                |           |
| 5.23 | POST /v1/report-cards/bulk-delete                  | All filter fields empty (`{}`)                                | 400 VALIDATION — at least one selector required                           |           |
| 5.24 | POST /v1/report-cards/bulk-delete                  | `academic_period_id: "full_year"` (sentinel)                  | 200 — controller translates to NULL                                       |           |
| 5.25 | POST /v1/report-cards/custom-fields                | `type: "unknown"`                                             | 400                                                                       |           |
| 5.26 | POST /v1/report-cards/custom-fields                | `type: "select"` but no `options`                             | 400 — cross-field refine should enforce options when select               |           |
| 5.27 | PUT /v1/report-cards/:id/custom-field-values       | `values: null`                                                | 400                                                                       |           |
| 5.28 | PUT /v1/report-cards/:id/custom-field-values       | `values: [{ field_id, value: [1,2] }]` for `type=text`        | 400 — value type must match field type                                    |           |
| 5.29 | POST /v1/report-cards/grade-thresholds             | Overlapping ranges                                            | 400 VALIDATION                                                            |           |
| 5.30 | POST /v1/report-cards/grade-thresholds             | Min > Max                                                     | 400                                                                       |           |
| 5.31 | POST /v1/report-cards/:id/acknowledge              | Missing `parent_id`                                           | 400                                                                       |           |
| 5.32 | POST /v1/report-cards/:id/acknowledge              | `parent_id: "not-a-uuid"`                                     | 400                                                                       |           |
| 5.33 | POST /v1/report-cards/batch-pdf                    | Missing `class_id`                                            | 400                                                                       |           |
| 5.34 | POST /v1/report-cards/batch-pdf                    | `academic_period_id: "not-a-uuid"`                            | 400                                                                       |           |
| 5.35 | POST /v1/report-comment-windows                    | `opens_at` > `closes_at`                                      | 400 VALIDATION (cross-field refine)                                       |           |
| 5.36 | POST /v1/report-comment-windows                    | `opens_at` is past date but `closes_at` is future             | 200 (allowed for immediate-open case) OR 400 if business rule forbids     |           |
| 5.37 | POST /v1/report-comment-windows                    | Unknown `scope: "all-schools"`                                | 400                                                                       |           |
| 5.38 | PATCH /v1/report-comment-windows/:id/extend        | `closes_at` in past                                           | 400                                                                       |           |
| 5.39 | POST /v1/report-card-teacher-requests              | Missing `type`                                                | 400                                                                       |           |
| 5.40 | POST /v1/report-card-teacher-requests              | `type: "open_comment_window"` but no `window_id`              | 400 (cross-field refine)                                                  |           |
| 5.41 | POST /v1/report-card-teacher-requests/:id/approve  | `comments: "<script>...`                                      | 200 — HTML encoding handled server-side (verify no XSS in stored string)  |           |
| 5.42 | POST /v1/report-card-teacher-requests/:id/reject   | `reason` too long (>2000 chars)                               | 400 VALIDATION                                                            |           |
| 5.43 | PATCH /v1/report-card-subject-comments/:id         | `comment_text: ""` (empty)                                    | 200 — draft save allows empty. Finalise should require non-empty.         |           |
| 5.44 | POST /v1/report-card-subject-comments/:id/finalise | Comment text is empty                                         | 409 INVALID_STATE — cannot finalise empty comment                         |           |
| 5.45 | PATCH /v1/report-card-tenant-settings              | `logo_max_height` = -1                                        | 400                                                                       |           |
| 5.46 | GET /v1/report-cards                               | `status: "approved"` (not in enum of draft/published/revised) | 400 VALIDATION                                                            |           |
| 5.47 | GET /v1/report-cards                               | `include_revisions: "yes"` (expects "true"/"false")           | 400 VALIDATION                                                            |           |
| 5.48 | GET /v1/report-cards/library                       | Malformed query `class_ids[]: "abc"`                          | 400                                                                       |           |
| 5.49 | GET /v1/report-cards/library/bundle-pdf            | `merge_mode: "tar"`                                           | 400 (only `single` \| `zip`)                                              |           |
| 5.50 | GET /v1/report-cards/classes/:classId/matrix       | `academic_period_id: "garbage"`                               | 400                                                                       |           |

### Response Schema Positive Assertions

| #    | Endpoint                       | Input            | Expected Response Shape                                                                                                                            | Pass/Fail |
| ---- | ------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.51 | GET /v1/report-cards           | Valid list query | `{ data: ReportCard[], meta: { page, pageSize, total } }` — all three meta fields present                                                          |           |
| 5.52 | GET /v1/report-cards/:id       | Valid id         | Single object with `id`, `student_id`, `status`, `snapshot_payload_json`, `tenant_id` (tenant_id MUST be masked/absent in public response — audit) |           |
| 5.53 | GET /v1/report-cards/library   | Default          | `data: ReportCardLibraryRow[]`, `meta` present                                                                                                     |           |
| 5.54 | GET /v1/report-cards/templates | Default          | Array of templates with `id`, `name`, `content_scope`, `locale`, `is_default`, `is_published`                                                      |           |

---

## 6. Contract Matrix — Pagination

Applied to every endpoint that returns `{ data, meta }`.

| #    | Endpoint                               | Query                           | Expected Result                                                             | Pass/Fail |
| ---- | -------------------------------------- | ------------------------------- | --------------------------------------------------------------------------- | --------- |
| 6.1  | GET /v1/report-cards                   | `?page=0`                       | 400 VALIDATION (min 1)                                                      |           |
| 6.2  | GET /v1/report-cards                   | `?page=-5`                      | 400 VALIDATION                                                              |           |
| 6.3  | GET /v1/report-cards                   | `?pageSize=0`                   | 400 VALIDATION (min 1)                                                      |           |
| 6.4  | GET /v1/report-cards                   | `?pageSize=101`                 | 400 VALIDATION (max 100) — Zod rejects with explicit error                  |           |
| 6.5  | GET /v1/report-cards                   | `?pageSize=abc`                 | 400 VALIDATION (coerce number fails)                                        |           |
| 6.6  | GET /v1/report-cards                   | `?page=99999` (past end)        | 200 `data: []` with correct `meta.total`                                    |           |
| 6.7  | GET /v1/report-cards                   | `?page=1&pageSize=20` (default) | 200 with up to 20 rows, `meta.page = 1`, `meta.pageSize = 20`               |           |
| 6.8  | GET /v1/report-cards/library           | `?pageSize=1000`                | 400 (max 100)                                                               |           |
| 6.9  | GET /v1/report-cards/generation-runs   | `?page=0`                       | 400                                                                         |           |
| 6.10 | GET /v1/report-cards/approvals/pending | `?page=abc`                     | 400                                                                         |           |
| 6.11 | GET /v1/report-cards/templates         | `?pageSize=50`                  | 200 with at most 50 rows                                                    |           |
| 6.12 | GET /v1/report-comment-windows         | `?page=2&pageSize=10`           | 200 with rows 11-20; total count stable                                     |           |
| 6.13 | GET /v1/report-card-teacher-requests   | `?page=0`                       | 400                                                                         |           |
| 6.14 | GET /v1/report-card-subject-comments   | `?pageSize=-1`                  | 400                                                                         |           |
| 6.15 | GET /v1/report-cards (meta stable)     | seed 45 cards, page=3, size=20  | `data.length = 5`, `meta.total = 45`, `meta.page = 3`, `meta.pageSize = 20` |           |

---

## 7. Contract Matrix — UUID Validation

Every `:id` param uses `ParseUUIDPipe`. Must return 400, never 500.

| #    | Endpoint                                          | Input            | Expected Result                                                                         | Pass/Fail |
| ---- | ------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------- | --------- |
| 7.1  | GET /v1/report-cards/:id                          | `/abc`           | 400 (ParseUUIDPipe)                                                                     |           |
| 7.2  | PATCH /v1/report-cards/:id                        | `/123`           | 400                                                                                     |           |
| 7.3  | POST /v1/report-cards/:id/publish                 | `/null`          | 400                                                                                     |           |
| 7.4  | POST /v1/report-cards/:id/revise                  | `/'; DROP TABLE` | 400 (no SQL injection possible)                                                         |           |
| 7.5  | GET /v1/report-cards/templates/:id                | `/abc`           | 400                                                                                     |           |
| 7.6  | PATCH /v1/report-cards/approval-configs/:id       | `/not-uuid`      | 400                                                                                     |           |
| 7.7  | GET /v1/report-cards/custom-fields/:id            | `/x`             | 400                                                                                     |           |
| 7.8  | GET /v1/report-cards/grade-thresholds/:id         | `/undefined`     | 400                                                                                     |           |
| 7.9  | GET /v1/report-cards/generation-runs/:id          | `/123-abc`       | 400                                                                                     |           |
| 7.10 | GET /v1/report-cards/classes/:classId/matrix      | `/bad`           | 400                                                                                     |           |
| 7.11 | PATCH /v1/report-comment-windows/:id              | `/x`             | 400                                                                                     |           |
| 7.12 | POST /v1/report-card-teacher-requests/:id/approve | `/garbage`       | 400                                                                                     |           |
| 7.13 | GET /v1/verify/:token                             | `/$%^`           | 404 (no UUID constraint — token is free-form but must still not leak error). Never 500. |           |

---

## 8. State Machine Integrity — ReportCardStatus

Valid transitions:

- `draft → published` via POST /:id/publish
- `published → revised` via POST /:id/revise (creates a NEW card with `revision_of_report_card_id`; original → `superseded`)
- `published → superseded` (by the revise flow, implicit)
- `revised → superseded` (further revise)
- `any → deleted` via DELETE /:id (hard delete OR status=archived depending on impl — verify)

Invalid transitions MUST return 409 INVALID_STATUS_TRANSITION.

| #    | Test Name                                          | Setup Steps                                                                         | Expected Result                                                                                    | Pass/Fail |
| ---- | -------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------- |
| 8.1  | draft → published (happy path)                     | Seed RC status=draft; POST /:id/publish as principal                                | 200 OK; status=published; `published_at` set; `published_by_user_id` = principal.sub               |           |
| 8.2  | published → draft is forbidden                     | Seed RC published; PATCH /:id with `status: "draft"`                                | 409 INVALID_STATUS_TRANSITION                                                                      |           |
| 8.3  | published → published (re-publish) is no-op or 409 | Seed RC published; POST /:id/publish again                                          | 409 INVALID_STATUS_TRANSITION (document if no-op instead)                                          |           |
| 8.4  | published → revised creates new card               | Seed RC R1 published; POST /:id/revise                                              | 201 Created; NEW card R2 with `revision_of_report_card_id = R1`; R1 status flipped to `superseded` |           |
| 8.5  | draft → revised is forbidden                       | Seed RC draft; POST /:id/revise                                                     | 409 INVALID_STATUS_TRANSITION (cannot revise unpublished)                                          |           |
| 8.6  | superseded is terminal                             | Seed RC superseded; POST /:id/publish                                               | 409                                                                                                |           |
| 8.7  | superseded → revise                                | Seed RC superseded; POST /:id/revise                                                | 409 (already superseded; revise the latest, not old ones)                                          |           |
| 8.8  | revised → revised again                            | Seed RC R1 published; revise to R2; publish R2; revise R2 to R3                     | R3 created; R2 superseded; R1 stays superseded                                                     |           |
| 8.9  | DELETE of published card                           | Seed RC published; DELETE /:id as head                                              | 200 OK (or 409 if deletion of published forbidden) — must match service                            |           |
| 8.10 | DELETE of draft is allowed                         | Seed RC draft; DELETE                                                               | 200 OK                                                                                             |           |
| 8.11 | Status field immutable outside transitions         | PATCH /:id with `status: "published"` (without going through /publish)              | 409 — status cannot be set directly, only via transition endpoints                                 |           |
| 8.12 | Bulk-publish skips non-draft                       | Seed 3 cards: 1 draft, 1 published, 1 superseded; POST /bulk/publish with all three | `{ published: 1, skipped: 2, skipReasons: { ... } }`                                               |           |
| 8.13 | Revise preserves snapshot immutability             | Revise R1 → R2; verify R1.snapshot_payload_json unchanged                           | R1 snapshot unchanged; R2 has fresh snapshot                                                       |           |
| 8.14 | Revision chain capped                              | Revise 20 times                                                                     | Either all succeed with full chain OR 409 after N revisions — document                             |           |
| 8.15 | Delete of a card with active revision              | R1 superseded by R2 (published); DELETE R1                                          | 409 CANNOT_DELETE_WITH_REVISIONS (or cascade — document)                                           |           |

---

## 9. State Machine Integrity — CommentWindowStatus

Valid transitions: `scheduled → open → closed → open (reopen)`. Invalid: `scheduled → closed`, `closed → scheduled`.

| #    | Test Name                                    | Setup Steps                                                  | Expected Result                                           | Pass/Fail |
| ---- | -------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------- | --------- |
| 9.1  | scheduled → open via /open                   | Seed window status=scheduled; POST /:id/open                 | 200; status=open                                          |           |
| 9.2  | open → closed via /close                     | Seed window open; POST /:id/close                            | 200; status=closed; `closed_at` set                       |           |
| 9.3  | closed → open via /reopen                    | Seed window closed; POST /:id/reopen                         | 200; status=open                                          |           |
| 9.4  | scheduled → closed (skip open) forbidden     | Seed scheduled; POST /:id/close                              | 409 INVALID_STATUS_TRANSITION                             |           |
| 9.5  | open → scheduled forbidden                   | Seed open; PATCH /:id with status=scheduled                  | 409 OR 400 (field not writable)                           |           |
| 9.6  | closed → scheduled forbidden                 | Seed closed; PATCH with status=scheduled                     | 409 / 400                                                 |           |
| 9.7  | Reopen preserves opens_at history            | Seed scheduled; open (opens_at = now1); close; reopen        | `opens_at` reflects first open; audit log has transitions |           |
| 9.8  | Extend on closed                             | Seed closed; PATCH /:id/extend with future closes_at         | 409 (cannot extend closed) OR auto-reopen — document      |           |
| 9.9  | Auto-transition scheduled→open via scheduler | Seed scheduled with opens_at in past; wait for cron          | status auto-flipped to open                               |           |
| 9.10 | Auto-transition open→closed via scheduler    | Seed open with closes_at in past; wait for cron              | status auto-flipped to closed                             |           |
| 9.11 | Reopen with new closes_at                    | POST /:id/reopen with body `{ closes_at: future }`           | 200; closes_at updated                                    |           |
| 9.12 | Reopen past the old closes_at without body   | POST /:id/reopen (no body) on window whose closes_at is past | 400 MISSING_CLOSES_AT (must specify new closes_at)        |           |

---

## 10. State Machine Integrity — TeacherRequestStatus

Valid: `pending → approved → completed`, `pending → rejected` (terminal), `pending → cancelled` (by requester).

| #     | Test Name                        | Setup Steps                                                                       | Expected Result                                                                        | Pass/Fail |
| ----- | -------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------- |
| 10.1  | Submit request creates pending   | POST /v1/report-card-teacher-requests with valid body                             | 201; status=pending                                                                    |           |
| 10.2  | Approve pending → approved       | Seed pending; POST /:id/approve as admin                                          | 200; status=approved; `approved_by_user_id` set                                        |           |
| 10.3  | Side-effect executed → completed | Approve with `type=open_comment_window`; wait for chain                           | status transitions to completed; resulting_window_id set                               |           |
| 10.4  | Reject pending → rejected        | Seed pending; POST /:id/reject with reason                                        | 200; status=rejected; `rejected_by_user_id` set                                        |           |
| 10.5  | Cancel pending as requester      | Seed pending; PATCH /:id/cancel as the original teacher                           | 200; status=cancelled                                                                  |           |
| 10.6  | Cancel pending as other teacher  | Seed pending by teacher A; PATCH /:id/cancel as teacher B                         | 403 NOT_REQUESTER                                                                      |           |
| 10.7  | Approve after reject             | Seed rejected; POST /:id/approve                                                  | 409 INVALID_STATUS_TRANSITION                                                          |           |
| 10.8  | Reject after approve             | Seed approved; POST /:id/reject                                                   | 409                                                                                    |           |
| 10.9  | Approve after cancel             | Seed cancelled; POST /:id/approve                                                 | 409                                                                                    |           |
| 10.10 | Double approve                   | Seed pending; approve twice                                                       | 2nd call → 409                                                                         |           |
| 10.11 | Approve as non-admin             | Seed pending; POST /:id/approve as teacher                                        | 403 INSUFFICIENT_PERMISSION                                                            |           |
| 10.12 | Reject as non-admin              | Seed pending; POST /:id/reject as teacher                                         | 403                                                                                    |           |
| 10.13 | Cancel after completed           | Seed completed; PATCH /:id/cancel                                                 | 409                                                                                    |           |
| 10.14 | Completed → approved no-op       | Seed completed; POST /:id/approve                                                 | 409                                                                                    |           |
| 10.15 | Chain failure flags the request  | Approve with type=regenerate_reports; make the chain fail; verify request reverts | status=approved but `resulting_run_status=failed`; or rolls back to pending — document |           |

---

## 11. State Machine Integrity — ApprovalStepStatus

Sequential order enforced. Step N cannot complete until step N-1 completed.

| #     | Test Name                            | Setup Steps                                                 | Expected Result                                             | Pass/Fail |
| ----- | ------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------------- | --------- |
| 11.1  | Step 1 approve when step 1 pending   | Seed approval with 2 steps; approve step 1 as academic head | 200; step 1 approved; step 2 still pending                  |           |
| 11.2  | Step 2 approve before step 1 blocked | Seed with step 1 pending; approve step 2 as principal       | 409 STEP_NOT_ACTIVE                                         |           |
| 11.3  | Step 2 approve after step 1 approved | Approve step 1 → approve step 2                             | 200; card status → `approved` and flagged for publish-ready |           |
| 11.4  | Reject step 1 rolls request back     | Seed pending; reject step 1 with reason                     | Card status=rejected; step 2 still pending but inactive     |           |
| 11.5  | Reject step 2                        | Approve step 1; reject step 2                               | Card status=rejected; step 1 approval preserved             |           |
| 11.6  | Approve with wrong role              | Approve step 1 (role=head) as principal                     | 403 WRONG_APPROVAL_ROLE                                     |           |
| 11.7  | Approve step already approved        | Approve step 1; approve step 1 again                        | 409                                                         |           |
| 11.8  | Reject already approved step         | Approve step 1; reject step 1                               | 409                                                         |           |
| 11.9  | Bulk-approve preserves order         | Seed 5 approvals all at step 1; bulk-approve all            | Each advances to step 2; none skip                          |           |
| 11.10 | Missing approval config              | POST /submit-approval on RC in tenant without config        | 409 NO_APPROVAL_CONFIG (document fallback if any)           |           |

---

## 12. State Machine Integrity — DeliveryStatus

Valid: `pending_delivery → sent → viewed`, `pending_delivery → failed`, `sent → failed` (bounce).

| #     | Test Name                                  | Setup Steps                                          | Expected Result                                        | Pass/Fail |
| ----- | ------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------ | --------- |
| 12.1  | pending_delivery → sent on enqueue success | POST /:id/deliver; wait for worker                   | delivery.status=sent; sent_at set                      |           |
| 12.2  | sent → viewed on acknowledge               | Deliver; POST /:id/acknowledge with parent_id        | delivery.status=viewed; viewed_at set                  |           |
| 12.3  | pending_delivery → failed on worker error  | Force worker to throw (invalid email); POST /deliver | delivery.status=failed; error_message set              |           |
| 12.4  | sent → failed on bounce webhook            | Mark delivery sent; simulate bounce webhook          | delivery.status=failed                                 |           |
| 12.5  | viewed → any is terminal                   | Acknowledge; POST /deliver again                     | 409 ALREADY_DELIVERED or new delivery row created      |           |
| 12.6  | failed → retry                             | Fail delivery; POST /deliver                         | New delivery attempt enqueued; row re-created or reset |           |
| 12.7  | Multiple channels per parent               | 1 parent with email+sms+whatsapp; deliver            | 3 delivery rows, one per channel                       |           |
| 12.8  | Channel disabled in tenant_settings        | Tenant disables SMS; deliver                         | Only email+whatsapp rows created; SMS skipped          |           |
| 12.9  | Guardian without email/phone               | Guardian has only whatsapp; deliver                  | Only whatsapp row; no failed email row                 |           |
| 12.10 | Acknowledge idempotent                     | Acknowledge twice with same parent_id                | 2nd call → 200 no-op OR 409 — document                 |           |

---

## 13. State Machine Integrity — BatchJobStatus

`queued → processing → completed | failed`. Admin cannot transition manually via API.

| #    | Test Name                             | Setup Steps                                                  | Expected Result                                                  | Pass/Fail |
| ---- | ------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- | --------- |
| 13.1 | Enqueue creates queued job            | POST /v1/report-cards/generation-runs                        | 201; batch_job.status=queued; jobId returned                     |           |
| 13.2 | Worker picks up → processing          | Wait for worker                                              | status=processing; started_at set                                |           |
| 13.3 | Worker completes → completed          | Wait for worker end                                          | status=completed; completed_at set; progress=100                 |           |
| 13.4 | Worker throws → failed                | Force failure; wait                                          | status=failed; error_message set                                 |           |
| 13.5 | PATCH /batch-jobs/:id status manually | (no such endpoint exists — verify)                           | 404 NOT_FOUND — endpoint must not exist                          |           |
| 13.6 | Progress updates mid-flight           | Start run; poll GET /generation-runs/:id                     | progress field monotonically increases                           |           |
| 13.7 | Cancel queued job                     | (document if endpoint exists; if not, test that none exists) | N/A OR cancellation test if implemented                          |           |
| 13.8 | Failed job retains partial results    | Fail midway through 10 students; inspect run                 | Completed cards persisted; failed students listed in run.summary |           |

---

## 14. Invariants — Uniqueness Constraints

| #     | Test Name                                             | Setup Steps                                                            | Expected Result                                                                                      | Pass/Fail |
| ----- | ----------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------- |
| 14.1  | 1 tenant_settings row per tenant                      | Insert 2 rows with same tenant_id                                      | 2nd insert throws unique constraint violation                                                        |           |
| 14.2  | PATCH creates on first access                         | First PATCH before any GET                                             | 200; row created                                                                                     |           |
| 14.3  | Verification token is globally unique                 | Insert two tokens with same token value across tenant A and B          | Unique constraint on `token` column violates                                                         |           |
| 14.4  | Delivery unique per card+parent+channel               | Deliver same card to same parent via email twice without status reset  | Unique constraint on (card_id, parent_id, channel) violates OR the 2nd call is idempotent — document |           |
| 14.5  | Template is_default: one per content_scope+locale     | Seed two templates both marked is_default=true for same (scope,locale) | Partial unique index / trigger fires                                                                 |           |
| 14.6  | ReportCard unique per (student, period, template)     | Generate twice for same (student, period)                              | Second generation is no-op OR 409                                                                    |           |
| 14.7  | ReportCommentWindow unique per scope+period           | Seed two windows for same (class_id, academic_period_id)               | Unique constraint or business-rule 409                                                               |           |
| 14.8  | Subject comment unique per (student, subject, period) | Insert duplicate                                                       | Unique violation                                                                                     |           |
| 14.9  | Overall comment unique per (student, period)          | Insert duplicate                                                       | Unique violation                                                                                     |           |
| 14.10 | Approval unique per (report_card_id, step_order)      | Insert duplicate                                                       | Unique violation                                                                                     |           |

---

## 15. Invariants — Foreign Key Integrity

| #     | Test Name                                        | Setup Steps                                          | Expected Result                                                                                                           | Pass/Fail |
| ----- | ------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.1  | Delete class that has report cards               | Seed class + RC; DELETE /v1/classes/:id              | 409 / FK restrict OR cascade — document choice                                                                            |           |
| 15.2  | Delete student that has report cards             | Seed student + RC; archive/delete student            | 409 / FK — cards retained for audit                                                                                       |           |
| 15.3  | Delete template that is in use                   | Seed template used by RC; DELETE template            | 409 TEMPLATE_IN_USE                                                                                                       |           |
| 15.4  | Delete unused template                           | Seed template never referenced; DELETE               | 204 No Content                                                                                                            |           |
| 15.5  | Delete approval config in use                    | Config referenced by pending approvals; DELETE       | 409                                                                                                                       |           |
| 15.6  | Delete comment window with comments              | Window has finalised subject comments; DELETE        | 409 or soft-delete (status=archived)                                                                                      |           |
| 15.7  | Delete custom field def with values              | Field def has values stored; DELETE                  | 409 or cascade + audit                                                                                                    |           |
| 15.8  | Delete grade threshold in use                    | Threshold used by at least one published RC snapshot | 409 or soft-delete — threshold snapshots are baked into payload, so delete should be permitted since payload is immutable |           |
| 15.9  | Delete academic period with cards                | Period has cards; DELETE period                      | 409                                                                                                                       |           |
| 15.10 | Delete academic year with cards                  | Year has cards; DELETE year                          | 409                                                                                                                       |           |
| 15.11 | Delete user that is requester of teacher_request | Requester user archived; request still viewable      | request.requested_by_user_id stays; user label shows "Archived user"                                                      |           |
| 15.12 | Delete parent that has acknowledgment            | Parent has ack row; archive parent                   | Ack row retained; parent soft-archived                                                                                    |           |
| 15.13 | Cascade: delete RC deletes deliveries            | DELETE /v1/report-cards/:id                          | All deliveries for that card removed OR soft-archived — document                                                          |           |
| 15.14 | Cascade: delete RC deletes approvals             | DELETE /v1/report-cards/:id                          | Approval rows removed                                                                                                     |           |
| 15.15 | Cascade: delete RC deletes custom_field_values   | DELETE /v1/report-cards/:id                          | Values removed                                                                                                            |           |

---

## 16. Invariants — Nullable `academic_period_id` (Full-Year Comments)

The schema allows `academic_period_id = NULL` for "full-year" comments. Partial unique indexes must be carefully scoped.

| #    | Test Name                                         | Setup Steps                                                   | Expected Result                             | Pass/Fail |
| ---- | ------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------- | --------- |
| 16.1 | Full-year comment: period_id NULL allowed         | Insert overall comment for student S1 with period_id=NULL     | 201                                         |           |
| 16.2 | Multiple full-year per student                    | Insert two overall comments for S1 both with period_id=NULL   | 409 UNIQUE — only one full-year per student |           |
| 16.3 | Full-year + per-period coexist                    | Insert full-year (NULL) and T1 (period_id=X) for same student | Both persist                                |           |
| 16.4 | Bulk-delete with period_id=full_year              | POST /bulk-delete `{ academic_period_id: "full_year" }`       | Only cards with period_id IS NULL deleted   |           |
| 16.5 | GET /report-cards with `?academic_period_id=null` | not supported — query rejects                                 | 400 VALIDATION (uuid-only)                  |           |
| 16.6 | Comment window with academic_period_id NULL       | Create window scope=full_year                                 | 201                                         |           |
| 16.7 | Dry-run with full_year sentinel                   | POST /generation-runs/dry-run with sentinel                   | 200; returns count of full-year gaps        |           |
| 16.8 | Library group-by-period handles NULL              | GET /library/grouped with mixed NULL + non-NULL rows          | Groups as `Full Year` bucket + per-period   |           |

---

## 17. Invariants — Snapshot Immutability

Published ReportCard must capture all grade/comment data into `snapshot_payload_json`, which is then frozen. Mutating underlying grades must NOT affect the snapshot.

| #    | Test Name                                          | Setup Steps                                                                     | Expected Result                                                       | Pass/Fail |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------- |
| 17.1 | Publish captures snapshot                          | Seed card draft; publish; read back                                             | `snapshot_payload_json` contains all grades+comments                  |           |
| 17.2 | Grade change after publish doesn't affect snapshot | Publish; update underlying `gradebook_entry.score`; re-GET /:id                 | Snapshot unchanged                                                    |           |
| 17.3 | Comment edit after publish ignored                 | Publish; finalise different text on subject comment (if still editable); re-GET | Snapshot retains original comment                                     |           |
| 17.4 | Template change after publish doesn't retemplate   | Publish; edit template; re-render PDF                                           | PDF still uses original template snapshot                             |           |
| 17.5 | Revise rebuilds snapshot from live data            | Publish R1; edit grades; revise → R2                                            | R2 snapshot reflects current grades; R1 snapshot still shows original |           |

---

## 18. Webhook / Chain — Generation Run → Report Cards Created

POST /v1/report-cards/generation-runs enqueues a BullMQ job. Worker creates N ReportCard rows.

| #     | Test Name                                  | Setup Steps                              | Expected Result                                                             | Pass/Fail |
| ----- | ------------------------------------------ | ---------------------------------------- | --------------------------------------------------------------------------- | --------- |
| 18.1  | Full class generation                      | POST for class with 30 students          | batch_job created queued; wait; 30 RCs with status=draft + batch_job_id set |           |
| 18.2  | Cross-class generation                     | POST for 2 classes × 30 students         | 60 RCs created                                                              |           |
| 18.3  | Idempotent re-run (existing cards)         | Run twice for same (students, period)    | 2nd run: 0 created; `skipped: 30` in summary                                |           |
| 18.4  | Partial failure                            | One student missing required grades      | 29 cards created; 1 in run.errors; run.status=completed_with_errors         |           |
| 18.5  | Template missing                           | Tenant has no default template for scope | 409 NO_DEFAULT_TEMPLATE at enqueue time                                     |           |
| 18.6  | Queue contains tenant_id in every job      | Inspect bullmq job payload               | `tenant_id` key present on every job                                        |           |
| 18.7  | Worker crash mid-run                       | Kill worker mid-processing; restart      | Job retries; completes; no duplicate cards created                          |           |
| 18.8  | Generation run for closed period           | Run for past closed period               | 200 — allowed (re-generating old term)                                      |           |
| 18.9  | Dry-run returns counts but creates nothing | POST /dry-run                            | 200 with student_counts; DB unchanged                                       |           |
| 18.10 | Progress events emitted                    | Subscribe to run updates                 | progress updates at 10%, 25%, 50%, 75%, 100% (or continuous)                |           |

---

## 19. Webhook / Chain — Teacher Request Approve → Window Opened

POST /v1/report-card-teacher-requests/:id/approve with `type=open_comment_window` must:

1. Create a `ReportCommentWindow` (status=open).
2. Link `teacher_request.resulting_window_id`.
3. Transition request to `completed`.

| #    | Test Name                              | Setup Steps                                                      | Expected Result                                                                                     | Pass/Fail |
| ---- | -------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------- |
| 19.1 | Approve open_comment_window happy path | Submit request type=open_comment_window; approve as admin        | 200; new ReportCommentWindow row status=open + linked resulting_window_id; request.status=completed |           |
| 19.2 | Window carries request's scope         | Request scope=class X; approve                                   | Window has class X in scope                                                                         |           |
| 19.3 | Window carries request's period        | Request for period T2; approve                                   | Window.academic_period_id = T2                                                                      |           |
| 19.4 | Auto-closes_at = 48h from approval     | Request with no explicit closes_at; approve at 2026-04-12T10:00Z | Window.closes_at = 2026-04-14T10:00Z (or whatever tenant default is)                                |           |
| 19.5 | Chain failure rolls back               | Force window.create to throw                                     | Transaction rollback: request stays pending; no window created                                      |           |
| 19.6 | Duplicate window prevented             | Approve; approve again (via duplicate pending request)           | 2nd attempt → 409 WINDOW_ALREADY_EXISTS                                                             |           |
| 19.7 | Audit log records chain                | Approve; check audit_log                                         | 2 rows: 1 for teacher_request approval, 1 for window creation                                       |           |
| 19.8 | Teacher notified on approval           | Approve; check notifications table                               | notification row for requester user                                                                 |           |

---

## 20. Webhook / Chain — Teacher Request Approve → Generation Run Triggered

`type=regenerate_reports`:

| #    | Test Name                                 | Setup Steps                                       | Expected Result                                                                                            | Pass/Fail |
| ---- | ----------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------- |
| 20.1 | Approve regenerate_reports happy path     | Submit request; approve                           | ReportCardBatchJob created; resulting_run_id set; request.status=approved (or completed when run finishes) |           |
| 20.2 | Generation job inherits request scope     | Request for class X / period T2                   | Batch job has class_ids=[X], academic_period_id=T2                                                         |           |
| 20.3 | Run completion marks request completed    | Wait for run end                                  | request.status=completed                                                                                   |           |
| 20.4 | Run failure marks request with flag       | Force generation to fail                          | request.status stays approved; resulting_run_status=failed                                                 |           |
| 20.5 | Concurrent regeneration requests          | Two pending requests for same scope; approve both | Second → 409 or coalesces into one run                                                                     |           |
| 20.6 | Audit log has chain                       | Approve; inspect audit                            | teacher_request.approved + batch_job.created rows                                                          |           |
| 20.7 | Rejecting does NOT trigger run            | Reject request; inspect batch_jobs                | No new job created                                                                                         |           |
| 20.8 | Cancel after approve before run completes | Approve; before worker picks up, cancel request   | 409 CANNOT_CANCEL_AFTER_APPROVE (or cancels the job — document)                                            |           |

---

## 21. Webhook / Chain — Publish → Delivery Enqueued

POST /:id/publish must:

1. Set status=published.
2. Generate verification token (via separate endpoint OR bundled — document).
3. Enqueue `gradebook:publish_report_cards` job or directly create Delivery rows per linked parent/channel.

| #     | Test Name                                    | Setup Steps                                           | Expected Result                                | Pass/Fail |
| ----- | -------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------- | --------- |
| 21.1  | Publish with 1 parent, 3 channels enabled    | Student has 1 guardian, tenant has email+sms+whatsapp | 3 delivery rows (status=pending_delivery)      |           |
| 21.2  | Publish with 2 parents                       | Student has 2 guardians                               | 2 × N_channels delivery rows                   |           |
| 21.3  | Publish with no parents                      | Student has no guardians                              | 0 delivery rows; no error                      |           |
| 21.4  | Published_at matches publish call            | Record time T; publish; read back                     | published_at ≈ T (±5s)                         |           |
| 21.5  | Delivery rows carry tenant_id                | Inspect                                               | tenant_id matches                              |           |
| 21.6  | Bulk publish fans out deliveries             | POST /bulk/publish with 30 ids                        | 30 × guardians × channels delivery rows        |           |
| 21.7  | Publish enqueues delivery job                | Publish; inspect gradebook queue                      | At least 1 delivery job present with tenant_id |           |
| 21.8  | Publish triggers verification token creation | Publish; GET /:id (tokens embedded)                   | verification_token row exists                  |           |
| 21.9  | Publish with approval required but no config | Publish where approval required                       | 409 APPROVAL_REQUIRED                          |           |
| 21.10 | Publish after approval completes             | Approval config present, all steps approved           | Publish succeeds                               |           |

---

## 22. Webhook / Chain — Acknowledge → Delivery Status Updated

| #    | Test Name                                | Setup Steps                                   | Expected Result                                                              | Pass/Fail |
| ---- | ---------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------- | --------- |
| 22.1 | Parent acknowledges after delivery       | Deliver; POST /:id/acknowledge with parent_id | delivery.status=viewed; viewed_at set; ack row created                       |           |
| 22.2 | Ack IP captured                          | POST with X-Forwarded-For header              | ack.ip_address = header value                                                |           |
| 22.3 | Ack before delivery                      | POST /:id/acknowledge before POST /deliver    | 409 NOT_DELIVERED or creates pending ack + forward when delivered — document |           |
| 22.4 | Ack by wrong parent                      | Student has parent P1; POST ack with P2's id  | 403 NOT_GUARDIAN                                                             |           |
| 22.5 | Ack updates all channels for that parent | Parent has email+sms both sent                | Both delivery rows flip to viewed                                            |           |

---

## 23. Webhook / Chain — Revise → New Card + Supersede Chain

| #    | Test Name                             | Setup Steps                               | Expected Result                     | Pass/Fail |
| ---- | ------------------------------------- | ----------------------------------------- | ----------------------------------- | --------- |
| 23.1 | Revise creates new card               | Seed R1 published; POST /:id/revise       | 201; new card R2 with status=draft  |           |
| 23.2 | R2.revision_of_report_card_id = R1.id | Inspect R2                                | Links correctly                     |           |
| 23.3 | R1 status → superseded                | Inspect R1 after revise                   | status=superseded                   |           |
| 23.4 | R2 snapshot is fresh (current grades) | Edit grades between R1 publish and revise | R2.snapshot reflects updated grades |           |
| 23.5 | R1 snapshot stays frozen              | Same scenario                             | R1.snapshot unchanged               |           |

---

## 24. Concurrency — Race Conditions

Use `Promise.all` to fire concurrent requests against the same resource. Database must enforce consistency.

| #     | Test Name                                  | Setup Steps                                              | Expected Result                                                                                | Pass/Fail |
| ----- | ------------------------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------- |
| 24.1  | Two admins publish same card               | Seed draft RC; fire 2 × POST /:id/publish concurrently   | 1 × 200, 1 × 409 INVALID_STATUS_TRANSITION                                                     |           |
| 24.2  | Two admins revise same card                | Seed published; fire 2 × POST /:id/revise                | 1 × 201, 1 × 409 (or both succeed creating 2 revisions — document)                             |           |
| 24.3  | Publish + delete simultaneously            | Fire POST /:id/publish + DELETE /:id                     | Either both 200 (RC deleted after publish) or one 409. No orphan state.                        |           |
| 24.4  | Update + publish                           | PATCH (change template) + POST /publish                  | One wins; state is internally consistent                                                       |           |
| 24.5  | Generation run + bulk-delete               | Run for class X + bulk-delete class X                    | Deadlock avoided; cards either all created or all deleted                                      |           |
| 24.6  | Two teachers finalise same comment         | Fire 2 × POST /finalise                                  | 1 × 200, 1 × 409                                                                               |           |
| 24.7  | Duplicate verification token generation    | Fire 2 × POST /:id/verification-token                    | Either 2nd returns existing (idempotent) or 2nd generates new and invalidates first — document |           |
| 24.8  | Acknowledge + deliver retry                | Fire ack + re-deliver                                    | Consistent; no lost ack                                                                        |           |
| 24.9  | Approval + rejection                       | Fire approve + reject for step 1                         | 1 wins; other gets 409                                                                         |           |
| 24.10 | Bulk publish + bulk delete same ids        | Fire both concurrently                                   | No deadlock; each row ends up in one consistent state                                          |           |
| 24.11 | Window open + close                        | Fire POST /open + POST /close on same scheduled window   | Exactly one wins                                                                               |           |
| 24.12 | Teacher request approve + requester cancel | Fire approve (admin) + cancel (requester) simultaneously | 1 × 200, 1 × 409                                                                               |           |

---

## 25. Concurrency — Autosave Conflict

Subject/overall comment autosave (PATCH) must handle simultaneous edits.

| #    | Test Name                                 | Setup Steps                                                  | Expected Result                                                 | Pass/Fail |
| ---- | ----------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- | --------- |
| 25.1 | Two HRTs edit same overall comment        | Both HRTs assigned to same class; fire 2 × PATCH             | Last-write-wins OR conflict 409 with optimistic lock — document |           |
| 25.2 | Version field increments                  | If optimistic lock used: each PATCH bumps `version`          | Correct version increments; stale PATCH → 409                   |           |
| 25.3 | Concurrent finalise + PATCH               | Fire finalise + PATCH                                        | If finalised first: PATCH → 409 COMMENT_FINALISED               |           |
| 25.4 | Subject comment edit by non-owner teacher | Teacher A edits teacher B's subject (but A doesn't teach it) | 403 INVALID_AUTHOR                                              |           |
| 25.5 | Save after window closes                  | PATCH at T; window closes at T-1                             | 409 WINDOW_CLOSED                                               |           |

---

## 26. Concurrency — Bulk Operations Under Load

| #    | Test Name                                          | Setup Steps                                                         | Expected Result                                                                           | Pass/Fail |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------- |
| 26.1 | Bulk-delete 100 + concurrent single publish on one | Seed 100 cards; fire bulk-delete + POST /:id/publish on one of them | Either card is deleted (publish → 404) OR published (delete → 99 deleted). No half-state. |           |
| 26.2 | Bulk-publish 100 concurrent with per-card ack      | Bulk-publish + 1 parent acknowledges the 1st card                   | Publish completes; ack lands correctly                                                    |           |
| 26.3 | Two bulk-generates for overlapping scopes          | Run A: class X period T2; Run B: class X period T2                  | Deduped OR both complete with 0 duplicates                                                |           |
| 26.4 | Bulk-delete under tenant_settings lock             | Admin PATCH settings + bulk-delete                                  | No deadlock                                                                               |           |
| 26.5 | 1000-row bulk-publish                              | Seed 1000 cards; bulk-publish (cap should reject)                   | 400 VALIDATION (over cap) OR processed in batches                                         |           |

---

## 27. Concurrency — Teacher Request Double-Approve

| #    | Test Name                                     | Setup Steps                                                     | Expected Result                                        | Pass/Fail |
| ---- | --------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ | --------- |
| 27.1 | Two admins approve same request               | Seed pending; 2 admins fire POST /:id/approve concurrently      | 1 × 200, 1 × 409 INVALID_STATUS_TRANSITION             |           |
| 27.2 | Admin approves + admin rejects simultaneously | Fire approve + reject                                           | 1 wins; state intact                                   |           |
| 27.3 | Requester cancels + admin approves            | Fire cancel + approve                                           | 1 × 200, 1 × 409                                       |           |
| 27.4 | Bulk-approve of already-approved request      | Request approved by admin A; admin B bulk-approves including it | That id skipped; others approved; summary counts match |           |
| 27.5 | Audit log has exactly one approval row        | After 27.1 resolves                                             | audit_log has one row, not two                         |           |

---

## 28. Authorization Leakage — Cross-User

Teacher A cannot act as Teacher B on comments Teacher B owns.

| #     | Test Name                                           | Setup Steps                                              | Expected Result                                             | Pass/Fail |
| ----- | --------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- | --------- |
| 28.1  | Finalise another teacher's subject comment          | Comment authored by teacher_b; teacher_a POSTs /finalise | 403 INVALID_AUTHOR                                          |           |
| 28.2  | Edit another teacher's subject comment              | Same; PATCH                                              | 403                                                         |           |
| 28.3  | Finalise another HRT's overall comment              | Overall by HRT_a; HRT_b finalises (different class)      | 403                                                         |           |
| 28.4  | Cancel another teacher's request                    | Request by teacher_a; teacher_b PATCHes /cancel          | 403 NOT_REQUESTER                                           |           |
| 28.5  | Parent A acknowledges card for Parent B's child     | POST /:id/acknowledge with parent_id of non-guardian     | 403 NOT_GUARDIAN                                            |           |
| 28.6  | Parent A views Parent B's child's card              | GET /report-cards/:id for Parent B's card                | 404 (parent cannot see others)                              |           |
| 28.7  | Teacher reads report card of class they don't teach | GET /classes/:classId/matrix for other class             | 403 CLASS_OUT_OF_SCOPE                                      |           |
| 28.8  | Student views another student's card                | GET /:id for another student's card                      | 404                                                         |           |
| 28.9  | Approver approves own-submitted card                | Head submits RC; head attempts step-1 approve            | 403 SELF_APPROVAL_FORBIDDEN (if rule exists; else document) |           |
| 28.10 | Teacher generates verification token                | POST /:id/verification-token as teacher (not admin)      | 403 INSUFFICIENT_PERMISSION                                 |           |

---

## 29. Authorization Leakage — Role Elevation

Teacher JWT cannot access admin endpoints, even with crafted headers.

| #     | Endpoint                                              | Method | Actor   | Expected Result                      | Pass/Fail |
| ----- | ----------------------------------------------------- | ------ | ------- | ------------------------------------ | --------- |
| 29.1  | POST /report-cards/generate                           | POST   | Teacher | 403 INSUFFICIENT_PERMISSION          |           |
| 29.2  | POST /report-cards/generation-runs                    | POST   | Teacher | 403                                  |           |
| 29.3  | POST /report-cards/templates                          | POST   | Teacher | 403                                  |           |
| 29.4  | PATCH /report-cards/templates/:id                     | PATCH  | Teacher | 403                                  |           |
| 29.5  | DELETE /report-cards/templates/:id                    | DELETE | Teacher | 403                                  |           |
| 29.6  | POST /report-cards/approval-configs                   | POST   | Teacher | 403                                  |           |
| 29.7  | POST /report-cards/approvals/:id/approve              | POST   | Teacher | 403                                  |           |
| 29.8  | POST /report-cards/bulk/publish                       | POST   | Teacher | 403                                  |           |
| 29.9  | POST /report-cards/bulk-delete                        | POST   | Teacher | 403                                  |           |
| 29.10 | POST /report-cards/batch-pdf                          | POST   | Teacher | 403                                  |           |
| 29.11 | GET /report-cards/analytics/dashboard                 | GET    | Teacher | 403 (needs gradebook.view_analytics) |           |
| 29.12 | POST /report-card-tenant-settings/principal-signature | POST   | Teacher | 403                                  |           |
| 29.13 | POST /report-card-teacher-requests/:id/approve        | POST   | Teacher | 403                                  |           |
| 29.14 | POST /report-comment-windows                          | POST   | Teacher | 403                                  |           |
| 29.15 | GET /report-cards/students/:studentId/transcript      | GET    | Teacher | 403 (transcripts.generate required)  |           |

### Session-state isolation

| #     | Test Name                                            | Setup Steps                                                 | Expected Result                                                   | Pass/Fail |
| ----- | ---------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- | --------- |
| 29.16 | Header injection `X-Tenant-Id` ignored               | Auth as tenant A; send `X-Tenant-Id: B`                     | Tenant resolution uses JWT only; 200 returns A's data; no leakage |           |
| 29.17 | Forged JWT claims                                    | Craft JWT with `membership_id` pointing to admin membership | 401 INVALID_SIGNATURE                                             |           |
| 29.18 | Expired JWT                                          | Use JWT past `exp`                                          | 401                                                               |           |
| 29.19 | Revoked session                                      | Auth; revoke session; retry                                 | 401                                                               |           |
| 29.20 | Owner bypass respected on report_cards.manage routes | Owner (no explicit perm grant) hits admin endpoint          | 200                                                               |           |

---

## 30. Permission Cache Invalidation

`PermissionCacheService` caches permissions per membership. Mid-session changes must propagate.

| #    | Test Name                                  | Setup Steps                                                                        | Expected Result                    | Pass/Fail |
| ---- | ------------------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------- | --------- |
| 30.1 | Grant permission → next request honours it | Teacher lacks report_cards.manage; grant it via admin; teacher retries immediately | 200 (grant reflected)              |           |
| 30.2 | Revoke permission → next request denies    | Teacher has report_cards.comment; revoke; retries                                  | 403                                |           |
| 30.3 | Cache stampede                             | Fire 100 concurrent requests during invalidation                                   | No errors; eventual consistency    |           |
| 30.4 | Role-change in-flight                      | Teacher mid-request; change role; verify request completes with old role's scope   | no mid-request elevation           |           |
| 30.5 | Permission cache respects tenant isolation | Grant perm in tenant A; teacher in tenant B unaffected                             | No cross-tenant permission leakage |           |
| 30.6 | Logout clears cache for that membership    | Login; hit endpoint; logout; re-login with different perms                         | New perms honoured                 |           |
| 30.7 | Owner flag cached                          | Owner hits admin endpoint; revoke owner flag; retry                                | 403 on retry                       |           |
| 30.8 | Permission change emits audit              | Grant; check audit_log                                                             | role_grant audit row persisted     |           |

---

## 31. PDF Contract — Response Headers

GET /v1/report-cards/:id/pdf and bundle-pdf.

| #    | Test Name                                | Setup Steps                               | Expected Result                                                | Pass/Fail |
| ---- | ---------------------------------------- | ----------------------------------------- | -------------------------------------------------------------- | --------- |
| 31.1 | Content-Type application/pdf             | GET /:id/pdf                              | `Content-Type: application/pdf`                                |           |
| 31.2 | Content-Disposition inline with filename | GET /:id/pdf                              | `inline; filename="report-card.pdf"` (per controller impl)     |           |
| 31.3 | Filename contains student + period       | Bundle PDF endpoint                       | Filename matches `report-cards-{period_slug}-{yyyymmdd}.pdf`   |           |
| 31.4 | Bundle single mode                       | GET /library/bundle-pdf?merge_mode=single | Content-Type: application/pdf; one merged PDF                  |           |
| 31.5 | Bundle ZIP mode                          | GET /library/bundle-pdf?merge_mode=zip    | Content-Type: application/zip; filename ends with .zip         |           |
| 31.6 | Content-Length set                       | Either endpoint                           | Content-Length header present and non-zero                     |           |
| 31.7 | 404 on missing card                      | Non-existent id                           | 404                                                            |           |
| 31.8 | Locale propagates                        | GET /:id/pdf with Arabic card             | PDF rendered with Arabic template (template_locale field used) |           |

---

## 32. PDF Contract — Bundle ZIP Mode

| #    | Test Name             | Setup Steps                         | Expected Result                                 | Pass/Fail |
| ---- | --------------------- | ----------------------------------- | ----------------------------------------------- | --------- |
| 32.1 | ZIP contains N PDFs   | Bundle 30-student class in zip mode | ZIP has 30 `.pdf` entries                       |           |
| 32.2 | ZIP filename per card | Inspect entries                     | Each filename is `{student_ref}-{period}.pdf`   |           |
| 32.3 | Empty scope           | Bundle with zero matching cards     | 200 with empty ZIP OR 404 — document            |           |
| 32.4 | Large bundle          | Bundle 200 cards                    | Either streams OK or 413 PAYLOAD_TOO_LARGE      |           |
| 32.5 | ZIP corruption guard  | Fetch ZIP; parse                    | Valid ZIP (ends with EOCD signature `PK\05\06`) |           |

---

## 33. Public Verify Contract (`/v1/verify/:token`)

Public endpoint — no auth. Token IS the auth.

| #    | Test Name                                | Setup Steps                                           | Expected Result                                                                                            | Pass/Fail |
| ---- | ---------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------- |
| 33.1 | Valid token returns verification payload | Generate token for published card; GET /verify/:token | 200 with `{ student_name, class_name, period, grades_summary, school_name, logo_url, issued_at, ... }`     |           |
| 33.2 | No Authorization header required         | No header                                             | 200 (endpoint is public)                                                                                   |           |
| 33.3 | Invalid token → 404 generic              | GET /verify/garbage                                   | 404 `{ error: { code: "VERIFICATION_NOT_FOUND", message: "Token not found" } }` — no details               |           |
| 33.4 | Expired token                            | Seed token with expires_at in past; GET               | 410 GONE or 404 — document                                                                                 |           |
| 33.5 | Revoked token                            | Seed token with status=revoked                        | 404                                                                                                        |           |
| 33.6 | Token for draft (unpublished) card       | Publish; unpublish hack (revise back); GET            | 404 (token invalidated OR 410)                                                                             |           |
| 33.7 | Response excludes sensitive fields       | GET /verify with valid token                          | Response does NOT contain: internal ids, tenant_id, snapshot_payload_json full, user emails, phone numbers |           |
| 33.8 | Content-Type application/json            | GET                                                   | `Content-Type: application/json`                                                                           |           |

---

## 34. Tenant Isolation — Verification Token

Tokens must be scoped to their tenant or globally unique.

| #    | Test Name                            | Setup Steps                                                | Expected Result                                                  | Pass/Fail |
| ---- | ------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------- | --------- |
| 34.1 | Token from tenant A returns A's card | Generate token under A; GET /verify/:token                 | A's card data only                                               |           |
| 34.2 | No token collision across tenants    | Generate 1000 tokens across both tenants                   | No duplicates in global token column                             |           |
| 34.3 | Token does not reveal tenant         | GET /verify/:token response                                | No field named `tenant_id`; school_name is public, tenant opaque |           |
| 34.4 | Token rotate on revise               | Publish R1; generate token T1; revise → R2; GET /verify/T1 | T1 invalidated (404) OR still valid pointing at R1 — document    |           |
| 34.5 | Token must not contain tenant info   | Inspect token string                                       | Opaque (UUID/base64); no tenant_id substring                     |           |

---

## 35. Public Verify — Rate Limiting

| #    | Test Name                      | Setup Steps                                | Expected Result                                                                | Pass/Fail |
| ---- | ------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------ | --------- |
| 35.1 | Burst 100 req/s same IP        | Fire 100 requests from same IP in 1 second | At least some 429 TOO_MANY_REQUESTS; document exact limit (e.g. 30/min per IP) |           |
| 35.2 | Burst across different tokens  | 100 requests with different valid tokens   | Still rate-limited per IP                                                      |           |
| 35.3 | Rate limit resets after window | Burst → 429; wait 60s; retry               | 200                                                                            |           |

---

## 36. Webhook — Stripe-style Idempotency

Not applicable — Report Cards module has no payment/idempotency-key chains.

| #    | Test Name                                    | Setup Steps                           | Expected Result                        | Pass/Fail |
| ---- | -------------------------------------------- | ------------------------------------- | -------------------------------------- | --------- |
| 36.1 | Verify no Idempotency-Key header is consumed | Send POST with Idempotency-Key        | Header ignored; no special handling    |           |
| 36.2 | Publish is NOT idempotent by design          | Fire 2 × POST /:id/publish same actor | 1 × 200, 1 × 409 (state-machine guard) |           |

---

## 37. Encrypted / Signed Fields — Verification Token Integrity

| #    | Test Name                           | Setup Steps                                      | Expected Result                                 | Pass/Fail |
| ---- | ----------------------------------- | ------------------------------------------------ | ----------------------------------------------- | --------- |
| 37.1 | Tokens are cryptographically random | Generate 1000 tokens; compute entropy/duplicates | All unique; Shannon entropy > 4.5 bits/char     |           |
| 37.2 | No sequential patterns              | Sort tokens; diff adjacent                       | No monotone increment; token values look random |           |
| 37.3 | Token length minimum 32 chars       | Inspect                                          | len(token) ≥ 32                                 |           |

---

## 38. S3 Upload Contract — PDF Storage

| #    | Test Name                                       | Setup Steps                                              | Expected Result                                          | Pass/Fail |
| ---- | ----------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | --------- |
| 38.1 | Tenant-A PDF lands under `/tenants/{A}/...`     | Upload; inspect S3 key                                   | Key begins with `/tenants/{A_uuid}/report-cards/...`     |           |
| 38.2 | No tenant-A key can be read via tenant-B        | Attempt cross-tenant S3 key access via API               | 403 or 404; never serve A's bytes to B                   |           |
| 38.3 | Signed URL expiry                               | Generate signed URL; wait expiry; fetch                  | 403 Forbidden after expiry                               |           |
| 38.4 | Signed URL expiry within policy                 | Generate URL                                             | Expiry ≤ 15 minutes (tenant policy)                      |           |
| 38.5 | Upload respects content-type                    | Upload                                                   | S3 object has `Content-Type: application/pdf`            |           |
| 38.6 | Principal signature uploads under tenant prefix | POST /report-card-tenant-settings/principal-signature    | Key under `/tenants/{tenant_id}/signatures/principal...` |           |
| 38.7 | Logo uploads under tenant prefix                | (via tenants module) PDF branding reads from tenant logo | Key under tenant prefix                                  |           |
| 38.8 | No public ACL                                   | Inspect object ACL                                       | Private; no public-read                                  |           |

---

## 39. AI Draft Contract

`report-card-ai-draft.service.ts` generates draft comments.

| #    | Test Name                 | Setup Steps                  | Expected Result                                                | Pass/Fail |
| ---- | ------------------------- | ---------------------------- | -------------------------------------------------------------- | --------- |
| 39.1 | Request shape is correct  | Mock AI endpoint; call draft | Outbound request has `prompt`, `tenant_id`, `locale`, rubric   |           |
| 39.2 | Timeout > 10s returns 504 | Mock AI to hang 15s          | 504 GATEWAY_TIMEOUT OR returns partial/empty draft             |           |
| 39.3 | Fallback on failure       | Mock AI to throw 500         | Service returns empty draft + sets error flag; user toast-able |           |
| 39.4 | No PII leaked to AI       | Inspect outbound payload     | Student name omitted; only anonymised grade data               |           |
| 39.5 | Locale respected          | Call draft with locale=ar    | Outbound prompt specifies Arabic                               |           |

---

## 40. Audit Log Integrity

`AuditLogInterceptor` writes one row per mutation.

| #     | Test Name                                 | Setup Steps                 | Expected Result                                                                                     | Pass/Fail |
| ----- | ----------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------- | --------- |
| 40.1  | POST /generate writes audit               | Generate; inspect audit_log | 1 row: `tenant_id`, `user_id`, `action='report_cards.generate'`, `entity_type`, `entity_id` present |           |
| 40.2  | POST /publish writes audit                | Publish                     | Row with action=report_cards.publish                                                                |           |
| 40.3  | POST /revise writes audit                 | Revise                      | Row with action=report_cards.revise                                                                 |           |
| 40.4  | DELETE /:id writes audit                  | Delete                      | Row with action=report_cards.delete                                                                 |           |
| 40.5  | PATCH /templates/:id writes audit         | Update template             | Row with action=report_cards.template.update                                                        |           |
| 40.6  | POST /approvals/:id/approve writes audit  | Approve                     | Row with action=report_cards.approval.approve                                                       |           |
| 40.7  | POST /:id/deliver writes audit            | Deliver                     | Row with action=report_cards.deliver                                                                |           |
| 40.8  | POST /:id/acknowledge writes audit        | Acknowledge                 | Row with action=report_cards.acknowledge                                                            |           |
| 40.9  | GET requests do NOT write audit           | GET /:id                    | No audit row created                                                                                |           |
| 40.10 | Audit captures before/after diff on PATCH | Update template             | Row has `metadata.before` and `metadata.after` with diff                                            |           |

---

## 41. Soft Delete Semantics

Report Cards module does not use `deleted_at`. Status-based archival only.

| #    | Test Name                                   | Setup Steps                                    | Expected Result                                     | Pass/Fail |
| ---- | ------------------------------------------- | ---------------------------------------------- | --------------------------------------------------- | --------- |
| 41.1 | DELETE /report-cards/:id is physical delete | DELETE; SELECT \* FROM report_cards WHERE id=X | 0 rows — row physically removed                     |           |
| 41.2 | DELETE /templates/:id is physical delete    | Unused template; DELETE                        | 0 rows                                              |           |
| 41.3 | DELETE of in-use template refuses           | Template used by RC; DELETE                    | 409                                                 |           |
| 41.4 | Cascades on deletion                        | Delete RC; check deliveries, approvals, values | All cascaded                                        |           |
| 41.5 | No `deleted_at` column on any RC table      | Describe tables                                | Zero columns named `deleted_at` across 17 RC tables |           |

---

## 42. Backwards-Compat — No Breaking Schema Changes

Contract freeze: the JSON shape of every list/detail endpoint matches the canonical Zod schema exported from `@school/shared`.

| #     | Test Name                                                      | Setup Steps             | Expected Result                                             | Pass/Fail |
| ----- | -------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------- | --------- |
| 42.1  | GET /report-cards matches `listReportCardsSchema`              | Parse response via Zod  | `.safeParse()` returns `success: true`                      |           |
| 42.2  | GET /report-cards/:id matches `reportCardSchema`               | Parse                   | success                                                     |           |
| 42.3  | GET /templates matches `reportCardTemplateSchema`              | Parse                   | success                                                     |           |
| 42.4  | GET /generation-runs matches schema                            | Parse                   | success                                                     |           |
| 42.5  | GET /library matches `reportCardLibraryRowSchema`              | Parse each row          | All rows pass                                               |           |
| 42.6  | GET /classes/:id/matrix matches                                | Parse                   | success                                                     |           |
| 42.7  | GET /approval-configs matches                                  | Parse                   | success                                                     |           |
| 42.8  | GET /approvals/pending matches                                 | Parse                   | success                                                     |           |
| 42.9  | GET /verify/:token matches `verifyResponseSchema`              | Parse                   | success                                                     |           |
| 42.10 | Error responses match `{ error: { code, message, details? } }` | Trigger 400/403/404/409 | Every error payload validates against `errorEnvelopeSchema` |           |

---

## 43. Observations & Gaps Flagged

These are pre-populated items discovered during spec authoring. Each should be tracked as a separate bug/improvement ticket.

1. **Acknowledgment uses body `parent_id` instead of deriving from JWT.** `POST /v1/report-cards/:id/acknowledge` accepts `parent_id` as body data (see `report-cards-enhanced.controller.ts` line ~438). This is a security concern: a logged-in parent could pass another parent's id. The server must verify the passed `parent_id` matches the JWT subject OR that the JWT subject is a guardianship-linked delegate. Recommended fix: derive parent_id from JWT and reject any body override.

2. **No `DELETE /report-cards/:id/verification-token` endpoint.** Once issued, tokens appear to have no revocation surface in the controllers reviewed. If a parent forwards the QR link and the school wants to revoke it, there is no admin action. Recommended: add `DELETE /v1/report-cards/:id/verification-tokens/:tokenId`.

3. **Public verify rate-limit is not visible in controllers.** `ReportCardVerificationController.verify` has no explicit `@Throttle()` decorator or guard. Either global rate limiting applies (verify with `ThrottlerGuard` registration) or this endpoint is unprotected and vulnerable to enumeration. Tests 35.1-35.3 will surface the exact limit; if absent, must be added before launch.

4. **Cross-field refinement ambiguity in `ReportCommentWindow` schema.** `opens_at` < `closes_at` should be enforced via `.refine()`. Verify the schema in `@school/shared` has this refinement; otherwise a window could close before it opens.

5. **Snapshot immutability is claimed but must be tested empirically.** The schema does not natively enforce JSONB immutability. Test 17.2 is critical — if grade edits DO leak into the snapshot, every published report card in the system is structurally broken.

6. **Library scoping duplicates permission logic.** `ReportCardsController.findAll` recomputes `class_ids` scope using `commentWindowsService.getLandingScopeForActor`. If the scope ever diverges from how the library endpoint computes it, teachers will see inconsistent data. Recommended: extract one canonical `getActorReportCardScope()` helper.

7. **Bulk operations don't document transaction boundaries.** `bulkDelete`, `bulkPublish`, `bulkDeliver` — do they run in a single transaction (all-or-nothing) or per-card (partial success)? The response shape `{ deleted: N, skipped: N }` suggests per-card. Confirm via test 24.10 and document in OpenAPI.

8. **Delivery channels — no channel-level retry config.** Once a delivery fails, there is no visible retry-by-channel endpoint. Only `POST /:id/deliver` re-triggers the whole thing. For partial failures (SMS bouncing but email delivered), admins need a surgical retry surface.

9. **Template `is_default` uniqueness not clear.** One tenant, two templates both with `is_default=true` and same (content_scope, locale) — does DB enforce? Test 14.5 flags this.

10. **No tenant-level rate limit on bulk generation.** A malicious tenant admin could enqueue a 10,000-student generation run that saturates the worker pool, affecting other tenants. Worker concurrency is shared. Consider per-tenant queue priorities or concurrency caps.

---

## 44. Sign-Off

| Role                         | Name | Date | Signature |
| ---------------------------- | ---- | ---- | --------- |
| Engineering Lead             |      |      |           |
| QA Lead                      |      |      |           |
| Security Reviewer            |      |      |           |
| Product Owner (Report Cards) |      |      |           |

**Gate criteria before closing this spec as GREEN:**

- All rows in §3, §4 (RLS + cross-tenant) pass — zero tolerance for tenant leakage.
- All rows in §5, §6, §7 (contract) pass — response shapes match Zod schemas exactly.
- All rows in §8–§13 (state machines) pass — no invalid transitions permitted.
- All rows in §14, §15 (uniqueness + FK) pass — no duplicate rows or orphan cascades.
- All rows in §17 (snapshot immutability) pass — published data cannot mutate post-hoc.
- All rows in §18–§23 (chains) pass — side-effects arrive reliably, rollback cleanly on failure.
- All rows in §24–§27 (concurrency) pass — no state corruption under load.
- All rows in §28–§30 (authz) pass — no privilege escalation.
- All rows in §33, §34 (public verify) pass — no token leakage or tenant disclosure.
- All items in §43 (observations) either resolved in code OR documented with a mitigation and a ticket id.

The gate is ALL GREEN. A single FAIL or FLAKY blocks the release.

---

**End of integration spec.**
