# Health Recovery Execution Order — 2026-04-02

> **Source plan:** `Audit-GPT/2026-04-02-health-recovery-plan.md`
>
> **Purpose:** turn the recovery plan into a bucketed execution manifest that makes three things explicit:
>
> 1. what must be done first
> 2. what can be run simultaneously without stepping on the same files
> 3. what additional closure work is required if the real target is `>= 9.5/10` rather than the current `~8.0` recovery floor

## Non-Negotiable Read Of The Plan

- **Waves 0–4** are the recovery spine. If executed cleanly, they should get the repo back to a green, trustworthy baseline.
- **Waves 5–6** are the extra closure waves required if the actual target is `>= 9.5` overall health.
- If you stop after Wave 4, you should expect a much healthier repo, but not an honest `9.5`.
- A later bucket does not start until the earlier bucket's exit gate is green.
- Inside a bucket, tasks may build in parallel, but if two tasks touch the same core files or the same CI workflow, they must merge in the listed order.

## Alignment Gate

This gate is mandatory before using the audit bundle as the execution baseline.

### Bucket AG-1 — Serial Only

1. Freeze or isolate the current dirty working tree.
   Files/actions:
   - current uncommitted API and worker spec changes
   - current untracked spec additions
     Why serial:
   - the repo in front of us is already ahead of the dated audit bundle
   - until this is frozen, every later health claim is ambiguous
2. Re-run the baseline verification snapshot.
   Commands:
   - `pnpm turbo run lint`
   - `pnpm turbo run type-check`
   - `pnpm turbo run build`
   - `cd apps/api && pnpm test`
   - `cd apps/worker && pnpm test`
     Deliverable:
   - one dated baseline note capturing what is red before recovery work starts

**Alignment gate exit rule:** one exact starting point is chosen and recorded.

## Wave Summary

| Wave           | Purpose                                                                              | Bucket pattern                                                                   |
| -------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Alignment Gate | make the audited baseline match the repo you will actually work on                   | serial only                                                                      |
| Wave 0         | close live correctness defects and restore green verification                        | one large parallel bucket, then serialized approval follow-up, then verification |
| Wave 1         | rebuild trust in the highest-blast-radius test and health surfaces                   | one backend/worker bucket plus one frontend bucket, then verification            |
| Wave 2         | remove security/ops governance drift                                                 | two mixed buckets with serial CI-sensitive merges                                |
| Wave 3         | reduce hotspot blast radius                                                          | mostly serialized structural work with one limited parallel bucket               |
| Wave 4         | make the healthier state durable                                                     | one governance bucket, then re-audit                                             |
| Wave 5         | convert advisory controls into enforced controls and close deferred reliability gaps | mostly serialized because CI, deploy, and worker governance overlap              |
| Wave 6         | finish the 9.5 closure path and re-audit against a hard score gate                   | limited parallelism, then independent audit                                      |

## Wave 0 — Stop Active Risk

**Goal:** close live defects and get back to a trustworthy green baseline.

### Bucket W0-A — Can Run Simultaneously

1. **HR-001 — Make approval decisions atomic**
   Primary files:
   - `apps/api/src/modules/approvals/approval-requests.service.ts`
   - approval-request specs for approve/reject/cancel races
     Why parallel-safe:
   - isolated to the approvals service and approval-specific specs
     Merge order inside bucket: `d2`
2. **HR-003 — Activate notification retry recovery**
   Primary files:
   - `apps/worker/src/cron/cron-scheduler.service.ts`
   - `apps/worker/src/processors/communications/retry-failed.processor.ts`
   - `apps/worker/src/processors/notifications/dispatch-queued.processor.ts`
     Why parallel-safe:
   - worker notifications surface, no expected overlap with approval core or school-closures specs
     Merge order inside bucket: `d3`
3. **HR-004 — Restore the worker green baseline**
   Primary files:
   - `apps/worker/src/processors/compliance/compliance-execution.processor.spec.ts`
   - `apps/worker/src/base/redis.helpers.spec.ts`
   - `apps/worker/src/base/search.helpers.spec.ts`
   - worker lint/type blockers if they are local to these failures
     Why parallel-safe:
   - mainly foundational worker-spec repair; avoid touching notification retry files unless blocked
     Merge order inside bucket: `d1`
