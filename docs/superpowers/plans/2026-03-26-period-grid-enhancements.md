# Period Grid Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Period Grid from a manual, error-prone configuration tool into an interactive, year-group-aware, auto-generating timetable builder.

**Architecture:** Six enhancements: (1) remove Arabic name field, (2) chain period start times to eliminate gaps, (3) year-group-specific timetables via DB constraint + service filtering, (4) auto-generate period structures from wizard inputs, (5) flexible copy-any-day-to-any-days, (6) copy day(s) across year groups. Backend gets new endpoints (`replace-day`, `copy-year-group`) and existing endpoints get `year_group_id` scoping. Frontend gets three new dialog components extracted into `_components/` to keep the page manageable.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Next.js (App Router), shadcn/ui, Zod, next-intl

---

## File Structure

### Files to Modify

| File | Responsibility |
|------|---------------|
| `packages/prisma/schema.prisma` | Update unique constraints to include `year_group_id` |
| `packages/shared/src/schemas/schedule-period-template.schema.ts` | Update existing + add new Zod schemas |
| `apps/api/src/modules/period-grid/period-grid.service.ts` | Year-group filtering, new methods |
| `apps/api/src/modules/period-grid/period-grid.controller.ts` | Wire year_group_id, add new endpoints |
| `apps/api/src/modules/period-grid/period-grid.service.spec.ts` | Update tests for new signatures |
| `apps/api/src/modules/period-grid/period-grid.controller.spec.ts` | Update controller tests |
| `apps/web/src/app/[locale]/(school)/scheduling/period-grid/page.tsx` | Remove Arabic field, chain times, integrate new dialogs |
| `apps/web/messages/en.json` | New translation keys |
| `apps/web/messages/ar.json` | New translation keys |

### Files to Create

| File | Responsibility |
|------|---------------|
| `packages/prisma/migrations/20260326100000_period_grid_year_group_constraints/migration.sql` | DB migration |
| `apps/web/src/app/[locale]/(school)/scheduling/period-grid/_components/auto-generate-dialog.tsx` | Auto-generate wizard |
| `apps/web/src/app/[locale]/(school)/scheduling/period-grid/_components/copy-day-dialog.tsx` | Flexible copy-day dialog |
| `apps/web/src/app/[locale]/(school)/scheduling/period-grid/_components/copy-year-group-dialog.tsx` | Copy-to-year-groups dialog |

---

## Known Bugs Fixed Along the Way

These pre-existing bugs are in the direct path of the 6 enhancements and must be fixed to make them work:

1. **Frontend copy-day sends wrong field names**: `from_weekday` / `to_weekdays` but schema expects `source_weekday` / `target_weekdays` — copy-day is currently broken
2. **Controller `findAll` ignores `year_group_id`**: query param is accepted but never passed to service
3. **Controller `create` ignores `year_group_id`**: frontend sends it, schema strips it
4. **`copy-year-group` endpoint missing**: frontend calls it, backend 404s

---

## Task 1: Database Migration — Add `year_group_id` to Unique Constraints

**Files:**
- Modify: `packages/prisma/schema.prisma:1888-1890`
- Create: `packages/prisma/migrations/20260326100000_period_grid_year_group_constraints/migration.sql`

**Context:** Currently the unique constraints are `(tenant_id, academic_year_id, weekday, period_order)` and `(tenant_id, academic_year_id, weekday, start_time)`. These prevent different year groups from having their own period grids. We add `year_group_id` to both. Since `year_group_id` is nullable, PostgreSQL treats NULLs as distinct — old data with NULL `year_group_id` won't conflict with new year-group-scoped data.

- [ ] **Step 1: Update Prisma schema unique constraints**

In `packages/prisma/schema.prisma`, find the `SchedulePeriodTemplate` model and update the two `@@unique` directives:

```prisma
  @@unique([tenant_id, academic_year_id, year_group_id, weekday, period_order], name: "idx_schedule_period_templates_order", map: "idx_schedule_period_templates_order")
  @@unique([tenant_id, academic_year_id, year_group_id, weekday, start_time], name: "idx_schedule_period_templates_time", map: "idx_schedule_period_templates_time")
```

- [ ] **Step 2: Generate migration**

```bash
cd packages/prisma
npx prisma migrate dev --name period_grid_year_group_constraints
```

Expected: Migration created. The generated SQL should drop old indexes and create new ones with `year_group_id`.

- [ ] **Step 3: Verify the generated migration SQL**

Read the generated migration file and confirm it contains:

```sql
DROP INDEX "idx_schedule_period_templates_order";
DROP INDEX "idx_schedule_period_templates_time";
CREATE UNIQUE INDEX "idx_schedule_period_templates_order" ON "schedule_period_templates"("tenant_id", "academic_year_id", "year_group_id", "weekday", "period_order");
CREATE UNIQUE INDEX "idx_schedule_period_templates_time" ON "schedule_period_templates"("tenant_id", "academic_year_id", "year_group_id", "weekday", "start_time");
```

- [ ] **Step 4: Regenerate Prisma client**

```bash
npx prisma generate
```

- [ ] **Step 5: Commit**

```bash
git add packages/prisma/schema.prisma packages/prisma/migrations/
git commit -m "feat(period-grid): add year_group_id to unique constraints for per-year-group timetables"
```

---

## Task 2: Update Shared Zod Schemas

**Files:**
- Modify: `packages/shared/src/schemas/schedule-period-template.schema.ts`

**Context:** The `createPeriodTemplateSchema` needs `year_group_id`. The `copyDaySchema` needs `year_group_id`. We also add two new schemas: `replaceDaySchema` for the auto-generate flow and `copyYearGroupSchema`.

- [ ] **Step 1: Update the schema file**

Replace the entire contents of `packages/shared/src/schemas/schedule-period-template.schema.ts`:

```typescript
import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createPeriodTemplateSchema = z.object({
  academic_year_id: z.string().uuid(),
  year_group_id: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  period_name: z.string().min(1).max(50),
  period_name_ar: z.string().max(50).nullable().optional(),
  period_order: z.number().int().min(0),
  start_time: z.string().regex(timeRegex, 'Must be HH:mm format'),
  end_time: z.string().regex(timeRegex, 'Must be HH:mm format'),
  schedule_period_type: z.enum(['teaching', 'break_supervision', 'assembly', 'lunch_duty', 'free']).default('teaching'),
  supervision_mode: z.enum(['none', 'yard', 'classroom_previous', 'classroom_next']).default('none').optional(),
  break_group_id: z.string().uuid().nullable().optional(),
});

export type CreatePeriodTemplateDto = z.infer<typeof createPeriodTemplateSchema>;

export const updatePeriodTemplateSchema = z.object({
  period_name: z.string().min(1).max(50).optional(),
  period_name_ar: z.string().max(50).nullable().optional(),
  period_order: z.number().int().min(0).optional(),
  start_time: z.string().regex(timeRegex, 'Must be HH:mm format').optional(),
  end_time: z.string().regex(timeRegex, 'Must be HH:mm format').optional(),
  schedule_period_type: z.enum(['teaching', 'break_supervision', 'assembly', 'lunch_duty', 'free']).optional(),
  supervision_mode: z.enum(['none', 'yard', 'classroom_previous', 'classroom_next']).optional(),
  break_group_id: z.string().uuid().nullable().optional(),
});

export type UpdatePeriodTemplateDto = z.infer<typeof updatePeriodTemplateSchema>;

export const copyDaySchema = z.object({
  academic_year_id: z.string().uuid(),
  year_group_id: z.string().uuid(),
  source_weekday: z.number().int().min(0).max(6),
  target_weekdays: z.array(z.number().int().min(0).max(6)).min(1),
});

export type CopyDayDto = z.infer<typeof copyDaySchema>;

const replaceDayPeriodSchema = z.object({
  period_name: z.string().min(1).max(50),
  start_time: z.string().regex(timeRegex, 'Must be HH:mm format'),
  end_time: z.string().regex(timeRegex, 'Must be HH:mm format'),
  schedule_period_type: z.enum(['teaching', 'break_supervision', 'assembly', 'lunch_duty', 'free']),
});

export const replaceDaySchema = z.object({
  academic_year_id: z.string().uuid(),
  year_group_id: z.string().uuid(),
  weekday: z.number().int().min(0).max(6),
  periods: z.array(replaceDayPeriodSchema).min(1),
});

export type ReplaceDayDto = z.infer<typeof replaceDaySchema>;

export const copyYearGroupSchema = z.object({
  academic_year_id: z.string().uuid(),
  source_year_group_id: z.string().uuid(),
  target_year_group_ids: z.array(z.string().uuid()).min(1),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).optional(),
});

export type CopyYearGroupDto = z.infer<typeof copyYearGroupSchema>;
```

