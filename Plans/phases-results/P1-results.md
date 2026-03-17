# P1 Results — Tenancy, Users, RBAC, Branding

## Summary

Phase 1 delivers the complete multi-tenancy foundation for the School Operating System. This includes 20 database tables with Row-Level Security on 14 tenant-scoped tables, 10 PostgreSQL enums, a full authentication system (login, JWT/refresh tokens, MFA via TOTP, password reset, session management, brute force protection), role-based access control with tier enforcement (platform > admin > staff > parent), tenant provisioning with automated defaults, invitation flows for staff and parents, branding and settings configuration with Zod-validated JSONB, AES-256-GCM encrypted Stripe key storage, approval workflow engine, and user UI preferences. The frontend includes auth pages (login, MFA verify, password reset, school selector, parent registration), platform admin UI (tenant CRUD, domains, modules, dashboard), school configuration UI (branding, general settings, Stripe config, notification settings), user/role management UI (user list, invitations, role CRUD with permission picker), and profile/preferences pages. All UI is bilingual (English/Arabic) with RTL-safe Tailwind CSS logical properties.

---

## Database Migrations

### Migration: `20260316072748_add_p1_tenancy_users_rbac`

**10 Enums created:**
- `TenantStatus` (active, suspended, archived)
- `DomainType` (app, public_site)
- `VerificationStatus` (pending, verified, failed)
- `SslStatus` (pending, active, failed)
- `UserGlobalStatus` (active, suspended, disabled)
- `MembershipStatus` (invited, pending_verification, active, suspended, disabled, archived)
- `RoleTier` (platform, admin, staff, parent)
- `InvitationStatus` (pending, accepted, expired, revoked)
- `ApprovalActionType` (announcement_publish, invoice_issue, application_accept, payment_refund, payroll_finalise)
- `ApprovalRequestStatus` (pending_approval, approved, rejected, executed, cancelled, expired)

**20 Tables created (column counts exclude relations):**

| # | Table | Columns | Tenant-scoped | RLS |
|---|-------|---------|---------------|-----|
| 1 | `tenants` | 11 | No (is the tenant) | No |
| 2 | `tenant_domains` | 9 | Yes | Yes |
| 3 | `tenant_modules` | 4 | Yes | Yes |
| 4 | `tenant_branding` | 16 | Yes | Yes |
| 5 | `tenant_settings` | 5 | Yes | Yes |
| 6 | `tenant_notification_settings` | 5 | Yes | Yes |
| 7 | `tenant_sequences` | 4 | Yes | Yes |
| 8 | `tenant_stripe_configs` | 10 | Yes | Yes |
| 9 | `users` | 13 | No (platform-level) | No |
| 10 | `mfa_recovery_codes` | 5 | No (user-linked) | No |
| 11 | `password_reset_tokens` | 6 | No (user-linked) | No |
| 12 | `tenant_memberships` | 8 | Yes | Yes |
| 13 | `roles` | 8 | Nullable tenant_id | Dual RLS |
| 14 | `permissions` | 4 | No (global) | No |
| 15 | `role_permissions` | 3 (composite PK) | Nullable tenant_id | Dual RLS |
| 16 | `membership_roles` | 3 (composite PK) | Yes | Yes |
| 17 | `invitations` | 11 | Yes | Yes |
| 18 | `approval_workflows` | 7 | Yes | Yes |
| 19 | `approval_requests` | 14 | Yes | Yes |
| 20 | `user_ui_preferences` | 6 | Yes | Yes |

### Post-migrate SQL
- `set_updated_at()` triggers on 12 tables with `updated_at` column
- RLS `ENABLE` + `FORCE` on 14 tenant-scoped tables
- Standard RLS policy: `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)`
- Dual RLS policy for nullable `tenant_id` tables (roles, role_permissions): `USING (tenant_id IS NULL OR tenant_id = current_setting(...)::uuid)`
- Partial unique index: `idx_tenant_domains_primary` (one primary per tenant+type)
- Partial unique index: `idx_approval_workflows_active` (one active workflow per tenant+action_type)

---

## API Endpoints

### Auth (`/api/v1/auth/`)

