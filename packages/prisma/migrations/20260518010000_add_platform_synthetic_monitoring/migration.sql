CREATE TYPE synthetic_check_kind AS ENUM (
  'http_get',
  'http_post',
  'websocket_handshake',
  'queue_canary',
  'notification_self_test',
  'dns_lookup',
  'tls_check',
  'external_dependency_status'
);

CREATE TYPE synthetic_check_result_status AS ENUM (
  'passed',
  'degraded',
  'failed',
  'error',
  'skipped_maintenance'
);

ALTER TYPE platform_audit_action ADD VALUE IF NOT EXISTS 'synthetic_check_created';
ALTER TYPE platform_audit_action ADD VALUE IF NOT EXISTS 'synthetic_check_updated';
ALTER TYPE platform_audit_action ADD VALUE IF NOT EXISTS 'synthetic_check_deleted';
ALTER TYPE platform_audit_action ADD VALUE IF NOT EXISTS 'synthetic_check_run_now';

CREATE TABLE platform_synthetic_check_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(120) NOT NULL UNIQUE,
  display_name VARCHAR(160) NOT NULL,
  description TEXT,
  kind synthetic_check_kind NOT NULL,
  target JSONB NOT NULL,
  schedule_cron VARCHAR(80) NOT NULL,
  timeout_ms INTEGER NOT NULL DEFAULT 15000,
  expected JSONB NOT NULL,
  consecutive_failure_threshold_critical INTEGER NOT NULL DEFAULT 3,
  retry_attempts INTEGER NOT NULL DEFAULT 1,
  related_component VARCHAR(60),
  related_tenant_id UUID,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_synthetic_checks_kind
  ON platform_synthetic_check_definitions(kind);
CREATE INDEX idx_platform_synthetic_checks_enabled_kind
  ON platform_synthetic_check_definitions(enabled, kind);
CREATE INDEX idx_platform_synthetic_checks_related_tenant
  ON platform_synthetic_check_definitions(related_tenant_id);

CREATE TRIGGER set_updated_at_platform_synthetic_check_definitions
  BEFORE UPDATE ON platform_synthetic_check_definitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE platform_synthetic_check_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID NOT NULL REFERENCES platform_synthetic_check_definitions(id) ON DELETE CASCADE,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status synthetic_check_result_status NOT NULL,
  latency_ms INTEGER,
  response_status_code INTEGER,
  response_body_sha256 VARCHAR(64),
  response_body_snippet TEXT,
  failure_detail JSONB,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  triggered_by VARCHAR(40) NOT NULL DEFAULT 'schedule',
  triggered_by_user_id UUID,
  correlation_id VARCHAR(64),
  CONSTRAINT platform_synthetic_result_snippet_len CHECK (
    response_body_snippet IS NULL OR char_length(response_body_snippet) <= 500
  )
);

CREATE INDEX idx_platform_synthetic_results_definition_ran
  ON platform_synthetic_check_results(definition_id, ran_at DESC);
CREATE INDEX idx_platform_synthetic_results_status_ran
  ON platform_synthetic_check_results(status, ran_at DESC);

CREATE TABLE platform_external_dependency_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key VARCHAR(60) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  source VARCHAR(40) NOT NULL,
  status VARCHAR(40) NOT NULL,
  status_detail TEXT,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_status_changed_at TIMESTAMPTZ,
  upstream_url VARCHAR(500),
  CONSTRAINT platform_external_dependency_status_provider_key_key UNIQUE(provider_key)
);

CREATE INDEX idx_platform_external_dependency_status
  ON platform_external_dependency_status(status);

CREATE TABLE platform_certificate_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostname VARCHAR(255) NOT NULL,
  issuer VARCHAR(255),
  subject VARCHAR(255),
  not_before TIMESTAMPTZ,
  not_after TIMESTAMPTZ,
  days_until_expiry INTEGER,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  check_status VARCHAR(40) NOT NULL,
  check_error TEXT,
  CONSTRAINT platform_certificate_checks_hostname_key UNIQUE(hostname)
);

CREATE INDEX idx_platform_certificate_checks_expiry
  ON platform_certificate_checks(days_until_expiry);
CREATE INDEX idx_platform_certificate_checks_status
  ON platform_certificate_checks(check_status);

