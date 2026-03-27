-- ============================================================
-- Pastoral Care Post-Migrate: RLS Policies, Triggers,
-- Immutability Constraints, CHECK Constraints, Partial Indexes
-- ============================================================
-- This file is executed by scripts/post-migrate.ts after prisma migrate deploy.
-- All statements are idempotent (DROP IF EXISTS / CREATE IF NOT EXISTS).


-- ─── 1. Standard RLS Policies ─────────────────────────────────────────────────
-- Standard pattern: tenant_id = current_setting('app.current_tenant_id')::uuid
-- Applied to 18 tables (pastoral_concerns and cp_records get special policies).

-- pastoral_concern_versions
ALTER TABLE pastoral_concern_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_concern_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_concern_versions_tenant_isolation ON pastoral_concern_versions;
CREATE POLICY pastoral_concern_versions_tenant_isolation ON pastoral_concern_versions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- cp_access_grants
ALTER TABLE cp_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_access_grants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cp_access_grants_tenant_isolation ON cp_access_grants;
CREATE POLICY cp_access_grants_tenant_isolation ON cp_access_grants
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_cases
ALTER TABLE pastoral_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_cases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_cases_tenant_isolation ON pastoral_cases;
CREATE POLICY pastoral_cases_tenant_isolation ON pastoral_cases
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_case_students
ALTER TABLE pastoral_case_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_case_students FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_case_students_tenant_isolation ON pastoral_case_students;
CREATE POLICY pastoral_case_students_tenant_isolation ON pastoral_case_students
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_interventions
ALTER TABLE pastoral_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_interventions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_interventions_tenant_isolation ON pastoral_interventions;
CREATE POLICY pastoral_interventions_tenant_isolation ON pastoral_interventions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_intervention_actions
ALTER TABLE pastoral_intervention_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_intervention_actions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_intervention_actions_tenant_isolation ON pastoral_intervention_actions;
CREATE POLICY pastoral_intervention_actions_tenant_isolation ON pastoral_intervention_actions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_intervention_progress
ALTER TABLE pastoral_intervention_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_intervention_progress FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_intervention_progress_tenant_isolation ON pastoral_intervention_progress;
CREATE POLICY pastoral_intervention_progress_tenant_isolation ON pastoral_intervention_progress
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_referrals
ALTER TABLE pastoral_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_referrals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_referrals_tenant_isolation ON pastoral_referrals;
CREATE POLICY pastoral_referrals_tenant_isolation ON pastoral_referrals
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_referral_recommendations
ALTER TABLE pastoral_referral_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_referral_recommendations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_referral_recommendations_tenant_isolation ON pastoral_referral_recommendations;
CREATE POLICY pastoral_referral_recommendations_tenant_isolation ON pastoral_referral_recommendations
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- sst_members
ALTER TABLE sst_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst_members FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sst_members_tenant_isolation ON sst_members;
CREATE POLICY sst_members_tenant_isolation ON sst_members
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- sst_meetings
ALTER TABLE sst_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst_meetings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sst_meetings_tenant_isolation ON sst_meetings;
CREATE POLICY sst_meetings_tenant_isolation ON sst_meetings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- sst_meeting_agenda_items
ALTER TABLE sst_meeting_agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst_meeting_agenda_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sst_meeting_agenda_items_tenant_isolation ON sst_meeting_agenda_items;
CREATE POLICY sst_meeting_agenda_items_tenant_isolation ON sst_meeting_agenda_items
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- sst_meeting_actions
ALTER TABLE sst_meeting_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst_meeting_actions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sst_meeting_actions_tenant_isolation ON sst_meeting_actions;
CREATE POLICY sst_meeting_actions_tenant_isolation ON sst_meeting_actions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_parent_contacts
ALTER TABLE pastoral_parent_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_parent_contacts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_parent_contacts_tenant_isolation ON pastoral_parent_contacts;
CREATE POLICY pastoral_parent_contacts_tenant_isolation ON pastoral_parent_contacts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_events
ALTER TABLE pastoral_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_events_tenant_isolation ON pastoral_events;
CREATE POLICY pastoral_events_tenant_isolation ON pastoral_events
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_dsar_reviews
ALTER TABLE pastoral_dsar_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_dsar_reviews FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_dsar_reviews_tenant_isolation ON pastoral_dsar_reviews;
CREATE POLICY pastoral_dsar_reviews_tenant_isolation ON pastoral_dsar_reviews
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- critical_incidents
ALTER TABLE critical_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE critical_incidents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS critical_incidents_tenant_isolation ON critical_incidents;
CREATE POLICY critical_incidents_tenant_isolation ON critical_incidents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- critical_incident_affected
ALTER TABLE critical_incident_affected ENABLE ROW LEVEL SECURITY;
ALTER TABLE critical_incident_affected FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS critical_incident_affected_tenant_isolation ON critical_incident_affected;
CREATE POLICY critical_incident_affected_tenant_isolation ON critical_incident_affected
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- student_checkins (standard RLS + application-layer restriction)
ALTER TABLE student_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_checkins FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_checkins_tenant_isolation ON student_checkins;
CREATE POLICY student_checkins_tenant_isolation ON student_checkins
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);


