# Session 3B -- Support Toolkit

**Session:** 3B
**Layer:** 3 (Polish & Operations)
**Dependencies:** Layer 1 + Layer 2 complete
**Estimated effort:** Single session

---

## 1. Objective

Implement all 6 platform support actions with a full audit trail. Every support action performed by a platform admin is recorded in the `platform_audit_actions` table with actor, action type, target, metadata, and timestamp. Actions are accessible from the tenant detail page and a dedicated user search/detail view.

The 6 support actions:

1. **Password reset** -- trigger password reset email via Resend; platform never sees the password
2. **MFA reset** -- disable MFA so the user can re-enrol (already exists at `POST /v1/admin/users/:id/reset-mfa`; this session wraps it with audit logging and frontend UI)
3. **Re-send welcome invite** -- regenerate invitation token, send invite email for expired/uncompleted invitations
4. **Unlock account** -- clear brute-force lockout in Redis (`brute_force:*` keys)
5. **Transfer ownership** -- reassign tenant `school_owner` role from current owner to a specified user
6. **Disable/Enable user** -- toggle `user.global_status` between `active` and `disabled` at platform level, invalidating all sessions on disable

---

## 2. Database

### 2.1 New Table: `platform_audit_actions`

**RLS:** NO (platform-level table, no `tenant_id`)

```prisma
enum PlatformAuditActionType {
  password_reset
  mfa_reset
  resend_invite
  unlock_account
  transfer_ownership
  disable_user
  enable_user
}

/// Platform-level table -- NOT tenant-scoped, no RLS
model PlatformAuditAction {
  id          String                   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  actor_id    String                   @db.Uuid
  action_type PlatformAuditActionType
  target_user_id String?              @db.Uuid
  target_tenant_id String?            @db.Uuid
  metadata    Json?                    @db.JsonB
  created_at  DateTime                 @default(now()) @db.Timestamptz()

  // Relations
  actor       User                     @relation("audit_actor", fields: [actor_id], references: [id], onDelete: Cascade)
  target_user User?                    @relation("audit_target_user", fields: [target_user_id], references: [id], onDelete: SetNull)
  target_tenant Tenant?                @relation(fields: [target_tenant_id], references: [id], onDelete: SetNull)

  @@index([actor_id], name: "idx_platform_audit_actions_actor")
  @@index([target_user_id], name: "idx_platform_audit_actions_target_user")
  @@index([target_tenant_id], name: "idx_platform_audit_actions_target_tenant")
  @@index([action_type, created_at], name: "idx_platform_audit_actions_type_date")
  @@map("platform_audit_actions")
}
```

### 2.2 Prisma Schema Updates

Add to `packages/prisma/schema.prisma`:

1. Add the `PlatformAuditActionType` enum (after existing enums near line 40)
2. Add the `PlatformAuditAction` model (in the Platform & Tenancy section)
3. Add relations to the `User` model:
   ```prisma
   // In model User
   audit_actions_performed PlatformAuditAction[] @relation("audit_actor")
   audit_actions_received  PlatformAuditAction[] @relation("audit_target_user")
   ```
4. Add relation to the `Tenant` model:
   ```prisma
   // In model Tenant
   platform_audit_actions PlatformAuditAction[]
   ```

### 2.3 Migration

**File:** `packages/prisma/migrations/YYYYMMDDHHMMSS_add_platform_audit_actions_table/migration.sql`

```sql
-- CreateEnum
CREATE TYPE "PlatformAuditActionType" AS ENUM (
  'password_reset',
  'mfa_reset',
  'resend_invite',
  'unlock_account',
  'transfer_ownership',
  'disable_user',
  'enable_user'
);

-- CreateTable
CREATE TABLE "platform_audit_actions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_id" UUID NOT NULL,
  "action_type" "PlatformAuditActionType" NOT NULL,
  "target_user_id" UUID,
  "target_tenant_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "platform_audit_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "idx_platform_audit_actions_actor" ON "platform_audit_actions" ("actor_id");
CREATE INDEX "idx_platform_audit_actions_target_user" ON "platform_audit_actions" ("target_user_id");
CREATE INDEX "idx_platform_audit_actions_target_tenant" ON "platform_audit_actions" ("target_tenant_id");
CREATE INDEX "idx_platform_audit_actions_type_date" ON "platform_audit_actions" ("action_type", "created_at");

-- AddForeignKeys
ALTER TABLE "platform_audit_actions"
  ADD CONSTRAINT "platform_audit_actions_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_audit_actions"
  ADD CONSTRAINT "platform_audit_actions_target_user_id_fkey"
  FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "platform_audit_actions"
  ADD CONSTRAINT "platform_audit_actions_target_tenant_id_fkey"
  FOREIGN KEY ("target_tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

**NO RLS policy.** This table is platform-level. Do NOT add `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.

