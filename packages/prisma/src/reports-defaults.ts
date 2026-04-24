import type { PrismaClient } from '@prisma/client';

/**
 * Reports rebuild defaults seeding (Wave 1 / Impl 01).
 *
 * Idempotent. Callable from both:
 *   - packages/prisma/seed.ts (global `pnpm db:seed` for dev / fresh prod)
 *   - apps/api TenantsService.createTenant flow (new tenant bootstrap)
 *
 * Seeds per tenant:
 *   - tenant_ai_flags rows for the three reports AI modules
 *     (reports_narration, reports_ask_ai, reports_predictions) — all
 *     enabled=false. Tenants opt in via Settings → Reports and absorb
 *     the Anthropic cost themselves.
 *
 * The 20260425100000_reports_rebuild_foundation migration backfills
 * these rows for every tenant that existed at migration time. This
 * function is what keeps the contract true for tenants created after
 * the migration shipped.
 *
 * Re-running on a tenant that already has rows is a no-op.
 */
export const REPORTS_AI_MODULE_KEYS = [
  'reports_narration',
  'reports_ask_ai',
  'reports_predictions',
] as const;

export type ReportsAiModuleKey = (typeof REPORTS_AI_MODULE_KEYS)[number];

export async function seedReportsDefaultsForTenant(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  for (const moduleKey of REPORTS_AI_MODULE_KEYS) {
    await prisma.tenantAiFlag.upsert({
      where: {
        tenant_id_module_key: { tenant_id: tenantId, module_key: moduleKey },
      },
      update: {},
      create: { tenant_id: tenantId, module_key: moduleKey, enabled: false },
    });
  }
}

/**
 * Seed reports defaults for every existing tenant. Used by `pnpm db:seed`.
 */
export async function seedReportsDefaultsForAllTenants(prisma: PrismaClient): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  for (const tenant of tenants) {
    await seedReportsDefaultsForTenant(prisma, tenant.id);
  }
}
