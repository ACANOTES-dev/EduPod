#!/usr/bin/env bash

set -euo pipefail

DRILL_DATE="$(date +%Y%m%d-%H%M)"
CONTAINER_NAME="edupod-backup-drill-${DRILL_DATE}"
VOLUME_NAME="${CONTAINER_NAME}-data"
LOG_FILE="backup-drill-${DRILL_DATE}.log"

BACKUP_SEARCH_DIR="${BACKUP_SEARCH_DIR:-/opt/edupod/backups/predeploy}"
BACKUP_FILE_OVERRIDE=""
FROM_S3=false
S3_TEMP_FILE=""
DB_NAME="${DRILL_DB_NAME:-school_platform}"
DB_USER="${DRILL_DB_USER:-postgres}"
DB_PASSWORD="${DRILL_DB_PASSWORD:-drill-local-password}"
DB_PORT="${DRILL_DB_PORT:-5543}"
SKIP_CLEANUP=false
RESTORE_STARTED=false

usage() {
  cat <<'EOF'
Usage:
  ./scripts/backup-drill.sh [options]

Options:
  --backup-file <path>  Restore a specific custom-format .dump file.
  --from-s3             Download and restore from S3 instead of local backup.
  --skip-cleanup        Keep the drill container and Docker volume for extended checks.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup-file)
      BACKUP_FILE_OVERRIDE="${2:-}"
      shift 2
      ;;
    --from-s3)
      FROM_S3=true
      shift
      ;;
    --skip-cleanup)
      SKIP_CLEANUP=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S %Z')] $1"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE"
}

cleanup_resources() {
  if [[ "$SKIP_CLEANUP" == true ]]; then
    return 0
  fi

  docker rm -f "$CONTAINER_NAME" > /dev/null 2>&1 || true
  docker volume rm "$VOLUME_NAME" > /dev/null 2>&1 || true

  # Clean up S3 temp file if one was downloaded
  if [[ -n "$S3_TEMP_FILE" && -f "$S3_TEMP_FILE" ]]; then
    local temp_parent
    temp_parent="$(dirname "$S3_TEMP_FILE")"
    rm -rf "$temp_parent" 2>/dev/null || true
  fi
}

fail() {
  log "FAIL: $1"
  if [[ "$RESTORE_STARTED" == true ]]; then
    cleanup_resources
  fi
  echo ""
  echo "============================================"
  echo "  DRILL FAILED -- see $LOG_FILE for details"
  echo "============================================"
  exit 1
}

pass() {
  log "PASS: $1"
}

resolve_backup_file() {
  if [[ -n "$BACKUP_FILE_OVERRIDE" ]]; then
    if [[ ! -f "$BACKUP_FILE_OVERRIDE" ]]; then
      fail "Backup file not found: $BACKUP_FILE_OVERRIDE"
    fi
    printf '%s\n' "$BACKUP_FILE_OVERRIDE"
    return 0
  fi

  local latest_dump
  latest_dump="$(
    find "$BACKUP_SEARCH_DIR" -type f -name '*.dump' -print 2>/dev/null | sort | tail -n 1
  )"

  if [[ -z "$latest_dump" ]]; then
    fail "No .dump files found in ${BACKUP_SEARCH_DIR}. Pass --backup-file explicitly."
  fi

  printf '%s\n' "$latest_dump"
}

