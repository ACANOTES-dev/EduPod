# Master Audit Report

Timestamp: `20260403T130928+0100`

## 1. Executive Summary

This repository is not broken, but it is not decision-grade healthy either. The direct evidence supports an overall health judgment of `6.0/10`: the monorepo has real architectural intent, strong governance around RLS and raw SQL, passing core build and test signals, and several well-characterized backend domains, but it also has live weaknesses that materially reduce scale safety and refactor safety. The biggest risks are a real RBAC/privacy gap in search, production rollback that restores code but not database state, an approval-callback defect that can break self-healing flows, soft or broken boundary enforcement around the largest backend domains, overstated backend coverage confidence in payroll, and shallow frontend protection for critical school workflows.

## 2. System Overview

This is a Turborepo monorepo with three main apps: [`/Users/ram/Desktop/SDB/apps/api`](/Users/ram/Desktop/SDB/apps/api), [`/Users/ram/Desktop/SDB/apps/web`](/Users/ram/Desktop/SDB/apps/web), and [`/Users/ram/Desktop/SDB/apps/worker`](/Users/ram/Desktop/SDB/apps/worker). Shared contracts and infrastructure live mainly in [`/Users/ram/Desktop/SDB/packages/shared`](/Users/ram/Desktop/SDB/packages/shared), [`/Users/ram/Desktop/SDB/packages/prisma`](/Users/ram/Desktop/SDB/packages/prisma), [`/Users/ram/Desktop/SDB/packages/ui`](/Users/ram/Desktop/SDB/packages/ui), and [`/Users/ram/Desktop/SDB/packages/eslint-config`](/Users/ram/Desktop/SDB/packages/eslint-config). The backend is a NestJS modular monolith with `59` top-level feature modules wired through [`/Users/ram/Desktop/SDB/apps/api/src/app.module.ts`](/Users/ram/Desktop/SDB/apps/api/src/app.module.ts); the frontend is a large Next.js App Router surface with `337` route pages; the worker service contains `93` processors. Deployment is repo-managed through [`.github/workflows/ci.yml`](/Users/ram/Desktop/SDB/.github/workflows/ci.yml) onto a single Hetzner VPS using PM2 and [`/Users/ram/Desktop/SDB/scripts/deploy-production.sh`](/Users/ram/Desktop/SDB/scripts/deploy-production.sh).

## 3. Shared Fact Pack Summary

### Facts

- Repo-wide discovery in Phase 1 found `3458` TypeScript/TSX files, `59` backend modules, `337` frontend route pages, `93` worker processors, and `265` Prisma models.
- The largest backend domains by sampled line count are `behaviour` (`24,104` lines), `pastoral` (`19,810`), `gradebook` (`15,635`), `finance` (`7,637`), and `scheduling` (`7,393`).
- Cross-module import hotspots are led by `gradebook` (`32`), `pastoral` (`23`), `staff-wellbeing` (`21`), `gdpr` (`21`), and `behaviour` (`20`).
- Core validation commands passed:
  - `cd apps/api && pnpm test` passed with `567` suites and `7,785` tests.
  - `cd apps/worker && pnpm test` passed with `100` suites and `666` tests.
  - `cd packages/shared && pnpm test` passed with `28` suites and `746` tests.
  - `pnpm turbo run lint` passed with `296` warnings and `0` errors.
  - `pnpm turbo run type-check` passed.
  - `pnpm turbo run build` passed.
- Governance checks passed:
  - `npx tsx scripts/audit-rls.ts` reported `252` tenant-scoped models and `252` canonical RLS policies, with only documented exceptions.
  - `node scripts/check-raw-sql-governance.js` reported `0` ungoverned production raw-SQL call sites.
- CI and deploy are consolidated in [`.github/workflows/ci.yml`](/Users/ram/Desktop/SDB/.github/workflows/ci.yml), which defines `ci`, `deploy`, `integration`, and `visual` jobs.

### Strong Signals

