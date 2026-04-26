# Implementation 06 — Inbox Channel Provider in Dispatcher

> **Wave:** 3 (parallel with 07, 08, 09)
> **Depends on:** 01, 04
> **Deploys:** API restart only

---

## Goal

Make the **inbox the default-on, fourth channel** of the existing notification dispatch pipeline. Today the announcement dispatcher fans out to SMS / Email / WhatsApp via `NotificationDispatchService`. After this implementation, every announcement also lands in the recipients' inboxes — and senders can choose to add SMS / Email / WhatsApp on top, with inbox always included.

The flow goes both directions:

- **Old `Announcement.create` flow** → still works → now also creates a broadcast conversation in the inbox.
- **New `ConversationsService.createBroadcast` flow** (impl 04) → calls into the dispatcher to fan out to extra channels → existing providers handle SMS/Email/WhatsApp without changes.

The **inbox is always on**. There is no code path that lets a sender bypass it.

## What to build

### 1. The new channel provider

`apps/api/src/modules/communications/providers/inbox-channel.provider.ts`

The existing `apps/api/src/modules/communications/providers/` directory holds `email`, `sms`, `whatsapp` providers. Add a fourth.

```ts
@Injectable()
export class InboxChannelProvider implements NotificationChannelProvider {
  readonly key = 'inbox' as const;

  constructor(private readonly conversationsService: ConversationsService) {}

  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    // No-op: the inbox row was already created by the conversations service
    // when the broadcast was sent. This provider exists so the dispatcher
    // can list 'inbox' as a channel and the per-recipient stamping
    // (delivery state, opens, etc.) flows through the same telemetry.
    return { status: 'delivered_synchronously' };
  }
}
```

The inbox doesn't actually do anything at dispatch time because the `ConversationsService.createBroadcast` already wrote the participant rows synchronously. The provider exists to:

1. Make the dispatcher's channel list complete (the dispatcher iterates `[...selectedChannels, 'inbox']` so the inbox always appears).
2. Give downstream telemetry (notification_attempts table) a uniform shape — every channel produces a delivery row.
3. Be the place a future "inbox push" implementation hooks in (when mobile push lands).

### 2. Wire it into the existing dispatcher

`apps/api/src/modules/communications/notification-dispatch.service.ts`

Find the existing `dispatchToChannels` (or equivalent) method. Update it to:

1. **Always prepend `'inbox'` to the channel list** unless the input is from a code path that has already-written-the-inbox-row (which it always will be after impl 04 deploys).
2. Iterate channels and call the matching provider.

Concretely, the dispatch input gains a new field:

```ts
type DispatchInput = {
  // ... existing fields
  selected_channels: Array<'email' | 'sms' | 'whatsapp'>; // sender's optional add-ons
  inbox_already_written: boolean; // true when called from ConversationsService
};
```

If `inbox_already_written = true`, the dispatcher skips the inbox provider call (it's a no-op anyway, but skipping saves a function call). If `false` — meaning the call came from the legacy `AnnouncementsService.create` path — the dispatcher calls `InboxChannelProvider.send` first, but that method now needs to actually **create the broadcast conversation** as a side effect.

To avoid coupling the inbox channel provider directly to ConversationsService for creation (which would be a circular dependency in spirit), introduce a thin **bridge service**:

`apps/api/src/modules/communications/inbox-bridge.service.ts`

```ts
@Injectable()
export class InboxBridgeService {
  constructor(private readonly conversationsService: ConversationsService) {}

  async createBroadcastFromAnnouncement(input: {
    tenantId: string;
    senderUserId: string;
    subject: string;
    body: string;
    audienceDefinition: AudienceDefinition;
    allowReplies: boolean;
  }): Promise<{ conversation_id: string; message_id: string }> {
    return this.conversationsService.createBroadcast({
      tenantId: input.tenantId,
      senderUserId: input.senderUserId,
      audienceDefinition: input.audienceDefinition,
      subject: input.subject,
      body: input.body,
      attachments: [],
      allowReplies: input.allowReplies,
      extraChannels: [], // already being dispatched, don't recurse
      disableFallback: false,
    });
  }
}
```

The legacy announcements path calls the bridge before / alongside its existing dispatch. The new conversations path doesn't touch the bridge (it's already creating the broadcast directly).

### 3. Update `AnnouncementsService.create`

`apps/api/src/modules/communications/announcements.service.ts`

After the existing announcement-row insert and the existing dispatch call, add:

```ts
// Always also write to the inbox (the cheapest, default-on channel).
await this.inboxBridgeService.createBroadcastFromAnnouncement({
  tenantId,
  senderUserId,
  subject: announcement.title,
  body: announcement.body,
  audienceDefinition: this.translateLegacyScopeToDefinition(
    announcement.scope,
    announcement.target_payload,
  ),
  allowReplies: announcement.allow_replies ?? false,
});
```

The `translateLegacyScopeToDefinition` helper maps the existing `Announcement.scope` enum (`school`, `year_group`, `class`, `household`, `custom`) to the new `AudienceDefinition` shape:

```ts
private translateLegacyScopeToDefinition(scope: string, payload: any): AudienceDefinition {
  switch (scope) {
    case 'school':       return { provider: 'school', params: {} };
    case 'year_group':   return { provider: 'year_group_parents', params: { year_group_ids: payload.year_group_ids } };
    case 'class':        return { provider: 'class_parents', params: { class_ids: payload.class_ids } };
    case 'household':    return { provider: 'household', params: { household_ids: payload.household_ids } };
    case 'custom':       return { provider: 'handpicked', params: { user_ids: payload.user_ids } };
    default:             throw new Error(`Unknown legacy announcement scope: ${scope}`);
  }
}
```

The legacy flow stays intact for tenants that haven't migrated their muscle memory — but every announcement now also lands in inboxes. **Mission accomplished.**

### 4. The new conversations dispatcher integration

`apps/api/src/modules/inbox/conversations/conversations.service.ts` (modify, don't replace)

Where impl 04 enqueues the `inbox:dispatch-channels` BullMQ job, swap it for a direct (synchronous) call to `NotificationDispatchService.dispatch()` with `inbox_already_written: true` and the sender's `extraChannels`. The job-based async approach was a placeholder in impl 04; this impl wires the real path.

(If you keep it async via BullMQ for fan-out scaling later, that's also fine — but for v1 the synchronous path is simpler and the conversations service is the one place that writes to the inbox, so there's no race.)

### 5. The notification dispatch processor (worker)

The worker processor at `apps/worker/src/processors/inbox-dispatch-channels.processor.ts` (created in this impl, not in 04):

```ts
@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class InboxDispatchChannelsProcessor extends WorkerHost {
  // ...
  async process(job: Job): Promise<void> {
    if (job.name !== INBOX_DISPATCH_CHANNELS_JOB) return;
    const { tenant_id, message_id, extra_channels, disable_fallback } = job.data;
    // Set RLS context, load message + recipients, dispatch via channel providers
    // for the extra_channels list (NOT inbox — already written).
  }
}
```

Reuses the existing `notifications` queue and registers alongside other processors. The tenant-aware base class sets RLS context.

The job exists for two reasons:

1. Decoupling — the synchronous send returns fast; expensive SMS/WhatsApp API calls happen in the background.
2. Retries — failed external sends retry without re-creating the inbox row.

### 6. Module wiring

- `CommunicationsModule` exports `InboxBridgeService`.
- `InboxModule` imports `CommunicationsModule` to get access to `NotificationDispatchService`.
- Watch the circular dependency: `Communications → Inbox` (via the bridge) and `Inbox → Communications` (via the dispatcher). Use NestJS's `forwardRef()` for both imports. Test the DI graph with the verification command from CLAUDE.md.

## Tests

`inbox-channel.provider.spec.ts`:

- send() returns delivered synchronously (no-op)

`inbox-bridge.service.spec.ts`:

- createBroadcastFromAnnouncement calls ConversationsService.createBroadcast with translated definition
- legacy scope mappings each route to the correct provider

`announcements.service.spec.ts` (extend existing):

- create() now also calls the inbox bridge in addition to legacy dispatch
- translateLegacyScopeToDefinition handles every existing scope

`notification-dispatch.service.spec.ts` (extend existing):

- when called with `inbox_already_written: true`, the inbox provider is NOT invoked
- when called from a legacy path with `inbox_already_written: false`, the inbox provider IS invoked
- channel iteration always includes inbox

`inbox-dispatch-channels.processor.spec.ts`:

- routes correctly via job.name guard
- skips inbox channel
- dispatches each extra channel via its provider

## Watch out for

- **Circular dependency** between CommunicationsModule and InboxModule. Use `forwardRef()` and verify with the DI test from CLAUDE.md before pushing.
- **Don't re-write the inbox row twice.** The legacy announcements path now goes through `InboxBridgeService.createBroadcastFromAnnouncement` which creates the conversation. The new path goes through `ConversationsService.createBroadcast` directly. They must NOT both fire — `AnnouncementsService.create` must call ONLY the bridge, not also `createBroadcast` on its own.
- **The translation table** (legacy scope → audience definition) is the only place legacy and new meet. Test every mapping with a unit test or you'll silently lose tenants who use, say, `household` scope on the legacy path.
- **Existing announcement tests will need updating.** They probably mock `notification-dispatch.service.ts` directly. Add the `inbox_already_written` field to the mocks and also assert the bridge call.
- **Don't break the existing announcement spec files.** The Wave 3 lint config and CI runs them. If they were green before this impl, they must be green after.
- **`allow_replies` on legacy announcements.** The existing `Announcement` model may not have an `allow_replies` column. If not, default to `false` in the bridge — legacy announcements stay one-way, matching their existing UX. Schools that want replies can use the new compose flow.

## Deployment notes

- API restart only.
- Smoke test:
  - Send a legacy announcement via the existing announcements UI (or POST `/v1/announcements`).
  - Verify the announcement row was created (existing behaviour).
  - Verify a new conversation row was created in the new `conversations` table with `kind = broadcast`.
  - Verify `broadcast_audience_snapshots` has the resolved recipient list.
  - Verify the recipients see the message in `GET /v1/inbox/conversations` (impl 04).
  - Verify the legacy SMS / Email path still fires (no regression in the existing dispatchers).
