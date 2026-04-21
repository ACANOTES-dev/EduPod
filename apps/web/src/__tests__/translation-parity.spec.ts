import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Regression guard: every key present in en.json must also exist in ar.json,
 * and vice versa. Structural parity keeps RTL rendering honest and prevents
 * silent MISSING_MESSAGE warnings landing on production.
 *
 * The test flattens both trees to dot-paths (leaf keys only) and asserts
 * exact equality. If a diff appears, the failure message lists every key
 * that needs attention so the fix is mechanical.
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

function loadMessages(locale: 'en' | 'ar'): Json {
  const path = resolve(__dirname, '..', '..', 'messages', `${locale}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as Json;
}

describe('Translation parity — en.json vs ar.json', () => {
  const en = loadMessages('en');
  const ar = loadMessages('ar');

  const enKeys = new Set(flattenKeys(en));
  const arKeys = new Set(flattenKeys(ar));

  it('every English key is mirrored in Arabic', () => {
    const missing = [...enKeys].filter((k) => !arKeys.has(k)).sort();
    expect(missing).toEqual([]);
  });

  it('every Arabic key is mirrored in English', () => {
    const extra = [...arKeys].filter((k) => !enKeys.has(k)).sort();
    expect(extra).toEqual([]);
  });
});
