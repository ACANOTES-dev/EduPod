# Session 4C: Fix Recommendation Engine

**Depends on:** Sessions 4A (evidence) + 4B (Copilot infrastructure, prompt builder, post-processor, cost guard)
**Unlocks:** Session 4D (supervised actions reuse the recommendation surface as their proposal source)

---

## Objective

Extend the read-only Copilot from 4B to PROACTIVELY surface fix recommendations — without waiting for the operator to ask. The engine runs on a periodic basis (and on-demand when an alert fires), looks at the current platform state, and produces structured recommendations:

- "Alert rule X has fired 47 times in 14 days; based on the data the threshold should move from 500ms to 900ms" (noise-reduction recommendation)
- "Queue `gradebook` has 12 failed `report-card-generation` jobs all with the same fingerprint; runbook Y applies; safe to retry after applying the patch in commit Z" (known-fix recommendation)
- "Tenant NHQS has onboarding step `domain_configured` blocked for 6 days; their custom domain CNAME is missing" (config drift recommendation)
- "The 3 most recent errors in the last hour all started 8 minutes after deploy `abc123`; consider rolling back" (deploy regression recommendation)

Each recommendation has a confidence (low/medium/high), a risk indicator (safe/caution/destructive), an evidence trail, and a suggested action description (still no execution; that's 4D). The operator dismisses, defers, or — once 4D ships — approves.

The single most important architectural commitment: **recommendations are structured data, not prose.** A recommendation has a category, a target, a proposed action shape, an evidence array, and a confidence level. The frontend renders this structure as cards; the AI in 4B can surface them inline; 4D consumes them as the source of action proposals.

---

## Critical safety constraints

- **Recommendations expire.** A recommendation generated at T is valid for at most 24 hours. After that, the underlying evidence is stale. Expired recommendations stop appearing in the active list (auto-archived).
- **Recommendations are NOT actions.** This session ships proposals only. Even if the recommendation says "retry job X", the operator clicking "Approve" in this session is a no-op (or routes through 4D once that ships). Until 4D, the only operator action is "Dismiss with reason."
- **Cost guardrail extends per-day.** Recommendation generation runs on its own cost budget separate from operator conversations. Default $20/day (allows ~10-20 recommendation generations per day depending on evidence size). Exceeding the budget pauses generation until next UTC day; existing recommendations stay visible.
- **Evidence-first still applies.** Every recommendation must cite specific evidence items. The 4B post-processor is reused.
- **Recommendation generation is debounced per category.** If the engine produced a recommendation about "queue X failures" 30 minutes ago and the same evidence is still present, no new recommendation is generated — the existing one is updated with refreshed evidence + a `last_refreshed_at` bump. Prevents duplicate notification noise.
- **Destructive recommendations are flagged but not promoted.** A recommendation to "clean queue Y of 200 stale jobs" is generated normally but the UI surfaces it with a destructive badge + explicit "this requires two-person approval per Layer 1.5C" warning.

---

## Database

### New tables

```prisma
model PlatformAiRecommendation {
  id                  String                              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  category            PlatformAiRecommendationCategory
  title               String                              @db.VarChar(200)
  summary             String                              @db.Text                // 1-2 sentence operator-readable summary
  detailed_reasoning  String                              @db.Text                // full AI reasoning with citations (post-processed)
  raw_reasoning       String                              @db.Text                // pre-strip; owner-only access
  confidence          PlatformAiRecommendationConfidence
  risk_level          PlatformAiRecommendationRisk
  proposed_action     Json?                               @db.JsonB               // structured action shape that 4D consumes; null if no specific action proposed
  target_resource_type String?                            @db.VarChar(60)
  target_resource_id  String?                             @db.VarChar(255)
  target_tenant_id    String?                             @db.Uuid
  evidence            Json                                @db.JsonB               // array of evidence items (same shape as 4B EvidenceItem)
  evidence_fingerprint String                             @db.VarChar(64)         // hash of evidence ids; used for debounce
  related_runbook_id  String?                             @db.Uuid
  status              PlatformAiRecommendationStatus      @default(active)
  generated_at        DateTime                            @default(now()) @db.Timestamptz()
  last_refreshed_at   DateTime                            @default(now()) @db.Timestamptz()
  expires_at          DateTime                            @db.Timestamptz()       // generated_at + 24h
  resolved_at         DateTime?                           @db.Timestamptz()
  resolved_by_user_id String?                             @db.Uuid
  resolution_type     PlatformAiRecommendationResolution?
  resolution_reason   String?                             @db.Text

  related_runbook     PlatformRunbookIndex?               @relation(fields: [related_runbook_id], references: [id], onDelete: SetNull)
  resolved_by         User?                               @relation("AiRecResolvedBy", fields: [resolved_by_user_id], references: [id], onDelete: SetNull)

  @@map("platform_ai_recommendations")
  @@index([status, expires_at])
  @@index([evidence_fingerprint, status])
  @@index([category, generated_at(sort: Desc)])
  @@index([target_tenant_id, generated_at(sort: Desc)])
}

enum PlatformAiRecommendationCategory {
  noise_reduction          // alert rule threshold tuning, silencing repetitive alerts
  known_fix                // recognised error pattern with established remediation
  config_drift             // tenant onboarding stuck, missing config, expired credentials
  deploy_regression        // errors started after a recent deploy
  capacity                 // queue depth, error rate trending up
  cost                     // unusual spend pattern (Anthropic, S3, SMS)
  security                 // suspicious login pattern, unusual access from new IP
  hygiene                  // stale data, orphaned records, expired resources to clean up
}

enum PlatformAiRecommendationConfidence {
  low      // 1+ evidence item but reasoning is speculative
  medium   // multiple evidence items aligned; operator should verify before acting
  high     // strong correlation across multiple evidence sources; safe-to-act if non-destructive
}

enum PlatformAiRecommendationRisk {
  safe         // recommendation is read-only or non-destructive (e.g., open a GitHub issue)
  caution      // operator-reversible (e.g., silence an alert)
  destructive  // requires two-person approval per Layer 1.5C
}

enum PlatformAiRecommendationStatus {
  active       // currently surfaced in the UI
  resolved     // operator accepted (4D will execute) or it self-resolved
  dismissed    // operator dismissed as not applicable
  expired      // 24h elapsed; auto-archived
  superseded   // a newer recommendation about the same thing replaced this one
}

enum PlatformAiRecommendationResolution {
  accepted_for_action   // operator clicked approve; 4D handles execution
  dismissed_not_applicable
  dismissed_acknowledged_no_action
  self_resolved         // underlying evidence cleared (e.g., queue drained on its own)
  expired
}
```

---

## API + service layer

### `RecommendationGenerationService`

`apps/api/src/modules/platform-ai-copilot/recommendation-generation.service.ts`:

```ts
@Injectable()
export class RecommendationGenerationService {
  constructor(
    private readonly evidence: PlatformEvidenceService,
    private readonly anthropic: AnthropicClientService,
    private readonly promptBuilder: RecommendationPromptBuilderService,
    private readonly postProcessor: CopilotResponsePostProcessor,
    private readonly costGuard: PlatformAiCostGuardService,
    private readonly audit: PlatformAuditService,
  ) {}

  /**
   * Run a generation pass. Called on a cron AND when an alert fires.
   * Looks at current platform state, identifies recommendation candidates,
   * generates structured recommendations.
   *
   * Per category, each candidate is fingerprinted; existing active
   * recommendations with the same fingerprint are refreshed (no new row),
   * not duplicated.
   */
  async runGenerationPass(
    trigger: 'cron' | 'alert_fired' | 'on_demand',
  ): Promise<{ generated: number; refreshed: number; skipped: number }>;

  /**
   * Generate a single recommendation about a specific evidence subset.
   * Used by the on-demand path (operator asks the Copilot "what should I do
   * about queue X?" → 4B routes through here).
   */
  async generateForEvidence(input: {
    category: PlatformAiRecommendationCategory;
    evidence: EvidenceBundle;
    user_id: string;
  }): Promise<PlatformAiRecommendation | null>;
}
```

### Recommendation prompt builder

Reuses 4B's `CopilotPromptBuilderService` with a different system prompt focused on STRUCTURED OUTPUT.

The model is asked to respond in JSON matching a Zod schema. The post-processor parses the JSON; if parsing fails, retry with feedback once; if it fails again, log + skip.

System prompt addition (appended to 4B's base prompt):

```
RECOMMENDATION GENERATION MODE:

You will look at the evidence and produce ZERO OR MORE recommendations as a
JSON array matching this exact schema:

[
  {
    "category": "noise_reduction" | "known_fix" | "config_drift" | "deploy_regression" | "capacity" | "cost" | "security" | "hygiene",
    "title": "<concise operator-facing title, max 80 chars>",
    "summary": "<1-2 sentence summary>",
    "detailed_reasoning": "<your full reasoning with [E:<id>] citations as in normal mode>",
    "confidence": "low" | "medium" | "high",
    "risk_level": "safe" | "caution" | "destructive",
    "proposed_action": null | {
      "kind": "silence_alert" | "retry_jobs" | "open_github_issue" | "schedule_maintenance" | "run_runbook" | "rollback_deploy" | "manual_only",
      "params": { /* kind-specific */ }
    },
    "target_resource_type": "<optional, e.g., 'queue', 'tenant', 'alert_rule'>",
    "target_resource_id": "<optional>",
    "target_tenant_id": "<optional UUID>",
    "evidence_ids": ["E:<id>", ...],
    "related_runbook_path": "<optional, must be one of the runbook paths in evidence>"
  }
]

If the evidence does not warrant ANY recommendations, return an empty array: [].

DO NOT recommend an action you have no evidence for. Better to return [] than
to invent a recommendation.

DO NOT propose actions that would touch:
- Database migrations
- Schema definitions
- Deploy configuration files
- Secrets / credentials
- Cron schedules

If the operator NEEDS to do one of those, set "proposed_action": { "kind": "manual_only", "params": { "description": "..." } }.

DO NOT propose more than 5 recommendations per pass. If you find more
candidates, prioritise by confidence + impact.
```

### Cron trigger

Daily at 04:30 UTC + on each `critical` alert event (subscribes to `platform:alerts` channel). Also triggerable on-demand by operator from the UI.

### Refresh-vs-create logic

```
function fingerprint(evidenceIds: string[]): string {
  return sha256(evidenceIds.sort().join(','));
}

For each generated recommendation:
  fp = fingerprint(rec.evidence_ids)
  existing = SELECT * FROM platform_ai_recommendations WHERE evidence_fingerprint = fp AND status = 'active' LIMIT 1
  if existing:
    UPDATE existing SET last_refreshed_at = now(), evidence = rec.evidence, expires_at = now() + 24h
    record_outcome = 'refreshed'
  else:
    INSERT new recommendation with status = 'active', expires_at = now() + 24h
    record_outcome = 'generated'
```

### Self-resolution detection

A daily cron at 05:00 UTC walks active recommendations and re-evaluates the underlying evidence. If the evidence has cleared (e.g., the queue failure pattern is no longer present, the alert hasn't fired in 24h), mark as `self_resolved` with `resolution_type = 'self_resolved'`.

### Action proposal handoff (cross-session)

When an operator clicks "Accept" on a recommendation in 4C:

- If 4D is shipped: route to `PlatformAiActionProposalsService.create` (4D's surface) with the `proposed_action` payload.
- If 4D is NOT yet shipped: mark recommendation as `accepted_for_action` and surface a banner: "Action queued — Layer 4D not yet shipped; operator must execute manually using the linked runbook." This means 4C is shippable independently.

### New controllers

```
GET    /v1/admin/copilot/recommendations               -> list active recommendations
GET    /v1/admin/copilot/recommendations/:id           -> single recommendation detail
POST   /v1/admin/copilot/recommendations/:id/dismiss   -> dismiss with reason
POST   /v1/admin/copilot/recommendations/:id/accept    -> accept; routes to 4D if available
POST   /v1/admin/copilot/recommendations/generate      -> on-demand trigger (rate-limited; 1 per 5min per operator)
```

All gated by `platform.ai.read`.

---

## Frontend

### New page: `/admin/copilot/recommendations`

- Default view: active recommendations grouped by category, sorted by confidence DESC, then generated_at DESC.
- Filter chips: category, confidence, risk_level, target_tenant.
- Each card: `<RecommendationCard>` with title, summary, confidence bar (low=red 30% / medium=amber 60% / high=green 100%), risk badge (safe/caution/destructive), evidence count chip, "View details" toggle.
- Expanded view: full detailed_reasoning with inline citations (reuses 4B `<EvidenceCitation>`), related runbook link, proposed action JSON preview, "Accept" / "Dismiss" buttons.
- Destructive recommendations show explicit warning: "This requires two-person approval per Layer 1.5C. Accepting routes to a request workflow."

### Surface in dashboard home

The platform admin dashboard home gains a "Recommendations" widget showing the top 3 active recommendations (by confidence). Click → navigate to full recommendations page.

### Integration with 4B Copilot UI

When the operator is in 4B's Copilot conversation and asks something like "what should I do about queue gradebook?", the Copilot's response can include inline `<RecommendationProposalCard>` components — fully-formed recommendations rendered inline. Clicking "Accept" routes the same way as the standalone page.

### Components

- `RecommendationCard` — main card with confidence bar, risk badge, evidence count.
- `DismissRecommendationDialog` — modal with reason textarea (required, min 5 chars).
- `RecommendationDetailPanel` — expanded view.
- `RecommendationProposalCard` — inline variant for use inside Copilot conversations (4B integration).
- `ProposedActionPreview` — JSON preview with syntax highlighting.

---

## Tests

### Unit

- `recommendation-generation.service.spec.ts` — refresh vs create logic; fingerprint stability; debounce; cron + alert + on-demand triggers all path through correctly.
- `recommendation-prompt-builder.spec.ts` — JSON schema enforcement; retry-on-parse-failure works once.
- `self-resolution-cron.spec.ts` — cleared evidence marks recommendations self_resolved.

### Integration

- `recommendation-end-to-end.spec.ts` — mock evidence + mock Anthropic returning a JSON array → recommendations created → visible in API → click Accept → marked accepted_for_action (or routed to 4D mock).
- `recommendation-debounce.spec.ts` — same evidence twice → second pass refreshes existing recommendation, doesn't create new.

### Critical

- `recommendation-action-blocklist.spec.ts` — feed adversarial evidence that would tempt the AI to recommend a migration / schema change / secret edit / cron change. Assert the AI either returns "manual_only" OR an empty array. Inherits Layer 4 master plan's blocklist enforcement.
- `recommendation-citation.spec.ts` — every recommendation in the response has at least one evidence_id; recommendations with no citations are stripped before insert.

### E2E

- Trigger an alert that the runbook index marks as eligible for known_fix recommendations → recommendation generated → visible in `/admin/copilot/recommendations` → operator dismisses → marked dismissed.

---

## Acceptance

- [ ] `RecommendationGenerationService` exists with cron + alert + on-demand triggers.
- [ ] Recommendations stored in `platform_ai_recommendations` with structured schema.
- [ ] Refresh-vs-create debounce works (fingerprint-based).
- [ ] Self-resolution cron marks stale recommendations as resolved.
- [ ] Frontend page `/admin/copilot/recommendations` renders all active recommendations.
- [ ] Dashboard home widget shows top 3 active recommendations.
- [ ] 4B Copilot conversation can surface recommendations inline via `RecommendationProposalCard`.
- [ ] Operator can dismiss with reason; resolution recorded.
- [ ] Operator can accept; routes to 4D OR shows "manual execution required" banner if 4D not yet shipped.
- [ ] Action blocklist enforced (no migrations, schema, secrets, cron changes).
- [ ] All recommendations have at least one citation; uncited recommendations stripped before insert.
- [ ] Per-day Anthropic budget for recommendation generation enforced (default $20/day).
- [ ] All new code passes `turbo lint` and `turbo type-check`; all new tests pass.

---

## Notes

- The structured-JSON output requirement is the single biggest implementation risk. Anthropic's models are good at JSON but not perfect; the retry-once-then-skip logic is essential. Consider using Anthropic's tool-use mode for more reliable structured output.
- Confidence levels are subjective — the prompt instructs the model to use `high` only when "multiple independent evidence items align" and `low` for "any speculation." Calibration will drift; periodic operator review of the recommendation log catches it.
- Risk_level mapping is fixed per `proposed_action.kind`:
  - `silence_alert`, `open_github_issue`, `schedule_maintenance`, `manual_only` → `safe` or `caution`
  - `retry_jobs` → `caution` (operator-reversible per job)
  - `rollback_deploy` → `destructive`
  - `run_runbook` → depends on the runbook's declared severity (from front-matter)
- The action blocklist is enforced at THREE points: (1) the prompt instruction, (2) the post-processor scans `proposed_action.kind` and rejects forbidden values, (3) 4D's executor side rejects any forbidden action even if it slipped through. Defense in depth.
- Future enhancement (out of scope here): allow operator to provide feedback on a recommendation ("this was wrong because X") that the AI uses to improve subsequent generations. Defer until usage data shows where the AI consistently misjudges.
