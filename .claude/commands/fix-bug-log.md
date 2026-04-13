You are fixing every open bug in the bug log at `$ARGUMENTS` (default:
the `BUG-LOG.md` inside the folder passed to the command). You work
autonomously — no interactive approval between bugs. You are only
finished when every actionable entry is in status `Verified` (or in a
documented terminal state: `Won't Fix`, `Blocked — need input`).

═══════════════════════════════════════════════════════════════════════════
HARD RULES (read these first — they override every other instruction)
═══════════════════════════════════════════════════════════════════════════

1. **Never `git push`.** Deploy server-direct via rsync + build + PM2
   restart. See `memory/feedback_deploy_workflow.md`. Commits accumulate
   ahead of `origin/main` on purpose. The user runs CI sync separately.
2. **Only touch `ACANOTES-dev/EduPod`.** No other repos. No exceptions.
3. **Production is live.** Every command you run against prod carries
   real consequences. No destructive DB actions without explicit
   approval. No credential changes. No package upgrades on the server
   (versions are controlled from the codebase).
4. **Follow CLAUDE.md code rules at all times:** RLS-safe interactive
   transactions only, no `$executeRawUnsafe` outside the middleware,
   `strict: true` TypeScript, no silent catches, Zod at boundaries,
   `ms-`/`me-` logical CSS, Western numerals in both locales, etc.
5. **Regression tests are mandatory.** After each fix, run
   `turbo test --filter={affected-packages}` (or the tightest scope
   that covers the touched code) before committing. If an existing
   test fails, you fix it. You do not mark the bug Verified until
   tests pass locally AND Playwright re-check passes on prod.
6. **Autonomous, but transparent.** Whenever you make a judgement call
   (choosing between two reasonable fixes, picking a trade-off, scoping
   down an ambitious fix, deciding a bug is actually `Won't Fix`), log
   the decision in the bug entry's "Decisions" sub-section AND in a
   running `DECISIONS.md` next to the bug log. One line each is fine.
7. **Stop conditions.** Convert a bug to `Blocked — need input` and
   move on (do NOT stop the whole run) if any of these happen:
   - Fix requires product/UX decision that isn't obvious from the log
   - Fix requires scope beyond the module (cross-module migration,
     new infra, new external credentials)
   - Fix depends on another bug that's still `Open` — re-order the
     queue so the dependency is fixed first; only block if dependency
     is out of scope
   - Playwright re-verification reveals a deeper issue the current fix
     doesn't address

═══════════════════════════════════════════════════════════════════════════
INPUTS & DISCOVERY
═══════════════════════════════════════════════════════════════════════════

`$ARGUMENTS` is typically a path to either:

- A `BUG-LOG.md` file directly, or
- A module folder (e.g. `E2E/7_finance/`) — in which case you look for
  `BUG-LOG.md` inside it.

If the path is ambiguous, list the directory; there should be exactly
one `BUG-LOG.md`. If there are zero or many, stop and ask.

Before starting work, read these in full so you have the live picture:

- The target `BUG-LOG.md`
- Any sibling spec files it references
  (`PLAYWRIGHT-WALKTHROUGH-RESULTS.md`, `RELEASE-READINESS.md`, and
  the role-specific specs under `admin_view/`, `parent_view/`, etc.)
