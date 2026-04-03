# EduPod Operations Runbook

Production troubleshooting and maintenance reference for the EduPod deployment at 46.62.244.139 (Hetzner CCX23, Helsinki).

---

## Quick Reference

### Server Access

```bash
ssh root@46.62.244.139
# Key: ~/.ssh/id_ed25519 (passphrase protected)
```

- App location: `/opt/edupod/app`
- Env file: `/opt/edupod/app/.env` (also symlinked at `apps/api/.env`)
- Domain: `edupod.app` (Cloudflare Pro, DNS proxied, Namecheap registrar)

### Service Ports

| Service            | Port    | Process                |
| ------------------ | ------- | ---------------------- |
| Frontend (Next.js) | 3000    | PM2: `web`             |
| API (NestJS)       | 3001    | PM2: `api`             |
| Worker (BullMQ)    | --      | PM2: `worker`          |
| PostgreSQL         | 5432    | Docker                 |
| Redis              | 6379    | Docker (auth required) |
| Meilisearch        | 7700    | Docker                 |
| Nginx              | 80, 443 | systemd                |

### Check Everything Is Running

```bash
pm2 list
docker ps
nginx -t
curl -sf http://localhost:3001/api/v1/health && echo "API OK"
curl -sf http://localhost:3000/en/login > /dev/null && echo "WEB OK"
```

If any of these fail, jump to the relevant section below.

---

## Common Issues and Fixes

### 1. API Not Starting / Crash Looping

**Symptoms:** `pm2 list` shows `api` with a high restart count, status `errored`.

**First step -- check logs:**

```bash
pm2 logs api --lines 30 --nostream
```

#### a) `@school/shared` dist missing

Error message: `Cannot find module '@school/shared'`

```bash
cd /opt/edupod/app
rm -f packages/shared/tsconfig.tsbuildinfo
pnpm build --filter @school/shared --force
pm2 restart api
```

#### b) `.env` not found or missing vars

Error message: `environment validation failed` or `ZodError`

The API reads `.env` via dotenv from CWD. A symlink must exist at `apps/api/.env` pointing to the root `.env`.

```bash
# Check the symlink
ls -la /opt/edupod/app/apps/api/.env

# Recreate if missing
ln -sf /opt/edupod/app/.env /opt/edupod/app/apps/api/.env
```

**Important:** The API uses NestJS ConfigModule with `dotenv.parse()`, which does NOT set `process.env`. Every env var the API needs must be:

1. Present in `/opt/edupod/app/.env`
2. Listed in the Zod validation schema at `apps/api/src/modules/config/env.validation.ts`
3. Read via `ConfigService`, not `process.env`

#### c) Database connection failed

```bash
# Test database connectivity
docker exec -it $(docker ps -q --filter ancestor=postgres:16) \
  psql -U edupod_admin -d school_platformedupod_prod -c "SELECT 1"

# If the postgres container is down
docker start $(docker ps -aq --filter ancestor=postgres:16)
```

#### d) Redis connection failed

```bash
docker exec -it $(docker ps -q --filter ancestor=redis:7-alpine) \
  redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' ping
```

Expected response: `PONG`

---

### 2. Worker Not Running

The worker runs as a direct node process, not via pnpm. The path is unusual due to NestJS build output structure:

```bash
pm2 start /opt/edupod/app/apps/worker/dist/apps/worker/src/main.js --name worker
pm2 save
```

#### Worker shows NOAUTH Redis error

The worker reads `REDIS_URL` from `.env` and parses host/port/password from it.

```bash
# Check that REDIS_URL in .env includes the password
grep REDIS_URL /opt/edupod/app/.env
```

The URL must include the password: `redis://:PASSWORD@localhost:6379`

Note: The `=` characters in the password must be URL-encoded as `%3D`. Example:

```
redis://:LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI%3D@localhost:6379
```

---

### 3. Web App 500 Error

#### a) `clientModules` error (stale build cache)

```bash
rm -rf /opt/edupod/app/apps/web/.next
cd /opt/edupod/app
pnpm build --filter @school/web --force
pm2 restart web
```

