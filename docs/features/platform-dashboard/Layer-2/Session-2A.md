# Session 2A -- Configurable Alert Rules Engine UI

**Depends on:** Layer 1C (alert framework with `platform_alert_rules`, `platform_alert_history`, evaluation cron, email dispatch, alert history UI)
**Blocked by:** Nothing within Layer 2
**Blocks:** Session 2B (multi-channel alerting needs the `condition_config` and per-rule channel assignment model)

---

## 1. Objective

Upgrade the basic alert rules from Layer 1C into a fully configurable rules engine with:

- Structured `condition_config` JSONB replacing simple threshold fields
- Severity levels (info, warning, critical) with visual indicators
- Cooldown periods to prevent alert storms
- Expanded metric types covering health, queues, errors, and disk
- A rich condition-builder UI for creating and editing rules
- Per-rule channel assignment (checkboxes of configured channels -- wiring prepared for 2B)

---

## 2. Database Changes

### 2.1 New Enum: `PlatformAlertSeverity`

```prisma
enum PlatformAlertSeverity {
  info
  warning
  critical
}
```

### 2.2 Extend `platform_alert_rules` Table

Add the following columns to the existing `platform_alert_rules` model (created in Layer 1C):

```prisma
model PlatformAlertRule {
  id               String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name             String                @db.VarChar(255)
  metric           String                @db.VarChar(100)
  condition_config Json                  @db.JsonB          // NEW -- structured condition
  severity         PlatformAlertSeverity @default(warning)  // NEW
  cooldown_minutes Int                   @default(15)       // NEW
  is_enabled       Boolean               @default(true)
  created_at       DateTime              @default(now()) @db.Timestamptz()
  updated_at       DateTime              @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  alert_history PlatformAlertHistory[]
  channels      PlatformAlertRuleChannel[]  // join table added in 2B

  @@map("platform_alert_rules")
}
```

### 2.3 `condition_config` JSONB Shape

```typescript
interface ConditionConfig {
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  duration_minutes?: number; // optional: sustained condition before firing
  queue?: string; // for queue-specific metrics (e.g., "notifications")
  component?: string; // for health-specific metrics (e.g., "postgresql")
  tenant_id?: string; // for tenant-specific rules (optional, UUID)
}
```

### 2.4 Supported Metrics

| Metric Key           | Description                                        | Relevant Config Fields                   |
| -------------------- | -------------------------------------------------- | ---------------------------------------- |
| `health_status`      | Health component status (0=up, 1=degraded, 2=down) | `component` required                     |
| `queue_depth`        | Total waiting + active jobs in a queue             | `queue` required                         |
| `queue_failure_rate` | Failed jobs / total completed in last 5 minutes    | `queue` required                         |
| `error_rate_5m`      | 5xx errors in last 5 minutes                       | `tenant_id` optional                     |
| `stuck_jobs`         | Active jobs exceeding 5-minute threshold           | `queue` optional (all queues if omitted) |
| `disk_usage_percent` | Disk usage percentage                              | None                                     |
| `api_latency_p95`    | 95th percentile API latency in ms (last 5 minutes) | None                                     |

### 2.5 Supported Operators

| Operator | Label                 | Description        |
| -------- | --------------------- | ------------------ |
| `gt`     | Greater than          | Value > threshold  |
| `lt`     | Less than             | Value < threshold  |
| `eq`     | Equal to              | Value == threshold |
| `gte`    | Greater than or equal | Value >= threshold |
| `lte`    | Less than or equal    | Value <= threshold |

### 2.6 Migration

```
packages/prisma/migrations/YYYYMMDDHHMMSS_extend_alert_rules_condition_config/migration.sql
```

