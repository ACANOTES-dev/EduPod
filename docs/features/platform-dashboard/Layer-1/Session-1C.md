# Session 1C: Alert Framework

**Depends on:** Session 1B (health state change events, health snapshot data)
**Unlocks:** Layer 2 Sessions 2A/2B (multi-channel alerting, rules engine UI)

---

## Objective

Build a configurable alert framework that detects when platform metrics breach thresholds and notifies the platform owner. This session delivers:

1. Database tables for alert rules and alert history
2. A CRUD API for managing alert rules
3. An alert evaluation cron that runs every 30 seconds, matching current metrics against rules
4. Email dispatch via the existing Resend provider when alerts fire
5. An alert history API with acknowledge/resolve workflow
6. A frontend alerts page with two tabs: History and Rules
7. Real-time new-alert indicator in the platform layout sidebar via WebSocket

After this session, the platform owner can define rules like "alert me when PostgreSQL latency exceeds 500ms for 2 minutes" and receive email notifications when they fire.

---

## Database

### New Enums

```prisma
enum AlertSeverity {
  info
  warning
  critical

  @@map("alert_severity")
}

enum AlertStatus {
  fired
  acknowledged
  resolved

  @@map("alert_status")
}
```

### New Table: `platform_alert_rules`

Platform-level -- no `tenant_id`, no RLS.

```prisma
model PlatformAlertRule {
  id               String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name             String        @db.VarChar(255)
  metric           String        @db.VarChar(100)  // e.g. 'health_status', 'component_latency', 'queue_depth'
  condition_config Json          @db.JsonB
  severity         AlertSeverity
  cooldown_minutes Int           @default(15)
  is_enabled       Boolean       @default(true)
  notify_emails    String[]      @default([])      // Email recipients for this rule
  created_at       DateTime      @default(now()) @db.Timestamptz()
  updated_at       DateTime      @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  alerts PlatformAlertHistory[]

  @@map("platform_alert_rules")
}
```

**`condition_config` JSONB structure:**

```typescript
interface AlertConditionConfig {
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'neq';
  threshold: number;
  duration_minutes?: number; // Sustained condition (optional)
  component?: string; // For health-specific rules: 'postgresql', 'redis', etc.
  queue?: string; // For queue-specific rules (Layer 2)
}
```

**Supported `metric` values for Layer 1:**

| Metric              | Description                                                | How It Is Collected                                                   |
| ------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| `health_status`     | Overall health status (0=healthy, 1=degraded, 2=unhealthy) | From latest health snapshot                                           |
| `component_latency` | Latency in ms for a specific component                     | From latest health snapshot, filtered by `condition_config.component` |
| `component_status`  | Status of a specific component (0=up, 1=down)              | From latest health snapshot, filtered by `condition_config.component` |
| `disk_free_gb`      | Free disk space in GB                                      | From latest health snapshot                                           |
| `bullmq_stuck_jobs` | Number of stuck BullMQ jobs                                | From latest health snapshot                                           |

### New Table: `platform_alert_history`

Platform-level -- no `tenant_id`, no RLS.

```prisma
model PlatformAlertHistory {
  id                 String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  rule_id            String        @db.Uuid
  severity           AlertSeverity
  message            String        @db.Text
  metric_value       Decimal       @db.Decimal(12, 2)
  channels_notified  String[]      @default([])
  status             AlertStatus   @default(fired)
  fired_at           DateTime      @default(now()) @db.Timestamptz()
  acknowledged_at    DateTime?     @db.Timestamptz()
  resolved_at        DateTime?     @db.Timestamptz()
  acknowledged_by    String?       @db.Uuid

  // Relations
  rule               PlatformAlertRule @relation(fields: [rule_id], references: [id], onDelete: Cascade)
  acknowledger       User?             @relation("alert_acknowledger", fields: [acknowledged_by], references: [id])

  @@map("platform_alert_history")
  @@index([fired_at(sort: Desc)])
  @@index([status])
  @@index([rule_id])
}
```

### Migration SQL

