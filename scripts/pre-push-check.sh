#!/usr/bin/env bash
# Pre-push hook — runs full validate:ci so every push matches what CI will run.
#
# BYPASS OPTIONS (use deliberately):
#   HUSKY=0 git push            # disables all husky hooks
#   git push --no-verify        # skips pre-push for this push
#
# INTEGRATION TESTS require the paralleltest docker stack on ports 5563/5564:
#   docker compose -f docker-compose.parallel-test.yml up -d
#
# Expected duration: ~3-4 minutes (lint/type/audits + unit tests with coverage
# + integration tests with two-pass runner). Break that down with:
#   - validate:fast       ~30-60s
#   - unit tests          ~90s (api + worker coverage)
#   - other package tests ~20s
#   - test-gate check     <1s
#   - integration tests   ~50s
set -euo pipefail

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  pre-push: running full validate:ci (≈3-4 min)"
echo "  bypass:   HUSKY=0 git push   OR   git push --no-verify"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Architecture docs freshness — NOT covered by validate:ci, must stay here.
bash scripts/check-architecture-freshness.sh

# Warn if integration test stack isn't running — validate:ci will fail inside
# test:integration without it, so fail fast with a clear message instead.
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^school-db-paralleltest$'; then
  echo ""
  echo "✗ paralleltest database container not running."
  echo ""
  echo "  Start the integration-test stack:"
  echo "    docker compose -f docker-compose.parallel-test.yml up -d"
  echo ""
  echo "  Or bypass this hook once:"
  echo "    HUSKY=0 git push"
  echo ""
  exit 1
fi

pnpm validate:ci