- This is a governed codebase, not a casual one. The repo contains explicit architecture docs, custom ESLint rules, RLS auditing, raw-SQL allowlists, boundary-check tooling, restore-drill automation, and health surfaces.
- The best backend domains are materially stronger than the repo average. Auth, attendance, payment allocation, and parts of scheduling are meaningfully tested and structurally clearer than the main hotspot domains.
- The weakest areas cluster rather than spread evenly. Search authorization, behaviour, gradebook analytics, payroll orchestration, deploy recoverability, worker telemetry, and frontend critical-flow coverage account for most of the material risk.

### Inferences

- The system is safe to continue operating and extending in carefully chosen slices, but it is not yet safe to treat as broadly refactorable or comfortably scalable.
- The biggest gap is not missing intent. It is that control systems have not fully kept pace with product complexity.
- The repo is closer to “serious but stretched” than to “fragile everywhere.”

## 4. Build / Run / Test Findings

The core local validation signals were good. Backend, worker, and shared-package unit suites all passed cleanly, with no open-handle warnings or forced-exit warnings observed in those runs. Monorepo lint, type-check, and build also passed. RLS and raw-SQL governance checks passed and materially increased confidence that the strongest platform-safety policies are real rather than aspirational.

The main failed validation during the audit was architectural boundary enforcement: `pnpm check:boundaries -- --max-violations 9999` failed locally because [`/Users/ram/Desktop/SDB/scripts/check-module-boundaries.ts`](/Users/ram/Desktop/SDB/scripts/check-module-boundaries.ts) still points to `architecture/module-ownership.json` while the repo now stores that file under [`/Users/ram/Desktop/SDB/docs/architecture/module-ownership.json`](/Users/ram/Desktop/SDB/docs/architecture/module-ownership.json). That failure matters because CI still advertises the checker as a guardrail.

What was not rerun matters too. This audit did not rerun the full monorepo `turbo test`, backend integration suites, or Playwright journeys/visuals locally, and it did not inspect the live production host. That lowers certainty around full-stack route behavior, deployment reality, and runtime alerting posture.

## 5. Test Health Assessment

Overall refactor trust is mixed.

- Backend test trust: moderate.
  Evidence: the API suite is large and passed cleanly; sampled service specs for auth, attendance, finance, and scheduling are meaningful characterization tests; but backend coverage governance overstates certainty because [`/Users/ram/Desktop/SDB/apps/api/jest.config.js`](/Users/ram/Desktop/SDB/apps/api/jest.config.js) does not set `collectCoverageFrom`, and [`/Users/ram/Desktop/SDB/scripts/check-test-coverage-gate.sh`](/Users/ram/Desktop/SDB/scripts/check-test-coverage-gate.sh) only checks whether corresponding specs changed.
- Frontend test trust: low.
  Evidence: the fact pack found `337` route pages and only `32` frontend test files; the sampled login journey is real, but the sampled attendance journey is mostly smoke coverage and the sampled payroll E2E is visual-only; a targeted scan found no React Testing Library usage in frontend specs.
- Worker test trust: moderately good.
  Evidence: the worker has direct processor/spec pairing across the current processor fleet, [`/Users/ram/Desktop/SDB/apps/worker/src/base/tenant-aware-job.spec.ts`](/Users/ram/Desktop/SDB/apps/worker/src/base/tenant-aware-job.spec.ts) gives real tenant-safety coverage, and the sampled notifications processor spec exercises retries and dead-letter behavior. The main weakness is uneven failure-contract depth across queue families.

Judgment: the backend suite is trustworthy for targeted refactors in already-strong domains, the worker suite is trustworthy for many unit-level changes but not for every operational failure mode, and the frontend suite is not yet strong enough to protect critical user workflows under change.

## 6. Module Health Matrix

