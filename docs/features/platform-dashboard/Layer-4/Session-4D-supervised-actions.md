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

- [x] `PlatformAiActionProposalsService` exists with create / approve / reject.
- [x] At least 9 action executors/handlers registered: silence_alert, acknowledge_alert, retry_jobs, open_github_issue, schedule_maintenance, run_sentry_triage, flush_tenant_cache, generate_repo_agent_handoff, manual_only.
- [x] Destructive executors such as flush_global_cache and clean_queue require owner confirmation.
- [x] No two-person or second-account approval is required anywhere.
- [x] Every approved + executed action emits the full audit chain.
- [x] Action blocklist enforced at prompt, post-processor, and executor layers.
- [x] Code-change executor explicitly not shipped in this session.
- [x] Repo-agent handoff prompt generator exists and stores copyable prompts in `platform_agent_handoff_prompts`.
- [x] `run_sentry_triage` executor invokes the existing runbook handoff and returns output to the Copilot.
- [x] All tests pass, including no-two-person coverage.

---

## Commits / CI / Notes

Commits:

- `9a9936e2 feat(platform): add supervised ai action proposals`
- `0a95782c fix(platform): clarify handoff verification prompt`

CI:

- GitHub Actions `25992078697` passed and deployed `9a9936e2`.
- GitHub Actions `25992706855` passed and deployed `0a95782c`.

Verification:

- Local targeted checks passed: Prisma generate/validate, shared/web/api type-check, web/api lint, focused platform AI action-proposal Jest coverage, API surface snapshot, and full `pnpm test`.
- Local pre-push `validate:ci` passed for the fix-forward commit.
- Production smoke on `https://dua.edupod.app` passed after the green deploy. The smoke verified platform-admin login, supervised-action endpoints, manual approval execution with the signed-in operator as approver, owner-confirmation refusal for destructive approval without the Layer 1.5C owner confirmation body, blocklist refusal, Sentry runbook handoff, repo-agent handoff prompt verification/falsification wording, no secret-like prompt content, Cmd+K/global search API, and existing Platform Admin pages: dashboard, Copilot, recommendations, alerts, queues, error log, audit log, deploys, runbooks, topology, severity policies, tenants, sessions/cache, maintenance, platform users, and support users.
- Production recommendation generation returned valid empty results for live health, queue, error, and tenant contexts during smoke. To exercise 4D's strict "no proposal without cited recommendation evidence" boundary, a short-lived production smoke recommendation with cited queue evidence was inserted through diagnostics and used only for supervised-action verification.

Notes:

- No streaming was added.
- No autonomous execution was added.
- No two-person approval flow was introduced.
- Code-required fixes still produce repo-agent handoff prompts only.
- `run_sentry_triage` creates the existing runbook handoff and does not run Sentry triage or bypass the Sentry guardrails.

---

## Generated Next-Session Prompt

```text
Implement Session 4E of the Platform Admin Dashboard build. Server access granted for diagnostics.

Spec:
docs/features/platform-dashboard/Layer-4/Layer-4-Plan.md
docs/features/platform-dashboard/Layer-4/Session-4E-incident-postmortems.md

Context:
- Sessions 0 through 4D are complete, deployed, smoke-tested, and accepted.
- Session 4D shipped supervised action proposals from 4C recommendations, owner-confirmed destructive/sensitive action approval, repo-agent handoff prompts, Sentry runbook handoffs, executor blocklists, and no-two-person/no-autonomous-execution guarantees.
- Production Copilot generation is configured and verified, but recommendation generation may validly return no recommendations for some evidence contexts.
- Streaming remains waived; do not add streaming unless Session 4E specifically requires it.
- Platform admin host: https://dua.edupod.app
- Credentials are stored locally at /Users/ram/.codex/secrets/edupod-platform-admin.env
- Do not print, commit, log, or screenshot secrets.
- Deploy through CI only by pushing to origin main.

Before coding:
1. Read AGENTS.md.
2. Read docs/plans/context.md.
3. Read docs/plans/ux-redesign-final-spec.md.
4. Read Layer 1, Layer 1.5, Layer 2, Layer 3, and Layer 4 plans.
5. Read Session 4A, Session 4B, Session 4C, and Session 4D closeout notes.
6. Read Session 4E / Incident Learning + Postmortems end-to-end.
7. Inspect existing alerts, alert history, alert evaluation, owner confirmation, platform evidence, Copilot, prompt builder, post-processor, citation enforcement, redaction, cost guardrails, recommendations, supervised action proposals, audit log, runbooks, topology, severity policy, queues, sessions/cache/maintenance, and platform dashboard shell conventions before designing anything new.
8. Load backend, frontend, prisma, testing, worker, code-quality, architecture-policing, and feature-map-maintenance rule packs as relevant.

Implementation requirements:
- Stay strictly within Session 4E.
- Create structured platform incidents from normal non-AI alert logic; do not run AI in the background.
- Critical alert fires create or attach to an incident using conservative non-AI matching.
- Related alerts attach to the same incident without downgrading severity.
- Auto-resolve must be conservative: only after all contributing alerts are resolved and the incident has been quiet in monitoring for the specified period.
- Postmortem generation/regeneration must be operator-clicked, cost-guarded, rate-limited, and never automatic.
- Postmortems are markdown drafts, operator-editable, and persisted only through explicit operator save/publish actions.
- Reuse PlatformEvidenceService where evidence is needed; do not bypass it.
- Every postmortem claim must be citation-backed; uncited claims must be stripped or refused.
- Run the standard redaction pipeline as a final pass before persisting postmortem content.
- AI must never directly write or modify docs/runbooks/*.md. It may propose runbook updates only as operator-reviewed prevention recommendations.
- Prevention recommendations must be manually generated and linked back to the incident through existing 4C recommendation rows.
- Preserve all existing platform admin behavior, including Sessions 3A through 4D.
- Follow token-driven UX styling.

Verification:
- Run targeted backend/frontend checks, type-check, lint, Prisma validation, and relevant tests.
- Verify incident detection service behavior: new critical alert creates incident, related alert attaches, resolved alerts move incident to monitoring, quiet period auto-resolves.
- Verify postmortem generation is manual, rate-limited, cost-guarded, citation-enforced, and redacted.
- Verify postmortem editing/publishing persists final markdown without mutating the AI draft unexpectedly.
- Verify generate-prevention creates 4C recommendation rows linked to the incident and does not execute or apply changes.
- Verify no runbook file writes occur from AI generation.
- Verify existing Platform Admin regressions, especially dashboard, Copilot, recommendations, supervised action proposals, alerts, queues, error log, audit log, deploys, runbooks, topology, severity policies, tenant detail/modules, sessions/cache/maintenance, platform users, Cmd+K global search, and support toolkit access.

Deployment:
- Commit to main and push to origin main only.
- Watch GitHub Actions with gh run watch / gh run view.
- Fix forward if CI fails.
- Production smoke on https://dua.edupod.app after green deploy.

Completion:
- Tick the Session 4E acceptance criteria after green CI and production smoke.
- Add "Commits / CI / Notes" to the relevant Layer 4 session documentation.
- Generate the prompt for the next implementation session in this same style.
  Include this same instruction that the next agent should generate the following prompt when it finishes.
- Final response should say whether Session 4E is complete and whether the repo is ready for next work.
- Final response should include the generated next-session prompt.
```

---

## Notes

- The important boundary is not "two people"; it is "the AI cannot act unless Ram explicitly confirms." For the solo phase, that is the correct control.
- A future team-mode feature could add real multi-approver policies later, but it should be consciously introduced when there is actually another human operator.
