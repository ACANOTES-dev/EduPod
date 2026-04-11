import { Injectable, NotFoundException } from '@nestjs/common';

import { MESSAGING_ROLES } from '@school/shared/inbox';
import type {
  MessagingRole,
  UpdateInboxSettingsDto,
  UpdateMessagingPolicyDto,
} from '@school/shared/inbox';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TenantMessagingPolicyRepository,
  buildMatrixKey,
} from '../policy/tenant-messaging-policy.repository';

export type PolicyMatrixDict = Record<MessagingRole, Record<MessagingRole, boolean>>;

export interface TenantInboxSettingsRow {
  id: string;
  tenant_id: string;
  messaging_enabled: boolean;
  students_can_initiate: boolean;
  parents_can_initiate: boolean;
  parent_to_parent_messaging: boolean;
  student_to_student_messaging: boolean;
  student_to_parent_messaging: boolean;
  require_admin_approval_for_parent_to_teacher: boolean;
  edit_window_minutes: number;
  retention_days: number | null;
  fallback_admin_enabled: boolean;
  fallback_admin_after_hours: number;
  fallback_admin_channels: string[];
  fallback_teacher_enabled: boolean;
  fallback_teacher_after_hours: number;
  fallback_teacher_channels: string[];
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class InboxSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyRepository: TenantMessagingPolicyRepository,
  ) {}

  async getPolicyMatrix(tenantId: string): Promise<PolicyMatrixDict> {
    const flatMatrix = await this.policyRepository.getMatrix(tenantId);
    const dict = {} as PolicyMatrixDict;
    for (const sender of MESSAGING_ROLES) {
      dict[sender] = {} as Record<MessagingRole, boolean>;
      for (const recipient of MESSAGING_ROLES) {
        dict[sender][recipient] = flatMatrix.get(buildMatrixKey(sender, recipient)) === true;
      }
    }
    return dict;
  }

  async getInboxSettings(tenantId: string): Promise<TenantInboxSettingsRow> {
    const row = await this.prisma.tenantSettingsInbox.findUnique({
      where: { tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        code: 'INBOX_SETTINGS_NOT_FOUND',
        message: `No tenant_settings_inbox row for tenant "${tenantId}"`,
      });
    }
    return row;
  }

  async updateInboxSettings(
    tenantId: string,
    dto: UpdateInboxSettingsDto,
  ): Promise<TenantInboxSettingsRow> {
    await this.getInboxSettings(tenantId);
    const updated = await createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;
        return db.tenantSettingsInbox.update({
          where: { tenant_id: tenantId },
          data: dto,
        });
      },
    );
    return updated;
  }

  async updatePolicyMatrix(
    tenantId: string,
    dto: UpdateMessagingPolicyDto,
  ): Promise<PolicyMatrixDict> {
    await createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      for (const cell of dto.cells) {
        await db.tenantMessagingPolicy.upsert({
          where: {
            uniq_messaging_policy_pair: {
              tenant_id: tenantId,
              sender_role: cell.sender_role,
              recipient_role: cell.recipient_role,
            },
          },
          update: { allowed: cell.allowed },
          create: {
            tenant_id: tenantId,
            sender_role: cell.sender_role,
            recipient_role: cell.recipient_role,
            allowed: cell.allowed,
          },
        });
      }
    });
    this.policyRepository.invalidate(tenantId);
    return this.getPolicyMatrix(tenantId);
  }

  async resetPolicyMatrix(tenantId: string): Promise<PolicyMatrixDict> {
    await this.policyRepository.resetToDefaults(tenantId);
    return this.getPolicyMatrix(tenantId);
  }
}
