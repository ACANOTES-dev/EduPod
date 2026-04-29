import { readFileSync } from 'fs';
import { resolve } from 'path';

import { LOCALE_REGISTRY } from '../../i18n/registry';
import { TIER_2_NAMESPACES } from '../../i18n/tier-scopes';

/**
 * Regression guard:
 * - Tier 1 active locales must mirror every English message key.
 * - Tier 2 active locales must mirror the parent/student allowlist subset.
 * - Placeholder values such as `[AR] ...` fail for every active locale.
 */

type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

function isPlainObject(value: Json): value is { [key: string]: Json } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function flattenKeys(value: Json, prefix = ''): string[] {
  if (!isPlainObject(value)) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    return flattenKeys(child, next);
  });
}

function flattenEntries(value: Json, prefix = ''): Array<[string, string]> {
  if (typeof value === 'string') {
    return [[prefix, value]];
  }

  if (!isPlainObject(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key;
    return flattenEntries(child, next);
  });
}

function loadMessages(locale: string): Json {
  const path = resolve(__dirname, '..', '..', 'messages', `${locale}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as Json;
}

function isInTier2Allowlist(dottedKey: string): boolean {
  return TIER_2_NAMESPACES.some((namespace) => {
    return dottedKey === namespace || dottedKey.startsWith(`${namespace}.`);
  });
}

const en = loadMessages('en');
const enKeys = new Set(flattenKeys(en));

describe('Translation parity — multi-locale', () => {
  const activeLocales = LOCALE_REGISTRY.filter((locale) => locale.active && locale.code !== 'en');

  for (const entry of activeLocales) {
    describe(`${entry.code} (${entry.englishName}, tier ${entry.tier})`, () => {
      const messages = loadMessages(entry.code);
      const keys = new Set(flattenKeys(messages));

      if (entry.tier === 1) {
        it('every English key has a translation', () => {
          const missing = [...enKeys].filter((key) => !keys.has(key)).sort();
          expect(missing).toEqual([]);
        });

        it('has no orphan keys', () => {
          const extra = [...keys].filter((key) => !enKeys.has(key)).sort();
          expect(extra).toEqual([]);
        });
      } else {
        const inScopeEnKeys = [...enKeys].filter(isInTier2Allowlist);

        it('every in-scope English key has a translation', () => {
          const missing = inScopeEnKeys.filter((key) => !keys.has(key)).sort();
          expect(missing).toEqual([]);
        });

        it('has no keys outside the Tier 2 allowlist', () => {
          const outOfScope = [...keys].filter((key) => !isInTier2Allowlist(key)).sort();
          expect(outOfScope).toEqual([]);
        });
      }

      it('has no placeholder values', () => {
        const placeholders = flattenEntries(messages)
          .filter(([, value]) => /^\[[A-Z]{2}\]/.test(value))
          .map(([key]) => key)
          .sort();
        expect(placeholders).toEqual([]);
      });
    });
  }
});
