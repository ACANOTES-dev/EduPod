# Master Audit Report

Audit timestamp: `2026-04-01_02-39-13`

## 1. Executive Summary

This system is substantial and materially engineered, not fragile hobbyware. It passed lint, type-check, build, backend tests, worker tests, and shared-package tests in the audited workspace; tenant-table RLS coverage appears broad; and the architecture documentation is unusually strong. The audit verdict is still mixed rather than strong: the monolith is extendable with care, but not low-risk to refactor broadly, and not yet operationally safe enough to scale casually. The biggest reasons are concrete, not stylistic: direct cross-module data access weakens boundaries, the default backend green bar omits a meaningful integration/RLS/e2e lane, the notification worker path has real delivery-safety defects, and the deploy workflow can release unverified or different code than the triggering revision.

## 2. System Overview

This is a multi-tenant school-management SaaS on a NestJS modular monolith backend, a Next.js App Router frontend, a BullMQ worker service, PostgreSQL with RLS, Redis, and shared TypeScript packages. The audited workspace contained `3,077` tracked files and `831,442` tracked lines. The backend exposes `56` API modules; the frontend contains `336` `page.tsx` routes, `35` shared components, and `167` page-local `_components`; the worker contains `87` processors. Prisma defines `264` models, and corrected Phase 1 verification found `251` tenant-scoped mapped tables and `251` RLS-enabled tables with no unresolved tenant-table mismatches.

## 3. Shared Fact Pack Summary

### Facts

- Build and quality:
  - `pnpm turbo run lint` passed with `34` warnings and `0` errors.
  - `pnpm turbo run type-check` passed.
  - `pnpm turbo run build` passed.
- Test execution:
  - Backend: `529` suites passed, `7,190` tests passed.
  - Worker: `29` suites passed, `304` tests passed.
  - Shared package: `13` suites passed, `250` tests passed.
  - Frontend browser tests were inventoried, not executed, in Phase 1.
- Shape and hotspots:
  - Largest API modules by non-test LOC: `behaviour` `25,291`, `pastoral` `19,369`, `gradebook` `15,146`, `scheduling` `7,535`, `finance` `7,222`.
  - Top cross-module import hotspots: `gradebook` `25`, `staff-wellbeing` `21`, `pastoral` `19`, `behaviour` `19`, `gdpr` `18`.
- Test-surface facts:
  - Frontend inventory found `19` Playwright visual specs and `12` frontend unit/integration specs.
  - Worker processor/spec matching found `26` matching processor specs for `87` processors.
- Security and RLS:
  - Corrected verification found `251` tenant-scoped mapped tables and `251` unique RLS-enabled tables.
  - API bootstrap uses env validation, Helmet, cookie parsing, CORS, and Sentry scrubbing.
- CI and deploy:
  - CI runs install, Prisma generate, lint, type-check, `pnpm turbo run test`, and build.
  - Deploy triggers on push to `main`, uses `git pull origin main`, runs install/build/migrations on the server, and smoke-tests only web and API.

### Strong Signals

- The codebase has real engineering discipline, but it is unevenly distributed: auth, approvals, scheduling, RLS setup, and API bootstrap are materially stronger than worker delivery safety, deploy safety, and frontend regression coverage.
- Structural risk clusters around the largest business-critical modules and the worker notification path, not around random isolated files.
- The architecture documentation still describes live conditions accurately. The danger zones are not stale folklore.
- Test volume is not the same as refactor safety here. The backend suite is broad, but its default green bar excludes meaningful higher-level coverage; the frontend and worker surfaces are much less protected than raw counts suggest.

### Inferences

- This monolith is serviceable, but its real blast radius is larger than the Nest module graph implies because data ownership is weak.
- The system is safer to extend in well-covered areas than to refactor across boundaries or transactional workflows.
- The main near-term scaling constraint is not raw feature breadth; it is the combination of weak worker delivery guarantees, porous data boundaries, and deploy-path safety gaps.

## 4. Build / Run / Test Findings

- No failing suites were observed in the executed backend, worker, or shared-package lanes.
- The most important caveat is scope, not pass/fail: `apps/api/jest.config.js` excludes `.rls.spec.ts`, `.performance.spec.ts`, `.e2e-spec.ts`, and `<rootDir>/test/`, while `apps/api/jest.integration.config.js` reintroduces them.
- CI currently runs `pnpm turbo run test`, so the repo-visible green bar does not prove the excluded backend integration/RLS/e2e suites or the Playwright browser suite were run.
- Lint warnings exist but are not currently blocking. The fact pack captured `34` warnings, mainly around import-order/style drift rather than hard build failures.
- No obvious async leak indicators, skipped-suite spikes, or failing worker/shared suites were observed in the Phase 1 summaries.

