import { getProviderErrorHint } from './provider-error-hints';

describe('getProviderErrorHint', () => {
  it.each([
    ['email', 401, 'Invalid API key', /API key is invalid/],
    ['email', 403, 'Domain not verified', /domain is not verified/i],
    ['sms', 21211, '"To" number is not valid', /E\.164/],
    ['sms', 21408, 'Permission denied for region', /Geo Permissions/],
    ['sms', 21610, 'Recipient unsubscribed', /unsubscribed/],
    ['sms', 20003, 'Authentication error', /authentication failed/i],
    ['whatsapp', 63016, 'Outside service window', /24h service window/],
    ['whatsapp', 63017, 'Number not on WhatsApp', /not registered with WhatsApp/],
  ] as const)('maps (%s, %d) → hint matches %j', (channel, code, msg, expected) => {
    const hint = getProviderErrorHint(channel, code, msg);
    expect(hint).toMatch(expected);
  });

  it('matches on substring when code is omitted (email invalid sender)', () => {
    expect(getProviderErrorHint('email', 0, 'invalid from address')).toMatch(/from.*invalid/i);
  });

  it('returns null for unknown codes', () => {
    expect(getProviderErrorHint('email', 999, 'unknown')).toBeNull();
    expect(getProviderErrorHint('sms', 999, 'unknown')).toBeNull();
    expect(getProviderErrorHint('whatsapp', 999, 'unknown')).toBeNull();
  });
});
