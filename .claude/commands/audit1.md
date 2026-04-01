# /audit — Health Recovery Plan Executor

You are the **orchestrator** for executing the Combined Health Recovery Plan. You are Opus 4.6 running at maximum effort. This is high-stakes work on a live production codebase serving schools with children's data. Precision matters. Every change must be correct, tested, and safe.

**This skill has exactly 10 stages. You MUST execute every stage in order. No stage may be skipped.**

---

## STAGE GATE PROTOCOL (READ THIS FIRST)

**Between EVERY stage transition**, you MUST:

1. Re-read this skill file (`.claude/commands/audit.md`) — do NOT rely on memory
2. Print the stage gate checkpoint:

```
╔══════════════════════════════════════════════╗
║  STAGE GATE                                  ║
║  Completed: Stage [N] — [name]               ║
║  Next:      Stage [N+1] — [name]             ║
║  Phase:     [current phase letter] of [total] ║
║  Items done so far: [count]                  ║
╚══════════════════════════════════════════════╝
```

3. Confirm you understand what the next stage requires before proceeding

**Why this exists:** Long orchestration sessions lose track of where they are. This protocol prevents skipped stages. If you ever find yourself unsure which stage you're in, STOP, re-read this file, and locate yourself.

**The 10 stages are:**

| #   | Stage                             | Runs      |
| --- | --------------------------------- | --------- |
| 1   | Setup Worktree                    | Once      |
| 2   | Load Plan & Build Knowledge Base  | Once      |
| 3   | Identify Groups & Prepare Prompts | Per phase |
| 4   | Dispatch Parallel Agents          | Per phase |
| 5   | Initial Verification              | Per phase |
| 6   | Spot-Check Changes                | Per phase |
| 7   | Independent Review                | Per phase |
| 8   | Remediate Review Findings         | Per phase |
| 9   | Commit Phase                      | Per phase |
| 10  | Final Report                      | Once      |

Stages 3–9 repeat for each phase (A → B → C → D → E). Stage 10 runs once after all phases complete.

---

## Input

The user provides a scorecard dimension:

```
/audit security
/audit reliability
/audit architecture
/audit modularity
/audit code-quality
/audit maintainability
/audit backend-tests
/audit worker-tests
/audit dx
/audit ops
/audit refactor-safety
/audit governance
```

Optional: `/audit security --phase B` to resume from a specific phase.

---

## Your Role: Knowledge-Accumulating Orchestrator

You are NOT a dumb dispatcher. You are the single source of truth for this dimension's recovery work. Before dispatching any sub-agent, you must:

1. **Read the plan** — understand every action item, its dependencies, and its evidence
2. **Investigate the codebase** — read the files that will be modified, understand current state
3. **Accumulate common knowledge** — architecture docs, conventions, patterns, danger zones
4. **Prepare rich prompts** — each sub-agent gets a tailored prompt containing ALL the context it needs

Sub-agents should NOT need to re-read CLAUDE.md, architecture docs, or the recovery plan. You give them what they need.

---

## Stage 1 — Setup Worktree

**CRITICAL: All work MUST happen in an isolated git worktree.**

This prevents conflicts when multiple `/audit` sessions run in parallel (e.g., `/audit security` and `/audit reliability` simultaneously).

1. Determine the dimension name from the user's input (e.g., `security`)
2. Create the worktree:

```bash
# Check for worktree directory
ls -d .worktrees 2>/dev/null || mkdir -p .worktrees
git check-ignore -q .worktrees 2>/dev/null || echo ".worktrees/" >> .gitignore

# Create worktree from main
git worktree add .worktrees/audit-<dimension> main -b audit/<dimension>
```

3. **Change your working directory** to the worktree:

```bash
cd .worktrees/audit-<dimension>
```

4. Install dependencies:

```bash
pnpm install --frozen-lockfile
cd packages/prisma && npx prisma generate && cd ../..
```

5. Verify clean baseline:

```bash
pnpm turbo run type-check
pnpm turbo run test -- --passWithNoTests 2>&1 | tail -5
```

If tests fail on the clean baseline, STOP and report to the user.

**All subsequent work happens inside this worktree directory. All sub-agents work in this directory.**

→ STAGE GATE → proceed to Stage 2

---

## Stage 2 — Load Plan & Build Knowledge Base

1. **Read the combined recovery plan:**

```
Audit-Claude/health-recovery-plan-combined_2026-04-01_02-39-37.md
```

2. **Extract this dimension's action items.** Parse the table for the requested dimension. Note for each item:
   - ID, action description, phase, parallel group, recommended model, severity

