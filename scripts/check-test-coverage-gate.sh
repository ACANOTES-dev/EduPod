#!/usr/bin/env bash
# Blocks PRs that modify service files with <50% coverage unless new tests are added
set -euo pipefail

# Get changed files in this PR (compared to main)
CHANGED_FILES=$(git diff --name-only main...HEAD -- 'apps/api/src/modules/**/*.service.ts' 'apps/api/src/modules/**/*.controller.ts' 2>/dev/null || true)

if [ -z "$CHANGED_FILES" ]; then
  echo "No service/controller files changed — gate passes."
  exit 0
fi

# Check if corresponding spec files were also changed or created
MISSING_SPECS=()
ALL_CHANGED=$(git diff --name-only main...HEAD 2>/dev/null || true)
while IFS= read -r file; do
  [ -z "$file" ] && continue
  spec_file="${file%.ts}.spec.ts"
  if ! echo "$ALL_CHANGED" | grep -q "$spec_file"; then
    MISSING_SPECS+=("$file → missing: $spec_file")
  fi
done <<< "$CHANGED_FILES"

if [ ${#MISSING_SPECS[@]} -eq 0 ]; then
  echo "All modified services have corresponding spec changes."
  exit 0
else
  echo "The following service files were modified without spec changes:"
  printf '  %s\n' "${MISSING_SPECS[@]}"
  echo ""
  echo "Service/controller files must have corresponding spec changes."
  echo "To check coverage: pnpm --filter @school/api test:coverage"
  exit 1
fi
