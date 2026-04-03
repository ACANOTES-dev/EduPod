# Subagent 4 Review: Security & RLS

Date: 2026-04-02
Scope note: I used `Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md` as canonical for repo-wide inventory and only verified contradictions or targeted security surfaces. I did not repeat a full repo-wide RLS discovery pass.

## A. Facts

- The canonical fact pack records `252` tenant-scoped Prisma models, `253` distinct RLS-enabled tables across `policies.sql` and migration `post_migrate.sql`, and one evidence gap at pack time: `cron_execution_logs` (`Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md:167-180`).
- In the reviewed auth/bootstrap path, the core tenant-isolation tables are protected with explicit RLS policies:
  - `tenant_domains` has both tenant isolation and exact-domain bootstrap read (`packages/prisma/rls/policies.sql:898-911`).
  - `tenant_memberships` has tenant isolation plus self-access by `current_user_id` (`packages/prisma/rls/policies.sql:961-971`).
  - `roles`, `role_permissions`, and `membership_roles` now include self-access/bootstrap-safe policies tied to `current_membership_id` / `current_user_id` (`packages/prisma/rls/policies.sql:973-1055`).
- `users` remains intentionally outside tenant RLS and is guarded in application code rather than database policy, matching the project rules in the shared context.
- The RLS middleware validates UUIDs and refuses to run without at least one RLS setting, then sets `app.current_tenant_id`, `app.current_user_id`, `app.current_membership_id`, and `app.current_tenant_domain` inside interactive transactions (`apps/api/src/common/middleware/rls.middleware.ts:33-115`).
- Tenant resolution performs hostname lookup through an RLS bootstrap transaction keyed by `app.current_tenant_domain`, and falls back to token-derived tenant context only on the platform domain / localhost path (`apps/api/src/common/middleware/tenant-resolution.middleware.ts:24-27`, `206-212`, `220-272`).
- `AuthGuard` rejects missing tokens, rejects non-`access` token types, and blocks cross-tenant token reuse when the hostname-resolved tenant does not match the JWT tenant (`apps/api/src/common/guards/auth.guard.ts:15-54`).
- `PermissionGuard` requires an active membership, re-checks tenant match, and loads permissions via a membership-scoped cache backed by RLS (`apps/api/src/common/guards/permission.guard.ts:39-107`, `apps/api/src/common/services/permission-cache.service.ts:35-102`).
- Worker jobs must include a valid `tenant_id`; the base worker class sets tenant and user RLS context before any DB work (`apps/worker/src/base/tenant-aware-job.ts:13-18`, `40-71`).
- The API boot path validates environment variables before startup, enables Helmet/CSP, sets a restrictive `Permissions-Policy`, enables credentialed CORS only for `APP_URL` and `*.edupod.app`, and disables Swagger in production (`apps/api/src/main.ts:16-19`, `30-66`, `75-85`; `apps/api/src/modules/config/env.validation.ts:3-63`, `72-88`).
- Encryption is implemented with versioned keys and AES-256-GCM in application code (`apps/api/src/modules/configuration/encryption.service.ts:20-88`, `94-137`).
- GDPR/data-protection controls exist in code: tenant access is blocked until the current DPA is accepted (`apps/api/src/modules/gdpr/dpa-accepted.guard.ts:20-64`), and outbound GDPR exports can be tokenised with usage logging (`apps/api/src/modules/gdpr/gdpr-token.service.ts:24-87`, `112-123`).
- I found targeted raw SQL outside the RLS middleware despite the documented invariant that raw SQL should not exist elsewhere:
  - `apps/api/src/modules/finance/payments.service.ts:296-334`
  - `apps/worker/src/processors/behaviour/partition-maintenance.processor.ts:139-160`
- I verified that `cron_execution_logs` now does have an RLS policy in its migration companion file (`packages/prisma/migrations/20260402080000_add_reliability_r13_r18_r19_r23/post_migrate.sql:1-11`), but that table is still absent from the canonical `packages/prisma/rls/policies.sql` catalogue.
- Targeted search found documentation for double-submit CSRF protection in `Plans/context.md`, but no matching implementation hits in the reviewed API/web code paths (`Plans/context.md:292`; targeted `rg` search described below).

