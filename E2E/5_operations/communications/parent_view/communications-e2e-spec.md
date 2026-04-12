# E2E Test Specification: Communications — Full Module (Parent View)

> **Coverage:** This document covers the **Communications / Inbox module** as rendered for a user holding the **Parent** role. Parents have `inbox.send`, `inbox.read`, and `parent.view_announcements` permissions. They access a subset of the communications surface: the full inbox (compose, threads, search), a parent-facing announcements feed, an inquiries system (list, create, detail, reply), and communication preferences. Parents do NOT have `inbox.oversight.*`, `inbox.settings.*`, `communications.view`, or `communications.manage` permissions.
>
> **Pages covered:**
>
> - `/en/inbox` — Inbox sidebar + thread list
> - `/en/inbox/threads/[id]` — Thread detail (messages, reply)
> - `/en/inbox/search` — Search results
> - `/en/announcements` — Parent announcements feed (published announcements)
> - `/en/inquiries` — Parent inquiries list
> - `/en/inquiries/new` — Submit new inquiry (with student selector)
> - `/en/inquiries/[id]` — Inquiry detail (thread view, reply)
> - `/en/profile/communication` — Communication preferences
>
> **Pages explicitly blocked:**
>
> - Communications hub dashboard (`/en/communications`)
> - Saved audiences (`/en/inbox/audiences`, `/en/inbox/audiences/new`, `/en/inbox/audiences/[id]`)
> - Oversight (`/en/inbox/oversight`, `/en/inbox/oversight/threads/[id]`)
> - Announcements management (`/en/communications/announcements`, `/en/communications/new`, `/en/communications/[id]`)
> - Admin inquiries management (`/en/communications/inquiries`, `/en/communications/inquiries/[id]`)
> - All settings pages (`/en/settings/messaging-policy`, `/en/settings/communications/safeguarding`, `/en/settings/communications/fallback`, `/en/settings/notifications`)

**Base URL:** `https://nhqs.edupod.app`
**Prerequisite:** Logged in as **Zainab Ali** (`parent@nhqs.test` / `Password123!`), who holds the **Parent** role.
**Additional test accounts:**

- Admin: **Yusuf Rahman** (`owner@nhqs.test` / `Password123!`)
- Teacher: **Sarah Daly** (`sarah.daly@nhqs.test` / `Password123!`)

**Permissions referenced:**

- `inbox.send` — compose, reply, people search, attachments
- `inbox.read` — list conversations, get thread, mark read, mute, archive, search
- `parent.view_announcements` — parent announcement feed (`GET /v1/announcements/my`)
- `parent.submit_inquiry` — submit and reply to own inquiries (`POST /v1/inquiries`, `POST /v1/inquiries/:id/messages/parent`)

**Parent-specific behaviour notes:**

- Read receipts are **staff-only** — parents do NOT see `read_state` data on messages
- Deleted messages display as `[message deleted]` (original body never exposed)
- Broadcast tab: parent may see `PARENT_INITIATION_DISABLED` error if `parents_can_initiate=false`
- Relational scope: parent can message teachers of their children, admin-tier roles, and office/finance/nurse roles. Parent-to-parent messaging is controlled by a tenant toggle
- Inquiries: parents can list, create, view, and reply but CANNOT close inquiries
- Announcements: read-only feed of published announcements via `/announcements`

---

## Spec Pack Context

This document is the **parent UI leg (leg 1)** of the `/e2e-full` release-readiness pack for the Communications module. Sibling specs cover integration, worker, perf, and security. The composite index is `RELEASE-READINESS.md` at the module folder root.

Run ONLY this spec for a parent-shell smoke; run the full pack (`/e2e-full`) for tenant-onboarding readiness.

---

## Prerequisites — Multi-Tenant Test Environment (MANDATORY)

### Tenants

| Slug     | Hostname                    | Notes                                                   |
| -------- | --------------------------- | ------------------------------------------------------- |
| `nhqs`   | `https://nhqs.edupod.app`   | Primary — Zainab Ali is parent of a student in Class 2A |
| `test-b` | `https://test-b.edupod.app` | Hostile neighbour — Zainab has NO membership here       |

### Users required

| Tenant   | Role                   | Name           | Login email               | Password       | Notes                                         |
| -------- | ---------------------- | -------------- | ------------------------- | -------------- | --------------------------------------------- |
| `nhqs`   | parent (primary)       | Zainab Ali     | `parent@nhqs.test`        | `Password123!` | Parent of a student in Class 2A               |
| `nhqs`   | admin                  | Yusuf Rahman   | `owner@nhqs.test`         | `Password123!` | Admin-tier                                    |
| `nhqs`   | teacher (in-scope)     | Sarah Daly     | `sarah.daly@nhqs.test`    | `Password123!` | Teacher of Zainab's child — messaging allowed |
| `nhqs`   | teacher (out-of-scope) | Other Teacher  | `other.teacher@nhqs.test` | `Password123!` | NOT teacher of Zainab's child — scope denied  |
| `nhqs`   | parent (other family)  | Other Parent   | `other.parent@nhqs.test`  | `Password123!` | Used for parent-to-parent tests               |
| `nhqs`   | student                | Zainab's Child | existing student account  | —              | —                                             |
| `test-b` | parent                 | Test-B Parent  | `parent@test-b.test`      | `Password123!` | Used for cross-tenant hostile pair            |

### Tenant setup

| Setting                                            | Value required for primary flows                                     |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `messaging_enabled`                                | `true`                                                               |
| `parents_can_initiate`                             | `true` (must toggle between true/false for §5 conditional broadcast) |
| `parent_to_parent_messaging`                       | `false` by default; toggle to `true` for one happy-path check        |
| Messaging policy parent→teacher cell               | `allowed = true` (default)                                           |
| Messaging policy parent→admin cell                 | `allowed = true`                                                     |
| Messaging policy parent→office/finance/nurse cells | `allowed = true`                                                     |

### Seed data

| Entity                                                | Count for `nhqs` |
| ----------------------------------------------------- | ---------------- |
| Zainab's unread inbox conversations                   | ≥ 3              |
| Zainab's read inbox conversations                     | ≥ 5              |
| Broadcast announcements targeting Zainab's household  | ≥ 2 published    |
| Published announcements school-wide                   | ≥ 5              |
| Zainab's inquiries (open)                             | ≥ 2              |
| Zainab's inquiries (in_progress)                      | ≥ 1              |
| Zainab's inquiries (closed)                           | ≥ 1              |
| Frozen conversation involving Zainab                  | 1 (admin-frozen) |
| Broadcast with `allow_replies=true` including Zainab  | 1                |
| Broadcast with `allow_replies=false` including Zainab | 1                |

### Hostile-pair assertions (enforce during execution)

1. As Zainab, navigate to `/en/inbox/threads/{test-b_conversation_id}` → **404** / empty-state redirect.
2. As Zainab, `GET /api/v1/inbox/conversations/{test-b_conversation_id}` via DevTools fetch → **404**.
3. As Zainab, `GET /api/v1/announcements/my` → returns ONLY nhqs announcements (never test-b).
4. As Zainab, `GET /api/v1/inquiries/my` → returns ONLY Zainab's own inquiries (never another parent's from same tenant).
5. As Zainab, navigate to `/en/communications` → **redirect to `/en/inbox`** (non-admin).
6. As Zainab, navigate to `/en/inbox/oversight` → **redirect to `/en/inbox`**.
7. As Zainab, navigate to `/en/inbox/audiences` → **redirect to `/en/inbox`**.
8. As Zainab, navigate to `/en/communications/inquiries` (admin list) → **redirect to `/en/inbox`**.

---

## Out of Scope for This Spec

This spec covers only the UI-visible surface for the parent role. Not covered:

- RLS leakage matrix, API contract tests (Zod validation edge cases), state-machine exhaustiveness → `integration/communications-integration-spec.md`
- Stripe — n/a for Communications
- Resend/Twilio webhook signature, replay, idempotency → `integration/communications-integration-spec.md` §§5–6
- BullMQ dispatch, fallback scans, safeguarding keyword scan, announcement publish job → `worker/communications-worker-spec.md`
- Latency budgets (p50/p95/p99), load, bundle size → `perf/communications-perf-spec.md`
- OWASP Top 10, unsubscribe-token forgery, attachment upload abuse (ZIP-bomb, SSRF, MIME spoof), rate-limit abuse → `security/communications-security-spec.md`
- Handlebars template rendering correctness, multi-locale template fallback → `integration/communications-integration-spec.md` §7

A tester who runs ONLY this spec validates the parent-shell UI. Pair with siblings for release-readiness.

---

## Table of Contents

