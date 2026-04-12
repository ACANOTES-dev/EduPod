# Worker / Background-Job Test Specification: Communications Module

> **Leg 3 of the `/e2e-full` release-readiness pack.** This spec exercises every BullMQ queue, processor, cron schedule, retry policy, dead-letter path, and async side-effect chain in the Communications module — things the UI and integration specs cannot observe. Runnable by a Jest + BullMQ harness with direct Redis + Postgres access.

**Module:** Communications (dispatch, publish, fallback, safeguarding scan, inquiry notifications)
**Target executor:** Jest + BullMQ test harness; direct Redis access for inspection
**Prereqs:** Two tenants (`nhqs`, `test-b`) + staging Redis instance

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Out of scope](#2-out-of-scope)
3. [Queue and Processor Inventory](#3-queue-and-processor-inventory)
4. [TenantAwareJob Base Class](#4-tenantawarejob-base-class)
5. [Job: notifications:dispatch-queued](#5-notifications-dispatch-queued)
6. [Job: communications:dispatch-notifications](#6-communications-dispatch-notifications)
7. [Job: communications:publish-announcement](#7-communications-publish-announcement)
8. [Job: communications:announcement-approval-callback](#8-communications-announcement-approval-callback)
9. [Job: communications:inquiry-notification](#9-communications-inquiry-notification)
10. [Job: safeguarding:scan-message](#10-safeguarding-scan-message)
11. [Job: safeguarding:notify-reviewers](#11-safeguarding-notify-reviewers)
12. [Job: safeguarding:critical-escalation](#12-safeguarding-critical-escalation)
13. [Job: safeguarding:sla-check](#13-safeguarding-sla-check)
14. [Job: safeguarding:scan-attachment](#14-safeguarding-scan-attachment)
15. [Job: safeguarding:break-glass-expiry](#15-safeguarding-break-glass-expiry)
16. [Job: inbox:fallback-check](#16-inbox-fallback-check)
17. [Job: inbox:fallback-scan-tenant](#17-inbox-fallback-scan-tenant)
18. [Cron Registration](#18-cron-registration)
19. [Side-effect Chains](#19-side-effect-chains)
20. [Dead-Letter Queue](#20-dead-letter-queue)
21. [Sign-off](#21-sign-off)

---

## 1. Prerequisites

- BullMQ + Redis instance reachable from test harness
- Prisma client with RLS middleware
- `SYSTEM_USER_SENTINEL` UUID known to tests (system-authored messages)
- Worker replicas count ≥ 1 (tests assert single-replica and multi-replica behaviour)
- Sandbox Resend + Twilio credentials for dispatch tests
- `INBOX_ALLOW_TEST_FALLBACK=true` for fallback-test job
- Test harness can inspect Redis keys: `bull:notifications:wait`, `bull:notifications:delayed`, `bull:notifications:failed`, `bull:safeguarding:*`, `bull:behaviour:*`

---

## 2. Out of Scope

This spec covers job behaviour. It does **NOT** cover:

- UI-visible status of jobs (covered by the 4 UI specs)
- API contract (covered by `integration/communications-integration-spec.md`)
- OWASP / security of worker (covered by `security/communications-security-spec.md`)
- Performance under load — covered by `perf/communications-perf-spec.md`
- External provider availability (Resend/Twilio live uptime) — tests use mocks or sandbox

---

## 3. Queue and Processor Inventory

| #   | Queue name      | Purpose                                   | Critical SLA | Processor files                                                                                                                                                                                                                                                                |
| --- | --------------- | ----------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.1 | `notifications` | Email/SMS/WhatsApp dispatch + cron        | 2 min        | `dispatch-queued.processor.ts`, `dispatch-notifications.processor.ts`, `publish-announcement.processor.ts`, `announcement-approval-callback.processor.ts`, `inquiry-notification.processor.ts`, `inbox-fallback-check.processor.ts`, `inbox-fallback-scan-tenant.processor.ts` |
| 3.2 | `safeguarding`  | Keyword scan + reviewer notifications     | 5 min        | `message-scan.processor.ts`, `notify-reviewers.processor.ts`, `critical-escalation.processor.ts`, `sla-check.processor.ts`, `attachment-scan.processor.ts`, `break-glass-expiry.processor.ts`                                                                                  |
| 3.3 | `behaviour`     | Digest notifications for behaviour module | 3 min        | `digest-notifications.processor.ts`, `notification-reconciliation.processor.ts`, `parent-notification.processor.ts` (tangential to comms)                                                                                                                                      |

### 3.1 Queue configuration

| #     | Queue           | Default concurrency | removeOnComplete | removeOnFail | Rate-limit | Dead-letter policy                                                       | Pass/Fail |
| ----- | --------------- | ------------------- | ---------------- | ------------ | ---------- | ------------------------------------------------------------------------ | --------- |
| 3.1.1 | `notifications` | 5                   | 10               | 50           | none       | attempts exhausted → stays in `failed` set for 50 entries; manual replay |           |
| 3.1.2 | `safeguarding`  | 3                   | 10               | 50           | none       | same                                                                     |           |
| 3.1.3 | `behaviour`     | 3                   | 10               | 50           | none       | same                                                                     |           |

### 3.2 Queue isolation

| #     | Assertion                                                                                                            | Expected                   | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------------------------------------- | -------------------------- | --------- |
| 3.2.1 | A `notifications` job cannot be picked up by the `safeguarding` processor                                            | Processor filters by queue |           |
| 3.2.2 | Jobs from tenant A and tenant B coexist in the same queue; each sets its own `app.current_tenant_id` in `processJob` | No cross-contamination     |           |

---

## 4. TenantAwareJob Base Class

All communications processors extend `TenantAwareJob<TenantJobPayload>`. The base class:

1. Reads `tenant_id` from payload
2. Opens a Prisma interactive transaction
3. Sets `SET LOCAL app.current_tenant_id = <tenant_id>; SET LOCAL app.current_user_id = <user_id or SYSTEM_USER_SENTINEL>;`
4. Calls `processJob(data, tx)` inside the RLS context
5. Commits or rolls back

### 4.1 Contract assertions

| #     | Assertion                                                                                                                             | Expected                          | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------- |
| 4.1.1 | A job payload WITHOUT `tenant_id` → enqueue is rejected at the service layer (NestJS enqueuing guard) or the processor logs and skips | Rejection at enqueue OR safe skip |           |
| 4.1.2 | A job payload with a non-existent `tenant_id` → processor logs and no-ops (no crash)                                                  | Safe failure, no exception        |           |
| 4.1.3 | A job payload with a malformed `tenant_id` (not a UUID) → Zod or validator rejects at enqueue                                         | Rejection                         |           |
| 4.1.4 | A successful processor commits the transaction; DB shows the write                                                                    | Write persisted                   |           |
| 4.1.5 | An exception inside `processJob` → transaction rolled back; no partial writes                                                         | DB unchanged                      |           |
| 4.1.6 | RLS is ACTIVE inside `processJob` — any SELECT/INSERT across tenants is blocked                                                       | Cross-tenant write raises error   |           |
| 4.1.7 | `user_id` defaults to `SYSTEM_USER_SENTINEL` if omitted; audit logs show sentinel when action is system-originated                    | Sentinel present                  |           |

---

## 5. Job: `notifications:dispatch-queued`

**File:** `apps/worker/src/processors/notifications/dispatch-queued.processor.ts`
**Cron:** every 30 seconds (repeatable)
**Payload:** none (cross-tenant cron)
**Purpose:** Fan out queued notifications (non in_app) to per-tenant dispatch jobs.

### 5.1 Behaviour

| #     | Scenario                                                                                                                          | Expected                                                                                   | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| 5.1.1 | Seed 5 notifications status=queued across 2 tenants (3 + 2) with `channel='email'`                                                | Job emits 2 `communications:dispatch-notifications` jobs (one per tenant with IDs grouped) |           |
| 5.1.2 | Batch size per tenant ≤ 50                                                                                                        | Respected                                                                                  |           |
| 5.1.3 | Notifications with `next_retry_at > NOW()` are skipped                                                                            | Not included in batch                                                                      |           |
| 5.1.4 | Notifications with `channel='in_app'` are NEVER handled here (in_app goes straight to delivered)                                  | Filter applied                                                                             |           |
| 5.1.5 | If Redis is unavailable → job throws; BullMQ retries with exponential backoff (5s, 25s, 125s) up to 3 attempts                    | Retried                                                                                    |           |
| 5.1.6 | Cron job dedup key `cron:notifications:dispatch-queued`                                                                           | Present in `bull:notifications:meta`                                                       |           |
| 5.1.7 | On success: returns summary `{ tenants: N, enqueued: M }`                                                                         | Verified in job return value                                                               |           |
| 5.1.8 | Concurrency: running twice simultaneously does not dispatch the same notification_id twice (idempotency_key or status transition) | Verified                                                                                   |           |

### 5.2 Error cases

| #     | Scenario                                                                                                           | Expected                                       | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- | --------- |
| 5.2.1 | DB unreachable                                                                                                     | Retry; eventually dead-letter after 3 attempts |           |
| 5.2.2 | A malformed notification row (null `recipient_user_id`) → processor logs warning, skips that row, processes others | Other rows still dispatched                    |           |

---

## 6. Job: `communications:dispatch-notifications`

**File:** `apps/worker/src/processors/communications/dispatch-notifications.processor.ts`
**Payload:** `{ tenant_id, notification_ids?: string[], announcement_id?: string, batch_index?: number }`
**Purpose:** Actually send notifications via Resend / Twilio for the given batch.

### 6.1 Per-channel dispatch

| #      | Channel  | Scenario                                                                           | Expected                                                                                                                                                                                                         | Pass/Fail |
| ------ | -------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1.1  | email    | 1 queued notification dispatched                                                   | Resend API called with `to = user.email`, `from = RESEND_FROM_EMAIL`, subject/body rendered from template + payload_json; on success `notifications.status = 'sent'`, `provider_message_id` set, `sent_at` = now |           |
| 6.1.2  | email    | Resend returns 400 (invalid email)                                                 | `notifications.status = 'failed'`, `failure_reason = 'resend_400: <detail>'`, no retry                                                                                                                           |           |
| 6.1.3  | email    | Resend returns 500                                                                 | Retry up to 3 attempts with exponential backoff; final failure → `failed`                                                                                                                                        |           |
| 6.1.4  | sms      | 1 queued notification dispatched                                                   | Twilio REST API called with `to = user.phone`, `from = TWILIO_SMS_FROM`; on success status=sent, provider_message_id = Twilio MessageSid                                                                         |           |
| 6.1.5  | sms      | Message body > 1600 chars                                                          | Twilio auto-splits into multi-part; all parts dispatched; DB row counts as one notification                                                                                                                      |           |
| 6.1.6  | sms      | Phone number invalid (E.164 fail)                                                  | `failed`, `failure_reason = 'twilio_error: 21211'` (Invalid To number)                                                                                                                                           |           |
| 6.1.7  | whatsapp | 1 queued notification dispatched                                                   | Twilio WhatsApp API called with `To = whatsapp:+...`                                                                                                                                                             |           |
| 6.1.8  | whatsapp | Recipient outside 24h session window, template not approved                        | `failed`, `failure_reason` includes code `63016` or `63003`                                                                                                                                                      |           |
| 6.1.9  | in_app   | in_app should NOT hit this processor (dispatch-queued filter)                      | If it does, short-circuit to `delivered` without external API                                                                                                                                                    |           |
| 6.1.10 | email    | User has opted out (`notification_preferences.opt_out=true` for this template_key) | Skipped; `notifications.status = 'failed'`, `failure_reason = 'user_opted_out'`; no API call                                                                                                                     |           |

### 6.2 Fallback chain

Fallback order: `whatsapp → sms → email → in_app`.

| #     | Scenario                                                                                                                | Expected                                                          | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------- |
| 6.2.1 | User's primary channel preference is whatsapp; whatsapp fails                                                           | A new notification row with `channel='sms'` is enqueued           |           |
| 6.2.2 | SMS also fails                                                                                                          | New row with `channel='email'`                                    |           |
| 6.2.3 | Email also fails                                                                                                        | New row with `channel='in_app'`; dispatch sets status='delivered' |           |
| 6.2.4 | Each fallback row shares `source_entity_type + source_entity_id + idempotency_key(chain)` to allow tracing              | Yes                                                               |           |
| 6.2.5 | Fallback disabled for this notification (e.g., `disable_fallback=true` on the triggering message) → no chain on failure | Single failed row, no new rows                                    |           |

### 6.3 Idempotency

| #     | Scenario                                                                                       | Expected                                                                                           | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------- |
| 6.3.1 | Same notification_id dispatched twice (worker retry after partial success)                     | Second attempt short-circuits on `idempotency_key` unique constraint; no duplicate Resend API call |           |
| 6.3.2 | `idempotency_key` format: `{notification_id}:{channel}:{attempt}`                              | Verified                                                                                           |           |
| 6.3.3 | When Resend returns the same provider_message_id for a retried call: we do NOT update DB twice | Only first webhook sets `sent_at`                                                                  |           |

### 6.4 Observability

| #     | Assertion                                                                                  | Expected         | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------ | ---------------- | --------- |
| 6.4.1 | Processor logs `[Dispatch] tenant=<id> channel=<c> notif=<id> status=<s>` per notification | Log line present |           |
| 6.4.2 | Sentry breadcrumb on failed dispatch includes `failure_reason` but not API key             | Verified         |           |
| 6.4.3 | Slow dispatch (> 5 sec per item) triggers a warning log                                    | Yes              |           |

---

## 7. Job: `communications:publish-announcement`

**File:** `apps/worker/src/processors/communications/publish-announcement.processor.ts`
**Payload:** `{ tenant_id, announcement_id }`

### 7.1 Happy path

| #     | Scenario                                                                                    | Expected                                                                          | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------- |
| 7.1.1 | Announcement status=draft, scope=school                                                     | Status → published; published_at = now; ~N notifications created (one per parent) |           |
| 7.1.2 | Scope=year_group, target_payload.year_group_id set                                          | Audience resolved to only that year group's parents; notifications count matches  |           |
| 7.1.3 | Scope=custom with saved_audience_id                                                         | Audience resolved via `AudienceResolutionService`; count matches                  |           |
| 7.1.4 | Notifications are created atomically with the announcement status change (same transaction) | Either both succeed or both roll back on failure                                  |           |
| 7.1.5 | delivery_channels = ['in_app', 'email']                                                     | One notification per channel per recipient (2N total) created                     |           |
| 7.1.6 | delivery_channels = ['in_app'] only                                                         | N notifications, in_app channel, status='delivered' (instant)                     |           |

### 7.2 Edge cases

| #     | Scenario                                                                                                                                              | Expected                                                                            | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------- |
| 7.2.1 | Announcement already published when cron fires (someone published manually first)                                                                     | Job no-ops; logs `already_published`                                                |           |
| 7.2.2 | Announcement archived before cron fires                                                                                                               | Job no-ops; logs `archived_skip`                                                    |           |
| 7.2.3 | Audience resolves to zero recipients                                                                                                                  | Announcement status = published but 0 notifications; no crash                       |           |
| 7.2.4 | Audience resolution throws (e.g., dynamic saved_audience cycle)                                                                                       | Retry up to 3 attempts; on final failure, announcement stays in draft; error logged |           |
| 7.2.5 | Transactional rollback: a DB error mid-notification-insertion                                                                                         | Announcement stays in original state; no orphan notifications                       |           |
| 7.2.6 | Scheduled publish at T; job scheduled with `delay = T - enqueue_time`; BullMQ dedupe key `cron:communications:publish-announcement:{announcement_id}` | Present and effective                                                               |           |
| 7.2.7 | Scheduled publish re-requested after job already queued → dedupe rejects duplicate; only one job runs                                                 | Verified                                                                            |           |

### 7.3 Template + locale resolution

| #     | Scenario                                                                                | Expected                                                                     | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------- |
| 7.3.1 | User's preferred locale = 'ar' and template exists for `announcement.published` in 'ar' | Use Arabic template                                                          |           |
| 7.3.2 | User's preferred locale = 'ar' but only 'en' template exists                            | Fallback to English; log warning                                             |           |
| 7.3.3 | Tenant-specific template overrides platform template                                    | Use tenant template                                                          |           |
| 7.3.4 | Handlebars render error (missing variable)                                              | Gracefully render with empty string or placeholder; log warning; don't crash |           |
| 7.3.5 | Template output length > SMS limit (1600)                                               | Twilio splits; email/whatsapp send as-is                                     |           |

---

## 8. Job: `communications:announcement-approval-callback`

**Purpose:** When an announcement goes through an approval workflow and gets approved, this job transitions status `pending_approval → scheduled` (or `→ published`) and enqueues publish.

### 8.1 Behaviour

| #     | Scenario                                                                               | Expected                                             | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------- |
| 8.1.1 | ApprovalRequest callback with decision=approved, approval scheduled_publish_at is null | Status → published; publish job runs                 |           |
| 8.1.2 | ApprovalRequest callback with decision=approved, future scheduled_publish_at           | Status → scheduled; publish job scheduled with delay |           |
| 8.1.3 | ApprovalRequest callback with decision=rejected                                        | Status → draft (or cancelled); publish not enqueued  |           |
| 8.1.4 | Callback with unknown announcement_id                                                  | Safe skip, warning logged                            |           |
| 8.1.5 | Double-callback (replay)                                                               | Idempotent: if already published or scheduled, no-op |           |

---

## 9. Job: `communications:inquiry-notification`

**Purpose:** Send notification to admin (on new parent inquiry) or to parent (on admin reply).

### 9.1 Behaviour

| #     | Scenario                                                                                         | Expected                                                                            | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | --------- |
| 9.1.1 | Parent submits new inquiry                                                                       | Job enqueued with payload `{ tenant_id, inquiry_id, direction: 'parent_to_admin' }` |           |
| 9.1.2 | Admin replies to inquiry                                                                         | Job enqueued with payload `{ ..., direction: 'admin_to_parent' }`                   |           |
| 9.1.3 | Notification recipients: admins = all users with `inquiries.view`; parent = inquiry's parent     | Correct recipients                                                                  |           |
| 9.1.4 | Template keys: `inquiry.new_message`, `inquiry.admin_replied`                                    | Correct keys                                                                        |           |
| 9.1.5 | Delivery channels: in_app + email by default; respects `notification_settings.channels` per user | Matches preferences                                                                 |           |
| 9.1.6 | When inquiry closed: no notifications for subsequent events                                      | Short-circuit                                                                       |           |

---

## 10. Job: `safeguarding:scan-message`

**File:** `apps/worker/src/processors/safeguarding/message-scan.processor.ts`
**Payload:** `{ tenant_id, conversation_id, message_id }`

### 10.1 Happy path

| #      | Scenario                                                            | Expected                                                                                                                 | Pass/Fail |
| ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| 10.1.1 | Message body contains high-severity keyword "bully"                 | `message_flags` row created with `matched_keywords = ['bully']`, `highest_severity = 'high'`, `review_state = 'pending'` |           |
| 10.1.2 | Message body contains multiple keywords at mixed severities         | highest_severity = MAX across matches; matched_keywords = all                                                            |           |
| 10.1.3 | Message body contains no keywords                                   | No flag row created                                                                                                      |           |
| 10.1.4 | Message is system-authored (sender_user_id = SYSTEM_USER_SENTINEL)  | Skipped, no flag                                                                                                         |           |
| 10.1.5 | Message is soft-deleted (deleted_at set)                            | Skipped                                                                                                                  |           |
| 10.1.6 | Message has been deleted between enqueue and processing (not found) | Safe skip, no error                                                                                                      |           |

### 10.2 Keyword matching semantics

| #      | Scenario                                                                               | Expected                                            | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------- | --------------------------------------------------- | --------- |
| 10.2.1 | Keyword "bully" matches "bullying"                                                     | Yes — case-insensitive substring match              |           |
| 10.2.2 | Keyword "bully" matches "BULLY"                                                        | Yes — case-insensitive                              |           |
| 10.2.3 | Keyword containing regex specials (".\*+?") escapes them                               | Matches literal chars only                          |           |
| 10.2.4 | Keyword "self-harm" in message "self harm"                                             | Matches — fuzzy whitespace/hyphen (or configurable) |           |
| 10.2.5 | Deactivated keyword (`active=false`)                                                   | Skipped                                             |           |
| 10.2.6 | Keyword cache TTL = 5 min per tenant; update to keyword list takes effect within 5 min | Verified via time travel                            |           |
| 10.2.7 | First scan after 5 min cache expiry: keyword list re-fetched                           | DB query logged                                     |           |

### 10.3 Idempotency and updates

| #      | Scenario                                                                                            | Expected         | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------- | ---------------- | --------- |
| 10.3.1 | Re-scan of a message previously flagged with same keywords → upsert (no duplicate row)              | One row only     |           |
| 10.3.2 | Re-scan after keyword added: flag created                                                           | New row          |           |
| 10.3.3 | Re-scan after keyword removed such that message no longer matches anything → flag row deleted       | Row deleted      |           |
| 10.3.4 | Re-scan after keyword removed but message still matches others: `matched_keywords` shrunk, row kept | Updated in place |           |

### 10.4 Side-effect: enqueue notify-reviewers

| #      | Scenario                                               | Expected                                        | Pass/Fail |
| ------ | ------------------------------------------------------ | ----------------------------------------------- | --------- |
| 10.4.1 | New flag created (previously no flag for this message) | `safeguarding:notify-reviewers` job enqueued    |           |
| 10.4.2 | Existing flag updated (e.g., new keyword added)        | No duplicate notify-reviewers job               |           |
| 10.4.3 | Flag deleted                                           | No notify-reviewers enqueued (it's a downgrade) |           |

### 10.5 RLS and isolation

| #      | Scenario                                           | Expected             | Pass/Fail |
| ------ | -------------------------------------------------- | -------------------- | --------- |
| 10.5.1 | Keyword list loaded for each tenant's context only | No cross-tenant leak |           |
| 10.5.2 | Flag row `tenant_id` matches message's `tenant_id` | Yes                  |           |

---

## 11. Job: `safeguarding:notify-reviewers`

**Payload:** `{ tenant_id, message_flag_id }`

### 11.1 Behaviour

| #      | Scenario                                                                                                       | Expected                                                  | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------- |
| 11.1.1 | Flag created — notify all admin-tier users (owner, principal, vice_principal) with active inbox.oversight.read | Notification rows created per admin-tier user per channel |           |
| 11.1.2 | Template key: `safeguarding.flag.new` (or similar)                                                             | Correct template                                          |           |
| 11.1.3 | Channels: respect `notification_settings` per admin                                                            | Matches preferences                                       |           |
| 11.1.4 | Flag has high severity → notification body highlights severity                                                 | Content matches template                                  |           |
| 11.1.5 | Admin opted out of `safeguarding.flag.new` notification type                                                   | No notification row for them                              |           |

---

## 12. Job: `safeguarding:critical-escalation`

**Payload:** `{ tenant_id, message_flag_id }`
**Trigger:** Flag with severity=high + no review within N hours

### 12.1 Behaviour

| #      | Scenario                                                                | Expected              | Pass/Fail |
| ------ | ----------------------------------------------------------------------- | --------------------- | --------- |
| 12.1.1 | Enqueued when `sla-check` identifies a stale pending high-severity flag | Yes                   |           |
| 12.1.2 | Escalation notifies safeguarding designated-lead (DSL) if configured    | Notification sent     |           |
| 12.1.3 | Escalation writes an audit log entry                                    | Row present           |           |
| 12.1.4 | Idempotent — re-running does not duplicate notifications                | Checked via dedup key |           |

---

## 13. Job: `safeguarding:sla-check`

**Cron:** hourly
**Purpose:** Scan pending high-severity flags; enqueue critical-escalation if past SLA.

### 13.1 Behaviour

| #      | Scenario                                                       | Expected                                       | Pass/Fail |
| ------ | -------------------------------------------------------------- | ---------------------------------------------- | --------- |
| 13.1.1 | No flags past SLA                                              | No-op; logs summary                            |           |
| 13.1.2 | One flag past SLA                                              | Enqueues critical-escalation with that flag_id |           |
| 13.1.3 | Cross-tenant sweep: processes all tenants, sets RLS per tenant | No cross-contamination                         |           |
| 13.1.4 | Cron dedup key `cron:safeguarding:sla-check`                   | Present                                        |           |

---

## 14. Job: `safeguarding:scan-attachment`

**Purpose:** Scan file metadata / filename for safeguarding concerns (e.g., filename = "incident.pdf").

### 14.1 Behaviour

| #      | Scenario                                                                           | Expected              | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------- | --------------------- | --------- |
| 14.1.1 | Attachment uploaded → job enqueued with `{ tenant_id, message_id, attachment_id }` | Enqueue               |           |
| 14.1.2 | Scans filename against keyword list (case-insensitive)                             | Creates flag if match |           |
| 14.1.3 | Does NOT scan file contents (out of scope — would need virus/malware tooling)      | Documented            |           |
| 14.1.4 | File deleted before scan                                                           | Safe skip             |           |

---

## 15. Job: `safeguarding:break-glass-expiry`

**Cron:** every 15 min
**Purpose:** Expire time-limited break-glass grants (admin-tier emergency access to conversations).

### 15.1 Behaviour

| #      | Scenario                                              | Expected       | Pass/Fail |
| ------ | ----------------------------------------------------- | -------------- | --------- |
| 15.1.1 | Break-glass grant with `expires_at < NOW()` → revoked | DB row updated |           |
| 15.1.2 | Grant audit log entry written                         | Yes            |           |
| 15.1.3 | Cross-tenant sweep                                    | All tenants    |           |

---

## 16. Job: `inbox:fallback-check`

**Cron:** every 15 min
**Purpose:** Find messages that have been un-read past the SLA and trigger the fallback.

### 16.1 Behaviour

| #      | Scenario                                                                                               | Expected                                             | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | --------- |
| 16.1.1 | Message created 4 h ago, recipient hasn't read, tenant `fallback_teacher_after_hours=3`                | Enqueue `inbox:fallback-scan-tenant` for that tenant |           |
| 16.1.2 | Message `disable_fallback=true`                                                                        | Skipped                                              |           |
| 16.1.3 | Tenant fallback disabled (`fallback_teacher_enabled=false`)                                            | Skipped                                              |           |
| 16.1.4 | Message already has `fallback_dispatched_at` set                                                       | Skipped (idempotent)                                 |           |
| 16.1.5 | Cron dedup key `cron:inbox:fallback-check`                                                             | Present                                              |           |
| 16.1.6 | Cross-tenant batch: enqueues one per-tenant job with its IDs                                           | Yes                                                  |           |
| 16.1.7 | Admin fallback uses `fallback_admin_after_hours`; teacher fallback uses `fallback_teacher_after_hours` | Separate thresholds honoured                         |           |

---

## 17. Job: `inbox:fallback-scan-tenant`

**Payload:** `{ tenant_id, message_ids: string[] }`
**Purpose:** Actually dispatch fallback notifications for old unread messages in a single tenant.

### 17.1 Behaviour

| #      | Scenario                                                                                                                                           | Expected                                                                            | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------- |
| 17.1.1 | 1 message past SLA, recipient has email preference                                                                                                 | Enqueue notification via `communications:dispatch-notifications` with channel=email |           |
| 17.1.2 | Multiple recipients                                                                                                                                | One notification per recipient                                                      |           |
| 17.1.3 | After dispatch: `messages.fallback_dispatched_at = NOW()` — prevents re-dispatch                                                                   | Column set                                                                          |           |
| 17.1.4 | Test fallback endpoint: `POST /v1/inbox/settings/fallback/test` → enqueues one-shot job with fake message                                          | Verified in dev mode only (INBOX_ALLOW_TEST_FALLBACK=true)                          |           |
| 17.1.5 | Concurrent runs dispatch same message → guarded by `fallback_dispatched_at` race-condition check (UPDATE ... WHERE fallback_dispatched_at IS NULL) | Only one dispatch                                                                   |           |

### 17.2 Channel selection

| #      | Scenario                                                                               | Expected                         | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------- | -------------------------------- | --------- |
| 17.2.1 | Recipient role=teacher, sender=parent: teacher fallback settings apply                 | Uses `fallback_teacher_channels` |           |
| 17.2.2 | Recipient role=parent, sender=admin: admin fallback applies (admin broadcast fallback) | Uses `fallback_admin_channels`   |           |
| 17.2.3 | Recipient has no phone → skip SMS; continue with email                                 | Channel array filtered           |           |

---

## 18. Cron Registration

### 18.1 CronSchedulerService inventory

| #      | Cron job name                              | Schedule                            | Dedup jobId                                     | Payload                          | Pass/Fail |
| ------ | ------------------------------------------ | ----------------------------------- | ----------------------------------------------- | -------------------------------- | --------- |
| 18.1.1 | `notifications:dispatch-queued`            | every 30s                           | `cron:notifications:dispatch-queued`            | none (cross-tenant)              |           |
| 18.1.2 | `inbox:fallback-check`                     | every 15 min                        | `cron:inbox:fallback-check`                     | none                             |           |
| 18.1.3 | `safeguarding:sla-check`                   | hourly                              | `cron:safeguarding:sla-check`                   | none                             |           |
| 18.1.4 | `safeguarding:break-glass-expiry`          | every 15 min                        | `cron:safeguarding:break-glass-expiry`          | none                             |           |
| 18.1.5 | `communications:publish-announcement:{id}` | delayed job at scheduled_publish_at | `cron:communications:publish-announcement:{id}` | `{ tenant_id, announcement_id }` |           |

### 18.2 Cron robustness

| #      | Scenario                                                              | Expected                        | Pass/Fail |
| ------ | --------------------------------------------------------------------- | ------------------------------- | --------- |
| 18.2.1 | App restart: cron re-registers on OnModuleInit; no duplicate jobs     | BullMQ dedup via jobId          |           |
| 18.2.2 | Worker crash mid-cron: next tick re-fires; partial writes rolled back | Transactional                   |           |
| 18.2.3 | Cron unable to acquire lock (Redis busy)                              | Retry next tick                 |           |
| 18.2.4 | Removing a cron at runtime: remove by jobId                           | Job disappears from delayed set |           |

---

## 19. Side-effect Chains

### 19.1 Message send → safeguarding scan → flag → notify reviewers

| #      | Step                                                                              | Expected                                         | Pass/Fail |
| ------ | --------------------------------------------------------------------------------- | ------------------------------------------------ | --------- |
| 19.1.1 | User sends message with body "this is bullying"                                   | `messages` row inserted                          |           |
| 19.1.2 | `InboxOutboxService` enqueues `safeguarding:scan-message` in the same transaction | Job on queue                                     |           |
| 19.1.3 | Scanner processes; creates `message_flags` row                                    | Flag row present                                 |           |
| 19.1.4 | Scanner enqueues `safeguarding:notify-reviewers`                                  | Second job enqueued                              |           |
| 19.1.5 | Notify-reviewers enqueues notifications                                           | Notifications created for each admin-tier user   |           |
| 19.1.6 | `notifications:dispatch-queued` cron picks up queued notifications                | Enqueues `communications:dispatch-notifications` |           |
| 19.1.7 | Dispatch sends via Resend / Twilio                                                | Provider message IDs recorded                    |           |
| 19.1.8 | Webhook confirms delivery                                                         | `notifications.delivered_at` set                 |           |
| 19.1.9 | End-to-end latency from send to delivered ≤ 3 min under normal load               | Yes                                              |           |

### 19.2 Announcement publish → audience resolve → notifications → dispatch

| #      | Step                                                            | Expected                                       | Pass/Fail |
| ------ | --------------------------------------------------------------- | ---------------------------------------------- | --------- |
| 19.2.1 | Admin publishes announcement with scope=year_group              | `communications:publish-announcement` enqueued |           |
| 19.2.2 | Processor resolves audience                                     | `AudienceResolutionService` returns user_ids   |           |
| 19.2.3 | Processor bulk-creates notifications (one per user per channel) | Inserts performed atomically                   |           |
| 19.2.4 | In-app notifications immediately delivered                      | `status='delivered'`                           |           |
| 19.2.5 | Email/SMS/WhatsApp notifications status=queued                  | Yes                                            |           |
| 19.2.6 | Cron dispatches queued                                          | `communications:dispatch-notifications` fires  |           |
| 19.2.7 | Announcement status → published; published_at set               | Yes                                            |           |

### 19.3 Parent inquiry → admin notification

| #      | Step                                                           | Expected                             | Pass/Fail |
| ------ | -------------------------------------------------------------- | ------------------------------------ | --------- |
| 19.3.1 | Parent submits `POST /v1/inquiries`                            | Inquiry + first message rows created |           |
| 19.3.2 | `communications:inquiry-notification` enqueued                 | Job on queue                         |           |
| 19.3.3 | Processor creates notifications for all `inquiries.view` users | Notifications rows inserted          |           |
| 19.3.4 | Dispatch cron picks up; admin receives email + in-app          | Verified                             |           |

### 19.4 Fallback chain on dispatch failure

| #      | Step                                                                   | Expected                                                                | Pass/Fail |
| ------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------- |
| 19.4.1 | WhatsApp dispatch fails                                                | Fallback notification (channel=sms) enqueued                            |           |
| 19.4.2 | SMS dispatch fails                                                     | Fallback notification (channel=email) enqueued                          |           |
| 19.4.3 | Email dispatch fails                                                   | Fallback notification (channel=in_app) enqueued; dispatched immediately |           |
| 19.4.4 | End state: user has 4 notification rows, final in_app row is delivered | Yes                                                                     |           |

---

## 20. Dead-Letter Queue

### 20.1 Policy

| #      | Assertion                                                                | Expected                         | Pass/Fail |
| ------ | ------------------------------------------------------------------------ | -------------------------------- | --------- |
| 20.1.1 | After 3 attempts, a job lands in `bull:<queue>:failed` set               | Yes                              |           |
| 20.1.2 | Failed jobs retained for `removeOnFail: 50` entries; oldest evicted FIFO | Yes                              |           |
| 20.1.3 | Manual replay endpoint / tool available for admin                        | Documented                       |           |
| 20.1.4 | Replay-safe: processing is idempotent                                    | Yes                              |           |
| 20.1.5 | Alerts on failed queue size > 10                                         | Sentry or Prometheus alert fires |           |

### 20.2 Idempotency of replays

| #      | Job                                     | Safe to replay?                                                                       | Pass/Fail |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------------- | --------- |
| 20.2.1 | `communications:dispatch-notifications` | Yes — idempotency_key dedup                                                           |           |
| 20.2.2 | `communications:publish-announcement`   | Yes — status check at start                                                           |           |
| 20.2.3 | `communications:inquiry-notification`   | Yes — recreates missing notifications                                                 |           |
| 20.2.4 | `safeguarding:scan-message`             | Yes — upsert                                                                          |           |
| 20.2.5 | `safeguarding:notify-reviewers`         | Mostly — may send duplicate notifications if not deduped by flag_id + user_id; verify |           |
| 20.2.6 | `inbox:fallback-check`                  | Yes — cross-tenant cron                                                               |           |
| 20.2.7 | `inbox:fallback-scan-tenant`            | Yes — `fallback_dispatched_at` guard                                                  |           |

---

## 21. Sign-off

| Section                           | Reviewer | Date | Pass | Fail | Notes |
| --------------------------------- | -------- | ---- | ---- | ---- | ----- |
| 5. dispatch-queued                |          |      |      |      |       |
| 6. dispatch-notifications         |          |      |      |      |       |
| 7. publish-announcement           |          |      |      |      |       |
| 8. announcement-approval-callback |          |      |      |      |       |
| 9. inquiry-notification           |          |      |      |      |       |
| 10-15. safeguarding jobs          |          |      |      |      |       |
| 16-17. inbox fallback             |          |      |      |      |       |
| 18. cron registration             |          |      |      |      |       |
| 19. side-effect chains            |          |      |      |      |       |
| 20. dead-letter                   |          |      |      |      |       |

**Worker spec is release-ready when every job section + cron + dead-letter policy is signed off at Pass. A stuck `notifications` queue (> 100 items in `wait` set) or failed-set growth > 10 is a P0 incident.**
