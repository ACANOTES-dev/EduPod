# People — Release Readiness Pack

**Generated:** 2026-04-12  
**Commit:** `fe6826c0`  
**Module slug:** `people`  
**Supersedes:** `people-e2e-spec.md` (the single-file spec at the folder root, kept for historical reference).

---

## Spec pack

| Leg                 | Spec document                                                                      | Lines     | Sections                   | Rows      | Date       |
| ------------------- | ---------------------------------------------------------------------------------- | --------- | -------------------------- | --------- | ---------- |
| /E2E (admin)        | [admin_view/people-e2e-spec.md](./admin_view/people-e2e-spec.md)                   | 1,611     | 38 (167 incl. subsections) | 521       | 2026-04-12 |
| /E2E (teacher)      | [teacher_view/people-e2e-spec.md](./teacher_view/people-e2e-spec.md)               | 394       | 18 (25 incl. subsections)  | 99        | 2026-04-12 |
| /e2e-integration    | [integration/people-integration-spec.md](./integration/people-integration-spec.md) | 815       | 16 (78 incl. subsections)  | 343       | 2026-04-12 |
| /e2e-worker-test    | [worker/people-worker-spec.md](./worker/people-worker-spec.md)                     | 431       | 14 (49 incl. subsections)  | 95        | 2026-04-12 |
| /e2e-perf           | [perf/people-perf-spec.md](./perf/people-perf-spec.md)                             | 549       | 15 (53 incl. subsections)  | 160       | 2026-04-12 |
| /e2e-security-audit | [security/people-security-spec.md](./security/people-security-spec.md)             | 550       | 14 (30 incl. subsections)  | 197       | 2026-04-12 |
| **TOTAL**           |                                                                                    | **4,350** | **115 / 402**              | **1,415** |            |

_Parent and student /E2E specs are intentionally NOT in this pack — the People module has no parent-facing or student-facing UI. Parent access to their own child's record lives under `/parent/*` and is covered by the `5_operations/communications/` pack; student access has no touch-point with People at all. Negative assertions for these roles are in the security spec's permission matrix (§3)._

---

## Execution order

Run the specs in this order to achieve full confidence:

1. **/E2E (admin_view)** — establishes the UI surface (14 unique pages + 10 sub-flows), the endpoint map, and the data-invariant baseline.
2. **/E2E (teacher_view)** — validates the scoped variant + 8 negative assertions per the teacher's restricted visibility.
3. **/e2e-integration** — exercises the 42-cell RLS matrix, ~200 API contract rows, concurrency, transaction boundaries, and encrypted-field access control.
4. **/e2e-worker-test** — verifies the two `search-sync` queue jobs (`search:index-entity`, `search:full-reindex`) and their retry/idempotency/isolation behaviour. Flags the producer-wiring gap (W1) for follow-up.
5. **/e2e-perf** — measures p50/p95/p99 per endpoint against stress-volume fixtures (10k students), page bundle budgets, N+1 detection, cold/warm start.
6. **/e2e-security-audit** — runs the adversarial pass: OWASP 10/10, 429-cell permission matrix, ~400-row input fuzz, authentication hardening, encrypted-field access control, business-logic abuse.

Each leg can be executed independently, but the full pack is what achieves release-readiness.

---

## Coverage summary

