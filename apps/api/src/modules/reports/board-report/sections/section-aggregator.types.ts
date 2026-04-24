/**
 * Shared types for the per-section Board Report aggregators (impl 06).
 *
 * Each aggregator implements `aggregate(tx, tenantId, term, options)` and
 * returns a typed section result; `BoardReportService.generate` dispatches
 * to them inside ONE `createRlsClient(...).$transaction` so the whole
 * packet renders in one DB round-trip sequence.
 */
import type { PrismaClient } from '@prisma/client';

import type {
  AcademicSection,
  AttendanceSection,
  BehaviourSection,
  BoardReportSection,
  EnrolmentSection,
  ExecutiveSummarySection,
  FinanceSection,
  SafeguardingSection,
  StaffingSection,
} from '@school/shared/reports';

export type PrismaTransaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'
>;

/**
 * Resolved term context — `term_number` is the 1-indexed position of the
 * requested `AcademicPeriod` within the academic year (ordered by
 * `start_date`). The service resolves this before calling aggregators so
 * each aggregator receives real UUIDs instead of repeating the lookup.
 */
export interface ResolvedTerm {
  academic_year_id: string;
  academic_year_name: string;
  /** 1..4 */
  term_number: number;
  term_label: string;
  /** The AcademicPeriod.id that matches `term_number`, when one exists. */
  academic_period_id: string | null;
  term_start: Date;
  term_end: Date;
  /** The prior term in the same academic year, if any — for trend deltas. */
  prior_term: {
    academic_period_id: string;
    term_start: Date;
    term_end: Date;
  } | null;
}

export interface SectionAggregatorOptions {
  /** When true (the default), any row-level identifier collapses to initials / a bucket. */
  anonymise: boolean;
}

/**
 * Common interface for every section aggregator. The generic pins a
 * specific section type so the service assembler can type-check the map.
 */
export interface SectionAggregator<S extends BoardReportSection> {
  readonly key: S['type'];
  aggregate(
    tx: PrismaTransaction,
    tenantId: string,
    term: ResolvedTerm,
    options: SectionAggregatorOptions,
  ): Promise<S>;
}

export type ExecutiveSummaryAggregator = SectionAggregator<ExecutiveSummarySection>;
export type EnrolmentAggregator = SectionAggregator<EnrolmentSection>;
export type AttendanceAggregator = SectionAggregator<AttendanceSection>;
export type AcademicAggregator = SectionAggregator<AcademicSection>;
export type BehaviourAggregator = SectionAggregator<BehaviourSection>;
export type SafeguardingAggregator = SectionAggregator<SafeguardingSection>;
export type FinanceAggregator = SectionAggregator<FinanceSection>;
export type StaffingAggregator = SectionAggregator<StaffingSection>;

// ─── Anonymisation helpers ────────────────────────────────────────────────

/**
 * Build a display label for a named individual depending on `anonymise`.
 * Always safe — unknown or empty names collapse to "—".
 */
export function displayName(
  first: string | null | undefined,
  last: string | null | undefined,
  anonymise: boolean,
): string {
  const f = (first ?? '').trim();
  const l = (last ?? '').trim();
  if (!f && !l) return '—';
  if (!anonymise) {
    return [f, l].filter(Boolean).join(' ');
  }
  const fi = f.charAt(0).toUpperCase();
  const li = l.charAt(0).toUpperCase();
  if (!fi && !li) return '—';
  return [fi && `${fi}.`, li && `${li}.`].filter(Boolean).join('');
}

/** Coerce a Prisma Decimal or number to a plain number, defaulting to 0. */
export function toNumber(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  // Prisma Decimal: has a `toString()` that returns the decimal representation.
  if (typeof v === 'object' && v !== null && 'toString' in v) {
    const n = Number((v as { toString: () => string }).toString());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Round a number to at most `decimals` digits; always returns a finite number. */
export function round(n: number, decimals = 2): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