1. [Navigation & Landing](#1-navigation--landing)
2. [Inbox Sidebar](#2-inbox-sidebar)
3. [Compose Dialog -- Direct Message](#3-compose-dialog----direct-message)
4. [Compose Dialog -- Group Message](#4-compose-dialog----group-message)
5. [Compose Dialog -- Broadcast Restrictions](#5-compose-dialog----broadcast-restrictions)
6. [Thread View -- Reading & Reply](#6-thread-view----reading--reply)
7. [Thread View -- Frozen & No-Reply](#7-thread-view----frozen--no-reply)
8. [Thread Messages -- No Read Receipts & Deleted Masking](#8-thread-messages----no-read-receipts--deleted-masking)
9. [Inbox Search](#9-inbox-search)
10. [Announcements Feed (/announcements)](#10-announcements-feed-announcements)
11. [Inquiries List (/inquiries)](#11-inquiries-list-inquiries)
12. [New Inquiry Form (/inquiries/new)](#12-new-inquiry-form-inquiriesnew)
13. [Inquiry Detail & Reply (/inquiries/[id])](#13-inquiry-detail--reply-inquiriesid)
14. [Profile Communication Preferences](#14-profile-communication-preferences)
15. [Mute & Archive](#15-mute--archive)
16. [Relational Scope Enforcement](#16-relational-scope-enforcement)
17. [Cross-Account: Admin Broadcast -> Parent](#17-cross-account-admin-broadcast---parent)
18. [Cross-Account: Parent Inquiry Flow](#18-cross-account-parent-inquiry-flow)
19. [Cross-Account: Parent -> Teacher Messaging](#19-cross-account-parent---teacher-messaging)
20. [Admin-Only Pages -- Negative Assertions](#20-admin-only-pages----negative-assertions)
21. [Route Blocking -- All Redirects](#21-route-blocking----all-redirects)
22. [Arabic / RTL](#22-arabic--rtl)
23. [Data Invariants](#23-data-invariants-run-after-each-major-flow)
24. [Backend Endpoint Map](#24-backend-endpoint-map)
25. [Console & Network Health](#25-console--network-health)
26. [End of Spec](#26-end-of-spec)

---

## 1. Navigation & Landing

**Starting point:** Parent is logged in and on the school dashboard.

| #    | What to Check                                                    | Expected Result                                                                                                                                | Pass/Fail |
| ---- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.1  | Locate the Inbox icon in the morph bar (top navigation bar)      | An envelope/inbox icon is visible in the morph bar. It may show an unread badge count if the parent has unread messages.                       |           |
| 1.2  | Click the Inbox icon in the morph bar                            | URL changes to `/en/inbox`. The inbox sidebar-shell layout renders. The parent is NOT taken to `/en/communications` (that is admin-only).      |           |
| 1.3  | Verify that clicking Inbox does NOT land on `/en/communications` | The parent is taken directly to `/en/inbox`, never to the Communications hub dashboard.                                                        |           |
| 1.4  | Verify the morph bar remains stable during navigation            | No flashing, no layout jump, no remounting of the morph bar. The morph bar persists across the transition.                                     |           |
| 1.5  | Verify no sub-strip navigation appears for Inbox                 | The Inbox module does NOT display a multi-item sub-strip for parents. There is no "Audiences", "Oversight", or "Announcements" sub-strip item. |           |
| 1.6  | Browser URL structure                                            | URL is exactly `/en/inbox` (with locale prefix). No query parameters by default.                                                               |           |
| 1.7  | Page title / document title                                      | The browser tab title includes "Inbox" or the app name.                                                                                        |           |
| 1.8  | Verify admin-restricted hub icons are NOT visible                | The parent should NOT see hub icons for admin-only areas. The visible hubs are limited to what the parent role is permitted to access.         |           |
| 1.9  | Navigate to `/en/announcements` via the morph bar or direct URL  | The Parent Announcements Feed page loads. Page displays a header and a list of published announcements (or empty state if none).               |           |
| 1.10 | Navigate to `/en/inquiries` via the morph bar or direct URL      | The Parent Inquiries List page loads. Page displays header with "New Inquiry" button and list of inquiries (or empty state).                   |           |

---

## 2. Inbox Sidebar

**URL:** `/en/inbox`

### 2.1 Header Row

| #     | What to Check            | Expected Result                                                                                                                                                                          | Pass/Fail |
| ----- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1.1 | Sidebar heading          | An `<h1>` element with the text "Inbox" (from `inbox.title` translation key). Font: 15px semibold, tracking-tight, text-primary colour.                                                  |           |
| 2.1.2 | Compose button           | A primary `<Button>` with a **Pencil** icon. On `>= sm` screens, the button also shows a text label. On mobile `< sm`, only the icon shows. Has `aria-label` matching the compose label. |           |
| 2.1.3 | Click the Compose button | The Compose Dialog opens (see sections 3-5).                                                                                                                                             |           |

### 2.2 Search Form

| #     | What to Check                  | Expected Result                                                                                                  | Pass/Fail |
| ----- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------- | --------- |
| 2.2.1 | Search input field             | A search `<Input>` with a **Search** icon positioned at start, placeholder text from `inbox.search.placeholder`. |           |
| 2.2.2 | Type "hello" and press Enter   | The form submits. URL changes to `/en/inbox/search?q=hello`. The search results page loads (see section 9).      |           |
| 2.2.3 | Submit search with empty input | Nothing happens. No navigation occurs. The handler returns early on empty string.                                |           |

### 2.3 Filter Chips

| #     | What to Check             | Expected Result                                                                                                       | Pass/Fail |
| ----- | ------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.3.1 | Number of filter chips    | Exactly **6** filter chip buttons: **All**, **Unread**, **Direct**, **Group**, **Broadcasts**, **Archived**.          |           |
| 2.3.2 | Default active filter     | "All" is active by default. Active chip has distinct background styling and `aria-pressed="true"`.                    |           |
| 2.3.3 | Click "Unread" chip       | URL updates to `/en/inbox?filter=unread`. Thread list re-fetches with `unread_only=true`. Only unread threads appear. |           |
| 2.3.4 | Click "Direct" chip       | URL updates to `/en/inbox?filter=direct`. Only direct message threads appear.                                         |           |
| 2.3.5 | Click "Group" chip        | URL updates to `/en/inbox?filter=group`. Only group conversations appear.                                             |           |
| 2.3.6 | Click "Broadcasts" chip   | URL updates to `/en/inbox?filter=broadcasts`. Only broadcast threads appear.                                          |           |
| 2.3.7 | Click "Archived" chip     | URL updates to `/en/inbox?filter=archived`. Only archived threads appear.                                             |           |
| 2.3.8 | Click "All" chip to reset | The filter query param is removed. All non-archived threads appear again.                                             |           |
| 2.3.9 | `aria-pressed` attribute  | Each chip has `aria-pressed="true"` when active, `aria-pressed="false"` when inactive.                                |           |

### 2.4 Thread List

| #      | What to Check                       | Expected Result                                                                                                                      | Pass/Fail |
| ------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 2.4.1  | Loading state                       | While threads are loading, a centered loading message appears.                                                                       |           |
| 2.4.2  | Error state                         | If the API call fails, an error message in red text appears.                                                                         |           |
| 2.4.3  | Empty state                         | If no threads match the current filter, a centered empty-state text appears.                                                         |           |
| 2.4.4  | Thread items rendering              | Threads render as a vertical list with dividers. Each item shows kind icon, subject, preview body, timestamp, and unread indicators. |           |
| 2.4.5  | Kind icons                          | Direct threads show a **User** icon; Group threads show a **Users** icon; Broadcast threads show a **Megaphone** icon.               |           |
| 2.4.6  | Unread styling                      | Unread threads have bold subject text, primary-coloured icon background, a small unread dot, and an unread count badge.              |           |
| 2.4.7  | Click a thread item                 | Navigates to `/en/inbox/threads/{id}`. The thread becomes selected with highlighted background.                                      |           |
| 2.4.8  | Frozen thread indicator             | If a thread has `frozen_at` set, a **Lock** icon appears inline with the subject.                                                    |           |
| 2.4.9  | API call on mount                   | `GET /api/v1/inbox/conversations?page=1&pageSize=30&archived=false` fires on mount. Verify in Network tab.                           |           |
| 2.4.10 | Keyboard shortcut: press `c`        | Pressing `c` (not inside an input) opens the Compose Dialog.                                                                         |           |
| 2.4.11 | Keyboard shortcut: `c` inside input | Pressing `c` while focused on a search input or textarea does NOT open the compose dialog.                                           |           |

### 2.5 Sidebar Layout

| #     | What to Check                       | Expected Result                                                                                                               | Pass/Fail |
| ----- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.5.1 | Desktop layout (>= md breakpoint)   | Two-pane layout: sidebar ~360px on start side, thread content area on end side. Sidebar has `border-e`.                       |           |
| 2.5.2 | Mobile layout -- no thread selected | On mobile at `/en/inbox`, sidebar takes full width. Thread content area is hidden.                                            |           |
| 2.5.3 | Mobile layout -- thread selected    | At `/en/inbox/threads/[id]`, sidebar is hidden on mobile. Thread view takes full width. A back button returns to the sidebar. |           |
| 2.5.4 | Container height                    | Inbox pane uses `h-[calc(100dvh-56px)]` to fill viewport below the morph bar. No page-level scrollbar.                        |           |
| 2.5.5 | No thread selected (desktop)        | The main area shows an inbox empty state: centred icon in a circle, heading, and body text.                                   |           |

---

## 3. Compose Dialog -- Direct Message

**Trigger:** Click the Compose button or press `c`.

### 3.1 Dialog Shell

| #     | What to Check      | Expected Result                                                                                                                                        | Pass/Fail |
| ----- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 3.1.1 | Dialog opens       | A Dialog renders overlaying the inbox. On mobile: full viewport. On desktop: centred, max-width ~2xl, rounded corners.                                 |           |
| 3.1.2 | Dialog header      | Contains a title (e.g., "New message") and a description, with a bottom border.                                                                        |           |
| 3.1.3 | Tab navigation     | Three tab buttons: **Direct** (MessageSquare icon), **Group** (Users icon), **Broadcast** (Megaphone icon). Each has `role="tab"` and `aria-selected`. |           |
| 3.1.4 | Default active tab | "Direct" is active by default with `bg-primary/10 text-primary` styling and `aria-selected="true"`.                                                    |           |

### 3.2 Direct Tab Fields

| #     | What to Check             | Expected Result                                                          | Pass/Fail |
| ----- | ------------------------- | ------------------------------------------------------------------------ | --------- |
| 3.2.1 | Recipient field           | A Label and `PeoplePicker` in `mode="single"`. Placeholder text visible. |           |
| 3.2.2 | Body field                | A Label and `<Textarea>` with placeholder, 6 rows.                       |           |
| 3.2.3 | Attachments section       | A Label and `AttachmentUploader` component.                              |           |
| 3.2.4 | Channels section          | A Label and `ChannelSelector` component.                                 |           |
| 3.2.5 | Disable fallback checkbox | A Checkbox with label and tooltip hint.                                  |           |

### 3.3 Direct Tab -- Validation & Submit

| #     | What to Check                      | Expected Result                                                                                                                                                                                                                      | Pass/Fail |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 3.3.1 | Send button disabled by default    | The Send button is disabled (no recipient, no body).                                                                                                                                                                                 |           |
| 3.3.2 | Select recipient, leave body empty | Send button remains disabled.                                                                                                                                                                                                        |           |
| 3.3.3 | Type body, no recipient selected   | Send button remains disabled.                                                                                                                                                                                                        |           |
| 3.3.4 | Select recipient AND type body     | Send button becomes enabled.                                                                                                                                                                                                         |           |
| 3.3.5 | Click Send                         | `POST /api/v1/inbox/conversations` fires with `{ kind: "direct", recipient_user_id, body, attachments: [], extra_channels: [], disable_fallback: false }`.                                                                           |           |
| 3.3.6 | Successful send                    | Success toast appears. Dialog closes. Router navigates to `/inbox/threads/{new_id}`.                                                                                                                                                 |           |
| 3.3.7 | API error on send                  | Error toast appears with message from the API error response or a generic fallback. Dialog remains open.                                                                                                                             |           |
| 3.3.8 | PeoplePicker relational scope      | When searching for recipients, the PeoplePicker only returns users within the parent's relational scope: teachers of their children, admin-tier staff, office/finance/nurse roles. Parent-to-parent results depend on tenant toggle. |           |

---

## 4. Compose Dialog -- Group Message

| #   | What to Check                                  | Expected Result                                                                                                                             | Pass/Fail |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1 | Click "Group" tab                              | Tab switches. The form now shows Subject field, multi-participant PeoplePicker, body, attachments, channels, and disable-fallback checkbox. |           |
| 4.2 | Subject field                                  | An `<Input>` with `id="group-subject"` and placeholder text.                                                                                |           |
| 4.3 | Participants field                             | A `PeoplePicker` in `mode="multi"` with max recipients of 49. A count line shows current participant count.                                 |           |
| 4.4 | Send disabled: empty subject                   | With participants added and body typed but empty subject, Send remains disabled.                                                            |           |
| 4.5 | Send disabled: fewer than 2 participants       | With subject and body but only 1 participant, Send remains disabled.                                                                        |           |
| 4.6 | Send enabled: >= 2 participants, subject, body | Send button becomes enabled.                                                                                                                |           |
| 4.7 | Click Send                                     | `POST /api/v1/inbox/conversations` fires with `{ kind: "group", subject, participant_user_ids: [...], body, ... }`.                         |           |
| 4.8 | Successful group creation                      | Success toast. Dialog closes. Navigates to new thread.                                                                                      |           |
| 4.9 | PeoplePicker scope for group                   | Same relational scope as direct: parent can only add people within their permitted scope.                                                   |           |

---

## 5. Compose Dialog -- Broadcast Restrictions

| #   | What to Check                                               | Expected Result                                                                                                                                                                       | Pass/Fail |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1 | Click "Broadcast" tab                                       | Tab switches. The form shows Subject, AudiencePicker, Allow Replies checkbox, body, attachments, channels, and disable-fallback checkbox.                                             |           |
| 5.2 | Subject field                                               | An `<Input>` with `id="broadcast-subject"` and placeholder.                                                                                                                           |           |
| 5.3 | Audience picker                                             | The `AudiencePicker` component renders. Parent may see limited audience options compared to admin.                                                                                    |           |
| 5.4 | Allow Replies checkbox                                      | A Checkbox with `id="allow-replies"` and label/hint text explaining reply behaviour.                                                                                                  |           |
| 5.5 | Send disabled: no subject                                   | Send remains disabled without a subject even if audience and body are provided.                                                                                                       |           |
| 5.6 | Send disabled: no audience                                  | Send remains disabled without an audience even if subject and body are provided.                                                                                                      |           |
| 5.7 | Attempt to send broadcast when `parents_can_initiate=false` | The API returns an error with code `PARENT_INITIATION_DISABLED`. An error toast displays the message. The dialog remains open.                                                        |           |
| 5.8 | Broadcast when `parents_can_initiate=true`                  | The broadcast sends successfully if the parent has a valid audience, subject, and body.                                                                                               |           |
| 5.9 | Audience empty error                                        | If the selected audience resolves to zero recipients, the API returns `BROADCAST_AUDIENCE_EMPTY`. The compose dialog shows a specific toast from `inbox.compose.toast.audienceEmpty`. |           |

---

## 6. Thread View -- Reading & Reply

**URL:** `/en/inbox/threads/[id]`

### 6.1 Thread Header

| #     | What to Check                      | Expected Result                                                                                                                                                                    | Pass/Fail |
| ----- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1.1 | Thread header bar                  | A bar at the top with the thread subject (or fallback: "Direct message" for direct threads, "Untitled" for others). Below the subject: participant count (e.g., "2 participants"). |           |
| 6.1.2 | Back button on mobile              | On mobile (< md), a back button with ArrowLeft icon is visible. Clicking it navigates to `/en/inbox`.                                                                              |           |
| 6.1.3 | Back button hidden on desktop      | On desktop (>= md), the back button is not visible (sidebar is always shown).                                                                                                      |           |
| 6.1.4 | Subject display for direct message | For a direct thread with no explicit subject, displays the translation `inbox.thread.direct_fallback_subject`.                                                                     |           |

### 6.2 Message List

| #      | What to Check                          | Expected Result                                                                                                                                            | Pass/Fail |
| ------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.2.1  | Messages render in chronological order | Messages display from oldest at top to newest at bottom (the API returns newest-first, the UI reverses).                                                   |           |
| 6.2.2  | Own messages alignment                 | Messages sent by the parent (Zainab Ali) align to the end side (right in LTR). They have primary-coloured background with white text.                      |           |
| 6.2.3  | Others' messages alignment             | Messages from other participants align to the start side (left in LTR). They have surface-secondary background with primary text colour.                   |           |
| 6.2.4  | Sender label on others' messages       | The first message (or when `showSenderMeta` is true) from another participant shows their name above the bubble.                                           |           |
| 6.2.5  | Timestamps                             | Each message has a timestamp in HH:mm format below the bubble. For own messages, timestamp order is reversed (`flex-row-reverse`).                         |           |
| 6.2.6  | Auto-scroll to bottom                  | On first load, the view scrolls to the latest message.                                                                                                     |           |
| 6.2.7  | New message auto-scroll                | When a new message arrives (via polling) and the user was at the bottom, it scrolls to the new message. If user had scrolled up, it does not force scroll. |           |
| 6.2.8  | Message with attachments               | Messages with attachments display attachment cards below the body: filename, size in human-readable format, download icon.                                 |           |
| 6.2.9  | URL detection in message body          | URLs in message text are rendered as clickable links with `target="_blank"` and `rel="noopener noreferrer"`.                                               |           |
| 6.2.10 | Line breaks in messages                | Newlines in message body are preserved via `whitespace-pre-wrap`.                                                                                          |           |

### 6.3 Reply Composer

| #     | What to Check                             | Expected Result                                                                                                      | Pass/Fail |
| ----- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.3.1 | Reply area visible                        | At the bottom of the thread view, a reply composer area is visible with a textarea and a Send button.                |           |
| 6.3.2 | Send button disabled when empty           | The Send button is disabled when the textarea is empty or whitespace-only.                                           |           |
| 6.3.3 | Type a reply and click Send               | `POST /api/v1/inbox/conversations/{id}/messages` fires with `{ body, attachments: [], extra_channels: [] }`.         |           |
| 6.3.4 | Successful reply                          | The textarea clears. The new message appears at the bottom of the message list. The view scrolls to the new message. |           |
| 6.3.5 | Keyboard shortcut: Cmd+Enter / Ctrl+Enter | Pressing Cmd+Enter (macOS) or Ctrl+Enter (Windows/Linux) in the reply textarea sends the message.                    |           |
| 6.3.6 | Loading state during send                 | While the reply is sending, the Send button shows a loading indicator and is disabled to prevent double-submit.      |           |

### 6.4 Polling

| #     | What to Check                  | Expected Result                                                                                                                             | Pass/Fail |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.4.1 | Thread polling interval        | `GET /api/v1/inbox/conversations/{id}` is called every 30 seconds while the thread is open. Verify in the Network tab.                      |           |
| 6.4.2 | Polling refresh of inbox state | Opening a thread triggers `refreshPolling()` to update the morph bar unread badge immediately (thread view marks the conversation as read). |           |

---

## 7. Thread View -- Frozen & No-Reply

### 7.1 Frozen Conversation

| #     | What to Check                                 | Expected Result                                                                                                                                      | Pass/Fail |
| ----- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1.1 | Frozen thread -- composer disabled            | When a thread has `frozen_at` set (frozen by admin), the reply composer shows a disabled state with a message explaining the conversation is frozen. |           |
| 7.1.2 | Frozen thread -- tooltip on disabled composer | A tooltip or inline text from `inbox.thread.composer.disabled.frozen` explains why the composer is disabled.                                         |           |
| 7.1.3 | Frozen thread -- no freeze/unfreeze controls  | The parent does NOT see freeze/unfreeze buttons. Only admin oversight has these controls.                                                            |           |
| 7.1.4 | Frozen thread -- messages still readable      | All existing messages in a frozen thread are still visible and scrollable. Only sending new replies is blocked.                                      |           |

### 7.2 Broadcast with No Replies

| #     | What to Check                  | Expected Result                                                                                                   | Pass/Fail |
| ----- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 7.2.1 | No-reply broadcast thread      | When viewing a broadcast thread where `allow_replies` is `false`, the reply composer is disabled.                 |           |
| 7.2.2 | No-reply reason text           | A message from `inbox.thread.composer.disabled.no_reply` explains that replies are not allowed on this broadcast. |           |
| 7.2.3 | Broadcast with replies allowed | When `allow_replies` is `true`, the reply composer is enabled and the parent can reply normally.                  |           |

---

## 8. Thread Messages -- No Read Receipts & Deleted Masking

### 8.1 Read Receipts (Parent Does NOT See)

| #     | What to Check                             | Expected Result                                                                                                                                                                                               | Pass/Fail |
| ----- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1.1 | Own messages -- no read receipt indicator | For messages sent by the parent, there is NO "Read by X of Y" text or popover below the timestamp. The `read_state` field is `null` for parent users.                                                         |           |
| 8.1.2 | API response check                        | Inspect the `GET /api/v1/inbox/conversations/{id}` response. For each message where `sender_user_id` matches the parent's ID, `read_state` should be `null` (the backend does not populate it for non-staff). |           |
| 8.1.3 | No Popover trigger on own messages        | There is no clickable "Read by..." link below the parent's own messages. Only the timestamp (and optionally "edited" label) appears.                                                                          |           |

### 8.2 Deleted Message Masking

| #     | What to Check                  | Expected Result                                                                                                                                                                                    | Pass/Fail |
| ----- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.2.1 | Deleted message display        | When a message has `deleted_at` set and body is `[message deleted]`, it renders as a centred italic text from `inbox.message.deleted` translation key. It does NOT show the original message body. |           |
| 8.2.2 | Deleted message styling        | The deleted message line is centred, uses `text-xs italic` styling with tertiary text colour. No bubble, no sender meta, no timestamp shown alongside it.                                          |           |
| 8.2.3 | Non-deleted message unaffected | Normal messages (with `deleted_at === null`) render normally with body, bubble, sender, timestamp.                                                                                                 |           |

### 8.3 Edited Messages

| #     | What to Check       | Expected Result                                                                                                               | Pass/Fail |
| ----- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.3.1 | Edited indicator    | If a message has `edited_at` set (non-null), the text "(edited)" (from `inbox.message.edited`) appears next to the timestamp. |           |
| 8.3.2 | Non-edited messages | Messages without `edited_at` do not show any edited indicator.                                                                |           |

---

## 9. Inbox Search

**URL:** `/en/inbox/search?q={query}`

| #   | What to Check                  | Expected Result                                                                                                                  | Pass/Fail |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1 | Navigate to search via sidebar | Type a query in the sidebar search input and press Enter. URL changes to `/en/inbox/search?q={query}`.                           |           |
| 9.2 | Search results page layout     | The page shows a search form at the top (pre-filled with the query) and a list of matching threads/messages below.               |           |
| 9.3 | Search results rendering       | Each result shows the thread subject, a snippet of the matching message with highlighted terms, participant info, and timestamp. |           |
| 9.4 | Empty search results           | If no messages match the query, an appropriate empty state message is displayed.                                                 |           |
| 9.5 | Click a search result          | Navigates to `/en/inbox/threads/{id}`. The thread view loads with the conversation detail.                                       |           |
| 9.6 | Search scoping                 | Results only include conversations where the parent is a participant. No other users' private conversations appear.              |           |
| 9.7 | New search from results page   | Changing the query in the search form and pressing Enter reloads results with the new query.                                     |           |
| 9.8 | API call                       | `GET /api/v1/inbox/search?q={query}` fires. Returns 200 with results scoped to the parent user.                                  |           |
| 9.9 | Mobile back button             | On mobile, the sidebar-shell layout applies to search. A back navigation returns to the sidebar.                                 |           |

---

## 10. Announcements Feed (/announcements)

**URL:** `/en/announcements`
**API:** `GET /api/v1/announcements/my`
**Permission:** `parent.view_announcements`

### 10.1 Page Load

| #      | What to Check                   | Expected Result                                                                                                                                          | Pass/Fail |
| ------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1.1 | Navigate to `/en/announcements` | The page loads without errors. A `PageHeader` with title and description is visible.                                                                     |           |
| 10.1.2 | Loading state                   | While `GET /api/v1/announcements/my` is in flight, skeleton placeholders appear: one for the header (h-10 w-48) and three card placeholders (h-28 each). |           |
| 10.1.3 | API call                        | `GET /api/v1/announcements/my` fires on mount. Returns 200 with `{ data: Announcement[] }`.                                                              |           |

### 10.2 Announcement Cards

| #      | What to Check          | Expected Result                                                                                                                                            | Pass/Fail |
| ------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.2.1 | Card structure         | Each announcement renders as an `<article>` with rounded border, padding, and shadow. Contains: title (h2), published date, body preview, and author name. |           |
| 10.2.2 | Title display          | The announcement title appears as a base-size semibold heading.                                                                                            |           |
| 10.2.3 | Date display           | The `published_at` date renders in the locale's date format, positioned at the end of the title row.                                                       |           |
| 10.2.4 | Body preview           | The announcement body is truncated to 200 characters with an ellipsis if longer.                                                                           |           |
| 10.2.5 | Author line            | Below the body, a line reads "Published by {author_name}" (using translation keys `announcements.publishedAt` and `announcements.by`).                     |           |
| 10.2.6 | Multiple announcements | If multiple announcements exist, they render in a vertical stack with `space-y-4` gap.                                                                     |           |

### 10.3 Empty State

| #      | What to Check    | Expected Result                                                                                                                                                                                       | Pass/Fail |
| ------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.3.1 | No announcements | If the API returns an empty array, an `EmptyState` component renders with a **Megaphone** icon, title from `announcements.noAnnouncements`, and description from `announcements.noAnnouncementsDesc`. |           |
| 10.3.2 | Error fallback   | If the API call fails, the error is logged to the console (`[AnnouncementsPage]`) and the announcements array is set to empty, showing the empty state. No crash.                                     |           |

### 10.4 Announcements vs Admin Announcements

| #      | What to Check                            | Expected Result                                                                                                                                        | Pass/Fail |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 10.4.1 | Parent sees only published announcements | The `/announcements` page shows only announcements that have been published (non-draft, non-archived). Draft announcements are not visible to parents. |           |
| 10.4.2 | No create/edit/archive controls          | The parent does NOT see any "New Announcement" button, edit button, or archive button on the announcements page. It is a read-only feed.               |           |
| 10.4.3 | Scoping to parent                        | Announcements shown are scoped to the parent's audience (e.g., "All parents", or grade-specific if the announcement targeted specific audiences).      |           |

---

## 11. Inquiries List (/inquiries)

**URL:** `/en/inquiries`
**API:** `GET /api/v1/inquiries/my`

### 11.1 Page Load

| #      | What to Check               | Expected Result                                                                                                                  | Pass/Fail |
| ------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1.1 | Navigate to `/en/inquiries` | The page loads. A `PageHeader` shows the title (from `communications.inquiry.title`) and a "New Inquiry" button.                 |           |
| 11.1.2 | Loading state               | While `GET /api/v1/inquiries/my` is in flight, skeleton placeholders appear: header (h-10 w-56) and three card skeletons (h-20). |           |
| 11.1.3 | API call                    | `GET /api/v1/inquiries/my` fires on mount. Returns 200 with `{ data: MyInquiry[] }`.                                             |           |

### 11.2 Inquiry Cards

| #      | What to Check         | Expected Result                                                                                                                                                            | Pass/Fail |
| ------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.2.1 | Card structure        | Each inquiry is a `<button>` (full-width, clickable) with rounded border, padding, shadow. Contains: subject, status badge, last message preview, date, and message count. |           |
| 11.2.2 | Subject display       | The inquiry subject appears as a truncated font-medium text.                                                                                                               |           |
| 11.2.3 | Status badge          | A `StatusBadge` with dot displays the inquiry status: "Open" (green/success), "In Progress" (amber/warning), "Closed" (neutral).                                           |           |
| 11.2.4 | Last message preview  | If `last_message_preview` exists, it shows as truncated secondary text below the subject row.                                                                              |           |
| 11.2.5 | Date display          | Shows `last_message_at` (or `created_at` if no messages) in locale date format, aligned to the end.                                                                        |           |
| 11.2.6 | Message count badge   | If `message_count > 0`, a pill badge (primary-100 bg, primary-700 text) shows the count.                                                                                   |           |
| 11.2.7 | Click an inquiry card | Navigates to `/en/inquiries/{id}`. The inquiry detail page loads.                                                                                                          |           |
| 11.2.8 | Hover state           | On hover, the card background changes to `surface-secondary`.                                                                                                              |           |

### 11.3 Empty State

| #      | What to Check                   | Expected Result                                                                                                                                                                                                   | Pass/Fail |
| ------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.3.1 | No inquiries                    | If the API returns empty, an `EmptyState` with **MessageCircle** icon, title from `communications.noInquiriesYet`, and a description is shown. An action button labelled "New Inquiry" links to `/inquiries/new`. |           |
| 11.3.2 | Click empty-state action button | Navigates to `/en/inquiries/new`.                                                                                                                                                                                 |           |

### 11.4 "New Inquiry" Button

| #      | What to Check              | Expected Result                                                                                                       | Pass/Fail |
| ------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.4.1 | Button in page header      | A `<Button>` with a **Plus** icon and text from `communications.inquiry.newInquiry` is visible in the header actions. |           |
| 11.4.2 | Click "New Inquiry" button | Navigates to `/inquiries/new`. The new inquiry form loads.                                                            |           |

---

## 12. New Inquiry Form (/inquiries/new)

**URL:** `/en/inquiries/new`
**API:** `POST /api/v1/inquiries` and `GET /api/v1/dashboard/parent`

### 12.1 Page Load

| #      | What to Check                   | Expected Result                                                                                                        | Pass/Fail |
| ------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1.1 | Navigate to `/en/inquiries/new` | The page loads with a `PageHeader` showing title from `communications.inquiry.newInquiry` and a Back button.           |           |
| 12.1.2 | Back button                     | A ghost Button with **ArrowLeft** icon (with `rtl:rotate-180`) and "Back" text. Clicking it goes to the previous page. |           |
| 12.1.3 | Linked students API call        | `GET /api/v1/dashboard/parent` fires on mount to fetch the parent's linked students for the student selector dropdown. |           |

### 12.2 Form Fields

| #      | What to Check                         | Expected Result                                                                                                                                                                                                                              | Pass/Fail |
| ------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.2.1 | Subject field                         | A `<Label>` (from `communications.inquiry.subjectLabel`) and `<Input>` with `id="subject"`, placeholder from `communications.inquiry.subjectPlaceholder`, `maxLength=200`, `required`.                                                       |           |
| 12.2.2 | Message field                         | A `<Label>` (from `communications.inquiry.messageLabel`) and `<Textarea>` with `id="message"`, placeholder from `communications.inquiry.messagePlaceholder`, 6 rows, `required`.                                                             |           |
| 12.2.3 | Student selector dropdown             | A `<Label>` (from `communications.inquiry.studentLabel`) and a `<Select>` dropdown. The dropdown has a "None" option (from `communications.inquiry.noStudent`) and one `<SelectItem>` per linked student showing `{first_name} {last_name}`. |           |
| 12.2.4 | Student selector loading state        | While the parent dashboard API is in flight, the student selector area shows "Loading..." text instead of the dropdown.                                                                                                                      |           |
| 12.2.5 | Student selector with linked students | If the parent has linked students, they appear as selectable items in the dropdown.                                                                                                                                                          |           |
| 12.2.6 | Student selector is optional          | The student selector can be left on "None". The `student_id` is only included in the payload if a student is selected.                                                                                                                       |           |

### 12.3 Validation & Submit

| #       | What to Check                                  | Expected Result                                                                                                         | Pass/Fail |
| ------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.3.1  | Submit button disabled: empty subject          | With empty subject, the Submit button is disabled regardless of message content.                                        |           |
| 12.3.2  | Submit button disabled: empty message          | With filled subject but empty message, the Submit button is disabled.                                                   |           |
| 12.3.3  | Submit button enabled                          | With both subject and message filled (trimmed non-empty), the Submit button is enabled.                                 |           |
| 12.3.4  | Submit with subject and message only           | `POST /api/v1/inquiries` fires with `{ subject: "...", message: "..." }`. No `student_id` in payload.                   |           |
| 12.3.5  | Submit with student selected                   | `POST /api/v1/inquiries` fires with `{ subject: "...", message: "...", student_id: "uuid" }`.                           |           |
| 12.3.6  | Successful submission                          | Success toast from `communications.inquiry.submitSuccess`. Router navigates to `/inquiries/{new_id}`.                   |           |
| 12.3.7  | API error on submission                        | Error toast from `communications.inquiry.submitError`. Error logged to console. Form remains open with data intact.     |           |
| 12.3.8  | Loading state during submit                    | The Submit button text changes to "Loading..." and is disabled during submission. The Cancel button remains functional. |           |
| 12.3.9  | Cancel button                                  | A ghost "Cancel" button that calls `router.back()`. Clicking it navigates away without submitting.                      |           |
| 12.3.10 | Empty subject + click submit (HTML validation) | The browser's native `required` validation triggers on the subject field, preventing form submission.                   |           |
| 12.3.11 | Toast on empty fields (programmatic)           | If the user somehow bypasses HTML validation, the handler shows `toast.error('Subject and message are required')`.      |           |

---

## 13. Inquiry Detail & Reply (/inquiries/[id])

**URL:** `/en/inquiries/[id]`
**API:** `GET /api/v1/inquiries/{id}/parent` and `POST /api/v1/inquiries/{id}/messages/parent`

### 13.1 Page Load

| #      | What to Check                    | Expected Result                                                                                                               | Pass/Fail |
| ------ | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1.1 | Navigate to `/en/inquiries/{id}` | Page loads with a `PageHeader` showing the inquiry subject as title and a Back button.                                        |           |
| 13.1.2 | Loading state                    | While the API is in flight, skeleton placeholders appear: header (h-8 w-48) and thread area (h-96).                           |           |
| 13.1.3 | API call                         | `GET /api/v1/inquiries/{id}/parent` fires on mount. Returns `{ data: InquiryDetail }`.                                        |           |
| 13.1.4 | Not found state                  | If the API fails or returns no data, a Back button and a "not found" message (from `communications.inquiry.notFound`) appear. |           |

### 13.2 Inquiry Header

| #      | What to Check | Expected Result                                                                                      | Pass/Fail |
| ------ | ------------- | ---------------------------------------------------------------------------------------------------- | --------- |
| 13.2.1 | Status badge  | A `StatusBadge` with dot displays: "Open" (success), "In Progress" (warning), or "Closed" (neutral). |           |
| 13.2.2 | Created date  | Text shows "Opened {date}" in locale format.                                                         |           |
| 13.2.3 | Back button   | A ghost Button with ArrowLeft icon (with `rtl:rotate-180`). Clicking goes to the previous page.      |           |

### 13.3 Message Thread

| #      | What to Check                            | Expected Result                                                                                                                           | Pass/Fail |
| ------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.3.1 | Thread container                         | A rounded bordered card with internal scrollable message area (min-h 320px, max-h 560px).                                                 |           |
| 13.3.2 | Parent messages (author_type = "parent") | Align to the start side. Background: `surface-secondary`. Label shows "You".                                                              |           |
| 13.3.3 | Admin messages (author_type = "admin")   | Align to the end side. Background: `primary-600` with white text. Label shows "School Admin" (from `communications.inquiry.schoolAdmin`). |           |
| 13.3.4 | Empty messages                           | If no messages exist, a centred "No messages yet" placeholder appears.                                                                    |           |
| 13.3.5 | Auto-scroll                              | When messages load or change, the view scrolls to the bottom (`messagesEndRef`).                                                          |           |
| 13.3.6 | Timestamp                                | Each message shows a formatted `created_at` datetime below the bubble.                                                                    |           |

### 13.4 Reply Area

| #      | What to Check                             | Expected Result                                                                                                                                        | Pass/Fail |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 13.4.1 | Reply area (open/in-progress inquiry)     | A `<Textarea>` with placeholder from `communications.inquiry.replyPlaceholder` and a Send button with **Send** icon.                                   |           |
| 13.4.2 | Reply area (closed inquiry)               | The textarea and Send button are replaced by a centred notice from `communications.inquiry.closedNotice`. The parent CANNOT reply to a closed inquiry. |           |
| 13.4.3 | Send button disabled when empty           | The Send button is disabled when the textarea is empty or whitespace-only.                                                                             |           |
| 13.4.4 | Send reply                                | `POST /api/v1/inquiries/{id}/messages/parent` fires with `{ message: "..." }`.                                                                         |           |
| 13.4.5 | Successful reply                          | Success toast from `communications.inquiry.replySuccess`. Textarea clears. Thread re-fetches and new message appears.                                  |           |
| 13.4.6 | Reply error                               | Error toast from `communications.inquiry.replyError`. Error logged.                                                                                    |           |
| 13.4.7 | Keyboard shortcut: Cmd+Enter / Ctrl+Enter | Pressing Cmd+Enter or Ctrl+Enter in the reply textarea triggers `handleSendReply`.                                                                     |           |
| 13.4.8 | Loading state during send                 | The Send button is disabled during submission to prevent double-submit.                                                                                |           |

### 13.5 Parent Cannot Close Inquiry

| #      | What to Check      | Expected Result                                                                                                                 | Pass/Fail |
| ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.5.1 | No close button    | There is NO "Close Inquiry" button or status-change control on the parent inquiry detail page. Only admins can close inquiries. |           |
| 13.5.2 | No status dropdown | The status badge is display-only. There is no dropdown or action to change the inquiry status.                                  |           |

---

## 14. Profile Communication Preferences

**URL:** `/en/profile/communication`
**API:** `GET /api/v1/me/preferences` and `PATCH /api/v1/me/preferences`

| #     | What to Check                           | Expected Result                                                                                                                                                         | Pass/Fail |
| ----- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.1  | Navigate to `/en/profile/communication` | The page loads. A heading from `communication.title` is visible. Below it, a card section with channel preferences and language selector.                               |           |
| 14.2  | Loading state                           | While preferences load, a "Loading..." text appears.                                                                                                                    |           |
| 14.3  | API call on mount                       | `GET /api/v1/me/preferences` fires. The response contains `data.communication` with `email`, `sms`, `push`, and `preferred_language` fields.                            |           |
| 14.4  | Email checkbox                          | A Checkbox with `id="comm-email"`, label from `communication.email`, and description from `communication.emailDescription`. Checked/unchecked matches the API response. |           |
| 14.5  | SMS checkbox                            | A Checkbox with `id="comm-sms"`, label from `communication.sms`, and description from `communication.smsDescription`.                                                   |           |
| 14.6  | Push checkbox                           | A Checkbox with `id="comm-push"`, label from `communication.push`, and description from `communication.pushDescription`.                                                |           |
| 14.7  | Toggle a checkbox                       | Clicking a checkbox toggles its state locally. The change is not saved until the Save button is clicked.                                                                |           |
| 14.8  | Preferred language selector             | A `<Select>` with `id="comm-language"` offering two options: English and Arabic. Width is `w-48`.                                                                       |           |
| 14.9  | Change preferred language               | Selecting Arabic changes the local state. Not saved until Save is clicked.                                                                                              |           |
| 14.10 | Save button                             | A primary `<Button>` at the bottom-end of the card. Label from `communication.save`.                                                                                    |           |
| 14.11 | Click Save                              | `PATCH /api/v1/me/preferences` fires with `{ communication: { email, sms, push, preferred_language } }`.                                                                |           |
| 14.12 | Successful save                         | A green success message from `communication.saveSuccess` appears below the form.                                                                                        |           |
| 14.13 | Save error                              | A red error message from `communication.saveError` appears. Error logged to console.                                                                                    |           |
| 14.14 | Saving state                            | While saving, the button text changes to `communication.saving` and the button is disabled.                                                                             |           |
| 14.15 | Default values                          | If the API returns no communication preferences, defaults apply: email=true, sms=false, push=false, preferred_language="en".                                            |           |

---

## 15. Mute & Archive

| #    | What to Check                              | Expected Result                                                                                                                                                                                                             | Pass/Fail |
| ---- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.1 | Mute a conversation                        | The parent can mute a conversation via the thread view or context action. `PATCH /api/v1/inbox/conversations/{id}/mute` fires with `{ muted: true }`. After muting, the thread shows a muted indicator (`muted_at` is set). |           |
| 15.2 | Unmute a conversation                      | The parent can unmute a previously muted conversation. `PATCH /api/v1/inbox/conversations/{id}/mute` fires with `{ muted: false }`. The muted indicator disappears.                                                         |           |
| 15.3 | Archive a conversation                     | The parent can archive a conversation. `PATCH /api/v1/inbox/conversations/{id}/archive` fires with `{ archived: true }`. The thread moves out of the main list and into the "Archived" filter.                              |           |
| 15.4 | Unarchive a conversation                   | While viewing archived threads (Archived filter), the parent can unarchive. `PATCH /api/v1/inbox/conversations/{id}/archive` fires with `{ archived: false }`. The thread returns to the main list.                         |           |
| 15.5 | Muted thread -- notifications              | A muted thread should not trigger push/email notifications for the parent (backend behaviour, not directly testable in UI except by the muted indicator presence).                                                          |           |
| 15.6 | Archive filter shows archived threads only | When the "Archived" filter chip is active, only archived conversations appear. No active conversations are mixed in.                                                                                                        |           |

---

## 16. Relational Scope Enforcement

### 16.1 PeoplePicker Scope

| #      | What to Check                                    | Expected Result                                                                                                                                      | Pass/Fail |
| ------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1.1 | Search for a teacher of parent's child           | Open compose, Direct tab. Type the name of a teacher who teaches the parent's child (e.g., Sarah Daly). The teacher appears in PeoplePicker results. |           |
| 16.1.2 | Search for a teacher NOT teaching parent's child | Type the name of a teacher who does NOT teach any of the parent's children. The teacher does NOT appear in PeoplePicker results.                     |           |
| 16.1.3 | Search for admin-tier staff                      | Type the name of an admin, principal, or school owner. They appear in PeoplePicker results (admin-tier is always reachable by parents).              |           |
| 16.1.4 | Search for office/finance/nurse staff            | Type the name of a staff member with office, finance, or nurse role. They appear in PeoplePicker results (always reachable).                         |           |
| 16.1.5 | Search for another parent (toggle OFF)           | If the tenant has `parent_to_parent` messaging disabled, searching for another parent returns no results.                                            |           |
| 16.1.6 | Search for another parent (toggle ON)            | If the tenant has `parent_to_parent` messaging enabled, other parents appear in PeoplePicker results.                                                |           |

### 16.2 API-Level Scope Enforcement

| #      | What to Check                               | Expected Result                                                                                                                                                                     | Pass/Fail |
| ------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.2.1 | People search API                           | `GET /api/v1/inbox/people-search?q={name}` returns only users within the parent's relational scope. Verify no out-of-scope users are returned.                                      |           |
| 16.2.2 | Send direct message to out-of-scope teacher | Attempt (via API or by manipulating the payload) to send a direct message to a teacher not in scope. The API returns a policy denial error (e.g., 403 or error with relevant code). |           |
| 16.2.3 | Send message to admin-tier                  | Sending a direct message to an admin-tier user succeeds (always in scope).                                                                                                          |           |

---

## 17. Cross-Account: Admin Broadcast -> Parent

**Requires two accounts:** Admin (owner@nhqs.test) and Parent (parent@nhqs.test).

| #    | What to Check                                   | Expected Result                                                                                                                                                    | Pass/Fail |
| ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 17.1 | Admin sends broadcast to "All parents"          | Log in as admin (Yusuf Rahman). Navigate to `/en/communications/new`. Create and publish an announcement targeted at all parents.                                  |           |
| 17.2 | Parent sees announcement in `/en/announcements` | Log in as parent (Zainab Ali). Navigate to `/en/announcements`. The newly published announcement appears in the list with correct title, body preview, and author. |           |
| 17.3 | Admin sends inbox broadcast to parent audience  | As admin, open Inbox compose dialog. Select Broadcast tab. Choose an audience that includes parents. Send the broadcast.                                           |           |
| 17.4 | Parent sees broadcast in inbox                  | As parent, navigate to `/en/inbox`. The broadcast thread appears in the thread list with a Megaphone icon.                                                         |           |
| 17.5 | Parent opens broadcast thread                   | Click the broadcast thread. The message body, subject, and sender info are correct.                                                                                |           |
| 17.6 | Parent can reply if allowed                     | If the broadcast was sent with `allow_replies=true`, the reply composer is enabled. Parent can send a reply.                                                       |           |
| 17.7 | Parent cannot reply if disallowed               | If the broadcast was sent with `allow_replies=false`, the reply composer is disabled with the "no reply" reason text.                                              |           |

---

## 18. Cross-Account: Parent Inquiry Flow

**Requires two accounts:** Admin (owner@nhqs.test) and Parent (parent@nhqs.test).

| #    | What to Check               | Expected Result                                                                                                                                                 | Pass/Fail |
| ---- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 18.1 | Parent creates inquiry      | As parent, navigate to `/en/inquiries/new`. Fill subject and message. Optionally select a linked student. Submit.                                               |           |
| 18.2 | Parent sees inquiry in list | Navigate to `/en/inquiries`. The new inquiry appears with "Open" status.                                                                                        |           |
| 18.3 | Admin sees inquiry          | Log in as admin. Navigate to `/en/communications/inquiries`. The parent's inquiry appears in the admin inquiries list.                                          |           |
| 18.4 | Admin replies to inquiry    | As admin, open the inquiry detail. Type and send a reply.                                                                                                       |           |
| 18.5 | Parent sees admin reply     | Log back in as parent. Navigate to `/en/inquiries/{id}`. The admin's reply appears in the message thread with "School Admin" label and primary-coloured bubble. |           |
| 18.6 | Parent replies back         | Type a reply in the detail page. Send it. The reply appears with "You" label.                                                                                   |           |
| 18.7 | Admin closes inquiry        | As admin, close the inquiry (status changes to "closed").                                                                                                       |           |
| 18.8 | Parent sees closed status   | As parent, navigate to `/en/inquiries/{id}`. The status badge shows "Closed" (neutral). The reply area shows the closed notice. Parent cannot reply.            |           |

---

## 19. Cross-Account: Parent -> Teacher Messaging

**Requires two accounts:** Parent (parent@nhqs.test) and Teacher (Sarah.daly@nhqs.test).

| #    | What to Check                                     | Expected Result                                                                                                                                          | Pass/Fail |
| ---- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 19.1 | Parent sends direct message to teacher (in scope) | As parent, open compose dialog. Direct tab. Search for "Sarah Daly" (a teacher of parent's child). Select her. Type a message. Send.                     |           |
| 19.2 | Message sends successfully                        | `POST /api/v1/inbox/conversations` returns 201. Success toast. Navigates to the new thread.                                                              |           |
| 19.3 | Teacher receives the message                      | Log in as teacher (Sarah Daly). Navigate to `/en/inbox`. The new direct message thread appears in the list.                                              |           |
| 19.4 | Teacher opens thread                              | Click the thread. The parent's message is visible with correct body.                                                                                     |           |
| 19.5 | Teacher replies                                   | Type and send a reply in the thread view.                                                                                                                |           |
| 19.6 | Parent sees teacher's reply                       | Log back in as parent. Open the thread. The teacher's reply appears with the teacher's name label.                                                       |           |
| 19.7 | Parent tries to message out-of-scope teacher      | Open compose. Search for a teacher who does NOT teach parent's child. The teacher does not appear in PeoplePicker results.                               |           |
| 19.8 | API denial for out-of-scope teacher               | If parent somehow crafts a `POST /api/v1/inbox/conversations` with an out-of-scope teacher's `recipient_user_id`, the API returns a policy denial error. |           |

---

## 20. Admin-Only Pages -- Negative Assertions

While logged in as **Zainab Ali** (parent), verify these admin-only affordances are NOT visible.

| #     | What to Check                          | Expected Result                                                                                                                              | Pass/Fail |
| ----- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.1  | Communications hub dashboard content   | The parent NEVER sees the stat cards (Inbox, Audiences, Announcements, Oversight) or settings tiles from the `/en/communications` dashboard. |           |
| 20.2  | Oversight navigation                   | No "Oversight" link, tab, or button is visible anywhere in the parent's navigation.                                                          |           |
| 20.3  | Audiences management link              | No "Audiences" link or button visible. No "Manage Audiences" or "Save as Audience" option.                                                   |           |
| 20.4  | Saved audiences link                   | No "Saved Audiences" navigation link in any sidebar or sub-strip.                                                                            |           |
| 20.5  | "New Announcement" button              | No button or link to create announcements. The `/en/announcements` page is read-only for parents.                                            |           |
| 20.6  | Announcement management actions        | No edit, archive, or publish controls on any announcement card in the parent feed.                                                           |           |
| 20.7  | Admin inquiries link                   | No link to `/en/communications/inquiries` (admin inquiries management). Parent only sees `/en/inquiries` (their own inquiries).              |           |
| 20.8  | Oversight banner in thread view        | No oversight-related banners, flag indicators, or audit info appear in any thread the parent views.                                          |           |
| 20.9  | Freeze/Unfreeze controls               | No freeze or unfreeze buttons on any conversation.                                                                                           |           |
| 20.10 | Flag review modal                      | No flag review modals or flag action buttons.                                                                                                |           |
| 20.11 | Settings navigation for communications | No settings links for messaging policy, safeguarding, fallback, or notifications visible to the parent.                                      |           |
| 20.12 | Read receipts on own messages          | No "Read by X of Y" link or popover on the parent's own sent messages (staff-only feature).                                                  |           |
| 20.13 | Close inquiry button                   | No "Close" or "Resolve" button on inquiry detail pages. Only admins can close inquiries.                                                     |           |

---

## 21. Route Blocking -- All Redirects

Navigate to each URL directly (paste into address bar) while logged in as **Zainab Ali** (parent).

| #     | Route                                      | Expected Result                                                                                                                                                                      | Pass/Fail |
| ----- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 21.1  | `/en/communications`                       | Redirects to `/en/inbox`. The `useIsAdmin()` check returns false. The parent never sees the hub content. During redirect, an empty container with `h-[50vh]` prevents content flash. |           |
| 21.2  | `/en/inbox/audiences`                      | Redirects to `/en/inbox`. The audiences page checks admin status and redirects non-admins.                                                                                           |           |
| 21.3  | `/en/inbox/audiences/new`                  | Redirects to `/en/inbox`.                                                                                                                                                            |           |
| 21.4  | `/en/inbox/audiences/{any-uuid}`           | Redirects to `/en/inbox`.                                                                                                                                                            |           |
| 21.5  | `/en/inbox/oversight`                      | Redirects to `/en/inbox`. The oversight page checks admin permission and redirects.                                                                                                  |           |
| 21.6  | `/en/inbox/oversight/threads/{any-uuid}`   | Redirects to `/en/inbox`.                                                                                                                                                            |           |
| 21.7  | `/en/communications/announcements`         | Redirects. Parent ends up at `/en/inbox` (via communications redirect chain).                                                                                                        |           |
| 21.8  | `/en/communications/new`                   | Redirects. Parent ends up at `/en/inbox`.                                                                                                                                            |           |
| 21.9  | `/en/communications/{any-uuid}`            | Redirects. Parent ends up at `/en/inbox`.                                                                                                                                            |           |
| 21.10 | `/en/communications/inquiries`             | Redirects. Parent ends up at `/en/inbox` (admin inquiries management is blocked).                                                                                                    |           |
| 21.11 | `/en/communications/inquiries/{any-uuid}`  | Redirects. Parent ends up at `/en/inbox`.                                                                                                                                            |           |
| 21.12 | `/en/settings/messaging-policy`            | Redirects or shows 403 page. Parent cannot access messaging policy settings.                                                                                                         |           |
| 21.13 | `/en/settings/communications/safeguarding` | Redirects or shows 403 page. Parent cannot access safeguarding settings.                                                                                                             |           |
| 21.14 | `/en/settings/communications/fallback`     | Redirects or shows 403 page. Parent cannot access fallback settings.                                                                                                                 |           |
| 21.15 | `/en/settings/notifications`               | Redirects or shows 403 page. Parent cannot access notification settings.                                                                                                             |           |
| 21.16 | No flash of admin content                  | During any redirect, the parent must NOT see a brief flash of admin-only content (stat cards, settings tiles, oversight data).                                                       |           |
| 21.17 | `/en/inquiries` (valid parent page)        | Loads normally. No redirect. The inquiries list page renders.                                                                                                                        |           |
| 21.18 | `/en/inquiries/new` (valid parent page)    | Loads normally. No redirect. The new inquiry form renders.                                                                                                                           |           |
| 21.19 | `/en/announcements` (valid parent page)    | Loads normally. No redirect. The announcements feed renders.                                                                                                                         |           |

---

## 22. Arabic / RTL

**Setup:** Switch to Arabic locale (`/ar/inbox`, `/ar/announcements`, `/ar/inquiries`).

### 22.1 Inbox RTL

| #      | What to Check                       | Expected Result                                                                                                                | Pass/Fail |
| ------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 22.1.1 | Page direction                      | `<html>` has `dir="rtl"` and `lang="ar"`.                                                                                      |           |
| 22.1.2 | Sidebar position                    | Sidebar renders on the right side (start in RTL). Border is on the left/end side (`border-e` renders as `border-left` in RTL). |           |
| 22.1.3 | Thread list items                   | Kind icon on the right (start), text flows right-to-left, timestamp on the left (end). Unread dot at `start-1.5` (right side). |           |
| 22.1.4 | Compose dialog                      | Dialog text and inputs are right-aligned. Labels on the right. Tab bar flows right-to-left.                                    |           |
| 22.1.5 | PeoplePicker icon                   | Search icon at `start` (right in RTL). Input padding is start-padded.                                                          |           |
| 22.1.6 | Message alignment                   | Own messages align to end (left in RTL). Others' messages align to start (right in RTL).                                       |           |
| 22.1.7 | Filter chips direction              | Chips flow right-to-left due to RTL.                                                                                           |           |
| 22.1.8 | Back button in thread view (mobile) | ArrowLeft icon should visually point right in RTL context.                                                                     |           |
| 22.1.9 | Selected thread accent bar          | The 3px accent bar appears on the start side (right in RTL).                                                                   |           |

### 22.2 Announcements RTL

| #      | What to Check                         | Expected Result                                                  | Pass/Fail |
| ------ | ------------------------------------- | ---------------------------------------------------------------- | --------- |
| 22.2.1 | Page direction at `/ar/announcements` | `<html>` has `dir="rtl"`. All text flows right-to-left.          |           |
| 22.2.2 | Announcement card layout              | Title on the right, date on the left. Author line right-aligned. |           |
| 22.2.3 | Empty state alignment                 | EmptyState icon and text are centred.                            |           |

### 22.3 Inquiries RTL

| #      | What to Check                           | Expected Result                                                                                                | Pass/Fail |
| ------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------- |
| 22.3.1 | Page direction at `/ar/inquiries`       | `<html>` has `dir="rtl"`. All text flows right-to-left.                                                        |           |
| 22.3.2 | Inquiry card layout                     | Subject on the right, date/badge on the left.                                                                  |           |
| 22.3.3 | New inquiry form at `/ar/inquiries/new` | Labels on the right, inputs expand full width, Back button ArrowLeft icon rotated 180deg via `rtl:rotate-180`. |           |
| 22.3.4 | Inquiry detail messages                 | Parent messages on the start side (right in RTL). Admin messages on end side (left in RTL).                    |           |
| 22.3.5 | Send button position                    | Send button at the end (left in RTL) of the reply area.                                                        |           |

### 22.4 Communication Preferences RTL

| #      | What to Check                                 | Expected Result                                      | Pass/Fail |
| ------ | --------------------------------------------- | ---------------------------------------------------- | --------- |
| 22.4.1 | Page direction at `/ar/profile/communication` | `<html>` has `dir="rtl"`.                            |           |
| 22.4.2 | Checkbox position                             | Checkboxes render on the right side of their labels. |           |
| 22.4.3 | Language selector                             | Dropdown aligns correctly.                           |           |
| 22.4.4 | Save button                                   | Positioned at the end (left in RTL).                 |           |

### 22.5 General RTL Rules

| #      | What to Check                   | Expected Result                                                                                                                                                                                                                            | Pass/Fail |
| ------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 22.5.1 | Western numerals                | All numbers (unread counts, timestamps, file sizes, message counts, dates) use Western numerals (0-9), NOT Arabic-Indic numerals, in both locales.                                                                                         |           |
| 22.5.2 | Gregorian calendar              | All dates use the Gregorian calendar, not Hijri, in both locales.                                                                                                                                                                          |           |
| 22.5.3 | LTR enforcement                 | Email addresses, URLs, phone numbers, and numeric inputs render with LTR direction where needed.                                                                                                                                           |           |
| 22.5.4 | No physical directional classes | Inspect rendered HTML. No `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l-`, `rounded-r-`, `border-l-`, `border-r-` classes. Only logical equivalents (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`). |           |
| 22.5.5 | Translation completeness        | All visible text on parent-accessible pages uses translation keys. No hardcoded English strings in the Arabic locale.                                                                                                                      |           |
| 22.5.6 | Tooltip alignment               | Tooltips and popovers render with correct alignment in RTL.                                                                                                                                                                                |           |

---

## 23. Data Invariants (run after each major flow)

UI-only checks are blind to silent data corruption. Run these SQL (or API-read) assertions after each parent flow.

> **Setup:** `SET app.current_tenant_id = '<nhqs_tenant_uuid>';` first so RLS applies.

### 23.1 Parent-initiated conversation invariants

| #      | What to assert                                                                                                                  | Expected query result                                                                                                             | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 23.1.1 | After Zainab composes a direct message to Sarah (in-scope teacher): `conversations` row exists, `created_by_user_id = <zainab>` | `SELECT id FROM conversations WHERE created_by_user_id = '<zainab>' AND kind = 'direct' ORDER BY created_at DESC LIMIT 1` matches |           |
| 23.1.2 | Zainab's participant row has `role_at_join = 'parent'`                                                                          | `SELECT role_at_join FROM conversation_participants WHERE user_id = '<zainab>' AND conversation_id = '<id>'` = `'parent'`         |           |
| 23.1.3 | Zainab composes to out-of-scope teacher → rejected (RELATIONAL_SCOPE_DENIED), NO conversation created                           | No new row; API returns 403                                                                                                       |           |
| 23.1.4 | Zainab composes broadcast → rejected (BROADCAST_NOT_ALLOWED_FOR_ROLE); parents cannot broadcast                                 | API returns 403; UI error toast                                                                                                   |           |
| 23.1.5 | Zainab composes group — allowed only if `parents_can_initiate = true` AND participants include at least one staff               | Conversation created under both conditions; 403 otherwise                                                                         |           |
| 23.1.6 | Zainab composes to another parent when `parent_to_parent_messaging=false` → 403 `PARENT_TO_PARENT_DISABLED`                     | API returns 403                                                                                                                   |           |
| 23.1.7 | Zainab composes to another parent when `parent_to_parent_messaging=true` → success                                              | Conversation created                                                                                                              |           |

### 23.2 Message invariants

| #      | What to assert                                                                                         | Expected query result                                                                    | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------- |
| 23.2.1 | After Zainab sends a reply: `conversations.last_message_at = messages.created_at` (± 1s)               | Equal                                                                                    |           |
| 23.2.2 | Read receipts: Zainab's UI does NOT show other participants' `read_state` (staff-only feature)         | UI omits read-receipts chip; API still returns read data but UI hides it for parent role |           |
| 23.2.3 | Deleted message body: Zainab sees `[message deleted]`, DB retains original `body`                      | DB: `body` original, `deleted_at` set; UI renders placeholder                            |           |
| 23.2.4 | Edit/delete own message within `edit_window_minutes`: Zainab can edit her own message; backend accepts | `message_edits` row added                                                                |           |

### 23.3 Parent announcement feed

| #      | What to assert                                                                                   | Expected query result                                                                               | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | --------- |
| 23.3.1 | `GET /v1/announcements/my` returns ONLY announcements whose audience includes Zainab's household | Response `data[]` filtered to household + school scope; no announcements targeting other households |           |
| 23.3.2 | Announcements never cross tenants                                                                | `SELECT DISTINCT tenant_id FROM announcements WHERE id IN (<response_ids>)` = nhqs                  |           |
| 23.3.3 | Draft / scheduled / archived announcements are EXCLUDED                                          | Only `status = 'published'` in response                                                             |           |

### 23.4 Inquiry invariants

| #      | What to assert                                                                                                      | Expected query result                                   | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------- |
| 23.4.1 | After Zainab submits new inquiry: one `parent_inquiries` row, `status='open'`, `parent_id = <zainab_parent_id>`     | Row present                                             |           |
| 23.4.2 | First message row exists with `author_type='parent'`, `author_user_id = <zainab>`                                   | Row present                                             |           |
| 23.4.3 | Zainab replies: new message row with `author_type='parent'`                                                         | Row present                                             |           |
| 23.4.4 | Zainab CANNOT close her own inquiry — close endpoint returns 403 `PARENT_CANNOT_CLOSE_INQUIRY`                      | UI has no close button; API returns 403                 |           |
| 23.4.5 | When admin closes the inquiry: status becomes `'closed'`; Zainab's subsequent reply attempts → 409 `INQUIRY_CLOSED` | UI disables composer; API returns 409                   |           |
| 23.4.6 | `GET /v1/inquiries/my` returns only Zainab's inquiries (never other parents' from same tenant)                      | All returned rows have `parent_id = <zainab_parent_id>` |           |

### 23.5 Tenant isolation (cross-tenant)

| #      | What to assert                                                                         | Expected query result                                   | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------- |
| 23.5.1 | Zainab cannot access any `test-b` entity (conversation, announcement, inquiry) by UUID | All URL-hit attempts → 404                              |           |
| 23.5.2 | Parent announcement feed never leaks `test-b` announcements                            | All returned announcement IDs have `tenant_id = <nhqs>` |           |
| 23.5.3 | Parent inquiry list never leaks `test-b` inquiries                                     | All returned IDs have `tenant_id = <nhqs>`              |           |

### 23.6 Hostile-pair execution log

| #      | Assertion                                                                                    | Observed Result | Pass/Fail |
| ------ | -------------------------------------------------------------------------------------------- | --------------- | --------- |
| 23.6.1 | Direct URL to test-b conversation as Zainab                                                  |                 |           |
| 23.6.2 | `GET /api/v1/inbox/conversations/{test-b_id}` as Zainab                                      |                 |           |
| 23.6.3 | `GET /api/v1/announcements/my` as Zainab — contains no test-b data                           |                 |           |
| 23.6.4 | `GET /api/v1/inquiries/my` as Zainab — contains no test-b data or another nhqs parent's data |                 |           |
| 23.6.5 | Navigate to `/en/communications` as Zainab                                                   |                 |           |
| 23.6.6 | Navigate to `/en/inbox/oversight` as Zainab                                                  |                 |           |
| 23.6.7 | Navigate to `/en/inbox/audiences` as Zainab                                                  |                 |           |
| 23.6.8 | Navigate to `/en/communications/inquiries` (admin list) as Zainab                            |                 |           |

---

## 24. Backend Endpoint Map

### 23.1 Endpoints the Parent CAN Access

| Method | Path                                   | Permission Required         | Notes                                           |
| ------ | -------------------------------------- | --------------------------- | ----------------------------------------------- |
| GET    | `/v1/inbox/conversations`              | `inbox.read`                | List conversations with filter/pagination       |
| POST   | `/v1/inbox/conversations`              | `inbox.send`                | Create direct, group, or broadcast (if allowed) |
| GET    | `/v1/inbox/conversations/:id`          | `inbox.read`                | Get thread detail (also marks as read)          |
| POST   | `/v1/inbox/conversations/:id/messages` | `inbox.send`                | Send a reply message                            |
| POST   | `/v1/inbox/conversations/:id/read`     | `inbox.read`                | Mark single conversation as read                |
| POST   | `/v1/inbox/conversations/read-all`     | `inbox.read`                | Mark all conversations as read                  |
| PATCH  | `/v1/inbox/conversations/:id/mute`     | `inbox.read`                | Mute/unmute conversation                        |
| PATCH  | `/v1/inbox/conversations/:id/archive`  | `inbox.read`                | Archive/unarchive conversation                  |
| GET    | `/v1/inbox/state`                      | `inbox.read`                | Get unread total and latest message timestamp   |
| GET    | `/v1/inbox/search`                     | `inbox.read`                | Full-text search (user-scoped)                  |
| GET    | `/v1/inbox/people-search`              | `inbox.send`                | Search people within relational scope           |
| POST   | `/v1/inbox/attachments`                | `inbox.send`                | Upload attachment file                          |
| GET    | `/v1/announcements/my`                 | `parent.view_announcements` | Parent announcement feed                        |
| GET    | `/v1/inquiries/my`                     | auth (parent)               | List parent's own inquiries                     |
| POST   | `/v1/inquiries`                        | auth (parent)               | Create new inquiry                              |
| GET    | `/v1/inquiries/:id/parent`             | auth (parent)               | Get inquiry detail (parent view)                |
| POST   | `/v1/inquiries/:id/messages/parent`    | auth (parent)               | Reply to inquiry                                |
| GET    | `/v1/dashboard/parent`                 | auth (parent)               | Get linked students for inquiry form            |
| GET    | `/v1/me/preferences`                   | auth only                   | Get user preferences                            |
| PATCH  | `/v1/me/preferences`                   | auth only                   | Update user preferences                         |
| GET    | `/v1/notifications`                    | auth only                   | List notifications                              |
| GET    | `/v1/notifications/unread-count`       | auth only                   | Get notification unread count                   |
| PATCH  | `/v1/notifications/:id/read`           | auth only                   | Mark notification as read                       |
| POST   | `/v1/notifications/mark-all-read`      | auth only                   | Mark all notifications as read                  |

### 23.2 Endpoints the Parent CANNOT Access (403)

| Method                | Path                        | Permission Required                         | Parent Has?    |
| --------------------- | --------------------------- | ------------------------------------------- | -------------- |
| GET/PATCH             | `/v1/inbox/oversight/*`     | `inbox.oversight.*`                         | No             |
| GET/PATCH             | `/v1/inbox/settings/*`      | `inbox.settings.*`                          | No             |
| GET/POST/PATCH/DELETE | `/v1/announcements` (admin) | `communications.view/manage`                | No             |
| PATCH/DELETE          | `/v1/inbox/messages/:id`    | `inbox.send` (own only, within edit window) | See note below |

**Note on message edit/delete:** Parents have `inbox.send` but the edit/delete behaviour depends on whether the backend permits parent users to edit/delete their own messages. If the backend restricts this to staff roles, these endpoints return 403 for parents. Verify actual behaviour during testing.

### 23.3 Audience Endpoints (API vs UI)

| Method | Path                          | Permission Required | Parent Has? | UI Access?                              |
| ------ | ----------------------------- | ------------------- | ----------- | --------------------------------------- |
| GET    | `/v1/inbox/audiences`         | `inbox.send`        | Yes         | Blocked by `useIsAdmin()`               |
| POST   | `/v1/inbox/audiences`         | `inbox.send`        | Yes         | Not exposed in parent UI                |
| GET    | `/v1/inbox/audiences/:id`     | `inbox.send`        | Yes         | Blocked by `useIsAdmin()`               |
| POST   | `/v1/inbox/audiences/preview` | `inbox.send`        | Yes         | Used by compose dialog audience builder |

### 23.4 Inquiry Admin Endpoints (Parent Blocked)

| Method | Path                                       | Permission Required | Parent Has? |
| ------ | ------------------------------------------ | ------------------- | ----------- |
| GET    | `/v1/inquiries` (admin list)               | admin role          | No          |
| GET    | `/v1/inquiries/:id` (admin detail)         | admin role          | No          |
| PATCH  | `/v1/inquiries/:id` (close/update)         | admin role          | No          |
| POST   | `/v1/inquiries/:id/messages` (admin reply) | admin role          | No          |

---

## 25. Console & Network Health

| #     | What to Check                                | Expected Result                                                                                                                                                       | Pass/Fail |
| ----- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 24.1  | Console errors on `/en/inbox`                | Open DevTools Console. Navigate to `/en/inbox`. No red error messages related to inbox API calls, components, or React rendering.                                     |           |
| 24.2  | Console errors on thread view                | Open a thread. No console errors.                                                                                                                                     |           |
| 24.3  | Console errors on compose dialog             | Open and close the compose dialog. Switch tabs. No console errors.                                                                                                    |           |
| 24.4  | Console errors on search page                | Navigate to `/en/inbox/search?q=test`. No console errors.                                                                                                             |           |
| 24.5  | Console errors on announcements              | Navigate to `/en/announcements`. No console errors.                                                                                                                   |           |
| 24.6  | Console errors on inquiries list             | Navigate to `/en/inquiries`. No console errors.                                                                                                                       |           |
| 24.7  | Console errors on new inquiry                | Navigate to `/en/inquiries/new`. No console errors.                                                                                                                   |           |
| 24.8  | Console errors on inquiry detail             | Navigate to `/en/inquiries/{id}`. No console errors.                                                                                                                  |           |
| 24.9  | Console errors on communication preferences  | Navigate to `/en/profile/communication`. No console errors.                                                                                                           |           |
| 24.10 | Network: no 401 or 403 on normal flow        | During normal usage of all parent-accessible pages, no 401 or 403 responses. All API calls return 200/201.                                                            |           |
| 24.11 | Network: no 5xx errors                       | No server errors (500, 502, 503) during normal parent operations.                                                                                                     |           |
| 24.12 | Network: inbox polling                       | Verify `GET /api/v1/inbox/state` is called periodically (app-shell polling). `GET /api/v1/inbox/conversations/:id` is called every 30s when viewing a thread.         |           |
| 24.13 | Network: no duplicate API calls              | Thread list fetch does not fire twice on mount. Cancelled-flag pattern prevents duplicate state updates.                                                              |           |
| 24.14 | Network: redirect does not leak admin data   | When navigating to `/en/communications`, verify the page does NOT fetch admin-only data (oversight flags, admin announcement lists) before redirecting.               |           |
| 24.15 | Console warnings                             | No React key warnings, no missing translation key warnings, no deprecation warnings related to inbox or parent-accessible components.                                 |           |
| 24.16 | Announcements API: no admin endpoints called | On `/en/announcements`, only `GET /api/v1/announcements/my` is called. The admin `GET /api/v1/announcements` endpoint is NOT called.                                  |           |
| 24.17 | Inquiries API: correct parent endpoints      | On `/en/inquiries`, only `GET /api/v1/inquiries/my` is called. On detail, only `GET /api/v1/inquiries/{id}/parent` is called. Admin inquiry endpoints are NOT called. |           |

---

## 26. End of Spec

This specification covers the complete Communications module as experienced by a Parent role user. All 24 sections must pass for the module to be considered E2E-verified for the Parent view.

**Summary of test areas:**

| Area                     | Sections   | Focus                                                                            |
| ------------------------ | ---------- | -------------------------------------------------------------------------------- |
| Navigation & Layout      | 1, 2       | Landing, sidebar shell, desktop/mobile responsive                                |
| Compose Dialog           | 3, 4, 5    | Direct, group, broadcast tabs; validation; relational scope; parent restrictions |
| Thread View              | 6, 7       | Reading, reply, frozen, no-reply broadcast                                       |
| Message Rendering        | 8          | No read receipts, deleted masking, edited indicator                              |
| Search                   | 9          | Full-text search, scoping, results                                               |
| Announcements            | 10         | Read-only feed, cards, empty state, no admin controls                            |
| Inquiries                | 11, 12, 13 | List, create, detail, reply, closed state, no close button                       |
| Preferences              | 14         | Channel toggles, language, save                                                  |
| Mute & Archive           | 15         | Mute/unmute, archive/unarchive                                                   |
| Relational Scope         | 16         | PeoplePicker filtering, API denial, scope rules                                  |
| Cross-Account: Broadcast | 17         | Admin broadcast appears in parent feed and inbox                                 |
| Cross-Account: Inquiries | 18         | Full inquiry lifecycle between parent and admin                                  |
| Cross-Account: Messaging | 19         | Parent-teacher direct messaging within scope                                     |
| Negative Assertions      | 20, 21     | Admin-only UI hidden, route blocking, no content flash                           |
| Arabic / RTL             | 22         | Direction, alignment, logical properties, numerals, translations                 |
| Backend Map              | 23         | Complete endpoint reference with permissions                                     |
| Health Checks            | 24         | Console, network, polling, no leaks                                              |

**Total individual test assertions: ~260+**