## B. Strong Signals

- The reviewed request path has real defense in depth, not a single-point tenant check:
  - tenant resolution is RLS-aware,
  - JWTs are tenant-checked in `AuthGuard`,
  - permission resolution is membership-scoped under RLS,
  - worker jobs are tenant-scoped at execution time.
- The previously risky auth bootstrap area appears materially improved. The self-access/bootstrap RLS policies for `tenant_domains`, `tenant_memberships`, `roles`, `role_permissions`, and `membership_roles` are exactly the kind of policies needed to make login and permission hydration work without weakening `FORCE ROW LEVEL SECURITY`.
- The application explicitly crashes in production if the connected PostgreSQL role has `SUPERUSER` or `BYPASSRLS`, which is one of the most important operational safeguards for a shared-schema multi-tenant system (`apps/api/src/common/guards/rls-role-check.service.ts:5-57`).
- Auth token handling is mostly sound in the reviewed paths:
  - access and refresh tokens use separate secrets (`apps/api/src/modules/auth/auth.service.ts:101-115`),
  - refresh tokens are delivered in `httpOnly` cookies scoped to `/api/v1/auth/refresh` (`apps/api/src/modules/auth/auth.controller.ts:78-85`, `188-195`),
  - session state is server-side in Redis and checked on refresh (`apps/api/src/modules/auth/auth.service.ts:119-150`, `395-475`).
- RBAC quality is above average for a modular monolith:
  - permission checks are centralized,
  - denials are auditable,
  - cache invalidation exists at both membership and tenant scope (`apps/api/src/common/services/permission-cache.service.ts:77-102`).
- Encryption implementation quality is decent at the code level:
  - AES-256-GCM,
  - versioned keys,
  - explicit failure on malformed key size,
  - decrypt path handles key versions and logs failures.
- GDPR posture is materially better than “checkbox compliance” in the reviewed code because it has both a contractual access gate (DPA acceptance) and a tokenisation/logging path for outbound data handling.

## C. Inferences

- On the evidence reviewed, the system is credibly safer than a typical SaaS shared-schema app for tenant isolation. I did not find a confirmed live cross-tenant read/write escape in the core request/auth/RBAC path I reviewed.
- The biggest remaining security risk is drift between the documented architecture rules and the actual implementation. That drift shows up in raw SQL exceptions, RLS catalogue drift, and key-custody design drift.
- The exact RLS gap that remains is not “a confirmed tenant table with no policy.” After verification, `cron_execution_logs` has an RLS policy in its migration file. The real remaining gap is that the canonical `packages/prisma/rls/policies.sql` inventory is stale and omits it, which weakens auditability and increases the chance of future regressions.
- Tenant isolation is strongest inside the DB-backed tenant path. The weaker areas are platform/app-layer exceptions: the unscoped `users` table, Redis-backed session / platform-owner state, and any logic that depends on configuration discipline rather than DB policy.
- Operational posture is mixed:
  - strong: startup env validation, production RLS-role assertion, restrictive headers/CORS;
  - weaker: no staging environment per repo instructions, and some security controls documented in plans are not yet clearly implemented in code.
- Encryption/key handling is good at the algorithm level but less convincing at the custody level. The reviewed code protects sensitive values from casual exposure, but it does not show the stronger external key-management posture described in the project context.

## D. Top Findings

### 1. Raw SQL containment rule is already broken in production code paths

