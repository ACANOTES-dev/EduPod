# Subagent 7 Audit — Operational Readiness & Developer Experience

## A. Facts

- The canonical fact pack says the current verification baseline is not green: `@school/worker` is failing tests, lint, and type-check, while `pnpm turbo run build` passes and emits Next.js Sentry warnings (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md:112-155`).
- CI and deploy live in one workflow. `ci` runs secret scanning, `pnpm audit`, Prisma generate, lint, type-check, unit coverage tests, integration/e2e setup, and build; `deploy` runs only after `ci` succeeds on `main`; separate `integration` and `visual` jobs also exist (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/.github/workflows/ci.yml:1-255`).
- The API validates environment variables before Nest boots (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/main.ts:16-19`) and the worker has equivalent pre-bootstrap validation (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/env.validation.ts:42-59`).
- Backend Sentry is initialized before app bootstrap and scrubs PII-bearing headers and UUIDs from events/transactions (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/instrument.ts:38-56`).
- Local infra is clearly defined: Docker Compose provisions PostgreSQL, PgBouncer in transaction mode, Redis, and Meilisearch on stable local ports (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/docker-compose.yml:1-76`).
- PM2 configuration is version-controlled for `api`, `web`, and `worker`, but each runs as a single instance on a single host (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/ecosystem.config.cjs:6-65`; `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/context.md:15`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/context.md:41-45`).
- The production deploy script takes a host-side lock, checks out the exact target SHA, loads runtime env, runs connectivity/migration preflight, takes a pre-deploy `pg_dump`, applies migrations and post-migrate SQL, restarts services, runs smoke checks, and attempts automatic rollback on smoke failure (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/scripts/deploy-production.sh:324-371`).
- The API exposes public health, readiness, and liveness endpoints plus a guarded admin health dashboard. The health payload includes PostgreSQL, Redis, Meilisearch, BullMQ queue thresholds, disk, PgBouncer, Redis memory, worker reachability, and provider configuration (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.controller.ts:12-35`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/admin-health.controller.ts:8-17`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.service.ts:81-103`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.service.ts:297-515`).
- The worker exposes `/health` and `/health/live`, but its BullMQ health check is based on the `notifications` queue only (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/health/worker-health.controller.ts:10-24`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/health/worker-health.service.ts:40-43`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/health/worker-health.service.ts:110-123`).
- Local onboarding assets are present: README quick-start, fuller `GETTING-STARTED`, `setup.sh`, `doctor.mjs`, and Husky hooks (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/README.md:23-89`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/docs/GETTING-STARTED.md:43-144`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/scripts/setup.sh:1-137`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/scripts/doctor.mjs:99-159`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/.husky/pre-commit:1`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/.husky/pre-push:1`).
- Secret handling in the reviewed workflow is sane at a basic level: deploy SSH credentials come from GitHub Actions secrets, and the example env file uses placeholders/comments rather than committed real secrets (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/.github/workflows/ci.yml:135-143`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/.env.example:22-24`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/.env.example:45-93`).

## B. Strong Signals

- Positive: CI breadth is strong. This repo is trying to gate production on more than unit tests: secret scanning, dependency audit, i18n, hotspot budgets, lint, type-check, coverage, integration, build, and visual smoke are all represented (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/.github/workflows/ci.yml:38-123`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/.github/workflows/ci.yml:149-255`).
- Positive: Deploy safety is materially better than a typical early-stage SSH restart flow. Exact-SHA deploys, concurrency control, backups, post-migrate verification, smoke checks, and automatic rollback are all present (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/.github/workflows/ci.yml:125-148`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/scripts/deploy-production.sh:235-371`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/docs/runbooks/deployment.md:37-96`).
- Positive: Operational visibility is not an afterthought. The repo contains actual health endpoints, monitoring guidance, rollback runbooks, and an admin health dashboard (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/docs/runbooks/monitoring.md:9-60`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/docs/runbooks/rollback.md:31-75`).
- Negative: The mandatory verification baseline is currently red in the worker package, which undermines the trust value of all the otherwise good CI/deploy plumbing (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md:112-147`).
- Negative: Environment setup guidance and frontend Sentry integration both show contract drift. These are the exact kinds of issues that create avoidable onboarding friction and partial observability.

## C. Inferences

- This system is not operationally naive. The deploy script, health surface, runbooks, and local tooling show deliberate production thinking.
- The biggest operational risk is not lack of automation; it is asymmetry between safe app rollback and unsafe schema/data rollback, plus partial monitoring coverage.
- The biggest developer-experience risk is not lack of docs; it is loss of trust in the toolchain when required checks are already failing and environment setup instructions contradict runtime behavior.
- For a single-founder product on a single VPS with two pending tenants, the platform is plausibly operable today. It is not yet at a “boring release” maturity level.
- The build-time Sentry warnings are operationally meaningful. They strongly suggest the frontend observability setup is lagging the App Router integration model, which usually means incomplete error/tracing capture rather than an immediate build blocker.

## D. Top Findings

### 1. Required verification baseline is currently red

- Title: Required verification baseline is currently red
- Severity: High
- Confidence: High
- Why it matters: A comprehensive CI pipeline only helps if the default branch is green. With worker tests, lint, and type-check already failing, developers cannot reliably tell whether a new change introduced a regression or merely inherited one. That directly reduces confidence in build, test, and deploy safety.
- Evidence: The fact pack records failing worker test suites (`redis.helpers.spec.ts`, `search.helpers.spec.ts`, `compliance-execution.processor.spec.ts`) and worker lint/type-check blockers, including a parse error that fails both lint and TypeScript (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md:112-147`). Those checks are wired into the main `ci` job as hard gates (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/.github/workflows/ci.yml:70-96`).
- Fix direction: Restore a green baseline in `@school/worker` first. Treat that as an operational prerequisite, not cleanup debt. Until the branch is green, keep releases conservative and avoid trusting “CI passed” as a dependable safety signal.

### 2. The local environment contract is inconsistent across docs, setup scripts, and runtime

- Title: The local environment contract is inconsistent across docs, setup scripts, and runtime
- Severity: High
- Confidence: High
- Why it matters: Fresh contributors should be able to bootstrap the repo without guessing which env file or variable names actually matter. Right now the setup path can produce a valid-looking local environment that the runtime ignores or partially degrades.
- Evidence: `.env.example` says to copy to `.env.local` (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/.env.example:4-5`), and `scripts/setup.sh` repeats `.env.local` (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/scripts/setup.sh:132-136`), but the API bootstrap explicitly loads `.env` only (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/instrument.ts:5-9`) and `doctor.mjs` also expects `.env` (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/scripts/doctor.mjs:115-120`). Separately, `.env.example` uses `MEILISEARCH_HOST` (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/.env.example:29`) while both API and worker validation expect `MEILISEARCH_URL` (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/config/env.validation.ts:41-43`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/env.validation.ts:10-11`); the API search client silently falls back when that URL is missing (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/search/meilisearch.client.ts:17-23`).
- Fix direction: Standardize on one env filename and one Meilisearch variable name, then update `.env.example`, `setup.sh`, `doctor.mjs`, and bootstrap loading together. Add either a compatibility alias or an explicit startup/doctor failure for deprecated names.

### 3. Production rollback is app-safe but not schema-safe

- Title: Production rollback is app-safe but not schema-safe
- Severity: High
- Confidence: High
- Why it matters: The deploy flow is good at recovering from bad app builds, but it does not automatically recover from dangerous migrations or data-shape changes. In a live single-production environment, that is the highest-stakes failure mode.
- Evidence: The deploy script takes a pre-deploy backup, then applies Prisma migrations and post-migrate SQL before restart and smoke verification (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/scripts/deploy-production.sh:346-357`). If smoke tests fail, the rollback path rebuilds and restarts the previous commit only (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/scripts/deploy-production.sh:364-367`; `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/scripts/deploy-production.sh:301-316`). The rollback runbook explicitly treats database restore as a separate manual recovery path for breaking migrations or corruption (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/docs/runbooks/rollback.md:19-25`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/docs/runbooks/rollback.md:65-74`).
- Fix direction: Keep all production migrations backward-compatible by default, use expand/contract discipline, and introduce a manual decision point for risky migrations. Regularly rehearse restore-from-backup so “manual DB rollback” is an evidence-backed procedure, not a hopeful one.

### 4. Frontend Sentry is behind the current Next.js App Router integration model

- Title: Frontend Sentry is behind the current Next.js App Router integration model
- Severity: Medium
- Confidence: High
- Why it matters: These warnings are not harmless noise. They indicate the frontend observability setup is relying on deprecated config entrypoints, which can leave App Router render failures, edge/server traces, or global error capture partially wired even while builds still pass.
- Evidence: The canonical build output includes warnings for deprecated `sentry.server.config.ts`, `sentry.edge.config.ts`, `sentry.client.config.ts`, plus missing recommended global error handler/instrumentation alignment (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md:147-155`). The frontend still uses those three legacy config files (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/sentry.server.config.ts:1-43`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/sentry.edge.config.ts:1-43`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/sentry.client.config.ts:50-67`) and wraps Next config with Sentry (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/next.config.mjs:21-26`). A targeted search found no `instrumentation.ts` or `global-error.tsx` in `apps/web`.
- Fix direction: Migrate the frontend to Sentry’s current App Router setup, including `instrumentation.ts` and the recommended global error handling path, then treat warning-free builds as the expected state rather than an optional cleanup.

