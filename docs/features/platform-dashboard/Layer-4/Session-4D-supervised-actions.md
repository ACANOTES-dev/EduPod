# Session 4D: Supervised Actions

**Depends on:** Sessions 4A (evidence) + 4B (Copilot infra) + 4C (manual recommendations); Layer 1.5C (owner confirmation primitive); Layer 1.5A (RBAC permission boundary); Layer 1.5B (audit ledger); existing `docs/runbooks/agent-sentry-triage.md` + `./scripts/sentry-cli.sh` + `docs/runbooks/agent-fix-log.md`
**Unlocks:** Session 4E (postmortems reference executed AI actions in the timeline)

---

## Objective

Give the Copilot the ability to prepare executable actions, but only after the operator explicitly approves. The AI never executes anything autonomously.

Flow:

1. Operator asks for advice or manually generates a recommendation.
2. Recommendation includes a structured `proposed_action`.
3. Operator reviews the proposal and clicks "Approve".
4. If the action is high-blast, the UI opens Layer 1.5C's `<OwnerActionConfirmDialog>`.
5. The signed-in `platform_owner` confirms the exact target/action, types the confirmation phrase, and provides a reason.
6. Executor runs.
7. Result is written back to the action proposal and platform audit log.

There is no two-person approval requirement. EduPod is a solo-operator system for the next year, so blocking dangerous actions until a second account approves would create fake safety. The real safety controls are RBAC, explicit owner confirmation, audit logging, blocklists, and no autonomous execution.

For code-required fixes, this session ships a **repo-agent handoff prompt generator**, not repository access. The admin console must not clone, read, write, or commit the codebase. It produces a detailed prompt for a separate repo agent.

---

## Critical Safety Constraints

- **No autonomous execution. Ever.** Every action begins with a human click.
- **No fake dual approval.** Destructive AI actions route through owner confirmation, not second-approver workflow.
- **Action surface blocklist is hard.** The AI cannot propose or execute actions that touch migrations/schema, deploy config, secrets/env vars, cron schedules, production server config, or the Module Gating registry.
- **Code-change executor is not shipped here.** The Copilot may suggest running the existing Sentry triage workflow, but it does not draft branches from inside the dashboard in this session.
- **Repo-agent handoff is not a fix.** It packages evidence and a hypothesis. The repo agent must independently verify or falsify that hypothesis before implementing code changes.
- **Handoff prompts cannot contain secrets.** Evidence is redacted through Layer 1.5B before prompt generation, and the generator performs a final secret-pattern scan.
- **Every action emits audit entries.** At minimum: proposed, approved/rejected, executed/failed, plus the underlying domain action audit entry when applicable.
- **Operator permission is checked at approval time.** `platform.ai.approve_action` is not enough by itself; the approving operator must also have the permission required by the underlying action.
- **AI cannot approve itself.** The recorded approver is always the signed-in platform user.

---

## Database

