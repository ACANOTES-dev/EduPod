# E2E Test Specification: Communications — Full Module (Student View)

> **Coverage:** This document covers the **Communications / Inbox module** as rendered for a user holding the **Student** role (parent tier in the system). Students have `inbox.send`, `inbox.read`, and `legal.view` permissions but do NOT have `inbox.oversight.*`, `inbox.settings.*`, `communications.*`, `parent.view_announcements`, or any admin-tier permissions. The spec exhaustively covers every button, form field, toast, modal, empty state, loading state, permission denial, policy restriction, and route redirect visible to (or blocked from) this role.
>
> **Key student-specific constraints:**
>
> - Students CANNOT edit or delete messages (staff-only; backend returns `EDIT_NOT_ALLOWED_FOR_ROLE` / `DELETE_NOT_ALLOWED_FOR_ROLE`)
> - Students do NOT see read receipts (staff-only feature)
> - Students see `[message deleted]` for deleted messages (not the original body)
> - Students may be blocked from initiating conversations if `students_can_initiate=false` in tenant settings
> - Student-to-student messaging controlled by `student_to_student_messaging` tenant toggle
> - Student-to-parent messaging controlled by `student_to_parent_messaging` tenant toggle
> - Broadcast tab always returns `BROADCAST_NOT_ALLOWED_FOR_ROLE` on submit
> - No inquiry access (parent-only feature)
> - No announcements page access (requires `parent.view_announcements`)
>
> **Pages covered:**
>
> - Inbox sidebar + thread list (`/en/inbox`)
> - Thread detail (`/en/inbox/threads/[id]`)
> - Inbox search (`/en/inbox/search`)
> - Profile communication preferences (`/en/profile/communication`)
> - Student dashboard (`/en/dashboard`)
> - Privacy notice (`/en/privacy-notice`)
>
> **Pages explicitly blocked:**
>
> - Communications hub dashboard (`/en/communications`)
> - Saved audiences (`/en/inbox/audiences`, `/en/inbox/audiences/new`, `/en/inbox/audiences/[id]`)
> - Oversight (`/en/inbox/oversight`, `/en/inbox/oversight/threads/[id]`)
> - Announcements management (`/en/communications/announcements`, `/en/communications/new`, `/en/communications/[id]`)
> - Inquiries (`/en/inquiries`, `/en/communications/inquiries`, `/en/communications/inquiries/[id]`)
> - Announcements feed (`/en/announcements`)
> - Settings pages (`/en/settings/messaging-policy`, `/en/settings/communications/safeguarding`, `/en/settings/communications/fallback`, `/en/settings/notifications`)
> - All `/en/settings/*` routes

**Base URL:** `https://nhqs.edupod.app`
**Prerequisite:** Logged in as **Adam Moore** (`adam.moore@nhqs.test` / `Password123!`), who holds the **Student** role (parent tier), assigned to **Class 2A**.
**Additional test accounts:**

- Admin: **Yusuf Rahman** (`owner@nhqs.test` / `Password123!`)
- Teacher (Class 2A): A teacher assigned to Adam's class (use PeoplePicker results to identify)
- Teacher (NOT Class 2A): A teacher not assigned to any of Adam's classes (use PeoplePicker negative test)

**Student permissions:** `inbox.send`, `inbox.read`, `legal.view`
**Student role tier:** `parent` (shares the parent tier in the system)

---

## Spec Pack Context

This document is the **student UI leg (leg 1)** of the `/e2e-full` release-readiness pack for the Communications module. Sibling specs cover integration, worker, perf, and security. The composite index lives at `RELEASE-READINESS.md` in the module folder root.

Run ONLY this spec for a student-shell smoke; run `/e2e-full` for tenant-onboarding readiness.

---

## Prerequisites — Multi-Tenant Test Environment (MANDATORY)

### Tenants

| Slug     | Hostname                    | Notes                                           |
| -------- | --------------------------- | ----------------------------------------------- |
| `nhqs`   | `https://nhqs.edupod.app`   | Primary — Adam is a student in Class 2A         |
| `test-b` | `https://test-b.edupod.app` | Hostile neighbour — Adam has NO membership here |

### Users required

| Tenant   | Role                   | Name           | Login email               | Password       | Notes                                                 |
| -------- | ---------------------- | -------------- | ------------------------- | -------------- | ----------------------------------------------------- |
| `nhqs`   | student (primary)      | Adam Moore     | `adam.moore@nhqs.test`    | `Password123!` | Student of Class 2A                                   |
| `nhqs`   | teacher (in-scope)     | Sarah Daly     | `sarah.daly@nhqs.test`    | `Password123!` | Teacher of Class 2A — messaging allowed               |
| `nhqs`   | teacher (out-of-scope) | Other Teacher  | `other.teacher@nhqs.test` | `Password123!` | NOT a teacher of Adam's class — scope denied          |
| `nhqs`   | parent                 | Zainab Ali     | `parent@nhqs.test`        | `Password123!` | Adam's parent (or another parent for cross-role test) |
| `nhqs`   | student (peer)         | Other Student  | `other.student@nhqs.test` | `Password123!` | Used for student-to-student toggle tests              |
| `nhqs`   | admin                  | Yusuf Rahman   | `owner@nhqs.test`         | `Password123!` | Admin-tier                                            |
| `test-b` | student                | Test-B Student | `student@test-b.test`     | `Password123!` | Used for cross-tenant hostile pair                    |

### Tenant-setting toggles required (test all four combinations)

| Scenario | `students_can_initiate` | `student_to_student_messaging` | `student_to_parent_messaging` | Expected for student send                   |
| -------- | ----------------------- | ------------------------------ | ----------------------------- | ------------------------------------------- |
| A        | `false`                 | `false`                        | `false`                       | All sends blocked                           |
| B        | `true`                  | `false`                        | `false`                       | Student → teacher/admin only                |
| C        | `true`                  | `true`                         | `false`                       | Student → teacher/admin + student           |
| D        | `true`                  | `true`                         | `true`                        | All sends allowed (within relational scope) |

Default seed for flow execution: **scenario A** — Adam begins blocked from initiating, to exercise the most restrictive UX first.

### Seed data

| Entity                                                      | Count for `nhqs`                 |
| ----------------------------------------------------------- | -------------------------------- |
| Conversations Adam participates in (incoming from teachers) | ≥ 4 (2 unread)                   |
| Broadcast targeting Adam (allow_replies=true)               | 1                                |
| Broadcast targeting Adam (allow_replies=false)              | 1                                |
| Frozen conversation including Adam                          | 1 (admin-frozen)                 |
| Messages authored by Adam                                   | ≥ 2 (to test no-edit, no-delete) |

### Hostile-pair assertions (enforce during execution)

1. As Adam, navigate to `/en/inbox/threads/{test-b_conversation_id}` → **404** / redirect.
2. As Adam, `GET /api/v1/inbox/conversations/{test-b_conversation_id}` via DevTools fetch → **404**.
3. As Adam, `GET /api/v1/inbox/people-search?q=<test-b_name>` → zero test-b users.
4. As Adam, navigate to `/en/announcements` → **redirect to `/en/inbox`** (students lack `parent.view_announcements`).
5. As Adam, navigate to `/en/inquiries` → **redirect to `/en/inbox`**.
6. As Adam, navigate to `/en/communications` → **redirect to `/en/inbox`**.
7. As Adam, navigate to `/en/inbox/oversight` → **redirect to `/en/inbox`**.
8. As Adam, navigate to `/en/inbox/audiences` → **redirect to `/en/inbox`**.
9. As Adam, navigate to `/en/settings/*` → **redirect to `/en`**.

---

## Out of Scope for This Spec

This spec covers only the UI-visible surface for the student role. Not covered:

- RLS leakage matrix, policy-engine unit correctness → `integration/communications-integration-spec.md`
- Webhook signature, replay, idempotency → `integration/communications-integration-spec.md` §§5–6
- BullMQ dispatch, fallback scans, safeguarding keyword scan → `worker/communications-worker-spec.md`
- Latency budgets, scale, load → `perf/communications-perf-spec.md`
- OWASP Top 10, unsubscribe-token forgery, attachment-upload abuse → `security/communications-security-spec.md`
- PDF byte-level correctness — students cannot export

A tester who runs ONLY this spec validates the student-shell UI. Pair with siblings for release-readiness.

---

## Table of Contents

