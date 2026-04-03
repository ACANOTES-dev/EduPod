# Backend Test Health Audit

## A. Facts

- Fact pack baseline: `cd apps/api && pnpm test` produced `558` passing suites, `1` failing suite, `7,734` passing tests, and `7` failing tests. The only failing backend unit suite is `apps/api/src/modules/school-closures/school-closures.service.spec.ts`.
- The fact pack identifies the failure pattern as missing mocks for `attendanceSession.updateMany`, `yearGroup.findMany`, and `class.findMany` in the `school-closures` service spec.
- API Jest is unit-spec focused, not full-stack by default. `apps/api/jest.config.js` matches only `.spec.ts`, ignores `.e2e-spec.ts`, `.rls.spec.ts`, `.performance.spec.ts`, and `/test/`, and sets `collectCoverage: false` even though global thresholds exist.
- The repo-wide fact pack does not expose per-module statement coverage. "Best-tested" and "worst-tested" below therefore use a combination of module spec density and sampled spec depth, not measured per-module coverage percentages.
- Using a quick module density pass over `apps/api/src/modules`, the strongest important module by test density is `auth` at roughly `1,432` non-spec TS lines versus `2,723` spec lines, with `97` tests in `auth.service.spec.ts` and `28` in `auth.controller.spec.ts`.
- Using the same pass, the weakest important module by test density is `finance` at roughly `7,275` non-spec TS lines versus `5,693` spec lines, the lowest ratio among the important modules sampled from the fact-pack risk list.
- No top-tier auth, finance, permissions, or attendance suite is currently failing. The failing backend module is `school-closures`, which is attendance-adjacent rather than a primary security or finance linchpin.
- There are no `it.skip` or `it.todo` markers under `apps/api/src/modules`; the fact pack's skip/todo markers are in API e2e tests, not backend unit specs.
- Strong service spec reviewed: `apps/api/src/modules/auth/auth.service.spec.ts`.
- Weak or superficial service spec reviewed: `apps/api/src/modules/finance/payments.service.spec.ts`.
- Controller spec reviewed: `apps/api/src/modules/auth/auth.controller.spec.ts`.
- Critical-module specs reviewed: `auth.service.spec.ts` and `finance/payments.service.spec.ts`.
- Failing evidence pair reviewed: `apps/api/src/modules/school-closures/school-closures.service.spec.ts` and `apps/api/src/modules/school-closures/school-closures.service.ts`.

## B. Strong Signals

- `auth.service.spec.ts` is a genuinely strong unit suite. It checks JWT encode/decode behavior, Redis session indexing and cleanup, brute-force thresholds, tenant membership and tenant-status gates, MFA setup and verification, password reset flows, session revocation, and tenant switching. It asserts outputs and security side effects, not just call counts.
- `auth.controller.spec.ts` is stronger than a typical thin-controller suite. It verifies `httpOnly` refresh-cookie behavior, omission of `refresh_token` from response bodies, forwarded-IP parsing, recovery-code login cookie handling, and graceful logout behavior when refresh tokens are absent or invalid.
- `sequence.service.spec.ts` is another good signal for smaller infrastructure pieces. It checks tenant isolation, `FOR UPDATE` locking intent, format edge cases, and error handling rather than only happy-path string formatting.
- Even the failing `school-closures.service.spec.ts` has useful scenario breadth on paper: scope validation, date-range generation, skipped-duplicate handling, pagination, and attendance side-effect counts are all enumerated.
- The backend unit suite has breadth. The fact-pack run shows only one failing backend suite out of `559`, and there are no skipped/todo unit tests in `apps/api/src/modules`.

## C. Inferences

- Backend tests are trustworthy for contained refactors inside `auth` and a handful of smaller infra-style services where behavior assertions are rich and branch coverage is explicit.
- Backend tests are not trustworthy as a sole safety net for high-risk transactional refactors in `finance`. The sampled finance specs cover list/find/basic validation paths better than the money-moving transaction paths.
- The current `school-closures` failure is more a mock-contract drift problem than clear evidence of a production behavior bug. That matters because it weakens the suite's signal quality during refactors: a red test here no longer cleanly means "the behavior broke."
- Controller coverage is decent, but controller specs do not compensate for shallow service coverage in stateful modules. Transport confidence is not the same as business-logic confidence.
- Overall trust level is mixed, not poor. This is not a test desert. It is an uneven suite with strong islands and important blind spots.

## D. Top Findings

### 1. Finance transaction paths are under-tested relative to their risk

Severity: Critical
Confidence: High
Why it matters: Finance is one of the fact pack's highest-risk backend areas, but the sampled tests are lightest exactly where correctness matters most: allocation locking, balance enforcement, cross-entity side effects, and receipt creation. That means a refactor can preserve the easy list/find cases while breaking money movement or invoice balance integrity without an obvious failing unit test.
Evidence: `apps/api/src/modules/finance/payments.service.spec.ts` covers `findAll`, `findOne`, `createManual`, `suggestAllocations`, and `getAcceptingStaff`, but `confirmAllocations` only has two negative tests at `:218` and `:229`. The production method at `apps/api/src/modules/finance/payments.service.ts:266` is the real risk center and includes row-locking SQL, over-allocation checks, household mismatch checks, invoice balance recalculation at `:370`, and conditional receipt generation at `:378`. Module-level density is also the weakest among important modules reviewed: about `7,275` non-spec lines versus `5,693` spec lines.
Fix direction: Add focused tests around successful `confirmAllocations`, over-allocation, household mismatch, duplicate receipt prevention, invoice rebalance calls, and transaction-aware side effects. Prefer either transaction-faithful unit doubles or targeted integration tests for the locking path.

