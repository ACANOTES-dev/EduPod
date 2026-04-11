# New Inbox — Master Plan

> **Status:** Plan locked. Implementation split into 16 tasks across 5 waves. See `IMPLEMENTATION_LOG.md` for execution order and per-wave rules.

---

## 1. Why we're building this

The platform currently has **outbound dispatch** for school communication — `Announcement` records fan out to SMS, Email, and WhatsApp providers — and a narrow `ParentInquiry` thread for parent-initiated questions. There is **no in-app inbox**. There is no place where school-wide messages "land". There is no direct messaging between staff and parents, no group chats, no read receipts, no reply control, no safeguarding oversight, and no shared destination that the future mobile app will plug into.

This rebuild adds the missing piece: **a first-class in-app messaging system** that sits at the centre of the school's communication. Inbox is the **default and cheapest channel**. SMS, Email, and WhatsApp remain available as paid add-on channels that fan out alongside the inbox, never instead of it. Every announcement, every direct message, every targeted segment broadcast lands in user inboxes by default — and only escalates to external paid channels if the sender ticks the box.

The system has to support five very different behaviours at once:

1. **Top-down broadcasts** — principal sends a school-wide notice, or a teacher sends a class-wide notice. Always one-way unless the sender explicitly enables replies.
2. **Direct staff conversations** — teachers messaging each other, admin messaging individual staff, finance messaging a specific parent.
3. **Small-group conversations** — "Year 5 Teachers", "PE Department", "Trip Volunteers".
4. **Smart-segment broadcasts** — "all parents in arrears > €500", "all parents whose children are on the Year 6 trip", "all parents who signed up to the Open Day". These are dynamic audiences that re-resolve every time you send to them.
5. **Controlled inbound from parents and students** — by default, parents and students are **inbox-only**. They cannot initiate conversations. They can only reply on threads where the sender explicitly enabled replies. This is the key safety primitive.

On top of that, three orthogonal pillars make this safe to deploy in real schools:

- **Tenant-configurable permission matrix** — every school configures who can message whom, within hard-coded relational scopes that prevent privacy breaches.
- **Admin oversight** — Owner / Principal / Vice Principal can read every conversation in their tenant for safeguarding, and can freeze any thread (with audit trail).
- **Safeguarding keyword scanner** — every message is scanned against a tenant-managed keyword list; matches raise dashboard alerts to the safeguarding team.

The rebuild is intentionally large because the spine we're building is reused by the Engagement module, the Homework module (student replies with attachments), Parent-Teacher Meetings, Events, Trips, and the future mobile app. Building it half-right would compound across every downstream feature.

---

## 2. The conversation model

There are exactly **three conversation types**. No others. No DMs-as-channels, no servers, no roles per conversation.

| Type        | Shape                                            | Reply rule                                                                                                                                                                                                                                                          | Use case                                                                                                  |
| ----------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `direct`    | 1 ↔ 1, exactly two participants                  | Both sides can always reply. Permission matrix gates whether the conversation can be initiated in the first place.                                                                                                                                                  | Teacher ↔ teacher, teacher ↔ admin, finance ↔ parent.                                                     |
| `group`     | 1 ↔ small set (2 ≤ N ≤ 50 participants)          | All participants can reply. Sender of the **initial** message can rename / archive the group. Admin can always join.                                                                                                                                                | "Year 5 Teachers", "PE Department", "Trip Volunteers". Manually composed handpicked or saved-group bound. |
| `broadcast` | 1 → many. Sender + N recipients (no upper limit) | One-way **unless** the sender ticks **`Allow replies`** at compose time. If replies are enabled, each recipient's reply spawns a private 1↔1 thread between that recipient and the sender (sender sees N separate threads in their inbox, not a single noisy room). | School-wide announcements, year-group notices, "parents with outstanding fees", etc.                      |

**Key design rules:**

