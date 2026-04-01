# Session 2C -- Queue Management & Diagnostics

**Depends on:** Layer 1A (WebSocket infrastructure with `PlatformGateway` and Redis pub/sub)
**Independent of:** Sessions 2A, 2B, 2D -- can run in parallel

---

## 1. Objective

Provide full BullMQ queue visibility and control from the platform admin dashboard. Platform owners can:

- See all 20 queues with real-time job counts (waiting, active, completed, failed, delayed)
- Drill into any queue to inspect individual jobs
- View job details including payload, error stack traces, and attempt history
- Retry failed jobs
- Pause and resume queue processing
- Clean completed and failed jobs
- Receive real-time queue depth updates via WebSocket

**No new database tables.** All data comes from BullMQ's Redis-backed introspection API.

---

## 2. Queue Inventory

All queues are defined in `apps/worker/src/base/queue.constants.ts`:

| Constant        | Queue Name      | Domain                      |
| --------------- | --------------- | --------------------------- |
| `ADMISSIONS`    | `admissions`    | Student admissions          |
| `APPROVALS`     | `approvals`     | Approval workflows          |
| `ATTENDANCE`    | `attendance`    | Attendance processing       |
| `BEHAVIOUR`     | `behaviour`     | Behaviour management        |
| `COMPLIANCE`    | `compliance`    | GDPR/compliance jobs        |
| `EARLY_WARNING` | `early-warning` | Student risk signals        |
| `ENGAGEMENT`    | `engagement`    | Parent engagement           |
| `FINANCE`       | `finance`       | Invoicing, payments         |
| `GRADEBOOK`     | `gradebook`     | Grade calculations          |
| `HOMEWORK`      | `homework`      | Homework notifications      |
| `IMPORTS`       | `imports`       | Data import processing      |
| `NOTIFICATIONS` | `notifications` | Email/notification dispatch |
| `PASTORAL`      | `pastoral`      | Pastoral care workflows     |
| `PAYROLL`       | `payroll`       | Payroll processing          |
| `REGULATORY`    | `regulatory`    | Regulatory submissions      |
| `REPORTS`       | `reports`       | Report generation           |
| `SCHEDULING`    | `scheduling`    | Timetable scheduling        |
| `SEARCH_SYNC`   | `search-sync`   | Meilisearch index sync      |
| `SECURITY`      | `security`      | Security audit jobs         |
| `WELLBEING`     | `wellbeing`     | Staff wellbeing surveys     |

---

## 3. Backend Changes

### 3.1 Shared Schemas

**File:** `packages/shared/src/schemas/platform-admin.schema.ts` (extend)

```typescript
// ─── Queue Management Schemas ─────────────────────────────────────────────────

const JOB_STATUSES = ['waiting', 'active', 'completed', 'failed', 'delayed', 'paused'] as const;

export const listQueueJobsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(JOB_STATUSES).optional(),
});

export type ListQueueJobsQuery = z.infer<typeof listQueueJobsQuerySchema>;

export const cleanQueueSchema = z.object({
  status: z.enum(['completed', 'failed']),
  grace_ms: z.number().int().min(0).default(0), // grace period in ms
});

export type CleanQueueDto = z.infer<typeof cleanQueueSchema>;

export { JOB_STATUSES };
```

### 3.2 DTO Re-exports

**File:** `apps/api/src/modules/platform-admin/dto/queue.dto.ts`

```typescript
import type { ListQueueJobsQuery, CleanQueueDto } from '@school/shared';

export type { ListQueueJobsQuery, CleanQueueDto };
```

### 3.3 Queue Management Controller

**File:** `apps/api/src/modules/platform-admin/queue-management.controller.ts`

