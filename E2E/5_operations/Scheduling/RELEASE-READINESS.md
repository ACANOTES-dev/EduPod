# Scheduling — Release Readiness Pack

**Generated:** 2026-04-17
**Commit:** 24df795c
**Module slug:** scheduling
**Module folder:** `E2E/5_operations/Scheduling/`

---

## Spec pack

| Leg                 | Spec document                                                                            |      Rows | Sections | Date       |
| ------------------- | ---------------------------------------------------------------------------------------- | --------: | -------: | ---------- |
| /E2E (admin)        | [admin_view/scheduling-e2e-spec.md](admin_view/scheduling-e2e-spec.md)                   |       653 |      124 | 2026-04-17 |
| /E2E (teacher)      | [teacher_view/scheduling-e2e-spec.md](teacher_view/scheduling-e2e-spec.md)               |       355 |       20 | 2026-04-17 |
| /E2E (student)      | [student_view/scheduling-e2e-spec.md](student_view/scheduling-e2e-spec.md)               |       307 |       19 | 2026-04-17 |
| /E2E (parent)       | [parent_view/scheduling-e2e-spec.md](parent_view/scheduling-e2e-spec.md)                 |       238 |       21 | 2026-04-17 |
| /e2e-integration    | [integration/scheduling-integration-spec.md](integration/scheduling-integration-spec.md) |       453 |       13 | 2026-04-17 |
| /e2e-worker-test    | [worker/scheduling-worker-spec.md](worker/scheduling-worker-spec.md)                     |        63 |       16 | 2026-04-17 |
| /e2e-perf           | [perf/scheduling-perf-spec.md](perf/scheduling-perf-spec.md)                             |       377 |       16 | 2026-04-17 |
| /e2e-security-audit | [security/scheduling-security-spec.md](security/scheduling-security-spec.md)             |       586 |       24 | 2026-04-17 |
| **Total**           |                                                                                          | **3,032** |  **253** |            |

Pack line totals (markdown lines per spec): admin 1806 · teacher 1007 · student 731 · parent 593 · integration 1004 · worker 645 · perf 834 · security 1090 = **7,710 lines**.

---

## Execution order

Run the specs in this order to achieve full confidence:

1. **UI behavioural** — admin first (largest surface), then teacher → student → parent. Each role spec exercises permission-aware navigation, RTL/i18n, and mobile (375px).
2. **Integration** — RLS hostile-pair, contract matrix, webhook (solver sidecar), data invariants, concurrency.
3. **Worker** — queue + cron + processor lifecycle, stale-reaper races, tenant isolation.
4. **Perf** — endpoint budgets, solver scale matrix, contention, page bundles, N+1 queries.
5. **Security** — OWASP Top 10 (10/10), permission matrix exhaustive, injection fuzz, business-logic abuse, auth hardening.

Each leg can be executed independently, but the full pack is what achieves release-readiness.

---

## Coverage summary

- **UI surface:** 39 frontend pages × 4 roles = ~156 cells (admin gets all 39, teacher 6, student 1, parent 1; remainder are negative-assertion cells)
- **API endpoints:** ~80 endpoints across 14 controllers (TeacherCompetencies, SubstituteCompetencies, BreakGroups, CurriculumRequirements, RoomClosures, TeacherSchedulingConfig, SchedulerOrchestration, SchedulerValidation, SchedulingEnhanced, SchedulingPublic, Schedules, Timetables, SchedulingRuns, SchedulingDashboard)
- **Tenant-scoped tables:** 22 (all covered in RLS matrix in integration spec §5)
- **BullMQ jobs:** 2 (`scheduling:solve-v2`, `scheduling:reap-stale-runs`)
- **Cron schedules:** 1 (`cron:scheduling:reap-stale-runs`, every minute, cross-tenant)
- **Permissions:** 15 (all in admin permission matrix; teacher/student/parent matrices invert these as denials)
- **OWASP categories covered:** **10/10**
- **Permission matrix cells (security spec):** ~840 (98 row-IDs × 10 roles)
- **Injection-fuzz rows (security spec):** 88

---

## Known limitations of the pack

Even the full pack does not cover:

- Long-tail Zod validation combinatorics beyond the documented boundary cases (combinatorically explosive; sampled, not exhaustive).
- Real external-service behaviour (CP-SAT/OR-Tools sidecar regressions, network partitioning) — mocked at the boundary, not live-tested at production scale.
- Accessibility audits beyond structural checks — run a dedicated a11y tool (axe-core, Lighthouse a11y) as a sibling workflow.
- Visual regression / pixel diff — run a dedicated visual tool (Percy, Chromatic, Playwright screenshots with visual diff).
- Browser / device matrix beyond desktop Chrome + 375px mobile — defer to a manual QA cycle on Safari, Firefox, edge devices.
- Load-testing at production-scale volume (100k+ concurrent users) — `/e2e-perf` targets realistic volume, not disaster-scenario peak.
- Solver determinism across hardware profiles — solver_seed pinned, but result_json may differ subtly across CPU architectures.

These gaps are acceptable for the 99.99% confidence target. 100% confidence does not exist.

---

## Observations & findings from the walkthrough