- **UI surface**: 14 unique pages (students: 5, staff: 4, households: 4, parents: 1) × 2 roles (admin, teacher) = 28 role-cells, plus 10 sub-flows (merge, split, add-student dialog, guardian CRUD, emergency-contact CRUD).
- **API endpoints**: 39 — see Backend Endpoint Map in `admin_view/people-e2e-spec.md` §34.
- **Tenant-scoped tables**: 7 (`students`, `households`, `household_emergency_contacts`, `household_parents`, `parents`, `staff_profiles`, `student_parents`). All covered by the RLS matrix (§2 of the integration spec).
- **BullMQ jobs**: 2 on the `search-sync` queue (`search:index-entity`, `search:full-reindex`). Covered by the worker spec.
- **Cron schedules owned by People**: 0 (the module does not register a cron scheduler).
- **OWASP categories covered**: 10 / 10 in the security spec, each with either concrete attack scenarios or explicit N/A justifications.
- **Permission matrix cells**: 429 (`39 endpoints × 11 roles`).
- **State machines**: 2 (student status with enforced transitions; household status without — flagged as design gap S-A4-1).
- **Encrypted columns**: 2 (`staff_profiles.bank_account_number_encrypted`, `staff_profiles.bank_iban_encrypted`). Full round-trip + access-control coverage in integration §11 and security §7.
- **Sensitive-data audit classifications**: 3 (`special_category` for student medical reads + allergy report; `financial` for bank-detail reads; `full_export` for student export-pack).

---

## Known limitations of the pack

Even the full pack does not cover:

- **Long-tail Zod validation combinatorics beyond the documented boundary cases** — the injection fuzz samples representative payloads × fields, not the full cross-product.
- **Real Meilisearch behaviour** — the search integration is currently stubbed at the processor level (per the `// TODO: Push document to Meilisearch` comments). When Meilisearch is wired, the worker spec gains an integration layer that verifies documents actually land in the remote index.
- **Accessibility audits beyond structural checks** — run a dedicated a11y tool (axe-core, Lighthouse a11y) as a sibling workflow.
- **Visual regression / pixel diff** — run a dedicated visual tool (Percy, Chromatic, Playwright screenshots with visual diff).
- **Browser / device matrix beyond desktop Chrome + 375px mobile** — defer to a manual QA cycle on Safari, Firefox, iPad, real Android / iOS devices.
- **Load-testing at production-scale volume (100k+ concurrent users)** — the perf spec targets realistic volume (100 concurrent users × 500 req/s burst), not disaster-scenario peak.
- **GDPR-specific audits** (DSAR completeness, right-to-be-forgotten across the full entity graph) — those live in a dedicated governance spec under `docs/governance/`.
- **Live external-service behaviour** — Stripe, email providers, and the encryption KMS are mocked at the boundary here; real-service availability is a separate operational concern.

These gaps are acceptable for the 99.99% confidence target. 100% confidence does not exist.

---

## Observations & findings from the walkthrough

From /E2E (admin) — 18 observations (A–R): 0 P0, 5 P2, 13 P3. Highlights:

- **A** (P3) — Students list search does not match Arabic name fields.
- **C** (P2) — Students list API failure is silent; no toast.
- **D** (P3) — Re-activating a withdrawn student leaves `exit_date` set and dropped enrolments unrestored.
- **F** (P2) — Bank-details tab renders for all admin-tier users but only owner/principal hold `payroll.view_bank_details`; admin + accounting get the tab and then 403 on load.
- **G** (P3) — Staff edit page hides bank fields; users cannot update bank details after create.
- **H** (P2) — Setting `employment_status=inactive` does NOT revoke the user's tenant_membership.
- **M** (P2) — Changing a student's household does not re-derive `student_number`; it remains in the old-household-prefix format.

From /E2E (teacher) — 8 observations (T1–T8): 0 P0, 6 P2, 2 P3. Highlights:

- **T1/T2** (P2) — Teachers see (and can export) the full tenant-wide student list; no class scope.
- **T4/T5** (P2) — Teachers can read every student's medical data + allergy report, not just their assigned classes.
- **T6** (P2) — Households endpoints permit `students.view` (teacher tier); the sub-strip hides the link but the routes still respond.

From /e2e-integration — 6 findings (INT-1 to INT-6):

- **INT-1** (P2) — Invalid `sort` query param on `/v1/students` under-specified; may 500 via Prisma.
- **INT-2** (P3) — Redis cache key `preview:student:{id}` lacks tenant prefix.
- **INT-3** (P2) — `POST /households/split` does not pre-validate `parent_ids`; FK failures mid-tx.
- **INT-4 / INT-5** (P2) — Household status has no state-machine enforcement; archived → active is permitted.
- **INT-6** (P2) — Merge leaves outstanding invoices on the archived source household.

