#!/usr/bin/env bash
# scripts/reap-worktrees.sh
#
# Reap worktrees under .worktrees/impl-<n>/ whose impl row is
# `completed` in the active rebuild's wave-status table. Safe to run
# any time — leaves in-flight worktrees alone.
#
# This is the safety net for Rule 28 (worktree isolation) — sessions
# are supposed to clean up after themselves at /NI Step 14, but if a
# session crashes, gets killed, or otherwise fails to reach Step 14,
# its worktree lingers. This script reaps those orphans.
#
# Usage:
#   ./scripts/reap-worktrees.sh                # reap completed worktrees
#   ./scripts/reap-worktrees.sh --dry-run      # show what would be reaped
#   ./scripts/reap-worktrees.sh --list         # list all worktrees + status
#   ./scripts/reap-worktrees.sh --force <n>    # forcibly reap impl-<n> regardless of status
#
# The "completed" check reads origin/main's log, NOT the local checkout's
# log (which could be stale across worktrees). This guarantees the
# reaper always uses the canonical state of the queue.
#
# Currently looks at `reports-rebuild/IMPLEMENTATION_LOG.md`. To support
# additional rebuilds, add their log paths to LOG_FILES below.

set -euo pipefail

DRY_RUN=0
LIST_ONLY=0
FORCE_IMPL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --list)    LIST_ONLY=1; shift ;;
    --force)   shift; FORCE_IMPL="${1:-}"; shift ;;
    -h|--help)
      sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Usage: $0 [--dry-run|--list|--force <n>]" >&2
      exit 2
      ;;
  esac
done

WAVE_ROOT="$(git rev-parse --show-toplevel)"
WORKTREES_DIR="$WAVE_ROOT/.worktrees"
QUEUE_SCRIPT="$WAVE_ROOT/scripts/wave-merge-queue.sh"

if [[ ! -d "$WORKTREES_DIR" ]]; then
  echo "No .worktrees/ directory — nothing to reap."
  exit 0
fi

# ─── Force-remove a single worktree (escape hatch) ────────────────────────────

if [[ -n "$FORCE_IMPL" ]]; then
  target="$WORKTREES_DIR/impl-$FORCE_IMPL"
  if [[ ! -d "$target" ]]; then
    echo "No worktree at $target — nothing to do." >&2
    exit 1
  fi
  echo "Force-reaping $target"
  branch=$(git -C "$target" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  git worktree remove --force "$target" 2>/dev/null || rm -rf "$target"
  if [[ -n "$branch" && "$branch" != "main" && "$branch" != "HEAD" ]]; then
    git branch -D "$branch" 2>/dev/null || true
    git push origin --delete "$branch" 2>/dev/null || true
  fi
  echo "Done."
  exit 0
fi

# ─── Locate the rebuild log on origin/main ────────────────────────────────────
#
# Add new rebuild log paths here as they come online.
LOG_FILES=(
  "reports-rebuild/IMPLEMENTATION_LOG.md"
)

git fetch origin main --quiet

LOG_TMP=$(mktemp)
# shellcheck disable=SC2064
trap "rm -f '$LOG_TMP'" EXIT

# Concatenate all rebuild logs into one combined view. Each row is identified
# by its `| <impl> | <title> | <wave> | ... | <status> |` structure, so impls
# from different rebuilds with the same number won't actually collide unless
# both rebuilds happen to be active simultaneously (extremely rare; if it
# happens, the reaper will keep the in-flight one and reap the completed one).
> "$LOG_TMP"
for log_path in "${LOG_FILES[@]}"; do
  if git show "origin/main:$log_path" > /tmp/rwt-fetch.md 2>/dev/null; then
    cat /tmp/rwt-fetch.md >> "$LOG_TMP"
    echo "" >> "$LOG_TMP"
  fi
done
rm -f /tmp/rwt-fetch.md

# ─── Walk worktrees and reap ──────────────────────────────────────────────────

reaped=0
kept=0
listed=0

for worktree_path in "$WORKTREES_DIR"/*; do
  [[ ! -d "$worktree_path" ]] && continue

  base=$(basename "$worktree_path")
  if [[ ! "$base" =~ ^impl-([0-9]+)$ ]]; then
    echo "  SKIP: $worktree_path (not an impl-N directory)"
    continue
  fi
  impl_n="${BASH_REMATCH[1]}"

  # Get status from origin/main's log. Falls through to "" if the impl
  # number isn't in any active rebuild's table — treat that as "unknown,
  # do not reap" to be safe.
  status=$("$QUEUE_SCRIPT" status-of "$LOG_TMP" "$impl_n" 2>/dev/null || echo "unknown")

  if [[ "$LIST_ONLY" -eq 1 ]]; then
    printf "  impl-%-3s  status=%-15s  path=%s\n" "$impl_n" "$status" "$worktree_path"
    listed=$((listed + 1))
    continue
  fi

  if [[ "$status" == "completed" ]]; then
    if [[ $DRY_RUN -eq 1 ]]; then
      echo "  WOULD REAP: $worktree_path (impl $impl_n is completed)"
    else
      branch=$(git -C "$worktree_path" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
      echo "  REAP: $worktree_path (impl $impl_n is completed; branch '$branch')"
      git worktree remove --force "$worktree_path" 2>/dev/null || rm -rf "$worktree_path"
      if [[ -n "$branch" && "$branch" != "main" && "$branch" != "HEAD" ]]; then
        git branch -D "$branch" 2>/dev/null || true
        git push origin --delete "$branch" 2>/dev/null || true
      fi
    fi
    reaped=$((reaped + 1))
  else
    echo "  KEEP: $worktree_path (impl $impl_n status='$status' — in-flight)"
    kept=$((kept + 1))
  fi
done

# Always run `git worktree prune` at the end to clean up any worktree
# registry entries pointing at directories that are already gone.
git worktree prune

echo ""
if [[ "$LIST_ONLY" -eq 1 ]]; then
  echo "$listed worktree(s) listed."
elif [[ $DRY_RUN -eq 1 ]]; then
  echo "Would reap $reaped worktree(s); would keep $kept in-flight."
else
  echo "Reaped $reaped worktree(s); kept $kept in-flight."
fi
