import { Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { StructuredLoggerService } from '../services/logger.service';

// ─── Development-only request logging ───────────────────────────────────────

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new StructuredLoggerService();

  use(req: Request, res: Response, next: NextFunction): void {
    if (process.env.NODE_ENV !== 'development') {
      next();
      return;
    }

    const requestPath = req.originalUrl ?? req.url;

    if (requestPath.startsWith('/api/health') || requestPath.startsWith('/api/docs')) {
      next();
      return;
    }

    const startedAt = Date.now();

    res.once('finish', () => {
      const durationMs = Date.now() - startedAt;
      this.logger.log(
        `${req.method} ${requestPath} ${res.statusCode} ${durationMs}ms`,
        RequestLoggingMiddleware.name,
      );
    });

    next();
  }
}
