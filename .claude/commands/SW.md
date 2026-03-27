---
description: "Execute a Student Wellbeing sub-phase (1A-5A). Validates prerequisites, orchestrates parallel sub-agents, implements, tests, deploys, verifies, and logs completion. Usage: /SW 1A"
---

# Student Wellbeing — Execute Sub-Phase SW-$ARGUMENTS

You are executing **Sub-Phase SW-$ARGUMENTS** of the Student Wellbeing module implementation. This is a major feature build with 13 interdependent sub-phases across 5 master phases. You will orchestrate parallel sub-agents, coordinate their output, verify quality, deploy, and log completion.

---

## Step 0 · Understand the Project

This is EduPod's Student Pastoral Care & Wellbeing module — the most architecturally demanding module in the platform. It covers pastoral concern logging, three-tier safeguarding access with defence-in-depth, immutable audit chronology, SST case management, intervention plans, NEPS referral tracking, wellbeing indicators, self-check-ins, and critical incident management.

**Master spec**: `Next_Feature/student-wellbeing/master-spec.md`
**Sub-phase specs**: `Next_Feature/student-wellbeing/phase-sw-*.md` (one per sub-phase, self-contained)
**Progress log**: `Next_Feature/student-wellbeing/implementation-progress.md`
**Results folder**: `Plans/phases-results/` (SW-{id}-results.md files)
**Plans folder**: `Plans/phases-plan/` (SW-{id}-plan.md files)

---

## Step 1 · Validate Prerequisites

Read `Next_Feature/student-wellbeing/implementation-progress.md` and check the Sub-Phase Status tables.

**Dependency map** (hard requirements — sub-phase CANNOT start without these):

| Sub-Phase | Prerequisites |
|-----------|--------------|
| SW-1A | None |
| SW-1B | SW-1A = completed |
| SW-1C | SW-1A = completed AND SW-1B = completed |
| SW-1D | SW-1B = completed |
| SW-1E | SW-1B = completed |
| SW-2A | SW-1D = completed |
| SW-2B | SW-1D = completed AND SW-2A = completed |
| SW-2C | SW-1B = completed AND SW-1D = completed |
| SW-2D | SW-1C = completed AND SW-1E = completed |
| SW-3A | SW-2B = completed |
| SW-3B | SW-2A = completed AND SW-2B = completed AND SW-1C = completed |
| SW-3C | SW-1C = completed AND SW-3B = completed |
| SW-4A | SW-1B = completed AND SW-1E = completed |
| SW-5A | SW-1B = completed AND SW-1D = completed |

**If prerequisites are NOT met**: STOP immediately. Tell the user which sub-phases are missing and which can be executed next. Do NOT proceed.

**If prerequisites ARE met**: Continue to Step 2.

---

## Step 2 · Load Context

Read these files in order:

1. `Next_Feature/student-wellbeing/implementation-progress.md` — check the "Completed Sub-Phase Summaries" section for handover context from prior sub-phases
2. `Next_Feature/student-wellbeing/master-spec.md` — the v4 master specification (read relevant sections, not the entire file if the sub-phase spec references specific sections)
3. `Next_Feature/student-wellbeing/phase-sw-{$ARGUMENTS lowercase}.md` — the sub-phase spec for this sub-phase
4. `CLAUDE.md` — project conventions, RLS rules, commit conventions
5. `Plans/context.md` — architecture, auth, RBAC
6. If the sub-phase includes frontend work: `Plans/ui-design-brief.md`
7. For each prerequisite sub-phase marked as completed: read its results file at `Plans/phases-results/SW-{id}-results.md` to understand what exists and what patterns were established
8. For key services/modules listed as dependencies in the sub-phase spec's Prerequisites section: read the actual source files to understand established patterns

---

## Step 3 · Plan the Implementation

Create `Plans/phases-plan/SW-$ARGUMENTS-plan.md` containing:

### Section 1 — Overview
- What this sub-phase delivers
- Dependencies on prior sub-phases (with specific file paths to established patterns)

### Section 2 — Database Changes
For every table created or modified:
- Full column list with types, constraints, defaults
- All indexes (name, columns, partial conditions)
- RLS policy (standard, tiered, CP-specific, or immutability trigger)
- Seed data required

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

