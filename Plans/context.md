# SHARED CONTEXT — School Operating System

**Purpose**: Architecture reference document. Covers tech stack, infrastructure, conventions, patterns, auth model, RBAC rules, and security model for the entire codebase.

---

## 1. PROJECT OVERVIEW

This is a centralised, multi-tenant school operating system delivered as a SaaS platform on a single codebase and single deployment. All school tenants share one PostgreSQL database with strict Row-Level Security (RLS) isolation enforced at the database layer via mandatory `tenant_id` on every tenant-scoped row. The platform serves two initial school clients with the architecture designed to scale to hundreds of tenants without code changes or infrastructure duplication — adding a new school is a tenant provisioning operation, not a deployment.

The system provides: configurable admissions, student records, household and family management, staff and academic structure, manual and auto-scheduling with a CSP-based timetable solver (constraint propagation + backtracking) operating in manual/auto/hybrid/scenario modes, attendance with pattern detection and auto-locking, gradebook with weighted categories and AI-assisted grading, report cards with multi-step approval and bulk PDF generation, academic transcripts, a finance module with invoicing/payments/refunds/installments/credit notes/late fees/scholarships/payment plans/recurring invoices, a payroll module with salaried and per-class compensation models/monthly payroll runs/immutable snapshots/payslip generation/payroll analytics, a communications layer spanning email (Resend), WhatsApp (Twilio), and in-app notifications with explicit parent communication preferences and WhatsApp-to-email fallback, a parent inquiry messaging system, a public website CMS per school, approval workflows, compliance/GDPR tooling with data subject access and erasure, data imports (students/staff/parents/fees/grades/compensation), analytics and unified reporting with scheduled reports and alerts, and role-aware dashboards.

Bilingual English/Arabic support with full RTL behaviour is foundational for all school-facing portals. Platform admin remains English-only. The system is delivered as a responsive web application with PWA shell — no native mobile apps currently. There are no public APIs, no self-service school onboarding, no general document upload/storage, and no offline writes. All printable outputs (receipts, invoices, report cards, transcripts, payslips) are rendered on demand from code templates via Puppeteer and are not stored as document records.

**Environments**: Local → Production (single Hetzner VPS). Staging and demo environments planned pre-launch (see `Plans/deployment-architecture.md`).

---

## 2. SYSTEM ARCHITECTURE

### 2.1 Core Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Backend** | NestJS + TypeScript | Modular monolith |
| **ORM** | Prisma | With RLS middleware for tenant context injection |
| **Database** | PostgreSQL 16+ | Shared database, shared schema, RLS on all tenant tables |
| **Cache/Sessions** | Redis 7 | Sessions, caching, rate limiting, queue coordination. **Production: AOF persistence enabled** to survive restarts without losing BullMQ delayed jobs. |
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
| **Hosting** | Hetzner VPS | Frontend, backend, and worker services on single server (multi-environment planned) |
| **Database Hosting** | PostgreSQL on Hetzner | Single server, automated backups |
| **CDN/Edge** | Cloudflare for SaaS | Custom domains, SSL, CDN, edge protection |
| **Monitoring** | Sentry + custom alerts | Error tracking + operational alerts |
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
                    │        Hetzner VPS (Caddy)           │
                    └──┬───────────┬──────────────────────┘
                       │           │
          ┌────────────▼──┐  ┌─────▼────────────┐
          │  Frontend      │  │  Backend API      │
          │  (Next.js)     │  │  (NestJS)         │
          │  Port 3000     │  │  Port 3001        │
          └────────────────┘  └──┬──────┬─────────┘
                                 │      │
                    ┌────────────▼┐  ┌──▼──────────────┐
                    │  PostgreSQL  │  │  Redis           │
                    │  + RLS       │  │  Sessions/Cache  │
                    └──────────────┘  └──────┬──────────┘
                                             │
                                   ┌─────────▼──────────┐
                                   │  Worker Service     │
                                   │  (BullMQ consumers) │
                                   │  Port 3002          │
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

- **Frontend**: Stateless, horizontally scalable (currently single VPS)
- **Backend API**: Stateless (sessions in Redis), horizontally scalable
- **Workers**: Scale by queue depth, BullMQ supports multiple concurrent consumers
- **PostgreSQL**: Single primary, read replica added when needed
- **Redis**: Single instance, cluster mode if needed later
- **Meilisearch**: Single instance, sufficient for current scale
- **S3**: Effectively unlimited, tenant-namespaced paths

### 2.5 Connection Pooling & RLS

PgBouncer in **transaction mode**. RLS context is set via `SET LOCAL app.current_tenant_id` at the start of each Prisma **interactive** transaction. A Prisma middleware intercepts every query batch and injects the tenant context from the resolved request.

