# Implementation 03 — API Contract + Missing Endpoints

> **Wave:** 3 (parallel-safe with impl 04)
> **Classification:** backend
> **Depends on:** 01, 02
> **Deploys:** API only

---

## Goal

Close the contract drift between the redesigned frontend and the backend by:

1. Building the missing endpoints the frontend already calls (`/my-payslips`, `/my-payslips/ytd`, `/runs/:id/allowances|adjustments|anomalies|comparison`, `/export-logs`, payroll-staff list, anomaly acknowledge, etc.).
2. Renaming or aliasing endpoints whose path/verb the frontend disagrees with the backend on (PATCH-vs-PUT on `/export-templates/:id`, `/staff-attendance/...` vs `/attendance/...`, `/compensation/import` vs `/compensation/bulk-import`, etc.).
3. Adding `@ModuleEnabled('payroll')` to every payroll controller.
4. Properly resolving `isSchoolOwner` (or formally removing the dual-path branch) — the controller should use `PermissionCacheService.isOwner(actorUserId, tenantId)` like the inbox `AdminTierOnlyGuard`, not return a hardcoded `false`.
5. Backfilling the new permissions (`payroll.manage_attendance`, `payroll.self_service`) on existing tenants via an `OnModuleInit` boot hook (matching the `InboxPermissionsInit` pattern).
6. Flattening response shapes — the SEND-pattern fix from project memory: backend services include nested `staff_profile.user`; the controller layer should map this to flat `staff_name` aliases for the frontend.
7. Updating `payroll-dashboard.service.ts` to include `anomalies` and `payroll_calendar` in the dashboard response (the frontend already reads them).

This impl owns the controller and DTO layer. Wave 2 owned the service layer. Wave 4 owns the frontend. By the end of Wave 3, the frontend's existing fetch URLs all resolve to real endpoints.

---

## Shared files this impl touches

This impl is parallel-safe with impl 04 (worker). They share zero source files because all shared constants live in `@school/shared/payroll`. Both impls restart the API; their deploys serialise via the 3-minute poll.

- `apps/api/src/modules/payroll/payroll.module.ts` — registers any new providers (`PayrollPermissionsInit`, etc.) and adds new controllers if any are extracted. Edit late.
- `apps/api/src/app.module.ts` — IF a new module-level provider needs registration. Probably not. Edit late if needed.
- `packages/prisma/seed/system-roles.ts` — add the role-permission grants for the two new permissions on the seeded roles. Wave 1 added the permission definitions; this impl wires them to roles. Edit late.
- `IMPLEMENTATION_LOG.md` — status flips + completion record. Always in a separate commit, after all other commits.

All controller and DTO files within `apps/api/src/modules/payroll/` are owned by this impl. The service layer was finalised in Wave 2 — only thin additions allowed (new repository read methods, new mapper helpers).

---

## What to build

### 1. Build the missing endpoints

For each missing endpoint listed in the audit, decide: (a) does the data exist? (b) which controller does it logically belong to? (c) what's the response shape?

#### 1a. `GET /v1/payroll/my-payslips`

Self-service — returns the calling user's own payslips, paginated.

```typescript
// payslips.controller.ts
@Get('my-payslips')
@RequiresPermission('payroll.self_service')
async listOwnPayslips(
  @CurrentTenant() tenantContext: TenantContext,
  @CurrentUser() user: AuthenticatedUser,
  @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
) {
  return this.payslipsService.listForUser(tenantContext.tenant_id, user.user_id, query);
}
```

The service implementation in `payslips.service.ts`:

```typescript
async listForUser(tenantId: string, userId: string, query: PaginationQuery): Promise<{ data: Payslip[], meta: PaginationMeta }> {
  // 1. Find the staff_profile for this user. If none exists, return empty.
  const staffProfile = await this.prisma.staffProfile.findFirst({
    where: { tenant_id: tenantId, user_id: userId },
  });
  if (!staffProfile) return { data: [], meta: { page: 1, pageSize: query.pageSize, total: 0 }};

  // 2. Find payslips for entries belonging to this staff member, joined to runs to filter finalised only.
  const where = {
    tenant_id: tenantId,
    payroll_entry: {
      staff_profile_id: staffProfile.id,
      payroll_run: { status: 'finalised' as PayrollRunStatus },
    },
  };

  const [data, total] = await Promise.all([
    this.prisma.payslip.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { payroll_entry: { include: { payroll_run: true }}},
    }),
    this.prisma.payslip.count({ where }),
  ]);

  return {
    data: data.map(this.mapToSelfServiceDto),
    meta: { page: query.page, pageSize: query.pageSize, total },
  };
}
```

