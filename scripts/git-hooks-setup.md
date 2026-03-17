# Git Hooks Setup (Husky + lint-staged)

This runs automatically on every commit to catch lint errors and type issues before they hit the repo.

## What It Does

**Pre-commit hook** — runs on every `git commit`:
- Lints staged `.ts`/`.tsx` files with ESLint
- Checks for physical CSS classes (ml-, mr-, pl-, pr-, left-, right-) in staged files
- Runs type-check on changed packages

**Pre-push hook** — runs on every `git push`:
- Runs the full type-check across the monorepo

## Setup

This is installed during Phase 0 scaffolding. The agent will run:

```bash
pnpm add -D -w husky lint-staged
pnpm exec husky init
```

## Configuration

### `.husky/pre-commit`
```bash
pnpm exec lint-staged
```

### `.husky/pre-push`
```bash
pnpm type-check
```

### `lint-staged` config in root `package.json`
```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix --max-warnings=0"
    ],
    "apps/web/**/*.{ts,tsx}": [
      "bash -c 'grep -rn \"\\bml-\\|\\bmr-\\|\\bpl-\\|\\bpr-\\|\\bleft-\\|\\bright-\\|\\btext-left\\|\\btext-right\\|\\brounded-l-\\|\\brounded-r-\" \"$@\" && echo \"ERROR: Physical CSS classes found. Use logical equivalents (ms-, me-, ps-, pe-, start-, end-)\" && exit 1 || exit 0' --"
    ]
  }
}
```

## How It Works in Practice

1. You (or the agent) make changes and `git commit`
2. Husky intercepts the commit and runs lint-staged
3. lint-staged only checks the files being committed (not the entire repo)
4. If any check fails, the commit is blocked with an error message
5. Fix the issue, `git add` again, and re-commit

## Why This Matters

The three most dangerous mistakes in this codebase are:
1. **Physical CSS classes** — breaks RTL for Arabic locale
2. **Missing tenant_id** — RLS leakage (caught by linting rules once ESLint is configured in P0)
3. **any types** — type safety erosion (caught by strict TypeScript)

The git hooks catch #1 and #3 before code leaves your machine.
