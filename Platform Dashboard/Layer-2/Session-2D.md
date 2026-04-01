# Session 2D -- Tenant Analytics & Error Diagnostics

**Depends on:** Layer 1 (basic health dashboard, tenant list page)
**Independent of:** Sessions 2A, 2B, 2C -- can run in parallel

---

## 1. Objective

Provide two capabilities:

1. **Tenant Analytics** -- daily per-tenant aggregate metrics (student count, staff count, active users, invoice stats, etc.) stored in snapshots, displayed as stat cards and trend charts on the tenant detail page, with a cross-tenant comparison view.

2. **Error Diagnostics** -- a platform-level error log that captures 5xx errors from an additive global exception filter, with a diagnostics UI showing errors grouped by endpoint/type, filterable by tenant, with expandable stack traces.

---

## 2. Database Changes

### 2.1 New Table: `platform_tenant_metrics`

```prisma
model PlatformTenantMetric {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id     String   @db.Uuid
  snapshot_date DateTime @db.Date
  metrics       Json     @db.JsonB
  created_at    DateTime @default(now()) @db.Timestamptz()

  // Relations
  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, snapshot_date])
  @@index([tenant_id, snapshot_date(sort: Desc)])
  @@map("platform_tenant_metrics")
}
```

**`metrics` JSONB shape:**

```typescript
interface TenantMetricsSnapshot {
  students_count: number;
  staff_count: number;
  parents_count: number;
  active_users_24h: number;
  active_users_7d: number;
  invoices_total: number;
  invoices_overdue: number;
  attendance_rate_avg: number; // percentage, 0-100
  api_requests_24h: number;
  errors_24h: number;
  storage_mb: number;
  modules_enabled: string[];
  last_login_at: string | null; // ISO timestamp
}
```

**NO RLS.** The `tenant_id` is for correlation (join to tenants table) but this is a platform-level table -- there is no tenant isolation via RLS.

### 2.2 New Table: `platform_error_log`

```prisma
model PlatformErrorLog {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id   String?  @db.Uuid
  error_code  String   @db.VarChar(100)
  message     String   @db.Text
  stack_trace String?  @db.Text
  endpoint    String   @db.VarChar(500)
  http_status Int      @db.SmallInt
  user_id     String?  @db.Uuid
  request_id  String?  @db.VarChar(100)
  created_at  DateTime @default(now()) @db.Timestamptz()

  @@index([tenant_id, created_at(sort: Desc)])
  @@index([endpoint, created_at(sort: Desc)])
  @@index([http_status, created_at(sort: Desc)])
  @@index([created_at(sort: Desc)])
  @@map("platform_error_log")
}
```

**`tenant_id` is nullable** -- null for platform-level errors (e.g., errors on `/v1/admin/*` routes or errors before tenant resolution).

**NO RLS.** This is a platform-level diagnostic table.

### 2.3 Add Relation to Tenant Model

In the `Tenant` model in `schema.prisma`, add:

```prisma
// Platform Dashboard Relations
platform_tenant_metrics PlatformTenantMetric[]
```

### 2.4 Migration Files

**File:** `packages/prisma/migrations/YYYYMMDDHHMMSS_add_platform_tenant_metrics/migration.sql`

```sql
CREATE TABLE "platform_tenant_metrics" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "snapshot_date" DATE NOT NULL,
  "metrics" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "platform_tenant_metrics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_tenant_metrics_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "platform_tenant_metrics_tenant_id_snapshot_date_key"
  ON "platform_tenant_metrics"("tenant_id", "snapshot_date");

CREATE INDEX "idx_platform_tenant_metrics_tenant_date"
  ON "platform_tenant_metrics"("tenant_id", "snapshot_date" DESC);
```

**File:** `packages/prisma/migrations/YYYYMMDDHHMMSS_add_platform_error_log/migration.sql`

