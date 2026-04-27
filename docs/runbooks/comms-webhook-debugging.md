# Runbook — Debug a webhook that didn't update notification status

**Purpose.** A `notification` row is stuck in status `sent` (provider acknowledged) and never moved to `delivered` / `bounced` / `complained`. The webhook chain is the suspect.

## Step 1 — Find the suspect notification

```sql
SELECT id, tenant_id, channel, status, provider_message_id, sent_at, updated_at
FROM notification
WHERE id = '<NOTIFICATION_UUID>';
```

Note the `provider_message_id`. It maps to:

- Resend: `re_<uuid>` — the Resend email ID.
- Twilio: `SM<...>` (SMS) or `MM<...>` (MMS) or `WA<...>` (WhatsApp) — the Twilio MessageSid.

## Step 2 — Find webhook events

```sql
SELECT id, channel, event_type, signature_verified, processing_error, received_at, payload_json
FROM notification_webhook_events
WHERE tenant_id = '<TENANT_UUID>'
  AND payload_json::text LIKE '%<provider_message_id>%'
ORDER BY received_at;
```

Three outcomes:

- **Empty result set:** provider never sent a webhook. Either provider has not yet delivered (wait), OR the provider's webhook URL is misconfigured (check provider dashboard).
- **Rows present, `signature_verified = false`:** provider DID send, but our verifier rejected. Step 4.
- **Rows present, `signature_verified = true`, `processing_error IS NOT NULL`:** our handler crashed. Step 5.

## Step 3 — If no webhook events arrived

Check the provider's webhook URL configuration:

- Resend: https://resend.com/webhooks → tenant's webhook → "Recent deliveries"
- Twilio: https://console.twilio.com → Messaging → Settings → Status callback URL on the tenant's number

The URL must match `https://<our-domain>/api/v1/webhooks/communications/<channel>/<tenant_id>` (Impl 06's contract). If it doesn't match, fix in the provider dashboard.

## Step 4 — Signature verification failed

```sql
SELECT id, payload_json, received_at
FROM notification_webhook_events
WHERE tenant_id = '<TENANT_UUID>'
  AND signature_verified = false
ORDER BY received_at DESC
LIMIT 10;
```

The payload is logged (we always log on signature failure per Impl 06's invariants). Check whether the signature header is missing or wrong.

Most common cause: tenant rotated `webhook_secret` in our config but didn't update it in the provider dashboard. Fix: tenant updates the secret in the provider's dashboard.

## Step 5 — Handler crashed (`processing_error` is non-null)

The error message is in the column. Common cases:

- `Notification not found` — `provider_message_id` did not match any `notification` row. Orphan event. Either (a) the notification was deleted, or (b) the provider sent an event for a notification we don't know about.
- `Unknown event type` — provider added a new event type we don't handle. Add support to `resend-webhook-handler.service.ts` / `twilio-webhook-handler.service.ts`. File in `agent-fix-log.md`.
- Database deadlock / connection error — transient; the cron `comms:webhook-replay` (if registered) will retry.

## Common scenarios table

| Scenario                                | Where to look                                            | Fix                                                         |
| --------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Provider didn't send webhook            | Provider dashboard "deliveries" log                      | Configure webhook URL correctly                             |
| Signature mismatch                      | `notification_webhook_events.signature_verified = false` | Match `webhook_secret` in our config and provider dashboard |
| Handler crashed                         | `notification_webhook_events.processing_error`           | Fix handler, replay event                                   |
| Unknown event type                      | `processing_error = "Unknown event type: ..."`           | Add handler branch, replay                                  |
| Orphan event (no matching notification) | `processing_error = "Notification not found"`            | Mark no-op; track frequency in dashboard                    |

## Step 6 — Closing out

After resolution:

- Update `notification_webhook_events.processed_at` to mark the original row processed.
- Update `notification.status` to the correct final state if the replay didn't.
- File a one-line summary in `agent-fix-log.md` so the next session has the audit trail.
