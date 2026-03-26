-- ============================================================
-- Behaviour Management Post-Migrate: RLS Policies, Triggers,
-- Partial Indexes, Materialised Views, Domain Constraints
-- ============================================================
-- This file is executed by scripts/post-migrate.ts after prisma migrate deploy.
-- All statements are idempotent (DROP IF EXISTS / CREATE IF NOT EXISTS).


-- ─── 1. RLS Policies ───────────────────────────────────────────────────────────
-- Standard pattern: tenant_id = current_setting('app.current_tenant_id')::uuid
-- Applied to ALL 35 behaviour/safeguarding tables.

-- behaviour_categories
ALTER TABLE behaviour_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_categories FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_categories_tenant_isolation ON behaviour_categories;
CREATE POLICY behaviour_categories_tenant_isolation ON behaviour_categories
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_incidents
ALTER TABLE behaviour_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_incidents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_incidents_tenant_isolation ON behaviour_incidents;
CREATE POLICY behaviour_incidents_tenant_isolation ON behaviour_incidents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_incident_participants
ALTER TABLE behaviour_incident_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_incident_participants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_incident_participants_tenant_isolation ON behaviour_incident_participants;
CREATE POLICY behaviour_incident_participants_tenant_isolation ON behaviour_incident_participants
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_description_templates
ALTER TABLE behaviour_description_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_description_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_description_templates_tenant_isolation ON behaviour_description_templates;
CREATE POLICY behaviour_description_templates_tenant_isolation ON behaviour_description_templates
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_entity_history
ALTER TABLE behaviour_entity_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_entity_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_entity_history_tenant_isolation ON behaviour_entity_history;
CREATE POLICY behaviour_entity_history_tenant_isolation ON behaviour_entity_history
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_tasks
ALTER TABLE behaviour_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_tasks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_tasks_tenant_isolation ON behaviour_tasks;
CREATE POLICY behaviour_tasks_tenant_isolation ON behaviour_tasks
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_parent_acknowledgements
ALTER TABLE behaviour_parent_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_parent_acknowledgements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_parent_acknowledgements_tenant_isolation ON behaviour_parent_acknowledgements;
CREATE POLICY behaviour_parent_acknowledgements_tenant_isolation ON behaviour_parent_acknowledgements
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_sanctions
ALTER TABLE behaviour_sanctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_sanctions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_sanctions_tenant_isolation ON behaviour_sanctions;
CREATE POLICY behaviour_sanctions_tenant_isolation ON behaviour_sanctions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_appeals
ALTER TABLE behaviour_appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_appeals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_appeals_tenant_isolation ON behaviour_appeals;
CREATE POLICY behaviour_appeals_tenant_isolation ON behaviour_appeals
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_amendment_notices
ALTER TABLE behaviour_amendment_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_amendment_notices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_amendment_notices_tenant_isolation ON behaviour_amendment_notices;
CREATE POLICY behaviour_amendment_notices_tenant_isolation ON behaviour_amendment_notices
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_exclusion_cases
ALTER TABLE behaviour_exclusion_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_exclusion_cases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_exclusion_cases_tenant_isolation ON behaviour_exclusion_cases;
CREATE POLICY behaviour_exclusion_cases_tenant_isolation ON behaviour_exclusion_cases
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_attachments
ALTER TABLE behaviour_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_attachments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_attachments_tenant_isolation ON behaviour_attachments;
CREATE POLICY behaviour_attachments_tenant_isolation ON behaviour_attachments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_interventions
ALTER TABLE behaviour_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_interventions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_interventions_tenant_isolation ON behaviour_interventions;
CREATE POLICY behaviour_interventions_tenant_isolation ON behaviour_interventions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_intervention_incidents
ALTER TABLE behaviour_intervention_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_intervention_incidents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_intervention_incidents_tenant_isolation ON behaviour_intervention_incidents;
CREATE POLICY behaviour_intervention_incidents_tenant_isolation ON behaviour_intervention_incidents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_intervention_reviews
ALTER TABLE behaviour_intervention_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_intervention_reviews FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_intervention_reviews_tenant_isolation ON behaviour_intervention_reviews;
CREATE POLICY behaviour_intervention_reviews_tenant_isolation ON behaviour_intervention_reviews
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_recognition_awards
ALTER TABLE behaviour_recognition_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_recognition_awards FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_recognition_awards_tenant_isolation ON behaviour_recognition_awards;
CREATE POLICY behaviour_recognition_awards_tenant_isolation ON behaviour_recognition_awards
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_award_types
ALTER TABLE behaviour_award_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_award_types FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_award_types_tenant_isolation ON behaviour_award_types;
CREATE POLICY behaviour_award_types_tenant_isolation ON behaviour_award_types
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_house_teams
ALTER TABLE behaviour_house_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_house_teams FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_house_teams_tenant_isolation ON behaviour_house_teams;
CREATE POLICY behaviour_house_teams_tenant_isolation ON behaviour_house_teams
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_house_memberships
ALTER TABLE behaviour_house_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_house_memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_house_memberships_tenant_isolation ON behaviour_house_memberships;
CREATE POLICY behaviour_house_memberships_tenant_isolation ON behaviour_house_memberships
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_policy_rules
ALTER TABLE behaviour_policy_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_policy_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_policy_rules_tenant_isolation ON behaviour_policy_rules;
CREATE POLICY behaviour_policy_rules_tenant_isolation ON behaviour_policy_rules
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_policy_rule_actions
ALTER TABLE behaviour_policy_rule_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_policy_rule_actions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_policy_rule_actions_tenant_isolation ON behaviour_policy_rule_actions;
CREATE POLICY behaviour_policy_rule_actions_tenant_isolation ON behaviour_policy_rule_actions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_policy_rule_versions
ALTER TABLE behaviour_policy_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_policy_rule_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_policy_rule_versions_tenant_isolation ON behaviour_policy_rule_versions;
CREATE POLICY behaviour_policy_rule_versions_tenant_isolation ON behaviour_policy_rule_versions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_policy_evaluations
ALTER TABLE behaviour_policy_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_policy_evaluations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_policy_evaluations_tenant_isolation ON behaviour_policy_evaluations;
CREATE POLICY behaviour_policy_evaluations_tenant_isolation ON behaviour_policy_evaluations
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_policy_action_executions
ALTER TABLE behaviour_policy_action_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_policy_action_executions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_policy_action_executions_tenant_isolation ON behaviour_policy_action_executions;
CREATE POLICY behaviour_policy_action_executions_tenant_isolation ON behaviour_policy_action_executions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_alerts
ALTER TABLE behaviour_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_alerts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_alerts_tenant_isolation ON behaviour_alerts;
CREATE POLICY behaviour_alerts_tenant_isolation ON behaviour_alerts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_alert_recipients
ALTER TABLE behaviour_alert_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_alert_recipients FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_alert_recipients_tenant_isolation ON behaviour_alert_recipients;
CREATE POLICY behaviour_alert_recipients_tenant_isolation ON behaviour_alert_recipients
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_documents
ALTER TABLE behaviour_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_documents_tenant_isolation ON behaviour_documents;
CREATE POLICY behaviour_documents_tenant_isolation ON behaviour_documents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_document_templates
ALTER TABLE behaviour_document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_document_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_document_templates_tenant_isolation ON behaviour_document_templates;
CREATE POLICY behaviour_document_templates_tenant_isolation ON behaviour_document_templates
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_guardian_restrictions
ALTER TABLE behaviour_guardian_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_guardian_restrictions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_guardian_restrictions_tenant_isolation ON behaviour_guardian_restrictions;
CREATE POLICY behaviour_guardian_restrictions_tenant_isolation ON behaviour_guardian_restrictions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_publication_approvals
ALTER TABLE behaviour_publication_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_publication_approvals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_publication_approvals_tenant_isolation ON behaviour_publication_approvals;
CREATE POLICY behaviour_publication_approvals_tenant_isolation ON behaviour_publication_approvals
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_legal_holds
ALTER TABLE behaviour_legal_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_legal_holds FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_legal_holds_tenant_isolation ON behaviour_legal_holds;
CREATE POLICY behaviour_legal_holds_tenant_isolation ON behaviour_legal_holds
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- safeguarding_concerns
ALTER TABLE safeguarding_concerns ENABLE ROW LEVEL SECURITY;
ALTER TABLE safeguarding_concerns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS safeguarding_concerns_tenant_isolation ON safeguarding_concerns;
CREATE POLICY safeguarding_concerns_tenant_isolation ON safeguarding_concerns
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- safeguarding_actions
ALTER TABLE safeguarding_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE safeguarding_actions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS safeguarding_actions_tenant_isolation ON safeguarding_actions;
CREATE POLICY safeguarding_actions_tenant_isolation ON safeguarding_actions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- safeguarding_concern_incidents
ALTER TABLE safeguarding_concern_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE safeguarding_concern_incidents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS safeguarding_concern_incidents_tenant_isolation ON safeguarding_concern_incidents;
CREATE POLICY safeguarding_concern_incidents_tenant_isolation ON safeguarding_concern_incidents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- safeguarding_break_glass_grants
ALTER TABLE safeguarding_break_glass_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE safeguarding_break_glass_grants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS safeguarding_break_glass_grants_tenant_isolation ON safeguarding_break_glass_grants;
CREATE POLICY safeguarding_break_glass_grants_tenant_isolation ON safeguarding_break_glass_grants
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);


