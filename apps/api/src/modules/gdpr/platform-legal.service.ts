import { Injectable, Logger } from '@nestjs/common';

import { NotificationsService } from '../communications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

import {
  PLATFORM_DPA_VERSIONS,
  PLATFORM_SUB_PROCESSOR_REGISTER_VERSIONS,
} from './legal-content';

@Injectable()
export class PlatformLegalService {
  private readonly logger = new Logger(PlatformLegalService.name);
  private seeded = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async ensureSeeded() {
    if (this.seeded) {
      return;
    }

    await this.seedDpaVersions();
    await this.seedSubProcessorRegister();
    this.seeded = true;
  }

  private async seedDpaVersions() {
    for (const version of PLATFORM_DPA_VERSIONS) {
      await this.prisma.dpaVersion.upsert({
        where: { version: version.version },
        update: {
          content_html: version.content_html,
          content_hash: version.content_hash,
          effective_date: version.effective_date,
        },
        create: {
          version: version.version,
          content_html: version.content_html,
          content_hash: version.content_hash,
          effective_date: version.effective_date,
        },
      });
    }
  }

  private async seedSubProcessorRegister() {
    for (const version of PLATFORM_SUB_PROCESSOR_REGISTER_VERSIONS) {
      const existing = await this.prisma.subProcessorRegisterVersion.findUnique({
        where: { version: version.version },
        select: { id: true },
      });

      if (existing) {
        continue;
      }

      const hadPreviousVersions =
        (await this.prisma.subProcessorRegisterVersion.count()) > 0;

      const created = await this.prisma.subProcessorRegisterVersion.create({
        data: {
          version: version.version,
          change_summary: version.change_summary,
          published_at: version.published_at,
          objection_deadline: version.objection_deadline ?? null,
          entries: {
            create: version.entries.map((entry) => ({
              name: entry.name,
              purpose: entry.purpose,
              data_categories: entry.data_categories,
              location: entry.location,
              transfer_mechanism: entry.transfer_mechanism,
              display_order: entry.display_order,
              is_planned: entry.is_planned ?? false,
              notes: entry.notes ?? null,
            })),
          },
        },
        include: { entries: true },
      });

      if (hadPreviousVersions) {
        await this.notifyTenantAdmins(created.version, created.change_summary);
      }
    }
  }

  private async notifyTenantAdmins(version: string, summary: string) {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: {
        membership_status: 'active',
        membership_roles: {
          some: {
            role: {
              role_key: {
                in: ['school_owner', 'school_principal', 'school_vice_principal', 'admin'],
              },
            },
          },
        },
      },
      select: {
        tenant_id: true,
        user_id: true,
        user: {
          select: {
            preferred_locale: true,
          },
        },
      },
    });

    const byTenant = new Map<string, Array<{ user_id: string; preferred_locale: string }>>();
    for (const membership of memberships) {
      const items = byTenant.get(membership.tenant_id) ?? [];
      items.push({
        user_id: membership.user_id,
        preferred_locale: membership.user.preferred_locale ?? 'en',
      });
      byTenant.set(membership.tenant_id, items);
    }

    for (const [tenantId, recipients] of byTenant) {
      try {
        await this.notifications.createBatch(
          tenantId,
          recipients.map((recipient) => ({
            tenant_id: tenantId,
            recipient_user_id: recipient.user_id,
            channel: 'in_app',
            template_key: 'legal.sub_processor_updated',
            locale: recipient.preferred_locale,
            payload_json: {
              title: 'Sub-processor register updated',
              body: `Version ${version} of the sub-processor register has been published. ${summary}`,
              version,
            },
            source_entity_type: 'sub_processor_register_version',
            source_entity_id: version,
          })),
        );
      } catch (error) {
        this.logger.error(
          `Failed to notify tenant admins about sub-processor version ${version}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }
}