```sql
-- Enums
CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE alert_status AS ENUM ('fired', 'acknowledged', 'resolved');

-- Alert rules
CREATE TABLE platform_alert_rules (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(255)  NOT NULL,
  metric           VARCHAR(100)  NOT NULL,
  condition_config JSONB         NOT NULL,
  severity         alert_severity NOT NULL,
  cooldown_minutes INTEGER       NOT NULL DEFAULT 15,
  is_enabled       BOOLEAN       NOT NULL DEFAULT true,
  notify_emails    TEXT[]        NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Alert history
CREATE TABLE platform_alert_history (
  id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id           UUID            NOT NULL REFERENCES platform_alert_rules(id) ON DELETE CASCADE,
  severity          alert_severity  NOT NULL,
  message           TEXT            NOT NULL,
  metric_value      NUMERIC(12,2)   NOT NULL,
  channels_notified TEXT[]          NOT NULL DEFAULT '{}',
  status            alert_status    NOT NULL DEFAULT 'fired',
  fired_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  acknowledged_at   TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  acknowledged_by   UUID            REFERENCES users(id)
);

CREATE INDEX idx_platform_alert_history_fired_at ON platform_alert_history (fired_at DESC);
CREATE INDEX idx_platform_alert_history_status ON platform_alert_history (status);
CREATE INDEX idx_platform_alert_history_rule_id ON platform_alert_history (rule_id);
```

---

## Backend Changes

### 1. Zod Schemas

#### `packages/shared/src/schemas/platform.ts` -- Additions

```typescript
// ─── Alert Condition Config ───────────────────────────────────────────────────

export const alertConditionConfigSchema = z.object({
  operator: z.enum(['gt', 'lt', 'eq', 'gte', 'lte', 'neq']),
  threshold: z.number(),
  duration_minutes: z.number().int().min(1).max(60).optional(),
  component: z.enum(['postgresql', 'redis', 'meilisearch', 'bullmq', 'disk']).optional(),
  queue: z.string().optional(),
});

export type AlertConditionConfig = z.infer<typeof alertConditionConfigSchema>;

// ─── Create Alert Rule ───────────────────────────────────────────────────────

export const createAlertRuleSchema = z.object({
  name: z.string().min(1).max(255),
  metric: z.enum([
    'health_status',
    'component_latency',
    'component_status',
    'disk_free_gb',
    'bullmq_stuck_jobs',
  ]),
  condition_config: alertConditionConfigSchema,
  severity: z.enum(['info', 'warning', 'critical']),
  cooldown_minutes: z.number().int().min(1).max(1440).default(15),
  is_enabled: z.boolean().default(true),
  notify_emails: z.array(z.string().email()).default([]),
});

export type CreateAlertRuleDto = z.infer<typeof createAlertRuleSchema>;

// ─── Update Alert Rule ───────────────────────────────────────────────────────

export const updateAlertRuleSchema = createAlertRuleSchema.partial();

export type UpdateAlertRuleDto = z.infer<typeof updateAlertRuleSchema>;

// ─── Alert History Query ──────────────────────────────────────────────────────

export const alertHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['fired', 'acknowledged', 'resolved']).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  rule_id: z.string().uuid().optional(),
});

export type AlertHistoryQuery = z.infer<typeof alertHistoryQuerySchema>;
```

### 2. Alert Rules Controller

#### `apps/api/src/modules/platform/alert-rules.controller.ts`

```typescript
@Controller('v1/admin/alerts/rules')
@UseGuards(AuthGuard, PlatformOwnerGuard)
export class AlertRulesController {
  constructor(private readonly alertRulesService: AlertRulesService) {}

  // GET /v1/admin/alerts/rules
  @Get()
  async list(): Promise<PlatformAlertRule[]>

  // POST /v1/admin/alerts/rules
  @Post()
  async create(
    @Body(new ZodValidationPipe(createAlertRuleSchema)) dto: CreateAlertRuleDto,
  ): Promise<PlatformAlertRule>

  // PATCH /v1/admin/alerts/rules/:id
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAlertRuleSchema)) dto: UpdateAlertRuleDto,
  ): Promise<PlatformAlertRule>

  // DELETE /v1/admin/alerts/rules/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void>
}
```

