# Audit Recovery — Unaddressed Items Report

> **Date**: 2026-04-02
> **Source**: `Audits/Audit_Actions_Report`
> **Scope**: All items with status `Blocked`, `Skipped`, or `Partial` across 12 dimensions

---

## Summary

| Status    | Count | Description                                                              |
| --------- | ----- | ------------------------------------------------------------------------ |
| Blocked   | 3     | Requires cross-cutting refactor or new feature scope                     |
| Skipped   | 3     | Low severity or technical blocker (BullMQ API limitation)                |
| Partial   | 3     | Policy/process documented but the actual execution is a future milestone |
| **Total** | **9** | **Out of 264 planned items (96.6% completion rate)**                     |

---

## Blocked Items (4)

Remaining blocked items require large cross-cutting refactors or new feature scope that exceeds a single audit session.

| #    | Action                                                         | Phase | Dimension   | Blocked By                          | Notes                                                                                                                       |
| ---- | -------------------------------------------------------------- | ----- | ----------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| R-14 | Move document generation out of DB transactions                | D     | Reliability | Deep Puppeteer PDF refactor (DZ-19) | Requires restructuring how PDFs are generated — placeholder in transaction, Puppeteer via BullMQ. Touches multiple modules. |
| R-24 | Move ALL external provider sends out of Prisma transactions    | D     | Reliability | Large cross-cutting refactor        | Affects Resend, Twilio, Anthropic call sites across multiple modules. High blast radius.                                    |
| R-26 | Add replay/reconciliation tooling for stuck approval callbacks | D     | Reliability | New admin endpoint + audit trail    | Requires new controller, service, and UI. Scope exceeds a single audit session.                                             |

### Resolved Since Last Report (2026-04-02)

The following 6 items were resolved:

| #     | Action                                               | Resolution                                                                                                              |
| ----- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| R-13  | Add `automation_failed` flag to behaviour incidents  | Boolean column added. BehaviourService sets flag on queue dispatch failure. Deployed to production.                     |
| R-18  | Introduce claim/lease state for notifications        | `claimed` value added to `NotificationStatus` enum. Deployed to production.                                             |
| R-19  | Add idempotency keys for outbound notification sends | `idempotency_key VARCHAR(64)` column added with unique index on `(tenant_id, idempotency_key)`. Deployed.               |
| R-23  | Persist per-tenant cron failures to durable state    | `cron_execution_logs` table created with `CronExecutionStatus` enum, nullable tenant_id, RLS dual policy.               |
| BT-15 | Add coverage ratchet script                          | Covered by RS-01/RS-02: jest.config.js `coverageThreshold` enforces floor in CI. Manual ratchet-up policy in CLAUDE.md. |
| DX-13 | Add IDE workspace settings                           | Won't Do — sole developer uses Antigravity (not VS Code). No value in committing `.vscode/` settings.                   |

---

## Skipped Items (3)

| #    | Action                                          | Phase | Dimension   | Reason                                                                                                                                                                                              |
| ---- | ----------------------------------------------- | ----- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-15 | Add circuit breaker for external services       | E     | Reliability | Low severity. Requires selecting and integrating a circuit breaker library (opossum or similar) for Anthropic, Resend, Twilio, Stripe.                                                              |
| R-20 | Add BullMQ timeout settings for critical queues | B     | Reliability | **Technical blocker**: BullMQ v5 does not support `timeout` on `DefaultJobOptions`. Correct mechanism is `lockDuration` per `@Processor()` decorator, affecting ~50 files. Needs dedicated session. |
| R-25 | Add synthetic canary jobs in production         | E     | Reliability | Low severity. Requires new canary job infrastructure — a no-op job per critical queue with SLA monitoring.                                                                                          |

---

## Partial Items (3)

These items had their **governance process documented** but the actual execution depends on future milestones.

| #     | Action                                                           | Phase | Dimension    | What Was Done                                                                                      | What Remains                                                                                                                           |
| ----- | ---------------------------------------------------------------- | ----- | ------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| CQ-06 | Migrate top 10 forms to `react-hook-form`                        | D     | Code Quality | 2 forms migrated (report alerts, scheduled reports) + guardian-restrictions reference impl (CQ-04) | 7 remaining forms need Zod schemas created in `@school/shared` first: incident, sanction, student, invoice, staff, leave, announcement |
| OH-05 | Re-run static health audit after Wave 1, Wave 3, and final       | E     | Governance   | Checkpoint policy, required inputs/outputs documented                                              | Actual Wave 1, Wave 3, and final re-audits are future milestones that happen after merge waves complete                                |
| OH-14 | Run final independent re-audit after all Now/Next items verified | E     | Governance   | Hard gate and independence rule documented                                                         | Final re-audit cannot run until all NOW and NEXT backlog items are verified — depends on blocked items being resolved                  |

---

## Recommended Next Steps

### Dedicated Refactor Sessions

1. **R-14 + R-24** — Move external calls out of DB transactions (PDF generation + provider sends). High blast radius, needs focused session. Best tackled after onboarding stabilizes.
2. **R-20** — BullMQ `lockDuration` across ~50 processor files. Mechanical but wide-reaching.
3. **R-26** — Approval callback reconciliation tooling. New feature scope. Reactive — build when stuck callbacks surface in production.

### Deferred (Low Priority)

4. **R-15** — Circuit breaker pattern. Nice-to-have for resilience.
5. **R-25** — Synthetic canary jobs. Operational maturity item.
6. **CQ-06** — Remaining form migrations. Depends on Zod schema work.
7. **OH-05 / OH-14** — Future governance milestones. Execute after merge waves.
