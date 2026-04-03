# Master Audit Report — Technical Due Diligence

**Date:** 2026-04-03
**Auditor:** Claude Opus 4.6, 7-agent parallel audit, effort MAX
**Repository:** ACANOTES-dev/EduPod
**Root Path:** /Users/ram/Desktop/SDB

---

## 1. Executive Summary

This is a well-engineered multi-tenant school SaaS with genuinely strong fundamentals — 9,197 passing tests, zero type-safety violations, defense-in-depth RLS, and a CI pipeline with 15+ automated governance gates. The system is safe to operate and extend with care. It is not yet safe to refactor freely due to invisible cross-module Prisma data coupling and critical test gaps in the frontend (3/10), pastoral, and GDPR modules. The biggest structural risk is the Prisma bypass pattern that makes schema changes silently break consumers across module boundaries.

---

## 2. System Overview

**Architecture:** NestJS modular monolith (58 modules) + Next.js App Router frontend (337 pages) + BullMQ worker (93 processors). Single PostgreSQL database, shared schema, Row-Level Security isolation. Bilingual English/Arabic with full RTL. Turborepo monorepo with pnpm.

**Scale:** 3,458 TypeScript files, 427,141 lines of source, 265 Prisma models (413KB schema), 733 test files (9,197 tests). Largest module: behaviour at 24,104 lines across 74 files with 214 endpoints.

**Deployment:** Single server via SSH, PM2 cluster (api + web + worker), PgBouncer in transaction mode, Meilisearch for search, Sentry for error tracking. Docker Compose for local development.

**Tenancy:** 253 tenant-scoped models with RLS enforced at DB layer (FORCE ROW LEVEL SECURITY). 12 platform-level models without tenant_id. CI gate blocks deployment if any tenant-scoped table lacks an RLS policy.

---

## 3. Shared Fact Pack Summary

| Fact                    | Value                                            |
| ----------------------- | ------------------------------------------------ |
| TypeScript files        | 3,458                                            |
| Total source lines      | 427,141                                          |
| Backend modules         | 58                                               |
| Worker processors       | 93                                               |
| Frontend pages          | 337                                              |
| Prisma models           | 265 (253 tenant-scoped)                          |
| RLS policies            | 254                                              |
| Backend tests           | 7,785 (567 suites) — ALL PASS                    |
| Worker tests            | 666 (100 suites) — ALL PASS                      |
| Shared tests            | 746 (28 suites) — ALL PASS                       |
| Frontend test files     | 35 (visual + journey + unit)                     |
| Lint                    | PASS (warnings only)                             |
| Type-check              | PASS (all 8 packages)                            |
| `any` types             | 0                                                |
| `@ts-ignore`            | 0                                                |
| TODO/FIXME/HACK         | 0                                                |
| CI governance scripts   | 15+                                              |
| Danger zones documented | 19 (3 mitigated, 1 partial, 12 open, 3 resolved) |

---

## 4. Build / Run / Test Findings

### Passed

- All 9,197 tests across backend, worker, and shared packages
- Lint (all 6 packages)
- Type-check (all 8 packages)
- Zero type-safety violations anywhere in source code

### Warnings Only

- i18n hardcoded strings in newer frontend modules (gradebook, homework)
- 1 max-lines warning (703 lines, budget 600)

### Not Run in Audit

- Integration/e2e tests (require live database)
- Visual smoke tests (require browser)
- Build (cached from prior CI; no errors reported)

### Test Infrastructure Strengths

- Coverage thresholds: statements 76%, branches 57%, functions 78%, lines 77%
- Coverage ratchet: thresholds can only go up, never down
- Worker processor spec verification: CI blocks if any processor lacks a spec file
- 5 cross-module integration specs covering critical flows (enrollment→invoice→payment, attendance→pattern→warning, incident→sanction→notification, payroll→payslip→PDF, DSAR→export→anonymisation)

---

## 5. Test Health Assessment

### Backend Test Health: 7.0/10

**Strengths:**