```prisma
model PlatformAiActionProposal {
  id                          String                         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recommendation_id           String?                        @db.Uuid
  proposed_by                 PlatformAiActionProposalSource
  proposed_at                 DateTime                       @default(now()) @db.Timestamptz()
  action_kind                 String                         @db.VarChar(40)
  action_payload              Json                           @db.JsonB
  target_resource_type        String?                        @db.VarChar(60)
  target_resource_id          String?                        @db.VarChar(255)
  target_tenant_id            String?                        @db.Uuid
  reasoning                   String                         @db.Text
  required_permission         String                         @db.VarChar(120)
  requires_owner_confirmation Boolean                        @default(false)
  evidence                    Json                           @db.JsonB
  status                      PlatformAiActionProposalStatus @default(awaiting_approval)
  approved_by_user_id         String?                        @db.Uuid
  approved_at                 DateTime?                      @db.Timestamptz()
  rejected_by_user_id         String?                        @db.Uuid
  rejected_at                 DateTime?                      @db.Timestamptz()
  rejection_reason            String?                        @db.Text
  owner_confirmation_id       String?                        @db.Uuid
  executed_at                 DateTime?                      @db.Timestamptz()
  execution_result            Json?                          @db.JsonB
  execution_failed_at         DateTime?                      @db.Timestamptz()
  expires_at                  DateTime                       @db.Timestamptz()

  @@map("platform_ai_action_proposals")
  @@index([status, expires_at])
  @@index([recommendation_id])
  @@index([target_tenant_id])
}

enum PlatformAiActionProposalSource {
  recommendation_engine
  copilot_conversation
}

enum PlatformAiActionProposalStatus {
  awaiting_approval
  approved
  rejected
  executing
  executed
  failed
  expired
}

model PlatformAgentHandoffPrompt {
  id                   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  created_by_user_id   String   @db.Uuid
  recommendation_id    String?  @db.Uuid
  incident_id          String?  @db.Uuid
  title                String   @db.VarChar(200)
  summary              String   @db.Text
  hypothesis           String   @db.Text
  prompt_markdown      String   @db.Text
  evidence             Json     @db.JsonB
  suspected_repo_areas String[] @default([])
  created_at           DateTime @default(now()) @db.Timestamptz()

  @@map("platform_agent_handoff_prompts")
  @@index([created_by_user_id, created_at(sort: Desc)])
  @@index([recommendation_id])
  @@index([incident_id])
}
```

---

## Executor Registry

Initial action kinds:

| Action kind                   | Behavior                                                     | Permission                    | Owner confirmation                       |
| ----------------------------- | ------------------------------------------------------------ | ----------------------------- | ---------------------------------------- |
| `silence_alert`               | Creates alert silence via 1.5C                               | `platform.alerts.silence`     | No                                       |
| `acknowledge_alert`           | Acknowledges/resolves alert                                  | `platform.alerts.acknowledge` | No                                       |
| `retry_jobs`                  | Retries selected failed jobs                                 | `platform.queues.retry`       | No unless count exceeds policy threshold |
| `flush_tenant_cache`          | Flushes one tenant cache scope                               | `platform.cache.flush_tenant` | No                                       |
| `flush_global_cache`          | Flushes global cache                                         | `platform.cache.flush_global` | Yes                                      |
| `clean_queue`                 | Cleans jobs from queue                                       | `platform.queues.clean`       | Yes                                      |
| `schedule_maintenance`        | Creates alert-maintenance window                             | `platform.maintenance.toggle` | No                                       |
| `open_github_issue`           | Opens/drafts issue if GitHub integration exists              | `platform.ai.approve_action`  | No                                       |
| `run_sentry_triage`           | Starts existing Sentry triage runbook handoff                | `platform.audit_log.view`     | No                                       |
| `generate_repo_agent_handoff` | Creates a copyable prompt for the repo agent; no code access | `platform.ai.read`            | No                                       |
| `manual_only`                 | Records recommendation only                                  | Any read permission           | N/A                                      |

Forbidden executor kinds must return `403 NO_EXECUTOR` and audit-log the attempt.

---

## API

```
POST /v1/admin/copilot/action-proposals
GET  /v1/admin/copilot/action-proposals
GET  /v1/admin/copilot/action-proposals/:id
POST /v1/admin/copilot/action-proposals/:id/approve
POST /v1/admin/copilot/action-proposals/:id/reject
POST /v1/admin/copilot/agent-handoffs
GET  /v1/admin/copilot/agent-handoffs/:id
```

Approving a proposal:

1. Verifies proposal is not expired.
2. Verifies operator has `platform.ai.approve_action`.
3. Verifies operator has `required_permission`.
4. If `requires_owner_confirmation`, requires an `owner_confirmation_id` from Layer 1.5C.
5. Executes via registry.
6. Writes audit chain.

---

## Frontend

