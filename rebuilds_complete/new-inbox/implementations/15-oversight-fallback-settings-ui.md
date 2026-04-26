# Implementation 15 — Admin Oversight UI + Fallback Settings

> **Wave:** 4 (parallel with 10, 11, 12, 13, 14)
> **Depends on:** 01, 05, 07
> **Deploys:** Web restart only

---

## Goal

Two surfaces:

1. The **admin oversight UI** — the privileged read-everything-and-freeze surface for Owner / Principal / VP. Backed by impl 05's oversight service.
2. The **notification fallback settings page** — where tenants configure the per-source-class fallback SLAs and channels. Backed by impl 07's worker.

## What to build

### 1. The oversight dashboard

`apps/web/src/app/[locale]/(school)/inbox/oversight/page.tsx`

Page layout:

- **Page header** — "Oversight" + a small notice: "Every action here is audit-logged. View the audit log."
- **Tab bar** — `Conversations` | `Flags` | `Audit Log`
- **Filter bar** — date range, conversation kind, has-flags, frozen, participant search, free-text search
- **Result list** — paginated, depends on the active tab

#### Conversations tab

Calls `GET /v1/inbox/oversight/conversations` with the current filters.

Each row: subject (or "Direct: {participants}" / "Group: {subject}" / "Broadcast: {subject}"), kind badge, participants (avatar stack + names), last message timestamp, frozen badge if applicable, flag badge if applicable.

Click → opens the oversight thread view (`/inbox/oversight/threads/[id]`).

#### Flags tab

Calls `GET /v1/inbox/oversight/flags`. Same structure as the dashboard widget from impl 14 but full-page with pagination, filters by review_state (default: pending), sortable columns.

Each row: conversation subject, matched keywords (chips), severity badge, sender, recipient(s), timestamp, current review state, action buttons (Open, Dismiss, Escalate, Freeze).

The action buttons fire the corresponding API calls and refresh the row.

#### Audit log tab

Calls `GET /v1/inbox/oversight/audit-log`.

Each row: timestamp, actor name, action (`read_thread`, `freeze`, `unfreeze`, `dismiss_flag`, `escalate_flag`, `export_thread`, `search`), conversation/flag link, metadata.

Read-only. Pagination. Filterable by actor, action, date range.

### 2. The oversight thread view

`apps/web/src/app/[locale]/(school)/inbox/oversight/threads/[id]/page.tsx`

A read-everything view of a single conversation. Calls `GET /v1/inbox/oversight/conversations/:id`.

Layout:

- **Banner** — "Oversight view: this access is being audit-logged."
- **Header** — subject, kind, participants, frozen state, flag state
- **Action toolbar** — `Freeze` / `Unfreeze`, `Export PDF`, `Dismiss flags`, `Escalate flags` (only the relevant actions for the current state)
- **Message list** — full chronological with deleted messages visible (strikethrough), edit history visible (click to expand), flagged messages highlighted (yellow border)
- **Sidebar (right)** — flag details (matched keywords, severity, category, review state, who's reviewed, when), audit-log entries for this conversation

The thread view does **not** include a composer — admins can read but not participate in conversations they aren't a participant of (they can freeze/unfreeze, that's the only state-changing power).

