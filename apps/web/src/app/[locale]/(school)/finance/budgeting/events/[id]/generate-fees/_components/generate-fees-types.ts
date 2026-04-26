/**
 * Wire shapes for the trip → fee generation flow.
 *
 * Mirrors `GenerateFeesPreviewResponse` and `GenerateFeesResponse` from
 * `packages/shared/src/budgeting/trip-fee-integration.ts` (the impl-10
 * preview and commit endpoints). The preview includes per-household
 * student lists; commit returns the run id + counters.
 */

import type {
  EventBudgetPaymentPlan,
  GenerateFeesPreviewResponse,
  GenerateFeesResponse,
  TripFeeMode,
} from '@school/shared/budgeting';

export type PreviewResult = GenerateFeesPreviewResponse;
export type CommitResult = GenerateFeesResponse;
export type { EventBudgetPaymentPlan, TripFeeMode };

/**
 * Specific error codes the impl-10 service emits. The page maps each
 * to a friendly title/body via the i18n catalog.
 */
export const KNOWN_ERROR_CODES = [
  'EVENT_NOT_CONFIRMED',
  'INSUFFICIENT_PERMISSIONS',
  'FEES_ALREADY_GENERATED',
  'EVENT_BUDGET_NOT_FOUND',
  'EVENT_CANCELLED',
  'HOUSEHOLD_SHARE_ZERO',
  'NO_PARTICIPANTS',
  'FEE_STRUCTURE_CREATION_FAILED',
  'INVOICE_CREATION_FAILED',
  'UNKNOWN_ERROR',
] as const;

export type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number];

export function isKnownErrorCode(code: string): code is KnownErrorCode {
  return (KNOWN_ERROR_CODES as readonly string[]).includes(code);
}

export const RECOVERABLE_ERROR_CODES: readonly KnownErrorCode[] = [
  'FEE_STRUCTURE_CREATION_FAILED',
  'INVOICE_CREATION_FAILED',
  'UNKNOWN_ERROR',
];
