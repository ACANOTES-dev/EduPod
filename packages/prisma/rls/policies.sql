-- =============================================================
-- RLS Policy Template — School Operating System
-- =============================================================
-- Every tenant-scoped table gets this pattern.
-- Actual policies are created in post_migrate.sql files
-- alongside their Prisma migration.
-- =============================================================

-- Template for a standard tenant-scoped table:
--
--   ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY;
--
--   DROP POLICY IF EXISTS {table_name}_tenant_isolation ON {table_name};
--   CREATE POLICY {table_name}_tenant_isolation ON {table_name}
--     USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
--     WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--
-- For tables with nullable tenant_id (platform + tenant rows):
--
--   ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY;
--
--   DROP POLICY IF EXISTS {table_name}_tenant_isolation ON {table_name};
--   CREATE POLICY {table_name}_tenant_isolation ON {table_name}
--     USING (
--       tenant_id IS NULL
--       OR tenant_id = current_setting('app.current_tenant_id')::uuid
--     )
--     WITH CHECK (
--       tenant_id IS NULL
--       OR tenant_id = current_setting('app.current_tenant_id')::uuid
--     );

-- =============================================================
-- P7 RLS Policies — Communications, Notifications & CMS
-- =============================================================
-- Defined in: packages/prisma/migrations/20260316240000_add_p7_communications_cms/post_migrate.sql

-- announcements (standard)
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS announcements_tenant_isolation ON announcements;
CREATE POLICY announcements_tenant_isolation ON announcements
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- notification_templates (dual — nullable tenant_id: platform templates have NULL)
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_templates_tenant_isolation ON notification_templates;
CREATE POLICY notification_templates_tenant_isolation ON notification_templates
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  );

-- notifications (standard)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_tenant_isolation ON notifications;
CREATE POLICY notifications_tenant_isolation ON notifications
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- parent_inquiries (standard)
ALTER TABLE parent_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_inquiries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parent_inquiries_tenant_isolation ON parent_inquiries;
CREATE POLICY parent_inquiries_tenant_isolation ON parent_inquiries
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- parent_inquiry_messages (standard)
ALTER TABLE parent_inquiry_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_inquiry_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parent_inquiry_messages_tenant_isolation ON parent_inquiry_messages;
CREATE POLICY parent_inquiry_messages_tenant_isolation ON parent_inquiry_messages
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- website_pages (standard)
ALTER TABLE website_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_pages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS website_pages_tenant_isolation ON website_pages;
CREATE POLICY website_pages_tenant_isolation ON website_pages
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- contact_form_submissions (standard)
ALTER TABLE contact_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_form_submissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_form_submissions_tenant_isolation ON contact_form_submissions;
CREATE POLICY contact_form_submissions_tenant_isolation ON contact_form_submissions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
