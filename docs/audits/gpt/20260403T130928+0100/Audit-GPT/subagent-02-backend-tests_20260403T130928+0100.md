# A. Facts

- Canonical baseline from the fact pack: `apps/api` unit tests passed `567` suites, `7,785` tests, and `9` snapshots in `42.093s`; no failing suites, no open-handle warnings, and no forced-exit warnings were observed.
- Backend Jest is configured to run only `*.spec.ts` files and explicitly ignores `.rls.spec.ts`, `.performance.spec.ts`, `.e2e-spec.ts`, and `apps/api/test/`; coverage is disabled by default and the global thresholds are `76` statements, `57` branches, `78` functions, `77` lines. See `apps/api/jest.config.js:5-31`.
- Existing repo coverage artifacts are present under `apps/api/coverage/`, but because Jest has no `collectCoverageFrom`, those percentages are directional rather than guaranteed full-source coverage.
- Best-tested important backend module from the available repo signals: `scheduling`.
  Source/spec density from repo scan: `28` source files, `27` spec files.
  Existing coverage artifact: `27` covered files, `93.6%` statements, `77.2%` branches, `84.9%` functions.
- Worst-tested important backend module from the available repo signals: `payroll`.
  Source/spec density from repo scan: `25` source files, `24` spec files.
  Existing coverage artifact: `24` covered files, `68.5%` statements, `50.0%` branches, `68.1%` functions.
- Critical module with failing tests: none observed in the canonical backend run.
- Strong service spec reviewed: `apps/api/src/modules/auth/auth.service.spec.ts`.
- Weak or superficial service spec reviewed: `apps/api/src/modules/payroll/payroll-calendar.service.spec.ts`.
- Additional weak high-risk service sample reviewed: `apps/api/src/modules/payroll/payroll-runs.service.spec.ts` against `apps/api/src/modules/payroll/payroll-runs.service.ts`.
- Controller spec reviewed: `apps/api/src/modules/approvals/approval-requests.controller.spec.ts`.
- Critical-domain specs reviewed: `apps/api/src/modules/attendance/attendance.service.spec.ts` and `apps/api/src/modules/finance/payments.service.spec.ts`.
- No `.skip`, `.todo`, `xit`, `xtest`, or `xdescribe` markers were found under `apps/api/src/modules`.

# B. Strong Signals

- `auth.service.spec.ts` is a real characterization suite, not just a smoke test. It covers login happy path, sanitization, audit logging, tenant membership, MFA, brute-force throttling, IP throttling, account lockout, and outward error-code consistency. See `apps/api/src/modules/auth/auth.service.spec.ts:524-920` and `apps/api/src/modules/auth/auth.service.spec.ts:1762-1998`.
- `attendance.service.spec.ts` has strong regression-catching value because it asserts business rules and side effects, not just return shapes. It covers workday boundaries, closure overrides, state-machine constraints, enrolment validation, record upserts, parent notifications, teacher filtering, and daily-summary recalculation. See `apps/api/src/modules/attendance/attendance.service.spec.ts:535-779`, `apps/api/src/modules/attendance/attendance.service.spec.ts:783-1018`, and `apps/api/src/modules/attendance/attendance.service.spec.ts:1330-1647`.
- `payments.service.spec.ts` hits important failure modes in a critical finance path: FIFO allocation, household mismatch, over-allocation, concurrent status drift during lock, receipt idempotency, and exact-money boundaries. See `apps/api/src/modules/finance/payments.service.spec.ts:219-514`.
- `approval-requests.controller.spec.ts` is a clean thin-controller adapter test. It verifies tenant/user/comment mapping and request-shaping with low ceremony. See `apps/api/src/modules/approvals/approval-requests.controller.spec.ts:73-179`.
- `scheduling` looks broad rather than lucky. A quick sanity sample in `scheduler-orchestration.service.spec.ts` shows prerequisite validation, missing-configuration handling, double-booking detection, and active-run conflict coverage on top of the strong module-wide density.

# C. Inferences

