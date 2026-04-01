# Session 3C -- Session & Cache Management + Maintenance Mode

**Session:** 3C
**Layer:** 3 (Polish & Operations)
**Dependencies:** Layer 1 + Layer 2 complete
**Estimated effort:** Single session

---

## 1. Objective

Build full session visibility, cache control, and per-tenant maintenance mode:

- **Sessions:** Enumerate all active sessions from Redis, group by tenant, show user counts and last activity. Force-logout per tenant or per user.
- **Cache:** Show cache key counts per type (permissions, domains, modules) per tenant. Flush buttons scoped by tenant or global.
- **Maintenance Mode:** Per-tenant toggle that blocks mutation endpoints while allowing reads. Scheduled maintenance windows that auto-toggle on start/end times.

---

## 2. Database

### 2.1 Modified Table: `tenants`

Add two columns to the existing `Tenant` model in `packages/prisma/schema.prisma`:

```prisma
model Tenant {
  // ... existing fields ...
  maintenance_mode    Boolean  @default(false)
  maintenance_message String?  @db.Text
  // ... existing relations ...
  maintenance_windows TenantMaintenanceWindow[]
}
```

### 2.2 New Table: `tenant_maintenance_windows`

**RLS:** NO. This table has `tenant_id` as a FK to `tenants`, but it is NOT tenant-RLS-scoped. Platform admins manage it. Tenants never query it.

```prisma
/// Platform-managed table -- has tenant_id FK but NO RLS
model TenantMaintenanceWindow {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id   String   @db.Uuid
  starts_at   DateTime @db.Timestamptz()
  ends_at     DateTime @db.Timestamptz()
  message     String?  @db.Text
  created_by  String   @db.Uuid
  created_at  DateTime @default(now()) @db.Timestamptz()

  // Relations
  tenant    Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  creator   User   @relation(fields: [created_by], references: [id], onDelete: Cascade)

  @@index([tenant_id, starts_at], name: "idx_maintenance_windows_tenant_start")
  @@index([starts_at, ends_at], name: "idx_maintenance_windows_schedule")
  @@map("tenant_maintenance_windows")
}
```

Add relation to `User` model:

```prisma
// In model User
maintenance_windows_created TenantMaintenanceWindow[]
```

### 2.3 Migrations

#### Migration 1: Add maintenance fields to tenants

**File:** `packages/prisma/migrations/YYYYMMDDHHMMSS_add_tenant_maintenance_fields/migration.sql`

```sql
ALTER TABLE "tenants"
  ADD COLUMN "maintenance_mode" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "maintenance_message" TEXT;
```

#### Migration 2: Create maintenance windows table

**File:** `packages/prisma/migrations/YYYYMMDDHHMMSS_add_tenant_maintenance_windows_table/migration.sql`

```sql
CREATE TABLE "tenant_maintenance_windows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "starts_at" TIMESTAMPTZ NOT NULL,
  "ends_at" TIMESTAMPTZ NOT NULL,
  "message" TEXT,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "tenant_maintenance_windows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_maintenance_windows_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "tenant_maintenance_windows_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "tenant_maintenance_windows_time_check"
    CHECK ("ends_at" > "starts_at")
);

CREATE INDEX "idx_maintenance_windows_tenant_start"
  ON "tenant_maintenance_windows" ("tenant_id", "starts_at");

CREATE INDEX "idx_maintenance_windows_schedule"
  ON "tenant_maintenance_windows" ("starts_at", "ends_at");
```

**NO RLS policy.** Do NOT add `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.

These can be combined into a single migration if run together.

---

## 3. Backend

### 3.1 New Service: `PlatformSessionService`

**File:** `apps/api/src/modules/tenants/platform-session.service.ts`

**Constructor DI:**

```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly redis: RedisService,
)
```

**Methods:**

#### `listSessions(): Promise<TenantSessionGroup[]>`

```typescript
interface UserSession {
  session_id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  ip_address: string;
  user_agent: string;
  last_active_at: string;
  created_at: string;
}

