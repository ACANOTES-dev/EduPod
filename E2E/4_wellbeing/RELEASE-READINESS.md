# Wellbeing — Release Readiness Pack

**Generated:** 2026-04-21
**Commit:** `2d7b93a9` (main — post impl-24 sign-off)
**Module slug:** `wellbeing`
**Module scope:** 8 NestJS modules (behaviour, pastoral, safeguarding, early-warning, staff-wellbeing, wellbeing-aggregate, ai-flags, wellbeing-notifications) + supporting `critical-incidents`, `child-protection`, `security-incidents` surfaces + 79 frontend pages across 6 hub modules + 10 settings.

---

## Spec pack

| Leg                                                    | Spec document                                                                            |     Lines | Sections | Rows (approx) | Date       |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------: | -------: | ------------: | ---------- |
| `/E2E` — admin (owner / principal / VP / school_admin) | [`admin_view/wellbeing-e2e-spec.md`](admin_view/wellbeing-e2e-spec.md)                   |     1,140 |       51 |           423 | 2026-04-21 |
| `/E2E` — teacher                                       | [`teacher_view/wellbeing-e2e-spec.md`](teacher_view/wellbeing-e2e-spec.md)               |       799 |       28 |           191 | 2026-04-21 |
| `/E2E` — parent                                        | [`parent_view/wellbeing-e2e-spec.md`](parent_view/wellbeing-e2e-spec.md)                 |       639 |       21 |           248 | 2026-04-21 |
| `/E2E` — student                                       | [`student_view/wellbeing-e2e-spec.md`](student_view/wellbeing-e2e-spec.md)               |       590 |       21 |           257 | 2026-04-21 |
| `/e2e-integration`                                     | [`integration/wellbeing-integration-spec.md`](integration/wellbeing-integration-spec.md) |     1,150 |       45 |          ~650 | 2026-04-21 |
| `/e2e-worker-test`                                     | [`worker/wellbeing-worker-spec.md`](worker/wellbeing-worker-spec.md)                     |       687 |       37 |          ~213 | 2026-04-21 |
| `/e2e-perf`                                            | [`perf/wellbeing-perf-spec.md`](perf/wellbeing-perf-spec.md)                             |       634 |       21 |          ~185 | 2026-04-21 |
| `/e2e-security-audit`                                  | [`security/wellbeing-security-spec.md`](security/wellbeing-security-spec.md)             |       786 |       20 |          ~277 | 2026-04-21 |
| **Totals**                                             |                                                                                          | **6,425** |  **244** |    **~2,444** |            |

---

## Execution order

Run the specs in this order for full confidence:

1. **UI behavioural (admin, then each other role).** Admin spec establishes the full page inventory and canonical flows; the other roles exercise scoped variants + negative matrices.
2. **Integration.** RLS matrix across every tenant-scoped wellbeing table, API contract edges per mutation endpoint, state-machine invariants across 7 lifecycles, concurrency, transaction boundaries, and cross-module chains.
3. **Worker.** 5 queues, 18 processors, 10 crons, chain flows, retry + dead-letter, idempotency guards, tenant-aware payload enforcement.
4. **Perf.** 78 endpoint budgets + 17 page budgets + 28 worker budgets + 8 PDF budgets. Scale matrix at 0 / realistic / 10k / 50k rows. Load / N+1 / cache / cold-start.
5. **Security.** OWASP 10/10 coverage, permission matrix (~880 cells), injection fuzz (150 cells), seal + break-glass + CP + guardian-restriction + anonymous-survey + AI-injection + document-leak + attachment-scan + audit-integrity + business-logic + GDPR + dependency + secrets audits.

Each leg can be executed independently, but the full pack is what achieves release-readiness.

---

## Coverage summary

