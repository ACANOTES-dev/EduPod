# Challenge Pass — 02-04-2026

## 1. Findings That Held Up Under Challenge

- **Approval decisions are non-atomic.** This remained the strongest finding after challenge because it is directly visible in `approval-requests.service.ts`: each action performs a status read and then an unconditional update by `id`, with no guarded write condition and no transaction spanning the decision plus callback enqueue. There was no contradictory evidence in the sampled code.
- **Notification retries are effectively disabled.** This also held at high confidence. The scheduler registers only `DISPATCH_QUEUED_JOB`, the retry processor exists but is unscheduled, and the queued dispatcher only scans `status: 'queued'`. This is a direct code-path mismatch, not a grep artefact.
- **The worker verification baseline is red.** This is not interpretive. Phase 1 command output showed failing worker tests, lint, and type-check. The broken compliance spec is additionally visible on file inspection.
- **Frontend journey protection is weak.** The evidence is direct: reviewed Playwright specs only navigate and screenshot, no auth state is configured, and the school shell is wrapped in `RequireAuth`.
- **Production rollback is app-safe but not schema-safe.** The deploy script and rollback runbook say this plainly: automatic rollback restores code and services, while data/schema rollback is a separate manual recovery path.

## 2. Findings That Weakened Under Challenge

- **“Missing RLS policy” weakened materially.** The initial repo-wide heuristic suggested a tenant-scoped table without RLS. Targeted verification found that `cron_execution_logs` does have an RLS policy in a migration `post_migrate.sql`. The issue was therefore downgraded from a probable live tenant-isolation gap to a lower-severity canonical-policy catalogue drift problem.
- **Finance test weakness was reduced from Critical to High.** The absence of strong tests around `confirmAllocations()` is a serious risk, but it is still a missing guardrail rather than a confirmed money bug. Treating it as Critical would overstate certainty and urgency.
- **Environment contract drift was reduced from High operational risk to Medium DX/verification risk.** The mismatch between `.env.local` and `.env`, plus `MEILISEARCH_HOST` versus `MEILISEARCH_URL`, is real and worth fixing, but it does not currently outrank the live approvals/notifications defects.

## 3. Findings That Were Reframed

- **Security posture was reframed from “questionable” to “credibly strong core isolation with hardening debt.”** The security/RLS review found the tenant-isolation path materially stronger than the initial fact-pack signal suggested. The final framing reflects that: core RLS/auth/RBAC is credible, while raw-SQL governance, login throttling, key custody, and policy-inventory discipline remain weaker areas.
- **Architecture risk was reframed from “modularity absent” to “modularity present but too porous in hotspots.”** The repo does have real module structure and live architecture docs. The problem is that hotspot modules and direct foreign-table reads reduce the practical value of that structure.
- **Worker test health was reframed from “broadly good because nearly every processor has a spec” to “broad on paper but degraded in practice.”** The near-complete processor/spec pairing remains a strength, but current red suites and the missing key-rotation harness materially reduce trust.

## 4. Remaining Uncertainties

- No concurrent runtime test was executed to demonstrate the approval race with two live callers. The race is still a strong code-level conclusion, but it remains unobserved in a running harness.
- No production inspection was performed, so deploy, monitoring, and secret-management conclusions are based on code/config/runbook evidence rather than live service state.
- Subagent reviews were targeted rather than exhaustive. Some module-level judgments are based on representative sampling, size, coupling data, and architecture docs rather than full-module read-throughs.
- The environment prevented an exact seven-agent simultaneous launch. All seven reports were still produced, but orchestration deviated from the requested single-batch ideal because of a six-agent hard cap.

## 5. Adjustments Made to Severity, Confidence, or Scoring

- RLS issue reframed to **Low-to-Medium governance drift** rather than a live missing-policy claim.
- Finance transaction test gap lowered from **Critical** to **High** in the master synthesis.
- Environment contract drift lowered from **High** to **Medium** and moved out of the Top 10.
- Security kept in the upper-mixed band at **7.5/10**, not the “strong health” band, because core isolation strength does not erase governance drift and operational hardening debt.
- Overall health held in the **5–6 range** because the strongest positive signals are real, but multiple direct defects and weak guardrails remain unresolved.