- [ ] **Step 2: Verify the shared package exports the new types**

Check `packages/shared/src/schemas/index.ts` — ensure `schedule-period-template.schema` is re-exported. If it already is, no change needed. If not, add:

```typescript
export * from './schedule-period-template.schema';
```

Also check `packages/shared/src/types/schedule-period-template.ts` for any type re-exports needed.

- [ ] **Step 3: Run type-check**

```bash
cd packages/shared && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/
git commit -m "feat(shared): add year_group_id to period grid schemas, add replace-day and copy-year-group schemas"
```

---

## Task 3: Update Backend Service — Year-Group Scoping

**Files:**
- Modify: `apps/api/src/modules/period-grid/period-grid.service.ts`

**Context:** Three existing methods need `year_group_id` support: `findAll`, `create`, `copyDay`. We also need to handle `supervision_mode` and `break_group_id` in `create`/`update` since they exist in the DB but were never wired through.

- [ ] **Step 1: Update `findAll` to accept and filter by `yearGroupId`**

```typescript
async findAll(tenantId: string, academicYearId: string, yearGroupId?: string) {
  const where: Record<string, unknown> = {
    tenant_id: tenantId,
    academic_year_id: academicYearId,
  };
  if (yearGroupId) {
    where['year_group_id'] = yearGroupId;
  }

  const data = await this.prisma.schedulePeriodTemplate.findMany({
    where,
    orderBy: [{ weekday: 'asc' }, { period_order: 'asc' }],
  });

  return data.map((p) => this.formatPeriod(p));
}
```

- [ ] **Step 2: Update `create` to include `year_group_id`, `supervision_mode`, `break_group_id`**

In the `create` method, update the `data` object inside the transaction:

```typescript
return db.schedulePeriodTemplate.create({
  data: {
    tenant_id: tenantId,
    academic_year_id: dto.academic_year_id,
    year_group_id: dto.year_group_id,
    weekday: dto.weekday,
    period_name: dto.period_name,
    period_name_ar: dto.period_name_ar ?? null,
    period_order: dto.period_order,
    start_time: this.timeToDate(dto.start_time),
    end_time: this.timeToDate(dto.end_time),
    schedule_period_type: dto.schedule_period_type ?? 'teaching',
    supervision_mode: dto.supervision_mode ?? 'none',
    break_group_id: dto.break_group_id ?? null,
  },
});
```

- [ ] **Step 3: Update `update` to handle `supervision_mode` and `break_group_id`**

Add these lines to the `updateData` building block in the `update` method:

```typescript
if (dto.supervision_mode !== undefined) updateData.supervision_mode = dto.supervision_mode;
if (dto.break_group_id !== undefined) updateData.break_group_id = dto.break_group_id;
```

- [ ] **Step 4: Update `copyDay` to scope by `year_group_id`**

Update the `copyDay` method. The `dto` now includes `year_group_id`. Update the source query and creation:

```typescript
async copyDay(tenantId: string, dto: CopyDayDto) {
  const sourcePeriods = await this.prisma.schedulePeriodTemplate.findMany({
    where: {
      tenant_id: tenantId,
      academic_year_id: dto.academic_year_id,
      year_group_id: dto.year_group_id,
      weekday: dto.source_weekday,
    },
    orderBy: { period_order: 'asc' },
  });

  if (sourcePeriods.length === 0) {
    throw new NotFoundException({
      code: 'SOURCE_DAY_EMPTY',
      message: `No periods found for weekday ${dto.source_weekday}`,
    });
  }

  const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

  const results = await prismaWithRls.$transaction(async (tx) => {
    const db = tx as unknown as PrismaService;
    const created: Array<Record<string, unknown>> = [];
    const skipped: number[] = [];

    for (const targetWeekday of dto.target_weekdays) {
      // Delete existing periods for target day first
      await db.schedulePeriodTemplate.deleteMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: dto.academic_year_id,
          year_group_id: dto.year_group_id,
          weekday: targetWeekday,
        },
      });

      for (const period of sourcePeriods) {
        const newPeriod = await db.schedulePeriodTemplate.create({
          data: {
            tenant_id: tenantId,
            academic_year_id: dto.academic_year_id,
            year_group_id: dto.year_group_id,
            weekday: targetWeekday,
            period_name: period.period_name,
            period_name_ar: period.period_name_ar,
            period_order: period.period_order,
            start_time: period.start_time,
            end_time: period.end_time,
            schedule_period_type: period.schedule_period_type,
            supervision_mode: period.supervision_mode,
            break_group_id: period.break_group_id,
          },
        });
        created.push(this.formatPeriod(newPeriod));
      }
    }

    return { created, skipped };
  });

  return results;
}
```

