import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import {
  mergeDriverOverrides,
  partialDriversSchema,
  runEngine,
  SCENARIO_MAX_COUNT,
  SCENARIO_MAX_POSITION,
  type Drivers,
  type EngineHorizon,
  type EngineWarning,
  type PartialDrivers,
  type PerPupilEconomics,
  type SourceDataSnapshot,
  type YearTotals,
} from '@school/shared/budgeting';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import type { CreateScenarioDto } from './dto/create-scenario.dto';
import type { UpdateScenarioDto } from './dto/update-scenario.dto';

/**
 * ScenariosService — alternative-case CRUD + on-demand engine recompute.
 *
 * Scenarios are children of a financial model and persist driver deltas
 * only. The engine merges parent + scenario drivers on every read; the
 * computed line items are ephemeral (not persisted) — Phase 05
 * (snapshots) decides later whether to materialise them.
 *
 * The 3-scenario cap is enforced server-side here AND by the unique
 * constraint on `(parent_model_id, position)` for positions 0..2.
 */

// ─── Internal shapes ───────────────────────────────────────────────────────

const TEMP_POSITION_SHIFT = 100;

export interface ScenarioRow {
  id: string;
  tenant_id: string;
  parent_model_id: string;
  name: string;
  position: number;
  driver_overrides: Prisma.JsonValue;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface ParentModelRow {
  id: string;
  tenant_id: string;
  drivers: Prisma.JsonValue;
  source_snapshot_json: Prisma.JsonValue;
  horizon_years: number;
}

export interface ScenarioResponse {
  id: string;
  parent_model_id: string;
  name: string;
  position: number;
  driver_overrides: PartialDrivers;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScenarioComputedResponse {
  scenario: ScenarioResponse;
  computed: {
    drivers: Drivers;
    totals_by_year: YearTotals[];
    per_pupil_unit_economics: PerPupilEconomics[];
    line_items: ReturnType<typeof runEngine>['line_items'];
    warnings: EngineWarning[];
  };
}

@Injectable()
export class ScenariosService {
  private readonly logger = new Logger(ScenariosService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── findAll ────────────────────────────────────────────────────────────

  async findAll(tenantId: string, parentModelId: string): Promise<ScenarioResponse[]> {
    await this.assertParentModelExists(tenantId, parentModelId);
    const rows = await this.prisma.scenario.findMany({
      where: { tenant_id: tenantId, parent_model_id: parentModelId },
      orderBy: { position: 'asc' },
    });
    return rows.map((row) => this.toScenarioResponse(row as ScenarioRow));
  }

  // ─── findOne ────────────────────────────────────────────────────────────

  async findOne(
    tenantId: string,
    parentModelId: string,
    scenarioId: string,
  ): Promise<ScenarioComputedResponse> {
    const parent = await this.assertParentModelExists(tenantId, parentModelId);
    const scenario = await this.prisma.scenario.findFirst({
      where: { id: scenarioId, tenant_id: tenantId, parent_model_id: parentModelId },
    });
    if (!scenario) {
      throw new NotFoundException({
        code: 'SCENARIO_NOT_FOUND',
        message: `Scenario "${scenarioId}" not found for financial model "${parentModelId}"`,
      });
    }
    const computed = this.computeForScenario(parent, scenario as ScenarioRow);
    return {
      scenario: this.toScenarioResponse(scenario as ScenarioRow),
      computed,
    };
  }

  // ─── create ─────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    parentModelId: string,
    userId: string,
    dto: CreateScenarioDto,
  ): Promise<ScenarioComputedResponse> {
    const parent = await this.assertParentModelExists(tenantId, parentModelId);
    const driverOverrides = partialDriversSchema.parse(dto.driver_overrides);

    const result = await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      const existing = await txdb.scenario.findMany({
        where: { tenant_id: tenantId, parent_model_id: parentModelId },
        orderBy: { position: 'asc' },
      });
      if (existing.length >= SCENARIO_MAX_COUNT) {
        throw new ConflictException({
          code: 'SCENARIO_CAP_REACHED',
          message: `A financial model can have at most ${SCENARIO_MAX_COUNT} alternative scenarios. Delete an existing scenario before adding a new one.`,
        });
      }
      const requestedPosition =
        dto.position !== undefined
          ? dto.position
          : findNextFreePosition(existing.map((s) => s.position));
      if (requestedPosition === null) {
        // Only reachable when caller omits position AND positions 0..2 are all taken
        // — covered by the cap check above, but defended here for safety.
        throw new ConflictException({
          code: 'SCENARIO_CAP_REACHED',
          message: `No free position slot in 0..${SCENARIO_MAX_POSITION}.`,
        });
      }
      if (existing.some((s) => s.position === requestedPosition)) {
        throw new ConflictException({
          code: 'SCENARIO_POSITION_TAKEN',
          message: `Position ${requestedPosition} is already taken on this model. Pick another or omit position to auto-assign.`,
        });
      }
      return txdb.scenario.create({
        data: {
          tenant_id: tenantId,
          parent_model_id: parentModelId,
          name: dto.name,
          position: requestedPosition,
          driver_overrides: driverOverrides as Prisma.InputJsonValue,
          notes: dto.notes ?? null,
        },
      });
    });

    const computed = this.computeForScenario(parent, result as ScenarioRow);
    return {
      scenario: this.toScenarioResponse(result as ScenarioRow),
      computed,
    };
  }

  // ─── update ─────────────────────────────────────────────────────────────

  async update(
    tenantId: string,
    parentModelId: string,
    scenarioId: string,
    userId: string,
    dto: UpdateScenarioDto,
  ): Promise<ScenarioComputedResponse> {
    const parent = await this.assertParentModelExists(tenantId, parentModelId);
    const existing = await this.prisma.scenario.findFirst({
      where: { id: scenarioId, tenant_id: tenantId, parent_model_id: parentModelId },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'SCENARIO_NOT_FOUND',
        message: `Scenario "${scenarioId}" not found for financial model "${parentModelId}"`,
      });
    }

