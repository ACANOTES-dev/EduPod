# Subagent 4 Audit - Security and RLS

## A. Facts

- The canonical fact pack states that `251` Prisma models map to tenant-scoped tables with `tenant_id`, and `251` unique RLS-enabled tables were found across `packages/prisma/rls/policies.sql`, `post_migrate.sql`, and inline `migration.sql`, with no unresolved tenant-table-vs-RLS mismatches remaining.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/middleware/rls.middleware.ts` validates `tenant_id` and optional `user_id` as UUIDs, then sets `app.current_tenant_id` and `app.current_user_id` inside an interactive Prisma transaction via `SELECT set_config(...)`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.ts` rejects job payloads without `tenant_id`, validates UUID shape, and sets both `app.current_tenant_id` and `app.current_user_id` before worker-side DB work.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/migrations/20260316072748_add_p1_tenancy_users_rbac/post_migrate.sql:103-201` applies `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` to `tenant_domains`, `tenant_stripe_configs`, `tenant_memberships`, and `membership_roles`; `roles` and `role_permissions` use nullable-tenant dual policies.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/guards/auth.guard.ts` verifies bearer tokens with `JWT_SECRET`, rejects non-`access` token types, and rejects tenant mismatches when `tenantContext` exists on the request.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/guards/permission.guard.ts` requires `membership_id` in the JWT and loads permission keys through `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/services/permission-cache.service.ts`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/services/permission-cache.service.ts:22-23` states its queries run outside an RLS transaction context and that development uses a superuser connection.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/middleware/tenant-resolution.middleware.ts:21-25` states `tenant_domains` is queried outside RLS and says production needs `BYPASSRLS` or RLS reconfiguration if `FORCE ROW LEVEL SECURITY` remains in place.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/archive/phases-results/P1-results.md:460` records this as a known limitation for tenant resolution.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/archive/phases-testing-result/P2-testing-result.md:203-214` documents a previously fixed cross-tenant search leak whose root cause was a superuser/BYPASSRLS connection making RLS ineffective.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts` uses `bcryptjs` for password verification, a separate `JWT_REFRESH_SECRET` for refresh tokens, Redis-backed sessions, Redis brute-force counters, TOTP MFA, hashed recovery codes, and password-reset token hashing with SHA-256.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.controller.ts` sets refresh tokens only as `httpOnly` cookies, marks them `secure` in production, uses `sameSite: 'lax'`, and scopes the cookie path to `/api/v1/auth/refresh`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/schema.prisma:973-985` declares `User` as a platform-level table with no RLS and stores `mfa_secret` as `String? @db.Text`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts:651-657` writes the generated TOTP secret directly into `user.mfa_secret`, and `:366-383` plus `:697-700` verify MFA directly against that stored secret.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/configuration/encryption.service.ts` implements AES-256-GCM with versioned keys; `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/configuration/key-rotation.service.ts` rotates tenant Stripe secrets and staff bank details to the current key version.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/compliance/dsar-traversal.service.ts:519-534` masks encrypted bank fields instead of returning stored ciphertext.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/main.ts` calls `validateEnv()` before bootstrap, then installs `helmet()`, `compression()`, `cookieParser()`, and CORS for `APP_URL` plus `*.edupod.app`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/instrument.ts` loads dotenv before bootstrap, initializes Sentry with `sendDefaultPii: false`, removes `authorization` and `cookie` headers from outgoing events, and scrubs UUIDs from transaction names and breadcrumb URLs.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/audit-log/security-audit.service.ts` writes audit events for login success/failure, MFA setup/disable, password reset requests, password changes, session revocation, brute-force lockouts, and permission denials.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/security/rules/cross-tenant-attempt.rule.ts` and `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/security/rules/permission-probe.rule.ts` query `audit_logs` for cross-tenant/RLS-violation signals and permission probing.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/no-raw-sql-outside-rls.js` claims to disallow raw SQL outside RLS middleware files, but its implementation only flags `$executeRawUnsafe` and `$queryRawUnsafe`.
- `rg -n '\$queryRaw|\$executeRaw' ... --glob '!**/*.spec.ts'` found tagged raw SQL in multiple application and worker modules, including health checks, sequence generation, behaviour analytics, materialized view refreshes, engagement services, payroll, households, admissions, and worker security-rule processors.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/behaviour/partition-maintenance.processor.ts:109-124` contains lint-suppressed `$queryRawUnsafe` and `$executeRawUnsafe` for partition DDL.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts:567-584` generates and stores password-reset token hashes, but explicitly notes that actual email sending is deferred.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/archive/phases-results/P1-results.md:456` separately records email delivery for password reset and invitations as not implemented.
- The unguarded controllers surfaced by the controller sweep were limited to explicitly public or infrastructure endpoints: communications webhooks/unsubscribe, finance Stripe webhook, website public endpoints, scheduling public calendar, public admissions, health, and the public GDPR sub-processor endpoint.

## B. Strong Signals

- Tenant isolation is a first-class design concern: RLS policies are widespread, API-side and worker-side request/job context setters exist, and both the auth guard and permission guard perform explicit cross-tenant checks.
- Security events are operationalized, not just documented: audit logging exists for auth and authorization events, and worker rules continuously scan audit data for brute-force clusters, permission probing, unusual access, data-export spikes, and cross-tenant attempts.
- Secrets-at-rest handling is materially better than average for an early SaaS: AES-256-GCM is implemented, key versioning exists, a key-rotation service exists, and DSAR traversal deliberately avoids exposing encrypted fields.
- Bootstrap hardening is on by default: env validation before startup, Helmet, restricted credentialed CORS, secure/httpOnly refresh-cookie handling, and Sentry PII reduction are all wired into the runtime.
- The public-route surface looks intentional rather than accidental. The sweep did not surface a random business controller missing `AuthGuard`; the unguarded routes were explicitly public, webhook, or health endpoints.

## C. Inferences

- The system is built by someone who takes multi-tenancy and privacy seriously, and many important controls are real rather than aspirational.
- The hardest claim - that PostgreSQL RLS is the hard, always-on tenant boundary - is not fully self-proving from this codebase because multiple control-plane reads are explicitly outside tenant-bound transactions.
- The system therefore appears to rely on both RLS and disciplined explicit `tenant_id` filtering in application code. That can be workable, but it is weaker than a pure "DB RLS is the guaranteed backstop" posture.
- Privacy posture is comparatively mature for this phase: there is explicit GDPR/tokenisation work, DSAR masking behavior, public sub-processor disclosure, and Sentry/event scrubbing.
- `architecture/danger-zones.md` is partially stale on encryption rotation risk. It warns there is no re-encryption mechanism, but current code now includes versioned keys and a `KeyRotationService`.

## D. Top Findings

### 1. Control-plane services appear to require an RLS-bypassing database role

Severity: High

Confidence: High

Why it matters: The tenant-resolution path and the permission-loading path both read FORCE-RLS tables outside a tenant-bound transaction. If the main Prisma connection can bypass RLS so those reads work, then database RLS is not the hard isolation boundary it is presented as. In that world, every missed `tenant_id` filter or raw query becomes materially more dangerous. The archived P2 result shows this is not theoretical: a real cross-tenant leak was already found under a superuser/BYPASSRLS runtime.

Evidence:

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/middleware/tenant-resolution.middleware.ts:21-25` states `tenant_domains` is queried outside RLS and production needs `BYPASSRLS` or policy reconfiguration if FORCE RLS remains.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/services/permission-cache.service.ts:22-23` states permission-loading queries run outside RLS and development uses a superuser connection.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/migrations/20260316072748_add_p1_tenancy_users_rbac/post_migrate.sql:103-109`, `:159-165`, and `:195-201` show `tenant_domains`, `tenant_memberships`, and `membership_roles` all use `FORCE ROW LEVEL SECURITY`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/archive/phases-results/P1-results.md:460` records tenant resolution as needing `BYPASSRLS` or a separate non-RLS lookup table.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/archive/phases-testing-result/P2-testing-result.md:203-214` documents a fixed cross-tenant leak whose root cause was a superuser/BYPASSRLS connection making RLS ineffective.