wait_for_postgres() {
  local attempt
  for attempt in $(seq 1 30); do
    if PGPASSWORD="$DB_PASSWORD" pg_isready \
      -h 127.0.0.1 \
      -p "$DB_PORT" \
      -U "$DB_USER" \
      -d "$DB_NAME" > /dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

run_verification_queries() {
  PGPASSWORD="$DB_PASSWORD" psql \
    -h 127.0.0.1 \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    >> "$LOG_FILE" 2>&1 <<'EOSQL'
\echo '--- TABLE ROW COUNTS ---'
SELECT 'tenants' AS table_name, COUNT(*) AS row_count FROM tenants
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'tenant_memberships', COUNT(*) FROM tenant_memberships
UNION ALL SELECT 'students', COUNT(*) FROM students
UNION ALL SELECT 'staff_profiles', COUNT(*) FROM staff_profiles
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
UNION ALL SELECT 'payments', COUNT(*) FROM payments
UNION ALL SELECT 'payroll_runs', COUNT(*) FROM payroll_runs
ORDER BY table_name;

\echo '--- RLS STATUS ---'
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('_prisma_migrations', 'users')
ORDER BY tablename;

\echo '--- RLS POLICIES ---'
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

\echo '--- TRIGGERS ---'
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

\echo '--- EXTENSIONS ---'
SELECT extname, extversion FROM pg_extension ORDER BY extname;

\echo '--- TENANT SEQUENCES ---'
SELECT tenant_id, prefix, current_value
FROM tenant_sequences
ORDER BY tenant_id, prefix;

\echo '--- MIGRATION HISTORY (LAST 10) ---'
SELECT migration_name, finished_at
FROM _prisma_migrations
ORDER BY finished_at DESC
LIMIT 10;

\echo '--- TABLES MISSING RLS (SHOULD BE EMPTY) ---'
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('_prisma_migrations', 'users')
  AND rowsecurity = false;
EOSQL
}

# ─── S3 download (if --from-s3) ──────────────────────────────────────────────
if [[ "$FROM_S3" == true ]]; then
  if [[ -n "$BACKUP_FILE_OVERRIDE" ]]; then
    echo "ERROR: --from-s3 and --backup-file are mutually exclusive" >&2
    exit 1
  fi

  echo "[pre] Downloading latest backup from S3..."
  S3_TEMP_FILE="$(npx tsx scripts/backup-restore-s3.ts --download-only 2>&1 | tail -1)"

  if [[ ! -f "$S3_TEMP_FILE" ]]; then
    echo "ERROR: Failed to download S3 backup. Output was: ${S3_TEMP_FILE}" >&2
    exit 1
  fi

  echo "[pre] Downloaded S3 backup: ${S3_TEMP_FILE}"
  BACKUP_FILE_OVERRIDE="$S3_TEMP_FILE"
fi

BACKUP_FILE="$(resolve_backup_file)"
BACKUP_SIZE_BYTES="$(stat -f '%z' "$BACKUP_FILE" 2>/dev/null || stat -c '%s' "$BACKUP_FILE")"
BACKUP_SIZE_MB="$((BACKUP_SIZE_BYTES / 1024 / 1024))"

log "============================================"
log "  Quarterly Backup Restore Drill"
log "  Date: $(date '+%Y-%m-%d %H:%M:%S %Z')"
log "  Source: $(if [[ "$FROM_S3" == true ]]; then echo 'S3 (off-site)'; else echo 'Local'; fi)"
log "  Backup File: $BACKUP_FILE"
log "  Drill Container: $CONTAINER_NAME"
log "============================================"
echo ""

log "Step 0: Pre-drill checks"

for command in docker pg_restore pg_isready psql; do
  if ! command -v "$command" > /dev/null 2>&1; then
    fail "Required command missing: $command"
  fi
done
pass 'Docker and PostgreSQL client tooling are installed'

if [[ ! -f "$BACKUP_FILE" ]]; then
  fail "Backup file is not readable: $BACKUP_FILE"
fi
pass "Backup file located (${BACKUP_SIZE_MB} MB)"

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  fail "Drill container name already exists: $CONTAINER_NAME"
fi
pass 'Drill container name is available'

echo ""

log 'Step 1: Starting temporary PostgreSQL restore target'

docker volume create "$VOLUME_NAME" > /dev/null
docker run -d \
  --name "$CONTAINER_NAME" \
  --env POSTGRES_DB="$DB_NAME" \
  --env POSTGRES_USER="$DB_USER" \
  --env POSTGRES_PASSWORD="$DB_PASSWORD" \
  --publish "${DB_PORT}:5432" \
  --volume "${VOLUME_NAME}:/var/lib/postgresql/data" \
  postgres:16 > /dev/null

RESTORE_STARTED=true

if ! wait_for_postgres; then
  fail 'Temporary PostgreSQL restore target did not become ready'
fi
pass "Restore target is ready on 127.0.0.1:${DB_PORT}"

echo ""

log 'Step 2: Restoring backup into the drill container'
RESTORE_START_TS="$(date '+%Y-%m-%d %H:%M:%S %Z')"

if ! PGPASSWORD="$DB_PASSWORD" pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  -h 127.0.0.1 \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  "$BACKUP_FILE" >> "$LOG_FILE" 2>&1; then
  fail 'pg_restore failed'
fi

RESTORE_END_TS="$(date '+%Y-%m-%d %H:%M:%S %Z')"
pass 'Backup restore completed'

echo ""

log 'Step 3: Running verification queries against the restored database'

if ! run_verification_queries; then
  fail 'Verification queries failed'
fi
pass 'Verification queries completed'

echo ""

log "============================================"
log "  Drill Results Summary"
log "============================================"
log "Backup source:      $(if [[ "$FROM_S3" == true ]]; then echo 'S3 (off-site)'; else echo 'Local'; fi)"
log "Backup file:        $BACKUP_FILE"
log "Backup size:        ${BACKUP_SIZE_MB} MB"
log "Restore container:  $CONTAINER_NAME"
log "Restore volume:     $VOLUME_NAME"
log "Restore endpoint:   127.0.0.1:${DB_PORT}"
log "Restore start:      $RESTORE_START_TS"
log "Restore complete:   $RESTORE_END_TS"
log "Log file:           $LOG_FILE"
log ""
log "MANUAL CHECKS REQUIRED:"
log "  1. Review verification query output in $LOG_FILE"
log "  2. Compare row counts against production counts captured before the drill"
log "  3. Confirm all tenant-scoped tables still have RLS enabled"
log "  4. Confirm RLS policies and triggers are intact"
log "  5. Confirm extensions (citext, btree_gist, uuid-ossp) are installed"
log "  6. Complete the drill checklist: scripts/backup-drill-checklist.md"
log ""

if [[ "$SKIP_CLEANUP" == true ]]; then
  log 'Cleanup SKIPPED (--skip-cleanup flag set)'
  log "Remember to remove container ${CONTAINER_NAME} and volume ${VOLUME_NAME} when finished"
else
  log 'Step 4: Cleaning up temporary restore resources'
  cleanup_resources
  pass 'Cleanup completed'
fi

echo ""
log "============================================"
log "  Drill Complete"
log "  Fill out the checklist: scripts/backup-drill-checklist.md"
log "============================================"
