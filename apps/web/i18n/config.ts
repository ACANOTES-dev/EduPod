// Active locales are derived from the registry. Adding a locale to the active
// list happens in two places at once: flip `active: true` in registry.ts AND
// ship the matching messages/{locale}.json file. Both must land in the same
// commit so this array never references a missing file at runtime.

import { ACTIVE_LOCALE_CODES, type LocaleEntry } from './registry';

export const locales = ACTIVE_LOCALE_CODES as readonly string[];
export type Locale = (typeof ACTIVE_LOCALE_CODES)[number];
export const defaultLocale: Locale = 'en';

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export type { LocaleEntry };
