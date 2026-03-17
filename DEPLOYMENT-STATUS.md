# Edupod Production Deployment Status

**Date:** 2026-03-17
**Server:** Hetzner Cloud (edupod-prod-1)
**Domain:** edupod.app

---

## Infrastructure

| Component | Details |
|-----------|---------|
| Server | Hetzner Cloud `edupod-prod-1` at `46.62.244.139` |
| Specs | 4 VCPU, 16 GB RAM, 160 GB disk (~32 EUR/month) |
| SSH | `root@46.62.244.139` using `~/.ssh/id_ed25519` (passphrase protected) |
| App root | `/opt/edupod/app` |
| OS | Linux (Hetzner base image) |

### Docker Services

| Service | Port | Notes |
|---------|------|-------|
| PostgreSQL 16 | 5432 | Primary database |
| Redis 7 | 6379 | Auth enabled, used for BullMQ queues and session cache |
| Meilisearch | 7700 | Full-text search engine |

### PM2 Processes

| Process | Port | Entry Point |
|---------|------|-------------|
| `api` | 3001 | NestJS API server |
| `web` | 3000 | Next.js frontend |
| `worker` | n/a | `/opt/edupod/app/apps/worker/dist/apps/worker/src/main.js` |

### Nginx

- Reverse proxy on ports 80 and 443
- Handles `edupod.app` and `*.edupod.app`
- Proxies `/api` requests to the API on port 3001, all other requests to the web app on port 3000

### SSL and DNS

- **Domain registrar/DNS:** Cloudflare (Pro plan)
- **SSL mode:** Cloudflare set to "Full" (not Full Strict)
- **Origin certificate:** Certbot-issued cert for `edupod.app` (does not cover wildcard subdomains)
- **Wildcard DNS:** `*.edupod.app` A record pointing to `46.62.244.139` (Cloudflare proxied)
- Cloudflare API token, zone ID, and account ID are configured in the environment

---

## Code Fixes Applied During Deployment

### 1. Worker TypeScript Errors (pre-existing)

36 strict-mode TypeScript errors were already resolved in prior commits. These covered `Prisma.sql`, `Prisma.Decimal`, untyped `tx` parameters, and unsafe array index access.

### 2. Duplicate Admissions Route Removed

`apps/web/src/app/[locale]/(public)/admissions/page.tsx` conflicted with the existing `(school)/admissions` route group. The public duplicate was removed.

### 3. Worker Redis Authentication

BullMQ connection configuration was not passing the password extracted from `REDIS_URL`. Updated to parse and forward Redis auth credentials.

### 4. Meilisearch Connection Fix

`MeilisearchClient` was reading `process.env` directly instead of using NestJS `ConfigService`. Refactored to use `ConfigService` and added `MEILISEARCH_URL` and `MEILISEARCH_API_KEY` to the environment validation schema.

### 5. Meilisearch Package Installation

Installed the `meilisearch` npm package in `@school/api` (it was referenced in code but missing from dependencies).

### 6. Root Route 500 Error

A duplicate `[locale]/page.tsx` conflicted with `(public)/page.tsx`, causing a 500 on the root URL. The duplicate was removed.

### 7. S3 Configuration for Hetzner Object Storage

Replaced AWS-specific S3 configuration with generic environment variables compatible with any S3-compatible provider:

- `S3_ENDPOINT`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

This allows the app to use Hetzner Object Storage (or any S3-compatible service) without code changes.

### 8. Shared S3 Helpers

Created `s3.helpers.ts` in the worker package to centralise all S3 operations (upload, download, signed URLs) rather than duplicating S3 client setup across processors.

### 9. Deploy Workflow Improvements

Updated the GitHub Actions deploy workflow to:

- Clean stale `.tsbuildinfo` files before builds
- Run Prisma migrations automatically
- Apply all `post_migrate.sql` scripts (RLS policies, triggers, indexes)
- Start the worker process
- Run smoke tests after deployment

### 10. Backfilled Empty Migration Files

Four Prisma migration files (P5 gradebook, P6 finance, P6B payroll, P7 communications) were empty -- they had been generated but never populated with DDL. Backfilled all four with complete, idempotent SQL totalling 945 lines. This ensures `prisma migrate deploy` applies the full schema on a fresh database.

