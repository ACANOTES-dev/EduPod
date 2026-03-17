# Incident Response Runbook

Last updated: 2026-03-16

---

## Overview

This runbook defines how the team classifies, responds to, and resolves production incidents for the School Operating System. It covers severity classification, escalation paths, specific response procedures for critical scenarios (RLS breaches, data loss, service outages), and post-incident review.

---

## Severity Classification

| Severity | Definition | Response Time | Examples |
|---|---|---|---|
| **P1 -- Critical** | Service fully down, data breach, or RLS violation | 15 minutes | Complete outage, cross-tenant data exposure, database unreachable |
| **P2 -- Major** | Core feature broken for all tenants, payment processing failure | 1 hour | Login broken, Stripe webhook failures, payroll finalisation broken |
| **P3 -- Minor** | Feature broken for a single tenant, UI regression, degraded performance | 4 hours | One school cannot access attendance, PDF rendering broken for Arabic locale |
| **P4 -- Low** | Cosmetic issue, non-critical bug, documentation gap | Next business day | Misaligned button, typo in translation, non-critical log noise |

---

## Escalation Paths

```
L1: On-call engineer
    |
    v (P1/P2 not resolved in 30 min, or any P1)
L2: Engineering lead
    |
    v (P1 not resolved in 1 hour, data breach confirmed)
L3: CTO
    |
    v (data breach with GDPR implications)
L4: Legal / DPO (Data Protection Officer)
```

### Contact Methods

- On-call rotation managed via PagerDuty (or equivalent)
- Escalation triggered automatically if acknowledgement is not received within 5 minutes (P1) or 15 minutes (P2)
- All incident communication happens in the designated incident Slack channel

---

## Incident Response Workflow

### 1. Detection

Incidents can be detected via:
- **Automated**: Sentry alerts, CloudWatch alarms, health check failures, PagerDuty
- **User report**: Support ticket from school administrator
- **Internal**: Engineer notices anomaly during monitoring

### 2. Acknowledgement

- On-call engineer acknowledges within the response time for the severity level
- Create an incident channel (or thread) for communication
- Post initial assessment: what is broken, who is affected, estimated scope

### 3. Triage

Determine:
- Is this a P1/P2/P3/P4?
- Which tenants are affected (all or specific)?
- Is data integrity compromised?
- Is there a security/privacy breach?

### 4. Mitigation

Apply the fastest available fix to restore service:
- Application rollback (see [rollback.md](./rollback.md))
- Feature flag disable (module toggle or tenant suspension)
- Infrastructure scaling (if load-related)
- DNS failover (if network-related)

Mitigation does NOT need to be a permanent fix. The goal is to stop the bleeding.

### 5. Resolution

After mitigation is in place:
- Identify root cause
- Develop and test a proper fix
- Deploy the fix through the normal CI/CD pipeline
- Verify the fix resolves the issue without regressions

### 6. Post-Incident Review

Within 48 hours of resolution:
- Write a post-incident review (blameless)
- Document: timeline, root cause, impact, mitigation steps, permanent fix
- Identify action items to prevent recurrence
- Share with the team

---

## Specific Response Procedures

### RLS Breach Response

An RLS breach means one tenant's data was exposed to another tenant. This is the highest severity incident.

**IMMEDIATE ACTIONS (within 15 minutes):**

1. **Suspend affected tenant(s)**

```bash
# Suspend the tenant whose data was exposed
curl -X POST https://api.edupod.app/api/v1/admin/tenants/<affected-tenant-id>/suspend \
  -H "Authorization: Bearer <platform-admin-token>"

# If the breach vector is through a specific tenant, suspend that one too
curl -X POST https://api.edupod.app/api/v1/admin/tenants/<source-tenant-id>/suspend \
  -H "Authorization: Bearer <platform-admin-token>"
```

2. **Audit log review**

Determine the scope of exposure:

```sql
-- Check audit logs for cross-tenant access patterns
-- Connect to the production database

SELECT
  al.user_id,
  al.tenant_id,
  al.action,
  al.resource_type,
  al.resource_id,
  al.created_at,
  al.ip_address
FROM audit_logs al
WHERE al.created_at > '<incident-start-time>'
ORDER BY al.created_at DESC;

-- Look for any requests where the authenticated tenant_id
-- does not match the tenant_id of the accessed resource
```

3. **Identify root cause**

Common RLS breach causes:
- Missing RLS policy on a new table
- Raw SQL query bypassing RLS middleware (`$executeRawUnsafe`, `$queryRawUnsafe`)
- Missing `SET LOCAL app.current_tenant_id` in a code path
- Incorrect tenant context in a BullMQ job (missing or wrong `tenant_id`)
- Search index (Meilisearch) not filtering by tenant

4. **Fix and deploy**

- Write the fix
- Add an RLS leakage test that reproduces the breach
- Deploy via expedited process (skip non-essential CI steps if P1)

5. **GDPR breach notification**

