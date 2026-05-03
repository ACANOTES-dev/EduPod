import {
  REGISTERED_LOCALE_CODES,
  getLocaleEntry,
  isActiveLocale,
  isRegisteredLocale,
  LOCALE_REGISTRY,
  ACTIVE_LOCALE_CODES,
} from '../../../i18n/registry';

describe('locale registry', () => {
  it('en and ar are active', () => {
    expect(isActiveLocale('en')).toBe(true);
    expect(isActiveLocale('ar')).toBe(true);
  });

  it('ga, fr, de, es, it, and ro are active while future Tier 2 expansion locales stay inactive', () => {
    expect(isRegisteredLocale('ga')).toBe(true);
    expect(isActiveLocale('ga')).toBe(true);
    expect(isRegisteredLocale('fr')).toBe(true);
    expect(isActiveLocale('fr')).toBe(true);
    expect(isRegisteredLocale('de')).toBe(true);
    expect(isActiveLocale('de')).toBe(true);
    expect(isRegisteredLocale('es')).toBe(true);
    expect(isActiveLocale('es')).toBe(true);

    expect(isRegisteredLocale('it')).toBe(true);
    expect(isActiveLocale('it')).toBe(true);

    expect(isRegisteredLocale('ro')).toBe(true);
    expect(isActiveLocale('ro')).toBe(true);

    expect(isRegisteredLocale('pl')).toBe(true);
    expect(isActiveLocale('pl')).toBe(false);
  });

  it('only ar is RTL', () => {
    const rtl = LOCALE_REGISTRY.filter((l) => l.direction === 'rtl').map((l) => l.code);
    expect(rtl).toEqual(['ar']);
  });

  it('every code is unique', () => {
    expect(new Set(REGISTERED_LOCALE_CODES).size).toBe(REGISTERED_LOCALE_CODES.length);
  });

  it('getLocaleEntry returns undefined for unknown code', () => {
    expect(getLocaleEntry('xx')).toBeUndefined();
  });

  it('Tier 2 locales are flagged tier 2', () => {
    for (const code of ['it', 'ro', 'pl']) {
      expect(getLocaleEntry(code)?.tier).toBe(2);
    }
  });

  it('ACTIVE_LOCALE_CODES contains shipped runtime locales', () => {
    expect(ACTIVE_LOCALE_CODES).toEqual(['en', 'ar', 'ga', 'fr', 'de', 'es', 'it', 'ro']);
    expect(ACTIVE_LOCALE_CODES).not.toContain('pl');
  });
});