## 5. Test Health Assessment

Overall trust for refactoring is `moderate-low`.

- Backend:
  - Strongest areas: `auth`, `approvals`, and likely much of `scheduling`.
  - Weakest sampled area: `finance`, where transaction-heavy logic in `payments.service.ts` is only lightly covered in the default unit lane.
  - Judgement: backend tests are useful and real, but the default pass result overstates safety for cross-module, transactional, or RLS-sensitive refactors.
- Frontend:
  - Playwright is configured for visual coverage under `apps/web/e2e/visual`.
  - Sampled unit specs mirror logic instead of mounting real components.
  - Judgement: current frontend tests do not meaningfully protect real user journeys.
- Worker:
  - Base-layer tenant safety via `TenantAwareJob` is real and directly tested.
  - Coverage is selective rather than broad: whole domains such as `early-warning`, `imports`, `payroll`, and `regulatory` had no matching processor specs.
  - Judgement: worker refactors are only safe in the better-covered clusters, not across the surface as a whole.

Critical-module test coverage judgement:

- `auth`: trustworthy for routine refactors.
- `approvals`: moderate trust.
- `scheduling`: good trust, but e2e lane is outside default backend green bar.
- `finance`: insufficient trust for transactional-core refactors without running the broader lane and adding tests.
- `frontend critical flows`: low trust.
- `worker critical flows`: low-to-moderate trust, highly domain-dependent.

## 6. Module Health Matrix

Full matrix: `Audit-GPT/module-health-matrix_2026-04-01_02-39-13.md`

| Module                                | Risk   | Test health | Architecture health | Refactor priority |
| ------------------------------------- | ------ | ----------- | ------------------- | ----------------- |
| Auth                                  | Medium | Strong      | Moderate            | Next              |
| RBAC / Control Plane                  | High   | Moderate    | Moderate            | Now               |
| Finance                               | High   | Moderate    | Moderate            | Now               |
| Approvals                             | High   | Moderate    | Moderate            | Now               |
| Scheduling                            | High   | Strong      | Moderate            | Next              |
| Behaviour                             | High   | Moderate    | Weak                | Now               |
| Pastoral                              | High   | Moderate    | Weak                | Now               |
| Gradebook                             | High   | Moderate    | Weak                | Next              |
| Payroll                               | High   | Weak        | Moderate            | Now               |
| Communications / Notifications Worker | High   | Weak        | Weak                | Now               |
| Frontend Shell and Critical Pages     | High   | Weak        | Weak                | Now               |

## 7. Deep Dive: Highest-Risk Modules

### Communications / Notifications Worker

- Why it matters: this is the most concrete production-risk cluster found in the audit.
- Strengths:
  - There is a real tenant-aware base contract.
  - Some targeted specs exist in notifications and approvals.
- Weaknesses:
  - `dispatch-queued.processor.ts` does not actually claim rows before enqueue.
  - `retry-failed.processor.ts` exists, but `cron-scheduler.service.ts` does not schedule it.
  - `TenantAwareJob.execute()` wraps the full job in a Prisma transaction, and `dispatch-notifications.processor.ts` performs external sends inside that transaction.
- Evidence:
  - `apps/worker/src/processors/notifications/dispatch-queued.processor.ts:53-100`
  - `apps/worker/src/processors/communications/retry-failed.processor.ts:44-94`
  - `apps/worker/src/cron/cron-scheduler.service.ts:261-276`
  - `apps/worker/src/base/tenant-aware-job.ts:62-70`
- Likely failure mode: duplicate outbound messages, failed retries that never resume automatically, and hard-to-reconcile partial sends when provider calls succeed but the DB transaction later fails.
- Suggested remediation direction: treat delivery safety as a core reliability project, not a local bug fix. Add claim semantics, scheduled retries, out-of-transaction provider calls, idempotency, and deploy-time/health-time visibility.

### Finance + Approvals Boundary

- Why it matters: this is where transactional correctness, money, and approval workflows intersect.
- Strengths:
  - Finance has meaningful higher-level coverage and approval workflows are explicit.
  - Approval callbacks and reconciliation exist.
