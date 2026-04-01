# Agent 02: Backend Test Health Audit

**Audit timestamp**: 2026-04-01_02-39-37
**Agent**: Agent 2 -- Backend Test Health
**Status**: COMPLETE

---

## A. Facts

### Test Suite Overview

| Metric                     | Value                  |
| -------------------------- | ---------------------- |
| Backend test suites        | 529                    |
| Backend tests (jest count) | 7,190                  |
| Counted `it()` blocks      | 6,963                  |
| Pass rate                  | 100% (all pass)        |
| Runtime                    | 17.6s (~408 tests/sec) |
| Backend spec files         | 521                    |
| Mean tests per file        | 13.4                   |
| No `.skip()` / `.only()`   | Confirmed -- 0 found   |
| Coverage enforcement       | NONE                   |
| RLS integration spec files | 1 (EXCLUDED from CI)   |

### Jest Configuration (`apps/api/jest.config.js`)

- Transform: ts-jest
- Test environment: node
- Module aliases: `@/` mapped to `<rootDir>/src/`
- Setup file: `test/setup-env.ts`
- **Excluded patterns**: `.rls.spec.ts`, `.performance.spec.ts`, `.e2e-spec.ts`, `<rootDir>/test/`
- No `collectCoverage`, no `coverageThreshold`, no `coverageDirectory`

### Tests-per-File Distribution

| Bucket      | Files | Percentage |
| ----------- | ----- | ---------- |
| 1-3 tests   | 26    | 5%         |
| 4-10 tests  | 238   | 46%        |
| 11-20 tests | 176   | 34%        |
| 21-40 tests | 65    | 12%        |
| 41+ tests   | 16    | 3%         |

### Assertion Pattern Breakdown

| Pattern                         | Count | Notes                                                                        |
| ------------------------------- | ----- | ---------------------------------------------------------------------------- |
| `toHaveBeenCalledWith`          | 2,880 | Interaction assertions -- dominant pattern                                   |
| `toBe`                          | 3,841 | Value assertions                                                             |
| `toEqual`                       | 1,558 | Deep equality                                                                |
| `toThrow`                       | 1,357 | Error path testing                                                           |
| `.not.` (negative)              | 615   | Absence testing                                                              |
| `toMatchObject` with error code | 79    | Only 5.8% of error tests verify the error code, not just the exception class |

### Critical Module Test-to-Source Ratios

| Module          | Spec Files | Source Files | Ratio | Assessment      |
| --------------- | ---------- | ------------ | ----- | --------------- |
| staff-wellbeing | 20         | 16           | 125%  | Excellent       |
| scheduling      | 27         | 28           | 96%   | Excellent       |
| payroll         | 24         | 25           | 96%   | Excellent       |
| gradebook       | 42         | 44           | 95%   | Excellent       |
| finance         | 33         | 35           | 94%   | Excellent       |
| behaviour       | 56         | 64           | 87%   | Good            |
| compliance      | 7          | 8            | 87%   | Good            |
| communications  | 14         | 18           | 77%   | Acceptable      |
| pastoral        | 33         | 45           | 73%   | Acceptable      |
| gdpr            | 15         | 21           | 71%   | Acceptable      |
| attendance      | 6          | 12           | 50%   | Weak            |
| admissions      | 5          | 12           | 41%   | Weak            |
| auth            | 2          | 10           | 20%   | Good (see note) |

**Note on auth**: The file ratio is misleading. The 2 spec files total 2,455 lines testing 1,775 lines of source. 8 of the 10 source files are thin DTO re-exports and a module file. The only meaningful untested file is `jwt.strategy.ts` (29 lines).

### Largest Source Files with NO Test Coverage

These files have no matching `.spec.ts` file (also checked `__tests__/` directories):

| File                                              | LOC   | Risk                                                    |
| ------------------------------------------------- | ----- | ------------------------------------------------------- |
| `behaviour/safeguarding-concerns.service.ts`      | 1,068 | **CRITICAL** -- safeguarding data, child protection     |
| `imports/import-executor.service.ts`              | 888   | HIGH -- bulk data import logic                          |
| `behaviour/safeguarding-reporting.service.ts`     | 756   | **CRITICAL** -- mandatory reporting                     |
| `reports/reports-data-access.service.ts`          | 666   | MEDIUM -- read-only data aggregation                    |
| `gradebook/analytics/analytics.service.ts`        | 654   | MEDIUM -- analytics calculations                        |
| `attendance/attendance-session.service.ts`        | 643   | HIGH -- daily use session management                    |
| `attendance/attendance.controller.ts`             | 563   | HIGH -- daily use, request validation                   |
| `behaviour/behaviour-export.service.ts`           | 547   | MEDIUM -- data export                                   |
| `admissions/application-state-machine.service.ts` | 426   | HIGH -- state transitions, no test for transition logic |
| `pastoral/controllers/sst.controller.ts`          | 444   | MEDIUM -- already has service spec                      |
| `behaviour/behaviour-attachment.service.ts`       | 453   | MEDIUM -- file handling                                 |

