# Session 3D -- Platform Users & Navigation Redesign

**Session:** 3D
**Layer:** 3 (Polish & Operations)
**Dependencies:** Sessions 3B and 3C must be complete (their pages need sidebar entries)
**Estimated effort:** Single session

---

## 1. Objective

Three deliverables:

1. **Platform Users table** -- Replace the Redis-set approach (`platform_owner_user_ids`) with a proper `platform_users` table. Two roles: `platform_owner` (full access) and `platform_support` (read + impersonate, blocked from destructive actions).
2. **Navigation Redesign** -- Grouped sidebar with sections (Overview, Tenants, Operations, Compliance, Settings), collapsible groups, active page highlight, badge counts on Alerts and Security Incidents.
3. **Global Search** -- Command palette (Cmd+K) that searches across tenants, users, alerts, and jobs. Results grouped by type.

---

## 2. Database

### 2.1 New Enum: `PlatformUserRole`

```prisma
enum PlatformUserRole {
  platform_owner
  platform_support
}
```

### 2.2 New Table: `platform_users`

**RLS:** NO (platform-level table, no `tenant_id`)

```prisma
/// Platform-level table -- NOT tenant-scoped, no RLS
model PlatformUser {
  id          String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id     String            @unique @db.Uuid
  role        PlatformUserRole
  invited_by  String?           @db.Uuid
  invited_at  DateTime?         @db.Timestamptz()
  is_active   Boolean           @default(true)
  created_at  DateTime          @default(now()) @db.Timestamptz()
  updated_at  DateTime          @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  user        User              @relation("platform_user_link", fields: [user_id], references: [id], onDelete: Cascade)
  inviter     User?             @relation("platform_user_inviter", fields: [invited_by], references: [id], onDelete: SetNull)

  @@index([role], name: "idx_platform_users_role")
  @@map("platform_users")
}
```

Add relations to `User` model:

```prisma
// In model User
platform_user          PlatformUser?  @relation("platform_user_link")
platform_users_invited PlatformUser[] @relation("platform_user_inviter")
```

### 2.3 Migration

**File:** `packages/prisma/migrations/YYYYMMDDHHMMSS_add_platform_users_table/migration.sql`

