#!/usr/bin/env bash
#
# session-lock — file-based mutex for coordinating parallel Claude Code
# sessions across multiple git worktrees of the same repository.
#
# Problem this solves:
#   Running `turbo test` (or any command that hits shared state like the
#   local Postgres instance) in multiple worktrees simultaneously causes
#   non-deterministic test failures. Each session thinks it owns the DB
#   while another session is mid-fixture. This lock serialises those
#   commands without serialising the overall work — sessions can code
#   in parallel and only block each other when actually running tests.
#
# Where the locks live:
#   All lock files are written to $(git rev-parse --git-common-dir)/session-locks/
#   which is the primary repository's .git/session-locks/ directory.
#   This directory is shared across ALL worktrees of the same repo, which
#   means a session in worktree A can see locks held by a session in
#   worktree B. No need to hardcode paths or sync folders.
#
# Protocol:
#   acquire — poll until no other session has an unclosed .start file for
#     the same command. When clear, write our own .start file.
#   release — write a .complete file with timestamp, then remove our .start.
#
#   A command is considered "in flight" if there is a .start file for it
#   without a matching .complete file from the SAME session.
#
# Usage:
#   .session-locks/lock.sh acquire <session-id> <command>
#   .session-locks/lock.sh release <session-id> <command>
#   .session-locks/lock.sh status
#   .session-locks/lock.sh cleanup <session-id>
#
# Session IDs should be stable and unique across worktrees.
# Convention for this repo: impl-04, impl-05, impl-06, etc.
#
# Examples:
#   .session-locks/lock.sh acquire impl-04 turbo-test
#   turbo test
#   .session-locks/lock.sh release impl-04 turbo-test
#
#   .session-locks/lock.sh status
#
# Edge cases:
#   - If a session crashes mid-command, its .start file will be left behind
#     blocking other sessions. Use `cleanup <session-id>` to wipe a dead
#     session's locks.
#   - The poll loop runs every 5 seconds. Adjust POLL_INTERVAL below if needed.

set -euo pipefail

ACTION="${1:-}"
SESSION="${2:-}"
COMMAND="${3:-}"

# Resolve shared lock directory — lives in the primary .git/ which is
# shared by all worktrees of the same repo.
COMMON_GIT="$(git rev-parse --git-common-dir 2>/dev/null || true)"
if [[ -z "$COMMON_GIT" ]]; then
  echo "error: not inside a git repository" >&2
  exit 1
fi

