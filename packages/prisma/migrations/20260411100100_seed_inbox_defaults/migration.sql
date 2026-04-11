-- ============================================================
-- New Inbox — Seed Defaults for Existing Tenants (Wave 1 / Impl 01)
-- ============================================================
--
-- Embeds the same defaults that packages/prisma/src/inbox-defaults.ts seeds
-- at tenant-creation time, so that the previous migration leaves every
-- existing tenant in production fully configured.
--
-- Seeds three things per tenant:
--   1. tenant_settings_inbox        — one row per tenant, default values
--   2. tenant_messaging_policy      — 81 rows per tenant (full role-pair grid)
--   3. safeguarding_keywords        — starter keyword list (~30 entries)
--
-- All inserts use ON CONFLICT DO NOTHING so re-running is a no-op.
-- Uses SELECT FROM tenants to apply per-tenant without hand-enumerating IDs.

-- ─── 1. tenant_settings_inbox ───────────────────────────────────────────────
INSERT INTO "tenant_settings_inbox" ("tenant_id")
SELECT t."id"
FROM "tenants" t
ON CONFLICT ("tenant_id") DO NOTHING;

-- ─── 2. tenant_messaging_policy — 81 rows per tenant ────────────────────────
-- Default matrix mirrors packages/prisma/src/inbox-defaults.ts
-- DEFAULT_MESSAGING_POLICY_MATRIX. Parents and students rows are entirely
-- OFF by default (inbox-only baseline).

INSERT INTO "tenant_messaging_policy" ("tenant_id", "sender_role", "recipient_role", "allowed")
SELECT t."id", policy.sender_role::"MessagingRole", policy.recipient_role::"MessagingRole", policy.allowed
FROM "tenants" t
CROSS JOIN (
  VALUES
    -- owner row (all true)
    ('owner', 'owner', true),
    ('owner', 'principal', true),
    ('owner', 'vice_principal', true),
    ('owner', 'office', true),
    ('owner', 'finance', true),
    ('owner', 'nurse', true),
    ('owner', 'teacher', true),
    ('owner', 'parent', true),
    ('owner', 'student', true),
    -- principal row (all true)
    ('principal', 'owner', true),
    ('principal', 'principal', true),
    ('principal', 'vice_principal', true),
    ('principal', 'office', true),
    ('principal', 'finance', true),
    ('principal', 'nurse', true),
    ('principal', 'teacher', true),
    ('principal', 'parent', true),
    ('principal', 'student', true),
    -- vice_principal row (all true)
    ('vice_principal', 'owner', true),
    ('vice_principal', 'principal', true),
    ('vice_principal', 'vice_principal', true),
    ('vice_principal', 'office', true),
    ('vice_principal', 'finance', true),
    ('vice_principal', 'nurse', true),
    ('vice_principal', 'teacher', true),
    ('vice_principal', 'parent', true),
    ('vice_principal', 'student', true),
    -- office row (student = false)
    ('office', 'owner', true),
    ('office', 'principal', true),
    ('office', 'vice_principal', true),
    ('office', 'office', true),
    ('office', 'finance', true),
    ('office', 'nurse', true),
    ('office', 'teacher', true),
    ('office', 'parent', true),
    ('office', 'student', false),
    -- finance row (nurse = false, student = false)
    ('finance', 'owner', true),
    ('finance', 'principal', true),
    ('finance', 'vice_principal', true),
    ('finance', 'office', true),
    ('finance', 'finance', true),
    ('finance', 'nurse', false),
    ('finance', 'teacher', true),
    ('finance', 'parent', true),
    ('finance', 'student', false),
    -- nurse row (finance = false, student = false)
    ('nurse', 'owner', true),
    ('nurse', 'principal', true),
    ('nurse', 'vice_principal', true),
    ('nurse', 'office', true),
    ('nurse', 'finance', false),
    ('nurse', 'nurse', true),
    ('nurse', 'teacher', true),
    ('nurse', 'parent', true),
    ('nurse', 'student', false),
    -- teacher row (all true)
    ('teacher', 'owner', true),
    ('teacher', 'principal', true),
    ('teacher', 'vice_principal', true),
    ('teacher', 'office', true),
    ('teacher', 'finance', true),
    ('teacher', 'nurse', true),
    ('teacher', 'teacher', true),
    ('teacher', 'parent', true),
    ('teacher', 'student', true),
    -- parent row (all false — inbox-only baseline)
    ('parent', 'owner', false),
    ('parent', 'principal', false),
    ('parent', 'vice_principal', false),
    ('parent', 'office', false),
    ('parent', 'finance', false),
    ('parent', 'nurse', false),
    ('parent', 'teacher', false),
    ('parent', 'parent', false),
    ('parent', 'student', false),
    -- student row (all false — inbox-only baseline)
    ('student', 'owner', false),
    ('student', 'principal', false),
    ('student', 'vice_principal', false),
    ('student', 'office', false),
    ('student', 'finance', false),
    ('student', 'nurse', false),
    ('student', 'teacher', false),
    ('student', 'parent', false),
    ('student', 'student', false)
) AS policy(sender_role, recipient_role, allowed)
ON CONFLICT ("tenant_id", "sender_role", "recipient_role") DO NOTHING;

-- ─── 3. Starter safeguarding_keywords ───────────────────────────────────────
-- Neutral, generic safeguarding terms across 5 categories. Tenants edit
-- via Settings → Communications → Safeguarding.

INSERT INTO "safeguarding_keywords" ("tenant_id", "keyword", "severity", "category", "active")
SELECT t."id", kw.keyword, kw.severity::"MessageFlagSeverity", kw.category, true
FROM "tenants" t
CROSS JOIN (
  VALUES
    -- Bullying
    ('bully', 'medium', 'bullying'),
    ('bullying', 'medium', 'bullying'),
    ('harass', 'medium', 'bullying'),
    ('harassment', 'medium', 'bullying'),
    ('intimidate', 'medium', 'bullying'),
    ('threaten', 'high', 'bullying'),
    ('kill yourself', 'high', 'bullying'),
    -- Self-harm / mental health distress
    ('suicide', 'high', 'self_harm'),
    ('kill myself', 'high', 'self_harm'),
    ('self harm', 'high', 'self_harm'),
    ('self-harm', 'high', 'self_harm'),
    ('cut myself', 'high', 'self_harm'),
    ('want to die', 'high', 'self_harm'),
    ('end it all', 'medium', 'self_harm'),
    -- Abuse
    ('abuse', 'high', 'abuse'),
    ('abused', 'high', 'abuse'),
    ('hit me', 'high', 'abuse'),
    ('beat me', 'high', 'abuse'),
    ('hurt me', 'medium', 'abuse'),
    ('scared at home', 'medium', 'abuse'),
    ('afraid to go home', 'high', 'abuse'),
    -- Inappropriate contact / grooming
    ('meet me alone', 'high', 'inappropriate_contact'),
    ('don''t tell anyone', 'medium', 'inappropriate_contact'),
    ('our secret', 'medium', 'inappropriate_contact'),
    ('send me a picture', 'high', 'inappropriate_contact'),
    ('dont tell your parents', 'high', 'inappropriate_contact'),
    ('between us', 'low', 'inappropriate_contact'),
    -- Weapons / imminent harm
    ('knife', 'high', 'weapons'),
    ('gun', 'high', 'weapons'),
    ('weapon', 'high', 'weapons'),
    ('shoot up', 'high', 'weapons')
) AS kw(keyword, severity, category)
ON CONFLICT ("tenant_id", "keyword") DO NOTHING;