| Method | Path | Auth | Permission | Description |
|--------|------|------|------------|-------------|
| POST | `/v1/auth/login` | No | None | Login with email/password, optional MFA code. Returns JWT + sets refresh cookie |
| POST | `/v1/auth/refresh` | No (cookie) | None | Refresh access token using httpOnly cookie |
| POST | `/v1/auth/logout` | Yes | None | Invalidate session, clear refresh cookie |
| POST | `/v1/auth/password-reset/request` | No | None | Request password reset email |
| POST | `/v1/auth/password-reset/confirm` | No | None | Confirm password reset with token |
| POST | `/v1/auth/mfa/setup` | Yes | None | Generate TOTP secret + QR code |
| POST | `/v1/auth/mfa/verify` | Yes | None | Verify TOTP code to enable MFA |
| POST | `/v1/auth/mfa/recovery` | No | None | Login with MFA recovery code |
| POST | `/v1/auth/switch-tenant` | Yes | None | Switch to a different tenant, get new JWT |
| GET | `/v1/auth/me` | Yes | None | Get current user + memberships |
| GET | `/v1/auth/sessions` | Yes | None | List active sessions |
| DELETE | `/v1/auth/sessions/:id` | Yes | None | Revoke a specific session |

### Platform Admin (`/api/v1/admin/`)

| Method | Path | Auth | Permission | Description |
|--------|------|------|------------|-------------|
| POST | `/v1/admin/tenants` | Yes | PlatformOwner | Create a new tenant with all defaults |
| GET | `/v1/admin/tenants` | Yes | PlatformOwner | List tenants (paginated, filterable) |
| GET | `/v1/admin/tenants/:id` | Yes | PlatformOwner | Get tenant details |
| PATCH | `/v1/admin/tenants/:id` | Yes | PlatformOwner | Update tenant |
| POST | `/v1/admin/tenants/:id/suspend` | Yes | PlatformOwner | Suspend tenant (Redis flag + clear sessions) |
| POST | `/v1/admin/tenants/:id/reactivate` | Yes | PlatformOwner | Reactivate suspended tenant |
| POST | `/v1/admin/tenants/:id/archive` | Yes | PlatformOwner | Archive tenant |
| GET | `/v1/admin/dashboard` | Yes | PlatformOwner | Platform dashboard stats |
| POST | `/v1/admin/impersonate` | Yes | PlatformOwner | Impersonate a user (read-only JWT) |
| POST | `/v1/admin/users/:id/reset-mfa` | Yes | PlatformOwner | Reset user MFA |
| GET | `/v1/admin/tenants/:id/modules` | Yes | PlatformOwner | List tenant modules |
| PATCH | `/v1/admin/tenants/:id/modules/:key` | Yes | PlatformOwner | Toggle module enabled/disabled |

### Domains (`/api/v1/admin/tenants/:tenantId/domains/`)

| Method | Path | Auth | Permission | Description |
|--------|------|------|------------|-------------|
| GET | `/v1/admin/tenants/:tenantId/domains` | Yes | PlatformOwner | List domains |
| POST | `/v1/admin/tenants/:tenantId/domains` | Yes | PlatformOwner | Add domain |
| PATCH | `/v1/admin/tenants/:tenantId/domains/:domainId` | Yes | PlatformOwner | Update domain |
| DELETE | `/v1/admin/tenants/:tenantId/domains/:domainId` | Yes | PlatformOwner | Remove domain |

### Configuration (tenant-scoped)

| Method | Path | Auth | Permission | Description |
|--------|------|------|------------|-------------|
| GET | `/v1/branding` | Yes | Any | Get tenant branding |
| PATCH | `/v1/branding` | Yes | `branding.manage` | Update branding fields |
| POST | `/v1/branding/logo` | Yes | `branding.manage` | Upload logo file |
| GET | `/v1/settings` | Yes | Any | Get tenant settings (Zod-validated JSONB) |
| PATCH | `/v1/settings` | Yes | `settings.manage` | Update settings (deep merge + validation + warnings) |
| GET | `/v1/stripe-config` | Yes | `stripe.manage` | Get Stripe config (masked secrets) |
| PUT | `/v1/stripe-config` | Yes | `stripe.manage` | Create/update Stripe config (encrypted) |
| GET | `/v1/notification-settings` | Yes | Any | List notification settings |
| PATCH | `/v1/notification-settings/:type` | Yes | `notifications.manage` | Update notification setting |