- 567 suites / 7,785 tests all passing
- Auth spec exemplary: 2,025 lines, 40 rejection tests, three-layer rate limiting coverage
- Payroll tests verify exact decimal outputs (2dp/4dp) catching floating-point regressions
- 1,402 rejection assertions (18% of tests verify error paths)
- 60 test files with `edge:` prefix convention
- 86.2% service-to-spec coverage, 87% controller-to-spec coverage

**Weaknesses:**

- Branch coverage floor at 57% — lowest gate
- Pastoral: 12 services + 10 controllers missing specs (2nd largest module, handles safeguarding)
- GDPR: 7 of 8 services have NO spec (consent, DPA, privacy notices untested)
- Import executor: 0.35x spec-to-service ratio (superficial)
- RLS leakage tests cover only 3 of ~253 tenant-scoped tables

### Frontend Test Health: 3.0/10

**Critical gap:** 337 pages with only 35 test files. 5 of 6 journey tests are page-render checks, not CRUD workflow tests. Only the login journey fills a form. Zero CRUD operation testing (student creation, invoice creation, attendance marking). 12 unit specs extract pure functions rather than mounting components. Visual regression suite (107 screenshots) catches bilingual/RTL regressions but cannot detect functional breakage.

### Worker Test Health: 8.0/10

**Genuinely strong:** 100% processor-to-spec coverage (93/93, CI-enforced). Retention enforcement spec alone is 954 lines with 20+ scenarios. Tenant isolation tested in base class. Fault isolation verified. Main gap: zero retry/backoff configuration testing.

### Combined Trust Level for Refactoring

**Backend:** Trustworthy for auth, finance, payroll, behaviour. NOT trustworthy for pastoral, GDPR, imports.
**Frontend:** NOT trustworthy for any refactoring — no functional regression safety net.
**Worker:** Trustworthy for all processors.

---

## 6. Module Health Matrix

See `module-health-matrix_2026-04-03.md` for the full matrix.

**Summary:** 25 modules assessed. 4 high-risk (behaviour, pastoral, finance, gdpr), 6 medium-high, 15 medium or below. Auth is the strongest module (9/10 test health). Pastoral and GDPR are the most dangerous gaps given they handle regulated data with almost no test coverage.

---

## 7. Deep Dive: Highest-Risk Modules

### 7.1 Behaviour — The God Module

**Why it matters:** 24,104 lines, 74 files, 214 endpoints, 33 exported services, 16 worker processors. Handles safeguarding (DZ-13), appeal cascades across 6 tables (DZ-17), legal holds (DZ-18), and parent notifications (DZ-14).

**Strengths:** Internal decomposition into 7 sub-modules. Strong test coverage for core state machines (90 transition tests for incidents alone). Appeal decision spec is thorough. Entity history and amendment trail provides audit coverage.

**Weaknesses:** Despite sub-module decomposition, it's still a single NestJS module with 33 exports. Any change to the module interface requires understanding the full 24K-line surface. The safeguarding status projection (DZ-13) must be applied at every rendering surface — a systematic risk that requires discipline at every new endpoint.

**Likely failure mode:** A new endpoint or export renders incident status without calling `projectIncidentStatus()`, leaking safeguarding information to unauthorized users.

**Remediation:** Continue extracting sub-modules (safeguarding is the strongest candidate). Add a custom ESLint rule or test that verifies all incident-status rendering calls the projection function.

### 7.2 Pastoral — The Test Gap

**Why it matters:** 19,810 lines, 66 files. Handles child-protection-adjacent data including concerns, referrals, and DSAR data collection. 12 services and 10 controllers have NO spec files.

**Strengths:** Module is self-contained with limited external consumers.

**Weaknesses:** The concern projection, concern queries, and concern access services — which control who can see sensitive pastoral data — are completely untested at the unit level. Critical incident response service has no spec.

**Likely failure mode:** A refactor to concern access logic silently changes visibility rules, exposing sensitive pastoral data to unauthorized staff.