Fix direction: Run the normal application connection as a non-superuser, non-BYPASSRLS role; move tenant-domain and permission-control-plane lookups onto a deliberately separate path or dedicated lookup tables; add a startup assertion that fails if the main runtime role can bypass RLS; keep at least one CI/integration path that exercises the app with a non-bypass DB role.

### 2. MFA TOTP secrets are stored in plaintext in a non-RLS platform table

Severity: Medium

Confidence: High

Why it matters: Anyone who can read the `users` table can clone the second factor for affected users. Because `users` is explicitly non-RLS and platform-level, this secret is not protected by tenant isolation and depends entirely on application/database privilege hygiene.

Evidence:

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/schema.prisma:973-985` declares `User` as platform-level with no RLS and stores `mfa_secret` as `String? @db.Text`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts:651-657` generates a TOTP secret and writes it directly to `mfa_secret`.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts:366-383` and `:697-700` verify MFA directly against the stored secret.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/configuration/encryption.service.ts:66-137` shows an available AES-256-GCM encryption facility that is not used here.

Fix direction: Encrypt MFA secrets at rest using `EncryptionService` or a dedicated KMS-backed wrapper, store only encrypted values plus a key reference, and keep raw secrets in memory only for the initial setup flow.

### 3. Raw-SQL governance is weaker than the stated policy

