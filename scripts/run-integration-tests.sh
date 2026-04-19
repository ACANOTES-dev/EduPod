#!/usr/bin/env bash
# Runs @school/api integration/e2e tests in two passes.
#
# Pass 1 (serial): a small set of "collider" files that share DB fixtures,
#   CREATE ROLE, or race on tuple updates — run with --runInBand.
# Pass 2 (parallel): everything else — run with --maxWorkers (default 4,
#   override with INTEGRATION_MAX_WORKERS).
#
# Usage:
#   run-integration-tests.sh [serial|parallel|both]
#
# Default "both" preserves legacy behaviour (run both passes sequentially in
# one invocation). CI splits the job in two and calls with "serial" /
# "parallel" so they run in separate runners in parallel — see ci.yml jobs
# `backend-serial` and `backend-parallel`.

set -euo pipefail

MODE="${1:-both}"
case "$MODE" in
  serial|parallel|both) ;;
  *) echo "Usage: $0 [serial|parallel|both]" >&2; exit 2 ;;
esac

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT/apps/api"

# Every *.rls.spec.ts file is pinned serial — they CREATE ROLE / do direct SQL
# and race with each other on shared DB state. Plus a handful of e2e files that
# share tenant UUIDs or scheduling/dashboard state.
# Pattern is anchored with `/` to prevent substring matches (e.g.
# `applications\.e2e-spec` must not match `parent-applications.e2e-spec`).
COLLIDERS_PATTERN='/([^/]+\.rls\.spec|rls-leakage\.e2e-spec|rls-leakage-p2\.e2e-spec|rls-comprehensive\.e2e-spec|p6-finance\.e2e-spec|admissions-rls\.e2e-spec|applications\.e2e-spec|p4a-dashboard-exceptions\.e2e-spec|p4b-scheduling\.e2e-spec|auth\.e2e-spec)\.ts$'

MAX_WORKERS="${INTEGRATION_MAX_WORKERS:-4}"

SERIAL_EXIT=0
PARALLEL_EXIT=0

if [ "$MODE" = "serial" ] || [ "$MODE" = "both" ]; then
  echo ""
  echo "=== Serial colliders (--runInBand) ==="
  npx jest --config jest.integration.config.js --runInBand --bail=0 --forceExit \
    --testPathPattern="$COLLIDERS_PATTERN" \
    || SERIAL_EXIT=$?
fi

if [ "$MODE" = "parallel" ] || [ "$MODE" = "both" ]; then
  echo ""
  echo "=== Parallel (--maxWorkers=$MAX_WORKERS) ==="
  npx jest --config jest.integration.config.js --maxWorkers="$MAX_WORKERS" --bail=0 --forceExit \
    --testPathIgnorePatterns "/node_modules/" "$COLLIDERS_PATTERN" \
    || PARALLEL_EXIT=$?
fi

echo ""
echo "=== Summary (mode=$MODE) ==="
[ "$MODE" != "parallel" ] && echo "Serial:   exit=$SERIAL_EXIT"
[ "$MODE" != "serial" ] && echo "Parallel: exit=$PARALLEL_EXIT"

if [ "$SERIAL_EXIT" -ne 0 ] || [ "$PARALLEL_EXIT" -ne 0 ]; then
  exit 1
fi