```sql
-- Add severity enum
CREATE TYPE "PlatformAlertSeverity" AS ENUM ('info', 'warning', 'critical');

-- Add new columns to platform_alert_rules
ALTER TABLE "platform_alert_rules"
  ADD COLUMN "condition_config" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "severity" "PlatformAlertSeverity" NOT NULL DEFAULT 'warning',
  ADD COLUMN "cooldown_minutes" INTEGER NOT NULL DEFAULT 15;

-- Backfill condition_config from existing simple fields (if Layer 1C used flat columns)
-- UPDATE platform_alert_rules SET condition_config = jsonb_build_object(
--   'operator', 'gt',
--   'threshold', threshold
-- ) WHERE condition_config = '{}';

-- Drop old flat columns if they existed (threshold, operator etc.)
-- Only if Layer 1C used flat columns -- adjust based on actual 1C implementation
```

---

## 3. Backend Changes

### 3.1 Shared Schemas

**File:** `packages/shared/src/schemas/platform-admin.schema.ts`

```typescript
import { z } from 'zod';

// ─── Condition Config ─────────────────────────────────────────────────────────

const ALERT_OPERATORS = ['gt', 'lt', 'eq', 'gte', 'lte'] as const;

const ALERT_METRICS = [
  'health_status',
  'queue_depth',
  'queue_failure_rate',
  'error_rate_5m',
  'stuck_jobs',
  'disk_usage_percent',
  'api_latency_p95',
] as const;

const ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;

export const conditionConfigSchema = z.object({
  operator: z.enum(ALERT_OPERATORS),
  threshold: z.number(),
  duration_minutes: z.number().int().min(0).optional(),
  queue: z.string().optional(),
  component: z.string().optional(),
  tenant_id: z.string().uuid().optional(),
});

export type ConditionConfig = z.infer<typeof conditionConfigSchema>;

// ─── Alert Rule CRUD ──────────────────────────────────────────────────────────

export const createAlertRuleSchema = z
  .object({
    name: z.string().min(1).max(255),
    metric: z.enum(ALERT_METRICS),
    condition_config: conditionConfigSchema,
    severity: z.enum(ALERT_SEVERITIES).default('warning'),
    cooldown_minutes: z.number().int().min(1).max(1440).default(15),
    is_enabled: z.boolean().default(true),
    channel_ids: z.array(z.string().uuid()).optional(), // wiring for 2B
  })
  .refine(
    (data) => {
      // queue metrics require queue field
      if (['queue_depth', 'queue_failure_rate'].includes(data.metric)) {
        return !!data.condition_config.queue;
      }
      return true;
    },
    {
      message: 'Queue metrics require a queue name in condition_config',
      path: ['condition_config', 'queue'],
    },
  )
  .refine(
    (data) => {
      // health_status requires component field
      if (data.metric === 'health_status') {
        return !!data.condition_config.component;
      }
      return true;
    },
    {
      message: 'Health status metric requires a component in condition_config',
      path: ['condition_config', 'component'],
    },
  );

export type CreateAlertRuleDto = z.infer<typeof createAlertRuleSchema>;

export const updateAlertRuleSchema = createAlertRuleSchema.partial();

export type UpdateAlertRuleDto = z.infer<typeof updateAlertRuleSchema>;

export const toggleAlertRuleSchema = z.object({
  is_enabled: z.boolean(),
});

export type ToggleAlertRuleDto = z.infer<typeof toggleAlertRuleSchema>;

export { ALERT_OPERATORS, ALERT_METRICS, ALERT_SEVERITIES };
```

**File:** `packages/shared/src/index.ts` -- add exports for the new schemas.

### 3.2 DTO Re-exports

**File:** `apps/api/src/modules/platform-admin/dto/alert-rule.dto.ts`

```typescript
import type { CreateAlertRuleDto, UpdateAlertRuleDto, ToggleAlertRuleDto } from '@school/shared';

export type { CreateAlertRuleDto, UpdateAlertRuleDto, ToggleAlertRuleDto };
```

### 3.3 Alert Rules Controller

**File:** `apps/api/src/modules/platform-admin/alert-rules.controller.ts`

This extends/replaces the alert rules endpoints created in Layer 1C. If 1C placed them on the existing `TenantsController`, they move to a dedicated controller.

