#!/usr/bin/env bash
# ─── Scheduled Off-Site Backup Replication ─────────────────────────────────────
#
# Cron wrapper for backup-replicate.ts — runs pg_dump and uploads to S3
# (Hetzner Object Storage). Alerts on failure via Slack and Telegram.
#
# Install:
#   0 3 * * * /opt/edupod/app/scripts/backup-replicate-cron.sh >> /var/log/edupod/backup-replicate.log 2>&1
#
# Required env (from .env):
#   DATABASE_URL or DATABASE_MIGRATE_URL
#   S3_BUCKET_NAME, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT, S3_REGION
#
# Optional env (for alerts):
#   DEPLOY_SLACK_WEBHOOK_URL, DEPLOY_TELEGRAM_BOT_TOKEN, DEPLOY_TELEGRAM_CHAT_ID
# ────────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(dirname "$SCRIPT_DIR")}"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S %Z')]"

cd "$APP_DIR"

# Load environment variables
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

notify_failure() {
  local detail="$1"
  local message="[CRITICAL] EduPod off-site backup replication FAILED at $(date '+%Y-%m-%d %H:%M:%S %Z'): ${detail}"

  if [[ -n "${DEPLOY_SLACK_WEBHOOK_URL:-}" ]]; then
    local payload
    payload="$(node -e 'console.log(JSON.stringify({ text: process.argv[1] }))' "$message")"
    curl -fsS -X POST \
      -H 'Content-Type: application/json' \
      --data "$payload" \
      "$DEPLOY_SLACK_WEBHOOK_URL" > /dev/null 2>&1 || echo "${LOG_PREFIX} WARNING: Slack notification failed"
  fi

  if [[ -n "${DEPLOY_TELEGRAM_BOT_TOKEN:-}" && -n "${DEPLOY_TELEGRAM_CHAT_ID:-}" ]]; then
    curl -fsS \
      "https://api.telegram.org/bot${DEPLOY_TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode "chat_id=${DEPLOY_TELEGRAM_CHAT_ID}" \
      --data-urlencode "text=${message}" > /dev/null 2>&1 || echo "${LOG_PREFIX} WARNING: Telegram notification failed"
  fi
}

echo "${LOG_PREFIX} Starting off-site backup replication"

if ! npx tsx scripts/backup-replicate.ts; then
  echo "${LOG_PREFIX} ERROR: Off-site backup replication failed"
  notify_failure "npx tsx scripts/backup-replicate.ts exited non-zero"
  exit 1
fi

echo "${LOG_PREFIX} Off-site backup replication completed successfully"
