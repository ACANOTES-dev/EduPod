# Quarterly Backup Restore Drill Checklist

---

## Drill Information

| Field | Value |
|---|---|
| **Drill Date** | __________________ |
| **DBA / Operator** | __________________ |
| **Engineering Lead** | __________________ |
| **Production Instance** | school-prod |
| **Snapshot ID** | __________________ |
| **Restored Instance** | __________________ |
| **Drill Log File** | __________________ |

---

## Pre-Drill

- [ ] AWS credentials are valid and have sufficient permissions
- [ ] Production instance is in `available` state
- [ ] Latest restorable time is within the last 10 minutes (PITR is current)
- [ ] No active deployments or migrations in progress
- [ ] Drill scheduled during a low-traffic window

**Latest restorable time**: __________________

---

## Snapshot Creation

- [ ] Manual snapshot created successfully
- [ ] Snapshot status is `available`

**Snapshot size**: __________ GB
**Snapshot creation time**: __________________

---

## Instance Restore

- [ ] Restored instance is in `available` state
- [ ] Restored instance endpoint is reachable

**Restore start time**: __________________
**Restore complete time**: __________________
**Total restore duration**: __________ minutes

---

## Data Verification

### Row Counts

Compare against expected production counts (obtain from production before the drill):

| Table | Production Count | Restored Count | Match? |
|---|---|---|---|
| tenants | ________ | ________ | [ ] |
| users | ________ | ________ | [ ] |
| tenant_memberships | ________ | ________ | [ ] |
| students | ________ | ________ | [ ] |
| staff_profiles | ________ | ________ | [ ] |
| invoices | ________ | ________ | [ ] |
| payments | ________ | ________ | [ ] |
| payroll_runs | ________ | ________ | [ ] |

### RLS Verification

- [ ] All tenant-scoped tables have `rowsecurity = true`
- [ ] No tenant-scoped tables are missing RLS policies
- [ ] Policy names match expected naming convention (`idx_*` or `rls_*`)

**Number of RLS policies found**: __________
**Tables missing RLS (should be 0)**: __________

### Triggers and Functions

- [ ] All trigger functions are present
- [ ] Triggers are attached to the correct tables

**Number of triggers found**: __________

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

**Latest migration name**: __________________
**Latest migration date**: __________________

---

## Application Connectivity (Optional)

If testing application connectivity against the restored instance:

- [ ] API service can connect to the restored database
- [ ] Health endpoint returns `ok`
- [ ] Login works for both tenant users
- [ ] RLS isolation verified (Tenant A cannot see Tenant B data)

---

## Post-Drill Cleanup

- [ ] Restored instance deleted (or scheduled for deletion)
- [ ] Drill snapshot deleted (or retained if needed)
- [ ] No orphaned resources remaining

---

## Drill Assessment

**Overall Result**: [ ] PASS / [ ] FAIL

**Issues Found**:

_____________________________________________________________________________

_____________________________________________________________________________

_____________________________________________________________________________

**Action Items**:

| # | Action | Owner | Due Date |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |

---

## Sign-Off

| Role | Name | Signature | Date |
|---|---|---|---|
| DBA / Operator | __________________ | __________________ | ________ |
| Engineering Lead | __________________ | __________________ | ________ |

---

**File this completed checklist in**: `docs/drill-results/drill-YYYY-MM-DD.md`
