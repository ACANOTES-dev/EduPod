# Assessment Module — Release Readiness Pack

**Generated:** 2026-04-12
**Commit:** 4e3c760d (spec-pack branch — update on re-issue)
**Module slug:** `assessment`
**Folder:** `E2E/3_learning/assessment/`

This pack replaces the previous three-file-per-role structure (`dashboard-e2e-spec.md`, `gradebook-e2e-spec.md`, `analytics-e2e-spec.md`) with a consolidated 5-leg release-readiness bundle produced by `/e2e-full`.

---

## Spec pack

| Leg                 | Spec document                                                                              | Rows (approx) | Sections | Date       |
| ------------------- | ------------------------------------------------------------------------------------------ | ------------- | -------- | ---------- |
| /E2E (admin)        | [admin_view/assessment-e2e-spec.md](./admin_view/assessment-e2e-spec.md)                   | 460 rows      | 78       | 2026-04-12 |
| /E2E (teacher)      | [teacher_view/assessment-e2e-spec.md](./teacher_view/assessment-e2e-spec.md)               | 240 rows      | 51       | 2026-04-12 |
| /E2E (parent)       | [parent_view/assessment-e2e-spec.md](./parent_view/assessment-e2e-spec.md)                 | 95 rows       | 24       | 2026-04-12 |
| /E2E (student)      | Not applicable — no student-facing gradebook / assessment UI                               | 0             | 0        | —          |
| /e2e-integration    | [integration/assessment-integration-spec.md](./integration/assessment-integration-spec.md) | 210 rows      | 28       | 2026-04-12 |
| /e2e-worker-test    | [worker/assessment-worker-spec.md](./worker/assessment-worker-spec.md)                     | 120 rows      | 23       | 2026-04-12 |
| /e2e-perf           | [perf/assessment-perf-spec.md](./perf/assessment-perf-spec.md)                             | 120 rows      | 21       | 2026-04-12 |
| /e2e-security-audit | [security/assessment-security-spec.md](./security/assessment-security-spec.md)             | 180 rows      | 28       | 2026-04-12 |

**Total rows (approximate):** ~1 425 across the pack. **Total lines:** ~4 195.

> The **student** leg is deliberately absent. Students currently have no gradebook / assessment surface in the product (grade access is parent-mediated). A `student_view/` folder is **not** created; this table row records the conscious exclusion.

---

## Execution order

Run the specs in this order to achieve full confidence:

1. **UI behavioural** — admin first (largest surface), then teacher, then parent. Each row maps to a Playwright / manual-tester step with a Pass/Fail column.
2. **Integration** — RLS matrix, API contract matrix, invariants, state-machine transitions, concurrency. Execution surface: Jest + `supertest` against a live Postgres + Redis + MinIO stack.
3. **Worker** — every BullMQ job, cron scheduler, dead-letter behaviour, async chain. Execution: Jest with real Redis; spin up `WorkerModule` per test.
4. **Perf** — k6 / artillery scripts for API budgets, Lighthouse for frontend budgets, build-output inspection for bundle budgets.
5. **Security** — manual + tool-assisted audit following the sequence in `security/assessment-security-spec.md` §§2–27.

Each leg can be executed independently, but the full pack is what achieves release-readiness.

---

## Coverage summary

- **UI surface:** 19 admin pages + 14 teacher pages + ~5 parent pages = 38 UI surfaces.
- **API endpoints:** 100+ across 14 controllers (see integration spec §4 and per-role endpoint maps).
- **Tenant-scoped tables:** 33 (all covered in integration spec §2 RLS matrix).
- **BullMQ jobs:** 5 processors on 1 queue (all covered in worker spec).
- **Cron schedules:** 2 (`gradebook:detect-risks`, `report-cards:auto-generate`).
- **OWASP categories covered:** 10 / 10.
- **Permission matrix cells:** ~ 200 (integration spec §4 + security spec §13).
- **Data invariants declared:** 20 admin + 10 teacher + 6 parent + 16 integration-global + 7 worker-post-completion = 59 distinct invariant queries.
- **State machines documented:** Assessment status (7 states), Config approval status (4 states), Unlock request status (3 states), Report card status (3 states). All with valid + invalid transitions.

---

## Known limitations of the pack

Even the full pack does not cover:

- **Long-tail Zod validation combinatorics** beyond the documented boundary cases — combinatorically explosive; sampled not exhaustive.
- **Real external-service behaviour** — OpenAI API outages, email provider delays, S3 regional failover are mocked at the boundary rather than live-tested.
- **Accessibility audits beyond structural checks** — run a dedicated a11y tool (`axe-core`, Lighthouse a11y) as a sibling workflow.
- **Visual regression / pixel diff** — run a dedicated visual tool (Percy, Chromatic, Playwright screenshots with visual diff).
- **Browser / device matrix beyond desktop Chrome + 375px mobile emulation** — defer to a manual QA cycle on Safari, Firefox, tablets, older Android.
- **Load-testing at production-scale peak (100k+ concurrent users)** — the perf spec targets realistic steady-state, not disaster-scenario peak.
- **Arabic translation completeness audit** — spot-checked, not exhaustively verified key-by-key in `ar.json`.
- **PDF template customisation regressions for existing tenants' custom uploads** — custom templates are tenant data; only the default pipeline is tested.

These gaps are acceptable for the 99.99% confidence target. 100% confidence does not exist.

---

