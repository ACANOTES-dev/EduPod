export interface SchoolClosure {
  id: string;
  tenant_id: string;
  closure_date: string;
  reason: string;
  affects_scope: string;
  scope_entity_id: string | null;
  created_by_user_id: string;
  created_at: string;
}
