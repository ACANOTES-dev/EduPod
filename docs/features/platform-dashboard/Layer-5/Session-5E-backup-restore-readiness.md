# Session 5E: Backup / Restore Readiness Panel

**Depends on:** Layer 1.5A (RBAC) + Layer 1.5B (audit ledger) + Layer 1.5C (owner confirmation primitive — used only for **deleting** drill records, not restores) + Layer 5B (alerting) + existing `scripts/deploy-production.sh` pg_dump backup step + existing `docs/runbooks/recovery-drills.md`. Independent of 5A/5C inputs.
**Unlocks:** 5F (backup readiness is a readiness dimension).

---

## Objective

Surface backup and restore evidence inside the dashboard so the operator can answer "if production blew up right now, can I restore?" before the incident, not during it. Specifically, this session ships:

1. **`platform_backup_runs`** — per-backup record (kind, started_at, finished_at, size_bytes, location, success, integrity_check_passed) populated by an existing CI/cron backup step (extended to POST to a new internal endpoint, mirroring 4A's deploy-event capture).
2. **`platform_offsite_replications`** — per-replication snapshot (target, snapshot_id, replicated_at, lag_seconds) populated by polling S3 / object storage for the replicated artefacts and computing lag against the source backup.
3. **`platform_restore_drills`** — operator-recorded restore-drill results (drill_at, performed_by, restore_point, success, notes, evidence_url) — entered manually after the operator runs the existing `docs/runbooks/recovery-drills.md` workflow.
4. **`BackupReadinessService`** — runs every 15 minutes; computes age of last successful backup, replication lag, drill age; emits alerts on threshold breaches.
5. **A consolidated UI** at `/admin/backups` that shows the backup readiness summary at a glance.
6. **Deep links to runbooks** — every panel cross-links to `docs/runbooks/recovery-drills.md` and the deployment runbook so the operator never has to search for "how do I restore?".

After this session, the operator never has to grep server logs to find "when was the last backup?" The page answers the question in one screen.

---

## Critical Safety Constraints

- **No-AI guard.** No LLM imports in this module. Backup/restore is too high-stakes to surface AI suggestions; the operator owns the decisions.
- **No restore execution from this layer.** The dashboard NEVER triggers a restore. The "Record drill" button is a paper-form-style operator entry: it accepts a record of a drill the operator already performed via the runbook. There is no `POST /v1/admin/backups/restore-now` and there will not be one in this layer.
- **Evidence is read-only by default.** `POST /restore-drills` accepts new entries; PATCH/DELETE on drill records is gated by Layer 1.5C owner confirmation (cosmetic edits to drill notes are fine; deleting a drill record is suspicious and requires confirmation).
- **No write access to backup storage.** This layer reads object metadata (S3 LIST + HEAD) but never writes, deletes, or moves backup artefacts. The operator's existing backup script owns the write path.
- **Backup capture endpoint is internal-token-gated.** Mirrors the 4A `_internal/deploy-events` pattern: `POST /v1/admin/_internal/backup-events` requires `X-Internal-Token` env-bound shared secret. Not JWT-gated. The deploy script POSTs to this endpoint after a successful backup. If the POST fails, the deploy doesn't fail (best-effort capture, just like 4A).
- **No autonomous remediation.** When a backup is overdue, this layer fires a critical alert. It does NOT auto-trigger a manual backup or auto-rotate credentials. The operator decides.
- **Integrity-check status is recorded, not interpreted.** If the backup script reports `integrity_check_passed: false`, the dashboard shows a red flag and an alert. It does not analyse the backup content or attempt to repair it.
- **Replication-lag computation is deterministic.** `lag_seconds = max(replicated_at) - max(backup.finished_at)`. If the replicated snapshot is newer than the source backup record (e.g., source not yet captured but replication ran), `lag_seconds = 0` and the freshness check uses replication time as the readiness anchor.

---

## Database

```prisma
model PlatformBackupRun {
  id                       String                       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  backup_key               String                       @unique @db.VarChar(160)      // idempotency key — see UPSERT semantics below
  kind                     BackupRunKind
  status                   BackupRunStatus
  started_at               DateTime                     @db.Timestamptz()
  finished_at              DateTime?                    @db.Timestamptz()
  duration_seconds         Int?
  size_bytes               BigInt?
  location                 String                       @db.VarChar(500)              // 'local:/var/backups/edupod-2026-05-16.dump' OR 's3://edupod-backups/...'
  storage_kind             String                       @db.VarChar(40)               // 'local' | 's3' | 'hetzner_storage_box'
  integrity_check_passed   Boolean?                                                   // null = not yet checked
  integrity_check_at       DateTime?                    @db.Timestamptz()
  integrity_check_detail   Json?                        @db.JsonB
  trigger_source           String                       @db.VarChar(40)               // 'deploy_pipeline' | 'cron' | 'manual'
  triggered_by_user_id     String?                      @db.Uuid
  failure_reason           String?                      @db.Text
  deploy_event_id          String?                      @db.Uuid                      // FK to platform_deploy_events when triggered by deploy
  created_at               DateTime                     @default(now()) @db.Timestamptz()
  updated_at               DateTime                     @updatedAt @db.Timestamptz()

  deploy_event             PlatformDeployEvent?         @relation(fields: [deploy_event_id], references: [id], onDelete: SetNull)
  replications             PlatformOffsiteReplication[]

  @@map("platform_backup_runs")
  @@index([finished_at(sort: Desc)])
  @@index([status, finished_at(sort: Desc)])
  @@index([kind, finished_at(sort: Desc)])
}

// backup_key is the idempotency key. Computed by the caller as:
//   sha256(`${storage_kind}|${location}|${finished_at_iso}|${size_bytes}`).slice(0, 32)
// — when the deploy script retries the POST, when the polling-fallback scan re-discovers the same backup,
//   and when manual entries reference an already-captured backup, the unique constraint causes UPSERT
//   to update the existing row instead of inserting a duplicate.
// If finished_at or size_bytes is unknown at first POST (status='in_progress'), the caller may pass a
// pre-finalisation key like `provisional|${storage_kind}|${location}|${started_at_iso}` and update on
// completion.

enum BackupRunKind {
  full
  incremental
  pg_dump
  snapshot
}

enum BackupRunStatus {
  succeeded
  failed
  partial
  verifying
}

model PlatformOffsiteReplication {
  id                       String                       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  source_backup_id         String?                      @db.Uuid
  replication_target       String                       @db.VarChar(120)              // 's3://edupod-backups-eu' | 'hetzner_box_replica' | etc.
  snapshot_id              String                       @db.VarChar(255)              // remote object key/id
  replicated_at            DateTime                     @db.Timestamptz()
  size_bytes               BigInt?
  lag_seconds              Int?                                                       // computed at insert time from source backup finished_at
  integrity_verified       Boolean                      @default(false)
  detected_at              DateTime                     @default(now()) @db.Timestamptz()

  source_backup            PlatformBackupRun?           @relation(fields: [source_backup_id], references: [id], onDelete: SetNull)

  @@map("platform_offsite_replications")
  @@index([replication_target, replicated_at(sort: Desc)])
  @@index([source_backup_id])
}

model PlatformRestoreDrill {
  id                       String                       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  drill_at                 DateTime                     @db.Timestamptz()
  performed_by_user_id     String                       @db.Uuid
  restore_point            String                       @db.VarChar(255)              // identifier for the backup that was restored
  outcome                  RestoreDrillOutcome
  duration_seconds         Int?                                                       // wall-clock from start to verified restore
  rpo_observed_seconds     Int?                                                       // observed Recovery Point Objective
  rto_observed_seconds     Int?                                                       // observed Recovery Time Objective
  notes                    String?                      @db.Text
  evidence_url             String?                      @db.VarChar(500)              // link to terminal log gist / screenshot / etc.
  follow_ups               Json?                        @db.JsonB                     // operator-noted follow-up items
  recorded_at              DateTime                     @default(now()) @db.Timestamptz()

  @@map("platform_restore_drills")
  @@index([drill_at(sort: Desc)])
  @@index([outcome])
}

enum RestoreDrillOutcome {
  passed
  failed_recoverable
  failed_blocking
  inconclusive
}
```

All three tables platform-scoped; no `tenant_id`, no RLS.

---

## API + Service Layer

### `BackupCaptureController` (internal)

```ts
@Controller('v1/admin/_internal/backup-events')
export class BackupCaptureController {
  // POST /v1/admin/_internal/backup-events
  // Public; X-Internal-Token gated. Idempotent — same backup_key returns the existing row.
  @Post()
  async capture(@Headers('x-internal-token') token: string, @Body() body: CaptureBackupEventDto): Promise<{ id: string; created: boolean }>;
}
```

The handler:

1. Validates token + Zod-parses the body.
2. Computes `backup_key` if not provided by caller: `sha256(`${storage_kind}|${location}|${finished_at_iso ?? started_at_iso}|${size_bytes ?? 'unknown'}`).slice(0, 32)`.
3. **UPSERT** by `backup_key`: if the row exists, update mutable fields (status, finished*at, integrity_check*\*, failure_reason); if not, insert. Returns `{ id, created: bool }`.
4. Writes a `platform_audit_logs` entry (action: `backup.captured` | `backup.updated`).

The `scripts/deploy-production.sh` backup step (existing) is extended in this session to POST after a successful pg_dump. The script can include `backup_key` explicitly OR let the API compute it; the script also retries safely (idempotent endpoint):

```bash
curl -fsS -X POST "$INTERNAL_API/v1/admin/_internal/backup-events" \
  -H "X-Internal-Token: $INTERNAL_TOKEN" \
  -H "Content-Type: application/json" \
  --retry 3 --retry-delay 5 \
  -d "$(jq -n --arg sha "$DEPLOY_SHA" --arg loc "$BACKUP_LOCATION" --arg size "$BACKUP_SIZE" \
        '{kind: "pg_dump", status: "succeeded", started_at: $STARTED_AT, finished_at: $FINISHED_AT, location: $loc, size_bytes: ($size | tonumber), storage_kind: "local", trigger_source: "deploy_pipeline"}')" \
  || echo "warn: backup-event capture failed (non-fatal)"
```

Best-effort: if the POST fails after retries, the backup is still on disk; capture is backfilled by the polling fallback (see below). Because the endpoint is idempotent on `backup_key`, neither the deploy retries nor the fallback can produce duplicate rows for the same physical backup artifact.

### `OffsiteReplicationPollerService`

```ts
@Injectable()
export class OffsiteReplicationPollerService {
  /** Runs every 15 minutes. Lists object storage targets, upserts platform_offsite_replications. */
  async poll(): Promise<void>;
}
```

For each configured replication target (env-driven list):

1. List remote objects matching the backup naming convention.
2. For each new object: HEAD for size + last-modified, upsert `platform_offsite_replications` row.
3. Compute `lag_seconds` against the source backup if matching by SHA in the object key.

### `BackupReadinessService`

```ts
@Injectable()
export class BackupReadinessService {
  /** Computes the readiness summary on demand (used by GET /readiness + /readiness-score). */
  async getReadinessSummary(): Promise<BackupReadinessSummary>;

  /** Runs every 15 minutes via NestJS scheduler. Emits alerts on SLO breach. */
  async checkAndAlert(): Promise<void>;
}

type BackupReadinessSummary = {
  last_successful_backup: {
    id: string;
    finished_at: string;
    kind: BackupRunKind;
    size_bytes: number;
    age_seconds: number;
  } | null;
  last_offsite_replication: {
    id: string;
    replication_target: string;
    replicated_at: string;
    lag_seconds: number;
    age_seconds: number;
  } | null;
  restore_point_age_seconds: number | null; // age of the youngest restore-anchor we could roll forward to
  last_restore_drill: {
    id: string;
    drill_at: string;
    outcome: RestoreDrillOutcome;
    age_seconds: number;
  } | null;
  overall_status: 'green' | 'amber' | 'red';
  reasons: string[]; // human-readable: 'Last backup is 32h old (SLO 25h)'
};
```

SLOs (operator-tunable via env or a future settings table; defaults below):

| Metric                            | Amber threshold        | Red threshold |
| --------------------------------- | ---------------------- | ------------- |
| Last successful backup age        | 25h                    | 36h           |
| Replication lag                   | 6h                     | 24h           |
| Restore drill age                 | 90 days                | 180 days      |
| Last drill outcome                | `inconclusive`         | `failed_*`    |
| Integrity check missing on latest | 1h after `finished_at` | 24h           |

### Endpoints

```
GET    /v1/admin/backups/readiness                   @RequiresPlatformPermission('platform.backups.view')
GET    /v1/admin/backups/runs                        @RequiresPlatformPermission('platform.backups.view')
GET    /v1/admin/backups/runs/:id                    @RequiresPlatformPermission('platform.backups.view')
GET    /v1/admin/backups/replications                @RequiresPlatformPermission('platform.backups.view')
GET    /v1/admin/backups/restore-drills              @RequiresPlatformPermission('platform.backups.view')
POST   /v1/admin/backups/restore-drills              @RequiresPlatformPermission('platform.backups.record_drill')
PATCH  /v1/admin/backups/restore-drills/:id          @RequiresPlatformPermission('platform.backups.record_drill')
DELETE /v1/admin/backups/restore-drills/:id          @RequiresPlatformPermission('platform.backups.manage') + owner_confirmation_id (Layer 1.5C)
POST   /v1/admin/_internal/backup-events             X-Internal-Token gated; not JWT
```

New permission keys (seeded in 1.5A's catalogue update):

- `platform.backups.view`
- `platform.backups.record_drill`
- `platform.backups.manage`

`platform_owner` gets all three; `platform_support` gets `view` + `record_drill`.

---

## Frontend

### `/admin/backups`

Top: `<BackupReadinessSummary>` — three big cards:

- **Last backup** — green if < 25h, amber 25-36h, red > 36h. Shows kind, size, finished_at relative ("3h ago").
- **Offsite replication** — green if lag < 6h, amber 6-24h, red > 24h.
- **Restore drill** — green if drill < 90 days, amber 90-180, red > 180. Shows outcome of last drill.

Below: tabs.

- **Runs** — `platform_backup_runs` table, paginated. Columns: kind, status, finished_at, size, duration, integrity, deploy link. Failed runs surfaced at the top.
- **Replications** — `platform_offsite_replications` table. Columns: target, snapshot id, replicated_at, lag, integrity verified.
- **Restore drills** — `platform_restore_drills` cards. Each card: outcome pill, drill_at, performed_by, restore point, RPO/RTO, notes, evidence link. Big "Record new drill" button at top (opens modal).

### `<RecordRestoreDrillDialog>`

Form (react-hook-form + Zod):

- Drill date/time (defaults to now)
- Restore point (free text — operator pastes the backup id or filename they restored from)
- Outcome (radio)
- Duration seconds (optional)
- Observed RPO / RTO (optional)
- Notes (multiline)
- Evidence URL (optional — gist / screenshot link)
- Follow-up items (repeatable text input)

On submit: POST `/restore-drills`; audit-log entry: `backup.restore_drill_recorded`. On success: refresh page, drill appears in the list with green badge.

### Components

- `BackupReadinessSummary`, `BackupRunRow`, `ReplicationRow`, `RestoreDrillCard`, `RecordRestoreDrillDialog`, `IntegrityBadge`, `BackupSloBanner` (in `/admin/readiness` and dashboard home — pulled in by 5F).

### Cross-links to runbooks

Every panel renders a small "📘 How to restore" link that opens `docs/runbooks/recovery-drills.md` (via `/admin/runbooks?key=recovery-drills`). The "Record new drill" dialog header includes "Run the procedure in `docs/runbooks/recovery-drills.md` first, then record the result here."

---

## Alerting Behaviour

| Event                                                      | Severity   | Routed Through         |
| ---------------------------------------------------------- | ---------- | ---------------------- |
| Last successful backup age > 25h (default amber threshold) | `warning`  | Default route (5B)     |
| Last successful backup age > 36h (default red threshold)   | `critical` | Escalation policy (5B) |
| Replication lag > 6h                                       | `warning`  | Default route          |
| Replication lag > 24h                                      | `critical` | Escalation policy      |
| Restore drill age > 90 days                                | `warning`  | Default route          |
| Restore drill age > 180 days                               | `critical` | Escalation policy      |
| Last drill outcome = `failed_blocking`                     | `critical` | Escalation policy      |
| Last drill outcome = `failed_recoverable`                  | `warning`  | Default route          |
| Backup status `failed` for the most recent run             | `critical` | Escalation policy      |
| Integrity check missing > 1h after `finished_at`           | `warning`  | Default route          |
| Integrity check `integrity_check_passed = false`           | `critical` | Escalation policy      |
| Replication target unreachable for 3 consecutive polls     | `warning`  | Default route          |

All alerts respect Layer 1.5C maintenance windows for `warning` severity; `critical` backup/restore alerts are NOT maintenance-suppressible (a backup not running during maintenance is itself an incident — the operator should not silence these).

---

## Tests

### Unit

- `backup-capture.controller.spec.ts` — happy-path with valid token; missing/invalid token → 401; malformed body → 422; idempotent re-POST with same `backup_key` returns `{ id: <same>, created: false }` and updates mutable fields without inserting a duplicate.
- `backup-key-derivation.spec.ts` — given `(storage_kind, location, finished_at, size_bytes)`, the derived key is deterministic and stable; truncated to 32 chars; collisions improbable for realistic backup paths.
- `offsite-replication-poller.service.spec.ts` — mock S3 list/head; computes lag against source backup; idempotent re-run.
- `backup-readiness.service.spec.ts` — given fixture rows, returns the correct summary; thresholds applied; reasons enumerated.
- `record-restore-drill.service.spec.ts` — outcome enum enforced; required fields validated; audit entry created.
- `delete-drill-requires-owner-confirmation.spec.ts` — DELETE without `owner_confirmation_id` returns 403; with valid confirmation succeeds.
- `backup-no-anthropic.spec.ts` — static analysis: no LLM imports.

### Integration

- `backup-capture-end-to-end.e2e.ts` — POST a backup event with valid token → `platform_backup_runs` row created with `created: true`. POST the same payload again → returns `created: false`, same id, no duplicate row. POST again with `status: 'succeeded'` overriding initial `in_progress` → row updated, audit entry recorded.
- `polling-fallback-no-duplicate.e2e.ts` — deploy-pipeline POST succeeds, then 6h-later polling fallback discovers the same backup file → fallback uses the same `backup_key` derivation and the upsert leaves the row as-is (no duplicate).
- `replication-poll-end-to-end.e2e.ts` — mock S3 with one new object → row created with computed lag.
- `slo-breach-alert.e2e.ts` — fixture with last backup 26h old → `warning` alert; 37h → `critical`.
- `restore-drill-flow.e2e.ts` — operator opens dialog, submits, drill appears, audit entry recorded.

---

## Acceptance

- [x] All three new tables exist; migration applies cleanly.
- [x] `platform_backup_runs.backup_key` is `UNIQUE NOT NULL`; UPSERT semantics verified.
- [x] `BackupCaptureController` accepts internal-token POSTs; idempotent on `backup_key`; deploy script extended to call it with `--retry 3`.
- [x] `OffsiteReplicationPollerService` runs every 15 min; populates `platform_offsite_replications`.
- [x] `BackupReadinessService` computes summary and emits alerts on threshold breach.
- [x] `/admin/backups` page renders summary + three tabs with real data.
- [x] `<RecordRestoreDrillDialog>` works end-to-end; drill recorded; audit-log entry written.
- [x] DELETE on drill record requires Layer 1.5C owner confirmation.
- [x] No restore-execution endpoint exists in this layer (verified by route inventory test).
- [x] No-AI guard test passes.
- [x] Cross-links to `docs/runbooks/recovery-drills.md` rendered in all relevant places.
- [x] All new code passes `turbo lint` + `turbo type-check`; no regressions.

---

## Commits / CI / Notes

- Implementation commit: `4e9a6f79 feat(platform): add backup readiness monitoring`.
- CI/deploy: GitHub Actions run `26005024313` completed green and deployed through the production workflow.
- Local verification included Prisma validation, focused backend/frontend type-checks and lint, API DI compilation, targeted backup/readiness/evidence tests, no-AI static guard, deploy-script syntax check, full `pnpm test`, and full `pnpm validate:ci`.
- Production smoke on `https://dua.edupod.app` verified platform-admin login, `/en/admin/backups`, the 5E readiness/runs/replications/drills API calls, and existing `/en/admin/health` plus `/en/admin/alerts` regressions.
- Production currently has no captured 5E backup, replication, or restore-drill rows, so backup readiness correctly starts red with empty-evidence reasons. The first post-5E non-doc deployment can now capture backup evidence because the internal endpoint and deploy-script POST are live; offsite replication still depends on storage metadata configuration, and restore-drill readiness depends on a human-recorded drill.
- The 5D evidence pipelines now include `backup.capture` and `backup.readiness.computed` timestamp sources.
- Generated next-session prompt is below.

```text
Implement Session 5F of the Platform Admin Dashboard build. Server access granted for diagnostics.

Spec:
docs/features/platform-dashboard/Layer-5/Layer-5-Plan.md
docs/features/platform-dashboard/Layer-5/Session-5F-readiness-score-ops-confidence.md

Context:
- Sessions 0 through 5E are complete, deployed, smoke-tested, and accepted for code delivery.
- Session 5A shipped synthetic journey monitoring, external dependency/certificate surfaces, synthetic result history, alert emission, and no-AI guarantees.
- Session 5B shipped deterministic alert routing and escalation models, route health checks, acknowledgement flows, emergency contact profile UI, quiet-hours evaluation, dead-man sink separation, surviving-route dispatch, rate-limited synthetic test alerts, and no-AI guarantees.
- Session 5C shipped signed Sentry webhook intake, redacted Sentry issue mirrors, hourly event summaries, webhook audit receipts, replay protection, error-log cross-links, Layer 4 operator-clicked Sentry actions, static triage prompt preparation, and no-AI webhook/background guarantees.
- Session 5D shipped evidence completeness monitoring, 14 canonical evidence pipelines, seeded-pipeline deletion protection, pinned query kinds, NestJS scheduled freshness checks, BullMQ and Redis pub/sub heartbeat bridges, UptimeRobot reconciliation, shell silent-pipeline banner, Copilot freshness indicator, and no-AI freshness/background guarantees.
- Session 5E shipped backup/restore readiness models, internal-token backup evidence capture, deploy-script best-effort backup POST, deterministic backup idempotency, read-only offsite replication metadata polling, manual restore-drill API/UI, owner-confirmed destructive drill changes, scheduled backup readiness computation/alert transitions, 5D backup evidence timestamps, `/admin/backups`, and no-AI backup/background guarantees.
- Production currently has zero alert channels/routes/escalation policies configured; do not assume real urgent routes exist until operator/sink destinations are provisioned.
- Production currently has no mirrored Sentry issues or webhook receipts; treat Sentry freshness as unknown or empty until Sentry webhook delivery is provisioned.
- Production currently has one real silent evidence signal, error.log.writes, because platform_error_log is quiet beyond its 12-hour threshold; do not treat that as a 5D deployment failure.
- Production backup readiness currently starts red/empty until at least one post-5E non-doc deploy captures backup evidence, offsite metadata is configured, and a restore drill is recorded; do not treat that initial empty state as a 5E deployment failure.
- Layer 5 monitoring/background/readiness work must not call AI.
- Platform admin host: https://dua.edupod.app
- Credentials are stored locally at /Users/ram/.codex/secrets/edupod-platform-admin.env
- Do not print, commit, log, or screenshot secrets.
- Deploy through CI only by pushing to origin main.

Before coding:
1. Read AGENTS.md.
2. Read docs/plans/context.md.
3. Read docs/plans/ux-redesign-final-spec.md.
4. Read Layer 1, Layer 1.5, Layer 2, Layer 3, Layer 4, and Layer 5 plans.
5. Read Session 4A, 4B, 4C, 4D, 4E, 5A, 5B, 5C, 5D, and 5E closeout notes.
6. Read Session 5F / Readiness Score / Ops Confidence end-to-end.
7. Inspect existing 5A-5E services, alert routing hooks, maintenance-window suppression, evidence freshness seeded pipelines, backup readiness summary, deploy event freshness, alert history/unresolved critical incident surfaces, Platform Admin shell/dashboard conventions, owner-confirmation primitive, audit ledger, and score/trend UI patterns before designing anything new.
8. Load backend, frontend, prisma, testing, worker, code-quality, architecture-policing, feature-map-maintenance, and pre-launch-tracking rules as relevant.

Implementation requirements:
- Stay strictly within Session 5F.
- Readiness score, snapshot, live evaluation, background, and dashboard code must be non-AI.
- Add the 5F readiness score models/enums/API contracts and default dimension weights.
- Implement deterministic ReadinessScoreService aggregation over explicitly enumerated dimensions only; missing dimension data must score as 0, not be skipped.
- Implement live evaluation on a NestJS scheduled task every 5 minutes; compute in memory, debounce threshold crossings across two consecutive evaluations, and do not write snapshot rows from the live path.
- Implement daily snapshot on a NestJS scheduled task at 00:05 UTC; persist one score snapshot with breakdown, reasons, and weights snapshot; daily snapshots must not fire alerts.
- Emit warning/critical/recovery alerts through existing routing hooks on debounced live threshold transitions only, respecting maintenance-window rules from the spec.
- Add dimension weight read/update APIs, audit logging, and owner-confirmation gating for large weight changes.
- Add `/admin/readiness` and the dashboard-home readiness hero card; include breakdown, 90-day trend, weight editor for platform owners, and clear disabled/missing data states.
- Seed `platform.readiness.view` and `platform.readiness.manage` permissions with the role grants specified by the session.
- Preserve Platform Admin behavior through 5E.

Verification:
- Run targeted backend/frontend checks, type-check, lint, Prisma validation, and relevant tests.
- Verify no 5F scheduled/background/score/snapshot/dashboard code imports or calls AI services.
- Verify deterministic score computation, dimension mapping, weight normalization, missing-data penalty, live-vs-snapshot separation, debounce behavior, alert transitions, audit logging, owner-confirmed large weight changes, and dashboard rendering.
- Verify `/admin/readiness` and the dashboard hero in production.
- Verify existing Platform Admin regressions.

Deployment:
- Commit to main and push to origin main only.
- Watch GitHub Actions.
- Fix forward if CI fails.
- Production smoke on https://dua.edupod.app after green deploy.

Completion:
- Tick the Session 5F acceptance criteria after green CI and production smoke.
- Add "Commits / CI / Notes" to the relevant Layer 5 session documentation.
- Generate the prompt for the next implementation session in this same style.
  Include this same instruction that the next agent should generate the following prompt when it finishes.
- Final response should say whether Session 5F is complete and whether the repo is ready for next work.
- Final response should include the generated next-session prompt.
```

---

## Notes / Risks

- **Backup script extension shipped.** This session includes the receiving endpoint, the polling service, the UI, and the `scripts/deploy-production.sh` best-effort POST after pg_dump. The deployment that introduced the endpoint could not capture its own pre-deploy backup because the API route was not live yet; subsequent non-doc deployments can populate `platform_backup_runs`.
- **Replication polling is metadata-only.** The poller lists and heads configured object-storage targets, then upserts `platform_offsite_replications`. It does not write, delete, move, or restore backup artefacts.
- **RPO / RTO observed values are operator-entered.** This session does not measure them; it just records what the operator observed during the drill. A future session could automate measurement using a dedicated drill environment.
- **The "amber 25h backup" default is ONE hour past the 24h cadence.** Operators don't get paged for a 5-minute backup delay. Tune lower if backups become more frequent than daily.
- **Restore drills must be recorded by a human.** No automated drill execution. The reason: a real restore drill includes operator judgement (e.g., "I noticed the post-restore RLS policies were missing on three tables and had to manually run `post_migrate.sql` — added to follow-ups"). Software cannot capture that.
- **Connection to Layer 4 (allowed):** Backup readiness summary is a valid Layer 4 evidence kind (`backup_readiness`). Layer 4B can cite it ("the most recent restore drill was 192 days ago, exceeding the 180-day threshold [E:backup-readiness-current]"). The `/admin/backups` page renders `<ExplainButton>` if Layer 4 is deployed.
- **Connection to Layer 4 (forbidden):** No autonomous AI-generated "you should run a backup now" recommendations. Recommendations are manual via Layer 4C and only when the operator explicitly clicks Generate Recommendation on the backups page.
- **Risk: drill spam.** A bored operator could record fake drills to inflate readiness. Mitigation: drill records show `performed_by` and `evidence_url`; an audit reviewer (operator owner role) can spot patterns. Real-world solo-operator risk is low.
- **Risk: silent capture failure.** If the deploy script silently stops POSTing, the backups appear stale even when they're running. Mitigation: 5D's evidence-completeness pipeline includes `backup.capture` (separate from `backup.run`) — if `platform_backup_runs` insertion goes silent, freshness alerts independently of the SLO breach.