- Severity: Medium
- Confidence: High
- Why it matters: The architecture says raw SQL is prohibited outside the RLS middleware because shared-schema safety depends on a very small number of carefully reviewed escape hatches. Once `$queryRawUnsafe` / `$executeRawUnsafe` appear in feature code, future review becomes harder, the blast radius of mistakes increases, and the “RLS is always applied the same way” guarantee gets weaker.
- Evidence:
  - The canonical fact pack lists “raw SQL prohibited outside RLS middleware” as a security linchpin (`Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md:175-178`).
  - `apps/api/src/modules/finance/payments.service.ts:296-334` uses `$queryRawUnsafe` inside a tenant RLS transaction for `FOR UPDATE` locking on `payments` and `invoices`.
  - `apps/worker/src/processors/behaviour/partition-maintenance.processor.ts:139-160` uses `$queryRawUnsafe` and `$executeRawUnsafe` for partition existence checks and DDL.
- Fix direction: Centralise the approved raw-SQL cases behind one reviewed infrastructure layer, prefer tagged-template raw SQL where possible, and add CI enforcement that only explicitly allowlisted files may use raw SQL APIs.

### 2. Login throttling is keyed only by email, making lockout abuse and password-spraying resistance weaker than intended

- Severity: Medium
- Confidence: High
- Why it matters: Per-email throttling protects one account from rapid guessing, but it also lets an attacker cheaply lock out known staff/admin accounts and does little against distributed password spraying across many accounts. For school data, staff/admin account availability and resilience against credential attacks matter.
- Evidence:
  - `apps/api/src/modules/auth/auth.service.ts:155-197` stores brute-force counters only at `brute_force:${email}`.
  - `ipAddress` and `userAgent` are only used for audit logging, not for the throttle key or decision (`apps/api/src/modules/auth/auth.service.ts:170-192`).
  - `Plans/context.md:294` documents rate limiting as “Per-tenant and per-user via Redis, configurable per endpoint class,” which is stronger than the reviewed implementation.
- Fix direction: Add layered throttling keyed by account + IP/subnet + tenant, with separate low-and-slow password-spraying detection. Keep audit logging, but make it part of the enforcement path rather than observability only.

### 3. Encryption key custody does not match the stronger Secrets Manager design documented for the platform

- Severity: Medium
- Confidence: Medium
- Why it matters: AES-256-GCM is a solid primitive, but for sensitive school data the harder question is where the master key lives. Loading master keys directly from environment variables means anyone who can read process env or deployment config can decrypt all tenant secrets protected by that key. That is materially weaker than externally managed key custody.
- Evidence:
  - `Plans/context.md:299-300` describes Stripe key encryption as “AES-256 with key in AWS Secrets Manager.”
  - The reviewed implementation loads key material directly from `ENCRYPTION_KEY_V1`, `ENCRYPTION_KEY_V2`, etc., or legacy env vars, via `ConfigService` (`apps/api/src/modules/configuration/encryption.service.ts:20-63`).
  - Targeted search found no code-level evidence of KMS / Secrets Manager integration in the reviewed runtime path; the hits were documentation and plans, not the active implementation.
- Fix direction: Move production master-key custody to an external secret manager or KMS-backed envelope-encryption flow, keep env-based keys only as an explicit local-dev fallback, and add a startup assertion that production is not running on fallback key sources.

### 4. The remaining RLS issue is catalogue drift, not a confirmed live missing policy

- Severity: Low
- Confidence: High
- Why it matters: For a shared-schema system, the policy inventory itself is a security control. If the “authoritative” catalogue is stale, reviewers and future automation can miss policy regressions even when a migration happened to add the right SQL.
- Evidence:
  - The fact pack flagged `cron_execution_logs` as the only tenant-scoped table lacking matching RLS policy evidence at pack time (`Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md:173-175`).
  - I verified that `packages/prisma/migrations/20260402080000_add_reliability_r13_r18_r19_r23/post_migrate.sql:1-11` does define and force an RLS policy for `cron_execution_logs`.
  - Targeted search against `packages/prisma/rls/policies.sql` found no `cron_execution_logs` entry, so the canonical catalogue is still incomplete.
- Fix direction: Regenerate or manually reconcile `packages/prisma/rls/policies.sql`, then add CI that diffs tenant-scoped tables against both the migration layer and the canonical policy inventory so this cannot drift silently again.

## E. Files Reviewed

