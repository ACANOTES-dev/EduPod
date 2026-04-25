---
description: 'Execute a specific implementation from the Reports rebuild in an isolated git worktree, following the strict merge queue (Rules 28-33). Reads the implementation log, validates prerequisites, codes in isolation, self-tests via CI on the impl branch, waits in the queue, merges to main with exclusive lock, watches CI + fix-forwards, runs production verification (curl + Playwright), and only then releases the lock. Server access is granted for diagnostics only — all deploys go through GitHub CI. Usage: /NI 03'
---

# Reports Rebuild — Execute Implementation $ARGUMENTS

You are executing **Implementation $ARGUMENTS** of the Reports module rebuild. This is a 22-phase, 5-wave rebuild that replaces the mock-data-backed reports module with a real KPI dashboard, a curated custom report builder, three flag-gated AI features (narration, ask-AI, predictions), scheduled reports + alerts workers, finished board + compliance aggregation, and a PDF/Excel/Word export pipeline. The rebuild is documented in `reports-rebuild/PLAN.md` and orchestrated via `reports-rebuild/IMPLEMENTATION_LOG.md`.

**This command implements Rules 28–33** (worktree isolation + strict merge queue) of `IMPLEMENTATION_LOG.md` §2b. Read those before deviating from the steps below.

---

## Step 0 · Read the context

Before doing anything else, read these three files in order:

1. **`reports-rebuild/IMPLEMENTATION_LOG.md`** — operating rules, wave structure, deployment matrix, completion status. Pay special attention to §2a (Rules 17–27, parallel-execution hygiene) and §2b (Rules 28–33, worktree + queue).
2. **`reports-rebuild/PLAN.md`** — master plan: scope, KPI set, 11 report subjects, custom builder UX, AI flagship scope, sharing flow, component map.
3. **`reports-rebuild/implementations/$ARGUMENTS-*.md`** — your primary work instructions. Find the file by matching the `$ARGUMENTS` prefix.

Do not skim. The log is the source of truth for what has and has not been done.

## Step 1 · Validate prerequisites

From the implementation file, identify the `Depends on:` line in the frontmatter. Every prerequisite implementation number listed MUST show `status: completed` in the §4 Wave Status table.

If **any** prerequisite is not completed:

- STOP. Do not touch code.
- Tell the user: "Cannot execute implementation $ARGUMENTS — prerequisites not met: [list]. Run those first."
- Do not partial-execute or work around missing prerequisites.

If all prerequisites are satisfied, continue.

## Step 2 · Read completed prerequisite summaries

For each prerequisite, read its completion record in §5. Look for: what was actually built (may differ from the plan), any deviations with rationale, follow-up notes that affect your work, file paths / endpoint names / service signatures you'll integrate with. The record is authoritative for what exists in the codebase right now.

## Step 3 · Create your isolated worktree (Rule 28)

Every parallel impl runs in its own filesystem copy. Even if you are the only active session right now, create the worktree — by the time you finish coding, a sibling session may have started.

```bash
WAVE_ROOT="$(git rev-parse --show-toplevel)"
WORKTREE="${WAVE_ROOT}/.worktrees/impl-$ARGUMENTS"
BRANCH="impl/$ARGUMENTS-$(date +%s)"   # the timestamp suffix prevents stale-branch collisions

git fetch origin main
git worktree add "$WORKTREE" -b "$BRANCH" origin/main
cd "$WORKTREE"

# Verify isolation
git status     # must be clean
git branch     # must show only $BRANCH
```

All subsequent work happens in `$WORKTREE`. The original checkout is never touched. If `$WORKTREE` already exists from a prior session of yours, remove it first: `git worktree remove --force "$WORKTREE"` then re-create.

## Step 4 · Mark `in-progress` in the log

Inside the worktree, flip your row in §4 from `pending` to `in-progress`:

```bash
sed -i.bak 's/| '$ARGUMENTS'  | \(.*\) | `pending`/| '$ARGUMENTS'  | \1 | `in-progress`/' \
  reports-rebuild/IMPLEMENTATION_LOG.md
rm -f reports-rebuild/IMPLEMENTATION_LOG.md.bak
git add reports-rebuild/IMPLEMENTATION_LOG.md
git commit -m "docs(reports): impl $ARGUMENTS — start coding (in-progress)"
git push -u origin "$BRANCH"
```

(The push to your impl branch — NOT to `main` — gives other sessions reading `origin/main`'s log a clear signal you've claimed the slot, without yet altering main itself. The status flip will land on main when you eventually merge.)

## Step 5 · Execute the implementation

Follow `reports-rebuild/implementations/$ARGUMENTS-*.md` exactly. The file is your recipe.

Follow `CLAUDE.md` and `.claude/rules/*` at all times. Highest-priority rules:

- RLS on every new tenant-scoped table: `FORCE ROW LEVEL SECURITY` + `<table>_tenant_isolation` policy. Mirror into `packages/prisma/rls/policies.sql`.
- No raw SQL outside the RLS middleware. No `$executeRawUnsafe` / `$queryRawUnsafe` anywhere else.
- Interactive `$transaction(async (tx) => ...)` for every tenant-scoped write. Sequential `$transaction([...])` is prohibited.
- Strict TypeScript — no `any`, no `@ts-ignore`, no `as unknown as X` except the documented RLS-transaction exception.
- Zod schemas live in `@school/shared`; DTOs inferred from them.
- Logical CSS properties on frontend (`ps-`, `pe-`, `start-`, `end-`) — never `pl-`, `pr-`, `left-`, `right-`.
- `react-hook-form` + `zodResolver` for every new form.
- Co-located `.spec.ts` files next to source. Every tenant-scoped table needs an RLS leakage test.
- AI features default off and respect `tenant_ai_flags`. Guard every AI endpoint with `@UseGuards(AiFlagGuard) @RequiresAiFlag('reports_...')`.
- Custom builder queries MUST go through the subject registry + query engine.

### Continuous rebasing (Rule 32)

Whenever an upstream sibling in your wave merges to `main`, rebase within 5 minutes:

```bash
git fetch origin main
# Did main move?
if [ "$(git rev-parse origin/main)" != "$(git merge-base HEAD origin/main)" ]; then
  git rebase origin/main
  # Resolve any conflicts here, while the diff is still small.
  pnpm turbo run type-check --filter=@school/<affected>
fi
```

For known append-only files (`reports-rebuild/IMPLEMENTATION_LOG.md`, `apps/web/messages/{en,ar}.json`), `git rebase -X theirs <branch>` auto-resolves cleanly.

### Local gauntlet

Before pushing for self-CI:

```bash
pnpm turbo run type-check --filter=@school/<affected>
pnpm turbo run lint --filter=@school/<affected>
pnpm turbo run test --filter=@school/<affected>
```

If `CLAUDE.md`'s "Module Registration — Verify DI Before Pushing" applies (you added a service constructor dep or changed module `imports`/`exports`/`providers`), run the AppModule DI smoke:

```bash
cd apps/api && DATABASE_URL=postgresql://x:x@localhost:5432/x \
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=fakefakefakefakefakefakefakefake \
JWT_REFRESH_SECRET=fakefakefakefakefakefakefakefake \
ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
MFA_ISSUER=test PLATFORM_DOMAIN=test.local APP_URL=http://localhost:3000 \
npx ts-node -e "
import { Test } from '@nestjs/testing';
import { AppModule } from './src/app.module';
Test.createTestingModule({ imports: [AppModule] }).compile()
  .then(() => { console.log('DI OK'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
"
```

Fix any failures before pushing.

## Step 6 · Commit on your impl branch

Commit your work to the impl branch (NOT to main yet):