```sql
CREATE TABLE "platform_error_log" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID,
  "error_code" VARCHAR(100) NOT NULL,
  "message" TEXT NOT NULL,
  "stack_trace" TEXT,
  "endpoint" VARCHAR(500) NOT NULL,
  "http_status" SMALLINT NOT NULL,
  "user_id" UUID,
  "request_id" VARCHAR(100),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No primary key on id to allow unlogged-like fast inserts? No, keep PK for direct lookups.
ALTER TABLE "platform_error_log" ADD CONSTRAINT "platform_error_log_pkey" PRIMARY KEY ("id");

CREATE INDEX "idx_platform_error_log_tenant_created"
  ON "platform_error_log"("tenant_id", "created_at" DESC);

CREATE INDEX "idx_platform_error_log_endpoint_created"
  ON "platform_error_log"("endpoint", "created_at" DESC);

CREATE INDEX "idx_platform_error_log_status_created"
  ON "platform_error_log"("http_status", "created_at" DESC);

CREATE INDEX "idx_platform_error_log_created"
  ON "platform_error_log"("created_at" DESC);
```

**No RLS policies.** Platform-level tables.

---

## 3. Backend Changes

### 3.1 Shared Schemas

**File:** `packages/shared/src/schemas/platform-admin.schema.ts` (extend)

```typescript
// ─── Tenant Metrics Schemas ───────────────────────────────────────────────────

export const tenantMetricsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export type TenantMetricsQuery = z.infer<typeof tenantMetricsQuerySchema>;

export const tenantMetricsCompareSchema = z.object({
  tenant_ids: z.array(z.string().uuid()).min(2).max(10),
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export type TenantMetricsCompareDto = z.infer<typeof tenantMetricsCompareSchema>;

// ─── Error Log Schemas ────────────────────────────────────────────────────────

export const errorLogQuerySchema = paginationQuerySchema.extend({
  tenant_id: z.string().uuid().optional(),
  endpoint: z.string().optional(),
  http_status: z.coerce.number().int().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export type ErrorLogQuery = z.infer<typeof errorLogQuerySchema>;
```

### 3.2 DTO Re-exports

**File:** `apps/api/src/modules/platform-admin/dto/tenant-metrics.dto.ts`

```typescript
import type { TenantMetricsQuery, TenantMetricsCompareDto } from '@school/shared';

export type { TenantMetricsQuery, TenantMetricsCompareDto };
```

**File:** `apps/api/src/modules/platform-admin/dto/error-log.dto.ts`

```typescript
import type { ErrorLogQuery } from '@school/shared';

export type { ErrorLogQuery };
```

### 3.3 Tenant Metrics Service

