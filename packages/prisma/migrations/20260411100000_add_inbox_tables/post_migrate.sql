-- Wave 1 — new-inbox schema foundation (Impl 01).
-- Installs FORCE ROW LEVEL SECURITY + tenant isolation policies on every new
-- inbox/messaging table. Matches the canonical entries appended to
-- packages/prisma/rls/policies.sql for the same tables.
--
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY pattern matches the rest
-- of the codebase. Safe to re-run.

-- ─── Conversations ──────────────────────────────────────────────────────────
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_tenant_isolation ON conversations;
CREATE POLICY conversations_tenant_isolation ON conversations
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Conversation Participants ──────────────────────────────────────────────
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_participants_tenant_isolation ON conversation_participants;
CREATE POLICY conversation_participants_tenant_isolation ON conversation_participants
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Messages ───────────────────────────────────────────────────────────────
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messages_tenant_isolation ON messages;
CREATE POLICY messages_tenant_isolation ON messages
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Message Reads ──────────────────────────────────────────────────────────
ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reads FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_reads_tenant_isolation ON message_reads;
CREATE POLICY message_reads_tenant_isolation ON message_reads
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Message Edits ──────────────────────────────────────────────────────────
ALTER TABLE message_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_edits FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_edits_tenant_isolation ON message_edits;
CREATE POLICY message_edits_tenant_isolation ON message_edits
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Message Attachments ────────────────────────────────────────────────────
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attachments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_attachments_tenant_isolation ON message_attachments;
CREATE POLICY message_attachments_tenant_isolation ON message_attachments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Broadcast Audience Definitions ─────────────────────────────────────────
ALTER TABLE broadcast_audience_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_audience_definitions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broadcast_audience_definitions_tenant_isolation ON broadcast_audience_definitions;
CREATE POLICY broadcast_audience_definitions_tenant_isolation ON broadcast_audience_definitions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Broadcast Audience Snapshots ───────────────────────────────────────────
ALTER TABLE broadcast_audience_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_audience_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broadcast_audience_snapshots_tenant_isolation ON broadcast_audience_snapshots;
CREATE POLICY broadcast_audience_snapshots_tenant_isolation ON broadcast_audience_snapshots
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Saved Audiences ────────────────────────────────────────────────────────
ALTER TABLE saved_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_audiences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_audiences_tenant_isolation ON saved_audiences;
CREATE POLICY saved_audiences_tenant_isolation ON saved_audiences
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Tenant Messaging Policy (role-pair grid) ───────────────────────────────
ALTER TABLE tenant_messaging_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_messaging_policy FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_messaging_policy_tenant_isolation ON tenant_messaging_policy;
CREATE POLICY tenant_messaging_policy_tenant_isolation ON tenant_messaging_policy
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Tenant Settings Inbox ──────────────────────────────────────────────────
ALTER TABLE tenant_settings_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings_inbox FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_settings_inbox_tenant_isolation ON tenant_settings_inbox;
CREATE POLICY tenant_settings_inbox_tenant_isolation ON tenant_settings_inbox
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Safeguarding Keywords ──────────────────────────────────────────────────
ALTER TABLE safeguarding_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE safeguarding_keywords FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS safeguarding_keywords_tenant_isolation ON safeguarding_keywords;
CREATE POLICY safeguarding_keywords_tenant_isolation ON safeguarding_keywords
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Message Flags ──────────────────────────────────────────────────────────
ALTER TABLE message_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_flags FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_flags_tenant_isolation ON message_flags;
CREATE POLICY message_flags_tenant_isolation ON message_flags
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Oversight Access Log ───────────────────────────────────────────────────
ALTER TABLE oversight_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE oversight_access_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oversight_access_log_tenant_isolation ON oversight_access_log;
CREATE POLICY oversight_access_log_tenant_isolation ON oversight_access_log
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