4. **HR-005 — Restore the backend fully green baseline**
   Primary files:
   - `apps/api/src/modules/school-closures/school-closures.service.spec.ts`
     Why parallel-safe:
   - isolated API-spec repair
     Merge order inside bucket: `d4`

### Bucket W0-B — Serial After HR-001

1. **HR-002 — Repair approval callback self-healing**
   Primary files:
   - approval callback processors for announcements, invoices, payroll
   - `apps/worker/src/processors/approvals/callback-reconciliation.processor.ts`
     Why serial:
   - this work must build on the final approval-decision semantics from `HR-001`
   - otherwise two sessions will fight over approval state expectations and replay behavior

### Bucket W0-C — Serial Verification

1. **HR-006 — Re-run and capture the recovery baseline**
   Commands:
   - `pnpm turbo run lint`
   - `pnpm turbo run type-check`
   - `pnpm turbo run build`
   - `cd apps/api && pnpm test`
   - `cd apps/worker && pnpm test`

**Wave 0 exit gate**

- no failing backend suites
- no failing worker suites
- `lint`, `type-check`, and `build` all pass
- approval approve/reject/cancel is atomic under concurrency
- failed notifications are automatically retried after `next_retry_at`

## Wave 1 — Restore Trust In High-Blast-Radius Guardrails

**Goal:** add the exact coverage and health checks needed before larger refactors.

### Bucket W1-A — Can Run Simultaneously

1. **HR-007 — Add finance transaction safety coverage**
   Primary files:
   - `apps/api/src/modules/finance/payments.service.ts`
   - `apps/api/src/modules/finance/payments.service.spec.ts`
     Merge order: `d1`
2. **HR-008 — Add compliance execution safety coverage**
   Primary files:
   - `apps/worker/src/processors/compliance/compliance-execution.processor.ts`
   - `apps/worker/src/processors/compliance/compliance-execution.processor.spec.ts`
     Merge order: `d2`
3. **HR-009 — Strengthen key rotation safety coverage**
   Primary files:
   - `apps/worker/src/processors/security/key-rotation.processor.ts`
   - `apps/worker/src/processors/security/key-rotation.processor.spec.ts`
     Note:
   - because a key-rotation spec now exists in the working tree, this item should start with validation of what is already present, then fill only the remaining safety gaps
     Merge order: `d3`
4. **HR-012 — Expand worker health beyond notifications**
   Primary files:
   - `apps/worker/src/health/worker-health.service.ts`
   - worker deploy smoke expectations
     Merge order: `d4`

### Bucket W1-B — Frontend Test Harness Bucket

1. **HR-010 — Replace fake frontend confidence with real critical-flow coverage**
   Primary files:
   - authenticated Playwright journey pack
   - login and session fixture support
2. **HR-011 — Fix mirrored frontend rule tests**
   Primary files:
   - `require-role` tests
   - school layout and nav tests

Why these two share a bucket:

- both touch frontend test strategy and may share test helpers or route fixtures
- they can be developed in parallel if separate owners coordinate, but merge order should be:
  - `HR-011` first if it changes shared test utilities
  - `HR-010` second once the shared runtime imports are stable

### Bucket W1-C — Serial Verification

- rerun affected API, worker, and web verification lanes
- record the new finance, compliance, key-rotation, frontend, and worker-health evidence

**Wave 1 exit gate**

- finance allocation path has both success and failure coverage
- compliance execution has an executable safety harness
- key rotation has a trustworthy safety harness
- authenticated frontend journeys are green
- worker health covers critical queue surface, not just notifications

## Wave 2 — Security, Ops, And Release Hardening

**Goal:** remove governance drift that can quietly erase the gains from Waves 0–1.

### Bucket W2-A — Can Run Simultaneously

1. **HR-013 — Standardize the local environment contract**
   Primary files:
   - `.env.example`
   - `scripts/setup.sh`
   - `scripts/doctor.mjs`
   - runtime env loading paths
     Merge order: `d1`
2. **HR-014 — Modernize frontend Sentry/App Router integration**
   Primary files:
   - web Sentry config
   - App Router instrumentation and global error integration
     Merge order: `d2`
3. **HR-015 — Make schema-risk explicit in deploy discipline**
   Primary files:
   - deployment docs and runbooks
   - migration policy docs
     Merge order: `d3`