### RBAC (tenant-scoped)

| Method | Path | Auth | Permission | Description |
|--------|------|------|------------|-------------|
| GET | `/v1/roles` | Yes | Any | List roles |
| POST | `/v1/roles` | Yes | `roles.manage` | Create custom role |
| GET | `/v1/roles/:id` | Yes | Any | Get role details |
| PATCH | `/v1/roles/:id` | Yes | `roles.manage` | Update role |
| DELETE | `/v1/roles/:id` | Yes | `roles.manage` | Delete custom role |
| PUT | `/v1/roles/:id/permissions` | Yes | `roles.manage` | Assign permissions (tier-enforced) |
| GET | `/v1/users` | Yes | `users.view` | List users with memberships |
| GET | `/v1/users/:id` | Yes | `users.view` | Get user details |
| PATCH | `/v1/users/:id/membership` | Yes | `users.manage` | Update membership roles |
| POST | `/v1/users/:id/suspend` | Yes | `users.manage` | Suspend membership |
| POST | `/v1/users/:id/reactivate` | Yes | `users.manage` | Reactivate membership |
| POST | `/v1/invitations` | Yes | `users.invite` | Create invitation |
| GET | `/v1/invitations` | Yes | `users.invite` | List invitations |
| POST | `/v1/invitations/:id/revoke` | Yes | `users.invite` | Revoke invitation |
| POST | `/v1/invitations/accept` | No | None | Accept invitation (public endpoint) |

### Approvals (tenant-scoped)

| Method | Path | Auth | Permission | Description |
|--------|------|------|------------|-------------|
| GET | `/v1/approval-workflows` | Yes | `approvals.view` | List workflows |
| POST | `/v1/approval-workflows` | Yes | `approvals.manage` | Create workflow |
| PATCH | `/v1/approval-workflows/:id` | Yes | `approvals.manage` | Update workflow |
| DELETE | `/v1/approval-workflows/:id` | Yes | `approvals.manage` | Delete workflow |
| GET | `/v1/approval-requests` | Yes | `approvals.view` | List requests (filterable by status) |
| GET | `/v1/approval-requests/:id` | Yes | `approvals.view` | Get request details |
| POST | `/v1/approval-requests/:id/approve` | Yes | `approvals.manage` | Approve request |
| POST | `/v1/approval-requests/:id/reject` | Yes | `approvals.manage` | Reject request |
| POST | `/v1/approval-requests/:id/cancel` | Yes | Any | Cancel own request |

### Preferences

| Method | Path | Auth | Permission | Description |
|--------|------|------|------------|-------------|
| GET | `/v1/me/preferences` | Yes | None | Get user UI preferences |
| PATCH | `/v1/me/preferences` | Yes | None | Update preferences (deep merge) |

---

## Services

### apps/api

| Service | Module | Responsibilities |
|---------|--------|-----------------|
| `AuthService` | auth | Login (bcrypt verify, brute force protection), JWT/refresh token management, MFA (TOTP setup/verify via otplib), recovery codes (SHA-256 hashed), password reset (token generation/verification), session management (Redis), tenant switching |
| `TenantsService` | tenants | Tenant CRUD, provisioning (creates tenant + domain + branding + settings + modules + notifications + sequences + system roles), suspend/reactivate/archive, dashboard stats, impersonation (read-only JWT), MFA reset |
| `DomainsService` | tenants | Domain CRUD for tenants, primary domain management |
| `BrandingService` | configuration | Branding CRUD, logo upload (S3) |
| `SettingsService` | configuration | Settings get/update with deep merge, Zod validation, cross-module warning detection |
| `StripeConfigService` | configuration | Stripe config CRUD with AES-256-GCM encryption, masked API responses |
| `EncryptionService` | configuration | AES-256-GCM encrypt/decrypt, key reference management, value masking (last 4 chars) |
| `NotificationSettingsService` | configuration | Notification type settings CRUD per tenant |
| `RolesService` | rbac | Role CRUD with tier enforcement (numeric rank: platform=4 > admin=3 > staff=2 > parent=1), permission assignment with tier validation, system role protection |
| `MembershipsService` | rbac | User listing, membership role updates, suspend/reactivate with last school_owner guard (count check) |
| `InvitationsService` | rbac | Invitation creation (SHA-256 hashed tokens, 72h expiry), listing, revocation, acceptance (existing user → create membership, new user → create user + membership) |
| `ApprovalWorkflowsService` | approvals | Workflow CRUD, unique active workflow per action type |
| `ApprovalRequestsService` | approvals | Request CRUD, approve/reject/cancel state machine, `checkAndCreateIfNeeded()` cross-module engine |
| `PreferencesService` | preferences | UI preferences CRUD with deep merge |
| `PermissionCacheService` | common | Redis-cached permission lookups (60s TTL), invalidation per membership or per tenant |

