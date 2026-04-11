import { Injectable } from '@nestjs/common';

import type { MessageFlagSeverity } from '@school/shared/inbox';

import { SafeguardingKeywordsRepository } from '../keywords/safeguarding-keywords.repository';

import type {
  SafeguardingMatch,
  SafeguardingScanInput,
  SafeguardingScanResult,
  SafeguardingScanner,
} from './safeguarding-scanner.interface';

/**
 * Escape regex metacharacters in user-supplied keywords. Keywords may contain
 * arbitrary text (e.g. `c++`, `a.b`, `(help)`) and must never be compiled as
 * regex literals without escaping.
 */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * KeywordSafeguardingScanner — v1 implementation.
 *
 * For each active keyword in the tenant's list, finds every word-boundary
 * match in the (lowercased) body and returns the union. `highest_severity`
 * is derived from the match set and is `null` when there are no matches.
 *
 * Limitations (v1, documented):
 *   - `\b` in JavaScript regex is ASCII-aware only. Arabic / non-Latin word
 *     boundaries are not detected reliably. v2 (ML-based) will handle this.
 *   - O(keywords × body length) per scan. Acceptable up to ~1k keywords per
 *     tenant on typical message lengths. Swap to Aho–Corasick if a tenant
 *     ever crosses 10k keywords.
 */
@Injectable()
export class KeywordSafeguardingScanner implements SafeguardingScanner {
  readonly key = 'keyword';

  constructor(private readonly keywordsRepo: SafeguardingKeywordsRepository) {}

  async scan(input: SafeguardingScanInput): Promise<SafeguardingScanResult> {
    const { tenantId, body } = input;

    if (!body || body.length === 0) {
      return { matches: [], highest_severity: null };
    }

    const keywords = await this.keywordsRepo.findActiveByTenant(tenantId);
    if (keywords.length === 0) {
      return { matches: [], highest_severity: null };
    }

    const lowered = body.toLowerCase();
    const matches: SafeguardingMatch[] = [];

    for (const kw of keywords) {
      const needle = kw.keyword.toLowerCase();
      if (needle.length === 0) continue;

      // Word boundaries only apply on sides that END in a word character.
      // For keywords like `c++`, the trailing `+` is not a word char so
      // `\b` never matches — drop the boundary on that side.
      const leadingBoundary = /^\w/.test(needle) ? '\\b' : '';
      const trailingBoundary = /\w$/.test(needle) ? '\\b' : '';
      const pattern = new RegExp(
        `${leadingBoundary}${escapeRegex(needle)}${trailingBoundary}`,
        'g',
      );
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(lowered)) !== null) {
        matches.push({
          keyword: kw.keyword,
          severity: kw.severity,
          category: kw.category,
          position: m.index,
        });
        // Guard against zero-width matches from pathological keyword shapes.
        if (m.index === pattern.lastIndex) pattern.lastIndex += 1;
      }
    }

    return { matches, highest_severity: computeHighestSeverity(matches) };
  }
}

function computeHighestSeverity(matches: SafeguardingMatch[]): MessageFlagSeverity | null {
  if (matches.length === 0) return null;
  if (matches.some((m) => m.severity === 'high')) return 'high';
  if (matches.some((m) => m.severity === 'medium')) return 'medium';
  return 'low';
}
