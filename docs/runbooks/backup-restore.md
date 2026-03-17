# Backup and Restore Runbook

Last updated: 2026-03-16

---

## Overview

This runbook covers backup configuration, restore procedures, and verification steps for all stateful services in the School Operating System: PostgreSQL (RDS), Redis (ElastiCache), and Meilisearch. The primary database (PostgreSQL) contains all business data and is the most critical component to protect.

---

## 1. PostgreSQL (AWS RDS) Backups

### 1.1 Automated Backups

AWS RDS automated backups are configured as follows:

| Setting | Value |
|---|---|
| Backup window | 03:00 - 04:00 UTC daily |
| Retention period | 14 days |
| Point-in-time recovery (PITR) | Enabled, 5-minute granularity |
| Multi-AZ | Enabled (automatic failover) |
| Encryption | AES-256 (AWS managed key) |

Automated backups include:
- Full daily snapshot at the backup window
- Transaction logs captured continuously (enabling PITR)
- Both are stored in S3, managed by RDS (not directly accessible)

### 1.2 Manual Snapshots

Create manual snapshots before:
- Any production deployment with database migrations
- Any manual data manipulation
- Before deleting or archiving a tenant
- Before the quarterly backup drill

```bash
# Create a manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier school-prod \
  --db-snapshot-identifier manual-$(date +%Y%m%d)-<reason>

# Example: pre-deployment snapshot
aws rds create-db-snapshot \
  --db-instance-identifier school-prod \
  --db-snapshot-identifier manual-20260316-pre-deploy-p9

# Verify snapshot creation
aws rds describe-db-snapshots \
  --db-snapshot-identifier manual-20260316-pre-deploy-p9 \
  --query 'DBSnapshots[0].{Status:Status,Created:SnapshotCreateTime,Size:AllocatedStorage}'
```

Manual snapshots are retained indefinitely (until explicitly deleted). They do not count against the 14-day automated backup retention.

### 1.3 Snapshot Inventory

List all available snapshots:

```bash
# Automated snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier school-prod \
  --snapshot-type automated \
  --query 'DBSnapshots[].{ID:DBSnapshotIdentifier,Created:SnapshotCreateTime,Status:Status}' \
  --output table

# Manual snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier school-prod \
  --snapshot-type manual \
  --query 'DBSnapshots[].{ID:DBSnapshotIdentifier,Created:SnapshotCreateTime,Status:Status}' \
  --output table
```

---

## 2. Point-in-Time Recovery (PITR)

PITR allows restoring the database to any point within the retention window (14 days) with 5-minute granularity.

### 2.1 Determine the Recovery Target

Before initiating PITR, identify the exact target time:

- Check Sentry for the timestamp of the first error
- Check CloudWatch logs for the first sign of the incident
- Check deployment records for the migration execution time
- Use a time **before** the incident, with a safety margin of at least 5 minutes

```bash
# Check the latest restorable time
aws rds describe-db-instances \
  --db-instance-identifier school-prod \
  --query 'DBInstances[0].LatestRestorableTime'
```

### 2.2 Initiate PITR

```bash
# Stop all application traffic first
aws ecs update-service --cluster school-prod --service school-api --desired-count 0
aws ecs update-service --cluster school-prod --service school-web --desired-count 0
aws ecs update-service --cluster school-prod --service school-worker --desired-count 0

# Restore to a new instance
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier school-prod \
  --target-db-instance-identifier school-restore-$(date +%Y%m%d-%H%M) \
  --restore-time "2026-03-16T10:30:00Z" \
  --db-instance-class db.r6g.large \
  --vpc-security-group-ids <sg-id> \
  --db-subnet-group-name <subnet-group> \
  --no-multi-az \
  --copy-tags-to-snapshot \
  --tags Key=Environment,Value=restore Key=Purpose,Value=pitr-recovery
```

### 2.3 Wait for Instance Availability

```bash
# This can take 15-45 minutes depending on database size
aws rds wait db-instance-available \
  --db-instance-identifier school-restore-<timestamp>

# Get the endpoint of the restored instance
aws rds describe-db-instances \
  --db-instance-identifier school-restore-<timestamp> \
  --query 'DBInstances[0].Endpoint.{Address:Address,Port:Port}'
```

