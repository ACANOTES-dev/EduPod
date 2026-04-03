# Health Recovery Plan

Recovery plan timestamp: `2026-04-01_03-28-56`
Source audit baseline: `Audit-GPT/master-audit-report_2026-04-01_02-39-13.md`

## Purpose

This document is the post-audit recovery program. It is not a generic best-practices list. It is a targeted plan to move the system from the audited mixed-health state into a disciplined, evidence-backed high-health state.

## Truthfulness Constraint

Two things are true at the same time:

1. This plan is designed to make a `9.5+` health outcome attainable.
2. A full re-audit cannot honestly claim `9.5+` overall if `Frontend Test Health` is left untouched and still counted in the score.

Per your instruction, frontend testing is deprioritized from the critical path. To keep the scorecard structurally complete, this plan still includes a deferred frontend-test section, but the primary recovery target assumes the next high-stakes re-score excludes that heading until its deferred actions are executed.

## Target State

- Architecture: `>= 9.5`
- Code Quality: `>= 9.5`
- Modularity: `>= 9.4`
- Backend Test Health: `>= 9.5`
- Frontend Test Health: deferred from critical-path scoring by request
- Worker Test Health: `>= 9.5`
- Maintainability: `>= 9.5`
- Reliability: `>= 9.6`
- Security: `>= 9.6`
- Developer Experience: `>= 9.4`
- Operational Readiness: `>= 9.6`
- Refactor Safety: `>= 9.5`
- Overall Health: `>= 9.5` after implementation and independent re-audit under the scoped scoring assumption above

## Execution Rules

1. No new feature work ships ahead of `Now` priority health items unless it is legally or operationally mandatory.
2. Every completed recovery item must leave evidence: code, tests, docs, or deploy/ops proof.
3. Every structural change must update `architecture/`.
4. No health item is considered done until its regression guard exists.
5. No “partial credit” on release safety, worker delivery safety, or tenant-isolation credibility.

## Suggested Program Waves

- Wave 0: Release safety, worker delivery safety, RLS credibility, approval atomicity
- Wave 1: Test trust restoration, worker observability, health-check depth
- Wave 2: Boundary restoration and hotspot decomposition
- Wave 3: Maintainability, DX, and refactor-safety automation
- Wave 4: Deferred frontend-test hardening and final re-audit

## Architecture

Target: move from porous modular monolith to explicit ownership-based modular monolith.

1. Create a module ownership registry in `architecture/` that names the owner module for every shared table family.
2. Define and document an approved cross-module read policy, with “allowed via facade only” as the default.
3. Introduce a `students` read facade and migrate all non-owner consumers off direct `student` table reads.
4. Introduce a `staff-profile` read facade and migrate analytics and wellbeing consumers off direct foreign reads.
5. Introduce a `memberships-permissions` control-plane facade so control-plane reads stop leaking into arbitrary services.
6. Introduce an `academic-periods-and-enrolments` read facade for gradebook, scheduling, and reporting surfaces.
7. Introduce an `attendance-summary` read facade for report cards, regulatory, and risk-detection consumers.
8. Split `BehaviourModule` into internal submodules for incident core, sanctions, interventions, analytics, and parent-facing projections.
9. Split `PastoralModule` into internal submodules for concern lifecycle, sharing/reporting, and child-protection integration.
10. Split `GradebookModule` internally so report-card generation, lifecycle, and transcript/query concerns are separated.
11. Replace `forwardRef` cycles with explicit interface-driven dependencies or event-driven handoff where possible.
12. Add architecture tests that fail when non-owner modules query protected foreign tables directly.
13. Add architecture tests that fail when a module exports more than its approved public facade surface.
14. Shrink `packages/shared/src/index.ts` so the root barrel exports only common primitives and stable core contracts.
15. Require an ADR for every new cross-cutting dependency, global guard, or new shared contract at the root barrel level.

## Code Quality

Target: remove hotspot entropy and make the codebase easier to reason about under change.