### 2. The only failing backend suite is failing because its mocks no longer match the service contract

Severity: High
Confidence: High
Why it matters: A failing suite lowers trust in the whole backend safety net, but this specific failure is especially damaging because it is mostly testing harness drift. That makes red/green outcomes less reliable as refactor feedback.
Evidence: The fact pack and raw log show all `7` failing backend tests come from `apps/api/src/modules/school-closures/school-closures.service.spec.ts`. The suite-level RLS mock returns an empty transaction object at `school-closures.service.spec.ts:11`, and the typed Prisma mock only defines `yearGroup.findFirst` at `:37` and `:55`. The service now calls `yearGroup.findMany` and `class.findMany` in `apps/api/src/modules/school-closures/school-closures.service.ts:204` and `:210`, and calls `attendanceSession.updateMany` through the RLS transaction at `:419`. The failure log points exactly at that `updateMany` access.
Fix direction: Replace ad hoc mock shapes with a single Prisma mock builder that includes the service's full collaborator surface, and ensure the RLS transaction mock passes a transaction object with the same methods the service uses. After that, keep the scenario matrix but tighten assertions around real side effects.

### 3. Local API test runs do not surface coverage regressions by default

Severity: Medium
Confidence: High
Why it matters: The repo does have coverage thresholds, but a normal local unit run can go green without showing that a risky change reduced effective guardrails. In a repo this large, that makes it easier to overestimate refactor safety.
Evidence: `apps/api/jest.config.js` uses `testRegex` for `.spec.ts` at `:5`, ignores e2e/rls/performance tests at `:6`, sets `collectCoverage: false` at `:21`, and defines thresholds only at `:26`. The fact pack separately confirms there is a CI coverage gate, so the gap is specifically local feedback, not the total absence of coverage policy.
Fix direction: Keep full coverage enforcement in CI, but add a cheap local path for changed-package or changed-file coverage checks on risky modules such as `auth`, `finance`, `attendance`, and `approvals`.

### 4. There are small but real flakiness indicators in otherwise strong backend specs

Severity: Low
Confidence: Medium
Why it matters: These are not currently the dominant quality problem, but they do make the suite slightly noisier and less deterministic than it needs to be, especially during repeated local runs or environment changes.
Evidence: `auth.service.spec.ts` uses real-time expiry waits with `setTimeout` at `:231` and `:986`. `sequence.service.spec.ts` relies on current-date formatting in multiple tests and mocks the global `Date` constructor in month-format edge cases around `:275`, `:290`, `:305`, and `:320`.
Fix direction: Prefer fake timers and an injected clock where practical, and keep random/date-dependent assertions deterministic.

## E. Files Reviewed

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/Audit-GPT-2/commands-run_02-04-2026.txt`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/CLAUDE.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/context.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/module-blast-radius.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/jest.config.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.controller.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/payments.service.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/payments.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/finance/invoices.service.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/sequence/sequence.service.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/sequence/sequence.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/scheduling/cover-teacher.service.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/scheduling/cover-teacher.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/school-closures/school-closures.service.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/school-closures/school-closures.controller.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/school-closures/school-closures.service.ts`

## F. Additional Commands Run

- `sed -n '1,260p' .../fact-pack_02-04-2026.md`
- `sed -n '1,220p' .../CLAUDE.md`
- `sed -n '1,260p' .../Plans/context.md`
- `sed -n '1,260p' .../architecture/danger-zones.md`
- `sed -n '1,260p' .../architecture/module-blast-radius.md`
- `sed -n '1,260p' .../apps/api/jest.config.js`
- `rg -n "coverage|school-closures|pnpm test|coverageThreshold" .../commands-run_02-04-2026.txt`
- `find .../apps/api/src/modules \\( -name '*service.spec.ts' -o -name '*controller.spec.ts' \\)`
- `node - <<'NODE' ...` to compute module source-line/spec-line density across `apps/api/src/modules`
- `wc -l` on representative spec and service files
- `rg -c '\\bit\\('` and `rg -o 'expect\\('` on representative specs
- `sed -n` and `rg -n` on selected auth, finance, sequence, scheduling, and school-closures files for line-anchored evidence
- `rg -n "it\\.skip|it\\.todo|describe\\.skip|describe\\.todo" apps/api/src/modules`

## G. Score

`6/10`

This backend suite is usable for careful refactoring, especially inside `auth` and smaller infrastructure services, but it is not strong enough to trust blindly for high-risk transactional work. The current `school-closures` red suite and the shallow finance transaction coverage keep it out of the "safe default guardrail" range.

## H. Confidence in this review

`Medium-High`

Confidence is high on the named strong/weak samples, the module ranking call (`auth` strongest important module, `finance` weakest important module), and the diagnosis of the current `school-closures` failure. Confidence is lower than full-repo certainty because this was a targeted audit with representative file reads, not a line-by-line review of every backend spec.
