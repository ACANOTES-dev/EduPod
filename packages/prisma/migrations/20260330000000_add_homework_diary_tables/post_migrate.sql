-- ============================================================
-- Homework & Diary Post-Migrate: RLS Policies + Triggers
-- ============================================================
-- This file is executed by scripts/post-migrate.ts after prisma migrate deploy.
-- All statements are idempotent (DROP IF EXISTS).

-- ─── 1. RLS Policies ─────────────────────────────────────────────────────────

-- homework_assignments
ALTER TABLE homework_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_assignments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS homework_assignments_tenant_isolation ON homework_assignments;
CREATE POLICY homework_assignments_tenant_isolation ON homework_assignments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- homework_attachments
ALTER TABLE homework_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_attachments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS homework_attachments_tenant_isolation ON homework_attachments;
CREATE POLICY homework_attachments_tenant_isolation ON homework_attachments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- homework_completions
ALTER TABLE homework_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_completions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS homework_completions_tenant_isolation ON homework_completions;
CREATE POLICY homework_completions_tenant_isolation ON homework_completions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- homework_recurrence_rules
ALTER TABLE homework_recurrence_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_recurrence_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS homework_recurrence_rules_tenant_isolation ON homework_recurrence_rules;
CREATE POLICY homework_recurrence_rules_tenant_isolation ON homework_recurrence_rules
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- diary_notes
ALTER TABLE diary_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS diary_notes_tenant_isolation ON diary_notes;
CREATE POLICY diary_notes_tenant_isolation ON diary_notes
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- diary_parent_notes
ALTER TABLE diary_parent_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary_parent_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS diary_parent_notes_tenant_isolation ON diary_parent_notes;
CREATE POLICY diary_parent_notes_tenant_isolation ON diary_parent_notes
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);


-- ─── 2. updated_at triggers ─────────────────────────────────────────────────
-- The set_updated_at() function already exists from P1 migration.

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_homework_assignments_updated_at ON homework_assignments;
  CREATE TRIGGER trg_homework_assignments_updated_at
    BEFORE UPDATE ON homework_assignments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_homework_completions_updated_at ON homework_completions;
  CREATE TRIGGER trg_homework_completions_updated_at
    BEFORE UPDATE ON homework_completions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_homework_recurrence_rules_updated_at ON homework_recurrence_rules;
  CREATE TRIGGER trg_homework_recurrence_rules_updated_at
    BEFORE UPDATE ON homework_recurrence_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_diary_notes_updated_at ON diary_notes;
  CREATE TRIGGER trg_diary_notes_updated_at
    BEFORE UPDATE ON diary_notes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_diary_parent_notes_updated_at ON diary_parent_notes;
  CREATE TRIGGER trg_diary_parent_notes_updated_at
    BEFORE UPDATE ON diary_parent_notes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
END $$;

-- NOTE: homework_attachments is append-only (no updated_at column).
-- No updated_at trigger needed.
