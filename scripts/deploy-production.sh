#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/edupod/app}"
BACKUP_DIR="${BACKUP_DIR:-/opt/edupod/backups/predeploy}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-${APP_DIR}/.git/edupod-deploy.lock}"
PM2_HOME_DIR="${PM2_HOME_DIR:-/home/edupod/.pm2}"
PM2_USER="${PM2_USER:-edupod}"
PM2_ECOSYSTEM_FILE="${PM2_ECOSYSTEM_FILE:-${APP_DIR}/ecosystem.config.cjs}"
SENTRY_ENVIRONMENT="${SENTRY_ENVIRONMENT:-production}"
SMOKE_WEB_URL="${SMOKE_WEB_URL:-http://localhost:5551/en/login}"
SMOKE_API_URL="${SMOKE_API_URL:-http://localhost:3001/api/health}"
SMOKE_API_READY_URL="${SMOKE_API_READY_URL:-http://localhost:3001/api/health}"
SMOKE_AUTH_URL="${SMOKE_AUTH_URL:-http://localhost:3001/api/v1/auth/login}"
SMOKE_WORKER_URL="${SMOKE_WORKER_URL:-http://localhost:5556/health}"
SMOKE_SOLVER_URL="${SMOKE_SOLVER_URL:-http://localhost:5557/health}"

# ─── Migration Policy ──────────────────────────────────────────────────────────
# All schema migrations follow the expand/contract pattern.
# Expand (additive) migrations deploy WITH new code.
# Contract (destructive) migrations deploy AFTER code is stable.
# This means code rollback is always sufficient — the old code runs against
# the expanded schema without modification.
# See docs/operations/migration-policy.md for the full policy.
# ───────────────────────────────────────────────────────────────────────────────

rollback_attempted=0

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$1"
}

run_as_pm2_user() {
  sudo -u "$PM2_USER" PM2_HOME="$PM2_HOME_DIR" "$@"
}

restore_pm2_services() {
  local release_sha="$1"

  # Delete and re-create from ecosystem config to ensure PM2 always reads
  # fresh exec_mode/instances settings.  startOrGracefulReload caches stale
  # config from the PM2 dump, which caused cluster-mode crashes on Node 24.
  run_as_pm2_user pm2 delete all 2>/dev/null || true
  run_as_pm2_user env \
    APP_DIR="$APP_DIR" \
    SENTRY_ENVIRONMENT="$SENTRY_ENVIRONMENT" \
    SENTRY_RELEASE="$release_sha" \
    pm2 start "$PM2_ECOSYSTEM_FILE" --update-env
  run_as_pm2_user pm2 save
  run_as_pm2_user pm2 list
}

cleanup_build_outputs() {
  rm -f packages/shared/tsconfig.tsbuildinfo
  rm -rf apps/api/dist apps/worker/dist

  if [[ -d apps/web/.next ]]; then
    local stale_next_dir="apps/web/.next.stale.$(date +%s)"
    mv apps/web/.next "$stale_next_dir" || true
    rm -rf "$stale_next_dir" || true
  fi
}

clean_untracked_build_inputs() {
  # Turbo hashes untracked, non-ignored files. Keep the server checkout's
  # build inputs identical to the Git commit so CI-warmed remote cache keys
  # remain reusable during production deploys. This intentionally avoids -x:
  # ignored runtime/build artifacts such as .env, node_modules, .next, dist,
  # and the solver-py venv are preserved.
  log 'Removing untracked build input files'
  git clean -fd -- apps/api apps/worker apps/web packages scripts
}

# Curl-with-retry: try the URL up to `attempts` times, sleeping `delay`
# seconds between attempts. Returns 0 the moment any attempt succeeds.
# This lets slow-booting services (especially the NestJS worker after a
# pm2 restart, which takes 8-15s on the production VM) clear the smoke
# test instead of triggering an immediate auto-rollback.
curl_with_retry() {
  local url="$1"
  local attempts="${2:-12}"
  local delay="${3:-5}"
  local n=1
  while (( n <= attempts )); do
    if curl -sf "$url" > /dev/null; then
      return 0
    fi
    if (( n < attempts )); then
      sleep "$delay"
    fi
    n=$((n + 1))
  done
  return 1
}