If the admin happens to also be a participant in this thread (e.g. a Principal who's in a group with teachers), the regular `/inbox/threads/[id]` view is the one with the composer. The oversight view is read-only by design.

### 3. The freeze flow

When the admin clicks **Freeze**:

1. Confirmation modal: "Freeze this conversation? Both sides will see a system message saying the conversation has been disabled. They will not be able to send new messages until you unfreeze it."
2. Optional reason text field
3. Confirm → POST `/v1/inbox/oversight/conversations/:id/freeze` with `{ reason }`
4. Toast on success
5. Refresh the thread view

The system message inserted by impl 05 appears at the bottom of the message list. The composer (in the regular thread view, not here) becomes disabled.

### 4. The flag actions

For a flag, the four actions:

- **Open** — navigates to the oversight thread view, scrolling the flagged message into view
- **Dismiss** — confirmation modal asking for review notes → POST `/v1/inbox/oversight/flags/:id/dismiss` → flag disappears from the pending list
- **Escalate** — confirmation modal asking for review notes → POST `/v1/inbox/oversight/flags/:id/escalate` → response includes a PDF download URL → toast with "Escalated. PDF export ready: [download]"
- **Freeze** — direct freeze of the parent conversation (calls the freeze endpoint, no separate flag action)

### 5. Audit-log immutability

The audit log tab is **strictly read-only**. No edit, no delete actions exposed in the UI even for admins. The `oversight_access_log` table has no UPDATE/DELETE in the service layer either (impl 05 enforces this).

### 6. The fallback settings page

`apps/web/src/app/[locale]/(school)/settings/communications/fallback/page.tsx`

The page where tenants configure when and how unread inbox messages escalate to other channels.

Layout:

- **Page header** — title, description "Configure when unread messages should be escalated to other channels."
- **Section: Admin broadcasts** — toggle, hours threshold, channel checkboxes
- **Section: Teacher messages** — toggle, hours threshold, channel checkboxes
- **Save** button

Each section:

- Toggle: "Enable fallback for {source class}"
- Hours number input: "Escalate after how many hours unread?"
- Channel checkboxes: Email / SMS / WhatsApp (one or more — at least one if enabled)
- A small explanation: "Recipients who haven't read this message after the threshold will receive it via the chosen channel(s)."

The form uses `react-hook-form` + `zodResolver` against a new schema:

```ts
export const updateFallbackSettingsSchema = z
  .object({
    fallback_admin_enabled: z.boolean(),
    fallback_admin_after_hours: z.number().int().min(1).max(168), // 1 hour to 7 days
    fallback_admin_channels: z.array(z.enum(['email', 'sms', 'whatsapp'])),
    fallback_teacher_enabled: z.boolean(),
    fallback_teacher_after_hours: z.number().int().min(1).max(48), // 1 hour to 2 days
    fallback_teacher_channels: z.array(z.enum(['email', 'sms', 'whatsapp'])),
  })
  .refine((d) => !d.fallback_admin_enabled || d.fallback_admin_channels.length > 0, {
    path: ['fallback_admin_channels'],
    message: 'Select at least one channel',
  })
  .refine((d) => !d.fallback_teacher_enabled || d.fallback_teacher_channels.length > 0, {
    path: ['fallback_teacher_channels'],
  });
```

Submits to `PUT /v1/inbox/settings/inbox` (the same endpoint impl 13 uses). The shape of the inbox settings PUT was extended with the fallback fields in impl 13's mutation work. Make sure both implementations land non-conflicting changes — they share the same endpoint, the schemas should be merged on the server side. (Impl 13 takes the merge — impl 15 just uses the established endpoint.)

A small "Test fallback now" button at the bottom for each section lets the admin trigger the fallback worker manually for verification:

`POST /v1/inbox/settings/fallback/test?source=admin`

This admin-only debug endpoint enqueues the per-tenant scan job immediately. Useful for verifying the configuration without waiting 15 minutes for the cron.

### 7. Permission guard

Both surfaces are gated behind `inbox.oversight.read` (the oversight UI) and `inbox.settings.write` (the fallback settings). Admin tier only.

The Communications module sub-strip in the morph bar gains an "Oversight" entry. The Settings → Communications nav gains "Fallback".

### 8. Translation keys

Add to `messages/en.json` and `messages/ar.json`:

- `inbox.oversight.title`
- `inbox.oversight.banner`
- `inbox.oversight.tabs.conversations`
- `inbox.oversight.tabs.flags`
- `inbox.oversight.tabs.audit_log`
- `inbox.oversight.actions.freeze`
- `inbox.oversight.actions.unfreeze`
- `inbox.oversight.actions.export`
- `inbox.oversight.actions.dismiss_flag`
- `inbox.oversight.actions.escalate_flag`
- `inbox.oversight.freeze.confirm.title`
- `inbox.oversight.freeze.confirm.body`
- `inbox.oversight.freeze.reason.label`
- `inbox.oversight.audit.actions.read_thread`
- `inbox.oversight.audit.actions.freeze`
- `inbox.oversight.audit.actions.unfreeze`
- `inbox.oversight.audit.actions.dismiss_flag`
- `inbox.oversight.audit.actions.escalate_flag`
- `inbox.oversight.audit.actions.export_thread`
- `inbox.oversight.audit.actions.search`
- `inbox.fallback.title`
- `inbox.fallback.section.admin`
- `inbox.fallback.section.teacher`
- `inbox.fallback.fields.enabled`
- `inbox.fallback.fields.after_hours`
- `inbox.fallback.fields.channels`
- `inbox.fallback.test.button`
- `inbox.fallback.test.success`

## Tests

E2E:

- As Principal: navigate to `/inbox/oversight` → see all conversations including ones not participating in
- As Principal: click a thread → oversight thread view loads → audit log entry created (verify via subsequent audit log fetch)
- As Principal: freeze a conversation → confirmation modal → freeze succeeds → system message appears in the conversation → composer disabled in the regular thread view
- As Principal: unfreeze → composer re-enabled
- As Principal: dismiss a flag → flag disappears from pending list → audit log shows dismissal
- As Principal: escalate a flag → PDF export URL returned → audit log shows escalation
- As Principal: navigate to `/settings/communications/fallback` → form loads with current settings
- Toggle teacher fallback off → save → reload → still off
- Click "Test fallback now" → toast confirms job enqueued
- As Teacher: `/inbox/oversight` → 403
- As Teacher: `/settings/communications/fallback` → 403

Component:

- Audit log table renders correctly
- Freeze modal validates required reason if a tenant policy requires it (it doesn't in v1, but the modal supports an optional reason field)
- Fallback form validates "at least one channel" when fallback is enabled

## Watch out for

- **The oversight banner** must be present on every oversight page. It's a UX deterrent against misuse — admins are reminded the audit log is watching.
- **Don't show the composer in the oversight view.** Admins can read but not write into a conversation they're not a participant of. Test for this — accidentally rendering the composer is a feature regression.
- **Audit log immutability** is a service-layer guarantee, not a UI guarantee. But the UI should reinforce it by not even showing edit/delete actions. Don't add a "delete entry" button "just in case".
- **PDF export URL** is a signed URL with a short expiry (impl 05 uses 1 hour). Surface the URL in the toast as a clickable link, not as text the user has to copy. Also re-fetch on demand if expired.
- **Frozen state persistence.** When a thread is frozen and the user navigates away and back, the frozen state must be re-fetched fresh — a stale cached "not frozen" state would let the regular thread view show an active composer for a frozen conversation.
- **Flag escalation** generates a PDF synchronously (or queues a job that returns a temporary URL — depends on PDF generation speed). For v1, synchronous generation is fine if the PDF helper is fast. If it's slow, switch to a job and return a URL that becomes available after the job completes.
- **Don't let the test-fallback debug endpoint run in production tenants without a guard.** Add an environment-flag check: only enabled in non-prod, OR behind a `inbox.settings.test_fallback` permission that no role has by default. Document the choice.
- **Audit log table size.** Over time the audit log will grow large. Pagination is mandatory. Don't try to render the full log.

## Deployment notes

- Web restart only.
- Smoke test:
  - As Principal: navigate to `/inbox/oversight` → conversations list loads.
  - Open a thread → audit log entry created.
  - Freeze it → system message appears, composer disabled.
  - Navigate to `/settings/communications/fallback` → form loads.
  - Save with teacher fallback after-hours = 1 → save persists.
  - Click "Test fallback now" → manual trigger enqueues.
  - As Teacher: both pages return 403.