3. **Group items by phase** (A → B → C → D → E). Within each phase, group by parallel code.

4. **Read common reference files** (accumulate once, distribute to agents):
   - `CLAUDE.md` (conventions)
   - `.claude/rules/` — read ALL rule files
   - `architecture/danger-zones.md` (if relevant to this dimension)
   - `architecture/module-blast-radius.md` (if relevant)

5. **Read dimension-specific files.** Based on the dimension, read the files that will be modified:
   - Security → `apps/api/src/main.ts`, `apps/api/src/common/middleware/rls.middleware.ts`, `apps/api/src/common/guards/auth.guard.ts`, `packages/prisma/rls/policies.sql`, relevant migration files
   - Reliability → `apps/worker/src/base/tenant-aware-job.ts`, `apps/worker/src/cron/cron-scheduler.service.ts`, `apps/api/src/modules/health/health.service.ts`, relevant processor files
   - Architecture → `apps/api/src/app.module.ts`, relevant module files
   - Backend Tests → `apps/api/jest.config.js`, relevant service files that need specs
   - Worker Tests → `apps/worker/jest.config.ts`, relevant processor source files
   - Ops → `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `apps/api/src/main.ts`, `apps/worker/src/main.ts`
   - (and so on for other dimensions)

6. **Build the fact pack** — compile a concise knowledge document containing:
   - Current state of files that will be modified
   - Relevant conventions from CLAUDE.md and rules
   - Relevant danger zones
   - Key patterns to follow (e.g., how existing tests are structured, how existing services are organized)

7. **Print the phase plan:**

```
Dimension: [name]
Total items: [N]

Phase A: [N] items in [N] parallel groups
Phase B: [N] items in [N] parallel groups
Phase C: [N] items in [N] parallel groups
Phase D: [N] items in [N] parallel groups
Phase E: [N] items in [N] parallel groups

Starting with Phase [X]...
```

→ STAGE GATE → proceed to Stage 3 for first phase

---

## Stage 3 — Identify Groups & Prepare Prompts (per phase)

**Re-read this skill file before starting this stage.**

For the current phase:

### 3a. Identify parallel groups

List every parallel group in this phase with its items:

```
Phase [X] — [N] items in [N] parallel groups:
  Group [code]: [item IDs] → [model] — [brief description]
  Group [code]: [item IDs] → [model] — [brief description]
  ...
```

### 3b. Prepare per-agent prompts

For each parallel group, write a **detailed, self-contained prompt** that includes:

1. **Mission statement** — what the agent must accomplish
2. **Specific action items** with full descriptions from the plan
3. **File paths** to read and modify
4. **Current file contents** (or key excerpts) so the agent doesn't need to re-read
5. **Conventions to follow** — extracted from CLAUDE.md and rules (import ordering, naming, error handling, RLS patterns, etc.)
6. **Verification criteria** — how to confirm the work is correct (run lint, type-check, specific tests)
7. **What NOT to do** — don't modify files outside scope, don't add features, don't skip tests

**Template for sub-agent prompt:**

```
You are working on health recovery item(s) [IDs] for the [dimension] dimension.
Working directory: [worktree path]

## What You Must Do
[Specific, detailed description of each action item]

## Files to Modify
[Exact file paths, with current state excerpts if helpful]

## Conventions (MUST follow)
[Extracted from CLAUDE.md, rules/, relevant to this work]

## Verification
After making changes:
1. Run: pnpm turbo run type-check
2. Run: pnpm turbo run lint
3. Run: [specific test commands]
4. Confirm: [specific verification criteria]

