-- Session 5B: platform alert routing + escalation.

ALTER TYPE "platform_audit_action" ADD VALUE IF NOT EXISTS 'alert_route_created';
ALTER TYPE "platform_audit_action" ADD VALUE IF NOT EXISTS 'alert_route_updated';
ALTER TYPE "platform_audit_action" ADD VALUE IF NOT EXISTS 'alert_route_deleted';
ALTER TYPE "platform_audit_action" ADD VALUE IF NOT EXISTS 'alert_route_tested';
ALTER TYPE "platform_audit_action" ADD VALUE IF NOT EXISTS 'alert_test_all_routes';
ALTER TYPE "platform_audit_action" ADD VALUE IF NOT EXISTS 'alert_escalation_policy_created';
ALTER TYPE "platform_audit_action" ADD VALUE IF NOT EXISTS 'alert_escalation_policy_updated';
ALTER TYPE "platform_audit_action" ADD VALUE IF NOT EXISTS 'alert_escalation_policy_deleted';
ALTER TYPE "platform_audit_action" ADD VALUE IF NOT EXISTS 'alert_emergency_contact_updated';

CREATE TYPE "alert_escalation_state" AS ENUM (
  'idle',
  'dispatched',
  'awaiting_ack',
  'escalating',
  'acknowledged',
  'auto_resolved',
  'expired'
);

CREATE TYPE "alert_channel_urgency_tier" AS ENUM (
  'info',
  'urgent',
  'critical_only'
);

ALTER TABLE "platform_alert_channels"
  ADD COLUMN "urgency_tier" "alert_channel_urgency_tier" NOT NULL DEFAULT 'info',
  ADD COLUMN "last_health_check_at" TIMESTAMPTZ;

ALTER TABLE "platform_alert_history"
  ADD COLUMN "escalation_state" "alert_escalation_state" NOT NULL DEFAULT 'idle',
  ADD COLUMN "next_escalation_at" TIMESTAMPTZ,
  ADD COLUMN "current_escalation_step" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "acknowledged_via_route_id" UUID;

ALTER TABLE "platform_users"
  ADD COLUMN "emergency_contact_id" UUID;

CREATE TABLE "platform_alert_routes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "channel_id" UUID NOT NULL,
  "display_name" VARCHAR(160) NOT NULL,
  "urgency_tier" "alert_channel_urgency_tier" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "operator_destination" JSONB NOT NULL,
  "health_check_destination" JSONB NOT NULL,
  "quiet_hours_start" VARCHAR(5),
  "quiet_hours_end" VARCHAR(5),
  "quiet_hours_timezone" VARCHAR(60) NOT NULL DEFAULT 'Europe/Dublin',
  "critical_override_quiet" BOOLEAN NOT NULL DEFAULT true,
  "dead_man_interval_minutes" INTEGER NOT NULL DEFAULT 15,
  "last_health_check_at" TIMESTAMPTZ,
  "last_health_check_status" VARCHAR(20),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "platform_alert_routes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_route_destinations_distinct" CHECK ("operator_destination"::text <> "health_check_destination"::text),
  CONSTRAINT "platform_alert_routes_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "platform_alert_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "platform_alert_escalation_policies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "display_name" VARCHAR(160) NOT NULL,
  "applies_to_severity" VARCHAR(20) NOT NULL,
  "applies_to_alert_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "steps" JSONB NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "platform_alert_escalation_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_alert_escalation_policies_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "platform_alert_route_health_checks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "route_id" UUID NOT NULL,
  "ran_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "success" BOOLEAN NOT NULL,
  "latency_ms" INTEGER,
  "failure_detail" JSONB,
  "triggered_by" VARCHAR(40) NOT NULL DEFAULT 'schedule',
  "triggered_by_user_id" UUID,

  CONSTRAINT "platform_alert_route_health_checks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_alert_route_health_checks_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "platform_alert_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "platform_alert_route_health_checks_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "platform_alert_acknowledgements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "alert_history_id" UUID NOT NULL,
  "acknowledged_by_user_id" UUID NOT NULL,
  "acknowledged_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "acknowledged_via_route_id" UUID,
  "comment" TEXT,

  CONSTRAINT "platform_alert_acknowledgements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_alert_acknowledgements_alert_history_id_key" UNIQUE ("alert_history_id"),
  CONSTRAINT "platform_alert_acknowledgements_alert_history_id_fkey" FOREIGN KEY ("alert_history_id") REFERENCES "platform_alert_history"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "platform_alert_acknowledgements_acknowledged_by_user_id_fkey" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "platform_alert_acknowledgements_acknowledged_via_route_id_fkey" FOREIGN KEY ("acknowledged_via_route_id") REFERENCES "platform_alert_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "platform_alert_emergency_contacts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "platform_user_id" UUID NOT NULL,
  "email" VARCHAR(255),
  "sms_phone" VARCHAR(40),
  "whatsapp_phone" VARCHAR(40),
  "telegram_chat_id" VARCHAR(40),
  "push_subscription" JSONB,
  "preferred_order" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "timezone" VARCHAR(60) NOT NULL DEFAULT 'Europe/Dublin',
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "platform_alert_emergency_contacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_alert_emergency_contacts_platform_user_id_key" UNIQUE ("platform_user_id"),
  CONSTRAINT "platform_alert_emergency_contacts_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "platform_users"
  ADD CONSTRAINT "platform_users_emergency_contact_id_key" UNIQUE ("emergency_contact_id"),
  ADD CONSTRAINT "platform_users_emergency_contact_id_fkey" FOREIGN KEY ("emergency_contact_id") REFERENCES "platform_alert_emergency_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "platform_alert_history"
  ADD CONSTRAINT "platform_alert_history_acknowledged_via_route_id_fkey" FOREIGN KEY ("acknowledged_via_route_id") REFERENCES "platform_alert_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_platform_alert_routes_enabled_urgency" ON "platform_alert_routes"("enabled", "urgency_tier");