---

## 3. Backend

### 3.1 New Service: `PlatformSupportService`

**File:** `apps/api/src/modules/tenants/platform-support.service.ts`

**Constructor DI:**

```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly redis: RedisService,
  private readonly authService: AuthService,
  private readonly resendEmail: ResendEmailProvider,
  private readonly securityAuditService: SecurityAuditService,
)
```

**Methods:**

#### `resetPassword(targetUserId: string, actorId: string): Promise<{ message: string }>`

1. Find user by ID or throw `NotFoundException`
2. Call `this.authService.requestPasswordReset(user.email)` to generate token and (if Resend is configured) send email
3. Write audit record: `action_type: 'password_reset'`, `target_user_id`, `actor_id`, `metadata: { email: user.email }`
4. Return `{ message: 'Password reset email triggered' }`

#### `resendInvite(targetUserId: string, actorId: string): Promise<{ message: string }>`

1. Find user by ID or throw `NotFoundException`
2. Find the most recent pending invitation for this user's email:
   ```
   prisma.invitation.findFirst({
     where: { email: user.email, status: 'pending' },
     orderBy: { created_at: 'desc' },
   })
   ```
3. If no pending invitation found, throw `BadRequestException({ code: 'NO_PENDING_INVITATION', ... })`
4. Generate new token hash, update the invitation record with new `token_hash` and extended `expires_at` (48 hours from now)
5. Send invite email via `ResendEmailProvider` with the new token
6. Write audit record: `action_type: 'resend_invite'`, `target_user_id`, `actor_id`, `metadata: { email: user.email, invitation_id: invitation.id }`
7. Return `{ message: 'Invitation re-sent' }`

#### `unlockAccount(targetUserId: string, actorId: string): Promise<{ message: string }>`

1. Find user by ID or throw `NotFoundException`
2. Delete Redis key `brute_force:${user.email}`
3. Write audit record: `action_type: 'unlock_account'`, `target_user_id`, `actor_id`, `metadata: { email: user.email }`
4. Return `{ message: 'Account unlocked' }`

#### `disableUser(targetUserId: string, actorId: string): Promise<{ message: string }>`

1. Find user by ID or throw `NotFoundException`
2. Prevent disabling yourself: if `targetUserId === actorId`, throw `BadRequestException({ code: 'CANNOT_DISABLE_SELF', ... })`
3. If `user.global_status === 'disabled'`, throw `BadRequestException({ code: 'ALREADY_DISABLED', ... })`
4. Update user: `global_status: 'disabled'`
5. Delete all sessions: `this.authService.deleteAllUserSessions(targetUserId)`
6. Write audit record: `action_type: 'disable_user'`, `target_user_id`, `actor_id`, `metadata: { email: user.email, previous_status: user.global_status }`
7. Return `{ message: 'User disabled' }`

#### `enableUser(targetUserId: string, actorId: string): Promise<{ message: string }>`

1. Find user by ID or throw `NotFoundException`
2. If `user.global_status !== 'disabled'`, throw `BadRequestException({ code: 'NOT_DISABLED', ... })`
3. Update user: `global_status: 'active'`
4. Write audit record: `action_type: 'enable_user'`, `target_user_id`, `actor_id`, `metadata: { email: user.email }`
5. Return `{ message: 'User enabled' }`

#### `transferOwnership(tenantId: string, newOwnerUserId: string, actorId: string): Promise<{ message: string }>`

1. Find tenant by ID or throw `NotFoundException`
2. Find current owner: query `membership_roles` joined with `roles` where `role_key = 'school_owner'` for this `tenant_id`
   ```
   prisma.membershipRole.findFirst({
     where: {
       tenant_id: tenantId,
       role: { role_key: 'school_owner' },
     },
     include: { membership: true, role: true },
   })
   ```