| Module                            | Purpose                                                   | Risk        | Test Health                         | Architecture Health       | Security / Reliability Concern                                     | Refactor Priority |
| --------------------------------- | --------------------------------------------------------- | ----------- | ----------------------------------- | ------------------------- | ------------------------------------------------------------------ | ----------------- |
| Auth                              | Login, sessions, MFA, password reset                      | Medium      | Strong                              | Good                      | Tenant selection edge in login controller                          | Medium            |
| RBAC / GDPR / Common Guards       | Permissions, DPA, request gating                          | Medium      | Moderate                            | Good                      | Search route bypasses permission layer                             | Medium            |
| Search                            | Tenant search across students, parents, staff, households | High        | Weak                                | Thin module, weak control | Missing RBAC on directory-style search                             | Now               |
| Behaviour                         | Incidents, sanctions, appeals, exclusions                 | High        | Moderate                            | Weak hotspot              | Large multi-responsibility services and large UI pages             | Now               |
| Pastoral                          | Interventions, safeguarding-related flows                 | Medium-High | Moderate                            | Mixed                     | Large services but cleaner than behaviour                          | Next              |
| Gradebook                         | Assessment, analytics, grading                            | High        | Moderate                            | Weak hotspot              | Cross-domain reads and looped analytics queries                    | Now               |
| Attendance                        | Attendance write/read flows                               | Medium      | Strong                              | Good                      | Lower risk than other school-core domains                          | Later             |
| Finance                           | Invoices, payments, approvals                             | Medium-High | Strong in payments, mixed elsewhere | Mixed                     | Approval callback defect crosses this path                         | Next              |
| Payroll                           | Runs, approvals, payslips, calendar                       | High        | Weak for critical orchestration     | Mixed                     | Coverage confidence overstated; approval path fragile              | Now               |
| Scheduling                        | Timetabling and solver orchestration                      | Medium      | Strong                              | Fair                      | Complex but comparatively well characterized                       | Later             |
| Communications                    | Notifications, announcements                              | Medium      | Moderate                            | Fair                      | Callback/status path and worker retry coverage uneven              | Next              |
| Staff Wellbeing                   | Surveys, workload, moderation                             | Medium-High | Moderate                            | Mixed                     | Anonymous survey exception and large workload service              | Next              |
| Approvals + Worker Callback Path  | Approval requests, callback processors                    | High        | Mixed                               | Mixed                     | `callback_status` contract bug and inconsistent reporting          | Now               |
| Health / Cron / Worker Monitoring | Readiness, queue health, scheduler                        | Medium-High | Mixed                               | Mixed                     | Worker telemetry gap, readiness flattening, partial queue coverage | Next              |

The fuller matrix is saved separately at [`/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/module-health-matrix_20260403T130928+0100.md`](/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/module-health-matrix_20260403T130928+0100.md).

## 7. Deep Dive: Highest-Risk Modules

### Search

Why it matters: search is effectively a tenant-wide directory endpoint over students, parents, staff, and households. That makes authorization precision more important than in an ordinary convenience API.

Strengths: tenant filtering exists in the service path, so this is not a cross-tenant RLS bypass.

Weaknesses: [`/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.controller.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.controller.ts) uses `AuthGuard` without `PermissionGuard`, defaults a blank query string, and allows broad entity-type search. [`/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.service.ts) returns directory-style results without permission-aware scoping.

Likely failure mode: staff who should not have broad directory visibility can enumerate sensitive tenant data inside their own school boundary.

Remediation direction: require explicit permissions per entity family, require a non-trivial search term or stricter scoped filters, and add controller-level integration coverage for allowed and denied roles.

### Behaviour

Why it matters: this is the largest backend domain in the repo and a directly user-facing school workflow with compliance, parent communication, document generation, and appeals impact.

