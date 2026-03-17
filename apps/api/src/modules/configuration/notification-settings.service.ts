import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NOTIFICATION_TYPES } from '@school/shared';
import type { UpdateNotificationSettingDto } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all notification settings for a tenant.
   */
  async listSettings(tenantId: string) {
    return this.prisma.tenantNotificationSetting.findMany({
      where: { tenant_id: tenantId },
      orderBy: { notification_type: 'asc' },
    });
  }

  /**
   * Update a specific notification setting by type.
   * Validates that the notification type is one of the known types.
   */
  async updateSetting(
    tenantId: string,
    type: string,
    data: UpdateNotificationSettingDto,
  ) {
    // Validate notification type
    if (
      !NOTIFICATION_TYPES.includes(
        type as (typeof NOTIFICATION_TYPES)[number],
      )
    ) {
      throw new BadRequestException({
        code: 'INVALID_NOTIFICATION_TYPE',
        message: `"${type}" is not a valid notification type. Valid types: ${NOTIFICATION_TYPES.join(', ')}`,
      });
    }

    // Find existing record
    const existing = await this.prisma.tenantNotificationSetting.findFirst({
      where: {
        tenant_id: tenantId,
        notification_type: type,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'NOTIFICATION_SETTING_NOT_FOUND',
        message: `Notification setting for type "${type}" not found. It may not have been initialised for this tenant.`,
      });
    }

    const updateData: Record<string, unknown> = {};
    if (data.is_enabled !== undefined) updateData.is_enabled = data.is_enabled;
    if (data.channels !== undefined) updateData.channels = data.channels;

    return this.prisma.tenantNotificationSetting.update({
      where: { id: existing.id },
      data: updateData,
    });
  }
}