### 3. Alert Rules Service

#### `apps/api/src/modules/platform/alert-rules.service.ts`

**Class:** `AlertRulesService`

**Constructor DI:**

```typescript
private readonly prisma: PrismaService
```

**Methods:**

```typescript
async list(): Promise<PlatformAlertRule[]> {
  return this.prisma.platformAlertRule.findMany({
    orderBy: { created_at: 'desc' },
  });
}

async create(dto: CreateAlertRuleDto): Promise<PlatformAlertRule> {
  return this.prisma.platformAlertRule.create({
    data: {
      name: dto.name,
      metric: dto.metric,
      condition_config: dto.condition_config as object,
      severity: dto.severity,
      cooldown_minutes: dto.cooldown_minutes,
      is_enabled: dto.is_enabled,
      notify_emails: dto.notify_emails,
    },
  });
}

async update(id: string, dto: UpdateAlertRuleDto): Promise<PlatformAlertRule> {
  const existing = await this.prisma.platformAlertRule.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundException({
      code: 'ALERT_RULE_NOT_FOUND',
      message: `Alert rule with id "${id}" not found`,
    });
  }

  return this.prisma.platformAlertRule.update({
    where: { id },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.metric !== undefined && { metric: dto.metric }),
      ...(dto.condition_config !== undefined && { condition_config: dto.condition_config as object }),
      ...(dto.severity !== undefined && { severity: dto.severity }),
      ...(dto.cooldown_minutes !== undefined && { cooldown_minutes: dto.cooldown_minutes }),
      ...(dto.is_enabled !== undefined && { is_enabled: dto.is_enabled }),
      ...(dto.notify_emails !== undefined && { notify_emails: dto.notify_emails }),
    },
  });
}

async remove(id: string): Promise<void> {
  const existing = await this.prisma.platformAlertRule.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundException({
      code: 'ALERT_RULE_NOT_FOUND',
      message: `Alert rule with id "${id}" not found`,
    });
  }
  await this.prisma.platformAlertRule.delete({ where: { id } });
}
```

### 4. Alert Evaluation Service

#### `apps/api/src/modules/platform/alert-evaluation.service.ts`

**Class:** `AlertEvaluationService implements OnModuleInit, OnModuleDestroy`

This is the core of the alert framework. It runs every 30 seconds, collects current metric values, and evaluates each enabled rule.

**Constructor DI:**

```typescript
private readonly prisma: PrismaService
private readonly healthService: HealthService
private readonly redisPubSub: RedisPubSubService
private readonly alertDispatchService: AlertDispatchService
```

**Private fields:**

```typescript
private readonly logger = new Logger(AlertEvaluationService.name);
private intervalHandle: ReturnType<typeof setInterval> | null = null;
// Track sustained conditions: Map<ruleId, firstTriggeredAt>
private sustainedConditions = new Map<string, Date>();
```

**Methods:**

