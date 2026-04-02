# Subagent 03 - Frontend & Worker Test Health

## A. Facts

- The canonical fact pack reports `336` frontend `page.tsx` files, `35` shared frontend components, `167` page-local frontend components, `19` Playwright visual specs, `12` frontend unit/integration specs, and `87` worker processors.
- The canonical fact pack explicitly says frontend tests were inventoried but not executed in that phase.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/playwright.config.ts` sets `testDir: './visual'` and `snapshotDir: './visual/__snapshots__'`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/visual/students.spec.ts` uses `page.goto(...)`, `page.waitForLoadState('networkidle')`, and `expect(...).toHaveScreenshot(...)` for list, detail, and new-student routes. Its detail assertions only run if the first row is visible.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/visual/finance.spec.ts` uses `page.goto(...)`, `page.waitForLoadState('networkidle')`, and `expect(...).toHaveScreenshot(...)` for finance hub, invoices, payments, and fee structures in English and Arabic.
- A repo search found no `render(`, `screen.`, `userEvent`, `fireEvent`, or `@testing-library` usage in frontend spec files under `apps/web/src`.
- Several frontend specs explicitly state that they replicate or mirror logic instead of mounting React components, including:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/require-role.spec.ts`
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/layout.spec.ts`
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/notifications/notification-panel.spec.ts`
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/global-search.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/require-role.tsx` contains live `/parent/sen` and `/sen` route rules, while `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/require-role.spec.ts` does not contain those rules.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/layout.tsx` contains parent SEN, behaviour, wellbeing, SEN, operations, regulatory, and closures navigation entries that are absent from `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/layout.spec.ts`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/notifications/notification-panel.tsx` includes API calls, polling, open-state fetching, outside-click handling, and mark-read actions; its spec only tests helper functions for relative time, grouping, and title formatting.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/global-search.tsx` includes debounced API search, result state, loading state, and router navigation; its spec only tests grouping and empty-message helpers.
- Worker processor/spec mapping from `rg` and `comm` shows `26` processor specs with matching processor files out of `87` processors.
- The worker domain count command showed full processor-spec matching in `wellbeing` (`6/6`), `homework` (`4/4`), `compliance` (`3/3`), and `approvals` (`1/1`).
- The same domain count command showed sparse matching in `behaviour` (`2/16`), `communications` (`1/7`), `engagement` (`1/8`), `finance` (`1/2`), `gradebook` (`1/4`), and `pastoral` (`1/8`), and no matching processor specs in `early-warning`, `imports`, `payroll`, or `regulatory`.
- The unmatched processor list included all processors under:
  - `apps/worker/src/processors/early-warning/`
  - `apps/worker/src/processors/imports/`
  - `apps/worker/src/processors/payroll/`
  - `apps/worker/src/processors/regulatory/`
- The unmatched worker list also included major individual processors such as:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/behaviour/evaluate-policy.processor.ts`
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/behaviour/critical-escalation.processor.ts`
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/gradebook/gradebook-risk-detection.processor.ts`
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/scheduling/solver-v2.processor.ts`
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/search-reindex.processor.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.ts` validates `tenant_id`, validates UUID format, opens an interactive transaction, sets `app.current_tenant_id`, sets `app.current_user_id`, and then calls `processJob`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.spec.ts` checks missing `tenant_id`, undefined `tenant_id`, transaction usage, and that `$executeRaw` is called before `processJob`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/pastoral/escalation-timeout.processor.spec.ts` covers acknowledged no-op, urgent-to-critical escalation, audit event creation, notification creation, follow-up queue enqueue, second-round handling, missing concern, wrong job name, missing `tenant_id`, and notification-dispatch enqueue.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/engagement/engagement-annual-renewal.processor.spec.ts` covers wrong job name, happy-path renewal, skip when a current-year submission already exists, and skip when a tenant has no active academic year.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts` covers wrong job name, missing `tenant_id`, in-app delivery, announcement-based ID resolution, multiple-notification dispatch, missing-template fallback, and logging.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/approvals/callback-reconciliation.processor.spec.ts` covers callback attempt increments, retry exhaustion, queue enqueue failure, and multiple stuck callbacks in a single run.
- A worker-spec grep found relatively few retry/backoff-related matches outside `dispatch-notifications.processor.spec.ts` and `callback-reconciliation.processor.spec.ts`.

## B. Strong Signals

- Frontend test coverage is weighted toward visual snapshots and mirrored helper logic rather than mounted, stateful component behavior.
- Frontend route and navigation tests are vulnerable to drift because the specs duplicate route maps and nav structures instead of importing the source of truth.
- Worker coverage is not uniformly weak; it is concentrated in a few stronger clusters such as wellbeing, homework, compliance, and approvals.
- Worker coverage is thin across several important processor-heavy domains, especially behaviour, communications, engagement, early-warning, payroll, regulatory, imports, and scheduling.
- Tenant safety is treated as a baseline invariant in worker tests, but retry and failure handling are not exercised as consistently as tenant presence checks.

## C. Inferences

- The frontend suite gives some confidence that major pages still render and that some route-role rules have not obviously changed appearance, but it does not meaningfully protect real user journeys such as creating, editing, submitting, approving, or recovering from errors.
- Frontend unit tests likely overstate confidence because copied logic can pass while the actual component behavior drifts, as already observed in `RequireRole` and the school layout navigation.
- Worker refactors are safer in the domains with dense specs, but change risk remains high across the many processors with no direct spec match.
- The worker base layer likely reduces tenant-safety risk, but processors that loop across tenants or set RLS manually still need their own isolation tests.
- Important failure behavior exists in the codebase, but reliability protection is uneven because failure-path assertions are not a repo-wide worker testing pattern.

## D. Top Findings

### 1. Frontend "E2E" coverage is mostly screenshot smoke testing, not real journeys

- Severity: High
- Confidence: High
- Why it matters: Critical user-facing flows can regress while visual screenshots still pass. Rendering a page is much weaker protection than proving a teacher, office admin, or finance user can complete the task successfully.
- Evidence:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/playwright.config.ts` targets only `./visual`.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/visual/students.spec.ts` and `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/visual/finance.spec.ts` use `goto -> networkidle -> screenshot` patterns.
  - The student-detail branch only asserts if a row is visible, so even that shallow navigation can silently do nothing on empty or broken data states.
  - The fact pack reports `336` frontend pages versus `19` visual specs.
- Fix direction: Add behavioral Playwright journeys for the highest-risk flows first: student create/edit, attendance mark-and-save, admissions submission, invoice and payment operations, approval actions, and payroll-run lifecycle. Assert URL changes, success/error messaging, and persisted outcomes instead of screenshots alone.

### 2. Frontend unit tests largely test copied logic instead of the shipped components

- Severity: High
- Confidence: High
- Why it matters: These tests can pass while the real component breaks or drifts, which lowers refactor safety and makes failures look less likely than they really are.
- Evidence:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/require-role.spec.ts`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/layout.spec.ts`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/notifications/notification-panel.spec.ts`, and `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/global-search.spec.ts` explicitly say they mirror or replicate logic without mounting React.
  - No frontend spec files under `apps/web/src` use Testing Library primitives such as `render`, `screen`, or `userEvent`.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/require-role.tsx` contains `/parent/sen` and `/sen`, but the spec does not.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/layout.tsx` contains behaviour, wellbeing, SEN, operations, regulatory, and closures navigation entries that are absent from the spec.
  - API-driven component behavior in `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/notifications/notification-panel.tsx` and `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/global-search.tsx` is not what those specs exercise.
- Fix direction: Export real pure helpers from production modules so tests import the source of truth, or mount the components with Testing Library and mock Next/auth/API edges. Prioritize route access, nav filtering, notification panel actions, and global search behavior.

### 3. Worker test protection is selective across a broad background-processing surface

- Severity: High
- Confidence: High
- Why it matters: Background processing is spread across many school-critical domains, and untested processors can regress silently until production data or delayed jobs expose the problem.
- Evidence:
  - The worker inventory contains `87` processors, but only `26` had matching processor spec files.
  - Entire processor groups with no matching spec include `early-warning`, `imports`, `payroll`, and `regulatory`.
  - Sparse areas include `behaviour` (`2/16`), `communications` (`1/7`), `engagement` (`1/8`), `gradebook` (`1/4`), and `pastoral` (`1/8`).
  - Unmatched high-impact files include `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/behaviour/evaluate-policy.processor.ts`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/gradebook/gradebook-risk-detection.processor.ts`, and `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/scheduling/solver-v2.processor.ts`.
- Fix direction: Expand coverage by operational risk, not just convenience. Start with early-warning compute jobs, behaviour policy/escalation jobs, payroll callbacks/session generation, regulatory sync and generation jobs, and communications publish/retry flows.

### 4. Tenant safety has a meaningful base contract, but per-processor isolation coverage is uneven

- Severity: Medium
- Confidence: Medium
- Why it matters: A strong base helper reduces risk, but processors that handle tenant setup differently still need direct isolation tests.
- Evidence:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.ts` enforces tenant validation and sets RLS context in a transaction.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.spec.ts` validates missing `tenant_id`, transaction use, and RLS setup.
  - Many processor specs assert missing `tenant_id`.
  - Some processors still manage tenant context manually with `set_config('app.current_tenant_id', ...)`, including `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/engagement/engagement-annual-renewal.processor.ts`.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/engagement/engagement-annual-renewal.processor.spec.ts` does not verify tenant-context setup or per-tenant failure isolation.
- Fix direction: For cross-tenant loops and any processor that manually sets RLS context, add explicit tests for tenant-by-tenant isolation, invalid tenant handling, and one-tenant-fails-but-others-continue behavior.

### 5. Retry and failure-path verification exists in pockets, not as a consistent worker pattern

- Severity: Medium
- Confidence: Medium
- Why it matters: Queue processors often fail on provider errors, queue outages, malformed payloads, or repeated retries. Missing failure tests make those regressions hard to catch before production.
- Evidence:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts` checks missing-template fallback and `failure_reason`.
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/approvals/callback-reconciliation.processor.spec.ts` checks `callback_attempts`, retry exhaustion, and queue enqueue failure.
  - The broader grep found relatively few retry/backoff/failure assertions compared with the size of the worker processor surface.
  - Weaker-area specs like `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/engagement/engagement-annual-renewal.processor.spec.ts` and `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/finance/overdue-detection.processor.spec.ts` are mostly happy-path plus skip-case coverage.
- Fix direction: Standardize a processor test checklist covering wrong job name, missing or invalid tenant, provider or queue failure, retry exhaustion, idempotent rerun behavior, and downstream queue contract assertions.

## E. Files Reviewed

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/fact-pack_2026-04-01_02-39-13.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/context.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/ui-design-brief.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/pre-flight-checklist.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/playwright.config.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/visual/students.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/visual/finance.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/require-role.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/require-role.tsx`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/layout.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/layout.tsx`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/notifications/notification-panel.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/notifications/notification-panel.tsx`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/global-search.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/global-search.tsx`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/engagement/engagement-annual-renewal.processor.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/engagement/engagement-annual-renewal.processor.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/finance/overdue-detection.processor.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/finance/overdue-detection.processor.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/pastoral/escalation-timeout.processor.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/pastoral/escalation-timeout.processor.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/approvals/callback-reconciliation.processor.spec.ts`

## F. Additional Commands Run

```sh
sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/fact-pack_2026-04-01_02-39-13.md'
sed -n '1,220p' 'Plans/context.md'
sed -n '1,220p' 'Plans/ui-design-brief.md'
sed -n '1,220p' 'architecture/pre-flight-checklist.md'
rg --files 'apps/web/e2e' -g '*.spec.ts' -g '*.test.ts'
rg --files 'apps/web/src' -g '*.spec.ts' -g '*.spec.tsx' -g '*.test.ts' -g '*.test.tsx'
rg --files 'apps/worker/src/processors' -g '*.processor.ts'
rg --files 'apps/worker/src' -g '*.spec.ts' -g '*.test.ts'
if [ -f 'apps/worker/src/base/tenant-aware-job.spec.ts' ]; then echo 'apps/worker/src/base/tenant-aware-job.spec.ts'; fi
rg -n "visual|screenshot|toHaveScreenshot|snapshot" apps/web/e2e/visual
processors=$(rg --files 'apps/worker/src/processors' -g '*.processor.ts' | sed 's#apps/worker/src/processors/##' | awk -F/ '{ if (NF==1) print "root"; else print $1 }' | sort | uniq -c); specs=$(rg --files 'apps/worker/src/processors' -g '*.processor.spec.ts' | sed 's#apps/worker/src/processors/##' | awk -F/ '{ if (NF==1) print "root"; else print $1 }' | sort | uniq -c); printf 'PROCESSORS BY DOMAIN\n%s\n\nSPECS BY DOMAIN\n%s\n' "$processors" "$specs"
comm -23 <(rg --files 'apps/worker/src/processors' -g '*.processor.ts' | sed 's#\.ts$##' | sed 's#apps/worker/src/##' | sort) <(rg --files 'apps/worker/src/processors' -g '*.processor.spec.ts' | sed 's#\.spec\.ts$##' | sed 's#apps/worker/src/##' | sort)
comm -12 <(rg --files 'apps/worker/src/processors' -g '*.processor.ts' | sed 's#\.ts$##' | sed 's#apps/worker/src/##' | sort) <(rg --files 'apps/worker/src/processors' -g '*.processor.spec.ts' | sed 's#\.spec\.ts$##' | sed 's#apps/worker/src/##' | sort)
wc -l apps/web/src/**/*.spec.ts* apps/web/src/**/*.test.ts* 2>/dev/null | sort -nr | head -n 20
rg --files 'apps/web/e2e'
sed -n '1,240p' 'apps/web/e2e/playwright.config.ts'
rg --files 'apps/web/src' -g '*.spec.ts' -g '*.spec.tsx' -g '*.test.ts' -g '*.test.tsx' | xargs wc -l | sort -nr | head -n 20
rg -n "describe\(|it\(|test\(" apps/web/src/components apps/web/src/app/[locale]/(school) | sed -n '1,220p'
sed -n '1,220p' 'apps/web/e2e/visual/students.spec.ts'
sed -n '1,220p' 'apps/web/e2e/visual/finance.spec.ts'
sed -n '1,260p' 'apps/web/src/components/require-role.spec.ts'
sed -n '1,260p' 'apps/web/src/app/[locale]/(school)/layout.spec.ts'
sed -n '1,260p' 'apps/web/src/components/notifications/notification-panel.spec.ts'
sed -n '261,380p' 'apps/web/src/components/require-role.spec.ts'
sed -n '1,260p' 'apps/web/src/components/global-search.spec.ts'
sed -n '1,260p' 'apps/web/src/components/require-role.tsx'
sed -n '1,260p' 'apps/web/src/components/notifications/notification-panel.tsx'
sed -n '1,280p' 'apps/web/src/app/[locale]/(school)/layout.tsx'
rg -n "navSections|SEN|wellbeing|behaviour|communications|finance|settings" 'apps/web/src/app/[locale]/(school)/layout.tsx'
rg -n "parent/sen|/sen|/behaviour/parent-portal|/homework/parent|/finance|/payroll" 'apps/web/src/components/require-role.spec.ts' 'apps/web/src/components/require-role.tsx'
rg -n "senParent|/parent/sen|nav.behaviour|nav.wellbeing|nav.sen|nav.operations|nav.regulatory|nav.school" 'apps/web/src/app/[locale]/(school)/layout.spec.ts' 'apps/web/src/app/[locale]/(school)/layout.tsx'
sed -n '280,380p' 'apps/web/src/app/[locale]/(school)/layout.tsx'
rg -n "fetchUnreadCount|fetchNotifications|handleMarkAllRead|handleMarkRead|catch \{" 'apps/web/src/components/notifications/notification-panel.spec.ts' 'apps/web/src/components/notifications/notification-panel.tsx'
rg -n "render\(|screen\.|userEvent|fireEvent|@testing-library" apps/web/src -g '*.spec.ts' -g '*.spec.tsx' -g '*.test.ts' -g '*.test.tsx'
rg -n "export function NotificationPanel|function formatRelativeTime|function groupNotifications|function getNotificationTitle" 'apps/web/src/components/notifications/notification-panel.tsx'
rg -n "export function RequireRole|const ROUTE_ROLE_MAP|const UNRESTRICTED_PATHS" 'apps/web/src/components/require-role.tsx'
rg --files 'apps/worker/src' -g '*.spec.ts' -g '*.test.ts' | xargs wc -l | sort -nr | head -n 25
rg -n "retry|retries|attempts|backoff|fail|throw|Error|tenant_id|RLS|current_tenant_id" apps/worker/src/base/tenant-aware-job.spec.ts apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts apps/worker/src/processors/engagement/engagement-annual-renewal.processor.spec.ts apps/worker/src/processors/pastoral/escalation-timeout.processor.spec.ts apps/worker/src/processors/finance/overdue-detection.processor.spec.ts
sed -n '1,260p' 'apps/worker/src/base/tenant-aware-job.spec.ts'
sed -n '1,320p' 'apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts'
sed -n '1,260p' 'apps/worker/src/processors/engagement/engagement-annual-renewal.processor.spec.ts'
sed -n '1,260p' 'apps/worker/src/processors/communications/dispatch-notifications.processor.ts'
sed -n '1,260p' 'apps/worker/src/processors/engagement/engagement-annual-renewal.processor.ts'
sed -n '260,520p' 'apps/worker/src/processors/communications/dispatch-notifications.processor.ts'
sed -n '1,240p' 'apps/worker/src/processors/finance/overdue-detection.processor.spec.ts'
sed -n '1,260p' 'apps/worker/src/processors/pastoral/escalation-timeout.processor.spec.ts'
sed -n '1,260p' 'apps/worker/src/processors/pastoral/escalation-timeout.processor.ts'
rg -n "attempts:|backoff:|next_retry_at|max_attempts|failure_reason|reject jobs without tenant_id|missing tenant_id|logger.error|reject job without tenant_id" apps/worker/src -g '*.spec.ts'
rg -n "catch \(|catch \{|logger\.error|throw new Error|throw new" apps/worker/src/processors/engagement/engagement-annual-renewal.processor.ts apps/worker/src/processors/finance/overdue-detection.processor.ts apps/worker/src/processors/communications/dispatch-notifications.processor.ts apps/worker/src/processors/pastoral/escalation-timeout.processor.ts
sed -n '260,460p' 'apps/worker/src/processors/pastoral/escalation-timeout.processor.spec.ts'
rg -n "page\.(click|fill|getByRole|getByLabel|type|press|check|uncheck|selectOption)|locator\(|toHaveURL|toContainText|toBeVisible|toHaveText|toHaveValue" apps/web/e2e/visual
rg -n "toHaveScreenshot\(|waitForLoadState\('networkidle'\)|page\.goto\(" apps/web/e2e/visual | sed -n '1,260p'
rg -n "useTranslations|apiClient|useEffect|useCallback|setInterval|addEventListener|toast\.error" 'apps/web/src/components/notifications/notification-panel.tsx' 'apps/web/src/components/global-search.tsx' 'apps/web/src/components/user-menu.tsx'
sed -n '1,220p' 'apps/web/src/components/global-search.tsx'
sed -n '1,220p' 'apps/worker/src/processors/finance/overdue-detection.processor.ts'
rg -n "page\.goto\(|toHaveScreenshot\(|test\.describe\(|if \(await firstRow\.isVisible\(\)\)" 'apps/web/e2e/visual/students.spec.ts' 'apps/web/e2e/visual/finance.spec.ts'
rg -n "mirrored from|replicate|pure helper|pure logic|without mounting React|without mounting|without importing Next.js|Module boundary" apps/web/src -g '*.spec.ts' -g '*.spec.tsx' -g '*.test.ts' -g '*.test.tsx'
rg -n "attempts: 3|backoff: \{ type: 'exponential', delay: 5000 \}|callback_attempts|max_attempts|next_retry_at|failure_reason" apps/worker/src -g '*.spec.ts'
sed -n '1,280p' 'apps/worker/src/processors/approvals/callback-reconciliation.processor.spec.ts'
sed -n '1,240p' 'apps/worker/src/base/tenant-aware-job.ts'
rg -n "\$executeRaw|set_config\('app.current_tenant_id'|TenantAwareJob<|extends TenantAwareJob" apps/worker/src/base apps/worker/src/processors -g '*.ts'
rg -n "\$executeRaw|set_config\('app.current_tenant_id'|tenant_id" apps/worker/src -g '*.spec.ts' | sed -n '1,260p'
if [ -f '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/subagent-03-frontend-worker-tests_2026-04-01_02-39-13.md' ]; then echo exists; else echo missing; fi
date '+%Y-%m-%d %H:%M:%S %Z'
```

## G. Score

- Score: 5/10
- Justification: This is mixed health. The worker side has real strengths, including a meaningful tenant-aware base contract and deeper specs in some domains such as wellbeing, homework, compliance, pastoral, notifications, and approvals. But frontend protection is shallow relative to the product surface, because the Playwright suite is overwhelmingly visual and the unit suite mostly tests mirrored logic rather than shipped components. On the worker side, many important processors remain untested, especially in behaviour, communications, early-warning, payroll, regulatory, imports, and scheduling. That combination makes extension and refactoring possible, but not low-risk.

## H. Confidence in this review

- Confidence: Medium
- What limited certainty:
  - I reviewed targeted representative files rather than every frontend and worker test.
  - I did not execute the frontend or worker suites in this task.
  - The canonical fact pack said frontend execution evidence was not established in its earlier phase, so some conclusions rely on static test inspection rather than run results.
