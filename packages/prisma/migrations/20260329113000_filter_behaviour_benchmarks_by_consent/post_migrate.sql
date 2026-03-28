DROP MATERIALIZED VIEW IF EXISTS mv_behaviour_benchmarks CASCADE;

CREATE MATERIALIZED VIEW mv_behaviour_benchmarks AS
SELECT
  bi.tenant_id,
  bi.academic_year_id,
  bi.academic_period_id,
  bc.benchmark_category,
  COUNT(DISTINCT bi_p.student_id) AS student_count,
  COUNT(DISTINCT bi.id) AS incident_count,
  ROUND(
    COUNT(DISTINCT bi.id)::numeric
      / NULLIF(COUNT(DISTINCT bi_p.student_id), 0)
      * 100,
    2
  ) AS rate_per_100,
  now() AS computed_at
FROM behaviour_incidents bi
JOIN behaviour_categories bc
  ON bc.id = bi.category_id
  AND bc.tenant_id = bi.tenant_id
JOIN behaviour_incident_participants bi_p
  ON bi_p.incident_id = bi.id
  AND bi_p.tenant_id = bi.tenant_id
JOIN consent_records cr
  ON cr.tenant_id = bi.tenant_id
  AND cr.subject_type = 'student'
  AND cr.subject_id = bi_p.student_id
  AND cr.consent_type = 'cross_school_benchmarking'
  AND cr.status = 'granted'
WHERE bi.status NOT IN ('withdrawn', 'converted_to_safeguarding')
  AND bi.retention_status = 'active'
  AND bi_p.participant_type = 'student'
  AND bi.academic_period_id IS NOT NULL
GROUP BY bi.tenant_id, bi.academic_year_id, bi.academic_period_id, bc.benchmark_category
HAVING COUNT(DISTINCT bi_p.student_id) >= COALESCE(
  (
    SELECT (ts.settings->'behaviour'->>'benchmark_min_cohort_size')::int
    FROM tenant_settings ts
    WHERE ts.tenant_id = bi.tenant_id
  ),
  10
)
WITH DATA;

CREATE UNIQUE INDEX uq_mv_behaviour_benchmarks
  ON mv_behaviour_benchmarks (
    tenant_id,
    academic_year_id,
    academic_period_id,
    benchmark_category
  );

CREATE INDEX idx_mv_behaviour_benchmarks_tenant
  ON mv_behaviour_benchmarks (tenant_id);