    const nextOverrides =
      dto.driver_overrides !== undefined
        ? partialDriversSchema.parse(dto.driver_overrides)
        : undefined;

    const result = await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;

      // Position swap: if the requested position is taken by another
      // sibling, move both rows via a temp position to dodge the unique
      // constraint on (parent_model_id, position).
      if (dto.position !== undefined && dto.position !== existing.position) {
        const conflicting = await txdb.scenario.findFirst({
          where: {
            tenant_id: tenantId,
            parent_model_id: parentModelId,
            position: dto.position,
            id: { not: scenarioId },
          },
        });
        if (conflicting) {
          const tempPosition = existing.position + TEMP_POSITION_SHIFT;
          await txdb.scenario.update({
            where: { id: conflicting.id },
            data: { position: tempPosition },
          });
          await txdb.scenario.update({
            where: { id: scenarioId },
            data: { position: dto.position },
          });
          await txdb.scenario.update({
            where: { id: conflicting.id },
            data: { position: existing.position },
          });
        } else {
          await txdb.scenario.update({
            where: { id: scenarioId },
            data: { position: dto.position },
          });
        }
      }

      return txdb.scenario.update({
        where: { id: scenarioId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(nextOverrides !== undefined && {
            driver_overrides: nextOverrides as Prisma.InputJsonValue,
          }),
          ...(dto.notes !== undefined && { notes: dto.notes }),
        },
      });
    });

    const computed = this.computeForScenario(parent, result as ScenarioRow);
    return {
      scenario: this.toScenarioResponse(result as ScenarioRow),
      computed,
    };
  }

  // ─── delete ─────────────────────────────────────────────────────────────

  async delete(
    tenantId: string,
    parentModelId: string,
    scenarioId: string,
    userId: string,
  ): Promise<{ id: string }> {
    await this.assertParentModelExists(tenantId, parentModelId);
    const existing = await this.prisma.scenario.findFirst({
      where: { id: scenarioId, tenant_id: tenantId, parent_model_id: parentModelId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'SCENARIO_NOT_FOUND',
        message: `Scenario "${scenarioId}" not found for financial model "${parentModelId}"`,
      });
    }
    await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      await txdb.scenario.delete({ where: { id: scenarioId } });
    });
    return { id: scenarioId };
  }

  // ─── Internal: shared engine helpers (consumed by Phase 04 / 05) ─────

  /**
   * Resolve the effective driver set for a scenario by merging parent
   * model drivers with the scenario's overrides. Pure function on top
   * of `mergeDriverOverrides` from `@school/shared/budgeting`.
   *
   * Exported so Phase 05 (snapshots) can reuse the same merge for
   * payload serialisation without re-fetching the parent.
   */
  resolveMergedDrivers(parent: ParentModelRow, scenario: ScenarioRow | null): Drivers {
    const baseDrivers = parent.drivers as unknown as Drivers;
    if (!scenario) return baseDrivers;
    const overrides = scenario.driver_overrides as unknown as PartialDrivers;
    return mergeDriverOverrides(baseDrivers, overrides);
  }

  /**
   * Run the engine for a scenario (or the base case when scenario is null)
   * against the parent model's frozen source-data snapshot. Pure compute,
   * no IO.
   */
  runEngineForScenario(
    parent: ParentModelRow,
    scenario: ScenarioRow | null,
  ): ReturnType<typeof runEngine> {
    const drivers = this.resolveMergedDrivers(parent, scenario);
    return runEngine({
      drivers,
      source: parent.source_snapshot_json as unknown as SourceDataSnapshot,
      horizon_years: parent.horizon_years as EngineHorizon,
    });
  }

  // ─── Internal helpers ──────────────────────────────────────────────────

  private async assertParentModelExists(
    tenantId: string,
    parentModelId: string,
  ): Promise<ParentModelRow> {
    const parent = await this.prisma.financialModel.findFirst({
      where: { id: parentModelId, tenant_id: tenantId },
      select: {
        id: true,
        tenant_id: true,
        drivers: true,
        source_snapshot_json: true,
        horizon_years: true,
      },
    });
    if (!parent) {
      throw new NotFoundException({
        code: 'FINANCIAL_MODEL_NOT_FOUND',
        message: `Financial model with id "${parentModelId}" not found`,
      });
    }
    return parent;
  }

  private computeForScenario(
    parent: ParentModelRow,
    scenario: ScenarioRow,
  ): ScenarioComputedResponse['computed'] {
    const drivers = this.resolveMergedDrivers(parent, scenario);
    const engineOutputs = runEngine({
      drivers,
      source: parent.source_snapshot_json as unknown as SourceDataSnapshot,
      horizon_years: parent.horizon_years as EngineHorizon,
    });
    return {
      drivers,
      totals_by_year: engineOutputs.totals_by_year,
      per_pupil_unit_economics: engineOutputs.per_pupil_unit_economics,
      line_items: engineOutputs.line_items,
      warnings: engineOutputs.warnings,
    };
  }

  private toScenarioResponse(row: ScenarioRow): ScenarioResponse {
    return {
      id: row.id,
      parent_model_id: row.parent_model_id,
      name: row.name,
      position: row.position,
      driver_overrides: row.driver_overrides as unknown as PartialDrivers,
      notes: row.notes,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function findNextFreePosition(taken: number[]): number | null {
  for (let i = 0; i <= SCENARIO_MAX_POSITION; i++) {
    if (!taken.includes(i)) return i;
  }
  return null;
}
