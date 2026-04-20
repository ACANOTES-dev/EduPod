-- Wellbeing Rebuild — Implementation 01: Schema Foundation + Default Seeds
--
-- Introduces the four objects every later wave reads against:
--
--   1. tenant_ai_flags                   — per-module AI feature gate
--   2. tenant_notification_preferences   — wellbeing notification channel prefs
--   3. behaviour_categories (+3 cols)    — parent-ack, pastoral, safeguarding flags
--   4. Permissions + role grants         — ai_flag.manage, wellbeing.view_dashboard,
--                                          safeguarding.dedicated_view,
--                                          wellbeing_notifications.configure
--
-- Plus idempotent data seeds for every existing tenant:
--   - 4 tenant_ai_flags rows (one per module, enabled=false)
--   - 28 default behaviour_categories ONLY when the tenant has zero
--   - 1 tenant_notification_preferences row with default channel prefs
--   - role_permission grants for the 4 new permissions on existing system roles
--
-- RLS policies for the two new tables live in post_migrate.sql alongside.
--
-- See wellbeing_new/implementations/01-schema-foundation.md for rationale.

-- ─── tenant_ai_flags ────────────────────────────────────────────────────────

CREATE TABLE "tenant_ai_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "module_key" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_by" UUID,

    CONSTRAINT "tenant_ai_flags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_tenant_ai_flags_tenant_module"
    ON "tenant_ai_flags"("tenant_id", "module_key");

CREATE INDEX "idx_tenant_ai_flags_tenant"
    ON "tenant_ai_flags"("tenant_id");

ALTER TABLE "tenant_ai_flags"
    ADD CONSTRAINT "tenant_ai_flags_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- ─── tenant_notification_preferences ────────────────────────────────────────

CREATE TABLE "tenant_notification_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "wellbeing_channels" JSONB NOT NULL DEFAULT '{"defaults": {"email": false, "sms": false, "whatsapp": false}, "overrides": {}}',
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "tenant_notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_notification_preferences_tenant_id_key"
    ON "tenant_notification_preferences"("tenant_id");

CREATE INDEX "idx_tenant_notification_preferences_tenant"
    ON "tenant_notification_preferences"("tenant_id");

ALTER TABLE "tenant_notification_preferences"
    ADD CONSTRAINT "tenant_notification_preferences_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- ─── behaviour_categories — new flag columns ───────────────────────────────
--
-- Wellbeing rebuild adds three category-level flags: whether the category
-- requires parent acknowledgement (distinct from notification — ack is the
-- parent confirming receipt), whether logging an incident under it should
-- auto-create a pastoral concern, and whether it should convert into a
-- safeguarding concern by default. Existing 12-category seed stays as-is
-- (all three flags default false). The new 28-category seed below uses
-- these flags for the negative-moderate and negative-major tiers.

ALTER TABLE "behaviour_categories"
    ADD COLUMN "requires_parent_ack" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "auto_create_pastoral_concern" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "converts_to_safeguarding" BOOLEAN NOT NULL DEFAULT false;

-- ─── Default wellbeing permission catalogue ─────────────────────────────────

INSERT INTO "permissions" ("id", "permission_key", "description", "permission_tier")
VALUES
    (gen_random_uuid(), 'ai_flag.manage', 'Manage tenant-level AI feature flags', 'admin'),
    (gen_random_uuid(), 'wellbeing.view_dashboard', 'View the wellbeing super-hub dashboard', 'staff'),
    (gen_random_uuid(), 'safeguarding.dedicated_view', 'Access the dedicated safeguarding sub-hub', 'admin'),
    (gen_random_uuid(), 'wellbeing_notifications.configure', 'Configure wellbeing notification channel preferences', 'admin')
ON CONFLICT ("permission_key") DO NOTHING;

-- ─── Seed tenant_ai_flags for every existing tenant ─────────────────────────

