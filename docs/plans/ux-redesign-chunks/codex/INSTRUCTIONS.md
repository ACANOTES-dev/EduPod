# UX Redesign — Codex Instructions

## Your Role

You are executing the EduPod UX redesign in an isolated git worktree. You will work through 10 implementation chunks sequentially, documenting your progress in implementation logs after each chunk.

## Setup (Run Once)

The user has already created this worktree for you:

```bash
git worktree add ../SDB-codex-redesign -b redesign/codex
```

You are working in: `~/Desktop/SDB-codex-redesign/`

Verify you're in the right place:

```bash
git branch --show-current  # Should show: redesign/codex
```

Start the dev server on port 3003:

```bash
cd apps/web && pnpm dev --port 3003
```

## What You're Building

A complete frontend UX redesign. Before starting ANY work, read the full design spec:

**`docs/plans/ux-redesign-final-spec.md`** — This is the source of truth.

Summary of changes:

- **Navigation:** Remove the 260px sidebar. Replace with a 56px dark top "Morph Bar" with 7 hub pills (Home, People, Learning, Operations, Finance, Reports, Settings). When inside a module, a 44px dark "Sub-Strip" appears below the bar with module-specific tabs.
- **Colours:** "Warm Stone" palette. Light mode: `#FAF9F7` background (warm cream). Dark mode: `#1A1816` (warm brown-black). All via CSS custom properties.
- **Typography:** Figtree font (replacing Plus Jakarta Sans). Type scale with 14 tokens from 11px to 28px.
- **Shapes:** Pill buttons (9999px radius), 16px radius cards, 12px radius inputs, 20px radius modals.
- **Home page:** Two-column: priority feed + activity feed (left), school snapshot + progress bars + quick actions (right, 360px). Role-specific variants.
- **Dark mode:** Warm, not cold. Bar darker than content. Softened text. Warm borders.

## Critical Codebase Rules

These are non-negotiable. Read `CLAUDE.md` at the repo root for the full list.

### RTL — ZERO TOLERANCE

This app supports Arabic (RTL). Every CSS class must use logical properties:

| NEVER use    | ALWAYS use   |
| ------------ | ------------ |
| `ml-4`       | `ms-4`       |
| `mr-4`       | `me-4`       |
| `pl-4`       | `ps-4`       |
| `pr-4`       | `pe-4`       |
| `left-0`     | `start-0`    |
| `right-0`    | `end-0`      |
| `text-left`  | `text-start` |
| `text-right` | `text-end`   |
| `rounded-l-` | `rounded-s-` |
| `rounded-r-` | `rounded-e-` |
| `border-l-`  | `border-s-`  |
| `border-r-`  | `border-e-`  |

### No Hardcoded Colours

Components must NEVER contain hex colour values like `#1C1917` or `bg-stone-900`. Always use CSS variable tokens: `bg-background`, `text-text-primary`, `border-border`, etc. The token-to-variable mapping is in `packages/ui/tailwind.config.ts`.

### Component Library

- Shared components live in `packages/ui/src/components/`
- Page-specific components go in `apps/web/src/app/[locale]/(school)/[module]/_components/`
- Icons: `lucide-react` only
- Styling: Tailwind CSS only — no inline styles, no CSS modules

### Data Fetching

- Use `apiClient<T>()` from `@/lib/api-client` with `React.useEffect`
- Client components need `'use client'` directive
- Do NOT use server-component data fetching

## Execution Sequence

Work through chunks IN ORDER. Each chunk file is in `docs/plans/ux-redesign-chunks/`:

| Order | File                       | Description              |
| ----- | -------------------------- | ------------------------ |
| 1     | `01-design-tokens.md`      | Warm Stone CSS variables |
| 2     | `02-font-swap.md`          | Figtree font             |
| 3     | `03-morph-bar.md`          | Dark top navigation bar  |
| 4     | `04-sub-strip.md`          | Module contextual tabs   |
| 5     | `05-module-pages.md`       | Full-width page updates  |
| 6     | `06-home-page.md`          | Feed-driven dashboard    |
| 7     | `07-command-palette.md`    | Dark ⌘K palette          |
| 8     | `08-mobile-responsive.md`  | Mobile navigation        |
| 9     | `09-role-home-variants.md` | Role-specific homes      |
| 10    | `10-polish-pass.md`        | Animations + polish      |

For each chunk:

1. Read the chunk file completely
2. Read the referenced design spec sections
3. Read any existing files you'll modify (understand before changing)
4. Implement the changes
5. Verify against the checklist in the chunk
6. Write an implementation log
7. Commit: `feat(redesign): chunk XX — description`

## Implementation Logs

After each chunk, write to:

```
docs/plans/ux-redesign-chunks/codex/implementation-logs/chunk-XX.md
```

Format:

```markdown
# Chunk XX — [Name]

**Status:** Complete / Partial / Blocked
**Date:** YYYY-MM-DD
**Commit:** [commit hash]

## Files Created

- `path/to/file.tsx` — description

## Files Modified

- `path/to/file.tsx` — what changed

## Decisions Made

- Implementation decisions not in the spec

## Deviations from Spec

- Anything different from the spec, and why

## Verification Results

- [ ] Check — pass/fail

## Known Issues

- Bugs, TODOs, visual imperfections
```

## Rules

1. **Do NOT push to remote.** Local `redesign/codex` branch only.
2. **Do NOT modify backend code** (apps/api/, apps/worker/, packages/prisma/).
3. **Preserve all functionality.** Visual redesign only — no feature changes.
4. **Test both LTR and RTL** after each chunk.
5. **Test both light and dark mode** after each chunk.
6. **One commit per chunk.**

## Key Files

| Resource        | Path                                                       |
| --------------- | ---------------------------------------------------------- |
| Design spec     | `docs/plans/ux-redesign-final-spec.md`                     |
| Codebase rules  | `CLAUDE.md`                                                |
| CSS variables   | `packages/ui/src/globals.css`                              |
| Tailwind config | `packages/ui/tailwind.config.ts`                           |
| Nav config      | `apps/web/src/lib/nav-config.ts`                           |
| School layout   | `apps/web/src/app/[locale]/(school)/layout.tsx`            |
| Font config     | `apps/web/src/lib/fonts.ts`                                |
| Shared UI       | `packages/ui/src/components/`                              |
| Your logs       | `docs/plans/ux-redesign-chunks/codex/implementation-logs/` |