```sql
-- CreateEnum
CREATE TYPE "PlatformUserRole" AS ENUM ('platform_owner', 'platform_support');

-- CreateTable
CREATE TABLE "platform_users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "role" "PlatformUserRole" NOT NULL,
  "invited_by" UUID,
  "invited_at" TIMESTAMPTZ,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_users_user_id_key" UNIQUE ("user_id")
);

-- CreateIndex
CREATE INDEX "idx_platform_users_role" ON "platform_users" ("role");

-- AddForeignKeys
ALTER TABLE "platform_users"
  ADD CONSTRAINT "platform_users_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "platform_users"
  ADD CONSTRAINT "platform_users_invited_by_fkey"
  FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

**NO RLS policy.**

### 2.4 Data Migration

A data migration script that seeds the `platform_users` table from existing sources:

1. Read the `platform_owner_user_ids` Redis set
2. For each user ID in the set, insert into `platform_users` with `role: 'platform_owner'`
3. Also check the seed data for any hardcoded platform owner user IDs and ensure they are included

This can be a standalone script or part of the migration. Recommended approach: a migration SQL that inserts from known seed user IDs, plus a runtime check in the updated guard.

```sql
-- Data migration: insert known platform owners from seed
-- This should be customised with the actual user IDs from the seed script
-- The guard will also fall back to the Redis set during rollout
```

Since the seed data creates the platform owner dynamically, the safest approach is to run the data migration at application startup (in `onModuleInit` of the updated `PlatformOwnerGuard` or a dedicated migration service).

---

## 3. Backend

### 3.1 Updated Guard: `PlatformOwnerGuard`

**File:** `apps/api/src/modules/tenants/guards/platform-owner.guard.ts`

Updated logic:

```typescript
async canActivate(context: ExecutionContext): Promise<boolean> {
  const request = context.switchToHttp().getRequest<{ currentUser?: JwtPayload }>();
  const user = request.currentUser;

  if (!user) {
    throw new UnauthorizedException('Authentication required');
  }

  const client = this.redis.getClient();

  // 1. Check per-user cache first (fast path)
  const userCacheKey = `is_platform_user:${user.sub}`;
  const cached = await client.get(userCacheKey);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (parsed.is_platform_user) {
      // Attach role to request for downstream guards
      (request as any).__platformUserRole = parsed.role;
      return true;
    }
    throw new ForbiddenException({
      code: 'PLATFORM_ACCESS_DENIED',
      message: 'Platform access required',
    });
  }

  // 2. Check platform_users table
  const platformUser = await this.prisma.platformUser.findUnique({
    where: { user_id: user.sub },
  });

  if (platformUser && platformUser.is_active) {
    // Cache positive result
    await client.setex(
      userCacheKey,
      CACHE_TTL,
      JSON.stringify({ is_platform_user: true, role: platformUser.role }),
    );
    (request as any).__platformUserRole = platformUser.role;
    return true;
  }

  // 3. Fallback: check legacy Redis set (during rollout)
  const legacyMember = await client.sismember('platform_owner_user_ids', user.sub);
  if (legacyMember) {
    // Auto-migrate: insert into platform_users table
    try {
      await this.prisma.platformUser.upsert({
        where: { user_id: user.sub },
        update: { is_active: true },
        create: {
          user_id: user.sub,
          role: 'platform_owner',
          is_active: true,
        },
      });
    } catch {
      // Non-fatal: race condition or constraint violation
    }
    await client.setex(
      userCacheKey,
      CACHE_TTL,
      JSON.stringify({ is_platform_user: true, role: 'platform_owner' }),
    );
    (request as any).__platformUserRole = 'platform_owner';
    return true;
  }

  // 4. Not a platform user
  await client.setex(
    userCacheKey,
    60, // shorter TTL for negative cache
    JSON.stringify({ is_platform_user: false }),
  );
  throw new ForbiddenException({
    code: 'PLATFORM_ACCESS_DENIED',
    message: 'Platform access required',
  });
}
```

Note on `(request as any).__platformUserRole`: This is the pattern to pass the role to the `PlatformRoleGuard`. A cleaner alternative is to use a custom decorator/metadata, but given the guard executes early and the request object is the shared context, this is pragmatic. Document the pattern clearly.

### 3.2 New Guard: `PlatformRoleGuard`

**File:** `apps/api/src/modules/tenants/guards/platform-role.guard.ts`

A guard that enforces minimum role level. Used on specific routes where `platform_support` should be blocked.

```typescript
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const ROLE_HIERARCHY: Record<string, number> = {
  platform_support: 1,
  platform_owner: 2,
};

export const PLATFORM_MIN_ROLE_KEY = 'platform_min_role';

export function PlatformMinRole(role: 'platform_owner' | 'platform_support') {
  return (target: object, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (propertyKey && descriptor) {
      Reflect.defineMetadata(PLATFORM_MIN_ROLE_KEY, role, descriptor.value);
    } else {
      Reflect.defineMetadata(PLATFORM_MIN_ROLE_KEY, role, target);
    }
  };
}

@Injectable()
export class PlatformRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const minRole = this.reflector.getAllAndOverride<string | undefined>(PLATFORM_MIN_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no minimum role specified, allow all platform users
    if (!minRole) return true;

    const request = context.switchToHttp().getRequest();
    const userRole = request.__platformUserRole as string | undefined;

    if (!userRole) {
      throw new ForbiddenException({
        code: 'PLATFORM_ROLE_REQUIRED',
        message: 'Platform role not determined',
      });
    }

    const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;

    if (userLevel < requiredLevel) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_PLATFORM_ROLE',
        message: `This action requires ${minRole} role`,
      });
    }

    return true;
  }
}
```

**Usage on controller routes:**

Routes that `platform_support` should NOT access:

```typescript
@Post('tenants/:id/suspend')
@PlatformMinRole('platform_owner')
async suspendTenant(...) { ... }

@Post('tenants/:id/archive')
@PlatformMinRole('platform_owner')
async archiveTenant(...) { ... }

@Delete('tenants/:id')
@PlatformMinRole('platform_owner')
async deleteTenant(...) { ... }

@Post('tenants/:id/transfer-ownership')
@PlatformMinRole('platform_owner')
async transferOwnership(...) { ... }

