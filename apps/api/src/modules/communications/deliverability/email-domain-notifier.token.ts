import type { TenantEmailDomain } from '@prisma/client';

/**
 * DI token for the in-app notifier consumed by `EmailDomainService.refreshOne`.
 * Decoupled to break a circular import between
 * `EmailDomainService` and `NotificationsService`. The adapter (in this
 * folder) holds the real `NotificationsService` and dispatches an in-app
 * notification on the `pending → verified` transition.
 */
export const EMAIL_DOMAIN_NOTIFIER = Symbol('EMAIL_DOMAIN_NOTIFIER');

export interface EmailDomainNotifier {
  notifyVerified(tenantId: string, row: TenantEmailDomain): Promise<void>;
}