```bash
git add <specific files>
git commit -m "feat(reports): <implementation title>

<one-paragraph summary of what was built>

Implementation $ARGUMENTS of the reports rebuild.
See reports-rebuild/PLAN.md for context.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Conventional-commit prefix: `feat(reports):`, `fix(reports):`, `refactor(reports):`, `docs(reports):` — match the phase. Schema-only phases use `feat(prisma):`.

Multiple commits on the impl branch are fine — they all merge together at queue time.

## Step 7 · Self-CI on the impl branch

Push the impl branch (NOT main) and watch CI run against the branch in isolation:

```bash
git push --no-verify -u origin "$BRANCH"
gh run list --branch "$BRANCH" --limit 1
gh run watch --exit-status
```

CI runs the same gates against your branch as it would against main. Fix any failures with new commits on the same branch and re-push:

```bash
git push --no-verify origin "$BRANCH"
gh run watch --exit-status
```

Do this until self-CI is green. **Do not enter the queue with red self-CI.** The whole point of self-CI is to catch impl-specific failures in isolation, before they collide with main.

## Step 8 · Mark `ready-to-merge` and enter the queue (Rule 29)

Once self-CI is green, flip your row in §4 from `in-progress` to `ready-to-merge` and push the log update to your branch:

```bash
sed -i.bak 's/| '$ARGUMENTS'  | \(.*\) | `in-progress`/| '$ARGUMENTS'  | \1 | `ready-to-merge`/' \
  reports-rebuild/IMPLEMENTATION_LOG.md
rm -f reports-rebuild/IMPLEMENTATION_LOG.md.bak
git add reports-rebuild/IMPLEMENTATION_LOG.md
git commit -m "docs(reports): impl $ARGUMENTS — ready to merge"
git push --no-verify origin "$BRANCH"
```

Now poll the queue. The session may proceed to merge ONLY when:

1. All lower-numbered impls in the same wave are `completed`.
2. No impl currently holds the lock (no impl in `merging` or `verifying`).

```bash
WAVE_ROOT="$(git rev-parse --show-toplevel)"
LOG_TMP=$(mktemp)
while true; do
  git -C "$WAVE_ROOT" fetch origin main --quiet
  git -C "$WAVE_ROOT" show origin/main:reports-rebuild/IMPLEMENTATION_LOG.md > "$LOG_TMP"

  if "$WAVE_ROOT/scripts/wave-merge-queue.sh" check-clear "$LOG_TMP" "$ARGUMENTS"; then
    break
  fi
  sleep 180   # 3-minute poll
done
rm -f "$LOG_TMP"
```

The poll continues silently every 3 minutes. The user's screen will be quiet during this window — that's expected. If a poll iteration takes long enough that the user starts asking "what's happening?", check `gh run list` to see who currently holds the lock.

## Step 9 · Merge to main with exclusive lock (Rule 30)

Once the queue is clear, claim the lock by flipping to `merging`, then merge:

```bash
# 9a · Rebase one final time to incorporate everything that landed while waiting
git fetch origin main
git rebase origin/main
# Resolve any conflicts. For append-only files use:
#   git rebase --strategy=recursive -X theirs origin/main
# For real conflicts in service files, resolve by hand and re-run the gauntlet.
pnpm turbo run type-check --filter=@school/<affected>
pnpm turbo run lint --filter=@school/<affected>
pnpm turbo run test --filter=@school/<affected>

# 9b · Flip your row to `merging` and commit on this branch
sed -i.bak 's/| '$ARGUMENTS'  | \(.*\) | `ready-to-merge`/| '$ARGUMENTS'  | \1 | `merging`/' \
  reports-rebuild/IMPLEMENTATION_LOG.md
rm -f reports-rebuild/IMPLEMENTATION_LOG.md.bak
git add reports-rebuild/IMPLEMENTATION_LOG.md
git commit -m "docs(reports): impl $ARGUMENTS — entering merge queue"

