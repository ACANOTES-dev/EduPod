# Session 1D: Onboarding Tracker

**Depends on:** Session 1A (WebSocket infrastructure for real-time step completion updates)
**Unlocks:** Layer 2/3 sessions (onboarding data feeds the dashboard home redesign in 3A)

---

## Objective

Build a hybrid onboarding tracker that guides the platform owner through bringing a new tenant from creation to go-live. This session delivers:

1. Database table for onboarding steps per tenant, plus a `billing_status` column on the `tenants` table
2. Automatic seeding of 15 default onboarding steps when a tenant is created
3. Auto-completion event listeners that detect system events and mark steps done
4. REST API for reading and updating onboarding steps
5. Frontend onboarding tracker component on the tenant detail page
6. Onboarding progress indicator on the tenant list page

After this session, every new tenant gets a 15-step pipeline with 4 phases (Infrastructure, Data, Configuration, Go-Live). Three steps auto-complete when the system detects the relevant action. The rest are manually advanced by the platform owner.

---

## Database

### New Enums

```prisma
enum OnboardingPhase {
  infrastructure
  data
  configuration
  go_live

  @@map("onboarding_phase")
}

enum OnboardingStepStatus {
  pending
  in_progress
  completed
  skipped
  blocked

  @@map("onboarding_step_status")
}

enum BillingStatus {
  active
  past_due
  cancelled

  @@map("billing_status")
}
```

### New Table: `tenant_onboarding_steps`

This table has a `tenant_id` FK but is **platform-level** -- no RLS. Platform admins need cross-tenant visibility. The tenant_id is a foreign key for data integrity, not for row-level security.

```prisma
model TenantOnboardingStep {
  id            String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id     String               @db.Uuid
  phase         OnboardingPhase
  step_key      String               @db.VarChar(100)
  label         String               @db.VarChar(255)
  description   String               @db.Text
  status        OnboardingStepStatus @default(pending)
  is_auto       Boolean              @default(false)
  blocked_by    String[]             @default([])
  completed_at  DateTime?            @db.Timestamptz()
  completed_by  String?              @db.Uuid
  metadata      Json?                @db.JsonB
  sort_order    Int
  created_at    DateTime             @default(now()) @db.Timestamptz()
  updated_at    DateTime             @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant     Tenant  @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  completer  User?   @relation("onboarding_completer", fields: [completed_by], references: [id])

  @@unique([tenant_id, step_key])
  @@map("tenant_onboarding_steps")
  @@index([tenant_id])
}
```

### Modified Table: `tenants`

Add `billing_status` column:

```prisma
model Tenant {
  // ... existing fields ...
  billing_status BillingStatus @default(active)

  // ... existing relations ...
  onboarding_steps TenantOnboardingStep[]
}
```

### Migration SQL

```sql
-- New enums
CREATE TYPE onboarding_phase AS ENUM ('infrastructure', 'data', 'configuration', 'go_live');
CREATE TYPE onboarding_step_status AS ENUM ('pending', 'in_progress', 'completed', 'skipped', 'blocked');
CREATE TYPE billing_status AS ENUM ('active', 'past_due', 'cancelled');

-- Onboarding steps table
CREATE TABLE tenant_onboarding_steps (
  id            UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID                  NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phase         onboarding_phase      NOT NULL,
  step_key      VARCHAR(100)          NOT NULL,
  label         VARCHAR(255)          NOT NULL,
  description   TEXT                  NOT NULL,
  status        onboarding_step_status NOT NULL DEFAULT 'pending',
  is_auto       BOOLEAN               NOT NULL DEFAULT false,
  blocked_by    TEXT[]                NOT NULL DEFAULT '{}',
  completed_at  TIMESTAMPTZ,
  completed_by  UUID                  REFERENCES users(id),
  metadata      JSONB,
  sort_order    INTEGER               NOT NULL,
  created_at    TIMESTAMPTZ           NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ           NOT NULL DEFAULT now(),

  CONSTRAINT uq_tenant_onboarding_step UNIQUE (tenant_id, step_key)
);

CREATE INDEX idx_tenant_onboarding_steps_tenant ON tenant_onboarding_steps (tenant_id);

-- Add billing_status to tenants
ALTER TABLE tenants ADD COLUMN billing_status billing_status NOT NULL DEFAULT 'active';
```

