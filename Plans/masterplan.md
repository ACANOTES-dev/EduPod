# SCHOOL OPERATING SYSTEM — IMPLEMENTATION-READY MASTER PLAN

**Version**: 6.0 — Final
**Date**: 16 March 2026
**Status**: Phase 4 — Implementation-ready (all red-team findings resolved and integrated through eight independent red-team passes; v4.3 resolved 27 findings, v4.4 resolved 20 findings, v5.0 resolved 25 findings, v6.0 integrated auto-scheduling module and resolved 51 findings from three independent red-team passes)
**Consumer**: Coding agent / development team

---

## 1. PROJECT OVERVIEW

This is a centralised, multi-tenant school operating system delivered as a SaaS platform on a single codebase and single deployment. All school tenants share one PostgreSQL database with strict Row-Level Security (RLS) isolation enforced at the database layer via mandatory `tenant_id` on every tenant-scoped row. The platform serves two initial school clients with the architecture designed to scale to hundreds of tenants without code changes or infrastructure duplication — adding a new school is a tenant provisioning operation, not a deployment.

The system provides: configurable admissions, student records, household and family management, staff and academic structure, manual and auto-scheduling with a CSP-based timetable solver (constraint propagation + backtracking) operating in manual/auto/hybrid modes, attendance, gradebook with weighted categories, report cards, academic transcripts, a finance module with invoicing/payments/refunds/installments, a payroll module with salaried and per-class compensation models/monthly payroll runs/immutable snapshots/payslip generation/payroll analytics, a communications layer spanning email (Resend), WhatsApp (Twilio), and in-app notifications with explicit parent communication preferences and WhatsApp-to-email fallback, a parent inquiry messaging system, a public website CMS per school, approval workflows, compliance/GDPR tooling, analytics, and role-aware dashboards.

Bilingual English/Arabic support with full RTL behaviour is foundational for all school-facing portals. Platform admin remains English-only. The system is delivered as a responsive web application with PWA shell — no native mobile apps in Phase 1. There are no public APIs, no self-service school onboarding, no general document upload/storage, and no offline writes. Auto-scheduling is included as a day-1 feature delivered in Phase 4b. All printable outputs (receipts, invoices, report cards, transcripts) are rendered on demand from code templates via Puppeteer and are not stored as document records.

**Environments**: Local → Staging → Demo → Production. One production deployment serves all schools.

---

## 2. SYSTEM ARCHITECTURE

### 2.1 Core Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Backend** | NestJS + TypeScript | Modular monolith |
| **ORM** | Prisma | With RLS middleware for tenant context injection |
| **Database** | PostgreSQL 16+ | Shared database, shared schema, RLS on all tenant tables |
| **Cache/Sessions** | Redis 7 (AWS ElastiCache) | Sessions, caching, rate limiting, queue coordination. **Production: AOF persistence enabled** to survive restarts without losing BullMQ delayed jobs (scheduled announcements, nightly batches). |
| **Job Queue** | BullMQ | Background job processing with dead-letter support |
| **Frontend** | Next.js 14+ (App Router) | Single codebase, role-aware shells |
| **UI Framework** | React + TypeScript + Tailwind CSS | Logical CSS utilities only (no physical left/right) |
| **Component Library** | shadcn/ui on Radix primitives | Accessible, composable |
| **i18n** | next-intl | Locales: `en`, `ar` |
| **Rich Text** | TipTap | BiDi support, mixed-direction content |
| **Search** | PostgreSQL full-text + Meilisearch | Fuzzy search with tenant-safe indexes |
| **Email** | Resend | Transactional email with webhook delivery tracking |
| **WhatsApp** | Twilio WhatsApp Business API | Pre-approved platform-level templates |
| **Payments** | Stripe Direct | Per-school Stripe accounts, encrypted key storage |
| **PDF Rendering** | Puppeteer | On-demand, locale-specific templates, Noto Sans Arabic |
| **File Storage** | AWS S3 | Logos, website media, temporary import files only |
| **Hosting** | AWS ECS/Fargate | Frontend, backend, and worker services |
| **Database Hosting** | AWS RDS PostgreSQL | Multi-AZ deployment, automated daily snapshots, 14-day retention, PITR |
| **CDN/Edge** | Cloudflare for SaaS | Custom domains, SSL, CDN, edge protection |
| **Monitoring** | Sentry + CloudWatch + custom alerts | Error tracking + infrastructure monitoring + operational alerts (see below) |
| **CI/CD** | GitHub Actions | Lint → type-check → test → build → deploy |

### 2.2 Monorepo Package Structure (Turborepo)

```
root/
├── apps/
│   ├── web/              # Next.js frontend (all role-aware shells)
│   ├── api/              # NestJS backend (modular monolith)
│   └── worker/           # BullMQ consumer service
├── packages/
│   ├── shared/           # Shared types, constants, Zod validation schemas
│   │   └── src/scheduler/  # Auto-scheduling CSP solver (pure TypeScript, no DB deps)
│   ├── prisma/           # Prisma schema, client, migrations, seed
│   ├── ui/               # Shared shadcn/Radix component library
│   ├── eslint-config/    # Shared ESLint configuration
│   └── tsconfig/         # Shared TypeScript configurations
├── turbo.json
├── package.json
└── .github/workflows/    # CI/CD pipeline definitions
```

### 2.3 Deployment Architecture

```
                    ┌─────────────────────────────────────┐
                    │         Cloudflare for SaaS          │
                    │   (CDN, SSL, custom domain routing)  │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │           AWS ALB                     │
                    └──┬───────────┬──────────────────────┘
                       │           │
          ┌────────────▼──┐  ┌─────▼────────────┐
          │  Frontend      │  │  Backend API      │
          │  (Next.js)     │  │  (NestJS)         │
          │  ECS/Fargate   │  │  ECS/Fargate      │
          │  Stateless     │  │  Stateless        │
          └────────────────┘  └──┬──────┬─────────┘
                                 │      │
                    ┌────────────▼┐  ┌──▼──────────────┐
                    │  PostgreSQL  │  │  Redis           │
                    │  (AWS RDS)   │  │  (ElastiCache)   │
                    │  + RLS       │  │  Sessions/Cache  │
                    └──────────────┘  └──────┬──────────┘
                                             │
                                   ┌─────────▼──────────┐
                                   │  Worker Service     │
                                   │  (BullMQ consumers) │
                                   │  ECS/Fargate        │
                                   └─────────────────────┘
                                             │
                              ┌──────────────┼────────────────┐
                              │              │                │
                        ┌─────▼──┐    ┌──────▼────┐    ┌─────▼──────┐
                        │ Resend │    │  Twilio   │    │ Meilisearch │
                        │ Email  │    │ WhatsApp  │    │  Search     │
                        └────────┘    └───────────┘    └────────────┘
```

### 2.4 Scaling Model

- **Frontend**: Stateless, horizontally scalable behind ALB
- **Backend API**: Stateless (sessions in Redis), horizontally scalable
- **Workers**: Scale by queue depth, BullMQ supports multiple concurrent consumers
- **PostgreSQL**: Single primary, read replica added when needed (not Phase 1)
- **Redis**: Single ElastiCache instance, cluster mode if needed later
- **Meilisearch**: Single instance, sufficient for Phase 1 scale
- **S3**: Effectively unlimited, tenant-namespaced paths

### 2.5 Connection Pooling & RLS

PgBouncer in **transaction mode**. RLS context is set via `SET LOCAL app.current_tenant_id` at the start of each Prisma transaction. A Prisma middleware intercepts every query batch and injects the tenant context from the resolved request.

**Critical rule — interactive transactions only**: All tenant-scoped database access **must** use Prisma's **interactive transaction** API (`prisma.$transaction(async (tx) => { ... })`). The sequential/batch API (`prisma.$transaction([...])`) is **prohibited** for tenant-scoped queries because PgBouncer in transaction mode does not guarantee that sequential statements in a batch share the same server-side connection. The interactive API opens a single database transaction that holds a connection for its duration, ensuring `SET LOCAL` and all subsequent queries execute on the same connection. A custom ESLint rule (`no-sequential-transaction`) must flag any usage of the array-based `$transaction` signature in tenant-scoped code.

```typescript
// ✅ CORRECT — interactive transaction, RLS context guaranteed
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SET LOCAL app.current_tenant_id = ${tenantId}`;
  return tx.student.findMany({ where: { status: 'active' } });
});

// ❌ PROHIBITED — sequential batch, RLS context may be lost through PgBouncer
await prisma.$transaction([
  prisma.$executeRaw`SET LOCAL app.current_tenant_id = ${tenantId}`,
  prisma.student.findMany({ where: { status: 'active' } }),
]);
```

**Critical rule**: All raw SQL queries are prohibited except within the RLS-setup middleware. A linting rule flags any `$executeRawUnsafe` or `$queryRawUnsafe` usage outside this pattern.

**Background jobs**: Every BullMQ job payload must include `tenant_id`. A `TenantAwareJob` base class sets RLS context before executing any database operation. Jobs without `tenant_id` are rejected at enqueue time. Background jobs use the same interactive transaction pattern — never the sequential batch API.

### 2.5b Database Migrations & RLS Policy Management

Prisma manages the schema (tables, columns, indexes, enums) via its standard migration system (`prisma migrate dev` / `prisma migrate deploy`). However, Prisma does **not** natively manage RLS policies, custom functions, or extensions. These are handled via **companion raw SQL migration files** that run alongside Prisma migrations.

**Migration directory structure**:
```
packages/prisma/
├── schema.prisma              # Prisma schema (tables, relations, enums)
├── migrations/
│   ├── 20260316000000_init/
│   │   ├── migration.sql      # Prisma-generated DDL
│   │   └── post_migrate.sql   # RLS policies, extensions, functions
│   ├── 20260320000000_add_payroll/
│   │   ├── migration.sql
│   │   └── post_migrate.sql
│   └── migration_lock.toml
├── rls/
│   └── policies.sql           # Full RLS policy definitions (reference/regenerable)
└── seed/
    ├── permissions.ts         # Global permission seeding
    ├── system-roles.ts        # Per-tenant system role factory
    └── dev-data.ts            # Local development fixtures
```

**RLS policy convention**: Every table with a `tenant_id` column gets an identical policy pattern. This explicitly includes junction tables (`household_parents`, `student_parents`, `class_staff`, `membership_roles`, `role_permissions` where `tenant_id IS NOT NULL`). A CI check verifies that every table with a `tenant_id` column has RLS enabled — any table missing a policy fails the migration step. The policy pattern:
```sql
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
CREATE POLICY {table_name}_tenant_isolation ON {table_name}
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**Nullable `tenant_id` RLS handling**: Three tables have nullable `tenant_id` because they contain both platform-level and tenant-level rows: `notification_templates`, `audit_logs`, and `role_permissions`. These tables use a **dual-policy pattern** (same approach already specified for `role_permissions` in Section 3.2):
- **Tenant-scoped policy**: Standard `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)` — applies to tenant-scoped queries, returns only tenant-specific rows.
- **Platform-scoped access**: Queries that need platform-level rows (e.g., notification template resolution falling back to platform defaults, platform admin viewing cross-tenant audit logs) must run **outside tenant-scoped RLS context** — either via a dedicated service role that bypasses RLS, or via a separate query that sets a platform context flag. The notification dispatch engine resolves templates in two steps: (1) query with tenant context for tenant-specific overrides, (2) if no match, query without tenant context for platform defaults. Platform admin audit log queries run without tenant context to see all entries.
- **CI check amendment**: The RLS CI check must allowlist these three tables for the dual-policy pattern rather than flagging them as missing a standard policy.

**Post-migrate runner**: A custom script (`scripts/post-migrate.ts`) executes all `post_migrate.sql` files in order after `prisma migrate deploy`. This runs in CI/CD and in local development. The script is idempotent — policies use `CREATE POLICY ... IF NOT EXISTS` or `DROP POLICY IF EXISTS` followed by `CREATE POLICY`.

**Trigger management**: The `set_updated_at()` trigger function is created in the first `post_migrate.sql` file and applied to every table with an `updated_at` column:
```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- Applied per table:
CREATE TRIGGER trg_{table_name}_updated_at
  BEFORE UPDATE ON {table_name}
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```
A CI check verifies that every table with an `updated_at` column has both an RLS policy (if tenant-scoped) and the `set_updated_at` trigger. Any table missing either fails the migration step. This trigger is critical for optimistic concurrency control (Section 2.14) — without it, `updated_at` never changes and conflict detection silently fails.

**Extension management**: `CREATE EXTENSION IF NOT EXISTS citext;` `CREATE EXTENSION IF NOT EXISTS btree_gist;` and any other required extensions are in the first `post_migrate.sql` file.

**Adding a new permission after tenants exist**: When a new permission is added:
1. Insert the permission row into the global `permissions` table
2. For each existing tenant, insert `role_permissions` rows linking the new permission to the appropriate system roles
3. This is handled by a migration helper function:
```sql
-- Helper: assign permission to system role across all tenants
CREATE OR REPLACE FUNCTION assign_permission_to_system_role(
  p_permission_key TEXT, p_role_key TEXT
) RETURNS void AS $$
INSERT INTO role_permissions (role_id, permission_id, tenant_id)
SELECT r.id, p.id, r.tenant_id
FROM roles r
JOIN permissions p ON p.permission_key = p_permission_key
WHERE r.role_key = p_role_key AND r.is_system_role = true
ON CONFLICT DO NOTHING;
$$ LANGUAGE sql;
```

**Seed execution order**: (1) Extensions → (2) `set_updated_at()` trigger function → (3) RLS policies → (4) Global permissions → (5) Tenant provisioning (which creates system roles and role_permissions). This order is enforced in the seed script and in the post-migrate runner.

**Environment-specific migrations**: All environments (local, staging, demo, production) run the same migration set. No environment-specific SQL.

### 2.6 Tenancy and Request Resolution

Tenant is resolved from hostname via `tenant_domains` lookup:
1. Extract hostname from incoming request
2. Query `tenant_domains` WHERE `domain = hostname` AND `verification_status = 'verified'`
3. If no match → return static 404 (never redirect, never leak tenant existence)
4. If match → load tenant record, check `tenants.status`
5. If `status = 'suspended'` → return `TENANT_SUSPENDED` error
6. If `status = 'archived'` → return 404
7. If `status = 'active'` → inject tenant context into request pipeline

Resolved tenant context is propagated to: Prisma RLS, permission guards, cache key prefixes, queue payloads, audit events, search filters, and response headers.

**Fallback domains**: Each tenant gets a platform subdomain (`{slug}.edupod.app`) automatically. Custom domains are added via platform admin and verified through Cloudflare.

**Platform domain**: `edupod.app` is the canonical platform domain used throughout this document. Subdomains: `{school-slug}.edupod.app` (school fallback access), `app.edupod.app` (platform admin), `api.edupod.app` (backend API). The external connections reference document may use the placeholder `yourplatform.com` — treat `edupod.app` as the resolved value.

### 2.7 Authentication and Session Model

| Component | Detail |
|-----------|--------|
| **Login** | Email/password |
| **MFA** | Optional TOTP with 10 recovery codes (hashed, single-use) |
| **Access Token** | JWT, 15-minute expiry, stored in memory (not localStorage) |
| **Refresh Token** | 7-day expiry, httpOnly cookie, stored in Redis with session metadata |
| **Concurrent Sessions** | Allowed (multiple devices) |
| **Session Revocation** | Delete from Redis → force-check on sensitive operations |
| **Tenant Switching** | `/auth/switch-tenant` endpoint issues new JWT with target tenant claims |
| **Staff Onboarding** | Invitation-based (email with time-limited token) |
| **Parent Onboarding** | Admissions-linked registration OR staff invitation |
| **Password Reset** | Email-based, 1-hour token, single-use, hashed in DB, all sessions revoked on reset |
| **Brute Force Protection** | Progressive delay: 5 failures → 30s, 8 → 2min, 10 → 30min lockout |

**Suspension side-effects**:
- **Tenant suspension** → Redis flag `tenant:{id}:suspended = true`, checked on every request
- **Membership suspension** → all Redis sessions for `user:{id}:tenant:{id}:*` deleted
- **Critical permission changes** → Redis permission cache for that membership invalidated
- **User global suspension** (`users.global_status → 'suspended'`): All active Redis sessions for the user across all tenants are deleted (`user:{id}:*`). All permission cache entries for the user across all tenants are invalidated (`perm:*:{user_id}`). Login is blocked platform-wide. Existing memberships are **not** automatically changed — their status remains as-is, but the user cannot authenticate to access any of them. On reactivation (`global_status → 'active'`), the user can log in again and access all memberships that are still in `active` status.
- **User global disable** (`users.global_status → 'disabled'`): Same immediate effects as suspension (all sessions and caches cleared). Additionally, all `active` memberships across all tenants are transitioned to `disabled` status in a background job. This is a permanent deactivation — the user's account is effectively retired. Re-enabling requires platform admin intervention.
- **Last school_owner interaction**: The `LAST_SCHOOL_OWNER` guard (Section 5.1) checks user global status changes. If globally suspending or disabling a user would leave any tenant without an active school_owner (because the user holds `school_owner` in that tenant and is the last one), the operation is blocked with `LAST_SCHOOL_OWNER` error listing the affected tenant(s).

### 2.8 RBAC Architecture

**Permission tiers** (custom roles can only combine permissions within their tier or below):
- `platform` — platform owner operations (tenant provisioning, cross-tenant monitoring)
- `admin` — school-level administration (user management, configuration, all data access)
- `staff` — teacher and staff operations (attendance, grades, assigned classes)
- `parent` — parent-scoped access (own household, linked students, invoices)

**Permission caching**: Loaded from DB per membership, cached in Redis for 60 seconds. Critical changes (role removal, suspension) explicitly invalidate the cache.

**Cache key format**: `perm:{tenant_id}:{user_id}` — the `tenant_id` is **always** part of the cache key. This prevents cross-tenant cache poisoning: a user with memberships in two tenants gets two independent cache entries. The cache loader queries `role_permissions` and `membership_roles` within the resolved tenant context (RLS-scoped interactive transaction). The loader **never** runs without a tenant context — platform-tier permissions are loaded separately via a dedicated platform cache key (`perm:platform:{user_id}`) that queries only platform-scoped roles (where `roles.tenant_id IS NULL`).

**Cache invalidation triggers**: role assignment/removal on a membership, role permission change (custom roles), membership suspension/disable, tenant suspension. Invalidation deletes the specific `perm:{tenant_id}:{user_id}` key. Tenant-wide invalidation (e.g., custom role permission change) iterates all active memberships for the tenant and deletes their cache keys.

**Multi-role handling**: A user with both parent and staff roles in the same tenant sees a **context switcher** in the UI. Permissions are the union of all roles, but data access is scoped by active context. API endpoints check active context, not just permission set.

**Invariants**:
- At least one active `school_owner` role per tenant at all times (see Section 5.1 for full operational specification)
- Requester cannot approve their own approval requests
- Custom roles cannot include permissions from a higher tier
- `school_owner` is a system role and cannot be deleted or modified

#### 2.8.1 Complete Permission Catalogue

This is the **sole source of truth** for every permission key in the system. All permissions are seeded during tenant provisioning. Custom roles can only assign permissions from this list. No permission key outside this list is valid.

**Permission key format**: `{module}.{action}` — always lowercase, dot-separated, no spaces.

**Guard implementation**: Every API endpoint declares its required permission(s) via a `@RequirePermission('module.action')` decorator. The guard checks the requesting user's resolved permission set (cached in Redis).

##### Platform Tier Permissions

| Permission Key | Description |
|----------------|-------------|
| `platform.manage_tenants` | Create, suspend, archive tenants |
| `platform.view_tenants` | View all tenants and health dashboard |
| `platform.impersonate` | Read-only impersonation into any tenant |
| `platform.manage_users` | Reset MFA, view cross-tenant user records |
| `platform.manage_security` | Set platform-wide security minimums |
| `platform.manage_templates` | Create, edit, delete platform-level notification templates (`notification_templates` where `tenant_id IS NULL`) |
| `platform.process_compliance` | Process platform-level compliance requests (user-level erasure across all tenants when no active memberships remain) |

**Default role**: `platform_owner` gets all platform-tier permissions.

##### Admin Tier Permissions

| Permission Key | Description | `school_owner` | `school_admin` | `finance_staff` | `admissions_staff` |
|----------------|-------------|:-:|:-:|:-:|:-:|
| `tenant.manage_settings` | Edit tenant_settings, branding, modules, notification settings | ✓ | ✓ | | |
| `tenant.manage_stripe` | Create/update Stripe configuration | ✓ | | | |
| `tenant.manage_domains` | Request custom domain verification | ✓ | | | |
| `users.manage_staff` | Invite, edit, suspend staff memberships | ✓ | ✓ | | |
| `users.manage_parents` | Invite, edit, suspend parent memberships | ✓ | ✓ | | |
| `users.manage_roles` | Create custom roles, assign/revoke roles | ✓ | ✓ | | |
| `households.manage` | Create, edit, archive, merge, split households | ✓ | ✓ | | |
| `students.manage` | Create, edit, change status, assign year group | ✓ | ✓ | | |
| `students.export` | Export student pack (profile, grades, attendance) | ✓ | ✓ | | |
| `academics.manage_structure` | Manage academic years, periods, year groups, subjects | ✓ | ✓ | | |
| `academics.manage_classes` | Create/edit classes, assign staff, manage enrolments | ✓ | ✓ | | |
| `academics.run_promotion` | Execute promotion/rollover wizard | ✓ | ✓ | | |
| `schedule.manage` | Create, edit, delete schedule entries | ✓ | ✓ | | |
| `schedule.override_conflict` | Save schedule entry despite hard conflict (with mandatory reason) | ✓ | | | |
| `schedule.manage_closures` | Create, edit, delete school closures | ✓ | ✓ | | |
| `schedule.configure_period_grid` | Configure period grid templates for auto-scheduling | ✓ | ✓ | | |
| `schedule.configure_requirements` | Configure class scheduling requirements and supervision subjects | ✓ | ✓ | | |
| `schedule.configure_availability` | Configure teacher availability windows (hard constraints) | ✓ | | | |
| `schedule.manage_preferences` | Manage any teacher's scheduling preferences (admin override) | ✓ | ✓ | | |
| `schedule.run_auto` | Execute auto-scheduler solver runs | ✓ | ✓ | | |
| `schedule.apply_auto` | Apply a proposed auto-generated timetable (approval-gated for non-school_owner) | ✓ | ✓ | | |
| `schedule.pin_entries` | Pin/unpin schedule entries for hybrid mode | ✓ | ✓ | | |
| `schedule.view_auto_reports` | View scheduling run history, constraint reports, preference satisfaction reports | ✓ | ✓ | | |
| `attendance.view_all` | View attendance for all classes (not just assigned) | ✓ | ✓ | | |
| `attendance.amend_historical` | Amend submitted/locked attendance records (with mandatory reason) | ✓ | ✓ | | |
| `attendance.override_closure` | Create ad-hoc attendance session on closure date (with mandatory reason) | ✓ | ✓ | | |
| `attendance.lock_sessions` | Lock submitted sessions (prevent further amendment) | ✓ | ✓ | | |
| `gradebook.manage_scales` | Create/edit grading scales and assessment categories | ✓ | ✓ | | |
| `gradebook.manage_configs` | Configure class-subject grade configs (weights) | ✓ | ✓ | | |
| `gradebook.override_final_grade` | Override period grade snapshot display value (with mandatory reason) | ✓ | | | |
| `gradebook.view_all` | View grades for all classes (not just assigned) | ✓ | ✓ | | |
| `report_cards.manage` | Generate, publish, revise report cards | ✓ | ✓ | | |
| `report_cards.add_principal_comment` | Add principal comment to report cards | ✓ | | | |
| `transcripts.generate` | Generate academic transcripts | ✓ | ✓ | | |
| `admissions.manage_forms` | Create/edit/publish admission forms | ✓ | ✓ | | ✓ |
| `admissions.review` | View and progress applications through workflow | ✓ | ✓ | | ✓ |
| `admissions.accept` | Move applications to accepted status | ✓ | ✓ | | ✓ |
| `admissions.convert` | Execute application-to-student conversion on approved applications | ✓ | ✓ | | ✓ |
| `finance.manage_fees` | Create/edit fee structures, discounts, assignments | ✓ | | ✓ | |
| `finance.generate_invoices` | Run fee generation wizard, create draft invoices | ✓ | | ✓ | |
| `finance.manage_invoices` | Edit, issue, void, write off invoices | ✓ | | ✓ | |
| `finance.record_payments` | Record manual payments, trigger Stripe checkout | ✓ | | ✓ | |
| `finance.allocate_payments` | Allocate payments to invoices | ✓ | | ✓ | |
| `finance.request_refund` | Create refund requests | ✓ | | ✓ | |
| `finance.execute_refund` | Execute approved refund (Stripe or manual) | ✓ | | ✓ | |
| `finance.override_refund_guard` | Override refund guards (e.g., refund against written-off invoice) with mandatory reason | ✓ | | | |
| `finance.view_reports` | View finance dashboards and reports | ✓ | ✓ | ✓ | |
| `payroll.view` | View payroll runs, entries, payslips, and reports | ✓ | | | |
| `payroll.manage_compensation` | Create/edit staff compensation records | ✓ | | | |
| `payroll.create_run` | Create and edit draft payroll runs, enter days/classes | ✓ | | | |
| `payroll.finalise_run` | Finalise payroll runs (school_owner: direct; others: approval required) | ✓ | | | |
| `payroll.generate_payslips` | Generate and export payslip PDFs | ✓ | | | |
| `payroll.view_bank_details` | View decrypted staff bank account details (audit-logged) | ✓ | | | |
| `payroll.view_reports` | View payroll analytics, trends, and summary reports | ✓ | | | |
| `communications.manage_announcements` | Draft, publish, schedule announcements | ✓ | ✓ | | |
| `communications.manage_templates` | Manage tenant-level notification templates | ✓ | ✓ | | |
| `communications.view_delivery` | View notification delivery audit | ✓ | ✓ | | |
| `inquiries.view` | View and respond to parent inquiries | ✓ | ✓ | | |
| `inquiries.close` | Close parent inquiries | ✓ | ✓ | | |
| `website.manage_pages` | Create, edit, publish website pages | ✓ | ✓ | | |
| `website.manage_nav` | Configure navigation ordering | ✓ | ✓ | | |
| `website.view_submissions` | View contact form submissions | ✓ | ✓ | | |
| `compliance.submit_request` | Submit access export, erasure, rectification requests | ✓ | ✓ | | |
| `compliance.process_request` | Classify, approve, execute compliance requests | ✓ | | | |
| `audit.view` | View tenant audit log | ✓ | ✓ | | |
| `imports.manage` | Upload and execute bulk imports | ✓ | ✓ | | |
| `search.global` | Use global search | ✓ | ✓ | ✓ | ✓ |
| `approvals.decide` | Approve/reject approval requests (scoped by workflow config) | ✓ | ✓ | | |
| `reports.view` | View analytics and reports | ✓ | ✓ | | |

**Auto-scheduling apply access model**: Applying a proposed schedule is a high-impact bulk operation that replaces all auto-generated entries for an academic year. When a user with `schedule.apply_auto` permission but without `school_owner` role attempts to apply, the system routes through the approval workflow to a `school_owner` user for authorisation (controlled by `tenant_settings.scheduling.requireApprovalForNonPrincipal`, default `true`). `school_owner` can apply directly without approval. This is the same pattern as payroll finalisation.

**Auto-scheduling permission granularity**: The original spec bundled period grid, class requirements, and teacher availability into a single `schedule.configure_auto` permission. These are split into three permissions because: (a) `schedule.configure_availability` is HR-sensitive (controls when a teacher can work) and is restricted to `school_owner` only by default, (b) `schedule.configure_period_grid` and `schedule.configure_requirements` are academic planning tasks suitable for `school_admin`, and (c) `schedule.manage_preferences` covers admin override of any teacher's preferences, distinct from teacher self-service (`schedule.manage_own_preferences`).

**Teacher self-service preferences**: If the school wants teachers to enter their own preferences, the `teacher` system role has `schedule.manage_own_preferences` by default. Teachers can only see and edit their own preferences, never other teachers'. They can also see how their preferences were satisfied via `schedule.view_own_satisfaction`. The admin/principal can always override via `schedule.manage_preferences`.

**Payroll access model**: By default, only `school_owner` (the principal) has payroll permissions. The school can grant any of these permissions to other roles (e.g., `school_admin`, `finance_staff`, or a custom `payroll_admin` role). When a user without `school_owner` role attempts to finalise a payroll run, the system automatically routes through the approval workflow to a `school_owner` user for authorisation (controlled by `tenant_settings.payroll.requireApprovalForNonPrincipal`).

##### Staff Tier Permissions

| Permission Key | Description | `teacher` |
|----------------|-------------|:-:|
| `attendance.mark` | Mark attendance for assigned classes | ✓ |
| `attendance.submit` | Submit attendance sessions for assigned classes | ✓ |
| `gradebook.manage_assessments` | Create/edit assessments for assigned classes | ✓ |
| `gradebook.enter_grades` | Enter/edit grades for assigned class assessments | ✓ |
| `report_cards.add_teacher_comment` | Add teacher comment to report cards for assigned classes | ✓ |
| `schedule.view_own` | View own timetable | ✓ |
| `schedule.manage_own_preferences` | Set own scheduling preferences (subject, class, time) | ✓ |
| `schedule.view_own_satisfaction` | View how own scheduling preferences were satisfied in the current timetable | ✓ |
| `search.global` | Use global search (results filtered to assigned scope) | ✓ |

##### Parent Tier Permissions

| Permission Key | Description | `parent` |
|----------------|-------------|:-:|
| `parent.view_household` | View own household, linked students | ✓ |
| `parent.view_attendance` | View linked students' attendance (if tenant-enabled) | ✓ |
| `parent.view_grades` | View linked students' grades (if tenant-enabled) | ✓ |
| `parent.view_report_cards` | View linked students' published report cards | ✓ |
| `parent.view_invoices` | View household invoices, make payments | ✓ |
| `parent.manage_inquiries` | Submit and participate in inquiry threads | ✓ |
| `parent.view_announcements` | View announcements targeted to them | ✓ |
| `parent.view_transcripts` | View and download linked students' academic transcripts | ✓ |
| `parent.manage_profile` | Edit own profile, communication preferences | ✓ |

##### Seeding Rules

1. **Bootstrap (runs once, before any tenant exists)**: All permissions are inserted into the global `permissions` table. This is a migration-time operation (see Section 2.5b). Permissions must exist before the first tenant is provisioned.
2. **On tenant provisioning**: System roles (`school_owner`, `school_admin`, `teacher`, `finance_staff`, `admissions_staff`, `parent`) are created for the new tenant. `role_permissions` rows are created linking each system role to its default permissions from the catalogue above. The provisioning function reads from `permissions` (global) and creates tenant-scoped `roles` and `role_permissions` rows in a single transaction.
3. **Adding a new permission post-launch**: A migration must (a) insert the new row into `permissions`, and (b) create `role_permissions` rows for every existing tenant's affected system roles using the `assign_permission_to_system_role()` helper (see Section 2.5b). Future tenant provisioning automatically picks up the new permission from the catalogue.
4. **Immutability**: System role permission mappings are the factory defaults. School admin can create custom roles and assign any subset of permissions at or below the role's tier. System roles themselves cannot have permissions added or removed by school admins. Only platform-level migrations can modify system role defaults.
5. **No unregistered permissions**: The permission catalogue above is exhaustive. Any API endpoint requiring a permission not in this list is a bug.

### 2.9 i18n and RTL Architecture

| Rule | Detail |
|------|--------|
| **Supported locales** | `en`, `ar` |
| **Platform admin** | English-only |
| **Locale resolution** | `users.preferred_locale` → `tenants.default_locale` → `en` |
| **HTML attributes** | `<html lang>` and `<html dir>` set from effective locale |
| **CSS** | Tailwind logical utilities required; physical `left`/`right` prohibited |
| **LTR enforcement** | Email addresses, URLs, phone numbers, numeric inputs, enrolment IDs |
| **Numerals** | Western (0-9) in both locales |
| **Calendar** | Gregorian in both locales |
| **Rich text** | TipTap preserves block `dir` attribute, supports mixed-direction content |

### 2.10 Printable Document Rendering

- Prebuilt locale-specific templates in code (separate English and Arabic templates)
- Puppeteer rendering engine generates PDF on demand
- Noto Sans Arabic embedded for Arabic templates
- No persistent document archive
- Templates: receipts, invoices, report cards, transcripts, payslips (individual and mass-export consolidated PDF)
- Preflight check: missing template or font blocks render with specific error (never produces bad output)
- Locale-specific snapshot testing in CI

**Font note (deliberate difference)**: The web UI uses Plus Jakarta Sans (Latin) with system Arabic fonts for interactive screens. PDF templates use Noto Sans Arabic because Puppeteer requires embedded fonts — system fonts are not available in the headless Chromium environment. This means Arabic PDF output will look slightly different from the web UI. This is intentional and expected. Latin content in PDFs uses the same Plus Jakarta Sans (loaded as a web font in the Puppeteer template).

### 2.11 Messaging Architecture

**Channels**: email (Resend), WhatsApp (Twilio), in-app notifications

**Parent communication preference model**:
- Captured at registration/invitation: `preferred_contact_channels` = `['email']`, `['whatsapp']`, or `['email','whatsapp']`
- `whatsapp_phone` field: separate from primary phone, required if WhatsApp selected
- Primary phone can be used for WhatsApp only with explicit confirmation

**Dispatch chain**:
1. Determine preferred channel(s) from parent record
2. If WhatsApp: check template exists for locale → check `whatsapp_phone` valid → send
3. If WhatsApp fails → automatic email fallback
4. If email fails or unavailable → create in-app notification if user account exists
5. Mark as failed, surface to admin

**WhatsApp templates**: Platform-level only. Pre-approved via Twilio. Variable substitution for school name/branding. Schools do not manage their own templates. **Note**: This means all tenants share identical WhatsApp message templates. If tenants operate in different linguistic contexts (e.g., different Arabic dialects), per-tenant template customisation is a deferred feature — not Phase 1.

**Notification configurability**: Each notification type (invoice issued, payment received, attendance exception, etc.) is configurable per school via `tenant_notification_settings`. School admin can enable/disable each type and select channels.

### 2.12 File/Storage Boundary

| Stored | Not Stored |
|--------|-----------|
| Logos (S3: `/{tenant_id}/logos/`) | Receipts/invoices/report cards as files |
| Website media (S3: `/{tenant_id}/media/`) | Parent-uploaded admissions documents |
| Temporary import files (purged after processing) | Any general-purpose documents |

**Constraints**: Logos max 2MB (PNG, JPG, WebP, SVG). Media max 5MB (PNG, JPG, WebP). Served via Cloudflare CDN.

### 2.13 Security Hardening

| Measure | Implementation |
|---------|---------------|
| **CSRF** | Double-submit cookie (SameSite=Lax + CSRF token for mutations). **Webhook endpoints exempt**: `/api/webhooks/stripe` and `/api/webhooks/resend` are excluded from CSRF protection — they are authenticated via provider-specific signature verification instead. **Public form endpoints exempt**: `/api/v1/public/admissions/submit` and `/api/v1/public/contact` rely on rate limiting + honeypot for protection (no authenticated session exists for CSRF cookie bootstrap). Rate limits: contact form = 5 submissions per IP per hour; admissions form = 3 submissions per IP per tenant per hour (Redis key: `ratelimit:admissions:{tenant_id}:{ip}`, TTL = 1 hour). |
| **CSP** | Strict Content-Security-Policy headers |
| **Rate Limiting** | Per-tenant and per-user via Redis, configurable per endpoint class |
| **Input Validation** | Zod schemas on all API inputs |
| **HTML Sanitization** | DOMPurify server-side on all TipTap HTML before storage |
| **SQL Injection** | Prisma parameterised queries, raw queries prohibited |
| **XSS** | React default escaping + CSP + sanitised rich text |
| **Encryption at Rest** | AWS RDS AES-256, S3 server-side encryption |
| **Stripe Key Encryption** | AES-256 with key in AWS Secrets Manager, never exposed in API responses |
| **Audit** | All security-relevant actions logged to append-only audit_logs |

### 2.14 Optimistic Concurrency Control

Entities subject to concurrent editing by multiple users implement optimistic concurrency via `updated_at`-based versioning. The client includes the entity's `updated_at` value (received when reading the entity) in update requests via an `If-Unmodified-Since` header or an `expected_updated_at` field in the request body. The API layer checks `WHERE id = :id AND updated_at = :expected_updated_at`; if no row matches, it returns `CONCURRENT_MODIFICATION` (409).

**Entities requiring optimistic concurrency**:

| Entity | Why |
|--------|-----|
| `payroll_runs` (draft) | Principal and finance staff may edit concurrently |
| `payroll_entries` (draft) | Multiple entries edited in quick succession |
| `invoices` (draft) | Finance staff may edit and issue concurrently |
| `attendance_sessions` | Teacher submits while admin amends |
| `approval_requests` | Two approvers racing to decide |
| `applications` | Two admins reviewing simultaneously |
| `tenant_settings` | Two admins editing settings concurrently |
| `staff_compensation` | Rate change while payroll is being drafted |

**Entities NOT requiring optimistic concurrency** (append-only or single-actor): `audit_logs`, `notifications`, `grades` (single teacher per class), `receipts` (immutable), `payslips` (immutable).

### 2.15 Frontend Architecture Requirements

The following frontend infrastructure requirements are derived from the UI design brief and must be implemented as part of the build, not deferred as polish.

**Dark mode**: Full dark mode support is a Phase 1 deliverable. All colour tokens exist in both modes via CSS custom properties toggled by a class on `<html>` using `next-themes`. Every component must reference tokens, never hardcoded colours. Dark mode must preserve hierarchy and readability.

**User preferences storage**: A `user_ui_preferences` table stores per-user, per-tenant UI state (see Section 3.12 for data model). This includes: sidebar collapsed state, last active role context, locale and theme preference, table column visibility and ordering, saved filters and views, recently viewed records (last 20), pinned records (max 25), and last active tab on record hub pages.

