# Subagent 05 - Code Quality And Maintainability Review

## A. Facts

- I loaded `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/fact-pack_2026-04-01_02-39-13.md` first and treated it as the canonical baseline for hotspot selection and repo-wide context.
- `wc -l` on the sampled hotspot files returned:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts`: `1336`
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/services/concern.service.ts`: `1274`
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-students.service.ts`: `1230`
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/sen/reports/page.tsx`: `1247`
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx`: `1119`
- `WorkloadComputeService` describes itself as a "Thin facade" at lines 146-149 of `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts`, but the same file contains public methods at lines 165, 265, 340, 452, 552, 610, 701, 811, 908, 1008, and 1041, plus helper blocks from 1066 onward and backward-compat static delegation starting at 1247.
- `ConcernService` in `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/services/concern.service.ts` injects Prisma, versioning, event logging, permission cache, and two queues at lines 141-147. Its public methods span create/list/get/update/escalate/share/unshare/categories/acknowledge at lines 152, 342, 441, 526, 599, 664, 736, 848, 906, and 916, with helper methods continuing through line 1257.
- `BehaviourStudentsService` in `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-students.service.ts` exposes list/profile/timeline/points/tasks/preview/analytics/sanctions/interventions/awards/AI/parent-view methods at lines 83, 185, 245, 300, 317, 355, 372, 418, 482, 563, 620, and 632, with analytics helpers from 797 onward.
- `BehaviourStudentsService` executes tagged raw SQL with `this.prisma.$queryRaw` at lines 806-811 of `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-students.service.ts`.
- `ClassesService` in `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/classes/classes.service.ts` has a smaller public surface: `create`, `findAll`, `findOne`, `update`, `updateStatus`, `findStaff`, `assignStaff`, `removeStaff`, `preview`, and `assertExists` at lines 44, 135, 180, 236, 310, 334, 370, 401, 440, and 519.
- `StudentsService` in `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/students/students.service.ts` defines an explicit `VALID_STUDENT_TRANSITIONS` map at lines 21-29 and keeps local query/result types at the top of the file.
- `AttendanceService` in `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/attendance/attendance.service.ts` documents itself as a thin facade split across subordinate services at lines 25-35 and delegates many methods directly at lines 48-130.
- `GuardianRestrictionsPage` in `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx` keeps 28 local `useState` variables plus a timeout ref in one component at lines 208-261.
- `GuardianRestrictionsPage` mixes translated strings (`t('title')`, `t('description')`, `t('addRestriction')`) with hardcoded English UI strings, including `"Restriction Type"`, `"All Types"`, `"All Statuses"`, `"No restrictions found"`, `"Previous"`, `"Next"`, `"Add Guardian Restriction"`, `"Search student by name..."`, `"Create Restriction"`, `"Restriction Details"`, and `"Revoke Restriction"` at lines 521-547, 652-683, 714-717, 749-900, 910-1101.
- `GuardianRestrictionsPage` uses logical direction classes such as `border-s-4`, `text-start`, `start-3`, `ps-9`, and `me-1` at lines 568, 758, 745, 750, 600, 630, and 1055.
- `SenReportsPage` in `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/sen/reports/page.tsx` hardcodes `toLocaleDateString('en-IE')` at lines 191-197 and derives user-facing labels with `humanise()` at lines 200-201 and later render sites such as 310, 332, 385, 503, 514, 534, 539, 618, 917, 974, 1064, and 1072.
- `SenReportsPage` repeats academic-year loading logic in `NcseReturnTab` at lines 213-224 and `ResourceUtilisationTab` at lines 585-596.
- `rg -n "useForm|zodResolver|react-hook-form"` against the two reviewed frontend files returned no matches.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/nest.js` enables `school/no-sequential-transaction` and `school/no-raw-sql-outside-rls` as errors at lines 1-8, and `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/.eslintrc.js` extends that config at lines 1-8.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/next.js` enables `school/no-physical-css-direction` at lines 1-7, and `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/.eslintrc.js` extends that config at lines 1-8.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/no-raw-sql-outside-rls.js` only reports `$executeRawUnsafe` and `$queryRawUnsafe` at lines 32-38.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/index.js` keeps `import/order` and `no-console` at warning level at lines 13-21.
- Silent or near-silent catches exist in the reviewed sample:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx`: lines 284-286, 311, 340, 399-400
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/attendance/attendance.service.ts`: lines 250-260
- Logged best-effort failure handling also exists in the sample:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/services/concern.service.ts`: lines 973-978
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/sen/reports/page.tsx`: repeated `console.error(...)` patterns at lines 221-222, 236-238, 423-424, 593-610, 803-805, and 1053-1055

## B. Strong Signals

- Naming, file/class alignment, exception shapes, and section-divider usage are mostly consistent in the reviewed backend sample.
- Maintainability risk is concentrated in very large hotspot files that still combine multiple responsibilities even after some delegation work.
- The healthier backend services show that the codebase already has lower-friction patterns available: explicit transition maps, narrower public APIs, and facade/delegation boundaries.
- Frontend hotspot pages are more centralized than the backend comparison files, with larger local state surfaces and more manual orchestration.
- RTL class discipline is stronger than i18n content discipline in the reviewed frontend sample.
- The custom ESLint rules do enforce a few important architecture rules, but they do not yet cover several drift vectors that are visible in the sampled files.

## C. Inferences

- Refactors in the sampled hotspot backend services will require care because query logic, mapping, orchestration, and side effects are co-located inside the same files.
- Frontend change cost is likely being driven more by component shape than by raw feature complexity on the sampled screens; too much logic lives in one page component at once.
- CI can pass while some architecture rules are already drifting in practice, because the written project rules are broader than the actual rule implementations.
- The repository appears more maintainable in its mid-sized backend services than in its hotspot pages/services, so the main issue is uneven adoption of good patterns rather than a total absence of them.

## D. Top Findings

### 1. Hotspot backend services still operate as multi-responsibility control centers

- Severity: High
- Confidence: High
- Why it matters: Large services that combine querying, orchestration, projections, analytics, queueing, and compatibility layers are expensive to change safely. They increase review burden and make local edits harder to isolate.
- Evidence:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts` is 1,336 LOC and, despite the "Thin facade" comment at lines 146-149, still owns many public entry points (165, 265, 340, 452, 552, 610, 701, 811, 908, 1008, 1041), helper algorithms (1066-1244), and static backward-compat delegation (1247-1259).
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/services/concern.service.ts` is 1,274 LOC, injects six collaborators including two queues (141-147), and spans create/list/get/update/escalate/share/unshare/categories/acknowledge plus mapping and permission helpers (152-1257).
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-students.service.ts` is 1,230 LOC and combines list/profile/timeline/tasks/preview/analytics/sanctions/interventions/awards/AI/parent-view methods (83-632) with analytics helpers (797-1211).
- Fix direction: Split these files along stable seams that are already visible in the code: read-model/query services, analytics calculators, parent-facing projection builders, and audit/queue side-effect coordinators. Keep one thin orchestrator per feature surface rather than one control-center file per domain.

