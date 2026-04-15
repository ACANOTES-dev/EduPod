#!/usr/bin/env bash
# Shared helpers for Session-B stress scenarios on stress-b.edupod.app.
# Every scenario sources this file.
set -euo pipefail

BASE=https://stress-b.edupod.app
AY=1bf11450-4198-410e-bffa-b146ba109f1d
TENANT=a3cba8a3-1927-4d91-bcda-8b84bafbaace
PRINCIPAL_EMAIL=principal@stress-b.test
ADMIN_EMAIL=admin@stress-b.test
PASSWORD='StressTest2026!'
TRACKER=/Users/ram/Desktop/SDB/E2E/5_operations/Scheduling/STRESS-TEST-PLAN.md
BUG_LOG=/Users/ram/Desktop/SDB/E2E/5_operations/Scheduling/BUG-LOG.md

# ─── Auth ────────────────────────────────────────────────────────────────────
login() {
  local email="${1:-$PRINCIPAL_EMAIL}"
  curl -s -X POST "$BASE/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['access_token'])"
}

# Refresh JWT if close to expiry. Access tokens are short-lived (15 min).
refresh_jwt() {
  JWT=$(login "$PRINCIPAL_EMAIL")
  ADMIN_JWT=$(login "$ADMIN_EMAIL")
}

# ─── DB access via SSH psql ──────────────────────────────────────────────────
# Uses ssh stdin to avoid quoting hell. Each call:
#   - sources prod env
#   - opens a psql session via DATABASE_MIGRATE_URL (has BYPASSRLS for setup,
#     but we still SET LOCAL app.current_tenant_id so RLS filtering works
#     for non-bypass app role tests if needed)
q() {
  local sql="$1"
  ssh root@46.62.244.139 'sudo -u edupod bash -s' <<EOF
set -a
source /opt/edupod/app/.env
set +a
psql "\$DATABASE_MIGRATE_URL" -t -A -F'|' <<SQL
SET LOCAL app.current_tenant_id = '$TENANT';
$sql
SQL
EOF
}

# Same as q() but no tenant context
q_raw() {
  local sql="$1"
  ssh root@46.62.244.139 'sudo -u edupod bash -s' <<EOF
set -a
source /opt/edupod/app/.env
set +a
psql "\$DATABASE_MIGRATE_URL" -t -A -F'|' <<SQL
$sql
SQL
EOF
}

# ─── Solve lifecycle ─────────────────────────────────────────────────────────
trigger_solve() {
  local duration="${1:-120}"
  curl -s -X POST "$BASE/api/v1/scheduling/runs/trigger" \
    -H "Authorization: Bearer $JWT" \
    -H 'Content-Type: application/json' \
    -d "{\"academic_year_id\":\"$AY\",\"max_solver_duration_seconds\":$duration}" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['id'] if 'data' in d else 'ERR:'+json.dumps(d))"
}

# Poll every 3s up to N polls. Echo final status JSON.
poll_run() {
  local run_id="$1"
  local max_polls="${2:-60}"  # 3 min default
  for i in $(seq 1 "$max_polls"); do
    local r=$(curl -s "$BASE/api/v1/scheduling/runs/$run_id/status" -H "Authorization: Bearer $JWT")
    local status=$(echo "$r" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['status'])" 2>/dev/null || echo "unknown")
    if [[ "$status" =~ ^(succeeded|failed|infeasible|cancelled|timeout|applied)$ ]]; then
      echo "$r"
      return 0
    fi
    sleep 3
  done
  # Timed out
  curl -s "$BASE/api/v1/scheduling/runs/$run_id/status" -H "Authorization: Bearer $JWT"
  return 1
}

discard_run() {
  local run_id="$1"
  curl -s -X POST "$BASE/api/v1/scheduling/runs/$run_id/discard" -H "Authorization: Bearer $JWT" >/dev/null
}

# ─── Baseline reset ──────────────────────────────────────────────────────────
# Requires SERVER-LOCK. Caller must acquire first.
reset_baseline() {
  ssh root@46.62.244.139 'sudo -u edupod bash -c "set -a; source /opt/edupod/app/.env; set +a; cd /opt/edupod/app && npx tsx packages/prisma/scripts/stress-seed.ts --mode nuke --tenant-slug stress-b && npx tsx packages/prisma/scripts/stress-seed.ts --mode baseline --tenant-slug stress-b"' 2>&1 | tail -10
}

# ─── Tracker updates ─────────────────────────────────────────────────────────
mark_scenario() {
  local id="$1"       # e.g. STRESS-010
  local title="$2"    # e.g. 'Specialist room bottleneck'
  local outcome="$3"  # PASS|FAIL|NA
  local emoji
  case "$outcome" in
    PASS) emoji='✅ PASS' ;;
    FAIL) emoji='❌ FAIL' ;;
    NA)   emoji='⚪ N/A  ' ;;
    *)    emoji='⏳ Not Run' ;;
  esac
  python3 - "$TRACKER" "$id" "$emoji" <<'PYEOF'