**File:** `apps/api/src/modules/platform-admin/tenant-metrics.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';

interface TenantMetricsSnapshot {
  students_count: number;
  staff_count: number;
  parents_count: number;
  active_users_24h: number;
  active_users_7d: number;
  invoices_total: number;
  invoices_overdue: number;
  attendance_rate_avg: number;
  api_requests_24h: number;
  errors_24h: number;
  storage_mb: number;
  modules_enabled: string[];
  last_login_at: string | null;
}

@Injectable()
export class TenantMetricsService {
  private readonly logger = new Logger(TenantMetricsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Cron: Collect daily metrics ────────────────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async collectDailyMetrics(): Promise<void> {
    this.logger.log('Starting daily tenant metrics collection');

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, name: true },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const tenant of tenants) {
      try {
        const metrics = await this.collectMetricsForTenant(tenant.id);

        await this.prisma.platformTenantMetric.upsert({
          where: {
            tenant_id_snapshot_date: {
              tenant_id: tenant.id,
              snapshot_date: today,
            },
          },
          create: {
            tenant_id: tenant.id,
            snapshot_date: today,
            metrics,
          },
          update: {
            metrics,
          },
        });
      } catch (err) {
        this.logger.error(
          `Failed to collect metrics for tenant "${tenant.name}" (${tenant.id}):`,
          err,
        );
      }
    }

    this.logger.log(`Collected metrics for ${tenants.length} tenants`);
  }

  // ─── Query Methods ──────────────────────────────────────────────────────────

  async getMetricsForTenant(
    tenantId: string,
    days: number,
  ): Promise<{
    latest: TenantMetricsSnapshot | null;
    history: Array<{ snapshot_date: string; metrics: TenantMetricsSnapshot }>;
  }> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const snapshots = await this.prisma.platformTenantMetric.findMany({
      where: {
        tenant_id: tenantId,
        snapshot_date: { gte: since },
      },
      orderBy: { snapshot_date: 'desc' },
    });

    return {
      latest:
        snapshots.length > 0 ? (snapshots[0].metrics as unknown as TenantMetricsSnapshot) : null,
      history: snapshots.map((s) => ({
        snapshot_date: s.snapshot_date.toISOString().split('T')[0],
        metrics: s.metrics as unknown as TenantMetricsSnapshot,
      })),
    };
  }

  async compareMetrics(
    tenantIds: string[],
    days: number,
  ): Promise<
    Array<{
      tenant_id: string;
      tenant_name: string;
      latest: TenantMetricsSnapshot | null;
      history: Array<{ snapshot_date: string; metrics: TenantMetricsSnapshot }>;
    }>
  > {
    const results = [];

    for (const tenantId of tenantIds) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });

      const data = await this.getMetricsForTenant(tenantId, days);
      results.push({
        tenant_id: tenantId,
        tenant_name: tenant?.name ?? 'Unknown',
        ...data,
      });
    }

    return results;
  }

  // ─── Private: Per-Tenant Metric Collection ──────────────────────────────────

  private async collectMetricsForTenant(tenantId: string): Promise<TenantMetricsSnapshot> {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      studentsCount,
      staffCount,
      parentsCount,
      activeUsers24h,
      activeUsers7d,
      invoicesTotal,
      invoicesOverdue,
      modulesEnabled,
      lastLogin,
      errors24h,
    ] = await Promise.all([
      // Students count (active enrolments)
      this.prisma.student.count({
        where: { tenant_id: tenantId, status: 'active' },
      }),

      // Staff count (active profiles)
      this.prisma.staffProfile.count({
        where: { tenant_id: tenantId, employment_status: 'active' },
      }),

      // Parents count
      this.prisma.parent.count({
        where: { tenant_id: tenantId },
      }),

      // Active users 24h (unique logins via audit log)
      this.prisma.auditLog
        .groupBy({
          by: ['user_id'],
          where: {
            tenant_id: tenantId,
            action: 'auth.login',
            created_at: { gte: twentyFourHoursAgo },
          },
        })
        .then((r) => r.length),

      // Active users 7d
      this.prisma.auditLog
        .groupBy({
          by: ['user_id'],
          where: {
            tenant_id: tenantId,
            action: 'auth.login',
            created_at: { gte: sevenDaysAgo },
          },
        })
        .then((r) => r.length),

      // Invoices total
      this.prisma.invoice.count({
        where: { tenant_id: tenantId },
      }),

      // Invoices overdue
      this.prisma.invoice.count({
        where: {
          tenant_id: tenantId,
          status: 'overdue',
        },
      }),

      // Modules enabled
      this.prisma.tenantModule
        .findMany({
          where: { tenant_id: tenantId, is_enabled: true },
          select: { module_key: true },
        })
        .then((r) => r.map((m) => m.module_key)),

      // Last login
      this.prisma.auditLog
        .findFirst({
          where: { tenant_id: tenantId, action: 'auth.login' },
          orderBy: { created_at: 'desc' },
          select: { created_at: true },
        })
        .then((r) => r?.created_at?.toISOString() ?? null),

      // Errors in last 24h (from platform_error_log if it exists, otherwise 0)
      this.prisma.platformErrorLog
        .count({
          where: {
            tenant_id: tenantId,
            created_at: { gte: twentyFourHoursAgo },
          },
        })
        .catch(() => 0),
    ]);

    return {
      students_count: studentsCount,
      staff_count: staffCount,
      parents_count: parentsCount,
      active_users_24h: activeUsers24h,
      active_users_7d: activeUsers7d,
      invoices_total: invoicesTotal,
      invoices_overdue: invoicesOverdue,
      attendance_rate_avg: 0, // TODO: compute from daily attendance summaries
      api_requests_24h: 0, // TODO: requires request counting middleware
      errors_24h: errors24h,
      storage_mb: 0, // TODO: requires S3 bucket size query
      modules_enabled: modulesEnabled,
      last_login_at: lastLogin,
    };
  }
}
```

