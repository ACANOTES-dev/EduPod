# Phase E — API Layer

> **Spec:** `docs/superpowers/specs/2026-03-28-predictive-early-warning-design.md`
> **Depends on:** Phase A (schema, types, enums, Zod schemas), Phase B (collectors), Phase C (scoring engine)

## What This Phase Builds

The full REST API layer for the Predictive Early Warning System: 1 controller, 3 services, 4 DTOs, and 8 endpoints — plus complete TDD test suites for the controller and all three services.

---

## Files to Create

```
packages/shared/src/early-warning/
└── schemas.ts                              # ADD query/mutation Zod schemas (file exists from Phase A — append)

apps/api/src/modules/early-warning/
├── dto/
│   ├── early-warning-query.dto.ts          # NEW
│   ├── cohort-query.dto.ts                 # NEW
│   ├── update-config.dto.ts                # NEW
│   └── assign-student.dto.ts              # NEW
├── early-warning.controller.ts             # NEW
├── early-warning.controller.spec.ts        # NEW
├── early-warning.service.ts                # NEW — main orchestrating service
├── early-warning.service.spec.ts           # NEW
├── early-warning-config.service.ts         # NEW — config CRUD
├── early-warning-config.service.spec.ts    # NEW
├── early-warning-cohort.service.ts         # NEW — cohort aggregation
├── early-warning-cohort.service.spec.ts    # NEW
└── early-warning.module.ts                 # MODIFY — register new services
```

**Total: 12 new files, 2 modified files.**

---

## Step 1 — Zod Schemas in `packages/shared`

**File:** `packages/shared/src/early-warning/schemas.ts`

This file was created in Phase A with the config-related schemas. Phase E appends query and mutation schemas for all 8 endpoints.

### Schemas to add:

```typescript
import { z } from 'zod';

// ─── Risk tier and domain enums (reuse from types.ts if exported, else redefine) ──

const riskTierEnum = z.enum(['green', 'yellow', 'amber', 'red']);
const domainEnum = z.enum(['attendance', 'grades', 'behaviour', 'wellbeing', 'engagement']);

// ─── GET /v1/early-warnings — List risk profiles ────────────────────────────

export const listEarlyWarningsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['composite_score', 'student_name', 'tier_entered_at']).default('composite_score'),
  order: z.enum(['asc', 'desc']).default('desc'),
  tier: riskTierEnum.optional(),
  year_group_id: z.string().uuid().optional(),
  class_id: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
});

export type ListEarlyWarningsQuery = z.infer<typeof listEarlyWarningsQuerySchema>;

// ─── GET /v1/early-warnings/summary — Tier distribution ─────────────────────

export const earlyWarningSummaryQuerySchema = z.object({
  year_group_id: z.string().uuid().optional(),
  class_id: z.string().uuid().optional(),
});

export type EarlyWarningSummaryQuery = z.infer<typeof earlyWarningSummaryQuerySchema>;

// ─── GET /v1/early-warnings/cohort — Dimensional pivot ──────────────────────

export const cohortQuerySchema = z.object({
  group_by: z.enum(['year_group', 'class', 'subject', 'domain']),
  period: z.enum(['current', '7d', '30d', '90d', 'academic_year']).default('current'),
  year_group_id: z.string().uuid().optional(),
  class_id: z.string().uuid().optional(),
  tier: riskTierEnum.optional(),
});

export type CohortQuery = z.infer<typeof cohortQuerySchema>;

// ─── GET /v1/early-warnings/:studentId — Student detail ─────────────────────
// No query schema needed — studentId comes from URL param.

// ─── PUT /v1/early-warnings/config — Update config ──────────────────────────

export const updateEarlyWarningConfigSchema = z.object({
  is_enabled: z.boolean().optional(),
  weights_json: z
    .object({
      attendance: z.number().int().min(0).max(100),
      grades: z.number().int().min(0).max(100),
      behaviour: z.number().int().min(0).max(100),
      wellbeing: z.number().int().min(0).max(100),
      engagement: z.number().int().min(0).max(100),
    })
    .refine((w) => w.attendance + w.grades + w.behaviour + w.wellbeing + w.engagement === 100, {
      message: 'Weights must sum to 100',
      path: ['attendance'],
    })
    .optional(),
  thresholds_json: z
    .object({
      green: z.literal(0),
      yellow: z.number().int().min(1).max(99),
      amber: z.number().int().min(1).max(99),
      red: z.number().int().min(1).max(99),
    })
    .refine((t) => t.yellow < t.amber && t.amber < t.red, {
      message: 'Thresholds must be in ascending order: yellow < amber < red',
      path: ['yellow'],
    })
    .optional(),
  hysteresis_buffer: z.number().int().min(1).max(30).optional(),
  routing_rules_json: z.record(z.string(), z.unknown()).optional(),
  digest_day: z.number().int().min(0).max(6).optional(),
  digest_recipients_json: z.array(z.string()).optional(),
  high_severity_events_json: z.array(z.string()).optional(),
});

export type UpdateEarlyWarningConfigDto = z.infer<typeof updateEarlyWarningConfigSchema>;

// ─── POST /v1/early-warnings/:studentId/acknowledge ─────────────────────────
// No body schema needed — current user is extracted from JWT.

// ─── POST /v1/early-warnings/:studentId/assign ──────────────────────────────

export const assignStudentSchema = z.object({
  assigned_to_user_id: z.string().uuid(),
});

export type AssignStudentDto = z.infer<typeof assignStudentSchema>;

// ─── Response types ─────────────────────────────────────────────────────────

export interface EarlyWarningListItem {
  id: string;
  student_id: string;
  student_name: string;
  composite_score: number;
  risk_tier: string;
  tier_entered_at: string;
  attendance_score: number;
  grades_score: number;
  behaviour_score: number;
  wellbeing_score: number;
  engagement_score: number;
  top_signal: string | null;
  trend_json: number[];
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  last_computed_at: string;
}

export interface EarlyWarningSummary {
  green: number;
  yellow: number;
  amber: number;
  red: number;
  total: number;
}

export interface CohortCell {
  groupKey: string;
  groupId: string;
  studentCount: number;
  avgCompositeScore: number;
  avgAttendanceScore: number;
  avgGradesScore: number;
  avgBehaviourScore: number;
  avgWellbeingScore: number;
  avgEngagementScore: number;
  tierDistribution: { green: number; yellow: number; amber: number; red: number };
}

export interface StudentRiskDetail {
  id: string;
  student_id: string;
  student_name: string;
  academic_year_id: string;
  composite_score: number;
  risk_tier: string;
  tier_entered_at: string;
  attendance_score: number;
  grades_score: number;
  behaviour_score: number;
  wellbeing_score: number;
  engagement_score: number;
  signal_summary_json: Record<string, unknown>;
  trend_json: number[];
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  assigned_at: string | null;
  last_computed_at: string;
  signals: StudentRiskSignalItem[];
  transitions: TierTransitionItem[];
}

export interface StudentRiskSignalItem {
  id: string;
  domain: string;
  signal_type: string;
  severity: string;
  score_contribution: number;
  details_json: Record<string, unknown>;
  detected_at: string;
}

export interface TierTransitionItem {
  id: string;
  from_tier: string | null;
  to_tier: string;
  composite_score: number;
  trigger_signals_json: Record<string, unknown>;
  transitioned_at: string;
}
```

**Export from `packages/shared/src/early-warning/index.ts`** — ensure `schemas.ts` is re-exported:

```typescript
export * from './schemas';
```

---

## Step 2 — DTO Files

Each DTO is a thin re-export from `@school/shared`. Four files.

### 2a. `apps/api/src/modules/early-warning/dto/early-warning-query.dto.ts`

```typescript
import { earlyWarningSummaryQuerySchema, listEarlyWarningsQuerySchema } from '@school/shared';
import type { EarlyWarningSummaryQuery, ListEarlyWarningsQuery } from '@school/shared';

export { earlyWarningSummaryQuerySchema, listEarlyWarningsQuerySchema };
export type { EarlyWarningSummaryQuery, ListEarlyWarningsQuery };
```

### 2b. `apps/api/src/modules/early-warning/dto/cohort-query.dto.ts`

```typescript
import { cohortQuerySchema } from '@school/shared';
import type { CohortQuery } from '@school/shared';

export { cohortQuerySchema };
export type { CohortQuery };
```

### 2c. `apps/api/src/modules/early-warning/dto/update-config.dto.ts`

```typescript
import { updateEarlyWarningConfigSchema } from '@school/shared';
import type { UpdateEarlyWarningConfigDto } from '@school/shared';

export { updateEarlyWarningConfigSchema };
export type { UpdateEarlyWarningConfigDto };
```

### 2d. `apps/api/src/modules/early-warning/dto/assign-student.dto.ts`

```typescript
import { assignStudentSchema } from '@school/shared';
import type { AssignStudentDto } from '@school/shared';

export { assignStudentSchema };
export type { AssignStudentDto };
```