- A `broadcast` is the only type that supports dynamic audience definitions (smart audiences). `direct` and `group` are always handpicked.
- `broadcast` always stores both the **audience definition** and a **frozen recipient snapshot** at send time. This is critical: a parent who pays off their arrears tomorrow does not lose access to a "fees in arrears" message that was sent to them today.
- Conversations are **immutable** in their type. You cannot upgrade a `direct` to a `group`. You cannot downgrade a `broadcast` to a `direct`. If you need a different shape, start a new conversation.
- Every conversation has a single canonical **sender / owner** (the user who created it). Messages within the conversation can be authored by anyone with reply permission.
- The **inbox** is per-user. A user sees a thread in their inbox if they are a participant. The `ConversationParticipant` table is the join.

---

## 3. Channels (inbox + the other three)

Today the platform has SMS, Email, WhatsApp providers wired into the announcement dispatch service. The rebuild adds the inbox as a **fourth channel** — and makes it the **default-on, always-included** channel.

| Channel    | Cost    | Default?  | Who can disable it                                             |
| ---------- | ------- | --------- | -------------------------------------------------------------- |
| `inbox`    | free    | always on | nobody — every message lands in inboxes of resolved recipients |
| `email`    | per-msg | off       | sender ticks at compose time                                   |
| `sms`      | per-msg | off       | sender ticks at compose time                                   |
| `whatsapp` | per-msg | off       | sender ticks at compose time                                   |

**Why "inbox is always on":** the cheapest, most controllable, audited, and replayable channel must be the default. Schools that add SMS/WhatsApp on top do so for urgency, not for delivery — the source of truth is always the inbox.

The dispatch service unifies fan-out: when a message is sent, the dispatcher writes the message + creates `ConversationParticipant` rows + enqueues outbound jobs for any extra channels the sender selected. The existing `NotificationDispatchService` is extended with an `InboxChannelProvider` that writes the in-app rows; the existing SMS/Email/WhatsApp providers stay untouched.

---

## 4. The permission matrix

The permission matrix is the most subtle part of the system, and the part most likely to leak data if implemented carelessly. It has **three layers**.

### Layer 1 — Tenant-configurable role-pair grid

A NxN boolean grid stored in `tenant_messaging_policy`, one row per tenant. Each cell is `(sender_role, recipient_role) → allowed: bool`. The tenant edits this in `Settings → Communications → Messaging Policy`.

The roles in the grid:

- `owner`
- `principal`
- `vice_principal`
- `office` (general office staff)
- `finance` (finance staff)
- `nurse` (medical staff)
- `teacher`
- `parent`
- `student`

(Other system roles map to one of these for the purposes of the matrix; the mapping table lives in the policy service.)

**Default matrix shipped with every new tenant:**

|               | → owner | → principal | → VP | → office | → finance | → nurse | → teacher | → parent | → student |
| ------------- | :-----: | :---------: | :--: | :------: | :-------: | :-----: | :-------: | :------: | :-------: |
| **owner**     |    —    |     ✅      |  ✅  |    ✅    |    ✅     |   ✅    |    ✅     |    ✅    |    ✅     |
| **principal** |   ✅    |      —      |  ✅  |    ✅    |    ✅     |   ✅    |    ✅     |    ✅    |    ✅     |
| **vp**        |   ✅    |     ✅      |  —   |    ✅    |    ✅     |   ✅    |    ✅     |    ✅    |    ✅     |
| **office**    |   ✅    |     ✅      |  ✅  |    ✅    |    ✅     |   ✅    |    ✅     |    ✅    |    ❌     |
| **finance**   |   ✅    |     ✅      |  ✅  |    ✅    |    ✅     |   ❌    |    ✅     |    ✅    |    ❌     |
| **nurse**     |   ✅    |     ✅      |  ✅  |    ✅    |    ❌     |   ✅    |    ✅     |    ✅    |    ❌     |
| **teacher**   |   ✅    |     ✅      |  ✅  |    ✅    |    ✅     |   ✅    |    ✅     |    ✅    |    ✅     |
| **parent**    |   ❌    |     ❌      |  ❌  |    ❌    |    ❌     |   ❌    |    ❌     |    ❌    |    ❌     |
| **student**   |   ❌    |     ❌      |  ❌  |    ❌    |    ❌     |   ❌    |    ❌     |    ❌    |    ❌     |

