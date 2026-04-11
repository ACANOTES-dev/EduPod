# Inbox — Tenant Feature Reference

> **Audience**: School administrators, IT leads, and product owners.
> **Status**: v1 shipping (2026-04-11).
> **Engineering source of truth**: `new-inbox/PLAN.md` and the 16 implementations under `new-inbox/implementations/`.

This document describes the new first-class inbox from a tenant / UX perspective. For engineering architecture see `docs/architecture/module-blast-radius.md` (InboxModule section) and `docs/architecture/event-job-catalog.md`.

---

## What the inbox is

The inbox is the school platform's **first-class in-app messaging surface**. Every announcement, every direct message, every broadcast, and every parent inquiry now lands in the recipient's inbox. SMS, Email, and WhatsApp remain available as escalation channels, but they are additive — the inbox is always the default.

Three kinds of conversation are supported:

1. **Direct** — a 1↔1 thread between two people. Used for staff ↔ parent conversations, staff ↔ staff, and (when permitted) parent-initiated questions to a teacher.
2. **Group** — a named thread with 2–49 participants. Used for small committees, year-group teaching teams, project huddles.
3. **Broadcast** — a one-way message from a sender to a smart audience of any size. Replies can be explicitly enabled; when they are, each reply spawns a new 1↔1 direct conversation back to the sender (see "Broadcast replies" below).

Every conversation has a **lifecycle**: `active → frozen → unfrozen → archived`. A frozen conversation is disabled for its participants but remains fully readable in admin oversight. Freezing is reserved for safeguarding interventions and always requires a reason.

---

## Who can talk to whom — the permission matrix

The inbox is governed by a **tenant-configurable 9×9 permission matrix** covering the nine role buckets on the platform:

- owner
- principal
- vice_principal
- hod (head of department)
- teacher
- pastoral (pastoral lead / counsellor)
- accounting / front_office (back-office staff)
- parent
- student

For every `(sender, recipient)` pair, an admin can toggle whether the sender may initiate a conversation with the recipient. The matrix lives under **Settings → Messaging Policy** and requires the `inbox.settings.write` permission (admin tier only).

### Global kill switches

Above the matrix sit the **global kill switches**, which apply before the matrix is consulted:

- **Messaging enabled** — the master switch. Turning this off disables the entire inbox for the tenant.
- **Students can initiate conversations** — off by default. When off, students can only reply to threads where the sender enabled replies.
- **Parents can initiate conversations** — off by default. Parents are in "reply-only" mode until this is turned on.
- **Parent ↔ parent messaging** — off by default for privacy.
- **Student ↔ student messaging** — off by default for safeguarding.
- **Student → parent messaging** — off by default.

### Hard-coded relational scopes

On top of the matrix, certain role pairs are further gated by **relational scopes** that the tenant cannot override. These are privacy invariants:

- A teacher may only initiate with a parent if that parent has at least one child in a class the teacher teaches.
- A parent may only initiate with a teacher if that teacher teaches at least one of the parent's children.
- A student may only initiate with their own teacher (today this is stubbed — students are not yet provisioned as platform users).

These relational scopes are enforced at the API layer and cannot be bypassed by toggling the matrix.

### Safety defaults

The seed defaults for every new tenant are deliberately conservative:

- `messaging_enabled = true`
- Parents and students — entirely OFF as senders. They can receive and reply where explicitly allowed, but they cannot initiate.
- Staff → staff — allowed within the matrix.
- Teacher → parent — allowed through the relational scope.
- Peer-to-peer messaging between parents / students — OFF.

Tenants can adjust these after onboarding. We recommend keeping the parent / student kill switches off until the school has communicated a messaging etiquette policy.

---

## Smart audiences

Broadcasts use **saved audiences** as their recipient list. A saved audience is a named, reusable definition of a recipient set. There are two kinds:

- **Static audiences** — a hand-picked list of users. Easy to reason about; changes require editing the saved audience.
- **Dynamic audiences** — a rule-based definition that re-resolves every time a broadcast is sent. Rules are expressed as AND / OR / NOT combinations of **providers** like:
  - `year_group_parents` — parents of students in year group N
  - `class_parents` — parents of students in a specific class
  - `section_parents` — parents of students in a section / stream (stub until sections are modelled)
  - `fees_in_arrears` — households with overdue invoices above a threshold
  - `event_attendees` — parents who signed up for a given event (stub)
  - `trip_roster` — parents of students on a given trip (stub)
  - `homework_missing` — parents of students with outstanding homework
  - `staff_by_role` — staff filtered by role key
  - `custom_user_ids` — a literal list of user IDs
  - `saved_group` — another saved audience, for composition

