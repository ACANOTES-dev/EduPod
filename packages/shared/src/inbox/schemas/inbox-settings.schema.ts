import { z } from 'zod';

import { MESSAGING_ROLES } from '../constants';

const FALLBACK_CHANNELS = ['email', 'sms', 'whatsapp'] as const;

/**
 * Schema for PATCH-ing tenant inbox settings — the kill switches, fallback
 * SLAs, edit window, retention. All fields are optional; only the ones the
 * caller sends are updated.
 */
export const updateInboxSettingsSchema = z.object({
  messaging_enabled: z.boolean().optional(),
  students_can_initiate: z.boolean().optional(),
  parents_can_initiate: z.boolean().optional(),
  parent_to_parent_messaging: z.boolean().optional(),
  student_to_student_messaging: z.boolean().optional(),
  student_to_parent_messaging: z.boolean().optional(),
  require_admin_approval_for_parent_to_teacher: z.boolean().optional(),
  edit_window_minutes: z.number().int().min(0).max(1440).optional(),
  retention_days: z.number().int().min(30).max(3650).nullable().optional(),
  fallback_admin_enabled: z.boolean().optional(),
  fallback_admin_after_hours: z.number().int().min(1).max(168).optional(),
  fallback_admin_channels: z.array(z.enum(FALLBACK_CHANNELS)).optional(),
  fallback_teacher_enabled: z.boolean().optional(),
  fallback_teacher_after_hours: z.number().int().min(1).max(168).optional(),
  fallback_teacher_channels: z.array(z.enum(FALLBACK_CHANNELS)).optional(),
});

export type UpdateInboxSettingsDto = z.infer<typeof updateInboxSettingsSchema>;

/**
 * Schema for bulk-updating the role-pair messaging policy matrix. Payload is
 * a list of `(sender_role, recipient_role, allowed)` triples; the service
 * upserts each row under the `(tenant_id, sender_role, recipient_role)`
 * unique constraint.
 */
export const updateMessagingPolicySchema = z.object({
  cells: z
    .array(
      z.object({
        sender_role: z.enum(MESSAGING_ROLES),
        recipient_role: z.enum(MESSAGING_ROLES),
        allowed: z.boolean(),
      }),
    )
    .min(1)
    .max(81),
});

export type UpdateMessagingPolicyDto = z.infer<typeof updateMessagingPolicySchema>;