---

## Database State

### Migrations

All 10 Prisma migrations have been applied successfully. The schema was additionally synced via `prisma db push` to pick up any tables that the previously-empty migration files had missed.

### Post-Migration Scripts

All `post_migrate.sql` scripts have been applied, covering:

- Row-Level Security policies for every tenant-scoped table
- Database triggers (e.g., `updated_at` auto-update, sequence number generation)
- Performance indexes across all 10 phases

### Seed Data

The seed script completed successfully and populated:

- **73 permissions** across all modules
- **System roles** (platform_admin, school_owner, school_admin, teacher, parent, student)
- **4 tenants:**
  - Al Noor Academy
  - Cedar International School
  - Nurul Huda School
  - Midaad Ul Qalam
- **Platform admin** and **16 school users** (owner, admin, teacher, parent per school)
- Rooms, schedules, and notification templates

---

## Accounts

### Platform Admin

| Field | Value |
|-------|-------|
| Email | `admin@edupod.app` |
| Password | Changed from default to a custom password during deployment |
| Login URL | `https://edupod.app/en/login` |

### School Owner Accounts

| School | Email | Password |
|--------|-------|----------|
| Al Noor Academy | `owner@alnoor.test` | `Password123!` |
| Cedar International School | `owner@cedar.test` | `Password123!` |
| Nurul Huda School | `owner@nhqs.test` | `Password123!` |
| Midaad Ul Qalam | `owner@mdad.test` | `Password123!` |

> **WARNING:** All school owner accounts and test users (teacher, admin, parent per school) use `Password123!`. These must be changed before any real school is onboarded.

---

## Connected Services

### Meilisearch

Connected at `localhost:7700`. Used for full-text search across students, staff, and other entities.

### Hetzner Object Storage (S3-compatible)

| Setting | Value |
|---------|-------|
| Bucket | `edupod-assets` |
| Endpoint | `hel1.your-objectstorage.com` |
| SDK | `@aws-sdk/client-s3` with custom endpoint |

### Stripe Webhooks

| Setting | Value |
|---------|-------|
| Secret | Configured (`whsec_...`) |
| Endpoint | `/api/v1/stripe/webhook` |
| Events | `checkout.session.completed`, `payment_intent.payment_failed` |

### Resend Webhooks

| Setting | Value |
|---------|-------|
| Secret | Configured (`whsec_...`) |
| Endpoint | `/api/v1/webhooks/resend` |
| Events | `email.delivered`, `email.bounced`, `email.complained` |

### Cloudflare

API token, zone ID, and account ID are configured in the environment for programmatic DNS and proxy management.

---

## Subdomain and Tenant Domain Routing

### How It Works

1. Cloudflare wildcard DNS (`*.edupod.app`) routes all subdomains to the origin server
2. Nginx accepts all `*.edupod.app` requests with SSL
3. The app resolves the tenant from the `Host` header using the `tenant_domains` table
4. RLS context is set for the resolved tenant before any database operation

### Verified Tenant Domains

| Tenant | Subdomain |
|--------|-----------|
| Al Noor Academy | `al-noor.edupod.app` |
| Cedar International School | `cedar.edupod.app` |
| Nurul Huda School | `nhqs.edupod.app` |
| Midaad Ul Qalam | `mdad.edupod.app` |

### Adding a New Tenant Subdomain

No DNS changes are needed. The wildcard record handles all subdomains. To add a new tenant:

1. Create the tenant in the platform admin panel
2. Add the subdomain in the tenant's Domains tab
3. The subdomain is immediately routable

---

## Environment Configuration

All environment variables are stored in `/opt/edupod/app/.env`. The API reads this via NestJS `ConfigModule` (dotenv), with a symlink at `apps/api/.env` pointing to the root `.env`.

### Key Variables