### 5. Worker health and deploy smoke coverage are narrower than the actual worker risk surface

- Title: Worker health and deploy smoke coverage are narrower than the actual worker risk surface
- Severity: Medium
- Confidence: High
- Why it matters: The deploy script treats worker health as a release gate, but the worker’s own `/health` endpoint only verifies PostgreSQL, Redis, and the `notifications` queue. A broken processor registration or queue-specific failure in `behaviour`, `finance`, `payroll`, or `pastoral` could slip through deploy smoke with a green worker status.
- Evidence: Deploy smoke accepts success when `SMOKE_WORKER_URL` returns healthy (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/scripts/deploy-production.sh:91-98`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/scripts/deploy-production.sh:116-118`). The worker health service injects only the `notifications` queue and bases BullMQ health on that queue alone (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/health/worker-health.service.ts:40-43`, `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/health/worker-health.service.ts:110-123`). By contrast, the API health service explicitly monitors five queues (`/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.service.ts:382-403`).
- Fix direction: Expand worker health to cover all critical queues or add a post-deploy synthetic job smoke for each high-value worker domain. The current worker probe is useful, but it is not broad enough to stand alone as proof that the background system is healthy.

## E. Files Reviewed

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/CLAUDE.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/context.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/.github/workflows/ci.yml`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/main.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/instrument.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/docker-compose.yml`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/.env.example`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/ecosystem.config.cjs`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/scripts/deploy-production.sh`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/package.json`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/package.json`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/package.json`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/package.json`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/config/env.validation.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/env.validation.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.controller.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/admin-health.controller.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/health/worker-health.controller.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/health/worker-health.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/search/meilisearch.client.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/next.config.mjs`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/sentry.server.config.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/sentry.edge.config.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/sentry.client.config.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/README.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/docs/GETTING-STARTED.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/docs/runbooks/deployment.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/docs/runbooks/rollback.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/docs/runbooks/monitoring.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/scripts/doctor.mjs`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/scripts/setup.sh`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/.husky/pre-commit`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/.husky/pre-push`

## F. Additional Commands Run

- `rg --files -g 'sentry*.{ts,js,cjs,mjs}' -g 'instrumentation*.{ts,js}' -g 'global-error*.{tsx,ts}'`
- `rg -n "validateEnv|env.validation|zod" apps/api/src/modules/config apps/worker/src apps/web/src`
- `rg -n "health|ready" apps/api/src apps/worker/src`
- `rg -n "Sentry|instrumentation|global-error|withSentryConfig" apps/web`
- `rg -n "doctor|docker-compose|.env.example|pnpm install|localhost:6432|localhost:5553|localhost:5554|localhost:5555" README* docs apps packages scripts`
- `rg -n "Controller\\('health'\\)|Get\\('health'\\)|api/health|health controller|ready" apps/api/src`
- `rg -n "MEILISEARCH_(URL|HOST)|ENCRYPTION_KEY_LOCAL|ENCRYPTION_KEY\\b|S3_BUCKET_NAME|SENTRY_DSN_BACKEND|SENTRY_DSN_FRONTEND|NEXT_PUBLIC_SENTRY_DSN|API_URL|APP_URL|DATABASE_MIGRATE_URL|WORKER_HEALTH_URL|PGBOUNCER_ADMIN_URL" apps packages scripts .env.example README.md docs`
- Existence check for the assigned output file before writing it

## G. Score

- Anchor: `1-2` = not operationally credible, `3-4` = fragile/manual, `5-6` = workable with meaningful risk, `7-8` = operationally credible for routine production, `9-10` = mature and low-drama.
- Operational readiness: `6/10`
- Judgment: This is credible enough for a closely watched, low-scale production deployment. The deploy path and health/runbook surface are real strengths. The score stays below `7` because schema rollback is still manual, worker smoke coverage is narrow, and frontend observability is warning-rich and partially outdated.
- Developer experience: `5/10`
- Judgment: There is solid scaffolding for developers: docs, local infra, doctor tooling, hooks, and a broad CI pipeline. The score stops at `5` because the required verification baseline is currently red and the environment contract is inconsistent enough to create avoidable setup/debug time.

## H. Confidence in this review

- Confidence: Medium-High
- Reasoning: Confidence is high on the code-level CI, deploy, env-validation, health, and local-setup observations because they are directly grounded in the reviewed files. Confidence is lower on the final production verdict because I did not inspect the live server state, actual configured secrets/monitors, or a real GitHub Actions run for this specific commit.
