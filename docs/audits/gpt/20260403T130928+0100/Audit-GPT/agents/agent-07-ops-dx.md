A. Facts

- I treated the shared fact pack as canonical for repo-wide counts and prior validation results, including the confirmed absence of `.github/workflows/deploy.yml`, the presence of four workflow jobs in `.github/workflows/ci.yml`, and the previously observed passing lint, type-check, build, and core test runs.
- `.github/workflows/ci.yml` defines `ci`, `deploy`, `integration`, and `visual`. `deploy` only runs after `ci` passes, is limited to `main`, and is serialized with `concurrency.group: production-deploy`.
- The `ci` job runs gitleaks, `pnpm audit` in warning-only mode, Prisma client generation, worker processor spec checks, i18n checks, hotspot checks, RLS audit, raw SQL governance checks, lint, type-check, architectural boundary checks, unit tests with coverage enforcement, integration/e2e setup, and build.
- The `integration` job independently applies migrations, reapplies post-migrate SQL, seeds, runs integration tests, and runs `scripts/ci-restore-drill.sh`.
- The deploy path is SSH-driven from `.github/workflows/ci.yml` into `/opt/edupod/app`, where `scripts/deploy-production.sh` performs checkout, install, build, preflight checks, backup creation, Prisma migration deploy, `pnpm db:post-migrate`, PM2 restart/reload, and smoke tests.
- `scripts/deploy-production.sh` creates a local predeploy database dump under `/opt/edupod/backups/predeploy` before applying migrations.
- API bootstrap fails fast on environment validation before `NestFactory.create()` in `apps/api/src/main.ts`, then enables Helmet, CORS, compression, cookie parsing, global filters/interceptors, graceful shutdown, and non-production Swagger.
- API Sentry initialization exists in `apps/api/src/instrument.ts` and scrubs UUIDs plus `authorization` and `cookie` headers before sending events.
- Worker bootstrap also validates env before startup and exposes `/health` and `/health/live`.
- API health surfaces include `/health`, `/health/ready`, `/health/live`, and an admin dashboard path. The implementation checks PostgreSQL, Redis, Meilisearch, BullMQ, disk, PgBouncer, Redis memory, and worker reachability.
- Local developer surfaces include `docker-compose.yml`, `.env.example`, `README.md`, `docs/GETTING-STARTED.md`, `Makefile`, and `scripts/doctor.mjs`.
- Secret-file hygiene is present in repo-managed surfaces: `.gitignore` excludes `.env*` except `.env.example`, and CI runs gitleaks.
- A repo-managed off-site backup replication script exists at `scripts/backup-replicate.ts`, exposed as `pnpm db:backup:replicate`, but I found no invocation of that script in GitHub Actions or the production deploy script.

B. Strong Signals

- The CI surface is materially stronger than a typical early-stage SaaS repo: it goes beyond lint/type/test into RLS governance, raw SQL governance, architectural boundary checks, hotspot budgets, visual smoke, and restore-drill verification.
- The production deploy flow has meaningful safety mechanisms already: serialized deploys, explicit preflight checks, local predeploy backups, smoke tests across web/API/auth/worker, and automatic rollback to the previous code SHA on smoke-test failure.
- Operational introspection is not purely cosmetic. The API health service exposes queue backlog and stuck-job alerts, PgBouncer pressure, Redis memory pressure, disk health, and worker reachability.
- API logging and error capture show privacy awareness: production logs are structured JSON with request/tenant/user context, and Sentry initialization strips obvious sensitive fields before emission.
- Local DX is intentionally supported rather than left implicit: Dockerized dependencies, a checked-in `.env.example`, a `Makefile`, and a `doctor` command give contributors a starting path.

C. Inferences

- This system is closer to production-credible than many single-founder SaaS monorepos because there is clear evidence of deliberate operational engineering, not just feature work.
- The biggest remaining operational weakness is not lack of automation; it is incomplete recoverability when a deploy changes persistent state.
- The biggest remaining DX weakness is drift between the canonical workflow, the quick-start docs, and the self-check tooling.
- Observability is stronger on the API request path than on the worker/background-job path.
- This review is high-confidence for repo-managed workflow quality and medium-confidence for real disaster-recovery posture because I did not inspect the live VPS, PM2 state, external schedulers, or hosted alert destinations.

