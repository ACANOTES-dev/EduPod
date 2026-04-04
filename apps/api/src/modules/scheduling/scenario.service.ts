import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';

import type {
  CompareScenarioDto,
  CreateScenarioDto,
  ScenarioQuery,
  UpdateScenarioDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulingRunsReadFacade } from '../scheduling-runs/scheduling-runs-read.facade';

@Injectable()
export class ScenarioService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('scheduling') private readonly schedulingQueue: Queue,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly schedulingRunsReadFacade: SchedulingRunsReadFacade,
  ) {}

  // ─── Create Scenario ──────────────────────────────────────────────────────

  async createScenario(tenantId: string, userId: string, dto: CreateScenarioDto) {
    await this.academicReadFacade.findYearByIdOrThrow(tenantId, dto.academic_year_id);

    if (dto.base_run_id) {
      const run = await this.schedulingRunsReadFacade.findStatusById(tenantId, dto.base_run_id);
      if (!run) {
        throw new NotFoundException({
          error: { code: 'BASE_RUN_NOT_FOUND', message: 'Base scheduling run not found' },
        });
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const scenario = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.schedulingScenario.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          description: dto.description ?? null,
          academic_year_id: dto.academic_year_id,
          base_run_id: dto.base_run_id ?? null,
          adjustments_json: dto.adjustments as Prisma.InputJsonValue,
          status: 'draft',
          created_by_user_id: userId,
        },
      });
    })) as unknown as { id: string; status: string; created_at: Date };

    return {
      id: (scenario as { id: string }).id,
      name: dto.name,
      status: (scenario as { status: string }).status,
      created_at: (scenario as { created_at: Date }).created_at.toISOString(),
    };
  }

  // ─── Get Scenario ─────────────────────────────────────────────────────────

  async getScenario(tenantId: string, scenarioId: string) {
    const scenario = await this.schedulingRunsReadFacade.findScenarioById(tenantId, scenarioId);

    if (!scenario) {
      throw new NotFoundException({
        error: { code: 'SCENARIO_NOT_FOUND', message: 'Scenario not found' },
      });
    }

    return this.formatScenario(scenario);
  }

  // ─── List Scenarios ───────────────────────────────────────────────────────

  async listScenarios(tenantId: string, query: ScenarioQuery) {
    const skip = (query.page - 1) * query.pageSize;

    const where: {
      tenant_id: string;
      academic_year_id?: string;
      status?: 'draft' | 'solved' | 'approved' | 'rejected';
    } = { tenant_id: tenantId };

    if (query.academic_year_id) {
      where.academic_year_id = query.academic_year_id;
    }
    if (query.status) {
      where.status = query.status;
    }

    const result = await this.schedulingRunsReadFacade.listScenarios(tenantId, {
      academicYearId: query.academic_year_id,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    });
    const data = result.data;
    const total = result.total;

    return {
      data: data.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        academic_year_id: s.academic_year_id,
        base_run_id: s.base_run_id,
        status: s.status,
        created_at: s.created_at.toISOString(),
        updated_at: s.updated_at.toISOString(),
      })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // ─── Update Scenario ──────────────────────────────────────────────────────

  async updateScenario(tenantId: string, scenarioId: string, dto: UpdateScenarioDto) {
    const scenario = await this.schedulingRunsReadFacade.findScenarioStatusById(tenantId, scenarioId);
    if (!scenario) {
      throw new NotFoundException({
        error: { code: 'SCENARIO_NOT_FOUND', message: 'Scenario not found' },
      });
    }

    if (scenario.status === 'approved') {
      throw new BadRequestException({
        error: { code: 'SCENARIO_APPROVED', message: 'Approved scenarios cannot be modified' },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.schedulingScenario.update({
        where: { id: scenarioId },
        data: {
          ...(dto.name ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.adjustments
            ? { adjustments_json: dto.adjustments as Prisma.InputJsonValue }
            : {}),
          // Reset to draft when adjustments are changed
          ...(dto.adjustments ? { status: 'draft', solver_result_json: Prisma.JsonNull } : {}),
        },
      });
    })) as unknown as { id: string; name: string; status: string; updated_at: Date };

    return {
      id: (updated as { id: string }).id,
      name: (updated as { name: string }).name,
      status: (updated as { status: string }).status,
      updated_at: (updated as { updated_at: Date }).updated_at.toISOString(),
    };
  }

  // ─── Delete Scenario ──────────────────────────────────────────────────────

  async deleteScenario(tenantId: string, scenarioId: string) {
    const scenario = await this.schedulingRunsReadFacade.findScenarioStatusById(tenantId, scenarioId);
    if (!scenario) {
      throw new NotFoundException({
        error: { code: 'SCENARIO_NOT_FOUND', message: 'Scenario not found' },
      });
    }

    if (scenario.status === 'approved') {
      throw new BadRequestException({
        error: { code: 'SCENARIO_APPROVED', message: 'Approved scenarios cannot be deleted' },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.schedulingScenario.delete({ where: { id: scenarioId } });
    });

    return { deleted: true };
  }

  // ─── Run Scenario Solver ──────────────────────────────────────────────────

  async runScenarioSolver(tenantId: string, scenarioId: string) {
    const scenarioFull = await this.schedulingRunsReadFacade.findScenarioById(tenantId, scenarioId);
    const scenario = scenarioFull;
    if (!scenario) {
      throw new NotFoundException({
        error: { code: 'SCENARIO_NOT_FOUND', message: 'Scenario not found' },
      });
    }

    // Enqueue a scenario solver job
    await this.schedulingQueue.add('scheduling:solve-scenario', {
      tenant_id: tenantId,
      scenario_id: scenarioId,
      academic_year_id: scenario.academic_year_id,
    });

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.schedulingScenario.update({
        where: { id: scenarioId },
        data: { status: 'draft' }, // Reset until solver completes
      });
    });

    return {
      scenario_id: scenarioId,
      queued: true,
      message: 'Scenario solver job enqueued',
    };
  }

  // ─── Compare Scenarios ────────────────────────────────────────────────────

  async compareScenarios(tenantId: string, dto: CompareScenarioDto) {
    const scenarios = await this.schedulingRunsReadFacade.findScenariosForComparison(
      tenantId,
      dto.scenario_ids,
    );

    if (scenarios.length !== dto.scenario_ids.length) {
      throw new NotFoundException({
        error: {
          code: 'SCENARIO_NOT_FOUND',
          message: 'One or more scenario IDs not found',
        },
      });
    }

    return {
      scenarios: scenarios.map((s) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        has_result: s.solver_result_json !== null,
        adjustments: s.adjustments_json,
        created_at: s.created_at.toISOString(),
        // Extract key metrics from solver result if available
        metrics: this.extractScenarioMetrics(s.solver_result_json),
      })),
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private formatScenario(scenario: {
    id: string;
    name: string;
    description: string | null;
    academic_year_id: string;
    base_run_id: string | null;
    adjustments_json: unknown;
    solver_result_json: unknown;
    status: string;
    created_by_user_id: string;
    created_at: Date;
    updated_at: Date;
  }) {
    return {
      id: scenario.id,
      name: scenario.name,
      description: scenario.description,
      academic_year_id: scenario.academic_year_id,
      base_run_id: scenario.base_run_id,
      adjustments: scenario.adjustments_json,
      status: scenario.status,
      has_result: scenario.solver_result_json !== null,
      metrics: this.extractScenarioMetrics(scenario.solver_result_json),
      created_by_user_id: scenario.created_by_user_id,
      created_at: scenario.created_at.toISOString(),
      updated_at: scenario.updated_at.toISOString(),
    };
  }

  private extractScenarioMetrics(solverResult: unknown): Record<string, unknown> | null {
    if (!solverResult || typeof solverResult !== 'object') return null;

    const result = solverResult as Record<string, unknown>;
    return {
      entries_generated: result['entries_generated'] ?? null,
      entries_unassigned: result['entries_unassigned'] ?? null,
      soft_preference_score: result['soft_preference_score'] ?? null,
      hard_constraint_violations: result['hard_constraint_violations'] ?? null,
    };
  }
}
