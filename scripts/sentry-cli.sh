#!/usr/bin/env bash
# ─── scripts/sentry-cli.sh ────────────────────────────────────────────────────
#
# Vendor-neutral Sentry REST API wrapper for the autonomous triage flow.
# Any AI agent (Claude Code, GPT, Cursor) runs the same commands.
#
# See docs/runbooks/agent-sentry-triage.md for how this is invoked end-to-end.
#
# ─── Token resolution ────────────────────────────────────────────────────────
# 1. $SENTRY_AUTH_TOKEN env var (takes precedence — used by CI)
# 2. ~/.config/edupod/sentry-token (local dev default, chmod 600)
#
# The token is NEVER passed as a CLI arg and NEVER written to stdout/stderr.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SENTRY_ORG="${SENTRY_ORG:-edupod}"
SENTRY_PROJECT="${SENTRY_PROJECT:-node-nestjs}"
SENTRY_API_BASE="${SENTRY_API_BASE:-https://sentry.io/api/0}"
SENTRY_TOKEN_PATH="${SENTRY_TOKEN_PATH:-$HOME/.config/edupod/sentry-token}"

# ─── Internal helpers ────────────────────────────────────────────────────────

die() { echo "error: $*" >&2; exit 1; }

resolve_token() {
  if [[ -n "${SENTRY_AUTH_TOKEN:-}" ]]; then
    printf '%s' "$SENTRY_AUTH_TOKEN"
    return 0
  fi
  if [[ -r "$SENTRY_TOKEN_PATH" ]]; then
    # strip any trailing newline introduced by an editor
    tr -d '\n\r' < "$SENTRY_TOKEN_PATH"
    return 0
  fi
  die "no sentry token found. set \$SENTRY_AUTH_TOKEN, or write one to $SENTRY_TOKEN_PATH (chmod 600)"
}

require_jq() {
  command -v jq >/dev/null 2>&1 || die "jq is required. install: brew install jq"
}

# All HTTP helpers use --fail so a 4xx/5xx exits non-zero with curl's message.
api_get() {
  local path="$1"
  local token; token="$(resolve_token)"
  curl --fail --silent --show-error \
    --header "Authorization: Bearer $token" \
    "$SENTRY_API_BASE$path"
}

api_put() {
  local path="$1" body="$2"
  local token; token="$(resolve_token)"
  curl --fail --silent --show-error \
    --request PUT \
    --header "Authorization: Bearer $token" \
    --header "Content-Type: application/json" \
    --data "$body" \
    "$SENTRY_API_BASE$path"
}

api_post() {
  local path="$1" body="$2"
  local token; token="$(resolve_token)"
  curl --fail --silent --show-error \
    --request POST \
    --header "Authorization: Bearer $token" \
    --header "Content-Type: application/json" \
    --data "$body" \
    "$SENTRY_API_BASE$path"
}

# ─── Commands ────────────────────────────────────────────────────────────────