### 3.4 Error Log Exception Filter (Additive)

**File:** `apps/api/src/modules/platform-admin/error-log.filter.ts`

This filter is **additive** -- it runs alongside the existing `SentryGlobalFilter`, does NOT replace it, and only adds a row to `platform_error_log`. It must be registered with a lower priority than the Sentry filter.

```typescript
import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request, Response } from 'express';

import { getRequestContext } from '../../common/middleware/correlation.middleware';
import { PrismaService } from '../prisma/prisma.service';

@Catch()
@Injectable()
export class PlatformErrorLogFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(PlatformErrorLogFilter.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    // Let the parent handle the response first
    super.catch(exception, host);

    // Then log to platform_error_log (additive, non-blocking)
    try {
      const ctx = host.switchToHttp();
      const request = ctx.getRequest<Request>();
      const response = ctx.getResponse<Response>();

      const httpStatus =
        exception instanceof HttpException
          ? exception.getStatus()
          : HttpStatus.INTERNAL_SERVER_ERROR;

      // Only log 5xx errors (and optionally 4xx if configured)
      if (httpStatus < 500) return;

      const requestContext = getRequestContext();
      const tenantId = requestContext?.tenantId ?? null;
      const userId = requestContext?.userId ?? null;
      const requestId = requestContext?.requestId ?? null;

      const errorCode =
        exception instanceof HttpException
          ? (((exception.getResponse() as Record<string, unknown>)?.code as string) ??
            'INTERNAL_ERROR')
          : 'INTERNAL_ERROR';

      const message = exception instanceof Error ? exception.message : String(exception);

      const stackTrace = exception instanceof Error ? (exception.stack ?? null) : null;

      // Fire-and-forget insert (do not block response)
      this.prisma.platformErrorLog
        .create({
          data: {
            tenant_id: tenantId,
            error_code: errorCode,
            message,
            stack_trace: stackTrace,
            endpoint: `${request.method} ${request.path}`,
            http_status: httpStatus,
            user_id: userId,
            request_id: requestId,
          },
        })
        .catch((err) => {
          this.logger.error('Failed to log error to platform_error_log:', err);
        });
    } catch (filterErr) {
      this.logger.error('PlatformErrorLogFilter internal error:', filterErr);
    }
  }
}
```

**Registration in `app.module.ts`:**

```typescript
// The SentryGlobalFilter runs first (existing), then PlatformErrorLogFilter
// Register as a secondary APP_FILTER or use a module-level provider
```

Important: The filter uses `BaseExceptionFilter` to ensure the normal error response is sent first, then it performs a fire-and-forget insert. The insert must never block or alter the response.

### 3.5 Error Log Service

**File:** `apps/api/src/modules/platform-admin/error-log.service.ts`