### 2.4 Verify Data Integrity

Connect to the restored instance and run verification queries:

```sql
-- 1. Row counts for key tables (compare against known-good counts)
SELECT 'tenants' AS table_name, COUNT(*) AS row_count FROM tenants
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'tenant_memberships', COUNT(*) FROM tenant_memberships
UNION ALL SELECT 'students', COUNT(*) FROM students
UNION ALL SELECT 'staff_profiles', COUNT(*) FROM staff_profiles
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'payroll_runs', COUNT(*) FROM payroll_runs
ORDER BY table_name;

-- 2. Verify RLS policies are intact
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3. Verify all tenant-scoped tables have RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('_prisma_migrations', 'users')
  AND rowsecurity = false;
-- This query should return ZERO rows

-- 4. Verify trigger functions exist
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- 5. Verify sequence counters
SELECT tenant_id, prefix, current_value
FROM tenant_sequences
ORDER BY tenant_id, prefix;

-- 6. Verify extensions
SELECT extname, extversion FROM pg_extension ORDER BY extname;
-- Must include: citext, btree_gist, uuid-ossp

-- 7. Check migration history
SELECT migration_name, finished_at
FROM _prisma_migrations
ORDER BY finished_at DESC
LIMIT 10;
```

### 2.5 Switch Application to Restored Instance

1. Update `DATABASE_URL` in AWS Systems Manager Parameter Store:

```bash
aws ssm put-parameter \
  --name "/school/prod/DATABASE_URL" \
  --value "postgresql://<user>:<password>@<restored-endpoint>:5432/school_platform" \
  --type SecureString \
  --overwrite
```

2. Restart application services:

```bash
aws ecs update-service --cluster school-prod --service school-api --desired-count 2 --force-new-deployment
aws ecs update-service --cluster school-prod --service school-web --desired-count 2 --force-new-deployment
aws ecs update-service --cluster school-prod --service school-worker --desired-count 1 --force-new-deployment

aws ecs wait services-stable \
  --cluster school-prod \
  --services school-api school-web school-worker
```

3. Verify health:

```bash
curl -s https://api.edupod.app/api/health/ready | jq .
```

### 2.6 Clean Up

```bash
# Rename the old instance for investigation (do not delete immediately)
aws rds modify-db-instance \
  --db-instance-identifier school-prod \
  --new-db-instance-identifier school-prod-incident-$(date +%Y%m%d) \
  --apply-immediately

# Rename the restored instance to the production name
aws rds modify-db-instance \
  --db-instance-identifier school-restore-<timestamp> \
  --new-db-instance-identifier school-prod \
  --apply-immediately

# Enable Multi-AZ on the restored instance (PITR restores are single-AZ)
aws rds modify-db-instance \
  --db-instance-identifier school-prod \
  --multi-az \
  --apply-immediately

# Delete the old instance after investigation (minimum 7 days, take a final snapshot)
aws rds delete-db-instance \
  --db-instance-identifier school-prod-incident-<date> \
  --final-db-snapshot-identifier final-school-prod-incident-<date>
```

---

## 3. Snapshot Restore (Full Backup)

For restoring from a specific snapshot (not PITR):

```bash
# List available snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier school-prod \
  --query 'DBSnapshots[].{ID:DBSnapshotIdentifier,Created:SnapshotCreateTime}' \
  --output table

# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier school-restore-$(date +%Y%m%d) \
  --db-snapshot-identifier <snapshot-identifier> \
  --db-instance-class db.r6g.large \
  --vpc-security-group-ids <sg-id> \
  --db-subnet-group-name <subnet-group>

# Then follow steps 2.3 through 2.6 above
```

---

## 4. Redis (ElastiCache) Backup and Restore

### 4.1 Persistence Configuration

| Setting | Value |
|---|---|
| Persistence | AOF (Append-Only File) enabled |
| AOF sync policy | everysec |
| Automatic backups | Daily, 1-day retention |

AOF persistence means:
- Redis data survives process restarts
- BullMQ delayed and scheduled jobs are preserved
- Session tokens are preserved

