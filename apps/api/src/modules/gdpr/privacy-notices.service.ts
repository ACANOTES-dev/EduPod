import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import type { CreatePrivacyNoticeDto, UpdatePrivacyNoticeDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { NotificationsService } from '../communications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

import { buildPrivacyNoticeTemplate } from './legal-content';

@Injectable()
export class PrivacyNoticesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async listVersions(tenantId: string) {
    const versions = await this.prisma.privacyNoticeVersion.findMany({
      where: { tenant_id: tenantId },
      orderBy: [{ version_number: 'desc' }],
      include: {
        _count: {
          select: { acknowledgements: true },
        },
      },
    });

    return {
      data: versions.map((version) => ({
        ...version,
        acknowledgement_count: version._count.acknowledgements,
      })),
    };
  }

  async createVersion(tenantId: string, userId: string, dto: CreatePrivacyNoticeDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        branding: {
          select: {
            support_email: true,
          },
        },
      },
    });

    const supportEmail = tenant?.branding?.support_email ?? 'support@edupod.app';
    const nextVersionNumber =
      (await this.prisma.privacyNoticeVersion.aggregate({
        where: { tenant_id: tenantId },
        _max: { version_number: true },
      }))._max.version_number ?? 0;

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });

    return rlsClient.$transaction(async (tx) => {
      return tx.privacyNoticeVersion.create({
        data: {
          tenant_id: tenantId,
          version_number: nextVersionNumber + 1,
          effective_date: new Date(dto.effective_date),
          content_html:
            dto.content_html ??
            buildPrivacyNoticeTemplate({
              tenantName: tenant?.name ?? 'Your School',
              supportEmail,
              locale: 'en',
            }),
          content_html_ar:
            dto.content_html_ar ??
            buildPrivacyNoticeTemplate({
              tenantName: tenant?.name ?? 'مدرستكم',
              supportEmail,
              locale: 'ar',
            }),
          created_by_user_id: userId,
        },
      });
    });
  }

  async updateVersion(tenantId: string, versionId: string, dto: UpdatePrivacyNoticeDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const existing = await tx.privacyNoticeVersion.findFirst({
        where: { id: versionId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          error: {
            code: 'PRIVACY_NOTICE_NOT_FOUND',
            message: `Privacy notice version with id "${versionId}" not found.`,
          },
        });
      }

      if (existing.published_at) {
        throw new BadRequestException({
          error: {
            code: 'PRIVACY_NOTICE_ALREADY_PUBLISHED',
            message: 'Published privacy notice versions cannot be edited.',
          },
        });
      }

      return tx.privacyNoticeVersion.update({
        where: { id: versionId },
        data: {
          effective_date: dto.effective_date ? new Date(dto.effective_date) : undefined,
          content_html: dto.content_html,
          content_html_ar: dto.content_html_ar,
        },
      });
    });
  }

  async publishVersion(tenantId: string, versionId: string) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const published = (await rlsClient.$transaction(async (tx) => {
      const version = await tx.privacyNoticeVersion.findFirst({
        where: { id: versionId, tenant_id: tenantId },
      });

      if (!version) {
        throw new NotFoundException({
          error: {
            code: 'PRIVACY_NOTICE_NOT_FOUND',
            message: `Privacy notice version with id "${versionId}" not found.`,
          },
        });
      }

      if (version.published_at) {
        return version;
      }

      return tx.privacyNoticeVersion.update({
        where: { id: versionId },
        data: { published_at: new Date() },
      });
    })) as { version_number: number } & Record<string, unknown>;

    await this.notifyAllUsers(tenantId, published.version_number);
    return published;
  }

  async getCurrentForUser(tenantId: string, userId: string) {
    const current = await this.prisma.privacyNoticeVersion.findFirst({
      where: {
        tenant_id: tenantId,
        published_at: { not: null },
      },
      orderBy: [{ effective_date: 'desc' }, { version_number: 'desc' }],
    });

    if (!current) {
      return {
        current_version: null,
        acknowledged: true,
        acknowledged_at: null,
        requires_acknowledgement: false,
      };
    }

    const acknowledgement = await this.prisma.privacyNoticeAcknowledgement.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        privacy_notice_version_id: current.id,
      },
      orderBy: { acknowledged_at: 'desc' },
    });

    return {
      current_version: {
        ...current,
        user_has_acknowledged: Boolean(acknowledgement),
      },
      acknowledged: Boolean(acknowledgement),
      acknowledged_at: acknowledgement?.acknowledged_at ?? null,
      requires_acknowledgement: !acknowledgement,
    };
  }

  async acknowledgeCurrentVersion(tenantId: string, userId: string, ipAddress?: string) {
    const current = await this.prisma.privacyNoticeVersion.findFirst({
      where: {
        tenant_id: tenantId,
        published_at: { not: null },
      },
      orderBy: [{ effective_date: 'desc' }, { version_number: 'desc' }],
    });

    if (!current) {
      throw new NotFoundException({
        error: {
          code: 'PRIVACY_NOTICE_NOT_FOUND',
          message: 'No published privacy notice is available.',
        },
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });

    return rlsClient.$transaction(async (tx) => {
      const existing = await tx.privacyNoticeAcknowledgement.findFirst({
        where: {
          tenant_id: tenantId,
          user_id: userId,
          privacy_notice_version_id: current.id,
        },
      });

      if (existing) {
        return existing;
      }

      return tx.privacyNoticeAcknowledgement.create({
        data: {
          tenant_id: tenantId,
          user_id: userId,
          privacy_notice_version_id: current.id,
          ip_address: ipAddress ?? null,
        },
      });
    });
  }

  async getParentPortalCurrent(tenantId: string, userId: string) {
    const parentMembership = await this.prisma.tenantMembership.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        membership_status: 'active',
      },
      select: { id: true },
    });

    if (!parentMembership) {
      throw new NotFoundException({
        error: {
          code: 'PARENT_MEMBERSHIP_NOT_FOUND',
          message: 'No active parent portal membership was found.',
        },
      });
    }

    return this.getCurrentForUser(tenantId, userId);
  }

  private async notifyAllUsers(tenantId: string, versionNumber: number) {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: {
        tenant_id: tenantId,
        membership_status: 'active',
      },
      select: {
        user_id: true,
        user: {
          select: {
            preferred_locale: true,
          },
        },
      },
    });

    if (memberships.length === 0) {
      return;
    }

    await this.notifications.createBatch(
      tenantId,
      memberships.map((membership) => ({
        tenant_id: tenantId,
        recipient_user_id: membership.user_id,
        channel: 'in_app',
        template_key: 'legal.privacy_notice_published',
        locale: membership.user.preferred_locale ?? 'en',
        payload_json: {
          title: 'Privacy notice updated',
          body: `Version ${versionNumber} of your school privacy notice has been published and may require acknowledgement.`,
          version_number: versionNumber,
        },
        source_entity_type: 'privacy_notice_version',
      })),
    );
  }
}