- Weaknesses:
  - Finance transactional invariants are under-covered in the default backend lane.
  - Approval request creation and domain state updates are split across writes in finance, payroll, and admissions.
- Evidence:
  - `apps/api/src/modules/finance/payments.service.ts:263-364`
  - `apps/api/src/modules/finance/payments.service.spec.ts:223-245`
  - `apps/api/src/modules/finance/invoices.service.ts:341-365`
  - `apps/api/src/modules/payroll/payroll-runs.service.ts:689-711`
  - `apps/api/src/modules/admissions/application-state-machine.service.ts:314-337`
- Likely failure mode: duplicate or orphaned approval requests, incorrect entity approval state, or finance regressions that slip past the default green bar.
- Suggested remediation direction: make approval request creation transaction-aware, add uniqueness protection, and deepen finance invariant tests before broader refactors.

### Behaviour

- Why it matters: it is the largest module and one of the most business-critical.
- Strengths:
  - Significant product depth already exists.
  - There is non-trivial test coverage.
- Weaknesses:
  - The module is too broad to reason about comfortably.
  - `BehaviourStudentsService` combines projection, analytics, parent-facing shaping, and multiple data-source concerns in one file.
  - Behaviour worker coverage is sparse relative to processor count.
- Evidence:
  - `architecture/module-blast-radius.md:197-241`
  - `apps/api/src/modules/behaviour/behaviour.module.ts:75-191`
  - `apps/api/src/modules/behaviour/behaviour-students.service.ts:83-179` and `:632-860`
- Likely failure mode: schema or query changes that break multiple behaviour surfaces at once, with regressions surfacing outside the local module.
- Suggested remediation direction: split internal subdomains first, then impose owner-based read facades for shared tables.

### Pastoral

- Why it matters: it combines sensitive workflows, queue chains, and a documented architectural cycle.
- Strengths:
  - The docs describe the live blast radius accurately.
  - There is real test coverage and explicit queue behavior.
- Weaknesses:
  - `ConcernService` is oversized and handles too many responsibilities.
  - `PastoralModule` still uses `forwardRef(() => ChildProtectionModule)`.
  - Queue-chain fragility remains part of the documented danger-zone set.
- Evidence:
  - `architecture/danger-zones.md:566-598`
  - `apps/api/src/modules/pastoral/pastoral.module.ts:55-58`
  - `apps/api/src/modules/pastoral/services/concern.service.ts:184-247` and `:599-979`
- Likely failure mode: tightly coupled workflow changes causing cross-module breakage or queue-state inconsistency.
- Suggested remediation direction: separate concern lifecycle, sharing, and child-protection integration behind narrower facades and add architecture tests around the documented cycle and queue chain.

## 8. Cross-Cutting Architectural Risks

- `DZ-02` remains live: direct Prisma reads across domain ownership boundaries mean the import graph understates blast radius.
- `DZ-35` remains live: the `PastoralModule` and `ChildProtectionModule` cycle is still present.
- `DZ-36` remains live in spirit: queue-chain safety still depends heavily on implementation discipline rather than hard guardrails.
- Shared-surface sprawl is visible in `packages/shared/src/index.ts`, which re-exports `110` entries from one root barrel.
- Worker reliability and worker observability are both shallower than the importance of the queue surface would justify.
- The repo shows a recurring pattern: strong documentation and strong intent, but incomplete automation of the highest-risk rules.

## 9. Top 10 Most Important Issues

### 1. Notification pipeline is not delivery-safe

- Severity: High
- Confidence: High
- Why it matters: It creates direct risk of duplicate messages, stranded retries, and partial-send inconsistency.
- Evidence: `dispatch-queued.processor.ts:53-100`, `retry-failed.processor.ts:44-94`, `cron-scheduler.service.ts:261-276`, `tenant-aware-job.ts:62-70`
- Subagents supporting it: 6, 7, 3
- Fix direction: Add claim/lease semantics, schedule retries, move provider sends out of the long-lived transaction, add idempotency and end-to-end worker regression coverage.

### 2. Deploy pipeline can promote unverified or different code

- Severity: High
- Confidence: High
- Why it matters: In a no-staging setup, this materially raises release risk.
- Evidence: `.github/workflows/deploy.yml:3-39` and `:33-39`; `.github/workflows/ci.yml:3-39`
- Subagents supporting it: 7
- Fix direction: Gate deploy on successful CI and deploy a pinned SHA or immutable artifact.