run_smoke_test() {
  local web_ok=0
  local api_ok=0
  local api_ready_ok=0
  local auth_ok=0
  local worker_ok=0
  local solver_ok=0
  local auth_status

  if curl_with_retry "$SMOKE_WEB_URL" 12 5; then
    log 'WEB OK'
    web_ok=1
  else
    log 'WEB FAILED'
    run_as_pm2_user pm2 describe web || true
    run_as_pm2_user pm2 logs web --lines 80 --nostream || true
    curl -I "$SMOKE_WEB_URL" || true
  fi

  if curl_with_retry "$SMOKE_API_URL" 12 5; then
    log 'API OK'
    api_ok=1
  else
    log 'API FAILED'
    run_as_pm2_user pm2 describe api || true
    run_as_pm2_user pm2 logs api --lines 80 --nostream || true
  fi

  if curl_with_retry "$SMOKE_API_READY_URL" 12 5; then
    log 'API READY OK'
    api_ready_ok=1
  else
    log 'API READY FAILED'
    curl -I "$SMOKE_API_READY_URL" || true
  fi

  if curl_with_retry "$SMOKE_WORKER_URL" 12 5; then
    log 'WORKER OK'
    worker_ok=1
  else
    log 'WORKER FAILED'
    run_as_pm2_user pm2 describe worker || true
    run_as_pm2_user pm2 logs worker --lines 80 --nostream || true
  fi

  # solver-py is a loopback-only CP-SAT sidecar exec'd by pm2 with
  # `interpreter: 'none'`. A Mac venv once landed on the Linux server
  # (shebangs + pyvenv.cfg pointed to /Users/... and /opt/homebrew),
  # which bricked uvicorn without leaving any error-log output — pm2
  # showed "online pid=undefined" and the worker surfaced every solve
  # as CP_SAT_UNREACHABLE. The omission of a solver health probe here
  # meant two-plus days of crashed runs passed deploy. Curl /health so
  # a dead sidecar fails the deploy.
  if curl_with_retry "$SMOKE_SOLVER_URL" 12 5; then
    log 'SOLVER OK'
    solver_ok=1
  else
    log 'SOLVER FAILED'
    run_as_pm2_user pm2 describe solver-py || true
    run_as_pm2_user pm2 logs solver-py --lines 80 --nostream || true
  fi

  auth_status="$(
    curl -s -o /dev/null -w '%{http_code}' \
      -H 'Content-Type: application/json' \
      -X POST "$SMOKE_AUTH_URL" \
      --data '{"email":"smoke-test@edupod.app","password":"invalid-password"}' || true
  )"
  case "$auth_status" in
    400|401)
      log "AUTH OK (${auth_status})"
      auth_ok=1
      ;;
    *)
      log "AUTH FAILED (${auth_status:-000})"
      ;;
  esac

  if [[ "$web_ok" -ne 1 || "$api_ok" -ne 1 || "$api_ready_ok" -ne 1 || "$auth_ok" -ne 1 || "$worker_ok" -ne 1 || "$solver_ok" -ne 1 ]]; then
    return 1
  fi
}

check_required_secrets() {
  local missing=()
  local required=(
    DATABASE_URL
    DATABASE_MIGRATE_URL
    REDIS_URL
    JWT_SECRET
    JWT_REFRESH_SECRET
    APP_URL
  )

  for key in "${required[@]}"; do
    if [[ -z "${!key:-}" ]]; then
      missing+=("$key")
    fi
  done

  if [[ "${#missing[@]}" -gt 0 ]]; then
    log "Missing required deployment secrets: ${missing[*]}"
    exit 1
  fi
}

load_runtime_env() {
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a

  check_required_secrets
}

create_predeploy_backup() {
  local backup_file backup_stamp

  if ! command -v pg_dump > /dev/null 2>&1; then
    log 'pg_dump is required on the server for pre-deploy backups'
    exit 1
  fi

  mkdir -p "$BACKUP_DIR"
  backup_stamp="$(date +%Y%m%d-%H%M%S)"
  backup_file="${BACKUP_DIR}/predeploy-${backup_stamp}.dump"

  log "Creating pre-deploy database backup at ${backup_file}"
  pg_dump "$DATABASE_MIGRATE_URL" --format=custom --file "$backup_file"

  find "$BACKUP_DIR" -type f -name '*.dump' -mtime +"$BACKUP_RETENTION_DAYS" -delete || true
}

install_dependencies() {
  log 'Installing dependencies'
  # The build step needs prisma, turbo, tsx, typescript, etc — all
  # declared as devDependencies. The server's runtime .env sets
  # NODE_ENV=production for PM2, which would cause pnpm to skip
  # devDependencies. An inline `NODE_ENV=development` prefix proved
  # unreliable under the drone-ssh wrapper used by appleboy/ssh-action
  # (observed 2026-04-19: prod-only install despite the prefix, leading
  # to a stale prisma v7 being picked up from the npx cache and
  # rejecting the v6-schema).
  # `--config.production=false` is the explicit pnpm CLI flag that
  # disables the production-install short-circuit regardless of
  # NODE_ENV. This is deterministic and wrapper-proof.
  #
  # `--frozen-lockfile` guarantees pnpm-lock.yaml is authoritative — no
  # surprise version drift between deploys. Dropped `--force` (which
  # recreates node_modules/ from scratch) because pnpm's local content-
  # addressable store on the server is already warm and `--frozen-lockfile`
  # reconciles against the lockfile without the rebuild overhead
  # (~50 s per deploy saved, 2026-04-19). If the install ever fails due
  # to a corrupt node_modules/ the error surfaces loudly at this step,
  # so the risk is "louder deploy failure", not "silent prod regression".
  CI=true pnpm install --frozen-lockfile --config.confirmModulesPurge=false --config.production=false

  cleanup_build_outputs
}