### Common Infrastructure (updated from P0)

| Component | Responsibilities |
|-----------|-----------------|
| `TenantResolutionMiddleware` | Hostname → Redis cache (60s) → `tenant_domains` query → status check → inject TenantContext. Redis suspension flag check. Excludes `/api/v1/admin/*`, `/api/v1/invitations/accept`, health, docs routes |
| `PermissionGuard` | Real implementation: reads `@RequiresPermission()` metadata → PermissionCacheService → throws PERMISSION_DENIED |
| `ModuleEnabledGuard` | Real implementation: Redis cache `tenant_modules:{tenant_id}` (300s TTL) → throws MODULE_DISABLED |
| `PlatformOwnerGuard` | Redis set `platform_owner_user_ids` check for platform admin routes |

---

## Frontend

### Auth Pages (`(auth)` route group)

| Route | Description |
|-------|-------------|
| `[locale]/(auth)/layout.tsx` | Centered card layout for auth pages |
| `[locale]/(auth)/login/page.tsx` | Email/password login with inline MFA input |
| `[locale]/(auth)/reset-password/page.tsx` | Two-step: request email → confirm with token |
| `[locale]/(auth)/mfa-verify/page.tsx` | 6-digit TOTP code entry + recovery code toggle |
| `[locale]/(auth)/select-school/page.tsx` | Multi-tenant school selector cards |
| `[locale]/(auth)/register/page.tsx` | Multi-step parent registration with communication preferences |

### Platform Admin Pages (`(platform)` route group)

| Route | Description |
|-------|-------------|
| `[locale]/(platform)/layout.tsx` | Sidebar navigation (Dashboard, Tenants, Health) |
| `[locale]/(platform)/admin/page.tsx` | Dashboard with stat cards (API-fetched) |
| `[locale]/(platform)/admin/tenants/page.tsx` | Tenant list with DataTable |
| `[locale]/(platform)/admin/tenants/new/page.tsx` | Create tenant form |
| `[locale]/(platform)/admin/tenants/[id]/page.tsx` | Tenant detail with tabs (Overview, Domains, Modules) |

### School Configuration Pages (`(school)` route group)

| Route | Description |
|-------|-------------|
| `[locale]/(school)/settings/layout.tsx` | Tab navigation: Branding, General, Notifications, Stripe |
| `[locale]/(school)/settings/branding/page.tsx` | Branding editor: colours, display names, logo upload |
| `[locale]/(school)/settings/general/page.tsx` | Tenant settings by category with collapsible sections and cross-module warnings |
| `[locale]/(school)/settings/stripe/page.tsx` | Stripe key configuration with masked display |
| `[locale]/(school)/settings/notifications/page.tsx` | Notification type toggles and channel selection table |

### User/Role Management Pages

| Route | Description |
|-------|-------------|
| `[locale]/(school)/settings/users/page.tsx` | User list with suspend/reactivate actions and invite dialog |
| `[locale]/(school)/settings/invitations/page.tsx` | Invitation list with create and revoke |
| `[locale]/(school)/settings/roles/page.tsx` | Role list (system roles read-only, custom editable) |
| `[locale]/(school)/settings/roles/new/page.tsx` | Create custom role with permission picker |
| `[locale]/(school)/settings/roles/[id]/page.tsx` | Edit role and permission picker with tier enforcement |

### Profile & Preferences Pages

| Route | Description |
|-------|-------------|
| `[locale]/(school)/profile/page.tsx` | User profile: name, locale, theme, MFA setup, active sessions |
| `[locale]/(school)/profile/communication/page.tsx` | Parent communication preferences |

### Shared Components