---

## Step 3 — Controller

**File:** `apps/api/src/modules/early-warning/early-warning.controller.ts`

CRITICAL: Static routes (`summary`, `cohort`, `config`) MUST come before dynamic routes (`:studentId`).

```typescript
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import {
  earlyWarningSummaryQuerySchema,
  listEarlyWarningsQuerySchema,
} from './dto/early-warning-query.dto';
import type {
  EarlyWarningSummaryQuery,
  ListEarlyWarningsQuery,
} from './dto/early-warning-query.dto';
import { cohortQuerySchema } from './dto/cohort-query.dto';
import type { CohortQuery } from './dto/cohort-query.dto';
import { updateEarlyWarningConfigSchema } from './dto/update-config.dto';
import type { UpdateEarlyWarningConfigDto } from './dto/update-config.dto';
import { assignStudentSchema } from './dto/assign-student.dto';
import type { AssignStudentDto } from './dto/assign-student.dto';
import { EarlyWarningCohortService } from './early-warning-cohort.service';
import { EarlyWarningConfigService } from './early-warning-config.service';
import { EarlyWarningService } from './early-warning.service';

@Controller('v1/early-warnings')
@ModuleEnabled('early_warning')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class EarlyWarningController {
  constructor(
    private readonly earlyWarningService: EarlyWarningService,
    private readonly configService: EarlyWarningConfigService,
    private readonly cohortService: EarlyWarningCohortService,
  ) {}

  // ─── Static routes (MUST come before :studentId) ──────────────────────────

  // GET /v1/early-warnings
  @Get()
  @RequiresPermission('early_warning.view')
  async list(
    @CurrentTenant() tenantContext: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listEarlyWarningsQuerySchema))
    query: ListEarlyWarningsQuery,
  ) {
    return this.earlyWarningService.listProfiles(
      tenantContext.tenant_id,
      user.sub,
      user.membership_id,
      query,
    );
  }

  // GET /v1/early-warnings/summary
  @Get('summary')
  @RequiresPermission('early_warning.view')
  async summary(
    @CurrentTenant() tenantContext: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(earlyWarningSummaryQuerySchema))
    query: EarlyWarningSummaryQuery,
  ) {
    return this.earlyWarningService.getTierSummary(
      tenantContext.tenant_id,
      user.sub,
      user.membership_id,
      query,
    );
  }

  // GET /v1/early-warnings/cohort
  @Get('cohort')
  @RequiresPermission('early_warning.view')
  async cohort(
    @CurrentTenant() tenantContext: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(cohortQuerySchema)) query: CohortQuery,
  ) {
    return this.cohortService.getCohortPivot(
      tenantContext.tenant_id,
      user.sub,
      user.membership_id,
      query,
    );
  }

  // GET /v1/early-warnings/config
  @Get('config')
  @RequiresPermission('early_warning.manage')
  async getConfig(@CurrentTenant() tenantContext: TenantContext) {
    return this.configService.getConfig(tenantContext.tenant_id);
  }

  // PUT /v1/early-warnings/config
  @Put('config')
  @RequiresPermission('early_warning.manage')
  async updateConfig(
    @CurrentTenant() tenantContext: TenantContext,
    @Body(new ZodValidationPipe(updateEarlyWarningConfigSchema))
    dto: UpdateEarlyWarningConfigDto,
  ) {
    return this.configService.updateConfig(tenantContext.tenant_id, dto);
  }

  // ─── Dynamic routes (:studentId) ─────────────────────────────────────────

  // GET /v1/early-warnings/:studentId
  @Get(':studentId')
  @RequiresPermission('early_warning.view')
  async getStudentDetail(
    @CurrentTenant() tenantContext: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.earlyWarningService.getStudentDetail(
      tenantContext.tenant_id,
      user.sub,
      user.membership_id,
      studentId,
    );
  }

  // POST /v1/early-warnings/:studentId/acknowledge
  @Post(':studentId/acknowledge')
  @RequiresPermission('early_warning.acknowledge')
  @HttpCode(HttpStatus.NO_CONTENT)
  async acknowledge(
    @CurrentTenant() tenantContext: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    await this.earlyWarningService.acknowledgeProfile(tenantContext.tenant_id, user.sub, studentId);
  }

  // POST /v1/early-warnings/:studentId/assign
  @Post(':studentId/assign')
  @RequiresPermission('early_warning.assign')
  @HttpCode(HttpStatus.OK)
  async assign(
    @CurrentTenant() tenantContext: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body(new ZodValidationPipe(assignStudentSchema)) dto: AssignStudentDto,
  ) {
    return this.earlyWarningService.assignStaff(tenantContext.tenant_id, user.sub, studentId, dto);
  }
}
```

### Key design points:

- Static routes (`summary`, `cohort`, `config`) placed before `:studentId` to prevent NestJS route matching ambiguity
- `listProfiles`, `getTierSummary`, `getStudentDetail`, and `getCohortPivot` all receive `user.sub` and `user.membership_id` to enable role-scoped queries (see service layer below)
- `acknowledge` returns 204 No Content (no body)
- `assign` returns 200 with the updated profile (staff needs confirmation)

---

## Step 4 — EarlyWarningService (Main Orchestrator)

**File:** `apps/api/src/modules/early-warning/early-warning.service.ts`

This is the primary service handling list, detail, summary, acknowledge, and assign. It handles role-scoping by resolving the calling user's role and restricting queries accordingly.