-- ─── 2. Updated-at Triggers ────────────────────────────────────────────────────
-- Applied to tables that have an updated_at column.
-- Append-only tables (no updated_at) are intentionally skipped.

DO $$ BEGIN
  -- behaviour_categories
  DROP TRIGGER IF EXISTS trg_behaviour_categories_updated_at ON behaviour_categories;
  CREATE TRIGGER trg_behaviour_categories_updated_at
    BEFORE UPDATE ON behaviour_categories
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- behaviour_incidents
  DROP TRIGGER IF EXISTS trg_behaviour_incidents_updated_at ON behaviour_incidents;
  CREATE TRIGGER trg_behaviour_incidents_updated_at
    BEFORE UPDATE ON behaviour_incidents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- behaviour_sanctions
  DROP TRIGGER IF EXISTS trg_behaviour_sanctions_updated_at ON behaviour_sanctions;
  CREATE TRIGGER trg_behaviour_sanctions_updated_at
    BEFORE UPDATE ON behaviour_sanctions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- behaviour_tasks
  DROP TRIGGER IF EXISTS trg_behaviour_tasks_updated_at ON behaviour_tasks;
  CREATE TRIGGER trg_behaviour_tasks_updated_at
    BEFORE UPDATE ON behaviour_tasks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- behaviour_appeals
  DROP TRIGGER IF EXISTS trg_behaviour_appeals_updated_at ON behaviour_appeals;
  CREATE TRIGGER trg_behaviour_appeals_updated_at
    BEFORE UPDATE ON behaviour_appeals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- behaviour_exclusion_cases
  DROP TRIGGER IF EXISTS trg_behaviour_exclusion_cases_updated_at ON behaviour_exclusion_cases;
  CREATE TRIGGER trg_behaviour_exclusion_cases_updated_at
    BEFORE UPDATE ON behaviour_exclusion_cases
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- behaviour_interventions
  DROP TRIGGER IF EXISTS trg_behaviour_interventions_updated_at ON behaviour_interventions;
  CREATE TRIGGER trg_behaviour_interventions_updated_at
    BEFORE UPDATE ON behaviour_interventions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- behaviour_award_types
  DROP TRIGGER IF EXISTS trg_behaviour_award_types_updated_at ON behaviour_award_types;
  CREATE TRIGGER trg_behaviour_award_types_updated_at
    BEFORE UPDATE ON behaviour_award_types
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- behaviour_house_teams
  DROP TRIGGER IF EXISTS trg_behaviour_house_teams_updated_at ON behaviour_house_teams;
  CREATE TRIGGER trg_behaviour_house_teams_updated_at
    BEFORE UPDATE ON behaviour_house_teams
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- behaviour_policy_rules
  DROP TRIGGER IF EXISTS trg_behaviour_policy_rules_updated_at ON behaviour_policy_rules;
  CREATE TRIGGER trg_behaviour_policy_rules_updated_at
    BEFORE UPDATE ON behaviour_policy_rules
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- behaviour_alerts
  DROP TRIGGER IF EXISTS trg_behaviour_alerts_updated_at ON behaviour_alerts;
  CREATE TRIGGER trg_behaviour_alerts_updated_at
    BEFORE UPDATE ON behaviour_alerts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- behaviour_alert_recipients
  DROP TRIGGER IF EXISTS trg_behaviour_alert_recipients_updated_at ON behaviour_alert_recipients;
  CREATE TRIGGER trg_behaviour_alert_recipients_updated_at
    BEFORE UPDATE ON behaviour_alert_recipients
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- behaviour_document_templates
  DROP TRIGGER IF EXISTS trg_behaviour_document_templates_updated_at ON behaviour_document_templates;
  CREATE TRIGGER trg_behaviour_document_templates_updated_at
    BEFORE UPDATE ON behaviour_document_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- behaviour_guardian_restrictions
  DROP TRIGGER IF EXISTS trg_behaviour_guardian_restrictions_updated_at ON behaviour_guardian_restrictions;
  CREATE TRIGGER trg_behaviour_guardian_restrictions_updated_at
    BEFORE UPDATE ON behaviour_guardian_restrictions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- behaviour_publication_approvals
  DROP TRIGGER IF EXISTS trg_behaviour_publication_approvals_updated_at ON behaviour_publication_approvals;
  CREATE TRIGGER trg_behaviour_publication_approvals_updated_at
    BEFORE UPDATE ON behaviour_publication_approvals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- behaviour_legal_holds
  DROP TRIGGER IF EXISTS trg_behaviour_legal_holds_updated_at ON behaviour_legal_holds;
  CREATE TRIGGER trg_behaviour_legal_holds_updated_at
    BEFORE UPDATE ON behaviour_legal_holds
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- safeguarding_concerns
  DROP TRIGGER IF EXISTS trg_safeguarding_concerns_updated_at ON safeguarding_concerns;
  CREATE TRIGGER trg_safeguarding_concerns_updated_at
    BEFORE UPDATE ON safeguarding_concerns
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  -- behaviour_description_templates
  DROP TRIGGER IF EXISTS trg_behaviour_description_templates_updated_at ON behaviour_description_templates;
  CREATE TRIGGER trg_behaviour_description_templates_updated_at
    BEFORE UPDATE ON behaviour_description_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
