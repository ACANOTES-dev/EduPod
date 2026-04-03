# EDUPOD PLATFORM -- MASTER OPERATIONS MANUAL

**Classification: CONFIDENTIAL**
**Last Updated:** 2026-03-18 (final revision — all known issues resolved)
**Audience:** Technical support staff with SSH access to the production server
**Purpose:** This document contains everything needed to diagnose and resolve ANY issue on the EduPod platform without prior knowledge of the system. Every command is copy-paste ready with real values.
**Prerequisites:** Access to the Credential Vault (see Appendix B) for third-party dashboard logins.

---

## TABLE OF CONTENTS

1. [System Overview](#1-system-overview)
2. [Server Access](#2-server-access)
3. [All Services -- What Runs and Where](#3-all-services----what-runs-and-where)
4. [Networking and DNS](#4-networking-and-dns)
5. [Database](#5-database)
6. [Redis](#6-redis)
7. [Environment Variables](#7-environment-variables)
8. [Tenant Management](#8-tenant-management)
9. [Accounts and Authentication](#9-accounts-and-authentication)
10. [Monitoring and Alerting](#10-monitoring-and-alerting)
11. [Backups](#11-backups)
12. [Deployment](#12-deployment)
13. [Security](#13-security)
14. [Third-Party Services](#14-third-party-services)
15. [Webhook Endpoints](#15-webhook-endpoints)
16. [Troubleshooting Guide](#16-troubleshooting-guide)
17. [Emergency Procedures](#17-emergency-procedures)
18. [Key File Paths Reference](#18-key-file-paths-reference)
19. [Contact and Escalation](#19-contact-and-escalation)

---

## 1. SYSTEM OVERVIEW

### What EduPod Is

EduPod is a multi-tenant school management SaaS platform. It provides school administration functionality including admissions, student records, staff management, scheduling (with an automated timetable solver), attendance tracking, gradebook with report cards, finance (invoicing, payments, refunds, installments), payroll (salaried and per-class compensation), communications (email, WhatsApp, in-app notifications), a public website CMS per school, parent inquiries, approval workflows, compliance/GDPR tooling, analytics, and role-aware dashboards.

Each school is a "tenant" that gets its own subdomain (e.g., `al-noor.edupod.app`). All schools share one database with strict Row-Level Security (RLS) ensuring complete data isolation -- School A can never see School B's data. The platform is bilingual English/Arabic with full RTL (right-to-left) support.

### Architecture (Request Flow)

```
Browser
  |
  v
Cloudflare Pro (DNS, CDN, WAF, SSL termination for browser)
  |
  v
Origin Server (46.62.244.139, Hetzner Cloud)
  |
  v
Nginx (reverse proxy, listens on ports 80 and 443)
  |-- SSL using Cloudflare Origin Certificate
  |-- / requests  -->  PM2: web (Next.js on port 5551)
  |-- /api requests --> PM2: api (NestJS on port 3001)
  |
  v
PM2 (process manager, keeps apps running, auto-restarts on crash)
  |-- web    (Next.js 14 frontend, port 5551)
  |-- api    (NestJS REST API, port 3001)
  |-- worker (BullMQ background job processor, no HTTP port)
  |
  v
Data Layer (all in Docker containers, bound to 127.0.0.1)
  |-- PostgreSQL 16  (port 5432, primary database)
  |-- PgBouncer      (port 6432, connection pooling in transaction mode)
  |-- Redis 7        (port 6379, cache + queues + sessions)
  |-- Meilisearch    (port 7700, full-text search)
```

### Technology Stack

| Layer                 | Technology                       | Version                |
| --------------------- | -------------------------------- | ---------------------- |
| Frontend              | Next.js (App Router)             | 14+                    |
| Backend API           | NestJS + TypeScript              | Modular monolith       |
| Background Jobs       | BullMQ                           | Worker service         |
| Database              | PostgreSQL                       | 16                     |
| Connection Pooling    | PgBouncer                        | Transaction mode       |
| Cache/Sessions/Queues | Redis                            | 7 (Alpine)             |
| Full-Text Search      | Meilisearch                      | Latest                 |
| Process Manager       | PM2                              | Latest                 |
| Reverse Proxy         | Nginx                            | System package         |
| CDN/DNS/WAF           | Cloudflare Pro                   | Pro plan               |
| ORM                   | Prisma                           | With RLS middleware    |
| UI Framework          | Tailwind CSS + shadcn/ui (Radix) | --                     |
| Internationalisation  | next-intl                        | en, ar locales         |
| Email                 | Resend                           | Transactional          |
| SMS/WhatsApp          | Twilio                           | WhatsApp Business API  |
| Payments              | Stripe                           | Per-tenant accounts    |
| File Storage          | Hetzner Object Storage           | S3-compatible          |
| Error Tracking        | Sentry                           | Backend + Frontend     |
| Uptime Monitoring     | UptimeRobot                      | 5-minute checks        |
| CI/CD                 | GitHub Actions                   | Deploy on push to main |

### Multi-Tenancy Model

- **Single database, shared schema**: All schools store data in the same PostgreSQL database and the same tables
- **Tenant isolation via `tenant_id`**: Every tenant-scoped table has a `tenant_id UUID NOT NULL` column
- **Row-Level Security (RLS)**: 76 PostgreSQL RLS policies enforce that queries only return rows belonging to the current tenant
- **RLS context injection**: At the start of every database transaction, the middleware runs `SET LOCAL app.current_tenant_id = '{uuid}'` which tells PostgreSQL which tenant's data to return
- **The `users` table is the ONLY exception** -- it is platform-level (a user can belong to multiple schools), guarded at the application layer instead of RLS
- **81 database models** across 10 Prisma migrations covering all modules

### How Subdomains Work

Each school gets a subdomain like `schoolname.edupod.app`. The flow:

1. Cloudflare has a wildcard DNS record (`*.edupod.app` -> `46.62.244.139`, proxied)
2. Any subdomain resolves to the same server
3. Nginx accepts all `*.edupod.app` requests
4. The app reads the `Host` header to determine which school is being accessed
5. The `TenantResolutionMiddleware` looks up the hostname in the `tenant_domains` database table
6. If found and verified, it loads the tenant context and caches it in Redis for 60 seconds
7. All subsequent database queries are scoped to that tenant via RLS

---

## 2. SERVER ACCESS

### Connection Details

| Detail      | Value                          |
| ----------- | ------------------------------ |
| Provider    | Hetzner Cloud                  |
| Server Name | edupod-prod-1                  |
| Location    | Helsinki, Finland              |
| Specs       | 4 VCPU, 16 GB RAM, 160 GB disk |
| Cost        | ~32 EUR/month                  |
| IP Address  | 46.62.244.139                  |
| OS          | Linux (Hetzner base image)     |

### How to SSH In

```bash
ssh root@46.62.244.139
```

- **SSH Key**: `~/.ssh/id_ed25519` (passphrase protected -- you will be prompted for the passphrase)
- **User**: `root`

### If SSH Key Is Lost or Unavailable

1. Go to https://console.hetzner.cloud
2. Log in with the Hetzner account credentials
3. Select the `edupod-prod-1` server
4. Click "Console" in the top right to get browser-based terminal access
5. From there you can add new SSH keys or reset the root password

### Key Paths Once Connected

| What             | Path                                                   |
| ---------------- | ------------------------------------------------------ |
| Application root | `/opt/edupod/app`                                      |
| Environment file | `/opt/edupod/app/.env`                                 |
| API env symlink  | `/opt/edupod/app/apps/api/.env` (symlink to root .env) |
| Nginx config     | `/etc/nginx/sites-available/edupod`                    |
| SSL certificate  | `/etc/ssl/edupod-origin.pem`                           |
| SSL private key  | `/etc/ssl/edupod-origin.key`                           |
| Database backups | `/opt/edupod/backups/`                                 |
| PgBouncer config | `/opt/edupod/pgbouncer/pgbouncer.ini`                  |
| PgBouncer auth   | `/opt/edupod/pgbouncer/userlist.txt`                   |
| PM2 logs         | `/root/.pm2/logs/`                                     |
| Nginx logs       | `/var/log/nginx/`                                      |

---

## 3. ALL SERVICES -- WHAT RUNS AND WHERE

### 3.1 PM2 Managed Processes

PM2 is the process manager that keeps the Node.js applications running. It automatically restarts crashed processes and preserves the process list across server reboots (if `pm2 save` and `pm2 startup` have been run).

| Name            | What It Does                                                                                                                                                                                                                                | Port           | How It Starts                                                   | Log Files                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `api`           | NestJS REST API. Handles all `/api/*` requests. Business logic, authentication, database queries, webhook processing.                                                                                                                       | 3001           | `pnpm --filter @school/api start` (runs `node dist/main`)       | `/root/.pm2/logs/api-out.log` and `/root/.pm2/logs/api-error.log`       |
| `web`           | Next.js frontend. Serves all browser-facing pages. Server-side rendering, static assets, React components.                                                                                                                                  | 5551           | `pnpm --filter @school/web start` (runs `next start`)           | `/root/.pm2/logs/web-out.log` and `/root/.pm2/logs/web-error.log`       |
| `worker`        | BullMQ background job processor. Processes async tasks: email dispatch, PDF generation, search indexing, payroll calculations, import processing, attendance auto-lock, scheduling solver, overdue invoice detection, compliance execution. | None (no HTTP) | `node /opt/edupod/app/apps/worker/dist/apps/worker/src/main.js` | `/root/.pm2/logs/worker-out.log` and `/root/.pm2/logs/worker-error.log` |
| `pm2-logrotate` | Automatic log rotation module. Prevents PM2 log files from filling the disk.                                                                                                                                                                | None           | PM2 module (auto-managed)                                       | Auto                                                                    |

**Important note about the worker path**: The worker's compiled output path is unusual because NestJS monorepo builds mirror the source directory structure. The correct path is:

```
/opt/edupod/app/apps/worker/dist/apps/worker/src/main.js
```

NOT `/opt/edupod/app/apps/worker/dist/main.js`.

#### PM2 Quick Reference Commands

```bash
# See all processes with status, memory, CPU, restarts
pm2 list

# Real-time monitoring dashboard
pm2 monit

# View last 30 lines of logs for a process (snapshot, no live tail)
pm2 logs api --lines 30 --nostream
pm2 logs web --lines 30 --nostream
pm2 logs worker --lines 30 --nostream

# Tail logs live (Ctrl+C to stop)
pm2 logs api
pm2 logs web
pm2 logs worker

# Restart a specific process
pm2 restart api
pm2 restart web
pm2 restart worker

# Restart all processes
pm2 restart all

# Stop a process (keeps it in PM2 list but not running)
pm2 stop api

# Delete a process from PM2 entirely
pm2 delete worker

# Start a new process
pm2 start /opt/edupod/app/apps/worker/dist/apps/worker/src/main.js --name worker

# Save current process list (survives reboot)
pm2 save

# Restore saved process list after reboot
pm2 resurrect

# Clear all log files (frees disk space)
pm2 flush

# Clear logs for one process
pm2 flush api

# Generate startup script (run once, enables PM2 auto-start on boot)
pm2 startup
```

### 3.2 Docker Containers

Docker containers run the data layer services. They are configured with `restart: unless-stopped` so they auto-start after a server reboot.

| Container Name         | Image                  | Bound To         | Port | Purpose                                                                                                                                          |
| ---------------------- | ---------------------- | ---------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `edupod-postgres-1`    | `postgres:16`          | `127.0.0.1:5432` | 5432 | Primary PostgreSQL database. Stores all application data for all tenants.                                                                        |
| `edupod-redis-1`       | `redis:7-alpine`       | `127.0.0.1:6379` | 6379 | Redis with authentication. Used for: tenant domain cache (60s TTL), BullMQ job queues (9 queues), session storage, tenant suspension flags.      |
| `edupod-meilisearch-1` | `getmeili/meilisearch` | `127.0.0.1:7700` | 7700 | Full-text search engine. Provides fuzzy search across students, staff, and other entities.                                                       |
| `pgbouncer`            | `edoburu/pgbouncer`    | `127.0.0.1:6432` | 6432 | PostgreSQL connection pooler. Sits between the app and PostgreSQL. Transaction pooling mode with max 200 client connections and pool size of 20. |

**IMPORTANT**: All Docker ports are bound to `127.0.0.1` (localhost only). They are NOT accessible from the internet. The firewall blocks all ports except 22 (SSH), 80 (HTTP), and 443 (HTTPS).

#### Docker Quick Reference Commands

```bash
# See all running containers
docker ps

# See all containers (including stopped)
docker ps -a

# Start a specific container
docker start edupod-postgres-1
docker start edupod-redis-1
docker start edupod-meilisearch-1
docker start pgbouncer

# Restart a container
docker restart edupod-postgres-1

# Stop a container
docker stop edupod-postgres-1

# View container logs (last 20 lines)
docker logs edupod-postgres-1 --tail 20
docker logs edupod-redis-1 --tail 20
docker logs pgbouncer --tail 20

# Enter a container shell
docker exec -it edupod-postgres-1 bash
```

### 3.3 System Services

| Service | Purpose                                                                                                                                                         | Manage With                                 |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `nginx` | Reverse proxy. Terminates SSL (Cloudflare Origin Certificate). Routes `/` to web (port 5551), `/api` to api (port 3001). Handles all `*.edupod.app` subdomains. | `systemctl start/stop/restart/reload nginx` |
| `ufw`   | Firewall. Only ports 22 (SSH), 80 (HTTP), 443 (HTTPS) are open.                                                                                                 | `ufw status`, `ufw allow/deny`              |
| `cron`  | Scheduled tasks. Runs daily database backup at 3:00 AM server time.                                                                                             | `crontab -l` to view, `crontab -e` to edit  |

### 3.4 BullMQ Job Queues

The worker service processes background jobs across 9 queues:

| Queue Name      | What It Processes                                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payroll`       | Payroll run generation, mass payslip export, approval callbacks                                                                                                                               |
| `notifications` | Email/WhatsApp/in-app notification dispatch, retry failed notifications, announcement publishing, inquiry notifications, stale inquiry detection, IP cleanup, announcement approval callbacks |
| `search-sync`   | Search index updates when data changes, full reindex operations                                                                                                                               |
| `reports`       | Report generation (currently unused, reserved)                                                                                                                                                |
| `attendance`    | Attendance session generation, pending detection alerts, auto-lock after deadline                                                                                                             |
| `scheduling`    | Timetable solver runs, stale scheduling run cleanup                                                                                                                                           |
| `gradebook`     | Mass report card PDF generation, bulk grade import processing                                                                                                                                 |
| `finance`       | Overdue invoice detection, invoice approval callbacks                                                                                                                                         |
| `imports`       | CSV/Excel import validation, import data processing, temporary file cleanup                                                                                                                   |

All job payloads include `tenant_id` for RLS context. Jobs without `tenant_id` are rejected.

---

## 4. NETWORKING AND DNS

### Domain Configuration

| Detail             | Value                      |
| ------------------ | -------------------------- |
| Domain             | `edupod.app`               |
| Registrar          | Namecheap                  |
| DNS Provider       | Cloudflare Pro ($20/month) |
| Cloudflare Account | dash.cloudflare.com        |

### DNS Records

| Type | Name           | Value           | Proxy                  |
| ---- | -------------- | --------------- | ---------------------- |
| A    | `edupod.app`   | `46.62.244.139` | Proxied (orange cloud) |
| A    | `*.edupod.app` | `46.62.244.139` | Proxied (orange cloud) |

The wildcard record means ANY subdomain (e.g., `newschool.edupod.app`) automatically resolves to the server. No DNS changes are needed when onboarding a new school.

### SSL/TLS Configuration

| Detail               | Value                                  |
| -------------------- | -------------------------------------- |
| Cloudflare SSL Mode  | Full (Strict)                          |
| Origin Certificate   | Cloudflare Origin CA certificate       |
| Certificate Covers   | `*.edupod.app` and `edupod.app`        |
| Certificate Expires  | 2041                                   |
| Certificate Location | `/etc/ssl/edupod-origin.pem`           |
| Private Key Location | `/etc/ssl/edupod-origin.key`           |
| Key Permissions      | `chmod 600 /etc/ssl/edupod-origin.key` |

**How SSL works end-to-end:**

1. Browser connects to Cloudflare (Cloudflare provides the browser-facing SSL certificate)
2. Cloudflare connects to origin server on port 443 using the Cloudflare Origin Certificate
3. Nginx terminates SSL using the origin certificate and proxies to the app

### Nginx Configuration

The Nginx config file is at `/etc/nginx/sites-available/edupod`.

**Routing rules:**

| Pattern                                                    | Destination                               | Notes                       |
| ---------------------------------------------------------- | ----------------------------------------- | --------------------------- |
| All traffic on port 80                                     | Redirect to HTTPS (port 443)              | 301 permanent redirect      |
| `edupod.app`, `www.edupod.app`, `*.edupod.app` on port 443 | Active server block                       | SSL with origin cert        |
| `/` (all paths except /api)                                | `http://127.0.0.1:5551` (Next.js web app) | WebSocket upgrade supported |
| `/api` (all API paths)                                     | `http://127.0.0.1:3001` (NestJS API)      | `client_max_body_size 10m`  |

**View the current Nginx config:**

```bash
cat /etc/nginx/sites-available/edupod
```

**Test config for syntax errors:**

```bash
nginx -t
```

**Reload after config changes (does not drop connections):**

```bash
systemctl reload nginx
```

**Full restart (drops active connections):**

```bash
systemctl restart nginx
```

---

## 5. DATABASE

### Connection Details

| Detail         | Value                                            |
| -------------- | ------------------------------------------------ |
| Engine         | PostgreSQL 16                                    |
| Runs In        | Docker container `edupod-postgres-1`             |
| Database Name  | `school_platformedupod_prod`                     |
| User           | `edupod_admin`                                   |
| Password       | `gld1sxrIHUd5SV2U8g7rhNAbAaiQDX9iAVJGsOlSjfs=`   |
| Direct Port    | `localhost:5432` (PostgreSQL container)          |
| PgBouncer Port | `localhost:6432` (the application connects here) |

### How the Application Connects

The application does NOT connect directly to PostgreSQL on port 5432. Instead:

1. App connects to PgBouncer on port 6432
2. PgBouncer pools connections to PostgreSQL on port 5432
3. This allows up to 200 concurrent client connections with only 20 actual PostgreSQL connections

The `DATABASE_URL` in `.env` uses port 6432 (PgBouncer), not port 5432.

### How to Connect to the Database

**Interactive psql session (direct to PostgreSQL):**

```bash
docker exec -it $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod
```

**Run a single query:**

```bash
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "SELECT 1;"
```

### Essential Database Queries

**List all tables:**

```sql
\dt
```

**Check all tenants (schools):**

```sql
SELECT id, name, slug, status FROM tenants;
```

**Check tenant domains and their verification status:**

```sql
SELECT td.domain, td.verification_status, t.name, t.slug
FROM tenant_domains td
JOIN tenants t ON t.id = td.tenant_id;
```

**Check all users:**

```sql
SELECT id, email, first_name, last_name, status FROM users;
```

**Check tenant memberships (which users belong to which schools):**

```sql
SELECT u.email, t.name as school, tm.status
FROM tenant_memberships tm
JOIN users u ON u.id = tm.user_id
JOIN tenants t ON t.id = tm.tenant_id
ORDER BY t.name, u.email;
```

**Check RLS policies count:**

```sql
SELECT count(*) FROM pg_policies;
```

**Check RLS policies on a specific table:**

```sql
SELECT policyname, tablename, cmd, qual FROM pg_policies WHERE tablename = 'students';
```

**Check database size:**

```sql
SELECT pg_size_pretty(pg_database_size('school_platformedupod_prod'));
```

**Check active connections:**

```sql
SELECT count(*) FROM pg_stat_activity WHERE datname = 'school_platformedupod_prod';
```

### PgBouncer

| Detail                 | Value                                 |
| ---------------------- | ------------------------------------- |
| Config File            | `/opt/edupod/pgbouncer/pgbouncer.ini` |
| Auth File              | `/opt/edupod/pgbouncer/userlist.txt`  |
| Pooling Mode           | Transaction                           |
| Max Client Connections | 200                                   |
| Default Pool Size      | 20                                    |
| Port                   | 6432                                  |

**View PgBouncer config:**

```bash
cat /opt/edupod/pgbouncer/pgbouncer.ini
```

**View PgBouncer auth (plain text passwords):**

```bash
cat /opt/edupod/pgbouncer/userlist.txt
```

**Check PgBouncer logs:**

```bash
docker logs pgbouncer --tail 20
```

**Restart PgBouncer:**

```bash
docker restart pgbouncer
```

### Database Migrations

Migrations are managed by Prisma. There are 10 migrations covering all phases:

| Migration                                              | Content                                                  |
| ------------------------------------------------------ | -------------------------------------------------------- |
| `20260316072748_add_p1_tenancy_users_rbac`             | Tenants, users, roles, permissions, RBAC                 |
| `20260316100000_add_p2_core_entities`                  | Households, parents, students, staff, academics, classes |
| `20260316120000_add_p3_admissions`                     | Admission forms, applications, notes                     |
| `20260316140000_add_p4a_scheduling_attendance`         | Rooms, schedules, periods, attendance                    |
| `20260316160000_add_p4b_auto_scheduling`               | Auto-scheduling requirements, preferences, solver runs   |
| `20260316180000_add_p5_gradebook_tables`               | Grading scales, assessments, grades, report cards        |
| `20260316200000_add_p6_finance_tables`                 | Fee structures, invoices, payments, receipts, refunds    |
| `20260316220000_add_p6b_payroll_tables`                | Staff compensation, payroll runs, entries, payslips      |
| `20260316240000_add_p7_communications_cms`             | Notifications, announcements, inquiries, website pages   |
| `20260316260000_add_p8_audit_compliance_import_search` | Audit logs, compliance, imports, search index            |

Each migration has a companion `post_migrate.sql` file that creates RLS policies, triggers, and indexes.

**Run pending migrations:**

```bash
cd /opt/edupod/app
set -a && source .env && set +a
cd packages/prisma
npx prisma migrate deploy
cd /opt/edupod/app
```

**Apply post-migration scripts (RLS policies, triggers, indexes):**

```bash
cd /opt/edupod/app
for f in packages/prisma/migrations/*/post_migrate.sql; do
  docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod < "$f" 2>&1 || true
done
```

**Regenerate Prisma client (needed after Node.js upgrades):**

```bash
cd /opt/edupod/app/packages/prisma
npx prisma generate
```

---

## 6. REDIS

### Connection Details

| Detail      | Value                                               |
| ----------- | --------------------------------------------------- |
| Engine      | Redis 7 (Alpine)                                    |
| Container   | `edupod-redis-1`                                    |
| Port        | `127.0.0.1:6379`                                    |
| Password    | `LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=`      |
| Persistence | `appendonly yes` (data survives container restarts) |

### What Redis Stores

| Data Type              | Key Pattern                | TTL        | Purpose                            |
| ---------------------- | -------------------------- | ---------- | ---------------------------------- |
| Tenant domain cache    | `tenant_domain:{hostname}` | 60 seconds | Avoids DB lookup for every request |
| Tenant suspension flag | `tenant:{id}:suspended`    | No expiry  | Quick check if tenant is suspended |
| BullMQ queues          | `bull:{queue_name}:*`      | Varies     | Background job queues (9 queues)   |
| Sessions               | Session-related keys       | 7 days     | Refresh token sessions             |

### How to Connect to Redis

```bash
docker exec -it $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' --no-auth-warning
```

### Common Redis Commands

**Test connectivity:**

```bash
docker exec -it $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' --no-auth-warning PING
```

Expected response: `PONG`

**Flush a specific tenant domain cache entry:**

```bash
docker exec $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' --no-auth-warning DEL "tenant_domain:al-noor.edupod.app"
```

**View all cached tenant domains:**

```bash
docker exec $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' --no-auth-warning KEYS "tenant_domain:*"
```

**Check BullMQ queue names:**

```bash
docker exec $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' --no-auth-warning KEYS "bull:*" | sort -u | sed 's/bull:\([^:]*\):.*/\1/' | sort -u
```

**Check queue waiting job count:**

```bash
docker exec $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' --no-auth-warning LLEN "bull:notifications:wait"
docker exec $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' --no-auth-warning LLEN "bull:payroll:wait"
docker exec $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' --no-auth-warning LLEN "bull:finance:wait"
```

**View failed jobs in a queue:**

```bash
docker exec $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' --no-auth-warning LRANGE "bull:notifications:failed" 0 -1
```

**Flush ALL Redis data (CAUTION: clears all caches, queues, and sessions -- users will be logged out):**

```bash
docker exec $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' --no-auth-warning FLUSHDB
```

**Check Redis memory usage:**

```bash
docker exec $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' --no-auth-warning INFO memory | grep used_memory_human
```

---

## 7. ENVIRONMENT VARIABLES

All environment variables are stored in a single file: `/opt/edupod/app/.env`

There is a symlink at `/opt/edupod/app/apps/api/.env` that points to the root `.env`. This symlink is required because NestJS's ConfigModule uses `dotenv.parse()` from the current working directory.

### How the API Reads Environment Variables

This is a critical detail that causes confusion:

1. NestJS `ConfigModule` uses `dotenv.parse()` -- this does **NOT** set `process.env` by default
2. **However**, the API has a preload fix in `apps/api/src/instrument.ts` that calls `dotenv.config()` BEFORE anything else runs. This DOES set `process.env`. This is critical because Prisma, BullMQ, and Sentry all read `process.env` directly.
3. **DO NOT remove the dotenv import from `instrument.ts`** -- it is the first import in `main.ts` for a reason. If removed, DATABASE_URL, REDIS_URL, and SENTRY_DSN_BACKEND will all stop working.
4. Every env var used via `ConfigService` must also be listed in the Zod validation schema at `apps/api/src/modules/config/env.validation.ts`
5. If a var is in `.env` but NOT in the Zod schema, it is still available via `process.env` (thanks to the instrument.ts preload), but NOT via `ConfigService`

**The worker** reads `process.env` directly and also uses `ConfigModule.forRoot({ isGlobal: true })`.

### Complete Environment Variable Reference

#### Required Variables (API will not start without these)

| Variable             | Description                                                                                             | Example Value                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string. MUST use port 6432 (PgBouncer), NOT port 5432 (direct PostgreSQL).        | `postgresql://edupod_admin:gld1sxrIHUd5SV2U8g7rhNAbAaiQDX9iAVJGsOlSjfs%3D@localhost:6432/school_platformedupod_prod` |
| `REDIS_URL`          | Redis connection string with password. The `=` characters in the password MUST be URL-encoded as `%3D`. | `redis://:LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI%3D@localhost:6379`                                             |
| `JWT_SECRET`         | Secret for signing JWT access tokens. Minimum 32 characters.                                            | (32+ character random string)                                                                                        |
| `JWT_REFRESH_SECRET` | Secret for signing JWT refresh tokens. Minimum 32 characters. Must be different from JWT_SECRET.        | (32+ character random string)                                                                                        |
| `NODE_ENV`           | Application environment.                                                                                | `production`                                                                                                         |
| `API_URL`            | Internal API URL (server-to-server communication).                                                      | `http://localhost:3001`                                                                                              |
| `APP_URL`            | Public-facing URL. Used in emails, redirects, CORS.                                                     | `https://edupod.app`                                                                                                 |
| `API_PORT`           | Port the NestJS API listens on.                                                                         | `3001`                                                                                                               |

#### Optional Variables (API starts without them but features may be degraded)

| Variable                 | Description                                                                                                                                       | Default              | Example Value                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`    | Frontend API endpoint. Used by Next.js client-side API calls.                                                                                     | None                 | `https://edupod.app/api`                            |
| `S3_REGION`              | Object storage region.                                                                                                                            | None                 | `eu-central`                                        |
| `S3_ENDPOINT`            | Object storage endpoint URL.                                                                                                                      | None                 | `https://edupod-assets.hel1.your-objectstorage.com` |
| `S3_ACCESS_KEY_ID`       | Object storage access key.                                                                                                                        | None                 | (Hetzner Object Storage key)                        |
| `S3_SECRET_ACCESS_KEY`   | Object storage secret key.                                                                                                                        | None                 | (Hetzner Object Storage secret)                     |
| `S3_BUCKET_NAME`         | Object storage bucket name.                                                                                                                       | None                 | `edupod-assets`                                     |
| `MEILISEARCH_URL`        | Meilisearch server URL.                                                                                                                           | None                 | `http://localhost:7700`                             |
| `MEILISEARCH_API_KEY`    | Meilisearch master API key.                                                                                                                       | None                 | (set during Meilisearch setup)                      |
| `RESEND_API_KEY`         | Resend email service API key. Without this, emails will not send.                                                                                 | None                 | `re_...`                                            |
| `RESEND_FROM_EMAIL`      | Email sender address.                                                                                                                             | `noreply@edupod.app` | `noreply@edupod.app`                                |
| `RESEND_WEBHOOK_SECRET`  | Resend webhook signature verification secret.                                                                                                     | None                 | `whsec_...`                                         |
| `STRIPE_WEBHOOK_SECRET`  | Stripe webhook signature verification secret.                                                                                                     | None                 | `whsec_...`                                         |
| `SENTRY_DSN_BACKEND`     | Sentry DSN for API error tracking. Without this, errors are only in PM2 logs.                                                                     | None                 | `https://...@sentry.io/...`                         |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN for frontend error tracking.                                                                                                           | None                 | `https://...@sentry.io/...`                         |
| `ENCRYPTION_KEY`         | AES-256 encryption key for sensitive data (Stripe keys, bank details). 64 hex characters. Also referenced as `ENCRYPTION_KEY_LOCAL` in some docs. | None                 | (64 hex character string)                           |
| `PLATFORM_DOMAIN`        | The platform's main domain. Used for tenant subdomain routing.                                                                                    | `edupod.app`         | `edupod.app`                                        |
| `MFA_ISSUER`             | The issuer name shown in authenticator apps for MFA.                                                                                              | `SchoolOS`           | `EduPod`                                            |
| `CLOUDFLARE_API_TOKEN`   | Cloudflare API token for programmatic DNS management.                                                                                             | None                 | (Cloudflare token)                                  |
| `CLOUDFLARE_ZONE_ID`     | Cloudflare zone ID for edupod.app.                                                                                                                | None                 | (Zone ID from Cloudflare)                           |
| `CLOUDFLARE_ACCOUNT_ID`  | Cloudflare account ID.                                                                                                                            | None                 | (Account ID from Cloudflare)                        |

### CRITICAL: .env Duplicate Key Problem

The `.env` file is prone to accumulating duplicate keys, especially from repeated `echo VAR=value >> .env` commands. When duplicate keys exist, `dotenv` uses the FIRST occurrence, while `source .env` uses the LAST occurrence. This causes inconsistent behavior between the API and worker.

**How to detect duplicates:**

```bash
awk -F= '/^[^#]/ && NF>1 {print $1}' /opt/edupod/app/.env | sort | uniq -d
```

**How to remove duplicates (keeps first occurrence):**

```bash
awk '!seen[$0]++' /opt/edupod/app/.env > /tmp/.env.clean && mv /tmp/.env.clean /opt/edupod/app/.env
```

**After ANY .env change, restart the affected services:**

```bash
pm2 restart api       # For API env vars
pm2 restart worker    # For worker env vars
pm2 restart web       # For NEXT_PUBLIC_* vars (requires rebuild)
```

Note: For `NEXT_PUBLIC_*` variables, changing them in `.env` and restarting `web` may not be sufficient because these are baked into the Next.js build. You may need to rebuild:

```bash
cd /opt/edupod/app
pnpm build --filter @school/web --force
pm2 restart web
```

---

## 8. TENANT MANAGEMENT

### Current Tenants

| School Name                | Slug      | Subdomain            | Default Locale | Timezone   | Currency |
| -------------------------- | --------- | -------------------- | -------------- | ---------- | -------- |
| Al Noor Academy            | `al-noor` | `al-noor.edupod.app` | Arabic (`ar`)  | Asia/Dubai | AED      |
| Cedar International School | `cedar`   | `cedar.edupod.app`   | English (`en`) | Asia/Dubai | AED      |
| Nurul Huda School          | `nhqs`    | `nhqs.edupod.app`    | English (`en`) | Asia/Dubai | AED      |
| Midaad Ul Qalam            | `mdad`    | `mdad.edupod.app`    | Arabic (`ar`)  | Asia/Dubai | AED      |

### How Tenant Resolution Works (Detailed)

1. Browser requests `https://al-noor.edupod.app/en/dashboard`
2. Cloudflare receives the request, verifies its edge SSL cert with the browser
3. Cloudflare connects to origin server `46.62.244.139:443` using the Cloudflare Origin Certificate
4. Nginx receives the request, terminates SSL, reads `Host: al-noor.edupod.app`
5. For `/api/*` paths, Nginx proxies to `http://127.0.0.1:3001`. For all other paths, to `http://127.0.0.1:5551`
6. The `TenantResolutionMiddleware` (in the NestJS API) reads `req.hostname` = `al-noor.edupod.app`
7. It checks Redis for key `tenant_domain:al-noor.edupod.app`
8. **Cache hit**: Uses the cached tenant context (JSON with tenant_id, slug, name, status, default_locale, timezone)
9. **Cache miss**: Queries `tenant_domains` table: `WHERE domain = 'al-noor.edupod.app' AND verification_status = 'verified'`
10. If found and tenant status = `active`: Caches the context in Redis for 60 seconds, attaches to request
11. If tenant status = `suspended`: Returns HTTP 403 `TENANT_SUSPENDED`
12. If tenant status = `archived` or not found: Returns HTTP 404
13. All subsequent database queries in that request use the tenant_id for RLS scoping

**Routes that SKIP tenant resolution** (they work without a tenant subdomain):

- `GET /api/health` and `GET /api/health/ready` (health checks)
- `POST /api/v1/stripe/webhook` (Stripe webhooks -- tenant resolved from payload metadata)
- `POST /api/v1/webhooks/*` (Resend/Twilio webhooks)
- `GET/POST /api/v1/admin/*` (Platform admin routes -- tenant context is null)
- `GET/POST /api/v1/auth/*` (Auth routes -- tenant resolution attempted but not required)
- `POST /api/v1/invitations/accept` (Invitation acceptance)

### How to Onboard a New School

This is a step-by-step procedure. No DNS or Nginx changes are needed -- the wildcard DNS record and Nginx config handle all subdomains automatically.

**Step 1 -- Log in as platform admin:**

Go to `https://edupod.app/en/login` and log in as `admin@edupod.app`.

**Step 2 -- Create the tenant:**

Navigate to Admin -> Tenants -> Create Tenant. Fill in:

- **Name**: The school's full name (e.g., "Springfield Academy")
- **Slug**: URL-safe identifier, used in subdomain (e.g., `springfield` -> `springfield.edupod.app`)
- **Default Locale**: `en` (English) or `ar` (Arabic)
- **Timezone**: e.g., `Asia/Dubai`, `America/New_York`
- **Currency Code**: e.g., `AED`, `USD`, `GBP`
- **Academic Year Start Month**: 1-12 (e.g., 9 for September)

**Step 3 -- Add the subdomain:**

On the tenant detail page, go to the **Domains** tab and add the subdomain (e.g., `springfield.edupod.app`).

**Step 4 -- Verify the domain:**

The domain is created with `verification_status = 'pending'`. If the UI does not auto-verify, update it directly in the database:

```bash
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "UPDATE tenant_domains SET verification_status = 'verified' WHERE domain = 'springfield.edupod.app';"
```

**Step 5 -- Clear the Redis cache:**

```bash
docker exec $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' --no-auth-warning DEL "tenant_domain:springfield.edupod.app"
```

**Step 6 -- Create the school owner user:**

In the platform admin panel, create a new user and assign the `school_owner` role with a tenant membership linking them to the new tenant.

**Step 7 -- Configure tenant modules:**

Enable the feature modules the school needs (e.g., admissions, attendance, gradebook, finance, payroll, communications). This is done in the tenant's settings.

**Step 8 -- Set up Stripe (if school will collect payments):**

In the school's Settings -> Stripe section, configure per-tenant Stripe API keys.

**Step 9 -- Send credentials:**

Provide the school owner with:

- Login URL: `https://springfield.edupod.app/en/login`
- Their email and initial password
- Instructions to change their password on first login

### How to Query Tenant Data

**List all tenants with their domains:**

```bash
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "
SELECT t.name, t.slug, t.status, td.domain, td.verification_status
FROM tenants t
LEFT JOIN tenant_domains td ON td.tenant_id = t.id
ORDER BY t.name;
"
```

**Check which modules are enabled for a tenant:**

```bash
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "
SELECT t.name, tm.module_key, tm.is_enabled
FROM tenant_modules tm
JOIN tenants t ON t.id = tm.tenant_id
ORDER BY t.name, tm.module_key;
"
```

---

## 9. ACCOUNTS AND AUTHENTICATION

### Platform Admin Account

| Field     | Value                                                           |
| --------- | --------------------------------------------------------------- |
| Email     | `admin@edupod.app`                                              |
| Password  | `92xH4sid`                                                      |
| Login URL | `https://edupod.app/en/login`                                   |
| Role      | Platform Admin (can manage all tenants, users, system settings) |

**WARNING**: This password should be changed. To change it, either use the password reset flow in the UI or follow the manual password reset procedure below.

### Test/Demo Accounts

All test accounts use password: `Password123!`

**Al Noor Academy (al-noor.edupod.app):**

| Role         | Email                 |
| ------------ | --------------------- |
| School Owner | `owner@alnoor.test`   |
| School Admin | `admin@alnoor.test`   |
| Teacher      | `teacher@alnoor.test` |
| Parent       | `parent@alnoor.test`  |

**Cedar International School (cedar.edupod.app):**

| Role         | Email                |
| ------------ | -------------------- |
| School Owner | `owner@cedar.test`   |
| School Admin | `admin@cedar.test`   |
| Teacher      | `teacher@cedar.test` |
| Parent       | `parent@cedar.test`  |

**Nurul Huda School (nhqs.edupod.app):**

| Role         | Email               |
| ------------ | ------------------- |
| School Owner | `owner@nhqs.test`   |
| School Admin | `admin@nhqs.test`   |
| Teacher      | `teacher@nhqs.test` |
| Parent       | `parent@nhqs.test`  |

**Midaad Ul Qalam (mdad.edupod.app):**

| Role         | Email               |
| ------------ | ------------------- |
| School Owner | `owner@mdad.test`   |
| School Admin | `admin@mdad.test`   |
| Teacher      | `teacher@mdad.test` |
| Parent       | `parent@mdad.test`  |

**WARNING**: All test accounts use `Password123!`. These must be changed or deleted before any real school data enters the system.

### Authentication Flow

1. User submits email + password to `POST /api/v1/auth/login`
2. API verifies bcrypt-hashed password
3. If MFA is enabled, returns a challenge requiring TOTP code
4. On success, API returns:
   - **Access token**: JWT, 15-minute expiry, stored in browser memory (NOT localStorage)
   - **Refresh token**: httpOnly cookie, 7-day expiry, stored in Redis
5. Frontend includes access token in `Authorization: Bearer {token}` header
6. When access token expires, frontend uses the refresh cookie to get a new one
7. On logout, the refresh token is deleted from Redis

### System Roles

| Role             | Scope         | Permissions                                    |
| ---------------- | ------------- | ---------------------------------------------- |
| `platform_admin` | Platform-wide | Full access to all tenants and system settings |
| `school_owner`   | Per-tenant    | Full access within their school                |
| `school_admin`   | Per-tenant    | Administrative access (configurable)           |
| `teacher`        | Per-tenant    | Class management, gradebook, attendance        |
| `parent`         | Per-tenant    | View children's data, communicate with school  |
| `student`        | Per-tenant    | View own data (limited)                        |

There are 73 granular permissions across all modules. Roles are assigned combinations of these permissions.

### How to Reset a User's Password

**Step 1** -- Generate a bcrypt hash of the new password:

```bash
NEW_HASH=$(node -e "require('/opt/edupod/app/node_modules/.pnpm/bcryptjs@3.0.3/node_modules/bcryptjs').hash('NEWPASSWORD', 10).then(h => process.stdout.write(h))")
```

Replace `NEWPASSWORD` with the desired password.

**Step 2** -- Update the user's password in the database:

```bash
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "UPDATE users SET password_hash = '$NEW_HASH' WHERE email = 'user@email.com';"
```

Replace `user@email.com` with the target user's email.

**Full one-liner example** (resets admin@edupod.app to "NewSecurePassword99!"):

```bash
NEW_HASH=$(node -e "require('/opt/edupod/app/node_modules/.pnpm/bcryptjs@3.0.3/node_modules/bcryptjs').hash('NewSecurePassword99!', 10).then(h => process.stdout.write(h))") && docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "UPDATE users SET password_hash = '$NEW_HASH' WHERE email = 'admin@edupod.app';"
```

### How to Disable MFA for a User (Emergency)

If a user has lost their authenticator app and recovery codes:

```bash
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "
UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE email = 'user@email.com';
DELETE FROM mfa_recovery_codes WHERE user_id = (SELECT id FROM users WHERE email = 'user@email.com');
"
```

---

## 10. MONITORING AND ALERTING

### Sentry (Error Tracking)

| Component   | Config Variable          | Purpose                                                          |
| ----------- | ------------------------ | ---------------------------------------------------------------- |
| Backend API | `SENTRY_DSN_BACKEND`     | Captures all unhandled exceptions, failed requests, slow queries |
| Frontend    | `NEXT_PUBLIC_SENTRY_DSN` | Captures client-side JavaScript errors, React rendering failures |

The API integrates Sentry via `@sentry/nestjs` with a `SentryGlobalFilter` that catches all unhandled exceptions.

**To check Sentry**: Go to https://sentry.io, log in, and view the EduPod project for recent errors.

### UptimeRobot (Uptime Monitoring)

UptimeRobot checks the following URLs every 5 minutes and sends email alerts on downtime:

| Check          | URL                             |
| -------------- | ------------------------------- |
| API Health     | `https://edupod.app/api/health` |
| Web Login Page | `https://edupod.app/en/login`   |

**To configure**: Go to https://uptimerobot.com and log in.

### Health Endpoints

**Basic health check (checks PostgreSQL and Redis):**

```bash
curl -sf http://localhost:3001/api/health
```

Expected response when healthy:

```json
{ "status": "ok", "checks": { "postgres": "up", "redis": "up" } }
```

Expected response when degraded:

```json
{ "status": "degraded", "checks": { "postgres": "up", "redis": "down" } }
```

**Detailed readiness check (includes latency and Meilisearch):**

```bash
curl -sf http://localhost:3001/api/health/ready
```

Expected response:

```json
{
  "status": "ok",
  "checks": {
    "postgres": { "status": "ok", "latency_ms": 2 },
    "redis": { "status": "ok", "latency_ms": 1 },
    "meilisearch": { "status": "ok", "latency_ms": 5 }
  },
  "version": "0.0.0",
  "uptime_seconds": 86400
}
```

Status values:

- `ok` -- all checks pass
- `degraded` -- Postgres and Redis are fine but Meilisearch is down (search won't work but app functions)
- `unhealthy` -- Postgres or Redis is down (app is non-functional)

### PM2 Monitoring

```bash
# Quick status overview
pm2 list

# Real-time CPU and memory monitoring
pm2 monit

# Check restart count (high restart count = crash looping)
pm2 list | grep -E "api|web|worker"
```

---

## 11. BACKUPS

### Automated Backups

| Detail       | Value                                |
| ------------ | ------------------------------------ |
| Schedule     | Daily at 3:00 AM server time         |
| Method       | `pg_dump` compressed with `gzip`     |
| Location     | `/opt/edupod/backups/`               |
| File Pattern | `db-YYYYMMDD.sql.gz`                 |
| Retention    | 15 days (older backups auto-deleted) |
| Managed By   | cron                                 |

**View the cron schedule:**

```bash
crontab -l
```

**List existing backups:**

```bash
ls -lah /opt/edupod/backups/
```

### How to Create a Manual Backup

```bash
docker exec $(docker ps -q --filter ancestor=postgres:16) pg_dump -U edupod_admin school_platformedupod_prod | gzip > /opt/edupod/backups/db-$(date +%Y%m%d-%H%M%S).sql.gz
```

**Verify the backup was created:**

```bash
ls -lah /opt/edupod/backups/ | tail -5
```

### How to Restore from a Backup

**WARNING**: This is a destructive operation. It will overwrite ALL current data. Create a fresh backup before restoring.

```bash
# Step 1: Create a safety backup of current data
docker exec $(docker ps -q --filter ancestor=postgres:16) pg_dump -U edupod_admin school_platformedupod_prod | gzip > /opt/edupod/backups/db-pre-restore-$(date +%Y%m%d-%H%M%S).sql.gz

# Step 2: Stop the application
pm2 stop api worker

# Step 3: Restore from backup (replace YYYYMMDD with actual date)
gunzip -c /opt/edupod/backups/db-YYYYMMDD.sql.gz | docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod

# Step 4: Restart the application
pm2 restart api worker

# Step 5: Verify
sleep 5
curl -sf http://localhost:3001/api/health && echo "API OK"
```

### How to Download a Backup to Your Local Machine

From your local machine:

```bash
scp root@46.62.244.139:/opt/edupod/backups/db-YYYYMMDD.sql.gz ./
```

---

## 12. DEPLOYMENT

### Automatic Deployment (GitHub Actions)

Every push to the `main` branch of the GitHub repository triggers an automatic deployment.

| Detail        | Value                                        |
| ------------- | -------------------------------------------- |
| Repository    | `github.com/ACANOTES-dev/EduPod` (private)   |
| Workflow File | `.github/workflows/deploy.yml`               |
| Trigger       | Push to `main` branch                        |
| Method        | SSH to server, pull, build, migrate, restart |
| Timeout       | 10 minutes                                   |

**What the automated deploy does:**

1. SSH into the server as the deploy user
2. `cd /opt/edupod/app`
3. `git pull origin main`
4. `pnpm install --frozen-lockfile` (falls back to `pnpm install` if lockfile mismatch)
5. Clean stale build cache: `rm -f packages/shared/tsconfig.tsbuildinfo`
6. `pnpm build --force` (builds all packages: shared, prisma, api, web, worker)
7. Source `.env` and run `npx prisma migrate deploy`
8. Apply all `post_migrate.sql` scripts (RLS policies, triggers, indexes)
9. Restart all PM2 processes
10. Wait 5 seconds, run smoke tests against health and login endpoints

**GitHub Actions Secrets Required:**

| Secret            | Value                           |
| ----------------- | ------------------------------- |
| `SSH_HOST`        | `46.62.244.139`                 |
| `SSH_USER`        | `root`                          |
| `SSH_PRIVATE_KEY` | Contents of the SSH private key |

### Manual Deployment (Step-by-Step)

Use this when GitHub Actions is down or you need more control.

```bash
# Step 1: SSH into the server
ssh root@46.62.244.139

# Step 2: Navigate to app directory
cd /opt/edupod/app

# Step 3: Pull latest code
git pull origin main

# Step 4: Install dependencies
pnpm install

# Step 5: Clean stale build caches
rm -f packages/shared/tsconfig.tsbuildinfo

# Step 6: Build all packages
pnpm build --force

# Step 7: Run database migrations
set -a && source .env && set +a
cd packages/prisma && npx prisma migrate deploy && cd /opt/edupod/app

# Step 8: Apply post-migration scripts (RLS policies, triggers, indexes)
for f in packages/prisma/migrations/*/post_migrate.sql; do
  docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod < "$f" 2>&1 || true
done

# Step 9: Restart all services
pm2 restart api web worker
pm2 save

# Step 10: Wait and verify
sleep 5
curl -sf http://localhost:3001/api/health && echo "API OK"
curl -sf http://localhost:5551/en/login > /dev/null && echo "WEB OK"
```

### Important Build Notes

1. **Stale tsbuildinfo**: The `packages/shared` package uses `incremental: true` in its tsconfig. If builds produce no output or stale output, delete the build info:

   ```bash
   rm -f packages/shared/tsconfig.tsbuildinfo
   ```

2. **After Node.js upgrades**: Regenerate the Prisma client:

   ```bash
   cd /opt/edupod/app/packages/prisma && npx prisma generate
   ```

3. **Web app port**: The Next.js web app runs on port **5551** (not the default 3000). Nginx must proxy to 5551. If the web app starts on a different port, check the `PORT` env var or the start script.

4. **Worker dist path**: The compiled worker entry point is at an unusual path due to NestJS monorepo build artifacts:

   ```
   /opt/edupod/app/apps/worker/dist/apps/worker/src/main.js
   ```

   NOT `apps/worker/dist/main.js`.

5. **Build order matters**: The `pnpm build` command uses Turborepo to build in dependency order: `shared` -> `prisma` -> `api`, `web`, `worker`. If you build individual packages, build `shared` first.

### Rollback Procedure

If a deployment breaks things:

```bash
# Step 1: Check recent commits
cd /opt/edupod/app
git log --oneline -10

# Step 2: Revert to the previous commit
git checkout HEAD~1

# Step 3: Rebuild
rm -f packages/shared/tsconfig.tsbuildinfo
pnpm build --force

# Step 4: Restart
pm2 restart api web worker
pm2 save

# Step 5: Verify
sleep 5
curl -sf http://localhost:3001/api/health && echo "API OK"
```

**WARNING**: If migrations were applied in the bad deploy, rolling back code without rolling back the database may cause errors. In that case, you may need to restore from a database backup taken before the deploy.

---

## 13. SECURITY

### Firewall

UFW (Uncomplicated Firewall) is configured to allow only:

| Port | Protocol | Purpose                   |
| ---- | -------- | ------------------------- |
| 22   | TCP      | SSH access                |
| 80   | TCP      | HTTP (redirects to HTTPS) |
| 443  | TCP      | HTTPS                     |

All other ports are blocked from external access. Docker container ports are bound to `127.0.0.1` (localhost only).

**Check firewall status:**

```bash
ufw status
```

**If firewall needs to be re-enabled:**

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### SSL/TLS

- **Browser to Cloudflare**: Cloudflare's edge certificate (automatic, managed by Cloudflare)
- **Cloudflare to Origin**: Cloudflare Origin CA certificate (covers `*.edupod.app` and `edupod.app`, expires 2041)
- **SSL Mode**: Full (Strict) -- Cloudflare verifies the origin certificate's validity
- **Certificate files**: `/etc/ssl/edupod-origin.pem` (cert) and `/etc/ssl/edupod-origin.key` (key, permissions 600)

### Data Encryption

- **Passwords**: Bcrypt hashed with cost factor 10
- **Sensitive fields** (Stripe API keys, bank account details): AES-256-GCM encryption
  - Encryption key stored in `ENCRYPTION_KEY` env var (64 hex characters)
  - Encrypted in database, decrypted only in memory during use
  - API responses show only last 4 characters (e.g., `****4821`)
  - All access to encrypted fields is audit-logged

### Row-Level Security (RLS)

- 76 RLS policies enforce tenant data isolation at the database level
- Every tenant-scoped table has an RLS policy that filters rows by `tenant_id`
- Even if application code has a bug, RLS prevents cross-tenant data leakage
- The `users` table is the only exception (platform-level, guarded at app layer)

### Webhook Verification

| Webhook | Verification Method                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------- |
| Stripe  | `stripe-signature` header verified against `STRIPE_WEBHOOK_SECRET`                                    |
| Resend  | Svix headers (`svix-id`, `svix-timestamp`, `svix-signature`) verified against `RESEND_WEBHOOK_SECRET` |
| Twilio  | `x-twilio-signature` header                                                                           |

### CORS

Restricted to `APP_URL` (https://edupod.app) and `*.edupod.app` subdomains. Requests from other origins are rejected.

### Security Headers

Helmet middleware is enabled on the API, setting security headers including:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (HSTS)

---

## 14. THIRD-PARTY SERVICES

| Service                    | Purpose                                         | Dashboard URL                          | Config Location                                            | Notes                                                                            |
| -------------------------- | ----------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| **Cloudflare**             | DNS, CDN, WAF, SSL                              | https://dash.cloudflare.com            | DNS records, SSL/TLS settings, Page Rules                  | Pro plan ($20/mo). Manages wildcard DNS, origin cert, proxy.                     |
| **Hetzner Cloud**          | Server hosting                                  | https://console.hetzner.cloud          | Server management, console access                          | CCX23 in Helsinki (~32 EUR/mo).                                                  |
| **Hetzner Object Storage** | File storage (logos, CSV imports, GDPR exports) | https://console.hetzner.cloud          | `S3_*` env vars in `.env`                                  | S3-compatible. Bucket: `edupod-assets`. Endpoint: `hel1.your-objectstorage.com`. |
| **Stripe**                 | Payment processing                              | https://dashboard.stripe.com           | Per-tenant config in Settings -> Stripe                    | Each school has its own Stripe keys. Encrypted at rest.                          |
| **Resend**                 | Email delivery                                  | https://resend.com                     | `RESEND_API_KEY` env var                                   | Transactional email. Needs sending domain DNS verification.                      |
| **Sentry**                 | Error monitoring                                | https://sentry.io                      | `SENTRY_DSN_BACKEND` and `NEXT_PUBLIC_SENTRY_DSN` env vars | Captures unhandled exceptions in API and frontend.                               |
| **UptimeRobot**            | Uptime monitoring                               | https://uptimerobot.com                | Web dashboard (no server config)                           | Checks `/api/health` and `/en/login` every 5 minutes.                            |
| **GitHub**                 | Source code, CI/CD                              | https://github.com/ACANOTES-dev/EduPod | Deploy workflow in `.github/workflows/deploy.yml`          | Private repository.                                                              |
| **Twilio**                 | WhatsApp messaging                              | https://console.twilio.com             | WhatsApp Business API config                               | Pre-approved platform-level message templates.                                   |
| **Namecheap**              | Domain registrar                                | https://namecheap.com                  | Domain `edupod.app`                                        | DNS delegated to Cloudflare (NS records point to Cloudflare).                    |

---

## 15. WEBHOOK ENDPOINTS

These are URLs that external services call to notify EduPod about events. They are NOT protected by JWT authentication -- they use their own signature verification.

| Endpoint                  | Full URL                                    | Service | Events Handled                                                | Verification Method                                                                                           |
| ------------------------- | ------------------------------------------- | ------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/api/v1/stripe/webhook`  | `https://edupod.app/api/v1/stripe/webhook`  | Stripe  | `checkout.session.completed`, `payment_intent.payment_failed` | `stripe-signature` header verified against `STRIPE_WEBHOOK_SECRET` env var                                    |
| `/api/v1/webhooks/resend` | `https://edupod.app/api/v1/webhooks/resend` | Resend  | `email.delivered`, `email.bounced`, `email.complained`        | Svix headers (`svix-id`, `svix-timestamp`, `svix-signature`) verified against `RESEND_WEBHOOK_SECRET` env var |
| `/api/v1/webhooks/twilio` | `https://edupod.app/api/v1/webhooks/twilio` | Twilio  | SMS/WhatsApp status updates (`MessageSid`, `MessageStatus`)   | `x-twilio-signature` header                                                                                   |

**Important**: These webhook endpoints are excluded from the `TenantResolutionMiddleware`. The Stripe webhook extracts the `tenant_id` from the payment metadata in the webhook payload. Resend and Twilio webhooks process events at the platform level.

---

## 16. TROUBLESHOOTING GUIDE

### 16.1 Full System Health Check Script

Run this script to verify every component of the system. Copy-paste the entire block:

```bash
echo "=========================================="
echo "  EDUPOD FULL SYSTEM HEALTH CHECK"
echo "  $(date)"
echo "=========================================="
echo ""

# 1. Server resources
echo "--- SERVER RESOURCES ---"
echo "Uptime:"
uptime
echo ""
echo "Memory:"
free -h
echo ""
echo "Disk:"
df -h /
echo ""

# 2. Docker containers
echo "--- DOCKER CONTAINERS ---"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

# 3. PM2 processes
echo "--- PM2 PROCESSES ---"
pm2 list
echo ""

# 4. Nginx
echo "--- NGINX ---"
nginx -t 2>&1
echo "Status: $(systemctl is-active nginx)"
echo ""

# 5. PostgreSQL connectivity
echo "--- POSTGRESQL ---"
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "SELECT 'connected' AS status;" 2>&1 | head -5
echo ""

# 6. PgBouncer
echo "--- PGBOUNCER ---"
docker logs pgbouncer --tail 3 2>&1
echo ""

# 7. Redis connectivity
echo "--- REDIS ---"
docker exec $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' --no-auth-warning PING
echo ""

# 8. Meilisearch
echo "--- MEILISEARCH ---"
curl -sf http://localhost:7700/health 2>&1 || echo "Meilisearch not responding"
echo ""

# 9. API health endpoint
echo "--- API HEALTH ---"
curl -sf http://localhost:3001/api/health 2>&1 || echo "API not responding"
echo ""

# 10. API readiness (detailed)
echo "--- API READINESS ---"
curl -sf http://localhost:3001/api/health/ready 2>&1 || echo "API readiness check failed"
echo ""

# 11. Web app
echo "--- WEB APP ---"
curl -sf http://localhost:5551/en/login > /dev/null 2>&1 && echo "Web app responding OK" || echo "Web app NOT responding"
echo ""

# 12. Tenant domains
echo "--- TENANT DOMAINS ---"
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "SELECT td.domain, td.verification_status, t.name FROM tenant_domains td JOIN tenants t ON t.id = td.tenant_id ORDER BY t.name;" 2>&1
echo ""

# 13. RLS policy count
echo "--- RLS POLICIES ---"
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "SELECT count(*) AS rls_policy_count FROM pg_policies;" 2>&1
echo ""

# 14. Database size
echo "--- DATABASE SIZE ---"
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "SELECT pg_size_pretty(pg_database_size('school_platformedupod_prod')) AS db_size;" 2>&1
echo ""

# 15. Backups
echo "--- BACKUPS ---"
ls -lah /opt/edupod/backups/ 2>/dev/null || echo "No backup directory found"
echo ""

# 16. SSL certificate
echo "--- SSL CERTIFICATE ---"
openssl x509 -in /etc/ssl/edupod-origin.pem -noout -subject -enddate 2>/dev/null || echo "Cannot read SSL certificate"
echo ""

# 17. Firewall
echo "--- FIREWALL ---"
ufw status 2>/dev/null || echo "UFW not installed"
echo ""

# 18. Disk space for logs
echo "--- LOG SIZES ---"
du -sh /root/.pm2/logs/ 2>/dev/null || echo "No PM2 logs"
du -sh /var/log/nginx/ 2>/dev/null || echo "No Nginx logs"
echo ""

# 19. Check for .env duplicates
echo "--- ENV FILE DUPLICATE CHECK ---"
DUPES=$(awk -F= '/^[^#]/ && NF>1 {print $1}' /opt/edupod/app/.env | sort | uniq -d)
if [ -z "$DUPES" ]; then
  echo "No duplicate keys in .env"
else
  echo "WARNING: Duplicate keys found in .env:"
  echo "$DUPES"
fi
echo ""

echo "=========================================="
echo "  HEALTH CHECK COMPLETE"
echo "=========================================="
```

### 16.2 API Not Starting

**Symptoms:** `pm2 list` shows `api` with high restart count or `errored` status.

**Step 1 -- Check the logs:**

```bash
pm2 logs api --lines 30 --nostream
```

**Step 2 -- Identify the error and apply the fix:**

#### Error: "Cannot find module '@school/shared'"

**Root cause:** The shared package's `dist/` directory is missing or stale. This happens after `git pull` when the shared package source changes but the build output is not regenerated.

**Fix:**

```bash
cd /opt/edupod/app
rm -f packages/shared/tsconfig.tsbuildinfo
pnpm build --filter @school/shared --force
pm2 restart api
```

#### Error: "Environment validation failed" or "ZodError"

**Root cause:** A required environment variable is missing or invalid in the `.env` file. The error message will tell you which variable.

**Fix:**

```bash
# Check what's in the error message, then verify the variable
grep "MISSING_VAR_NAME" /opt/edupod/app/.env

# If the variable is missing, add it
echo 'MISSING_VAR_NAME=value' >> /opt/edupod/app/.env

# Check for duplicates after adding
awk -F= '/^[^#]/ && NF>1 {print $1}' /opt/edupod/app/.env | sort | uniq -d

# Restart
pm2 restart api
```

#### Error: "ECONNREFUSED 127.0.0.1:5432" or "ECONNREFUSED 127.0.0.1:6432"

**Root cause:** PostgreSQL or PgBouncer is not running.

**Fix:**

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# If not running, start it
docker start edupod-postgres-1

# Check if PgBouncer is running
docker ps | grep pgbouncer

# If not running, start it
docker start pgbouncer

# Wait for services to be ready
sleep 3

# Restart the API
pm2 restart api
```

#### Error: "NOAUTH Authentication required" (Redis)

**Root cause:** A service's Redis/BullMQ configuration is not passing the Redis password from the `REDIS_URL`. This was fixed in both `app.module.ts` (API) and `worker.module.ts` (worker), but could recur if the code is reverted or a new service is added.

**Details:** The worker module (`apps/worker/src/worker.module.ts`) correctly parses the password from `REDIS_URL`. The API module (`apps/api/src/app.module.ts`) does not. The API's health check and tenant resolution use a separate `RedisService` that correctly authenticates. The issue only affects BullMQ queue operations in the API (enqueuing background jobs).

**Workaround:** Ensure `REDIS_URL` is correct in `.env`. The password's `=` characters must be URL-encoded as `%3D`:

```
REDIS_URL=redis://:LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI%3D@localhost:6379
```

**Permanent fix** (requires code change): Update `apps/api/src/app.module.ts` to include `password: decodeURIComponent(url.password)` in the BullModule connection config, matching how the worker does it.

#### Error: "Cannot find package 'meilisearch'"

**Root cause:** The `meilisearch` npm package is missing from the API's dependencies. This can happen after `rm -rf node_modules` or Node.js upgrades.

**Fix:**

```bash
cd /opt/edupod/app
pnpm add meilisearch --filter @school/api
pm2 restart api
```

#### Error: ".env symlink broken"

**Root cause:** The symlink at `apps/api/.env` is broken or missing.

**Fix:**

```bash
ls -la /opt/edupod/app/apps/api/.env
# If broken or missing:
ln -sf /opt/edupod/app/.env /opt/edupod/app/apps/api/.env
pm2 restart api
```

### 16.3 Web App Not Loading / 500 Error

**Step 1 -- Check the logs:**

```bash
pm2 logs web --lines 30 --nostream
```

#### Error: "clientModules" or similar Next.js internal error

**Root cause:** Stale Next.js build cache.

**Fix:**

```bash
rm -rf /opt/edupod/app/apps/web/.next
cd /opt/edupod/app
pnpm build --filter @school/web --force
pm2 restart web
```

#### Error: "prerender-manifest.json not found"

**Root cause:** The `.next` build directory was deleted but not rebuilt.

**Fix:** Same as above -- rebuild the web app.

#### Web app is serving on the wrong port

The web app must run on port **5551**. Nginx proxies to 5551.

**Check what port the web app is actually on:**

```bash
pm2 logs web --lines 5 --nostream
# Look for: "Local: http://localhost:XXXX"
```

**If it's on the wrong port, update Nginx:**

```bash
# Replace WRONG_PORT with the incorrect port number
sed -i 's|proxy_pass http://127.0.0.1:WRONG_PORT|proxy_pass http://127.0.0.1:5551|' /etc/nginx/sites-available/edupod
nginx -t && systemctl reload nginx
```

### 16.4 Worker Not Running

**Step 1 -- Check the logs:**

```bash
pm2 logs worker --lines 10 --nostream
```

**Step 2 -- If the worker is not in PM2 list at all, start it:**

```bash
pm2 delete worker 2>/dev/null
pm2 start /opt/edupod/app/apps/worker/dist/apps/worker/src/main.js --name worker
pm2 save
```

**Step 3 -- If the worker shows NOAUTH Redis error:**

The worker module at `apps/worker/src/worker.module.ts` correctly parses the Redis password from `REDIS_URL`. Verify `REDIS_URL` in `.env`:

```bash
grep REDIS_URL /opt/edupod/app/.env
```

The URL must include the password with `=` URL-encoded as `%3D`:

```
redis://:LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI%3D@localhost:6379
```

**Step 4 -- If the worker shows "Cannot find module" errors:**

```bash
cd /opt/edupod/app
pnpm build --filter @school/worker --force
pm2 restart worker
```

### 16.5 Subdomain Not Working

If `schoolname.edupod.app` is not loading or showing errors:

**Step 1 -- Check DNS resolution:**

```bash
dig schoolname.edupod.app +short
```

Expected: Cloudflare IP addresses (NOT `46.62.244.139` -- Cloudflare proxied records return Cloudflare IPs).

If no response: Check the Cloudflare DNS dashboard for the wildcard `*.edupod.app` A record.

**Step 2 -- Check the tenant_domains table:**

```bash
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "SELECT domain, verification_status FROM tenant_domains WHERE domain = 'schoolname.edupod.app';"
```

- If no row: The domain hasn't been added to the tenant yet
- If `verification_status = 'pending'`: Update to verified (see below)
- If `verification_status = 'verified'`: Domain is configured correctly

**Step 3 -- Mark domain as verified (if pending):**

```bash
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "UPDATE tenant_domains SET verification_status = 'verified' WHERE domain = 'schoolname.edupod.app';"
```

**Step 4 -- Clear Redis cache:**

```bash
docker exec $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' --no-auth-warning DEL "tenant_domain:schoolname.edupod.app"
```

**Step 5 -- Check the tenant status:**

```bash
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "
SELECT t.name, t.status FROM tenants t
JOIN tenant_domains td ON td.tenant_id = t.id
WHERE td.domain = 'schoolname.edupod.app';
"
```

- If `status = 'suspended'`: The tenant is intentionally suspended. Unsuspend via platform admin.
- If `status = 'archived'`: The tenant has been archived and will return 404.

**Step 6 -- Check Nginx:**

```bash
grep server_name /etc/nginx/sites-available/edupod
```

Must include `*.edupod.app`.

**Step 7 -- Check Cloudflare SSL mode:**

Go to https://dash.cloudflare.com -> SSL/TLS -> Overview. Must be set to **Full (Strict)**.

### 16.6 PgBouncer Issues

#### "auth failed" error

**Root cause:** The password in PgBouncer's `userlist.txt` doesn't match the `DATABASE_URL` password.

```bash
# Check PgBouncer auth file
cat /opt/edupod/pgbouncer/userlist.txt

# Check what password the app is using
grep DATABASE_URL /opt/edupod/app/.env
```

The password in `userlist.txt` and `DATABASE_URL` must match.

#### App can't connect to database

**Root cause:** `DATABASE_URL` in `.env` may be using port 5432 (direct PostgreSQL) instead of 6432 (PgBouncer).

```bash
grep DATABASE_URL /opt/edupod/app/.env
```

The port in the connection string must be `6432`.

#### PgBouncer logs show errors

```bash
docker logs pgbouncer --tail 20
```

#### Restart PgBouncer

```bash
docker restart pgbouncer
```

### 16.7 Database Issues

#### Cannot connect to database

```bash
# Check if container is running
docker ps | grep postgres

# If not running
docker start edupod-postgres-1

# Try connecting
docker exec -it $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "SELECT 1;"
```

#### Check table count

```bash
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "\dt" | tail -5
```

#### Check for long-running queries

```bash
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "
SELECT pid, now() - pg_stat_activity.query_start AS duration, query, state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
AND state != 'idle';
"
```

#### Kill a stuck query

```bash
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "SELECT pg_cancel_backend(PID_NUMBER);"
```

Replace `PID_NUMBER` with the PID from the long-running queries output.

### 16.8 Nginx Issues

#### Check config for syntax errors

```bash
nginx -t
```

#### View error logs

```bash
tail -50 /var/log/nginx/error.log
```

#### View access logs

```bash
tail -50 /var/log/nginx/access.log
```

#### Reload after config changes

```bash
systemctl reload nginx
```

### 16.9 SSL Certificate Issues

The origin certificate expires in 2041, so this is unlikely to be an issue. But if needed:

**Check current certificate:**

```bash
openssl x509 -in /etc/ssl/edupod-origin.pem -noout -subject -enddate
```

**Check certificate permissions:**

```bash
ls -la /etc/ssl/edupod-origin.*
```

The key file must have permissions `600`:

```bash
chmod 600 /etc/ssl/edupod-origin.key
```

**If the certificate needs replacement:**

1. Go to Cloudflare -> SSL/TLS -> Origin Server -> Create Certificate
2. Select: RSA 2048, hostnames: `*.edupod.app` and `edupod.app`, validity: 15 years
3. Copy the certificate to `/etc/ssl/edupod-origin.pem`
4. Copy the private key to `/etc/ssl/edupod-origin.key`
5. Set permissions: `chmod 600 /etc/ssl/edupod-origin.key`
6. Reload Nginx: `systemctl reload nginx`

### 16.10 .env Duplicate Keys

**Symptom:** Unexpected behavior, wrong configuration values, services using different values for the same setting.

**Root cause:** The `.env` file has accumulated duplicate key entries, usually from repeated `echo VAR=value >> .env` commands.

**How dotenv handles duplicates:** It uses the FIRST occurrence. But `source .env` uses the LAST occurrence. This means the API and worker can see different values for the same key.

**Detect duplicates:**

```bash
awk -F= '/^[^#]/ && NF>1 {print $1}' /opt/edupod/app/.env | sort | uniq -d
```

**Remove duplicates (keeps first occurrence):**

```bash
awk '!seen[$0]++' /opt/edupod/app/.env > /tmp/.env.clean && mv /tmp/.env.clean /opt/edupod/app/.env
```

**After cleanup, restart affected services:**

```bash
pm2 restart api worker
```

### 16.11 Meilisearch Not Working

**Check if Meilisearch container is running:**

```bash
docker ps | grep meilisearch
```

**Check Meilisearch health:**

```bash
curl -sf http://localhost:7700/health
```

Expected: `{"status":"available"}`

**If not running:**

```bash
docker start edupod-meilisearch-1
```

**Check API logs for Meilisearch errors:**

```bash
pm2 logs api --lines 30 --nostream | grep -i meili
```

**Note:** Meilisearch is optional. If it's down, the API enters "degraded" mode -- search features won't work but all other features function normally.

---

## 17. EMERGENCY PROCEDURES

### 17.1 Complete System Down (Nothing Works)

Follow these steps in order:

```bash
# Step 1: Check if the server is reachable
ping -c 3 46.62.244.139

# Step 2: SSH in
ssh root@46.62.244.139

# Step 3: Check Docker containers
docker ps -a

# Step 4: Start any stopped containers
docker start edupod-postgres-1 edupod-redis-1 edupod-meilisearch-1 pgbouncer

# Step 5: Wait for databases to be ready
sleep 5

# Step 6: Verify database is up
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "SELECT 1;"

# Step 7: Verify Redis is up
docker exec $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' --no-auth-warning PING

# Step 8: Check PM2 processes
pm2 list

# Step 9: Restart all PM2 processes
pm2 restart all
pm2 save

# Step 10: Check Nginx
nginx -t && systemctl restart nginx

# Step 11: Wait for services to start
sleep 5

# Step 12: Verify everything
curl -sf http://localhost:3001/api/health && echo "API OK" || echo "API FAILED"
curl -sf http://localhost:5551/en/login > /dev/null && echo "WEB OK" || echo "WEB FAILED"
```

If the server is NOT reachable by SSH:

1. Go to https://console.hetzner.cloud
2. Select the `edupod-prod-1` server
3. Check if the server is running -- if stopped, start it
4. Use the browser console for terminal access
5. If the server won't start, open a Hetzner support ticket

### 17.2 Server Reboot Recovery

After a planned or unplanned reboot, Docker containers with `restart: unless-stopped` and PM2 processes (if `pm2 save` and `pm2 startup` were run) should auto-start. Verify:

```bash
# Check Docker containers
docker ps

# Check PM2 processes
pm2 list

# If PM2 processes didn't auto-start
pm2 resurrect

# Verify health
curl -sf http://localhost:3001/api/health && echo "API OK"
curl -sf http://localhost:5551/en/login > /dev/null && echo "WEB OK"
```

### 17.3 Database Corruption / Need to Restore

```bash
# Step 1: List available backups
ls -lah /opt/edupod/backups/

# Step 2: Create a safety backup of current (possibly corrupt) data
docker exec $(docker ps -q --filter ancestor=postgres:16) pg_dump -U edupod_admin school_platformedupod_prod | gzip > /opt/edupod/backups/db-pre-restore-$(date +%Y%m%d-%H%M%S).sql.gz

# Step 3: Stop the application
pm2 stop api worker

# Step 4: Restore from the most recent good backup
gunzip -c /opt/edupod/backups/db-YYYYMMDD.sql.gz | docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod

# Step 5: Restart the application
pm2 restart api worker

# Step 6: Verify
sleep 5
curl -sf http://localhost:3001/api/health && echo "API OK"
```

### 17.4 Disk Space Full

```bash
# Check disk usage
df -h

# Check what's using space
du -sh /opt/edupod/app/node_modules/
du -sh /opt/edupod/app/apps/*/dist/
du -sh /opt/edupod/app/apps/web/.next/
du -sh /root/.pm2/logs/
du -sh /var/log/nginx/
du -sh /opt/edupod/backups/
du -sh /var/lib/docker/

# Clear PM2 logs (can grow to GB)
pm2 flush

# Clear old backups (keeps last 3)
ls -t /opt/edupod/backups/*.sql.gz | tail -n +4 | xargs rm -f

# Clear Docker build cache and stopped containers
docker system prune -f

# Clear old Nginx logs
truncate -s 0 /var/log/nginx/access.log
truncate -s 0 /var/log/nginx/error.log
systemctl reload nginx
```

### 17.5 Memory Exhaustion

```bash
# Check memory usage
free -h

# Check per-process memory
pm2 list

# Identify the highest memory process and restart it
pm2 restart web     # Next.js typically uses the most memory
pm2 restart api
pm2 restart worker

# Check Docker container memory
docker stats --no-stream
```

### 17.6 High CPU Usage

```bash
# Check what's consuming CPU
top -bn1 | head -20

# Check PM2 process CPU
pm2 monit

# If a process is stuck at high CPU, restart it
pm2 restart api
```

### 17.7 Tenant Suspension (Emergency)

To immediately block a school's access:

```bash
# Step 1: Update tenant status in database
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "UPDATE tenants SET status = 'suspended' WHERE slug = 'school-slug';"

# Step 2: Set Redis suspension flag (for immediate effect without waiting for cache expiry)
TENANT_ID=$(docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -t -c "SELECT id FROM tenants WHERE slug = 'school-slug';" | tr -d ' ')
docker exec $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' --no-auth-warning SET "tenant:${TENANT_ID}:suspended" "true"

# Step 3: Clear the domain cache so next request picks up suspension
docker exec $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' --no-auth-warning DEL "tenant_domain:school-slug.edupod.app"
```

The school will immediately see HTTP 403 `TENANT_SUSPENDED` on their next request.

To unsuspend:

```bash
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "UPDATE tenants SET status = 'active' WHERE slug = 'school-slug';"
TENANT_ID=$(docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -t -c "SELECT id FROM tenants WHERE slug = 'school-slug';" | tr -d ' ')
docker exec $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' --no-auth-warning DEL "tenant:${TENANT_ID}:suspended"
docker exec $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI=' --no-auth-warning DEL "tenant_domain:school-slug.edupod.app"
```

---

## 18. KEY FILE PATHS REFERENCE

| Path                                                                             | Purpose                                               |
| -------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `/opt/edupod/app`                                                                | Application root directory                            |
| `/opt/edupod/app/.env`                                                           | Master environment configuration file                 |
| `/opt/edupod/app/apps/api/.env`                                                  | Symlink to root `.env` (required by NestJS dotenv)    |
| `/opt/edupod/app/apps/api/src`                                                   | API source code (NestJS)                              |
| `/opt/edupod/app/apps/api/src/app.module.ts`                                     | Root API module (BullMQ config, middleware setup)     |
| `/opt/edupod/app/apps/api/src/modules/config/env.validation.ts`                  | Zod schema defining all valid env vars                |
| `/opt/edupod/app/apps/api/src/common/middleware/tenant-resolution.middleware.ts` | Tenant resolution from hostname                       |
| `/opt/edupod/app/apps/api/src/modules/health/health.controller.ts`               | Health check endpoints                                |
| `/opt/edupod/app/apps/api/src/modules/health/health.service.ts`                  | Health check logic (Postgres, Redis, Meilisearch)     |
| `/opt/edupod/app/apps/api/src/modules/finance/stripe-webhook.controller.ts`      | Stripe webhook handler                                |
| `/opt/edupod/app/apps/api/src/modules/communications/webhook.controller.ts`      | Resend/Twilio webhook handlers                        |
| `/opt/edupod/app/apps/web/src`                                                   | Frontend source code (Next.js)                        |
| `/opt/edupod/app/apps/worker/src`                                                | Worker source code (BullMQ processors)                |
| `/opt/edupod/app/apps/worker/src/worker.module.ts`                               | Worker root module (queue registration, Redis config) |
| `/opt/edupod/app/apps/worker/src/base/queue.constants.ts`                        | Queue name constants                                  |
| `/opt/edupod/app/apps/worker/dist/apps/worker/src/main.js`                       | Compiled worker entry point (PM2 runs this)           |
| `/opt/edupod/app/packages/prisma/schema.prisma`                                  | Database schema definition (81 models)                |
| `/opt/edupod/app/packages/prisma/migrations/`                                    | Database migration files (10 migrations)              |
| `/opt/edupod/app/packages/prisma/seed.ts`                                        | Database seed script                                  |
| `/opt/edupod/app/packages/prisma/seed/dev-data.ts`                               | Test tenant and user definitions                      |
| `/opt/edupod/app/packages/prisma/seed/permissions.ts`                            | Permission seed data (73 permissions)                 |
| `/opt/edupod/app/packages/prisma/seed/system-roles.ts`                           | System role definitions                               |
| `/opt/edupod/app/packages/shared/src`                                            | Shared types, Zod schemas, constants                  |
| `/opt/edupod/app/packages/ui/`                                                   | Shared UI component library (shadcn/Radix)            |
| `/opt/edupod/pgbouncer/pgbouncer.ini`                                            | PgBouncer configuration                               |
| `/opt/edupod/pgbouncer/userlist.txt`                                             | PgBouncer authentication credentials                  |
| `/opt/edupod/backups/`                                                           | Database backup files                                 |
| `/etc/nginx/sites-available/edupod`                                              | Nginx reverse proxy configuration                     |
| `/etc/ssl/edupod-origin.pem`                                                     | Cloudflare Origin CA certificate                      |
| `/etc/ssl/edupod-origin.key`                                                     | Origin certificate private key                        |
| `/root/.pm2/logs/api-out.log`                                                    | API stdout log                                        |
| `/root/.pm2/logs/api-error.log`                                                  | API stderr log                                        |
| `/root/.pm2/logs/web-out.log`                                                    | Web stdout log                                        |
| `/root/.pm2/logs/web-error.log`                                                  | Web stderr log                                        |
| `/root/.pm2/logs/worker-out.log`                                                 | Worker stdout log                                     |
| `/root/.pm2/logs/worker-error.log`                                               | Worker stderr log                                     |
| `/var/log/nginx/access.log`                                                      | Nginx access log                                      |
| `/var/log/nginx/error.log`                                                       | Nginx error log                                       |
| `.github/workflows/deploy.yml`                                                   | GitHub Actions deployment workflow                    |

---

## 19. CONTACT AND ESCALATION

### Before Escalating

1. Run the full health check script (Section 16.1)
2. Check PM2 logs for the affected service
3. Check Sentry (https://sentry.io) for recent errors
4. Check UptimeRobot (https://uptimerobot.com) for downtime history
5. Check Cloudflare (https://dash.cloudflare.com) for DNS/SSL issues
6. Check Hetzner (https://console.hetzner.cloud) for server issues

### Escalation Contacts

| Contact               | Details                                    |
| --------------------- | ------------------------------------------ |
| Platform Owner        | `admin@edupod.app`                         |
| GitHub Repository     | `github.com/ACANOTES-dev/EduPod` (private) |
| Sentry Dashboard      | https://sentry.io                          |
| Cloudflare Dashboard  | https://dash.cloudflare.com                |
| Hetzner Console       | https://console.hetzner.cloud              |
| UptimeRobot Dashboard | https://uptimerobot.com                    |

### When to Escalate

- **Immediately**: Data loss, security breach, or complete system failure that cannot be resolved with this manual
- **Within 1 hour**: Partial system failure affecting one or more schools
- **Within 24 hours**: Non-critical issues like Meilisearch down (search degraded but app functional), performance degradation, or configuration questions not covered by this manual

---

## APPENDIX A: RESOLVED ISSUES (for historical reference)

All items below were identified and resolved during the deployment session on 2026-03-18. They are documented here so support staff understand the fixes if symptoms recur.

### A.1 API BullMQ Redis Password — RESOLVED

**Issue:** The API's BullModule in `app.module.ts` was not extracting the Redis password from `REDIS_URL`.
**Fix applied:** Password extraction added: `password: url.password ? decodeURIComponent(url.password) : undefined`
**If it recurs:** Check `apps/api/src/app.module.ts` BullModule.forRootAsync factory — ensure the password line is present.

### A.2 Web App Port — RESOLVED

**Issue:** Web app runs on port 5551, not 3000. Deploy workflow and Nginx were pointing to wrong port.
**Fix applied:** Nginx updated to proxy to 5551. Deploy workflow smoke test updated to check 5551.
**If it recurs:** Check `pm2 logs web --lines 5 --nostream` for the actual port, then verify Nginx matches: `grep proxy_pass /etc/nginx/sites-available/edupod`

### A.3 Node.js Version — RESOLVED

**Issue:** Server was running Node.js v20, project requires v24+.
**Fix applied:** Upgraded to Node.js v24.14.0 via NodeSource. Prisma client regenerated.
**If it recurs after future upgrades:** Always run `cd packages/prisma && npx prisma generate` after changing Node.js versions.

### A.4 Resend Email Domain — RESOLVED

**Issue:** Sending domain was not verified.
**Fix applied:** `edupod.app` verified in Resend with DKIM, SPF, and MX records added to Cloudflare DNS. API key set in `.env`. From address: `noreply@edupod.app`.

### A.5 process.env Not Set by ConfigModule — RESOLVED

**Issue:** NestJS ConfigModule uses `dotenv.parse()` which does NOT set `process.env`. Prisma, BullMQ, and Sentry read `process.env` directly and couldn't find their env vars (DATABASE_URL, REDIS_URL, SENTRY_DSN_BACKEND).
**Fix applied:** Added `import { config } from 'dotenv'` with explicit `.env` path loading in `apps/api/src/instrument.ts` (the first file imported by `main.ts`). This loads all `.env` vars into `process.env` before any module initializes.
**If it recurs:** Check that `instrument.ts` is the FIRST import in `main.ts` and contains the dotenv config() calls.

### A.6 Empty Migration Files — RESOLVED

**Issue:** Migrations for P5 (gradebook), P6 (finance), P6B (payroll), P7 (communications) were empty placeholder comments. A fresh database would be missing all those tables.
**Fix applied:** All 4 migration files backfilled with complete idempotent DDL (945 lines of SQL using `CREATE TABLE IF NOT EXISTS`).

---

## APPENDIX B: CREDENTIAL VAULT CHECKLIST

**CRITICAL:** This manual contains server commands and technical procedures, but NOT the login credentials for third-party dashboards. If the platform owner is unavailable, support staff will be locked out of these services without a separate credential store.

The platform owner MUST maintain a secure credential vault (1Password, Bitwarden, or sealed envelope) containing:

| Service            | What to Store                            | URL                                    |
| ------------------ | ---------------------------------------- | -------------------------------------- |
| **Hetzner Cloud**  | Account email + password                 | https://console.hetzner.cloud          |
| **Cloudflare**     | Account email + password                 | https://dash.cloudflare.com            |
| **GitHub**         | Account credentials or PAT               | https://github.com/ACANOTES-dev/EduPod |
| **Sentry**         | Account email + password                 | https://sentry.io                      |
| **UptimeRobot**    | Account email + password                 | https://uptimerobot.com                |
| **Resend**         | Account email + password                 | https://resend.com                     |
| **Stripe**         | Account email + password                 | https://dashboard.stripe.com           |
| **Namecheap**      | Account credentials (domain registrar)   | https://namecheap.com                  |
| **SSH Key**        | Copy of `~/.ssh/id_ed25519` + passphrase | Physical/encrypted backup              |
| **Platform Admin** | `admin@edupod.app` + password            | https://edupod.app/en/login            |

**Without this vault, a support hire cannot:**

- Modify DNS records (Cloudflare)
- Access the server if SSH key is lost (Hetzner console)
- View error reports (Sentry)
- Manage email delivery (Resend)
- Update uptime monitors (UptimeRobot)
- Deploy code (GitHub)
- Manage payments (Stripe)

---

_This document was last revised on 2026-03-18 after all deployment issues were resolved. It consolidates information from DEPLOYMENT-STATUS.md, OPERATIONS-RUNBOOK.md, the application source code, and project infrastructure documentation. All items in Appendix A have been resolved — they are retained for historical reference only._

### Test of everything

1. Full verification script. SSH back in and run this:

ssh root@46.62.244.139

Then run each block one at a time:

Services Running

echo "=== PM2 Processes ==="
pm2 list
echo ""
echo "=== Docker Containers ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "=== Nginx ==="
nginx -t 2>&1
echo ""
echo "=== Firewall ==="
ufw status
echo ""
echo "=== Node Version ==="
node -v

Connectivity

echo "=== API Health ==="
curl -sf http://localhost:3001/api/health
echo ""
echo "=== Web (local) ==="
curl -sf http://localhost:5551/en/login > /dev/null && echo "WEB OK" || echo "WEB FAIL"
echo ""
echo "=== API via Cloudflare ==="
curl -sf https://edupod.app/api/health
echo ""
echo "=== Web via Cloudflare ==="
curl -sf https://edupod.app/en/login > /dev/null && echo "WEB OK" || echo "WEB FAIL"
echo ""
echo "=== Subdomain (al-noor) ==="
curl -sf https://al-noor.edupod.app/en/login > /dev/null && echo "SUBDOMAIN OK" || echo "SUBDOMAIN FAIL"
echo ""
echo "=== Subdomain (nhqs) ==="
curl -sf https://nhqs.edupod.app/en/login > /dev/null && echo "SUBDOMAIN OK" || echo "SUBDOMAIN FAIL"

Database & PgBouncer

echo "=== PgBouncer ==="
docker logs pgbouncer --tail 3
echo ""
echo "=== DB via PgBouncer ==="
grep DATABASE_URL /opt/edupod/app/.env | grep -o 'localhost:[0-9]_'
echo ""
echo "=== Tenant Count ==="
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -t -c "SELECT
count(_) FROM tenants;"
echo ""
echo "=== Tenant Domains ==="
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -c "SELECT domain,
verification_status FROM tenant_domains;"
echo ""
echo "=== RLS Policies Count ==="
docker exec -i $(docker ps -q --filter ancestor=postgres:16) psql -U edupod_admin -d school_platformedupod_prod -t -c "SELECT
count(\*) FROM pg_policies;"

Redis

echo "=== Redis Ping ==="
docker exec $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI='
--no-auth-warning PING
echo ""
echo "=== Redis Persistence ==="
docker exec $(docker ps -q --filter ancestor=redis:7-alpine) redis-cli -a 'LSEQEsf1zDI9YsJTc7SMHmHqcEDzATpT4ENZeewFGhI='
--no-auth-warning CONFIG GET appendonly

Auth Test

echo "=== Login Test ==="
BODY='{"email":"admin@edupod.app","password":"92xH4sid"}'
curl -sf -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d "$BODY" | head -c 100
echo "..."

Env & Config

echo "=== Key .env vars ==="
grep -E '^(DATABASE_URL|REDIS_URL|API_PORT|S3_ENDPOINT|MEILISEARCH_URL|SENTRY_DSN|RESEND_FROM_EMAIL|STRIPE_WEBHOOK_SECRET|ENCRYPTION
\_KEY_LOCAL)' /opt/edupod/app/.env | sed 's/=.\*/=**_SET_**/'
echo ""
echo "=== .env symlink ==="
ls -la /opt/edupod/app/apps/api/.env
echo ""
echo "=== Backup cron ==="
crontab -l
echo ""
echo "=== Backup files ==="
ls -lh /opt/edupod/backups/
echo ""
echo "=== SSL cert ==="
ls -la /etc/ssl/edupod-origin.pem /etc/ssl/edupod-origin.key
echo ""
echo "=== Log rotation ==="
pm2 conf pm2-logrotate 2>/dev/null | grep -E "max_size|retain|compress"
