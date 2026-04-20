# Implementation 03 — Wellbeing Dashboard-Summary Aggregator

> **Wave:** 2 (parallel-safe — owns a new module directory)
> **Classification:** backend
> **Depends on:** 01
> **Deploys:** API restart only

---

## Goal

Create the single endpoint the new `/wellbeing` super-hub will call: `GET /api/v1/wellbeing/dashboard-summary`. It cross-queries the five wellbeing module services in parallel (`Promise.allSettled`), composes a unified response of KPIs + pending-attention items + per-hub counts + recent activity, and tolerates per-module failures (a failing sub-query yields zero counts and a logged warning, never a 500). Module-flag-disabled sources contribute zero counts. Permissions filter what the requesting user is allowed to see.

This impl ONLY ships the backend service and endpoint. The super-hub UI (impl 13) consumes this endpoint.

## Shared files this impl touches

- `apps/api/src/app.module.ts` — register the new `WellbeingAggregateModule`. Edit late.
- `packages/shared/src/wellbeing/index.ts` — add `WellbeingDashboardSummary` type + Zod schema. (Already created by impl 01; you append.) Edit late.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **low.**

## What to build

### 1. New module `apps/api/src/modules/wellbeing-aggregate/`

```
wellbeing-aggregate/
├── wellbeing-aggregate.controller.ts
├── wellbeing-aggregate.controller.spec.ts
├── wellbeing-aggregate.service.ts
├── wellbeing-aggregate.service.spec.ts
└── wellbeing-aggregate.module.ts
```

### 2. Controller

```ts
@Controller('v1/wellbeing')
@UseGuards(AuthGuard, PermissionGuard)
export class WellbeingAggregateController {
  constructor(private readonly service: WellbeingAggregateService) {}

  // GET /v1/wellbeing/dashboard-summary
  @Get('dashboard-summary')
  @RequiresPermission('wellbeing.view_dashboard')
  getDashboardSummary(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: AuthUser) {
    return this.service.getDashboardSummary(tenant.tenant_id, user);
  }
}
```

### 3. Service — parallel cross-module read

```ts
@Injectable()
export class WellbeingAggregateService {
  private readonly logger = new Logger(WellbeingAggregateService.name);

  constructor(
    private readonly behaviour: BehaviourReadService,
    private readonly pastoral: PastoralReadService,
    private readonly safeguarding: SafeguardingReadService,
    private readonly earlyWarning: EarlyWarningReadService,
    private readonly staffWellbeing: StaffWellbeingReadService,
    private readonly moduleFlags: ModuleFlagsService,
  ) {}

  async getDashboardSummary(tenantId: string, user: AuthUser): Promise<WellbeingDashboardSummary> {
    const enabled = await this.moduleFlags.getEnabledFor(tenantId);

    const [incidents, cases, atRisk, sanctions, tasks, slaBreaches, activity, pending] =
      await Promise.allSettled([
        enabled.behaviour ? this.behaviour.getOpenIncidentCounts(tenantId) : Promise.resolve(null),
        enabled.pastoral ? this.pastoral.getOpenCaseCount(tenantId) : Promise.resolve(0),
        enabled.early_warning ? this.earlyWarning.getAtRiskCounts(tenantId) : Promise.resolve(null),
        enabled.behaviour ? this.behaviour.getOverdueSanctionCount(tenantId) : Promise.resolve(0),
        enabled.behaviour ? this.behaviour.getOverdueTaskCount(tenantId) : Promise.resolve(0),
        this.safeguarding.getSlaBreachCount(tenantId),
        this.getRecentActivity(tenantId, user, enabled),
        this.getPendingAttention(tenantId, user, enabled),
      ]);

    return {
      kpis: {
        students_at_risk: this.unwrapOrDefault(atRisk, { amber: 0, red: 0, total: 0 }),
        open_incidents: this.unwrapOrDefault(incidents, { total: 0, positive: 0, negative: 0 }),
        open_pastoral_cases: this.unwrapOrZero(cases),
        overdue_actions: {
          sanctions: this.unwrapOrZero(sanctions),
          tasks: this.unwrapOrZero(tasks),
          sla_breaches: this.unwrapOrZero(slaBreaches),
          total:
            this.unwrapOrZero(sanctions) +
            this.unwrapOrZero(tasks) +
            this.unwrapOrZero(slaBreaches),
        },
      },
      pending_attention: this.unwrapOrDefault(pending, []),
      hub_counts: this.computeHubCounts(/* aggregated from above */),
      recent_activity: this.unwrapOrDefault(activity, []),
    };
  }

  private unwrapOrZero(r: PromiseSettledResult<number>): number {
    if (r.status === 'fulfilled') return r.value ?? 0;
    this.logger.warn(`Sub-query failed: ${r.reason}`);
    return 0;
  }

  private unwrapOrDefault<T>(r: PromiseSettledResult<T>, fallback: T): T {
    if (r.status === 'fulfilled') return r.value ?? fallback;
    this.logger.warn(`Sub-query failed: ${r.reason}`);
    return fallback;
  }

  // ... getRecentActivity, getPendingAttention helpers
}
```

### 4. Read-service interfaces

This impl needs read-only methods on each existing module's service. Most do not exist yet. Add them as **light wrapper methods** in each module's existing service file, exporting via the module's `exports` array. Do NOT create new modules just for these reads.

For each:

```ts
// In BehaviourService (or new BehaviourReadService if separation makes sense)
async getOpenIncidentCounts(tenantId: string): Promise<{ total: number; positive: number; negative: number }> {
  const result = await this.prisma.behaviourIncident.groupBy({
    by: ['polarity'],
    where: { tenant_id: tenantId, status: { in: ['active', 'investigating', 'awaiting_approval', 'awaiting_parent_meeting', 'under_review', 'escalated'] } },
    _count: { _all: true },
  });
  // ... map to shape
}
```

Five services to extend:

- `BehaviourService`: `getOpenIncidentCounts`, `getOverdueSanctionCount`, `getOverdueTaskCount`, `getRecentIncidents(limit)`
- `PastoralService`: `getOpenCaseCount`, `getRecentConcerns(limit)`, `getUnacknowledgedCriticalCount`
- `SafeguardingService`: `getSlaBreachCount`, `getSlaBreachItems(user)` (filtered by access)
- `EarlyWarningService`: `getAtRiskCounts` (returns `{ amber, red, total }`)
- `StaffWellbeingService`: contributes nothing to KPIs but its hub_count comes from `getActiveSurveyCount`

Each new method:

- Takes `tenantId` first
- Uses `this.prisma.<model>` reads (no RLS context wrapping needed for counts; tenant_id WHERE clause provides isolation; counts are non-sensitive)
- Returns plain shapes (not Prisma types) — easier to test, stable contract

### 5. Module wiring

```ts
@Module({
  imports: [
    BehaviourModule, // exports BehaviourService
    PastoralModule,
    SafeguardingModule,
    EarlyWarningModule,
    StaffWellbeingModule,
    ModuleFlagsModule, // exports ModuleFlagsService
  ],
  controllers: [WellbeingAggregateController],
  providers: [WellbeingAggregateService],
})
export class WellbeingAggregateModule {}
```

Register in `app.module.ts`. Verify the module imports compile via the DI smoke test from CLAUDE.md (Module Registration Verification snippet) before pushing.

### 6. Shared types

Append to `packages/shared/src/wellbeing/index.ts`:

```ts
export const wellbeingDashboardSummarySchema = z.object({
  kpis: z.object({
    students_at_risk: z.object({ amber: z.number(), red: z.number(), total: z.number() }),
    open_incidents: z.object({ total: z.number(), positive: z.number(), negative: z.number() }),
    open_pastoral_cases: z.number(),
    overdue_actions: z.object({
      sanctions: z.number(),
      tasks: z.number(),
      sla_breaches: z.number(),
      total: z.number(),
    }),
  }),
  pending_attention: z.array(
    z.object({
      kind: z.enum([
        'sla_breach',
        'overdue_intervention',
        'unack_critical',
        'pending_appeal',
        'awaiting_parent_meeting',
      ]),
      severity: z.enum(['critical', 'high', 'medium']),
      title: z.string(),
      detail: z.string(),
      href: z.string(),
      due_at: z.string().datetime().optional(),
      count: z.number().optional(),
    }),
  ),
  hub_counts: z.object({
    behaviour: z.number(),
    pastoral: z.number(),
    safeguarding: z.number(),
    early_warnings: z.number(),
    staff_wellbeing: z.number(),
  }),
  recent_activity: z.array(
    z.object({
      id: z.string().uuid(),
      kind: z.enum([
        'incident',
        'concern',
        'acknowledgement',
        'escalation',
        'sanction_served',
        'recognition',
      ]),
      title: z.string(),
      actor_name: z.string().nullable(),
      occurred_at: z.string().datetime(),
      href: z.string(),
    }),
  ),
});
export type WellbeingDashboardSummary = z.infer<typeof wellbeingDashboardSummarySchema>;
```

## Tests

- `wellbeing-aggregate.service.spec.ts`:
  - All five module reads succeed → returns merged shape
  - Behaviour read throws → returns zeros for incident KPIs, logs warning, no exception
  - Module flag off for early-warning → at_risk returns zeros without invoking earlyWarning service
  - Per-tenant isolation: stub each read service to return tenant-tagged data, assert WellbeingAggregateService passes tenantId through correctly
- `wellbeing-aggregate.controller.spec.ts`:
  - Returns 200 with documented shape
  - Returns 403 when user lacks `wellbeing.view_dashboard`

## Watch out for

- **`Promise.allSettled` swallowed errors are ESLint hits in some configs** — use the helper `unwrapOrZero` pattern shown above to keep linting clean and to make the intent explicit.
- **Pending-attention ordering** — sort by severity (critical → high → medium), then by `due_at` ascending. Cap at 10 items in the response. The UI handles "view more".
- **Recent activity actor name** — may need a join to `users` for the actor's display name. Use existing user-display helpers in the project; do not duplicate.
- **Performance** — six parallel queries. Each must be indexed. Verify `behaviour_incidents(tenant_id, status)`, `pastoral_cases(tenant_id, status)`, `behaviour_sanctions(tenant_id, status, scheduled_at)`, `behaviour_tasks(tenant_id, status, due_at)`, `safeguarding_concerns(tenant_id, sla_first_response_due, sla_first_response_met_at)` indexes exist. If any is missing, add it in this impl with a small migration.

## Deployment notes

- Restart: API only.
- Smoke: `curl /api/v1/wellbeing/dashboard-summary -H "Authorization: ..."` returns the documented shape with all-zero counts on fresh NHQS, valid 200 status.
- Time the response on production. Target: < 250ms p50. If slower, add the missing indexes before declaring complete.
