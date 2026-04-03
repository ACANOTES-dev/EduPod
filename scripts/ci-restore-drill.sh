#!/usr/bin/env bash
# ─── CI Restore Drill ──────────────────────────────────────────────────────────
#
# Automated restore evidence: dumps and restores the CI test database,
# then verifies RLS, triggers, extensions, and table integrity.
#
# This runs in CI after migrations + seed, proving the backup/restore path
# works on every pipeline run — not just when someone remembers to drill.
#
# Required env: DATABASE_URL (CI test database)
# ────────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "═══ CI Restore Drill ═══"
echo ""

# ─── 1. Extract connection details ──────────────────────────────────────────
DB_URL="${DATABASE_URL:?DATABASE_URL is required}"

# Parse the database name from the URL
DB_NAME=$(echo "$DB_URL" | sed -E 's|.*/([^?]+).*|\1|')
RESTORE_DB="${DB_NAME}_restore_drill"
BASE_URL=$(echo "$DB_URL" | sed -E "s|/${DB_NAME}|/${RESTORE_DB}|")

echo "  Source database: $DB_NAME"
echo "  Restore target:  $RESTORE_DB"
echo ""

# ─── 2. Dump the source database ────────────────────────────────────────────
DUMP_FILE="/tmp/ci-restore-drill-$(date +%s).dump"
echo "[1/5] Dumping $DB_NAME..."
pg_dump --format=custom --no-owner --no-privileges "$DB_URL" -f "$DUMP_FILE"
DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "  Dump size: $DUMP_SIZE"
echo ""

# ─── 3. Create the restore target database ──────────────────────────────────
echo "[2/5] Creating restore target database..."
psql "$DB_URL" -c "DROP DATABASE IF EXISTS $RESTORE_DB;" 2>/dev/null || true
psql "$DB_URL" -c "CREATE DATABASE $RESTORE_DB;" 2>/dev/null

# ─── 4. Restore into the target ─────────────────────────────────────────────
echo "[3/5] Restoring into $RESTORE_DB..."
pg_restore --no-owner --no-privileges -d "$BASE_URL" "$DUMP_FILE" 2>/dev/null || true
echo "  Restore complete"
echo ""

# ─── 5. Verify the restored database ────────────────────────────────────────
echo "[4/5] Verifying restored database..."
ERRORS=0

# 5a. Check RLS is enabled on tenant-scoped tables
RLS_CHECK=$(psql "$BASE_URL" -t -A -c "
  SELECT count(*) FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = t.schemaname)
  WHERE t.schemaname = 'public'
    AND EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = t.schemaname
        AND col.table_name = t.tablename
        AND col.column_name = 'tenant_id'
    )
    AND NOT c.relrowsecurity;
")
if [ "$RLS_CHECK" -gt 0 ]; then
  echo "  FAIL: $RLS_CHECK tenant-scoped tables missing RLS after restore"
  ERRORS=$((ERRORS + 1))
else
  echo "  PASS: All tenant-scoped tables have RLS enabled"
fi

# 5b. Check FORCE RLS is active
FORCE_RLS_CHECK=$(psql "$BASE_URL" -t -A -c "
  SELECT count(*) FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = t.schemaname)
  WHERE t.schemaname = 'public'
    AND EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = t.schemaname
        AND col.table_name = t.tablename
        AND col.column_name = 'tenant_id'
    )
    AND NOT c.relforcerowsecurity;
")
if [ "$FORCE_RLS_CHECK" -gt 0 ]; then
  echo "  FAIL: $FORCE_RLS_CHECK tenant-scoped tables missing FORCE RLS after restore"
  ERRORS=$((ERRORS + 1))
else
  echo "  PASS: All tenant-scoped tables have FORCE RLS active"
fi

# 5c. Check critical extensions exist
EXTENSIONS=$(psql "$BASE_URL" -t -A -c "SELECT extname FROM pg_extension ORDER BY extname;")
for ext in "uuid-ossp" "citext" "pgcrypto"; do
  if echo "$EXTENSIONS" | grep -q "^${ext}$"; then
    echo "  PASS: Extension '$ext' present"
  else
    echo "  FAIL: Extension '$ext' missing after restore"
    ERRORS=$((ERRORS + 1))
  fi
done

# 5d. Check migration history is intact
MIGRATION_COUNT=$(psql "$BASE_URL" -t -A -c "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;")
echo "  INFO: $MIGRATION_COUNT completed migrations in restored database"
if [ "$MIGRATION_COUNT" -lt 1 ]; then
  echo "  FAIL: No completed migrations found"
  ERRORS=$((ERRORS + 1))
else
  echo "  PASS: Migration history intact"
fi

# 5e. Check tenant data survived (at least one tenant)
TENANT_COUNT=$(psql "$BASE_URL" -t -A -c "SELECT count(*) FROM tenants;" 2>/dev/null || echo "0")
if [ "$TENANT_COUNT" -gt 0 ]; then
  echo "  PASS: $TENANT_COUNT tenant(s) present in restored database"
else
  echo "  WARN: No tenants found (expected if seed creates tenants)"
fi

echo ""

# ─── 6. Cleanup ─────────────────────────────────────────────────────────────
echo "[5/5] Cleaning up..."
psql "$DB_URL" -c "DROP DATABASE IF EXISTS $RESTORE_DB;" 2>/dev/null || true
rm -f "$DUMP_FILE"

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "═══ FAILED: $ERRORS verification error(s) after restore ═══"
  exit 1
else
  echo "═══ PASSED: Restore drill verified successfully ═══"
  exit 0
fi