import sys, re
f, sid, emoji = sys.argv[1], sys.argv[2], sys.argv[3]
with open(f) as fh: txt = fh.read()
# Match row with '| STRESS-NNN | Title padded | 🟡 session-B | ...'
pat = re.compile(r'(\| ' + re.escape(sid) + r' \| [^|]+\| )(🟡 session-B|⏳ Not Run|🟡 session-[A-Z])( *\| [^|]+\| )')
def repl(m):
    pad = m.group(3)
    return m.group(1) + emoji + pad
new = pat.sub(repl, txt, count=1)
if new == txt:
    sys.exit('could not find row for ' + sid)
with open(f, 'w') as fh: fh.write(new)
print('ok')
PYEOF
}

# ─── Config seeding helpers ──────────────────────────────────────────────────
# All modify RLS-scoped tables — use q()
set_teacher_max_per_day() {
  local staff_email="$1"  # email or 'all' for every teacher
  local cap="$2"
  local pattern
  if [[ "$staff_email" == "all" ]]; then
    pattern="LIKE '%@stress-b.%'"
  else
    pattern="= '$staff_email'"
  fi
  q "INSERT INTO teacher_scheduling_config (tenant_id, staff_profile_id, academic_year_id, max_periods_per_day, max_periods_per_week)
     SELECT '$TENANT'::uuid, sp.id, '$AY'::uuid, $cap, NULL
     FROM staff_profiles sp JOIN users u ON u.id = sp.user_id
     WHERE sp.tenant_id = '$TENANT'::uuid AND u.email $pattern
     ON CONFLICT (tenant_id, staff_profile_id, academic_year_id) DO UPDATE SET max_periods_per_day = EXCLUDED.max_periods_per_day;"
}

clear_teacher_configs() {
  q "DELETE FROM teacher_scheduling_config WHERE tenant_id = '$TENANT'::uuid AND academic_year_id = '$AY'::uuid;"
}

# Remove a weekday from a teacher's StaffAvailability (part-time by day)
remove_availability_weekday() {
  local staff_email="$1"
  local weekday="$2"  # 1..5
  q "DELETE FROM staff_availability
     WHERE tenant_id = '$TENANT'::uuid
       AND academic_year_id = '$AY'::uuid
       AND weekday = $weekday
       AND staff_profile_id IN (
         SELECT sp.id FROM staff_profiles sp JOIN users u ON u.id = sp.user_id
         WHERE u.email = '$staff_email'
       );"
}

# Set availability window for a teacher on all weekdays
set_availability_window() {
  local staff_email="$1"
  local from="$2"  # 'HH:MM:SS'
  local to="$3"
  q "UPDATE staff_availability SET available_from = '$from', available_to = '$to'
     WHERE tenant_id = '$TENANT'::uuid
       AND academic_year_id = '$AY'::uuid
       AND staff_profile_id IN (
         SELECT sp.id FROM staff_profiles sp JOIN users u ON u.id = sp.user_id
         WHERE u.email = '$staff_email'
       );"
}

# Curriculum: flip requires_double_period on a subject for all year groups
set_subject_double_period() {
  local subject_name="$1"  # e.g. 'Science'
  local on="$2"            # true|false
  q "UPDATE curriculum_requirements cr
     SET requires_double_period = $on
     WHERE tenant_id = '$TENANT'::uuid
       AND academic_year_id = '$AY'::uuid
       AND subject_id = (SELECT id FROM subjects WHERE tenant_id = '$TENANT'::uuid AND name = '$subject_name' LIMIT 1);"
}

# Curriculum: set max_periods_per_day for a subject
set_subject_max_per_day() {
  local subject_name="$1"
  local cap="$2"
  q "UPDATE curriculum_requirements cr
     SET max_periods_per_day = $cap
     WHERE tenant_id = '$TENANT'::uuid
       AND academic_year_id = '$AY'::uuid
       AND subject_id = (SELECT id FROM subjects WHERE tenant_id = '$TENANT'::uuid AND name = '$subject_name' LIMIT 1);"
}

# Count schedules generated for a run
count_schedules_for_run() {
  local run_id="$1"
  q "SELECT COUNT(*) FROM schedules WHERE tenant_id = '$TENANT'::uuid AND scheduling_run_id = '$run_id'::uuid;" | head -1
}

# ─── Logging helpers ─────────────────────────────────────────────────────────
log_step() {
  echo "[$(date +%H:%M:%S)] $1"
}