| Component | Path | Description |
|-----------|------|-------------|
| `DataTable` | `apps/web/src/components/data-table.tsx` | Reusable generic table with pagination and sorting |
| `PageHeader` | `apps/web/src/components/page-header.tsx` | Reusable page header with title and actions |
| `UserMenu` | `apps/web/src/components/user-menu.tsx` | Dropdown menu: profile, locale, theme, logout |
| `AuthProvider` | `apps/web/src/providers/auth-provider.tsx` | Auth context: login, logout, refresh, useAuth hook |

---

## Background Jobs

No new BullMQ jobs added in P1. The worker infrastructure from P0 remains unchanged.

---

## Configuration

### Environment Variables Added

| Variable | Default | Description |
|----------|---------|-------------|
| `ENCRYPTION_KEY` | (dev fallback) | AES-256 encryption key for Stripe secrets |
| `PLATFORM_DOMAIN` | `edupod.app` | Platform domain for tenant URL generation |
| `MFA_ISSUER` | `SchoolOS` | TOTP issuer name displayed in authenticator apps |

### Seed Data

**65 global permissions** across 4 tiers:
- Platform tier: `platform.*` (manage_tenants, manage_platform_users, impersonate, view_dashboard, manage_billing)
- Admin tier: `branding.*`, `settings.*`, `roles.*`, `users.*`, `stripe.*`, `notifications.*`, `approvals.*`, `modules.*`, etc.
- Staff tier: `attendance.*`, `gradebook.*`, `payroll.*`, `finance.*`, `admissions.*`, `communications.*`, `analytics.*`, `compliance.*`, `scheduling.*`
- Parent tier: `parent.*` (view_grades, view_attendance, view_invoices, make_payment, view_announcements, submit_inquiry)

**7 system roles** with default permission mappings:
- `platform_owner` (platform tier, global — no tenant_id)
- `school_owner` (admin tier)
- `school_admin` (admin tier)
- `teacher` (staff tier)
- `accountant` (staff tier)
- `hr_manager` (staff tier)
- `parent` (parent tier)

**2 dev tenants**: Al Noor Academy (Arabic default), Cedar International School (English default)
- Each with: fallback domain, branding, settings (full JSONB defaults), 11 modules (all enabled), 12 notification types, 4 sequences, all system roles with permissions

**9 dev users**: 1 platform admin + 4 per tenant (owner, admin, teacher, parent)
- Default password: `Password123!`
- Platform admin: `admin@edupod.app`

**Redis**: Platform owner user IDs populated in `platform_owner_user_ids` set

### New Dependencies

| Package | Purpose |
|---------|---------|
| `otplib` | TOTP secret generation and verification |
| `qrcode` + `@types/qrcode` | QR code generation for MFA setup |
| `cookie-parser` + `@types/cookie-parser` | Parse httpOnly refresh token cookies |

---

## Files Created

### Database & Seed
- `packages/prisma/schema.prisma` (complete rewrite — was empty generator+datasource)
- `packages/prisma/migrations/20260316072748_add_p1_tenancy_users_rbac/migration.sql`
- `packages/prisma/migrations/20260316072748_add_p1_tenancy_users_rbac/post_migrate.sql`
- `packages/prisma/seed.ts` (complete rewrite)
- `packages/prisma/seed/permissions.ts`
- `packages/prisma/seed/system-roles.ts`
- `packages/prisma/seed/dev-data.ts`

### Shared Package
- `packages/shared/src/types/tenant-config.ts`
- `packages/shared/src/types/user.ts`
- `packages/shared/src/types/rbac.ts`
- `packages/shared/src/types/approval.ts`
- `packages/shared/src/constants/modules.ts`
- `packages/shared/src/constants/permissions.ts`
- `packages/shared/src/constants/notification-types.ts`
- `packages/shared/src/constants/sequence-types.ts`
- `packages/shared/src/schemas/tenant.schema.ts`
- `packages/shared/src/schemas/user.schema.ts`
- `packages/shared/src/schemas/rbac.schema.ts`
- `packages/shared/src/schemas/approval.schema.ts`
- `packages/shared/src/schemas/stripe-config.schema.ts`
- `packages/shared/src/schemas/ui-preferences.schema.ts`

