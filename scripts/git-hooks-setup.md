# Git Hooks Setup (Husky + lint-staged + commitlint)

This runs automatically on every commit to catch lint errors, formatting drift, and invalid commit messages before they hit the repo.

## What It Does

**Pre-commit hook** — runs on every `git commit`:

- Lints staged `.ts`/`.tsx` files with ESLint
- Formats staged files with Prettier

**Commit message hook** — runs after `git commit` is created:

- Enforces Conventional Commits via commitlint

## Setup

This is installed during Phase 0 scaffolding. The agent will run:

```bash
pnpm add -D -w husky lint-staged @commitlint/cli @commitlint/config-conventional
pnpm install
```

## Configuration

### `.husky/pre-commit`

```bash
pnpm exec lint-staged
```

### `.husky/commit-msg`

```bash
pnpm commitlint --edit "$1"
```

### `lint-staged` config in root `package.json`

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix"],
    "*.{ts,tsx,js,jsx,json,md,css}": ["prettier --write"]
  }
}
```

## How It Works in Practice

1. You (or the agent) make changes and `git commit`
2. Husky intercepts the commit and runs lint-staged
3. lint-staged only checks the files being committed (not the entire repo)
4. commitlint validates the message format
5. If any check fails, the commit is blocked with an error message
6. Fix the issue, `git add` again, and re-commit

## Why This Matters

The four most dangerous mistakes in this codebase are:

1. **Physical CSS classes** — breaks RTL for Arabic locale
2. **Missing tenant_id** — RLS leakage (caught by linting rules once ESLint is configured in P0)
3. **any types** — type safety erosion (caught by strict TypeScript)
4. **Unstructured commit history** — makes regression tracking and rollback harder

The git hooks catch formatting and code hygiene locally, and commitlint keeps history aligned with the repo's conventional-commit policy. Physical CSS direction mistakes are enforced by the shared ESLint rule rather than a shell grep.