Severity: Medium

Confidence: High

Why it matters: In a large tenant-sensitive codebase, the project-level story "raw SQL is prohibited outside RLS/migrations" would be a meaningful safety rail. The actual lint rule only blocks `Unsafe` raw methods, while tagged `$queryRaw` and `$executeRaw` remain available across many modules. Most observed usages look parameterized and deliberate, but the enforcement story is materially weaker than the policy story.

Evidence:

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/no-raw-sql-outside-rls.js:8-12` advertises a ban on raw SQL outside RLS/migrations.
- The same rule only reports `['$executeRawUnsafe', '$queryRawUnsafe']` at `:33-44`.
- `rg -n '\$queryRaw|\$executeRaw' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src' --glob '!**/*.spec.ts'` found tagged raw SQL in health checks, sequence generation, behaviour analytics/admin, engagement services, payroll, households, admissions, worker security rules, and other modules.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/behaviour/partition-maintenance.processor.ts:109-124` contains explicit lint-suppressed unsafe raw SQL for partition DDL.

Fix direction: Either narrow the policy text to match actual practice or enforce all raw SQL through an allowlist/wrapper; add tenant-filter assertions and non-bypass tests around tenant-scoped raw queries; keep DDL exceptions explicit and rare.

### 4. Password-reset recovery is exposed before delivery is operational

Severity: Low

Confidence: High

Why it matters: The endpoint creates real reset tokens and records audit events, but users never receive the token. That is more operational than exploit-driven, but unfinished recovery flows often lead to insecure manual workarounds and helpdesk resets.

Evidence:

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts:567-584` generates a 32-byte reset token, stores its hash, then explicitly says email sending is deferred and returns success anyway.
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/archive/phases-results/P1-results.md:456` records email delivery for password-reset and invitation flows as not implemented.

Fix direction: Complete the email-delivery path before launch, or disable/hide the endpoint until dispatch is live, monitored, and tested end-to-end.

## E. Files Reviewed

- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/fact-pack_2026-04-01_02-39-13.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/middleware/rls.middleware.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/rls/policies.sql`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.module.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.controller.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/strategies/jwt.strategy.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/guards/auth.guard.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/guards/permission.guard.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/services/permission-cache.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/middleware/tenant-resolution.middleware.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/main.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/instrument.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/config/env.validation.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/configuration/encryption.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/configuration/key-rotation.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/app.module.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/behaviour/partition-maintenance.processor.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/no-raw-sql-outside-rls.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/no-sequential-transaction.js`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/schema.prisma`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/migrations/20260316072748_add_p1_tenancy_users_rbac/post_migrate.sql`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/archive/phases-results/P1-results.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/archive/phases-testing-result/P2-testing-result.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/context.md`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gdpr/gdpr-token.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/compliance/dsar-traversal.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/audit-log/security-audit.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/rbac/memberships.service.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/security/rules/cross-tenant-attempt.rule.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/security/rules/permission-probe.rule.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gdpr/public-sub-processors.controller.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/scheduling/scheduling-public.controller.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/admissions/public-admissions.controller.ts`
- `/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/communications/unsubscribe.controller.ts`

## F. Additional Commands Run

- `sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/fact-pack_2026-04-01_02-39-13.md'`
- `sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/middleware/rls.middleware.ts'`
- `sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/rls/policies.sql'`
- `rg --files '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth'`
- `sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/guards/auth.guard.ts'`
- `sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/guards/permission.guard.ts'`
- `sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture/danger-zones.md'`
- `sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/main.ts'`
- `sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/instrument.ts'`
- `sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.module.ts'`
- `sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.controller.ts'`
- `sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/strategies/jwt.strategy.ts'`
- `rg -n "refresh|token|jwt|password|bcrypt|argon|mfa|cookie|sign\(|verify\(|expiresIn|tenant|membership|switchTenant|reset" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts'`
- `rg -n "executeRaw|queryRaw|Unsafe|set_config|current_setting|SELECT .*FOR UPDATE|ALTER TABLE|CREATE POLICY" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages'`
- `rg -n "encrypt|decrypt|AES|aes|crypto|createCipheriv|createDecipheriv|scrypt|pbkdf2|ENCRYPTION|secretbox|kms|hashPassword|comparePassword" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/shared/src'`
- `rg -n "process\.env\.|ConfigModule|validateEnv|JWT_SECRET|APP_URL|SENTRY|ENCRYPTION|COOKIE|CORS|helmet|cookieParser" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src'`
- `sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts'`
- `sed -n '220,520p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts'`
- `sed -n '520,860p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts'`
- `sed -n '860,1160p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts'`
- `sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/config/env.validation.ts'`
- `sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/configuration/encryption.service.ts'`
- `sed -n '1,260p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/configuration/key-rotation.service.ts'`
- `sed -n '1,320p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/middleware/tenant-resolution.middleware.ts'`
- `sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/services/permission-cache.service.ts'`
- `sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/base/tenant-aware-job.ts'`
- `sed -n '1,240p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/behaviour/partition-maintenance.processor.ts'`
- `sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/health/health.service.ts'`
- `sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/no-raw-sql-outside-rls.js'`
- `sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/no-sequential-transaction.js'`
- `sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/app.module.ts'`
- `rg -n "tenant_domains|tenant_memberships|users|password_reset_tokens|mfa_recovery_codes|tenant_stripe_configs|staff_profiles|roles|permissions" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/schema.prisma'`
- `rg -n "tenant_domains|tenant_memberships|membership_roles|role_permissions|roles|permissions|tenant_stripe_configs|staff_profiles|password_reset_tokens|mfa_recovery_codes" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/rls/policies.sql' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/migrations'`
- `rg -n "@UseGuards\(AuthGuard|@RequiresPermission|CurrentTenant|CurrentUser|UseGuards\(AuthGuard, PermissionGuard\)" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules' --glob '!**/*.spec.ts'`
- `rg --files '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules' -g '\*controller.ts' | xargs -I{} sh -c "if ! rg -q 'AuthGuard' '{}' ; then printf '%s\n' '{}' ; fi"``
- `sed -n '100,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/migrations/20260316072748_add_p1_tenancy_users_rbac/post_migrate.sql'`
- `sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/security/rules/cross-tenant-attempt.rule.ts'`
- `sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src/processors/security/rules/permission-probe.rule.ts'`
- `rg -n "mfa_token|mfa_pending|verifyMfa|refresh_token|clearCookie|sameSite|secure: process.env.NODE_ENV === 'production'|httpOnly" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth'`
- `rg -n "requestPasswordReset|password-reset|reset link|rawToken|Phase 7|email sending deferred|mfa_secret" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.controller.ts'`
- `while IFS= read -r f; do if ! rg -q 'AuthGuard' "$f"; then printf '%s\n' "$f"; fi; done < <(rg --files '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules' -g '*controller.ts')`
- `sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gdpr/public-sub-processors.controller.ts'`
- `sed -n '1,240p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/scheduling/scheduling-public.controller.ts'`
- `sed -n '1,240p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/admissions/public-admissions.controller.ts'`
- `sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/communications/unsubscribe.controller.ts'`
- `rg -n "BYPASSRLS|FORCE ROW LEVEL SECURITY|tenant_domains|table owner|superuser|current_tenant_id" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/architecture' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans'`
- `sed -n '452,468p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/archive/phases-results/P1-results.md'`
- `sed -n '200,218p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/archive/phases-testing-result/P2-testing-result.md'`
- `sed -n '140,185p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/context.md'`
- `sed -n '500,545p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/compliance/dsar-traversal.service.ts'`
- `sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/gdpr/gdpr-token.service.ts'`
- `sed -n '1,220p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/audit-log/security-audit.service.ts'`
- `rg -n "mfa_secret|password_hash|phone|preferred_locale|global_status" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/schema.prisma'`
- `sed -n '960,1005p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/schema.prisma'`
- `rg -n "Throttler|rate limit|rate-limit|throttle|brute_force|BRUTE_FORCE" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/web/src'`
- `rg -n "deleteAllUserSessions\(|revokeSession\(|invalidateAllForTenant\(|membership_status|MEMBERSHIP_NOT_ACTIVE|PERMISSION_DENIED|tenantMembership\.update|tenantMembership\.updateMany|tenantMembership\.delete|tenantMembership\.upsert" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src' --glob '!**/*.spec.ts'`
- `rg -n "mfa_enabled: false, mfa_secret: null|logMfaDisable|useRecoveryCode\(|loginWithRecoveryCode\(" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts'`
- `rg -n "\$queryRaw`|\$executeRaw`|\$queryRaw<|\$executeRaw<" '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src' --glob '!**/*.spec.ts'`
- `rg -n '\$queryRaw|\$executeRaw' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/worker/src' --glob '!**/*.spec.ts'`
- `sed -n '220,330p' '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/rbac/memberships.service.ts'`
- `nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts' | sed -n '450,540p'`
- `nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/guards/permission.guard.ts' | sed -n '1,140p'`
- `nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/services/permission-cache.service.ts' | sed -n '1,120p'`
- `nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/common/middleware/tenant-resolution.middleware.ts' | sed -n '1,120p'`
- `nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts' | sed -n '330,390p'`
- `nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts' | sed -n '640,720p'`
- `nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/schema.prisma' | sed -n '970,990p'`
- `nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/configuration/encryption.service.ts' | sed -n '1,210p'`
- `nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/apps/api/src/modules/auth/auth.service.ts' | sed -n '542,586p'`
- `nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/eslint-config/rules/no-raw-sql-outside-rls.js' | sed -n '1,120p'`
- `nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/archive/phases-testing-result/P2-testing-result.md' | sed -n '200,216p'`
- `nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Plans/archive/phases-results/P1-results.md' | sed -n '454,466p'`
- `nl -ba '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/packages/prisma/migrations/20260316072748_add_p1_tenancy_users_rbac/post_migrate.sql' | sed -n '103,205p'`
- `test -e '/Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Audit-GPT/subagent-04-security-rls_2026-04-01_02-39-13.md' && echo exists || echo missing`

