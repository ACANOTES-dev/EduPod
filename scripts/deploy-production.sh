#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/edupod/app}"
BACKUP_DIR="${BACKUP_DIR:-/opt/edupod/backups/predeploy}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
PM2_HOME_DIR="${PM2_HOME_DIR:-/home/edupod/.pm2}"
PM2_USER="${PM2_USER:-edupod}"
PM2_ECOSYSTEM_FILE="${PM2_ECOSYSTEM_FILE:-${APP_DIR}/ecosystem.config.cjs}"
SENTRY_ENVIRONMENT="${SENTRY_ENVIRONMENT:-production}"
SMOKE_WEB_URL="${SMOKE_WEB_URL:-http://localhost:5551/en/login}"
SMOKE_API_URL="${SMOKE_API_URL:-http://localhost:3001/api/health}"
SMOKE_API_READY_URL="${SMOKE_API_READY_URL:-http://localhost:3001/api/health}"
SMOKE_AUTH_URL="${SMOKE_AUTH_URL:-http://localhost:3001/api/v1/auth/login}"
SMOKE_WORKER_URL="${SMOKE_WORKER_URL:-http://localhost:5556/health}"

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

  run_as_pm2_user env \
    APP_DIR="$APP_DIR" \
    SENTRY_ENVIRONMENT="$SENTRY_ENVIRONMENT" \
    SENTRY_RELEASE="$release_sha" \
    pm2 startOrGracefulReload "$PM2_ECOSYSTEM_FILE" --only api,web --update-env
  run_as_pm2_user env \
    APP_DIR="$APP_DIR" \
    SENTRY_ENVIRONMENT="$SENTRY_ENVIRONMENT" \
    SENTRY_RELEASE="$release_sha" \
    pm2 restart "$PM2_ECOSYSTEM_FILE" --only worker --update-env
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

run_smoke_test() {
  local web_ok=0
  local api_ok=0
  local api_ready_ok=0
  local auth_ok=0
  local worker_ok=0
  local auth_status

  if curl -sf "$SMOKE_WEB_URL" > /dev/null; then
    log 'WEB OK'
    web_ok=1
  else
    log 'WEB FAILED'
    run_as_pm2_user pm2 describe web || true
    run_as_pm2_user pm2 logs web --lines 80 --nostream || true
    curl -I "$SMOKE_WEB_URL" || true
  fi

  if curl -sf "$SMOKE_API_URL" > /dev/null; then
    log 'API OK'
    api_ok=1
  else
    log 'API FAILED'
    run_as_pm2_user pm2 describe api || true
    run_as_pm2_user pm2 logs api --lines 80 --nostream || true
  fi

  if curl -sf "$SMOKE_API_READY_URL" > /dev/null; then
    log 'API READY OK'
    api_ready_ok=1
  else
    log 'API READY FAILED'
    curl -I "$SMOKE_API_READY_URL" || true
  fi

  if curl -sf "$SMOKE_WORKER_URL" > /dev/null; then
    log 'WORKER OK'
    worker_ok=1
  else
    log 'WORKER FAILED'
    run_as_pm2_user pm2 describe worker || true
    run_as_pm2_user pm2 logs worker --lines 80 --nostream || true
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

  if [[ "$web_ok" -ne 1 || "$api_ok" -ne 1 || "$api_ready_ok" -ne 1 || "$auth_ok" -ne 1 || "$worker_ok" -ne 1 ]]; then
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
  CI=true pnpm install --frozen-lockfile --force --config.confirmModulesPurge=false

  cleanup_build_outputs
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
  NEXT_PUBLIC_API_URL= SENTRY_ENVIRONMENT="$SENTRY_ENVIRONMENT" SENTRY_RELEASE="$release_sha" pnpm build --force
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

  exec 9>/tmp/edupod-deploy.lock
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

  load_runtime_env
  install_dependencies
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
