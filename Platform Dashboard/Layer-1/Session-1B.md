# Session 1B: Health Dashboard

**Depends on:** Session 1A (WebSocket infrastructure + Redis pub/sub)
**Unlocks:** Session 1C (Alert Framework consumes health state change events)

---

## Objective

Transform the existing dead health link into a live, real-time health monitoring page. This session:

1. Extends the existing `HealthService` to detect state changes and publish them via Redis pub/sub
2. Adds a cron job (BullMQ repeatable, every 60s) that snapshots health check results to a new `platform_health_snapshots` table
3. Adds a REST endpoint for querying health history (24h trend data for sparkline charts)
4. Builds the frontend health page with real-time status cards, latency display, and 24h sparklines

After this session, the platform owner sees at a glance whether PostgreSQL, Redis, Meilisearch, BullMQ, and Disk are healthy, degraded, or unhealthy -- updated in real-time.

---

## Database

### New Table: `platform_health_snapshots`

This is a **platform-level table** -- no `tenant_id`, no RLS.

```prisma
// packages/prisma/prisma/schema.prisma

model PlatformHealthSnapshot {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  status      String   @db.VarChar(20)   // 'healthy' | 'degraded' | 'unhealthy'
  checks      Json     @db.JsonB         // Full checks object from HealthService
  uptime      Int                         // Uptime in seconds
  created_at  DateTime @default(now()) @db.Timestamptz()

  @@map("platform_health_snapshots")
  @@index([created_at(sort: Desc)])
}
```

**Column details:**

| Column       | Type        | Description                                                                                                                                                                                           |
| ------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | UUID        | Primary key, auto-generated                                                                                                                                                                           |
| `status`     | VARCHAR(20) | Overall status: `healthy`, `degraded`, `unhealthy`                                                                                                                                                    |
| `checks`     | JSONB       | Full check results: `{ postgresql: { status, latency_ms }, redis: { status, latency_ms }, meilisearch: { status, latency_ms }, bullmq: { status, stuck_jobs }, disk: { status, free_gb, total_gb } }` |
| `uptime`     | INTEGER     | Server uptime in seconds at snapshot time                                                                                                                                                             |
| `created_at` | TIMESTAMPTZ | When this snapshot was taken                                                                                                                                                                          |

**Retention:** A cleanup cron (added in this session) deletes snapshots older than 7 days. At 1 snapshot per 60 seconds, that is ~10,080 rows per week -- trivial.

**No RLS policy needed** -- this is a platform-level table with no `tenant_id`.

### Migration

Single migration file created as part of the Layer 1 combined migration (see `Layer-1-Plan.md`). If implementing incrementally:

```
packages/prisma/prisma/migrations/YYYYMMDDHHMMSS_add_platform_health_snapshots/migration.sql
```

```sql
CREATE TABLE platform_health_snapshots (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  status     VARCHAR(20) NOT NULL,
  checks     JSONB       NOT NULL,
  uptime     INTEGER     NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_health_snapshots_created_at
  ON platform_health_snapshots (created_at DESC);
```

---

## Backend Changes

### 1. Extend HealthService

#### `apps/api/src/modules/health/health.service.ts` -- Modifications

Add state change detection and Redis pub/sub publishing.

**New private field:**

```typescript
private lastStatus: 'healthy' | 'degraded' | 'unhealthy' | null = null;
```

**New constructor DI:**

```typescript
// Add RedisPubSubService to constructor
private readonly redisPubSub: RedisPubSubService
```

**New public method:**

```typescript
/**
 * Run a health check, detect state changes, and publish to Redis if status changed.
 * Used by the health snapshot cron job.
 */
async checkAndPublish(): Promise<FullHealthResult> {
  const result = await this.buildFullResult();

  // Detect state change
  if (this.lastStatus !== null && this.lastStatus !== result.status) {
    await this.redisPubSub.publish('platform:health', {
      type: 'state_change',
      previous_status: this.lastStatus,
      current_status: result.status,
      timestamp: result.timestamp,
      checks: result.checks,
    });
  }

  // Always publish the latest snapshot for connected clients
  await this.redisPubSub.publish('platform:health', {
    type: 'snapshot',
    status: result.status,
    timestamp: result.timestamp,
    uptime: result.uptime,
    checks: result.checks,
  });

  this.lastStatus = result.status;
  return result;
}
```