Strengths: the root module split is real. [`/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour.module.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour.module.ts) is not a single-file module shell.

Weaknesses: behaviour still contains internal mini-monoliths. [`/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour-sanctions.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour-sanctions.service.ts) mixes validation, numbering, settings reads, suspension-day logic, history writes, optional documents, queue side effects, and exclusion orchestration. [`/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/behaviour/behaviour.service.ts) also shows “god service” characteristics. On the frontend, [`/Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx`](</Users/ram/Desktop/SDB/apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx>) is a large state-heavy page with untranslated strings and many inline handlers.

Likely failure mode: a routine change in appeals, sanctions, or incident workflows breaks a neighboring path because orchestration, domain rules, and side effects are still tightly interwoven.

Remediation direction: split workflow services by command/query boundary, extract snapshot/history/document/notification helpers, and break the appeal page into focused form-driven subcomponents.

### Gradebook

Why it matters: gradebook is the most coupled backend module by cross-module import signal, and its analytics path directly influences teacher-facing trust.

Strengths: the module has real internal structure and an outward `GradebookReadFacade`.

Weaknesses: [`/Users/ram/Desktop/SDB/apps/api/src/modules/gradebook/analytics/analytics.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/gradebook/analytics/analytics.service.ts) reads class-domain data directly and performs looped follow-up queries rather than relying on a stable read model. This is an architecture problem first and a possible performance problem second.

Likely failure mode: analytics changes become slow, brittle, or both because class/assessment coupling remains implicit and query behavior drifts under scale.

Remediation direction: move cross-domain analytics onto a deliberate read model or analytics facade with batched aggregates and explicit contracts to `classes` and related domains.

### Payroll

Why it matters: payroll is business-critical and high-consequence even if current tenants are limited.

Strengths: there is substantial test volume and basic spec presence across the module.