INSERT INTO platform_permissions (
  permission_key,
  category,
  display_name,
  description,
  is_destructive,
  requires_owner_confirmation
)
VALUES
  ('platform.synthetic.view', 'synthetic', 'View synthetic monitoring', 'View synthetic checks, results, dependency status, and certificate inventory.', false, false),
  ('platform.synthetic.manage', 'synthetic', 'Manage synthetic checks', 'Create, edit, disable, and delete synthetic check definitions.', false, false),
  ('platform.synthetic.run', 'synthetic', 'Run synthetic checks', 'Run synthetic checks on demand.', false, false)
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
  AND p.permission_key IN ('platform.synthetic.view', 'platform.synthetic.manage', 'platform.synthetic.run')
ON CONFLICT DO NOTHING;

INSERT INTO platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform_roles r
CROSS JOIN platform_permissions p
WHERE r.role_key = 'platform_support'
  AND p.permission_key IN ('platform.synthetic.view', 'platform.synthetic.run')
ON CONFLICT DO NOTHING;

INSERT INTO platform_synthetic_check_definitions (
  key,
  display_name,
  description,
  kind,
  target,
  schedule_cron,
  timeout_ms,
  expected,
  consecutive_failure_threshold_critical,
  retry_attempts,
  related_component,
  created_by_user_id
)
VALUES
  ('platform.admin.login', 'Platform admin synthetic login', 'Logs in with the dedicated synthetic platform support user and immediately logs out.', 'http_post', '{"url":"https://dua.edupod.app/api/v1/auth/login","body":{"email":{"env":"SYNTHETIC_PLATFORM_USER_EMAIL"},"password":{"env":"SYNTHETIC_PLATFORM_USER_PASSWORD"}}}'::jsonb, '*/5 * * * *', 15000, '{"status_codes":[200,201],"max_latency_ms":5000,"body_regex":"access_token","logout_url":"https://dua.edupod.app/api/v1/auth/logout"}'::jsonb, 3, 1, 'auth', '00000000-0000-0000-0000-000000000000'),
  ('tenant.api.ready', 'Tenant API readiness', 'Checks the public readiness endpoint.', 'http_get', '{"url":"https://dua.edupod.app/api/health/ready"}'::jsonb, '*/2 * * * *', 10000, '{"status_codes":[200],"max_latency_ms":3000}'::jsonb, 3, 1, 'api', '00000000-0000-0000-0000-000000000000'),
  ('tenant.page.login', 'Tenant login page render', 'Checks the English login page renders.', 'http_get', '{"url":"https://dua.edupod.app/en/login"}'::jsonb, '*/5 * * * *', 10000, '{"status_codes":[200],"max_latency_ms":4000}'::jsonb, 3, 1, 'web', '00000000-0000-0000-0000-000000000000'),
  ('worker.liveness.synthetic_canary', 'Worker liveness canary', 'Enqueues a no-op job onto the dedicated synthetic canary queue.', 'queue_canary', '{"queue_kind":"synthetic_canary"}'::jsonb, '*/2 * * * *', 10000, '{"max_latency_ms":3000}'::jsonb, 3, 1, 'bullmq', '00000000-0000-0000-0000-000000000000'),
  ('queue.notifications.canary', 'Notifications queue canary', 'Sentinel canary for the notifications queue.', 'queue_canary', '{"queue_kind":"critical_queue_canary","queue_name":"notifications"}'::jsonb, '*/5 * * * *', 10000, '{"max_latency_ms":5000}'::jsonb, 3, 1, 'bullmq', '00000000-0000-0000-0000-000000000000'),
  ('queue.behaviour.canary', 'Behaviour queue canary', 'Sentinel canary for the behaviour queue.', 'queue_canary', '{"queue_kind":"critical_queue_canary","queue_name":"behaviour"}'::jsonb, '*/5 * * * *', 10000, '{"max_latency_ms":5000}'::jsonb, 3, 1, 'bullmq', '00000000-0000-0000-0000-000000000000'),
  ('queue.finance.canary', 'Finance queue canary', 'Sentinel canary for the finance queue.', 'queue_canary', '{"queue_kind":"critical_queue_canary","queue_name":"finance"}'::jsonb, '*/5 * * * *', 10000, '{"max_latency_ms":5000}'::jsonb, 3, 1, 'bullmq', '00000000-0000-0000-0000-000000000000'),
  ('queue.payroll.canary', 'Payroll queue canary', 'Sentinel canary for the payroll queue.', 'queue_canary', '{"queue_kind":"critical_queue_canary","queue_name":"payroll"}'::jsonb, '*/5 * * * *', 10000, '{"max_latency_ms":5000}'::jsonb, 3, 1, 'bullmq', '00000000-0000-0000-0000-000000000000'),
  ('queue.pastoral.canary', 'Pastoral queue canary', 'Sentinel canary for the pastoral queue.', 'queue_canary', '{"queue_kind":"critical_queue_canary","queue_name":"pastoral"}'::jsonb, '*/5 * * * *', 10000, '{"max_latency_ms":5000}'::jsonb, 3, 1, 'bullmq', '00000000-0000-0000-0000-000000000000'),
  ('notification.resend.self_test', 'Resend notification self-test', 'Sends a synthetic monitoring ping to the configured sink.', 'notification_self_test', '{"channel":"resend","sink_env":"SYNTHETIC_RESEND_SINK_EMAIL"}'::jsonb, '*/15 * * * *', 15000, '{"max_latency_ms":5000}'::jsonb, 3, 1, 'notifications', '00000000-0000-0000-0000-000000000000'),
  ('dns.apex.lookup', 'Apex DNS lookup', 'Resolves the EduPod apex domain.', 'dns_lookup', '{"hostname":"edupod.app","record_type":"A"}'::jsonb, '*/10 * * * *', 10000, '{"record_count_min":1,"max_latency_ms":2000}'::jsonb, 3, 1, 'dns', '00000000-0000-0000-0000-000000000000'),
  ('tls.platform.host', 'Platform admin TLS certificate', 'Checks TLS expiry for the platform admin host.', 'tls_check', '{"hostname":"dua.edupod.app","port":443}'::jsonb, '0 */6 * * *', 10000, '{"warning_days":14,"critical_days":3}'::jsonb, 3, 1, 'tls', '00000000-0000-0000-0000-000000000000'),
  ('external.resend.status', 'Resend dependency status', 'Polls Resend public status JSON.', 'external_dependency_status', '{"provider_key":"resend","display_name":"Resend","source":"status_page","url":"https://status.resend.com/api/v2/status.json"}'::jsonb, '*/5 * * * *', 10000, '{"operational_indicators":["operational"]}'::jsonb, 3, 1, 'resend', '00000000-0000-0000-0000-000000000000'),
  ('external.stripe.status', 'Stripe dependency status', 'Polls Stripe public status JSON.', 'external_dependency_status', '{"provider_key":"stripe","display_name":"Stripe","source":"status_page","url":"https://status.stripe.com/api/v2/status.json"}'::jsonb, '*/5 * * * *', 10000, '{"operational_indicators":["operational"]}'::jsonb, 3, 1, 'stripe', '00000000-0000-0000-0000-000000000000'),
  ('external.twilio.status', 'Twilio dependency status', 'Polls Twilio public status JSON.', 'external_dependency_status', '{"provider_key":"twilio","display_name":"Twilio","source":"status_page","url":"https://status.twilio.com/api/v2/status.json"}'::jsonb, '*/5 * * * *', 10000, '{"operational_indicators":["operational"]}'::jsonb, 3, 1, 'twilio', '00000000-0000-0000-0000-000000000000'),
  ('external.sentry.status', 'Sentry dependency status', 'Polls Sentry public status JSON.', 'external_dependency_status', '{"provider_key":"sentry","display_name":"Sentry","source":"status_page","url":"https://status.sentry.io/api/v2/status.json"}'::jsonb, '*/5 * * * *', 10000, '{"operational_indicators":["operational"]}'::jsonb, 3, 1, 'sentry', '00000000-0000-0000-0000-000000000000'),
  ('external.registrar_dns.status', 'Registrar/DNS dependency status', 'Polls Cloudflare public status JSON.', 'external_dependency_status', '{"provider_key":"registrar_dns","display_name":"Registrar/DNS","source":"status_page","url":"https://www.cloudflarestatus.com/api/v2/status.json"}'::jsonb, '*/5 * * * *', 10000, '{"operational_indicators":["operational"]}'::jsonb, 3, 1, 'dns', '00000000-0000-0000-0000-000000000000'),
  ('external.s3.status', 'S3 object storage dependency status', 'Polls Hetzner public status JSON for the S3-compatible object storage dependency.', 'external_dependency_status', '{"provider_key":"s3","display_name":"S3 Object Storage","source":"status_page","url":"https://status.hetzner.com/api/v2/status.json"}'::jsonb, '*/5 * * * *', 10000, '{"operational_indicators":["operational"]}'::jsonb, 3, 1, 'object_storage', '00000000-0000-0000-0000-000000000000'),
  ('external.meilisearch.status', 'Meilisearch dependency status', 'Polls Meilisearch public status JSON.', 'external_dependency_status', '{"provider_key":"meilisearch","display_name":"Meilisearch","source":"status_page","url":"https://status.meilisearch.com/api/v2/status.json"}'::jsonb, '*/5 * * * *', 10000, '{"operational_indicators":["operational"]}'::jsonb, 3, 1, 'search', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_synthetic_check_definitions (
  key,
  display_name,
  description,
  kind,
  target,
  schedule_cron,
  timeout_ms,
  expected,
  consecutive_failure_threshold_critical,
  retry_attempts,
  related_component,
  related_tenant_id,
  created_by_user_id
)
SELECT
  'tls.tenant.' || regexp_replace(td.domain, '[^a-z0-9]+', '.', 'g'),
  'Tenant TLS certificate: ' || td.domain,
  'Checks TLS expiry for an active tenant domain.',
  'tls_check'::synthetic_check_kind,
  jsonb_build_object('hostname', td.domain, 'port', 443),
  '0 */6 * * *',
  10000,
  '{"warning_days":14,"critical_days":3}'::jsonb,
  3,
  1,
  'tls',
  td.tenant_id,
  '00000000-0000-0000-0000-000000000000'
FROM tenant_domains td
JOIN tenants t ON t.id = td.tenant_id
WHERE t.status = 'active'
  AND td.verification_status = 'verified'
ON CONFLICT (key) DO NOTHING;

INSERT INTO platform_external_dependency_status (
  provider_key,
  display_name,
  source,
  status,
  status_detail,
  upstream_url
)
VALUES
  ('resend', 'Resend', 'status_page', 'unknown', 'Awaiting first synthetic status check.', 'https://status.resend.com/api/v2/status.json'),
  ('stripe', 'Stripe', 'status_page', 'unknown', 'Awaiting first synthetic status check.', 'https://status.stripe.com/api/v2/status.json'),
  ('twilio', 'Twilio', 'status_page', 'unknown', 'Awaiting first synthetic status check.', 'https://status.twilio.com/api/v2/status.json'),
  ('sentry', 'Sentry', 'status_page', 'unknown', 'Awaiting first synthetic status check.', 'https://status.sentry.io/api/v2/status.json'),
  ('registrar_dns', 'Registrar/DNS', 'status_page', 'unknown', 'Awaiting first synthetic status check.', 'https://www.cloudflarestatus.com/api/v2/status.json'),
  ('s3', 'S3 Object Storage', 'status_page', 'unknown', 'Awaiting first synthetic status check.', 'https://status.hetzner.com/api/v2/status.json'),
  ('meilisearch', 'Meilisearch', 'status_page', 'unknown', 'Awaiting first synthetic status check.', 'https://status.meilisearch.com/api/v2/status.json')
ON CONFLICT (provider_key) DO NOTHING;

INSERT INTO platform_certificate_checks (
  hostname,
  check_status,
  check_error
)
VALUES
  ('dua.edupod.app', 'pending', 'Awaiting first synthetic TLS check.')
ON CONFLICT (hostname) DO NOTHING;

INSERT INTO platform_certificate_checks (
  hostname,
  check_status,
  check_error
)
SELECT
  td.domain,
  'pending',
  'Awaiting first synthetic TLS check.'
FROM tenant_domains td
JOIN tenants t ON t.id = td.tenant_id
WHERE t.status = 'active'
  AND td.verification_status = 'verified'
ON CONFLICT (hostname) DO NOTHING;