**No RLS policy** -- this table is accessed exclusively by platform admin endpoints which are guarded by `PlatformOwnerGuard`. No tenant-scoped code ever reads or writes this table.

---

## Default Onboarding Steps

The following 15 steps are seeded whenever a new tenant is created:

```typescript
const DEFAULT_ONBOARDING_STEPS: Array<{
  phase: OnboardingPhase;
  step_key: string;
  label: string;
  description: string;
  is_auto: boolean;
  blocked_by: string[];
  sort_order: number;
}> = [
  // Phase: Infrastructure
  {
    phase: 'infrastructure',
    step_key: 'domain_configured',
    label: 'Custom domain added',
    description: 'A custom domain has been configured for this tenant.',
    is_auto: true,
    blocked_by: [],
    sort_order: 1,
  },
  {
    phase: 'infrastructure',
    step_key: 'ssl_verified',
    label: 'SSL certificate active',
    description: 'SSL certificate has been provisioned and is active for the custom domain.',
    is_auto: true,
    blocked_by: ['domain_configured'],
    sort_order: 2,
  },
  {
    phase: 'infrastructure',
    step_key: 'modules_configured',
    label: 'Modules enabled/disabled',
    description: 'The appropriate modules have been enabled or disabled for this tenant.',
    is_auto: false,
    blocked_by: [],
    sort_order: 3,
  },
  {
    phase: 'infrastructure',
    step_key: 'billing_status_set',
    label: 'Billing status confirmed',
    description: 'The billing status for this tenant has been reviewed and set.',
    is_auto: false,
    blocked_by: [],
    sort_order: 4,
  },
  // Phase: Data
  {
    phase: 'data',
    step_key: 'owner_account_created',
    label: 'School owner account created',
    description: 'A user account with the school_owner role has been created for this tenant.',
    is_auto: true,
    blocked_by: [],
    sort_order: 5,
  },
  {
    phase: 'data',
    step_key: 'owner_welcomed',
    label: 'Welcome email sent to owner',
    description: 'A welcome email has been sent to the school owner.',
    is_auto: false,
    blocked_by: ['owner_account_created'],
    sort_order: 6,
  },
  {
    phase: 'data',
    step_key: 'staff_imported',
    label: 'Staff data imported',
    description: 'Staff records have been imported into the system.',
    is_auto: false,
    blocked_by: ['owner_account_created'],
    sort_order: 7,
  },
  {
    phase: 'data',
    step_key: 'students_imported',
    label: 'Student data imported',
    description: 'Student records have been imported into the system.',
    is_auto: false,
    blocked_by: ['owner_account_created'],
    sort_order: 8,
  },
  {
    phase: 'data',
    step_key: 'parents_imported',
    label: 'Parent data imported',
    description: 'Parent records have been imported and linked to students.',
    is_auto: false,
    blocked_by: ['students_imported'],
    sort_order: 9,
  },
  // Phase: Configuration
  {
    phase: 'configuration',
    step_key: 'academic_year_set',
    label: 'Academic year configured',
    description: 'The academic year, terms, and periods have been set up.',
    is_auto: false,
    blocked_by: ['owner_account_created'],
    sort_order: 10,
  },
  {
    phase: 'configuration',
    step_key: 'classes_set_up',
    label: 'Classes and year groups created',
    description: 'Year groups, classes, and sections have been created.',
    is_auto: false,
    blocked_by: ['academic_year_set'],
    sort_order: 11,
  },
  {
    phase: 'configuration',
    step_key: 'settings_reviewed',
    label: 'Tenant settings reviewed',
    description:
      'The tenant settings (attendance, gradebook, finance, etc.) have been reviewed and configured.',
    is_auto: false,
    blocked_by: ['modules_configured'],
    sort_order: 12,
  },
  {
    phase: 'configuration',
    step_key: 'roles_reviewed',
    label: 'Roles and permissions reviewed',
    description: 'The role definitions and permission assignments have been reviewed.',
    is_auto: false,
    blocked_by: ['owner_account_created'],
    sort_order: 13,
  },
  // Phase: Go-Live
  {
    phase: 'go_live',
    step_key: 'owner_trained',
    label: 'Owner walkthrough completed',
    description: 'The school owner has completed an onboarding walkthrough of the platform.',
    is_auto: false,
    blocked_by: ['owner_welcomed'],
    sort_order: 14,
  },
  {
    phase: 'go_live',
    step_key: 'go_live_confirmed',
    label: 'Tenant marked as live',
    description: 'The tenant has been reviewed and confirmed as ready for live use.',
    is_auto: false,
    blocked_by: [
      'domain_configured',
      'ssl_verified',
      'modules_configured',
      'billing_status_set',
      'owner_account_created',
      'owner_welcomed',
      'staff_imported',
      'students_imported',
      'parents_imported',
      'academic_year_set',
      'classes_set_up',
      'settings_reviewed',
      'roles_reviewed',
      'owner_trained',
    ],
    sort_order: 15,
  },
];
```