```typescript
onModuleInit(): void {
  this.intervalHandle = setInterval(() => {
    void this.evaluate();
  }, 30_000);
  this.logger.log('Alert evaluation interval started (every 30s)');
}

onModuleDestroy(): void {
  if (this.intervalHandle) clearInterval(this.intervalHandle);
}

async evaluate(): Promise<void> {
  try {
    const rules = await this.prisma.platformAlertRule.findMany({
      where: { is_enabled: true },
    });

    if (rules.length === 0) return;

    // Collect current metrics
    const healthResult = await this.healthService.check();
    const metrics = this.extractMetrics(healthResult);

    for (const rule of rules) {
      await this.evaluateRule(rule, metrics);
    }
  } catch (err: unknown) {
    this.logger.error('[evaluate] Alert evaluation failed', err);
  }
}

private extractMetrics(health: FullHealthResult): Map<string, number> {
  const m = new Map<string, number>();

  // Overall health status
  const statusMap = { healthy: 0, degraded: 1, unhealthy: 2 };
  m.set('health_status', statusMap[health.status]);

  // Per-component latency
  const checks = health.checks;
  m.set('component_latency:postgresql', checks.postgresql.latency_ms);
  m.set('component_latency:redis', checks.redis.latency_ms);
  m.set('component_latency:meilisearch', checks.meilisearch.latency_ms);

  // Per-component status (0 = up, 1 = down)
  m.set('component_status:postgresql', checks.postgresql.status === 'down' ? 1 : 0);
  m.set('component_status:redis', checks.redis.status === 'down' ? 1 : 0);
  m.set('component_status:meilisearch', checks.meilisearch.status === 'down' ? 1 : 0);
  m.set('component_status:bullmq', checks.bullmq.status === 'down' ? 1 : 0);
  m.set('component_status:disk', checks.disk.status === 'down' ? 1 : 0);

  // BullMQ stuck jobs
  m.set('bullmq_stuck_jobs', checks.bullmq.stuck_jobs);

  // Disk free
  m.set('disk_free_gb', checks.disk.free_gb);

  return m;
}

private async evaluateRule(
  rule: PlatformAlertRule,
  metrics: Map<string, number>,
): Promise<void> {
  const config = rule.condition_config as AlertConditionConfig;
  const metricKey = this.resolveMetricKey(rule.metric, config);
  const currentValue = metrics.get(metricKey);

  if (currentValue === undefined) return; // Metric not available

  const conditionMet = this.checkCondition(currentValue, config.operator, config.threshold);

  if (conditionMet) {
    // Handle duration_minutes (sustained condition)
    if (config.duration_minutes) {
      const firstTriggered = this.sustainedConditions.get(rule.id);
      if (!firstTriggered) {
        this.sustainedConditions.set(rule.id, new Date());
        return; // Not sustained long enough yet
      }
      const elapsed = (Date.now() - firstTriggered.getTime()) / 60_000;
      if (elapsed < config.duration_minutes) {
        return; // Not sustained long enough
      }
    }

    // Check cooldown
    const lastAlert = await this.prisma.platformAlertHistory.findFirst({
      where: { rule_id: rule.id },
      orderBy: { fired_at: 'desc' },
    });
    if (lastAlert) {
      const minutesSinceLast = (Date.now() - lastAlert.fired_at.getTime()) / 60_000;
      if (minutesSinceLast < rule.cooldown_minutes) {
        return; // Still in cooldown
      }
    }

    // Fire the alert
    await this.fireAlert(rule, currentValue);
    this.sustainedConditions.delete(rule.id);
  } else {
    // Condition no longer met -- clear sustained tracking
    this.sustainedConditions.delete(rule.id);

    // Auto-resolve: if there's a fired alert for this rule, resolve it
    await this.autoResolve(rule.id);
  }
}

private resolveMetricKey(metric: string, config: AlertConditionConfig): string {
  if (config.component && (metric === 'component_latency' || metric === 'component_status')) {
    return `${metric}:${config.component}`;
  }
  return metric;
}

private checkCondition(value: number, operator: string, threshold: number): boolean {
  switch (operator) {
    case 'gt': return value > threshold;
    case 'lt': return value < threshold;
    case 'eq': return value === threshold;
    case 'gte': return value >= threshold;
    case 'lte': return value <= threshold;
    case 'neq': return value !== threshold;
    default: return false;
  }
}

private async fireAlert(rule: PlatformAlertRule, metricValue: number): Promise<void> {
  const message = `[${rule.severity.toUpperCase()}] ${rule.name}: metric value ${metricValue} ${(rule.condition_config as AlertConditionConfig).operator} ${(rule.condition_config as AlertConditionConfig).threshold}`;

  const alert = await this.prisma.platformAlertHistory.create({
    data: {
      rule_id: rule.id,
      severity: rule.severity,
      message,
      metric_value: metricValue,
      channels_notified: rule.notify_emails.length > 0 ? ['email'] : [],
      status: 'fired',
    },
  });

  // Dispatch email notifications
  if (rule.notify_emails.length > 0) {
    await this.alertDispatchService.sendEmail(rule, alert, metricValue);
  }

  // Publish to WebSocket via Redis
  await this.redisPubSub.publish('platform:alerts', {
    type: 'alert_fired',
    alert_id: alert.id,
    rule_id: rule.id,
    rule_name: rule.name,
    severity: rule.severity,
    message,
    metric_value: metricValue,
    fired_at: alert.fired_at.toISOString(),
  });

  this.logger.warn(`Alert fired: ${message}`);
}

private async autoResolve(ruleId: string): Promise<void> {
  const openAlert = await this.prisma.platformAlertHistory.findFirst({
    where: {
      rule_id: ruleId,
      status: { in: ['fired', 'acknowledged'] },
    },
    orderBy: { fired_at: 'desc' },
  });

  if (openAlert) {
    await this.prisma.platformAlertHistory.update({
      where: { id: openAlert.id },
      data: { status: 'resolved', resolved_at: new Date() },
    });

    await this.redisPubSub.publish('platform:alerts', {
      type: 'alert_resolved',
      alert_id: openAlert.id,
      rule_id: ruleId,
      resolved_at: new Date().toISOString(),
    });
  }
}
```