@Post('users/:id/disable')
@PlatformMinRole('platform_owner')
async disableUser(...) { ... }
```

All other routes (including impersonate, read operations, unlock, reset-password) are accessible to both roles.

### 3.3 New Service: `PlatformUsersService`

**File:** `apps/api/src/modules/tenants/platform-users.service.ts`

**Constructor DI:**

```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly redis: RedisService,
  private readonly resendEmail: ResendEmailProvider,
)
```

**Methods:**

#### `listPlatformUsers(): Promise<PlatformUserWithUser[]>`

```typescript
interface PlatformUserWithUser {
  id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  invited_at: string | null;
  created_at: string;
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    last_login_at: string | null;
  };
  inviter: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  } | null;
}
```

Query `platform_users` with includes for `user` and `inviter`. Order by `created_at` ASC.

#### `invitePlatformUser(email: string, role: PlatformUserRole, actorId: string): Promise<PlatformUser>`

1. Check if user with this email already exists in the `users` table
2. If user exists:
   a. Check if already a platform user -- if so, throw `ConflictException({ code: 'ALREADY_PLATFORM_USER', ... })`
   b. Create `platform_users` record with `user_id`, `role`, `invited_by: actorId`, `invited_at: now()`
   c. Send notification email: "You have been added as a {role} on the EduPod platform"
3. If user does NOT exist:
   a. Create user record with email, temporary password hash (or trigger invite flow)
   b. Create `platform_users` record
   c. Send invite email with setup link
4. Invalidate Redis cache for the new user: delete `is_platform_user:{user_id}`
5. Add to legacy Redis set for backward compatibility: `SADD platform_owner_user_ids {user_id}` (only if role is `platform_owner`)
6. Return the created record

#### `updatePlatformUser(platformUserId: string, data: { role?: PlatformUserRole; is_active?: boolean }): Promise<PlatformUser>`

1. Find platform user or throw `NotFoundException`
2. Prevent deactivating the last active platform_owner:
   - If setting `is_active = false` and the user's role is `platform_owner`:
     - Count remaining active platform_owners
     - If count would become 0, throw `BadRequestException({ code: 'LAST_OWNER', message: 'Cannot deactivate the last platform owner' })`
3. Update record
4. Invalidate Redis cache: delete `is_platform_user:{user_id}`
5. If role changed: update legacy Redis set (add/remove from `platform_owner_user_ids`)
6. If deactivated: delete all sessions for this user
7. Return updated record

#### `removePlatformUser(platformUserId: string): Promise<void>`

1. Find platform user or throw `NotFoundException`
2. Same last-owner check as deactivation
3. Delete the `platform_users` record
4. Invalidate Redis cache
5. Remove from legacy Redis set
6. Delete all sessions for this user

### 3.4 Global Search Endpoint

**File:** Add to `TenantsController` or create a new `PlatformSearchController`.

Recommended: add to `TenantsController` since it already has the admin route prefix and guards.

```typescript
// GET /v1/admin/search?q=...
@Get('search')
async globalSearch(@Query('q') query: string) {
  return this.platformSearchService.search(query);
}
```

### 3.5 New Service: `PlatformSearchService`

**File:** `apps/api/src/modules/tenants/platform-search.service.ts`

**Constructor DI:**

```typescript
constructor(
  private readonly prisma: PrismaService,
)
```

**Method:**

#### `search(query: string): Promise<SearchResults>`

```typescript
interface SearchResults {
  tenants: Array<{ id: string; name: string; slug: string; status: string }>;
  users: Array<{
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    global_status: string;
  }>;
  alerts: Array<{
    id: string;
    message: string;
    severity: string;
    status: string;
    fired_at: string;
  }>;
}
```

Implementation:

1. If query is empty or less than 2 characters, return empty results
2. Search tenants: `prisma.tenant.findMany({ where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { slug: { contains: q, mode: 'insensitive' } }] }, take: 5 })`
3. Search users: `prisma.user.findMany({ where: { OR: [{ email: { contains: q, mode: 'insensitive' } }, { first_name: { contains: q, mode: 'insensitive' } }, { last_name: { contains: q, mode: 'insensitive' } }] }, take: 5 })`
4. Search alerts (from `platform_alert_history` if exists): `prisma.platformAlertHistory.findMany({ where: { message: { contains: q, mode: 'insensitive' } }, take: 5 })`
5. Return results grouped by type

### 3.6 Zod Schemas

**File:** `packages/shared/src/schemas/platform-users.ts`

```typescript
import { z } from 'zod';

export const invitePlatformUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['platform_owner', 'platform_support']),
});

