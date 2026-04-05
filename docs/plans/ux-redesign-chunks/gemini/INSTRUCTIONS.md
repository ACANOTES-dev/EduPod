# UX Redesign — Gemini CLI Instructions

## Your Role

You are executing the EduPod UX redesign in an isolated git worktree. You will work through 10 implementation chunks sequentially, documenting your progress in implementation logs after each chunk.

## Setup (Run Once)

The user has already created this worktree for you:

```bash
git worktree add ../SDB-gemini-redesign -b redesign/gemini
```

You are working in: `~/Desktop/SDB-gemini-redesign/`

Verify you're in the right place:

```bash
git branch --show-current  # Should show: redesign/gemini
```

Start the dev server on port 3002:

```bash
cd apps/web && pnpm dev --port 3002
```

## What You're Building

A complete frontend UX redesign based on a detailed spec. Read the full spec before starting ANY chunk:

**Design spec:** `docs/plans/ux-redesign-final-spec.md`

Key changes:

- Sidebar (260px, always visible) → Morph Bar (56px dark top bar with 7 hub pills)
- Cool grey/stone palette → "Warm Stone" (warm brown undertones, `#FAF9F7` light bg, `#1A1816` dark bg)
- Plus Jakarta Sans → Figtree font
- Static stat dashboard → Feed-driven two-column home page (priority feed + context panel)
- All buttons → pill shaped (border-radius: 9999px)
- All cards → 16px radius, warm surface colours
- Full CSS variable token system — no hardcoded hex in components

## Critical Codebase Rules

Read `CLAUDE.md` at the repo root before writing any code. Key rules:

1. **RTL-safe styling — ZERO TOLERANCE.** Never use `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l-`, `rounded-r-`, `border-l-`, `border-r-`. Always use `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `text-end`, `rounded-s-`, `rounded-e-`, `border-s-`, `border-e-`.
2. **No hardcoded colour hex values in components.** All colours via CSS variables: `var(--color-background)`, `var(--color-text-primary)`, etc.
3. **Component library is `@school/ui` (in `packages/ui/`).** Shared components go there. Page-specific components go in `_components/` directories.
4. **Data fetching:** Use `apiClient<T>()` from `@/lib/api-client` with `useEffect`. Do NOT use server-component data fetching.
5. **Client components:** `'use client'` directive. React hooks via namespace: `React.useState`, `React.useCallback`.
6. **Icons:** `lucide-react` only.
7. **Styling:** Tailwind CSS only. No inline styles. No CSS modules.
8. **Import ordering:** External packages → `@school/*` → relative imports, with blank lines between groups.

## Execution Sequence

Work through these chunks IN ORDER:

| Order | Chunk File                                               | What It Does                                      |
| ----- | -------------------------------------------------------- | ------------------------------------------------- |
| 1     | `docs/plans/ux-redesign-chunks/01-design-tokens.md`      | Replace CSS variables with Warm Stone palette     |
| 2     | `docs/plans/ux-redesign-chunks/02-font-swap.md`          | Plus Jakarta Sans → Figtree                       |
| 3     | `docs/plans/ux-redesign-chunks/03-morph-bar.md`          | Build the dark top navigation bar, remove sidebar |
| 4     | `docs/plans/ux-redesign-chunks/04-sub-strip.md`          | Build the contextual module tab strip             |
| 5     | `docs/plans/ux-redesign-chunks/05-module-pages.md`       | Update shared components for full-width layout    |
| 6     | `docs/plans/ux-redesign-chunks/06-home-page.md`          | Build the feed-driven dashboard                   |
| 7     | `docs/plans/ux-redesign-chunks/07-command-palette.md`    | Restyle ⌘K to dark theme                          |
| 8     | `docs/plans/ux-redesign-chunks/08-mobile-responsive.md`  | Mobile nav overlay + responsive fixes             |
| 9     | `docs/plans/ux-redesign-chunks/09-role-home-variants.md` | Teacher/Parent/Accounting/Front Office homes      |
| 10    | `docs/plans/ux-redesign-chunks/10-polish-pass.md`        | Transitions, skeletons, empty states              |

For each chunk:

1. Read the chunk file thoroughly
2. Read the referenced sections of the design spec
3. Implement the changes
4. Run through the verification checklist
5. Write an implementation log (see format below)
6. Commit: `feat(redesign): chunk XX — description`

## Implementation Logs

After completing each chunk, write a log to:

```
docs/plans/ux-redesign-chunks/gemini/implementation-logs/chunk-XX.md
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

1. **Do NOT push to remote.** Work locally on `redesign/gemini` branch.
2. **Do NOT modify backend code** (apps/api/, apps/worker/, packages/prisma/).
3. **Preserve all existing functionality.** Visual redesign only.
4. **Test in both LTR and RTL** after each chunk.
5. **Test in both light and dark mode** after each chunk.
6. **Commit after each chunk.** One commit per chunk.

## Key File Paths

| Resource        | Path                                                        |
| --------------- | ----------------------------------------------------------- |
| Design spec     | `docs/plans/ux-redesign-final-spec.md`                      |
| CSS variables   | `packages/ui/src/globals.css`                               |
| Tailwind config | `packages/ui/tailwind.config.ts`                            |
| Nav config      | `apps/web/src/lib/nav-config.ts`                            |
| School layout   | `apps/web/src/app/[locale]/(school)/layout.tsx`             |
| Font config     | `apps/web/src/lib/fonts.ts`                                 |
| Shared UI       | `packages/ui/src/components/`                               |
| App shell       | `packages/ui/src/components/app-shell/`                     |
| Your logs       | `docs/plans/ux-redesign-chunks/gemini/implementation-logs/` |
