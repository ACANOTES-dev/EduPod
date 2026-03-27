-- Phase F: Upgrade behaviour materialised views to full spec definitions.
-- These views were created as stubs (WITH NO DATA) in Phase A.
-- Now we DROP and recreate with full business logic.

-- ─── 1. Student Behaviour Summary (upgraded) ──────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS mv_student_behaviour_summary CASCADE;

CREATE MATERIALIZED VIEW mv_student_behaviour_summary AS
SELECT
  bi_p.tenant_id,
  bi_p.student_id,
  bi.academic_year_id,
  COUNT(*) FILTER (
    WHERE bi.polarity = 'positive'
    AND bi.status NOT IN ('withdrawn', 'converted_to_safeguarding')
    AND bi.retention_status = 'active'
  ) AS positive_count,
  COUNT(*) FILTER (
    WHERE bi.polarity = 'negative'
    AND bi.status NOT IN ('withdrawn', 'converted_to_safeguarding')
    AND bi.retention_status = 'active'
  ) AS negative_count,
  COUNT(*) FILTER (
    WHERE bi.polarity = 'neutral'
    AND bi.status NOT IN ('withdrawn', 'converted_to_safeguarding')
    AND bi.retention_status = 'active'
  ) AS neutral_count,
  COALESCE(SUM(bi_p.points_awarded) FILTER (
    WHERE bi.status NOT IN ('withdrawn', 'converted_to_safeguarding')
    AND bi.retention_status = 'active'
  ), 0) AS total_points,
  ROUND(
    CASE WHEN COUNT(*) FILTER (
      WHERE bi.polarity IN ('positive','negative')
      AND bi.status NOT IN ('withdrawn', 'converted_to_safeguarding')
      AND bi.retention_status = 'active'
    ) > 0
    THEN COUNT(*) FILTER (
      WHERE bi.polarity = 'positive'
      AND bi.status NOT IN ('withdrawn', 'converted_to_safeguarding')
      AND bi.retention_status = 'active'
    )::numeric
    / COUNT(*) FILTER (
      WHERE bi.polarity IN ('positive','negative')
      AND bi.status NOT IN ('withdrawn', 'converted_to_safeguarding')
      AND bi.retention_status = 'active'
    )::numeric
    ELSE NULL
    END, 4
  ) AS positive_ratio,
  MAX(bi.occurred_at) FILTER (
    WHERE bi.status NOT IN ('withdrawn', 'converted_to_safeguarding')
    AND bi.retention_status = 'active'
  ) AS last_incident_at,
  now() AS computed_at
FROM behaviour_incident_participants bi_p
JOIN behaviour_incidents bi ON bi.id = bi_p.incident_id
  AND bi.tenant_id = bi_p.tenant_id
WHERE bi_p.participant_type = 'student'
  AND bi_p.student_id IS NOT NULL
GROUP BY bi_p.tenant_id, bi_p.student_id, bi.academic_year_id
WITH DATA;

-- Required unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX uq_mv_student_behaviour_summary
  ON mv_student_behaviour_summary (tenant_id, student_id, academic_year_id);

-- Query index
CREATE INDEX idx_mv_student_behaviour_summary_tenant_year
  ON mv_student_behaviour_summary (tenant_id, academic_year_id);


-- ─── 2. Behaviour Benchmarks — ETB (upgraded) ─────────────────────────────

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
      * 100, 2
  ) AS rate_per_100,
  now() AS computed_at
FROM behaviour_incidents bi
JOIN behaviour_categories bc ON bc.id = bi.category_id AND bc.tenant_id = bi.tenant_id
JOIN behaviour_incident_participants bi_p
  ON bi_p.incident_id = bi.id AND bi_p.tenant_id = bi.tenant_id
WHERE bi.status NOT IN ('withdrawn', 'converted_to_safeguarding')
  AND bi.retention_status = 'active'
  AND bi_p.participant_type = 'student'
  AND bi.academic_period_id IS NOT NULL
GROUP BY bi.tenant_id, bi.academic_year_id, bi.academic_period_id, bc.benchmark_category
WITH DATA;

CREATE UNIQUE INDEX uq_mv_behaviour_benchmarks
  ON mv_behaviour_benchmarks (tenant_id, academic_year_id, academic_period_id, benchmark_category);

CREATE INDEX idx_mv_behaviour_benchmarks_tenant
  ON mv_behaviour_benchmarks (tenant_id);


-- ─── 3. Exposure Rates (upgraded) ─────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS mv_behaviour_exposure_rates CASCADE;

CREATE MATERIALIZED VIEW mv_behaviour_exposure_rates AS
SELECT
  s.tenant_id,
  c.academic_year_id,
  ap.id AS academic_period_id,
  ap.start_date AS effective_from,
  ap.end_date AS effective_until,
  c.subject_id,
  s.teacher_staff_id AS staff_id,
  c.year_group_id,
  'class'::text AS context_type,
  COUNT(DISTINCT s.id) AS total_teaching_periods,
  COUNT(DISTINCT ce.student_id) AS total_students,
  now() AS computed_at
FROM schedules s
JOIN classes c ON c.id = s.class_id AND c.tenant_id = s.tenant_id
JOIN academic_periods ap
  ON ap.academic_year_id = c.academic_year_id
  AND ap.tenant_id = s.tenant_id
  AND s.effective_start_date <= ap.end_date
  AND (s.effective_end_date IS NULL OR s.effective_end_date >= ap.start_date)
LEFT JOIN class_enrolments ce
  ON ce.class_id = c.id
  AND ce.tenant_id = s.tenant_id
  AND ce.status = 'active'
WHERE c.subject_id IS NOT NULL
GROUP BY
  s.tenant_id,
  c.academic_year_id,
  ap.id,
  ap.start_date,
  ap.end_date,
  c.subject_id,
  s.teacher_staff_id,
  c.year_group_id
WITH DATA;

CREATE UNIQUE INDEX uq_mv_behaviour_exposure_rates
  ON mv_behaviour_exposure_rates (
    tenant_id,
    academic_period_id,
    COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'),
    COALESCE(staff_id, '00000000-0000-0000-0000-000000000000'),
    COALESCE(year_group_id, '00000000-0000-0000-0000-000000000000')
  );

CREATE INDEX idx_mv_behaviour_exposure_rates_tenant_period
  ON mv_behaviour_exposure_rates (tenant_id, academic_period_id);
