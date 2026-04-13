# E2E Test Specification: Communications — Full Module (Teacher View)

> **Coverage:** This document covers the **Communications / Inbox module** as rendered for a user holding the **Teacher** role. Teachers have `inbox.send` and `inbox.read` permissions but do NOT have `inbox.oversight.*`, `inbox.settings.*`, `communications.*`, or `parent.view_announcements` permissions. The spec exhaustively covers every button, form field, toast, modal, empty state, loading state, permission denial, and route redirect visible to (or blocked from) this role.
>
> **Pages covered:**
>
> - Inbox sidebar + thread list (`/en/inbox`)
> - Thread detail (`/en/inbox/threads/[id]`)
> - Inbox search (`/en/inbox/search`)
> - Profile communication preferences (`/en/profile/communication`)
>
> **Pages explicitly blocked:**
>
> - Communications hub dashboard (`/en/communications`)
> - Saved audiences (`/en/inbox/audiences`, `/en/inbox/audiences/new`, `/en/inbox/audiences/[id]`)
> - Oversight (`/en/inbox/oversight`, `/en/inbox/oversight/threads/[id]`)
> - Announcements management (`/en/communications/announcements`, `/en/communications/new`, `/en/communications/[id]`)
> - Inquiries management (`/en/communications/inquiries`, `/en/communications/inquiries/[id]`)
> - Settings pages (`/en/settings/messaging-policy`, `/en/settings/communications/safeguarding`, `/en/settings/communications/fallback`, `/en/settings/notifications`)

**Base URL:** `https://nhqs.edupod.app`
**Primary login:** **Sarah Daly** (`sarah.daly@nhqs.test` / `Password123!`) — Teacher, assigned to Classes 2A and 3B.

---

## Spec Pack Context

This document is the **teacher UI leg (leg 1)** of the `/e2e-full` release-readiness pack for the Communications module. Sibling specs (integration, worker, perf, security) live alongside. See `RELEASE-READINESS.md` at the module folder root for the composite sign-off sheet.

Running ONLY this spec = thorough teacher-shell smoke; running the full pack = tenant-onboarding readiness.

---

## Prerequisites — Multi-Tenant Test Environment (MANDATORY)

### Tenants

| Slug     | Hostname                    | Notes                                              |
| -------- | --------------------------- | -------------------------------------------------- |
| `nhqs`   | `https://nhqs.edupod.app`   | Primary — teacher is assigned to classes 2A, 3B    |
| `test-b` | `https://test-b.edupod.app` | Hostile neighbour — teacher has NO membership here |

### Users required

| Tenant   | Role                   | Name                                      | Login email                    | Password       | Relational scope to primary teacher |
| -------- | ---------------------- | ----------------------------------------- | ------------------------------ | -------------- | ----------------------------------- |
| `nhqs`   | teacher (primary)      | Sarah Daly                                | `sarah.daly@nhqs.test`         | `Password123!` | Self — assigned to classes 2A, 3B   |
| `nhqs`   | teacher (out-of-scope) | Any teacher NOT teaching Adam Moore       | e.g. `other.teacher@nhqs.test` | `Password123!` | No class overlap with Sarah         |
| `nhqs`   | admin                  | Yusuf Rahman                              | `owner@nhqs.test`              | `Password123!` | N/A (admin-tier)                    |
| `nhqs`   | parent (in-scope)      | Zainab Ali                                | `parent@nhqs.test`             | `Password123!` | Parent of a student in class 2A     |
| `nhqs`   | parent (out-of-scope)  | Any parent whose child is not in 2A or 3B | e.g. `other.parent@nhqs.test`  | `Password123!` | —                                   |
| `nhqs`   | student (in-scope)     | Adam Moore                                | `adam.moore@nhqs.test`         | `Password123!` | Student of class 2A                 |
| `test-b` | teacher                | Test-B Teacher                            | `teacher@test-b.test`          | `Password123!` | Used for cross-tenant hostile pair  |

### Tenant setup prerequisites

| Setting                               | `nhqs` value                        | `test-b` value (for comparison) |
| ------------------------------------- | ----------------------------------- | ------------------------------- |
| `messaging_enabled`                   | `true`                              | `true`                          |
| `students_can_initiate`               | `false` (tested inverted scenarios) | `true`                          |
| `parents_can_initiate`                | `true`                              | `true`                          |
| `parent_to_parent_messaging`          | `false`                             | `true`                          |
| `student_to_student_messaging`        | `false`                             | `true`                          |
| `student_to_parent_messaging`         | `true`                              | `true`                          |
| Messaging policy teacher→parent cell  | `allowed = true`                    | `allowed = true`                |
| Messaging policy teacher→student cell | `allowed = true`                    | `allowed = true`                |
| Messaging policy teacher→teacher cell | `allowed = true`                    | `allowed = true`                |
| Safeguarding keywords                 | 12 seeded (various severity)        | 3 seeded                        |

### Seed data for teacher scope

| Entity                                                               | Count for `nhqs`               |
| -------------------------------------------------------------------- | ------------------------------ |
| Conversations Sarah participates in (direct, read)                   | ≥ 5                            |
| Conversations Sarah participates in (direct, unread)                 | ≥ 3                            |
| Conversations Sarah participates in (group, she initiated)           | ≥ 2                            |
| Conversations Sarah participates in (group, admin initiated)         | ≥ 2                            |
| Conversations Sarah participates in (broadcast, allow_replies=true)  | ≥ 1                            |
| Conversations Sarah participates in (broadcast, allow_replies=false) | ≥ 1                            |
| Frozen conversations involving Sarah                                 | 1 (frozen by admin)            |
| Messages authored by Sarah in past 20 min                            | ≥ 2 (eligible for edit/delete) |
| Messages authored by Sarah ≥ 20 min ago                              | ≥ 2 (past edit window)         |

### Hostile-pair assertions (enforce during execution)

1. As Sarah (nhqs teacher), navigate to `/en/inbox/threads/{test-b_conversation_id}` → **404 / redirect**, not 200.
2. As Sarah, `GET /api/v1/inbox/conversations/{test-b_conversation_id}` via DevTools fetch → **404**.
3. As Sarah, `GET /api/v1/inbox/people-search?q=<test-b_name>` → no `test-b` users in results.
4. As Sarah, navigate to `/en/communications` → **redirect to `/en/inbox`** (teacher is non-admin).
5. As Sarah, navigate to `/en/inbox/oversight` → **redirect to `/en/inbox`** (teacher is non-admin-tier).
6. As Sarah, navigate to `/en/inbox/audiences` → **redirect to `/en/inbox`**.

---

## Out of Scope for This Spec

This spec covers only the UI-visible surface as a teacher. It does **NOT** cover:

- RLS leakage matrix → `integration/communications-integration-spec.md`
- Policy-engine unit logic (the service layer) → `integration/communications-integration-spec.md` §4
- Webhook signature and replay → `integration/communications-integration-spec.md` §§5–6
- BullMQ job behaviours (dispatch, fallback scanning, safeguarding scan) → `worker/communications-worker-spec.md`
- Perf under load (100-thread inbox, 10k search results) → `perf/communications-perf-spec.md`
- Attachment malware scan, SSRF via presigned URLs, rate-limit abuse → `security/communications-security-spec.md`
- PDF byte-level correctness — teachers cannot export, so n/a here
- Platform admin routes (`(platform)/`) — not teacher-accessible and out of module

A tester who runs ONLY this spec validates the teacher-shell UI. Pair with siblings for release-readiness.

---

## Table of Contents