### 3. Control-plane exception paths weaken the RLS hard-boundary claim

- Severity: High
- Confidence: High
- Why it matters: The multi-tenant safety story becomes dependent on disciplined application filtering, not just database-enforced isolation.
- Evidence: `tenant-resolution.middleware.ts:21-25`, `permission-cache.service.ts:22-24`, archived P1/P2 results describing the exception path and a prior cross-tenant leak
- Subagents supporting it: 4
- Fix direction: Use a non-bypass runtime role, isolate control-plane lookups, and add a startup assertion against RLS-bypassing app roles.

### 4. Approval request creation is non-atomic with entity state transitions

- Severity: High
- Confidence: High
- Why it matters: Approval and domain state can drift out of sync under failure or concurrency.
- Evidence: `invoices.service.ts:343-365`, `payroll-runs.service.ts:689-711`, `application-state-machine.service.ts:314-337`
- Subagents supporting it: 6, 2
- Fix direction: Make approval creation and entity state update one transaction and add one-open-request protection.

### 5. Direct foreign-table reads undermine modular boundaries

- Severity: High
- Confidence: High
- Why it matters: Schema changes have a broader blast radius than the module graph suggests.
- Evidence: `architecture/danger-zones.md:26-52`, `architecture/module-blast-radius.md:256-276`, sampled hotspot services across behaviour, gradebook, staff wellbeing, and GDPR
- Subagents supporting it: 1, 5
- Fix direction: Introduce owner-based read facades for shared tables and block new direct foreign-table reads.

### 6. Behaviour and Pastoral are internal god modules

- Severity: High
- Confidence: High
- Why it matters: These domains are too broad to change safely without extra review and testing burden.
- Evidence: fact-pack hotspot counts; `behaviour.module.ts`, `pastoral.module.ts`, `behaviour-students.service.ts`, `concern.service.ts`
- Subagents supporting it: 1, 5
- Fix direction: Split into internal submodules and narrower facades before any major feature expansion.

### 7. The default backend green bar overstates refactor safety

- Severity: High
- Confidence: High
- Why it matters: Higher-level backend failures can slip through while the default unit lane still passes.
- Evidence: `apps/api/jest.config.js:5-12`; `apps/api/jest.integration.config.js:6-12`
- Subagents supporting it: 2, 7
- Fix direction: Add the integration/RLS/e2e backend lane to required CI and local risky-change pre-flight.

### 8. Frontend regression coverage is too shallow and non-behavioral

- Severity: High
- Confidence: High
- Why it matters: Real user flows can regress while visual snapshots and mirrored logic specs still pass.
- Evidence: `apps/web/e2e/playwright.config.ts`, sampled visual specs, sampled mirrored frontend unit specs
- Subagents supporting it: 3, 7
- Fix direction: Add behavioral Playwright journeys and mount real components in unit/integration tests.

### 9. Worker coverage and visibility are too thin across a critical processor surface

- Severity: High
- Confidence: High
- Why it matters: Untested or poorly observed queue behavior can fail silently in production.
- Evidence: `87` processors vs `26` matching processor specs, static worker health response, deploy smoke checks only web and API
- Subagents supporting it: 3, 6, 7
- Fix direction: Expand worker tests by operational risk and add real worker readiness/observability.

### 10. MFA TOTP secrets are stored plaintext in the platform `users` table

- Severity: Medium
- Confidence: High
- Why it matters: Anyone with read access to `users` can clone a second factor; the table is non-RLS and platform-level.
- Evidence: `packages/prisma/schema.prisma:973-985`; `apps/api/src/modules/auth/auth.service.ts:651-657` and `:366-383`
- Subagents supporting it: 4
- Fix direction: Encrypt MFA secrets at rest with the existing encryption facility or a dedicated wrapper.

## 10. Quick Wins

- Gate deploy on CI and pin releases to an exact revision.
- Register or merge the failed-notification retry path and add an atomic notification claim state.
- Make the backend integration/RLS/e2e lane a required CI check.
- Add real worker health checks and include worker/queue validation in deploy smoke tests.
- Encrypt MFA secrets at rest and align raw-SQL lint rules with the written policy.

## 11. Strategic Refactor Opportunities

### 1. Restore safety rails first