### Section 7 — Work Breakdown for Sub-Agents
**THIS IS CRITICAL.** Divide the implementation into 4-10 independent work packages, each assigned to a sub-agent. Design packages so they can be worked on in parallel with minimal merge conflicts. Each package should include:
- Specific files to create/modify
- Clear boundaries (this agent does X, not Y)
- Expected output (what files should exist when done)
- Test requirements for that package

### Section 8 — Files to Create
Complete list with full paths.

### Section 9 — Files to Modify
Complete list with change summary.

### Section 10 — Key Context for Executor
Patterns from prior sub-phases, gotchas, cross-module wiring.

**Validation**: Verify every table, endpoint, and feature in the sub-phase spec has a corresponding plan entry. Verify no forward dependencies in the implementation order.

---

## Step 4 · Orchestrate Implementation

**YOU ARE THE ORCHESTRATOR. YOU DO NOT WRITE IMPLEMENTATION CODE YOURSELF.**

Your role is to dispatch sub-agents, coordinate their output, resolve conflicts, and verify quality. You execute implementation through delegation.

### Dispatching Rules

1. **Dispatch between 4 and 10 sub-agents** using the Agent tool. This is a hard requirement — no solo execution.
2. **ALL sub-agents MUST be Opus 4.6.** Set `model: "opus"` on every Agent invocation. Sonnet is REJECTED for this implementation — the complexity of cross-referencing master spec, sub-phase spec, and existing patterns requires Opus-level reasoning.
3. **Each sub-agent receives:**
   - The work package from Section 7 of the plan
   - Path to the master spec and sub-phase spec (they must READ these)
   - Path to CLAUDE.md and relevant .claude/rules/ files
   - Explicit list of files they own (create/modify)
   - Explicit list of files they must NOT touch (owned by other agents)
   - Clear acceptance criteria
4. **Sub-agents work autonomously.** They do not ask for approval. They implement their package completely.
5. **Sub-agents must follow ALL rules** from CLAUDE.md and .claude/rules/ (RLS, TypeScript strict, import ordering, RTL-safe styling, mobile responsive).

### Concurrency Handling

Multiple sessions may be running concurrently on different sub-phases. If a sub-agent encounters a git conflict or file lock:
1. Wait 2 minutes
2. Pull latest changes: `git pull --rebase`
3. Retry the operation
4. If still blocked after 3 retries, report to the orchestrator with the specific conflict

### SSH Access

All agents under this command have **free approval to SSH into the production server** when needed. The ONLY requirement is strict adherence to the server rules in CLAUDE.md:
- Assume every command is high-stakes (this is production)
- No destructive actions that put the project at risk
- No credential changes without explicit approval
- No package upgrades on the server
- Operational maintenance (restart services, check logs, verify deployments) is permitted

### After All Sub-Agents Complete

1. **Collect all results.** Read every file created or modified by sub-agents.
2. **Resolve integration issues.** If sub-agents created conflicting code (duplicate imports, mismatched interfaces), fix the conflicts.
3. **Wire everything together.** Ensure module registrations, exports, and cross-service dependencies are correctly configured.
4. **Verify the whole is greater than the sum of parts.** The combined output must compile and work as a cohesive unit.

---

## Step 5 · Local Verification

After all sub-agent work is collected and integrated:

1. Run `turbo type-check` — fix ALL type errors
2. Run `turbo lint` — fix ALL lint errors
3. Run `turbo test` — fix ALL test failures (existing AND new)
4. **Verify test coverage against sub-phase spec:**
   - Unit tests for EVERY service method listed in the spec
   - RLS leakage tests for EVERY new tenant-scoped table
   - Permission tests (happy path + denied) for EVERY endpoint
   - Immutability tests for EVERY append-only table
   - Zero-discoverability tests if Tier 3 work is involved
5. Run `turbo test` again — ALL tests must pass
6. **100% deliverable check:** Go through the sub-phase spec's deliverables list item by item. Every single item must be implemented. If anything is missing, implement it now (dispatch another sub-agent if needed). This is a HARD requirement.

**Do NOT proceed to Step 6 until ALL tests pass AND 100% of spec deliverables are verified.**

---

## Step 6 · Commit & Deploy

1. Stage specific files (`git add <files>`) — never `git add .`
2. Commit with conventional message: `feat(pastoral): SW-$ARGUMENTS — {summary}`
3. Push to current branch
4. Monitor GitHub Actions: `gh run list --limit 5`, then `gh run watch`
5. If CI/deployment fails: read logs (`gh run view --log-failed`), fix, commit, push, re-monitor
6. **Iterate until ALL CIs and deployments succeed.** There is no retry limit — keep fixing and pushing until the pipeline is green. This is a hard requirement.