---

## Backend Changes

### 1. Zod Schemas

#### `packages/shared/src/schemas/platform.ts` -- Additions

```typescript
// ─── Update Onboarding Step ──────────────────────────────────────────────────

export const updateOnboardingStepSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'skipped']),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateOnboardingStepDto = z.infer<typeof updateOnboardingStepSchema>;
```

### 2. Onboarding Service

#### `apps/api/src/modules/platform/onboarding.service.ts`

**Class:** `OnboardingService`

**Constructor DI:**

```typescript
private readonly prisma: PrismaService
private readonly redisPubSub: RedisPubSubService
```

**Methods:**

```typescript
/**
 * Seed default onboarding steps for a newly created tenant.
 * Called from TenantsService.createTenant() after the tenant record is created.
 */
async seedDefaultSteps(tenantId: string): Promise<void> {
  const steps = DEFAULT_ONBOARDING_STEPS.map((step) => ({
    tenant_id: tenantId,
    phase: step.phase,
    step_key: step.step_key,
    label: step.label,
    description: step.description,
    is_auto: step.is_auto,
    blocked_by: step.blocked_by,
    sort_order: step.sort_order,
    status: 'pending' as const,
  }));

  await this.prisma.tenantOnboardingStep.createMany({ data: steps });
}

/**
 * Get all onboarding steps for a tenant, ordered by sort_order.
 * Returns steps grouped by phase with completion summary.
 */
async getForTenant(tenantId: string): Promise<{
  steps: TenantOnboardingStep[];
  summary: {
    total: number;
    completed: number;
    in_progress: number;
    pending: number;
    skipped: number;
    blocked: number;
    percent_complete: number;
  };
}> {
  const steps = await this.prisma.tenantOnboardingStep.findMany({
    where: { tenant_id: tenantId },
    orderBy: { sort_order: 'asc' },
    include: {
      completer: { select: { id: true, first_name: true, last_name: true } },
    },
  });

  const total = steps.length;
  const completed = steps.filter((s) => s.status === 'completed').length;
  const in_progress = steps.filter((s) => s.status === 'in_progress').length;
  const pending = steps.filter((s) => s.status === 'pending').length;
  const skipped = steps.filter((s) => s.status === 'skipped').length;
  const blocked = steps.filter((s) => s.status === 'blocked').length;

  return {
    steps,
    summary: {
      total,
      completed,
      in_progress,
      pending,
      skipped,
      blocked,
      percent_complete: total > 0 ? Math.round((completed / total) * 100) : 0,
    },
  };
}

/**
 * Update a specific onboarding step's status.
 * Validates dependency constraints (blocked_by).
 */
async updateStep(
  tenantId: string,
  stepId: string,
  dto: UpdateOnboardingStepDto,
  actorUserId: string,
): Promise<TenantOnboardingStep> {
  const step = await this.prisma.tenantOnboardingStep.findFirst({
    where: { id: stepId, tenant_id: tenantId },
  });

  if (!step) {
    throw new NotFoundException({
      code: 'ONBOARDING_STEP_NOT_FOUND',
      message: `Onboarding step "${stepId}" not found for this tenant`,
    });
  }

  // If completing, check that all blocked_by steps are completed
  if (dto.status === 'completed' && step.blocked_by.length > 0) {
    const blockers = await this.prisma.tenantOnboardingStep.findMany({
      where: {
        tenant_id: tenantId,
        step_key: { in: step.blocked_by },
        status: { not: 'completed' },
      },
    });

    if (blockers.length > 0) {
      const blockerKeys = blockers.map((b) => b.step_key).join(', ');
      throw new BadRequestException({
        code: 'ONBOARDING_STEP_BLOCKED',
        message: `Cannot complete this step. Blocked by: ${blockerKeys}`,
      });
    }
  }

  const updated = await this.prisma.tenantOnboardingStep.update({
    where: { id: stepId },
    data: {
      status: dto.status,
      ...(dto.status === 'completed' && {
        completed_at: new Date(),
        completed_by: actorUserId,
      }),
      ...(dto.metadata && { metadata: dto.metadata }),
    },
  });

  // Publish to WebSocket
  await this.redisPubSub.publish('platform:onboarding', {
    type: 'step_updated',
    tenant_id: tenantId,
    step_id: stepId,
    step_key: step.step_key,
    new_status: dto.status,
  });

  // After completing a step, check if any blocked steps can be unblocked
  if (dto.status === 'completed') {
    await this.unblockDependentSteps(tenantId, step.step_key);
  }

  return updated;
}

/**
 * Reset all onboarding steps to pending for a tenant.
 * Used when re-starting the onboarding process.
 */
async resetForTenant(tenantId: string): Promise<void> {
  await this.prisma.tenantOnboardingStep.updateMany({
    where: { tenant_id: tenantId },
    data: {
      status: 'pending',
      completed_at: null,
      completed_by: null,
      metadata: null,
    },
  });
}

/**
 * Auto-complete a step by step_key for a tenant.
 * Called by event listeners when system events occur.
 */
async autoCompleteStep(tenantId: string, stepKey: string, metadata?: Record<string, unknown>): Promise<void> {
  const step = await this.prisma.tenantOnboardingStep.findFirst({
    where: {
      tenant_id: tenantId,
      step_key: stepKey,
      status: { not: 'completed' },
    },
  });

  if (!step) return; // Already completed or doesn't exist

  // Check blocked_by dependencies
  if (step.blocked_by.length > 0) {
    const incompleteBlockers = await this.prisma.tenantOnboardingStep.count({
      where: {
        tenant_id: tenantId,
        step_key: { in: step.blocked_by },
        status: { not: 'completed' },
      },
    });
    if (incompleteBlockers > 0) return; // Can't auto-complete yet
  }

  await this.prisma.tenantOnboardingStep.update({
    where: { id: step.id },
    data: {
      status: 'completed',
      completed_at: new Date(),
      metadata: metadata ? (metadata as object) : undefined,
    },
  });

  // Publish to WebSocket
  await this.redisPubSub.publish('platform:onboarding', {
    type: 'step_auto_completed',
    tenant_id: tenantId,
    step_key: stepKey,
  });

  // Unblock dependent steps
  await this.unblockDependentSteps(tenantId, stepKey);

  this.logger.log(`Auto-completed onboarding step "${stepKey}" for tenant ${tenantId}`);
}

/**
 * Check if steps that were waiting on the completed step can now proceed.
 * This does NOT auto-complete them -- it just ensures the UI shows them as unblocked.
 * The blocked_by check happens at query time, not stored state.
 */
private async unblockDependentSteps(tenantId: string, completedStepKey: string): Promise<void> {
  // No stored state to update -- blocked_by is evaluated at read time.
  // This method exists as a hook for future logic (e.g., notifications).
  this.logger.debug(`Step "${completedStepKey}" completed for tenant ${tenantId} -- dependent steps unblocked`);
}
```

