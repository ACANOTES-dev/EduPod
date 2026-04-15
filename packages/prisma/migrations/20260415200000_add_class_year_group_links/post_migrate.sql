-- SCHED-022: RLS policy for class_year_group_links.
-- See /packages/prisma/rls/policies.sql for the authoritative catalogue.

ALTER TABLE class_year_group_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_year_group_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_year_group_links_tenant_isolation ON class_year_group_links;
CREATE POLICY class_year_group_links_tenant_isolation ON class_year_group_links
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