4. **HR-018 — Strengthen login throttling**
   Primary files:
   - auth login throttling logic
     Merge order: `d4`

### Bucket W2-B — CI/Governance Bucket

1. **HR-017 — Reconcile and enforce the canonical RLS catalogue**
   Primary files:
   - `packages/prisma/rls/policies.sql`
   - RLS audit script and CI wiring
     Merge order: `d1`
2. **HR-016 — Tighten raw SQL governance**
   Primary files:
   - lint rule allowlists and raw SQL wrapper/governance layer
   - CI enforcement
     Merge order: `d2`

Why W2-B is its own bucket:

- both tasks can be built in parallel, but both are likely to touch shared lint or CI workflow files
- merge them serially to avoid churn in the same enforcement surfaces

**Wave 2 exit gate**

- environment drift is gone
- frontend Sentry/App Router warnings are gone
- RLS catalogue drift is closed and guarded by CI
- raw SQL governance is explicit and enforced
- login throttling is materially stronger than email-only gating

## Wave 3 — Architecture And Boundary Recovery

**Goal:** materially reduce blast radius in the modules that dominate change cost.

### Bucket W3-A — Serial Foundation Bucket

1. **HR-023 — Narrow `packages/shared/src/index.ts`**
   Why first:
   - later structural work should build on explicit subpaths, not on an oversized root barrel

### Bucket W3-B — Limited Parallel Bucket

1. **HR-019 — Split `AuthService` into focused internal services**
   Primary files:
   - auth module internals
2. **HR-020 — Introduce read facades for highest-shared tables**
   Primary files:
   - students
   - staff profiles
   - academic periods / enrolments
   - attendance summary

Why parallel-safe:

- auth internal slicing and shared-table read facades do not need the same write set if ownership is clear
- both benefit from the narrowed shared barrel from W3-A

Merge order inside bucket:

- `HR-020` first if it changes shared exports or shared facade contracts
- `HR-019` second if it only touches auth internals

### Bucket W3-C — Serial Hotspot Bucket

1. **HR-021 — Start `behaviour` internal decomposition**
   Why solo:
   - high blast radius and likely to touch shared history, notifications, analytics, and parent-facing flows

### Bucket W3-D — Serial Hotspot Bucket

1. **HR-022 — Start `pastoral` internal decomposition**
   Why solo:
   - high blast radius and non-trivial coupling to child-protection and reporting seams
   - safest after behaviour decomposition patterns are established

### Bucket W3-E — Serial Enforcement Bucket

1. **HR-024 — Add boundary enforcement**
   Why last:
   - enforcement should land after the intended boundaries and read seams actually exist

**Wave 3 exit gate**

- auth, behaviour, and pastoral have smaller internal blast radii
- highest-shared reads route through explicit seams
- the shared root barrel is materially smaller
- boundary enforcement is automated, not just documented

## Wave 4 — Maintainability And Governance

**Goal:** make the recovered state durable enough that it does not decay immediately.

### Bucket W4-A — Can Run Simultaneously

1. **HR-025 — Promote the most important maintainability rules from warnings to harder gates**
2. **HR-026 — Add hotspot budgets and recurring measurement**
3. **HR-027 — Add module-level and hotspot review guidance**

Why parallel-safe:

- these are governance and tooling surfaces with low domain overlap
- if multiple tasks touch CI, merge in the order: `HR-025` then `HR-026` then `HR-027`

### Bucket W4-B — Serial Audit Bucket

1. **HR-028 — Re-audit after waves complete**

**Wave 4 exit gate**

- maintainability drift is gated
- hotspot metrics are tracked
- a follow-up audit shows real improvement

## Stage B — The Extra Waves Required For A Real 9.5

This is the part the current plan did not spell out strongly enough.

If the real target is `>= 9.5`, stop treating Waves 0–4 as the whole job. They are the recovery floor, not the final score gate.

## Wave 5 — Enforcement Ratchet And Deferred Reliability Closure

**Goal:** convert advisory recovery into enforced recovery and close the deferred items that still block true refactor safety.

### Bucket W5-A — Serial CI/Governance Closure

1. **CL-001 — Make advisory architecture/refactor checks hard-fail**
   Maps to:
   - `A-20`
   - `M-07`
   - `M-18`
   - `RS-14`
   - `RS-17`
   - `CQ-18`
   - `CQ-19`
   - `CQ-21`
   - `CQ-15`
     Why serial:
   - these share lint, CI, and review-gate surfaces
