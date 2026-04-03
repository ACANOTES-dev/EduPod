# Health Recovery Plan

> **Objective:** Move EduPod from "operable but unsafe to change quickly" to a green, trustworthy, re-audited codebase with a credible path to `>= 9.5/10` overall health.
> **Date:** 2026-04-02
> **Status:** Proposed execution plan
> **Primary source:** `Audit-GPT/Audit-GPT-2/master-audit-report_02-04-2026.md`
> **Supporting sources:** `Audit-GPT/Audit-GPT-2/risk-ledger_02-04-2026.md`, `Audit-GPT/Audit-GPT-2/challenge-pass_02-04-2026.md`, `Plans/HEALTH-RECOVERY-MASTERPLAN.md`

---

## 1. Baseline

The latest audit baseline is:

- Overall health: `5.8/10`
- Security: `7.5/10`
- Reliability: `5.0/10`
- Architecture: `5.5/10`
- Refactor safety: `4.5/10`

The codebase is not in crisis, but it is carrying real release and change risk in a few concentrated areas:

1. approval decisions are non-atomic
2. notification retries are effectively disabled
3. worker verification is red
4. finance transaction paths are under-protected by tests
5. critical frontend journeys are not meaningfully covered
6. hotspot modules (`auth`, `behaviour`, `pastoral`) are too large and too porous

Important execution context:

- the current working tree is no longer identical to the audited snapshot
- some test files and audit artifacts have changed since the `02-04-2026` audit bundle was written
- where the live repo and the dated audit disagree, execution should trust live repo evidence first and treat the audit as a dated baseline

---

## 2. Plan Precedence

This document is the execution source of truth for health recovery priority as of `2026-04-02`.

- It **supersedes** the ordering in `Plans/HEALTH-RECOVERY-MASTERPLAN.md` for day-to-day execution.
- It does **not** invalidate earlier plans; those remain useful reference material.
- If this plan conflicts with an older recovery plan, prefer this file unless a newer dated plan exists.

---

## 3. Recovery Rules

These rules apply throughout the program:

1. No new feature work lands ahead of `Wave 0` and `Wave 1` items unless it is production-critical, legally required, or explicitly approved as an exception.
2. Every recovery item must leave a regression guard behind:
   - test
   - CI rule
   - lint rule
   - architecture doc
   - or operational runbook
3. Every structural change must assess and update `architecture/` in the same change.
4. No large hotspot decomposition starts before the correctness and verification floor is restored.
5. A wave is not complete until its exit gate is green.

---

## 4. Recovery Goal

This plan is designed to reach a state where the repo is:

- green on required verification lanes
- no longer carrying live correctness defects in approvals/notifications
- materially safer to refactor in finance and worker critical paths
- operationally more credible in deploy, rollback, health, and observability
- structurally healthier in the highest-cost modules

This plan now needs to be read in two stages:

1. **Stage A — Recovery floor**
   - restore green verification
   - close live correctness defects
   - rebuild trust in the highest-blast-radius test and health surfaces
   - expected outcome after re-audit:
     - Reliability: `>= 7.5`
     - Architecture: `>= 7.5`
     - Maintainability: `>= 7.5`
     - Refactor safety: `>= 7.0`
     - Overall health: `>= 8.0`
2. **Stage B — 9.5 closure**
   - convert warning-only governance into enforced gates
   - complete the remaining hotspot boundary recovery and consumer migrations
   - close high-risk deferred items that still block true refactor safety
   - require an independent follow-up audit with:
     - Overall health: `>= 9.5`
     - no Critical issues open
     - no High-severity issue without a funded retirement plan and dated owner
     - no required verification lane red by default

The companion execution-order file is the operational source for bucket order, parallel-safe work groupings, and the added Stage B closure waves.

---

## 5. Wave Overview

### Wave 0 — Stop Active Risk

**Goal:** Remove live correctness defects and restore a trustworthy green baseline.

- [ ] **HR-001 — Make approval decisions atomic**
      Scope:
  - `apps/api/src/modules/approvals/approval-requests.service.ts`
  - approval approve/reject/cancel transitions
  - add concurrency-oriented tests
    Success condition:
  - a stale `pending_approval` read cannot produce two successful conflicting decisions

- [ ] **HR-002 — Repair approval callback self-healing**
      Scope:
  - announcement, invoice, and payroll approval callback processors
  - callback reconciliation logic
  - add replay/idempotency tests
    Success condition:
  - if the target entity is already in the post-approval state, callback tracking repairs itself instead of remaining failed/pending

- [ ] **HR-003 — Activate notification retry recovery**
      Scope:
  - `apps/worker/src/cron/cron-scheduler.service.ts`
  - `apps/worker/src/processors/communications/retry-failed.processor.ts`
  - `apps/worker/src/processors/notifications/dispatch-queued.processor.ts`
  - add proof tests for retry after `next_retry_at`
    Success condition:
  - transient notification failures are re-queued and retried automatically