```typescript
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { cleanQueueSchema, listQueueJobsQuerySchema } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import type { CleanQueueDto, ListQueueJobsQuery } from './dto/queue.dto';
import { PlatformOwnerGuard } from '../tenants/guards/platform-owner.guard';
import { QueueManagementService } from './queue-management.service';

@Controller('v1/admin/queues')
@UseGuards(AuthGuard, PlatformOwnerGuard)
export class QueueManagementController {
  constructor(private readonly queueService: QueueManagementService) {}

  // GET /v1/admin/queues
  @Get()
  async listQueues(): Promise<QueueSummary[]> {
    return this.queueService.listQueues();
  }

  // GET /v1/admin/queues/:name/jobs
  @Get(':name/jobs')
  async listJobs(
    @Param('name') name: string,
    @Query(new ZodValidationPipe(listQueueJobsQuerySchema)) query: ListQueueJobsQuery,
  ) {
    return this.queueService.listJobs(name, query);
  }

  // GET /v1/admin/queues/:name/jobs/:id
  @Get(':name/jobs/:id')
  async getJobDetail(@Param('name') name: string, @Param('id') jobId: string) {
    return this.queueService.getJobDetail(name, jobId);
  }

  // POST /v1/admin/queues/:name/jobs/:id/retry
  @Post(':name/jobs/:id/retry')
  @HttpCode(HttpStatus.OK)
  async retryJob(@Param('name') name: string, @Param('id') jobId: string) {
    return this.queueService.retryJob(name, jobId);
  }

  // POST /v1/admin/queues/:name/pause
  @Post(':name/pause')
  @HttpCode(HttpStatus.OK)
  async pauseQueue(@Param('name') name: string) {
    return this.queueService.pauseQueue(name);
  }

  // POST /v1/admin/queues/:name/resume
  @Post(':name/resume')
  @HttpCode(HttpStatus.OK)
  async resumeQueue(@Param('name') name: string) {
    return this.queueService.resumeQueue(name);
  }

  // POST /v1/admin/queues/:name/clean
  @Post(':name/clean')
  @HttpCode(HttpStatus.OK)
  async cleanQueue(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(cleanQueueSchema)) dto: CleanQueueDto,
  ) {
    return this.queueService.cleanQueue(name, dto);
  }
}
```

### 3.4 Queue Management Service

**File:** `apps/api/src/modules/platform-admin/queue-management.service.ts`

