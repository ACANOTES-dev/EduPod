---
title: Monitoring and alert review
description: Daily monitoring checks for health, alerts, queues, errors, and platform drift.
alert_keys: [health.degraded, queue.failed_jobs, error.rate]
audit_actions: [alert_acknowledged, alert_silenced]
error_fingerprints: []
components: [api, worker, postgres, redis, bullmq]
severity: p2
tags: [monitoring, alerts, queues]
---

# Monitoring Runbook

Last updated: 2026-04-01

---

## Overview

This runbook defines the minimum production monitoring surface for the Hetzner + PM2 deployment:

1. UptimeRobot HTTP checks for user-facing and worker health endpoints
2. Vector log shipping from PM2 logs into Loki
3. deploy notifications through Slack and/or Telegram
4. queue alert thresholds, PgBouncer pool monitoring, and Redis memory monitoring exposed via `/api/health` and `/api/health/ready`
5. platform admin dashboard visibility at `/en/admin/health`

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

## 2. API Readiness Signals

The API health surface now reports queue backlog and stuck-job alerts for critical queues, plus PgBouncer connection-pool pressure and Redis memory saturation.

Thresholds:

- `notifications`: waiting `>250`, delayed `>100`, failed `>10`
- `behaviour`: waiting `>50`, delayed `>25`, failed `>5`
- `finance`: waiting `>25`, delayed `>25`, failed `>5`
- `payroll`: waiting `>10`, delayed `>10`, failed `>2`
- `pastoral`: waiting `>50`, delayed `>25`, failed `>5`
- any stuck job older than 5 minutes raises an alert immediately
- PgBouncer utilization `>80%` degrades health
- any PgBouncer waiting client connections degrade health immediately
- Redis `used_memory / maxmemory >80%` degrades health when `maxmemory` is configured

Operational rule:

- treat any non-empty `checks.bullmq.alerts` array as an ops issue
- treat `checks.pgbouncer.alert` as a capacity issue requiring investigation
- treat `checks.redis_memory.alert` as a memory-pressure issue requiring action before the next deploy
- if health status becomes `degraded` because of queue alerts, investigate before the next deploy

If `PGBOUNCER_ADMIN_URL` is not configured, the health payload reports `checks.pgbouncer.status = not_configured` and skips pool alerting. This should only be accepted temporarily.

---

## 3. Log Aggregation

Use the Vector config at [ops/vector/vector.toml](../../ops/vector/vector.toml) to ship PM2 logs into Loki.

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

## 5. Platform Dashboard

Platform owners can review the consolidated operational dashboard at:

- `https://edupod.app/en/admin/health`

The dashboard aggregates:

- API dependency health and readiness signals
- worker reachability
- BullMQ queue backlog and stuck-job counts
- PgBouncer pool usage
- Redis memory usage vs. `maxmemory`
- delivery provider configuration status for Resend, Twilio SMS, and Twilio WhatsApp

Use the dashboard as the first stop for triage, then jump to logs, PM2, or provider consoles as needed.

---

## 6. Routine Review

Review these at least weekly:

- UptimeRobot failures or latency spikes
- Synthetic check failures, dependency status rows, and certificate rows in
  `/en/admin/synthetic-checks`, `/en/admin/external-dependencies`, and
  `/en/admin/certificates`
- deploy failures and automatic rollbacks
- queue alert history from the health endpoint
- Loki error bursts grouped by `service`
- any stale backup replication or restore-drill evidence

Use [weekly-ops-review.md](./weekly-ops-review.md) as the recurring review template, and treat any stale recovery-drill evidence from [recovery-drills.md](./recovery-drills.md) as an ops issue.

---

## 7. Synthetic Journey Monitoring

Layer 5 Session 5A adds in-platform synthetic checks alongside UptimeRobot.
These checks are deterministic and non-AI: scheduled jobs run through the API,
worker queues, notification provider, DNS, TLS, and external dependency status
endpoints, then write one result row per attempt.

Default coverage:

- platform admin login using only `SYNTHETIC_PLATFORM_USER_EMAIL` and
  `SYNTHETIC_PLATFORM_USER_PASSWORD`
- API readiness, tenant login page render, DNS apex lookup, and platform TLS
- dedicated `synthetic-canary` worker queue
- critical queue canaries for `notifications`, `behaviour`, `finance`,
  `payroll`, and `pastoral`