- [ ] **Step 5: Run type-check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: No errors (may have errors from controller not yet updated — acceptable at this stage).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/period-grid/period-grid.service.ts
git commit -m "feat(period-grid): scope findAll, create, copyDay by year_group_id"
```

---

## Task 4: Backend Service — New Methods (`replaceDay`, `copyYearGroup`)

**Files:**
- Modify: `apps/api/src/modules/period-grid/period-grid.service.ts`

- [ ] **Step 1: Add `replaceDay` method**

Add this method to `PeriodGridService`. This is used by the auto-generate wizard — the frontend computes the periods, sends them here, and this method atomically replaces the day's grid.

```typescript
async replaceDay(tenantId: string, dto: ReplaceDayDto) {
  const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

  return prismaWithRls.$transaction(async (tx) => {
    const db = tx as unknown as PrismaService;

    // Delete all existing periods for this day + year group
    await db.schedulePeriodTemplate.deleteMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: dto.academic_year_id,
        year_group_id: dto.year_group_id,
        weekday: dto.weekday,
      },
    });

    // Create new periods in order
    const created: Array<Record<string, unknown>> = [];
    for (let i = 0; i < dto.periods.length; i++) {
      const p = dto.periods[i]!;

      if (p.start_time >= p.end_time) {
        throw new BadRequestException({
          code: 'INVALID_TIME_RANGE',
          message: `Period ${i + 1}: end_time must be after start_time`,
        });
      }

      const record = await db.schedulePeriodTemplate.create({
        data: {
          tenant_id: tenantId,
          academic_year_id: dto.academic_year_id,
          year_group_id: dto.year_group_id,
          weekday: dto.weekday,
          period_name: p.period_name,
          period_order: i + 1,
          start_time: this.timeToDate(p.start_time),
          end_time: this.timeToDate(p.end_time),
          schedule_period_type: p.schedule_period_type,
        },
      });
      created.push(this.formatPeriod(record));
    }

    return { created, count: created.length };
  });
}
```

- [ ] **Step 2: Add `copyYearGroup` method**

```typescript
async copyYearGroup(tenantId: string, dto: CopyYearGroupDto) {
  const whereSource: Record<string, unknown> = {
    tenant_id: tenantId,
    academic_year_id: dto.academic_year_id,
    year_group_id: dto.source_year_group_id,
  };
  if (dto.weekdays && dto.weekdays.length > 0) {
    whereSource['weekday'] = { in: dto.weekdays };
  }

  const sourcePeriods = await this.prisma.schedulePeriodTemplate.findMany({
    where: whereSource,
    orderBy: [{ weekday: 'asc' }, { period_order: 'asc' }],
  });

  if (sourcePeriods.length === 0) {
    throw new NotFoundException({
      code: 'SOURCE_YEAR_GROUP_EMPTY',
      message: 'No periods found for the source year group',
    });
  }

  const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

  return prismaWithRls.$transaction(async (tx) => {
    const db = tx as unknown as PrismaService;
    let totalCreated = 0;

    for (const targetYgId of dto.target_year_group_ids) {
      // Delete existing periods for target year group (scoped to weekdays if specified)
      const deleteWhere: Record<string, unknown> = {
        tenant_id: tenantId,
        academic_year_id: dto.academic_year_id,
        year_group_id: targetYgId,
      };
      if (dto.weekdays && dto.weekdays.length > 0) {
        deleteWhere['weekday'] = { in: dto.weekdays };
      }
      await db.schedulePeriodTemplate.deleteMany({ where: deleteWhere });

      // Copy each period
      for (const period of sourcePeriods) {
        await db.schedulePeriodTemplate.create({
          data: {
            tenant_id: tenantId,
            academic_year_id: dto.academic_year_id,
            year_group_id: targetYgId,
            weekday: period.weekday,
            period_name: period.period_name,
            period_name_ar: period.period_name_ar,
            period_order: period.period_order,
            start_time: period.start_time,
            end_time: period.end_time,
            schedule_period_type: period.schedule_period_type,
            supervision_mode: period.supervision_mode,
            break_group_id: period.break_group_id,
          },
        });
        totalCreated++;
      }
    }

    return {
      copied: totalCreated,
      target_year_groups: dto.target_year_group_ids.length,
    };
  });
}
```

- [ ] **Step 3: Add the new DTO imports at the top of the service file**

```typescript
import type {
  CopyDayDto,
  CopyYearGroupDto,
  CreatePeriodTemplateDto,
  ReplaceDayDto,
  UpdatePeriodTemplateDto,
} from '@school/shared';
```

- [ ] **Step 4: Run type-check**

```bash
cd apps/api && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/period-grid/period-grid.service.ts
git commit -m "feat(period-grid): add replaceDay and copyYearGroup service methods"
```

---

## Task 5: Update Backend Controller

**Files:**
- Modify: `apps/api/src/modules/period-grid/period-grid.controller.ts`

- [ ] **Step 1: Update imports**

Add the new schema and DTO imports:

```typescript
import {
  copyDaySchema,
  copyYearGroupSchema,
  createPeriodTemplateSchema,
  replaceDaySchema,
  updatePeriodTemplateSchema,
} from '@school/shared';
import type {
  CopyDayDto,
  CopyYearGroupDto,
  CreatePeriodTemplateDto,
  ReplaceDayDto,
  UpdatePeriodTemplateDto,
} from '@school/shared';
```

- [ ] **Step 2: Update `findAll` to pass `year_group_id` to service**

```typescript
@Get()
@RequiresPermission('schedule.configure_period_grid', 'schedule.view_own')
async findAll(
  @CurrentTenant() tenant: { tenant_id: string },
  @Query(new ZodValidationPipe(listPeriodGridQuerySchema))
  query: z.infer<typeof listPeriodGridQuerySchema>,
) {
  return this.periodGridService.findAll(tenant.tenant_id, query.academic_year_id, query.year_group_id);
}
```

- [ ] **Step 3: Add `replace-day` endpoint**

Add this method to the controller (place it BEFORE the `:id` routes to avoid route conflicts):

```typescript
@Post('replace-day')
@RequiresPermission('schedule.configure_period_grid')
@HttpCode(HttpStatus.OK)
async replaceDay(
  @CurrentTenant() tenant: { tenant_id: string },
  @Body(new ZodValidationPipe(replaceDaySchema)) dto: ReplaceDayDto,
) {
  return this.periodGridService.replaceDay(tenant.tenant_id, dto);
}
```

- [ ] **Step 4: Add `copy-year-group` endpoint**

```typescript
@Post('copy-year-group')
@RequiresPermission('schedule.configure_period_grid')
@HttpCode(HttpStatus.OK)
async copyYearGroup(
  @CurrentTenant() tenant: { tenant_id: string },
  @Body(new ZodValidationPipe(copyYearGroupSchema)) dto: CopyYearGroupDto,
) {
  return this.periodGridService.copyYearGroup(tenant.tenant_id, dto);
}
```

- [ ] **Step 5: Run type-check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/period-grid/period-grid.controller.ts
git commit -m "feat(period-grid): wire year_group_id, add replace-day and copy-year-group endpoints"
```

---

## Task 6: Update Backend Tests

**Files:**
- Modify: `apps/api/src/modules/period-grid/period-grid.service.spec.ts`

- [ ] **Step 1: Update `findAll` test to pass `yearGroupId`**

```typescript
it('should return formatted periods for a tenant, academic year, and year group', async () => {
  const YEAR_GROUP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([
    {
      id: PERIOD_ID,
      weekday: 1,
      period_order: 1,
      start_time: new Date('1970-01-01T08:00:00.000Z'),
      end_time: new Date('1970-01-01T08:45:00.000Z'),
    },
  ]);

  const result = await service.findAll(TENANT_ID, ACADEMIC_YEAR_ID, YEAR_GROUP_ID);

  expect(result).toHaveLength(1);
  expect(result[0]!['start_time']).toBe('08:00');
  expect(mockPrisma.schedulePeriodTemplate.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ year_group_id: YEAR_GROUP_ID }),
    }),
  );
});
```

- [ ] **Step 2: Update `create` test DTOs to include `year_group_id`**

For every create test, add `year_group_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd'` to the dto object.

- [ ] **Step 3: Add test for `replaceDay`**

```typescript
it('should delete existing periods and create new ones for a day', async () => {
  const YEAR_GROUP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
    createRlsClient: jest.Mock;
  };
  const mockTx = {
    schedulePeriodTemplate: {
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      create: jest.fn()
        .mockResolvedValueOnce({
          id: 'new-1',
          weekday: 1,
          period_order: 1,
          start_time: new Date('1970-01-01T08:00:00.000Z'),
          end_time: new Date('1970-01-01T09:00:00.000Z'),
        })
        .mockResolvedValueOnce({
          id: 'new-2',
          weekday: 1,
          period_order: 2,
          start_time: new Date('1970-01-01T09:00:00.000Z'),
          end_time: new Date('1970-01-01T10:00:00.000Z'),
        }),
    },
  };
  createRlsClient.mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  });

  const result = await service.replaceDay(TENANT_ID, {
    academic_year_id: ACADEMIC_YEAR_ID,
    year_group_id: YEAR_GROUP_ID,
    weekday: 1,
    periods: [
      { period_name: 'Period 1', start_time: '08:00', end_time: '09:00', schedule_period_type: 'teaching' },
      { period_name: 'Period 2', start_time: '09:00', end_time: '10:00', schedule_period_type: 'teaching' },
    ],
  });

  expect(mockTx.schedulePeriodTemplate.deleteMany).toHaveBeenCalled();
  expect(result.count).toBe(2);
});
```

- [ ] **Step 4: Add test for `replaceDay` with invalid time range**

