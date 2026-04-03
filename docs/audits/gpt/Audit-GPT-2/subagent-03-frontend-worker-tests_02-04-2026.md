# A. Facts

- I treated `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md` as canonical and did not repeat repo-wide inventory beyond what was needed for this review.
- Frontend size, from the fact pack plus local checks:
  - `337` `page.tsx` files under `apps/web/src/app`
  - `179` route-local `_components/*.tsx` files
  - `36` shared component files under `apps/web/src/components`
- Frontend test surface I found:
  - `20` Playwright spec files under `apps/web/e2e`, all under `visual/` or `visual-smoke/`
  - `12` Jest spec files under `apps/web/src`
  - `2,170` total lines across the `12` frontend Jest spec files
  - `1,375` total lines across the Playwright spec files
- The two critical frontend e2e specs I reviewed were:
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/visual/attendance.spec.ts`
  - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/visual/finance.spec.ts`
- The strongest frontend unit/integration-style spec I reviewed was `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/require-role.spec.ts`. I also reviewed `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/layout.spec.ts` because it is another large, business-critical frontend spec.
- The Playwright configs I reviewed do not define authenticated `storageState`, test login setup, or global auth bootstrapping. `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/playwright.config.ts:13-67` only sets `baseURL`, browser/device config, and `webServer`. `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/playwright.visual-smoke.config.ts:23-27` waits for `/en/login`.
- The protected school layout is wrapped in `RequireAuth` and `RequireRole` at `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/layout.tsx:474-558`, and `RequireAuth` redirects unauthenticated users to `/{locale}/login` at `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/providers/auth-provider.tsx:263-289`.
- Worker coverage breadth is high on paper:
  - `93` worker processor files
  - `92` companion `*.processor.spec.ts` files
  - `101` total worker spec files
  - exactly one untested processor: `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/security/key-rotation.processor.ts`
- From the fact pack, Phase 1 worker execution results were:
  - `98` passing suites, `3` failing suites, `101` total
  - `691` passing tests, `10` failing tests, `701` total
  - failing suites:
    - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/redis.helpers.spec.ts`
    - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/search.helpers.spec.ts`
    - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/compliance/compliance-execution.processor.spec.ts`
- I reviewed these worker specs and sources:
  - Critical domain:
    - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts`
    - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts`
  - Weaker/failing area:
    - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/compliance/compliance-execution.processor.spec.ts`
    - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/compliance/compliance-execution.processor.ts`
  - Tenant safety base:
    - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.spec.ts`
    - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.ts`
  - Current failing worker helper suites and sources:
    - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/redis.helpers.spec.ts`
    - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/redis.helpers.ts`
    - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/search.helpers.spec.ts`
    - `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/search.helpers.ts`

# B. Strong Signals

- Worker processor coverage is broad by file pairing: `92/93` processors have a companion spec.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts` is substantive. It covers in-app, email, SMS, and WhatsApp sending, template lookup, tenant-vs-platform template fallback, and fallback-channel creation.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.spec.ts` does at least assert that jobs without `tenant_id` are rejected and that execution runs through a transaction.
- Frontend visual coverage does intentionally target locale and device rendering. The Playwright config explicitly runs English/LTR, Arabic/RTL, and mobile variants at `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/playwright.config.ts:17-62`.
- The largest frontend specs aim at important logic boundaries: route access control and navigation filtering.

# C. Inferences

- Frontend coverage is disproportionately small relative to the web surface, and most of the existing frontend tests are either screenshot checks or pure-logic replicas of component code. That means they protect presentation and selected rule tables more than actual user journeys.
- The current frontend e2e suite is best understood as visual regression coverage, not end-to-end workflow coverage.
- Worker test breadth is much stronger than frontend breadth, but current health is weakened by three red suites, including one red suite in an irreversible compliance flow.
- The worker suite meaningfully checks some channel routing and fallback behavior, but it is not yet deep enough on retry timing, provider-failure handling, and tenant-safety invariants to fully trust the most failure-prone paths.

# D. Top Findings