### 3. Onboarding Controller

#### `apps/api/src/modules/platform/onboarding.controller.ts`

```typescript
@Controller('v1/admin/tenants')
@UseGuards(AuthGuard, PlatformOwnerGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  // GET /v1/admin/tenants/:id/onboarding
  @Get(':id/onboarding')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return this.onboardingService.getForTenant(id);
  }

  // PATCH /v1/admin/tenants/:id/onboarding/:stepId
  @Patch(':id/onboarding/:stepId')
  async updateStep(
    @Param('id', ParseUUIDPipe) tenantId: string,
    @Param('stepId', ParseUUIDPipe) stepId: string,
    @Body(new ZodValidationPipe(updateOnboardingStepSchema)) dto: UpdateOnboardingStepDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.onboardingService.updateStep(tenantId, stepId, dto, user.sub);
  }

  // POST /v1/admin/tenants/:id/onboarding/reset
  @Post(':id/onboarding/reset')
  @HttpCode(HttpStatus.OK)
  async reset(@Param('id', ParseUUIDPipe) tenantId: string) {
    await this.onboardingService.resetForTenant(tenantId);
    return { message: 'Onboarding tracker reset successfully' };
  }
}
```

### 4. Auto-Completion Event Listeners

#### `apps/api/src/modules/platform/onboarding-events.service.ts`