END $$;


-- ─── 3. Partial Indexes ────────────────────────────────────────────────────────
-- Indexes that Prisma cannot express natively (partial / conditional).

-- Idempotency partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_behaviour_incidents_idempotency
  ON behaviour_incidents (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Active retention status partial index
CREATE INDEX IF NOT EXISTS idx_behaviour_incidents_active_retention
  ON behaviour_incidents (tenant_id, retention_status)
  WHERE retention_status = 'active';

-- Active legal holds partial index
CREATE INDEX IF NOT EXISTS idx_behaviour_legal_holds_active
  ON behaviour_legal_holds (tenant_id, entity_type, entity_id, status)
  WHERE status = 'active_hold';


-- ─── 4. Materialised Views ─────────────────────────────────────────────────────
-- Schema only, populated WITH NO DATA. Refresh logic handled by the application.

-- Student behaviour summary
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_student_behaviour_summary AS
SELECT
  p.tenant_id,
  p.student_id,
  COUNT(*) FILTER (WHERE i.polarity = 'positive') AS positive_count,
  COUNT(*) FILTER (WHERE i.polarity = 'negative') AS negative_count,
  COUNT(*) FILTER (WHERE i.polarity = 'neutral') AS neutral_count,
  SUM(p.points_awarded) AS total_points,
  MAX(i.occurred_at) AS last_incident_at,
  COUNT(DISTINCT i.category_id) AS unique_categories
FROM behaviour_incident_participants p
JOIN behaviour_incidents i ON i.id = p.incident_id
WHERE p.participant_type = 'student'
  AND p.student_id IS NOT NULL
  AND i.status NOT IN ('draft', 'withdrawn')
  AND i.retention_status = 'active'
GROUP BY p.tenant_id, p.student_id
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_student_behaviour_summary_pk
  ON mv_student_behaviour_summary (tenant_id, student_id);

-- Behaviour benchmarks (ETB)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_behaviour_benchmarks AS
SELECT
  i.tenant_id,
  c.benchmark_category,
  date_trunc('month', i.occurred_at) AS month,
  COUNT(*) AS incident_count,
  COUNT(DISTINCT p.student_id) AS student_count
FROM behaviour_incidents i
JOIN behaviour_categories c ON c.id = i.category_id
JOIN behaviour_incident_participants p ON p.incident_id = i.id AND p.participant_type = 'student'
WHERE i.status NOT IN ('draft', 'withdrawn')
  AND i.retention_status = 'active'
GROUP BY i.tenant_id, c.benchmark_category, date_trunc('month', i.occurred_at)
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_behaviour_benchmarks_pk
  ON mv_behaviour_benchmarks (tenant_id, benchmark_category, month);

-- Exposure rates
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_behaviour_exposure_rates AS
SELECT
  i.tenant_id,
  i.subject_id,
  i.weekday,
  i.period_order,
  COUNT(*) AS incident_count,
  COUNT(DISTINCT p.student_id) AS student_count,
  COUNT(*) FILTER (WHERE i.polarity = 'negative') AS negative_count
FROM behaviour_incidents i
JOIN behaviour_incident_participants p ON p.incident_id = i.id AND p.participant_type = 'student'
WHERE i.status NOT IN ('draft', 'withdrawn')
  AND i.retention_status = 'active'
  AND i.subject_id IS NOT NULL
GROUP BY i.tenant_id, i.subject_id, i.weekday, i.period_order
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_behaviour_exposure_rates_pk
  ON mv_behaviour_exposure_rates (tenant_id, subject_id, weekday, period_order);


-- ─── 5. Domain Boundary Constraint Trigger ──────────────────────────────────────
-- Prevents removal of the last student participant from an incident.

CREATE OR REPLACE FUNCTION prevent_last_student_participant_removal()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.participant_type = 'student' THEN
    IF NOT EXISTS (
      SELECT 1 FROM behaviour_incident_participants
      WHERE incident_id = OLD.incident_id
        AND participant_type = 'student'
        AND id != OLD.id
    ) THEN
      RAISE EXCEPTION 'Cannot remove the last student participant from an incident';
    END IF;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_last_student_participant ON behaviour_incident_participants;
CREATE TRIGGER trg_prevent_last_student_participant
  BEFORE DELETE ON behaviour_incident_participants
  FOR EACH ROW EXECUTE FUNCTION prevent_last_student_participant_removal();
