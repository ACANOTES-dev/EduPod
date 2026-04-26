import { z } from 'zod';

import { partialDriversSchema } from './drivers';

/**
 * API DTO schemas for the alternative-scenarios endpoints.
 *
 * Scenarios are children of a financial model — created at most 3 per
 * model — and persist driver deltas (`driver_overrides`) only. The
 * engine merges the parent model's drivers with the scenario's
 * overrides on demand to produce a 4-up compare view (base + up to 3
 * alternatives).
 *
 * See modeling/PLAN.md §5.
 */

// ─── Position (0, 1, 2) ────────────────────────────────────────────────────

export const SCENARIO_MAX_POSITION = 2;
export const SCENARIO_MAX_COUNT = 3;

export const scenarioPositionSchema = z.number().int().min(0).max(SCENARIO_MAX_POSITION);

// ─── Create ────────────────────────────────────────────────────────────────

export const createScenarioSchema = z
  .object({
    name: z.string().min(1).max(64),
    position: scenarioPositionSchema.optional(),
    driver_overrides: partialDriversSchema,
    notes: z.string().max(2_000).optional(),
  })
  .strict();

export type CreateScenarioDto = z.infer<typeof createScenarioSchema>;

// ─── Update ────────────────────────────────────────────────────────────────

export const updateScenarioSchema = z
  .object({
    name: z.string().min(1).max(64).optional(),
    position: scenarioPositionSchema.optional(),
    driver_overrides: partialDriversSchema.optional(),
    notes: z.string().max(2_000).nullable().optional(),
  })
  .strict();

export type UpdateScenarioDto = z.infer<typeof updateScenarioSchema>;