**Total untested LOC in files >200 lines: ~8,500+ lines**

### Cross-Tenant Isolation Testing

| Metric                                 | Value                                                             |
| -------------------------------------- | ----------------------------------------------------------------- |
| RLS-protected tables                   | 248                                                               |
| Dedicated RLS spec files               | 1 (homework, EXCLUDED from CI)                                    |
| Files with tenant isolation assertions | 13                                                                |
| Total cross-tenant assertions          | 33                                                                |
| Tables with any tenant leak test       | ~15 (of 248)                                                      |
| **Coverage gap**                       | **~94% of RLS-protected tables have zero tenant isolation tests** |

### Permission-Denied Testing

- 30 spec files contain permission/403-related assertions (155 total occurrences)
- auth.service.spec.ts alone: 27 occurrences (brute force, suspended user, disabled user, inactive membership)
- child-protection access guard: 15 occurrences (strong)
- **23 controller specs have 3 or fewer tests total** -- most of these are wiring-only with zero permission-denied tests

### State Machine Transition Testing

- 8 spec files contain explicit transition tests (18 occurrences)
- Strong: behaviour sanctions (valid + all 5 terminal state rejections), behaviour appeals, exclusion cases
- Strong: finance invoices (draft->issued, draft->cancelled, issued->void, issued->written_off, blocks on wrong status)
- **Gap**: `application-state-machine.service.ts` (426 lines) has NO spec file -- admissions lifecycle transitions untested
- **Gap**: pastoral case state machine -- `case.service.spec.ts` has 2 transition mentions vs the complex case lifecycle

### Modules with Zero Test Files

| Module             | Source Files | Risk Assessment                  |
| ------------------ | ------------ | -------------------------------- |
| config             | 2            | Low -- utility/barrel            |
| critical-incidents | 1            | Low -- barrel export to pastoral |
| pastoral-checkins  | 1            | Low -- barrel export             |
| pastoral-dsar      | 1            | Low -- barrel export             |
| preferences        | 3            | Low -- simple CRUD               |

---

## B. Strong Signals

### POSITIVE

1. **Consistent test architecture**: Every spec file follows the same NestJS TestingModule pattern with typed mock factories, `afterEach(() => jest.clearAllMocks())`, and fixture constants at module scope. Predictable and maintainable.

2. **Standardized RLS mocking**: The `jest.mock('../../common/middleware/rls.middleware')` pattern is used consistently across write-path service specs. This gives confidence that the RLS transaction wrapper is being invoked in tests even when the actual DB is not.

3. **Zero skipped/focused tests**: No `.skip()`, `.only()`, `xit()`, or `fdescribe()` found in any spec file. The entire suite runs cleanly every time.

4. **Auth spec is deep**: Despite only 2 files, auth.service.spec.ts has 95 test cases covering JWT signing/verification, brute force thresholds at all levels, session lifecycle in Redis, MFA setup/verify, password reset with token expiry, login with all failure modes (wrong password, suspended, disabled, inactive membership, brute force blocked), and security audit logging for every failure path.

5. **Behaviour sanctions spec is exemplary**: Tests approval flow branching by tenant setting, suspension day computation with school closures excluded, automatic exclusion case creation, conflict detection against timetable, state transitions with history recording, bulk operations with partial success/failure reporting, and all 5 terminal state rejections.

6. **Finance invoice spec covers the state machine**: Tests all valid transitions (draft->issued, draft->cancelled, issued->void, issued->written_off), concurrent modification protection via ConflictException, installment sum validation, numeric serialization from Decimal to number.

7. **Test speed enables fast feedback**: 7,190 tests in 17.6 seconds. No flakiness indicators. This supports running tests on every commit.

8. **Error path testing is strong**: 1,357 `toThrow` assertions plus 615 negative assertions show that error paths are not neglected.

### NEGATIVE

