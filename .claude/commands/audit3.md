# /audit3 — Health Recovery Plan Executor (Gemini 3.1 Pro)

**This skill is for Google Gemini 3.1 Pro.** It executes specific dimensions of the Combined Health Recovery Plan for a multi-tenant school management SaaS.

**Your assigned dimensions:** Backend Tests, Worker Tests, Code Quality, Refactor Safety (89 items total)

**Critical context:** Claude Code (Opus 4.6) will review ALL your work before it is merged to main. Write code to the highest production standard. The reviewer is strict and knows this codebase intimately.

**Your advantage:** You have a 1M token context window. Use it. Read the full recovery plan, CLAUDE.md, all rule files, AND the source files simultaneously. Don't summarize — hold the full context.

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
- `.claude/rules/testing.md` — especially important for your test-writing dimensions

**The recovery plan is at:**

```
Audit-Claude/health-recovery-plan-combined_2026-04-01_02-39-37.md
```

---

## Your Dimensions

You own these 4 dimensions. Execute them one at a time in this order:

### 1. Backend Tests (21 items: BT-01 to BT-21)

Jest coverage configuration, writing service specs, RLS integration tests, permission tests, error code assertions.

**Key pattern to follow:** Read existing spec files to understand the established test patterns:

- `apps/api/src/modules/behaviour/behaviour-sanctions.service.spec.ts` — exemplary spec
- `apps/api/src/modules/auth/auth.service.spec.ts` — deep auth testing
- `apps/api/src/modules/finance/invoices.service.spec.ts` — state machine testing

Every spec MUST follow:

- NestJS `Test.createTestingModule` setup
- Typed mock factories: `buildMockPrisma()`, `buildMockRedis()`
- `afterEach(() => jest.clearAllMocks())`
- Fixture constants at module scope: `TENANT_ID`, `STUDENT_ID`, etc.
- `jest.mock('../../common/middleware/rls.middleware')` for write-path tests
- `describe` blocks per method: `'ClassName — methodName'`

### 2. Worker Tests (23 items: WT-01 to WT-23)

Writing processor specs, coverage measurement, tenant isolation tests, retry/failure tests.

**Key pattern to follow:** Read existing worker specs:

- `apps/worker/src/base/tenant-aware-job.spec.ts` — base class testing
- `apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts` — processor pattern
- `apps/worker/src/processors/behaviour/suspension-return.processor.spec.ts` — simpler example

Every processor spec MUST test:

- Job routing guard: `if (job.name !== MY_JOB) return;`
- Tenant_id rejection: job without tenant_id throws or returns early
- Happy path with mocked Prisma
- At least one error/edge case

### 3. Code Quality (23 items: CQ-01 to CQ-23)

ESLint rules, `as any` elimination, react-hook-form migration, i18n fixes, logger standardization.

Key files: `packages/eslint-config/`, `apps/api/src/` (for `as any` fixes), frontend pages (for i18n and form migration)

### 4. Refactor Safety (22 items: RS-01 to RS-22)

Coverage thresholds, mutation testing, contract tests, schema validation, integration tests for cross-module flows.

Key files: `apps/api/jest.config.js`, `apps/worker/jest.config.ts`, CI workflow, test infrastructure

---

## Model Mapping

The plan's "Model" column uses Claude-specific names. Translate:

| Plan says  | Means                          | What you should do                                |
| ---------- | ------------------------------ | ------------------------------------------------- |
| **Opus**   | Maximum reasoning needed       | Use Gemini 3.1 Pro at full capability, extra care |
| **Sonnet** | Standard capability sufficient | Normal execution, don't overthink                 |

---

## Parallelization

The plan's "Parallel" column tells you which items touch the same files:

- **Same parallel group code** = modify same files → do sequentially
- **Different parallel group codes** = different files → safe to parallelize

**Your context window advantage:** For test-writing dimensions, you can hold the source file + existing spec pattern + conventions + plan description ALL in context simultaneously. Use this to produce specs that are perfectly convention-compliant on the first pass.

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
4. **For test-writing dimensions (Backend Tests, Worker Tests):** read 2-3 existing exemplary spec files to internalize the test patterns
5. Read the source files that need specs or modifications
6. Build a knowledge summary — hold all of this in your context window

→ STAGE GATE → Stage 3

---

## Stage 3 — Identify Groups & Prepare Work (per phase)