## Constraints
- Work ONLY in the worktree directory: [path]
- Do NOT modify files outside your scope
- Do NOT commit — the orchestrator handles commits
- Do NOT push to remote
```

→ STAGE GATE → proceed to Stage 4

---

## Stage 4 — Dispatch Parallel Agents (per phase)

**Re-read this skill file before starting this stage.**

Dispatch one agent per parallel group, **all in a single message** (parallel dispatch):

- **Model**: Use the model recommended in the plan's Model column (Opus or Sonnet)
- Items within the same parallel group go to ONE agent (it handles them sequentially)
- Each agent gets the rich prompt prepared in Stage 3

Wait for ALL agents to return before proceeding.

→ STAGE GATE → proceed to Stage 5

---

## Stage 5 — Initial Verification (per phase)

**Re-read this skill file before starting this stage.**

After ALL agents in the phase return:

1. **Run type-check and lint** on the full worktree:

```bash
pnpm turbo run type-check
pnpm turbo run lint
```

2. **Run tests** — full suite:

```bash
pnpm turbo run test
```

3. **If type-check, lint, or tests fail:**
   - Identify what's wrong
   - Fix it yourself or dispatch a targeted fix agent
   - Re-run until all three pass
   - Do NOT proceed until green

4. **If all pass:** proceed.

→ STAGE GATE → proceed to Stage 6

---

## Stage 6 — Spot-Check Changes (per phase)

**Re-read this skill file before starting this stage.**

Read the modified files and verify:

- Changes match the action item descriptions
- No unintended modifications
- Conventions are followed (import order, naming, error handling)
- No `any` types introduced
- No empty catch blocks introduced
- RLS patterns are correct (if applicable)
- No files outside this dimension's scope were modified

If you find issues, fix them yourself and re-run Stage 5 verification.

→ STAGE GATE → proceed to Stage 7

---

## Stage 7 — Independent Review (per phase)

**Re-read this skill file before starting this stage.**

**This is critical.** Dispatch a FRESH Opus 4.6 sub-agent whose sole job is to independently review the work done in this phase. This agent has NO context from the implementation — it approaches the code with fresh eyes.

Dispatch with this prompt structure:

````
You are an independent code reviewer for the [dimension] health recovery plan.
You have NOT seen the implementation work. Your job is adversarial: find what's wrong.
Working directory: [worktree path]

## Context
We are executing health recovery items for the [dimension] dimension of a multi-tenant
school management SaaS (NestJS + Next.js + BullMQ, 412k LOC, children's data).

## Items That Were Just Implemented
[List each item ID with its full action description from the plan]

## Your Review Checklist

### 1. Completeness — Were the gaps actually resolved?
For each item, verify:
- Does the implementation match what the plan described?
- Is anything half-done, stubbed out, or marked TODO?
- Are there edge cases the implementation missed?

### 2. Correctness — Is the implementation right?
- Does the code actually do what it claims?
- Are there logic errors, off-by-one errors, race conditions?
- For security items: does the fix actually close the vulnerability?
- For test items: do the tests actually test what matters, or are they superficial?
- For reliability items: does the change actually improve reliability?

### 3. Convention compliance
- Import ordering (3-block pattern, alphabetical within groups)
- Naming conventions (kebab-case files, PascalCase classes, camelCase vars)
- Error handling (no empty catches, structured error codes)
- RLS patterns (tenant_id, createRlsClient, interactive transactions only)
- TypeScript strict (no any, no @ts-ignore)

### 4. Regression risk
Run the FULL test suite and report results:
```bash
pnpm turbo run type-check
pnpm turbo run lint
pnpm turbo run test
````

Report any failures, warnings, or regressions.

### 5. Unintended side effects

- Were any files modified that shouldn't have been?
- Could these changes break anything in other dimensions?
- Are there any new dependencies or imports that weren't planned?

## Output Format

Return your findings as:

### PASS items (no issues)

[List items that are correctly implemented]

### FINDINGS (issues to fix)

For each issue:

- Item ID affected
- Severity: MUST_FIX / SHOULD_FIX / SUGGESTION
- File and line
- What's wrong
- How to fix it

### Regression Test Results

[Full output of type-check, lint, test]

````

→ STAGE GATE → proceed to Stage 8

---

## Stage 8 — Remediate Review Findings (per phase)

**Re-read this skill file before starting this stage.**

Process the independent reviewer's findings:

### If no MUST_FIX or SHOULD_FIX findings:
Print `✅ Independent review passed — no issues found.` and proceed to Stage 9.

### If MUST_FIX findings exist:
1. **Fix them yourself** if they are small/isolated (1-3 items, single-file fixes)
2. **Dispatch targeted fix agents** if there are many findings or complex fixes
   - Each fix agent gets: the finding, the file, what's wrong, how to fix, conventions
3. **Re-run Stage 5 verification** (type-check, lint, tests) after all fixes
4. **If fixes introduced new issues**, iterate until clean
5. Do NOT proceed until all MUST_FIX findings are resolved

### If only SHOULD_FIX or SUGGESTION findings remain:
- SHOULD_FIX: fix them if straightforward, otherwise note for future
- SUGGESTION: note but do not action — stay in scope

→ STAGE GATE → proceed to Stage 9

---

## Stage 9 — Commit Phase (per phase)

**Re-read this skill file before starting this stage.**

### 9a. Commit the phase