Read it as: **"Can the row send to the column?"**.

Note: parent and student rows are entirely OFF by default. Tenants can flip them on if they want a more permissive setup. This is the **inbox-only default** — parents and students can only **receive** new conversations from the school side.

### Layer 2 — Hard-coded relational scopes (NOT configurable)

When a cell is enabled, the **relationship constraint** is fixed in code. The policy service enforces these in addition to the cell. Tenants cannot weaken them.

| Sender → Recipient role | Constraint                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `teacher → parent`      | Recipient parent must be a parent of a student currently enrolled in a class **the sender teaches**.              |
| `teacher → student`     | Recipient student must currently be enrolled in a class **the sender teaches**.                                   |
| `parent → teacher`      | Recipient teacher must currently teach a class containing **a child of the sender**.                              |
| `student → teacher`     | Recipient teacher must currently teach **the sender's class**.                                                    |
| `office → parent`       | Recipient parent must belong to the same tenant. (No relational gate — office staff can reach any tenant parent.) |
| `finance → parent`      | Same as office.                                                                                                   |
| `nurse → parent`        | Same as office.                                                                                                   |
| Admin tier → anyone     | No relational gate — Owner / Principal / VP can reach any user in their tenant.                                   |
| Staff → other staff     | No relational gate.                                                                                               |

These constraints are **invariants of the school model**. A teacher messaging another teacher's parents is a privacy breach regardless of how the tenant configured the grid. The policy service rejects such messages even when the cell is `true`.

### Layer 3 — Global kill switches

Master toggles in the same tenant settings page. These short-circuit the matrix.

| Switch                                         | Default | Effect when OFF                                                                                                                                                           |
| ---------------------------------------------- | :-----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `messaging_enabled`                            |   ON    | The whole inbox is disabled for the tenant.                                                                                                                               |
| `students_can_initiate`                        |   OFF   | Students cannot start any new conversation. They can still **reply** on threads where the sender enabled replies.                                                         |
| `parents_can_initiate`                         |   OFF   | Parents cannot start any new conversation. They can still **reply** on threads where the sender enabled replies.                                                          |
| `parent_to_parent_messaging`                   |   OFF   | Even if the parent→parent cell is ticked, the policy engine refuses parent-to-parent direct conversations.                                                                |
| `student_to_student_messaging`                 |   OFF   | Same as above for students.                                                                                                                                               |
| `student_to_parent_messaging`                  |   OFF   | Same.                                                                                                                                                                     |
| `require_admin_approval_for_parent_to_teacher` |   OFF   | When ON, parent → teacher messages enter a `pending_approval` state and an admin must release them. Out of scope for v1 implementation but the column is added in Wave 1. |

### Reply override (the universal escape hatch)

**Regardless of the matrix and kill switches**, every recipient of a message where the sender ticked `allow_replies` may reply on that specific thread. This is the only path for parents and students to initiate a written reply by default.

In practice this means:

- Principal sends school-wide → ticks "Allow replies" → 400 parents receive it → any of them can reply → each reply becomes a private 1↔1 thread between that parent and the principal.
- Teacher sends "homework reminder" to their class parents → does NOT tick "Allow replies" → recipients see the message but cannot reply.
- Teacher sends "your child seems unwell today, please call when you can" to a single parent → it's a `direct` conversation, replies always allowed on direct.

The policy service exposes one method:

```
canSendMessage({
  tenantId,
  senderUserId,
  recipientUserId,
  conversationId?,   // present iff this is a reply, not a new conversation
}): { allowed: true } | { allowed: false; reason: string }
```

`canSendMessage` is the single chokepoint. Every send goes through it. Every test for the messaging module covers it.

---

## 5. Smart audiences

Audience targeting is the brain of every broadcast. The existing `AudienceResolutionService` already supports `school`, `year_group`, `class`, `household`, `custom`. We're extending it into a full smart-audience engine.

