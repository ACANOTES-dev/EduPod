import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import {
  createAlertEscalationPolicySchema,
  type CreateAlertEscalationPolicyDto,
  type UpdateAlertEscalationPolicyDto,
} from '@school/shared';

import {
  PlatformAuditService,
  type PlatformAuditContext,
} from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class AlertEscalationPoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async list() {
    return this.prisma.platformAlertEscalationPolicy.findMany({
      orderBy: [{ enabled: 'desc' }, { applies_to_severity: 'asc' }, { display_name: 'asc' }],
    });
  }

  async create(
    dto: CreateAlertEscalationPolicyDto,
    actorUserId: string,
    audit?: PlatformAuditContext,
  ) {
    const parsed = createAlertEscalationPolicySchema.parse(dto);
    await this.assertRoutesExist(parsed.steps.map((step) => step.route_id));
    const created = await this.prisma.platformAlertEscalationPolicy.create({
      data: {
        applies_to_alert_keys: parsed.applies_to_alert_keys,
        applies_to_severity: parsed.applies_to_severity,
        created_by_user_id: actorUserId,
        display_name: parsed.display_name,
        enabled: parsed.enabled,
        steps: toJson(parsed.steps),
      },
    });
    if (audit) {
      await this.audit.log({
        ...audit,
        action: 'alert_escalation_policy_created',
        payload: { after: created },
        target_resource_id: created.id,
        target_resource_type: 'alert_escalation_policy',
      });
    }
    return created;
  }

  async update(id: string, dto: UpdateAlertEscalationPolicyDto, audit?: PlatformAuditContext) {
    const existing = await this.prisma.platformAlertEscalationPolicy.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        code: 'ALERT_ESCALATION_POLICY_NOT_FOUND',
        message: `Alert escalation policy "${id}" not found`,
      });
    }
    const merged = {
      applies_to_alert_keys: existing.applies_to_alert_keys,
      applies_to_severity: existing.applies_to_severity as 'critical' | 'warning',
      display_name: existing.display_name,
      enabled: existing.enabled,
      steps: existing.steps,
      ...dto,
    };
    const parsed = createAlertEscalationPolicySchema.parse(merged);
    if (dto.steps) {
      await this.assertRoutesExist(parsed.steps.map((step) => step.route_id));
    }
    const updated = await this.prisma.platformAlertEscalationPolicy.update({
      where: { id },
      data: {
        applies_to_alert_keys: parsed.applies_to_alert_keys,
        applies_to_severity: parsed.applies_to_severity,
        display_name: parsed.display_name,
        enabled: parsed.enabled,
        steps: toJson(parsed.steps),
      },
    });
    if (audit) {
      await this.audit.log({
        ...audit,
        action: 'alert_escalation_policy_updated',
        payload: { before: existing, after: updated },
        target_resource_id: id,
        target_resource_type: 'alert_escalation_policy',
      });
    }
    return updated;
  }

  async remove(id: string, audit?: PlatformAuditContext): Promise<void> {
    const existing = await this.prisma.platformAlertEscalationPolicy.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException({
        code: 'ALERT_ESCALATION_POLICY_NOT_FOUND',
        message: `Alert escalation policy "${id}" not found`,
      });
    }
    await this.prisma.platformAlertEscalationPolicy.delete({ where: { id } });
    if (audit) {
      await this.audit.log({
        ...audit,
        action: 'alert_escalation_policy_deleted',
        payload: { before: existing },
        target_resource_id: id,
        target_resource_type: 'alert_escalation_policy',
      });
    }
  }

  private async assertRoutesExist(routeIds: string[]): Promise<void> {
    const uniqueRouteIds = [...new Set(routeIds)];
    const count = await this.prisma.platformAlertRoute.count({
      where: { id: { in: uniqueRouteIds } },
    });
    if (count !== uniqueRouteIds.length) {
      throw new BadRequestException({
        code: 'ALERT_ESCALATION_ROUTE_NOT_FOUND',
        message: 'Every escalation step must reference an existing alert route.',
      });
    }
  }
}