3. If no current owner found, throw `BadRequestException({ code: 'NO_CURRENT_OWNER', ... })`
4. Find new owner's membership at this tenant:
   ```
   prisma.tenantMembership.findUnique({
     where: { idx_tenant_memberships_tenant_user: { tenant_id: tenantId, user_id: newOwnerUserId } },
   })
   ```
5. If new owner has no active membership, throw `BadRequestException({ code: 'NEW_OWNER_NOT_MEMBER', ... })`
6. In a transaction (RLS-aware for tenant-scoped tables):
   a. Delete current owner's `membership_role` record for `school_owner`
   b. Find or create the `school_owner` role for this tenant
   c. Create `membership_role` record linking new owner's membership to `school_owner` role
7. Write audit record: `action_type: 'transfer_ownership'`, `target_tenant_id: tenantId`, `target_user_id: newOwnerUserId`, `actor_id`, `metadata: { previous_owner_user_id: currentOwner.membership.user_id, new_owner_user_id: newOwnerUserId }`
8. Return `{ message: 'Ownership transferred' }`

#### `listAuditActions(pagination: PaginationParams, filters?: { action_type?: string; actor_id?: string; target_user_id?: string }): Promise<PaginatedResult<PlatformAuditAction>>`

1. Build `where` clause from filters
2. Query `platform_audit_actions` with pagination, include `actor` (select id, email, first_name, last_name), `target_user` (same), `target_tenant` (select id, name, slug)
3. Order by `created_at` DESC
4. Return `{ data, meta: { page, pageSize, total } }`

### 3.2 MFA Reset Wrapper

The existing `POST /v1/admin/users/:id/reset-mfa` endpoint in `TenantsController` calls `tenantsService.resetUserMfa()`. This already works. The enhancement is:

1. In `resetUserMfa()`, after the existing logic, also write an audit record to `platform_audit_actions`:
   ```
   action_type: 'mfa_reset'
   target_user_id: userId
   actor_id: actorUserId
   metadata: { email: user.email }
   ```

This means `TenantsService.resetUserMfa()` needs access to the Prisma `platformAuditAction` model. The simplest approach: inject the audit writing into the existing method.

### 3.3 Controller Updates

**File:** `apps/api/src/modules/tenants/tenants.controller.ts`

Add the following routes to the existing `TenantsController` (which is already guarded by `AuthGuard` + `PlatformOwnerGuard`):

```typescript
// POST /v1/admin/users/:id/reset-password
@Post('users/:id/reset-password')
@HttpCode(HttpStatus.OK)
async resetUserPassword(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser() user: JwtPayload,
) {
  return this.platformSupportService.resetPassword(id, user.sub);
}

// POST /v1/admin/users/:id/resend-invite
@Post('users/:id/resend-invite')
@HttpCode(HttpStatus.OK)
async resendUserInvite(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser() user: JwtPayload,
) {
  return this.platformSupportService.resendInvite(id, user.sub);
}

// POST /v1/admin/users/:id/unlock
@Post('users/:id/unlock')
@HttpCode(HttpStatus.OK)
async unlockUser(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser() user: JwtPayload,
) {
  return this.platformSupportService.unlockAccount(id, user.sub);
}

// POST /v1/admin/users/:id/disable
@Post('users/:id/disable')
@HttpCode(HttpStatus.OK)
async disableUser(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser() user: JwtPayload,
) {
  return this.platformSupportService.disableUser(id, user.sub);
}

// POST /v1/admin/users/:id/enable
@Post('users/:id/enable')
@HttpCode(HttpStatus.OK)
async enableUser(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser() user: JwtPayload,
) {
  return this.platformSupportService.enableUser(id, user.sub);
}

// POST /v1/admin/tenants/:id/transfer-ownership
@Post('tenants/:id/transfer-ownership')
@HttpCode(HttpStatus.OK)
async transferOwnership(
  @Param('id', ParseUUIDPipe) id: string,
  @Body(new ZodValidationPipe(transferOwnershipSchema)) dto: TransferOwnershipDto,
  @CurrentUser() user: JwtPayload,
) {
  return this.platformSupportService.transferOwnership(id, dto.new_owner_user_id, user.sub);
}

// GET /v1/admin/audit-actions
@Get('audit-actions')
async listAuditActions(
  @Query(new ZodValidationPipe(listAuditActionsQuerySchema))
  query: z.infer<typeof listAuditActionsQuerySchema>,
) {
  return this.platformSupportService.listAuditActions(
    { page: query.page, pageSize: query.pageSize },
    { action_type: query.action_type, actor_id: query.actor_id, target_user_id: query.target_user_id },
  );
}
```

