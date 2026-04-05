# Lint Health Recovery

> Created: 2026-04-05
> Scope: lint warning recovery plan for the current operating branch and upcoming weekly cleanup waves
> Primary goal: reach zero lint warnings without slowing normal feature delivery more than necessary

## Current Position

This repo already has a strong quality system for its current operating model.

- `main` is production-deploying
- CI is strict on type-check, lint errors, coverage, architecture governance, RLS safety, integration, and build
- module boundaries are at `0`
- module cohesion errors are at `0`
- undocumented cross-module dependencies are at `0`
- fast feedback has been improved with a front-loaded CI lane and a local `pnpm validate:fast` path

For the current operating model, this is a genuinely excellent system. It is strict in the places that protect production and architectural safety, but it is not obviously over-engineered.

The remaining weakness is lint warning noise. As of 2026-04-05, `pnpm --filter @school/api run lint` reports:

- `806` warnings
- `0` lint errors

Approximate warning distribution:

- `531` `school/no-cross-module-internal-import`
- `217` `max-lines`
- `43` `school/max-public-methods`
- `11` `@typescript-eslint/no-floating-promises`
- `4` `school/prefer-shared-subpath`

This plan exists to remove that warning noise in controlled waves so that real signals stay easy to detect during daily coding.

## Recovery Principles

1. Do not weaken the existing CI safety model.
2. Do not stop feature delivery for a full-repo lint crusade.
3. New work should not add fresh warning debt to already-cleared areas.
4. Each wave starts with a refresh pass:
   Re-run lint, identify any new items that belong to already-completed waves, and clear those first.
5. Multiple sessions may work in parallel only when write sets are disjoint.

## Wave Refresh Rule

At the start of every wave, do this before any new work:

1. Run `pnpm --filter @school/api run lint`.
2. Diff the current warning list against the previous completed wave snapshot.
3. If new warnings belong to a completed wave category, clear them first.
4. Only then proceed with the planned wave work.

This prevents drift where Wave 1 is "complete" on paper but silently reopens while Wave 3 is being worked.

## Target End State

By the end of the final wave:

- API lint warnings are at `0`
- CI can safely be changed to fail on warnings if desired
- newly touched modules are expected to remain warning-clean
- warning cleanup is handled during coding rather than as a separate debt project

## Wave Plan

### Wave 1: Guardrails and Easy Wins

Purpose:

- clear the smallest and highest-signal warnings first
- make it harder to create easy warning debt during normal coding

Primary targets:

- `@typescript-eslint/no-floating-promises`
- `school/prefer-shared-subpath`
- trivial import-order or mechanical warning fallout discovered during the wave
- root-level documentation and working conventions for lint recovery

Typical work:

- add `void` where intent is explicit
- replace deep shared imports with preferred shared subpaths
- clean obvious low-risk warnings in files already being touched
- establish a repeatable lint triage checklist

Expected size:

- small

Parallel execution:

- `No`

Why:

- touches root workflow, conventions, and cross-cutting hygiene patterns

### Wave 2: Cross-Module Imports, Domain Group A

Purpose:

- reduce `school/no-cross-module-internal-import` warnings in a tightly scoped set of modules

Write scope:

- `apps/api/src/modules/compliance/**`
- `apps/api/src/modules/regulatory/**`
- `apps/api/src/modules/reports/**`
- `apps/api/src/modules/scheduling-runs/**`
- `apps/api/src/modules/configuration/**` only where directly required by this group

Typical work:

- replace internal imports with DI through module imports
- introduce or extend facades where necessary
- convert runtime imports to `import type` when only types are needed
- update architecture docs when a dependency shape changes

Expected size:

- medium

Parallel execution:

- `Yes`, can run in parallel with Wave 3

### Wave 3: Cross-Module Imports, Domain Group B

Purpose:

- continue burning down `school/no-cross-module-internal-import` warnings in a second disjoint set of modules

Write scope:

- `apps/api/src/modules/academics/**`
- `apps/api/src/modules/attendance/**`
- `apps/api/src/modules/behaviour/**`
- `apps/api/src/modules/classes/**`
- `apps/api/src/modules/engagement/**`
- `apps/api/src/modules/students/**`
- `apps/api/src/modules/staff-wellbeing/**`

Typical work:

- the same dependency cleanup pattern as Wave 2
- convert direct module-internal imports to facades, DI, or type-only imports

Expected size:

- large

Parallel execution:

- `Yes`, can run in parallel with Wave 2

Conditions:

- no shared file ownership with Wave 2
- one owner per module family

### Wave 4: Structural Warning Reduction

Purpose:

- clear the warnings that require file and class decomposition rather than import cleanup

Primary targets:

- `max-lines`
- `school/max-public-methods`

Write scope:

- oversized services
- oversized facades
- oversized spec files

Typical work:

- split large specs into branch-focused siblings
- extract helper utilities and subordinate services
- split wide facades into narrower read helpers where appropriate
- preserve runtime behavior while reducing file/class size

Expected size:

- large

Parallel execution:

- `Partial`

Safe parallel pattern:

- one session owns spec-file splits
- one session owns service extraction
- one session owns facade decomposition

Unsafe pattern:

- two sessions editing the same oversized service or the same module family simultaneously

### Wave 5: Final Burn Down and Zero-Warning Ratchet

Purpose:

- clear remaining tail warnings
- catch new warnings introduced while earlier waves were running
- decide whether to hard-fail on warnings in CI

Primary targets:

- re-opened Wave 1-4 items
- small residual warnings
- any edge-case fallout from refactors

Typical work:

- rerun full lint
- clear any newly introduced warnings in already-clean areas
- confirm zero-warning baseline
- optionally promote warning policy to hard failure once zero is stable

Expected size:

- medium

Parallel execution:

- `No`

Why:

- final reconciliation wave
- likely touches many modules lightly and needs a single source of truth

## Parallelism Matrix

Safe to run at the same time:

- Wave 2 and Wave 3
- substreams inside Wave 4, only if file ownership is disjoint

Not safe to run at the same time:

- Wave 1 with any other wave
- Wave 5 with any other wave
- two sessions touching the same module family inside Waves 2-4

Recommended session strategy:

1. Finish Wave 1 solo.
2. Run Wave 2 and Wave 3 in parallel.
3. Run Wave 4 as two or three parallel substreams only after ownership is assigned.
4. Finish with Wave 5 solo.

## Suggested Ownership Split

If multiple sessions are used:

- Session A: Wave 2
- Session B: Wave 3
- Session C: Wave 4 spec-file decomposition
- Session D: Wave 4 service and facade decomposition

Only start Wave 4 sessions after Waves 2 and 3 are substantially complete, or the refactor surface will churn too much.

## Per-Wave Definition Of Done

A wave is only complete when all of the following are true:

1. The target warning class for that wave is cleared in its owned write set.
2. `pnpm --filter @school/api run lint` has been re-run after the last change.
3. Type-check passes for affected packages.
4. Relevant tests pass for affected modules.
5. Architecture docs are updated if dependency boundaries changed.
6. The implementation log has been updated.

## Recommended Command Checklist

Baseline:

```bash
pnpm --filter @school/api run lint
```

Fast safety pass during a wave:

```bash
pnpm validate:fast
```

Targeted package verification:

```bash
pnpm --filter @school/api run type-check
pnpm --filter @school/api run test -- --runInBand
```

## Success Criteria

This plan is successful if it achieves all of the following:

- zero lint warnings
- no rollback in current CI safety
- no significant slowdown in normal feature delivery
- future warning debt is caught during coding, not months later

## Notes

- Do not turn warning-failure on globally until the backlog is close to zero and stable.
- The largest body of work is not hygiene; it is architectural import cleanup.
- Zero warnings is realistic, but it is a recovery program, not a quick polish pass.
