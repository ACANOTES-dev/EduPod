-- engagement_form_templates (standard)
ALTER TABLE engagement_form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_form_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS engagement_form_templates_tenant_isolation ON engagement_form_templates;
CREATE POLICY engagement_form_templates_tenant_isolation ON engagement_form_templates
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- engagement_form_submissions (standard)
ALTER TABLE engagement_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_form_submissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS engagement_form_submissions_tenant_isolation ON engagement_form_submissions;
CREATE POLICY engagement_form_submissions_tenant_isolation ON engagement_form_submissions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- engagement_consent_records (standard)
ALTER TABLE engagement_consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_consent_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS engagement_consent_records_tenant_isolation ON engagement_consent_records;
CREATE POLICY engagement_consent_records_tenant_isolation ON engagement_consent_records
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- engagement_events (standard)
ALTER TABLE engagement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS engagement_events_tenant_isolation ON engagement_events;
CREATE POLICY engagement_events_tenant_isolation ON engagement_events
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- engagement_event_staff (standard)
ALTER TABLE engagement_event_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_event_staff FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS engagement_event_staff_tenant_isolation ON engagement_event_staff;
CREATE POLICY engagement_event_staff_tenant_isolation ON engagement_event_staff
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- engagement_event_participants (standard)
ALTER TABLE engagement_event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_event_participants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS engagement_event_participants_tenant_isolation ON engagement_event_participants;
CREATE POLICY engagement_event_participants_tenant_isolation ON engagement_event_participants
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- conference_time_slots (standard)
ALTER TABLE conference_time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE conference_time_slots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conference_time_slots_tenant_isolation ON conference_time_slots;
CREATE POLICY conference_time_slots_tenant_isolation ON conference_time_slots
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- conference_bookings (standard)
ALTER TABLE conference_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE conference_bookings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conference_bookings_tenant_isolation ON conference_bookings;
CREATE POLICY conference_bookings_tenant_isolation ON conference_bookings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- engagement_incident_reports (standard)
ALTER TABLE engagement_incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_incident_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS engagement_incident_reports_tenant_isolation ON engagement_incident_reports;
CREATE POLICY engagement_incident_reports_tenant_isolation ON engagement_incident_reports
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