interface TenantSessionGroup {
  tenant_id: string | null; // null = platform-level sessions (no tenant context)
  tenant_name: string | null;
  user_count: number;
  sessions: UserSession[];
}
```

Implementation:

1. Use Redis SCAN to find all keys matching `session:*` (use cursor-based scan, not KEYS)
2. For each session key, GET the value and parse as `SessionMetadata`
3. Collect unique `user_id` values, batch-fetch user records from DB for name/email
4. Group sessions by `tenant_id`
5. For each group, fetch tenant name from DB (batch query)
6. Return groups sorted by tenant name, with `null` tenant group first (platform-level)

#### `forceLogoutTenant(tenantId: string): Promise<{ logged_out: number }>`

1. Verify tenant exists or throw `NotFoundException`
2. Use SCAN to find all `session:*` keys
3. For each session where `tenant_id === tenantId`, collect the session_id and user_id
4. Delete all matching session keys from Redis
5. For each affected user, remove session_id from `user_sessions:{user_id}` set
6. Return count of sessions deleted

#### `forceLogoutUser(userId: string): Promise<{ logged_out: number }>`

1. Verify user exists or throw `NotFoundException`
2. Use `AuthService.deleteAllUserSessions(userId)` (already exists)
3. Return count of sessions deleted (get count from `user_sessions:{userId}` before deletion)

### 3.2 New Service: `PlatformCacheService`

**File:** `apps/api/src/modules/tenants/platform-cache.service.ts`

**Constructor DI:**

```typescript
constructor(
  private readonly redis: RedisService,
)
```

**Methods:**

#### `flushCache(scope: CacheFlushScope): Promise<{ keys_deleted: number }>`

```typescript
interface CacheFlushScope {
  tenant_id?: string; // if omitted, flush globally
  cache_type: 'permissions' | 'domains' | 'modules' | 'all';
}
```

Implementation:

1. Build key patterns based on `cache_type`:
   - `permissions`: `permissions:*`
   - `domains`: `tenant_domain:*`
   - `modules`: `tenant_modules:*`
   - `all`: all three patterns above
2. If `tenant_id` is provided, further filter: for permissions, scan and check the membership's tenant association (this requires parsing the key or using a more specific pattern). For domains/modules, use `tenant_domain:*` where the stored value's tenant_id matches. Pragmatic approach: scan all matching keys, GET each, check if the stored value references the target tenant, delete if match.
3. Alternative simpler approach for tenant-scoped flush: use known key patterns like `permissions:{membership_id}`. Query all memberships for the tenant, then delete `permissions:{membership_id}` for each. For domains: query `tenant_domains` table, delete `tenant_domain:{domain}` for each. For modules: delete `tenant_modules:{tenant_id}`.
4. Return count of deleted keys.

#### `getCacheStats(): Promise<CacheStats>`

```typescript
interface CacheStat {
  cache_type: string;
  key_count: number;
}
```

Implementation:

1. Count keys matching each pattern using SCAN (do not use KEYS in production):
   - `permissions:*` count
   - `tenant_domain:*` count
   - `tenant_modules:*` count
   - `is_platform_owner:*` count
   - `session:*` count
2. Return array of `{ cache_type, key_count }`.

### 3.3 New Service: `MaintenanceService`

**File:** `apps/api/src/modules/tenants/maintenance.service.ts`

**Constructor DI:**

```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly redis: RedisService,
)
```

**Methods:**

#### `toggleMaintenanceMode(tenantId: string, enabled: boolean, message?: string): Promise<Tenant>`

1. Find tenant or throw `NotFoundException`
2. Update tenant: `maintenance_mode: enabled`, `maintenance_message: enabled ? message : null`
3. Set/delete Redis key `tenant:${tenantId}:maintenance` (for fast middleware lookup)
4. Return updated tenant

#### `listMaintenanceWindows(tenantId?: string): Promise<TenantMaintenanceWindow[]>`

1. If `tenantId` provided, filter by tenant
2. Return all windows ordered by `starts_at` ASC
3. Include `tenant` (name, slug) and `creator` (first_name, last_name, email)

#### `createMaintenanceWindow(data: CreateMaintenanceWindowDto, actorId: string): Promise<TenantMaintenanceWindow>`

1. Validate `starts_at < ends_at` (also enforced by DB constraint)
2. Validate `starts_at` is in the future
3. Find tenant or throw `NotFoundException`
4. Create record
5. Return with relations

#### `deleteMaintenanceWindow(windowId: string): Promise<void>`

1. Find window or throw `NotFoundException`
2. Delete record

#### `processScheduledMaintenanceWindows(): Promise<void>`

Called by a cron job. Implementation:

1. Find all windows where `starts_at <= NOW()` and the corresponding tenant has `maintenance_mode = false`:
   ```sql
   SELECT w.* FROM tenant_maintenance_windows w
   JOIN tenants t ON w.tenant_id = t.id
   WHERE w.starts_at <= NOW() AND w.ends_at > NOW() AND t.maintenance_mode = false
   ```
2. For each: toggle maintenance mode ON with `w.message`

3. Find all windows where `ends_at <= NOW()` and the corresponding tenant has `maintenance_mode = true`:
   ```sql
   SELECT w.* FROM tenant_maintenance_windows w
   JOIN tenants t ON w.tenant_id = t.id
   WHERE w.ends_at <= NOW() AND t.maintenance_mode = true
   ```
4. For each: toggle maintenance mode OFF

5. Delete expired windows (where `ends_at < NOW() - INTERVAL '1 hour'`) to keep the table clean.

### 3.4 Maintenance Mode Middleware

**File:** `apps/api/src/common/middleware/maintenance-mode.middleware.ts`

A NestJS middleware that checks if the current tenant is in maintenance mode and blocks mutation requests.

```typescript
@Injectable()
export class MaintenanceModeMiddleware implements NestMiddleware {
  constructor(private readonly redis: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Only check for tenant-scoped requests (where tenant context is set)
    const tenantId = req.headers['x-tenant-id'] as string | undefined;
    if (!tenantId) {
      next();
      return;
    }

    // Skip for GET/HEAD/OPTIONS (read-only)
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      next();
      return;
    }

