-- Stage 5 — NHQS seed (curriculum + pool competencies + staff availability)
-- Tenant: 3ba9b02c-0339-49b8-8583-a06e05a32ac5
-- Academic year: 0001b90d-25f1-413d-87d5-2da00ab7168d (2025-2026, active)

\set ON_ERROR_STOP on
\timing on

BEGIN;

SET LOCAL app.current_tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5';

-- ─── PRE-SEED SNAPSHOT ──────────────────────────────────────────────────────

\echo '=== Pre-seed counts ==='
SELECT 'teacher_competencies' AS t, COUNT(*) FROM teacher_competencies WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'
UNION ALL SELECT 'curriculum_requirements', COUNT(*) FROM curriculum_requirements WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'
UNION ALL SELECT 'staff_availability', COUNT(*) FROM staff_availability WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5';

-- ─── A/B. WIPE ──────────────────────────────────────────────────────────────

DELETE FROM teacher_competencies WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5';
DELETE FROM curriculum_requirements WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5';

-- ─── C. CURRICULUM (59 rows) ────────────────────────────────────────────────
-- Periods: core 5, subsidiary 3, Senior infants Geography 4
-- max_periods_per_day = 1, requires_double_period = false

INSERT INTO curriculum_requirements (
  tenant_id, academic_year_id, year_group_id, subject_id,
  min_periods_per_week, max_periods_per_day, preferred_periods_per_week, requires_double_period
)
SELECT
  '3ba9b02c-0339-49b8-8583-a06e05a32ac5'::uuid,
  '0001b90d-25f1-413d-87d5-2da00ab7168d'::uuid,
  yg.id,
  s.id,
  v.periods,
  1,
  v.periods,
  false
FROM (VALUES
  -- Kindergarten
  ('Kindergarten',   'Arabic',      5),
  ('Kindergarten',   'English',     5),
  ('Kindergarten',   'Mathematics', 5),
  -- Junior infants
  ('Junior infants', 'Arabic',      5),
  ('Junior infants', 'English',     5),
  ('Junior infants', 'Mathematics', 5),
  -- Senior infants
  ('Senior infants', 'Arabic',      5),
  ('Senior infants', 'English',     5),
  ('Senior infants', 'Mathematics', 5),
  ('Senior infants', 'Geography',   4),
  -- 1st class
  ('1st class', 'Arabic',      5),
  ('1st class', 'English',     5),
  ('1st class', 'Mathematics', 5),
  ('1st class', 'Biology',     3),
  ('1st class', 'History',     3),
  ('1st class', 'Geography',   3),
  -- 2nd class
  ('2nd class', 'Arabic',      5),
  ('2nd class', 'English',     5),
  ('2nd class', 'Mathematics', 5),
  ('2nd class', 'Biology',     3),
  ('2nd class', 'History',     3),
  ('2nd class', 'Geography',   3),
  -- 3rd Class
  ('3rd Class', 'Arabic',      5),
  ('3rd Class', 'English',     5),
  ('3rd Class', 'Mathematics', 5),
  ('3rd Class', 'Biology',     3),
  ('3rd Class', 'Chemistry',   3),
  ('3rd Class', 'History',     3),
  ('3rd Class', 'Geography',   3),
  -- 4th Class
  ('4th Class', 'Arabic',      5),
  ('4th Class', 'English',     5),
  ('4th Class', 'Mathematics', 5),
  ('4th Class', 'Biology',     3),
  ('4th Class', 'Chemistry',   3),
  ('4th Class', 'Physics',     3),
  ('4th Class', 'History',     3),
  ('4th Class', 'Geography',   3),
  ('4th Class', 'Accounting',  3),
  -- 5th Class
  ('5th Class', 'Arabic',      5),
  ('5th Class', 'English',     5),
  ('5th Class', 'Mathematics', 5),
  ('5th Class', 'Biology',     3),
  ('5th Class', 'Chemistry',   3),
  ('5th Class', 'Physics',     3),
  ('5th Class', 'History',     3),
  ('5th Class', 'Geography',   3),
  ('5th Class', 'Business',    3),
  ('5th Class', 'Economics',   3),
  -- 6th Class
  ('6th Class', 'Arabic',      5),
  ('6th Class', 'English',     5),
  ('6th Class', 'Mathematics', 5),
  ('6th Class', 'Biology',     3),
  ('6th Class', 'Chemistry',   3),
  ('6th Class', 'Physics',     3),
  ('6th Class', 'History',     3),
  ('6th Class', 'Geography',   3),
  ('6th Class', 'Business',    3),
  ('6th Class', 'Economics',   3),
  ('6th Class', 'Accounting',  3)
) AS v(yg_name, subject_name, periods)
JOIN year_groups yg ON yg.tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'::uuid AND yg.name = v.yg_name
JOIN subjects   s  ON s.tenant_id  = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'::uuid AND s.name  = v.subject_name;