# 9c · Push the impl branch with the merging-state log update first (this is your lock claim)
git push --no-verify origin "$BRANCH"

# 9d · Atomic fast-forward push to main
git push --no-verify origin "$BRANCH":main
```

If `9d` is rejected with `non-fast-forward`, someone else's merge raced in. Repeat from 9a.

If `9d` succeeds, you have written your changes — and your `merging` lock claim — to main atomically. Other sessions will see the lock on their next queue check.

## Step 10 · Watch CI and fix-forward freely (still in `merging`)

You hold exclusive write access to main until you flip to `completed`. Use it.

```bash
gh run watch --exit-status
```

If CI fails:

1. Read the failure: `gh run view <id> --log-failed`.
2. Fix in a new commit ON YOUR IMPL BRANCH (you're still in the worktree, still on `$BRANCH`).
3. Push to main directly (NOT through self-CI again — you hold the lock):

```bash
git fetch origin main
git rebase origin/main   # should be a no-op; you're the only writer
# fix the issue
git add <files>
git commit -m "fix(reports): impl $ARGUMENTS — <what>"
git push --no-verify origin "$BRANCH":main
gh run watch --exit-status
```

Repeat until CI is green AND the deploy job has run successfully.

If CI is flaky (infra-level, not a real regression), use `gh run rerun <id>`. Only treat a second green run as success.

**Server access is for diagnostics only.** SSH `root@46.62.244.139` may:

- Read PM2 logs: `sudo -u edupod pm2 logs api --lines 200`
- Inspect DB state: `sudo -u edupod bash -lc 'psql $DATABASE_URL'`
- Check object-storage buckets, file permissions, env-var presence

May NOT: `git pull`/`fetch`/`am`, run migrations, restart PM2, edit `.env`, write to `/opt/edupod/app`. All changes flow through pushed commits.

## Step 11 · Flip to `verifying` (Rule 31)

CI is green and the deploy job ran. Now flip your row from `merging` to `verifying`:

```bash
git fetch origin main
git rebase origin/main
sed -i.bak 's/| '$ARGUMENTS'  | \(.*\) | `merging`/| '$ARGUMENTS'  | \1 | `verifying`/' \
  reports-rebuild/IMPLEMENTATION_LOG.md
rm -f reports-rebuild/IMPLEMENTATION_LOG.md.bak
git add reports-rebuild/IMPLEMENTATION_LOG.md
git commit -m "docs(reports): impl $ARGUMENTS — entering verification"
git push --no-verify origin "$BRANCH":main
```

You still hold the lock. From here through `completed`, no other impl can begin its merge.

## Step 12 · Production verification (Rule 31)

Verification is non-negotiable. Run, in order:

### 12a · Health check

```bash
curl -s https://nhqs.edupod.app/api/health | jq .status   # expect "ok" or "degraded"
```

### 12b · Endpoint smoke (every backend impl)

For each new endpoint your impl shipped, hit it with `curl` AS `owner@nhqs.test` and confirm the response is real (not 404, not stub). Use the auth-refresh trick to grab a token:

```bash
TOKEN=$(curl -s -X POST https://nhqs.edupod.app/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@nhqs.test","password":"Password123!"}' \
  | jq -r '.data.access_token')

curl -s -H "Authorization: Bearer $TOKEN" \
  https://nhqs.edupod.app/api/v1/reports/<your-new-endpoint> | jq .
```

### 12c · SSH dist verification (every backend impl)

Confirm the new code is actually in the production dist (catches stale-cache deploys):

```bash
ssh root@46.62.244.139 \
  "sudo -u edupod grep -l '<a unique string from your impl>' \
     /opt/edupod/app/apps/api/dist/api/src/modules/reports/*.js"
