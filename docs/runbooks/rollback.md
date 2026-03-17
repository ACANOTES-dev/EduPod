# Rollback Runbook

Last updated: 2026-03-16

---

## Overview

This runbook covers procedures for reverting a failed deployment or mitigating a production incident. Rollback strategies vary depending on whether the release included database migrations.

---

## Decision Matrix

| Situation | Strategy |
|---|---|
| App bug, no DB migration in this release | Application rollback (ECS revert) |
| App bug with DB migration (backwards-compatible) | Application rollback (ECS revert) |
| App bug with DB migration (breaking schema change) | Full rollback (DB + App) |
| Data corruption | Point-in-time recovery (PITR) |
| Feature causing business issues | Feature flag / module toggle disable |
| Single tenant affected | Tenant-level mitigation |

---

## 1. Application Rollback (ECS Task Definition Revert)

Use this when the database schema is unchanged or the migration was backwards-compatible (additive columns, new tables, new indexes).

### 1.1 Identify Previous Task Definition Revision

```bash
# List recent task definition revisions for each service
aws ecs list-task-definitions \
  --family-prefix school-api \
  --sort DESC \
  --max-items 5

aws ecs list-task-definitions \
  --family-prefix school-web \
  --sort DESC \
  --max-items 5

aws ecs list-task-definitions \
  --family-prefix school-worker \
  --sort DESC \
  --max-items 5
```

Note the revision number immediately prior to the failed deployment.

### 1.2 Revert ECS Services

```bash
# Revert API
aws ecs update-service \
  --cluster school-prod \
  --service school-api \
  --task-definition school-api:<previous-revision> \
  --force-new-deployment

# Revert Web
aws ecs update-service \
  --cluster school-prod \
  --service school-web \
  --task-definition school-web:<previous-revision> \
  --force-new-deployment

# Revert Worker
aws ecs update-service \
  --cluster school-prod \
  --service school-worker \
  --task-definition school-worker:<previous-revision> \
  --force-new-deployment
```

### 1.3 Wait for Stability

```bash
aws ecs wait services-stable \
  --cluster school-prod \
  --services school-api school-web school-worker
```

### 1.4 Verify Rollback

```bash
curl -s https://api.edupod.app/api/health/ready | jq .
# Verify version field shows the previous release version
```

### 1.5 Partial Rollback

If only one service is affected, roll back just that service:

```bash
# Backend only
aws ecs update-service \
  --cluster school-prod \
  --service school-api \
  --task-definition school-api:<previous-revision> \
  --force-new-deployment

# Frontend only
aws ecs update-service \
  --cluster school-prod \
  --service school-web \
  --task-definition school-web:<previous-revision> \
  --force-new-deployment

# Worker only
aws ecs update-service \
  --cluster school-prod \
  --service school-worker \
  --task-definition school-worker:<previous-revision> \
  --force-new-deployment
```

---

## 2. Database Rollback

### 2.1 Safe Rollback: Prisma Migrate (Additive Migrations Only)

Only use this if the migration was purely additive (new tables, new columns with defaults, new indexes) and no data migration was performed.

```bash
# Caution: Prisma does not natively support migrate down.
# To revert a migration:

# 1. Identify the migration to revert
npx prisma migrate status

# 2. Mark it as rolled back in the migration table
# Connect to the database and:
UPDATE _prisma_migrations
SET rolled_back_at = NOW()
WHERE migration_name = '<migration-name>';

# 3. Manually reverse the schema change
# Write and execute the inverse SQL:
# - DROP TABLE if a table was added
# - ALTER TABLE DROP COLUMN if a column was added
# - DROP INDEX if an index was added

# 4. Re-run post-migrate to restore RLS policies
pnpm db:post-migrate
```

### 2.2 Unsafe Rollback: AWS RDS Point-in-Time Recovery (PITR)

Use PITR when data corruption has occurred or when a migration cannot be safely reversed. This is a destructive operation that will lose all data written after the recovery point.

#### Step-by-step PITR Procedure

**Step 1: Identify the target recovery time**

Determine the exact time before the incident began. Use CloudWatch logs, Sentry timestamps, or deployment records.

```bash
# Check when the failed migration was applied
aws rds describe-events \
  --source-identifier school-prod \
  --source-type db-instance \
  --duration 1440
```

**Step 2: Stop all application traffic**

```bash
# Scale all ECS services to 0 to prevent writes
aws ecs update-service --cluster school-prod --service school-api --desired-count 0
aws ecs update-service --cluster school-prod --service school-web --desired-count 0
aws ecs update-service --cluster school-prod --service school-worker --desired-count 0
```

**Step 3: Restore to a new RDS instance**