**Note:** The existing `check()` and `getReadiness()` methods remain unchanged -- they are used by the `/health` endpoint and Kubernetes probes. The new `checkAndPublish()` method is only called by the cron job.

### 2. Health Snapshot Cron Job

This runs in the **API process** (not the worker) because it needs access to the `HealthService` which has connections to PostgreSQL, Redis, Meilisearch, and BullMQ. The API process is the one that can check its own dependencies. We use `setInterval` inside a NestJS service (not BullMQ) because:

- It needs to run every 60 seconds (more frequent than typical BullMQ crons)
- It must execute in the API process (not the worker)
- No queue overhead needed for a simple interval

#### `apps/api/src/modules/platform/health-snapshot.service.ts`

**Class:** `HealthSnapshotService implements OnModuleInit, OnModuleDestroy`

**Constructor DI:**

```typescript
private readonly healthService: HealthService
private readonly prisma: PrismaService
```

**Private fields:**

```typescript
private readonly logger = new Logger(HealthSnapshotService.name);
private intervalHandle: ReturnType<typeof setInterval> | null = null;
```

**Methods:**

```typescript
// Start the 60-second interval on module init
onModuleInit(): void {
  this.intervalHandle = setInterval(() => {
    void this.takeSnapshot();
  }, 60_000);
  this.logger.log('Health snapshot interval started (every 60s)');
  // Take an initial snapshot immediately
  void this.takeSnapshot();
}

// Clear the interval on module destroy
onModuleDestroy(): void {
  if (this.intervalHandle) {
    clearInterval(this.intervalHandle);
  }
}

// Take a snapshot and persist to DB
private async takeSnapshot(): Promise<void> {
  try {
    const result = await this.healthService.checkAndPublish();
    await this.prisma.platformHealthSnapshot.create({
      data: {
        status: result.status,
        checks: result.checks as object,
        uptime: result.uptime,
      },
    });
  } catch (err: unknown) {
    this.logger.error('[takeSnapshot] Failed to take health snapshot', err);
  }
}

// Clean up snapshots older than 7 days (called by a daily cleanup, or inline)
async cleanupOldSnapshots(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await this.prisma.platformHealthSnapshot.deleteMany({
    where: { created_at: { lt: cutoff } },
  });
  this.logger.log(`Cleaned up ${result.count} old health snapshots`);
  return result.count;
}
```

#### `apps/api/src/modules/platform/health-snapshot.service.spec.ts`

Tests:

1. **Snapshot creation:** Call `takeSnapshot()` with a mocked `HealthService.checkAndPublish()` returning a known result. Assert `prisma.platformHealthSnapshot.create` was called with the correct data.
2. **Cleanup:** Seed 3 snapshots (2 old, 1 recent). Call `cleanupOldSnapshots()`. Assert only the old ones are deleted.
3. **Error resilience:** Mock `HealthService.checkAndPublish()` to throw. Assert `takeSnapshot()` does not throw (error is logged).

### 3. Health History Controller

#### `apps/api/src/modules/platform/health-history.controller.ts`

```typescript
@Controller('v1/admin/health')
@UseGuards(AuthGuard, PlatformOwnerGuard)
export class HealthHistoryController {
  constructor(private readonly healthSnapshotService: HealthSnapshotService) {}

  // GET /v1/admin/health/history
  @Get('history')
  async getHistory(
    @Query(new ZodValidationPipe(healthHistoryQuerySchema))
    query: HealthHistoryQuery,
  ): Promise<{ data: PlatformHealthSnapshot[]; meta: { total: number } }>
}
```

