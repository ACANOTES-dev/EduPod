import { z } from 'zod';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const engagementEventTypeEnum = z.enum([
  'school_trip',
  'overnight_trip',
  'sports_event',
  'cultural_event',
  'in_school_event',
  'after_school_activity',
  'parent_conference',
  'policy_signoff',
]);

export const eventTargetTypeEnum = z.enum(['whole_school', 'year_group', 'class_group', 'custom']);

// ─── Target Config ────────────────────────────────────────────────────────────

export const eventTargetConfigSchema = z.object({
  year_group_ids: z.array(z.string().uuid()).optional(),
  class_ids: z.array(z.string().uuid()).optional(),
  student_ids: z.array(z.string().uuid()).optional(),
});

export type EventTargetConfig = z.infer<typeof eventTargetConfigSchema>;

// ─── Create Event ─────────────────────────────────────────────────────────────

export const createEngagementEventSchema = z
  .object({
    title: z.string().min(1).max(255),
    title_ar: z.string().optional(),
    description: z.string().optional(),
    description_ar: z.string().optional(),
    event_type: engagementEventTypeEnum,
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    location: z.string().optional(),
    location_ar: z.string().optional(),
    capacity: z.number().int().positive().optional(),
    target_type: eventTargetTypeEnum.default('whole_school'),
    target_config_json: eventTargetConfigSchema.optional(),
    consent_form_template_id: z.string().uuid().optional(),
    risk_assessment_template_id: z.string().uuid().optional(),
    fee_amount: z.number().min(0).multipleOf(0.01).optional(),
    fee_description: z.string().optional(),
    slot_duration_minutes: z.number().int().min(5).max(60).optional(),
    buffer_minutes: z.number().int().min(0).max(15).optional(),
    consent_deadline: z.string().optional(),
    payment_deadline: z.string().optional(),
    booking_deadline: z.string().optional(),
    risk_assessment_required: z.boolean().default(false),
    academic_year_id: z.string().uuid(),
    staff_ids: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (data) => data.event_type !== 'parent_conference' || data.slot_duration_minutes !== undefined,
    {
      message: 'slot_duration_minutes is required when event_type is parent_conference',
      path: ['slot_duration_minutes'],
    },
  )
  .refine(
    (data) =>
      (data.event_type !== 'school_trip' && data.event_type !== 'overnight_trip') ||
      data.start_date !== undefined,
    {
      message: 'start_date is required when event_type is school_trip or overnight_trip',
      path: ['start_date'],
    },
  );

export type CreateEngagementEventDto = z.infer<typeof createEngagementEventSchema>;

// ─── Update Event ─────────────────────────────────────────────────────────────

export const updateEngagementEventSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  title_ar: z.string().optional(),
  description: z.string().optional(),
  description_ar: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  location: z.string().optional(),
  location_ar: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  target_type: eventTargetTypeEnum.optional(),
  target_config_json: eventTargetConfigSchema.optional(),
  consent_form_template_id: z.string().uuid().optional(),
  risk_assessment_template_id: z.string().uuid().optional(),
  fee_amount: z.number().min(0).multipleOf(0.01).optional(),
  fee_description: z.string().optional(),
  slot_duration_minutes: z.number().int().min(5).max(60).optional(),
  buffer_minutes: z.number().int().min(0).max(15).optional(),
  consent_deadline: z.string().optional(),
  payment_deadline: z.string().optional(),
  booking_deadline: z.string().optional(),
  risk_assessment_required: z.boolean().optional(),
  staff_ids: z.array(z.string().uuid()).optional(),
});

export type UpdateEngagementEventDto = z.infer<typeof updateEngagementEventSchema>;

// ─── Dashboard Query ──────────────────────────────────────────────────────────

export const eventDashboardQuerySchema = z.object({
  page: z.number().int().positive().default(1),
  page_size: z.number().int().positive().default(20),
});

export type EventDashboardQuery = z.infer<typeof eventDashboardQuerySchema>;