**Remediation:** Prioritize specs for concern-access.service.ts, concern-projection.service.ts, and critical-incident-response.service.ts before any changes to this module.

### 7.3 GDPR Module — Compliance Blindspot

**Why it matters:** 7 of 8 services lack specs. This module controls consent withdrawal (which affects WhatsApp delivery, AI features, allergy reports, risk detection, and benchmarking), DPA acceptance (global API guard), and privacy notice publication (fan-out to all tenant members).

**Strengths:** Consent withdrawal is synchronous and takes effect immediately. DPA guard is tested via controller specs. The module exports are well-defined.

**Weaknesses:** No unit tests for consent.service.ts, dpa.service.ts, privacy-notices.service.ts, age-gate.service.ts, gdpr-token.service.ts, ai-audit.service.ts, or sub-processors.service.ts. The ConsentService affects 6+ downstream features — any regression goes undetected.

**Likely failure mode:** A consent withdrawal path fails silently, continuing to process student data in AI features or send WhatsApp messages after consent is withdrawn — a GDPR violation.

**Remediation:** Add unit specs for all 7 missing services, prioritizing ConsentService and DpaService.

### 7.4 Finance — The State Machine

**Why it matters:** Invoices, payments, fees, refunds, Stripe integration. Invoice status machine has 90 transition tests (DZ-01 MITIGATED). But DZ-04 (refund sequence type) remains open.

**Strengths:** Strong decimal testing. E2E coverage for finance flows. Invoice state machine is well-tested and consolidated.

**Weaknesses:** DZ-04 means refund number generation uses a sequence type not in the canonical list — adding validation would break refunds. No RLS leakage tests for finance tables.

**Remediation:** Add `'refund'` to `SEQUENCE_TYPES` constant. Add RLS leakage tests for invoices, payments, and refunds tables.

---

## 8. Cross-Cutting Architectural Risks

### 8.1 Cross-Module Prisma Bypass (Agent 1 + Agent 5)

**The core problem:** 15+ modules query foreign tables directly via `this.prisma.foreignModel.find*()`. This bypasses the NestJS module boundary system entirely. The CI boundary checks only catch TypeScript import violations, not Prisma model access. Schema changes to `staff_profiles`, `students`, `classes`, `class_enrolments`, `academic_periods`, or `invoices` will silently break consumers in 5-15 other modules.

**Evidence:** `docs/architecture/module-blast-radius.md` explicitly documents this. The `ReportsDataAccessService` read facade (DZ-02 partial mitigation) shows the team knows the pattern is problematic. CI has `check-cross-module-deps.js` with max 8 violations — the threshold suggests the team is tracking but not yet enforcing zero.

**Fix direction:** Implement `ReadFacade` pattern (already proven in reports module) for the top 6 high-exposure tables. Consider a custom ESLint rule that detects Prisma model access to non-owned models.

### 8.2 Frontend Catch Blocks Discard Error Context (Agent 5 + Agent 7)

**The problem:** 358 `catch {}` blocks across 182 frontend files have no error parameter. Users see toasts, but developers get zero diagnostic information when production bugs occur. Combined with no centralized log aggregation and no production request logging, frontend failures are essentially invisible.

**Fix direction:** Change `catch {}` to `catch (err) { console.error('[functionName]', err); }` across all 358 blocks. This is a mechanical fix that can be scripted.

### 8.3 Worker Schema Coupling (Agent 1)

**The problem:** 93 worker processors query API-owned tables via raw PrismaClient with zero import-level visibility. Schema changes break workers silently. The regulatory module's 5 worker processors re-implement service logic using raw PrismaClient instead of importing shared services.

**Fix direction:** Worker processors that need cross-module data should use a shared service or read facade pattern rather than direct Prisma access.

### 8.4 RLS Leakage Test Gap (Agent 2 + Agent 4)

**The problem:** Only homework and child-protection have dedicated RLS leakage tests. 250+ other tenant-scoped tables have no leakage test. The RLS policies are CI-audited for existence, but correctness is not tested (a policy that accidentally uses `OR TRUE` would pass the CI gate).