A rule like `(year_group_parents(5) AND fees_in_arrears(min_amount: 100)) NOT custom_user_ids([principal_id])` would resolve to "all Year 5 parents with more than €100 overdue, excluding the principal." Dynamic audiences are re-resolved on every send — the recipient set reflects the current state of finance / classes / etc.

Saved audiences are managed under **Inbox → Audiences**. Creation requires `inbox.send`.

Stub providers (events, trips, sections, student-based) render in the chip builder with a `Not yet wired` badge and do not contribute recipients. They become active as the upstream modules land.

---

## Composing a message

The compose dialog is reached from the **Compose** button in the inbox sidebar, or by pressing `c` anywhere in the app (when not typing in an input). It has three tabs:

- **Direct** — one recipient via the people-picker
- **Group** — 2–49 recipients via the people-picker, plus a subject line
- **Broadcast** — a saved audience or a custom audience built from providers, a subject line, and an `Allow replies` toggle

Below the per-tab fields every compose flow has:

- **Message body** — plain text, up to the configured character limit.
- **Attachments** — up to 5 files per message, each up to 10 MB, virus-scanned on upload.
- **Channels** — inbox is always included. Ticking SMS, Email, or WhatsApp adds those channels. Cost estimates are shown next to each channel name; these are a UX nudge, not a billing source of truth.
- **Don't escalate to SMS / Email** — opt-out of the notification fallback window for this message. Useful when the inbox is sufficient (e.g. a low-priority FYI).

People-picker results are filtered by the messaging-policy chokepoint: a user only appears in the results if the sender is actually allowed to message them. This prevents the sender from picking a recipient only to be blocked on send.

---

## Read receipts and the one-way visibility rule

Read receipts are visible to **senders only**, and even then only in the roles that can see them (parents and students do not see read receipts at all). The one-way rule is a safeguarding and privacy requirement: a teacher can see that a parent has read a message, but the parent cannot see that the teacher has read their reply. This prevents power imbalance and anxious monitoring.

A sender looking at a thread sees a "Read by X / Y" indicator beneath each message, with a popover showing the per-recipient read state. The popover also distinguishes between "read in inbox" and "delivered via fallback channel but not yet opened in inbox."

---

## Editing and deleting messages

Senders (school staff only) can **edit** their own messages for a configurable window after sending. The default window is 10 minutes, adjustable under **Settings → Messaging Policy**. Edits are not silent — the message renders with an `(edited)` label and the full edit history is retained in `message_edits` for oversight review.

**Deletions** are soft: the message body becomes a tombstone reading `[message deleted]`, but the row persists so admins can read the original body in oversight. Students and parents cannot edit or delete messages at all.

---

## Admin oversight and safeguarding

Users with `inbox.oversight.read` (owner, principal, vice principal by default) have access to a tenant-wide **Oversight** surface under **Inbox → Oversight**. From this page admins can:

- **Read any conversation** in the tenant (with an amber audit-log banner reminding them every read is logged).
- **Freeze a conversation** with a required reason. Both sides see a system message and the composer is disabled.
- **Unfreeze** a frozen conversation.
- **Export** a thread to PDF for external review or legal hand-off.

Every admin action writes an entry to `oversight_access_log`, including simple reads. The audit log tab on the oversight page shows who did what and when.

### Safeguarding keywords

A configurable list of **safeguarding keywords** sits under **Settings → Safeguarding**. When any message body matches a keyword (case-insensitive, word-boundary), a **flag** is created in the `pending` state. Flags are surfaced in three places:

- A **dashboard alerts widget** that polls every 60s and shows the most recent pending flags (never renders the message body — privacy).
- The Oversight page's **Flags** tab.
- High-severity flags also trigger an email notification to users with `inbox.oversight.read`, even if their normal channel preference is inbox-only.

A flag can be:

- **Dismissed** — marked as a false positive with required notes. The message stays; the flag is removed from the queue.
- **Escalated** — marked for external review. The system automatically generates a PDF export of the conversation and surfaces a Download PDF button.
- **Frozen** — the containing conversation is frozen and the flag is marked reviewed in the same action.

All three are terminal. A dismissed or escalated flag cannot be re-opened; if review needs to happen again, a new flag must be raised by re-running the scanner or editing the keyword list.

Safeguarding keywords can be bulk-imported from a CSV (`keyword,severity,category`) and toggled individually. The starter keyword list seeds 31 entries per tenant.

---

## Notification fallback

If a recipient does not open a message in the inbox within a configured window, the system can automatically **escalate** the notification to another channel. Fallback is configured per-tenant under **Settings → Communications → Fallback**, with separate windows for:

- **Admin broadcasts** (messages from Owner / Principal / Vice Principal) — default 24 hours
- **Teacher messages** (direct messages and broadcasts sent by teachers) — default 3 hours