    // Skip for platform admin routes (they can always mutate)
    if (req.path.startsWith('/v1/admin')) {
      next();
      return;
    }

    // Check Redis for maintenance mode flag
    const client = this.redis.getClient();
    const maintenance = await client.get(`tenant:${tenantId}:maintenance`);
    if (maintenance) {
      // Parse message if stored
      let message = 'This school is currently undergoing maintenance. Please try again later.';
      try {
        const parsed = JSON.parse(maintenance);
        if (parsed.message) message = parsed.message;
      } catch {
        // Use default message
      }

      res.status(503).json({
        error: {
          code: 'MAINTENANCE_MODE',
          message,
        },
      });
      return;
    }

    next();
  }
}
```

Register in `apps/api/src/app.module.ts`:

```typescript
configure(consumer: MiddlewareConsumer) {
  consumer
    .apply(MaintenanceModeMiddleware)
    .forRoutes('*');
}
```

### 3.5 Controller Updates

**File:** `apps/api/src/modules/tenants/tenants.controller.ts`

Add these routes:

```typescript
// GET /v1/admin/sessions
@Get('sessions')
async listSessions() {
  return this.platformSessionService.listSessions();
}

// DELETE /v1/admin/sessions/tenant/:tenantId
@Delete('sessions/tenant/:tenantId')
@HttpCode(HttpStatus.OK)
async forceLogoutTenant(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
  return this.platformSessionService.forceLogoutTenant(tenantId);
}

// DELETE /v1/admin/sessions/user/:userId
@Delete('sessions/user/:userId')
@HttpCode(HttpStatus.OK)
async forceLogoutUser(@Param('userId', ParseUUIDPipe) userId: string) {
  return this.platformSessionService.forceLogoutUser(userId);
}

// POST /v1/admin/cache/flush
@Post('cache/flush')
@HttpCode(HttpStatus.OK)
async flushCache(
  @Body(new ZodValidationPipe(cacheFlushSchema)) dto: CacheFlushDto,
) {
  return this.platformCacheService.flushCache(dto);
}

// GET /v1/admin/cache/stats
@Get('cache/stats')
async getCacheStats() {
  return this.platformCacheService.getCacheStats();
}

// PATCH /v1/admin/tenants/:id/maintenance
@Patch('tenants/:id/maintenance')
async toggleMaintenance(
  @Param('id', ParseUUIDPipe) id: string,
  @Body(new ZodValidationPipe(maintenanceToggleSchema)) dto: MaintenanceToggleDto,
) {
  return this.maintenanceService.toggleMaintenanceMode(id, dto.enabled, dto.message);
}

// GET /v1/admin/maintenance-windows
@Get('maintenance-windows')
async listMaintenanceWindows(
  @Query('tenant_id') tenantId?: string,
) {
  return this.maintenanceService.listMaintenanceWindows(tenantId);
}

// POST /v1/admin/maintenance-windows
@Post('maintenance-windows')
async createMaintenanceWindow(
  @Body(new ZodValidationPipe(createMaintenanceWindowSchema)) dto: CreateMaintenanceWindowDto,
  @CurrentUser() user: JwtPayload,
) {
  return this.maintenanceService.createMaintenanceWindow(dto, user.sub);
}

