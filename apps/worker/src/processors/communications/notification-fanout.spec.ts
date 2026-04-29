import { fanoutNotification } from './notification-fanout';

describe('fanoutNotification', () => {
  const baseNotification = {
    channel: 'email',
    idempotency_key: 'evt-123',
    template_key: 'payment.received',
    variables: { amount: 'EUR 100', invoice_number: 'INV-001' },
  };

  const baseHousehold = {
    dual_language_opt_in: false,
    id: 'hh-1',
    primary_billing_parent_locale: 'en',
    secondary_locale: null as string | null,
    tenant_id: 't-1',
  };

  it('opt_in=false produces one default-language emit', () => {
    const out = fanoutNotification(baseNotification, baseHousehold, { defaultLocale: 'en' });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ idempotency_key: 'evt-123-en', locale: 'en' });
  });

  it('opt_in=true with secondary=null produces one default-language emit', () => {
    const out = fanoutNotification(
      baseNotification,
      { ...baseHousehold, dual_language_opt_in: true },
      { defaultLocale: 'en' },
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.locale).toBe('en');
  });

  it('opt_in=true with secondary different from default emits default first', () => {
    const out = fanoutNotification(
      baseNotification,
      { ...baseHousehold, dual_language_opt_in: true, secondary_locale: 'ar' },
      { defaultLocale: 'en' },
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ idempotency_key: 'evt-123-en', locale: 'en' });
    expect(out[1]).toMatchObject({ idempotency_key: 'evt-123-ar', locale: 'ar' });
  });

  it('opt_in=true with secondary matching default avoids duplicate emits', () => {
    const out = fanoutNotification(
      baseNotification,
      { ...baseHousehold, dual_language_opt_in: true, secondary_locale: 'en' },
      { defaultLocale: 'en' },
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.locale).toBe('en');
  });

  it('skips unsupported secondary locales', () => {
    const out = fanoutNotification(
      baseNotification,
      { ...baseHousehold, dual_language_opt_in: true, secondary_locale: 'fr' },
      { defaultLocale: 'en', supportedLocales: ['en', 'ar'] },
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.locale).toBe('en');
  });
});
