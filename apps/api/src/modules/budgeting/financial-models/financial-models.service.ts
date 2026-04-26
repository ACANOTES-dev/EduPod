import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import {
  buildDefaultDrivers,
  driversSchema,
  runEngine,
  type Drivers,
  type EngineHorizon,
  type FinancialModelStatus,
  type SourceDataSnapshot,
  type SourceFeeStructureForYearGroup,
  type SourceStudentByYearGroup,
} from '@school/shared/budgeting';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { FinanceReadFacade } from '../../finance/finance-read.facade';
import { HouseholdReadFacade } from '../../households/household-read.facade';
import { PrismaService } from '../../prisma/prisma.service';
import { StaffProfileReadFacade } from '../../staff-profiles/staff-profile-read.facade';
import { StudentReadFacade } from '../../students/student-read.facade';
import { TenantReadFacade } from '../../tenants/tenant-read.facade';

import type { CreateFinancialModelDto } from './dto/create-financial-model.dto';
import type { ListFinancialModelsQueryDto } from './dto/list-financial-models.dto';
import type { UpdateFinancialModelDto } from './dto/update-financial-model.dto';
import {
  addYears,
  buildLineItemRow,
  toDetail,
  toLineItemResponse,
  toScenarioSummary,
  toSummary,
  type EngineRunResponse,
  type FinancialModelDetailResponse,
  type FinancialModelRowSelected,
  type FinancialModelSummaryResponse,
  type LineItemSelected,
} from './financial-models.types';

/**
 * FinancialModelsService — CRUD + engine orchestration for the annual
 * financial-model aggregate root. Phase 03 of the modeling rebuild.
 *
 * Source-snapshot capture (modeling/PLAN.md §4) happens here on `create`
 * by composing reads from `Student`, `StaffProfile`, `FeeStructure`,
 * `Household`, `Tenant`, and `AcademicYear` facades. The snapshot is
 * persisted on `financial_models.source_snapshot_json` so the engine
 * stays IO-free on every subsequent recompute (drivers tune, scenario
 * compare, snapshot publish).
 */
@Injectable()
export class FinancialModelsService {
  private readonly logger = new Logger(FinancialModelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly householdReadFacade: HouseholdReadFacade,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly financeReadFacade: FinanceReadFacade,
    private readonly tenantReadFacade: TenantReadFacade,
  ) {}

  // ─── findAll ────────────────────────────────────────────────────────────