// DELETE /v1/admin/maintenance-windows/:id
@Delete('maintenance-windows/:id')
@HttpCode(HttpStatus.OK)
async deleteMaintenanceWindow(@Param('id', ParseUUIDPipe) id: string) {
  return this.maintenanceService.deleteMaintenanceWindow(id);
}
```

### 3.6 Zod Schemas

**File:** `packages/shared/src/schemas/platform-operations.ts`

```typescript
import { z } from 'zod';

export const cacheFlushSchema = z.object({
  tenant_id: z.string().uuid().optional(),
  cache_type: z.enum(['permissions', 'domains', 'modules', 'all']),
});

export type CacheFlushDto = z.infer<typeof cacheFlushSchema>;

export const maintenanceToggleSchema = z.object({
  enabled: z.boolean(),
  message: z.string().max(500).optional(),
});

export type MaintenanceToggleDto = z.infer<typeof maintenanceToggleSchema>;

export const createMaintenanceWindowSchema = z
  .object({
    tenant_id: z.string().uuid(),
    starts_at: z.string().datetime(),
    ends_at: z.string().datetime(),
    message: z.string().max(500).optional(),
  })
  .refine((data) => new Date(data.ends_at) > new Date(data.starts_at), {
    message: 'ends_at must be after starts_at',
    path: ['ends_at'],
  });