1. Frontend Playwright coverage does not meaningfully exercise protected user journeys
   Severity: High
   Confidence: High
   Why it matters: The reviewed finance and attendance e2e specs do not authenticate, mutate data, submit forms, or assert workflow outcomes. On protected school routes, that means the suite can pass while real teacher/admin flows are broken.
   Evidence: `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/visual/attendance.spec.ts:5-45` and `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/visual/finance.spec.ts:5-73` only call `page.goto(...)`, wait for `networkidle`, and take screenshots. `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/playwright.config.ts:13-67` defines no auth state or login setup. `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/layout.tsx:474-558` wraps the school shell in `RequireAuth`, and `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/providers/auth-provider.tsx:263-289` redirects unauthenticated users to login.
   Fix direction: Add a small set of true journey tests for the highest-value paths, using seeded auth state and outcome assertions. Start with login plus one create/update flow each for attendance, finance invoices/payments, and a parent-facing flow. Keep visual snapshots, but stop treating them as critical-flow coverage.

2. The strongest frontend unit specs are mostly mirrored logic, not protection of the live components
   Severity: High
   Confidence: High
   Why it matters: When tests re-declare route maps and nav sections instead of importing or rendering the real code, they can drift and still pass. That creates false confidence in access control and navigation behavior.
   Evidence: `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/require-role.spec.ts:25-111` explicitly mirrors constants and logic instead of importing the component behavior. The live component now includes `/parent/sen` and `/sen` route rules at `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/require-role.tsx:44-47`, but those routes are absent from the mirrored test map at `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/require-role.spec.ts:38-75`. The same pattern appears in `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/layout.spec.ts:31-88`, while the live layout nav now includes parent SEN and an expanded SEN section at `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/layout.tsx:107-132` and `223-232`.
   Fix direction: Convert the highest-value mirrored specs into component-level tests that render the real component or import the real shared config. At minimum, extract route/nav maps into shared exported constants so tests and runtime code cannot silently diverge.

3. The compliance execution safety net is currently broken for an irreversible worker flow
   Severity: Critical
   Confidence: High
   Why it matters: `compliance:execute` performs erasure/anonymisation. A broken, non-executable spec on that path means the most dangerous worker flow currently has no working regression harness.
   Evidence: The fact pack records `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/compliance/compliance-execution.processor.spec.ts` as a failing suite with a syntax error. The file is only `161` lines long, ends after setup at `:83-161`, and contains no `it(` or `test(` declarations at all. `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/compliance/compliance-execution.processor.ts:82-173` contains the actual erasure/access-export logic. The job catalog describes this flow as executing erasure/anonymisation and still sharing the imports queue at `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/event-job-catalog.md:240-259`.
   Fix direction: Restore this suite first. Add executable coverage for approved-vs-completed request handling, access export upload behavior, erasure cleanup steps, Redis/search/S3 cleanup failures, and idempotency when jobs are retried or replayed.

4. Worker infrastructure coverage is currently red in shared Redis and search helpers
   Severity: High
   Confidence: High
   Why it matters: These helpers sit below multiple worker flows. When the foundational suites are failing, confidence in higher-level worker coverage drops because the common infrastructure contract is unstable.
   Evidence: The fact pack records failing suites in `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/redis.helpers.spec.ts` and `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/search.helpers.spec.ts`. The Redis spec uses repeated `require()` reload patterns at `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/redis.helpers.spec.ts:32-165`, matching the lint debt called out in the fact pack. The search spec failed in Phase 1 due to mock initialization order, and its setup is highly mock-driven around dynamic import behavior at `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/search.helpers.spec.ts:1-28`.
   Fix direction: Get the helper suites green before treating worker coverage as healthy. Refactor the tests to avoid brittle module-cache and TDZ patterns, then keep them focused on the observable contract of client creation, caching, and graceful degradation.

