import { createHash } from 'crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PlatformErrorLog, type PlatformErrorRedactionRule } from '@prisma/client';

import type {
  CreatePlatformErrorRedactionRuleDto,
  PlatformErrorLogQuery,
  PreviewPlatformErrorRedactionRuleDto,
} from '@school/shared';

import { getCorrelationId } from '../../common/middleware/correlation.middleware';
import { recordCorrelationEvent } from '../../common/services/correlation-event-sink';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { ErrorRedactorService } from './error-redactor.service';

type ErrorSource = 'api' | 'worker' | 'web-ssr' | 'web-csr' | 'cron';
type ErrorLevel = 'error' | 'warn';

export interface CapturePlatformErrorInput {
  source: ErrorSource;
  level: ErrorLevel;
  message: string;
  stack?: string;
  tenant_id?: string;
  user_id?: string;
  endpoint?: string;
  http_status?: number;
  error_code?: string;
  correlation_id?: string;
  sentry_event_id?: string;
}

@Injectable()
export class PlatformErrorLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redactor: ErrorRedactorService,
    private readonly platformAuditService: PlatformAuditService,
  ) {}

  async capture(input: CapturePlatformErrorInput): Promise<void> {
    const [message, stack] = await Promise.all([
      this.redactor.redact(input.message),
      input.stack ? this.redactor.redact(input.stack) : Promise.resolve(null),
    ]);
    const fingerprint = this.fingerprint(message.redacted, stack?.redacted);
    const now = new Date();
    const metadata = {
      rules_applied: Array.from(
        new Set([...message.rules_applied, ...(stack?.rules_applied ?? [])]),
      ),
      pre_redaction_length: input.message.length + (input.stack?.length ?? 0),
      post_redaction_length: message.redacted.length + (stack?.redacted.length ?? 0),
    };

    let capturedId: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.platformErrorLog.findFirst({ where: { fingerprint } });
      if (existing) {
        const updated = await tx.platformErrorLog.update({
          where: { id: existing.id },
          data: {
            count: { increment: 1 },
            last_seen_at: now,
            error_code: input.error_code ?? existing.error_code,
            endpoint: input.endpoint ?? existing.endpoint,
            http_status: input.http_status ?? existing.http_status,
            tenant_id_redacted: input.tenant_id ?? existing.tenant_id_redacted,
            user_id_redacted: input.user_id ?? existing.user_id_redacted,
            sentry_event_id: input.sentry_event_id ?? existing.sentry_event_id,
            correlation_id: input.correlation_id ?? existing.correlation_id,
          },
        });
        capturedId = updated?.id ?? existing.id;
        return;
      }

      const created = await tx.platformErrorLog.create({
        data: {
          occurred_at: now,
          source: input.source,
          level: input.level,
          message_redacted: message.redacted,
          stack_redacted: stack?.redacted,
          error_code: input.error_code,
          endpoint: input.endpoint,
          http_status: input.http_status,
          fingerprint,
          first_seen_at: now,
          last_seen_at: now,
          redaction_metadata: toJson(metadata),
          tenant_id_redacted: input.tenant_id,
          user_id_redacted: input.user_id,
          correlation_id: input.correlation_id,
          sentry_event_id: input.sentry_event_id,
        },
      });
      capturedId = created?.id ?? null;
    });
    const correlationId = input.correlation_id ?? getCorrelationId();
    if (correlationId && capturedId) {
      recordCorrelationEvent({
        correlation_id: correlationId,
        source: input.source,
        event_type: 'error_captured',
        tenant_id: input.tenant_id,
        user_id: input.user_id,
        payload: {
          platform_error_log_id: capturedId,
          fingerprint,
          level: input.level,
          endpoint: input.endpoint,
          http_status: input.http_status,
        },
      });
    }
  }

  async listRedacted(query: PlatformErrorLogQuery): Promise<{
    data: PlatformErrorLog[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const where: Prisma.PlatformErrorLogWhereInput = {};
    if (query.source) where.source = query.source;
    if (query.level) where.level = query.level;
    if (query.fingerprint) where.fingerprint = query.fingerprint;
    if (query.tenant_id) where.tenant_id_redacted = query.tenant_id;
    if (query.platform_level) where.tenant_id_redacted = null;
    if (query.endpoint) where.endpoint = { contains: query.endpoint, mode: 'insensitive' };
    if (query.http_status) where.http_status = query.http_status;
    if (query.error_code) where.error_code = { contains: query.error_code, mode: 'insensitive' };
    if (query.message) {
      where.message_redacted = { contains: query.message, mode: 'insensitive' };
    }
    if (query.from || query.to) {
      const lastSeenFilter: Prisma.DateTimeFilter = {};
      if (query.from) lastSeenFilter.gte = query.from;
      if (query.to) lastSeenFilter.lte = query.to;
      where.last_seen_at = lastSeenFilter;
    }

    const skip = (query.page - 1) * query.pageSize;
    const [data, total] = await Promise.all([
      this.prisma.platformErrorLog.findMany({
        where,
        orderBy: { last_seen_at: 'desc' },
        skip,
        take: query.pageSize,
      }),
      this.prisma.platformErrorLog.count({ where }),
    ]);

    return { data, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  async getRedacted(id: string): Promise<PlatformErrorLog> {
    const error = await this.prisma.platformErrorLog.findUnique({ where: { id } });
    if (!error) {
      throw new NotFoundException({
        code: 'PLATFORM_ERROR_LOG_NOT_FOUND',
        message: `Platform error log entry with id "${id}" not found`,
      });
    }
    return error;
  }

  async listRules(): Promise<{
    built_in: Array<{ name: string; pattern: string; replacement: string }>;
    custom: PlatformErrorRedactionRule[];
  }> {
    const custom = await this.prisma.platformErrorRedactionRule.findMany({
      orderBy: { created_at: 'desc' },
    });
    return {
      built_in: this.redactor.builtInRules().map((rule) => ({
        name: rule.name,
        pattern: rule.pattern,
        replacement: rule.replacement,
      })),
      custom,
    };
  }

  async createRule(
    dto: CreatePlatformErrorRedactionRuleDto,
    actorUserId: string,
  ): Promise<PlatformErrorRedactionRule> {
    const created = await this.prisma.platformErrorRedactionRule.create({
      data: {
        name: dto.name,
        pattern: dto.pattern,
        pattern_flags: dto.pattern_flags,
        replacement: dto.replacement,
        severity: dto.severity,
        created_by_user_id: actorUserId,
      },
    });

    await this.platformAuditService.log({
      actor_user_id: actorUserId,
      action: 'platform_error_redaction_rule_created',
      target_resource_type: 'platform_error_redaction_rule',
      target_resource_id: created.id,
      payload: { after: created },
    });

    return created;
  }

  async deleteRule(id: string, actorUserId: string): Promise<void> {
    const existing = await this.prisma.platformErrorRedactionRule.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        code: 'REDACTION_RULE_NOT_FOUND',
        message: `Redaction rule "${id}" not found`,
      });
    }

    await this.prisma.platformErrorRedactionRule.delete({ where: { id } });
    await this.platformAuditService.log({
      actor_user_id: actorUserId,
      action: 'platform_error_redaction_rule_deleted',
      target_resource_type: 'platform_error_redaction_rule',
      target_resource_id: id,
      payload: { before: existing },
    });
  }

  async preview(dto: PreviewPlatformErrorRedactionRuleDto): Promise<{
    sample: string;
    redacted: string;
    rules_applied: string[];
  }> {
    const sample =
      dto.sample ??
      'Example: parent test@example.com called +353 85 123 4567 with token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature';
    const result = this.redactor.applyPreview(sample, {
      name: dto.name,
      pattern: dto.pattern,
      pattern_flags: dto.pattern_flags,
      replacement: dto.replacement,
    });
    return { sample, redacted: result.redacted, rules_applied: result.rules_applied };
  }

  async purgeExpired(actorUserId: string, now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const result = await this.prisma.platformErrorLog.deleteMany({
      where: { last_seen_at: { lt: cutoff } },
    });

    await this.platformAuditService.log({
      actor_user_id: actorUserId,
      action: 'platform_error_retention_purged',
      target_resource_type: 'platform_error_log',
      payload: { extra: { purged_count: result.count, cutoff: cutoff.toISOString() } },
    });

    return result.count;
  }

  async resolveMaintenanceActor(): Promise<string | null> {
    const platformUser = await this.prisma.platformUser.findFirst({
      where: {
        revoked_at: null,
        roles: { some: { role: { role_key: 'platform_owner' } } },
        user: { global_status: 'active' },
      },
      select: { user_id: true },
      orderBy: { invited_at: 'asc' },
    });
    return platformUser?.user_id ?? null;
  }

  private fingerprint(message: string, stack?: string): string {
    const firstFrame = stack?.split('\n').find((line) => line.trim().length > 0) ?? '';
    return createHash('sha256').update(`${message}\n${firstFrame}`).digest('hex');
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}
