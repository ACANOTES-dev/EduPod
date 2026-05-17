import { Injectable } from '@nestjs/common';

const CITATION_PATTERN = /\[E:([A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+)\]/g;
const CLAIM_PATTERN =
  /\b(is|are|was|were|has|have|had|will|shows|indicates|started|failed|degraded|increased|decreased|affects|caused|matches|aligns|returned|captured|execute|reveal|tell|grant|delete)\b/i;
const NUMBER_PATTERN = /\b\d+(?:\.\d+)?\b/;
const REFUSAL_PATTERN = /I don't have evidence/i;

@Injectable()
export class CopilotResponsePostProcessor {
  process(
    rawOutput: string,
    allowedEvidenceIds: string[],
  ): { citations: string[]; stripped: string; stripped_claims_count: number } {
    const allowed = new Set(allowedEvidenceIds);
    const citations = new Set<string>();
    const kept: string[] = [];
    let strippedClaimsCount = 0;

    for (const paragraph of rawOutput.split(/\n{2,}/)) {
      const trimmed = paragraph.trim();
      if (!trimmed) continue;

      const paragraphCitations = extractCitations(trimmed).filter((id) => allowed.has(id));
      for (const id of paragraphCitations) citations.add(id);

      if (!looksLikeClaim(trimmed) || paragraphCitations.length > 0) {
        kept.push(removeDisallowedCitations(trimmed, allowed));
        continue;
      }

      strippedClaimsCount += 1;
    }

    const stripped = kept.join('\n\n').trim();
    return {
      citations: [...citations],
      stripped: stripped || "I don't have enough cited evidence to answer that.",
      stripped_claims_count: strippedClaimsCount,
    };
  }
}

function extractCitations(value: string): string[] {
  const matches: string[] = [];
  for (const match of value.matchAll(CITATION_PATTERN)) {
    const id = match[1];
    if (id) {
      matches.push(id);
    }
  }
  return matches;
}

function looksLikeClaim(value: string): boolean {
  if (REFUSAL_PATTERN.test(value)) return false;
  if (value.startsWith('#')) return false;
  return CLAIM_PATTERN.test(value) || NUMBER_PATTERN.test(value);
}

function removeDisallowedCitations(value: string, allowed: Set<string>): string {
  return value.replace(CITATION_PATTERN, (match, id: string | undefined) =>
    id && allowed.has(id) ? match : '',
  );
}