### 2. Frontend hotspot pages are over-centralized and manual-state heavy

- Severity: High
- Confidence: High
- Why it matters: Large client components are harder to test, harder to reason about under change, and more likely to regress because view state, network state, and workflow state are tightly coupled.
- Evidence:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx` is 1,119 LOC and keeps 28 local `useState` slots plus a timer ref in one component (208-261). It handles list fetch, search debounce, guardian lookup, create flow, detail view, revoke flow, mobile rendering, and table rendering in the same file (265-1108).
  - The same file uses hand-rolled form state for create/revoke flows (245-250, 360-385, 415-430), and `rg -n "useForm|zodResolver|react-hook-form"` found no matches in either reviewed frontend file.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/sen/reports/page.tsx` is 1,247 LOC and embeds five tab components plus the main page in one file (206-1260), with repeated load/error patterns and repeated academic-year bootstrapping (213-224, 585-596).
- Fix direction: Extract page-local hooks and components around each user flow: list data hook, student lookup hook, guardian lookup hook, create form, revoke sheet, and per-tab report loaders. For any new or touched forms, move to `react-hook-form` with shared Zod schemas from `@school/shared`.

### 3. I18n discipline is inconsistent on important school-facing screens

- Severity: High
- Confidence: High
- Why it matters: This product explicitly supports English and Arabic. Hardcoded English labels and locale-specific formatting inside major screens increase change cost and create uneven multilingual behavior even when RTL layout classes are correct.
- Evidence:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/sen/reports/page.tsx` hardcodes `toLocaleDateString('en-IE')` at 191-197 and uses `humanise()` to derive user-facing English labels at 200-201 and many rendering sites such as 310, 332, 385, 503, 514, 534, 539, 618, 917, 974, 1064, and 1072.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx` mixes translation keys (`208`, `621-631`) with raw English copy at 521-547, 578, 652-683, 714-717, 749-900, and 910-1101.
  - The guardian page uses logical direction classes (`border-s-4`, `text-start`, `start-3`, `ps-9`, `me-1` at 568, 758, 745, 750, 600, 630, 1055), so the remaining issue is content/localization rather than RTL layout plumbing.
