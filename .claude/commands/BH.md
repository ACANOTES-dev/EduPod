---
description: "Execute a Behaviour Management phase (A-H). Validates prerequisites, plans, implements, tests, deploys, verifies, and logs completion. Usage: /BH A"
---

# Behaviour Management — Execute Phase $ARGUMENTS

You are executing **Phase $ARGUMENTS** of the Behaviour Management module implementation. This is a major feature build with 8 interdependent phases (A through H). You will plan, implement, test, deploy, and verify autonomously.

---

## Step 0 · Understand the Project

This is EduPod's Behaviour Management module — the largest module in the platform. It covers behaviour tracking, safeguarding, policy engine, sanctions, appeals, exclusions, recognition, analytics, AI, document generation, and admin operations across ~155 endpoints, ~32 pages, 32 database tables, and 13 worker jobs.

**Master spec**: `Next_Feature/behaviour-management-spec-v5-master.md`
**Phase specs**: `Next_Feature/phase-{a-h}-*.md` (one per phase, self-contained)
**Progress log**: `Next_Feature/implementation-progress.md`

---

## Step 1 · Validate Prerequisites

Read `Next_Feature/implementation-progress.md` and check the Phase Status table.

**Dependency map** (hard requirements — phase CANNOT start without these):

| Phase | Prerequisites |
|-------|--------------|
| A | None |
| B | A = completed |
| C | A = completed AND B = completed |
| D | A = completed |
| E | A = completed |
| F | A = completed AND B = completed AND E = completed |
| G | A = completed AND C = completed |
| H | A, B, C, D, E, F, G = ALL completed |

**If prerequisites are NOT met**: STOP immediately. Tell the user which phases are missing and which wave they should execute next. Do NOT proceed.

**If prerequisites ARE met**: Continue to Step 2.

---

## Step 2 · Load Context

Read these files in order:

1. `Next_Feature/implementation-progress.md` — check the "Completed Phase Summaries" section for handover context from prior phases
2. `Next_Feature/phase-{$ARGUMENTS letter}-*.md` — the phase spec for this phase (find the right file by matching the letter)
3. `CLAUDE.md` — project conventions, RLS rules, commit conventions
4. `plans/context.md` — architecture, auth, RBAC
5. If the phase includes frontend work: `plans/ui-design-brief.md`
6. For each prerequisite phase marked as completed: read its results file at `plans/phases-results/BH-{letter}-results.md` to understand what exists and what patterns were established
7. For key services/modules listed as dependencies in the phase spec's Prerequisites section: read the actual source files to understand established patterns

---

## Step 3 · Plan the Implementation

Create `plans/phases-plan/BH-$ARGUMENTS-plan.md` containing:

### Section 1 — Overview
- What this phase delivers
- Dependencies on prior phases (with specific file paths to established patterns)

### Section 2 — Database Changes
For every table created or modified:
- Full column list with types, constraints, defaults
- All indexes (name, columns, partial conditions)
- RLS policy
- Seed data required
- Note: Phase A creates ALL 32 tables. Later phases only modify if needed.

### Section 3 — API Endpoints
For every endpoint:
- Method, path, permission required
- Request schema (Zod shape)
- Response schema
- Business logic summary
- Error cases

### Section 4 — Service Layer
For every service class:
- Class name, module, file path
- Every public method with signature
- Complex business logic step-by-step
- Dependencies

### Section 5 — Frontend Pages and Components
For every page:
- File path and route
- Server or client component
- Data fetching, key UI elements
- Which API endpoints it calls

### Section 6 — Background Jobs
For every BullMQ job:
- Job name, queue, trigger, payload, processing logic

### Section 7 — Implementation Order
Ordered steps, each independently testable:
1. Database migrations and seed data
2. Shared types and Zod schemas (in packages/shared)
3. Backend services (dependency order)
4. Backend controllers
5. Background job processors
6. Frontend pages and components

### Section 8 — Files to Create
Complete list with full paths.

### Section 9 — Files to Modify
Complete list with change summary.

### Section 10 — Key Context for Executor
Patterns from prior phases, gotchas, cross-module wiring.

**Validation**: Verify every table, endpoint, and feature in the phase spec has a corresponding plan entry. Verify no forward dependencies in the implementation order.