-- ─── 2. Tiered RLS for pastoral_concerns ──────────────────────────────────────
-- Non-DLP users see tier < 3 only. DLP users (active cp_access_grants) see all tiers.

ALTER TABLE pastoral_concerns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_concerns FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pastoral_concerns_tiered_access ON pastoral_concerns;
CREATE POLICY pastoral_concerns_tiered_access ON pastoral_concerns
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND (
      tier < 3
      OR EXISTS (
        SELECT 1 FROM cp_access_grants
        WHERE cp_access_grants.tenant_id = pastoral_concerns.tenant_id
          AND cp_access_grants.user_id = current_setting('app.current_user_id')::uuid
          AND cp_access_grants.revoked_at IS NULL
      )
    )
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id')::uuid
  );


-- ─── 3. CP-specific RLS for cp_records ────────────────────────────────────────
-- Requires BOTH tenant match AND an active cp_access_grants entry for current user.

ALTER TABLE cp_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cp_records_tenant_and_grant ON cp_records;
CREATE POLICY cp_records_tenant_and_grant ON cp_records
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND EXISTS (
      SELECT 1 FROM cp_access_grants
      WHERE cp_access_grants.tenant_id = cp_records.tenant_id
        AND cp_access_grants.user_id = current_setting('app.current_user_id')::uuid
        AND cp_access_grants.revoked_at IS NULL
    )
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND EXISTS (
      SELECT 1 FROM cp_access_grants
      WHERE cp_access_grants.tenant_id = cp_records.tenant_id
        AND cp_access_grants.user_id = current_setting('app.current_user_id')::uuid
        AND cp_access_grants.revoked_at IS NULL
    )
  );


-- ─── 4. Immutability trigger function ─────────────────────────────────────────
-- Applied to 4 append-only tables: pastoral_events, pastoral_concern_versions,
-- pastoral_intervention_progress, pastoral_parent_contacts.

CREATE OR REPLACE FUNCTION prevent_immutable_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only. UPDATE and DELETE operations are prohibited.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_pastoral_events ON pastoral_events;
CREATE TRIGGER trg_immutable_pastoral_events
  BEFORE UPDATE OR DELETE ON pastoral_events
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_modification();

DROP TRIGGER IF EXISTS trg_immutable_concern_versions ON pastoral_concern_versions;
CREATE TRIGGER trg_immutable_concern_versions
  BEFORE UPDATE OR DELETE ON pastoral_concern_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_modification();

DROP TRIGGER IF EXISTS trg_immutable_intervention_progress ON pastoral_intervention_progress;
CREATE TRIGGER trg_immutable_intervention_progress
  BEFORE UPDATE OR DELETE ON pastoral_intervention_progress
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_modification();

DROP TRIGGER IF EXISTS trg_immutable_parent_contacts ON pastoral_parent_contacts;
CREATE TRIGGER trg_immutable_parent_contacts
  BEFORE UPDATE OR DELETE ON pastoral_parent_contacts
  FOR EACH ROW EXECUTE FUNCTION prevent_immutable_modification();


-- ─── 5. Tier downgrade prevention trigger ─────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_tier_downgrade()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tier < OLD.tier THEN
    RAISE EXCEPTION 'Pastoral concern tier cannot be downgraded (% -> %)', OLD.tier, NEW.tier;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_tier_downgrade ON pastoral_concerns;
CREATE TRIGGER trg_prevent_tier_downgrade
  BEFORE UPDATE OF tier ON pastoral_concerns
  FOR EACH ROW
  EXECUTE FUNCTION prevent_tier_downgrade();


-- ─── 6. Auto-tier escalation for CP categories ───────────────────────────────

CREATE OR REPLACE FUNCTION auto_escalate_cp_category()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.category IN ('child_protection', 'self_harm') AND NEW.tier < 3 THEN
    NEW.tier := 3;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_escalate_cp_category ON pastoral_concerns;
CREATE TRIGGER trg_auto_escalate_cp_category
  BEFORE INSERT OR UPDATE OF category ON pastoral_concerns
  FOR EACH ROW
  EXECUTE FUNCTION auto_escalate_cp_category();


-- ─── 7. CHECK constraints ─────────────────────────────────────────────────────

-- Concern version requires amendment reason after v1
ALTER TABLE pastoral_concern_versions
  DROP CONSTRAINT IF EXISTS chk_amendment_reason;
ALTER TABLE pastoral_concern_versions
  ADD CONSTRAINT chk_amendment_reason
  CHECK (version_number = 1 OR amendment_reason IS NOT NULL);

-- Version number must be >= 1
ALTER TABLE pastoral_concern_versions
  DROP CONSTRAINT IF EXISTS chk_version_number_positive;
ALTER TABLE pastoral_concern_versions
  ADD CONSTRAINT chk_version_number_positive
  CHECK (version_number >= 1);

-- Tier must be 1, 2, or 3
ALTER TABLE pastoral_concerns
  DROP CONSTRAINT IF EXISTS chk_concern_tier;