```typescript
import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AssignStudentDto,
  EarlyWarningListItem,
  EarlyWarningSummary,
  EarlyWarningSummaryQuery,
  ListEarlyWarningsQuery,
  StudentRiskDetail,
  StudentRiskSignalItem,
  TierTransitionItem,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Role-scoping helper types ──────────────────────────────────────────────

interface RoleScopeFilter {
  studentIds?: string[];
  unrestricted: boolean;
}

@Injectable()
export class EarlyWarningService {
  private readonly logger = new Logger(EarlyWarningService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Role-scoping ────────────────────────────────────────────────────────

  /**
   * Resolves which students the user can see based on their role.
   * - Principal/admin (has early_warning.manage): unrestricted
   * - Year head: students in their year group(s)
   * - Teacher: students in their classes (via class_enrolments)
   *
   * Uses membership_id to look up role assignments.
   */
  private async resolveRoleScope(
    tenantId: string,
    userId: string,
    membershipId: string | null,
  ): Promise<RoleScopeFilter> {
    if (!membershipId) {
      return { unrestricted: false, studentIds: [] };
    }

    // Check if user has manage permission (admin/principal → unrestricted)
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenant_id: tenantId, user_id: userId },
      include: {
        role: {
          include: {
            role_permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!membership) {
      return { unrestricted: false, studentIds: [] };
    }

    const permissions = membership.role.role_permissions.map((rp) => rp.permission.key);

    // Admin / principal with early_warning.manage sees everything
    if (permissions.includes('early_warning.manage')) {
      return { unrestricted: true };
    }

    // Year head: find year groups assigned to this staff member
    const yearGroupAssignments = await this.prisma.yearGroup.findMany({
      where: {
        tenant_id: tenantId,
        year_head_user_id: userId,
      },
      select: { id: true },
    });

    if (yearGroupAssignments.length > 0) {
      const yearGroupIds = yearGroupAssignments.map((yg) => yg.id);
      const students = await this.prisma.student.findMany({
        where: {
          tenant_id: tenantId,
          year_group_id: { in: yearGroupIds },
          status: 'active',
        },
        select: { id: true },
      });
      return { unrestricted: false, studentIds: students.map((s) => s.id) };
    }

    // Teacher: find students in classes where this user is assigned as staff
    const classStaffRows = await this.prisma.classStaff.findMany({
      where: { tenant_id: tenantId, user_id: userId },
      select: { class_id: true },
    });

    if (classStaffRows.length > 0) {
      const classIds = classStaffRows.map((cs) => cs.class_id);
      const enrolments = await this.prisma.classEnrolment.findMany({
        where: {
          tenant_id: tenantId,
          class_id: { in: classIds },
          status: 'active',
        },
        select: { student_id: true },
      });
      const uniqueStudentIds = [...new Set(enrolments.map((e) => e.student_id))];
      return { unrestricted: false, studentIds: uniqueStudentIds };
    }

    // Fallback: no access
    return { unrestricted: false, studentIds: [] };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async getActiveAcademicYearId(tenantId: string): Promise<string> {
    const year = await this.prisma.academicYear.findFirst({
      where: { tenant_id: tenantId, status: 'active' },
      select: { id: true },
    });
    if (!year) {
      throw new NotFoundException({
        code: 'NO_ACTIVE_ACADEMIC_YEAR',
        message: 'No active academic year found for this tenant',
      });
    }
    return year.id;
  }

  private buildStudentScopeWhere(
    tenantId: string,
    academicYearId: string,
    scope: RoleScopeFilter,
  ): Prisma.StudentRiskProfileWhereInput {
    const where: Prisma.StudentRiskProfileWhereInput = {
      tenant_id: tenantId,
      academic_year_id: academicYearId,
    };
    if (!scope.unrestricted) {
      where.student_id = { in: scope.studentIds ?? [] };
    }
    return where;
  }

  // ─── GET /v1/early-warnings — Paginated list ─────────────────────────────

  async listProfiles(
    tenantId: string,
    userId: string,
    membershipId: string | null,
    query: ListEarlyWarningsQuery,
  ): Promise<{
    data: EarlyWarningListItem[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const [scope, academicYearId] = await Promise.all([
      this.resolveRoleScope(tenantId, userId, membershipId),
      this.getActiveAcademicYearId(tenantId),
    ]);

    const where = this.buildStudentScopeWhere(tenantId, academicYearId, scope);

    // Apply optional filters
    if (query.tier) {
      where.risk_tier = query.tier;
    }
    if (query.year_group_id || query.class_id) {
      where.student = {
        ...(query.year_group_id && { year_group_id: query.year_group_id }),
        ...(query.class_id && {
          class_enrolments: {
            some: { class_id: query.class_id, status: 'active' },
          },
        }),
      };
    }
    if (query.search) {
      where.student = {
        ...(where.student as Prisma.StudentWhereInput),
        OR: [
          { first_name: { contains: query.search, mode: 'insensitive' } },
          { last_name: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    // Sort
    const orderBy: Prisma.StudentRiskProfileOrderByWithRelationInput =
      query.sort === 'student_name'
        ? { student: { last_name: query.order } }
        : query.sort === 'tier_entered_at'
          ? { tier_entered_at: query.order }
          : { composite_score: query.order };

    const [total, profiles] = await Promise.all([
      this.prisma.studentRiskProfile.count({ where }),
      this.prisma.studentRiskProfile.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          student: {
            select: { id: true, first_name: true, last_name: true },
          },
          assigned_to_user: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
    ]);

    const data: EarlyWarningListItem[] = profiles.map((p) => {
      const summaryJson = p.signal_summary_json as Record<string, unknown> | null;
      const topSignal = (summaryJson?.topSignal as string | null) ?? null;

      return {
        id: p.id,
        student_id: p.student_id,
        student_name: p.student ? `${p.student.first_name} ${p.student.last_name}` : 'Unknown',
        composite_score: Number(p.composite_score),
        risk_tier: p.risk_tier,
        tier_entered_at: p.tier_entered_at.toISOString(),
        attendance_score: Number(p.attendance_score),
        grades_score: Number(p.grades_score),
        behaviour_score: Number(p.behaviour_score),
        wellbeing_score: Number(p.wellbeing_score),
        engagement_score: Number(p.engagement_score),
        top_signal: topSignal,
        trend_json: (p.trend_json as number[]) ?? [],
        assigned_to_user_id: p.assigned_to_user_id,
        assigned_to_name: p.assigned_to_user
          ? `${p.assigned_to_user.first_name} ${p.assigned_to_user.last_name}`
          : null,
        last_computed_at: p.last_computed_at.toISOString(),
      };
    });

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  // ─── GET /v1/early-warnings/summary — Tier distribution ───────────────────

  async getTierSummary(
    tenantId: string,
    userId: string,
    membershipId: string | null,
    query: EarlyWarningSummaryQuery,
  ): Promise<EarlyWarningSummary> {
    const [scope, academicYearId] = await Promise.all([
      this.resolveRoleScope(tenantId, userId, membershipId),
      this.getActiveAcademicYearId(tenantId),
    ]);

    const where = this.buildStudentScopeWhere(tenantId, academicYearId, scope);

    if (query.year_group_id || query.class_id) {
      where.student = {
        ...(query.year_group_id && { year_group_id: query.year_group_id }),
        ...(query.class_id && {
          class_enrolments: {
            some: { class_id: query.class_id, status: 'active' },
          },
        }),
      };
    }

    const counts = await this.prisma.studentRiskProfile.groupBy({
      by: ['risk_tier'],
      where,
      _count: { id: true },
    });

    const summary: EarlyWarningSummary = { green: 0, yellow: 0, amber: 0, red: 0, total: 0 };
    for (const row of counts) {
      const tier = row.risk_tier as keyof Omit<EarlyWarningSummary, 'total'>;
      if (tier in summary) {
        summary[tier] = row._count.id;
        summary.total += row._count.id;
      }
    }

    return summary;
  }

  // ─── GET /v1/early-warnings/:studentId — Student detail ───────────────────

  async getStudentDetail(
    tenantId: string,
    userId: string,
    membershipId: string | null,
    studentId: string,
  ): Promise<StudentRiskDetail> {
    const [scope, academicYearId] = await Promise.all([
      this.resolveRoleScope(tenantId, userId, membershipId),
      this.getActiveAcademicYearId(tenantId),
    ]);

    // Verify the user can see this student
    if (!scope.unrestricted && !(scope.studentIds ?? []).includes(studentId)) {
      throw new ForbiddenException({
        code: 'EARLY_WARNING_ACCESS_DENIED',
        message: "You do not have permission to view this student's risk profile",
      });
    }

    const profile = await this.prisma.studentRiskProfile.findFirst({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        academic_year_id: academicYearId,
      },
      include: {
        student: {
          select: { id: true, first_name: true, last_name: true },
        },
        assigned_to_user: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException({
        code: 'RISK_PROFILE_NOT_FOUND',
        message: `No risk profile found for student "${studentId}"`,
      });
    }

    // Fetch signals (latest 50)
    const signals = await this.prisma.studentRiskSignal.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        academic_year_id: academicYearId,
      },
      orderBy: { detected_at: 'desc' },
      take: 50,
    });

    // Fetch tier transitions (latest 20)
    const transitions = await this.prisma.earlyWarningTierTransition.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        profile_id: profile.id,
      },
      orderBy: { transitioned_at: 'desc' },
      take: 20,
    });

    const signalItems: StudentRiskSignalItem[] = signals.map((s) => ({
      id: s.id,
      domain: s.domain,
      signal_type: s.signal_type,
      severity: s.severity,
      score_contribution: Number(s.score_contribution),
      details_json: (s.details_json as Record<string, unknown>) ?? {},
      detected_at: s.detected_at.toISOString(),
    }));

    const transitionItems: TierTransitionItem[] = transitions.map((t) => ({
      id: t.id,
      from_tier: t.from_tier,
      to_tier: t.to_tier,
      composite_score: Number(t.composite_score),
      trigger_signals_json: (t.trigger_signals_json as Record<string, unknown>) ?? {},
      transitioned_at: t.transitioned_at.toISOString(),
    }));

    return {
      id: profile.id,
      student_id: profile.student_id,
      student_name: profile.student
        ? `${profile.student.first_name} ${profile.student.last_name}`
        : 'Unknown',
      academic_year_id: profile.academic_year_id,
      composite_score: Number(profile.composite_score),
      risk_tier: profile.risk_tier,
      tier_entered_at: profile.tier_entered_at.toISOString(),
      attendance_score: Number(profile.attendance_score),
      grades_score: Number(profile.grades_score),
      behaviour_score: Number(profile.behaviour_score),
      wellbeing_score: Number(profile.wellbeing_score),
      engagement_score: Number(profile.engagement_score),
      signal_summary_json: (profile.signal_summary_json as Record<string, unknown>) ?? {},
      trend_json: (profile.trend_json as number[]) ?? [],
      assigned_to_user_id: profile.assigned_to_user_id,
      assigned_to_name: profile.assigned_to_user
        ? `${profile.assigned_to_user.first_name} ${profile.assigned_to_user.last_name}`
        : null,
      assigned_at: profile.assigned_at?.toISOString() ?? null,
      last_computed_at: profile.last_computed_at.toISOString(),
      signals: signalItems,
      transitions: transitionItems,
    };
  }

  // ─── POST /v1/early-warnings/:studentId/acknowledge ───────────────────────

  async acknowledgeProfile(tenantId: string, userId: string, studentId: string): Promise<void> {
    const academicYearId = await this.getActiveAcademicYearId(tenantId);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;

      const profile = await tx.studentRiskProfile.findFirst({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          academic_year_id: academicYearId,
        },
      });

      if (!profile) {
        throw new NotFoundException({
          code: 'RISK_PROFILE_NOT_FOUND',
          message: `No risk profile found for student "${studentId}"`,
        });
      }

      await tx.studentRiskProfile.update({
        where: { id: profile.id },
        data: {
          acknowledged_by_user_id: userId,
          acknowledged_at: new Date(),
        },
      });
    });
  }

  // ─── POST /v1/early-warnings/:studentId/assign ───────────────────────────

  async assignStaff(
    tenantId: string,
    userId: string,
    studentId: string,
    dto: AssignStudentDto,
  ): Promise<{ id: string; assigned_to_user_id: string; assigned_at: string }> {
    const academicYearId = await this.getActiveAcademicYearId(tenantId);

    // Verify the target user exists
    const targetUser = await this.prisma.user.findFirst({
      where: { id: dto.assigned_to_user_id },
      select: { id: true },
    });
    if (!targetUser) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: `User "${dto.assigned_to_user_id}" not found`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;

      const profile = await tx.studentRiskProfile.findFirst({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          academic_year_id: academicYearId,
        },
      });

      if (!profile) {
        throw new NotFoundException({
          code: 'RISK_PROFILE_NOT_FOUND',
          message: `No risk profile found for student "${studentId}"`,
        });
      }

      const now = new Date();
      const updated = await tx.studentRiskProfile.update({
        where: { id: profile.id },
        data: {
          assigned_to_user_id: dto.assigned_to_user_id,
          assigned_at: now,
        },
      });

      return {
        id: updated.id,
        assigned_to_user_id: dto.assigned_to_user_id,
        assigned_at: now.toISOString(),
      };
    });
  }
}
```