```

### 12d · Worker verification (worker impls only)

```bash
ssh root@46.62.244.139 "sudo -u edupod pm2 logs worker --lines 200 --nostream" \
  | grep -E '<your-job-name>|Registered repeatable cron'
```

For cron jobs, wait one full tick to confirm it fires. The message you want is `[<HandlerName>] Tick complete` or similar.

### 12e · Schema verification (schema impls only)

```bash
ssh root@46.62.244.139 "sudo -u edupod bash -lc 'psql \$DATABASE_URL -c \"
  SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class WHERE relname IN ('your_new_table_1','your_new_table_2');\"'"
```

Both `relrowsecurity` AND `relforcerowsecurity` must be `t`.

### 12f · Playwright walkthrough (mandatory when any UI surface exists)

Per Rule 27b, claim the Playwright lock by appending a one-line claim to §5:

```
### [PLAYWRIGHT LOCK] — impl $ARGUMENTS (post-deploy)
- Holder: impl $ARGUMENTS verification — post-deploy smoke
- Started: <ISO timestamp> Europe/Dublin
- Until: released by closing the browser AND appending a follow-up release line
```

Commit + push the lock-claim log update to main (you still hold the merge lock from Rule 30, so this is safe).

Then drive the new pages end-to-end via the `mcp__plugin_playwright_playwright__*` tools:

1. `browser_navigate` to `https://nhqs.edupod.app/en/login`, log in as `owner@nhqs.test` / `Password123!`.
2. `browser_navigate` to each new page your impl shipped.
3. `browser_console_messages('error')` — must return 0 errors.
4. Exercise the primary flow: open modals, submit forms, navigate deep links.
5. For backend-only impls (no new UI): `browser_evaluate(async () => { /* fetch the new endpoint with bearer token */ })` — confirms the route works through the same auth chain the eventual UI will use.

After verification, `browser_close` and append the release line:

```
### [PLAYWRIGHT RELEASED] — impl $ARGUMENTS (post-deploy)
- Holder: impl $ARGUMENTS verification — post-deploy smoke
- Released: <ISO timestamp> Europe/Dublin
- Browser closed: yes
```

### 12g · Verification block in §5

Append a verification block to §5 alongside your completion record:

```markdown
### [IMPL $ARGUMENTS] — Post-deploy verification
- **Run:** <ISO start> → <ISO end> Europe/Dublin
- **Production deploy verified:** PM2 restart at <time>; dist file `<file>` contains `<unique string>`.
- **Endpoint smoke:**

  | Endpoint | Result | Evidence |
  | -------- | ------ | -------- |
  | `GET /v1/reports/...` | ✅ 200 | `{...real shape...}` |

- **Playwright smoke:**

  | Surface | Result | Evidence |
  | ------- | ------ | -------- |
  | `/en/reports/...` page load | ✅ | 0 console errors. Renders <key elements>. |
  | Create modal opens | ✅ | Dialog text confirms <expected fields>. |
```

If any verification step fails: do NOT flip to `completed`. Fix-forward in another commit (you still hold the lock), redeploy, re-verify. Only flip to `completed` when every step passes.

## Step 13 · Flip to `completed` and release the lock

```bash
git fetch origin main
git rebase origin/main
# Update wave-status row + append completion record + verification block in one commit
sed -i.bak "s/| $ARGUMENTS  | \\(.*\\) | \`verifying\`  | *|/| $ARGUMENTS  | \\1 | \`completed\`   | $(date -u +%Y-%m-%dT%H:%M)Z | \`$(git rev-parse --short HEAD)\` |/" \
  reports-rebuild/IMPLEMENTATION_LOG.md
rm -f reports-rebuild/IMPLEMENTATION_LOG.md.bak

# Append the completion record in §5 (use your editor or here-doc — don't use sed)
cat >> reports-rebuild/IMPLEMENTATION_LOG.md <<EOF

### [IMPL $ARGUMENTS] — <title>

- **Completed:** $(date -u +%Y-%m-%dT%H:%M) Europe/Dublin
- **Final SHA:** \`$(git rev-parse --short HEAD)\`
- **CI run:** <gh run URL>
- **Deployed to production:** yes
- **Summary (≤ 200 words):**
  <what was actually built — files, endpoints, services, key design
   decisions made during implementation that subsequent waves need
   to know about, any trade-offs or deviations from the plan>
- **Follow-ups:** <anything for later, with owner>
- **Rollback:** <exact \`git revert <sha>\` command + any manual DB rollback>
- **Session notes:** <optional — anything surprising>
EOF

git add reports-rebuild/IMPLEMENTATION_LOG.md
git commit -m "docs(reports): log completion of implementation $ARGUMENTS"
git push --no-verify origin "$BRANCH":main
```

