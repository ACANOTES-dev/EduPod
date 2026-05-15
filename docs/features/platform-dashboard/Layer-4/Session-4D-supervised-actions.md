# Session 4D: Supervised Actions

**Depends on:** Sessions 4A (evidence) + 4B (Copilot infra) + 4C (recommendation engine produces the action proposals); Layer 1.5C (two-person primitive); Layer 1.5A (RBAC permission boundary); Layer 1.5B (audit ledger); existing `docs/runbooks/agent-sentry-triage.md` + `./scripts/sentry-cli.sh` + `docs/runbooks/agent-fix-log.md` (the AI inherits the existing Sentry triage guardrails — does not invent new ones)
**Unlocks:** Session 4E (postmortems reference executed AI actions in the timeline)

---

## Objective

Give the Copilot the ability to EXECUTE actions, but only with operator approval and with the existing safety guardrails inherited from the Sentry triage runbook. The AI never executes anything autonomously. Every action follows this flow:

1. Recommendation engine (4C) generates a recommendation with `proposed_action` populated.
2. Operator reviews the recommendation; clicks "Approve."
3. The system creates a `PlatformAiActionProposal` row.
4. If the action requires two-person approval per Layer 1.5C: routes through `PlatformTwoPersonService.initiate()` → second operator approves.
5. Otherwise: routes directly to the action executor.
6. Action executor performs the action with all standard guardrails (failing-test-first for code changes, 100-line cap for diffs, auto-revert on regression for deploys, audit-log for everything).
7. Result captured back on the proposal row; Copilot can reference it.

The single most important architectural commitment: **the Copilot reuses the existing Sentry triage runbook's guardrails verbatim — it does not invent new ones.** Failing-test-first, 100-line diff cap, auto-revert on post-deploy regression, mandatory audit-log entry: all come directly from `docs/runbooks/agent-sentry-triage.md`.

---

## Critical safety constraints

- **No autonomous execution. Ever.** Even for "safe" actions, the operator clicks Approve before any state change. The single exception is the Copilot acknowledging an alert that has already self-resolved (no state change beyond marking the alert acked) — and that requires `ai_action_proposed → ai_action_approved → ai_action_executed` audit chain, just with the operator's approval recorded as "auto-approved per safe-action policy."
- **Action surface blocklist (HARD).** The AI cannot propose actions that touch:
  - Database migrations or schema changes (Prisma schema edits, raw SQL DDL)
  - Deploy configuration files (`.github/workflows/*`, `scripts/deploy-*.sh`)
  - Secrets, credentials, env vars (`.env*`, `secrets.json`, anything matching `[A-Z_]+_(SECRET|KEY|TOKEN|PASSWORD)`)
  - Cron schedules (modifying `CronSchedulerService` registrations)
  - Production server config (nginx config, systemd unit files)
  - Module Gating registry edits (the canonical list is operator-controlled)
    This is enforced at THREE layers: (1) prompt instruction in 4C, (2) post-processor in 4C strips forbidden `proposed_action.kind`, (3) executor in 4D rejects forbidden actions even if they slip through. (DZ-AI-3.)
- **Sentry triage guardrails are inherited verbatim** for any action that involves code changes:
  - **Failing test first.** No diff is committed without a failing test that the diff makes pass.
  - **100-line diff cap.** Diffs above 100 lines route to manual_only.
  - **Auto-revert on post-deploy regression.** If new errors appear within 30 minutes of the deploy, auto-revert the commit.
  - **Mandatory audit entry to `docs/runbooks/agent-fix-log.md`** for every code change with an exact `git revert <sha>` rollback command.
    These are reused exactly as-is from `docs/runbooks/agent-sentry-triage.md` — see DZ-AI-Sentry-Reuse.