### Key design points:

- `resolveRoleScope()` determines visibility:
  - Users with `early_warning.manage` (admin/principal) see all students
  - Year heads see students in year groups where they are `year_head_user_id`
  - Teachers see students in their classes via `class_staff` -> `class_enrolments`
  - Fallback is empty — no access
- Reads use direct `this.prisma` with `tenant_id` in `where` (no RLS transaction needed for reads per convention)
- Writes (`acknowledge`, `assign`) use `createRlsClient(this.prisma, { tenant_id }).$transaction()` per convention
- The `as unknown as PrismaService` cast inside RLS transactions is the sole permitted use (per CLAUDE.md)
- `acknowledged_by_user_id` and `acknowledged_at` columns must exist on `student_risk_profiles` — these should be added in Phase A migration or as a migration amendment

---

## Step 5 — EarlyWarningConfigService

**File:** `apps/api/src/modules/early-warning/early-warning-config.service.ts`

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { UpdateEarlyWarningConfigDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Default config values ──────────────────────────────────────────────────

const DEFAULT_WEIGHTS = {
  attendance: 25,
  grades: 25,
  behaviour: 20,
  wellbeing: 20,
  engagement: 10,
};

const DEFAULT_THRESHOLDS = {
  green: 0,
  yellow: 30,
  amber: 50,
  red: 75,
};

const DEFAULT_ROUTING_RULES = {
  yellow: { role: 'homeroom_teacher' },
  amber: { role: 'year_head' },
  red: { roles: ['principal', 'pastoral_lead'] },
};

const DEFAULT_HIGH_SEVERITY_EVENTS = [
  'suspension',
  'critical_incident',
  'third_consecutive_absence',
];

@Injectable()
export class EarlyWarningConfigService {
  private readonly logger = new Logger(EarlyWarningConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── GET /v1/early-warnings/config ────────────────────────────────────────

  async getConfig(tenantId: string) {
    const config = await this.prisma.earlyWarningConfig.findFirst({
      where: { tenant_id: tenantId },
    });

    if (!config) {
      // Return defaults if no config exists yet
      return {
        id: null,
        tenant_id: tenantId,
        is_enabled: false,
        weights_json: DEFAULT_WEIGHTS,
        thresholds_json: DEFAULT_THRESHOLDS,
        hysteresis_buffer: 10,
        routing_rules_json: DEFAULT_ROUTING_RULES,
        digest_day: 1,
        digest_recipients_json: [],
        high_severity_events_json: DEFAULT_HIGH_SEVERITY_EVENTS,
      };
    }

    return {
      id: config.id,
      tenant_id: config.tenant_id,
      is_enabled: config.is_enabled,
      weights_json: config.weights_json ?? DEFAULT_WEIGHTS,
      thresholds_json: config.thresholds_json ?? DEFAULT_THRESHOLDS,
      hysteresis_buffer: config.hysteresis_buffer,
      routing_rules_json: config.routing_rules_json ?? DEFAULT_ROUTING_RULES,
      digest_day: config.digest_day,
      digest_recipients_json: config.digest_recipients_json ?? [],
      high_severity_events_json: config.high_severity_events_json ?? DEFAULT_HIGH_SEVERITY_EVENTS,
    };
  }

  // ─── PUT /v1/early-warnings/config ────────────────────────────────────────

  async updateConfig(tenantId: string, dto: UpdateEarlyWarningConfigDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;

      const existing = await tx.earlyWarningConfig.findFirst({
        where: { tenant_id: tenantId },
      });

      const data: Record<string, unknown> = {};
      if (dto.is_enabled !== undefined) data.is_enabled = dto.is_enabled;
      if (dto.weights_json !== undefined) data.weights_json = dto.weights_json;
      if (dto.thresholds_json !== undefined) data.thresholds_json = dto.thresholds_json;
      if (dto.hysteresis_buffer !== undefined) data.hysteresis_buffer = dto.hysteresis_buffer;
      if (dto.routing_rules_json !== undefined) data.routing_rules_json = dto.routing_rules_json;
      if (dto.digest_day !== undefined) data.digest_day = dto.digest_day;
      if (dto.digest_recipients_json !== undefined)
        data.digest_recipients_json = dto.digest_recipients_json;
      if (dto.high_severity_events_json !== undefined)
        data.high_severity_events_json = dto.high_severity_events_json;

      if (existing) {
        return tx.earlyWarningConfig.update({
          where: { id: existing.id },
          data,
        });
      }

      // Create with defaults for fields not provided
      return tx.earlyWarningConfig.create({
        data: {
          tenant_id: tenantId,
          is_enabled: dto.is_enabled ?? false,
          weights_json: dto.weights_json ?? DEFAULT_WEIGHTS,
          thresholds_json: dto.thresholds_json ?? DEFAULT_THRESHOLDS,
          hysteresis_buffer: dto.hysteresis_buffer ?? 10,
          routing_rules_json: dto.routing_rules_json ?? DEFAULT_ROUTING_RULES,
          digest_day: dto.digest_day ?? 1,
          digest_recipients_json: dto.digest_recipients_json ?? [],
          high_severity_events_json: dto.high_severity_events_json ?? DEFAULT_HIGH_SEVERITY_EVENTS,
        },
      });
    });
  }
}
```

---

## Step 6 — EarlyWarningCohortService

**File:** `apps/api/src/modules/early-warning/early-warning-cohort.service.ts`

The dimensional pivot groups `student_risk_profiles` by the requested dimension and returns aggregate stats per group.

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { CohortCell, CohortQuery } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

interface RoleScopeFilter {
  studentIds?: string[];
  unrestricted: boolean;
}

interface ProfileRow {
  id: string;
  student_id: string;
  composite_score: number;
  attendance_score: number;
  grades_score: number;
  behaviour_score: number;
  wellbeing_score: number;
  engagement_score: number;
  risk_tier: string;
  student: {
    id: string;
    year_group_id: string | null;
    year_group?: { id: string; name: string } | null;
    class_enrolments?: Array<{
      class: {
        id: string;
        name: string;
        subject_id: string | null;
        subject?: { id: string; name: string } | null;
      };
    }>;
  };
}

@Injectable()
export class EarlyWarningCohortService {
  private readonly logger = new Logger(EarlyWarningCohortService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Role-scoping (mirrors EarlyWarningService logic) ─────────────────────

  private async resolveRoleScope(
    tenantId: string,
    userId: string,
    membershipId: string | null,
  ): Promise<RoleScopeFilter> {
    if (!membershipId) {
      return { unrestricted: false, studentIds: [] };
    }

    const membership = await this.prisma.tenantMembership.findFirst({
      where: { id: membershipId, tenant_id: tenantId, user_id: userId },
      include: {
        role: {
          include: {
            role_permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!membership) {
      return { unrestricted: false, studentIds: [] };
    }

    const permissions = membership.role.role_permissions.map((rp) => rp.permission.key);

    if (permissions.includes('early_warning.manage')) {
      return { unrestricted: true };
    }

    const yearGroupAssignments = await this.prisma.yearGroup.findMany({
      where: { tenant_id: tenantId, year_head_user_id: userId },
      select: { id: true },
    });

    if (yearGroupAssignments.length > 0) {
      const yearGroupIds = yearGroupAssignments.map((yg) => yg.id);
      const students = await this.prisma.student.findMany({
        where: {
          tenant_id: tenantId,
          year_group_id: { in: yearGroupIds },
          status: 'active',
        },
        select: { id: true },
      });
      return { unrestricted: false, studentIds: students.map((s) => s.id) };
    }

    const classStaffRows = await this.prisma.classStaff.findMany({
      where: { tenant_id: tenantId, user_id: userId },
      select: { class_id: true },
    });

    if (classStaffRows.length > 0) {
      const classIds = classStaffRows.map((cs) => cs.class_id);
      const enrolments = await this.prisma.classEnrolment.findMany({
        where: {
          tenant_id: tenantId,
          class_id: { in: classIds },
          status: 'active',
        },
        select: { student_id: true },
      });
      const uniqueStudentIds = [...new Set(enrolments.map((e) => e.student_id))];
      return { unrestricted: false, studentIds: uniqueStudentIds };
    }

    return { unrestricted: false, studentIds: [] };
  }

  // ─── GET /v1/early-warnings/cohort ────────────────────────────────────────

  async getCohortPivot(
    tenantId: string,
    userId: string,
    membershipId: string | null,
    query: CohortQuery,
  ): Promise<{ data: CohortCell[] }> {
    const [scope, academicYear] = await Promise.all([
      this.resolveRoleScope(tenantId, userId, membershipId),
      this.prisma.academicYear.findFirst({
        where: { tenant_id: tenantId, status: 'active' },
        select: { id: true },
      }),
    ]);

    if (!academicYear) {
      throw new NotFoundException({
        code: 'NO_ACTIVE_ACADEMIC_YEAR',
        message: 'No active academic year found for this tenant',
      });
    }

    // Fetch profiles with student relationships needed for grouping
    const whereClause: Record<string, unknown> = {
      tenant_id: tenantId,
      academic_year_id: academicYear.id,
    };
    if (!scope.unrestricted) {
      whereClause.student_id = { in: scope.studentIds ?? [] };
    }
    if (query.tier) {
      whereClause.risk_tier = query.tier;
    }
    if (query.year_group_id) {
      whereClause.student = { year_group_id: query.year_group_id };
    }
    if (query.class_id) {
      whereClause.student = {
        ...(whereClause.student as Record<string, unknown>),
        class_enrolments: {
          some: { class_id: query.class_id, status: 'active' },
        },
      };
    }

    const profiles = (await this.prisma.studentRiskProfile.findMany({
      where: whereClause,
      include: {
        student: {
          select: {
            id: true,
            year_group_id: true,
            year_group: { select: { id: true, name: true } },
            class_enrolments: {
              where: { status: 'active' },
              select: {
                class: {
                  select: {
                    id: true,
                    name: true,
                    subject_id: true,
                    subject: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
      },
    })) as unknown as ProfileRow[];

    // Group profiles by the requested dimension
    const groups = new Map<string, { groupId: string; groupKey: string; profiles: ProfileRow[] }>();

    for (const profile of profiles) {
      const entries = this.getGroupEntries(query.group_by, profile);
      for (const entry of entries) {
        const existing = groups.get(entry.groupId);
        if (existing) {
          existing.profiles.push(profile);
        } else {
          groups.set(entry.groupId, {
            groupId: entry.groupId,
            groupKey: entry.groupKey,
            profiles: [profile],
          });
        }
      }
    }

    // Compute aggregates per group
    const data: CohortCell[] = [];
    for (const group of groups.values()) {
      const n = group.profiles.length;
      if (n === 0) continue;

      const tierDist = { green: 0, yellow: 0, amber: 0, red: 0 };
      let sumComposite = 0;
      let sumAttendance = 0;
      let sumGrades = 0;
      let sumBehaviour = 0;
      let sumWellbeing = 0;
      let sumEngagement = 0;

      for (const p of group.profiles) {
        sumComposite += Number(p.composite_score);
        sumAttendance += Number(p.attendance_score);
        sumGrades += Number(p.grades_score);
        sumBehaviour += Number(p.behaviour_score);
        sumWellbeing += Number(p.wellbeing_score);
        sumEngagement += Number(p.engagement_score);
        const tier = p.risk_tier as keyof typeof tierDist;
        if (tier in tierDist) tierDist[tier]++;
      }

      data.push({
        groupKey: group.groupKey,
        groupId: group.groupId,
        studentCount: n,
        avgCompositeScore: Math.round((sumComposite / n) * 100) / 100,
        avgAttendanceScore: Math.round((sumAttendance / n) * 100) / 100,
        avgGradesScore: Math.round((sumGrades / n) * 100) / 100,
        avgBehaviourScore: Math.round((sumBehaviour / n) * 100) / 100,
        avgWellbeingScore: Math.round((sumWellbeing / n) * 100) / 100,
        avgEngagementScore: Math.round((sumEngagement / n) * 100) / 100,
        tierDistribution: tierDist,
      });
    }

    // Sort by avgCompositeScore descending
    data.sort((a, b) => b.avgCompositeScore - a.avgCompositeScore);

    return { data };
  }

  // ─── Grouping helpers ─────────────────────────────────────────────────────

  private getGroupEntries(
    groupBy: 'year_group' | 'class' | 'subject' | 'domain',
    profile: ProfileRow,
  ): Array<{ groupId: string; groupKey: string }> {
    switch (groupBy) {
      case 'year_group': {
        const yg = profile.student.year_group;
        if (!yg) return [];
        return [{ groupId: yg.id, groupKey: yg.name }];
      }
      case 'class': {
        const enrolments = profile.student.class_enrolments ?? [];
        return enrolments.map((e) => ({
          groupId: e.class.id,
          groupKey: e.class.name,
        }));
      }
      case 'subject': {
        const enrolments = profile.student.class_enrolments ?? [];
        const seen = new Set<string>();
        const entries: Array<{ groupId: string; groupKey: string }> = [];
        for (const e of enrolments) {
          if (e.class.subject && !seen.has(e.class.subject.id)) {
            seen.add(e.class.subject.id);
            entries.push({ groupId: e.class.subject.id, groupKey: e.class.subject.name });
          }
        }
        return entries;
      }
      case 'domain': {
        // When grouping by domain, each profile produces 5 entries (one per domain)
        // Each entry uses the domain's score as the "composite" for that cell
        return [
          { groupId: 'attendance', groupKey: 'Attendance' },
          { groupId: 'grades', groupKey: 'Grades' },
          { groupId: 'behaviour', groupKey: 'Behaviour' },
          { groupId: 'wellbeing', groupKey: 'Wellbeing' },
          { groupId: 'engagement', groupKey: 'Engagement' },
        ];
      }
    }
  }
}
```