export type InvitePlatformUserDto = z.infer<typeof invitePlatformUserSchema>;

export const updatePlatformUserSchema = z
  .object({
    role: z.enum(['platform_owner', 'platform_support']).optional(),
    is_active: z.boolean().optional(),
  })
  .refine((data) => data.role !== undefined || data.is_active !== undefined, {
    message: 'At least one field (role or is_active) must be provided',
  });

export type UpdatePlatformUserDto = z.infer<typeof updatePlatformUserSchema>;

export const globalSearchSchema = z.object({
  q: z.string().min(2).max(100),
});

export type GlobalSearchQuery = z.infer<typeof globalSearchSchema>;
```

**Export from:** `packages/shared/src/index.ts`.

### 3.7 Controller Updates

**File:** `apps/api/src/modules/tenants/tenants.controller.ts`

Add `PlatformRoleGuard` to the guard stack at class level:

```typescript
@Controller('v1/admin')
@UseGuards(AuthGuard, PlatformOwnerGuard, PlatformRoleGuard)
export class TenantsController { ... }
```

Add routes:

```typescript
// GET /v1/admin/platform-users
@Get('platform-users')
async listPlatformUsers() {
  return this.platformUsersService.listPlatformUsers();
}

// POST /v1/admin/platform-users
@Post('platform-users')
@PlatformMinRole('platform_owner')
async invitePlatformUser(
  @Body(new ZodValidationPipe(invitePlatformUserSchema)) dto: InvitePlatformUserDto,
  @CurrentUser() user: JwtPayload,
) {
  return this.platformUsersService.invitePlatformUser(dto.email, dto.role, user.sub);
}

// PATCH /v1/admin/platform-users/:id
@Patch('platform-users/:id')
@PlatformMinRole('platform_owner')
async updatePlatformUser(
  @Param('id', ParseUUIDPipe) id: string,
  @Body(new ZodValidationPipe(updatePlatformUserSchema)) dto: UpdatePlatformUserDto,
) {
  return this.platformUsersService.updatePlatformUser(id, dto);
}

// DELETE /v1/admin/platform-users/:id
@Delete('platform-users/:id')
@PlatformMinRole('platform_owner')
async removePlatformUser(@Param('id', ParseUUIDPipe) id: string) {
  return this.platformUsersService.removePlatformUser(id);
}

// GET /v1/admin/search
@Get('search')
async globalSearch(
  @Query(new ZodValidationPipe(globalSearchSchema)) query: GlobalSearchQuery,
) {
  return this.platformSearchService.search(query.q);
}
```

Add `@PlatformMinRole('platform_owner')` to existing destructive routes:

```typescript
@Post('tenants/:id/suspend')
@PlatformMinRole('platform_owner')
async suspendTenant(...) { ... }

@Post('tenants/:id/archive')
@PlatformMinRole('platform_owner')
async archiveTenant(...) { ... }

// From 3B:
@Post('users/:id/disable')
@PlatformMinRole('platform_owner')
async disableUser(...) { ... }