  async findAll(
    tenantId: string,
    filters: ListFinancialModelsQueryDto,
  ): Promise<{
    data: FinancialModelSummaryResponse[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const { page, pageSize, status, search } = filters;
    const skip = (page - 1) * pageSize;

    const where: Prisma.FinancialModelWhereInput = { tenant_id: tenantId };
    if (status) {
      where.status = status;
    } else {
      // Default: hide archived rows. Caller opts in via status='archived'.
      where.archived_at = null;
    }
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [rows, total] = await Promise.all([
      this.prisma.financialModel.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.financialModel.count({ where }),
    ]);

    return {
      data: rows.map((row) => toSummary(row as FinancialModelRowSelected)),
      meta: { page, pageSize, total },
    };
  }

  // ─── findOne ────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string): Promise<FinancialModelDetailResponse> {
    const row = await this.prisma.financialModel.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'FINANCIAL_MODEL_NOT_FOUND',
        message: `Financial model with id "${id}" not found`,
      });
    }
    const [scenarios, lineItems] = await Promise.all([
      this.prisma.scenario.findMany({
        where: { tenant_id: tenantId, parent_model_id: id },
        orderBy: { position: 'asc' },
      }),
      this.prisma.financialModelLineItem.findMany({
        where: { tenant_id: tenantId, parent_model_id: id, scenario_id: null },
        orderBy: [{ fiscal_year: 'asc' }, { category: 'asc' }, { subcategory: 'asc' }],
      }),
    ]);

    return {
      model: toDetail(row as FinancialModelRowSelected),
      scenarios: scenarios.map(toScenarioSummary),
      line_items: lineItems.map((li) => toLineItemResponse(li as LineItemSelected)),
    };
  }

  // ─── create ─────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    userId: string,
    dto: CreateFinancialModelDto,
  ): Promise<EngineRunResponse> {
    const fiscalYearStart = new Date(dto.fiscal_year_start);
    if (Number.isNaN(fiscalYearStart.getTime())) {
      throw new ConflictException({
        code: 'INVALID_FISCAL_YEAR_START',
        message: `fiscal_year_start "${dto.fiscal_year_start}" could not be parsed as a date`,
      });
    }
    const horizonYears = (dto.horizon_years ?? 1) as EngineHorizon;
    const fiscalYearEnd = addYears(fiscalYearStart, horizonYears);

    const source = await this.captureSourceSnapshot(tenantId, fiscalYearStart, fiscalYearEnd);
    const drivers = dto.drivers
      ? driversSchema.parse(dto.drivers)
      : buildDefaultDrivers({
          year_group_ids: source.students_by_year_group.map((yg) => yg.year_group_id),
          department_ids: source.staff_by_department.map((dept) => dept.department_id),
          prior_year_donations_actual: source.prior_year_actuals?.donations,
          prior_year_grants_actual: source.prior_year_actuals?.grants,
        });

    const engineOutputs = runEngine({ drivers, source, horizon_years: horizonYears });

    const result = await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      const created = await txdb.financialModel.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          description: dto.description ?? null,
          fiscal_year_start: fiscalYearStart,
          fiscal_year_end: fiscalYearEnd,
          horizon_years: horizonYears,
          drivers: drivers as unknown as Prisma.InputJsonValue,
          source_snapshot_json: source as unknown as Prisma.InputJsonValue,
          status: 'draft',
          created_by: userId,
        },
      });
      if (engineOutputs.line_items.length > 0) {
        await txdb.financialModelLineItem.createMany({
          data: engineOutputs.line_items.map((li) => buildLineItemRow(tenantId, created.id, li)),
        });
      }
      const persisted = await txdb.financialModelLineItem.findMany({
        where: { tenant_id: tenantId, parent_model_id: created.id, scenario_id: null },
        orderBy: [{ fiscal_year: 'asc' }, { category: 'asc' }, { subcategory: 'asc' }],
      });
      return { created, persisted };
    });

    return {
      model: toDetail(result.created as FinancialModelRowSelected),
      scenarios: [],
      line_items: result.persisted.map((li) => toLineItemResponse(li as LineItemSelected)),
      totals_by_year: engineOutputs.totals_by_year,
      per_pupil_unit_economics: engineOutputs.per_pupil_unit_economics,
      warnings: engineOutputs.warnings,
    };
  }

  // ─── update ─────────────────────────────────────────────────────────────

  async update(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateFinancialModelDto,
  ): Promise<EngineRunResponse> {
    const existing = await this.prisma.financialModel.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'FINANCIAL_MODEL_NOT_FOUND',
        message: `Financial model with id "${id}" not found`,
      });
    }

    const driversChanged = dto.drivers !== undefined;
    const horizonChanged =
      dto.horizon_years !== undefined && dto.horizon_years !== existing.horizon_years;
    const shouldRecompute = driversChanged || horizonChanged;

    const nextDrivers: Drivers = driversChanged
      ? driversSchema.parse(dto.drivers)
      : (existing.drivers as unknown as Drivers);
    const nextHorizon = (dto.horizon_years ?? existing.horizon_years) as EngineHorizon;
    const source = existing.source_snapshot_json as unknown as SourceDataSnapshot;

    const engineOutputs = shouldRecompute
      ? runEngine({ drivers: nextDrivers, source, horizon_years: nextHorizon })
      : null;

    const result = await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      if (engineOutputs) {
        // Replace ONLY rows that the engine owns: derived, unlocked, base-case.
        // Custom + override + locked rows survive untouched (Phase 04 contract).
        await txdb.financialModelLineItem.deleteMany({
          where: {
            tenant_id: tenantId,
            parent_model_id: id,
            scenario_id: null,
            source: 'driver_derived',
            is_locked: false,
          },
        });
        if (engineOutputs.line_items.length > 0) {
          await txdb.financialModelLineItem.createMany({
            data: engineOutputs.line_items.map((li) => buildLineItemRow(tenantId, id, li)),
          });
        }
      }
      const fiscalYearEnd = horizonChanged
        ? addYears(existing.fiscal_year_start, nextHorizon)
        : undefined;
      const updated = await txdb.financialModel.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.horizon_years !== undefined && { horizon_years: dto.horizon_years }),
          ...(fiscalYearEnd && { fiscal_year_end: fiscalYearEnd }),
          ...(driversChanged && { drivers: nextDrivers as unknown as Prisma.InputJsonValue }),
          // Editing a published model creates a new draft state.
          ...(existing.status === 'published' && { status: 'draft' }),
        },
      });
      const persisted = await txdb.financialModelLineItem.findMany({
        where: { tenant_id: tenantId, parent_model_id: id, scenario_id: null },
        orderBy: [{ fiscal_year: 'asc' }, { category: 'asc' }, { subcategory: 'asc' }],
      });
      const scenarios = await txdb.scenario.findMany({
        where: { tenant_id: tenantId, parent_model_id: id },
        orderBy: { position: 'asc' },
      });
      return { updated, persisted, scenarios };
    });

    return {
      model: toDetail(result.updated as FinancialModelRowSelected),
      scenarios: result.scenarios.map(toScenarioSummary),
      line_items: result.persisted.map((li) => toLineItemResponse(li as LineItemSelected)),
      totals_by_year: engineOutputs?.totals_by_year ?? [],
      per_pupil_unit_economics: engineOutputs?.per_pupil_unit_economics ?? [],
      warnings: engineOutputs?.warnings ?? [],
    };
  }

  // ─── archive / restore ─────────────────────────────────────────────────

  async archive(
    tenantId: string,
    id: string,
    userId: string,
  ): Promise<{ id: string; status: FinancialModelStatus; archived_at: string }> {
    const existing = await this.prisma.financialModel.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'FINANCIAL_MODEL_NOT_FOUND',
        message: `Financial model with id "${id}" not found`,
      });
    }
    const archivedAt = new Date();
    const updated = await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.financialModel.update({
        where: { id },
        data: { status: 'archived', archived_at: archivedAt },
      });
    });
    return {
      id: updated.id,
      status: updated.status,
      archived_at: archivedAt.toISOString(),
    };
  }

  async restore(
    tenantId: string,
    id: string,
    userId: string,
  ): Promise<{ id: string; status: FinancialModelStatus }> {
    const existing = await this.prisma.financialModel.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'FINANCIAL_MODEL_NOT_FOUND',
        message: `Financial model with id "${id}" not found`,
      });
    }
    const updated = await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.financialModel.update({
        where: { id },
        // v1 restores as draft; we accept the minor lossiness from
        // overwriting `status` during archive (modeling/PLAN.md §7.5).
        data: { status: 'draft', archived_at: null },
      });
    });
    return { id: updated.id, status: updated.status };
  }

  // ─── Source-snapshot composition ───────────────────────────────────────

  /**
   * Capture the tenant's relevant slice of state for the engine. Pure
   * read; no transaction needed (every facade enforces tenant_id in the
   * `where` clause).
   */
  private async captureSourceSnapshot(
    tenantId: string,
    fiscalYearStart: Date,
    fiscalYearEnd: Date,
  ): Promise<SourceDataSnapshot> {
    const [tenant, yearGroups, studentCountsByYg, totalActiveStudents, totalActiveHouseholds] =
      await Promise.all([
        this.tenantReadFacade.findById(tenantId),
        this.academicReadFacade.findAllYearGroups(tenantId),
        this.studentReadFacade.countByYearGroup(tenantId, 'active'),
        this.studentReadFacade.count(tenantId, { status: 'active' }),
        this.householdReadFacade.countActive(tenantId),
      ]);
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant ${tenantId} not found while capturing source snapshot`,
      });
    }
    const [staffByDepartment, feeStructures] = await Promise.all([
      this.staffProfileReadFacade.summariseByDepartmentForBudgeting(tenantId),
      this.financeReadFacade.findActiveFeeStructures(tenantId),
    ]);

    const studentsByYearGroup: SourceStudentByYearGroup[] = yearGroups.map((yg) => ({
      year_group_id: yg.id,
      year_group_name: yg.name,
      active_count: studentCountsByYg.get(yg.id) ?? 0,
    }));

    // Filter out fee structures with year_group_id null (school-wide fees
    // — engine ties revenue to year groups) and `custom` billing
    // frequency (cannot be deterministically annualised). The engine
    // surfaces a NO_FEE_STRUCTURE warning for any year group that ends
    // up without a usable fee row.
    const feesByYearGroup: SourceFeeStructureForYearGroup[] = feeStructures
      .filter(
        (fs): fs is typeof fs & { year_group_id: string } =>
          fs.year_group_id !== null &&
          (fs.billing_frequency === 'monthly' ||
            fs.billing_frequency === 'term' ||
            fs.billing_frequency === 'one_off'),
      )
      .map((fs) => ({
        year_group_id: fs.year_group_id,
        fee_type_id: fs.id,
        fee_type_name: fs.name,
        amount: Number(fs.amount),
        billing_frequency: fs.billing_frequency as 'monthly' | 'term' | 'one_off',
      }));

    return {
      captured_at: new Date().toISOString(),
      tenant_id: tenantId,
      fiscal_year_start: fiscalYearStart.toISOString().slice(0, 10),
      fiscal_year_end: fiscalYearEnd.toISOString().slice(0, 10),
      currency_code: tenant.currency_code,
      total_active_students: totalActiveStudents,
      total_active_households: totalActiveHouseholds,
      students_by_year_group: studentsByYearGroup,
      fees_by_year_group: feesByYearGroup,
      staff_by_department: staffByDepartment,
      // Prior-year actuals are not yet collected by the platform — the
      // engine handles `undefined` with a NO_PRIOR_ACTUALS warning. A
      // future phase will populate this from FinanceReadFacade /
      // PayrollReadFacade once the historical-data pipeline lands.
      prior_year_actuals: undefined,
    };
  }
}
