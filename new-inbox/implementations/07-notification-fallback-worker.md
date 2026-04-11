# Implementation 07 — Notification Fallback Worker

> **Wave:** 3 (parallel with 06, 08, 09)
> **Depends on:** 01, 04, 06
> **Deploys:** Worker restart only

---

## Goal

Build the **fallback escalation worker** that watches for unread inbox messages older than the tenant's configured threshold and re-sends them via the tenant's chosen fallback channels (Email / SMS / WhatsApp). Two separate SLAs: **admin broadcasts** (default 24h) and **teacher messages** (default 3h). Per-tenant, per-source-class configurable.

## What to build

### 1. The cron job

`apps/worker/src/processors/inbox-fallback-check.processor.ts`

A BullMQ scheduled job, registered in `CronSchedulerService` with a 15-minute interval:

```ts
const INBOX_FALLBACK_CHECK_JOB = 'inbox:fallback-check';
const INBOX_FALLBACK_CHECK_SCHEDULE = '*/15 * * * *'; // every 15 minutes

// In CronSchedulerService.onModuleInit:
await this.notificationsQueue.add(
  INBOX_FALLBACK_CHECK_JOB,
  {}, // empty payload — cross-tenant scan
  {
    repeat: { pattern: INBOX_FALLBACK_CHECK_SCHEDULE },
    jobId: `cron:${INBOX_FALLBACK_CHECK_JOB}`,
    removeOnComplete: 10,
    removeOnFail: 50,
  },
);
```

### 2. The processor logic

```ts
@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class InboxFallbackCheckProcessor extends WorkerHost {
  async process(job: Job): Promise<void> {
    if (job.name !== INBOX_FALLBACK_CHECK_JOB) return;

    // 1. Load all tenants with messaging enabled.
    const tenants = await this.tenantsReadFacade.findIdsWithInboxFallbackEnabled();

    // 2. For each tenant, fan out to a per-tenant scan job (so a slow tenant doesn't block others).
    for (const tenantId of tenants) {
      await this.notificationsQueue.add(
        INBOX_FALLBACK_SCAN_TENANT_JOB,
        { tenant_id: tenantId },
        { removeOnComplete: 50, removeOnFail: 100 },
      );
    }
  }
}
```

A second processor handles the per-tenant scan:

```ts
@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class InboxFallbackScanTenantProcessor extends WorkerHost {
  async process(job: Job): Promise<void> {
    if (job.name !== INBOX_FALLBACK_SCAN_TENANT_JOB) return;

    const { tenant_id } = job.data;
    await this.runInTenantContext(tenant_id, async (tx) => {
      const settings = await this.inboxSettingsRepo.findByTenant(tx, tenant_id);
      if (!settings.messaging_enabled) return;

      const now = Date.now();

      // Two parallel scans — one per source class.
      if (settings.fallback_admin_enabled) {
        await this.scanAndDispatch({
          tx,
          tenantId: tenant_id,
          senderRoles: ['owner', 'principal', 'vice_principal', 'office', 'finance', 'nurse'],
          maxAgeMs: settings.fallback_admin_after_hours * 3600 * 1000,
          channels: settings.fallback_admin_channels,
          now,
        });
      }
      if (settings.fallback_teacher_enabled) {
        await this.scanAndDispatch({
          tx,
          tenantId: tenant_id,
          senderRoles: ['teacher'],
          maxAgeMs: settings.fallback_teacher_after_hours * 3600 * 1000,
          channels: settings.fallback_teacher_channels,
          now,
        });
      }
    });
  }

  private async scanAndDispatch(input: {...}) {
    // 1. Find messages where:
    //    - tenant_id = input.tenantId
    //    - sender role ∈ input.senderRoles
    //    - created_at < now - maxAgeMs
    //    - fallback_dispatched_at IS NULL
    //    - disable_fallback = false
    //    - At least one participant has unread_count > 0 OR no message_reads row exists
    //
    // 2. For each unread recipient, enqueue an external-channel send job per channel
    //    in input.channels (reuse existing notification dispatch service).
    //
    // 3. Stamp messages.fallback_dispatched_at = now() so we don't re-fire next cycle.
  }
}
```

### 3. The actual fallback query

The query is the heart of this impl. It must:

- Be efficient (uses `idx_messages_fallback_scan` from impl 01).
- Batch results to avoid loading hundreds of thousands of rows in one go.
- Process in chunks of 500 messages per cycle (configurable constant).

The recommended SQL (raw, inside the RLS transaction):

```sql
SELECT
  m.id,
  m.conversation_id,
  m.sender_user_id,
  m.body,
  array_agg(DISTINCT cp.user_id) FILTER (WHERE cp.unread_count > 0) AS unread_recipient_ids
FROM messages m
JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
JOIN users sender ON sender.id = m.sender_user_id
WHERE m.tenant_id = $1
  AND m.created_at < $2
  AND m.fallback_dispatched_at IS NULL
  AND m.disable_fallback = false
  AND m.deleted_at IS NULL
  AND cp.user_id != m.sender_user_id
  -- sender role filter
  AND EXISTS (
    SELECT 1 FROM user_messaging_role_resolved umr
    WHERE umr.user_id = m.sender_user_id
      AND umr.messaging_role = ANY($3::messaging_role[])
  )
GROUP BY m.id, m.conversation_id, m.sender_user_id, m.body
HAVING COUNT(*) FILTER (WHERE cp.unread_count > 0) > 0
ORDER BY m.created_at
LIMIT 500;
```