### API — Auth Module
- `apps/api/src/modules/auth/dto/password-reset-confirm.dto.ts`
- `apps/api/src/modules/auth/dto/password-reset-request.dto.ts`
- `apps/api/src/modules/auth/dto/mfa-verify.dto.ts`
- `apps/api/src/modules/auth/dto/switch-tenant.dto.ts`

### API — Tenants Module
- `apps/api/src/modules/tenants/tenants.module.ts`
- `apps/api/src/modules/tenants/tenants.controller.ts`
- `apps/api/src/modules/tenants/tenants.service.ts`
- `apps/api/src/modules/tenants/domains.controller.ts`
- `apps/api/src/modules/tenants/domains.service.ts`
- `apps/api/src/modules/tenants/dto/create-tenant.dto.ts`
- `apps/api/src/modules/tenants/dto/update-tenant.dto.ts`
- `apps/api/src/modules/tenants/dto/create-domain.dto.ts`
- `apps/api/src/modules/tenants/dto/update-domain.dto.ts`
- `apps/api/src/modules/tenants/guards/platform-owner.guard.ts`

### API — Configuration Module
- `apps/api/src/modules/configuration/configuration.module.ts`
- `apps/api/src/modules/configuration/encryption.service.ts`
- `apps/api/src/modules/configuration/branding.controller.ts`
- `apps/api/src/modules/configuration/branding.service.ts`
- `apps/api/src/modules/configuration/settings.controller.ts`
- `apps/api/src/modules/configuration/settings.service.ts`
- `apps/api/src/modules/configuration/stripe-config.controller.ts`
- `apps/api/src/modules/configuration/stripe-config.service.ts`
- `apps/api/src/modules/configuration/notification-settings.controller.ts`
- `apps/api/src/modules/configuration/notification-settings.service.ts`

### API — RBAC Module
- `apps/api/src/modules/rbac/rbac.module.ts`
- `apps/api/src/modules/rbac/roles.controller.ts`
- `apps/api/src/modules/rbac/roles.service.ts`
- `apps/api/src/modules/rbac/memberships.controller.ts`
- `apps/api/src/modules/rbac/memberships.service.ts`
- `apps/api/src/modules/rbac/invitations.controller.ts`
- `apps/api/src/modules/rbac/invitations.service.ts`

### API — Approvals Module
- `apps/api/src/modules/approvals/approvals.module.ts`
- `apps/api/src/modules/approvals/approval-workflows.controller.ts`
- `apps/api/src/modules/approvals/approval-workflows.service.ts`
- `apps/api/src/modules/approvals/approval-requests.controller.ts`
- `apps/api/src/modules/approvals/approval-requests.service.ts`

### API — Preferences Module
- `apps/api/src/modules/preferences/preferences.module.ts`
- `apps/api/src/modules/preferences/preferences.controller.ts`
- `apps/api/src/modules/preferences/preferences.service.ts`

### API — Common Infrastructure
- `apps/api/src/common/services/permission-cache.service.ts`

### Frontend — Auth Pages
- `apps/web/src/providers/auth-provider.tsx`
- `apps/web/src/app/[locale]/(auth)/layout.tsx`
- `apps/web/src/app/[locale]/(auth)/login/page.tsx`
- `apps/web/src/app/[locale]/(auth)/reset-password/page.tsx`
- `apps/web/src/app/[locale]/(auth)/mfa-verify/page.tsx`
- `apps/web/src/app/[locale]/(auth)/select-school/page.tsx`
- `apps/web/src/app/[locale]/(auth)/register/page.tsx`

### Frontend — Platform Admin
- `apps/web/src/components/data-table.tsx`
- `apps/web/src/components/page-header.tsx`
- `apps/web/src/app/[locale]/(platform)/admin/page.tsx`
- `apps/web/src/app/[locale]/(platform)/admin/tenants/page.tsx`
- `apps/web/src/app/[locale]/(platform)/admin/tenants/new/page.tsx`
- `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/page.tsx`

### Frontend — School Configuration
- `apps/web/src/app/[locale]/(school)/settings/layout.tsx`
- `apps/web/src/app/[locale]/(school)/settings/page.tsx` (redirect to branding)
- `apps/web/src/app/[locale]/(school)/settings/branding/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/general/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/stripe/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/notifications/page.tsx`

