# Session 4C: Manual Fix Recommendation Engine

**Depends on:** Sessions 4A (evidence, service topology, severity policy) + 4B (Copilot infrastructure, prompt builder, post-processor, cost guard)
**Unlocks:** Session 4D (supervised actions reuse manually generated recommendations as their proposal source)

---

## Objective

Extend the read-only Copilot from 4B so the operator can **manually generate fix recommendations** from a specific context. The AI does not run in the background, does not wake up on a cron, and does not automatically spend tokens when alerts fire.

Manual entry points:

- "Generate recommendation" from an alert, error, queue, tenant, deploy, health component, or incident page.
- "What should I do about this?" inside the Copilot conversation.
- "Generate daily ops brief" from the dashboard home.
- "Generate repo-agent handoff" when the recommendation indicates a code fix may be required.

The engine looks at the selected evidence bundle and produces structured recommendations:

- "Alert rule X has fired 47 times in 14 days; threshold likely needs tuning from 500ms to 900ms."
- "Queue `gradebook` has 12 failed `report-card-generation` jobs with the same fingerprint; runbook Y applies."
- "Tenant NHQS has onboarding step `domain_configured` blocked for 6 days; CNAME is missing."
- "Errors started 8 minutes after deploy `abc123`; investigate that deploy before retrying jobs."

The recommendation is structured data, not prose: category, target, proposed action shape, evidence array, confidence, risk level, owner-confirmation requirement, and whether a repo-agent handoff is appropriate.

---

## Critical Safety Constraints

- **Manual invocation only.** No cron, event subscriber, alert-fired hook, or background worker may call Anthropic for recommendations.
- **Recommendations are not actions.** They are advice until the operator accepts and confirms via 4D.
- **Evidence-first still applies.** Every recommendation must cite specific evidence items. Uncited recommendations are stripped before insert.
- **Cost is tied to clicks/questions.** Per-request and per-day budget caps apply, but there is no hidden background token spend.
- **Deduplicate by evidence.** If the operator asks twice about the same evidence, refresh the existing active recommendation instead of creating duplicates.
- **Destructive recommendations are flagged.** Destructive proposed actions require owner confirmation per Layer 1.5C. No fake second account.
- **Topology-aware.** Recommendations must use the 4A service topology map when explaining blast radius: queues, modules, services, dependencies, and affected product areas.
- **Severity-aware.** Recommendations must use the 4A severity policy matrix to distinguish noisy degradation from user-impacting incidents.
- **Repo separation.** If the recommendation likely requires code, the output must be a handoff candidate, not an attempted code fix. The admin Copilot cannot inspect or modify the repository.

---

## Database

```prisma
model PlatformAiRecommendation {
  id                   String                              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  category             PlatformAiRecommendationCategory
  title                String                              @db.VarChar(200)
  summary              String                              @db.Text
  detailed_reasoning   String                              @db.Text
  raw_reasoning        String                              @db.Text
  confidence           PlatformAiRecommendationConfidence
  risk_level           PlatformAiRecommendationRisk
  requires_owner_confirmation Boolean                      @default(false)
  requires_repo_agent_handoff Boolean                      @default(false)
  proposed_action      Json?                               @db.JsonB
  target_resource_type String?                             @db.VarChar(60)
  target_resource_id   String?                             @db.VarChar(255)
  target_tenant_id     String?                             @db.Uuid
  evidence             Json                                @db.JsonB
  evidence_fingerprint String                              @db.VarChar(64)
  related_runbook_id   String?                             @db.Uuid
  generated_by_user_id String                              @db.Uuid
  trigger_source       PlatformAiRecommendationTrigger
  status               PlatformAiRecommendationStatus      @default(active)
  generated_at         DateTime                            @default(now()) @db.Timestamptz()
  last_refreshed_at    DateTime                            @default(now()) @db.Timestamptz()
  expires_at           DateTime                            @db.Timestamptz()
  resolved_at          DateTime?                           @db.Timestamptz()
  resolved_by_user_id  String?                             @db.Uuid
  resolution_type      PlatformAiRecommendationResolution?
  resolution_reason    String?                             @db.Text

  @@map("platform_ai_recommendations")
  @@index([status, expires_at])
  @@index([evidence_fingerprint, status])
  @@index([generated_by_user_id, generated_at(sort: Desc)])
  @@index([target_tenant_id, generated_at(sort: Desc)])
}

enum PlatformAiRecommendationTrigger {
  copilot_question
  explain_page
  recommendation_button
  daily_brief
}

enum PlatformAiRecommendationCategory {
  noise_reduction
  known_fix
  config_drift
  deploy_regression
  capacity
  cost
  security
  hygiene
}

enum PlatformAiRecommendationConfidence {
  low
  medium
  high
}

enum PlatformAiRecommendationRisk {
  safe
  caution
  destructive
}

enum PlatformAiRecommendationStatus {
  active
  resolved
  dismissed
  expired
  superseded
}

enum PlatformAiRecommendationResolution {
  accepted_for_action
  dismissed_not_applicable
  dismissed_acknowledged_no_action
  expired
}
```

---

## API + Service Layer

