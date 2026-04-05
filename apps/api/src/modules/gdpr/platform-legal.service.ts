import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RbacReadFacade } from '../rbac/rbac-read.facade';
import { RedisService } from '../redis/redis.service';

import { PLATFORM_DPA_VERSIONS, PLATFORM_SUB_PROCESSOR_REGISTER_VERSIONS } from './legal-content';

@Injectable()
export class PlatformLegalService {
  private readonly logger = new Logger(PlatformLegalService.name);
  private seeded = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbacReadFacade: RbacReadFacade,
    private readonly redis: RedisService,
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

      const hadPreviousVersions = (await this.prisma.subProcessorRegisterVersion.count()) > 0;

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
        await this.notifyTenantAdmins(created.id, created.version, created.change_summary);
      }
    }
  }

  /**
   * Creates in_app notification records for tenant admins when the
   * sub-processor register is updated. Writes directly to the
   * notification table to avoid coupling GDPR to CommunicationsModule.
   */
  private async notifyTenantAdmins(registerVersionId: string, version: string, summary: string) {
    const memberships = await this.rbacReadFacade.findActiveMembershipsByRoleKeys([
      'school_owner',
      'school_principal',
      'school_vice_principal',
      'admin',
    ]);

    const byTenant = new Map<string, Array<{ user_id: string; preferred_locale: string }>>();
    for (const membership of memberships) {
      const items = byTenant.get(membership.tenant_id) ?? [];
      items.push({
        user_id: membership.user_id,
        preferred_locale: membership.user.preferred_locale ?? 'en',
      });
      byTenant.set(membership.tenant_id, items);
    }

    const client = this.redis.getClient();

    for (const [tenantId, recipients] of byTenant) {
      try {
        // Create in_app notification records directly — these are delivered
        // immediately and do not require external dispatch via the worker.
        const data = recipients.map((recipient) => ({
          tenant_id: tenantId,
          recipient_user_id: recipient.user_id,
          channel: 'in_app' as const,
          template_key: 'legal.sub_processor_updated',
          locale: recipient.preferred_locale,
          status: 'delivered' as const,
          payload_json: {
            title: 'Sub-processor register updated',
            body: `Version ${version} of the sub-processor register has been published. ${summary}`,
            version,
          } as Prisma.InputJsonValue,
          source_entity_type: 'sub_processor_register_version',
          source_entity_id: registerVersionId,
          delivered_at: new Date(),
        }));

        await this.prisma.$transaction(async (tx) => {
          await tx.notification.createMany({ data });
        });

        // Invalidate unread-count caches for all recipients
        const uniqueUserIds = [...new Set(recipients.map((r) => r.user_id))];
        await Promise.all(
          uniqueUserIds.map((userId) =>
            client.del(`tenant:${tenantId}:user:${userId}:unread_notifications`),
          ),
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
