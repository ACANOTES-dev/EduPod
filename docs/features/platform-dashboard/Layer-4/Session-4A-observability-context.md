# Session 4A: Observability Context Layer

**Depends on:** Layer 1 + 1.5 + 2 shipped (this session is the entry point to Layer 4)
**Unlocks:** All subsequent Layer 4 sessions (4B/4C/4D/4E all consume from the evidence sources this session establishes)

---

## Objective

Build the **evidence base** that Layer 4's AI Copilot reads from. Without this, Layer 4 is impossible — the AI would either hallucinate (no grounded data) or be useless (data exists in a hundred places that the AI can't aggregate). This session ships:

1. **Correlation ID middleware** — every request entering the API gets a `correlation_id` header (or generates one). The id propagates to every log line, every queue job enqueued by the request, every WebSocket event, every error captured. The browser also includes the id on follow-up requests for that user session.

2. **Deploy event capture** — every CI deploy writes a row to `platform_deploy_events` with SHA, timestamp, migration_version, deploy_run_url, success/failure. Consumed by Layer 4 to answer "what changed before this started?"

3. **Machine-readable runbook index** — `docs/runbooks/*.md` files gain YAML front-matter declaring which alerts/errors/components they apply to. A daily non-AI cron parses the front-matter into `platform_runbook_index`. Layer 4B uses this to surface the right runbook when the operator asks about an alert/error.

4. **Service topology map** — a machine-readable dependency map showing which services, queues, modules, and infrastructure dependencies affect which product areas. Without this, the AI can summarize symptoms but cannot reason about blast radius.

5. **Severity policy matrix** — an operator-owned policy table that helps classify "noisy but tolerable" versus "user-impacting" incidents by component, tenant scope, queue depth, error rate, and affected product area.

6. **Aggregated evidence service** — a single `PlatformEvidenceService` that the AI prompt construction layer (4B) calls to assemble structured evidence from health snapshots, alert history, error fingerprints, queue state, audit entries, deploy events, module toggles, runbooks, service topology, and severity policies — keyed by correlation id, time window, tenant id, or fingerprint.

After this session, the operator can also use the new endpoints (`/admin/correlation/:id`, `/admin/deploys`, `/admin/runbooks`, `/admin/service-topology`) directly from the UI for debugging — these are useful even before the AI lands.

---

## Critical safety constraints

