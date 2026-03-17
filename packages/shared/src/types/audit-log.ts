export interface AuditLogEntry {
  id: string;
  tenant_id: string | null;
  actor_user_id: string | null;
  actor_name?: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  metadata_json: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}
