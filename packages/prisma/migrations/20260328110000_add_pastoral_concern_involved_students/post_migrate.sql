-- Structured concern students involved links use standard tenant RLS.

ALTER TABLE pastoral_concern_involved_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_concern_involved_students FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_concern_involved_students_tenant_isolation ON pastoral_concern_involved_students;
CREATE POLICY pastoral_concern_involved_students_tenant_isolation ON pastoral_concern_involved_students
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