From /e2e-worker-test — 3 findings:

- **W1** (P1) — No producer appears to enqueue `search:index-entity` jobs on People mutations. Search integration designed but not wired end-to-end.
- **W2** (P3) — Producers (when wired) should set a deterministic `jobId` to dedup rapid successive updates.
- **W3** (P3) — Audit whether any cross-module cron mutates People tables directly.

From /e2e-perf — 0 coverage holes identified; every documented endpoint has a budget. Scale fixtures (10k students) need a dedicated seeder.

From /e2e-security-audit — 11 findings. Severity tally:

| Severity | Count                                                                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| P0       | 0                                                                                                                                |
| P1       | 4 (S-A2-1 staff password rotation; S-A8-1 audit-log DB grants; S-7-1 shared encryption key; S-13-1 medical-data consent leakage) |
| P2       | 4 (S-A4-1 household state machine; S-A9-1 cross-tenant attempt logging; S-FZ-1 null bytes in exports; S-9-1 list PII exposure)   |
| P3       | 3 (S-FZ-2 homoglyphs; S-13-2 empty split; S-13-3 parent_links max length)                                                        |

**Zero P0 findings.** The 4 P1 items warrant resolution or explicit acceptance before any new tenant is onboarded; the P2/P3 items should feed the next iteration's fix sweep.

Full list: see the observations sections at the end of each spec.

---

## Tester assignment

This pack is designed to be executed by:

- **A dedicated QC engineer** working through each spec top-to-bottom, marking Pass/Fail per row. Estimated time: admin_view ≈ 1.5 days, teacher_view ≈ 0.5 day, integration ≈ 1 day (mostly automated), worker ≈ 0.5 day, perf ≈ 1 day (with seeder prep), security ≈ 1.5 days (adversarial depth). Total ≈ 5 engineer-days for a first-time run; re-runs after fixes should take ≈ 1 day.
- **A headless Playwright agent** for the /E2E legs (UI behaviour is scriptable end-to-end). Admin spec ~521 rows, teacher ~99 — every row converts to a Playwright assertion.
- **A jest / supertest harness** for /e2e-integration and /e2e-worker-test rows (each row maps to a test case). The 42-cell RLS matrix and the 429-cell permission matrix are table-test ready.
- **A k6 / autocannon / Lighthouse script** for /e2e-perf (each row is a measurement).
- **A paid security consultant OR an internal security engineer** for /e2e-security-audit (humans still find more than tools on the adversarial axis).

---

## Sign-off

| Leg                 | Reviewer | Date | Pass | Fail | Notes |
| ------------------- | -------- | ---- | ---- | ---- | ----- |
| /E2E (admin)        |          |      |      |      |       |
| /E2E (teacher)      |          |      |      |      |       |
| /e2e-integration    |          |      |      |      |       |
| /e2e-worker-test    |          |      |      |      |       |
| /e2e-perf           |          |      |      |      |       |
| /e2e-security-audit |          |      |      |      |       |

**Module release-ready when all 6 rows are signed off at Pass with zero P0 / P1 findings outstanding.**

_P2 findings may proceed to release with documented tenant communication; P3 findings feed the next iteration backlog._

---

## Pack provenance

- Generated by `/e2e-full` command on `2026-04-12` at commit `fe6826c0` (branch `main`).
- Source legs: `.claude/commands/E2E.md`, `.claude/commands/e2e-integration.md`, `.claude/commands/e2e-worker-test.md`, `.claude/commands/e2e-perf.md`, `.claude/commands/e2e-security-audit.md`.
- Fixture reference: Nurul Huda School (NHQS) at `https://nhqs.edupod.app`, with a second test tenant `acme-test` to be provisioned per integration spec §1.1.

---

**End of Release-Readiness Pack.**
