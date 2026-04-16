-- Bump every existing tenant's scheduling.maxSolverDurationSeconds to 3600
-- to match the new schema default (tenant.schema.ts:147). Ceiling was raised
-- to 3600 in Stage 9.5.1 §D but the default stayed at 120, leaving the
-- 1-hour headroom unused in practice. EarlyStopCallback halts CP-SAT at
-- convergence so a 3600 ceiling does NOT mean 3600 s of wall time for
-- easy inputs — only hard ones use more.
--
-- Idempotent: a tenant whose scheduling subtree is missing gets it created;
-- a tenant whose value is already 3600 (or anything else) is overwritten to
-- 3600. We deliberately do not preserve non-default custom values here —
-- the requirement is "bring all existing tenants in line with the new
-- default", so overwriting is intentional.

UPDATE tenant_settings
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{scheduling}',
  COALESCE(settings->'scheduling', '{}'::jsonb) || '{"maxSolverDurationSeconds": 3600}'::jsonb,
  true
);