1. [Navigation & Landing](#1-navigation--landing)
2. [Inbox Sidebar -- Full Walkthrough](#2-inbox-sidebar--full-walkthrough)
3. [Thread List Items](#3-thread-list-items)
4. [Compose Dialog -- Direct Message](#4-compose-dialog--direct-message)
5. [Compose Dialog -- Group Message](#5-compose-dialog--group-message)
6. [Compose Dialog -- Broadcast (Policy Behavior)](#6-compose-dialog--broadcast-policy-behavior)
7. [People Picker](#7-people-picker)
8. [Channel Selector & Attachments](#8-channel-selector--attachments)
9. [Thread View -- Reading Messages](#9-thread-view--reading-messages)
10. [Thread View -- Reply Composer](#10-thread-view--reply-composer)
11. [Thread View -- Frozen Conversation](#11-thread-view--frozen-conversation)
12. [Thread View -- Broadcast with No Replies](#12-thread-view--broadcast-with-no-replies)
13. [Thread View -- Read Receipts (Staff Feature)](#13-thread-view--read-receipts-staff-feature)
14. [Message Edit & Delete](#14-message-edit--delete)
15. [Inbox Search](#15-inbox-search)
16. [Mute & Archive](#16-mute--archive)
17. [Profile Communication Preferences](#17-profile-communication-preferences)
18. [Inbox Polling & Real-time Badge](#18-inbox-polling--real-time-badge)
19. [Cross-Account Messaging Flow (Admin -> Teacher)](#19-cross-account-messaging-flow-admin---teacher)
20. [Cross-Account Messaging Flow (Teacher -> Parent)](#20-cross-account-messaging-flow-teacher---parent)
21. [Relational Scope Enforcement](#21-relational-scope-enforcement)
22. [Frozen Conversation Behavior (Admin-Initiated)](#22-frozen-conversation-behavior-admin-initiated)
23. [Admin-Only Affordances -- What Teachers Must NOT See](#23-admin-only-affordances--what-teachers-must-not-see)
24. [Route Blocking -- Negative Assertions](#24-route-blocking--negative-assertions)
25. [API Permission Enforcement -- 403 Paths](#25-api-permission-enforcement--403-paths)
26. [Arabic / RTL](#26-arabic--rtl)
27. [Data Invariants](#27-data-invariants-run-after-each-major-flow)
28. [Backend Endpoint Map](#28-backend-endpoint-map)
29. [Console & Network Health](#29-console--network-health)
30. [End of Spec](#30-end-of-spec)
31. [End of Spec](#29-end-of-spec)

---

## 1. Navigation & Landing

**Starting point:** Teacher is logged in and on the school dashboard.

| #   | What to Check                                                             | Expected Result                                                                                                                                                                            | Pass/Fail |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 1.1 | Locate the Inbox icon in the morph bar (top navigation bar)               | An envelope/inbox icon is visible in the morph bar. It may show an unread badge count if the teacher has unread messages.                                                                  |           |
| 1.2 | Click the Inbox icon in the morph bar                                     | URL changes to `/en/inbox`. The inbox sidebar-shell layout renders.                                                                                                                        |           |
| 1.3 | Verify that clicking the Inbox icon does NOT land on `/en/communications` | The teacher is taken directly to `/en/inbox`, never to the Communications hub dashboard. The hub is admin-only.                                                                            |           |
| 1.4 | Verify the morph bar remains stable during navigation                     | No flashing, no layout jump, no remounting of the morph bar. The morph bar persists across the transition.                                                                                 |           |
| 1.5 | Verify the sub-strip navigation (if any) for the Inbox module             | The Inbox module does NOT display a multi-item sub-strip for teachers. Teachers see only the inbox sidebar-shell. There is no "Audiences", "Oversight", or "Announcements" sub-strip item. |           |
| 1.6 | Browser URL structure                                                     | URL is exactly `/en/inbox` (with locale prefix). No query parameters by default.                                                                                                           |           |
| 1.7 | Page title / document title                                               | The browser tab title includes "Inbox" or the app name.                                                                                                                                    |           |

---

## 2. Inbox Sidebar -- Full Walkthrough

**URL:** `/en/inbox`

### 2.1 Header Row

| #     | What to Check                    | Expected Result                                                                                                                                                                                                                                                         | Pass/Fail |
| ----- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1.1 | Sidebar heading (`<h1>`)         | An `<h1>` element with the text from translation key `inbox.title` (e.g., "Inbox"). Font: 15px semibold, tracking-tight, color `text-primary`.                                                                                                                          |           |
| 2.1.2 | Compose button                   | A primary `<Button>` with a **Pencil** icon (`lucide-react Pencil`). On screens `>= sm`, the button also shows a text label (translation key `inbox.composeButton`). On mobile `< sm`, only the icon shows. The button has `aria-label` matching `inbox.composeButton`. |           |
| 2.1.3 | Compose button size and position | The button is `size="sm"`, height 8 (h-8), positioned at the end of the header row via `justify-between`.                                                                                                                                                               |           |
| 2.1.4 | Click the Compose button         | The Compose Dialog opens (see sections 4-6).                                                                                                                                                                                                                            |           |

### 2.2 Search Form

| #     | What to Check                                      | Expected Result                                                                                                                                                                             | Pass/Fail |
| ----- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.2.1 | Search input field                                 | A search `<Input>` with a **Search** icon (lucide `Search`) positioned at `start-3`, placeholder text from `inbox.search.placeholder`. The input has `aria-label` matching the placeholder. |           |
| 2.2.2 | Search input styling                               | Height h-9, transparent border, background `surface-secondary`, left/start padding `ps-9` to accommodate the icon, `text-base` on mobile, `md:text-sm` on desktop.                          |           |
| 2.2.3 | Type "hello" into the search input and press Enter | The form submits. URL changes to `/en/inbox/search?q=hello`. The search results page loads (see section 15).                                                                                |           |
| 2.2.4 | Submit search with empty input                     | Nothing happens. The form handler checks for a trimmed non-empty string and returns early if empty. No navigation occurs.                                                                   |           |

### 2.3 Filter Chips

| #      | What to Check                        | Expected Result                                                                                                                                                                 | Pass/Fail |
| ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.3.1  | Number of filter chips               | Exactly **6** filter chip buttons are rendered in a horizontally scrollable row: **All**, **Unread**, **Direct**, **Group**, **Broadcasts**, **Archived**.                      |           |
| 2.3.2  | Default active filter                | "All" is active by default (no `?filter=` in URL). The active chip has `bg-[var(--color-text-primary)]` background and `text-[var(--color-surface)]` text with `shadow-sm`.     |           |
| 2.3.3  | Inactive chip styling                | Non-active chips have `bg-transparent`, text `text-secondary`, hover shows `bg-surface-secondary` and text becomes `text-primary`.                                              |           |
| 2.3.4  | Chip pill shape                      | Each chip has `rounded-pill` class, padding `px-2.5 py-1`, font size `text-[11px]`, `font-semibold`.                                                                            |           |
| 2.3.5  | `aria-pressed` attribute             | Each chip button has `aria-pressed="true"` when active, `aria-pressed="false"` when inactive.                                                                                   |           |
| 2.3.6  | Click "Unread" chip                  | URL updates to `/en/inbox?filter=unread`. The thread list re-fetches with `unread_only=true` query param. Only unread threads appear.                                           |           |
| 2.3.7  | Click "Direct" chip                  | URL updates to `/en/inbox?filter=direct`. Thread list re-fetches with `kind=direct`. Only direct message threads appear.                                                        |           |
| 2.3.8  | Click "Group" chip                   | URL updates to `/en/inbox?filter=group`. Thread list re-fetches with `kind=group`. Only group conversations appear.                                                             |           |
| 2.3.9  | Click "Broadcasts" chip              | URL updates to `/en/inbox?filter=broadcasts`. Thread list re-fetches with `kind=broadcast`. Only broadcast threads appear.                                                      |           |
| 2.3.10 | Click "Archived" chip                | URL updates to `/en/inbox?filter=archived`. Thread list re-fetches with `archived=true`. Only archived threads appear.                                                          |           |
| 2.3.11 | Click "All" chip (return to default) | The `filter` query param is removed from the URL. All non-archived threads appear again. The API is called with `archived=false` and no `kind` or `unread_only` params.         |           |
| 2.3.12 | Horizontal scroll on narrow screens  | The filter row has `overflow-x-auto` and the container has `-mx-1` padding compensation. Chips are `shrink-0` so they don't wrap. The `no-scrollbar` class hides the scrollbar. |           |

### 2.4 Thread List Area

| #     | What to Check                         | Expected Result                                                                                                                                                                                                            | Pass/Fail |
| ----- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.4.1 | Loading state (first load)            | While threads are loading and `threads === null`, a centered text message from `inbox.loading` appears, styled `text-sm text-text-secondary`.                                                                              |           |
| 2.4.2 | Error state                           | If the API call fails, an error message from `inbox.errors.load_threads` appears in `text-red-600`, centered with `p-4`.                                                                                                   |           |
| 2.4.3 | Empty state (no threads match filter) | If threads loads successfully but returns an empty array, a centered text message from `inbox.list.empty` appears, `text-sm text-text-secondary`, with `p-6`.                                                              |           |
| 2.4.4 | Thread list rendering                 | Threads render as a vertical list inside a `divide-y divide-[var(--color-border)]` container. Each thread is a `ThreadListItem` component (see section 3).                                                                 |           |
| 2.4.5 | Scroll behavior                       | The thread list area has `flex-1 overflow-y-auto overflow-x-hidden`, allowing vertical scrolling for long lists.                                                                                                           |           |
| 2.4.6 | API call parameters                   | On mount, `GET /api/v1/inbox/conversations?page=1&pageSize=30&archived=false` is called. Verify in the Network tab.                                                                                                        |           |
| 2.4.7 | Keyboard shortcut: press `c`          | Pressing the `c` key (not inside an input, textarea, select, or contentEditable element) opens the Compose Dialog. The event handler checks `event.key !== 'c'` and checks modifier keys (`metaKey`, `ctrlKey`, `altKey`). |           |
| 2.4.8 | Keyboard shortcut: `c` inside input   | Pressing `c` while focused on the search input or any input/textarea does NOT open the compose dialog. The key handler returns early for INPUT, TEXTAREA, SELECT, and contentEditable elements.                            |           |

### 2.5 Sidebar Layout (Desktop vs Mobile)

| #     | What to Check                     | Expected Result                                                                                                                                                                                                                                                                   | Pass/Fail |
| ----- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.5.1 | Desktop layout (>= md breakpoint) | The inbox uses a two-pane layout: sidebar (360px fixed width, `md:w-[360px] md:shrink-0`) on the start side, and a main content area (`flex-1 min-w-0`) on the end side. The sidebar has a border on the end side (`border-e`).                                                   |           |
| 2.5.2 | Mobile layout (< md breakpoint)   | On mobile, when on the `/en/inbox` route (no thread selected), the sidebar takes full width (`w-full`). The main content area is hidden (`hidden md:flex`).                                                                                                                       |           |
| 2.5.3 | Mobile with thread selected       | When on `/en/inbox/threads/[id]`, the sidebar is hidden on mobile (`hidden md:flex`) and the main content area (thread view) takes full width.                                                                                                                                    |           |
| 2.5.4 | Container height                  | The overall container uses `h-[calc(100dvh-56px)]` to account for the morph bar height (56px). `overflow-hidden` prevents double scrollbars.                                                                                                                                      |           |
| 2.5.5 | No thread selected (desktop)      | On desktop at `/en/inbox` (no thread ID), the main area shows the inbox empty state: a centered column with an InboxIcon in a 64px circle (`h-16 w-16 rounded-full bg-surface-secondary`), a heading from `inbox.empty_state.title`, and body text from `inbox.empty_state.body`. |           |

---

## 3. Thread List Items

Each thread in the sidebar list is rendered by the `ThreadListItem` component.

| #    | What to Check                         | Expected Result                                                                                                                                                                                                                                                                       | Pass/Fail |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1  | Overall structure                     | Each item is a `<button>` element with `type="button"`, full width, flex row layout, padding `px-4 py-3`, `text-start` alignment.                                                                                                                                                     |           |
| 3.2  | Kind icon -- Direct message           | For `kind === 'direct'`, a **User** icon (lucide `User`) renders inside a 36px circle (`h-9 w-9 rounded-full`).                                                                                                                                                                       |           |
| 3.3  | Kind icon -- Group conversation       | For `kind === 'group'`, a **Users** icon renders in the circle.                                                                                                                                                                                                                       |           |
| 3.4  | Kind icon -- Broadcast                | For `kind === 'broadcast'`, a **Megaphone** icon renders in the circle.                                                                                                                                                                                                               |           |
| 3.5  | Unread thread styling -- icon circle  | When `unread_count > 0`, the icon circle has `bg-primary-100 text-primary-700`. When read, it has `bg-surface-secondary`.                                                                                                                                                             |           |
| 3.6  | Unread dot indicator                  | When the thread is unread AND not selected, a small blue dot (`h-2 w-2 rounded-full bg-primary`) appears at `start-1.5`, vertically centered.                                                                                                                                         |           |
| 3.7  | Unread thread styling -- subject text | The subject line has `font-semibold` when unread. When read, it has normal weight. Both use `text-text-primary`.                                                                                                                                                                      |           |
| 3.8  | Subject display                       | If the thread has a non-empty `subject`, it displays that. For direct messages with no subject, it shows the translation `inbox.thread.direct_fallback_subject`. For other kinds with no subject, it shows `inbox.thread.untitled_subject`. The subject is truncated with `truncate`. |           |
| 3.9  | Frozen indicator                      | If `thread.frozen_at` is not null, a **Lock** icon (`h-3.5 w-3.5 text-text-tertiary`) appears inline with the subject row. It has `aria-label` from `inbox.thread.frozen.title`.                                                                                                      |           |
| 3.10 | Timestamp display                     | The timestamp renders at the end of the subject row with `text-[11px] tabular-nums`. Format: today shows HH:mm, this week shows short weekday (e.g., "Mon"), older shows "d MMM" (e.g., "5 Apr"). When unread: `font-semibold text-primary-700`. When read: `text-text-tertiary`.     |           |
| 3.11 | Preview body                          | Below the subject row, a second row shows `preview_body` truncated to one line. When unread: `text-text-primary`. When read: `text-text-tertiary`. If no preview body, a non-breaking space renders to maintain row height.                                                           |           |
| 3.12 | Unread count badge                    | When unread, a pill badge (`rounded-pill bg-primary-600 text-white text-[10px] font-bold`) appears at the end of the preview row. Shows the count, or "99+" if > 99. Min size `18px x 18px`.                                                                                          |           |
| 3.13 | Selected state                        | The selected thread has `bg-primary-50` background. A 3px vertical accent bar (`before:bg-primary-600`) appears on the start edge. The unread dot does NOT show when selected.                                                                                                        |           |
| 3.14 | Hover state (non-selected)            | On hover, the item gets `bg-surface-hover`.                                                                                                                                                                                                                                           |           |
| 3.15 | `aria-current` attribute              | The selected thread has `aria-current="true"`. Non-selected threads have no `aria-current`.                                                                                                                                                                                           |           |
| 3.16 | Click a thread item                   | Navigates to `/en/inbox/threads/{thread.id}`. The clicked item becomes selected.                                                                                                                                                                                                      |           |

---

## 4. Compose Dialog -- Direct Message

**Trigger:** Click the Compose button or press `c`.

### 4.1 Dialog Shell

| #     | What to Check                        | Expected Result                                                                                                                                                                                                                                                      | Pass/Fail |
| ----- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1.1 | Dialog opens                         | A Dialog component renders, overlaying the inbox. On mobile it fills the full viewport (`h-[100dvh] max-h-[100dvh] w-full max-w-full`). On desktop it is centered with `md:max-h-[90vh] md:max-w-2xl md:rounded-xl`.                                                 |           |
| 4.1.2 | Dialog header                        | Contains a `DialogTitle` with text from `inbox.compose.title` (e.g., "New message") and a `DialogDescription` from `inbox.compose.description`, styled `text-xs text-text-tertiary`. The header has a bottom border.                                                 |           |
| 4.1.3 | Tab navigation                       | Below the header, a `<nav role="tablist">` contains three tab buttons: **Direct** (MessageSquare icon), **Group** (Users icon), **Broadcast** (Megaphone icon). Labels from `inbox.compose.tabs.direct`, `inbox.compose.tabs.group`, `inbox.compose.tabs.broadcast`. |           |
| 4.1.4 | Default active tab                   | "Direct" is active by default. Active tab has `bg-primary/10 text-primary`. Inactive tabs have `text-text-secondary hover:bg-background/60`.                                                                                                                         |           |
| 4.1.5 | Tab `role="tab"` and `aria-selected` | Each tab button has `role="tab"`. The active tab has `aria-selected="true"`.                                                                                                                                                                                         |           |
| 4.1.6 | Tab bar styling                      | Flex row with `gap-1`, bottom border, padding `px-4 py-2` (desktop: `md:px-6`). Each tab has `rounded-md px-3 py-1.5 text-sm`.                                                                                                                                       |           |

### 4.2 Direct Tab Fields

| #     | What to Check             | Expected Result                                                                                                                                                                                                  | Pass/Fail |
| ----- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.2.1 | Recipient field           | A `<Label>` with text from `inbox.compose.direct.recipient` followed by a `PeoplePicker` in `mode="single"`. Placeholder from `inbox.compose.direct.recipientPlaceholder`.                                       |           |
| 4.2.2 | Body field                | A `<Label>` with text from `inbox.compose.body.label` and a `<Textarea>` with `id="body"`, placeholder from `inbox.compose.body.placeholder`, 6 rows.                                                            |           |
| 4.2.3 | Attachments section       | A `<Label>` from `inbox.compose.attachments` followed by the `AttachmentUploader` component (see section 8).                                                                                                     |           |
| 4.2.4 | Channels section          | A `<Label>` from `inbox.compose.channels` followed by the `ChannelSelector` component (see section 8).                                                                                                           |           |
| 4.2.5 | Disable fallback checkbox | A `<Checkbox>` with `id="disable-fallback"` and a label from `inbox.compose.disableFallback.label`. The label is wrapped in a `Tooltip` that shows hint text from `inbox.compose.disableFallback.hint` on hover. |           |

### 4.3 Direct Tab -- Validation & Submit

| #      | What to Check                         | Expected Result                                                                                                                                                                                                | Pass/Fail |
| ------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.3.1  | Send button disabled by default       | The Send button (primary, with **Send** icon and text from `inbox.compose.actions.send`) is disabled because no recipient is selected and body is empty.                                                       |           |
| 4.3.2  | Select a recipient, leave body empty  | Send button remains disabled. `canSubmit` requires `body.trim().length > 0`.                                                                                                                                   |           |
| 4.3.3  | Type body text, no recipient          | Send button remains disabled. `canSubmit` requires `directRecipient !== null`.                                                                                                                                 |           |
| 4.3.4  | Select a recipient AND type body text | Send button becomes enabled.                                                                                                                                                                                   |           |
| 4.3.5  | Click Send                            | A `POST /api/v1/inbox/conversations` request fires with payload: `{ kind: "direct", recipient_user_id: "<uuid>", body: "...", attachments: [], extra_channels: [], disable_fallback: false }`.                 |           |
| 4.3.6  | Successful send                       | A success toast appears with text from `inbox.compose.toast.success`. The dialog closes. After a 150ms delay, all compose state resets. The router navigates to `/inbox/threads/{new_conversation_id}`.        |           |
| 4.3.7  | Failed send -- generic error          | A toast.error appears with the API error message or fallback from `inbox.compose.toast.genericError`. The dialog remains open. The error is logged to console as `[compose-dialog.submit]`.                    |           |
| 4.3.8  | Cancel button                         | A ghost `<Button>` from `inbox.compose.actions.cancel`. Clicking it closes the dialog and resets state after 150ms.                                                                                            |           |
| 4.3.9  | Submitting state                      | While submitting, the Send button shows a **Loader2** spinner icon (animate-spin) instead of the Send icon. Both the Cancel and Send buttons are disabled (`isSubmitting`). All form inputs are also disabled. |           |
| 4.3.10 | Close dialog via overlay click        | Clicking outside the dialog content closes it. State resets after 150ms.                                                                                                                                       |           |

---

## 5. Compose Dialog -- Group Message

**Trigger:** Open compose dialog, click the "Group" tab.

| #    | What to Check                                      | Expected Result                                                                                                                                                                                        | Pass/Fail |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 5.1  | Subject field                                      | A `<Label>` with `htmlFor="group-subject"` and text from `inbox.compose.group.subject`. An `<Input>` with `id="group-subject"`, placeholder from `inbox.compose.group.subjectPlaceholder`.             |           |
| 5.2  | Participants field                                 | A `<Label>` from `inbox.compose.group.participants` followed by a `PeoplePicker` in `mode="multi"` with `maxRecipients={49}`. Placeholder from `inbox.compose.group.participantsPlaceholder`.          |           |
| 5.3  | Participant count text                             | Below the PeoplePicker, a `<p>` with `text-xs text-text-tertiary` shows the current count from `inbox.compose.group.participantsCount` (e.g., "2 of 49 participants").                                 |           |
| 5.4  | Body, Attachments, Channels, Disable Fallback      | Same fields as the Direct tab (sections 4.2.2 through 4.2.5). Body, attachments, channels, and fallback checkbox are shared across all tabs.                                                           |           |
| 5.5  | Validation -- Send disabled when subject empty     | With participants selected and body filled, but subject empty, Send is disabled.                                                                                                                       |           |
| 5.6  | Validation -- Send disabled when < 2 participants  | With subject and body filled, but only 1 participant, Send is disabled. `groupRecipients.length >= 2` is required.                                                                                     |           |
| 5.7  | Validation -- Send disabled when > 49 participants | The PeoplePicker enforces `maxRecipients={49}`. The `selectUser` callback returns early if `props.value.length >= props.maxRecipients`.                                                                |           |
| 5.8  | Validation -- all valid                            | Subject non-empty, 2-49 participants, body non-empty: Send is enabled.                                                                                                                                 |           |
| 5.9  | Successful send payload                            | `POST /api/v1/inbox/conversations` with `{ kind: "group", subject: "...", participant_user_ids: ["uuid1", "uuid2", ...], body: "...", attachments: [], extra_channels: [], disable_fallback: false }`. |           |
| 5.10 | Post-send behavior                                 | Same as Direct: success toast, dialog closes, navigates to new thread.                                                                                                                                 |           |

---

## 6. Compose Dialog -- Broadcast (Policy Behavior)

**Trigger:** Open compose dialog, click the "Broadcast" tab.

| #    | What to Check                                               | Expected Result                                                                                                                                                                                                                                                              | Pass/Fail |
| ---- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1  | Broadcast tab is visible to teachers                        | The Broadcast tab IS present in the tab bar. All three tabs render regardless of role. The policy check happens server-side on submit, not client-side on render.                                                                                                            |           |
| 6.2  | Subject field                                               | A `<Label>` with `htmlFor="broadcast-subject"` and text from `inbox.compose.broadcast.subject`. An `<Input>` with `id="broadcast-subject"`, placeholder from `inbox.compose.broadcast.subjectPlaceholder`.                                                                   |           |
| 6.3  | Audience picker                                             | A `<Label>` from `inbox.compose.broadcast.audience` followed by the `AudiencePicker` component. The picker has three sub-modes: Quick (preset chips), Saved (list of saved audiences), Custom (chip builder).                                                                |           |
| 6.4  | Quick audience chips                                        | Three quick-select buttons: **Whole school** (`school`), **All parents** (`parents_school`), **All staff** (`staff_all`). Active chip has `border-primary bg-primary/10 text-primary`.                                                                                       |           |
| 6.5  | Allow replies checkbox                                      | A bordered card (`rounded-lg border p-3`) containing a `<Checkbox>` with `id="allow-replies"`, a label from `inbox.compose.broadcast.allowReplies`, and hint text from `inbox.compose.broadcast.allowRepliesHint`. Defaults to unchecked.                                    |           |
| 6.6  | Validation                                                  | Subject non-empty, audience selected (quick chip or saved or custom with definition), body non-empty: Send is enabled.                                                                                                                                                       |           |
| 6.7  | Teacher sends broadcast -- tenant allows teacher broadcasts | If the tenant's messaging policy matrix allows teachers to broadcast, the `POST /api/v1/inbox/conversations` succeeds. The broadcast is created. Same success flow as Direct/Group.                                                                                          |           |
| 6.8  | Teacher sends broadcast -- tenant blocks teacher broadcasts | If the tenant's policy matrix does NOT allow teacher broadcasts, the API returns a **403** with a policy denial reason code (e.g., `BROADCAST_NOT_ALLOWED_FOR_ROLE` or a relational scope error). A `toast.error` appears with the API error message. The dialog stays open. |           |
| 6.9  | Empty audience error                                        | If the audience resolves to zero recipients, the API returns an error with code `BROADCAST_AUDIENCE_EMPTY`. A toast.error appears with text from `inbox.compose.toast.audienceEmpty`.                                                                                        |           |
| 6.10 | Saved audience sub-mode                                     | Clicking "Saved" mode tab triggers `GET /api/v1/inbox/audiences`. Teacher has `inbox.send` permission, so the API allows access. A list of saved audiences renders. If none exist, empty text from `inbox.audiencePicker.savedEmptyGuide` appears.                           |           |
| 6.11 | Custom audience sub-mode                                    | Clicking "Custom" mode tab shows the `AudienceChipBuilder` for building filter rules. Changes debounce 500ms before calling `POST /api/v1/inbox/audiences/preview` for count. A "Save as" ghost button allows saving the custom audience.                                    |           |
| 6.12 | Save audience dialog                                        | Clicking "Save as" opens a dialog with name input, description textarea, Cancel and Save buttons. Saving calls `POST /api/v1/inbox/audiences` with `{ name, description, kind: "dynamic", definition }`. Success toast from `inbox.audiencePicker.saveDialog.success`.       |           |

---

## 7. People Picker

The `PeoplePicker` component is used in the Direct tab (single mode) and Group tab (multi mode).

| #    | What to Check                            | Expected Result                                                                                                                                                                                                                                                                     | Pass/Fail |
| ---- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1  | Input field                              | A text `<Input>` with a **Search** icon at `start-2.5`, placeholder from `inbox.peoplePicker.placeholder` (or the compose-specific placeholder). `autoComplete="off"`. Padding `ps-9`.                                                                                              |           |
| 7.2  | Focus opens dropdown                     | Focusing the input sets `isOpen` to true. If there is any query text or results, the dropdown listbox appears.                                                                                                                                                                      |           |
| 7.3  | Debounced search                         | Typing triggers a 200ms debounce before calling `GET /api/v1/inbox/people-search?q={query}&limit=20`. The API filters results by the teacher's relational scope server-side.                                                                                                        |           |
| 7.4  | Loading state                            | While searching with no results yet, a loading indicator with **Loader2** spinner and text from `inbox.peoplePicker.searching` appears in the dropdown.                                                                                                                             |           |
| 7.5  | No results state                         | If the search returns no visible results (after filtering already-picked users), text from `inbox.peoplePicker.empty` appears.                                                                                                                                                      |           |
| 7.6  | Results list                             | Results render in a `<ul>` with `role="listbox"`, max height `max-h-64 overflow-y-auto`. Each result is a `<li role="option">` with avatar (initials fallback), display name, role label, and optionally email (format: `role_label . email`).                                      |           |
| 7.7  | Highlighted result                       | The currently highlighted option has `bg-background/60`. `aria-selected="true"` is set on the highlighted item. Mouse enter changes highlight.                                                                                                                                      |           |
| 7.8  | Select a user (mouse)                    | Clicking (mouseDown) a result selects it. In single mode: replaces the value, clears query, closes dropdown. In multi mode: adds to the list, clears query, dropdown stays open.                                                                                                    |           |
| 7.9  | Select a user (keyboard Enter)           | Pressing Enter selects the highlighted result.                                                                                                                                                                                                                                      |           |
| 7.10 | Keyboard navigation -- ArrowDown/ArrowUp | ArrowDown moves highlight down (clamped to last). ArrowUp moves up (clamped to first). Both prevent default.                                                                                                                                                                        |           |
| 7.11 | Keyboard -- Escape                       | Pressing Escape closes the dropdown without selecting.                                                                                                                                                                                                                              |           |
| 7.12 | Keyboard -- Backspace (multi mode)       | In multi mode, pressing Backspace when the input is empty removes the last picked user from the chips.                                                                                                                                                                              |           |
| 7.13 | Already-picked users filtered            | Results that are already picked (by `user_id`) are filtered out of the visible results list so you cannot add the same person twice.                                                                                                                                                |           |
| 7.14 | Picked user chips (multi mode)           | Above the input, selected users render as `Badge` components (`variant="secondary"`) with avatar initials, display name, and an X button to remove. The X button has `aria-label` from `inbox.peoplePicker.removeRecipient` with the user's name.                                   |           |
| 7.15 | Picked user chip (single mode)           | In single mode, a single Badge chip renders above the input when a recipient is selected. The X button calls `onChange(null)` to clear.                                                                                                                                             |           |
| 7.16 | Relational scope filtering               | The API `GET /api/v1/inbox/people-search` only returns users within the teacher's relational scope: other teachers, admin-tier staff, office/finance/nurse staff, and parents of students in the teacher's classes. Parents of students NOT in the teacher's classes do not appear. |           |
| 7.17 | Max recipients enforcement (multi)       | In multi mode with `maxRecipients={49}`, once 49 users are picked, `selectUser` returns early and no more can be added.                                                                                                                                                             |           |
| 7.18 | Blur closes dropdown                     | Blurring the input closes the dropdown after a 150ms delay (to allow click events to register first).                                                                                                                                                                               |           |

---

## 8. Channel Selector & Attachments

### 8.1 Channel Selector

| #     | What to Check                  | Expected Result                                                                                                                                                                                                                                                     | Pass/Fail |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1.1 | Inbox channel chip (always-on) | The first chip is the "Inbox" channel. It is always active, locked (`disabled`), and shows a checkmark. It cannot be toggled off. Icon: **Mail**. Sublabel from `inbox.channelSelector.inboxSublabel`.                                                              |           |
| 8.1.2 | Extra channel chips            | Three additional channel chips: **Email** (Mail icon), **SMS** (Smartphone icon), **WhatsApp** (Phone icon). Each shows a per-recipient cost estimate from `inbox.channelSelector.perRecipientCost`.                                                                |           |
| 8.1.3 | Toggle extra channels          | Clicking an extra channel chip toggles it on/off. Active chips have `border-primary bg-primary/5` with a checkmark. Inactive chips have `border-border bg-surface`.                                                                                                 |           |
| 8.1.4 | Cost estimate text             | Below the chips, a `<p>` with `text-xs text-text-tertiary` shows: when no extra channels selected, text from `inbox.channelSelector.inboxOnly`. When channels are selected, a cost estimate from `inbox.channelSelector.estimate` with bold emphasis on the amount. |           |
| 8.1.5 | Cost calculation               | The estimate is `(sum of per-channel costs) * recipientCount`. For broadcasts with an audience, this may be 0 (recipientCount comes from the compose form's direct/group recipient count).                                                                          |           |
| 8.1.6 | Disabled state                 | When the compose form is submitting, all extra channel chips are disabled (`opacity-60`, `cursor-not-allowed`).                                                                                                                                                     |           |

### 8.2 Attachment Uploader

| #      | What to Check                 | Expected Result                                                                                                                                                                                                                                            | Pass/Fail |
| ------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.2.1  | Drop zone                     | A dashed-border container (`border-dashed border-border bg-surface`) with an **UploadCloud** icon, hint text from `inbox.attachmentUploader.dropHint`, and a count indicator `{current}/{max}` (max = 10).                                                 |           |
| 8.2.2  | Add Files button              | A ghost `<Button>` with **Paperclip** icon and text from `inbox.attachmentUploader.addFiles`. Clicking opens a hidden file input with `multiple` and `accept` set to the ALLOWED_ATTACHMENT_MIME_TYPES list.                                               |           |
| 8.2.3  | Drag and drop                 | Dragging files over the drop zone highlights it with `border-primary bg-primary/5`. Dropping triggers the upload.                                                                                                                                          |           |
| 8.2.4  | File upload flow              | Each accepted file triggers `POST /api/v1/inbox/attachments` as a FormData upload. While uploading, a pending item row shows with **Loader2** spinner and "Uploading..." text.                                                                             |           |
| 8.2.5  | Successful upload             | The pending row is replaced by a completed attachment row with **FileText** icon, filename (truncated), file size (formatted: B / KB / MB), and an X button to remove.                                                                                     |           |
| 8.2.6  | Upload error                  | If upload fails, the pending row shows **AlertCircle** icon in destructive color, the error message, and an X button to dismiss. A toast.error also fires.                                                                                                 |           |
| 8.2.7  | File size validation          | Files > 25 MB are rejected client-side with a toast.error from `inbox.attachmentUploader.tooLarge`. They are not uploaded.                                                                                                                                 |           |
| 8.2.8  | MIME type validation          | Files with MIME types not in the allowlist are rejected with toast.error from `inbox.attachmentUploader.disallowedType`. Allowed types: JPEG, PNG, GIF, WebP, HEIC, HEIF, PDF, Word (.doc/.docx), Excel (.xls/.xlsx), PowerPoint (.ppt/.pptx), plain text. |           |
| 8.2.9  | Max attachment count          | Once 10 attachments are reached (uploaded + uploading), additional files trigger toast.error from `inbox.attachmentUploader.tooMany`. The "Add Files" button becomes disabled. The drop zone shows `opacity-60`.                                           |           |
| 8.2.10 | Remove existing attachment    | Clicking the X button on an uploaded attachment calls `removeExisting(storageKey)` and removes it from the list.                                                                                                                                           |           |
| 8.2.11 | Remove pending/errored upload | Clicking the X on a pending/error row removes it from the pending list.                                                                                                                                                                                    |           |
| 8.2.12 | Remove button accessibility   | Each remove button has `aria-label` from `inbox.attachmentUploader.removeAria` or `inbox.attachmentUploader.cancelAria` with the filename.                                                                                                                 |           |

---

## 9. Thread View -- Reading Messages

**URL:** `/en/inbox/threads/{id}`

| #    | What to Check                             | Expected Result                                                                                                                                                                                                                                                                                                                                                                                  | Pass/Fail |
| ---- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 9.1  | Page loads and shows loading state        | While the thread detail is being fetched, a centered loading message from `inbox.loading` appears (`text-sm text-text-secondary`).                                                                                                                                                                                                                                                               |           |
| 9.2  | Thread header                             | A header bar with: (mobile only) a back button -- a circular button (`h-9 w-9 rounded-full`) with **ArrowLeft** icon, `aria-label` from `common.back`, click navigates to `/en/inbox`. On desktop, the back button is hidden (`md:hidden`).                                                                                                                                                      |           |
| 9.3  | Thread subject in header                  | An `<h2>` with the thread subject (or fallback: `inbox.thread.direct_fallback_subject` for direct, `inbox.thread.untitled_subject` for others). Styled `text-sm font-semibold text-text-primary`, truncated.                                                                                                                                                                                     |           |
| 9.4  | Participant count                         | Below the subject, a `<p>` showing `inbox.thread.participants_count` (e.g., "3 participants"). Styled `text-xs text-text-secondary`.                                                                                                                                                                                                                                                             |           |
| 9.5  | Messages area                             | A scrollable container (`flex-1 overflow-y-auto overflow-x-hidden bg-background`) with padding `px-4 py-4`. Messages render inside a `max-w-3xl mx-auto` column.                                                                                                                                                                                                                                 |           |
| 9.6  | Message ordering                          | Messages are displayed in ascending chronological order (oldest first, newest at bottom). The API returns messages in descending order; the component reverses them.                                                                                                                                                                                                                             |           |
| 9.7  | Auto-scroll on first load                 | On first load, the view auto-scrolls to the bottom (newest message) via `bottomSentinelRef.scrollIntoView({ block: 'end' })`.                                                                                                                                                                                                                                                                    |           |
| 9.8  | Auto-scroll on new message (if at bottom) | If the user is near the bottom (within 80px threshold) when a new message arrives via polling, the view auto-scrolls to show the new message. If the user has scrolled up, auto-scroll does not trigger.                                                                                                                                                                                         |           |
| 9.9  | Own messages alignment                    | Messages sent by the teacher are aligned to the end (right in LTR): `justify-end`, bubble color `bg-primary text-white`.                                                                                                                                                                                                                                                                         |           |
| 9.10 | Others' messages alignment                | Messages from other users are aligned to the start (left in LTR): `justify-start`, bubble color `bg-surface-secondary text-text-primary`.                                                                                                                                                                                                                                                        |           |
| 9.11 | Sender name label (group/broadcast)       | In group and broadcast conversations, when the sender changes from the previous message, a sender label appears above the bubble: `text-xs font-medium text-text-secondary`. The label shows the sender's display name (from `senderLabel` prop). Own messages do NOT show this label.                                                                                                           |           |
| 9.12 | Sender name label (direct)                | In direct conversations, sender labels are NEVER shown (since there are only two participants). The `showSenderMeta` check includes `detail.kind !== 'direct'`.                                                                                                                                                                                                                                  |           |
| 9.13 | Message bubble styling                    | Each bubble has `rounded-2xl px-3 py-2 text-sm break-words`. Body text is inside a `whitespace-pre-wrap` div.                                                                                                                                                                                                                                                                                    |           |
| 9.14 | URL detection in messages                 | URLs (`https?://...`) in message body are rendered as clickable `<a>` links with `target="_blank" rel="noopener noreferrer"` and `underline break-all` styling.                                                                                                                                                                                                                                  |           |
| 9.15 | Line break preservation                   | Line breaks in the message body are preserved as `<br>` elements.                                                                                                                                                                                                                                                                                                                                |           |
| 9.16 | Timestamp below each message              | Each message shows a timestamp in `text-[11px] text-text-tertiary`, formatted as HH:mm in the current locale. Own messages show timestamp on the end side; others' on the start side.                                                                                                                                                                                                            |           |
| 9.17 | Edited indicator                          | If `message.edited_at` is not null, an "(edited)" label from `inbox.message.edited` appears next to the timestamp.                                                                                                                                                                                                                                                                               |           |
| 9.18 | Deleted message (non-staff view)          | For deleted messages where `body === '[message deleted]'`, a centered italic text from `inbox.message.deleted` renders instead of a bubble: `text-xs italic text-text-tertiary`.                                                                                                                                                                                                                 |           |
| 9.19 | Deleted message (staff view)              | Staff roles (including teachers) can see the original body of deleted messages. If the teacher can see original body, the message renders normally but may show an edited/deleted indicator. (Behavior depends on whether `deleted_at !== null` AND `body !== '[message deleted]'` -- in that case the full message renders since the check is specifically for `body === '[message deleted]'`.) |           |
| 9.20 | Attachment display on messages            | Messages with attachments show them below the body in a `mt-2` area. Each attachment row has: **Paperclip** icon, filename (truncated), size (formatted), **Download** icon. Styled with `rounded-md px-2 py-1 text-xs`. Own messages: `bg-white/10`. Others: `bg-surface`.                                                                                                                      |           |
| 9.21 | Polling interval                          | The thread view polls for updates every 30 seconds (`POLL_MS = 30_000`). The `fetchThread` callback is called on an interval.                                                                                                                                                                                                                                                                    |           |
| 9.22 | Mark as read                              | Opening the thread triggers a `GET /api/v1/inbox/conversations/:id` which implicitly marks it as read on the server. After the first successful load, `refreshPolling()` is called to update the morph bar unread badge.                                                                                                                                                                         |           |
| 9.23 | Error state (thread load failed)          | If the thread fails to load and `detail` is null, a centered error message from `inbox.errors.load_thread` appears.                                                                                                                                                                                                                                                                              |           |

---

## 10. Thread View -- Reply Composer

| #    | What to Check                              | Expected Result                                                                                                                                                                            | Pass/Fail |
| ---- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 10.1 | Composer area location                     | At the bottom of the thread view, a sticky footer with `border-t border-border bg-surface p-3`.                                                                                            |           |
| 10.2 | Textarea input                             | A `<Textarea>` with `rows={2}`, `min-h-[44px]`, `text-base md:text-sm`, resize-none. Placeholder from `inbox.thread.composer.placeholder`. `aria-label` matches the placeholder.           |           |
| 10.3 | Send button                                | A square icon button (`size="icon"`) with **Send** icon. Disabled when `canReply` is false, `sending` is true, or `composerValue.trim().length === 0`.                                     |           |
| 10.4 | Send button `aria-label`                   | Has `aria-label` from `inbox.thread.composer.send`.                                                                                                                                        |           |
| 10.5 | Type a message and click Send              | `POST /api/v1/inbox/conversations/{id}/messages` fires with `{ body: "...", attachments: [], extra_channels: [] }`. On success: textarea clears, thread re-fetches, polling refreshes.     |           |
| 10.6 | Keyboard shortcut: Cmd+Enter or Ctrl+Enter | Pressing `metaKey + Enter` or `ctrlKey + Enter` in the textarea triggers send. `e.preventDefault()` is called.                                                                             |           |
| 10.7 | Error on send                              | If the API call fails, the error is logged to console as `[thread-view:send]`. The textarea retains its content so the user can retry. No toast is shown (the error is silent to console). |           |
| 10.8 | Disabled during send                       | While `sending` is true, the textarea and send button are both disabled.                                                                                                                   |           |

---

## 11. Thread View -- Frozen Conversation

| #    | What to Check                    | Expected Result                                                                                                                                                                                                                    | Pass/Fail |
| ---- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1 | Frozen banner visibility         | When `detail.frozen_at` is not null, an amber warning banner appears between the thread header and the message area.                                                                                                               |           |
| 11.2 | Frozen banner content            | The banner has a **Lock** icon, a bold title from `inbox.thread.frozen.title`, and a description showing `detail.freeze_reason` or fallback from `inbox.thread.frozen.banner`.                                                     |           |
| 11.3 | Frozen banner styling            | `role="status"`, background `bg-amber-50`, border `border-b border-amber-300`, text `text-amber-900`. Icon is `h-4 w-4 mt-0.5`.                                                                                                    |           |
| 11.4 | Reply composer disabled (frozen) | When frozen, the composer area shows a dashed-border disabled state: `border-dashed border-border px-3 py-6 text-center text-xs text-text-secondary`. The disabled reason text comes from `inbox.thread.composer.disabled.frozen`. |           |
| 11.5 | Tooltip on disabled composer     | The disabled composer is wrapped in a `Tooltip` that shows the same disabled reason text on hover.                                                                                                                                 |           |
| 11.6 | No textarea or send button       | When the composer is in disabled state, the textarea and send button do not render. Only the disabled message is shown.                                                                                                            |           |

---

## 12. Thread View -- Broadcast with No Replies

| #    | What to Check                                | Expected Result                                                                                                                                                     | Pass/Fail |
| ---- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | Broadcast with `allow_replies = false`       | When the thread `kind === 'broadcast'` and `allow_replies !== true`, the `allowReplies` computed value is `false`, and `canReply` is false.                         |           |
| 12.2 | Reply composer disabled (no replies)         | The composer area shows the dashed-border disabled state with reason text from `inbox.thread.composer.disabled.no_reply`.                                           |           |
| 12.3 | Broadcast with `allow_replies = true`        | When the broadcast has `allow_replies = true`, the composer is enabled (assuming the conversation is not also frozen). The teacher can reply.                       |           |
| 12.4 | Frozen broadcast with `allow_replies = true` | The frozen check takes precedence. If the conversation is frozen, the composer is disabled regardless of `allow_replies`. The reason text shows the frozen message. |           |

---

## 13. Thread View -- Read Receipts (Staff Feature)

| #    | What to Check                       | Expected Result                                                                                                                                                                                                                  | Pass/Fail |
| ---- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1 | Read receipt on own messages        | For messages sent by the teacher (`isOwn === true`), if `message.read_state` is not null, a clickable "Read by X/Y" label appears below the message bubble. Text from `inbox.thread.read_by` with `read` and `total` params.     |           |
| 13.2 | Read receipt popover                | Clicking the "Read by" label opens a `Popover` with a title from `inbox.thread.read_by_popover_title` and the same "Read by X/Y" text. Popover width `w-64`, padding `p-3`, font `text-xs`.                                      |           |
| 13.3 | Read receipt styling                | The read receipt is a `<button>` with `cursor-pointer underline-offset-2 hover:underline`, positioned in the timestamp row. For own messages, the row uses `flex-row-reverse` so timestamps and receipts appear on the end side. |           |
| 13.4 | No read receipt on others' messages | For messages from other users (`isOwn === false`), the read receipt is never shown, regardless of `read_state` presence.                                                                                                         |           |

---

## 14. Message Edit & Delete

Teachers have `inbox.send` permission which covers editing and deleting own messages.

| #    | What to Check                        | Expected Result                                                                                                                                                                                                                                                               | Pass/Fail |
| ---- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.1 | Edit own message                     | Triggering edit on an own message (via context menu or UI affordance if present) calls `PATCH /api/v1/inbox/messages/{id}` with `{ body: "new text" }`. The message body updates in the thread view. The `edited_at` field becomes non-null and "(edited)" indicator appears. |           |
| 14.2 | Edit window enforcement              | Messages can only be edited within the edit window (default 10 minutes from creation). Attempting to edit after the window returns a 403 or 400 from the API.                                                                                                                 |           |
| 14.3 | Edit only own messages               | The API rejects edits to messages not owned by the current user. Only the `sender_user_id` matching the teacher's user ID will succeed.                                                                                                                                       |           |
| 14.4 | Delete own message                   | Triggering delete on an own message calls `DELETE /api/v1/inbox/messages/{id}`. The message body is soft-deleted. Other participants see "[message deleted]" text.                                                                                                            |           |
| 14.5 | Delete only own messages             | The API rejects delete requests for messages not owned by the current user.                                                                                                                                                                                                   |           |
| 14.6 | Staff visibility of deleted messages | After deletion, the teacher (as staff) may still see the original message body in the thread. Non-staff participants see the "[message deleted]" placeholder.                                                                                                                 |           |

---

## 15. Inbox Search

**URL:** `/en/inbox/search?q={query}`

| #     | What to Check                 | Expected Result                                                                                                                                                                                                     | Pass/Fail |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.1  | Page heading                  | An `<h1>` reads "Search the inbox" (hardcoded English text).                                                                                                                                                        |           |
| 15.2  | Search form                   | A form with a search input (Search icon at `start-3`, padding `ps-9`, autofocus) and a "Search" button. The button is disabled when the query is less than 2 characters.                                            |           |
| 15.3  | Initial state (no query)      | An `EmptyState` component with Search icon, title "Search the inbox", description "Type at least 2 characters to find messages in your threads."                                                                    |           |
| 15.4  | Query with < 2 characters     | Data is cleared. The empty state shows. The API is not called.                                                                                                                                                      |           |
| 15.5  | Loading state                 | While searching, a **Loader2** spinner with "Searching..." text appears (`text-sm text-text-tertiary`).                                                                                                             |           |
| 15.6  | Error state                   | If the search API fails, a destructive-styled error box appears (`border-destructive/40 bg-destructive/5 text-destructive`) with the error message.                                                                 |           |
| 15.7  | No results                    | An `EmptyState` with Search icon, title "No results", description "No messages found for '{query}'. Try fewer or different words."                                                                                  |           |
| 15.8  | Results display               | A count line (`text-xs text-text-tertiary`) shows "N result(s)". Results render as a `<ul>` of linked cards (`<Link href="/inbox/threads/{conversation_id}">`).                                                     |           |
| 15.9  | Result card content           | Each card shows: conversation subject (or kind label: "Direct message" / "Group conversation" / "Broadcast"), relative timestamp, sender display name, and body snippet with `<mark>` tag highlighting (sanitised). |           |
| 15.10 | Result card styling           | Each card has `rounded-lg border border-border bg-surface p-3 hover:bg-background/60`.                                                                                                                              |           |
| 15.11 | Snippet highlighting          | The body_snippet contains `<mark>` tags from the server. The `sanitiseSnippet` function strips all HTML except `<mark>`. The snippet is rendered via `dangerouslySetInnerHTML`.                                     |           |
| 15.12 | Click a result                | Navigates to `/inbox/threads/{conversation_id}`. The thread detail page loads.                                                                                                                                      |           |
| 15.13 | Pagination                    | If `totalPages > 1`, Previous/Next ghost buttons appear with "Page X of Y" text. Previous is disabled on page 1. Next is disabled on the last page.                                                                 |           |
| 15.14 | Scope enforcement             | The search API (`GET /api/v1/inbox/search`) uses `scope='user'`, meaning it only searches the teacher's own threads. The teacher cannot search conversations they are not a participant in.                         |           |
| 15.15 | New search submission         | Typing a new query and pressing Enter or clicking Search resets to page 1 and performs a new search.                                                                                                                |           |
| 15.16 | Relative timestamp formatting | "just now" for < 1 minute, "Nm" for minutes, "Nh" for hours, "Nd" for days (< 7), locale date string for older.                                                                                                     |           |

---

## 16. Mute & Archive

| #    | What to Check                                | Expected Result                                                                                                                                                              | Pass/Fail |
| ---- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1 | Mute a conversation                          | Triggering mute (via thread context menu or UI affordance) calls `PATCH /api/v1/inbox/conversations/{id}/mute` with `{ muted: true }`. The conversation's `muted_at` is set. |           |
| 16.2 | Unmute a conversation                        | Calling `PATCH /api/v1/inbox/conversations/{id}/mute` with `{ muted: false }`. The `muted_at` is cleared.                                                                    |           |
| 16.3 | Muted thread behavior                        | A muted thread no longer triggers push/email/sms notifications for the teacher. It still appears in the inbox thread list.                                                   |           |
| 16.4 | Archive a conversation                       | Triggering archive calls `PATCH /api/v1/inbox/conversations/{id}/archive` with `{ archived: true }`. The conversation's `archived_at` is set.                                |           |
| 16.5 | Archived thread disappears from default list | After archiving, the thread no longer appears in the default "All" filter. It appears when the "Archived" filter chip is active.                                             |           |
| 16.6 | Unarchive a conversation                     | From the Archived filter, triggering unarchive calls `PATCH /api/v1/inbox/conversations/{id}/archive` with `{ archived: false }`. The thread returns to the main list.       |           |
| 16.7 | Permission                                   | Both mute and archive operations require `inbox.read` permission, which the teacher has. These should succeed.                                                               |           |

---

## 17. Profile Communication Preferences

**URL:** `/en/profile/communication`

| #     | What to Check                | Expected Result                                                                                                                                                                                                                       | Pass/Fail |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.1  | Navigation                   | The teacher can navigate to `/en/profile/communication` (via profile menu or direct URL).                                                                                                                                             |           |
| 17.2  | Page heading                 | An `<h1>` with text from `communication.title` (e.g., "Communication Preferences"). Styled `text-2xl font-semibold tracking-tight text-text-primary`.                                                                                 |           |
| 17.3  | Loading state                | On mount, a loading text from `common.loading` appears while preferences are fetched via `GET /api/v1/me/preferences`.                                                                                                                |           |
| 17.4  | Section heading              | After load, a card (`rounded-2xl border bg-surface p-6`) contains a heading from `communication.channels` and description from `communication.description`.                                                                           |           |
| 17.5  | Email checkbox               | A `<Checkbox>` with `id="comm-email"`, label from `communication.email`, description from `communication.emailDescription`. Default: checked (true).                                                                                  |           |
| 17.6  | SMS checkbox                 | A `<Checkbox>` with `id="comm-sms"`, label from `communication.sms`, description from `communication.smsDescription`. Default: unchecked (false).                                                                                     |           |
| 17.7  | Push checkbox                | A `<Checkbox>` with `id="comm-push"`, label from `communication.push`, description from `communication.pushDescription`. Default: unchecked (false).                                                                                  |           |
| 17.8  | Toggle checkboxes            | Clicking each checkbox toggles its boolean value. The state updates immediately in the UI. No API call is made until Save is clicked.                                                                                                 |           |
| 17.9  | Preferred language selector  | Below the checkboxes, separated by a `border-t`, a `<Label>` for `communication.preferredLanguage` and a `<Select>` with width `w-48`. Options: "English" (`en`) from `profile.localeEn` and "Arabic" (`ar`) from `profile.localeAr`. |           |
| 17.10 | Save button                  | A primary `<Button>` at the end of the card with text from `communication.save` (or `communication.saving` while saving). Positioned via `flex justify-end`.                                                                          |           |
| 17.11 | Click Save                   | Calls `PATCH /api/v1/me/preferences` with `{ communication: { email, sms, push, preferred_language } }`.                                                                                                                              |           |
| 17.12 | Save success                 | A success message appears with `text-sm text-success-text` showing text from `communication.saveSuccess`.                                                                                                                             |           |
| 17.13 | Save error                   | An error message appears with `text-sm text-danger-text` showing text from `communication.saveError`. The error is logged to console as `[ProfileCommunicationPage]`.                                                                 |           |
| 17.14 | Button disabled while saving | During the save API call, the Save button is disabled (`disabled={saving}`).                                                                                                                                                          |           |
| 17.15 | Preferences persist          | Reload the page. The previously saved values load correctly from `GET /api/v1/me/preferences`. The checkboxes and language select reflect the saved state.                                                                            |           |

---

## 18. Inbox Polling & Real-time Badge

| #    | What to Check                          | Expected Result                                                                                                                                                                         | Pass/Fail |
| ---- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 18.1 | Inbox state polling                    | The app-shell-level `InboxPollingProvider` periodically calls `GET /api/v1/inbox/state` to fetch `{ unread_total, latest_message_at }`.                                                 |           |
| 18.2 | Morph bar unread badge                 | If `unread_total > 0`, an unread badge appears on the Inbox icon in the morph bar.                                                                                                      |           |
| 18.3 | Thread list re-fetch on polling signal | When `latest_message_at` changes (new message received), the inbox sidebar re-fetches the thread list. The `latestSignal` dependency in the thread-list `useEffect` triggers a refresh. |           |
| 18.4 | Badge clears after reading             | After opening a thread (which marks it read), `refreshPolling()` is called, which triggers a fresh `GET /api/v1/inbox/state`. The badge count decrements.                               |           |
| 18.5 | Mark all read                          | Calling `POST /api/v1/inbox/conversations/read-all` marks all conversations as read. The unread badge should clear to 0 after the next polling cycle.                                   |           |

---

## 19. Cross-Account Messaging Flow (Admin -> Teacher)

**Prerequisite:** Log out as Sarah Daly. Log in as **Yusuf Rahman** (admin).

| #    | What to Check                               | Expected Result                                                                                                                                                         | Pass/Fail |
| ---- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 19.1 | Admin composes direct message to Sarah Daly | As Yusuf (admin), open Compose, Direct tab. Search for "Sarah Daly" in PeoplePicker. She appears in results. Select her, type a message, Send.                          |           |
| 19.2 | Message sends successfully                  | The conversation is created. Yusuf is redirected to the new thread.                                                                                                     |           |
| 19.3 | Log out as admin, log back in as Sarah Daly | Navigate to `/en/inbox`.                                                                                                                                                |           |
| 19.4 | New message appears in Sarah's inbox        | The thread from Yusuf appears in the thread list. It shows as unread (bold subject, blue dot, unread count badge). The preview body shows the message text.             |           |
| 19.5 | Open the thread                             | Click the thread. The message from Yusuf appears with the correct body, timestamp, and sender alignment (start side, surface-secondary bubble).                         |           |
| 19.6 | Reply to admin                              | Type a reply in the composer, press Send (or Cmd+Enter). The reply posts successfully. The new message appears at the bottom with primary-colored bubble (own message). |           |
| 19.7 | Admin sends broadcast to "All staff"        | Log out, log in as Yusuf. Compose > Broadcast > Quick: "All staff". Type message. Send.                                                                                 |           |
| 19.8 | Teacher sees the broadcast                  | Log back in as Sarah. The broadcast appears in her inbox. The thread list item shows a **Megaphone** icon. Opening the thread shows the broadcast.                      |           |
| 19.9 | Reply behavior on broadcast                 | If `allow_replies = false`, the composer shows the disabled "no reply" message. If `allow_replies = true`, Sarah can reply.                                             |           |

---

## 20. Cross-Account Messaging Flow (Teacher -> Parent)

**Prerequisite:** Logged in as Sarah Daly (teacher).

| #    | What to Check                                            | Expected Result                                                                                                                                     | Pass/Fail |
| ---- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.1 | Teacher composes direct message to a parent within scope | Open Compose > Direct. Search for a parent whose child is in Sarah's class. The parent appears in PeoplePicker results. Select, type message, Send. |           |
| 20.2 | Message sends successfully                               | A new direct conversation is created. Sarah is redirected to the thread.                                                                            |           |
| 20.3 | Log out, log in as the parent                            | The parent sees the message from Sarah in their inbox. They can read it and reply.                                                                  |           |
| 20.4 | Parent reply visible to teacher                          | Log back in as Sarah. The parent's reply appears in the thread.                                                                                     |           |

---

## 21. Relational Scope Enforcement

| #    | What to Check                                          | Expected Result                                                                                                                                                                                          | Pass/Fail |
| ---- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 21.1 | PeoplePicker scope -- teacher to teacher               | Search for another teacher's name. They appear in results. Teachers can always message other teachers.                                                                                                   |           |
| 21.2 | PeoplePicker scope -- teacher to admin                 | Search for an admin (e.g., Yusuf Rahman). They appear in results. Teachers can always message admin-tier staff.                                                                                          |           |
| 21.3 | PeoplePicker scope -- teacher to parent (in-scope)     | Search for a parent of a student in Sarah's classes. The parent appears in results.                                                                                                                      |           |
| 21.4 | PeoplePicker scope -- teacher to parent (out-of-scope) | Search for a parent of a student NOT in Sarah's classes. The parent does NOT appear in PeoplePicker results. The server-side relational scope filter excludes them.                                      |           |
| 21.5 | API enforcement -- message out-of-scope parent         | If somehow the teacher constructs a direct message to an out-of-scope parent (e.g., via API tooling), `POST /api/v1/inbox/conversations` returns a **403** with reason code `RELATIONAL_SCOPE_VIOLATED`. |           |
| 21.6 | Teacher to office/finance/nurse staff                  | Search for office, finance, or nurse staff. They appear in results. Teachers can always message these roles.                                                                                             |           |
| 21.7 | Teacher to student                                     | Students rarely have user accounts. If a student in Sarah's class has an account, they should appear. Students NOT in Sarah's classes should not appear.                                                 |           |
| 21.8 | Scope applies to group conversations too               | When adding participants to a group conversation, the PeoplePicker only returns in-scope users. Out-of-scope users cannot be added.                                                                      |           |

---

## 22. Frozen Conversation Behavior (Admin-Initiated)

**Setup:** An admin freezes a conversation that the teacher is a participant in.

| #    | What to Check                    | Expected Result                                                                                                                         | Pass/Fail |
| ---- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 22.1 | Admin freezes conversation       | As admin, freeze a conversation the teacher is in (via oversight or thread actions). The `frozen_at` and `freeze_reason` are set.       |           |
| 22.2 | Teacher sees frozen state        | Log in as Sarah. Open the frozen thread. The amber frozen banner appears with the Lock icon, title, and reason.                         |           |
| 22.3 | Reply is disabled                | The composer area shows the dashed-border disabled state with `inbox.thread.composer.disabled.frozen` text. No textarea or Send button. |           |
| 22.4 | Thread list frozen indicator     | In the sidebar thread list, the frozen thread shows a Lock icon (`h-3.5 w-3.5 text-text-tertiary`) inline with the subject.             |           |
| 22.5 | Existing messages still readable | All existing messages in the frozen thread are fully readable. Only new replies are blocked.                                            |           |
| 22.6 | Admin unfreezes                  | As admin, unfreeze the conversation. `frozen_at` is cleared.                                                                            |           |
| 22.7 | Teacher can reply again          | Log in as Sarah. Open the previously frozen thread. The frozen banner is gone. The composer is active. Sarah can type and send a reply. |           |

---

## 23. Admin-Only Affordances -- What Teachers Must NOT See

These are negative assertions. The teacher's view must NOT contain any of these elements.

| #     | What to Check                          | Expected Result                                                                                                                                                                    | Pass/Fail |
| ----- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 23.1  | Communications hub dashboard           | The teacher never sees the `/en/communications` hub page with stat cards (Inbox, Audiences, Announcements, Oversight). If they navigate there, they are redirected to `/en/inbox`. |           |
| 23.2  | Stat cards                             | No "Inbox" stat card, no "Audiences" stat card, no "Announcements" stat card, no "Oversight" stat card visible anywhere in the teacher's view.                                     |           |
| 23.3  | Settings tiles                         | No "Messaging Policy", "Safeguarding Keywords", or "Notification Fallback" settings tiles are visible.                                                                             |           |
| 23.4  | "Manage Audiences" button or link      | No button or link to manage audiences appears in the teacher's inbox or compose dialog.                                                                                            |           |
| 23.5  | "New Announcement" button or link      | No button or link to create announcements is visible.                                                                                                                              |           |
| 23.6  | Oversight banner                       | No oversight-related banner, flag indicator, or audit information appears in the teacher's thread view.                                                                            |           |
| 23.7  | Flags tab                              | No "Flags" tab or section in any thread view.                                                                                                                                      |           |
| 23.8  | Audit tab                              | No "Audit" tab or section in any thread view.                                                                                                                                      |           |
| 23.9  | Audiences sub-strip link               | No "Audiences" navigation link in any sub-strip or sidebar.                                                                                                                        |           |
| 23.10 | Oversight sub-strip link               | No "Oversight" navigation link in any sub-strip or sidebar.                                                                                                                        |           |
| 23.11 | Announcements management link          | No "Announcements" management link (distinct from viewing received broadcast announcements).                                                                                       |           |
| 23.12 | Inquiries link                         | No "Inquiries" link visible in any navigation.                                                                                                                                     |           |
| 23.13 | Settings navigation for communications | No settings links for messaging policy, safeguarding, fallback, or notifications in the teacher's accessible navigation.                                                           |           |
| 23.14 | Freeze/Unfreeze controls               | The teacher does not see freeze/unfreeze buttons on conversations. Only the admin oversight view has these controls.                                                               |           |
| 23.15 | Flag review modal                      | The teacher does not see any flag review modals or flag action buttons.                                                                                                            |           |

---

## 24. Route Blocking -- Negative Assertions

Navigate to each of these URLs directly (paste into address bar) while logged in as Sarah Daly (teacher).

| #     | Route                                      | Expected Result                                                                                                                                                                                                                                                 | Pass/Fail |
| ----- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 24.1  | `/en/communications`                       | Redirects to `/en/inbox`. The `useIsAdmin()` check returns false, triggering `router.replace`. The teacher never sees the hub content.                                                                                                                          |           |
| 24.2  | `/en/inbox/audiences`                      | Redirects to `/en/inbox` (or renders without the sidebar shell, depending on layout logic -- the `inSidebarShell` check excludes audience routes). The page checks `useIsAdmin()` and redirects non-admins.                                                     |           |
| 24.3  | `/en/inbox/audiences/new`                  | Redirects to `/en/inbox`.                                                                                                                                                                                                                                       |           |
| 24.4  | `/en/inbox/audiences/{any-uuid}`           | Redirects to `/en/inbox`.                                                                                                                                                                                                                                       |           |
| 24.5  | `/en/inbox/oversight`                      | Redirects to `/en/inbox`. The oversight page checks admin permission and redirects.                                                                                                                                                                             |           |
| 24.6  | `/en/inbox/oversight/threads/{any-uuid}`   | Redirects to `/en/inbox`.                                                                                                                                                                                                                                       |           |
| 24.7  | `/en/communications/announcements`         | Redirects to `/en/inbox` or `/en/communications` which itself redirects to `/en/inbox`. The teacher ends up at the inbox.                                                                                                                                       |           |
| 24.8  | `/en/communications/new`                   | Redirects. Teacher ends up at inbox.                                                                                                                                                                                                                            |           |
| 24.9  | `/en/communications/{any-uuid}`            | Redirects. Teacher ends up at inbox.                                                                                                                                                                                                                            |           |
| 24.10 | `/en/communications/inquiries`             | Redirects. Teacher ends up at inbox.                                                                                                                                                                                                                            |           |
| 24.11 | `/en/communications/inquiries/{any-uuid}`  | Redirects. Teacher ends up at inbox.                                                                                                                                                                                                                            |           |
| 24.12 | `/en/settings/messaging-policy`            | Redirects or shows 403 page. Teacher cannot access messaging policy settings.                                                                                                                                                                                   |           |
| 24.13 | `/en/settings/communications/safeguarding` | Redirects or shows 403 page. Teacher cannot access safeguarding keyword settings.                                                                                                                                                                               |           |
| 24.14 | `/en/settings/communications/fallback`     | Redirects or shows 403 page. Teacher cannot access fallback settings.                                                                                                                                                                                           |           |
| 24.15 | `/en/settings/notifications`               | Redirects or shows 403 page. Teacher cannot access notification settings.                                                                                                                                                                                       |           |
| 24.16 | No flash of admin content                  | During any redirect, the teacher must NOT see a brief flash of admin-only content (stat cards, settings tiles, oversight data). The communications hub renders an empty `<div className="h-[50vh]">` while the role check is pending, preventing content flash. |           |

---

## 25. API Permission Enforcement -- 403 Paths

These tests verify that the backend correctly denies access to endpoints the teacher lacks permissions for. Use the browser Network tab or API tooling to confirm 403 responses.

### 25.1 Oversight Endpoints (require `inbox.oversight.*`)

| #      | Method | Endpoint                               | Expected      | Pass/Fail |
| ------ | ------ | -------------------------------------- | ------------- | --------- |
| 25.1.1 | GET    | `/api/v1/inbox/oversight/flags`        | 403 Forbidden |           |
| 25.1.2 | GET    | `/api/v1/inbox/oversight/flags/{id}`   | 403 Forbidden |           |
| 25.1.3 | PATCH  | `/api/v1/inbox/oversight/flags/{id}`   | 403 Forbidden |           |
| 25.1.4 | POST   | `/api/v1/inbox/oversight/freeze`       | 403 Forbidden |           |
| 25.1.5 | POST   | `/api/v1/inbox/oversight/unfreeze`     | 403 Forbidden |           |
| 25.1.6 | GET    | `/api/v1/inbox/oversight/threads/{id}` | 403 Forbidden |           |
| 25.1.7 | GET    | `/api/v1/inbox/oversight/audit-log`    | 403 Forbidden |           |

### 25.2 Settings Endpoints (require `inbox.settings.*`)

| #      | Method | Endpoint                                       | Expected      | Pass/Fail |
| ------ | ------ | ---------------------------------------------- | ------------- | --------- |
| 25.2.1 | GET    | `/api/v1/inbox/settings/messaging-policy`      | 403 Forbidden |           |
| 25.2.2 | PATCH  | `/api/v1/inbox/settings/messaging-policy`      | 403 Forbidden |           |
| 25.2.3 | GET    | `/api/v1/inbox/settings/safeguarding-keywords` | 403 Forbidden |           |
| 25.2.4 | PATCH  | `/api/v1/inbox/settings/safeguarding-keywords` | 403 Forbidden |           |
| 25.2.5 | GET    | `/api/v1/inbox/settings/fallback`              | 403 Forbidden |           |
| 25.2.6 | PATCH  | `/api/v1/inbox/settings/fallback`              | 403 Forbidden |           |

### 25.3 Announcements (admin) Endpoints (require `communications.view` / `communications.manage`)

| #      | Method | Endpoint                     | Expected      | Pass/Fail |
| ------ | ------ | ---------------------------- | ------------- | --------- |
| 25.3.1 | GET    | `/api/v1/announcements`      | 403 Forbidden |           |
| 25.3.2 | POST   | `/api/v1/announcements`      | 403 Forbidden |           |
| 25.3.3 | GET    | `/api/v1/announcements/{id}` | 403 Forbidden |           |
| 25.3.4 | PATCH  | `/api/v1/announcements/{id}` | 403 Forbidden |           |
| 25.3.5 | DELETE | `/api/v1/announcements/{id}` | 403 Forbidden |           |

### 25.4 Audience Endpoints (API vs UI discrepancy)

Note: The audience API endpoints require `inbox.send` permission, which the teacher HAS. However, the frontend UI redirects teachers away from audience management pages because `useIsAdmin()` returns false. This means:

| #      | Method | Endpoint                          | Expected                                                                                              | Pass/Fail |
| ------ | ------ | --------------------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| 25.4.1 | GET    | `/api/v1/inbox/audiences`         | **200 OK** (teacher has `inbox.send`) -- but the UI never shows this page                             |           |
| 25.4.2 | POST   | `/api/v1/inbox/audiences`         | **200/201 OK** (teacher has `inbox.send`) -- accessible via compose dialog "Save as" audience feature |           |
| 25.4.3 | GET    | `/api/v1/inbox/audiences/{id}`    | **200 OK** -- API allows, UI blocks                                                                   |           |
| 25.4.4 | POST   | `/api/v1/inbox/audiences/preview` | **200 OK** -- used by the custom audience builder in the compose dialog                               |           |

### 25.5 Endpoints That Should Succeed (teacher has `inbox.read` and `inbox.send`)

| #       | Method | Endpoint                                    | Expected                                 | Pass/Fail |
| ------- | ------ | ------------------------------------------- | ---------------------------------------- | --------- |
| 25.5.1  | GET    | `/api/v1/inbox/conversations`               | 200 OK                                   |           |
| 25.5.2  | POST   | `/api/v1/inbox/conversations`               | 201 Created (with valid payload)         |           |
| 25.5.3  | GET    | `/api/v1/inbox/conversations/{id}`          | 200 OK (own conversation)                |           |
| 25.5.4  | POST   | `/api/v1/inbox/conversations/{id}/messages` | 201 Created                              |           |
| 25.5.5  | POST   | `/api/v1/inbox/conversations/{id}/read`     | 200 OK                                   |           |
| 25.5.6  | POST   | `/api/v1/inbox/conversations/read-all`      | 200 OK                                   |           |
| 25.5.7  | PATCH  | `/api/v1/inbox/conversations/{id}/mute`     | 200 OK                                   |           |
| 25.5.8  | PATCH  | `/api/v1/inbox/conversations/{id}/archive`  | 200 OK                                   |           |
| 25.5.9  | GET    | `/api/v1/inbox/state`                       | 200 OK                                   |           |
| 25.5.10 | GET    | `/api/v1/inbox/search?q=test`               | 200 OK                                   |           |
| 25.5.11 | PATCH  | `/api/v1/inbox/messages/{id}`               | 200 OK (own message, within edit window) |           |
| 25.5.12 | DELETE | `/api/v1/inbox/messages/{id}`               | 200 OK (own message)                     |           |
| 25.5.13 | GET    | `/api/v1/inbox/people-search?q=test`        | 200 OK                                   |           |
| 25.5.14 | POST   | `/api/v1/inbox/attachments`                 | 200 OK (multipart file upload)           |           |
| 25.5.15 | GET    | `/api/v1/notifications`                     | 200 OK                                   |           |
| 25.5.16 | GET    | `/api/v1/notifications/unread-count`        | 200 OK                                   |           |
| 25.5.17 | PATCH  | `/api/v1/notifications/{id}/read`           | 200 OK                                   |           |
| 25.5.18 | POST   | `/api/v1/notifications/mark-all-read`       | 200 OK                                   |           |
| 25.5.19 | GET    | `/api/v1/me/preferences`                    | 200 OK                                   |           |
| 25.5.20 | PATCH  | `/api/v1/me/preferences`                    | 200 OK                                   |           |

---

## 26. Arabic / RTL

**Setup:** Switch to Arabic locale (`/ar/inbox`).

| #     | What to Check                       | Expected Result                                                                                                                                                                                                                                                                       | Pass/Fail |
| ----- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 26.1  | Page direction                      | The `<html>` element has `dir="rtl"` and `lang="ar"`.                                                                                                                                                                                                                                 |           |
| 26.2  | Inbox sidebar position              | The sidebar renders on the right side (start side in RTL). The border is on the left/end side (`border-e` renders as `border-left` in RTL).                                                                                                                                           |           |
| 26.3  | Thread list items layout            | The kind icon circle is on the right (start), text flows right-to-left, timestamp is on the left (end). The unread dot is at `start-1.5` (right side in RTL).                                                                                                                         |           |
| 26.4  | Compose dialog alignment            | Dialog text and inputs are right-aligned. Labels are on the right. The tab bar tabs flow right-to-left.                                                                                                                                                                               |           |
| 26.5  | PeoplePicker search icon            | The search icon is at `start-2.5` (right side in RTL). Input padding is `ps-9` (padding-inline-start).                                                                                                                                                                                |           |
| 26.6  | Message alignment in thread         | Own messages (teacher) align to the end (left in RTL). Others' messages align to the start (right in RTL). The `flex-row-reverse` on own message timestamps reverses correctly.                                                                                                       |           |
| 26.7  | Filter chips order                  | Chips render in the same logical order but flow right-to-left due to RTL direction.                                                                                                                                                                                                   |           |
| 26.8  | Back button in thread view (mobile) | The **ArrowLeft** icon renders pointing right in RTL (via CSS `transform` or logical property). Actually, the icon itself does not auto-flip -- verify if `rtl:rotate-180` is applied or if the icon needs manual flipping.                                                           |           |
| 26.9  | Frozen banner layout                | The Lock icon and text flow right-to-left. The icon is on the right.                                                                                                                                                                                                                  |           |
| 26.10 | Channel selector chips              | Channel chips flow right-to-left. The checkmark icon position is correct.                                                                                                                                                                                                             |           |
| 26.11 | Attachment uploader                 | The UploadCloud icon is on the right. The "Add Files" button is on the left (end). File list items flow RTL.                                                                                                                                                                          |           |
| 26.12 | Profile communication page          | Checkboxes are on the right side of their labels. The Select dropdown aligns correctly. The Save button is positioned at the end (left in RTL).                                                                                                                                       |           |
| 26.13 | Western numerals                    | All numbers (unread counts, timestamps, file sizes, page counts, participant counts) use Western numerals (0-9), NOT Arabic-Indic numerals, in both locales.                                                                                                                          |           |
| 26.14 | Gregorian calendar                  | All dates use the Gregorian calendar, not Hijri, in both locales.                                                                                                                                                                                                                     |           |
| 26.15 | LTR enforcement on specific content | Email addresses, URLs in messages, phone numbers, and numeric inputs render with LTR direction override where needed.                                                                                                                                                                 |           |
| 26.16 | No physical directional classes     | Inspect the rendered HTML. Verify that no `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l-`, `rounded-r-`, `border-l-`, `border-r-` classes are present. Only logical equivalents (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`) should be used. |           |
| 26.17 | Search results page RTL             | The search form, results list, and pagination all render correctly in RTL. The Search icon is on the start (right) side.                                                                                                                                                              |           |
| 26.18 | Translation completeness            | All visible text on the inbox pages uses translation keys. No hardcoded English strings appear in the Arabic locale (exception: the search page has some hardcoded English strings like "Search the inbox" -- note this as a potential i18n gap).                                     |           |
| 26.19 | Tooltip and Popover alignment       | Tooltips (disable-fallback hint, frozen composer) and Popovers (read receipts) render with correct alignment in RTL.                                                                                                                                                                  |           |
| 26.20 | Selected thread accent bar          | The 3px accent bar (`before:bg-primary-600`) appears on the `start` side (right in RTL) via `before:start-0`.                                                                                                                                                                         |           |

---

## 27. Data Invariants (run after each major flow)

Click-then-check-UI is blind to silent data corruption. The following SQL queries (or API read-calls if DB access isn't available) are executed after the teacher flows and recorded Pass/Fail alongside the UI rows.

> **Setup:** `SET app.current_tenant_id = '<nhqs_tenant_uuid>';` first so RLS applies.

### 27.1 Conversation and participant invariants (teacher-initiated)

| #      | What to assert                                                                                                                          | Expected query result                                                                                                                   | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 27.1.1 | After Sarah composes a direct message to parent Zainab: conversation row exists, `kind='direct'`, Sarah is `created_by_user_id`         | `SELECT id FROM conversations WHERE created_by_user_id = '<sarah>' AND kind = 'direct' ORDER BY created_at DESC LIMIT 1` matches new_id |           |
| 27.1.2 | Two participant rows: Sarah (unread 0) + Zainab (unread 1)                                                                              | Rows present with correct `unread_count` per user                                                                                       |           |
| 27.1.3 | Sarah's `role_at_join = 'teacher'`; Zainab's = `'parent'`                                                                               | `SELECT user_id, role_at_join FROM conversation_participants WHERE conversation_id = '<id>'` matches                                    |           |
| 27.1.4 | After Sarah composes a direct message to an out-of-scope parent (child not in Sarah's class): request rejected, no conversation created | `POST /v1/inbox/conversations` → 403 `RELATIONAL_SCOPE_DENIED`; no row in `conversations` authored by Sarah targeting that parent       |           |
| 27.1.5 | Group conversation Sarah initiates: exactly N+1 `conversation_participants` rows                                                        | Count matches                                                                                                                           |           |
| 27.1.6 | Broadcast by Sarah is rejected: `BROADCAST_NOT_ALLOWED_FOR_ROLE` (teachers cannot send broadcasts)                                      | UI error toast + 403 from API                                                                                                           |           |

### 27.2 Message lifecycle invariants

| #      | What to assert                                                                                                             | Expected query result                                                                      | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| 27.2.1 | After Sarah sends a reply: `conversations.last_message_at = messages.created_at` (± 1s)                                    | Equal                                                                                      |           |
| 27.2.2 | Sarah's `unread_count` stays at 0 after her own send; other participants increment by 1                                    | Per-participant `unread_count` as expected                                                 |           |
| 27.2.3 | Sarah edits her own message within `edit_window_minutes` (default 10): `message_edits` row added, `messages.edited_at` set | Row present + column set                                                                   |           |
| 27.2.4 | Sarah tries to edit > 10 min after send: 409 `EDIT_WINDOW_EXPIRED`                                                         | UI shows error; no DB mutation                                                             |           |
| 27.2.5 | Sarah tries to edit another user's message: 403 `EDIT_NOT_OWN_MESSAGE`                                                     | UI hides edit control; API returns 403                                                     |           |
| 27.2.6 | Sarah deletes her own message: `messages.deleted_at` set; UI renders `[message deleted]`, original body retained in DB     | `SELECT deleted_at, body FROM messages WHERE id = '<id>'` → deleted_at set, body unchanged |           |

### 27.3 Read receipts & unread counters

| #      | What to assert                                                                                            | Expected query result                                                                                                 | Pass/Fail |
| ------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------- |
| 27.3.1 | Opening a thread marks all unread messages as read for Sarah: `message_reads` row per unread message      | `SELECT COUNT(*) FROM message_reads WHERE user_id = '<sarah>' AND message_id IN (<unread_msg_ids>)` = count_of_unread |           |
| 27.3.2 | `conversation_participants.unread_count = 0` and `last_read_at` updated after mark-read                   | Row state matches                                                                                                     |           |
| 27.3.3 | Read receipts: Sarah CAN see other participants' `read_state` (staff-only feature); parent/student cannot | UI shows read receipts chip; matches `message_reads` rows                                                             |           |

### 27.4 Frozen-conversation behaviour

| #      | What to assert                                                                         | Expected query result                       | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------- | ------------------------------------------- | --------- |
| 27.4.1 | When conversation is frozen by admin: Sarah's send attempt → 409 `CONVERSATION_FROZEN` | UI composer disabled, API returns 409       |           |
| 27.4.2 | Sarah can still READ the frozen thread — past messages remain visible                  | UI lists messages; API returns full history |           |
| 27.4.3 | Sarah sees freeze banner with `freeze_reason` and `frozen_at` timestamp                | Banner renders reason                       |           |

### 27.5 Tenant isolation (cross-tenant hostile checks)

| #      | What to assert                                                                  | Expected query result                                                                                                                                                                               | Pass/Fail |
| ------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 27.5.1 | Sarah's people-search never returns `test-b` users                              | `GET /v1/inbox/people-search?q=<test-b_name>` → empty results                                                                                                                                       |           |
| 27.5.2 | Sarah's inbox listing never returns conversations with `tenant_id = '<test-b>'` | `GET /v1/inbox/conversations` as Sarah → every row's `id` resolves via `GET /v1/inbox/conversations/:id` to a thread whose participants are all in the nhqs tenant. No direct-DB cross-tenant scan. |           |
| 27.5.3 | Direct URL hit on test-b conversation ID → 404, UI redirects to `/inbox`        | UI + API both 404                                                                                                                                                                                   |           |

### 27.6 Relational scope (policy engine)

| #      | What to assert                                                                             | Expected query result             | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------ | --------------------------------- | --------- |
| 27.6.1 | Sarah can message parents of students in her classes (2A, 3B)                              | Conversation created successfully |           |
| 27.6.2 | Sarah cannot message parents of students NOT in her classes: 403 `RELATIONAL_SCOPE_DENIED` | API denies, UI toast error        |           |
| 27.6.3 | Sarah cannot message students in classes she does not teach: 403 `RELATIONAL_SCOPE_DENIED` | API denies                        |           |
| 27.6.4 | Sarah can message other teachers (teacher→teacher allowed per default policy)              | Conversation created              |           |

### 27.7 Hostile-pair execution log

| #      | Assertion                                                  | Observed Result | Pass/Fail |
| ------ | ---------------------------------------------------------- | --------------- | --------- |
| 27.7.1 | Direct URL to test-b conversation as Sarah                 |                 |           |
| 27.7.2 | `GET /api/v1/inbox/conversations/{test-b_id}` as Sarah     |                 |           |
| 27.7.3 | `GET /api/v1/inbox/people-search?q=<test-b_user>` as Sarah |                 |           |
| 27.7.4 | Navigate to `/en/communications` as Sarah                  |                 |           |
| 27.7.5 | Navigate to `/en/inbox/oversight` as Sarah                 |                 |           |
| 27.7.6 | Navigate to `/en/inbox/audiences` as Sarah                 |                 |           |

---

## 28. Backend Endpoint Map

Reference table of all API endpoints relevant to the teacher role, with their required permissions.

### 27.1 Endpoints the Teacher CAN Access

| Method | Path                                   | Permission Required | Notes                                           |
| ------ | -------------------------------------- | ------------------- | ----------------------------------------------- |
| GET    | `/v1/inbox/conversations`              | `inbox.read`        | List conversations with filter/pagination       |
| POST   | `/v1/inbox/conversations`              | `inbox.send`        | Create direct, group, or broadcast conversation |
| GET    | `/v1/inbox/conversations/:id`          | `inbox.read`        | Get thread detail (also marks as read)          |
| POST   | `/v1/inbox/conversations/:id/messages` | `inbox.send`        | Send a reply message                            |
| POST   | `/v1/inbox/conversations/:id/read`     | `inbox.read`        | Mark single conversation as read                |
| POST   | `/v1/inbox/conversations/read-all`     | `inbox.read`        | Mark all conversations as read                  |
| PATCH  | `/v1/inbox/conversations/:id/mute`     | `inbox.read`        | Mute/unmute conversation                        |
| PATCH  | `/v1/inbox/conversations/:id/archive`  | `inbox.read`        | Archive/unarchive conversation                  |
| GET    | `/v1/inbox/state`                      | `inbox.read`        | Get unread total and latest message timestamp   |
| GET    | `/v1/inbox/search`                     | `inbox.read`        | Full-text search (user-scoped)                  |
| PATCH  | `/v1/inbox/messages/:id`               | `inbox.send`        | Edit own message (within edit window)           |
| DELETE | `/v1/inbox/messages/:id`               | `inbox.send`        | Soft-delete own message                         |
| GET    | `/v1/inbox/people-search`              | `inbox.send`        | Search people within relational scope           |
| POST   | `/v1/inbox/attachments`                | `inbox.send`        | Upload attachment file                          |
| GET    | `/v1/notifications`                    | auth only           | List notifications                              |
| GET    | `/v1/notifications/unread-count`       | auth only           | Get notification unread count                   |
| PATCH  | `/v1/notifications/:id/read`           | auth only           | Mark notification as read                       |
| POST   | `/v1/notifications/mark-all-read`      | auth only           | Mark all notifications as read                  |
| GET    | `/v1/me/preferences`                   | auth only           | Get user preferences                            |
| PATCH  | `/v1/me/preferences`                   | auth only           | Update user preferences                         |

### 27.2 Endpoints the Teacher CANNOT Access (403)

| Method                | Path                    | Permission Required | Teacher Has? |
| --------------------- | ----------------------- | ------------------- | ------------ |
| GET/PATCH             | `/v1/inbox/oversight/*` | `inbox.oversight.*` | No           |
| GET/PATCH             | `/v1/inbox/settings/*`  | `inbox.settings.*`  | No           |
| GET/POST/PATCH/DELETE | `/v1/announcements/*`   | `communications.*`  | No           |

### 27.3 Audience Endpoints (API Allows, UI Blocks)

| Method | Path                          | Permission Required | Teacher Has? | UI Access?                                   |
| ------ | ----------------------------- | ------------------- | ------------ | -------------------------------------------- |
| GET    | `/v1/inbox/audiences`         | `inbox.send`        | Yes          | Blocked by `useIsAdmin()`                    |
| POST   | `/v1/inbox/audiences`         | `inbox.send`        | Yes          | Available via compose dialog "Save as"       |
| GET    | `/v1/inbox/audiences/:id`     | `inbox.send`        | Yes          | Blocked by `useIsAdmin()`                    |
| POST   | `/v1/inbox/audiences/preview` | `inbox.send`        | Yes          | Available via compose dialog custom audience |

---

## 29. Console & Network Health

| #     | What to Check                              | Expected Result                                                                                                                                                                                                    | Pass/Fail |
| ----- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 28.1  | Console errors on `/en/inbox`              | Open browser DevTools Console. Navigate to `/en/inbox`. No red error messages related to inbox API calls, components, or React rendering.                                                                          |           |
| 28.2  | Console errors on thread view              | Open a thread. No console errors. The `[thread-view]` and `[inbox-sidebar]` prefixed logs should not appear unless there is an actual error.                                                                       |           |
| 28.3  | Console errors on compose dialog           | Open and close the compose dialog. Switch between tabs. No console errors.                                                                                                                                         |           |
| 28.4  | Console errors on search page              | Navigate to `/en/inbox/search?q=test`. No console errors.                                                                                                                                                          |           |
| 28.5  | Console errors on profile page             | Navigate to `/en/profile/communication`. No console errors.                                                                                                                                                        |           |
| 28.6  | Network: no 401 or 403 on normal flow      | During normal inbox usage (list, thread, compose, search), no 401 or 403 responses in the Network tab. All API calls to teacher-accessible endpoints return 200/201.                                               |           |
| 28.7  | Network: no 5xx errors                     | No server errors (500, 502, 503) during normal inbox operations.                                                                                                                                                   |           |
| 28.8  | Network: polling calls                     | Verify that `GET /api/v1/inbox/state` is called periodically (app-shell polling) and `GET /api/v1/inbox/conversations/:id` is called every 30s when viewing a thread.                                              |           |
| 28.9  | Network: no duplicate API calls            | On mount, verify that the thread list fetch does not fire twice (check for race condition or double-render in strict mode). The `cancelled` flag pattern should prevent duplicate state updates.                   |           |
| 28.10 | Network: redirect does not leak admin data | When navigating to `/en/communications`, verify that the page does NOT fetch admin-only data (oversight flags, announcement lists) before redirecting. The `useIsAdmin()` check runs before the fetch `useEffect`. |           |
| 28.11 | Console warnings                           | No React key warnings, no missing translation key warnings, no deprecation warnings related to inbox components.                                                                                                   |           |

---

## 30. End of Spec

This specification covers the complete Communications / Inbox module as experienced by a Teacher role user. All 29 sections must pass for the module to be considered E2E-verified for the Teacher view.

**Summary of test areas:**

| Area                   | Sections          | Focus                                                    |
| ---------------------- | ----------------- | -------------------------------------------------------- |
| Navigation & Layout    | 1, 2, 2.5         | Landing, sidebar shell, desktop/mobile responsive        |
| Thread List & Items    | 2.3, 2.4, 3       | Filters, loading/error/empty states, item rendering      |
| Compose Dialog         | 4, 5, 6           | All three tabs, validation, submission, error handling   |
| People Picker          | 7                 | Search, selection, relational scope, keyboard navigation |
| Channels & Attachments | 8                 | Channel selector, file upload, limits, drag-drop         |
| Thread View            | 9, 10, 11, 12, 13 | Messages, reply, frozen, broadcast, read receipts        |
| Message Actions        | 14                | Edit within window, delete, staff visibility             |
| Search                 | 15                | Full-text search, pagination, result cards               |
| Mute & Archive         | 16                | Mute/unmute, archive/unarchive                           |
| Preferences            | 17                | Channel toggles, language select, save                   |
| Polling                | 18                | Inbox state polling, badge updates                       |
| Cross-Account Flows    | 19, 20            | Admin-to-teacher, teacher-to-parent messaging            |
| Scope Enforcement      | 21                | Relational scope, PeoplePicker filtering, API denial     |
| Frozen Conversations   | 22                | Admin freeze/unfreeze, teacher experience                |
| Negative Assertions    | 23, 24, 25        | Hidden admin affordances, route blocking, API 403s       |
| Arabic / RTL           | 26                | Direction, alignment, logical properties, numerals       |
| Backend Map            | 27                | Complete endpoint reference with permissions             |
| Health Checks          | 28                | Console, network, polling, no leaks                      |

**Total individual test assertions: ~280+**