```typescript
@Controller('v1/admin/alerts/rules')
@UseGuards(AuthGuard, PlatformOwnerGuard)
export class AlertRulesController {
  constructor(private readonly alertRulesService: AlertRulesService) {}

  // GET /v1/admin/alerts/rules
  @Get()
  async listRules(
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ): Promise<{ data: PlatformAlertRule[]; meta: PaginationMeta }> { ... }

  // POST /v1/admin/alerts/rules
  @Post()
  async createRule(
    @Body(new ZodValidationPipe(createAlertRuleSchema)) dto: CreateAlertRuleDto,
  ): Promise<PlatformAlertRule> { ... }

  // PATCH /v1/admin/alerts/rules/:id
  @Patch(':id')
  async updateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAlertRuleSchema)) dto: UpdateAlertRuleDto,
  ): Promise<PlatformAlertRule> { ... }

  // DELETE /v1/admin/alerts/rules/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRule(@Param('id', ParseUUIDPipe) id: string): Promise<void> { ... }

  // PATCH /v1/admin/alerts/rules/:id/toggle
  @Patch(':id/toggle')
  async toggleRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(toggleAlertRuleSchema)) dto: ToggleAlertRuleDto,
  ): Promise<PlatformAlertRule> { ... }
}
```

### 3.4 Alert Rules Service

**File:** `apps/api/src/modules/platform-admin/alert-rules.service.ts`

```typescript
@Injectable()
export class AlertRulesService {
  constructor(private readonly prisma: PrismaService) {}

  async listRules(pagination: PaginationParams): Promise<PaginatedResult<PlatformAlertRule>> { ... }

  async createRule(dto: CreateAlertRuleDto): Promise<PlatformAlertRule> {
    // Validate condition_config against metric requirements
    // Create rule with condition_config JSONB
    // Optionally link channel_ids via join table (no-op if 2B not yet deployed)
  }

  async updateRule(id: string, dto: UpdateAlertRuleDto): Promise<PlatformAlertRule> {
    // Verify rule exists
    // Validate updated condition_config if provided
    // Update rule
  }

  async deleteRule(id: string): Promise<void> {
    // Verify rule exists
    // Delete (cascades to rule_channels join table)
  }

  async toggleRule(id: string, isEnabled: boolean): Promise<PlatformAlertRule> {
    // Verify rule exists
    // Update is_enabled
  }
}
```

### 3.5 Update Alert Evaluation Service

**File:** `apps/api/src/modules/platform-admin/alert-evaluation.service.ts` (created in 1C -- modified)

The evaluation loop (cron every 30s from Layer 1C) must be updated to:

1. Read `condition_config` instead of flat fields
2. Respect `cooldown_minutes` (check last fire time from `platform_alert_history`)
3. Include `severity` in fired alerts
4. Use the structured operator/threshold from `condition_config`

Key method signatures:

```typescript
private evaluateCondition(rule: PlatformAlertRule, currentValue: number): boolean {
  const config = rule.condition_config as ConditionConfig;
  switch (config.operator) {
    case 'gt':  return currentValue > config.threshold;
    case 'lt':  return currentValue < config.threshold;
    case 'eq':  return currentValue === config.threshold;
    case 'gte': return currentValue >= config.threshold;
    case 'lte': return currentValue <= config.threshold;
  }
}

private async isCooldownActive(ruleId: string, cooldownMinutes: number): Promise<boolean> {
  const lastFired = await this.prisma.platformAlertHistory.findFirst({
    where: { rule_id: ruleId },
    orderBy: { fired_at: 'desc' },
  });
  if (!lastFired) return false;
  const cooldownEnd = new Date(lastFired.fired_at.getTime() + cooldownMinutes * 60 * 1000);
  return new Date() < cooldownEnd;
}
```

---

## 4. Frontend Changes

### 4.1 Alert Rules Page

**File:** `apps/web/src/app/[locale]/(platform)/admin/alerts/rules/page.tsx`

This is a new page (or extends the existing alert rules list from 1C). It contains:

