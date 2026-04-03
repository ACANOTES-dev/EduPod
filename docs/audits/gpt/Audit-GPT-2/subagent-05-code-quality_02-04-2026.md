# A. Facts

- I used `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md` as the canonical baseline and did not repeat repo-wide lint, type-check, or debt scans.
- I reviewed three large backend hotspot files: `apps/api/src/modules/auth/auth.service.ts` (1,128 lines, targeted count found 24 public methods), `apps/api/src/modules/behaviour/behaviour.service.ts` (1,011 lines, 10 public methods), and `apps/api/src/modules/pastoral/services/pastoral-report.service.ts` (1,086 lines, 5 public methods).
- I reviewed two large frontend user-flow files: `apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx` (960 lines, 27 `React.useState` calls) and `apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx` (938 lines, 14 `React.useState` calls).
- I reviewed two medium-sized backend services for contrast: `apps/api/src/modules/attendance/attendance.service.ts` (377 lines, 14 public methods) and `apps/api/src/modules/reports/reports-data-access.service.ts` (669 lines, 49 public methods).
- Backend safety rules are enforced much more strongly than maintainability rules. `packages/eslint-config/nest.js:7-9` makes `school/max-public-methods` a warning but `school/no-sequential-transaction` and `school/no-raw-sql-outside-rls` errors. `packages/eslint-config/next.js:7-9` makes `school/no-hand-rolled-forms` and `school/no-untranslated-strings` warnings, while `school/no-physical-css-direction` is an error.
- `packages/eslint-config/rules/no-empty-catch.js:17-29` only flags truly empty catch blocks, not catch blocks that swallow errors with fallback state or `void err`.
- `packages/shared/src/behaviour/state-machine.ts:37-44` exposes a shared `projectIncidentStatus()` helper, but `apps/api/src/modules/behaviour/behaviour.service.ts:431-439` and `:506-517` still inline that projection logic.

# B. Strong Signals

- The codebase has real defensive discipline around the most dangerous backend failure modes. `no-sequential-transaction` and `no-raw-sql-outside-rls` are the right rules to enforce at error level in this architecture.
- `apps/api/src/modules/attendance/attendance.service.ts:25-36` is a good example of maintainability-minded decomposition: it documents ownership clearly, delegates session/locking/reporting concerns, and keeps only the core write path local.
- `apps/api/src/modules/reports/reports-data-access.service.ts:6-33` is a meaningful architectural improvement over ad hoc cross-module reads. It gives the reports/dashboard layer one obvious place to update when foreign-table schemas move.
- `apps/api/src/modules/behaviour/behaviour.service.ts` is still large, but it is more controlled than the worst hotspots because it delegates scope, history, and side effects to dedicated collaborators (`:55-61`) and stays under the public-method budget.
- `apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx` shows much stronger convention adherence than the appeal page: translations are pervasive, logical directional classes are used, and error paths log with context before toasting.

# C. Inferences

- Maintainability debt is concentrated rather than universal. The repo contains good patterns, but a small set of very large hotspot files still sets the effective change cost.
- Tooling is currently optimized to prevent catastrophic backend mistakes, not to stop steady readability and complexity drift in large services and frontend workflows.
- Frontend convention drift is more tolerated than backend drift. The repo has custom rules for forms and i18n, but they are warning-only and heuristic, so large pages can remain out of policy without blocking delivery.
- The architecture is moving in the right direction in some areas (`AttendanceService`, `ReportsDataAccessService`), but the remediation is uneven: newer seams coexist with very large all-in-one auth/report/workflow files.

# D. Top Findings

## 1. AuthService is still a security-critical god service beyond the repo's own maintainability budget

**Severity:** High  
**Confidence:** High

**Why it matters:**  
Security changes now require editing a single file that mixes token work, Redis session CRUD, brute-force protection, login, refresh, password reset, MFA, tenant switching, and session administration. That raises review burden and regression risk in the highest-stakes module.

**Evidence:**  
`apps/api/src/modules/auth/auth.service.ts:83-198` handles token/session/brute-force concerns, `:202-582` handles login/refresh/password reset, and `:585-990` handles MFA, tenant switching, and session listing/revocation. Constructor injections at `:76-80` also drift from the repo's normal `private readonly` pattern used in healthier services like `AttendanceService`. `packages/eslint-config/nest.js:7` sets a public-method budget of 15 as a warning, while the targeted method-count command found 24 public methods in this class.