ALTER TABLE pastoral_concerns
  ADD CONSTRAINT chk_concern_tier
  CHECK (tier IN (1, 2, 3));

-- Continuum level must be 1, 2, or 3
ALTER TABLE pastoral_interventions
  DROP CONSTRAINT IF EXISTS chk_continuum_level;
ALTER TABLE pastoral_interventions
  ADD CONSTRAINT chk_continuum_level
  CHECK (continuum_level IN (1, 2, 3));

-- Mood score range (for Phase 4, but table is created now)
ALTER TABLE student_checkins
  DROP CONSTRAINT IF EXISTS chk_mood_score_range;
ALTER TABLE student_checkins
  ADD CONSTRAINT chk_mood_score_range
  CHECK (mood_score BETWEEN 1 AND 5);


-- ─── 8. Partial unique index for cp_access_grants ─────────────────────────────

-- One active grant per user per tenant
DROP INDEX IF EXISTS uq_cp_access_grants_active;
CREATE UNIQUE INDEX uq_cp_access_grants_active
  ON cp_access_grants (tenant_id, user_id)
  WHERE revoked_at IS NULL;


-- ─── 9. set_updated_at() triggers for mutable tables ──────────────────────────
-- The set_updated_at() function already exists from P1 migration.
-- Applied to all 14 mutable pastoral tables (NOT the 4 append-only tables).

DO $$ BEGIN
  -- pastoral_concerns
  DROP TRIGGER IF EXISTS trg_pastoral_concerns_updated_at ON pastoral_concerns;
  CREATE TRIGGER trg_pastoral_concerns_updated_at
    BEFORE UPDATE ON pastoral_concerns
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- cp_records
  DROP TRIGGER IF EXISTS trg_cp_records_updated_at ON cp_records;
  CREATE TRIGGER trg_cp_records_updated_at
    BEFORE UPDATE ON cp_records
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- pastoral_cases
  DROP TRIGGER IF EXISTS trg_pastoral_cases_updated_at ON pastoral_cases;
  CREATE TRIGGER trg_pastoral_cases_updated_at
    BEFORE UPDATE ON pastoral_cases
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- pastoral_interventions
  DROP TRIGGER IF EXISTS trg_pastoral_interventions_updated_at ON pastoral_interventions;
  CREATE TRIGGER trg_pastoral_interventions_updated_at
    BEFORE UPDATE ON pastoral_interventions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- pastoral_intervention_actions
  DROP TRIGGER IF EXISTS trg_pastoral_intervention_actions_updated_at ON pastoral_intervention_actions;
  CREATE TRIGGER trg_pastoral_intervention_actions_updated_at
    BEFORE UPDATE ON pastoral_intervention_actions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- pastoral_referrals
  DROP TRIGGER IF EXISTS trg_pastoral_referrals_updated_at ON pastoral_referrals;
  CREATE TRIGGER trg_pastoral_referrals_updated_at
    BEFORE UPDATE ON pastoral_referrals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- pastoral_referral_recommendations
  DROP TRIGGER IF EXISTS trg_pastoral_referral_recommendations_updated_at ON pastoral_referral_recommendations;
  CREATE TRIGGER trg_pastoral_referral_recommendations_updated_at
    BEFORE UPDATE ON pastoral_referral_recommendations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- sst_members
  DROP TRIGGER IF EXISTS trg_sst_members_updated_at ON sst_members;
  CREATE TRIGGER trg_sst_members_updated_at
    BEFORE UPDATE ON sst_members
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- sst_meetings
  DROP TRIGGER IF EXISTS trg_sst_meetings_updated_at ON sst_meetings;
  CREATE TRIGGER trg_sst_meetings_updated_at
    BEFORE UPDATE ON sst_meetings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- sst_meeting_agenda_items
  DROP TRIGGER IF EXISTS trg_sst_meeting_agenda_items_updated_at ON sst_meeting_agenda_items;
  CREATE TRIGGER trg_sst_meeting_agenda_items_updated_at
    BEFORE UPDATE ON sst_meeting_agenda_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- sst_meeting_actions
  DROP TRIGGER IF EXISTS trg_sst_meeting_actions_updated_at ON sst_meeting_actions;
  CREATE TRIGGER trg_sst_meeting_actions_updated_at
    BEFORE UPDATE ON sst_meeting_actions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- pastoral_dsar_reviews
  DROP TRIGGER IF EXISTS trg_pastoral_dsar_reviews_updated_at ON pastoral_dsar_reviews;
  CREATE TRIGGER trg_pastoral_dsar_reviews_updated_at
    BEFORE UPDATE ON pastoral_dsar_reviews
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- critical_incidents
  DROP TRIGGER IF EXISTS trg_critical_incidents_updated_at ON critical_incidents;
  CREATE TRIGGER trg_critical_incidents_updated_at
    BEFORE UPDATE ON critical_incidents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- critical_incident_affected
  DROP TRIGGER IF EXISTS trg_critical_incident_affected_updated_at ON critical_incident_affected;
  CREATE TRIGGER trg_critical_incident_affected_updated_at
    BEFORE UPDATE ON critical_incident_affected
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
END $$;