-- ─── D. POOL COMPETENCIES (162 rows) ────────────────────────────────────────
-- One row per (teacher, subject, year_group) where subject is in the YG's curriculum.
-- All rows have class_id = NULL (pool entries).

WITH teacher_subjects(teacher_name, subject_name) AS (
  VALUES
    -- Carried forward from existing 122 rows
    ('Sarah Daly',         'Arabic'),
    ('Benjamin Gallagher', 'Arabic'),
    ('William Dunne',      'English'),
    ('Chloe Kennedy',      'English'),
    ('Sarah Daly',         'English'),
    ('Owen Burke',         'Mathematics'),
    ('Lily Healy',         'Mathematics'),
    ('Ahmed Hassan',       'Mathematics'),  -- added: his job_title = 'Mathematics Teacher'
    ('Sarah Daly',         'Mathematics'),
    ('Isabella Doherty',   'Biology'),
    ('Patrick Moran',      'Biology'),
    ('Sarah Daly',         'Biology'),
    ('Ella Farrell',       'Geography'),
    ('Samuel Lynch',       'Geography'),
    ('Jack Murray',        'History'),
    ('Zoe Power',          'History'),
    ('Sarah Daly',         'History'),
    ('Thomas Duffy',       'Chemistry'),
    ('Grace Reilly',       'Chemistry'),
    ('Hannah Barrett',     'Business'),
    ('Henry Quinn',        'Business'),
    ('Sarah Daly',         'Business'),
    -- Newly assigned (from uncovered teachers, user delegated choice)
    ('Daniel Kavanagh',    'Physics'),
    ('Lucas Kelly',        'Physics'),
    ('Sophia Ryan',        'Physics'),
    ('Mia Brennan',        'Accounting'),
    ('Amelia Connolly',    'Accounting'),
    ('James Byrne',        'Economics'),
    ('Ava Doyle',          'Economics')
),
teacher_lookup AS (
  SELECT sp.id AS staff_profile_id, u.first_name || ' ' || u.last_name AS full_name
    FROM staff_profiles sp
    JOIN users u ON u.id = sp.user_id
   WHERE sp.tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'::uuid
)
INSERT INTO teacher_competencies (
  tenant_id, academic_year_id, staff_profile_id, subject_id, year_group_id, class_id
)
SELECT DISTINCT
  '3ba9b02c-0339-49b8-8583-a06e05a32ac5'::uuid,
  '0001b90d-25f1-413d-87d5-2da00ab7168d'::uuid,
  tl.staff_profile_id,
  cr.subject_id,
  cr.year_group_id,
  NULL::uuid
FROM curriculum_requirements cr
JOIN subjects s ON s.id = cr.subject_id
JOIN teacher_subjects ts ON ts.subject_name = s.name
JOIN teacher_lookup tl ON tl.full_name = ts.teacher_name
WHERE cr.tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'::uuid;

-- ─── E. STAFF AVAILABILITY (31 teachers × 5 weekdays = 155 rows) ────────────
-- Mon–Fri (weekday 1..5), 08:00–16:00.
-- 33 staff with role 'teacher'; user requested excluding 'Test Staff' and 'nnbgfdn ngnrtfn'.

-- Need user/membership context for the membership_roles_self_access policy.
-- Use admin role to bypass and supply settings to satisfy SELECT side; the
-- INSERT only writes to staff_availability so those settings don't matter.
SET LOCAL app.current_user_id = '00000000-0000-0000-0000-000000000000';
SET LOCAL app.current_membership_id = '00000000-0000-0000-0000-000000000000';

INSERT INTO staff_availability (
  tenant_id, staff_profile_id, academic_year_id, weekday, available_from, available_to
)
SELECT
  '3ba9b02c-0339-49b8-8583-a06e05a32ac5'::uuid,
  sp.id,
  '0001b90d-25f1-413d-87d5-2da00ab7168d'::uuid,
  d.weekday,
  '08:00'::time,
  '16:00'::time