**Fix direction:**  
Split token/session, password-recovery, MFA, and membership/session-query responsibilities into focused services. Keep `AuthService` as a thin composition facade and normalize constructor fields to `private readonly`.

## 2. AppealDetailPage is a bilingual workflow with translation drift, silent catch behavior, and heavy hand-rolled state

**Severity:** High  
**Confidence:** High

**Why it matters:**  
This is an important behaviour workflow in a bilingual product, but the page interleaves untranslated UI copy, API side effects, and local workflow state. That increases refactor friction and makes regressions in UX, i18n, and error handling more likely.

**Evidence:**  
`apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx:223-246` carries 14 local state cells. Raw English toasts appear at `:260`, `:307-310`, `:318`, `:336-339`, `:347`, `:356-373`. Untranslated labels and placeholders appear at `:425`, `:473`, `:518`, `:544-563`, `:588-592`, `:621`, `:666-709`, `:730-800`, and `:835-867`. Background-fetch catches at `:259-283` swallow failures by only resetting local state, with no `console.error` context.

**Fix direction:**  
Break the page into reviewer, hearing, decision, and withdraw form components backed by `react-hook-form` and shared mutation helpers. Route all user-facing text through `t()`, and require background fetch failures to log context before falling back state.

## 3. The custom lint rules are strongest where the architecture is most fragile, but too soft and too shallow where maintainability drifts in practice

**Severity:** High  
**Confidence:** High

**Why it matters:**  
The repo has explicit maintainability conventions for class size, forms, translations, and error handling, but the current rule setup mostly observes those problems instead of preventing them. That lets large debt-heavy files accumulate while still shipping.

**Evidence:**  
`packages/eslint-config/nest.js:6-10` and `packages/eslint-config/next.js:6-9` keep `max-lines`, `school/max-public-methods`, `school/no-hand-rolled-forms`, and `school/no-untranslated-strings` at warning level. `packages/eslint-config/rules/no-hand-rolled-forms.js:17-27,76-105` only reports when it sees both form-like state names and a literal `onSubmit`/`handleSubmit`, so multi-action pages like `AppealDetailPage` and `SupportPlanDetailPage` can evade it. `packages/eslint-config/rules/no-empty-catch.js:17-29` only flags empty bodies, which means `apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx:273-283` and `apps/api/src/modules/attendance/attendance.service.ts:250-260` pass lint despite hiding operational detail.

**Fix direction:**  
Promote the most important maintainability rules to errors in the affected apps, widen `no-hand-rolled-forms` so it does not depend on `handleSubmit` naming, and change catch enforcement from "non-empty block" to "must log/toast/structured-log".

## 4. PastoralReportService is a report factory hotspot with repeated analytics and audit boilerplate

**Severity:** Medium  
**Confidence:** High

**Why it matters:**  
Adding or adjusting reports means editing a 1k-line service that repeats date-range setup, aggregation loops, and audit event emission. That increases copy-paste risk and makes testing/report evolution slower than it should be.

**Evidence:**  
Five report generators live in one class at `apps/api/src/modules/pastoral/services/pastoral-report.service.ts:214-406`, `:411-615`, `:619-742`, `:746-913`, and `:917-1085`. The same audit-write pattern is repeated at `:393-405`, `:601-613`, `:724-739`, `:895-910`, and `:1067-1082`. Placeholder or editorial values are embedded directly in output at `:675-696` and `:1041-1042`, which mixes product debt with reporting logic.

**Fix direction:**  
Split the service by report family or metric domain, extract shared audit/date-range helpers, and move placeholder/policy sourcing behind dedicated adapters so the report layer stays analytical rather than editorial.

## 5. ReportsDataAccessService is a healthy module-boundary seam, but it gives up too much type safety

**Severity:** Medium  
**Confidence:** High

**Why it matters:**  
Centralizing cross-module reads is a net maintainability win, but returning `unknown[]` and `unknown | null` forces consumers to recover type information manually. That weakens compile-time protection during refactors and schema evolution.

