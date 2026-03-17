---
description: Enforces RLS safety, API patterns, and service layer conventions in the backend
globs: ["apps/api/**"]
---

# Backend API Rules

## RLS Safety
- NEVER use `$executeRawUnsafe` or `$queryRawUnsafe` outside the RLS middleware. Anywhere.
- All tenant-scoped queries flow through Prisma with the RLS middleware setting `SET LOCAL app.current_tenant_id`
- Every endpoint that touches tenant data must have tenant context resolved and injected before any DB operation.

## Controllers
- Thin. Validate input → call service → return response. No business logic in controllers.
- Use `@RequiresPermission('domain.action')` decorator for permission checks
- Use `@ModuleEnabled('module_key')` guard to verify the tenant has the module enabled
- Return consistent error shape: `{ error: string, code: string, details?: unknown }`

## Services
- All business logic lives here
- Throw typed exceptions (NestJS `HttpException` subclasses)
- Cross-module calls go through the service layer — never reach into another module's DB queries directly
- Do NOT manually write audit logs — the `AuditLogInterceptor` handles this on mutations

## API Design
- RESTful, namespaced under `/api/`
- Pagination: cursor-based — `{ data: T[], cursor: string | null, hasMore: boolean }`
- Monetary values: `number` in responses (backed by `NUMERIC(12,2)` in DB) — never floating point
- IDs: UUIDs everywhere

## DTOs
- Define with Zod schema in `packages/shared`, import into controllers
- Infer TypeScript types from Zod: `type CreatePayrollRunDto = z.infer<typeof createPayrollRunSchema>`

## Encrypted Fields
- Stripe keys, bank details: AES-256, key in AWS Secrets Manager
- Decrypt only in memory during use. Never log. Never return in API responses.
- API responses show only last 4 characters.
- All access to encrypted fields is audit-logged.
