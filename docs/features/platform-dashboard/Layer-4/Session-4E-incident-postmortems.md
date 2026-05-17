# Session 4E: Incident Learning + Postmortems

**Depends on:** All previous Layer 4 sessions (4A evidence, 4B Copilot infra, 4C recommendations, 4D action proposals)
**Unlocks:** Nothing further inside Layer 4. Closes the layer.

---

## Objective

Turn alerts and AI actions into a structured **incident** record with an operator-triggered postmortem generator. Incident records may be created by normal alert logic, but the AI does not run in the background. After this session:

- When a `critical` alert fires, normal non-AI alert logic creates an incident record with the alert as its seed.
- Subsequent related alerts (same component, same fingerprint, or close in time + scope) attach to the same incident.
- When the incident is marked resolved, the operator can click "Generate postmortem" to ask the AI for a timeline, root cause analysis, impact summary, fix applied, and prevention items.
- Postmortems are markdown, operator-editable, and stored on the incident record.
- The AI can suggest new tests, alert rules, or runbook updates when the operator requests prevention recommendations — but never auto-applies them.

This session closes the Layer 4 arc: the Copilot doesn't just diagnose and act on the present — it learns from the past so the system gets smarter.

---

## Critical safety constraints

- **Postmortems are AI-generated; runbooks are NOT.** Per the design review feedback: AI generating runbooks autonomously creates a feedback loop where AI mistakes get codified as canonical procedure. Postmortems describe what happened (less risk) and propose runbook IMPROVEMENTS as recommendations the operator reviews before any runbook file is touched. AI never directly writes to `docs/runbooks/*.md`.
- **Postmortem generation is manual.** Resolving an incident never calls Anthropic by itself. The operator clicks Generate/Regenerate and sees the estimated cost.
- **Postmortem privacy.** Postmortems may quote alert descriptions, error messages, audit entries — all of which have already been through Layer 1.5B's redaction pipeline. The postmortem reuses the same redactor as a final pass before persisting; double redaction is acceptable, the cost is minimal.
- **Operator can edit postmortem before sharing.** AI generates the first draft; operator sees it in markdown editor mode; can refine wording, remove speculation, add context only they have. The "shared" version is what's persisted to `platform_incidents.postmortem_final`.
- **Auto-resolve detection is non-AI and conservative.** An incident is NOT auto-resolved unless ALL contributing alerts have been resolved AND no new related alerts have fired in the last hour. Bias toward "still open" — better than prematurely closing an incident the operator was still investigating.
- **Incident severity is set by the seed alert** (matches the alert's severity). Subsequent attachments don't downgrade; if a `warning` alert attaches to a `critical` incident, the incident stays `critical`.
- **Postmortem generation costs Anthropic budget.** Operator-triggered generation/regeneration is rate-limited (1 per incident per hour).

---

## Database

### New tables

```prisma
model PlatformIncident {
  id                  String                       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  title               String                       @db.VarChar(200)             // operator-edited or AI-suggested
  severity            PlatformIncidentSeverity     // matches seed alert severity
  status              PlatformIncidentStatus       @default(active)
  started_at          DateTime                     @default(now()) @db.Timestamptz()
  resolved_at         DateTime?                    @db.Timestamptz()
  resolved_by_user_id String?                      @db.Uuid
  auto_resolved       Boolean                      @default(false)              // true if cleared by auto-resolve detection
  seed_alert_history_id String                     @db.Uuid                     // the alert that started the incident
  affected_tenants    String[]                     @default([])                 // tenant ids identified by the AI as impacted
  affected_components String[]                     @default([])                 // 'postgres' | 'redis' | etc.
  root_cause_summary  String?                      @db.Text                     // AI-generated, operator-editable
  postmortem_draft    String?                      @db.Text                     // initial AI generation
  postmortem_final    String?                      @db.Text                     // operator-edited final version
  postmortem_generated_at DateTime?                @db.Timestamptz()
  postmortem_generations Int                       @default(0)                  // count of regenerations
  prevention_recommendation_ids String[]           @default([]) @db.Uuid        // 4C recommendation ids generated from this incident
  created_at          DateTime                     @default(now()) @db.Timestamptz()
  updated_at          DateTime                     @updatedAt @db.Timestamptz()

  resolved_by         User?                        @relation("IncidentResolvedBy", fields: [resolved_by_user_id], references: [id], onDelete: SetNull)
  timeline            PlatformIncidentTimelineEvent[]

  @@map("platform_incidents")
  @@index([status, started_at(sort: Desc)])
  @@index([severity, started_at(sort: Desc)])
  @@index([started_at(sort: Desc)])
}

enum PlatformIncidentSeverity {
  warning
  critical
}

enum PlatformIncidentStatus {
  active           // incident open, alerts still firing or recent
  monitoring       // alerts cleared but watching for recurrence
  resolved         // confirmed resolved
  cancelled        // operator marks as not-an-incident (false positive)
}

model PlatformIncidentTimelineEvent {
  id                  String                              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  incident_id         String                              @db.Uuid
  occurred_at         DateTime                            @db.Timestamptz()
  event_type          PlatformIncidentTimelineEventType
  // Polymorphic refs — at most one populated per row
  alert_history_id    String?                             @db.Uuid
  audit_log_id        String?                             @db.Uuid
  ai_action_proposal_id String?                           @db.Uuid
  deploy_event_id     String?                             @db.Uuid
  // Free-form fields
  description         String                              @db.Text                 // AI-generated or operator-typed
  metadata            Json?                               @db.JsonB
  created_at          DateTime                            @default(now()) @db.Timestamptz()

  incident            PlatformIncident                    @relation(fields: [incident_id], references: [id], onDelete: Cascade)

  @@map("platform_incident_timeline_events")
  @@index([incident_id, occurred_at])
}

enum PlatformIncidentTimelineEventType {
  alert_fired
  alert_acknowledged
  alert_resolved
  ai_recommendation_generated
  ai_action_proposed
  ai_action_executed
  operator_note
  deploy_event
  related_alert_attached
  status_changed
}
```

### Modified table (from 1C)

```prisma
model PlatformAlertHistory {
  // ... existing fields ...
  incident_id  String?  @db.Uuid  // populated when this alert is attached to an incident

  incident     PlatformIncident? @relation(fields: [incident_id], references: [id], onDelete: SetNull)
}
```

---

## API + service layer

### `IncidentDetectionService`

`apps/api/src/modules/platform-incident/incident-detection.service.ts`:

```ts
@Injectable()
export class IncidentDetectionService {
  constructor(
    @Inject('REDIS_SUBSCRIBER_CLIENT') private readonly subscriber: Redis,
    private readonly incidents: PlatformIncidentService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Subscribe to platform:alerts for incident creation
    await this.subscriber.subscribe('platform:alerts');
    this.subscriber.on('message', async (channel, raw) => {
      if (channel !== 'platform:alerts') return;
      const event = JSON.parse(raw);
      await this.handleAlertEvent(event);
    });
  }

  /**
   * On alert fired with severity 'critical':
   *   1. Look for an active incident with the same component + recent (<30 min)
   *   2. If found: attach this alert as a related_alert; record timeline event
   *   3. If not found: create new incident, set this alert as seed
   * On alert resolved:
   *   1. Find any incident this alert attached to
   *   2. If all contributing alerts now resolved AND no new related alerts in last hour: mark incident as 'monitoring'
   *   3. After 1h of 'monitoring' state with no new alerts: auto-resolve
   */
  private async handleAlertEvent(event: AlertEvent): Promise<void>;
}
```

### `PostmortemGeneratorService`

```ts
@Injectable()
export class PostmortemGeneratorService {
  constructor(
    private readonly evidence: PlatformEvidenceService,
    private readonly anthropic: AnthropicClientService,
    private readonly promptBuilder: PostmortemPromptBuilderService,
    private readonly postProcessor: CopilotResponsePostProcessor,
    private readonly redactor: ErrorRedactorService,
    private readonly costGuard: PlatformAiCostGuardService,
  ) {}

  /**
   * Generate (or regenerate) the postmortem for an incident.
   *   1. Fetch all timeline events
   *   2. Build evidence bundle covering the incident window
   *   3. Construct the postmortem prompt
   *   4. Call Anthropic with prompt cache
   *   5. Run output through standard 4B citation post-processor
   *   6. Run final-pass redaction (Layer 1.5B redactor)
   *   7. Store as postmortem_draft (or update if regeneration)
   *   8. Increment postmortem_generations
   */
  async generate(
    incident_id: string,
    requested_by_user_id: string,
  ): Promise<{ draft: string; cost_usd: number }>;

  /**
   * Manually generate prevention recommendations from a resolved incident.
   * Creates 4C recommendation rows tied to this incident via prevention_recommendation_ids.
   * Examples: "add an alert rule for X", "add a regression test for Y", "update runbook Z to mention this case".
   */
  async generatePreventionRecommendations(
    incident_id: string,
  ): Promise<{ recommendations_created: number }>;
}
```

### Postmortem prompt builder

System prompt addition (appended to 4B's base prompt):

```
POSTMORTEM GENERATION MODE:

You are writing a postmortem for a resolved incident. Output is a single
markdown document with these sections (in this order):

# <incident title>

## Summary
1-2 sentences: what broke, who was affected, how long it lasted.

## Timeline
Chronological list of events from the timeline data. Each entry:
`HH:MM UTC — <event description>` with citation [E:<id>].
Include: alert fires, operator acknowledgements, deploys in window,
AI recommendations generated, AI actions executed, related alerts
attached, status changes.

## Root cause
What caused the incident. Cite specific evidence (deploy SHA + commit
message, error fingerprint, configuration drift, etc.). If the root
cause is uncertain, say so explicitly: "The root cause is not
conclusively determined from the evidence; possible causes include..."

## Impact
- Tenants affected (from incident.affected_tenants; reference by name)
- Components affected
- Duration (start_at to resolved_at)
- User-visible symptoms (from operator notes + alert descriptions)

## Fix applied
What was done to resolve. Reference the AI actions executed (with
citations to [E:ai-action-<id>]) and any operator-initiated actions
(via [E:audit-<id>]).

## Prevention items
PROPOSALS only. Format each as:
"PROPOSAL: <action>. Rationale: <why>. Risk: <safe|caution|destructive>."
Examples:
- "PROPOSAL: Add an alert rule for queue X depth > 50 sustained 5 min. Rationale: this incident's queue depth went from 8 to 220 in 8 minutes with no alert. Risk: safe."
- "PROPOSAL: Update runbook docs/runbooks/redis-degraded.md to include the auto-revert step we used here. Rationale: the existing runbook doesn't cover the deploy-regression case. Risk: safe (operator-curated)."

DO NOT directly suggest fixing the bug ("just fix X"). Suggest the
PROCESS that prevents recurrence (alerting, testing, runbook updates).

You DO NOT write runbooks directly. You propose runbook UPDATES that the
operator reviews and applies manually.

EVIDENCE-FIRST: every claim cites [E:<id>] from the evidence bundle.
The post-processor will strip uncited claims; better to refuse than to
speculate.

If the incident timeline is sparse or the root cause genuinely cannot
be determined, write that clearly. A short honest postmortem is better
than a long speculative one.
```

### New controllers

```
GET    /v1/admin/incidents                              -> list incidents (paginated, filterable by status + severity + date range)
GET    /v1/admin/incidents/:id                          -> incident detail with timeline
PATCH  /v1/admin/incidents/:id                          -> update title, status (manual resolve / cancel), affected_tenants
PATCH  /v1/admin/incidents/:id/postmortem               -> save edited postmortem_final
POST   /v1/admin/incidents/:id/regenerate-postmortem    -> trigger regeneration (rate-limited 1/hr per incident)
POST   /v1/admin/incidents/:id/timeline-events          -> add operator note to timeline
POST   /v1/admin/incidents/:id/generate-prevention      -> generate prevention recommendations (creates 4C rows)
```

All gated by `platform.alerts.view` (postmortem editing requires `platform.alerts.acknowledge` since it's a control action).

---

## Frontend

### New pages

`/admin/incidents/page.tsx`:

- Table of incidents: title, severity, status, started_at, duration, affected_tenants count.
- Filter by status, severity, date range.
- Click → incident detail.

`/admin/incidents/[id]/page.tsx`:

- Header: title (operator-editable), severity badge, status, duration.
- Tabs: Timeline | Postmortem | Prevention | Alerts attached.
- Timeline tab: visual chronological list with event type icons (reuses 4A `<CorrelationTimeline>` styling).
- Postmortem tab: markdown editor mode (operator can edit) with preview pane; "Regenerate" button (rate-limited).
- Prevention tab: list of generated 4C recommendations linked from this incident.
- Alerts attached tab: list of all `platform_alert_history` rows with this `incident_id`.

### Components

- `IncidentTimeline` — vertical timeline with event-type icons.
- `PostmortemMarkdownEditor` — markdown editor with preview, drag-to-resize panes, "save draft" + "publish final" buttons.
- `IncidentSeverityBadge` — colour-coded by severity.
- `IncidentStatusBadge` — colour-coded by status.
- `RegeneratePostmortemDialog` — confirmation modal explaining cost + rate limit.

### Surface in dashboard home

Dashboard home gets an "Active incidents" widget showing currently `active` or `monitoring` incidents with severity + age.

### Integration with 4B Copilot

When the operator asks the Copilot "what's the latest incident?", the response includes a `<IncidentSummaryCard>` inline with link to the incident detail page.

---

## Tests

### Unit

- `incident-detection.service.spec.ts` — alert fired + no active incident → new incident; alert fired + active incident with same component → attached; alert resolved + all attached resolved → status moves to monitoring; 1h after monitoring with no new alerts → auto-resolved.
- `postmortem-generator.service.spec.ts` — postmortem prompt structure correct; cost tracked.
- `prevention-recommendations.spec.ts` — manually generated recommendations linked back to incident.

### Integration

- `incident-end-to-end.spec.ts` — fire critical alert → incident created by non-AI logic → fire related alert → attached → resolve all alerts → status moves to monitoring → wait 1h (mocked clock) → auto-resolved → operator clicks Generate postmortem → markdown returned with citations + prevention items.
- `postmortem-edit.spec.ts` — operator edits postmortem_draft → save as postmortem_final → final persists, draft unchanged.

### Critical

- `postmortem-redaction.spec.ts` — postmortem covers an incident whose alerts contain (pre-redaction) PII. Assert the persisted postmortem contains no PII (double-redaction in place).
- `postmortem-no-runbook-write.spec.ts` — postmortem includes a "PROPOSAL: update runbook X" item. Assert no file under `docs/runbooks/` is modified by the postmortem generation. Operator must apply the update manually.

---

## Acceptance

- [x] `IncidentDetectionService` listens to `platform:alerts` and creates/attaches/resolves incidents per the rules.
- [x] `PostmortemGeneratorService` generates a markdown postmortem only when manually triggered by the operator.
- [x] Postmortem includes Summary, Timeline, Root cause, Impact, Fix applied, Prevention items.
- [x] All postmortem claims have citations; uncited claims stripped.
- [x] Postmortem runs final-pass redaction.
- [x] Operator can edit and save the final version.
- [x] Generate/regenerate is rate-limited (1/hr per incident); the UI warns about the rate limit and AI budget guard before the call, and generated responses persist cost metadata.
- [x] `generate-prevention` creates 4C recommendation rows linked back to the incident only when manually triggered.
- [x] Frontend pages: `/admin/incidents`, `/admin/incidents/[id]` with all tabs.
- [x] Dashboard home shows an "Active incidents" widget.
- [x] Auto-resolve test passes (alerts cleared + 1h quiet → incident auto-resolved).
- [x] Postmortem-no-runbook-write test passes (AI never writes to `docs/runbooks/*.md`).
- [x] `docs/architecture/danger-zones.md` gains DZ-AI-Postmortem-Privacy (incidents that quote alerts must run final-pass redaction) and DZ-AI-Runbook-Authority (AI proposes runbook updates; never writes runbook files directly).
- [x] All new code passes `turbo lint` and `turbo type-check`; all new tests pass.

---

## Notes

- The Layer 4 arc closes here. After 4E, the operator has: live diagnostics (4B), manual/contextual recommendations (4C), supervised actions (4D), and structured incident learning (4E). The system gets more useful over time as incidents accumulate operator-reviewed prevention recommendations.
- Auto-resolve at "1h of monitoring with no new alerts" is conservative by design. Operator can manually resolve earlier; auto-resolve is for incidents nobody's actively watching.
- The "PROPOSAL: update runbook X" pattern in postmortems is the safe path to runbook evolution. AI-flagged proposal → operator reviews → operator manually edits the markdown → next 4A runbook-index cron picks up the change. Never AI-writes-runbook directly.
- The incident severity inheriting from the seed alert is intentionally simple. Future enhancement: severity escalates if the incident grows beyond a threshold (e.g., >3 affected tenants escalates `warning` to `critical`). Defer until usage shows it matters.
- Future enhancement (out of scope): export postmortem as a shareable HTML document with redaction preview, useful for status pages or post-incident communication. The data model supports it; the export UI is deferred.
- Future enhancement (out of scope): cross-incident pattern detection ("the last 3 critical incidents all involved Redis between 14:00-16:00 UTC; consider scheduled work in that window"). The data is there once 5+ incidents accumulate; the analysis pass is a future Layer 5 candidate.

## Commits / CI / Notes

- Implementation commit: `5e6a00f5 feat(platform): add incident postmortems`
- CI/deploy: GitHub Actions `CI / Deploy` run `25993772385` passed and deployed to production.
- Local verification:
  - `pnpm --filter @school/shared type-check`
  - `pnpm --filter @school/prisma generate`
  - `pnpm --filter @school/prisma type-check`
  - `pnpm --filter @school/api type-check`
  - `pnpm --filter @school/web type-check`
  - Focused API specs for incident detection, incident service/controller, postmortem generation, alert history, 4C recommendations, and 4D action proposals.
  - `pnpm --filter @school/api run test:coverage` passed after adding controller/service coverage for the new Session 4E paths; API line coverage was `89.02%`.
  - Full local `pnpm test` passed before push after snapshot updates.
  - `DATABASE_URL=postgresql://x:x@localhost:5432/x pnpm --filter @school/prisma exec prisma validate` passed.
  - API DI compile check returned `DI OK`.
  - `pnpm --filter @school/web lint:ci`, API focused lint, and full API quiet lint passed.
  - `pnpm check:migration-safety` still reports pre-existing historical contract-pattern warnings unrelated to Session 4E; the new incident migration is additive and was not flagged.
  - `pnpm check:arch-docs` exits 0 with known existing drift unrelated to Session 4E.
- Production smoke on `https://dua.edupod.app`:
  - Platform admin login succeeded without exposing credentials.
  - `/api/v1/auth/me`, `/api/v1/admin/dashboard`, `/api/v1/admin/incidents?pageSize=5`, and `/api/v1/admin/incidents?pageSize=1&status=active` returned 200.
  - Browser smoke confirmed the platform dashboard, `/en/admin/incidents`, incident filters, and the dashboard Active Incidents panel render.
  - Production currently has zero incident rows, which is valid for the smoke context.
- Safety notes:
  - Incident detection is deterministic and does not call AI in the background.
  - Postmortem generation/regeneration is operator-clicked, rate-limited, cost-guarded, citation-processed, and redacted before persistence.
  - Prevention recommendation generation creates linked 4C recommendation rows only; it does not execute or apply changes.
  - No AI code path writes to `docs/runbooks/*.md`; runbook changes remain operator-reviewed recommendations.

## Next Session Prompt

```text
Implement Session 5A of the Platform Admin Dashboard build. Server access granted for diagnostics.

Spec:
docs/features/platform-dashboard/Layer-5/Layer-5-Plan.md
docs/features/platform-dashboard/Layer-5/Session-5A-synthetic-journey-monitoring.md

Context:
- Sessions 0 through 4E are complete, deployed, smoke-tested, and accepted.
- Session 4E shipped structured platform incidents from normal non-AI alert logic, related-alert attachment, conservative monitoring/auto-resolve, operator-clicked postmortem generation, citation enforcement, final-pass redaction, operator-edited final markdown persistence, manual prevention recommendation generation through 4C rows, and no-runbook-write guarantees.
- Production Copilot generation is configured and verified, but Layer 5 scheduled/background work must not call AI.
- Streaming remains waived; do not add streaming unless Session 5A specifically requires it.
- Platform admin host: https://dua.edupod.app
- Credentials are stored locally at /Users/ram/.codex/secrets/edupod-platform-admin.env
- Do not print, commit, log, or screenshot secrets.
- Deploy through CI only by pushing to origin main.

Before coding:
1. Read AGENTS.md.
2. Read docs/plans/context.md.
3. Read docs/plans/ux-redesign-final-spec.md.
4. Read Layer 1, Layer 1.5, Layer 2, Layer 3, Layer 4, and Layer 5 plans.
5. Read Session 4A, Session 4B, Session 4C, Session 4D, and Session 4E closeout notes.
6. Read Session 5A / Synthetic Journey Monitoring end-to-end.
7. Inspect existing alerts, alert history, alert evaluation, channels, maintenance windows, owner confirmation, platform evidence, topology, severity policy, queues, workers, cron scheduler, sessions/cache/maintenance, platform dashboard shell conventions, and Session 4E incident integration before designing anything new.
8. Load backend, frontend, prisma, testing, worker, code-quality, architecture-policing, feature-map-maintenance, and pre-launch-tracking rule packs as relevant.

Implementation requirements:
- Stay strictly within Session 5A.
- Layer 5 proactive/background code must be non-AI. Do not import or call Anthropic, OpenAI, PlatformAiCopilotService, recommendation generation, action proposal generation, or any AI generation service from the 5A runner, processors, schedules, or alerting paths.
- Create the synthetic check definition/result, external dependency status, and certificate check data model exactly within 5A scope.
- All 5A tables are platform-scoped; do not add tenant RLS policies for these platform-level tables.
- Build deterministic handlers for the 5A check kinds required by the spec: http_get, http_post, websocket_handshake, queue_canary, notification_self_test, dns_lookup, tls_check, and external_dependency_status.
- Do not store raw response bodies. Store SHA256 digest plus a redacted <=500 character snippet and structured redacted failure detail.
- Resolve credentials only from configured env credential keys. Never use operator personal credentials or files under ~/.codex for scheduled synthetic checks. The runner must refuse ~/.codex credential sources.
- Synthetic platform-admin login must be designed around the dedicated synthetic platform user and env vars, not Ram's owner credentials.
- Queue canaries must be safe: use the dedicated synthetic canary queue and add sentinel short-circuit guards/tests for per-critical-queue canaries only where required by the 5A spec.
- Maintenance windows must produce skipped_maintenance results, not failures, for applicable check kinds.
- Alert emission must reuse existing platform alert logic: warning on single failure, critical after configured consecutive failures, info/recovery on pass after failure, no alert on skipped maintenance.
- Run-now is operator-triggered, audited, permission-gated, and never bypasses redaction or alert rules.
- Register and re-register repeatable BullMQ jobs conservatively without duplicating schedules.
- Follow token-driven UX styling and the platform dashboard shell conventions.
- Preserve all existing Platform Admin behavior, including Sessions 3A through 4E.

Verification:
- Run targeted backend/frontend checks, type-check, lint, Prisma validation, and relevant tests.
- Verify no Layer 5 proactive/background code imports or calls AI services.
- Verify check execution stores one result per attempt, redacts snippets/failure details, and never stores raw secrets or full response bodies.
- Verify http_get/http_post/websocket/queue canary/notification self-test/dns/tls/external dependency handlers.
- Verify maintenance-window suppression records skipped_maintenance and emits no alert.
- Verify alert emission for warning, critical consecutive failures, and recovery.
- Verify run-now path is permission-gated and audited.
- Verify cron registration does not duplicate repeatable jobs and disables schedules when checks are disabled.
- Verify frontend synthetic checks, result detail, external dependencies, and certificates pages render and use token-driven styling.
- Verify existing Platform Admin regressions.

Deployment:
- Commit to main and push to origin main only.
- Watch GitHub Actions with gh run watch / gh run view.
- Fix forward if CI fails.
- Production smoke on https://dua.edupod.app after green deploy.

Completion:
- Tick the Session 5A acceptance criteria after green CI and production smoke.
- Add "Commits / CI / Notes" to the relevant Layer 5 session documentation.
- Generate the prompt for the next implementation session in this same style.
  Include this same instruction that the next agent should generate the following prompt when it finishes.
- Final response should say whether Session 5A is complete and whether the repo is ready for next work.
- Final response should include the generated next-session prompt.
```
