# Server Infrastructure

> **Purpose**: the source of truth for the production server — what runs, where, how it's wired, how to recover it. If you're oncall at 2am or rebuilding from bare metal, start here.
> **Maintenance**: update whenever a server-local config changes (nginx, docker-compose, systemd, ufw, ssh). See [§ Server-local configs NOT in git](#server-local-configs-not-in-git) — most of what lives on the server is _not_ checked into this repo, so this doc is the only record.
> **Last verified**: 2026-04-22 (post PMX-fix + hardening pass + PAT-to-deploy-key swap).

---

## How to read this

- Paths in `/backticks/` are on the **server** (`/opt/edupod/…`, `/etc/…`, `/home/edupod/…`) unless otherwise stated.
- Paths in `packages/…` or `apps/…` (no leading slash) are in **this repo**, relative to repo root.
- Every section ends with a **Files** subsection pointing at where the config/source actually lives, so you can jump straight to the details without grepping.

---

## 1. Overview / Topology

```
                    ┌──────────────────────────┐
   end users ─HTTPS─┤      Cloudflare edge     │
                    │  • TLS termination (CF)  │
                    │  • WAF + bot rules       │
                    │  • wildcard *.edupod.app │
                    └────────────┬─────────────┘
                                 │ HTTPS origin pull
                                 │ (CF origin cert, 15-yr)
                     ┌───────────▼────────────┐
                     │  edupod-prod-1 (host)  │
                     │  Hetzner Cloud · 46.62.244.139
                     │  Ubuntu 24.04 · 4 vCPU · 15 GB · 150 GB NVMe
                     │                         │
                     │  UFW: 22, 80, 443 only  │
                     │  nginx (443) ─→ 127.0.0.1:{3001,5551}
                     │                         │
                     │  PM2 (edupod user):    │
                     │   ├─ api        :3001  │
                     │   ├─ web        :5551  │
                     │   ├─ worker     :5556  │
                     │   ├─ solver-py  :5557  │
                     │   └─ pm2-logrotate     │
                     │                         │
                     │  Docker:                │
                     │   ├─ postgres:16  :5432│
                     │   ├─ redis:7      :6379│
                     │   ├─ meilisearch  :7700│
                     │   └─ pgbouncer    :6432│
                     │                         │
                     │  Sentry ← logs + traces │
                     └─────────────────────────┘
                                 │
                       ┌─────────┴────────┐
                       │ Hetzner Object   │ (backups, uploads, report-card PDFs)
                       │ Storage (S3 API) │
                       └──────────────────┘
```

Everything tenant-facing is single-origin behind Cloudflare. The host exposes only 22/80/443 to the internet; every backing service (Postgres, Redis, Meilisearch, pgbouncer) is bound to `127.0.0.1` and reachable only from the host's own processes.

---

## 2. Host

| item                | value                                                              |
| ------------------- | ------------------------------------------------------------------ |
| Provider            | Hetzner Cloud                                                      |
| IP                  | `46.62.244.139` (also IPv6)                                        |
| Hostname            | `edupod-prod-1`                                                    |
| OS                  | Ubuntu 24.04 LTS                                                   |
| Kernel              | Linux 6.x                                                          |
| vCPU / RAM          | 4 cores / 15 GB (no swap — not needed, ~5 GB free at steady state) |
| Disk                | 150 GB NVMe (`/dev/sda1`), ~18 % used at baseline                  |
| Time zone           | UTC                                                                |
| Shell user for apps | `edupod` (password-locked, key-only; see § Security)               |

SSH entry point for ops: `ssh root@46.62.244.139` using the SSH key registered on the host. The GitHub Actions deploy uses the same root account via `SSH_PRIVATE_KEY` secret.

### Files

- `/etc/os-release`
- `~/.ssh/authorized_keys` (per user)

---

## 3. Network & Firewall

Exposed to the internet:

| port    | service | allowed from                                           |
| ------- | ------- | ------------------------------------------------------ |
| 22/tcp  | SSH     | anywhere (fail2ban + key-only)                         |
| 80/tcp  | nginx   | **Cloudflare edges only** (enforced in nginx, not UFW) |
| 443/tcp | nginx   | **Cloudflare edges only**                              |

Everything else is loopback-only. Port map:

| port | service             | binding                                |
| ---- | ------------------- | -------------------------------------- |
| 3001 | api (NestJS)        | `0.0.0.0:3001` _(UFW blocks external)_ |
| 5551 | web (Next.js)       | `0.0.0.0:5551` _(UFW blocks external)_ |
| 5556 | worker health       | `0.0.0.0:5556` _(UFW blocks external)_ |
| 5557 | solver-py (FastAPI) | `127.0.0.1`                            |
| 5432 | Postgres            | `127.0.0.1` (via docker-proxy)         |
| 6379 | Redis               | `127.0.0.1` (via docker-proxy)         |
| 6432 | pgbouncer           | `127.0.0.1`                            |
| 7700 | Meilisearch         | `127.0.0.1` (via docker-proxy)         |

### Cloudflare-edge-only enforcement

UFW lets 80/443 in from anywhere, but nginx rejects anything whose raw source IP isn't in the Cloudflare range. The check is:

1. `/etc/nginx/conf.d/cloudflare-geo.conf` defines `$is_cf_edge` via a `geo` map keyed on `$realip_remote_addr`.
2. `/etc/nginx/cloudflare-ips.conf` (auto-regenerated nightly) holds the current `set_real_ip_from` list plus the same CIDRs for the geo map.
3. Each `server` block in `/etc/nginx/sites-enabled/edupod` runs `if ($is_cf_edge = 0) { return 444; }` — silent TCP drop for non-CF traffic.
4. A catch-all vhost `/etc/nginx/sites-enabled/00-default-reject` returns 444 for any `Host:` header that doesn't match `edupod.app`, `*.edupod.app`, or `turbo.edupod.app`.

### fail2ban

- `/etc/fail2ban/jail.local` — aggressive `sshd` jail: bantime 1h, findtime 10m, maxretry 5, systemd backend.
- Verify: `fail2ban-client status sshd`.

### Files

- `/etc/ufw/user.rules`
- `/etc/nginx/sites-enabled/00-default-reject`
- `/etc/nginx/sites-enabled/edupod`
- `/etc/nginx/conf.d/cloudflare-geo.conf`
- `/etc/nginx/cloudflare-ips.conf` (auto-regen — do not hand-edit)
- `/etc/fail2ban/jail.local`

---

## 4. TLS / Certificates

Two certificate sources, three domains:

| domain                                         | cert source                                                    | location                                  | expiry                         |
| ---------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------- | ------------------------------ |
| `edupod.app`, `www.edupod.app`, `*.edupod.app` | **Cloudflare Origin CA** (15-year)                             | `/etc/ssl/edupod-origin.{pem,key}`        | 2041-03-14                     |
| `edupod.app`                                   | Let's Encrypt (fallback/reference only; **not used by nginx**) | `/etc/letsencrypt/live/edupod.app/`       | auto-renewed via certbot.timer |
| `turbo.edupod.app`                             | Let's Encrypt (used by turbo-cache vhost)                      | `/etc/letsencrypt/live/turbo.edupod.app/` | auto-renewed                   |

**Why two kinds?** Tenant-facing domains (`*.edupod.app`) go through Cloudflare, which does TLS termination at the edge. The origin cert is only used for the CF→origin leg and covers the wildcard natively. The Let's Encrypt cert for `edupod.app` is legacy; `turbo.edupod.app` uses its own LE cert because it's a direct-to-origin service (not CF-proxied, so it needs a publicly-trusted cert).

**Renewal:** `certbot.timer` fires twice daily. Nginx reloads automatically via certbot hook. The Cloudflare origin cert is 15-year so no renewal until 2041.

### Files

- `/etc/ssl/edupod-origin.pem` (CF origin — 15-year wildcard)
- `/etc/ssl/edupod-origin.key`
- `/etc/letsencrypt/` (Let's Encrypt — auto-renewed)
- `certbot.timer` / `certbot.service` (systemd)

---

## 5. Nginx

Three vhosts live in `/etc/nginx/sites-enabled/`:

| vhost file          | purpose                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `edupod`            | Main app. Serves `edupod.app` + `www.edupod.app` + `*.edupod.app`. `/` → `127.0.0.1:5551` (web), `/api` → `127.0.0.1:3001` (api).                 |
| `turbo-cache`       | Turborepo remote cache at `turbo.edupod.app`. Local filesystem-backed. CI builds hit this to cut `build` step from ~5 min → ~1 min on warm cache. |
| `00-default-reject` | Catch-all. Any unknown `Host:` → 444.                                                                                                             |

### Per-tenant rate limiting

`/etc/nginx/conf.d/rate-limits.conf` defines `limit_req_zone $host zone=per_tenant_api:10m rate=60r/s;`. The `/api` location in `edupod` applies it: `limit_req zone=per_tenant_api burst=120 nodelay;`.

Keyed on `$host`, so each tenant subdomain gets its own token bucket. One runaway tenant can't saturate others. Over-limit requests get HTTP 429.

### Proxy headers + body limits

- `client_max_body_size 10m` on `/api` (matches app expectation for file uploads).
- `proxy_read_timeout 180s` — allows for large PDF generation, complex queries, worker callbacks.
- `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` set on all proxied requests.

### Files

- `/etc/nginx/sites-enabled/edupod`
- `/etc/nginx/sites-enabled/turbo-cache`
- `/etc/nginx/sites-enabled/00-default-reject`
- `/etc/nginx/conf.d/rate-limits.conf`
- `/etc/nginx/cloudflare-ips.conf` (auto-regen nightly)
- `/etc/nginx/backups/` (stamped backup copies from past edits — safe to prune quarterly)

---

## 6. Docker Stack

Four containers, three from `/opt/edupod/docker-compose.yml`, pgbouncer started separately.

### From `/opt/edupod/docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:16
    env: POSTGRES_DB=edupod_prod, POSTGRES_USER=edupod_admin, POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volume: ./data/postgres → /var/lib/postgresql/data
    port:   127.0.0.1:5432 → 5432

  redis:
    image: redis:7-alpine
    cmd:    redis-server --requirepass ${REDIS_PASSWORD}
            --appendonly yes
            --maxmemory 4gb              # cap (added 2026-04-22 during hardening)
            --maxmemory-policy allkeys-lru
    volume: ./data/redis → /data
    port:   127.0.0.1:6379 → 6379

  meilisearch:
    image:  getmeili/meilisearch:v1.7
    env:    MEILI_MASTER_KEY=${MEILI_MASTER_KEY}, MEILI_ENV=production
    volume: ./data/meilisearch → /meili_data
    port:   127.0.0.1:7700 → 7700

networks:
  default: edupod-network
```

### pgbouncer

Separate container (not in the main compose). Config at `/opt/edupod/pgbouncer/`. Runs `/usr/bin/pgbouncer /etc/pgbouncer/pgbouncer.ini`. Bound to `127.0.0.1:6432`. Purpose: transaction-pool in front of Postgres to handle NestJS interactive-transaction concurrency without running out of PG connections.

**Pool mode: transaction.** This is why every tenant-scoped Prisma call goes through `prisma.$transaction(async (tx) => …)` — it's the only way to guarantee the same connection for `SET LOCAL app.current_tenant_id` + the subsequent queries. Sequential `prisma.$transaction([…])` is prohibited for this reason (custom ESLint rule `no-sequential-transaction`).

### Data volumes

| service     | host path                      | volume size                 |
| ----------- | ------------------------------ | --------------------------- |
| postgres    | `/opt/edupod/data/postgres`    | ~170 MB (baseline)          |
| redis       | `/opt/edupod/data/redis`       | ~10 MB (small; BullMQ only) |
| meilisearch | `/opt/edupod/data/meilisearch` | small                       |

### Files

- `/opt/edupod/docker-compose.yml`
- `/opt/edupod/data/` (persistent volumes — **do not delete**)
- `/opt/edupod/pgbouncer/` (pgbouncer container config)

---

## 7. Application Stack (PM2)

Four long-running processes under the `edupod` user, plus the pm2-logrotate module.

Ecosystem config in git at `ecosystem.config.cjs` (repo root). PM2 reads it on `pm2 start ecosystem.config.cjs` — no modifications made directly on the server.

| process         | mode   | memory cap | node args / interpreter   | purpose                                                                |
| --------------- | ------ | ---------- | ------------------------- | ---------------------------------------------------------------------- |
| `api`           | fork   | 750 MB     | node --enable-source-maps | NestJS HTTP API on 3001                                                |
| `web`           | fork   | 1 GB       | node (Next.js)            | Next 14 App Router on 5551                                             |
| `worker`        | fork   | 2 GB       | node --enable-source-maps | BullMQ consumer, 15 queue dispatchers                                  |
| `solver-py`     | fork   | 7 GB       | uvicorn (FastAPI)         | OR-Tools CP-SAT scheduler sidecar on 5557 (loopback-only, worker only) |
| `pm2-logrotate` | module | —          | —                         | rotates PM2 stdout/stderr logs                                         |

### Why these caps?

- **worker 2 GB**: CP-SAT solves reached ~900 MB RSS during 6-year-group scheduling. The old 750 MB ceiling triggered restart-mid-solve.
- **solver-py 7 GB**: Tier-5 scheduling at 300 s solve budget OOM'd at >4 GB. 7 GB gives headroom; server has 15 GB total.

### `pmx: false` on every Node process

PM2 6.x ships with `require-in-the-middle@5.2.0` for its PMX monitoring. That version mis-resolves ESM `exports`-field packages (e.g. `@school/shared`), spamming `Cannot find module` to stderr on every require site even though the require succeeds via main-field fallback. We use Sentry for APM, so PMX is disabled globally. See commit `239240ad`.

### pm2-logrotate

Configured via `pm2 set`:

```
max_size         50M
retain           7
compress         true
rotateInterval   0 0 * * *     (daily midnight)
workerInterval   30s
```

Logs land in `/home/edupod/.pm2/logs/<app>-{out,error}-<instance>.log`. Compressed rotations accumulate as `*.log.gz`. Without this module, logs grow unbounded — we hit 943 MB of worker stdout from pre-fix CP-SAT restart loops.

### Files

- `ecosystem.config.cjs` (repo root — checked in)
- `/home/edupod/.pm2/` (PM2 home dir)
- `/home/edupod/.pm2/logs/` (active logs)
- `/home/edupod/.pm2/module_conf.json` (pm2-logrotate settings — **server-local**)

---

## 8. Filesystem Layout

```
/opt/edupod/
├── app/                   # repo checkout (what git/CI deploys to)
│   ├── apps/{api,web,worker,solver-py}
│   ├── packages/{shared,prisma,ui,…}
│   ├── .env               # symlink target — DO NOT overwrite on rsync
│   ├── .env.local         # also symlinked — DO NOT overwrite
│   ├── ecosystem.config.cjs
│   └── scripts/deploy-production.sh   # what GH Actions runs
├── backups/
│   ├── git/               # one-time bundles (from pre-push cleanup 2026-04-22)
│   ├── predeploy/         # taken by deploy script before each deploy
│   ├── db-YYYYMMDD.sql.gz # daily Postgres dumps (15-day retention)
│   └── redis-YYYYMMDD.rdb # daily Redis snapshots (15-day retention)
├── data/
│   ├── postgres/          # Postgres data dir (volume-mounted into container)
│   ├── redis/             # AOF file
│   └── meilisearch/       # index files
├── docker-compose.yml     # postgres + redis + meilisearch
├── meilisearch/           # (ancillary configs if any)
├── nginx/                 # (unused — actual nginx config is at /etc/nginx/)
├── pgbouncer/             # pgbouncer container config
├── postgres/              # (ancillary)
└── redis/                 # (ancillary)
```

**The app directory's `.env` symlink matters.** `apps/api/.env` and `apps/worker/.env` are symlinks to `/opt/edupod/app/.env`. The deploy rsync MUST exclude `.env` and `.env.local` — they hold production secrets that are not in git and differ from the dev template.

### Files

- `/opt/edupod/app/.env` (production secrets; not in git)
- `/opt/edupod/app/.env.local` (additional secrets; not in git)
- `apps/api/.env → ../../.env` (symlink — verify after rsync)
- `apps/worker/.env → ../../.env` (symlink — verify after rsync)

---

## 9. Deploy Flow

```
  push to origin/main
        │
        ▼
  GitHub Actions (ci.yml)
   │  jobs: ci, unit-tests (matrix x3), backend-serial, backend-parallel,
   │        build, visual, changes
   │  gated by: all pass
   │
   ▼
  deploy job (push only, ref=main, concurrency=production-deploy)
   │  appleboy/ssh-action@v1.0.0
   │  secrets: SSH_HOST, SSH_USER, SSH_PRIVATE_KEY, TURBO_TOKEN
   │
   ▼
  SSH onto edupod-prod-1 as root
   │
   ▼
  /opt/edupod/app/scripts/deploy-production.sh
    │  flock on .git/edupod-deploy.lock       (prevents concurrent deploys)
    │  git checkout main                      (needs clean tree — see gotchas)
    │  git fetch origin main
    │  git checkout $DEPLOY_SHA               (detached HEAD)
    │  load_runtime_env                       (sources /opt/edupod/app/.env)
    │  install_dependencies                   (pnpm install, frozen lockfile)
    │  rebuild_solver_venv_if_broken          (Python .venv)
    │  generate_prisma_client                 (prisma generate)
    │  run_deploy_preflight                   (sanity checks)
    │  run_build                              (turbo build, uses TURBO_* remote cache)
    │  create_predeploy_backup                (pg_dump → /opt/edupod/backups/predeploy)
    │  prisma migrate deploy                  (expand/contract — see migration-policy)
    │  verify_migrations
    │  db:post-migrate                        (RLS + SQL tail)
    │  restore_pm2_services                   (pm2 delete all + pm2 start ecosystem)
    │  run_smoke_test                         (hits web, api, worker, solver endpoints)
    │  notify_deploy                          (if configured)
    │
    ▼ on any failure
  rollback_release                             (git checkout previous_sha + rebuild)
```

### GitHub Actions secrets used

From `.github/workflows/ci.yml`:

| secret                                     | purpose                                       |
| ------------------------------------------ | --------------------------------------------- |
| `SSH_HOST`                                 | `46.62.244.139`                               |
| `SSH_USER`                                 | `root`                                        |
| `SSH_PRIVATE_KEY`                          | ed25519 key with access to root@edupod-prod-1 |
| `TURBO_API` / `TURBO_TEAM` / `TURBO_TOKEN` | turbo remote cache creds                      |
| `GITHUB_TOKEN`                             | built-in, scoped to the workflow run          |

### How the server fetches code

The server's `/opt/edupod/app/.git/config` uses an SSH remote (`git@github.com:ACANOTES-dev/EduPod.git`). Auth is a repo-level **deploy key** registered as `edupod-prod-1 deploy` on GitHub, with the private half at `/root/.ssh/github_deploy`. Deploy keys are read-only (deploy only does `git fetch`, never pushes). `/root/.ssh/config` has an explicit `Host github.com` block pinning that key so plain `git fetch` Just Works as root. Swapped from an embedded PAT on 2026-04-22 (commit `e07ea952` era).

### Timing (2026-04-22 benchmark, warm cache)

push wire **2 s** → CI **6m 43s (cold) / ~3 min (warm)** → deploy **1m 29s** → **total ~5m 52s** on a hot-cache push.

### Files

- `.github/workflows/ci.yml` (in repo — the only workflow)
- `/opt/edupod/app/scripts/deploy-production.sh` (where the remote side lives)
- `/opt/edupod/app/.git/config` (**contains secret — do not git-restore**)
- `/root/.ssh/github_deploy` + `/root/.ssh/config` (SSH auth alternative)

---

## 10. Environment Variables

Secrets live on the server at `/opt/edupod/app/.env` (and `.env.local`). They are **not** in git. When rsyncing the app, these files must be excluded.

Variables grouped by concern:

| group                           | keys                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **database**                    | `DATABASE_URL`, `DATABASE_MIGRATE_URL`, `POSTGRES_PASSWORD`                                             |
| **cache / queue**               | `REDIS_URL`, `REDIS_PASSWORD`                                                                           |
| **search**                      | `MEILISEARCH_URL`, `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`, `MEILI_MASTER_KEY`                        |
| **app secrets**                 | `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `ENCRYPTION_KEY_LOCAL`, `MFA_ISSUER`              |
| **object storage (Hetzner S3)** | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`                                              |
| **Cloudflare API**              | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`                                   |
| **payments**                    | `STRIPE_TEST_PUBLISHABLE_KEY`, `STRIPE_TEST_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (test-mode only today) |
| **email**                       | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET`                                          |
| **SMS / WhatsApp**              | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`                                       |
| **observability**               | `SENTRY_DSN_BACKEND`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (placeholder until set)             |
| **URLs**                        | `APP_URL`, `API_URL`, `PLATFORM_DOMAIN`                                                                 |
| **app runtime**                 | `NODE_ENV`, `API_PORT`                                                                                  |

### Rotation policy

- **Every 90 days**: JWT, encryption, AWS, Stripe, Resend, Twilio keys. Rotate via provider UI → update `.env` → `pm2 restart api web worker`.
- **Immediately on compromise**: all of the above plus `POSTGRES_PASSWORD` + `REDIS_PASSWORD` (both require container restart — brief downtime).
- **Never in git**: if a secret ends up committed, revoke in provider UI FIRST, then purge history.

### Files

- `/opt/edupod/app/.env`
- `/opt/edupod/app/.env.local`
- `.env.example` (in repo — shape reference only; never has real values)

---

## 11. Backups

### Postgres — daily

```
0 3 * * * docker exec $(docker ps -q --filter ancestor=postgres:16) \
  pg_dump -U edupod_admin school_platformedupod_prod | \
  gzip > /opt/edupod/backups/db-$(date +%Y%m%d).sql.gz && \
  find /opt/edupod/backups -name "db-*.sql.gz" -mtime +15 -delete
```

- Runs as root at 03:00 UTC.
- 15-day retention.
- Typical size: 2-3 MB compressed.
- **Restore drill**: see runbook § Restore a Postgres backup.

### Redis — daily

```
15 3 * * * REDIS_PASS=$(grep ^REDIS_URL= /opt/edupod/app/.env | sed -E 's|.*://:([^@]+)@.*|\1|')
          RID=$(docker ps -qf name=redis | head -1)
          docker exec $RID redis-cli -a $REDIS_PASS --no-auth-warning BGSAVE
          sleep 5
          docker cp $RID:/data/dump.rdb /opt/edupod/backups/redis-$(date +%Y%m%d).rdb
          find /opt/edupod/backups -name "redis-*.rdb" -mtime +15 -delete
```

- Runs as root at 03:15 UTC.
- 15-day retention.
- Captures BullMQ job state, session store, canary state.

### Pre-deploy backup

`deploy-production.sh` runs `create_predeploy_backup` before migrations, storing a Postgres dump at `/opt/edupod/backups/predeploy/`. This is the rollback target if a migration goes wrong.

### NOT backed up (at time of writing)

- Meilisearch index (`/opt/edupod/data/meilisearch/`) — can be rebuilt from Postgres via `search-reindex` worker job.
- Object storage contents (uploaded files, report card PDFs) — Hetzner Object Storage has its own versioning; enable per-bucket.
- `/etc/nginx/`, `/etc/letsencrypt/`, `/etc/fail2ban/`, `/etc/ssh/sshd_config` — host configs. Copy these off-server if you ever want a quick restore without re-running bootstrap.

### Offsite copies

Backups currently live only on the host. **TODO before real tenant data lands**: sync `/opt/edupod/backups/` to Hetzner Object Storage (or S3) nightly. A host disk failure = total loss today.

### Files

- `crontab -l` as root (the schedule)
- `/opt/edupod/backups/db-*.sql.gz`
- `/opt/edupod/backups/redis-*.rdb`
- `/opt/edupod/backups/predeploy/`
- `/opt/edupod/app/scripts/deploy-production.sh` (has the `create_predeploy_backup` function)

---

## 12. Scheduled Work

### Root cron

| cadence      | command                  | purpose               |
| ------------ | ------------------------ | --------------------- |
| `0 3 * * *`  | pg_dump                  | daily Postgres backup |
| `15 3 * * *` | Redis BGSAVE + docker cp | daily Redis backup    |

### systemd timers

| unit                   | cadence     | purpose                |
| ---------------------- | ----------- | ---------------------- |
| `certbot.timer`        | twice daily | Let's Encrypt renewal  |
| `dpkg-db-backup.timer` | daily       | OS package DB snapshot |
| `fail2ban.service`     | always-on   | SSH brute-force ban    |

### Application-level crons (run **inside** the worker, not host cron)

Registered by `CronSchedulerService` on worker startup — all scheduled as BullMQ repeatable jobs, dispatched through their respective queue dispatchers. See `docs/architecture/event-job-catalog.md` for the full list (attendance digest, behaviour SLA, report-card auto-generate, etc.).

### Cloudflare IP list refresh

`/etc/nginx/cloudflare-ips.conf` is auto-regenerated nightly from `https://www.cloudflare.com/ips-{v4,v6}`. The script lives at `update-cloudflare-ips.sh` (path currently unverified — grep the crontab or systemd timers if you need to trace it). The file header carries the last regen timestamp.

### Files

- `crontab -l` (root)
- `systemctl list-timers --all`

---

## 13. Logs

| source                 | path                                                      | rotation                                      |
| ---------------------- | --------------------------------------------------------- | --------------------------------------------- |
| PM2 apps stdout/stderr | `/home/edupod/.pm2/logs/`                                 | pm2-logrotate (50 MB, 7-day, compress, daily) |
| nginx access           | `/var/log/nginx/access.log`                               | logrotate (default Ubuntu config)             |
| nginx error            | `/var/log/nginx/error.log`                                | logrotate                                     |
| Docker containers      | `docker logs <container>` (via docker-daemon ring buffer) | docker default                                |
| systemd journal        | `journalctl`                                              | ring-buffered                                 |
| fail2ban               | `/var/log/fail2ban.log`                                   | logrotate                                     |

### Accessing logs

```bash
# Live tail of an app
sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 logs api

# Just stderr, last N lines
sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 logs api --err --lines 200 --nostream

# Inside a container
docker logs --tail 200 edupod-postgres-1

# System-level
journalctl -u ssh --since "1h ago"
```

### Things that used to go wrong

- **Unbounded growth**: before pm2-logrotate was installed (pre 2026-04-22), a worker crash-loop during CP-SAT memory overruns pumped `worker-out-2.log` to 943 MB. pm2-logrotate now prevents this.
- **Zombie log files**: PM2 creates a new log file each time its internal process counter advances (api-error-0.log, api-error-1.log, …). Old ones aren't auto-cleaned. Confirm the "active" log path with `pm2 describe <app> | grep "log path"`; anything else is archival.

### Files

- `/home/edupod/.pm2/logs/`
- `/var/log/nginx/`
- `/var/log/fail2ban.log`

---

## 14. Monitoring & Observability

### Sentry

- Backend DSN: `SENTRY_DSN_BACKEND` (api + worker both ship to this).
- Frontend DSN: `NEXT_PUBLIC_SENTRY_DSN`.
- Release tracking: `SENTRY_AUTH_TOKEN` controls whether source maps upload on deploy. If absent, stack traces show minified names. **Generate at** https://sentry.io/settings/account/api/auth-tokens/ with scopes `project:releases` + `org:read`.
- Environments: set via `SENTRY_ENVIRONMENT=production` in PM2 ecosystem config.

### fail2ban

Covered in § Firewall. `fail2ban-client status sshd` for the current ban list.

### Smoke endpoints

Each process exposes a health URL:

| app       | url                                | purpose                                               |
| --------- | ---------------------------------- | ----------------------------------------------------- |
| api       | `http://127.0.0.1:3001/api/health` | Postgres reachable, Redis reachable                   |
| web       | `http://127.0.0.1:5551/en/login`   | page renders                                          |
| worker    | `http://127.0.0.1:5556/health`     | Postgres + Redis + all BullMQ queues, stuck-job count |
| solver-py | `http://127.0.0.1:5557/health`     | solver process alive                                  |

The deploy script hits all four as part of `run_smoke_test`.

### External uptime (UptimeRobot)

Two HTTP monitors at 5-minute cadence with email notifications:

- **EduPod API** — `https://edupod.app/api/health` (goes CF → nginx → api, covers the full public chain)
- **EduPod Web** — `https://edupod.app/` (covers CF → nginx → web + render)

Console: https://uptimerobot.com/dashboard. Using 2 of 50 monitor slots — room to add worker, solver-py, and per-tenant subdomains later if ever useful.

### Missing / TODO

- **Alert routing** — Sentry DSNs are set; alert _rules_ not verified to actually page anyone. `SRE_TODO: verify Slack/email routing on a test issue.`
- **Extra UptimeRobot monitors worth adding before heavy tenant load**: one hit against a known tenant subdomain (e.g. `https://nhqs.edupod.app/api/health`) catches CF-subdomain routing regressions the apex-only monitor would miss.

### Files

- `apps/api/src/modules/health/` (where the `/api/health` endpoint is implemented)
- `apps/worker/src/health/` (worker health)
- `apps/solver-py/src/` (solver health)

---

## 15. Security

### SSH

- Key-only auth.
- `PasswordAuthentication no`.
- `PermitRootLogin without-password` — root can SSH but only with a key (the deploy action needs this).
- `ChallengeResponseAuthentication no`, `KbdInteractiveAuthentication no`.
- fail2ban active with aggressive sshd jail.
- **Regression test**: after any change to `/etc/ssh/sshd_config`, run `sshd -t` then `systemctl reload ssh` (NOT restart — reload keeps existing sessions alive in case the new config locks you out). Then verify a fresh `ssh root@46.62.244.139 hostname` works from another terminal.

### User accounts

| user     | shell auth                                    | purpose                                     |
| -------- | --------------------------------------------- | ------------------------------------------- |
| `root`   | SSH key (including the GH Actions deploy key) | host admin + deploy                         |
| `edupod` | **password-locked**                           | PM2 runs as this user; cannot be SSH'd into |

### Secrets at rest

- `/opt/edupod/app/.env` is 0644 root-readable. PM2 sources it via `pm2 start --update-env`. Consider tightening to 0600 and running PM2 as a user that owns this file.
- Stripe/Resend/Twilio webhook secrets are in `.env` — every webhook handler validates the signature before processing.
- Bank details, Stripe account IDs, and other PII columns are encrypted application-side with `ENCRYPTION_KEY` (AES-256). Decrypt only in memory; never log, never return in responses.

### GitHub auth

Repo-level **deploy key** (read-only), `edupod-prod-1 deploy`. Private half on the server at `/root/.ssh/github_deploy` (ed25519); public half registered at `github.com/ACANOTES-dev/EduPod → Settings → Deploy keys`. `/root/.ssh/config` has a `Host github.com` block pinning that key + `IdentitiesOnly yes`.

To rotate the deploy key:

1. `ssh-keygen -t ed25519 -C "edupod-deploy-$(hostname)" -f /root/.ssh/github_deploy_new -N ""`
2. Add `/root/.ssh/github_deploy_new.pub` as a new deploy key on GitHub (title it something time-stamped).
3. Swap: `mv /root/.ssh/github_deploy{,.old} && mv /root/.ssh/github_deploy_new /root/.ssh/github_deploy && mv /root/.ssh/github_deploy_new.pub /root/.ssh/github_deploy.pub`.
4. Test: `git -C /opt/edupod/app fetch origin main`.
5. Remove the old deploy key from GitHub's UI.

No PAT is used anywhere on the host. If you ever see `ghp_…` or `github_pat_…` in `/opt/edupod/app/.git/config` again, something regressed — revoke it immediately.

### Certificate rotation

- Cloudflare Origin Cert: 15-year, expires 2041-03-14. No renewal concern.
- Let's Encrypt certs: auto-renewed by `certbot.timer`. Email alerts on failure if Let's Encrypt account email is set.

### Files

- `/etc/ssh/sshd_config` + `/etc/ssh/sshd_config.bak-*`
- `/etc/fail2ban/jail.local`
- `/root/.ssh/` (root's keys + config)
- `/opt/edupod/app/.env` (secrets)

---

## Server-local configs NOT in git

**The gotcha.** These files live only on the server. Nothing in `/Users/ram/Desktop/SDB/` is their source of truth. If the host dies, they have to be recreated by hand (or from backups, if you took any).

| file / dir                                   | what it is                                              |
| -------------------------------------------- | ------------------------------------------------------- |
| `/etc/nginx/sites-enabled/edupod`            | main vhost (proxy rules, CF check, rate limits)         |
| `/etc/nginx/sites-enabled/00-default-reject` | catch-all reject                                        |
| `/etc/nginx/sites-enabled/turbo-cache`       | turbo cache vhost                                       |
| `/etc/nginx/conf.d/rate-limits.conf`         | limit_req zones                                         |
| `/etc/nginx/conf.d/cloudflare-geo.conf`      | `$is_cf_edge` geo map                                   |
| `/etc/nginx/cloudflare-ips.conf`             | CF edge CIDRs (auto-regen — OK to lose, regens nightly) |
| `/etc/ssh/sshd_config`                       | SSH policy                                              |
| `/etc/fail2ban/jail.local`                   | fail2ban overrides                                      |
| `/opt/edupod/docker-compose.yml`             | postgres/redis/meilisearch services                     |
| `/opt/edupod/pgbouncer/`                     | pgbouncer config                                        |
| `/opt/edupod/app/.env`                       | **production secrets**                                  |
| `/opt/edupod/app/.env.local`                 | additional secrets                                      |
| `/etc/ssl/edupod-origin.{pem,key}`           | Cloudflare origin cert                                  |
| `/etc/letsencrypt/`                          | Let's Encrypt state                                     |
| root crontab                                 | backup schedules                                        |
| `/home/edupod/.pm2/module_conf.json`         | pm2-logrotate settings                                  |
| `/root/.ssh/`                                | SSH keys                                                |

**Mitigation**: every time you edit one of these on the server, either:

1. Commit an updated copy into `infrastructure/` in this repo (future TODO — Ansible/Terraform), or
2. At minimum, update the `## Last verified` date and the relevant section of **this document** so the doc is the record.

---

## 16. Runbooks

### 16.1 Restart an app

```bash
ssh root@46.62.244.139
sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 restart api      # or web, worker, solver-py
sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 logs api --lines 50 --nostream
```

### 16.2 Full deploy from local (bypass GH Actions — emergency only)

```bash
# From repo root, local
rsync -az --delete \
  --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='dist' \
  --exclude='.env' --exclude='.env.local' --exclude='.turbo' --exclude='*.tsbuildinfo' \
  ./ root@46.62.244.139:/opt/edupod/app/

ssh root@46.62.244.139 'chown -R edupod:edupod /opt/edupod/app/ && \
  ls -la /opt/edupod/app/apps/api/.env /opt/edupod/app/apps/worker/.env && \
  bash /opt/edupod/app/scripts/deploy-production.sh'
```

The symlink check on `.env` is load-bearing — if it's broken, API/worker start with no config.

### 16.3 Restore a Postgres backup (dry run)

```bash
ssh root@46.62.244.139
RID=$(docker ps -qf name=postgres | head -1)
docker exec -i $RID createdb -U edupod_admin restore_test
zcat /opt/edupod/backups/db-YYYYMMDD.sql.gz | \
  docker exec -i $RID psql -U edupod_admin -d restore_test
docker exec -i $RID psql -U edupod_admin -d restore_test -c '
  SELECT count(*) AS users FROM users;
  SELECT count(*) AS tenants FROM tenants;
'
docker exec -i $RID dropdb -U edupod_admin restore_test
```

### 16.4 Restore a Postgres backup (for real — disaster recovery)

```bash
# STOP the app first so nothing writes during restore
sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 stop api worker web
RID=$(docker ps -qf name=postgres | head -1)

# Drop and recreate
docker exec -i $RID dropdb -U edupod_admin edupod_prod
docker exec -i $RID createdb -U edupod_admin edupod_prod

# Restore
zcat /opt/edupod/backups/db-YYYYMMDD.sql.gz | \
  docker exec -i $RID psql -U edupod_admin -d edupod_prod

# Bring apps back
sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 restart api worker web
curl -s http://127.0.0.1:3001/api/health
```

### 16.5 "A queue is backed up"

```bash
# Inspect queue depth
docker exec -it $(docker ps -qf name=redis) redis-cli -a "$(grep ^REDIS_URL= /opt/edupod/app/.env | sed -E 's|.*://:([^@]+)@.*|\1|')" --no-auth-warning LLEN bull:<queue-name>:wait
# Check worker health
curl -s http://127.0.0.1:5556/health | jq '.checks.bullmq'
# If a specific processor is stuck, worker restart is safe (retry logic is idempotent)
sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 restart worker
```

### 16.6 "Logs are eating disk"

`pm2-logrotate` handles this automatically now. If disk still growing unexpectedly:

```bash
du -sh /home/edupod/.pm2/logs/ /var/log/nginx/ /var/lib/docker/
# Zombie PM2 logs (from old instance IDs):
sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 describe api | grep 'log path'
# Anything NOT ending in that suffix under /home/edupod/.pm2/logs/ is archival — safe to gzip or delete.
```

### 16.7 "Certs aren't renewing"

```bash
systemctl status certbot.timer
journalctl -u certbot --since "24h ago"
certbot renew --dry-run
```

### 16.8 "fail2ban banned my IP"

```bash
fail2ban-client set sshd unbanip <your-ip>
```

### 16.9 Rotate a secret

1. Generate new value at provider UI.
2. Update `/opt/edupod/app/.env` on the server (`ssh root@… sed -i 's/OLD_VALUE/NEW_VALUE/' /opt/edupod/app/.env`).
3. `sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 restart api worker web --update-env`.
4. Verify via `/api/health`.
5. Revoke the old value at the provider.

---

## 17. Bootstrap from Scratch

High-level, not every command. If you're rebuilding on a new Hetzner instance, the order is:

1. **Provision Ubuntu 24.04 LTS**, enable IPv6, set hostname `edupod-prod-1`.
2. **Set up SSH**: install your key as `/root/.ssh/authorized_keys`, disable password auth (see § Security).
3. **Install fail2ban**: `apt install fail2ban`, drop in `/etc/fail2ban/jail.local` (see § Firewall).
4. **UFW**: `ufw allow OpenSSH`, `ufw allow 80/tcp`, `ufw allow 443/tcp`, `ufw enable`.
5. **Install Docker + Docker Compose**: standard apt install, add `root` to `docker` group.
6. **Install Node.js 24**: nvm or NodeSource, enable pnpm.
7. **Install PM2 globally**: `npm i -g pm2`.
8. **Create `edupod` user**: `adduser --disabled-password edupod`, lock password with `passwd -l edupod`.
9. **Clone repo**: `git clone git@github.com:ACANOTES-dev/EduPod.git /opt/edupod/app` (needs deploy key first).
10. **Create data dirs**: `mkdir -p /opt/edupod/{data/{postgres,redis,meilisearch},backups/{predeploy,git}}`.
11. **Create `/opt/edupod/docker-compose.yml`** (see § Docker Stack for content).
12. **Set up `.env`**: create `/opt/edupod/app/.env` with the keys listed in § Environment Variables. Symlink `apps/api/.env`, `apps/worker/.env` to `../../.env`.
13. **Start containers**: `cd /opt/edupod && docker compose up -d`.
14. **Set up pgbouncer** separately (see `/opt/edupod/pgbouncer/`).
15. **Run initial migrations**: `cd /opt/edupod/app && pnpm install && pnpm --filter @school/prisma exec prisma migrate deploy`.
16. **Install nginx + certbot**: `apt install nginx certbot python3-certbot-nginx`.
17. **Install the CF origin cert** at `/etc/ssl/edupod-origin.{pem,key}` (0600 for the key).
18. **Drop in the 3 nginx vhosts** from this doc (or copy them from a backup).
19. **Regenerate CF IP list**: run `update-cloudflare-ips.sh`.
20. **Request Let's Encrypt cert for turbo.edupod.app**: `certbot --nginx -d turbo.edupod.app`.
21. **Start apps**: `cd /opt/edupod/app && sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 start ecosystem.config.cjs && pm2 save`.
22. **Install pm2-logrotate**: `sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 install pm2-logrotate && pm2 set pm2-logrotate:max_size 50M && pm2 set pm2-logrotate:retain 7 && pm2 set pm2-logrotate:compress true`.
23. **Add cron jobs**: the pg_dump + redis BGSAVE lines from § Backups.
24. **Point DNS**: at Cloudflare, make `edupod.app` + `*.edupod.app` proxy-mode ("orange cloud") pointing at `46.62.244.139`. Make `turbo.edupod.app` DNS-only (grey cloud).
25. **Add this host's SSH key to GitHub as a deploy key** (read access).
26. **Add GH Actions secrets** (SSH*HOST/USER/PRIVATE_KEY, TURBO*\*) in repo settings.
27. **Smoke**: push a trivial commit, watch CI + deploy succeed end-to-end.

Estimated time for a clean rebuild with no surprises: **~4 hours**. Eventually this should be an Ansible playbook; until then, this doc is it.

---

## 18. Appendix — File paths cheat sheet

```
# Host configs (NOT in git):
/etc/ssh/sshd_config
/etc/nginx/sites-enabled/{edupod,turbo-cache,00-default-reject}
/etc/nginx/conf.d/{rate-limits.conf,cloudflare-geo.conf}
/etc/nginx/cloudflare-ips.conf          # auto-regen
/etc/ssl/edupod-origin.{pem,key}         # CF origin cert
/etc/letsencrypt/                         # auto-renewed
/etc/fail2ban/jail.local
/etc/ufw/user.rules
root's crontab                            # backups

# App dir (managed by deploy):
/opt/edupod/app/                          # repo checkout
/opt/edupod/app/.env                      # secrets — NOT in git
/opt/edupod/app/.env.local                # secrets — NOT in git
/opt/edupod/app/ecosystem.config.cjs      # PM2 config (IS in git)
/opt/edupod/app/scripts/deploy-production.sh  # deploy (IS in git)

# Data & backups:
/opt/edupod/data/{postgres,redis,meilisearch}/   # persistent volumes
/opt/edupod/backups/db-*.sql.gz           # daily Postgres
/opt/edupod/backups/redis-*.rdb           # daily Redis
/opt/edupod/backups/predeploy/            # pre-deploy safety dumps
/opt/edupod/docker-compose.yml            # pg/redis/meili services

# PM2:
/home/edupod/.pm2/                        # PM2 home
/home/edupod/.pm2/logs/                   # app logs
/home/edupod/.pm2/module_conf.json        # pm2-logrotate settings

# SSH:
/root/.ssh/authorized_keys                # who can log in as root
/root/.ssh/github_deploy                  # key for pulling from GitHub
/root/.ssh/config                         # SSH config (github.com block)
```

---

## 19. Maintenance checklist

When any of these changes, update this doc:

- [ ] New service added / removed (docker-compose, PM2 app)
- [ ] Port opened / closed
- [ ] New env var required
- [ ] New cron / timer
- [ ] Backup schedule or retention changes
- [ ] TLS cert source / domain changes
- [ ] Nginx routing / rate-limit changes
- [ ] Any "server-local config NOT in git" file touched
- [ ] Deploy flow changes
- [ ] Bootstrap steps change

Bump `Last verified:` at the top of this file each time.