@Post('tenants/:id/transfer-ownership')
@PlatformMinRole('platform_owner')
async transferOwnership(...) { ... }
```

### 3.8 Module Updates

**File:** `apps/api/src/modules/tenants/tenants.module.ts`

Add `PlatformUsersService`, `PlatformSearchService`, `PlatformRoleGuard` to providers.

Final module shape:

```typescript
@Module({
  imports: [AuthModule, CommunicationsModule],
  controllers: [TenantsController, DomainsController],
  providers: [
    TenantsService,
    DomainsService,
    SequenceService,
    PlatformSupportService, // from 3B
    PlatformSessionService, // from 3C
    PlatformCacheService, // from 3C
    MaintenanceService, // from 3C
    PlatformUsersService, // from 3D
    PlatformSearchService, // from 3D
    PlatformRoleGuard, // from 3D
  ],
  exports: [TenantsService, SequenceService],
})
export class TenantsModule {}
```

---

## 4. Frontend

### 4.1 Platform Users Page

**File:** `apps/web/src/app/[locale]/(platform)/admin/platform-users/page.tsx`

**Behaviour:**

- Fetch `GET /v1/admin/platform-users` on mount
- DataTable with columns:
  - Name (`user.first_name` + `user.last_name`)
  - Email (`user.email`)
  - Role (badge: `platform_owner` = blue, `platform_support` = gray)
  - Status (badge: active = green, inactive = gray)
  - Last Login (`user.last_login_at`, relative time or "Never")
  - Invited By (`inviter.first_name` + `inviter.last_name` or "--")
  - Actions: Edit (opens dialog), Deactivate/Activate toggle, Remove
- **Invite** button at top-right opens `InviteDialog`
- Actions column: edit role (dropdown), toggle active/inactive, remove (with confirmation)
- Remove and role change only visible to `platform_owner` (check current user's role)

### 4.2 Invite Dialog

**File:** `apps/web/src/app/[locale]/(platform)/admin/platform-users/_components/invite-dialog.tsx`

**Behaviour:**

- Form with:
  - Email input (required, validated as email)
  - Role select: `Platform Owner` / `Platform Support`
- Submit calls `POST /v1/admin/platform-users`
- On success: close dialog, show success toast, refresh table
- On error: show error in dialog (e.g., "User is already a platform user")

Uses `react-hook-form` with `zodResolver(invitePlatformUserSchema)`.

### 4.3 Global Search (Command Palette)

**File:** `apps/web/src/app/[locale]/(platform)/admin/_components/global-search.tsx`

**Behaviour:**

- Triggered by Cmd+K (Mac) / Ctrl+K (Windows)
- Overlay dialog with search input at top
- As user types (debounced 300ms, minimum 2 chars), calls `GET /v1/admin/search?q=...`
- Results grouped by type:
  - **Tenants** section: tenant name + slug + status badge. Click navigates to `/admin/tenants/[id]`
  - **Users** section: user name + email + status badge. Click navigates to `/admin/users/[id]`
  - **Alerts** section: alert message + severity badge. Click navigates to `/admin/alerts`
- Keyboard navigation: up/down arrow to move through results, Enter to select
- Escape closes the palette
- When no results: "No results found for '{query}'"
- When loading: spinner in the input area

**Implementation:**

- Use `@school/ui` `Dialog` component or build a custom overlay
- Register keyboard shortcut in `useEffect` on the layout (or in this component)
- Render in the platform layout so it is available on all admin pages

### 4.4 Navigation Redesign

**File:** `apps/web/src/app/[locale]/(platform)/layout.tsx` (complete rewrite of the sidebar nav)

**New navigation structure:**

```
OVERVIEW (section header, not collapsible)
  Dashboard         /admin
  Health            /admin/health

TENANTS (section header)
  All Tenants       /admin/tenants
  Onboarding        /admin/onboarding

OPERATIONS (section header)
  Alerts & Rules    /admin/alerts            [badge: unacknowledged count]
  Queue Manager     /admin/queues
  Sessions & Cache  /admin/sessions

COMPLIANCE (section header)
  Audit Log         /admin/audit-log
  Security Incidents /admin/security-incidents [badge: open high-severity count]

SETTINGS (section header)
  Platform Users    /admin/platform-users
  Channel Config    /admin/channels
```

**Behaviour:**

- Section headers: uppercase, small, muted text, non-clickable
- Nav items: icon + label + optional badge
- Active page: highlighted with `bg-primary-50 text-primary-700`
- Sections are always expanded (no collapse needed for ~12 items)
- Badge counts fetched periodically (every 60 seconds):
  - Alerts badge: `GET /v1/admin/alerts/history?status=fired&pageSize=1` -> `meta.total`
  - Security Incidents badge: `GET /v1/admin/security-incidents?severity=high&pageSize=1` -> `meta.total`
- Mobile: off-canvas drawer (existing pattern preserved)
- Global search trigger: small search icon/input at the top of the sidebar, clicking it opens the Cmd+K palette

**Icons per nav item** (from `lucide-react`):

| Item               | Icon              |
| ------------------ | ----------------- |
| Dashboard          | `LayoutDashboard` |
| Health             | `Activity`        |
| All Tenants        | `Building2`       |
| Onboarding         | `ListChecks`      |
| Alerts & Rules     | `Bell`            |
| Queue Manager      | `Layers`          |
| Sessions & Cache   | `MonitorDot`      |
| Audit Log          | `ClipboardList`   |
| Security Incidents | `ShieldAlert`     |
| Platform Users     | `Users`           |
| Channel Config     | `Settings`        |

**Keyboard shortcuts:**

- Register in a `useEffect` at the layout level
- `Cmd+K` / `Ctrl+K`: open global search
- Key combos using `g` prefix (press `g`, then within 500ms press the second key):
  - `g` then `d`: navigate to Dashboard
  - `g` then `h`: navigate to Health
  - `g` then `t`: navigate to Tenants
  - `g` then `q`: navigate to Queue Manager
  - `g` then `a`: navigate to Alerts

**Implementation of `g` combos:**

```typescript
const [gPressed, setGPressed] = React.useState(false);
const gTimeout = React.useRef<NodeJS.Timeout>();

