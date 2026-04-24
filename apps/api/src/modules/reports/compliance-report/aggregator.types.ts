import type { PrismaClient } from '@prisma/client';

import type { ComplianceFieldKey } from './compliance-fields';

/**
 * Shared context passed to every aggregator. `academicYear` is resolved
 * by the orchestrator so each aggregator gets the concrete date range
 * without having to re-fetch it.
 */
export interface AggregatorContext {
  tenantId: string;
  academicYear: {
    id: string;
    name: string;
    start_date: Date;
    end_date: Date;
  };
}

/**
 * The shape each aggregator must return. `value` is the displayable
 * metric (number for counts/percents/currency/hours/ratio, string for
 * labels). `has_gap = true` means the metric could not be sourced
 * reliably — callers render a yellow badge + `gap_reason` rather than a
 * fabricated number.
 */
export interface AggregatorResult {
  value: string | number | null;
  has_gap: boolean;
  gap_reason?: string;
  /** ISO timestamp of when the underlying data was last updated. */
  last_verified_at: string;
}

/**
 * An aggregator is a pure async function (easy to mock in tests). All
 * aggregators run inside the same RLS-scoped interactive transaction
 * created by the generation service — `tx` is the Prisma transaction
 * client, typed as `PrismaClient` per the documented RLS cast exception
 * in CLAUDE.md.
 */
export type Aggregator = (tx: PrismaClient, ctx: AggregatorContext) => Promise<AggregatorResult>;

/**
 * Registry mapping every `ComplianceFieldKey` to its aggregator. Record
 * type (not Map) so a new field key without an aggregator fails the
 * type-check rather than at runtime.
 */
export type AggregatorRegistry = Record<ComplianceFieldKey, Aggregator>;
