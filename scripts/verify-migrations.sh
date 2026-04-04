#!/usr/bin/env bash
# ─── Migration verification ───────────────────────────────────────────────────
# Checks the _prisma_migrations table for partially-applied migrations.
# A migration is considered partial if finished_at IS NULL and rolled_back_at IS NULL.
#
# Usage:
#   DATABASE_MIGRATE_URL="postgres://..." ./verify-migrations.sh
#   DATABASE_MIGRATE_URL="postgres://..." ./verify-migrations.sh --dry-run
#   DATABASE_MIGRATE_URL="postgres://..." ./verify-migrations.sh --backup-dir /opt/edupod/backups/predeploy
#
# Exit codes:
#   0 — all migrations complete
#   1 — partial migrations detected (or missing prerequisites)

set -euo pipefail

DRY_RUN=0
BACKUP_DIR=""

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S %Z')" "$1"
}

usage() {
  cat <<'USAGE'
Usage: verify-migrations.sh [OPTIONS]

Options:
  --dry-run               Print what would be checked without running queries
  --backup-dir <path>     Include backup directory path in recovery instructions
  -h, --help              Show this help message

Environment:
  DATABASE_MIGRATE_URL    Required. PostgreSQL connection string for migration DB.
USAGE
}

# ─── Parse arguments ──────────────────────────────────────────────────────────

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --backup-dir)
      BACKUP_DIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

# ─── Dry-run mode ─────────────────────────────────────────────────────────────

if [[ "$DRY_RUN" -eq 1 ]]; then
  log '[dry-run] Would connect to database using DATABASE_MIGRATE_URL'
  log '[dry-run] Would query: SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL'
  log '[dry-run] If rows returned: exit 1 with recovery instructions'
  log '[dry-run] If no rows returned: exit 0 (all migrations complete)'
  exit 0
fi

# ─── Validate prerequisites ──────────────────────────────────────────────────

if [[ -z "${DATABASE_MIGRATE_URL:-}" ]]; then
  log 'ERROR: DATABASE_MIGRATE_URL is not set'
  exit 1
fi

if ! command -v psql > /dev/null 2>&1; then
  log 'ERROR: psql is required but not found on PATH'
  exit 1
fi

# ─── Check for partial migrations ─────────────────────────────────────────────

QUERY="SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;"

partial_migrations="$(psql "$DATABASE_MIGRATE_URL" -v ON_ERROR_STOP=1 -tAc "$QUERY" 2>&1)" || {
  log "ERROR: Failed to query _prisma_migrations table"
  log "psql output: ${partial_migrations}"
  exit 1
}

# Trim whitespace — psql -tA can return trailing newlines
partial_migrations="$(printf '%s' "$partial_migrations" | sed '/^$/d')"

if [[ -z "$partial_migrations" ]]; then
  log 'Migration verification passed — all migrations fully applied'
  exit 0
fi

# ─── Partial migrations detected — emit detailed recovery instructions ────────

log '═══════════════════════════════════════════════════════════════════'
log 'CRITICAL: Partially-applied migration(s) detected'
log '═══════════════════════════════════════════════════════════════════'
log ''
log 'The following migration(s) started but did not complete:'

while IFS= read -r migration_name; do
  log "  - ${migration_name}"
done <<< "$partial_migrations"

log ''

if [[ -n "$BACKUP_DIR" ]]; then
  log "A pre-deploy backup exists at: ${BACKUP_DIR}"
  log ''
fi

log 'Recovery steps:'
log '  1. Do NOT re-run migrations — this will likely fail or cause further corruption'
if [[ -n "$BACKUP_DIR" ]]; then
  log "  2. Restore from the pre-deploy backup: pg_restore --clean --if-exists -d \$DATABASE_MIGRATE_URL ${BACKUP_DIR}/<latest-predeploy-*.dump>"
else
  log '  2. Restore from the most recent pre-deploy backup using pg_restore'
fi
log '  3. Investigate the failed migration to determine the root cause'
log '  4. Fix the migration and re-deploy'
log ''
log 'Do NOT attempt automated rollback — Prisma migrations are forward-only.'
log '═══════════════════════════════════════════════════════════════════'

exit 1