INSERT INTO "tenant_ai_flags" ("id", "tenant_id", "module_key", "enabled", "updated_at")
SELECT gen_random_uuid(), t.id, m.module_key, false, now()
FROM "tenants" t
CROSS JOIN (
    VALUES ('behaviour'), ('pastoral'), ('staff_wellbeing'), ('early_warning')
) AS m(module_key)
ON CONFLICT ("tenant_id", "module_key") DO NOTHING;

-- ─── Seed tenant_notification_preferences ───────────────────────────────────

INSERT INTO "tenant_notification_preferences" ("id", "tenant_id", "wellbeing_channels", "updated_at")
SELECT gen_random_uuid(), t.id,
    '{"defaults": {"email": false, "sms": false, "whatsapp": false}, "overrides": {}}'::jsonb,
    now()
FROM "tenants" t
ON CONFLICT ("tenant_id") DO NOTHING;

-- ─── Seed 28 default behaviour categories (only for tenants with zero) ──────
--
-- The existing behaviour-seed.ts runs at tenant creation and creates 12
-- sanction-outcome categories (Praise, Verbal Warning, Detention, ...).
-- Those rely on policy-rule references by name, so we do NOT touch them.
--
-- The 28-category seed lands in tenants that would otherwise have ZERO
-- categories configured (e.g. historical data-migrated tenants). The
-- WHERE NOT EXISTS guard makes this idempotent and safe to re-run.
--
-- Polarity + severity mapping:
--   positive minor (1pt) → severity 1, benchmark 'minor_positive'
--   positive moderate (3pt) → severity 3, benchmark 'merit'
--   positive major (5pt) → severity 5, benchmark 'major_positive'
--   negative minor (1pt) → severity 2, benchmark 'verbal_warning'
--   negative moderate (3pt) → severity 4, benchmark 'written_warning'
--   negative major (5pt) → severity 7, benchmark 'external_suspension'

INSERT INTO "behaviour_categories" (
    "id", "tenant_id", "name", "name_ar", "polarity", "severity", "point_value",
    "color", "icon", "requires_follow_up", "requires_parent_notification",
    "requires_parent_ack", "auto_create_pastoral_concern", "converts_to_safeguarding",
    "parent_visible", "benchmark_category", "display_order",
    "is_active", "is_system", "created_at", "updated_at"
)
SELECT
    gen_random_uuid(), t.id, c.name, c.name_ar,
    c.polarity::"BehaviourPolarity", c.severity, c.point_value,
    c.color, c.icon, c.requires_follow_up, c.requires_parent_notification,
    c.requires_parent_ack, c.auto_create_pastoral_concern, c.converts_to_safeguarding,
    c.parent_visible, c.benchmark_category::"BenchmarkCategory", c.display_order,
    true, true, now(), now()