- Fix direction: Move human-facing labels, statuses, placeholders, and date formatting behind translation and locale utilities. Replace `humanise()` for user-visible values with translated lookup maps or server-provided display labels, and format dates against the active locale instead of a fixed `'en-IE'`.

### 4. Error-handling policy is not consistently applied, especially in UI background flows

- Severity: Medium
- Confidence: High
- Why it matters: Silent failure paths make production issues harder to diagnose because the app degrades into empty states or stale views without surfacing useful signals to developers or operators.
- Evidence:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx` resets list state on fetch failure without logging (284-286), swallows student search failure (311), swallows guardian lookup failure into an empty list (340), and converts detail fetch failure into `null` without telemetry (399-400).
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/attendance/attendance.service.ts` swallows parent notification failure with `void err` and no logging at lines 250-260.
  - Contrast: `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/services/concern.service.ts` treats acknowledge as best-effort but still logs the error with context at lines 973-978.
- Fix direction: Apply the stated error-handling rule consistently. Background fetches should log with context, and non-blocking backend side effects should at least emit structured warning/error logs. Avoid silent recovery unless it is explicitly intentional and documented in place.

### 5. Custom lint rules are useful but do not fully enforce project policy

- Severity: High
- Confidence: High
- Why it matters: CI passing should mean the architecture rules were honored. If rule coverage is narrower than the written policy, maintainability drift can enter the repo while still looking compliant.
- Evidence:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/nest.js` enables `school/no-sequential-transaction` and `school/no-raw-sql-outside-rls` as errors at lines 1-8, and `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/.eslintrc.js` extends that config at lines 1-8.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/no-raw-sql-outside-rls.js` only flags `$executeRawUnsafe` and `$queryRawUnsafe` at lines 32-38.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-students.service.ts` uses `$queryRaw` outside the RLS middleware at lines 806-811.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/index.js` keeps `import/order` and `no-console` at warning level only (13-21), and there is no reviewed rule enforcing silent-catch handling, frontend i18n string extraction, or the documented `react-hook-form` plus Zod form pattern.
- Fix direction: Expand rule coverage to match the written project constraints: include `$queryRaw` and `$executeRaw`, add protection against empty/silent catches, and consider project-specific checks or codemods for untranslated UI strings and new-form conventions.

### 6. Type discipline is generally good, but some DTO and Prisma seams still leak awkward casts

- Severity: Low
- Confidence: Medium
- Why it matters: Repeated casts are usually a sign that local types are not aligned cleanly with actual data shapes. This does not dominate the sample, but it adds friction and noise during refactors.
- Evidence:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/classes/classes.service.ts` reads `homeroom_id` and `max_capacity` through `Record<string, unknown>` casts at lines 65, 78, and 111.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/services/concern.service.ts` uses JSON and transaction casts at lines 200-223.
  - Contrast: `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/students/students.service.ts` starts with explicit transition/query/result types at lines 21-90, which makes later method logic easier to follow.
- Fix direction: When touching these areas, prefer aligning shared DTO/Zod shapes with actual usage rather than relying on local escape-hatch casts. Keep the sanctioned RLS transaction cast where required, but remove avoidable DTO-shape casts.

