# Attendance Module — Release Readiness Pack

**Generated:** 2026-04-18
**Commit:** 0f93ad98
**Module slug:** attendance

---

## Spec pack

| Leg                 | Spec document                                                                              | Lines     | Sections | Rows      |
| ------------------- | ------------------------------------------------------------------------------------------ | --------- | -------- | --------- |
| /E2E (admin)        | [admin_view/attendance-e2e-spec.md](./admin_view/attendance-e2e-spec.md)                   | 796       | 46       | 325       |
| /E2E (teacher)      | [teacher_view/attendance-e2e-spec.md](./teacher_view/attendance-e2e-spec.md)               | 539       | 37       | 188       |
| /E2E (officer)      | [officer_view/attendance-e2e-spec.md](./officer_view/attendance-e2e-spec.md)               | 417       | 30       | 134       |
| /E2E (parent)       | [parent_view/attendance-e2e-spec.md](./parent_view/attendance-e2e-spec.md)                 | 347       | 24       | 112       |
| /e2e-integration    | [integration/attendance-integration-spec.md](./integration/attendance-integration-spec.md) | 559       | 30       | 252       |
| /e2e-worker-test    | [worker/attendance-worker-spec.md](./worker/attendance-worker-spec.md)                     | 429       | 26       | 155       |
| /e2e-perf           | [perf/attendance-perf-spec.md](./perf/attendance-perf-spec.md)                             | 394       | 26       | 127       |
| /e2e-security-audit | [security/attendance-security-spec.md](./security/attendance-security-spec.md)             | 523       | 29       | 206       |
| **TOTAL**           | 8 specs                                                                                    | **4 004** | **248**  | **1 499** |

**Student view:** intentionally absent — students have zero attendance access by design. Asserted as a 23-endpoint permission-matrix row in `security/` §13 rather than a standalone spec.

---

## Execution order

Run the specs in this order for full confidence:

1. **UI behavioural** — admin → teacher (deepest scrutiny) → officer → parent.
2. **Integration** — RLS + cross-tenant + contracts + state machines + teacher-scope + concurrency.
3. **Worker** — dispatcher + session-generation + auto-lock + patterns + pending + crons + chains.
4. **Perf** — endpoint budgets + scale matrices + worker throughput + bundle + Lighthouse.
5. **Security** — OWASP 10/10 + IDOR + injection + AI-prompt + file-safety + student-zero-access.

Each leg can be run independently, but the full pack is what achieves release readiness.

---

## Coverage summary

- **UI surface:** 6 pages (`/attendance`, `/attendance/mark/[sessionId]`, `/attendance/officer`, `/attendance/exceptions`, `/attendance/scan`, `/attendance/upload`) × 4 roles (admin, teacher, officer, parent) + student zero-access = **24 audited role × page cells** plus the 23-row student zero-access matrix.
- **API endpoints:** 23 (all enumerated in §43 of admin spec and §4 of integration spec).
- **Tenant-scoped tables:** 4 (`attendance_sessions`, `attendance_records`, `daily_attendance_summaries`, `attendance_pattern_alerts`) — all covered in the RLS matrix.
- **BullMQ queue:** 1 (`attendance`) + side-effect emissions to `notifications` and `early-warning`.
- **BullMQ processors:** 6 (1 dispatcher + 5 per-tenant + 1 cron-dispatch fan-out shared processor).
- **BullMQ job names:** 8 (`attendance:generate-sessions`, `attendance:auto-lock`, `attendance:detect-patterns`, `attendance:detect-pending`, `attendance:cron-dispatch-generate`, `attendance:cron-dispatch-lock`, `attendance:cron-dispatch-patterns`, `attendance:cron-dispatch-pending`).
- **Cron schedules:** 4 (generate 04:30 UTC, patterns 02:30 UTC, pending 18:00 UTC, lock 23:00 UTC).
- **OWASP categories covered:** 10/10.
- **Permission matrix cells:** 23 endpoints × 12 roles = **276 cells** (integration §4 is the authoritative ledger; security §14 audits it adversarially).
- **State machines documented:** 3 (sessions: open→submitted→locked | open→cancelled; records: create/update on open + amend on submitted/locked; alerts: active→acknowledged→resolved).

---

## Known limitations of the pack

Even the full pack does not cover:

- **Long-tail Zod validation combinatorics** beyond the documented boundary cases (combinatorially explosive; sampled not exhaustive).
- **Real external-service behaviour** (Resend API outages, AI vendor backpressure) — mocked at the boundary, not live-tested. Vendor-side SLA tracked separately.
- **Accessibility audits beyond structural checks** — run a dedicated a11y tool (axe-core, Lighthouse a11y) as a sibling workflow.
- **Visual regression / pixel diff** — run a dedicated visual tool (Percy, Chromatic, or Playwright screenshots with visual diff).
- **Browser / device matrix beyond desktop Chrome + 375px mobile** — defer to a manual QA cycle on Safari, Firefox, edge devices.
- **Load-testing at production-scale volume** (100k+ concurrent users) — the /e2e-perf spec targets realistic volume (50 concurrent teachers, 1 200-student tenant), not disaster-peak.
- **Scan AI vendor cost monitoring** — not in perf spec; tracked via cloud billing + vendor dashboard.
- **Human-factors testing** — e.g. does a teacher understand the "NOT_SESSION_TEACHER" message? UX research out of scope here.