**Evidence:**  
`apps/api/src/modules/reports/reports-data-access.service.ts:6-33` clearly documents the boundary it is creating, but many methods return `Promise<unknown[]>` or `Promise<unknown | null>` at `:86`, `:100`, `:147`, `:181`, `:219`, `:259`, `:275`, `:316`, `:359`, `:379`, `:391`, `:415`, `:429`, `:448`, `:495`, `:508`, `:532`, `:548`, `:560`, `:567`, `:581`, `:595`, `:608`, `:625`, and `:638`. The file also uses repeated `as unknown as ...` casts at `:118`, `:166`, `:239`, `:304`, `:336`, and `:478`. The targeted method-count command found 49 public methods, so its interface is already large enough that strong typing matters.

**Fix direction:**  
Keep the facade, but move to generic typed selects and narrow result interfaces so callers preserve Prisma-derived types instead of widening to `unknown`.

## 6. BehaviourService duplicates the safeguarding status projection rule instead of calling the shared helper designed to keep it consistent

**Severity:** Medium  
**Confidence:** High

**Why it matters:**  
This is a maintainability and confidentiality rule. Duplicating sensitive projection logic inline makes future behavior changes easier to miss, which is exactly the class of drift the danger-zone guidance is trying to prevent.

**Evidence:**  
`packages/shared/src/behaviour/state-machine.ts:37-44` exposes `projectIncidentStatus()`. `architecture/danger-zones.md` DZ-13 says new surfaces should call that helper. `apps/api/src/modules/behaviour/behaviour.service.ts:431-439` and `:506-517` re-implement the same `converted_to_safeguarding` projection manually instead of importing the shared function.

**Fix direction:**  
Replace inline projection logic in the behaviour service and adjacent surfaces with `projectIncidentStatus()`, then centralize any related sensitive-field stripping nearby so the rule has one obvious maintenance point.

# E. Files Reviewed

## Canonical and architecture context

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/CLAUDE.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/context.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md`

## Backend hotspots

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/services/pastoral-report.service.ts`

## Frontend user flows

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx`

## Contrast services

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/attendance/attendance.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/reports/reports-data-access.service.ts`

## Lint and supporting source

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/index.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/nest.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/next.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/max-public-methods.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/no-cross-module-internal-import.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/no-empty-catch.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/no-hand-rolled-forms.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/no-physical-css-direction.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/no-raw-sql-outside-rls.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/no-sequential-transaction.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/no-untranslated-strings.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/shared/src/behaviour/state-machine.ts`

# F. Additional Commands Run

- Targeted `sed -n` reads of the fact pack, architecture/context docs, ESLint config, and rule files.
- `find packages/eslint-config/rules -maxdepth 1 -type f | sort` to inventory the local custom rule set.
- Targeted `wc -l` loops over candidate backend/frontend files to choose representative hotspots and healthier contrast files.
- Targeted `rg -n` searches for `catch`, `toast`, `useState`, `useTranslations`, `projectIncidentStatus`, and custom-rule registration/severity.
- `nl -ba ... | sed -n ...` reads on selected files to capture line-specific evidence for the report.
- Focused counting commands: `rg -o 'React.useState' ... | wc -l` and `rg -n '^  async ' ... | wc -l` for state/method-budget comparisons.
- No additional repo-wide lint, type-check, or test runs were performed; the fact pack remained the canonical source for those repo-wide results.

# G. Score

- Anchor: `1` = actively unsafe/unmaintainable, `5` = mixed and friction-heavy, `10` = exemplary and easy to change.
- **Code quality: 6/10.** The repo shows strong backend safety discipline, clear naming conventions in many files, and real architectural cleanup work in places like attendance orchestration and reports data access.
- **Maintainability: 5/10.** Hotspot services and workflow pages are still too large, too stateful, and too dependent on warning-only lint for policy enforcement, so change cost remains high in auth, reporting, and rich frontend flows.

# H. Confidence in this review

- **Confidence:** Medium-High.
- This review is evidence-backed from the canonical fact pack, required architecture context, seven representative source files, the full custom rule inventory, and targeted supporting config/helper files.
- It is still a targeted maintainability review rather than a whole-repo file-by-file audit, so the confidence is not absolute.
