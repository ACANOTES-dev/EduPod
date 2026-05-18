# Platform Admin Dashboard -- Layer 5: Resilience & Readiness

**Date:** 2026-05-16
**Status:** Plan
**Sessions:** 6 (5A, 5B, 5C, 5D, 5E, 5F)
**Design Spec:** `docs/superpowers/specs/2026-04-01-platform-admin-dashboard-design.md`
**Origin:** Operator-proposed (2026-05-16) after Layers 1–4 were planned. Layers 1–4 give the operator an evidence base, an AI Copilot, manual recommendations, supervised actions, and a repo-agent handoff. None of those help when the operator is **not looking at the dashboard**. Layer 5 closes the "do not get blindsided" gap with non-AI scheduled checks, real alert delivery, escalation, evidence-completeness monitoring, backup readiness, and a single readiness score.

---

## 1. What Layer 5 Delivers

Layer 5 is the **proactive, non-AI** layer of the dashboard. Layers 1–4 are operator-invoked: the operator opens the page, clicks Explain, asks for a recommendation, approves an action. Layer 5 reverses the polarity — it watches the platform on a schedule and reaches **out** to the operator when something is broken, even if the operator is offline or asleep.

After this layer, the platform owner can:

- **See the platform exercised continuously**, not just when there is real traffic — synthetic journey checks (`platform admin login`, tenant login, key tenant API/page checks, worker liveness, queue canary, notification self-test) run on a configurable cadence and store results historically. Failures and sustained degradation fire alerts.
- **Receive a real, urgent wake-up signal** through email plus at least one urgent path (SMS, WhatsApp, Telegram, or push) — Layer 2B's multi-channel alerting is extended with escalation rules (if a critical alert is not acknowledged within N minutes, page the next channel), quiet hours with critical override, a "test alert" button, and an alert-route dead-man check so the operator knows when the notification path itself is broken.
- **Receive Sentry alerts inside the admin console** through a webhook intake that creates/updates platform error or incident records, captures issue id, permalink, fingerprint, release, environment, tenant_id (when available), event counts, and stack summary, and correlates each issue with deploy events, correlation ids, topology, severity policy, queues, and runbooks from Layer 4A.
- **See the monitoring system monitoring itself** — an evidence-completeness panel alerts when health snapshots stop, queue snapshots stop, deploy events are missing after CI, Sentry intake is stale, runbook indexing fails, topology is stale, severity policies are missing, error logging stops writing, or WebSocket/Redis pubsub is degraded.
- **Trust backups before the disaster** — a backup/restore readiness panel surfaces last successful DB backup, last offsite replication, restore-point age, last restore drill, and alerts on stale or failed backup/restore evidence.
- **Glance at one number** — the Readiness Score (out of 100) summarises whether the operator can trust the platform's monitoring and response posture, decomposed by dimension so the operator knows which input is dragging it down.

The constraint that defines this layer: **non-AI is non-negotiable.** No scheduled check, escalation step, alert evaluator, Sentry ingest handler, freshness check, backup audit, or readiness calculator may call Anthropic. Layer 5 invokes the Copilot only by **rendering a button** (Explain with Copilot, Generate repo-agent handoff, Run Sentry triage agent) that the operator clicks. The model is never called in the background.

The second constraint: **no repo access from the admin console.** Sentry intake never spawns code-fixing agents. The intake produces structured evidence + an operator-triggered "Generate repo-agent handoff" button, which uses Layer 4D's prompt generator. The repo-agent workflow remains owned by `docs/runbooks/agent-sentry-triage.md`.

---

## 2. Prerequisites

**Hard prerequisites (must ship before any Layer 5 session starts):** Layers **1, 1.5, and 2**. Layer 4A is required for Sessions **5C and 5D** specifically (correlation engine + evidence-service inputs). Layer 3 (at least 3C) is required for maintenance-window suppression. Layers 4B/4C/4D are NOT strict prerequisites — they unlock the operator-clicked "Explain with Copilot" / "Generate repo-agent handoff" deeplinks; if Layer 4B/C/D are not yet deployed, those buttons hide and Layer 5 still ships full standalone value.

This matches the §6 Build Sequence note in the master design spec. The earlier wording in this plan that said Layer 5 "can begin as soon as Layer 4 is in production" is superseded — implementation agents should not block on Layer 4B/C/D for any Layer 5 session.