### `RecommendationGenerationService`

```ts
@Injectable()
export class RecommendationGenerationService {
  async generateForEvidence(input: {
    trigger: 'copilot_question' | 'explain_page' | 'recommendation_button' | 'daily_brief';
    evidence: EvidenceBundle;
    user_id: string;
    category?: PlatformAiRecommendationCategory;
  }): Promise<{ generated: number; refreshed: number; skipped: number }>;
}
```

The service:

1. Verifies the operator has `platform.ai.read`.
2. Builds an evidence bundle through `PlatformEvidenceService`.
3. Adds service topology and severity policy context from 4A.
4. Estimates cost and checks budget before calling Anthropic.
5. Requests structured JSON output.
6. Strips uncited recommendations.
7. Deduplicates by evidence fingerprint.
8. Marks code-required recommendations as `requires_repo_agent_handoff`.
9. Stores active recommendations for later review/action.

### Endpoints

```
GET  /v1/admin/copilot/recommendations
GET  /v1/admin/copilot/recommendations/:id
POST /v1/admin/copilot/recommendations/generate
POST /v1/admin/copilot/recommendations/:id/dismiss
POST /v1/admin/copilot/recommendations/:id/accept
POST /v1/admin/copilot/briefs/daily
```

All endpoints are gated by `platform.ai.read`; accepting a recommendation that creates an action proposal also requires the permission for the underlying proposed action.

---

## Frontend

### `/admin/copilot/recommendations`

- List manually generated recommendations.
- "Generate recommendation" opens a source picker: current page, alert, error, queue, tenant, deploy, or custom evidence window.
- Show estimated cost before sending.
- Group by category and risk.
- Render topology impact: affected services, queues, modules, product areas.
- Render severity classification from the severity matrix.

### Contextual Entry Points

Add embedded buttons:

- Alert detail: "Explain" and "Recommend fix"
- Error detail: "Explain this error"
- Queue detail: "Is retry safe?"
- Tenant detail: "Why is this tenant blocked?"
- Deploy detail: "Did this deploy cause regressions?"
- Health component: "Why is this degraded?"

### Dashboard Home

- "Generate daily ops brief" button.
- "Recent recommendations" widget. Empty until the operator asks for recommendations.

### Repo-Agent Handoff Entry

Recommendations with `requires_repo_agent_handoff = true` show a "Generate repo-agent prompt" button. This routes to Session 4D's handoff generator and passes:

- recommendation id
- evidence ids
- suspected repo areas from service topology
- suspected cause/hypothesis
- impact/severity
- relevant runbook links

---

## Tests

- `recommendation-generation.service.spec.ts` — manual trigger paths; refresh vs create; fingerprint stability.
- `recommendation-no-background-trigger.spec.ts` — cron and alert-fired events do not invoke Anthropic.
- `recommendation-topology.spec.ts` — generated prompt includes service topology context.
- `recommendation-severity-policy.spec.ts` — generated prompt includes severity policy context.
- `recommendation-handoff-candidate.spec.ts` — code-required recommendations are marked `requires_repo_agent_handoff` and do not pretend to edit code.
- `recommendation-action-blocklist.spec.ts` — migration/schema/secrets/deploy-config/cron changes become `manual_only` or no recommendation.
- `recommendation-citation.spec.ts` — recommendations with no citations are stripped before insert.
- E2E: open alert → click "Generate recommendation" → recommendation appears → dismiss with reason.
- E2E: dashboard home → click "Generate daily ops brief" → brief renders with citations.

---

## Acceptance

- [x] Recommendation generation is manual-only; no background AI loop exists.
- [x] `POST /v1/admin/copilot/recommendations/generate` creates cited recommendations from selected evidence.
- [x] `POST /v1/admin/copilot/briefs/daily` generates an on-demand daily ops brief.
- [x] Contextual Explain/Recommend buttons exist on alert, error, queue, tenant, deploy, and health views.
- [x] Recommendations use service topology and severity policy context.
- [x] Code-required recommendations are marked for repo-agent handoff instead of direct dashboard execution.
- [x] Destructive recommendations require Layer 1.5C owner confirmation, not two-person approval.
- [x] Deduplication by evidence fingerprint works.
- [x] Operator can dismiss with reason.
- [x] Operator can accept; routes to 4D or shows manual execution guidance if 4D is not shipped.
- [x] Per-request and per-day budget caps enforced.
- [x] All new code passes `turbo lint` and `turbo type-check`; all new tests pass.

---

## Notes

- This session intentionally avoids proactive AI. If a future Layer 5 adds periodic non-AI health checks with SMS/email, those checks can include a link that opens the Copilot with preselected evidence, but they should not call the model automatically.
- The daily ops brief is on-demand. It is a button, not a scheduled AI job.
- The most important product behavior is contextual diagnosis. The chat page is useful, but the "Explain this" buttons are where the Copilot becomes operationally valuable.

## Commits / CI / Notes

