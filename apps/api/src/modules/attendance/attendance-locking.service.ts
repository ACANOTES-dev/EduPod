import { Injectable } from '@nestjs/common';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ConfigurationReadFacade } from '../configuration/configuration-read.facade';
import { PrismaService } from '../prisma/prisma.service';

// ─── AttendanceLockingService ────────────────────────────────────────────────

/**
 * Handles automatic locking of submitted attendance sessions
 * after the tenant-configured threshold (autoLockAfterDays).
 */
@Injectable()
export class AttendanceLockingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationReadFacade: ConfigurationReadFacade,
  ) {}

  // ─── Auto-Lock ───────────────────────────────────────────────────────────

  /**
   * Auto-lock submitted sessions older than the configured threshold.
   * Reads autoLockAfterDays from tenant settings; no-ops if not set.
   */
  async lockExpiredSessions(tenantId: string) {
    // Read tenant settings for autoLockAfterDays
    const settingsJson = await this.configurationReadFacade.findSettingsJson(tenantId);

    const settings = (settingsJson ?? {}) as Record<string, unknown>;
    const attendanceSettings = (settings['attendance'] ?? {}) as Record<string, unknown>;
    const autoLockAfterDays = attendanceSettings['autoLockAfterDays'] as number | undefined;
    if (autoLockAfterDays === undefined || autoLockAfterDays === null) {
      return { locked_count: 0 };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - autoLockAfterDays);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.attendanceSession.updateMany({
        where: {
          tenant_id: tenantId,
          status: 'submitted',
          session_date: { lte: cutoffDate },
        },
        data: { status: 'locked' },
      });
    })) as { count: number };

    return { locked_count: result.count };
  }
}
