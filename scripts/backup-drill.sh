#!/usr/bin/env bash
# =============================================================================
# Quarterly Backup Restore Drill Script
# =============================================================================
#
# This script automates the mechanical steps of a quarterly backup restore drill.
# Some steps require manual verification (marked with MANUAL CHECK).
#
# Prerequisites:
#   - AWS CLI configured with production account credentials
#   - psql installed (for database verification queries)
#   - Sufficient IAM permissions for RDS operations
#
# Usage:
#   ./scripts/backup-drill.sh [--skip-cleanup]
#
# Options:
#   --skip-cleanup    Do not delete the temporary instance (for extended testing)
#
# =============================================================================

set -euo pipefail

# --- Configuration -----------------------------------------------------------

PROD_DB_INSTANCE="school-prod"
RESTORE_PREFIX="drill-restore"
DRILL_DATE=$(date +%Y%m%d-%H%M)
RESTORE_INSTANCE="${RESTORE_PREFIX}-${DRILL_DATE}"
SNAPSHOT_ID="drill-snapshot-${DRILL_DATE}"
LOG_FILE="backup-drill-${DRILL_DATE}.log"
DB_NAME="school_platform"
DB_USER="postgres"

SKIP_CLEANUP=false
if [[ "${1:-}" == "--skip-cleanup" ]]; then
  SKIP_CLEANUP=true
fi

# --- Helper Functions --------------------------------------------------------

log() {
  local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE"
}

fail() {
  log "FAIL: $1"
  echo ""
  echo "============================================"
  echo "  DRILL FAILED -- see $LOG_FILE for details"
  echo "============================================"
  exit 1
}

pass() {
  log "PASS: $1"
}

# --- Pre-Drill Checks -------------------------------------------------------

log "============================================"
log "  Quarterly Backup Restore Drill"
log "  Date: $(date '+%Y-%m-%d %H:%M:%S %Z')"
log "  Production Instance: $PROD_DB_INSTANCE"
log "  Restore Instance: $RESTORE_INSTANCE"
log "============================================"
echo ""

log "Step 0: Pre-drill checks"

# Verify AWS CLI is configured
if ! aws sts get-caller-identity > /dev/null 2>&1; then
  fail "AWS CLI not configured or credentials expired"
fi
pass "AWS CLI credentials valid"

# Verify production instance exists and is available
PROD_STATUS=$(aws rds describe-db-instances \
  --db-instance-identifier "$PROD_DB_INSTANCE" \
  --query 'DBInstances[0].DBInstanceStatus' \
  --output text 2>/dev/null || echo "not-found")

if [[ "$PROD_STATUS" != "available" ]]; then
  fail "Production instance status: $PROD_STATUS (expected: available)"
fi
pass "Production instance is available"

# Check latest restorable time
LATEST_RESTORABLE=$(aws rds describe-db-instances \
  --db-instance-identifier "$PROD_DB_INSTANCE" \
  --query 'DBInstances[0].LatestRestorableTime' \
  --output text)
log "Latest restorable time: $LATEST_RESTORABLE"

echo ""

# --- Step 1: Create Snapshot -------------------------------------------------

log "Step 1: Creating manual snapshot of production database"

aws rds create-db-snapshot \
  --db-instance-identifier "$PROD_DB_INSTANCE" \
  --db-snapshot-identifier "$SNAPSHOT_ID" \
  --tags Key=Purpose,Value=backup-drill Key=DrillDate,Value="$DRILL_DATE" \
  > /dev/null

log "Waiting for snapshot to complete (this may take 10-30 minutes)..."

aws rds wait db-snapshot-available \
  --db-snapshot-identifier "$SNAPSHOT_ID"

SNAPSHOT_STATUS=$(aws rds describe-db-snapshots \
  --db-snapshot-identifier "$SNAPSHOT_ID" \
  --query 'DBSnapshots[0].Status' \
  --output text)

if [[ "$SNAPSHOT_STATUS" == "available" ]]; then
  pass "Snapshot created: $SNAPSHOT_ID"
else
  fail "Snapshot creation failed. Status: $SNAPSHOT_STATUS"
fi

SNAPSHOT_SIZE=$(aws rds describe-db-snapshots \
  --db-snapshot-identifier "$SNAPSHOT_ID" \
  --query 'DBSnapshots[0].AllocatedStorage' \
  --output text)
log "Snapshot size: ${SNAPSHOT_SIZE} GB"

echo ""

# --- Step 2: Restore to Temporary Instance -----------------------------------

log "Step 2: Restoring snapshot to temporary instance"

# Get VPC config from production instance
VPC_SG=$(aws rds describe-db-instances \
  --db-instance-identifier "$PROD_DB_INSTANCE" \
  --query 'DBInstances[0].VpcSecurityGroups[0].VpcSecurityGroupId' \
  --output text)

SUBNET_GROUP=$(aws rds describe-db-instances \
  --db-instance-identifier "$PROD_DB_INSTANCE" \
  --query 'DBInstances[0].DBSubnetGroup.DBSubnetGroupName' \
  --output text)

INSTANCE_CLASS=$(aws rds describe-db-instances \
  --db-instance-identifier "$PROD_DB_INSTANCE" \
  --query 'DBInstances[0].DBInstanceClass' \
  --output text)

aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier "$RESTORE_INSTANCE" \
  --db-snapshot-identifier "$SNAPSHOT_ID" \
  --db-instance-class "$INSTANCE_CLASS" \
  --vpc-security-group-ids "$VPC_SG" \
  --db-subnet-group-name "$SUBNET_GROUP" \
  --no-multi-az \
  --tags Key=Purpose,Value=backup-drill Key=DrillDate,Value="$DRILL_DATE" Key=AutoDelete,Value=true \
  > /dev/null