**Query schema** (defined in `packages/shared/src/schemas/platform.ts`):

```typescript
export const healthHistoryQuerySchema = z.object({
  hours: z.coerce.number().min(1).max(168).default(24), // max 7 days
  component: z.enum(['postgresql', 'redis', 'meilisearch', 'bullmq', 'disk']).optional(),
});

export type HealthHistoryQuery = z.infer<typeof healthHistoryQuerySchema>;
```

**Service method:**

```typescript
// In HealthSnapshotService
async getHistory(hours: number, component?: string): Promise<{
  data: PlatformHealthSnapshot[];
  meta: { total: number };
}> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const where = { created_at: { gte: since } };

  const [data, total] = await Promise.all([
    this.prisma.platformHealthSnapshot.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 1440, // Max ~24h at 1/min
    }),
    this.prisma.platformHealthSnapshot.count({ where }),
  ]);

  return { data, meta: { total } };
}
```

#### `apps/api/src/modules/platform/health-history.controller.spec.ts`

Tests:

1. **Happy path:** GET `/v1/admin/health/history` returns snapshots within the time range
2. **Auth rejection:** Request without platform owner auth returns 403
3. **Query validation:** Invalid `hours` parameter (0, 999) returns 400

### 4. Update Platform Module

#### `apps/api/src/modules/platform/platform.module.ts` -- Updated

```typescript
@Module({
  imports: [AuthModule, HealthModule],
  controllers: [HealthHistoryController],
  providers: [RedisPubSubService, PlatformGateway, HealthSnapshotService],
  exports: [RedisPubSubService],
})
export class PlatformModule {}
```

### 5. Update Health Module

#### `apps/api/src/modules/health/health.module.ts` -- Updated

```typescript
@Module({
  imports: [SearchModule, BullModule.registerQueue({ name: 'notifications' })],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService], // Already added in 1A
})
export class HealthModule {}
```

The `HealthService` constructor now needs `RedisPubSubService`. Since `PlatformModule` exports `RedisPubSubService` but `HealthModule` cannot import `PlatformModule` (circular dependency), we need to handle this differently.

**Resolution:** Inject `RedisPubSubService` into `HealthService` via the `HealthModule` importing the `RedisPubSubService` directly. Since `RedisModule` is global and `RedisPubSubService` only needs `ConfigService` (also global), we can either:

Option A: Make `RedisPubSubService` a global provider (not ideal).
Option B: Have `HealthModule` declare `RedisPubSubService` in its own providers (duplicates the instance).
Option C: **Move the pub/sub publish call into `HealthSnapshotService`** instead of `HealthService`. This avoids the circular dependency entirely.

**Chosen approach: Option C.** Keep `HealthService` unchanged. The `HealthSnapshotService` calls `healthService.check()` (not `checkAndPublish`) and handles state change detection and Redis publishing itself.

**Revised `HealthSnapshotService.takeSnapshot()`:**

```typescript
private lastStatus: 'healthy' | 'degraded' | 'unhealthy' | null = null;

private async takeSnapshot(): Promise<void> {
  try {
    const result = await this.healthService.check();

    // Detect state change
    if (this.lastStatus !== null && this.lastStatus !== result.status) {
      await this.redisPubSub.publish('platform:health', {
        type: 'state_change',
        previous_status: this.lastStatus,
        current_status: result.status,
        timestamp: result.timestamp,
        checks: result.checks,
      });
    }

    // Always publish latest snapshot
    await this.redisPubSub.publish('platform:health', {
      type: 'snapshot',
      status: result.status,
      timestamp: result.timestamp,
      uptime: result.uptime,
      checks: result.checks,
    });

    this.lastStatus = result.status;

    // Persist to DB
    await this.prisma.platformHealthSnapshot.create({
      data: {
        status: result.status,
        checks: result.checks as object,
        uptime: result.uptime,
      },
    });
  } catch (err: unknown) {
    this.logger.error('[takeSnapshot] Failed', err);
  }
}
```

