# Claude vs GPT Health Recovery Comparison

I think the Claude plan is the stronger execution artifact, but the weaker standalone truth model.

## Findings

- `[High]` The scoring model is materially overstated because it excludes frontend health from the score while still claiming `7.7 -> 9.5`. That makes its headline number non-comparable to a real whole-system health score, especially given the current frontend test gap. See [Claude plan#L4](/Users/ram/Desktop/SDB/docs/audits/claude/Audit-Claude-2026-04-03/key-deliverables/health-recovery-plan_2026-04-03.md#L4) and [Claude plan#L9](/Users/ram/Desktop/SDB/docs/audits/claude/Audit-Claude-2026-04-03/key-deliverables/health-recovery-plan_2026-04-03.md#L9), versus [GPT plan#L129](/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/health-recovery-plan_20260403T130928+0100.md#L129).
- `[High]` It misses several of the highest-confidence live-risk items from the GPT audit: search RBAC, login tenant override, approval callback status/schema safety, worker instrumentation boot, and code-plus-database rollback/off-site restore. Those are central in [GPT plan#L33](/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/health-recovery-plan_20260403T130928+0100.md#L33) and [GPT plan#L58](/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/health-recovery-plan_20260403T130928+0100.md#L58), and their absence is the biggest weakness in the Claude version.
- `[Medium]` The Claude plan is much more delivery-ready than mine. The bucketing, dependencies, acceptance criteria, and verification protocol are all better operational scaffolding. See [Claude plan#L32](/Users/ram/Desktop/SDB/docs/audits/claude/Audit-Claude-2026-04-03/key-deliverables/health-recovery-plan_2026-04-03.md#L32), [Claude plan#L633](/Users/ram/Desktop/SDB/docs/audits/claude/Audit-Claude-2026-04-03/key-deliverables/health-recovery-plan_2026-04-03.md#L633), and [Claude plan#L709](/Users/ram/Desktop/SDB/docs/audits/claude/Audit-Claude-2026-04-03/key-deliverables/health-recovery-plan_2026-04-03.md#L709).
- `[Medium]` It over-indexes on spec-file completeness and large-scale RLS test count. That will improve surface metrics, but not necessarily refactor safety in proportion to the effort. The clearest examples are [Claude plan#L108](/Users/ram/Desktop/SDB/docs/audits/claude/Audit-Claude-2026-04-03/key-deliverables/health-recovery-plan_2026-04-03.md#L108), [Claude plan#L189](/Users/ram/Desktop/SDB/docs/audits/claude/Audit-Claude-2026-04-03/key-deliverables/health-recovery-plan_2026-04-03.md#L189), and [Claude plan#L595](/Users/ram/Desktop/SDB/docs/audits/claude/Audit-Claude-2026-04-03/key-deliverables/health-recovery-plan_2026-04-03.md#L595).
- `[Medium]` It has several good additions that my plan missed and that look genuinely useful: file upload hardening, required `ENCRYPTION_KEY`, blocking `pnpm audit`, ClamAV, centralized logging, metrics, and key rotation tooling. Those are solid adds, not fluff. See [Claude plan#L65](/Users/ram/Desktop/SDB/docs/audits/claude/Audit-Claude-2026-04-03/key-deliverables/health-recovery-plan_2026-04-03.md#L65), [Claude plan#L72](/Users/ram/Desktop/SDB/docs/audits/claude/Audit-Claude-2026-04-03/key-deliverables/health-recovery-plan_2026-04-03.md#L72), [Claude plan#L95](/Users/ram/Desktop/SDB/docs/audits/claude/Audit-Claude-2026-04-03/key-deliverables/health-recovery-plan_2026-04-03.md#L95), [Claude plan#L433](/Users/ram/Desktop/SDB/docs/audits/claude/Audit-Claude-2026-04-03/key-deliverables/health-recovery-plan_2026-04-03.md#L433), and [Claude plan#L455](/Users/ram/Desktop/SDB/docs/audits/claude/Audit-Claude-2026-04-03/key-deliverables/health-recovery-plan_2026-04-03.md#L455).

If I had to summarize it in one line: I would trust the Claude plan more as a program-management document, but I would trust the GPT plan more as the actual risk-priority order.

## Both Reports Agree On

- `Architecture boundary hardening:` both plans want cross-module reads pulled behind better seams, with facades/read models and stronger enforcement.
- `Hotspot decomposition:` both plans target large, high-blast-radius backend slices rather than pretending folder structure alone is enough.
- `Coverage and backend test hardening:` both plans want materially stronger backend trust before major refactors.
- `Worker/reliability verification:` both plans call for stronger worker and queue-path validation, not just happy-path unit coverage.
- `Readiness/health improvement:` both plans want readiness to be more intentional than it is today.
- `Deploy safety matters before "9+" claims:` both plans treat deploy correctness and operational proof as part of health, not an ops afterthought.
- `Re-audit at the end:` both plans require a fresh evidence pass before accepting the target score.

## In The Claude Report, Not In GPT

- `Security hygiene extras:` required `ENCRYPTION_KEY`, blocking `pnpm audit`, request body size limits, AuthGuard config consistency.
- `Upload and attachment hardening:` file interceptor size/type enforcement and production ClamAV/file scanning.
- `Broad RLS leakage test program:` top-10 table RLS tests, then 20 more, plus running RLS tests in CI.
- `Spec-completeness program:` GDPR service specs, pastoral service/controller specs, AI/preferences/import-executor specs, and eventually 100% service/controller spec-file coverage.
- `Architecture enforcement extras:` explicit Prisma model access lint rule and a dedicated safeguarding-module extraction.
- `Reliability danger-zone items we did not call out:` parent-notification stuck alert, academic-period pre-close warning, appeal transaction timeout, legal-hold release logic, safeguarding status projection integration test.
- `Operational maturity extras:` centralized logs, production request logging, Prometheus metrics, encryption-key rotation tooling, partial-migration verification, PM2 mode review.
- `Mechanical cleanup items:` frontend catch logging sweep, frontend hardcoded-string cleanup, payroll/settings dedupe helpers, wider large-file decomposition.

## In GPT Health Recovery, Not In The Claude Report

- `Search authorization fix:` adding `PermissionGuard`, permission metadata, and blocking blank-query directory enumeration.
- `Login tenant trust-model fix:` preventing request-body `tenant_id` from overriding host-resolved tenant context.
- `Approval callback defect repair:` bounded callback status values that fit schema limits, with verbose reasons moved into `callback_error`.
- `Worker instrumentation boot gap:` explicitly loading worker telemetry at startup.
- `Real rollback/recoverability:` code-plus-database rollback or expand/contract policy, not just migration verification.
- `Off-site backup discipline:` wiring `backup-replicate`, validating off-site restore drills, and removing restore-failure masking.
- `Confidence-system truth fixes:` `collectCoverageFrom`, honest coverage artifacts, and repair of the currently miswired boundary checker.
- `Survey exception guardrail:` explicit lint/CI allowlist for `surveyResponse` and `surveyParticipationToken` access.
- `Docs/tooling sync:` fixing `doctor`, build-artifact expectations, and `db:post-migrate` onboarding drift.
- `Shared-contract discipline:` reducing `@school/shared` root-barrel usage in favor of domain subpaths.
- `Specific hotspot targets:` explicit decomposition of `behaviour.service.ts`, `behaviour-sanctions.service.ts`, `gradebook` analytics coupling, and `workload-compute.service.ts`.
- `Frontend as a non-deferrable health dimension:` Playwright journeys for critical school workflows plus React Testing Library for stateful high-value UI.
- `Targeted worker failure-contract tests:` approvals, finance/payroll callbacks, regulatory jobs, and scheduler registration health.

## Three-Line Summary

Health verdict: The Claude plan is stronger as an implementation program, but weaker as a truthful whole-system path to 9.5 because it excludes frontend and misses several top live-risk items.

Biggest risk: The Claude plan under-prioritizes the highest-confidence live issues from the GPT audit, especially search authorization, callback safety, and real rollback/recoverability.

Best next step: Use Claude's execution structure, but anchor the actual priority order to the GPT plan's live-risk and trust-system fixes first.