React.useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    // Skip if user is typing in an input/textarea
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;

    if (e.key === 'g' && !gPressed && !e.metaKey && !e.ctrlKey) {
      setGPressed(true);
      gTimeout.current = setTimeout(() => setGPressed(false), 500);
      return;
    }

    if (gPressed) {
      setGPressed(false);
      clearTimeout(gTimeout.current);
      const routes: Record<string, string> = {
        d: `/${locale}/admin`,
        h: `/${locale}/admin/health`,
        t: `/${locale}/admin/tenants`,
        q: `/${locale}/admin/queues`,
        a: `/${locale}/admin/alerts`,
      };
      if (routes[e.key]) {
        router.push(routes[e.key]);
      }
    }

    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setSearchOpen(true);
    }
  }

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [gPressed, locale, router]);
```

---

## 5. Files to Create

| File                                                                                      | Purpose                                                   |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `packages/prisma/migrations/YYYYMMDDHHMMSS_add_platform_users_table/migration.sql`        | Create `platform_users` table and `PlatformUserRole` enum |
| `packages/shared/src/schemas/platform-users.ts`                                           | Zod schemas for platform user CRUD and global search      |
| `apps/api/src/modules/tenants/guards/platform-role.guard.ts`                              | Role-based guard with `@PlatformMinRole` decorator        |
| `apps/api/src/modules/tenants/guards/platform-role.guard.spec.ts`                         | Unit tests for role guard                                 |
| `apps/api/src/modules/tenants/platform-users.service.ts`                                  | Platform user CRUD logic                                  |
| `apps/api/src/modules/tenants/platform-users.service.spec.ts`                             | Unit tests for platform users service                     |
| `apps/api/src/modules/tenants/platform-search.service.ts`                                 | Global search across entities                             |
| `apps/api/src/modules/tenants/platform-search.service.spec.ts`                            | Unit tests for search service                             |
| `apps/web/src/app/[locale]/(platform)/admin/platform-users/page.tsx`                      | Platform users management page                            |
| `apps/web/src/app/[locale]/(platform)/admin/platform-users/_components/invite-dialog.tsx` | Invite platform user dialog                               |
| `apps/web/src/app/[locale]/(platform)/admin/_components/global-search.tsx`                | Command palette component                                 |

## 6. Files to Modify

| File                                                               | Change                                                                                                                                       |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/prisma/schema.prisma`                                    | Add `PlatformUserRole` enum, `PlatformUser` model, relations on `User`                                                                       |
| `packages/shared/src/index.ts`                                     | Export new schemas from `platform-users.ts`                                                                                                  |
| `apps/api/src/modules/tenants/guards/platform-owner.guard.ts`      | Rewrite to check `platform_users` table with Redis cache, fallback to legacy Redis set                                                       |
| `apps/api/src/modules/tenants/guards/platform-owner.guard.spec.ts` | Update tests for new guard logic (table check, cache, fallback)                                                                              |
| `apps/api/src/modules/tenants/tenants.controller.ts`               | Add `PlatformRoleGuard` to class-level guards; add 5 new routes (platform-users CRUD + search); add `@PlatformMinRole` to destructive routes |
| `apps/api/src/modules/tenants/tenants.controller.spec.ts`          | Add tests for new routes and role enforcement                                                                                                |
| `apps/api/src/modules/tenants/tenants.module.ts`                   | Add `PlatformUsersService`, `PlatformSearchService`, `PlatformRoleGuard` to providers                                                        |
| `apps/web/src/app/[locale]/(platform)/layout.tsx`                  | Complete rewrite of sidebar navigation (grouped sections, badges, keyboard shortcuts, global search integration)                             |

---

## 7. Testing Strategy

### Unit Tests

#### `platform-role.guard.spec.ts`

