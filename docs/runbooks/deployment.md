# Deployment Runbook

Last updated: 2026-03-16

---

## Overview

This runbook covers the end-to-end deployment procedure for the School Operating System. The system consists of three ECS services (api, web, worker), a PostgreSQL 16 RDS instance with Row-Level Security, Redis 7 (ElastiCache), Meilisearch, and external integrations (Stripe, Resend, Twilio). Deployments are triggered from the `main` branch after all CI checks pass.

---

## Pre-Deployment Checklist

Before initiating any production deployment, verify every item:

- [ ] All CI pipeline jobs are green on `main`:
  - Lint
  - Type check
  - Unit tests
  - RLS leakage tests
  - Critical workflow tests
  - Build
  - PDF snapshot tests
  - Visual regression (Playwright)
- [ ] Database migrations reviewed by at least one engineer
  - Check for destructive operations (column drops, type changes)
  - Check for new tables missing RLS policies
  - Check for new tenant-scoped tables missing `tenant_id`
- [ ] Post-migrate SQL files reviewed (RLS policies, triggers, functions)
- [ ] Feature flags / tenant module toggles confirmed for the release
- [ ] No open P1/P2 incidents
- [ ] Release notes drafted (if applicable)
- [ ] Manual RDS snapshot taken (see backup-restore.md)

---

## Step 1: Database Migration

Database migrations run BEFORE application deployment. This ensures the new schema is in place when the updated application starts.

### 1.1 Run Prisma Migrations

```bash
# SSH into the bastion host or use ECS exec on a one-off task
# Ensure DATABASE_URL points to the production RDS instance

npx prisma migrate deploy
```

Verify output shows:
- Number of migrations applied (should match expected count)
- No errors or warnings
- "All migrations have been successfully applied"

### 1.2 Run Post-Migrate Script

The post-migrate script applies RLS policies, triggers, extensions, and custom functions that Prisma does not manage natively.

```bash
pnpm db:post-migrate
```

This script:
1. Scans all migration directories for `post_migrate.sql` files
2. Executes them in chronological order (timestamp-sorted)
3. All operations are idempotent (DROP IF EXISTS + CREATE, CREATE IF NOT EXISTS, CREATE OR REPLACE)

### 1.3 Verify Migration Success

```sql
-- Connect to the production database and verify:

-- Check migration history
SELECT migration_name, finished_at
FROM _prisma_migrations
ORDER BY finished_at DESC
LIMIT 5;

-- Verify RLS is enabled on all tenant-scoped tables
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('_prisma_migrations', 'users')
ORDER BY tablename;
-- All rows should show rowsecurity = true

-- Verify RLS policies exist
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;

-- Verify trigger functions
SELECT routine_name
FROM information_schema.routines
WHERE routine_type = 'FUNCTION'
  AND routine_schema = 'public'
ORDER BY routine_name;
```

If any migration fails:
1. DO NOT proceed with application deployment
2. Check error logs for the specific failure
3. If safe to retry, fix the issue and re-run
4. If data is corrupted, initiate PITR (see rollback.md)

---

## Step 2: Build Docker Images

### 2.1 Build All Services

```bash
# From the repository root
# Tag with the git SHA for traceability

export GIT_SHA=$(git rev-parse --short HEAD)
export ECR_REGISTRY=<account-id>.dkr.ecr.<region>.amazonaws.com

# Authenticate with ECR
aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin $ECR_REGISTRY

# Build api
docker build -t $ECR_REGISTRY/school-api:$GIT_SHA -f apps/api/Dockerfile .
docker tag $ECR_REGISTRY/school-api:$GIT_SHA $ECR_REGISTRY/school-api:latest

# Build web
docker build -t $ECR_REGISTRY/school-web:$GIT_SHA -f apps/web/Dockerfile .
docker tag $ECR_REGISTRY/school-web:$GIT_SHA $ECR_REGISTRY/school-web:latest

# Build worker
docker build -t $ECR_REGISTRY/school-worker:$GIT_SHA -f apps/worker/Dockerfile .
docker tag $ECR_REGISTRY/school-worker:$GIT_SHA $ECR_REGISTRY/school-worker:latest
```

### 2.2 Push to ECR

```bash
docker push $ECR_REGISTRY/school-api:$GIT_SHA
docker push $ECR_REGISTRY/school-api:latest

docker push $ECR_REGISTRY/school-web:$GIT_SHA
docker push $ECR_REGISTRY/school-web:latest

docker push $ECR_REGISTRY/school-worker:$GIT_SHA
docker push $ECR_REGISTRY/school-worker:latest
```

---

## Step 3: Deploy to ECS

### 3.1 Update ECS Task Definitions

For each service (api, web, worker):

```bash
# Register new task definition with updated image tag
# Use the existing task definition as a template, updating only the image URI

aws ecs describe-task-definition \
  --task-definition school-api \
  --query 'taskDefinition' > /tmp/task-def.json

# Update the image in the JSON to point to the new tag
# Then register:

aws ecs register-task-definition \
  --cli-input-json file:///tmp/task-def-updated.json
```

