---
title: Sentry alert triage
description: Procedure for resolving Sentry alerts through the guarded repo-agent workflow.
alert_keys: [sentry.alert.fired, sentry.alert.regressed]
audit_actions: []
error_fingerprints: []
components: [api, worker]
severity: p2
tags: [sentry, triage, repo-agent]
---

# Agent runbook — autonomous Sentry triage

<!-- prompt-template-anchor -->

**Purpose.** When the user receives a Sentry alert and tells an AI agent to deal with it, this runbook drives the agent end-to-end: fetch → diagnose → fix → test → commit → deploy → verify → resolve → audit-log. No human-in-the-loop between trigger and close-out.

**Audience.** Any tool-using AI agent running on the user's laptop — Claude Code, GPT/Codex, Cursor, etc. The flow is bash + git + repo test commands only. No MCP dependency, no vendor SDK.

---

## When to use this runbook

The user triggers with an action verb + Sentry reference, e.g.:

- "fix the Sentry thing"
- "Sentry flagged X — can you sort it"
- "triage the Sentry alert"
- "there's a Sentry error about X — deal with it"
- "Sentry emailed me about X"

If the user only says "check Sentry" / "look at Sentry" / "what's in Sentry right now" without an action verb, that's a read-only inspection — run `./scripts/sentry-cli.sh list-unresolved` and report. Do NOT start this runbook.

---

## Prerequisites (verify once at session start)

Run these checks before taking any action. If any fail, STOP and report.

```bash
# 1. Token present and readable
[[ -r ~/.config/edupod/sentry-token ]] || { echo "missing token"; exit 1; }

# 2. Working tree clean
[[ "$(git status --porcelain | wc -l | tr -d ' ')" == "0" ]] || { echo "dirty tree"; exit 1; }

# 3. On main, synced with origin
git fetch --quiet origin main
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || { echo "HEAD != origin/main"; exit 1; }

# 4. Token actually authenticates
./scripts/sentry-cli.sh whoami >/dev/null || { echo "sentry auth failed"; exit 1; }
```

---

## The flow (10 steps — do not skip any)

### Step 1 — Record triage start time

```bash
TRIAGE_START_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "triage started: $TRIAGE_START_ISO"
```

Capture the start time for the audit log.

### Step 2 — Fetch issue context

If the user gave an issue URL or short ID (e.g. `NODE-NESTJS-42`):

```bash
ISSUE_ID="NODE-NESTJS-42"
./scripts/sentry-cli.sh get-issue "$ISSUE_ID"
```

If the user said "whatever's open" or "the latest":

```bash
./scripts/sentry-cli.sh list-unresolved --limit 5
```

Then pick the issue. Prefer: (a) the one named in the email/message if any, (b) the highest-severity × event-count, (c) ask the user.

**Capture:** stack trace, culprit, `tenant_id` tag, `url` tag, `environment` tag, last 10 breadcrumbs, `lastRelease` if any. You'll need these for the audit log and for locating the bug.

### Step 3 — Check if already fixed

```bash
./scripts/sentry-cli.sh check-if-fixed "$ISSUE_ID"
```

Exit code semantics:

| Exit | Meaning                             | Action                                                                                                      |
| ---- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 0    | No events in 24h                    | Likely already fixed. Skip to Step 9 with outcome `already-fixed`. Resolve with a comment explaining + log. |
| 1    | Quiet last hour, some events in 24h | Intermittent. Proceed — but if you can't reproduce locally in Step 4, log and stop rather than guess.       |
| 2    | Actively firing                     | Proceed.                                                                                                    |

### Step 4 — Write a FAILING test first

**This is a hard rule. No fix before a reproduction.**

1. Open the files named in the stack trace. Read the 10 lines above and below each frame. Read the actual code — do not speculate from the error message alone.
2. Find the closest existing `.spec.ts` near the buggy code. If none exists, create one matching the kebab-case filename convention.
3. Add a test case that reproduces the error exactly. Match the error message and stack shape.
4. Run ONLY that test and confirm it fails with the same error:

   ```bash
   pnpm turbo test --filter=<affected-package> -- --testPathPattern=<test-file>
   ```

5. **If you cannot reproduce the error locally, STOP.** Do not guess a fix. Record diagnosis findings in the audit log with outcome `could-not-reproduce` and report to the user.

### Step 5 — Implement the fix (ONE change, root cause)

Address the root cause, not the symptom. ONE logical change.

**Hard STOPs — if ANY are true, do NOT proceed. Ask the user.**

| Condition                                                                                | Why it's a STOP                          |
| ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| Diff > 100 lines changed                                                                 | Architectural change, needs human review |
| Touches `packages/prisma/schema.prisma` or any migration                                 | Schema changes are irreversible in prod  |
| Touches `ecosystem.config.cjs`, `deploy-production.sh`, or any `.github/workflows/*.yml` | Deploy config changes need a human       |
| You're disabling a test (`.skip`, `xdescribe`, `xit`, commenting out)                    | Never hide tests to pass CI              |
| You're adding `any`, `@ts-ignore`, or `as unknown as X`                                  | Violates TypeScript strict rules         |
| You're touching `.env` / secrets / `SENTRY_*` config                                     | Secret rotation is never autonomous      |
| The fix touches > 3 different modules                                                    | Cross-cutting change, needs human review |

### Step 6 — Verify locally (lint + type-check + test)

```bash
pnpm turbo lint type-check test --filter=<affected-packages>
```

All three MUST pass. **Never push red to main.** If any fails:

- Read the specific failure, fix it, re-run.
- If after 2 fix attempts it still fails, STOP. Something is wrong with your understanding of the codebase. Log outcome `failed-local-verification` and report to the user.

### Step 7 — Commit and push to main

```bash
git add <changed-files>
git commit -m "fix(<module>): <short description> (sentry: $ISSUE_ID)"
COMMIT_SHA="$(git rev-parse HEAD)"
git push origin main
echo "pushed: $COMMIT_SHA"
```

Commit message convention: conventional-commits, `fix(<module>)` for bug fixes, include `(sentry: <SHORT_ID>)` suffix so `git log --grep` finds every Sentry-driven fix.

### Step 8 — Watch CI + deploy

```bash
gh run watch
CI_RUN_URL="$(gh run list --limit 1 --json url -q '.[0].url')"
echo "CI: $CI_RUN_URL"
```

If CI fails:

1. `gh run view --log-failed` — read actual failure
2. Fix the issue, push again (another `fix(...)` commit, not `--amend`)
3. Max 3 total pushes. If still failing, STOP. Log outcome `failed-ci` and report.

If deploy step fails specifically (CI green but deploy red):

1. Read `docs/runbooks/deployment.md` and `docs/architecture/server-infrastructure.md` for recovery
2. Do NOT SSH into the server autonomously — ask the user

### Step 9 — Post-deploy verification

Wait 5 minutes after the deploy step completes, then count new events:

```bash
DEPLOY_VERIFIED_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
sleep 300  # or wait actively for 5 minutes of real production traffic
SINCE_ISO="$TRIAGE_START_ISO"
NEW_EVENTS="$(./scripts/sentry-cli.sh new-events-since "$ISSUE_ID" "$SINCE_ISO")"
echo "new events since triage start: $NEW_EVENTS"
```

**Decision:**

- `NEW_EVENTS == 0` → fix verified. Proceed to resolve.
- `NEW_EVENTS > 0` → **AUTO-REVERT**:
  ```bash
  git revert --no-edit "$COMMIT_SHA"
  git push origin main
  gh run watch
  ```
  Then log outcome as `reverted` with the event count. Do NOT resolve the Sentry issue. Stop.

### Step 10 — Resolve in Sentry + APPEND to fix log (MANDATORY)

**If Step 9 verified (NEW_EVENTS == 0):**

```bash
./scripts/sentry-cli.sh resolve "$ISSUE_ID" --comment \
  "Fixed by $COMMIT_SHA on main. CI run: $CI_RUN_URL. Audit log: docs/runbooks/agent-fix-log.md. 0 new events in 5 min post-deploy."
```

**Then append to `docs/runbooks/agent-fix-log.md` using the template at the top of that file.** A triage is NOT complete without this entry. The entry must include:

- Triage start + end ISO timestamps
- Sentry issue ID, title, permalink
- Trigger (what the user said)
- Diagnosis (1–2 sentence root cause)
- Files changed
- Test added
- Commit SHA + GitHub commit URL
- CI run URL
- Post-deploy verification result (exact `NEW_EVENTS` count)
- Outcome: `success` | `reverted` | `already-fixed` | `could-not-reproduce` | `failed-local-verification` | `failed-ci`
- Rollback command (even on success — user needs this if they later decide to revert)

Then commit the log:

```bash
git add docs/runbooks/agent-fix-log.md
git commit -m "chore(agent-log): append $ISSUE_ID triage"
git push origin main
```

Report back to the user: one sentence on outcome + link to the log entry.

---

## Guardrails (recap — STOP conditions)

| Trigger                                                     | Action                                      |
| ----------------------------------------------------------- | ------------------------------------------- |
| Can't reproduce locally                                     | STOP, log `could-not-reproduce`, report     |
| Diff > 100 lines                                            | STOP, ask user                              |
| Touches schema / migrations / deploy config / secrets       | STOP, ask user                              |
| Disables a test                                             | STOP, ask user                              |
| Adds `any` / `@ts-ignore` / `as unknown as X`               | STOP, ask user                              |
| Lint / type-check / test fails locally after 2 fix attempts | STOP, log `failed-local-verification`       |
| CI fails 3 pushes in a row                                  | STOP, log `failed-ci`                       |
| Deploy step fails (CI green, deploy red)                    | STOP, do NOT SSH, ask user                  |
| > 0 new events within 5 min post-deploy                     | AUTO-REVERT, log `reverted`, do NOT resolve |
| Would skip Step 10 (audit log)                              | Triage is incomplete — must append          |

---

## Rollback

Every entry in `docs/runbooks/agent-fix-log.md` contains an exact rollback command. To undo any agent fix:

```bash
cd /Users/ram/Desktop/SDB
git revert --no-edit <commit-sha-from-log>
git push origin main
gh run watch
```

Then re-open the Sentry issue in the web UI (the agent's earlier `resolve` was based on the assumption the fix was correct).

---

## Why this design

- **Vendor-neutral.** Every action is bash + git + `gh` + `pnpm turbo` + this script. Swap Claude Code for GPT / Cursor / Codex; the runbook still applies verbatim.
- **Auditable.** Every command is visible in this document; every outcome is in `agent-fix-log.md`. No hidden agent state.
- **Failure-oriented.** Every step has a concrete STOP condition. The agent cannot rationalise itself past a guardrail.
- **Reversible.** Auto-revert on post-deploy regression. Rollback command in every log entry. Worst case is a revert commit — never a broken prod.