### 3.4 Zod Schemas

**File:** `packages/shared/src/schemas/platform-support.ts`

```typescript
import { z } from 'zod';

export const transferOwnershipSchema = z.object({
  new_owner_user_id: z.string().uuid(),
});

export type TransferOwnershipDto = z.infer<typeof transferOwnershipSchema>;

export const listAuditActionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  action_type: z
    .enum([
      'password_reset',
      'mfa_reset',
      'resend_invite',
      'unlock_account',
      'transfer_ownership',
      'disable_user',
      'enable_user',
    ])
    .optional(),
  actor_id: z.string().uuid().optional(),
  target_user_id: z.string().uuid().optional(),
});

export type ListAuditActionsQuery = z.infer<typeof listAuditActionsQuerySchema>;
```

**Export from:** `packages/shared/src/index.ts` (add the new schemas to the barrel export).

### 3.5 DTO Re-exports

**File:** `apps/api/src/modules/tenants/dto/transfer-ownership.dto.ts`

```typescript
import { transferOwnershipSchema } from '@school/shared';
import type { TransferOwnershipDto } from '@school/shared';

export { transferOwnershipSchema };
export type { TransferOwnershipDto };
```

### 3.6 Module Updates

**File:** `apps/api/src/modules/tenants/tenants.module.ts`

Add `PlatformSupportService` to providers. Import `CommunicationsModule` (for `ResendEmailProvider` access).

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommunicationsModule } from '../communications/communications.module';

import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { PlatformSupportService } from './platform-support.service';
import { SequenceService } from './sequence.service';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [AuthModule, CommunicationsModule],
  controllers: [TenantsController, DomainsController],
  providers: [TenantsService, DomainsService, SequenceService, PlatformSupportService],
  exports: [TenantsService, SequenceService],
})
export class TenantsModule {}
```

---

## 4. Frontend

### 4.1 Support Action Dialog

**File:** `apps/web/src/app/[locale]/(platform)/admin/_components/support-action-dialog.tsx`

A reusable confirmation dialog for support actions. Uses the existing `Dialog` component from `@school/ui`.

**Props:**

```typescript
interface SupportActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  variant: 'default' | 'destructive';
  onConfirm: () => Promise<void>;
}
```

**Behaviour:**

- Shows title, description, Cancel + Confirm buttons
- Confirm button shows loading spinner during `onConfirm` execution
- On success: close dialog, show success toast
- On error: show error toast, keep dialog open
- Destructive variant: red confirm button

### 4.2 Support Actions Panel

**File:** `apps/web/src/app/[locale]/(platform)/admin/_components/support-actions-panel.tsx`

A panel that renders all applicable support actions for a given user/tenant context.

**Props:**

```typescript
interface SupportActionsPanelProps {
  userId: string;
  userEmail: string;
  userStatus: string;
  tenantId?: string; // if viewing from tenant context
  tenantName?: string;
  isOwner?: boolean; // if user is current owner of the tenant
  onActionComplete: () => void; // callback to refresh parent data
}
```

**Renders:**

- **Reset Password** button -- always visible
- **Reset MFA** button -- always visible
- **Re-send Invite** button -- always visible (backend validates if there is a pending invitation)
- **Unlock Account** button -- always visible
- **Disable User** button -- visible when `userStatus !== 'disabled'`
- **Enable User** button -- visible when `userStatus === 'disabled'`
- **Transfer Ownership** button -- visible only when `tenantId` is provided and `isOwner === true`. Opens a dialog with a user picker to select the new owner.

Each button opens a `SupportActionDialog` with appropriate title/description.

### 4.3 Audit Actions Table

**File:** `apps/web/src/app/[locale]/(platform)/admin/_components/audit-actions-table.tsx`

**Props:**

```typescript
interface AuditActionsTableProps {
  targetUserId?: string; // filter by target user
  targetTenantId?: string; // filter by target tenant
  pageSize?: number; // default 10
}
```

**Behaviour:**

- Fetch `GET /v1/admin/audit-actions?target_user_id=...&pageSize=...`
- DataTable with columns: Action Type (badge), Actor (name + email), Target User (name + email), Target Tenant (name), Timestamp (relative)
- Pagination at bottom
- Action type badges: color-coded by type (destructive actions in red, info actions in blue)

### 4.4 User Search Page

**File:** `apps/web/src/app/[locale]/(platform)/admin/users/page.tsx`

A platform-level user search page.

**Behaviour:**

- Search input at top: searches by email, first name, last name
- Calls `GET /v1/admin/tenants` (existing) to get all tenants, then for each tenant fetches users -- OR -- add a simple `GET /v1/admin/users?search=...` endpoint that queries the `users` table directly (recommended, simpler)
- DataTable with columns: Name, Email, Status (badge), Last Login, Actions (link to detail)
- Click row or "View" action navigates to `/admin/users/[id]`

**Additional endpoint needed:** `GET /v1/admin/users` -- query the platform-level `users` table with search/pagination. Add to `TenantsController`:

```typescript
// GET /v1/admin/users
@Get('users')
async listUsers(
  @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
) {
  return this.platformSupportService.listUsers(query);
}
```

**Zod schema** (add to `packages/shared/src/schemas/platform-support.ts`):

```typescript
export const listUsersQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
  global_status: z.enum(['active', 'suspended', 'disabled']).optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