1. **PageHeader** -- "Alert Rules" with "Create Rule" button
2. **DataTable** listing all rules with columns:
   - Name (string)
   - Metric (badge with icon)
   - Condition (human-readable: "queue_depth > 100 on notifications")
   - Severity (colored badge: info=blue, warning=amber, critical=red)
   - Cooldown (e.g., "15 min")
   - Status (enabled/disabled toggle)
   - Actions (edit, delete)
3. **Filters** -- metric type dropdown, severity dropdown, enabled/disabled

### 4.2 Create/Edit Rule Dialog

**File:** `apps/web/src/app/[locale]/(platform)/admin/alerts/rules/_components/rule-form-dialog.tsx`

A dialog (sheet or modal) with the following form fields:

```
Rule Name        [_____________________________]

Metric           [v health_status          ]
                    queue_depth
                    queue_failure_rate
                    error_rate_5m
                    stuck_jobs
                    disk_usage_percent
                    api_latency_p95

-- Conditional fields (shown/hidden based on metric) --

Queue            [v notifications          ]    // shown for queue_depth, queue_failure_rate
                    admissions
                    approvals
                    attendance
                    ...all 20 queues from queue.constants.ts

Component        [v postgresql             ]    // shown for health_status
                    redis
                    meilisearch
                    bullmq
                    disk

Operator         [v Greater than           ]
                    Less than
                    Equal to
                    Greater than or equal
                    Less than or equal

Threshold        [_____] (number input)

Duration         [_____] minutes (optional -- sustained condition)

Severity         (o) Info  (o) Warning  (o) Critical

Cooldown         [_____] minutes (default: 15)

Channels         [ ] Email                       // checkboxes of configured channels
                 [ ] Telegram                     // populated from GET /v1/admin/alerts/channels
                 [ ] WhatsApp                     // greyed out if no channels configured yet
                 [ ] Browser Push

[Cancel]  [Save Rule]
```

The form uses `react-hook-form` with `zodResolver(createAlertRuleSchema)`.

Queue names are imported from a constant or fetched from the queues endpoint. Health components are hardcoded: `['postgresql', 'redis', 'meilisearch', 'bullmq', 'disk']`.

### 4.3 Condition Display Helper

**File:** `apps/web/src/app/[locale]/(platform)/admin/alerts/rules/_components/condition-display.tsx`

A helper component that renders a human-readable condition string from `condition_config`:

```
"Queue depth > 100 on 'notifications'"
"Health status = down for 'postgresql'"
"Disk usage >= 90%"
"Error rate > 10 in 5m for tenant 'School A'"
```

### 4.4 Severity Badge

**File:** `apps/web/src/app/[locale]/(platform)/admin/alerts/rules/_components/severity-badge.tsx`

A small badge component that color-codes severity:

- `info` -- blue/slate background
- `warning` -- amber background
- `critical` -- red background

---

## 5. Files to Create

| #   | File Path                                                                                     | Purpose                                       |
| --- | --------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | `packages/shared/src/schemas/platform-admin.schema.ts`                                        | Zod schemas for alert rules, condition config |
| 2   | `apps/api/src/modules/platform-admin/dto/alert-rule.dto.ts`                                   | DTO re-exports                                |
| 3   | `apps/api/src/modules/platform-admin/alert-rules.controller.ts`                               | Alert rules CRUD controller                   |
| 4   | `apps/api/src/modules/platform-admin/alert-rules.controller.spec.ts`                          | Controller unit tests                         |
| 5   | `apps/api/src/modules/platform-admin/alert-rules.service.ts`                                  | Alert rules business logic                    |
| 6   | `apps/api/src/modules/platform-admin/alert-rules.service.spec.ts`                             | Service unit tests                            |
| 7   | `packages/prisma/migrations/YYYYMMDDHHMMSS_extend_alert_rules_condition_config/migration.sql` | DB migration                                  |
| 8   | `apps/web/src/app/[locale]/(platform)/admin/alerts/rules/page.tsx`                            | Rules list page                               |
| 9   | `apps/web/src/app/[locale]/(platform)/admin/alerts/rules/_components/rule-form-dialog.tsx`    | Create/edit dialog                            |
| 10  | `apps/web/src/app/[locale]/(platform)/admin/alerts/rules/_components/condition-display.tsx`   | Human-readable condition                      |
| 11  | `apps/web/src/app/[locale]/(platform)/admin/alerts/rules/_components/severity-badge.tsx`      | Severity color badge                          |

