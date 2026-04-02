# Rollback Drill Checklist

---

## Drill Information

| Field                   | Value                        |
| ----------------------- | ---------------------------- |
| **Drill Date**          | **\*\*\*\***\_\_**\*\*\*\*** |
| **Operator**            | **\*\*\*\***\_\_**\*\*\*\*** |
| **Engineering Lead**    | **\*\*\*\***\_\_**\*\*\*\*** |
| **Scenario**            | **\*\*\*\***\_\_**\*\*\*\*** |
| **Current Deploy SHA**  | **\*\*\*\***\_\_**\*\*\*\*** |
| **Rollback Target SHA** | **\*\*\*\***\_\_**\*\*\*\*** |
| **Declared Target RTO** | **\*\*\*\***\_\_**\*\*\*\*** |
| **Expected RPO**        | **\*\*\*\***\_\_**\*\*\*\*** |
| **Drill Log / Notes**   | **\*\*\*\***\_\_**\*\*\*\*** |

---

## Pre-Drill

- [ ] Current release and rollback target were identified
- [ ] Latest pre-deploy dump exists in case a database restore becomes necessary
- [ ] No active migration or deploy is running
- [ ] Validation endpoints and test logins are available
- [ ] Rollback owner and verifier are assigned

---

## Rollback Execution Timing

| Field                          | Value                        |
| ------------------------------ | ---------------------------- |
| **Incident detected at**       | **\*\*\*\***\_\_**\*\*\*\*** |
| **Rollback decision at**       | **\*\*\*\***\_\_**\*\*\*\*** |
| **Rollback started at**        | **\*\*\*\***\_\_**\*\*\*\*** |
| **API healthy at**             | **\*\*\*\***\_\_**\*\*\*\*** |
| **Worker healthy at**          | **\*\*\*\***\_\_**\*\*\*\*** |
| **Validation complete at**     | **\*\*\*\***\_\_**\*\*\*\*** |
| **Achieved Recovery Duration** | **\*\*\*\***\_\_**\*\*\*\*** |
| **Observed RPO**               | **\*\*\*\***\_\_**\*\*\*\*** |

---

## Verification

- [ ] `api` process healthy after rollback
- [ ] `web` process healthy after rollback
- [ ] `worker` process healthy after rollback
- [ ] `/api/health/ready` returns healthy or understood degraded state
- [ ] worker health endpoint responds
- [ ] tenant login page loads
- [ ] at least one tenant login succeeds
- [ ] queue backlog is normal or understood
- [ ] no unexpected schema mismatch or migration issue was introduced

---

## Assessment

**Overall Result**: [ ] PASS / [ ] PASS WITH ACTIONS / [ ] FAIL

**Was database restore required for this scenario?**: [ ] No / [ ] Yes / [ ] Unclear

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

## Related Documents

- See also: [docs/runbooks/migration-safety.md](../docs/runbooks/migration-safety.md) for rollback decision tree and schema change protocols
- See also: [docs/runbooks/rollback.md](../docs/runbooks/rollback.md) for full rollback runbook
- See also: [docs/runbooks/recovery-drills.md](../docs/runbooks/recovery-drills.md) for drill cadence and evidence requirements
