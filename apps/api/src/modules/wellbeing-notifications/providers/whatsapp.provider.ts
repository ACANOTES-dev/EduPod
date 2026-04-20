import { Injectable, NotImplementedException } from '@nestjs/common';

import type { WellbeingChannelProvider, WellbeingDispatchInput } from './types';

/**
 * WhatsApp channel — stub. See `WellbeingEmailProvider` for the rationale.
 */
@Injectable()
export class WellbeingWhatsappProvider implements WellbeingChannelProvider {
  readonly key = 'whatsapp' as const;

  send(_input: WellbeingDispatchInput): Promise<void> {
    return Promise.reject(
      new NotImplementedException({
        code: 'PROVIDER_NOT_WIRED',
        message: 'WhatsApp provider for wellbeing channel is not yet wired',
      }),
    );
  }
}
