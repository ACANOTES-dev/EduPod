# RLS Integration Testing with Restricted Database Role

## Purpose

Validates that Row-Level Security policies actually enforce tenant isolation when
the application connects as a non-superuser, non-BYPASSRLS database role. Unit
tests mock Prisma and cannot catch scenarios where RLS is silently bypassed
because the connection role has elevated privileges.

## Prerequisites

1. **PostgreSQL instance** with the application schema migrated.
2. **Restricted role** created via `scripts/setup-db-role.sql`:
   ```bash
   psql -U postgres -d edupod -f scripts/setup-db-role.sql
   ```
3. **RLS policies applied** (automatically applied by Prisma migrations
   via `post_migrate.sql` files; catalogue in `packages/prisma/rls/policies.sql`).
4. **Seed data** loaded so that at least two tenants exist (Al-Noor and Cedar in
   dev seed).

## Running Locally

```bash
# 1. Start a local PostgreSQL (Docker example)
docker run -d --name edupod-pg \
  -e POSTGRES_PASSWORD=localpassword \
  -e POSTGRES_DB=edupod \
  -p 5553:5432 \
  postgres:16

# 2. Apply migrations
DATABASE_URL=postgresql://postgres:localpassword@localhost:5553/edupod \
  pnpm --filter @school/prisma exec prisma migrate deploy

# 3. Create the restricted role
PGPASSWORD=localpassword psql -h localhost -p 5553 -U postgres -d edupod \
  -f scripts/setup-db-role.sql

# 4. Grant restricted role access to all existing tables
PGPASSWORD=localpassword psql -h localhost -p 5553 -U postgres -d edupod -c \
  "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO edupod_app;
   GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO edupod_app;"

# 5. Seed data
DATABASE_URL=postgresql://postgres:localpassword@localhost:5553/edupod \
  pnpm --filter @school/prisma exec prisma db seed

# 6. Run integration tests as the restricted role
DATABASE_URL=postgresql://edupod_app:CHANGE_ME@localhost:5553/edupod \
  pnpm --filter @school/api test:integration
```

## What the Tests Verify

### Startup Role Check (`RlsRoleCheckService`)

- Queries `pg_roles` for the current connection role.
- In production mode, crashes the app if the role has SUPERUSER or BYPASSRLS.
- In development, logs a warning but allows startup.
- Already covered by unit tests in `src/common/guards/rls-role-check.service.spec.ts`.

### RLS Context Setting (`createRlsClient`)

- `SET LOCAL app.current_tenant_id` scopes all queries within the transaction to
  a single tenant.
- UUID format validation prevents injection via `tenant_id` or `user_id`.
- Already covered by unit tests in `src/common/middleware/rls.middleware.spec.ts`.

### Cross-Tenant Isolation (Integration)

- Insert a row as Tenant A, set RLS context to Tenant B, verify the row is not
  visible.
- Attempt to update/delete a row belonging to Tenant A while connected as
  Tenant B, verify the operation affects zero rows.
- Existing E2E specs cover this via HTTP endpoints (e.g., `rls-leakage.e2e-spec.ts`,
  `rls-comprehensive.e2e-spec.ts`, `admissions-rls.e2e-spec.ts`, etc.).
- The key addition for S-21 is running these same tests with `DATABASE_URL`
  pointing to the restricted `edupod_app` role, proving that RLS policies are
  enforced at the database level rather than bypassed by a superuser connection.

## CI Integration

A CI workflow step is prepared (commented out) in `.github/workflows/ci.yml`.
It will be enabled when DX-03 (Docker PostgreSQL service container) is
implemented. The step runs `pnpm --filter @school/api test:integration` with
`DATABASE_URL` pointing to the restricted role.

## Architecture Notes

- The `jest.integration.config.js` already picks up `*.rls.spec.ts` files and
  files under `test/`.
- The restricted role has NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOBYPASSRLS.
- `set_config()` with `is_local=true` works for any role -- no additional grants
  are needed.
- `FORCE ROW LEVEL SECURITY` on every table ensures policies apply even to table
  owners, so the `edupod_app` role cannot circumvent them.