**Class:** `OnboardingEventsService`

This service subscribes to application events and triggers auto-completion. Since the codebase does not currently use NestJS event emitter, we implement this as explicit calls from the relevant services.

**Approach:** Rather than introducing `@nestjs/event-emitter` (new dependency, new pattern), the auto-completion calls are placed directly in the existing services that perform the triggering actions. This keeps the blast radius small.

**Trigger points in existing code:**

1. **`domain_configured`** -- fires when a custom domain is added to a tenant
   - **Where:** `apps/api/src/modules/tenants/domains.service.ts` -- after `createDomain()` succeeds
   - **Call:** `onboardingService.autoCompleteStep(tenantId, 'domain_configured')`

2. **`ssl_verified`** -- fires when a domain's SSL status changes to `active`
   - **Where:** `apps/api/src/modules/tenants/domains.service.ts` -- after `updateDomain()` sets `ssl_status = 'active'`
   - **Call:** `onboardingService.autoCompleteStep(tenantId, 'ssl_verified')`

3. **`owner_account_created`** -- fires when a user with `school_owner` or `school_principal` role is created for a tenant
   - **Where:** This is trickier because owner creation flows through the invitation system. The best hook point is in `TenantsService.createTenant()` area or in the invitation acceptance flow.
   - **Practical approach for Layer 1:** Add a check in the `OnboardingService.getForTenant()` method that dynamically checks if a `school_principal` membership exists. If yes and the step is not yet completed, auto-complete it on read. This avoids modifying the invitation flow.
   - **Alternative (cleaner, more work):** Add the auto-complete call to the invitation acceptance service after the `school_principal` role is assigned.

**For Layer 1, we implement options 1 and 2 as direct calls, and option 3 as a check-on-read pattern:**

```typescript
// In onboarding.service.ts, within getForTenant():
// After fetching steps, check if owner_account_created can be auto-completed
const ownerStep = steps.find(
  (s) => s.step_key === 'owner_account_created' && s.status !== 'completed',
);
if (ownerStep) {
  const ownerMembership = await this.prisma.tenantMembership.findFirst({
    where: {
      tenant_id: tenantId,
      membership_status: 'active',
      membership_roles: {
        some: {
          role: {
            role_key: { in: ['school_principal', 'school_owner'] },
          },
        },
      },
    },
  });
  if (ownerMembership) {
    await this.autoCompleteStep(tenantId, 'owner_account_created');
    // Re-fetch steps to get updated data
    // (Or mutate the local array to avoid a second query)
  }
}
```

### 5. Hook into Tenant Creation

