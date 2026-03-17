export const NOTIFICATION_TYPES = [
  'invoice.issued',
  'payment.received',
  'payment.failed',
  'report_card.published',
  'attendance.exception',
  'admission.status_change',
  'announcement.published',
  'approval.requested',
  'approval.decided',
  'inquiry.new_message',
  'payroll.finalised',
  'payslip.generated',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
