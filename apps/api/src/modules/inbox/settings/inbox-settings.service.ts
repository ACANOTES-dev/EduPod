import { Injectable, NotFoundException } from '@nestjs/common';

import { MESSAGING_ROLES } from '@school/shared/inbox';
import type { MessagingRole } from '@school/shared/inbox';

import { PrismaService } from '../../prisma/prisma.service';
import {
  TenantMessagingPolicyRepository,
  buildMatrixKey,
} from '../policy/tenant-messaging-policy.repository';

/**
 * Read-only face of the inbox settings surface for Wave 2. The mutation
 * endpoints land in Wave 4 (impl 13 — messaging policy settings page)
 * which reuses the same repository.
 */
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

  /**
   * Return the full 81-cell role-pair policy matrix for the tenant as a
   * nested dict keyed `matrix[sender][recipient] = allowed`. Missing
   * cells default to `false` (deny).
   */
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

  /**
   * Return the tenant inbox settings row. Throws `NOT_FOUND` if the
   * tenant has not been seeded yet — seeding is handled by
   * `seedInboxDefaultsForTenant` at tenant creation time, so this should
   * never happen in production.
   */
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
}
