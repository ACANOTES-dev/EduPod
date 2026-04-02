# Recovery Drill Runbook

Last updated: 2026-04-01

---

## Overview

Operational readiness depends on proving that backups and rollback procedures still work in practice, not just in theory. This runbook defines the cadence, evidence, and minimum recording requirements for restore and rollback drills.

Use this together with:

- [backup-restore.md](./backup-restore.md)
- [rollback.md](./rollback.md)
- [backup-drill-checklist.md](../../scripts/backup-drill-checklist.md)
- [rollback-drill-checklist.md](../../scripts/rollback-drill-checklist.md)

---

## Drill Cadence

Run the following on a recurring basis:

- monthly: restore the latest verified off-site backup into a temporary drill environment
- quarterly: perform a full backup restore drill using the current backup/restore runbook
- quarterly: perform an application rollback drill using the rollback runbook
- after any real production rollback or recovery event: record the actual timings and outcomes using the same evidence fields

Do not treat a skipped month or quarter as paperwork debt. Treat it as an ops gap that must be raised in the next weekly review.

---

## Required Evidence

Every drill must capture:

- drill date and operator
- scenario being tested
- source backup file or rollback target commit
- declared target RTO for the exercise
- expected RPO for the exercise
- start time, end time, and achieved recovery duration
- observed RPO based on the restored backup timestamp or rollback state
- validation steps completed
- issues found, owner, and due date

Minimum terminology:

- `RTO`: how long it took to recover the service or drill target
- `RPO`: how much data freshness was lost relative to the desired restore point

---

## Restore Drill Rules

For restore drills:

1. prefer the newest verified off-site backup for the monthly exercise
2. use the checklist in [backup-drill-checklist.md](../../scripts/backup-drill-checklist.md)
3. record the backup timestamp so the observed RPO can be calculated
4. run the verification queries from the backup/restore runbook
5. record whether the achieved RTO stayed within the declared target

---

## Rollback Drill Rules

For rollback drills:

1. choose a recent deployment scenario with a clearly known-good rollback target SHA
2. use the checklist in [rollback-drill-checklist.md](../../scripts/rollback-drill-checklist.md)
3. time the rollback from decision point to restored healthy services
4. verify `/api/health/ready`, worker health, and tenant login availability
5. record whether a database restore would also have been required for the simulated incident

---

## Review and Follow-Up

Every drill produces one of three outcomes:

- `PASS`: recovery completed and validations passed within the declared target
- `PASS WITH ACTIONS`: recovery completed, but issues or avoidable delays were found
- `FAIL`: recovery did not complete or validation failed

Any `PASS WITH ACTIONS` or `FAIL` outcome must be reviewed in the next weekly ops review and tracked until remediated.

---

## Related Documents

- See also: [restore-drill.md](./restore-drill.md) for step-by-step restore procedure
- See also: [migration-safety.md](./migration-safety.md) for schema change and rollback decision tree
