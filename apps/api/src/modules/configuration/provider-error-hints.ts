/**
 * Map well-known provider error codes / messages to a user-facing
 * troubleshooting hint. Unknown errors return null and the verify
 * endpoint surfaces just the verbatim provider message + status code.
 *
 * Why an in-process map rather than a config table:
 *   - The set is tiny (≤10 rules per channel) and changes only when
 *     the verify experience expands.
 *   - A DB table would buy us tenant overrides we do not want — every
 *     tenant gets the same hint copy.
 *   - If a provider deprecates a code or introduces a new one, that's
 *     a code edit + deploy, which is the correct change-management
 *     cadence.
 */

export type Channel = 'email' | 'sms' | 'whatsapp';

interface HintRule {
  /** Exact HTTP status (Resend) or Twilio numeric error code. */
  code?: number;
  /** Optional substring match against the provider's error message. */
  match?: RegExp;
  hint: string;
}

const RULES: Record<Channel, HintRule[]> = {
  email: [
    {
      code: 401,
      hint: 'API key is invalid. Double-check the key from your Resend dashboard.',
    },
    {
      code: 403,
      match: /(domain|verified|not verified|unverified|verification)/i,
      hint: 'The sender domain is not verified yet. Complete domain verification in the Email settings page first.',
    },
    {
      match: /invalid.*(from|sender|email)/i,
      hint: 'The "from" email address looks invalid. Use an address whose domain you have added and verified in Resend.',
    },
  ],
  sms: [
    {
      code: 21211,
      hint: 'Recipient phone number is not valid E.164 format. Use the +<countrycode><number> form.',
    },
    {
      code: 21408,
      hint: "Twilio account doesn't have permission to send to this region. Enable the destination country in your Twilio Geo Permissions.",
    },
    {
      code: 21610,
      hint: 'Recipient has unsubscribed from your Twilio number. They must reply START to opt back in.',
    },
    {
      code: 20003,
      hint: 'Twilio authentication failed. Verify the Account SID and Auth Token in your settings.',
    },
  ],
  whatsapp: [
    {
      code: 63016,
      hint: 'Free-form messages are only allowed inside the 24h service window. The verification path uses an approved template — make sure `comms.verify` is in `approved` state.',
    },
    {
      code: 63017,
      hint: 'The recipient WhatsApp number is not registered with WhatsApp. Confirm the number with the user.',
    },
    {
      code: 63015,
      hint: 'Twilio rejected the WhatsApp message. Check that your sender number is enabled for WhatsApp Business and the template is approved.',
    },
    {
      code: 21408,
      hint: "Twilio account doesn't have permission to send WhatsApp to this region.",
    },
  ],
};

export function getProviderErrorHint(
  channel: Channel,
  statusCode: number,
  message: string,
): string | null {
  for (const rule of RULES[channel]) {
    if (rule.code !== undefined && rule.code === statusCode) {
      if (!rule.match || rule.match.test(message)) {
        return rule.hint;
      }
    } else if (rule.match && rule.code === undefined && rule.match.test(message)) {
      return rule.hint;
    }
  }
  return null;
}