#### b) Route conflicts (duplicate pages resolving to same URL)

Check for files outside route groups that duplicate files inside route groups. Example: `[locale]/page.tsx` conflicts with `[locale]/(public)/page.tsx`.

Fix: remove the file outside the route group.

---

### 4. Meilisearch Not Connected

Check API logs for `MEILISEARCH_URL not set` warning.

```bash
pm2 logs api --lines 50 --nostream | grep -i meili
```

Requirements:

- `MEILISEARCH_URL` and `MEILISEARCH_API_KEY` must be in `/opt/edupod/app/.env`
- Both must be in the Zod validation schema at `apps/api/src/modules/config/env.validation.ts`
- The API reads them via `ConfigService` (not `process.env`)

```bash
# Verify env vars are set
grep MEILISEARCH /opt/edupod/app/.env

# Restart after changes
pm2 restart api
```

---

### 5. New Subdomain Not Working

**Prerequisites (already configured):**

- Wildcard DNS: `*.edupod.app` points to `46.62.244.139` (Cloudflare, proxied)
- Nginx: `server_name` includes `*.edupod.app`
- Cloudflare SSL: Full mode (not Full Strict)

**To add a new school subdomain:**

1. Add domain via the platform admin UI: Tenants > tenant > Domains tab.

2. Or via API:

```bash
curl -X POST http://localhost:3001/api/v1/admin/tenants/:tenantId/domains \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"domain": "newschool.edupod.app"}'
```

3. The domain is created with `verification_status='pending'`. Update it to `verified`:

```bash
docker exec -i $(docker ps -q --filter ancestor=postgres:16) \
  psql -U edupod_admin -d school_platformedupod_prod \
  -c "UPDATE tenant_domains SET verification_status = 'verified' WHERE domain = 'newschool.edupod.app';"
```

4. Clear the Redis tenant domain cache:

```bash
docker exec -it $(docker ps -q --filter ancestor=redis:7-alpine) \
  redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' \
  DEL "tenant_domain:newschool.edupod.app"
```

---

### 6. Database Operations

#### Connect to the database

```bash
docker exec -it $(docker ps -q --filter ancestor=postgres:16) \
  psql -U edupod_admin -d school_platformedupod_prod
```

#### Useful queries

```sql
-- List all tables
\dt

-- Check tenants
SELECT id, name, slug, status FROM tenants;

-- Check domains
SELECT domain, verification_status FROM tenant_domains;

-- Check active users
SELECT id, email, role FROM users WHERE status = 'active';

-- Check RLS policies on a table
SELECT * FROM pg_policies WHERE tablename = 'students';
```

#### Run pending migrations

```bash
cd /opt/edupod/app
set -a && source .env && set +a
cd packages/prisma
npx prisma migrate deploy
```

#### Apply post-migration scripts (RLS policies, triggers)

```bash
cd /opt/edupod/app
for f in packages/prisma/migrations/*/post_migrate.sql; do
  docker exec -i $(docker ps -q --filter ancestor=postgres:16) \
    psql -U edupod_admin -d school_platformedupod_prod < "$f" 2>&1 || true
done
```

#### Database backup

```bash
docker exec $(docker ps -q --filter ancestor=postgres:16) \
  pg_dump -U edupod_admin school_platformedupod_prod \
  | gzip > /opt/edupod/backups/db-$(date +%Y%m%d-%H%M%S).sql.gz
```

#### Restore from backup

```bash
gunzip -c /opt/edupod/backups/db-TIMESTAMP.sql.gz | \
  docker exec -i $(docker ps -q --filter ancestor=postgres:16) \
  psql -U edupod_admin -d school_platformedupod_prod
```

---

### 7. Deployment (Manual)

Full deployment from latest `main`:

```bash
cd /opt/edupod/app
git pull origin main
pnpm install
rm -f packages/shared/tsconfig.tsbuildinfo
pnpm build --force
set -a && source .env && set +a
cd packages/prisma && npx prisma migrate deploy && cd /opt/edupod/app
pm2 restart api web worker
pm2 save
sleep 5
curl -sf http://localhost:3000/en/login > /dev/null && echo "WEB OK"
curl -sf http://localhost:3001/api/v1/health && echo "API OK"
```