```

### 4.5 User Detail Page

**File:** `apps/web/src/app/[locale]/(platform)/admin/users/[id]/page.tsx`

**Behaviour:**

- Fetch user details: `GET /v1/admin/users/:id` (new endpoint, added to controller)
- Show user profile card: name, email, status, MFA enabled, last login, created date
- Show memberships: list of tenants this user belongs to, with role and status
- **Support Actions Panel** section: renders `<SupportActionsPanelProps>` for this user
- **Audit History** section: renders `<AuditActionsTable targetUserId={userId} />`

**Additional endpoint needed:** `GET /v1/admin/users/:id` -- fetch single user with memberships.

Add to `TenantsController`:

```typescript
// GET /v1/admin/users/:id
@Get('users/:id')
async getUser(@Param('id', ParseUUIDPipe) id: string) {
  return this.platformSupportService.getUser(id);
}
```

Note: This route must be placed BEFORE the dynamic `users/:id/reset-password` etc. routes. Actually, since the support action routes use a different HTTP method (POST), there is no conflict. The `GET users/:id` route is fine.

### 4.6 Tenant Detail Page Enhancement

**File:** `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/page.tsx` (modify)

Add two new sections at the bottom of the existing tenant detail page:

1. **Support Actions** -- identify the tenant owner user and render `<SupportActionsPanel>` with `tenantId`, `isOwner=true`
2. **Support Action History** -- render `<AuditActionsTable targetTenantId={tenantId} />`

---

## 5. Files to Create

| File                                                                                       | Purpose                                      |
| ------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `packages/prisma/migrations/YYYYMMDDHHMMSS_add_platform_audit_actions_table/migration.sql` | Migration for `platform_audit_actions` table |
| `packages/shared/src/schemas/platform-support.ts`                                          | Zod schemas for support actions              |
| `apps/api/src/modules/tenants/platform-support.service.ts`                                 | Support action business logic                |
| `apps/api/src/modules/tenants/platform-support.service.spec.ts`                            | Unit tests for support service               |
| `apps/api/src/modules/tenants/dto/transfer-ownership.dto.ts`                               | DTO re-export                                |
| `apps/web/src/app/[locale]/(platform)/admin/_components/support-action-dialog.tsx`         | Confirmation dialog component                |
| `apps/web/src/app/[locale]/(platform)/admin/_components/support-actions-panel.tsx`         | Support actions panel component              |
| `apps/web/src/app/[locale]/(platform)/admin/_components/audit-actions-table.tsx`           | Audit trail table component                  |
| `apps/web/src/app/[locale]/(platform)/admin/users/page.tsx`                                | User search page                             |
| `apps/web/src/app/[locale]/(platform)/admin/users/[id]/page.tsx`                           | User detail page                             |

## 6. Files to Modify

| File                                                               | Change                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `packages/prisma/schema.prisma`                                    | Add `PlatformAuditActionType` enum, `PlatformAuditAction` model, relations on `User` and `Tenant` |
| `packages/shared/src/index.ts`                                     | Export new schemas from `platform-support.ts`                                                     |
| `apps/api/src/modules/tenants/tenants.controller.ts`               | Add 8 new route handlers (6 support actions + list audit actions + list users + get user)         |
| `apps/api/src/modules/tenants/tenants.module.ts`                   | Add `PlatformSupportService` to providers, import `CommunicationsModule`                          |
| `apps/api/src/modules/tenants/tenants.service.ts`                  | Add audit record write to `resetUserMfa()`                                                        |
| `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/page.tsx` | Add Support Actions and Audit History sections                                                    |
| `apps/web/src/app/[locale]/(platform)/layout.tsx`                  | Add "Users" nav item (temporary, will be reorganised in 3D)                                       |

---

## 7. Testing Strategy

### Unit Tests

**File:** `apps/api/src/modules/tenants/platform-support.service.spec.ts`

Tests for each method:

1. **resetPassword**
   - Happy path: user exists, calls authService.requestPasswordReset, writes audit record
   - User not found: throws NotFoundException
   - Audit record created with correct action_type and metadata

2. **resendInvite**
   - Happy path: user exists, pending invitation exists, regenerates token, writes audit
   - No pending invitation: throws BadRequestException with code `NO_PENDING_INVITATION`

3. **unlockAccount**
   - Happy path: user exists, deletes Redis key, writes audit
   - User not found: throws NotFoundException

4. **disableUser**
   - Happy path: user exists, sets global_status to disabled, deletes sessions, writes audit
   - Cannot disable self: throws BadRequestException with code `CANNOT_DISABLE_SELF`
   - Already disabled: throws BadRequestException with code `ALREADY_DISABLED`

5. **enableUser**
   - Happy path: user exists with disabled status, sets to active, writes audit
   - Not disabled: throws BadRequestException with code `NOT_DISABLED`

6. **transferOwnership**
   - Happy path: tenant exists, current owner found, new owner has membership, transfer succeeds, writes audit
   - New owner not a member: throws BadRequestException with code `NEW_OWNER_NOT_MEMBER`
   - No current owner: throws BadRequestException with code `NO_CURRENT_OWNER`

7. **listAuditActions**
   - Returns paginated results with correct meta
   - Filters by action_type, actor_id, target_user_id

### Controller Tests

**File:** Update `apps/api/src/modules/tenants/tenants.controller.spec.ts`

- Each new endpoint returns 200 on success
- Each new endpoint returns 401 without auth
- Each new endpoint returns 403 without platform owner role

### Manual Verification

- Trigger each support action from the UI and verify:
  - Action completes successfully
  - Toast notification shown
  - Audit record appears in the audit table
  - For disable: user cannot log in
  - For unlock: user can log in again
  - For transfer ownership: new owner has school_owner role, old owner does not

---

## 8. Acceptance Criteria

- [ ] `platform_audit_actions` table exists with correct schema
- [ ] All 6 support action endpoints respond correctly (200 on success)
- [ ] All endpoints require `AuthGuard` + `PlatformOwnerGuard`
- [ ] Every action writes an audit record with correct `action_type`, `actor_id`, `target_user_id`, `metadata`
- [ ] `POST /v1/admin/users/:id/reset-password` triggers password reset email (or token generation if Resend not configured)
- [ ] `POST /v1/admin/users/:id/resend-invite` regenerates invitation token and sends email
- [ ] `POST /v1/admin/users/:id/unlock` clears `brute_force:*` Redis key for the user's email
- [ ] `POST /v1/admin/users/:id/disable` sets `global_status = 'disabled'` and invalidates all sessions
- [ ] `POST /v1/admin/users/:id/enable` sets `global_status = 'active'`
- [ ] `POST /v1/admin/tenants/:id/transfer-ownership` moves `school_owner` role to new user
- [ ] Transfer ownership validates new owner is a member of the tenant
- [ ] Disable user prevents self-disable
- [ ] `GET /v1/admin/audit-actions` returns paginated audit trail with filters
- [ ] User search page (`/admin/users`) works with search and pagination
- [ ] User detail page (`/admin/users/[id]`) shows profile, memberships, support actions, audit history
- [ ] Tenant detail page shows support actions and audit history sections
- [ ] `SupportActionDialog` shows loading state and handles errors gracefully
- [ ] All unit tests pass
- [ ] `turbo lint` and `turbo type-check` pass
- [ ] `turbo test` passes with zero regressions