- `<ActionProposalCard>` — shows action kind, reasoning, evidence, risk, and approve/reject.
- `<ActionPreviewDiff>` — shows the exact payload/effect before approval.
- `<OwnerActionConfirmDialog>` — reused for high-blast proposals.
- `<RepoAgentHandoffPanel>` — shows the generated prompt, evidence links, suspected repo areas, and copy button.
- Proposal cards appear in `/admin/copilot`, `/admin/copilot/recommendations`, and any contextual "Recommend fix" flow.

---

## Repo-Agent Handoff Prompt Contract

Generated prompts must follow this structure:

```markdown
# EduPod Incident Fix Handoff

## Mission

Investigate and fix the incident described below in the EduPod repository.

## Critical Instruction

The admin Copilot hypothesis is NOT authoritative. First gather repo context, logs, tests, and relevant source code. Independently verify or falsify the hypothesis before implementing. If your investigation reaches a different conclusion, stop and report the mismatch to Ram before making code changes.

## Incident Summary

- What is wrong:
- Affected tenant(s):
- Affected product area(s):
- Severity:
- Started at:
- Current status:

## Evidence From Admin Console

- Evidence item links/ids:
- Deploy correlation:
- Error fingerprints:
- Queue/job ids:
- Health snapshots:
- Audit entries:
- Relevant runbooks:

## Copilot Hypothesis

...

## Suspected Repo Areas

These are starting points from the operator-maintained topology map, not proof:

- ...

## Expected Agent Workflow

1. Read AGENTS.md and required rule packs.
2. Inspect the suspected areas and related tests.
3. Reproduce or add a failing test where practical.
4. Decide whether the Copilot hypothesis is correct.
5. If correct: implement the minimal fix, run targeted tests, lint/type-check as needed, commit, push, watch CI, production-smoke.
6. If incorrect or incomplete: report the evidence and wait for Ram.

## Constraints

- Do not print or commit secrets.
- Do not edit production server files directly.
- Deploy only through CI.
- Stage only explicit files touched by the fix.
```

---

## Tests

- `ai-action-proposals.service.spec.ts` — create/approve/reject; expired proposals cannot be approved; permission check enforced.
- `proposal-owner-confirmation.spec.ts` — high-blast proposal cannot execute without owner confirmation; executes after confirmation.
- `proposal-end-to-end.spec.ts` — recommendation accepted → proposal created → owner approves → executor runs → audit entries present.
- `proposal-action-blocklist.spec.ts` — forbidden action kinds are rejected and audit-logged.
- `proposal-no-two-person.spec.ts` — no action path requires a second platform account.
- `proposal-self-approval-impossible.spec.ts` — AI is never recorded as approver.
- `repo-agent-handoff-prompt.spec.ts` — prompt includes independent-verification instruction, evidence ids, suspected repo areas, and no secrets.

---

## Acceptance

- [ ] `PlatformAiActionProposalsService` exists with create / approve / reject.
- [ ] At least 9 action executors/handlers registered: silence_alert, acknowledge_alert, retry_jobs, open_github_issue, schedule_maintenance, run_sentry_triage, flush_tenant_cache, generate_repo_agent_handoff, manual_only.
- [ ] Destructive executors such as flush_global_cache and clean_queue require owner confirmation.
- [ ] No two-person or second-account approval is required anywhere.
- [ ] Every approved + executed action emits the full audit chain.
- [ ] Action blocklist enforced at prompt, post-processor, and executor layers.
- [ ] Code-change executor explicitly not shipped in this session.
- [ ] Repo-agent handoff prompt generator exists and stores copyable prompts in `platform_agent_handoff_prompts`.
- [ ] `run_sentry_triage` executor invokes the existing runbook handoff and returns output to the Copilot.
- [ ] All tests pass, including no-two-person coverage.

---

## Notes

- The important boundary is not "two people"; it is "the AI cannot act unless Ram explicitly confirms." For the solo phase, that is the correct control.
- A future team-mode feature could add real multi-approver policies later, but it should be consciously introduced when there is actually another human operator.