- `CLAUDE.md` and relevant `.claude/rules/*.md` (these are already in
  your session context via the project hook — don't re-read unless
  you've been in a long session and suspect drift)
- `memory/MEMORY.md` for the test-tenant URL, test accounts, server
  access details, deploy workflow, and any module-specific notes

═══════════════════════════════════════════════════════════════════════════
EXECUTION ORDER
═══════════════════════════════════════════════════════════════════════════

1. **Parse the log** into a list of bug entries. For each entry,
   extract: ID, severity (P0/P1/P2/P3), status, provenance tag
   ([L] live / [C] code-review), title, and whether it has an explicit
   dependency on another bug.
2. **Filter to actionable**: status `Open` or `Blocked` that the
   blocker has since cleared. Skip `Fixed`, `Verified`, `Won't Fix`.
   `In Progress` bugs from prior runs: re-read and continue.
3. **Sort**: P0 first, then P1, P2, P3. Within each severity, honour
   explicit dependencies (if FIN-007 depends on FIN-006, do FIN-006
   first). Ties broken by entry order in the log.
4. **Work one bug at a time.** The per-bug cycle is below. Do NOT
   batch fixes across unrelated bugs into a single commit — one bug,
   one commit, one deploy, one verification.
5. **TaskCreate a todo list** with one item per actionable bug so the
   user can see progress. Mark each item complete as it reaches
   `Verified`.

═══════════════════════════════════════════════════════════════════════════
PER-BUG CYCLE
═══════════════════════════════════════════════════════════════════════════

For each bug:

### 1. Claim

Update the entry in `BUG-LOG.md`:

- Status: `Open` → `In Progress`
- Assigned: `Claude Opus 4.6 — YYYY-MM-DD`

### 2. Investigate

- Open the files listed under "Files to inspect"
- Grep for symbols mentioned in the reproduction steps
- If the entry names a backend 500 or similar runtime fault you
  cannot reproduce from code alone, SSH to prod and tail logs:
  `ssh root@46.62.244.139 "su - edupod -c 'pm2 logs api --lines 200'"`
- If the bug is [C] (code-review only) and the relevant code no
  longer matches the description (the bug was fixed in passing by
  another change), verify with a grep + a Playwright probe, then
  mark the bug `Verified` with a note explaining the discovery and
  skip the fix+deploy cycle.

### 3. Decide scope

If the fix direction in the log is clear, follow it. If multiple
reasonable approaches exist, pick one and record the choice in the
entry under `### Decisions`:

```markdown
### Decisions

- 2026-04-12: Chose approach A (nullish coalescing in template) over
  approach B (backfilling invoice_line FKs) because approach B
  changes data and would need a migration; the template can handle
  optional FKs without functional loss.
```

Also append a one-liner to `DECISIONS.md` at the bug-log's folder:

```markdown
- FIN-001 (2026-04-12): Guarded null FKs in invoice PDF template
  instead of backfilling data. — Claude Opus 4.6
```

### 4. Implement

- Make the minimal code change that fixes the bug and nothing more
- Obey CLAUDE.md: RLS interactive transactions, typed DTOs, no
  silent catches, `ms-`/`me-` logical CSS, structured errors
- Add or update tests where the bug exposes a missing case. If the
  bug is UI-only and a Playwright probe will verify it, you do not
  need a Jest test purely to retrofit coverage.
- Update architecture docs only if the change meets the triggers in
  `.claude/rules/architecture-policing.md` (new cross-module dep,
  new job, new state transition, new danger zone). Otherwise leave
  them alone — no thrash.

### 5. Local test

Run the tightest scope that covers the change:

```bash
turbo test --filter=@school/api      # backend only
turbo test --filter=web              # frontend only
turbo test                           # full suite — only if you touched >1 package
```

If a pre-existing test fails, fix the regression in the same commit.
If a test is unfixable without scope-creep, stop this bug and mark
it `Blocked — need input`.

### 6. Commit (locally, no push)

Format:

```
fix({module}): {BUG-ID} — {short title}

{1-2 sentence explanation of the fix and why it's minimal}
```

Example: `fix(finance): FIN-001 — guard null FKs in invoice PDF template`

Never `git push`. Never `--no-verify`. Never `--amend` a commit that
already ran (create a new commit if you need a follow-up).

### 7. Deploy to prod

Deploy only the packages you actually changed:

```bash
# 1. rsync changed source paths to /opt/edupod/app/
rsync -av --delete apps/api/src/modules/finance/ \
  root@46.62.244.139:/opt/edupod/app/apps/api/src/modules/finance/

# 2. Build the affected package on the server (runs as root, writes
#    to shared /opt/edupod/app)
ssh root@46.62.244.139 "cd /opt/edupod/app && pnpm --filter @school/api build"

# 3. Restart the affected PM2 process (must run as edupod user)
ssh root@46.62.244.139 "su - edupod -c 'pm2 restart api'"

# 4. Smoke-check the restart
ssh root@46.62.244.139 "su - edupod -c 'pm2 status'"
```

Adjust scope per change:

- Backend code → rsync `apps/api/src/...`, build `@school/api`,
  restart `api`
- Worker code → rsync `apps/worker/src/...`, build `@school/worker`,
  restart `worker`
- Web code → rsync `apps/web/src/...` + any `apps/web/messages/*.json`,
  build `web`, restart `web`
- Shared packages (`packages/shared`, `packages/ui`) → rsync the
  package, rebuild it AND every consuming app, restart consuming
  processes
- Migrations → do NOT run migrations without explicit approval in
  the bug entry. Add `Blocked — need input` if the fix needs one.

### 8. Verify on prod via Playwright

Use the Playwright MCP tools. Follow the exact reproduction + verification
steps inside the bug entry. If the entry's verification section is
thin, write your own to exercise:

- The original failing path (should now pass)
- At least one adjacent path to catch regressions
- If applicable: Arabic locale at 375px viewport

Never take screenshots — use `browser_snapshot` for DOM assertions,
`browser_network_requests` for API-status checks,
`browser_console_messages` for error probes. This matches the
`memory/feedback_no_screenshots.md` preference.

### 9. Close out

If verification passes:

- Status: `In Progress` → `Verified`
- Add a `### Verification notes` block with the date, what you ran,
  and the observed result (HTTP status, DOM text, console silence,
  whatever the bug's "Expected" section asked for)
- Mark the TodoWrite task complete

If verification fails:

- Status: `In Progress` → `Fixed (re-verify failed)`
- Write what broke under `### Verification notes`
- Do not skip — iterate: investigate → adjust → commit follow-up →
  re-deploy → re-verify. Up to 3 iterations. After that, move to
  `Blocked — need input` and go to the next bug.

═══════════════════════════════════════════════════════════════════════════
SPECIAL CASES
═══════════════════════════════════════════════════════════════════════════

### Bugs that can't be Playwright-verified

Some bugs (cron registrations, worker retry policies, encryption-
round-trip, RLS policy on a rarely-used table) aren't observable
from the browser. For these:

- Verify via direct probe instead: `gh` workflow run, BullMQ queue
  inspection (`ssh ... "su - edupod -c 'pm2 describe worker'"`), DB
  query through the RLS-safe path, unit test pass
- Note in `### Verification notes` that Playwright wasn't applicable
  and describe the alternative probe

### Bugs requiring a product/UX decision

If the fix requires a choice only the user can make (copy change,
feature scope, which of two UX patterns to use, whether to delete
vs. archive), do NOT invent the answer. Status:
`Blocked — need input`, write the specific question under
`### Decisions`, and move on.

### Bugs depending on infra / secrets / external systems

Cannot pick up. Mark `Blocked — need input` with the missing
dependency.

### Dead-letter / flaky bugs

If a bug entry is incoherent (reproduction steps don't match the
current code, the symptom can't be reproduced, the referenced file
doesn't exist), mark it `Won't Fix` with a `### Decisions` note
explaining what you verified and why the entry is stale. Append
the decision to `DECISIONS.md`.

═══════════════════════════════════════════════════════════════════════════
WHEN THE QUEUE IS EMPTY
═══════════════════════════════════════════════════════════════════════════

At the end, produce a single summary report (in chat, not a file):

- Total actionable bugs at start
- Verified: N
- Blocked — need input: N, with one-line reason each
- Won't Fix: N, with one-line reason each
- Commits created (count + list of commit subjects)
- Deploys performed (api / web / worker restart counts)
- Outstanding questions for the user (from `Blocked` entries)

Then — and only then — inform the user the run is complete.

═══════════════════════════════════════════════════════════════════════════
ANTI-PATTERNS
═══════════════════════════════════════════════════════════════════════════

- Do NOT batch multiple bugs into one commit. One bug = one commit.
- Do NOT skip the local `turbo test` because "the change looks
  obvious". It takes minutes; rollbacks take hours.
- Do NOT `git push` at the end. Deploy-direct is the workflow.
- Do NOT invent a product decision to unblock a bug. Block it
  instead.
- Do NOT take Playwright screenshots. DOM snapshots only.
- Do NOT modify `origin/main` from the server. The server is a
  deploy target, not a git remote.
- Do NOT silently widen scope. If fixing FIN-003 reveals an
  unrelated issue, file it as a NEW bug entry (appended to the log
  with next ID) — don't fold it into the current fix.
- Do NOT wait for user confirmation between bugs. Autonomous means
  autonomous. The only stops are the `Blocked` conditions above.

═══════════════════════════════════════════════════════════════════════════
DEFINITION OF DONE
═══════════════════════════════════════════════════════════════════════════

- Every bug that could be fixed is `Verified`
- Every bug that couldn't be fixed is in a documented terminal state
  with a written reason
- `DECISIONS.md` exists next to the bug log and records every
  judgement call
- All commits are local (nothing pushed)
- Production reflects every `Verified` fix (smoke-checked via pm2
  status + at least one Playwright probe per fix)
- Summary report delivered to the user

Begin with parsing the bug log at `$ARGUMENTS`.
