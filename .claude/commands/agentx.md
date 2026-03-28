# /agentx — Full Pipeline: Wait for Dependencies → Build → Check → Remediate → Deploy

Runs the entire subplan delivery pipeline end-to-end in a single session. Automatically waits for prerequisite subplans to complete before starting. No human intervention unless a blocking decision is needed.

---

## Input

The user provides a subplan identifier and optionally a spec path:

```
/agentx Phase H
/agentx Phase H — spec at Next Features/GDPR/Phase-H-Data-Subject-Protections.md
```

---

## Stage 1 — Find the Implementation Log & Resolve Dependencies

1. **Find the spec file.** If the user provided an explicit path, use it. Otherwise, search for it using the subplan identifier in `Next Features/`, `Plans/`, `Roadmap/`.

2. **Find the implementation log.** Search in this order, stop at the first hit:
   1. Same directory as the spec file (`IMPLEMENTATION-LOG.md`)
   2. Parent directory of the spec file
   3. Grandparent directory of the spec file

3. **If no implementation log is found:** proceed immediately to Stage 2 (no dependency tracking).

4. **If an implementation log exists**, read the **Phase Registry** and **Deployment Waves** section. Find this subplan and extract:
   - Its **dependencies** (the "Depends On" column)
   - Its **wave number** and **deploy order** (`d` number)

5. **Check if all dependencies are satisfied.** For each dependency:
   - Read the **Execution Log** section of the implementation log.
   - A dependency is satisfied if it has an execution log entry with status `COMPLETE`.

6. **If all dependencies are satisfied:** print `✅ All prerequisites met. Starting build.` and proceed to Stage 2.

7. **If any dependency is NOT satisfied:**
   - Print:
     ```
     ⏳ Waiting for prerequisites:
       - [X]: COMPLETE ✓
       - [Y]: NOT COMPLETE — waiting
       - [Z]: NOT COMPLETE — waiting
     Polling every 5 minutes...
     ```
   - Run `sleep 300` (5 minutes).
   - **Re-read the implementation log** (another session may have updated it).
   - Check dependencies again.
   - Repeat this loop until all dependencies show `COMPLETE`.
   - On each poll, print: `🔄 [HH:MM] — still waiting for [Y], [Z]...`
   - When finally clear: `✅ All prerequisites met after [N] minutes. Starting build.`

## Stage 2 — Build (`/agents`)

Execute the full `/agents` workflow:
- Phase 1: Analyse & Decompose
- Phase 2: Build Briefing Context
- Phase 3: Dispatch All Agents
- Phase 4: Integrate
- Phase 5: Test
- Phase 6: Report (no commit, no deploy)

At the end, all changes are in the working tree, unstaged.

## Stage 3 — Check (`/check`)

Execute the full `/check` workflow against the same spec:
- Load the spec
- Build deliverable checklist
- Audit every deliverable against the code
- Cross-check quality
- Produce the gap report

If the gap report shows **0 gaps** → skip Stage 4, go straight to Stage 5.

## Stage 4 — Remediate (`/agents2`)

Execute the `/agents2` workflow using the gap report from Stage 3:
- Parse gaps
- Group into work units
- Build briefing with existing code
- Dispatch agents
- Integrate and test
- Verify all gaps are resolved

**Do NOT commit yet** — Stage 5 handles that.

## Stage 5 — Commit & Deploy

This is the single commit and deploy point for the entire pipeline.

1. Stage all new and modified files. Be specific — no `git add .`.
2. Commit with a conventional commit message for the full subplan: `feat(<scope>): implement [phase identifier]`

### Deploy-order gate

3. **Re-read the implementation log** (state may have changed while building).
4. **Check all lower-d subplans in the same wave:**
   - If all are `COMPLETE` → push, monitor CI with `gh run watch`.
   - If any are not deployed → **poll with the same 5-minute loop as Stage 1** until all lower-d subplans are `COMPLETE`, then push.

### After push

5. If CI fails, read logs with `gh run view --log-failed`, fix, commit, push again.
6. Update the execution log entry: status `COMPLETE`, commit hash, date, all template fields.
7. Check if this unblocks any `BUILT` subplans in the same wave. Report if so.

## Stage 6 — Final Report

Print a summary:

```
Pipeline complete: [phase identifier]

Wait:        [N] minutes waiting for prerequisites
Build:       [N] agents dispatched, [N] files created/modified
Check:       [N] deliverables checked, [N] gaps found
Remediation: [N] gaps resolved ([N] by agents, [N] by self-fix)
Tests:       [N] passing
Deploy:      [DEPLOYED | HELD at d[N] — polling for [X]]
```

---

## When to stop and ask

Same rules as `/go`:
- Architectural decisions beyond scope
- Data safety concerns
- Ambiguous requirements with meaningfully different outcomes
- 3+ failed attempts at the same fix

Do NOT stop for routine fixes, test failures you can diagnose, or lint/type errors.

---

Now parse the input, find the implementation log, and begin the pipeline.