D. Top Findings

1. Title: Automatic rollback is code-only; it does not restore the database after a bad migration
   Severity: High
   Confidence: High
   Why it matters: Every push to `main` deploys to production, and this system applies database migrations during deploy. If a migration is backward-incompatible or mutates data in a way the previous code cannot tolerate, the current rollback path can restore code while leaving the database in the new state. That means a failed deploy can still leave production unusable under pressure.
   Evidence: `scripts/deploy-production.sh:346-357` creates a backup and then applies migrations plus post-migrate SQL before restart; `scripts/deploy-production.sh:292-316` defines rollback as `git checkout` of the previous SHA, reinstall, rebuild, and PM2 restart only; `scripts/deploy-production.sh:153-168` creates a predeploy dump but there is no `pg_restore` step wired into automatic rollback.
   Fix direction: Treat schema-changing deploys as reversible only if the database path is reversible too. Either enforce expand/contract-only migrations, or automate and document a tested DB restore path that can be executed during rollback, then exercise that exact code-plus-database rollback flow regularly.

2. Title: Worker Sentry instrumentation exists but is not loaded by the worker entrypoint
   Severity: High
   Confidence: High
   Why it matters: Background jobs, cron flows, and queue processors are a major part of this system’s behavior. If the worker process never initializes its shared Sentry instrumentation, production failures in that path rely on PM2 logs and ad hoc processor-level reporting instead of uniform error capture and release attribution.
   Evidence: `apps/worker/src/instrument.ts:37-50` initializes Sentry; `apps/worker/src/main.ts:1-20` loads dotenv and env validation but does not import `./instrument`; a repo-wide search for `import './instrument'` found only `apps/api/src/main.ts:1`.
   Fix direction: Import worker instrumentation at the top of `apps/worker/src/main.ts`, verify environment/release tags mirror the API path, and add a lightweight test or smoke assertion that the worker boot path initializes telemetry.

3. Title: Readiness is not a distinct deployment gate
   Severity: Medium
   Confidence: High
   Why it matters: The repo exposes a readiness endpoint, but the implementation and deploy defaults do not actually use it as a stricter gate. That reduces the value of having separate liveness/health/readiness semantics and makes deploy success more dependent on a broad health response than on true serve-traffic readiness.
   Evidence: `apps/api/src/modules/health/health.service.ts:257-263` makes `getReadiness()` return the same `buildFullResult()` as the general health path; `apps/api/src/modules/health/health.controller.ts:21-27` exposes `/health/ready`; `scripts/deploy-production.sh:13-14` sets both `SMOKE_API_URL` and `SMOKE_API_READY_URL` to `http://localhost:3001/api/health`, so the smoke suite never defaults to `/api/health/ready`.
   Fix direction: Give `/health/ready` distinct semantics, use it as the default deploy smoke endpoint, and make sure whatever sits in front of PM2 or the app server also keys off the stricter readiness signal.

4. Title: Repo-managed backup posture is same-host by default; off-site replication is not wired into automation
   Severity: Medium
   Confidence: Medium
   Why it matters: A local predeploy dump is useful for operator error and bad deploys, but it does not meaningfully protect a single-VPS production setup from host loss, disk corruption, or account-level incidents. There is evidence the repo intends to support off-site replication, but not evidence that repo-managed automation actually runs it.
   Evidence: The fact pack states production is a single Hetzner VPS; `scripts/deploy-production.sh:5-7,153-168` stores backups under `/opt/edupod/backups/predeploy` on the same host; `package.json:29` exposes `db:backup:replicate`; `scripts/backup-replicate.ts:24-31,80-97` uploads dumps to object storage when invoked; a repo search found docs mentioning `pnpm db:backup:replicate` but no invocation in `.github/workflows/` or `scripts/deploy-production.sh`; `scripts/ci-restore-drill.sh:50` also suppresses `pg_restore` exit status with `|| true`, which weakens confidence that the restore drill would fail on every materially bad restore.
   Fix direction: Make off-site replication a repo-managed scheduled task with failure alerting, then add a periodic restore drill from the off-site artifact rather than only from a same-job local dump.