rebuild_solver_venv_if_broken() {
  # The solver-py sidecar runs from apps/solver-py/.venv, which is git-
  # ignored and was bootstrapped once on the server on 2026-04-15. It's
  # not managed by pnpm. If anyone ever rsyncs their local workspace to
  # the server the Mac venv gets copied over the Linux one — shebangs
  # point at /Users/... and pyvenv.cfg home= /opt/homebrew/..., so exec
  # of the uvicorn wrapper fails ENOENT, pm2 burns through max_restarts
  # instantly, and the process ghosts "online" with no pid and 0-byte
  # logs. Rebuild the venv in place whenever it's absent, unexecutable,
  # or flagged as foreign (Homebrew header in pyvenv.cfg).
  local cfg=apps/solver-py/.venv/pyvenv.cfg
  local needs_rebuild=0
  if [[ ! -x apps/solver-py/.venv/bin/uvicorn ]]; then
    needs_rebuild=1
  elif ! apps/solver-py/.venv/bin/python --version > /dev/null 2>&1; then
    needs_rebuild=1
  elif [[ -f "$cfg" ]] && grep -Eq '^(home|executable|command) = /(opt/homebrew|Users/)' "$cfg"; then
    needs_rebuild=1
  fi

  if [[ "$needs_rebuild" -eq 1 ]]; then
    log 'solver-py venv missing/unexecutable/foreign — rebuilding from requirements.txt'
    rm -rf apps/solver-py/.venv
    (
      cd apps/solver-py
      python3.12 -m venv .venv
      .venv/bin/pip install -q -U pip setuptools wheel
      .venv/bin/pip install -q -r requirements.txt
      .venv/bin/pip install -q -e . --no-deps
    )
    log 'solver-py venv rebuilt'
  fi
}

generate_prisma_client() {
  log 'Regenerating Prisma client'
  (
    cd packages/prisma
    npx --no-install prisma generate
  )
}

run_deploy_preflight() {
  log 'Running deploy preflight checks'
  local migrate_status_file
  local migrate_status_output

  if ! command -v psql > /dev/null 2>&1; then
    log 'psql is required for deploy preflight checks'
    exit 1
  fi

  if ! psql "$DATABASE_MIGRATE_URL" -v ON_ERROR_STOP=1 -c 'SELECT 1;' > /dev/null; then
    log 'Database connectivity preflight failed'
    exit 1
  fi

  if command -v redis-cli > /dev/null 2>&1; then
    if ! redis-cli -u "$REDIS_URL" ping | grep -qx 'PONG'; then
      log 'Redis connectivity preflight failed'
      exit 1
    fi
  else
    if ! REDIS_URL="$REDIS_URL" node <<'EOF'
const net = require('node:net');

const redisUrl = new URL(process.env.REDIS_URL);
const socket = net.createConnection({
  host: redisUrl.hostname,
  port: Number.parseInt(redisUrl.port || '6379', 10),
});

socket.setTimeout(5000);
socket.on('connect', () => {
  socket.end();
  process.exit(0);
});
socket.on('timeout', () => {
  socket.destroy();
  process.exit(1);
});
socket.on('error', () => {
  process.exit(1);
});
EOF
    then
      log 'Redis connectivity preflight failed'
      exit 1
    fi
  fi

  migrate_status_file="$(mktemp)"

  if ! (
    cd packages/prisma
    DATABASE_URL="$DATABASE_MIGRATE_URL" npx --no-install prisma migrate status
  ) >"$migrate_status_file" 2>&1; then
    migrate_status_output="$(cat "$migrate_status_file")"
    rm -f "$migrate_status_file"

    if printf '%s\n' "$migrate_status_output" | grep -Eiq 'not yet been applied|database is not up to date'; then
      log 'Pending Prisma migrations detected; continuing to migration step'
      return
    fi

    log 'Prisma migration preflight failed'
    printf '%s\n' "$migrate_status_output"
    exit 1
  fi

  rm -f "$migrate_status_file"
}