1. List all parallel groups in this phase with their items
2. Note which files will be created/modified per group
3. For test writing: identify the source file, read it fully, note the methods to test

→ STAGE GATE → Stage 4

---

## Stage 4 — Execute Implementation (per phase)

Implement all items in this phase:

- Same parallel group → sequential
- Different groups → parallel if possible
- "Opus" items → maximum care. "Sonnet" items → standard.

**Test writing guidance (Backend Tests & Worker Tests):**

- Read the SOURCE file first. Understand what every method does.
- Read an EXISTING SPEC in the same module or a similar module for the pattern.
- Write the spec following the exact same structure and patterns.
- Test MEANINGFUL behavior: state transitions, error paths, edge cases, permission denials.
- Do NOT write superficial "it should be defined" tests. Every `it()` block must assert real behavior.
- Include at least one test per public method: happy path + error path.
- For state machines: test ALL valid transitions AND ALL blocked transitions.

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

Read modified/created files and verify:

- Changes match plan descriptions
- No unintended modifications outside scope
- Import ordering: 3-block pattern (external → internal packages → relative)
- No `any` types or `@ts-ignore`
- No empty `catch {}` blocks
- Test assertions are meaningful (not just `toBeDefined()`)
- Naming: kebab-case files, PascalCase classes, camelCase variables
- Test files are co-located with source: `service.spec.ts` next to `service.ts`

Fix issues, re-run Stage 5.

→ STAGE GATE → Stage 7

---

## Stage 7 — Independent Review (per phase)

Review your work from a fresh perspective. Check:

1. **Completeness** — Does each item fully address the plan? Anything half-done?
2. **Correctness** — Do tests actually test what matters? Are ESLint rules correct?
3. **Conventions** — All CLAUDE.md and .claude/rules/ conventions followed?
4. **Regression** — Run full test suite. Any failures?
5. **Test quality** — Are assertions meaningful or superficial? Do error tests check error CODES, not just exception classes?
6. **Side effects** — Files modified outside scope? New unplanned dependencies?

Produce findings: MUST_FIX / SHOULD_FIX / SUGGESTION

→ STAGE GATE → Stage 8

---

## Stage 8 — Remediate Review Findings (per phase)

- No MUST_FIX → proceed to Stage 9
- MUST_FIX → fix all, re-run Stage 5, confirm clean
- SHOULD_FIX → fix if straightforward
- SUGGESTION → note only

→ STAGE GATE → Stage 9

---

## Stage 9 — Commit Phase (per phase)

```bash
git add -A
git commit -m "health(<dimension>): complete phase <X> — <summary>

Items completed: <IDs>
Reviewed: independent review passed"
```

**DO NOT PUSH.** Claude will review first, then the human pushes.

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
  AUDIT <dimension> — COMPLETE (Gemini 3.1 Pro)
═══════════════════════════════════════════════

Worktree:   .worktrees/audit-<dimension>
Branch:     audit/<dimension>

Phases completed: [list with commit hashes]
Total items: [N]
Files changed: [N]
Tests: PASS

⚠️  NOT PUSHED — awaiting Claude review then human approval.

After completing this dimension, move to the next one in order:
  Backend Tests → Worker Tests → Code Quality → Refactor Safety
═══════════════════════════════════════════════
```

---

## Rules

### DO

- Read CLAUDE.md and ALL rule files before writing any code
- Read existing spec files to learn the test patterns before writing new specs
- Use your 1M context window — hold source + pattern + conventions simultaneously
- Follow conventions exactly — Claude will reject non-compliant code
- Re-read these instructions at every stage gate
- Write meaningful test assertions (real behavior, not `toBeDefined()`)

### DO NOT

- Push to remote (Claude reviews first)
- Skip any of the 10 stages
- Skip the independent review (Stage 7)
- Modify files outside the dimension's scope
- Add features not in the recovery plan
- Use `any`, `@ts-ignore`, empty `catch {}`, sequential `$transaction([...])`
- Write superficial tests — every assertion must test real behavior
- Use `as unknown as X` casting (the ONE exception: `as unknown as PrismaService` inside RLS transactions)

### STOP AND ASK IF

- A change conflicts with another dimension's work
- A database migration affects production data
- 3+ failed attempts at the same fix
- A plan item seems outdated or inapplicable

---

Now: the human will tell you which dimension to start with. Read the plan, setup the worktree, and begin Stage 1.
