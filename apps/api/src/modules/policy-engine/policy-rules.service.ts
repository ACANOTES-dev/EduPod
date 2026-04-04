import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import {
  CreatePolicyRuleDto,
  ImportPolicyRulesDto,
  ListPolicyRulesQuery,
  PolicyConditionSchema,
  UpdatePolicyPriorityDto,
  UpdatePolicyRuleDto,
} from '@school/shared/behaviour';

import { BehaviourReadFacade } from '../behaviour/behaviour-read.facade';
import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

/** Maps frontend-facing stage names to Prisma enum values */
const STAGE_TO_PRISMA: Record<string, $Enums.PolicyStage> = {
  consequence: 'consequence',
  approval: 'approval_stage',
  notification: 'notification_stage',
  support: 'support',
  alerting: 'alerting',
};

/** Maps Prisma enum values back to frontend-facing stage names */
const PRISMA_TO_STAGE: Record<string, string> = {
  consequence: 'consequence',
  approval_stage: 'approval',
  notification_stage: 'notification',
  support: 'support',
  alerting: 'alerting',
};

function toPrismaStage(stage: string): $Enums.PolicyStage {
  return STAGE_TO_PRISMA[stage] ?? (stage as $Enums.PolicyStage);
}

function toApiStage(prismaStage: string): string {
  return PRISMA_TO_STAGE[prismaStage] ?? prismaStage;
}

function toPrismaMatchStrategy(strategy: string): $Enums.PolicyMatchStrategy {
  return strategy as $Enums.PolicyMatchStrategy;
}

function toPrismaActionType(actionType: string): $Enums.PolicyActionType {
  return actionType as $Enums.PolicyActionType;
}

function mapRuleToApi(rule: Record<string, unknown>): Record<string, unknown> {
  return {
    ...rule,
    stage: toApiStage(rule.stage as string),
    ...(rule.actions
      ? {
          actions: (rule.actions as Array<Record<string, unknown>>).map((a) => ({
            ...a,
            action_type: a.action_type as string,
          })),
        }
      : {}),
  };
}

@Injectable()
export class PolicyRulesService {
  private readonly logger = new Logger(PolicyRulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly behaviourReadFacade: BehaviourReadFacade,
  ) {}

  async listRules(tenantId: string, query: ListPolicyRulesQuery) {
    const where: Prisma.BehaviourPolicyRuleWhereInput = {
      tenant_id: tenantId,
    };

    if (query.stage !== undefined) {
      where.stage = toPrismaStage(query.stage);
    }
    if (query.is_active !== undefined) {
      where.is_active = query.is_active;
    }

    const result = await this.behaviourReadFacade.findPolicyRulesPaginated(
      tenantId,
      {
        stage: where.stage as string | undefined,
        is_active: where.is_active as boolean | undefined,
      },
      { skip: (query.page - 1) * query.pageSize, take: query.pageSize },
    );

    return {
      data: result.data.map((r) => mapRuleToApi(r as Record<string, unknown>)),
      meta: { page: query.page, pageSize: query.pageSize, total: result.total },
    };
  }

  async getRule(tenantId: string, ruleId: string) {
    const rule = await this.behaviourReadFacade.findPolicyRuleById(tenantId, ruleId);

    if (!rule) {
      throw new NotFoundException({
        code: 'POLICY_RULE_NOT_FOUND',
        message: 'Policy rule not found',
      });
    }

    return mapRuleToApi(rule as unknown as Record<string, unknown>);
  }

