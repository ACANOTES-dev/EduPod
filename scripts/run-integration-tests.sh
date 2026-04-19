#!/usr/bin/env bash
# Runs @school/api integration/e2e tests in two passes.
#
# Pass 1 runs a small set of "collider" files in-band (they share DB fixtures,
# CREATE ROLE, or race on tuple updates). Pass 2 runs everything else in
# parallel via --maxWorkers (default 4, override with INTEGRATION_MAX_WORKERS).
#
# Both passes use --bail=0 so we see every failure instead of stopping at the
# first one — the overall script exits non-zero if either pass failed.
#
# The Option A plan to eliminate Pass 1 entirely lives in SURGICAL-FIX.md.

set -euo pipefail

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

echo ""
echo "=== Pass 1/2: serial colliders (--runInBand) ==="
npx jest --config jest.integration.config.js --runInBand --bail=0 \
  --testPathPattern="$COLLIDERS_PATTERN" \
  || SERIAL_EXIT=$?

echo ""
echo "=== Pass 2/2: parallel (--maxWorkers=$MAX_WORKERS) ==="
npx jest --config jest.integration.config.js --maxWorkers="$MAX_WORKERS" --bail=0 \
  --testPathIgnorePatterns "/node_modules/" "$COLLIDERS_PATTERN" \
  || PARALLEL_EXIT=$?

echo ""
echo "=== Summary ==="
echo "Pass 1 (serial):   exit=$SERIAL_EXIT"
echo "Pass 2 (parallel): exit=$PARALLEL_EXIT"

if [ "$SERIAL_EXIT" -ne 0 ] || [ "$PARALLEL_EXIT" -ne 0 ]; then
  exit 1
fi