CREATE INDEX "idx_platform_alert_routes_channel" ON "platform_alert_routes"("channel_id");
CREATE INDEX "idx_platform_alert_escalation_policies_severity" ON "platform_alert_escalation_policies"("applies_to_severity");
CREATE INDEX "idx_platform_alert_route_health_checks_route_ran" ON "platform_alert_route_health_checks"("route_id", "ran_at" DESC);
CREATE INDEX "idx_platform_alert_route_health_checks_success_ran" ON "platform_alert_route_health_checks"("success", "ran_at" DESC);
CREATE INDEX "idx_platform_alert_ack_actor_time" ON "platform_alert_acknowledgements"("acknowledged_by_user_id", "acknowledged_at" DESC);
CREATE INDEX "idx_platform_alert_history_escalation_due" ON "platform_alert_history"("escalation_state", "next_escalation_at");

INSERT INTO platform_permissions (
  permission_key,
  category,
  display_name,
  description,
  is_destructive,
  requires_owner_confirmation
)
VALUES
  ('platform.alerts.manage', 'alerts', 'Manage alert routing', 'Manage alert routes, escalation policies, test alerts, and emergency routing.', false, false),
  ('platform.profile.view', 'profile', 'View own platform profile', 'View the current operator emergency contact profile.', false, false),
  ('platform.profile.manage', 'profile', 'Manage own platform profile', 'Update the current operator emergency contact profile.', false, false)
ON CONFLICT (permission_key) DO UPDATE SET
  category = EXCLUDED.category,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_destructive = EXCLUDED.is_destructive,
  requires_owner_confirmation = EXCLUDED.requires_owner_confirmation;

INSERT INTO platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform_roles r
CROSS JOIN platform_permissions p
WHERE r.role_key = 'platform_owner'
  AND p.permission_key IN (
    'platform.alerts.manage',
    'platform.profile.view',
    'platform.profile.manage'
  )
ON CONFLICT DO NOTHING;

INSERT INTO platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform_roles r
CROSS JOIN platform_permissions p
WHERE r.role_key = 'platform_support'
  AND p.permission_key IN (
    'platform.profile.view',
    'platform.profile.manage'
  )
ON CONFLICT DO NOTHING;
