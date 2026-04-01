# Git Hooks Setup (Husky + lint-staged)

This repo uses Husky to keep the local developer workflow honest without turning every commit into a full CI run.

## What It Does

**Pre-commit hook** — runs on every `git commit`:

- Runs `pnpm lint-staged`
- Lints staged `.ts`/`.tsx` files with ESLint
- Formats staged source, JSON, Markdown, and CSS files with Prettier

**Pre-push hook** — runs on every `git push`:

- Prints an architecture-doc freshness reminder when code changed but nothing under `architecture/` changed
- Does not block the push; it is a safety nudge before production-facing changes leave your machine

## Setup

This is installed during Phase 0 scaffolding. The agent will run:

```bash
pnpm add -D -w husky lint-staged
pnpm exec husky init
```

## Configuration

### `.husky/pre-commit`

```bash
pnpm lint-staged
```

### `.husky/pre-push`

```bash
bash scripts/check-architecture-freshness.sh
```

### `lint-staged` config in root `package.json`

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix --max-warnings=0"],
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

The main goal is fast local feedback:

1. Catch obvious staged-file issues before they land in a commit
2. Remind you to update `architecture/` when the code change likely has cross-cutting impact
3. Keep the heavier checks (`pnpm validate`, integration tests, visual smoke) available on demand instead of forcing them into every commit
