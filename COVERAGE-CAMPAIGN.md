# Coverage Campaign: Branch Coverage 77% to 90%

**Date**: 2026-04-05
**Status**: In progress — resumed locally after Round 3

---

## Parallel Session Protocol

To reduce shared-file collisions during the remaining push to 90%, the repo now includes a lightweight lock system:

- Command entrypoint: `pnpm coverage:lock`
- Tracker folder: `coverage-locks/`
- Usage guide: `coverage-locks/README.md`
- Prompt templates: `coverage-locks/SESSION-PROMPTS.md`

Use locks only for shared files or shared scopes. Module-owned files should still be edited without locks.

**Core commands:**

```bash
pnpm coverage:lock acquire --target apps/api/src/common/middleware/rls.middleware.ts --session behaviour-r4 --module behaviour --reason "shared RLS mock" --wait
pnpm coverage:lock heartbeat --target apps/api/src/common/middleware/rls.middleware.ts --session behaviour-r4
pnpm coverage:lock release --target apps/api/src/common/middleware/rls.middleware.ts --session behaviour-r4
pnpm coverage:lock status
pnpm coverage:lock cleanup
```

**Protocol:**

1. Own your module first.
2. Acquire a lock before touching any file outside your module.
3. Refresh the lock every 60-90 seconds while still editing that shared file.
4. Release immediately when done.
5. Reclaim or clean up stale locks after TTL expiry if a session dies mid-edit.

---

## Progress Summary

| Metric         | Before | Current | Target | Gap                     |
| -------------- | ------ | ------- | ------ | ----------------------- |
| **Statements** | 90.85% | 96.27%  | —      | —                       |
| **Branches**   | 76.75% | 84.10%  | 90.00% | 5.90pp (1,423 branches) |
| **Functions**  | 87.58% | 95.41%  | —      | —                       |
| **Lines**      | 91.30% | 96.71%  | —      | —                       |

- **Branches covered**: 18,730 → 20,539 (+1,809 new branches)
- **Tests added**: ~1,500+ new test cases across 119 spec files (+41,131 lines)
- **Tests passing**: 14,502 / 14,537 (35 failures in 4 suites — see below)

---

## What Was Done

### Round 4 — targeted manual follow-up (local, 2026-04-05)

Focused on fast branch wins outside the original multi-agent waves:

- Added a brand-new spec for `apps/api/src/common/middleware/tenant-resolution.middleware.spec.ts`
- Added new coverage cases in:
  - `apps/api/src/modules/configuration/key-rotation.service.spec.ts`
  - `apps/api/src/modules/classes/class-assignments.service.spec.ts`
  - `apps/api/src/modules/behaviour/behaviour-admin.service.spec.ts`
  - `apps/api/src/modules/imports/import-validation.service.spec.ts`
  - `apps/api/src/modules/staff-wellbeing/services/workload-metrics.service.spec.ts`
- Added brand-new read-facade specs for:
  - `apps/api/src/modules/staff-profiles/staff-profile-read.facade.spec.ts`
  - `apps/api/src/modules/staff-availability/staff-availability-read.facade.spec.ts`
  - `apps/api/src/modules/staff-preferences/staff-preferences-read.facade.spec.ts`

**Verified targeted branch results from focused coverage runs:**

| File                              | Before snapshot | Targeted run after Round 4 |
| --------------------------------- | --------------- | -------------------------- |
| `tenant-resolution.middleware.ts` | 0.0%            | 93.47%                     |
| `key-rotation.service.ts`         | 39.39%          | 91.17%                     |
| `class-assignments.service.ts`    | 68.62%          | 92.15%                     |
| `behaviour-admin.service.ts`      | 80.81%\*        | 88.96%                     |
| `import-validation.service.ts`    | 83.33%          | 85.55%                     |
| `workload-metrics.service.ts`     | 77.77%          | 78.78%                     |
| `staff-profile-read.facade.ts`    | 18.75%          | 93.75%                     |

\*The campaign summary referenced module-level behaviour coverage; the file-level baseline came from the API coverage snapshot.

**What this changed strategically:**

- Confirmed that some of the easiest remaining wins are outside the original top-15 module table
- Proved that low-setup read facades and middleware can still contribute meaningful branch gains
- Reduced the number of totally or near-totally uncovered “infrastructure” files that drag the global branch metric down disproportionately