### 5a. Built-in audience providers

Each provider takes parameters and returns a list of `user_id`s. New providers in v1:

| Provider key          | Parameters                               | Returns                                                                                  |
| --------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `school`              | —                                        | All active parents + active staff                                                        |
| `parents_school`      | —                                        | All active parents                                                                       |
| `staff_all`           | —                                        | All active staff                                                                         |
| `staff_role`          | `roles: string[]`                        | All staff with one of the listed roles                                                   |
| `department`          | `department_ids: string[]`               | All staff in the listed departments                                                      |
| `year_group_parents`  | `year_group_ids: string[]`               | Parents of students in those year groups                                                 |
| `class_parents`       | `class_ids: string[]`                    | Parents of students in those classes                                                     |
| `section_parents`     | `section_ids: string[]`                  | Parents of students in those sections                                                    |
| `household`           | `household_ids: string[]`                | Parents in those households                                                              |
| `year_group_students` | `year_group_ids: string[]`               | Students in those year groups                                                            |
| `class_students`      | `class_ids: string[]`                    | Students in those classes                                                                |
| `handpicked`          | `user_ids: string[]`                     | Exactly those users                                                                      |
| `fees_in_arrears`     | `min_overdue_amount?, min_overdue_days?` | Parents whose children have an overdue invoice meeting the thresholds                    |
| `event_attendees`     | `event_id, status?`                      | Parents who RSVP'd to an event (stub-wired in v1; events module wires the resolver)      |
| `trip_roster`         | `trip_id`                                | Parents whose children are on a trip (stub-wired in v1; trips module wires the resolver) |
| `saved_group`         | `saved_audience_id`                      | Resolves to the underlying definition (recursive)                                        |

Cross-module providers (`fees_in_arrears`, `event_attendees`, `trip_roster`) are implemented as **registered providers** — each module exposes its provider via a small interface, and the `AudienceProviderRegistry` discovers them at module init. This keeps the inbox decoupled from finance / events / trips. v1 ships with `fees_in_arrears` actually wired to the finance module; the other two are interface-only stubs that emit a structured "provider not yet wired" error and will be filled in when the events / trips modules mature.

### 5b. Saved audiences

A new tenant-scoped resource: **saved audiences**. Two flavours:

- **Static** — a frozen list of `user_id`s. Editable by the creator. Use case: "Year 5 Parent Council" — a hand-curated group.
- **Dynamic** — a stored audience definition (one or more provider invocations + composition). Re-resolved at send time. Use case: "Parents in arrears > €500" or "Parents in Year 5 OR Year 6".

Both are stored in the same `saved_audiences` table with a `kind` discriminator and a `definition_json` payload. The frontend has a dedicated builder (`Settings → Communications → Audiences`) that lets school staff compose, preview the resolved member count, and save.

### 5c. Composition (AND / OR / NOT)

Audience definitions can be composed:

```json
{
  "operator": "and",
  "operands": [
    { "provider": "year_group_parents", "params": { "year_group_ids": ["uuid"] } },
    {
      "operator": "not",
      "operand": { "provider": "household", "params": { "household_ids": ["uuid"] } }
    }
  ]
}
```

The resolver walks the tree, resolves each leaf to a `Set<user_id>`, and applies the set algebra. The result is a single deduped `user_id[]` plus the original definition (so we can re-resolve later).

The compose UI is a chip builder: pick a provider, fill its params, AND/OR/NOT the next chip. Same engine resolves both single-scope and composed audiences.

### 5d. Snapshot vs live

Every broadcast stores **both**:

- The audience **definition** (rule, saveable for re-use)
- The resolved **snapshot** (`broadcast_audience_snapshot.recipient_user_ids[]`)

The snapshot is what we use to create `ConversationParticipant` rows. Once the snapshot is taken, the participant list is frozen for that specific message — re-resolving the same definition tomorrow may return a different set, but yesterday's participants stay yesterday's participants.

---

