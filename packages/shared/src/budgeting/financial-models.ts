import { z } from 'zod';

import { paginationQuerySchema } from '../schemas/pagination.schema';

import { driversSchema } from './drivers';
import { financialModelStatusSchema } from './snapshots';

/**
 * API DTO schemas for the financial-models endpoints.
 *
 * Phase 03 owns these schemas. The persisted shape lives in the Prisma
 * `FinancialModel` model from impl 01; these DTOs cover the inbound
 * action surface (create / update / list / archive / restore).
 *
 * `drivers` on create/update is optional — when omitted, the service
 * builds defaults via `buildDefaultDrivers` from `./drivers`. Provided
 * values are validated against the canonical `driversSchema`.
 */

// ─── Allowed horizons ──────────────────────────────────────────────────────

export const FINANCIAL_MODEL_HORIZONS = [1, 3, 5] as const;
export type FinancialModelHorizon = (typeof FINANCIAL_MODEL_HORIZONS)[number];

export const financialModelHorizonSchema = z.union([z.literal(1), z.literal(3), z.literal(5)]);

// ─── Create ────────────────────────────────────────────────────────────────

export const createFinancialModelSchema = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().max(2_000).optional(),
    /** ISO date — fiscal year start (inclusive). */
    fiscal_year_start: z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
      message: 'fiscal_year_start must be an ISO date string',
    }),
    horizon_years: financialModelHorizonSchema.default(1),
    drivers: driversSchema.optional(),
  })
  .strict();

export type CreateFinancialModelDto = z.infer<typeof createFinancialModelSchema>;

// ─── Update ────────────────────────────────────────────────────────────────

/**
 * Patch-style update. All fields optional; `description` is nullable to
 * support clearing the field. Supplying `drivers` triggers a full engine
 * re-run on the service side, which replaces only the
 * `source = 'driver_derived' AND is_locked = false AND scenario_id IS NULL`
 * rows — locked overrides + custom lines survive.
 */
export const updateFinancialModelSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().max(2_000).nullable().optional(),
    horizon_years: financialModelHorizonSchema.optional(),
    drivers: driversSchema.optional(),
  })
  .strict();

export type UpdateFinancialModelDto = z.infer<typeof updateFinancialModelSchema>;

// ─── List ──────────────────────────────────────────────────────────────────

export const listFinancialModelsQuerySchema = paginationQuerySchema.extend({
  status: financialModelStatusSchema.optional(),
  search: z.string().min(1).max(255).optional(),
});

export type ListFinancialModelsQueryDto = z.infer<typeof listFinancialModelsQuerySchema>;