```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier school-prod \
  --target-db-instance-identifier school-restore-$(date +%Y%m%d-%H%M) \
  --restore-time "YYYY-MM-DDTHH:MM:SSZ" \
  --db-instance-class db.r6g.large \
  --vpc-security-group-ids <sg-id> \
  --db-subnet-group-name <subnet-group> \
  --no-multi-az
```

**Step 4: Wait for the restored instance to become available**

```bash
aws rds wait db-instance-available \
  --db-instance-identifier school-restore-<timestamp>
```

This can take 15-45 minutes depending on database size.

**Step 5: Verify data integrity on the restored instance**

```sql
-- Connect to the restored instance and verify:

-- 1. Row counts for critical tables
SELECT 'tenants' AS tbl, COUNT(*) FROM tenants
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'tenant_memberships', COUNT(*) FROM tenant_memberships;

-- 2. RLS policies are intact
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';

-- 3. Trigger functions exist
SELECT routine_name FROM information_schema.routines
WHERE routine_type = 'FUNCTION' AND routine_schema = 'public';

-- 4. Sequences are correct
SELECT * FROM tenant_sequences ORDER BY tenant_id, prefix;
```

**Step 6: Switch application to the restored instance**

1. Update the `DATABASE_URL` in AWS Systems Manager Parameter Store to point to the restored instance endpoint
2. Restart ECS services:

```bash
aws ecs update-service --cluster school-prod --service school-api --desired-count 2 --force-new-deployment
aws ecs update-service --cluster school-prod --service school-web --desired-count 2 --force-new-deployment
aws ecs update-service --cluster school-prod --service school-worker --desired-count 1 --force-new-deployment
```

**Step 7: Verify application health**

```bash
curl -s https://api.edupod.app/api/health/ready | jq .
```

**Step 8: Clean up**

Once the restored instance is confirmed working:

```bash
# Rename the old instance (keep for investigation)
aws rds modify-db-instance \
  --db-instance-identifier school-prod \
  --new-db-instance-identifier school-prod-failed-$(date +%Y%m%d)

# Delete after investigation is complete (minimum 7 days)
aws rds delete-db-instance \
  --db-instance-identifier school-prod-failed-<date> \
  --skip-final-snapshot
```

---

## 3. Feature Flag Emergency Disable

### 3.1 Tenant Module Toggle

If a specific module is causing issues, disable it at the tenant level without a full rollback.

```bash
# Via the platform admin API
curl -X PATCH https://api.edupod.app/api/v1/admin/tenants/<tenant-id>/modules/<module-key> \
  -H "Authorization: Bearer <platform-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"is_enabled": false}'
```

Available module keys: `payroll`, `finance`, `attendance`, `admissions`, `scheduling`, `gradebook`, `communications`, `website`

This immediately prevents users from accessing the affected module. The `@ModuleEnabled()` guard on controllers returns 403 for disabled modules.

### 3.2 Tenant Suspension (Emergency)

For critical issues affecting a specific tenant (data corruption, security breach):

```bash
# Suspend the tenant via platform admin API
curl -X POST https://api.edupod.app/api/v1/admin/tenants/<tenant-id>/suspend \
  -H "Authorization: Bearer <platform-admin-token>"
```

This will:
1. Set tenant status to `suspended` in the database
2. Set a Redis flag for immediate effect (no need to wait for cache expiry)
3. Invalidate all active sessions for users of that tenant
4. Users attempting to access the tenant will see a "School temporarily unavailable" page

To reactivate after the issue is resolved:

```bash
curl -X POST https://api.edupod.app/api/v1/admin/tenants/<tenant-id>/reactivate \
  -H "Authorization: Bearer <platform-admin-token>"
```

---

## 4. Redis Recovery

Redis data loss is non-critical for the application -- it stores sessions, caches, and BullMQ job queues.

### 4.1 Session Loss

If Redis loses all data:
- All users will be logged out (JWT refresh tokens stored in Redis)
- Users simply log in again
- No data loss occurs

### 4.2 BullMQ Queue Recovery

- AOF persistence is enabled on ElastiCache -- queues survive restarts
- If AOF is corrupted, delayed/scheduled jobs are lost
- Application will re-enqueue recurring jobs on startup
- One-off jobs (e.g., individual notification dispatches) may need manual re-trigger

### 4.3 Cache Rebuild

Application caches (tenant config, permission lookups) are populated on-demand. After a Redis flush:
- First requests will be slower (cache miss penalty)
- No manual intervention needed
- Caches self-heal within minutes under normal traffic

---

## 5. Rollback Communication

After any rollback:

1. Update the incident channel with rollback status
2. Notify affected tenants if there was user-facing impact
3. Create a post-incident review ticket
4. Document the root cause and prevention measures