**Automated deployment:** GitHub Actions triggers on push to `main`. Workflow SSHs to the server, pulls, builds, and restarts PM2. Repo: `github.com/ACANOTES-dev/EduPod` (private).

---

### 8. `.env` Management

**The `.env` file is prone to duplicate keys.** Always check before adding a new variable:

```bash
grep "^KEY_NAME" /opt/edupod/app/.env
```

#### Deduplicate all entries

```bash
awk '!seen[$0]++' /opt/edupod/app/.env > /tmp/.env.clean && mv /tmp/.env.clean /opt/edupod/app/.env
```

#### After any `.env` change

```bash
pm2 restart api      # For API env vars
pm2 restart worker   # For worker env vars (reads process.env directly)
```

**How the API reads env vars:** NestJS `ConfigModule` uses `dotenv.parse()` which does NOT set `process.env`. All env vars the API needs must be:

1. Present in `.env`
2. Declared in the Zod schema at `apps/api/src/modules/config/env.validation.ts`
3. Accessed via `ConfigService` in application code

The worker, by contrast, reads `process.env` directly.

---

### 9. Nginx Configuration

- Config file: `/etc/nginx/sites-available/edupod`
- Test changes: `nginx -t`
- Apply changes: `systemctl reload nginx`

**Current routing:**

| Pattern                                                   | Destination                                        |
| --------------------------------------------------------- | -------------------------------------------------- |
| `edupod.app`, `www.edupod.app`, `*.edupod.app` (port 443) | Active server block                                |
| `/`                                                       | `localhost:3000` (frontend)                        |
| `/api`                                                    | `localhost:3001` (API, `client_max_body_size 10m`) |
| Port 80                                                   | HTTP to HTTPS redirect                             |

#### View current config

```bash
cat /etc/nginx/sites-available/edupod
```

#### Check for errors

```bash
nginx -t
journalctl -u nginx --since "10 minutes ago"
```

---

### 10. SSL Certificate

- **Origin cert:** Certbot for `edupod.app` (does NOT cover `*.edupod.app`)
- **Cloudflare SSL mode:** Full (not Full Strict) -- Cloudflare does not verify origin cert hostname match
- **How it works:** Cloudflare handles the browser-facing wildcard cert. The origin cert is only used for the Cloudflare-to-origin connection.

```bash
# Check certificate expiry
certbot certificates

# Renew certificate
certbot renew

# Force renewal
certbot renew --force-renewal
```

---

### 11. Redis Operations

#### Connect with authentication

```bash
docker exec -it $(docker ps -q --filter ancestor=redis:7-alpine) \
  redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI='
```

#### Flush tenant domain cache (after domain changes)

```
DEL "tenant_domain:schoolname.edupod.app"
```

#### Check BullMQ queues

```
KEYS bull:*
```

#### Check queue lengths

```
LLEN bull:notifications:wait
LLEN bull:payroll:wait
```

#### View failed jobs

```
LRANGE bull:notifications:failed 0 -1
```

#### Flush all caches (use with caution)

```
FLUSHDB
```

---

### 12. User Password Reset

Generate a bcrypt hash and update the user record:

```bash
NEW_HASH=$(node -e "require('/opt/edupod/app/node_modules/.pnpm/bcryptjs@3.0.3/node_modules/bcryptjs').hash('NEWPASSWORD', 10).then(h => process.stdout.write(h))")

docker exec -i $(docker ps -q --filter ancestor=postgres:16) \
  psql -U edupod_admin -d school_platformedupod_prod \
  -c "UPDATE users SET password_hash = '$NEW_HASH' WHERE email = 'user@email.com';"
```

Replace `NEWPASSWORD` with the desired password and `user@email.com` with the target user's email.

---

### 13. PM2 Process Management

