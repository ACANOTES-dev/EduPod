-- ============================================================
-- P7 Post-Migrate: Triggers, RLS Policies, Partial Indexes
-- ============================================================
-- This file is executed by scripts/post-migrate.ts after prisma migrate deploy.
-- All statements are idempotent (DROP IF EXISTS → CREATE).

-- ─── Updated-at Triggers ─────────────────────────────────────────────────────
-- Applied to P7 tables that have an updated_at column.
-- The set_updated_at() function was created in P1's post_migrate.sql.

DO $$ BEGIN
  -- announcements
  DROP TRIGGER IF EXISTS trg_announcements_updated_at ON announcements;
  CREATE TRIGGER trg_announcements_updated_at
    BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- notification_templates
  DROP TRIGGER IF EXISTS trg_notification_templates_updated_at ON notification_templates;
  CREATE TRIGGER trg_notification_templates_updated_at
    BEFORE UPDATE ON notification_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- parent_inquiries
  DROP TRIGGER IF EXISTS trg_parent_inquiries_updated_at ON parent_inquiries;
  CREATE TRIGGER trg_parent_inquiries_updated_at
    BEFORE UPDATE ON parent_inquiries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- website_pages
  DROP TRIGGER IF EXISTS trg_website_pages_updated_at ON website_pages;
  CREATE TRIGGER trg_website_pages_updated_at
    BEFORE UPDATE ON website_pages
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- contact_form_submissions
  DROP TRIGGER IF EXISTS trg_contact_form_submissions_updated_at ON contact_form_submissions;
  CREATE TRIGGER trg_contact_form_submissions_updated_at
    BEFORE UPDATE ON contact_form_submissions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- NOTE: notifications does NOT get this trigger (no updated_at column)
  -- NOTE: parent_inquiry_messages does NOT get this trigger (no updated_at column)
END $$;

-- ─── RLS Policies ────────────────────────────────────────────────────────────
-- Standard pattern: tenant_id = current_setting('app.current_tenant_id')::uuid
-- Dual pattern: tenant_id IS NULL OR tenant_id = current_setting(...)::uuid

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

-- ─── Partial Indexes ─────────────────────────────────────────────────────────
-- These cannot be expressed in Prisma schema.

-- Partial index for failed notification retry lookup
CREATE INDEX IF NOT EXISTS idx_notifications_retry
  ON notifications(status, next_retry_at)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;

-- Partial index for notification source entity lookup
CREATE INDEX IF NOT EXISTS idx_notifications_source
  ON notifications(tenant_id, source_entity_type, source_entity_id)
  WHERE source_entity_type IS NOT NULL;

-- Unique COALESCE index for notification templates
-- Ensures uniqueness per (tenant_or_platform, template_key, channel, locale)
-- NULL tenant_id (platform templates) uses a sentinel UUID in the COALESCE
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_templates_unique
  ON notification_templates(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), template_key, channel, locale);

-- Partial unique index for homepage enforcement
-- Only one published homepage per tenant per locale
CREATE UNIQUE INDEX IF NOT EXISTS idx_website_pages_homepage
  ON website_pages(tenant_id, locale)
  WHERE page_type = 'home' AND status = 'published';