# Normalise to an absolute path (git may return a relative one)
if [[ "$COMMON_GIT" != /* ]]; then
  COMMON_GIT="$(cd "$COMMON_GIT" 2>/dev/null && pwd)" || {
    echo "error: cannot resolve common git directory: $COMMON_GIT" >&2
    exit 1
  }
fi

LOCK_DIR="$COMMON_GIT/session-locks"
mkdir -p "$LOCK_DIR"

POLL_INTERVAL=5

usage() {
  cat <<EOF
Usage:
  $(basename "$0") acquire <session-id> <command>    Wait until clear, then claim lock
  $(basename "$0") release <session-id> <command>    Release lock, mark as complete
  $(basename "$0") status                            List all locks
  $(basename "$0") cleanup <session-id>              Remove all locks owned by a session

Examples:
  $(basename "$0") acquire impl-04 turbo-test
  $(basename "$0") release impl-04 turbo-test
  $(basename "$0") status
  $(basename "$0") cleanup impl-04

Locks live at: $LOCK_DIR
EOF
}

# Return the session-id of the first other session holding this command,
# or empty string if clear.
check_blockers() {
  local command="$1"
  local self="$2"
  shopt -s nullglob
  for start_file in "$LOCK_DIR"/*".$command.start"; do
    local base
    base="$(basename "$start_file" ".$command.start")"
    if [[ "$base" == "$self" ]]; then
      continue
    fi
    local complete_file="$LOCK_DIR/$base.$command.complete"
    if [[ ! -e "$complete_file" ]]; then
      echo "$base"
      return 0
    fi
  done
  shopt -u nullglob
  echo ""
}

ts() { date '+%H:%M:%S'; }

case "$ACTION" in
  acquire)
    if [[ -z "$SESSION" || -z "$COMMAND" ]]; then
      usage >&2
      exit 1
    fi

    # Clean any stale locks we may have left from a prior cycle
    rm -f "$LOCK_DIR/$SESSION.$COMMAND.start" \
          "$LOCK_DIR/$SESSION.$COMMAND.complete"

    # Poll until clear
    waited=0
    while true; do
      blocker="$(check_blockers "$COMMAND" "$SESSION")"
      if [[ -z "$blocker" ]]; then
        break
      fi
      if [[ $waited -eq 0 ]]; then
        printf '[%s] [lock] waiting for %s to finish %s...\n' \
          "$(ts)" "$blocker" "$COMMAND" >&2
      elif (( waited % 6 == 0 )); then
        # Re-announce every 30 seconds so the user knows we are still alive
        printf '[%s] [lock] still waiting for %s (%ds elapsed)\n' \
          "$(ts)" "$blocker" "$((waited * POLL_INTERVAL))" >&2
      fi
      sleep "$POLL_INTERVAL"
      waited=$((waited + 1))
    done

    # Claim the lock
    {
      echo "session: $SESSION"
      echo "command: $COMMAND"
      echo "started: $(date '+%Y-%m-%d %H:%M:%S')"
      echo "host: $(hostname)"
      echo "pid: $$"
      echo "cwd: $(pwd)"
    } > "$LOCK_DIR/$SESSION.$COMMAND.start"

    printf '[%s] [lock] acquired — %s.%s\n' \
      "$(ts)" "$SESSION" "$COMMAND" >&2
    ;;

  release)
    if [[ -z "$SESSION" || -z "$COMMAND" ]]; then
      usage >&2
      exit 1
    fi

    {
      echo "session: $SESSION"
      echo "command: $COMMAND"
      echo "completed: $(date '+%Y-%m-%d %H:%M:%S')"
      echo "host: $(hostname)"
    } > "$LOCK_DIR/$SESSION.$COMMAND.complete"

    rm -f "$LOCK_DIR/$SESSION.$COMMAND.start"

    printf '[%s] [lock] released — %s.%s\n' \
      "$(ts)" "$SESSION" "$COMMAND" >&2
    ;;

  status)
    shopt -s nullglob
    active=()
    done_=()
    for f in "$LOCK_DIR"/*.start; do
      base="$(basename "$f" .start)"
      if [[ -e "$LOCK_DIR/$base.complete" ]]; then
        # .start + .complete both exist — treat as stale, shouldn't happen
        done_+=("$base")
      else
        active+=("$base")
      fi
    done
    for f in "$LOCK_DIR"/*.complete; do
      base="$(basename "$f" .complete)"
      if [[ ! -e "$LOCK_DIR/$base.start" ]]; then
        done_+=("$base")
      fi
    done
    shopt -u nullglob

    echo "Lock directory: $LOCK_DIR"
    echo
    if [[ ${#active[@]} -eq 0 ]]; then
      echo "🟢 No active locks"
    else
      echo "🔒 Active:"
      for a in "${active[@]}"; do
        started="$(grep '^started:' "$LOCK_DIR/$a.start" 2>/dev/null | sed 's/^started: //' || echo unknown)"
        echo "   • $a  (started $started)"
      done
    fi
    if [[ ${#done_[@]} -gt 0 ]]; then
      echo
      echo "✅ Completed:"
      for c in "${done_[@]}"; do
        completed="$(grep '^completed:' "$LOCK_DIR/$c.complete" 2>/dev/null | sed 's/^completed: //' || echo unknown)"
        echo "   • $c  (completed $completed)"
      done
    fi
    ;;

  cleanup)
    if [[ -z "$SESSION" ]]; then
      usage >&2
      exit 1
    fi
    count=0
    shopt -s nullglob
    for f in "$LOCK_DIR/$SESSION".*; do
      rm -f "$f"
      count=$((count + 1))
    done
    shopt -u nullglob
    printf 'Removed %d lock file(s) for session %s\n' "$count" "$SESSION" >&2
    ;;

  "" | -h | --help | help)
    usage
    ;;

  *)
    echo "error: unknown action '$ACTION'" >&2
    echo >&2
    usage >&2
    exit 1
    ;;
esac