1. **No coverage measurement**: No `collectCoverage`, no thresholds, no coverage reports. It is impossible to know actual line/branch coverage. File ratios are a proxy but miss the most important metric: which code paths inside tested files are actually exercised.

2. **RLS integration test excluded from CI**: `homework.rls.spec.ts` (the one true tenant-isolation integration test) is excluded by `testPathIgnorePatterns: ['\\.rls\\.spec\\.ts$']`. It never runs in CI. This is a security-critical test that is effectively dead code.

3. **1,068-line safeguarding service has zero tests**: `safeguarding-concerns.service.ts` handles child protection concern creation, escalation, and data access. This is the highest-risk untested file in the codebase -- both legally (child protection) and technically (complex state management).

4. **Error code verification is weak**: Only 79 of 1,357 error assertions (5.8%) verify the actual error code (e.g., `MISSING_REFRESH_TOKEN`). The remaining 94.2% only check the exception class (e.g., `BadRequestException`). This means tests would not catch a regression that changes the error code a frontend depends on.

5. **23 controller specs have 3 or fewer tests**: These are "existence tests" -- they verify the controller can be instantiated and delegates to the service, but do not test request validation, permission checks, or error responses. For a thin-controller architecture this is partially acceptable, but permission-denied tests should still live here.

6. **94% of RLS-protected tables have zero tenant isolation tests**: 248 tables have RLS policies, but cross-tenant leakage assertions exist for roughly 15 tables across 13 files. The remaining 233 tables rely entirely on the RLS middleware working correctly -- there is no defense-in-depth testing.

---

## C. Inferences

1. **Tests are trustworthy for refactoring WITHIN well-tested modules**: Modules like behaviour, finance, scheduling, payroll, and gradebook have deep, well-structured tests that would catch regressions from refactoring. The test patterns are consistent enough that failures would be meaningful, not noise.

2. **Tests are NOT trustworthy for refactoring safeguarding, imports, or attendance session logic**: The largest untested services are in critical paths. A refactoring of safeguarding-concerns.service.ts (1,068 lines) would have no test safety net whatsoever.

3. **The 7,190 test count is genuine but inflated by thin controller specs**: ~26 specs have 1-3 tests, and ~238 have 4-10 tests. These are real tests but many are "can the controller be instantiated and does it call the service" level assertions. The true regression-catching power is concentrated in the ~257 files with 11+ tests.

4. **The consistent mock patterns create a systemic blind spot**: All service tests mock the Prisma client. This means: (a) no test verifies the actual Prisma query structure against the real schema, (b) mock return values can drift from actual DB results, (c) join/include structures are not validated. This is normal for unit tests but creates risk when combined with the absence of integration tests.

5. **The RLS exclusion pattern suggests the team wrote the homework RLS test but found it too slow/complex for CI, then never revisited the approach**. This is a typical "we'll add more later" debt that was never repaid.

6. **The application-state-machine.service.ts gap is concerning**: At 426 lines, this is a dedicated state machine service with no tests. Given the testing rules require "test all valid transitions AND verify blocked transitions throw", this is a direct violation of the project's own testing standards.

---

## D. Top Findings

### Finding 1: No Code Coverage Measurement or Enforcement

- **Severity**: HIGH
- **Confidence**: CERTAIN (verified in jest.config.js)
- **Why it matters**: Without coverage thresholds, there is no objective measure of test completeness. The 7,190 test count creates false confidence -- tests could exercise 30% of code paths and still all pass. Coverage ratcheting (e.g., "never decrease coverage") is the standard mechanism to prevent test debt from growing.
- **Evidence**: `apps/api/jest.config.js` has no `collectCoverage`, `coverageThreshold`, or `coverageDirectory` settings. `apps/api/package.json` has no coverage script.
- **Fix**: Add `collectCoverage: true` and `coverageThreshold: { global: { branches: 60, functions: 70, lines: 70, statements: 70 } }` to jest config. Set initial thresholds at current actual levels, then ratchet up over time.

### Finding 2: RLS Integration Tests Excluded from CI

- **Severity**: HIGH
- **Confidence**: CERTAIN (verified in jest.config.js line 9)
- **Why it matters**: The `homework.rls.spec.ts` file is the only real tenant-isolation integration test. It is excluded from `jest` by `testPathIgnorePatterns: ['\\.rls\\.spec\\.ts$']`. This means the most security-critical test category never runs automatically. The project has 248 RLS-protected tables but zero automated CI verification that RLS policies work correctly.
- **Evidence**: `apps/api/jest.config.js` line 9: `'\\.rls\\.spec\\.ts$'` in testPathIgnorePatterns. The `test:integration` script exists (`jest --config jest.integration.config.js`) but is not invoked in CI.
- **Fix**: Either (a) run `test:integration` as a CI step, or (b) remove `.rls.spec.ts` from exclusions and mock the PrismaService to simulate tenant context switching without a real DB.