This means `HealthService` stays clean and unmodified. The `HealthSnapshotService` (in PlatformModule) orchestrates checks, state detection, pub/sub, and persistence.

---

## Frontend Changes

### 1. New Page: Health Dashboard

#### `apps/web/src/app/[locale]/(platform)/admin/health/page.tsx`

**Page component:** `HealthDashboardPage` (client component)

**Data flow:**

1. On mount, fetch initial health state via `apiClient<FullHealthResult>('/api/v1/admin/health/history?hours=24')`
2. Also fetch current health via `apiClient('/api/health')` for the live status
3. Subscribe to `health:update` via `usePlatformSocket()` for real-time updates
4. On each `health:update` event with `type === 'snapshot'`, update the current status and append to the sparkline data

**Layout:**

```
+------------------------------------------------------------------+
| Overall Status Banner                                            |
| [HEALTHY / DEGRADED / UNHEALTHY] with uptime counter             |
+------------------------------------------------------------------+
| Status Cards Row (responsive grid: 1 col mobile, 5 col desktop)  |
|                                                                   |
| [PostgreSQL]  [Redis]  [Meilisearch]  [BullMQ]  [Disk]          |
| Status: UP    Status   Status          Status    Status           |
| Latency: 2ms  1ms      12ms            UP        Free: 45.2 GB  |
| [sparkline]  [sparkln] [sparkline]    [sparkln]  [sparkline]     |
+------------------------------------------------------------------+
```

**State:**

```typescript
interface HealthPageState {
  currentHealth: FullHealthResult | null;
  history: PlatformHealthSnapshot[];
  loading: boolean;
  error: string | null;
}
```

### 2. Components

#### `apps/web/src/app/[locale]/(platform)/admin/health/_components/health-status-card.tsx`

**Props:**

```typescript
interface HealthStatusCardProps {
  name: string; // 'PostgreSQL', 'Redis', etc.
  status: 'up' | 'down';
  latencyMs?: number; // For postgresql, redis, meilisearch
  stuckJobs?: number; // For bullmq
  freeGb?: number; // For disk
  totalGb?: number; // For disk
  sparklineData: number[]; // Array of latency values for 24h
}
```

**Visual:**

- Card with rounded border
- Status dot (green = up, red = down)
- Component name as title
- Primary metric (latency in ms, or free disk in GB, or stuck jobs count)
- 24h sparkline chart at the bottom of the card (simple SVG polyline -- no heavy charting library needed for this)

**Styling:**

- Uses semantic Tailwind tokens: `bg-surface`, `border-border`, `text-text-primary`
- Status colours: `bg-green-500` for up, `bg-red-500` for down
- Responsive: cards stack vertically on mobile, 5-column grid on desktop

#### `apps/web/src/app/[locale]/(platform)/admin/health/_components/overall-status-banner.tsx`

**Props:**

```typescript
interface OverallStatusBannerProps {
  status: 'healthy' | 'degraded' | 'unhealthy' | null;
  uptime: number; // seconds
}
```

**Visual:**

- Full-width banner at top of health page
- Background colour based on status:
  - `healthy`: green tint (`bg-green-50 border-green-200`)
  - `degraded`: amber tint (`bg-amber-50 border-amber-200`)
  - `unhealthy`: red tint (`bg-red-50 border-red-200`)
- Status text with icon
- Uptime formatted as "Xd Xh Xm"

#### `apps/web/src/app/[locale]/(platform)/admin/health/_components/latency-sparkline.tsx`

**Props:**

```typescript
interface LatencySparklineProps {
  data: number[]; // Array of values (latency_ms or free_gb)
  height?: number; // Default 40
  width?: number; // Default 200 (or '100%')
  color?: string; // Default 'currentColor'
}
```

**Implementation:**