1. [Navigation & Landing (Student Dashboard)](#1-navigation--landing-student-dashboard)
2. [Inbox Sidebar](#2-inbox-sidebar)
3. [Compose Dialog (Direct Only, Policy Restrictions)](#3-compose-dialog-direct-only-policy-restrictions)
4. [Thread View (Reading, Reply, Frozen, No-Reply Broadcast)](#4-thread-view-reading-reply-frozen-no-reply-broadcast)
5. [Thread Messages (No Read Receipts, Deleted Masking, No Edit/Delete)](#5-thread-messages-no-read-receipts-deleted-masking-no-editdelete)
6. [Inbox Search](#6-inbox-search)
7. [Profile Communication Preferences](#7-profile-communication-preferences)
8. [Mute & Archive](#8-mute--archive)
9. [Relational Scope Enforcement](#9-relational-scope-enforcement)
10. [Student Initiation Toggle Behavior](#10-student-initiation-toggle-behavior)
11. [Cross-Account: Teacher -> Student Messaging](#11-cross-account-teacher---student-messaging)
12. [Cross-Account: Admin Broadcast -> Student](#12-cross-account-admin-broadcast---student)
13. [Message Edit/Delete Denied](#13-message-editdelete-denied)
14. [Admin-Only Pages — Negative Assertions](#14-admin-only-pages--negative-assertions)
15. [Route Blocking — All Redirects](#15-route-blocking--all-redirects)
16. [Arabic / RTL](#16-arabic--rtl)
17. [Data Invariants](#17-data-invariants-run-after-each-major-flow)
18. [Backend Endpoint Map](#18-backend-endpoint-map)
19. [Console & Network Health](#19-console--network-health)
20. [End of Spec](#20-end-of-spec)

---

## 1. Navigation & Landing (Student Dashboard)

**Starting point:** Student is logged in and on the student dashboard.

| #    | What to Check                                                             | Expected Result                                                                                                                                                                                         | Pass/Fail |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.1  | Student dashboard loads at `/en/dashboard`                                | The student dashboard renders without errors. It shows a simplified dashboard view appropriate for the student role. No admin stat cards, no staff-only widgets.                                        |           |
| 1.2  | Locate the Inbox icon in the morph bar (top navigation bar)               | An envelope/inbox icon is visible in the morph bar. It may show an unread badge count if the student has unread messages.                                                                               |           |
| 1.3  | Click the Inbox icon in the morph bar                                     | URL changes to `/en/inbox`. The inbox sidebar-shell layout renders. The student is taken directly to the inbox, never to `/en/communications`.                                                          |           |
| 1.4  | Verify that clicking the Inbox icon does NOT land on `/en/communications` | The student is taken directly to `/en/inbox`, never to the Communications hub dashboard. The hub is admin-only.                                                                                         |           |
| 1.5  | Verify the morph bar remains stable during navigation                     | No flashing, no layout jump, no remounting of the morph bar. The morph bar persists across the transition from dashboard to inbox.                                                                      |           |
| 1.6  | Verify the sub-strip navigation (if any) for the Inbox module             | The Inbox module does NOT display a multi-item sub-strip for students. Students see only the inbox sidebar-shell. There is no "Audiences", "Oversight", "Announcements", or "Inquiries" sub-strip item. |           |
| 1.7  | Browser URL structure                                                     | URL is exactly `/en/inbox` (with locale prefix). No query parameters by default.                                                                                                                        |           |
| 1.8  | Page title / document title                                               | The browser tab title includes "Inbox" or the app name.                                                                                                                                                 |           |
| 1.9  | Hub buttons visible in morph bar (student view)                           | The student morph bar shows only hubs accessible to the student role. Admin-only hubs (Settings, Reports, Regulatory, Operations, Finance) are NOT visible.                                             |           |
| 1.10 | No "Communications" or "Inquiries" navigation entry                       | There is no "Communications" hub button, no "Inquiries" link, and no "Announcements" link visible anywhere in the student's navigation.                                                                 |           |

---

## 2. Inbox Sidebar

**URL:** `/en/inbox`

### 2.1 Header Row

| #     | What to Check                    | Expected Result                                                                                                                                                                                                                                                         | Pass/Fail |
| ----- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1.1 | Sidebar heading (`<h1>`)         | An `<h1>` element with the text from translation key `inbox.title` (e.g., "Inbox"). Font: 15px semibold, tracking-tight, color `text-primary`.                                                                                                                          |           |
| 2.1.2 | Compose button                   | A primary `<Button>` with a **Pencil** icon (`lucide-react Pencil`). On screens `>= sm`, the button also shows a text label (translation key `inbox.composeButton`). On mobile `< sm`, only the icon shows. The button has `aria-label` matching `inbox.composeButton`. |           |
| 2.1.3 | Compose button size and position | The button is `size="sm"`, height 8 (h-8), positioned at the end of the header row via `justify-between`.                                                                                                                                                               |           |
| 2.1.4 | Click the Compose button         | The Compose Dialog opens (see section 3).                                                                                                                                                                                                                               |           |

### 2.2 Search Form

| #     | What to Check                                      | Expected Result                                                                                                                                                                             | Pass/Fail |
| ----- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.2.1 | Search input field                                 | A search `<Input>` with a **Search** icon (lucide `Search`) positioned at `start-3`, placeholder text from `inbox.search.placeholder`. The input has `aria-label` matching the placeholder. |           |
| 2.2.2 | Search input styling                               | Height h-9, transparent border, background `surface-secondary`, left/start padding `ps-9` to accommodate the icon, `text-base` on mobile, `md:text-sm` on desktop.                          |           |
| 2.2.3 | Type "hello" into the search input and press Enter | The form submits. URL changes to `/en/inbox/search?q=hello`. The search results page loads (see section 6).                                                                                 |           |
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
| 2.3.9  | Click "Broadcasts" chip              | URL updates to `/en/inbox?filter=broadcasts`. Thread list re-fetches with `kind=broadcast`. Only broadcast threads the student received appear.                                 |           |
| 2.3.10 | Click "Archived" chip                | URL updates to `/en/inbox?filter=archived`. Thread list re-fetches with `archived=true`. Only archived threads appear.                                                          |           |
| 2.3.11 | Click "All" chip (return to default) | The `filter` query param is removed from the URL. All non-archived threads appear again. The API is called with `archived=false` and no `kind` or `unread_only` params.         |           |
| 2.3.12 | Horizontal scroll on narrow screens  | The filter row has `overflow-x-auto` and the container has `-mx-1` padding compensation. Chips are `shrink-0` so they don't wrap. The `no-scrollbar` class hides the scrollbar. |           |

### 2.4 Thread List Area

| #     | What to Check                         | Expected Result                                                                                                                                                                                                            | Pass/Fail |
| ----- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.4.1 | Loading state (first load)            | While threads are loading and `threads === null`, a centered text message from `inbox.loading` appears, styled `text-sm text-text-secondary`.                                                                              |           |
| 2.4.2 | Error state                           | If the API call fails, an error message from `inbox.errors.load_threads` appears in `text-red-600`, centered with `p-4`.                                                                                                   |           |
| 2.4.3 | Empty state (no threads match filter) | If threads loads successfully but returns an empty array, a centered text message from `inbox.list.empty` appears, `text-sm text-text-secondary`, with `p-6`.                                                              |           |
| 2.4.4 | Thread list rendering                 | Threads render as a vertical list inside a `divide-y divide-[var(--color-border)]` container. Each thread is a `ThreadListItem` component.                                                                                 |           |
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

### 2.6 Thread List Items

| #      | What to Check                         | Expected Result                                                                                                                                                                                                                                                                       | Pass/Fail |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.6.1  | Overall structure                     | Each item is a `<button>` element with `type="button"`, full width, flex row layout, padding `px-4 py-3`, `text-start` alignment.                                                                                                                                                     |           |
| 2.6.2  | Kind icon -- Direct message           | For `kind === 'direct'`, a **User** icon (lucide `User`) renders inside a 36px circle (`h-9 w-9 rounded-full`).                                                                                                                                                                       |           |
| 2.6.3  | Kind icon -- Group conversation       | For `kind === 'group'`, a **Users** icon renders in the circle.                                                                                                                                                                                                                       |           |
| 2.6.4  | Kind icon -- Broadcast                | For `kind === 'broadcast'`, a **Megaphone** icon renders in the circle.                                                                                                                                                                                                               |           |
| 2.6.5  | Unread thread styling -- icon circle  | When `unread_count > 0`, the icon circle has `bg-primary-100 text-primary-700`. When read, it has `bg-surface-secondary`.                                                                                                                                                             |           |
| 2.6.6  | Unread dot indicator                  | When the thread is unread AND not selected, a small blue dot (`h-2 w-2 rounded-full bg-primary`) appears at `start-1.5`, vertically centered.                                                                                                                                         |           |
| 2.6.7  | Unread thread styling -- subject text | The subject line has `font-semibold` when unread. When read, it has normal weight. Both use `text-text-primary`.                                                                                                                                                                      |           |
| 2.6.8  | Subject display                       | If the thread has a non-empty `subject`, it displays that. For direct messages with no subject, it shows the translation `inbox.thread.direct_fallback_subject`. For other kinds with no subject, it shows `inbox.thread.untitled_subject`. The subject is truncated with `truncate`. |           |
| 2.6.9  | Frozen indicator                      | If `thread.frozen_at` is not null, a **Lock** icon (`h-3.5 w-3.5 text-text-tertiary`) appears inline with the subject row. It has `aria-label` from `inbox.thread.frozen.title`.                                                                                                      |           |
| 2.6.10 | Timestamp display                     | The timestamp renders at the end of the subject row with `text-[11px] tabular-nums`. Format: today shows HH:mm, this week shows short weekday (e.g., "Mon"), older shows "d MMM" (e.g., "5 Apr"). When unread: `font-semibold text-primary-700`. When read: `text-text-tertiary`.     |           |
| 2.6.11 | Preview body                          | Below the subject row, a second row shows `preview_body` truncated to one line. When unread: `text-text-primary`. When read: `text-text-tertiary`. If no preview body, a non-breaking space renders to maintain row height.                                                           |           |
| 2.6.12 | Unread count badge                    | When unread, a pill badge (`rounded-pill bg-primary-600 text-white text-[10px] font-bold`) appears at the end of the preview row. Shows the count, or "99+" if > 99. Min size `18px x 18px`.                                                                                          |           |
| 2.6.13 | Selected state                        | The selected thread has `bg-primary-50` background. A 3px vertical accent bar (`before:bg-primary-600`) appears on the start edge. The unread dot does NOT show when selected.                                                                                                        |           |
| 2.6.14 | Hover state (non-selected)            | On hover, the item gets `bg-surface-hover`.                                                                                                                                                                                                                                           |           |
| 2.6.15 | `aria-current` attribute              | The selected thread has `aria-current="true"`. Non-selected threads have no `aria-current`.                                                                                                                                                                                           |           |
| 2.6.16 | Click a thread item                   | Navigates to `/en/inbox/threads/{thread.id}`. The clicked item becomes selected.                                                                                                                                                                                                      |           |

---

## 3. Compose Dialog (Direct Only, Policy Restrictions)

**Trigger:** Click the Compose button or press `c`.

### 3.1 Dialog Shell

| #     | What to Check                        | Expected Result                                                                                                                                                                                                                                                      | Pass/Fail |
| ----- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1.1 | Dialog opens                         | A Dialog component renders, overlaying the inbox. On mobile it fills the full viewport (`h-[100dvh] max-h-[100dvh] w-full max-w-full`). On desktop it is centered with `md:max-h-[90vh] md:max-w-2xl md:rounded-xl`.                                                 |           |
| 3.1.2 | Dialog header                        | Contains a `DialogTitle` with text from `inbox.compose.title` (e.g., "New message") and a `DialogDescription` from `inbox.compose.description`, styled `text-xs text-text-tertiary`. The header has a bottom border.                                                 |           |
| 3.1.3 | Tab navigation                       | Below the header, a `<nav role="tablist">` contains three tab buttons: **Direct** (MessageSquare icon), **Group** (Users icon), **Broadcast** (Megaphone icon). Labels from `inbox.compose.tabs.direct`, `inbox.compose.tabs.group`, `inbox.compose.tabs.broadcast`. |           |
| 3.1.4 | Default active tab                   | "Direct" is active by default. Active tab has `bg-primary/10 text-primary`. Inactive tabs have `text-text-secondary hover:bg-background/60`.                                                                                                                         |           |
| 3.1.5 | Tab `role="tab"` and `aria-selected` | Each tab button has `role="tab"`. The active tab has `aria-selected="true"`.                                                                                                                                                                                         |           |
| 3.1.6 | All three tabs visible               | All three tabs (Direct, Group, Broadcast) render regardless of role. Policy enforcement happens server-side on submit, not client-side on render.                                                                                                                    |           |

### 3.2 Direct Tab Fields

| #     | What to Check             | Expected Result                                                                                                                                                                                                  | Pass/Fail |
| ----- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.2.1 | Recipient field           | A `<Label>` with text from `inbox.compose.direct.recipient` followed by a `PeoplePicker` in `mode="single"`. Placeholder from `inbox.compose.direct.recipientPlaceholder`.                                       |           |
| 3.2.2 | Body field                | A `<Label>` with text from `inbox.compose.body.label` and a `<Textarea>` with `id="body"`, placeholder from `inbox.compose.body.placeholder`, 6 rows.                                                            |           |
| 3.2.3 | Attachments section       | A `<Label>` from `inbox.compose.attachments` followed by the `AttachmentUploader` component.                                                                                                                     |           |
| 3.2.4 | Channels section          | A `<Label>` from `inbox.compose.channels` followed by the `ChannelSelector` component.                                                                                                                           |           |
| 3.2.5 | Disable fallback checkbox | A `<Checkbox>` with `id="disable-fallback"` and a label from `inbox.compose.disableFallback.label`. The label is wrapped in a `Tooltip` that shows hint text from `inbox.compose.disableFallback.hint` on hover. |           |

### 3.3 Direct Tab -- Validation & Submit (Student-Specific)

| #      | What to Check                         | Expected Result                                                                                                                                                                                                                                    | Pass/Fail |
| ------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.3.1  | Send button disabled by default       | The Send button (primary, with **Send** icon and text from `inbox.compose.actions.send`) is disabled because no recipient is selected and body is empty.                                                                                           |           |
| 3.3.2  | Select a recipient, leave body empty  | Send button remains disabled. `canSubmit` requires `body.trim().length > 0`.                                                                                                                                                                       |           |
| 3.3.3  | Type body text, no recipient          | Send button remains disabled. `canSubmit` requires `directRecipient !== null`.                                                                                                                                                                     |           |
| 3.3.4  | Select a recipient AND type body text | Send button becomes enabled.                                                                                                                                                                                                                       |           |
| 3.3.5  | Click Send (initiation enabled)       | If `students_can_initiate=true` in tenant settings: a `POST /api/v1/inbox/conversations` request fires with payload: `{ kind: "direct", recipient_user_id: "<uuid>", body: "...", attachments: [], extra_channels: [], disable_fallback: false }`. |           |
| 3.3.6  | Successful send (initiation enabled)  | A success toast appears with text from `inbox.compose.toast.success`. The dialog closes. After a 150ms delay, all compose state resets. The router navigates to `/inbox/threads/{new_conversation_id}`.                                            |           |
| 3.3.7  | Click Send (initiation disabled)      | If `students_can_initiate=false` in tenant settings: the `POST /api/v1/inbox/conversations` API returns a **403** with error code `STUDENT_INITIATION_DISABLED`. A `toast.error` appears with the API error message. The dialog remains open.      |           |
| 3.3.8  | Cancel button                         | A ghost `<Button>` from `inbox.compose.actions.cancel`. Clicking it closes the dialog and resets state after 150ms.                                                                                                                                |           |
| 3.3.9  | Submitting state                      | While submitting, the Send button shows a **Loader2** spinner icon (animate-spin) instead of the Send icon. Both the Cancel and Send buttons are disabled (`isSubmitting`). All form inputs are also disabled.                                     |           |
| 3.3.10 | Close dialog via overlay click        | Clicking outside the dialog content closes it. State resets after 150ms.                                                                                                                                                                           |           |
| 3.3.11 | Failed send -- generic error          | A toast.error appears with the API error message or fallback from `inbox.compose.toast.genericError`. The dialog remains open. The error is logged to console as `[compose-dialog.submit]`.                                                        |           |

### 3.4 Group Tab (Student)

| #     | What to Check                                   | Expected Result                                                                                                                                                                                            | Pass/Fail |
| ----- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.4.1 | Switch to Group tab                             | Click the "Group" tab. The Group tab fields render: Subject, Participants (PeoplePicker multi), Body, Attachments, Channels.                                                                               |           |
| 3.4.2 | Fill Group form and submit (initiation enabled) | If `students_can_initiate=true`: fill subject, add 2+ participants, type body, click Send. `POST /api/v1/inbox/conversations` with `kind: "group"`. The API enforces relational scope on each participant. |           |
| 3.4.3 | Submit Group (initiation disabled)              | If `students_can_initiate=false`: the API returns 403 with `STUDENT_INITIATION_DISABLED`. Toast error. Dialog stays open.                                                                                  |           |
| 3.4.4 | Group participant scope                         | The PeoplePicker only returns users within the student's relational scope (teachers of their class, admin-tier staff, and conditionally other students/parents per tenant toggle).                         |           |

### 3.5 Broadcast Tab (Student -- Always Denied)

| #     | What to Check                                       | Expected Result                                                                                                                                                                                           | Pass/Fail |
| ----- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.5.1 | Switch to Broadcast tab                             | Click the "Broadcast" tab. The Broadcast tab fields render: Subject, Audience picker, Body, Allow replies checkbox, Attachments, Channels.                                                                |           |
| 3.5.2 | Fill Broadcast form and submit                      | Fill all required fields (subject, audience, body) and click Send. The `POST /api/v1/inbox/conversations` with `kind: "broadcast"` is sent.                                                               |           |
| 3.5.3 | Backend rejects with BROADCAST_NOT_ALLOWED_FOR_ROLE | The API returns a **403** with error code `BROADCAST_NOT_ALLOWED_FOR_ROLE`. A `toast.error` appears with the error message. The dialog remains open. The student can never successfully send a broadcast. |           |
| 3.5.4 | Quick audience chips still render                   | The audience picker's quick-select chips (Whole school, All parents, All staff) still render in the UI because the rejection is server-side, not client-side.                                             |           |

### 3.6 People Picker (Student Context)

| #      | What to Check                                            | Expected Result                                                                                                                                                                                                 | Pass/Fail |
| ------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.6.1  | Input field                                              | A text `<Input>` with a **Search** icon at `start-2.5`, placeholder from `inbox.peoplePicker.placeholder`. `autoComplete="off"`. Padding `ps-9`.                                                                |           |
| 3.6.2  | Focus opens dropdown                                     | Focusing the input sets `isOpen` to true. If there is any query text or results, the dropdown listbox appears.                                                                                                  |           |
| 3.6.3  | Debounced search                                         | Typing triggers a 200ms debounce before calling `GET /api/v1/inbox/people-search?q={query}&limit=20`. The API filters results by the student's relational scope server-side.                                    |           |
| 3.6.4  | Results list                                             | Results render in a `<ul>` with `role="listbox"`, max height `max-h-64 overflow-y-auto`. Each result is a `<li role="option">` with avatar (initials fallback), display name, role label, and optionally email. |           |
| 3.6.5  | Scope: student sees teachers of their class              | Search for a teacher who teaches Class 2A. They appear in results.                                                                                                                                              |           |
| 3.6.6  | Scope: student sees admin-tier staff                     | Search for admin staff (e.g., Yusuf Rahman). They appear in results. Admin-tier is always reachable.                                                                                                            |           |
| 3.6.7  | Scope: student does NOT see teachers outside their class | Search for a teacher who does NOT teach any of Adam's classes. They do NOT appear in PeoplePicker results.                                                                                                      |           |
| 3.6.8  | Scope: student-to-student (toggle ON)                    | If `student_to_student_messaging=true` in tenant settings, other students appear in search results.                                                                                                             |           |
| 3.6.9  | Scope: student-to-student (toggle OFF)                   | If `student_to_student_messaging=false`, other students do NOT appear in PeoplePicker results.                                                                                                                  |           |
| 3.6.10 | Scope: student-to-parent (toggle ON)                     | If `student_to_parent_messaging=true`, parents (of students in the same class or Adam's own parents) appear in results.                                                                                         |           |
| 3.6.11 | Scope: student-to-parent (toggle OFF)                    | If `student_to_parent_messaging=false`, parents do NOT appear in PeoplePicker results.                                                                                                                          |           |
| 3.6.12 | Keyboard navigation                                      | ArrowDown/ArrowUp move highlight. Enter selects highlighted result. Escape closes dropdown. Backspace in multi mode removes last chip. All keyboard interactions work correctly.                                |           |
| 3.6.13 | Blur closes dropdown                                     | Blurring the input closes the dropdown after a 150ms delay.                                                                                                                                                     |           |

---

## 4. Thread View (Reading, Reply, Frozen, No-Reply Broadcast)

**URL:** `/en/inbox/threads/{id}`

### 4.1 Thread Loading & Header

| #     | What to Check                       | Expected Result                                                                                                                                                                                              | Pass/Fail |
| ----- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 4.1.1 | Page loads and shows loading state  | While the thread detail is being fetched, a centered loading message from `inbox.loading` appears (`text-sm text-text-secondary`).                                                                           |           |
| 4.1.2 | Thread header -- mobile back button | On mobile, a back button (circular, `h-9 w-9 rounded-full`, **ArrowLeft** icon) with `aria-label` from `common.back`. Click navigates to `/en/inbox`. On desktop, hidden (`md:hidden`).                      |           |
| 4.1.3 | Thread subject in header            | An `<h2>` with the thread subject (or fallback: `inbox.thread.direct_fallback_subject` for direct, `inbox.thread.untitled_subject` for others). Styled `text-sm font-semibold text-text-primary`, truncated. |           |
| 4.1.4 | Participant count                   | Below the subject, a `<p>` showing `inbox.thread.participants_count` (e.g., "2 participants"). Styled `text-xs text-text-secondary`.                                                                         |           |
| 4.1.5 | Error state (thread load failed)    | If the thread fails to load and `detail` is null, a centered error message from `inbox.errors.load_thread` appears.                                                                                          |           |

### 4.2 Messages Area

| #      | What to Check                             | Expected Result                                                                                                                                                                                                          | Pass/Fail |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 4.2.1  | Messages area container                   | A scrollable container (`flex-1 overflow-y-auto overflow-x-hidden bg-background`) with padding `px-4 py-4`. Messages render inside a `max-w-3xl mx-auto` column.                                                         |           |
| 4.2.2  | Message ordering                          | Messages are displayed in ascending chronological order (oldest first, newest at bottom).                                                                                                                                |           |
| 4.2.3  | Auto-scroll on first load                 | On first load, the view auto-scrolls to the bottom (newest message).                                                                                                                                                     |           |
| 4.2.4  | Auto-scroll on new message (if at bottom) | If the student is near the bottom (within 80px threshold) when a new message arrives via polling, the view auto-scrolls. If scrolled up, auto-scroll does not trigger.                                                   |           |
| 4.2.5  | Own messages alignment                    | Messages sent by the student are aligned to the end (right in LTR): `justify-end`, bubble color `bg-primary text-white`.                                                                                                 |           |
| 4.2.6  | Others' messages alignment                | Messages from other users are aligned to the start (left in LTR): `justify-start`, bubble color `bg-surface-secondary text-text-primary`.                                                                                |           |
| 4.2.7  | Sender name label (group/broadcast)       | In group and broadcast conversations, when the sender changes, a sender label appears above the bubble: `text-xs font-medium text-text-secondary`. Own messages do NOT show this label.                                  |           |
| 4.2.8  | Sender name label (direct)                | In direct conversations, sender labels are NEVER shown.                                                                                                                                                                  |           |
| 4.2.9  | Message bubble styling                    | Each bubble has `rounded-2xl px-3 py-2 text-sm break-words`. Body text is inside a `whitespace-pre-wrap` div.                                                                                                            |           |
| 4.2.10 | URL detection in messages                 | URLs in message body are rendered as clickable `<a>` links with `target="_blank" rel="noopener noreferrer"` and `underline break-all` styling.                                                                           |           |
| 4.2.11 | Timestamp below each message              | Each message shows a timestamp in `text-[11px] text-text-tertiary`, formatted as HH:mm. Own messages show timestamp on the end side; others' on the start side.                                                          |           |
| 4.2.12 | Edited indicator                          | If `message.edited_at` is not null, an "(edited)" label from `inbox.message.edited` appears next to the timestamp.                                                                                                       |           |
| 4.2.13 | Attachment display on messages            | Messages with attachments show them below the body. Each attachment row has: **Paperclip** icon, filename (truncated), size (formatted), **Download** icon. Own messages: `bg-white/10`. Others: `bg-surface`.           |           |
| 4.2.14 | Mark as read                              | Opening the thread triggers a `GET /api/v1/inbox/conversations/:id` which implicitly marks it as read on the server. After the first successful load, `refreshPolling()` is called to update the morph bar unread badge. |           |
| 4.2.15 | Polling interval                          | The thread view polls for updates every 30 seconds (`POLL_MS = 30_000`).                                                                                                                                                 |           |

### 4.3 Reply Composer

| #     | What to Check                              | Expected Result                                                                                                                                                                        | Pass/Fail |
| ----- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.3.1 | Composer area location                     | At the bottom of the thread view, a sticky footer with `border-t border-border bg-surface p-3`.                                                                                        |           |
| 4.3.2 | Textarea input                             | A `<Textarea>` with `rows={2}`, `min-h-[44px]`, `text-base md:text-sm`, resize-none. Placeholder from `inbox.thread.composer.placeholder`. `aria-label` matches the placeholder.       |           |
| 4.3.3 | Send button                                | A square icon button (`size="icon"`) with **Send** icon. Disabled when `canReply` is false, `sending` is true, or `composerValue.trim().length === 0`.                                 |           |
| 4.3.4 | Type a message and click Send              | `POST /api/v1/inbox/conversations/{id}/messages` fires with `{ body: "...", attachments: [], extra_channels: [] }`. On success: textarea clears, thread re-fetches, polling refreshes. |           |
| 4.3.5 | Keyboard shortcut: Cmd+Enter or Ctrl+Enter | Pressing `metaKey + Enter` or `ctrlKey + Enter` in the textarea triggers send.                                                                                                         |           |
| 4.3.6 | Error on send                              | If the API call fails, the error is logged to console as `[thread-view:send]`. The textarea retains its content so the student can retry.                                              |           |
| 4.3.7 | Disabled during send                       | While `sending` is true, the textarea and send button are both disabled.                                                                                                               |           |

### 4.4 Frozen Conversation (Student View)

| #     | What to Check                    | Expected Result                                                                                                                                                                                                                    | Pass/Fail |
| ----- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.4.1 | Frozen banner visibility         | When `detail.frozen_at` is not null, an amber warning banner appears between the thread header and the message area.                                                                                                               |           |
| 4.4.2 | Frozen banner content            | The banner has a **Lock** icon, a bold title from `inbox.thread.frozen.title`, and a description showing `detail.freeze_reason` or fallback from `inbox.thread.frozen.banner`.                                                     |           |
| 4.4.3 | Frozen banner styling            | `role="status"`, background `bg-amber-50`, border `border-b border-amber-300`, text `text-amber-900`. Icon is `h-4 w-4 mt-0.5`.                                                                                                    |           |
| 4.4.4 | Reply composer disabled (frozen) | When frozen, the composer area shows a dashed-border disabled state: `border-dashed border-border px-3 py-6 text-center text-xs text-text-secondary`. The disabled reason text comes from `inbox.thread.composer.disabled.frozen`. |           |
| 4.4.5 | Tooltip on disabled composer     | The disabled composer is wrapped in a `Tooltip` that shows the same disabled reason text on hover.                                                                                                                                 |           |
| 4.4.6 | No textarea or send button       | When the composer is in disabled state, the textarea and send button do not render. Only the disabled message is shown.                                                                                                            |           |
| 4.4.7 | Existing messages still readable | All existing messages in the frozen thread are fully readable. Only new replies are blocked.                                                                                                                                       |           |
| 4.4.8 | No freeze/unfreeze controls      | The student does NOT see any freeze or unfreeze buttons. These are admin-only controls.                                                                                                                                            |           |

### 4.5 Broadcast with No Replies (Student View)

| #     | What to Check                                | Expected Result                                                                                                                                                     | Pass/Fail |
| ----- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.5.1 | Broadcast with `allow_replies = false`       | When the thread `kind === 'broadcast'` and `allow_replies !== true`, `canReply` is false.                                                                           |           |
| 4.5.2 | Reply composer disabled (no replies)         | The composer area shows the dashed-border disabled state with reason text from `inbox.thread.composer.disabled.no_reply`.                                           |           |
| 4.5.3 | Broadcast with `allow_replies = true`        | The composer is enabled (assuming the conversation is not frozen). The student can reply.                                                                           |           |
| 4.5.4 | Frozen broadcast with `allow_replies = true` | The frozen check takes precedence. If the conversation is frozen, the composer is disabled regardless of `allow_replies`. The reason text shows the frozen message. |           |

---

## 5. Thread Messages (No Read Receipts, Deleted Masking, No Edit/Delete)

These tests verify student-specific message rendering behaviors that differ from staff views.

### 5.1 No Read Receipts

| #     | What to Check                         | Expected Result                                                                                                                                                                                                              | Pass/Fail |
| ----- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1.1 | Own messages -- no read receipt label | For messages sent by the student (`isOwn === true`), NO "Read by X/Y" label appears below the message bubble. Read receipts are a staff-only feature. The student sees only the timestamp and optional "(edited)" indicator. |           |
| 5.1.2 | No read receipt popover               | There is no clickable "Read by" link or popover on any message in the student's view.                                                                                                                                        |           |
| 5.1.3 | Timestamp-only footer on own messages | Below own message bubbles, only the HH:mm timestamp appears on the end side. No additional read receipt information is rendered.                                                                                             |           |

### 5.2 Deleted Message Masking

| #     | What to Check                      | Expected Result                                                                                                                                                                                                                | Pass/Fail |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 5.2.1 | Deleted message display            | When a message has been deleted (staff deleted it or sender deleted it), the student sees the text `[message deleted]` rendered as a centered italic text from `inbox.message.deleted` in `text-xs italic text-text-tertiary`. |           |
| 5.2.2 | Original body NOT visible          | The student does NOT see the original body of a deleted message. Unlike staff who may see the original text, students see only the "[message deleted]" placeholder.                                                            |           |
| 5.2.3 | Deleted message replaces bubble    | The normal message bubble is not rendered for deleted messages. Instead, the centered italic text appears in place of the full message bubble.                                                                                 |           |
| 5.2.4 | No attachments on deleted messages | Deleted messages do not show any attachment rows. The attachment area is suppressed.                                                                                                                                           |           |

### 5.3 No Edit/Delete Controls

| #     | What to Check                        | Expected Result                                                                                                                                                                      | Pass/Fail |
| ----- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 5.3.1 | No edit affordance on own messages   | The student does NOT see any edit button, edit icon, context menu option, or long-press action to edit their own messages. The UI does not render edit controls for non-staff roles. |           |
| 5.3.2 | No delete affordance on own messages | The student does NOT see any delete button, delete icon, context menu option, or long-press action to delete their own messages.                                                     |           |
| 5.3.3 | No context menu at all               | Right-clicking or long-pressing a message does NOT show a message-actions context menu (or if one appears, it does not contain edit or delete options).                              |           |
| 5.3.4 | No edit/delete on others' messages   | Messages from other users also show no edit or delete affordances (this is consistent with all roles -- you can never edit/delete others' messages).                                 |           |

---

## 6. Inbox Search

**URL:** `/en/inbox/search?q={query}`

| #    | What to Check                 | Expected Result                                                                                                                                                                                                     | Pass/Fail |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1  | Page heading                  | An `<h1>` reads "Search the inbox" (hardcoded English text).                                                                                                                                                        |           |
| 6.2  | Search form                   | A form with a search input (Search icon at `start-3`, padding `ps-9`, autofocus) and a "Search" button. The button is disabled when the query is less than 2 characters.                                            |           |
| 6.3  | Initial state (no query)      | An `EmptyState` component with Search icon, title "Search the inbox", description "Type at least 2 characters to find messages in your threads."                                                                    |           |
| 6.4  | Query with < 2 characters     | Data is cleared. The empty state shows. The API is not called.                                                                                                                                                      |           |
| 6.5  | Loading state                 | While searching, a **Loader2** spinner with "Searching..." text appears (`text-sm text-text-tertiary`).                                                                                                             |           |
| 6.6  | Error state                   | If the search API fails, a destructive-styled error box appears (`border-destructive/40 bg-destructive/5 text-destructive`) with the error message.                                                                 |           |
| 6.7  | No results                    | An `EmptyState` with Search icon, title "No results", description "No messages found for '{query}'. Try fewer or different words."                                                                                  |           |
| 6.8  | Results display               | A count line (`text-xs text-text-tertiary`) shows "N result(s)". Results render as a `<ul>` of linked cards (`<Link href="/inbox/threads/{conversation_id}">`).                                                     |           |
| 6.9  | Result card content           | Each card shows: conversation subject (or kind label: "Direct message" / "Group conversation" / "Broadcast"), relative timestamp, sender display name, and body snippet with `<mark>` tag highlighting (sanitised). |           |
| 6.10 | Result card styling           | Each card has `rounded-lg border border-border bg-surface p-3 hover:bg-background/60`.                                                                                                                              |           |
| 6.11 | Snippet highlighting          | The body_snippet contains `<mark>` tags from the server. The `sanitiseSnippet` function strips all HTML except `<mark>`. The snippet is rendered via `dangerouslySetInnerHTML`.                                     |           |
| 6.12 | Click a result                | Navigates to `/inbox/threads/{conversation_id}`. The thread detail page loads.                                                                                                                                      |           |
| 6.13 | Pagination                    | If `totalPages > 1`, Previous/Next ghost buttons appear with "Page X of Y" text. Previous is disabled on page 1. Next is disabled on the last page.                                                                 |           |
| 6.14 | Scope enforcement             | The search API (`GET /api/v1/inbox/search`) uses `scope='user'`, meaning it only searches the student's own threads. The student cannot search conversations they are not a participant in.                         |           |
| 6.15 | New search submission         | Typing a new query and pressing Enter or clicking Search resets to page 1 and performs a new search.                                                                                                                |           |
| 6.16 | Relative timestamp formatting | "just now" for < 1 minute, "Nm" for minutes, "Nh" for hours, "Nd" for days (< 7), locale date string for older.                                                                                                     |           |

---

## 7. Profile Communication Preferences

**URL:** `/en/profile/communication`

| #    | What to Check                | Expected Result                                                                                                                                                                                                                       | Pass/Fail |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1  | Navigation                   | The student can navigate to `/en/profile/communication` (via profile menu or direct URL). The page loads without redirect or 403.                                                                                                     |           |
| 7.2  | Page heading                 | An `<h1>` with text from `communication.title` (e.g., "Communication Preferences"). Styled `text-2xl font-semibold tracking-tight text-text-primary`.                                                                                 |           |
| 7.3  | Loading state                | On mount, a loading text from `common.loading` appears while preferences are fetched via `GET /api/v1/me/preferences`.                                                                                                                |           |
| 7.4  | Section heading              | After load, a card (`rounded-2xl border bg-surface p-6`) contains a heading from `communication.channels` and description from `communication.description`.                                                                           |           |
| 7.5  | Email checkbox               | A `<Checkbox>` with `id="comm-email"`, label from `communication.email`, description from `communication.emailDescription`. Default: checked (true).                                                                                  |           |
| 7.6  | SMS checkbox                 | A `<Checkbox>` with `id="comm-sms"`, label from `communication.sms`, description from `communication.smsDescription`. Default: unchecked (false).                                                                                     |           |
| 7.7  | Push checkbox                | A `<Checkbox>` with `id="comm-push"`, label from `communication.push`, description from `communication.pushDescription`. Default: unchecked (false).                                                                                  |           |
| 7.8  | Toggle checkboxes            | Clicking each checkbox toggles its boolean value. The state updates immediately in the UI. No API call is made until Save is clicked.                                                                                                 |           |
| 7.9  | Preferred language selector  | Below the checkboxes, separated by a `border-t`, a `<Label>` for `communication.preferredLanguage` and a `<Select>` with width `w-48`. Options: "English" (`en`) from `profile.localeEn` and "Arabic" (`ar`) from `profile.localeAr`. |           |
| 7.10 | Save button                  | A primary `<Button>` at the end of the card with text from `communication.save` (or `communication.saving` while saving). Positioned via `flex justify-end`.                                                                          |           |
| 7.11 | Click Save                   | Calls `PATCH /api/v1/me/preferences` with `{ communication: { email, sms, push, preferred_language } }`.                                                                                                                              |           |
| 7.12 | Save success                 | A success message appears with `text-sm text-success-text` showing text from `communication.saveSuccess`.                                                                                                                             |           |
| 7.13 | Save error                   | An error message appears with `text-sm text-danger-text` showing text from `communication.saveError`. The error is logged to console as `[ProfileCommunicationPage]`.                                                                 |           |
| 7.14 | Button disabled while saving | During the save API call, the Save button is disabled (`disabled={saving}`).                                                                                                                                                          |           |
| 7.15 | Preferences persist          | Reload the page. The previously saved values load correctly from `GET /api/v1/me/preferences`. The checkboxes and language select reflect the saved state.                                                                            |           |

---

## 8. Mute & Archive

| #   | What to Check                                | Expected Result                                                                                                                                                              | Pass/Fail |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | Mute a conversation                          | Triggering mute (via thread context menu or UI affordance) calls `PATCH /api/v1/inbox/conversations/{id}/mute` with `{ muted: true }`. The conversation's `muted_at` is set. |           |
| 8.2 | Unmute a conversation                        | Calling `PATCH /api/v1/inbox/conversations/{id}/mute` with `{ muted: false }`. The `muted_at` is cleared.                                                                    |           |
| 8.3 | Muted thread behavior                        | A muted thread no longer triggers push/email/sms notifications for the student. It still appears in the inbox thread list.                                                   |           |
| 8.4 | Archive a conversation                       | Triggering archive calls `PATCH /api/v1/inbox/conversations/{id}/archive` with `{ archived: true }`. The conversation's `archived_at` is set.                                |           |
| 8.5 | Archived thread disappears from default list | After archiving, the thread no longer appears in the default "All" filter. It appears when the "Archived" filter chip is active.                                             |           |
| 8.6 | Unarchive a conversation                     | From the Archived filter, triggering unarchive calls `PATCH /api/v1/inbox/conversations/{id}/archive` with `{ archived: false }`. The thread returns to the main list.       |           |
| 8.7 | Permission                                   | Both mute and archive operations require `inbox.read` permission, which the student has. These should succeed.                                                               |           |

---

## 9. Relational Scope Enforcement

| #    | What to Check                                                | Expected Result                                                                                                                                                                                               | Pass/Fail |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1  | Student to teacher (in-scope -- teaches Class 2A)            | Open Compose > Direct. Search for a teacher who teaches Adam's Class 2A. They appear in PeoplePicker results. Select and send a message (if initiation is enabled). The conversation is created successfully. |           |
| 9.2  | Student to teacher (out-of-scope -- does NOT teach Class 2A) | Search for a teacher who does NOT teach any of Adam's classes. They do NOT appear in PeoplePicker results. The server-side relational scope filter excludes them.                                             |           |
| 9.3  | Student to admin (always reachable)                          | Search for admin-tier staff (e.g., Yusuf Rahman, principal, vice principal). They always appear in PeoplePicker results regardless of class assignment.                                                       |           |
| 9.4  | Student to office/finance/nurse staff                        | Search for office, finance, or nurse staff. They appear in results. These roles are always reachable.                                                                                                         |           |
| 9.5  | API enforcement -- message out-of-scope teacher              | If somehow the student constructs a direct message to an out-of-scope teacher (e.g., via API tooling), `POST /api/v1/inbox/conversations` returns a **403** with reason code `RELATIONAL_SCOPE_VIOLATED`.     |           |
| 9.6  | Student-to-student scope (toggle ON)                         | With `student_to_student_messaging=true`: search for another student. They appear in results. Send a message to them. It succeeds.                                                                            |           |
| 9.7  | Student-to-student scope (toggle OFF)                        | With `student_to_student_messaging=false`: search for another student. They do NOT appear in PeoplePicker results. API also rejects the attempt if constructed manually.                                      |           |
| 9.8  | Student-to-parent scope (toggle ON)                          | With `student_to_parent_messaging=true`: search for a parent. They appear in results. Send a message. It succeeds.                                                                                            |           |
| 9.9  | Student-to-parent scope (toggle OFF)                         | With `student_to_parent_messaging=false`: search for a parent. They do NOT appear in PeoplePicker results. API rejects the attempt if constructed manually.                                                   |           |
| 9.10 | Scope applies to group conversations                         | When adding participants to a group conversation, the PeoplePicker only returns users within the student's relational scope. Out-of-scope users cannot be added.                                              |           |
| 9.11 | Scope narrows by class, not by section/grade                 | Verify that the scope is specifically tied to Adam's class (Class 2A), not broader grade/section groupings. A teacher of Class 2B (different class, same grade) should NOT appear unless they also teach 2A.  |           |

---

## 10. Student Initiation Toggle Behavior

This section tests the `students_can_initiate` tenant setting, which controls whether students can start new conversations.

| #    | What to Check                                   | Expected Result                                                                                                                                                                                                                          | Pass/Fail |
| ---- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1 | Compose button visibility (initiation enabled)  | When `students_can_initiate=true`, the Compose button is visible and clickable in the inbox sidebar header.                                                                                                                              |           |
| 10.2 | Compose button visibility (initiation disabled) | When `students_can_initiate=false`, the Compose button may still be visible in the UI (the restriction is server-side). The student can open the compose dialog.                                                                         |           |
| 10.3 | Direct message send (initiation enabled)        | With initiation enabled: select an in-scope teacher, type body, click Send. The API returns 201 Created. Conversation is created. Toast success. Navigate to thread.                                                                     |           |
| 10.4 | Direct message send (initiation disabled)       | With initiation disabled: select an in-scope teacher, type body, click Send. The API returns **403** with code `STUDENT_INITIATION_DISABLED`. Toast error appears. Dialog remains open. Compose state is preserved.                      |           |
| 10.5 | Group message send (initiation disabled)        | With initiation disabled: fill group form, click Send. The API returns **403** with code `STUDENT_INITIATION_DISABLED`. Same error behavior.                                                                                             |           |
| 10.6 | Reply still works (initiation disabled)         | Even when `students_can_initiate=false`, the student CAN still reply to existing conversations. Open an existing thread, type a reply, Send. The reply posts successfully (`POST /api/v1/inbox/conversations/:id/messages` returns 201). |           |
| 10.7 | Keyboard shortcut `c` (initiation disabled)     | Pressing `c` still opens the compose dialog (the restriction is server-side, not client-side). The student can fill the form but cannot submit.                                                                                          |           |
| 10.8 | Error message specificity                       | The `STUDENT_INITIATION_DISABLED` error message is specific enough that the student understands they cannot start new conversations (vs. a generic "Permission denied"). The toast text clearly communicates the restriction.            |           |

---

## 11. Cross-Account: Teacher -> Student Messaging

**Prerequisite:** Log out as Adam Moore. Log in as a **teacher who teaches Class 2A** (identify from PeoplePicker results in a prior test).

| #    | What to Check                                 | Expected Result                                                                                                                                                                                                                                                                  | Pass/Fail |
| ---- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1 | Teacher composes direct message to Adam Moore | As the Class 2A teacher, open Compose > Direct. Search for "Adam Moore" or "adam" in PeoplePicker. Adam appears in results (teacher-to-student scope: teacher sees students in their class). Select Adam, type a message, Send.                                                  |           |
| 11.2 | Message sends successfully                    | The conversation is created. Teacher is redirected to the new thread.                                                                                                                                                                                                            |           |
| 11.3 | Log out as teacher, log in as Adam Moore      | Navigate to `/en/inbox`.                                                                                                                                                                                                                                                         |           |
| 11.4 | New message appears in Adam's inbox           | The thread from the teacher appears in the thread list. It shows as unread (bold subject, blue dot, unread count badge). The preview body shows the message text.                                                                                                                |           |
| 11.5 | Open the thread                               | Click the thread. The message from the teacher appears with the correct body, timestamp, and sender alignment (start side, surface-secondary bubble).                                                                                                                            |           |
| 11.6 | Reply to teacher                              | Type a reply in the composer, press Send (or Cmd+Enter). The reply posts successfully (assuming the conversation already exists -- replying is always allowed regardless of initiation toggle). The new message appears at the bottom with primary-colored bubble (own message). |           |
| 11.7 | Teacher receives the reply                    | Log out, log in as teacher. Open the thread. Adam's reply appears.                                                                                                                                                                                                               |           |

---

## 12. Cross-Account: Admin Broadcast -> Student

**Prerequisite:** Log out as Adam Moore. Log in as **Yusuf Rahman** (`owner@nhqs.test` / `Password123!`).

| #    | What to Check                           | Expected Result                                                                                                                                                                                                                                | Pass/Fail |
| ---- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | Admin sends broadcast to "Whole school" | As Yusuf (admin), open Compose > Broadcast > Quick: "Whole school". Type subject and body. Send. The broadcast is created successfully.                                                                                                        |           |
| 12.2 | Log out as admin, log in as Adam Moore  | Navigate to `/en/inbox`.                                                                                                                                                                                                                       |           |
| 12.3 | Broadcast appears in Adam's inbox       | The broadcast appears in the thread list. The thread list item shows a **Megaphone** icon. The subject and preview body match what the admin sent. It shows as unread.                                                                         |           |
| 12.4 | Open the broadcast thread               | Click the thread. The broadcast message renders with the correct body, subject in header, and sender name (Yusuf Rahman).                                                                                                                      |           |
| 12.5 | Reply behavior (allow_replies = false)  | If the broadcast was sent with `allow_replies = false` (default), the composer shows the dashed-border disabled state with `inbox.thread.composer.disabled.no_reply` text. Adam cannot reply.                                                  |           |
| 12.6 | Reply behavior (allow_replies = true)   | If the broadcast was sent with `allow_replies = true`, Adam can type a reply and send it. The reply posts to the thread.                                                                                                                       |           |
| 12.7 | Broadcast filter chip                   | Click the "Broadcasts" filter chip. The broadcast thread appears in the filtered list.                                                                                                                                                         |           |
| 12.8 | Admin sends broadcast to "All parents"  | If the student tier includes parent-tier recipients, verify whether Adam receives this broadcast. (Student is parent-tier in the system, so they should receive "All parents" broadcasts if the audience definition includes the parent tier.) |           |

---

## 13. Message Edit/Delete Denied

Students CANNOT edit or delete messages. The backend enforces this with role-specific error codes.

### 13.1 Edit Denied

| #      | What to Check                       | Expected Result                                                                                                                                                                                      | Pass/Fail |
| ------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1.1 | No edit UI on own messages          | The student does NOT see any edit button, pencil icon, or context menu "Edit" option on their own sent messages.                                                                                     |           |
| 13.1.2 | API edit attempt -- own message     | Using browser DevTools or API tooling, send `PATCH /api/v1/inbox/messages/{student_message_id}` with `{ body: "edited text" }`. The API returns **403** with error code `EDIT_NOT_ALLOWED_FOR_ROLE`. |           |
| 13.1.3 | API edit attempt -- others' message | Send `PATCH /api/v1/inbox/messages/{other_user_message_id}` with `{ body: "edited text" }`. The API returns **403** (either `EDIT_NOT_ALLOWED_FOR_ROLE` or `NOT_MESSAGE_OWNER`).                     |           |
| 13.1.4 | Error code specificity              | The error code is specifically `EDIT_NOT_ALLOWED_FOR_ROLE`, not a generic 403 or permission error. This confirms the role-based restriction rather than a scope restriction.                         |           |

### 13.2 Delete Denied

| #      | What to Check                         | Expected Result                                                                                                                                                          | Pass/Fail |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 13.2.1 | No delete UI on own messages          | The student does NOT see any delete button, trash icon, or context menu "Delete" option on their own sent messages.                                                      |           |
| 13.2.2 | API delete attempt -- own message     | Using browser DevTools or API tooling, send `DELETE /api/v1/inbox/messages/{student_message_id}`. The API returns **403** with error code `DELETE_NOT_ALLOWED_FOR_ROLE`. |           |
| 13.2.3 | API delete attempt -- others' message | Send `DELETE /api/v1/inbox/messages/{other_user_message_id}`. The API returns **403** (either `DELETE_NOT_ALLOWED_FOR_ROLE` or `NOT_MESSAGE_OWNER`).                     |           |
| 13.2.4 | Error code specificity                | The error code is specifically `DELETE_NOT_ALLOWED_FOR_ROLE`, not a generic 403.                                                                                         |           |

---

## 14. Admin-Only Pages — Negative Assertions

These are negative assertions. The student's view must NOT contain any of these elements or pages.

| #     | What to Check                          | Expected Result                                                                                                                                                     | Pass/Fail |
| ----- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.1  | Communications hub dashboard           | The student never sees the `/en/communications` hub page with stat cards (Inbox, Audiences, Announcements, Oversight). If they navigate there, they are redirected. |           |
| 14.2  | Stat cards                             | No "Inbox" stat card, no "Audiences" stat card, no "Announcements" stat card, no "Oversight" stat card visible anywhere in the student's view.                      |           |
| 14.3  | Settings tiles                         | No "Messaging Policy", "Safeguarding Keywords", or "Notification Fallback" settings tiles are visible.                                                              |           |
| 14.4  | "Manage Audiences" button or link      | No button or link to manage audiences appears in the student's inbox or compose dialog.                                                                             |           |
| 14.5  | "New Announcement" button or link      | No button or link to create announcements is visible.                                                                                                               |           |
| 14.6  | Oversight banner                       | No oversight-related banner, flag indicator, or audit information appears in the student's thread view.                                                             |           |
| 14.7  | Flags tab                              | No "Flags" tab or section in any thread view.                                                                                                                       |           |
| 14.8  | Audit tab                              | No "Audit" tab or section in any thread view.                                                                                                                       |           |
| 14.9  | Audiences navigation link              | No "Audiences" navigation link in any sub-strip, sidebar, or menu.                                                                                                  |           |
| 14.10 | Oversight navigation link              | No "Oversight" navigation link in any sub-strip, sidebar, or menu.                                                                                                  |           |
| 14.11 | Announcements management link          | No "Announcements" management link visible in any navigation.                                                                                                       |           |
| 14.12 | Inquiries link                         | No "Inquiries" link visible in any navigation. Students are not parents and have no inquiry access.                                                                 |           |
| 14.13 | Settings navigation for communications | No settings links for messaging policy, safeguarding, fallback, or notifications in the student's accessible navigation.                                            |           |
| 14.14 | Freeze/Unfreeze controls               | The student does not see freeze/unfreeze buttons on conversations. Only the admin oversight view has these controls.                                                |           |
| 14.15 | Flag review modal                      | The student does not see any flag review modals or flag action buttons.                                                                                             |           |
| 14.16 | Edit/Delete message controls           | No edit or delete affordances appear on any message in the student's view (see section 5.3 for details).                                                            |           |
| 14.17 | Read receipt labels                    | No "Read by X/Y" labels or popovers appear on any message (see section 5.1).                                                                                        |           |
| 14.18 | Announcements feed page                | No access to `/en/announcements` (requires `parent.view_announcements` which the student does not have).                                                            |           |

---

## 15. Route Blocking — All Redirects

Navigate to each of these URLs directly (paste into address bar) while logged in as Adam Moore (student).

| #     | Route                                      | Expected Result                                                                                                                                                                                                                                                 | Pass/Fail |
| ----- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.1  | `/en/communications`                       | Redirects to `/en/inbox`. The `useIsAdmin()` check returns false, triggering `router.replace`. The student never sees the hub content.                                                                                                                          |           |
| 15.2  | `/en/inbox/audiences`                      | Redirects to `/en/inbox`. The page checks `useIsAdmin()` and redirects non-admins.                                                                                                                                                                              |           |
| 15.3  | `/en/inbox/audiences/new`                  | Redirects to `/en/inbox`.                                                                                                                                                                                                                                       |           |
| 15.4  | `/en/inbox/audiences/{any-uuid}`           | Redirects to `/en/inbox`.                                                                                                                                                                                                                                       |           |
| 15.5  | `/en/inbox/oversight`                      | Redirects to `/en/inbox`. The oversight page checks admin-tier permission and redirects.                                                                                                                                                                        |           |
| 15.6  | `/en/inbox/oversight/threads/{any-uuid}`   | Redirects to `/en/inbox`.                                                                                                                                                                                                                                       |           |
| 15.7  | `/en/communications/announcements`         | Redirects. Student ends up at inbox.                                                                                                                                                                                                                            |           |
| 15.8  | `/en/communications/new`                   | Redirects. Student ends up at inbox.                                                                                                                                                                                                                            |           |
| 15.9  | `/en/communications/{any-uuid}`            | Redirects. Student ends up at inbox.                                                                                                                                                                                                                            |           |
| 15.10 | `/en/communications/inquiries`             | Redirects. Student ends up at inbox.                                                                                                                                                                                                                            |           |
| 15.11 | `/en/communications/inquiries/{any-uuid}`  | Redirects. Student ends up at inbox.                                                                                                                                                                                                                            |           |
| 15.12 | `/en/inquiries`                            | Redirects or shows 403 page. Inquiries require parent role, not student.                                                                                                                                                                                        |           |
| 15.13 | `/en/announcements`                        | Redirects or shows 403 page. Requires `parent.view_announcements`.                                                                                                                                                                                              |           |
| 15.14 | `/en/settings/messaging-policy`            | Redirects or shows 403 page. Student cannot access messaging policy settings.                                                                                                                                                                                   |           |
| 15.15 | `/en/settings/communications/safeguarding` | Redirects or shows 403 page. Student cannot access safeguarding keyword settings.                                                                                                                                                                               |           |
| 15.16 | `/en/settings/communications/fallback`     | Redirects or shows 403 page. Student cannot access fallback settings.                                                                                                                                                                                           |           |
| 15.17 | `/en/settings/notifications`               | Redirects or shows 403 page. Student cannot access notification settings.                                                                                                                                                                                       |           |
| 15.18 | `/en/settings`                             | Redirects or shows 403 page. Students have no settings access.                                                                                                                                                                                                  |           |
| 15.19 | No flash of admin content                  | During any redirect, the student must NOT see a brief flash of admin-only content (stat cards, settings tiles, oversight data). The communications hub renders an empty `<div className="h-[50vh]">` while the role check is pending, preventing content flash. |           |

---

## 16. Arabic / RTL

**Setup:** Switch to Arabic locale (`/ar/inbox`).

| #     | What to Check                       | Expected Result                                                                                                                                                                                                                                                                       | Pass/Fail |
| ----- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1  | Page direction                      | The `<html>` element has `dir="rtl"` and `lang="ar"`.                                                                                                                                                                                                                                 |           |
| 16.2  | Inbox sidebar position              | The sidebar renders on the right side (start side in RTL). The border is on the left/end side (`border-e` renders as `border-left` in RTL).                                                                                                                                           |           |
| 16.3  | Thread list items layout            | The kind icon circle is on the right (start), text flows right-to-left, timestamp is on the left (end). The unread dot is at `start-1.5` (right side in RTL).                                                                                                                         |           |
| 16.4  | Compose dialog alignment            | Dialog text and inputs are right-aligned. Labels are on the right. The tab bar tabs flow right-to-left.                                                                                                                                                                               |           |
| 16.5  | PeoplePicker search icon            | The search icon is at `start-2.5` (right side in RTL). Input padding is `ps-9` (padding-inline-start).                                                                                                                                                                                |           |
| 16.6  | Message alignment in thread         | Own messages (student) align to the end (left in RTL). Others' messages align to the start (right in RTL). The `flex-row-reverse` on own message timestamps reverses correctly.                                                                                                       |           |
| 16.7  | Filter chips order                  | Chips render in the same logical order but flow right-to-left due to RTL direction.                                                                                                                                                                                                   |           |
| 16.8  | Back button in thread view (mobile) | The **ArrowLeft** icon for the back button. Verify if `rtl:rotate-180` is applied or if the icon needs manual flipping for RTL.                                                                                                                                                       |           |
| 16.9  | Frozen banner layout                | The Lock icon and text flow right-to-left. The icon is on the right.                                                                                                                                                                                                                  |           |
| 16.10 | Channel selector chips              | Channel chips flow right-to-left. The checkmark icon position is correct.                                                                                                                                                                                                             |           |
| 16.11 | Attachment uploader                 | The UploadCloud icon is on the right. The "Add Files" button is on the left (end). File list items flow RTL.                                                                                                                                                                          |           |
| 16.12 | Profile communication page          | Checkboxes are on the right side of their labels. The Select dropdown aligns correctly. The Save button is positioned at the end (left in RTL).                                                                                                                                       |           |
| 16.13 | Western numerals                    | All numbers (unread counts, timestamps, file sizes, page counts, participant counts) use Western numerals (0-9), NOT Arabic-Indic numerals, in both locales.                                                                                                                          |           |
| 16.14 | Gregorian calendar                  | All dates use the Gregorian calendar, not Hijri, in both locales.                                                                                                                                                                                                                     |           |
| 16.15 | LTR enforcement on specific content | Email addresses, URLs in messages, phone numbers, and numeric inputs render with LTR direction override where needed.                                                                                                                                                                 |           |
| 16.16 | No physical directional classes     | Inspect the rendered HTML. Verify that no `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l-`, `rounded-r-`, `border-l-`, `border-r-` classes are present. Only logical equivalents (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`) should be used. |           |
| 16.17 | Search results page RTL             | The search form, results list, and pagination all render correctly in RTL. The Search icon is on the start (right) side.                                                                                                                                                              |           |
| 16.18 | Translation completeness            | All visible text on the inbox pages uses translation keys. No hardcoded English strings appear in the Arabic locale (exception: the search page has some hardcoded English strings -- note as potential i18n gap).                                                                    |           |
| 16.19 | Tooltip and Popover alignment       | Tooltips (disable-fallback hint, frozen composer) render with correct alignment in RTL.                                                                                                                                                                                               |           |
| 16.20 | Selected thread accent bar          | The 3px accent bar (`before:bg-primary-600`) appears on the `start` side (right in RTL) via `before:start-0`.                                                                                                                                                                         |           |
| 16.21 | Compose error toasts in Arabic      | When a policy denial toast fires (e.g., `STUDENT_INITIATION_DISABLED`, `BROADCAST_NOT_ALLOWED_FOR_ROLE`), the toast text is properly translated to Arabic and renders RTL.                                                                                                            |           |

---

## 17. Data Invariants (run after each major flow)

UI-only checks are blind to silent data corruption. Run these SQL (or API-read) assertions after each student flow.

> **Setup:** `SET app.current_tenant_id = '<nhqs_tenant_uuid>';` first so RLS applies.

### 17.1 Student-initiated conversation invariants

| #      | What to assert                                                                                                                | Expected query result                          | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------- |
| 17.1.1 | With `students_can_initiate=false`: Adam's compose attempt returns 403 `STUDENT_INITIATION_DISABLED`; no conversation created | No new row in `conversations` authored by Adam |           |
| 17.1.2 | With `students_can_initiate=true`, Adam sends to Sarah (teacher of 2A): conversation created; `created_by_user_id = <adam>`   | Row present                                    |           |
| 17.1.3 | With `students_can_initiate=true`, Adam sends to an out-of-scope teacher: 403 `RELATIONAL_SCOPE_DENIED`                       | No row                                         |           |
| 17.1.4 | With `student_to_student_messaging=false`, Adam sends to peer student: 403 `STUDENT_TO_STUDENT_DISABLED`                      | No row                                         |           |
| 17.1.5 | With `student_to_student_messaging=true`, Adam sends to peer student: conversation created                                    | Row present                                    |           |
| 17.1.6 | With `student_to_parent_messaging=false`, Adam sends to a parent: 403 `STUDENT_TO_PARENT_DISABLED`                            | No row                                         |           |
| 17.1.7 | Broadcast attempt by Adam: always rejected with 403 `BROADCAST_NOT_ALLOWED_FOR_ROLE`                                          | No conversation created                        |           |

### 17.2 Message invariants (read-only for history, constrained for own)

| #      | What to assert                                                                                    | Expected query result                     | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------- |
| 17.2.1 | Edit attempts by Adam on his own message → 403 `EDIT_NOT_ALLOWED_FOR_ROLE` (students cannot edit) | API returns 403; UI hides edit control    |           |
| 17.2.2 | Delete attempts by Adam → 403 `DELETE_NOT_ALLOWED_FOR_ROLE`                                       | API returns 403; UI hides delete          |           |
| 17.2.3 | Read receipts: Adam's UI does NOT show other participants' `read_state`                           | UI omits read-receipts chip               |           |
| 17.2.4 | Deleted message masking: Adam sees `[message deleted]`, original body retained in DB              | DB: body retained; UI renders placeholder |           |

### 17.3 Tenant isolation

| #      | What to assert                                                                         | Expected query result              | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------- | ---------------------------------- | --------- |
| 17.3.1 | Adam's inbox listing never includes conversations with `tenant_id = '<test-b>'`        | All rows have `tenant_id = <nhqs>` |           |
| 17.3.2 | Direct URL to test-b conversation ID → 404                                             | UI + API both 404                  |           |
| 17.3.3 | `/announcements` and `/inquiries` redirect to `/inbox` (students lack the permissions) | UI redirects                       |           |

### 17.4 Frozen-conversation behaviour

| #      | What to assert                                                                                                      | Expected query result | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------- | --------------------- | --------- |
| 17.4.1 | When Adam's conversation is frozen by admin: send attempts return 409 `CONVERSATION_FROZEN`; UI shows frozen banner | 409 + banner          |           |
| 17.4.2 | Adam can still read past messages in the frozen thread                                                              | API returns history   |           |

### 17.5 Hostile-pair execution log

| #      | Assertion                                             | Observed Result | Pass/Fail |
| ------ | ----------------------------------------------------- | --------------- | --------- |
| 17.5.1 | Direct URL to test-b conversation as Adam             |                 |           |
| 17.5.2 | `GET /api/v1/inbox/conversations/{test-b_id}` as Adam |                 |           |
| 17.5.3 | `GET /api/v1/inbox/people-search?q=<test-b>` as Adam  |                 |           |
| 17.5.4 | Navigate to `/en/announcements` as Adam               |                 |           |
| 17.5.5 | Navigate to `/en/inquiries` as Adam                   |                 |           |
| 17.5.6 | Navigate to `/en/communications` as Adam              |                 |           |
| 17.5.7 | Navigate to `/en/inbox/oversight` as Adam             |                 |           |
| 17.5.8 | Navigate to `/en/inbox/audiences` as Adam             |                 |           |
| 17.5.9 | Navigate to `/en/settings/messaging-policy` as Adam   |                 |           |

---

## 18. Backend Endpoint Map

Reference table of all API endpoints relevant to the student role, with their required permissions.

### 17.1 Endpoints the Student CAN Access

| Method | Path                                   | Permission Required | Notes                                                                   |
| ------ | -------------------------------------- | ------------------- | ----------------------------------------------------------------------- |
| GET    | `/v1/inbox/conversations`              | `inbox.read`        | List conversations with filter/pagination                               |
| POST   | `/v1/inbox/conversations`              | `inbox.send`        | Create direct/group (subject to initiation toggle and relational scope) |
| GET    | `/v1/inbox/conversations/:id`          | `inbox.read`        | Get thread detail (also marks as read)                                  |
| POST   | `/v1/inbox/conversations/:id/messages` | `inbox.send`        | Send a reply message                                                    |
| POST   | `/v1/inbox/conversations/:id/read`     | `inbox.read`        | Mark single conversation as read                                        |
| POST   | `/v1/inbox/conversations/read-all`     | `inbox.read`        | Mark all conversations as read                                          |
| PATCH  | `/v1/inbox/conversations/:id/mute`     | `inbox.read`        | Mute/unmute conversation                                                |
| PATCH  | `/v1/inbox/conversations/:id/archive`  | `inbox.read`        | Archive/unarchive conversation                                          |
| GET    | `/v1/inbox/state`                      | `inbox.read`        | Get unread total and latest message timestamp                           |
| GET    | `/v1/inbox/search`                     | `inbox.read`        | Full-text search (user-scoped)                                          |
| GET    | `/v1/inbox/people-search`              | `inbox.send`        | Search people within relational scope                                   |
| POST   | `/v1/inbox/attachments`                | `inbox.send`        | Upload attachment file                                                  |
| GET    | `/v1/notifications`                    | auth only           | List notifications                                                      |
| GET    | `/v1/notifications/unread-count`       | auth only           | Get notification unread count                                           |
| PATCH  | `/v1/notifications/:id/read`           | auth only           | Mark notification as read                                               |
| POST   | `/v1/notifications/mark-all-read`      | auth only           | Mark all notifications as read                                          |
| GET    | `/v1/me/preferences`                   | auth only           | Get user preferences                                                    |
| PATCH  | `/v1/me/preferences`                   | auth only           | Update user preferences                                                 |
| GET    | `/v1/legal/privacy-notice`             | `legal.view`        | View privacy notice                                                     |

### 17.2 Endpoints the Student CANNOT Access (403)

| Method                | Path                     | Permission Required              | Student Has?                               |
| --------------------- | ------------------------ | -------------------------------- | ------------------------------------------ |
| PATCH                 | `/v1/inbox/messages/:id` | `inbox.send` + staff role        | No (returns `EDIT_NOT_ALLOWED_FOR_ROLE`)   |
| DELETE                | `/v1/inbox/messages/:id` | `inbox.send` + staff role        | No (returns `DELETE_NOT_ALLOWED_FOR_ROLE`) |
| GET/PATCH             | `/v1/inbox/oversight/*`  | `inbox.oversight.*`              | No                                         |
| GET/PATCH             | `/v1/inbox/settings/*`   | `inbox.settings.*`               | No                                         |
| GET/POST/PATCH/DELETE | `/v1/announcements/*`    | `communications.*`               | No                                         |
| GET                   | `/v1/inquiries/*`        | parent role + inquiry permission | No                                         |

### 17.3 Endpoints with Conditional Access (Policy-Gated)

| Method | Path                                               | Condition                    | Error Code When Denied           |
| ------ | -------------------------------------------------- | ---------------------------- | -------------------------------- |
| POST   | `/v1/inbox/conversations` (kind: direct/group)     | `students_can_initiate=true` | `STUDENT_INITIATION_DISABLED`    |
| POST   | `/v1/inbox/conversations` (kind: broadcast)        | Never allowed for students   | `BROADCAST_NOT_ALLOWED_FOR_ROLE` |
| POST   | `/v1/inbox/conversations` (out-of-scope recipient) | Relational scope check       | `RELATIONAL_SCOPE_VIOLATED`      |

### 17.4 Audience Endpoints (API vs UI)

| Method | Path                          | Permission Required | Student Has? | UI Access?                                   |
| ------ | ----------------------------- | ------------------- | ------------ | -------------------------------------------- |
| GET    | `/v1/inbox/audiences`         | `inbox.send`        | Yes          | Blocked by `useIsAdmin()`                    |
| POST   | `/v1/inbox/audiences`         | `inbox.send`        | Yes          | Available via compose dialog "Save as"       |
| GET    | `/v1/inbox/audiences/:id`     | `inbox.send`        | Yes          | Blocked by `useIsAdmin()`                    |
| POST   | `/v1/inbox/audiences/preview` | `inbox.send`        | Yes          | Available via compose dialog custom audience |

---

## 19. Console & Network Health

| #     | What to Check                              | Expected Result                                                                                                                                                                                                                                               | Pass/Fail |
| ----- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 18.1  | Console errors on `/en/inbox`              | Open browser DevTools Console. Navigate to `/en/inbox`. No red error messages related to inbox API calls, components, or React rendering.                                                                                                                     |           |
| 18.2  | Console errors on thread view              | Open a thread. No console errors. The `[thread-view]` and `[inbox-sidebar]` prefixed logs should not appear unless there is an actual error.                                                                                                                  |           |
| 18.3  | Console errors on compose dialog           | Open and close the compose dialog. Switch between tabs. No console errors.                                                                                                                                                                                    |           |
| 18.4  | Console errors on search page              | Navigate to `/en/inbox/search?q=test`. No console errors.                                                                                                                                                                                                     |           |
| 18.5  | Console errors on profile page             | Navigate to `/en/profile/communication`. No console errors.                                                                                                                                                                                                   |           |
| 18.6  | Console errors on dashboard                | Navigate to `/en/dashboard`. No console errors related to inbox polling or communications features.                                                                                                                                                           |           |
| 18.7  | Network: no 401 or 403 on normal flow      | During normal inbox usage (list, thread, compose, search), no 401 or 403 responses in the Network tab. All API calls to student-accessible endpoints return 200/201. The only expected 403s are from policy denials (initiation disabled, broadcast blocked). |           |
| 18.8  | Network: no 5xx errors                     | No server errors (500, 502, 503) during normal inbox operations.                                                                                                                                                                                              |           |
| 18.9  | Network: polling calls                     | Verify that `GET /api/v1/inbox/state` is called periodically (app-shell polling) and `GET /api/v1/inbox/conversations/:id` is called every 30s when viewing a thread.                                                                                         |           |
| 18.10 | Network: no duplicate API calls            | On mount, verify that the thread list fetch does not fire twice (check for race condition or double-render). The `cancelled` flag pattern should prevent duplicate state updates.                                                                             |           |
| 18.11 | Network: redirect does not leak admin data | When navigating to `/en/communications`, verify that the page does NOT fetch admin-only data (oversight flags, announcement lists) before redirecting. The `useIsAdmin()` check runs before the fetch `useEffect`.                                            |           |
| 18.12 | Console warnings                           | No React key warnings, no missing translation key warnings, no deprecation warnings related to inbox components.                                                                                                                                              |           |
| 18.13 | Network: policy denial returns clean JSON  | When `STUDENT_INITIATION_DISABLED` or `BROADCAST_NOT_ALLOWED_FOR_ROLE` is returned, the response body is well-formed JSON with `{ error: { code, message } }` structure. No HTML error pages or stack traces.                                                 |           |

---

## 20. End of Spec

This specification covers the complete Communications / Inbox module as experienced by a Student role user. All 19 sections must pass for the module to be considered E2E-verified for the Student view.

**Summary of test areas:**

| Area                      | Sections       | Focus                                                               |
| ------------------------- | -------------- | ------------------------------------------------------------------- |
| Navigation & Layout       | 1, 2, 2.5, 2.6 | Landing, sidebar shell, desktop/mobile responsive, thread items     |
| Compose Dialog            | 3              | All tabs, direct message, policy restrictions, people picker        |
| Thread View               | 4              | Messages, reply, frozen, broadcast no-reply                         |
| Student-Specific Messages | 5              | No read receipts, deleted masking, no edit/delete controls          |
| Search                    | 6              | Full-text search, pagination, result cards                          |
| Preferences               | 7              | Channel toggles, language select, save                              |
| Mute & Archive            | 8              | Mute/unmute, archive/unarchive                                      |
| Relational Scope          | 9              | Teacher scope, admin reachability, tenant toggles                   |
| Initiation Toggle         | 10             | Compose allowed/denied, reply still works                           |
| Cross-Account: Teacher    | 11             | Teacher sends to student, student replies                           |
| Cross-Account: Broadcast  | 12             | Admin broadcast to student, reply behavior                          |
| Edit/Delete Denied        | 13             | API 403 for edit/delete, correct error codes                        |
| Negative Assertions       | 14, 15         | Hidden admin affordances, route blocking, no content flash          |
| Arabic / RTL              | 16             | Direction, alignment, logical properties, numerals, translations    |
| Backend Map               | 17             | Complete endpoint reference with permissions and conditional access |
| Health Checks             | 18             | Console, network, polling, policy denial responses                  |

**Total individual test assertions: ~250+**

**Key differences from Teacher view spec:**

1. Students cannot edit or delete messages (staff-only)
2. Students do not see read receipts (staff-only)
3. Students see "[message deleted]" for deleted messages (not original body)
4. Broadcast always denied (`BROADCAST_NOT_ALLOWED_FOR_ROLE`)
5. Conversation initiation controlled by `students_can_initiate` tenant toggle
6. Student-to-student and student-to-parent messaging controlled by separate tenant toggles
7. No inquiry or announcements page access
8. Relational scope: student->teacher only if teacher teaches student's class