5. A cross-tenant encryption key-rotation processor is completely untested
   Severity: High
   Confidence: High
   Why it matters: This is the one worker processor without a companion spec, and it rotates encrypted Stripe secrets and staff bank details across tenants. That is a one-way-risk operation.
   Evidence: My processor/spec mapping found exactly one untested processor: `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/security/key-rotation.processor.ts`. The processor itself explicitly bypasses `TenantAwareJob` because it runs cross-tenant at `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/security/key-rotation.processor.ts:43-49`, and then rotates encrypted Stripe and bank fields at `:93-220`. The architecture danger-zone note warns that encryption changes can make existing data permanently unreadable at `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md:151-166`.
   Fix direction: Add focused tests for dry-run behavior, missing-key skips, decryption failure accounting, update batching, and no-infinite-loop behavior across dry-run and live modes. This should be treated as mandatory safety coverage, not optional completeness.

6. Worker retry/backoff and tenant-safety behavior are only partially asserted
   Severity: Medium
   Confidence: High
   Why it matters: The worker code includes important safeguards, but the reviewed specs do not fully prove them. That leaves meaningful gaps exactly where background jobs most often fail in production: provider outages, malformed payloads, and context leakage.
   Evidence: `TenantAwareJob` validates `tenant_id`, validates UUID format for `tenant_id` and `user_id`, sets both tenant and user context, and logs `correlation_id` at `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.ts:40-71`. Its spec only checks missing `tenant_id`, generic `$executeRaw` invocation, and transaction execution at `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.spec.ts:38-72`. `DispatchNotificationsProcessor` implements explicit retry/backoff and fallback-chain logic at `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts:654-725`, but in the large companion spec the only `next_retry_at` assertions I found are permanent no-contact failure paths at `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts:733-767` and `955-992`, not transient provider-failure backoff.
   Fix direction: Add targeted tests for invalid UUID payload rejection, default sentinel user context, correlation logging, transient provider errors that schedule retries, and terminal provider failures that trigger fallback only after max attempts.

# E. Files Reviewed

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/CLAUDE.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/context.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/event-job-catalog.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/package.json`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/playwright.config.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/playwright.visual-smoke.config.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/visual/attendance.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/e2e/visual/finance.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/require-role.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/components/require-role.tsx`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/layout.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/app/[locale]/(school)/layout.tsx`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src/providers/auth-provider.tsx`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/redis.helpers.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/redis.helpers.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/search.helpers.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/search.helpers.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/communications/dispatch-notifications.processor.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/compliance/compliance-execution.processor.spec.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/compliance/compliance-execution.processor.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/security/key-rotation.processor.ts`

# F. Additional Commands Run

- `wc -l` on the fact pack and selected source/spec files
- `sed -n` on required context files and reviewed source/spec files
- `find ... -name 'page.tsx'`, `find ... -path '*/_components/*.tsx'`, and `find ... -name '*.spec.ts*'` to size frontend and worker test surfaces
- `xargs wc -l | sort -nr` to rank frontend and worker specs by size
- `rg --files` to inventory frontend e2e files and frontend specs
- `rg -n` to check for auth setup in Playwright configs, identify uncovered/untested processor mappings, and locate retry/fallback assertions
- `nl -ba` to capture line-anchored evidence for the report

# G. Score

Anchor:
`1` = almost no meaningful protection
`3` = mostly shallow checks or broken safety net
`5` = partial protection for common regressions
`7` = strong protection for critical flows and failure paths
`10` = broad, dependable protection across critical user journeys and background failure modes

- Frontend test health: `3/10`
  Judgment: There is some useful visual and rule-table coverage, especially for locale/RTL rendering, but it does not meaningfully protect real authenticated user journeys across a very large frontend.

- Worker test health: `6/10`
  Judgment: Worker coverage is materially stronger than frontend coverage and includes several meaningful processor specs, but the current red suites, broken compliance harness, missing key-rotation coverage, and partial retry/tenant-safety assertions keep it out of the “healthy” range.

# H. Confidence in this review

Confidence: High

Reasoning: I reviewed the canonical fact pack first, then checked representative frontend and worker tests against their live source files and architecture context. The biggest conclusions are directly evidence-backed: screenshot-only frontend e2e coverage, mirrored frontend unit logic with drift, broad but currently degraded worker coverage, a syntactically broken compliance spec, and an entirely untested key-rotation processor.