- Backend tests are selectively trustworthy for refactoring. I would trust them for targeted work inside well-characterized slices such as core auth flows, attendance write paths, payment allocation logic, and much of scheduling. I would not trust them for sweeping backend refactors across payroll or across multiple modules without first adding tests.
- Assertion quality is strongest where specs verify side effects, state transitions, and structured error codes. `auth`, `attendance`, and `payments` do this well.
- Happy-path bias exists, but it is not uniform. Several critical service specs intentionally cover negative paths. The bigger problem is uneven depth between modules, not a repo-wide lack of failure-path testing.
- Mock quality is mixed. `attendance` and `auth` build useful transaction-aware mocks; `payments` uses substring-based raw SQL mocks that protect business logic but would not catch query-shape drift; controller specs intentionally bypass the transport stack.
- Immediate flakiness signals are low because the canonical run was clean and there are no skipped/todo specs in module tests. The softer risk is weak determinism in some date/time tests, where assertions are broad instead of clock-controlled.
- Coverage numbers should not be treated as full-backend truth. The current setup can make a module look safer than it is if files are never loaded into the coverage run.

# D. Top Findings

## 1. Title: Coverage governance overstates certainty

Severity: High
Confidence: High
Why it matters: The current coverage setup can pass while still leaving untouched backend files outside the measured universe. That weakens one of the main signals people use to decide whether refactoring is safe.
Evidence: `apps/api/jest.config.js:21-31` defines thresholds but has no `collectCoverageFrom`. `apps/api/package.json:14-17` runs plain `jest --coverage` and a `coverage:modules` script with `--coverageReporters=json`. `scripts/coverage-by-module.ts:61-74` expects `coverage-summary.json`, but the current `apps/api/coverage/coverage-summary.json` contains only an empty `total` object. `scripts/check-test-coverage-gate.sh:1-33` claims to block low-coverage changes, but in practice only checks whether matching spec files changed. Existing artifact partiality is visible in module counts, for example `auth` has `16` source files but only `2` covered files in the current coverage artifact.
Fix direction: Add `collectCoverageFrom` for backend source files, make the module-report script consume `coverage-final.json` or emit `json-summary`, and either implement a real coverage gate or rename the current gate so it does not imply stronger protection than it provides.

## 2. Title: Payroll is the least trustworthy important module for refactoring

Severity: High
Confidence: High
Why it matters: Payroll is a production-critical domain for this product, but the highest-risk orchestration paths are not characterized deeply enough to make refactors comfortable.
Evidence: The existing artifact shows only `68.5%` statements and `50.0%` branches for the payroll module. `apps/api/src/modules/payroll/payroll-runs.service.ts:56-898` exposes at least ten public methods, including `updateRun`, `refreshEntries`, queue dispatch/status methods, approval routing, and successful finalisation. `apps/api/src/modules/payroll/payroll-runs.service.spec.ts:106-399` exercises only `createRun`, a few `finalise` rejection paths, and `cancelRun`; it leaves `listRuns`, `listEntries`, `getRun`, `updateRun`, `refreshEntries`, successful finalisation, approval-required finalisation, queue dispatch, and status polling largely unpinned. The current artifact puts `payroll-runs.service.ts` at `46.7%` statements, `30.0%` branches, `47.8%` functions. The sampled `apps/api/src/modules/payroll/payroll-calendar.service.spec.ts:89-105` is also low-signal, using real-clock shape checks instead of exact boundary assertions.
Fix direction: Add focused service specs for successful finalisation, approval-required finalisation, optimistic concurrency in `updateRun`, entry refresh add/update behavior, queue dispatch and status reads, total calculation, and payslip generation. Freeze time in payroll calendar tests and assert exact results around month rollover, pay-date-equals-today, leap years, and overdue deadlines.

## 3. Title: Controller unit specs are useful but weak at catching endpoint regressions

Severity: Medium
Confidence: High
Why it matters: Direct controller invocation protects argument mapping, but not route decorators, guards, pipes, parsing, or Zod validation behavior. A route-level regression can slip through while controller unit specs stay green.
Evidence: `apps/api/src/modules/approvals/approval-requests.controller.spec.ts:58-66` overrides both guards, and `apps/api/src/modules/approvals/approval-requests.controller.spec.ts:73-179` calls controller methods directly and only asserts service calls and mapped parameters. `apps/api/jest.config.js:6-12` excludes e2e specs from the unit suite, so that missing transport-layer coverage is not compensated for inside normal unit runs.
Fix direction: Keep thin controller unit specs, but add or expand integration coverage for permission denials, validation failures, and route contract behavior on the most sensitive endpoints.