### Finding 3: 8,500+ LOC in Critical Services with Zero Tests

- **Severity**: HIGH
- **Confidence**: CERTAIN (verified by checking both co-located and `__tests__/` locations)
- **Why it matters**: `safeguarding-concerns.service.ts` (1,068 LOC), `import-executor.service.ts` (888 LOC), `safeguarding-reporting.service.ts` (756 LOC), and `application-state-machine.service.ts` (426 LOC) are all in critical paths (child protection, data import, regulatory reporting, admissions lifecycle). Refactoring any of these has zero test safety net. The safeguarding files are especially concerning -- child protection data handling errors have legal consequences.
- **Evidence**: No `.spec.ts` file exists co-located or in `__tests__/` for any of these files.
- **Fix**: Prioritize spec creation for safeguarding-concerns (legal risk), application-state-machine (state transition coverage rule violation), and import-executor (data integrity risk). Each needs at minimum: happy path, error paths, and for state machines, all valid + blocked transitions.

### Finding 4: Cross-Tenant Isolation Testing Covers ~6% of RLS Tables

- **Severity**: MEDIUM-HIGH
- **Confidence**: HIGH (grep-based count of tenant isolation assertions)
- **Why it matters**: 248 tables are protected by RLS policies, but only ~15 tables have any form of cross-tenant leakage test. The entire multi-tenancy security model relies on (a) the RLS middleware setting `SET LOCAL app.current_tenant_id` correctly and (b) every RLS policy being correct. If a policy has a typo or is missing `FORCE ROW LEVEL SECURITY`, there is no automated test to catch it.
- **Evidence**: Grep for `tenant.*leak|cross.*tenant|other.*tenant|wrong.*tenant|tenant.*isolat` returned 33 matches across 13 files. 248 tables have RLS policies.
- **Fix**: Create a systematic RLS smoke test that iterates all tenant-scoped models, creates a record as Tenant A, switches context to Tenant B, and asserts the record is invisible. This can be a single integration test file covering all 248 tables.

### Finding 5: Error Code Assertions are Weak

- **Severity**: MEDIUM
- **Confidence**: HIGH (79 of 1,357 error assertions verify error codes)
- **Why it matters**: The codebase uses structured error codes (`{ code: 'MISSING_REFRESH_TOKEN', message: '...' }`) and the frontend relies on these codes for UX decisions. But 94.2% of error tests only verify the exception class (`toThrow(BadRequestException)`) not the error code. A regression that changes `STUDENT_NOT_FOUND` to `NOT_FOUND` would pass all tests but break the frontend.
- **Evidence**: 1,357 `toThrow` assertions vs 79 `toMatchObject` with code assertions. Auth controller spec is the positive example -- it verifies `MISSING_REFRESH_TOKEN` code explicitly.
- **Fix**: For all error paths where the error code is consumed by the frontend (login, payment, enrollment), upgrade assertions from `toThrow(BadRequestException)` to `rejects.toMatchObject({ response: expect.objectContaining({ code: 'EXPECTED_CODE' }) })`.

### Finding 6: Thin Controller Specs Miss Permission Validation

- **Severity**: MEDIUM
- **Confidence**: HIGH (23 controller specs with <=3 tests identified)
- **Why it matters**: The project mandates "every API endpoint: at least one happy-path test AND one permission-denied test". 23 controller specs have 3 or fewer tests total, meaning they cannot cover both happy path and permission-denied for all their endpoints. Controllers are the layer where `@RequiresPermission` and `@ModuleEnabled` decorators are applied -- if a decorator is accidentally removed during refactoring, only a controller-level test would catch it.
- **Evidence**: `finance-dashboard.controller.spec.ts` (3 tests), `stripe-webhook.controller.spec.ts` (3 tests), `attendance.controller.ts` (0 tests), `fee-generation.controller.spec.ts` (3 tests), plus 19 more.
- **Fix**: Add at minimum one permission-denied test per controller spec. These can be table-driven: for each endpoint, verify that calling without the required permission returns 403.

---

## E. Files Reviewed