- [ ] **HR-004 — Restore the worker green baseline**
      Scope:
  - `apps/worker/src/processors/compliance/compliance-execution.processor.spec.ts`
  - `apps/worker/src/base/redis.helpers.spec.ts`
  - `apps/worker/src/base/search.helpers.spec.ts`
  - worker lint/type blockers
    Success condition:
  - worker tests, lint, and type-check all pass

- [ ] **HR-005 — Restore the backend fully green baseline**
      Scope:
  - `apps/api/src/modules/school-closures/school-closures.service.spec.ts`
    Success condition:
  - backend unit suite is green without mock-contract drift failures

- [ ] **HR-006 — Re-run and capture the recovery baseline**
      Scope:
  - `pnpm turbo run lint`
  - `pnpm turbo run type-check`
  - `pnpm turbo run build`
  - `cd apps/api && pnpm test`
  - `cd apps/worker && pnpm test`
    Success condition:
  - all required checks are green and recorded

**Wave 0 exit gate**

- [ ] No failing backend suites
- [ ] No failing worker suites
- [ ] `lint`, `type-check`, and `build` all pass
- [ ] The approval race is closed
- [ ] Notification retry is live and tested

---

### Wave 1 — Restore Trust In High-Blast-Radius Guardrails

**Goal:** Strengthen the exact test and health surfaces needed for safe refactoring.

- [ ] **HR-007 — Add finance transaction safety coverage**
      Scope:
  - `apps/api/src/modules/finance/payments.service.ts`
  - `apps/api/src/modules/finance/payments.service.spec.ts`
    Include:
  - successful allocation flow
  - household mismatch
  - over-allocation
  - invoice rebalance
  - duplicate receipt prevention
  - concurrency realism where practical

- [ ] **HR-008 — Add compliance execution safety coverage**
      Scope:
  - `apps/worker/src/processors/compliance/compliance-execution.processor.ts`
    Include:
  - export path
  - erasure/anonymisation path
  - failure accounting
  - replay/idempotency behavior

- [ ] **HR-009 — Add key rotation safety coverage**
      Scope:
  - `apps/worker/src/processors/security/key-rotation.processor.ts`
    Include:
  - dry-run mode
  - missing-key skips
  - decryption failures
  - update batching
  - no-repeat corruption behavior

- [ ] **HR-010 — Replace fake frontend confidence with real critical-flow coverage**
      Scope:
  - add a minimal authenticated Playwright journey pack
    Include at minimum:
  - login
  - one attendance save flow
  - one finance flow
  - one parent-facing or teacher/admin path
    Success condition:
  - critical flows do more than screenshot protected routes

- [ ] **HR-011 — Fix mirrored frontend rule tests**
      Scope:
  - `require-role` tests
  - school layout/nav tests
    Success condition:
  - route and nav tests exercise shared runtime config or rendered components, not copied rule tables

- [ ] **HR-012 — Expand worker health beyond notifications**
      Scope:
  - `apps/worker/src/health/worker-health.service.ts`
  - deploy smoke expectations
    Success condition:
  - green worker health means more than "notifications queue is reachable"

**Wave 1 exit gate**

- [ ] `finance.confirmAllocations()` has meaningful positive and negative coverage
- [ ] compliance execution is covered by an executable safety harness
- [ ] key rotation is covered by an executable safety harness
- [ ] at least a minimal authenticated frontend journey pack is green
- [ ] worker health checks cover critical queue surface, not just notifications

---

### Wave 2 — Security, Ops, And Release Hardening

**Goal:** Remove governance drift and tighten release credibility.

- [ ] **HR-013 — Standardize the local environment contract**
      Scope:
  - `.env.example`
  - `scripts/setup.sh`
  - `scripts/doctor.mjs`
  - runtime env loading
  - `MEILISEARCH_URL` vs `MEILISEARCH_HOST`
    Success condition:
  - docs, setup scripts, and runtime agree on one env-file convention and one Meilisearch variable name

- [ ] **HR-014 — Modernize frontend Sentry/App Router integration**
      Scope:
  - web Sentry config
  - App Router instrumentation/global error integration
    Success condition:
  - build warnings about deprecated Sentry/App Router wiring are gone

- [ ] **HR-015 — Make schema-risk explicit in deploy discipline**
      Scope:
  - deployment docs and runbooks
  - migration policy
  - restore rehearsal guidance
    Success condition:
  - backwards-compatible migration discipline is documented and used as the default
  - restore-from-backup is a practiced path, not only a runbook paragraph

- [ ] **HR-016 — Tighten raw SQL governance**
      Scope:
  - allowlisted raw SQL wrapper or explicit CI-controlled exceptions
  - lint enforcement
    Success condition:
  - raw SQL is centrally governed and reviewed, not ad hoc in feature code

- [ ] **HR-017 — Reconcile and enforce the canonical RLS catalogue**
      Scope:
  - `packages/prisma/rls/policies.sql`
  - CI audit comparing tenant-scoped models/tables to policy inventory
    Success condition:
  - no tenant-scoped table can drift out of the canonical RLS inventory quietly

