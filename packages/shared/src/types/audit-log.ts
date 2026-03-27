export const AUDIT_LOG_CATEGORIES = [
  'mutation',
  'read_access',
  'security_event',
  'permission_denied',
] as const;

export type AuditLogCategory = (typeof AUDIT_LOG_CATEGORIES)[number];

export const AUDIT_LOG_SENSITIVITIES = [
  'normal',
  'special_category',
  'financial',
  'cross_tenant',
  'full_export',
  'dsar_response',
  'analytics',
] as const;

export type AuditLogSensitivity = (typeof AUDIT_LOG_SENSITIVITIES)[number];

export interface AuditLogEntry {
  id: string;
  tenant_id: string | null;
  actor_user_id: string | null;
  actor_name?: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  category?: AuditLogCategory;
  sensitivity?: AuditLogSensitivity;
  metadata_json: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}