```typescript
@Injectable()
export class ErrorLogService {
  private readonly logger = new Logger(ErrorLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listErrors(query: ErrorLogQuery): Promise<{
    data: PlatformErrorLog[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const { page, pageSize, tenant_id, endpoint, http_status, from, to } = query;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (tenant_id) where.tenant_id = tenant_id;
    if (endpoint) where.endpoint = { contains: endpoint, mode: 'insensitive' };
    if (http_status) where.http_status = http_status;
    if (from || to) {
      where.created_at = {};
      if (from) (where.created_at as Record<string, unknown>).gte = new Date(from);
      if (to) (where.created_at as Record<string, unknown>).lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      this.prisma.platformErrorLog.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.platformErrorLog.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  async getError(id: string): Promise<PlatformErrorLog> {
    const error = await this.prisma.platformErrorLog.findUnique({ where: { id } });
    if (!error) {
      throw new NotFoundException({
        code: 'ERROR_LOG_NOT_FOUND',
        message: `Error log entry with id "${id}" not found`,
      });
    }
    return error;
  }

  async getErrorsByTenant(
    tenantId: string,
    query: ErrorLogQuery,
  ): Promise<{
    data: PlatformErrorLog[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    return this.listErrors({ ...query, tenant_id: tenantId });
  }

  // ─── Cleanup Cron ──────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupOldErrors(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.prisma.platformErrorLog.deleteMany({
      where: { created_at: { lt: thirtyDaysAgo } },
    });

    this.logger.log(`Cleaned up ${result.count} error log entries older than 30 days`);
  }
}
```

### 3.6 Tenant Metrics Controller

**File:** `apps/api/src/modules/platform-admin/tenant-metrics.controller.ts`

```typescript
@Controller('v1/admin')
@UseGuards(AuthGuard, PlatformOwnerGuard)
export class TenantMetricsController {
  constructor(
    private readonly metricsService: TenantMetricsService,
    private readonly errorLogService: ErrorLogService,
  ) {}

  // GET /v1/admin/tenants/:id/metrics
  @Get('tenants/:id/metrics')
  async getTenantMetrics(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(tenantMetricsQuerySchema)) query: TenantMetricsQuery,
  ) {
    return this.metricsService.getMetricsForTenant(id, query.days);
  }

  // GET /v1/admin/tenants/metrics/compare
  // Note: static route before dynamic :id
  @Get('tenants/metrics/compare')
  async compareMetrics(
    @Query(new ZodValidationPipe(tenantMetricsCompareSchema)) query: TenantMetricsCompareDto,
  ) {
    return this.metricsService.compareMetrics(query.tenant_ids, query.days);
  }

  // GET /v1/admin/tenants/:id/errors
  @Get('tenants/:id/errors')
  async getTenantErrors(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(errorLogQuerySchema)) query: ErrorLogQuery,
  ) {
    return this.errorLogService.getErrorsByTenant(id, query);
  }

  // GET /v1/admin/errors
  @Get('errors')
  async listErrors(@Query(new ZodValidationPipe(errorLogQuerySchema)) query: ErrorLogQuery) {
    return this.errorLogService.listErrors(query);
  }

  // GET /v1/admin/errors/:id
  @Get('errors/:id')
  async getError(@Param('id', ParseUUIDPipe) id: string) {
    return this.errorLogService.getError(id);
  }
}
```

**Route ordering note:** `tenants/metrics/compare` (static) must be defined before `tenants/:id/metrics` (dynamic) to avoid the router matching "metrics" as a UUID and failing the `ParseUUIDPipe`.

---

## 4. Frontend Changes

### 4.1 Tenant Detail Page -- Analytics Tab

**File:** `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/page.tsx` (modify)

Add a new `analytics` tab alongside existing `overview`, `domains`, `modules` tabs:

```typescript
type TabKey = 'overview' | 'domains' | 'modules' | 'analytics' | 'errors';
```

The **Analytics tab** shows:

1. **Stat cards row** (latest snapshot):
   - Students (number + delta from previous day)
   - Staff
   - Parents
   - Active Users (24h)
   - Active Users (7d)
   - Overdue Invoices (red if > 0)
   - Errors (24h) (red if > 0)

