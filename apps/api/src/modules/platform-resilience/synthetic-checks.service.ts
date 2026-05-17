import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PlatformSyntheticCheckDefinition } from '@prisma/client';

import {
  createSyntheticCheckDefinitionSchema,
  type CreateSyntheticCheckDefinitionDto,
  type SyntheticCheckListQuery,
  type SyntheticCheckResultsQuery,
  type UpdateSyntheticCheckDefinitionDto,
} from '@school/shared';

import {
  PlatformAuditService,
  type PlatformAuditContext,
} from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { SyntheticCheckSchedulerService } from './synthetic-check-scheduler.service';

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

type NormalizedSyntheticCheckDefinition = CreateSyntheticCheckDefinitionDto;

@Injectable()
export class SyntheticChecksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
    private readonly scheduler: SyntheticCheckSchedulerService,
  ) {}

  async list(query: SyntheticCheckListQuery) {
    const where: Prisma.PlatformSyntheticCheckDefinitionWhereInput = {};
    if (query.kind) where.kind = query.kind;
    if (query.related_component) where.related_component = query.related_component;
    if (query.status) {
      where.results = { some: { status: query.status } };
    }
    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await Promise.all([
      this.prisma.platformSyntheticCheckDefinition.findMany({
        where,
        orderBy: { display_name: 'asc' },
        skip,
        take: query.pageSize,
        include: { results: { orderBy: { ran_at: 'desc' }, take: 50 } },
      }),
      this.prisma.platformSyntheticCheckDefinition.count({ where }),
    ]);
    return {
      data: data.map((definition) => ({
        ...definition,
        last_result: definition.results[0] ?? null,
        results: undefined,
        uptime_24h: uptime(dataPointResults(definition.results)),
      })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async get(id: string) {
    const row = await this.prisma.platformSyntheticCheckDefinition.findUnique({
      where: { id },
      include: { results: { orderBy: { ran_at: 'desc' }, take: 1 } },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'SYNTHETIC_CHECK_NOT_FOUND',
        message: `Synthetic check "${id}" not found.`,
      });
    }
    return { ...row, last_result: row.results[0] ?? null, results: undefined };
  }

  async create(
    dto: CreateSyntheticCheckDefinitionDto,
    actorUserId: string,
    audit?: PlatformAuditContext,
  ): Promise<PlatformSyntheticCheckDefinition> {
    const parsed = createSyntheticCheckDefinitionSchema.safeParse(dto);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_SYNTHETIC_CHECK_DEFINITION',
        details: parsed.error.flatten(),
        message: 'Synthetic check definition is invalid.',
      });
    }
    const created = await this.prisma.platformSyntheticCheckDefinition.create({
      data: this.definitionCreateData(parsed.data, actorUserId),
    });
    if (audit) {
      await this.audit.log({
        ...audit,
        action: 'synthetic_check_created',
        payload: { after: created },
        target_resource_id: created.id,
        target_resource_type: 'synthetic_check',
      });
    }
    await this.scheduler.syncDefinition(created.id);
    return created;
  }

  async update(
    id: string,
    dto: UpdateSyntheticCheckDefinitionDto,
    audit?: PlatformAuditContext,
  ): Promise<PlatformSyntheticCheckDefinition> {
    const existing = await this.prisma.platformSyntheticCheckDefinition.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'SYNTHETIC_CHECK_NOT_FOUND',
        message: `Synthetic check "${id}" not found.`,
      });
    }
    const merged = {
      consecutive_failure_threshold_critical: existing.consecutive_failure_threshold_critical,
      description: existing.description ?? undefined,
      display_name: existing.display_name,
      enabled: existing.enabled,
      expected: existing.expected,
      kind: existing.kind,
      key: existing.key,
      related_component: existing.related_component ?? undefined,
      related_tenant_id: existing.related_tenant_id ?? undefined,
      retry_attempts: existing.retry_attempts,
      schedule_cron: existing.schedule_cron,
      target: existing.target,
      timeout_ms: existing.timeout_ms,
      ...dto,
    };
    const parsed = createSyntheticCheckDefinitionSchema.safeParse(merged);
    if (!parsed.success) {
      throw new BadRequestException({
        code: 'INVALID_SYNTHETIC_CHECK_DEFINITION',
        details: parsed.error.flatten(),
        message: 'Synthetic check definition is invalid.',
      });
    }
    const updated = await this.prisma.platformSyntheticCheckDefinition.update({
      where: { id },
      data: this.definitionUpdateData(parsed.data),
    });
    if (audit) {
      await this.audit.log({
        ...audit,
        action: 'synthetic_check_updated',
        payload: { before: existing, after: updated },
        target_resource_id: id,
        target_resource_type: 'synthetic_check',
      });
    }
    await this.scheduler.syncDefinition(id);
    return updated;
  }

  async remove(id: string, audit?: PlatformAuditContext): Promise<void> {
    const existing = await this.prisma.platformSyntheticCheckDefinition.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException({
        code: 'SYNTHETIC_CHECK_NOT_FOUND',
        message: `Synthetic check "${id}" not found.`,
      });
    }
    await this.prisma.platformSyntheticCheckDefinition.delete({ where: { id } });
    if (audit) {
      await this.audit.log({
        ...audit,
        action: 'synthetic_check_deleted',
        payload: { before: existing },
        target_resource_id: id,
        target_resource_type: 'synthetic_check',
      });
    }
    await this.scheduler.removeDefinitionSchedule(existing.key);
  }

  async listResults(id: string, query: SyntheticCheckResultsQuery) {
    const where: Prisma.PlatformSyntheticCheckResultWhereInput = { definition_id: id };
    if (query.status) where.status = query.status;
    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await Promise.all([
      this.prisma.platformSyntheticCheckResult.findMany({
        where,
        orderBy: { ran_at: 'desc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.platformSyntheticCheckResult.count({ where }),
    ]);
    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async getResult(resultId: string) {
    const result = await this.prisma.platformSyntheticCheckResult.findUnique({
      where: { id: resultId },
      include: { definition: true },
    });
    if (!result) {
      throw new NotFoundException({
        code: 'SYNTHETIC_CHECK_RESULT_NOT_FOUND',
        message: `Synthetic check result "${resultId}" not found.`,
      });
    }
    return result;
  }

  async externalDependencies() {
    return this.prisma.platformExternalDependencyStatus.findMany({
      orderBy: [{ status: 'asc' }, { display_name: 'asc' }],
    });
  }

  async certificates() {
    return this.prisma.platformCertificateCheck.findMany({
      orderBy: [{ days_until_expiry: 'asc' }, { hostname: 'asc' }],
    });
  }

  private definitionCreateData(
    dto: NormalizedSyntheticCheckDefinition,
    actorUserId: string,
  ): Prisma.PlatformSyntheticCheckDefinitionUncheckedCreateInput {
    return {
      consecutive_failure_threshold_critical: dto.consecutive_failure_threshold_critical,
      description: dto.description ?? null,
      display_name: dto.display_name,
      enabled: dto.enabled,
      expected: toJson(dto.expected ?? {}),
      kind: dto.kind,
      key: dto.key,
      related_component: dto.related_component ?? null,
      related_tenant_id: dto.related_tenant_id ?? null,
      retry_attempts: dto.retry_attempts,
      schedule_cron: dto.schedule_cron,
      target: toJson(dto.target ?? {}),
      timeout_ms: dto.timeout_ms,
      created_by_user_id: actorUserId,
    };
  }

  private definitionUpdateData(
    dto: NormalizedSyntheticCheckDefinition,
  ): Prisma.PlatformSyntheticCheckDefinitionUncheckedUpdateInput {
    return {
      consecutive_failure_threshold_critical: dto.consecutive_failure_threshold_critical,
      description: dto.description ?? null,
      display_name: dto.display_name,
      enabled: dto.enabled,
      expected: toJson(dto.expected ?? {}),
      kind: dto.kind,
      key: dto.key,
      related_component: dto.related_component ?? null,
      related_tenant_id: dto.related_tenant_id ?? null,
      retry_attempts: dto.retry_attempts,
      schedule_cron: dto.schedule_cron,
      target: toJson(dto.target ?? {}),
      timeout_ms: dto.timeout_ms,
    };
  }
}

function dataPointResults(
  results: Array<{ ran_at: Date; status: string }>,
): Array<{ ran_at: Date; status: string }> {
  const since = Date.now() - 24 * 60 * 60 * 1000;
  return results.filter((result) => result.ran_at.getTime() >= since);
}

function uptime(results: Array<{ status: string }>): number {
  if (results.length === 0) return 0;
  const passing = results.filter((result) => result.status === 'passed').length;
  return Math.round((passing / results.length) * 1000) / 10;
}
