# Rollback Runbook

Last updated: 2026-04-01

---

## Overview

Production runs on a Hetzner host with PM2-managed services. The default rollback path is now:

1. automatic rollback inside `scripts/deploy-production.sh` when post-restart smoke tests fail
2. manual application rollback to the previous commit when needed
3. database restore from the pre-deploy dump or the off-site object-store copy when schema/data rollback is required

---

## Decision Matrix

| Situation                                          | Strategy                                       |
| -------------------------------------------------- | ---------------------------------------------- |
| App bug, smoke test failed during deploy           | Automatic rollback in deploy script            |
| App bug discovered after deploy                    | Manual application rollback to previous commit |
| App bug with backwards-compatible migration        | Roll back app first, then reassess             |
| App bug with breaking migration or data corruption | Restore from pre-deploy or off-site backup     |
| Data corruption                                    | Restore from known-good backup                 |
| Feature causing business issues                    | Feature flag / module toggle disable           |
| Single tenant affected                             | Tenant-level mitigation                        |

---

## 1. Automatic Rollback

When `scripts/deploy-production.sh` fails its smoke test, it automatically:

1. checks out the previous commit SHA
2. rebuilds the repo with `pnpm install --frozen-lockfile`
3. regenerates Prisma client
4. reloads `api` and `web` through `ecosystem.config.cjs`, then restarts `worker`
5. reruns the smoke tests

If the rollback smoke test also fails, treat the incident as manual recovery.

## 2. Manual Application Rollback

Use this when the release is already live but needs to be reverted at the app layer.

```bash
ssh <production-host>
cd /opt/edupod/app
git checkout main
git log --oneline -n 5
git checkout <previous-good-sha>
pnpm install --frozen-lockfile
(cd packages/prisma && npx --no-install prisma generate)
NEXT_PUBLIC_API_URL= SENTRY_RELEASE=<previous-good-sha> pnpm build --force
sudo -u edupod PM2_HOME=/home/edupod/.pm2 env APP_DIR=/opt/edupod/app SENTRY_ENVIRONMENT=production SENTRY_RELEASE=<previous-good-sha> pm2 startOrGracefulReload /opt/edupod/app/ecosystem.config.cjs --only api,web --update-env
sudo -u edupod PM2_HOME=/home/edupod/.pm2 env APP_DIR=/opt/edupod/app SENTRY_ENVIRONMENT=production SENTRY_RELEASE=<previous-good-sha> pm2 restart /opt/edupod/app/ecosystem.config.cjs --only worker --update-env
sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 save
curl -s http://localhost:3001/api/health/ready | jq .
curl -s http://localhost:5556/health | jq .
```

---

## 3. Database Restore

If a migration or data change must be reversed:

1. locate the latest pre-deploy dump in `/opt/edupod/backups/predeploy`
2. if that is unavailable, use the replicated object-store backup documented in [offsite-backup-replication.md](./offsite-backup-replication.md)
3. restore into a temporary database first
4. run verification queries before switching production traffic
5. only then update application services to point at the restored database

---

## 4. Feature Flag Emergency Disable

### 4.1 Tenant Module Toggle

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

### 4.2 Tenant Suspension (Emergency)

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

## 5. Redis Recovery

Redis data loss is operationally painful but not a source-of-truth event. It stores sessions, caches, and BullMQ state.

### 5.1 Session Loss

If Redis loses all data:

- All users will be logged out (JWT refresh tokens stored in Redis)
- Users simply log in again
- No data loss occurs

### 5.2 BullMQ Queue Recovery

- Redis persistence should preserve delayed BullMQ jobs across normal restarts
- If AOF is corrupted, delayed/scheduled jobs are lost
- Application will re-enqueue recurring jobs on startup
- One-off jobs (e.g., individual notification dispatches) may need manual re-trigger

### 5.3 Cache Rebuild

Application caches (tenant config, permission lookups) are populated on-demand. After a Redis flush:

- First requests will be slower (cache miss penalty)
- No manual intervention needed
- Caches self-heal within minutes under normal traffic

---

## 6. Rollback Communication

After any rollback:

1. Update the incident channel with rollback status
2. Notify affected tenants if there was user-facing impact
3. Create a post-incident review ticket
4. Document the root cause and prevention measures