Notes:

- The `xargs`-based controller sweep failed with `xargs: command line cannot be assembled, too long`; it was rerun successfully with a `while read` loop.
- The first attempt to enumerate tagged raw SQL with a more specific shell pattern failed with a zsh parse error and was rerun successfully with a simpler pattern.

## G. Score

Score: 6.8 / 10

Justification: This codebase shows real security work, not just good intentions: full tenant-table RLS coverage per the canonical fact pack, API and worker tenant/user context setters, explicit cross-tenant token checks, audited auth flows, at-rest encryption for financial secrets, key rotation support, environment validation, restricted credentialed CORS, and privacy-aware Sentry scrubbing. That said, I cannot rate it in the "strong health" band because the credibility of database-enforced tenant isolation is weakened by control-plane services that explicitly read FORCE-RLS tables outside tenant context and by archived evidence that superuser/BYPASSRLS behavior has already caused a real cross-tenant leak. Plaintext MFA secret storage and weaker-than-claimed raw-SQL governance further reduce confidence. Overall, this looks generally solid but with notable weaknesses that should be addressed before calling the multi-tenant isolation story fully robust.

## H. Confidence in this review

Confidence: Medium

What limited certainty:

- I did not have server access or runtime verification of the production PostgreSQL role, so I could not confirm whether production currently runs with BYPASSRLS, a non-bypass role, or some split-connection workaround.
- I did not execute the app or integration tests in this subagent pass; this is a code-and-docs audit.
- I treated the shared fact pack as canonical by instruction and only spot-verified contradictions where needed.
- The repo contains many tagged raw SQL queries; I verified the governance pattern and representative examples, but I did not manually prove the tenant predicate on every single raw query in the codebase.