Weaknesses: the coverage signal is overstated. Existing artifacts show materially weaker payroll coverage than strong modules, and [`/Users/ram/Desktop/SDB/apps/api/src/modules/payroll/payroll-runs.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/payroll/payroll-runs.service.ts) is broader than its sampled specs pin down. Approval-callback fragility also intersects payroll.

Likely failure mode: a refactor around run finalization, approval-required flows, or entry refresh breaks a high-value path without fast detection.

Remediation direction: add targeted characterization tests for successful and approval-required finalization, update concurrency, entry refresh semantics, queue dispatch/status, and exact calendar boundary cases before major payroll changes.

### Approvals + Callback Processors

Why it matters: this path is cross-cutting. It touches finance, payroll, and communications and acts as a reliability hinge when async approval state returns to the system.

Strengths: the platform has explicit approval schemas, shared types, and dedicated callback processors.

Weaknesses: [`/Users/ram/Desktop/SDB/packages/prisma/schema.prisma`](/Users/ram/Desktop/SDB/packages/prisma/schema.prisma) restricts `callback_status` to `VARCHAR(20)`, while multiple callback processors write `skipped_unexpected_state`, which is `24` characters. This is a direct contract defect, not a style concern.

Likely failure mode: the “self-heal” or reconciliation path errors while attempting to record a callback outcome, leaving approval reporting less trustworthy precisely when things go off the happy path.

Remediation direction: align schema and allowed status vocabulary immediately, then add integration tests for all callback outcome states across affected processors.

## 8. Cross-Cutting Architectural Risks

- Direct read coupling remains the main structural leak.
  Evidence: hotspot modules and sampled services continue to reach across domain boundaries through Prisma reads rather than stable facades or read models. This is consistent with [`/Users/ram/Desktop/SDB/docs/architecture/danger-zones.md`](/Users/ram/Desktop/SDB/docs/architecture/danger-zones.md) and [`/Users/ram/Desktop/SDB/docs/architecture/module-blast-radius.md`](/Users/ram/Desktop/SDB/docs/architecture/module-blast-radius.md).
- Boundary enforcement is not strong enough to control erosion.
  Evidence: the checker is still budgeted with `--max-violations 235` in CI and fails locally because the registry path is stale.
- Shared contracts are too broad.
  Evidence: [`/Users/ram/Desktop/SDB/packages/shared/src/index.ts`](/Users/ram/Desktop/SDB/packages/shared/src/index.ts) exports a very broad root barrel while domain subpaths are only partially adopted.
- Architecture documentation has drifted in places the repo asks engineers to trust.
  Evidence: the current pastoral/child-protection module graph no longer matches some blast-radius documentation, and the boundary checker path drift is another concrete example.
- API observability and health are stronger than worker observability and health.
  Evidence: worker Sentry instrumentation exists but is not loaded, readiness is not meaningfully distinct, and queue/scheduler health coverage is incomplete relative to the actual worker estate.

Danger-zone validation:

- `DZ-02` remains valid: direct cross-module data access is still a first-order risk.
- `DZ-07` remains valid: lazy injection and coupling remain present in selected paths.
- `DZ-05` appears materially mitigated: tenant settings now use per-module rows with compatibility fallback.
- The older documented pastoral/child-protection cycle appears stale and should not keep being treated as an active risk in its old form.

## 9. Top 10 Most Important Issues

### 1. Search route lacks RBAC for tenant-wide directory data

- Severity: High
- Confidence: High
- Why it matters: this is a live privacy and least-privilege failure inside the tenant boundary.
- Evidence: [`/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.controller.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.controller.ts) uses only `AuthGuard`; [`/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.service.ts) returns student, parent, staff, and household directory-style results.
- Subagents supporting it: 04, 06
- Fix direction: add `PermissionGuard` and granular permission checks, tighten query prerequisites, and add route-level denial tests.

### 2. Production rollback is code-only after migrations

- Severity: High
- Confidence: High
- Why it matters: a failed deploy can leave code reverted but schema/data still advanced.
- Evidence: [`/Users/ram/Desktop/SDB/scripts/deploy-production.sh`](/Users/ram/Desktop/SDB/scripts/deploy-production.sh) creates a predeploy dump and runs migrations, but rollback only restores code/build/services and does not restore the database.
- Subagents supporting it: 07, challenge pass, main-session recheck
- Fix direction: enforce expand/contract migrations or wire and drill a real code-plus-database rollback path.

### 3. Approval callback status contract can fail under non-happy-path states

- Severity: High
- Confidence: High
- Why it matters: callback reconciliation is meant to improve reliability; this defect can break it.
- Evidence: [`/Users/ram/Desktop/SDB/packages/prisma/schema.prisma`](/Users/ram/Desktop/SDB/packages/prisma/schema.prisma) limits `callback_status` to `VARCHAR(20)` while multiple processors write `skipped_unexpected_state` (`24` chars).
- Subagents supporting it: 06, challenge pass, main-session recheck
- Fix direction: align schema and callback vocabulary immediately, then add processor and integration coverage.

### 4. Boundary enforcement is soft in CI and broken in the current checkout

- Severity: High
- Confidence: High
- Why it matters: modularity claims degrade quickly when the guardrail itself is unreliable.
- Evidence: CI still tolerates a large violation budget, and [`/Users/ram/Desktop/SDB/scripts/check-module-boundaries.ts`](/Users/ram/Desktop/SDB/scripts/check-module-boundaries.ts) points at the wrong registry path.
- Subagents supporting it: 01, challenge pass, main-session recheck
- Fix direction: repair the checker first, then ratchet allowed violations down and add missing read contracts.

### 5. Behaviour remains an internal mini-monolith in a top-risk domain

- Severity: High
- Confidence: Medium-High
- Why it matters: discipline, appeals, sanctions, documents, and notifications are still coupled tightly enough to make routine changes expensive and risky.
- Evidence: fact-pack size and hotspot data, plus sampled services and the large appeal page.
- Subagents supporting it: 01, 05
- Fix direction: split workflow services by use case and extract side-effect orchestration from domain state changes.

### 6. Gradebook analytics depends on direct cross-domain reads instead of a stable read model

- Severity: High
- Confidence: High
- Why it matters: this is a structural coupling and scalability risk in one of the most connected domains.
- Evidence: [`/Users/ram/Desktop/SDB/apps/api/src/modules/gradebook/analytics/analytics.service.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/gradebook/analytics/analytics.service.ts) reaches into class-domain data and loops follow-up assessment queries.
- Subagents supporting it: 01
- Fix direction: build a deliberate analytics facade or read model with explicit contracts and batched queries.

### 7. Payroll refactor safety is overstated by the current coverage story