**Preview endpoints**: Every entity listed in the record hub pattern (student, household, staff member, class, application, invoice, payroll run, approval request) must expose a lightweight `GET /api/v1/{entity}/:id/preview` endpoint that returns only the fields needed for hover preview cards: name/reference, status, and 2–3 key contextual facts. These endpoints are permission-checked but return minimal data (no joins to child collections). Response time target: <50ms p95.

**Keyboard shortcut system**: The frontend implements a lightweight shortcut registration system via a React context provider (`ShortcutProvider`). Each page/module registers its shortcuts on mount and deregisters on unmount. The provider handles conflict resolution (page-level shortcuts override global shortcuts while the page is active). Global shortcuts (`⌘K` for command palette, `Esc` for close) are always registered. Per-page shortcuts (`⌘N` for create, `⌘S` for save, `⌘Enter` for submit) are registered by the page component.

**Visual regression testing**: The CI pipeline includes Playwright-based visual comparison tests for critical screens in both locales (English LTR and Arabic RTL). Coverage targets: all dashboard views, attendance marking screen, payroll summary review, invoice hub, report card preview, and the login page. These run on every PR alongside the existing unit and integration tests. PDF snapshot tests (already specified in Phase 9) cover Puppeteer-rendered outputs.

---

## 3. DATA MODELS

### 3.0 Conventions

- All `id` columns are `UUID` with `gen_random_uuid()` default
- All tenant-scoped tables have `tenant_id UUID NOT NULL FK → tenants` with RLS policy
- All tables with `created_at` use `TIMESTAMPTZ NOT NULL DEFAULT now()`
- All tables with `updated_at` use `TIMESTAMPTZ NOT NULL DEFAULT now()` with update trigger
- **Tables intentionally without `updated_at`** (append-only or immutable, never modified after creation): `school_closures`, `application_notes`, `parent_inquiry_messages`, `mfa_recovery_codes`, `audit_logs`, `receipts`, `payslips`, `payment_allocations`, `permissions`. These do not receive the `set_updated_at()` trigger. `contact_form_submissions` is an exception — it has mutable `status` and therefore includes `updated_at` (see Section 3.10). `household_parents` and `student_parents` are junction tables with mutable label columns (`role_label`, `relationship_label`) and therefore include `updated_at`.
- CITEXT extension enabled for case-insensitive email storage
- ENUM types are PostgreSQL native enums
- JSONB fields have corresponding Zod validation schemas at the API layer
- Indexes are listed after each table group

### 3.1 Platform and Tenancy

#### `tenants`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| name | VARCHAR(255) | NOT NULL |
| slug | VARCHAR(100) | UNIQUE NOT NULL, immutable after creation |
| status | ENUM('active','suspended','archived') | NOT NULL DEFAULT 'active' |
| default_locale | VARCHAR(10) | NOT NULL DEFAULT 'en', CHECK IN ('en','ar') |
| timezone | VARCHAR(100) | NOT NULL |
| date_format | VARCHAR(50) | NOT NULL |
| currency_code | VARCHAR(10) | NOT NULL |
| academic_year_start_month | SMALLINT | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

#### `tenant_domains`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| domain | VARCHAR(255) | UNIQUE NOT NULL |
| domain_type | ENUM('app','public_site') | NOT NULL |
| verification_status | ENUM('pending','verified','failed') | NOT NULL |
| ssl_status | ENUM('pending','active','failed') | NOT NULL |
| is_primary | BOOLEAN | NOT NULL DEFAULT false |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, domain_type) WHERE is_primary = true` (partial unique index — only one primary per type per tenant)

#### `tenant_modules`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| module_key | VARCHAR(100) | NOT NULL |
| is_enabled | BOOLEAN | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, module_key)`

**Valid module_key values**: `admissions`, `attendance`, `gradebook`, `finance`, `payroll`, `communications`, `website`, `analytics`, `compliance`, `parent_inquiries`, `auto_scheduling`

**`auto_scheduling` module toggle**: When `is_enabled = false` for this module, all auto-scheduling UI is hidden (setup wizard, solver, run history, preference management). The `tenant_settings.scheduling.autoSchedulerEnabled` flag mirrors this module toggle for consistency — both must agree. Manual scheduling remains available regardless. When disabled, data in `schedule_period_templates`, `staff_availability`, `staff_scheduling_preferences`, `class_scheduling_requirements`, and `scheduling_runs` is preserved (not deleted) — re-enabling restores full functionality.

#### `tenant_branding`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | UNIQUE FK → tenants |
| primary_color | VARCHAR(20) | NULL |
| secondary_color | VARCHAR(20) | NULL |
| logo_url | TEXT | NULL |
| school_name_display | VARCHAR(255) | NULL |
| school_name_ar | VARCHAR(255) | NULL |
| email_from_name | VARCHAR(255) | NULL |
| email_from_name_ar | VARCHAR(255) | NULL |
| support_email | VARCHAR(255) | NULL |
| support_phone | VARCHAR(50) | NULL |
| receipt_prefix | VARCHAR(30) | NOT NULL DEFAULT 'REC' |
| invoice_prefix | VARCHAR(30) | NOT NULL DEFAULT 'INV' |
| report_card_title | VARCHAR(255) | NULL |
| payslip_prefix | VARCHAR(30) | NOT NULL DEFAULT 'PSL' |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

#### `tenant_settings`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | UNIQUE FK → tenants |
| settings | JSONB | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**JSONB evolution strategy**: All keys in the Zod schema use `.default()` values. The API read path parses stored JSONB through the Zod schema, which fills missing keys with defaults before returning to the client. No backfill migration is needed for new optional settings — the schema handles it at read time. Required settings changes (removing a key, changing a key's type) require a data migration to update all existing tenants' JSONB.

**Key removal migration pattern**: When a setting key is removed from the Zod schema, a `post_migrate.sql` must strip it from all existing rows to prevent stale data accumulation:
```sql
-- Example: removing a deprecated key
UPDATE tenant_settings
SET settings = settings - 'deprecated_key_path'
WHERE settings ? 'deprecated_key_path';
-- For nested keys: settings #- '{parent_key,child_key}'
```
For type changes, the migration must transform the value in-place:
```sql
UPDATE tenant_settings
SET settings = jsonb_set(settings, '{key_path}', to_jsonb(new_default_value))
WHERE jsonb_typeof(settings -> 'key_path') != 'expected_new_type';
```

**`settings` JSONB Schema (Zod-validated)**:
```typescript
{
  attendance: {
    allowTeacherAmendment: boolean,        // default: false
    autoLockAfterDays: number | null,      // null = never auto-lock
    pendingAlertTimeHour: number           // hour of day (0-23) for pending attendance alerts, default: 14
  },
  gradebook: {
    defaultMissingGradePolicy: 'exclude' | 'zero',  // default: 'exclude'
    requireGradeComment: boolean                      // default: false
  },
  admissions: {
    requireApprovalForAcceptance: boolean   // default: true
  },
  finance: {
    requireApprovalForInvoiceIssue: boolean,  // default: false
    defaultPaymentTermDays: number,            // default: 30
    allowPartialPayment: boolean               // default: true
  },
  communications: {
    primaryOutboundChannel: 'email' | 'whatsapp',  // default: 'email'
    requireApprovalForAnnouncements: boolean         // default: true
  },
  payroll: {
    requireApprovalForNonPrincipal: boolean,   // default: true — if actor does NOT hold school_owner role, finalisation requires approval from school_owner
    defaultBonusMultiplier: number,            // default: 1.0 (no bonus premium for extra days — same rate)
    autoPopulateClassCounts: boolean           // default: true — pre-fill per-class teacher class counts from attendance sessions (submitted/locked only). Requires attendance module enabled.
  },
  scheduling: {
    teacherWeeklyMaxPeriods: number | null,    // default: null (disabled). When set: count of schedule entries per teacher per week. Triggers soft conflict warning (not blocking) when exceeded. Each school sets their own threshold based on their policies.
    autoSchedulerEnabled: boolean,             // default: true. When false, only manual scheduling mode is available — all auto-scheduling UI (setup wizard, solver, run history) is hidden. Data tables (period templates, availability, preferences) are preserved when disabled.
    requireApprovalForNonPrincipal: boolean,    // default: true. When true, users with schedule.apply_auto but without school_owner role must go through approval workflow to apply a scheduling run.
    maxSolverDurationSeconds: number,          // default: 120. Maximum time the solver runs before returning partial result. Admin can increase for large schools.
    preferenceWeights: {                       // weights for teacher preference priority levels in the solver's fitness function
      low: number,                             // default: 1
      medium: number,                          // default: 2
      high: number                             // default: 3
    },
    globalSoftWeights: {                       // weights for global soft constraints (0 = disabled)
      evenSubjectSpread: number,               // default: 2. Distribute a class's periods across distinct weekdays.
      minimiseTeacherGaps: number,             // default: 1. Reduce free periods between a teacher's first and last class of the day.
      roomConsistency: number,                 // default: 1. When a class has a preferred_room_id, assign that room if available.
      workloadBalance: number                  // default: 1. Distribute total periods evenly across teachers.
    }
  },
  approvals: {
    expiryDays: number,         // default: 7. Calendar days. Set to 0 for no expiry.
    reminderAfterHours: number  // default: 48. Send reminder notification to approver(s) if still pending.
  },
  general: {
    parentPortalEnabled: boolean,              // default: true
    attendanceVisibleToParents: boolean,        // default: true
    gradesVisibleToParents: boolean,            // default: true
    inquiryStaleHours: number                  // hours before inquiry flagged as stale, default: 48
  },
  compliance: {
    auditLogRetentionMonths: number            // default: 36. Months before audit log partitions are archived to S3 and dropped. Platform owner can override per tenant.
  }
}
```

**Cross-module dependency validation (enforced on settings save and surfaced in settings UI)**:

| Setting | Dependency | UI Behaviour |
|---------|-----------|-------------|
| `payroll.autoPopulateClassCounts = true` | Requires `attendance` module enabled | Warning banner: "Auto-population requires the Attendance module. Class counts will need to be entered manually while Attendance is disabled." Setting is saved but silently skipped at runtime if attendance is disabled. |
| `communications.primaryOutboundChannel = 'whatsapp'` | Requires Twilio credentials configured at platform level | Warning banner: "WhatsApp requires platform-level Twilio configuration. Email will be used as fallback." |
| `finance.requireApprovalForInvoiceIssue = true` | Requires at least one approval workflow for `invoice.issue` | Warning banner: "No approval workflow configured for invoice issuance. Approval will be required but no approver can act until a workflow is created." |
| `payroll.requireApprovalForNonPrincipal = true` | Requires at least one active `school_owner` membership | Error: blocked — cannot enable if no school_owner exists (should never happen due to Section 5.1 invariant, but defensive check) |

#### `tenant_notification_settings`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| notification_type | VARCHAR(100) | NOT NULL |
| is_enabled | BOOLEAN | NOT NULL DEFAULT true |
| channels | JSONB | NOT NULL, default: `["email"]` |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, notification_type)`

**Valid notification_type values**: `invoice.issued`, `payment.received`, `payment.failed`, `report_card.published`, `attendance.exception`, `admission.status_change`, `announcement.published`, `approval.requested`, `approval.decided`, `inquiry.new_message`, `payroll.finalised`, `payslip.generated`

#### `tenant_sequences`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| sequence_type | VARCHAR(50) | NOT NULL |
| current_value | BIGINT | NOT NULL DEFAULT 0 |

**Constraint**: `UNIQUE (tenant_id, sequence_type)`

**Usage**: Row-level `SELECT ... FOR UPDATE` locking when generating receipt numbers, invoice numbers, application numbers.

**Valid sequence_type values**: `receipt`, `invoice`, `application`, `payslip`

#### `tenant_stripe_configs`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | UNIQUE FK → tenants |
| stripe_secret_key_encrypted | TEXT | NOT NULL |
| stripe_publishable_key | VARCHAR(255) | NOT NULL |
| stripe_webhook_secret_encrypted | TEXT | NOT NULL |
| encryption_key_ref | VARCHAR(255) | NOT NULL (AWS Secrets Manager ARN) |
| key_last_rotated_at | TIMESTAMPTZ | NULL |
| created_by_user_id | UUID | FK → users |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Rules**:
- Secret key and webhook secret are AES-256 encrypted, decrypted only in memory during Stripe API calls
- Only `school_owner` role can create/update Stripe configuration
- API responses show only last 4 characters of publishable key
- All key operations are audit-logged

**Indexes (Section 3.1)**:
```sql
CREATE INDEX idx_tenant_domains_domain ON tenant_domains(domain);
CREATE INDEX idx_tenant_domains_tenant ON tenant_domains(tenant_id);
CREATE UNIQUE INDEX idx_tenant_domains_primary ON tenant_domains(tenant_id, domain_type) WHERE is_primary = true;
CREATE INDEX idx_tenant_modules_tenant ON tenant_modules(tenant_id);
```

### 3.2 Users, Identity, and RBAC

#### `users`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| email | CITEXT | UNIQUE NOT NULL |
| password_hash | TEXT | NOT NULL |
| first_name | VARCHAR(100) | NOT NULL |
| last_name | VARCHAR(100) | NOT NULL |
| phone | VARCHAR(50) | NULL |
| preferred_locale | VARCHAR(10) | NULL, CHECK IN ('en','ar') |
| global_status | ENUM('active','suspended','disabled') | NOT NULL DEFAULT 'active' |
| email_verified_at | TIMESTAMPTZ | NULL |
| mfa_enabled | BOOLEAN | NOT NULL DEFAULT false |
| last_login_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Note**: `users` is NOT tenant-scoped. It is a platform-level table. No RLS policy — guarded at application layer.

**Application-layer guard rules for `users`**:
- **No direct user queries from tenant-scoped endpoints.** Tenant-scoped API endpoints must never query `users` directly. They access user data through the tenant-scoped chain: `tenant_memberships` → `users`. The membership's `tenant_id` acts as the implicit scope.
- **Join path enforcement**: When an API response includes user-level fields (e.g., parent email, staff name), the query must always join through a tenant-scoped intermediary (`parents`, `staff_profiles`, `tenant_memberships`). Example: `SELECT u.email FROM parents p JOIN users u ON p.user_id = u.id WHERE p.tenant_id = :tenant_id AND p.id = :parent_id` — never `SELECT * FROM users WHERE id = :id`.
- **Search indexing safety**: Meilisearch indexes for tenant-scoped entities (students, parents, staff, households) must only contain data sourced through the tenant-scoped tables. User-level fields (email, name) are denormalized into the index document at indexing time via the tenant-scoped join path. The Meilisearch index **never** indexes the `users` table directly.
- **`GET /api/v1/auth/me`**: The only endpoint that queries `users` directly. Returns the authenticated user's own profile. Does not accept arbitrary user IDs.
- **Platform admin endpoints**: Platform-tier endpoints (`platform.manage_users`) may query `users` directly but are restricted to platform-tier permissions and are not tenant-scoped.

#### `mfa_recovery_codes`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK → users, NOT NULL |
| code_hash | TEXT | NOT NULL |
| used_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |

**Rules**: 10 codes generated at MFA setup. Each code is single-use. `used_at` is set on consumption.

#### `password_reset_tokens`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK → users, NOT NULL |
| token_hash | TEXT | NOT NULL |
| expires_at | TIMESTAMPTZ | NOT NULL |
| used_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |

**Rules**: Token is hashed (SHA-256) before storage — plaintext token is sent to user's email and never stored. Expires after 1 hour. Single-use: `used_at` is set on consumption. On successful password reset, all existing sessions for the user are revoked (Redis keys deleted) and all unused reset tokens for the user are invalidated (set `used_at = now()`). Maximum 3 active (unexpired, unused) tokens per user at any time — creating a 4th invalidates the oldest.

**Note**: `password_reset_tokens` is NOT tenant-scoped (same as `users` and `mfa_recovery_codes`). It is a platform-level table with no RLS policy, guarded at the application layer.

#### `tenant_memberships`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| user_id | UUID | FK → users, NOT NULL |
| membership_status | ENUM('active','suspended','disabled') | NOT NULL |
| joined_at | TIMESTAMPTZ | NULL |
| left_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, user_id)`

#### `roles`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NULL (NULL = system/platform role) |
| role_key | VARCHAR(100) | NOT NULL |
| display_name | VARCHAR(100) | NOT NULL |
| is_system_role | BOOLEAN | NOT NULL DEFAULT false |
| role_tier | ENUM('platform','admin','staff','parent') | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**System roles** (is_system_role = true, cannot be deleted/modified):
- `platform_owner` (tier: platform)
- `school_owner` (tier: admin)
- `school_admin` (tier: admin)
- `teacher` (tier: staff)
- `finance_staff` (tier: admin)
- `admissions_staff` (tier: admin)
- `parent` (tier: parent)

**Custom role rule**: `role_tier` determines the maximum permission tier that role can include. A custom role with `role_tier = 'staff'` cannot include admin-tier permissions.

**Permission assignments**: See Section 2.8.1 for the complete permission catalogue with default role mappings.

#### `permissions`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| permission_key | VARCHAR(150) | UNIQUE NOT NULL |
| description | TEXT | NOT NULL |
| permission_tier | ENUM('platform','admin','staff','parent') | NOT NULL |

#### `role_permissions`
| Column | Type | Constraints |
|--------|------|-------------|
| role_id | UUID | FK → roles |
| permission_id | UUID | FK → permissions |
| **PK** | | (role_id, permission_id) |
| tenant_id | UUID | NULL, FK → tenants |

**Nullability rule**: `tenant_id` is NULL for platform-tier role-permission mappings (where the role's `tenant_id` is also NULL). For tenant-scoped roles, `tenant_id` is NOT NULL and must match the role's `tenant_id`. A CHECK constraint enforces this: `CHECK ((tenant_id IS NULL) = (role_id IN (SELECT id FROM roles WHERE tenant_id IS NULL)))` — implemented as an application-layer validation since Postgres CHECK constraints cannot reference other tables. RLS policy on `role_permissions`: rows with `tenant_id IS NULL` are visible only to platform-tier permission loaders; tenant-scoped rows use the standard `tenant_id = current_setting('app.current_tenant_id')::uuid` policy.

#### `membership_roles`
| Column | Type | Constraints |
|--------|------|-------------|
| membership_id | UUID | FK → tenant_memberships |
| role_id | UUID | FK → roles |
| **PK** | | (membership_id, role_id) |
| tenant_id | UUID | FK → tenants, NOT NULL |

#### `invitations`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| email | CITEXT | NOT NULL |
| invited_role_payload | JSONB | NOT NULL |
| invited_by_user_id | UUID | FK → users, NOT NULL |
| token_hash | TEXT | NOT NULL |
| expires_at | TIMESTAMPTZ | NOT NULL |
| accepted_at | TIMESTAMPTZ | NULL |
| status | ENUM('pending','accepted','expired','revoked') | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**`invited_role_payload` schema**:
```typescript
{
  role_ids: string[],                 // role UUIDs to assign on acceptance
  parent_link?: {                     // if inviting as a parent
    household_id?: string,            // existing household to link to
    student_ids?: string[]            // existing students to link to
  }
}
```

**Invitation cleanup**: A nightly background job transitions `pending` invitations past `expires_at` to `expired` status. This is a safety net — the acceptance endpoint also checks expiry at acceptance time.

**Invitation flow**:
1. Admin creates invitation → system checks for existing user by email
2. If user exists → creates invitation, sends email "You've been invited to School X"
3. If no user → creates invitation, sends email with registration link
4. On acceptance → create user (if new), create tenant_membership, assign roles, link parent record if applicable

**Indexes (Section 3.2)**:
```sql
CREATE UNIQUE INDEX idx_users_email ON users(email);
CREATE INDEX idx_tenant_memberships_tenant_user ON tenant_memberships(tenant_id, user_id);
CREATE INDEX idx_tenant_memberships_user ON tenant_memberships(user_id);
CREATE INDEX idx_roles_tenant ON roles(tenant_id);
CREATE INDEX idx_invitations_tenant_email ON invitations(tenant_id, email);
CREATE INDEX idx_invitations_token ON invitations(token_hash);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_tenant ON role_permissions(tenant_id) WHERE tenant_id IS NOT NULL;
CREATE INDEX idx_membership_roles_tenant_role ON membership_roles(tenant_id, role_id);
CREATE INDEX idx_mfa_recovery_user ON mfa_recovery_codes(user_id);
CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_hash ON password_reset_tokens(token_hash);
CREATE INDEX idx_invitations_pending_expiry ON invitations(status, expires_at) WHERE status = 'pending';
```

### 3.3 Households, Parents, Students

#### `households`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| household_name | VARCHAR(255) | NOT NULL |
| primary_billing_parent_id | UUID | NULL, FK → parents |
| address_line_1 | VARCHAR(255) | NULL |
| address_line_2 | VARCHAR(255) | NULL |
| city | VARCHAR(100) | NULL |
| country | VARCHAR(100) | NULL |
| postal_code | VARCHAR(30) | NULL |
| status | ENUM('active','archived') | NOT NULL DEFAULT 'active' |
| needs_completion | BOOLEAN | NOT NULL DEFAULT false |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**`needs_completion` rule**: Set to `true` when household is created via admissions conversion. Cleared when at least 1 emergency contact exists AND `primary_billing_parent_id` is set. Surfaced on School Admin Dashboard.

#### `household_emergency_contacts`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| household_id | UUID | FK → households, NOT NULL |
| contact_name | VARCHAR(200) | NOT NULL |
| phone | VARCHAR(50) | NOT NULL |
| relationship_label | VARCHAR(100) | NOT NULL |
| display_order | SMALLINT | NOT NULL DEFAULT 1 |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Rules**:
- Maximum 3 per household (application-level validation)
- Minimum 1 required at household creation (except households created via admissions conversion — see Section 4.5.6)
- Shared across all students in the household
- `display_order` values: 1, 2, 3

#### `parents`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| user_id | UUID | NULL, FK → users |
| first_name | VARCHAR(100) | NOT NULL |
| last_name | VARCHAR(100) | NOT NULL |
| email | CITEXT | NULL |
| phone | VARCHAR(50) | NULL |
| whatsapp_phone | VARCHAR(50) | NULL |
| preferred_contact_channels | JSONB | NOT NULL |
| relationship_label | VARCHAR(100) | NULL |
| is_primary_contact | BOOLEAN | NOT NULL DEFAULT false |
| is_billing_contact | BOOLEAN | NOT NULL DEFAULT false |
| status | ENUM('active','inactive') | NOT NULL DEFAULT 'active' |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**`preferred_contact_channels` validation**:
```typescript
// Allowed values:
['email'] | ['whatsapp'] | ['email', 'whatsapp']
// If 'whatsapp' is included, whatsapp_phone is required
// unless explicitly confirmed identical to phone
```

**Parent-user linking**: `user_id` is NULL until parent completes registration. On registration, system matches by email within the tenant and links.

#### `household_parents`
| Column | Type | Constraints |
|--------|------|-------------|
| household_id | UUID | FK → households |
| parent_id | UUID | FK → parents |
| role_label | VARCHAR(100) | NULL |
| tenant_id | UUID | FK → tenants, NOT NULL |
| **PK** | | (household_id, parent_id) |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Note**: `role_label` is mutable; `updated_at` is included and receives the `set_updated_at()` trigger.

#### `students`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| household_id | UUID | FK → households, NOT NULL |
| student_number | VARCHAR(50) | NULL |
| first_name | VARCHAR(100) | NOT NULL |
| last_name | VARCHAR(100) | NOT NULL |
| full_name | VARCHAR(255) | GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED |
| first_name_ar | VARCHAR(100) | NULL |
| last_name_ar | VARCHAR(100) | NULL |
| full_name_ar | VARCHAR(255) | GENERATED ALWAYS AS (CASE WHEN first_name_ar IS NOT NULL AND last_name_ar IS NOT NULL THEN first_name_ar || ' ' || last_name_ar ELSE NULL END) STORED |
| date_of_birth | DATE | NOT NULL |
| gender | ENUM('male','female','other','prefer_not_to_say') | NULL |
| status | ENUM('applicant','active','withdrawn','graduated','archived') | NOT NULL |
| entry_date | DATE | NULL |
| exit_date | DATE | NULL |
| year_group_id | UUID | NULL, FK → year_groups |
| class_homeroom_id | UUID | NULL, FK → classes |
| medical_notes | TEXT | NULL |
| has_allergy | BOOLEAN | NOT NULL DEFAULT false |
| allergy_details | TEXT | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: If `has_allergy = true`, `allergy_details` must be non-null (application-level validation).

**Status transition rules** (enforced at API layer):
- `applicant → active` (admission conversion)
- `active → withdrawn` (requires reason, audit-logged)
- `active → graduated` (promotion wizard)
- `active → archived` (admin edge case)
- `withdrawn → active` (re-enrollment)
- `graduated → archived` (end-of-lifecycle)
- BLOCKED: `applicant → graduated`, `archived → active`

**Side-effects of withdrawal**: All active `class_enrolments` set to `dropped` with `end_date = today`. Outstanding invoices flagged for admin review. Grades and attendance records retained. Pre-populated `attendance_records` for today's open (unsubmitted) sessions are set to `absent_excused` with `reason = 'Student withdrawn'` — teachers can override before submission. Submitted/locked sessions are not modified.

#### `student_parents`
| Column | Type | Constraints |
|--------|------|-------------|
| student_id | UUID | FK → students |
| parent_id | UUID | FK → parents |
| relationship_label | VARCHAR(100) | NULL |
| tenant_id | UUID | FK → tenants, NOT NULL |
| **PK** | | (student_id, parent_id) |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Note**: `relationship_label` is mutable; `updated_at` is included and receives the `set_updated_at()` trigger.

**Indexes (Section 3.3)**:
```sql
CREATE INDEX idx_households_tenant ON households(tenant_id);
CREATE INDEX idx_households_tenant_status ON households(tenant_id, status);
CREATE INDEX idx_households_needs_completion ON households(tenant_id) WHERE needs_completion = true;
CREATE INDEX idx_emergency_contacts_household ON household_emergency_contacts(tenant_id, household_id);
CREATE INDEX idx_parents_tenant ON parents(tenant_id);
CREATE UNIQUE INDEX idx_parents_tenant_email_active ON parents(tenant_id, email) WHERE email IS NOT NULL AND status = 'active';
CREATE INDEX idx_parents_user ON parents(user_id);
CREATE INDEX idx_parents_no_email ON parents(tenant_id) WHERE email IS NULL AND status = 'active';
CREATE INDEX idx_students_tenant ON students(tenant_id);
CREATE INDEX idx_students_tenant_status ON students(tenant_id, status);
CREATE INDEX idx_students_tenant_household ON students(tenant_id, household_id);
CREATE INDEX idx_students_tenant_year_group ON students(tenant_id, year_group_id);
CREATE INDEX idx_students_allergy ON students(tenant_id) WHERE has_allergy = true;
CREATE INDEX idx_household_parents_parent ON household_parents(tenant_id, parent_id);
CREATE INDEX idx_household_parents_household ON household_parents(tenant_id, household_id);
CREATE INDEX idx_student_parents_parent ON student_parents(tenant_id, parent_id);
CREATE INDEX idx_student_parents_student ON student_parents(tenant_id, student_id);
```

### 3.4 Admissions

#### `admission_form_definitions`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| name | VARCHAR(255) | NOT NULL |
| base_form_id | UUID | NULL, FK → admission_form_definitions (self-referencing) |
| version_number | INT | NOT NULL |
| status | ENUM('draft','published','archived') | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, base_form_id, version_number)` — prevents duplicate version numbers within the same form lineage. For v1 forms (`base_form_id IS NULL`), a partial unique index applies: `UNIQUE (tenant_id, name) WHERE base_form_id IS NULL AND status != 'archived'` — prevents duplicate form names for root forms.

**Versioning rule**: Editing a published form creates a new version. The new version row has `base_form_id` pointing to the original (v1) form definition. `base_form_id` is NULL for v1 forms and points to the v1 row for all subsequent versions. Existing applications retain reference to the old version via `applications.form_definition_id`. The form builder UI groups versions by `base_form_id` (or by `id` for v1 forms).

#### `admission_form_fields`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| form_definition_id | UUID | FK → admission_form_definitions, NOT NULL |
| field_key | VARCHAR(100) | NOT NULL |
| label | VARCHAR(255) | NOT NULL |
| help_text | TEXT | NULL |
| field_type | ENUM('short_text','long_text','number','date','boolean','single_select','multi_select','phone','email','country','yes_no') | NOT NULL |
| required | BOOLEAN | NOT NULL DEFAULT false |
| visible_to_parent | BOOLEAN | NOT NULL DEFAULT true |
| visible_to_staff | BOOLEAN | NOT NULL DEFAULT true |
| searchable | BOOLEAN | NOT NULL DEFAULT false |
| reportable | BOOLEAN | NOT NULL DEFAULT false |
| options_json | JSONB | NULL |
| validation_rules_json | JSONB | NULL |
| conditional_visibility_json | JSONB | NULL |
| display_order | INT | NOT NULL |
| active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**`conditional_visibility_json` schema**:
```typescript
{
  depends_on_field_key: string,
  show_when_value: string | string[]
} | null
// Single-field equality only. No AND/OR/nested logic.
```

#### `applications`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| form_definition_id | UUID | FK → admission_form_definitions, NOT NULL |
| application_number | VARCHAR(50) | NOT NULL |
| submitted_by_parent_id | UUID | NULL, FK → parents |
| student_first_name | VARCHAR(100) | NOT NULL |
| student_last_name | VARCHAR(100) | NOT NULL |
| date_of_birth | DATE | NULL |
| status | ENUM('draft','submitted','under_review','pending_acceptance_approval','accepted','rejected','withdrawn','enrolled') | NOT NULL |
| submitted_at | TIMESTAMPTZ | NULL |
| reviewed_at | TIMESTAMPTZ | NULL |
| reviewed_by_user_id | UUID | NULL, FK → users |
| payload_json | JSONB | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, application_number)`

**`application_number` generation**: Uses sequence `tenant_sequences WHERE sequence_type = 'application'`: format `APP-{YYYY}-{padded_sequence}`.

**Status transitions** (enforced at API layer):
- `draft → submitted` (parent submits)
- `submitted → under_review` (staff begins review)
- `under_review → pending_acceptance_approval` (approval-gated acceptance)
- `under_review → accepted` (direct acceptance if approval not required)
- `pending_acceptance_approval → accepted` (approval granted)
- `accepted → enrolled` (conversion to student executed — terminal)
- `under_review → rejected` / `submitted → rejected`
- `draft → withdrawn` / `submitted → withdrawn` / `under_review → withdrawn`
- BLOCKED: `enrolled → *`, `rejected → accepted`, `withdrawn → accepted`

**Duplicate detection**: On submission, system checks for existing applications with matching `student_first_name + student_last_name + date_of_birth` in the same tenant. Matches are flagged for review but not blocked.

#### `application_notes`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| application_id | UUID | FK → applications, NOT NULL |
| author_user_id | UUID | FK → users, NOT NULL |
| note | TEXT | NOT NULL |
| is_internal | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL |

**`is_internal` usage**: Notes with `is_internal = true` (default) are visible only to staff with `admissions.review` permission. Notes with `is_internal = false` are included in the parent-facing application status view (if the parent has an account). Staff can choose visibility when creating a note. Phase 1 delivers the toggle in the notes UI. Compliance export (Section 4.18.1) excludes internal notes from parent-facing exports but includes external notes.

**Indexes (Section 3.4)**:
```sql
CREATE INDEX idx_applications_tenant_status ON applications(tenant_id, status);
CREATE UNIQUE INDEX idx_applications_number ON applications(tenant_id, application_number);
CREATE INDEX idx_applications_tenant_form ON applications(tenant_id, form_definition_id);
CREATE INDEX idx_form_definitions_tenant ON admission_form_definitions(tenant_id, status);
CREATE INDEX idx_form_definitions_base ON admission_form_definitions(base_form_id) WHERE base_form_id IS NOT NULL;
CREATE UNIQUE INDEX idx_form_definitions_version ON admission_form_definitions(tenant_id, base_form_id, version_number);
CREATE UNIQUE INDEX idx_form_definitions_name_root ON admission_form_definitions(tenant_id, name) WHERE base_form_id IS NULL AND status != 'archived';
CREATE INDEX idx_form_fields_definition ON admission_form_fields(form_definition_id);
CREATE INDEX idx_application_notes_application ON application_notes(application_id);
```

### 3.5 Academics and Scheduling

#### `academic_years`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| name | VARCHAR(100) | NOT NULL |
| start_date | DATE | NOT NULL |
| end_date | DATE | NOT NULL |
| status | ENUM('planned','active','closed') | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, name)` — prevents duplicate academic year names within a school.

**Overlap prevention**: Academic year date ranges within a tenant must not overlap. Enforced at the **database layer** via a PostgreSQL exclusion constraint using `btree_gist` extension (same pattern as `academic_periods`): `EXCLUDE USING gist (tenant_id WITH =, daterange(start_date, end_date, '[]') WITH &&)`. The API layer also checks on create/update and returns `CONFLICT` error with message "Academic year dates overlap with existing year." This prevents ambiguity in fee generation period detection, transcript grouping, and promotion logic. The DB-level constraint prevents TOCTOU race conditions from concurrent requests.

#### `academic_periods`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| academic_year_id | UUID | FK → academic_years, NOT NULL |
| name | VARCHAR(100) | NOT NULL |
| period_type | ENUM('term','semester','quarter','custom') | NOT NULL |
| start_date | DATE | NOT NULL |
| end_date | DATE | NOT NULL |
| status | ENUM('planned','active','closed') | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: No overlapping periods within the same academic year. Enforced via a PostgreSQL exclusion constraint using `btree_gist` extension: `EXCLUDE USING gist (tenant_id WITH =, academic_year_id WITH =, daterange(start_date, end_date, '[]') WITH &&)`. The `btree_gist` extension is created in the first `post_migrate.sql` (see Section 2.5b).

**Constraint**: `UNIQUE (tenant_id, academic_year_id, name)` — prevents duplicate period names within the same academic year.

#### `year_groups`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| name | VARCHAR(100) | NOT NULL |
| display_order | SMALLINT | NOT NULL DEFAULT 0 |
| next_year_group_id | UUID | NULL, FK → year_groups (self-referencing) |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

#### `subjects`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| name | VARCHAR(150) | NOT NULL |
| code | VARCHAR(50) | NULL |
| subject_type | ENUM('academic','supervision','duty','other') | NOT NULL DEFAULT 'academic' |
| active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, name)` — prevents duplicate subject names within a school.

**`subject_type` semantics**:
- `academic` — regular teaching subject (Maths, English, Science, etc.). Appears in gradebook, report cards, and transcripts.
- `supervision` — break/recess supervision, yard duty. Created by admin during scheduling setup. Does **not** appear in gradebook or assessment contexts.
- `duty` — lunch duty, gate duty, bus duty. Same gradebook exclusion as `supervision`.
- `other` — any other non-teaching schedulable activity.

**Gradebook/assessment filtering contract**: All queries in the gradebook module (assessment creation, grade entry, period grade computation, report card generation, transcript aggregation) must filter to `subject_type = 'academic'` when resolving subjects through `classes.subject_id`. Supervision and duty subjects are excluded from academic reporting but included in workload reports and scheduling views. The `class_subject_grade_configs` table only accepts classes whose subject has `subject_type = 'academic'` — application-layer validation on create.

#### `staff_profiles`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| user_id | UUID | FK → users, NOT NULL |
| staff_number | VARCHAR(50) | NULL |
| job_title | VARCHAR(150) | NULL |
| employment_status | ENUM('active','inactive') | NOT NULL |
| department | VARCHAR(150) | NULL |
| employment_type | ENUM('full_time','part_time','contract') | NOT NULL DEFAULT 'full_time' |
| bank_name | VARCHAR(150) | NULL |
| bank_account_number_encrypted | TEXT | NULL |
| bank_iban_encrypted | TEXT | NULL |
| bank_encryption_key_ref | VARCHAR(255) | NULL (AWS Secrets Manager ARN) |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, user_id)` — one staff profile per user per tenant. Prevents duplicate profiles that would cause ambiguity in payroll, attendance auto-population, and timetable views.

**Bank detail rules**:
- Bank details are AES-256 encrypted, same pattern as `tenant_stripe_configs`
- Only users with `payroll.view_bank_details` permission can decrypt and view
- API responses show only last 4 characters of account number/IBAN
- All bank detail access is audit-logged

#### `classes`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| academic_year_id | UUID | FK → academic_years, NOT NULL |
| year_group_id | UUID | NULL, FK → year_groups |
| subject_id | UUID | NULL, FK → subjects |
| homeroom_teacher_staff_id | UUID | NULL, FK → staff_profiles |
| name | VARCHAR(150) | NOT NULL |
| status | ENUM('active','inactive','archived') | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, name, academic_year_id)` — prevents duplicate class names within the same academic year. Classes in different years can reuse names.

**Side-effect of setting status to `inactive`**: All future schedule entries (effective_end_date NULL or > today) are end-dated to today.

#### `class_staff`
| Column | Type | Constraints |
|--------|------|-------------|
| class_id | UUID | FK → classes |
| staff_profile_id | UUID | FK → staff_profiles |
| assignment_role | ENUM('teacher','assistant','homeroom','substitute') | NOT NULL |
| tenant_id | UUID | FK → tenants, NOT NULL |
| **PK** | | (class_id, staff_profile_id, assignment_role) |

**Multi-role assignment rule**: The composite PK allows the same staff member to hold multiple roles on the same class (e.g., both `teacher` and `homeroom`). This is intentional for homeroom assignment. However, the combination `teacher` + `assistant` for the same person on the same class is blocked at the application layer (nonsensical). **Payroll auto-population impact**: When counting classes taught for a staff member, the query counts distinct `(class_id, session_date)` pairs from `attendance_sessions` — not distinct `class_staff` rows. A staff member assigned as both `teacher` and `homeroom` on the same class is counted once per session, not twice.