#### `apps/api/src/modules/tenants/tenants.service.ts` -- Modification

At the end of `createTenant()`, after all existing setup:

```typescript
// Seed onboarding steps
await this.onboardingService.seedDefaultSteps(tenant.id);
```

**Required changes:**

1. Add `OnboardingService` to constructor DI
2. Add the `seedDefaultSteps` call at the end of `createTenant()`

**Circular dependency concern:** `TenantsService` depends on `OnboardingService`, and `OnboardingService` depends on `PrismaService` (no circular). The `OnboardingService` lives in `PlatformModule`, so `TenantsModule` needs to import `PlatformModule` (or `PlatformModule` needs to export `OnboardingService` and `TenantsModule` imports it).

**Resolution:** Export `OnboardingService` from `PlatformModule`. Import `PlatformModule` into `TenantsModule`. This is a one-way dependency: `TenantsModule` -> `PlatformModule`.

### 6. Hook into Domains Service

#### `apps/api/src/modules/tenants/domains.service.ts` -- Modification

After domain creation:

```typescript
// Auto-complete onboarding step
await this.onboardingService.autoCompleteStep(domain.tenant_id, 'domain_configured');
```

After domain update with `ssl_status = 'active'`:

```typescript
if (dto.ssl_status === 'active') {
  await this.onboardingService.autoCompleteStep(domain.tenant_id, 'ssl_verified');
}
```

**Required changes:**

1. Add `OnboardingService` to constructor DI in `DomainsService`
2. Add auto-complete calls at the appropriate points

### 7. Update Platform Module

#### `apps/api/src/modules/platform/platform.module.ts` -- Updated

```typescript
@Module({
  imports: [AuthModule, HealthModule, CommunicationsModule],
  controllers: [
    HealthHistoryController,
    AlertRulesController,
    AlertHistoryController,
    OnboardingController,
  ],
  providers: [
    RedisPubSubService,
    PlatformGateway,
    HealthSnapshotService,
    AlertRulesService,
    AlertHistoryService,
    AlertEvaluationService,
    AlertDispatchService,
    OnboardingService,
  ],
  exports: [RedisPubSubService, OnboardingService],
})
export class PlatformModule {}
```

### 8. Update Tenants Module

#### `apps/api/src/modules/tenants/tenants.module.ts` -- Updated

```typescript
@Module({
  imports: [AuthModule, PlatformModule],
  controllers: [TenantsController, DomainsController],
  providers: [TenantsService, DomainsService, SequenceService],
  exports: [TenantsService, SequenceService],
})
export class TenantsModule {}
```

**Circular dependency check:** `PlatformModule` does NOT import `TenantsModule`. `TenantsModule` imports `PlatformModule`. This is a clean one-way dependency.

---

## Frontend Changes

### 1. Onboarding Tracker Component

#### `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/_components/onboarding-tracker.tsx`

**Component:** `OnboardingTracker` (client component)

**Props:**

```typescript
interface OnboardingTrackerProps {
  tenantId: string;
}
```

**Data fetching:** Fetches onboarding data from `GET /v1/admin/tenants/:id/onboarding` on mount.

**Real-time:** Subscribes to `onboarding:update` via `usePlatformSocket()`. When a step update event arrives for this tenant, refetch the data.

**Layout:**

```
+--------------------------------------------------------------+
| Onboarding Progress                                          |
| [============================----] 73% (11/15 steps)          |
+--------------------------------------------------------------+
| INFRASTRUCTURE                                                |
| [x] Custom domain added              Auto    Completed 3/15  |
| [x] SSL certificate active           Auto    Completed 3/15  |
| [x] Modules enabled/disabled         Manual  Completed 3/14  |
| [ ] Billing status confirmed          Manual  Pending         |
+--------------------------------------------------------------+
| DATA                                                          |
| [x] School owner account created     Auto    Completed 3/12  |
| [>] Welcome email sent to owner       Manual  In Progress     |
| [ ] Staff data imported               Manual  Pending         |
| [ ] Student data imported             Manual  Pending         |
| [ ] Parent data imported              Manual  Blocked (needs students) |
+--------------------------------------------------------------+
| CONFIGURATION                                                 |
| ...                                                           |
+--------------------------------------------------------------+
| GO-LIVE                                                       |
| ...                                                           |
+--------------------------------------------------------------+
```