### Round 1 — 15 parallel agents (all completed)

One agent per module for the top 15 modules by missing branches. All completed successfully.

| Module                                            | Before        | After R1     | Tests Added |
| ------------------------------------------------- | ------------- | ------------ | ----------- |
| behaviour                                         | 65.0%         | 73.8%        | ~120        |
| pastoral                                          | 73.5%         | 79.6%        | ~145        |
| gradebook                                         | 70.5%         | 73.0%        | ~108        |
| scheduling                                        | 76.0%         | 85.0%        | ~108        |
| finance                                           | 76.1%         | 84.8%        | ~170        |
| payroll                                           | 73.9%         | 87.6%        | ~55         |
| imports                                           | 78.1%         | 85.3%        | ~105        |
| reports                                           | 81.6%         | 85.9%        | ~105        |
| staff-wellbeing                                   | 73.7%         | 83.4%        | ~113        |
| regulatory                                        | 77.3%         | 85.3%        | ~75         |
| sen                                               | 77.7%         | 89.6%        | ~27         |
| attendance                                        | 81.6%         | 84.7%        | ~47         |
| engagement                                        | 78.4%         | 85.8%        | ~54         |
| homework + pdf-rendering                          | 82.6% / 81.7% | 84.1% / ~95% | ~150        |
| early-warning + compliance + safeguarding + comms | various       | various      | ~70         |

### Round 2 — 6 parallel agents (all hit rate limits mid-execution)

Targeted the same modules with files still having gaps. Each agent made 25-57 tool calls before hitting rate limits. Partial progress was made.

### Round 3 — 5 parallel agents (2 completed, 3 still running when paused)

Focused specifically on service files (skipping controllers whose remaining branches are NestJS decorator metadata at ~75% ceiling).

**Completed:**

- **gradebook R3**: +71 tests. report-card-generation 65.7% → 100%, transcript 42% → 100%
- **pastoral R3**: +97 tests across 11 service files

**Still running when paused (may have written files):**

- behaviour R3
- scheduling + finance + reports + payroll R3
- remaining 11 modules R3

---

## Failing Tests (4 suites, 35 tests)

These were introduced by Round 3 agents that were still running. Must be fixed before proceeding.

1. **`src/modules/reports/compliance-report-branches.spec.ts`** — likely a new file from the remaining-modules agent
2. **`src/modules/configuration/key-rotation.service.spec.ts`** — likely from remaining-modules agent
3. **`src/modules/classes/class-assignments.service.spec.ts`** — likely from remaining-modules agent
4. **`src/modules/behaviour/behaviour-admin.service.spec.ts`** — likely from behaviour R3 agent

**Fix strategy**: Read each failing test, diagnose the error, fix the mock setup or assertion.

---

## Remaining Work to Reach 90%

### 1. Fix the 4 failing test suites

Priority: immediate. These block all further measurement.

### 2. Cover ~1,423 more branches

Current: 84.10% (20,539/24,420). Need: 90% (21,978). Gap: 1,439 branches.

**Remaining per-module gaps (top 15):**

| Module          | Current % | Missing | Key files                                                                                        |
| --------------- | --------- | ------- | ------------------------------------------------------------------------------------------------ |
| behaviour       | 80.9%     | 556     | sanctions-crud, document, exclusion-cases, guardian-restrictions, award, points, parent, helpers |
| pastoral        | 81.9%     | 459     | controllers (concerns, reports, referrals, incidents), import, notification                      |
| gradebook       | 80.4%     | 445     | controllers (4 files at ~76% ceiling), facade                                                    |
| scheduling      | 86.7%     | 161     | enhanced controller (37), substitution (14), facade (11)                                         |
| finance         | 86.4%     | 152     | enhanced controller (20), fee-assignments (15), recurring-invoices (13)                          |
| reports         | 86.4%     | 119     | enhanced controller (16), data-access (14), ai-narrator (9)                                      |
| imports         | 85.6%     | 112     | validation (31), executor (25), service (25), parser (17)                                        |
| attendance      | 84.7%     | 106     | controller (23), file-parser (19)                                                                |
| regulatory      | 85.3%     | 103     | controller (34), des (17)                                                                        |
| staff-wellbeing | 83.7%     | 100     | workload-metrics (22), survey-results (11)                                                       |
| homework        | 84.4%     | 93      | analytics controller (21), parent (9)                                                            |
| payroll         | 89.8%     | 93      | enhanced controller (16), class-delivery (12)                                                    |
| engagement      | 85.8%     | 82      | analytics controller (10), parent-events controller (9)                                          |
| early-warning   | 86.9%     | 80      | signal collectors (14, 12, 10)                                                                   |
| safeguarding    | 85.3%     | 79      | concerns service (27), controller (18)                                                           |

