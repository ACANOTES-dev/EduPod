# Audit Recovery — Unaddressed Items Report

> **Date**: 2026-04-01
> **Source**: `Audits/Audit_Actions_Report`
> **Scope**: All items with status `Blocked`, `Skipped`, or `Partial` across 12 dimensions

---

## Summary

| Status    | Count  | Description                                                                                                    |
| --------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| Blocked   | 8      | Requires schema migration, new table, or cross-cutting refactor that depends on other dimensions landing first |
| Skipped   | 4      | Low severity or technical blocker (BullMQ API limitation, missed in session)                                   |
| Partial   | 3      | Policy/process documented but the actual execution is a future milestone                                       |
| **Total** | **15** | **Out of 264 planned items (94.3% completion rate)**                                                           |

---

## Blocked Items (8)

All blocked items are in the **Reliability** dimension. Root cause: they require Prisma schema changes (new columns, new enum values, new tables) or large cross-cutting refactors that couldn't be done in isolation without risk of conflict with other dimensions.

| #     | Action                                                         | Phase | Dimension     | Blocked By                                 | Notes                                                                                                                       |
| ----- | -------------------------------------------------------------- | ----- | ------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| R-13  | Add `automation_failed` flag to behaviour incidents            | D     | Reliability   | Prisma schema change + migration           | New boolean column on `behaviour_incidents`. Should be bundled with next schema migration session.                          |
| R-14  | Move document generation out of DB transactions                | D     | Reliability   | Deep Puppeteer PDF refactor (DZ-19)        | Requires restructuring how PDFs are generated — placeholder in transaction, Puppeteer via BullMQ. Touches multiple modules. |
| R-18  | Introduce claim/lease state for notifications                  | D     | Reliability   | New `claimed` enum value + migration       | Needs `NotificationStatus` enum extension. Depends on notification system being stable post-merge.                          |
| R-19  | Add idempotency keys for outbound notification sends           | D     | Reliability   | Schema change for idempotency key column   | New column on notification dispatch table. Should pair with R-18.                                                           |
| R-23  | Persist per-tenant cron failures to durable state              | D     | Reliability   | New `cron_execution_log` table + migration | New table needed. Can be done independently but was deferred to avoid migration conflicts.                                  |
| R-24  | Move ALL external provider sends out of Prisma transactions    | D     | Reliability   | Large cross-cutting refactor               | Affects Resend, Twilio, Anthropic call sites across multiple modules. High blast radius.                                    |
| R-26  | Add replay/reconciliation tooling for stuck approval callbacks | D     | Reliability   | New admin endpoint + audit trail           | Requires new controller, service, and UI. Scope exceeds a single audit session.                                             |
| BT-15 | Add coverage ratchet script                                    | D     | Backend Tests | Phase D setup dependency                   | Script to fail CI if coverage decreases. Blocked on coverage infrastructure being merged first.                             |

---

## Skipped Items (4)

| #     | Action                                          | Phase | Dimension            | Reason                                                                                                                                                                                              |
| ----- | ----------------------------------------------- | ----- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-15  | Add circuit breaker for external services       | E     | Reliability          | Low severity. Requires selecting and integrating a circuit breaker library (opossum or similar) for Anthropic, Resend, Twilio, Stripe.                                                              |
| R-20  | Add BullMQ timeout settings for critical queues | B     | Reliability          | **Technical blocker**: BullMQ v5 does not support `timeout` on `DefaultJobOptions`. Correct mechanism is `lockDuration` per `@Processor()` decorator, affecting ~50 files. Needs dedicated session. |
| R-25  | Add synthetic canary jobs in production         | E     | Reliability          | Low severity. Requires new canary job infrastructure — a no-op job per critical queue with SLA monitoring.                                                                                          |
| DX-13 | Add IDE workspace settings                      | E     | Developer Experience | Missed/skipped during session. No `.vscode/settings.json` or recommended extensions committed. Trivial to add.                                                                                      |

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

### Quick Wins (can be done immediately after merge)

1. **DX-13** — Add `.vscode/settings.json` + recommended extensions. 15-minute task.
2. **BT-15** — Coverage ratchet script. Unblocked once backend-tests and refactor-safety branches merge (they set up coverage infrastructure).

### Bundle Into Next Migration Session

3. **R-13** — `automation_failed` flag on behaviour_incidents
4. **R-18 + R-19** — Notification claim state + idempotency keys (pair together)
5. **R-23** — `cron_execution_log` table

### Dedicated Refactor Sessions

6. **R-14 + R-24** — Move external calls out of DB transactions (PDF generation + provider sends). High blast radius, needs focused session.
7. **R-20** — BullMQ `lockDuration` across ~50 processor files. Mechanical but wide-reaching.
8. **R-26** — Approval callback reconciliation tooling. New feature scope.

### Deferred (Low Priority)

9. **R-15** — Circuit breaker pattern. Nice-to-have for resilience.
10. **R-25** — Synthetic canary jobs. Operational maturity item.
11. **CQ-06** — Remaining form migrations. Depends on Zod schema work.
12. **OH-05 / OH-14** — Future governance milestones. Execute after merge waves.
