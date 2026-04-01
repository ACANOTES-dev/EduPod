# /audit2 — Health Recovery Plan Executor (ChatGPT 5.4)

**This skill is for OpenAI ChatGPT 5.4.** It executes specific dimensions of the Combined Health Recovery Plan for a multi-tenant school management SaaS.

**Your assigned dimensions:** Ops, Maintainability, Modularity, DX, Governance (104 items total)

**Critical context:** Claude Code (Opus 4.6) will review ALL your work before it is merged to main. Write code to the highest production standard. The reviewer is strict and knows this codebase intimately.

---

## Codebase Overview

- **Backend:** NestJS modular monolith — 56 modules, 170k LOC, `apps/api/`
- **Frontend:** Next.js 14+ App Router — 336 pages, 157k LOC, `apps/web/`
- **Worker:** BullMQ consumer service — 87 processors, 25k LOC, `apps/worker/`
- **Shared:** TypeScript packages — Zod schemas, constants, types — 22k LOC, `packages/shared/`
- **Database:** PostgreSQL 16 with Row-Level Security, 264 Prisma models, `packages/prisma/`
- **Total:** 412k LOC production TypeScript. Handles children's data. Multi-tenant.
- **Node:** >=24, pnpm 9.15.4, Turborepo

**You MUST read before writing any code:**

- `CLAUDE.md` (root) — master conventions
- All files in `.claude/rules/` — code quality, backend, frontend, testing, prisma, worker, architecture rules

**The recovery plan is at:**

```
Audit-Claude/health-recovery-plan-combined_2026-04-01_02-39-37.md
```

---

## Your Dimensions

You own these 5 dimensions. Execute them one at a time in this order:

### 1. Ops (25 items: OR-01 to OR-25)

CI/CD pipeline, deploy safety, rollback, backups, monitoring, env validation.
Key files: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `apps/api/src/main.ts`, `apps/worker/src/main.ts`, `apps/api/src/modules/health/`

### 2. Maintainability (24 items: MT-01 to MT-24)

i18n audit, service decomposition, error handling standardization, PR templates, developer docs.
Key files: Large service files (concern.service.ts, behaviour-students.service.ts, workload-compute.service.ts, report-cards.service.ts), frontend pages, `messages/`

### 3. Modularity (22 items: M-01 to M-22)

Module export reduction, boundary enforcement, public API barrels, facade patterns.
Key files: `*.module.ts` files, module barrel exports, ESLint config

### 4. DX (18 items: DX-01 to DX-18)

PM2 config, Dockerfiles, Makefile, build caching, local dev tooling.
Key files: `docker-compose.yml`, `package.json`, `scripts/`, `.vscode/`

### 5. Governance (15 items: OH-01 to OH-15)

Process documentation, health tracking, review cadences.
Key files: Documentation files only — no production code changes.

---

## Model Mapping

The plan's "Model" column uses Claude-specific names. Translate:

| Plan says  | Means                          | What you should do                                  |
| ---------- | ------------------------------ | --------------------------------------------------- |
| **Opus**   | Maximum reasoning needed       | Use your full GPT-5.4 capabilities, take extra care |
| **Sonnet** | Standard capability sufficient | Normal execution is fine                            |

---

## Parallelization

The plan's "Parallel" column tells you which items touch the same files:

- **Same parallel group code** (e.g., `OR-a1`, `OR-a1`) = these modify the same files. Do them sequentially.
- **Different parallel group codes** (e.g., `OR-a1`, `OR-a2`) = these touch different files. Safe to do simultaneously if you can run parallel tasks.

If you cannot run parallel sub-tasks, work through items sequentially — same-group items together, then move to the next group.

---

## The 10 Stages

**Execute every stage in order. No stage may be skipped.**

| #   | Stage                          | Runs               |
| --- | ------------------------------ | ------------------ |
| 1   | Setup Worktree                 | Once per dimension |
| 2   | Load Plan & Build Knowledge    | Once per dimension |
| 3   | Identify Groups & Prepare Work | Per phase          |
| 4   | Execute Implementation         | Per phase          |
| 5   | Initial Verification           | Per phase          |
| 6   | Spot-Check Changes             | Per phase          |
| 7   | Independent Review             | Per phase          |
| 8   | Remediate Review Findings      | Per phase          |
| 9   | Commit Phase                   | Per phase          |
| 10  | Final Report                   | Once per dimension |

Stages 3–9 repeat for each phase (A → B → C → D → E) within the current dimension.

---

## STAGE GATE PROTOCOL

**Between EVERY stage**, print:

```
╔══════════════════════════════════════════════╗
║  STAGE GATE                                  ║
║  Completed: Stage [N] — [name]               ║
║  Next:      Stage [N+1] — [name]             ║
║  Dimension: [current dimension]              ║
║  Phase:     [current phase] of [total]       ║
║  Items done: [count]                         ║
╚══════════════════════════════════════════════╝
```

Then re-read these instructions to confirm what comes next. Do NOT rely on memory.

---

## Stage 1 — Setup Worktree

```bash
mkdir -p .worktrees
grep -q ".worktrees" .gitignore 2>/dev/null || echo ".worktrees/" >> .gitignore
git worktree add .worktrees/audit-<dimension> main -b audit/<dimension>
cd .worktrees/audit-<dimension>
pnpm install --frozen-lockfile
cd packages/prisma && npx prisma generate && cd ../..
pnpm turbo run type-check
pnpm turbo run test
```

