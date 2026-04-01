# Master Audit Report — 2026-04-01_02-39-37

## 1. Executive Summary

This is a 412k-LOC multi-tenant school management SaaS with strong foundations and material gaps. Security is the brightest area — defense-in-depth RLS with near-complete coverage, robust auth, no raw SQL leakage, and mature GDPR infrastructure. The backend is well-structured with disciplined TypeScript (zero @ts-ignore in 412k LOC), consistent service patterns, and 7,190 passing tests. However, the system has critical operational gaps (CI doesn't gate deployment, backups are single-server, no automated rollback), significant test blind spots (safeguarding services untested, frontend functional tests near-zero, 67% of worker processors untested), and a monitoring hole in the worker service (no Sentry). The codebase is safe to extend in well-tested modules but not safe to refactor in under-tested critical paths without writing tests first.

---

## 2. System Overview

**Architecture**: NestJS modular monolith (56 modules), Next.js 14+ App Router frontend (336 pages), BullMQ worker service (87 processors, 31 cron jobs, 20 queues). Turborepo monorepo with shared packages.

**Scale**: 412,216 LOC production code, 601,790 LOC total (including 189k LOC tests). 264 Prisma models, 251 tenant-scoped. 3,353 TypeScript files.

**Stack**: Node 24, pnpm 9.15.4, PostgreSQL 16 with RLS, Redis 7, Meilisearch, PM2, Sentry.

**Deployment**: Single Hetzner server. GitHub Actions CI (lint + type-check + test + build). SSH-based deploy with flock mutex. PM2 process manager. No containers.

**Tenancy**: Two confirmed tenants pending onboarding. Full RLS isolation at database layer.

---

## 3. Shared Fact Pack Summary

| Metric                       | Value                           |
| ---------------------------- | ------------------------------- |
| Production LOC               | 412,216                         |
| Total LOC (with tests)       | 601,790                         |
| TypeScript files             | 3,353                           |
| Test files                   | 605                             |
| Backend modules              | 56                              |
| Worker processors            | 87                              |
| Frontend pages               | 336                             |
| Prisma models                | 264 (251 tenant-scoped)         |
| RLS-protected tables         | 248 (all tenant-scoped covered) |
| Lint errors                  | 0                               |
| Type-check errors            | 0                               |
| Total tests                  | 7,744                           |
| Test pass rate               | 100%                            |
| `@ts-ignore` count           | 0                               |
| `any`/`as any` in production | 15                              |
| Documented danger zones      | 36                              |

---

## 4. Build / Run / Test Findings

| Check              | Result                                    | Notes                                                  |
| ------------------ | ----------------------------------------- | ------------------------------------------------------ |
| `turbo lint`       | PASS                                      | 0 errors, 34 warnings (all import/order, auto-fixable) |
| `turbo type-check` | PASS                                      | All 7 packages clean                                   |
| Backend tests      | 529 suites, 7,190 tests, ALL PASS (17.6s) | No flakiness, no skipped tests                         |
| Worker tests       | 29 suites, 304 tests, ALL PASS (2.9s)     | Clean                                                  |
| Shared tests       | 13 suites, 250 tests, ALL PASS (5.5s)     | Includes scheduler stress tests                        |
| Integration tests  | NOT RUN IN CI                             | `homework.rls.spec.ts` excluded; no CI step            |
| E2E tests          | NOT RUN IN CI                             | 19 Playwright visual specs exist on disk only          |
| Code coverage      | NOT MEASURED                              | No jest coverage config                                |

**Key observation**: All automated tests pass cleanly with zero flakiness. The concern is not what's tested but what's NOT tested.

---

## 5. Test Health Assessment

### Backend: 7.0/10

Structurally sound. 7,190 tests with consistent patterns, proper NestJS TestingModule setup, typed mocks. Well-tested modules (behaviour, finance, scheduling, payroll, gradebook) have deep specs covering state machines, error paths, and edge cases. The auth spec is exemplary with 95 tests.

**Critical gaps**: No coverage measurement. 8,500+ LOC in critical services with zero tests (safeguarding concerns 1,068 LOC, safeguarding reporting 756 LOC, import executor 888 LOC, application state machine 426 LOC). Only ~6% of 248 RLS tables have cross-tenant isolation tests. 94% of error assertions verify exception class but not error code. 23 controller specs have 3 or fewer tests.

### Frontend: 2/10

Effectively untested for business logic. 336 pages with 31 test files (9.2% by count). All 19 E2E specs are visual screenshot comparisons — zero functional tests. 12 unit tests extract pure helper functions; no component rendering or interaction testing. The largest modules (behaviour, pastoral, sen, wellbeing) have zero frontend tests. Not in CI.

### Worker: 4/10

Where tests exist, quality is good — consistent patterns, tenant_id rejection, job routing guards. Base infrastructure well-tested. But 58 of 87 processors lack tests (67%). The untested set includes the highest-risk: evaluate-policy (674 LOC), gradebook-risk-detection (690 LOC), all 5 regulatory, all 3 import, all 3 payroll processors.

### Combined refactoring trust level

- Well-tested backend modules: **Safe to refactor with confidence**
- Safeguarding, imports, attendance controller, admissions state machine: **Write tests first**
- Frontend: **No automated safety net exists**
- Cross-cutting RLS changes: **Add integration tests first**

---

## 6. Module Health Matrix

See `Audit-Claude/module-health-matrix_2026-04-01_02-39-37.md` for the full table.

**Summary**: Of the 20 major modules assessed, 3 are high-risk (behaviour, pastoral, auth), 10 are medium-risk, and 7 are low-risk. Risk concentrates in the two largest modules (behaviour 25k LOC, pastoral 19k LOC) and the security-critical auth module.

---

## 7. Deep Dive: Highest-Risk Modules

### behaviour (25,291 LOC)

**Why it matters**: Handles incidents, sanctions, appeals, exclusions, safeguarding, recognition, policy evaluation, analytics, AI, documents, amendments, parent portal, and admin operations. 214 API endpoints. Largest module by 30%.

**Strengths**: Consistent RLS enforcement. Comprehensive state machine tests. Good test-to-source ratio (87%). Policy evaluation engine is well-architected with five-stage pipeline, idempotency, and cooldown mechanism.

**Weaknesses**: God module — 43 providers, 38 exports (88% ratio), 6+ bounded contexts in one NestJS module. safeguarding-concerns.service (1,068 LOC) and safeguarding-reporting.service (756 LOC) have zero tests. 26 empty catch blocks silently swallow queue-add failures. Puppeteer PDF generation runs inside DB transactions (DZ-19). 14 of 16 worker processors untested.

**Likely failure mode**: A Redis blip during incident creation silently prevents parent notification, policy evaluation, and award checking. The incident is saved but all automation is skipped with zero visibility.

**Remediation**: (1) Add logging to all catch blocks. (2) Write safeguarding specs immediately. (3) Extract into sub-modules.

### pastoral (19,369 LOC)

**Why it matters**: Full pastoral care system — concerns, cases, SST meetings, referrals, child protection liaison, check-ins, critical incidents, DSAR traversal.

**Strengths**: 73% test-to-source ratio. Well-structured with service-per-concern. Documented circular dependency with CP module.

**Weaknesses**: Non-atomic `shareConcernWithParent` (TOCTOU race). Escalation chain crash window (DZ-36). 7 of 8 worker processors untested. critical-incident.service (1,035 LOC) complexity with no test.

**Likely failure mode**: Worker crash between transaction commit and escalation re-enqueue silently terminates the pastoral escalation chain. Recovery takes up to 24 hours.

**Remediation**: (1) Fix non-atomic transaction. (2) Reduce escalation backstop interval. (3) Add worker processor tests.

### auth (1,410 LOC)

**Why it matters**: Security linchpin — login, JWT, MFA, sessions, brute force protection.

**Strengths**: Deep test coverage (95 tests). MFA with recovery codes. Brute force protection. Session management with bulk revocation.

**Weaknesses**: No global API rate limiting. Login logic duplicated between `login()` and `loginWithRecoveryCode()` (~140 lines). No global throttler guard.

**Likely failure mode**: Authenticated brute-force attack on non-rate-limited endpoints (any endpoint beyond login/admissions/contact).

**Remediation**: (1) Add @nestjs/throttler as global guard. (2) Extract shared login helper.

---

## 8. Cross-Cutting Architectural Risks

### 8.1 Operational: CI doesn't gate deployment (AUD-001)

CI and deploy are independent workflows. A merge to main deploys to production regardless of CI status. **This is the single highest-risk finding in this audit.** Combined with no automated rollback (AUD-002), a broken merge reaches production and stays there until manual SSH intervention.

### 8.2 Security: RLS policy catalogue fragmentation (AUD-025)

RLS policies are split across `policies.sql`, 26 `post_migrate.sql` files, and 3 inline `migration.sql` files. This made the audit's own RLS gap analysis initially "inconclusive." One real defect was found: `attendance_pattern_alerts` missing `FORCE ROW LEVEL SECURITY` (AUD-013).

### 8.3 Reliability: Worker monitoring blind spot (AUD-003 + AUD-012)

The worker has no Sentry integration and its health check is a stub. Combined, this means: worker processor failures are invisible, and a broken worker reports healthy. This affects 87 processors handling notifications, payroll, compliance, safeguarding escalation, and more.

### 8.4 Tests: Safety net has holes in the worst places (AUD-004 + AUD-007)

The untested code is concentrated in the highest-risk areas: safeguarding (child protection), GDPR erasure, imports (data integrity), and admissions state machine. Meanwhile, the RLS integration tests that protect the #1 architectural rule (tenant isolation) are excluded from CI.

### 8.5 Architecture: BehaviourModule structural debt (AUD-011)

At 25k LOC with 43 providers and 88% export ratio, BehaviourModule has no effective encapsulation. This doesn't break today, but it makes the module increasingly expensive to reason about, test, and safely modify as it grows.

### Danger Zone verification

The 36 documented danger zones in `architecture/danger-zones.md` were verified against current code by agents 1, 4, and 6. All documented dangers remain accurate. The architecture documentation is a genuine asset — its self-awareness of risks is itself a reliability feature.

---

## 9. Top 10 Most Important Issues

### 1. CI Does Not Gate Deployment (AUD-001)

- **Severity**: Critical | **Confidence**: High
- **Why**: Broken code reaches production
- **Evidence**: Two independent workflows, no `needs:` dependency
- **Agents**: 7
- **Fix**: Make deploy depend on CI, or enforce branch protection

### 2. Worker Has No Sentry Integration (AUD-003)

- **Severity**: High | **Confidence**: Certain
- **Why**: 87 processor failure modes invisible to monitoring
- **Evidence**: Zero Sentry imports in apps/worker/src/
- **Agents**: 6, 7
- **Fix**: Add instrument.ts to worker

### 3. 8,500+ LOC Critical Services Untested (AUD-004)

- **Severity**: High | **Confidence**: Certain
- **Why**: Safeguarding data errors have legal consequences
- **Evidence**: safeguarding-concerns (1,068), import-executor (888), safeguarding-reporting (756), application-state-machine (426) — zero specs
- **Agents**: 2
- **Fix**: Write specs for safeguarding first

### 4. No Automated Rollback on Deploy Failure (AUD-002)

- **Severity**: High | **Confidence**: High
- **Why**: Failed deploys leave broken code live
- **Evidence**: deploy.yml exits non-zero but doesn't revert
- **Agents**: 7
- **Fix**: Add rollback block to deploy script

### 5. Backups on Same Server Only (AUD-008)

- **Severity**: High | **Confidence**: High
- **Why**: Disk failure loses DB and all backups
- **Evidence**: /opt/edupod/backups/ on same server; drill script targets AWS not Hetzner
- **Agents**: 7
- **Fix**: Add off-site replication

### 6. No Code Coverage Measurement (AUD-006)

- **Severity**: High | **Confidence**: Certain
- **Why**: Impossible to know or enforce coverage
- **Evidence**: jest.config has zero coverage settings
- **Agents**: 2
- **Fix**: Add coverage thresholds

### 7. RLS Integration Tests Excluded from CI (AUD-007)

- **Severity**: High | **Confidence**: Certain
- **Why**: Multi-tenancy's security-critical tests never run
- **Evidence**: testPathIgnorePatterns excludes .rls.spec.ts; ~6% RLS table coverage
- **Agents**: 2, 4
- **Fix**: Run integration tests in CI

### 8. 621 Empty Catch Blocks (AUD-009)

- **Severity**: High | **Confidence**: Certain
- **Why**: Silent failures violate stated convention; production bugs invisible
- **Evidence**: 621 occurrences across 295 files; agents 1, 5, 6 all found this independently
- **Agents**: 1, 5, 6
- **Fix**: Add logging; add ESLint rule

### 9. Frontend Functional Tests Near-Zero (AUD-005)

- **Severity**: High | **Confidence**: High
- **Why**: 336 pages with no functional test coverage
- **Evidence**: All E2E are visual screenshots; zero interaction tests
- **Agents**: 3, 5
- **Fix**: Add Playwright functional tests for top 5 user flows

### 10. Worker Health Check is a Stub (AUD-012)

- **Severity**: Medium | **Confidence**: Certain
- **Why**: Broken worker reports healthy
- **Evidence**: 9-line controller, zero dependency checks
- **Agents**: 6
- **Fix**: Add Redis/Prisma/queue checks

---

## 10. Quick Wins (High Impact, Low Effort)

1. **Fix attendance_pattern_alerts FORCE RLS** — One migration, 5 minutes. Closes a real security gap.
2. **Add Sentry to worker** — Copy API's instrument.ts pattern. 30 minutes. Eliminates the monitoring blind spot.
3. **Add `app.enableShutdownHooks()` to worker** — One line. Prevents in-flight job interruption during deploys.
4. **Worker health check** — Add Redis ping + Prisma check. 30 minutes. Makes health probes meaningful.
5. **Make deploy depend on CI** — Change deploy.yml to reference CI as prerequisite job. 15 minutes.
6. **Add `console.error` to empty catch blocks** — Codemod across the repo. 1 hour. Eliminates silent failures.
7. **Add jest coverage config** — Set initial thresholds at current levels. 15 minutes.

---

## 11. Strategic Refactor Opportunities

### Phase 1: Operational Safety (Week 1-2)

**Prerequisites**: None

1. Gate deploy on CI (AUD-001)
2. Add automated rollback (AUD-002)
3. Add off-site backup replication (AUD-008)
4. Add Sentry to worker (AUD-003)
5. Fix worker shutdown hooks (AUD-015)

**Why first**: These are production safety issues. Everything else is wasted if a deploy breaks production with no recovery.

### Phase 2: Test Foundation (Week 3-6)

**Prerequisites**: Phase 1 (so you can safely deploy)

1. Write safeguarding service specs (AUD-004)
2. Add jest coverage measurement and thresholds (AUD-006)
3. Enable RLS integration tests in CI (AUD-007)
4. Write specs for top 10 untested worker processors (AUD-010)
5. Add systematic RLS smoke test for all 248 tables

**Why second**: Test gaps are the barrier to safe refactoring. Close the highest-risk gaps before touching architecture.

### Phase 3: Architecture Cleanup (Week 7-12)

**Prerequisites**: Phase 2 (so refactoring has a safety net)

1. Extract BehaviourModule into sub-modules (AUD-011)
2. Add explicit transition maps for payroll/payment/compliance (AUD-016)
3. Resolve forwardRef cycles (pastoral↔CP, comms↔GDPR)
4. Canonicalize RLS policies in policies.sql (AUD-025)
5. Fix empty catch blocks systematically (AUD-009)

**Why third**: Architecture changes need test coverage. Don't refactor a 25k LOC module without tests covering its critical paths.

### Phase 4: Frontend & DX (Week 13+)

**Prerequisites**: Phase 1

1. Add Playwright functional tests for top 5 flows (AUD-005)
2. Adopt react-hook-form in new forms (AUD-018)
3. Add centralized log aggregation (AUD-017)
4. Add shared package sub-path exports (AUD-026)

---

## 12. Scorecard

| Dimension             | Score   | Justification                                                                                                                                                                                         |
| --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture          | **7.5** | Sound modular monolith with excellent documentation. Deducted for god module (behaviour), forwardRef cycles, 100% export modules.                                                                     |
| Code Quality          | **7.5** | Outstanding type safety (0 ts-ignore in 412k LOC). 3 custom ESLint rules guard critical invariants. Deducted for 621 empty catches, react-hook-form non-adoption, auth duplication.                   |
| Modularity            | **6.5** | Clear split between well-bounded and unbounded modules. BehaviourModule's 88% export ratio and 5 modules at 100% exports drag this down.                                                              |
| Backend Test Health   | **7.0** | 7,190 tests, consistent patterns, deep specs in critical modules. Deducted for no coverage measurement, safeguarding untested, ~6% RLS coverage.                                                      |
| Frontend Test Health  | **2.0** | 336 pages, 31 test files, all E2E are visual-only. No functional tests. Largest modules untested.                                                                                                     |
| Worker Test Health    | **4.0** | 33% processor coverage. Good quality where present. Highest-risk processors untested.                                                                                                                 |
| Maintainability       | **7.0** | Consistent conventions, clean naming, architecture docs. Deducted for i18n gaps, form pattern inconsistency, large frontend files.                                                                    |
| Reliability           | **7.0** | Mature state machines, approval reconciliation, systematic retry/backoff. Deducted for worker Sentry gap, empty catches, stub health check, escalation crash window.                                  |
| Security              | **8.5** | Defense-in-depth RLS (3 layers), robust auth, no raw SQL leakage, GDPR infra. One FORCE RLS miss. No global rate limit.                                                                               |
| Developer Experience  | **8.0** | One-command setup, Docker Compose, demo seeding, Turborepo, comprehensive ops manual. Deducted for no E2E in CI, no Dockerfiles.                                                                      |
| Operational Readiness | **6.0** | Sentry, health checks, env validation, deploy lock. Severely deducted for: CI doesn't gate deploy, no rollback, same-server backups, no log aggregation, worker stub health.                          |
| Refactor Safety       | **5.5** | Safe in well-tested backend modules. Unsafe in safeguarding, frontend, workers. No coverage measurement.                                                                                              |
| **Overall Health**    | **6.8** | Weighted: Security(2x), Reliability(2x), Architecture(1x), Modularity(1x), Code Quality(1x), Maintainability(1x), Backend Tests(1.5x), Frontend Tests(0.75x), Worker Tests(0.75x), DX(0.75x), Ops(1x) |

### Overall Health Calculation

```
(8.5×2 + 7.0×2 + 7.5×1 + 6.5×1 + 7.5×1 + 7.0×1 + 7.0×1.5 + 2.0×0.75 + 4.0×0.75 + 8.0×0.75 + 6.0×1) / (2+2+1+1+1+1+1.5+0.75+0.75+0.75+1)
= (17 + 14 + 7.5 + 6.5 + 7.5 + 7.0 + 10.5 + 1.5 + 3.0 + 6.0 + 6.0) / 12.75
= 86.0 / 12.75
= 6.75 → 6.8
```

---

## 13. Final Verdict

**Is this monolith healthy?**
Mostly yes. The foundations are sound: strict TypeScript, comprehensive RLS, mature state machines, well-documented architecture, passing CI. The health score of 6.8 reflects genuine strength in security and code quality offset by operational gaps and test coverage holes.

**Is it safe to scale?**
For tenant count, yes — RLS isolation is comprehensive and the architecture supports multi-tenancy well. For team size, not without sub-module extraction of BehaviourModule and closing the test gaps.

**Is it safe to extend?**
Yes, in well-tested modules with clear boundaries (finance, scheduling, homework, sen). Not safely in the under-tested critical paths (safeguarding, imports, frontend).

**Is it safe to refactor?**
Partially. Backend refactoring in well-tested modules is safe. Refactoring safeguarding code, worker processors, or frontend pages has no automated safety net. Write tests before refactoring these areas.

**What should be done first?**

1. Gate deployment on CI (the most impactful 15-minute fix in this entire audit)
2. Add Sentry to worker
3. Add off-site backup replication
4. Write safeguarding service specs
5. Fix attendance_pattern_alerts FORCE RLS

---

## 14. Review Limitations

1. **No production runtime verification**: All analysis is static — code, config, and documentation only. Actual database state, server config, and runtime behavior were not verified.
2. **Frontend depth**: Agents inspected ~6 frontend files out of 336+ pages. Convention violations may be wider than detected.
3. **Worker processor sampling**: Only ~8 of 87 processors were deeply read. Reliability issues in unread processors may exist.
4. **RLS migration application**: RLS policies exist in the repo but deployment state cannot be verified from code alone. The `attendance_pattern_alerts` FORCE miss's real impact depends on whether the DB user is the table owner.
5. **Empty catch count discrepancy**: Agent 1 and 6 found 79 in API; Agent 5 found 621 across all apps. Different scope — both are accurate for their scope. The 621 figure includes frontend catches (27+).
6. **Security is static analysis only**: No penetration testing, no HTTP endpoint verification, no auth bypass testing was performed.
7. **The audit was conducted in a single session against a clean working tree on main branch**. Any in-flight feature branches were not assessed.
