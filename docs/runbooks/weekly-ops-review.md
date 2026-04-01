# Weekly Operational Review

Last updated: 2026-04-01

---

## Overview

Run one structured operational review every week. This is the recurring checkpoint for production health, deployment safety, backup evidence, and recovery readiness.

Recommended slot:

- once per week during the normal Ireland working week
- before any high-risk release window if the regular review has not yet happened

---

## Inputs

Review these sources every week:

- [monitoring.md](/Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/.worktrees/audit-ops/docs/runbooks/monitoring.md)
- [recovery-drills.md](/Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/.worktrees/audit-ops/docs/runbooks/recovery-drills.md)
- platform admin health dashboard at `/en/admin/health`
- UptimeRobot monitor history
- PM2 service status and recent deploy notifications
- latest backup replication and restore-drill evidence
- open incidents, failed deploys, or unresolved rollback actions

---

## Weekly Checklist

- [ ] `/api/health`, `/api/health/ready`, and worker health have stayed healthy or degraded only for understood reasons
- [ ] queue alerts, stuck jobs, PgBouncer pressure, and Redis memory pressure were reviewed
- [ ] any deploy failures, automatic rollbacks, or manual interventions were reviewed
- [ ] latest pre-deploy backup and latest off-site replication are present and recent
- [ ] monthly restore drill evidence is current
- [ ] quarterly full restore drill evidence is current
- [ ] quarterly rollback drill evidence is current
- [ ] open follow-up actions from previous drills or incidents still have owners and dates
- [ ] current disk headroom and connection-pool headroom are acceptable for the next release cycle

---

## Output Required

At the end of the weekly review, record:

- overall status: `green`, `watch`, or `action required`
- the top operational risks for the week
- any stale evidence or missed drill cadence
- action items with owner and due date
- whether production is clear for normal deploy cadence

If restore-drill or rollback-drill evidence is stale, the review outcome cannot be `green`.
