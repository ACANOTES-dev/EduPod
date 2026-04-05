# UX Redesign — Claude Code Instructions

## Your Role

You are executing the EduPod UX redesign in an isolated git worktree. You will work through 10 implementation chunks sequentially, documenting your progress in implementation logs after each chunk.

## Setup (Run Once)

The user has already created this worktree for you:

```bash
git worktree add ../SDB-claude-redesign -b redesign/claude
```

You are working in: `~/Desktop/SDB-claude-redesign/`

Verify you're in the right place:

```bash
git branch --show-current  # Should show: redesign/claude
```

Start the dev server on port 3001:

```bash
cd apps/web && pnpm dev --port 3001
```

## What You're Building

A complete frontend UX redesign based on a detailed spec. The spec replaces:

- The 260px sidebar → with a dark "Morph Bar" top navigation (7 hub pills)
- Cool grey palette → with "Warm Stone" (warm brown undertones, cream light mode, warm dark mode)
- Plus Jakarta Sans → with Figtree
- Static dashboard → with a feed-driven, role-specific home page
- All component styling → updated to pill buttons, 16px radius cards, new token system

## Execution Sequence

Work through these chunks IN ORDER. Each depends on the previous:

1. **Read the design spec first:** `docs/plans/ux-redesign-final-spec.md` (the source of truth)
2. **Read the chunk file** from `docs/plans/ux-redesign-chunks/`
3. **Execute the chunk** — modify/create files as specified
4. **Verify** — run through the verification checklist in the chunk
5. **Write the implementation log** (see below)
6. **Commit** with message: `feat(redesign): chunk XX — description`
7. **Move to the next chunk**

| Order | Chunk File                 | Description                                   |
| ----- | -------------------------- | --------------------------------------------- |
| 1     | `01-design-tokens.md`      | Replace CSS variables with Warm Stone palette |
| 2     | `02-font-swap.md`          | Plus Jakarta Sans → Figtree                   |
| 3     | `03-morph-bar.md`          | Build the dark top navigation bar             |
| 4     | `04-sub-strip.md`          | Build the contextual module tab strip         |
| 5     | `05-module-pages.md`       | Update all pages for full-width layout        |
| 6     | `06-home-page.md`          | Build the feed-driven dashboard               |
| 7     | `07-command-palette.md`    | Restyle ⌘K to dark theme                      |
| 8     | `08-mobile-responsive.md`  | Mobile nav overlay + responsive fixes         |
| 9     | `09-role-home-variants.md` | Teacher/Parent/Accounting/Front Office homes  |
| 10    | `10-polish-pass.md`        | Transitions, skeletons, empty states          |

## Implementation Logs

After completing each chunk, write a log file to:

```
docs/plans/ux-redesign-chunks/claude/implementation-logs/chunk-XX.md
```

Each log MUST contain:

```markdown
# Chunk XX — [Name]

**Status:** Complete / Partial / Blocked
**Date:** YYYY-MM-DD
**Commit:** [commit hash]

## Files Created

- `path/to/new/file.tsx` — description

## Files Modified

- `path/to/modified/file.tsx` — what changed and why

## Decisions Made

- Any implementation decisions not covered by the spec (e.g., animation library choice, component API design)

## Deviations from Spec

- Anything you couldn't implement exactly as specified, and why

## Verification Results

- [ ] Check 1 — pass/fail + notes
- [ ] Check 2 — pass/fail + notes
- ...

## Known Issues

- Any bugs, visual imperfections, or TODOs for later chunks

## Screenshots

- If possible, describe what the result looks like (or note where to look in the running app)
```

## Rules

1. **Read CLAUDE.md** before writing any code — it has strict rules about RTL, imports, components.
2. **No hardcoded colour hex values in components.** Everything via CSS variables.
3. **Logical CSS properties only.** `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`. Never `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`.
4. **Preserve all existing functionality.** This is a visual redesign, not a feature change.
5. **`@school/ui` is the component library.** Shared components go there. Page-specific components go in `_components/`.
6. **Do NOT push to remote.** Work locally on the `redesign/claude` branch only.
7. **Do NOT modify backend code** (apps/api/, apps/worker/, packages/prisma/).
8. **Commit after each chunk.** One commit per chunk, conventional commit format.

## If You Get Stuck

- Re-read the chunk file — it has specific file paths and code patterns.
- Re-read the design spec — section numbers are referenced in each chunk.
- Check the existing code patterns in the codebase — match them, don't invent new ones.
- If a chunk requires backend data that doesn't exist, use placeholder/mock data and note it in the implementation log.

## Quick Reference

| Resource             | Path                                                        |
| -------------------- | ----------------------------------------------------------- |
| Design spec          | `docs/plans/ux-redesign-final-spec.md`                      |
| Vision doc           | `docs/roadmap/Phase-2/ux-redesign-vision.md`                |
| Current design brief | `docs/plans/ui-design-brief.md`                             |
| Chunk files          | `docs/plans/ux-redesign-chunks/01-*.md` through `10-*.md`   |
| Your logs            | `docs/plans/ux-redesign-chunks/claude/implementation-logs/` |
| CSS variables        | `packages/ui/src/globals.css`                               |
| Tailwind config      | `packages/ui/tailwind.config.ts`                            |
| Nav config           | `apps/web/src/lib/nav-config.ts`                            |
| School layout        | `apps/web/src/app/[locale]/(school)/layout.tsx`             |
| Font config          | `apps/web/src/lib/fonts.ts`                                 |
| Shared UI components | `packages/ui/src/components/`                               |