CRITICAL privacy: this method MUST NOT accept a `staff_profile_id` query param. It always scopes to the calling user's own staff_profile. A user with `payroll.self_service` cannot ask for someone else's payslips.

#### 1b. `GET /v1/payroll/my-payslips/ytd`

Year-to-date totals for the calling user. Returns `{ year, gross_total, net_total, total_deductions, by_month: [{ month, gross, net }] }`.

```typescript
@Get('my-payslips/ytd')
@RequiresPermission('payroll.self_service')
async getOwnYtd(
  @CurrentTenant() tenantContext: TenantContext,
  @CurrentUser() user: AuthenticatedUser,
  @Query('year') year?: string,
) {
  const yearNum = year ? Number(year) : new Date().getFullYear();
  return this.payslipsService.getYtdForUser(tenantContext.tenant_id, user.user_id, yearNum);
}
```

#### 1c. `GET /v1/payroll/payslips/:id/pdf`

Individual payslip PDF download — must be auth-checked. The current frontend calls this; it 401s today because the path uses `window.open` which bypasses the auth header.

```typescript
@Get('payslips/:id/pdf')
@RequiresPermission('payroll.view OR payroll.self_service')   // either grant works
async downloadPdf(
  @CurrentTenant() tenantContext: TenantContext,
  @CurrentUser() user: AuthenticatedUser,
  @Param('id', ParseUUIDPipe) id: string,
  @Res() res: Response,
) {
  const stream = await this.payslipsService.renderPdf(tenantContext.tenant_id, id, user);
  res.set({ 'Content-Type': 'application/pdf' });
  stream.pipe(res);
}
```

The OR-permission decorator is a simplification — the actual approach: `payroll.self_service` users can only download their OWN payslips (service checks); `payroll.view` users can download any.

#### 1d. `GET /v1/payroll/runs/:runId/allowances`

Returns all allowances active during the run period for all staff in the run. Useful for the run-detail page's allowances tab.

```typescript
@Get('runs/:runId/allowances')
@RequiresPermission('payroll.view')
async listRunAllowances(
  @CurrentTenant() tenantContext: TenantContext,
  @Param('runId', ParseUUIDPipe) runId: string,
) {
  return this.payrollAllowancesService.listForRun(tenantContext.tenant_id, runId);
}
```

Service implementation: load the run, compute `period_start`/`period_end`, return all `staff_allowances` where any staff in the run has it active in that range. Flatten with staff name.

#### 1e. `GET /v1/payroll/runs/:runId/adjustments`

Returns all adjustments for entries in the run. Wave 2 implements `payroll-adjustments.service.ts` `listForRun`; this impl exposes it via the controller.

#### 1f. `GET /v1/payroll/runs/:runId/anomalies`

Reads anomalies detected by the finalisation flow's `anomaly.scanRun` call (Wave 2 wired it). Add the controller endpoint:

```typescript
@Get('runs/:runId/anomalies')
@RequiresPermission('payroll.view')
async listRunAnomalies(...) {
  return this.payrollAnomalyService.listForRun(tenantContext.tenant_id, runId);
}
```

#### 1g. `POST /v1/payroll/runs/:runId/anomalies/:anomalyId/acknowledge`

```typescript
@Post('runs/:runId/anomalies/:anomalyId/acknowledge')
@RequiresPermission('payroll.create_run')
async acknowledgeAnomaly(...) {
  return this.payrollAnomalyService.acknowledge(tenantContext.tenant_id, anomalyId, user.user_id);
}
```

#### 1h. `GET /v1/payroll/runs/:runId/comparison`

Compares this run's totals to the prior run for the same tenant. Returns `{ this_run: { gross, net, headcount }, prior_run: {...}, deltas: {...} }`. Service implementation in `payroll-reports.service.ts`.

#### 1i. `GET /v1/payroll/runs/:runId/export-history`

Already exists. Frontend's `/export-logs` call needs to match — Wave 4 fixes the frontend, but verify the existing endpoint shape matches what the frontend expects.

#### 1j. `GET /v1/payroll/staff?pageSize=200`

Returns a flat list of staff members with their current compensation type — used by the compensation page's filter dropdown and similar selectors.

