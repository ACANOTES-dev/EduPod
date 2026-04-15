#!/usr/bin/env bash
# Scenario runner for Session-B. Each scenario:
#   1. setup() — apply constraint changes
#   2. trigger solve, poll until terminal
#   3. verify_solver_output() — check constraints in result_json
#   4. cleanup() — revert changes for next scenario
set -eo pipefail
SCRIPT_DIR=$(dirname "$0")
source "$SCRIPT_DIR/lib.sh"

# Refresh JWT (15-min expiry; refresh on every scenario)
refresh_jwt

# Trigger a solve and wait for terminal status. Return run_id on success.
do_solve() {
  local duration="${1:-120}"
  refresh_jwt  # ensure fresh
  local resp=$(curl -s -X POST "$BASE/api/v1/scheduling/runs/trigger" \
    -H "Authorization: Bearer $JWT" \
    -H 'Content-Type: application/json' \
    -d "{\"academic_year_id\":\"$AY\",\"max_solver_duration_seconds\":$duration}")
  local run_id=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['id']) if 'data' in d else None")
  if [[ -z "$run_id" || "$run_id" == "None" ]]; then
    echo "TRIGGER_FAILED: $resp" >&2
    return 1
  fi
  log_step "Run $run_id triggered"
  for i in $(seq 1 60); do
    refresh_jwt  # JWT might expire during long polls
    local s=$(curl -s "$BASE/api/v1/scheduling/runs/$run_id/status" -H "Authorization: Bearer $JWT")
    local status=$(echo "$s" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['status'])" 2>/dev/null || echo "")
    if [[ "$status" =~ ^(completed|failed|applied|discarded)$ ]]; then
      log_step "Run $run_id terminal: $status"
      echo "$run_id"
      return 0
    fi
    sleep 8
  done
  echo "POLL_TIMEOUT: $run_id" >&2
  echo "$run_id"
  return 1
}

# Get the result_json of a run as compact JSON
get_result() {
  local run_id="$1"
  q_raw "SELECT result_json::text FROM scheduling_runs WHERE id='$run_id'::uuid;" | head -1
}

# Run a Python verifier against a run's result_json. The verifier reads JSON on stdin
# and prints PASS/FAIL/EXPLAIN lines. The first line MUST start with PASS or FAIL.
verify_with_python() {
  local run_id="$1"
  local py_script="$2"
  local result=$(get_result "$run_id")
  echo "$result" | python3 -c "$py_script"
}

# ─── Scenario STRESS-022: No-same-subject-twice-same-day for English ────────
# Setup: set max_periods_per_day=1 for English in all year groups
# Verify: no class has >1 English on any weekday
scenario_022() {
  log_step "STRESS-022 setup: English max_per_day=1"
  q "UPDATE curriculum_requirements SET max_periods_per_day = 1
     WHERE tenant_id='$TENANT'::uuid AND academic_year_id='$AY'::uuid
       AND subject_id = (SELECT id FROM subjects WHERE tenant_id='$TENANT'::uuid AND name='English' LIMIT 1);"
  local run_id=$(do_solve 120)
  log_step "Verifying"
  verify_with_python "$run_id" '
import sys, json
data = json.load(sys.stdin)
entries = data.get("entries", [])
violations = {}
# group entries by (class_id, weekday) for English subject only
# We need the subject_id for English — passed via env or query. Simplify: count subject_ids per (class, weekday)
from collections import Counter, defaultdict
counts = defaultdict(Counter)
for e in entries:
    sid = e.get("subject_id")
    cid = e.get("class_id")
    wd = e.get("weekday")
    if sid and cid:
        counts[(cid, wd)][sid] += 1
viol = []
for (cid, wd), c in counts.items():
    for sid, n in c.items():
        if n > 1:
            viol.append((cid[:8], wd, sid[:8], n))
if not viol:
    print("PASS English/no-twice-same-day (and same for all other subjects given baseline max_periods_per_day=1)")
else:
    print(f"FAIL {len(viol)} class+day pairs have a subject scheduled >1 time")
    for v in viol[:10]:
        print(f"  class={v[0]} weekday={v[1]} subject={v[2]} count={v[3]}")
'
  log_step "STRESS-022 cleanup: restore English max_per_day=2 (baseline)"
  q "UPDATE curriculum_requirements SET max_periods_per_day = 2
     WHERE tenant_id='$TENANT'::uuid AND academic_year_id='$AY'::uuid
       AND subject_id = (SELECT id FROM subjects WHERE tenant_id='$TENANT'::uuid AND name='English' LIMIT 1);" >/dev/null
}

# Allow direct invocation: ./runner.sh scenario_022
if [[ "${1:-}" =~ ^scenario_ ]]; then
  "$1"
fi
