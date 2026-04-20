import type { PrismaClient } from '@prisma/client';

import {
  DEFAULT_BEHAVIOUR_CATEGORIES,
  WELLBEING_AI_MODULE_KEYS,
} from './seed-data/wellbeing-default-categories';

/**
 * Wellbeing defaults seeding (Wave 1 / Impl 01 of the wellbeing rebuild).
 *
 * Idempotent. Callable from both:
 *   - packages/prisma/seed.ts (global `pnpm db:seed` for dev / fresh prod)
 *   - apps/api TenantsService.createTenant flow (new tenant bootstrap)
 *
 * Seeds three things per tenant:
 *   1. tenant_ai_flags — one row per module_key, enabled=false.
 *   2. behaviour_categories — only if the tenant has zero categories. The
 *      legacy 12-category seed in `seed/behaviour-seed.ts` is preserved for
 *      tenants that already run through it; this 28-category seed is a
 *      fallback / future replacement.
 *   3. tenant_notification_preferences — one row with default channel
 *      preferences (all secondary channels off; in-app is always on).
 *
 * Re-running on a tenant that already has rows is a no-op.
 */
export async function seedWellbeingDefaultsForTenant(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  // 1. AI flags — one per module, enabled=false.
  for (const moduleKey of WELLBEING_AI_MODULE_KEYS) {
    await prisma.tenantAiFlag.upsert({
      where: {
        tenant_id_module_key: { tenant_id: tenantId, module_key: moduleKey },
      },
      update: {},
      create: { tenant_id: tenantId, module_key: moduleKey, enabled: false },
    });
  }

  // 2. Behaviour categories — only seed when tenant has zero categories
  //    configured. Avoids duplicating the legacy 12-category seed and
  //    avoids overwriting any bespoke categories a tenant has created.
  const existingCount = await prisma.behaviourCategory.count({
    where: { tenant_id: tenantId },
  });
  if (existingCount === 0) {
    await prisma.behaviourCategory.createMany({
      data: DEFAULT_BEHAVIOUR_CATEGORIES.map((c) => ({
        ...c,
        tenant_id: tenantId,
      })),
    });
  }

  // 3. Notification preferences — upsert with defaults. The unique
  //    constraint on tenant_id keeps re-runs safe.
  await prisma.tenantNotificationPreferences.upsert({
    where: { tenant_id: tenantId },
    update: {},
    create: {
      tenant_id: tenantId,
      wellbeing_channels: {
        defaults: { email: false, sms: false, whatsapp: false },
        overrides: {},
      },
    },
  });
}

/**
 * Seed wellbeing defaults for every existing tenant. Used by `pnpm db:seed`.
 */
export async function seedWellbeingDefaultsForAllTenants(prisma: PrismaClient): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  for (const tenant of tenants) {
    await seedWellbeingDefaultsForTenant(prisma, tenant.id);
  }
}

export { DEFAULT_BEHAVIOUR_CATEGORIES, WELLBEING_AI_MODULE_KEYS };
export type {
  WellbeingAiModuleKey,
  WellbeingDefaultCategorySeed,
} from './seed-data/wellbeing-default-categories';