## 6. Read receipts, edit, delete

### Read receipts

Read state is stored per `(message_id, recipient_user_id)` in `message_reads`. A row is upserted with `read_at = now()` the first time the recipient opens the thread.

**Visibility rule (one-way only):**

- **School staff sender** (admin tier, teacher, office, finance, nurse) → can see read state of every recipient. Sender's UI shows "Read by 142 / 400" with a drilldown list.
- **Parent sender / Student sender** → cannot see read state. Their compose UI does not surface "read by" at all. The data row exists for the recipient's bookkeeping (so the recipient's UI can show unread badges) but the sender API never returns it.

Enforcement is in the read facade — the response shape branches on `requestingUser.role`.

### Edit

- **School staff senders only.** No edit for parents or students.
- **10-minute window** from `created_at`. After that, the edit endpoint returns `EDIT_WINDOW_EXPIRED`.
- Edits are stored as a new row in `message_edits` with the previous body — full edit history retained for safeguarding audit.
- Edited messages display an `(edited)` indicator with hover-to-see-history (visible only to admin tier).

### Delete

- **School staff senders only.**
- Deletes are **soft** — `deleted_at` is set, content is replaced with a tombstone in the API response, but the row stays in the DB for safeguarding audit.
- Admin tier can always read deleted messages via the oversight UI.

---

## 7. Admin oversight

Owner, Principal, and Vice Principal have a privileged oversight surface. **No other role**, including the office, finance, nurse, or other staff.

### Read-all

The oversight controller exposes:

- `GET /v1/inbox/oversight/conversations` — list every conversation in the tenant, paginated, filterable by date / participant / type / has-flags.
- `GET /v1/inbox/oversight/conversations/:id` — full thread view including soft-deleted messages and edit history.

Every oversight read is **audit-logged** — `oversight_access_log` table records who looked at what and when. The audit log is itself viewable from the oversight UI.

### Freeze

Any thread can be **frozen** by an admin tier user. Freezing:

- Sets `conversation.frozen_at` and `frozen_by_user_id`.
- Blocks all new messages from any participant. The send endpoint returns `CONVERSATION_FROZEN`.
- Surfaces a banner to **both sides**: "This conversation has been disabled by school administration. Please contact the office for further communication."
- Is reversible — admin can `unfreeze` from the same surface. Both freeze and unfreeze are audit-logged.

### Safeguarding flags

(See section 8 — flagged conversations bubble into the oversight dashboard.)

---

## 8. Safeguarding keyword scanner

A separate, modular pipeline that scans every new message against a tenant-managed keyword list. Designed to catch obvious safeguarding concerns (bullying, threats, abuse, inappropriate contact) without ML in v1, with a clean upgrade path later.

### How it works

1. On `message.created`, the inbox service enqueues a `safeguarding:scan-message` BullMQ job with `{ tenant_id, message_id }`.
2. The scanner worker loads the tenant's keyword list from `safeguarding_keywords` (cached per tenant for 5 min).
3. It runs case-insensitive, word-boundary matching against the message body. Matches return `{ keyword, severity, position }`.
4. If any matches, it inserts a `message_flag` row with the matched keywords and severity, and enqueues a `safeguarding:notify-reviewers` job.
5. The notifier writes a dashboard notification for every Owner / Principal / VP in the tenant, with a deep link to the flagged thread in the oversight UI.

### Keyword model

`safeguarding_keywords` table:

- `id`, `tenant_id`
- `keyword` (text, indexed for prefix lookup)
- `severity` (`low` | `medium` | `high`)
- `category` (free text — "bullying", "self-harm", "abuse", etc., for analytics)
- `active` (bool)

A small **starter set** is seeded for every new tenant (about 30 entries across the obvious categories). The settings UI lets the safeguarding lead add, edit, deactivate, or delete keywords.

### Reviewer dashboard widget

A widget on the Owner / Principal / VP home dashboard: "Safeguarding alerts (3 unread)" with a click-through to a list of flagged threads. Each row shows the matched keywords, the participants, the timestamp, and a "Review" button that opens the oversight thread view.

