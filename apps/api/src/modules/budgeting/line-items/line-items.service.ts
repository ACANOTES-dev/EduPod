import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import {
  runEngine,
  type ComputedLineItem,
  type Drivers,
  type EngineHorizon,
  type FinancialModelLineItemCategory,
  type FinancialModelLineItemSource,
  type SourceDataSnapshot,
} from '@school/shared/budgeting';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ScenariosService,
  type ParentModelRow,
  type ScenarioRow,
} from '../scenarios/scenarios.service';

import type { CreateLineItemDto } from './dto/create-line-item.dto';
import type { UpdateLineItemDto } from './dto/update-line-item.dto';

/**
 * LineItemsService — mutation surface for `financial_model_line_items`
 * beyond the default rows that Phase 03's "create model" flow inserts.
 *
 * Phase 03 owns the derived-line population (and replacement on driver
 * changes); Phase 04 owns the **state machine** across the three
 * sources (`driver_derived`, `custom`, `override`) plus the `is_locked`
 * flag:
 *
 *  - createCustom    → insert `source = 'custom'`.
 *  - update          → patch amount/lock/notes/name. Setting `amount`
 *                      on a derived row flips source to `override`.
 *  - delete          → custom + override only; derived rows are
 *                      protected (engine would re-create them anyway).
 *  - resetToDerived  → revert an override back to engine-computed value.
 *
 * Phase 03's `FinancialModelsService.update` honours the other half of
 * this contract: it skips locked + non-derived rows when re-running the
 * engine, leaving custom / override / locked rows untouched on driver
 * changes.
 */

// ─── Internal shapes ──────────────────────────────────────────────────────

interface LineItemRow {
  id: string;
  tenant_id: string;
  parent_model_id: string;
  scenario_id: string | null;
  category: FinancialModelLineItemCategory;
  subcategory: string;
  name: string;
  fiscal_year: number;
  source: FinancialModelLineItemSource;
  amount: Prisma.Decimal | number;
  is_locked: boolean;
  notes: string | null;
  references_event_budget_id: string | null;
}

export interface LineItemResponse {
  id: string;
  parent_model_id: string;
  scenario_id: string | null;
  category: FinancialModelLineItemCategory;
  subcategory: string;
  name: string;
  fiscal_year: number;
  source: FinancialModelLineItemSource;
  amount: number;
  is_locked: boolean;
  notes: string | null;
  references_event_budget_id: string | null;
}

@Injectable()
export class LineItemsService {
  private readonly logger = new Logger(LineItemsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scenariosService: ScenariosService,
  ) {}

  // ─── createCustom ──────────────────────────────────────────────────────