These gaps are acceptable for the 99.99% confidence target. 100% confidence does not exist.

---

## Observations & findings from the walkthrough

Observations are seeded in each spec's §24/§27/§35/§44 section. Summary per leg:

| Leg                 | Observations (severity placeholder — update after audit run)                                                                                                                                                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| /E2E (admin)        | Watchpoints: date formatting regression (commit `5efed767`), subject missing on per-period rows, auto-marked attribution, closure override audit, cross-tenant data leak on any endpoint.                                                                                                                                   |
| /E2E (teacher)      | **Primary security boundary** (NOT_SESSION_TEACHER §16) — any Fail here is P0. Also: wide daily-summary scope (O-TV1), `/upload` link visibility regression (O-TV2/3), read-only view on foreign sessions (O-TV4).                                                                                                          |
| /E2E (officer)      | `/upload` link visibility (O-OV1), unmarked-badge race (O-OV2), no attribution on officer-submitted (O-OV3), students.view scope (O-OV4), no officer un-submit path (O-OV5), partial-submission confirmation (O-OV6).                                                                                                       |
| /E2E (parent)       | Amend retro-notify contract (O-PV1), multi-period digest (O-PV2), reason redaction for PHI (O-PV3), RTL email rendering (O-PV4), quiet-hours timezone (O-PV5), pattern-alert quiet-hours gate (O-PV6).                                                                                                                      |
| /e2e-integration    | Closure-race retro-cleanup (O-INT1), amend history storage (O-INT2 / P1 candidate), cancel semantics on submitted (O-INT3), notification error swallowing (O-INT4), session_details payload size (O-INT5), tenant settings caching (O-INT6).                                                                                |
| /e2e-worker-test    | Pending-detection no-op writes (O-W1), parent notification dedup (O-W2), closure-race orphan sessions (O-W3), pattern-detection sharding (O-W4), auto-lock weekend handling (O-W5), repeat early-warning firing (O-W6), tenant-list caching (O-W7).                                                                         |
| /e2e-perf           | Subject N+1 (O-PF1), upsert loop O(N) (O-PF2), per-student summary recalc (O-PF3 / P1 candidate), scan synchronous flow (O-PF4 / P1 candidate), pattern-detection sharding (O-PF5), auto-lock updateMany lock width (O-PF6), missing Lighthouse (O-PF7).                                                                    |
| /e2e-security-audit | **Release blockers** — Student zero-access §13 (P0 if any Fail), IDOR fuzz §15 (P0 on any 200), AI prompt injection §17 (P1), rate-limiting §23 (P1 if absent), audit-log integrity §25, secrets management §26. Several P2 candidates: default-present sentinel collision, amend-history storage, MFA on student accounts. |

Full observation lists live in each spec's "Observations" section. No finding has been CONFIRMED yet — audit execution against this pack produces the definitive tally.

---

## Tester assignment

This pack is designed to be executed by:

- **A dedicated QC engineer** — working through each spec top-to-bottom, marking Pass/Fail per row, ideally one spec per day.
- **A headless Playwright agent** — for the 4 /E2E legs (UI behaviour is scriptable end-to-end).
- **A jest / supertest harness** — for /e2e-integration and /e2e-worker-test rows (each row maps to a test case).
- **A k6 / artillery / Lighthouse script** — for /e2e-perf (each row is a measurement).
- **A paid security consultant OR an internal security engineer** — for /e2e-security-audit (humans still find more than tools on the adversarial axis).

---

## Critical-path regression guards

Three regressions from commit `5efed767` are explicitly guarded across the pack:

1. **Multi-processor race on attendance queue** — worker spec §5 + §23 assert a single `@Processor(ATTENDANCE)` lives in the codebase and all 100 enqueues route correctly.
2. **Date rendered as raw ISO string on mark page** — admin spec §12.3 + teacher spec §11.2 require `formatDate()` output.
3. **Teacher seeing all tenant sessions** — teacher spec §8.11 explicit guard + integration §9 teacher-scope boundary matrix.
4. **Subject name missing on per-period rows** — admin spec §9.3, teacher spec §8.3, officer spec §12.4, all mark-page subtitles require subject present.

Any regression of any of these four is P0.

---

## Sign-off

| Leg                 | Reviewer | Date | Pass | Fail | Notes |
| ------------------- | -------- | ---- | ---- | ---- | ----- |
| /E2E (admin)        |          |      |      |      |       |
| /E2E (teacher)      |          |      |      |      |       |
| /E2E (officer)      |          |      |      |      |       |
| /E2E (parent)       |          |      |      |      |       |
| /e2e-integration    |          |      |      |      |       |
| /e2e-worker-test    |          |      |      |      |       |
| /e2e-perf           |          |      |      |      |       |
| /e2e-security-audit |          |      |      |      |       |

**Module release-ready when all eight rows are signed off at Pass with zero P0 / P1 findings outstanding.**
