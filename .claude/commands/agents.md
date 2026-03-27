# /agents — Parallel Agent Dispatch

You are the **orchestrator**. Your job is to decompose the task into parallel agents, dispatch them simultaneously, then integrate the results. Do NOT ask for approval of agent strategy — you decide and execute.

---

## Phase 1 — Analyse & Decompose

1. Read the task description and any referenced spec/doc files in full.
2. Read all shared context you'll need: `CLAUDE.md`, relevant `.claude/rules/` files, existing code patterns in the affected modules. **You read these ONCE — agents will not.**
3. Identify every deliverable (service, controller, schema, test file, etc.) and map them to discrete work units.
4. Determine the **optimal number of agents** by applying these rules:
   - Each agent owns a **non-overlapping set of files**. No two agents write to the same file, ever.
   - Maximise parallelism: if 20 files can be split across 10 agents with zero overlap, use 10.
   - Group tightly-coupled files (service + its spec) into one agent when the spec depends on knowing the implementation.
   - Separate loosely-coupled files (schemas, constants, unrelated services) into their own agents.
   - Reserve integration files (module wiring, barrel exports) for yourself as orchestrator.
5. Build a **file ownership matrix** and verify zero overlaps before proceeding.

## Phase 2 — Build Briefing Context

This is the overhead-elimination step. Instead of each agent independently reading 5-6 shared files:

1. Extract the **key patterns** from the codebase that agents will need:
   - RLS transaction pattern (exact code snippet from an existing service)
   - Audit event writing pattern
   - Controller/guard structure
   - Test mock setup pattern
   - Import ordering conventions
   - Relevant Prisma schema excerpts for tables agents will touch
2. Extract **relevant method signatures** from existing services that agents must integrate with.
3. Condense this into a **briefing block** (~100-150 lines) that you will paste directly into every agent's prompt.

This replaces 6 file reads per agent (~18K tokens each) with zero file reads for shared context.

## Phase 3 — Dispatch All Agents

Dispatch every agent in a **single message** with all Agent tool calls. For each agent:

- **model**: Select per-agent using the model selection rules below. Never use haiku.
- **run_in_background: true** — all agents run concurrently.
- **Prompt structure:**
  ```
  ## Briefing (shared context — DO NOT read these files, everything is here)
  [Paste the briefing block from Phase 2]

  ## Your Task
  [Specific deliverable for this agent]

  ## File Ownership — you may ONLY create/edit:
  [Explicit file list]

  ## Do NOT touch any other files.
  ```
- The briefing block goes first so the agent has full context before reading its task.
- Each agent gets only ONE spec file to read (its specific sub-phase or section).
- Tell agents that read shared files to skip them — the briefing covers it.

**Print a status table** to the user showing all dispatched agents and their assignments, then wait.

## Phase 4 — Integrate

As agents complete, track progress. Once ALL agents have returned:

1. **Wire integration files** — module files, barrel exports, cross-module imports. These are YOUR files; no agent touched them.
2. **Run `turbo type-check`** on affected packages. Fix any type mismatches between agents:
   - Method name mismatches (agent A calls `findOrphans`, agent B's test calls `findOrphanedCases`)
   - Parameter order mismatches (agent B assumed `(tenantId, caseId, userId)` but agent A wrote `(tenantId, userId, caseId)`)
   - DTO shape mismatches (test missing a required field that has a Zod `.default()`)
   - Missing mock providers (agent modified a constructor but its test file was written by a different agent)
3. **Run `turbo lint`** on affected packages. Fix any lint errors in new files (warnings in pre-existing files can be ignored).
4. Iterate type-check and lint until clean.

## Phase 5 — Test

1. Run tests for all affected modules: `turbo test --filter=@school/api -- --testPathPattern='<pattern>'`
2. Exclude e2e/integration tests that require a live database (in `test/` or `e2e/` directories) — these will fail without env vars and that's expected.
3. Fix any failing unit tests. Common fixes:
   - Missing mock methods on the RLS transaction mock object
   - Wrong assertion on return shape (`result.data.field` vs `result.field`)
   - Mock not set up for a code path the agent didn't anticipate
4. **If any deliverable is missing tests**, write them. Every service and controller gets at minimum:
   - Happy-path tests for each public method
   - Error/edge-case tests for validation logic
   - Permission/guard tests for controllers
5. Iterate until **all unit tests pass**.

## Phase 6 — Commit & Deploy

1. Stage all new and modified files. Be specific — no `git add .`.
2. Commit with a conventional commit message summarising all sub-phases.
3. Push and monitor CI with `gh run watch`.
4. If CI fails, read logs with `gh run view --log-failed`, fix, commit, push again.
5. Report final test count and deployment status to the user.

---

## Model Selection Rules

**Core principle:** Use Sonnet when the transformation is deterministic — when there is one correct output for the given input and an experienced developer wouldn't need to pause and think about the approach. Use Opus when the task requires diagnosis, trade-off evaluation, or synthesizing information from multiple sources to arrive at a solution that isn't obvious from the prompt alone. **When in doubt, use Opus.** This is a high-stakes production codebase.

**Use Opus 4.6 (`model: "opus"`) for:**
- Debugging, diagnosis, or investigating why something is broken
- Implementing new services, complex business logic, or architectural patterns
- Multi-file changes with cross-file dependencies (service refactors, new modules)
- Tasks where the agent must explore the codebase and make judgment calls
- Any task where the prompt describes the PROBLEM, not the exact SOLUTION
- State machine logic, transaction coordination, security-sensitive code
- Writing tests for complex services (mocking strategy requires understanding the service)

**Use Sonnet 4.6 (`model: "sonnet"`) for:**
- Find-and-replace across files (rename a variable, align string formats)
- i18n extraction (replace hardcoded strings with `t()` calls)
- Applying an established codebase pattern to new files (controller tests that follow a template)
- Seed data, constants, translation files, documentation edits
- Wiring existing services into modules (add to providers array, add imports)
- Simple UI work where the pattern is clear (replace a placeholder with a component that fetches and renders data)
- Tasks where the prompt can specify exact file paths and exact changes

**Litmus test:** If you can describe the change in 2-3 sentences without ambiguity, use Sonnet. If you need a paragraph to explain the context and the agent might need to investigate, use Opus.

**Cost of getting it wrong:**
- Opus on a mechanical task = wasted tokens (3x budget, same result)
- Sonnet on a diagnosis task = wasted time (confidently makes the wrong fix, you clean up longer than Opus would have taken)

---

## Decision Rules

**Agent count heuristics:**
- 1-3 files of work: don't use this command, just do it directly.
- 4-10 files: 2-4 agents.
- 10-25 files: 5-10 agents.
- 25-50 files: 10-16 agents.
- 50+ files: 16-20 agents (cap at 20 — beyond that, coordination overhead grows).

**When to split vs group:**
- Service + its own spec = same agent (spec needs to know exact method signatures).
- Service + controller for the same domain = same agent if tightly coupled, separate if controller is thin.
- Shared schemas = own agent (no runtime dependencies).
- Constants = own agent or grouped with schemas (tiny, fast).
- Integration/e2e tests that span multiple services = own agent (reads specs, doesn't need implementation details).

**What the orchestrator always owns:**
- Module files (`*.module.ts`)
- Barrel exports (`index.ts`) when multiple agents contribute to the same barrel
- Any file that multiple agents would need to write to
- The final integration fix pass

---

Now analyse the user's task and begin.
