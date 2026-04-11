# E2E Test Specification: Communications — Full Module (Admin View)

> **Coverage:** This document covers the entire Communications module as rendered for admin roles (school_owner, school_principal, school_vice_principal, admin). It spans **15+ pages** including the Communications Hub Dashboard, Inbox (compose, threads, search, sidebar), Announcements (list, create, detail), Saved Audiences, Oversight (conversations, flags, audit), Messaging Policy Settings, Safeguarding Keywords Settings, Notification Fallback Settings, Notification Settings, Profile Communication Preferences, Admin Inquiries, and cross-module end-to-end flows.
>
> **Pages documented here:**
>
> - `/communications` — Hub Dashboard
> - `/inbox` — Inbox sidebar + threads
> - `/inbox/threads/[id]` — Thread detail
> - `/inbox/search` — Search results
> - `/inbox/audiences` — Saved audiences list
> - `/inbox/audiences/new` — Create audience
> - `/inbox/audiences/[id]` — Edit audience
> - `/inbox/oversight` — Oversight dashboard
> - `/inbox/oversight/threads/[id]` — Oversight thread detail
> - `/communications/announcements` — Announcements list
> - `/communications/new` — New announcement
> - `/communications/[id]` — Announcement detail
> - `/communications/inquiries` — Admin inquiries list
> - `/communications/inquiries/[id]` — Admin inquiry detail
> - `/settings/messaging-policy` — Messaging policy matrix
> - `/settings/communications/safeguarding` — Safeguarding keywords
> - `/settings/communications/fallback` — Notification fallback
> - `/settings/notifications` — Notification settings
> - `/profile/communication` — Profile communication preferences

**Base URL:** `https://nhqs.edupod.app`
**Prerequisite:** Logged in as **Yusuf Rahman** (`owner@nhqs.test` / `Password123!`), who holds the **School Owner** role.
**Additional test accounts:**

- Teacher: **Sarah Daly** (`Sarah.daly@nhqs.test` / `Password123!`)
- Parent: **Zainab Ali** (`parent@nhqs.test` / `Password123!`)
  **Navigation path to start:** Click **Inbox** (envelope icon) in the morph bar.

**Admin roles covered:** school_owner, school_principal, school_vice_principal, admin
**Admin-tier (oversight):** school_owner, school_principal, school_vice_principal only (NOT admin)

**Permissions referenced:**

- `inbox.send` — compose, reply, edit/delete, people search, audiences, attachments
- `inbox.read` — list conversations, get thread, mark read, mute, archive, search
- `inbox.oversight.read` — list all conversations, flags, audit log
- `inbox.oversight.write` — freeze, unfreeze, export, dismiss/escalate flags
- `inbox.settings.read` — get policy matrix, get inbox settings
- `inbox.settings.write` — update settings, update policy, reset policy, test fallback
- `communications.view` — list announcements, get announcement, delivery status
- `communications.manage` — create/update/archive announcements
- `communications.send` — publish announcements
- `parent.view_announcements` — parent announcement feed

---

## Table of Contents

