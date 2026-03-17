---
description: Enforces tenant isolation and schema conventions when editing Prisma schema or migrations
globs: ["packages/prisma/**", "**/*.prisma"]
---

# Prisma & Database Rules

## Tenant Isolation
- Every new tenant-scoped table MUST have `tenant_id UUID NOT NULL` with a foreign key to `tenants`
- The ONLY table without `tenant_id` is `users` — it is platform-level
- Every tenant-scoped table MUST have an RLS policy. If you create a table without one, it is a security breach.

## Column Conventions
- All `id` columns: `UUID` with `@default(dbgenerated("gen_random_uuid()"))`
- All `created_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()`
- All `updated_at`: `TIMESTAMPTZ NOT NULL DEFAULT now()` with `@updatedAt`
- Email fields: use `CITEXT` extension for case-insensitive storage
- Monetary values: `NUMERIC(12,2)` — never `FLOAT` or `DOUBLE`
- Soft deletes: status-based (`archived`, `inactive`) — never a `deleted_at` column

## Index Naming
- Format: `idx_{table}_{columns}` — e.g., `idx_payroll_runs_tenant_status`
- Partial unique indexes where needed (e.g., `WHERE effective_to IS NULL`)

## Migration Rules
- Names are descriptive: `add-payroll-tables`, `extend-staff-profiles-bank-details`
- NEVER edit a migration that has been applied to staging or production
- Run `npx prisma migrate dev --name descriptive-name` to generate

## Enums
- PostgreSQL enum values are `snake_case` strings
- Prisma enum names are `PascalCase`
