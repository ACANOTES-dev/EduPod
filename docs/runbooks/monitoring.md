# Monitoring Runbook

Last updated: 2026-04-01

---

## Overview

This runbook defines the minimum production monitoring surface for the Hetzner + PM2 deployment:

1. UptimeRobot HTTP checks for user-facing and worker health endpoints
2. Vector log shipping from PM2 logs into Loki
3. deploy notifications through Slack and/or Telegram
4. queue alert thresholds exposed via `/api/health` and `/api/health/ready`

---

## 1. Uptime Monitors

Configure 5-minute HTTP monitors for:

- `https://<tenant>.edupod.app/en/login`
- `https://api.edupod.app/api/health/ready`
- `https://<production-host-or-tunnel>:5556/health`

Expected results:

- web login returns `200`
- API readiness returns `200` when healthy or degraded, `503` when unhealthy
- worker health returns `200`

If the worker endpoint is not internet-exposed, monitor it from an internal probe or tunnel rather than skipping it.

---

## 2. Queue Alert Thresholds

The API health surface now reports queue backlog and stuck-job alerts for critical queues.

Thresholds:

- `notifications`: waiting `>250`, delayed `>100`, failed `>10`
- `behaviour`: waiting `>50`, delayed `>25`, failed `>5`
- `finance`: waiting `>25`, delayed `>25`, failed `>5`
- `payroll`: waiting `>10`, delayed `>10`, failed `>2`
- `pastoral`: waiting `>50`, delayed `>25`, failed `>5`
- any stuck job older than 5 minutes raises an alert immediately

Operational rule:

- treat any non-empty `checks.bullmq.alerts` array as an ops issue
- if health status becomes `degraded` because of queue alerts, investigate before the next deploy

---

## 3. Log Aggregation

Use the Vector config at [ops/vector/vector.toml](/Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/.worktrees/audit-ops/ops/vector/vector.toml) to ship PM2 logs into Loki.

Expected environment on the server:

- `LOKI_PUSH_URL=https://<loki-host>/loki/api/v1/push`

Deployment notes:

1. install Vector on the Hetzner host
2. place the config file under the Vector config directory
3. set `LOKI_PUSH_URL`
4. restart Vector
5. confirm log streams for `api`, `web`, and `worker` appear in Loki

---

## 4. Deploy Notifications

Optional deploy notifications can be enabled from `scripts/deploy-production.sh` with:

- `DEPLOY_SLACK_WEBHOOK_URL`
- `DEPLOY_TELEGRAM_BOT_TOKEN`
- `DEPLOY_TELEGRAM_CHAT_ID`

Notifications fire for:

- successful deploy
- failed deploy
- automatic rollback success

---

## 5. Routine Review

Review these at least weekly:

- UptimeRobot failures or latency spikes
- deploy failures and automatic rollbacks
- queue alert history from the health endpoint
- Loki error bursts grouped by `service`
- any stale backup replication or restore-drill evidence