  async createRule(tenantId: string, userId: string, dto: CreatePolicyRuleDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;

        // Create the rule
        const rule = await db.behaviourPolicyRule.create({
          data: {
            tenant_id: tenantId,
            name: dto.name,
            description: dto.description ?? null,
            is_active: dto.is_active,
            stage: toPrismaStage(dto.stage),
            priority: dto.priority,
            match_strategy: toPrismaMatchStrategy(dto.match_strategy),
            stop_processing_stage: dto.stop_processing_stage,
            conditions: dto.conditions as unknown as Prisma.InputJsonValue,
            current_version: 1,
          },
        });

        // Create actions
        if (dto.actions.length > 0) {
          await db.behaviourPolicyRuleAction.createMany({
            data: dto.actions.map((a) => ({
              tenant_id: tenantId,
              rule_id: rule.id,
              action_type: toPrismaActionType(a.action_type),
              action_config: a.action_config as Prisma.InputJsonValue,
              execution_order: a.execution_order,
            })),
          });
        }

        // Snapshot version 1 immediately
        await db.behaviourPolicyRuleVersion.create({
          data: {
            tenant_id: tenantId,
            rule_id: rule.id,
            version: 1,
            name: dto.name,
            conditions: dto.conditions as unknown as Prisma.InputJsonValue,
            actions: dto.actions.map((a) => ({
              action_type: a.action_type,
              action_config: a.action_config,
              execution_order: a.execution_order,
            })) as unknown as Prisma.InputJsonValue,
            stage: toPrismaStage(dto.stage),
            match_strategy: toPrismaMatchStrategy(dto.match_strategy),
            priority: dto.priority,
            changed_by_id: userId,
            change_reason: 'Initial creation',
          },
        });

        const created = await db.behaviourPolicyRule.findUniqueOrThrow({
          where: { id: rule.id },
          include: { actions: { orderBy: { execution_order: 'asc' } } },
        });

        return mapRuleToApi(created as unknown as Record<string, unknown>);
      },
      { timeout: 15000 },
    );
  }

  async updateRule(tenantId: string, ruleId: string, userId: string, dto: UpdatePolicyRuleDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;

        // Load current rule
        const current = await db.behaviourPolicyRule.findFirst({
          where: { id: ruleId, tenant_id: tenantId },
          include: { actions: { orderBy: { execution_order: 'asc' } } },
        });

        if (!current) {
          throw new NotFoundException({
            code: 'POLICY_RULE_NOT_FOUND',
            message: 'Policy rule not found',
          });
        }

        // Snapshot current version BEFORE applying changes
        await db.behaviourPolicyRuleVersion.create({
          data: {
            tenant_id: tenantId,
            rule_id: ruleId,
            version: current.current_version,
            name: current.name,
            conditions: current.conditions as Prisma.InputJsonValue,
            actions: current.actions.map((a) => ({
              action_type: a.action_type,
              action_config: a.action_config,
              execution_order: a.execution_order,
            })) as unknown as Prisma.InputJsonValue,
            stage: current.stage,
            match_strategy: current.match_strategy,
            priority: current.priority,
            changed_by_id: userId,
            change_reason: dto.change_reason ?? null,
          },
        });

        // Build update data
        const updateData: Prisma.BehaviourPolicyRuleUpdateInput = {
          current_version: { increment: 1 },
        };

        if (dto.name !== undefined) updateData.name = dto.name;
        if (dto.description !== undefined) updateData.description = dto.description;
        if (dto.stage !== undefined) updateData.stage = toPrismaStage(dto.stage);
        if (dto.priority !== undefined) updateData.priority = dto.priority;
        if (dto.match_strategy !== undefined)
          updateData.match_strategy = toPrismaMatchStrategy(dto.match_strategy);
        if (dto.stop_processing_stage !== undefined)
          updateData.stop_processing_stage = dto.stop_processing_stage;
        if (dto.is_active !== undefined) updateData.is_active = dto.is_active;
        if (dto.conditions !== undefined)
          updateData.conditions = dto.conditions as unknown as Prisma.InputJsonValue;

        await db.behaviourPolicyRule.update({
          where: { id: ruleId },
          data: updateData,
        });

        // Replace actions if provided
        if (dto.actions) {
          await db.behaviourPolicyRuleAction.deleteMany({
            where: { rule_id: ruleId },
          });
          await db.behaviourPolicyRuleAction.createMany({
            data: dto.actions.map((a) => ({
              tenant_id: tenantId,
              rule_id: ruleId,
              action_type: toPrismaActionType(a.action_type),
              action_config: a.action_config as Prisma.InputJsonValue,
              execution_order: a.execution_order,
            })),
          });
        }

        const updated = await db.behaviourPolicyRule.findUniqueOrThrow({
          where: { id: ruleId },
          include: { actions: { orderBy: { execution_order: 'asc' } } },
        });

        return mapRuleToApi(updated as unknown as Record<string, unknown>);
      },
      { timeout: 15000 },
    );
  }

  async deleteRule(tenantId: string, ruleId: string) {
    const rule = await this.behaviourReadFacade.findPolicyRuleById(tenantId, ruleId);

    if (!rule) {
      throw new NotFoundException({
        code: 'POLICY_RULE_NOT_FOUND',
        message: 'Policy rule not found',
      });
    }

    // Soft-delete: set is_active = false
    await this.prisma.behaviourPolicyRule.update({
      where: { id: ruleId },
      data: { is_active: false },
    });

    return { success: true };
  }

  async getVersionHistory(tenantId: string, ruleId: string) {
    const rule = await this.behaviourReadFacade.findPolicyRuleById(tenantId, ruleId);

    if (!rule) {
      throw new NotFoundException({
        code: 'POLICY_RULE_NOT_FOUND',
        message: 'Policy rule not found',
      });
    }

    const versions = await this.behaviourReadFacade.findPolicyRuleVersions(tenantId, ruleId);

    return {
      data: (versions as Array<Record<string, unknown>>).map((v) => ({
        ...v,
        stage: toApiStage(v.stage as string),
      })),
    };
  }

  async getVersion(tenantId: string, ruleId: string, version: number) {
    const versionRecord = await this.behaviourReadFacade.findPolicyRuleVersion(
      tenantId,
      ruleId,
      version,
    ) as { stage: string } | null;

    if (!versionRecord) {
      throw new NotFoundException({
        code: 'POLICY_RULE_VERSION_NOT_FOUND',
        message: `Version ${version} not found for this rule`,
      });
    }

    return { ...versionRecord, stage: toApiStage(versionRecord.stage) };
  }

  async updatePriority(tenantId: string, ruleId: string, dto: UpdatePolicyPriorityDto) {
    const rule = await this.behaviourReadFacade.findPolicyRuleById(tenantId, ruleId);

    if (!rule) {
      throw new NotFoundException({
        code: 'POLICY_RULE_NOT_FOUND',
        message: 'Policy rule not found',
      });
    }

    const updated = await this.prisma.behaviourPolicyRule.update({
      where: { id: ruleId },
      data: { priority: dto.priority },
    });

    return mapRuleToApi(updated as unknown as Record<string, unknown>);
  }

  async importRules(tenantId: string, userId: string, dto: ImportPolicyRulesDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;

        // Load tenant's categories for name→UUID resolution
        const categories = await db.behaviourCategory.findMany({
          where: { tenant_id: tenantId },
          select: { id: true, name: true },
        });
        const catNameToId = new Map(categories.map((c) => [c.name, c.id]));

        const created: string[] = [];

        for (const ruleDto of dto.rules) {
          // Resolve category name tokens in conditions
          const conditions = this.resolveCategoryTokens(
            ruleDto.conditions as Record<string, unknown>,
            catNameToId,
          );

          // Resolve category name tokens in action configs
          const actions = ruleDto.actions.map((a) => ({
            ...a,
            action_config: this.resolveCategoryTokens(
              a.action_config as Record<string, unknown>,
              catNameToId,
            ),
          }));

          const parsedConditions = PolicyConditionSchema.parse(conditions);

          const rule = await db.behaviourPolicyRule.create({
            data: {
              tenant_id: tenantId,
              name: ruleDto.name,
              description: ruleDto.description ?? null,
              is_active: true,
              stage: toPrismaStage(ruleDto.stage),
              priority: ruleDto.priority,
              match_strategy: toPrismaMatchStrategy(ruleDto.match_strategy),
              stop_processing_stage: ruleDto.stop_processing_stage,
              conditions: parsedConditions as unknown as Prisma.InputJsonValue,
              current_version: 1,
            },
          });

          if (actions.length > 0) {
            await db.behaviourPolicyRuleAction.createMany({
              data: actions.map((a) => ({
                tenant_id: tenantId,
                rule_id: rule.id,
                action_type: toPrismaActionType(a.action_type),
                action_config: a.action_config as Prisma.InputJsonValue,
                execution_order: a.execution_order,
              })),
            });
          }

          // Snapshot version 1
          await db.behaviourPolicyRuleVersion.create({
            data: {
              tenant_id: tenantId,
              rule_id: rule.id,
              version: 1,
              name: ruleDto.name,
              conditions: parsedConditions as unknown as Prisma.InputJsonValue,
              actions: actions.map((a) => ({
                action_type: a.action_type,
                action_config: a.action_config,
                execution_order: a.execution_order,
              })) as unknown as Prisma.InputJsonValue,
              stage: toPrismaStage(ruleDto.stage),
              match_strategy: toPrismaMatchStrategy(ruleDto.match_strategy),
              priority: ruleDto.priority,
              changed_by_id: userId,
              change_reason: 'Imported',
            },
          });

          created.push(rule.id);
        }

        return { imported: created.length, rule_ids: created };
      },
      { timeout: 30000 },
    );
  }

  async exportRules(tenantId: string) {
    const rules = await this.behaviourReadFacade.findPolicyRules(tenantId);

    // Load categories for UUID→name token resolution
    const categories = await this.behaviourReadFacade.findCategories(tenantId);
    const catIdToToken = new Map(
      categories.map((c) => [c.id, `__${c.name.toUpperCase().replace(/\s+/g, '_')}__`]),
    );

    return rules.map((rule) => ({
      name: rule.name,
      description: rule.description,
      stage: toApiStage(rule.stage),
      priority: rule.priority,
      match_strategy: rule.match_strategy,
      stop_processing_stage: rule.stop_processing_stage,
      conditions: this.tokenizeCategoryIds(
        rule.conditions as Record<string, unknown>,
        catIdToToken,
      ),
      actions: rule.actions.map((a) => ({
        action_type: a.action_type,
        action_config: this.tokenizeCategoryIds(
          a.action_config as Record<string, unknown>,
          catIdToToken,
        ),
        execution_order: a.execution_order,
      })),
    }));
  }

  private resolveCategoryTokens(
    obj: Record<string, unknown>,
    catNameToId: Map<string, string>,
  ): Record<string, unknown> {
    const result = { ...obj };

    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'string' && value.startsWith('__') && value.endsWith('__')) {
        const name = value.slice(2, -2).replace(/_/g, ' ');
        const lower = name.toLowerCase();
        for (const [catName, catId] of catNameToId) {
          if (catName.toLowerCase() === lower) {
            result[key] = catId;
            break;
          }
        }
      } else if (Array.isArray(value)) {
        result[key] = value.map((v) => {
          if (typeof v === 'string' && v.startsWith('__') && v.endsWith('__')) {
            const name = v.slice(2, -2).replace(/_/g, ' ');
            const lower = name.toLowerCase();
            for (const [catName, catId] of catNameToId) {
              if (catName.toLowerCase() === lower) return catId;
            }
          }
          return v;
        });
      }
    }

    return result;
  }

  private tokenizeCategoryIds(
    obj: Record<string, unknown>,
    catIdToToken: Map<string, string>,
  ): Record<string, unknown> {
    const result = { ...obj };

    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'string' && catIdToToken.has(value)) {
        result[key] = catIdToToken.get(value);
      } else if (Array.isArray(value)) {
        result[key] = value.map((v) =>
          typeof v === 'string' && catIdToToken.has(v) ? catIdToToken.get(v) : v,
        );
      }
    }

    return result;
  }
}