- Severity: High
- Confidence: High
- Why it matters: payroll is business-critical and not well enough pinned in its riskiest orchestration paths.
- Evidence: payroll coverage artifact trails strong modules, `collectCoverageFrom` is absent, and `payroll-runs.service.ts` is much broader than sampled spec coverage.
- Subagents supporting it: 02, challenge pass, main-session recheck
- Fix direction: add characterization tests before major payroll changes and make coverage accounting truthful.

### 8. Frontend critical workflows are under-protected

- Severity: High
- Confidence: High
- Why it matters: a large user-facing surface is currently guarded mostly by smoke and visual checks outside login.
- Evidence: `337` pages versus `32` test files, smoke-like attendance journey, visual-only payroll spec, no React Testing Library usage found in frontend specs.
- Subagents supporting it: 03, 05, challenge pass
- Fix direction: add seeded state-changing journeys and a small RTL layer for high-value forms and components.

### 9. Worker telemetry and readiness signals are incomplete

- Severity: Medium
- Confidence: High
- Why it matters: failures in background processing and deploy readiness are harder to trust or diagnose than the API path suggests.
- Evidence: [`/Users/ram/Desktop/SDB/apps/worker/src/instrument.ts`](/Users/ram/Desktop/SDB/apps/worker/src/instrument.ts) is not imported by [`/Users/ram/Desktop/SDB/apps/worker/src/main.ts`](/Users/ram/Desktop/SDB/apps/worker/src/main.ts); readiness reuses the broad health result; queue coverage is partial.
- Subagents supporting it: 06, 07, challenge pass
- Fix direction: initialize worker telemetry on boot, distinguish readiness from health, and align health coverage with the real queue/scheduler estate.

### 10. Login still allows request-body tenant selection to override host-resolved tenant context

- Severity: Medium
- Confidence: High
- Why it matters: it weakens the intended tenant-resolution trust model at the most sensitive boundary in the system.
- Evidence: [`/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth.controller.ts`](/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth.controller.ts) uses `dto.tenant_id || tenantContext?.tenant_id`, and the controller spec explicitly locks in the “body wins” behavior.
- Subagents supporting it: 04, main-session recheck
- Fix direction: prefer host-resolved tenant context by default and reserve explicit tenant override for tightly controlled platform flows only.

## 10. Quick Wins

- Lock down search with permission guards, explicit per-entity authorization, and a minimum query requirement.
- Fix `callback_status` now, then add direct tests for every callback terminal and non-terminal state.
- Import worker instrumentation in [`/Users/ram/Desktop/SDB/apps/worker/src/main.ts`](/Users/ram/Desktop/SDB/apps/worker/src/main.ts) and make `/health/ready` meaningfully different from `/health`.
- Repair [`/Users/ram/Desktop/SDB/scripts/check-module-boundaries.ts`](/Users/ram/Desktop/SDB/scripts/check-module-boundaries.ts) and start reducing the allowed-violations budget.
- Change auth login resolution so host-derived tenant context wins unless a deliberately privileged flow opts into override behavior.
- Update the appeal detail page and similar hotspots to `react-hook-form` plus translations before their next feature expansion.

## 11. Strategic Refactor Opportunities

### 1. Stabilize the live control plane first

Prerequisites: none.

Scope: search RBAC, login tenant resolution, approval callback contract, worker instrumentation, distinct readiness, and deploy rollback policy.

Why first: these are live-risk and trustworthiness issues. Fixing them improves safety before any large structural work begins.

### 2. Make architecture rules executable

Prerequisites: repaired boundary checker and updated architecture paths.

Scope: restore a functioning boundary checker, ratchet violation budgets down, add missing read facades/read models, and reduce root-barrel dependence in `@school/shared`.

Why second: hotspot refactors will not hold if the repo cannot enforce the intended seams.

### 3. Rebuild test truth before major hotspot refactors

Prerequisites: step 1 completed; at least baseline boundary tooling functioning.

Scope: truthful backend coverage accounting, payroll characterization, route-level authz coverage, frontend state-changing journeys, and worker failure-contract tests.

Why third: high-risk refactors should not start until the repo can reliably tell you when they broke something.