- [ ] **HR-018 — Strengthen login throttling**
      Scope:
  - auth login rate-limiting logic
    Success condition:
  - throttling is no longer keyed only by email; account, tenant, and IP abuse are covered more realistically

**Wave 2 exit gate**

- [ ] environment drift is eliminated
- [ ] frontend observability warnings are removed
- [ ] RLS catalogue drift is closed and guarded by CI
- [ ] raw SQL usage is governed
- [ ] login throttling is materially stronger than email-only gating

---

### Wave 3 — Architecture And Boundary Recovery

**Goal:** Reduce change cost in the modules that currently dominate blast radius.

- [ ] **HR-019 — Split `AuthService` into focused internal services**
      Suggested slices:
  - token/signing
  - session store
  - password reset
  - MFA
  - tenant switching / session queries
    Success condition:
  - `AuthService` becomes a thin facade instead of the primary change hotspot

- [ ] **HR-020 — Introduce read facades for highest-shared tables**
      First candidates:
  - students
  - staff profiles
  - academic periods / enrolments
  - attendance summary
    Success condition:
  - direct foreign-table Prisma reads shrink in the highest-risk consumers

- [ ] **HR-021 — Start `behaviour` internal decomposition**
      Suggested slices:
  - incident core
  - sanctions
  - documents
  - parent-facing flows
  - analytics
    Success condition:
  - `behaviour` is no longer functioning as one oversized sub-platform module

- [ ] **HR-022 — Start `pastoral` internal decomposition**
      Suggested slices:
  - concern lifecycle
  - referrals / meetings
  - reporting
  - child-protection integration seams
    Success condition:
  - `pastoral` no longer depends on one report factory and broad provider surface

- [ ] **HR-023 — Narrow `packages/shared/src/index.ts`**
      Success condition:
  - the root barrel exports only stable shared contracts and primitives
  - runtime-heavy and domain-heavy exports move behind explicit subpaths

- [ ] **HR-024 — Add boundary enforcement**
      Scope:
  - module ownership registry
  - architecture tests / CI checks for protected foreign reads
    Success condition:
  - module boundaries become enforced constraints, not only documentation

**Wave 3 exit gate**

- [ ] `auth`, `behaviour`, and `pastoral` each have materially smaller internal blast radii
- [ ] highest-shared cross-module reads are routed through explicit seams
- [ ] shared root-barrel sprawl is reduced
- [ ] boundary enforcement exists in automation, not only in docs

---

### Wave 4 — Maintainability And Governance

**Goal:** Make the healthier state durable.

- [ ] **HR-025 — Promote the most important maintainability rules from warnings to harder gates**
      Candidates:
  - hand-rolled forms
  - untranslated strings
  - silent catch behavior
  - import ordering where structurally useful

- [ ] **HR-026 — Add hotspot budgets and recurring measurement**
      Scope:
  - top backend files
  - top worker files
  - top frontend workflow pages
    Success condition:
  - the largest files are tracked and expected to shrink, not only observed

- [ ] **HR-027 — Add module-level and hotspot review guidance**
      Scope:
  - module READMEs
  - PR checklist additions
  - change-cost notes for hotspot areas

- [ ] **HR-028 — Re-audit after waves complete**
      Scope:
  - repeat the same evidence-based audit pattern
    Success condition:
  - score movement is measured, not assumed

**Wave 4 exit gate**

- [ ] maintainability drift is gated, not only reported
- [ ] hotspot metrics are tracked
- [ ] re-audit shows real score improvement

---

## 6. Suggested Execution Order

If this is executed sequentially with limited bandwidth, the recommended order is:

1. `HR-001` through `HR-006`
2. `HR-007`, `HR-008`, `HR-009`, `HR-012`
3. `HR-010`, `HR-011`
4. `HR-013` through `HR-018`
5. `HR-019` through `HR-024`
6. `HR-025` through `HR-028`

What not to do early:

- Do not start large `behaviour`/`pastoral` decomposition before the worker and approval correctness floor is green.
- Do not treat screenshot-only frontend coverage as sufficient.
- Do not rely on deploy/rollback strength while schema rollback remains a manual path.

---

## 7. Success Criteria

The recovery plan is successful when all of the following are true:

- required verification lanes are green by default
- approval and notification correctness issues are closed and guarded
- finance and critical worker flows have meaningful regression protection
- worker health and deploy smoke reflect real background-system health
- environment and observability drift are removed
- hotspot modules have materially lower blast radius
- a follow-up audit can honestly say the system is safer to scale, safer to extend, and materially safer to refactor

---

## 8. Notes

- This is intentionally narrower and more execution-oriented than the older `HEALTH-RECOVERY-MASTERPLAN.md`.
- `Wave 0` through `Wave 4` define the recovery spine; the companion execution-order file extends them into a full `>= 9.5` program.
- The immediate target is not “perfect elegance.” It is “safe enough to trust the codebase and move without gambling,” then ratchet from there into enforceable 9.5 territory.