1. Allows access when no `@PlatformMinRole` decorator is set
2. Allows `platform_owner` to access `platform_owner`-only routes
3. Blocks `platform_support` from `platform_owner`-only routes with correct error
4. Allows `platform_support` to access routes with no minimum role
5. Throws when `__platformUserRole` is not set on request

#### `platform-users.service.spec.ts`

1. **listPlatformUsers** -- returns all platform users with user details
2. **invitePlatformUser**
   - User exists, not a platform user: creates record, sends email
   - User exists, already a platform user: throws ConflictException
   - User does not exist: creates user + platform_user record, sends invite
3. **updatePlatformUser**
   - Updates role successfully
   - Prevents deactivating last platform_owner
   - Deactivation deletes user sessions
4. **removePlatformUser**
   - Removes record and invalidates cache
   - Prevents removing last platform_owner

#### `platform-search.service.spec.ts`

1. Searches across tenants, users, and alerts
2. Returns empty results for short queries (< 2 chars)
3. Respects `take: 5` limit per category
4. Case-insensitive search works

#### `platform-owner.guard.spec.ts` (update existing)

1. Allows access when user is in `platform_users` table with `is_active = true`
2. Blocks access when user is in table with `is_active = false`
3. Allows access from Redis cache hit (positive)
4. Blocks access from Redis cache hit (negative)
5. Falls back to legacy Redis set and auto-migrates to table
6. Blocks when user is not in table or Redis set

### Controller Tests

- `GET /v1/admin/platform-users` returns list
- `POST /v1/admin/platform-users` requires `platform_owner` role
- `PATCH /v1/admin/platform-users/:id` requires `platform_owner` role
- `DELETE /v1/admin/platform-users/:id` requires `platform_owner` role
- `GET /v1/admin/search` returns grouped results
- `POST /v1/admin/tenants/:id/suspend` blocked for `platform_support`
- `POST /v1/admin/tenants/:id/archive` blocked for `platform_support`

### Manual Verification

- Platform users page shows correct users with roles
- Invite flow: enter email + select role -> user receives email -> appears in table
- Role change: change from support to owner -> takes effect on next request
- Deactivate: user can no longer access admin dashboard
- Remove: user is removed from table and from Redis cache
- Global search (Cmd+K): finds tenants by name, users by email, alerts by message
- Keyboard navigation in search palette works (up/down/enter/escape)
- Sidebar shows grouped navigation with correct section headers
- Badge counts on Alerts and Security Incidents update every 60s
- Keyboard shortcuts: Cmd+K opens search, g+d goes to dashboard, g+t goes to tenants
- `platform_support` user can access read routes but is blocked from suspend/archive/disable

---

## 8. Acceptance Criteria

- [ ] `platform_users` table exists with correct schema
- [ ] `PlatformUserRole` enum has `platform_owner` and `platform_support` values
- [ ] Data migration seeds existing platform owners from Redis set into `platform_users` table
- [ ] `PlatformOwnerGuard` checks `platform_users` table first, falls back to Redis set
- [ ] `PlatformOwnerGuard` auto-migrates Redis set users to table on first access
- [ ] `PlatformOwnerGuard` caches results in Redis with correct TTL
- [ ] `PlatformRoleGuard` enforces minimum role level
- [ ] `platform_support` can access read + impersonate endpoints
- [ ] `platform_support` is blocked from suspend, archive, delete, disable, transfer-ownership
- [ ] `GET /v1/admin/platform-users` returns all platform users with user details
- [ ] `POST /v1/admin/platform-users` creates a platform user and sends invite email
- [ ] `PATCH /v1/admin/platform-users/:id` updates role or active status
- [ ] Cannot deactivate/remove the last active `platform_owner`
- [ ] `DELETE /v1/admin/platform-users/:id` removes user and invalidates sessions/cache
- [ ] `GET /v1/admin/search?q=...` returns results across tenants, users, alerts
- [ ] Platform Users page UI shows DataTable with correct columns
- [ ] Invite dialog uses react-hook-form with zodResolver
- [ ] Global search opens with Cmd+K, shows grouped results, supports keyboard navigation
- [ ] Sidebar navigation uses grouped sections matching design spec
- [ ] Badge counts shown on Alerts and Security Incidents
- [ ] Keyboard shortcuts work (Cmd+K, g+d, g+h, g+t, g+q, g+a)
- [ ] All unit tests pass
- [ ] `turbo lint` and `turbo type-check` pass
- [ ] `turbo test` passes with zero regressions