2. **Trend chart** (line chart using Recharts):
   - X-axis: dates (last 30 days by default)
   - Y-axis: metric value
   - Selectable metric: students, active users, errors, etc.
   - Multiple series support (students + staff on same chart)

3. **Modules enabled** list (from latest snapshot)

### 4.2 Analytics Tab Component

**File:** `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/_components/analytics-tab.tsx`

```typescript
interface AnalyticsTabProps {
  tenantId: string;
}

export function AnalyticsTab({ tenantId }: AnalyticsTabProps) {
  const [data, setData] = React.useState<TenantMetricsResponse | null>(null);
  const [days, setDays] = React.useState(30);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetch() {
      setLoading(true);
      const result = await apiClient<TenantMetricsResponse>(
        `/api/v1/admin/tenants/${tenantId}/metrics?days=${days}`,
      );
      setData(result);
      setLoading(false);
    }
    fetch();
  }, [tenantId, days]);

  // Render stat cards + trend chart
}
```

### 4.3 Tenant Comparison Page

**File:** `apps/web/src/app/[locale]/(platform)/admin/tenants/compare/page.tsx`

Page structure:

1. **PageHeader** -- "Tenant Comparison"
2. **Tenant selector** -- multi-select dropdown (select 2-10 tenants)
3. **Time range selector** -- 7d / 30d / 60d / 90d
4. **Comparison table** -- rows are metrics, columns are tenants:

```
                    | School A  | School B  | School C  |
--------------------|-----------|-----------|-----------|
Students            | 340       | 212       | 0         |
Staff               | 28        | 19        | 0         |
Active Users (24h)  | 12        | 8         | 0         |
Errors (24h)        | 0         | 3         | 0         |
Modules Enabled     | 14        | 12        | 5         |
```

5. **Comparison chart** -- overlay trend lines for selected metric across tenants

### 4.4 Error Diagnostics Page

**File:** `apps/web/src/app/[locale]/(platform)/admin/errors/page.tsx`

Page structure:

1. **PageHeader** -- "Error Diagnostics" with subtitle "Platform-wide error log"
2. **Filter bar**:
   - Tenant dropdown (all tenants + "Platform-level")
   - Endpoint text filter
   - HTTP status dropdown (500, 502, 503, etc.)
   - Date range picker
3. **Summary stat cards**:
   - Total errors (in selected range)
   - Errors today
   - Top endpoint (most errors)
   - Top tenant (most errors)
4. **Error list DataTable** with columns:
   - Timestamp (relative time + absolute)
   - Tenant (name or "Platform")
   - Endpoint (e.g., `POST /v1/students`)
   - HTTP Status (badge: 500=red, 502=orange, etc.)
   - Error Code (`UPPER_SNAKE_CASE`)
   - Message (truncated)
   - Request ID (monospace, for correlation)
5. **Click row** -- expands inline to show:
   - Full error message
   - Stack trace in a scrollable `<pre>` block
   - User ID (if available)
   - Request ID

### 4.5 Error Detail Expansion Component

**File:** `apps/web/src/app/[locale]/(platform)/admin/errors/_components/error-detail-row.tsx`

An expandable table row that shows the full stack trace:

```typescript
function ErrorDetailRow({ error }: { error: PlatformErrorLog }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <>
      <tr onClick={() => setExpanded(!expanded)} className="cursor-pointer hover:bg-surface-secondary">
        {/* Standard columns */}
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-surface-secondary px-6 py-4">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-text-tertiary">Full Message</p>
                <p className="mt-1 text-sm text-text-primary">{error.message}</p>
              </div>
              {error.stack_trace && (
                <div>
                  <p className="text-xs font-medium text-text-tertiary">Stack Trace</p>
                  <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-background p-3 text-xs font-mono text-text-secondary">
                    {error.stack_trace}
                  </pre>
                </div>
              )}
              <div className="flex gap-6">
                <InfoField label="Request ID" value={error.request_id ?? 'N/A'} mono />
                <InfoField label="User ID" value={error.user_id ?? 'N/A'} mono />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
```