## E. Files Reviewed

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/fact-pack_2026-04-01_02-39-13.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/pastoral/services/concern.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/behaviour/behaviour-students.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/classes/classes.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/attendance/attendance.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/students/students.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/sen/reports/page.tsx`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/index.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/nest.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/next.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/plugin.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/package.json`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/no-physical-css-direction.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/no-raw-sql-outside-rls.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/no-sequential-transaction.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/.eslintrc.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/.eslintrc.js`

## F. Additional Commands Run

- `pwd`
- `ls -1 "/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT"`
- `sed -n '1,220p' "/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/fact-pack_2026-04-01_02-39-13.md"`
- `sed -n '221,420p' "/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/fact-pack_2026-04-01_02-39-13.md"`
- `rg --files "apps/api/src/modules" | rg "(concern\.service|behaviour-students\.service|behaviour-sanctions\.service|behaviour\.service|case\.service|workload-compute\.service|households\.service|auth\.service|students\.service|classes\.service|attendance\.service|gradebook.*service|finance.*service|homework-analytics\.service)"`
- `rg --files "apps/web/src/app/[locale]/(school)" | rg "(sen/reports/page\.tsx|behaviour/guardian-restrictions/page\.tsx|wellbeing/surveys/page\.tsx|wellbeing/dashboard/page\.tsx|sen/plans/\[planId\]/page\.tsx|students|attendance|gradebook|dashboard)"`
- `if [ -d "packages/eslint-config/rules" ]; then find "packages/eslint-config/rules" -maxdepth 2 -type f | sort; fi`
- `wc -l "apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts" "apps/api/src/modules/pastoral/services/concern.service.ts" "apps/api/src/modules/behaviour/behaviour-students.service.ts" "apps/api/src/modules/behaviour/behaviour.service.ts" "apps/api/src/modules/students/students.service.ts" "apps/api/src/modules/classes/classes.service.ts" "apps/api/src/modules/attendance/attendance.service.ts" "apps/web/src/app/[locale]/(school)/sen/reports/page.tsx" "apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx" "apps/web/src/app/[locale]/(school)/wellbeing/surveys/page.tsx"`
- `sed -n '1,220p' "packages/eslint-config/rules/no-physical-css-direction.js"`
- `sed -n '1,220p' "packages/eslint-config/rules/no-raw-sql-outside-rls.js"`
- `sed -n '1,220p' "packages/eslint-config/rules/no-sequential-transaction.js"`
- `sed -n '1,260p' "apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts"`
- `rg -n "^  (private |protected |public )?(async )?[A-Za-z0-9_]+\(" "apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts"`
- `rg -n "catch|throw new |console\.error|Logger|TODO|FIXME|eslint-disable|as unknown as| as [A-Z][A-Za-z0-9_<>]+|@ts-ignore|\.map\(|\.filter\(|\.reduce\(" "apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts"`
- `sed -n '990,1265p' "apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts"`
- `sed -n '1,260p' "apps/api/src/modules/pastoral/services/concern.service.ts"`
- `rg -n "^  (private |protected |public )?(async )?[A-Za-z0-9_]+\(" "apps/api/src/modules/pastoral/services/concern.service.ts"`
- `rg -n "catch|throw new |console\.error|Logger|TODO|FIXME|eslint-disable|@ts-ignore|as unknown as|toast\.error|\.map\(|\.filter\(|\.reduce\(" "apps/api/src/modules/pastoral/services/concern.service.ts"`
- `sed -n '320,520p' "apps/api/src/modules/pastoral/services/concern.service.ts"`
- `sed -n '720,1020p' "apps/api/src/modules/pastoral/services/concern.service.ts"`
- `sed -n '1,260p' "apps/api/src/modules/behaviour/behaviour-students.service.ts"`
- `rg -n "^  (private |protected |public )?(async )?[A-Za-z0-9_]+\(" "apps/api/src/modules/behaviour/behaviour-students.service.ts"`
- `rg -n "catch|throw new |console\.error|Logger|TODO|FIXME|eslint-disable|@ts-ignore|as unknown as|\.map\(|\.filter\(|\.reduce\(" "apps/api/src/modules/behaviour/behaviour-students.service.ts"`
- `sed -n '620,980p' "apps/api/src/modules/behaviour/behaviour-students.service.ts"`
- `sed -n '980,1235p' "apps/api/src/modules/behaviour/behaviour-students.service.ts"`
- `sed -n '1,240p' "apps/api/src/modules/classes/classes.service.ts"`
- `sed -n '1,260p' "apps/api/src/modules/attendance/attendance.service.ts"`
- `rg -n "^  (private |protected |public )?(async )?[A-Za-z0-9_]+\(" "apps/api/src/modules/attendance/attendance.service.ts"`
- `rg -n "catch|throw new |console\.error|Logger|TODO|FIXME|eslint-disable|@ts-ignore|as unknown as|\.map\(|\.filter\(|\.reduce\(" "apps/api/src/modules/attendance/attendance.service.ts"`
- `sed -n '1,260p' "apps/web/src/app/[locale]/(school)/sen/reports/page.tsx"`
- `rg -n "useState|useEffect|useMemo|useCallback|useTranslations|apiClient\(|toast\.error|console\.error|text-left|text-right|left-|right-|ml-|mr-|pl-|pr-|rtl|locale" "apps/web/src/app/[locale]/(school)/sen/reports/page.tsx"`
- `sed -n '260,620p' "apps/web/src/app/[locale]/(school)/sen/reports/page.tsx"`
- `sed -n '1,260p' "apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx"`
- `rg -n "useState|useEffect|useMemo|useCallback|useTranslations|apiClient\(|toast\.error|console\.error|text-left|text-right|left-|right-|ml-|mr-|pl-|pr-|rtl|locale" "apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx"`
- `sed -n '260,520p' "apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx"`
- `sed -n '520,920p' "apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx"`
- `sed -n '920,1180p' "apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx"`
- `sed -n '240,420p' "apps/api/src/modules/attendance/attendance.service.ts"`
- `rg -n "logger\." "apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts" "apps/api/src/modules/pastoral/services/concern.service.ts" "apps/api/src/modules/behaviour/behaviour-students.service.ts"`
- `rg -n "useForm|zodResolver|react-hook-form" "apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx" "apps/web/src/app/[locale]/(school)/sen/reports/page.tsx"`
- `sed -n '1180,1260p' "apps/web/src/app/[locale]/(school)/sen/reports/page.tsx"`
- `rg -n "toLocaleDateString|humanise\(|'en-IE'|\"en-IE\"|No restrictions found|Add Guardian Restriction|Restriction Details|Create Restriction|Revoke Restriction|Select guardian|Search student|All Types|All Statuses|Previous|Next|Guardian:" "apps/web/src/app/[locale]/(school)/sen/reports/page.tsx" "apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx"`
- `sed -n '580,830p' "apps/web/src/app/[locale]/(school)/sen/reports/page.tsx"`
- `sed -n '780,1015p' "apps/web/src/app/[locale]/(school)/sen/reports/page.tsx"`
- `sed -n '1,240p' "apps/api/src/modules/students/students.service.ts"`
- `rg -n "catch|throw new |console\.error|Logger|TODO|FIXME|eslint-disable|@ts-ignore|as unknown as|\.map\(|\.filter\(|\.reduce\(" "apps/api/src/modules/students/students.service.ts"`
- `find "packages/eslint-config" -maxdepth 2 -type f | sort`
- `sed -n '1,260p' "packages/eslint-config/base.js"`
- `sed -n '1,260p' "packages/eslint-config/react.js"`
- `sed -n '1,260p' "packages/eslint-config/package.json"`
- `sed -n '1,260p' "packages/eslint-config/index.js"`
- `sed -n '1,260p' "packages/eslint-config/nest.js"`
- `sed -n '1,260p' "packages/eslint-config/next.js"`
- `sed -n '1,260p' "packages/eslint-config/plugin.js"`
- `rg -n "\$queryRaw|\$executeRaw|\$queryRawUnsafe|\$executeRawUnsafe" "apps/api/src/modules/behaviour/behaviour-students.service.ts" "apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts" "apps/api/src/modules/pastoral/services/concern.service.ts" "apps/api/src/modules/attendance/attendance.service.ts" "apps/api/src/modules/classes/classes.service.ts" "apps/api/src/modules/students/students.service.ts"`
- `nl -ba "packages/eslint-config/rules/no-raw-sql-outside-rls.js" | sed -n '1,220p'`
- `nl -ba "apps/api/src/modules/behaviour/behaviour-students.service.ts" | sed -n '800,835p'`
- `nl -ba "apps/api/src/modules/attendance/attendance.service.ts" | sed -n '245,265p'`
- `rg -n "^  (private |protected |public )?(async )?[A-Za-z0-9_]+\(" "apps/api/src/modules/classes/classes.service.ts"`
- `rg -n "^  (private |protected |public )?(async )?[A-Za-z0-9_]+\(" "apps/api/src/modules/students/students.service.ts"`
- `nl -ba "apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx" | sed -n '200,320p'`
- `nl -ba "apps/web/src/app/[locale]/(school)/sen/reports/page.tsx" | sed -n '185,245p'`
- `nl -ba "apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx" | sed -n '520,725p'`
- `nl -ba "apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx" | sed -n '725,920p'`
- `nl -ba "apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx" | sed -n '920,1110p'`
- `nl -ba "apps/web/src/app/[locale]/(school)/sen/reports/page.tsx" | sed -n '575,625p'`
- `find apps -maxdepth 2 \( -name '.eslintrc*' -o -name 'eslint.config.*' \) | sort`
- `find packages -maxdepth 2 \( -name '.eslintrc*' -o -name 'eslint.config.*' \) | sort`
- `if [ -f "apps/api/.eslintrc.js" ]; then sed -n '1,200p' "apps/api/.eslintrc.js"; fi`
- `if [ -f "apps/web/.eslintrc.js" ]; then sed -n '1,200p' "apps/web/.eslintrc.js"; fi`
- `nl -ba "apps/api/.eslintrc.js"`
- `nl -ba "apps/web/.eslintrc.js"`
- `nl -ba "packages/eslint-config/nest.js"`
- `nl -ba "packages/eslint-config/next.js"`
- `nl -ba "packages/eslint-config/index.js"`
- `nl -ba "packages/eslint-config/rules/no-physical-css-direction.js" | sed -n '1,200p'`
- `nl -ba "packages/eslint-config/rules/no-sequential-transaction.js" | sed -n '1,200p'`
- `nl -ba "apps/api/src/modules/attendance/attendance.service.ts" | sed -n '1,80p'`
- `nl -ba "apps/web/src/app/[locale]/(school)/behaviour/guardian-restrictions/page.tsx" | sed -n '320,430p'`
- `nl -ba "apps/api/src/modules/pastoral/services/concern.service.ts" | sed -n '920,985p'`
- `nl -ba "apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts" | sed -n '1004,1260p'`
- `nl -ba "apps/api/src/modules/classes/classes.service.ts" | sed -n '1,120p'`
- `nl -ba "apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts" | sed -n '130,210p'`
- `nl -ba "apps/api/src/modules/pastoral/services/concern.service.ts" | sed -n '140,230p'`
- `nl -ba "apps/api/src/modules/behaviour/behaviour-students.service.ts" | sed -n '72,175p'`
- `nl -ba "apps/api/src/modules/students/students.service.ts" | sed -n '19,90p'`

## G. Score

- Score: 6.5 / 10
- Justification: The sampled codebase is not in poor condition. Backend naming, exception structure, RLS transaction discipline, and some mid-sized services show solid engineering habits. The main drag on maintainability is concentration of complexity in a small number of very large services and pages, plus uneven adoption of frontend conventions and incomplete lint enforcement against documented project rules. This is above "weak health" because there are clear good patterns and active guardrails, but below "generally solid" because important refactors still look high-friction and policy drift is already visible in the sample.

## H. Confidence In This Review

- Confidence: Medium
- What limited certainty: This was a targeted sample rather than a full repository walkthrough, and I did not run runtime UI flows or test suites during this subagent task. Confidence is stronger for the specific files reviewed than for repo-wide generalization. I intentionally used the fact pack's hotspot list to reduce sampling bias, but this is still a file-based review rather than exhaustive coverage.