```typescript
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@school/shared'; // or import from worker constants

import { RedisService } from '../redis/redis.service';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueSummary {
  name: string;
  is_paused: boolean;
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
  };
}

interface JobSummary {
  id: string;
  name: string;
  status: string;
  timestamp: number;
  processed_on: number | null;
  finished_on: number | null;
  attempts_made: number;
  failed_reason: string | null;
  data: Record<string, unknown>;
}

interface JobDetail extends JobSummary {
  opts: Record<string, unknown>;
  stacktrace: string[];
  return_value: unknown;
}

// ─── Valid queue names ────────────────────────────────────────────────────────

const VALID_QUEUE_NAMES = new Set(Object.values(QUEUE_NAMES));

@Injectable()
export class QueueManagementService {
  private readonly logger = new Logger(QueueManagementService.name);
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly redis: RedisService) {
    // Create Queue instances for each known queue
    // These are read-only connections used for introspection
    for (const name of VALID_QUEUE_NAMES) {
      this.queues.set(
        name,
        new Queue(name, {
          connection: this.redis.getConnectionOptions(),
        }),
      );
    }
  }

  async listQueues(): Promise<QueueSummary[]> {
    const results: QueueSummary[] = [];

    for (const [name, queue] of this.queues) {
      try {
        const [counts, isPaused] = await Promise.all([
          queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused'),
          queue.isPaused(),
        ]);

        results.push({
          name,
          is_paused: isPaused,
          counts: {
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            completed: counts.completed ?? 0,
            failed: counts.failed ?? 0,
            delayed: counts.delayed ?? 0,
            paused: counts.paused ?? 0,
          },
        });
      } catch (err) {
        this.logger.error(`Failed to get counts for queue "${name}":`, err);
        results.push({
          name,
          is_paused: false,
          counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
        });
      }
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  async listJobs(
    queueName: string,
    query: { page: number; pageSize: number; status?: string },
  ): Promise<{ data: JobSummary[]; meta: { page: number; pageSize: number; total: number } }> {
    const queue = this.getQueue(queueName);
    const { page, pageSize, status } = query;

    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;

    // Get jobs by status, or all statuses
    const statusTypes = status ? [status] : ['waiting', 'active', 'completed', 'failed', 'delayed'];

    let allJobs: JobSummary[] = [];

    for (const s of statusTypes) {
      const jobs = await queue.getJobs([s], start, end);
      for (const job of jobs) {
        allJobs.push({
          id: job.id ?? 'unknown',
          name: job.name,
          status: await job.getState(),
          timestamp: job.timestamp,
          processed_on: job.processedOn ?? null,
          finished_on: job.finishedOn ?? null,
          attempts_made: job.attemptsMade,
          failed_reason: job.failedReason ?? null,
          data: job.data as Record<string, unknown>,
        });
      }
    }

    // Sort by timestamp descending (newest first)
    allJobs.sort((a, b) => b.timestamp - a.timestamp);

    // Get total count
    const counts = await queue.getJobCounts(...statusTypes);
    const total = Object.values(counts).reduce((sum, c) => sum + (c ?? 0), 0);

    return {
      data: allJobs.slice(0, pageSize),
      meta: { page, pageSize, total },
    };
  }

  async getJobDetail(queueName: string, jobId: string): Promise<JobDetail> {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);

    if (!job) {
      throw new NotFoundException({
        code: 'JOB_NOT_FOUND',
        message: `Job "${jobId}" not found in queue "${queueName}"`,
      });
    }

    return {
      id: job.id ?? 'unknown',
      name: job.name,
      status: await job.getState(),
      timestamp: job.timestamp,
      processed_on: job.processedOn ?? null,
      finished_on: job.finishedOn ?? null,
      attempts_made: job.attemptsMade,
      failed_reason: job.failedReason ?? null,
      data: job.data as Record<string, unknown>,
      opts: job.opts as Record<string, unknown>,
      stacktrace: job.stacktrace ?? [],
      return_value: job.returnvalue,
    };
  }

  async retryJob(queueName: string, jobId: string): Promise<{ retried: true }> {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);

    if (!job) {
      throw new NotFoundException({
        code: 'JOB_NOT_FOUND',
        message: `Job "${jobId}" not found in queue "${queueName}"`,
      });
    }

    const state = await job.getState();
    if (state !== 'failed') {
      throw new BadRequestException({
        code: 'JOB_NOT_FAILED',
        message: `Job "${jobId}" is in state "${state}" — only failed jobs can be retried`,
      });
    }

    await job.retry();
    return { retried: true };
  }

  async pauseQueue(queueName: string): Promise<{ paused: true }> {
    const queue = this.getQueue(queueName);
    await queue.pause();
    return { paused: true };
  }

  async resumeQueue(queueName: string): Promise<{ resumed: true }> {
    const queue = this.getQueue(queueName);
    await queue.resume();
    return { resumed: true };
  }

  async cleanQueue(
    queueName: string,
    dto: { status: 'completed' | 'failed'; grace_ms: number },
  ): Promise<{ cleaned: number }> {
    const queue = this.getQueue(queueName);
    const cleaned = await queue.clean(dto.grace_ms, 1000, dto.status);
    return { cleaned: cleaned.length };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private getQueue(name: string): Queue {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new NotFoundException({
        code: 'QUEUE_NOT_FOUND',
        message: `Queue "${name}" not found. Valid queues: ${Array.from(VALID_QUEUE_NAMES).join(', ')}`,
      });
    }
    return queue;
  }
}
```

### 3.5 Real-Time Queue Metrics Publisher

**File:** `apps/api/src/modules/platform-admin/queue-metrics.service.ts`

A scheduled service that publishes queue depth metrics to the `platform:queues` WebSocket channel at regular intervals.

