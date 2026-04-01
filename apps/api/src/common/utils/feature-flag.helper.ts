import { Logger } from '@nestjs/common';

import type { PrismaService } from '../../modules/prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal Prisma-like client that supports tenantSetting.findFirst */
interface PrismaLike {
  tenantSetting: {
    findFirst: PrismaService['tenantSetting']['findFirst'];
  };
}

interface FeatureFlagsJson {
  [key: string]: boolean | undefined;
}

interface SettingsJson {
  feature_flags?: FeatureFlagsJson;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

const logger = new Logger('FeatureFlag');

/**
 * Checks if a feature flag is enabled for a tenant.
 *
 * Reads the tenant_settings.settings JSON and looks for the flag under
 * the "feature_flags" key. Returns false if:
 *   - No tenant_settings row exists
 *   - No feature_flags key in settings
 *   - The flag is not present or is falsy
 *
 * Usage:
 *   if (await isFeatureEnabled(this.prisma, tenantId, FEATURE_FLAGS.SOME_FLAG)) {
 *     // new code path
 *   } else {
 *     // old code path
 *   }
 */
export async function isFeatureEnabled(
  prisma: PrismaLike,
  tenantId: string,
  flagKey: string,
): Promise<boolean> {
  try {
    const tenantSetting = await prisma.tenantSetting.findFirst({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });

    if (!tenantSetting) {
      return false;
    }

    const settings = tenantSetting.settings as SettingsJson | null;
    if (!settings || typeof settings !== 'object') {
      return false;
    }

    const flags = settings.feature_flags;
    if (!flags || typeof flags !== 'object') {
      return false;
    }

    return flags[flagKey] === true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to check feature flag "${flagKey}" for tenant "${tenantId}": ${message}`);
    return false;
  }
}