```typescript
it('should throw BadRequestException when replace-day period has invalid time range', async () => {
  const YEAR_GROUP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
    createRlsClient: jest.Mock;
  };
  const mockTx = {
    schedulePeriodTemplate: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  createRlsClient.mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  });

  await expect(
    service.replaceDay(TENANT_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      year_group_id: YEAR_GROUP_ID,
      weekday: 1,
      periods: [
        { period_name: 'Bad', start_time: '10:00', end_time: '09:00', schedule_period_type: 'teaching' },
      ],
    }),
  ).rejects.toThrow(BadRequestException);
});
```

- [ ] **Step 5: Add test for `copyYearGroup`**

```typescript
it('should copy periods from one year group to others', async () => {
  const SOURCE_YG = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const TARGET_YG = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([
    {
      id: 'src-1',
      weekday: 1,
      period_order: 1,
      period_name: 'Period 1',
      period_name_ar: null,
      start_time: new Date('1970-01-01T08:00:00.000Z'),
      end_time: new Date('1970-01-01T09:00:00.000Z'),
      schedule_period_type: 'teaching',
      supervision_mode: 'none',
      break_group_id: null,
    },
  ]);

  const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
    createRlsClient: jest.Mock;
  };
  const mockTx = {
    schedulePeriodTemplate: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({ id: 'new-1' }),
    },
  };
  createRlsClient.mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  });

  const result = await service.copyYearGroup(TENANT_ID, {
    academic_year_id: ACADEMIC_YEAR_ID,
    source_year_group_id: SOURCE_YG,
    target_year_group_ids: [TARGET_YG],
  });

  expect(result.copied).toBe(1);
  expect(result.target_year_groups).toBe(1);
});
```

- [ ] **Step 6: Add test for `copyYearGroup` with empty source**

```typescript
it('should throw NotFoundException when source year group has no periods', async () => {
  mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([]);

  await expect(
    service.copyYearGroup(TENANT_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      source_year_group_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      target_year_group_ids: ['eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'],
    }),
  ).rejects.toThrow(NotFoundException);
});
```

- [ ] **Step 7: Run tests**

```bash
cd apps/api && npx jest --testPathPattern="period-grid" --verbose
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/period-grid/
git commit -m "test(period-grid): update tests for year_group_id scoping, add replaceDay and copyYearGroup tests"
```

---

## Task 7: Add Translation Keys

**Files:**
- Modify: `apps/web/messages/en.json` (scheduling.v2 section)
- Modify: `apps/web/messages/ar.json` (scheduling.v2 section)

- [ ] **Step 1: Add English keys to the `scheduling.v2` section**

Add these keys inside the `scheduling.v2` object in `en.json`:

```json
"autoGenerate": "Auto-Generate",
"autoGenerateTitle": "Auto-Generate Period Structure",
"autoGenerateDesc": "Automatically create a day's period structure based on your school timings.",
"schoolStartTime": "School Start Time",
"schoolEndTime": "School End Time",
"periodDuration": "Period Duration",
"customDuration": "Custom Duration (minutes)",
"uniformDuration": "All periods same duration",
"mixedDuration": "Mixed durations",
"addDurationGroup": "Add Duration",
"removeDurationGroup": "Remove",
"periodsCount": "periods",
"smallBreak": "Small Break",
"smallBreakAfter": "After period",
"smallBreakDuration": "Break duration",
"mainBreak": "Main Break",
"mainBreakAfter": "After period",
"mainBreakDuration": "Break duration",
"preview": "Preview",
"applyToDay": "Apply",
"totalTeaching": "Teaching time",
"totalBreak": "Break time",
"remainingTime": "remaining until school end",
"exceedsEndTime": "Generated periods exceed the school end time",
"noPeriodsGenerated": "No periods could be generated with these settings",
"generatedSuccessfully": "Period structure generated successfully",
"copyDayTitle": "Copy Day Structure",
"copyDayDesc": "Copy the period structure from one day to other days.",
"sourceDay": "Copy from",
"targetDays": "Copy to",
"selectTargetDays": "Select target days",
"daysCopied": "Day structure copied successfully",
"copyToYearGroupsTitle": "Copy to Year Groups",
"copyToYearGroupsDesc": "Copy period structure to other year groups.",
"selectSourceDay": "Select day (or all days)",
"allDays": "All Days",
"targetYearGroups": "Target Year Groups",
"selectTargetYearGroups": "Select year groups",
"yearGroupsCopied": "Period structure copied to year groups",
"minutes": "min",
"durationPresets": {
  "40": "40 min",
  "45": "45 min",
  "60": "60 min",
  "90": "90 min",
  "120": "120 min",
  "custom": "Custom"
}
```

- [ ] **Step 2: Add Arabic keys to the `scheduling.v2` section**

Add the corresponding Arabic translations in `ar.json`. Key examples:

```json
"autoGenerate": "إنشاء تلقائي",
"autoGenerateTitle": "إنشاء هيكل الحصص تلقائياً",
"autoGenerateDesc": "إنشاء هيكل الحصص ليوم كامل بناءً على أوقات المدرسة.",
"schoolStartTime": "وقت بدء الدوام",
"schoolEndTime": "وقت انتهاء الدوام",
"periodDuration": "مدة الحصة",
"customDuration": "مدة مخصصة (دقائق)",
"uniformDuration": "جميع الحصص بنفس المدة",
"mixedDuration": "مدد مختلفة",
"addDurationGroup": "إضافة مدة",
"removeDurationGroup": "حذف",
"periodsCount": "حصص",
"smallBreak": "استراحة قصيرة",
"smallBreakAfter": "بعد الحصة",
"smallBreakDuration": "مدة الاستراحة",
"mainBreak": "الاستراحة الرئيسية",
"mainBreakAfter": "بعد الحصة",
"mainBreakDuration": "مدة الاستراحة",
"preview": "معاينة",
"applyToDay": "تطبيق",
"totalTeaching": "وقت التدريس",
"totalBreak": "وقت الاستراحة",
"remainingTime": "متبقي حتى نهاية الدوام",
"exceedsEndTime": "الحصص المولدة تتجاوز وقت انتهاء الدوام",
"noPeriodsGenerated": "لا يمكن إنشاء حصص بهذه الإعدادات",
"generatedSuccessfully": "تم إنشاء هيكل الحصص بنجاح",
"copyDayTitle": "نسخ هيكل اليوم",
"copyDayDesc": "نسخ هيكل الحصص من يوم إلى أيام أخرى.",
"sourceDay": "نسخ من",
"targetDays": "نسخ إلى",
"selectTargetDays": "اختر الأيام المستهدفة",
"daysCopied": "تم نسخ هيكل اليوم بنجاح",
"copyToYearGroupsTitle": "نسخ إلى المجموعات السنوية",
"copyToYearGroupsDesc": "نسخ هيكل الحصص إلى مجموعات سنوية أخرى.",
"selectSourceDay": "اختر اليوم (أو كل الأيام)",
"allDays": "كل الأيام",
"targetYearGroups": "المجموعات السنوية المستهدفة",
"selectTargetYearGroups": "اختر المجموعات السنوية",
"yearGroupsCopied": "تم نسخ هيكل الحصص إلى المجموعات السنوية",
"minutes": "دقيقة",
"durationPresets": {
  "40": "40 دقيقة",
  "45": "45 دقيقة",
  "60": "60 دقيقة",
  "90": "90 دقيقة",
  "120": "120 دقيقة",
  "custom": "مخصص"
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/messages/
git commit -m "feat(i18n): add period grid enhancement translation keys"
```

---

## Task 8: Frontend — Remove Arabic Name + Chain Start Times

**Files:**
- Modify: `apps/web/src/app/[locale]/(school)/scheduling/period-grid/page.tsx`

