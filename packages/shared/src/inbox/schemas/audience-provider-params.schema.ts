import { z } from 'zod';

/**
 * Per-provider parameter schemas for the audience engine.
 *
 * The audience composer uses these to validate every leaf node in an
 * `AudienceDefinition` tree before it reaches a provider. The provider
 * registry also exposes these to the frontend chip builder (via
 * `GET /v1/inbox/audiences/providers`) so the UI can render the correct
 * input controls for each provider.
 *
 * Every schema rejects unknown keys with `.strict()` — an audience that
 * carries extra params is either stale or a bug, and we want it to fail
 * loudly at the API boundary rather than silently on resolution.
 */

// ─── Empty-param providers ────────────────────────────────────────────────────

export const emptyParamsSchema = z.object({}).strict();

// ─── Staff / department ───────────────────────────────────────────────────────

export const staffRoleParamsSchema = z
  .object({
    roles: z.array(z.string().min(1)).min(1).max(50),
  })
  .strict();

export const departmentParamsSchema = z
  .object({
    departments: z.array(z.string().min(1)).min(1).max(50),
  })
  .strict();

// ─── Year group / class / section ─────────────────────────────────────────────

export const yearGroupParamsSchema = z
  .object({
    year_group_ids: z.array(z.string().uuid()).min(1).max(50),
  })
  .strict();

export const classParamsSchema = z
  .object({
    class_ids: z.array(z.string().uuid()).min(1).max(200),
  })
  .strict();

export const sectionParamsSchema = z
  .object({
    section_ids: z.array(z.string().uuid()).min(1).max(50),
  })
  .strict();

// ─── Household ────────────────────────────────────────────────────────────────

export const householdParamsSchema = z
  .object({
    household_ids: z.array(z.string().uuid()).min(1).max(1000),
  })
  .strict();

// ─── Handpicked ───────────────────────────────────────────────────────────────

export const handpickedParamsSchema = z
  .object({
    user_ids: z.array(z.string().uuid()).min(1).max(10_000),
  })
  .strict();

// ─── Saved audience reference ─────────────────────────────────────────────────

export const savedGroupParamsSchema = z
  .object({
    saved_audience_id: z.string().uuid(),
  })
  .strict();

// ─── Finance: fees in arrears ─────────────────────────────────────────────────

export const feesInArrearsParamsSchema = z
  .object({
    min_overdue_amount: z.number().nonnegative().optional(),
    min_overdue_days: z.number().int().nonnegative().optional(),
  })
  .strict();

// ─── Events / trips (stubs in v1) ─────────────────────────────────────────────

export const eventAttendeesParamsSchema = z
  .object({
    event_id: z.string().uuid(),
    status: z.enum(['confirmed', 'declined', 'maybe', 'any']).default('confirmed'),
  })
  .strict();

export const tripRosterParamsSchema = z
  .object({
    trip_id: z.string().uuid(),
  })
  .strict();

// ─── Registry of schemas keyed by provider key ────────────────────────────────

export const AUDIENCE_PROVIDER_PARAMS_SCHEMAS = {
  school: emptyParamsSchema,
  parents_school: emptyParamsSchema,
  staff_all: emptyParamsSchema,
  staff_role: staffRoleParamsSchema,
  department: departmentParamsSchema,
  year_group_parents: yearGroupParamsSchema,
  class_parents: classParamsSchema,
  section_parents: sectionParamsSchema,
  household: householdParamsSchema,
  year_group_students: yearGroupParamsSchema,
  class_students: classParamsSchema,
  handpicked: handpickedParamsSchema,
  fees_in_arrears: feesInArrearsParamsSchema,
  event_attendees: eventAttendeesParamsSchema,
  trip_roster: tripRosterParamsSchema,
  saved_group: savedGroupParamsSchema,
} as const;
