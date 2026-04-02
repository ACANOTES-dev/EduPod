# W0-A Baseline Note — 2026-04-02

> Worktree: `.worktrees/audit-w0-a`
> Branch: `audit/w0-a`
> Alignment source: `Audit-GPT/2026-04-02-health-recovery-execution-order.md`

## Snapshot

- `pnpm install --frozen-lockfile`: passed
- `pnpm prisma generate` in `packages/prisma`: passed
- `npx prisma generate` in `packages/prisma`: failed because the global Prisma CLI resolved to `7.6.0`, which rejects this repo's `schema.prisma` datasource config; this is a tooling mismatch, not a repo change signal
- `pnpm turbo run lint`: passed with warnings only
- `pnpm turbo run type-check`: failed in `@school/api` with a Node heap OOM under the default local run on Node `v24.14.0`
- `pnpm turbo run build`: passed
- `cd apps/api && pnpm test`: passed (`559` suites, `7,645` tests)
- `cd apps/worker && pnpm test`: passed (`98` suites, `594` tests)

## Drift Against The Dated Audit

- `HR-004` and `HR-005` are already green in the live repo: worker tests pass, backend tests pass, and `school-closures.service.spec.ts` no longer reproduces as the red backend suite from the dated audit.
- The live repo still matches the audit on two active Wave 0 correctness risks:
  - `HR-001`: approval decisions are still implemented as read-then-write transitions and are not atomic under concurrency
  - `HR-003`: failed-notification retry logic exists in processors/tests, but the dedicated retry processor is not registered by `CronSchedulerService`, so backoff-based retries are not automatically reactivated

## Execution Decision

Proceed with `W0-A` using live-repo evidence first:

1. Treat `HR-004` and `HR-005` as already satisfied by the current baseline.
2. Implement `HR-001` and `HR-003`.
3. Re-run Wave 0 verification after those fixes.

## Outcome

- `HR-001` completed: approval decisions now transition with conditional `updateMany(... status: 'pending_approval' ...)` writes inside RLS-scoped interactive transactions, and stale concurrent decisions now fail with `APPROVAL_DECISION_CONFLICT` instead of double-writing.
- `HR-003` completed: `communications:retry-failed-notifications` is now registered by `CronSchedulerService`, covered by a worker cron spec, and documented in `architecture/event-job-catalog.md`.
- `HR-004` confirmed green on the live repo baseline and on final verification.
- `HR-005` confirmed green on the live repo baseline and on final verification.

## Final Verification

- `pnpm turbo run lint`: passed
- `NODE_OPTIONS='--max-old-space-size=8192' pnpm turbo run type-check`: passed
- `pnpm turbo run build`: passed
- `pnpm turbo run test`: passed

## Notes

- The local default `pnpm turbo run type-check` still OOMs under Node `v24.14.0` without the `NODE_OPTIONS='--max-old-space-size=8192'` heap setting; this matches the existing CI configuration rather than a new W0-A regression.
- The final verification also surfaced and fixed two latent repo issues uncovered while clearing the W0-A path:
  - `createRlsClient().$transaction()` now preserves generic return types instead of collapsing them to `unknown`
  - `invoices.service.spec.ts` no longer relies on an invalid structural cast during the create-path assertion
