#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# check-migration-safety.sh
#
# CI gate to enforce the expand/contract migration policy.
# Scans Prisma migration SQL files for dangerous patterns that indicate
# non-backward-compatible (contract-phase) schema changes. These must be
# split into a separate deploy after the expand phase is stable.
#
# Usage:
#   bash scripts/check-migration-safety.sh                        # scan all migrations
#   bash scripts/check-migration-safety.sh packages/prisma/migrations  # explicit dir
#   DIFF_BASE=main bash scripts/check-migration-safety.sh         # only changed files
#
# Exit codes:
#   0 — all migrations follow expand/contract policy (or are allowlisted)
#   1 — contract-phase patterns detected
#
# See docs/operations/migration-policy.md for the full policy.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

MIGRATIONS_DIR="${1:-packages/prisma/migrations}"
ALLOWLIST_FILE=".migration-safety-allowlist"
DIFF_BASE="${DIFF_BASE:-}"
EXIT_CODE=0

# ─── Dangerous patterns (contract-phase operations) ─────────────────────────

DANGEROUS_PATTERNS=(
  'DROP COLUMN'
  'DROP TABLE'
  'ALTER TABLE.*RENAME'
  'ALTER COLUMN.*SET NOT NULL'
  'ALTER COLUMN.*TYPE'
  'DROP INDEX'
)

# ─── Load allowlist ─────────────────────────────────────────────────────────

ALLOWLIST_ENTRIES=""
if [[ -f "$ALLOWLIST_FILE" ]]; then
  while IFS= read -r line; do
    # Skip comments and blank lines
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    ALLOWLIST_ENTRIES="${ALLOWLIST_ENTRIES}${line}"$'\n'
  done < "$ALLOWLIST_FILE"
fi

is_allowlisted() {
  local file="$1"
  echo "$ALLOWLIST_ENTRIES" | grep -qxF "$file"
}

# ─── Collect migration files to check ──────────────────────────────────────

migration_files=()

if [[ -n "$DIFF_BASE" ]]; then
  # Only check migration files changed relative to DIFF_BASE
  while IFS= read -r file; do
    if [[ "$file" == */migration.sql ]]; then
      migration_files+=("$file")
    fi
  done < <(git diff --name-only "$DIFF_BASE" -- "$MIGRATIONS_DIR" 2>/dev/null || true)
else
  # Check all migration files
  while IFS= read -r -d '' file; do
    migration_files+=("$file")
  done < <(find "$MIGRATIONS_DIR" -name 'migration.sql' -print0 2>/dev/null)
fi

# ─── Check each file ──────────────────────────────────────────────────────

check_file() {
  local file="$1"
  local found_issues=false

  # Skip allowlisted files
  if is_allowlisted "$file"; then
    echo "  SKIP (allowlisted): ${file}"
    return
  fi

  for pattern in "${DANGEROUS_PATTERNS[@]}"; do
    if grep -inE "$pattern" "$file" > /dev/null 2>&1; then
      local matches
      matches=$(grep -inE "$pattern" "$file")
      echo "  WARN: ${file}"
      echo "    Pattern: ${pattern}"
      echo "    Match:   ${matches}"
      echo "    -> This is a contract-phase operation."
      echo "    -> It must deploy separately, AFTER the expand phase is stable."
      echo ""
      found_issues=true
    fi
  done

  if [[ "$found_issues" == true ]]; then
    EXIT_CODE=1
  fi
}

echo "Migration Safety Check — Expand/Contract Policy"
echo "================================================"
echo ""

if [[ ${#migration_files[@]} -eq 0 ]]; then
  echo "No migration files found to check."
  exit 0
fi

echo "Scanning ${#migration_files[@]} migration file(s)..."
echo ""

for file in "${migration_files[@]}"; do
  check_file "$file"
done

echo ""

if [[ "$EXIT_CODE" -eq 0 ]]; then
  echo "PASS: All migrations follow the expand/contract policy."
else
  echo "================================================================"
  echo "FAIL: Contract-phase patterns detected in migration files."
  echo ""
  echo "Options:"
  echo "  1. Split the migration into expand (additive) and contract"
  echo "     (destructive) phases in separate deploys."
  echo "  2. If this IS a deliberate contract migration being deployed"
  echo "     after the expand is stable, add the file path to"
  echo "     .migration-safety-allowlist (one path per line)."
  echo ""
  echo "See docs/operations/migration-policy.md for details."
  echo "================================================================"
fi

exit "$EXIT_CODE"