### 4.2 What Redis Stores

| Data Type | Impact of Loss | Recovery |
|---|---|---|
| User sessions (JWT refresh tokens) | Users must re-login | Automatic (users log in again) |
| Tenant config cache | Slightly slower first requests | Automatic (cache-on-demand) |
| Permission cache | Slightly slower first requests | Automatic (cache-on-demand) |
| BullMQ job queues | Pending jobs lost | Re-enqueue recurring jobs; one-off jobs may need manual re-trigger |
| Tenant suspension flags | Suspended tenants briefly accessible | Re-set flags from database state |
| Rate limiting counters | Rate limits temporarily reset | Automatic (counters restart) |

### 4.3 Redis Restore Procedure

If ElastiCache fails completely and AOF recovery is not possible:

1. Create a new ElastiCache cluster with the same configuration
2. Update the `REDIS_URL` in Parameter Store
3. Restart all application services (they reconnect automatically)
4. Application self-heals:
   - Caches repopulate on demand
   - Users log in again (sessions lost)
   - BullMQ queues are empty but functional
5. Manually verify tenant suspension flags match database state:

```sql
-- Check which tenants should be suspended
SELECT id, name, status FROM tenants WHERE status = 'suspended';
```

If any tenants show as suspended in the database, the application middleware will re-enforce this on the next request (reading from the database as a fallback when the Redis flag is missing).

---

## 5. Meilisearch Backup and Restore

### 5.1 Meilisearch Data

Meilisearch contains search indexes derived from PostgreSQL data. It is not a source of truth. Complete data loss requires only a re-index, not a restore from backup.

### 5.2 Re-Index Procedure

If Meilisearch data is lost or corrupted:

1. Clear all indexes (if the instance is still running):

```bash
curl -X DELETE http://<meilisearch-host>:7700/indexes/students \
  -H "Authorization: Bearer <master-key>"

curl -X DELETE http://<meilisearch-host>:7700/indexes/staff \
  -H "Authorization: Bearer <master-key>"

# Repeat for all indexes
```

2. Trigger a full re-index via the worker:

```bash
# Enqueue re-index jobs for each tenant
# This is done via the application's admin API or a management script
```

3. Monitor re-index progress via Meilisearch tasks API:

```bash
curl http://<meilisearch-host>:7700/tasks?status=processing,enqueued \
  -H "Authorization: Bearer <master-key>"
```

---

## 6. Quarterly Backup Drill

A backup restore drill must be performed quarterly to verify that backup and restore procedures work correctly and that the team is familiar with the process.

**Drill script**: See [/scripts/backup-drill.sh](/scripts/backup-drill.sh)
**Drill checklist**: See [/scripts/backup-drill-checklist.md](/scripts/backup-drill-checklist.md)

### Drill Schedule

| Quarter | Target Date | DBA | Engineering Lead |
|---|---|---|---|
| Q1 2026 | January | TBD | TBD |
| Q2 2026 | April | TBD | TBD |
| Q3 2026 | July | TBD | TBD |
| Q4 2026 | October | TBD | TBD |

### Drill Procedure Summary

1. Create a snapshot of the production database
2. Restore the snapshot to a temporary instance
3. Run verification queries (row counts, RLS policies, triggers, sequences)
4. Verify application can connect and function against the restored instance
5. Clean up the temporary instance
6. Document results in the drill checklist
7. File the completed checklist

---

## 7. Backup Monitoring

### Automated Checks

- CloudWatch alarm: RDS automated backup failed (P2 alert)
- Daily check: verify the most recent automated snapshot exists and is within 24 hours
- Weekly check: verify manual pre-deployment snapshots are being created

### Manual Verification (Monthly)

```bash
# Verify automated backups are current
aws rds describe-db-instances \
  --db-instance-identifier school-prod \
  --query 'DBInstances[0].{LatestRestorableTime:LatestRestorableTime,BackupRetentionPeriod:BackupRetentionPeriod}'

# Verify at least one automated snapshot exists for each of the last 14 days
aws rds describe-db-snapshots \
  --db-instance-identifier school-prod \
  --snapshot-type automated \
  --query 'length(DBSnapshots[])'
```