```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { RedisService } from '../redis/redis.service';

import { QueueManagementService } from './queue-management.service';

@Injectable()
export class QueueMetricsService implements OnModuleInit {
  private readonly logger = new Logger(QueueMetricsService.name);

  constructor(
    private readonly queueService: QueueManagementService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit() {
    this.logger.log('Queue metrics publisher initialized');
  }

  // Publish queue metrics every 10 seconds
  @Cron('*/10 * * * * *')
  async publishQueueMetrics(): Promise<void> {
    try {
      const queues = await this.queueService.listQueues();
      await this.redis.getClient().publish(
        'platform:queues',
        JSON.stringify({
          type: 'queue_metrics',
          queues: queues.map((q) => ({
            name: q.name,
            is_paused: q.is_paused,
            waiting: q.counts.waiting,
            active: q.counts.active,
            failed: q.counts.failed,
            delayed: q.counts.delayed,
          })),
          timestamp: new Date().toISOString(),
        }),
      );
    } catch (err) {
      this.logger.error('Failed to publish queue metrics:', err);
    }
  }
}
```

### 3.6 Extend Platform Gateway (from Layer 1A)

**File:** `apps/api/src/modules/platform-admin/platform.gateway.ts` (modify from 1A)

Add subscription to the `platform:queues` Redis channel and forward to WebSocket clients:

```typescript
// In the gateway's Redis subscriber setup:
this.subscriber.subscribe('platform:queues');

// In the message handler:
case 'platform:queues':
  this.server.emit('queue_metrics', JSON.parse(message));
  break;
```

---

## 4. Frontend Changes

### 4.1 Queue Dashboard Page

**File:** `apps/web/src/app/[locale]/(platform)/admin/queues/page.tsx`

Page structure:

1. **PageHeader** -- "Queue Manager" with subtitle "Monitor and manage background job queues"
2. **Summary stats** -- 4 stat cards at the top:
   - Total Waiting (sum of all queue waiting counts)
   - Total Active
   - Total Failed
   - Queues Paused (count of paused queues)
3. **Queue cards grid** -- one card per queue, showing:
   - Queue name (bold, monospace)
   - Job counts in mini badges: waiting (blue), active (green), failed (red), delayed (amber)
   - Paused indicator (if paused)
   - Click to navigate to queue detail page
4. **Real-time updates** -- subscribe to WebSocket `queue_metrics` event, update counts live

```typescript
// WebSocket subscription (using Socket.IO client from Layer 1A):
React.useEffect(() => {
  const socket = io(WS_URL, { auth: { token: accessToken } });
  socket.on('queue_metrics', (data) => {
    setQueueMetrics(data.queues);
  });
  return () => {
    socket.disconnect();
  };
}, [accessToken]);
```

### 4.2 Queue Detail Page

**File:** `apps/web/src/app/[locale]/(platform)/admin/queues/[name]/page.tsx`

Page structure:

1. **Breadcrumb** -- Queue Manager > [queue name]
2. **Queue header** -- queue name + status (active/paused) + action buttons:
   - Pause/Resume toggle button
   - Clean Completed button (with confirmation dialog)
   - Clean Failed button (with confirmation dialog)
3. **Status filter tabs** -- All | Waiting | Active | Completed | Failed | Delayed
4. **Job list DataTable** with columns:
   - Job ID (monospace)
   - Job Name
   - Status (colored badge)
   - Created (timestamp, relative time)
   - Duration (processed_on to finished_on, or "running" for active)
   - Attempts (e.g., "2/3")
   - Error (truncated failed_reason, if any)
   - Actions (Retry button for failed jobs, View detail)
5. **Pagination** -- standard page/pageSize controls
6. **Click job row** -- opens job detail panel (slide-in from end)

### 4.3 Job Detail Panel

**File:** `apps/web/src/app/[locale]/(platform)/admin/queues/[name]/_components/job-detail-panel.tsx`

A slide-over panel (or expandable row) showing:

```
Job ID:        abc123-def456
Job Name:      notifications:send-email
Status:        failed
Queue:         notifications
Created:       2 minutes ago (2026-04-01 14:32:10)
Started:       2 minutes ago (2026-04-01 14:32:11)
Finished:      1 minute ago (2026-04-01 14:32:15)
Duration:      4.2s
Attempts:      3 / 3

── Payload ──────────────────────────────────────────
{
  "tenant_id": "abc-123",
  "to": "parent@school.com",
  "subject": "Attendance Alert",
  ...
}

── Error ────────────────────────────────────────────
Error: SMTP connection refused at port 587
    at SmtpTransport.connect (smtp-transport.ts:42)
    at NotificationProcessor.process (notification.processor.ts:88)
    ...

── Attempt History ──────────────────────────────────
Attempt 1: failed at 14:32:12 (SMTP timeout)
Attempt 2: failed at 14:32:13 (SMTP timeout)
Attempt 3: failed at 14:32:15 (SMTP connection refused)

[Retry Job]  [Close]
```

The payload JSON is rendered in a `<pre>` block with syntax highlighting (or at minimum a monospace font). Error stack traces are in a scrollable code block.

### 4.4 Clean Queue Confirmation Dialog

**File:** `apps/web/src/app/[locale]/(platform)/admin/queues/[name]/_components/clean-confirm-dialog.tsx`

A confirmation dialog that warns before cleaning:

```
Are you sure you want to clean [completed/failed] jobs from the "[notifications]" queue?

This will remove [X] [completed/failed] jobs. This action cannot be undone.

[Cancel]  [Clean Jobs]
```

### 4.5 Queue Status Badge

**File:** `apps/web/src/app/[locale]/(platform)/admin/queues/_components/queue-status-badge.tsx`

A small badge component for job statuses:

- `waiting` -- blue
- `active` -- green with pulse animation
- `completed` -- slate/neutral
- `failed` -- red
- `delayed` -- amber
- `paused` -- grey

---

## 5. Files to Create

| #   | File Path                                                                                       | Purpose                         |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------- |
| 1   | `apps/api/src/modules/platform-admin/queue-management.controller.ts`                            | Queue CRUD + actions controller |
| 2   | `apps/api/src/modules/platform-admin/queue-management.controller.spec.ts`                       | Controller unit tests           |
| 3   | `apps/api/src/modules/platform-admin/queue-management.service.ts`                               | BullMQ introspection service    |
| 4   | `apps/api/src/modules/platform-admin/queue-management.service.spec.ts`                          | Service unit tests              |
| 5   | `apps/api/src/modules/platform-admin/queue-metrics.service.ts`                                  | Real-time metrics publisher     |
| 6   | `apps/api/src/modules/platform-admin/queue-metrics.service.spec.ts`                             | Metrics publisher tests         |
| 7   | `apps/api/src/modules/platform-admin/dto/queue.dto.ts`                                          | DTO re-exports                  |
| 8   | `apps/web/src/app/[locale]/(platform)/admin/queues/page.tsx`                                    | Queue dashboard page            |
| 9   | `apps/web/src/app/[locale]/(platform)/admin/queues/[name]/page.tsx`                             | Queue detail page               |
| 10  | `apps/web/src/app/[locale]/(platform)/admin/queues/[name]/_components/job-detail-panel.tsx`     | Job detail slide-over           |
| 11  | `apps/web/src/app/[locale]/(platform)/admin/queues/[name]/_components/clean-confirm-dialog.tsx` | Clean confirmation              |
| 12  | `apps/web/src/app/[locale]/(platform)/admin/queues/_components/queue-status-badge.tsx`          | Status badge component          |

## 6. Files to Modify