**Context:** Two changes in the existing dialog: (1) remove the `period_name_ar` input entirely, (2) when adding a period to a day that already has periods, lock the start_time to the previous period's end_time.

- [ ] **Step 1: Remove `name_ar` from `EditState` interface and `EMPTY_EDIT`**

Remove `name_ar: string` from `EditState`. Remove `name_ar: ''` from `EMPTY_EDIT`. Remove `name_ar` from `openEdit` mapping.

Updated `EditState`:

```typescript
interface EditState {
  id: string | null;
  weekday: number;
  name: string;
  start_time: string;
  end_time: string;
  period_type: PeriodType;
  supervision_mode: SupervisionMode;
  break_group_id: string;
  start_time_locked: boolean;
}
```

Updated `EMPTY_EDIT`:

```typescript
const EMPTY_EDIT: EditState = {
  id: null,
  weekday: 1,
  name: '',
  start_time: '08:00',
  end_time: '09:00',
  period_type: 'teaching',
  supervision_mode: 'none',
  break_group_id: '',
  start_time_locked: false,
};
```

- [ ] **Step 2: Update `openAdd` to chain start times**

```typescript
const openAdd = (weekday: number) => {
  const dayPeriods = periodsForDay(weekday);
  const lastPeriod = dayPeriods[dayPeriods.length - 1];
  const startTime = lastPeriod ? lastPeriod.end_time : '08:00';
  const isLocked = !!lastPeriod;

  // Calculate default end time: start + 60 minutes
  const [h, m] = startTime.split(':').map(Number);
  const endMinutes = (h! * 60 + m! + 60);
  const endH = String(Math.floor(endMinutes / 60)).padStart(2, '0');
  const endM = String(endMinutes % 60).padStart(2, '0');
  const endTime = `${endH}:${endM}`;

  setEditState({
    ...EMPTY_EDIT,
    weekday,
    start_time: startTime,
    end_time: endTime,
    start_time_locked: isLocked,
  });
  setEditOpen(true);
};
```

- [ ] **Step 3: Update `openEdit` — remove `name_ar`, set `start_time_locked`**

```typescript
const openEdit = (period: PeriodSlot) => {
  const dayPeriods = periodsForDay(period.weekday);
  const isFirstPeriod = dayPeriods[0]?.id === period.id;

  setEditState({
    id: period.id,
    weekday: period.weekday,
    name: period.period_name,
    start_time: period.start_time,
    end_time: period.end_time,
    period_type: period.schedule_period_type,
    supervision_mode: period.supervision_mode,
    break_group_id: period.break_group_id ?? '',
    start_time_locked: !isFirstPeriod,
  });
  setEditOpen(true);
};
```

- [ ] **Step 4: Update `handleSave` — remove `period_name_ar`**

In the `body` object construction:

```typescript
const body: Record<string, unknown> = {
  period_name: editState.name,
  start_time: editState.start_time,
  end_time: editState.end_time,
  schedule_period_type: editState.period_type,
  supervision_mode: isBreakType ? editState.supervision_mode : 'none',
  break_group_id: editState.supervision_mode === 'yard' ? editState.break_group_id || null : null,
};
```

And in the POST (create) body, add `year_group_id`:

```typescript
await apiClient('/api/v1/period-grid', {
  method: 'POST',
  body: JSON.stringify({
    ...body,
    academic_year_id: selectedYear,
    year_group_id: selectedYearGroup,
    weekday: editState.weekday,
    period_order: dayPeriods.length + 1,
  }),
});
```

- [ ] **Step 5: Update the dialog JSX**

Replace the name inputs section (the `grid grid-cols-2` with period name + Arabic name) with a single full-width input:

```tsx
<div className="space-y-1.5">
  <Label>{t('auto.periodName')}</Label>
  <Input
    value={editState.name}
    onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
    placeholder="e.g. Period 1"
  />
</div>
```

Update the time inputs — make `start_time` conditionally readonly:

```tsx
<div className="grid grid-cols-2 gap-3">
  <div className="space-y-1.5">
    <Label>{t('startTime')}</Label>
    <Input
      type="time"
      value={editState.start_time}
      onChange={(e) => setEditState((s) => ({ ...s, start_time: e.target.value }))}
      disabled={editState.start_time_locked}
      className={editState.start_time_locked ? 'opacity-60' : ''}
    />
    {editState.start_time_locked && (
      <p className="text-[10px] text-text-tertiary">{tv('linkedToPrevious') ?? 'Linked to previous period'}</p>
    )}
  </div>
  <div className="space-y-1.5">
    <Label>{t('endTime')}</Label>
    <Input
      type="time"
      value={editState.end_time}
      onChange={(e) => setEditState((s) => ({ ...s, end_time: e.target.value }))}
    />
  </div>
</div>
```

- [ ] **Step 6: Verify the build**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/[locale]/(school)/scheduling/period-grid/page.tsx
git commit -m "feat(period-grid): remove Arabic name field, chain period start times"
```

---

## Task 9: Frontend — Auto-Generate Wizard Dialog

**Files:**
- Create: `apps/web/src/app/[locale]/(school)/scheduling/period-grid/_components/auto-generate-dialog.tsx`
- Modify: `apps/web/src/app/[locale]/(school)/scheduling/period-grid/page.tsx` (import + wire)

**Context:** This dialog lets the user specify school start/end, period durations, break timings, and generates a full day's structure with a live preview. Generation logic runs client-side; on "Apply", it calls `POST /api/v1/period-grid/replace-day`.

- [ ] **Step 1: Create the auto-generate dialog component**

Create `apps/web/src/app/[locale]/(school)/scheduling/period-grid/_components/auto-generate-dialog.tsx`:

```tsx
'use client';

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';
import { Plus, Trash2, Wand2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DurationGroup {
  duration: number;
  count: number;
}

interface GeneratedPeriod {
  period_name: string;
  start_time: string;
  end_time: string;
  schedule_period_type: 'teaching' | 'break_supervision' | 'lunch_duty' | 'assembly' | 'free';
}

interface AutoGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academicYearId: string;
  yearGroupId: string;
  weekday: number;
  weekdayLabel: string;
  onGenerated: () => void;
}

const DURATION_PRESETS = [40, 45, 60, 90, 120] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h! * 60 + m! + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h! * 60 + m!;
}