### Frontend — User/Role Management
- `apps/web/src/app/[locale]/(school)/settings/users/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/invitations/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/roles/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/roles/new/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/roles/[id]/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/roles/_components/permission-picker.tsx`

### Frontend — Profile & Preferences
- `apps/web/src/app/[locale]/(school)/profile/page.tsx`
- `apps/web/src/app/[locale]/(school)/profile/communication/page.tsx`
- `apps/web/src/components/user-menu.tsx`

---

## Files Modified

| File | Changes |
|------|---------|
| `packages/prisma/schema.prisma` | Complete rewrite: added 10 enums, 20 models with all relations, indexes, and constraints |
| `packages/prisma/seed.ts` | Complete rewrite: 7-step seed (extensions → trigger function → permissions → system roles → dev tenants → dev users → Redis) |
| `packages/shared/src/index.ts` | Added exports for all new types, schemas, and constants |
| `packages/shared/src/schemas/auth.schema.ts` | Added passwordResetConfirmSchema, mfaVerifySchema, mfaRecoverySchema, switchTenantSchema; extended loginSchema with tenant_id and mfa_code |
| `apps/api/src/modules/auth/auth.service.ts` | Complete rewrite: replaced 501 stubs with 13 full methods (login, refresh, logout, MFA, password reset, sessions) |
| `apps/api/src/modules/auth/auth.controller.ts` | Complete rewrite: 12 endpoints replacing 501 stubs |
| `apps/api/src/modules/auth/auth.module.ts` | Added PermissionCacheService, new module imports |
| `apps/api/src/app.module.ts` | Added TenantsModule, ConfigurationModule, PreferencesModule, RbacModule, ApprovalsModule imports |
| `apps/api/src/main.ts` | Added cookie-parser middleware |
| `apps/api/src/modules/config/env.validation.ts` | Added ENCRYPTION_KEY, PLATFORM_DOMAIN, MFA_ISSUER validation |
| `apps/api/src/common/middleware/tenant-resolution.middleware.ts` | Real implementation: hostname → Redis cache → DB query → status check |
| `apps/api/src/common/guards/permission.guard.ts` | Real implementation: metadata → PermissionCacheService → enforce |
| `apps/api/src/common/guards/module-enabled.guard.ts` | Real implementation: Redis cache → DB fallback → enforce |
| `apps/web/src/app/[locale]/(platform)/layout.tsx` | Added sidebar navigation (Dashboard, Tenants, Health links) |
| `apps/web/src/app/[locale]/(school)/layout.tsx` | Added settings and profile navigation links |
| `apps/web/messages/en.json` | Added auth, settings, users, roles, platform, profile translation keys |
| `apps/web/messages/ar.json` | Added matching Arabic translation keys |
| `scripts/post-migrate.ts` | Fixed path resolution (added `..` for correct relative path from scripts/) |

---

## Known Limitations

1. **Email delivery not implemented**: Password reset and invitation flows generate tokens but do not send emails. Email integration is deferred to a later phase (communications module).

2. **Logo upload storage**: BrandingService.uploadLogo stores logo via S3Service but actual S3 bucket configuration is environment-dependent. Works with the S3 mock/local setup from P0.

3. **RLS bypass for tenant resolution**: The tenant resolution middleware queries `tenant_domains` which has RLS. In dev, this works because PostgreSQL `postgres` superuser bypasses RLS. Production deployments need a `BYPASSRLS` role for the connection used by the middleware, or a separate non-RLS lookup table.

4. **Platform owner identification**: Uses a Redis set (`platform_owner_user_ids`) populated during seeding rather than a formal user-tenant link. This is by design — platform_owner has no tenant_id, and membership_roles require tenant_memberships which are tenant-scoped.

5. **Frontend auth protection**: Uses client-side `RequireAuth` wrapper (redirects to login) rather than Next.js middleware, because JWT is stored in memory (not in cookies accessible to middleware). This means the initial page load will briefly show before redirect.

6. **No parent registration backend**: The parent registration page (frontend) collects data but the backend endpoint for creating parent users from the public registration form is not implemented. Parent creation currently only works through the invitation flow.

7. **Approval workflow execution**: The approval engine tracks requests and state transitions but does not execute the approved action (e.g., actually publishing an announcement or issuing an invoice). Execution hooks will be added when the respective domain modules are built in later phases.
