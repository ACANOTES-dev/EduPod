# Admissions — Release Readiness Pack

**Generated:** 2026-04-12
**Commit:** c385872c
**Module slug:** admissions
**Module folder:** `E2E/5_operations/admissions/`

This pack is the aggregate deliverable of `/e2e-full admissions`. It gathers the five legs of the spec — admin/parent UI, integration, worker, perf, security — into a single release-readiness view. The pack targets ~99.99% confidence that a tenant with realistic volume and normal attack exposure will not hit a regression that specs could reasonably have anticipated.

---

## Spec pack

| Leg                       | Spec document                                                                                                                                          | Lines     | Major sections | Date       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | -------------- | ---------- |
| /E2E (admin)              | [admin_view/admissions-e2e-spec.md](./admin_view/admissions-e2e-spec.md)                                                                               | 974       | 36             | 2026-04-12 |
| /E2E (parent / public)    | [parent_view/admissions-e2e-spec.md](./parent_view/admissions-e2e-spec.md)                                                                             | 352       | 15             | 2026-04-12 |
| /E2E (teacher)            | **N/A** — admissions has no teacher-facing surfaces. Teachers have zero `admissions.*` permissions; they cannot see the hub, queues, or detail pages.  | —         | —              | —          |
| /E2E (student)            | **N/A** — students do not exist as users until an approved application materialises a `Student` record. There are no student-facing admissions routes. | —         | —              | —          |
| /e2e-integration          | [integration/admissions-integration-spec.md](./integration/admissions-integration-spec.md)                                                             | 504       | 14             | 2026-04-12 |
| /e2e-worker-test          | [worker/admissions-worker-spec.md](./worker/admissions-worker-spec.md)                                                                                 | 271       | 10             | 2026-04-12 |
| /e2e-perf                 | [perf/admissions-perf-spec.md](./perf/admissions-perf-spec.md)                                                                                         | 350       | 14             | 2026-04-12 |
| /e2e-security-audit       | [security/admissions-security-spec.md](./security/admissions-security-spec.md)                                                                         | 414       | 15             | 2026-04-12 |
| **Total (all five legs)** |                                                                                                                                                        | **2,865** | **104**        |            |

---

## Execution order

Run the specs in the order they are listed in the table above. Each leg reuses the inventory from the previous leg (endpoint map, state machine, job catalogue) to avoid re-surveying the codebase.

1. **UI behavioural (admin, then parent)** — establishes the surface and data invariants.
2. **Integration** — RLS matrix, API contract, Stripe webhook, DB invariants, concurrency.
3. **Worker** — queues, jobs, cron, async chains, idempotency.
4. **Perf** — endpoint budgets, scale, load, page budgets, query health.
5. **Security** — OWASP Top 10, permission matrix (290 cells), injection fuzz, business logic abuse.

Each leg can be executed independently; the full pack is what achieves release-readiness.

---

## Coverage summary

- **UI surface:** 10 authenticated staff routes + 7 public routes + 2 parent portal routes = 19 unique pages × relevant roles.
- **API endpoints:** 28 (every row in §34 of the admin spec).
- **Tenant-scoped tables:** 6 (`applications`, `admission_form_definitions`, `admission_form_fields`, `application_notes`, `admission_overrides`, `admissions_payment_events`) — all covered in the RLS matrix (22 rows).
- **State machine transitions:** 19 valid + invalid transitions tested.
- **BullMQ jobs:** 2 (`notifications:admissions-payment-link`, `notifications:admissions-auto-promoted`).
- **Cron schedules:** 1 (`admissions:payment-expiry`, `*/15 * * * *`).
- **Async chains:** 3 (approve → payment-link; webhook → approve → finance → receipt; expiry → revert → auto-promote).
- **OWASP categories covered:** 10/10 (with explicit N/A justifications for A03-command/path-traversal-NoSQL and A10-SSRF).
- **Permission matrix cells:** 29 endpoints × 10 roles = 290 cells.
- **Data invariants:** 26 SQL assertions (admin §30) + 30 in integration spec (§7).
- **Perf endpoints budgeted:** 28.
- **Page budgets measured:** 14.
- **Security severity tally (spec-time):** P0: 42, P1: 55, P2: 30, P3: 8, N/A: 5.

---

## Known limitations of the pack

Even the full pack does not cover:

- **Long-tail Zod validation combinatorics beyond the documented boundary cases** — combinatorially explosive; sampled, not exhaustive.
- **Real external-service behaviour** (Stripe API outages, email provider delays, Cloudflare latency spikes) — mocked at the boundary, not live-tested.
- **Accessibility audits beyond structural / ARIA checks** — run a dedicated a11y tool (axe-core, Lighthouse a11y, NVDA smoke) as a sibling workflow.
- **Visual regression / pixel diff** — run a dedicated visual tool (Percy, Chromatic, Playwright visual diff).
- **Browser / device matrix beyond desktop Chrome + 375px mobile emulation** — deferred to a manual QA cycle on Safari, Firefox, and edge devices (iPad Pro, Pixel 7, iPhone SE).
- **Load-testing at disaster-scenario peak** (100k+ concurrent users) — the /e2e-perf spec targets realistic volume (50 / 500 concurrent users), not peak.
- **Column-level encryption of applicant PII** (national_id, medical_notes, DOB, address) — flagged as observation IN-03 / SE-06; out of scope for the pack because no encryption exists yet to test.
- **Long-lived regressions from modules outside admissions** that import its services (Finance, Search) — tracked at the coverage-tracker level.

These gaps are acceptable for the 99.99% confidence target. 100% confidence does not exist.

---

## Observations & findings from the walkthrough

| Leg                 | Count | Notable P0 / P1 findings                                                                                                                                                                                                    |
| ------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| /E2E (admin)        | 15    | OB-04 (P1): capacity-level seat race potentially unprotected. OB-11 (P1): manual-promote doesn't consume seat.                                                                                                              |
| /E2E (parent)       | 6     | OB-P2 (P2): honeypot drop emits no metric. OB-P6 (P2): retry regenerates Stripe session unconditionally.                                                                                                                    |
| /e2e-integration    | 10    | IN-01 (P1): capacity race, same as admin OB-04. IN-03 (P2): GDPR PII stored plaintext. IN-06 (P1): rely on `stripe_event_id` unique constraint for idempotency — must not be dropped in a future migration.                 |
| /e2e-worker-test    | 8     | WK-01 (P1): `payment-expiry` cron lockDuration may be insufficient at 10k+ expired rows. WK-02 (P2): Stripe session regeneration non-idempotent — zombie sessions possible on DB failure post-Stripe success.               |
| /e2e-perf           | 8     | PF-03 (P1): same as WK-01 — lockDuration. PF-05 (P2): Recharts bundle bloat on analytics page.                                                                                                                              |
| /e2e-security-audit | 15    | SE-04 (P0): capacity race — unified with admin OB-04 / integration IN-01. SE-06 (P1): GDPR PII plaintext. SE-14 (P1): regenerate-payment-link lacks an audit trail. SE-10 (P1): public-submit response echoes full payload. |

**Total unique findings across the pack: 62 (after deduplication). Security severity tally at spec-time includes 42 P0 rows — these are the _expected behaviours_ to verify, not observed exploits.**

### Key cross-cutting concerns

Three observations appear across multiple legs and should be prioritised:

1. **Capacity-level race condition** (admin OB-04 / integration IN-01 / security SE-04). Verify whether a capacity-scoped lock exists in `ApplicationStateMachineService.moveToConditionalApproval`. If not, fix before tenant launch.
2. **`payment-expiry` cron at scale** (worker WK-01 / perf PF-03). Current 5-min lockDuration is likely insufficient for tenants with >10k concurrent conditional_approval applications. Either bump the lock OR batch with per-batch lock renewal.
3. **Applicant PII plaintext** (integration IN-03 / security SE-06). Consider column-level encryption for `national_id` and `medical_notes` OR document a strict access-logging posture for GDPR compliance.

---

## Tester assignment

This pack is designed to be executed by:

- **A dedicated QC engineer** working through each spec top-to-bottom, marking Pass/Fail per row (ideally one spec per day).
- **A headless Playwright agent** for the /E2E legs (UI behaviour is scriptable end-to-end).
- **A Jest + supertest harness** for /e2e-integration (raw-body Stripe webhook posting required) and /e2e-worker-test (BullMQ test helpers + fake timers).
- **A k6 / autocannon script + Lighthouse run** for /e2e-perf (each row is a measurement).
- **A paid security consultant OR an internal security engineer** for /e2e-security-audit. Humans still find more than tools on the adversarial axis, especially in business-logic abuse.

---

## Sign-off

| Leg                 | Reviewer | Date | Pass | Fail | Notes |
| ------------------- | -------- | ---- | ---- | ---- | ----- |
| /E2E (admin)        |          |      |      |      |       |
| /E2E (parent)       |          |      |      |      |       |
| /e2e-integration    |          |      |      |      |       |
| /e2e-worker-test    |          |      |      |      |       |
| /e2e-perf           |          |      |      |      |       |
| /e2e-security-audit |          |      |      |      |       |

**Module release-ready when all six signed-off rows show Pass and zero P0 / P1 findings are outstanding.** The three cross-cutting concerns above are the blockers to watch.