1. Set hard file-size budgets for service, controller, and page files, with explicit exception process.
2. Set hard public-method-count budgets for services to prevent new control-center classes from forming.
3. Convert silent or near-silent catches into logged, contextual failure paths everywhere they appear in backend and worker hot paths.
4. Promote `import/order` from warning to error so structural drift stops landing quietly.
5. Promote the project’s “no silent failure” rule into automated lint enforcement.
6. Expand the raw-SQL rule so it covers `$queryRaw` and `$executeRaw`, not only `Unsafe` variants.
7. Add a lint rule or codemod gate that blocks new hand-rolled forms where the project standard is `react-hook-form` plus Zod.
8. Add a lint or review gate for untranslated human-facing strings in app code.
9. Standardize logger naming and structured context fields across API and worker services.
10. Remove stale TODO/HACK/TEMP markers from production-critical files and convert any real debt to tracked issues.
11. Move complex mapping and projection logic into dedicated helpers or builders instead of embedding it inside large services.
12. Introduce shared typed domain helpers for finance invariants, approval state transitions, and notification status handling.
13. Require every non-trivial service to expose one clear responsibility statement in code comments or ADR form.
14. Add hotspot-focused code review checklists for modules already identified as high risk in the audit.
15. Track top 20 largest files weekly and require a documented reduction plan for any file that keeps growing.

## Modularity

Target: make module boundaries materially true, not just folder-deep.

1. Define a single public API surface for every module and stop exporting internal helpers by default.
2. Add subpath exports in `@school/shared` and forbid importing domain-specific contracts from the root barrel.
3. Introduce per-module “public facade” files and route all cross-module interactions through them.
4. Separate command-side and query-side responsibilities inside hotspot modules.
5. Replace direct cross-domain Prisma reads with anti-corruption query adapters where full facades are not yet ready.
6. Move queue-emission logic behind module-local side-effect services so domain services do not scatter job dispatch calls.
7. Add dependency visualization output to `architecture/` so the live module graph is regenerated automatically.
8. Fail CI when new cross-module dependencies appear without an architecture update.
9. Group related controllers and providers under internal module slices instead of one oversized module export surface.
10. Reduce `AppModule` cognitive load by composing feature groups or documented registration blocks where useful.
11. Establish “module exit criteria” for future extraction candidates, but do not extract before internal boundaries are real.
12. Add contract tests for every public module facade once the facade exists.
13. Prevent new global singletons or global guards without blast-radius review.
14. Introduce module-level READMEs that document purpose, inbound dependencies, outbound dependencies, and queue/event side effects.
15. Review and reduce each hotspot module’s exported provider count until only true public services remain.

## Backend Test Health

Target: make backend green signals trustworthy for refactoring and release decisions.

1. Make the backend integration/RLS/e2e lane a required CI check, not an optional secondary run.
2. Create a single canonical “backend health” command that runs unit, integration, RLS, performance sanity, and e2e-critical suites.
3. Add invariant-focused unit tests for `PaymentsService.confirmAllocations()` covering every transaction branch.
4. Add concurrency-oriented tests for finance sequence generation, payment allocation, and approval-linked state changes.
5. Add end-to-end tests for approval request creation plus entity transition across finance, payroll, and admissions.
6. Add negative tests for control-plane tenant-resolution and permission-loading edge cases.
7. Replace real-time-dependent assertions with fixed clocks or fake timers in sampled flaky/time-sensitive suites.
8. Remove conditional assertions in e2e tests that accept multiple outcomes based on state ambiguity.
9. Add explicit cross-tenant backend tests for high-risk domains such as finance, gradebook, behaviour, and approvals.
10. Introduce transaction-realism integration tests for services that currently mock RLS helpers as pass-throughs.
11. Add mutation or differential assertions for the most critical auth, approval, and finance services.
12. Require controller specs for all security-sensitive routes to assert guards, permissions, and request-to-service mapping.
13. Add fixture builders that create deterministic tenant-separated datasets so multi-tenant tests are easier to write.
14. Track flaky suites and assign a “fix within one sprint” SLA to any backend suite that becomes non-deterministic.
15. Fail PR review if risky backend changes land without either characterization tests or expanded regression coverage.

## Frontend Test Health

Status: deferred from the critical path by request, but included here so no scorecard heading is empty.

