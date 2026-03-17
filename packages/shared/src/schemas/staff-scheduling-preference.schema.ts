import { z } from 'zod';

export const preferencePayloadSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('subject'),
    subject_ids: z.array(z.string().uuid()).min(1),
    mode: z.enum(['prefer', 'avoid']),
  }),
  z.object({
    type: z.literal('class_pref'),
    class_ids: z.array(z.string().uuid()).min(1),
    mode: z.enum(['prefer', 'avoid']),
  }),
  z.object({
    type: z.literal('time_slot'),
    weekday: z.number().int().min(0).max(6).nullable(),
    preferred_period_orders: z.array(z.number().int().min(0)).min(1),
    mode: z.enum(['prefer', 'avoid']),
  }),
]);

export type PreferencePayloadDto = z.infer<typeof preferencePayloadSchema>;

export const createStaffPreferenceSchema = z.object({
  staff_profile_id: z.string().uuid(),
  academic_year_id: z.string().uuid(),
  preference_payload: preferencePayloadSchema,
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
});

export type CreateStaffPreferenceDto = z.infer<typeof createStaffPreferenceSchema>;

export const updateStaffPreferenceSchema = z.object({
  preference_payload: preferencePayloadSchema.optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
});

export type UpdateStaffPreferenceDto = z.infer<typeof updateStaffPreferenceSchema>;
