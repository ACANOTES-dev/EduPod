// ─── CP Record Types (aligns with Prisma CpRecordType enum) ─────────────────

export const CP_RECORD_TYPES = [
  'concern',
  'mandated_report',
  'tusla_correspondence',
  'section_26',
  'disclosure',
  'retrospective_disclosure',
] as const;

export type CpRecordType = (typeof CP_RECORD_TYPES)[number];

// ─── Mandated Report Statuses (aligns with Prisma MandatedReportStatus @map values) ─

export const MANDATED_REPORT_STATUSES = [
  'draft',
  'submitted',
  'acknowledged',
  'outcome_received',
] as const;

export type MandatedReportStatus = (typeof MANDATED_REPORT_STATUSES)[number];

/**
 * Valid forward-only transitions for mandated report status.
 * No backward transitions permitted.
 */
export const MANDATED_REPORT_TRANSITIONS: Record<string, MandatedReportStatus | null> = {
  draft: 'submitted',
  submitted: 'acknowledged',
  acknowledged: 'outcome_received',
  outcome_received: null,
};

// ─── Export Purposes (controlled list — enforced by Zod enum) ───────────────

export const EXPORT_PURPOSES = [
  'tusla_request',
  'section_26',
  'legal_proceedings',
  'school_transfer',
  'board_oversight',
  'other',
] as const;

export type ExportPurpose = (typeof EXPORT_PURPOSES)[number];

// ─── CP Audit Event Types ───────────────────────────────────────────────────

export const CP_AUDIT_EVENTS = {
  RECORD_CREATED: 'cp_record_created',
  RECORD_UPDATED: 'cp_record_updated',
  RECORD_ACCESSED: 'cp_record_accessed',
  ACCESS_GRANTED: 'cp_access_granted',
  ACCESS_REVOKED: 'cp_access_revoked',
  EXPORT_PREVIEWED: 'cp_export_previewed',
  EXPORT_GENERATED: 'cp_export_generated',
  EXPORT_DOWNLOADED: 'cp_export_downloaded',
  MANDATED_REPORT_CREATED: 'mandated_report_created',
  MANDATED_REPORT_SUBMITTED: 'mandated_report_submitted',
  MANDATED_REPORT_ACKNOWLEDGED: 'mandated_report_acknowledged',
  MANDATED_REPORT_OUTCOME_RECEIVED: 'mandated_report_outcome_received',
} as const;

export type CpAuditEvent = (typeof CP_AUDIT_EVENTS)[keyof typeof CP_AUDIT_EVENTS];

// ─── Download Token Configuration ───────────────────────────────────────────

/** One-time download tokens expire after 15 minutes */
export const DOWNLOAD_TOKEN_TTL_SECONDS = 900;

// ─── Redis Key Prefixes ─────────────────────────────────────────────────────

export const CP_REDIS_PREFIXES = {
  DOWNLOAD_TOKEN: 'cp:download:',
  PREVIEW_TOKEN: 'cp:preview:',
} as const;

export type CpRedisPrefix = (typeof CP_REDIS_PREFIXES)[keyof typeof CP_REDIS_PREFIXES];
