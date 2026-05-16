import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

import type { TenantContext } from '@school/shared';

import { RedisService } from '../../modules/redis/redis.service';

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DEFAULT_MAINTENANCE_MESSAGE =
  'This school is currently undergoing maintenance. Please try again later.';

@Injectable()
export class MaintenanceModeMiddleware implements NestMiddleware {
  private readonly logger = new Logger(MaintenanceModeMiddleware.name);

  constructor(private readonly redis: RedisService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (READ_ONLY_METHODS.has(req.method) || req.originalUrl.startsWith('/api/v1/admin')) {
      next();
      return;
    }

    const tenantContext = (req as unknown as { tenantContext?: TenantContext | null })
      .tenantContext;
    const tenantId = tenantContext?.tenant_id;
    if (!tenantId) {
      next();
      return;
    }

    try {
      const maintenance = await this.redis.getClient().get(`tenant:${tenantId}:maintenance`);
      if (!maintenance) {
        next();
        return;
      }

      res.status(503).json({
        error: {
          code: 'MAINTENANCE_MODE',
          message: parseMaintenanceMessage(maintenance),
        },
      });
    } catch (err) {
      this.logger.warn(
        `Maintenance-mode Redis check failed; allowing request to continue: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      next();
    }
  }
}

function parseMaintenanceMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const message = (parsed as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }
    }
  } catch {
    return DEFAULT_MAINTENANCE_MESSAGE;
  }

  return DEFAULT_MAINTENANCE_MESSAGE;
}
