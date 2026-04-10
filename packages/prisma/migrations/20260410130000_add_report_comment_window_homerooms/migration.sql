-- ============================================================
-- Window-scoped homeroom teacher assignment
-- ============================================================
--
-- Round-2 QA design change. Overall comments used to require
-- `classes.homeroom_teacher_staff_id` to be set, which forced admins to
-- DB-patch the column whenever they wanted a teacher to write overall
-- comments for a class. The new design moves the assignment onto the
-- comment window itself: when an admin opens a window, they pick a
-- homeroom teacher per class. Different classes can have different
-- teachers; the same teacher can cover multiple classes; classes the
-- admin doesn't assign simply skip the overall-comment slot for that
-- window. No write-back to `classes.homeroom_teacher_staff_id` — that
-- column is left intact for non-report-card uses but is no longer
-- consulted by the report-cards code path.
--
-- This migration:
--   1. Creates `report_comment_window_homerooms`
--   2. Adds the standard tenant-isolation RLS policy
--   3. Backfills rows for every existing window using
--      `classes.homeroom_teacher_staff_id` so in-flight windows keep
--      working without code-side fallbacks.

CREATE TABLE report_comment_window_homerooms (
  id                          UUID         NOT NULL DEFAULT gen_random_uuid(),
  tenant_id                   UUID         NOT NULL,
  comment_window_id           UUID         NOT NULL,
  class_id                    UUID         NOT NULL,
  homeroom_teacher_staff_id   UUID         NOT NULL,
  created_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT report_comment_window_homerooms_pkey PRIMARY KEY (id),
  CONSTRAINT report_comment_window_homerooms_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT report_comment_window_homerooms_window_fk
    FOREIGN KEY (comment_window_id) REFERENCES report_comment_windows(id) ON DELETE CASCADE,
  CONSTRAINT report_comment_window_homerooms_class_fk
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT report_comment_window_homerooms_staff_fk
    FOREIGN KEY (homeroom_teacher_staff_id) REFERENCES staff_profiles(id) ON DELETE RESTRICT
);

-- One homeroom teacher per (window, class). Re-opening / re-picking a
-- class on the same window is an upsert, not a duplicate.
CREATE UNIQUE INDEX idx_report_comment_window_homerooms_window_class
  ON report_comment_window_homerooms (comment_window_id, class_id);

-- The hot path is "what classes is this staff member homeroom for in
-- the open window?" — used by the teacher landing page to render the
-- overall-comments cards. Tenant + staff makes that an index seek.
CREATE INDEX idx_report_comment_window_homerooms_tenant_staff
  ON report_comment_window_homerooms (tenant_id, homeroom_teacher_staff_id);

-- Backfill existing windows from the legacy class column. We insert one
-- row per (window, class) pair where the class has a homeroom assigned,
-- so historical comment windows keep authorising the same teachers
-- after this migration lands. ON CONFLICT DO NOTHING because the
-- migration is idempotent in dev / staging where partial state may
-- already exist.
INSERT INTO report_comment_window_homerooms
  (tenant_id, comment_window_id, class_id, homeroom_teacher_staff_id)
SELECT
  c.tenant_id,
  w.id,
  c.id,
  c.homeroom_teacher_staff_id
FROM report_comment_windows w
JOIN classes c
  ON c.tenant_id = w.tenant_id
 AND c.academic_year_id = w.academic_year_id
 AND c.homeroom_teacher_staff_id IS NOT NULL
ON CONFLICT (comment_window_id, class_id) DO NOTHING;