1. Add behavioral Playwright journeys for login, student create/edit, attendance mark-and-save, invoice flow, and approval flow.
2. Keep the visual suite, but reclassify it as appearance regression rather than journey coverage.
3. Introduce Testing Library for mounted component tests of role gating, navigation, and form interaction.
4. Replace mirrored route-map specs with tests that import the production route configuration.
5. Replace mirrored navigation specs with tests that render the real shell and inspect actual nav output.
6. Add locale-aware assertions for Arabic/RTL on at least the highest-traffic shells.
7. Add form-submission success and error-state tests for critical administrative pages.
8. Add contract tests for notification panel polling, mark-read behavior, and outside-click close behavior.
9. Add mounted tests for global search debounce, loading, navigation, and empty/error states.
10. Add smoke journeys for mobile navigation and Arabic shell rendering.
11. Add regression tests for hardcoded English labels once i18n fixes start landing.
12. Add route-authorization tests that verify actual redirects and denied content in browser context.
13. Add at least one end-to-end test for a parent-facing path and one for a teacher/admin path.
14. Gate critical UI refactors on the behavioral browser suite, not only on Jest.
15. Re-introduce frontend testing into the main scoring model once these actions are executed and passing in CI.

## Worker Test Health

Target: make worker behavior, retries, and tenant safety trustworthy under change.

1. Create a processor coverage registry that lists every processor, owner, and current spec status.
2. Require every new processor to ship with a direct processor spec before merge.
3. Add direct specs for `dispatch-queued.processor.ts`.
4. Add direct specs for `retry-failed.processor.ts`.
5. Add direct specs for payroll processors, especially approval callbacks and payslip-generation paths.
6. Add direct specs for early-warning compute processors and daily risk-detection paths.
7. Add direct specs for regulatory processors and any reporting/export processors they depend on.
8. Add direct specs for behaviour policy evaluation and critical escalation processors.
9. Add direct specs for scheduling solver processors, especially `solver-v2.processor.ts`.
10. Add explicit tenant-isolation tests for processors that loop across tenants manually rather than using `TenantAwareJob`.
11. Add retry-exhaustion, backoff, and failure-path tests as a standard checklist across processor suites.
12. Add idempotency rerun tests for processors that touch external providers or produce user-visible side effects.
13. Add worker integration tests that run against real Redis and Postgres test instances for critical queues.
14. Add queue payload-schema contract tests so enqueue and consume sides cannot silently drift.
15. Publish worker coverage reports by domain and fail CI if critical-domain processor coverage regresses.

## Maintainability

Target: lower change friction across the repo, especially in hotspot files and critical domains.

1. Define and enforce a hotspot-reduction program for the top 20 largest backend files.
2. Define and enforce a hotspot-reduction program for the top 20 most complex worker and frontend files.
3. Break `ConcernService` into lifecycle, sharing, and child-protection integration slices.
4. Break `BehaviourStudentsService` into query, analytics, and parent-view projection slices.
5. Break `WorkloadComputeService` into personal, aggregate, trend, and compatibility-adapter slices.
6. Break `ReportCardsService` into generation, lifecycle, cache invalidation, and transcript/query slices.
7. Introduce complexity budgets using static analysis and fail CI on new violations in hotspot areas.
8. Convert repeated cross-domain query patterns into reusable owner-approved query services.
9. Convert repeated approval-linking patterns into one transaction-aware helper abstraction.
10. Require architecture doc updates as part of every hotspot refactor PR.
11. Remove commented-out code and dead branches from critical modules.
12. Establish quarterly “maintenance-only” capacity dedicated to hotspot reduction and doc cleanup.
13. Add file-level ownership metadata or CODEOWNERS routing for the most sensitive modules.
14. Introduce “change cost” review notes for hotspots so reviewers do not underestimate blast radius.
15. Recompute and publish hotspot metrics after each wave so reduction is measured, not assumed.

## Reliability

Target: make asynchronous work, state transitions, and health reporting robust under failure.

