# Migration Safety Runbook

Last updated: 2026-04-02

---

## Overview

Every Prisma migration that reaches production alters a live database serving real tenants. This runbook codifies the rules, checks, and escape hatches that keep schema changes safe.

Related documents:

- [deployment.md](./deployment.md) -- deploy flow and pre-deploy checklist
- [rollback.md](./rollback.md) -- rollback decision matrix and procedures
- [backup-restore.md](./backup-restore.md) -- backup sources and restore procedures
- `scripts/check-migration-safety.mjs` -- automated destructive SQL scanner
- `scripts/post-migrate-verify.sql` -- post-migration verification queries

---

## 1. The Default Rule: Backwards-Compatible Only

Every migration must be backwards-compatible by default. This means:

- **Allowed**: new tables, new nullable columns, new indexes, new enum values, new RLS policies
- **Allowed**: adding a `DEFAULT` to an existing column
- **Allowed**: creating or replacing functions and triggers
- **Not allowed in a single deploy**: dropping tables, dropping columns, renaming columns, changing column types, removing enum values, adding `NOT NULL` to an existing column without a default

The reason is simple: during a deploy, the old application code is still running while migrations execute. If a migration removes something the running code depends on, requests fail.

---

## 2. Breaking Migration Pattern: Multi-Deploy Approach

When a schema change is not backwards-compatible, split it across multiple deploys:

### Deploy 1 -- Add New

- Add the new column, table, or enum value alongside the old one
- Application code starts writing to the new location but still reads from the old
- Both old and new schemas are valid at this point

### Deploy 2 -- Migrate Data

- Backfill existing rows from old to new
- Switch application code to read from the new location
- Old column or table is still present but unused

### Deploy 3 -- Remove Old

- Drop the old column, table, or enum value
- At this point no running code references the removed schema element

Each deploy gets its own Prisma migration. Each deploy is independently rollback-safe because the old schema is still present during deploys 1 and 2.

### Example: Renaming a Column

```
Deploy 1: ALTER TABLE students ADD COLUMN preferred_name TEXT;
          -- backfill: UPDATE students SET preferred_name = nickname;
          -- code: write to both preferred_name and nickname
Deploy 2: -- code: read from preferred_name only, still write to both
Deploy 3: ALTER TABLE students DROP COLUMN nickname;
          -- code: remove all nickname references
```

---

## 3. Pre-Deploy Checklist for Schema Changes

Before merging any PR that includes a Prisma migration:

### 3.1 Run the Safety Scanner

```bash
node scripts/check-migration-safety.mjs packages/prisma/migrations/YYYYMMDDHHMMSS_description/migration.sql
```

This scanner detects `DROP TABLE` and `DROP COLUMN` statements in migration SQL. If it flags anything, the migration needs the multi-deploy treatment described in section 2.

### 3.2 Manual Review

The safety scanner only catches explicit drops. Also verify manually:

- [ ] No `ALTER COLUMN ... SET NOT NULL` without a `DEFAULT` (will fail on existing rows)
- [ ] No `ALTER COLUMN ... TYPE` that narrows the type (e.g., `TEXT` to `VARCHAR(50)`)
- [ ] No `DROP TYPE` for enums still referenced by running code
- [ ] No `RENAME COLUMN` or `RENAME TABLE` (old code will break immediately)
- [ ] New tenant-scoped tables include `tenant_id UUID NOT NULL` and an RLS policy in `post_migrate.sql`
- [ ] New columns on existing tables are nullable or have a safe default
- [ ] Index creation uses `CREATE INDEX CONCURRENTLY` where practical (avoids table locks on large tables)

### 3.3 Verify Locally

```bash
cd packages/prisma
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

Then run `post-migrate-verify.sql` against the local database:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/post-migrate-verify.sql
```

If either step fails locally, it will fail in production.

### 3.4 CI Gate

The CI pipeline (`ci` job in `.github/workflows/ci.yml`) runs `prisma migrate deploy` and `pnpm db:post-migrate` against a test database. Migrations that fail CI never reach production.

---

## 4. What Happens During a Production Deploy

The deploy script (`scripts/deploy-production.sh`) executes this sequence for schema changes:

1. **Pre-deploy backup**: `pg_dump` to `/opt/edupod/backups/predeploy/predeploy-YYYYMMDD-HHMMSS.dump`
2. **Preflight**: checks DB connectivity and detects pending migrations
3. **Build**: compiles all packages (old code is still running via PM2)
4. **Migrate**: `prisma migrate deploy` applies pending migrations
5. **Post-migrate**: `pnpm db:post-migrate` applies RLS policies, triggers, indexes
6. **Verify**: `scripts/post-migrate-verify.sql` confirms critical tables, RLS, and triggers
7. **Restart**: PM2 graceful reload for `api` and `web`, restart for `worker`
8. **Smoke test**: health checks, auth endpoint, worker health

If step 8 fails, the deploy script automatically rolls back to the previous commit. However, **database migrations are not automatically reversed** -- the rollback only reverts application code.

---

## 5. Rollback Decision Tree

After a failed deploy with a schema change:

```
Was the migration backwards-compatible (additive only)?
  |
  +-- YES --> Application rollback is sufficient.
  |           Old code still works with the new schema.
  |           The extra column/table/index is harmless.
  |
  +-- NO  --> Did the migration corrupt or lose data?
                |
                +-- NO  --> Can you fix forward with a hotfix?
                |             |
                |             +-- YES --> Fix forward. Deploy the fix.
                |             |
                |             +-- NO  --> Restore from pre-deploy backup.
                |
                +-- YES --> Restore from pre-deploy backup immediately.
```

### Application-Only Rollback

When the migration is additive and the issue is in application code:

```bash
ssh root@<production-host>
cd /opt/edupod/app
git log --oneline -n 5          # identify the previous good SHA
git checkout <previous-good-sha>
pnpm install --frozen-lockfile
cd packages/prisma && npx --no-install prisma generate && cd /opt/edupod/app
NEXT_PUBLIC_API_URL= SENTRY_RELEASE=<sha> pnpm build --force
sudo -u edupod PM2_HOME=/home/edupod/.pm2 env APP_DIR=/opt/edupod/app \
  pm2 startOrGracefulReload /opt/edupod/app/ecosystem.config.cjs --only api,web --update-env
sudo -u edupod PM2_HOME=/home/edupod/.pm2 env APP_DIR=/opt/edupod/app \
  pm2 restart /opt/edupod/app/ecosystem.config.cjs --only worker --update-env
sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 save
```

Verify:

```bash
curl -s http://localhost:3001/api/health/ready | jq .
curl -s http://localhost:5556/health | jq .
curl -sf http://localhost:5551/en/login > /dev/null && echo "WEB OK"
```

### Database Restore

When the migration itself must be reversed, restore from the pre-deploy backup. See [backup-restore.md](./backup-restore.md) section 4 for the full procedure.

Key points:

1. Always restore to a temporary database first and validate
2. Only cut production over after validation succeeds
3. Stop application writes before switching databases
4. The pre-deploy dump is at `/opt/edupod/backups/predeploy/`
5. Backup retention is 14 days -- if older restores are needed, use the off-site copy

---

## 6. Emergency Rollback: Exact Commands

For a migration that broke production and requires a database restore:

```bash
# 1. Stop writes
ssh root@<production-host>
cd /opt/edupod/app
sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 stop api web worker

# 2. Identify the pre-deploy backup
ls -lt /opt/edupod/backups/predeploy/ | head -5

# 3. Restore to a temporary database for validation
set -a && source .env && set +a
psql "$DATABASE_MIGRATE_URL" -c "CREATE DATABASE edupod_restore_check;"
pg_restore \
  --clean --if-exists --no-owner --no-privileges \
  -d "${DATABASE_MIGRATE_URL%/*}/edupod_restore_check" \
  /opt/edupod/backups/predeploy/predeploy-YYYYMMDD-HHMMSS.dump

# 4. Validate the restored database
psql "${DATABASE_MIGRATE_URL%/*}/edupod_restore_check" \
  -v ON_ERROR_STOP=1 -f scripts/post-migrate-verify.sql

# 5. If validation passes, restore to production
pg_restore \
  --clean --if-exists --no-owner --no-privileges \
  -d "$DATABASE_MIGRATE_URL" \
  /opt/edupod/backups/predeploy/predeploy-YYYYMMDD-HHMMSS.dump

# 6. Clean up the temp database
psql "$DATABASE_MIGRATE_URL" -c "DROP DATABASE IF EXISTS edupod_restore_check;"

# 7. Revert application to the matching commit
git checkout <pre-migration-sha>
pnpm install --frozen-lockfile
cd packages/prisma && npx --no-install prisma generate && cd /opt/edupod/app
NEXT_PUBLIC_API_URL= pnpm build --force

# 8. Restart services
sudo -u edupod PM2_HOME=/home/edupod/.pm2 env APP_DIR=/opt/edupod/app \
  pm2 startOrGracefulReload /opt/edupod/app/ecosystem.config.cjs --only api,web --update-env
sudo -u edupod PM2_HOME=/home/edupod/.pm2 env APP_DIR=/opt/edupod/app \
  pm2 restart /opt/edupod/app/ecosystem.config.cjs --only worker --update-env
sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 save

# 9. Verify
curl -s http://localhost:3001/api/health/ready | jq .
curl -s http://localhost:5556/health | jq .
curl -sf http://localhost:5551/en/login > /dev/null && echo "WEB OK"
```

---

## 7. Common Migration Pitfalls

| Pitfall | Why it breaks | Prevention |
|---|---|---|
| `NOT NULL` without `DEFAULT` on existing column | Existing rows violate the constraint | Add the column as nullable first, backfill, then add the constraint |
| `DROP COLUMN` in the same deploy as the code change | Old application code still references the column during rollout | Use the multi-deploy pattern |
| `CREATE INDEX` on a large table without `CONCURRENTLY` | Locks the table for the duration of index creation | Use `CREATE INDEX CONCURRENTLY` (requires a separate migration, cannot be in a transaction) |
| Forgetting `FORCE ROW LEVEL SECURITY` on a new table | Table owner (the migration user) bypasses RLS | Always include both `ENABLE` and `FORCE` in the RLS boilerplate |
| Missing `post_migrate.sql` for new tables | RLS policies and triggers are not applied | Every migration with new tenant-scoped tables needs a corresponding `post_migrate.sql` |
| Enum value removal | Existing rows with that value become invalid | Add new value first, migrate rows, remove old value in a later deploy |