The lock is released the moment this push lands. The next impl in the queue (lowest-numbered `ready-to-merge` row) is now clear to enter step 9.

## Step 14 · Cleanup

Tear down the worktree and delete the impl branch:

```bash
WAVE_ROOT="$(git rev-parse --show-toplevel)"
cd "$WAVE_ROOT"   # leave the worktree directory
git worktree remove --force "$WAVE_ROOT/.worktrees/impl-$ARGUMENTS"
git branch -D "$BRANCH"
git push origin --delete "$BRANCH" 2>/dev/null || true   # remote branch (ignore if already gone)
```

## Step 15 · Report to the user

Final message to the user:

- ✅ Implementation $ARGUMENTS completed.
- Final SHA: `<sha>`.
- CI run: `<url>`.
- Deployed + verified in production.
- Verification: <one line — "Playwright on /reports/X confirmed N pages render with 0 console errors; new endpoint returns 200 with the expected shape">.
- Next suggested impl: `<next number>` (or, if multiple parallel siblings remain, list which are clear to start).
- Anything the user should know before running the next one (new env var, permission grant, admin action).

Keep it tight. The user can read the full record + verification block in the log.

---

## Rules you must never break

1. **All merges and deploys go through GitHub CI.** No direct rsync, no `git am` on the server, no manual `pm2 restart`. SSH is diagnostic-only.
2. **Never skip prerequisite checks.** If something says `pending`, it's pending.
3. **Never amend a pushed commit.** If CI fails, fix in a new commit and push again.
4. **Never skip the local gauntlet OR self-CI.** Type-check + lint + test + (if DI-relevant) AppModule smoke locally. Then self-CI on your impl branch. Only THEN enter the queue. A red push to main wastes everyone's time.
5. **Never skip the queue check.** `scripts/wave-merge-queue.sh check-clear` is the only path to entering `merging`. The check is atomic; trust it.
6. **Never push to main without holding the lock.** If your row is not `merging` or `verifying`, you do not push to main. Period.
7. **Never flip to `completed` without verification.** Rule 31 is non-negotiable. curl + (when possible) Playwright. The verification block is part of the completion record.
8. **Never skip the log update.** Every state transition (`pending → in-progress → ready-to-merge → merging → verifying → completed`) gets a commit. The log is the only coordination mechanism for the queue.
9. **Never work around missing context.** If the implementation file is unclear or contradicts the plan, STOP and ask the user.
10. **Never mark `completed` if it didn't actually ship.** Failed verification → flip to `🛑 blocked` with what you tried and what you need.
11. **Never flip an AI feature on by default.** Every `tenant_ai_flags` entry for reports seeds `enabled = false`. Tenants opt in.
12. **Never bypass the query engine for builder execution.** Every saved/preview/scheduled report query goes through `QueryEngineService`.
13. **Never delete or recreate someone else's worktree.** `.worktrees/impl-<n>/` belongs to the impl that created it. Use your own subdirectory.
14. **Never make an executive decision (Rule 33) that loses the user's prior explicit choice or expands scope.** Those escalate to the user. Everything else is yours to call, document, and verify.
