import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { AuditLogService } from '../../modules/audit-log/audit-log.service';

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

  constructor(private readonly auditLogService: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method } = request;

    // Only audit mutations
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      tap({
        next: () => {
          try {
            const tenantId =
              (request as unknown as Record<string, unknown>)['tenantContext'] != null
                ? ((request as unknown as Record<string, unknown>)['tenantContext'] as { tenant_id: string }).tenant_id
                : null;

            const actorUserId =
              (request as unknown as Record<string, unknown>)['currentUser'] != null
                ? ((request as unknown as Record<string, unknown>)['currentUser'] as { sub: string }).sub
                : null;

            const { entityType, entityId } = this.parseEntityFromPath(request.originalUrl);

            const sanitizedBody = this.sanitizeBody(request.body as Record<string, unknown>);

            const metadata: Record<string, unknown> = {
              method,
              path: request.originalUrl,
              body: sanitizedBody,
              status_code: response.statusCode,
            };

            // Fire-and-forget — write() never throws
            void this.auditLogService.write(
              tenantId,
              actorUserId,
              entityType,
              entityId,
              `${method} ${request.originalUrl}`,
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
    // Strip query string
    const pathOnly = url.split('?')[0] ?? url;
    const segments = pathOnly.split('/').filter(Boolean);

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

  /**
   * Strip sensitive fields from request body before storing in metadata.
   */
  private sanitizeBody(body: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
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
}
