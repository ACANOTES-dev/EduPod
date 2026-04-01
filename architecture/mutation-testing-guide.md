# Mutation Testing Guide

## What Is Mutation Testing?

Mutation testing measures the effectiveness of your test suite by introducing small changes (mutations) to the source code and checking whether existing tests detect them. Each mutation creates a "mutant" -- for example, changing `>` to `>=`, replacing `true` with `false`, or removing a function call.

- **Killed mutant**: A test failed because of the mutation. Good -- your tests caught the change.
- **Surviving mutant**: No test failed despite the mutation. Bad -- your test suite has a gap.

A test suite with 100% line coverage can still have surviving mutants. Coverage tells you what code runs during tests; mutation testing tells you whether the tests actually _verify_ that code behaves correctly.

## Why It Matters for Refactor Safety

When refactoring, you rely on the test suite to catch regressions. If a test "covers" a line but does not assert on its output, the test will pass regardless of what the code does -- making it useless as a safety net. Mutation testing surfaces these blind spots before a refactor, not after.

## Setup (One-Time)

The Stryker dependencies must be installed before mutation tests can run:

```bash
pnpm install
```

This installs the following devDependencies (already declared in `apps/api/package.json`):

- `@stryker-mutator/core` -- mutation testing framework
- `@stryker-mutator/jest-runner` -- runs Jest tests against mutants
- `@stryker-mutator/typescript-checker` -- type-checks mutants before testing (skips compile-error mutants)

## How to Run

```bash
pnpm --filter @school/api test:mutation
```

This runs Stryker using the configuration at `apps/api/stryker.conf.json`.

**Expect it to be slow** -- Stryker runs your test suite once per surviving mutant. With `concurrency: 2`, it runs two mutants in parallel. A full run on the 5 configured services may take 10-30 minutes depending on the machine.

## How to Read Results

### Terminal Output (clear-text reporter)

```
Mutant survived: src/modules/finance/payments.service.ts:42:8
  - ArithmeticOperator: replaced + with -
  No tests failed for this mutant.
```

This means line 42 of `payments.service.ts` has an arithmetic operation that no test actually validates. A developer could change `+` to `-` and all tests would still pass.

### HTML Report

After a run, open `reports/mutation/html/index.html` in a browser for a file-by-file breakdown with colour-coded source lines.

### Score Thresholds

| Threshold | Score  | Meaning                            |
| --------- | ------ | ---------------------------------- |
| High      | >= 80% | Healthy -- tests are effective     |
| Low       | >= 60% | Acceptable -- some gaps to address |
| Break     | < 50%  | Build fails -- critical test gaps  |

## Configured Services

The following 5 critical services are configured for mutation testing:

| Service                            | Module    | Why Critical                                                      |
| ---------------------------------- | --------- | ----------------------------------------------------------------- |
| `auth.service.ts`                  | auth      | Authentication logic -- JWT, password hashing, session management |
| `invoices.service.ts`              | finance   | Invoice creation, state transitions, monetary calculations        |
| `payments.service.ts`              | finance   | Payment recording, allocation, refund logic                       |
| `behaviour-sanctions.service.ts`   | behaviour | Sanction lifecycle, escalation rules                              |
| `safeguarding-concerns.service.ts` | behaviour | Safeguarding concern tracking -- child protection critical path   |

## How to Add More Services

Edit `apps/api/stryker.conf.json` and add paths to the `mutate` array:

```json
{
  "mutate": [
    "src/modules/auth/auth.service.ts",
    "src/modules/finance/invoices.service.ts",
    "src/modules/finance/payments.service.ts",
    "src/modules/behaviour/behaviour-sanctions.service.ts",
    "src/modules/behaviour/safeguarding-concerns.service.ts",
    "src/modules/payroll/payroll-calculations.service.ts"
  ]
}
```

**Tips for choosing what to add:**

- Prioritize services with monetary calculations, state machines, or security logic
- Avoid adding services with heavy external dependencies (HTTP calls, S3) -- mock overhead slows mutation testing significantly
- Start with services that already have good test coverage -- mutation testing is most useful when coverage exists but quality is uncertain

## How to Fix Surviving Mutants

1. Read the mutant description -- what was changed?
2. Find the line in the source code
3. Ask: "What test should have caught this?"
4. Write a test that asserts on the specific behaviour the mutant altered
5. Re-run `pnpm --filter @school/api test:mutation` to confirm the mutant is now killed

## CI Integration

Mutation testing is NOT part of the standard CI pipeline -- it is too slow for every PR. Run it:

- Before major refactors of critical services
- Periodically (e.g., monthly) to audit test quality
- When coverage numbers look good but you suspect tests are shallow