FROM "tenants" t
CROSS JOIN (VALUES
    -- ─── Negative — minor (severity 2, 1 pt) ─────────────────────────────
    ('Lateness', 'التأخر', 'negative', 2, 1, '#f59e0b', 'clock', false, false, false, false, false, true, 'verbal_warning', 100),
    ('Uniform infringement', 'مخالفة الزي', 'negative', 2, 1, '#f59e0b', 'shirt', false, false, false, false, false, true, 'verbal_warning', 101),
    ('Phone use', 'استخدام الهاتف', 'negative', 2, 1, '#f59e0b', 'smartphone', false, false, false, false, false, true, 'verbal_warning', 102),
    ('Out of bounds', 'خارج الحدود', 'negative', 2, 1, '#f59e0b', 'map-pin-off', false, false, false, false, false, true, 'verbal_warning', 103),
    ('Disruption (low)', 'إزعاج بسيط', 'negative', 2, 1, '#f59e0b', 'volume-2', false, false, false, false, false, true, 'verbal_warning', 104),
    ('Missed homework', 'واجب منزلي ناقص', 'negative', 2, 1, '#f59e0b', 'book-x', false, false, false, false, false, true, 'verbal_warning', 105),
    ('Disrespect (low)', 'عدم احترام بسيط', 'negative', 2, 1, '#f59e0b', 'alert-circle', false, true, false, false, false, true, 'verbal_warning', 106),
    -- ─── Negative — moderate (severity 4, 3 pt) ──────────────────────────
    ('Disruption (sustained)', 'إزعاج مستمر', 'negative', 4, 3, '#f97316', 'alert-octagon', true, true, true, false, false, true, 'written_warning', 200),
    ('Defiance', 'تحدٍّ', 'negative', 4, 3, '#f97316', 'x', true, true, true, false, false, true, 'written_warning', 201),
    ('Bullying (verbal)', 'تنمر لفظي', 'negative', 4, 3, '#f97316', 'message-square-x', true, true, true, true, false, true, 'written_warning', 202),
    ('Lying / dishonesty', 'كذب', 'negative', 4, 3, '#f97316', 'eye-off', false, true, true, false, false, true, 'written_warning', 203),
    ('Damage to property (minor)', 'إتلاف ممتلكات', 'negative', 4, 3, '#f97316', 'hammer', true, true, true, false, false, true, 'written_warning', 204),
    ('Inappropriate language', 'لغة غير لائقة', 'negative', 4, 3, '#f97316', 'message-circle-warning', false, true, true, false, false, true, 'written_warning', 205),
    -- ─── Negative — major (severity 7, 5 pt) ─────────────────────────────
    ('Bullying (physical/cyber)', 'تنمر جسدي أو إلكتروني', 'negative', 7, 5, '#dc2626', 'shield-alert', true, true, true, true, true, true, 'external_suspension', 300),
    ('Theft', 'سرقة', 'negative', 7, 5, '#dc2626', 'alert-triangle', true, true, true, true, false, true, 'external_suspension', 301),
    ('Fighting', 'عراك', 'negative', 7, 5, '#dc2626', 'swords', true, true, true, true, false, true, 'external_suspension', 302),
    ('Drug-related concern', 'مخاوف متعلقة بالمخدرات', 'negative', 7, 5, '#dc2626', 'pill-bottle', true, true, true, true, true, true, 'external_suspension', 303),
    ('Major property damage', 'إتلاف كبير للممتلكات', 'negative', 7, 5, '#dc2626', 'alert-octagon', true, true, true, true, false, true, 'external_suspension', 304),
    ('Discrimination / harassment', 'تمييز أو تحرش', 'negative', 7, 5, '#dc2626', 'user-x', true, true, true, true, true, true, 'external_suspension', 305),
    ('Weapons-related concern', 'مخاوف متعلقة بالأسلحة', 'negative', 7, 5, '#dc2626', 'alert-triangle', true, true, true, true, true, true, 'external_suspension', 306),
    -- ─── Positive — minor (severity 1, 1 pt) ─────────────────────────────
    ('Effort', 'جهد', 'positive', 1, 1, '#22c55e', 'sparkles', false, false, false, false, false, true, 'minor_positive', 400),
    ('Helpfulness', 'تعاون', 'positive', 1, 1, '#22c55e', 'hand-helping', false, false, false, false, false, true, 'minor_positive', 401),
    ('Punctuality', 'التزام بالوقت', 'positive', 1, 1, '#22c55e', 'clock', false, false, false, false, false, true, 'minor_positive', 402),
    ('Participation', 'مشاركة', 'positive', 1, 1, '#22c55e', 'hand', false, false, false, false, false, true, 'minor_positive', 403),
    -- ─── Positive — moderate (severity 3, 3 pt) ──────────────────────────
    ('Outstanding work', 'عمل متميز', 'positive', 3, 3, '#16a34a', 'star', false, false, false, false, false, true, 'merit', 500),
    ('Leadership', 'قيادة', 'positive', 3, 3, '#16a34a', 'crown', false, false, false, false, false, true, 'merit', 501),
    ('Kindness', 'لطف', 'positive', 3, 3, '#16a34a', 'heart', false, false, false, false, false, true, 'merit', 502),
    ('Improvement', 'تحسن', 'positive', 3, 3, '#16a34a', 'trending-up', false, false, false, false, false, true, 'merit', 503),
    -- ─── Positive — major (severity 5, 5 pt) ─────────────────────────────
    ('Exceptional achievement', 'إنجاز استثنائي', 'positive', 5, 5, '#059669', 'trophy', false, true, false, false, false, true, 'major_positive', 600),
    ('Acts of integrity', 'نزاهة', 'positive', 5, 5, '#059669', 'shield', false, true, false, false, false, true, 'major_positive', 601),
    ('Community contribution', 'مساهمة مجتمعية', 'positive', 5, 5, '#059669', 'users', false, true, false, false, false, true, 'major_positive', 602)
) AS c(
    "name", "name_ar", "polarity", "severity", "point_value",
    "color", "icon", "requires_follow_up", "requires_parent_notification",
    "requires_parent_ack", "auto_create_pastoral_concern", "converts_to_safeguarding",
    "parent_visible", "benchmark_category", "display_order"
)
WHERE NOT EXISTS (
    SELECT 1 FROM "behaviour_categories" bc WHERE bc.tenant_id = t.id
);