| Prerequisite                                             | Hard / Soft                                                       | Status / Source                           | Why Layer 5 needs it                                                                                                                                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Layer 1 shipped                                          | **Hard (all sessions)**                                           | In progress (1A, 1B done; 1C/1D pending)  | WebSocket + health snapshots + alert framework are signals 5A and 5D consume                                                                                                               |
| Layer 1.5 shipped                                        | **Hard (all sessions)**                                           | Pending                                   | RBAC permissions for new endpoints; audit ledger for every Layer 5 mutation; redacted error log for the Sentry intake to write into; owner confirmation primitive for sensitive 5E actions |
| Layer 2 shipped                                          | **Hard (5A, 5B, 5D)**                                             | Pending                                   | Multi-channel alerting from 2B is the foundation 5B extends; queue diagnostics from 2C feed the 5A queue canary and 5D's queue-snapshot heartbeat                                          |
| Layer 3 (at least 3C maintenance windows)                | **Hard (5A, 5D)**                                                 | Pending                                   | Maintenance windows from 3C suppress Layer 5 checks during scheduled work                                                                                                                  |
| Layer 4A (observability context)                         | **Hard (5C, 5D)**; soft for 5A/5B/5E/5F                           | Pending                                   | 4A's deploy events, correlation ids, runbook index, topology, severity policy are the inputs 5C correlates Sentry issues against; 5D references 4A pipelines for freshness checks          |
| Layer 4B (Copilot)                                       | **Soft** — enables operator-clicked "Explain with Copilot" button | Pending                                   | Without 4B, the Explain button hides; 5C still ships Sentry intake + Prepare-triage-prompt button                                                                                          |
| Layer 4D (repo-agent handoff generator)                  | **Soft** — enables operator-clicked "Generate repo-agent handoff" | Pending                                   | Without 4D, the Generate-handoff button hides; the static triage prompt template (5C) still works                                                                                          |
| Existing `docs/runbooks/agent-sentry-triage.md`          | **Hard (5C)**                                                     | Done                                      | The authoritative repo-agent workflow; 5C's static template references it; alignment test enforces                                                                                         |
| Existing `docs/runbooks/monitoring.md`                   | Done                                                              | Done                                      | Layer 5 absorbs UptimeRobot's surface area into the dashboard but does not retire UptimeRobot — they reconcile in 5D                                                                       |
| Existing Resend email provider                           | **Hard (5B)**                                                     | Done                                      | Used by 5B for the email alert channel                                                                                                                                                     |
| Twilio SMS / WhatsApp credentials                        | **Hard (5B)** — at least one urgent path                          | Done (WhatsApp via Twilio); SMS optional  | At least one urgent path required by 5B — operator picks SMS/WhatsApp/Telegram/push at deploy time                                                                                         |
| Telegram bot credentials (optional)                      | Soft                                                              | Optional                                  | Alternative urgent path                                                                                                                                                                    |
| Browser push (VAPID) credentials                         | Soft                                                              | Optional                                  | Alternative urgent path                                                                                                                                                                    |
| Sentry org + webhook signing secret                      | **Hard (5C)**                                                     | Existing org; webhook secret **needed**   | 5C ingests Sentry alerts via signed webhooks; secret rotation is operator-managed                                                                                                          |
| Existing backup/restore runbooks                         | **Hard (5E)**                                                     | Done (`docs/runbooks/recovery-drills.md`) | 5E reads timestamps and surfaces them; does not replace the runbook                                                                                                                        |
| Critical-queue processor sentinel guards                 | **Hard (5A queue canaries)**                                      | **Needed (separate small patch)**         | The 5 critical-queue processors (notifications, behaviour, finance, payroll, pastoral) each gain a one-line synthetic-sentinel short-circuit so per-critical-queue canaries are safe       |
| Synthetic platform user seeded                           | **Hard (5A platform admin login)**                                | **Needed (deployment task)**              | Dedicated `synthetic-monitor@platform.edupod.app` with `platform_support` role + minimum perms — NEVER the operator's owner account                                                        |
| Backup script extended to POST `_internal/backup-events` | **Hard (5E)**                                                     | **Needed (separate small patch)**         | Idempotent capture endpoint exists in 5E; the deploy script must call it with `--retry 3`                                                                                                  |

---

## 3. Session Dependency Graph

```
Layers 1, 1.5, 2, 3, 4 shipped
    |
    +---> Session 5A: Synthetic Journey Monitoring
    |
    +---> Session 5B: Alert Routing + Escalation        (reads 5A failure events + Layer 2B channels)
    |
    +---> Session 5C: Sentry Intake + Agent Handoff Packets   (independent of 5A/5B; uses 4A correlation/topology)
              |
              +---> Session 5D: Evidence Completeness Monitoring   (depends on 5A/5B/5C signals + Layer 4A pipeline)
                        |
                        +---> Session 5E: Backup / Restore Readiness Panel   (independent inputs but rendered with 5D context)
                                  |
                                  +---> Session 5F: Readiness Score / Ops Confidence   (aggregates ALL Layer 5 signals)
```