### 3. The controller ceiling problem

Many controllers are at ~75% branch coverage. The remaining ~25% is NestJS decorator metadata (`@Controller`, `@Get`, `@Post`, `@UseGuards`, `@RequiresPermission`) that Istanbul counts as branches but cannot be exercised in unit tests. This is approximately **400-500 branches** across all controllers.

**Implication**: Of the 3,881 missing branches, ~400-500 are structurally unreachable in unit tests. The practical ceiling from unit tests alone is approximately **92-93%**, so 90% is achievable but requires covering nearly all remaining service-file branches.

### 4. Strategy for remaining work

1. Fix the 4 failing test suites
2. Run another wave of agents for behaviour (556 missing), pastoral (459), and gradebook (445) — these three alone have 1,460 missing branches
3. Run agents for the mid-tier modules (scheduling through staff-wellbeing — ~750 missing)
4. Re-measure coverage
5. If still below 90%, target the specific service files with >10 missing branches
6. Ratchet `jest.config.js` thresholds to (measured - 2%)
7. Run `turbo test` and `pnpm lint` to verify

### 4a. Best next manual targets after Round 4

These came from focused local coverage runs or the snapshot and still look like strong manual-follow-up candidates:

- `apps/api/src/modules/imports/import-executor.service.ts`
- `apps/api/src/modules/imports/import.service.ts`
- `apps/api/src/modules/staff-wellbeing/services/workload-metrics.service.ts`
- `apps/api/src/modules/attendance/attendance-file-parser.service.ts`
- `apps/api/src/modules/class-requirements/class-requirements.service.ts`
- `apps/api/src/modules/safeguarding/safeguarding-concerns.service.ts`
- `apps/api/src/modules/pastoral/services/pastoral-import.service.ts`

### 4b. Additional read-facade sweep candidates

The `staff-profile-read.facade.ts` win suggests there may still be cheap coverage available in small cross-module read facades. Check these before diving into heavier domain services:

- `apps/api/src/modules/staff-availability/staff-availability-read.facade.ts`
- `apps/api/src/modules/staff-preferences/staff-preferences-read.facade.ts`
- Other `*-read.facade.ts` files that show low coverage but no dedicated spec

### 5. Ratchet thresholds

Once branches hit 90%, update `apps/api/jest.config.js`:

```js
coverageThreshold: {
  global: {
    statements: Math.floor(measured_stmts - 2),  // currently would be 94
    branches: Math.floor(measured_branches - 2),  // target 88
    functions: Math.floor(measured_fns - 2),      // currently would be 93
    lines: Math.floor(measured_lines - 2),        // currently would be 94
  },
},
```

---

## Lessons Learned

1. **Round 1 was most effective** — fresh agents on untouched modules yielded ~1,269 branches from ~1,200 tests
2. **Controllers have a ~75% ceiling** in unit tests due to NestJS decorator branches — focus agents on service files
3. **Agent rate limits** interrupted Round 2. Budget for this or reduce parallelism.
4. **Common agent mistakes**: timezone-dependent date assertions, incorrect `expect.objectContaining` nesting, trying to create empty XLSX workbooks (library throws), using Zod-invalid values to test service-level guards
5. **5-10% of agent-written tests need manual fixes** — incorrect mock shapes, unused variables, missing non-null assertions
6. **Facade files** (read facades) have low coverage because of optional parameter spread branches — each `if (options.select)` etc. is a branch. These are easy wins.
7. **Infrastructure files were under-targeted** — `tenant-resolution.middleware.ts` and `key-rotation.service.ts` turned out to be better branch wins than some mid-complexity domain services.