### Concurrent Session Conflict Resolution

If `git push` fails due to remote changes (another session pushed):
1. `git pull --rebase`
2. Resolve any merge conflicts
3. Run `turbo type-check && turbo lint && turbo test` again (rebase may have introduced issues)
4. Push again
5. Repeat until successful

---

## Step 7 · Production Verification

After successful deployment:

1. SSH into the server and verify the service is running
2. Check logs for any runtime errors: `journalctl -u edupod-api --since "5 minutes ago" --no-pager`
3. Verify new endpoints respond correctly (curl a health-check or key endpoint)
4. Run regression tests against production if applicable
5. Check for any database migration issues

---

## Step 8 · Generate Results & Update Progress

### 8a. Create results file

Create `Plans/phases-results/SW-$ARGUMENTS-results.md` with:
- **Summary**: What this sub-phase delivered
- **Database**: Tables created/modified with column counts
- **API endpoints**: Every route with method, path, permission
- **Services**: Every service class and responsibilities
- **Frontend**: Every page with route path (if applicable)
- **Background jobs**: Every job with queue and trigger (if applicable)
- **Configuration**: Seed data, settings added
- **Files created**: Full path list
- **Files modified**: Change summary
- **Tests written**: Count and categories (unit, RLS, permission, integration)
- **Known limitations**: Anything deferred
- **Deviations**: Anything that differed from the plan or spec

### 8b. Update progress log

Edit `Next_Feature/student-wellbeing/implementation-progress.md`:

1. Update the Sub-Phase Status table: set this sub-phase's status to `completed`, fill in the completed date and notes column with key metrics (endpoints, services, tests, etc.)
2. Add an entry to the Completion Log table with date and summary
3. Append a handover summary to the "Completed Sub-Phase Summaries" section:

```markdown
### SW-$ARGUMENTS: [Name] — Completed [YYYY-MM-DD]
**What was built**: [1-3 sentence summary]
**Key files created**: [list the most important new files/modules]
**Key patterns established**: [any conventions or patterns future sub-phases should follow]
**Known limitations**: [anything deferred or incomplete]
**Results file**: Plans/phases-results/SW-$ARGUMENTS-results.md
```

This handover summary is critical — it's what future sessions read to understand what's already built.

### 8c. Create testing instruction file

Create `Plans/phases-testing-instruction/SW-$ARGUMENTS-testing.md` with:
- Unit test descriptions for every service method
- Integration tests for every endpoint (happy + failure paths)
- RLS leakage tests for every tenant-scoped table
- Immutability tests for append-only tables
- Manual QA checklist

---

## Parallel Execution Waves

These sub-phases can run concurrently in separate sessions:

- **Wave 1**: SW-1A (solo — foundation)
- **Wave 2**: SW-1B (solo — gateway for everything else)
- **Wave 3**: SW-1C + SW-1D + SW-1E (parallel — all depend on SW-1B)
- **Wave 4**: SW-2A + SW-2C + SW-2D (parallel — different dependencies)
- **Wave 5**: SW-2B + SW-4A + SW-5A (parallel — after their dependencies)
- **Wave 6**: SW-3A + SW-3B (parallel — after Phase 2)
- **Wave 7**: SW-3C (after SW-3B)

When running concurrent sessions, each session should be on a separate branch or coordinate commits carefully.

---

## When to Stop and Ask

**STOP for**:
- Prerequisites not met (Step 1 failure)
- Architectural decisions not covered by the master spec or sub-phase spec
- Data safety concerns (production DB writes, destructive operations beyond normal deployment)
- Ambiguous requirements with meaningfully different outcomes
- Sub-agent failures that cannot be resolved by re-dispatch

**DO NOT stop for**:
- Routine implementation decisions within established patterns
- Test failures you can diagnose and fix
- Lint/type errors
- Deployment retries (keep iterating)
- Git conflicts (resolve and retry)
- Choosing between equivalent approaches (pick the simpler one)
- Sub-agent integration issues (resolve them yourself as orchestrator)

---

Now read the progress log, validate prerequisites for Sub-Phase SW-$ARGUMENTS, and begin.