### 5. Alert Dispatch Service

#### `apps/api/src/modules/platform/alert-dispatch.service.ts`

**Class:** `AlertDispatchService`

**Constructor DI:**

```typescript
private readonly resendEmail: ResendEmailProvider
```

**Methods:**

```typescript
async sendEmail(
  rule: PlatformAlertRule,
  alert: PlatformAlertHistory,
  metricValue: number,
): Promise<void> {
  const severityColors = { info: '#3B82F6', warning: '#F59E0B', critical: '#EF4444' };
  const color = severityColors[rule.severity];

  const html = `
    <div style="font-family: sans-serif; max-width: 600px;">
      <div style="background: ${color}; color: white; padding: 16px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0;">${rule.severity.toUpperCase()} Alert</h2>
      </div>
      <div style="border: 1px solid #E5E7EB; border-top: none; padding: 16px; border-radius: 0 0 8px 8px;">
        <p><strong>Rule:</strong> ${rule.name}</p>
        <p><strong>Metric:</strong> ${rule.metric}</p>
        <p><strong>Current Value:</strong> ${metricValue}</p>
        <p><strong>Threshold:</strong> ${(rule.condition_config as AlertConditionConfig).operator} ${(rule.condition_config as AlertConditionConfig).threshold}</p>
        <p><strong>Fired at:</strong> ${alert.fired_at.toISOString()}</p>
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 16px 0;" />
        <p style="color: #6B7280; font-size: 12px;">This is an automated alert from the EduPod Platform.</p>
      </div>
    </div>
  `;

  for (const email of rule.notify_emails) {
    try {
      await this.resendEmail.send({
        to: email,
        subject: `[EduPod ${rule.severity.toUpperCase()}] ${rule.name}`,
        html,
      });
    } catch (err: unknown) {
      this.logger.error(`[sendEmail] Failed to send alert email to ${email}`, err);
    }
  }
}
```

### 6. Alert History Controller

#### `apps/api/src/modules/platform/alert-history.controller.ts`

```typescript
@Controller('v1/admin/alerts/history')
@UseGuards(AuthGuard, PlatformOwnerGuard)
export class AlertHistoryController {
  constructor(private readonly alertHistoryService: AlertHistoryService) {}

  // GET /v1/admin/alerts/history
  @Get()
  async list(
    @Query(new ZodValidationPipe(alertHistoryQuerySchema)) query: AlertHistoryQuery,
  ): Promise<{ data: PlatformAlertHistory[]; meta: { page: number; pageSize: number; total: number } }>

  // PATCH /v1/admin/alerts/history/:id/acknowledge
  @Patch(':id/acknowledge')
  async acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PlatformAlertHistory>
}
```

### 7. Alert History Service

#### `apps/api/src/modules/platform/alert-history.service.ts`

