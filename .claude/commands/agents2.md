# /agents2 ��� Gap Remediation Dispatch

You are the **remediation orchestrator**. A `/check` gap report has already been produced. Your job is to read that report, decompose the gaps into parallel agents, dispatch them, integrate, test, and deploy — using the same agent machinery as `/agents` but scoped exclusively to closing identified gaps.

---

## Input

The user provides one of:
- The gap report text (pasted or from the previous `/check` run in this conversation)
- A path to a saved gap report file

If neither is available, ask the user to run `/check` first or provide the report.

---

## Phase 1 — Parse the Gap Report

1. Read the gap report. Extract every gap entry:
   - **Gap ID** (GAP-1, GAP-2, ...)
   - **Title**
   - **Severity** (BLOCKER, MAJOR, MINOR)
   - **Status** (MISSING, PARTIAL, DEVIATED)
   - **Spec requirement** (the quoted "Spec says" line)
   - **Details** (what is wrong or missing)
   - **Location** (file path where the fix should land)

2. Also read the **spec file** referenced in the gap report header — you need the full spec context to implement correctly, not just the gap descriptions.

3. Discard any gaps the user has explicitly marked as accepted deviations or wontfix. If the user hasn't filtered, ask: "The report has [N] gaps ([X] BLOCKER, [Y] MAJOR, [Z] MINOR). Fix all, or should I skip any?"

## Phase 2 — Group Gaps into Work Units

Map gaps to file-level work units using these rules:

1. **Gaps targeting the same file** → same agent. A gap about a missing service method and a gap about a missing error handler in that same service are one work unit.
2. **Gaps targeting a service + its test file** → same agent. The agent writing the fix also writes the test.
3. **Schema gaps** (missing columns, enums, indexes, RLS) → one dedicated agent.
4. **Architecture doc gaps** (missing blast radius entries, state machine updates) → one dedicated agent (Sonnet is fine — mechanical).
5. **Frontend gaps** → group by page/component, one agent per page.

Build the **file ownership matrix** — zero overlaps, same as `/agents`.

Reserve integration files (module wiring, barrel exports) for yourself.

## Phase 3 — Build Briefing Context

Same as `/agents` Phase 2, but add:

1. The **existing code** for each file the agents will modify — agents need to see what's already there, not just the spec. Include the relevant file contents (or key excerpts for large files) in each agent's briefing.
2. The **specific gap entries** each agent is responsible for, with the exact spec requirements quoted.
3. Any **execution log decisions** from the implementation log that explain intentional deviations — so agents don't "fix" something that was deliberately changed.

## Phase 4 — Dispatch All Agents

Dispatch every agent in a **single message** with all Agent tool calls. For each agent:

- **model**: Use the model selection rules from `/agents`. Default to Opus for BLOCKER/MAJOR gaps, Sonnet for MINOR gaps and doc updates.
- **run_in_background: true** — all agents run concurrently.
- **Prompt structure:**
  ```
  ## Briefing (shared context — DO NOT read these files, everything is here)
  [Paste the briefing block from Phase 3]

  ## Existing Code
  [Current contents of the files you will modify]

  ## Gaps to Fix
  [List of gap entries assigned to this agent, with spec requirements]

  ## File Ownership — you may ONLY create/edit:
  [Explicit file list]

  ## Rules
  - Fix ONLY the listed gaps. Do not refactor surrounding code.
  - Do not add features beyond what the spec requires.
  - Write or update tests for every gap you fix.
  - Do NOT touch any other files.
  ```

**Print a status table** showing each agent, its assigned gaps (by ID), and file ownership.

## Phase 5 — Integrate

Same as `/agents` Phase 4:

1. Wire integration files — module files, barrel exports, cross-module imports.
2. Run `turbo type-check` on affected packages. Fix type mismatches between agents.
3. Run `turbo lint` on affected packages. Fix lint errors in new/modified files.
4. Iterate until clean.

## Phase 6 — Test

Same as `/agents` Phase 5:

1. Run tests for all affected modules.
2. Fix any failing tests.
3. If any gap fix is missing a test, write it.
4. Iterate until all tests pass.

