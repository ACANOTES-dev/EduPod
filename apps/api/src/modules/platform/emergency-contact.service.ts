import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { UpdateEmergencyContactDto } from '@school/shared';

import {
  PlatformAuditService,
  type PlatformAuditContext,
} from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class EmergencyContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  async getMe(userId: string) {
    const platformUser = await this.findPlatformUser(userId);
    return this.prisma.platformAlertEmergencyContact.findUnique({
      where: { platform_user_id: platformUser.id },
    });
  }

  async updateMe(userId: string, dto: UpdateEmergencyContactDto, audit?: PlatformAuditContext) {
    const platformUser = await this.findPlatformUser(userId);
    const before = await this.prisma.platformAlertEmergencyContact.findUnique({
      where: { platform_user_id: platformUser.id },
    });
    const contact = await this.prisma.platformAlertEmergencyContact.upsert({
      where: { platform_user_id: platformUser.id },
      update: {
        email: dto.email ?? null,
        preferred_order: dto.preferred_order,
        push_subscription: toJson(dto.push_subscription) ?? Prisma.JsonNull,
        sms_phone: dto.sms_phone ?? null,
        telegram_chat_id: dto.telegram_chat_id ?? null,
        timezone: dto.timezone,
        whatsapp_phone: dto.whatsapp_phone ?? null,
      },
      create: {
        email: dto.email ?? null,
        platform_user_id: platformUser.id,
        preferred_order: dto.preferred_order,
        push_subscription: toJson(dto.push_subscription) ?? Prisma.JsonNull,
        sms_phone: dto.sms_phone ?? null,
        telegram_chat_id: dto.telegram_chat_id ?? null,
        timezone: dto.timezone,
        whatsapp_phone: dto.whatsapp_phone ?? null,
      },
    });
    if (!platformUser.emergency_contact_id) {
      await this.prisma.platformUser.update({
        where: { id: platformUser.id },
        data: { emergency_contact_id: contact.id },
      });
    }
    if (audit) {
      await this.audit.log({
        ...audit,
        action: 'alert_emergency_contact_updated',
        payload: { before, after: contact },
        target_resource_id: contact.id,
        target_resource_type: 'alert_emergency_contact',
      });
    }
    return contact;
  }

  private async findPlatformUser(
    userId: string,
  ): Promise<{ emergency_contact_id: string | null; id: string }> {
    const platformUser = await this.prisma.platformUser.findUnique({
      where: { user_id: userId },
      select: { emergency_contact_id: true, id: true },
    });
    if (!platformUser) {
      throw new NotFoundException({
        code: 'PLATFORM_USER_NOT_FOUND',
        message: 'Current user is not a platform operator.',
      });
    }
    return platformUser;
  }
}