**Critical rule — interactive transactions only**: All tenant-scoped database access **must** use Prisma's **interactive transaction** API (`prisma.$transaction(async (tx) => { ... })`). The sequential/batch API (`prisma.$transaction([...])`) is **prohibited** for tenant-scoped queries because PgBouncer in transaction mode does not guarantee that sequential statements in a batch share the same server-side connection. The interactive API opens a single database transaction that holds a connection for its duration, ensuring `SET LOCAL` and all subsequent queries execute on the same connection. A custom ESLint rule (`no-sequential-transaction`) flags any usage of the array-based `$transaction` signature in tenant-scoped code.

**Critical rule**: All raw SQL queries are prohibited except within the RLS-setup middleware. A linting rule flags any `$executeRawUnsafe` or `$queryRawUnsafe` usage outside this pattern.

**Background jobs**: Every BullMQ job payload must include `tenant_id`. A `TenantAwareJob` base class sets RLS context before executing any database operation. Jobs without `tenant_id` are rejected at enqueue time. Background jobs use the same interactive transaction pattern — never the sequential batch API.

### 2.5b Database Migrations & RLS Policy Management

Prisma manages the schema (tables, columns, indexes, enums) via its standard migration system. However, Prisma does **not** natively manage RLS policies, custom functions, or extensions. These are handled via **companion raw SQL migration files** that run alongside Prisma migrations.

**Migration directory structure**:
```
packages/prisma/
├── schema.prisma
├── migrations/
│   ├── 20260316000000_init/
│   │   ├── migration.sql      # Prisma-generated DDL
│   │   └── post_migrate.sql   # RLS policies, extensions, functions
│   └── migration_lock.toml
├── rls/
│   └── policies.sql           # Full RLS policy definitions (reference/regenerable)
└── seed/
    ├── permissions.ts         # Global permission seeding
    ├── system-roles.ts        # Per-tenant system role factory
    └── dev-data.ts            # Local development fixtures
```

**RLS policy convention**: Every table with a `tenant_id` column gets:
```sql
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
CREATE POLICY {table_name}_tenant_isolation ON {table_name}
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**Nullable `tenant_id` RLS handling**: Three tables have nullable `tenant_id` (`notification_templates`, `audit_logs`, `role_permissions`). These use a **dual-policy pattern**: tenant-scoped rows use the standard policy; platform-scoped rows (NULL tenant_id) are accessed via queries running outside tenant context.

**Post-migrate runner**: A custom script (`scripts/post-migrate.ts`) executes all `post_migrate.sql` files after `prisma migrate deploy`. Idempotent — uses `DROP POLICY IF EXISTS` followed by `CREATE POLICY`.

**Trigger management**: The `set_updated_at()` trigger function is created in the first `post_migrate.sql` and applied to every table with an `updated_at` column.

**Extension management**: `CREATE EXTENSION IF NOT EXISTS citext;` and `CREATE EXTENSION IF NOT EXISTS btree_gist;` in the first `post_migrate.sql`.

**Seed execution order**: (1) Extensions → (2) `set_updated_at()` trigger → (3) RLS policies → (4) Global permissions → (5) Tenant provisioning.

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
- **User global suspension** (`users.global_status → 'suspended'`): All active Redis sessions for the user across all tenants deleted. All permission cache entries invalidated. Login blocked platform-wide. Existing memberships preserved but inaccessible. On reactivation, user can log in again.
- **User global disable** (`users.global_status → 'disabled'`): Same as suspension plus all `active` memberships transitioned to `disabled` in background job. Permanent — requires platform admin to reverse.
- **Last school_owner guard**: Every operation that could remove the last school_owner uses `SELECT COUNT(*) ... FOR UPDATE` with serializable isolation. Blocked with `LAST_SCHOOL_OWNER` error if count would drop below 1.

### 2.8 RBAC Architecture

**Permission tiers** (custom roles can only combine permissions within their tier or below):
- `platform` — platform owner operations (tenant provisioning, cross-tenant monitoring)
- `admin` — school-level administration (user management, configuration, all data access)
- `staff` — teacher and staff operations (attendance, grades, assigned classes)
- `parent` — parent-scoped access (own household, linked students, invoices)

**Permission caching**: Loaded from DB per membership, cached in Redis for 60 seconds. Critical changes (role removal, suspension) explicitly invalidate the cache.

**Multi-role handling**: A user with both parent and staff roles in the same tenant sees a **context switcher** in the UI. Permissions are the union of all roles, but data access is scoped by active context. API endpoints check active context, not just permission set.

**Invariants**:
- At least one active `school_owner` role per tenant at all times
- Requester cannot approve their own approval requests
- Custom roles cannot include permissions from a higher tier
- `school_owner` is a system role and cannot be deleted or modified

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

**WhatsApp templates**: Platform-level only. Pre-approved via Twilio. Variable substitution for school name/branding. Schools do not manage their own templates.

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
| **CSRF** | Double-submit cookie (SameSite=Lax + CSRF token for mutations) |
| **CSP** | Strict Content-Security-Policy headers |
| **Rate Limiting** | Per-tenant and per-user via Redis, configurable per endpoint class |
| **Input Validation** | Zod schemas on all API inputs |
| **HTML Sanitization** | DOMPurify server-side on all TipTap HTML before storage |
| **SQL Injection** | Prisma parameterised queries, raw queries prohibited |
| **XSS** | React default escaping + CSP + sanitised rich text |
| **Encryption at Rest** | PostgreSQL encryption, S3 server-side encryption |
| **Stripe Key Encryption** | AES-256 with key in AWS Secrets Manager, never exposed in API responses |
| **Audit** | All security-relevant actions logged to append-only audit_logs |


### 2.14 Optimistic Concurrency Control

Entities subject to concurrent editing implement optimistic concurrency via `updated_at`-based versioning. The client includes the entity's `updated_at` in update requests (via `expected_updated_at` field). The API checks `WHERE id = :id AND updated_at = :expected_updated_at`; if no row matches, returns `CONCURRENT_MODIFICATION` (409).

**Entities requiring optimistic concurrency**: `payroll_runs` (draft), `payroll_entries` (draft), `invoices` (draft), `attendance_sessions`, `approval_requests`, `applications`, `tenant_settings`, `staff_compensation`, `scheduling_runs`.

### 2.15 Frontend Architecture Requirements

- **Dark mode**: Full support. All colour tokens in both modes via CSS custom properties, toggled by class on `<html>` using `next-themes`.
- **`user_ui_preferences`**: Per-user, per-tenant UI state (sidebar collapsed, role context, theme, locale, table configs, saved filters, recent/pinned records, active tabs). `PATCH` merge API.
- **Preview endpoints**: `GET /api/v1/{entity}/:id/preview` for hover cards. Lightweight (<50ms p95), 30s Redis cache. Entities: student, household, staff, class, application, invoice, payroll run, approval.
- **Keyboard shortcut system**: `ShortcutProvider` React context. Global shortcuts (`⌘K`, `Esc`) always registered. Per-page shortcuts registered on mount, deregistered on unmount.
- **Visual regression testing**: Playwright-based visual comparison in CI for both locales (en LTR, ar RTL).

### 2.16 API Conventions

**Base URL**: `{API_URL}/api/v1`

**Response envelope**:
```typescript
// Success
{ data: T, meta?: { page?: number, pageSize?: number, total?: number } }

