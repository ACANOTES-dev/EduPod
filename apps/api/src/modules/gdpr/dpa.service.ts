import { Injectable, NotFoundException } from '@nestjs/common';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { PlatformLegalService } from './platform-legal.service';

@Injectable()
export class DpaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformLegalService: PlatformLegalService,
  ) {}

  async getCurrentVersion() {
    await this.platformLegalService.ensureSeeded();

    const current = await this.prisma.dpaVersion.findFirst({
      where: { superseded_at: null },
      orderBy: [{ effective_date: 'desc' }, { created_at: 'desc' }],
    });

    if (!current) {
      throw new NotFoundException({
        error: {
          code: 'DPA_VERSION_NOT_FOUND',
          message: 'No active Data Processing Agreement version is available.',
        },
      });
    }

    return current;
  }

  async hasAccepted(tenantId: string, version: string) {
    const acceptance = await this.prisma.dataProcessingAgreement.findFirst({
      where: {
        tenant_id: tenantId,
        dpa_version: version,
      },
      select: { id: true },
    });

    return Boolean(acceptance);
  }

  async getStatus(tenantId: string) {
    const currentVersion = await this.getCurrentVersion();

    const [currentAcceptance, history] = await Promise.all([
      this.prisma.dataProcessingAgreement.findFirst({
        where: {
          tenant_id: tenantId,
          dpa_version: currentVersion.version,
        },
        orderBy: { accepted_at: 'desc' },
      }),
      this.prisma.dataProcessingAgreement.findMany({
        where: { tenant_id: tenantId },
        orderBy: { accepted_at: 'desc' },
      }),
    ]);

    return {
      current_version: currentVersion,
      accepted: Boolean(currentAcceptance),
      accepted_version: currentAcceptance?.dpa_version ?? null,
      accepted_at: currentAcceptance?.accepted_at ?? null,
      accepted_by_user_id: currentAcceptance?.accepted_by_user_id ?? null,
      history,
    };
  }

  async acceptCurrentVersion(tenantId: string, userId: string, ipAddress?: string) {
    const currentVersion = await this.getCurrentVersion();
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });

    return rlsClient.$transaction(async (tx) => {
      const existing = await tx.dataProcessingAgreement.findFirst({
        where: {
          tenant_id: tenantId,
          dpa_version: currentVersion.version,
        },
        orderBy: { accepted_at: 'desc' },
      });

      if (existing) {
        return existing;
      }

      return tx.dataProcessingAgreement.create({
        data: {
          tenant_id: tenantId,
          dpa_version: currentVersion.version,
          accepted_by_user_id: userId,
          dpa_content_hash: currentVersion.content_hash,
          ip_address: ipAddress ?? null,
        },
      });
    });
  }
}
