#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# check-characterization-tests.sh
#
# Checks whether hotspot services modified in the current branch have
# corresponding test file changes. Produces warnings (does not fail the build).
#
# Usage:
#   bash scripts/check-characterization-tests.sh           # diff against main
#   bash scripts/check-characterization-tests.sh origin/dev # diff against custom base
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BASE_BRANCH="${1:-main}"

# ─── Hotspot services (>1000 LOC, high refactor risk) ─────────────────────────

HOTSPOT_SERVICES=(
  "workload-compute.service.ts"
  "concern.service.ts"
  "behaviour-students.service.ts"
  "households.service.ts"
  "behaviour-sanctions.service.ts"
  "case.service.ts"
  "behaviour.service.ts"
  "auth.service.ts"
  "homework-analytics.service.ts"
  "pastoral-report.service.ts"
  "safeguarding-concerns.service.ts"
  "critical-incident.service.ts"
  "pastoral-dsar.service.ts"
  "attendance-upload.service.ts"
  "homework.service.ts"
)

# ─── Get changed files ───────────────────────────────────────────────────────

CHANGED_FILES=$(git diff --name-only "${BASE_BRANCH}" 2>/dev/null || git diff --name-only HEAD~1 2>/dev/null || echo "")

if [ -z "$CHANGED_FILES" ]; then
  echo "No changed files detected."
  exit 0
fi

# ─── Check each hotspot ──────────────────────────────────────────────────────

WARNINGS=0
MISSING_TESTS=()

for SERVICE in "${HOTSPOT_SERVICES[@]}"; do
  # Check if any changed file matches this hotspot service
  MATCHED_FILE=$(echo "$CHANGED_FILES" | grep -F "$SERVICE" | head -1 || true)

  if [ -n "$MATCHED_FILE" ]; then
    # Derive the expected spec file name
    SPEC_FILE="${SERVICE%.ts}.spec.ts"

    # Check if the spec file was also modified
    SPEC_CHANGED=$(echo "$CHANGED_FILES" | grep -F "$SPEC_FILE" || true)

    if [ -z "$SPEC_CHANGED" ]; then
      WARNINGS=$((WARNINGS + 1))
      MISSING_TESTS+=("$SERVICE")
      echo "::warning::Hotspot service '$SERVICE' was modified without updating its test file '$SPEC_FILE'"
    else
      echo "OK: $SERVICE has corresponding test changes"
    fi
  fi
done

# ─── Summary ──────────────────────────────────────────────────────────────────

echo ""
echo "─── Characterization Test Check Summary ───"
echo ""

if [ "$WARNINGS" -eq 0 ]; then
  echo "All modified hotspot services have corresponding test changes (or no hotspots were modified)."
  exit 0
else
  echo "WARNING: $WARNINGS hotspot service(s) modified without test changes:"
  for MISSING in "${MISSING_TESTS[@]}"; do
    echo "  - $MISSING"
  done
  echo ""
  echo "Hotspot services require characterization tests before refactoring."
  echo "See: architecture/characterization-testing-guide.md"
  echo ""
  # Exit 0 (warning only, does not block build)
  # Change to exit 1 when the team is ready to enforce
  exit 0
fi
