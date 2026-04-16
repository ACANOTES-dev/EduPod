/**
 * Translate a year-group name for display. The DB stores a single `name`
 * column which tenants seed in their preferred admin language (usually
 * English). On the Arabic locale, year-group labels need to render in
 * Arabic even when the seed row is English — bug RC-L010.
 *
 * We can't detect every possible label (tenants may use custom names),
 * so the strategy is:
 *   1. Normalize the English seed to a stable key (e.g. "1st class" →
 *      "grade_1").
 *   2. If a translation exists for that key in the active locale, use it.
 *   3. Otherwise, return the original string untouched — do not guess.
 *
 * The translation table lives in `messages/{locale}.json` under
 * `yearGroupLabels.{key}` so callers pass a `useTranslations('yearGroupLabels')`
 * function in.
 */

const NORMALIZERS: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /^(kindergarten|kg|k1|k2|kinder)$/i, key: 'kindergarten' },
  { pattern: /^(nursery|pre[-\s]?school|pre[-\s]?k|pre[-\s]?kg)$/i, key: 'nursery' },
  { pattern: /^reception$/i, key: 'reception' },
  { pattern: /^(1st|first|grade\s*1|year\s*1|1)\s*(class|grade|year)?$/i, key: 'grade_1' },
  { pattern: /^(2nd|second|grade\s*2|year\s*2|2)\s*(class|grade|year)?$/i, key: 'grade_2' },
  { pattern: /^(3rd|third|grade\s*3|year\s*3|3)\s*(class|grade|year)?$/i, key: 'grade_3' },
  { pattern: /^(4th|fourth|grade\s*4|year\s*4|4)\s*(class|grade|year)?$/i, key: 'grade_4' },
  { pattern: /^(5th|fifth|grade\s*5|year\s*5|5)\s*(class|grade|year)?$/i, key: 'grade_5' },
  { pattern: /^(6th|sixth|grade\s*6|year\s*6|6)\s*(class|grade|year)?$/i, key: 'grade_6' },
  { pattern: /^(7th|seventh|grade\s*7|year\s*7|7)\s*(class|grade|year)?$/i, key: 'grade_7' },
  { pattern: /^(8th|eighth|grade\s*8|year\s*8|8)\s*(class|grade|year)?$/i, key: 'grade_8' },
  { pattern: /^(9th|ninth|grade\s*9|year\s*9|9)\s*(class|grade|year)?$/i, key: 'grade_9' },
  { pattern: /^(10th|tenth|grade\s*10|year\s*10|10)\s*(class|grade|year)?$/i, key: 'grade_10' },
  { pattern: /^(11th|eleventh|grade\s*11|year\s*11|11)\s*(class|grade|year)?$/i, key: 'grade_11' },
  { pattern: /^(12th|twelfth|grade\s*12|year\s*12|12)\s*(class|grade|year)?$/i, key: 'grade_12' },
];

export function translateYearGroupName(
  name: string | null | undefined,
  t: (key: string, fallback: string) => string,
): string {
  if (!name) return '';
  const trimmed = name.trim();
  for (const { pattern, key } of NORMALIZERS) {
    if (pattern.test(trimmed)) {
      return t(key, trimmed);
    }
  }
  return trimmed;
}