| #   | File Path                                                      | Change                                                                                                                                                                                          |
| --- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `packages/shared/src/schemas/platform-admin.schema.ts`         | Add queue management schemas                                                                                                                                                                    |
| 2   | `packages/shared/src/index.ts`                                 | Export queue schemas                                                                                                                                                                            |
| 3   | `apps/api/src/modules/platform-admin/platform-admin.module.ts` | Register `QueueManagementController`, `QueueManagementService`, `QueueMetricsService`. Import `BullModule.registerQueue()` for all 20 queues (or use the service's direct Queue instantiation). |
| 4   | `apps/api/src/modules/platform-admin/platform.gateway.ts`      | Subscribe to `platform:queues` Redis channel, forward to WebSocket clients                                                                                                                      |
| 5   | `apps/web/src/app/[locale]/(platform)/layout.tsx`              | Add "Queue Manager" nav item to sidebar under Operations                                                                                                                                        |

---

## 7. Testing Strategy

### Unit Tests -- `queue-management.service.spec.ts`

```typescript
describe('QueueManagementService', () => {
  describe('listQueues', () => {
    it('should return all 20 queues with counts');
    it('should handle queue introspection errors gracefully');
    it('should report paused state correctly');
  });

  describe('listJobs', () => {
    it('should list jobs with pagination');
    it('should filter jobs by status');
    it('should sort jobs by timestamp descending');
    it('should throw NotFoundException for unknown queue');
  });

  describe('getJobDetail', () => {
    it('should return full job detail with stacktrace');
    it('should throw NotFoundException for unknown job');
  });

  describe('retryJob', () => {
    it('should retry a failed job');
    it('should throw BadRequestException for non-failed job');
    it('should throw NotFoundException for unknown job');
  });

  describe('pauseQueue', () => {
    it('should pause queue processing');
  });

  describe('resumeQueue', () => {
    it('should resume paused queue');
  });

  describe('cleanQueue', () => {
    it('should clean completed jobs');
    it('should clean failed jobs');
    it('should respect grace period');
  });
});
```

### Unit Tests -- `queue-management.controller.spec.ts`

```typescript
describe('QueueManagementController', () => {
  it('should return 401 without auth token');
  it('should return 403 for non-platform-owner');
  it('should list queues');
  it('should list jobs with status filter');
  it('should return 404 for unknown queue');
  it('should retry a failed job');
  it('should clean queue with valid body');
  it('should return 400 for invalid clean status');
});
```

### Unit Tests -- `queue-metrics.service.spec.ts`

```typescript
describe('QueueMetricsService', () => {
  it('should publish queue metrics to Redis platform:queues channel');
  it('should handle publish errors gracefully');
});
```

### Mock Strategy

BullMQ `Queue` class is mocked in tests. The mock provides:

- `getJobCounts()` returning predefined counts
- `getJobs()` returning mock job arrays
- `getJob()` returning a mock job or null
- `isPaused()` returning boolean
- `pause()`, `resume()`, `clean()` as jest.fn()

---

## 8. Acceptance Criteria

- [ ] `GET /v1/admin/queues` returns all 20 queues with correct job counts
- [ ] `GET /v1/admin/queues/:name/jobs` returns paginated job list, filterable by status
- [ ] `GET /v1/admin/queues/:name/jobs/:id` returns full job detail with payload, error, stacktrace
- [ ] `POST /v1/admin/queues/:name/jobs/:id/retry` retries a failed job (400 for non-failed)
- [ ] `POST /v1/admin/queues/:name/pause` pauses queue processing
- [ ] `POST /v1/admin/queues/:name/resume` resumes paused queue
- [ ] `POST /v1/admin/queues/:name/clean` cleans completed or failed jobs
- [ ] Queue name validation: returns 404 for queue names not in `QUEUE_NAMES`
- [ ] All endpoints guarded by `PlatformOwnerGuard`
- [ ] Queue dashboard page shows all 20 queues as cards with live counts
- [ ] WebSocket `queue_metrics` events update counts every 10 seconds
- [ ] Queue detail page shows job list with status filter tabs
- [ ] Job detail panel shows payload JSON, error stack, attempt history
- [ ] Pause/resume toggle works from the UI
- [ ] Clean buttons show confirmation dialog before executing
- [ ] Retry button on failed jobs triggers retry and refreshes list
- [ ] All tests pass with mocked BullMQ Queue instances
- [ ] `turbo lint` and `turbo type-check` pass with zero errors
