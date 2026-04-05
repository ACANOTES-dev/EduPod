import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import type { AuditLogSensitivity } from '@school/shared';

import { AuditLogService } from '../../modules/audit-log/audit-log.service';
import {
  SENSITIVE_DATA_ACCESS_KEY,
  type SensitiveDataAccessMetadata,
} from '../decorators/sensitive-data-access.decorator';

/** Fields to strip from request body before persisting to audit metadata. */
const SENSITIVE_FIELDS = new Set([
  'password',
  'password_hash',
  'token',
  'secret',
  'mfa_secret',
  'refresh_token',
  'current_password',
  'new_password',
]);

/** UUID v4 pattern for entity ID extraction from URL paths. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Audit log interceptor.
 *
 * Logs POST/PUT/PATCH/DELETE mutations to the audit_logs table via
 * AuditLogService. Runs AFTER the response is sent (non-blocking).
 * Never causes a request to fail.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method } = request;
    const sensitiveDataAccess = this.reflector.getAllAndOverride<
      SensitiveDataAccessMetadata | undefined
    >(SENSITIVE_DATA_ACCESS_KEY, [context.getHandler(), context.getClass()]);
    const shouldAuditMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const shouldAuditReadAccess = method === 'GET' && sensitiveDataAccess !== undefined;

    if (!shouldAuditMutation && !shouldAuditReadAccess) {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      tap({
        next: (result) => {
          try {
            const tenantId =
              (request as unknown as Record<string, unknown>)['tenantContext'] != null
                ? (
                    (request as unknown as Record<string, unknown>)['tenantContext'] as {
                      tenant_id: string;
                    }
                  ).tenant_id
                : null;

            const actorUserId =
              (request as unknown as Record<string, unknown>)['currentUser'] != null
                ? (
                    (request as unknown as Record<string, unknown>)['currentUser'] as {
                      sub: string;
                    }
                  ).sub
                : null;

            const path = this.getPathWithoutQuery(request.originalUrl);
            const parsedEntity = this.parseEntityFromPath(path);
            const entityType = sensitiveDataAccess?.entityType ?? parsedEntity.entityType;
            const entityId = this.resolveEntityId(
              request,
              sensitiveDataAccess?.entityIdField,
              parsedEntity.entityId,
            );

            const metadata = shouldAuditMutation
              ? this.buildMutationMetadata(
                  request.body as Record<string, unknown> | undefined,
                  method,
                  path,
                  response.statusCode,
                  sensitiveDataAccess?.sensitivity ?? 'normal',
                )
              : this.buildReadAccessMetadata(
                  method,
                  path,
                  response.statusCode,
                  sensitiveDataAccess?.sensitivity ?? 'normal',
                  result,
                );

            void this.auditLogService.enqueue(
              tenantId,
              actorUserId,
              entityType,
              entityId,
              `${method} ${path}`,
              metadata,
              request.ip ?? null,
            );
          } catch (error: unknown) {
            this.logger.error(
              'Failed to prepare audit log entry',
              error instanceof Error ? error.stack : String(error),
            );
          }
        },
        error: () => {
          // Do not audit failed requests — they may not have completed processing
        },
      }),
    );
  }

  /**
   * Parse entity_type and entity_id from URL path.
   *
   * Looks for pattern `/v1/{resource}/{uuid}` or `/v1/{...}/{resource}/{uuid}`.
   * Falls back to the first non-version segment as entity_type.
   */
  private parseEntityFromPath(url: string): { entityType: string; entityId: string | null } {
    const segments = url.split('/').filter(Boolean);

    let entityType = 'unknown';
    let entityId: string | null = null;

    // Walk segments looking for resource/uuid pairs
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;

      // Skip version prefix
      if (segment === 'v1' || segment === 'api') {
        continue;
      }

      // If next segment is a UUID, this segment is the resource name
      const nextSegment = segments[i + 1];
      if (nextSegment && UUID_RE.test(nextSegment)) {
        entityType = segment;
        entityId = nextSegment;
        // Don't break — keep walking to find the deepest resource/uuid pair
        i++; // Skip the UUID segment
        continue;
      }

      // If this is not followed by a UUID and we haven't found a type yet, use it
      if (entityType === 'unknown') {
        entityType = segment;
      }
    }

    return { entityType, entityId };
  }

  private getPathWithoutQuery(url: string): string {
    return url.split('?')[0] ?? url;
  }

  /**
   * Strip sensitive fields from request body before storing in metadata.
   */
  private sanitizeBody(
    body: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!body || typeof body !== 'object') {
      return undefined;
    }

    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body)) {
      if (SENSITIVE_FIELDS.has(key)) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private buildMutationMetadata(
    body: Record<string, unknown> | undefined,
    method: string,
    path: string,
    statusCode: number,
    sensitivity: AuditLogSensitivity,
  ): Record<string, unknown> {
    return {
      category: 'mutation',
      sensitivity,
      method,
      path,
      body: this.sanitizeBody(body),
      status_code: statusCode,
    };
  }

  private buildReadAccessMetadata(
    method: string,
    path: string,
    statusCode: number,
    sensitivity: AuditLogSensitivity,
    result: unknown,
  ): Record<string, unknown> {
    return {
      category: 'read_access',
      sensitivity,
      method,
      path,
      status_code: statusCode,
      ...this.summarizeResponse(result),
    };
  }

  private summarizeResponse(result: unknown): Record<string, unknown> {
    if (!result || typeof result !== 'object' || Buffer.isBuffer(result)) {
      return {};
    }

    if (Array.isArray(result)) {
      return this.summarizeRecords(result);
    }

    const record = result as Record<string, unknown>;

    if (Array.isArray(record['data'])) {
      return this.summarizeRecords(record['data']);
    }

    const singleEntityId = this.extractEntityId(record);
    return singleEntityId
      ? {
          accessed_record_count: 1,
          accessed_entity_ids: [singleEntityId],
        }
      : {};
  }

  private summarizeRecords(records: unknown[]): Record<string, unknown> {
    const entityIds = records
      .map((record) =>
        record && typeof record === 'object' && !Array.isArray(record)
          ? this.extractEntityId(record as Record<string, unknown>)
          : undefined,
      )
      .filter((entityId): entityId is string => entityId !== undefined);

    return {
      accessed_record_count: records.length,
      ...(entityIds.length > 0
        ? { accessed_entity_ids: Array.from(new Set(entityIds)).slice(0, 25) }
        : {}),
    };
  }

  private extractEntityId(record: Record<string, unknown>): string | undefined {
    if (typeof record['id'] === 'string') {
      return record['id'];
    }

    for (const [key, value] of Object.entries(record)) {
      if (typeof value === 'string' && (key.endsWith('_id') || key.endsWith('Id'))) {
        return value;
      }
    }

    return undefined;
  }

  private resolveEntityId(
    request: Request,
    entityIdField: string | undefined,
    fallbackEntityId: string | null,
  ): string | null {
    if (!entityIdField) {
      return fallbackEntityId;
    }

    const paramsValue = request.params?.[entityIdField];
    if (typeof paramsValue === 'string') {
      return paramsValue;
    }

    const body = request.body as Record<string, unknown> | undefined;
    const bodyValue = body?.[entityIdField];
    return typeof bodyValue === 'string' ? bodyValue : fallbackEntityId;
  }
}
