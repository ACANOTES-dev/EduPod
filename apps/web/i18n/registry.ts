// Single source of truth for every locale the platform knows about.
// "active" locales are runtime-loadable (a message file exists);
// "registered" locales are metadata-only until the matching Phase 4/5
// session ships their message file.

export type LocaleTier = 1 | 2;

export type LocaleEntry = {
  /** ISO 639-1 (or composite) locale code used in URLs and database. */
  code: string;
  /** English-language name for admin surfaces. */
  englishName: string;
  /** Native-language name for end-user pickers. */
  nativeName: string;
  /** Text direction. Only 'ar' is RTL today. */
  direction: 'ltr' | 'rtl';
  /** Tier 1 = full app surface, Tier 2 = parent + student surface only. */
  tier: LocaleTier;
  /**
   * `true` once the locale has a complete message file shipped via a Phase
   * 4/5 implementation. The runtime config gates loading on this flag.
   */
  active: boolean;
};

export const LOCALE_REGISTRY: readonly LocaleEntry[] = [
  // Active baseline — shipped before this expansion.
  {
    code: 'en',
    englishName: 'English',
    nativeName: 'English',
    direction: 'ltr',
    tier: 1,
    active: true,
  },
  {
    code: 'ar',
    englishName: 'Arabic',
    nativeName: 'العربية',
    direction: 'rtl',
    tier: 1,
    active: true,
  },

  // Tier 1 — registered, not yet active. Each Phase 4 implementation flips
  // its entry to active: true in the same commit that ships the message file.
  {
    code: 'ga',
    englishName: 'Irish',
    nativeName: 'Gaeilge',
    direction: 'ltr',
    tier: 1,
    active: false,
  },
  {
    code: 'fr',
    englishName: 'French',
    nativeName: 'Français',
    direction: 'ltr',
    tier: 1,
    active: false,
  },
  {
    code: 'de',
    englishName: 'German',
    nativeName: 'Deutsch',
    direction: 'ltr',
    tier: 1,
    active: false,
  },
  {
    code: 'es',
    englishName: 'Spanish',
    nativeName: 'Español',
    direction: 'ltr',
    tier: 1,
    active: false,
  },

  // Tier 2 — parent + student surface only.
  {
    code: 'it',
    englishName: 'Italian',
    nativeName: 'Italiano',
    direction: 'ltr',
    tier: 2,
    active: false,
  },
  {
    code: 'ro',
    englishName: 'Romanian',
    nativeName: 'Română',
    direction: 'ltr',
    tier: 2,
    active: false,
  },
  {
    code: 'pl',
    englishName: 'Polish',
    nativeName: 'Polski',
    direction: 'ltr',
    tier: 2,
    active: false,
  },
] as const;

export const REGISTERED_LOCALE_CODES = LOCALE_REGISTRY.map((l) => l.code);
export const ACTIVE_LOCALE_CODES = LOCALE_REGISTRY.filter((l) => l.active).map((l) => l.code);

export function getLocaleEntry(code: string): LocaleEntry | undefined {
  return LOCALE_REGISTRY.find((l) => l.code === code);
}

export function isActiveLocale(code: string): boolean {
  return ACTIVE_LOCALE_CODES.includes(code as never);
}

export function isRegisteredLocale(code: string): boolean {
  return REGISTERED_LOCALE_CODES.includes(code as never);
}
