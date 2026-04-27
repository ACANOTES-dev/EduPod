import { Injectable, Logger } from '@nestjs/common';
import type { TenantEmailDomain } from '@prisma/client';

import { NotificationsService } from '../notifications.service';

import type { EmailDomainNotifier } from './email-domain-notifier.token';

/**
 * Adapter that bridges `EmailDomainService` (which only knows the notifier
 * interface) to the real `NotificationsService`. Lives in the communications
 * module so the token-based injection pattern can break the otherwise-circular
 * import path:
 *
 *   email-domain.service.ts -> notifications.service.ts -> ...
 *   ... -> resend-email.provider.ts -> email-domain.service.ts
 */
@Injectable()
export class EmailDomainNotifierAdapter implements EmailDomainNotifier {
  private readonly logger = new Logger(EmailDomainNotifierAdapter.name);

  constructor(private readonly notifications: NotificationsService) {}

  async notifyVerified(tenantId: string, row: TenantEmailDomain): Promise<void> {
    if (!row.created_by_user_id) return;
    try {
      await this.notifications.createBatch(tenantId, [
        {
          tenant_id: tenantId,
          recipient_user_id: row.created_by_user_id,
          channel: 'in_app',
          template_key: 'email_domain.verified',
          locale: 'en',
          payload_json: {
            domain: row.domain,
            verified_at: row.verified_at?.toISOString() ?? '',
          },
        },
      ]);
    } catch (err) {
      const e = err as Error;
      this.logger.error(`[notifyVerified] tenant=${tenantId} domain=${row.domain}: ${e.message}`);
      // Do NOT rethrow — domain verification is the primary effect; the
      // in-app nudge is best-effort.
    }
  }
}
