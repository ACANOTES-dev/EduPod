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

The `scripts/deploy-production.sh` backup step (existing) is extended (separate patch outside this session, but called out as a prerequisite gap) to POST after a successful pg_dump. The script can include `backup_key` explicitly OR let the API compute it; the script also retries safely (idempotent endpoint):

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

- [ ] All three new tables exist; migration applies cleanly.
- [ ] `platform_backup_runs.backup_key` is `UNIQUE NOT NULL`; UPSERT semantics verified.
- [ ] `BackupCaptureController` accepts internal-token POSTs; idempotent on `backup_key`; deploy script extended (separate patch) to call it with `--retry 3`.
- [ ] `OffsiteReplicationPollerService` runs every 15 min; populates `platform_offsite_replications`.
- [ ] `BackupReadinessService` computes summary and emits alerts on threshold breach.
- [ ] `/admin/backups` page renders summary + three tabs with real data.
- [ ] `<RecordRestoreDrillDialog>` works end-to-end; drill recorded; audit-log entry written.
- [ ] DELETE on drill record requires Layer 1.5C owner confirmation.
- [ ] No restore-execution endpoint exists in this layer (verified by route inventory test).
- [ ] No-AI guard test passes.
- [ ] Cross-links to `docs/runbooks/recovery-drills.md` rendered in all relevant places.
- [ ] All new code passes `turbo lint` + `turbo type-check`; no regressions.

---

## Notes / Risks

- **Backup script extension is a prerequisite gap.** This session ships the receiving endpoint, the polling service, and the UI — but the existing `scripts/deploy-production.sh` must be patched separately (one-line `curl` after pg_dump) to actually populate `platform_backup_runs`. Document in the session prompt; coordinate with deploy-pipeline owner. If the patch is delayed, the table stays empty and the readiness summary correctly shows red — surfacing the gap rather than hiding it.
- **The polling-only fallback.** If the deploy script never POSTs, there's a fallback: a cron (every 6 hours) scans the backup directory + S3 listing, derives `backup_key` from each artefact's metadata using the same formula the deploy script uses, and **upserts** retroactive rows via the same internal endpoint. Because both paths use the same `backup_key` derivation, deploy POST + fallback scan never produce duplicates. The fallback runs every 6 hours, not every minute, to avoid thrash; document the latency expectation in `docs/runbooks/recovery-drills.md`.
- **RPO / RTO observed values are operator-entered.** This session does not measure them; it just records what the operator observed during the drill. A future session could automate measurement using a dedicated drill environment.
- **The "amber 25h backup" default is ONE hour past the 24h cadence.** Operators don't get paged for a 5-minute backup delay. Tune lower if backups become more frequent than daily.
- **Restore drills must be recorded by a human.** No automated drill execution. The reason: a real restore drill includes operator judgement (e.g., "I noticed the post-restore RLS policies were missing on three tables and had to manually run `post_migrate.sql` — added to follow-ups"). Software cannot capture that.
- **Connection to Layer 4 (allowed):** Backup readiness summary is a valid Layer 4 evidence kind (`backup_readiness`). Layer 4B can cite it ("the most recent restore drill was 192 days ago, exceeding the 180-day threshold [E:backup-readiness-current]"). The `/admin/backups` page renders `<ExplainButton>` if Layer 4 is deployed.
- **Connection to Layer 4 (forbidden):** No autonomous AI-generated "you should run a backup now" recommendations. Recommendations are manual via Layer 4C and only when the operator explicitly clicks Generate Recommendation on the backups page.
- **Risk: drill spam.** A bored operator could record fake drills to inflate readiness. Mitigation: drill records show `performed_by` and `evidence_url`; an audit reviewer (operator owner role) can spot patterns. Real-world solo-operator risk is low.
- **Risk: silent capture failure.** If the deploy script silently stops POSTing, the backups appear stale even when they're running. Mitigation: 5D's evidence-completeness pipeline includes `backup.capture` (separate from `backup.run`) — if `platform_backup_runs` insertion goes silent, freshness alerts independently of the SLO breach.