1. [Navigation to Communications Hub](#1-navigation-to-communications-hub)
2. [Communications Hub Dashboard](#2-communications-hub-dashboard)
3. [Inbox Landing and Sidebar](#3-inbox-landing-and-sidebar)
4. [Thread List Items](#4-thread-list-items)
5. [Compose Dialog](#5-compose-dialog)
6. [People Picker](#6-people-picker)
7. [Audience Picker](#7-audience-picker)
8. [Audience Chip Builder](#8-audience-chip-builder)
9. [Channel Selector](#9-channel-selector)
10. [Attachment Uploader](#10-attachment-uploader)
11. [Thread View](#11-thread-view)
12. [Thread Messages](#12-thread-messages)
13. [Inbox Search](#13-inbox-search)
14. [Saved Audiences List](#14-saved-audiences-list)
15. [Create Audience](#15-create-audience)
16. [Edit Audience](#16-edit-audience)
17. [Oversight Dashboard](#17-oversight-dashboard)
18. [Flag Review Modal](#18-flag-review-modal)
19. [Freeze Dialog](#19-freeze-dialog)
20. [Oversight Thread Detail](#20-oversight-thread-detail)
21. [Announcements List](#21-announcements-list)
22. [New Announcement](#22-new-announcement)
23. [Announcement Detail](#23-announcement-detail)
24. [Admin Inquiries List](#24-admin-inquiries-list)
25. [Admin Inquiry Detail](#25-admin-inquiry-detail)
26. [Messaging Policy Settings](#26-messaging-policy-settings)
27. [Safeguarding Keywords Settings](#27-safeguarding-keywords-settings)
28. [Notification Fallback Settings](#28-notification-fallback-settings)
29. [Notification Settings](#29-notification-settings)
30. [Profile Communication Preferences](#30-profile-communication-preferences)
31. [Inbox Polling Provider](#31-inbox-polling-provider)
32. [Cross-Module Announcement Flow (End-to-End)](#32-cross-module-announcement-flow-end-to-end)
33. [Cross-Module Messaging Flow (End-to-End)](#33-cross-module-messaging-flow-end-to-end)
34. [Oversight Flow End-to-End](#34-oversight-flow-end-to-end)
35. [Reply Configuration Testing](#35-reply-configuration-testing)
36. [Arabic / RTL](#36-arabic--rtl)
37. [Backend Endpoint Map](#37-backend-endpoint-map)
38. [Console and Network Health](#38-console-and-network-health)
39. [Sign-off](#39-sign-off)

---

## 1. Navigation to Communications Hub

| #   | What to Check                                                                             | Expected Result                                                                                                                                                                                                                                        | Pass/Fail |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 1.1 | Look at the morph bar (top navigation bar) while logged in as Yusuf Rahman (School Owner) | The morph bar is visible across the full width of the viewport. It contains hub navigation buttons in a horizontal row.                                                                                                                                |           |
| 1.2 | Identify the **Inbox** hub button in the morph bar                                        | An **envelope icon** button labelled "Inbox" is visible among the hub navigation buttons. It is positioned in the hub row alongside Home, People, Learning, Wellbeing, Operations, Finance, Reports, Regulatory, Settings.                             |           |
| 1.3 | Check for unread badge on the Inbox hub button                                            | If there are unread messages, a numeric badge (e.g., "3") appears overlaid on or adjacent to the envelope icon. If no unread messages, no badge is shown.                                                                                              |           |
| 1.4 | Click the **Inbox** hub button                                                            | Browser navigates to `/en/communications`. The Communications Hub Dashboard loads (see Section 2). The Inbox hub button appears visually active/highlighted in the morph bar.                                                                          |           |
| 1.5 | Verify no sub-strip appears beneath the morph bar                                         | Unlike other hubs (People, Learning, etc.), the Communications hub does **not** display a sub-strip/secondary navigation bar. The hub dashboard content begins directly below the morph bar.                                                           |           |
| 1.6 | Verify all 9 hub buttons are visible in the morph bar                                     | The following hubs are all present: **Home**, **People**, **Learning**, **Wellbeing**, **Operations**, **Finance**, **Reports**, **Regulatory**, **Settings**. The Inbox/envelope icon is also visible (as a utility/hub icon).                        |           |
| 1.7 | Verify admin redirect behaviour: navigate to `/en/communications` directly via URL bar    | For a user with an admin role (school_owner, school_principal, school_vice_principal, admin), the page loads the Communications Hub Dashboard. No redirect occurs.                                                                                     |           |
| 1.8 | Verify non-admin redirect behaviour (conceptual — log in as teacher Sarah Daly to test)   | When a non-admin user navigates to `/en/communications`, they are redirected to `/en/inbox`. The hub dashboard is not accessible. While redirect is pending, the page shows an empty container with `h-[50vh]` height (no flash of dashboard content). |           |

---

## 2. Communications Hub Dashboard

**URL:** `/en/communications`
**Requires:** Admin role (school_owner, school_principal, school_vice_principal, admin)

### 2.1 Page Load and Layout

| #     | What to Check                                        | Expected Result                                                                                                                                                                                                                                                                   | Pass/Fail |
| ----- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1.1 | Navigate to `/en/communications` as Yusuf Rahman     | Page loads without errors. No blank white screen. No "Something went wrong" message.                                                                                                                                                                                              |           |
| 2.1.2 | Verify the page layout structure                     | The page displays two main sections: (1) a responsive grid of 4 stat cards at the top, and (2) a row of 3 settings tiles below the stat cards.                                                                                                                                    |           |
| 2.1.3 | Verify responsive grid on desktop (1024px+ viewport) | The 4 stat cards are displayed in a single row of 4 columns, evenly spaced.                                                                                                                                                                                                       |           |
| 2.1.4 | Verify responsive grid on tablet (768px viewport)    | The 4 stat cards are displayed in a 2-column grid (2 cards per row, 2 rows total).                                                                                                                                                                                                |           |
| 2.1.5 | Verify responsive grid on mobile (375px viewport)    | The 4 stat cards are stacked in a single column (1 card per row, 4 rows total).                                                                                                                                                                                                   |           |
| 2.1.6 | Check the browser console for API calls on page load | The following 4 API calls are made: `GET /api/v1/inbox/state`, `GET /api/v1/inbox/audiences`, `GET /api/v1/announcements?page=1&pageSize=1`, `GET /api/v1/inbox/oversight/flags?page=1&pageSize=1&review_state=pending`. All return 200 (or 403 for oversight if not admin-tier). |           |

### 2.2 Inbox Stat Card

| #     | What to Check                         | Expected Result                                                                                                                                           | Pass/Fail |
| ----- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.2.1 | Identify the Inbox stat card          | A card is displayed with an **Inbox icon** (envelope/mail icon) and a **primary accent** colour scheme (e.g., primary-coloured icon or border).           |           |
| 2.2.2 | Verify the card title                 | The card title reads **"Inbox"** (or the translated equivalent).                                                                                          |           |
| 2.2.3 | Verify the metric while loading       | While the API call `GET /api/v1/inbox/state` is in flight, the metric area shows a **loading skeleton** (a grey placeholder bar, approximately h-6 w-24). |           |
| 2.2.4 | Verify the metric after load          | After the API responds, the card displays the **unread count** (e.g., "5 unread") and the **latest message date** (e.g., "Latest: 11 Apr 2026").          |           |
| 2.2.5 | Verify the metric on API error        | If the API call fails, the metric area displays an **em dash** character (--) instead of a number. No crash or blank screen.                              |           |
| 2.2.6 | Verify the card footer / CTA link     | The card has a footer area with a clickable link (e.g., "Go to Inbox" or an arrow icon).                                                                  |           |
| 2.2.7 | Click the Inbox card CTA link         | Browser navigates to `/en/inbox`. The Inbox sidebar and thread list loads (see Section 3).                                                                |           |
| 2.2.8 | Click anywhere on the Inbox card body | Browser navigates to `/en/inbox` (the entire card is clickable, linking to /inbox).                                                                       |           |

### 2.3 Audiences Stat Card

| #     | What to Check                     | Expected Result                                                                                                    | Pass/Fail |
| ----- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------- |
| 2.3.1 | Identify the Audiences stat card  | A card is displayed with a **Users icon** and an **info accent** colour scheme (e.g., blue-tinted icon or border). |           |
| 2.3.2 | Verify the card title             | The card title reads **"Audiences"** (or the translated equivalent).                                               |           |
| 2.3.3 | Verify the metric while loading   | While `GET /api/v1/inbox/audiences` is in flight, a loading skeleton (h-6 w-24) is shown.                          |           |
| 2.3.4 | Verify the metric after load      | After the API responds, the card displays the **audience count** (e.g., "12 audiences").                           |           |
| 2.3.5 | Verify the metric on API error    | If the API call fails, the metric area displays an em dash (--).                                                   |           |
| 2.3.6 | Click the Audiences card CTA link | Browser navigates to `/en/inbox/audiences`. The Saved Audiences list loads (see Section 14).                       |           |

### 2.4 Announcements Stat Card

| #     | What to Check                         | Expected Result                                                                                                                                                                                | Pass/Fail |
| ----- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.4.1 | Identify the Announcements stat card  | A card is displayed with a **Megaphone icon** and a **success accent** colour scheme (e.g., green-tinted icon or border).                                                                      |           |
| 2.4.2 | Verify the card title                 | The card title reads **"Announcements"** (or the translated equivalent).                                                                                                                       |           |
| 2.4.3 | Verify the metric while loading       | While `GET /api/v1/announcements?page=1&pageSize=1` is in flight, a loading skeleton (h-6 w-24) is shown.                                                                                      |           |
| 2.4.4 | Verify the metric after load          | After the API responds, the card displays the **latest announcement title** (e.g., the title of the most recent announcement). If no announcements exist, an appropriate empty label is shown. |           |
| 2.4.5 | Verify the metric on API error        | If the API call fails, the metric area displays an em dash (--).                                                                                                                               |           |
| 2.4.6 | Click the Announcements card CTA link | Browser navigates to `/en/communications/announcements`. The Announcements list loads (see Section 21).                                                                                        |           |

### 2.5 Oversight Stat Card

| #     | What to Check                                             | Expected Result                                                                                                                                                                | Pass/Fail |
| ----- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 2.5.1 | Identify the Oversight stat card                          | A card is displayed with a **ShieldAlert icon**. The colour scheme is **warning accent** (amber/orange) if pending flags count > 0, or a neutral accent if pending count is 0. |           |
| 2.5.2 | Verify the card title                                     | The card title reads **"Oversight"** (or the translated equivalent).                                                                                                           |           |
| 2.5.3 | Verify the metric while loading                           | While `GET /api/v1/inbox/oversight/flags?page=1&pageSize=1&review_state=pending` is in flight, a loading skeleton (h-6 w-24) is shown.                                         |           |
| 2.5.4 | Verify the metric after load (admin-tier user)            | For school_owner, school_principal, or school_vice_principal: the card displays the **pending flag count** (e.g., "3 pending flags").                                          |           |
| 2.5.5 | Verify the metric on API 403 (admin role, not admin-tier) | For a user with the "admin" role (not owner/principal/VP), the oversight flags API returns 403. The card displays an em dash (--) gracefully. No crash.                        |           |
| 2.5.6 | Verify the metric on API error                            | If the API call fails for any other reason, the metric area displays an em dash (--).                                                                                          |           |
| 2.5.7 | Click the Oversight card CTA link                         | Browser navigates to `/en/inbox/oversight`. The Oversight Dashboard loads (see Section 17).                                                                                    |           |

### 2.6 Settings Tiles

| #     | What to Check                                                                      | Expected Result                                                                                                              | Pass/Fail |
| ----- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.6.1 | Verify the 3 settings tiles are displayed below the stat cards                     | Three tiles are visible in a row (or stacked on mobile). Each tile has an icon, a title, and acts as a link.                 |           |
| 2.6.2 | Identify the **Messaging Policy** tile                                             | A tile with a **Bell icon** and the label "Messaging Policy" (or translated equivalent) is visible.                          |           |
| 2.6.3 | Click the Messaging Policy tile                                                    | Browser navigates to `/en/settings/messaging-policy`. The Messaging Policy Settings page loads (see Section 26).             |           |
| 2.6.4 | Navigate back to `/en/communications`. Identify the **Safeguarding Keywords** tile | A tile with a **KeyRound icon** and the label "Safeguarding Keywords" (or translated equivalent) is visible.                 |           |
| 2.6.5 | Click the Safeguarding Keywords tile                                               | Browser navigates to `/en/settings/communications/safeguarding`. The Safeguarding Keywords page loads (see Section 27).      |           |
| 2.6.6 | Navigate back to `/en/communications`. Identify the **Fallback** tile              | A tile with a **Siren icon** and the label "Fallback" (or translated equivalent) is visible.                                 |           |
| 2.6.7 | Click the Fallback tile                                                            | Browser navigates to `/en/settings/communications/fallback`. The Notification Fallback Settings page loads (see Section 28). |           |

---

## 3. Inbox Landing and Sidebar

**URL:** `/en/inbox`
**Requires:** Any authenticated user (no specific permission gating for basic access)

### 3.1 Page Load and Layout

| #     | What to Check                                        | Expected Result                                                                                                                                                    | Pass/Fail |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 3.1.1 | Navigate to `/en/inbox`                              | Page loads without errors. The layout is a two-pane design: a left sidebar and a right content area.                                                               |           |
| 3.1.2 | Verify sidebar width on desktop (1024px+)            | The left sidebar (aside) has a fixed width of approximately **360px**. It occupies the left portion of the screen. The remaining space is the thread content area. |           |
| 3.1.3 | Verify sidebar takes full width on mobile (375px)    | On mobile, the sidebar takes the full viewport width. No thread content area is visible until a thread is selected.                                                |           |
| 3.1.4 | Verify viewport height                               | The inbox pane height is `h-[calc(100dvh-56px)]` — it fills the viewport below the morph bar with no page-level scrollbar. Internal areas scroll independently.    |           |
| 3.1.5 | Verify mobile toggle: sidebar visible, thread hidden | On mobile, when no thread is selected, the sidebar (conversation list) is visible. The thread detail pane is hidden.                                               |           |
| 3.1.6 | Verify mobile toggle: thread visible, sidebar hidden | On mobile, when a thread is selected, the thread detail pane is visible. The sidebar is hidden. A back button is shown to return to the sidebar.                   |           |

### 3.2 Sidebar Header

| #     | What to Check                                                      | Expected Result                                                                                                                                                                                       | Pass/Fail |
| ----- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.2.1 | Verify the sidebar heading                                         | An **h1** heading is visible at the top of the sidebar. It reads "Inbox" (or the translated equivalent).                                                                                              |           |
| 3.2.2 | Verify the Compose button                                          | A button with a **Pencil icon** is displayed in the sidebar header area. On desktop, the button label text is visible (e.g., "Compose" or "New"). On mobile, only the icon is shown (text is hidden). |           |
| 3.2.3 | Click the Compose button                                           | The **Compose Dialog** opens (see Section 5). A modal/dialog overlay appears for creating a new conversation.                                                                                         |           |
| 3.2.4 | Verify keyboard shortcut: press 'c' while not focused on any input | The Compose Dialog opens. This shortcut only fires when no text input, textarea, or contenteditable element is focused.                                                                               |           |
| 3.2.5 | Verify keyboard shortcut does NOT fire inside an input             | Click into the search input, then press 'c'. The character 'c' is typed into the input. The Compose Dialog does NOT open.                                                                             |           |

### 3.3 Search Form

| #     | What to Check                                                        | Expected Result                                                                                                                                    | Pass/Fail |
| ----- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.3.1 | Identify the search form in the sidebar                              | Below the header, a search form is visible with a **Search icon** and a text input. The input has a placeholder (e.g., "Search conversations..."). |           |
| 3.3.2 | Type "hello" into the search input and press Enter (or click submit) | The browser navigates to `/en/inbox/search?q=hello`. The Inbox Search page loads (see Section 13).                                                 |           |
| 3.3.3 | Navigate back to `/en/inbox`. Verify the search input is empty       | The search input is cleared when returning to the inbox landing.                                                                                   |           |

### 3.4 Filter Chips

| #     | What to Check                                      | Expected Result                                                                                                                                                   | Pass/Fail |
| ----- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.4.1 | Identify the filter chip row below the search form | A horizontally scrollable row of **6 filter chips** is displayed: **All**, **Unread**, **Direct**, **Group**, **Broadcasts**, **Archived**.                       |           |
| 3.4.2 | Verify "All" chip is active by default             | The "All" chip has a visually active/selected state (e.g., filled background, primary colour). The other chips appear in their default/unselected state.          |           |
| 3.4.3 | Click the **Unread** filter chip                   | The chip becomes active. The conversation list refreshes to show only **unread** conversations. The API call includes `unread_only=true` in the query parameters. |           |
| 3.4.4 | Click the **Direct** filter chip                   | The chip becomes active. The conversation list refreshes to show only **direct** (one-on-one) conversations. The API call includes `kind=direct`.                 |           |
| 3.4.5 | Click the **Group** filter chip                    | The chip becomes active. The conversation list refreshes to show only **group** conversations. The API call includes `kind=group`.                                |           |
| 3.4.6 | Click the **Broadcasts** filter chip               | The chip becomes active. The conversation list refreshes to show only **broadcast** conversations. The API call includes `kind=broadcast`.                        |           |
| 3.4.7 | Click the **Archived** filter chip                 | The chip becomes active. The conversation list refreshes to show only **archived** conversations. The API call includes `archived=true`.                          |           |
| 3.4.8 | Click the **All** chip to reset                    | The "All" chip becomes active again. The full conversation list is shown without filters.                                                                         |           |
| 3.4.9 | Verify horizontal scrolling on mobile              | On a narrow viewport, the filter chips overflow horizontally. The user can swipe/scroll left-right to see all 6 chips. No chips are cut off or hidden.            |           |

### 3.5 Conversation List — Loading State

| #     | What to Check                                                                                   | Expected Result                                                                                                                                       | Pass/Fail |
| ----- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.5.1 | Observe the conversation list immediately after navigating to `/en/inbox` (before API responds) | A **loading state** is displayed in the sidebar. This may be skeleton placeholders, a spinner, or shimmer lines representing conversation items.      |           |
| 3.5.2 | Verify the loading state disappears after the API responds                                      | Once `GET /api/v1/inbox/conversations?page=1&pageSize=30` returns, the loading state is replaced by the actual conversation list (or an empty state). |           |

### 3.6 Conversation List — Error State

| #     | What to Check                                                    | Expected Result                                                                                                                                     | Pass/Fail |
| ----- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.6.1 | Simulate an API error (e.g., network disconnect or 500 response) | The sidebar displays a **red error message** (e.g., "Failed to load conversations" or similar). The error text is styled in red/destructive colour. |           |
| 3.6.2 | Verify no crash on error                                         | The page does not crash or show a white screen. The morph bar and sidebar chrome remain intact. Only the conversation list area shows the error.    |           |

### 3.7 Conversation List — Empty State

| #     | What to Check                                                             | Expected Result                                                                                                                              | Pass/Fail |
| ----- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.7.1 | If no conversations exist (or with an active filter that matches nothing) | The sidebar displays an **empty state** message (e.g., "No conversations" or "No unread messages"). The message is centred in the list area. |           |
| 3.7.2 | Verify the Compose button is still accessible in empty state              | The Compose button in the sidebar header remains visible and clickable, allowing the user to start a new conversation.                       |           |

### 3.8 Conversation List — API Call Details

| #     | What to Check                                                         | Expected Result                                                                                                                                                      | Pass/Fail |
| ----- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.8.1 | Open Network tab and observe the API call when "All" filter is active | `GET /api/v1/inbox/conversations?page=1&pageSize=30` is called. Response returns a paginated list of conversations.                                                  |           |
| 3.8.2 | Switch to "Direct" filter and observe the API call                    | `GET /api/v1/inbox/conversations?page=1&pageSize=30&kind=direct` is called.                                                                                          |           |
| 3.8.3 | Switch to "Unread" filter and observe the API call                    | `GET /api/v1/inbox/conversations?page=1&pageSize=30&unread_only=true` is called.                                                                                     |           |
| 3.8.4 | Switch to "Archived" filter and observe the API call                  | `GET /api/v1/inbox/conversations?page=1&pageSize=30&archived=true` is called.                                                                                        |           |
| 3.8.5 | Verify the list re-fetches when switching filters                     | Each time a different filter chip is clicked, a new API call is made and the list updates with the filtered results. No stale data remains from the previous filter. |           |

---

## 4. Thread List Items

Each conversation in the sidebar list is rendered as a thread list item. This section covers the anatomy of a single list item.

| #    | What to Check                                                                  | Expected Result                                                                                                                                                                                              | Pass/Fail |
| ---- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 4.1  | Identify the kind icon for a **direct** conversation                           | A circular avatar area (36x36 px) displays a **User icon** (single person silhouette) for direct conversations.                                                                                              |           |
| 4.2  | Identify the kind icon for a **group** conversation                            | A circular avatar area (36x36 px) displays a **Users icon** (multiple person silhouette) for group conversations.                                                                                            |           |
| 4.3  | Identify the kind icon for a **broadcast** conversation                        | A circular avatar area (36x36 px) displays a **Megaphone icon** for broadcast conversations.                                                                                                                 |           |
| 4.4  | Verify the **unread dot** indicator on an unread, unselected conversation      | An 8px circle in primary colour is displayed at the **start** (left in LTR, right in RTL) of the list item. This dot is only shown when the conversation is unread AND not currently selected.               |           |
| 4.5  | Verify the unread dot disappears when the conversation is selected             | Click on an unread conversation. The unread dot disappears from that item as it becomes the selected/active thread.                                                                                          |           |
| 4.6  | Verify the **subject line** for an unread conversation                         | The subject text is rendered in **bold** font weight when the conversation is unread.                                                                                                                        |           |
| 4.7  | Verify the subject line for a read conversation                                | The subject text is rendered in **normal** (non-bold) font weight when the conversation has been read.                                                                                                       |           |
| 4.8  | Verify the subject fallback for a direct conversation with no explicit subject | For direct conversations without a set subject, the subject line shows the other participant's display name (e.g., "Sarah Daly") or a generic fallback like "Direct message".                                |           |
| 4.9  | Verify the subject fallback for an untitled group conversation                 | For group conversations without a subject, a fallback such as "Untitled group" or participant names is shown.                                                                                                |           |
| 4.10 | Verify the **frozen indicator** on a frozen conversation                       | If a conversation is frozen, a **Lock icon** is displayed adjacent to the subject. The icon has an `aria-label` attribute (e.g., "Frozen").                                                                  |           |
| 4.11 | Verify the frozen indicator is absent on non-frozen conversations              | Non-frozen conversations do not display the Lock icon.                                                                                                                                                       |           |
| 4.12 | Verify the **timestamp** for a message sent today                              | The timestamp displays in **HH:mm** format (e.g., "14:35"). No date is shown.                                                                                                                                |           |
| 4.13 | Verify the timestamp for a message sent earlier this week (but not today)      | The timestamp displays as the **weekday name** (e.g., "Monday", "Tue").                                                                                                                                      |           |
| 4.14 | Verify the timestamp for a message sent more than a week ago                   | The timestamp displays in **d MMM** format (e.g., "5 Apr", "28 Mar").                                                                                                                                        |           |
| 4.15 | Verify the **preview body** text                                               | Below the subject, a single-line preview of the latest message body is shown. It is truncated with ellipsis if too long. If no messages exist, a non-breaking space is rendered (the line is not collapsed). |           |
| 4.16 | Verify the **unread badge** (count)                                            | To the right of the list item, an unread count badge is displayed as a pill shape (e.g., "3"). If the count exceeds 99, it shows **"99+"**.                                                                  |           |
| 4.17 | Verify the unread badge is hidden for read conversations                       | Conversations with zero unread messages do not show the badge pill.                                                                                                                                          |           |
| 4.18 | Verify the **selected state** visual treatment                                 | The currently selected conversation shows: a **3px left bar** (primary colour) along the start edge, and a **bg-primary-50** background colour (light primary tint).                                         |           |
| 4.19 | Click on a conversation item                                                   | The thread detail view loads in the right pane (see Section 11). The clicked item becomes the selected item with the visual treatment from 4.18.                                                             |           |

---

## 5. Compose Dialog

The Compose Dialog is opened by clicking the Compose button in the sidebar header or pressing the 'c' keyboard shortcut.

### 5.1 Dialog Structure

| #     | What to Check                                        | Expected Result                                                                                                                                                  | Pass/Fail |
| ----- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1.1 | Open the Compose Dialog (click Compose or press 'c') | A modal dialog appears overlaid on the inbox. On mobile, it is **full-screen**. On desktop, it has a **max-width of 2xl** (approximately 672px) and is centered. |           |
| 5.1.2 | Verify the dialog title                              | The dialog has a title text (e.g., "New Conversation" or "Compose" — translated).                                                                                |           |
| 5.1.3 | Verify the dialog description                        | Below the title, a brief description/subtitle is displayed (translated).                                                                                         |           |
| 5.1.4 | Verify the 3 conversation type tabs                  | Three tabs are displayed: **Direct** (with MessageSquare icon), **Group** (with Users icon), **Broadcast** (with Megaphone icon).                                |           |
| 5.1.5 | Verify the active tab styling                        | The currently active tab has a distinct style: **bg-primary/10** background and **text-primary** text colour. Inactive tabs have default/muted styling.          |           |
| 5.1.6 | Verify Direct tab is selected by default             | On open, the "Direct" tab is the active/selected tab. The Direct tab form fields are visible.                                                                    |           |
| 5.1.7 | Click the **Group** tab                              | The Group tab becomes active. The form fields change to show the Group conversation form (subject input + multi-person picker).                                  |           |
| 5.1.8 | Click the **Broadcast** tab                          | The Broadcast tab becomes active. The form fields change to show the Broadcast form (subject input + audience picker + allow-replies checkbox).                  |           |
| 5.1.9 | Click the **Direct** tab again                       | The Direct tab becomes active again. The form returns to the Direct conversation fields.                                                                         |           |

### 5.2 Direct Tab

| #     | What to Check                                  | Expected Result                                                                                                                                      | Pass/Fail |
| ----- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.2.1 | Verify the recipient field label               | A label reading "Recipient" (or translated equivalent) is displayed above the people picker input.                                                   |           |
| 5.2.2 | Verify the recipient field placeholder         | The people picker input has a placeholder text (e.g., "Search for a person...").                                                                     |           |
| 5.2.3 | Verify the People Picker is in **single** mode | Only one recipient can be selected. After selecting one person, the picker does not allow adding more. (See Section 6 for People Picker details.)    |           |
| 5.2.4 | Verify the message body textarea               | A textarea is displayed below the recipient field. It has approximately **6 rows** of height. A placeholder is shown (e.g., "Type your message..."). |           |
| 5.2.5 | Verify the Attachment Uploader section         | Below the textarea, the Attachment Uploader component is present (see Section 10).                                                                   |           |
| 5.2.6 | Verify the Channel Selector section            | The Channel Selector component is present (see Section 9).                                                                                           |           |
| 5.2.7 | Verify the disable-fallback checkbox           | A checkbox labelled "Disable fallback" (or translated equivalent) is present. It has a tooltip/hint explaining what disabling fallback means.        |           |

### 5.3 Group Tab

| #     | What to Check                                 | Expected Result                                                                                                                      | Pass/Fail |
| ----- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 5.3.1 | Click the Group tab in the Compose Dialog     | The Group tab form fields are displayed.                                                                                             |           |
| 5.3.2 | Verify the subject input field                | A text input with `id="group-subject"` is displayed. It has a label "Subject" and a placeholder.                                     |           |
| 5.3.3 | Verify the People Picker is in **multi** mode | The people picker allows selecting **2 to 49 participants**. Multiple people can be added.                                           |           |
| 5.3.4 | Verify the participant count text             | Below or near the people picker, a text line shows the current participant count (e.g., "0 participants selected" or "3 of 49 max"). |           |
| 5.3.5 | Add 1 participant and verify count            | After adding 1 person, the count updates (e.g., "1 participant").                                                                    |           |
| 5.3.6 | Verify the message body textarea              | Same as 5.2.4 — a textarea with 6 rows and placeholder.                                                                              |           |
| 5.3.7 | Verify the Attachment Uploader section        | Same as 5.2.5 — the Attachment Uploader is present.                                                                                  |           |
| 5.3.8 | Verify the Channel Selector section           | Same as 5.2.6 — the Channel Selector is present.                                                                                     |           |
| 5.3.9 | Verify the disable-fallback checkbox          | Same as 5.2.7 — the checkbox with tooltip is present.                                                                                |           |

### 5.4 Broadcast Tab

| #     | What to Check                                 | Expected Result                                                                                                                                                | Pass/Fail |
| ----- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.4.1 | Click the Broadcast tab in the Compose Dialog | The Broadcast tab form fields are displayed.                                                                                                                   |           |
| 5.4.2 | Verify the subject input field                | A text input for the broadcast subject is displayed with a label and placeholder.                                                                              |           |
| 5.4.3 | Verify the Audience Picker section            | Instead of a People Picker, the **Audience Picker** component is displayed (see Section 7). This allows selecting a target audience (quick, saved, or custom). |           |
| 5.4.4 | Verify the allow-replies checkbox             | A checkbox labelled "Allow replies" (or translated equivalent) is displayed.                                                                                   |           |
| 5.4.5 | Verify the allow-replies hint text            | Below the checkbox, a hint/description text explains what allowing replies means (e.g., "Recipients can reply directly to this broadcast").                    |           |
| 5.4.6 | Verify the message body textarea              | Same as 5.2.4 — a textarea with 6 rows and placeholder.                                                                                                        |           |
| 5.4.7 | Verify the Attachment Uploader section        | Same as 5.2.5 — the Attachment Uploader is present.                                                                                                            |           |
| 5.4.8 | Verify the Channel Selector section           | Same as 5.2.6 — the Channel Selector is present.                                                                                                               |           |
| 5.4.9 | Verify the disable-fallback checkbox          | Same as 5.2.7 — the checkbox with tooltip is present.                                                                                                          |           |

### 5.5 Validation

| #      | What to Check                                                       | Expected Result                                                                                                    | Pass/Fail |
| ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------- |
| 5.5.1  | Direct tab: click Send with no recipient and no body                | The Send button is disabled or validation prevents submission. An error indication appears on the required fields. |           |
| 5.5.2  | Direct tab: add a recipient but leave body empty, click Send        | Validation fails. The body field is highlighted as required.                                                       |           |
| 5.5.3  | Direct tab: type a body but select no recipient, click Send         | Validation fails. The recipient field is highlighted as required.                                                  |           |
| 5.5.4  | Direct tab: add a recipient AND type a body, click Send             | Validation passes. The API call is made (see 5.6).                                                                 |           |
| 5.5.5  | Group tab: click Send with no subject, no participants, no body     | Validation fails on all required fields (subject, participants, body).                                             |           |
| 5.5.6  | Group tab: fill subject and body but add only 1 participant         | Validation fails. Group conversations require a **minimum of 2 participants**. An error message indicates this.    |           |
| 5.5.7  | Group tab: fill subject and body, add 2 participants                | Validation passes. The API call is made.                                                                           |           |
| 5.5.8  | Group tab: try to add a 50th participant (with 49 already selected) | The People Picker prevents adding beyond 49. An indication shows the maximum has been reached.                     |           |
| 5.5.9  | Broadcast tab: click Send with no subject, no audience, no body     | Validation fails on all required fields.                                                                           |           |
| 5.5.10 | Broadcast tab: fill subject and body but select no audience         | Validation fails. The audience field is highlighted as required.                                                   |           |
| 5.5.11 | Broadcast tab: fill all fields (subject, body, audience)            | Validation passes. The API call is made.                                                                           |           |

### 5.6 Send Behaviour

| #     | What to Check                                      | Expected Result                                                                                                                                                                                                                                          | Pass/Fail |
| ----- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.6.1 | Fill valid Direct fields and click the Send button | The Send button shows a **Loader2** spinning icon (replacing the Send icon) while the API call is in flight. The button is disabled during submission.                                                                                                   |           |
| 5.6.2 | Verify the API call                                | `POST /api/v1/inbox/conversations` is called with the conversation payload (kind, recipients/audience, body, attachments, channels, etc.).                                                                                                               |           |
| 5.6.3 | Verify success behaviour                           | On 201 response: a **success toast** appears (e.g., "Message sent" or translated equivalent). The dialog closes. The browser navigates to `/en/inbox/threads/{id}` where `{id}` is the newly created conversation ID.                                    |           |
| 5.6.4 | Verify success toast content                       | The toast is a success variant (green/check icon). The message is descriptive.                                                                                                                                                                           |           |
| 5.6.5 | Verify the Send button icon after success          | The Send button returns to showing the **Send icon** (paper plane) after the operation completes. The dialog is closed at this point.                                                                                                                    |           |
| 5.6.6 | Simulate a BROADCAST_AUDIENCE_EMPTY error          | When sending a broadcast where the resolved audience is empty: the API returns an error with code `BROADCAST_AUDIENCE_EMPTY`. A **toast** appears with a specific error message (e.g., "The selected audience has no members"). The dialog remains open. |           |
| 5.6.7 | Simulate a generic API error (500)                 | A **toast** appears with a generic error message (e.g., "Failed to send message"). The dialog remains open. The Send button returns to its normal state.                                                                                                 |           |

### 5.7 Cancel Behaviour

| #     | What to Check                                            | Expected Result                                                                                           | Pass/Fail |
| ----- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| 5.7.1 | Verify the Cancel button is visible in the dialog footer | A **Cancel** button with ghost/outline styling is displayed to the left of the Send button.               |           |
| 5.7.2 | Click Cancel                                             | The Compose Dialog closes. No API call is made. No toast appears. The user is returned to the inbox view. |           |
| 5.7.3 | Press the Escape key while the dialog is open            | The dialog closes (same behaviour as Cancel).                                                             |           |
| 5.7.4 | Click the overlay/backdrop outside the dialog            | The dialog closes (same behaviour as Cancel).                                                             |           |

---

## 6. People Picker

The People Picker component is used within the Compose Dialog for selecting recipients in Direct and Group conversations.

| #    | What to Check                                                                                        | Expected Result                                                                                                                                                                             | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1  | Verify the People Picker input field in single mode (Direct tab)                                     | A text input is displayed. When empty, a placeholder is shown. No chips are present initially.                                                                                              |           |
| 6.2  | Verify the People Picker input field in multi mode (Group tab)                                       | A text input is displayed. Selected people appear as chips above or inline with the input.                                                                                                  |           |
| 6.3  | Type "sar" into the People Picker input                                                              | After a **200ms debounce**, an API call is made: `GET /api/v1/inbox/people-search?q=sar&limit=20`. A dropdown appears below the input.                                                      |           |
| 6.4  | Verify the dropdown loading state                                                                    | While the API call is in flight, a **loading spinner** is displayed in the dropdown area.                                                                                                   |           |
| 6.5  | Verify the dropdown results                                                                          | After the API responds, the dropdown shows matching people. Each result row displays: **avatar** (initials or photo), **display name**, **role** (e.g., "Teacher"), and **email address**.  |           |
| 6.6  | Verify the dropdown empty state                                                                      | If the search query matches no one (e.g., type "zzzzz"), the dropdown shows an empty state message (e.g., "No people found").                                                               |           |
| 6.7  | Click on a result row to select a person                                                             | In single mode: the person's name appears as a chip and the dropdown closes. In multi mode: the person's chip is added and the input remains focused for adding more.                       |           |
| 6.8  | Verify selected person chip anatomy                                                                  | Each selected chip shows: an **Avatar** (small, with initials or photo), the **display name**, and an **X button** to remove. The X button has an `aria-label` (e.g., "Remove Sarah Daly"). |           |
| 6.9  | Click the X button on a selected chip                                                                | The person is deselected/removed. In single mode, the input becomes empty again. In multi mode, the chip disappears and the participant count decreases.                                    |           |
| 6.10 | Verify keyboard navigation: press **ArrowDown** in the dropdown                                      | Focus moves to the next result row in the dropdown list. The focused row is visually highlighted.                                                                                           |           |
| 6.11 | Verify keyboard navigation: press **ArrowUp** in the dropdown                                        | Focus moves to the previous result row.                                                                                                                                                     |           |
| 6.12 | Verify keyboard navigation: press **Enter** on a focused dropdown row                                | The focused person is selected (same as clicking the row).                                                                                                                                  |           |
| 6.13 | Verify keyboard navigation: press **Escape** while the dropdown is open                              | The dropdown closes. The input retains focus.                                                                                                                                               |           |
| 6.14 | Verify keyboard navigation: press **Backspace** when the input is empty and chips exist (multi mode) | The last selected person chip is removed.                                                                                                                                                   |           |
| 6.15 | Type a new query after selecting a person (multi mode)                                               | The dropdown re-opens with new search results. Previously selected people may be excluded from results or shown as already selected.                                                        |           |

---

## 7. Audience Picker

The Audience Picker component is used within the Compose Dialog Broadcast tab for selecting the target audience.

### 7.1 Mode Tabs

| #     | What to Check                              | Expected Result                                                  | Pass/Fail |
| ----- | ------------------------------------------ | ---------------------------------------------------------------- | --------- |
| 7.1.1 | Verify the Audience Picker has 3 mode tabs | Three tabs are visible: **Quick**, **Saved**, **Custom**.        |           |
| 7.1.2 | Verify Quick tab is active by default      | The "Quick" tab is selected when the Broadcast form first loads. |           |
| 7.1.3 | Click the **Saved** tab                    | The Saved tab becomes active. Its content area loads.            |           |
| 7.1.4 | Click the **Custom** tab                   | The Custom tab becomes active. Its content area loads.           |           |

### 7.2 Quick Tab

| #     | What to Check                             | Expected Result                                                                                                     | Pass/Fail |
| ----- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.2.1 | Verify the Quick tab shows 3 preset chips | Three clickable chips/buttons are displayed: **Entire school**, **All parents**, **All staff**.                     |           |
| 7.2.2 | Click the "Entire school" chip            | The chip becomes selected (visually highlighted). This sets the audience to the entire school.                      |           |
| 7.2.3 | Click the "All parents" chip              | The chip becomes selected. The audience is set to all parents. The previously selected chip (if any) is deselected. |           |
| 7.2.4 | Click the "All staff" chip                | The chip becomes selected. The audience is set to all staff members.                                                |           |

### 7.3 Saved Tab

| #     | What to Check                                    | Expected Result                                                                                                                                   | Pass/Fail |
| ----- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.3.1 | Click the Saved tab                              | The content area shows saved audiences. An API call may be made to `GET /api/v1/inbox/audiences`.                                                 |           |
| 7.3.2 | Verify loading state                             | While audiences are loading, a loading indicator (spinner or skeleton) is shown.                                                                  |           |
| 7.3.3 | Verify empty state (if no saved audiences exist) | An empty state message is displayed (e.g., "No saved audiences").                                                                                 |           |
| 7.3.4 | Verify the saved audience list                   | Each saved audience row displays: **name**, **description** (if present), a **kind badge** (e.g., "Static" or "Dynamic"), and a **member count**. |           |
| 7.3.5 | Click on a saved audience row                    | The audience is selected. The row becomes highlighted. This saved audience will be used as the broadcast target.                                  |           |

### 7.4 Custom Tab

| #     | What to Check                          | Expected Result                                                                                                         | Pass/Fail |
| ----- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.4.1 | Click the Custom tab                   | The content area shows the **AudienceChipBuilder** component (see Section 8) for building a custom audience on the fly. |           |
| 7.4.2 | Verify the "Save As" button is present | A **"Save As"** button is displayed, allowing the user to save the custom audience definition for future reuse.         |           |
| 7.4.3 | Click the "Save As" button             | A **SaveAudienceDialog** opens (modal) with fields for naming and describing the audience.                              |           |

### 7.5 Save Audience Dialog

| #     | What to Check                                                   | Expected Result                                                                                                                                                                                                  | Pass/Fail |
| ----- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.5.1 | Verify the Save Audience Dialog structure                       | The dialog has a title (e.g., "Save Audience"), a **name** text input field, a **description** text input/textarea field, and Cancel/Save buttons.                                                               |           |
| 7.5.2 | Click Save with the name field empty                            | A **toast** appears indicating the name is required (e.g., "Name is required"). The dialog remains open.                                                                                                         |           |
| 7.5.3 | Enter a name and click Save                                     | The API call `POST /api/v1/inbox/audiences` is made. On success, a **success toast** appears (e.g., "Audience saved"). The dialog closes.                                                                        |           |
| 7.5.4 | Verify error handling on save failure                           | If the API returns an error, an **error toast** appears (e.g., "Failed to save audience"). The dialog remains open.                                                                                              |           |
| 7.5.5 | Click Cancel in the Save Audience Dialog                        | The dialog closes without saving. No API call is made.                                                                                                                                                           |           |
| 7.5.6 | Verify the recipient preview updates with the custom definition | As the user builds the custom audience (via AudienceChipBuilder), a debounced API call `POST /api/v1/inbox/audiences/preview` is made after **500ms** of inactivity. The estimated recipient count is displayed. |           |

---

## 8. Audience Chip Builder

The Audience Chip Builder is the component used in the Custom tab of the Audience Picker and in the Audience create/edit forms.

| #    | What to Check                                                        | Expected Result                                                                                                                                                                                                                   | Pass/Fail |
| ---- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1  | Verify the "Custom audience" label                                   | A label reading "Custom audience" (or translated equivalent) is displayed at the top of the builder.                                                                                                                              |           |
| 8.2  | Verify the empty state                                               | When no filter rows have been added, a text message is shown (e.g., "No filters added. Click 'Add filter' to start building your audience.").                                                                                     |           |
| 8.3  | Click the **"Add filter"** button                                    | A new filter row is added to the builder. The row contains: a **NOT switch**, a **provider dropdown**, a **params editor** area, and a **Remove button**.                                                                         |           |
| 8.4  | Verify the provider dropdown                                         | The dropdown lists available audience providers. An API call `GET /api/v1/inbox/audiences/providers` is made to populate the list. Some providers may show a **"Coming soon"** badge indicating they are not yet wired/available. |           |
| 8.5  | Select a provider (e.g., "Entire school")                            | The provider is selected. The params editor area updates based on the selected provider. For "Entire school", "All parents", and "All staff" — no additional parameters are needed.                                               |           |
| 8.6  | Select a provider that requires parameters (e.g., "Fees in arrears") | The params editor shows **number input(s)** for the required parameters (e.g., minimum arrears amount).                                                                                                                           |           |
| 8.7  | Select a list-based provider (e.g., a specific list ID)              | The params editor shows a **UUID text input** for entering the list ID.                                                                                                                                                           |           |
| 8.8  | Toggle the **NOT switch** on a filter row                            | The switch toggles between inclusive and exclusive. When NOT is enabled, the filter excludes matching recipients instead of including them.                                                                                       |           |
| 8.9  | Click the **Remove button** on a filter row                          | The filter row is removed from the builder. If it was the last row, the empty state is shown again.                                                                                                                               |           |
| 8.10 | Add a **second** filter row                                          | A second row appears. When 2 or more rows are present, a **combine operator** selector appears (AND / OR) controlling how the filters are combined.                                                                               |           |
| 8.11 | Toggle the combine operator between AND and OR                       | The operator switches. "AND" means recipients must match all filters. "OR" means recipients matching any filter are included.                                                                                                     |           |
| 8.12 | Verify the **recipient count display** while loading                 | While the preview API call is in flight, a **loading spinner** is shown in the count area.                                                                                                                                        |           |
| 8.13 | Verify the recipient count display after preview                     | After the `POST /api/v1/inbox/audiences/preview` call returns, the count area shows the estimated recipient count (e.g., "~150 recipients").                                                                                      |           |

---

## 9. Channel Selector

The Channel Selector component is used within the Compose Dialog for choosing delivery channels.

| #    | What to Check                                              | Expected Result                                                                                                                                                                              | Pass/Fail |
| ---- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1  | Verify the **Inbox** channel chip                          | A chip labelled "Inbox" with a **Mail icon** is always displayed. It is in an **active/selected state** and is **disabled** (cannot be deselected). The inbox channel is always locked on.   |           |
| 9.2  | Verify the **Email** channel chip                          | A chip labelled "Email" is displayed. It is **toggleable** (can be clicked to enable/disable). Below the chip, a per-recipient cost sublabel may be shown (e.g., "Free" or a cost estimate). |           |
| 9.3  | Click the Email chip to enable it                          | The chip becomes active (highlighted/checked). The cost estimate text below updates.                                                                                                         |           |
| 9.4  | Click the Email chip again to disable it                   | The chip returns to its inactive state.                                                                                                                                                      |           |
| 9.5  | Verify the **SMS** channel chip                            | A chip labelled "SMS" is displayed and toggleable. A per-recipient cost sublabel is shown.                                                                                                   |           |
| 9.6  | Click the SMS chip to enable it                            | The chip becomes active. The cost estimate updates.                                                                                                                                          |           |
| 9.7  | Verify the **WhatsApp** channel chip                       | A chip labelled "WhatsApp" is displayed and toggleable. A per-recipient cost sublabel is shown.                                                                                              |           |
| 9.8  | Click the WhatsApp chip to enable it                       | The chip becomes active. The cost estimate updates.                                                                                                                                          |           |
| 9.9  | Verify the cost estimate text when only Inbox is selected  | A text line reads something like "Inbox only" or shows a zero-cost estimate.                                                                                                                 |           |
| 9.10 | Enable Email + SMS + WhatsApp and verify the cost estimate | The text updates to show a total estimated cost with a `<strong>` tag highlighting the total (e.g., "Estimated cost: **$1.50** per recipient").                                              |           |
| 9.11 | Verify all channel chips have a minimum width of 160px     | Each chip is at least 160px wide, ensuring consistent layout.                                                                                                                                |           |

---

## 10. Attachment Uploader

The Attachment Uploader component is used within the Compose Dialog for adding file attachments.

### 10.1 Drop Zone

| #      | What to Check                        | Expected Result                                                                                                                              | Pass/Fail |
| ------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1.1 | Verify the drop zone is displayed    | A drop zone area is visible with an **UploadCloud icon**, hint text explaining accepted files, and a count indicator (e.g., "0 / 10 files"). |           |
| 10.1.2 | Verify the "Add files" button        | A **ghost-styled** button labelled "Add files" is displayed within or near the drop zone.                                                    |           |
| 10.1.3 | Click the "Add files" button         | A native file picker dialog opens. The file input accepts **multiple** files and filters by accepted MIME types.                             |           |
| 10.1.4 | Drag a file over the drop zone       | The drop zone changes appearance to indicate it is ready to receive the file (e.g., highlighted border, colour change).                      |           |
| 10.1.5 | Drop a valid file onto the drop zone | The file is added to the upload queue. An API call `POST /api/v1/inbox/attachments` (multipart form data) begins.                            |           |

### 10.2 Upload States

| #      | What to Check                                      | Expected Result                                                                                                                             | Pass/Fail |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.2.1 | Verify a file in **uploading** state               | The file appears in the list with a **Loader2** spinning icon, filename, and a **cancel X** button.                                         |           |
| 10.2.2 | Verify a file in **uploaded** (success) state      | The file appears with a **FileText icon**, the **filename**, the **file size** (human-readable, e.g., "2.4 MB"), and a **remove X** button. |           |
| 10.2.3 | Verify a file in **error** state                   | The file appears with an **AlertCircle icon** (indicating failure), the filename, and a **cancel X** button.                                |           |
| 10.2.4 | Click the remove X on a successfully uploaded file | The file is removed from the attachment list. It will not be included in the sent message.                                                  |           |
| 10.2.5 | Click the cancel X on a file currently uploading   | The upload is cancelled. The file is removed from the list.                                                                                 |           |

### 10.3 Validation and Errors

| #      | What to Check                                                 | Expected Result                                                                                                                                       | Pass/Fail |
| ------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.3.1 | Try to upload more than 10 files at once                      | A **toast** appears indicating too many files (e.g., "Maximum 10 attachments allowed"). Only the first 10 files (or none) are accepted.               |           |
| 10.3.2 | Try to upload a file with a disallowed MIME type (e.g., .exe) | A **toast** appears indicating the file type is not allowed (e.g., "File type not permitted"). The file is rejected and not uploaded.                 |           |
| 10.3.3 | Try to upload a file larger than 25 MB                        | A **toast** appears indicating the file is too large (e.g., "File exceeds 25 MB limit"). The file is rejected.                                        |           |
| 10.3.4 | Simulate an upload API failure                                | A **toast** appears indicating the upload failed (e.g., "Upload failed"). The file enters the error state (AlertCircle icon).                         |           |
| 10.3.5 | Verify client-side validation mirrors backend rules           | The client checks MIME types, 25 MB size limit, and max 10 files **before** making the API call. Invalid files are rejected immediately with a toast. |           |

---

## 11. Thread View

**URL:** `/en/inbox/threads/[id]`

### 11.1 Page Load

| #      | What to Check                                           | Expected Result                                                                                           | Pass/Fail |
| ------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| 11.1.1 | Click on a conversation in the sidebar to open a thread | The right pane loads the thread detail view. The API call `GET /api/v1/inbox/conversations/{id}` is made. |           |
| 11.1.2 | Verify the thread content loads                         | The thread displays the subject header, messages, and reply composer.                                     |           |
| 11.1.3 | Verify loading state                                    | While the API call is in flight, a loading indicator is shown in the thread pane.                         |           |

### 11.2 Mobile Back Button

| #      | What to Check                                  | Expected Result                                                                                                                   | Pass/Fail |
| ------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.2.1 | Open a thread on mobile (375px viewport)       | The thread detail pane takes full width. A **back button** with an **ArrowLeft icon** is displayed at the top of the thread view. |           |
| 11.2.2 | Click the back button on mobile                | The view returns to the sidebar (conversation list). The thread detail pane is hidden.                                            |           |
| 11.2.3 | Verify the back button is NOT shown on desktop | On desktop viewports (1024px+), no back button is displayed because the sidebar and thread are both visible.                      |           |

### 11.3 Subject Header

| #      | What to Check                                | Expected Result                                                                          | Pass/Fail |
| ------ | -------------------------------------------- | ---------------------------------------------------------------------------------------- | --------- |
| 11.3.1 | Verify the subject line in the thread header | The subject of the conversation is displayed prominently at the top of the thread view.  |           |
| 11.3.2 | Verify the participant count                 | Adjacent to or below the subject, a participant count is shown (e.g., "3 participants"). |           |

### 11.4 Frozen Banner

| #      | What to Check                             | Expected Result                                                                                                                                                                                                                                              | Pass/Fail |
| ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 11.4.1 | Open a **frozen** conversation thread     | A banner is displayed at the top of the thread (below the subject header). It contains: a **Lock icon**, a title indicating the conversation is frozen (e.g., "Conversation frozen"), and the **reason text** (or a default text if no reason was provided). |           |
| 11.4.2 | Open a **non-frozen** conversation thread | No frozen banner is displayed.                                                                                                                                                                                                                               |           |

### 11.5 Message List

| #      | What to Check                                             | Expected Result                                                                                                                                                                                         | Pass/Fail |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.5.1 | Verify messages are displayed in chronological order      | Messages are listed from oldest (top) to newest (bottom).                                                                                                                                               |           |
| 11.5.2 | Verify auto-scroll to bottom on load                      | When the thread first loads, the message list automatically scrolls to the bottom (newest message).                                                                                                     |           |
| 11.5.3 | Verify sender metadata for non-direct conversations       | In group and broadcast threads, each message shows the sender's name and/or avatar above or beside the message bubble. In direct threads, sender meta may be omitted (only "me" vs "them" distinction). |           |
| 11.5.4 | Verify message rendering (see Section 12 for full detail) | Each message is rendered as a bubble with body text, timestamp, and optional attachments. Own messages are right-aligned; others are left-aligned.                                                      |           |

### 11.6 Reply Composer

| #      | What to Check                                                                  | Expected Result                                                                                                                                                                              | Pass/Fail |
| ------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.6.1 | Verify the reply composer at the bottom of the thread                          | A textarea is displayed at the bottom with a placeholder (e.g., "Type a reply..."). A **Send button** with an icon is displayed to the right of the textarea.                                |           |
| 11.6.2 | Type a message and click the Send button                                       | The API call `POST /api/v1/inbox/conversations/{id}/messages` is made with the message body. On success, the new message appears at the bottom of the message list. The textarea is cleared. |           |
| 11.6.3 | Type a message and press **Cmd+Enter** (Mac) or **Ctrl+Enter** (Windows/Linux) | Same behaviour as clicking Send — the message is submitted via keyboard shortcut.                                                                                                            |           |
| 11.6.4 | Verify no toast on send failure                                                | If the reply API call fails, the error is logged to `console.error` only. No toast notification is shown. The textarea retains the typed message.                                            |           |

### 11.7 Disabled Composer

| #      | What to Check                                                    | Expected Result                                                                                                                                                                                   | Pass/Fail |
| ------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.7.1 | Open a **frozen** conversation                                   | The reply composer textarea has a **dashed border** style. It is **disabled** (cannot be typed into). A **tooltip** is shown on hover/focus explaining why (e.g., "This conversation is frozen"). |           |
| 11.7.2 | Open a broadcast with **allow_replies = false** (as a recipient) | The reply composer is disabled with a dashed border. The tooltip explains that replies are not allowed on this broadcast.                                                                         |           |
| 11.7.3 | Verify the Send button is also disabled                          | When the composer is disabled, the Send button is also disabled and not clickable.                                                                                                                |           |

### 11.8 Polling

| #      | What to Check                          | Expected Result                                                                                                                                                                       | Pass/Fail |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.8.1 | Open a thread and wait 30 seconds      | After 30 seconds, the thread re-fetches the conversation data. Check the Network tab for a repeated `GET /api/v1/inbox/conversations/{id}` call at approximately 30-second intervals. |           |
| 11.8.2 | Verify new messages appear via polling | If another user sends a message to this thread during the 30-second interval, the new message appears after the next poll completes.                                                  |           |

---

## 12. Thread Messages

Each message within a thread view is rendered as a message bubble. This section covers the anatomy of individual messages.

| #     | What to Check                                                 | Expected Result                                                                                                                                                                 | Pass/Fail |
| ----- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1  | Verify **own message** alignment and styling                  | Messages sent by the current user (Yusuf Rahman) are **right-aligned** with a **primary background colour** and **white text**.                                                 |           |
| 12.2  | Verify **other person's message** alignment and styling       | Messages sent by other participants are **left-aligned** with a **surface-secondary background** colour and standard text colour.                                               |           |
| 12.3  | Verify a **deleted message** rendering                        | Deleted messages are displayed as **centered italic text** (e.g., "This message was deleted"). No message body or attachments are shown.                                        |           |
| 12.4  | Verify **sender metadata** on group/broadcast messages        | For non-direct conversations, each message from another person shows the sender's name (and optionally avatar) above the message bubble.                                        |           |
| 12.5  | Verify the **message body** text                              | The body text is displayed within the bubble. Long text wraps naturally within the bubble width.                                                                                |           |
| 12.6  | Verify **URL auto-linking** in message body                   | Any URLs in the message body (e.g., "https://example.com") are rendered as clickable hyperlinks. They open in a new tab.                                                        |           |
| 12.7  | Verify **attachments** on a message with files                | Below the message body, each attachment is displayed as a row with: a **Paperclip icon**, the **filename**, the **file size** (human-readable), and a **Download icon** button. |           |
| 12.8  | Click the Download icon on an attachment                      | The file downloads to the user's device. The download initiates immediately.                                                                                                    |           |
| 12.9  | Verify the **timestamp** on each message                      | In the footer of each message bubble, the time is shown in **HH:mm** format (e.g., "14:35").                                                                                    |           |
| 12.10 | Verify the **"edited"** label on an edited message            | If a message has been edited, the label "edited" (or translated equivalent) appears next to the timestamp in the footer.                                                        |           |
| 12.11 | Verify **read receipt popover** on own messages               | On messages sent by the current user, a clickable "read_by" text (e.g., "Read by 3") is displayed in the footer area.                                                           |           |
| 12.12 | Click the read receipt text on an own message                 | A **popover** opens listing the people who have read the message (names and/or avatars).                                                                                        |           |
| 12.13 | Verify read receipts are NOT shown on other people's messages | Messages sent by others do not display the "read_by" text or popover trigger.                                                                                                   |           |
| 12.14 | Verify read receipt popover can be dismissed                  | Click outside the popover or press Escape to close it.                                                                                                                          |           |

---

## 13. Inbox Search

**URL:** `/en/inbox/search`

| #     | What to Check                                                        | Expected Result                                                                                                                                                                                                                             | Pass/Fail |
| ----- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1  | Navigate to `/en/inbox/search` (or submit a search from the sidebar) | The search page loads. An **h1 heading** reads "Search the inbox" (note: this is hardcoded in English).                                                                                                                                     |           |
| 13.2  | Verify the search input is **auto-focused**                          | The cursor is automatically placed in the search input field. The user can start typing immediately.                                                                                                                                        |           |
| 13.3  | Verify the Search button                                             | A **Search button** is displayed next to the input. It is **disabled** when the input has fewer than 2 characters.                                                                                                                          |           |
| 13.4  | Type "a" (1 character)                                               | The Search button remains disabled.                                                                                                                                                                                                         |           |
| 13.5  | Type "ab" (2 characters)                                             | The Search button becomes enabled.                                                                                                                                                                                                          |           |
| 13.6  | Verify the "before search" empty state                               | Before any search is performed, a message is displayed: "Type at least 2 characters..." (or similar guidance text).                                                                                                                         |           |
| 13.7  | Type "hello" and click the Search button (or press Enter)            | The API call `GET /api/v1/inbox/search?q=hello&page=1` is made. A **loading state** appears: a spinner and "Searching..." text.                                                                                                             |           |
| 13.8  | Verify loading state during search                                   | While the API call is in flight, a spinner icon and the text "Searching..." are displayed. No results are shown yet.                                                                                                                        |           |
| 13.9  | Verify search results (when results exist)                           | After the API responds with results: a **count** is displayed (e.g., "12 results found"). Below the count, a list of search hits is shown.                                                                                                  |           |
| 13.10 | Verify search hit anatomy                                            | Each search result row shows: the **subject** of the conversation, the **timestamp**, the **sender name**, and a **sanitized snippet** of the matching content. The matching text is highlighted with `<mark>` tags (visually highlighted). |           |
| 13.11 | Click on a search result row                                         | The browser navigates to the thread detail for that conversation (e.g., `/en/inbox/threads/{id}`).                                                                                                                                          |           |
| 13.12 | Verify "no results" state                                            | Search for a nonsensical term (e.g., "xyzzyplugh123"). After the API responds with zero results, a message displays "No results" along with an echo of the search query (e.g., "No results for 'xyzzyplugh123'").                           |           |
| 13.13 | Verify error state                                                   | If the API call fails, a **red box** with an error message is displayed (e.g., "Search failed" or the error text from the API).                                                                                                             |           |
| 13.14 | Verify pagination: Previous / Next buttons                           | When there are multiple pages of results, **Previous** and **Next** buttons are displayed below the result list. A page indicator is shown (e.g., "Page 1 of 3").                                                                           |           |
| 13.15 | Click the **Next** button                                            | The API call `GET /api/v1/inbox/search?q=hello&page=2` is made. The results update to show page 2. The page indicator updates.                                                                                                              |           |
| 13.16 | Click the **Previous** button (from page 2)                          | The results return to page 1. The Previous button becomes disabled on page 1.                                                                                                                                                               |           |
| 13.17 | Verify the Previous button is disabled on page 1                     | On the first page, the Previous button is disabled/greyed out.                                                                                                                                                                              |           |
| 13.18 | Verify the Next button is disabled on the last page                  | On the final page of results, the Next button is disabled/greyed out.                                                                                                                                                                       |           |

---

## 14. Saved Audiences List

**URL:** `/en/inbox/audiences`
**Requires:** Admin role

### 14.1 Page Load and Access

| #      | What to Check                                                    | Expected Result                                                                                    | Pass/Fail |
| ------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------- |
| 14.1.1 | Navigate to `/en/inbox/audiences` as Yusuf Rahman (School Owner) | The page loads with a **PageHeader** displaying the title "Audiences" (or translated equivalent).  |           |
| 14.1.2 | Verify admin-only access                                         | If a non-admin user navigates to this URL, they are redirected away (e.g., to `/en/inbox`).        |           |
| 14.1.3 | Verify the "New" button                                          | A button with a **Plus icon** and label "New" (or "New Audience") is displayed in the page header. |           |
| 14.1.4 | Click the "New" button                                           | Browser navigates to `/en/inbox/audiences/new`. The Create Audience page loads (see Section 15).   |           |

### 14.2 Search and Filters

| #      | What to Check                        | Expected Result                                                                                                 | Pass/Fail |
| ------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------- | --------- |
| 14.2.1 | Verify the search input              | A search input field is displayed above the audience table. It has a placeholder (e.g., "Search audiences..."). |           |
| 14.2.2 | Type "parents" into the search input | The audience list filters to show only audiences whose name or description contains "parents".                  |           |
| 14.2.3 | Clear the search input               | The full audience list is restored.                                                                             |           |
| 14.2.4 | Verify the kind filter pills         | Filter pills are displayed: **All**, **Static**, **Dynamic**. "All" is active by default.                       |           |
| 14.2.5 | Click the **Static** filter pill     | The list filters to show only static audiences. The pill becomes active.                                        |           |
| 14.2.6 | Click the **Dynamic** filter pill    | The list filters to show only dynamic audiences. The pill becomes active.                                       |           |
| 14.2.7 | Click the **All** filter pill        | The list shows all audiences again.                                                                             |           |

### 14.3 Loading, Empty, and Error States

| #      | What to Check                                           | Expected Result                                                                                                             | Pass/Fail |
| ------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.3.1 | Verify loading state on page load                       | While `GET /api/v1/inbox/audiences` is in flight, a loading indicator (skeleton or spinner) is shown in place of the table. |           |
| 14.3.2 | Verify empty state when no audiences exist (no search)  | If no audiences exist at all, an empty state message is displayed (e.g., "No audiences yet. Create one to get started.").   |           |
| 14.3.3 | Verify empty state when search/filter yields no results | A different empty state is shown (e.g., "No audiences match your search").                                                  |           |

### 14.4 Audience Table

| #      | What to Check                                     | Expected Result                                                                                                                                 | Pass/Fail |
| ------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.4.1 | Verify the table columns                          | The table has columns: **Name** (clickable), **Description** (hidden on mobile), **Kind** (badge), **Members** (count), **Actions** (dropdown). |           |
| 14.4.2 | Verify the Name column is clickable               | Clicking on an audience name navigates to `/en/inbox/audiences/{id}` (Edit Audience page — see Section 16).                                     |           |
| 14.4.3 | Verify the Description column is hidden on mobile | On viewports below the md breakpoint, the Description column is not rendered.                                                                   |           |
| 14.4.4 | Verify the Kind badge                             | Each row shows a badge: "Static" or "Dynamic" with appropriate styling (e.g., different colours).                                               |           |
| 14.4.5 | Verify the Members count                          | Each row shows the number of members in the audience (e.g., "45").                                                                              |           |
| 14.4.6 | Verify the Actions dropdown                       | Each row has an actions dropdown (three-dot menu or similar).                                                                                   |           |

### 14.5 Actions Dropdown

| #       | What to Check                               | Expected Result                                                                                                                                                                                      | Pass/Fail |
| ------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.5.1  | Click the Actions dropdown on a row         | A dropdown menu opens with 3 options: **View**, **Duplicate**, **Delete** (in red text).                                                                                                             |           |
| 14.5.2  | Click **View**                              | A **preview drawer** slides in from the side. It shows: the audience title, description, kind badge, last updated date, an **AudiencePreview** panel (showing resolved members), and action buttons. |           |
| 14.5.3  | Close the preview drawer                    | The drawer can be closed (X button or clicking outside). The table is visible again.                                                                                                                 |           |
| 14.5.4  | Click **Duplicate** in the actions dropdown | An API call is made to `POST /api/v1/inbox/audiences/{id}/duplicate`. On success, a **toast** appears (e.g., "Audience duplicated"). The list refreshes and shows the new copy.                      |           |
| 14.5.5  | Verify duplicate error: name already taken  | If a duplicate fails because the name is already taken, a **toast** appears with the specific error (e.g., "Audience name already exists").                                                          |           |
| 14.5.6  | Verify generic duplicate error              | If the duplicate fails for another reason, a **toast** appears (e.g., "Failed to duplicate audience").                                                                                               |           |
| 14.5.7  | Click **Delete** in the actions dropdown    | A **confirm dialog** opens. The dialog has a title (e.g., "Delete audience"), body text explaining the action is irreversible, and **Cancel** / **Confirm** buttons.                                 |           |
| 14.5.8  | Click Cancel in the delete confirm dialog   | The dialog closes. No deletion occurs.                                                                                                                                                               |           |
| 14.5.9  | Click Confirm in the delete confirm dialog  | The API call `DELETE /api/v1/inbox/audiences/{id}` is made. On success, a **toast** appears (e.g., "Audience deleted"). The audience is removed from the list.                                       |           |
| 14.5.10 | Verify delete error                         | If the deletion fails, a **toast** appears (e.g., "Failed to delete audience"). The audience remains in the list.                                                                                    |           |

---

## 15. Create Audience

**URL:** `/en/inbox/audiences/new`

| #     | What to Check                                            | Expected Result                                                                                                                                                                                                                                               | Pass/Fail |
| ----- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.1  | Navigate to `/en/inbox/audiences/new`                    | The page loads with a **PageHeader** displaying a title (e.g., "New Audience") and a **back button** that navigates to `/en/inbox/audiences`.                                                                                                                 |           |
| 15.2  | Click the back button                                    | Browser navigates back to `/en/inbox/audiences`.                                                                                                                                                                                                              |           |
| 15.3  | Verify the **name** input field                          | A text input labelled "Name" is displayed. It is required.                                                                                                                                                                                                    |           |
| 15.4  | Verify the **description** textarea                      | A textarea labelled "Description" is displayed. It is optional.                                                                                                                                                                                               |           |
| 15.5  | Verify the **kind** radio buttons                        | Two radio buttons are displayed: **Dynamic** and **Static**. One is selected by default.                                                                                                                                                                      |           |
| 15.6  | Select **Dynamic** kind                                  | The builder section shows the AudienceChipBuilder (see Section 8) for defining dynamic audience rules.                                                                                                                                                        |           |
| 15.7  | Select **Static** kind                                   | The builder section shows a member selection interface for adding specific people to a static audience.                                                                                                                                                       |           |
| 15.8  | Verify the **preview panel**                             | A panel on the side (or below on mobile) shows the estimated recipient count. For dynamic audiences, this updates as the builder definition changes.                                                                                                          |           |
| 15.9  | Verify name validation: 1-255 characters                 | Leaving the name empty and submitting shows a validation error. Entering more than 255 characters is prevented or shows an error.                                                                                                                             |           |
| 15.10 | Verify description validation: max 1024 characters       | Entering more than 1024 characters in the description shows a validation error.                                                                                                                                                                               |           |
| 15.11 | Submit with a valid dynamic audience (name + definition) | The API call `POST /api/v1/inbox/audiences` is made. Verify the request includes `GET /api/v1/inbox/audiences/providers` was called on load. On success, a **success toast** appears (e.g., "Audience created"). The browser navigates to the audiences list. |           |
| 15.12 | Submit a static audience without selecting any members   | Validation fails. An error indicates that static audiences require at least one member.                                                                                                                                                                       |           |
| 15.13 | Verify "name taken" error                                | If the API returns a name-conflict error, a **toast** appears (e.g., "An audience with this name already exists").                                                                                                                                            |           |
| 15.14 | Verify "cycle detected" error                            | If the API returns a cycle-detection error (audience referencing itself), a **toast** appears (e.g., "Circular reference detected").                                                                                                                          |           |
| 15.15 | Verify generic error                                     | If the API returns any other error, a **toast** appears (e.g., "Failed to create audience").                                                                                                                                                                  |           |

---

## 16. Edit Audience

**URL:** `/en/inbox/audiences/[id]`

### 16.1 Page Load

| #      | What to Check                                                   | Expected Result                                                                                                            | Pass/Fail |
| ------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1.1 | Navigate to `/en/inbox/audiences/{id}` for an existing audience | The page loads. The AudienceForm is populated with the audience's current name, description, kind, and definition/members. |           |
| 16.1.2 | Verify loading state                                            | While the API call `GET /api/v1/inbox/audiences/{id}` is in flight, a loading indicator is displayed.                      |           |
| 16.1.3 | Navigate to a non-existent audience ID                          | A **not found** state is displayed (e.g., "Audience not found" or a 404 message).                                          |           |

### 16.2 Header and Actions

| #      | What to Check                          | Expected Result                                                                                                                   | Pass/Fail |
| ------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.2.1 | Verify the PageHeader                  | The header shows the audience's name as the title.                                                                                |           |
| 16.2.2 | Verify the **back button**             | A back button is displayed that navigates to `/en/inbox/audiences`.                                                               |           |
| 16.2.3 | Click the back button                  | Browser navigates to the audiences list.                                                                                          |           |
| 16.2.4 | Verify the **Duplicate** action button | A Duplicate button is available in the header actions.                                                                            |           |
| 16.2.5 | Click Duplicate                        | The API call `POST /api/v1/inbox/audiences/{id}/duplicate` is made. On success, a **toast** appears and the list refreshes.       |           |
| 16.2.6 | Verify the **Delete** action button    | A Delete button (or dropdown option) is available in the header actions.                                                          |           |
| 16.2.7 | Click Delete                           | A confirm dialog appears. On confirmation, `DELETE /api/v1/inbox/audiences/{id}` is called. On success, toast + navigate to list. |           |

### 16.3 Form Editing

| #      | What to Check                                                  | Expected Result                                                                                                      | Pass/Fail |
| ------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.3.1 | Verify the **kind** radio is **locked**                        | The kind (Dynamic/Static) radio buttons are disabled. The kind cannot be changed after creation (`lockKind=true`).   |           |
| 16.3.2 | Edit the name field                                            | The name can be changed.                                                                                             |           |
| 16.3.3 | Edit the description field                                     | The description can be changed.                                                                                      |           |
| 16.3.4 | Edit the audience definition (dynamic) or member list (static) | The builder/member selector can be modified.                                                                         |           |
| 16.3.5 | Submit changes                                                 | The API call `PATCH /api/v1/inbox/audiences/{id}` is made. On success, a **toast** appears (e.g., "Audience saved"). |           |
| 16.3.6 | Verify save error toast                                        | If the save fails, an **error toast** appears.                                                                       |           |

### 16.4 Resolve Now (Dynamic Audiences Only)

| #      | What to Check                                                        | Expected Result                                                                                                         | Pass/Fail |
| ------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.4.1 | Verify the "Resolve Now" section is visible for dynamic audiences    | A section with a **Run** button is displayed, allowing the user to resolve the dynamic audience to see current members. |           |
| 16.4.2 | Verify the "Resolve Now" section is NOT visible for static audiences | Static audiences do not show this section.                                                                              |           |
| 16.4.3 | Click the **Run** button                                             | The API call `GET /api/v1/inbox/audiences/{id}/resolve` is made. While loading, a spinner is shown.                     |           |
| 16.4.4 | Verify resolved results                                              | After the API responds, the resolved member count is displayed. A table of resolved users is shown with pagination.     |           |
| 16.4.5 | Verify pagination in the resolved user table                         | If there are many resolved members, Previous/Next or page number controls are available.                                |           |
| 16.4.6 | Verify resolve error                                                 | If the resolve call fails, an error toast or inline error is shown.                                                     |           |

---

## 17. Oversight Dashboard

**URL:** `/en/inbox/oversight`
**Requires:** Admin-tier role (school_owner, school_principal, school_vice_principal). The "admin" role does NOT have access.

### 17.1 Access Control

| #      | What to Check                                                                              | Expected Result                                                                       | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | --------- |
| 17.1.1 | Navigate to `/en/inbox/oversight` as Yusuf Rahman (School Owner)                           | The page loads successfully. The Oversight Dashboard is displayed.                    |           |
| 17.1.2 | Navigate to `/en/inbox/oversight` as a user with the "admin" role (not owner/principal/VP) | The user is **redirected to `/en/inbox`**. The oversight dashboard is not accessible. |           |
| 17.1.3 | Navigate to `/en/inbox/oversight` as a teacher                                             | The user is redirected away. The oversight dashboard is not accessible.               |           |

### 17.2 Oversight Banner

| #      | What to Check                                   | Expected Result                                                                                                                                                                  | Pass/Fail |
| ------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.2.1 | Verify the Oversight Banner is always displayed | An **amber-coloured banner** is shown at the top of the oversight page. It contains a **ShieldAlert icon** and text explaining that the user is viewing the oversight dashboard. |           |
| 17.2.2 | Verify the banner persists across tabs          | When switching between the three oversight tabs (Conversations, Flags, Audit), the banner remains visible at all times.                                                          |           |

### 17.3 Tab Navigation

| #      | What to Check                                 | Expected Result                                                                                                             | Pass/Fail |
| ------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.3.1 | Verify the 3 tabs                             | Three tabs are displayed: **Conversations** (with History icon), **Flags** (with Flag icon), **Audit** (with History icon). |           |
| 17.3.2 | Verify count badges on tabs                   | Each tab shows a count badge indicating the number of items (e.g., "Conversations (42)", "Flags (5)", "Audit (128)").       |           |
| 17.3.3 | Verify Conversations tab is active by default | The Conversations tab is selected when the oversight page first loads.                                                      |           |
| 17.3.4 | Click the **Flags** tab                       | The Flags tab content loads. The tab becomes active.                                                                        |           |
| 17.3.5 | Click the **Audit** tab                       | The Audit tab content loads. The tab becomes active.                                                                        |           |
| 17.3.6 | Click the **Conversations** tab again         | The Conversations tab content reloads.                                                                                      |           |

### 17.4 Conversations Tab

| #      | What to Check                                      | Expected Result                                                                                                                                              | Pass/Fail |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 17.4.1 | Verify the Conversations tab content               | A DataTable is displayed with columns: **Subject**, **Kind** (badge), **Participants**, **Last Message** (timestamp), **State** (badges for frozen/flagged). |           |
| 17.4.2 | Verify the API call                                | `GET /api/v1/inbox/oversight/conversations?page=1&pageSize=20` is called.                                                                                    |           |
| 17.4.3 | Verify the Kind badge                              | Each row shows a kind badge: "Direct", "Group", or "Broadcast" with appropriate styling.                                                                     |           |
| 17.4.4 | Verify the Participants column                     | Each row shows a count or list of participants.                                                                                                              |           |
| 17.4.5 | Verify the Last Message column                     | Each row shows the timestamp of the most recent message.                                                                                                     |           |
| 17.4.6 | Verify the State column for a frozen conversation  | A **frozen badge** (e.g., lock icon + "Frozen") is shown for conversations that are currently frozen.                                                        |           |
| 17.4.7 | Verify the State column for a flagged conversation | A **flagged badge** (e.g., flag icon + "Flagged") is shown for conversations that have active flags.                                                         |           |
| 17.4.8 | Click on a conversation row                        | Browser navigates to `/en/inbox/oversight/threads/{id}`. The Oversight Thread Detail loads (see Section 20).                                                 |           |
| 17.4.9 | Verify pagination                                  | If there are more than 20 conversations, pagination controls are available (Previous/Next or page numbers).                                                  |           |

### 17.5 Flags Tab

| #       | What to Check                                 | Expected Result                                                                                                                                                                         | Pass/Fail |
| ------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.5.1  | Click the Flags tab                           | The flags tab content loads.                                                                                                                                                            |           |
| 17.5.2  | Verify the filter pills                       | Filter pills are displayed: **Pending**, **Dismissed**, **Escalated**, **Frozen**. One is active by default (Pending).                                                                  |           |
| 17.5.3  | Click the **Pending** filter pill             | The flags list shows only flags with `review_state=pending`. The API call includes `review_state=pending`.                                                                              |           |
| 17.5.4  | Click the **Dismissed** filter pill           | The flags list shows only dismissed flags. The API includes `review_state=dismissed`.                                                                                                   |           |
| 17.5.5  | Click the **Escalated** filter pill           | The flags list shows only escalated flags. The API includes `review_state=escalated`.                                                                                                   |           |
| 17.5.6  | Click the **Frozen** filter pill              | The flags list shows only flags related to frozen conversations. The API includes `review_state=frozen`.                                                                                |           |
| 17.5.7  | Verify the DataTable columns                  | Columns: **Keywords** (badges), **Severity** (StatusBadge), **Participants**, **Review State**, **Created** (timestamp), **Actions** (4 buttons).                                       |           |
| 17.5.8  | Verify the Keywords column                    | Each flag row shows one or more keyword badges (the matched safeguarding keywords).                                                                                                     |           |
| 17.5.9  | Verify the Severity column                    | Each flag shows a severity StatusBadge (e.g., "Low", "Medium", "High", "Critical") with appropriate colour coding.                                                                      |           |
| 17.5.10 | Verify the Review State column                | Shows the current state: "Pending", "Dismissed", "Escalated", or "Frozen".                                                                                                              |           |
| 17.5.11 | Verify the Actions column has 4 buttons       | Each pending flag row has: **Open** (eye/link icon), **Dismiss** (opens FlagReviewModal), **Escalate** (flame icon, opens FlagReviewModal), **Freeze** (lock icon, opens FreezeDialog). |           |
| 17.5.12 | Click **Open** on a flag row                  | Browser navigates to the oversight thread detail for the associated conversation.                                                                                                       |           |
| 17.5.13 | Click **Dismiss** on a flag row               | The **Flag Review Modal** opens in dismiss mode (see Section 18).                                                                                                                       |           |
| 17.5.14 | Click **Escalate** (flame icon) on a flag row | The **Flag Review Modal** opens in escalate mode (see Section 18).                                                                                                                      |           |
| 17.5.15 | Click **Freeze** (lock icon) on a flag row    | The **Freeze Dialog** opens (see Section 19).                                                                                                                                           |           |
| 17.5.16 | Verify the API call                           | `GET /api/v1/inbox/oversight/flags?page=1&pageSize=20&review_state=pending` (or whichever filter is active).                                                                            |           |
| 17.5.17 | Verify pagination                             | Pagination controls are available if more than 20 flags exist.                                                                                                                          |           |

### 17.6 Audit Tab

| #      | What to Check                     | Expected Result                                                                                          | Pass/Fail |
| ------ | --------------------------------- | -------------------------------------------------------------------------------------------------------- | --------- |
| 17.6.1 | Click the Audit tab               | The audit log content loads.                                                                             |           |
| 17.6.2 | Verify the DataTable columns      | Columns: **Timestamp**, **Actor** (first 8 characters of UUID), **Action** (badge), **Conversation ID**. |           |
| 17.6.3 | Verify the Timestamp column       | Each row shows a human-readable timestamp.                                                               |           |
| 17.6.4 | Verify the Actor column           | Each row shows the first 8 characters of the actor's UUID (truncated).                                   |           |
| 17.6.5 | Verify the Action column          | Each row shows an action badge (e.g., "freeze", "unfreeze", "dismiss_flag", "escalate_flag", "export").  |           |
| 17.6.6 | Verify the Conversation ID column | Each row shows the conversation UUID associated with the action.                                         |           |
| 17.6.7 | Verify the API call               | `GET /api/v1/inbox/oversight/audit-log?page=1&pageSize=20` is called.                                    |           |
| 17.6.8 | Verify pagination                 | Pagination controls are available if more than 20 audit entries exist.                                   |           |

---

## 18. Flag Review Modal

The Flag Review Modal is opened from the Flags tab when clicking Dismiss or Escalate on a flag row.

### 18.1 Dismiss Mode

| #      | What to Check                                   | Expected Result                                                                                                                                                                              | Pass/Fail |
| ------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 18.1.1 | Click Dismiss on a flag row                     | A modal dialog opens with a **dismiss-specific title** (e.g., "Dismiss Flag").                                                                                                               |           |
| 18.1.2 | Verify the dismiss-specific description         | The modal body shows a description explaining what dismissing a flag means.                                                                                                                  |           |
| 18.1.3 | Verify the **Notes** textarea                   | A textarea with 4 rows is displayed. A placeholder prompts the user to enter notes.                                                                                                          |           |
| 18.1.4 | Verify the Cancel button                        | A Cancel button (outline style) is displayed in the footer.                                                                                                                                  |           |
| 18.1.5 | Verify the Dismiss action button                | An action button (outline style, not destructive) is displayed in the footer labelled "Dismiss" or equivalent.                                                                               |           |
| 18.1.6 | Click the action button with empty notes        | A **toast** appears indicating notes are required (e.g., "Notes are required"). The modal remains open.                                                                                      |           |
| 18.1.7 | Enter notes and click the Dismiss action button | The API call `POST /api/v1/inbox/oversight/flags/{id}/dismiss` is made with the notes. On success, a **toast** appears (e.g., "Flag dismissed"). The modal closes. The flags list refreshes. |           |
| 18.1.8 | Click Cancel                                    | The modal closes. No API call is made.                                                                                                                                                       |           |
| 18.1.9 | Verify dismiss API error                        | If the API call fails, a **toast** appears (e.g., "Failed to dismiss flag"). The modal remains open.                                                                                         |           |

### 18.2 Escalate Mode

| #       | What to Check                                    | Expected Result                                                                                                                                                                            | Pass/Fail |
| ------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 18.2.1  | Click Escalate (flame icon) on a flag row        | A modal dialog opens with an **escalate-specific title** (e.g., "Escalate Flag").                                                                                                          |           |
| 18.2.2  | Verify the escalate-specific description         | The modal body shows a description explaining what escalating a flag means.                                                                                                                |           |
| 18.2.3  | Verify the Notes textarea                        | Same as 18.1.3 — a textarea with 4 rows and placeholder.                                                                                                                                   |           |
| 18.2.4  | Verify the Escalate action button                | The action button is styled as **destructive** (red). It is labelled "Escalate" or equivalent.                                                                                             |           |
| 18.2.5  | Click the action button with empty notes         | A **toast** appears indicating notes are required. The modal remains open.                                                                                                                 |           |
| 18.2.6  | Enter notes and click the Escalate action button | The API call `POST /api/v1/inbox/oversight/flags/{id}/escalate` is made with the notes.                                                                                                    |           |
| 18.2.7  | Verify escalate success with export URL          | On success, the API response includes an `export_url`. A **toast** appears with a **download link** (e.g., "Flag escalated. Download report"). The modal closes. The flags list refreshes. |           |
| 18.2.8  | Click the download link in the toast             | The exported PDF/report file downloads.                                                                                                                                                    |           |
| 18.2.9  | Click Cancel                                     | The modal closes. No API call is made.                                                                                                                                                     |           |
| 18.2.10 | Verify escalate API error                        | If the API call fails, a **toast** appears (e.g., "Failed to escalate flag"). The modal remains open.                                                                                      |           |

---

## 19. Freeze Dialog

The Freeze Dialog is opened from the Flags tab when clicking Freeze on a flag row, or from the Oversight Thread Detail.

| #    | What to Check                                                 | Expected Result                                                                                                                                          | Pass/Fail |
| ---- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 19.1 | Click Freeze (lock icon) on a flag row                        | A dialog opens with a title (e.g., "Freeze Conversation").                                                                                               |           |
| 19.2 | Verify the dialog body description                            | The body text explains what freezing a conversation means (all participants will be unable to send messages).                                            |           |
| 19.3 | Verify the **Reason** textarea                                | A textarea with 3 rows is displayed. A placeholder prompts the user to enter a reason for freezing.                                                      |           |
| 19.4 | Verify the Freeze button is **disabled** when reason is empty | The Freeze button (destructive styling, red) is disabled/greyed out until the user types at least one character in the reason field.                     |           |
| 19.5 | Type a reason into the textarea                               | The Freeze button becomes enabled.                                                                                                                       |           |
| 19.6 | Click the Freeze button                                       | The API call `POST /api/v1/inbox/oversight/conversations/{id}/freeze` is made with the reason.                                                           |           |
| 19.7 | Verify freeze success                                         | On success, a **toast** appears (e.g., "Conversation frozen"). The dialog closes. The flags list or thread detail refreshes to reflect the frozen state. |           |
| 19.8 | Verify freeze error                                           | If the API call fails, a **toast** appears (e.g., "Failed to freeze conversation"). The dialog remains open.                                             |           |
| 19.9 | Click Cancel                                                  | The dialog closes without making any API call.                                                                                                           |           |

---

## 20. Oversight Thread Detail

**URL:** `/en/inbox/oversight/threads/[id]`
**Requires:** Admin-tier role (school_owner, school_principal, school_vice_principal)

### 20.1 Page Load

| #      | What to Check                                  | Expected Result                                                                        | Pass/Fail |
| ------ | ---------------------------------------------- | -------------------------------------------------------------------------------------- | --------- |
| 20.1.1 | Navigate to `/en/inbox/oversight/threads/{id}` | The page loads. The API call `GET /api/v1/inbox/oversight/conversations/{id}` is made. |           |
| 20.1.2 | Verify loading state                           | While the API is loading, a loading indicator is displayed.                            |           |
| 20.1.3 | Navigate to a non-existent thread ID           | A **not found** state is displayed (e.g., "Conversation not found").                   |           |

### 20.2 Banner and Header

| #      | What to Check                                  | Expected Result                                                                                  | Pass/Fail |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| 20.2.1 | Verify the Oversight Banner is displayed       | The same amber OversightBanner (ShieldAlert icon) is shown at the top, same as on the dashboard. |           |
| 20.2.2 | Verify the PageHeader                          | The header shows the conversation **subject** and **kind** (e.g., "Direct" or "Group").          |           |
| 20.2.3 | Verify the **Back to Dashboard** action button | A button labelled "Back to Dashboard" (or with a back arrow) navigates to `/en/inbox/oversight`. |           |
| 20.2.4 | Click Back to Dashboard                        | Browser navigates to `/en/inbox/oversight`.                                                      |           |

### 20.3 Freeze / Unfreeze Actions

| #      | What to Check                                                       | Expected Result                                                                                                                                                                                                            | Pass/Fail |
| ------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.3.1 | Verify the Freeze/Unfreeze button for a **non-frozen** conversation | A **Freeze** button (lock icon) is displayed in the header actions.                                                                                                                                                        |           |
| 20.3.2 | Click the Freeze button                                             | The **Freeze Dialog** opens (see Section 19).                                                                                                                                                                              |           |
| 20.3.3 | Verify the Freeze/Unfreeze button for a **frozen** conversation     | An **Unfreeze** button is displayed instead of Freeze.                                                                                                                                                                     |           |
| 20.3.4 | Click the Unfreeze button                                           | The API call `POST /api/v1/inbox/oversight/conversations/{id}/unfreeze` is made. On success, a **toast** appears (e.g., "Conversation unfrozen"). The page refreshes to remove the frozen banner and re-enable the thread. |           |
| 20.3.5 | Verify unfreeze error                                               | If the unfreeze call fails, an **error toast** appears (e.g., "Failed to unfreeze conversation").                                                                                                                          |           |

### 20.4 Export Action

| #      | What to Check                        | Expected Result                                                                                                                                                                | Pass/Fail |
| ------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 20.4.1 | Verify the Export button             | An **Export** button is displayed in the header actions.                                                                                                                       |           |
| 20.4.2 | Click the Export button              | The API call `POST /api/v1/inbox/oversight/conversations/{id}/export` is made. On success, a **toast** appears with a **download link** (e.g., "Export ready. Download here"). |           |
| 20.4.3 | Click the download link in the toast | The exported conversation file (PDF or JSON) downloads.                                                                                                                        |           |
| 20.4.4 | Verify export error                  | If the export call fails, an **error toast** appears.                                                                                                                          |           |

### 20.5 Frozen Banner

| #      | What to Check                               | Expected Result                                                                                                                                                                                          | Pass/Fail |
| ------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.5.1 | View a frozen conversation in oversight     | An **amber banner** is displayed below the header. It shows a **Lock icon**, the text indicating the conversation is frozen, the **reason** for freezing, and the **"since" date** (when it was frozen). |           |
| 20.5.2 | View a non-frozen conversation in oversight | No frozen banner is displayed.                                                                                                                                                                           |           |

### 20.6 Flag Focus Banner

| #      | What to Check                                                    | Expected Result                                                                                                                               | Pass/Fail |
| ------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.6.1 | Navigate to an oversight thread with `?flag={flagId}` in the URL | A **flag focus banner** is displayed, highlighting the specific flag that brought the user to this thread. The banner shows the flag details. |           |
| 20.6.2 | Navigate to an oversight thread without the `?flag=` parameter   | No flag focus banner is displayed.                                                                                                            |           |

### 20.7 Participants Section

| #      | What to Check                   | Expected Result                                                                                                                                    | Pass/Fail |
| ------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.7.1 | Verify the participants section | A section lists all participants in the conversation. Each participant shows their name and a **role badge** (e.g., "Teacher", "Parent", "Owner"). |           |
| 20.7.2 | Verify participant count        | The number of listed participants matches the conversation's participant count.                                                                    |           |

### 20.8 Messages Section

| #      | What to Check                                           | Expected Result                                                                                                                 | Pass/Fail |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.8.1 | Verify messages are displayed                           | All messages in the conversation are listed in chronological order.                                                             |           |
| 20.8.2 | Verify sender information on each message               | Each message shows the **sender name** and **timestamp**.                                                                       |           |
| 20.8.3 | Verify the message body                                 | The full message body text is displayed for each message.                                                                       |           |
| 20.8.4 | Verify **deleted message** rendering                    | Deleted messages are shown with **strikethrough** text styling (not hidden — oversight can see all messages).                   |           |
| 20.8.5 | Verify **edit history toggle**                          | For edited messages, a toggle/link is available to expand and view the edit history (previous versions of the message).         |           |
| 20.8.6 | Click the edit history toggle                           | The edit history expands, showing the previous versions of the message with timestamps.                                         |           |
| 20.8.7 | Verify there is NO reply composer in the oversight view | The oversight thread detail is read-only. There is no reply textarea or send button. The admin is observing, not participating. |           |

---

## 21. Announcements List

**URL:** `/en/communications/announcements`
**Requires:** Admin role + `communications.view` permission

### 21.1 Page Load

| #      | What to Check                                           | Expected Result                                                                                  | Pass/Fail |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| 21.1.1 | Navigate to `/en/communications/announcements`          | The page loads with a **PageHeader** displaying "Announcements" (or translated equivalent).      |           |
| 21.1.2 | Verify admin-only access                                | Non-admin users cannot access this page (redirected away).                                       |           |
| 21.1.3 | Verify the **"Manage Audiences"** button                | A button labelled "Manage Audiences" is displayed in the header area.                            |           |
| 21.1.4 | Click the "Manage Audiences" button                     | Browser navigates to `/en/inbox/audiences`.                                                      |           |
| 21.1.5 | Navigate back. Verify the **"New Announcement"** button | A button labelled "New Announcement" (or with a Plus icon) is displayed in the header.           |           |
| 21.1.6 | Click the "New Announcement" button                     | Browser navigates to `/en/communications/new`. The New Announcement form loads (see Section 22). |           |

### 21.2 Status Tabs

| #      | What to Check                         | Expected Result                                                                             | Pass/Fail |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------- | --------- |
| 21.2.1 | Verify the status tabs                | Five tabs are displayed: **All**, **Draft**, **Scheduled**, **Published**, **Archived**.    |           |
| 21.2.2 | Verify "All" tab is active by default | The "All" tab is selected on page load.                                                     |           |
| 21.2.3 | Click the **Draft** tab               | The list filters to show only draft announcements. The API call includes `status=draft`.    |           |
| 21.2.4 | Click the **Scheduled** tab           | The list filters to show only scheduled announcements. The API includes `status=scheduled`. |           |
| 21.2.5 | Click the **Published** tab           | The list filters to show only published announcements. The API includes `status=published`. |           |
| 21.2.6 | Click the **Archived** tab            | The list filters to show only archived announcements. The API includes `status=archived`.   |           |

### 21.3 DataTable

| #      | What to Check                  | Expected Result                                                                                                 | Pass/Fail |
| ------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------- | --------- |
| 21.3.1 | Verify the table columns       | Columns: **Title**, **Scope**, **Status** (badge), **Published At**, **Author**.                                |           |
| 21.3.2 | Verify the Title column        | Each row shows the announcement title. It is clickable.                                                         |           |
| 21.3.3 | Verify the Scope column        | Each row shows the scope of the announcement (e.g., "School", "Year Group", "Class", "Household", "Custom").    |           |
| 21.3.4 | Verify the Status badge        | Each row shows a coloured badge: "Draft" (neutral), "Scheduled" (blue), "Published" (green), "Archived" (grey). |           |
| 21.3.5 | Verify the Published At column | Published announcements show the publication date/time. Drafts show a dash or empty.                            |           |
| 21.3.6 | Verify the Author column       | Each row shows the name of the user who created the announcement.                                               |           |
| 21.3.7 | Click on an announcement row   | Browser navigates to `/en/communications/{id}`. The Announcement Detail page loads (see Section 23).            |           |
| 21.3.8 | Verify the API call            | `GET /api/v1/announcements?page=1&pageSize=20` is called (with optional `status` filter).                       |           |

### 21.4 Empty State

| #      | What to Check                                                         | Expected Result                                                                                     | Pass/Fail |
| ------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------- |
| 21.4.1 | Verify empty state when no announcements exist (or filtered to empty) | An empty state is displayed with a **Megaphone icon** and a message (e.g., "No announcements yet"). |           |
| 21.4.2 | Verify the "New Announcement" button is still accessible              | Even in the empty state, the header button to create a new announcement is available.               |           |

---

## 22. New Announcement

**URL:** `/en/communications/new`
**Requires:** Admin role + `communications.manage` permission

### 22.1 Page Structure

| #      | What to Check                        | Expected Result                                                                        | Pass/Fail |
| ------ | ------------------------------------ | -------------------------------------------------------------------------------------- | --------- |
| 22.1.1 | Navigate to `/en/communications/new` | The page loads with a **PageHeader** (e.g., "New Announcement") and a **back button**. |           |
| 22.1.2 | Click the back button                | Browser navigates to `/en/communications/announcements`.                               |           |

### 22.2 Form Fields

| #       | What to Check                            | Expected Result                                                                                                         | Pass/Fail |
| ------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 22.2.1  | Verify the **title** field               | A text input labelled "Title" is displayed. It has a `maxLength` of 200 characters.                                     |           |
| 22.2.2  | Verify the **body** textarea             | A textarea labelled "Body" or "Content" is displayed with approximately **8 rows** of height.                           |           |
| 22.2.3  | Verify the **scope** select              | A dropdown/select labelled "Scope" with options: **School**, **Year Group**, **Class**, **Household**, **Custom**.      |           |
| 22.2.4  | Select scope "School"                    | No additional target selection is needed. The announcement targets the entire school.                                   |           |
| 22.2.5  | Select scope "Year Group"                | A **target IDs** field appears (e.g., a multi-select of year groups). The user must select which year groups to target. |           |
| 22.2.6  | Select scope "Class"                     | A target IDs field appears for selecting specific classes.                                                              |           |
| 22.2.7  | Select scope "Household"                 | A target IDs field appears for selecting specific households.                                                           |           |
| 22.2.8  | Select scope "Custom"                    | A custom audience target selector appears.                                                                              |           |
| 22.2.9  | Verify the **delivery channels** section | Checkboxes for delivery channels: **In-app** (always checked, locked/disabled), **Email**, **WhatsApp**, **SMS**.       |           |
| 22.2.10 | Verify the In-app channel is locked on   | The In-app checkbox is checked and disabled. It cannot be unchecked.                                                    |           |
| 22.2.11 | Toggle Email, WhatsApp, SMS channels     | Each channel can be toggled on or off independently.                                                                    |           |
| 22.2.12 | Verify the **schedule toggle**           | A toggle/switch for "Schedule" is displayed. When off, the announcement can be published immediately.                   |           |
| 22.2.13 | Enable the schedule toggle               | A **datetime picker** appears, allowing the user to set a future publish date and time.                                 |           |
| 22.2.14 | Disable the schedule toggle              | The datetime picker disappears.                                                                                         |           |

### 22.3 Action Buttons

| #      | What to Check                         | Expected Result                                                             | Pass/Fail |
| ------ | ------------------------------------- | --------------------------------------------------------------------------- | --------- |
| 22.3.1 | Verify the **"Save as Draft"** button | A button with **outline** styling labelled "Save as Draft" is displayed.    |           |
| 22.3.2 | Verify the **"Publish"** button       | A button with **default** (filled) styling labelled "Publish" is displayed. |           |

### 22.4 Validation — Save as Draft

| #      | What to Check                                | Expected Result                                                                                                                | Pass/Fail |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 22.4.1 | Click "Save as Draft" with all fields empty  | Validation fails. A message indicates that the **title is required** even for drafts.                                          |           |
| 22.4.2 | Enter a title only and click "Save as Draft" | Validation passes. The API call `POST /api/v1/announcements` is made with `status=draft`. The body is not required for drafts. |           |
| 22.4.3 | Verify save draft success                    | A **success toast** appears (e.g., "Draft saved"). The browser navigates to the announcement detail or announcements list.     |           |
| 22.4.4 | Verify save draft error                      | If the API fails, an **error toast** appears (e.g., "Failed to save draft"). The form remains open.                            |           |

### 22.5 Validation — Publish

| #      | What to Check                                    | Expected Result                                                                                                                  | Pass/Fail |
| ------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 22.5.1 | Click "Publish" with title empty                 | Validation fails. Title is required.                                                                                             |           |
| 22.5.2 | Click "Publish" with title filled but body empty | Validation fails. **Body is required for publishing** (not just for drafts).                                                     |           |
| 22.5.3 | Fill title and body, click "Publish"             | The API calls `POST /api/v1/announcements` (to create) then `POST /api/v1/announcements/{id}/publish` (to publish).              |           |
| 22.5.4 | Verify publish success                           | A **success toast** appears (e.g., "Announcement published"). The browser navigates to the announcements list or detail page.    |           |
| 22.5.5 | Verify publish error                             | If the publish call fails, an **error toast** appears (e.g., "Failed to publish announcement").                                  |           |
| 22.5.6 | Verify hardcoded validation messages             | The validation error messages for this form are hardcoded strings (not translation keys). Verify they are readable and accurate. |           |

---

## 23. Announcement Detail

**URL:** `/en/communications/[id]`
**Requires:** Admin role + `communications.view` permission

### 23.1 Page Load

| #      | What to Check                                                      | Expected Result                                                                                             | Pass/Fail |
| ------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | --------- |
| 23.1.1 | Navigate to `/en/communications/{id}` for an existing announcement | The page loads. The API call `GET /api/v1/announcements/{id}` is made.                                      |           |
| 23.1.2 | Verify loading state                                               | While the API is loading, loading skeletons are displayed (placeholder shapes for the title, body, status). |           |
| 23.1.3 | Navigate to a non-existent announcement ID                         | A **not found** state is displayed.                                                                         |           |

### 23.2 Header and Actions

| #      | What to Check                                                  | Expected Result                                                                                         | Pass/Fail |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------- |
| 23.2.1 | Verify the PageHeader                                          | The header shows the announcement **title** and an author line (e.g., "by Yusuf Rahman").               |           |
| 23.2.2 | Verify the **Back** button                                     | A back button navigates to `/en/communications/announcements`.                                          |           |
| 23.2.3 | Click the Back button                                          | Browser navigates to the announcements list.                                                            |           |
| 23.2.4 | Verify the **Archive** button (for non-archived announcements) | An Archive button is visible in the header actions. It is NOT shown for already-archived announcements. |           |
| 23.2.5 | Verify the **Save** button (for draft announcements)           | A Save button is shown only when the announcement is in **draft** status.                               |           |
| 23.2.6 | Verify the **Publish** button (for draft announcements)        | A Publish button is shown only when the announcement is in **draft** status.                            |           |

### 23.3 Status Badge Row

| #      | What to Check                                           | Expected Result                                                                                      | Pass/Fail |
| ------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------- |
| 23.3.1 | Verify the status badge                                 | A prominent badge shows the announcement's current status: Draft, Scheduled, Published, or Archived. |           |
| 23.3.2 | Verify the published date (for published announcements) | If published, the publication date is shown (e.g., "Published on 11 Apr 2026 at 10:30").             |           |
| 23.3.3 | Verify the scheduled date (for scheduled announcements) | If scheduled, the scheduled date is shown (e.g., "Scheduled for 15 Apr 2026 at 09:00").              |           |
| 23.3.4 | Verify the scope label                                  | The scope is displayed (e.g., "Scope: Entire school" or "Scope: Year Group — 3rd Class").            |           |

### 23.4 Content Area

| #      | What to Check                                                   | Expected Result                                                                                                                            | Pass/Fail |
| ------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 23.4.1 | Verify the content is **editable** for draft announcements      | When the announcement is a draft, the title and body fields are editable (input and textarea).                                             |           |
| 23.4.2 | Verify the content is **read-only** for non-draft announcements | When the announcement is published, scheduled, or archived, the title and body are displayed as static text (not editable).                |           |
| 23.4.3 | Edit the title and body of a draft, then click Save             | The API call `PATCH /api/v1/announcements/{id}` is made with the updated fields. A **success toast** appears (e.g., "Announcement saved"). |           |
| 23.4.4 | Verify save error                                               | If the save fails, an **error toast** appears.                                                                                             |           |

### 23.5 Publish and Archive Actions

| #      | What to Check                                 | Expected Result                                                                                                                                                                                                                          | Pass/Fail |
| ------ | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 23.5.1 | Click **Publish** on a draft announcement     | The API call `POST /api/v1/announcements/{id}/publish` is made. On success, a **toast** appears. The status badge changes to "Published". The content becomes read-only. The Save/Publish buttons disappear. The Archive button appears. |           |
| 23.5.2 | Verify publish error                          | If the publish fails, an **error toast** appears. The announcement remains in draft.                                                                                                                                                     |           |
| 23.5.3 | Click **Archive** on a published announcement | The API call `POST /api/v1/announcements/{id}/archive` is made. On success, a **toast** appears. The status badge changes to "Archived". The Archive button disappears.                                                                  |           |
| 23.5.4 | Verify archive error                          | If the archive fails, an **error toast** appears.                                                                                                                                                                                        |           |

### 23.6 Delivery Stats Panel (Published Announcements Only)

| #      | What to Check                                                                  | Expected Result                                                          | Pass/Fail |
| ------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | --------- |
| 23.6.1 | Verify the delivery stats panel is shown for published announcements           | A panel or section displays delivery statistics.                         |           |
| 23.6.2 | Verify the delivery stats panel is NOT shown for draft/scheduled announcements | No stats panel is visible for non-published announcements.               |           |
| 23.6.3 | Verify the **queued** count                                                    | The stats show the number of notifications queued (e.g., "Queued: 150"). |           |
| 23.6.4 | Verify the **sent** count                                                      | The stats show the number of notifications sent (e.g., "Sent: 148").     |           |
| 23.6.5 | Verify the **delivered** count                                                 | The stats show the number of notifications delivered.                    |           |
| 23.6.6 | Verify the **failed** count                                                    | The stats show the number of failed deliveries.                          |           |
| 23.6.7 | Verify the **read** count                                                      | The stats show the number of read/acknowledged notifications.            |           |

---

## 24. Admin Inquiries List

**URL:** `/en/communications/inquiries`
**Requires:** Admin role

### 24.1 Page Load

| #      | What to Check                              | Expected Result                                                                                                                                                       | Pass/Fail |
| ------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 24.1.1 | Navigate to `/en/communications/inquiries` | The page loads with a **PageHeader** displaying "Inquiries" (or translated equivalent). Below the title, a description reads "Parent inquiries and support requests". |           |
| 24.1.2 | Verify the page loads without errors       | No blank screen, no "Something went wrong" error.                                                                                                                     |           |

### 24.2 Status Tabs

| #      | What to Check                         | Expected Result                                                                             | Pass/Fail |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------- | --------- |
| 24.2.1 | Verify the status tabs                | Four tabs are displayed: **All**, **Open**, **In Progress**, **Closed**.                    |           |
| 24.2.2 | Verify "All" tab is active by default | The "All" tab is selected on page load.                                                     |           |
| 24.2.3 | Click the **Open** tab                | The list filters to show only open inquiries. The API call includes `status=open`.          |           |
| 24.2.4 | Click the **In Progress** tab         | The list filters to show only in-progress inquiries. The API includes `status=in_progress`. |           |
| 24.2.5 | Click the **Closed** tab              | The list filters to show only closed inquiries. The API includes `status=closed`.           |           |

### 24.3 DataTable

| #      | What to Check                  | Expected Result                                                                                                                      | Pass/Fail |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 24.3.1 | Verify the table columns       | Columns: **Subject**, **Parent** (name), **Student** (name), **Status** (badge), **Messages** (count), **Last Message** (timestamp). |           |
| 24.3.2 | Verify the Subject column      | Each row shows the inquiry subject text.                                                                                             |           |
| 24.3.3 | Verify the Parent column       | Each row shows the parent's display name.                                                                                            |           |
| 24.3.4 | Verify the Student column      | Each row shows the associated student's name (if applicable).                                                                        |           |
| 24.3.5 | Verify the Status badge        | Each row shows a coloured badge: "Open" (blue), "In Progress" (amber), "Closed" (grey).                                              |           |
| 24.3.6 | Verify the Messages count      | Each row shows the number of messages in the inquiry thread.                                                                         |           |
| 24.3.7 | Verify the Last Message column | Each row shows the timestamp of the most recent message.                                                                             |           |
| 24.3.8 | Click on an inquiry row        | Browser navigates to `/en/communications/inquiries/{id}`. The Admin Inquiry Detail loads (see Section 25).                           |           |
| 24.3.9 | Verify the API call            | `GET /api/v1/inquiries?page=1&pageSize=20` is called (with optional `status` filter).                                                |           |

### 24.4 Empty State

| #      | What to Check                              | Expected Result                                                                                 | Pass/Fail |
| ------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------- | --------- |
| 24.4.1 | Verify empty state when no inquiries exist | An empty state is displayed with a **MessageCircle icon** and a message (e.g., "No inquiries"). |           |

---

## 25. Admin Inquiry Detail

**URL:** `/en/communications/inquiries/[id]`
**Requires:** Admin role

### 25.1 Page Load

| #      | What to Check                                   | Expected Result                                                                     | Pass/Fail |
| ------ | ----------------------------------------------- | ----------------------------------------------------------------------------------- | --------- |
| 25.1.1 | Navigate to `/en/communications/inquiries/{id}` | The page loads. The API call `GET /api/v1/inquiries/{id}` is made.                  |           |
| 25.1.2 | Verify loading state                            | While loading, a loading indicator is displayed.                                    |           |
| 25.1.3 | Navigate to a non-existent inquiry ID           | A **not found** state is displayed.                                                 |           |
| 25.1.4 | Verify API load failure                         | If the API call fails, an **error toast** appears (e.g., "Failed to load inquiry"). |           |

### 25.2 Header and Actions

| #      | What to Check                                                     | Expected Result                                                                                                                                                   | Pass/Fail |
| ------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 25.2.1 | Verify the PageHeader                                             | The header shows the inquiry **subject**. Below the title, a description shows the parent name and student name (e.g., "From Zainab Ali regarding Mohammed Ali"). |           |
| 25.2.2 | Verify the **Back** button                                        | A back button navigates to `/en/communications/inquiries`.                                                                                                        |           |
| 25.2.3 | Click the Back button                                             | Browser navigates to the inquiries list.                                                                                                                          |           |
| 25.2.4 | Verify the **Close Inquiry** button (for non-closed inquiries)    | A "Close Inquiry" button is visible in the header actions when the inquiry is open or in progress.                                                                |           |
| 25.2.5 | Verify the Close Inquiry button is NOT shown for closed inquiries | When the inquiry is already closed, the button is hidden.                                                                                                         |           |

### 25.3 Status and Date

| #      | What to Check           | Expected Result                                                            | Pass/Fail |
| ------ | ----------------------- | -------------------------------------------------------------------------- | --------- |
| 25.3.1 | Verify the status badge | A badge shows the current status: "Open", "In Progress", or "Closed".      |           |
| 25.3.2 | Verify the opened date  | The date the inquiry was opened is displayed (e.g., "Opened: 5 Apr 2026"). |           |

### 25.4 Message Thread

| #      | What to Check                                | Expected Result                                                                                | Pass/Fail |
| ------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------- |
| 25.4.1 | Verify the message thread area               | A scrollable area (320-560px height) displays all messages in the inquiry thread.              |           |
| 25.4.2 | Verify admin messages alignment and styling  | Messages sent by admin users are **right-aligned** with **primary background** colour.         |           |
| 25.4.3 | Verify parent messages alignment and styling | Messages sent by the parent are **left-aligned** with **surface-secondary background** colour. |           |
| 25.4.4 | Verify message content                       | Each message shows the body text and timestamp.                                                |           |
| 25.4.5 | Verify messages are in chronological order   | Messages are displayed from oldest (top) to newest (bottom).                                   |           |

### 25.5 Reply Area

| #      | What to Check                                          | Expected Result                                                                                                                                                       | Pass/Fail |
| ------ | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 25.5.1 | Verify the reply textarea (for non-closed inquiries)   | A textarea is displayed at the bottom of the thread for typing a reply.                                                                                               |           |
| 25.5.2 | Verify the Send button                                 | A Send button is displayed next to the textarea.                                                                                                                      |           |
| 25.5.3 | Type a reply and click Send                            | The API call `POST /api/v1/inquiries/{id}/messages` is made. On success, a **success toast** appears. The new message appears in the thread. The textarea is cleared. |           |
| 25.5.4 | Type a reply and press **Cmd+Enter** or **Ctrl+Enter** | Same as clicking Send — the reply is submitted via keyboard shortcut.                                                                                                 |           |
| 25.5.5 | Verify reply error                                     | If the API call fails, an **error toast** appears (e.g., "Failed to send reply").                                                                                     |           |
| 25.5.6 | Verify the reply area for closed inquiries             | When the inquiry is closed, instead of a textarea and Send button, a **notice** is displayed (e.g., "This inquiry is closed"). No reply can be sent.                  |           |

### 25.6 Close Inquiry

| #      | What to Check                    | Expected Result                                                                                                                                                                         | Pass/Fail |
| ------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 25.6.1 | Click the "Close Inquiry" button | The API call `POST /api/v1/inquiries/{id}/close` is made.                                                                                                                               |           |
| 25.6.2 | Verify close success             | A **success toast** appears (e.g., "Inquiry closed"). The status badge updates to "Closed". The Close Inquiry button disappears. The reply textarea is replaced with the closed notice. |           |
| 25.6.3 | Verify close error               | If the API call fails, an **error toast** appears (e.g., "Failed to close inquiry").                                                                                                    |           |

---

## 26. Messaging Policy Settings

**URL:** `/en/settings/messaging-policy`
**Requires:** `inbox.settings.read` + `inbox.settings.write` permissions

### 26.1 Page Load

| #      | What to Check                                         | Expected Result                                                                                                   | Pass/Fail |
| ------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 26.1.1 | Navigate to `/en/settings/messaging-policy`           | The page loads with a **PageHeader** (e.g., "Messaging Policy").                                                  |           |
| 26.1.2 | Verify the form uses react-hook-form with zodResolver | (Technical check) The form is managed by react-hook-form. Fields are registered and validation is handled by Zod. |           |
| 26.1.3 | Verify the **Reset to Defaults** button               | A "Reset to Defaults" button is displayed in the page header.                                                     |           |
| 26.1.4 | Verify API calls on load                              | `GET /api/v1/settings/inbox` and `GET /api/v1/settings/policy` are called.                                        |           |
| 26.1.5 | Verify load error                                     | If either API call fails, a **toast** appears (e.g., "Failed to load messaging policy").                          |           |

### 26.2 Global Toggles Section

| #       | What to Check                                                 | Expected Result                                                                                                                             | Pass/Fail |
| ------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 26.2.1  | Verify the Global Toggles section heading                     | A section heading like "Global Toggles" or "Messaging Controls" is displayed.                                                               |           |
| 26.2.2  | Verify toggle 1: **Messaging Enabled**                        | A toggle switch labelled "Messaging Enabled" is displayed.                                                                                  |           |
| 26.2.3  | Toggle **Messaging Enabled** OFF                              | A **confirm dialog** appears (destructive style) warning that disabling messaging will prevent all conversations. This is a guarded action. |           |
| 26.2.4  | Confirm the disable messaging dialog                          | The toggle switches off. The form is marked dirty.                                                                                          |           |
| 26.2.5  | Cancel the disable messaging dialog                           | The toggle remains on. No change is made.                                                                                                   |           |
| 26.2.6  | Verify toggle 2: **Students Can Initiate**                    | A toggle switch labelled "Students Can Initiate" (or similar) is displayed.                                                                 |           |
| 26.2.7  | Toggle **Students Can Initiate** ON                           | A **confirm dialog** appears with a **warning** about enabling student-initiated messaging. This is a guarded action.                       |           |
| 26.2.8  | Confirm the enable students dialog                            | The toggle switches on. The form is marked dirty.                                                                                           |           |
| 26.2.9  | Verify toggle 3: **Parents Can Initiate**                     | A toggle switch labelled "Parents Can Initiate" is displayed.                                                                               |           |
| 26.2.10 | Toggle **Parents Can Initiate** ON                            | A **confirm dialog** appears with a **warning** about enabling parent-initiated messaging. This is a guarded action.                        |           |
| 26.2.11 | Confirm the enable parents dialog                             | The toggle switches on. The form is marked dirty.                                                                                           |           |
| 26.2.12 | Verify toggle 4: **Parent-to-Parent**                         | A toggle switch labelled "Parent-to-Parent" is displayed. No confirmation required.                                                         |           |
| 26.2.13 | Verify toggle 5: **Student-to-Student**                       | A toggle switch labelled "Student-to-Student" is displayed. No confirmation required.                                                       |           |
| 26.2.14 | Verify toggle 6: **Student-to-Parent**                        | A toggle switch labelled "Student-to-Parent" is displayed. No confirmation required.                                                        |           |
| 26.2.15 | Verify toggle 7: **Require Admin Approval Parent-to-Teacher** | A toggle switch is displayed with a **"Coming Soon"** badge. This toggle may be disabled/non-functional.                                    |           |

### 26.3 Policy Matrix Section

| #       | What to Check                                                | Expected Result                                                                                                                                                            | Pass/Fail |
| ------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 26.3.1  | Verify the Policy Matrix section heading                     | A section heading like "Policy Matrix" or "Who can message whom" is displayed.                                                                                             |           |
| 26.3.2  | Verify the matrix is a 9x9 grid                              | The grid has 9 rows and 9 columns. The roles are: **owner**, **principal**, **vice_principal**, **office**, **finance**, **nurse**, **teacher**, **parent**, **student**.  |           |
| 26.3.3  | Verify the header row                                        | The top row shows the 9 role labels as column headers (recipient roles).                                                                                                   |           |
| 26.3.4  | Verify the header column                                     | The left column shows the 9 role labels as row headers (sender roles).                                                                                                     |           |
| 26.3.5  | Verify **allowed** cell styling                              | Cells where messaging is allowed show a **checkmark** icon on a **primary-50** background.                                                                                 |           |
| 26.3.6  | Verify **blocked** cell styling                              | Cells where messaging is blocked show an **X** icon on a neutral background.                                                                                               |           |
| 26.3.7  | Verify **disabled** cell styling                             | Cells that are disabled (due to global switches blocking the route) are **greyed out** and non-interactive.                                                                |           |
| 26.3.8  | Click an allowed cell to block it                            | The cell toggles from allowed (checkmark) to blocked (X). The form is marked dirty.                                                                                        |           |
| 26.3.9  | Click a blocked cell to allow it                             | The cell toggles from blocked (X) to allowed (checkmark). The form is marked dirty.                                                                                        |           |
| 26.3.10 | Click a disabled cell                                        | Nothing happens. The cell is non-interactive.                                                                                                                              |           |
| 26.3.11 | Hover over a cell to see the **tooltip**                     | A tooltip appears showing the sender role label, the recipient role label, the current status (allowed/blocked), and relational scope notes for 4 hardcoded relationships. |           |
| 26.3.12 | Verify cells are disabled when relevant global switch is off | When "Students Can Initiate" is off, all cells in the student sender row are disabled. When "Parents Can Initiate" is off, relevant parent cells are disabled.             |           |

### 26.4 Policy Matrix — Mobile

| #      | What to Check                                | Expected Result                                                                                                                      | Pass/Fail |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 26.4.1 | Verify the matrix on mobile (375px viewport) | The desktop grid is replaced with **collapsible cards** — one card per sender role. Each card expands to show the 9 recipient cells. |           |
| 26.4.2 | Tap on a card to expand it                   | The card expands to reveal the recipient cells for that sender role.                                                                 |           |
| 26.4.3 | Tap on a recipient cell within a card        | The cell toggles (same behaviour as desktop).                                                                                        |           |

### 26.5 Editing and Retention Section

| #      | What to Check                          | Expected Result                                                                                                     | Pass/Fail |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- |
| 26.5.1 | Verify the section heading             | A section heading like "Editing & Retention" is displayed.                                                          |           |
| 26.5.2 | Verify the **Edit window** field       | A number input labelled "Edit window" (or similar) with a range of **0 to 60 minutes**.                             |           |
| 26.5.3 | Set the edit window to 15              | The value is accepted. The form is marked dirty.                                                                    |           |
| 26.5.4 | Set the edit window to 61              | Validation fails or the input is clamped to 60.                                                                     |           |
| 26.5.5 | Verify the **Retention days** field    | A number input labelled "Retention days" with a range of **30 to 3650**. It is **nullable** (empty = keep forever). |           |
| 26.5.6 | Set retention days to 365              | The value is accepted.                                                                                              |           |
| 26.5.7 | Clear the retention days field (empty) | The value becomes null, meaning messages are kept forever.                                                          |           |
| 26.5.8 | Verify the **GDPR note**               | A note about GDPR is displayed. It contains raw HTML content (rendered as rich text, not escaped tags).             |           |

### 26.6 Sticky Save Bar

| #      | What to Check                                             | Expected Result                                                                                                                                                                                             | Pass/Fail |
| ------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 26.6.1 | Verify the sticky save bar appears when the form is dirty | After making any change (toggle, matrix cell, field), a sticky bar appears at the bottom of the page with a **dirty indicator** (e.g., "Unsaved changes") and a **Save** button.                            |           |
| 26.6.2 | Verify the save bar is hidden when the form is clean      | Before making any changes, the sticky save bar is not visible.                                                                                                                                              |           |
| 26.6.3 | Click the Save button                                     | The API calls `PUT /api/v1/settings/inbox` and `PUT /api/v1/settings/policy` are made. On success, a **success toast** appears (e.g., "Settings saved"). The form is marked clean. The save bar disappears. |           |
| 26.6.4 | Verify save error                                         | If either API call fails, an **error toast** appears (e.g., "Failed to save settings"). The form remains dirty.                                                                                             |           |

### 26.7 Confirm Dialogs

| #      | What to Check                                   | Expected Result                                                                                                                      | Pass/Fail |
| ------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 26.7.1 | Verify the **disable messaging** confirm dialog | Triggered by toggling Messaging Enabled off. Destructive styling. Title warns about disabling. Cancel and Confirm buttons.           |           |
| 26.7.2 | Verify the **enable students** confirm dialog   | Triggered by toggling Students Can Initiate on. Warning about student access. Cancel and Confirm buttons.                            |           |
| 26.7.3 | Verify the **enable parents** confirm dialog    | Triggered by toggling Parents Can Initiate on. Warning about parent access. Cancel and Confirm buttons.                              |           |
| 26.7.4 | Click **Reset to Defaults**                     | A **confirm dialog** appears asking if the user wants to reset all policy settings to defaults.                                      |           |
| 26.7.5 | Confirm the reset dialog                        | The API call `POST /api/v1/settings/policy/reset` is made. On success, all form fields revert to default values. A toast may appear. |           |
| 26.7.6 | Verify reset error                              | If the reset API fails, an **error toast** appears (e.g., "Failed to reset policy").                                                 |           |
| 26.7.7 | Cancel any confirm dialog                       | The dialog closes without making any change.                                                                                         |           |

---

## 27. Safeguarding Keywords Settings

**URL:** `/en/settings/communications/safeguarding`
**Requires:** Admin-tier role (school_owner, school_principal, school_vice_principal). The "admin" role does NOT have access.

### 27.1 Access Control

| #      | What to Check                                                                         | Expected Result                                                                                                                                                     | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 27.1.1 | Navigate to `/en/settings/communications/safeguarding` as Yusuf Rahman (School Owner) | The page loads successfully.                                                                                                                                        |           |
| 27.1.2 | Navigate as a user with the "admin" role                                              | A **denied state** is displayed with an **AlertCircle icon** and a message (e.g., "You do not have permission to view this page"). The keywords table is NOT shown. |           |

### 27.2 Page Structure

| #      | What to Check                     | Expected Result                                                                   | Pass/Fail |
| ------ | --------------------------------- | --------------------------------------------------------------------------------- | --------- |
| 27.2.1 | Verify the PageHeader             | The header displays the title "Safeguarding Keywords" (or translated equivalent). |           |
| 27.2.2 | Verify the **Bulk Import** button | A "Bulk Import" button is displayed in the header.                                |           |
| 27.2.3 | Verify the **Add** button         | An "Add" button (e.g., with Plus icon) is displayed in the header.                |           |

### 27.3 Filters

| #      | What to Check                           | Expected Result                                                             | Pass/Fail |
| ------ | --------------------------------------- | --------------------------------------------------------------------------- | --------- |
| 27.3.1 | Verify the **search** input             | A search input is displayed above the table for filtering keywords by text. |           |
| 27.3.2 | Type "bully" into the search input      | The table filters to show only keywords containing "bully".                 |           |
| 27.3.3 | Verify the **category** filter (select) | A dropdown/select allows filtering by category.                             |           |
| 27.3.4 | Verify the **severity** filter (select) | A dropdown/select allows filtering by severity level.                       |           |
| 27.3.5 | Verify the **status** filter (select)   | A dropdown/select allows filtering by active/inactive status.               |           |
| 27.3.6 | Apply multiple filters simultaneously   | The table updates to show only keywords matching all active filters.        |           |
| 27.3.7 | Clear all filters                       | The full keyword list is restored.                                          |           |

### 27.4 Keywords Table

| #       | What to Check                          | Expected Result                                                                                                                                     | Pass/Fail |
| ------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 27.4.1  | Verify the table columns               | Columns: **Keyword** (clickable), **Severity** (badge), **Category**, **Active** (switch), **Updated** (date), **Delete** (button).                 |           |
| 27.4.2  | Verify the Keyword column is clickable | Clicking a keyword opens the **Edit dialog** (see 27.6).                                                                                            |           |
| 27.4.3  | Verify the Severity badge              | Each row shows a severity badge with colour coding (e.g., green for low, amber for medium, red for high, dark red for critical).                    |           |
| 27.4.4  | Verify the Active switch               | Each row has a toggle switch showing whether the keyword is active.                                                                                 |           |
| 27.4.5  | Toggle the Active switch on a keyword  | The API call `PATCH /api/v1/inbox/oversight/keywords/{id}/active` is made. On success, the switch toggles.                                          |           |
| 27.4.6  | Verify the Delete button               | Each row has a delete button (trash icon or X).                                                                                                     |           |
| 27.4.7  | Click the Delete button                | A **confirm dialog** opens asking to confirm deletion.                                                                                              |           |
| 27.4.8  | Confirm deletion                       | The API call `DELETE /api/v1/inbox/oversight/keywords/{id}` is made. On success, a **toast** appears (e.g., "Keyword deleted"). The row is removed. |           |
| 27.4.9  | Cancel deletion                        | The dialog closes. No deletion occurs.                                                                                                              |           |
| 27.4.10 | Verify **client-side pagination**      | The table paginates at **50 items per page** (client-side). Pagination controls are shown if there are more than 50 keywords.                       |           |

### 27.5 Add Keyword Dialog

| #      | What to Check                  | Expected Result                                                                                                                                                  | Pass/Fail |
| ------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 27.5.1 | Click the "Add" button         | A dialog opens with fields for adding a new keyword.                                                                                                             |           |
| 27.5.2 | Verify the **keyword** field   | A text input for the keyword/phrase.                                                                                                                             |           |
| 27.5.3 | Verify the **severity** field  | A select/dropdown for severity level (e.g., Low, Medium, High, Critical).                                                                                        |           |
| 27.5.4 | Verify the **category** field  | A select/dropdown or text input for the keyword category.                                                                                                        |           |
| 27.5.5 | Click Save with empty keyword  | A **toast** appears indicating the keyword is required (e.g., "Keyword is required").                                                                            |           |
| 27.5.6 | Fill all fields and click Save | The API call `POST /api/v1/inbox/oversight/keywords` is made. On success, a **toast** appears (e.g., "Keyword created"). The dialog closes. The table refreshes. |           |
| 27.5.7 | Verify create error            | If the API fails, an **error toast** appears. The dialog remains open.                                                                                           |           |

### 27.6 Edit Keyword Dialog

| #      | What to Check                                | Expected Result                                                                                                                                                        | Pass/Fail |
| ------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 27.6.1 | Click on a keyword in the table              | An edit dialog opens with the keyword's current values pre-filled.                                                                                                     |           |
| 27.6.2 | Edit the keyword text, severity, or category | The fields are editable.                                                                                                                                               |           |
| 27.6.3 | Click Save                                   | The API call `PATCH /api/v1/inbox/oversight/keywords/{id}` is made. On success, a **toast** appears (e.g., "Keyword updated"). The dialog closes. The table refreshes. |           |
| 27.6.4 | Verify update error                          | If the API fails, an **error toast** appears.                                                                                                                          |           |

### 27.7 Bulk Import Dialog

| #      | What to Check                                      | Expected Result                                                                                                                                                                                              | Pass/Fail |
| ------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 27.7.1 | Click the "Bulk Import" button                     | A dialog opens with a **textarea** for pasting CSV data.                                                                                                                                                     |           |
| 27.7.2 | Verify the textarea                                | The textarea accepts CSV-formatted keyword data (one keyword per line or comma-separated).                                                                                                                   |           |
| 27.7.3 | Verify the **Parse** button                        | A "Parse" button processes the CSV text and shows a preview table of the parsed keywords.                                                                                                                    |           |
| 27.7.4 | Paste CSV data and click Parse                     | The CSV is parsed. A **preview table** appears below the textarea showing the keywords that will be imported.                                                                                                |           |
| 27.7.5 | Verify the **Import** button (appears after parse) | An "Import" button becomes available after successful parsing.                                                                                                                                               |           |
| 27.7.6 | Click Import                                       | The API call `POST /api/v1/inbox/oversight/keywords/bulk-import` is made. On success, a **toast** appears showing results (e.g., "Imported 15 keywords, 2 skipped"). The dialog closes. The table refreshes. |           |
| 27.7.7 | Verify import error                                | If the import fails, an **error toast** appears.                                                                                                                                                             |           |

---

## 28. Notification Fallback Settings

**URL:** `/en/settings/communications/fallback`
**Requires:** `inbox.settings.read` + `inbox.settings.write` permissions

### 28.1 Page Load

| #      | What to Check                                         | Expected Result                                                                    | Pass/Fail |
| ------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------- | --------- |
| 28.1.1 | Navigate to `/en/settings/communications/fallback`    | The page loads with a **PageHeader** (e.g., "Notification Fallback").              |           |
| 28.1.2 | Verify the form uses react-hook-form with zodResolver | (Technical check) The form is managed properly.                                    |           |
| 28.1.3 | Verify API call on load                               | `GET /api/v1/settings/inbox` is called to populate the form with current settings. |           |

### 28.2 Admin Broadcasts Section

| #       | What to Check                                 | Expected Result                                                                                                           | Pass/Fail |
| ------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------- |
| 28.2.1  | Verify the "Admin Broadcasts" section heading | A section heading is displayed for admin broadcast fallback settings.                                                     |           |
| 28.2.2  | Verify the **Enable** switch                  | A toggle switch to enable/disable fallback for admin broadcasts.                                                          |           |
| 28.2.3  | Verify the **After hours** input              | A number input labelled "After hours" (or similar) with a range of **1 to 168** (hours).                                  |           |
| 28.2.4  | Set after hours to 24                         | The value is accepted.                                                                                                    |           |
| 28.2.5  | Set after hours to 0 or 169                   | Validation fails or the input is clamped.                                                                                 |           |
| 28.2.6  | Verify the **channel checkboxes**             | Three checkboxes: **Email**, **SMS**, **WhatsApp**.                                                                       |           |
| 28.2.7  | Check Email and SMS                           | Both checkboxes become checked.                                                                                           |           |
| 28.2.8  | Verify the **Test** button                    | A "Test" button is displayed. It is **disabled** when the section is not enabled.                                         |           |
| 28.2.9  | Enable the section and click Test             | The API call `POST /api/v1/settings/fallback/test` is made. On success, a **toast** appears (e.g., "Test fallback sent"). |           |
| 28.2.10 | Verify test error                             | If the test fails, an **error toast** appears.                                                                            |           |

### 28.3 Teacher Messages Section

| #      | What to Check                                 | Expected Result                                                       | Pass/Fail |
| ------ | --------------------------------------------- | --------------------------------------------------------------------- | --------- |
| 28.3.1 | Verify the "Teacher Messages" section heading | A section heading is displayed for teacher message fallback settings. |           |
| 28.3.2 | Verify the **Enable** switch                  | Same as 28.2.2 — a toggle switch.                                     |           |
| 28.3.3 | Verify the **After hours** input              | Same as 28.2.3 — number input 1-168.                                  |           |
| 28.3.4 | Verify the **channel checkboxes**             | Same as 28.2.6 — Email, SMS, WhatsApp checkboxes.                     |           |
| 28.3.5 | Verify the **Test** button                    | Same as 28.2.8 — disabled when not enabled.                           |           |

### 28.4 Save and Validation

| #      | What to Check                                            | Expected Result                                                                                                               | Pass/Fail |
| ------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| 28.4.1 | Verify the **Save** button                               | A Save button is displayed. It is **disabled** when the form has no changes (clean state).                                    |           |
| 28.4.2 | Make a change and verify the Save button becomes enabled | After toggling a switch or changing a value, the Save button becomes clickable.                                               |           |
| 28.4.3 | Enable a section but check no channels                   | **Cross-field validation** fails: an error indicates at least one channel must be selected when fallback is enabled.          |           |
| 28.4.4 | Enable a section, check at least one channel, click Save | The API call `PUT /api/v1/settings/inbox` is made. On success, a **success toast** appears (e.g., "Fallback settings saved"). |           |
| 28.4.5 | Verify save error                                        | If the API fails, an **error toast** appears.                                                                                 |           |

---

## 29. Notification Settings

**URL:** `/en/settings/notifications`

### 29.1 Page Load

| #      | What to Check                            | Expected Result                                                                       | Pass/Fail |
| ------ | ---------------------------------------- | ------------------------------------------------------------------------------------- | --------- |
| 29.1.1 | Navigate to `/en/settings/notifications` | The page loads. The API call `GET /api/v1/notification-settings` is made.             |           |
| 29.1.2 | Verify loading state                     | While the API is loading, a **loading spinner** is displayed.                         |           |
| 29.1.3 | Verify empty state                       | If no notification types are configured, an empty state message is displayed.         |           |
| 29.1.4 | Verify load error                        | If the API fails, a **toast** appears (e.g., "Failed to load notification settings"). |           |

### 29.2 Notification Types Table

| #      | What to Check                                  | Expected Result                                                                                                                                    | Pass/Fail |
| ------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 29.2.1 | Verify the table structure                     | A table displays **21 notification types**. Each row has the notification type name, an **enable switch**, and **channel checkboxes**.             |           |
| 29.2.2 | Verify the enable switch per notification type | Each row has a toggle switch to enable/disable that notification type.                                                                             |           |
| 29.2.3 | Toggle a notification type on                  | The API call `PATCH /api/v1/notification-settings/{type}` is made with `enabled: true`. On success, a **toast** appears (e.g., "Setting updated"). |           |
| 29.2.4 | Toggle a notification type off                 | The API call is made with `enabled: false`. Toast on success.                                                                                      |           |
| 29.2.5 | Verify channel checkboxes per row              | Each row has checkboxes for available channels (e.g., Email, Push, In-app).                                                                        |           |
| 29.2.6 | Check a channel checkbox                       | The API call is made with the updated channels. Toast on success.                                                                                  |           |
| 29.2.7 | Uncheck a channel checkbox                     | The API call is made. Toast on success.                                                                                                            |           |
| 29.2.8 | Verify save failure                            | If the PATCH call fails, a **toast** appears (e.g., "Failed to save notification setting").                                                        |           |

### 29.3 Footer

| #      | What to Check               | Expected Result                                                                                                                                                            | Pass/Fail |
| ------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 29.3.1 | Verify the footer hint text | A hint or note is displayed below the table explaining the notification settings (e.g., "These settings control how your school sends notifications for each event type"). |           |

---

## 30. Profile Communication Preferences

**URL:** `/en/profile/communication`
**Requires:** Any authenticated user

| #     | What to Check                           | Expected Result                                                                                                                                                       | Pass/Fail |
| ----- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 30.1  | Navigate to `/en/profile/communication` | The page loads. The API call `GET /api/v1/me/preferences` is made.                                                                                                    |           |
| 30.2  | Verify loading state                    | While the API is loading, a loading text (e.g., "Loading...") is displayed.                                                                                           |           |
| 30.3  | Verify the **Email** channel checkbox   | A checkbox labelled "Email" is displayed. It is **checked by default** (default on).                                                                                  |           |
| 30.4  | Verify the **SMS** channel checkbox     | A checkbox labelled "SMS" is displayed. It is **unchecked by default** (default off).                                                                                 |           |
| 30.5  | Verify the **Push** channel checkbox    | A checkbox labelled "Push" is displayed. It is **unchecked by default** (default off).                                                                                |           |
| 30.6  | Toggle the SMS checkbox on              | The checkbox becomes checked.                                                                                                                                         |           |
| 30.7  | Toggle the Push checkbox on             | The checkbox becomes checked.                                                                                                                                         |           |
| 30.8  | Verify the **Language** select          | A dropdown/select for preferred language with options: **English** (en), **Arabic** (ar).                                                                             |           |
| 30.9  | Select "Arabic" as the language         | The selection changes to Arabic.                                                                                                                                      |           |
| 30.10 | Verify the **Save** button              | A Save button is displayed.                                                                                                                                           |           |
| 30.11 | Click Save                              | The API call `PATCH /api/v1/me/preferences` is made with the updated preferences.                                                                                     |           |
| 30.12 | Verify success feedback                 | An **inline success message** is displayed on the page (e.g., green text "Preferences saved"). Note: this uses an inline message, NOT a toast.                        |           |
| 30.13 | Verify error feedback                   | If the API fails, an **inline error message** is displayed on the page (e.g., red text "Failed to save preferences"). Note: this uses an inline message, NOT a toast. |           |

---

## 31. Inbox Polling Provider

This section covers the background polling mechanism that keeps the inbox state updated.

| #    | What to Check                                           | Expected Result                                                                                                                                                                                | Pass/Fail |
| ---- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 31.1 | Navigate to `/en/inbox` and open the Network tab        | Observe that `GET /api/v1/inbox/state` is called on page load.                                                                                                                                 |           |
| 31.2 | Wait 30 seconds and observe the Network tab             | After approximately 30 seconds, another `GET /api/v1/inbox/state` call is made. This repeats at ~30-second intervals.                                                                          |           |
| 31.3 | Verify the polling response structure                   | The response includes `unread_total` (number) and `latest_message_at` (ISO timestamp or null).                                                                                                 |           |
| 31.4 | Verify the morph bar badge updates based on polling     | When `unread_total` changes (e.g., a new message arrives), the unread badge on the Inbox hub button in the morph bar updates to reflect the new count.                                         |           |
| 31.5 | Verify the sidebar thread list updates based on polling | When the polling detects changes (new `latest_message_at`), the sidebar conversation list re-fetches to show updated data (new conversations, updated timestamps, etc.).                       |           |
| 31.6 | Verify manual refresh after sending a message           | After sending a new message (compose or reply), the polling state is manually refreshed immediately (not waiting for the 30-second interval).                                                  |           |
| 31.7 | Verify manual refresh after reading a message           | After opening/reading a conversation, the unread count updates immediately.                                                                                                                    |           |
| 31.8 | Navigate away from the inbox and verify polling stops   | When navigating to a completely different section (e.g., `/en/students`), verify that `/api/v1/inbox/state` polling calls stop (or continue at the same interval if the provider is app-wide). |           |

---

## 32. Cross-Module Announcement Flow (End-to-End)

This section tests the full lifecycle of an announcement: creation by admin, publication, visibility to teacher, visibility to parent, and delivery stats.

### 32.1 Create and Publish Announcement

| #      | What to Check                                                                                                                                                     | Expected Result                                                                                         | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------- |
| 32.1.1 | Log in as **Yusuf Rahman** (owner@nhqs.test). Navigate to `/en/communications/new`.                                                                               | The New Announcement form loads.                                                                        |           |
| 32.1.2 | Enter title: "School Sports Day — 20 April 2026"                                                                                                                  | Title field populated.                                                                                  |           |
| 32.1.3 | Enter body: "We are pleased to announce that Sports Day will be held on 20 April 2026. All students and parents are invited to attend. Please arrive by 8:30 AM." | Body textarea populated.                                                                                |           |
| 32.1.4 | Select scope: **School** (Entire school)                                                                                                                          | Scope set to school-wide. No additional target selection needed.                                        |           |
| 32.1.5 | Ensure delivery channels: In-app (locked) + Email (checked)                                                                                                       | In-app is locked on. Email is toggled on.                                                               |           |
| 32.1.6 | Click **Publish**                                                                                                                                                 | The API calls are made. A success toast appears. The browser navigates to the announcement detail page. |           |
| 32.1.7 | Verify the announcement detail shows status "Published"                                                                                                           | The status badge reads "Published". The published date is shown.                                        |           |

### 32.2 Verify in Announcements List

| #      | What to Check                                   | Expected Result                                                                                  | Pass/Fail |
| ------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| 32.2.1 | Navigate to `/en/communications/announcements`  | The announcements list loads.                                                                    |           |
| 32.2.2 | Verify the new announcement appears in the list | A row with title "School Sports Day — 20 April 2026" is visible. Status badge shows "Published". |           |
| 32.2.3 | Click the "Published" tab                       | The announcement appears in the filtered list.                                                   |           |

### 32.3 Verify as Teacher

| #      | What to Check                                                              | Expected Result                                                                                     | Pass/Fail |
| ------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------- |
| 32.3.1 | Log out and log in as **Sarah Daly** (Sarah.daly@nhqs.test / Password123!) | Successfully logged in as teacher.                                                                  |           |
| 32.3.2 | Navigate to the announcements feed (teacher view)                          | The announcement "School Sports Day — 20 April 2026" is visible in the teacher's announcement feed. |           |
| 32.3.3 | Verify the announcement body is readable                                   | The full body text is displayed to the teacher.                                                     |           |

### 32.4 Verify as Parent

| #      | What to Check                                                          | Expected Result                                                      | Pass/Fail |
| ------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------- | --------- |
| 32.4.1 | Log out and log in as **Zainab Ali** (parent@nhqs.test / Password123!) | Successfully logged in as parent.                                    |           |
| 32.4.2 | Navigate to `/en/announcements` (parent announcements feed)            | The announcements feed loads.                                        |           |
| 32.4.3 | Verify the announcement appears                                        | "School Sports Day — 20 April 2026" is visible in the parent's feed. |           |
| 32.4.4 | Verify the announcement body is readable                               | The full body text is displayed to the parent.                       |           |

### 32.5 Verify Delivery Stats

| #      | What to Check                                                 | Expected Result                                                             | Pass/Fail |
| ------ | ------------------------------------------------------------- | --------------------------------------------------------------------------- | --------- |
| 32.5.1 | Log out and log back in as **Yusuf Rahman** (owner@nhqs.test) | Successfully logged in as owner.                                            |           |
| 32.5.2 | Navigate to the announcement detail page                      | The detail page loads for "School Sports Day — 20 April 2026".              |           |
| 32.5.3 | Verify the delivery stats panel is present                    | The stats panel shows counts for queued, sent, delivered, failed, and read. |           |
| 32.5.4 | Verify the queued count is greater than 0                     | The queued count reflects the number of recipients (school-wide).           |           |
| 32.5.5 | Verify sent count is greater than or equal to 0               | Sent count shows progress of delivery.                                      |           |

---

## 33. Cross-Module Messaging Flow (End-to-End)

This section tests the full lifecycle of messaging: direct message, broadcast, and reply flows across roles.

### 33.1 Admin Sends Direct Message to Teacher

| #      | What to Check                                                                   | Expected Result                                                                                           | Pass/Fail |
| ------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| 33.1.1 | Log in as **Yusuf Rahman** (owner@nhqs.test). Navigate to `/en/inbox`.          | Inbox loads.                                                                                              |           |
| 33.1.2 | Open the Compose Dialog (click Compose or press 'c')                            | The Compose Dialog opens. Direct tab is active.                                                           |           |
| 33.1.3 | In the People Picker, search for "Sarah"                                        | The dropdown shows Sarah Daly as a result.                                                                |           |
| 33.1.4 | Select Sarah Daly                                                               | Her chip appears as the selected recipient.                                                               |           |
| 33.1.5 | Type body: "Hi Sarah, please prepare the sports equipment list for Sports Day." | Body textarea populated.                                                                                  |           |
| 33.1.6 | Click Send                                                                      | API call succeeds. Toast appears. Browser navigates to the new thread.                                    |           |
| 33.1.7 | Verify the thread appears in the admin's inbox sidebar                          | The conversation with Sarah Daly is visible in the conversation list, showing the latest message preview. |           |

### 33.2 Teacher Receives and Replies

| #      | What to Check                                                                   | Expected Result                                                                                                | Pass/Fail |
| ------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------- |
| 33.2.1 | Log out and log in as **Sarah Daly** (Sarah.daly@nhqs.test / Password123!)      | Successfully logged in as teacher.                                                                             |           |
| 33.2.2 | Navigate to `/en/inbox`                                                         | The inbox loads. A new unread conversation from Yusuf Rahman is visible with an unread dot and badge.          |           |
| 33.2.3 | Click on the conversation                                                       | The thread opens. The message "Hi Sarah, please prepare the sports equipment list for Sports Day." is visible. |           |
| 33.2.4 | Type a reply: "Hi Yusuf, I'll have the list ready by Wednesday." and click Send | The reply is sent. The new message appears at the bottom of the thread.                                        |           |
| 33.2.5 | Verify the reply appears in the thread                                          | Both messages are visible: Yusuf's original and Sarah's reply.                                                 |           |

### 33.3 Admin Sends Broadcast with Replies Allowed

| #      | What to Check                                                                                              | Expected Result                                                              | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------- |
| 33.3.1 | Log out and log in as **Yusuf Rahman** (owner@nhqs.test). Navigate to `/en/inbox`.                         | Inbox loads.                                                                 |           |
| 33.3.2 | Open the Compose Dialog. Click the **Broadcast** tab.                                                      | Broadcast form fields are displayed.                                         |           |
| 33.3.3 | Enter subject: "Parent-Teacher Conference Dates"                                                           | Subject field populated.                                                     |           |
| 33.3.4 | In the Audience Picker (Quick tab), click "All parents"                                                    | All parents audience is selected.                                            |           |
| 33.3.5 | Check the **"Allow replies"** checkbox                                                                     | Checkbox is checked.                                                         |           |
| 33.3.6 | Type body: "Parent-teacher conferences will be held on 22-23 April. Please book your preferred time slot." | Body populated.                                                              |           |
| 33.3.7 | Click Send                                                                                                 | API call succeeds. Toast appears. Browser navigates to the broadcast thread. |           |

### 33.4 Parent Receives Broadcast and Replies

| #      | What to Check                                                                     | Expected Result                                                                                                                            | Pass/Fail |
| ------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 33.4.1 | Log out and log in as **Zainab Ali** (parent@nhqs.test / Password123!)            | Successfully logged in as parent.                                                                                                          |           |
| 33.4.2 | Navigate to `/en/inbox`                                                           | The inbox loads. The broadcast "Parent-Teacher Conference Dates" is visible.                                                               |           |
| 33.4.3 | Click on the broadcast                                                            | The broadcast thread opens. The message body is visible.                                                                                   |           |
| 33.4.4 | Verify the reply composer is **enabled** (because allow_replies=true)             | The textarea is enabled and the Send button is clickable.                                                                                  |           |
| 33.4.5 | Type a reply: "Thank you, I'd like to book for 22 April at 3 PM please." and Send | The reply is sent. This should **spawn a direct thread** between the parent and the broadcast sender (not appear in the broadcast itself). |           |

### 33.5 Admin Sends Broadcast without Replies

| #      | What to Check                                                                              | Expected Result        | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------ | ---------------------- | --------- |
| 33.5.1 | Log out and log in as **Yusuf Rahman**. Navigate to `/en/inbox`. Open Compose > Broadcast. | Broadcast form loads.  |           |
| 33.5.2 | Enter subject: "School Closure — Public Holiday"                                           | Subject populated.     |           |
| 33.5.3 | In Audience Picker, select "All parents"                                                   | Audience selected.     |           |
| 33.5.4 | Leave **"Allow replies"** **unchecked**                                                    | Checkbox is unchecked. |           |
| 33.5.5 | Type body: "The school will be closed on 25 April for a public holiday." and Send          | API call succeeds.     |           |

### 33.6 Parent Cannot Reply to No-Reply Broadcast

| #      | What to Check                                                  | Expected Result                                                                                                                                                                                 | Pass/Fail |
| ------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 33.6.1 | Log out and log in as **Zainab Ali**. Navigate to `/en/inbox`. | Inbox loads.                                                                                                                                                                                    |           |
| 33.6.2 | Open the broadcast "School Closure — Public Holiday"           | The broadcast thread opens.                                                                                                                                                                     |           |
| 33.6.3 | Verify the reply composer is **disabled**                      | The textarea has a **dashed border** and is **disabled**. The Send button is disabled. A **tooltip** explains that replies are not allowed (e.g., "Replies are not allowed on this broadcast"). |           |

---

## 34. Oversight Flow End-to-End

This section tests the complete oversight lifecycle: safeguarding keyword setup, flag detection, flag actions (dismiss, escalate, freeze), and audit trail.

### 34.1 Add Safeguarding Keyword

| #      | What to Check                                                                                         | Expected Result                                                     | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------- |
| 34.1.1 | Log in as **Yusuf Rahman** (owner@nhqs.test). Navigate to `/en/settings/communications/safeguarding`. | The safeguarding keywords page loads.                               |           |
| 34.1.2 | Click the **Add** button                                                                              | The Add Keyword dialog opens.                                       |           |
| 34.1.3 | Enter keyword: "bully", severity: "High", category: "Safeguarding"                                    | Fields populated.                                                   |           |
| 34.1.4 | Click Save                                                                                            | Toast: "Keyword created". The keyword "bully" appears in the table. |           |

### 34.2 Trigger a Flag

| #      | What to Check                                                                                                | Expected Result             | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------------------------ | --------------------------- | --------- |
| 34.2.1 | Log out and log in as **Sarah Daly** (Sarah.daly@nhqs.test)                                                  | Logged in as teacher.       |           |
| 34.2.2 | Navigate to `/en/inbox`. Open Compose > Direct. Search for and select Yusuf Rahman.                          | Recipient selected.         |           |
| 34.2.3 | Type body: "I'm concerned about a student who may be experiencing bully behaviour from classmates." and Send | Message sent. Thread opens. |           |

### 34.3 Review Flag — Dismiss

| #      | What to Check                                                                              | Expected Result                                                                             | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | --------- |
| 34.3.1 | Log out and log in as **Yusuf Rahman**. Navigate to `/en/inbox/oversight`.                 | The Oversight Dashboard loads.                                                              |           |
| 34.3.2 | Click the **Flags** tab                                                                    | The flags list loads.                                                                       |           |
| 34.3.3 | Verify a flag is present with keyword "bully"                                              | A row shows the keyword badge "bully", severity "High", and review state "Pending".         |           |
| 34.3.4 | Click **Dismiss** on the flag                                                              | The Flag Review Modal opens in dismiss mode.                                                |           |
| 34.3.5 | Enter notes: "Reviewed — teacher was reporting a concern, not a threat." and click Dismiss | API call succeeds. Toast: "Flag dismissed". The flag's review state changes to "Dismissed". |           |
| 34.3.6 | Switch to the "Dismissed" filter                                                           | The dismissed flag appears in the list.                                                     |           |

### 34.4 Review Flag — Escalate

| #      | What to Check                                                                             | Expected Result                                                                 | Pass/Fail |
| ------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------- |
| 34.4.1 | (Send another message containing "bully" from the teacher account to trigger a new flag.) | A new pending flag is created.                                                  |           |
| 34.4.2 | Navigate to `/en/inbox/oversight` > Flags tab. Verify the new pending flag.               | The new flag is visible with "Pending" state.                                   |           |
| 34.4.3 | Click **Escalate** (flame icon) on the new flag                                           | The Flag Review Modal opens in escalate mode.                                   |           |
| 34.4.4 | Enter notes: "Escalating for DSL review." and click Escalate                              | API call succeeds. Toast with download link: "Flag escalated. Download report". |           |
| 34.4.5 | Click the download link                                                                   | A PDF or report file downloads containing the conversation export.              |           |
| 34.4.6 | Verify the flag's review state is now "Escalated"                                         | The flag shows "Escalated" in the review state column.                          |           |

### 34.5 Freeze Conversation

| #      | What to Check                                                                         | Expected Result                                                                                                                    | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 34.5.1 | Click **Freeze** (lock icon) on a flag associated with a conversation                 | The Freeze Dialog opens.                                                                                                           |           |
| 34.5.2 | Enter reason: "Under investigation — freezing pending DSL review." and click Freeze   | API call succeeds. Toast: "Conversation frozen".                                                                                   |           |
| 34.5.3 | Navigate to the oversight thread detail for the frozen conversation                   | The frozen banner is displayed with the reason text and freeze date.                                                               |           |
| 34.5.4 | Log out and log in as **Sarah Daly**. Navigate to the same conversation in her inbox. | The conversation shows the frozen banner. The reply composer is **disabled** with a tooltip explaining the conversation is frozen. |           |

### 34.6 Unfreeze Conversation

| #      | What to Check                                                             | Expected Result                                                                                      | Pass/Fail |
| ------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------- |
| 34.6.1 | Log back in as **Yusuf Rahman**. Navigate to the oversight thread detail. | The frozen banner is visible. The Unfreeze button is displayed.                                      |           |
| 34.6.2 | Click the **Unfreeze** button                                             | API call `POST .../unfreeze` succeeds. Toast: "Conversation unfrozen". The frozen banner disappears. |           |
| 34.6.3 | Verify the conversation is no longer frozen                               | The thread detail no longer shows the frozen banner.                                                 |           |
| 34.6.4 | Log in as Sarah Daly and verify                                           | The reply composer is now **enabled** again. Sarah can send messages.                                |           |

### 34.7 Audit Log Verification

| #      | What to Check                                                              | Expected Result                                                                                                                                                                                                | Pass/Fail |
| ------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 34.7.1 | Log in as **Yusuf Rahman**. Navigate to `/en/inbox/oversight` > Audit tab. | The audit log loads.                                                                                                                                                                                           |           |
| 34.7.2 | Verify entries for all actions taken in this flow                          | The audit log should contain entries for: **dismiss_flag**, **escalate_flag**, **freeze**, **unfreeze**, and possibly **export**. Each entry shows a timestamp, actor UUID, action badge, and conversation ID. |           |
| 34.7.3 | Verify entries are in reverse chronological order (newest first)           | The most recent action (unfreeze) appears at the top. Older actions appear below.                                                                                                                              |           |

---

## 35. Reply Configuration Testing

This section specifically tests the reply/composer behaviour under different conversation configurations.

| #    | What to Check                                                          | Expected Result                                                                                                                                                                          | Pass/Fail |
| ---- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 35.1 | Open a **broadcast with allow_replies=true** as a recipient            | The reply composer is **enabled**. The textarea is interactive. The Send button is clickable. Sending a reply spawns a **direct thread** between the recipient and the broadcast sender. |           |
| 35.2 | Open a **broadcast with allow_replies=false** as a recipient           | The reply composer is **disabled**. The textarea has a dashed border. A tooltip explains replies are not allowed. The Send button is disabled.                                           |           |
| 35.3 | Open a **frozen conversation** as any participant                      | The reply composer is **disabled**. The textarea has a dashed border. A tooltip explains the conversation is frozen. The Send button is disabled.                                        |           |
| 35.4 | Open a **direct conversation** as either participant                   | The reply composer is **always enabled** for direct conversations (unless frozen). Both participants can reply.                                                                          |           |
| 35.5 | Open a **group conversation** as any participant                       | The reply composer is **always enabled** for group conversations (unless frozen). All participants can reply.                                                                            |           |
| 35.6 | Open a **broadcast with allow_replies=true** as the **sender** (admin) | The admin who sent the broadcast can view the thread. The composer behaviour follows the allow_replies setting.                                                                          |           |

---

## 36. Arabic / RTL

This section tests the complete Communications module when the locale is switched to Arabic (RTL layout).

### 36.1 Locale Switch

| #      | What to Check                                                                   | Expected Result                                                                       | Pass/Fail |
| ------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------- |
| 36.1.1 | Switch the locale to Arabic (via user menu or navigate to `/ar/communications`) | The page reloads in Arabic. The URL changes to `/ar/communications`.                  |           |
| 36.1.2 | Verify the `dir` attribute on the page                                          | The `<html>` element (or root layout) has `dir="rtl"`.                                |           |
| 36.1.3 | Verify the page direction is RTL                                                | All text flows right-to-left. The morph bar, sidebar, and content areas are mirrored. |           |

### 36.2 Hub Dashboard RTL

| #      | What to Check                                | Expected Result                                                                                                 | Pass/Fail |
| ------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------- |
| 36.2.1 | Navigate to `/ar/communications`             | The hub dashboard loads in Arabic. All card titles, labels, and CTA links are translated.                       |           |
| 36.2.2 | Verify stat cards use logical CSS properties | Cards align correctly in RTL. Padding, margins, and borders use start/end (not left/right). No visual breakage. |           |
| 36.2.3 | Verify settings tiles are mirrored           | The tiles flow right-to-left. Icons and text align correctly.                                                   |           |

### 36.3 Inbox RTL

| #      | What to Check                               | Expected Result                                                                                                                        | Pass/Fail |
| ------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 36.3.1 | Navigate to `/ar/inbox`                     | The inbox loads in Arabic RTL.                                                                                                         |           |
| 36.3.2 | Verify the sidebar is on the **right** side | In RTL, the sidebar (conversation list) appears on the right, and the thread content area on the left.                                 |           |
| 36.3.3 | Verify filter chips are mirrored            | The filter chips row flows right-to-left. Scrolling direction is correct.                                                              |           |
| 36.3.4 | Verify the Compose button position          | The Compose button is positioned at the start (right side in RTL) of the sidebar header.                                               |           |
| 36.3.5 | Verify thread list item layout              | The unread dot is at the **end** (left side in RTL). The timestamp is at the start. The selected bar is on the **start** (right) edge. |           |

### 36.4 Thread View RTL

| #      | What to Check                                     | Expected Result                                                                           | Pass/Fail |
| ------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------- |
| 36.4.1 | Open a thread in RTL                              | The thread detail loads with correct RTL layout.                                          |           |
| 36.4.2 | Verify own messages are on the **left** in RTL    | In RTL, own messages (right-aligned in LTR) shift to the left side.                       |           |
| 36.4.3 | Verify other messages are on the **right** in RTL | In RTL, other people's messages (left-aligned in LTR) shift to the right side.            |           |
| 36.4.4 | Verify reply composer layout                      | The Send button is on the start (right) side. The textarea expands toward the end (left). |           |

### 36.5 Compose Dialog RTL

| #      | What to Check                      | Expected Result                                                            | Pass/Fail |
| ------ | ---------------------------------- | -------------------------------------------------------------------------- | --------- |
| 36.5.1 | Open the Compose Dialog in RTL     | The dialog opens. Tabs, labels, and buttons are all mirrored.              |           |
| 36.5.2 | Verify tabs are mirrored           | The 3 tabs (Direct, Group, Broadcast) flow right-to-left.                  |           |
| 36.5.3 | Verify form fields are mirrored    | Labels appear to the right of inputs. Text inputs have RTL text direction. |           |
| 36.5.4 | Verify footer buttons are mirrored | Cancel is on the end (left) side. Send is on the start (right) side.       |           |

### 36.6 Policy Matrix RTL

| #      | What to Check                                  | Expected Result                                                               | Pass/Fail |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------------- | --------- |
| 36.6.1 | Navigate to `/ar/settings/messaging-policy`    | The policy page loads in RTL.                                                 |           |
| 36.6.2 | Verify the "Sender / Recipient" header mirrors | The row/column header labels are mirrored. The sender column is on the right. |           |
| 36.6.3 | Verify matrix cells are mirrored               | The entire grid is mirrored. Clicking a cell still toggles correctly.         |           |

### 36.7 General RTL Checks

| #      | What to Check                                | Expected Result                                                                                                                                                                                      | Pass/Fail |
| ------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 36.7.1 | Verify all numerics remain **Western (0-9)** | No Arabic-Indic numerals are shown. All counts, timestamps, dates use 0-9 digits.                                                                                                                    |           |
| 36.7.2 | Verify all dates are **Gregorian**           | No Hijri calendar dates. All dates follow the Gregorian calendar.                                                                                                                                    |           |
| 36.7.3 | Verify all translation keys are present      | No raw translation keys (e.g., "communications.hub.title") are visible. All text is properly translated.                                                                                             |           |
| 36.7.4 | Verify no left/right CSS classes are used    | (Code-level check) No `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right` classes are used. All directional classes use logical equivalents (ms-, me-, ps-, pe-, start-, end-). |           |
| 36.7.5 | Verify email addresses are LTR-enforced      | Any email addresses displayed in the module (e.g., in people picker results) maintain LTR direction even within RTL context.                                                                         |           |
| 36.7.6 | Switch back to English                       | Navigate to `/en/communications`. Verify the page returns to LTR layout with English text.                                                                                                           |           |

---

## 37. Backend Endpoint Map

Complete reference of every API endpoint the Communications module UI calls.

| #     | Method | Path                                                  | Permission Required     | Used In Section(s)                                                  |
| ----- | ------ | ----------------------------------------------------- | ----------------------- | ------------------------------------------------------------------- |
| 37.1  | GET    | `/api/v1/inbox/state`                                 | `inbox.read`            | 2 (Hub Dashboard), 31 (Polling)                                     |
| 37.2  | GET    | `/api/v1/inbox/conversations`                         | `inbox.read`            | 3 (Inbox Sidebar)                                                   |
| 37.3  | POST   | `/api/v1/inbox/conversations`                         | `inbox.send`            | 5 (Compose Dialog)                                                  |
| 37.4  | GET    | `/api/v1/inbox/conversations/{id}`                    | `inbox.read`            | 11 (Thread View)                                                    |
| 37.5  | POST   | `/api/v1/inbox/conversations/{id}/messages`           | `inbox.send`            | 11 (Thread View — Reply)                                            |
| 37.6  | GET    | `/api/v1/inbox/people-search`                         | `inbox.send`            | 6 (People Picker)                                                   |
| 37.7  | GET    | `/api/v1/inbox/search`                                | `inbox.read`            | 13 (Inbox Search)                                                   |
| 37.8  | GET    | `/api/v1/inbox/audiences`                             | `inbox.send`            | 2 (Hub Dashboard), 7 (Audience Picker), 14 (Saved Audiences List)   |
| 37.9  | POST   | `/api/v1/inbox/audiences`                             | `inbox.send`            | 7 (Save Audience Dialog), 15 (Create Audience)                      |
| 37.10 | GET    | `/api/v1/inbox/audiences/{id}`                        | `inbox.send`            | 16 (Edit Audience)                                                  |
| 37.11 | PATCH  | `/api/v1/inbox/audiences/{id}`                        | `inbox.send`            | 16 (Edit Audience)                                                  |
| 37.12 | DELETE | `/api/v1/inbox/audiences/{id}`                        | `inbox.send`            | 14 (Saved Audiences List), 16 (Edit Audience)                       |
| 37.13 | POST   | `/api/v1/inbox/audiences/{id}/duplicate`              | `inbox.send`            | 14 (Saved Audiences List), 16 (Edit Audience)                       |
| 37.14 | GET    | `/api/v1/inbox/audiences/{id}/resolve`                | `inbox.send`            | 16 (Edit Audience — Resolve Now)                                    |
| 37.15 | POST   | `/api/v1/inbox/audiences/preview`                     | `inbox.send`            | 7 (Audience Picker), 8 (Audience Chip Builder)                      |
| 37.16 | GET    | `/api/v1/inbox/audiences/providers`                   | `inbox.send`            | 8 (Audience Chip Builder), 15 (Create Audience), 16 (Edit Audience) |
| 37.17 | POST   | `/api/v1/inbox/attachments`                           | `inbox.send`            | 10 (Attachment Uploader)                                            |
| 37.18 | GET    | `/api/v1/inbox/oversight/conversations`               | `inbox.oversight.read`  | 17 (Oversight — Conversations Tab)                                  |
| 37.19 | GET    | `/api/v1/inbox/oversight/conversations/{id}`          | `inbox.oversight.read`  | 20 (Oversight Thread Detail)                                        |
| 37.20 | POST   | `/api/v1/inbox/oversight/conversations/{id}/freeze`   | `inbox.oversight.write` | 19 (Freeze Dialog)                                                  |
| 37.21 | POST   | `/api/v1/inbox/oversight/conversations/{id}/unfreeze` | `inbox.oversight.write` | 20 (Oversight Thread Detail)                                        |
| 37.22 | POST   | `/api/v1/inbox/oversight/conversations/{id}/export`   | `inbox.oversight.write` | 20 (Oversight Thread Detail)                                        |
| 37.23 | GET    | `/api/v1/inbox/oversight/flags`                       | `inbox.oversight.read`  | 2 (Hub Dashboard), 17 (Oversight — Flags Tab)                       |
| 37.24 | POST   | `/api/v1/inbox/oversight/flags/{id}/dismiss`          | `inbox.oversight.write` | 18 (Flag Review Modal — Dismiss)                                    |
| 37.25 | POST   | `/api/v1/inbox/oversight/flags/{id}/escalate`         | `inbox.oversight.write` | 18 (Flag Review Modal — Escalate)                                   |
| 37.26 | GET    | `/api/v1/inbox/oversight/audit-log`                   | `inbox.oversight.read`  | 17 (Oversight — Audit Tab)                                          |
| 37.27 | GET    | `/api/v1/inbox/oversight/keywords`                    | `inbox.oversight.read`  | 27 (Safeguarding Keywords)                                          |
| 37.28 | POST   | `/api/v1/inbox/oversight/keywords`                    | `inbox.oversight.write` | 27 (Safeguarding Keywords — Add)                                    |
| 37.29 | PATCH  | `/api/v1/inbox/oversight/keywords/{id}`               | `inbox.oversight.write` | 27 (Safeguarding Keywords — Edit)                                   |
| 37.30 | DELETE | `/api/v1/inbox/oversight/keywords/{id}`               | `inbox.oversight.write` | 27 (Safeguarding Keywords — Delete)                                 |
| 37.31 | PATCH  | `/api/v1/inbox/oversight/keywords/{id}/active`        | `inbox.oversight.write` | 27 (Safeguarding Keywords — Toggle Active)                          |
| 37.32 | POST   | `/api/v1/inbox/oversight/keywords/bulk-import`        | `inbox.oversight.write` | 27 (Safeguarding Keywords — Bulk Import)                            |
| 37.33 | GET    | `/api/v1/announcements`                               | `communications.view`   | 2 (Hub Dashboard), 21 (Announcements List)                          |
| 37.34 | POST   | `/api/v1/announcements`                               | `communications.manage` | 22 (New Announcement)                                               |
| 37.35 | GET    | `/api/v1/announcements/{id}`                          | `communications.view`   | 23 (Announcement Detail)                                            |
| 37.36 | PATCH  | `/api/v1/announcements/{id}`                          | `communications.manage` | 23 (Announcement Detail — Save)                                     |
| 37.37 | POST   | `/api/v1/announcements/{id}/publish`                  | `communications.send`   | 22 (New Announcement), 23 (Announcement Detail)                     |
| 37.38 | POST   | `/api/v1/announcements/{id}/archive`                  | `communications.manage` | 23 (Announcement Detail — Archive)                                  |
| 37.39 | GET    | `/api/v1/inquiries`                                   | Admin role              | 24 (Admin Inquiries List)                                           |
| 37.40 | GET    | `/api/v1/inquiries/{id}`                              | Admin role              | 25 (Admin Inquiry Detail)                                           |
| 37.41 | POST   | `/api/v1/inquiries/{id}/messages`                     | Admin role              | 25 (Admin Inquiry Detail — Reply)                                   |
| 37.42 | POST   | `/api/v1/inquiries/{id}/close`                        | Admin role              | 25 (Admin Inquiry Detail — Close)                                   |
| 37.43 | GET    | `/api/v1/settings/inbox`                              | `inbox.settings.read`   | 26 (Messaging Policy), 28 (Fallback)                                |
| 37.44 | PUT    | `/api/v1/settings/inbox`                              | `inbox.settings.write`  | 26 (Messaging Policy — Save), 28 (Fallback — Save)                  |
| 37.45 | GET    | `/api/v1/settings/policy`                             | `inbox.settings.read`   | 26 (Messaging Policy)                                               |
| 37.46 | PUT    | `/api/v1/settings/policy`                             | `inbox.settings.write`  | 26 (Messaging Policy — Save)                                        |
| 37.47 | POST   | `/api/v1/settings/policy/reset`                       | `inbox.settings.write`  | 26 (Messaging Policy — Reset)                                       |
| 37.48 | POST   | `/api/v1/settings/fallback/test`                      | `inbox.settings.write`  | 28 (Fallback — Test)                                                |
| 37.49 | GET    | `/api/v1/notification-settings`                       | Authenticated           | 29 (Notification Settings)                                          |
| 37.50 | PATCH  | `/api/v1/notification-settings/{type}`                | Admin role              | 29 (Notification Settings — Update)                                 |
| 37.51 | GET    | `/api/v1/me/preferences`                              | Authenticated           | 30 (Profile Communication Preferences)                              |
| 37.52 | PATCH  | `/api/v1/me/preferences`                              | Authenticated           | 30 (Profile Communication Preferences — Save)                       |

---

## 38. Console and Network Health

| #     | What to Check                                                                          | Expected Result                                                                                                                                                                                                                      | Pass/Fail |
| ----- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 38.1  | Open the browser console (F12 > Console) and navigate through all Communications pages | **Zero uncaught JavaScript errors** (red errors) appear in the console. Warnings are acceptable.                                                                                                                                     |           |
| 38.2  | Navigate to `/en/communications` (Hub Dashboard) and check for expected 403s           | The oversight flags API call (`GET /api/v1/inbox/oversight/flags`) may return **403** for users with the "admin" role (not admin-tier). This is expected and handled gracefully (em dash in the card). No uncaught error in console. |           |
| 38.3  | Stay on `/en/inbox` for 2 minutes and observe the Network tab                          | The polling call `GET /api/v1/inbox/state` fires every **~30 seconds** (4 calls in 2 minutes). No duplicate or overlapping requests.                                                                                                 |           |
| 38.4  | Open a thread and stay for 2 minutes                                                   | The thread polling call `GET /api/v1/inbox/conversations/{id}` fires every **~30 seconds**.                                                                                                                                          |           |
| 38.5  | Verify no **429 Too Many Requests** responses                                          | No API call returns a 429 status code. The polling cadence does not trigger rate limiting.                                                                                                                                           |           |
| 38.6  | Verify no **CORS errors** in the console                                               | No "Access-Control-Allow-Origin" or similar CORS errors appear in the console for any API call.                                                                                                                                      |           |
| 38.7  | Navigate rapidly between inbox, announcements, oversight, and settings                 | No white screens, no "chunk load" errors, no stale data leaks. All transitions are smooth.                                                                                                                                           |           |
| 38.8  | Open and close the Compose Dialog multiple times rapidly                               | No memory leaks, no duplicate event listeners, no console errors. The dialog opens and closes cleanly each time.                                                                                                                     |           |
| 38.9  | Submit a search with a very long query (200+ characters)                               | The API handles it gracefully. No 400 or 500 error. Either results are returned or an appropriate message is shown.                                                                                                                  |           |
| 38.10 | Verify no `Failed to fetch` errors during normal navigation                            | All API calls succeed (200/201) during normal navigation. Network errors are handled with appropriate error states or toasts.                                                                                                        |           |

---

## 39. Sign-off

| #    | What to Check                                               | Expected Result                                                                                                                        | Pass/Fail |
| ---- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 39.1 | All sections 1-38 have been completed                       | Every row in every table has been checked and marked Pass or Fail.                                                                     |           |
| 39.2 | All Fail items have been logged with details                | Any row marked Fail has a corresponding bug report or note describing the issue, steps to reproduce, and expected vs actual behaviour. |           |
| 39.3 | Cross-module flows (32, 33, 34) have been tested end-to-end | The full lifecycle flows (announcement, messaging, oversight) have been verified across multiple user roles.                           |           |
| 39.4 | Arabic/RTL testing (36) has been completed                  | All pages have been verified in Arabic locale with correct RTL layout.                                                                 |           |
| 39.5 | Console and network health (38) is clean                    | No uncaught errors, no CORS issues, no rate limiting, correct polling cadence.                                                         |           |

**Tester Name:** ************\_\_\_************
**Date:** ************\_\_\_************
**Environment:** Production (`https://nhqs.edupod.app`)
**Browser:** ************\_\_\_************
**Viewport(s) Tested:** ************\_\_\_************

---

_End of E2E Test Specification: Communications — Full Module (Admin View)_
