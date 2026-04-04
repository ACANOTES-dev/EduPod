import { Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { StructuredLoggerService } from '../services/logger.service';

import { getRequestContext } from './correlation.middleware';

// ─── Constants ────────────────────────────────────────────────────────────────

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const SKIP_PREFIXES = ['/api/health', '/api/docs', '/api/metrics'];

// ─── Request logging ──────────────────────────────────────────────────────────

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new StructuredLoggerService();
  private readonly isProduction = process.env.NODE_ENV === 'production';

  use(req: Request, res: Response, next: NextFunction): void {
    const requestPath = req.originalUrl ?? req.url;

    if (SKIP_PREFIXES.some((prefix) => requestPath.startsWith(prefix))) {
      next();
      return;
    }

    const startedAt = Date.now();

    res.once('finish', () => {
      const durationMs = Date.now() - startedAt;

      if (this.isProduction) {
        const reqCtx = getRequestContext();
        const entry = {
          timestamp: new Date().toISOString(),
          level: 'access',
          method: req.method,
          path: requestPath.replace(UUID_RE, ':id'),
          status: res.statusCode,
          duration_ms: durationMs,
          request_id: reqCtx?.requestId ?? null,
          tenant_id: reqCtx?.tenantId ?? null,
          user_id: reqCtx?.userId ?? null,
        };
        process.stdout.write(JSON.stringify(entry) + '\n');
      } else {
        this.logger.log(
          `${req.method} ${requestPath} ${res.statusCode} ${durationMs}ms`,
          RequestLoggingMiddleware.name,
        );
      }
    });

    next();
  }
}
