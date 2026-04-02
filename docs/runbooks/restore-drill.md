# Restore Rehearsal Guide

Last updated: 2026-04-02

---

## Overview

Backups that have never been restored are hypothetical backups. This guide is the step-by-step procedure for taking a backup, verifying it, and restoring from it -- intended for regular rehearsal so the process is muscle memory when it matters.

Related documents:

- [backup-restore.md](./backup-restore.md) -- full backup/restore runbook
- [recovery-drills.md](./recovery-drills.md) -- drill cadence and evidence requirements
- [offsite-backup-replication.md](./offsite-backup-replication.md) -- off-site replication procedure
- `scripts/backup-drill.sh` -- automated drill script
- `scripts/backup-drill-checklist.md` -- fill-in checklist for each drill

---

## 1. Rehearsal Cadence

| Drill type | Frequency | Source |
|---|---|---|
| Off-site backup restore | Monthly | Latest remote object-store copy |
| Full local backup restore | Quarterly | Latest pre-deploy dump or off-site copy |
| Application rollback | Quarterly | Recent deploy SHA |

Do not skip a scheduled drill. A skipped drill is an ops gap, not a paperwork gap -- raise it in the next weekly review.

---

## 2. Taking a Backup Before Deploy

The deploy script (`scripts/deploy-production.sh`) handles this automatically, but here is the manual procedure for ad-hoc backups.

### 2.1 On the Production Server

```bash
ssh root@<production-host>
cd /opt/edupod/app
set -a && source .env && set +a

# Create a timestamped custom-format dump
mkdir -p /opt/edupod/backups/predeploy
pg_dump "$DATABASE_MIGRATE_URL" \
  --format=custom \
  --file "/opt/edupod/backups/predeploy/predeploy-$(date +%Y%m%d-%H%M%S).dump"
```

### 2.2 Verify the Backup File

```bash
# Check the file exists and has a reasonable size
ls -lh /opt/edupod/backups/predeploy/predeploy-*.dump | tail -1

# Verify the dump is readable (lists contents without restoring)
pg_restore --list /opt/edupod/backups/predeploy/predeploy-YYYYMMDD-HHMMSS.dump | head -20
```

If `pg_restore --list` fails or the file is 0 bytes, the backup is corrupt. Take another one before proceeding with any deploy.

### 2.3 Replicate Off-Site

After taking a local backup, replicate it to object storage:

```bash
cd /opt/edupod/app
pnpm db:backup:replicate
```

This uploads the dump to the S3-compatible object store under the configured prefix. See [offsite-backup-replication.md](./offsite-backup-replication.md) for details.

---

## 3. Verifying Backup Integrity

A backup file on disk proves nothing until you can restore from it. The minimum integrity check is:

### 3.1 Quick Check (No Restore)

```bash
# Verify the file is a valid PostgreSQL custom dump
pg_restore --list /path/to/backup.dump > /dev/null
echo $?  # should be 0
```

This confirms the file structure is intact but does not prove the data is complete.

### 3.2 Full Verification (Restore to Temp Database)

This is the only way to truly verify a backup. Use the automated drill script:

```bash
./scripts/backup-drill.sh --backup-file /path/to/backup.dump
```

Or manually:

```bash
# Start a temporary PostgreSQL container
docker volume create edupod-restore-drill
docker run -d \
  --name edupod-restore-drill \
  -e POSTGRES_DB=school_platform \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=drill-password \
  -p 5543:5432 \
  -v edupod-restore-drill:/var/lib/postgresql/data \
  postgres:16

# Wait for PostgreSQL to be ready
until docker exec edupod-restore-drill pg_isready -U postgres; do
  sleep 1
done

# Restore the backup
PGPASSWORD=drill-password pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  -h 127.0.0.1 \
  -p 5543 \
  -U postgres \
  -d school_platform \
  /path/to/backup.dump
```

---

## 4. Restoring from Backup: Step-by-Step

### 4.1 Restore to Temporary Database (Validation)

Always restore to a temporary target first. Never blindly overwrite production.

```bash
# Start the drill container (if not already running)
docker volume create edupod-restore-drill
docker run -d \
  --name edupod-restore-drill \
  -e POSTGRES_DB=school_platform \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=drill-password \
  -p 5543:5432 \
  -v edupod-restore-drill:/var/lib/postgresql/data \
  postgres:16

# Wait for readiness
until docker exec edupod-restore-drill pg_isready -U postgres; do
  sleep 1
done

# Restore
PGPASSWORD=drill-password pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  -h 127.0.0.1 \
  -p 5543 \
  -U postgres \
  -d school_platform \
  /path/to/backup.dump
```

### 4.2 Run Verification Queries

Connect to the restored database and run the standard verification:

```bash
PGPASSWORD=drill-password psql -h 127.0.0.1 -p 5543 -U postgres -d school_platform
```

Then execute:

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

-- RLS coverage (all tenant-scoped tables must have rowsecurity = true)
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('_prisma_migrations', 'users')
ORDER BY tablename;

-- RLS policies (must be non-empty)
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Required extensions
SELECT extname, extversion
FROM pg_extension
WHERE extname IN ('citext', 'btree_gist', 'uuid-ossp')
ORDER BY extname;

-- Trigger inventory
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- Tenant sequences (check counters are plausible)
SELECT tenant_id, prefix, current_value
FROM tenant_sequences
ORDER BY tenant_id, prefix;

-- Latest migration (should match production)
SELECT migration_name, finished_at
FROM _prisma_migrations
ORDER BY finished_at DESC
LIMIT 5;
```

Verification pass criteria:

- All tenant-scoped tables have `rowsecurity = true`
- RLS policy inventory is intact
- `citext`, `btree_gist`, and `uuid-ossp` extensions are installed
- Row counts are plausible for the backup timestamp
- Latest migration matches what production had at backup time
- Sequence counters are consistent

### 4.3 Clean Up After Drill

```bash
docker stop edupod-restore-drill
docker rm edupod-restore-drill
docker volume rm edupod-restore-drill
```

---

## 5. Production Recovery Procedure

Only perform this after a successful validation restore (section 4.1-4.2).

```bash
# 1. Stop application writes
ssh root@<production-host>
cd /opt/edupod/app
sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 stop api web worker

# 2. Restore the validated backup to production
set -a && source .env && set +a
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  -d "$DATABASE_MIGRATE_URL" \
  /opt/edupod/backups/predeploy/predeploy-YYYYMMDD-HHMMSS.dump

# 3. Verify the production database
psql "$DATABASE_MIGRATE_URL" -v ON_ERROR_STOP=1 -f scripts/post-migrate-verify.sql

# 4. Restart services
sudo -u edupod PM2_HOME=/home/edupod/.pm2 env APP_DIR=/opt/edupod/app \
  pm2 startOrGracefulReload /opt/edupod/app/ecosystem.config.cjs --only api,web --update-env
sudo -u edupod PM2_HOME=/home/edupod/.pm2 env APP_DIR=/opt/edupod/app \
  pm2 restart /opt/edupod/app/ecosystem.config.cjs --only worker --update-env
sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 save

# 5. Verify services
curl -s http://localhost:3001/api/health/ready | jq .
curl -s http://localhost:5556/health | jq .
curl -sf http://localhost:5551/en/login > /dev/null && echo "WEB OK"
```

---

## 6. What to Record After Each Drill

Fill in the `scripts/backup-drill-checklist.md` for restore drills or `scripts/rollback-drill-checklist.md` for rollback drills. At minimum, capture:

| Field | What to record |
|---|---|
| Drill date | When the drill was performed |
| Operator | Who performed it |
| Source backup | File path or object key |
| Backup timestamp | When the backup was created |
| Declared target RTO | How long recovery should take |
| Expected RPO | Acceptable data loss window |
| Restore start time | When `pg_restore` began |
| Restore complete time | When `pg_restore` finished |
| Validation complete time | When all verification queries passed |
| Achieved recovery duration | End-to-end time from start to verified recovery |
| Observed RPO | Actual data freshness lost (now minus backup timestamp) |
| Result | PASS / PASS WITH ACTIONS / FAIL |
| Issues found | Anything unexpected |
| Action items | Follow-ups with owner and due date |

Store the completed checklist with the quarterly ops record or the incident notes. The completed drill log in the checklist file provides an evidence trail.

---

## 7. Troubleshooting Common Drill Failures

| Problem | Likely cause | Fix |
|---|---|---|
| `pg_restore: error: input file does not appear to be a valid archive` | Backup file is corrupt or was compressed twice | Take a fresh backup; verify with `pg_restore --list` before the drill |
| Restore completes but row counts are zero | The dump was taken from an empty database | Use a backup from a populated state; check the backup timestamp |
| RLS policies missing after restore | `post_migrate.sql` scripts were not applied after restore | Run `pnpm db:post-migrate` against the restored database |
| Extensions missing (`citext`, `btree_gist`) | Extensions were installed in a different schema or the restore target lacks `CREATE EXTENSION` privileges | Run `CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS btree_gist;` as a superuser |
| Migration history does not match | Backup is from before the latest migration | Expected if using an older backup; note the gap in the drill record |
| Docker container fails to start | Port 5543 already in use from a previous drill | Clean up: `docker rm -f edupod-restore-drill && docker volume rm edupod-restore-drill` |
