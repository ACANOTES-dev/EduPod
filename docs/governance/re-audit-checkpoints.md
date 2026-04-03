# Re-Audit Checkpoints

> Last updated: 2026-04-01
> Audit method: rerun the static health audit workflow from `.claude/commands/audit2.md` or its active successor, then commit the dated artifacts under `docs/audits/claude/`.

## Required checkpoints

| Checkpoint                 | Trigger                                                                                                   | Required before running                                                                                                                                        | Required outputs                                                                                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Wave 1 static re-audit     | The Wave 1 exit gate in `docs/plans/HEALTH-RECOVERY-MASTERPLAN.md` is satisfied.                          | Updated backlog statuses, current scorecard, green `type-check`, `lint`, and `test` evidence.                                                                  | New dated audit artifacts, scorecard refresh, backlog refresh, follow-up risk deltas.                                |
| Wave 3 static re-audit     | The Wave 3 exit gate is satisfied and the Wave 1 re-audit has already been recorded.                      | Updated hotspot and direct-foreign-read counts, refreshed scorecard, green verification gates.                                                                 | New dated audit artifacts, scorecard refresh, backlog refresh, architecture follow-up notes.                         |
| Final independent re-audit | All `NOW` and `NEXT` backlog items are verified closed and the team is preparing to lift the health gate. | Every `NOW` and `NEXT` item is `retired` with regression proof, current scorecard published, architecture docs and runbooks aligned, green verification gates. | Independent audit report, final scorecard, explicit gate-lift decision, any remaining `LATER` risks carried forward. |

## Independence rule for the final pass

The final re-audit must be independent of the closing implementation work. Use one of these approaches:

- a reviewer or model pass that did not author the closing changes
- a fresh audit run from the static audit workflow with no reliance on previous draft findings

## Hard gate

Do not run the final independent re-audit early. If any `NOW` or `NEXT` item is still open, in progress, or waiting for verification, the final re-audit is not ready to start.
