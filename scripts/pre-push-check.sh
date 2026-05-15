#!/usr/bin/env bash
# Pre-push hook — runs full validate:ci for runtime changes so every push
# matches what CI will run. Markdown-only pushes take the lightweight docs path.
#
# BYPASS OPTIONS (use deliberately):
#   HUSKY=0 git push            # disables all husky hooks
#   git push --no-verify        # skips pre-push for this push
#
# INTEGRATION TESTS require the paralleltest docker stack on ports 5563/5564:
#   docker compose -f docker-compose.parallel-test.yml up -d
#
# This hook auto-applies schema + RLS + post-migrate + seed to the
# paralleltest DB before running validate:ci — the container uses tmpfs
# so its data is wiped on every restart and the hook has to re-seed.
#
# Expected duration: ~3-4 minutes (lint/type/audits + unit tests with coverage
# + integration tests with two-pass runner). Break that down with:
#   - DB setup (schema+rls+post-migrate+seed)  ~10-40s (cached if warm)
#   - validate:fast       ~30-60s
#   - unit tests          ~90s (api + worker coverage)
#   - other package tests ~20s
#   - test-gate check     <1s
#   - integration tests   ~50s
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
elif git rev-parse --verify origin/main >/dev/null 2>&1; then
  base_ref="$(git merge-base HEAD origin/main)"
elif git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
  base_ref="HEAD~1"
else
  base_ref="$empty_tree"
fi

changed_files=()
while IFS= read -r path; do
  [ -n "$path" ] && changed_files+=("$path")
done < <(git diff --name-only "$base_ref" HEAD)

docs_only=false
if [ "${#changed_files[@]}" -gt 0 ]; then
  docs_only=true
fi

for path in "${changed_files[@]}"; do
  case "$path" in
    *.md|*.mdx) ;;
    *)
      docs_only=false
      break
      ;;
  esac
done

if [ "$docs_only" = "true" ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  pre-push: markdown-only change detected"
  echo "  running:  markdown formatting + whitespace checks"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  git diff --check "$base_ref" HEAD

  existing_docs=()
  for path in "${changed_files[@]}"; do
    [ -f "$path" ] && existing_docs+=("$path")
  done

  if [ "${#existing_docs[@]}" -gt 0 ]; then
    pnpm exec prettier --check "${existing_docs[@]}"
  fi

  echo ""
  echo "  ✓ markdown-only pre-push checks passed"
  exit 0
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  pre-push: running full validate:ci (≈2 min)"
echo "  bypass:   HUSKY=0 git push   OR   git push --no-verify"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# api type-check on the full monorepo needs ~6-8 GB of V8 heap;
# without this, turbo type-check OOMs with exit 137 during pre-push.
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}"

# cp-sat-regression is a long-running OR-Tools solver harness. CI runs it
# in its own dedicated step (see solver-py job in ci.yml) with a proper
# Python venv; locally on a dev machine with uvicorn installed it can
# easily take 15 minutes and fail on timeouts — which has nothing to do
# with the code being pushed. Default to skipping it in pre-push by
# pointing at a non-existent uvicorn binary; the test's own skip logic
# (SIDECAR_AVAILABLE = existsSync(UVICORN_BIN)) handles the rest.
export CP_SAT_SIDECAR_UVICORN="${CP_SAT_SIDECAR_UVICORN:-/skip-cp-sat-in-pre-push}"

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

# Ensure the paralleltest DB schema + RLS + post-migrate + seed are up to
# date. Drop-and-recreate each time to guarantee a clean starting point —
# `prisma db push` can't reconcile generated columns added by post-migrate
# against a schema that declares them as plain columns, and a failing push
# is far harder to debug than a 15-second full rebuild on tmpfs.
PARALLELTEST_DATABASE_URL="postgresql://postgres:localpassword@localhost:5563/paralleltest"

echo ""
echo "  ▶ resetting paralleltest DB…"
docker exec school-db-paralleltest psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS paralleltest WITH (FORCE);" >/dev/null
docker exec school-db-paralleltest psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE paralleltest;" >/dev/null
docker exec school-db-paralleltest psql -U postgres -d paralleltest -v ON_ERROR_STOP=1 \
  -f /docker-entrypoint-initdb.d/init.sql >/dev/null

echo "  ▶ pushing schema to paralleltest…"
DATABASE_URL="$PARALLELTEST_DATABASE_URL" \
  pnpm --filter @school/prisma exec prisma db push --skip-generate --accept-data-loss >/dev/null

echo "  ▶ applying RLS policies…"
docker exec -i school-db-paralleltest psql -U postgres -d paralleltest -v ON_ERROR_STOP=1 \
  < packages/prisma/rls/policies.sql >/dev/null 2>&1

echo "  ▶ running post-migrate sql…"
DATABASE_URL="$PARALLELTEST_DATABASE_URL" pnpm db:post-migrate >/dev/null

echo "  ▶ seeding base data…"
DATABASE_URL="$PARALLELTEST_DATABASE_URL" pnpm db:seed >/dev/null
echo "  ✓ paralleltest DB ready"
echo ""

pnpm validate:ci