```typescript
@Get('staff')
@RequiresPermission('payroll.view')
async listStaff(
  @CurrentTenant() tenantContext: TenantContext,
  @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
) {
  return this.compensationService.listStaffForPicker(tenantContext.tenant_id, query);
}
```

Returns flat shape: `{ data: [{ id, full_name, employee_number, compensation_type, base_salary | null, per_class_rate | null, currently_active }], meta }`.

### 2. Rename / alias broken endpoints

The audit found several frontend↔backend mismatches. For each, decide the canonical form and add an alias OR deprecate the old form. Strategy: prefer renaming the FRONTEND in Wave 4 to match the existing backend, EXCEPT where the existing backend path is poor or non-RESTful — then update the backend and the frontend.

| Frontend calls                                        | Backend has                                                          | Decision                                                                                                                                                                                |
| ----------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /compensation/import`                           | `POST /compensation/bulk-import`                                     | Backend stays. Wave 4 fixes frontend.                                                                                                                                                   |
| `GET /staff-attendance`                               | `GET /attendance/daily`                                              | Backend stays (matches `payroll-enhanced.controller.ts` namespace). Wave 4 fixes frontend.                                                                                              |
| `POST /staff-attendance/bulk`                         | `POST /attendance/bulk`                                              | Backend stays. Wave 4 fixes frontend.                                                                                                                                                   |
| `PATCH /export-templates/:id`                         | `PUT /export-templates/:id`                                          | Backend ADDS `@Patch` alias method calling the same service. PUT remains canonical for spec; PATCH alias for the redesigned frontend.                                                   |
| `POST /staff-deductions`                              | `POST /deductions`                                                   | Backend stays. Wave 4 fixes frontend. Deductions are tenant-level resources, not staff-bound — `/deductions` is the right path.                                                         |
| `PATCH /class-delivery/:id` (status change)           | `PUT /class-delivery/:id/confirm`                                    | Backend ADDS `@Patch /class-delivery/:id` that accepts `{ status }` and routes to the same confirm path. Both forms work.                                                               |
| `POST /runs/:id/auto-populate-classes`                | `POST /runs/:id/trigger-session-generation`                          | Backend ADDS `@Post('runs/:id/auto-populate-classes')` alias. The user-facing wording should be "auto-populate" — Wave 5 may decide to deprecate the `trigger-session-generation` form. |
| `POST /runs/:id/send-to-accountant`                   | `POST /runs/:runId/email-to-accountant`                              | Backend ADDS `@Post('runs/:id/send-to-accountant')` alias.                                                                                                                              |
| `POST /runs/:id/send-payslips`                        | `POST /runs/:id/mass-export`                                         | Backend ADDS alias.                                                                                                                                                                     |
| `GET /payroll/staff/:id/history`                      | `GET /payroll/reports/staff/:id/history`                             | Backend ADDS alias on `payroll-reports.controller.ts` AND on the root `payroll-runs.controller.ts` so both `/payroll/staff/.../history` and `/payroll/reports/staff/.../history` work.  |
| `GET /payroll/reports/variance` (no runId)            | `GET /payroll/analytics/variance-report/:runId` (runId required)     | Backend ADDS `GET /payroll/reports/variance` taking optional `runId` query (compares latest two runs by default).                                                                       |
| `GET /payroll/reports/forecast`                       | `GET /payroll/analytics/forecast`                                    | Backend ADDS alias `/reports/forecast`.                                                                                                                                                 |
| `GET /payroll/staff-allowances` (no staff_profile_id) | `GET /payroll/staff-allowances?staff_profile_id=...` (UUID required) | Backend ADDS new endpoint `GET /payroll/staff-allowances?include=all` that lists ALL staff allowances tenant-wide (paginated). The existing per-staff form stays.                       |
| `GET /payroll/staff-deductions`                       | `GET /payroll/deductions`                                            | Backend ADDS `GET /payroll/staff-deductions` alias listing deductions tenant-wide.                                                                                                      |
| `GET /payroll/export-logs`                            | (does not exist as listed)                                           | Backend ADDS `GET /payroll/export-logs` returning the full export-history across all runs (paginated, with run + user metadata flattened).                                              |
| `POST /payroll/export-logs/:logId/send`               | (does not exist)                                                     | Backend ADDS endpoint that re-sends an existing export to its configured destinations.                                                                                                  |

The rule: when the audit found a 404, the BACKEND adds the endpoint (or alias). When the audit found a method mismatch (PATCH vs PUT), the BACKEND adds the alias. The FRONTEND will be cleaned up in Wave 4 to use the canonical form, but during the transition, both work.

### 3. Add `@ModuleEnabled('payroll')` to every payroll controller

Every controller class gets the decorator at the class level:

```typescript
@Controller('v1/payroll')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
@ModuleEnabled('payroll')
export class PayrollRunsController { … }
```

Apply to all eight controllers: `payroll-runs`, `payroll-entries`, `payslips`, `payroll-exports`, `payroll-reports`, `payroll-dashboard`, `payroll-enhanced`, `compensation`.

If `ModuleEnabledGuard` doesn't exist yet in this codebase (verify), copy the pattern from any other module that uses it (e.g. inbox).

### 4. Resolve `isSchoolOwner` properly

In `payroll-runs.controller.ts`, replace the hardcoded `checkIsSchoolOwner()` returning `false` with:

```typescript
private async isSchoolOwner(userId: string, tenantId: string): Promise<boolean> {
  // Reuse the same pattern as InboxAdminTierOnlyGuard.
  return this.permissionCache.isOwner(userId, tenantId);
}
```

`PermissionCacheService.isOwner` already exists (per the inbox impl 05 follow-up note). It returns true if the user has any role with `role_key` in the OWNER_TIER_ROLES set. The set includes `school_owner` only for the direct-finalisation path.

If product wants to keep "everyone goes through approval" as the default behaviour, this method can be wired but its result is overridden by tenant settings. Wave 2 decided: `requireApproval = !isSchoolOwner` is the policy. Wave 3 just makes the resolution accurate.

### 5. Backfill new permissions

In `apps/api/src/modules/payroll/payroll-permissions.init.ts` (NEW):

```typescript
@Injectable()
export class PayrollPermissionsInit implements OnModuleInit {
  private readonly logger = new Logger(PayrollPermissionsInit.name);

