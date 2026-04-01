# Backup and Restore Runbook

Last updated: 2026-04-01

---

## Overview

Production runs on a Hetzner VPS, so PostgreSQL recovery is dump-based rather than snapshot-driven. This runbook covers:

1. local pre-deploy PostgreSQL dumps stored on the production host
2. replicated off-site PostgreSQL dumps in object storage
3. Docker-based restore drills used to verify backup integrity
4. Redis and Meilisearch recovery expectations after an outage

PostgreSQL is the source of truth. Redis and Meilisearch are operational dependencies, but both can be rebuilt or repopulated from PostgreSQL-backed state.

---

## 1. PostgreSQL Backup Sources

### 1.1 Pre-Deploy Dumps

Every production deploy creates a custom-format `pg_dump` before migrations run.

- location: `/opt/edupod/backups/predeploy`
- format: PostgreSQL custom dump (`.dump`)
- retention: 14 days by default
- trigger: [`deploy-production.sh`](/Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/.worktrees/audit-ops/scripts/deploy-production.sh)

These dumps are the fastest rollback source for migration failures or application regressions introduced during deployment.

### 1.2 Off-Site Replication

Use the replication flow documented in [offsite-backup-replication.md](./offsite-backup-replication.md) to store a second copy outside the VPS.

- command: `pnpm db:backup:replicate`
- storage target: S3-compatible object storage
- expected cadence: after deploys with schema changes and on the regular ops schedule

### 1.3 Backup Selection Guidance

Choose the restore source in this order:

1. latest pre-deploy dump from before the incident
2. latest verified off-site object-store copy
3. older known-good dump if the newest backups are suspected to contain corruption

---

## 2. Restore to a Temporary Drill Environment

The safest first step is always to restore into an isolated PostgreSQL instance before touching production.

### 2.1 Recommended Drill Command

```bash
./scripts/backup-drill.sh --backup-file /path/to/postgres-YYYY-MM-DD.dump
```

If no `--backup-file` is provided, the script restores the newest `.dump` file in `/opt/edupod/backups/predeploy`.

### 2.2 Drill Prerequisites

The drill host needs:

- Docker
- `pg_restore`
- `pg_isready`
- `psql`
- access to the chosen `.dump` file

### 2.3 What the Drill Script Does

The drill script matches the current Hetzner deployment shape:

1. starts a temporary `postgres:16` Docker container
2. restores the chosen dump with `pg_restore`
3. runs verification queries against the restored database
4. records output to `backup-drill-YYYYMMDD-HHMM.log`
5. cleans up the container and Docker volume unless `--skip-cleanup` is used

### 2.4 Manual Restore Without the Script

```bash
docker volume create edupod-restore-data
docker run -d \
  --name edupod-restore \
  -e POSTGRES_DB=school_platform \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=restore-password \
  -p 5543:5432 \
  -v edupod-restore-data:/var/lib/postgresql/data \
  postgres:16

PGPASSWORD=restore-password pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  -h 127.0.0.1 \
  -p 5543 \
  -U postgres \
  -d school_platform \
  /path/to/postgres-YYYY-MM-DD.dump
```

---

## 3. Verification Queries

Run these checks after restoring any backup:

```sql
-- Row counts for key tables
SELECT 'tenants' AS table_name, COUNT(*) AS row_count FROM tenants
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'tenant_memberships', COUNT(*) FROM tenant_memberships
UNION ALL SELECT 'students', COUNT(*) FROM students
UNION ALL SELECT 'staff_profiles', COUNT(*) FROM staff_profiles
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'payroll_runs', COUNT(*) FROM payroll_runs
ORDER BY table_name;

-- RLS coverage
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('_prisma_migrations', 'users')
ORDER BY tablename;

-- RLS policies
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Trigger inventory
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- Extensions
SELECT extname, extversion
FROM pg_extension
ORDER BY extname;

-- Tenant sequences
SELECT tenant_id, prefix, current_value
FROM tenant_sequences
ORDER BY tenant_id, prefix;

-- Latest migrations
SELECT migration_name, finished_at
FROM _prisma_migrations
ORDER BY finished_at DESC
LIMIT 10;
```

Critical expectations:

- all tenant-scoped tables still have `rowsecurity = true`
- policy inventory is intact
- `citext`, `btree_gist`, and `uuid-ossp` are installed
- current migrations match production
- sequence counters are plausible for the restored point in time

---

## 4. Production Recovery from a Verified Dump

Only cut production over after a temporary restore has been validated.

### 4.1 Application-First Failures

If the schema is still compatible, prefer an application rollback first:

1. revert the app to the previous good commit
2. confirm health checks recover
3. reassess whether a database restore is still required

### 4.2 Database Recovery Flow

If the database itself must be restored:

1. stop or isolate writes to production
2. restore the chosen dump into a temporary PostgreSQL target
3. validate the restore with the queries above
4. cut services over only after validation succeeds
5. restart `api`, `web`, and `worker` against the restored database
6. verify `/api/health/ready`, worker health, and tenant logins

Do not restore blindly over the live production database without a validated dry run.

### 4.3 Post-Recovery Validation

After cutover, verify:

1. `pm2 status` shows `api`, `web`, and `worker` online
2. tenant login pages load
3. `/api/health/ready` reports `ok`
4. worker health responds successfully
5. queues resume normal throughput without threshold alerts

---

## 5. Redis Recovery

Redis is not the source of truth, but it affects active sessions, queues, and caches.

Expected effects of Redis loss:

- users may be logged out
- BullMQ delayed or scheduled work may need re-enqueueing
- caches will warm back up over time
- transient rate-limit and tenant-state caches may reset

Recovery actions:

1. restore Redis service availability
2. restart `api` and `worker`
3. confirm `/api/health/ready` is healthy
4. confirm recurring BullMQ jobs are re-registered
5. manually re-trigger one-off jobs if required
6. verify suspended-tenant behavior and critical permissions still reflect PostgreSQL state

---

## 6. Meilisearch Recovery

Meilisearch is fully reconstructable from PostgreSQL.

If indexes are lost or corrupted:

1. restore Meilisearch service availability
2. trigger a full re-index for affected tenants
3. confirm search queries succeed again
4. monitor indexing backlog until it returns to normal

No database restore is required for Meilisearch-only incidents.

---

## 7. Quarterly Restore Drill

Perform a full restore drill at least quarterly.

- script: [backup-drill.sh](/Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/.worktrees/audit-ops/scripts/backup-drill.sh)
- checklist: [backup-drill-checklist.md](/Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/.worktrees/audit-ops/scripts/backup-drill-checklist.md)

The drill should capture:

- source backup file
- restore duration
- row-count comparisons
- RLS and policy verification results
- follow-up fixes if anything fails

Store the completed checklist with the quarterly ops record or incident notes so the latest verified restore evidence is easy to retrieve.

---

## 8. Monitoring Expectations

At minimum, backup operations should have evidence for:

- latest successful pre-deploy dump timestamp
- latest successful off-site replication timestamp
- latest successful restore drill date
- measured restore duration for the last drill
- any drill failures tracked through remediation

Use the monitoring cadence in [monitoring.md](/Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/.worktrees/audit-ops/docs/runbooks/monitoring.md) to review these signals regularly. If any of them are stale, treat it as an operational issue rather than a paperwork gap.