### 4.6 Errors Tab on Tenant Detail

**File:** `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/_components/errors-tab.tsx`

A simplified version of the error diagnostics page, pre-filtered to the current tenant. Shows the same DataTable with expandable rows.

---

## 5. Files to Create

| #   | File Path                                                                               | Purpose                                 |
| --- | --------------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | `apps/api/src/modules/platform-admin/tenant-metrics.service.ts`                         | Metrics collection cron + query methods |
| 2   | `apps/api/src/modules/platform-admin/tenant-metrics.service.spec.ts`                    | Metrics service unit tests              |
| 3   | `apps/api/src/modules/platform-admin/tenant-metrics.controller.ts`                      | Metrics + errors API controller         |
| 4   | `apps/api/src/modules/platform-admin/tenant-metrics.controller.spec.ts`                 | Controller unit tests                   |
| 5   | `apps/api/src/modules/platform-admin/error-log.service.ts`                              | Error log query + cleanup cron          |
| 6   | `apps/api/src/modules/platform-admin/error-log.service.spec.ts`                         | Error log service unit tests            |
| 7   | `apps/api/src/modules/platform-admin/error-log.filter.ts`                               | Additive global exception filter        |
| 8   | `apps/api/src/modules/platform-admin/error-log.filter.spec.ts`                          | Exception filter unit tests             |
| 9   | `apps/api/src/modules/platform-admin/dto/tenant-metrics.dto.ts`                         | DTO re-exports                          |
| 10  | `apps/api/src/modules/platform-admin/dto/error-log.dto.ts`                              | DTO re-exports                          |
| 11  | `packages/prisma/migrations/YYYYMMDDHHMMSS_add_platform_tenant_metrics/migration.sql`   | Metrics table migration                 |
| 12  | `packages/prisma/migrations/YYYYMMDDHHMMSS_add_platform_error_log/migration.sql`        | Error log table migration               |
| 13  | `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/_components/analytics-tab.tsx` | Tenant analytics tab                    |
| 14  | `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/_components/errors-tab.tsx`    | Tenant errors tab                       |
| 15  | `apps/web/src/app/[locale]/(platform)/admin/tenants/compare/page.tsx`                   | Tenant comparison page                  |
| 16  | `apps/web/src/app/[locale]/(platform)/admin/errors/page.tsx`                            | Error diagnostics page                  |
| 17  | `apps/web/src/app/[locale]/(platform)/admin/errors/_components/error-detail-row.tsx`    | Expandable error row                    |

## 6. Files to Modify

| #   | File Path                                                          | Change                                                                               |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 1   | `packages/prisma/schema.prisma`                                    | Add `PlatformTenantMetric` model, `PlatformErrorLog` model, add relation to `Tenant` |
| 2   | `packages/shared/src/schemas/platform-admin.schema.ts`             | Add metrics and error log schemas                                                    |
| 3   | `packages/shared/src/index.ts`                                     | Export new schemas                                                                   |
| 4   | `apps/api/src/modules/platform-admin/platform-admin.module.ts`     | Register new controller, services, filter                                            |
| 5   | `apps/api/src/app.module.ts`                                       | Register `PlatformErrorLogFilter` as secondary APP_FILTER                            |
| 6   | `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/page.tsx` | Add "Analytics" and "Errors" tabs                                                    |
| 7   | `apps/web/src/app/[locale]/(platform)/layout.tsx`                  | Add "Errors" nav item under Operations, add "Compare" under Tenants                  |

---

## 7. Testing Strategy

### Unit Tests -- `tenant-metrics.service.spec.ts`

