#!/usr/bin/env bash

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/edupod/app}"
BACKUP_DIR="${BACKUP_DIR:-/opt/edupod/backups/predeploy}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
PM2_HOME_DIR="${PM2_HOME_DIR:-/home/edupod/.pm2}"
PM2_USER="${PM2_USER:-edupod}"
SMOKE_WEB_URL="${SMOKE_WEB_URL:-http://localhost:5551/en/login}"
SMOKE_API_URL="${SMOKE_API_URL:-http://localhost:3001/api/health}"

rollback_attempted=0

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$1"
}

run_as_pm2_user() {
  sudo -u "$PM2_USER" PM2_HOME="$PM2_HOME_DIR" "$@"
}

restore_pm2_services() {
  run_as_pm2_user pm2 restart api web worker
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

  if [[ "$web_ok" -ne 1 || "$api_ok" -ne 1 ]]; then
    return 1
  fi
}

load_database_env() {
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a

  if [[ -z "${DATABASE_MIGRATE_URL:-}" ]]; then
    log 'DATABASE_MIGRATE_URL is required for deploys'
    exit 1
  fi
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

run_build() {
  log 'Installing dependencies'
  pnpm install --frozen-lockfile

  cleanup_build_outputs

  log 'Regenerating Prisma client'
  (
    cd packages/prisma
    npx --no-install prisma generate
  )

  log 'Building all packages'
  NEXT_PUBLIC_API_URL= pnpm build --force
}

rollback_release() {
  local previous_sha="$1"

  if [[ "$rollback_attempted" -eq 1 ]]; then
    return 1
  fi

  rollback_attempted=1

  log "Smoke test failed — rolling back to ${previous_sha}"
  git checkout "$previous_sha"
  run_build
  restore_pm2_services
  sleep 5

  if run_smoke_test; then
    log "Rollback complete — restored ${previous_sha}"
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

  run_build
  load_database_env
  create_predeploy_backup

  log 'Running database migrations'
  (
    cd packages/prisma
    DATABASE_URL="$DATABASE_MIGRATE_URL" npx prisma migrate deploy
  )

  log 'Applying post-migrate SQL'
  DATABASE_URL="$DATABASE_MIGRATE_URL" pnpm db:post-migrate

  log 'Restarting services'
  restore_pm2_services

  log 'Running smoke tests'
  sleep 5
  if ! run_smoke_test; then
    rollback_release "$previous_sha"
    exit 1
  fi

  log "Deploy complete for ${deployed_sha}"
}

main "$@"
