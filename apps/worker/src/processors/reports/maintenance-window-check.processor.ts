import { Inject, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { Job } from 'bullmq';

import { getRedisClient } from '../../base/redis.helpers';

export const TENANT_MAINTENANCE_WINDOW_CHECK_JOB = 'platform:maintenance-window-check';

// Cross-tenant platform maintenance job. No tenant_id payload by design.
export type TenantMaintenanceWindowCheckPayload = Record<string, never>;

@Injectable()
export class TenantMaintenanceWindowCheckProcessor {
  private readonly logger = new Logger(TenantMaintenanceWindowCheckProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async process(job: Job<TenantMaintenanceWindowCheckPayload>): Promise<void> {
    if (job.name !== TENANT_MAINTENANCE_WINDOW_CHECK_JOB) return;

    const now = new Date();
    const redis = getRedisClient();

    const starting = await this.prisma.tenantMaintenanceWindow.findMany({
      where: {
        starts_at: { lte: now },
        ends_at: { gt: now },
        tenant: { maintenance_mode: false },
      },
      select: {
        message: true,
        tenant_id: true,
      },
    });

    for (const windowRow of starting) {
      await this.prisma.tenant.update({
        where: { id: windowRow.tenant_id },
        data: {
          maintenance_mode: true,
          maintenance_message: windowRow.message,
        },
      });
      await redis.set(
        `tenant:${windowRow.tenant_id}:maintenance`,
        JSON.stringify({
          message:
            windowRow.message ??
            'This school is currently undergoing maintenance. Please try again later.',
        }),
      );
    }

    const ending = await this.prisma.tenantMaintenanceWindow.findMany({
      where: {
        ends_at: { lte: now },
        tenant: { maintenance_mode: true },
      },
      select: { tenant_id: true },
    });

    for (const windowRow of ending) {
      await this.prisma.tenant.update({
        where: { id: windowRow.tenant_id },
        data: { maintenance_mode: false, maintenance_message: null },
      });
      await redis.del(`tenant:${windowRow.tenant_id}:maintenance`);
    }

    const cleanupCutoff = new Date(now.getTime() - 60 * 60 * 1000);
    const deleted = await this.prisma.tenantMaintenanceWindow.deleteMany({
      where: { ends_at: { lt: cleanupCutoff } },
    });

    this.logger.log(
      `Processed tenant maintenance windows: enabled=${starting.length}, disabled=${ending.length}, deleted_expired=${deleted.count}`,
    );
  }
}