If personal data was exposed:
- The GDPR requires notification to the supervisory authority within **72 hours** of becoming aware
- Notify affected data subjects "without undue delay" if the breach is likely to result in high risk
- Document: nature of the breach, categories and approximate number of data subjects affected, likely consequences, measures taken
- Engage the Data Protection Officer (DPO) or legal counsel

**POST-BREACH ACTIONS:**

- Reactivate suspended tenants only after the fix is deployed and verified
- Conduct a full audit of all RLS policies across all tables
- Run the complete RLS leakage test suite
- Update monitoring to detect similar breaches earlier

---

### Service Outage Response

**Complete outage (all services down):**

1. Check ECS task status:

```bash
aws ecs describe-services \
  --cluster school-prod \
  --services school-api school-web school-worker \
  --query 'services[].{name:serviceName,status:status,running:runningCount,desired:desiredCount}'
```

2. Check RDS status:

```bash
aws rds describe-db-instances \
  --db-instance-identifier school-prod \
  --query 'DBInstances[0].{status:DBInstanceStatus,endpoint:Endpoint.Address}'
```

3. Check ElastiCache status:

```bash
aws elasticache describe-cache-clusters \
  --cache-cluster-id school-redis \
  --show-cache-node-info
```

4. If ECS tasks are crashing, check CloudWatch logs:

```bash
aws logs tail /ecs/school-api --since 10m --format short
```

5. Common causes and fixes:
   - **Database connection exhaustion**: Scale up RDS instance class or increase max connections
   - **Out of memory**: Scale up ECS task memory or fix memory leak
   - **Bad deployment**: Roll back (see [rollback.md](./rollback.md))
   - **AWS region issue**: Check AWS status page, wait or failover

---

### Payment Processing Failure

If Stripe webhook processing fails:

1. Check Stripe dashboard for webhook delivery status
2. Check worker logs for Stripe-related errors:

```bash
aws logs filter-events \
  --log-group-name /ecs/school-worker \
  --start-time $(date -d '1 hour ago' +%s000) \
  --filter-pattern "stripe"
```

3. If webhooks are queued but not processing:
   - Check BullMQ queue health
   - Check Redis connectivity
   - Restart worker service if needed

4. If Stripe API is down:
   - Check https://status.stripe.com
   - Payment collection will be delayed but not lost
   - Stripe retries webhooks for up to 3 days

---

### Tenant Suspension (Emergency)

For situations requiring immediate isolation of a tenant:

```bash
# Suspend via API
curl -X POST https://api.edupod.app/api/v1/admin/tenants/<tenant-id>/suspend \
  -H "Authorization: Bearer <platform-admin-token>"
```

**What happens on suspension:**

1. Tenant status set to `suspended` in the database
2. Redis flag set immediately for fast enforcement (no database query needed on every request)
3. All active sessions for the tenant's users are invalidated
4. Subsequent login attempts are blocked
5. Users see a "School temporarily unavailable" page
6. BullMQ jobs for the tenant continue to process (they are already in the queue) but new jobs are not enqueued
7. Webhooks (Stripe, etc.) continue to be received but processing is deferred

**When to suspend:**
- Confirmed or suspected data breach involving the tenant
- Tenant requested emergency lockout (e.g., compromised admin account)
- Legal hold requiring data preservation
- Terms of service violation

---

### Database Restoration

For data corruption or accidental data loss, see [backup-restore.md](./backup-restore.md).

Quick reference:
1. Take a manual snapshot of the current state (for forensics)
2. Identify the target recovery time
3. Scale down all application services
4. Restore via PITR to a new instance
5. Verify data integrity
6. Switch application to the restored instance
7. Scale services back up

---

## Monitoring and Alerting

### CloudWatch Alarms (Configured)

| Alarm | Threshold | Action |
|---|---|---|
| API 5xx rate | > 1% of requests over 5 min | P2 page |
| API response time p99 | > 5s over 5 min | P3 alert |
| RDS CPU | > 80% over 10 min | P3 alert |
| RDS free storage | < 10 GB | P2 alert |
| RDS connection count | > 80% of max | P2 alert |
| ECS task count | < desired count | P1 page |
| ElastiCache memory | > 80% | P3 alert |
| BullMQ failed job count | > 50 in 5 min | P3 alert |

### Sentry Alerts

- New unhandled exception: P3 notification
- Error spike (> 10x baseline in 5 min): P2 page
- Any error containing "RLS", "tenant_id", or "cross-tenant": P1 page

---

## Communication Templates

### Status Page Update (Service Degradation)

```
[Investigating] We are currently investigating reports of [brief description].
Some users may experience [impact]. We are working to resolve this as quickly as possible.
```

### Status Page Update (Resolved)

```
[Resolved] The issue affecting [brief description] has been resolved.
All services are operating normally. We apologise for any inconvenience.
```

### Tenant Notification (Data Incident)

```
Dear [School Name] Administrator,

We are writing to inform you of a data incident that affected your school's account
on [date]. [Brief description of what happened and what data was involved.]

We have taken the following steps: [list actions taken].

If you have any questions, please contact us at [support email].
```