```typescript
async list(query: AlertHistoryQuery): Promise<{
  data: PlatformAlertHistory[];
  meta: { page: number; pageSize: number; total: number };
}> {
  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;
  if (query.severity) where.severity = query.severity;
  if (query.rule_id) where.rule_id = query.rule_id;

  const skip = (query.page - 1) * query.pageSize;

  const [data, total] = await Promise.all([
    this.prisma.platformAlertHistory.findMany({
      where,
      orderBy: { fired_at: 'desc' },
      skip,
      take: query.pageSize,
      include: { rule: { select: { name: true } } },
    }),
    this.prisma.platformAlertHistory.count({ where }),
  ]);

  return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
}

async acknowledge(id: string, userId: string): Promise<PlatformAlertHistory> {
  const alert = await this.prisma.platformAlertHistory.findUnique({ where: { id } });
  if (!alert) {
    throw new NotFoundException({ code: 'ALERT_NOT_FOUND', message: `Alert "${id}" not found` });
  }
  if (alert.status !== 'fired') {
    throw new BadRequestException({ code: 'ALERT_NOT_FIREABLE', message: 'Only fired alerts can be acknowledged' });
  }

  return this.prisma.platformAlertHistory.update({
    where: { id },
    data: {
      status: 'acknowledged',
      acknowledged_at: new Date(),
      acknowledged_by: userId,
    },
  });
}
```

### 8. Update Platform Module

#### `apps/api/src/modules/platform/platform.module.ts` -- Updated

```typescript
@Module({
  imports: [AuthModule, HealthModule, CommunicationsModule],
  controllers: [HealthHistoryController, AlertRulesController, AlertHistoryController],
  providers: [
    RedisPubSubService,
    PlatformGateway,
    HealthSnapshotService,
    AlertRulesService,
    AlertHistoryService,
    AlertEvaluationService,
    AlertDispatchService,
  ],
  exports: [RedisPubSubService],
})
export class PlatformModule {}
```

**Note:** Imports `CommunicationsModule` to access the `ResendEmailProvider`. This module must export `ResendEmailProvider`. If it does not currently, add `exports: [ResendEmailProvider]` to `CommunicationsModule`.

### 9. Modify CommunicationsModule

#### `apps/api/src/modules/communications/communications.module.ts` -- Modification

Ensure `ResendEmailProvider` is exported:

```typescript
exports: [ResendEmailProvider /* ...existing exports */];
```

---

## Frontend Changes

### 1. New Page: Alerts

#### `apps/web/src/app/[locale]/(platform)/admin/alerts/page.tsx`

**Component:** `AlertsPage` (client component)

**Layout:**

```
+-----------------------------------------------------+
| Alerts                                   [Tab: History | Rules] |
+-----------------------------------------------------+
| (History tab - default)                              |
| +-----------------------------------------------+   |
| | Alert History Table                            |   |
| | Severity | Rule Name | Message | Fired | Status | Ack |
| | [critical] PostgreSQL latency ... 2m ago fired [Ack] |
| | [warning]  Disk free < 5GB ... 10m ago acknowledged   |
| +-----------------------------------------------+   |
|                                                      |
| (Rules tab)                                          |
| +-----------------------------------------------+   |
| | Rule List with toggle switches                |   |
| | [+] Add Rule button                           |   |
| | Rule: PostgreSQL Latency > 500ms  [ON/OFF]  [Edit] [Delete] |
| | Rule: Disk Free < 5GB             [ON/OFF]  [Edit] [Delete] |
| +-----------------------------------------------+   |
+-----------------------------------------------------+
```

**State:**

```typescript
interface AlertsPageState {
  activeTab: 'history' | 'rules';
  // History tab
  alerts: PlatformAlertHistory[];
  alertsPage: number;
  alertsTotal: number;
  alertsLoading: boolean;
  // Rules tab
  rules: PlatformAlertRule[];
  rulesLoading: boolean;
  // Form
  showRuleForm: boolean;
  editingRule: PlatformAlertRule | null;
}
```

### 2. Components

#### `apps/web/src/app/[locale]/(platform)/admin/alerts/_components/alert-history-table.tsx`

**Props:**

```typescript
interface AlertHistoryTableProps {
  alerts: PlatformAlertHistory[];
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onAcknowledge: (id: string) => void;
}
```

**Columns:**

