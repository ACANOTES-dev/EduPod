# Refactoring Safety Checklist

> **Purpose**: A step-by-step process a developer must complete before starting and after finishing any refactoring work.
> **Usage**: Copy the checklist below into your PR description. Check off each item as you complete it.
> **Last verified**: 2026-04-01

---

## When to use this checklist

Use this checklist for ANY change whose primary purpose is restructuring code without changing observable behaviour — extracting functions, splitting services, renaming internals, reorganising files, or consolidating duplication.

If you are also adding new functionality, complete this checklist first (for the refactoring portion), then follow the normal pre-flight checklist (`architecture/pre-flight-checklist.md`) for the new behaviour.

---

## The Checklist

Copy everything from `---BEGIN---` to `---END---` into your PR description.

---BEGIN---

### RS-1: Pre-Refactoring Assessment

- [ ] **Necessity**: State in one sentence why this refactoring is needed (readability, performance, enabling a future feature, etc.). If you cannot state it clearly, reconsider.
- [ ] **Scope identified**: List every file that will be created, modified, or deleted.
- [ ] **Blast radius checked**: Read [`architecture/module-blast-radius.md`](module-blast-radius.md) for all modules that import or are imported by the files in scope.
- [ ] **Danger zones checked**: Scanned [`architecture/danger-zones.md`](danger-zones.md) for entries related to the change area.
- [ ] **State machines checked**: If any file being refactored owns or validates a status/lifecycle field, read [`architecture/state-machines.md`](state-machines.md) for that entity.
- [ ] **No scope creep**: Confirmed the refactoring does NOT touch behaviour (logic, API contracts, DB schema, job payloads).

### RS-2: Test Baseline

- [ ] **Test suite passes**: Ran `turbo test` (or the narrowed scope: `turbo test --filter=<package>`) against the current code BEFORE making any changes. All tests pass.
- [ ] **Baseline recorded**: Noted the current test count and coverage percentage for the affected files. (Paste the summary here: **_ tests, _**% coverage)
- [ ] **No flaky tests**: Any pre-existing flaky test is flagged and understood — not masked by this refactoring.

### RS-3: Characterization Tests

- [ ] **Characterization tests written**: For any function or class whose behaviour is not already fully covered by existing tests, wrote tests that capture the CURRENT (pre-refactoring) behaviour.
  - Focus on: public method inputs/outputs, side effects, error cases.
  - These tests do not need to be elegant — their job is to catch regressions.
- [ ] **Characterization tests committed separately**: Committed the characterization tests as a standalone commit BEFORE starting the refactoring. This makes it possible to diff "test added before refactoring" vs "refactoring change".
- [ ] **Exception acknowledged**: If the code being refactored has 100% test coverage already and every behaviour path is exercised, characterization tests may be skipped. Explicitly state this in the PR.

### RS-4: Architecture Doc Pre-Read

- [ ] **`module-blast-radius.md`**: Read the entry for every module in scope. Noted all downstream consumers of any exported service being refactored.
- [ ] **`danger-zones.md`**: Scanned all entries. Relevant entries: _(list any that apply, or "none")_
- [ ] **`state-machines.md`**: If applicable, confirmed which service owns state machine validation and that it is unchanged after refactoring.
- [ ] **`event-job-catalog.md`**: If applicable, confirmed BullMQ job names, payloads, and processor routing are unchanged.

### RS-5: Implementation

- [ ] **Atomic commits**: Each commit contains one logical change (e.g., "extract helper", "rename method", "move file"). No mixed-purpose commits.
- [ ] **No behaviour change**: The refactoring does not alter observable behaviour — same inputs produce same outputs, same side effects, same error messages.
- [ ] **No API contract change**: Public controller signatures, route paths, DTO shapes, and Zod schemas are unchanged.
- [ ] **No schema change**: Prisma schema is unchanged. No new migrations.
- [ ] **No job payload change**: BullMQ job names and payload shapes are unchanged.
- [ ] **RLS transactions preserved**: Any `createRlsClient().$transaction()` patterns are carried over exactly — not accidentally replaced with sequential transactions or direct Prisma calls.
- [ ] **TypeScript strict**: No `any`, no `@ts-ignore`, no `as unknown as X` introduced (except the one permitted RLS cast).
- [ ] **Import order**: Imports in all modified files follow the three-block pattern (external → `@school/*` → relative).

### RS-6: Post-Refactoring Verification

- [ ] **All pre-existing tests pass**: `turbo test` reports no new failures.
- [ ] **Characterization tests pass**: Every test written in RS-3 passes.
- [ ] **Coverage unchanged or improved**: Coverage for affected files is >= the baseline recorded in RS-2.
- [ ] **Type-check clean**: `turbo type-check` passes with no new errors.
- [ ] **Lint clean**: `turbo lint` passes with no new errors or warnings.
- [ ] **Build passes**: `turbo build` succeeds end-to-end.

### RS-7: Architecture Doc Update

- [ ] **`module-blast-radius.md`**: Updated if any cross-module import was added, removed, or changed.
- [ ] **`event-job-catalog.md`**: Updated if any BullMQ job name, queue, or payload was renamed or restructured (even internally).
- [ ] **`danger-zones.md`**: Added an entry if the refactoring revealed a non-obvious coupling or risk that wasn't previously documented.
- [ ] **No update needed**: Confirmed that the refactoring made no changes to cross-module dependencies, job flows, or state machines. (State this explicitly in the PR.)

---END---

---

## Red Flags — Stop and Reassess

If any of the following arise during a refactoring, stop. Do not proceed until resolved.

- A characterization test reveals behaviour you didn't expect — the code is doing something undocumented. Understand it before refactoring it.
- The refactoring requires a schema change. That is not a refactoring — it is a migration. Treat it as a separate change with its own migration playbook (`architecture/schema-change-playbook.md`).
- The refactoring requires changing a public controller endpoint or DTO shape. That is a breaking API change, not a refactoring.
- An existing test breaks due to your change. Fix the regression before proceeding — do not delete or skip the test.
- You need to change a BullMQ job payload to make the refactoring work. Stop — this is not purely a refactoring.