```bash
git add -A
git commit -m "$(cat <<'EOF'
health(DIMENSION): complete phase X — [1-line summary]

Items completed: [list all IDs]
Reviewer: independent Opus 4.6 review passed

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
````

**DO NOT push.** Commits stay local in the worktree branch until the user explicitly authorizes.

### 9b. Print phase summary

```
Phase [X] complete: [N] items implemented, reviewed, committed.
Commit: [short hash]
```

### 9c. Determine next phase

- If more phases remain → go back to Stage 3 for the next phase
- If all phases are done → proceed to Stage 10

→ STAGE GATE → proceed to Stage 3 (next phase) or Stage 10 (final)

---

## Stage 10 — Final Report

**Re-read this skill file before starting this stage.**

After all phases for this dimension are complete:

1. **Run full verification one final time:**

```bash
pnpm turbo run lint
pnpm turbo run type-check
pnpm turbo run test
```

2. **Generate change summary:**

```bash
git log --oneline main..audit/<dimension>
git diff --stat main..audit/<dimension>
```

3. **Print the final report:**

```
═══════════════════════════════════════════════
  /audit <dimension> — COMPLETE
═══════════════════════════════════════════════

Worktree:   .worktrees/audit-<dimension>
Branch:     audit/<dimension>
Base:       main @ <commit-hash>

Phases completed:
  Phase A: [N] items ✓  (commit: [hash])
  Phase B: [N] items ✓  (commit: [hash])
  Phase C: [N] items ✓  (commit: [hash])
  Phase D: [N] items ✓  (commit: [hash])
  Phase E: [N] items ✓  (commit: [hash])

Total items: [N] completed
Files changed: [N]
Lines added: [N]
Lines removed: [N]

Independent reviews: [N] phases reviewed, [N] findings resolved

Verification:
  Lint:       PASS (0 errors)
  Type-check: PASS
  Tests:      PASS ([N] suites, [N] tests)

Commits: [N] commits on audit/<dimension>

⚠️  NOT PUSHED — awaiting your permission.
    To push:  cd .worktrees/audit-<dimension> && git push -u origin audit/<dimension>
    To merge: git checkout main && git merge audit/<dimension>
    To clean: git worktree remove .worktrees/audit-<dimension>
═══════════════════════════════════════════════
```

---

## Rules

### DO

- Re-read this skill file at every stage gate — this is mandatory, not optional
- Read everything before dispatching anything
- Give sub-agents complete, self-contained prompts
- Verify every phase before moving on
- Run the independent reviewer after every phase
- Fix all MUST_FIX findings before committing
- Commit after each phase with descriptive messages
- Report progress at phase boundaries
- Use the recommended model (Opus/Sonnet) from the plan

### DO NOT

- Push to remote without explicit user permission
- Deploy to production
- Skip ANY stage — all 10 stages exist for a reason
- Skip the independent review (Stage 7) — this is not optional
- Skip the stage gate protocol — re-read the skill between stages
- Let sub-agents re-read architecture docs you already have
- Proceed past a failing phase
- Modify files outside the dimension's scope
- Make changes not in the recovery plan (no "while I'm here" improvements)

### STOP AND ASK IF

- A planned change conflicts with another dimension's likely changes
- A change requires a database migration that could affect production data
- Verification fails and you can't determine the fix
- You discover the plan's action item is outdated or no longer applicable
- 3+ failed attempts at the same fix

---

## Known Constraints

### Worktree isolation

Each `/audit <dimension>` session works in `.worktrees/audit-<dimension>` on branch `audit/<dimension>`. Multiple dimensions can run in parallel without conflicts because they're in separate worktrees. The user will merge branches to main after review.

### Cross-dimension file conflicts

Some files may be modified by multiple dimensions (e.g., `main.ts`, `app.module.ts`, `package.json`). This is expected. The user will resolve merge conflicts when combining branches. Your job is to make your dimension's changes clean and correct in isolation.

### Sub-agent model selection

The recovery plan specifies `Opus` or `Sonnet` per item. Follow these recommendations:

- **Opus**: Security-critical, cross-module refactoring, complex state machines, integration tests, architectural decisions
- **Sonnet**: Test writing (following patterns), config changes, ESLint rules, documentation, migrations, single-file changes
- The independent reviewer (Stage 7) is ALWAYS Opus 4.6

### No Haiku

Never dispatch Haiku sub-agents. Sonnet 4.6 minimum per CLAUDE.md rules.

---

## Self-Diagnostic

If at any point you feel lost, confused about which stage you're in, or unsure what to do next:

1. STOP all work
2. Re-read this entire skill file
3. Run `git log --oneline -5` to see what you've committed
4. Run `git diff --stat` to see what's uncommitted
5. Determine which stage and phase you're in
6. Resume from the correct stage gate

---

Now parse the dimension from the user's input, print the stage gate for Stage 1, and begin.
