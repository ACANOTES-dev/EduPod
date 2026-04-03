A. Facts

- I used `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md` as the canonical baseline and only ran targeted follow-up checks.
- The fact-pack correction is valid: `survey_responses` and `survey_participation_tokens` are explicitly intentional non-RLS exceptions, documented in `/Users/ram/Desktop/SDB/packages/prisma/rls/policies.sql:2266-2267` and `/Users/ram/Desktop/SDB/packages/prisma/migrations/20260328100000_add_staff_wellbeing_tables/post_migrate.sql:7-8`.
- The repo-level RLS inventory in the fact pack reports `265` Prisma models, `252` models with `tenant_id`, `252` canonical RLS policies, and `PASS`. The documented non-RLS exceptions are `users`, `survey_responses`, `survey_participation_tokens`, and `gdpr_export_policies`.
- `/Users/ram/Desktop/SDB/apps/api/src/common/middleware/rls.middleware.ts:49-117` sets `app.current_tenant_id`, `app.current_user_id`, `app.current_membership_id`, and `app.current_tenant_domain` inside interactive Prisma transactions via `set_config(...)`.
- `/Users/ram/Desktop/SDB/apps/api/src/common/guards/rls-role-check.service.ts:19-49` checks the live database role at startup and throws in production if the app connects with `SUPERUSER` or `BYPASSRLS`.
- `/Users/ram/Desktop/SDB/apps/api/src/main.ts:16-66` performs pre-bootstrap env validation, enables Helmet CSP, sets `Permissions-Policy`, enables compression and cookies, and restricts CORS to `APP_URL` plus `*.edupod.app`.
- `/Users/ram/Desktop/SDB/apps/api/src/instrument.ts:38-56` initializes Sentry with `sendDefaultPii: false`, strips `authorization` and `cookie` headers, and removes UUIDs from transaction/breadcrumb URLs.
- `/Users/ram/Desktop/SDB/apps/api/src/modules/configuration/encryption.service.ts:20-64,66-137` uses versioned AES-256-GCM keys, validates key length, and supports decrypting older key versions.
- `/Users/ram/Desktop/SDB/apps/api/src/common/guards/auth.guard.ts:23-48` rejects non-access JWTs and enforces token-tenant vs request-tenant matching when tenant context is present.
- `/Users/ram/Desktop/SDB/apps/api/src/common/guards/permission.guard.ts:39-107` enforces permission metadata through Redis-cached membership permissions and also checks token-tenant vs request-tenant alignment.
- `/Users/ram/Desktop/SDB/apps/api/src/common/services/permission-cache.service.ts:45-102`, `/Users/ram/Desktop/SDB/apps/api/src/modules/rbac/roles.service.ts:93-105,202-214,327-340`, and `/Users/ram/Desktop/SDB/apps/api/src/modules/rbac/memberships.service.ts:204-216,293-305` show permission caching is paired with explicit invalidation on role and membership changes.
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth-rate-limit.service.ts:28-147` implements email brute-force throttling, IP login throttling, and account lockout.
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth-session.service.ts:19-95` stores refresh-session state in Redis and supports per-session and all-session revocation.
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth-password-reset.service.ts:21-115` hashes reset tokens with SHA-256, limits active reset tokens, and revokes all user sessions on successful reset.
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth-mfa.service.ts:41-68,90-138,183-193` encrypts MFA secrets at rest and stores only hashed recovery codes; a one-time migration script exists at `/Users/ram/Desktop/SDB/scripts/migrate-mfa-secrets.ts:1-148` for legacy plaintext secrets.
- `/Users/ram/Desktop/SDB/scripts/check-raw-sql-governance.js:1-164`, `/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-raw-sql-outside-rls.js:1-121`, and `/Users/ram/Desktop/SDB/.github/workflows/ci.yml:70-75` show raw SQL is governed by both CI and lint allowlisting.
- The reviewed production raw SQL usages were targeted and bounded:
- `/Users/ram/Desktop/SDB/apps/api/src/common/middleware/rls.middleware.ts:49-74` only sets transaction-local context values.
- `/Users/ram/Desktop/SDB/apps/api/src/modules/finance/payments.service.ts:291-335` uses parameterised row-locking queries inside an RLS transaction.
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/behaviour/partition-maintenance.processor.ts:17-21,122-164` validates SQL identifiers and date formats before DDL.
- The anonymous survey design removes direct identifiers by schema: `/Users/ram/Desktop/SDB/packages/prisma/schema.prisma:8030-8061` shows no `tenant_id`, no `user_id`, no `staff_profile_id`, and `submitted_date` as `DATE`.
- The survey post-migrate SQL adds anonymity-preserving floors: `/Users/ram/Desktop/SDB/packages/prisma/migrations/20260328100000_add_staff_wellbeing_tables/post_migrate.sql:33-45` enforces department drill-down threshold `>= 8` and minimum response threshold `>= 3`.
- `/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/survey.service.ts:549-683` verifies the survey belongs to the tenant, verifies the submitter is staff for that tenant, prevents double-voting with an HMAC-derived token hash, inserts anonymous response rows, and enqueues moderation jobs with `tenant_id`.
- `/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/hmac.service.ts:17-97` uses a per-tenant secret, encrypted at rest, to derive participation token hashes.
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/wellbeing/cleanup-participation-tokens.processor.ts:14-24,42-84` deletes participation tokens 7 days after survey close to remove the remaining participation link.
- `/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/survey-responses-isolation.spec.ts:8-20,69-92,181-205` enforces a production-file allowlist for `surveyResponse` access and checks the moderation worker only loads a response by primary key.
- `/Users/ram/Desktop/SDB/docs/architecture/danger-zones.md:408-440` explicitly documents the anonymous survey tables as a critical architectural exception and states their isolation is application-layer only.
- `/Users/ram/Desktop/SDB/apps/api/src/modules/gdpr/gdpr.module.ts:23-46` installs `DpaAcceptedGuard` as an `APP_GUARD`, and `/Users/ram/Desktop/SDB/apps/api/src/modules/gdpr/legal-dpa.controller.ts:19-43` protects DPA status and acceptance routes with permissions.

