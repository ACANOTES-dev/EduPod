# Off-Site Backup Replication Setup

Automated daily off-site backup replication to S3-compatible storage (Hetzner Object Storage). Includes restore tooling and quarterly drill integration.

---

## Prerequisites

1. **pg_dump** and **pg_restore** available on the server (installed with PostgreSQL client tools)
2. **S3-compatible bucket** created (Hetzner Object Storage, AWS S3, or any S3-compatible provider)
3. **Environment variables** configured in `/opt/edupod/app/.env` (see below)
4. **Node.js + tsx** available (already on the server as part of the app runtime)

## Required Environment Variables

These must be in `/opt/edupod/app/.env`:

| Variable                      | Description                                      | Example                                      |
| ----------------------------- | ------------------------------------------------ | -------------------------------------------- |
| `DATABASE_MIGRATE_URL`        | Direct Postgres connection (not via PgBouncer)   | `postgresql://user:pass@host:5432/db`        |
| `S3_BUCKET_NAME`              | Bucket name                                      | `edupod-backups`                             |
| `S3_ACCESS_KEY_ID`            | S3 access key                                    | (credential)                                 |
| `S3_SECRET_ACCESS_KEY`        | S3 secret key                                    | (credential)                                 |
| `S3_ENDPOINT`                 | S3 endpoint URL (for Hetzner/non-AWS providers)  | `https://fsn1.your-objectstorage.com`        |
| `S3_REGION`                   | S3 region (default: `eu-west-1`)                 | `eu-west-1`                                  |
| `BACKUP_S3_PREFIX`            | Key prefix in bucket (default: `postgresql/prod`)| `postgresql/prod`                            |

Optional (for failure alerts):

| Variable                      | Description                  |
| ----------------------------- | ---------------------------- |
| `DEPLOY_SLACK_WEBHOOK_URL`    | Slack incoming webhook URL   |
| `DEPLOY_TELEGRAM_BOT_TOKEN`   | Telegram bot token           |
| `DEPLOY_TELEGRAM_CHAT_ID`     | Telegram chat ID for alerts  |

---

## Scripts

| Script                             | Purpose                                           |
| ---------------------------------- | ------------------------------------------------- |
| `scripts/backup-replicate.ts`      | Core: pg_dump + upload to S3                       |
| `scripts/backup-replicate-cron.sh` | Cron wrapper: loads env, runs replicate, alerts on failure |
| `scripts/backup-restore-s3.ts`     | Download from S3 + pg_restore + verification       |
| `scripts/backup-drill.sh`         | Quarterly restore drill (supports `--from-s3`)     |

### package.json shortcuts

```bash
pnpm db:backup:replicate           # Run replication manually
pnpm db:backup:restore-s3           # Restore most recent backup from S3
pnpm db:backup:restore-s3 -- --list # List available backups
pnpm drill:restore-s3               # Quarterly drill using S3 source
```

---

## Cron Setup

Install the daily backup replication cron job on the production server:

```bash
# Create log directory if it does not exist
sudo mkdir -p /var/log/edupod
sudo chown root:root /var/log/edupod

# Install crontab entry (daily at 03:00 server time)
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/edupod/app/scripts/backup-replicate-cron.sh >> /var/log/edupod/backup-replicate.log 2>&1") | crontab -

# Verify
crontab -l | grep backup-replicate
```

### Log rotation

Add logrotate config to prevent unbounded log growth:

```bash
cat > /etc/logrotate.d/edupod-backup <<'EOF'
/var/log/edupod/backup-replicate.log {
    weekly
    rotate 12
    compress
    missingok
    notifempty
}
EOF
```

---

## Monitoring

### What to watch

1. **Log file**: `/var/log/edupod/backup-replicate.log` -- check for `ERROR` lines
2. **Slack/Telegram alerts**: On failure, the cron wrapper sends an alert to configured channels
3. **S3 bucket**: Verify new objects appear daily under `postgresql/prod/YYYY-MM/`

### Manual verification

```bash
# List recent backups in S3
cd /opt/edupod/app
npx tsx scripts/backup-restore-s3.ts --list

# Check log for recent runs
tail -20 /var/log/edupod/backup-replicate.log
```

### Alert: no backup in 36 hours

If you notice no new backup has appeared for more than 36 hours:

1. Check cron is installed: `crontab -l | grep backup-replicate`
2. Check the log: `tail -50 /var/log/edupod/backup-replicate.log`
3. Run manually to diagnose: `bash /opt/edupod/app/scripts/backup-replicate-cron.sh`

---

## Restore Procedures

### List available backups

```bash
npx tsx scripts/backup-restore-s3.ts --list
```

### Restore to a fresh/test database

```bash
# Create a test database first
psql "$DATABASE_MIGRATE_URL" -c "CREATE DATABASE restore_test;"

# Restore the most recent backup
npx tsx scripts/backup-restore-s3.ts \
  --target-url "postgresql://user:pass@host:5432/restore_test"

# Or restore a specific backup
npx tsx scripts/backup-restore-s3.ts \
  --backup-key "postgresql/prod/2026-04/postgres-2026-04-04T03-00-12.345Z.dump" \
  --target-url "postgresql://user:pass@host:5432/restore_test"
```

### Download only (for use with other tools)

```bash
LOCAL_PATH="$(npx tsx scripts/backup-restore-s3.ts --download-only 2>&1 | tail -1)"
echo "Downloaded to: $LOCAL_PATH"
```

---

## Quarterly Drill with Off-Site Backup

The quarterly restore drill can now use an S3 backup as its source, proving the full off-site restore path works end-to-end.

```bash
# Standard drill (local backup)
bash scripts/backup-drill.sh

# Off-site drill (S3 backup)
bash scripts/backup-drill.sh --from-s3

# Keep container for extended checks
bash scripts/backup-drill.sh --from-s3 --skip-cleanup
```

### Drill checklist additions for off-site drills

When running `--from-s3`, additionally verify:

- [ ] S3 download completed successfully
- [ ] Downloaded file size matches what S3 reports
- [ ] Restore from downloaded file succeeds identically to local backup restore
- [ ] All verification queries pass (row counts, RLS, migrations, extensions)

Fill out the full drill checklist at `scripts/backup-drill-checklist.md` after each drill.