**Fix direction:** Add RLS leakage tests for the top 10 business-critical tables: students, invoices, payments, payroll_runs, payslips, attendance_records, behaviour_incidents, grades, classes, staff_profiles.

---

## 9. Top 10 Most Important Issues

### 1. RLS Leakage Tests Cover Only 3 of ~253 Tenant-Scoped Tables

- **Severity:** HIGH
- **Confidence:** HIGH
- **Why:** RLS policy existence is CI-gated, but policy correctness is not tested. A misconfigured policy could leak tenant data.
- **Evidence:** Agent 2 found only `homework.rls.spec.ts`, `child-protection-rls.spec.ts`, `rls-role-integration.spec.ts`. Agent 4 confirmed RLS structure is sound but correctness testing is minimal.
- **Agents:** 2, 4
- **Fix:** Add RLS leakage tests for top 10 business-critical tables.

### 2. Frontend E2E Tests Are Render-Only — No CRUD Workflow Testing

- **Severity:** HIGH
- **Confidence:** HIGH
- **Why:** 337 pages, 35 test files. 5 of 6 journey tests check page rendering, not data operations. A broken form submission ships undetected.
- **Evidence:** Agent 3 read all journey tests and confirmed only login.journey.ts fills a form. Others use `if (rowCount > 0)` guards that silently pass with empty data.
- **Agents:** 3
- **Fix:** Add CRUD workflow E2E tests for top 5 user journeys: student enrollment, invoice creation, attendance marking, grade entry, behaviour incident creation.

### 3. Cross-Module Prisma Bypass — Schema Changes Silently Break Consumers

- **Severity:** HIGH
- **Confidence:** HIGH
- **Why:** 15+ modules query 6+ foreign tables directly via Prisma, invisible to DI and CI. Schema changes break consumers at runtime with no compile-time or test-time warning.
- **Evidence:** Agent 1 traced imports. `module-blast-radius.md` documents the pattern. CI cross-module deps script catches module-level imports only, not Prisma model access.
- **Agents:** 1, 5
- **Fix:** Implement ReadFacade pattern for staff_profiles, students, classes, class_enrolments, academic_periods, invoices.

### 4. Pastoral Module — 12 Services + 10 Controllers Missing Specs

- **Severity:** HIGH
- **Confidence:** HIGH
- **Why:** 2nd largest module (19.8K lines), handles safeguarding-adjacent data. Concern access and projection services are completely untested.
- **Evidence:** Agent 2 enumerated all missing specs by file.
- **Agents:** 2
- **Fix:** Add specs for concern-access, concern-projection, critical-incident-response services first.

### 5. GDPR Module — 7 of 8 Services Have No Spec

- **Severity:** MEDIUM-HIGH
- **Confidence:** HIGH
- **Why:** Controls consent withdrawal (affects 6+ features), DPA acceptance (global API guard), and privacy notices. A regression could cause a GDPR violation.
- **Evidence:** Agent 2 listed all 7 missing service specs.
- **Agents:** 2
- **Fix:** Add specs for ConsentService and DpaService first, then remaining 5.

### 6. Frontend Catch Blocks Discard Error Context (358 blocks)

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Why:** Combined with no production request logging and no centralized log aggregation, frontend failures are invisible in production.
- **Evidence:** Agent 5 counted 358 empty catch blocks across 182 files. Agent 7 confirmed no production request logging.
- **Agents:** 5, 7
- **Fix:** Mechanical fix: add error parameter and console.error to all catch blocks.

### 7. No Encryption Key Rotation Tooling

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Why:** Versioned key structure exists (v1-v100) but no re-encryption migration script. If a key is compromised, there's no way to re-encrypt existing data.
- **Evidence:** Agent 4 read encryption.service.ts and confirmed versioned support but no migration tooling.
- **Agents:** 4, 6
- **Fix:** Build a re-encryption migration script that reads with old key version and writes with new.