#### `class_enrolments`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| class_id | UUID | FK → classes, NOT NULL |
| student_id | UUID | FK → students, NOT NULL |
| status | ENUM('active','dropped','completed') | NOT NULL |
| start_date | DATE | NOT NULL |
| end_date | DATE | NULL |

| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Status transitions**:
- `active → dropped` (student withdrawn, manual removal, or class deactivated; sets `end_date = today`)
- `active → completed` (end-of-year rollover when academic year closes; sets `end_date = academic_year.end_date`)
- `dropped → active` (re-enrolment; clears `end_date`, subject to active UNIQUE index)
- BLOCKED: `completed → active` (historical record; re-enrol in new year's class instead)

#### `rooms`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| name | VARCHAR(100) | NOT NULL |
| room_type | ENUM('classroom','lab','gym','auditorium','library','computer_lab','art_room','music_room','outdoor','other') | NOT NULL DEFAULT 'classroom' |
| capacity | INT | NULL |
| is_exclusive | BOOLEAN | NOT NULL DEFAULT true |  <!-- Seed: all rooms default exclusive; admin toggles for shared-use rooms -->
| active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**`room_type` vs `is_exclusive` interaction**: `room_type` classifies the room for auto-scheduling room-type matching (e.g., a science class requiring `room_type = 'lab'`). `is_exclusive` controls whether concurrent bookings are allowed. These are **orthogonal** — a `lab` can be exclusive (default) or non-exclusive (large shared lab), a `gym` can be non-exclusive (multiple PE classes) or exclusive (single-use). The auto-scheduler uses `is_exclusive` as the sole arbiter for double-booking constraints, consistent with the manual conflict detection engine. `room_type` is used only for matching classes to compatible rooms.

#### `schedules`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| academic_year_id | UUID | FK → academic_years, NOT NULL |
| class_id | UUID | FK → classes, NOT NULL |
| room_id | UUID | NULL, FK → rooms |
| teacher_staff_id | UUID | NULL, FK → staff_profiles |
| schedule_period_template_id | UUID | NULL, FK → schedule_period_templates |
| weekday | SMALLINT | NOT NULL, CHECK (0-6, 0=Monday) |
| period_order | SMALLINT | NULL |
| start_time | TIME | NOT NULL |
| end_time | TIME | NOT NULL, CHECK (end_time > start_time) |
| effective_start_date | DATE | NOT NULL |
| effective_end_date | DATE | NULL (NULL = open-ended, no planned end date; the schedule entry repeats indefinitely until explicitly end-dated or deleted) |
| is_pinned | BOOLEAN | NOT NULL DEFAULT false |
| pin_reason | TEXT | NULL |
| source | ENUM('manual','auto_generated','pinned') | NOT NULL DEFAULT 'manual' |
| scheduling_run_id | UUID | NULL, FK → scheduling_runs |
| override_reason | TEXT | NULL |
| created_by_user_id | UUID | FK → users, NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**New columns for auto-scheduling**:
- **`academic_year_id`**: Direct FK to the academic year, enabling efficient scoping of apply/delete operations without joining through `classes`. Must match `classes.academic_year_id` — application-layer validation on insert.
- **`schedule_period_template_id`**: Links to the period grid slot this entry occupies. NULL for manually created entries (which use raw `start_time`/`end_time`). Non-NULL for auto-generated entries. When non-NULL, `start_time`/`end_time`/`weekday`/`period_order` are copied from the template at insertion time for query compatibility.
- **`period_order`**: The period's ordinal position within the day (from `schedule_period_templates.period_order`). NULL for manually created entries. Non-NULL for auto-generated entries. Used for max-consecutive-periods validation and timetable grid display.
- **`is_pinned`**: When `true`, this entry was explicitly placed by the admin and is immovable by the auto-scheduler. When `false`, this entry is either manually created (legacy) or auto-generated.
- **`pin_reason`**: Optional text explaining why the entry was pinned.
- **`source`**: Distinguishes how the entry was created. `manual` = admin created via manual CRUD. `auto_generated` = created by applying a scheduling run. `pinned` = admin explicitly pinned for hybrid mode.
- **`scheduling_run_id`**: Links auto-generated entries to the scheduling run that created them. NULL for manual/pinned entries. Enables audit trail and rollback identification.
- **`created_by_user_id` for auto-generated entries**: Set to the user who clicked "Apply" (the `applied_by_user_id` from the scheduling run). The BullMQ job payload carries this user ID.

**Auto-scheduling apply/delete semantics**: The apply operation (Section 4.8b.5) does **not** hard-delete schedule entries that have generated attendance sessions. Instead: (1) entries with `source = 'auto_generated'` that have **no** referencing `attendance_sessions` rows are hard-deleted. (2) entries with `source = 'auto_generated'` that **do** have referencing `attendance_sessions` rows are **end-dated** (`effective_end_date = today`), preserving the attendance FK chain. (3) New auto-generated entries are inserted with `effective_start_date = today` (or the next applicable weekday) and `effective_end_date = NULL`. This reconciles the auto-scheduling apply flow with the existing deletion safety rule.

**Conflict detection** (on insert/update):
- **Hard conflicts** (block unless override permission + reason):
  - Room double-booking: same `room_id` + overlapping weekday/time/date range **AND `rooms.is_exclusive = true`**. When `rooms.is_exclusive = false` (shared-use rooms like gyms, auditoriums, labs), room double-booking is a **soft conflict** (warn only, not blocking).
  - Teacher double-booking: same `teacher_staff_id` + overlapping weekday/time/date range
  - Student double-booking: student enrolled in two classes with overlapping schedules
- **Soft conflicts** (warn only):
  - Room double-booking where `rooms.is_exclusive = false`
  - Room over capacity
  - Teacher exceeding workload threshold: triggered when `tenant_settings.scheduling.teacherWeeklyMaxPeriods` is non-null and the teacher's total active schedule entries for the week exceeds the threshold. Count is: distinct schedule entries where `effective_start_date <= week_end_date` AND (`effective_end_date IS NULL OR effective_end_date >= week_start_date`), summed across all weekdays. When threshold is null (default), no workload warning is generated.

**Overlap query logic**: Two schedules overlap when `weekday` matches AND `start_time < other.end_time AND end_time > other.start_time` AND `(other.effective_end_date IS NULL OR effective_start_date <= other.effective_end_date) AND (effective_end_date IS NULL OR effective_end_date >= other.effective_start_date)`. The NULL handling is critical: when either schedule has `effective_end_date = NULL` (open-ended / indefinite), the date-range overlap check must treat NULL as "unbounded" — `start_date <= NULL` evaluates to NULL in SQL and would silently miss conflicts. The corrected form ensures two indefinite schedules on the same weekday/time always detect as overlapping.

#### `schedule_period_templates`

Defines the school's time grid — the set of named periods per weekday that classes can be placed into. Schools often have different structures on different days (e.g., Friday is shorter in Gulf schools, Wednesday has early dismissal).

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| academic_year_id | UUID | FK → academic_years, NOT NULL |
| weekday | SMALLINT | NOT NULL, CHECK (0-6, 0=Monday) |
| period_name | VARCHAR(50) | NOT NULL |
| period_name_ar | VARCHAR(50) | NULL |
| period_order | SMALLINT | NOT NULL |
| start_time | TIME | NOT NULL |
| end_time | TIME | NOT NULL, CHECK (end_time > start_time) |
| schedule_period_type | ENUM('teaching','break_supervision','assembly','lunch_duty','free') | NOT NULL DEFAULT 'teaching' |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, academic_year_id, weekday, period_order)` — one period per order slot per day.
**Constraint**: `UNIQUE (tenant_id, academic_year_id, weekday, start_time)` — no overlapping start times on same day.
**Constraint**: Time-range non-overlap enforced via PostgreSQL exclusion constraint using `btree_gist`: `EXCLUDE USING gist (tenant_id WITH =, academic_year_id WITH =, weekday WITH =, timerange(start_time, end_time, '[]') WITH &&)`. This prevents partially overlapping periods (e.g., 08:00–09:00 and 08:30–09:30) at the database level, consistent with the `academic_years`/`academic_periods` overlap prevention pattern.

**ENUM name**: The column is named `schedule_period_type` (not `period_type`) to avoid collision with the `period_type` ENUM on `academic_periods` (which has values `term`, `semester`, `quarter`, `custom`). PostgreSQL ENUMs are named types — this ensures distinct type names in the migration.

**Bilingual period names**: `period_name` stores the English name (or default locale name). `period_name_ar` stores the Arabic translation. The timetable UI resolves `period_name_ar` when the user's locale is `ar`, falling back to `period_name`. This follows the same pattern as `tenant_branding.school_name_display` / `school_name_ar`.

**`schedule_period_type` semantics**:
- `teaching` — a regular class period. The auto-scheduler assigns classes to these slots.
- `break_supervision` — break/recess period where teachers are assigned supervision duty. The scheduler assigns staff to these the same way it assigns classes. The "subject" is a supervision-type subject (see `subjects.subject_type`). Counts toward teacher workload.
- `assembly` — whole-school or year-group assembly. Not assigned by the scheduler. Blocks the slot for all teachers and students in scope.
- `lunch_duty` — lunch supervision. Same mechanics as `break_supervision` but distinguished for reporting.
- `free` — defined in the grid to represent the time slot but not schedulable. Used to model periods that exist on other days but not this day (e.g., Period 7 exists Mon–Thu but not Friday).

#### `class_scheduling_requirements`

Defines how many periods per week each class needs and scheduling preferences for the auto-scheduler.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| class_id | UUID | FK → classes, NOT NULL |
| academic_year_id | UUID | FK → academic_years, NOT NULL |
| periods_per_week | SMALLINT | NOT NULL, CHECK (periods_per_week >= 1) |
| required_room_type | ENUM (same as rooms.room_type) | NULL (NULL = any classroom) |
| preferred_room_id | UUID | NULL, FK → rooms |
| max_consecutive_periods | SMALLINT | NOT NULL DEFAULT 2 |
| min_consecutive_periods | SMALLINT | NOT NULL DEFAULT 1 |
| spread_preference | ENUM('spread_evenly','cluster','no_preference') | NOT NULL DEFAULT 'spread_evenly' |
| student_count | INT | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, class_id, academic_year_id)` — one requirement per class per year.

**`spread_evenly`**: The solver distributes the class's periods across as many distinct weekdays as possible (5 periods → 1 per day, 3 periods → Mon/Wed/Thu). Default for most schools.

**`cluster`**: The solver groups periods on fewer days (e.g., 4 periods on 2 days = 2 per day). Useful for subjects that benefit from longer blocks.

**`max_consecutive_periods`**: Hard cap on back-to-back periods of this class on the same day. Default 2 means "double period max." Set to 1 to prevent doubles. **Consecutive definition**: Two periods are consecutive if their `period_order` values differ by exactly 1 AND no `teaching`-type period exists between them in the grid. Breaks (`break_supervision`, `assembly`, `lunch_duty`, `free`) do **not** break consecutiveness — if a class has Period 3 and Period 5 with only a `break_supervision` at Period 4 between them, those count as consecutive teaching slots for this class.

**`min_consecutive_periods`**: Minimum block size when scheduling this class. Default 1 (single periods). Set to 2 to require double periods (e.g., science labs, art). When `min_consecutive_periods = 2` and `periods_per_week = 4`, the solver must place exactly 2 double-period blocks across the week. If `periods_per_week` is not evenly divisible by `min_consecutive_periods`, the remainder is placed as singles (e.g., `periods_per_week = 5`, `min_consecutive = 2` → 2 doubles + 1 single). Application-layer validation: `min_consecutive_periods <= max_consecutive_periods`.

**`student_count`**: Cached/denormalised count of active enrolments for this class. Used by the solver for non-exclusive room capacity checks. Updated when enrolments change. NULL means the solver skips capacity validation for this class.

#### `staff_availability`

Defines when a teacher is available to be scheduled. Any period outside these windows is blocked for this teacher. This is a **hard constraint** — the solver cannot schedule a teacher outside their availability.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| staff_profile_id | UUID | FK → staff_profiles, NOT NULL |
| academic_year_id | UUID | FK → academic_years, NOT NULL |
| weekday | SMALLINT | NOT NULL, CHECK (0-6) |
| available_from | TIME | NOT NULL |
| available_to | TIME | NOT NULL, CHECK (available_to > available_from) |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, staff_profile_id, academic_year_id, weekday)` — one availability window per teacher per day per year. If a teacher is not available at all on a given day, no row exists for that weekday.

**Default behaviour**: If no `staff_availability` rows exist for a teacher for a given academic year, the teacher is assumed available for all periods on all weekdays. Once any row is created, only the defined windows apply — unspecified weekdays are treated as unavailable. This is explicit-opt-in: creating availability for Monday implicitly means "not available on days without rows."

**Availability "covers" semantics**: A teacher is available for a period if and only if `available_from <= period.start_time AND available_to >= period.end_time` (strict containment). A period that bleeds past the availability window (e.g., teacher available 8:00–12:00, period 11:30–12:30) is **not** covered. This is the safe default — partial-period availability would create situations where the teacher must leave mid-class.

**Multiple windows per day**: V1 supports one window per teacher per day. A teacher available 8:00–12:00 and 14:00–16:00 (with a personal gap) is modeled as available 8:00–16:00 with the lunch period falling outside `teaching` slots (handled by period type matching). If the gap falls during a teaching period, the limitation must be documented to the admin: "Teacher X cannot have a mid-day availability gap in v1. Set availability to the widest window and use preferences to avoid the gap periods."

#### `staff_scheduling_preferences`

Captures what a teacher prefers but does not require. The solver tries to honour these but makes no guarantees. These are **soft constraints**.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| staff_profile_id | UUID | FK → staff_profiles, NOT NULL |
| academic_year_id | UUID | FK → academic_years, NOT NULL |
| preference_type | ENUM('subject','class','time_slot') | NOT NULL |
| preference_payload | JSONB | NOT NULL |
| priority | ENUM('low','medium','high') | NOT NULL DEFAULT 'medium' |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, staff_profile_id, academic_year_id, preference_type, md5(preference_payload::text))` — prevents exact duplicate preferences for the same teacher, year, type, and payload. Uses MD5 hash of the JSONB payload because PostgreSQL cannot directly UNIQUE on JSONB columns. This prevents double-click/concurrent-request duplicates while allowing multiple distinct preferences of the same type.

**`preference_payload` schemas by type** (validated by Zod):

```typescript
// subject — teacher prefers to teach certain subjects
{
  type: 'subject',
  subject_ids: string[],         // UUIDs of preferred subjects
  mode: 'prefer' | 'avoid'      // prefer = assign these if possible; avoid = minimise these
}

// class — teacher prefers certain classes (e.g., "I like teaching Class 7A")
{
  type: 'class',
  class_ids: string[],           // UUIDs of preferred classes
  mode: 'prefer' | 'avoid'
}

// time_slot — teacher prefers certain times of day
{
  type: 'time_slot',
  weekday: number | null,        // null = applies to all days
  preferred_period_orders: number[],  // period_order values from schedule_period_templates
  mode: 'prefer' | 'avoid'      // prefer = schedule me here; avoid = don't schedule me here
}
```

**`priority` weighting**: `high` preferences carry 3× the weight of `low` in the solver's fitness function. This doesn't guarantee satisfaction — a high-priority preference still yields to hard constraints — but when two valid placements exist, the one satisfying more high-priority preferences wins.

**Conflicting preference validation**: The API validation layer catches logical contradictions: prefer subject X AND avoid subject X simultaneously. Application-layer check on create/update.

#### `scheduling_runs`

Records each solver execution for audit, comparison, and rollback.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| academic_year_id | UUID | FK → academic_years, NOT NULL |
| mode | ENUM('auto','hybrid') | NOT NULL |
| status | ENUM('queued','running','completed','failed','applied','discarded') | NOT NULL |
| config_snapshot | JSONB | NOT NULL |
| result_json | JSONB | NULL |
| proposed_adjustments | JSONB | NULL |
| hard_constraint_violations | INT | NOT NULL DEFAULT 0 |
| soft_preference_score | NUMERIC(8,2) | NULL |
| soft_preference_max | NUMERIC(8,2) | NULL |
| entries_generated | INT | NOT NULL DEFAULT 0 |
| entries_pinned | INT | NOT NULL DEFAULT 0 |
| entries_unassigned | INT | NOT NULL DEFAULT 0 |
| solver_duration_ms | INT | NULL |
| solver_seed | BIGINT | NULL |
| failure_reason | TEXT | NULL |
| created_by_user_id | UUID | FK → users, NOT NULL |
| applied_by_user_id | UUID | NULL, FK → users |
| applied_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE partial index on (tenant_id, academic_year_id) WHERE status IN ('queued', 'running')` — database-enforced one-active-run-per-tenant-per-year. This prevents TOCTOU races where two concurrent enqueue requests both pass an application-layer check.

**Optimistic concurrency**: This table is subject to concurrent access (worker updating status while admin applies/discards). The `updated_at` column is used for optimistic concurrency control per the master plan's standard pattern (Section 2.14). All status transitions must include a `WHERE updated_at = :expected_updated_at` clause.

**`config_snapshot`**: Captures all solver inputs at run time for reproducibility.

```typescript
{
  period_grid: Array<{weekday, period_order, start_time, end_time, schedule_period_type}>,
  classes: Array<{
    class_id, periods_per_week, required_room_type, preferred_room_id,
    max_consecutive, min_consecutive, spread_preference, student_count,
    teachers: Array<{staff_profile_id, assignment_role}>  // ALL teachers from class_staff, not just one
  }>,
  teachers: Array<{staff_profile_id, availability: Array<{weekday, from, to}>, preferences: Array<{...}>}>,
  rooms: Array<{room_id, room_type, capacity, is_exclusive}>,
  pinned_entries: Array<{schedule_id, class_id, room_id, teacher_staff_id, weekday, period_order}>,
  student_overlaps: Array<{class_id_a, class_id_b}>,  // pairs of classes with shared students
  settings: {
    max_solver_duration_seconds: number,
    preference_weights: { low: number, medium: number, high: number },
    solver_seed: number
  }
}
```

**Multi-teacher handling**: `config_snapshot.classes[].teachers` is an array of all `class_staff` rows with `assignment_role IN ('teacher', 'homeroom')` for the class. The solver uses the **primary teacher** (first teacher with `assignment_role = 'teacher'`) for double-booking constraint checks. All listed teachers' availability windows are validated — a placement is only valid if all assigned teachers are available for the slot. If a class has co-teachers, both must be free.

**Student overlap data**: `config_snapshot.student_overlaps` pre-computes pairs of classes that share at least one active student enrolment. The BullMQ job wrapper queries this from `class_enrolments` before invoking the solver. The solver uses this for the student-group no-double-book hard constraint. This is computed at query time, not stored — it does not require a `year_group_id` match, catching cross-year elective conflicts.

**`result_json`**: The complete proposed timetable. Only populated when `status = 'completed'`.

```typescript
{
  entries: Array<{
    class_id: string,
    room_id: string | null,
    teacher_staff_id: string | null,
    weekday: number,
    period_order: number,
    start_time: string,
    end_time: string,
    is_pinned: boolean,
    preference_satisfaction: Array<{
      preference_id: string,
      satisfied: boolean,
      weight: number
    }>
  }>,
  unassigned: Array<{
    class_id: string,
    periods_remaining: number,
    reason: string   // e.g., "No available room of type 'lab' on Thursday period 3"
  }>
}
```

**`proposed_adjustments`**: Stores manual adjustments made by the admin during the review/adjust phase (Section 4.8b.4). This is a JSON diff layer on top of `result_json`. Adjustments are **server-persisted incrementally** via PATCH requests — each drag-and-drop, swap, add, or remove operation is saved immediately to this JSONB field. This ensures crash recovery: if the admin's browser tab crashes, they can return to the review screen and all prior adjustments are preserved. The final applied timetable is `result_json` + `proposed_adjustments` merged.

**`solver_seed`**: Stored for deterministic reproducibility. Same seed + same `config_snapshot` = same output.

**Status transitions**:
- `queued → running` (BullMQ worker picks up job)
- `running → completed` (solver finishes successfully)
- `running → failed` (solver errors or times out)
- `completed → applied` (admin applies the result)
- `completed → discarded` (admin discards the result)
- BLOCKED: `applied → *` (applied runs are historical records — no undo; to fix, re-run)
- BLOCKED: `failed → *` (failed runs are dead)

**Stale run reaper**: A nightly background job transitions any run in `running` status for longer than `maxSolverDurationSeconds × 2` to `failed` with `failure_reason = 'Worker process terminated — run reaped as stale'`. This prevents worker crashes from permanently blocking new runs.

**`entries_unassigned` semantics**: Count of class-period slots the solver could not place. A completed run with `entries_unassigned > 0` is still valid — the admin is shown exactly what couldn't be placed and why. If all slots are pinned and no variables remain, the solver returns immediately with `entries_generated = 0` and a specific message: "All available slots are occupied by pinned entries."

**JSONB size note**: For large schools (100+ classes, 60+ teachers), `config_snapshot` and `result_json` can reach 500KB–1MB per run. These columns are TOAST-compressed by PostgreSQL. The run history list query (Section 4.8b.9) must SELECT only summary columns and **exclude** `config_snapshot` and `result_json` from the listing. Full JSONB is loaded only when viewing a specific run's details. A retention policy is recommended: runs older than 2 academic years with `status IN ('discarded', 'failed')` can be purged by a background job.

**Indexes (Section 3.5)**:
```sql
CREATE INDEX idx_academic_years_tenant ON academic_years(tenant_id);
CREATE UNIQUE INDEX idx_academic_years_tenant_name ON academic_years(tenant_id, name);
CREATE INDEX idx_academic_periods_tenant_year ON academic_periods(tenant_id, academic_year_id);
CREATE UNIQUE INDEX idx_academic_periods_tenant_year_name ON academic_periods(tenant_id, academic_year_id, name);
CREATE INDEX idx_year_groups_tenant ON year_groups(tenant_id);
CREATE UNIQUE INDEX idx_year_groups_tenant_name ON year_groups(tenant_id, name);
CREATE INDEX idx_subjects_tenant ON subjects(tenant_id);
CREATE UNIQUE INDEX idx_subjects_tenant_name ON subjects(tenant_id, name);
CREATE INDEX idx_rooms_tenant ON rooms(tenant_id);
CREATE INDEX idx_rooms_tenant_active ON rooms(tenant_id) WHERE active = true;
CREATE UNIQUE INDEX idx_rooms_tenant_name ON rooms(tenant_id, name);
CREATE INDEX idx_assessment_categories_tenant ON assessment_categories(tenant_id);
CREATE INDEX idx_discounts_tenant ON discounts(tenant_id);
CREATE INDEX idx_staff_profiles_tenant ON staff_profiles(tenant_id);
CREATE INDEX idx_staff_profiles_user ON staff_profiles(user_id);
CREATE INDEX idx_classes_tenant_year ON classes(tenant_id, academic_year_id);
CREATE INDEX idx_classes_tenant_status ON classes(tenant_id, status);
CREATE UNIQUE INDEX idx_classes_tenant_name_year ON classes(tenant_id, name, academic_year_id);
CREATE INDEX idx_class_staff_tenant_class ON class_staff(tenant_id, class_id);
CREATE INDEX idx_class_staff_tenant_staff ON class_staff(tenant_id, staff_profile_id);
CREATE INDEX idx_class_enrolments_tenant_class ON class_enrolments(tenant_id, class_id, status);
CREATE INDEX idx_class_enrolments_tenant_student ON class_enrolments(tenant_id, student_id, status);
CREATE UNIQUE INDEX idx_class_enrolments_active ON class_enrolments(tenant_id, class_id, student_id) WHERE status = 'active';
CREATE INDEX idx_schedules_tenant_class ON schedules(tenant_id, class_id, weekday);
CREATE INDEX idx_schedules_tenant_room ON schedules(tenant_id, room_id, weekday);
CREATE INDEX idx_schedules_tenant_teacher ON schedules(tenant_id, teacher_staff_id, weekday);
CREATE INDEX idx_schedules_tenant_weekday ON schedules(tenant_id, weekday, effective_start_date, effective_end_date);
CREATE INDEX idx_schedules_tenant_year ON schedules(tenant_id, academic_year_id);
CREATE INDEX idx_schedules_pinned ON schedules(tenant_id, academic_year_id, is_pinned) WHERE is_pinned = true;
CREATE INDEX idx_schedules_auto_generated ON schedules(tenant_id, academic_year_id, source) WHERE source = 'auto_generated';
CREATE INDEX idx_schedules_run ON schedules(scheduling_run_id) WHERE scheduling_run_id IS NOT NULL;

-- Period grid
CREATE INDEX idx_schedule_period_templates_tenant_year ON schedule_period_templates(tenant_id, academic_year_id);
CREATE UNIQUE INDEX idx_schedule_period_templates_order ON schedule_period_templates(tenant_id, academic_year_id, weekday, period_order);
CREATE UNIQUE INDEX idx_schedule_period_templates_time ON schedule_period_templates(tenant_id, academic_year_id, weekday, start_time);

-- Class scheduling requirements
CREATE UNIQUE INDEX idx_class_sched_req_unique ON class_scheduling_requirements(tenant_id, class_id, academic_year_id);
CREATE INDEX idx_class_sched_req_tenant_year ON class_scheduling_requirements(tenant_id, academic_year_id);

-- Staff availability
CREATE UNIQUE INDEX idx_staff_availability_unique ON staff_availability(tenant_id, staff_profile_id, academic_year_id, weekday);
CREATE INDEX idx_staff_availability_tenant_year ON staff_availability(tenant_id, academic_year_id);

-- Staff preferences
CREATE INDEX idx_staff_sched_prefs_tenant_staff ON staff_scheduling_preferences(tenant_id, staff_profile_id, academic_year_id);
CREATE INDEX idx_staff_sched_prefs_tenant_year ON staff_scheduling_preferences(tenant_id, academic_year_id);

-- Scheduling runs
CREATE INDEX idx_scheduling_runs_tenant_year ON scheduling_runs(tenant_id, academic_year_id, status);
CREATE UNIQUE INDEX idx_scheduling_runs_active ON scheduling_runs(tenant_id, academic_year_id) WHERE status IN ('queued', 'running');
```

### 3.6 Attendance

#### `school_closures`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| closure_date | DATE | NOT NULL |
| reason | VARCHAR(255) | NOT NULL |
| affects_scope | ENUM('all','year_group','class') | NOT NULL DEFAULT 'all' |
| scope_entity_id | UUID | NULL |
| created_by_user_id | UUID | FK → users, NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, closure_date, affects_scope, COALESCE(scope_entity_id, '00000000-0000-0000-0000-000000000000'))` — prevents duplicate closures for the same scope on the same day.

**Scope rules**:
- `all` → `scope_entity_id` is NULL. Entire school is closed. Suppresses all sessions.
- `year_group` → `scope_entity_id` is FK → year_groups. Suppresses sessions for classes linked to that year group.
- `class` → `scope_entity_id` is FK → classes. Suppresses sessions for that specific class only.

**Referential integrity for `scope_entity_id`** (application-layer, since polymorphic FKs cannot be expressed as DB constraints): On closure creation, the API validates that `scope_entity_id` exists in the referenced table (`year_groups` or `classes`) within the tenant. On year group or class deletion, the system checks for any closures referencing the entity. If future closures exist, deletion is blocked with a clear error. If only past closures exist, they are retained (historical record) but flagged as orphaned in metadata.

#### `attendance_sessions`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| class_id | UUID | FK → classes, NOT NULL |
| schedule_id | UUID | NULL, FK → schedules |
| session_date | DATE | NOT NULL |
| status | ENUM('open','submitted','locked','cancelled') | NOT NULL |
| override_reason | TEXT | NULL |
| submitted_by_user_id | UUID | NULL, FK → users |
| submitted_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**`cancelled` semantics**: The session was generated but the class did not take place. Cancelled sessions are excluded from daily summary derivation, pending-attendance exception reports, report card attendance snapshots, and payroll class count auto-population.

**Constraint**: `UNIQUE (tenant_id, class_id, session_date, schedule_id)` — prevents duplicate session generation from concurrent on-demand creation and nightly batch. The `schedule_id` is included because a class may have multiple schedule entries on the same day (e.g., morning and afternoon sessions). For ad-hoc sessions created via closure override (where `schedule_id` is NULL), a partial unique index applies: `UNIQUE (tenant_id, class_id, session_date) WHERE schedule_id IS NULL`.

**Race condition prevention**: Session creation uses `INSERT ... ON CONFLICT DO NOTHING RETURNING *`. If the insert is a no-op (session already exists), the existing session is fetched and returned. This makes both the on-demand and nightly batch paths idempotent without advisory locks.

**Cross-type duplicate prevention**: Before inserting a new session, the application layer checks for any existing session on the same `(tenant_id, class_id, session_date)` regardless of `schedule_id`. This prevents both a scheduled session and an ad-hoc session from coexisting on the same date for the same class. The check is: `SELECT id FROM attendance_sessions WHERE tenant_id = :tid AND class_id = :cid AND session_date = :date LIMIT 1`. If a row exists, the insert is skipped and the existing session is returned. This guard runs inside the same interactive transaction as the insert to prevent TOCTOU races.

**`override_reason`**: Non-null only when a session is created on a closure date via admin override (requires `attendance.override_closure` permission). Documents why the class was held despite the closure.

#### `attendance_records`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| attendance_session_id | UUID | FK → attendance_sessions, NOT NULL |
| student_id | UUID | FK → students, NOT NULL |
| status | ENUM('present','absent_unexcused','absent_excused','late','left_early') | NOT NULL |
| reason | TEXT | NULL |
| marked_by_user_id | UUID | FK → users, NOT NULL |
| marked_at | TIMESTAMPTZ | NOT NULL |
| amended_from_status | VARCHAR(50) | NULL |
| amendment_reason | TEXT | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Amendment rule**: When `amended_from_status` is non-null, this is a historical amendment. `amendment_reason` is mandatory in that case. Only users with `attendance.amend_historical` permission can amend.

#### `daily_attendance_summaries`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| student_id | UUID | FK → students, NOT NULL |
| summary_date | DATE | NOT NULL |
| derived_status | ENUM('present','partially_absent','absent','late','excused') | NOT NULL |
| derived_payload | JSONB | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, student_id, summary_date)`

**`derived_payload` schema**:
```typescript
{
  sessions_total: number,
  sessions_present: number,
  sessions_absent: number,
  sessions_late: number,
  sessions_left_early: number,
  sessions_excused: number,
  session_details: Array<{
    session_id: string,
    class_id: string,
    status: string
  }>
}
```

**Derivation trigger**: Runs after any attendance submission or amendment for the affected student + date. Only counts sessions where the student was enrolled at the time.

**Derivation priority rules** (applied in order, first match wins):
1. If any session has `absent_unexcused` → `derived_status = 'absent'`
2. If all sessions are `absent_excused` → `derived_status = 'excused'`
3. If any session is `absent_excused` and others are present/late → `derived_status = 'partially_absent'`
4. If any session is `late` or `left_early` but none absent → `derived_status = 'late'`
5. If all sessions are `present` → `derived_status = 'present'`
6. Mixed scenarios not covered above → `derived_status = 'partially_absent'`

This priority ensures the most operationally significant status surfaces in dashboards and parent views.

**Indexes (Section 3.6)**:
```sql
CREATE INDEX idx_school_closures_tenant_date ON school_closures(tenant_id, closure_date);
CREATE UNIQUE INDEX idx_school_closures_unique ON school_closures(tenant_id, closure_date, affects_scope, COALESCE(scope_entity_id, '00000000-0000-0000-0000-000000000000'));
CREATE UNIQUE INDEX idx_attendance_sessions_unique ON attendance_sessions(tenant_id, class_id, session_date, schedule_id);
CREATE UNIQUE INDEX idx_attendance_sessions_adhoc_unique ON attendance_sessions(tenant_id, class_id, session_date) WHERE schedule_id IS NULL;
CREATE INDEX idx_attendance_sessions_tenant_date ON attendance_sessions(tenant_id, session_date);
CREATE INDEX idx_attendance_sessions_tenant_date_status ON attendance_sessions(tenant_id, session_date, status);
CREATE INDEX idx_attendance_sessions_tenant_class_status ON attendance_sessions(tenant_id, class_id, status);
CREATE INDEX idx_attendance_records_session ON attendance_records(tenant_id, attendance_session_id);
CREATE INDEX idx_attendance_records_student ON attendance_records(tenant_id, student_id);
CREATE UNIQUE INDEX idx_attendance_records_session_student ON attendance_records(tenant_id, attendance_session_id, student_id);
CREATE UNIQUE INDEX idx_daily_summary_unique ON daily_attendance_summaries(tenant_id, student_id, summary_date);
```

### 3.7 Gradebook and Reporting

#### `grading_scales`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| name | VARCHAR(100) | NOT NULL |
| config_json | JSONB | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**`config_json` schema**:
```typescript
{
  type: 'numeric' | 'letter' | 'custom',
  // For numeric:
  ranges?: Array<{
    min: number,
    max: number,
    label: string,       // e.g., "A", "B+"
    gpa_value?: number
  }>,
  // For letter:
  grades?: Array<{
    label: string,        // e.g., "Excellent", "Satisfactory"
    numeric_value?: number
  }>,
  passing_threshold?: number
}
```

**Immutability rule**: A grading scale cannot be modified if any assessments have been graded against it. Admin must create a new scale.

**`config_json` validation rules** (Zod-enforced on create/update):
- `type` is required and must be one of `'numeric'`, `'letter'`, `'custom'`.
- If `type = 'numeric'`: `ranges` is required, non-empty, and must have non-overlapping `min`/`max` values sorted ascending. Each range must have `min < max`. `label` is required per range.
- If `type = 'letter'`: `grades` is required and non-empty. Each grade must have a non-empty `label`. If `numeric_value` is provided, values must be unique across grades.
- `passing_threshold`, if provided, must be a non-negative number.

**Constraint**: `UNIQUE (tenant_id, name)` — prevents duplicate scale names within a school.

#### `assessment_categories`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| name | VARCHAR(100) | NOT NULL |
| default_weight | NUMERIC(5,2) | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, name)` — prevents duplicate category names within a school.

#### `class_subject_grade_configs`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| class_id | UUID | FK → classes, NOT NULL |
| subject_id | UUID | FK → subjects, NOT NULL |
| grading_scale_id | UUID | FK → grading_scales, NOT NULL |
| category_weight_json | JSONB | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**`category_weight_json` schema**:
```typescript
{
  weights: Array<{
    category_id: string,   // UUID → assessment_categories
    weight: number         // e.g., 30 (percent)
  }>
  // If sum != 100, weights are normalized at calculation time
  // Teacher sees warning: "Weights sum to X% — effective weights are normalized"
}
```

#### `assessments`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| class_id | UUID | FK → classes, NOT NULL |
| subject_id | UUID | FK → subjects, NOT NULL |
| academic_period_id | UUID | FK → academic_periods, NOT NULL |
| category_id | UUID | FK → assessment_categories, NOT NULL |
| title | VARCHAR(255) | NOT NULL |
| max_score | NUMERIC(10,2) | NOT NULL |
| due_date | DATE | NULL |
| grading_deadline | DATE | NULL |
| status | ENUM('draft','open','closed','locked') | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

#### `grades`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| assessment_id | UUID | FK → assessments, NOT NULL |
| student_id | UUID | FK → students, NOT NULL |
| raw_score | NUMERIC(10,4) | NULL |
| is_missing | BOOLEAN | NOT NULL DEFAULT false |
| comment | TEXT | NULL |
| entered_by_user_id | UUID | FK → users, NOT NULL |
| entered_at | TIMESTAMPTZ | NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, assessment_id, student_id)`

**`is_missing` vs NULL score**: `is_missing = true` means the student did not submit/take the assessment. `raw_score = NULL` with `is_missing = false` means not yet graded. `raw_score = 0` with `is_missing = false` means scored zero.

#### `period_grade_snapshots`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| student_id | UUID | FK → students, NOT NULL |
| class_id | UUID | FK → classes, NOT NULL |
| subject_id | UUID | FK → subjects, NOT NULL |
| academic_period_id | UUID | FK → academic_periods, NOT NULL |
| computed_value | NUMERIC(10,4) | NOT NULL |
| display_value | VARCHAR(50) | NOT NULL |
| overridden_value | VARCHAR(50) | NULL |
| override_reason | TEXT | NULL |
| override_actor_user_id | UUID | NULL, FK → users |
| snapshot_at | TIMESTAMPTZ | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, student_id, class_id, subject_id, academic_period_id)` — one snapshot per student per subject per class per period. The computation engine uses `INSERT ... ON CONFLICT (tenant_id, student_id, class_id, subject_id, academic_period_id) DO UPDATE SET computed_value = EXCLUDED.computed_value, display_value = EXCLUDED.display_value, snapshot_at = now()` (UPSERT) to prevent duplicate rows when grades are recomputed. Override fields (`overridden_value`, `override_reason`, `override_actor_user_id`) are NOT included in the UPSERT — recomputation preserves existing overrides.

**Override rule**: Requires `gradebook.override_final_grade` permission. `override_reason` mandatory. `computed_value` is preserved — override is the display override only.

#### `report_cards`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| student_id | UUID | FK → students, NOT NULL |
| academic_period_id | UUID | FK → academic_periods, NOT NULL |
| status | ENUM('draft','published','revised') | NOT NULL |
| template_locale | VARCHAR(10) | NOT NULL |
| teacher_comment | TEXT | NULL |
| principal_comment | TEXT | NULL |
| published_at | TIMESTAMPTZ | NULL |
| published_by_user_id | UUID | NULL, FK → users |
| revision_of_report_card_id | UUID | NULL, FK → report_cards (self-referencing) |
| snapshot_payload_json | JSONB | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**`snapshot_payload_json` schema**:
```typescript
{
  student: {
    full_name: string,
    student_number: string | null,
    year_group: string,
    class_homeroom: string | null
  },
  period: {
    name: string,
    academic_year: string,
    start_date: string,
    end_date: string
  },
  subjects: Array<{
    subject_name: string,
    subject_code: string | null,
    computed_value: number,
    display_value: string,
    overridden_value: string | null,
    assessments: Array<{
      title: string,
      category: string,
      max_score: number,
      raw_score: number | null,
      is_missing: boolean
    }>
  }>,
  attendance_summary?: {
    total_days: number,
    present_days: number,
    absent_days: number,
    late_days: number,
    excused_days: number,
    left_early_days: number
  },
  teacher_comment: string | null,
  principal_comment: string | null
}
```

