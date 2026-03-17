---
description: Enforces tenant-aware job processing patterns in the BullMQ worker service
globs: ["apps/worker/**"]
---

# Worker / Background Job Rules

## Tenant Context — Mandatory
- Every job payload MUST include `tenant_id`. No exceptions.
- All job processors MUST extend `TenantAwareJob` base class, which sets RLS context before any DB operation.
- Jobs enqueued without `tenant_id` are rejected at enqueue time — fail loudly, do not silently process.

## Job Naming
- Format: `{domain}:{action}` — e.g., `payroll:generate-mass-payslips`, `notifications:dispatch`

## Error Handling
- Failed jobs retry with exponential backoff (configurable max attempts per queue)
- Jobs exceeding max retries go to the dead-letter queue
- Dead-letter jobs are replay-safe — processing is idempotent

## Queue Patterns
- One queue per domain (e.g., `payroll`, `notifications`, `search-sync`)
- Each job type has a dedicated processor class — do not handle multiple job types in one processor