## Observations & findings from the walkthrough

Findings spotted while writing the pack — to triage before release:

**From /E2E (admin + teacher + parent):**

- 12 observations recorded. Highlights:
  - Hand-rolled forms (Categories, Weights, Standards, New Assessment) still use `useState` rather than `react-hook-form + zodResolver`; tracked as "HR-025 migration". Violates project rule for new forms.
  - Benign `/teaching-allocations` 404 for admin pollutes DevTools Network log.
  - `gradebook.manage_own_config` vs `gradebook.manage` boundary not uniformly enforced — potential teacher access friction on category/rubric/standard POSTs.
  - Ambiguity in approvals page query param: `?tab=unlocks` vs `?tab=unlock-requests` across the codebase.
  - No throttle on "Recompute grades" — admin can hammer Postgres.
  - Parent verification token flow partially unwired — UI-side acknowledgement endpoint not in backend inventory.

**From /e2e-integration:**

- 9 gaps spotted. Highlights:
  - Self-approval guard (`submitted_by !== reviewed_by`) needs explicit verification in `UnlockRequestService.review` and `*CategoriesService.review`.
  - `FORCE ROW LEVEL SECURITY` on every table — audit the 33-table list explicitly (not just `ENABLE ROW LEVEL SECURITY`).
  - Curve stacking behaviour undocumented.
  - Bulk import idempotency under re-upload of same file — verify behaviour.
  - Cross-tenant mapping integrity (`assessment_standard_mappings`) — could rows reference entities in a different tenant?

**From /e2e-worker-test:**

- 10 gaps. Highlights:
  - `MASS_REPORT_CARD_PDF_JOB` has no checkpointing — long job that crashes at 90% starts from zero.
  - `BulkImportProcessor` idempotency depends on deterministic dedup key — document.
  - Cron drift after deployment delay — monitor `last_run_at`.
  - Dead-letter replay UI not exposed (no Bull Board).
  - Lock extension on long renders — some processors may not call `extendLock`.

**From /e2e-perf:**

- 10 coverage holes + 10 concerns. Highlights:
  - Heavy analytics endpoints (`teacher-consistency`, `benchmark`) may need materialised views.
  - AI endpoints synchronous to HTTP — need to move to queue.
  - Compute period grades > 3s under real scale — candidate for async with callback.
  - Bulk import 50k rows near worker lock expiry — chunk the job.
  - 10 endpoints have no budget assigned (competency-scales, generation-runs, library, tenant-settings, comment-windows, teacher-requests, progress summaries, etc.).

**From /e2e-security-audit — severity tally (expected):**

- P0 (critical): 0 (subject to verification — the NL query SQL sandbox and `FORCE RLS` on every table are potential P0 flags if missing).
- P1 (high): 0–2 (self-approval guard, `manage_own_config` authorization gap, PDF template SSRF).
- P2 (medium): ≤ 3 (CSV injection on xlsx export, bulk import rate limit, audit log PII).
- P3 (informational): 3–5 (verification token entropy, RLS metadata audit, OpenAI rate limit).

Full lists: see the Observations section at the end of each spec.

---

## Tester assignment

This pack is designed to be executed by:

- **A dedicated QC engineer** working through the `/E2E` role specs (`admin_view/`, `teacher_view/`, `parent_view/`) top-to-bottom, marking Pass/Fail per row, ideally one role per day.
- **A headless Playwright agent** for the `/E2E` legs once the manual pass is green — UI behaviour is scriptable end-to-end.
- **A Jest + `supertest` harness** for `/e2e-integration` and `/e2e-worker-test` rows (each row maps to a test case).
- **A `k6` / `artillery` / Lighthouse script** for `/e2e-perf` (each row is a measurement with a budget assertion).
- **An internal security engineer OR paid security consultant** for `/e2e-security-audit`. Humans still find more than tools on the adversarial axis.

Once each leg is running in CI, the pack becomes a regression harness — any new commit that breaks a row fails the pipeline.

---

## Sign-off

| Leg                 | Reviewer | Date | Pass | Fail | Notes                         |
| ------------------- | -------- | ---- | ---- | ---- | ----------------------------- |
| /E2E (admin)        |          |      |      |      |                               |
| /E2E (teacher)      |          |      |      |      |                               |
| /E2E (parent)       |          |      |      |      |                               |
| /E2E (student)      | —        | —    | n/a  | n/a  | Not applicable; no student UI |
| /e2e-integration    |          |      |      |      |                               |
| /e2e-worker-test    |          |      |      |      |                               |
| /e2e-perf           |          |      |      |      |                               |
| /e2e-security-audit |          |      |      |      |                               |

**Module release-ready when all seven applicable rows are signed off at Pass with zero P0 / P1 findings outstanding.**

---

## Cleanup completed

- [x] Deleted superseded per-page specs (`admin_view/dashboard-e2e-spec.md`, `admin_view/gradebook-e2e-spec.md`, `admin_view/analytics-e2e-spec.md`, `teacher_view/dashboard-e2e-spec.md`, `teacher_view/gradebook-e2e-spec.md`, `teacher_view/analytics-e2e-spec.md`). Replaced by the consolidated per-role specs in this pack.
- [x] Updated `E2E/COVERAGE-TRACKER.md` with the new rows (Completed Specifications table + Assessment module release readiness section).
- [ ] Link this RELEASE-READINESS.md from the module governance README if it exists.

---