```bash
pm2 list                    # Show all processes
pm2 logs [name]             # Tail logs (live)
pm2 logs [name] --nostream  # Snapshot of recent logs
pm2 logs [name] --lines 50  # Last 50 lines
pm2 flush [name]            # Clear log files
pm2 restart [name]          # Restart a process
pm2 stop [name]             # Stop without removing
pm2 delete [name]           # Remove a process entirely
pm2 save                    # Save process list (survives reboot)
pm2 startup                 # Generate startup script for boot
pm2 monit                   # Real-time dashboard
```

**Process paths:**

| Process  | Start command                                                                      |
| -------- | ---------------------------------------------------------------------------------- |
| `web`    | Managed by PM2 (Next.js)                                                           |
| `api`    | Managed by PM2 (NestJS)                                                            |
| `worker` | `pm2 start /opt/edupod/app/apps/worker/dist/apps/worker/src/main.js --name worker` |

The worker path is unusual because of how NestJS compiles -- the `dist/` output mirrors the monorepo source structure.

---

### 14. Hetzner Object Storage (S3-Compatible)

- **Bucket:** `edupod-assets` at `hel1.your-objectstorage.com`
- **SDK:** `@aws-sdk/client-s3` with custom endpoint and `forcePathStyle: true`
- **Used for:** Logo uploads, CSV import files, GDPR compliance exports

**Env vars:**

| Variable               | Purpose                               |
| ---------------------- | ------------------------------------- |
| `S3_REGION`            | Storage region                        |
| `S3_ENDPOINT`          | `https://hel1.your-objectstorage.com` |
| `S3_ACCESS_KEY_ID`     | Access key                            |
| `S3_SECRET_ACCESS_KEY` | Secret key                            |
| `S3_BUCKET_NAME`       | `edupod-assets`                       |

**Source files:**

- API: `apps/api/src/modules/s3/s3.service.ts`
- Worker: `apps/worker/src/base/s3.helpers.ts`

**Test connectivity:**

```bash
# From the server, using the API health check
curl -sf http://localhost:3001/api/v1/health | jq '.s3'
```

---

## Emergency Procedures

### Everything is down

```bash
# 1. Check Docker containers
docker ps -a

# 2. Start all containers
docker start $(docker ps -aq)

# 3. Wait for DB and Redis to be ready
sleep 5

# 4. Restart all PM2 processes
pm2 restart all

# 5. Verify
pm2 list
curl -sf http://localhost:3001/api/v1/health && echo "API OK"
curl -sf http://localhost:3000/en/login > /dev/null && echo "WEB OK"
```

### Server rebooted

PM2 should auto-restart processes if `pm2 startup` and `pm2 save` were run. Docker containers with `restart: unless-stopped` will also auto-start. If they did not:

```bash
docker start $(docker ps -aq)
sleep 5
pm2 resurrect
pm2 list
```

### Disk space full

```bash
# Check disk usage
df -h

# Find large files
du -sh /opt/edupod/app/apps/*/dist/
du -sh /opt/edupod/app/node_modules/
du -sh /var/log/

# Clear PM2 logs (can grow large)
pm2 flush

# Clear old Docker data
docker system prune -f
```

### High memory usage

```bash
# Check per-process memory
pm2 monit

# Or
pm2 list  # Shows memory column

# Restart the heaviest process
pm2 restart web  # Next.js tends to use the most memory
```

---

## Key File Paths

| What                  | Path                                            |
| --------------------- | ----------------------------------------------- |
| Application root      | `/opt/edupod/app`                               |
| Environment variables | `/opt/edupod/app/.env`                          |
| API env symlink       | `/opt/edupod/app/apps/api/.env`                 |
| Env validation schema | `apps/api/src/modules/config/env.validation.ts` |
| Prisma schema         | `packages/prisma/schema.prisma`                 |
| Prisma migrations     | `packages/prisma/migrations/`                   |
| Nginx config          | `/etc/nginx/sites-available/edupod`             |
| PM2 logs              | `~/.pm2/logs/`                                  |
| Certbot certs         | `/etc/letsencrypt/live/edupod.app/`             |
| S3 service            | `apps/api/src/modules/s3/s3.service.ts`         |
| Worker S3 helpers     | `apps/worker/src/base/s3.helpers.ts`            |
| Worker entry point    | `apps/worker/dist/apps/worker/src/main.js`      |
