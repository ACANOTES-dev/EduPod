import {
  REGISTERED_LOCALES,
  householdLocaleUpdateSchema,
  localeCodeSchema,
  supportedLocalesSchema,
  updateSupportedLocalesSchema,
} from './locale-codes';

describe('locale-codes schemas', () => {
  it('localeCodeSchema accepts every registered locale', () => {
    for (const code of REGISTERED_LOCALES) {
      expect(localeCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('localeCodeSchema rejects unknown codes, regional variants, and empty string', () => {
    expect(localeCodeSchema.safeParse('xx').success).toBe(false);
    expect(localeCodeSchema.safeParse('en-US').success).toBe(false);
    expect(localeCodeSchema.safeParse('').success).toBe(false);
    expect(localeCodeSchema.safeParse('EN').success).toBe(false);
  });

  it('supportedLocalesSchema requires non-empty unique array', () => {
    expect(supportedLocalesSchema.safeParse(['en']).success).toBe(true);
    expect(supportedLocalesSchema.safeParse(['en', 'ar']).success).toBe(true);
    expect(supportedLocalesSchema.safeParse([]).success).toBe(false);
    expect(supportedLocalesSchema.safeParse(['en', 'en']).success).toBe(false);
  });

  it('supportedLocalesSchema rejects unknown locale inside the array', () => {
    expect(supportedLocalesSchema.safeParse(['en', 'xx']).success).toBe(false);
  });

  it('updateSupportedLocalesSchema accepts a supported_locales payload', () => {
    expect(
      updateSupportedLocalesSchema.safeParse({ supported_locales: ['en', 'ar'] }).success,
    ).toBe(true);
  });

  it('householdLocaleUpdateSchema accepts every documented partial shape', () => {
    expect(householdLocaleUpdateSchema.safeParse({}).success).toBe(true);
    expect(householdLocaleUpdateSchema.safeParse({ secondary_locale: 'fr' }).success).toBe(true);
    expect(householdLocaleUpdateSchema.safeParse({ secondary_locale: null }).success).toBe(true);
    expect(householdLocaleUpdateSchema.safeParse({ dual_language_opt_in: true }).success).toBe(
      true,
    );
    expect(
      householdLocaleUpdateSchema.safeParse({
        secondary_locale: 'fr',
        dual_language_opt_in: true,
      }).success,
    ).toBe(true);
  });

  it('householdLocaleUpdateSchema rejects unknown locales and undocumented fields', () => {
    expect(householdLocaleUpdateSchema.safeParse({ secondary_locale: 'xx' }).success).toBe(false);
    expect(
      householdLocaleUpdateSchema.safeParse({ secondary_locale: 'en', extra: 1 }).success,
    ).toBe(false);
  });
});
