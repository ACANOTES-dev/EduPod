#!/usr/bin/env bash
# scripts/wave-merge-queue.sh
#
# Merge-queue helper for parallel-worktree wave execution.
#
# Sub-commands:
#
#   check-clear   <log_path> <impl>
#       Print "OK" + exit 0 if THIS impl is allowed to begin merging.
#       Print "BLOCKED: <reason>" + exit 1 otherwise.
#
#   active-merger <log_path>
#       Print the impl number currently in `merging` or `verifying` state,
#       or empty string if none. Exit 0 always.
#
#   wave-of      <log_path> <impl>
#       Print the wave number for an impl row. Exit 0 if found, 1 if not.
#
#   lower-incomplete <log_path> <impl> <wave>
#       Print space-separated impl numbers in the same wave that are NOT
#       `completed` AND have a lower number than this impl. Exit 0.
#
# This script reads the wave-status table in §4 of an IMPLEMENTATION_LOG.md
# file and parses one row per implementation. The expected row format is:
#
#   | <impl_n>  | <title>  | <wave>  | <deps>  | `<status>`  | <ts>  | `<sha>` |
#
# Status values recognised: pending | in-progress | ready-to-merge |
# merging | verifying | completed | 🛑 blocked  (extra whitespace ignored).
#
# The script intentionally has no external deps beyond awk + git. Designed
# to be invoked from the slash command on every queue check.
#
# Exit codes:
#   0  — sub-command succeeded; result on stdout
#   1  — BLOCKED (for check-clear) or "not found" (for wave-of)
#   2  — usage / parse error
#
# Test: ./scripts/wave-merge-queue.sh self-test

set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  wave-merge-queue.sh check-clear     <log> <impl>
  wave-merge-queue.sh active-merger   <log>
  wave-merge-queue.sh wave-of         <log> <impl>
  wave-merge-queue.sh lower-incomplete <log> <impl> <wave>
  wave-merge-queue.sh self-test
USAGE
  exit 2
}