### Review actions

From the flagged-thread view, an admin can:

- **Dismiss** — mark the flag as a false positive. Logged with reason.
- **Freeze** — same as the oversight freeze action.
- **Escalate** — generates a standardised export (PDF) of the thread for offline review / external reporting. Logged.

### v2 path

The scanner is built behind an interface (`SafeguardingScanner`). v1 ships the `KeywordSafeguardingScanner`. v2 can swap in `MlModerationSafeguardingScanner` (e.g. AWS Comprehend, Perspective API) without touching the rest of the pipeline. Out of scope for this rebuild.

---

## 9. Notification fallback

If a high-priority message sits unread in a recipient's inbox for too long, the system can fall back to other channels (email / SMS / WhatsApp) automatically. This is **per-tenant configurable** with **separate SLAs for two source classes**:

- **Admin broadcasts** (sender is Owner / Principal / VP) — generally less time-sensitive. Default fallback after **24 hours**.
- **Teacher messages** (sender is Teacher) — generally more time-sensitive. Default fallback after **3 hours**.

(Other staff classes — office, finance, nurse — group with admin broadcasts for fallback purposes.)

### Tenant settings

`tenant_settings_inbox` extends with:

- `fallback_admin_enabled: bool`
- `fallback_admin_after_hours: int` (default 24)
- `fallback_admin_channels: string[]` (subset of `email`, `sms`, `whatsapp`)
- `fallback_teacher_enabled: bool`
- `fallback_teacher_after_hours: int` (default 3)
- `fallback_teacher_channels: string[]`

### Mechanism

A BullMQ cron `inbox:check-unread-fallback` runs every 15 minutes. For each tenant with fallback enabled, it scans `messages` joined with `message_reads` for messages where:

- `created_at` is older than the configured threshold
- `read_at` is NULL for at least one recipient
- `fallback_dispatched_at` is NULL

For each hit, it enqueues an outbound job on the matching channels for the unread recipients only — reusing the existing SMS / Email / WhatsApp providers. `fallback_dispatched_at` is stamped to prevent re-fire.

Senders can opt out per-message at compose time (`disable_fallback: true` checkbox).

---

## 10. Search

Full-text search across the user's own inbox is **in v1**.

- Postgres `tsvector` column on `messages.body_search` with a generated index.
- A `GET /v1/inbox/search?q=...` endpoint returns paginated message hits scoped to the requesting user's participating conversations (RLS + participant filter).
- The frontend has a search bar in the inbox header and a results page that groups hits by conversation.
- Highlighting via `ts_headline`.

For admins, the oversight UI has a tenant-wide search (`/v1/inbox/oversight/search`) audit-logged like every other oversight read.

---

## 11. Real-time / polling

v1 uses **30-second polling**, no WebSockets, no SSE.

- The inbox shell polls `GET /v1/inbox/state` every 30 seconds.
- The endpoint returns `{ unread_total, latest_message_per_thread, freshly_added_thread_ids }`.
- The morph bar shows the unread badge based on `unread_total`.
- Open thread views poll the same thread's `GET /v1/inbox/threads/:id` every 30 seconds while focused.

The polling layer is wrapped in a single React hook (`useInboxPolling`) so a future WebSocket migration is a hook-internal change with no component-level rewrites.

---

## 12. Data model

This is a high-level summary. The exact Prisma schema lands in **Implementation 01 — Schema Foundation**.

