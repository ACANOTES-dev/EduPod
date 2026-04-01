# Health Recovery Backlog

> Source of truth: [Audit-Claude/risk-ledger_2026-04-01_02-39-37.md](../../Audit-Claude/risk-ledger_2026-04-01_02-39-37.md)
> Last updated: 2026-04-01
> Owner model: Ram owns delivery; do not mark any item retired without the evidence listed in this file.

## Operating rules

- `status` stays `open` until implementation, verification, and follow-up docs are all complete.
- `retired` is allowed only when the evidence column is fully satisfied and linked from the closing commit or report.
- `NOW` items are the active backlog. `NEXT` items can be prepared but must not displace `NOW`. `LATER` items stay parked until capacity opens.
- Due dates use the current health program checkpoints:
  - `2026-04-15` for critical `NOW` risks
  - `2026-04-30` for high/medium `NOW` risks
  - `2026-05-31` for `NEXT` risks
  - `2026-07-31` for `LATER` risks

## Tracked backlog

| Risk      | Domain          | Severity | Priority | Owner | Due date   | Retirement plan                                                              | Evidence required                                                             | Status |
| --------- | --------------- | -------- | -------- | ----- | ---------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------ |
| `AUD-001` | Ops             | Critical | NOW      | Ram   | 2026-04-15 | Gate deploy on CI success and prevent direct unverified release paths.       | Workflow diff, green CI run, documented deploy gate.                          | open   |
| `AUD-002` | Ops             | High     | NOW      | Ram   | 2026-04-30 | Add automated rollback on smoke-test failure and verify restart path.        | Deploy workflow diff, rollback proof, runbook alignment.                      | open   |
| `AUD-003` | Reliability     | High     | NOW      | Ram   | 2026-04-30 | Add worker Sentry bootstrap plus health visibility.                          | Worker bootstrap diff, verification notes, alert path documented.             | open   |
| `AUD-004` | Tests           | High     | NOW      | Ram   | 2026-04-30 | Add safeguarding, imports, and admissions tests in risk order.               | New/updated specs, green test run, coverage note in closing report.           | open   |
| `AUD-005` | Tests           | High     | NEXT     | Ram   | 2026-05-31 | Add functional frontend coverage for critical user journeys.                 | Playwright or equivalent flow coverage, green CI evidence.                    | open   |
| `AUD-006` | Tests           | High     | NOW      | Ram   | 2026-04-30 | Turn on coverage collection and ratcheting rules.                            | Jest config diff, coverage output, threshold policy committed.                | open   |
| `AUD-007` | Security/Tests  | High     | NOW      | Ram   | 2026-04-30 | Bring RLS integration tests into CI or replace with reliable smoke coverage. | CI diff, green run, documented RLS coverage inventory.                        | open   |
| `AUD-008` | Ops             | High     | NOW      | Ram   | 2026-04-30 | Replicate backups off the primary server and update restore docs.            | Infra/config proof, restore drill notes, runbook update.                      | open   |
| `AUD-009` | Code Quality    | High     | NEXT     | Ram   | 2026-05-31 | Remove empty catches and add a guardrail that blocks new ones.               | Code diff, lint or static rule, regression proof in CI.                       | open   |
| `AUD-010` | Tests           | High     | NEXT     | Ram   | 2026-05-31 | Add worker specs for the highest-risk processors first.                      | New specs, green worker test run, prioritisation note.                        | open   |
| `AUD-011` | Architecture    | Medium   | NEXT     | Ram   | 2026-05-31 | Break BehaviourModule into smaller bounded modules with narrower exports.    | Architecture plan, code diff, updated blast-radius docs.                      | open   |
| `AUD-012` | Reliability     | Medium   | NOW      | Ram   | 2026-04-30 | Replace the worker health stub with real dependency checks.                  | Health diff, verification output, docs update if probe contract changes.      | open   |
| `AUD-013` | Security        | Medium   | NOW      | Ram   | 2026-04-30 | Add `FORCE ROW LEVEL SECURITY` for `attendance_pattern_alerts`.              | Migration diff, policy verification, green tests.                             | open   |
| `AUD-014` | Security        | Medium   | NEXT     | Ram   | 2026-05-31 | Add global API rate limiting with documented exceptions.                     | Config diff, tests, release note for rate-limit behaviour.                    | open   |
| `AUD-015` | Ops/Reliability | Medium   | NOW      | Ram   | 2026-04-30 | Add worker shutdown hooks and verify graceful stop during deploy.            | Bootstrap diff, restart test notes, runbook alignment.                        | open   |
| `AUD-016` | Reliability     | Medium   | NEXT     | Ram   | 2026-05-31 | Add explicit transition maps for implicit state machines.                    | Shared/state-machine diff, blocked-transition tests, docs update.             | open   |
| `AUD-017` | Ops             | Medium   | NEXT     | Ram   | 2026-05-31 | Introduce central log aggregation or equivalent searchable log path.         | Infra/docs proof, alert routing note, operating runbook update.               | open   |
| `AUD-018` | Code Quality    | Medium   | LATER    | Ram   | 2026-07-31 | Standardise new/touched forms on `react-hook-form` with Zod.                 | Form migrations, lint/type/test proof, usage guidance updated.                | open   |
| `AUD-019` | Ops             | Medium   | NEXT     | Ram   | 2026-05-31 | Make deploy concurrency safe or move to an atomic deployment model.          | Workflow diff, failure-mode note, deploy verification evidence.               | open   |
| `AUD-020` | Reliability     | Medium   | NOW      | Ram   | 2026-04-30 | Merge pastoral concern sharing into one safe transaction.                    | Service diff, regression tests, closing note on race removal.                 | open   |
| `AUD-021` | Reliability     | Medium   | NEXT     | Ram   | 2026-05-31 | Reduce the safeguarding escalation crash window and re-verify alerting.      | Processor/job diff, failure-mode tests, danger-zone update if needed.         | open   |
| `AUD-022` | Reliability     | Medium   | NEXT     | Ram   | 2026-05-31 | Expand BullMQ health coverage beyond the notifications queue.                | Health diff, verification output, queue inventory note.                       | open   |
| `AUD-023` | Code Quality    | Medium   | LATER    | Ram   | 2026-07-31 | Audit newer pages for i18n gaps and fix hardcoded English.                   | i18n diffs, locale verification, review notes.                                | open   |
| `AUD-024` | Code Quality    | Medium   | LATER    | Ram   | 2026-07-31 | Extract the duplicated login flow into a shared helper.                      | Refactor diff, auth regression tests, spot-check notes.                       | open   |
| `AUD-025` | Security        | Low      | NEXT     | Ram   | 2026-05-31 | Consolidate the RLS policy catalogue into one canonical source.              | Policy/doc diff, verification script or notes, architecture update if needed. | open   |
| `AUD-026` | Architecture    | Low      | LATER    | Ram   | 2026-07-31 | Introduce shared-package subpath exports with a controlled migration path.   | Package diff, build verification, migration note.                             | open   |
| `AUD-027` | Ops             | Low      | LATER    | Ram   | 2026-07-31 | Commit PM2 config to the repo and document the runtime contract.             | Config file, runbook update, verification note.                               | open   |
| `AUD-028` | Tests           | Low      | LATER    | Ram   | 2026-07-31 | Run Playwright E2E in CI or a dedicated automated lane.                      | Workflow diff, green run, CI cadence noted.                                   | open   |

## High-risk retirement guard

Every `Critical` or `High` item must keep all four fields populated before it can move to `retired`:

- a named owner
- a calendar due date
- a concrete retirement plan
- explicit regression or verification evidence
