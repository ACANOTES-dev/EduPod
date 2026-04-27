# Runbook — Rotate a tenant's Resend / Twilio credentials safely

**Purpose.** A tenant rotated their provider key (Resend revoked, Twilio rotated, security incident). They need to push the new key into the platform without losing in-flight notifications. This runbook drives the safe path.

## Pre-conditions

- Tenant admin has the new credentials in hand.
- Both old and new credentials are valid (overlap window) — recommend rotation start before old is revoked, since in-flight jobs use cached old client until eviction.

## Steps

### 1. Tenant updates via Settings UI

- Navigate `/settings/communications/<email|sms|whatsapp>`.
- Paste new credentials into the form. Save.
- The UI calls `PUT /v1/email-config` (or `/sms-config`, `/whatsapp-config`) → service `upsertConfig` writes the encrypted blob and updates `key_last_rotated_at = now()`.

### 2. Cache invalidation propagates

- `upsertConfig` publishes `comms:config-changed` Redis event with `{ tenant_id, channel }`.
- Both API and worker subscribers receive the event and call `clientCache.invalidate(tenantId)` per Impl 04.
- New dispatches use the new credentials; cached old clients are evicted.

### 3. In-flight jobs

- BullMQ jobs already `process()`-ing use the cached old client (one-shot read). Up to ~30 seconds of in-flight messages may still go via the old credentials.
- Jobs fetched from the queue AFTER cache invalidation receive the new client.
- This is the eventual-consistency window we accept by design — if you need stricter, drain the worker first (see Step 5).

### 4. Verify rotation

```sql
SELECT key_last_rotated_at, last_verified_at, is_enabled
FROM tenant_email_configs WHERE tenant_id = '<TENANT_UUID>';
```

`key_last_rotated_at` should be ≤ 1 minute old.

Have the tenant click "Send test message" in the Settings UI. The verbatim provider response is shown — success means the new key is live.

### 5. (Optional) Drain worker before rotation

For zero in-flight overlap:

```bash
# On worker host
pm2 stop worker
# Tenant rotates via UI
# Worker pulls new config on restart
pm2 start worker
```

This is the only safe pattern when the old credentials are revoked at the same instant they are replaced.

### 6. Rollback

If the new credentials are wrong (typo, paste error), the verify step (Step 4) returns the verbatim provider error in the UI. Tenant updates again with corrected credentials — this is just another `PUT /v1/email-config`. There is no separate rollback flow; the latest write wins.

## Common causes of rotation failure

| Symptom                                          | Cause                                                                              | Fix                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `verify` returns `resend.invalid_key` after save | Tenant pasted wrong key, or copied trailing space                                  | Tenant re-pastes, save, verify                                          |
| In-flight jobs continue with old key after save  | Cache invalidation delivered but jobs already in-flight                            | Wait 30 seconds, OR drain worker (Step 5)                               |
| `key_last_rotated_at` did not update             | The `upsertConfig` call failed silently                                            | Check API logs filtered to tenant; refile in `agent-fix-log.md`         |
| Resend webhook events stop arriving              | Tenant rotated Resend key but didn't rotate `webhook_secret` in Resend's dashboard | Tenant updates `webhook_secret` in Resend dashboard to match our config |