FROM staff_profiles sp
JOIN users u ON u.id = sp.user_id
JOIN tenant_memberships tm ON tm.user_id = u.id AND tm.tenant_id = sp.tenant_id
JOIN membership_roles mr ON mr.membership_id = tm.id
JOIN roles r ON r.id = mr.role_id
CROSS JOIN (VALUES (1), (2), (3), (4), (5)) AS d(weekday)
WHERE sp.tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'::uuid
  AND sp.employment_status = 'active'
  AND r.role_key = 'teacher'
  AND u.first_name || ' ' || u.last_name NOT IN ('Test Staff', 'nnbgfdn ngnrtfn');

-- ─── F. VERIFICATION (must pass before COMMIT) ──────────────────────────────

\echo '=== Post-insert counts ==='
SELECT 'teacher_competencies' AS t, COUNT(*) FROM teacher_competencies WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'
UNION ALL SELECT 'curriculum_requirements', COUNT(*) FROM curriculum_requirements WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'
UNION ALL SELECT 'staff_availability', COUNT(*) FROM staff_availability WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5';

\echo '=== Curriculum per year group ==='
SELECT yg.display_order, yg.name AS year_group, COUNT(*) AS subjects
  FROM curriculum_requirements cr
  JOIN year_groups yg ON yg.id = cr.year_group_id
 WHERE cr.tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'
 GROUP BY yg.display_order, yg.name
 ORDER BY yg.display_order;

\echo '=== Per-subject teacher pool across all year groups ==='
SELECT s.name AS subject, yg.name AS year_group, COUNT(DISTINCT tc.staff_profile_id) AS pool_teachers
  FROM teacher_competencies tc
  JOIN subjects s ON s.id = tc.subject_id
  JOIN year_groups yg ON yg.id = tc.year_group_id
 WHERE tc.tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'
 GROUP BY s.name, yg.display_order, yg.name
 ORDER BY yg.display_order, s.name;

\echo '=== Curriculum entries with no pool teacher (must be empty) ==='
SELECT yg.name AS year_group, s.name AS subject
  FROM curriculum_requirements cr
  JOIN subjects s ON s.id = cr.subject_id
  JOIN year_groups yg ON yg.id = cr.year_group_id
 WHERE cr.tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'
   AND NOT EXISTS (
     SELECT 1 FROM teacher_competencies tc
      WHERE tc.tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'
        AND tc.subject_id = cr.subject_id
        AND tc.year_group_id = cr.year_group_id
   );

-- Hard assertions: any row count surprise aborts the transaction.
DO $$
DECLARE
  curriculum_n INT;
  competency_n INT;
  availability_n INT;
  uncovered_n INT;
BEGIN
  SELECT COUNT(*) INTO curriculum_n   FROM curriculum_requirements WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5';
  SELECT COUNT(*) INTO competency_n   FROM teacher_competencies   WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5';
  SELECT COUNT(*) INTO availability_n FROM staff_availability     WHERE tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5';

  IF curriculum_n <> 59 THEN
    RAISE EXCEPTION 'Expected 59 curriculum rows, got %', curriculum_n;
  END IF;

  IF availability_n <> 155 THEN
    RAISE EXCEPTION 'Expected 155 availability rows (31 teachers × 5 weekdays), got %', availability_n;
  END IF;

  IF competency_n < 100 THEN
    RAISE EXCEPTION 'Expected >=100 competency rows, got %', competency_n;
  END IF;

  SELECT COUNT(*) INTO uncovered_n
    FROM curriculum_requirements cr
   WHERE cr.tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'
     AND NOT EXISTS (
       SELECT 1 FROM teacher_competencies tc
        WHERE tc.tenant_id = '3ba9b02c-0339-49b8-8583-a06e05a32ac5'
          AND tc.subject_id = cr.subject_id
          AND tc.year_group_id = cr.year_group_id
     );
  IF uncovered_n > 0 THEN
    RAISE EXCEPTION 'Found % curriculum entries with no pool teacher', uncovered_n;
  END IF;

  RAISE NOTICE 'Stage 5 seed verified: % curriculum, % competencies, % availability, 0 uncovered.',
    curriculum_n, competency_n, availability_n;
END $$;

COMMIT;