### 8. Parent Notification Send-Gate Silently Blocks Notifications (DZ-14)

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Why:** For negative behaviour incidents, parent notification is blocked unless `parent_description` is set — but no staff alert exists. Incidents sit in `pending` notification status indefinitely.
- **Evidence:** Agent 6 read the processor code and confirmed no alert mechanism for stuck notifications.
- **Agents:** 6
- **Fix:** Add an alert rule that detects incidents stuck in `pending` notification status for >24 hours.

### 9. No Centralized Log Aggregation

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Why:** Structured JSON logs exist but stay on the server. No Loki/ELK/CloudWatch ingestion. Production debugging requires SSH access and manual log tailing.
- **Evidence:** Agent 7 inspected main.ts, instrument.ts, and deploy script. Confirmed no log shipping.
- **Agents:** 7
- **Fix:** Add log shipping to a centralized service (CloudWatch, Loki, or similar).

### 10. ENCRYPTION_KEY Optional in Env Validation

- **Severity:** MEDIUM
- **Confidence:** HIGH
- **Why:** The API can start without an encryption key, meaning Stripe keys and bank details would fail to decrypt at runtime rather than at startup.
- **Evidence:** Agent 7 confirmed ENCRYPTION_KEY uses `.optional()` in the Zod env validation schema.
- **Agents:** 7
- **Fix:** Change ENCRYPTION_KEY from `.optional()` to `.min(64)` in env validation.

---

## 10. Quick Wins

| Action                                                                 | Impact                           | Effort         |
| ---------------------------------------------------------------------- | -------------------------------- | -------------- |
| Change ENCRYPTION_KEY to required in env validation                    | Prevents silent startup failures | 1 line         |
| Add `'refund'` to SEQUENCE_TYPES constant (DZ-04)                      | Prevents future breakage         | 1 line         |
| Change 358 frontend `catch {}` to `catch (err) { console.error(...) }` | Enables production debugging     | Scriptable     |
| Make `pnpm audit` blocking in CI (`continue-on-error: false`)          | Catches new vulnerabilities      | 1 line in CI   |
| Add file upload size limits to FileInterceptor calls                   | Prevents DoS via large uploads   | Per-controller |
| Add global request body size limit in main.ts                          | Defense-in-depth                 | 1 line         |

---

## 11. Strategic Refactor Opportunities

### Phase A: Visibility (Weeks 1-2)

1. **ReadFacade for top 6 tables** — Make cross-module data access visible and testable
2. **RLS leakage tests for top 10 tables** — Verify policy correctness, not just existence
3. **GDPR service specs** — Protect the consent/DPA/privacy paths before extending

_Prerequisite:_ None. These can start immediately.

### Phase B: Frontend Safety (Weeks 2-4)

4. **CRUD workflow E2E tests** — Add end-to-end tests for top 5 user journeys
5. **Frontend catch block fix** — Enable production debugging

_Prerequisite:_ Can start in parallel with Phase A.

### Phase C: Architecture Hardening (Weeks 4-8)

6. **Behaviour module extraction** — Extract safeguarding into a separate NestJS module
7. **Pastoral spec coverage** — Add specs for all 22 missing services/controllers
8. **Prisma model access lint rule** — Enforce ReadFacade pattern via CI

_Prerequisite:_ Phase A ReadFacades should be in place first.

### Phase D: Operational Maturity (Weeks 4-8)

9. **Centralized log aggregation** — Ship logs to CloudWatch/Loki
10. **Encryption key rotation tooling** — Build re-encryption migration script
11. **Production request logging** — Enable HTTP access logs

_Prerequisite:_ Can start in parallel with Phase C.

---

## 12. Scorecard

