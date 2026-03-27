import { z } from 'zod';

// ─── Alert types (matching AlertType enum) ─────────────────────────────────

export const ALERT_TYPES = [
  'escalating_student',
  'disengaging_student',
  'hotspot',
  'logging_gap',
  'overdue_review',
  'suspension_return',
  'policy_threshold_breach',
] as const;

export const ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;

export const ALERT_RECIPIENT_STATUSES = [
  'unseen',
  'seen',
  'acknowledged',
  'snoozed',
  'resolved',
  'dismissed',
] as const;

// ─── Query schemas ─────────────────────────────────────────────────────────

export const alertListQuerySchema = z.object({
  status: z.enum(['all', 'unseen', 'acknowledged', 'snoozed', 'resolved']).optional().default('all'),
  alertType: z.enum(ALERT_TYPES).optional(),
  severity: z.enum(ALERT_SEVERITIES).optional(),
  page: z
    .string()
    .transform((v) => parseInt(v, 10))
    .optional()
    .default('1'),
  pageSize: z
    .string()
    .transform((v) => Math.min(parseInt(v, 10), 100))
    .optional()
    .default('20'),
});

export type AlertListQuery = z.infer<typeof alertListQuerySchema>;

// ─── Action schemas ────────────────────────────────────────────────────────

export const snoozeAlertSchema = z.object({
  snoozed_until: z.string().datetime(),
});

export type SnoozeAlertInput = z.infer<typeof snoozeAlertSchema>;

export const dismissAlertSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type DismissAlertInput = z.infer<typeof dismissAlertSchema>;

// ─── Response types ────────────────────────────────────────────────────────

export interface AlertListItem {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string;
  student_name: string | null;
  subject_name: string | null;
  staff_name: string | null;
  my_status: string;
  created_at: string;
  data_snapshot: Record<string, unknown>;
}

export interface AlertDetail extends AlertListItem {
  recipients: AlertRecipientInfo[];
  resolved_at: string | null;
}

export interface AlertRecipientInfo {
  recipient_id: string;
  recipient_name: string;
  recipient_role: string | null;
  status: string;
  seen_at: string | null;
  acknowledged_at: string | null;
  snoozed_until: string | null;
  resolved_at: string | null;
  dismissed_at: string | null;
  dismissed_reason: string | null;
}
