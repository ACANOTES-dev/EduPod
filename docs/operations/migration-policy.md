# Migration Policy — Expand/Contract Only

## Core Principle

All schema migrations MUST be backward-compatible with the currently deployed application code. This eliminates the need for schema rollback — if a deploy fails, the previous code version can run against the new schema without modification.

Prisma migrations are forward-only by design. Automated schema rollback is not possible and not attempted. Instead, we guarantee that rollback is never needed at the schema level by enforcing the expand/contract pattern on every migration.

## Expand/Contract Pattern

Schema changes are split into two phases, deployed in separate releases.

### Phase 1: Expand (deployed WITH the new code)

These operations are additive and backward-compatible:

- Add new columns (nullable or with defaults)
- Add new tables
- Add new indexes
- Add new enum values
- Widen column types (e.g., `VARCHAR(50)` to `VARCHAR(100)`)
- Add new RLS policies for new tables

### Phase 2: Contract (deployed AFTER the expand code is stable in production)

These operations are destructive and require a separate deploy:

- Drop columns no longer referenced by any deployed code
- Drop tables no longer referenced
- Tighten constraints (`NOT NULL` on columns that now always have values)
- Remove old enum values
- Rename columns (via expand: add new + backfill, then contract: drop old)
- Drop indexes replaced by better alternatives

Contract migrations MUST NOT ship in the same release as the code that stops using the old schema. There must be at least one successful production deploy between the expand and the contract.

## What Is NEVER Allowed in a Single Deploy

| Operation | Why it breaks |
|---|---|
| Renaming a column or table | Old code references the old name |
| Dropping a column that old code reads/writes | Old code SELECTs or INSERTs it |
| Adding `NOT NULL` without a `DEFAULT` on an existing column | Old code INSERTs without the column |
| Changing a column type incompatibly | Old code sends/expects the old type |
| Removing an enum value that old code still writes | Old code INSERT fails on constraint |

## Rollback Procedure

Because all expand-phase migrations are additive, code rollback is sufficient.

### Scenario 1: Smoke tests fail after deploy

The automatic code rollback in `deploy-production.sh` reverts to the previous commit. The expanded schema is still compatible with the old code — no schema rollback needed.

### Scenario 2: Partial migration detected

`verify-migrations.sh` aborts the deploy and sends a Slack/Telegram notification. Manual intervention is required:

1. SSH to the production server
2. Check the `_prisma_migrations` table:
   ```sql
   SELECT id, migration_name, started_at, finished_at, rolled_back_at
   FROM _prisma_migrations
   WHERE finished_at IS NULL AND rolled_back_at IS NULL;
   ```
3. Assess the partial state — which SQL statements completed vs which did not
4. If the partial migration is safe to retry:
   ```bash
   DATABASE_URL=$DATABASE_MIGRATE_URL npx prisma migrate deploy
   ```
5. If the partial migration left the database inconsistent: restore from predeploy backup (see below)

### Scenario 3: Data corruption discovered post-deploy

Restore from the predeploy backup.

## Full Database Restore from Predeploy Backup

Predeploy backups are stored at `/opt/edupod/backups/predeploy/` with 14-day retention. They are created automatically by `deploy-production.sh` before every deploy.

```bash
# 1. Stop all services
pm2 stop all

# 2. Identify the correct backup
ls -lt /opt/edupod/backups/predeploy/*.dump | head -5

# 3. Restore
pg_restore --clean --if-exists --no-owner \
  --dbname="$DATABASE_MIGRATE_URL" \
  /opt/edupod/backups/predeploy/predeploy-YYYYMMDD-HHMMSS.dump

# 4. Verify migration state
psql "$DATABASE_MIGRATE_URL" \
  -c "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;"

# 5. Verify RLS policies
psql "$DATABASE_MIGRATE_URL" \
  -c "SELECT tablename, policyname FROM pg_policies ORDER BY tablename;"

# 6. Run post-migrate verification
psql "$DATABASE_MIGRATE_URL" -f scripts/post-migrate-verify.sql

# 7. Restart services
pm2 restart all

# 8. Run smoke tests manually
```

## Recovery Time Objective

| Method | Estimated time |
|---|---|
| Code-only rollback (automatic) | ~2 minutes |
| Predeploy backup restore | ~5-10 minutes for current database size |
| Off-site backup restore (S3) | ~15-30 minutes (includes download) |

## CI Enforcement

The `scripts/check-migration-safety.sh` script scans migration SQL files for contract-phase patterns. It runs as a CI gate and blocks merges that contain unsafe schema changes.

Known contract migrations that have been deliberately sequenced after a stable expand deploy can be added to `.migration-safety-allowlist` to bypass the check.

## References

- Deploy script: `scripts/deploy-production.sh`
- Migration verification: `scripts/verify-migrations.sh`
- Backup drill: `scripts/backup-drill.sh`
- CI restore drill: `scripts/ci-restore-drill.sh`
- Post-migrate verification: `scripts/post-migrate-verify.sql`
- Migration safety checker: `scripts/check-migration-safety.sh`
- Safety allowlist: `.migration-safety-allowlist`