- Pure SVG `<polyline>` element
- Normalize data to fit within the viewBox
- No external charting dependency
- Gracefully handle empty arrays (render nothing)

### 3. Update Platform Layout

#### `apps/web/src/app/[locale]/(platform)/layout.tsx` -- Modification

The Health nav item already exists in the layout at `/${locale}/admin/health`. No change needed for navigation -- the page just needs to exist.

---

## Shared Schema

### `packages/shared/src/schemas/platform.ts` -- New File

```typescript
import { z } from 'zod';

// ─── Health History Query ─────────────────────────────────────────────────────

export const healthHistoryQuerySchema = z.object({
  hours: z.coerce.number().min(1).max(168).default(24),
  component: z.enum(['postgresql', 'redis', 'meilisearch', 'bullmq', 'disk']).optional(),
});

export type HealthHistoryQuery = z.infer<typeof healthHistoryQuerySchema>;
```

### `packages/shared/src/index.ts` -- Modification

Add export:

```typescript
export { healthHistoryQuerySchema, type HealthHistoryQuery } from './schemas/platform';
```

---

## Testing Strategy

### Backend Unit Tests

| Test File                           | Tests                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `health-snapshot.service.spec.ts`   | Snapshot persistence, state change detection + pub/sub publish, cleanup of old records, error resilience |
| `health-history.controller.spec.ts` | Happy path query, auth rejection, query validation                                                       |

### Frontend Manual Testing

1. Navigate to `/en/admin/health`
2. Verify all 5 status cards render with current status and latency
3. Verify sparkline charts show 24h trend data
4. Verify real-time updates: stop Redis briefly, see status change reflected without page refresh
5. Verify mobile responsiveness at 375px width

---

## Acceptance Criteria

- [ ] `platform_health_snapshots` table exists in the database
- [ ] Health snapshots are persisted every 60 seconds automatically
- [ ] State change detection publishes to `platform:health` Redis channel when status transitions
- [ ] GET `/v1/admin/health/history` returns snapshot history for the requested time range
- [ ] Health page at `/en/admin/health` renders with overall status banner
- [ ] 5 status cards display: PostgreSQL, Redis, Meilisearch, BullMQ, Disk
- [ ] Each card shows current status (up/down), primary metric, and 24h sparkline
- [ ] Real-time updates arrive via WebSocket and update the UI without page refresh
- [ ] Old snapshots (>7 days) are cleaned up automatically
- [ ] Page is responsive and usable at 375px width
- [ ] All tests pass
- [ ] `turbo lint` and `turbo type-check` pass

---

## File Summary

### Files to Create (9)

| File                                                                                      | Type       |
| ----------------------------------------------------------------------------------------- | ---------- |
| `apps/api/src/modules/platform/health-snapshot.service.ts`                                | Service    |
| `apps/api/src/modules/platform/health-snapshot.service.spec.ts`                           | Test       |
| `apps/api/src/modules/platform/health-history.controller.ts`                              | Controller |
| `apps/api/src/modules/platform/health-history.controller.spec.ts`                         | Test       |
| `packages/shared/src/schemas/platform.ts`                                                 | Zod schema |
| `apps/web/src/app/[locale]/(platform)/admin/health/page.tsx`                              | Page       |
| `apps/web/src/app/[locale]/(platform)/admin/health/_components/health-status-card.tsx`    | Component  |
| `apps/web/src/app/[locale]/(platform)/admin/health/_components/overall-status-banner.tsx` | Component  |
| `apps/web/src/app/[locale]/(platform)/admin/health/_components/latency-sparkline.tsx`     | Component  |

### Files to Modify (3)

| File                                               | Change                                                                  |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `apps/api/src/modules/platform/platform.module.ts` | Add HealthHistoryController, HealthSnapshotService; import HealthModule |
| `packages/shared/src/index.ts`                     | Export health history query schema                                      |
| `packages/prisma/prisma/schema.prisma`             | Add PlatformHealthSnapshot model                                        |