- Scope: CI gating, pinned deploys, full backend required lane, worker health, worker observability.
- Prerequisites: none.
- Why sequence matters: without safer release rails, later structural work will ship with too much hidden risk.

### 2. Stabilize worker delivery semantics

- Scope: notification claim/lease semantics, scheduled retry, idempotent delivery flow, out-of-transaction provider sends, worker test expansion.
- Prerequisites: safety rails.
- Why sequence matters: this removes the most concrete production-risk path before broader worker or domain changes.

### 3. Make approvals transaction-aware

- Scope: approval request creation plus entity state transition in one transaction; uniqueness guard for open requests.
- Prerequisites: safety rails.
- Why sequence matters: finance, payroll, admissions, and other approval-integrated domains all become safer to extend afterward.

### 4. Reintroduce ownership boundaries around shared tables

- Scope: owner-based query facades for students, memberships, academic periods, class enrolments, attendance summaries, and other high-fan-out reads.
- Prerequisites: stronger test and release rails.
- Why sequence matters: boundary cleanup should precede large modular decompositions so future cuts align with data ownership instead of just file size.

### 5. Split hotspot modules internally, not into services

- Scope: behaviour, pastoral, gradebook, and workload analytics.
- Prerequisites: ownership facades and improved tests.
- Why sequence matters: extraction before internal cleanup would preserve the same coupling in a more fragile distributed form.

### 6. Raise frontend test and page-shape discipline

- Scope: behavioral browser tests, mounted component tests, page-local hooks/components, and stricter i18n enforcement.
- Prerequisites: none, but easier after release-safety improvements.
- Why sequence matters: it raises refactor trust on the UI side before major interface expansion.

## 12. Scorecard

| Area                  | Score | Justification                                                                                                          |
| --------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| Architecture          | 6.0   | Explicit modular monolith and strong docs, but boundary leaks are real.                                                |
| Code Quality          | 6.5   | Conventions are strong overall; hotspot files and inconsistent UI discipline drag the score down.                      |
| Modularity            | 5.5   | Packaging is modular, but data ownership is weak and shared surfaces are too broad.                                    |
| Backend Test Health   | 7.0   | Strong in auth, approvals, and scheduling; weakened by the excluded higher-level lane and finance gaps.                |
| Frontend Test Health  | 4.5   | Mostly visual smoke tests and mirrored logic, not behavioral protection.                                               |
| Worker Test Health    | 5.0   | Good base contract and pockets of strong coverage, but too many important processors are untested.                     |
| Maintainability       | 6.0   | The codebase is workable, but hotspot concentration makes change cost uneven.                                          |
| Reliability           | 5.5   | Solid foundations exist, but the notification path and health reporting have material live defects.                    |
| Security              | 6.5   | Broad RLS and hardening are real, but control-plane exception paths and plaintext MFA secrets are significant.         |
| Developer Experience  | 5.5   | Good tooling exists, but env/documentation drift and CI surface mismatch create friction.                              |
| Operational Readiness | 6.0   | CI, serialized deploys, and API hardening are real; worker visibility and release determinism are not good enough yet. |
| Refactor Safety       | 5.0   | Reasonable only in well-covered areas; broad refactors are too risky today.                                            |
| Overall Health        | 6.0   | Mixed health with several material concerns; viable, but not yet safe for low-risk scale or wide refactor.             |

## 13. Final Verdict

- Is this monolith healthy?
  - Mixed. It is not collapsing, but it is not strong-health due diligence either.
- Is it safe to scale?
  - Cautiously, only after release safety and worker delivery safety are improved.
- Is it safe to extend?
  - Yes in well-understood areas, with disciplined review and full-lane testing.
- Is it safe to refactor?
  - Not broadly. It is only moderately safe in the stronger backend domains and unsafe for aggressive boundary or worker refactors without additional safeguards.
- What should be done first?
  - First restore release safety and worker delivery safety, then fix approval atomicity and the RLS control-plane exception story, then start boundary cleanup.

## 14. Review Limitations

- No server access or production-shell verification was used.
- Production PostgreSQL role configuration was not observed directly, so the RLS control-plane finding is about architectural credibility and code-path evidence, not a directly witnessed production role.
- Frontend Playwright/browser tests were not executed in this audit run.
- Worker jobs were not exercised against live Redis/PostgreSQL infrastructure.
- The Codex environment allowed only six active agents at once. The seventh subagent was launched after completed agents were closed, so the requested seven-agent single-batch parallelism could not be achieved exactly.