**Constraint**: `UNIQUE (tenant_id, student_id, academic_period_id) WHERE status IN ('draft', 'published')` — prevents duplicate non-revised report cards for the same student and period. A student can have at most one active (draft or published) report card per period. Revised (superseded) cards are excluded from this constraint, allowing the revision chain to coexist.

**Immutability**: Once `status = 'published'`, `snapshot_payload_json` is frozen. Corrections require a new report card with `revision_of_report_card_id` pointing to the original.

**Indexes (Section 3.7)**:
```sql
CREATE UNIQUE INDEX idx_grade_configs_class_subject ON class_subject_grade_configs(tenant_id, class_id, subject_id);
CREATE INDEX idx_grade_configs_tenant ON class_subject_grade_configs(tenant_id);
CREATE INDEX idx_grading_scales_tenant ON grading_scales(tenant_id);
CREATE UNIQUE INDEX idx_grading_scales_tenant_name ON grading_scales(tenant_id, name);
CREATE INDEX idx_assessments_tenant_class ON assessments(tenant_id, class_id);
CREATE INDEX idx_assessments_tenant_period ON assessments(tenant_id, academic_period_id);
CREATE UNIQUE INDEX idx_grades_unique ON grades(tenant_id, assessment_id, student_id);
CREATE INDEX idx_grades_student ON grades(tenant_id, student_id);
CREATE INDEX idx_period_snapshots_student ON period_grade_snapshots(tenant_id, student_id);
CREATE INDEX idx_period_snapshots_period ON period_grade_snapshots(tenant_id, academic_period_id);
CREATE UNIQUE INDEX idx_period_snapshots_unique ON period_grade_snapshots(tenant_id, student_id, class_id, subject_id, academic_period_id);
CREATE INDEX idx_report_cards_student ON report_cards(tenant_id, student_id);
CREATE INDEX idx_report_cards_period ON report_cards(tenant_id, academic_period_id);
CREATE INDEX idx_report_cards_revision ON report_cards(revision_of_report_card_id) WHERE revision_of_report_card_id IS NOT NULL;
CREATE UNIQUE INDEX idx_report_cards_active_unique ON report_cards(tenant_id, student_id, academic_period_id) WHERE status IN ('draft', 'published');
```

### 3.8 Finance

#### `fee_structures`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| name | VARCHAR(150) | NOT NULL |
| year_group_id | UUID | NULL, FK → year_groups |
| amount | NUMERIC(12,2) | NOT NULL |
| billing_frequency | ENUM('one_off','term','monthly','custom') | NOT NULL |
| active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, name)` — prevents duplicate fee structure names within a school.

**Year scoping**: Fee structures are intentionally not tied to a specific academic year — the same fee structure can be assigned across years. Year-specific fee changes are handled by creating new fee structures and updating `household_fee_assignments` (closing old assignments with `effective_to`, creating new ones). The `active` flag is used to hide retired fee structures from the UI without deleting them.

#### `discounts`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| name | VARCHAR(150) | NOT NULL |
| discount_type | ENUM('fixed','percent') | NOT NULL |
| value | NUMERIC(12,2) | NOT NULL |
| active | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, name)` — prevents duplicate discount names within a school.

#### `household_fee_assignments`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| household_id | UUID | FK → households, NOT NULL |
| student_id | UUID | NULL, FK → students |
| fee_structure_id | UUID | FK → fee_structures, NOT NULL |
| discount_id | UUID | NULL, FK → discounts |
| effective_from | DATE | NOT NULL |
| effective_to | DATE | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Discount rule**: One discount per assignment. Fixed discount reduces line amount. Percentage applied to base fee. Line cannot go below zero.

#### `invoices`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| household_id | UUID | FK → households, NOT NULL |
| invoice_number | VARCHAR(50) | NOT NULL |
| status | ENUM('draft','pending_approval','issued','partially_paid','paid','overdue','void','cancelled','written_off') | NOT NULL |
| issue_date | DATE | NULL |
| due_date | DATE | NOT NULL |
| subtotal_amount | NUMERIC(12,2) | NOT NULL |
| discount_amount | NUMERIC(12,2) | NOT NULL DEFAULT 0 |
| tax_amount | NUMERIC(12,2) | NOT NULL DEFAULT 0 |
| total_amount | NUMERIC(12,2) | NOT NULL |
| balance_amount | NUMERIC(12,2) | NOT NULL |
| currency_code | VARCHAR(10) | NOT NULL |
| write_off_amount | NUMERIC(12,2) | NULL |
| write_off_reason | TEXT | NULL |
| last_overdue_notified_at | TIMESTAMPTZ | NULL |
| approval_request_id | UUID | NULL, FK → approval_requests |
| created_by_user_id | UUID | FK → users, NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, invoice_number)`

**`invoice_number` generation**: `{branding.invoice_prefix}-{YYYYMM}-{padded_sequence}` using `tenant_sequences WHERE sequence_type = 'invoice'`.

**Void rule**: Only allowed when `balance_amount == total_amount` (no payments applied).

**Write-off**: Sets status to `written_off`, records `write_off_amount` and `write_off_reason`, zeroes `balance_amount`. Audit-logged.

#### `invoice_lines`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| invoice_id | UUID | FK → invoices, NOT NULL |
| description | VARCHAR(255) | NOT NULL |
| quantity | NUMERIC(10,2) | NOT NULL DEFAULT 1 |
| unit_amount | NUMERIC(12,2) | NOT NULL |
| line_total | NUMERIC(12,2) | NOT NULL |
| student_id | UUID | NULL, FK → students |
| fee_structure_id | UUID | NULL, FK → fee_structures |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `CHECK (line_total = quantity * unit_amount)` — enforces calculation integrity at the DB layer. Prevents application-layer bugs from creating invoice lines where the total doesn't match the components.

#### `installments`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| invoice_id | UUID | FK → invoices, NOT NULL |
| due_date | DATE | NOT NULL |
| amount | NUMERIC(12,2) | NOT NULL |
| status | ENUM('pending','paid','overdue') | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

#### `payments`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| household_id | UUID | FK → households, NOT NULL |
| payment_reference | VARCHAR(100) | NOT NULL |
| payment_method | ENUM('stripe','cash','bank_transfer','card_manual') | NOT NULL |
| external_provider | VARCHAR(50) | NULL |
| external_event_id | VARCHAR(255) | NULL |
| amount | NUMERIC(12,2) | NOT NULL |
| currency_code | VARCHAR(10) | NOT NULL |
| status | ENUM('pending','posted','failed','voided','refunded_partial','refunded_full') | NOT NULL |
| received_at | TIMESTAMPTZ | NOT NULL |
| posted_by_user_id | UUID | NULL, FK → users |
| reason | TEXT | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Rules**: Payments are never hard-deleted. `external_event_id` is used for Stripe webhook idempotency. The UNIQUE index on `external_event_id` is the database-level safety net: even if the advisory lock mechanism fails (e.g., Redis outage), duplicate Stripe events cannot produce duplicate payment rows.

#### `payment_allocations`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| payment_id | UUID | FK → payments, NOT NULL |
| invoice_id | UUID | FK → invoices, NOT NULL |
| allocated_amount | NUMERIC(12,2) | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |

**Constraints**:
- SUM(allocated_amount) for a payment cannot exceed payment.amount
- allocated_amount for a single invoice cannot exceed that invoice's remaining balance
- Both enforced server-side

#### `receipts`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| payment_id | UUID | UNIQUE FK → payments |
| receipt_number | VARCHAR(50) | NOT NULL, immutable |
| template_locale | VARCHAR(10) | NOT NULL |
| issued_at | TIMESTAMPTZ | NOT NULL |
| issued_by_user_id | UUID | NULL, FK → users |
| render_version | VARCHAR(50) | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |

**`render_version` format**: Semver string matching the deployed application version at render time (e.g., `1.0.0`, `1.2.3`). Captured from an environment variable (`APP_VERSION`) set during CI/CD build. Used for debugging — if a PDF looks wrong, the render version identifies which template code produced it.

**`receipt_number` generation**: `{branding.receipt_prefix}-{YYYYMM}-{padded_sequence}` using `tenant_sequences WHERE sequence_type = 'receipt'`.

#### `refunds`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| payment_id | UUID | FK → payments, NOT NULL |
| refund_reference | VARCHAR(100) | NOT NULL |
| amount | NUMERIC(12,2) | NOT NULL |
| status | ENUM('pending_approval','approved','executed','failed','rejected') | NOT NULL |
| reason | TEXT | NOT NULL |
| requested_by_user_id | UUID | FK → users, NOT NULL |
| approved_by_user_id | UUID | NULL, FK → users |
| executed_at | TIMESTAMPTZ | NULL |
| failure_reason | TEXT | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: SUM(refunds.amount WHERE status IN ('approved','executed')) for a payment cannot exceed payment.amount.

**Status transitions** (enforced at API layer):
- `pending_approval → approved` (approver approves)
- `pending_approval → rejected` (approver rejects)
- `approved → executed` (refund executed successfully via Stripe or manual path)
- `approved → failed` (Stripe refund API returns an error — see below)
- `failed → approved` (admin retries — resets to approved for re-execution)
- BLOCKED: `executed → *` (executed refunds are immutable)

**Stripe refund failure handling**: When the Stripe refund API returns an error during execution, the refund status transitions from `approved` to `failed`. The `failure_reason` (new column — see below) records the Stripe error. The admin is notified. Allocation reversal does **not** occur for failed refunds — it only occurs on successful execution. The admin can retry the refund (which transitions `failed → approved` and allows re-execution) or cancel the refund (reverting the approval).

**Additional column**: `failure_reason TEXT NULL` — records Stripe or manual refund failure reason. NULL when status is not `failed`.

**Indexes (Section 3.8)**:
```sql
CREATE INDEX idx_fee_structures_tenant ON fee_structures(tenant_id);
CREATE UNIQUE INDEX idx_fee_structures_tenant_name ON fee_structures(tenant_id, name);
CREATE UNIQUE INDEX idx_discounts_tenant_name ON discounts(tenant_id, name);
CREATE INDEX idx_household_fees_tenant_household ON household_fee_assignments(tenant_id, household_id);
CREATE UNIQUE INDEX idx_fee_assignments_active_unique ON household_fee_assignments(tenant_id, household_id, COALESCE(student_id, '00000000-0000-0000-0000-000000000000'), fee_structure_id) WHERE effective_to IS NULL;
CREATE INDEX idx_invoices_tenant_household ON invoices(tenant_id, household_id);
CREATE INDEX idx_invoices_tenant_household_status ON invoices(tenant_id, household_id, status);
CREATE INDEX idx_invoices_tenant_status ON invoices(tenant_id, status);
CREATE INDEX idx_invoices_overdue_candidates ON invoices(tenant_id, status, due_date) WHERE status IN ('issued', 'partially_paid') AND last_overdue_notified_at IS NULL;
CREATE UNIQUE INDEX idx_invoices_number ON invoices(tenant_id, invoice_number);
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(tenant_id, invoice_id);
CREATE INDEX idx_installments_tenant_invoice ON installments(tenant_id, invoice_id);
CREATE INDEX idx_installments_overdue ON installments(tenant_id, status, due_date) WHERE status = 'pending';
CREATE INDEX idx_payments_tenant_household ON payments(tenant_id, household_id);
CREATE UNIQUE INDEX idx_payments_external_event ON payments(external_event_id) WHERE external_event_id IS NOT NULL;
CREATE INDEX idx_payment_allocations_tenant_payment ON payment_allocations(tenant_id, payment_id);
CREATE INDEX idx_payment_allocations_tenant_invoice ON payment_allocations(tenant_id, invoice_id);
CREATE INDEX idx_payment_allocations_lifo ON payment_allocations(payment_id, created_at DESC);
CREATE UNIQUE INDEX idx_receipts_number ON receipts(tenant_id, receipt_number);
CREATE INDEX idx_refunds_payment ON refunds(payment_id);
CREATE INDEX idx_refunds_tenant_status ON refunds(tenant_id, status);
```

### 3.9 Payroll

#### `staff_compensation`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| staff_profile_id | UUID | FK → staff_profiles, NOT NULL |
| compensation_type | ENUM('salaried','per_class') | NOT NULL |
| base_salary | NUMERIC(12,2) | NULL |
| per_class_rate | NUMERIC(12,2) | NULL |
| assigned_class_count | INT | NULL |
| bonus_class_rate | NUMERIC(12,2) | NULL |
| bonus_day_multiplier | NUMERIC(5,2) | NOT NULL DEFAULT 1.0 |
| effective_from | DATE | NOT NULL |
| effective_to | DATE | NULL |
| created_by_user_id | UUID | FK → users, NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Validation rules**:
- If `compensation_type = 'salaried'`: `base_salary` required; `per_class_rate`, `assigned_class_count`, `bonus_class_rate` must be NULL
- If `compensation_type = 'per_class'`: `per_class_rate`, `assigned_class_count`, `bonus_class_rate` required; `base_salary` must be NULL
- `bonus_day_multiplier` applies only to salaried staff (multiplier on daily rate for extra days). Default 1.0 means same rate. 1.5 means time-and-a-half for extra days. Ignored for per-class staff.
- `bonus_class_rate` is the rate paid for each class above `assigned_class_count`. Can equal `per_class_rate` or differ.
- Only one active compensation record (`effective_to IS NULL`) per `staff_profile_id` at any time. Setting a new compensation record automatically closes the previous one by setting `effective_to = new_record.effective_from - 1 day`.

**Constraint**: Partial unique index — `UNIQUE (tenant_id, staff_profile_id) WHERE effective_to IS NULL`

#### `payroll_runs`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| period_label | VARCHAR(100) | NOT NULL |
| period_month | SMALLINT | NOT NULL, CHECK (1-12) |
| period_year | SMALLINT | NOT NULL |
| total_working_days | SMALLINT | NOT NULL |
| status | ENUM('draft','pending_approval','finalised','cancelled') | NOT NULL DEFAULT 'draft' |
| total_basic_pay | NUMERIC(14,2) | NOT NULL DEFAULT 0 |
| total_bonus_pay | NUMERIC(14,2) | NOT NULL DEFAULT 0 |
| total_pay | NUMERIC(14,2) | NOT NULL DEFAULT 0 |
| headcount | INT | NOT NULL DEFAULT 0 |
| created_by_user_id | UUID | FK → users, NOT NULL |
| finalised_by_user_id | UUID | NULL, FK → users |
| finalised_at | TIMESTAMPTZ | NULL |
| approval_request_id | UUID | NULL, FK → approval_requests |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, period_month, period_year) WHERE status != 'cancelled'` — one non-cancelled payroll run per calendar month per tenant. Cancelled runs are excluded from the constraint so that the month can be re-used for a new run after cancellation.

**`period_label`**: Free-text label for display (e.g., "March 2026"). `period_month` and `period_year` are the canonical identifiers.

**`total_working_days`**: School-wide figure entered by the principal. Applied to all salaried staff calculations in this run. Not per-staff.

**Status transitions** (enforced at API layer):
- `draft → pending_approval` (when non-principal user submits for approval)
- `draft → finalised` (when school_owner user finalises directly — no approval needed)
- `pending_approval → finalised` (after approval granted)
- `pending_approval → draft` (if approval rejected — returns to draft for correction)
- `draft → cancelled` (discard before finalisation)
- BLOCKED: `finalised → *` (finalised runs are immutable)

**Finalisation side-effects**:
1. Snapshot all entries (rates, inputs, computations are frozen)
2. Compute `total_basic_pay`, `total_bonus_pay`, `total_pay`, `headcount` from entries
3. Status set to `finalised`, `finalised_by_user_id` and `finalised_at` recorded
4. Audit log entry created
5. All payslips auto-generated for the run

#### `payroll_entries`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| payroll_run_id | UUID | FK → payroll_runs, NOT NULL |
| staff_profile_id | UUID | FK → staff_profiles, NOT NULL |
| compensation_type | ENUM('salaried','per_class') | NOT NULL |
| snapshot_base_salary | NUMERIC(12,2) | NULL |
| snapshot_per_class_rate | NUMERIC(12,2) | NULL |
| snapshot_assigned_class_count | INT | NULL |
| snapshot_bonus_class_rate | NUMERIC(12,2) | NULL |
| snapshot_bonus_day_multiplier | NUMERIC(5,2) | NULL |
| days_worked | SMALLINT | NULL |
| classes_taught | INT | NULL |
| auto_populated_class_count | INT | NULL |
| basic_pay | NUMERIC(12,2) | NOT NULL DEFAULT 0 |
| bonus_pay | NUMERIC(12,2) | NOT NULL DEFAULT 0 |
| total_pay | NUMERIC(12,2) | NOT NULL DEFAULT 0 |
| notes | VARCHAR(1000) | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, payroll_run_id, staff_profile_id)` — one entry per staff per run.

**Snapshot fields** (`snapshot_*`): Captured from the staff member's active `staff_compensation` record at the time the payroll run is created (or when a draft run's entries are refreshed). These are the rates used for calculation and are **never updated after finalisation**, even if the live compensation record changes.

**Input fields**:
- `days_worked`: Entered by principal for salaried staff. NULL for per-class staff.
- `classes_taught`: For per-class staff. If `tenant_settings.payroll.autoPopulateClassCounts = true`, this is pre-populated from attendance sessions: count of `attendance_sessions` with status IN ('submitted','locked') where the scheduled teacher matches this staff member and `session_date` falls within the payroll month. Requires attendance module enabled; if disabled, auto-population is skipped and principal enters manually. The count is a snapshot taken at entry generation/refresh time — not a live query. Principal can override.
- `auto_populated_class_count`: The original value from the attendance session count before any principal override. Preserved for audit trail. NULL if auto-population is disabled or for salaried staff.

**Calculation rules** (computed in real-time during draft, frozen on finalisation):

For `compensation_type = 'salaried'`:
```
daily_rate = snapshot_base_salary / payroll_run.total_working_days

IF days_worked <= total_working_days:
    basic_pay = daily_rate × days_worked
    bonus_pay = 0
ELSE:
    basic_pay = snapshot_base_salary
    bonus_pay = daily_rate × snapshot_bonus_day_multiplier × (days_worked - total_working_days)

total_pay = basic_pay + bonus_pay
```

For `compensation_type = 'per_class'`:
```
IF classes_taught <= snapshot_assigned_class_count:
    basic_pay = classes_taught × snapshot_per_class_rate
    bonus_pay = 0
ELSE:
    basic_pay = snapshot_assigned_class_count × snapshot_per_class_rate
    bonus_pay = (classes_taught - snapshot_assigned_class_count) × snapshot_bonus_class_rate

total_pay = basic_pay + bonus_pay
```

**Rounding rules**: All calculations use `NUMERIC` precision (no floating-point). Intermediate values (`daily_rate`, `per_class_rate`) are computed to 4 decimal places using `ROUND(x, 4)` (standard half-up rounding, not truncation). Explicitly: `daily_rate = ROUND(snapshot_base_salary / total_working_days, 4)`. Final output values (`basic_pay`, `bonus_pay`, `total_pay`) are rounded to 2 decimal places using `ROUND(..., 2)` as the last step. This prevents accumulation errors — e.g., `ROUND(250000.00 / 22, 4)` = `11363.6364`, then `ROUND(11363.6364 × 22, 2)` = `250000.00` (exact). Payroll run totals (`total_basic_pay`, `total_bonus_pay`, `total_pay`) are computed as `SUM()` of the already-rounded entry values, then rounded to 2 decimal places.

**`notes`**: Optional free-text note per entry. The principal can annotate individual entries (e.g., "Covered for absent teacher 3 days").

#### `payslips`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| payroll_entry_id | UUID | UNIQUE FK → payroll_entries, NOT NULL |
| payslip_number | VARCHAR(50) | NOT NULL, immutable |
| template_locale | VARCHAR(10) | NOT NULL |
| issued_at | TIMESTAMPTZ | NOT NULL |
| issued_by_user_id | UUID | NULL, FK → users |
| snapshot_payload_json | JSONB | NOT NULL |
| render_version | VARCHAR(50) | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |

**`render_version` format**: Same as receipts — semver string from `APP_VERSION` environment variable at render time.

**Constraint**: `UNIQUE (tenant_id, payslip_number)`

**`payslip_number` generation**: `{branding.payslip_prefix}-{YYYYMM}-{padded_sequence}` using `tenant_sequences WHERE sequence_type = 'payslip'`. Row-level `SELECT ... FOR UPDATE` locking.

**`snapshot_payload_json` schema**:
```typescript
{
  staff: {
    full_name: string,
    staff_number: string | null,
    department: string | null,
    job_title: string | null,
    employment_type: string,
    bank_name: string | null,
    bank_account_last4: string | null,
    bank_iban_last4: string | null
  },
  period: {
    label: string,
    month: number,
    year: number,
    total_working_days: number
  },
  compensation: {
    type: 'salaried' | 'per_class',
    base_salary: number | null,
    per_class_rate: number | null,
    assigned_class_count: number | null,
    bonus_class_rate: number | null,
    bonus_day_multiplier: number | null
  },
  inputs: {
    days_worked: number | null,
    classes_taught: number | null
  },
  calculations: {
    basic_pay: number,
    bonus_pay: number,
    total_pay: number
  },
  school: {
    name: string,
    name_ar: string | null,
    logo_url: string | null,
    currency_code: string
  }
}
```

**Immutability**: Payslips are generated on payroll finalisation and are never modified. `snapshot_payload_json` is the source of truth for rendering — it contains all data needed to produce the payslip without any database lookups.

**Mass export**: Puppeteer renders a single consolidated PDF from all payslips in a payroll run (one payslip per page, page breaks between staff). Individual payslip rendering uses the same template but produces a single-page PDF.

**Indexes (Section 3.9)**:
```sql
CREATE INDEX idx_staff_compensation_tenant_staff ON staff_compensation(tenant_id, staff_profile_id);
CREATE UNIQUE INDEX idx_staff_compensation_active ON staff_compensation(tenant_id, staff_profile_id) WHERE effective_to IS NULL;
CREATE INDEX idx_payroll_runs_tenant ON payroll_runs(tenant_id);
CREATE UNIQUE INDEX idx_payroll_runs_period ON payroll_runs(tenant_id, period_month, period_year) WHERE status != 'cancelled';
CREATE INDEX idx_payroll_runs_tenant_status ON payroll_runs(tenant_id, status);
CREATE INDEX idx_payroll_entries_run ON payroll_entries(tenant_id, payroll_run_id);
CREATE UNIQUE INDEX idx_payroll_entries_unique ON payroll_entries(tenant_id, payroll_run_id, staff_profile_id);
CREATE INDEX idx_payroll_entries_staff ON payroll_entries(tenant_id, staff_profile_id);
CREATE UNIQUE INDEX idx_payslips_number ON payslips(tenant_id, payslip_number);
CREATE INDEX idx_payslips_entry ON payslips(payroll_entry_id);
```

### 3.10 Communications, Notifications, and CMS

#### `announcements`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| title | VARCHAR(255) | NOT NULL |
| body_html | TEXT | NOT NULL |
| status | ENUM('draft','pending_approval','scheduled','published','archived') | NOT NULL |
| scope | ENUM('school','year_group','class','household','custom') | NOT NULL |
| target_payload | JSONB | NOT NULL |
| scheduled_publish_at | TIMESTAMPTZ | NULL |
| published_at | TIMESTAMPTZ | NULL |
| author_user_id | UUID | FK → users, NOT NULL |
| approval_request_id | UUID | NULL, FK → approval_requests |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**`target_payload` schema by scope**:
```typescript
// school → {}
// year_group → { year_group_ids: string[] }
// class → { class_ids: string[] }
// household → { household_ids: string[] }
// custom → { user_ids: string[] }
```

**Custom scope limitation**: Custom targeting requires `user_ids`, which means parents without user accounts (communication-restricted, no email, `parents.user_id IS NULL`) cannot be targeted via custom-scope announcements. These parents can still be reached via `school`, `year_group`, `class`, or `household` scopes — the audience resolution engine resolves scope → students → parents and dispatches to parents regardless of user account status (using parent-level contact info for email/WhatsApp). This is a known v1 limitation; extending custom scope to accept `parent_ids` directly is deferred.

**Scheduled announcements**: If `scheduled_publish_at` is set and status is `scheduled`, a BullMQ delayed job publishes at the specified time.

**Audience resolution at publish time**: Resolves scope → students → parents → users. Creates notification records. Does NOT dynamically re-resolve later.

#### `notification_templates`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | NULL (NULL = platform-level template) |
| channel | ENUM('email','whatsapp','in_app') | NOT NULL |
| template_key | VARCHAR(100) | NOT NULL |
| locale | VARCHAR(10) | NOT NULL |
| subject_template | TEXT | NULL |
| body_template | TEXT | NOT NULL |
| is_system | BOOLEAN | NOT NULL DEFAULT false |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

#### `notifications`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| recipient_user_id | UUID | FK → users, NOT NULL |
| channel | ENUM('email','whatsapp','in_app') | NOT NULL |
| template_key | VARCHAR(100) | NULL |
| locale | VARCHAR(10) | NOT NULL |
| status | ENUM('queued','sent','delivered','failed','read') | NOT NULL |
| provider_message_id | VARCHAR(255) | NULL |
| source_entity_type | VARCHAR(100) | NULL |
| source_entity_id | UUID | NULL |
| payload_json | JSONB | NOT NULL |
| failure_reason | TEXT | NULL |
| attempt_count | SMALLINT | NOT NULL DEFAULT 0 |
| max_attempts | SMALLINT | NOT NULL DEFAULT 3 |
| next_retry_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |
| sent_at | TIMESTAMPTZ | NULL |
| delivered_at | TIMESTAMPTZ | NULL |
| read_at | TIMESTAMPTZ | NULL |

**Retry logic**: Exponential backoff. `attempt_count >= max_attempts` → dead-letter. Worker checks `next_retry_at <= now()` for retry eligibility.

**Retention and partitioning**: `notifications` is partitioned by `created_at` using PostgreSQL native range partitioning (monthly partitions). Partitions are auto-created 3 months ahead by a monthly maintenance job. Partitions older than 12 months are detached and archived to S3, then dropped. Delivered/read notifications older than 90 days are candidates for early archival if storage pressure increases. The `idx_notifications_tenant_recipient_time` index includes `created_at` to ensure partition pruning on time-bounded queries.

#### `parent_inquiries`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| parent_id | UUID | FK → parents, NOT NULL |
| student_id | UUID | NULL, FK → students |
| subject | VARCHAR(255) | NOT NULL |
| status | ENUM('open','in_progress','closed') | NOT NULL DEFAULT 'open' |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

#### `parent_inquiry_messages`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| inquiry_id | UUID | FK → parent_inquiries, NOT NULL |
| author_type | ENUM('parent','admin') | NOT NULL |
| author_user_id | UUID | FK → users, NOT NULL |
| message | TEXT | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |

**Status transitions**:
- `open → in_progress` (auto-set when first admin reply is posted — indicates staff has engaged)
- `open → closed` / `in_progress → closed` (admin closes)
- No transitions out of `closed`
- Stale inquiry detection applies to both `open` (no response yet) and `in_progress` (conversation stalled)

**Rules**:
- Parent-facing API replaces admin author details with "School Administration"
- Admin-facing API shows actual author name
- On parent message: in-app notification to all users with `inquiries.view` permission
- On admin reply: notification to parent per communication preferences, auto-transition inquiry to `in_progress` if currently `open`
- Stale inquiry detection: background job flags inquiries with status IN (`open`, `in_progress`) that have had no new messages for longer than `tenant_settings.general.inquiryStaleHours`

#### `website_pages`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| locale | VARCHAR(10) | NOT NULL DEFAULT 'en' |
| page_type | ENUM('home','about','admissions','contact','custom') | NOT NULL |
| slug | VARCHAR(150) | NOT NULL |
| title | VARCHAR(255) | NOT NULL |
| meta_title | VARCHAR(255) | NULL |
| meta_description | TEXT | NULL |
| body_html | TEXT | NOT NULL |
| status | ENUM('draft','published','unpublished') | NOT NULL |
| show_in_nav | BOOLEAN | NOT NULL DEFAULT false |
| nav_order | INT | NOT NULL DEFAULT 0 |
| author_user_id | UUID | FK → users, NOT NULL |
| published_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, slug, locale)`

**Constraint**: `UNIQUE (tenant_id, locale) WHERE page_type = 'home' AND status = 'published'` (partial unique index — enforces exactly one published homepage per tenant per locale at the database level, preventing race conditions during concurrent publish operations).

**Homepage rule**: Exactly one published page with `page_type = 'home'` per tenant per locale. Publishing a new homepage unpublishes the previous one. The partial unique index above is the safety net — the application layer performs the unpublish-then-publish within a single transaction.

#### `contact_form_submissions`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| name | VARCHAR(255) | NOT NULL |
| email | CITEXT | NOT NULL |
| phone | VARCHAR(50) | NULL |
| message | TEXT | NOT NULL |
| source_ip | INET | NULL |
| status | ENUM('new','reviewed','closed','spam') | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Spam protection**: Rate limit 5 per IP per hour (Redis, key TTL = 1 hour — keys auto-expire and are not included in GDPR access export requests as they are ephemeral operational data). Honeypot field — submissions with honeypot filled are stored with `status = 'spam'` (not silently rejected — stored for pattern analysis but hidden from the default admin view). Admin can also manually reclassify any submission as `spam` via the review UI (transitions: `new → spam`, `reviewed → spam`). Spam-classified submissions are excluded from the default contact form list view but accessible via a "Show spam" filter.

**Status transitions**:
- `new → reviewed` (admin reads)
- `new → closed` (admin closes without review)
- `new → spam` (admin manual classification or honeypot auto-classification)
- `reviewed → closed` (admin closes after review)
- `reviewed → spam` (admin manual reclassification)
- No transitions out of `closed` or `spam`.

**IP retention policy**: `source_ip` on contact form submissions is set to NULL by a nightly background job after 90 days. IP addresses are personal data under GDPR and should not be retained indefinitely. The 90-day window provides sufficient time for spam pattern analysis.

**Indexes (Section 3.10)**:
```sql
CREATE INDEX idx_announcements_tenant_status ON announcements(tenant_id, status);
CREATE INDEX idx_announcements_scheduled ON announcements(tenant_id, scheduled_publish_at) WHERE status = 'scheduled';
CREATE INDEX idx_notifications_tenant_recipient ON notifications(tenant_id, recipient_user_id, status);
CREATE INDEX idx_notifications_tenant_recipient_time ON notifications(tenant_id, recipient_user_id, created_at DESC);
CREATE INDEX idx_notifications_source ON notifications(tenant_id, source_entity_type, source_entity_id) WHERE source_entity_type IS NOT NULL;
CREATE INDEX idx_notifications_retry ON notifications(status, next_retry_at) WHERE status = 'failed' AND next_retry_at IS NOT NULL;
CREATE INDEX idx_notifications_tenant_status ON notifications(tenant_id, status);
CREATE INDEX idx_parent_inquiries_tenant_status ON parent_inquiries(tenant_id, status);
CREATE INDEX idx_parent_inquiries_tenant_parent ON parent_inquiries(tenant_id, parent_id);
CREATE INDEX idx_parent_inquiry_messages_inquiry ON parent_inquiry_messages(inquiry_id);
CREATE INDEX idx_parent_inquiry_messages_inquiry_time ON parent_inquiry_messages(inquiry_id, created_at DESC);
CREATE INDEX idx_website_pages_tenant_locale ON website_pages(tenant_id, locale, status);
CREATE UNIQUE INDEX idx_website_pages_slug ON website_pages(tenant_id, slug, locale);
CREATE UNIQUE INDEX idx_notification_templates_key ON notification_templates(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), template_key, channel, locale);
CREATE INDEX idx_notification_templates_tenant ON notification_templates(tenant_id, template_key);
CREATE INDEX idx_contact_submissions_tenant ON contact_form_submissions(tenant_id, status);
CREATE INDEX idx_contact_submissions_ip_cleanup ON contact_form_submissions(created_at) WHERE source_ip IS NOT NULL;
CREATE UNIQUE INDEX idx_website_pages_homepage ON website_pages(tenant_id, locale) WHERE page_type = 'home' AND status = 'published';
```

### 3.11 Approvals, Audit, Compliance, Imports, Search

#### `approval_workflows`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| action_type | ENUM('announcement.publish','invoice.issue','application.accept','payment.refund','payroll.finalise') | NOT NULL |
| approver_role_id | UUID | FK → roles, NOT NULL |
| is_enabled | BOOLEAN | NOT NULL DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, action_type) WHERE is_enabled = true` — at most one enabled workflow per action type per tenant. Prevents ambiguous approver routing when multiple workflows exist for the same action.

#### `approval_requests`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| action_type | VARCHAR(100) | NOT NULL |
| target_entity_type | VARCHAR(100) | NOT NULL |
| target_entity_id | UUID | NOT NULL |
| requester_user_id | UUID | FK → users, NOT NULL |
| approver_user_id | UUID | NULL, FK → users |
| status | ENUM('pending_approval','approved','rejected','executed','cancelled','expired') | NOT NULL |
| request_comment | TEXT | NULL |
| decision_comment | TEXT | NULL |
| submitted_at | TIMESTAMPTZ | NOT NULL |
| decided_at | TIMESTAMPTZ | NULL |
| executed_at | TIMESTAMPTZ | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Rules**:
- `requester_user_id != approver_user_id` (enforced at decision point — the user who decides cannot be the user who requested)
- **Orphan protection**: Before rendering or deciding an approval request, the system verifies the target entity (`target_entity_type` + `target_entity_id`) still exists and is in a compatible state. If the target entity has been deleted or moved to an incompatible state (e.g., invoice already voided independently), the approval request is auto-cancelled with `decision_comment = 'Auto-cancelled: target entity no longer in expected state'` and the requester is notified
- If no eligible approver exists, submission is blocked with clear error
- Approval is routed to a **role** (`approval_workflows.approver_role_id`), not a specific user. `approver_user_id` is NULL until a user decides.

**Execution model — two modes, fixed per action type**:

The approval engine supports exactly two execution modes. The mode is fixed per `action_type` and is not configurable per tenant.

**Mode A — Auto-Execute on Approval**: When the approver approves, the domain action executes in the **same database transaction** as the approval decision. Steps: (1) approval_request.status → `approved` (2) domain action executes (3) approval_request.status → `executed`. If step 2 fails, the entire transaction rolls back and the request remains `pending_approval`. A BullMQ retry job is enqueued with the `approval_request.id` as idempotency key (3 attempts, exponential backoff: 30s, 2min, 10min). If all retries fail, request stays `approved` (not `executed`) and admin is alerted.

**Mode B — Manual Execute After Approval**: When the approver approves, only the approval status updates. A separate user action is required to execute the domain action (e.g., conversion screen for admissions, execute button for refunds). This mode exists because the execution step requires additional human input or judgment.

| action_type | Execution Mode | Why | Executor | Reversion State on Expiry/Cancel |
|-------------|---------------|-----|----------|----------------------------------|
| `announcement.publish` | **Auto** (Mode A) | Approval IS the decision to publish | System (same transaction) | announcement → `draft` |
| `invoice.issue` | **Auto** (Mode A) | Approval IS the decision to issue | System (same transaction) | invoice → `draft` |
| `payroll.finalise` | **Auto** (Mode A) | Approval IS the decision to finalise | System (same transaction) | payroll run → `draft` |
| `application.accept` | **Manual** (Mode B) | Conversion requires admin to review/edit student data | User with `admissions.convert` permission | application → `under_review` |
| `payment.refund` | **Manual** (Mode B) | Execution requires selecting Stripe vs manual path | User with `finance.execute_refund` permission | refund → `pending_approval` |

**Approved-but-not-executed (Mode B only)**: These requests sit in `approved` status until manually executed or cancelled. The expiry timer does **not** apply to the `approved` state for manual-execute types (expiry only applies to `pending_approval` → `expired`). The dashboard surfaces approved-but-unexecuted items older than 48 hours as a reminder. The original requester or any user with `approvals.decide` permission can cancel these, reverting the target entity per the table above.

**Engine implementation shape**:
```typescript
interface ApprovalActionConfig {
  action_type: string;
  execution_mode: 'auto' | 'manual';
  domain_executor: ((request: ApprovalRequest, tx: Transaction) => Promise<void>) | null;
  reversion_executor: (request: ApprovalRequest, tx: Transaction) => Promise<void>;
}