function generatePeriods(config: {
  startTime: string;
  endTime: string;
  isUniform: boolean;
  uniformDuration: number;
  durationGroups: DurationGroup[];
  hasSmallBreak: boolean;
  smallBreakAfter: number;
  smallBreakDuration: number;
  hasMainBreak: boolean;
  mainBreakAfter: number;
  mainBreakDuration: number;
}): GeneratedPeriod[] {
  const periods: GeneratedPeriod[] = [];
  let currentTime = config.startTime;
  const endMinutes = timeToMinutes(config.endTime);

  // Build the ordered list of period durations
  const durations: number[] = [];
  if (config.isUniform) {
    // Calculate how many periods fit
    let availableMinutes = endMinutes - timeToMinutes(config.startTime);
    if (config.hasSmallBreak) availableMinutes -= config.smallBreakDuration;
    if (config.hasMainBreak) availableMinutes -= config.mainBreakDuration;
    const count = Math.floor(availableMinutes / config.uniformDuration);
    for (let i = 0; i < count; i++) durations.push(config.uniformDuration);
  } else {
    for (const group of config.durationGroups) {
      for (let i = 0; i < group.count; i++) durations.push(group.duration);
    }
  }

  let teachingIndex = 0;
  for (let i = 0; i < durations.length; i++) {
    // Insert small break if needed
    if (config.hasSmallBreak && teachingIndex === config.smallBreakAfter) {
      const breakEnd = addMinutes(currentTime, config.smallBreakDuration);
      if (timeToMinutes(breakEnd) > endMinutes) break;
      periods.push({
        period_name: 'Break',
        start_time: currentTime,
        end_time: breakEnd,
        schedule_period_type: 'break_supervision',
      });
      currentTime = breakEnd;
    }

    // Insert main break if needed
    if (config.hasMainBreak && teachingIndex === config.mainBreakAfter) {
      const breakEnd = addMinutes(currentTime, config.mainBreakDuration);
      if (timeToMinutes(breakEnd) > endMinutes) break;
      periods.push({
        period_name: 'Lunch',
        start_time: currentTime,
        end_time: breakEnd,
        schedule_period_type: 'lunch_duty',
      });
      currentTime = breakEnd;
    }

    const periodEnd = addMinutes(currentTime, durations[i]!);
    if (timeToMinutes(periodEnd) > endMinutes) break;

    teachingIndex++;
    periods.push({
      period_name: `Period ${teachingIndex}`,
      start_time: currentTime,
      end_time: periodEnd,
      schedule_period_type: 'teaching',
    });
    currentTime = periodEnd;
  }

  // If breaks come after all teaching periods (edge case)
  if (config.hasSmallBreak && teachingIndex === config.smallBreakAfter && timeToMinutes(currentTime) < endMinutes) {
    const breakEnd = addMinutes(currentTime, config.smallBreakDuration);
    if (timeToMinutes(breakEnd) <= endMinutes) {
      periods.push({
        period_name: 'Break',
        start_time: currentTime,
        end_time: breakEnd,
        schedule_period_type: 'break_supervision',
      });
    }
  }
  if (config.hasMainBreak && teachingIndex === config.mainBreakAfter && timeToMinutes(currentTime) < endMinutes) {
    const breakEnd = addMinutes(currentTime, config.mainBreakDuration);
    if (timeToMinutes(breakEnd) <= endMinutes) {
      periods.push({
        period_name: 'Lunch',
        start_time: currentTime,
        end_time: breakEnd,
        schedule_period_type: 'lunch_duty',
      });
    }
  }

  return periods;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AutoGenerateDialog({
  open,
  onOpenChange,
  academicYearId,
  yearGroupId,
  weekday,
  weekdayLabel,
  onGenerated,
}: AutoGenerateDialogProps) {
  const tv = useTranslations('scheduling.v2');
  const tc = useTranslations('common');

  const [startTime, setStartTime] = React.useState('08:00');
  const [endTime, setEndTime] = React.useState('15:00');
  const [isUniform, setIsUniform] = React.useState(true);
  const [uniformDuration, setUniformDuration] = React.useState(60);
  const [customDuration, setCustomDuration] = React.useState(50);
  const [useCustom, setUseCustom] = React.useState(false);
  const [durationGroups, setDurationGroups] = React.useState<DurationGroup[]>([
    { duration: 60, count: 3 },
    { duration: 45, count: 2 },
  ]);
  const [hasSmallBreak, setHasSmallBreak] = React.useState(true);
  const [smallBreakAfter, setSmallBreakAfter] = React.useState(3);
  const [smallBreakDuration, setSmallBreakDuration] = React.useState(15);
  const [hasMainBreak, setHasMainBreak] = React.useState(true);
  const [mainBreakAfter, setMainBreakAfter] = React.useState(5);
  const [mainBreakDuration, setMainBreakDuration] = React.useState(30);
  const [isSaving, setIsSaving] = React.useState(false);

  const effectiveDuration = useCustom ? customDuration : uniformDuration;

  const preview = React.useMemo(
    () =>
      generatePeriods({
        startTime,
        endTime,
        isUniform,
        uniformDuration: effectiveDuration,
        durationGroups,
        hasSmallBreak,
        smallBreakAfter,
        smallBreakDuration,
        hasMainBreak,
        mainBreakAfter,
        mainBreakDuration,
      }),
    [startTime, endTime, isUniform, effectiveDuration, durationGroups, hasSmallBreak, smallBreakAfter, smallBreakDuration, hasMainBreak, mainBreakAfter, mainBreakDuration],
  );

  const lastPeriodEnd = preview.length > 0 ? preview[preview.length - 1]!.end_time : startTime;
  const remainingMinutes = timeToMinutes(endTime) - timeToMinutes(lastPeriodEnd);
  const teachingCount = preview.filter((p) => p.schedule_period_type === 'teaching').length;
  const totalTeachingMins = preview
    .filter((p) => p.schedule_period_type === 'teaching')
    .reduce((sum, p) => sum + (timeToMinutes(p.end_time) - timeToMinutes(p.start_time)), 0);
  const totalBreakMins = preview
    .filter((p) => p.schedule_period_type !== 'teaching')
    .reduce((sum, p) => sum + (timeToMinutes(p.end_time) - timeToMinutes(p.start_time)), 0);

  const handleApply = async () => {
    if (preview.length === 0) return;
    setIsSaving(true);
    try {
      await apiClient('/api/v1/period-grid/replace-day', {
        method: 'POST',
        body: JSON.stringify({
          academic_year_id: academicYearId,
          year_group_id: yearGroupId,
          weekday,
          periods: preview,
        }),
      });
      toast.success(tv('generatedSuccessfully'));
      onOpenChange(false);
      onGenerated();
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setIsSaving(false);
    }
  };

  const addDurationGroup = () => {
    setDurationGroups((prev) => [...prev, { duration: 45, count: 1 }]);
  };

  const removeDurationGroup = (index: number) => {
    setDurationGroups((prev) => prev.filter((_, i) => i !== index));
  };

  const updateDurationGroup = (index: number, field: 'duration' | 'count', value: number) => {
    setDurationGroups((prev) =>
      prev.map((g, i) => (i === index ? { ...g, [field]: value } : g)),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            {tv('autoGenerateTitle')}
          </DialogTitle>
          <p className="text-sm text-text-tertiary">{tv('autoGenerateDesc')}</p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Start / End Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{tv('schoolStartTime')}</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{tv('schoolEndTime')}</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          {/* Duration Mode */}
          <div className="space-y-2">
            <Label>{tv('periodDuration')}</Label>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={isUniform}
                  onChange={() => setIsUniform(true)}
                  className="accent-primary"
                />
                {tv('uniformDuration')}
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  checked={!isUniform}
                  onChange={() => setIsUniform(false)}
                  className="accent-primary"
                />
                {tv('mixedDuration')}
              </label>
            </div>
          </div>

          {isUniform ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {DURATION_PRESETS.map((d) => (
                  <Button
                    key={d}
                    variant={!useCustom && uniformDuration === d ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setUniformDuration(d); setUseCustom(false); }}
                  >
                    {d} {tv('minutes')}
                  </Button>
                ))}
                <Button
                  variant={useCustom ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUseCustom(true)}
                >
                  {tv('durationPresets.custom')}
                </Button>
              </div>
              {useCustom && (
                <Input
                  type="number"
                  min={10}
                  max={180}
                  value={customDuration}
                  onChange={(e) => setCustomDuration(Number(e.target.value))}
                  className="w-32"
                  placeholder={tv('customDuration')}
                />
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {durationGroups.map((group, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={group.count}
                    onChange={(e) => updateDurationGroup(idx, 'count', Number(e.target.value))}
                    className="w-16"
                  />
                  <span className="text-sm text-text-tertiary">×</span>
                  <Select
                    value={String(group.duration)}
                    onValueChange={(v) => updateDurationGroup(idx, 'duration', Number(v))}
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_PRESETS.map((d) => (
                        <SelectItem key={d} value={String(d)}>{d} {tv('minutes')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-text-tertiary">{tv('periodsCount')}</span>
                  {durationGroups.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeDurationGroup(idx)}>
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={addDurationGroup}>
                <Plus className="me-1 h-3 w-3" />
                {tv('addDurationGroup')}
              </Button>
            </div>
          )}

          {/* Small Break */}
          <div className="space-y-2 rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={hasSmallBreak} onCheckedChange={(c) => setHasSmallBreak(!!c)} />
              {tv('smallBreak')}
            </label>
            {hasSmallBreak && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{tv('smallBreakAfter')}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={15}
                    value={smallBreakAfter}
                    onChange={(e) => setSmallBreakAfter(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{tv('smallBreakDuration')}</Label>
                  <div className="flex gap-1">
                    {[10, 15, 20].map((d) => (
                      <Button
                        key={d}
                        variant={smallBreakDuration === d ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => setSmallBreakDuration(d)}
                      >
                        {d}m
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Main Break */}
          <div className="space-y-2 rounded-lg border border-border p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox checked={hasMainBreak} onCheckedChange={(c) => setHasMainBreak(!!c)} />
              {tv('mainBreak')}
            </label>
            {hasMainBreak && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{tv('mainBreakAfter')}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={15}
                    value={mainBreakAfter}
                    onChange={(e) => setMainBreakAfter(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{tv('mainBreakDuration')}</Label>
                  <div className="flex gap-1">
                    {[30, 45, 60].map((d) => (
                      <Button
                        key={d}
                        variant={mainBreakDuration === d ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 px-2 text-xs"
                        onClick={() => setMainBreakDuration(d)}
                      >
                        {d}m
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{tv('preview')}</Label>
            {preview.length === 0 ? (
              <p className="text-sm text-text-tertiary">{tv('noPeriodsGenerated')}</p>
            ) : (
              <div className="space-y-1 rounded-lg border border-border p-3 max-h-48 overflow-y-auto">
                {preview.map((p, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between rounded px-2 py-1 text-xs ${
                      p.schedule_period_type === 'teaching'
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                        : p.schedule_period_type === 'lunch_duty'
                          ? 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    }`}
                  >
                    <span className="font-medium">{p.period_name}</span>
                    <span className="font-mono text-[10px]">{p.start_time} – {p.end_time}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-4 text-xs text-text-tertiary">
              <span>{teachingCount} {tv('periodsCount')} · {totalTeachingMins} {tv('minutes')} {tv('totalTeaching').toLowerCase()}</span>
              {totalBreakMins > 0 && <span>{totalBreakMins} {tv('minutes')} {tv('totalBreak').toLowerCase()}</span>}
              {remainingMinutes > 0 && <span className="text-amber-600">{remainingMinutes} {tv('minutes')} {tv('remainingTime')}</span>}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => void handleApply()} disabled={isSaving || preview.length === 0}>
            {isSaving ? '...' : `${tv('applyToDay')} ${weekdayLabel}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Import and wire in page.tsx**

Add state and button to `page.tsx`:

```tsx
// At top of file, add import
import { AutoGenerateDialog } from './_components/auto-generate-dialog';

// In the component, add state
const [autoGenOpen, setAutoGenOpen] = React.useState(false);
const [autoGenWeekday, setAutoGenWeekday] = React.useState(1);

// Add handler
const openAutoGen = (weekday: number) => {
  setAutoGenWeekday(weekday);
  setAutoGenOpen(true);
};
```

Add the auto-generate button to the quick actions bar (alongside copy buttons):

```tsx
<Button variant="outline" size="sm" onClick={() => setAutoGenOpen(true)}>
  <Wand2 className="me-1.5 h-3.5 w-3.5" />
  {tv('autoGenerate')}
</Button>
```

Add the dialog at the bottom of the component JSX:

```tsx
<AutoGenerateDialog
  open={autoGenOpen}
  onOpenChange={setAutoGenOpen}
  academicYearId={selectedYear}
  yearGroupId={selectedYearGroup}
  weekday={autoGenWeekday}
  weekdayLabel={t(WEEKDAY_LABELS[autoGenWeekday]!)}
  onGenerated={() => void fetchGrid()}
/>
```

Add a weekday selector inside the auto-gen trigger or let the dialog handle it. For simplicity, add a weekday select inside the `AutoGenerateDialog` component and remove the `weekday`/`weekdayLabel` props, making the dialog self-contained. Alternatively, keep it as designed — the user opens auto-gen from the quick actions bar and selects the day inside the dialog.

Update the `AutoGenerateDialog` to include a weekday selector if `weekday` is not fixed. For the plan, we'll add a weekday selector inside the dialog itself. Update the props to remove `weekday`/`weekdayLabel` and add the weekday selection inside the dialog.

- [ ] **Step 3: Run type-check**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/[locale]/(school)/scheduling/period-grid/
git commit -m "feat(period-grid): add auto-generate period structure wizard"
```

---

## Task 10: Frontend — Flexible Copy Day Dialog

**Files:**
- Create: `apps/web/src/app/[locale]/(school)/scheduling/period-grid/_components/copy-day-dialog.tsx`
- Modify: `apps/web/src/app/[locale]/(school)/scheduling/period-grid/page.tsx`

**Context:** Replaces the rigid "Copy Monday to All" button. New dialog lets the user pick any source day and select which target days to copy to.

- [ ] **Step 1: Create the copy-day dialog component**

```tsx
'use client';

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';
import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;
const WEEKDAY_LABELS: Record<number, string> = {
  0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
  4: 'thursday', 5: 'friday', 6: 'saturday',
};

interface CopyDayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academicYearId: string;
  yearGroupId: string;
  onCopied: () => void;
}

export function CopyDayDialog({
  open,
  onOpenChange,
  academicYearId,
  yearGroupId,
  onCopied,
}: CopyDayDialogProps) {
  const t = useTranslations('scheduling');
  const tv = useTranslations('scheduling.v2');
  const tc = useTranslations('common');

  const [sourceDay, setSourceDay] = React.useState('1');
  const [targetDays, setTargetDays] = React.useState<number[]>([]);
  const [isCopying, setIsCopying] = React.useState(false);

  const toggleTarget = (day: number) => {
    setTargetDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const handleCopy = async () => {
    if (targetDays.length === 0) return;
    setIsCopying(true);
    try {
      await apiClient('/api/v1/period-grid/copy-day', {
        method: 'POST',
        body: JSON.stringify({
          academic_year_id: academicYearId,
          year_group_id: yearGroupId,
          source_weekday: Number(sourceDay),
          target_weekdays: targetDays,
        }),
      });
      toast.success(tv('daysCopied'));
      onOpenChange(false);
      onCopied();
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setIsCopying(false);
    }
  };

  // Reset targets when source changes
  React.useEffect(() => {
    setTargetDays([]);
  }, [sourceDay]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4" />
            {tv('copyDayTitle')}
          </DialogTitle>
          <p className="text-sm text-text-tertiary">{tv('copyDayDesc')}</p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{tv('sourceDay')}</Label>
            <Select value={sourceDay} onValueChange={setSourceDay}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((d) => (
                  <SelectItem key={d} value={String(d)}>{t(WEEKDAY_LABELS[d]!)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{tv('targetDays')}</Label>
            <div className="space-y-1">
              {WEEKDAYS.filter((d) => d !== Number(sourceDay)).map((d) => (
                <label key={d} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-secondary">
                  <Checkbox
                    checked={targetDays.includes(d)}
                    onCheckedChange={() => toggleTarget(d)}
                  />
                  {t(WEEKDAY_LABELS[d]!)}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => void handleCopy()} disabled={isCopying || targetDays.length === 0}>
            {isCopying ? '...' : tv('copy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire into page.tsx — replace "Copy Monday to All" button**

Remove the old `handleCopyMondayToAll` function entirely.

Add state and import:

```tsx
import { CopyDayDialog } from './_components/copy-day-dialog';

const [copyDayOpen, setCopyDayOpen] = React.useState(false);
```

Replace the old "Copy Monday to All" button:

```tsx
<Button variant="outline" size="sm" onClick={() => setCopyDayOpen(true)}>
  <Copy className="me-1.5 h-3.5 w-3.5" />
  {tv('copyDayTitle')}
</Button>
```

Add the dialog:

```tsx
<CopyDayDialog
  open={copyDayOpen}
  onOpenChange={setCopyDayOpen}
  academicYearId={selectedYear}
  yearGroupId={selectedYearGroup}
  onCopied={() => void fetchGrid()}
/>
```

- [ ] **Step 3: Run type-check**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/[locale]/(school)/scheduling/period-grid/
git commit -m "feat(period-grid): add flexible copy-day dialog replacing rigid Copy Monday to All"
```

---

## Task 11: Frontend — Copy to Year Groups Dialog

**Files:**
- Create: `apps/web/src/app/[locale]/(school)/scheduling/period-grid/_components/copy-year-group-dialog.tsx`
- Modify: `apps/web/src/app/[locale]/(school)/scheduling/period-grid/page.tsx`

**Context:** Replaces the existing "Copy from Year Group" dialog. New version lets the user select specific day(s) or all days, and pick multiple target year groups. Uses the new `POST /api/v1/period-grid/copy-year-group` endpoint.

- [ ] **Step 1: Create the copy-year-group dialog component**

```tsx
'use client';

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';
import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;
const WEEKDAY_LABELS: Record<number, string> = {
  0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday',
  4: 'thursday', 5: 'friday', 6: 'saturday',
};

interface YearGroup {
  id: string;
  name: string;
}

interface CopyYearGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academicYearId: string;
  sourceYearGroupId: string;
  yearGroups: YearGroup[];
  onCopied: () => void;
}

export function CopyYearGroupDialog({
  open,
  onOpenChange,
  academicYearId,
  sourceYearGroupId,
  yearGroups,
  onCopied,
}: CopyYearGroupDialogProps) {
  const t = useTranslations('scheduling');
  const tv = useTranslations('scheduling.v2');
  const tc = useTranslations('common');

  const [selectedDay, setSelectedDay] = React.useState('all');
  const [targetYearGroups, setTargetYearGroups] = React.useState<string[]>([]);
  const [isCopying, setIsCopying] = React.useState(false);

  const availableYearGroups = yearGroups.filter((yg) => yg.id !== sourceYearGroupId);

  const toggleYearGroup = (ygId: string) => {
    setTargetYearGroups((prev) =>
      prev.includes(ygId) ? prev.filter((id) => id !== ygId) : [...prev, ygId],
    );
  };

  const selectAllYearGroups = () => {
    if (targetYearGroups.length === availableYearGroups.length) {
      setTargetYearGroups([]);
    } else {
      setTargetYearGroups(availableYearGroups.map((yg) => yg.id));
    }
  };

  const handleCopy = async () => {
    if (targetYearGroups.length === 0) return;
    setIsCopying(true);
    try {
      const body: Record<string, unknown> = {
        academic_year_id: academicYearId,
        source_year_group_id: sourceYearGroupId,
        target_year_group_ids: targetYearGroups,
      };
      if (selectedDay !== 'all') {
        body['weekdays'] = [Number(selectedDay)];
      }
      await apiClient('/api/v1/period-grid/copy-year-group', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      toast.success(tv('yearGroupsCopied'));
      onOpenChange(false);
      onCopied();
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4" />
            {tv('copyToYearGroupsTitle')}
          </DialogTitle>
          <p className="text-sm text-text-tertiary">{tv('copyToYearGroupsDesc')}</p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Day selector */}
          <div className="space-y-1.5">
            <Label>{tv('selectSourceDay')}</Label>
            <Select value={selectedDay} onValueChange={setSelectedDay}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tv('allDays')}</SelectItem>
                {WEEKDAYS.map((d) => (
                  <SelectItem key={d} value={String(d)}>{t(WEEKDAY_LABELS[d]!)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target year groups */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{tv('targetYearGroups')}</Label>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={selectAllYearGroups}>
                {targetYearGroups.length === availableYearGroups.length ? tc('deselectAll') : tc('selectAll')}
              </Button>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto rounded-lg border border-border p-2">
              {availableYearGroups.map((yg) => (
                <label key={yg.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-secondary">
                  <Checkbox
                    checked={targetYearGroups.includes(yg.id)}
                    onCheckedChange={() => toggleYearGroup(yg.id)}
                  />
                  {yg.name}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => void handleCopy()} disabled={isCopying || targetYearGroups.length === 0}>
            {isCopying ? '...' : tv('copy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire into page.tsx — replace the old copy-year-group dialog**

Remove the entire old copy-year-group dialog (`copyYgOpen`, `copySourceYg`, `handleCopyFromYearGroup`, and the `<Dialog>` JSX for it).

Add import and state:

```tsx
import { CopyYearGroupDialog } from './_components/copy-year-group-dialog';

const [copyYgOpen, setCopyYgOpen] = React.useState(false);
```

Replace the old "Copy from Year Group" button:

```tsx
<Button variant="outline" size="sm" onClick={() => setCopyYgOpen(true)}>
  <Copy className="me-1.5 h-3.5 w-3.5" />
  {tv('copyToYearGroupsTitle')}
</Button>
```

Add the dialog:

```tsx
<CopyYearGroupDialog
  open={copyYgOpen}
  onOpenChange={setCopyYgOpen}
  academicYearId={selectedYear}
  sourceYearGroupId={selectedYearGroup}
  yearGroups={yearGroups}
  onCopied={() => void fetchGrid()}
/>
```

- [ ] **Step 3: Run type-check**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/[locale]/(school)/scheduling/period-grid/
git commit -m "feat(period-grid): add copy-to-year-groups dialog with day selection"
```

---

## Task 12: Final Verification

**Files:** All modified files

- [ ] **Step 1: Run full type-check**

```bash
npx turbo type-check
```

Expected: No errors.

- [ ] **Step 2: Run lint**

```bash
npx turbo lint
```

Expected: No errors. Watch for import ordering issues and unused imports.

- [ ] **Step 3: Run all tests**

```bash
npx turbo test
```

Expected: All existing tests pass. New tests pass.

- [ ] **Step 4: Fix any lint or type errors found**

Address each error individually. Common issues:
- Import ordering (the ESLint import/order rule)
- Unused imports after removing Arabic name field references
- Missing translation keys

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix(period-grid): address lint and type-check issues from period grid enhancements"
```

- [ ] **Step 6: Push and monitor deployment**

```bash
git push origin main
gh run watch
```

If deployment fails, read logs and fix:

```bash
gh run view --log-failed
```

- [ ] **Step 7: Test in production**

Verify all 6 enhancements work:
1. Arabic name field is gone from the add/edit dialog
2. Adding periods: start time auto-locks to previous period's end time
3. Switching year groups shows different period grids
4. Auto-generate wizard creates a full day structure correctly
5. Copy Day dialog copies any day to any selection of days
6. Copy to Year Groups dialog copies to multiple year groups

---

## Architecture Updates Required (Post-Implementation)

After all tasks are complete, update these architecture files:

- **`architecture/feature-map.md`**: Add new endpoints (`replace-day`, `copy-year-group`). Update the period-grid description to mention year-group scoping.
- **`architecture/module-blast-radius.md`**: No change needed — PeriodGridModule's public interface hasn't changed structurally (same consumers).
- **`architecture/danger-zones.md`**: Consider adding a note about the unique constraint change — old data with NULL `year_group_id` becomes invisible when filtered, which is intentional but worth documenting.