Per class, an admin can choose which channels the fallback uses (Email, SMS, WhatsApp, or any combination) and toggle fallback entirely. A `Don't escalate` checkbox on the compose dialog lets the sender opt out for a specific message.

Fallback runs on a 5-minute cron (`inbox-fallback-check`) that scans for messages past their window and unread, then dispatches `Notification` rows on the configured channels.

---

## Channels overview

| Channel      | Purpose                      | Always on? | Cost                   |
| ------------ | ---------------------------- | ---------- | ---------------------- |
| **Inbox**    | First-class in-app messaging | Yes        | Free                   |
| **Email**    | Escalation / long-form       | Opt-in     | Low per recipient      |
| **SMS**      | Urgent escalation            | Opt-in     | Medium per recipient   |
| **WhatsApp** | High-engagement escalation   | Opt-in     | Varies (consent-gated) |

Inbox is included on every send. The other three are opt-in and additive; a sender ticks them in the compose dialog to fan out beyond the inbox. The channel selector shows a rough cost estimate as a UX nudge — it is not a billing source of truth and should not be used for finance reporting.

---

## Broadcast replies — the one surprise

When a broadcast sender ticks `Allow replies` and a recipient replies, the reply does **not** land on the broadcast conversation. Instead, it spawns a brand-new **direct** conversation between the replying recipient and the original sender. This is intentional:

- A broadcast to 2000 parents with replies enabled would otherwise create a 2001-person mega-thread where every reply is visible to every recipient. That is a massive privacy leak.
- The 1↔1 spawn-direct model maps cleanly onto the mental model of "parent replied to my announcement" — the sender gets one private thread per responder, not a public comment feed.

For the sender, this means: after a broadcast, check your inbox for new direct threads from parents who replied. They are separate conversations, not threaded under the broadcast.

---

## Settings reference

All inbox settings live under `/settings`:

- **Messaging Policy** (`/settings/messaging-policy`) — the 9×9 matrix, kill switches, edit window, retention window.
- **Safeguarding** (`/settings/communications/safeguarding`) — keyword list management and bulk import.
- **Fallback** (`/settings/communications/fallback`) — per-sender-class fallback windows and channel routing.

All three pages require the admin tier (owner / principal / vice principal). Non-admins see a stub page explaining the page is admin-only.

---

## Common questions

**Q: Can I send a message to a parent who does not have a child in my class?**
A: Only if the matrix allows it AND the relational scope is satisfied. For teacher → parent, the relational scope requires at least one shared class. For admin-tier roles, the relational scope is not applied.

**Q: Can a parent delete my message from their inbox?**
A: No. Parents cannot delete messages at all. A parent can archive a thread (hide it from their inbox list) but the message row is preserved.

**Q: What happens if I disable messaging mid-day?**
A: The kill switch is soft-cached for 5 minutes. Users may be able to send for up to 5 more minutes while the per-process caches drain. For emergency lockdowns, flip the switch and wait 5 minutes before relying on it being enforced.

**Q: Can I export a conversation for a legal request?**
A: Yes — from the Oversight page, open the thread and click "Export PDF". The PDF includes the full message history with edit trails and is signed for legal handoff. The export action is audit-logged.

**Q: What happens to messages when retention runs?**
A: Messages older than the configured retention window (default: forever) are soft-deleted. The deletion is permanent once the retention cron lands — export important threads before retention catches them. As of v1, the retention worker is not yet deployed; the retention setting is captured but not enforced.

**Q: Can I turn safeguarding scanning off?**
A: Yes, under `tenant_settings_inbox.safeguarding_scan_enabled`. We strongly recommend leaving it on — it is the primary pre-launch safeguarding control and costs almost nothing at runtime.

**Q: Is the safeguarding keyword list shared across tenants?**
A: No. Every tenant has its own list seeded from the starter 31 keywords. Tenants can edit, delete, and bulk-import their own lists. Keyword changes apply immediately but the scan cache has a 5-minute TTL.

**Q: Can I change the default channel from Inbox to Email?**
A: No. Inbox is always the default and cannot be removed. The `inbox.settings.write` permission lets you change the kill switches, matrix, retention, and fallback, but not the "inbox is always on" invariant.

---

## Screenshots

_Screenshot placeholders — replace with real screenshots once the UI is finalised for launch._

- `[01] Inbox home — thread list with filters`
- `[02] Thread view — reader with reply composer`
- `[03] Compose dialog — broadcast tab with audience picker`
- `[04] Messaging Policy settings — 9×9 matrix`
- `[05] Oversight dashboard — Flags tab`
- `[06] Safeguarding keywords — list and bulk import`
- `[07] Dashboard safeguarding alerts widget`

---

_Last updated: 2026-04-11 (Implementation 16 — new-inbox Wave 5 polish pass)._
