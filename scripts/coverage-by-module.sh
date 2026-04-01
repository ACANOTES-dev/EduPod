#!/usr/bin/env bash
# coverage-by-module.sh
#
# Runs Jest coverage for @school/api and produces a per-module coverage table.
# Saves report to apps/api/coverage/module-coverage-report.txt.
#
# Usage: bash scripts/coverage-by-module.sh
# CI:    add as a step after tests; upload coverage/ as an artifact.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
API_DIR="${REPO_ROOT}/apps/api"

echo "[coverage-by-module] Running Jest with JSON coverage reporter..."
cd "${API_DIR}"
npx jest --coverage --coverageReporters=json --silent

echo "[coverage-by-module] Aggregating by module..."
cd "${REPO_ROOT}"
npx tsx "${SCRIPT_DIR}/coverage-by-module.ts"