## Phase 7 — Verify Against Gap Report

**This phase is unique to `/agents2`.**

Re-run the `/check` logic yourself (do NOT dispatch a subagent — you do this directly):

1. For each gap from Phase 1, verify the fix landed:
   - Read the file at the location specified in the gap.
   - Confirm the spec requirement is now met.
   - Mark as RESOLVED or STILL OPEN.

2. If any gaps are STILL OPEN after the agent pass, fix them yourself directly. These are typically small oversights — a missing enum value, an off-by-one in a column name, a test assertion that doesn't match the spec.

3. Report the verification results:
   ```
   Gap Remediation: [Phase/Subplan]
   Total gaps: [N]
   Resolved: [N]
   Still open: [N] (list them)
   ```

## Phase 8 — Commit & Deploy (with Wave Deploy-Order Enforcement)

`/agents2` is the ONLY command in the pipeline that commits and deploys. It commits everything — both the original `/agents` work and the gap fixes.

1. Stage **all** new and modified files from both `/agents` and this remediation pass. Be specific — no `git add .`.
2. Commit with a conventional commit message summarising the full subplan delivery: `feat(<scope>): implement [phase identifier]`
   - Do NOT use a "fix gaps" message — this is the single commit for the entire subplan.

### Deploy-order gate

Before pushing, check whether this work is part of a wave plan:

3. **Find the implementation log.** Search in this order, stop at the first hit:
   1. Same directory as the spec file (`IMPLEMENTATION-LOG.md`)
   2. Parent directory of the spec file
   3. Grandparent directory of the spec file
   4. `grep -rl` for the spec filename inside any `IMPLEMENTATION-LOG.md` under `Next Features/`, `Plans/`, or `Roadmap/`

   If no implementation log is found anywhere, skip the gate and push normally.
4. **If an implementation log exists**, read its **Deployment Waves** section (or equivalent wave table). Find the current subplan by matching the spec filename from the phase registry. Extract the wave number and deploy order (`d` number).
5. **Check all lower-d subplans in the same wave.** For each one with a lower deploy-order number:
   - If its status in the execution log is `COMPLETE` and it has a commit hash → it is deployed. OK.
   - If its status is anything else → **it has not deployed yet. HOLD.**
6. **If all lower-d subplans are deployed:** push, monitor CI with `gh run watch`, and deploy normally.
7. **If any lower-d subplan is NOT deployed:**
   - Do NOT push.
   - Report to the user:
     ```
     ⏸ Deploy hold: this subplan is [X](d[N]) but [Y](d[M]) has not deployed yet.
     Commit is ready locally. Push when [Y] is deployed and its execution log entry is written.
     ```
   - Update the execution log entry for this subplan with status `BUILT` (not `COMPLETE`) and note that it is awaiting deploy order.

### After push (when it happens)

8. If CI fails, read logs with `gh run view --log-failed`, fix, commit, push again.
9. After successful deployment, update the execution log entry for this subplan: set status to `COMPLETE`, fill in the commit hash, completion date, and all other fields from the execution log template.
10. Check if this subplan's completion **unblocks** any higher-d subplans in the same wave that are in `BUILT` status. If so, tell the user which subplans are now clear to push.
11. Report final test count and deployment status to the user.

---

## Model Selection Rules

Same as `/agents`:
- **Opus** for BLOCKER/MAJOR gaps: missing business logic, security fixes, RLS gaps, state machine corrections.
- **Sonnet** for MINOR gaps: missing doc updates, test additions for existing code, cosmetic fixes, architecture file updates.

---

## Decision Rules

**Agent count:**
- 1-2 gaps in the same file: don't use this command, just fix them directly.
- 3-8 gaps across 2-4 files: 2-3 agents.
- 8-20 gaps across 5+ files: 4-8 agents.
- 20+ gaps: 8-12 agents (if this happens, the original delivery had serious problems).

**When NOT to use `/agents2`:**
- If `/check` found 0 gaps — nothing to do.
- If all gaps are MINOR doc/comment issues — fix them inline, no agent overhead.
- If there's only 1 BLOCKER — just fix it directly with `/go`.

---

Now read the gap report and begin.
