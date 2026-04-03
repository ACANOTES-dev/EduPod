# Health Recovery Plan

Target outcome: raise overall health from `6.0/10` to `>9.0/10` without changing the product scope.

Target gate: `9.2+` overall health after all `Now` and `Next` items below are complete and re-audited.

## 1. Non-Negotiable Gate Before Claiming 9.0+

Do not claim the codebase is `9.0+` healthy unless all of these are true:

1. No High-severity open security findings remain.
2. No High-severity deploy/recoverability gaps remain.
3. Approval callback self-heal and reporting paths are schema-safe and observable.
4. Boundary enforcement is working against the real registry path and violation budget is materially reduced.
5. Payroll, behaviour, gradebook analytics, and critical frontend flows have materially stronger tests than today.
6. Anonymous survey access is enforced by runtime/lint guardrails, not by convention alone.
7. Worker telemetry, scheduler health, and off-site backup/restore automation are repo-wired and exercised.

## 2. Score-Lift Strategy

- First remove live-risk issues that can leak data or strand production.
- Then repair confidence systems: tests, health, boundary checks, coverage truth.
- Only then spend effort on structural decomposition, because refactoring hotspot modules before fixing guardrails is how a `6/10` system becomes a `4/10` system.

## 3. Wave Plan

### Wave 1: Live-Risk Containment

Goal: eliminate the security and deploy defects that most directly threaten production.

Actions:

- Add `PermissionGuard` and explicit permission metadata to [`apps/api/src/modules/search/search.controller.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.controller.ts), pass user context into the service, and block blank-query directory enumeration unless explicitly authorized.
- Change login tenant selection so request-body `tenant_id` cannot override a host-resolved tenant mismatch in [`apps/api/src/modules/auth/auth.controller.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth.controller.ts).
- Replace free-form approval callback status strings with a bounded shared enum/value set that fits schema limits, and move verbose reasons into `callback_error`.
- Import worker instrumentation from [`apps/worker/src/main.ts`](/Users/ram/Desktop/SDB/apps/worker/src/main.ts) so background failures are captured uniformly.
- Make `/api/health/ready` a real readiness contract and use it in deploy smoke defaults.

Exit criteria:

- Search endpoint unauthorized requests fail at the controller level.
- Approval callback “unexpected state” branch is covered by a regression test using the real schema value constraints.
- Worker boot path initializes telemetry in test or smoke verification.
- Deploy smoke uses readiness, not generic health.

Projected score lift:

- Security: `+1.0`
- Reliability: `+0.5`
- Operational readiness: `+0.5`

### Wave 2: Recoverability And Operational Safety

Goal: make failed deploys and host failures survivable.

Actions:

- Extend [`scripts/deploy-production.sh`](/Users/ram/Desktop/SDB/scripts/deploy-production.sh) and the operational runbooks so schema-changing deploy rollback is either:
  - expand/contract only by policy, or
  - coupled with a tested DB restore path from the predeploy dump.
- Wire [`scripts/backup-replicate.ts`](/Users/ram/Desktop/SDB/scripts/backup-replicate.ts) into a repo-managed scheduled job with failure alerting.
- Run and record a restore drill from the off-site artifact, not only same-host dumps.
- Stop swallowing restore failures with permissive `|| true` patterns in drill automation where they hide materially bad outcomes.
- Surface worker degradation, missing schedulers, and stuck critical queues clearly in admin health.

Exit criteria:

- A failed schema-changing deploy has a documented and tested rollback path.
- Off-site replication is automatic and monitored.
- Restore drill proves an off-site artifact can be restored and validated.
- Health surfaces distinguish `healthy`, `degraded`, and `unhealthy` across API and worker.

Projected score lift:

- Operational readiness: `+1.0`
- Reliability: `+0.5`
- DX: `+0.25`

### Wave 3: Confidence Systems Repair

Goal: make tests and guardrails tell the truth.

Actions:

- Add `collectCoverageFrom` to [`apps/api/jest.config.js`](/Users/ram/Desktop/SDB/apps/api/jest.config.js), emit reliable coverage artifacts, and fix `coverage-by-module` / coverage gate scripts so they measure source coverage rather than changed-file/spec-pair heuristics.
- Repair [`scripts/check-module-boundaries.ts`](/Users/ram/Desktop/SDB/scripts/check-module-boundaries.ts) to use the real registry path and reduce the standing violation budget substantially.
- Add a lint/CI rule that forbids `surveyResponse` and `surveyParticipationToken` access outside an approved allowlist, analogous to raw SQL governance.
- Update onboarding and self-check tooling so docs, `doctor`, and build artifact expectations match the actual build outputs and required `db:post-migrate` step.