1. **Severity** -- colour-coded badge (info=blue, warning=amber, critical=red)
2. **Rule Name** -- from the included `rule.name`
3. **Message** -- truncated with tooltip on hover
4. **Fired** -- relative time ("2 min ago")
5. **Status** -- badge (fired=red, acknowledged=amber, resolved=green)
6. **Actions** -- Acknowledge button (only for `fired` status)

Uses the existing `<DataTable>` component from `@/components/data-table`.

#### `apps/web/src/app/[locale]/(platform)/admin/alerts/_components/alert-rule-list.tsx`

**Props:**

```typescript
interface AlertRuleListProps {
  rules: PlatformAlertRule[];
  loading: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (rule: PlatformAlertRule) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}
```

**Layout:** List of rule cards, each showing:

- Rule name
- Metric and condition summary (e.g., "PostgreSQL latency > 500ms")
- Severity badge
- Enable/disable toggle switch
- Edit and Delete buttons

#### `apps/web/src/app/[locale]/(platform)/admin/alerts/_components/alert-rule-form.tsx`

**Props:**

```typescript
interface AlertRuleFormProps {
  initialData?: PlatformAlertRule | null; // null = create mode
  onSubmit: (data: CreateAlertRuleDto) => void;
  onCancel: () => void;
  loading: boolean;
}
```

**Form fields (using react-hook-form + zodResolver):**

1. **Name** -- text input
2. **Metric** -- select dropdown (health_status, component_latency, component_status, disk_free_gb, bullmq_stuck_jobs)
3. **Component** -- select dropdown (shown only when metric is component_latency or component_status)
4. **Operator** -- select dropdown (gt, lt, eq, gte, lte, neq)
5. **Threshold** -- number input
6. **Duration (minutes)** -- optional number input
7. **Severity** -- radio group (info, warning, critical)
8. **Cooldown (minutes)** -- number input (default 15)
9. **Email recipients** -- tag-style multi-input for email addresses
10. **Enabled** -- checkbox

#### `apps/web/src/app/[locale]/(platform)/admin/alerts/_components/alert-severity-badge.tsx`

Small reusable badge component:

```typescript
interface AlertSeverityBadgeProps {
  severity: 'info' | 'warning' | 'critical';
}
```

Colours: info = blue, warning = amber, critical = red.

### 3. Real-Time Alert Indicator in Layout

#### `apps/web/src/app/[locale]/(platform)/layout.tsx` -- Modification

Add real-time unacknowledged alert count to the sidebar "Alerts" nav item.

**Changes:**

1. Add `Alerts` to the `navItems` array with icon `Bell` and href `/${locale}/admin/alerts`
2. Subscribe to `alert:new` via `usePlatformSocket()`
3. On `alert:new` with `type === 'alert_fired'`, increment a local `unacknowledgedCount` state
4. Show the count as a badge on the Alerts nav item (same pattern as the existing security incidents badge)

**New nav item:**

```typescript
{ icon: Bell, label: 'Alerts', href: `/${locale}/admin/alerts`, badge: unacknowledgedAlertCount }
```

---

## Testing Strategy

### Backend Unit Tests

| Test File                          | Tests                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `alert-rules.service.spec.ts`      | CRUD operations: create, list, update, remove; NotFoundException on invalid ID                                                              |
| `alert-evaluation.service.spec.ts` | Condition checking (all 6 operators), cooldown enforcement, sustained duration tracking, auto-resolve, metric extraction from health result |
| `alert-dispatch.service.spec.ts`   | Email sent via Resend mock, handles Resend failure gracefully                                                                               |
| `alert-history.service.spec.ts`    | List with filters, pagination, acknowledge state transition, reject acknowledge on non-fired alert                                          |
| `alert-rules.controller.spec.ts`   | Route handlers delegate to service correctly, auth rejection                                                                                |
| `alert-history.controller.spec.ts` | Route handlers delegate correctly, auth rejection                                                                                           |

### Key Test Cases for Alert Evaluation