log "Waiting for restored instance to become available (this may take 15-45 minutes)..."

aws rds wait db-instance-available \
  --db-instance-identifier "$RESTORE_INSTANCE"

RESTORE_STATUS=$(aws rds describe-db-instances \
  --db-instance-identifier "$RESTORE_INSTANCE" \
  --query 'DBInstances[0].DBInstanceStatus' \
  --output text)

if [[ "$RESTORE_STATUS" == "available" ]]; then
  pass "Restored instance is available: $RESTORE_INSTANCE"
else
  fail "Restored instance status: $RESTORE_STATUS (expected: available)"
fi

RESTORE_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier "$RESTORE_INSTANCE" \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

log "Restored instance endpoint: $RESTORE_ENDPOINT"

echo ""

# --- Step 3: Run Verification Queries ----------------------------------------

log "Step 3: Running verification queries"
log ""
log "MANUAL CHECK: You may need to provide the database password when prompted."
log "Connect to: $RESTORE_ENDPOINT"
log ""

VERIFY_SQL=$(cat <<'EOSQL'
-- Verification Query Set for Backup Drill

-- 1. Row counts for critical tables
SELECT '--- TABLE ROW COUNTS ---' AS section;
SELECT 'tenants' AS table_name, COUNT(*) AS row_count FROM tenants
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'tenant_memberships', COUNT(*) FROM tenant_memberships
ORDER BY table_name;

-- 2. RLS enabled on all tenant-scoped tables
SELECT '--- RLS STATUS ---' AS section;
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('_prisma_migrations', 'users')
ORDER BY tablename;

-- 3. RLS policies exist
SELECT '--- RLS POLICIES ---' AS section;
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 4. Trigger functions
SELECT '--- TRIGGERS ---' AS section;
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- 5. Extensions
SELECT '--- EXTENSIONS ---' AS section;
SELECT extname, extversion FROM pg_extension ORDER BY extname;

-- 6. Sequences
SELECT '--- TENANT SEQUENCES ---' AS section;
SELECT tenant_id, prefix, current_value
FROM tenant_sequences
ORDER BY tenant_id, prefix;

-- 7. Migration history (last 10)
SELECT '--- MIGRATION HISTORY (LAST 10) ---' AS section;
SELECT migration_name, finished_at
FROM _prisma_migrations
ORDER BY finished_at DESC
LIMIT 10;

-- 8. Tables without RLS (should be empty except users and _prisma_migrations)
SELECT '--- TABLES MISSING RLS (SHOULD BE EMPTY) ---' AS section;
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('_prisma_migrations', 'users')
  AND rowsecurity = false;
EOSQL
)

log "Running verification queries against restored instance..."

if PGPASSWORD="${DB_PASSWORD:-}" psql \
  -h "$RESTORE_ENDPOINT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -c "$VERIFY_SQL" \
  >> "$LOG_FILE" 2>&1; then
  pass "Verification queries completed"
else
  log "WARNING: Verification queries failed or were skipped."
  log "MANUAL CHECK: Connect to $RESTORE_ENDPOINT and run verification queries manually."
  log "See docs/runbooks/backup-restore.md section 2.4 for the full query set."
fi

echo ""

# --- Step 4: Summary ---------------------------------------------------------

log "============================================"
log "  Drill Results Summary"
log "============================================"
log ""
log "Snapshot ID:        $SNAPSHOT_ID"
log "Snapshot Size:      ${SNAPSHOT_SIZE} GB"
log "Restored Instance:  $RESTORE_INSTANCE"
log "Restored Endpoint:  $RESTORE_ENDPOINT"
log "Log File:           $LOG_FILE"
log ""
log "MANUAL CHECKS REQUIRED:"
log "  1. Review verification query output in $LOG_FILE"
log "  2. Confirm row counts match expected production counts"
log "  3. Confirm all tenant-scoped tables have RLS enabled"
log "  4. Confirm RLS policies are intact"
log "  5. Confirm trigger functions are present"
log "  6. Confirm extensions (citext, btree_gist, uuid-ossp) are installed"
log "  7. Complete the drill checklist: scripts/backup-drill-checklist.md"
log ""

# --- Step 5: Cleanup ---------------------------------------------------------

if [[ "$SKIP_CLEANUP" == true ]]; then
  log "Cleanup SKIPPED (--skip-cleanup flag set)"
  log "Remember to manually delete:"
  log "  - Instance: $RESTORE_INSTANCE"
  log "  - Snapshot: $SNAPSHOT_ID"
else
  log "Step 5: Cleaning up temporary resources"

  log "Deleting restored instance: $RESTORE_INSTANCE"
  aws rds delete-db-instance \
    --db-instance-identifier "$RESTORE_INSTANCE" \
    --skip-final-snapshot \
    > /dev/null 2>&1 || log "WARNING: Failed to delete restored instance"

  log "Deleting drill snapshot: $SNAPSHOT_ID"
  aws rds delete-db-snapshot \
    --db-snapshot-identifier "$SNAPSHOT_ID" \
    > /dev/null 2>&1 || log "WARNING: Failed to delete drill snapshot"

  pass "Cleanup completed"
fi

echo ""
log "============================================"
log "  Drill Complete"
log "  Fill out the checklist: scripts/backup-drill-checklist.md"
log "============================================"