5. Title: Local bootstrap and self-check guidance drift from the actual runtime path
   Severity: Medium
   Confidence: High
   Why it matters: Developers need one reliable local path. Right now, the docs and the `doctor` command do not fully agree with the runtime/build workflow used by CI and deploy. That creates avoidable onboarding friction and reduces trust in the local tooling when contributors hit false negatives.
   Evidence: `docs/GETTING-STARTED.md:64-76` tells contributors to generate Prisma client and then seed local data, but omits any migration or `db:post-migrate` step; `README.md:53-63` includes migrate and seed, but still omits `pnpm db:post-migrate`; both CI and deploy explicitly run migrations followed by `pnpm db:post-migrate` in `.github/workflows/ci.yml:105-110`, `.github/workflows/ci.yml:214-221`, and `scripts/deploy-production.sh:348-357`; `scripts/doctor.mjs:178-182` expects `apps/api/dist/main.js`, while the built artifact path is `apps/api/dist/api/src/main.js`, matching `apps/api/package.json:7-8` and the observed built output.
   Fix direction: Publish one canonical bootstrap sequence, include `db:post-migrate` wherever migrations are described, and make `doctor` derive expected artifact paths from package/build config instead of hardcoding a stale API path.

E. Files Reviewed

- `docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md`
- `.github/workflows/ci.yml`
- `apps/api/src/main.ts`
- `apps/api/src/instrument.ts`
- `apps/api/src/modules/config/env.validation.ts`
- `apps/api/src/modules/health/health.controller.ts`
- `apps/api/src/modules/health/health.service.ts`
- `apps/api/src/common/services/logger.service.ts`
- `apps/api/src/common/middleware/request-logging.middleware.ts`
- `apps/worker/src/main.ts`
- `apps/worker/src/instrument.ts`
- `apps/worker/src/env.validation.ts`
- `apps/worker/src/worker.module.ts`
- `apps/worker/src/health/worker-health.controller.ts`
- `apps/worker/src/health/worker-health.service.ts`
- `docker-compose.yml`
- `.env.example`
- `ecosystem.config.cjs`
- `scripts/deploy-production.sh`
- `scripts/post-migrate-verify.sql`
- `scripts/ci-restore-drill.sh`
- `scripts/doctor.mjs`
- `scripts/backup-replicate.ts`
- `README.md`
- `docs/GETTING-STARTED.md`
- `package.json`
- `apps/api/package.json`
- `apps/worker/package.json`
- `packages/prisma/package.json`
- `.gitignore`

F. Additional Commands Run

- `sed -n` on the required files plus directly related deploy, health, env-validation, doctor, and backup scripts.
- `rg -n "validateEnv|SENTRY_DSN|WORKER_HEALTH_URL|/health|health"` across `apps/api/src`, `apps/worker/src`, `packages/shared`, and `scripts`.
- `rg -n "@Controller\\('health'\\)|/health|doctor|DATABASE_MIGRATE_URL|migrate dev|migrate deploy|db:post-migrate"` across runtime files and onboarding docs.
- `rg -n "Sentry\\.init|@sentry|instrument"` across API, worker, and web sources.
- `rg -n "db:backup:replicate"` across workflows, scripts, docs, and `package.json`.
- `nl -ba` on the key workflow, deploy, health, env, and documentation files to capture line-anchored evidence.
- `find apps/api/dist -maxdepth 4 -type f | sort | sed -n '1,40p'` to confirm the actual API build artifact path.
- `find apps/worker/dist -maxdepth 5 -type f | sort | sed -n '1,40p'` to confirm the worker build artifact path.

G. Score

7/10

H. Confidence in this review

Medium-high. Confidence is high for the repo-managed CI/deploy/DX assessment because the relevant code paths are explicit and internally consistent enough to inspect directly. Confidence is lower for true disaster-recovery completeness and live operational practice because I did not inspect the production host, PM2 runtime, external schedulers, object-storage buckets, or alerting destinations.
