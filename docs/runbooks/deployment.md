# Deployment Runbook

Last updated: 2026-04-01

---

## Overview

Production deploys from GitHub Actions to the Hetzner host using PM2-managed `api`, `web`, and `worker` processes. Deploys are now gated on the `ci` job in `.github/workflows/ci.yml`, and production deploys queue instead of cancelling each other.

The production deploy entrypoint is:

```bash
scripts/deploy-production.sh
```

The PM2 process definition is version-controlled in:

```bash
ecosystem.config.cjs
```

---

## Pre-Deployment Checklist

Before any production deploy:

- [ ] `ci` passed on the commit being deployed
- [ ] Any Prisma migration and `post_migrate.sql` changes were reviewed
- [ ] No open production incident blocks the release
- [ ] `DATABASE_MIGRATE_URL` is present on the server
- [ ] `pg_dump` is available on the server for the pre-deploy backup

---

## Automated Deploy Flow

When a commit lands on `main`:

1. GitHub Actions runs install, Prisma generate, lint, type-check, tests, and build
2. The `deploy` job waits for `ci` to pass
3. The deploy job SSHes to the production host and runs `scripts/deploy-production.sh`
4. The server script:
   - takes a deployment lock
   - fetches `origin/main` and checks out the exact `DEPLOY_SHA` passed from GitHub Actions
   - loads runtime env and verifies required secrets
   - runs `pnpm install --frozen-lockfile`
   - runs deploy preflight checks for PostgreSQL, Redis, and Prisma migration state
   - builds with `SENTRY_RELEASE` set to the deployed commit SHA
   - creates a pre-deploy `pg_dump` backup
   - runs Prisma migrations
   - runs `pnpm db:post-migrate`
   - runs post-migrate verification SQL
   - gracefully reloads `api` and `web`, then restarts `worker`
   - runs smoke checks for web login, API health, API readiness, worker health, and the auth endpoint
5. If smoke tests fail, the script automatically rebuilds and restarts the previous commit

## Manual Verification

### Health Endpoints

```bash
curl -s http://localhost:3001/api/health | jq .
curl -s http://localhost:3001/api/health/ready | jq .
curl -s -o /dev/null -w "%{http_code}" http://localhost:5551/en/login
curl -s http://localhost:5556/health | jq .
```

### Tenant Verification

Log in as a user from each tenant and verify:

1. **Tenant A login**: Confirm dashboard loads with Tenant A data only
2. **Tenant B login**: Confirm dashboard loads with Tenant B data only
3. **Cross-tenant check**: Verify no Tenant B data visible in Tenant A session (and vice versa)

### Deployment Safety Notes

- Deploys queue with `cancel-in-progress: false`
- Production installs must stay `--frozen-lockfile` only
- Every deploy takes a pre-deploy backup before migrations
- Post-migrate verification runs before the deploy is considered healthy
- API and web use PM2 graceful reload through `ecosystem.config.cjs`
- Smoke-test rollback is automatic for app-level failures

## Post-Deploy Monitoring

For the first 15-30 minutes after release:

- review PM2 logs for `api`, `web`, and `worker`
- confirm `/api/health` and `/api/health/ready` remain healthy
- confirm the worker health endpoint responds
- verify no unexpected queue backlog or repeated job failures
- watch Sentry for new deploy-correlated errors
- review [monitoring.md](./monitoring.md) if queue alerts are present

---

## Deployment Rollback

If any post-deployment check fails, initiate a rollback immediately. See [rollback.md](./rollback.md) for detailed procedures.

---

## Deployment Windows

- **Preferred**: Weekdays, 10:00-14:00 UTC (outside peak school hours for both tenants)
- **Avoid**: Payroll finalisation periods (check with school admins), end-of-term grading periods
- **Emergency hotfixes**: Any time, but notify on-call and follow incident response procedures

---

## Environment Variables Audit

Before deploying a release that introduces new environment variables:

1. Verify all new variables are present on the Hetzner host
2. Verify `api`, `web`, and `worker` can read them after restart
3. Never hardcode secrets into workflow YAML or committed files
4. Required variables for each service are documented in the repo runbooks and `.env.example`