| Table                            | Purpose                                                                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conversations`                  | One row per conversation. `kind` (`direct` / `group` / `broadcast`), `tenant_id`, `created_by_user_id`, `subject`, `frozen_at`, `frozen_by_user_id`, etc. |
| `conversation_participants`      | Many-to-many between conversations and users. `unread_count` denormalised. `muted_at`, `archived_at`.                                                     |
| `messages`                       | Body, sender, attachments-json, edit/delete state, search vector, `created_at`.                                                                           |
| `message_reads`                  | Per-recipient `read_at`. One row per `(message_id, recipient_user_id)` once read.                                                                         |
| `message_edits`                  | Edit history — body before, edited_at, edited_by.                                                                                                         |
| `message_attachments`            | Files / images attached to a message. References existing storage subsystem.                                                                              |
| `broadcast_audience_definitions` | The composed audience JSON for a broadcast.                                                                                                               |
| `broadcast_audience_snapshots`   | Frozen `recipient_user_ids[]` resolved at send time.                                                                                                      |
| `saved_audiences`                | Tenant-scoped saved audiences. `kind` (`static` / `dynamic`), `definition_json`.                                                                          |
| `tenant_messaging_policy`        | The role-pair grid. `(tenant_id, sender_role, recipient_role) → allowed: bool`.                                                                           |
| `tenant_settings_inbox`          | Tenant-level inbox settings: kill switches, fallback config, retention, edit window override.                                                             |
| `safeguarding_keywords`          | Tenant-managed scanner keyword list.                                                                                                                      |
| `message_flags`                  | Safeguarding scanner output. Linked to `message_id`, holds matched keywords, severity, review state.                                                      |
| `oversight_access_log`           | Audit log of admin tier oversight reads, freezes, dismissals.                                                                                             |

Every tenant-scoped table has `tenant_id UUID NOT NULL` and `RLS FORCE` with the standard tenant-isolation policy. The only non-tenant-scoped table is `users` (existing).

---

## 13. Component map (frontend)

```
apps/web/src/app/[locale]/(school)/inbox/
├── layout.tsx                      # inbox-shell with sidebar (thread list) + main pane (thread view)
├── page.tsx                        # default — empty state ("Select a thread")
├── _components/
│   ├── inbox-sidebar.tsx           # thread list, search bar, filter chips
│   ├── thread-list-item.tsx        # one row in the sidebar
│   ├── thread-view.tsx             # the open conversation pane
│   ├── thread-message.tsx          # one message bubble
│   ├── thread-composer.tsx         # the compose-at-bottom textarea + attach + send
│   ├── compose-dialog.tsx          # full-screen new conversation dialog
│   ├── audience-picker.tsx         # the smart audience builder for broadcasts
│   ├── audience-chip-builder.tsx   # the AND/OR/NOT chip composer
│   ├── channel-selector.tsx        # checkboxes for inbox/email/sms/whatsapp + reply-toggle + fallback opt-out
│   ├── attachment-uploader.tsx     # drag/drop + click-to-upload
│   └── unread-badge.tsx            # the morph-bar pill
├── threads/[id]/page.tsx           # deep-link to a specific thread (re-uses thread-view)
├── search/page.tsx                 # search results page
├── audiences/                      # saved audiences manager
│   ├── page.tsx
│   ├── new/page.tsx
│   └── [id]/page.tsx
└── oversight/                      # admin tier only
    ├── page.tsx                    # oversight dashboard, flag list, search
    ├── threads/[id]/page.tsx
    └── audit-log/page.tsx

apps/web/src/app/[locale]/(school)/settings/communications/
├── messaging-policy/page.tsx       # the configurable matrix grid
├── safeguarding/page.tsx           # keyword list manager
└── fallback/page.tsx               # fallback SLA configuration
```

The morph bar gets a new icon-button (envelope with unread pill). The Communications module sub-strip gains an "Inbox" entry.

---

## 14. Backend module structure

```
apps/api/src/modules/inbox/
├── inbox.module.ts
├── conversations/
│   ├── conversations.controller.ts          # /v1/inbox/conversations
│   ├── conversations.service.ts             # CRUD + send + read state
│   ├── conversations.read.facade.ts
│   └── conversations.service.spec.ts
├── messages/
│   ├── messages.service.ts                  # message-level operations: edit, delete, attach
│   └── messages.service.spec.ts
├── policy/
│   ├── messaging-policy.service.ts          # canSendMessage chokepoint
│   ├── relational-scope.resolver.ts         # the hard-coded relational scope checks
│   └── messaging-policy.service.spec.ts
├── audience/
│   ├── audience-resolution.service.ts       # extends the existing communications/audience-resolution
│   ├── providers/
│   │   ├── provider.interface.ts
│   │   ├── school.provider.ts
│   │   ├── year-group-parents.provider.ts
│   │   ├── ... (one per built-in provider)
│   │   └── fees-in-arrears.provider.ts
│   ├── saved-audiences.controller.ts
│   ├── saved-audiences.service.ts
│   ├── audience-composer.ts                 # AND/OR/NOT set algebra
│   └── *.spec.ts
├── search/
│   ├── inbox-search.controller.ts
│   ├── inbox-search.service.ts
│   └── *.spec.ts
├── oversight/
│   ├── inbox-oversight.controller.ts
│   ├── inbox-oversight.service.ts
│   ├── oversight-audit.service.ts
│   └── *.spec.ts
└── settings/
    ├── inbox-settings.controller.ts
    ├── inbox-settings.service.ts
    └── *.spec.ts