1. Introduce a true claim or lease state for notifications before dispatch jobs are enqueued.
2. Register the failed-notification retry processor on a repeatable schedule or merge its logic into the queue poller.
3. Move external provider sends out of long-lived Prisma transactions.
4. Add idempotency keys or dedupe protection for outbound notification sends.
5. Add BullMQ `timeout` settings and provider request deadlines for critical worker queues.
6. Add a dead-letter or parking-lot strategy for permanently failing jobs.
7. Make approval request creation and domain-state transition one transaction everywhere.
8. Add a uniqueness guard preventing multiple open approval requests for the same entity/action/tenant.
9. Persist per-tenant cron failures to durable operational state instead of logs only.
10. Expand API and worker health checks to cover all critical queues, not only notifications.
11. Replace search “health by fallback” with explicit Meilisearch connectivity and degraded/down semantics.
12. Add worker readiness checks for Redis, database, queue registration, and essential provider configuration.
13. Implement graceful shutdown and queue drain handling for worker restarts and deploys.
14. Add replay and reconciliation tooling for stuck approval callbacks and failed delivery paths.
15. Run synthetic canary jobs in production to verify that queue scheduling, dispatch, and callback execution still work.

## Security

Target: make the multi-tenant security story internally consistent and defensible.

1. Run the main application role as non-superuser and non-`BYPASSRLS`.
2. Add a startup assertion that fails if the runtime DB role can bypass RLS.
3. Move tenant-domain lookup onto a deliberate control-plane path that does not depend on weakening the tenant data path.
4. Move permission-loading onto a deliberate control-plane path with clearly bounded data exposure.
5. Encrypt MFA TOTP secrets at rest using the existing encryption facilities or a dedicated KMS-backed wrapper.
6. Rotate any currently stored MFA secrets into the encrypted format with a verified migration path.
7. Expand the raw-SQL lint rule into a full raw-SQL governance system with allowlisting and wrappers.
8. Add CI tests that exercise critical flows under a non-bypass DB role.
9. Add direct security regression tests for cross-tenant reads on control-plane-adjacent services.
10. Review and harden password-reset and invitation delivery paths before they are considered production-complete.
11. Expand audit logging to cover all privileged administrative actions and security-sensitive state changes.
12. Add dependency vulnerability scanning and severity-based fail gates to CI.
13. Add secret inventory and rotation schedules for all runtime secrets, encryption keys, and provider credentials.
14. Run a focused security design review before any new finance, payroll, GDPR, or control-plane features land.
15. Conduct periodic security tabletop exercises for tenant-isolation breach, queue replay, and credential-compromise scenarios.

## Developer Experience

Target: make safe work faster and unsafe work harder.

1. Standardize on one env-file convention and make runtime, docs, and setup scripts agree.
2. Align `.env.example`, `README.md`, setup scripts, and runtime validation so no variable-name drift remains.
3. Add a `pnpm doctor` command that validates env, dependency state, local services, and generated artifacts.
4. Add a one-command full local validation script for lint, type-check, backend health tests, and worker critical tests.
5. Add faster targeted validation commands for changed modules and critical domains.
6. Improve env-validation error messages so missing or incorrect variables fail clearly and quickly.
7. Add deterministic local seed profiles for common school roles and scenarios.
8. Add bootstrap scripts for local Redis/Postgres/Meilisearch setup and verification.
9. Add a PR template that includes architecture, test-lane, ops, and rollback questions.
10. Add CODEOWNERS or equivalent routing for critical modules so reviews are not accidental.
11. Automate architecture pre-flight checks so they are not purely social.
12. Add developer docs for worker debugging, failed-job replay, and queue inspection.
13. Publish live module/test/processor metrics in a generated internal dashboard or markdown report.
14. Reduce “surprise CI differences” by aligning local and CI validation commands as closely as possible.
15. Add an onboarding runbook that gets a new contributor from clone to green local validation without guesswork.

## Operational Readiness

Target: make production release, rollback, observability, and recovery credible.