B. Strong Signals

- The RLS posture is materially better than average: the repo has a passing RLS catalogue audit, explicit `FORCE ROW LEVEL SECURITY` coverage, transaction-scoped context setters, and a production startup check that refuses `SUPERUSER`/`BYPASSRLS`.
- The auth stack has several good defense-in-depth layers: token-type separation, tenant-mismatch rejection, Redis-backed session revocation, brute-force/IP throttles, hashed password reset tokens, encrypted MFA secrets, and security audit logging hooks.
- Raw SQL governance is not just documented; it is automated in lint and CI, and the reviewed production call sites were narrow, parameterised, or prevalidated.
- The anonymous survey exception is intentional rather than accidental, and its current implementation has meaningful compensating controls: no direct identifiers in schema, minimum-threshold enforcement, delayed token deletion, moderation, and an allowlist-style test guarding access surface.
- GDPR/legal posture is stronger than a typical early SaaS: DPA acceptance is enforced globally and legal/DPA actions are permission-gated.

C. Inferences

- The system is a mixed isolation model, not a pure “DB RLS solves everything” model. Critical write paths and some sensitive reads use transaction-scoped RLS, while many ordinary reads still rely on explicit `tenant_id` predicates and controller/service correctness. That can be credible, but it raises the importance of authorization review on every route.
- The anonymous survey design is presently defensible, but only conditionally. It is safe today because the access surface is narrow and deliberate, not because the database can independently enforce tenant separation on those rows.
- I would not currently describe the system as fully credible for multi-tenant school data without reservation. The baseline is strong, but one real authorization gap and one fragile architectural exception keep the overall posture below that bar.

D. Top Findings

1. Title: Search endpoint lacks RBAC and allows school-wide directory enumeration
   Severity: High
   Confidence: High
   Why it matters: Any authenticated tenant user appears able to query directory-style data across students, parents, staff, and households. Because the query parameter defaults to an empty string and the controller defaults to all entity types, this is not just a narrow lookup feature; it is effectively a tenant-wide people/directory endpoint without role-based authorization. In a school context, that is a meaningful privacy exposure even though it stays inside one tenant.
   Evidence:

- `/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.controller.ts:12-16,21,25-47` uses only `@UseGuards(AuthGuard)`, defaults `q` to `''`, and defaults types to `students, parents, staff, households`.
- `/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.service.ts:33-80,98-193` returns identifiable directory data for students, parents, staff, and households in both Meilisearch and PostgreSQL fallback paths, with no user role or permission input.
- `/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.controller.spec.ts:24-29,39-52,94-107` only verifies `AuthGuard` override and service-call behaviour; it does not assert any permission requirement.
  Fix direction: Put `PermissionGuard` on the controller and require an explicit search permission, or split the endpoint into role-scoped search surfaces. Pass current user context into the service and filter allowed entity types by role. Reject blank-query enumeration unless the caller has a deliberate admin/staff permission for directory browsing.

2. Title: Login allows request-body `tenant_id` to override host-resolved tenant context
   Severity: Medium
   Confidence: High
   Why it matters: The tenant subdomain/domain boundary is an important safety control in a multi-tenant school app. Letting the login body override the tenant resolved from the request host weakens that boundary and makes token issuance less tightly bound to the accessed school domain. Later guard checks reduce the blast radius, but the login step itself is looser than it should be.
   Evidence:

- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth.controller.ts:61-69` sets `const tenantId = dto.tenant_id || tenantContext?.tenant_id`.
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth.controller.spec.ts:191-219` explicitly tests and locks in the “body wins over tenant context” behaviour.
- `/Users/ram/Desktop/SDB/apps/api/src/common/guards/auth.guard.ts:37-44` and `/Users/ram/Desktop/SDB/apps/api/src/common/guards/permission.guard.ts:72-85` act as compensating controls later, which confirms this is a weakened boundary rather than a fully unconstrained cross-tenant break.
  Fix direction: If both a body `tenant_id` and a resolved tenant context are present, require them to match. Only accept body-supplied tenant selection when no tenant could be resolved from the request host/platform-domain flow.

3. Title: The anonymous survey carve-out is defensible today but still depends on convention and tests, not runtime-enforced tenant guardrails
   Severity: Medium
   Confidence: Medium-High
   Why it matters: I am not treating `survey_responses` as an accidental missing policy; it is clearly intentional. But the tradeoff is real: if another service, controller, export, or worker later queries that table incorrectly, the database cannot stop cross-tenant leakage. For school data, that exception needs stronger structural protection than documentation plus tests alone.
   Evidence:

- `/Users/ram/Desktop/SDB/packages/prisma/rls/policies.sql:2266-2267`, `/Users/ram/Desktop/SDB/packages/prisma/migrations/20260328100000_add_staff_wellbeing_tables/post_migrate.sql:7-8`, and `/Users/ram/Desktop/SDB/packages/prisma/schema.prisma:8030-8061` explicitly define the no-`tenant_id`, no-RLS design.
- `/Users/ram/Desktop/SDB/docs/architecture/danger-zones.md:414-434` states that direct queries against `survey_responses` would return rows from all tenants and that isolation is application-layer only.
- `/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/survey-responses-isolation.spec.ts:8-20,69-92,181-205` is the main enforcement mechanism for allowed access surfaces; it is a strong regression test, but still a test, not a runtime gate.
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/wellbeing/moderation-scan.processor.ts:113-126,206-208` intentionally accesses `surveyResponse` on the base Prisma client with no DB tenant protection, relying on the response ID being previously tenant-validated.
  Fix direction: Keep the design if anonymity is non-negotiable, but harden the exception. At minimum add a dedicated lint/CI rule that forbids `.surveyResponse` and `.surveyParticipationToken` outside the approved files, instead of relying on a Jest spec alone. Stronger still would be to encapsulate all access behind a single repository/service boundary or move the cross-table access into narrowly-scoped database functions/views keyed by a tenant-validated survey ID.

E. Files Reviewed

- `/Users/ram/Desktop/SDB/docs/audits/gpt/20260403T130928+0100/Audit-GPT/fact-pack_20260403T130928+0100.md`
- `/Users/ram/Desktop/SDB/apps/api/src/common/middleware/rls.middleware.ts`
- `/Users/ram/Desktop/SDB/packages/prisma/rls/policies.sql`
- `/Users/ram/Desktop/SDB/packages/prisma/migrations/20260328100000_add_staff_wellbeing_tables/post_migrate.sql`
- `/Users/ram/Desktop/SDB/packages/prisma/schema.prisma`
- `/Users/ram/Desktop/SDB/docs/architecture/danger-zones.md`
- `/Users/ram/Desktop/SDB/apps/api/src/common/middleware/tenant-resolution.middleware.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/common/guards/auth.guard.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/common/guards/permission.guard.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/common/guards/rls-role-check.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/common/services/permission-cache.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/main.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/instrument.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/config/env.validation.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/configuration/encryption.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth.controller.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth.controller.spec.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth-token.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth-session.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth-rate-limit.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth-password-reset.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/auth/auth-mfa.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/gdpr/dpa-accepted.guard.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/gdpr/gdpr.module.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/gdpr/legal-dpa.controller.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/rbac/roles.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/rbac/memberships.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.controller.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.controller.spec.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/search/search.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/survey.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/survey-results.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/services/hmac.service.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/staff-wellbeing/survey-responses-isolation.spec.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/base/tenant-aware-job.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/wellbeing/moderation-scan.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/wellbeing/cleanup-participation-tokens.processor.ts`
- `/Users/ram/Desktop/SDB/apps/worker/src/processors/behaviour/partition-maintenance.processor.ts`
- `/Users/ram/Desktop/SDB/apps/api/src/modules/finance/payments.service.ts`
- `/Users/ram/Desktop/SDB/scripts/check-raw-sql-governance.js`
- `/Users/ram/Desktop/SDB/packages/eslint-config/rules/no-raw-sql-outside-rls.js`
- `/Users/ram/Desktop/SDB/.github/workflows/ci.yml`
- `/Users/ram/Desktop/SDB/scripts/migrate-mfa-secrets.ts`

F. Additional Commands Run

- `nl -ba` on the fact pack and the reviewed source files to capture exact evidence lines.
- `rg -n '\\$executeRawUnsafe|\\$queryRawUnsafe|\\$executeRaw|\\$queryRaw' /Users/ram/Desktop/SDB/apps/api /Users/ram/Desktop/SDB/apps/worker /Users/ram/Desktop/SDB/packages/prisma`
- `rg -n 'survey_responses|SurveyResponse|survey_participation_tokens|SurveyParticipationToken' /Users/ram/Desktop/SDB`
- `rg -n '@UseGuards\\(AuthGuard\\)|@UseGuards\\(AuthGuard, PermissionGuard\\)|@RequiresPermission\\(' /Users/ram/Desktop/SDB/apps/api/src/modules/...`
- `rg -n 'permissionCacheService\\.(invalidate|invalidateAllForTenant)\\(' /Users/ram/Desktop/SDB/apps/api/src`
- `rg -n 'process\\.env\\.[A-Z0-9_]+' /Users/ram/Desktop/SDB/apps/api/src -g'*.ts'`
- `rg -n 'mfa_secret_key_ref|Legacy plaintext|pre-encryption' /Users/ram/Desktop/SDB/apps/api/src /Users/ram/Desktop/SDB/packages/prisma /Users/ram/Desktop/SDB/docs`

G. Score

6.5/10 for current multi-tenant school-data safety. The baseline controls are strong: RLS governance is real, the production DB role is checked for RLS bypass, auth/session handling is materially hardened, raw SQL is governed, and the intentional survey anonymity exception has non-trivial compensating controls. I am holding the score below “credibly safe” because the search endpoint currently exposes school-wide directory data without RBAC, and because the anonymous survey exception still depends on disciplined code paths rather than runtime-enforced tenant guardrails.

H. Confidence in this review

Medium-High. I reviewed the canonical fact pack plus the core RLS/auth/security files the prompt specified, verified the corrected `survey_responses` exception directly, and ran targeted checks for raw SQL, env handling, bootstrap security, permission invalidation, and AuthGuard-only routes. This is still a targeted audit rather than an exhaustive line-by-line review of every tenant-scoped service and controller in the monorepo.
