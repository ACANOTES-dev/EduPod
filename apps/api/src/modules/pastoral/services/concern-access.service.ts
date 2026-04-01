import { BadRequestException } from '@nestjs/common';

import { pastoralTenantSettingsSchema } from '@school/shared';

import { PrismaService } from '../../prisma/prisma.service';

import type { ValidatedCategory } from './concern.types';

export class ConcernAccessService {
  constructor(private readonly prisma: PrismaService) {}

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
    const record = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    const settingsJson = (record?.settings as Record<string, unknown>) ?? {};
    const pastoralRaw = (settingsJson.pastoral as Record<string, unknown>) ?? {};

    return pastoralTenantSettingsSchema.parse(pastoralRaw);
  }

  async checkCpAccess(tenantId: string, userId: string): Promise<boolean> {
    const grant = await this.prisma.cpAccessGrant.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        revoked_at: null,
      },
      select: { id: true },
    });

    return !!grant;
  }

  async checkIsYearHead(tenantId: string, membershipId: string): Promise<boolean> {
    const role = await this.prisma.membershipRole.findFirst({
      where: {
        membership_id: membershipId,
        tenant_id: tenantId,
        role: { role_key: 'year_head' },
      },
      select: { membership_id: true },
    });

    return !!role;
  }

  resolveCallerTierAccess(permissions: string[], hasCpAccess: boolean): number {
    if (hasCpAccess) return 3;
    if (permissions.includes('pastoral.view_tier2')) return 2;
    if (permissions.includes('pastoral.view_tier1')) return 1;
    return 0;
  }
}