| Dimension             | Score   | Weight | Justification                                                                 |
| --------------------- | ------- | ------ | ----------------------------------------------------------------------------- |
| Architecture          | 7.5     | 1x     | Module structure is sound; cross-module Prisma bypass is the main weakness    |
| Code Quality          | 7.5     | 1x     | Zero type violations, strong conventions; god files and i18n gaps exist       |
| Modularity            | 6.5     | 1x     | 58 well-structured modules but invisible data coupling undermines boundaries  |
| Backend Test Health   | 7.0     | 1.5x   | 7,785 passing tests, strong critical modules; pastoral/GDPR gaps              |
| Frontend Test Health  | 3.0     | 0.75x  | 337 pages with render-only E2E; functional regression not caught              |
| Worker Test Health    | 8.0     | 0.75x  | 100% processor coverage, CI-enforced; strong specs                            |
| Maintainability       | 7.0     | 1x     | Consistent conventions; god files and duplication in payroll                  |
| Reliability           | 8.5     | 2x     | Zero empty catches in backend; comprehensive health checks, DLQ monitoring    |
| Security              | 8.0     | 2x     | Defense-in-depth RLS, 3-layer brute force, AES-256-GCM; upload validation gap |
| Developer Experience  | 8.5     | 0.75x  | Docker Compose, turbo caching, lint-staged, 15+ CI scripts                    |
| Operational Readiness | 7.5     | 1x     | Mature deploy for single server; no log aggregation or migration rollback     |
| Refactor Safety       | 6.0     | —      | Strong in backend core; weak in frontend and pastoral/GDPR                    |
| **Overall Health**    | **7.5** | —      | Weighted average across all dimensions                                        |

**Weighted calculation:**
(8.0×2 + 8.5×2 + 7.5 + 6.5 + 7.5 + 7.0 + 7.0×1.5 + 3.0×0.75 + 8.0×0.75 + 8.5×0.75 + 7.5) / (2+2+1+1+1+1+1.5+0.75+0.75+0.75+1) = 94.1 / 12.75 = **7.38 → rounded to 7.5**

---

## 13. Final Verdict

**Is this monolith healthy?**
Yes. The fundamentals are strong — zero type violations, 9,197 passing tests, mature CI pipeline, defense-in-depth security, and comprehensive reliability infrastructure. This is above-average for a codebase of this size and complexity.

**Is it safe to scale?**
Conditionally. The single-server deployment with PM2 is a scaling bottleneck, but the PgBouncer + RLS architecture supports multi-tenant scale at the database layer. Adding tenants is safe. Adding servers requires containerization work.

**Is it safe to extend?**
Yes, with discipline. New modules should follow the established patterns (thin controllers, Zod DTOs, RLS transactions, ReadFacade for cross-module reads). The CI governance scripts enforce most conventions automatically.

**Is it safe to refactor?**
Partially. Backend core modules (auth, finance, payroll, behaviour) have strong test coverage and can be refactored with confidence. Pastoral, GDPR, and imports cannot. The frontend has almost no functional regression safety net. Cross-module Prisma coupling means schema changes require manual blast-radius analysis.

**What should be done first?**

1. Add RLS leakage tests for the top 10 tenant-scoped tables
2. Implement ReadFacade pattern for the 6 highest-exposure tables
3. Add GDPR service specs (ConsentService and DpaService are the priority)

---

## 14. Review Limitations

1. **Integration/e2e tests not executed** — Require live database and Playwright browser. Agent assessment is based on reading test code, not running it.
2. **Build not explicitly re-run** — Used turbo cache results. No fresh build failure was observed.
3. **RLS policy correctness not verified against live DB** — RLS policy SQL was read and structurally validated, but not executed against a running database.
4. **Frontend component rendering not verified** — Only code was read; no browser-based testing.
5. **Worker retry/backoff behavior not tested live** — Verified from configuration, not from runtime observation.
6. **Production deployment not observed** — Deploy script was read but not executed.
7. **Only a sample of files were read deeply** — 58 modules, 93 processors, 337 pages cannot all be read. High-risk areas were prioritized. Lower-risk modules may have undiscovered issues.
8. **Prisma schema too large to read fully** — 413KB, 265 models. RLS coverage was verified via grep and audit script, not by reading every model definition.