- **UI surface**: 79 pages × 4 roles = **316 role-cells** (admin, teacher, parent, student). Admin spec covers all 79; role specs cover the scoped + negative variants.
- **API endpoints exercised**: ~250 across 8 backend modules. Full mutation coverage in integration spec; reads sampled.
- **Tenant-scoped tables**: 54 (30 behaviour + 19 pastoral + 5 safeguarding + 4 early-warning + 4 staff-wellbeing minus 2 anonymous + 3 infrastructure). All covered in RLS matrix (54 × 6 = **324 RLS rows**). Custom RLS policies (tier-3 pastoral + CP records) covered in §8 of integration.
- **BullMQ queues**: 5 (pastoral, wellbeing, early-warning, behaviour, plus shared notifications + pdf-rendering downstream).
- **BullMQ processors**: 18 wellbeing processors + 3 behaviour cron dispatchers = 21 in worker spec.
- **Cron registrations**: 10 in CronSchedulerService.
- **State machines**: 7 lifecycles (incident / sanction / exclusion / appeal / pastoral case / pastoral intervention / safeguarding concern + survey). Invalid transition rows per machine.
- **OWASP categories covered**: 10/10.
- **Permission matrix cells**: up to ~880 (80 mutation endpoints × 11 roles). Spot-sampled ≥ 150 executed rows.
- **Permissions referenced**: 44 wellbeing-umbrella permissions across 8 roles.
- **Injection fuzz**: 15 fields × 10 payload classes = 150 cells.
- **Anonymity invariants** (survey_responses / survey_participation_tokens): 6 schema-level + runtime checks.
- **PDF documents**: exclusion notice, sanction letter, appeal decision letter, appeal evidence bundle, board pack, safeguarding case file (full + redacted). Byte/header/hash checks + redaction fidelity.

---

## Admin logical-permission model

**The user has stated the current role-permission grants are not fully wired.** This pack encodes the **logical** model and treats that as the "Expected" outcome in every row. Admin-tier roles (owner, principal, vice-principal, school_admin) are assumed to hold **every** wellbeing-umbrella permission (44 keys), with **one exception**: safeguarding seal approval remains dual-control, requiring two distinct admins. Teachers, parents, and students follow logical scoping as described in their role specs.

If the permission seeds diverge, the tester should flag the gap as a **permission-grant bug** (not a pack regression) and track separately. See integration spec §1.2.5 for the SQL assertion baseline.

---

## Known limitations of the pack (residual gaps acknowledged)

- **Long-tail Zod validation combinatorics** beyond the documented boundary cases — combinatorically explosive; sampled, not exhaustive.
- **Real external-service behaviour** — Stripe / email / SMS / WhatsApp / TUSLA / Garda — mocked at the boundary per PLAN §8; delivery providers currently stubbed (`PROVIDER_NOT_WIRED`).
- **Accessibility audits beyond structural checks** — run axe-core / Lighthouse a11y as a sibling workflow.
- **Visual regression / pixel diff** — run Percy / Chromatic / Playwright screenshots separately.
- **Browser / device matrix beyond desktop Chrome + 375px mobile** — defer Safari, Firefox, iPad, edge devices to a manual QA cycle.
- **Load-testing at production-scale volume (100k+ concurrent users)** — perf spec targets realistic volume (50–100 concurrent), not disaster-peak scenarios.
- **Live Anthropic AI latency and adversarial prompt outputs** — stubbed for perf; prompt-injection mitigations tested against stub + live key pending configuration.
- **Dedicated `safeguarding_break_glass_access_log` + `admin_repair_runs` tables** — projected from `safeguarding_actions` / BullMQ job IDs today (PLAN §8 deferred).

These gaps are acceptable for the 99.99% confidence target. 100% confidence does not exist.

---

## Observations flagged across the pack

Each spec includes an **Observations** section for items surfaced during walkthrough but not tester-blocker:

- **Admin** — O-1…O-8 (module-flag hard-hide, EAP cron chattiness, Prisma @map gotcha, break-glass review reminder UX, SST idempotency staleness, AI-flag banner link permissioning, break-glass access-log projection, repair-run state table).
- **Teacher** — T-1…T-8 placeholders, to be populated during execution (scoping gaps, export visibility, household cross-visibility, etc.).
- **Parent** — P-1…P-8 placeholders (no error banner, no visible appeal CTA, no self-referral CTA, no guardian-restriction explainer, silent amendment narrative updates, no parent Documents tab).
- **Student** — S-1…S-8 placeholders (student portal not shipped, permission-less check-in is intentional, silent-flag is best-practice safeguarding, etc.).
- **Integration** — observation rows per matrix section (populate during execution).
- **Worker** — §35 observability + DLQ monitoring notes.
- **Perf** — cache-warm vs cold behaviour, workload-metrics stale-window.
- **Security** — S-1…S-12 pre-seeded observations covering AI-flag propagation, break-glass self-grant, EAP cron noise, PDF integrity hash, prompt-injection mitigations, CP-grant dual approval, guardian-restriction edge-endpoint coverage, attachment-scan UX, JWT TTL verification, survey time-correlation, safeguarding rate-limit policy, platform-admin cross-tenant audit.

**Full list**: see the **Observations spotted during the walkthrough** section at the end of each spec.

---

## Ship blockers vs. pre-seeded findings

### Ship blockers (must resolve before prod release)

None of the pre-seeded pack observations are outright blockers without first executing the pack. Each row with a P0 / P1 label in the security spec **is** a potential blocker; whether it is one depends on execution result.

### Known pre-existing in-scope finds from the rebuild (closed in impl 24)

Per the `wellbeing_new/SIGN_OFF.md`:

- **ISSUE-24-01** — safeguarding.view 403 toasts on `/safeguarding` (fixed via migration `20260421000000_wbr_backfill_safeguarding_admin_grants`). Covered by admin §29.6.
- **ISSUE-24-02** — `/early-warnings` 500 on `prisma.pastoralIntervention.findMany({status:'active'})` (fixed via `toPrismaInterventionStatus`). Covered by admin §34.7.
- **ISSUE-24-03** — `/behaviour/analytics` 500 on `prisma.student.count({status:'enrolled'})` (fixed by swapping to `'active'`). Covered by admin §15.1.4.
- **ISSUE-24-04** — `/wellbeing/staff` 404 toasts for non-teaching admins (fixed via `STAFF_PROFILE_NOT_FOUND` empty state). Covered by admin §36.2.

These are **already closed** and covered as regression rows in the admin spec.

### Out-of-scope items carried forward from rebuild

Per `SIGN_OFF.md` "Known remaining out-of-scope items":

- Hardening of email / SMS / WhatsApp delivery providers (stubs emit `PROVIDER_NOT_WIRED`).
- `ANTHROPIC_API_KEY` on production — AI endpoints return 503 `AI_SERVICE_UNAVAILABLE` when flag on + key missing.
- `generation_failed` + `last_error` + `retry_count` on `behaviour_documents`.
- Multi-recipient `/send-batch` endpoint.
- SMS channel.
- Per-jurisdiction exclusion statutory deadlines.
- Multi-instance Redis rate limit + cache invalidation.
- Module-flag hard-hide on hub tiles (currently visible with count=0).
- LLM-backed SST agenda + early-warnings narrative (deterministic heuristics ship today).
- Recognition feed merger (awards vs positive incidents — product decision).
- Dedicated `safeguarding_break_glass_access_log` table.
- `admin_repair_runs` dedicated tracking table.
- Resend document counter.
- `SYSTEM_ROLE_PERMISSIONS` / `SYSTEM_ROLES` consolidation refactor.

All documented, justified, and not blocking pack execution.

---

## Tester assignment

This pack is designed to be executed by:

- **A dedicated QC engineer** working through each spec top-to-bottom, marking Pass/Fail per row. Estimated effort: ~8 engineer-days for a first-run on the full pack (by leg: 2 days admin, 0.5–1 day each of teacher/parent/student, 2 days integration, 1 day worker, 1 day perf, 1.5 days security).
- **A headless Playwright agent** for the `/E2E` legs — UI behaviour is scriptable end-to-end. Caveat per user's earlier guidance: visual spot-checks only, no screenshots; cap at ~20 min budget per role and lean on the test suite for correctness.
- **A jest / supertest harness** for `/e2e-integration` and `/e2e-worker-test` rows — each row maps to a test case. Integration rows alone are ~650 assertions; worker rows ~210; both lend themselves to parameterised test-table style.
- **A k6 / autocannon / Lighthouse script** for `/e2e-perf` — each row is a numeric measurement.
- **A paid security consultant OR an internal security engineer** for `/e2e-security-audit` — humans still find more than tools on the adversarial axis. Combine with Burp Suite for live probing.

---

## Sign-off

| Leg                   | Reviewer | Date | Pass | Fail | Notes |
| --------------------- | -------- | ---- | ---- | ---- | ----- |
| `/E2E` (admin)        |          |      |      |      |       |
| `/E2E` (teacher)      |          |      |      |      |       |
| `/E2E` (parent)       |          |      |      |      |       |
| `/E2E` (student)      |          |      |      |      |       |
| `/e2e-integration`    |          |      |      |      |       |
| `/e2e-worker-test`    |          |      |      |      |       |
| `/e2e-perf`           |          |      |      |      |       |
| `/e2e-security-audit` |          |      |      |      |       |

**Module release-ready when all eight rows are signed off at Pass with zero P0 / P1 findings outstanding.**

---

## How this pack was assembled (for reviewers)

Under the `/e2e-full` orchestration:

- **Step 0 — scope discovery.** Launched 5 parallel inventory agents to produce a complete map of (a) frontend pages + nav-config, (b) backend endpoints + controllers + services, (c) Prisma schema + RLS policies + sequences + seeds, (d) BullMQ queues + processors + crons + chains, (e) permissions + role matrix. Output used as the authoritative source for every downstream spec.
- **Step 1 — `/E2E` per role.** Admin spec (1,140 lines) authored as the anchor covering all 79 pages across 6 hub modules + 10 settings. Teacher / parent / student specs delegated to parallel scoped agents (each receiving the inventory and the admin spec as reference) — produced 799 / 639 / 590 lines respectively with per-role negative matrices and logical-permission encoding.
- **Step 2 — `/e2e-integration`.** 1,150-line spec covering: RLS leakage matrix across all 54 tenant-scoped tables (324 rows), API contract edges per mutation endpoint with Zod boundary / permission / existence / state-machine cells, tiered + gated RLS for tier-3 pastoral + CP records, state-machine invariants across 7 lifecycles, concurrency / race / transaction boundaries, cross-module chains, PDF / binary invariants, audit + IP-audit correctness, sequence numbering.
- **Step 3 — `/e2e-worker-test`.** 687-line spec covering all 18 processors + 10 crons + 8 chain flows. Per-processor: happy path, edge payload, tenant-aware enforcement, idempotency, retry + dead-letter, chain dedup, cross-tenant isolation.
- **Step 4 — `/e2e-perf`.** 634-line spec with 78 endpoint budgets, 17 page budgets (FCP / LCP / CLS), 28 worker budgets, 8 PDF-render budgets, scale matrix at 0 / realistic / 10k / 50k rows, N+1 detection per relation-heavy endpoint, load / concurrency tests, EXPLAIN ANALYZE for 10 critical queries, memory / event-loop health, cold-vs-warm start.
- **Step 5 — `/e2e-security-audit`.** 786-line spec covering OWASP 10/10, permission matrix (~880 cells, spot-sampled ≥ 150), injection fuzz (150 cells), auth hardening, CSRF / CORS / headers, safeguarding seal + break-glass + CP + guardian-restriction + anonymous-survey + AI-injection + document-leak + attachment-scan + audit-integrity + business-logic + GDPR + dependency + secrets audits. 12 pre-seeded observations from code review.

Sequential leg execution as mandated by `/e2e-full`; parallelism was confined to Step 0 inventory (non-overlapping dimensions) and Step 1 role-spec authoring (each role agent working on a distinct file).