- `Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md`
- `CLAUDE.md`
- `Plans/context.md`
- `architecture/danger-zones.md`
- `architecture/module-blast-radius.md`
- `apps/api/src/common/middleware/rls.middleware.ts`
- `apps/api/src/common/middleware/tenant-resolution.middleware.ts`
- `packages/prisma/rls/policies.sql`
- `packages/prisma/migrations/20260402080000_add_reliability_r13_r18_r19_r23/post_migrate.sql`
- `apps/api/src/common/guards/auth.guard.ts`
- `apps/api/src/common/guards/permission.guard.ts`
- `apps/api/src/common/guards/rls-role-check.service.ts`
- `apps/api/src/common/services/permission-cache.service.ts`
- `apps/api/src/main.ts`
- `apps/api/src/modules/config/env.validation.ts`
- `apps/api/src/modules/auth/auth.module.ts`
- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/auth/strategies/jwt.strategy.ts`
- `apps/api/src/modules/configuration/encryption.service.ts`
- `apps/api/src/modules/configuration/key-rotation.service.ts`
- `apps/api/src/modules/configuration/stripe-config.service.ts`
- `apps/api/src/modules/finance/stripe.service.ts`
- `apps/api/src/modules/finance/payments.service.ts`
- `apps/api/src/modules/gdpr/dpa-accepted.guard.ts`
- `apps/api/src/modules/gdpr/gdpr-token.service.ts`
- `apps/api/src/modules/audit-log/audit-log.service.ts`
- `apps/api/src/modules/audit-log/security-audit.service.ts`
- `apps/api/src/common/interceptors/audit-log.interceptor.ts`
- `apps/api/src/modules/tenants/guards/platform-owner.guard.ts`
- `apps/worker/src/base/tenant-aware-job.ts`
- `apps/worker/src/processors/behaviour/partition-maintenance.processor.ts`

## F. Additional Commands Run

- `rg -n 'cron_execution_logs' packages/prisma/rls/policies.sql packages/prisma/migrations/20260402080000_add_reliability_r13_r18_r19_r23/post_migrate.sql Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md`
- `rg -n '\\$executeRawUnsafe|\\$queryRawUnsafe|\\$executeRaw|\\$queryRaw' apps/api/src apps/worker/src`
- `rg -n 'csrf|CSRF|xsrf|double-submit' apps/api/src apps/web/src Plans/context.md`
- `rg -n 'KMS|kms|Vault|vault|secret manager|Secrets Manager|ENCRYPTION_KEY_V|ENCRYPTION_CURRENT_VERSION' apps/api/src packages architecture Plans Audit-GPT/Audit-GPT-2/fact-pack_02-04-2026.md`
- `nl -ba <file> | sed -n '<range>p'` across the reviewed files for exact line references
- `rg --files apps/api/src/modules/auth`

No runtime DB validation, integration tests, or production checks were run in this sub-review.

## G. Score

Anchored 1-10 scale:

- `1` = no credible tenant isolation; cross-tenant compromise is plausible from normal code paths
- `5` = basic multi-tenant controls exist, but material auth/RLS gaps remain
- `8` = credibly safe shared-schema design with defense in depth, but still carrying fixable hardening gaps
- `10` = mature, continuously verified school-data security posture with strong operational controls and low drift

Score: `7.8 / 10`

Bottom line: the reviewed system is credibly safe on core tenant isolation in its current request/auth/RBAC path, and materially stronger than the fact pack alone suggests after the auth-bootstrap RLS fixes. I would not call it fully hardened for sensitive multi-tenant school data yet because raw-SQL governance drift, env-based master-key custody, and relatively weak login throttling still leave avoidable security debt.

## H. Confidence in this review

Confidence: Medium-High

Reason: This was a targeted, evidence-backed code review against the canonical fact pack and the requested files, and I verified the main contradiction around `cron_execution_logs`. Confidence is not “High” because I did not run live database checks, inspect infrastructure/backup encryption, or validate production headers and secrets management end to end.