**Step card visual states:**

- `completed`: green checkmark, green left border, completed_at timestamp
- `in_progress`: blue spinner icon, blue left border
- `pending`: grey circle, default border
- `skipped`: grey strikethrough, "Skipped" label
- `blocked`: grey circle with lock icon, "Blocked by: X, Y" text, muted styling

**Actions per step:**

- **Pending/In-Progress steps:** Button to mark as completed (calls `PATCH /v1/admin/tenants/:id/onboarding/:stepId` with `{ status: 'completed' }`)
- **Pending steps:** Button to mark as in-progress
- **Pending steps:** Button to skip
- **Auto steps:** No manual buttons -- these are system-managed
- **Blocked steps:** Buttons are disabled with tooltip explaining the blockers

#### `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/_components/onboarding-step-card.tsx`

**Props:**

```typescript
interface OnboardingStepCardProps {
  step: TenantOnboardingStep;
  isBlocked: boolean; // Computed by parent based on blocked_by steps
  blockerLabels: string[]; // Human-readable labels of blocking steps
  onUpdateStatus: (stepId: string, status: string) => void;
  updating: boolean;
}
```

#### `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/_components/onboarding-progress-bar.tsx`

**Props:**

```typescript
interface OnboardingProgressBarProps {
  completed: number;
  total: number;
  percentComplete: number;
}
```

Simple progress bar with count label.

### 2. Tenant Detail Page Update

#### `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/page.tsx` -- Modification

The existing tenant detail page needs to include the onboarding tracker. Add a tabbed interface or a new section:

**Approach:** Add a tab bar at the top of the tenant detail page:

- **Details** tab (existing content)
- **Onboarding** tab (new `<OnboardingTracker tenantId={id} />`)

If the page currently does not have tabs, wrap the existing content in a tab structure.

### 3. Tenant List Onboarding Progress

#### `apps/web/src/app/[locale]/(platform)/admin/tenants/page.tsx` -- Modification

Add onboarding progress to the tenant list table. This requires the backend to include onboarding summary data in the tenant list response.

**Backend change:** In `TenantsService.listTenants()`, include onboarding summary:

```typescript
// After fetching tenants, compute onboarding summary per tenant
const tenantsWithOnboarding = await Promise.all(
  data.map(async (tenant) => {
    const steps = await this.prisma.tenantOnboardingStep.findMany({
      where: { tenant_id: tenant.id },
      select: { status: true },
    });
    const total = steps.length;
    const completed = steps.filter((s) => s.status === 'completed').length;
    return {
      ...tenant,
      onboarding:
        total > 0
          ? { total, completed, percent_complete: Math.round((completed / total) * 100) }
          : null,
    };
  }),
);
```

**Frontend change:** Add an "Onboarding" column to the tenant list table showing a mini progress bar or "11/15" text.

---

## Testing Strategy

### Backend Unit Tests