---

## Step 7 — Controller Tests

**File:** `apps/api/src/modules/early-warning/early-warning.controller.spec.ts`

TDD pattern matching codebase convention: mock all three services, override guards, test each endpoint.

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { EarlyWarningCohortService } from './early-warning-cohort.service';
import { EarlyWarningConfigService } from './early-warning-config.service';
import { EarlyWarningController } from './early-warning.controller';
import { EarlyWarningService } from './early-warning.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT: TenantContext = {
  tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: 'user-uuid-1',
  tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  email: 'admin@test.com',
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// ─── Mock services ───────────────────────────────────────────────────────────

const mockEarlyWarningService = {
  listProfiles: jest.fn(),
  getTierSummary: jest.fn(),
  getStudentDetail: jest.fn(),
  acknowledgeProfile: jest.fn(),
  assignStaff: jest.fn(),
};

const mockConfigService = {
  getConfig: jest.fn(),
  updateConfig: jest.fn(),
};

const mockCohortService = {
  getCohortPivot: jest.fn(),
};

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('EarlyWarningController', () => {
  let controller: EarlyWarningController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EarlyWarningController],
      providers: [
        { provide: EarlyWarningService, useValue: mockEarlyWarningService },
        { provide: EarlyWarningConfigService, useValue: mockConfigService },
        { provide: EarlyWarningCohortService, useValue: mockCohortService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EarlyWarningController>(EarlyWarningController);
    jest.clearAllMocks();
  });

  // ─── GET /v1/early-warnings ─────────────────────────────────────────────

  describe('list', () => {
    it('should delegate to earlyWarningService.listProfiles with tenant, user, and query', async () => {
      const query = {
        page: 1,
        pageSize: 20,
        sort: 'composite_score' as const,
        order: 'desc' as const,
      };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockEarlyWarningService.listProfiles.mockResolvedValue(expected);

      const result = await controller.list(TENANT, USER, query as never);

      expect(mockEarlyWarningService.listProfiles).toHaveBeenCalledWith(
        TENANT.tenant_id,
        USER.sub,
        USER.membership_id,
        query,
      );
      expect(result).toEqual(expected);
    });
  });

  // ─── GET /v1/early-warnings/summary ─────────────────────────────────────

  describe('summary', () => {
    it('should delegate to earlyWarningService.getTierSummary', async () => {
      const query = {};
      const expected = { green: 10, yellow: 5, amber: 3, red: 1, total: 19 };
      mockEarlyWarningService.getTierSummary.mockResolvedValue(expected);

      const result = await controller.summary(TENANT, USER, query as never);

      expect(mockEarlyWarningService.getTierSummary).toHaveBeenCalledWith(
        TENANT.tenant_id,
        USER.sub,
        USER.membership_id,
        query,
      );
      expect(result).toEqual(expected);
    });
  });

  // ─── GET /v1/early-warnings/cohort ──────────────────────────────────────

  describe('cohort', () => {
    it('should delegate to cohortService.getCohortPivot', async () => {
      const query = { group_by: 'year_group' as const, period: 'current' as const };
      const expected = { data: [] };
      mockCohortService.getCohortPivot.mockResolvedValue(expected);

      const result = await controller.cohort(TENANT, USER, query as never);

      expect(mockCohortService.getCohortPivot).toHaveBeenCalledWith(
        TENANT.tenant_id,
        USER.sub,
        USER.membership_id,
        query,
      );
      expect(result).toEqual(expected);
    });
  });

  // ─── GET /v1/early-warnings/config ──────────────────────────────────────

  describe('getConfig', () => {
    it('should delegate to configService.getConfig with tenant_id', async () => {
      const expected = { id: 'cfg-1', is_enabled: true, weights_json: {} };
      mockConfigService.getConfig.mockResolvedValue(expected);

      const result = await controller.getConfig(TENANT);

      expect(mockConfigService.getConfig).toHaveBeenCalledWith(TENANT.tenant_id);
      expect(result).toEqual(expected);
    });
  });

  // ─── PUT /v1/early-warnings/config ──────────────────────────────────────

  describe('updateConfig', () => {
    it('should delegate to configService.updateConfig with tenant_id and dto', async () => {
      const dto = { is_enabled: true };
      const expected = { id: 'cfg-1', is_enabled: true };
      mockConfigService.updateConfig.mockResolvedValue(expected);

      const result = await controller.updateConfig(TENANT, dto as never);

      expect(mockConfigService.updateConfig).toHaveBeenCalledWith(TENANT.tenant_id, dto);
      expect(result).toEqual(expected);
    });
  });

  // ─── GET /v1/early-warnings/:studentId ──────────────────────────────────

  describe('getStudentDetail', () => {
    it('should delegate to earlyWarningService.getStudentDetail with all args', async () => {
      const expected = { id: 'profile-1', student_id: STUDENT_ID, composite_score: 65 };
      mockEarlyWarningService.getStudentDetail.mockResolvedValue(expected);

      const result = await controller.getStudentDetail(TENANT, USER, STUDENT_ID);

      expect(mockEarlyWarningService.getStudentDetail).toHaveBeenCalledWith(
        TENANT.tenant_id,
        USER.sub,
        USER.membership_id,
        STUDENT_ID,
      );
      expect(result).toEqual(expected);
    });
  });

  // ─── POST /v1/early-warnings/:studentId/acknowledge ────────────────────

  describe('acknowledge', () => {
    it('should delegate to earlyWarningService.acknowledgeProfile and return void', async () => {
      mockEarlyWarningService.acknowledgeProfile.mockResolvedValue(undefined);

      await controller.acknowledge(TENANT, USER, STUDENT_ID);

      expect(mockEarlyWarningService.acknowledgeProfile).toHaveBeenCalledWith(
        TENANT.tenant_id,
        USER.sub,
        STUDENT_ID,
      );
    });
  });

  // ─── POST /v1/early-warnings/:studentId/assign ─────────────────────────

  describe('assign', () => {
    it('should delegate to earlyWarningService.assignStaff with tenant, user, studentId, dto', async () => {
      const dto = { assigned_to_user_id: 'staff-uuid-1' };
      const expected = {
        id: 'profile-1',
        assigned_to_user_id: 'staff-uuid-1',
        assigned_at: '2026-03-28T10:00:00.000Z',
      };
      mockEarlyWarningService.assignStaff.mockResolvedValue(expected);

      const result = await controller.assign(TENANT, USER, STUDENT_ID, dto as never);

      expect(mockEarlyWarningService.assignStaff).toHaveBeenCalledWith(
        TENANT.tenant_id,
        USER.sub,
        STUDENT_ID,
        dto,
      );
      expect(result).toEqual(expected);
    });
  });
});
```

---

## Step 8 — EarlyWarningService Tests

**File:** `apps/api/src/modules/early-warning/early-warning.service.spec.ts`

```typescript
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { EarlyWarningService } from './early-warning.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-uuid-1';
const MEMBERSHIP_ID = 'mem-1';
const STUDENT_ID = 'student-uuid-1';
const ACADEMIC_YEAR_ID = 'ay-uuid-1';
const PROFILE_ID = 'profile-uuid-1';