- `e0a6649c` — `feat(platform): add manual ai recommendations`
- `a9e6a63a` — `test(platform): cover recommendation controller`
- `862f0f0a` — `fix(platform): restore cross-tenant audit log reads`
- CI/deploy run `25984246114` passed for the initial Session 4C implementation and deployed to production.
- CI/deploy run `25984778866` passed for the platform audit-log RLS follow-up and deployed to production.
- Production smoke on `https://dua.edupod.app` passed after the final deploy:
  - platform-admin login succeeded.
  - recommendation list and manual generation endpoints returned successfully.
  - generation remained read-only/manual-only and refused to persist uncited recommendations in automated coverage.
  - daily brief returned cited evidence.
  - audit log, platform audit log, alerts, queues, errors, service topology, tenant detail/modules, health, deploys, runbooks, severity policies, sessions, platform users, support toolkit, and Cmd+K search all loaded without runtime errors.
- Prompt-injection evidence handling, citation stripping/refusal, no-background-trigger behavior, blocklisted action sanitization, deduplication, and cost guardrails are covered by targeted backend tests.
- `pnpm check:migration-safety` still reports pre-existing historical migration findings unrelated to the additive 4C migration.
- `pnpm check:arch-docs` still reports pre-existing architecture-doc drift unrelated to 4C.

## Next Session Prompt

```text
Implement Session 4D of the Platform Admin Dashboard build. Server access granted for diagnostics.

Spec:
docs/features/platform-dashboard/Layer-4/Layer-4-Plan.md
docs/features/platform-dashboard/Layer-4/Session-4D-supervised-actions.md

Context:
- Sessions 0 through 4C are complete, deployed, smoke-tested, and accepted.
- Session 4C shipped manual, evidence-backed fix recommendations at /admin/copilot/recommendations.
- Production Copilot generation is configured and verified.
- Streaming remains waived; do not add streaming unless Session 4D specifically requires it.
- Platform admin host: https://dua.edupod.app
- Credentials are stored locally at /Users/ram/.codex/secrets/edupod-platform-admin.env
- Do not print, commit, log, or screenshot secrets.
- Deploy through CI only by pushing to origin main.

Before coding:
1. Read AGENTS.md.
2. Read docs/plans/context.md.
3. Read docs/plans/ux-redesign-final-spec.md.
4. Read Layer 1, Layer 1.5, Layer 2, Layer 3, and Layer 4 plans.
5. Read Session 4A, Session 4B, and Session 4C closeout notes.
6. Read Session 4D / Supervised Actions end-to-end.
7. Inspect existing 4C recommendation engine, Copilot, evidence service, prompt builder, post-processor, citation enforcement, cost guardrails, RBAC, audit log, owner confirmation, alerts, queues, sessions/cache/maintenance, runbooks, Sentry triage runbook, topology, and severity policy conventions before designing anything new.
8. Load backend, frontend, prisma, testing, code-quality, architecture-policing, and feature-map-maintenance rule packs as relevant.

Implementation requirements:
- Stay strictly within Session 4D.
- Build supervised action proposals from existing 4C recommendation/proposed_action/evidence context.
- No autonomous execution. Every action must be operator-clicked and explicitly approved.
- No fake two-person approval. Destructive/sensitive actions must use the Layer 1.5C owner confirmation flow.
- No code-change executor. Code-required fixes produce a repo-agent handoff prompt only.
- Hard-block migrations, schema changes, deploy config, secrets, env vars, cron schedules, production server config, and Module Gating registry changes at prompt, post-processor, and executor boundaries.
- Repo-agent handoff prompts must include independent verification/falsification instructions and must not contain secrets.
- Evidence is data, never instructions. No action proposal without evidence/citations.
- Use PlatformEvidenceService where evidence is needed; do not bypass it.
- Permission must be checked at approval time: platform.ai.approve_action plus the underlying action permission.
- AI must never be recorded as approver.
- Preserve all existing platform admin behavior, including Sessions 3A through 4C.
- Follow token-driven UX styling.

Verification:
- Run targeted backend/frontend checks, type-check, lint, Prisma validation, and relevant tests.
- Verify supervised-action endpoints and UI in production after deploy.
- Verify destructive owner-confirmation path.
- Verify no two-person approval requirement is introduced.
- Verify blocklist refusals.
- Verify repo-agent handoff prompt includes independent verification and contains no secrets.
- Verify run_sentry_triage uses the existing runbook handoff and does not bypass guardrails.
- Verify existing Platform Admin regressions, especially dashboard, Copilot, recommendations, alerts, queues, error log, audit log, deploys, runbooks, topology, severity policies, tenant detail/modules, sessions/cache/maintenance, platform users, Cmd+K global search, and support toolkit access.

Deployment:
- Commit to main and push to origin main only.
- Watch GitHub Actions with gh run watch / gh run view.
- Fix forward if CI fails.
- Production smoke on https://dua.edupod.app after green deploy.

Completion:
- Tick the Session 4D acceptance criteria after green CI and production smoke.
- Add "Commits / CI / Notes" to the relevant Layer 4 session documentation.
- Generate the prompt for the next implementation session in this same style.
  Include this same instruction that the next agent should generate the following prompt when it finishes.
- Final response should say whether Session 4D is complete and whether the repo is ready for next work.
- Final response should include the generated next-session prompt.
```