Exit criteria:

- Coverage reports match actual source universe.
- Boundary checker runs in this checkout and gates regressions.
- Survey exception guardrail fails CI on unauthorized access sites.
- Docs and `doctor` agree with actual bootstrap/build paths.

Projected score lift:

- Backend test health: `+1.0`
- Maintainability: `+0.5`
- Modularity: `+0.5`
- DX: `+0.5`

### Wave 4: Hotspot Refactor Enablement

Goal: shrink the blast radius of the biggest domains before feature expansion.

Actions:

- Split [`apps/api/src/modules/behaviour/behaviour.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour.service.ts) and [`apps/api/src/modules/behaviour/behaviour-sanctions.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour-sanctions.service.ts) into workflow-specific services.
- Move gradebook cross-domain analytics onto a dedicated read model or analytics facade, replacing direct `classStaff` reads and looped assessment fetches in [`apps/api/src/modules/gradebook/analytics/analytics.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/gradebook/analytics/analytics.service.ts).
- Decompose [`apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/workload-compute.service.ts) into injected query/aggregation collaborators.
- Reduce `@school/shared` root-barrel usage and require domain subpath imports for domain contracts.
- Update architecture docs and module READMEs in the same changes that alter boundaries.

Exit criteria:

- Behaviour and gradebook workflows are split into smaller application services with clearer seams.
- Shared-kernel import discipline is measurably tighter.
- Architecture docs reflect the current module graph, not stale cycles.

Projected score lift:

- Architecture: `+1.0`
- Modularity: `+1.0`
- Code quality: `+0.5`
- Maintainability: `+1.0`

### Wave 5: Critical Test Expansion

Goal: make the most dangerous changes safe to ship.

Actions:

- Add backend characterization tests for payroll run finalization, approval-required payroll flows, refresh/update paths, and payslip side effects.
- Add backend regression tests for search permissions and login tenant/body mismatch handling.
- Add Playwright journeys for attendance mark-and-save, student create/edit, behaviour incident creation, invoice issue/payment capture, and payroll run progression.
- Add React Testing Library coverage for the highest-value stateful pages/components that currently rely on mirrored helpers or logic-only tests.
- Add worker failure-contract tests for approvals, finance/payroll callbacks, regulatory jobs, and scheduler registration health.

Exit criteria:

- Payroll no longer sits below the rest of the backend in trustworthiness.
- Search/Auth permission boundaries are locked in by tests.
- Frontend refactor safety is no longer dominated by visual and smoke coverage.
- Worker tests cover retry/backoff/idempotency in all major queue families.

Projected score lift:

- Backend test health: `+1.0`
- Frontend test health: `+2.0`
- Worker test health: `+0.75`
- Refactor safety: `+1.5`

### Wave 6: 9.2 Gate Audit

Goal: verify the score improvement with evidence rather than assumption.

Actions:

- Re-run lint, type-check, build, backend tests, worker tests, shared tests, integration tests, visual/journey tests, RLS audit, raw SQL governance, boundary checks, coverage reports, restore drill, and scheduler health checks.
- Re-score the repository against the same anchored scale used in this audit.
- Reject the `9.0+` claim if any High-severity item remains open or if any recovery gate is unproven.

## 4. Immediate Work Order

If only a small amount of work can be done first, do this in order:

1. Lock down search authorization.
2. Fix approval callback status persistence and reporting.
3. Make rollback/recoverability real for schema-changing deploys.
4. Load worker instrumentation and promote readiness to a real gate.
5. Repair coverage truth and boundary checker truth.
6. Add payroll and critical frontend journey coverage.

## 5. Target Scores After Completion

If Waves 1-5 are completed and Wave 6 passes, the intended score band is:

- Architecture: `9.0`
- Code Quality: `9.0`
- Modularity: `9.0`
- Backend Test Health: `9.0`
- Frontend Test Health: `8.5+`
- Worker Test Health: `9.0`
- Maintainability: `9.0`
- Reliability: `9.0`
- Security: `9.0`
- Developer Experience: `9.0`
- Operational Readiness: `9.0`
- Refactor Safety: `9.0+`
- Overall Health: `9.2+`

## 6. What This Plan Deliberately Does Not Do

- It does not propose new product features.
- It does not require microservice extraction.
- It does not rely on “more documentation” as the primary fix.
- It does not treat test count inflation as success.
- It does not call the codebase `9+` until recoverability, authorization, boundary enforcement, and hotspot refactor safety are all evidenced.
