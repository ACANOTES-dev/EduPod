import { createHash, randomUUID } from 'crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PlatformSyntheticCheckResult } from '@prisma/client';

import { getCorrelationId } from '../../common/middleware/correlation.middleware';
import { recordCorrelationEvent } from '../../common/services/correlation-event-sink';
import { ErrorRedactorService } from '../platform-error-log/error-redactor.service';
import { PrismaService } from '../prisma/prisma.service';

import { SyntheticAlertEmitterService } from './synthetic-alert-emitter.service';
import { SyntheticCheckHandlersService } from './synthetic-check-handlers.service';
import { isFailureStatus, type HandlerResult } from './synthetic-types';

type TriggeredBy = 'schedule' | 'run_now' | 'retry';

@Injectable()
export class SyntheticCheckRunnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly handlers: SyntheticCheckHandlersService,
    private readonly redactor: ErrorRedactorService,
    private readonly alerts: SyntheticAlertEmitterService,
  ) {}

  async run(
    definitionId: string,
    opts: { triggered_by?: TriggeredBy; user_id?: string } = {},
  ): Promise<PlatformSyntheticCheckResult> {
    const definition = await this.prisma.platformSyntheticCheckDefinition.findUnique({
      where: { id: definitionId },
    });
    if (!definition) {
      throw new NotFoundException({
        code: 'SYNTHETIC_CHECK_NOT_FOUND',
        message: `Synthetic check "${definitionId}" not found.`,
      });
    }

    if (await this.isSuppressedByMaintenance(definition.related_component)) {
      const result = await this.writeResult(definition.id, {
        attemptNumber: 1,
        handlerResult: { status: 'skipped_maintenance' },
        triggeredBy: opts.triggered_by ?? 'schedule',
        userId: opts.user_id,
      });
      return result;
    }

    const attempts = Math.max(1, definition.retry_attempts);
    let finalResult: PlatformSyntheticCheckResult | null = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const handler = this.handlers.get(definition.kind);
      const handlerResult = await handler.execute({
        expected: toRecord(definition.expected),
        target: toRecord(definition.target),
        timeout_ms: definition.timeout_ms,
      });
      finalResult = await this.writeResult(definition.id, {
        attemptNumber: attempt,
        handlerResult,
        triggeredBy: attempt === 1 ? (opts.triggered_by ?? 'schedule') : 'retry',
        userId: opts.user_id,
      });
      await this.writeSideEffectRows(handlerResult);
      if (!isFailureStatus(handlerResult.status)) break;
    }

    if (!finalResult) {
      throw new Error('Synthetic check did not produce a result row.');
    }
    await this.emitAlerts(definition.id, definition.key, definition.display_name);
    return finalResult;
  }

  private async isSuppressedByMaintenance(component: string | null): Promise<boolean> {
    if (!component) return false;
    const now = new Date();
    const activeWindow = await this.prisma.platformMaintenanceWindow.findFirst({
      where: {
        cancelled_at: null,
        ends_at: { gt: now },
        starts_at: { lte: now },
      },
      select: { id: true },
    });
    return Boolean(activeWindow);
  }

  private async writeResult(
    definitionId: string,
    input: {
      attemptNumber: number;
      handlerResult: HandlerResult;
      triggeredBy: TriggeredBy;
      userId?: string;
    },
  ): Promise<PlatformSyntheticCheckResult> {
    const redactedSnippet = await this.redactSnippet(input.handlerResult.response_body);
    const redactedFailure = await this.redactFailure(input.handlerResult.failure_detail);
    const correlationId = getCorrelationId() ?? randomUUID();
    const created = await this.prisma.platformSyntheticCheckResult.create({
      data: {
        attempt_number: input.attemptNumber,
        correlation_id: correlationId,
        definition_id: definitionId,
        failure_detail: redactedFailure,
        latency_ms: input.handlerResult.latency_ms,
        response_body_sha256: input.handlerResult.response_body
          ? createHash('sha256').update(input.handlerResult.response_body).digest('hex')
          : null,
        response_body_snippet: redactedSnippet,
        response_status_code: input.handlerResult.response_status_code,
        status: input.handlerResult.status,
        triggered_by: input.triggeredBy,
        triggered_by_user_id: input.userId,
      },
    });
    recordCorrelationEvent({
      correlation_id: correlationId,
      event_type: 'synthetic_check_result',
      payload: {
        definition_id: definitionId,
        result_id: created.id,
        status: created.status,
        triggered_by: created.triggered_by,
      },
      source: 'api',
      user_id: input.userId,
    });
    return created;
  }

  private async redactSnippet(body: string | undefined): Promise<string | null> {
    if (!body) return null;
    const redacted = await this.redactor.redact(body.slice(0, 2000));
    return redacted.redacted.slice(0, 500);
  }

  private async redactFailure(
    failureDetail: Record<string, unknown> | undefined,
  ): Promise<Prisma.InputJsonValue | undefined> {
    if (!failureDetail) return undefined;
    const redacted = await this.redactor.redact(JSON.stringify(failureDetail));
    return JSON.parse(redacted.redacted) as Prisma.InputJsonValue;
  }

  private async writeSideEffectRows(result: HandlerResult): Promise<void> {
    if (result.certificate) {
      await this.prisma.platformCertificateCheck.upsert({
        where: { hostname: result.certificate.hostname },
        update: {
          check_error: result.certificate.check_error,
          check_status: result.certificate.check_status,
          days_until_expiry: result.certificate.days_until_expiry,
          issuer: result.certificate.issuer,
          last_checked_at: new Date(),
          not_after: result.certificate.not_after,
          not_before: result.certificate.not_before,
          subject: result.certificate.subject,
        },
        create: {
          check_error: result.certificate.check_error,
          check_status: result.certificate.check_status,
          days_until_expiry: result.certificate.days_until_expiry,
          hostname: result.certificate.hostname,
          issuer: result.certificate.issuer,
          not_after: result.certificate.not_after,
          not_before: result.certificate.not_before,
          subject: result.certificate.subject,
        },
      });
    }
    if (result.external_dependency) {
      const existing = await this.prisma.platformExternalDependencyStatus.findUnique({
        where: { provider_key: result.external_dependency.provider_key },
      });
      await this.prisma.platformExternalDependencyStatus.upsert({
        where: { provider_key: result.external_dependency.provider_key },
        update: {
          last_checked_at: new Date(),
          last_status_changed_at:
            existing && existing.status !== result.external_dependency.status
              ? new Date()
              : existing?.last_status_changed_at,
          status: result.external_dependency.status,
          status_detail: result.external_dependency.status_detail,
          upstream_url: result.external_dependency.upstream_url,
        },
        create: {
          display_name: result.external_dependency.display_name,
          last_status_changed_at: new Date(),
          provider_key: result.external_dependency.provider_key,
          source: result.external_dependency.source,
          status: result.external_dependency.status,
          status_detail: result.external_dependency.status_detail,
          upstream_url: result.external_dependency.upstream_url,
        },
      });
    }
  }

  private async emitAlerts(
    definitionId: string,
    definitionKey: string,
    displayName: string,
  ): Promise<void> {
    const latest = await this.prisma.platformSyntheticCheckResult.findFirst({
      where: { definition_id: definitionId },
      orderBy: { ran_at: 'desc' },
    });
    if (!latest || latest.status === 'skipped_maintenance') return;
    const prior = await this.prisma.platformSyntheticCheckResult.findMany({
      where: { definition_id: definitionId, id: { not: latest.id } },
      orderBy: { ran_at: 'desc' },
      take: 1,
    });
    const definition = await this.prisma.platformSyntheticCheckDefinition.findUniqueOrThrow({
      where: { id: definitionId },
      select: { consecutive_failure_threshold_critical: true },
    });

    if (latest.status === 'passed' && prior[0] && isFailureStatus(prior[0].status)) {
      await this.alerts.emit({
        definition_key: definitionKey,
        display_name: displayName,
        message: `[INFO] Synthetic check recovered: ${displayName}`,
        metric_value: 0,
        severity: 'info',
        type: 'recovered',
      });
      return;
    }
    if (!isFailureStatus(latest.status)) return;

    const recent = await this.prisma.platformSyntheticCheckResult.findMany({
      where: { definition_id: definitionId },
      orderBy: { ran_at: 'desc' },
      take: definition.consecutive_failure_threshold_critical,
    });
    const consecutiveFailures = recent.filter((row) => isFailureStatus(row.status)).length;
    const critical = consecutiveFailures >= definition.consecutive_failure_threshold_critical;
    await this.alerts.emit({
      definition_key: definitionKey,
      display_name: displayName,
      message: `[${critical ? 'CRITICAL' : 'WARNING'}] Synthetic check failed: ${displayName}`,
      metric_value: consecutiveFailures,
      severity: critical ? 'critical' : 'warning',
      type: critical ? 'failed_critical' : 'failed',
    });
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
