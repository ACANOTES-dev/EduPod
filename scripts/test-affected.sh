#!/usr/bin/env bash
set -euo pipefail

BASE_REF="${BASE_REF:-HEAD~1}"

if [[ "${NODE_OPTIONS:-}" != *"--max-old-space-size="* ]]; then
  export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--max-old-space-size=8192"
fi

if git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  echo "Running tests affected since ${BASE_REF}..."
  pnpm turbo run test --filter="...[$BASE_REF]"
  exit 0
fi

echo "No ${BASE_REF} reference found. Running the full test suite instead..."
pnpm turbo run test