### 4. Refactor the hotspot domains in sequence

Prerequisites: steps 1-3 completed.

Scope: behaviour workflow split, gradebook analytics read model, workload-compute decomposition, then targeted payroll simplification.

Why this sequence matters: behaviour and gradebook are the highest-risk architectural hotspots, while payroll needs stronger tests before deeper surgery. Doing this after control-plane and test repairs materially lowers the chance of creating new blind spots.

## 12. Scorecard

| Dimension             | Score | Evidence-Based Justification                                                                                                   |
| --------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| Architecture          | `6.0` | Real module structure and documented controls exist, but hotspots and broken boundary tooling reduce trust.                    |
| Code Quality          | `6.0` | Conventions are strong, but several large backend and frontend files already carry disproportionate complexity.                |
| Modularity            | `5.5` | The modular monolith is real, but direct read coupling and root shared-contract sprawl weaken actual boundaries.               |
| Backend Test Health   | `6.0` | Large, passing suite with strong domains, but uneven depth and misleading coverage governance.                                 |
| Frontend Test Health  | `4.0` | Meaningful login and visual coverage exists, but critical flows are largely unprotected.                                       |
| Worker Test Health    | `7.0` | Broad processor/spec coverage and tenant-safety testing are real; failure-contract depth is uneven.                            |
| Maintainability       | `5.5` | Hotspot services and pages create high cognitive load and expensive change paths.                                              |
| Reliability           | `6.0` | State-machine and worker patterns are present, but callback defects and health/readiness gaps are material.                    |
| Security              | `6.0` | Strong RLS/raw-SQL posture and auth controls exist, but search RBAC and login tenant selection remain meaningful issues.       |
| Developer Experience  | `7.0` | Docker, docs, doctor tooling, Makefile, and CI governance are real, though some drift exists.                                  |
| Operational Readiness | `6.5` | CI/deploy/health posture is above average, but recoverability and worker telemetry are not yet strong enough.                  |
| Refactor Safety       | `5.5` | Safe in selected strong domains, unsafe as a broad repo-level assumption.                                                      |
| Overall Health        | `6.0` | Weighted judgment: stronger than a weak or failing system, but not yet safe to scale or refactor without targeted remediation. |

Weighted judgment note: Security and Reliability were weighted more heavily than cosmetic code quality because the main decision question is whether the system is safe to operate, extend, and change.

## 13. Final Verdict

- Is this monolith healthy?
  Mixed. It is a serious, governed system with real strengths, but it is not currently healthy enough to be called decision-grade.
- Is it safe to scale?
  Only selectively. Current live-risk gaps in authorization, rollback/recoverability, and worker observability should be fixed before meaningfully increasing operational load or tenant count.
- Is it safe to extend?
  In stronger slices, yes. Auth, attendance, payment allocation, and parts of scheduling are materially safer to extend than the repo average. Search, behaviour, gradebook analytics, payroll, and worker health paths are not.
- Is it safe to refactor?
  Not broadly. Local refactors in well-tested domains are reasonable; hotspot refactors are unsafe until coverage truth, boundary enforcement, and callback/ops fixes land.
- What should be done first?
  Fix search authorization, repair the approval callback contract, close the deploy rollback gap, restore truthful boundary and coverage controls, then refactor the biggest hotspot domains under stronger tests.

## 14. Review Limitations

- This was an evidence-based audit, but still a sampled one. I did not do exhaustive line-by-line review of all `59` backend modules, all `337` frontend pages, or all worker processors/specs.
- No live server, PM2, object-storage bucket, or alert-destination inspection was performed.
- No local rerun of backend integration suites or Playwright journeys/visuals was performed in this audit run.
- The audit prompt asked for all seven subagents to launch in one parallel batch. The environment allowed only six concurrent agent threads, so the seventh subagent was launched immediately after a completed agent was closed. That lowered process purity slightly but not substantive coverage.
- Early prompt heuristics around model-to-table RLS comparison and `: any` grep noise were challenged and corrected before final scoring. The final report excludes those weaker initial signals.
