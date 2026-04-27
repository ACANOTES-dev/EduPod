# Runbook — Tenant reports comms not arriving

**Purpose.** A tenant says "we're not getting any emails / SMS / WhatsApp." Triage in ≤ 10 minutes using the dashboard + a small SQL toolkit. End either (a) a fix shipped or (b) a clean root cause attributed to provider / DNS / customer config.

## Step 1 — Open the dashboard, filter to tenant

Open Grafana → "Communications" dashboard. Set `$tenant` to the tenant's UUID. Look at the last 1 hour:

- **Dispatch rate panel:** is anything being attempted? If zero, the platform is not producing notifications — skip to Step 6 (tenant config status).
- **Failure rate panel:** what's the % failed? If > 5% the failure is real and ongoing.
- **Latency panel:** if p95 has spiked, look at provider status pages first (Resend / Twilio).

## Step 2 — Last 1h failure rate

If failure rate is high, check:

- `notifications_provider_errors_total{tenant_id="<id>"}` by `error_code` — what kind of error?
- If `error_code="resend.invalid_key"` — Step 7 (credential rotation).
- If `error_code="resend.domain_unverified"` — Step 8 (DNS).
- If `error_code="twilio.21610"` (number blocked) — recipient suppressed; check suppression list.
- If `error_code="resend.rate_limited"` or `"twilio.20429"` — provider throttling; back off and re-queue.

## Step 3 — Recent webhook events

```sql
SELECT id, channel, event_type, signature_verified, processing_error, received_at
FROM notification_webhook_events
WHERE tenant_id = '<TENANT_UUID>'
ORDER BY received_at DESC
LIMIT 50;
```

Look for:

- `signature_verified = false` rows — provider sent something but our secret is wrong (Step 7).
- `processing_error IS NOT NULL` — our handler crashed; capture the error and file in `agent-fix-log.md`.
- A run of `event_type = 'bounced'` or `'complained'` — the recipient list is unhealthy.

## Step 4 — Bounce / complaint patterns

```sql
SELECT
  channel,
  reason,
  COUNT(*) AS count,
  MIN(created_at) AS oldest,
  MAX(created_at) AS newest
FROM notification_suppression_list
WHERE tenant_id = '<TENANT_UUID>'
  AND created_at > now() - interval '7 days'
GROUP BY channel, reason
ORDER BY count DESC;
```

If a single template has flooded the suppression list (e.g. > 50 hard bounces from one template_key in a day), the tenant has a dirty list — they need to clean their parent contact data before re-sending.

## Step 5 — Suppression list growth

```sql
SELECT
  date_trunc('day', created_at) AS day,
  reason,
  COUNT(*) AS additions
FROM notification_suppression_list
WHERE tenant_id = '<TENANT_UUID>'
  AND created_at > now() - interval '14 days'
GROUP BY day, reason
ORDER BY day DESC;
```

A growing curve at +50/day means we are actively damaging our sender reputation. Pause sends to the affected channel until the tenant cleans their list.

## Step 6 — Tenant config status

```sql
SELECT
  'email' AS channel, is_enabled, last_verified_at, key_last_rotated_at
FROM tenant_email_configs WHERE tenant_id = '<TENANT_UUID>'
UNION ALL
SELECT
  'sms', is_enabled, last_verified_at, key_last_rotated_at
FROM tenant_sms_configs WHERE tenant_id = '<TENANT_UUID>'
UNION ALL
SELECT
  'whatsapp', is_enabled, last_verified_at, key_last_rotated_at
FROM tenant_whatsapp_configs WHERE tenant_id = '<TENANT_UUID>';
```

If any row has `is_enabled = false`, the tenant disabled it themselves — this is operating-as-designed. Confirm with the tenant whether this was intentional.

If `last_verified_at` is null or > 30 days old, ask the tenant to re-run "Send test" from `/settings/communications/<channel>`.

## Step 7 — Domain verification status

```sql
SELECT domain, status, spf_status, dkim_status, dmarc_status, last_checked_at, failure_reason
FROM tenant_email_domains
WHERE tenant_id = '<TENANT_UUID>';
```

Any DNS record `failed`: tenant's DNS provider has not been updated. Send them the verbatim record list from `dns_records_json`.

## Step 8 — Trigger verifyConfig from the settings UI

As the operator (logged in as a tenant admin if escalated), navigate to:

- `/settings/communications/email` — click "Send test message", enter a recipient.
- `/settings/communications/sms` — same flow.
- `/settings/communications/whatsapp` — same flow (template required outside service window).

Capture the verbatim error message returned. The UI surfaces the provider error directly per Impl 09.

## Common causes table

| Symptom                                             | Cause                                                                       | Fix                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `resend.invalid_key` errors                         | API key revoked or rotated outside our settings UI                          | Tenant rotates key, updates via `PUT /v1/email-config`                                                           |
| `resend.domain_unverified` errors                   | Tenant added DNS records but they have not propagated, OR records are wrong | Check `tenant_email_domains.dns_records_json` against tenant's DNS; trigger `POST /v1/email-domains/:id/refresh` |
| `twilio.21610` (number blocked)                     | Recipient is in Twilio's blocklist                                          | Add to suppression list manually; do not retry                                                                   |
| Bounce flood from one template                      | Dirty contact data                                                          | Pause that template; tenant cleans data                                                                          |
| `signature_verified = false` for all webhooks       | Provider misconfigured webhook URL or our `webhook_secret` is wrong         | Check tenant config matches the webhook secret in the provider's dashboard                                       |
| Zero dispatch rate but non-zero `notification` rows | Worker stopped or queue backed up                                           | Check `pm2 logs worker`; check BullMQ queue depth                                                                |

## Step 9 — Closing out

If the cause was a tenant misconfiguration: write a short message to the tenant explaining what to do, link the relevant settings page, and STOP — no engineering work needed.

If the cause was a platform bug: open a Sentry issue (the comms tags should already filter to the right tenant), file in `agent-fix-log.md`, fix forward.