1. **Operator tests:** For each of `gt`, `lt`, `eq`, `gte`, `lte`, `neq` -- verify correct boolean evaluation
2. **Cooldown:** Create a rule with 15min cooldown. Fire an alert. Immediately re-evaluate with condition still met. Assert no second alert fires.
3. **Sustained duration:** Create a rule with `duration_minutes: 2`. First evaluation sets the tracker. Second evaluation 1 minute later: no alert. Third evaluation 2 minutes later: alert fires.
4. **Auto-resolve:** Fire an alert. Next evaluation, condition is no longer met. Assert the alert transitions to `resolved`.
5. **Email dispatch:** Alert fires with `notify_emails: ['test@example.com']`. Assert `ResendEmailProvider.send()` was called with the correct params.

---

## Acceptance Criteria

- [ ] `platform_alert_rules` and `platform_alert_history` tables exist in the database
- [ ] Alert rule CRUD endpoints work correctly (create, list, update, delete)
- [ ] Alert evaluation runs every 30 seconds and checks all enabled rules
- [ ] All 6 condition operators evaluate correctly
- [ ] Cooldown periods are respected (no re-fire within cooldown window)
- [ ] Sustained duration conditions are tracked across evaluation cycles
- [ ] Email notifications are sent via Resend when alerts fire
- [ ] Alerts auto-resolve when the condition clears
- [ ] Alert history endpoint supports filtering by status, severity, and rule
- [ ] Acknowledge endpoint transitions alert from `fired` to `acknowledged`
- [ ] Alerts page renders with History and Rules tabs
- [ ] Alert rule form allows creating and editing rules
- [ ] Real-time alert indicator shows unacknowledged count in sidebar
- [ ] New alerts appear in the history table without page refresh (via WebSocket)
- [ ] All tests pass
- [ ] `turbo lint` and `turbo type-check` pass

---

## File Summary

### Files to Create (14)

| File                                                                                    | Type       |
| --------------------------------------------------------------------------------------- | ---------- |
| `apps/api/src/modules/platform/alert-rules.controller.ts`                               | Controller |
| `apps/api/src/modules/platform/alert-rules.controller.spec.ts`                          | Test       |
| `apps/api/src/modules/platform/alert-rules.service.ts`                                  | Service    |
| `apps/api/src/modules/platform/alert-rules.service.spec.ts`                             | Test       |
| `apps/api/src/modules/platform/alert-evaluation.service.ts`                             | Service    |
| `apps/api/src/modules/platform/alert-evaluation.service.spec.ts`                        | Test       |
| `apps/api/src/modules/platform/alert-dispatch.service.ts`                               | Service    |
| `apps/api/src/modules/platform/alert-dispatch.service.spec.ts`                          | Test       |
| `apps/api/src/modules/platform/alert-history.controller.ts`                             | Controller |
| `apps/api/src/modules/platform/alert-history.controller.spec.ts`                        | Test       |
| `apps/api/src/modules/platform/alert-history.service.ts`                                | Service    |
| `apps/api/src/modules/platform/alert-history.service.spec.ts`                           | Test       |
| `apps/web/src/app/[locale]/(platform)/admin/alerts/page.tsx`                            | Page       |
| `apps/web/src/app/[locale]/(platform)/admin/alerts/_components/alert-history-table.tsx` | Component  |

Also create in `_components/`:

- `alert-rule-list.tsx`
- `alert-rule-form.tsx`
- `alert-severity-badge.tsx`

**Total component files in `_components/`: 4**

### Files to Modify (4)

| File                                                           | Change                                                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `apps/api/src/modules/platform/platform.module.ts`             | Add all alert controllers, services, and imports                                     |
| `apps/api/src/modules/communications/communications.module.ts` | Export `ResendEmailProvider`                                                         |
| `apps/web/src/app/[locale]/(platform)/layout.tsx`              | Add Alerts nav item with real-time badge                                             |
| `packages/shared/src/schemas/platform.ts`                      | Add alert rule and history schemas                                                   |
| `packages/shared/src/index.ts`                                 | Export new schemas                                                                   |
| `packages/prisma/prisma/schema.prisma`                         | Add PlatformAlertRule, PlatformAlertHistory models, AlertSeverity, AlertStatus enums |