run_build() {
  local release_sha="$1"

  log 'Building all packages'
  # Build env deliberately aligned with the CI `build` job so Turbo's
  # content hash matches and the remote cache (turbo.edupod.app) hits
  # instead of rebuilding from scratch. The CI job sets SENTRY_RELEASE =
  # ${{ github.sha }} which equals $release_sha here for the same commit;
  # SENTRY_ENVIRONMENT used to be part of the build env but is now read
  # at runtime from a server-rendered meta tag (see
  # apps/web/sentry.client.config.ts + [locale]/layout.tsx), so the
  # client bundle no longer bakes environment in at build time.
  # --force is removed for the same reason: with env aligned there's a
  # real cache to hit.
  # Any NEXT_PUBLIC_* env var listed here would be webpack-inlined into
  # the client bundle — keep this invocation in strict step with CI.
  SENTRY_RELEASE="$release_sha" pnpm build
}

verify_migrations() {
  local deployed_sha="$1"

  log 'Verifying migration completeness'
  if ! DATABASE_MIGRATE_URL="$DATABASE_MIGRATE_URL" \
    bash "${APP_DIR}/scripts/verify-migrations.sh" --backup-dir "$BACKUP_DIR"; then
    notify_deploy 'CRITICAL' "$deployed_sha" 'Partial migration detected — manual recovery required'
    exit 1
  fi
}

run_post_migrate_verification() {
  log 'Running post-migrate verification'
  psql "$DATABASE_MIGRATE_URL" -v ON_ERROR_STOP=1 -f scripts/post-migrate-verify.sql > /dev/null
}

notify_deploy() {
  local status="$1"
  local sha="$2"
  local detail="$3"
  local message="[${status}] EduPod deploy ${sha} (${SENTRY_ENVIRONMENT}) - ${detail}"

  if [[ -n "${DEPLOY_SLACK_WEBHOOK_URL:-}" ]]; then
    local payload
    payload="$(node -e 'console.log(JSON.stringify({ text: process.argv[1] }))' "$message")"
    curl -fsS -X POST \
      -H 'Content-Type: application/json' \
      --data "$payload" \
      "$DEPLOY_SLACK_WEBHOOK_URL" > /dev/null || log 'Slack deploy notification failed'
  fi

  if [[ -n "${DEPLOY_TELEGRAM_BOT_TOKEN:-}" && -n "${DEPLOY_TELEGRAM_CHAT_ID:-}" ]]; then
    curl -fsS \
      "https://api.telegram.org/bot${DEPLOY_TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${DEPLOY_TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=${message}" > /dev/null || log 'Telegram deploy notification failed'
  fi
}

rollback_release() {
  local previous_sha="$1"

  if [[ "$rollback_attempted" -eq 1 ]]; then
    return 1
  fi

  rollback_attempted=1

  log "Smoke test failed — rolling back to ${previous_sha}"
  git checkout "$previous_sha"
  install_dependencies
  rebuild_solver_venv_if_broken
  generate_prisma_client
  run_build "$previous_sha"
  restore_pm2_services "$previous_sha"
  sleep 5

  if run_smoke_test; then
    log "Rollback complete — restored ${previous_sha}"
    notify_deploy 'rollback' "$previous_sha" 'automatic rollback succeeded after smoke test failure'
    return 0
  fi

  log 'Rollback smoke test failed'
  return 1
}

main() {
  local previous_sha deployed_sha target_sha

  cd "$APP_DIR"

  # Keep the lock inside the repo so CI/root deploys and manual edupod deploys
  # use the same writable path.
  mkdir -p "$(dirname "$DEPLOY_LOCK_FILE")"
  exec 9>"$DEPLOY_LOCK_FILE"
  flock 9

  git checkout main
  previous_sha="$(git rev-parse HEAD)"

  log 'Fetching latest code'
  git fetch origin main

  target_sha="${DEPLOY_SHA:-$(git rev-parse origin/main)}"
  git rev-parse --verify "${target_sha}^{commit}" > /dev/null

  log "Checking out ${target_sha}"
  git checkout "$target_sha"
  deployed_sha="$(git rev-parse HEAD)"
  log "Deploying commit ${deployed_sha}"
  clean_untracked_build_inputs

  load_runtime_env
  install_dependencies
  rebuild_solver_venv_if_broken
  generate_prisma_client
  run_deploy_preflight
  run_build "$deployed_sha"
  create_predeploy_backup

  log 'Running database migrations'
  (
    cd packages/prisma
    DATABASE_URL="$DATABASE_MIGRATE_URL" npx prisma migrate deploy
  )

  verify_migrations "$deployed_sha"

  log 'Applying post-migrate SQL'
  DATABASE_URL="$DATABASE_MIGRATE_URL" pnpm db:post-migrate

  run_post_migrate_verification

  log 'Restarting services'
  restore_pm2_services "$deployed_sha"

  log 'Running smoke tests'
  sleep 5
  if ! run_smoke_test; then
    rollback_release "$previous_sha"
    notify_deploy 'failed' "$deployed_sha" 'smoke tests failed after deploy'
    exit 1
  fi

  log "Deploy complete for ${deployed_sha}"
  notify_deploy 'success' "$deployed_sha" 'deploy and smoke suite passed'
}

main "$@"
