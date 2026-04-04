import { Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { MetricsService } from './metrics.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const EXCLUDED_PREFIXES = ['/api/health', '/api/docs', '/api/metrics'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isExcludedPath(path: string): boolean {
  return EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function stripUuids(value: string): string {
  return value.replace(UUID_RE, ':id');
}

// ─── Middleware ───────────────────────────────────────────────────────────────

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metricsService: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestPath = req.originalUrl ?? req.url;

    if (isExcludedPath(requestPath)) {
      next();
      return;
    }

    const method = req.method;
    const startTime = process.hrtime.bigint();

    this.metricsService.incrementInFlight(method);

    res.once('finish', () => {
      this.metricsService.decrementInFlight(method);

      const endTime = process.hrtime.bigint();
      const durationSeconds = Number(endTime - startTime) / 1e9;
      const normalizedPath = stripUuids(requestPath);

      this.metricsService.recordRequest(method, normalizedPath, res.statusCode, durationSeconds);
    });

    next();
  }
}
