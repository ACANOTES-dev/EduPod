# Bug Fix Regression Convention

> **Purpose**: Every bug fix commit MUST include at least one new test that would have caught the bug.
> **Status**: Firm project convention — not optional.
> **Last verified**: 2026-04-01

---

## The Rule

When you fix a bug, you must ship a regression test in the same commit (or PR).

The test must satisfy both conditions:

1. **Fails on the buggy code** — if you revert your fix, the test fails.
2. **Passes after the fix** — the test is green when the fix is applied.

A bug fix that ships without a regression test is incomplete.

---

## Why This Matters

Without regression tests, fixed bugs reappear. This is especially common during:

- Refactoring (code is moved or restructured; the fix is silently lost)
- Feature additions (new code paths that interact with the previously-buggy code)
- Dependency upgrades (library behaviour changes expose the same edge case)

A regression test is the only reliable way to guarantee a bug stays fixed. For a codebase of this size, this is the single most important habit for refactor safety.

---

## How to Do It

Follow this sequence exactly:

### Step 1 — Write the failing test

Before touching any implementation code, write a test that reproduces the bug. Run it. Confirm it fails with an error that matches the bug symptom — not just a generic failure.

```typescript
it('regression: should not double-allocate payment when called concurrently', async () => {
  // arrange: set up the exact conditions that triggered the bug
  // act: call the code that was broken
  // assert: verify the correct (post-fix) behaviour
});
```

If you cannot write a test that fails on the buggy code, stop and reconsider. Either the bug is not reproducible, or the test is not testing the right thing.

### Step 2 — Fix the code

Apply the fix. Keep it minimal — do not combine bug fixes with unrelated cleanups or improvements. One bug per commit.

### Step 3 — Verify the test passes

Run the test. It must pass. Then run the full suite:

```bash
turbo test --filter=<affected-package>
turbo test  # full suite to confirm no regressions
```

All pre-existing tests must still pass.

### Step 4 — Commit with the test included

The regression test and the fix go in the same commit. Do not split them — a fix without its test is incomplete, and a test without the fix is broken.

---

## What Counts as a Regression Test

Use the type that best matches where the bug lived:

| Bug type                                              | Test type                                            |
| ----------------------------------------------------- | ---------------------------------------------------- |
| Logic error in a single service method                | Unit test in `{service}.spec.ts`                     |
| Bug that spans multiple services or modules           | Integration test in `apps/api/test/`                 |
| Boundary condition (off-by-one, null check, overflow) | Edge case unit test                                  |
| Bug in a UI component or interaction                  | Component test or E2E test in `apps/web/e2e/`        |
| Concurrency or race condition                         | Unit test with concurrent calls or mock timing       |
| RLS isolation failure                                 | RLS leakage test (Tenant A data visible to Tenant B) |

When in doubt, prefer a unit test. It runs faster and pinpoints the failure more precisely.

---

## Naming Convention

Prefix the test description with `regression:` so it is searchable and clearly labelled:

```typescript
it('regression: should not double-allocate payment when called concurrently', ...)
it('regression: should return 404 when student does not belong to tenant', ...)
it('regression: should reject payroll run with zero working days', ...)
```

This makes it easy to audit which tests exist to protect known past bugs.

---

## PR Template

When this convention is enforced via the PR template (tracked as MT-15 in the recovery plan), reviewers will be prompted to confirm that:

- [ ] A regression test is included
- [ ] The test description is prefixed with `regression:`
- [ ] The test was confirmed to fail before the fix was applied

Until the PR template is updated, treat this as a self-enforced checklist item on every bug fix PR.

---

## What To Do When a Test Is Hard to Write

Some bugs are difficult to test directly — concurrency bugs, timing-dependent failures, third-party integration failures. In these cases:

1. Write the closest proxy test you can — even if it does not exercise the exact failure path, it should exercise the fix.
2. Add a comment in the test explaining why a more direct test is not feasible.
3. Do not skip the test entirely. A proxy test is better than no test.

If you genuinely cannot write any test (e.g., the bug is in an external service's behaviour), document why in the PR description and add a manual verification note.

---

## Related Documents

- `docs/architecture/refactoring-checklist.md` — references this convention in the pre-refactoring assessment
- `docs/architecture/refactor-risk-matrix.md` — risk levels for changes; higher-risk areas need more coverage
- `docs/architecture/characterization-testing-guide.md` — how to write tests for untested legacy code
