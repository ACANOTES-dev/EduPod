import { Injectable, NotFoundException } from '@nestjs/common';

import { createRlsClient, runWithRlsContext } from '../../common/middleware/rls.middleware';
import { SecurityAuditService } from '../audit-log/security-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { PlatformLegalService } from './platform-legal.service';

@Injectable()
export class DpaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformLegalService: PlatformLegalService,
    private readonly securityAuditService: SecurityAuditService,
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
    const acceptance = await runWithRlsContext(this.prisma, { tenant_id: tenantId }, async (tx) =>
      tx.dataProcessingAgreement.findFirst({
        where: {
          tenant_id: tenantId,
          dpa_version: version,
        },
        select: { id: true },
      }),
    );

    return Boolean(acceptance);
  }

  async getStatus(tenantId: string) {
    const currentVersion = await this.getCurrentVersion();

    const { currentAcceptance, history } = await runWithRlsContext(
      this.prisma,
      { tenant_id: tenantId },
      async (tx) => {
        const [acceptedRecord, historyRecords] = await Promise.all([
          tx.dataProcessingAgreement.findFirst({
            where: {
              tenant_id: tenantId,
              dpa_version: currentVersion.version,
            },
            orderBy: { accepted_at: 'desc' },
          }),
          tx.dataProcessingAgreement.findMany({
            where: { tenant_id: tenantId },
            orderBy: { accepted_at: 'desc' },
          }),
        ]);

        return {
          currentAcceptance: acceptedRecord,
          history: historyRecords,
        };
      },
    );

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
    let created = false;

    const acceptance = await rlsClient.$transaction(async (tx) => {
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

      created = true;

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

    if (created) {
      await this.securityAuditService.logDpaAcceptance(
        tenantId,
        userId,
        currentVersion.version,
        ipAddress ?? null,
      );
    }

    return acceptance;
  }
}