| Variable | Value / Notes |
|----------|---------------|
| `DATABASE_URL` | PostgreSQL connection string (local) |
| `REDIS_URL` | Redis connection string with auth |
| `JWT_SECRET` | JWT signing key |
| `JWT_REFRESH_SECRET` | Refresh token signing key |
| `API_PORT` | `3001` |
| `APP_URL` | `https://edupod.app` |
| `NEXT_PUBLIC_API_URL` | `https://edupod.app/api` |
| `S3_REGION` | Hetzner region |
| `S3_ENDPOINT` | Hetzner Object Storage endpoint |
| `S3_ACCESS_KEY_ID` | Object storage access key |
| `S3_SECRET_ACCESS_KEY` | Object storage secret key |
| `S3_BUCKET_NAME` | `edupod-assets` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `RESEND_WEBHOOK_SECRET` | Resend webhook signing secret |
| `MEILISEARCH_URL` | `http://localhost:7700` |
| `MEILISEARCH_API_KEY` | Meilisearch master key |

---

## What Is NOT Done Yet

### Critical -- Before First Real School

1. **Database backups:** No backup strategy exists. A daily `pg_dump` cron job must be set up, ideally writing to Hetzner Object Storage or an off-server location.

2. **Change test user passwords:** All seeded `.test` users have `Password123!`. Either delete these accounts or change their passwords before any real school data enters the system.

3. **Resend email sending domain:** The webhook secret is configured, but no sending domain has been verified in the Resend dashboard. DNS records (SPF, DKIM, DMARC) need to be added to Cloudflare for the chosen sending domain.

4. **Firewall:** The server currently has no firewall rules. `ufw` should be configured to allow only ports 22 (SSH), 80 (HTTP), and 443 (HTTPS).

5. **End-to-end smoke test:** Walk through each module as different user roles (owner, admin, teacher, parent) across multiple tenants. Verify RLS isolation -- no cross-tenant data leakage.

### Important -- Before Scaling

6. **PgBouncer:** The app connects directly to PostgreSQL without connection pooling. Under load, this will exhaust available connections. PgBouncer should be deployed in transaction mode.

7. **Monitoring:** No error tracking (Sentry) and no uptime monitoring. Add `SENTRY_DSN_BACKEND` to the environment and set up UptimeRobot (or similar) for `https://edupod.app` and `https://al-noor.edupod.app`.

8. **Node.js upgrade:** The server runs Node.js v20.20.1. The project's `package.json` specifies `>=24`. This produces warnings now but may cause hard failures as dependencies adopt Node 24+ APIs.

9. **Redis persistence:** Verify that `appendonly yes` is set in the Redis configuration to prevent data loss on restart (queued jobs, cached sessions).

10. **Log rotation:** PM2 logs grow without bounds. Install `pm2-logrotate` to cap log file sizes and rotate automatically.

### Nice to Have

11. **Cloudflare Origin Certificate:** Replace the Certbot-issued certificate with a Cloudflare Origin Certificate. This provides wildcard coverage (`*.edupod.app`), auto-renewal, and allows upgrading Cloudflare SSL mode to "Full (Strict)".

12. **Sentry for frontend:** Add `SENTRY_DSN` for the Next.js app to capture client-side errors.

13. **CI pipeline:** Add lint, typecheck, and test steps to the GitHub Actions workflow that run before the deploy step.

---

## Tenant Onboarding Checklist

Use this procedure each time a new school is onboarded:

1. **Login** as platform admin at `https://edupod.app/en/login`
2. **Navigate** to Admin, then Tenants, then Create Tenant
3. **Fill in required fields:**
   - Name
   - Slug (used in subdomain: `{slug}.edupod.app`)
   - Default locale (`en` or `ar`)
   - Timezone
   - Currency code
   - Academic year start month
4. **Add domain:** On the tenant detail page, go to the Domains tab and add the subdomain (e.g., `newschool.edupod.app`). No DNS changes are needed -- the wildcard record handles it.
5. **Create school owner user:** Create a new user, assign the `school_owner` role with a tenant membership linking them to the new tenant.
6. **Configure modules:** Enable or disable feature modules for the school (e.g., payroll, finance, gradebook, communications).
7. **Set up Stripe:** If the school will collect payments, configure per-tenant Stripe API keys in Settings, then the Stripe section.
8. **Send credentials:** Provide the school owner with their login URL (`{slug}.edupod.app/en/login`) and credentials.

---

*This document was generated on 2026-03-17 following the initial production deployment session.*