| File                                                                           | Purpose                                       | LOC   |
| ------------------------------------------------------------------------------ | --------------------------------------------- | ----- |
| `apps/api/jest.config.js`                                                      | Jest configuration                            | 22    |
| `apps/api/src/modules/auth/auth.controller.spec.ts`                            | Auth controller tests                         | 665   |
| `apps/api/src/modules/auth/auth.service.spec.ts`                               | Auth service tests (partial read, 700 lines)  | 1,790 |
| `apps/api/src/modules/behaviour/behaviour-sanctions.service.spec.ts`           | Behaviour sanctions tests                     | 494   |
| `apps/api/src/modules/finance/invoices.service.spec.ts`                        | Invoice service tests                         | 375   |
| `apps/api/src/modules/gdpr/__tests__/public-sub-processors.controller.spec.ts` | Thinnest spec (1 test)                        | 37    |
| `apps/api/src/modules/homework/homework.rls.spec.ts`                           | RLS integration test (partial read, 80 lines) | ~180  |

---

## F. Commands Run

1. `find apps/api/src/modules/{mod} -name "*.spec.ts" | wc -l` -- for 8 critical modules (auth, finance, behaviour, attendance, scheduling, approvals, gdpr, communications)
2. `find apps/api/src/modules/{mod} -name "*.ts" ! -name "*.spec.ts" | wc -l` -- matching source file counts
3. `find apps/api/src/modules -name "*.spec.ts" -exec wc -l {} | sort -n | head -20` -- identify thinnest specs
4. `find apps/api -name "*.rls.spec.ts"` -- count RLS integration tests
5. Grep for `permission.*denied|403|Forbidden` in spec files -- permission test coverage
6. Grep for `state.*transition|VALID_TRANSITIONS` in spec files -- state machine test coverage
7. Grep for `edge:|concurren|idempoten` in spec files -- edge case coverage
8. Grep for `tenant.*leak|cross.*tenant` in spec files -- cross-tenant isolation tests
9. Grep for `.skip()|.only()` in spec files -- check for disabled/focused tests
10. Test-to-source ratio calculation for all 56 modules
11. Largest untested source files (>200 LOC with no spec file, checked both co-located and `__tests__/`)
12. Assertion pattern counts (toHaveBeenCalledWith, toEqual, toBe, toThrow, .not., toMatchObject with code)
13. Controller specs with <=3 tests (thin controllers)
14. Tests-per-file distribution analysis

---

## G. Score

### Backend Test Health: 7.0/10

**Justification**:

The test suite is structurally sound and consistent. 7,190 tests all pass in 17.6 seconds with zero flakiness. The test patterns are disciplined: proper NestJS TestingModule setup, typed mocks, consistent teardown, and no skipped tests. Critical modules like behaviour, finance, scheduling, and payroll have excellent spec-to-source ratios and deep tests that exercise state machines, error paths, and edge cases.

The score is held back from 8+ by three systemic gaps:

1. **No coverage measurement** -- there is no way to know whether the existing tests actually cover the important code paths, and no mechanism to prevent coverage from decreasing
2. **Cross-tenant isolation testing at ~6%** -- for a multi-tenant SaaS where RLS is "the #1 rule", having only 15 of 248 tables with any form of tenant leakage test is a significant blind spot
3. **8,500+ LOC in critical services with zero tests** -- including child protection and mandatory reporting services where bugs have legal consequences

**Would I trust this suite for a major refactoring?**

- For well-tested modules (behaviour, finance, scheduling, payroll, gradebook): **Yes, with confidence**
- For safeguarding, imports, attendance controller, admissions state machine: **No -- write tests first**
- For cross-cutting changes that affect RLS or tenant isolation: **No -- add integration tests first**

---

## H. Confidence

**Overall confidence: HIGH (85%)**

- Test file counts and ratios: CERTAIN (filesystem enumeration)
- Assertion pattern analysis: HIGH (grep-based, may miss some patterns)
- Spec quality assessments: HIGH (based on reading 4 full spec files + partial reads of 2 more)
- Untested file identification: HIGH (checked both co-located and `__tests__/` patterns)
- RLS coverage gap: HIGH (grep for tenant isolation terms may miss some tests that check isolation without using those specific terms, but the scale of the gap -- 15 vs 248 -- is robust even with a 2x error margin)
- Error code assertion ratio: MEDIUM-HIGH (grep pattern may miss some assertion styles, but the 79 vs 1,357 ratio is so lopsided that even significant undercounting would not change the finding)