> Note: `user_messaging_role_resolved` is **not** a real table. The role mapping happens in code (impl 02). Either replicate the mapping logic in SQL via a CASE on `users.role` (acceptable for this read-only scan) or fetch the message ids first and resolve roles in TypeScript before dispatching. The TypeScript path is safer — adopt that:

Refined approach:

```
1. Load up to 500 candidate messages from the SQL above, MINUS the role filter.
2. Resolve each message's sender role via RoleMappingService.
3. Filter the list to those whose sender role is in the senderRoles set for this scan.
4. For each survivor, dispatch + stamp.
```

### 4. Per-recipient dispatch

For each surviving message, the worker:

1. Loads the unread recipients' contact info via the existing communications module's contact resolution (`resolveParentContacts`, `resolveStaffContacts` — extend if needed).
2. For each channel in `input.channels`:
   - Constructs the `ChannelSendInput` with the message preview as the body.
   - Calls `NotificationDispatchService.dispatchToProvider(channel, input)`.
3. Stamps `messages.fallback_dispatched_at = now()` (single UPDATE per message regardless of recipient count).

The fallback **does NOT** mark the message as read in the inbox — it's a notification, not a delivery. The recipient still needs to open the inbox to clear the unread count.

### 5. Per-message opt-out

The `disable_fallback` flag on the message (stamped at compose time when the sender ticked "Don't escalate") short-circuits this entire pipeline. Cover with a test.

### 6. Tenant settings extension

The `tenant_settings_inbox` table from impl 01 already has the seven fallback fields. This implementation does **not** need to extend the schema — it consumes the existing columns. The settings UI lands in impl 15.

### 7. Module wiring

- `apps/worker/src/processors/` gets the two new processors.
- `CronSchedulerService.onModuleInit` registers the cron.
- The worker module imports `CommunicationsModule`, `InboxModule`, `TenantsModule` for the dependencies.
- Cross-module Prisma rule: this worker reads from messages, conversation_participants, users, tenant_settings_inbox. All of those are inbox-owned (or platform-owned for users) — fine.

## Tests

`inbox-fallback-check.processor.spec.ts`:

- Routes by job.name
- Fans out to per-tenant scan jobs
- Skips tenants with messaging disabled

`inbox-fallback-scan-tenant.processor.spec.ts`:

- Scans both admin and teacher buckets when both enabled
- Skips admin bucket when fallback_admin_enabled = false
- Filters by sender role correctly
- Filters by age threshold correctly
- Stamps fallback_dispatched_at after dispatch
- Skips messages with disable_fallback = true
- Skips messages where all recipients have read
- Caps at 500 messages per cycle
- RLS scoped to tenant (cross-tenant message not picked up)

## Watch out for

- **The 15-minute cron interval** is a granularity floor. A tenant with a 3-hour teacher SLA will see messages escalated between 3:00 and 3:15 hours after send — that's the design. Don't reduce the interval to chase real-time; the existing notifications queue can't handle every-minute scans across hundreds of tenants.
- **Idempotency.** If a fallback dispatch fails partway, the message stays unstamped and gets retried next cycle. That's intentional. But the per-channel send job has its own idempotency (existing notification_attempts table tracks attempts) so the user doesn't get the same SMS twice.
- **Time skew.** Use `now()` from the database, not the worker process. Subtle but matters when workers and DB drift.
- **The SQL `LIMIT 500` is a chunk size, not a per-tenant cap.** A tenant with 10,000 unread admin broadcasts will burn 20 cron cycles (5 hours) to drain. That's acceptable for v1 — flag in follow-up if a real tenant hits this.
- **Don't escalate frozen conversations.** Add `AND conversations.frozen_at IS NULL` to the query. A frozen thread is inactive — falling back would surprise the user.
- **Don't escalate to the sender.** The query already excludes `cp.user_id = m.sender_user_id` but double-check it survives the TypeScript transformation.
- **Recipients with no contact info.** A parent with no email or phone simply can't be escalated. Skip them silently in this impl (no need to log per parent — too noisy). Future telemetry can surface "X recipients had no fallback channel" as a tenant warning.

## Deployment notes

- Worker restart only.
- After deploy: `pm2 logs worker | grep inbox-fallback` should show the cron registering.
- Send a test message as Principal to a teacher with a 1-hour fallback override (set `fallback_admin_after_hours = 0` temporarily on the test tenant), wait 16 minutes, verify the message gets stamped and the existing notifications dispatch path fires.
- Reset the override after the smoke test.
