# ADR-003: TenantAwareJob Uses Raw SQL for RLS Context

**Status**: Accepted
**Date**: 2026-04-01

## Context

Row-Level Security is enforced at the database session level via `SET LOCAL app.current_tenant_id = '<uuid>'`. In the API request pipeline, this is handled transparently by the Prisma RLS middleware, which intercepts every interactive transaction and issues the `SET LOCAL` before any query runs.

Background job processors (BullMQ workers) run in a separate process (`apps/worker/`) with no HTTP request context. There is no active request pipeline, no middleware chain, and no `AsyncLocalStorage` context that the Prisma middleware can read. If a worker processor calls `prisma.$transaction()` without manually setting the tenant context first, the `current_setting('app.current_tenant_id')` call in the RLS policy will either return an empty string or throw — meaning RLS policies evaluate to false and no rows are returned, or the job fails entirely.

The CLAUDE.md coding rules prohibit `$executeRawUnsafe` everywhere except the RLS middleware. This created a question: how do worker jobs set RLS context without violating that rule?

## Decision

The `TenantAwareJob` base class is the **sole other permitted use** of `$executeRawUnsafe` in the codebase. It issues:

```typescript
await prisma.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
```

inside every transaction before any data operation. This is the structural equivalent of what the API middleware does, applied to the worker context.

The rules governing this exception:

1. `$executeRawUnsafe` for RLS context-setting is **only** permitted in `TenantAwareJob` and the RLS middleware. Two locations, no more.
2. All job processors **must** extend `TenantAwareJob`. A processor that extends `WorkerHost` directly without going through `TenantAwareJob` is prohibited.
3. Every job payload **must** include `tenant_id`. Jobs enqueued without `tenant_id` are rejected at enqueue time by the queue validation layer.
4. The `tenantId` value passed to `$executeRawUnsafe` comes from the validated job payload — it is a UUID that was validated at enqueue time, not free-form user input, which is why the raw interpolation is safe in this specific case.

## Consequences

### Positive

- Workers have full RLS protection without needing to replicate the entire API middleware stack.
- The pattern is centralised in one base class — all processors inherit it automatically.
- The `tenant_id` requirement at enqueue time means jobs cannot accidentally run without context.

### Negative

- This is a structural exception to the "no `$executeRawUnsafe`" rule. It requires the rule to be explained in two parts: the blanket prohibition and this specific exception.
- A developer who sees `$executeRawUnsafe` in `TenantAwareJob` and uses it as a precedent elsewhere would be violating the rule. The exception is location-specific, not pattern-wide.
- If the tenant_id validation at enqueue time ever fails silently, a job could run with an attacker-controlled UUID. This makes enqueue-time validation safety-critical.

### Mitigations

- The ESLint `no-raw-unsafe` rule flags any new usages of `$executeRawUnsafe` outside the two permitted locations.
- `TenantAwareJob` is the only base class for job execution — processors that bypass it will fail type-checking.
- Code review policy: any new occurrence of `$executeRawUnsafe` anywhere in the codebase requires explicit approval and an ADR update if a third location is ever justified.
