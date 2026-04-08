#!/usr/bin/env bash
set -euo pipefail

echo "Checking architecture documentation freshness..."
bash scripts/check-architecture-freshness.sh

echo "Running CI-parity fast validation..."
pnpm validate:fast

echo "Running affected test suite..."
pnpm test:affected
