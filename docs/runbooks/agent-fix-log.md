# Agent fix log

Append-only audit log of every autonomous Sentry triage performed by an AI agent (Claude Code, GPT, Cursor, etc.) under `docs/runbooks/agent-sentry-triage.md`.

- **Newest entries at the bottom.**
- **Never edit a past entry.** If an older fix turned out to be wrong, run its `Rollback` command, then append a new entry describing the revert.
- Each triage MUST produce exactly one entry here — a run without a log entry is counted as an incomplete triage.

---

## Entry template (copy for each new triage)

```markdown
## <ISO-start> → <ISO-end> — <SHORT_ID> — "<issue title>"

- **Issue URL:** https://edupod.sentry.io/issues/<numeric-id>/
- **Triggered by:** "<the user's exact trigger phrase, or 'alert email / cron'>"
- **Diagnosis:** <1–2 sentence root cause in plain English>
- **Files changed:**
  - `path/to/file.ts`
  - `path/to/other.ts`
- **Test added:** `path/to/file.spec.ts` — `"<test name that reproduces the bug>"`
- **Commit:** [`<sha>`](https://github.com/ACANOTES-dev/EduPod/commit/<sha>)
- **CI run:** <full github.com/ACANOTES-dev/EduPod/actions/runs/... URL>
- **Post-deploy verification:** <N> new events in 5 min since triage start (`<ISO>`)
- **Outcome:** `success` | `reverted` | `already-fixed` | `could-not-reproduce` | `failed-local-verification` | `failed-ci`
- **Rollback:** `git revert --no-edit <sha> && git push origin main`
- **Notes (optional):** anything a future maintainer should know (surprising interaction, deferred cleanup, related issue)

---
```

## Outcome values — definitions

| Value                       | Meaning                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `success`                   | Fix shipped, CI green, deploy green, 0 new events in 5 min post-deploy, issue resolved in Sentry.                               |
| `reverted`                  | Fix shipped, but > 0 new events arrived within 5 min post-deploy. Auto-revert commit was pushed. Sentry issue was NOT resolved. |
| `already-fixed`             | `check-if-fixed` showed 0 events in 24h. Issue resolved in Sentry with an explanatory comment. No code changes.                 |
| `could-not-reproduce`       | Agent could not produce a failing local test. No code changes. User asked to take over.                                         |
| `failed-local-verification` | Lint / type-check / test failed locally after 2 fix attempts. No commit pushed. User asked to take over.                        |
| `failed-ci`                 | 3 pushes in a row failed CI. Last good main SHA recorded. User asked to take over.                                              |

---

## Entries

_No autonomous triages have completed yet. The first `./scripts/sentry-cli.sh`-driven fix will append below._