---

## Step 4 · Implement

Follow the plan from Step 3, executing in the order specified in Section 7.

**Rules**:
- Follow ALL rules in CLAUDE.md and `.claude/rules/` (RLS, TypeScript strict, import ordering, RTL-safe styling, mobile responsive)
- Every tenant-scoped table MUST have `tenant_id` and an RLS policy
- Every endpoint MUST have permission guards
- All API inputs validated with Zod schemas in `packages/shared`
- No `any` types, no `@ts-ignore`, no `as unknown as X`
- Interactive Prisma transactions only (no sequential)
- RTL-safe: logical properties only (ms-, me-, ps-, pe-, start-, end-)
- Do NOT build anything outside the phase scope
- If something seems missing from the phase spec, flag it — do not invent

---

## Step 5 · Local Verification

After implementation:

1. Run `turbo type-check` — fix ALL type errors
2. Run `turbo lint` — fix ALL lint errors
3. Run `turbo test` — fix ALL test failures
4. Write tests for new code:
   - Unit tests for every service method
   - RLS leakage tests for every new tenant-scoped table
   - Permission tests (happy path + denied)
   - Integration tests for key workflows
5. Run `turbo test` again — ALL tests must pass

**Do NOT proceed to Step 6 until all tests pass.**

---

## Step 6 · Commit & Deploy

1. Stage specific files (`git add <files>`) — never `git add .`
2. Commit with conventional message: `feat(behaviour): phase $ARGUMENTS — {summary}`
3. Push to current branch
4. Monitor GitHub Actions: `gh run list --limit 5`, then `gh run watch`
5. If deployment fails: read logs (`gh run view --log-failed`), fix, commit, push, re-monitor
6. Loop up to 3 times. If still failing after 3 attempts, stop and report to the user.

---

## Step 7 · Production Verification

After successful deployment:

1. If server access is available: SSH in and verify the service is running, check logs for errors
2. Run regression tests against production
3. Verify new endpoints respond correctly
4. Check for any runtime errors in logs

---

## Step 8 · Generate Results & Update Progress

### 8a. Create results file

Create `plans/phases-results/BH-$ARGUMENTS-results.md` with:
- **Summary**: What this phase delivered
- **Database**: Tables created/modified with column counts
- **API endpoints**: Every route with method, path, permission
- **Services**: Every service class and responsibilities
- **Frontend**: Every page with route path
- **Background jobs**: Every job with queue and trigger
- **Configuration**: Seed data, settings added
- **Files created**: Full path list
- **Files modified**: Change summary
- **Known limitations**: Anything deferred
- **Deviations**: Anything that differed from the plan

### 8b. Update progress log

Edit `Next_Feature/implementation-progress.md`:

1. Update the Phase Status table: set this phase's status to `completed`, fill in the completed date
2. Append a handover summary to the "Completed Phase Summaries" section:

```markdown
### Phase $ARGUMENTS: [Name] — Completed [YYYY-MM-DD]
**What was built**: [1-3 sentence summary]
**Key files created**: [list the most important new files/modules]
**Key patterns established**: [any conventions or patterns future phases should follow]
**Known limitations**: [anything deferred or incomplete]
**Results file**: plans/phases-results/BH-$ARGUMENTS-results.md
```

This handover summary is critical — it's what future sessions read to understand what's already built.

### 8c. Create testing instruction file

Create `plans/phases-testing-instruction/BH-$ARGUMENTS-testing.md` with:
- Unit test descriptions for every service method
- Integration tests for every endpoint (happy + failure paths)
- RLS leakage tests for every tenant-scoped table
- Manual QA checklist

---

## When to Stop and Ask

**STOP for**:
- Prerequisites not met (Step 1 failure)
- Architectural decisions not covered by the phase spec
- Data safety concerns (production DB writes, destructive operations)
- Ambiguous requirements with meaningfully different outcomes
- 3+ failed attempts at the same issue

**DO NOT stop for**:
- Routine implementation decisions within established patterns
- Test failures you can diagnose and fix
- Lint/type errors
- Deployment retries
- Choosing between equivalent approaches (pick the simpler one)

---

Now read the progress log, validate prerequisites for Phase $ARGUMENTS, and begin.
