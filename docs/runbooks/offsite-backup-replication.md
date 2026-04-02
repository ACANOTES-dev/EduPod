# Off-Site Backup Replication

Last updated: 2026-04-01

---

## Overview

Production runs on Hetzner, so we keep a second copy of PostgreSQL backups outside the VPS. The off-site path is:

1. Create a `pg_dump` archive from the production database
2. Upload the archive to S3-compatible object storage
3. Verify the object exists remotely
4. Perform a monthly restore drill from the remote copy

The replication command is:

```bash
pnpm db:backup:replicate
```

## Required Environment

The replication command expects these variables:

- `DATABASE_MIGRATE_URL`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET_NAME`

Optional:

- `BACKUP_S3_PREFIX` — defaults to `postgresql/prod`
- `PGDUMP_BIN` — defaults to `pg_dump`

## Remote Backup Procedure

Run from the production checkout on the server:

```bash
cd /opt/edupod/app
pnpm db:backup:replicate
```

Expected outcome:

- a custom-format dump is created temporarily
- the dump is uploaded to the configured object-storage bucket
- the local temp file is removed

## Monthly Restore Drill

At least once per month:

1. Pick the newest remote object under the backup prefix
2. Download it to the drill environment
3. Restore it into a temporary PostgreSQL instance with `pg_restore`
4. Run the verification queries from the backup/restore runbook
5. Record the restore duration and findings

Use [backup-drill-checklist.md](../../scripts/backup-drill-checklist.md) and the cadence rules in [recovery-drills.md](./recovery-drills.md) so monthly remote-copy exercises and quarterly restore drills share the same evidence standard.

Example restore flow:

```bash
pg_restore --clean --if-exists --no-owner --dbname "$DRILL_DATABASE_URL" /path/to/postgres-YYYY-MM-DD.dump
```

## Evidence to Record

For each monthly drill capture:

- backup object key
- drill date
- declared target RTO and expected RPO
- achieved recovery duration and observed RPO
- operator
- verification result
- follow-up fixes if anything failed
