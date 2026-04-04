import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { pastoralTenantSettingsSchema } from '@school/shared/pastoral';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { ConfigurationReadFacade } from '../../configuration/configuration-read.facade';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PrerequisiteStatus {
  monitoring_ownership_defined: boolean;
  monitoring_hours_defined: boolean;
  escalation_protocol_defined: boolean;
  prerequisites_acknowledged: boolean;
  all_met: boolean;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class CheckinPrerequisiteService {
  private readonly logger = new Logger(CheckinPrerequisiteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationReadFacade: ConfigurationReadFacade,
  ) {}

  // ─── GET PREREQUISITE STATUS ────────────────────────────────────────────────

  async getPrerequisiteStatus(tenantId: string): Promise<PrerequisiteStatus> {
    const settings = await this.loadCheckinSettings(tenantId);

    const monitoring_ownership_defined = settings.monitoring_owner_user_ids.length > 0;

    const monitoring_hours_defined =
      settings.monitoring_hours_start !== '' && settings.monitoring_hours_end !== '';

    // Escalation protocol is considered defined when monitoring owners are set
    // (monitoring owners + hours ARE the escalation protocol)
    const escalation_protocol_defined = monitoring_ownership_defined;

    const prerequisites_acknowledged = settings.prerequisites_acknowledged === true;

    const all_met =
      monitoring_ownership_defined &&
      monitoring_hours_defined &&
      escalation_protocol_defined &&
      prerequisites_acknowledged;

    return {
      monitoring_ownership_defined,
      monitoring_hours_defined,
      escalation_protocol_defined,
      prerequisites_acknowledged,
      all_met,
    };
  }

  // ─── VALIDATE PREREQUISITES ─────────────────────────────────────────────────

  async validatePrerequisites(tenantId: string): Promise<void> {
    const status = await this.getPrerequisiteStatus(tenantId);

    if (status.all_met) {
      return;
    }

    const unmet: string[] = [];

    if (!status.monitoring_ownership_defined) {
      unmet.push('Monitoring ownership: At least one monitoring owner must be assigned');
    }
    if (!status.monitoring_hours_defined) {
      unmet.push('Monitoring hours: Start and end monitoring hours must be defined');
    }
    if (!status.escalation_protocol_defined) {
      unmet.push(
        'Escalation protocol: Monitoring owners must be assigned to define the escalation protocol',
      );
    }
    if (!status.prerequisites_acknowledged) {
      unmet.push('Acknowledgement: Check-ins must be acknowledged as not an emergency service');
    }

    this.logger.warn(`Prerequisites not met for tenant ${tenantId}: ${unmet.join('; ')}`);

    throw new BadRequestException({
      code: 'CHECKIN_PREREQUISITES_NOT_MET',
      message: 'All safeguarding prerequisites must be met before enabling check-ins',
      details: {
        unmet_prerequisites: unmet,
        status,
      },
    });
  }

  // ─── VALIDATE MONITORING OWNERS ─────────────────────────────────────────────

  async validateMonitoringOwners(tenantId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) {
      return;
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      for (const userId of userIds) {
        const user = await db.user.findFirst({
          where: { id: userId },
        });

        if (!user) {
          throw new BadRequestException({
            code: 'INVALID_MONITORING_OWNER',
            message: `User "${userId}" does not exist`,
            details: { user_id: userId },
          });
        }
      }
    });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  private async loadCheckinSettings(tenantId: string) {
    const record = await this.configurationReadFacade.findSettings(tenantId);

    const settingsJson = (record?.settings as Record<string, unknown>) ?? {};
    const pastoralRaw = (settingsJson.pastoral as Record<string, unknown>) ?? {};
    const parsed = pastoralTenantSettingsSchema.parse(pastoralRaw);

    return parsed.checkins;
  }
}
