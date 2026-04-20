import { Injectable, NotImplementedException } from '@nestjs/common';

import type { WellbeingChannelProvider, WellbeingDispatchInput } from './types';

/**
 * SMS channel — stub. See `WellbeingEmailProvider` for the rationale.
 */
@Injectable()
export class WellbeingSmsProvider implements WellbeingChannelProvider {
  readonly key = 'sms' as const;

  send(_input: WellbeingDispatchInput): Promise<void> {
    return Promise.reject(
      new NotImplementedException({
        code: 'PROVIDER_NOT_WIRED',
        message: 'SMS provider for wellbeing channel is not yet wired',
      }),
    );
  }
}