cmd_list_unresolved() {
  local limit=10
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --limit) limit="$2"; shift 2 ;;
      *) die "unknown arg: $1" ;;
    esac
  done
  require_jq
  # Project-scoped listing. query=is:unresolved matches Sentry's inbox default.
  api_get "/projects/$SENTRY_ORG/$SENTRY_PROJECT/issues/?query=is:unresolved&limit=$limit" | \
    jq -r '
      if length == 0 then
        "(no unresolved issues)"
      else
        (["ID","LEVEL","EVENTS","LAST_SEEN","TITLE"] | @tsv),
        (.[] | [.shortId, (.level // "-"), .count, .lastSeen, .title] | @tsv)
      end
    '
}

cmd_get_issue() {
  local id="${1:-}"
  [[ -z "$id" ]] && die "usage: get-issue <id>"
  require_jq
  echo "── Issue $id ───────────────────────────────────────────"
  api_get "/organizations/$SENTRY_ORG/issues/$id/" | jq '{
    id,
    shortId,
    title,
    culprit,
    level,
    status,
    count,
    userCount,
    firstSeen,
    lastSeen,
    firstRelease: (.firstRelease.shortVersion // null),
    lastRelease:  (.lastRelease.shortVersion  // null),
    permalink,
    topTags: [ (.tags // [])[] | {key, value: (.topValues[0].value // null)} ]
  }'
  echo ""
  echo "── Latest event ────────────────────────────────────────"
  api_get "/organizations/$SENTRY_ORG/issues/$id/events/latest/" | jq '{
    eventID,
    dateCreated,
    message,
    release,
    environment: (.tags // [] | map(select(.key=="environment")) | .[0].value // null),
    tenant_id:   (.tags // [] | map(select(.key=="tenant_id"))   | .[0].value // null),
    url:         (.tags // [] | map(select(.key=="url"))         | .[0].value // null),
    exception: [
      (.entries // [])[]
      | select(.type == "exception")
      | .data.values[]
      | { type, value, frames: [.stacktrace.frames[] | {filename, lineNo, colNo, function, inApp, contextLine}] | .[-8:] }
    ],
    breadcrumbs: [
      (.entries // [])[]
      | select(.type == "breadcrumbs")
      | .data.values[]
    ] | .[-10:]
  }'
}

cmd_check_if_fixed() {
  local id="${1:-}"
  [[ -z "$id" ]] && die "usage: check-if-fixed <id>"
  require_jq
  local issue; issue="$(api_get "/organizations/$SENTRY_ORG/issues/$id/")"
  local last_seen;    last_seen="$(echo    "$issue" | jq -r '.lastSeen // "unknown"')"
  local first_seen;   first_seen="$(echo   "$issue" | jq -r '.firstSeen // "unknown"')"
  local last_release; last_release="$(echo "$issue" | jq -r '.lastRelease.shortVersion // "not-tagged"')"
  local count;        count="$(echo        "$issue" | jq -r '.count // 0')"
  local main_head;    main_head="$(git rev-parse origin/main 2>/dev/null || echo "unknown")"

  local events_1h;  events_1h="$( api_get "/organizations/$SENTRY_ORG/issues/$id/events/?statsPeriod=1h"  | jq 'length')"
  local events_24h; events_24h="$(api_get "/organizations/$SENTRY_ORG/issues/$id/events/?statsPeriod=24h" | jq 'length')"

  cat <<EOF
── Fix check for $id ───────────────────────────────────────────
First seen:         $first_seen
Last seen:          $last_seen
Total events:       $count
Last release tag:   $last_release
Events last 1h:     $events_1h
Events last 24h:    $events_24h
Current origin/main: $main_head

EOF

  if [[ "$events_1h" == "0" && "$events_24h" == "0" ]]; then
    echo "Status: LIKELY ALREADY FIXED — no events in 24h. Consider resolving without code changes."
    exit 0
  elif [[ "$events_1h" == "0" ]]; then
    echo "Status: QUIET in last hour but events within 24h. Proceed with caution — may be intermittent."
    exit 1
  else
    echo "Status: ACTIVELY FIRING — proceed with fix."
    exit 2
  fi
}

cmd_resolve() {
  local id="${1:-}"; shift || true
  [[ -z "$id" ]] && die "usage: resolve <id> [--comment \"...\"]"
  local comment=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --comment) comment="$2"; shift 2 ;;
      *) die "unknown arg: $1" ;;
    esac
  done
  require_jq
  echo "Marking $id resolved..."
  api_put "/organizations/$SENTRY_ORG/issues/$id/" '{"status":"resolved"}' | jq '{id: .id, shortId: .shortId, status: .status}'
  if [[ -n "$comment" ]]; then
    echo ""
    echo "Posting comment..."
    local body; body="$(jq -n --arg t "$comment" '{text: $t}')"
    api_post "/organizations/$SENTRY_ORG/issues/$id/comments/" "$body" | jq '{id: .id, createdAt: .dateCreated}'
  fi
}

cmd_new_events_since() {
  local id="${1:-}" since="${2:-}"
  [[ -z "$id" || -z "$since" ]] && die "usage: new-events-since <id> <iso-timestamp>"
  require_jq
  # Pull the last 24h window (largest safely-paginated period) and count client-side.
  # Sentry ISO timestamps sort lexicographically, so `.dateCreated > $since` works.
  api_get "/organizations/$SENTRY_ORG/issues/$id/events/?statsPeriod=24h" | \
    jq --arg since "$since" '[ .[] | select(.dateCreated > $since) ] | length'
}

cmd_whoami() {
  require_jq
  api_get "/" | jq '{user: .user.username, auth: .auth.scopes}'
}

# ─── Dispatch ────────────────────────────────────────────────────────────────

usage() {
  cat <<EOF
sentry-cli.sh — vendor-neutral Sentry REST wrapper

Usage: $0 <command> [args]

Commands:
  list-unresolved [--limit N]       List unresolved issues (default 10).
  get-issue <id>                    Full detail for one issue (stack, breadcrumbs, tags).
  check-if-fixed <id>               Report activity window vs main. Exit: 0=quiet, 1=mixed, 2=active.
  resolve <id> [--comment "..."]    Mark issue resolved + optional comment.
  new-events-since <id> <iso-ts>    Count events newer than given ISO timestamp.
  whoami                            Sanity-check: echo token's user + scopes.

Config (env or default):
  SENTRY_ORG         = $SENTRY_ORG
  SENTRY_PROJECT     = $SENTRY_PROJECT
  SENTRY_API_BASE    = $SENTRY_API_BASE
  SENTRY_TOKEN_PATH  = $SENTRY_TOKEN_PATH
  SENTRY_AUTH_TOKEN  = (env overrides file)

Examples:
  $0 whoami
  $0 list-unresolved --limit 5
  $0 get-issue EDUPOD-ABC
  $0 check-if-fixed EDUPOD-ABC
  $0 resolve EDUPOD-ABC --comment "Fixed by abc1234 on main"
EOF
}

main() {
  local cmd="${1:-}"
  [[ -z "$cmd" ]] && { usage; exit 1; }
  shift
  case "$cmd" in
    list-unresolved)   cmd_list_unresolved "$@" ;;
    get-issue)         cmd_get_issue "$@" ;;
    check-if-fixed)    cmd_check_if_fixed "$@" ;;
    resolve)           cmd_resolve "$@" ;;
    new-events-since)  cmd_new_events_since "$@" ;;
    whoami)            cmd_whoami ;;
    help|-h|--help)    usage ;;
    *) echo "unknown command: $cmd" >&2; echo ""; usage; exit 1 ;;
  esac
}

main "$@"