- **Correlation ID propagation must not break existing log infrastructure.** The existing logger (StructuredLoggerService) gets a new field; logs without it should still parse. Backward-compatible.
- **Deploy event capture cannot break the deploy pipeline.** If the post-deploy hook to write a `platform_deploy_events` row fails, the deploy still succeeds. Capture is best-effort; the Layer 4 AI tolerates missing deploy events with a "deploy data unavailable for this window" caveat.
- **Runbook front-matter is opt-in.** Runbooks without front-matter are skipped by the index. Existing runbooks gain front-matter incrementally; no forced rewrite. The index reports parsing errors but doesn't fail the cron.
- **Topology and severity are operator-owned facts, not AI-generated facts.** The AI may read them as evidence, but it must not rewrite them. Updates are normal admin CRUD actions with audit logging.
- **Evidence service results are scoped by operator permission.** A `platform_support` operator's evidence query must NOT return data they wouldn't see in the UI (e.g., audit entries for actions they don't have `platform.audit_log.view` for). Same RBAC boundary as the rest of the dashboard.
- **The evidence service is read-only.** Cannot trigger any state change. Can be called by the AI without the AI gaining write powers.

---

## Database

### New tables

```prisma
model PlatformCorrelationEvent {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  correlation_id      String   @db.VarChar(64)
  occurred_at         DateTime @default(now()) @db.Timestamptz()
  source              String   @db.VarChar(40)   // 'api' | 'worker' | 'web-ssr' | 'web-csr' | 'cron' | 'queue'
  event_type          String   @db.VarChar(60)   // 'http_request' | 'job_enqueued' | 'job_completed' | 'job_failed' | 'ws_event' | 'error_captured' | 'audit_logged'
  payload             Json     @db.JsonB         // event-specific shape
  user_id             String?  @db.Uuid          // nullable; populated when known
  tenant_id           String?  @db.Uuid          // nullable; populated when known

  @@map("platform_correlation_events")
  @@index([correlation_id, occurred_at])
  @@index([occurred_at(sort: Desc)])
}

model PlatformDeployEvent {
  id                  String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  sha                 String              @db.VarChar(40)
  short_sha           String              @db.VarChar(7)
  deployed_at         DateTime            @default(now()) @db.Timestamptz()
  deploy_run_url      String              @db.VarChar(500)  // GitHub Actions run URL
  deploy_run_id       String              @db.VarChar(40)
  migration_version   String?             @db.VarChar(40)   // current Prisma migration version after deploy
  status              PlatformDeployStatus
  duration_seconds    Int?
  rollback_of_id      String?             @db.Uuid          // points to a previous deploy this is reverting
  commit_message      String?             @db.Text
  commit_author_email String?             @db.VarChar(200)
  failure_reason      String?             @db.Text          // populated when status = failed
  created_at          DateTime            @default(now()) @db.Timestamptz()

  rollback_of         PlatformDeployEvent? @relation("DeployRollbackOf", fields: [rollback_of_id], references: [id], onDelete: SetNull)
  rollbacks           PlatformDeployEvent[] @relation("DeployRollbackOf")

  @@map("platform_deploy_events")
  @@index([deployed_at(sort: Desc)])
  @@index([sha])
  @@index([status])
}

enum PlatformDeployStatus {
  in_progress
  succeeded
  failed
  rolled_back
}

model PlatformRunbookIndex {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  path                String   @unique @db.VarChar(500)  // 'docs/runbooks/agent-sentry-triage.md'
  title               String   @db.VarChar(200)
  description         String?  @db.Text
  alert_keys          String[] @default([])              // alert rule keys this runbook applies to
  audit_actions       String[] @default([])              // audit actions this runbook applies to
  error_fingerprints  String[] @default([])              // specific error fingerprints
  components          String[] @default([])              // 'postgres' | 'redis' | 'meilisearch' | 'bullmq' | 'disk' | 'auth' | etc.
  severity            String?  @db.VarChar(20)           // 'p1' | 'p2' | 'p3'
  tags                String[] @default([])
  raw_front_matter    Json     @db.JsonB                 // full parsed front-matter for forward compat
  content_sha         String   @db.VarChar(64)           // sha256 of file content; used to detect changes
  indexed_at          DateTime @default(now()) @db.Timestamptz()

  @@map("platform_runbook_index")
  @@index([alert_keys], type: Gin)
  @@index([audit_actions], type: Gin)
  @@index([error_fingerprints], type: Gin)
  @@index([components], type: Gin)
}

model PlatformServiceTopology {
  id                    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  key                   String   @unique @db.VarChar(120)  // e.g., 'queue.report_cards', 'service.auth', 'module.finance'
  kind                  String   @db.VarChar(40)           // 'service' | 'queue' | 'module' | 'dependency' | 'product_area'
  display_name          String   @db.VarChar(160)
  description           String?  @db.Text
  depends_on_keys       String[] @default([])
  affects_product_areas String[] @default([])              // e.g., ['Admissions', 'Billing', 'Parent Portal']
  suspected_repo_areas  String[] @default([])              // operator-owned hints only, e.g., ['apps/api/src/modules/auth', 'apps/worker/src/processors/report-cards']
  related_queue_names   String[] @default([])
  related_module_keys   String[] @default([])
  related_components    String[] @default([])              // health components: postgres, redis, bullmq, disk, etc.
  owner_notes           String?  @db.Text
  updated_at            DateTime @updatedAt @db.Timestamptz()

  @@map("platform_service_topology")
  @@index([kind])
  @@index([depends_on_keys], type: Gin)
  @@index([affects_product_areas], type: Gin)
}

model PlatformSeverityPolicy {
  id                    String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  key                   String   @unique @db.VarChar(120)
  title                 String   @db.VarChar(160)
  component             String?  @db.VarChar(60)
  product_area          String?  @db.VarChar(120)
  tenant_scope          String   @default("any") @db.VarChar(40) // 'single_tenant' | 'multi_tenant' | 'platform' | 'any'
  condition_config      Json     @db.JsonB
  severity              String   @db.VarChar(20)                 // 'info' | 'warning' | 'critical'
  operator_guidance     String?  @db.Text
  updated_at            DateTime @updatedAt @db.Timestamptz()

  @@map("platform_severity_policies")
  @@index([component])
  @@index([severity])
}
```

---

## API + service layer

### Correlation ID middleware

`apps/api/src/common/middleware/correlation-id.middleware.ts`:

```ts
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-correlation-id'] as string | undefined;
    const correlationId = incoming ?? randomUUID();
    res.setHeader('x-correlation-id', correlationId);
    (req as Request & { correlationId: string }).correlationId = correlationId;
    // Propagate via async-local-storage so loggers/queue enqueuers can read it
    correlationContext.run(correlationId, () => next());
  }
}
```

`apps/api/src/common/services/correlation-context.ts` — AsyncLocalStorage instance + helpers `getCorrelationId()`, `withCorrelationId(id, fn)`.

The structured logger gains a transport that includes `correlation_id` from `getCorrelationId()` on every log line. BullMQ queue enqueuers gain a wrapper that reads the current correlation id and stores it in the job options/data.

The worker side reads `job.opts.correlationId` and re-runs in `withCorrelationId(id, () => process(job))` so worker logs continue the same correlation chain.

The browser side: a small client-side hook `useCorrelationContext()` issues correlation ids per-page-load and includes them in every API call. Errors captured client-side are tagged with the correlation id.

### Correlation event ingestion

A high-throughput append path that writes select events to `platform_correlation_events`. NOT every log line — only the events Layer 4 needs to reconstruct a request timeline:

- HTTP request received (start + end with duration + status)
- Job enqueued (queue + name + job_id)
- Job completed (with duration)
- Job failed (with error fingerprint)
- WebSocket event sent
- Error captured (links to `platform_error_log.id`)
- Audit logged (links to `platform_audit_logs.id`)

Goes through a buffered batch writer (insert N rows or T seconds, whichever first). Tolerates write failures by dropping the buffer (log a warning, don't block).

### `PlatformEvidenceService`

`apps/api/src/modules/platform-evidence/platform-evidence.service.ts`:

```ts
@Injectable()
export class PlatformEvidenceService {
  /**
   * Build an evidence bundle for the AI Copilot. The bundle is the structured
   * input that the prompt builder turns into <evidence> blocks for the model.
   * Every method returns evidence items with stable shape:
   *   { kind, id, link, occurred_at, snippet, raw }
   * `link` is a frontend URL the operator can click in the citation.
   * `raw` is the canonical record for the AI to reason over.
   * `snippet` is a short string for inline citation rendering.
   */

  async forCorrelationId(correlationId: string): Promise<EvidenceBundle> {
    /* ... */
  }

  async forTimeWindow(
    start: Date,
    end: Date,
    opts?: { tenantId?: string; components?: string[] },
  ): Promise<EvidenceBundle> {
    /* ... */
  }

  async forErrorFingerprint(fingerprint: string): Promise<EvidenceBundle> {
    /* ... */
  }

  async forAlert(alertHistoryId: string): Promise<EvidenceBundle> {
    /* ... */
  }

  async forTenant(tenantId: string, opts?: { since?: Date }): Promise<EvidenceBundle> {
    /* ... */
  }

  async runbooksForAlert(alertRuleId: string): Promise<RunbookEvidence[]> {
    /* ... */
  }

  async runbooksForError(errorFingerprint: string): Promise<RunbookEvidence[]> {
    /* ... */
  }

  async runbooksForAuditAction(action: PlatformAuditAction): Promise<RunbookEvidence[]> {
    /* ... */
  }

  async deploysInWindow(start: Date, end: Date): Promise<DeployEvidence[]> {
    /* ... */
  }

  async topologyForEvidence(evidence: EvidenceBundle): Promise<TopologyEvidence[]> {
    /* ... */
  }

  async severityForEvidence(evidence: EvidenceBundle): Promise<SeverityPolicyEvidence[]> {
    /* ... */
  }
}
```

### Deploy event capture

The CI pipeline (`.github/workflows/ci.yml`) gains a final step that POSTs to a new internal endpoint:

```
POST /v1/admin/_internal/deploy-events
Headers: X-Internal-Token: <env-secret>
{ sha, short_sha, deploy_run_url, deploy_run_id, status, duration_seconds, commit_message, commit_author_email }
```

Internal-token-gated (no JWT). The endpoint writes to `platform_deploy_events`.

If the deploy succeeds, the row is inserted with `status: 'succeeded'`. If the deploy fails, status is `'failed'` with `failure_reason`. If a rollback is triggered, the new deploy event has `rollback_of_id` populated.

Deploy event capture is **best-effort** — if the POST fails, log a warning and continue. The deploy doesn't block on this.

### Runbook front-matter parser

Cron job at 02:00 UTC daily. Reads every `docs/runbooks/*.md`, parses front-matter (using a YAML parser like `gray-matter`), upserts into `platform_runbook_index` keyed by `path`. Rows whose `content_sha` matches the existing row are skipped. Rows missing on disk are flagged but not deleted (operator decides).

Existing runbooks gain front-matter incrementally. The Layer 4 master plan references this and provides the canonical template:

```markdown
---
title: Sentry alert triage
description: Procedure for resolving Sentry alerts via the agent runbook.
alert_keys: [sentry.alert.fired, sentry.alert.regressed]
audit_actions: []
error_fingerprints: []
components: [api, worker]
severity: p2
tags: [sentry, ai-runbook]
---

# Agent Sentry Triage Runbook

(existing content...)
```

### New controllers

```
GET    /v1/admin/correlation/:id          -> @RequiresPlatformPermission('platform.audit_log.view') — returns timeline events for a correlation id
GET    /v1/admin/deploys                  -> @RequiresPlatformPermission('platform.audit_log.view') — recent deploys
GET    /v1/admin/deploys/:id              -> @RequiresPlatformPermission('platform.audit_log.view') — single deploy detail
GET    /v1/admin/runbooks                 -> @RequiresPlatformPermission('platform.audit_log.view') — runbook catalogue
GET    /v1/admin/runbooks/by-alert/:alertRuleId -> filtered runbook list
GET    /v1/admin/runbooks/by-error/:fingerprint -> filtered runbook list
GET    /v1/admin/service-topology         -> @RequiresPlatformPermission('platform.audit_log.view') — service/module/queue dependency map
GET    /v1/admin/severity-policies        -> @RequiresPlatformPermission('platform.audit_log.view') — severity classification policy
POST   /v1/admin/_internal/deploy-events  -> internal-token-gated; CI posts deploy events here
```

---

## Frontend

### New pages

`/admin/correlation/[id]/page.tsx` — request timeline visualiser:

- Vertical timeline of correlation events (HTTP request, jobs, errors, audit entries).
- Each event clickable → linked to the underlying detail page.
- Useful for debugging "why did this user request break?"

`/admin/deploys/page.tsx` — deploy log:

- Recent deploys with SHA, timestamp, status, duration, commit message.
- Click → deploy detail with: full commit info, deploy_run_url link, list of `platform_audit_logs` entries that occurred during the deploy window, list of `platform_error_log` entries first seen in the window.

`/admin/runbooks/page.tsx` — runbook catalogue:

- Indexed list of runbooks with title, description, severity, tags.
- Filter by component, alert key, severity.
- Click → opens the runbook in the GitHub source view (or renders inline if shipped as a future enhancement).

`/admin/service-topology/page.tsx` — dependency map:

- Shows services, modules, queues, infrastructure dependencies, and affected product areas.
- Lets the operator inspect "if this queue fails, what product areas are affected?"
- Shows suspected repo areas as operator-maintained hints for repo-agent handoffs. These are not treated as proof; the repo agent must verify.
- Used as evidence by 4B/4C; not generated by AI.

`/admin/severity-policies/page.tsx` — severity matrix:

- Shows the operator-owned policy rules for classifying impact.
- Examples: single-tenant onboarding delay = warning; multi-tenant auth failure = critical; Redis degraded with no queue growth = warning.

### New components

- `CorrelationTimeline` — vertical event stream with collapsible event details.
- `DeployBadge` — shown on error log entries + alert history rows when an event correlates with a recent deploy ("first seen 12 minutes after deploy abc123").
- `RunbookCard` — surfaces matching runbooks on alert detail + error detail pages.
- `ServiceTopologyMap` — dependency graph/list view for services, queues, modules, and product areas.
- `SeverityPolicyTable` — editable owner policy matrix.

---

## Tests

### Unit

- `correlation-id.middleware.spec.ts` — incoming header propagated; missing header generates new id; AsyncLocalStorage carries id through async work.
- `correlation-event-ingester.spec.ts` — buffered writes batch correctly; failed writes don't crash the application.
- `runbook-index.service.spec.ts` — front-matter parser handles valid/invalid/missing front-matter; idempotent re-runs skip unchanged rows.
- `platform-evidence.service.spec.ts` — each method returns shape-compliant evidence items; permission scoping respects the operator's role.
- `service-topology.service.spec.ts` — dependency lookups return affected queues/modules/product areas and suspected repo-area hints.
- `severity-policy.service.spec.ts` — policy matching returns the expected severity for known scenarios.

### Integration

- `correlation-trace.e2e.ts` — make an API request → assert the correlation id is in the response header, in the API log, in any queued job's options, and in the worker's processor log.
- `deploy-capture.e2e.ts` — POST to `_internal/deploy-events` with a valid token → row inserted; with invalid token → 401.
- `runbook-cron.spec.ts` — seed three runbook files (one valid, one with bad YAML, one with no front-matter); run cron; assert one indexed, one skipped with error log, one skipped silently.

### Static analysis

- A new spec asserts that every existing runbook under `docs/runbooks/` either has front-matter OR is in a allow-list of "documentation-only runbooks not eligible for indexing" (in case operator wants to keep some out).

---

## Acceptance

- [ ] `CorrelationIdMiddleware` registered globally; correlation ids appear on every log line, every job, every WebSocket event.
- [ ] `platform_correlation_events` table receives writes from API, worker, error capture, audit capture.
- [ ] CI pipeline POSTs deploy events; `platform_deploy_events` populated for every deploy that runs after this session ships.
- [ ] At least 5 existing runbooks gain front-matter; runbook index cron runs and populates `platform_runbook_index`.
- [ ] `platform_service_topology` and `platform_severity_policies` tables exist and are seeded with an initial EduPod map/policy set.
- [ ] `PlatformEvidenceService` exists with topology and severity evidence methods; unit tests pass for each.
- [ ] Frontend pages: `/admin/correlation/[id]`, `/admin/deploys`, `/admin/runbooks`, `/admin/service-topology`, `/admin/severity-policies` all render.
- [ ] `DeployBadge` appears on error log entries when the error correlates with a deploy in the last 30 minutes.
- [ ] `docs/runbooks/runbook-front-matter.md` (new) documents the front-matter schema for future runbook authors.
- [ ] `docs/architecture/event-job-catalog.md` gains the daily runbook-index cron + the deploy-event-capture endpoint.
- [ ] All new code passes `turbo lint` and `turbo type-check`; all new tests pass; no existing tests regress.

---

## Notes

- Correlation IDs are the single most important thing this session ships. Everything else depends on them. Without correlation ids, the AI cannot trace a request through the stack and Layer 4B's "what's broken right now" loses 80% of its power.
- Deploy event capture from CI is more reliable than scraping git history at runtime. The CI workflow is the source of truth for "what was deployed when."
- Runbook front-matter is intentionally lightweight — operator-friendly enough that adding a new runbook to the index is one extra line in the markdown header. Layer 4 leans on this aggressively in 4B (recommendations) and 4D (supervised actions).
- The service topology map is a first-class product artifact, not decoration. This is what makes the Copilot operationally useful instead of a generic summarizer.
- `suspected_repo_areas` is intentionally a hint field. The admin Copilot has no repo access; the repo agent receives these as starting points, not instructions to blindly edit those files.
- The severity policy matrix should start small and practical. It can be improved after real incidents; the goal is to give the AI a clear operator-owned impact model, not a perfect SRE taxonomy on day one.
- The `_internal/deploy-events` endpoint is the only platform-side endpoint that bypasses JWT auth. It uses a static token from env. Add to `docs/architecture/danger-zones.md` as DZ-AI-Internal: "Internal deploy endpoint — token rotation must accompany any CI workflow change to prevent stale-token deploys silently failing."
- Future enhancement (out of scope): a `platform_signal_summary` materialized view that pre-aggregates evidence for the last hour, refreshed every 60 seconds — used by Layer 4B to answer "what's broken right now?" with sub-second latency. Defer until Layer 4 is in production and we have real query patterns to optimise.
