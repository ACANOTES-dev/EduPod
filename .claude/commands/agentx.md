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
   - The path to the `.status/` subfolder (sibling of `IMPLEMENTATION-LOG.md`)

5. **Check if all dependencies are satisfied.** For each dependency Phase X:
   - Check whether the file `.status/Phase-X.complete` exists.
   - A dependency is satisfied if and only if that file exists.

6. **If all dependencies are satisfied:** print `✅ All prerequisites met. Starting build.` and proceed to Stage 2.

7. **If any dependency is NOT satisfied:**
   - Print:
     ```
     ⏳ Waiting for prerequisites:
       - [X]: COMPLETE ✓  (.status/Phase-X.complete exists)
       - [Y]: NOT COMPLETE — waiting (.status/Phase-Y.complete not found)
       - [Z]: NOT COMPLETE — waiting (.status/Phase-Z.complete not found)
     Polling every 15 minutes...
     ```
   - Run `sleep 900` (15 minutes).
   - **Re-check the `.status/` files** (do not re-read the implementation log — it never changes).
   - Repeat this loop until all dependency `.complete` files exist.
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

### Build-phase migration rule

If the spec includes Prisma schema changes, you MUST produce a `migration.sql` file during this stage — do NOT defer it. If `prisma migrate dev` cannot run (no DATABASE_URL), write the DDL manually. The DDL is deterministic from the schema: CREATE TYPE for enums, CREATE TABLE for models, CREATE INDEX / CREATE UNIQUE INDEX for indexes, ALTER TABLE ADD CONSTRAINT for foreign keys. A missing `migration.sql` will always fail CI on deploy — this is a foreseeable blocker, not a surprise.

## Stage 3 — Check (`/check`)

Execute the full `/check` workflow against the same spec:
- Load the spec
- Build deliverable checklist
- Audit every deliverable against the code
- Cross-check quality
- Produce the gap report

### Stage 3 → Stage 4 transition (AUTONOMOUS — DO NOT PAUSE)

After producing the gap report, evaluate the gap count and proceed **immediately**:

- **0 gaps** → skip Stage 4, go straight to Stage 5.
- **Any gaps > 0** → proceed directly to Stage 4. Do NOT present the gap report and wait for user input. The gap report is an intermediate artifact for your own use, not a deliverable. Fix the gaps, then move on.

**Red flag — if you are about to say "Ready for /check then /agents2" or present the gap report as a final output, STOP. You are inside /agentx, not running /check standalone. Continue to Stage 4.**

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

1. Write `.status/Phase-[X].built` (where `[X]` is this phase's identifier) containing the current ISO timestamp. Create the `.status/` folder if it does not exist.
2. Stage all new and modified files. Be specific — no `git add .`.
3. Commit with a conventional commit message for the full subplan: `feat(<scope>): implement [phase identifier]`

### Deploy-order gate

4. **Check all lower-d subplans in the same wave** by looking for their `.status/Phase-[Y].complete` files.
   - If all exist → push, monitor CI with `gh run watch`.
   - If any are missing → **poll with the same 15-minute loop as Stage 1**, checking `.status/Phase-[Y].complete` existence, until all lower-d phases are complete, then push.

### After push

5. If CI fails, read logs with `gh run view --log-failed`, fix, commit, push again.
6. Write `.status/Phase-[X].complete` containing:
   ```
   commit: [short-hash]
   deployed_at: [YYYY-MM-DD HH:MM UTC]
   ```
7. Check if any other phases in the same wave have a `.built` file but no `.complete` file — their deploy gate may now be unblocked. Report if so.

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

## Known failure modes — DO NOT repeat these

| Failure | What happened | Rule |
|---------|---------------|------|
| Pausing after `/check` | Gap report was presented to the user instead of being fed into Stage 4 | Stage 3→4 is internal. Never present gap report as output and wait. |
| Missing `migration.sql` | Deferred to "deploy time" because no DATABASE_URL locally | Write DDL manually during Stage 2. It's deterministic. CI will always fail without it. |
| Treating sub-skill output as final | `/agents` Stage 6 says "Ready for /check" — but inside /agentx, that's an intermediate step | Inside /agentx, sub-skill reports are intermediate. Keep going. |

---

Now parse the input, find the implementation log, and begin the pipeline.
