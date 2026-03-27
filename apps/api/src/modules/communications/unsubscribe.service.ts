import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

import { PrismaService } from '../prisma/prisma.service';

interface UnsubscribeTokenPayload {
  notification_id: string;
  user_id: string;
}

/**
 * Generates signed unsubscribe URLs and processes unsubscribe requests.
 *
 * Flow:
 * 1. When a notification is dispatched, `generateUrl()` creates a signed JWT
 *    with the notification_id and user_id, valid for 90 days.
 * 2. The parent clicks the unsubscribe link in the email.
 * 3. `processUnsubscribe()` validates the JWT, looks up the notification's
 *    template_key, and upserts the TenantNotificationSetting to disable
 *    that notification type.
 */
@Injectable()
export class UnsubscribeService {
  private readonly logger = new Logger(UnsubscribeService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Generate a signed unsubscribe URL for a notification.
   *
   * @param notificationId - The notification record ID
   * @param userId         - The recipient user ID
   * @returns Full URL with signed JWT token
   */
  generateUrl(notificationId: string, userId: string): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    const appUrl = this.configService.get<string>('APP_URL');
    if (!appUrl) {
      throw new Error('APP_URL is not configured');
    }

    const payload: UnsubscribeTokenPayload = {
      notification_id: notificationId,
      user_id: userId,
    };

    const token = jwt.sign(payload, secret, {
      expiresIn: '90d',
      subject: 'notification-unsubscribe',
    });

    return `${appUrl}/api/v1/notifications/unsubscribe?token=${token}`;
  }

  /**
   * Validate an unsubscribe token and disable the notification type
   * for the notification's tenant.
   *
   * @param token - The signed JWT from the unsubscribe URL
   */
  async processUnsubscribe(token: string): Promise<void> {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    let decoded: UnsubscribeTokenPayload;
    try {
      decoded = jwt.verify(token, secret, {
        subject: 'notification-unsubscribe',
      }) as UnsubscribeTokenPayload;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid token';
      this.logger.warn(`Invalid unsubscribe token: ${message}`);
      throw new Error('Invalid or expired unsubscribe token');
    }

    const { notification_id, user_id } = decoded;

    // Look up the notification to find its template_key and tenant_id
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notification_id,
        recipient_user_id: user_id,
      },
      select: {
        id: true,
        tenant_id: true,
        template_key: true,
      },
    });

    if (!notification) {
      this.logger.warn(
        `Unsubscribe: notification ${notification_id} not found for user ${user_id}`,
      );
      throw new Error('Notification not found');
    }

    if (!notification.template_key) {
      this.logger.warn(
        `Unsubscribe: notification ${notification_id} has no template_key, cannot determine notification type`,
      );
      throw new Error('Cannot determine notification type for unsubscribe');
    }

    // Upsert the TenantNotificationSetting to disable this notification type
    await this.prisma.tenantNotificationSetting.upsert({
      where: {
        tenant_id_notification_type: {
          tenant_id: notification.tenant_id,
          notification_type: notification.template_key,
        },
      },
      create: {
        tenant_id: notification.tenant_id,
        notification_type: notification.template_key,
        is_enabled: false,
        channels: [],
      },
      update: {
        is_enabled: false,
      },
    });

    this.logger.log(
      `Unsubscribed: disabled notification type "${notification.template_key}" ` +
        `for tenant ${notification.tenant_id} (triggered by user ${user_id})`,
    );
  }
}
