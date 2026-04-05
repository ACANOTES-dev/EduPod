# UX Redesign — Launch Guide

## Step 1: Create Worktrees

Run from the repo root (`~/Desktop/SDB/`):

```bash
git worktree add ../SDB-claude-redesign -b redesign/claude
git worktree add ../SDB-gemini-redesign -b redesign/gemini
git worktree add ../SDB-codex-redesign -b redesign/codex
```

This creates:

```
~/Desktop/
├── SDB/                    ← main repo (untouched)
├── SDB-claude-redesign/    ← Claude works here (port 3001)
├── SDB-gemini-redesign/    ← Gemini works here (port 3002)
└── SDB-codex-redesign/     ← Codex works here  (port 3003)
```

## Step 2: Install Dependencies

Each worktree needs its own node_modules:

```bash
cd ~/Desktop/SDB-claude-redesign && pnpm install
cd ~/Desktop/SDB-gemini-redesign && pnpm install
cd ~/Desktop/SDB-codex-redesign && pnpm install
```

## Step 3: Launch Each Model

### Claude Code

```bash
cd ~/Desktop/SDB-claude-redesign
claude
```

Then say:

> Read `docs/plans/ux-redesign-chunks/claude/INSTRUCTIONS.md` and execute every chunk sequentially. Start with chunk 01.

### Gemini CLI

```bash
cd ~/Desktop/SDB-gemini-redesign
gemini
```

Then say:

> Read `docs/plans/ux-redesign-chunks/gemini/INSTRUCTIONS.md` and execute every chunk sequentially. Start with chunk 01.

### Codex

```bash
cd ~/Desktop/SDB-codex-redesign
codex
```

Then say:

> Read `docs/plans/ux-redesign-chunks/codex/INSTRUCTIONS.md` and execute every chunk sequentially. Start with chunk 01.

## Step 4: Visual Comparison

Run all three dev servers simultaneously:

```bash
# Terminal 1
cd ~/Desktop/SDB-claude-redesign/apps/web && pnpm dev --port 3001

# Terminal 2
cd ~/Desktop/SDB-gemini-redesign/apps/web && pnpm dev --port 3002

# Terminal 3
cd ~/Desktop/SDB-codex-redesign/apps/web && pnpm dev --port 3003
```

All three use the same backend. Point them at your local API or staging:

- http://localhost:3001 — Claude's version
- http://localhost:3002 — Gemini's version
- http://localhost:3003 — Codex's version

### What to Compare

| Criterion             | What to look for                       |
| --------------------- | -------------------------------------- |
| Morph bar feel        | Cinematic dark bar vs generic navbar   |
| Warm Stone palette    | Genuinely warm vs just brown           |
| Dark mode             | Warm and sophisticated vs muddy        |
| Sub-strip transitions | Smooth 200ms slide vs janky/missing    |
| RTL layout            | Intentional mirror vs broken alignment |
| Mobile nav            | Clean overlay vs cramped/broken        |
| Hub filtering         | Teacher/parent see correct hubs        |
| Typography            | Figtree rendering, weight consistency  |
| Buttons               | Pill shape everywhere, consistent      |
| Overall polish        | "Someone cared" vs "AI generated this" |

## Step 5: Pick a Winner

Review each model's implementation logs:

```
docs/plans/ux-redesign-chunks/claude/implementation-logs/
docs/plans/ux-redesign-chunks/gemini/implementation-logs/
docs/plans/ux-redesign-chunks/codex/implementation-logs/
```

Check for:

- How many chunks completed vs blocked
- How many deviations from spec
- How many known issues logged

## Step 6: Merge Winner

```bash
cd ~/Desktop/SDB

# Merge the winning branch
git merge redesign/claude   # or redesign/gemini or redesign/codex

# Clean up ALL worktrees
git worktree remove ../SDB-claude-redesign
git worktree remove ../SDB-gemini-redesign
git worktree remove ../SDB-codex-redesign

# Delete losing branches
git branch -D redesign/gemini redesign/codex
# (keep the winning branch — it's now merged into main)
```

## Step 7: Cherry-Pick (Optional)

If one model did chunks 1-4 best and another did 6-10 best, you can cherry-pick:

```bash
# From main, cherry-pick specific commits from each branch
git cherry-pick <commit-hash-from-gemini-chunk-06>
git cherry-pick <commit-hash-from-claude-chunk-08>
```

This works because each chunk is a separate commit.

## Notes

- All three models can run simultaneously — different branches, different directories
- None will push to remote — all work is local
- The backend (apps/api) is NOT modified by any model
- If a model gets stuck on a chunk, check its implementation log for the "Blocked" status and known issues
