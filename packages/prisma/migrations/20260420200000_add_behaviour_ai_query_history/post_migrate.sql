-- Wellbeing Rebuild — Impl 05 post-migrate: RLS policy for the new
-- `behaviour_ai_query_history` table. Idempotent.

ALTER TABLE behaviour_ai_query_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_ai_query_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS behaviour_ai_query_history_tenant_isolation ON behaviour_ai_query_history;
CREATE POLICY behaviour_ai_query_history_tenant_isolation ON behaviour_ai_query_history
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