- Resend notification self-test using `SYNTHETIC_RESEND_SINK_EMAIL`
- external dependency status for Resend, Twilio, Stripe, Sentry, S3-compatible
  object storage, Meilisearch, and registrar/DNS

Operational rules:

- Missing synthetic credentials should be treated as monitoring
  misconfiguration, not as a user-account issue.
- Synthetic checks must never point at files under `~/.codex`; scheduled checks
  resolve credentials from environment variable keys only.
- Response bodies are not stored. Inspect `response_body_sha256`, the redacted
  snippet, and structured failure detail.
- Active platform maintenance windows produce `skipped_maintenance` results and
  no alert for applicable checks.
- A single failure emits a warning; configured consecutive failures emit a
  critical alert; the first pass after a failure emits a recovery alert.

## 8. Sentry Intake

Layer 5 Session 5C mirrors signed Sentry issue webhooks into the platform
dashboard so operators can triage without context-switching to Sentry first.

First stops:

- `/en/admin/sentry` for the issue list, filters, state, release, and tenant
  context.
- `/en/admin/sentry/audit` for the last webhook receipts, signature status,
  replay detection, and processing errors.
- Sentry issue detail pages for deploy, correlation-id, runbook, topology,
  severity-policy, histogram, and linked `platform_error_log` evidence.

Operational rules:

- Missing or invalid `SENTRY_WEBHOOK_SECRET` is a monitoring configuration
  fault. The webhook must fail closed and audit every rejected receipt.
- Raw Sentry payloads are never stored. Use the redacted summaries, tags,
  `payload_sha256`, and linked error-log rows for forensics.
- Production may legitimately have zero alert routes or escalation policies
  configured. In that state, critical Sentry intake alerts are recorded in the
  platform alert history but may not wake an operator until destinations are
  provisioned.
- The three Sentry issue actions are operator-clicked only: Explain opens a
  preloaded Copilot conversation without sending a model message, Generate
  handoff creates a prompt for review, and Prepare triage prompt renders the
  static wrapper for [agent-sentry-triage.md](./agent-sentry-triage.md). The
  dashboard never executes the runbook.

## 9. Layer 5 Operational Provisioning Closeout

Layer 5 code is live, but operational readiness stays red until real operator
destinations, Sentry delivery, offsite backup metadata, and restore-drill
evidence are provisioned. Treat these as setup gaps, not deploy failures.

First-stop pages:

- `/en/admin/readiness` — live readiness score, reasons, dimension weights, and
  90-day snapshot history.
- `/en/admin/alerts/channels`, `/en/admin/alerts/routes`, and
  `/en/admin/alerts/escalation` — alert destinations, route-health sinks, and
  escalation policies.
- `/en/admin/sentry` and `/en/admin/sentry/audit` — mirrored issues and webhook
  receipts.
- `/en/admin/evidence-completeness` — freshness of the 14 seeded evidence
  pipelines, including Layer 5's own monitoring pipelines.
- `/en/admin/backups` — latest captured backup, offsite replication metadata,
  restore drill records, and backup readiness reasons.

Provisioning order:

1. Configure an email alert channel and at least one urgent route (Telegram,
   WhatsApp, SMS, or push).
2. Give every enabled route a distinct health-check sink destination. The sink
   must not be the operator's real destination.
3. Add a critical escalation policy that starts with email and falls through to
   the urgent route after the acknowledgement window.
4. Run route tests only when the destination owner expects a live synthetic test
   message.
5. Configure Sentry webhook delivery with the production signing secret, then
   verify signed receipts in `/en/admin/sentry/audit`.
6. Configure read-only offsite backup metadata polling. Layer 5 must never
   write, move, delete, or restore backup artefacts.
7. Run a real restore drill using [recovery-drills.md](./recovery-drills.md),
   then record the result in `/en/admin/backups`.

Readiness score interpretation:

- Missing alert routes, missing Sentry receipts, missing offsite replication,
  and missing restore drills are scored as real readiness gaps.
- Empty production tables for event-triggered sources can be `unknown`; that is
  honest evidence state, not a hidden pass.
- Score improvements should be explainable by the underlying dimension inputs.
  Do not adjust weights to hide unprovisioned operational paths.