  async createCustom(
    tenantId: string,
    parentModelId: string,
    userId: string,
    dto: CreateLineItemDto,
  ): Promise<LineItemResponse> {
    const parent = await this.assertParentModelExists(tenantId, parentModelId);

    if (dto.fiscal_year > parent.horizon_years) {
      throw new BadRequestException({
        code: 'FISCAL_YEAR_OUT_OF_RANGE',
        message: `fiscal_year ${dto.fiscal_year} exceeds the model's horizon_years (${parent.horizon_years})`,
      });
    }

    if (dto.scenario_id) {
      const scenario = await this.prisma.scenario.findFirst({
        where: {
          id: dto.scenario_id,
          tenant_id: tenantId,
          parent_model_id: parentModelId,
        },
        select: { id: true },
      });
      if (!scenario) {
        throw new NotFoundException({
          code: 'SCENARIO_NOT_FOUND',
          message: `Scenario "${dto.scenario_id}" not found for financial model "${parentModelId}"`,
        });
      }
    }

    if (dto.references_event_budget_id) {
      const eventBudget = await this.prisma.eventBudget.findFirst({
        where: { id: dto.references_event_budget_id, tenant_id: tenantId },
        select: { id: true },
      });
      if (!eventBudget) {
        throw new BadRequestException({
          code: 'EVENT_BUDGET_NOT_FOUND',
          message: `Event budget "${dto.references_event_budget_id}" not found for this tenant`,
        });
      }
    }

    const row = await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.financialModelLineItem.create({
        data: {
          tenant_id: tenantId,
          parent_model_id: parentModelId,
          scenario_id: dto.scenario_id ?? null,
          category: dto.category,
          subcategory: dto.subcategory,
          name: dto.name,
          fiscal_year: dto.fiscal_year,
          source: 'custom',
          amount: dto.amount,
          is_locked: false,
          notes: dto.notes ?? null,
          references_event_budget_id: dto.references_event_budget_id ?? null,
        },
      });
    });

    return this.toResponse(row as LineItemRow);
  }

  // ─── update ───────────────────────────────────────────────────────────

  async update(
    tenantId: string,
    parentModelId: string,
    lineId: string,
    userId: string,
    dto: UpdateLineItemDto,
  ): Promise<LineItemResponse> {
    await this.assertParentModelExists(tenantId, parentModelId);

    const row = await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      const line = await txdb.financialModelLineItem.findFirst({
        where: { id: lineId, tenant_id: tenantId, parent_model_id: parentModelId },
      });
      if (!line) {
        throw new NotFoundException({
          code: 'LINE_ITEM_NOT_FOUND',
          message: `Line item with id "${lineId}" not found on financial model "${parentModelId}"`,
        });
      }

      const data: Prisma.FinancialModelLineItemUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name;
      if (dto.notes !== undefined) data.notes = dto.notes;
      if (dto.is_locked !== undefined) data.is_locked = dto.is_locked;
      if (dto.amount !== undefined) {
        data.amount = dto.amount;
        if (line.source === 'driver_derived') {
          data.source = 'override';
        }
      }

      return txdb.financialModelLineItem.update({
        where: { id: lineId },
        data,
      });
    });

    return this.toResponse(row as LineItemRow);
  }

  // ─── delete ───────────────────────────────────────────────────────────

  async delete(
    tenantId: string,
    parentModelId: string,
    lineId: string,
    userId: string,
  ): Promise<{ id: string }> {
    await this.assertParentModelExists(tenantId, parentModelId);

    return await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      const line = await txdb.financialModelLineItem.findFirst({
        where: { id: lineId, tenant_id: tenantId, parent_model_id: parentModelId },
      });
      if (!line) {
        throw new NotFoundException({
          code: 'LINE_ITEM_NOT_FOUND',
          message: `Line item with id "${lineId}" not found on financial model "${parentModelId}"`,
        });
      }
      if (line.source === 'driver_derived') {
        throw new ForbiddenException({
          code: 'CANNOT_DELETE_DERIVED_LINE',
          message:
            'Driver-derived line items cannot be deleted directly. Adjust the underlying driver, override the value to zero, or lock the line.',
        });
      }
      await txdb.financialModelLineItem.delete({ where: { id: lineId } });
      return { id: lineId };
    });
  }

  // ─── resetToDerived ──────────────────────────────────────────────────

  async resetToDerived(
    tenantId: string,
    parentModelId: string,
    lineId: string,
    userId: string,
  ): Promise<LineItemResponse> {
    const parent = await this.assertParentModelExists(tenantId, parentModelId);

    // Look up the line first (without RLS transaction) so we can compute
    // the derived value before opening the write transaction.
    const line = await this.prisma.financialModelLineItem.findFirst({
      where: { id: lineId, tenant_id: tenantId, parent_model_id: parentModelId },
    });
    if (!line) {
      throw new NotFoundException({
        code: 'LINE_ITEM_NOT_FOUND',
        message: `Line item with id "${lineId}" not found on financial model "${parentModelId}"`,
      });
    }
    if (line.source !== 'override') {
      throw new BadRequestException({
        code: 'NOT_AN_OVERRIDE',
        message: `Line item "${lineId}" is not an override (current source: ${line.source}); only override rows can be reset to derived.`,
      });
    }

    let scenarioRow: ScenarioRow | null = null;
    if (line.scenario_id) {
      const scenario = await this.prisma.scenario.findFirst({
        where: {
          id: line.scenario_id,
          tenant_id: tenantId,
          parent_model_id: parentModelId,
        },
      });
      if (!scenario) {
        // The override references a scenario that no longer exists. Treat
        // this as "no derived value available" rather than a hard 500.
        throw new BadRequestException({
          code: 'NO_DERIVED_VALUE_AVAILABLE',
          message:
            'The scenario this override belongs to has been deleted. Update or delete the override instead.',
        });
      }
      scenarioRow = scenario;
    }

    const drivers: Drivers = this.scenariosService.resolveMergedDrivers(parent, scenarioRow);
    const engineOutputs = runEngine({
      drivers,
      source: parent.source_snapshot_json as unknown as SourceDataSnapshot,
      horizon_years: parent.horizon_years as EngineHorizon,
    });
    const match = findMatchingComputedLine(engineOutputs.line_items, line);
    if (!match) {
      throw new BadRequestException({
        code: 'NO_DERIVED_VALUE_AVAILABLE',
        message:
          'Drivers no longer produce a derived value for this line. Delete the override or edit the value directly instead.',
      });
    }

    const updated = await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    }).$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.financialModelLineItem.update({
        where: { id: lineId },
        data: {
          source: 'driver_derived',
          amount: match.amount,
        },
      });
    });

    return this.toResponse(updated as LineItemRow);
  }

  // ─── Internal helpers ────────────────────────────────────────────────

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
    // Shape matches the exported `ParentModelRow` from ScenariosService —
    // selected fields are identical.
    return parent;
  }

  private toResponse(row: LineItemRow): LineItemResponse {
    return {
      id: row.id,
      parent_model_id: row.parent_model_id,
      scenario_id: row.scenario_id,
      category: row.category,
      subcategory: row.subcategory,
      name: row.name,
      fiscal_year: row.fiscal_year,
      source: row.source,
      amount: Number(row.amount),
      is_locked: row.is_locked,
      notes: row.notes,
      references_event_budget_id: row.references_event_budget_id,
    };
  }
}

// ─── Pure helper ─────────────────────────────────────────────────────────

function findMatchingComputedLine(
  computed: ComputedLineItem[],
  target: { category: string; subcategory: string; fiscal_year: number },
): ComputedLineItem | null {
  return (
    computed.find(
      (li) =>
        li.category === target.category &&
        li.subcategory === target.subcategory &&
        li.fiscal_year === target.fiscal_year,
    ) ?? null
  );
}
