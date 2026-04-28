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

  it('all 7 expansion locales are registered but not active', () => {
    for (const code of ['ga', 'fr', 'de', 'es', 'it', 'ro', 'pl']) {
      expect(isRegisteredLocale(code)).toBe(true);
      expect(isActiveLocale(code)).toBe(false);
    }
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

  it('ACTIVE_LOCALE_CODES contains only en and ar', () => {
    expect(ACTIVE_LOCALE_CODES).toEqual(['en', 'ar']);
  });
});