// Error
{ error: { code: string, message: string, message_ar?: string, details?: Record<string, any> } }
```

**Pagination**: `?page=1&pageSize=20` (default 20, max 100). Response includes `meta.total`.

**Sorting**: `?sort=created_at&order=desc`

**Filtering**: `?status=active&year_group_id={uuid}`

---

## DATA MODEL CONVENTIONS

### 3.0 Conventions

- All `id` columns are `UUID` with `gen_random_uuid()` default
- All tenant-scoped tables have `tenant_id UUID NOT NULL FK → tenants` with RLS policy
- All tables with `created_at` use `TIMESTAMPTZ NOT NULL DEFAULT now()`
- All tables with `updated_at` use `TIMESTAMPTZ NOT NULL DEFAULT now()` with update trigger
- **Tables intentionally without `updated_at`** (append-only or immutable): `school_closures`, `application_notes`, `parent_inquiry_messages`, `mfa_recovery_codes`, `audit_logs`, `receipts`, `payslips`, `payment_allocations`, `permissions`
- CITEXT extension enabled for case-insensitive email storage
- ENUM types are PostgreSQL native enums
- JSONB fields have corresponding Zod validation schemas at the API layer
- Indexes are listed after each table group

**JSONB evolution strategy**: All keys in Zod schemas use `.default()` values. The API read path parses stored JSONB through the Zod schema, filling missing keys with defaults. No backfill migration needed for new optional settings. Required changes (removing/changing key types) need data migrations.


---

## DEFERRED FEATURES (NOT YET BUILT)

- Student transfer / data portability between schools
- Multi-household per student (custody arrangements)
- Public API design and versioning
- Self-service school onboarding
- General document upload/storage
- Offline writes
- Native mobile apps
- Multi-currency support (single currency per tenant — permanent constraint)
- Level 2 Payroll: statutory tax deductions, end-of-service benefits, jurisdiction-specific compliance
- Level 3 Payroll: WPS file generation, bank API integration, direct disbursement
- Payroll-to-accounting export (journal entries, GL integration)
- Student elective scheduling with capacity constraints
- Advanced solver algorithms beyond CSP

