-- Reports rebuild — impl 10: AI Narration cost tracking.
--
-- Adds `cost_usd_estimate` to `ai_processing_logs` so every AI call (across
-- every feature, not just reports narration) records its estimated USD cost
-- alongside the existing audit metadata. Tenants opt into AI features
-- (`tenant_ai_flags.enabled = true`) and absorb the Anthropic spend; the
-- column lets us report a per-tenant per-month total via a simple `sum()`
-- without rebuilding the audit pipeline.
--
-- NULL is permitted — older rows pre-dating impl 10 have no cost recorded,
-- and call sites that fail to estimate (e.g. tests, errors before the API
-- response is parsed) leave the column NULL rather than 0 to make the gap
-- queryable.
ALTER TABLE ai_processing_logs
  ADD COLUMN cost_usd_estimate NUMERIC(10, 6);

COMMENT ON COLUMN ai_processing_logs.cost_usd_estimate IS
  'Estimated USD cost of this AI call computed from input/output token counts and the Anthropic price sheet at call time. NULL when the call did not return token counts (cache hit or pre-impl-10 row).';