```typescript
describe('TenantMetricsService', () => {
  describe('collectDailyMetrics', () => {
    it('should collect metrics for all active tenants');
    it('should skip suspended/archived tenants');
    it('should upsert (not duplicate) on re-run for same day');
    it('should continue collection if one tenant fails');
  });

  describe('getMetricsForTenant', () => {
    it('should return latest snapshot and history');
    it('should filter by date range');
    it('should return null latest if no snapshots exist');
  });

  describe('compareMetrics', () => {
    it('should return metrics for multiple tenants');
    it('should include tenant names in response');
  });
});
```

### Unit Tests -- `error-log.service.spec.ts`

```typescript
describe('ErrorLogService', () => {
  describe('listErrors', () => {
    it('should return paginated errors');
    it('should filter by tenant_id');
    it('should filter by endpoint');
    it('should filter by http_status');
    it('should filter by date range');
  });

  describe('getError', () => {
    it('should return single error with stack trace');
    it('should throw NotFoundException for unknown ID');
  });

  describe('cleanupOldErrors', () => {
    it('should delete errors older than 30 days');
    it('should not delete recent errors');
  });
});
```

### Unit Tests -- `error-log.filter.spec.ts`

```typescript
describe('PlatformErrorLogFilter', () => {
  it('should log 5xx errors to platform_error_log');
  it('should NOT log 4xx errors');
  it('should include tenant_id from request context');
  it('should include request_id from correlation middleware');
  it('should not block the response if logging fails');
  it('should not alter the error response sent to the client');
});
```

### Unit Tests -- `tenant-metrics.controller.spec.ts`

```typescript
describe('TenantMetricsController', () => {
  it('should return 401 without auth token');
  it('should return 403 for non-platform-owner');
  it('should return tenant metrics with default 30-day range');
  it('should return compared metrics for multiple tenants');
  it('should return tenant errors filtered by tenant_id');
  it('should return platform-wide errors');
  it('should route static compare endpoint before dynamic :id');
});
```

---

## 8. Acceptance Criteria

### Tenant Analytics

- [ ] `platform_tenant_metrics` table created with migration
- [ ] Daily cron collects metrics for all active tenants at 2 AM
- [ ] Metrics include: students_count, staff_count, parents_count, active_users_24h, active_users_7d, invoices_total, invoices_overdue, errors_24h, modules_enabled, last_login_at
- [ ] Upsert prevents duplicate snapshots for the same tenant+date
- [ ] `GET /v1/admin/tenants/:id/metrics` returns latest snapshot + history
- [ ] `GET /v1/admin/tenants/metrics/compare` returns side-by-side metrics for 2+ tenants
- [ ] Tenant detail page has "Analytics" tab with stat cards and trend chart (Recharts)
- [ ] Comparison page allows selecting multiple tenants and viewing metrics side-by-side

### Error Diagnostics

- [ ] `platform_error_log` table created with migration
- [ ] Additive exception filter logs 5xx errors without disrupting normal error handling
- [ ] Error log includes tenant_id (from request context), request_id (from correlation middleware)
- [ ] `GET /v1/admin/errors` returns paginated, filterable platform-wide error log
- [ ] `GET /v1/admin/tenants/:id/errors` returns errors filtered to a tenant
- [ ] `GET /v1/admin/errors/:id` returns single error with full stack trace
- [ ] Cleanup cron removes errors older than 30 days at 3 AM
- [ ] Error diagnostics page shows grouped errors with expandable stack traces
- [ ] Filters work: tenant, endpoint, HTTP status, date range
- [ ] Tenant detail page has "Errors" tab showing tenant-specific errors

### Cross-Cutting

- [ ] All endpoints guarded by `PlatformOwnerGuard`
- [ ] All tests pass: `turbo test --filter=api`
- [ ] `turbo lint` and `turbo type-check` pass with zero errors
- [ ] Error log filter does not interfere with existing SentryGlobalFilter
- [ ] Static route `/tenants/metrics/compare` resolves correctly before `/tenants/:id`