# Parse the wave-status table. Emits CSV: impl,wave,status (no spaces).
# Intentionally tolerant of column-width variations.
parse_table() {
  local log="$1"
  awk '
    BEGIN { in_table = 0 }
    /^\| *# *\| *Title/ { in_table = 1; next }
    /^---/             { next }
    in_table == 0      { next }
    /^[^|]/            { in_table = 0; next }
    /^\| *[0-9]+ *\|/ {
      # Row format (1-indexed split-by-|):
      #   c[1]=""(pre-|) c[2]=impl c[3]=title c[4]=wave c[5]=deps
      #   c[6]=status   c[7]=completed-at  c[8]=sha
      n = $0
      gsub(/`/, "", n)
      split(n, c, "|")
      impl = c[2]; wave = c[4]; status = c[6]
      gsub(/^ +| +$/, "", impl)
      gsub(/^ +| +$/, "", wave)
      gsub(/^ +| +$/, "", status)
      gsub(/🛑 */, "", status)
      print impl "," wave "," status
    }
  ' "$log"
}

cmd_active_merger() {
  local log="$1"
  parse_table "$log" | awk -F, '
    $3 == "merging" || $3 == "verifying" { print $1; exit }
  '
}

cmd_wave_of() {
  local log="$1" impl="$2"
  local wave
  wave=$(parse_table "$log" | awk -F, -v i="$impl" '$1 == i { print $2; exit }')
  if [[ -z "$wave" ]]; then
    echo "not found" >&2
    return 1
  fi
  echo "$wave"
}

cmd_lower_incomplete() {
  local log="$1" impl="$2" wave="$3"
  parse_table "$log" | awk -F, -v me="$impl" -v w="$wave" '
    $2 == w && ($1 + 0) < (me + 0) && $3 != "completed" { printf "%s ", $1 }
    END { print "" }
  ' | sed 's/ $//'
}

cmd_check_clear() {
  local log="$1" impl="$2"
  local wave lower active

  wave=$(cmd_wave_of "$log" "$impl") || {
    echo "BLOCKED: impl $impl not found in wave-status table"
    return 1
  }

  lower=$(cmd_lower_incomplete "$log" "$impl" "$wave")
  if [[ -n "${lower// /}" ]]; then
    echo "BLOCKED: lower-numbered impls in wave $wave still incomplete: $lower"
    return 1
  fi

  active=$(cmd_active_merger "$log")
  if [[ -n "$active" && "$active" != "$impl" ]]; then
    echo "BLOCKED: impl $active currently holds the merge lock (merging or verifying)"
    return 1
  fi

  echo "OK"
}

# ─── Self-test ───────────────────────────────────────────────────────────────

self_test() {
  local tmp
  tmp=$(mktemp -d)
  # shellcheck disable=SC2064  # expand $tmp now (function-scoped)
  trap "rm -rf '$tmp'" EXIT

  local log="$tmp/log.md"
  cat >"$log" <<'EOF'
# Some heading
| #   | Title                  | Wave | Depends on | Status      | Completed at | Commit SHA |
| --- | ---------------------- | ---- | ---------- | ----------- | ------------ | ---------- |
| 14  | Hub                    | 4    | 01         | `completed` | t            | `abc`      |
| 15  | Pages                  | 4    | 01         | `completed` | t            | `def`      |
| 16  | Builder                | 4    | 01         | `merging`   |              |            |
| 17  | Scheduled              | 4    | 01         | `ready-to-merge` |        |            |
| 18  | AI Panel               | 4    | 01         | `in-progress` |          |            |
| 19  | Share                  | 4    | 16         | `pending`   |              |            |

Some text after.
EOF

  local fail=0
  pass() { echo "PASS  $1"; }
  fail() { echo "FAIL  $1"; fail=1; }

  # active-merger should be 16
  out=$(cmd_active_merger "$log")
  [[ "$out" == "16" ]] && pass "active-merger == 16" || fail "active-merger == 16 (got '$out')"

  # wave-of 17 should be 4
  out=$(cmd_wave_of "$log" 17)
  [[ "$out" == "4" ]] && pass "wave-of 17 == 4" || fail "wave-of 17 == 4 (got '$out')"

  # lower-incomplete: 17 vs wave 4 → 16 (because 16 is merging, not completed)
  out=$(cmd_lower_incomplete "$log" 17 4)
  [[ "$out" == "16" ]] && pass "lower-incomplete 17 4 == '16'" || fail "lower-incomplete 17 4 (got '$out')"

  # check-clear 17: blocked (16 is in queue ahead + holds lock)
  if cmd_check_clear "$log" 17 >/dev/null 2>&1; then
    fail "check-clear 17 should BLOCK"
  else
    pass "check-clear 17 BLOCKS (as expected)"
  fi

  # check-clear 16: should pass (no lower incomplete; itself is the active)
  if cmd_check_clear "$log" 16 >/dev/null 2>&1; then
    pass "check-clear 16 OK (as expected)"
  else
    fail "check-clear 16 should be OK"
  fi

  # Now flip 16 to completed and recheck 17
  sed -i.bak 's/`merging`/`completed`/' "$log"
  out=$(cmd_check_clear "$log" 17)
  [[ "$out" == "OK" ]] && pass "after 16 completed, check-clear 17 == OK" || fail "after 16 completed, check-clear 17 (got '$out')"

  # Verifying state also holds the lock — flip 17 to verifying and check 18
  sed -i.bak 's/`ready-to-merge`/`verifying`/' "$log"
  if cmd_check_clear "$log" 18 >/dev/null 2>&1; then
    fail "check-clear 18 should BLOCK while 17 is verifying"
  else
    pass "check-clear 18 BLOCKS while 17 is verifying (as expected)"
  fi

  # Active-merger reflects verifying too
  out=$(cmd_active_merger "$log")
  [[ "$out" == "17" ]] && pass "active-merger == 17 (verifying)" || fail "active-merger after verifying flip (got '$out')"

  # 🛑 blocked rows do NOT release the lock — they should NOT count as completed
  sed -i.bak 's/| 14  | Hub                    | 4    | 01         | `completed` /| 14  | Hub                    | 4    | 01         | `🛑 blocked` /' "$log"
  if cmd_check_clear "$log" 18 >/dev/null 2>&1; then
    fail "check-clear 18 should BLOCK on lower-numbered blocked impl"
  else
    pass "check-clear 18 BLOCKS on lower-numbered blocked impl (as expected)"
  fi

  if [[ $fail -eq 0 ]]; then
    echo "ALL TESTS PASSED"
    return 0
  else
    echo "SOME TESTS FAILED"
    return 1
  fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────

[[ $# -lt 1 ]] && usage

cmd="$1"; shift

case "$cmd" in
  check-clear)      [[ $# -eq 2 ]] || usage; cmd_check_clear "$@" ;;
  active-merger)    [[ $# -eq 1 ]] || usage; cmd_active_merger "$@" ;;
  wave-of)          [[ $# -eq 2 ]] || usage; cmd_wave_of "$@" ;;
  lower-incomplete) [[ $# -eq 3 ]] || usage; cmd_lower_incomplete "$@" ;;
  self-test)        self_test ;;
  *)                usage ;;
esac