| Spec                   | Findings | Highlights                                                                                                                                                                                                                                                                             |
| ---------------------- | -------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| /E2E (admin)           |       15 | OBS-001 mobile time input <16px on /scheduling/availability; OBS-006 cancel-while-running cooperatively un-interruptible; OBS-011 stale-reaper writes ambiguous failure_reason                                                                                                         |
| /E2E (teacher)         |        3 | `/scheduling/leave-requests` is misleadingly named (admin queue, not teacher self-service); no dedicated `/scheduling/offers` page; mobile `text-xs` on availability time input                                                                                                        |
| /E2E (student)         |        3 | Student-route `my-timetable` may share a component with teacher route and 403 against `/v1/scheduling/timetable/my`; substitution-board has no permission gate (potential leak); `/scheduling` hub page renders admin tiles to all authenticated users                                 |
| /E2E (parent)          |        3 | No parent-facing `/parent/timetable` route in inventory (UI gap?); permission expression `students.view OR parent (linked child)` could be bypassed by misconfigured roles; no parent `.ics` calendar subscription path                                                                |
| /e2e-integration       |        3 | Two parallel run controllers (`/v1/scheduling/runs/*` and `/v1/scheduling-runs/*`) — pin canonical; stale-reaper behavior on suspended tenants undefined; public `.ics` revocation contract not specified                                                                              |
| /e2e-worker-test       |        3 | Stalled-but-running self-heal gap of 60s+max_solver_duration; no automatic DLQ/replay tooling; tenant_id/run_id mismatch is silent (no explicit guard log)                                                                                                                             |
| /e2e-perf              |        3 | `GET /v1/scheduling-runs` returns `result_json` JSONB inline — list endpoint will degrade at scale; stale-reaper × lockDuration × HTTP timeout is a fragile triangle at XL tier; substitution-board kiosk has no rate limit and polls every 30s                                        |
| /e2e-security-audit    |   3 (P0) | Calendar tokens are unbounded bearer credentials (no expiry, no rotation, no audit); `apply` and `POST /v1/scheduling-runs` are not MFA-gated despite high blast radius; `/v1/scheduling/substitution-board` documented as "no auth check" — anonymous access leaks absent-staff names |
| **Total observations** |   **36** | (security findings tagged P0 by drafter; severity to be confirmed by auditor)                                                                                                                                                                                                          |

**Cross-cutting themes across legs:**

1. **Substitution board is consistently flagged** in 3 of 8 specs (student, perf, security) — the public/no-auth design is a recurring concern. Resolving this should be a launch-blocker.
2. **`apply` is consistently a high-blast-radius mutation** flagged for MFA gating, idempotency-on-replay, and conditional-update race protection.
3. **Stale-reaper invariants** appear in worker, integration, perf — three different angles (tenant suspension, lockDuration triangle, ambiguous failure_reason). Worth one consolidated runbook entry.
4. **Two run-controllers (`/v1/scheduling/runs/*` vs `/v1/scheduling-runs/*`)** — flagged in integration as a pin-the-canonical concern. Carries through to perf budgets and security permission matrix.

---

## Tester assignment

This pack is designed to be executed by:

- **A dedicated QC engineer** working through each spec top-to-bottom, marking Pass/Fail per row, ideally one spec per day.
- **A headless Playwright agent** for the /E2E legs (UI behaviour is scriptable end-to-end).
- **A jest / supertest harness** for /e2e-integration and /e2e-worker-test rows (each row maps to a test case).
- **A k6 / artillery / Lighthouse script** for /e2e-perf (each row is a measurement).
- **A paid security consultant OR an internal security engineer** for /e2e-security-audit (humans still find more than tools on the adversarial axis).

---

## Sign-off

| Leg                 | Reviewer | Date | Pass | Fail | Notes |
| ------------------- | -------- | ---- | ---- | ---- | ----- |
| /E2E (admin)        |          |      |      |      |       |
| /E2E (teacher)      |          |      |      |      |       |
| /E2E (student)      |          |      |      |      |       |
| /E2E (parent)       |          |      |      |      |       |
| /e2e-integration    |          |      |      |      |       |
| /e2e-worker-test    |          |      |      |      |       |
| /e2e-perf           |          |      |      |      |       |
| /e2e-security-audit |          |      |      |      |       |

**Module release-ready when all eight rows are signed off at Pass with zero P0 / P1 findings outstanding.**

---

## Companion artefacts in this folder

These pre-existing artefacts complement the spec pack and should be reviewed alongside it:

- `BUG-LOG.md` — historical bug log for the scheduling module
- `PLAYWRIGHT-WALKTHROUGH-RESULTS.md` — prior live walkthrough notes
- `SERVER-LOCK.md` — environment lock notes for stress testing
- `STRESS-TEST-PLAN.md` — load testing plan
- `scripts/` — helper scripts used during prior walkthroughs
- `.inventory-backend.md` · `.inventory-frontend.md` · `.inventory-worker.md` — module surface inventories generated for this pack (consumed by every spec)

The PWC (Playwright Walkthrough + Consolidation) follow-up is being executed against the NHQS tenant in the same session that produced this pack and will append its results to the `PLAYWRIGHT-WALKTHROUGH-RESULTS.md` file (or a sibling timestamped file) in this folder.