// ─── RLS mock ────────────────────────────────────────────────────────────────

const mockRlsTx = {
  studentRiskProfile: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

const buildMockPrisma = () => ({
  tenantMembership: {
    findFirst: jest.fn(),
  },
  yearGroup: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  classStaff: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  classEnrolment: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  student: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  academicYear: {
    findFirst: jest.fn(),
  },
  studentRiskProfile: {
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    groupBy: jest.fn(),
  },
  studentRiskSignal: {
    findMany: jest.fn(),
  },
  earlyWarningTierTransition: {
    findMany: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
  },
});

// ─── Helper: mock admin membership ──────────────────────────────────────────

const adminMembership = {
  id: MEMBERSHIP_ID,
  role: {
    role_permissions: [
      { permission: { key: 'early_warning.manage' } },
      { permission: { key: 'early_warning.view' } },
    ],
  },
};

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('EarlyWarningService', () => {
  let service: EarlyWarningService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [EarlyWarningService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<EarlyWarningService>(EarlyWarningService);

    // Reset RLS mocks
    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => fn.mockReset()),
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listProfiles ─────────────────────────────────────────────────────

  describe('listProfiles', () => {
    const query = {
      page: 1,
      pageSize: 20,
      sort: 'composite_score' as const,
      order: 'desc' as const,
    };

    it('should return paginated profiles for admin (unrestricted)', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.count.mockResolvedValue(1);
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([
        {
          id: PROFILE_ID,
          student_id: STUDENT_ID,
          composite_score: 65,
          risk_tier: 'amber',
          tier_entered_at: new Date('2026-03-25'),
          attendance_score: 70,
          grades_score: 60,
          behaviour_score: 55,
          wellbeing_score: 50,
          engagement_score: 40,
          signal_summary_json: { topSignal: 'Absent 3 consecutive days' },
          trend_json: [50, 55, 60, 65],
          assigned_to_user_id: null,
          last_computed_at: new Date('2026-03-28'),
          student: { id: STUDENT_ID, first_name: 'John', last_name: 'Doe' },
          assigned_to_user: null,
        },
      ]);

      const result = await service.listProfiles(TENANT_ID, USER_ID, MEMBERSHIP_ID, query);

      expect(result.meta.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].student_name).toBe('John Doe');
      expect(result.data[0].composite_score).toBe(65);
      expect(result.data[0].top_signal).toBe('Absent 3 consecutive days');
    });

    it('should throw NotFoundException when no active academic year', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);

      await expect(service.listProfiles(TENANT_ID, USER_ID, MEMBERSHIP_ID, query)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should scope to teacher classes when user has no manage permission', async () => {
      // Teacher membership — no early_warning.manage
      mockPrisma.tenantMembership.findFirst.mockResolvedValue({
        id: MEMBERSHIP_ID,
        role: {
          role_permissions: [{ permission: { key: 'early_warning.view' } }],
        },
      });
      mockPrisma.yearGroup.findMany.mockResolvedValue([]); // Not a year head
      mockPrisma.classStaff.findMany.mockResolvedValue([{ class_id: 'class-1' }]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        { student_id: 'student-a' },
        { student_id: 'student-b' },
      ]);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.count.mockResolvedValue(0);
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([]);

      const result = await service.listProfiles(TENANT_ID, USER_ID, MEMBERSHIP_ID, query);

      expect(result.data).toEqual([]);
      // Verify the where clause was scoped
      expect(mockPrisma.studentRiskProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: { in: ['student-a', 'student-b'] },
          }),
        }),
      );
    });
  });

  // ─── getTierSummary ───────────────────────────────────────────────────

  describe('getTierSummary', () => {
    it('should return tier distribution counts', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.groupBy.mockResolvedValue([
        { risk_tier: 'green', _count: { id: 180 } },
        { risk_tier: 'yellow', _count: { id: 28 } },
        { risk_tier: 'amber', _count: { id: 12 } },
        { risk_tier: 'red', _count: { id: 3 } },
      ]);

      const result = await service.getTierSummary(TENANT_ID, USER_ID, MEMBERSHIP_ID, {});

      expect(result).toEqual({
        green: 180,
        yellow: 28,
        amber: 12,
        red: 3,
        total: 223,
      });
    });
  });

  // ─── getStudentDetail ─────────────────────────────────────────────────

  describe('getStudentDetail', () => {
    it('should return full student detail with signals and transitions', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
        composite_score: 65,
        risk_tier: 'amber',
        tier_entered_at: new Date('2026-03-25'),
        attendance_score: 70,
        grades_score: 60,
        behaviour_score: 55,
        wellbeing_score: 50,
        engagement_score: 40,
        signal_summary_json: { text: 'Test summary' },
        trend_json: [50, 55, 60, 65],
        assigned_to_user_id: null,
        assigned_to_user: null,
        assigned_at: null,
        last_computed_at: new Date('2026-03-28'),
        student: { id: STUDENT_ID, first_name: 'John', last_name: 'Doe' },
      });
      mockPrisma.studentRiskSignal.findMany.mockResolvedValue([
        {
          id: 'sig-1',
          domain: 'attendance',
          signal_type: 'consecutive_absences',
          severity: 'high',
          score_contribution: 25,
          details_json: { days: 3 },
          detected_at: new Date('2026-03-27'),
        },
      ]);
      mockPrisma.earlyWarningTierTransition.findMany.mockResolvedValue([
        {
          id: 'trans-1',
          from_tier: 'yellow',
          to_tier: 'amber',
          composite_score: 55,
          trigger_signals_json: { signal: 'attendance' },
          transitioned_at: new Date('2026-03-25'),
        },
      ]);

      const result = await service.getStudentDetail(TENANT_ID, USER_ID, MEMBERSHIP_ID, STUDENT_ID);

      expect(result.student_name).toBe('John Doe');
      expect(result.signals).toHaveLength(1);
      expect(result.signals[0].signal_type).toBe('consecutive_absences');
      expect(result.transitions).toHaveLength(1);
      expect(result.transitions[0].to_tier).toBe('amber');
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.getStudentDetail(TENANT_ID, USER_ID, MEMBERSHIP_ID, STUDENT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when teacher cannot access student', async () => {
      // Teacher membership — no early_warning.manage
      mockPrisma.tenantMembership.findFirst.mockResolvedValue({
        id: MEMBERSHIP_ID,
        role: {
          role_permissions: [{ permission: { key: 'early_warning.view' } }],
        },
      });
      mockPrisma.yearGroup.findMany.mockResolvedValue([]);
      mockPrisma.classStaff.findMany.mockResolvedValue([{ class_id: 'class-1' }]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        { student_id: 'other-student' }, // Not STUDENT_ID
      ]);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });

      await expect(
        service.getStudentDetail(TENANT_ID, USER_ID, MEMBERSHIP_ID, STUDENT_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── acknowledgeProfile ───────────────────────────────────────────────

  describe('acknowledgeProfile', () => {
    it('should update the profile with acknowledged_by and acknowledged_at', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockRlsTx.studentRiskProfile.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID,
      });
      mockRlsTx.studentRiskProfile.update.mockResolvedValue({});

      await service.acknowledgeProfile(TENANT_ID, USER_ID, STUDENT_ID);

      expect(mockRlsTx.studentRiskProfile.update).toHaveBeenCalledWith({
        where: { id: PROFILE_ID },
        data: {
          acknowledged_by_user_id: USER_ID,
          acknowledged_at: expect.any(Date),
        },
      });
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockRlsTx.studentRiskProfile.findFirst.mockResolvedValue(null);

      await expect(service.acknowledgeProfile(TENANT_ID, USER_ID, STUDENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── assignStaff ──────────────────────────────────────────────────────

  describe('assignStaff', () => {
    const dto = { assigned_to_user_id: 'staff-uuid-1' };

    it('should assign a staff member to the risk profile', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'staff-uuid-1' });
      mockRlsTx.studentRiskProfile.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID,
      });
      mockRlsTx.studentRiskProfile.update.mockResolvedValue({
        id: PROFILE_ID,
        assigned_to_user_id: 'staff-uuid-1',
        assigned_at: new Date('2026-03-28T10:00:00Z'),
      });

      const result = await service.assignStaff(TENANT_ID, USER_ID, STUDENT_ID, dto);

      expect(result.assigned_to_user_id).toBe('staff-uuid-1');
      expect(mockRlsTx.studentRiskProfile.update).toHaveBeenCalledWith({
        where: { id: PROFILE_ID },
        data: {
          assigned_to_user_id: 'staff-uuid-1',
          assigned_at: expect.any(Date),
        },
      });
    });

    it('should throw NotFoundException when target user does not exist', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.user.findFirst.mockResolvedValue(null);

      await expect(service.assignStaff(TENANT_ID, USER_ID, STUDENT_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'staff-uuid-1' });
      mockRlsTx.studentRiskProfile.findFirst.mockResolvedValue(null);

      await expect(service.assignStaff(TENANT_ID, USER_ID, STUDENT_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
```

---

## Step 9 — EarlyWarningConfigService Tests

**File:** `apps/api/src/modules/early-warning/early-warning-config.service.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { EarlyWarningConfigService } from './early-warning-config.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONFIG_ID = 'config-uuid-1';

// ─── RLS mock ────────────────────────────────────────────────────────────────

const mockRlsTx = {
  earlyWarningConfig: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('EarlyWarningConfigService', () => {
  let service: EarlyWarningConfigService;
  let mockPrisma: {
    earlyWarningConfig: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      earlyWarningConfig: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [EarlyWarningConfigService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<EarlyWarningConfigService>(EarlyWarningConfigService);

    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => fn.mockReset()),
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getConfig ────────────────────────────────────────────────────────

  describe('getConfig', () => {
    it('should return existing config from database', async () => {
      const existing = {
        id: CONFIG_ID,
        tenant_id: TENANT_ID,
        is_enabled: true,
        weights_json: { attendance: 30, grades: 30, behaviour: 20, wellbeing: 10, engagement: 10 },
        thresholds_json: { green: 0, yellow: 30, amber: 50, red: 75 },
        hysteresis_buffer: 10,
        routing_rules_json: { yellow: { role: 'homeroom_teacher' } },
        digest_day: 1,
        digest_recipients_json: ['user-1'],
        high_severity_events_json: ['suspension'],
      };
      mockPrisma.earlyWarningConfig.findFirst.mockResolvedValue(existing);

      const result = await service.getConfig(TENANT_ID);

      expect(result.id).toBe(CONFIG_ID);
      expect(result.is_enabled).toBe(true);
      expect(result.weights_json).toEqual(existing.weights_json);
    });

    it('should return defaults when no config exists', async () => {
      mockPrisma.earlyWarningConfig.findFirst.mockResolvedValue(null);

      const result = await service.getConfig(TENANT_ID);

      expect(result.id).toBeNull();
      expect(result.is_enabled).toBe(false);
      expect(result.weights_json).toEqual({
        attendance: 25,
        grades: 25,
        behaviour: 20,
        wellbeing: 20,
        engagement: 10,
      });
      expect(result.thresholds_json).toEqual({
        green: 0,
        yellow: 30,
        amber: 50,
        red: 75,
      });
      expect(result.hysteresis_buffer).toBe(10);
    });
  });

  // ─── updateConfig ─────────────────────────────────────────────────────

  describe('updateConfig', () => {
    it('should update existing config', async () => {
      mockRlsTx.earlyWarningConfig.findFirst.mockResolvedValue({
        id: CONFIG_ID,
        tenant_id: TENANT_ID,
      });
      const updated = { id: CONFIG_ID, is_enabled: true };
      mockRlsTx.earlyWarningConfig.update.mockResolvedValue(updated);

      const result = await service.updateConfig(TENANT_ID, { is_enabled: true });

      expect(result).toEqual(updated);
      expect(mockRlsTx.earlyWarningConfig.update).toHaveBeenCalledWith({
        where: { id: CONFIG_ID },
        data: { is_enabled: true },
      });
    });

    it('should create config with defaults when no existing config', async () => {
      mockRlsTx.earlyWarningConfig.findFirst.mockResolvedValue(null);
      const created = { id: 'new-cfg', tenant_id: TENANT_ID, is_enabled: true };
      mockRlsTx.earlyWarningConfig.create.mockResolvedValue(created);

      const result = await service.updateConfig(TENANT_ID, { is_enabled: true });

      expect(result).toEqual(created);
      expect(mockRlsTx.earlyWarningConfig.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          is_enabled: true,
          hysteresis_buffer: 10,
          digest_day: 1,
        }),
      });
    });

    it('should only include fields present in the dto', async () => {
      mockRlsTx.earlyWarningConfig.findFirst.mockResolvedValue({
        id: CONFIG_ID,
        tenant_id: TENANT_ID,
      });
      mockRlsTx.earlyWarningConfig.update.mockResolvedValue({});

      await service.updateConfig(TENANT_ID, { hysteresis_buffer: 15 });

      expect(mockRlsTx.earlyWarningConfig.update).toHaveBeenCalledWith({
        where: { id: CONFIG_ID },
        data: { hysteresis_buffer: 15 },
      });
    });
  });
});
```

---

## Step 10 — EarlyWarningCohortService Tests

**File:** `apps/api/src/modules/early-warning/early-warning-cohort.service.spec.ts`

```typescript
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { EarlyWarningCohortService } from './early-warning-cohort.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-uuid-1';
const MEMBERSHIP_ID = 'mem-1';
const ACADEMIC_YEAR_ID = 'ay-uuid-1';

// ─── Admin membership fixture ────────────────────────────────────────────────

const adminMembership = {
  id: MEMBERSHIP_ID,
  role: {
    role_permissions: [
      { permission: { key: 'early_warning.manage' } },
      { permission: { key: 'early_warning.view' } },
    ],
  },
};

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('EarlyWarningCohortService', () => {
  let service: EarlyWarningCohortService;
  let mockPrisma: {
    tenantMembership: { findFirst: jest.Mock };
    yearGroup: { findMany: jest.Mock };
    classStaff: { findMany: jest.Mock };
    classEnrolment: { findMany: jest.Mock };
    student: { findMany: jest.Mock };
    academicYear: { findFirst: jest.Mock };
    studentRiskProfile: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      tenantMembership: { findFirst: jest.fn() },
      yearGroup: { findMany: jest.fn().mockResolvedValue([]) },
      classStaff: { findMany: jest.fn().mockResolvedValue([]) },
      classEnrolment: { findMany: jest.fn().mockResolvedValue([]) },
      student: { findMany: jest.fn().mockResolvedValue([]) },
      academicYear: { findFirst: jest.fn() },
      studentRiskProfile: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [EarlyWarningCohortService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<EarlyWarningCohortService>(EarlyWarningCohortService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getCohortPivot — year_group ──────────────────────────────────────

  describe('getCohortPivot — year_group', () => {
    it('should group profiles by year group with correct averages', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([
        {
          id: 'p1',
          student_id: 's1',
          composite_score: 60,
          attendance_score: 70,
          grades_score: 50,
          behaviour_score: 40,
          wellbeing_score: 30,
          engagement_score: 20,
          risk_tier: 'amber',
          student: {
            id: 's1',
            year_group_id: 'yg-1',
            year_group: { id: 'yg-1', name: '1st Year' },
            class_enrolments: [],
          },
        },
        {
          id: 'p2',
          student_id: 's2',
          composite_score: 40,
          attendance_score: 50,
          grades_score: 30,
          behaviour_score: 20,
          wellbeing_score: 10,
          engagement_score: 10,
          risk_tier: 'yellow',
          student: {
            id: 's2',
            year_group_id: 'yg-1',
            year_group: { id: 'yg-1', name: '1st Year' },
            class_enrolments: [],
          },
        },
        {
          id: 'p3',
          student_id: 's3',
          composite_score: 80,
          attendance_score: 90,
          grades_score: 70,
          behaviour_score: 60,
          wellbeing_score: 50,
          engagement_score: 40,
          risk_tier: 'red',
          student: {
            id: 's3',
            year_group_id: 'yg-2',
            year_group: { id: 'yg-2', name: '2nd Year' },
            class_enrolments: [],
          },
        },
      ]);

      const result = await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'year_group',
        period: 'current',
      });

      expect(result.data).toHaveLength(2);

      // Sorted by avgCompositeScore desc → 2nd Year (80) first, 1st Year (50) second
      const secondYear = result.data[0];
      expect(secondYear.groupKey).toBe('2nd Year');
      expect(secondYear.studentCount).toBe(1);
      expect(secondYear.avgCompositeScore).toBe(80);
      expect(secondYear.tierDistribution.red).toBe(1);

      const firstYear = result.data[1];
      expect(firstYear.groupKey).toBe('1st Year');
      expect(firstYear.studentCount).toBe(2);
      expect(firstYear.avgCompositeScore).toBe(50);
      expect(firstYear.tierDistribution.amber).toBe(1);
      expect(firstYear.tierDistribution.yellow).toBe(1);
    });

    it('should throw NotFoundException when no active academic year', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);

      await expect(
        service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
          group_by: 'year_group',
          period: 'current',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getCohortPivot — class ───────────────────────────────────────────

  describe('getCohortPivot — class', () => {
    it('should group profiles by class', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([
        {
          id: 'p1',
          student_id: 's1',
          composite_score: 60,
          attendance_score: 70,
          grades_score: 50,
          behaviour_score: 40,
          wellbeing_score: 30,
          engagement_score: 20,
          risk_tier: 'amber',
          student: {
            id: 's1',
            year_group_id: 'yg-1',
            year_group: null,
            class_enrolments: [
              { class: { id: 'cls-1', name: 'Maths A', subject_id: null, subject: null } },
              { class: { id: 'cls-2', name: 'English B', subject_id: null, subject: null } },
            ],
          },
        },
      ]);

      const result = await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'class',
        period: 'current',
      });

      expect(result.data).toHaveLength(2);
      const classNames = result.data.map((c) => c.groupKey);
      expect(classNames).toContain('Maths A');
      expect(classNames).toContain('English B');
    });
  });

  // ─── getCohortPivot — empty results ───────────────────────────────────

  describe('getCohortPivot — empty', () => {
    it('should return empty data array when no profiles exist', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([]);

      const result = await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'year_group',
        period: 'current',
      });

      expect(result.data).toEqual([]);
    });
  });
});
```

---

## Step 11 — Module Registration

**File:** `apps/api/src/modules/early-warning/early-warning.module.ts` (MODIFY)

Add the three new services to the module providers. The module was scaffolded in Phase A.

```typescript
// Add to existing providers array:
import { EarlyWarningCohortService } from './early-warning-cohort.service';
import { EarlyWarningConfigService } from './early-warning-config.service';
import { EarlyWarningController } from './early-warning.controller';
import { EarlyWarningService } from './early-warning.service';

@Module({
  controllers: [EarlyWarningController],
  providers: [
    EarlyWarningService,
    EarlyWarningConfigService,
    EarlyWarningCohortService,
    // ... existing providers from Phase A/B/C (collectors, engine, etc.)
  ],
  exports: [
    EarlyWarningService,
    EarlyWarningConfigService,
    // ... existing exports
  ],
})
export class EarlyWarningModule {}
```

---

## Step 12 — Schema Note: `acknowledged_by` Columns

The `acknowledge` endpoint writes `acknowledged_by_user_id` and `acknowledged_at` to `student_risk_profiles`. These columns must exist in the table.

**Check Phase A migration:** If these columns are not already in the `student_risk_profiles` table definition, add a migration amendment:

```sql
ALTER TABLE student_risk_profiles
  ADD COLUMN acknowledged_by_user_id UUID REFERENCES users(id),
  ADD COLUMN acknowledged_at TIMESTAMPTZ;
```

And update the Prisma schema:

```prisma
acknowledged_by_user_id String? @db.Uuid
acknowledged_at        DateTime? @db.Timestamptz
acknowledged_by_user   User?    @relation("risk_profile_acknowledged_by", fields: [acknowledged_by_user_id], references: [id])
```

---

## Verification Checklist

| #   | Check                                                                 | How                                             |
| --- | --------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | All 8 endpoints compile                                               | `turbo type-check`                              |
| 2   | All 8 endpoints lint                                                  | `turbo lint`                                    |
| 3   | Controller spec passes                                                | `npx jest early-warning.controller.spec.ts`     |
| 4   | Main service spec passes                                              | `npx jest early-warning.service.spec.ts`        |
| 5   | Config service spec passes                                            | `npx jest early-warning-config.service.spec.ts` |
| 6   | Cohort service spec passes                                            | `npx jest early-warning-cohort.service.spec.ts` |
| 7   | Static routes before :studentId                                       | Visual inspection of controller                 |
| 8   | Role-scoping: teacher sees only their students                        | Test case in service spec                       |
| 9   | Role-scoping: admin sees all students                                 | Test case in service spec                       |
| 10  | Role-scoping: ForbiddenException for out-of-scope student             | Test case in service spec                       |
| 11  | RLS used for all write operations (acknowledge, assign, updateConfig) | Code review                                     |
| 12  | Reads use direct prisma with tenant_id in where                       | Code review                                     |
| 13  | Weights sum validation at Zod level                                   | Schema test / manual                            |
| 14  | Thresholds ascending order validation at Zod level                    | Schema test / manual                            |
| 15  | Full regression suite passes                                          | `turbo test`                                    |

---

## Import Ordering Reference

Every file follows the three-block import pattern:

1. **External packages** — `@nestjs/common`, `@nestjs/testing`, `@prisma/client`, `@school/shared`, `zod`
2. **Internal shared** — `../../common/*` imports
3. **Relative** — `./service`, `./dto/*`

Blank line between each group. Alphabetical within groups. `import type` for type-only imports.

---

## Architecture Impact

After this phase is complete, the following architecture files need updating:

- **`architecture/module-blast-radius.md`** — Add `early-warning` module with its 3 services as exports, and its consumers (controller only within module for now)
- **`architecture/feature-map.md`** — Add 8 endpoints to the early-warning section (wait for user confirmation per feature-map-maintenance.md)
- No new jobs, state machines, or danger zones from this phase (those are in Phase D)
