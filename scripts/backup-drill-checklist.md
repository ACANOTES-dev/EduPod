# Backup Restore Drill Checklist

---

## Drill Information

| Field                   | Value                        |
| ----------------------- | ---------------------------- |
| **Drill Date**          | **\*\*\*\***\_\_**\*\*\*\*** |
| **DBA / Operator**      | **\*\*\*\***\_\_**\*\*\*\*** |
| **Engineering Lead**    | **\*\*\*\***\_\_**\*\*\*\*** |
| **Source Backup File**  | **\*\*\*\***\_\_**\*\*\*\*** |
| **Source Backup Size**  | **\*\*\*\***\_\_**\*\*\*\*** |
| **Backup Timestamp**    | **\*\*\*\***\_\_**\*\*\*\*** |
| **Restore Container**   | **\*\*\*\***\_\_**\*\*\*\*** |
| **Restore Volume**      | **\*\*\*\***\_\_**\*\*\*\*** |
| **Drill Log File**      | **\*\*\*\***\_\_**\*\*\*\*** |
| **Declared Target RTO** | **\*\*\*\***\_\_**\*\*\*\*** |
| **Expected RPO**        | **\*\*\*\***\_\_**\*\*\*\*** |

---

## Pre-Drill

- [ ] Latest `.dump` backup file is available and readable
- [ ] Docker is installed on the drill host
- [ ] `pg_restore`, `pg_isready`, and `psql` are installed
- [ ] No active deployments or migrations in progress
- [ ] Drill scheduled during a low-traffic window

**Backup file path**: **\*\*\*\***\_\_**\*\*\*\***

---

## Backup Selection

- [ ] Selected backup is the intended drill source
- [ ] Backup file size looks reasonable for recent production volume

**Backup source**: [ ] local pre-deploy dump / [ ] downloaded off-site copy
**Backup age**: **\*\*\*\***\_\_**\*\*\*\***

---

## Restore Target

- [ ] Temporary PostgreSQL container started successfully
- [ ] Restore endpoint is reachable on the configured drill port
- [ ] Restore finished without `pg_restore` errors

**Restore start time**: **\*\*\*\***\_\_**\*\*\*\***
**Restore complete time**: **\*\*\*\***\_\_**\*\*\*\***
**Validation complete time**: **\*\*\*\***\_\_**\*\*\*\***
**Achieved recovery duration**: \***\*\_\_\*\*** minutes
**Observed RPO**: **\*\*\*\***\_\_**\*\*\*\***

---

## Data Verification

### Row Counts

Compare against expected production counts (obtain from production before the drill):

| Table              | Production Count | Restored Count | Match? |
| ------------------ | ---------------- | -------------- | ------ |
| tenants            | **\_\_\_\_**     | **\_\_\_\_**   | [ ]    |
| users              | **\_\_\_\_**     | **\_\_\_\_**   | [ ]    |
| tenant_memberships | **\_\_\_\_**     | **\_\_\_\_**   | [ ]    |
| students           | **\_\_\_\_**     | **\_\_\_\_**   | [ ]    |
| staff_profiles     | **\_\_\_\_**     | **\_\_\_\_**   | [ ]    |
| invoices           | **\_\_\_\_**     | **\_\_\_\_**   | [ ]    |
| payments           | **\_\_\_\_**     | **\_\_\_\_**   | [ ]    |
| payroll_runs       | **\_\_\_\_**     | **\_\_\_\_**   | [ ]    |

### RLS Verification

- [ ] All tenant-scoped tables have `rowsecurity = true`
- [ ] No tenant-scoped tables are missing RLS policies
- [ ] Policy names follow the expected tenant isolation naming pattern

**Number of RLS policies found**: \***\*\_\_\*\***
**Tables missing RLS (should be 0)**: \***\*\_\_\*\***

### Triggers and Functions

- [ ] All trigger functions are present
- [ ] Triggers are attached to the correct tables

**Number of triggers found**: \***\*\_\_\*\***

### Extensions

- [ ] `citext` extension is installed
- [ ] `btree_gist` extension is installed
- [ ] `uuid-ossp` extension is installed

### Sequences

- [ ] Tenant sequence counters match production values
- [ ] Sequence prefixes are correct (receipt, invoice, application, payslip)

### Migration History

- [ ] Migration history is intact
- [ ] Latest migration matches the current production migration

**Latest migration name**: **\*\*\*\***\_\_**\*\*\*\***
**Latest migration date**: **\*\*\*\***\_\_**\*\*\*\***

---

## Application Connectivity (Optional)

If testing application connectivity against the restored instance:

- [ ] API service can connect to the restored database
- [ ] Health endpoint returns `ok`
- [ ] Login works for both tenant users
- [ ] RLS isolation verified (Tenant A cannot see Tenant B data)

---

## Post-Drill Cleanup

- [ ] Restore container deleted (or intentionally retained for extended checks)
- [ ] Restore Docker volume deleted (or intentionally retained for extended checks)
- [ ] No orphaned resources remaining

---

## Drill Assessment

**Overall Result**: [ ] PASS / [ ] PASS WITH ACTIONS / [ ] FAIL

**Did the achieved recovery duration stay within the declared RTO?**: [ ] Yes / [ ] No

**Issues Found**:

---

---

---

**Action Items**:

| #   | Action | Owner | Due Date |
| --- | ------ | ----- | -------- |
| 1   |        |       |          |
| 2   |        |       |          |
| 3   |        |       |          |

---

## Sign-Off

| Role             | Name                         | Signature                    | Date         |
| ---------------- | ---------------------------- | ---------------------------- | ------------ |
| DBA / Operator   | **\*\*\*\***\_\_**\*\*\*\*** | **\*\*\*\***\_\_**\*\*\*\*** | **\_\_\_\_** |
| Engineering Lead | **\*\*\*\***\_\_**\*\*\*\*** | **\*\*\*\***\_\_**\*\*\*\*** | **\_\_\_\_** |

---

**Store this completed checklist with**: the weekly ops review record, quarterly ops record, or the incident notes for the drill

---

## Related Documents

- See also: [docs/runbooks/restore-drill.md](../docs/runbooks/restore-drill.md) for step-by-step restore procedure
- See also: [docs/runbooks/backup-restore.md](../docs/runbooks/backup-restore.md) for full backup and restore runbook
- See also: [docs/runbooks/recovery-drills.md](../docs/runbooks/recovery-drills.md) for drill cadence and evidence requirements
