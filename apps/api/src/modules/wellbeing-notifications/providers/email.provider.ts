import { Injectable, NotImplementedException } from '@nestjs/common';

import type { WellbeingChannelProvider, WellbeingDispatchInput } from './types';

/**
 * Email channel — stub.
 *
 * The full email provider (Resend) lives in the `communications` module and
 * is wired against the `notifications` queue. Wellbeing event delivery via
 * email is intentionally deferred to a follow-up rebuild pass — see
 * PLAN.md §8 (out of scope: email/SMS/WhatsApp delivery hardening).
 *
 * Throws `PROVIDER_NOT_WIRED` so `WellbeingNotificationsService.dispatch`
 * can record the gap without crashing the calling Wave 3 service.
 */
@Injectable()
export class WellbeingEmailProvider implements WellbeingChannelProvider {
  readonly key = 'email' as const;

  send(_input: WellbeingDispatchInput): Promise<void> {
    return Promise.reject(
      new NotImplementedException({
        code: 'PROVIDER_NOT_WIRED',
        message: 'Email provider for wellbeing channel is not yet wired',
      }),
    );
  }
}