  constructor(@Inject('PrismaService') private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    // 1. Ensure the two new permissions exist tenant-globally
    const newPermissions = [
      { code: 'payroll.manage_attendance', description: 'Mark and bulk-update staff attendance' },
      { code: 'payroll.self_service', description: 'View own payslips and YTD' },
    ];

    for (const p of newPermissions) {
      await this.prisma.permission.upsert({
        where: { code: p.code },
        create: { code: p.code, description: p.description },
        update: { description: p.description },
      });
    }

    // 2. For every tenant, attach payroll.manage_attendance to admin-tier roles
    //    and payroll.self_service to all roles (since every staff user should be able to see their own).
    const tenants = await this.prisma.tenant.findMany();

    for (const tenant of tenants) {
      await runWithRlsContext(this.prisma, { tenant_id: tenant.id }, async (tx) => {
        const adminRoles = await tx.role.findMany({
          where: {
            tenant_id: tenant.id,
            role_key: { in: ['school_owner', 'principal', 'vice_principal', 'finance', 'hr'] },
          },
        });
        for (const role of adminRoles) {
          await this.attachPermission(tx, role.id, 'payroll.manage_attendance');
        }

        const allRoles = await tx.role.findMany({ where: { tenant_id: tenant.id } });
        for (const role of allRoles) {
          await this.attachPermission(tx, role.id, 'payroll.self_service');
        }
      });
    }

    this.logger.log(`Payroll permissions ensured — ${tenants.length} tenants.`);
  }

