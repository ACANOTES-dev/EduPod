#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

empty_tree="$(git hash-object -t tree /dev/null)"
current_branch="$(git symbolic-ref -q HEAD || true)"
upstream_ref=""

if [ -n "$current_branch" ]; then
  upstream_ref="$(git for-each-ref --format='%(upstream:short)' "$current_branch" | head -n 1)"
fi

if [ -n "$upstream_ref" ] && git rev-parse --verify "$upstream_ref" >/dev/null 2>&1; then
  base_ref="$(git merge-base HEAD "$upstream_ref")"
elif git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
  base_ref="HEAD~1"
else
  base_ref="$empty_tree"
fi

changed_files="$(git diff --name-only "$base_ref" HEAD)"

if [ -z "$changed_files" ]; then
  exit 0
fi

if ! grep -Eq '^(apps/|packages/|scripts/|\.github/|docker-compose\.yml$|package\.json$|pnpm-lock\.yaml$|README\.md$|Makefile$)' <<<"$changed_files"; then
  exit 0
fi

if grep -Eq '^architecture/' <<<"$changed_files"; then
  exit 0
fi

echo ""
echo "Architecture reminder:"
echo "  Code changed in this push but no files under architecture/ changed."
echo "  Review architecture/pre-flight-checklist.md and update the relevant docs if this change affects blast radius, job flows, state machines, or danger zones."
echo ""
