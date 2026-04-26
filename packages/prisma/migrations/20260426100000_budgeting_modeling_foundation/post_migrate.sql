-- Budgeting & Analysis ("Modeling") Rebuild — Impl 01 post-migrate
--
-- RLS policies for the nine new tenant-scoped tables. Idempotent. DROP
-- POLICY IF EXISTS + CREATE POLICY.
--
-- Mirrored into packages/prisma/rls/policies.sql (the canonical catalogue).
-- See modeling/implementations/01-schema-foundation.md.

-- ─── financial_models ─────────────────────────────────────────────────────

ALTER TABLE financial_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_models FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_models_tenant_isolation ON financial_models;
CREATE POLICY financial_models_tenant_isolation ON financial_models
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── scenarios ────────────────────────────────────────────────────────────

ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenarios FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scenarios_tenant_isolation ON scenarios;
CREATE POLICY scenarios_tenant_isolation ON scenarios
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── financial_model_line_items ──────────────────────────────────────────

ALTER TABLE financial_model_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_model_line_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_model_line_items_tenant_isolation ON financial_model_line_items;
CREATE POLICY financial_model_line_items_tenant_isolation ON financial_model_line_items
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── financial_model_snapshots ───────────────────────────────────────────

ALTER TABLE financial_model_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_model_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_model_snapshots_tenant_isolation ON financial_model_snapshots;
CREATE POLICY financial_model_snapshots_tenant_isolation ON financial_model_snapshots
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── event_budgets ───────────────────────────────────────────────────────

ALTER TABLE event_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_budgets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_budgets_tenant_isolation ON event_budgets;
CREATE POLICY event_budgets_tenant_isolation ON event_budgets
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── event_budget_scenarios ──────────────────────────────────────────────

ALTER TABLE event_budget_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_budget_scenarios FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_budget_scenarios_tenant_isolation ON event_budget_scenarios;
CREATE POLICY event_budget_scenarios_tenant_isolation ON event_budget_scenarios
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── variance_cache ──────────────────────────────────────────────────────

ALTER TABLE variance_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE variance_cache FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS variance_cache_tenant_isolation ON variance_cache;
CREATE POLICY variance_cache_tenant_isolation ON variance_cache
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── shareable_links ─────────────────────────────────────────────────────

ALTER TABLE shareable_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE shareable_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shareable_links_tenant_isolation ON shareable_links;
CREATE POLICY shareable_links_tenant_isolation ON shareable_links
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── budgeting_tenant_preferences ────────────────────────────────────────

ALTER TABLE budgeting_tenant_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgeting_tenant_preferences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS budgeting_tenant_preferences_tenant_isolation ON budgeting_tenant_preferences;
CREATE POLICY budgeting_tenant_preferences_tenant_isolation ON budgeting_tenant_preferences
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
