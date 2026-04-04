import { BadRequestException } from '@nestjs/common';

import { pastoralTenantSettingsSchema } from '@school/shared/pastoral';

import { ConfigurationReadFacade } from '../../configuration/configuration-read.facade';

import { ChildProtectionReadFacade } from '../../child-protection/child-protection-read.facade';

import { RbacReadFacade } from '../../rbac/rbac-read.facade';

import { PrismaService } from '../../prisma/prisma.service';

import type { ValidatedCategory } from './concern.types';

export class ConcernAccessService {
  constructor(private readonly prisma: PrismaService,
    private readonly rbacReadFacade: RbacReadFacade,
    private readonly childProtectionReadFacade: ChildProtectionReadFacade,
    private readonly configurationReadFacade: ConfigurationReadFacade) {}

  async validateCategory(tenantId: string, categoryKey: string): Promise<ValidatedCategory> {
    const settings = await this.loadPastoralSettings(tenantId);

    const category = settings.concern_categories.find((entry) => {
      return entry.key === categoryKey && entry.active;
    });

    if (!category) {
      throw new BadRequestException({
        code: 'INVALID_CATEGORY',
        message: `Invalid or inactive concern category: ${categoryKey}`,
      });
    }

    return { auto_tier: category.auto_tier };
  }

  async loadPastoralSettings(tenantId: string) {
    const record = await this.configurationReadFacade.findSettings(tenantId);

    const settingsJson = (record?.settings as Record<string, unknown>) ?? {};
    const pastoralRaw = (settingsJson.pastoral as Record<string, unknown>) ?? {};

    return pastoralTenantSettingsSchema.parse(pastoralRaw);
  }

  async checkCpAccess(tenantId: string, userId: string): Promise<boolean> {
    const grant = await this.childProtectionReadFacade.hasActiveCpAccess(tenantId, userId) ? { id: "active" } : null;

    return !!grant;
  }

  async checkIsYearHead(tenantId: string, membershipId: string): Promise<boolean> {
    const yearHeads = await this.rbacReadFacade.findMembershipsByRoleKey(tenantId, 'year_head');
    return yearHeads.some((mr) => mr.membership_id === membershipId);
  }

  resolveCallerTierAccess(permissions: string[], hasCpAccess: boolean): number {
    if (hasCpAccess) return 3;
    if (permissions.includes('pastoral.view_tier2')) return 2;
    if (permissions.includes('pastoral.view_tier1')) return 1;
    return 0;
  }
}