| Test File                       | Tests                                                                                                                                                                                                                        |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onboarding.service.spec.ts`    | seedDefaultSteps creates 15 steps, getForTenant returns correct summary, updateStep validates blocked_by, updateStep rejects blocked completion, autoCompleteStep handles already-completed, resetForTenant resets all steps |
| `onboarding.controller.spec.ts` | GET /onboarding returns data, PATCH /onboarding/:stepId delegates correctly, POST /reset delegates correctly, auth rejection                                                                                                 |

### Key Test Cases

1. **Seed on tenant creation:** Mock `prisma.tenantOnboardingStep.createMany`. Call `seedDefaultSteps('tenant-uuid')`. Assert 15 records are created with correct data.

2. **Blocked step rejection:** Seed steps where `parents_imported` is blocked by `students_imported`. Attempt to complete `parents_imported` when `students_imported` is still pending. Assert `BadRequestException` with code `ONBOARDING_STEP_BLOCKED`.

3. **Blocked step allowed:** Same setup but complete `students_imported` first. Then complete `parents_imported`. Assert success.

4. **Auto-complete:** Call `autoCompleteStep(tenantId, 'domain_configured')`. Assert the step is updated to `completed` with a `completed_at` timestamp.

5. **Auto-complete skips completed:** Call `autoCompleteStep` on an already-completed step. Assert no error and no update.

6. **Summary calculation:** Seed 15 steps, mark 11 as completed. Call `getForTenant`. Assert `percent_complete` is 73.

7. **Reset:** Seed steps with various statuses. Call `resetForTenant`. Assert all steps are `pending` with null `completed_at`.

---

## Acceptance Criteria

- [ ] `tenant_onboarding_steps` table exists in the database
- [ ] `billing_status` column exists on `tenants` table with default `active`
- [ ] Tenant creation automatically seeds 15 default onboarding steps
- [ ] GET `/v1/admin/tenants/:id/onboarding` returns steps grouped by phase with summary
- [ ] PATCH `/v1/admin/tenants/:id/onboarding/:stepId` updates step status
- [ ] Step completion validates `blocked_by` dependencies and rejects if blockers are incomplete
- [ ] POST `/v1/admin/tenants/:id/onboarding/reset` resets all steps to pending
- [ ] `domain_configured` auto-completes when a domain is created for the tenant
- [ ] `ssl_verified` auto-completes when domain SSL status becomes `active`
- [ ] `owner_account_created` auto-completes when a school_principal membership exists
- [ ] Onboarding tracker renders on the tenant detail page with phase-grouped steps
- [ ] Step cards show correct visual state (completed, in-progress, pending, blocked, skipped)
- [ ] Manual step actions (complete, in-progress, skip) work from the UI
- [ ] Onboarding progress shows in the tenant list
- [ ] Real-time updates via WebSocket reflect step changes without page refresh
- [ ] All tests pass
- [ ] `turbo lint` and `turbo type-check` pass

---

## File Summary

### Files to Create (8)

| File                                                                                              | Type       |
| ------------------------------------------------------------------------------------------------- | ---------- |
| `apps/api/src/modules/platform/onboarding.service.ts`                                             | Service    |
| `apps/api/src/modules/platform/onboarding.service.spec.ts`                                        | Test       |
| `apps/api/src/modules/platform/onboarding.controller.ts`                                          | Controller |
| `apps/api/src/modules/platform/onboarding.controller.spec.ts`                                     | Test       |
| `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/_components/onboarding-tracker.tsx`      | Component  |
| `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/_components/onboarding-step-card.tsx`    | Component  |
| `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/_components/onboarding-progress-bar.tsx` | Component  |

### Files to Modify (7)

| File                                                               | Change                                                                                                                       |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/platform/platform.module.ts`                 | Add OnboardingController, OnboardingService; export OnboardingService                                                        |
| `apps/api/src/modules/tenants/tenants.module.ts`                   | Import PlatformModule                                                                                                        |
| `apps/api/src/modules/tenants/tenants.service.ts`                  | Inject OnboardingService; call seedDefaultSteps in createTenant; include onboarding summary in listTenants                   |
| `apps/api/src/modules/tenants/domains.service.ts`                  | Inject OnboardingService; add auto-complete calls for domain_configured and ssl_verified                                     |
| `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/page.tsx` | Add tabbed layout with Onboarding tab                                                                                        |
| `apps/web/src/app/[locale]/(platform)/admin/tenants/page.tsx`      | Add onboarding progress column                                                                                               |
| `packages/shared/src/schemas/platform.ts`                          | Add updateOnboardingStepSchema                                                                                               |
| `packages/shared/src/index.ts`                                     | Export new schema                                                                                                            |
| `packages/prisma/prisma/schema.prisma`                             | Add TenantOnboardingStep model, OnboardingPhase/OnboardingStepStatus/BillingStatus enums, billing_status on Tenant, relation |