export type CreateMaintenanceWindowDto = z.infer<typeof createMaintenanceWindowSchema>;
```

**Export from:** `packages/shared/src/index.ts`.

### 3.7 Cron Job for Maintenance Windows

**File:** `apps/worker/src/processors/maintenance-window.processor.ts` (or add to an existing scheduler)

If using the `CronSchedulerService` pattern:

```typescript
// Register in CronSchedulerService.onModuleInit():
await this.maintenanceQueue.add(
  MAINTENANCE_WINDOW_CHECK_JOB,
  {},
  {
    repeat: { every: 60_000 }, // every 60 seconds
    jobId: `cron:${MAINTENANCE_WINDOW_CHECK_JOB}`,
    removeOnComplete: 10,
    removeOnFail: 50,
  },
);
```

The processor calls `MaintenanceService.processScheduledMaintenanceWindows()`.

Alternatively, if the worker does not have access to the service layer, the cron job can make an internal API call or the maintenance check can be run in the API process using `@nestjs/schedule`.

### 3.8 Module Updates

**File:** `apps/api/src/modules/tenants/tenants.module.ts`

Add `PlatformSessionService`, `PlatformCacheService`, `MaintenanceService` to providers. Inject them into `TenantsController`.

---

## 4. Frontend

### 4.1 Sessions & Cache Page

**File:** `apps/web/src/app/[locale]/(platform)/admin/sessions/page.tsx`

A tabbed page with three tabs: Active Sessions, Cache Control, Maintenance.

Uses the `Tabs` component from `@school/ui` (or builds tab headers manually with Tailwind).

### 4.2 Active Sessions Tab

**File:** `apps/web/src/app/[locale]/(platform)/admin/sessions/_components/active-sessions-tab.tsx`

**Behaviour:**

- Fetch `GET /v1/admin/sessions` on mount
- Show a table grouped by tenant:
  - Row per tenant: tenant name, user count online, expand button
  - Expand reveals individual users: user name, email, IP, user agent, last active (relative time)
  - **Force Logout Tenant** button per tenant row (calls `DELETE /v1/admin/sessions/tenant/:tenantId`)
  - **Force Logout User** button per user row (calls `DELETE /v1/admin/sessions/user/:userId`)
- Platform-level sessions (no tenant) shown in a separate "Platform Sessions" group at top
- Auto-refresh every 30 seconds
- Force-logout buttons open confirmation dialog before executing
- After force-logout: remove the row from the table, show success toast

**Component state:**

```typescript
interface SessionsState {
  groups: TenantSessionGroup[];
  loading: boolean;
  error: string | null;
  expandedTenants: Set<string>;
}
```

### 4.3 Cache Control Tab

**File:** `apps/web/src/app/[locale]/(platform)/admin/sessions/_components/cache-control-tab.tsx`

**Behaviour:**

- Fetch `GET /v1/admin/cache/stats` on mount
- Show cards per cache type:
  - **Permissions Cache** -- key count, "Flush All" button, tenant picker for tenant-scoped flush
  - **Domain Cache** -- key count, "Flush All" button, tenant picker
  - **Module Cache** -- key count, "Flush All" button, tenant picker
- Each "Flush" button calls `POST /v1/admin/cache/flush` with appropriate `cache_type` and optional `tenant_id`
- After flush: re-fetch stats, show success toast with count of keys deleted
- "Flush All Caches" button at top: flushes `cache_type: 'all'` globally
- Tenant picker: dropdown loaded from `GET /v1/admin/tenants`

### 4.4 Maintenance Tab

**File:** `apps/web/src/app/[locale]/(platform)/admin/sessions/_components/maintenance-tab.tsx`

**Behaviour:**

**Active Maintenance Section:**

- Fetch all tenants with their `maintenance_mode` status
- Show a card per tenant with:
  - Tenant name
  - Toggle switch for maintenance mode (calls `PATCH /v1/admin/tenants/:id/maintenance`)
  - Message input (shown when toggling on, or editable when already on)
  - If maintenance is on: show a yellow/amber banner with the maintenance message

**Scheduled Windows Section:**

- Fetch `GET /v1/admin/maintenance-windows`
- Table showing: tenant name, start time, end time, message, created by, cancel button
- Active windows (current time between start and end) highlighted in amber
- Upcoming windows shown normally
- Past windows not shown (they are auto-deleted by the cron)
- **Schedule Maintenance** button opens a form dialog:
  - Tenant picker (required)
  - Start date/time picker (required, must be in future)
  - End date/time picker (required, must be after start)
  - Message (optional, max 500 chars)
  - Submit calls `POST /v1/admin/maintenance-windows`
- Cancel button calls `DELETE /v1/admin/maintenance-windows/:id` with confirmation

---

## 5. Files to Create

| File                                                                                           | Purpose                                                              |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `packages/prisma/migrations/YYYYMMDDHHMMSS_add_tenant_maintenance_fields/migration.sql`        | Add `maintenance_mode` and `maintenance_message` to `tenants`        |
| `packages/prisma/migrations/YYYYMMDDHHMMSS_add_tenant_maintenance_windows_table/migration.sql` | Create `tenant_maintenance_windows` table                            |
| `packages/shared/src/schemas/platform-operations.ts`                                           | Zod schemas for cache flush, maintenance toggle, maintenance windows |
| `apps/api/src/modules/tenants/platform-session.service.ts`                                     | Session enumeration and force-logout logic                           |
| `apps/api/src/modules/tenants/platform-session.service.spec.ts`                                | Unit tests for session service                                       |
| `apps/api/src/modules/tenants/platform-cache.service.ts`                                       | Cache stat collection and flush logic                                |
| `apps/api/src/modules/tenants/platform-cache.service.spec.ts`                                  | Unit tests for cache service                                         |
| `apps/api/src/modules/tenants/maintenance.service.ts`                                          | Maintenance mode toggle and window scheduling                        |
| `apps/api/src/modules/tenants/maintenance.service.spec.ts`                                     | Unit tests for maintenance service                                   |
| `apps/api/src/common/middleware/maintenance-mode.middleware.ts`                                | Request middleware that blocks mutations during maintenance          |
| `apps/web/src/app/[locale]/(platform)/admin/sessions/page.tsx`                                 | Sessions & Cache management page                                     |
| `apps/web/src/app/[locale]/(platform)/admin/sessions/_components/active-sessions-tab.tsx`      | Active sessions tab                                                  |
| `apps/web/src/app/[locale]/(platform)/admin/sessions/_components/cache-control-tab.tsx`        | Cache control tab                                                    |
| `apps/web/src/app/[locale]/(platform)/admin/sessions/_components/maintenance-tab.tsx`          | Maintenance mode tab                                                 |

## 6. Files to Modify

| File                                                 | Change                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `packages/prisma/schema.prisma`                      | Add `maintenance_mode`, `maintenance_message` to `Tenant`; add `TenantMaintenanceWindow` model; add relation on `User` |
| `packages/shared/src/index.ts`                       | Export new schemas from `platform-operations.ts`                                                                       |
| `apps/api/src/modules/tenants/tenants.controller.ts` | Add 9 new route handlers (sessions, cache, maintenance)                                                                |
| `apps/api/src/modules/tenants/tenants.module.ts`     | Add `PlatformSessionService`, `PlatformCacheService`, `MaintenanceService` to providers                                |
| `apps/api/src/app.module.ts`                         | Register `MaintenanceModeMiddleware` for all routes                                                                    |
| `apps/web/src/app/[locale]/(platform)/layout.tsx`    | Add "Sessions & Cache" nav item (temporary, will be reorganised in 3D)                                                 |

---

## 7. Testing Strategy

### Unit Tests

#### `platform-session.service.spec.ts`

1. **listSessions**
   - Returns grouped sessions with tenant names and user info
   - Handles empty Redis (no sessions) gracefully
   - Groups platform-level sessions (null tenant_id) separately

2. **forceLogoutTenant**
   - Deletes all sessions for the specified tenant
   - Returns correct count
   - Tenant not found: throws NotFoundException

3. **forceLogoutUser**
   - Deletes all sessions for the specified user
   - Returns correct count
   - User not found: throws NotFoundException

#### `platform-cache.service.spec.ts`

1. **flushCache**
   - Flushes correct key patterns for each cache_type
   - Tenant-scoped flush only deletes keys for that tenant
   - Global flush deletes all matching keys
   - Returns correct count of deleted keys

2. **getCacheStats**
   - Returns correct counts for each cache type
   - Handles empty caches (returns 0)

#### `maintenance.service.spec.ts`

1. **toggleMaintenanceMode**
   - ON: sets `maintenance_mode = true`, stores message, sets Redis key
   - OFF: sets `maintenance_mode = false`, clears message, deletes Redis key
   - Tenant not found: throws NotFoundException

2. **createMaintenanceWindow**
   - Creates window with correct data
   - Rejects if `starts_at` is in the past
   - Rejects if `ends_at <= starts_at` (DB constraint also enforces)

3. **processScheduledMaintenanceWindows**
   - Enables maintenance for windows that have started
   - Disables maintenance for windows that have ended
   - Cleans up expired windows

### Middleware Test

**File:** `apps/api/src/common/middleware/maintenance-mode.middleware.spec.ts`

1. GET requests pass through even during maintenance
2. POST requests return 503 during maintenance with correct error message
3. Admin routes (`/v1/admin/*`) pass through during maintenance
4. Non-maintenance tenants are not affected

### Manual Verification

- Sessions page shows actual active sessions grouped by tenant
- Force-logout tenant removes all sessions for that tenant
- Force-logout user removes that user's sessions
- Cache stats reflect real Redis key counts
- Cache flush removes the correct keys and stats update
- Maintenance toggle blocks POST/PATCH/DELETE for the tenant
- Maintenance toggle allows GET for the tenant
- Scheduled maintenance window auto-activates at start time
- Scheduled maintenance window auto-deactivates at end time

---

## 8. Acceptance Criteria

- [ ] `tenants` table has `maintenance_mode` (BOOLEAN) and `maintenance_message` (TEXT) columns
- [ ] `tenant_maintenance_windows` table exists with correct schema and constraints
- [ ] `tenant_maintenance_windows` has NO RLS policy
- [ ] `GET /v1/admin/sessions` returns sessions grouped by tenant
- [ ] `DELETE /v1/admin/sessions/tenant/:id` force-logs out all users in tenant
- [ ] `DELETE /v1/admin/sessions/user/:id` force-logs out specific user
- [ ] `POST /v1/admin/cache/flush` flushes specified cache type
- [ ] `GET /v1/admin/cache/stats` returns key counts per cache type
- [ ] `PATCH /v1/admin/tenants/:id/maintenance` toggles maintenance mode
- [ ] Maintenance middleware returns 503 for mutations on maintenance tenants
- [ ] Maintenance middleware allows GET/HEAD/OPTIONS requests through
- [ ] Maintenance middleware does not block admin routes
- [ ] `GET /v1/admin/maintenance-windows` returns windows with tenant and creator info
- [ ] `POST /v1/admin/maintenance-windows` creates a scheduled window
- [ ] `DELETE /v1/admin/maintenance-windows/:id` cancels a scheduled window
- [ ] Cron job enables/disables maintenance at scheduled times
- [ ] Sessions tab UI shows expandable tenant groups with force-logout buttons
- [ ] Cache tab shows stats and flush buttons per cache type
- [ ] Maintenance tab shows per-tenant toggle and scheduled windows
- [ ] All unit tests pass
- [ ] `turbo lint` and `turbo type-check` pass
- [ ] `turbo test` passes with zero regressions
