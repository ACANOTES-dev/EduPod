import type { MessageFlagSeverity } from '@school/shared/inbox';

/**
 * A single keyword match inside a scanned message body.
 *
 * `category` is typed as `string` — it mirrors the underlying `VARCHAR(64)`
 * database column. The enum shape `SafeguardingCategory` is a UI convention
 * enforced at the Zod input layer, not a DB invariant.
 */
export interface SafeguardingMatch {
  keyword: string;
  severity: MessageFlagSeverity;
  category: string;
  /** Zero-based character position of the match in the lowercased body. */
  position: number;
}

export interface SafeguardingScanInput {
  tenantId: string;
  body: string;
}

export interface SafeguardingScanResult {
  matches: SafeguardingMatch[];
  highest_severity: MessageFlagSeverity | null;
}

/**
 * v1 ships `KeywordSafeguardingScanner` (key `'keyword'`). A future v2 ML-based
 * scanner (key `'ml'`) can swap in behind the same interface without any
 * change in `SafeguardingScanMessageProcessor`.
 */
export interface SafeguardingScanner {
  readonly key: string;
  scan(input: SafeguardingScanInput): Promise<SafeguardingScanResult>;
}

/** Nest DI token used to inject the active scanner implementation. */
export const SAFEGUARDING_SCANNER = Symbol('SAFEGUARDING_SCANNER');