If baseline fails, STOP and report.

→ STAGE GATE → Stage 2

---

## Stage 2 — Load Plan & Build Knowledge

1. Read `Audit-Claude/health-recovery-plan-combined_2026-04-01_02-39-37.md`
2. Extract this dimension's items (IDs, actions, phases, parallel groups, model tier)
3. Read `CLAUDE.md` and ALL files in `.claude/rules/`
4. Read the source files that will be modified for this dimension
5. Build a knowledge summary of conventions, current state, and patterns

→ STAGE GATE → Stage 3

---

## Stage 3 — Identify Groups & Prepare Work (per phase)

1. List all parallel groups in this phase with their items
2. For each group, note which files will be modified and what conventions apply
3. If dispatching sub-tasks, prepare self-contained prompts for each group

→ STAGE GATE → Stage 4

---

## Stage 4 — Execute Implementation (per phase)

Implement all items in this phase:

- Same parallel group → sequential (same files)
- Different parallel groups → parallel if possible, sequential if not
- "Opus" items → maximum care. "Sonnet" items → standard execution.

→ STAGE GATE → Stage 5

---

## Stage 5 — Initial Verification (per phase)

```bash
pnpm turbo run type-check
pnpm turbo run lint
pnpm turbo run test
```

**ALL THREE MUST PASS.** Fix failures before proceeding.

→ STAGE GATE → Stage 6

---

## Stage 6 — Spot-Check Changes (per phase)

Read modified files and verify:

- Changes match plan descriptions
- No unintended modifications outside scope
- Import ordering: 3-block pattern (external → internal packages → relative)
- No `any` types or `@ts-ignore`
- No empty `catch {}` blocks
- Error handling uses `{ code, message }` pattern
- Naming: kebab-case files, PascalCase classes, camelCase variables
- RLS writes use `createRlsClient().$transaction()` (if applicable)
- Frontend uses logical CSS (`ms-`/`me-`/`start-`/`end-`, never `ml-`/`mr-`/`left-`/`right-`)

Fix issues, re-run Stage 5.

→ STAGE GATE → Stage 7

---

## Stage 7 — Independent Review (per phase)

Review your own work from a fresh perspective, as if you hadn't done the implementation. If you support isolated sub-tasks, dispatch a separate review task with NO implementation context.

**Review checklist:**

1. **Completeness** — Does each item fully address the plan's action description? Anything stubbed or TODO?
2. **Correctness** — Logic errors? Edge cases missed? Does the fix actually resolve the gap?
3. **Conventions** — All CLAUDE.md and .claude/rules/ conventions followed?
4. **Regression** — Run full test suite again. Any failures or regressions?
5. **Side effects** — Files modified outside scope? New unplanned dependencies?

Produce findings: MUST_FIX / SHOULD_FIX / SUGGESTION

→ STAGE GATE → Stage 8

---

## Stage 8 — Remediate Review Findings (per phase)

- No MUST_FIX → proceed to Stage 9
- MUST_FIX → fix all, re-run Stage 5, confirm clean
- SHOULD_FIX → fix if straightforward
- SUGGESTION → note only, stay in scope

→ STAGE GATE → Stage 9

---

## Stage 9 — Commit Phase (per phase)

```bash
git add -A
git commit -m "health(<dimension>): complete phase <X> — <summary>

Items completed: <IDs>
Reviewed: independent review passed"
```

**DO NOT PUSH.** The human will have Claude review and push manually.

If more phases → Stage 3. If all phases done → Stage 10.

→ STAGE GATE → Stage 3 or Stage 10

---

## Stage 10 — Final Report

```bash
pnpm turbo run lint && pnpm turbo run type-check && pnpm turbo run test
git log --oneline main..audit/<dimension>
git diff --stat main..audit/<dimension>
```

```
═══════════════════════════════════════════════
  AUDIT <dimension> — COMPLETE (ChatGPT 5.4)
═══════════════════════════════════════════════

Worktree:   .worktrees/audit-<dimension>
Branch:     audit/<dimension>

Phases completed: [list with commit hashes]
Total items: [N]
Files changed: [N]
Tests: PASS

⚠️  NOT PUSHED — awaiting Claude review then human approval.

After completing this dimension, move to the next one in order:
  Ops → Maintainability → Modularity → DX → Governance
═══════════════════════════════════════════════
```

---

## Rules

### DO

- Read CLAUDE.md and ALL rule files before writing any code
- Follow codebase conventions exactly — Claude will reject non-compliant code
- Re-read these instructions at every stage gate
- Run verification after every phase
- Commit after each phase

### DO NOT

- Push to remote (Claude reviews first, then human pushes)
- Skip any of the 10 stages
- Skip the independent review (Stage 7)
- Modify files outside the dimension's scope
- Add features or improvements not in the recovery plan
- Use `any`, `@ts-ignore`, empty `catch {}`, sequential `$transaction([...])`
- Use physical CSS (`ml-`, `mr-`, `left-`, `right-`) — use logical (`ms-`, `me-`, `start-`, `end-`)
- Dispatch Haiku-tier sub-agents (use GPT-5.4 or GPT-4.1 minimum)

### STOP AND ASK IF

- A change conflicts with another dimension's likely work
- A database migration affects production data
- 3+ failed attempts at the same fix
- A plan item seems outdated or inapplicable

---

Now: the human will tell you which dimension to start with. Read the plan, setup the worktree, and begin Stage 1.