2. **CL-002 — Make RLS governance hard-fail**
   Maps to:
   - `S-03`
   - `S-04`
   - `S-21`
   - `HR-017`
     Why serial:
   - same CI and policy-inventory surfaces
3. **CL-003 — Turn restore discipline into practiced evidence, not documentation**
   Maps to:
   - `HR-015`
   - `OR-22`
     Deliverable:
   - recorded restore exercise
   - recorded migration rollback decision tree

### Bucket W5-B — Can Run Simultaneously

1. **CL-004 — Finish moving document generation and external provider sends out of transactional paths**
   Maps to:
   - `R-14`
   - `R-24`
   - remaining parts of `M-13`
     Why mostly solo:
   - this is the widest reliability refactor in the program; if bandwidth is limited, treat it as a one-task bucket
2. **CL-005 — Add replay/reconciliation tooling for stuck approval callbacks**
   Maps to:
   - `R-26`
     Why parallel-safe with CL-006:
   - approvals admin tooling and worker lock tuning do not need the same files
3. **CL-006 — Apply BullMQ timeout-equivalent lock discipline across critical processors**
   Maps to:
   - `R-20`

**Wave 5 exit gate**

- the important architecture and test gates now block bad changes instead of warning about them
- RLS governance fails closed
- rollback and restore are practiced capabilities
- transactional side effects are substantially reduced or eliminated in critical flows
- approval callback replay exists

## Wave 6 — 9.5 Closure And Independent Score Gate

**Goal:** finish the remaining structural and trust work, then require an independent audit that proves the score rather than assuming it.

### Bucket W6-A — Can Run Simultaneously

1. **CL-007 — Finish high-risk facade consumer migrations**
   Maps to:
   - remaining consumer migrations behind `A-16` through `A-20`
     Primary focus:
   - finance
   - behaviour
   - pastoral
   - gradebook
   - compliance
2. **CL-008 — Finish hotspot decomposition closure**
   Maps to:
   - `HR-019`
   - `HR-021`
   - `HR-022`
     Done means:
   - hotspot facades are thin
   - public-method counts fall
   - direct foreign reads shrink materially
3. **CL-009 — Finish the remaining frontend trust work**
   Maps to:
   - remaining high-value form migrations from `CQ-06`
   - authenticated critical-flow coverage beyond the minimal pack from `HR-010`

Parallel rule:

- CL-007 and CL-009 can run together safely
- CL-008 should not overlap with CL-007 in behaviour or pastoral slices unless ownership is split very carefully

### Bucket W6-B — Serial Independent Re-Audit

1. rerun the full evidence-based audit pattern
2. do not self-grade from implementation notes alone
3. require the following score gate before declaring the program complete:
   - Overall health: `>= 9.5`
   - Security: `>= 9.5`
   - Reliability: `>= 9.5`
   - Backend Test Health: `>= 9.0`
   - Frontend Test Health: `>= 9.0`
   - Worker Test Health: `>= 9.0`
   - Refactor Safety: `>= 9.5`
   - no open Critical issues
   - no open High issue without a funded owner and dated retirement plan

## Practical Order If You Want The Short Version

1. Alignment Gate
2. Wave 0
3. Wave 1
4. Wave 2
5. Wave 3
6. Wave 4
7. Wave 5
8. Wave 6

## What Can Truly Run At The Same Time

- In Wave 0: approval atomicity, notification retry recovery, worker baseline repair, and backend baseline repair can run together; callback self-healing cannot.
- In Wave 1: finance tests, compliance tests, key-rotation tests, and worker-health broadening can run together; frontend journey work should stay in its own bucket.
- In Wave 2: env contract, frontend Sentry, deploy-discipline docs, and login throttling can run together; RLS and raw-SQL enforcement should merge serially.
- In Wave 3: only auth-internal splitting and read-facade introduction are safely parallel; behaviour and pastoral decomposition should be serialized.
- In Wave 4: maintainability gates, hotspot budgets, and review guidance can run together; re-audit cannot.
- In Wave 5: most enforcement work should serialize because it shares CI and governance files; approval replay tooling and BullMQ lock tuning can run together.
- In Wave 6: facade migrations and frontend trust work can run together; final hotspot decomposition and the independent audit should not.