## 6. Files to Modify

| #   | File Path                                                         | Change                                                                                                   |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | `packages/prisma/schema.prisma`                                   | Add `PlatformAlertSeverity` enum, extend `PlatformAlertRule` model                                       |
| 2   | `packages/shared/src/index.ts`                                    | Export new schemas and types                                                                             |
| 3   | `apps/api/src/modules/platform-admin/platform-admin.module.ts`    | Register `AlertRulesController`, `AlertRulesService` (or create module if it does not exist yet from 1C) |
| 4   | `apps/api/src/modules/platform-admin/alert-evaluation.service.ts` | Update evaluation loop to use `condition_config`, `severity`, `cooldown_minutes`                         |
| 5   | `apps/api/src/app.module.ts`                                      | Import `PlatformAdminModule` if not already imported from 1C                                             |
| 6   | `apps/web/src/app/[locale]/(platform)/layout.tsx`                 | Add "Alerts & Rules" nav item to sidebar                                                                 |

---

## 7. Testing Strategy

### Unit Tests -- `alert-rules.service.spec.ts`

```typescript
describe('AlertRulesService', () => {
  describe('createRule', () => {
    it('should create a rule with valid condition_config');
    it('should reject queue metric without queue in condition_config');
    it('should reject health_status metric without component');
    it('should set default severity to warning');
    it('should set default cooldown_minutes to 15');
  });

  describe('updateRule', () => {
    it('should update condition_config partially');
    it('should throw NotFoundException for non-existent rule');
  });

  describe('deleteRule', () => {
    it('should delete rule and cascade to join table');
    it('should throw NotFoundException for non-existent rule');
  });

  describe('toggleRule', () => {
    it('should toggle is_enabled to true');
    it('should toggle is_enabled to false');
  });
});
```

### Unit Tests -- `alert-rules.controller.spec.ts`

```typescript
describe('AlertRulesController', () => {
  it('should return 401 without auth token');
  it('should return 403 for non-platform-owner');
  it('should list rules with pagination');
  it('should create rule with valid body');
  it('should return 400 for invalid condition_config');
});
```

### Evaluation Service Tests -- `alert-evaluation.service.spec.ts` (extend existing)

```typescript
describe('AlertEvaluationService — evaluateCondition', () => {
  it('should fire when value > threshold (gt operator)');
  it('should not fire when value <= threshold (gt operator)');
  it('should fire when value < threshold (lt operator)');
  it('should respect cooldown period');
  it('should fire after cooldown expires');
  it('should include severity in fired alert');
});
```

---

## 8. Acceptance Criteria

- [ ] `platform_alert_rules` table has `condition_config`, `severity`, `cooldown_minutes` columns
- [ ] Creating a rule with `metric: 'queue_depth'` without `condition_config.queue` returns 400
- [ ] Creating a rule with `metric: 'health_status'` without `condition_config.component` returns 400
- [ ] All CRUD operations work: create, list, update, delete, toggle
- [ ] Evaluation loop reads `condition_config` and applies operator/threshold correctly
- [ ] Cooldown is respected -- rule does not re-fire within cooldown window
- [ ] Frontend rules page lists all rules with severity badges and human-readable conditions
- [ ] Create/edit dialog shows conditional fields (queue dropdown for queue metrics, component dropdown for health metrics)
- [ ] Form validation matches Zod schema -- frontend prevents invalid submissions
- [ ] Channel assignment checkboxes are visible (greyed out if no channels configured yet -- full functionality in 2B)
- [ ] All tests pass: `turbo test --filter=api`
- [ ] `turbo lint` and `turbo type-check` pass with zero errors
