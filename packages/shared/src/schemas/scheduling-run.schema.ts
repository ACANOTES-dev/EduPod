import { z } from 'zod';

export const createSchedulingRunSchema = z.object({
  academic_year_id: z.string().uuid(),
  solver_seed: z.number().int().nullable().optional(),
});

export type CreateSchedulingRunDto = z.infer<typeof createSchedulingRunSchema>;

export const applyRunSchema = z.object({
  expected_updated_at: z.string().datetime(),
});

export type ApplyRunDto = z.infer<typeof applyRunSchema>;

export const discardRunSchema = z.object({
  expected_updated_at: z.string().datetime(),
});

export type DiscardRunDto = z.infer<typeof discardRunSchema>;

export const adjustmentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('move'),
    class_id: z.string().uuid(),
    from_weekday: z.number().int().min(0).max(6),
    from_period_order: z.number().int().min(0),
    to_weekday: z.number().int().min(0).max(6),
    to_period_order: z.number().int().min(0),
    to_room_id: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal('swap'),
    entry_a: z.object({ class_id: z.string().uuid(), weekday: z.number().int(), period_order: z.number().int() }),
    entry_b: z.object({ class_id: z.string().uuid(), weekday: z.number().int(), period_order: z.number().int() }),
  }),
  z.object({
    type: z.literal('remove'),
    class_id: z.string().uuid(),
    weekday: z.number().int().min(0).max(6),
    period_order: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('add'),
    class_id: z.string().uuid(),
    room_id: z.string().uuid().nullable(),
    teacher_staff_id: z.string().uuid().nullable(),
    weekday: z.number().int().min(0).max(6),
    period_order: z.number().int().min(0),
  }),
]);

export type AdjustmentDto = z.infer<typeof adjustmentSchema>;

export const addAdjustmentSchema = z.object({
  adjustment: adjustmentSchema,
  expected_updated_at: z.string().datetime(),
});

export type AddAdjustmentDto = z.infer<typeof addAdjustmentSchema>;

// Note: pinScheduleSchema, PinScheduleDto, bulkPinSchema, BulkPinDto are defined in schedule.schema.ts