  private async attachPermission(
    tx: Prisma.TransactionClient,
    roleId: string,
    permissionCode: string,
  ): Promise<void> {
    const permission = await tx.permission.findFirstOrThrow({ where: { code: permissionCode } });
    await tx.rolePermission.upsert({
      where: { role_id_permission_id: { role_id: roleId, permission_id: permission.id } },
      create: {
        role_id: roleId,
        permission_id: permission.id,
        tenant_id: tx['$tenantId'] /* set by RLS context */,
      },
      update: {},
    });
  }
}
```

Register in `payroll.module.ts` `providers`. The `runWithRlsContext` helper already exists in the codebase (per the inbox impl 02 follow-up note).

### 6. Flatten response shapes — the SEND-pattern fix

The audit confirmed several places where the frontend reads `entry.staff_name` but the backend returns `entry.staff_profile.user.first_name + last_name` nested. The fix is in the controller-layer mapper, not the frontend.

For each controller method that returns `payroll_entry`, `payslip`, `compensation`, `staff_allowance`, `staff_recurring_deduction`, or any record with a staff relation: pass the row through a `mapToDto` helper that adds flat aliases:

```typescript
const mapEntryToDto = (entry: PayrollEntryWithStaff) => ({
  ...entry,
  staff_name: `${entry.staff_profile.user.first_name} ${entry.staff_profile.user.last_name}`.trim(),
  employee_number: entry.staff_profile.employee_number,
  // keep nested for clients that want it
  staff_profile: entry.staff_profile,
});
```

For `payroll-runs.service.ts.listEntries`, the rows passed back to the controller go through this mapper. Same for `payslips.service.ts.list*`, `compensation.service.ts.list`, etc.

Add a regression test asserting that `listEntries` response includes a top-level `staff_name` string for each row.

### 7. Update `payroll-dashboard.service.ts`

The audit found the frontend reads `data.anomalies` and `data.payroll_calendar` from the dashboard response, but the backend returns neither. Add them:

```typescript
async getDashboard(tenantId: string): Promise<DashboardData> {
  // existing fields …
  const latestRun = ...;
  const latestFinalised = ...;
  const costTrend = ...;
  const incompleteEntries = ...;

  // NEW:
  const anomalies = await this.payrollAnomalyService.listOpen(tenantId, { limit: 5 });
  const payrollCalendar = await this.payrollCalendarService.getDashboardSummary(tenantId);

  return {
    latest_run: latestRun,
    latest_finalised: latestFinalised,
    cost_trend: costTrend,                  // ensure each point includes total_allowances now
    incomplete_entries: incompleteEntries,
    anomalies,
    payroll_calendar: payrollCalendar,
    current_draft_id: ...,
  };
}
```

The `cost_trend` points must include `total_allowances` (the chart series the audit found is always flat-zero). Wave 2 made allowance totals available on every entry; Wave 3's dashboard service sums them per period.

### 8. Variance and forecast endpoints — accept optional `runId`

For `GET /payroll/reports/variance`:

```typescript
@Get('reports/variance')
@RequiresPermission('payroll.view_reports')
async getVariance(
  @CurrentTenant() tenantContext: TenantContext,
  @Query('runId') runId?: string,
) {
  // If runId omitted, default to latest finalised run
  return this.payrollReportsService.getVariance(tenantContext.tenant_id, { runId });
}
```

The service computes variance against the prior run (delta of net pay, headcount, allowances total, deductions total). Returns `{ data: VarianceRow[], summary: VarianceSummary }`. Both the frontend's `res.data` and `res.summary` reads work because the response is genuinely two-keyed (no `ResponseTransformInterceptor` wrap due to multi-key).

### 9. Drop the unsafe `as unknown as` cast

In `payroll-calendar.service.ts:154`, the audit found:

```typescript
(settings as unknown as Record<string, Record<string, unknown>>)['payroll'];
```

Replace with proper typed access via the settings service typings. If `SettingsService` doesn't expose typed reads for the `payroll` namespace, add a typed getter:

```typescript
// In SettingsService (or a new payroll-settings.service.ts):
getPayrollSettings(tenantId: string): Promise<PayrollSettings> {
  return this.prisma.tenantSettings.findFirst(...).then(parsed => payrollSettingsSchema.parse(parsed.json));
}
```

Define `payrollSettingsSchema` in `@school/shared/payroll/schemas/`. Wave 5 may add more typed settings; Wave 3 just removes the unsafe cast.

### 10. RLS leakage tests for new endpoints

Every new endpoint added in this impl needs at least one RLS test:

- `tenantA` calls `GET /v1/payroll/my-payslips` → only sees tenantA payslips
- `tenantA` calls `GET /v1/payroll/runs/:runId/allowances` with a runId from tenantB → 404
- `tenantA` calls `POST /v1/payroll/runs/:runId/anomalies/:anomalyId/acknowledge` with cross-tenant ids → 404
- `tenantA` calls `GET /v1/payroll/staff` → only sees tenantA staff

Place these in `apps/api/test/payroll-rls.e2e-spec.ts` (or extend an existing file).

---

## Tests

- Each new endpoint: at least one happy-path test AND one permission-denied test (e.g. user without `payroll.self_service` calling `/my-payslips` → 403).
- `payroll-permissions.init.spec.ts`: assert that on a fresh tenant, the OnModuleInit run grants `payroll.manage_attendance` to admin-tier roles only and `payroll.self_service` to all roles. Re-running is a no-op.
- `payroll-dashboard.service.spec.ts`: assert `getDashboard` returns `anomalies` and `payroll_calendar` keys.
- `payroll-runs.controller.spec.ts`: assert `staff_name` is a top-level string on every entry in `listEntries`.
- `payroll-reports.service.spec.ts`: variance with no runId arg picks the latest finalised run; with explicit runId, computes against the prior run.
- `payroll-calendar.service.spec.ts`: verify the typed-settings access produces the same defaults the previous untyped cast produced (regression guard).
- `isSchoolOwner` test: build a fixture user with the `school_owner` role; assert `permissionCache.isOwner` returns `true`. Build another with `office` role; assert `false`.
- `my-payslips` privacy test: user A with `payroll.self_service` calls `/my-payslips` and only sees their own payslips, never user B's, even if user B's staff_profile_id is in the tenant.

---

## Watch out for

- **Aliases vs duplicates.** When you add a `@Patch` alias to a `@Put` route, you create a method that delegates to the canonical handler. Don't duplicate the body — call the same service method. Otherwise you'll have two implementations diverging.
- **`@RequiresPermission` boolean-OR support.** If `'payroll.view OR payroll.self_service'` isn't supported by the existing decorator, either add the OR support (one-time addition to the decorator) or split into two endpoints. Verify before committing.
- **`ResponseTransformInterceptor` and the variance endpoint.** The frontend reads `res.data` and `res.summary`. The interceptor wraps single-key responses in `{ data }`. When the response has TWO keys (`data` and `summary`), it should pass through unchanged. Verify by testing — if it wraps in `{ data: { data, summary }}`, the interceptor needs an exclude rule. Alternative: shape the response as `{ rows, summary }` to avoid the wrap heuristic.
- **`SequenceService.next` per-period qualifier.** `formatPayslipNumber` requires a per-(period_year, period_month) sequence. Verify the sequence service supports a scope key like `'payslip:202604'` distinct from `'payslip:202605'`. If not, this is a Wave 3 fix on `SequenceService` itself.
- **Existing `payroll-anomaly.service.ts`.** Verify it has `listOpen(tenantId, { limit })` and `listForRun(tenantId, runId)` and `acknowledge(tenantId, anomalyId, userId)` methods. If only some exist, add the missing ones in this impl — it's a thin extension since the storage layer is already there.
- **`payroll.self_service` granted to "all roles"** is a broad permission. The service method enforces "only your own payslips". The permission alone doesn't authorise cross-staff access. Confirm via the privacy test.
- **PDF download path**. The frontend currently uses `window.open(...)` which sends no auth header. Wave 4 will switch to `downloadAuthenticatedPdf(...)`. Wave 3's job is to ensure `GET /payslips/:id/pdf` exists and is properly auth-checked — it'll 401 today (correct behaviour for the broken path), and Wave 4 will fix the call site.
- **Approval module's `markExecuted` and `cancelRequest`.** Wave 2 may have added `markExecuted` already. Verify, and add `cancelRequest(approvalRequestId)` if missing — needed so `cancelRun` can clean up pending approval rows. Both methods are owned by the approvals module; this impl adds them only if Wave 2 didn't.

---

## Deployment notes

This impl restarts the API only.

1. Apply patch.
2. No migration.
3. Build: `pnpm turbo run build --filter=@school/api`.
4. Restart: `pm2 restart api --update-env`.
5. Smoke tests (run as a non-school-owner user with `payroll.create_run`):
   - `GET /api/v1/payroll/dashboard` returns `anomalies` and `payroll_calendar` arrays.
   - `GET /api/v1/payroll/my-payslips` for a logged-in user with `payroll.self_service` returns only their payslips. Do this for two different users on the same tenant; verify isolation.
   - `GET /api/v1/payroll/staff?pageSize=200` returns a flat list with top-level `full_name`.
   - `GET /api/v1/payroll/runs/<finalisedRunId>/allowances` returns the allowances the run captured.
   - `GET /api/v1/payroll/reports/variance` (no runId) returns a comparison of the latest two runs.
   - `PATCH /api/v1/payroll/export-templates/:id` (verb that frontend sends) succeeds.
   - On boot, `pm2 logs api` shows `Payroll permissions ensured — N tenants.`
6. Verify a second-tenant call doesn't leak first-tenant data via any of the new endpoints.