-- ─── Backfill role_permissions for the 4 new permissions ────────────────────
--
-- Existing tenants' system roles need the new grants so that when the
-- Wave 5 UI ships, Owner/Principal/VP can already see it. New tenants
-- get these via SYSTEM_ROLE_PERMISSIONS in tenants.service.ts.
--
-- NOTE: designated_safeguarding_lead role does not yet exist in
-- TENANT_SYSTEM_ROLES — when it's added, a later migration must grant
-- safeguarding.dedicated_view to it.

-- ai_flag.manage → school_owner + school_principal
INSERT INTO "role_permissions" ("role_id", "permission_id", "tenant_id")
SELECT r.id, p.id, r.tenant_id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.is_system_role = true
  AND r.tenant_id IS NOT NULL
  AND r.role_key IN ('school_owner', 'school_principal')
  AND p.permission_key = 'ai_flag.manage'
  AND NOT EXISTS (
      SELECT 1 FROM "role_permissions" rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- wellbeing_notifications.configure → school_owner + school_principal
INSERT INTO "role_permissions" ("role_id", "permission_id", "tenant_id")
SELECT r.id, p.id, r.tenant_id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.is_system_role = true
  AND r.tenant_id IS NOT NULL
  AND r.role_key IN ('school_owner', 'school_principal')
  AND p.permission_key = 'wellbeing_notifications.configure'
  AND NOT EXISTS (
      SELECT 1 FROM "role_permissions" rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- safeguarding.dedicated_view → school_owner + school_principal + school_vice_principal
INSERT INTO "role_permissions" ("role_id", "permission_id", "tenant_id")
SELECT r.id, p.id, r.tenant_id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.is_system_role = true
  AND r.tenant_id IS NOT NULL
  AND r.role_key IN ('school_owner', 'school_principal', 'school_vice_principal')
  AND p.permission_key = 'safeguarding.dedicated_view'
  AND NOT EXISTS (
      SELECT 1 FROM "role_permissions" rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- wellbeing.view_dashboard → every staff-tier system role
INSERT INTO "role_permissions" ("role_id", "permission_id", "tenant_id")
SELECT r.id, p.id, r.tenant_id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.is_system_role = true
  AND r.tenant_id IS NOT NULL
  AND r.role_key IN (
      'school_owner', 'school_principal', 'school_vice_principal',
      'admin', 'teacher', 'front_office', 'accounting', 'attendance_officer'
  )
  AND p.permission_key = 'wellbeing.view_dashboard'
  AND NOT EXISTS (
      SELECT 1 FROM "role_permissions" rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
