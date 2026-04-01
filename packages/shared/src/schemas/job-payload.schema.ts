import { z } from 'zod';

export const tenantJobPayloadSchema = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  correlation_id: z.string().min(1).optional(),
});

export const computeStudentJobPayloadSchema = tenantJobPayloadSchema.extend({
  student_id: z.string().min(1),
  trigger_event: z.string().min(1),
});

export const publishAnnouncementJobPayloadSchema = tenantJobPayloadSchema.extend({
  announcement_id: z.string().min(1),
});

export const engagementEventJobPayloadSchema = tenantJobPayloadSchema.extend({
  event_id: z.string().min(1),
});

export const payrollSessionGenerationJobPayloadSchema = tenantJobPayloadSchema.extend({
  run_id: z.string().min(1),
});

export const notifyConcernJobPayloadSchema = tenantJobPayloadSchema.extend({
  category: z.string().min(1),
  concern_id: z.string().min(1),
  logged_by_user_id: z.string().min(1),
  severity: z.string().min(1),
  student_id: z.string().min(1),
});

export const pastoralEscalationTimeoutJobPayloadSchema = tenantJobPayloadSchema.extend({
  concern_id: z.string().min(1),
  escalation_type: z.string().min(1),
});