**Execution order:** 5A and 5B can run in parallel (5B does not depend on 5A's tables, only on its alert events), with 5C in parallel as well. 5D should follow 5A/5B/5C because it monitors their pipelines. 5E is independent of 5A–5C inputs but is best shipped after 5D so its freshness panel is wired into the same evidence-completeness UI. 5F must ship last — it sums every other Layer 5 signal into one score.

**Recommended sequential order:** 5A -> 5B -> 5C -> 5D -> 5E -> 5F

**Runtime model:** Layer 5 runs on **non-AI** schedules and webhooks. Cron jobs, BullMQ jobs, and Sentry webhook handlers do all the work. The only model interaction in Layer 5 is the **operator-clicked** Copilot/Explain/Repo-agent-handoff buttons, which route to the existing Layer 4 endpoints.

---

## 4. The "non-AI proactive" architectural commitment

This is the rule the entire layer is built on: **no Layer 5 code path may call Anthropic, OpenAI, or any LLM API.** Detection, classification, alerting, escalation, and scoring are deterministic — implemented with rules, thresholds, and runbook lookups.

Concretely:

- The synthetic journey runner (`SyntheticCheckRunnerService`) executes HTTP/WebSocket/queue checks and compares against expected status codes / latencies / job-completion semantics. No model call.
- The escalation engine (`AlertEscalationService`) is a state machine: alert fires → wait N minutes → if not acknowledged → fire next channel. Cron-driven. No model call.
- The Sentry intake (`SentryWebhookController`) parses Sentry's webhook payload into a `platform_sentry_issues` row and links it to deploy events / correlation ids / topology by key matching. No model call.
- The evidence completeness checker (`EvidenceFreshnessService`) runs a SELECT-MAX(occurred_at) per pipeline and flags any pipeline whose freshness exceeds its threshold. No model call.
- The backup readiness checker (`BackupReadinessService`) reads timestamps from existing backup logs / S3 object metadata / restore-drill log entries. No model call.
- The readiness score (`ReadinessScoreService`) is a weighted sum of the above signals. No model call.

The connection to Layer 4 is one-way and operator-initiated:

1. A Layer 5 surface (e.g., a failed synthetic journey card, a Sentry issue card, a stale-backup card) renders an `<ExplainButton>` or `<GenerateHandoffButton>` from Layer 4.
2. The button is **inert** until clicked.
3. On click, the existing Layer 4 endpoint is called with a pre-loaded evidence bundle.
4. If Layer 4 is not deployed, the button is hidden; Layer 5 still ships value as standalone monitoring.

This boundary is enforced by a static analysis spec that asserts no file under `apps/api/src/modules/platform-resilience/**` (Layer 5 module) imports `AnthropicClientService` or `PlatformAiCopilotService`. Adding such an import is a build failure.

---

## 5. Database Migration Summary

### New Tables

All platform-level (no `tenant_id`, no RLS).

| Table                                  | Session | Purpose                                                                                                                               |
| -------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `platform_synthetic_check_definitions` | 5A      | Operator-managed catalogue of synthetic checks (kind, target, schedule, thresholds, enabled)                                          |
| `platform_synthetic_check_results`     | 5A      | Per-execution results (status, latency, response payload digest, failure detail) — append-only                                        |
| `platform_external_dependency_status`  | 5A      | Snapshot per check of external SaaS dependencies (Resend, Twilio, Stripe, Sentry, S3, DNS, Meilisearch) and their public status pages |
| `platform_certificate_checks`          | 5A      | TLS/SSL certificate inventory per domain with NotAfter, days-until-expiry, last-checked                                               |
| `platform_alert_routes`                | 5B      | Per-channel route configuration (channel id, urgency tier, active hours, quiet-hours override flag)                                   |
| `platform_alert_escalation_policies`   | 5B      | Ordered list of routes per severity + acknowledgement window                                                                          |
| `platform_alert_route_health_checks`   | 5B      | Periodic dead-man results for each route (per channel, sent_at, ack_at, latency, success)                                             |
| `platform_alert_acknowledgements`      | 5B      | Per-alert-history-id ack record (operator id, ack_at, ack_channel, comment)                                                           |
| `platform_alert_emergency_contacts`    | 5B      | Operator emergency contact profile (per platform_user) — channel preference + identifiers                                             |
| `platform_sentry_issues`               | 5C      | Mirror of Sentry issue state, updated by webhook                                                                                      |
| `platform_sentry_events_summary`       | 5C      | Aggregate metrics per Sentry issue (event counts by hour, affected tenants, releases)                                                 |
| `platform_sentry_webhook_audit`        | 5C      | Append-only log of inbound webhook receipts (signature_valid, payload_kind, processed_at, error)                                      |
| `platform_evidence_pipelines`          | 5D      | Catalogue of pipelines monitored for freshness (key, expected_interval_seconds, threshold_breach_action)                              |
| `platform_evidence_pipeline_status`    | 5D      | Latest freshness state per pipeline (last_seen_at, lag_seconds, status, breach_count)                                                 |
| `platform_uptime_reconciliations`      | 5D      | Disagreements between external uptime monitors (UptimeRobot) and internal health checks                                               |
| `platform_backup_runs`                 | 5E      | Per-backup-run record (kind=full/incremental, started_at, finished_at, size_bytes, location, success, integrity_check_passed)         |
| `platform_offsite_replications`        | 5E      | Per-replication snapshot (replication_target, snapshot_id, replicated_at, lag_seconds)                                                |
| `platform_restore_drills`              | 5E      | Operator-recorded restore-drill results (drill_at, performed_by, restore_point, success, notes, evidence_url)                         |
| `platform_readiness_score_snapshots`   | 5F      | Daily snapshot of the readiness score + per-dimension breakdown                                                                       |
| `platform_readiness_dimension_weights` | 5F      | Operator-tunable weights per readiness dimension                                                                                      |

### Modified Tables

| Table                          | Session | Change                                                                                                 |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------ |
| `platform_alert_history` (1C)  | 5B      | Add `escalation_state` enum + `next_escalation_at TIMESTAMPTZ` + `acknowledged_via_route_id` FK        |
| `platform_alert_channels` (2B) | 5B      | Add `urgency_tier` enum (`info`, `urgent`, `critical_only`) + `last_health_check_at`                   |
| `platform_error_log` (2D)      | 5C      | Add `sentry_issue_id` FK to `platform_sentry_issues` (nullable) for cross-linking                      |
| `platform_users` (1.5A)        | 5B      | Add `emergency_contact_id` FK (one-to-one with `platform_alert_emergency_contacts`) — operator profile |

### New Enums

| Enum                         | Session | Values                                                                                                                                                                                                                               |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SyntheticCheckKind`         | 5A      | `http_get`, `http_post`, `websocket_handshake`, `queue_canary`, `notification_self_test`, `dns_lookup`, `tls_check`, `external_dependency_status`                                                                                    |
| `SyntheticCheckResultStatus` | 5A      | `passed`, `degraded`, `failed`, `error`, `skipped_maintenance`                                                                                                                                                                       |
| `AlertEscalationState`       | 5B      | `idle`, `dispatched`, `awaiting_ack`, `escalating`, `acknowledged`, `auto_resolved`, `expired`                                                                                                                                       |
| `AlertChannelUrgencyTier`    | 5B      | `info`, `urgent`, `critical_only`                                                                                                                                                                                                    |
| `SentryIssueState`           | 5C      | `unresolved`, `resolved`, `ignored`, `archived`                                                                                                                                                                                      |
| `EvidencePipelineStatus`     | 5D      | `fresh`, `lagging`, `stale`, `silent`, `unknown`                                                                                                                                                                                     |
| `BackupRunKind`              | 5E      | `full`, `incremental`, `pg_dump`, `snapshot`                                                                                                                                                                                         |
| `BackupRunStatus`            | 5E      | `succeeded`, `failed`, `partial`, `verifying`                                                                                                                                                                                        |
| `RestoreDrillOutcome`        | 5E      | `passed`, `failed_recoverable`, `failed_blocking`, `inconclusive`                                                                                                                                                                    |
| `ReadinessDimension`         | 5F      | `synthetic_journeys`, `alert_route_health`, `evidence_freshness`, `backup_readiness`, `sentry_intake`, `queue_canary`, `deploy_event_freshness`, `unresolved_critical_incidents`, `certificate_expiry`, `external_dependency_status` |

### Single Migration Per Session

Each session ships its own migration directory — sessions are sequential and do not collide. Naming follows the standard `YYYYMMDDHHMMSS_add_platform_resilience_{session}_{purpose}` convention.

---

## 6. New API Endpoints Summary

### Session 5A -- Synthetic Journey Monitoring

| Method | Endpoint                                       | Purpose                                                                      |
| ------ | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| GET    | `/v1/admin/synthetic-checks`                   | List defined checks with last result + uptime % over selected window         |
| POST   | `/v1/admin/synthetic-checks`                   | Create a new check definition                                                |
| PATCH  | `/v1/admin/synthetic-checks/:id`               | Update check (schedule, thresholds, enabled)                                 |
| DELETE | `/v1/admin/synthetic-checks/:id`               | Disable + soft-delete a check                                                |
| POST   | `/v1/admin/synthetic-checks/:id/run-now`       | Trigger an immediate execution outside the schedule                          |
| GET    | `/v1/admin/synthetic-checks/:id/results`       | Paginated history of results for one check                                   |
| GET    | `/v1/admin/synthetic-checks/results/:resultId` | Single result detail with response payload digest + failure detail           |
| GET    | `/v1/admin/external-dependencies`              | Latest snapshot of provider status (Resend, Twilio, Stripe, Sentry, S3, DNS) |
| GET    | `/v1/admin/certificates`                       | TLS certificate inventory with days-until-expiry                             |

### Session 5B -- Alert Routing + Escalation

| Method | Endpoint                                   | Purpose                                                              |
| ------ | ------------------------------------------ | -------------------------------------------------------------------- |
| GET    | `/v1/admin/alerts/routes`                  | List alert routes (channel + urgency tier + quiet-hours rules)       |
| POST   | `/v1/admin/alerts/routes`                  | Create a route                                                       |
| PATCH  | `/v1/admin/alerts/routes/:id`              | Update a route                                                       |
| DELETE | `/v1/admin/alerts/routes/:id`              | Remove a route                                                       |
| POST   | `/v1/admin/alerts/routes/:id/test`         | Send a test alert through one route only                             |
| POST   | `/v1/admin/alerts/test-all`                | Send a test alert through every active route                         |
| GET    | `/v1/admin/alerts/escalation-policies`     | List escalation policies                                             |
| POST   | `/v1/admin/alerts/escalation-policies`     | Create policy (severity + ordered routes + ack window)               |
| PATCH  | `/v1/admin/alerts/escalation-policies/:id` | Update policy                                                        |
| DELETE | `/v1/admin/alerts/escalation-policies/:id` | Remove policy                                                        |
| POST   | `/v1/admin/alerts/history/:id/acknowledge` | Operator acknowledgement (also reachable from a magic link in alert) |
| GET    | `/v1/admin/alerts/route-health`            | Latest dead-man results per route                                    |
| GET    | `/v1/admin/emergency-contacts/me`          | Read the current operator's emergency contact profile                |
| PATCH  | `/v1/admin/emergency-contacts/me`          | Update the current operator's emergency contact profile              |

### Session 5C -- Sentry Intake + Agent Handoff Packets

| Method | Endpoint                                            | Purpose                                                                  |
| ------ | --------------------------------------------------- | ------------------------------------------------------------------------ |
| POST   | `/v1/admin/_internal/sentry-webhook`                | Sentry webhook intake (signature-validated; not JWT-gated)               |
| GET    | `/v1/admin/sentry/issues`                           | List ingested Sentry issues with filters (state, env, release, tenant)   |
| GET    | `/v1/admin/sentry/issues/:id`                       | Issue detail with correlations (deploy, runbook, topology, error log)    |
| POST   | `/v1/admin/sentry/issues/:id/explain`               | Pre-load Copilot Explain (Layer 4B) with this issue's evidence           |
| POST   | `/v1/admin/sentry/issues/:id/generate-handoff`      | Trigger Layer 4D's repo-agent handoff prompt with Sentry context         |
| POST   | `/v1/admin/sentry/issues/:id/prepare-triage-prompt` | Render the operator-runnable Sentry triage runbook prompt (no execution) |

### Session 5D -- Evidence Completeness Monitoring

| Method | Endpoint                                           | Purpose                                              |
| ------ | -------------------------------------------------- | ---------------------------------------------------- |
| GET    | `/v1/admin/evidence-pipelines`                     | List monitored pipelines + freshness state           |
| GET    | `/v1/admin/evidence-pipelines/:key`                | Single pipeline detail with last-N freshness samples |
| POST   | `/v1/admin/evidence-pipelines/:key/run-check-now`  | Trigger an immediate freshness check                 |
| GET    | `/v1/admin/uptime-reconciliations`                 | List internal-vs-external monitor disagreements      |
| POST   | `/v1/admin/uptime-reconciliations/:id/acknowledge` | Operator marks a disagreement as understood          |

### Session 5E -- Backup / Restore Readiness Panel

| Method | Endpoint                           | Purpose                                                                  |
| ------ | ---------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/v1/admin/backups/readiness`      | Aggregate readiness summary (last backup, last replication, drill age)   |
| GET    | `/v1/admin/backups/runs`           | Paginated backup run log                                                 |
| GET    | `/v1/admin/backups/replications`   | Paginated offsite replication log                                        |
| GET    | `/v1/admin/backups/restore-drills` | Paginated restore drill log                                              |
| POST   | `/v1/admin/backups/restore-drills` | Operator records a completed restore drill (manual entry — no execution) |

### Session 5F -- Readiness Score / Ops Confidence

| Method | Endpoint                                          | Purpose                                                                  |
| ------ | ------------------------------------------------- | ------------------------------------------------------------------------ |
| GET    | `/v1/admin/readiness-score`                       | Current readiness score + per-dimension breakdown + worst-dimension hint |
| GET    | `/v1/admin/readiness-score/history`               | Daily snapshots over the last 90 days                                    |
| GET    | `/v1/admin/readiness-score/dimensions`            | List each dimension with its current weight, value, and contribution     |
| PATCH  | `/v1/admin/readiness-score/dimensions/:dimension` | Adjust a dimension's weight (operator-tunable)                           |

**Total: 39 new REST endpoints + 1 internal webhook intake (Sentry).** No new public/tenant-facing endpoints. No new WebSocket gateways — Layer 5 reuses the `platform:alerts` and `platform:health` channels from Layer 1A and 1C, plus a new `platform:resilience` namespace for live readiness updates.

---

## 7. New Frontend Pages/Components Summary

### Session 5A -- Synthetic Journey Monitoring

- New page: `apps/web/src/app/[locale]/(platform)/admin/synthetic-checks/page.tsx` (list with status grid + uptime %)
- New page: `apps/web/src/app/[locale]/(platform)/admin/synthetic-checks/[id]/page.tsx` (single check detail + result history + failure inspector)
- New page: `apps/web/src/app/[locale]/(platform)/admin/external-dependencies/page.tsx` (provider status board)
- New page: `apps/web/src/app/[locale]/(platform)/admin/certificates/page.tsx` (TLS inventory with expiry warnings)
- Components: `SyntheticCheckCard`, `CheckResultTimeline`, `LatencySparklineMini`, `ExternalDependencyStatusCard`, `CertificateExpiryRow`

### Session 5B -- Alert Routing + Escalation

- New page: `apps/web/src/app/[locale]/(platform)/admin/alerts/routes/page.tsx`
- New page: `apps/web/src/app/[locale]/(platform)/admin/alerts/escalation/page.tsx`
- New page: `apps/web/src/app/[locale]/(platform)/admin/alerts/route-health/page.tsx`
- New page: `apps/web/src/app/[locale]/(platform)/admin/profile/emergency-contact/page.tsx`
- Components: `AlertRouteCard`, `EscalationPolicyEditor`, `RouteHealthBadge` (also rendered in admin layout header), `TestAlertButton`, `EmergencyContactForm`, `QuietHoursToggle`

### Session 5C -- Sentry Intake + Agent Handoff Packets

- New page: `apps/web/src/app/[locale]/(platform)/admin/sentry/page.tsx` (Sentry issue list)
- New page: `apps/web/src/app/[locale]/(platform)/admin/sentry/[id]/page.tsx` (issue detail with correlations + handoff buttons)
- Components: `SentryIssueCard`, `SentryCorrelationsPanel`, `SentryEventHistogram`, `SentryHandoffActions` (renders Explain / Generate Handoff / Prepare Triage Prompt)

### Session 5D -- Evidence Completeness Monitoring

- New page: `apps/web/src/app/[locale]/(platform)/admin/evidence-completeness/page.tsx`
- New page: `apps/web/src/app/[locale]/(platform)/admin/uptime-reconciliations/page.tsx`
- Components: `EvidencePipelineCard`, `FreshnessBadge`, `EvidenceCompletenessBanner` (in admin layout header when any pipeline is `silent`), `UptimeDisagreementCard`

### Session 5E -- Backup / Restore Readiness Panel

- New page: `apps/web/src/app/[locale]/(platform)/admin/backups/page.tsx` (readiness summary + tabs for runs / replications / drills)
- Components: `BackupReadinessSummary`, `BackupRunRow`, `ReplicationRow`, `RestoreDrillCard`, `RecordRestoreDrillDialog`

### Session 5F -- Readiness Score / Ops Confidence

- New page: `apps/web/src/app/[locale]/(platform)/admin/readiness/page.tsx` (big number + per-dimension breakdown + 90-day trend)
- Component: `ReadinessScoreHeroCard` (also rendered on dashboard home — `/admin`)
- Components: `DimensionBreakdownTable`, `DimensionWeightEditor`, `WorstDimensionCallout`

---

## 8. Alerting Behaviour Summary

Every Layer 5 session emits alert events through Layer 1C / 2B / 5B. No session ships a parallel notification path.

| Source             | Event                                                                                             | Severity            | Target Channels                              |
| ------------------ | ------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------- |
| 5A synthetic check | Single failure                                                                                    | `warning`           | Default route                                |
| 5A synthetic check | Failure for ≥ N consecutive runs (configurable per check)                                         | `critical`          | Escalation policy                            |
| 5A external dep    | Provider status drops below "operational"                                                         | `warning`           | Default route                                |
| 5A certificate     | Days-until-expiry ≤ 14                                                                            | `warning`           | Default route                                |
| 5A certificate     | Days-until-expiry ≤ 3                                                                             | `critical`          | Escalation policy                            |
| 5B route health    | Dead-man check fails for any route                                                                | `critical`          | Surviving routes (other than the failed one) |
| 5C Sentry intake   | Webhook signature failure                                                                         | `critical`          | Escalation policy                            |
| 5C Sentry intake   | Severity Sentry issue ingested matching critical-policy                                           | (per Sentry policy) | Default route                                |
| 5D freshness       | Pipeline transitions to `silent`                                                                  | `critical`          | Escalation policy                            |
| 5D freshness       | Pipeline transitions to `lagging`                                                                 | `warning`           | Default route                                |
| 5D reconciliation  | Internal-vs-external disagreement persists ≥ 2 cycles                                             | `warning`           | Default route                                |
| 5E backup          | DB backup success age > backup SLO (default 25h for daily)                                        | `critical`          | Escalation policy                            |
| 5E backup          | Offsite replication lag > replication SLO (default 6h)                                            | `warning`           | Default route                                |
| 5E backup          | Restore drill age > 90 days                                                                       | `warning`           | Default route                                |
| 5E backup          | Restore drill age > 180 days                                                                      | `critical`          | Escalation policy                            |
| 5F readiness       | Score crosses below operator-set floor (default 80) for 2 consecutive live evaluations (≈ 10 min) | `warning`           | Default route                                |
| 5F readiness       | Score crosses below floor / 2 (default 40) for 2 consecutive live evaluations                     | `critical`          | Escalation policy                            |

All alerts respect maintenance windows from Layer 1.5C **except** route-health and signature-failure events (the alert system itself being broken must not be silenceable by accident). Alert silencing from Layer 1.5C still applies for noise reduction.

---

## 9. Testing Strategy

### Unit Tests (co-located with source)

- **5A:** check runner per kind (HTTP/WebSocket/queue/notification/DNS/TLS), threshold evaluation, schedule debounce, maintenance-window suppression
- **5B:** escalation state machine transitions, quiet-hours evaluation, dead-man check producer, route ack via magic link
- **5C:** Sentry webhook signature verification, payload normaliser per event kind (`issue_alert`, `issue_resolved`, `event_alert`), correlation lookup by tag (release / tenant_id / fingerprint)
- **5D:** freshness threshold per pipeline, status transitions (`fresh` → `lagging` → `stale` → `silent`), uptime reconciliation diff
- **5E:** backup-age computation, replication-lag computation, drill-age computation
- **5F:** weighted-sum calculator, missing-dimension fallback, worst-dimension selection

### Integration Tests

- **5A:** end-to-end synthetic admin login check actually hits the local stack (test env), records a result, fires no alert when it passes, fires an alert when intentionally broken
- **5B:** full escalation lifecycle — alert fires → email sent → 10 minutes pass without ack → SMS sent → operator acks → escalation halts
- **5B:** dead-man check — disable an outbound channel intentionally, dead-man check detects, surviving channels notified
- **5C:** signed Sentry webhook accepted; unsigned rejected; ingested issue is correlated with the deploy event from the same SHA
- **5D:** pipeline silence detection — turn off the health-snapshot cron, freshness check transitions to `silent`, alert fires
- **5E:** backup readiness summary returns the correct status given fixture rows in `platform_backup_runs`, `platform_offsite_replications`, `platform_restore_drills`
- **5F:** readiness score for a clean fixture is 100; degrade one dimension and assert the score, the worst-dimension callout, and the breakdown match expectations

### Static Analysis

- **No-AI guard:** static-analysis test scans `apps/api/src/modules/platform-resilience/**` for any import of `AnthropicClientService`, `PlatformAiCopilotService`, `RecommendationGenerationService`, or any Layer 4 generation service. Imports of Layer 4 read-only types (e.g., `EvidenceBundle` shape for handoff) are allowed; imports of services that _call_ the model are not.
- **No-repo-access guard:** static-analysis test scans the same module for any `simple-git`, `child_process` `git` invocations, file writes outside `/tmp`, or any Octokit usage that goes beyond opening issues. The handoff prompt generator delegates to Layer 4D, which already has its own guards.

### What We Mock

- HTTP targets (5A) — local mock server with configurable failure modes
- Twilio / Resend (5B) — provider mocks; assert the dispatch payload matches expectations
- Sentry webhook (5C) — fixture payloads + signing key
- S3 object metadata (5E) — mock S3 client returning fixture object listings
- BullMQ queues (5A canary) — mocked queue with deterministic job add/process

---

## 10. Architecture File Updates

After Layer 5 ships, update:

| File                                       | Update                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/architecture/module-blast-radius.md` | Add the new `platform-resilience` module: depends on `platform-evidence` (4A read-only), `platform-alerts` (1C), `platform-alert-channels` (2B), `platform-audit` (1.5B), `redis`, `bullmq`                                                                                                                                                                                                                                                                                                                                                                                              |
| `docs/architecture/event-job-catalog.md`   | Add: `resilience:run-synthetic-check` (parameterised cron per check), `resilience:dead-man-check` (per route, sink-bound), `resilience:freshness-check` (every 60s), `resilience:queue-snapshot-heartbeat` (every 60s, writes Redis key), `resilience:backup-readiness-check` (every 15 min), `resilience:readiness-score-live-evaluate` (every 5 min, in-memory), `resilience:readiness-score-snapshot` (daily 00:05 UTC, persisted), `resilience:certificate-check` (daily 03:00 UTC), `resilience:external-dependency-poll` (every 5 min), `resilience:escalation-tick` (every 30s)   |
| `docs/architecture/state-machines.md`      | Add `AlertEscalationState` machine (transitions documented in Session 5B) and `EvidencePipelineStatus` machine (5D)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `docs/architecture/danger-zones.md`        | Add: DZ-RES-1 (alert-route dead-man check must NEVER alert via a route that itself failed), DZ-RES-2 (Sentry webhook handler must reject unsigned payloads even if the signing secret is missing — fail closed), DZ-RES-3 (synthetic checks must skip during maintenance windows for the affected component, but route-health checks must NOT be skippable), DZ-RES-4 (backup readiness reads timestamps; never trigger restores from this layer), DZ-RES-5 (readiness score is non-AI; do not let a "use Copilot to summarise" feature creep introduce model calls into the score path) |
| `docs/architecture/feature-map.md`         | Add the platform resilience surface (after operator confirms iteration is done) — six new pages, ~39 endpoints                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `docs/runbooks/monitoring.md`              | Append a section pointing to `/admin/synthetic-checks`, `/admin/evidence-completeness`, and `/admin/readiness` as the first triage stops, retaining UptimeRobot as the external/independent monitor                                                                                                                                                                                                                                                                                                                                                                                      |

---

## 11. Definition of Done

Layer 5 is complete when ALL of the following are true:

- [ ] At least 13 synthetic checks defined and running on schedule: platform admin login (using a dedicated synthetic platform user — never the operator's owner account), tenant login (per pilot tenant), tenant API readiness, tenant page render, worker liveness, **6 queue canaries (1 dedicated `synthetic-canary` + 5 per-critical-queue: notifications, behaviour, finance, payroll, pastoral)**, notification self-test (Resend / Twilio with sink address), DNS resolution. **Closeout note 2026-05-18:** production has 24 definitions and 16 latest passes; `platform.admin.login` and `notification.resend.self_test` have no result yet, and six external dependency checks are failing/unknown, so this remains open until synthetic credentials/sinks and provider parsers are provisioned.
- [x] At least one TLS certificate per active tenant domain monitored; expiry alerts at 14 / 3 days
- [x] External dependency status polled for Resend, Twilio, Stripe, Sentry, AWS S3, Meilisearch, and the registrar/DNS provider; non-operational status surfaces a card and an alert
- [ ] Multi-channel alert routing extended with at least one urgent path enabled in production (SMS / WhatsApp / Telegram / push) plus email
- [ ] "Test alert" button exists for each route AND for "all routes at once"; both actions audit-log
- [ ] Escalation policy lifecycle works end-to-end: critical alert fires → primary route → ack window → secondary route → operator acknowledges → escalation halts
- [ ] Quiet-hours policy with critical-override toggle works
- [ ] Alert-route dead-man check runs every 15 minutes per route; failure alerts via _other_ routes
- [ ] Sentry webhook ingest verifies signatures; unsigned payloads rejected with 401 and audited
- [ ] Sentry issues correlate with deploy events / correlation ids / topology / runbooks from Layer 4A
- [ ] Sentry issue detail page shows three operator buttons: "Explain with Copilot", "Generate repo-agent handoff", "Prepare Sentry triage prompt"; **none** of these run autonomously
- [x] Evidence completeness monitors **14 seeded pipelines**: 9 for Layer 1–4 sources (health snapshots, BullMQ queue heartbeat, deploy events, Sentry intake, runbook indexing, topology updates, severity policy refresh, error logging, Redis pubsub) **plus 5 for Layer 5's own pipelines** (synthetic results, alert route health, backup capture, backup readiness, readiness score snapshots) — and renders a banner when any pipeline transitions to `silent`. The bullmq.snapshots pipeline reads a Redis key updated by 5D's `QueueSnapshotHeartbeatTask` (Layer 2C has no DB table — heartbeat is the bridge).
- [ ] Uptime reconciliation table compares UptimeRobot results vs internal health checks; disagreements lasting ≥ 2 cycles raise warnings
- [ ] Backup readiness panel shows last successful DB backup, last offsite replication, restore-point age, last restore drill, with alert thresholds enforced. **Closeout note 2026-05-18:** production shows one captured `pg_dump` predeploy backup and restore-point age; offsite replication metadata and restore-drill evidence are still unprovisioned, so readiness remains red.
- [ ] Restore drill history is operator-recorded — no automatic restore execution from Layer 5
- [x] Readiness score (0–100) renders on the dashboard home and on `/admin/readiness`; per-dimension breakdown identifies the worst-contributing dimension; sourced from live computation, not yesterday's snapshot
- [x] **Live evaluation cron runs every 5 minutes** (computes in-memory, fires alerts on debounced crossings) AND daily snapshot cron runs at 00:05 UTC (persists for trend chart only — does not drive alerts)
- [x] Per-dimension weights are operator-tunable; weight changes audit-log via Layer 1.5B
- [x] **No file under `apps/api/src/modules/platform-resilience/**`imports`AnthropicClientService`, `PlatformAiCopilotService`, or any Layer 4 generation service\*\* — verified by static-analysis test
- [x] **No file under `apps/api/src/modules/platform-resilience/**` performs git, child_process git, or repo file writes\*\* — verified by static-analysis test
- [ ] Layer 4 deeplink buttons (Explain with Copilot, Generate repo-agent handoff) only render when Layer 4 is deployed; otherwise hidden gracefully
- [x] All new code passes `turbo lint` and `turbo type-check`
- [x] All new tests pass and no existing tests regress
- [x] `docs/architecture/danger-zones.md` gains DZ-RES-1 through DZ-RES-5 (per §10)
- [x] `docs/runbooks/monitoring.md` updated to point operators at the new readiness surfaces while retaining UptimeRobot as the external monitor of last resort

### Operational Closeout Snapshot -- 2026-05-18

Live production data from `https://dua.edupod.app` shows Layer 5 is code-complete but not operationally complete. The red readiness posture is honest: missing data is penalised as `0`, and empty provisioning surfaces render without hiding the gap.

**Readiness score:** `37.45 / 100`, worst dimension `alert_route_health`.

| Surface               | Live production state                                                                                                                                                                                                    | Closeout decision                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Synthetic checks      | 24 definitions; latest statuses: 16 `passed`, 6 `failed`, 2 with no result. Queue canaries are healthy. `platform.admin.login` and `notification.resend.self_test` have not produced rows yet.                           | Provision synthetic credentials/sinks before checking the main synthetic acceptance item.                  |
| TLS certificates      | 6 certificate rows, all `ok`, minimum 88 days until expiry.                                                                                                                                                              | Accepted.                                                                                                  |
| External dependencies | 7 provider rows. Sentry is `operational`; registrar/DNS and Twilio report `minor`; Meilisearch, Resend, S3, and Stripe are `unknown`. Critical alert rows are being recorded, but no alert routes exist to deliver them. | Polling path accepted; provider parser/config gaps remain operational.                                     |
| Alert routing         | 0 channels, 0 routes, 0 route-health rows, 0 escalation policies, no emergency contact profile.                                                                                                                          | Provisioning gap; not a deployment failure.                                                                |
| Sentry intake         | 0 mirrored issues and 0 webhook audit receipts.                                                                                                                                                                          | Provision Sentry webhook delivery and signing secret before accepting Sentry operational criteria.         |
| Evidence completeness | 14 seeded pipelines. 11 `fresh`, 2 `unknown` (`alert.route_health`, `sentry.webhook`), and 1 `silent` (`error.log.writes`). Shell banner renders the silent pipeline.                                                    | Core evidence monitoring accepted; alert/Sentry/error-log pipeline states require operations follow-up.    |
| Uptime reconciliation | 0 disagreement rows.                                                                                                                                                                                                     | Leave open until UptimeRobot API/key mapping is provisioned and at least one comparison cycle is observed. |
| Backups               | 1 captured `pg_dump` backup from the deploy pipeline, age under 1 hour at smoke time, local storage only, integrity not recorded. 0 offsite replications, 0 restore drills.                                              | Backup capture accepted; offsite and drill readiness remain open.                                          |
| Readiness history     | 1 daily snapshot at `2026-05-18T00:05:00Z`; live score computation and dashboard rendering work.                                                                                                                         | Accepted.                                                                                                  |

Manual provisioning steps, because external-service/operator provisioning access was not granted in this closeout:

1. Create at least one email alert channel and one urgent channel (Telegram, WhatsApp, SMS, or push) in `/en/admin/alerts/channels`.
2. Create alert routes in `/en/admin/alerts/routes` with distinct operator and sink destinations. Never reuse the operator destination as the route-health sink.
3. Create a critical escalation policy in `/en/admin/alerts/escalation` with the email route first and the urgent route second; run per-route test alerts only after confirming destinations are safe to receive live test messages.
4. Configure Sentry webhook delivery to `POST /api/v1/admin/_internal/sentry-webhook`, set/verify `SENTRY_WEBHOOK_SECRET` through the normal production secret process, then confirm signed receipts appear in `/en/admin/sentry/audit`.
5. Configure read-only offsite backup metadata polling for the backup target; do not mutate backup artefacts from Layer 5.
6. Run the restore drill from `docs/runbooks/recovery-drills.md`, then record the result in `/en/admin/backups`.
7. Revisit `/en/admin/readiness`; the score should improve only as the real dimension inputs improve.

### External Operational Provisioning Follow-Up -- 2026-05-18

The follow-up verified production again and did not create channels, routes, Sentry
webhook receipts, backup replication rows, or restore-drill records because no
real operator destinations, health-check sink destinations, external-provider
access, live-test approval, offsite metadata, or completed restore-drill evidence
were supplied. Keeping these rows empty preserves the readiness signal: Layer 5
must not become green through placeholder data.

Fresh live gap report from `https://dua.edupod.app`:

| Surface               | Live production state                                                                                                                                                                                                                                                      | Follow-up decision                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Readiness score       | `37.45 / 100`; worst dimension remains `alert_route_health`. Missing route health, Sentry intake, unresolved critical alerts, backup offsite/drill evidence, and external dependencies continue to reduce the score.                                                       | Correct; missing inputs remain penalised.                                            |
| Alerting              | 0 channels, 0 routes, 0 route-health checks, 0 escalation policies, and no emergency contact profile. Latest critical alert rows have `channels_notified: []`.                                                                                                             | Provisioning still required before accepting alert-routing criteria.                 |
| Sentry intake         | 0 mirrored issues and 0 webhook audit receipts.                                                                                                                                                                                                                            | Sentry webhook delivery and signing-secret validation still required.                |
| Evidence completeness | 14 seeded pipelines render; `alert.route_health` and `sentry.webhook` remain `unknown`, and `error.log.writes` is `silent`.                                                                                                                                                | Empty states are visible and honest; no deployment fix required.                     |
| Backups               | One deploy-captured `pg_dump` backup is present; local storage only, integrity not recorded, 0 offsite replication rows, 0 restore drills.                                                                                                                                 | Backup capture works; offsite metadata and a real recorded drill are still required. |
| Production UI smoke   | `/en/admin`, `/en/admin/readiness`, `/en/admin/alerts/routes`, `/en/admin/alerts/escalation`, `/en/admin/alerts/route-health`, `/en/admin/sentry`, `/en/admin/evidence-completeness`, and `/en/admin/backups` rendered without application errors after live data settled. | UI paths continue to handle empty operational state.                                 |

Provisioning remains blocked until Ram supplies or confirms:

1. Real email operator destination plus a distinct email sink destination.
2. Real urgent-route destination plus a distinct urgent sink destination.
3. Permission to send live synthetic test alerts to those destinations.
4. Sentry project/admin access or confirmation that the webhook URL and signing
   secret have been configured through the normal production secret process.
5. Read-only offsite backup metadata source and permission to record its
   evidence.
6. Completed restore-drill evidence before any drill record is created.

## Commits / CI / Notes

- Operational closeout documentation: this docs closeout commit (`docs(platform): close out layer 5 readiness`).
- CI/deploy: documentation-only closeout commit pushed through the standard `main` workflow.
- Production smoke on 2026-05-18 confirmed `/en/admin`, `/en/admin/readiness`, `/en/admin/alerts/routes`, `/en/admin/alerts/escalation`, `/en/admin/sentry`, `/en/admin/evidence-completeness`, and `/en/admin/backups` render without application errors.
- Static scan on 2026-05-18 found no AI or repo-access imports/calls under `apps/api/src/modules/platform-resilience/**`.
- External provisioning follow-up on 2026-05-18 confirmed the same readiness gaps from live data, verified no Layer 5 resilience code calls AI via `synthetic-no-ai-import.spec.ts`, and made no production provisioning changes because no real external-service/operator destinations or live-test approval were supplied.

---

## 12. How Layer 5 Connects to Layer 4 (Without Making AI Always-On)

This is called out separately because it is the most likely place for scope creep.

**Allowed connections** (one-way, operator-initiated):

1. Sentry issue card → "Explain with Copilot" button → calls `POST /v1/admin/sentry/issues/:id/explain` → routes to Layer 4B's existing endpoint with a pre-loaded evidence bundle. **The button does nothing until clicked.**
2. Sentry issue card → "Generate repo-agent handoff" button → calls `POST /v1/admin/sentry/issues/:id/generate-handoff` → reuses Layer 4D's prompt generator with Sentry context appended.
3. Sentry issue card → "Prepare Sentry triage prompt" button → renders the existing `docs/runbooks/agent-sentry-triage.md` workflow with the Sentry issue id pre-filled. The operator copies the prompt and runs it in their repo agent terminal. The admin console does not execute it.
4. Failed synthetic check card → "Explain with Copilot" button → same pattern (pre-load evidence: the failed check + correlated health snapshot + recent deploy events).
5. Stale-pipeline card (5D) → "Explain with Copilot" button → pre-loads the lagging pipeline's recent samples and the operator-side pipeline definition.

**Forbidden connections** (would break the manual-only constraint):

- ❌ Any background job that calls `PlatformAiCopilotService.sendMessage()` or `RecommendationGenerationService.generateForEvidence()` on its own.
- ❌ Any cron that asks "should the Copilot have something to say about this?" and pre-generates a recommendation.
- ❌ Any escalation step that auto-triggers a Copilot Explain "in case the operator wants context when they wake up".
- ❌ Any Sentry webhook handler that auto-runs the repo-agent workflow.
- ❌ Any synthetic-check failure that auto-creates a recommendation or proposal.
- ❌ Any readiness-score input that calls a model.

The static-analysis guard (§9) enforces (1)–(6) by import check. Code review enforces the rest.

---

## 13. Out of Scope (Deferred)

The following are intentionally **not** in Layer 5 to keep scope honest:

- **Public status page for tenants/parents.** The operator can copy text from the readiness panel into a Telegram channel manually. A real customer-facing status page (Statuspage.io style) is a separate Layer 6 candidate when the user count justifies it.
- **Auto-restore execution.** Layer 5 surfaces backup readiness; it never restores. A separate, single-purpose runbook with very different safety requirements would own that.
- **Synthetic checks for the school-facing parent UX in production.** The synthetic checks run against staging-like accounts in production tenants. They do not exercise live parent accounts (no impersonation in synthetic flows). A future Layer adds shadow-account journeys with explicit consent.
- **Multi-region failover signalling.** EduPod is single-region today. When a second region exists, the readiness score gains a region-failover-readiness dimension; out of scope for this layer.
- **Scheduled chaos / fault injection.** Useful eventually but separate from monitoring.
- **AI-driven anomaly detection on synthetic results.** Trend visibility is enough for the solo phase. If anomaly detection ever lands, it must be operator-invoked (a button), not automatic.
