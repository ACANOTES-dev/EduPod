# Challenge Pass

Timestamp: `20260403T130928+0100`

## 1. Findings That Held Up Under Challenge

- Search authorization gap held up.
  Evidence: [`apps/api/src/modules/search/search.controller.ts:25-47`](/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.controller.ts#L25) uses only `AuthGuard`, defaults blank query and all entity types, and [`apps/api/src/modules/search/search.service.ts:17-199`](/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.service.ts#L17) returns tenant-wide student/parent/staff/household directory data without permission context.
  Verdict: correctly framed as a High-severity intra-tenant privacy/RBAC issue.

- Deploy rollback being code-only held up.
  Evidence: [`scripts/deploy-production.sh:153-168`](/Users/ram/Desktop/SDB/scripts/deploy-production.sh#L153) creates a predeploy dump, while [`scripts/deploy-production.sh:292-316`](/Users/ram/Desktop/SDB/scripts/deploy-production.sh#L292) rollback only checks out old code, rebuilds, and restarts services. No `pg_restore` path is wired into automatic rollback.
  Verdict: correctly framed as High severity because production deploys apply migrations on every main push.

- Approval callback status overflow held up.
  Evidence: [`packages/prisma/schema.prisma:1398`](/Users/ram/Desktop/SDB/packages/prisma/schema.prisma#L1398) limits `callback_status` to `VARCHAR(20)`, while three callback processors write `skipped_unexpected_state` at [`apps/worker/src/processors/finance/invoice-approval-callback.processor.ts:87-93`](/Users/ram/Desktop/SDB/apps/worker/src/processors/finance/invoice-approval-callback.processor.ts#L87), [`apps/worker/src/processors/payroll/approval-callback.processor.ts:88-94`](/Users/ram/Desktop/SDB/apps/worker/src/processors/payroll/approval-callback.processor.ts#L88), and [`apps/worker/src/processors/communications/announcement-approval-callback.processor.ts:87-93`](/Users/ram/Desktop/SDB/apps/worker/src/processors/communications/announcement-approval-callback.processor.ts#L87). Direct length check returned `24`.
  Verdict: correctly framed as High severity and High confidence.

- Boundary checker drift held up.
  Evidence: [`scripts/check-module-boundaries.ts:5-25`](/Users/ram/Desktop/SDB/scripts/check-module-boundaries.ts#L5) still resolves `architecture/module-ownership.json`, and `pnpm check:boundaries -- --max-violations 9999` fails in this checkout because the file actually lives under `docs/architecture/`.
  Verdict: correctly framed as a real control failure, not just a documentation nit.

- Worker Sentry instrumentation not loading held up.
  Evidence: [`apps/worker/src/instrument.ts:37-50`](/Users/ram/Desktop/SDB/apps/worker/src/instrument.ts#L37) initializes Sentry, while [`apps/worker/src/main.ts:1-20`](/Users/ram/Desktop/SDB/apps/worker/src/main.ts#L1) does not import `./instrument`.
  Verdict: correctly framed as an operational telemetry gap.

- Frontend test asymmetry held up.
  Evidence: main-session counts show `337` route pages and `32` frontend test files. The sampled attendance journey at [`apps/web/e2e/journeys/attendance.journey.ts:9-71`](/Users/ram/Desktop/SDB/apps/web/e2e/journeys/attendance.journey.ts#L9) stays at heading/table/filter/sometimes-click coverage, and [`apps/web/src/components/notifications/notification-panel.spec.ts:1-90`](/Users/ram/Desktop/SDB/apps/web/src/components/notifications/notification-panel.spec.ts#L1) mirrors helpers instead of mounting the component.
  Verdict: High severity is justified for refactor safety of user-facing workflows, but not Critical because there is real journey and visual coverage.

- Payroll refactor-safety weakness held up.
  Evidence: [`apps/api/jest.config.js:21-31`](/Users/ram/Desktop/SDB/apps/api/jest.config.js#L21) lacks `collectCoverageFrom`, [`scripts/check-test-coverage-gate.sh:1-33`](/Users/ram/Desktop/SDB/scripts/check-test-coverage-gate.sh#L1) checks changed specs rather than real coverage, payroll coverage artifact remains `68.5%` statements / `50.0%` branches across 24 covered files, and [`apps/api/src/modules/payroll/payroll-runs.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/payroll/payroll-runs.service.ts) is much broader than its sampled spec coverage.
  Verdict: correctly framed as High severity because payroll is a business-critical domain.

## 2. Findings That Weakened Under Challenge

- “Models with tenant_id but no RLS” as a blanket repo fact weakened substantially.
  Reason: the naive shell comparison from the prompt mismatched Prisma model names with mapped table names.
  Adjustment: replaced with the repo’s own RLS audit script result plus direct verification of the documented exceptions.

- “`: any` / `as any` is present in production code” weakened to effectively unsupported.
  Reason: the prompt’s grep pattern matched ordinary English text such as “any data” and comments.
  Adjustment: removed as a meaningful finding.

- “Unsafe raw SQL usage indicates weak governance” weakened.
  Reason: direct governance script and allowlist review show `0` ungoverned production call sites.
  Adjustment: raw SQL remains a review area, but not a top finding by itself.

## 3. Findings That Were Reframed

- `survey_responses` moved from “apparent missing RLS policy” to “intentional anonymous-data exception that still needs stronger structural guardrails.”
  Reason: direct inspection of [`packages/prisma/rls/policies.sql:2266-2267`](/Users/ram/Desktop/SDB/packages/prisma/rls/policies.sql#L2266) and the migration comment confirmed the exception is deliberate.

- Search authorization issue was reframed from “tenant isolation failure” to “intra-tenant directory enumeration / missing RBAC.”
  Reason: tenant filters are present in both Meilisearch and PostgreSQL fallback. The defect is authorization scope, not RLS bypass.

- Operational readiness was reframed from “workflow-heavy but immature” to “meaningfully engineered, but weak on recoverability and worker telemetry.”
  Reason: direct inspection showed real deploy preflight, smoke tests, backups, restore drill, RLS/raw-SQL checks, and health endpoints. The weak point is what happens after state changes and in background-job observability.

- Architecture risk was reframed from “folder modularity may be fake” to “module structure is real, but boundary enforcement and large hotspot domains have not kept pace with scale.”
  Reason: `AppModule`, module aggregation, and some clean contrast services are genuinely structured; the problem is erosion at the seams and inside the largest slices.

## 4. Remaining Uncertainties

- No production host or live PM2 inspection was performed.
- No local rerun of API integration tests or Playwright visual/journey suites was performed in this audit run.
- The module and test reviews are targeted samples, not exhaustive line-by-line coverage of all `59` backend modules or all frontend pages.
- The seventh subagent could not be launched in the initial one-shot batch because the environment caps concurrent threads at `6`; it was launched after a completed agent was closed.
- Some score components remain judgment calls even after evidence review, especially maintainability and modularity, which depend partly on sampled hotspots.

## 5. Adjustments Made To Severity, Confidence, Or Scoring

- No finding remained at Critical after challenge.
  Reason: the strongest problems are serious but still bounded, and several key controls already exist.

- Security score was kept at `6.0` instead of being pushed lower.
  Reason: the search-RBAC issue is serious, but the repo also has strong RLS governance, startup DB-role checks, session revocation, brute-force controls, and governed raw SQL.

- Operational readiness score was kept at `6.5` instead of being pushed lower.
  Reason: deploy safeguards, restore-drill automation, local backups, health surfaces, and CI governance are materially better than a “weak ops” rating would imply.

- Frontend test health stayed at `4.0`, not lower.
  Reason: the frontend has meaningful login journeys and broad visual coverage; the problem is shallow breadth across critical workflows, not total absence of tests.

- Behaviour and gradebook hotspot findings stayed High, not Critical.
  Reason: they are large and coupled, but the audit found internal structure and some healthy contrast patterns, not uncontrolled collapse.

- The survey anonymity exception stayed Medium severity.
  Reason: the exception is documented and partially compensated; its risk is fragility of discipline, not proven active leakage.