1. Gate deploy execution on successful CI completion.
2. Deploy a pinned commit SHA or immutable build artifact instead of `git pull origin main`.
3. Remove the `pnpm install --frozen-lockfile || pnpm install` fallback from production deploys.
4. Move to versioned release directories or another immutable-release pattern on the server.
5. Add worker smoke tests to deploy validation, not only web and API checks.
6. Add queue-depth, retry, failure, and stuck-job alerts for critical queues.
7. Wire worker error reporting into Sentry or an equivalent observability stack.
8. Add worker env validation equivalent to the API’s startup validation.
9. Add a deploy preflight that verifies database connectivity, migration preconditions, Redis connectivity, and required secrets.
10. Add a post-migration verification step that confirms critical RLS policies, triggers, and queue tables are intact.
11. Keep PM2 or process-manager config in the repo so runtime behavior is versioned and reviewable.
12. Add a one-command rollback path that restores the previous release safely.
13. Run regular restore and rollback drills and record recovery times.
14. Add operational dashboards for API health, worker health, queue health, search health, and delivery-provider health.
15. Establish weekly operational review of alerts, failed jobs, deploy outcomes, and unresolved degradations.

## Refactor Safety

Target: make structural change possible without gambling on intuition.

1. Define a refactor risk matrix with required safeguards by risk class.
2. Require characterization tests before changing any hotspot service or cross-cutting workflow.
3. Require the full backend health lane for any refactor touching finance, approvals, auth, tenant resolution, or shared tables.
4. Use feature flags or tenant-scoped rollout switches for risky behavioral refactors.
5. Separate structural refactors from behavioral changes unless there is a compelling reason not to.
6. Introduce codemods or scripted migrations for large facade-adoption changes so they are consistent.
7. Create a schema-change playbook that includes ownership impact analysis and cross-module read impact.
8. Add shadow-read or dual-read validation patterns where a risky query path is being replaced.
9. Add pre-merge blast-radius notes to PRs for hotspot refactors.
10. Require rollback notes for any risky refactor before merge.
11. Benchmark critical performance paths before and after major refactors.
12. Re-run module metrics and hotspot metrics after each major refactor wave.
13. Do not allow “cleanup PRs” to bypass test and architecture gates just because they claim to be non-functional.
14. Add post-refactor audit notes to `architecture/` documenting what changed and what remaining risks exist.
15. Schedule mini re-audits after each major wave instead of waiting for one final all-or-nothing review.

## Overall Health

Target: make system health a managed product of the engineering process, not a one-off cleanup.

1. Turn the audit risk ledger into a tracked recovery backlog with owners, due dates, and evidence-of-done fields.
2. Re-rank all roadmap work against the health backlog so high-risk debt is not crowded out by feature work.
3. Reserve a fixed percentage of delivery capacity for health work until the re-audit target is met.
4. Publish a monthly scorecard update tied to actual evidence, not sentiment.
5. Re-run the static health audit after Wave 1, Wave 3, and final completion.
6. Add a “no new debt without a written tradeoff” rule for architecture, testing, and ops shortcuts.
7. Require every critical or high-severity risk to have an explicit retirement plan and due date.
8. Track time-to-detect and time-to-recover for operational incidents and use them as health KPIs.
9. Track hotspot count, queue-failure count, flaky-test count, and direct-foreign-read count as top-level health metrics.
10. Block major expansion-phase work until Wave 0 and Wave 1 items are complete.
11. Require proof of regression protection before declaring any risk retired.
12. Keep architecture docs, runbooks, and scorecard evidence in the same repo so health is versioned with code.
13. Hold a weekly health review until the system exits the high-risk band.
14. Treat every new critical workflow as incomplete until code, tests, ops, docs, and rollback evidence all exist.
15. Do a final independent re-audit only after all `Now` and `Next` items are complete and verified.

## Success Criteria For A 9.5 Re-Audit

The next high-stakes re-audit should not claim `>= 9.5` overall unless all of the following are true:

1. Deploys are CI-gated, pinned, reproducible, and rollback-ready.
2. Worker delivery semantics are claim-safe, retry-safe, idempotent, and observable.
3. Approval flows are transactionally consistent across all affected modules.
4. Control-plane tenant-isolation exceptions are removed or explicitly isolated without weakening the main RLS story.
5. Backend and worker tests are strong enough that refactors can be trusted.
6. Hotspot modules are materially smaller, better bounded, and better documented.
7. Architecture and coding rules are enforced by automation, not only by discipline.
8. The re-audit can support every major claim with direct evidence.