// Registry — compile-time, not configurable per tenant
const APPROVAL_ACTIONS: Record<string, ApprovalActionConfig> = {
  'announcement.publish': { execution_mode: 'auto', domain_executor: publishAnnouncement, reversion_executor: revertAnnouncementToDraft },
  'invoice.issue':        { execution_mode: 'auto', domain_executor: issueInvoice,        reversion_executor: revertInvoiceToDraft },
  'payroll.finalise':     { execution_mode: 'auto', domain_executor: finalisePayrollRun,   reversion_executor: revertPayrollRunToDraft },
  'application.accept':   { execution_mode: 'manual', domain_executor: null,               reversion_executor: revertApplicationToUnderReview },
  'payment.refund':       { execution_mode: 'manual', domain_executor: null,               reversion_executor: revertRefundToPendingApproval },
};
```

The `decide` endpoint checks `execution_mode`. If `auto`, it calls `domain_executor` within the approval transaction. If `manual`, it stops after updating the approval request status.

**Approver availability check**: The nightly expiry job also checks each pending approval request for eligible approvers (active memberships with the `approver_role_id`). If zero eligible approvers exist, the request is auto-expired immediately with `decision_comment = 'Auto-expired: no eligible approver for role'`. The requester is notified, and the target entity reverts per the reversion table above. This prevents requests from blocking entities for the full expiry window when all approvers have been removed.

**Expiry**: Pending requests expire after `tenant_settings.approvals.expiryDays` (default: 7 calendar days). Expired items revert to recoverable state per table above. Requester and approver role members notified.

**Reminder**: At `tenant_settings.approvals.reminderAfterHours` (default: 48h), in-app notification sent to approver role members if still pending.

**Cancellation**: Requester can cancel pending requests. For manual-execute types, approved-but-not-executed requests can also be cancelled by requester or admin. Target entity reverts per table above.

**Status transitions**:
```
pending_approval → approved     (approver decides)
pending_approval → rejected     (approver decides)
pending_approval → cancelled    (requester cancels)
pending_approval → expired      (nightly timeout job)
approved → executed             (auto or manual execution)
approved → cancelled            (manual-execute types only — requester or admin)
```
Terminal states (no further transitions): `executed`, `rejected`, `expired`, `cancelled`.

#### `audit_logs`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | NULL (NULL for platform-level actions) |
| actor_user_id | UUID | NULL, FK → users |
| entity_type | VARCHAR(100) | NOT NULL |
| entity_id | UUID | NULL |
| action | VARCHAR(100) | NOT NULL |
| metadata_json | JSONB | NOT NULL |
| ip_address | INET | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |

**Rules**: Append-only. No updates or deletes ever. Not anonymised during compliance erasure (references user_id, which gets anonymised name).

**Retention and partitioning**: `audit_logs` is partitioned by `created_at` using PostgreSQL native range partitioning (monthly partitions). Partitions are auto-created 3 months ahead by a monthly maintenance job. Partitions older than the configured retention period (`tenant_settings.compliance.auditLogRetentionMonths`, default: 36 months) are detached and archived to S3 as compressed Parquet files, then dropped. Platform owner can override retention per tenant. The partition key (`created_at`) is included in all indexes as a suffix to ensure partition pruning works with existing query patterns.

#### `compliance_requests`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| request_type | ENUM('access_export','erasure','rectification') | NOT NULL |
| subject_type | ENUM('parent','student','household','user') | NOT NULL |
| subject_id | UUID | NOT NULL |
| requested_by_user_id | UUID | FK → users, NOT NULL |
| status | ENUM('submitted','classified','approved','rejected','completed') | NOT NULL |
| classification | ENUM('erase','anonymise','retain_legal_basis') | NULL |
| decision_notes | TEXT | NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Erasure/anonymisation rules**:
- **User subject_type scope**: When `subject_type = 'user'`, the erasure request is tenant-scoped. Anonymisation applies only to the user's data **within the requesting tenant**: parent records, staff profiles, payroll entries, inquiry messages, notification records, and search index entries scoped to that tenant. The platform-level `users` table row (name, email) is **NOT anonymised** by a tenant-scoped request — the user may have active memberships in other tenants. Platform-level user anonymisation requires a separate platform-tier compliance request (`subject_type = 'user'`, submitted by a user with `platform.process_compliance` permission) which anonymises `users.first_name`, `users.last_name`, and `users.email` only after confirming no active memberships remain in any tenant.
- Finance records: personal identifiers anonymised (`ANONYMISED-{uuid}`), records retained
- Payroll records: staff identifier anonymised in `payroll_entries` and `payslips.snapshot_payload_json`, financial records retained
- Grades and attendance: student identifier anonymised, records retained
- Report cards: `snapshot_payload_json` student name anonymised
- Contact form submissions: `name` anonymised, `email` anonymised, `phone` set to NULL, `source_ip` set to NULL (IP addresses are personal data under GDPR)
- Audit logs: retained, actor shows anonymised name via join
- Process is idempotent — each entity type processed independently, can resume on failure

#### `import_jobs`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| import_type | ENUM('students','parents','staff','fees','exam_results','staff_compensation') | NOT NULL |
| file_key | TEXT | NULL (S3 key, purged after processing) |
| status | ENUM('uploaded','validated','processing','completed','failed') | NOT NULL |
| summary_json | JSONB | NOT NULL |
| created_by_user_id | UUID | FK → users, NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**`summary_json` schema**:
```typescript
{
  total_rows: number,
  successful: number,
  failed: number,
  warnings: number,
  errors: Array<{
    row: number,
    field: string,
    error: string
  }>,
  warnings_list: Array<{
    row: number,
    field: string,
    warning: string  // e.g., "Possible duplicate detected"
  }>
}
```

**File cleanup**: Staged S3 files purged by background job after 24 hours or after import completes.

#### `search_index_status`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| entity_type | VARCHAR(100) | NOT NULL |
| entity_id | UUID | NOT NULL |
| index_status | ENUM('pending','indexed','failed') | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Searchable entities**: students, parents, staff, households, invoices, applications

**Search architecture**:
1. Create/update/delete of searchable entity → enqueue Meilisearch sync job
2. Nightly full-reindex job reconciles drift
3. API search endpoint: query Meilisearch (tenant_id filter) → post-filter by user permissions → return results
4. Meilisearch outage → fallback to PostgreSQL ILIKE + tsvector

**Indexing strategy per entity** (defines which fields are denormalized into each Meilisearch index document):
| Entity | Searchable Fields | Filterable Attributes |
|--------|------------------|-----------------------|
| students | `full_name`, `full_name_ar`, `student_number`, `date_of_birth` | `status`, `year_group_id`, `tenant_id` |
| parents | `first_name`, `last_name`, `email`, `phone` | `status`, `tenant_id` |
| staff | `first_name`, `last_name` (from `users` via join), `staff_number`, `job_title` | `employment_status`, `tenant_id` |
| households | `household_name`, primary billing parent name (denormalized) | `status`, `tenant_id` |
| invoices | `invoice_number`, household name (denormalized), line descriptions (concatenated) | `status`, `tenant_id` |
| applications | `application_number`, `student_first_name`, `student_last_name` | `status`, `tenant_id` |

All fields are denormalized at index time via tenant-scoped joins — the Meilisearch index never queries `users` directly (see Section 3.2 application-layer guard rules).

**Indexes (Section 3.11)**:
```sql
CREATE INDEX idx_approval_workflows_tenant ON approval_workflows(tenant_id, action_type);
CREATE UNIQUE INDEX idx_approval_workflows_enabled ON approval_workflows(tenant_id, action_type) WHERE is_enabled = true;
CREATE INDEX idx_approval_requests_tenant_status ON approval_requests(tenant_id, status);
CREATE INDEX idx_approval_requests_approver ON approval_requests(approver_user_id, status);
CREATE INDEX idx_audit_logs_tenant_entity ON audit_logs(tenant_id, entity_type, entity_id);
CREATE INDEX idx_audit_logs_tenant_actor ON audit_logs(tenant_id, actor_user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(tenant_id, created_at);
CREATE INDEX idx_compliance_requests_tenant ON compliance_requests(tenant_id, status);
CREATE INDEX idx_import_jobs_tenant ON import_jobs(tenant_id, status);
CREATE INDEX idx_search_index_status_pending ON search_index_status(tenant_id, index_status) WHERE index_status = 'pending';
```

### 3.12 User UI Preferences

#### `user_ui_preferences`
| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants, NOT NULL |
| user_id | UUID | FK → users, NOT NULL |
| preferences | JSONB | NOT NULL DEFAULT '{}' |
| created_at | TIMESTAMPTZ | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

**Constraint**: `UNIQUE (tenant_id, user_id)` — one preference record per user per tenant.

**`preferences` JSONB Schema (Zod-validated)**:
```typescript
{
  sidebar_collapsed: boolean,                          // default: false
  active_role_context: string | null,                  // role_key of last active context
  theme: 'light' | 'dark' | 'system',                 // default: 'system'
  locale_override: 'en' | 'ar' | null,                // null = use user/tenant default
  table_configs: Record<string, {                      // keyed by table identifier e.g. "students_list"
    column_visibility: Record<string, boolean>,
    column_order: string[],
    page_size: number,
    sort_column: string | null,
    sort_direction: 'asc' | 'desc'
  }>,
  saved_filters: Record<string, Array<{                // keyed by table identifier
    name: string,
    filter_payload: Record<string, any>,
    is_default: boolean
  }>>,
  recent_records: Array<{                              // max 20, LIFO
    entity_type: string,
    entity_id: string,
    label: string,
    visited_at: string
  }>,
  pinned_records: Array<{                              // max 25
    entity_type: string,
    entity_id: string,
    label: string,
    pinned_at: string
  }>,
  last_active_tabs: Record<string, string>             // keyed by page identifier, value = tab key
}
```

**API**: `GET /api/v1/me/preferences` (read) and `PATCH /api/v1/me/preferences` (partial update — merges into existing JSONB). No permission required beyond authentication. Updates are debounced client-side (500ms) for frequently changing values like column ordering.

**Size limits**: Maximum 500KB per preferences JSONB payload. Maximum 50 entries in `table_configs`. Maximum 10 saved filters per table in `saved_filters`. The API rejects updates that would exceed these limits with `VALIDATION_FAILED`.

**Indexes (Section 3.12)**:
```sql
CREATE UNIQUE INDEX idx_user_ui_preferences_unique ON user_ui_preferences(tenant_id, user_id);
```

---

## 4. FUNCTIONAL REQUIREMENTS

### 4.1 Platform Administration

**4.1.1 Provision Tenant**
- Create tenant with name, slug, default locale, timezone, date format, currency
- Slug is immutable after creation, globally unique
- Auto-create fallback subdomain `{slug}.edupod.app`
- Auto-create tenant_branding, tenant_settings with defaults
- Auto-create system roles for tenant
- Auto-create `tenant_sequences` rows for all sequence types (`receipt`, `invoice`, `application`, `payslip`) with `current_value = 0`
- **Acceptance**: tenant is created in `active` status with all default records including sequence rows

**4.1.2 Configure Domain and SSL**
- Add custom domain for app or public site
- Trigger Cloudflare verification
- Track verification and SSL status
- Remain on fallback subdomain until custom domain is verified + SSL active
- Allow multiple domains per type, only one primary per type
- **Acceptance**: domain routes correctly after verification, SSL active

**4.1.3 Enable/Disable Modules**
- Toggle `tenant_modules.is_enabled` per module
- Disabling hides module from UI and blocks new API operations
- Does NOT delete existing data; re-enabling restores access
- **Acceptance**: disabled module is inaccessible, data preserved

**4.1.4 Suspend/Reactivate Tenant**
- Set `tenants.status` to `suspended` or back to `active`
- Suspension: set Redis flag, all active sessions invalidated, login blocked
- Reactivation: clear Redis flag, login restored
- **Acceptance**: suspended tenant returns TENANT_SUSPENDED on all API calls within seconds

**4.1.5 Monitor Tenant Health**
- Dashboard showing: active user counts per tenant, queue depths, error rates, storage usage
- Data sourced from CloudWatch/Sentry metrics
- **Acceptance**: platform owner sees real-time operational overview

**4.1.6 Read-Only Impersonation**
- Platform owner can view tenant as a specific user role
- All actions are read-only (no mutations)
- Impersonation session is audit-logged with platform owner identity
- **Acceptance**: impersonation cannot modify any tenant data

**4.1.7 Reset MFA for User**
- Platform owner can disable MFA for a specific user (emergency recovery)
- Audit-logged as platform action
- **Acceptance**: user can log in without MFA after reset, must re-enable MFA manually

**4.1.8 Enforce Platform Security Minimums**
- Minimum password length, MFA enforcement policy (optional/required), session duration
- Applied across all tenants
- **Acceptance**: tenant cannot set security below platform minimums

### 4.2 Identity, Onboarding, and RBAC

**4.2.1 Invitation-Based Staff Onboarding**
- Admin creates invitation with email and role(s)
- System checks for existing user by email
- If exists: invitation email says "You've been invited to School X — log in with your existing account"
- If new: invitation email includes registration link
- On acceptance: create/link user, create membership, assign roles
- **Acceptance**: staff can log in and access their role-appropriate views

**4.2.2 Parent Onboarding**
- Two paths: admissions-linked registration (parent applies, gets account on acceptance) OR staff invitation
- Staff invitation can pre-link to household and students
- On registration, system matches unlinked parent records by email within tenant
- **Acceptance**: parent sees only linked household and students after onboarding

**4.2.3 Custom Roles and Permissions**
- School admin can create custom roles
- Role has a tier (platform/admin/staff/parent) that restricts permission selection
- Custom roles can be assigned to memberships alongside system roles
- **Acceptance**: custom role cannot include permissions above its tier

**4.2.4 Multi-Role Memberships**
- Single membership can have multiple roles
- Permissions are the union of all role permissions
- UI shows context switcher for roles with different data scopes (staff vs parent)
- **Acceptance**: user sees appropriate data for active context, no privilege bleed

**4.2.5 Multi-Tenant Access (School Selector)**
- After login, if user has memberships at multiple tenants, show school selector
- Selecting a school issues new JWT with that tenant's claims
- Each tenant context is fully isolated
- **Acceptance**: switching schools shows completely different data, no cross-tenant leakage

**4.2.6 Locale Preference**
- User can set `preferred_locale` in profile
- Effective locale: user preference → tenant default → 'en'
- **Acceptance**: UI renders in effective locale, RTL applied for Arabic

**4.2.7 MFA Setup and Usage**
- User enables TOTP in profile settings
- On setup: generate QR code, verify first code, generate 10 recovery codes (displayed once)
- Login requires TOTP code when MFA is enabled
- Recovery codes allow bypass and MFA disable
- **Acceptance**: MFA blocks login without valid TOTP or recovery code

### 4.3 Registration and Communication Preference Capture

**4.3.1 Parent Registration Flow**
- Captures: email, password, first name, last name, primary phone
- Optional: WhatsApp number (if different from phone)
- Required: communication preference selection (email / WhatsApp / both)
- If WhatsApp selected and number differs from phone → dedicated WhatsApp field required
- If WhatsApp selected and same as phone → explicit confirmation checkbox required
- **Acceptance**: registration cannot complete with invalid communication preference data

**4.3.2 Communication Preference Update**
- Parent can update preferences in profile settings
- Same validation rules as registration
- Changes take effect on next notification dispatch
- **Acceptance**: updated preferences immediately reflected in notification routing

### 4.4 School Configuration and Branding

**4.4.1 Branding Configuration**
- School admin sets: logo, colors, display names (English + Arabic), email sender names, support contact
- Receipt and invoice prefix configuration
- **Acceptance**: branding appears on all school-facing UI, emails, and printable documents

**4.4.2 School Settings**
- Configure all items in `tenant_settings` JSONB schema
- Settings validated against Zod schema on save
- **Acceptance**: settings changes take effect immediately for subsequent operations

**4.4.3 Stripe Configuration**
- School owner enters Stripe keys in settings
- Keys are AES-256 encrypted before storage
- UI shows only last 4 characters after save
- Audit-logged
- **Acceptance**: Stripe payments work with configured keys, keys never exposed in API responses

**4.4.4 Notification Settings**
- School admin enables/disables each notification type
- Configures active channels per type
- **Acceptance**: disabled notification types are not sent, enabled types use configured channels

### 4.5 Admissions

**4.5.1 Configurable Form Builder**
- Admin creates form with fields (all supported types)
- Set field properties: label, help text, required, visibility, searchable, reportable
- Simple conditional visibility (show field X when field Y = value Z)
- **Platform-enforced required fields**: The form builder warns if `date_of_birth` is not marked as required, since it is mandatory for student conversion (see Section 4.5.6). The warning reads: "Date of birth is required for student conversion. Applications without it will need manual entry at conversion time." The form can still be published without DOB required — this is a warning, not a block.
- **Acceptance**: form preview matches builder configuration

**4.5.2 Form Versioning**
- Published form is live for applications
- Editing a published form creates new version
- Old version archived, existing applications preserved against old version
- **Acceptance**: historic applications always display correctly against their form version

**4.5.3 Public Admissions Page**
- Publicly accessible (no login required)
- Displays published form for the tenant
- Parent fills out form, creates draft application
- On submit: parent must register or log in, application linked to parent
- **Rate limiting**: 10 submissions per IP per hour (Redis). Honeypot field — submissions with honeypot filled are silently rejected.
- **Acceptance**: public page accessible, form submittable, application created, spam mitigated

**4.5.4 Application Review**
- Staff views submitted applications
- Can change status: submitted → under_review → pending_acceptance_approval / rejected
- Internal notes (not visible to parents)
- **Acceptance**: staff can progress applications through workflow, notes preserved

**4.5.5 Approval-Gated Acceptance**
- If `tenant_settings.admissions.requireApprovalForAcceptance = true`:
  - Moving to `accepted` requires approval
  - Approval request created, routed to configured approver role
  - No student record created until approval is executed AND conversion action is triggered
- If false: staff can accept directly
- **Acceptance**: no student created before approval execution when approval is enabled

**4.5.6 Application-to-Student Conversion**
- Admin clicks "Convert to Student" on accepted application → opens a pre-populated, editable conversion screen (not a one-click action)
- **Conversion screen layout**: student section (pre-filled from application), year group selector (required, admin selects), parent 1 section (pre-filled from `parent1_*` payload fields), parent 2 section (collapsible, from `parent2_*` fields), household section (shows matching results)
- **Required fields** (block conversion if missing): `student_first_name`, `student_last_name`, `date_of_birth`, `year_group_id`, `parent1_first_name`, `parent1_last_name`
- **Recommended fields** (show warning if missing, do not block): `parent1_email`, `parent2_email`
- **Parent email matching**: email is the sole matching key. If parent email matches an existing parent record → prompt admin to link or create new. Phone/name shown for visual confirmation only, not used for matching.
- **No-email parents**: Conversion is allowed without parent email. Parent record created with `email = NULL`, marked as communication-restricted (no portal login, no email notifications). Surfaced on dashboard as "Parents without email."
- **Household creation**: new household created (with `needs_completion = true`) or linked to existing per email-based decision tree. Parent 1 set as primary contact and billing contact.
- **Emergency contacts**: NOT extracted from application. Household flagged as `needs_completion = true` until at least 1 emergency contact is added post-conversion.
- **Side-effects**: student record created (`status: active`, `entry_date: today`), parent/household records created or linked, `student_parents` and `household_parents` junction records created, Meilisearch index updated, audit log entry with all entity IDs
- **Acceptance**: conversion screen validates all required fields, shows warnings for missing recommended fields, creates all records in single transaction, household completion status visible on admin dashboard

**4.5.7 Duplicate Application Detection**
- On submission, check for matching first name + last name + DOB in same tenant
- Flag for review but do not block
- **Acceptance**: duplicates are warned, not blocked

### 4.6 Students, Households, Parents

**4.6.1 Manage Households**
- Create, edit, archive households
- Set primary billing parent
- Manage emergency contacts (1-3 per household, minimum 1)
- **Acceptance**: billing parent integrity enforced, emergency contacts validated

**4.6.2 Manage Parents**
- Create, edit parent records
- Link to households (via household_parents)
- Link to students (via student_parents)
- Set primary contact and billing contact flags
- **Acceptance**: parent sees only linked household and students

**4.6.3 Manage Students**
- Create, edit student records
- Set year group, homeroom class
- Medical notes and allergy tracking
- Student number assignment
- **Acceptance**: status transitions enforced, allergy details required when flagged

**4.6.4 Household Merge**
- Admin-initiated: select source and target household
- All students, parents, emergency contacts moved to target
- **Financial record handling**:
  - All invoices (`invoices.household_id`) reassigned to target household
  - All payments (`payments.household_id`) reassigned to target household
  - All `payment_allocations` remain valid (they reference `invoice_id` and `payment_id`, not `household_id` directly) — no allocation changes needed
  - `household_fee_assignments` from source reassigned to target
  - Invoice and receipt numbers are immutable and do not change
  - A **merge audit record** is created in `audit_logs` capturing: source household ID, target household ID, list of all reassigned entity IDs (invoice IDs, payment IDs, student IDs, parent IDs), and the acting user
  - The household statement for the target household after merge reflects the full combined financial history. The source household (now archived) retains a statement that shows "Merged into [target household name] on [date]" as a terminal entry
- Source household archived (status → `archived`)
- Atomic transaction, audit-logged
- **Concurrency guard**: The merge transaction acquires `SELECT ... FOR UPDATE` locks on both source and target household rows (ordered by household ID to prevent deadlock) before reassigning any child records. This serialises concurrent merge/split operations on the same household.
- **Acceptance**: all data consolidated, no orphaned records, financial statements coherent post-merge, no allocation integrity violations

**4.6.5 Household Split**
- Admin creates new household, moves selected students and parents
- **Financial record handling**:
  - Existing invoices stay with original household (invoices are never moved during splits — they record historical billing facts)
  - Existing payments and allocations stay with original household
  - New invoices for moved students are generated against the new household going forward
  - `household_fee_assignments` for moved students are reassigned to the new household; assignments for remaining students stay
  - A **split audit record** captures: source household ID, new household ID, moved student IDs, moved parent IDs, reassigned fee assignment IDs
  - Admin is warned: "Existing invoices will remain with [original household]. New invoices for [moved students] will be generated against [new household]."
- **Concurrency guard**: The split transaction acquires `SELECT ... FOR UPDATE` on the source household row before reassigning any child records. This serialises concurrent split/merge operations on the same household (same pattern as household merge — see Section 4.6.4). Lock ordering by household ID is maintained for consistency.
- Audit-logged
- **Acceptance**: data split cleanly, billing updated, historical financial records preserved on original household

**4.6.6 Student Export Pack**
- Export student data: profile, attendance summary, grades, report cards
- Excludes internal-only content (notes, audit entries)
- **Acceptance**: export contains all parent-visible data for the student

**Acceptance fixture**: Student S1 in Grade 7 / class 7A. 2 published report cards (Term 1, Term 2) with snapshot payloads. 45 attendance days (40 present, 3 absent_unexcused, 2 late). 1 internal application note ("Flag for review"). 1 audit log entry (student.created). Expected output: `{ student: { id, name, dob, year_group, class, student_number, medical_notes, allergy_details }, attendance_summary: { total_days: 45, present: 40, absent: 3, late: 2, excused: 0 }, report_cards: [Term 1, Term 2 with subjects, attendance, comments], grades_by_period: [Term 1, Term 2 with subjects and assessments] }`. Excluded: application notes, audit log entries (internal-only).

**4.6.7 Allergy Report**
- Export list of students with `has_allergy = true`
- Filterable by class, year group
- Shows: student name, class, allergy details
- **Acceptance**: report contains all flagged students with details

### 4.7 Staff, Academics, and Promotion

**4.7.1 Academic Year and Period Management**
- Create academic years with date ranges
- Create periods within years (no overlapping periods)
- Status lifecycle: planned → active → closed
- **Acceptance**: overlapping periods blocked, status transitions enforced

**4.7.2 Class Management**
- Create classes linked to academic year, year group, subject
- Assign staff with roles (teacher, assistant, homeroom, substitute)
- **Acceptance**: classes appear in scheduling and gradebook

**4.7.3 Promotion/Rollover Wizard**
- Admin initiates for closing academic year
- System shows all students by year group with proposed next year group
- Admin can override: hold back, skip, graduate, withdraw
- Preview summary before commit
- On commit: update student year groups, close old enrolments, audit log batch
- Does NOT auto-create next year's classes (separate admin action)
- **Acceptance**: preview before commit, audit trail for entire batch

### 4.8 Scheduling

**4.8.1 Manual Schedule Management**
- Create schedule entries: class + room + teacher + weekday + time + date range
- Manual mode is always available regardless of `autoSchedulerEnabled` setting
- Delete schedule entries that have not generated any attendance sessions (hard delete). Entries with existing attendance sessions can only be end-dated (soft removal via `effective_end_date = today`).
- **Acceptance**: schedule entries created, deletable (if unused), end-datable, and visible in timetable views

**4.8.2 Conflict Detection**
- Hard conflicts (block save unless override permission + reason): room/teacher/student double-booking
- Soft conflicts (warn only): room over capacity, teacher workload threshold
- Override requires `schedule.override_conflict` permission + mandatory reason
- **Acceptance**: hard conflicts blocked by default, override audit-logged

**4.8.3 Timetable Views**
- Teacher timetable: all schedule entries for a teacher
- Room timetable: all entries for a room
- Student timetable: derived from student's active class enrolments → class schedules
- Only shows currently effective entries (date range check)
- **Acceptance**: views are accurate and reflect current schedules only

**Acceptance fixture**: Teacher SP1 has class C1 (Mon 08:00–09:00, effective 2026-01-05 to null) and class C2 (Mon 10:00–11:00, effective 2026-01-05 to 2026-03-01). Today is 2026-03-16. GET teacher timetable for SP1 → returns 1 entry (C1 only; C2 excluded because effective_end_date < today). GET teacher timetable for SP1 with `as_of_date=2026-02-15` → returns 2 entries (C1 and C2). Classes taught by other teachers never appear.

**4.8.4 Workload Reporting**
- Report showing teaching hours per staff member per week
- **Acceptance**: report reflects active schedule entries

**Acceptance fixture**: Teacher SP1 has 3 active schedule entries (Mon 08:00–09:00, Tue 08:00–09:00, Wed 08:00–10:00). `tenant_settings.scheduling.teacherWeeklyMaxPeriods = 3`. GET workload report → SP1 shows 3 periods (each entry = 1 period regardless of duration), `threshold_exceeded = false` (3 ≤ 3). If threshold were 2 → `threshold_exceeded = true`. If threshold is null → report shows hours per teacher but no threshold flag column.

**4.8.5 School Closure Management**
- Admin creates closures with date, reason, and scope (whole school, year group, or specific class)
- Bulk creation supported: date range → one closure record per date
- Closures prevent attendance session generation on affected dates
- If sessions already exist for the closure date: open sessions auto-cancelled; submitted/locked sessions flagged for admin resolution (not auto-cancelled)
- Admin with `attendance.override_closure` permission can create an ad-hoc session on a closure date with mandatory override reason
- **Acceptance**: closures suppress future session generation; existing open sessions auto-cancelled; submitted sessions require manual resolution; override path available with audit trail

**4.8.6 Attendance Session Generation**
- Sessions are generated **on-demand** when a teacher opens the attendance marking screen for a class on a date, plus a **nightly batch** safety net
- On-demand: check closures first (block if closed), then check schedule exists, then create session and pre-populate student records from active enrolments
- Nightly batch: runs at `tenant_settings.attendance.pendingAlertTimeHour`, generates sessions for all applicable schedules not already generated, skips closure dates
- Sessions not generated for dates outside the class's academic year
- **Acceptance**: sessions exist when teachers need them; exception dashboard shows all expected-but-unsubmitted sessions; closure dates produce no sessions unless overridden

### 4.8b Auto-Scheduling

The auto-scheduling module adds intelligent timetable generation to the existing manual scheduling system. It operates in three modes: **Manual** (existing — no changes), **Auto** (solver generates a complete timetable from scratch), and **Hybrid** (admin pins specific entries, solver fills everything else). The solver is a CSP (Constraint Satisfaction Problem) engine using constraint propagation + backtracking. All auto-scheduling UI is hidden when `tenant_settings.scheduling.autoSchedulerEnabled = false`.

**RTL/bilingual requirement**: All auto-scheduling UIs (period grid editor, availability grid, preference tabs, drag-and-drop timetable adjustment) must use Tailwind logical CSS utilities (no physical left/right). Weekday column headers render right-to-left in Arabic locale. Period names display `period_name_ar` when user locale is `ar`, falling back to `period_name`. All interactive grid components (drag-and-drop, click-to-select) must have correct directional behavior in RTL mode.

**4.8b.1 Period Grid Configuration**
- Admin defines the school's period structure per weekday for the academic year
- Visual grid editor: rows = periods, columns = days. Each cell shows period name, time, type.
- Quick actions: "Copy Monday to all weekdays" (then adjust Friday), "Add period to all days"
- Break/lunch periods are created here with `break_supervision` or `lunch_duty` type
- Assembly periods are created here — admin selects which year groups attend
- Validation: no overlapping periods on the same day (enforced at DB via exclusion constraint), all periods have start < end
- Requires `schedule.configure_period_grid` permission
- **Partial save**: Each period is saved individually on creation/edit. The grid persists across browser sessions — admins can configure across multiple visits.
- **Acceptance**: period grid saved and visible, supervision periods appear as schedulable slots

**4.8b.2 Class Requirements Setup**
- For each active class in the academic year, admin sets periods_per_week and scheduling constraints
- Table view: Class Name | Subject | Teacher | Periods/Week | Room Type | Preferred Room | Max Consecutive | Min Consecutive | Spread | Student Count
- Bulk edit: select multiple classes, set periods_per_week for all
- Default: 5 periods/week, no room type requirement, max 2 consecutive, min 1 consecutive, spread evenly
- Completeness indicator: "45 of 52 classes configured. 7 remaining."
- Supervision-type classes (linked to `subject_type IN ('supervision','duty')`) are configured here alongside academic classes
- Requires `schedule.configure_requirements` permission
- **Acceptance**: all classes with `subject_type = 'academic'` must have requirements before solver can run. Supervision classes are optional (solver skips supervision classes without requirements).

**4.8b.3 Teacher Availability Configuration**
- Per teacher, per academic year
- Visual weekly grid: columns = days, row = full day. Admin drags to set available window per day.
- Default: fully available all days (no rows created = available everywhere)
- Once admin sets any day, only configured days are available — others are blocked
- Clear visual distinction between "available" (green), "unavailable" (red), "not configured / fully available" (neutral)
- Requires `schedule.configure_availability` permission (school_owner only by default — HR-sensitive)
- **Acceptance**: availability honoured as hard constraints in solver

**4.8b.4 Teacher Preferences Configuration**
- Per teacher, per academic year
- Three tabs: Subject Preferences | Class Preferences | Time Preferences
- Each preference has a priority selector (low / medium / high) and a mode toggle (prefer / avoid)
- Subject tab: multi-select from school's subject list (filtered to `subject_type = 'academic'`). "Mr. Ahmed prefers: Maths, Physics (high priority). Avoids: Art (low priority)."
- Class tab: multi-select from active classes. "Ms. Sara prefers: Class 7A, Class 8B (medium priority)."
- Time tab: visual weekly grid matching the period grid. Click periods to mark as preferred (green) or avoided (red).
- Admin uses `schedule.manage_preferences` permission. Teachers use `schedule.manage_own_preferences` (can only see/edit their own).
- Banner: "Preferences are best-effort. The scheduler will try to accommodate them but cannot guarantee all preferences are met."
- **Acceptance**: preferences captured and visible to solver, priority weighting applied

**4.8b.5 Pinned Entry Management (Hybrid Mode)**
- In the timetable view, admin can click any existing manually-created schedule entry and toggle "Pin this entry"
- Pinned entries show a pin icon and a subtle visual border/background
- Pinning sets `schedules.is_pinned = true`, `schedules.source = 'pinned'`. Optional `pin_reason` text.
- Admin can also create new entries and immediately pin them — this is the "lock Mr. Ahmed to 9am Monday" flow
- Bulk pin: select multiple entries, pin all
- Requires `schedule.pin_entries` permission
- **Pin conflict detection**: Before running the solver, the system validates that pinned entries don't conflict with each other. Teacher or room double-booking between pinned entries is flagged immediately. Pinned entries outside a teacher's availability window trigger a warning: "Mr. Ahmed is pinned to Monday Period 5 but his availability ends at 12pm."
- **Acceptance**: pinned entries visually distinct, preserved when auto-scheduler runs, conflicts surfaced before solver runs

**4.8b.6 Solver Prerequisites Check**
- Before the solver can run, the system validates completeness:
  - Period grid exists for the academic year (at least 1 `teaching` period on at least 1 day)
  - All active classes with `subject_type = 'academic'` have scheduling requirements (`periods_per_week` set)
  - All academic classes have at least one assigned teacher (via `class_staff` with `assignment_role = 'teacher'`). Supervision-type classes are exempt — the solver assigns teachers to these.
  - No pinned entry conflicts (teacher or room double-booking between pinned entries)
  - No pinned entries violating teacher availability (hard block, not just warning)
  - All classes referenced in the scheduling run are still `active` (not inactive/archived)
- Missing prerequisites shown as a checklist with direct links to fix each one
- Solver button is disabled until all prerequisites are met
- Requires `schedule.run_auto` permission
- **Acceptance**: solver cannot run with incomplete inputs

**4.8b.7 Solver Execution**
- Admin selects academic year and clicks "Generate Timetable"
- Mode auto-detected: if pinned entries exist → hybrid mode. If none → auto mode. Admin can also explicitly choose.
- Confirmation dialog: "This will generate a proposed timetable for [academic year]. [N] pinned entries will be preserved. [M] class slots will be auto-assigned. Proceed?"
- BullMQ background job enqueued. Admin sees a progress screen with:
  - Real-time status: "Preparing constraints..." → "Solving (45s elapsed)..." → "Complete"
  - Live counter: "342 of 380 class slots assigned"
  - Cancel button (sets job status to failed, discards partial result)
- On completion: redirect to review screen
- On failure/timeout: show error with partial result if available. "The solver couldn't place all classes within the time limit. 12 slots remain unassigned."
- **Acceptance**: solver runs as background job, progress visible, cancellable

**Solver architecture** (CSP — Constraint Propagation + Backtracking):

The solver is a pure TypeScript module in `packages/shared/src/scheduler/`. It has no database dependencies — it takes a typed input object and returns a typed output object. The BullMQ job wrapper handles loading inputs from the database, calling the solver, and writing results.

```
packages/shared/src/scheduler/
├── types.ts              # Input/output type definitions
├── solver.ts             # CSP solver (main entry point)
├── constraints.ts        # Hard constraint checkers
├── preferences.ts        # Soft preference scoring
├── domain.ts             # Domain reduction and arc consistency
├── heuristics.ts         # Variable and value ordering
└── __tests__/
    ├── solver.test.ts    # Full solver integration tests
    ├── constraints.test.ts
    └── fixtures/         # Test school configurations
```

**Variables**: One variable per (class, period_slot) pair. If a class needs 5 periods per week, it contributes 5 variables.
**Domain**: Each variable's domain is the set of valid (weekday, period_order, room) tuples that don't violate any hard constraint.
**Constraints**: Hard constraints reduce domains. Soft constraints influence variable/value ordering heuristics.

**Solver steps**:
1. **Load inputs**: Period grid, class requirements, teacher assignments (all teachers from `class_staff`), teacher availability, room inventory, pinned entries, preferences, student overlap pairs.
2. **Pre-assign pinned entries**: Remove pinned slots from all domains. These are facts, not variables. Filter pinned entries to only currently effective ones (`effective_start_date <= today AND (effective_end_date IS NULL OR effective_end_date >= today)`).
3. **Initial domain reduction (arc consistency)**: For each variable, eliminate domain values violating hard constraints.
4. **Variable ordering heuristic (MRV)**: Select the variable with the smallest remaining domain (Most Restricted Variable). Fails fast on tightly constrained classes.
5. **Value ordering heuristic (preference-weighted)**: For the selected variable, try domain values in order of soft preference satisfaction score. Finds good solutions before backtracking.
6. **Forward checking**: After each assignment, propagate constraints to remaining variables. If any variable's domain becomes empty, backtrack immediately.
7. **Backtracking**: If no valid assignment exists, undo the last assignment and try the next value.
8. **Timeout**: Configurable maximum duration (default: 120 seconds). On timeout, returns best partial solution with `entries_unassigned > 0`.
9. **Output**: Complete assignment — one (weekday, period_order, room) tuple per variable — plus unassigned list and soft preference satisfaction score.

**Hard constraints**:

| Constraint | Description |
|------------|-------------|
| **Teacher no double-book** | A teacher cannot be assigned to two classes in the same (weekday, period_order). When a class has multiple teachers (co-teaching), ALL assigned teachers must be free. |
| **Room no double-book** | An exclusive room (`is_exclusive = true`) cannot host two classes in the same slot. Non-exclusive rooms allow concurrent use if total `student_count` of concurrent classes ≤ room `capacity`. |
| **Student group no double-book** | Two classes that share at least one active student enrolment (pre-computed in `config_snapshot.student_overlaps`) cannot occupy the same slot. This uses actual enrolment overlap, not year_group — catching cross-year elective conflicts. |
| **Teacher availability** | A class can only be placed where all assigned teachers' availability windows strictly contain the period's time range (`available_from <= start_time AND available_to >= end_time`). |
| **Room type match** | If a class has `required_room_type`, it can only be placed in a room of that type. |
| **Period type match** | Academic classes go in `teaching` periods only. Supervision subjects go in `break_supervision` or `lunch_duty` periods only. |
| **Periods per week** | Each class must be assigned exactly `periods_per_week` slots (or as many as possible if the solver can't place all). |
| **Max consecutive** | A class cannot exceed `max_consecutive_periods` consecutive teaching-type periods on the same day. Consecutive = `period_order` differs by 1 with only non-teaching periods between them. |
| **Min consecutive** | When `min_consecutive_periods > 1`, the class's periods on each scheduled day must form blocks of at least this size (except the remainder block — see `class_scheduling_requirements` definition). |
| **Pinned entries** | Pre-assigned entries are immovable. No other class can use the same (teacher, weekday, period) or (room, weekday, period) as a pinned entry. |
| **Supervision distribution** | For supervision-type classes, entries must be evenly distributed across all days that have matching `break_supervision`/`lunch_duty` periods. Exactly `ceil(periods_per_week / supervision_days_count)` entries per day. |

**Soft preferences**:

| Preference | Weight | Description |
|------------|--------|-------------|
| **Subject preference** | Configurable (low/medium/high) | Teacher prefers or avoids certain subjects. |
| **Class preference** | Configurable | Teacher prefers or avoids certain classes. |
| **Time slot preference** | Configurable | Teacher prefers or avoids certain periods/days. |
| **Even subject spread** | Global weight | Distribute a class's periods across as many distinct weekdays as possible (if `spread_preference = 'spread_evenly'`). |
| **Minimise teacher idle gaps** | Global weight | Reduce free periods between a teacher's first and last class of the day. |
| **Room consistency** | Global weight | When a class has a `preferred_room_id`, assign that room if available. |
| **Workload balance** | Global weight | Distribute total periods evenly across teachers. |

**Fitness function**: `score = Σ(satisfied_preference × weight) / Σ(all_preference × weight)` — produces a 0–100% satisfaction score.

**Performance targets**: For a school with 40 teachers, 80 classes, 15 rooms, 35 teaching periods per week → ~2,800 variables. The CSP solver with forward checking should solve this in under 30 seconds. Schools with 100+ classes may approach the 120-second timeout, producing a near-complete solution. **Memory recommendation**: Worker ECS task should have at least 2GB memory for solver instances. The initial domain size (variables × domain values) is held in memory during solving.

**Determinism**: The solver uses a seeded random number generator for tie-breaking. The seed is stored in `scheduling_runs.solver_seed` and `config_snapshot.settings.solver_seed`. All database queries that feed the solver must use `ORDER BY` clauses to ensure deterministic input ordering regardless of worker instance.

**Closure-unaware by design**: The solver generates a weekly recurring pattern and is unaware of specific closure dates. Closures are handled downstream by the attendance session generation system (which skips closure dates). This is intentional — the timetable pattern is independent of individual closure dates.

**4.8b.8 Proposed Timetable Review**
- The proposed timetable is rendered from `scheduling_runs.result_json` (and `proposed_adjustments` if any) — **not** from the `schedules` table. This is a dedicated review UI, not the existing timetable views, because proposed entries don't exist in the database yet.
- Prominent "PROPOSED — Not Yet Applied" banner
- Two visual states for entries: pinned (solid, pin icon) and auto-generated (dashed border, lighter background)
- Side panel: **Constraint Report**
  - Hard constraint violations: should be 0 for a completed run. If partial, shows exactly what couldn't be placed and why.
  - Soft preference satisfaction: "87% of teacher preferences satisfied" with breakdown per teacher
  - Unassigned slots: list of classes with remaining unplaced periods and the blocking reason
  - Teacher workload summary: periods per teacher, flagging imbalance
- Requires `schedule.view_auto_reports` permission to view constraint report details
- Teachers with `schedule.view_own_satisfaction` can view their own preference satisfaction from the teacher dashboard
- **Acceptance**: admin can review full proposed timetable before committing

**Manual adjustments to proposed timetable**:
- Before applying, admin can make manual swaps within the proposed timetable
- Drag-and-drop: move a class from one slot to another. System validates hard constraints in real time.
- "Swap" action: select two entries and swap their slots. Both validated.
- "Remove" action: remove an auto-generated entry from a slot (leaves slot empty — reduces assigned count)
- "Add" action: manually place a class in an empty slot (the unassigned list updates)
- Each adjustment re-validates the full constraint set and updates the preference satisfaction score
- **Adjustments are server-persisted incrementally**: Each operation sends a PATCH to `scheduling_runs.proposed_adjustments`. If the browser crashes, all prior adjustments survive. The admin can return to the review screen and continue editing.
- **Acceptance**: manual adjustments validated in real time, constraint report updates live, crash-resilient

**4.8b.9 Apply or Discard**
- **Apply**: Creates schedule entries in the `schedules` table from the final proposed timetable (result_json + proposed_adjustments merged).
  - Requires `schedule.apply_auto` permission. Non-school_owner users routed through approval workflow if `tenant_settings.scheduling.requireApprovalForNonPrincipal = true`.
  - **Concurrency guard**: The apply operation uses `SELECT ... FOR UPDATE` on the `scheduling_runs` row, ensuring only one apply transaction proceeds if two admins click simultaneously. The second transaction blocks until the first completes, then sees `status = 'applied'` and aborts with `SCHEDULER_RUN_NOT_COMPLETED` error.
  - Before insert: existing `source = 'auto_generated'` entries for the academic year are handled per the deletion rule — entries without attendance sessions are hard-deleted, entries with attendance sessions are end-dated (`effective_end_date = today`).
  - Pinned entries (`is_pinned = true`) are preserved — never deleted or modified.
  - New auto-generated entries inserted with: `source = 'auto_generated'`, `is_pinned = false`, `scheduling_run_id` set to the run ID, `effective_start_date` = the later of today or the academic year's start date, `effective_end_date = NULL` (open-ended), `start_time`/`end_time`/`weekday`/`period_order` copied from the result, `schedule_period_template_id` linked to the matching period template, `academic_year_id` from the scheduling run, `created_by_user_id` from the applying admin's user ID.
  - Single transaction: delete/end-date old auto entries + insert new entries + update run status to `applied`.
  - Audit log entry with the run ID.
  - **Period grid drift guard**: Before applying, the system validates that the period grid has not changed since the run was created (compare `config_snapshot.period_grid` against current `schedule_period_templates`). If changes are detected, apply is blocked with `SCHEDULER_PERIOD_GRID_CHANGED` error — admin must re-run the solver.
  - **Class status guard**: Before applying, validate all classes in the result are still `active`. Inactive classes are excluded from insertion and listed as warnings.
- **Discard**: Run status → `discarded`. No schedule changes. Admin can re-run with different preferences.
- Only one `applied` run per academic year is the "current" timetable. Applying a new run replaces the previous auto-generated entries.
- **Acceptance**: apply is atomic, pinned entries preserved, old auto entries safely replaced, concurrent apply prevented

**4.8b.10 Re-Run After Changes**
- After applying, if the admin changes teacher availability, adds a new class, or modifies requirements, they can re-run the solver
- The re-run loads current pinned entries (including any manually pinned after the last run) and regenerates everything else
- Previous applied run is preserved as historical record (status stays `applied`)
- **Staleness detection**: The system tracks `class_staff` changes, availability changes, requirement changes, and preference changes since the last applied run. If any changes exist, the scheduling dashboard shows: "Configuration has changed since the last applied run. Consider re-running the scheduler."
- **No rollback**: Applied runs are terminal. To fix an applied timetable, the admin must re-run the solver or make manual adjustments. This is documented in the UI: "Applying is permanent. To change the timetable after applying, re-run the scheduler or edit entries manually."
- **Acceptance**: re-runs are safe, previous results preserved for audit

**4.8b.11 Scheduling Dashboard**

**Assignment Overview**:
- Total class slots to fill: [N]
- Assigned (pinned): [P], Assigned (auto): [A], Unassigned: [N - P - A]
- Completion percentage with progress bar
- If a solver run exists: last run date, mode, satisfaction score, duration
- Staleness indicator if configuration changed since last applied run

**Teacher Workload View**:
- Table: Teacher Name | Total Periods | Teaching Periods | Supervision Periods | Max Capacity | Utilisation %
- Sortable by any column
- Colour coding: green (within normal range), amber (approaching max), red (exceeds `teacherWeeklyMaxPeriods`)
- Click teacher name → opens their timetable view
- **Acceptance**: workload visible at a glance, imbalances flagged

**Unassigned Classes View**:
- Table: Class Name | Subject | Periods Needed | Periods Assigned | Remaining | Blocking Reason
- Only shows classes with `remaining > 0`
- Blocking reason from solver output
- Click class → highlights available slots in the timetable where this class could be manually placed
- **Acceptance**: admin can see what's missing and why

**Preference Satisfaction Report**:
- Per-teacher breakdown: Teacher Name | Preferences Set | Satisfied | Not Satisfied | Score %
- Expand teacher row to see each preference and its outcome
- Requires `schedule.view_auto_reports` permission (admin) or `schedule.view_own_satisfaction` (teacher, own data only)
- **Acceptance**: transparent reporting on preference outcomes

**Run History**:
- Table of all scheduling runs for the academic year
- Columns: Date | Mode | Status | Classes Assigned | Unassigned | Preference Score | Duration | Applied By
- Query excludes `config_snapshot` and `result_json` JSONB columns for performance (loaded only on detail view)
- Click to view the snapshot of that run's proposed timetable (read-only)
- **Acceptance**: full audit trail of all solver runs

### 4.9 Attendance

**4.9.1 Class Attendance Marking**
- Teacher marks attendance for assigned class sessions
- Bulk "mark all present" + adjust exceptions
- Submit session
- **Acceptance**: attendance recorded per student per session

**4.9.2 Historical Amendments**
- Admin amends past attendance records
- Requires `attendance.amend_historical` permission
- Mandatory amendment reason
- Original status preserved in `amended_from_status`
- **Acceptance**: amendment audit trail complete, original status visible

**4.9.3 Derived Daily Summaries**
- Computed after any attendance submission or amendment
- Aggregates all sessions for a student on a date
- Only counts sessions where student was enrolled
- **Acceptance**: summaries accurate, handle partial attendance

**4.9.4 Exception Dashboard**
- Surfaces: pending attendance (sessions not yet submitted), students with excessive absences
- Daily background job identifies unsubmitted sessions
- **Acceptance**: operational visibility into attendance gaps

**Acceptance fixture**: Date 2026-03-16 (Monday). Class C1 has Monday schedule — session generated, status `open` (teacher hasn't submitted). Class C2 has Monday schedule — session generated, status `submitted`. Class C3 has Monday schedule — session not yet generated (neither teacher nor nightly batch). Student S1 has 8 absences in last 20 school days. Expected: "Pending attendance" section shows C1 (open, not submitted) and C3 (expected but not generated); C2 does not appear (already submitted). "Excessive absences" section shows S1 with absence count 8/20 (displayed as count and percentage).

**4.9.5 Parent Attendance Visibility**
- If `tenant_settings.general.attendanceVisibleToParents = true`:
  - Parent can view their student's attendance records and daily summaries
- **Acceptance**: parent sees only their linked students' attendance

### 4.10 Gradebook and Report Cards

**4.10.1 Grading Scale Configuration**
- Create grading scales (numeric ranges, letter grades, custom)
- Scales are immutable once assessments are graded against them
- **Acceptance**: scale changes blocked when in use

**4.10.2 Assessment Categories and Weights**
- Create categories with default weights
- Configure per-class-subject weight overrides
- Weights normalized to 100% at calculation time if they don't sum to 100%
- Warning shown to teacher when weights don't sum to 100%
- **Acceptance**: weights calculated correctly, normalization transparent

**4.10.3 Assessment Creation and Grade Entry**
- Teachers create assessments within assigned classes
- Enter grades per student
- `is_missing` flag for non-submissions
- Grade comments (optional or required per tenant setting)
- **Acceptance**: grades recorded accurately, missing grades handled per policy

**4.10.4 Period Grade Computation**
- Compute weighted average per student per subject per period
- Apply grading scale to determine display value
- Missing grades: excluded or zero per tenant setting
- Snapshot result in `period_grade_snapshots`
- **Acceptance**: computation accurate, snapshot preserved

**4.10.5 Grade Override Workflow**
- Authorised user overrides display value on period grade snapshot
- Mandatory reason and override actor recorded
- Computed value preserved
- **Acceptance**: override visible, original computation retained

**4.10.6 Report Card Generation**
- Generate from period grade snapshots + attendance summary + comments
- Freeze as `snapshot_payload_json`
- Status: draft → published
- Published report cards are immutable
- **`template_locale` selection**: Determined by the student's household's primary billing parent's `preferred_locale`, falling back to `tenant.default_locale`, then `'en'`. Set at generation time and frozen in the snapshot. Admin can override locale before publishing.
- **Acceptance**: published cards never silently change

**4.10.7 Report Card Revision**
- Correction needed after publication: create new report card with `revision_of_report_card_id`
- Original marked as `revised`
- Parent sees latest version, revision history accessible
- **Query contract**: Default list and detail endpoints exclude report cards with `status = 'revised'`. The latest published report card for a student+period is the one where `status = 'published'` (the revision). Admin endpoints accept `?include_revisions=true` to show the full revision chain. Parent-facing endpoints never show revised (superseded) cards.
- **Acceptance**: revision chain visible to admins, original preserved, parents always see latest version only

**4.10.8 Report Card Locale Templates**
- Separate English and Arabic templates
- Template selection based on `template_locale`
- On-demand PDF rendering via Puppeteer
- **Acceptance**: correct template used, rendering produces valid PDF

**4.10.9 Academic Transcript Generation**

A transcript is a **purely generated view** — it has no stored entity, no database table, no snapshot, and no version history. It is rendered on demand from `period_grade_snapshots` and related data.

**Data aggregation query**:
```sql
SELECT
  ay.name AS academic_year,
  ay.start_date,
  ap.name AS period_name,
  ap.period_type,
  s.name AS subject_name,
  s.code AS subject_code,
  pgs.computed_value,
  pgs.display_value,
  pgs.overridden_value,
  yg.name AS year_group_name
FROM period_grade_snapshots pgs
JOIN academic_periods ap ON pgs.academic_period_id = ap.id
JOIN academic_years ay ON ap.academic_year_id = ay.id
JOIN subjects s ON pgs.subject_id = s.id
JOIN classes c ON pgs.class_id = c.id
JOIN year_groups yg ON c.year_group_id = yg.id
WHERE pgs.student_id = {student_id}
  AND pgs.tenant_id = {tenant_id}
ORDER BY ay.start_date ASC, ap.start_date ASC, s.name ASC
```

**Inclusion rules**:
1. A `period_grade_snapshot` is included only if a published report card exists for that student + period combination. Draft report card data is excluded. If a report card has `status = 'revised'` (superseded by a newer version), the transcript uses the `period_grade_snapshots` associated with the **latest published revision** in the chain (i.e., the report card where `status = 'published'` that traces back via `revision_of_report_card_id`). The superseded original's data is never used if a revision exists.
2. If `overridden_value` is non-null, the transcript displays the override. The computed value is not shown on transcripts.
3. Every academic year the student has published report card data for is included, regardless of whether the academic year is active, closed, or from a prior enrolment.
4. If a student dropped a class mid-period and has no grades, the subject is excluded for that period. If they have partial grades and a snapshot exists, it is included.
5. Only data within the current tenant is included. Cross-tenant transcript data is a deferred feature.

**Correction handling**: Since the transcript is a generated view, corrections flow through existing mechanisms. Grade correction → revise the report card (new report_card with `revision_of_report_card_id`); the revised snapshot is picked up. Override correction → new override on the `period_grade_snapshot` replaces the old one. There is no transcript-specific correction flow.

**Render payload** (Puppeteer template input):
```typescript
{
  student: {
    full_name: string,
    student_number: string | null,
    date_of_birth: string,
    current_year_group: string
  },
  school: {
    name: string,
    logo_url: string | null
  },
  generated_at: string,  // ISO 8601 timestamp
  academic_history: Array<{
    academic_year: string,
    year_group: string,
    periods: Array<{
      period_name: string,
      subjects: Array<{
        subject_name: string,
        subject_code: string | null,
        display_value: string  // overridden_value ?? display_value
      }>
    }>
  }>
}
```

**Access control**: `transcripts.generate` permission required for admin-tier access. Parents access transcripts via the `parent.view_transcripts` permission (included in the default `parent` system role), scoped to their linked students only. The transcript endpoint accepts either permission: `@RequirePermission('transcripts.generate', 'parent.view_transcripts')` — the guard checks that at least one is present, and the parent-tier permission additionally enforces the student-link scope check. Transcript is cached in Redis for 5 minutes (key: `transcript:{tenant_id}:{student_id}`, TTL: 300s). Cache is invalidated on `report_card.published` and `period_grade_snapshot` override events for the affected student. On cache miss, the full query executes and the result is cached before returning.

- **Acceptance**: transcript contains complete academic history sourced from published report card snapshots only, renders correctly in both locales, corrections via report card revision are reflected immediately

**4.10.10 Exam Results Bulk Import**
- CSV upload: student identifier, subject, assessment title, score
- System matches students and assessments
- Unmatched rows flagged in validation
- Admin reviews matches before processing
- **Acceptance**: matched grades imported, errors clearly reported

### 4.11 Finance

**4.11.1 Fee Structures and Discounts**
- Create fee structures with amount, billing frequency, optional year group link
- Create discounts (fixed or percentage)
- **Acceptance**: structures and discounts available for assignment

**4.11.2 Fee Assignment**
- Assign fee structures to households, optionally per student
- Optionally attach one discount per assignment
- **Acceptance**: assignments appear in fee generation

**4.11.3 Fee Generation Wizard**
- Select period + year groups + fee structures
- System previews: households × fee lines, discounts applied
- Admin reviews, can exclude households
- Confirm → create draft invoices in batch
- Check for existing invoices to prevent duplicates. **Duplicate detection key**: `(household_id, fee_structure_id, billing_period_start_date, billing_period_end_date)` — where `billing_period_start_date` and `billing_period_end_date` are derived from the selected academic period for term/semester fees, or from the calendar month for monthly fees, or from the assignment's `effective_from` for one-off fees. The check queries `invoice_lines` joined to `invoices` to find matching combinations regardless of invoice status (excluding `void` and `cancelled`)
- Block generation for households without billing parent
- **Acceptance**: draft invoices created correctly, duplicates caught, billing parent required

**4.11.4 Invoice Management**
- Invoice lifecycle: draft → pending_approval → issued → partially_paid → paid / overdue / void / written_off / cancelled
- `draft → cancelled` (admin cancels a draft invoice before issuance; e.g., created in error during fee generation). Only allowed while invoice is in `draft` or `pending_approval` status. Cancelled invoices are excluded from household statements and fee generation duplicate detection.
- Issue date set on issuance
- Approval required if `tenant_settings.finance.requireApprovalForInvoiceIssue = true`
- **Status derivation**: Invoice status is always derived from `balance_amount`, `due_date`, and payment history via a deterministic `deriveInvoiceStatus()` function
- **Synchronous re-derivation**: Status is recomputed synchronously on every payment allocation, refund execution, and write-off — not just by nightly job
- **Overdue detection**: Nightly BullMQ job (01:00 in tenant timezone) transitions `issued` or `partially_paid` invoices past due date to `overdue`. Also serves as safety net for missed real-time checks. Notification sent to billing parent on first transition only (tracked via `last_overdue_notified_at`). The transition uses an atomic check-and-set: `UPDATE invoices SET last_overdue_notified_at = now(), status = 'overdue' WHERE id = :id AND status IN ('issued','partially_paid') AND due_date < CURRENT_DATE AND last_overdue_notified_at IS NULL RETURNING id`. If no row is returned, the transition was already applied (by a concurrent job or real-time event) and the notification is skipped
- **Terminal states**: `paid`, `void`, `written_off`, `cancelled` — no transitions out
- **Acceptance**: lifecycle enforced, approval gating works, overdue detection automatic, status always consistent with balance

**4.11.5 Installment Plans**
- Create installments linked to invoice with due dates and amounts
- Track installment status (pending / paid / overdue)
- **Validation rule**: `SUM(installments.amount)` for an invoice must equal `invoice.total_amount`. Enforced on installment creation and update. Returns `INSTALLMENT_SUM_MISMATCH` error code on violation.
- **Acceptance**: installments sum to invoice total, statuses tracked

**4.11.6 Payment Recording**
- Record payments with method (Stripe, cash, bank transfer, manual card)
- Stripe: created via checkout flow, confirmed via webhook
- Manual: finance staff records with reference
- **Acceptance**: payment recorded with correct method and reference

**4.11.7 Payment Allocation (Option C: Auto-FIFO + Manual)**
- On payment recording, auto-suggest FIFO allocation (oldest unpaid invoices first)
- Finance staff reviews, adjusts allocations
- Confirm → allocations created, invoice statuses and balances updated
- SUM(allocations) cannot exceed payment amount
- Per-invoice allocation cannot exceed remaining balance
- Unallocated remainder flagged for admin action (no automatic credit ledger)
- **Cross-period allocations allowed**: a payment can be allocated to invoices from any academic period
- **Acceptance**: allocations accurate, over-allocation blocked, unallocated funds visible on dashboard

**4.11.8 Receipt Generation**
- Auto-generated on payment posting
- Immutable receipt number
- On-demand PDF rendering via locale-specific template
- **Acceptance**: receipt number immutable, PDF renders correctly

**4.11.9 Refund Workflow**
- Create refund request linked to payment
- Amount cannot exceed unrefunded portion of payment
- Approval required if approval workflow configured for `payment.refund`
- On execution: process via Stripe (if original was Stripe) or record manually
- Separate refund record — payment record not modified
- **LIFO allocation reversal**: Refund amount deducted from payment's allocations in LIFO order (most recent allocation first, determined by `payment_allocations.created_at`). Payment-global, not operator-chosen. Reversal mechanics: if the remaining refund amount fully covers an allocation, the allocation row is **deleted**. If the remaining refund amount is less than the allocation amount, the allocation's `allocated_amount` is **reduced** by the remainder (partial reduction, not deletion). After all reversals, affected invoices' `balance_amount` is recomputed as `total_amount - SUM(remaining allocations for that invoice)` and status is re-derived via `deriveInvoiceStatus()`.
- **Refund from unallocated funds**: If payment has unallocated remainder, refund deducts from unallocated portion first before triggering allocation reversal
- **Refund guards**: Blocked if would create logically impossible state. Refund against `void` invoice blocked. Refund against `written_off` invoice blocked unless user has `finance.override_refund_guard` permission with mandatory reason.
- **Installment re-derivation**: After refund, installment statuses are re-derived chronologically from remaining allocations
- **Acceptance**: refund tracked separately, LIFO reversal automatic, amount constraints enforced, guards prevent invalid states

**4.11.10 Write-Off**
- Admin writes off invoice balance
- Records `write_off_amount` and `write_off_reason`
- Invoice status → `written_off`, balance zeroed
- Audit-logged
- **Acceptance**: write-off preserved in records, visible in reports

**4.11.11 Household Statement**
- View all invoices, payments, allocations, refunds for a household
- Running balance
- Printable/exportable
- **Acceptance**: statement is accurate, running balance correct

**4.11.12 Stripe Webhook Processing**
- Verify webhook signature
- Check `external_event_id` for idempotency
- Process: payment confirmation, payment failure, refund status
- Advisory lock during processing to prevent race conditions
- **Acceptance**: duplicate webhooks ignored, late webhooks reconciled

### 4.12 Payroll

**4.12.1 Staff Compensation Configuration**
- Principal defines compensation packages per staff member via a dedicated compensation management screen
- Two types: **salaried** (monthly base salary + bonus day multiplier) and **per-class** (per-class rate + assigned class count + bonus class rate)
- Compensation records have an effective date; updating creates a new record and auto-closes the previous one
- Rates table shows all staff with their current compensation type, rate/salary, bonus configuration, and effective date
- Bulk import supported via CSV (import type: `staff_compensation`)
- **Acceptance**: compensation records created with correct validation per type, only one active record per staff at a time

**4.12.2 Create Payroll Run**
- Principal creates a new payroll run for a calendar month
- System enforces one run per month per tenant (duplicate blocked)
- Principal enters: period label (e.g., "March 2026") and total working days for the month (school-wide)
- On creation, system auto-populates entries for all active staff with active compensation records
- Each entry snapshots the staff member's current rates from `staff_compensation`
- Run created in `draft` status
- **Acceptance**: run created with all active staff pre-populated, rates snapshotted, duplicate month blocked

**4.12.3 Edit Draft Payroll Run — Salaried Staff**
- For each salaried staff entry, principal enters `days_worked`
- System calculates in real-time: `daily_rate`, `basic_pay`, `bonus_pay`, `total_pay` using the salaried formula
- If `days_worked` ≤ `total_working_days`: pro-rata basic pay, no bonus
- If `days_worked` > `total_working_days`: full base salary as basic pay + bonus at `daily_rate × bonus_day_multiplier × extra_days`
- Principal can add optional notes per entry
- **Acceptance**: calculations update live as values are entered, formulas applied correctly

**4.12.4 Edit Draft Payroll Run — Per-Class Staff**
- If `tenant_settings.payroll.autoPopulateClassCounts = true` AND attendance module is enabled: `classes_taught` is pre-populated from **attendance sessions** — count of sessions with status IN ('submitted','locked') where the scheduled teacher matches the staff member and `session_date` falls within the payroll month. Before counting, the system enqueues a BullMQ job to trigger batch session generation for all past/current dates in the payroll month to ensure completeness. This batch generation: (1) skips closure dates (same as nightly batch), (2) uses the existing `INSERT ... ON CONFLICT DO NOTHING` idempotency pattern, (3) runs asynchronously — the auto-populated count is snapshotted after the batch job completes. If the batch job is still running when the principal opens the draft, a "Session generation in progress — class counts may update" banner is shown. The frontend polls `GET /api/v1/payroll/runs/{run_id}/session-generation-status` every 10 seconds while the banner is visible, with a maximum polling duration of 120 seconds (12 attempts). The endpoint returns `{ status: "running" | "completed" | "failed", updated_entry_count: number, started_at: ISO8601 }`. On `completed`, the frontend refreshes the entry list to show updated `auto_populated_class_count` values and dismisses the banner. On polling timeout (120 s without `completed`/`failed`), the banner changes to "Session generation is taking longer than expected — class counts may still update. You can continue editing or refresh later." and polling stops. The backend job itself has a 5-minute hard timeout enforced by BullMQ job options (`timeout: 300_000`); on timeout the job fails and the status endpoint returns `failed`. The batch job dispatches a domain event on completion that triggers a re-snapshot of `auto_populated_class_count` for affected entries.
- The auto-populated count is a **snapshot** taken at entry generation/refresh time, not a live query. If attendance is submitted after payroll draft creation, the count does not auto-update — principal must manually refresh entries.
- If attendance module is disabled: auto-population is silently skipped; principal enters `classes_taught` manually.
- Original auto-populated value preserved in `auto_populated_class_count` for audit.
- Principal can override `classes_taught` to reflect actual classes delivered (e.g., substitute adjustments). On refresh, if manual override is in effect, only `auto_populated_class_count` updates; a warning is shown if the new auto count differs from the existing override.
- **Substitute handling**: Auto-population credits the scheduled teacher of record. If a substitute delivered classes, principal manually adjusts both teachers' `classes_taught` and documents in `notes`. Acceptable for v1; operationally dependent on manual review.
- System calculates in real-time using the per-class formula
- If `classes_taught` ≤ `assigned_class_count`: basic pay only (paid for actual classes)
- If `classes_taught` > `assigned_class_count`: basic pay for assigned count + bonus pay for extra classes at `bonus_class_rate`
- No minimum guarantee — per-class staff are paid only for classes taught
- **Acceptance**: auto-population works from submitted attendance data, snapshot semantics enforced, override preserved, substitute adjustments documented

**4.12.5 Payroll Run Summary Review**
- Before finalising, principal sees a summary screen showing all staff in the run
- Columns: Staff Name | Type (Salaried/Per-Class) | Basic Pay | Bonus Pay | Total Pay
- Footer row with: Total Headcount | Total Basic Pay | Total Bonus Pay | Grand Total Pay
- Sortable by any column, filterable by compensation type
- This is the "confirm before finalise" screen
- **Query optimisation**: The summary screen data is loaded via a single query joining `payroll_entries` → `staff_profiles` → `users`, returning all entries for the run. This is NOT implemented as N individual preview endpoint calls. For large staff counts (100+), the query uses `SELECT ... ORDER BY` with server-side pagination if needed.
- **Acceptance**: summary matches individual entry calculations, totals correct

**4.12.6 Payroll Run Finalisation**
- If actor holds `school_owner` role: finalise directly (no approval required)
- If actor does NOT hold `school_owner` role and `tenant_settings.payroll.requireApprovalForNonPrincipal = true`: approval request created with `action_type = 'payroll.finalise'`, routed to a user with `school_owner` role. Run status → `pending_approval`. On approval → finalised. On rejection → returns to `draft`.
- On finalisation: all entries frozen (snapshot immutability), run totals computed, payslips auto-generated for all entries, audit log entry created
- **Once finalised, a payroll run and all its entries and payslips are immutable. No recalculation, no editing.**
- **Acceptance**: principal can finalise directly, non-principal requires approval, immutability enforced

**4.12.7 Payslip Generation**
- Payslips are auto-generated on payroll finalisation for all entries in the run
- Each payslip captures a complete `snapshot_payload_json` containing all data needed for rendering (staff details, period, rates, inputs, calculations, school branding)
- Payslip numbers generated via `tenant_sequences` with `SELECT ... FOR UPDATE` locking
- Locale-specific templates: English and Arabic (same pattern as report cards and invoices)
- **Individual payslip PDF**: Rendered on demand via Puppeteer from `snapshot_payload_json`. Streamed to client, not stored.
- **Mass payslip PDF**: Single consolidated PDF with all payslips in the run, one per page with page breaks. Rendered via Puppeteer as a background BullMQ job (payload includes `tenant_id` and `payroll_run_id`). Streamed on completion.
- **Acceptance**: payslips generated with correct numbers, rendering produces valid PDFs, mass export works for 60+ staff

**4.12.8 Individual Staff Payment History**
- Clicking into a staff member from the payroll dashboard shows a table of all their payroll entries across all finalised runs
- Columns: Month | Period Label | Basic Pay | Bonus Pay | Total Pay | Payslip (print button)
- Each row's print button renders the payslip PDF for that month on demand
- No mass print from this view — individual month printing only
- **Acceptance**: history shows all months, payslip links work, data from immutable snapshots

**4.12.9 Mid-Month Rate Change Handling**
- Rate changes to `staff_compensation` take effect on the current payroll run (not deferred to next month)
- If a draft payroll run exists for the current month: the principal must manually refresh entries to pick up new rates (explicit action, not automatic) or the new rates apply when the run is created
- If a payroll run is already finalised: the old rates are preserved in the snapshot. The new rates will appear in the next month's run.
- **Acceptance**: rate changes reflected in current draft run on refresh, finalised runs untouched

**4.12.10 Payroll Run Cancellation**
- Draft runs can be cancelled (status → `cancelled`)
- Cancelled runs free up the month for a new run
- Finalised runs cannot be cancelled
- **Acceptance**: cancellation allowed only in draft, month freed for re-creation

### 4.13 Communications

**4.13.1 Announcement Drafting and Targeting**
- Create announcement with title, rich text body (TipTap), scope and targets
- Save as draft
- **Acceptance**: announcement saved with correct targeting

**4.13.2 Scheduled Announcements**
- Set `scheduled_publish_at` for future publication
- BullMQ delayed job handles publication at scheduled time
- **Acceptance**: announcement publishes at scheduled time

**4.13.3 Approval-Gated Publish**
- If `tenant_settings.communications.requireApprovalForAnnouncements = true`:
  - Publish requires approval
  - Requester cannot approve own request
- **Acceptance**: approval required, self-approval blocked

**4.13.4 Announcement Publishing and Delivery**
- On publish: resolve audience (scope → students → parents → users)
- Create notification records per resolved user
- Dispatch via BullMQ in batches of 100
- Each notification records `source_entity_type` and `source_entity_id` (e.g., `announcement` + announcement ID) for delivery audit traceability
- Each notification respects user's communication preferences
- **Acceptance**: all targeted users notified, preferences respected, delivery audit can trace notifications back to source

**4.13.5 WhatsApp-to-Email Fallback**
- WhatsApp send fails → check if parent has email → send email
- Invalid locale template for WhatsApp → block WhatsApp, send email
- Both unavailable → in-app notification if account exists → mark failed, surface to admin
- **Acceptance**: fallback chain works automatically, admin sees failures

**4.13.6 Notification Delivery Audit**
- All notification statuses tracked: queued → sent → delivered → read / failed
- Delivery status visible to school admin
- Failed notifications surfaced in dashboard
- **Acceptance**: admin can see delivery outcomes for all notifications

### 4.14 Parent Inquiry System

**4.14.1 Parent Submits Inquiry**
- Parent creates inquiry with subject and message, optionally linked to a student
- Status: open
- All admin users with `inquiries.view` permission notified
- **Acceptance**: inquiry created, admins notified

**4.14.2 Admin Responds**
- Any admin with permission can reply
- Reply author stored internally
- Parent sees reply as from "School Administration" (author hidden)
- Admin sees actual author name
- On first admin reply: inquiry status auto-transitions from `open` to `in_progress`
- **Acceptance**: admin identity hidden from parent, visible to other admins, status transitions automatically

**4.14.3 Multi-Turn Conversation**
- Parent and admin can exchange messages while inquiry is not closed
- Either party can add messages
- **Acceptance**: conversation flows naturally, all messages visible in thread

**4.14.4 Inquiry Closure**
- Admin closes inquiry (status: closed)
- No further messages after closure
- **Acceptance**: closed inquiries are read-only

**4.14.5 Stale Inquiry Detection**
- Background job flags inquiries with status IN (`open`, `in_progress`) that have had no new messages for longer than `tenant_settings.general.inquiryStaleHours`
- Surfaced on admin dashboard
- **Acceptance**: stale inquiries visible for admin action (both unanswered and stalled conversations)

### 4.15 Website CMS

**4.15.1 Page Management**
- Create pages: home, about, admissions, contact, custom
- Draft/published/unpublished status
- Rich text body (TipTap) with BiDi support
- HTML sanitised via DOMPurify on save
- **Acceptance**: pages manageable, content safe

**4.15.2 Homepage Enforcement**
- One published homepage per tenant per locale
- Publishing new homepage unpublishes old one
- **Acceptance**: always one active homepage

**4.15.3 Navigation Ordering**
- `show_in_nav` and `nav_order` control public site navigation
- **Acceptance**: navigation reflects configured order

**4.15.4 Custom Domains**
- Public site accessible via custom domain (configured in platform admin)
- **Acceptance**: custom domain resolves correctly to school's public site

**4.15.5 Contact Form**
- Public contact form on contact page
- Rate limited: 5 submissions per IP per hour
- Honeypot spam protection
- Submissions visible to admin (new / reviewed / closed / spam)
- **Acceptance**: form submissions captured, spam mitigated

**4.15.6 Locale Readiness**
- `locale` column on `website_pages`
- Phase 1: only English content exposed
- Schema ready for bilingual pages in future
- **Acceptance**: locale column present, unique constraint on (tenant_id, slug, locale)

### 4.16 Search

**4.16.1 Global Search**
- Search bar accessible from any authenticated page
- Queries Meilisearch with tenant_id filter
- Post-filters by user permissions
- Returns: students, parents, staff, households, invoices, applications
- **Acceptance**: results tenant-safe and permission-scoped

**4.16.2 Fuzzy Matching**
- Meilisearch provides fuzzy matching for names and identifiers
- **Acceptance**: typo-tolerant search works for names

**4.16.3 Meilisearch Fallback**
- If Meilisearch unavailable → fall back to PostgreSQL ILIKE + tsvector
- Transparent to user (may be slower)
- **Acceptance**: search works (degraded) when Meilisearch is down

### 4.17 Offline Read-Only Cache

**4.17.1 Cached Operational Views**
- PWA caches key operational views (timetable, class roster, recent announcements)
- Read-only — no offline writes
- Locale and font bundles cached
- **Acceptance**: cached views accessible offline, data is stale but functional

### 4.18 Compliance, Retention, and Export

**4.18.1 Access Export**
- Export all data associated with a subject (parent, student, household)
- Excludes internal-only content
- **Acceptance**: export contains all subject-visible data

**Acceptance fixture**: Parent P1 linked to household H1, students S1 and S2. H1 has 3 invoices, 2 payments, 1 inquiry thread (with admin responses). P1 has communication preferences, email, phone, WhatsApp number. Audit log has 5 entries mentioning P1's user_id. Expected output: `{ personal_data: { name, email, phone, whatsapp_phone, preferred_channels }, household: { name, address, emergency_contacts }, students: [S1 { name, dob, year_group, attendance_summary, grades, report_cards }, S2 { ... }], financial: { invoices: [3 summaries], payments: [2 summaries] }, inquiries: [{ subject, messages (excluding admin author names), status }] }`. Excluded: audit log entries, internal notes, admin author identities on inquiry responses.

**4.18.2 Erasure/Anonymisation Workflow**
- Compliance request submitted → classified → approved → executed
- Finance, grades, attendance, report cards, audit: anonymised, not deleted
- Anonymisation is idempotent and resumable
- **Acceptance**: personal identifiers removed, records retained for legal basis

**4.18.3 Audit Log Viewer**
- School admin: searchable audit log for their tenant
- Platform owner: cross-tenant audit log
- Filter by: entity type, actor, date range, action
- **Acceptance**: audit entries searchable and filterable

### 4.19 Reports and Analytics

**4.19.1 Student Promotion/Rollover Report**
- Summary of rollover batch: promoted, held back, graduated, withdrawn
- **Acceptance**: report matches rollover execution

**4.19.2 Fee Generation Run Report**
- Summary of fee generation: invoices created, amounts, households affected
- **Acceptance**: report matches generation run

**4.19.3 Household Ledger/Statement**
- Complete financial history per household
- **Acceptance**: accurate running balance

**4.19.4 Teacher Workload Report**
- Teaching hours per staff member per week
- **Acceptance**: reflects current active schedules

**4.19.5 Admissions Funnel Analytics**
- Application counts by status, conversion rates, time in each stage
- **Acceptance**: funnel reflects actual application data

**4.19.6 Attendance Exception Dashboard**
- Students with excessive absences, pending sessions, late submissions
- **Acceptance**: exceptions surfaced accurately

**4.19.7 Student/Household Export Pack**
- Exportable student data: profile, attendance, grades, report cards
- **Acceptance**: complete export for each student. See Section 4.6.6 acceptance fixture for exact output structure and exclusion rules.

**4.19.8 Write-Off/Scholarship Adjustment Reporting**
- Write-offs by period, amount, reason
- Discount/scholarship impact reporting
- **Acceptance**: financial adjustment visibility

**4.19.9 Notification Delivery Audit Report**
- Delivery rates by channel, failure reasons, template usage
- **Acceptance**: communication effectiveness visible

**4.19.10 Allergy Report**
- Students with `has_allergy = true`, filterable by class/year group
- Columns: student name, class, allergy details
- Exportable
- **Acceptance**: all flagged students listed with details


**4.19.11 Monthly Payroll Summary Report**
- For a given payroll run: every staff member with Staff Name | Type | Basic Pay | Bonus Pay | Total Pay
- Footer with grand totals
- Exportable to CSV and PDF
- **Acceptance**: matches payroll run data, totals correct

**4.19.12 Payroll Cost Trend (Interactive)**
- Interactive line chart with area fill plotting total payroll cost month-over-month across the academic year
- Hover on any data point shows: month, total basic pay, total bonus pay, total pay, headcount
- Click on data point drills into that month's summary table
- Optional toggle to overlay basic pay vs bonus pay as stacked areas
- Built with Recharts in the frontend
- **Acceptance**: chart reflects all finalised payroll runs, interactivity works, drill-through navigates correctly

**4.19.13 Individual Staff Payment History Report**
- For a selected staff member: table of every finalised month's payment
- Columns: Month | Basic Pay | Bonus Pay | Total Pay | Payslip (print)
- **Acceptance**: complete history from immutable snapshots, payslip links functional

**4.19.14 Year-to-Date Staff Cost Summary**
- Aggregated view showing each staff member's total earnings for the academic year so far
- Columns: Staff Name | Type | YTD Basic | YTD Bonus | YTD Total
- Sortable, exportable to CSV and PDF
- **Acceptance**: aggregation correct across all finalised runs in the academic year

**4.19.15 Bonus Analysis Report**
- Shows which staff earned bonuses, frequency, and total bonus amount per person
- Columns: Staff Name | Type | Months with Bonus | Total Bonus Amount | Average Bonus per Month
- Helps principal spot patterns (e.g., teacher consistently exceeding class allocation)
- **Acceptance**: bonus data accurate, aggregated from immutable snapshots

### 4.20 Dashboards

**4.20.1 Platform Owner Dashboard**
- Tenant list with health indicators (active users, error rates)
- Active user counts per tenant
- Recent provisioning activity
- Queue depths and system status

**4.20.2 School Admin Dashboard**
- Today's attendance summary (submitted vs pending sessions)
- Pending approvals (count by type, including payroll if applicable)
- Overdue invoices (count and total amount)
- Recent admissions (count by status)
- Upcoming schedule gaps
- Unanswered parent inquiries
- Students missing emergency contacts
- Households needing completion (from admissions conversion — missing emergency contacts or billing parent)
- Parents without email (communication-restricted — cannot log in or receive email notifications)
- Current payroll run status (if payroll module enabled and user has `payroll.view`)

**4.20.3 Teacher Dashboard**
- Today's classes (from schedule)
- Pending attendance submissions
- Upcoming grading deadlines
- Recent announcements

**4.20.4 Parent Dashboard**
- Student attendance summary (current period)
- Recent grades (if enabled)
- Outstanding invoices with payment links
- Recent announcements
- Inquiry status

**4.20.5 Finance Staff Dashboard**
- Invoice pipeline: draft → issued → overdue → paid
- Recent payments
- Pending refund approvals
- Revenue summary

**4.20.6 Principal Payroll Dashboard**
- Current/latest payroll run status (draft in progress, or last finalised)
- Quick stats: total payroll cost this month, headcount, total bonus paid
- Payroll cost trend mini-chart (last 6 months)
- Staff with missing payroll inputs (salaried without days_worked, per-class without classes_taught)
- Quick action: "Start New Payroll Run" or "Continue Draft"
- Quick action: "Export All Payslips" (for last finalised run)
- Link to individual staff payment histories

---

## 5. EDGE CASES & ERROR HANDLING

### 5.1 Tenancy / Permissions

| Edge Case | Handling |
|-----------|---------|
| Unknown domain request | Static 404, never redirect, never leak tenant existence |
| Suspended tenant | Redis flag checked every request → TENANT_SUSPENDED response |
| Archived tenant | 404 response, no login possible |
| Last school_owner removal | **Transactional guard with serializable isolation**: Every operation that could remove the last school_owner (role removal, membership suspension/disable/archive, user global suspension, role demotion) executes inside a transaction with `SELECT COUNT(*) ... FOR UPDATE` on remaining active school_owner memberships, excluding the target. If count < 1 after exclusion, operation is blocked with error code `LAST_SCHOOL_OWNER`. The `FOR UPDATE` lock ensures concurrent requests to remove different school_owners are serialised — the second transaction blocks until the first commits or rolls back. **Transfer flow**: Add new owner first (assign `school_owner` to target membership), then remove old owner. There is no explicit "transfer ownership" action. **Platform owner**: Cannot override this invariant. Must assign replacement before suspending the last owner. **Pending invitations**: Do not count as active owners. Guard blocks removal until invitee has accepted and been assigned the role. **Bulk operations**: Each removal in a batch is checked individually within the same transaction; the first removal that would result in zero owners blocks the entire batch. **Compliance erasure**: Anonymisation proceeds (name anonymised) but membership status and role are preserved — the invariant is about role presence, not identity. |
| Role overlap broadening data access | Permissions are union, but data access is scoped by active context |
| Tenant module disabled mid-use | UI hidden, API blocked, data preserved |
| Concurrent tenant switching | Each switch issues new JWT, old JWT expires naturally |
| User globally suspended | All sessions/caches cleared across all tenants. Memberships preserved but inaccessible. Login blocked. `LAST_SCHOOL_OWNER` guard applies. |
| User globally disabled | All sessions/caches cleared. All active memberships transitioned to disabled in background. Permanent — requires platform admin to reverse. `LAST_SCHOOL_OWNER` guard applies. |

### 5.2 Registration / Communications

| Edge Case | Handling |
|-----------|---------|
| WhatsApp selected, no WhatsApp number | Block registration completion |
| Primary phone marked as WhatsApp number | Require explicit confirmation checkbox |
| WhatsApp send fails | Auto-queue email fallback |
| Both WhatsApp and email unavailable | In-app notification if account exists, mark failed, surface to admin |
| Invalid WhatsApp template locale | Block WhatsApp, fall back to email |
| Bounced email | Update notification status, flag email on parent record for admin review |

### 5.3 Admissions

| Edge Case | Handling |
|-----------|---------|
| Duplicate application (name + DOB match) | Warn and route for review, don't block |
| No eligible approver | Block acceptance submission with clear error message |
| Form edit doesn't corrupt historic submissions | Versioning: new version created, old preserved |
| Application conversion when household exists | Email-based matching: prompt admin to link or create new |
| Conversion with missing parent email | Allowed — parent created without email, marked communication-restricted, surfaced on dashboard |
| Conversion with missing date of birth | Blocked — admin must enter on conversion screen |
| Conversion with missing emergency contacts | Allowed — household created with `needs_completion = true`, surfaced on dashboard |
| Parent email matches multiple existing parents | Admin shown disambiguation list, must select which to link |

### 5.4 Scheduling

| Edge Case | Handling |
|-----------|---------|
| Room double-booking | Hard conflict: block unless override permission + reason |
| Teacher double-booking | Hard conflict: block unless override permission + reason |
| Student in overlapping classes | Hard conflict: block unless override permission + reason |
| Room over capacity | Soft conflict: warn only |
| Teacher exceeding workload threshold | Soft conflict: warn only. Only triggered if `tenant_settings.scheduling.teacherWeeklyMaxPeriods` is non-null. Error code: `SCHEDULE_SOFT_CONFLICT_WORKLOAD`. |
| Invalid time range (end before start) | Hard-blocked at validation |
| Class set to inactive with future schedules | Auto-end-date all future schedule entries to today |
| Closure added retroactively (sessions already exist) | Open sessions auto-cancelled; submitted/locked sessions flagged for admin resolution |
| Class held on closure date | Requires `attendance.override_closure` permission + mandatory reason |
| Closure overlaps with multiple scopes | All applicable closures suppress generation; broadest scope shown |

### 5.5 Attendance

| Edge Case | Handling |
|-----------|---------|
| Teacher forgets submission | Daily job detects, surfaces on exception dashboard |
| Late submission | Allowed, submission time recorded for reporting |
| Historical amendment | Requires permission + reason, original status preserved |
| Student enrolled mid-day | Daily summary only counts sessions where student was enrolled |
| No auto-absence | Confirmed: never auto-mark absent |
| Session generation on closure date | Blocked — closure prevents generation entirely |
| Nightly batch already created session, then closure added | Open session auto-cancelled; submitted/locked require admin resolution |
| Teacher opens marking on date with no schedule | Error: "No scheduled session for this class on this date" |
| Date outside academic year | Error: "Date is outside the academic year for this class" |

### 5.6 Gradebook

| Edge Case | Handling |
|-----------|---------|
| Missing grades | Excluded or zero per tenant setting |
| Weights don't sum to 100% | Normalized at calculation, warning to teacher |
| Published report card data change | Immutable snapshot — correction requires revision |
| Scale change after grading | Scale immutable when assessments graded against it |
| Lock state | Locked assessments prevent grade entry/edit |

### 5.7 Finance

| Edge Case | Handling |
|-----------|---------|
| Duplicate Stripe webhook | Idempotency check via `external_event_id` |
| Over-allocation | Blocked: allocation cannot exceed payment amount or invoice balance |
| Overpayment | Blocked: unallocated remainder flagged for admin |
| Invoice with payment cannot be voided | Void only when balance == total (no payments applied) |
| Missing locale template for printable | Block render with specific error, never produce bad output |
| Refund exceeds payment amount | Blocked: SUM(refunds) cannot exceed payment amount |
| Household without billing parent | Fee generation blocked with clear warning |
| Payment posted but webhook delayed | Webhook reconciles, doesn't create duplicate |
| Concurrent receipt number generation | Row-level `SELECT ... FOR UPDATE` lock on tenant_sequences |
| Refund on written-off invoice | Blocked unless user has `finance.override_refund_guard` permission with mandatory reason |
| Refund on voided invoice | Blocked: cannot refund payment allocated to a voided invoice |
| Late payment after write-off | Cannot allocate to written-off invoice (terminal state). Payment remains unallocated, surfaced on dashboard |
| Cross-period allocation | Allowed: no period boundary restriction on payment allocation |
| Cross-household allocation | Blocked: payment can only be allocated to invoices belonging to the same household (`ALLOCATION_HOUSEHOLD_MISMATCH`). Prevents financial data corruption from misrouted allocations |
| Overdue status after partial payment | Re-derived synchronously from `balance_amount` and `due_date` on every financial event |
| Cross-household allocation attempt | Blocked: `ALLOCATION_HOUSEHOLD_MISMATCH` — payment and target invoice must belong to the same household |
| Duplicate Stripe event under Redis outage | UNIQUE index on `external_event_id` prevents duplicate payment rows at DB layer even if advisory locking fails |


### 5.8 Payroll

| Edge Case | Handling |
|-----------|---------|
| Duplicate payroll run for same month | Blocked by unique constraint on (tenant_id, period_month, period_year) |
| Staff added after payroll run created | Principal manually refreshes entries in draft run to pick up new staff. Finalised runs are immutable. |
| Staff terminated mid-month | Entry remains in draft run; principal enters actual days/classes worked before termination. If staff compensation record is closed, snapshot preserves the rates. |
| Rate change during draft payroll run | Principal can refresh entries to pick up new rates. Snapshotted rates update only while run is in draft. |
| Rate change after payroll finalisation | No effect on finalised run. Snapshot is immutable. New rates appear in next month's run. |
| Per-class teacher with no submitted attendance | `auto_populated_class_count` is 0; principal manually enters `classes_taught` |
| Division by zero (total_working_days = 0) | Blocked at API validation: `total_working_days` must be ≥ 1 |
| Non-principal user attempts finalisation | If `requireApprovalForNonPrincipal = true`: routed to approval workflow. If user lacks `payroll.finalise_run` permission: blocked. |
| Concurrent payslip number generation | Row-level `SELECT ... FOR UPDATE` lock on `tenant_sequences` (same pattern as receipts/invoices) |
| Mass payslip export timeout (large staff) | BullMQ background job with progress tracking. Timeout set to 5 minutes. If Puppeteer fails, retry once, then surface error to principal. |
| Cancelled draft run | Month freed for new run creation. Cancelled run data preserved but hidden from reports. |
| Payroll run exists but no entries have inputs | Finalisation blocked: all entries must have `days_worked` (salaried) or `classes_taught` (per-class) filled in before finalisation is allowed |
| Bank details missing on staff | Not blocking for payroll. Payslip renders with "N/A" for bank fields. Warning shown on compensation management screen. |
| Compliance erasure on payroll data | Staff identifier anonymised in payslips and entries. Financial records retained. Same pattern as finance module. |

### 5.9 Website / CMS

| Edge Case | Handling |
|-----------|---------|
| Duplicate slug | Blocked by unique constraint |
| Invalid/malicious rich text | DOMPurify sanitisation on save |
| Contact form spam | Rate limit + honeypot |
| Multiple homepages | Publishing new homepage unpublishes old |

### 5.10 Search

| Edge Case | Handling |
|-----------|---------|
| Meilisearch down | Fall back to PostgreSQL full-text search |
| Cross-tenant result leakage | Tenant_id filter at service layer, permission post-filter |
| Index drift | Nightly full reindex reconciliation |
| Hidden/archived records in search | Permission filter applied after search, before response |

### 5.11 Compliance

| Edge Case | Handling |
|-----------|---------|
| Erasure on finance records | Anonymise identifiers, retain records |
| Interrupted anonymisation job | Idempotent resume — each entity type processed independently |
| Export includes internal data | Exports exclude internal-only content (notes, audit entries) |
| Tenant-scoped erasure for user subject_type | Anonymises only tenant-specific data (parent records, staff profiles, payroll entries). Platform-level `users` row preserved for other tenants. |
| Platform-level user erasure | Requires `platform.process_compliance`. Blocked if any active memberships remain in any tenant. Anonymises `users.first_name`, `users.last_name`, `users.email`. |

#### Auto-Scheduling Edge Cases

| Edge Case | Handling |
|-----------|---------|
| No valid timetable exists (constraints too tight) | Solver returns partial result with `entries_unassigned > 0`. Each unassigned slot includes a human-readable reason. Admin can relax constraints (add rooms, adjust availability) and re-run. |
| Solver timeout (large school) | Returns best partial solution found within time limit. Admin can increase `maxSolverDurationSeconds` in tenant settings or add more pinned entries to reduce solver workload. |
| Pinned entry conflicts with teacher availability | Warning on pin creation. Hard block on solver run — admin must resolve before solver starts. |
| Pinned entry conflicts with another pinned entry | Blocked on pin creation with specific conflict details (`SCHEDULER_PINNED_CONFLICT`). |
| Teacher has no availability rows but has class assignments | Treated as "fully available" — no constraints applied. This is the default for schools that don't use availability tracking. |
| Class has no assigned teacher | Solver cannot assign the class. Listed in unassigned with reason "No teacher assigned." Prerequisites check flags this. |
| Class has multiple teachers (co-teaching) | Solver uses all teachers from `class_staff`. A placement is only valid if ALL assigned teachers are available for the slot. The primary teacher (`assignment_role = 'teacher'`, first by insert order) is used for the `schedules.teacher_staff_id` column in the generated entry. |
| Room shortage | Solver assigns classes to available rooms of matching type. If no rooms available, class listed as unassigned with reason "No available [room_type] room in [weekday] [period]." |
| Non-exclusive room capacity exceeded | Solver checks `student_count` against room `capacity` for concurrent bookings of non-exclusive rooms. If `student_count` is NULL on the class requirement, capacity check is skipped (conservative — room is assumed to fit). |
| Supervision period needs N teachers | The supervision class has `periods_per_week = N × days_per_week`. The solver enforces even distribution: exactly `ceil(periods_per_week / supervision_days_count)` entries per day with matching period type. Prevents clustering all supervisors on one day. |
| Mid-year schedule change (re-run) | Re-run the solver. New pinned entries honoured. New/changed availability picked up. Old auto entries handled per deletion semantics (end-dated if attendance exists, hard-deleted if not). Existing attendance sessions preserved — their `schedule_id` FK points to the now-end-dated entry. |
| Academic year with no period grid | Solver prerequisites check blocks the run with clear message. |
| Concurrent solver runs for same academic year | Blocked by UNIQUE partial index on `scheduling_runs`. Second attempt returns `SCHEDULER_RUN_ACTIVE` error. |
| Applied run then data changes | The applied run's `config_snapshot` preserves what it was based on. Staleness indicator shows "Configuration has changed since the last applied run." Admin can re-run. |
| Worker crash during solver run | Stale run reaper (nightly job) transitions runs stuck in `running` for longer than `maxSolverDurationSeconds × 2` to `failed`. BullMQ's `stalledInterval` also detects stalled jobs and retries or moves to dead-letter queue. |
| Period grid changed between solver completion and apply | Apply is blocked with `SCHEDULER_PERIOD_GRID_CHANGED` error. Admin must re-run. |
| Class deactivated during solver run | Apply operation validates all classes are still active. Inactive classes excluded from insertion with warning. |
| All slots occupied by pinned entries | Solver returns immediately with `entries_generated = 0` and message "All available slots are occupied by pinned entries. Unpin entries to allow auto-assignment." |
| Part-time teacher at multiple schools (tenants) | Each tenant configures availability independently. Cross-tenant coordination is admin's responsibility. If no availability rows exist in tenant B, the teacher is treated as fully available — admin must configure availability in each tenant. |
| `autoSchedulerEnabled` toggled off after data exists | Auto-scheduling UI is hidden. Data (period templates, availability, preferences, run history) is preserved. Toggling back on restores full functionality. No data is deleted. |
| Browser crash during proposed timetable adjustment | Adjustments are server-persisted incrementally via PATCH to `scheduling_runs.proposed_adjustments`. On return, admin sees all prior adjustments intact. |
| Supervision subjects in gradebook | Gradebook queries filter to `subject_type = 'academic'`. Supervision/duty subjects never appear in assessments, grades, report cards, or transcripts. |

---

## 6. INTEGRATION CONTRACTS

### 6.1 Cloudflare for SaaS

| Aspect | Detail |
|--------|--------|
| **Inputs** | Tenant domain, routing metadata |
| **Outputs** | Verification status, SSL status |
| **Failure: verification fails** | Remain on fallback subdomain, surface in platform admin |
| **Failure: SSL fails** | Same as above, auto-retry every 6 hours |
| **Failure: routing issues** | Fallback subdomain always works |

### 6.2 Resend (Email)

| Aspect | Detail |
|--------|--------|
| **Inputs** | Recipient email, locale-specific template, branding variables |
| **Outputs** | Provider message ID, delivery status |
| **Webhook events** | Delivery, bounce, complaint, open |
| **Failure: invalid email** | Mark notification failed, surface to admin |
| **Failure: bounce** | Update notification status, flag email on parent record |
| **Failure: API timeout** | Retry with exponential backoff (3 attempts) |
| **Failure: provider outage** | Dead-letter after max retries |
| **Webhook rate limiting** | The Resend webhook endpoint (`/api/webhooks/resend`) is **exempt from standard per-tenant/per-user rate limiting** (same pattern as Stripe webhooks). Protected by: (1) Resend HMAC signature verification, (2) separate higher rate limit of 500 requests/minute per source IP. |
| **Role** | Primary email channel, WhatsApp fallback channel |

### 6.3 Twilio WhatsApp

| Aspect | Detail |
|--------|--------|
| **Inputs** | WhatsApp number, locale template, brand context |
| **Outputs** | Provider message ID, delivery status |
| **Templates** | Platform-level only, pre-approved via Twilio |
| **Failure: invalid number** | Fall back to email immediately |
| **Failure: template rejected** | Fall back to email, alert admin |
| **Failure: API timeout** | Retry (3 attempts), then fall back to email |
| **Failure: provider outage** | Fall back to email |
| **Pre-send validation** | Check number format, check template exists for locale |

### 6.4 Stripe Direct

| Aspect | Detail |
|--------|--------|
| **Inputs** | Tenant-specific encrypted Stripe keys, payment/refund context, webhook secret |
| **Outputs** | Payment intent, charge, refund statuses, webhook events |
| **Key storage** | AES-256 encrypted, AWS Secrets Manager for encryption key |
| **Failure: API auth** | Block payment operations, surface "payment configuration error" |
| **Failure: webhook signature** | Reject, log, alert |
| **Failure: payment intent fails** | Record as failed payment, notify admin |
| **Failure: delayed webhook** | Webhook is source of truth, reconciles pending payments |
| **Idempotency** | `external_event_id` check before processing |
| **Concurrency** | Advisory lock during payment posting |
| **Rate limiting** | The Stripe webhook endpoint (`/api/webhooks/stripe`) is **exempt from standard per-tenant/per-user rate limiting**. Stripe may burst-send events (e.g., after a temporary outage) and rate-limiting legitimate webhooks would cause payment processing delays. Instead, the endpoint is protected by: (1) Stripe signature verification (rejects unsigned requests), (2) a separate, higher rate limit of 500 requests/minute per source IP (to mitigate abuse from forged requests that fail signature check), and (3) advisory locking per `external_event_id` to serialize concurrent webhook processing for the same event. |

### 6.5 Meilisearch

| Aspect | Detail |
|--------|--------|
| **Inputs** | Indexed entities with `tenant_id`, search queries |
| **Outputs** | Ranked fuzzy results |
| **Indexed entities** | Students, parents, staff, households, invoices, applications |
| **Sync mechanism** | BullMQ job on entity create/update/delete + nightly full reindex |
| **Failure: index drift** | Nightly reconciliation |
| **Failure: service outage** | Fall back to PostgreSQL ILIKE + tsvector |
| **Security** | Every query includes `tenant_id` filter at service layer |

### 6.6 Puppeteer

| Aspect | Detail |
|--------|--------|
| **Inputs** | Template key, locale, render payload, branding, font assets |
| **Outputs** | PDF byte stream |
| **Templates** | Report cards, transcripts, receipts, invoices, payslips (individual and mass-export consolidated) |
| **Failure: missing template** | Block render, return specific error |
| **Failure: font/CSS failure** | Block render, return specific error |
| **Failure: Chromium timeout** | Retry once, then return "temporarily unavailable" |
| **Resource requirements** | Worker Fargate task: minimum 2GB memory, 1 vCPU for Puppeteer workloads. Mass export jobs reuse a single Chromium browser instance across pages (page pool pattern) to avoid per-render startup overhead. |
| **No storage** | PDF is streamed to client, never persisted |

### 6.7 Redis / BullMQ

| Aspect | Detail |
|--------|--------|
| **Inputs** | Jobs, sessions, cache entries, rate limit counters |
| **Outputs** | Queue state, cache hits, session validation |
| **Failure: Redis outage** | Sessions fail (re-login required), queues pause, cache falls through to DB |
| **Failure: poison job** | Dead-letter queue after max retries |
| **Failure: duplicate enqueue** | Idempotent job processing (check before execute) |
| **Job retry** | Exponential backoff with configurable max attempts |
| **Dead-letter** | Replay-safe admin tooling for manual retry |
| **Dead-letter monitoring** | Platform owner dashboard includes dead-letter queue count per queue name (notifications, search-sync, session-generation, payslip-export, overdue-detection). Count > 0 triggers a warning badge. Individual dead-lettered jobs are viewable with payload and failure reason. |

### 6.8 AWS S3

| Aspect | Detail |
|--------|--------|
| **Inputs** | File uploads (logos, media, import files) |
| **Outputs** | Stored files served via Cloudflare CDN |
| **Path structure** | `/{tenant_id}/logos/`, `/{tenant_id}/media/`, `/{tenant_id}/imports/` |
| **Constraints** | Logos ≤ 2MB, media ≤ 5MB, images only |
| **Failure: upload fails** | Return error, retry client-side |
| **Cleanup** | Import files purged after 24 hours or processing completion |

---

## 7. API CONVENTIONS, ERROR CODES & INTERFACE CONTRACTS

### 7.1 API Conventions

**Base URL**: `{API_URL}/api/v1`

**Authentication**: `Authorization: Bearer {jwt}` header on all endpoints except public routes (admissions page, website pages, contact form).

**Tenant context**: Resolved from hostname, injected into request pipeline. Never passed as a parameter.

**Response envelope**:
```typescript
// Success
{
  data: T,
  meta?: {
    page?: number,
    pageSize?: number,
    total?: number
  }
}

// Error
{
  error: {
    code: string,          // machine-readable, e.g. "INVOICE_ALREADY_ISSUED"
    message: string,       // human-readable English
    message_ar?: string,   // human-readable Arabic (for client-facing errors)
    details?: Record<string, any>
  }
}
```

**Pagination**: `?page=1&pageSize=20` (default 20, max 100). Response includes `meta.total`.

**Sorting**: `?sort=created_at&order=desc`

**Filtering**: `?status=active&year_group_id={uuid}`

### 7.2 Canonical Validation Error Codes

**Note**: Error codes are pre-defined for all anticipated validation scenarios. Some codes (e.g., `ATTENDANCE_CLOSURE_BLOCKED`, `SCHEDULE_SOFT_CONFLICT_CAPACITY`) are referenced only in their table below and in edge case handling (Section 5), not in functional requirements prose — this is intentional. The codes exist so the implementing agent has the complete error vocabulary without inventing codes ad hoc.

All validation errors return HTTP 422 with an `error.code`. This is the exhaustive error code catalogue — any error code not listed here is a bug.

#### Global Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_FAILED` | 422 | Zod schema validation failed. `details.issues` contains per-field errors. |
| `NOT_FOUND` | 404 | Entity does not exist or is not accessible in this tenant. |
| `FORBIDDEN` | 403 | User lacks required permission. `details.required` lists the permission key. |
| `TENANT_SUSPENDED` | 403 | Tenant is suspended; all mutations blocked. |
| `TENANT_MODULE_DISABLED` | 403 | The module for this operation is not enabled. `details.module` names the module. |
| `CONFLICT` | 409 | Unique constraint violation or business rule conflict. |
| `RATE_LIMITED` | 429 | Request rate limit exceeded. `details.retryAfterSeconds`. |
| `CONCURRENT_MODIFICATION` | 409 | Optimistic lock failure; entity was modified by another request. |

#### Scheduling Codes

| Code | Meaning |
|------|---------|
| `SCHEDULE_HARD_CONFLICT_ROOM` | Room double-booking. `details.conflicting_schedule_id`, `details.room_name`. |
| `SCHEDULE_HARD_CONFLICT_TEACHER` | Teacher double-booking. `details.conflicting_schedule_id`, `details.teacher_name`. |
| `SCHEDULE_HARD_CONFLICT_STUDENT` | Student in overlapping classes. `details.student_ids[]`, `details.conflicting_schedule_id`. |
| `SCHEDULE_SOFT_CONFLICT_CAPACITY` | Room over capacity. `details.room_capacity`, `details.enrolment_count`. Not blocking. |
| `SCHEDULE_SOFT_CONFLICT_WORKLOAD` | Teacher exceeds workload threshold. `details.current_periods`, `details.threshold`. Not blocking. |
| `SCHEDULE_OVERRIDE_REQUIRED` | Hard conflict exists; must provide `override_reason` and hold `schedule.override_conflict`. |
| `SCHEDULE_INVALID_TIME` | `end_time` ≤ `start_time`. |
| `SCHEDULE_OUTSIDE_ACADEMIC_YEAR` | Effective dates fall outside the class's academic year. |
| `CLASS_STAFF_INVALID_COMBO` | 422 | Invalid staff role combination (e.g., teacher + assistant on the same class). |
| `SCHEDULER_PREREQUISITES_INCOMPLETE` | Not all classes have scheduling requirements, or period grid is missing. `details.missing` lists what's needed. |
| `SCHEDULER_RUN_ACTIVE` | A solver run is already queued or running for this academic year. `details.existing_run_id`. |
| `SCHEDULER_PINNED_CONFLICT` | Two pinned entries conflict (teacher or room double-booked). `details.entry_a`, `details.entry_b`. |
| `SCHEDULER_PINNED_AVAILABILITY` | Pinned entry falls outside teacher's availability window. `details.entry_id`, `details.teacher_name`, `details.availability`. |
| `SCHEDULER_TIMEOUT` | Solver exceeded maximum duration. Partial result available. `details.entries_assigned`, `details.entries_unassigned`. |
| `SCHEDULER_NO_SOLUTION` | Solver found zero valid assignments (extremely rare — usually returns partial). |
| `SCHEDULER_RUN_NOT_COMPLETED` | Cannot apply or adjust a run that isn't in `completed` status. `details.current_status`. |
| `SCHEDULER_PERIOD_GRID_CHANGED` | Period grid modified since solver run was created. Re-run required. `details.changed_periods[]`. |
| `SCHEDULER_PERIOD_GRID_OVERLAP` | Two periods on the same weekday have overlapping times. `details.period_a`, `details.period_b`. |
| `SCHEDULER_PERIOD_GRID_INVALID_TIME` | Period end_time ≤ start_time. |
| `SCHEDULER_ALL_SLOTS_PINNED` | All available slots are occupied by pinned entries. No variables for solver. |
| `SCHEDULER_CLASS_INACTIVE` | A class in the scheduling run result has been deactivated since the run was created. `details.class_ids[]`. |

#### Attendance Codes

| Code | Meaning |
|------|---------|
| `ATTENDANCE_SESSION_EXISTS` | Session already exists for this class + date. |
| `ATTENDANCE_CLOSURE_BLOCKED` | Date is a closure date. `details.closure_reason`. |
| `ATTENDANCE_OVERRIDE_REQUIRED` | Closure date; must provide `override_reason` and hold `attendance.override_closure`. |
| `ATTENDANCE_SESSION_LOCKED` | Session is locked; no further amendments. |
| `ATTENDANCE_SESSION_SUBMITTED` | Session already submitted; use amendment flow. |
| `ATTENDANCE_AMENDMENT_REASON_REQUIRED` | Historical amendment requires `amendment_reason`. |
| `ATTENDANCE_NO_SCHEDULE` | No schedule exists for this class on this date. |
| `ATTENDANCE_OUTSIDE_ACADEMIC_YEAR` | Date is outside the class's academic year. |

#### Finance Codes

| Code | Meaning |
|------|---------|
| `INVOICE_ALREADY_ISSUED` | Invoice has already left draft state. |
| `INVOICE_TERMINAL_STATE` | Invoice is in a terminal state (paid, void, written_off, cancelled). |
| `INVOICE_HAS_PAYMENTS` | Cannot void invoice with allocated payments. |
| `INVOICE_NO_BILLING_PARENT` | Household has no billing parent; fee generation blocked. |
| `PAYMENT_OVER_ALLOCATION` | Allocation total exceeds payment amount. `details.payment_amount`, `details.allocation_total`. |
| `PAYMENT_EXCEEDS_BALANCE` | Per-invoice allocation exceeds invoice remaining balance. |
| `ALLOCATION_HOUSEHOLD_MISMATCH` | Payment and invoice belong to different households. |
| `REFUND_EXCEEDS_PAYMENT` | Refund amount exceeds unrefunded portion. `details.max_refundable`. |
| `REFUND_VOID_INVOICE` | Cannot refund payment allocated to voided invoice. |
| `REFUND_WRITTEN_OFF_INVOICE` | Refund on written-off invoice blocked (unless override permission). |
| `REFUND_OVERRIDE_REQUIRED` | Written-off invoice refund requires `finance.override_refund_guard` + reason. |
| `DUPLICATE_FEE_GENERATION` | Invoices already exist for this household + fee structure + period. |
| `INSTALLMENT_SUM_MISMATCH` | Installment amounts do not sum to invoice total. `details.expected`, `details.actual`. |

#### Payroll Codes

| Code | Meaning |
|------|---------|
| `PAYROLL_DUPLICATE_MONTH` | Run already exists for this tenant + month + year. |
| `PAYROLL_INCOMPLETE_ENTRIES` | Not all entries have required inputs. `details.incomplete_entry_ids[]`. |
| `PAYROLL_RUN_NOT_DRAFT` | Operation only allowed on draft runs. |
| `PAYROLL_RUN_FINALISED` | Run is finalised; no modifications allowed. |
| `PAYROLL_ZERO_WORKING_DAYS` | `total_working_days` must be ≥ 1. |
| `PAYROLL_APPROVAL_REQUIRED` | Non-principal finalisation requires approval workflow. |

#### Approval Codes

| Code | Meaning |
|------|---------|
| `APPROVAL_SELF_APPROVAL` | Requester cannot approve their own request. |
| `APPROVAL_NO_ELIGIBLE_APPROVER` | No active user holds the required approver role. |
| `APPROVAL_ALREADY_DECIDED` | Request has already been approved/rejected. |
| `APPROVAL_EXPIRED` | Request has expired. |
| `APPROVAL_NOT_PENDING` | Only pending requests can be decided. |

#### RBAC Codes

| Code | Meaning |
|------|---------|
| `ROLE_TIER_VIOLATION` | Custom role attempted to include a permission above its tier. |
| `LAST_SCHOOL_OWNER` | Cannot remove/demote/suspend the last active school_owner. See Section 5.1. |
| `SYSTEM_ROLE_IMMUTABLE` | System roles cannot be deleted or have permissions modified. |

### 7.3 Key Workflow Contracts

These define the request/response contracts for the most complex workflows — those with multiple preconditions, branching logic, or multi-entity side-effects.

#### 7.3.1 Admissions Conversion

```
POST /api/v1/admissions/applications/{id}/convert
Permission: admissions.convert
Precondition: application.status = 'accepted'

Request:
{
  student: {
    first_name: string,           // required
    last_name: string,            // required
    first_name_ar?: string,
    last_name_ar?: string,
    date_of_birth: string,        // ISO date, required
    gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say',
    nationality?: string,
    year_group_id: string,        // UUID, required
    medical_notes?: string,
    has_allergy: boolean,
    allergy_details?: string      // required if has_allergy = true
  },
  parent1: {
    first_name: string,           // required
    last_name: string,            // required
    email?: string,               // null allowed (communication-restricted parent)
    phone?: string,
    link_to_existing_parent_id?: string  // UUID, if email matched existing parent
  },
  parent2?: {
    first_name: string,
    last_name: string,
    email?: string,
    phone?: string,
    link_to_existing_parent_id?: string
  },
  household: {
    link_to_existing_household_id?: string,  // UUID, if admin chose to link
    household_name?: string                   // required if creating new
  }
}

Response 200:
{
  data: {
    student_id: string,
    household_id: string,
    parent1_id: string,
    parent2_id?: string,
    application_status: 'enrolled',
    warnings: string[]  // e.g. ["Parent 1 has no email — communication restricted"]
  }
}

Errors: VALIDATION_FAILED, NOT_FOUND, FORBIDDEN, CONFLICT
```

#### 7.3.2 Payment Allocation

```
POST /api/v1/finance/payments/{payment_id}/allocate
Permission: finance.allocate_payments

Request:
{
  allocations: Array<{
    invoice_id: string,       // UUID
    amount: number            // positive decimal, max 2dp
  }>
}

Validation:
- SUM(allocations.amount) ≤ payment.amount - payment.already_allocated
- Each allocation.amount ≤ invoice.balance_amount
- Each invoice must belong to same tenant
- Each invoice must belong to the same household as the payment (`invoices.household_id = payment.household_id`). Cross-household allocation is blocked with error `ALLOCATION_HOUSEHOLD_MISMATCH`.
- Invoice cannot be in terminal state

Response 200:
{
  data: {
    allocation_ids: string[],
    invoice_updates: Array<{
      invoice_id: string,
      new_balance: number,
      new_status: string
    }>,
    unallocated_remainder: number
  }
}

Errors: PAYMENT_OVER_ALLOCATION, PAYMENT_EXCEEDS_BALANCE, INVOICE_TERMINAL_STATE, ALLOCATION_HOUSEHOLD_MISMATCH
```

#### 7.3.3 Payroll Finalisation

```
POST /api/v1/payroll/runs/{run_id}/finalise
Permission: payroll.finalise_run

Preconditions:
- run.status = 'draft'
- All entries have required inputs filled (days_worked for salaried, classes_taught for per_class)
- total_working_days ≥ 1

Request: {} (no body — action on resource)

Response 200 (direct finalisation — user holds school_owner role, or approval not required):
{
  data: {
    run_id: string,
    status: 'finalised',
    finalised_at: string,
    payslip_count: number,
    total_payroll: number
  }
}

Response 202 (approval required — user does not hold school_owner role
             and requireApprovalForNonPrincipal = true):
{
  data: {
    approval_request_id: string,
    status: 'pending_approval',
    message: "Payroll finalisation submitted for approval"
  }
}

Errors: PAYROLL_RUN_NOT_DRAFT, PAYROLL_INCOMPLETE_ENTRIES,
        PAYROLL_ZERO_WORKING_DAYS, PAYROLL_APPROVAL_REQUIRED
```

#### 7.3.4 Refund Execution

```
POST /api/v1/finance/refunds/{refund_id}/execute
Permission: finance.execute_refund
Precondition: refund.status = 'approved'

Request:
{
  execution_method: 'stripe' | 'manual',
  manual_reference?: string   // required if execution_method = 'manual'
}

Side-effects:
1. If Stripe: initiate Stripe refund via tenant's Stripe keys
2. LIFO allocation reversal: deduct refund amount from payment's allocations
   in LIFO order (most recent first). If payment has unallocated remainder,
   deducts from unallocated first before triggering reversal.
3. Affected invoices: balance_amount and status re-derived synchronously
4. Installment statuses re-derived chronologically from remaining allocations
5. Payment status updated (refunded_partial or refunded_full)

Response 200:
{
  data: {
    refund_id: string,
    status: 'executed',
    executed_at: string,
    affected_invoices: Array<{
      invoice_id: string,
      new_balance: number,
      new_status: string
    }>
  }
}

Errors: REFUND_VOID_INVOICE, REFUND_WRITTEN_OFF_INVOICE,
        REFUND_OVERRIDE_REQUIRED, NOT_FOUND, FORBIDDEN
```

#### 7.3.5 Schedule Entry Creation

```
POST /api/v1/scheduling/schedules
Permission: schedule.manage

Request:
{
  class_id: string,
  room_id?: string,
  teacher_staff_id?: string,
  weekday: number,              // 0-6, 0=Monday
  start_time: string,           // HH:MM
  end_time: string,             // HH:MM, must be > start_time
  effective_start_date: string, // ISO date
  effective_end_date?: string,  // ISO date, null = indefinite
  override_reason?: string      // required if hard conflicts exist
}

Response 200 (no conflicts):
{
  data: {
    schedule_id: string,
    soft_conflicts?: Array<{
      code: string,
      message: string,
      details: Record<string, any>
    }>
  }
}

Response 409 (hard conflict, no override):
{
  error: {
    code: 'SCHEDULE_OVERRIDE_REQUIRED',
    message: 'Hard conflict detected',
    details: {
      conflicts: Array<{
        type: 'room' | 'teacher' | 'student',
        conflicting_schedule_id: string,
        description: string
      }>
    }
  }
}

Notes: If hard conflicts exist AND request includes override_reason AND
user holds schedule.override_conflict → entry is saved with override_reason.
Soft conflicts are returned as warnings in the success response, never block.
```

#### 7.3.6 Entity Preview (Hover Cards)

```
GET /api/v1/{entity_type}/:id/preview
Permission: entity-appropriate read permission (e.g., students.manage for student preview)

Supported entity types: students, households, staff, classes, applications, invoices, payroll-runs, approvals

Response 200:
{
  data: {
    id: string,
    entity_type: string,
    primary_label: string,            // e.g., student full name, household name
    secondary_label: string | null,   // e.g., student number, invoice number
    status: string,                   // current status badge value
    facts: Array<{                    // 2-3 key contextual facts
      label: string,                  // e.g., "Year Group", "Balance Due"
      value: string                   // e.g., "Grade 7", "€2,450.00"
    }>
  }
}

Performance target: <50ms p95. No joins to child collections.
Caching: 30-second Redis cache per entity (key: preview:{tenant_id}:{entity_type}:{id}).
Cache invalidation: on entity update event.
```

**Preview fact mapping by entity type**:

| Entity | `primary_label` | `secondary_label` | Facts |
|--------|----------------|-------------------|-------|
| Student | `full_name` | `student_number` | Year group, homeroom class, status |
| Household | `household_name` | — | Billing parent name, student count, outstanding balance |
| Staff | `user.first_name + last_name` | `staff_number` | Job title, compensation type, employment status |
| Class | `name` | — | Subject, teacher, enrolled student count |
| Application | `student_first_name + last_name` | `application_number` | Status, submitted date, year group applied for |
| Invoice | `invoice_number` | — | Household name, total amount, balance, status |
| Payroll Run | `period_label` | — | Status, headcount, total pay |
| Approval | `action_type` | — | Target entity label, requester name, status |

### 7.4 Domain Event Contracts

All domain events are dispatched via BullMQ. Every event payload includes `tenant_id` and `triggered_by_user_id`. Events are consumed by the worker service for side-effects (notifications, search indexing, summary derivation, etc.). The Consumer(s) column in the table below is the authoritative list of side-effects triggered by each event — the worker service routes each event to these consumers. Events like `parent.created` and `household.updated` exist solely for Meilisearch sync and may not be referenced elsewhere in the document.

```typescript
// Event naming convention: {entity}.{past_tense_verb}
interface DomainEvent {
  tenant_id: string;
  triggered_by_user_id: string;
  occurred_at: string;  // ISO 8601
  idempotency_key: string;
}
```

**Canonical event catalogue**:

| Event | Trigger | Consumer(s) |
|-------|---------|-------------|
| `attendance.session_submitted` | Teacher submits session | Daily summary derivation |
| `attendance.record_amended` | Admin amends historical record | Daily summary re-derivation |
| `invoice.issued` | Invoice leaves draft (direct or via approval) | Parent notification |
| `invoice.status_changed` | Any invoice status transition | Overdue notification (first transition only) |
| `payment.recorded` | Payment posted | Receipt generation, parent notification |
| `payment.allocated` | Allocations confirmed | Invoice status re-derivation per affected invoice |
| `refund.executed` | Refund executed | LIFO reversal, invoice re-derivation, notification |
| `report_card.published` | Report card published | Parent notification |
| `announcement.published` | Announcement published (direct or via approval) | Audience resolution + notification dispatch |
| `approval.requested` | Approval request created | Approver role notification |
| `approval.decided` | Approver approves or rejects | Requester notification + auto-execution if Mode A |
| `payroll.run_finalised` | Payroll run finalised | Payslip generation |
| `application.status_changed` | Application moves to any new status | Parent notification (if account exists) |
| `student.created` | Student record created (including via conversion) | Meilisearch index update |
| `student.updated` | Student record modified | Meilisearch index update |
| `student.withdrawn` | Student status changed to `withdrawn` | Class enrolment cascade (→ dropped), invoice flagging, attendance pre-population (→ absent_excused for open sessions), Meilisearch index update |
| `parent.created` | Parent record created | Meilisearch index update |
| `parent.updated` | Parent record modified | Meilisearch index update |
| `staff.created` | Staff profile created | Meilisearch index update |
| `staff.updated` | Staff profile modified | Meilisearch index update |
| `household.created` | Household created | Meilisearch index update |
| `household.updated` | Household modified (including merge/split) | Meilisearch index update |
| `user.profile_updated` | User updates name or email via profile settings | Re-index all tenant-scoped entities linked to this user (parent records, staff profiles) across all tenants where the user has an active membership. **Batching**: Dispatched as a single BullMQ job with `user_id` as deduplication key and a 5-second delay. The job resolves all affected tenants and indexes sequentially. If the same user updates again within the delay window, the job is deduplicated (not duplicated per-tenant). |
| `compliance.erasure_approved` | Erasure request approved | Anonymisation background job |
| `invoice.written_off` | Invoice written off | Audit log entry, admin notification |
| `payroll.run_cancelled` | Payroll run cancelled | Month freed for re-creation, audit log entry |
| `inquiry.status_changed` | Inquiry transitions (open→in_progress, *→closed) | Admin notification (on new inquiry), parent notification (on admin reply) |
| `compliance.request_submitted` | Compliance request submitted | Admin notification to users with `compliance.process_request` permission |
| `scheduling.run_completed` | Solver run finishes (success or partial/timeout) | In-app notification to the admin who initiated the run. Notification includes: entries assigned, entries unassigned, preference satisfaction percentage. |
| `scheduling.run_failed` | Solver run errors (crash, out of memory) | In-app notification to initiating admin with `failure_reason`. Email notification if `tenant_notification_settings` has email enabled for admin alerts. |
| `scheduling.run_applied` | Admin applies a proposed timetable | Audit log entry with run ID and entry counts. Meilisearch re-index for schedules (new entries created, old entries end-dated). Attendance session generation is NOT triggered by this event — sessions are generated on-demand by teachers or by the nightly batch, which will pick up the new schedule entries naturally. |
| `scheduling.configuration_changed` | Teacher availability, scheduling requirements, preferences, or `class_staff` assignments change after a run has been applied | Dashboard staleness indicator updated. No automatic re-run — admin decides when to re-run. |

---

## 8. SEQUENCING & DEPENDENCIES

### Phase 0: Foundations
**Duration estimate**: 2 weeks
**Dependencies**: None (starting point)

**Deliverables**:
- Turborepo monorepo setup with all packages
- Shared TypeScript configs, ESLint, Prettier
- Custom ESLint rules: `no-sequential-transaction` (prohibits array-based `$transaction` in tenant-scoped code), `no-physical-css` (prohibits physical left/right in Tailwind)
- CI pipeline (GitHub Actions): lint → type-check → test → build → Playwright visual regression (English + Arabic)
- Next.js app bootstrap with App Router, Tailwind, shadcn/ui
- NestJS app bootstrap with modular structure
- Prisma bootstrap with PostgreSQL connection
- Migration infrastructure: `post_migrate.sql` runner for RLS policies, extensions, and helper functions (see Section 2.5b)
- Redis connection setup
- BullMQ worker service bootstrap
- Tenant resolution middleware (hostname → tenant context)
- RLS architecture: Prisma interactive transaction middleware for `SET LOCAL app.current_tenant_id` (see Section 2.5)
- Auth scaffold: JWT issuance, refresh token, session storage in Redis
- i18n foundation: next-intl setup, `en`/`ar` locales, RTL direction context
- Dark mode: CSS custom properties for all colour tokens (light + dark), `next-themes` integration, class-based toggle on `<html>`
- Tailwind logical CSS enforcement (lint rule against physical left/right)
- Base component library with RTL support
- Design system foundation: app shell, stat card, table wrapper, status badge, toast, skeleton, empty state, modal, drawer, command palette shell (see UI brief Section 21)
- Keyboard shortcut system: `ShortcutProvider` context with global and per-page registration
- S3 integration for file storage
- Sentry + CloudWatch integration
- **Operational alerting rules** (CloudWatch alarms + Sentry alerts):
  - Stripe webhook processing delay > 5 minutes (CloudWatch: age of oldest unprocessed webhook event in queue)
  - Dead-letter queue depth > 0 for any queue (CloudWatch: BullMQ DLQ metric per queue name)
  - RLS policy violation attempt (Sentry: capture Postgres `row_security_policy` errors as P1 alerts)
  - Payroll run finalisation failure (Sentry: alert on `payroll.finalise` domain event followed by error within same transaction)
  - Sequence lock contention > 5 seconds (CloudWatch: custom metric from `SELECT ... FOR UPDATE` timeout on `tenant_sequences`)
  - Redis connection failures (CloudWatch: ElastiCache connection count drops to 0)
  - Meilisearch sync backlog > 1000 pending items (CloudWatch: custom metric from `search_index_status` pending count)
- Health check endpoints: `GET /api/health` (backend — checks PostgreSQL and Redis connectivity, returns 200/503) and `GET /health` (frontend — returns 200 if Next.js is running). Used as ALB target group health checks. Unauthenticated, not tenant-scoped, excluded from rate limiting.
- Seed script for local development (respects seeding order: extensions → permissions → tenant provisioning)

### Phase 1: Tenancy, Users, RBAC, Branding
**Duration estimate**: 3 weeks
**Dependencies**: Phase 0 complete

**Deliverables**:
- `tenants`, `tenant_domains`, `tenant_modules`, `tenant_branding`, `tenant_settings`, `tenant_notification_settings`, `tenant_sequences`, `tenant_stripe_configs` — full CRUD
- `users`, `tenant_memberships`, `roles`, `permissions`, `role_permissions`, `membership_roles`, `invitations`, `mfa_recovery_codes` — full CRUD
- System role seeding per tenant
- Permission tier enforcement on custom roles
- Invitation flow (staff and parent paths)
- Login with email/password
- TOTP MFA setup and verification with recovery codes
- JWT + refresh token flow
- Tenant switching endpoint and school selector UI
- Session management (concurrent sessions, revocation)
- Brute force protection (progressive delay + lockout)
- Password reset flow
- Role-aware shell routing (platform admin, school admin, teacher, parent, finance)
- Platform admin shell with tenant management
- Platform owner dashboard
- Branding configuration UI
- School settings configuration UI
- Stripe key configuration UI (school owner only)
- Notification settings configuration UI
- Cross-module dependency validation warnings in settings UI (see Section 3.1 cross-module dependency table)
- `user_ui_preferences` — full CRUD with `PATCH` merge endpoint (see Section 3.12)
- Locale preference in user profile
- Impersonation (read-only) from platform admin
- `approval_workflows`, `approval_requests` — schema, CRUD, status machine, expiry job, self-approval prevention. The approval engine is delivered in Phase 1 because Phase 6 (finance) and Phase 6b (payroll) depend on it for approval-gated operations (invoice issuance, refund execution, payroll finalisation). Full cross-domain integration (admissions, communications) is completed in Phase 8.

### Phase 2: Households, Parents, Students, Staff, Academics
**Duration estimate**: 3 weeks
**Dependencies**: Phase 1 complete (tenant context, RBAC, user records)

**Deliverables**:
- `households`, `household_emergency_contacts`, `parents`, `household_parents`, `students`, `student_parents` — full CRUD
- Communication preference capture and validation
- Parent registration flow with WhatsApp preference handling
- Parent-user linking on registration
- Emergency contacts (1-3 per household, min 1 enforced)
- Medical notes and allergy fields on student
- Student status state machine
- Household merge and split workflows (including financial record reassignment — see Section 4.6.4/4.6.5)
- `staff_profiles` — full CRUD
- `academic_years`, `academic_periods`, `year_groups`, `subjects`, `classes`, `class_staff`, `class_enrolments` — full CRUD
- Academic period overlap prevention
- Promotion/rollover wizard with preview and batch commit
- Meilisearch indexing for students, parents, staff, households
- Search service with tenant filtering and permission post-filtering
- Preview endpoints for students, households, staff, classes (see Section 7.3.6)
- Hover preview card component wired to preview endpoints
- Record hub pattern for student, household, staff member, class
- Allergy report
- School admin dashboard (initial) — role-sharp with personalised greeting and operational summary line
- Parent dashboard (initial)

### Phase 3: Admissions
**Duration estimate**: 2 weeks
**Dependencies**: Phase 2 complete (student/parent/household models, year groups)

**Deliverables**:
- `admission_form_definitions`, `admission_form_fields` — form builder UI
- `applications`, `application_notes` — application workflow
- Form versioning
- Conditional field visibility (single-field equality)
- Public admissions page
- Application submission with parent registration/login
- Application review workflow
- Internal notes
- Duplicate application detection
- Approval-gated acceptance (using approval workflow from Phase 1 settings)
- Application-to-student conversion
- Application number sequence generation
- Admissions funnel analytics (basic)

### Phase 4a: Manual Scheduling + Attendance
**Duration estimate**: 3 weeks
**Dependencies**: Phase 2 complete (classes, staff, students, enrolments)

**Deliverables**:
- `rooms` (with `room_type` column), `schedules` (with `academic_year_id`, `period_order`, `schedule_period_template_id`, `is_pinned`, `pin_reason`, `source`, `scheduling_run_id` columns) — full CRUD
- `subjects.subject_type` column added
- Conflict detection engine (hard/soft)
- Override flow with permission and reason
- Timetable views: teacher, room, student
- Workload reporting
- `attendance_sessions`, `attendance_records`, `daily_attendance_summaries` — full CRUD
- Teacher attendance marking with bulk "mark all present"
- Historical amendment flow
- Daily summary derivation (triggered by submission/amendment)
- Pending attendance detection (daily background job)
- Exception dashboard
- Parent attendance visibility (if enabled)
- Teacher dashboard (initial)

### Phase 4b: Auto-Scheduling
**Duration estimate**: 4 weeks
**Dependencies**: Phase 4a complete (schedule data model with auto-scheduling columns, conflict detection, timetable views)

**Deliverables**:
- `schedule_period_templates` — CRUD + visual grid editor with RTL support
- Supervision subject creation (using `subjects.subject_type` from Phase 4a)
- `class_scheduling_requirements` — CRUD + table editor + bulk edit
- `staff_availability` — CRUD + visual weekly grid
- `staff_scheduling_preferences` — CRUD + preference UI (3 tabs)
- Pin/unpin UI for schedule entries
- `scheduling_runs` — solver execution infrastructure
- CSP solver implementation (`packages/shared/src/scheduler/`)
- BullMQ job wrapper for solver execution with stale-run reaper
- Prerequisites validation check
- Proposed timetable review screen (dedicated UI rendering from `result_json`, not from `schedules` table)
- Manual adjustment UI with server-persisted incremental saves
- Apply/discard flow with atomic transaction, concurrency guard, period-grid-drift check, and attendance-safe deletion
- Approval workflow integration for non-school_owner apply (using approval engine from Phase 1)
- Scheduling dashboard: assignment overview, teacher workload, unassigned classes, preference satisfaction, run history
- Teacher self-service preference UI (with `schedule.manage_own_preferences` permission)
- Teacher preference satisfaction view (with `schedule.view_own_satisfaction` permission)
- New permissions seeding (8 admin-tier, 2 staff-tier)
- Staleness detection for post-apply configuration changes
- Solver integration tests with fixture schools (small: 10 teachers, medium: 30 teachers, large: 60 teachers)
- Performance benchmarks against timeout threshold (target: <30s for 40-teacher school)
- Memory profiling for solver worker (target: <2GB for 100-class school)

**Schedule risk**: The solver itself is bounded in complexity (CSP with forward checking is well-understood). The risk is in the UX — the visual grid editors, drag-and-drop adjustments, real-time constraint validation, and RTL support are frontend-heavy. The 4-week estimate assumes a competent React developer. If the team is less experienced with interactive UI, add 1–2 weeks buffer. This phase carries medium-high schedule risk alongside Finance (Phase 6) and Payroll (Phase 6b).

### Phase 5: Gradebook, Report Cards, and Transcripts
**Duration estimate**: 3 weeks
**Dependencies**: Phase 2 (classes, students, subjects), Phase 4a (academic periods active, attendance for report cards)

**Deliverables**:
- `grading_scales`, `assessment_categories`, `class_subject_grade_configs` — full CRUD
- Grading scale immutability enforcement
- `assessments`, `grades` — full CRUD
- Grade entry interface for teachers
- Missing grade handling per policy
- Weight normalization with teacher warning
- `period_grade_snapshots` — computation engine
- Grade override workflow
- `report_cards` — generation, publish, revision
- Snapshot payload generation
- Locale-specific report card templates (English + Arabic)
- Puppeteer rendering for report cards
- Academic transcript rendering (aggregates across years)
- Exam results bulk import
- Snapshot testing for PDF rendering in CI

### Phase 6: Finance
**Duration estimate**: 4 weeks
**Dependencies**: Phase 2 (households, students), Phase 1 (RBAC, approval engine)

**Deliverables**:
- `fee_structures`, `discounts`, `household_fee_assignments` — full CRUD
- `invoices`, `invoice_lines`, `installments` — full CRUD
- Fee generation wizard with preview
- Invoice lifecycle management
- Approval flow for invoice issuance
- Invoice number sequence generation
- `payments`, `payment_allocations` — full CRUD
- Payment recording (Stripe + manual methods)
- FIFO auto-suggest allocation with manual adjustment
- Over-allocation prevention
- `receipts` — generation with immutable number
- Receipt number sequence generation
- Locale-specific invoice and receipt templates
- Puppeteer rendering for invoices and receipts
- `refunds` — request, approval, execution
- Write-off functionality
- Household statement view
- Stripe integration: checkout flow, webhook processing, idempotency
- Stripe key decryption and secure API calls
- Finance staff dashboard
- Fee generation run report
- Write-off/scholarship reporting


### Phase 6b: Payroll
**Duration estimate**: 3 weeks
**Dependencies**: Phase 2 (staff_profiles), Phase 4a (scheduling), Phase 1 (RBAC, approval engine), Phase 6 (finance patterns — Puppeteer templates, sequence generation, approval integration)

**Deliverables**:
- `staff_compensation` — full CRUD with compensation type validation
- Staff bank detail management (encrypted storage, restricted view)
- Compensation bulk import via CSV
- Extended `staff_profiles` columns (department, employment_type, bank details)
- `payroll_runs` — full CRUD with status lifecycle
- `payroll_entries` — auto-population from active staff, rate snapshotting
- Auto-population of per-class teacher class counts from scheduling module
- Salaried calculation engine (pro-rata + bonus day multiplier)
- Per-class calculation engine (assigned count + bonus class rate)
- Real-time calculation preview during draft editing
- Payroll run summary review screen
- Finalisation workflow: direct for school_owner, approval-gated for non-principal
- `payslips` — generation on finalisation, payslip number sequence
- Payslip `snapshot_payload_json` generation
- Locale-specific payslip templates (English + Arabic)
- Puppeteer rendering for individual payslips
- Puppeteer mass-export consolidated PDF (BullMQ background job)
- Individual staff payment history view
- Monthly payroll summary report
- Payroll cost trend interactive chart (Recharts)
- Year-to-date staff cost summary report
- Bonus analysis report
- Principal payroll dashboard
- Payroll module toggle in `tenant_modules`
- Payroll permissions seeding for system roles
- Snapshot testing for payslip PDF rendering in CI
- Audit logging for all payroll operations (compensation changes, run finalisation, bank detail access)

### Phase 7: Communications, CMS, and Parent Inquiries
**Duration estimate**: 3 weeks
**Dependencies**: Phase 2 (parents, communication preferences), Phase 1 (RBAC, approvals)

**Deliverables**:
- TipTap rich text integration with BiDi support
- `announcements` — drafting, targeting, approval, publish, schedule
- Scheduled announcement BullMQ delayed jobs
- Audience resolution at publish time
- `notification_templates` — platform-level and tenant-level
- `notifications` — dispatch engine with retry and dead-letter
- Email dispatch via Resend with webhook status tracking
- WhatsApp dispatch via Twilio with platform templates
- WhatsApp-to-email fallback chain
- In-app notification system
- Communication preference enforcement
- `parent_inquiries`, `parent_inquiry_messages` — full CRUD
- Multi-turn conversation threads
- Admin author hidden from parent, visible to admins
- Stale inquiry detection background job
- `website_pages` — CMS with draft/publish/unpublish
- Homepage enforcement
- Navigation ordering
- `contact_form_submissions` — with rate limiting and spam protection
- Page preview

### Phase 8: Approvals, Compliance, Analytics, Exports
**Duration estimate**: 3 weeks
**Dependencies**: All prior phases (approval workflows span domains)

**Deliverables**:
- Cross-domain approval integration for remaining modules (admissions acceptance, announcement publishing) — the approval engine (`approval_workflows`, `approval_requests`) was delivered in Phase 1; finance and payroll approval integration was delivered in Phases 6/6b
- Approval dashboard and analytics views
- `compliance_requests` — access export, erasure, rectification
- Anonymisation engine (idempotent, resumable)
- `audit_logs` — append-only logging (already instrumented) + viewer UI
- Audit log search and filter for school admin and platform owner
- `import_jobs` — bulk import engine (students, parents, staff, fees, exam results)
- CSV validation, duplicate detection, error reporting
- File cleanup job
- All reports from Section 4.19
- Parent engagement scoring instrumentation (tracking login, payment, read rates)
- Export pack generation

### Phase 9: Offline Cache, Hardening, Release
**Duration estimate**: 2 weeks

**Note — schedule buffer**: Phases 0–9 (including Phase 4b auto-scheduling) sum to 35 weeks. A 5-week contingency buffer (14%) is recommended, bringing the realistic timeline to **40 weeks (~10 months)**. Finance (Phase 6), Payroll (Phase 6b), and Auto-Scheduling (Phase 4b) carry the highest schedule risk — Finance/Payroll due to transactional complexity, Auto-Scheduling due to interactive UX complexity and RTL grid components.
**Dependencies**: All prior phases stable

**Deliverables**:
- PWA offline cache: timetable, class roster, recent announcements
- Locale and font bundle caching
- RTL regression test suite
- Visual regression test suite hardening: expand Playwright visual comparisons beyond Phase 0 foundation to cover all module screens in both locales, dark mode variants, and mobile breakpoints. Target: 100% coverage of record hub pages, all dashboard views, all form wizards, and the print preview modal.
- PDF snapshot test suite (all templates including payslips, both locales)
- RLS leakage test suite (automated cross-tenant access attempts)
- Load/performance testing
- Database backup restore drill
- Runbook documentation: deployment, rollback, tenant provisioning, incident response
- Demo environment setup with sample data
- Production readiness checklist
- **Integration test suites for critical workflows**: Dedicated test fixtures for the five highest-risk transactional workflows: (1) admissions conversion (multi-entity creation in single transaction), (2) refund LIFO reversal (allocation deletion/reduction + invoice re-derivation), (3) household merge (financial record reassignment + concurrency guard), (4) payroll finalisation (entry freeze + payslip generation + approval flow), (5) payment allocation (FIFO suggestion + over-allocation prevention + invoice status derivation). Each suite runs against a real PostgreSQL instance with RLS enabled — not mocked.

---

## 9. OPEN DECISIONS

All decisions have been resolved through the Phase 1 interrogation, follow-up process, red-team review supplements (v3), the v3.1 red-team blocker resolution, the independent v4 red-team pass, and the independent v4.1 red-team pass. The v4 red-team resolved 23 findings across four categories: implementation blockers (PgBouncer/Prisma transaction safety, migration strategy, permission cache cross-tenant isolation), significant issues (application status enum gap, attendance race conditions, payroll rounding precision, optimistic concurrency, household merge/split financial integrity, missing data models for UI preferences), minor issues (font consistency, cross-module dependency surfacing, webhook rate limiting, dark mode phase assignment, GDPR IP anonymisation, domain placeholder consistency), and cross-document alignment (preview API endpoints, visual regression testing, keyboard shortcut architecture). The v4.1 red-team resolved 35 additional findings: 5 implementation blockers (platform role permission FK nullability, attendance session cross-type duplicates, missing password reset token table, room exclusivity flag ignored in conflict detection, parent transcript permission gap), 10 significant issues (class enrolment duplicate prevention, payroll batch session generation side-effects, LIFO refund reversal partial allocation mechanics, schedule deletion mechanism, daily attendance summary derivation rules, junction table RLS coverage, fee generation duplicate detection precision, Meilisearch user profile sync, approval request orphan protection, admissions form rate limiting), 10 minor issues (form builder DOB warning, membership status enum cleanup, schedule overlap NULL logic, report card revision query contract, Redis GDPR key TTL, transcript revision chain handling, Resend webhook rate limiting, JSONB settings evolution strategy, payroll unique index for cancelled runs, overdue notification atomicity), and 10 operational observations (Multi-AZ RDS, Puppeteer memory, Redis persistence, household merge concurrency, UI preferences size limits, health check endpoints, student withdrawal attendance effects, WhatsApp template note, dead-letter monitoring, payroll summary query optimisation). All findings are fully integrated into this document. The v4.2 red-team resolved 32 additional findings: 5 implementation blockers (attendance_records missing UNIQUE constraint, class_subject_grade_configs missing UNIQUE and indexes, notification_templates missing UNIQUE and indexes, refund reversion state enum mismatch, updated_at trigger function never defined), 12 significant issues (six tables with zero indexes, household_fee_assignments missing active UNIQUE, payment_allocations non-tenant-prefixed indexes, school_closures polymorphic FK integrity, webhook/public CSRF exemption, user.profile_updated unbounded cascade, approval orphan when approver role emptied, transcript uncached expensive query, payroll daily_rate rounding method unspecified, public route CSRF bootstrap, installments missing tenant-scoped indexes, scheduled announcement missing index), and 15 minor/operational issues (timeline buffer, payroll index section mislabel, assessment_categories uniqueness, installment sum validation, expired invitation cleanup, notification time-sorted index, contact form IP retention, rooms.is_exclusive seed note, INSTALLMENT_SUM_MISMATCH error code, report card template_locale selection, render_version format, btree_gist extension, membership_roles index, payroll batch job notification, tenant_sequences provisioning). All findings are fully integrated into this document. The v4.3 red-team resolved 27 additional findings: 5 implementation blockers (period_grade_snapshots missing UNIQUE constraint allowing duplicate computations, staff_profiles missing UNIQUE on tenant+user allowing duplicate profiles, approval_workflows missing UNIQUE on enabled action_type causing ambiguous routing, notification_templates and audit_logs nullable tenant_id RLS policy unspecified, admission_form_definitions versioning has no linking mechanism between versions), 10 significant issues (parents missing partial UNIQUE on email enabling duplicate active records, parent_inquiries.in_progress status unreachable with no transition defined, platform-level notification template management has no permission in catalogue, compliance erasure for user subject_type has ambiguous cross-tenant scope, notifications have no indexed source entity reference for delivery audit queries, report_cards missing constraint preventing duplicate active cards per student+period, admissions public endpoint rate limit parameters unspecified, refunds missing tenant-scoped status index, custom announcement targeting excludes un-registered parents, report_cards missing index on revision_of_report_card_id), and 12 minor/operational issues (tables intentionally missing updated_at not documented, contact_form_submissions has mutable status but no updated_at, academic_years missing overlap prevention, admission_form_definitions missing UNIQUE on name+version, payroll_entries.notes has no length limit, tenant_settings JSONB has no key removal migration pattern, household split missing concurrency guard, class_staff composite PK allows ambiguous multi-role without guidance, daily_attendance_summaries derived_payload missing sessions_left_early, application_notes.is_internal has no non-internal usage specified, Meilisearch invoice indexing strategy unspecified, users.global_status cascade side-effects unspecified). All findings are fully integrated into this document. The v4.4 red-team resolved 20 additional findings: 3 implementation blockers (payments.external_event_id index not UNIQUE allowing duplicate Stripe payments under advisory lock failure, payment allocation workflow missing household cross-validation allowing cross-household misallocation, Phase 6/6b dependency on approval engine claimed Phase 1 delivery but approval engine was in Phase 8 — resolved by moving approval engine schema and CRUD to Phase 1), 8 significant issues (six lookup tables missing UNIQUE(tenant_id, name) — year_groups, subjects, rooms, grading_scales, fee_structures, discounts; classes missing UNIQUE(tenant_id, name, academic_year_id); academic_periods missing UNIQUE(tenant_id, academic_year_id, name); attendance_sessions missing index for teacher dashboard pending-sessions query; audit_logs and notifications missing retention/partitioning strategy for high-volume append-only growth at 100+ tenants; parent_inquiries missing index on parent_id for parent dashboard query; no domain event for student.withdrawn despite complex documented side-effects; finance.allocate_payments permission referenced in workflow contract but missing from permission catalogue), and 9 minor/operational issues (invoice_lines missing CHECK for line_total = quantity × unit_amount, schedules.effective_end_date NULL semantics undocumented, class_enrolments status transitions undocumented, fee_structures year-scoping design rationale undocumented, class_staff teacher+assistant invalid combo has no error code, role_permissions and class_staff tables missing indexes, error codes section missing pre-definition rationale note, domain events section missing consumer documentation note, notifications section partitioning note added inline). All findings are fully integrated into this document. The v5.0 red-team resolved 25 additional findings: 5 implementation blockers (tenant_modules/tenant_notification_settings/admission_form_fields missing timestamps making audit trail impossible, academic_years missing DB-level overlap prevention relying on race-prone API check, refunds table missing failure_reason column and failure/retry transitions for Stripe failures, contact_form_submissions silently discarding honeypot spam instead of storing for review, payroll_runs UNIQUE constraint in prose not matching partial unique index definition), 12 significant issues (households.status containing unreachable 'inactive' enum value, tenant_memberships.membership_status containing dead 'invited'/'archived' enum values, invoice lifecycle missing draft→cancelled and pending_approval→cancelled transitions, report card snapshot_payload missing excused_days/left_early_days in attendance_summary, grading_scales config_json missing validation rules for range/overlap/label integrity, students.gender enum missing 'prefer_not_to_say' value present in API contract, website_pages missing partial unique index for single published homepage per locale, 12 indexes added for query paths documented in functional requirements but missing from index catalogue, 4 domain events added for documented workflows with no event emitted, household_parents/student_parents missing updated_at despite mutable columns, notifications missing updated_at for delivery-status tracking, tenant_settings JSONB missing compliance/audit-log-retention configuration), and 8 minor/operational issues (append-only table list incomplete — missing receipts/payslips/payment_allocations/permissions, payroll session-generation polling missing timeout causing indefinite frontend polling, error code documentation gap — 30 of 52 codes unreferenced in functional sections, permission-to-endpoint cross-reference gap — 60 of 80 permissions not cited in Section 4, partial index catalogue gaps for admin dashboard filter queries, invitations missing index for nightly pending-expiry cleanup job, contact_form_submissions missing index for nightly IP cleanup, parent_inquiry_messages missing index for stale inquiry detection). All findings are fully integrated into this document. The v6.0 auto-scheduling integration resolved 51 findings from three independent red-team passes (Opus 4.6). The auto-scheduling spec was reviewed for integration into the master plan as a day-1 feature (Phase 4b). Findings organized by category:

**10 implementation blockers resolved**: (1) `schedules` table missing `academic_year_id` — added as direct FK for efficient scoping of apply/delete operations; (2) auto-generated entries missing `effective_start_date`/`effective_end_date` — defined mapping: `effective_start_date` = later of today or academic year start, `effective_end_date` = NULL; (3) `schedules` missing `period_order` column — added with `schedule_period_template_id` FK for grid linkage; (4) apply flow deleting entries with attendance sessions violates FK and deletion rule — resolved with dual strategy: hard-delete entries without attendance, end-date entries with attendance; (5) no concurrency guard on apply — added `SELECT ... FOR UPDATE` on scheduling_runs row; (6) `created_by_user_id` NOT NULL for auto-generated entries — defined as applying admin's user ID carried in BullMQ payload; (7) `config_snapshot` used singular teacher — changed to array of all `class_staff` teachers with multi-teacher constraint checking; (8) student overlap check underspecified — added pre-computed `student_overlaps` array in config_snapshot using actual enrolment data (not year_group matching); (9) proposed timetable storage undefined — clarified as dedicated review UI rendering from `result_json`, not from `schedules` table, with `proposed_adjustments` JSONB for server-persisted incremental manual edits; (10) ENUM name collision on `period_type` — renamed to `schedule_period_type` to avoid collision with `academic_periods.period_type`.

**22 significant issues resolved**: (1) period template time overlap not DB-enforced — added btree_gist exclusion constraint matching academic_years/periods pattern; (2) `staff_scheduling_preferences` no UNIQUE — added composite UNIQUE using md5 hash of JSONB payload; (3) `room_type` vs `is_exclusive` unreconciled — documented as orthogonal axes with `is_exclusive` as sole arbiter for double-booking; (4) scheduling_runs status transitions not DB-enforced — documented optimistic concurrency with `updated_at` check on all transitions; (5) "one active run" needs UNIQUE partial index — changed from non-unique to UNIQUE partial index; (6) permissions not mapped to tier system — assigned explicit tiers (admin/staff) with role mappings; (7) no `tenant_modules` entry — added `auto_scheduling` module key with data preservation on disable; (8) teacher assignment mismatch — added `scheduling.configuration_changed` domain event for class_staff changes with staleness indicator; (9) scheduling_runs missing optimistic concurrency — added to optimistic concurrency pattern; (10) room capacity unknown to solver — added `student_count` to `class_scheduling_requirements` for capacity checks; (11) availability "covers" semantics undefined — defined as strict containment (`available_from <= start_time AND available_to >= end_time`); (12) max_consecutive ambiguous with breaks — defined: breaks don't break consecutiveness between teaching periods; (13) supervision has no distribution constraint — added hard constraint requiring even distribution per day; (14) stale pinned entries loaded — added effective date filter when loading pinned entries for solver; (15) period grid drift between complete/apply — added `SCHEDULER_PERIOD_GRID_CHANGED` guard on apply; (16) no min_consecutive for block periods — added `min_consecutive_periods` column with validation rules; (17) `schedule.configure_auto` too broad — split into 3 permissions (`configure_period_grid`, `configure_requirements`, `configure_availability`) with different default role assignments; (18) `schedule.apply_auto` lacks approval gating — added approval workflow routing for non-school_owner via `requireApprovalForNonPrincipal`; (19) no view permission for reports — added `schedule.view_auto_reports` (admin) and `schedule.view_own_satisfaction` (teacher); (20) supervision contaminates gradebook — added filtering contract requiring `subject_type = 'academic'` in all gradebook/assessment queries; (21) manual adjustments no crash recovery — added server-persisted incremental saves to `proposed_adjustments` JSONB; (22) domain events incomplete consumers — fully specified all consumers with notification channels and side-effects.

**19 minor/operational issues resolved**: (1) worker crash leaves run stuck — added stale-run reaper nightly job; (2-3) config_snapshot JSONB size — added TOAST note, run history query excludes large JSONB columns, retention policy for old runs; (4) solver memory — added 2GB memory recommendation for worker ECS task; (5) determinism requires ordered queries — documented ORDER BY requirement for all solver input queries; (6) multi-tenant teacher coordination — documented as admin responsibility with explicit edge case; (7) prerequisite too strict for supervision — exempted supervision classes from teacher prerequisite; (8) no rollback after apply — documented as intentional limitation with clear UI messaging; (9) Section 1 said "no auto-scheduling" — updated; (10) Section 9 listed as deferred — removed; (11) nested JSONB defaults — handled by Zod `.default()` at outer key level per existing evolution strategy; (12-13) bilingual period names and RTL — added `period_name_ar` column, documented RTL requirements for all interactive UIs; (14) admin-manages-teacher-preferences permission — added `schedule.manage_preferences` permission; (15) setup wizard partial save — each component saves individually, persists across sessions; (16) timeline impact — updated to 35 weeks + 5 buffer = 40 weeks; (17) class deactivated during solver run — added class status guard on apply; (18) all slots pinned — added specific `SCHEDULER_ALL_SLOTS_PINNED` error; (19) `autoSchedulerEnabled` mirrors `tenant_modules.auto_scheduling` toggle.

There are no remaining open decisions blocking implementation.

**Decisions deferred to future phases** (not Phase 1):
- Student transfer / data portability between schools
- Multi-household per student (custody arrangements)
- Public API design and versioning
- Self-service school onboarding
- General document upload/storage
- Offline writes
- Native mobile apps
- Multi-currency support
- Parent engagement scoring dashboard (instrumentation is Phase 1, dashboard is later)
- Automatic credit balance ledger for household overpayments (v1: manual allocation only)
- Substitute teacher session credit attribution in payroll (v1: credits scheduled teacher, manual override required)
- Level 2 Payroll: statutory tax deductions, end-of-service benefits, jurisdiction-specific compliance
- Level 3 Payroll: WPS file generation, bank API integration, direct disbursement
- Payroll-to-accounting export (journal entries, GL integration)

**Auto-scheduling features deferred beyond v1** (delivered in Phase 4b but with these limitations documented):
- Substitute teacher scheduling: When a teacher is absent, auto-suggest replacements. V1 requires manual substitute assignment.
- Multi-week rotation schedules: Week A / Week B alternating timetables. V1 assumes a single weekly pattern.
- Student elective scheduling: Students choosing from multiple elective options with capacity constraints (bin packing). V1 treats class enrolments as pre-assigned.
- Advanced solver algorithms: Simulated annealing or genetic algorithm for better soft constraint satisfaction. CSP is sufficient for target school sizes.
- Teacher self-service availability via mobile: Teachers setting their availability on their phone. V1 is admin-configured via desktop.
- Cross-term schedule comparison: Side-by-side comparison of two scheduling runs or terms.
- Multiple availability windows per day per teacher: V1 supports one window per day. Multi-window requires schema extension (relaxing UNIQUE constraint + adding exclusion constraint for non-overlapping windows).