## 4. Title: The suite has strong characterization anchors, but they are concentrated rather than uniform

Severity: Medium
Confidence: Medium-High
Why it matters: The backend is not globally under-tested, but its protection is uneven. Treating the whole suite as uniformly trustworthy would be too optimistic; treating it as uniformly weak would also miss real strengths.
Evidence: `apps/api/src/modules/auth/auth.service.spec.ts:533-920` and `apps/api/src/modules/auth/auth.service.spec.ts:1762-1998` strongly characterize auth behavior and outward error semantics. `apps/api/src/modules/attendance/attendance.service.spec.ts:535-779`, `apps/api/src/modules/attendance/attendance.service.spec.ts:783-1018`, and `apps/api/src/modules/attendance/attendance.service.spec.ts:1330-1647` strongly characterize attendance rules and side effects. `apps/api/src/modules/finance/payments.service.spec.ts:219-514` gives useful protection to payment allocation flows. The contrast with payroll shows that trust depends heavily on module and service selection.
Fix direction: Use the auth/attendance/payments style as the template for missing areas: assert state transitions, side effects, concurrency behavior, and error codes, not just returned shapes.

# E. Files Reviewed

- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/commands-run_20260403T130928+0100.txt`
- `/Users/ram/Desktop/SDB/apps/api/jest.config.js`
- `/Users/ram/Desktop/SDB/apps/api/package.json`
- `/Users/ram/Desktop/SDB/.github/workflows/ci.yml`
- `/Users/ram/Desktop/SDB/scripts/coverage-by-module.ts`
- `/Users/ram/Desktop/SDB/scripts/check-test-coverage-gate.sh`
- `/Users/ram/Desktop/SDB/apps/api/coverage/coverage-final.json`
- `/Users/ram/Desktop/SDB/apps/api/coverage/coverage-summary.json`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth.service.spec.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/payroll/payroll-calendar.service.spec.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/payroll/payroll-calendar.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/payroll/payroll-runs.service.spec.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/payroll/payroll-runs.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/approvals/approval-requests.controller.spec.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/attendance/attendance.service.spec.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/attendance/attendance.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/finance/payments.service.spec.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/finance/payments.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/scheduling/scheduler-orchestration.service.spec.ts`

# F. Additional Commands Run

- `sed -n '1,220p' /Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md`
- `sed -n '1,260p' /Users/ram/Desktop/SDB/apps/api/jest.config.js`
- `sed -n '1,240p' /Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/commands-run_20260403T130928+0100.txt`
- `rg --files /Users/ram/Desktop/SDB/apps/api/src/modules/... | rg '\\.spec\\.ts$'` for payroll, auth, attendance, approvals, finance, and scheduling
- `rg -n '\\b(it|test|describe)\\.(skip|todo)|\\b(xit|xtest|xdescribe)\\b' /Users/ram/Desktop/SDB/apps/api/src/modules`
- Node aggregation over `/Users/ram/Desktop/SDB/apps/api/coverage/coverage-final.json` to compute per-module and per-file coverage, plus covered-file counts versus source/spec counts
- `rg -n 'collectCoverageFrom|--coverage|coverageThreshold|test:coverage|coverage:modules'` across `apps/api`, `.github/workflows`, and root/package manifests
- `sed -n` and `nl -ba` reads for sampled source/spec files listed above

# G. Score

Refactor-trust score: 6/10 for targeted backend refactors, not for broad backend rewrites.

# H. Confidence in this review

Medium-high. I am confident in the sampled conclusions about `auth`, `attendance`, `payments`, controller-test limits, and the payroll gap. I am less than fully confident in any whole-backend percentage claim because I intentionally did not rerun the suite and the current coverage setup does not prove that every backend source file is inside the measured coverage universe.