- **Every action emits FOUR audit entries** in the chain: `ai_action_proposed`, `ai_action_approved` (or `_rejected`), `ai_action_executed` (or `_failed`), and the underlying domain action's own audit (e.g., `alert_acknowledged`). The chain is reconstructable from `platform_audit_logs` queries.
- **Two-person approval is non-negotiable for `destructive` actions.** Even if the operator manually overrides, `requires_two_person: true` permissions go through `PlatformTwoPersonService.initiate()`. The AI is the initiator (audit_action `ai_action_proposed`); a second operator is the approver. If only one platform_owner exists, the action is BLOCKED with the same error as Layer 1.5C — invite a second owner first.
- **The AI cannot approve its own actions.** Even though the AI is technically the proposer, the operator who clicks "Approve" in the UI is the recorded approver. The AI has no authority to approve.

---

## Database

### New tables

```prisma
model PlatformAiActionProposal {
  id                  String                              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recommendation_id   String?                             @db.Uuid                // links back to 4C recommendation if originated there
  proposed_by         PlatformAiActionProposalSource       // 'recommendation_engine' | 'copilot_conversation'
  proposed_at         DateTime                            @default(now()) @db.Timestamptz()
  action_kind         String                              @db.VarChar(40)          // matches the recommendation proposed_action.kind enum
  action_payload      Json                                @db.JsonB
  target_resource_type String?                            @db.VarChar(60)
  target_resource_id  String?                             @db.VarChar(255)
  target_tenant_id    String?                             @db.Uuid
  reasoning           String                              @db.Text                 // operator-readable why-this
  required_permission String                              @db.VarChar(120)         // the permission key the executing operator must have
  requires_two_person Boolean                             @default(false)
  evidence            Json                                @db.JsonB                // evidence snapshot at proposal time
  status              PlatformAiActionProposalStatus      @default(awaiting_approval)
  approved_by_user_id String?                             @db.Uuid
  approved_at         DateTime?                           @db.Timestamptz()
  rejected_by_user_id String?                             @db.Uuid
  rejected_at         DateTime?                           @db.Timestamptz()
  rejection_reason    String?                             @db.Text
  two_person_request_id String?                           @db.Uuid                 // populated when routed through 1.5C
  executed_at         DateTime?                           @db.Timestamptz()
  execution_result    Json?                               @db.JsonB                // executor output (success info or failure detail)
  execution_failed_at DateTime?                           @db.Timestamptz()
  expires_at          DateTime                            @db.Timestamptz()        // proposed_at + 30 min default; can extend per action

  recommendation      PlatformAiRecommendation?           @relation(fields: [recommendation_id], references: [id], onDelete: SetNull)
  approved_by         User?                               @relation("AiProposalApprovedBy", fields: [approved_by_user_id], references: [id], onDelete: SetNull)
  rejected_by         User?                               @relation("AiProposalRejectedBy", fields: [rejected_by_user_id], references: [id], onDelete: SetNull)
  two_person_request  PlatformTwoPersonRequest?           @relation(fields: [two_person_request_id], references: [id], onDelete: SetNull)

  @@map("platform_ai_action_proposals")
  @@index([status, expires_at])
  @@index([recommendation_id])
  @@index([proposed_at(sort: Desc)])
}

enum PlatformAiActionProposalStatus {
  awaiting_approval
  approved
  awaiting_two_person_approval
  rejected
  expired
  executing
  executed
  execution_failed
}

enum PlatformAiActionProposalSource {
  recommendation_engine
  copilot_conversation
}
```

---

## Action executor registry

Per Layer 1.5C, two-person executors live in `apps/api/src/modules/platform-two-person/action-executors/`. Layer 4D adds a parallel registry for AI-originated executors that wrap the existing operator-side actions:

`apps/api/src/modules/platform-ai-copilot/ai-action-executors/`:

Initial executors shipping in this session:

| `action_kind`          | Underlying operation                                                                                                  | Permission required                                    | Two-person?                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------- |
| `silence_alert`        | Calls `PlatformAlertSilenceService.create`                                                                            | `platform.alerts.silence`                              | No                                  |
| `acknowledge_alert`    | Calls `PlatformAlertHistoryService.acknowledge`                                                                       | `platform.alerts.acknowledge`                          | No                                  |
| `retry_jobs`           | Calls BullMQ `job.retry()` for the listed job ids                                                                     | `platform.queues.retry`                                | No                                  |
| `open_github_issue`    | Posts to GitHub Issues API via existing `gh` integration                                                              | `platform.audit_log.view` (low bar; safe)              | No                                  |
| `schedule_maintenance` | Calls `PlatformMaintenanceWindowService.create`                                                                       | `platform.maintenance.toggle`                          | No                                  |
| `run_sentry_triage`    | Hands off to `./scripts/sentry-cli.sh` per the existing runbook; AI reads the triage output and may propose follow-up | `platform.audit_log.view` + existing Sentry guardrails | No (read-only inside Sentry triage) |
| `rollback_deploy`      | Triggers a CI revert workflow                                                                                         | `platform.maintenance.toggle`                          | YES                                 |
| `flush_tenant_cache`   | Calls cache invalidation for one tenant's namespace                                                                   | `platform.cache.flush_tenant`                          | No                                  |
| `flush_global_cache`   | Calls global cache flush                                                                                              | `platform.cache.flush_global`                          | YES                                 |
| `clean_queue`          | Calls BullMQ `queue.clean()` for stuck jobs                                                                           | `platform.queues.clean`                                | YES                                 |
| `manual_only`          | Records the recommendation; no execution; operator follows the linked runbook                                         | (any read permission)                                  | N/A                                 |

Each executor implements:

```ts
interface AiActionExecutor {
  action_kind: string;
  required_permission: string;
  requires_two_person: boolean;

  /**
   * Validate the payload schema. Reject malformed payloads.
   */
  validate(payload: unknown): { valid: boolean; errors?: string[] };

  /**
   * Execute the action. Called only after operator approval (and two-person
   * approval if required). Must be idempotent — same payload + same target
   * = same result, including no double-effects.
   */
  execute(
    payload: unknown,
    context: { initiator: 'ai'; approver_user_id: string },
  ): Promise<{ success: boolean; result: unknown; failure_reason?: string }>;
}
```

### Sentry triage handoff (`run_sentry_triage`)

This executor is special — it's the bridge between the AI Copilot and the existing Sentry triage runbook. The AI proposes "run the existing Sentry triage on this fingerprint"; on operator approval, the executor:

1. Records the proposal in `platform_ai_action_proposals` and the audit log.
2. Spawns the existing `./scripts/sentry-cli.sh` workflow with the fingerprint as input.
3. Reads the output (Sentry's existing classification: `is-fixed`, `still-occurring`, `regressed`, etc.).
4. Returns the output to the Copilot.
5. The Copilot may follow up with a new recommendation (e.g., "Sentry says still-occurring; based on stack trace this is a known pattern; proposed fix: <runbook link>").

The executor does NOT cross into running `agent-sentry-triage.md` itself — that's a human-led runbook. It only invokes the read-only Sentry queries.

### Code-change executors are deferred

This session does NOT include `draft_fix_branch` as a Layer 4D action. The reasoning:

- Drafting a fix branch overlaps with the existing autonomous Sentry triage runbook (`docs/runbooks/agent-sentry-triage.md`). That runbook is the source of truth for "AI proposes a code fix"; it has the failing-test-first, 100-line cap, auto-revert guardrails baked in. Re-implementing it inside the dashboard executor risks divergence.
- The right Layer 4D pattern: the AI Copilot SUGGESTS that the operator runs the existing Sentry triage; the operator clicks "Open Sentry triage workflow" in the dashboard which invokes the existing runbook. The AI does not directly draft the branch from Layer 4D.
- A future Layer 4F (or 5A) could ship a tighter integration where the AI runs the full Sentry triage end-to-end. That requires a separate spec with explicit treatment of repo-write permissions, branch protection, and the reuse of the existing audit log at `docs/runbooks/agent-fix-log.md`. Out of scope for 4D.

This is a deliberate scope choice. The reviewer flagged it as a feature; this spec defers it for safety.

---

## API + service layer

### `PlatformAiActionProposalsService`

```ts
@Injectable()
export class PlatformAiActionProposalsService {
  /**
   * Called by 4C when a recommendation is accepted, OR by 4B when the
   * Copilot conversation produces an action proposal directly.
   *
   * 1. Validates the action_kind exists in the registry
   * 2. Runs the executor's validate() on the payload
   * 3. Determines required_permission + requires_two_person from the executor
   * 4. Creates the PlatformAiActionProposal row
   * 5. Audit-logs ai_action_proposed
   */
  async create(input: {
    source: PlatformAiActionProposalSource;
    recommendation_id?: string;
    action_kind: string;
    action_payload: unknown;
    reasoning: string;
    evidence: EvidenceItem[];
    target_resource_type?: string;
    target_resource_id?: string;
    target_tenant_id?: string;
  }): Promise<PlatformAiActionProposal>;

  /**
   * Operator approves. Verifies operator has the required_permission.
   * If requires_two_person: routes through PlatformTwoPersonService.initiate
   * (this proposal sits in 'awaiting_two_person_approval' until the second
   * operator approves; then the executor runs).
   * Otherwise: marks 'approved', dispatches to executor immediately.
   */
  async approve(proposal_id: string, approver_user_id: string): Promise<void>;

  async reject(proposal_id: string, rejector_user_id: string, reason: string): Promise<void>;

  /**
   * Internal — called after two-person approval completes OR direct approval
   * for non-two-person actions.
   */
  private async dispatchToExecutor(
    proposal: PlatformAiActionProposal,
    approver_user_id: string,
  ): Promise<void>;
}
```

### Cleanup cron

Daily at 04:50 UTC: mark `awaiting_approval` proposals where `expires_at < now()` as `expired`. Audit-log per expiration.

### New controllers

```
GET    /v1/admin/copilot/action-proposals             -> list active proposals (for the operator to action)
GET    /v1/admin/copilot/action-proposals/:id         -> single proposal detail
POST   /v1/admin/copilot/action-proposals/:id/approve -> approve (routes through two-person if required)
POST   /v1/admin/copilot/action-proposals/:id/reject  -> reject with reason
```

All gated by `platform.ai.approve_action`.

---

## Frontend

### Components

- `<ActionProposalCard>` — used both standalone (in the proposals page) and inline in 4B Copilot conversations. Shows: action kind badge, reasoning, evidence chips, risk indicator, "Approve" + "Reject" buttons.
- `<ActionPreviewDiff>` — for actions that include a diff (currently only `manual_only` includes a code diff suggestion; future code-change executors will use this). Renders syntax-highlighted before/after.
- `<TwoPersonProposalBanner>` — shown on a proposal that's routed through two-person; displays the second-approver list and the request status.

### Integration

- The `/admin/copilot/recommendations` page (4C) — "Accept" button on a recommendation creates an action proposal and navigates to it.
- The `/admin/copilot` conversation view (4B) — Copilot responses can include `<ActionProposalCard>` inline.
- Proposals list page: `/admin/copilot/action-proposals`.

### Approval UX

- Approving a non-two-person action: single confirmation modal (reuses Layer 1.5C `<DestructiveConfirmDialog>`); on confirm, executor runs immediately and the result appears in the proposal detail.
- Approving a two-person action: routes to `/admin/two-person-requests/:id` (Layer 1.5C); operator awaits second approver. Result appears once second approval lands.

---

## Tests

### Unit

- `ai-action-proposals.service.spec.ts` — create routes correctly per requires_two_person; expired proposals can't be approved; permission check enforced.
- Each executor — payload validation; idempotency; execution success path; execution failure path; correct audit emission.

### Integration

- `proposal-end-to-end.spec.ts` — recommendation accepted → proposal created → operator approves → executor runs → execution_result populated → 4 audit entries present.
- `proposal-two-person-end-to-end.spec.ts` — destructive proposal accepted → routed to two-person → second operator approves → executor runs.

### Critical

- `proposal-action-blocklist.spec.ts` — feed a payload attempting to invoke a forbidden action_kind (e.g., a hand-crafted POST that bypasses the recommendation engine). Assert the executor registry rejects with `403 NO_EXECUTOR` and audit-logs the attempt.
- `proposal-permission-enforcement.spec.ts` — operator without the required_permission tries to approve. Reject with 404 `PLATFORM_PERMISSION_DENIED` (mirrors `PlatformRoleGuard` from 1.5A).
- `proposal-self-approval-impossible.spec.ts` — even though the AI is the proposer, no operator-side flow allows the AI to be recorded as approver. Verify by inspecting the controller's approve endpoint.
- `proposal-sentry-handoff.spec.ts` — `run_sentry_triage` executor invokes the existing `./scripts/sentry-cli.sh` script and returns its output without modifying any state.

---

## Acceptance

- [ ] `PlatformAiActionProposalsService` exists with create / approve / reject.
- [ ] At least 8 action executors registered (silence_alert, acknowledge_alert, retry_jobs, open_github_issue, schedule_maintenance, run_sentry_triage, flush_tenant_cache, manual_only). Destructive executors (rollback_deploy, flush_global_cache, clean_queue) registered with two-person routing.
- [ ] Action blocklist enforced at all three layers (prompt + post-processor + executor side).
- [ ] Two-person routing works end-to-end via Layer 1.5C primitive.
- [ ] Frontend pages: `/admin/copilot/action-proposals` page; `<ActionProposalCard>` usable both standalone and inline in 4B.
- [ ] Approval through `<TwoPersonConfirmationDialog>` (1.5C) for destructive actions.
- [ ] Every approved + executed action emits the full 4-entry audit chain.
- [ ] `run_sentry_triage` executor invokes `./scripts/sentry-cli.sh` and returns its output to the Copilot.
- [ ] Code-change executor explicitly NOT shipped in this session; documented as deferred.
- [ ] Cost guardrail: action proposal generation reuses the recommendation engine's per-day budget; no new budget surface.
- [ ] `docs/architecture/danger-zones.md` gains DZ-AI-3 (action surface blocklist) and DZ-AI-Sentry-Reuse (Layer 4D inherits Sentry triage guardrails — must NOT be re-implemented divergently).
- [ ] All new code passes `turbo lint` and `turbo type-check`; all new tests pass.

---

## Notes

- The decision to defer `draft_fix_branch` is the single most important scope call in this session. The existing Sentry triage runbook with `agent-fix-log.md` audit is mature, hardened, and known to work. Reimplementing inside the Copilot risks divergence + a security regression. Future spec to integrate them tightly is the right path.
- The two-person primitive from 1.5C is reused verbatim — the AI is the initiator, the operator is the approver. Same expiration, same audit, same email-to-other-owners. This means destructive AI actions inherit the safety story of operator-initiated destructive actions.
- The 4-entry audit chain (proposed / approved / executed / underlying-action) is verbose but enables clean post-incident reconstruction in 4E. Each entry has its own row; queries filter by `actor='ai_copilot'` to see "what did the AI do today" or by `target_tenant_id` to see "what was done on tenant X this week."
- Anthropic costs in 4D are minimal — the proposal payload generation happens in 4C; 4D only handles operator-initiated approval flow which doesn't call Anthropic. The Sentry triage handoff has its own cost via the existing runbook's Anthropic usage; tracked in 4C's daily budget.
- Future enhancement (out of scope here): a "rollback this AI action" endpoint that auto-reverts the executor's effect when possible (e.g., un-silencing an alert, un-acknowledging). Defer until usage patterns show false-positive AI actions are common.