apps/api/src/modules/safeguarding/
├── safeguarding.module.ts
├── keywords/
│   ├── safeguarding-keywords.controller.ts
│   ├── safeguarding-keywords.service.ts
│   └── *.spec.ts
└── scanner/
    ├── safeguarding-scanner.interface.ts
    ├── keyword-safeguarding-scanner.ts
    └── *.spec.ts

apps/worker/src/processors/
├── safeguarding-scan-message.processor.ts
├── safeguarding-notify-reviewers.processor.ts
└── inbox-fallback-check.processor.ts
```

---

## 15. Wave breakdown (16 implementations across 5 waves)

The full wave structure with dependencies and the deployment matrix lives in `IMPLEMENTATION_LOG.md` §3 and §4. Summary:

| Wave | Implementations | Theme                                                                         |
| ---- | --------------- | ----------------------------------------------------------------------------- |
| 1    | 01              | Schema foundation — one big migration, all new tables and enums               |
| 2    | 02, 03, 04, 05  | Backend services — policy, audience engine, conversations, oversight          |
| 3    | 06, 07, 08, 09  | Backend integrations — channel dispatcher, fallback worker, scanner, search   |
| 4    | 10–15           | Frontend — inbox shell, compose, audiences, settings, oversight, safeguarding |
| 5    | 16              | Polish — translations, mobile pass, morph bar wire, smoke tests, docs         |

Each implementation has its own file in `implementations/NN-title.md` with concrete files to create / modify, tests required, and deploy steps.

---

## 16. Out of scope (explicit non-goals for v1)

These are intentionally **not** part of the rebuild and must not be added by any implementation:

- WebSockets / SSE / push notifications (mobile push comes with the mobile app)
- ML-based safeguarding moderation (the scanner ships keyword-only with an interface for v2)
- Voice notes / video messages
- Per-conversation typing indicators
- Reactions / emoji
- Pinned messages
- Threading-within-a-thread (Slack-style replies)
- Forwarded messages
- Multi-tenant cross-school messaging
- Public unauthenticated messages from prospective parents (the existing public inquiry form covers this — left untouched)
- The existing `ParentInquiry` flow — left in place. v1 of the new inbox does **not** migrate it. A future implementation can fold it in.
- Approval workflow for `parent → teacher` messages (the column ships in Wave 1, the workflow ships in v2)
- Calendar / meeting scheduling inside the inbox

---

## 17. The inbox is the spine

When this rebuild lands, the inbox becomes the central messaging primitive that every other module reuses. After v1:

- The Homework module's "submit assignment" flow becomes a reply-with-attachment on a teacher-initiated thread.
- Parent-Teacher Meetings sends invitations as broadcasts and confirmations as direct messages.
- Events broadcasts RSVP confirmations and reminders to attendees as inbox messages.
- The mobile app, when it ships, gets push notifications for new inbox messages with no separate API to build.
- Engagement metrics (open rate, response rate, time-to-read) come for free off the read-receipt table.

That's the bet. Build the spine once, properly.