Record the new task definition revision numbers for potential rollback:
- API: `school-api:<revision>`
- Web: `school-web:<revision>`
- Worker: `school-worker:<revision>`

### 3.2 Update ECS Services (Rolling Deployment)

```bash
# Update API service
aws ecs update-service \
  --cluster school-prod \
  --service school-api \
  --task-definition school-api:<new-revision> \
  --force-new-deployment

# Update Web service
aws ecs update-service \
  --cluster school-prod \
  --service school-web \
  --task-definition school-web:<new-revision> \
  --force-new-deployment

# Update Worker service
aws ecs update-service \
  --cluster school-prod \
  --service school-worker \
  --task-definition school-worker:<new-revision> \
  --force-new-deployment
```

### 3.3 Monitor Rolling Update

```bash
# Watch service events for deployment progress
aws ecs describe-services \
  --cluster school-prod \
  --services school-api school-web school-worker \
  --query 'services[].{name:serviceName,running:runningCount,desired:desiredCount,deployments:deployments[].{status:status,running:runningCount,desired:desiredCount}}'

# Wait for deployment to stabilise
aws ecs wait services-stable \
  --cluster school-prod \
  --services school-api school-web school-worker
```

The rolling update will:
1. Start new tasks with the updated task definition
2. Wait for new tasks to pass health checks
3. Drain connections from old tasks
4. Stop old tasks

If new tasks fail health checks, ECS will automatically stop the deployment and keep the old tasks running.

---

## Step 4: Post-Deployment Verification

### 4.1 Health Endpoint Check

```bash
# API health check
curl -s https://api.edupod.app/api/health | jq .
# Expected: { "status": "ok", "checks": { "postgres": "up", "redis": "up" } }

# API readiness check (includes Meilisearch)
curl -s https://api.edupod.app/api/health/ready | jq .
# Expected: { "status": "ok", "checks": { "postgres": { "status": "ok", ... }, "redis": { "status": "ok", ... }, "meilisearch": { "status": "ok", ... } }, "version": "...", "uptime_seconds": ... }

# Web health check
curl -s -o /dev/null -w "%{http_code}" https://edupod.app/
# Expected: 200
```

### 4.2 RLS Context Verification

Log in as a user from each tenant and verify:

1. **Tenant A login**: Confirm dashboard loads with Tenant A data only
2. **Tenant B login**: Confirm dashboard loads with Tenant B data only
3. **Cross-tenant check**: Verify no Tenant B data visible in Tenant A session (and vice versa)

### 4.3 Sentry Error Monitoring

1. Open Sentry dashboard: https://sentry.io/organizations/<org>/issues/
2. Filter by release tag matching the deployed git SHA
3. Watch for 15 minutes for any new errors
4. Pay special attention to:
   - RLS-related errors (missing tenant context)
   - Database connection errors
   - Authentication failures
   - Worker job failures

### 4.4 CloudWatch Metrics

Check the following CloudWatch metrics for the first 30 minutes post-deploy:

- **ECS**: CPU utilisation, memory utilisation, task count
- **RDS**: CPU utilisation, database connections, read/write latency, free storage
- **ElastiCache**: CPU, memory, cache hit rate, evictions
- **ALB**: request count, 5xx error rate, target response time (p50, p95, p99)

Set up a CloudWatch dashboard with these metrics if one does not already exist.

### 4.5 BullMQ Worker Verification

```bash
# Check worker logs for successful job processing
aws logs tail /ecs/school-worker --since 5m --format short

# Verify no dead-letter queue accumulation
# Connect to Redis and check DLQ lengths
redis-cli -h <elasticache-endpoint> LLEN bull:payroll:failed
redis-cli -h <elasticache-endpoint> LLEN bull:notifications:failed
```

---

## Deployment Rollback

If any post-deployment check fails, initiate a rollback immediately. See [rollback.md](./rollback.md) for detailed procedures.

Quick rollback (application only, no database changes):

```bash
# Revert to previous task definition revision
aws ecs update-service \
  --cluster school-prod \
  --service school-api \
  --task-definition school-api:<previous-revision> \
  --force-new-deployment

# Repeat for web and worker services
```

---

## Deployment Windows

- **Preferred**: Weekdays, 10:00-14:00 UTC (outside peak school hours for both tenants)
- **Avoid**: Payroll finalisation periods (check with school admins), end-of-term grading periods
- **Emergency hotfixes**: Any time, but notify on-call and follow incident response procedures

---

## Environment Variables Audit

Before deploying a release that introduces new environment variables:

1. Verify all new variables are set in AWS Systems Manager Parameter Store
2. Verify ECS task definitions reference the new parameters
3. Never hardcode secrets in task definitions -- use Secrets Manager references
4. Required variables for each service are documented in the respective `env.example` files
