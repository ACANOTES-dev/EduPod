# E2E Test Specification: Dashboard Page

**Page URL:** `https://edupod.app/en/dashboard`
**Page Title:** School OS
**Prerequisite:** You must be logged in as a user with the **School Owner** role. Use the credentials provided by the project team. After login, the browser must land on the dashboard page. If it does not, navigate to the URL above manually.

---

## Table of Contents

1. [Page Load Verification](#1-page-load-verification)
2. [Morph Bar (Top Navigation Bar)](#2-morph-bar-top-navigation-bar)
   - 2.1 [School Logo and Name](#21-school-logo-and-name)
   - 2.2 [Hub Navigation Buttons](#22-hub-navigation-buttons)
   - 2.3 [Notifications Button](#23-notifications-button)
   - 2.4 [User Profile Button](#24-user-profile-button)
3. [Greeting Row](#3-greeting-row)
4. [Needs Your Attention (Priority Feed)](#4-needs-your-attention-priority-feed)
5. [Mini Calendar](#5-mini-calendar)
6. [Upcoming Events](#6-upcoming-events)
7. [Today's Activity (Activity Feed)](#7-todays-activity-activity-feed)
8. [School Snapshot (Right Sidebar)](#8-school-snapshot-right-sidebar)
9. [This Week Card (Right Sidebar)](#9-this-week-card-right-sidebar)
10. [Quick Actions (Right Sidebar)](#10-quick-actions-right-sidebar)
11. [Global Search / Command Palette](#11-global-search--command-palette)
12. [Registration Wizard](#12-registration-wizard)

---

## 1. Page Load Verification

| #   | What to Check                                              | Expected Result                                                                                                                                                                                                                                                                                                                       | Pass/Fail |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.1 | Navigate to `https://edupod.app/en/dashboard`              | Page loads without a blank white screen. No "Something went wrong" error. The browser tab title reads **"School OS"**.                                                                                                                                                                                                                |           |
| 1.2 | Wait for the page to fully load (up to 5 seconds)          | All sections described below are visible. No infinite loading spinners remain on screen after 5 seconds.                                                                                                                                                                                                                              |           |
| 1.3 | Check the browser console (press F12, click "Console" tab) | There should be **no red errors** related to "Failed to fetch" or "500 Internal Server Error" for the following API endpoints: `/api/v1/dashboard/school-admin`, `/api/v1/finance/dashboard`, `/api/v1/behaviour/analytics/overview`, `/api/v1/engagement/calendar-events`, `/api/v1/audit-logs`. Occasional warnings are acceptable. |           |

---

## 2. Morph Bar (Top Navigation Bar)

The morph bar is the horizontal bar permanently fixed at the very top of the page. It contains the school identity, navigation hubs, notifications, and user profile.

### 2.1 School Logo and Name

| #     | What to Check                                                                | Expected Result                                                                                                                                                         | Pass/Fail |
| ----- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1.1 | Look at the far left of the morph bar                                        | You see the **school logo** (a small image, approximately 28x28 pixels) followed by the text **"Nurul Huda School"** (or the tenant's configured school name).          |           |
| 2.1.2 | Verify the logo is an actual image, not just a coloured circle with a letter | The logo should be the school's uploaded emblem. If no logo has been uploaded, a coloured circle with the first letter of the school name (e.g., "N") is shown instead. |           |

### 2.2 Hub Navigation Buttons

The morph bar contains **9 navigation hub buttons** in a horizontal row. Each button navigates to a different section of the application.

| #      | Button Label               | Action                                             | Expected Result                                                                                                                                                                                                                                   | Pass/Fail |
| ------ | -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.2.1  | **Home**                   | Click the "Home" button                            | Browser navigates to `/en/dashboard`. The "Home" button appears visually selected/active (highlighted or underlined).                                                                                                                             |           |
| 2.2.2  | **People**                 | Click the "People" button                          | Browser navigates to `/en/students`. A **sub-strip** (secondary navigation bar) appears below the morph bar with tabs: **Students**, **Staff**, **Households**.                                                                                   |           |
| 2.2.3  | **Learning**               | Click the "Learning" button                        | Browser navigates to `/en/classes`. A sub-strip appears with tabs: **Classes**, **Attendance**, **Gradebook**, **Report Cards**, and a **"More"** overflow button.                                                                                |           |
| 2.2.4  | **Wellbeing**              | Click the "Wellbeing" button                       | Browser navigates to `/en/behaviour`. A sub-strip appears with tabs: **Behaviour**, **Incidents**, **Pastoral**, **SEN**, and a **"More"** overflow button.                                                                                       |           |
| 2.2.5  | **Operations**             | Click the "Operations" button                      | Browser navigates to `/en/admissions`. A sub-strip appears with tabs: **Admissions**, **Engagement**, **Communications**, **Approvals**, and a **"More"** overflow button.                                                                        |           |
| 2.2.6  | **Finance**                | Click the "Finance" button                         | Browser navigates to `/en/finance`. A sub-strip appears with tabs: **Overview**, **Fee Structures**, **Invoices**, **Payments**, **Credit Notes**, **Refunds**, **Payment Plans**, **Statements**, **Reports**, and a **"More"** overflow button. |           |
| 2.2.7  | **Reports**                | Click the "Reports" button                         | Browser navigates to `/en/reports`. No sub-strip appears (Reports has no sub-tabs).                                                                                                                                                               |           |
| 2.2.8  | **Regulatory**             | Click the "Regulatory" button                      | Browser navigates to `/en/regulatory`. A sub-strip appears with tabs: **Dashboard**, **Tusla**, **P-POD / POD**, **DES Returns**, **Safeguarding**, and a **"More"** overflow button.                                                             |           |
| 2.2.9  | **Settings**               | Click the "Settings" button                        | Browser navigates to `/en/settings`. A sub-strip appears with tabs: **General**, **Roles**, and a **"More"** overflow button.                                                                                                                     |           |
| 2.2.10 | Navigate back to Dashboard | Click the "Home" button to return to the dashboard | Browser returns to `/en/dashboard`. The sub-strip disappears. The Home button is active.                                                                                                                                                          |           |

### 2.3 Notifications Button

The Notifications button is on the far right side of the morph bar, shown as a **bell icon**.

| #     | Action                                                              | Expected Result                                                                                                                                                          | Pass/Fail |
| ----- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 2.3.1 | Click the **bell icon** button                                      | A dropdown panel appears below the bell icon with the heading **"Notifications"**. If there are no notifications, the panel displays the message **"No notifications"**. |           |
| 2.3.2 | Click the **bell icon** again (or click anywhere outside the panel) | The notifications panel closes.                                                                                                                                          |           |
| 2.3.3 | (Optional) Verify keyboard shortcut                                 | Press **Alt+T** on the keyboard. The notifications panel should open. Press **Escape** to close it.                                                                      |           |

### 2.4 User Profile Button

The User Profile button is at the far right of the morph bar, to the right of the bell icon. It shows the user's **initials in a circle** (e.g., "YR"), their **name** ("Yusuf Rahman"), and their **role** ("School Owner").

| #      | Action                                                                                     | Expected Result                                                                                                                                | Pass/Fail |
| ------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.4.1  | Click the **user profile button** (the area showing "Yusuf Rahman / School Owner")         | A dropdown menu appears with the following items in order:                                                                                     |           |
|        |                                                                                            | **Header:** Displays the user's full name ("Yusuf Rahman") and email ("owner@nhqs.test").                                                      |           |
|        |                                                                                            | **Separator line**                                                                                                                             |           |
|        |                                                                                            | **Profile** — a clickable menu item with a user icon.                                                                                          |           |
|        |                                                                                            | **Communication preferences** — a clickable menu item with a settings icon.                                                                    |           |
|        |                                                                                            | **Separator line**                                                                                                                             |           |
|        |                                                                                            | **Arabic language toggle** showing text in Arabic script.                                                                                      |           |
|        |                                                                                            | **Theme** section with three buttons: **Light**, **Dark**, **System**.                                                                         |           |
|        |                                                                                            | **Separator line**                                                                                                                             |           |
|        |                                                                                            | **Log out** — a clickable menu item with a logout icon.                                                                                        |           |
| 2.4.2  | Click **Profile** in the dropdown                                                          | Browser navigates to `/en/profile`. The user's profile settings page loads.                                                                    |           |
| 2.4.3  | Navigate back to Dashboard. Open the user menu again. Click **Communication preferences**  | Browser navigates to `/en/profile` (or a communication preferences section). A settings page loads.                                            |           |
| 2.4.4  | Navigate back to Dashboard. Open the user menu again. Click the **Arabic language toggle** | The entire interface switches to Arabic. All text becomes right-to-left (RTL). The URL changes from `/en/dashboard` to `/ar/dashboard`.        |           |
| 2.4.5  | Switch back to English (open user menu, click the English toggle)                          | The interface returns to English (LTR). URL returns to `/en/dashboard`.                                                                        |           |
| 2.4.6  | Open the user menu. Click the **Dark** theme button                                        | The page colour scheme changes to a dark background with light text. The dashboard remains functional.                                         |           |
| 2.4.7  | Open the user menu. Click the **Light** theme button                                       | The page colour scheme returns to a white/light background with dark text.                                                                     |           |
| 2.4.8  | Open the user menu. Click the **System** theme button                                      | The page colour scheme matches your operating system's theme preference (light or dark).                                                       |           |
| 2.4.9  | Open the user menu. Click **Log out**                                                      | The user is logged out. The browser redirects to the login page (`/en/login`). The dashboard is no longer accessible without logging in again. |           |
| 2.4.10 | (After testing Log out) Log back in with the same credentials                              | You return to the dashboard. All elements are present as before.                                                                               |           |

---

## 3. Greeting Row

The greeting row is the first content section below the morph bar, at the top of the main content area.

| #   | What to Check            | Expected Result                                                                                                                                                                                                      | Pass/Fail |
| --- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1 | Greeting heading         | A large heading reads **"Good [morning/afternoon/evening], [First Name]"** where the time-of-day greeting matches the current time and the first name matches the logged-in user (e.g., "Good evening, Yusuf").      |           |
| 3.2 | Date and school line     | Below the greeting, a line reads: **"[Day of week], [Date] [Month] [bullet] [School Name]"** (e.g., "Monday, 6 April - Nurul Huda School"). The date must match today's actual date.                                 |           |
| 3.3 | "Report Issue" link      | On the far right of the greeting row, there is a link labelled **"Report Issue"** with a small icon to its left.                                                                                                     |           |
| 3.4 | Click **"Report Issue"** | Your default email application opens (or the browser prompts to open an email client) with a new email addressed to **support@edupod.app**. The subject line is pre-filled with **"Issue Report -- [School Name]"**. |           |

---

## 4. Needs Your Attention (Priority Feed)

This section appears directly below the greeting row. It displays cards for items that require the administrator's attention. The cards are **data-driven** — they only appear when there is real data.

| #   | What to Check                          | Expected Result                                                                                                                                                                                                                                                                                          | Pass/Fail |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1 | Section heading                        | The heading reads **"Needs Your Attention"**.                                                                                                                                                                                                                                                            |           |
| 4.2 | Outstanding Balance card (if present)  | If the school has unpaid invoices, a card appears showing: an orange/amber warning icon on the left, the title **"Outstanding Balance"**, a description like **"44,800 unpaid across invoices"** (the number reflects the actual total), and a link **"Review invoices"** on the right side of the card. |           |
| 4.3 | Click **"Review invoices"**            | Browser navigates to `/en/finance/invoices`. The finance invoices list page loads, showing the school's invoices.                                                                                                                                                                                        |           |
| 4.4 | Navigate back to Dashboard             | Click the browser's back button or click "Home" in the morph bar. The dashboard reloads correctly.                                                                                                                                                                                                       |           |
| 4.5 | Unresolved Incidents card (if present) | If there are open behaviour follow-ups or active alerts, a card appears showing the title **"Unresolved Incidents"** with a count and a link **"View incidents"** that navigates to `/en/behaviour/incidents`.                                                                                           |           |
| 4.6 | Pending Approvals card (if present)    | If there are pending approval requests, a card appears with the title **"Pending Approvals"** and a link **"Review approvals"** that navigates to `/en/approvals`.                                                                                                                                       |           |
| 4.7 | Pending Admissions card (if present)   | If there are admissions applications pending review, a card appears with the title **"Pending Admissions"** and a link **"Review applications"** that navigates to `/en/admissions`.                                                                                                                     |           |
| 4.8 | Empty state                            | If **none** of the above conditions are met (no outstanding balance, no incidents, no approvals, no admissions), the section displays the message: **"All clear -- Nothing needs your attention right now."** with a green checkmark icon.                                                               |           |

---

## 5. Mini Calendar

The Mini Calendar is positioned in the bottom-left area of the main content, below the Priority Feed. It shows a small monthly calendar.

| #   | What to Check                                  | Expected Result                                                                                                                                                                              | Pass/Fail |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1 | Current month heading                          | The calendar displays the current month name (e.g., **"April"**) as a heading.                                                                                                               |           |
| 5.2 | Day-of-week headers                            | A row of abbreviated day names appears: **Mo, Tu, We, Th, Fr, Sa, Su**.                                                                                                                      |           |
| 5.3 | Today's date                                   | Today's date number is visually highlighted (distinct background colour or bold styling) compared to other dates.                                                                            |           |
| 5.4 | Dates outside current month                    | Dates from the previous month (shown at the start of the grid) and the next month (shown at the end) appear in a **muted/greyed-out** colour, distinguishable from current-month dates.      |           |
| 5.5 | Click **"Previous month"** button (left arrow) | The calendar switches to the previous month. The heading updates (e.g., from "April" to "March"). The date grid updates accordingly.                                                         |           |
| 5.6 | Click **"Next month"** button (right arrow)    | The calendar switches to the next month. The heading updates (e.g., from "March" to "April", then to "May"). The date grid updates accordingly.                                              |           |
| 5.7 | Event dots (if events exist)                   | If there are calendar events on certain dates, those dates show a small coloured dot below the date number. Past event dates show a muted dot; future event dates show a more prominent dot. |           |
| 5.8 | Click on a date with an event dot              | The date may highlight or the Upcoming Events section (see Section 6) may filter. At minimum, clicking a date should not cause an error or navigate away from the dashboard.                 |           |

---

## 6. Upcoming Events

This section is positioned in the middle column of the bottom area, next to the Mini Calendar.

| #   | What to Check                | Expected Result                                                                                               | Pass/Fail |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1 | Section heading              | The heading reads **"Upcoming Events"**.                                                                      |           |
| 6.2 | Filter buttons               | Three filter buttons appear below the heading: **"All"**, **"Academic"**, **"Admin"**.                        |           |
| 6.3 | Click **"All"** button       | The button appears selected/active. All events are shown (or the empty state if no events).                   |           |
| 6.4 | Click **"Academic"** button  | The button appears selected/active. Only academic-type events are shown.                                      |           |
| 6.5 | Click **"Admin"** button     | The button appears selected/active. Only admin-type events are shown.                                         |           |
| 6.6 | Empty state                  | If there are no upcoming events, the section shows an icon and the text **"No upcoming events"**.             |           |
| 6.7 | Events listed (if present)   | Each event card shows the event **title**, **date**, and **type**. Events are ordered by date, soonest first. |           |
| 6.8 | **"Go to Events -->"** link  | At the bottom of the section, a link reads **"Go to Events -->"**.                                            |           |
| 6.9 | Click **"Go to Events -->"** | Browser navigates to `/en/engagement/events`. The events list page loads.                                     |           |

---

## 7. Today's Activity (Activity Feed)

This section is positioned in the right column of the bottom area, next to Upcoming Events.

| #   | What to Check                 | Expected Result                                                                                                      | Pass/Fail |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1 | Section heading               | The heading reads **"Today's Activity"**.                                                                            |           |
| 7.2 | **"View all log -->"** link   | A link in the top-right corner of this section reads **"View all log -->"**.                                         |           |
| 7.3 | Click **"View all log -->"**  | Browser navigates to `/en/settings/audit-log`. The audit log page loads showing historical activity entries.         |           |
| 7.4 | Activity entries (if present) | Each entry shows a brief description of what action was taken, by whom, and when. Entries are for today's date only. |           |
| 7.5 | Empty state                   | If no activity has been recorded today, the section shows an icon and the text **"No activity recorded today"**.     |           |

---

## 8. School Snapshot (Right Sidebar)

The School Snapshot is a card in the right sidebar (visible on desktop/laptop screens with width >= 1024px). On mobile, it appears inline above the Priority Feed.

| #   | What to Check                 | Expected Result                                                                                                                                                                                                                       | Pass/Fail |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1 | Card heading                  | The heading reads **"School Snapshot"**.                                                                                                                                                                                              |           |
| 8.2 | Total Students                | A metric labelled **"Total Students"** displays a number (e.g., **209**). This must be a real number pulled from the database, not a placeholder or zero (unless the school genuinely has zero students).                             |           |
| 8.3 | Teaching Staff                | A metric labelled **"Teaching Staff"** displays a number (e.g., **32**).                                                                                                                                                              |           |
| 8.4 | Active Classes                | A metric labelled **"Active Classes"** displays a number (e.g., **16**).                                                                                                                                                              |           |
| 8.5 | Attendance                    | A metric labelled **"Attendance"** displays either a percentage (e.g., **95%**) or a dash (**"--"**) if attendance data is not yet available.                                                                                         |           |
| 8.6 | Verify data is not all dashes | At least **Total Students**, **Teaching Staff**, and **Active Classes** should show real numbers if the school has data in the system. If all four metrics show dashes, this is a **failure** indicating the API data is not loading. |           |

---

## 9. This Week Card (Right Sidebar)

The "This Week" card is positioned below the School Snapshot in the right sidebar.

| #   | What to Check    | Expected Result                                                                                                     | Pass/Fail |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1 | Card heading     | The heading reads **"This Week"**.                                                                                  |           |
| 9.2 | Attendance Rate  | A metric labelled **"Attendance Rate"** shows either a number/percentage or a dash (**"--"**) if not yet available. |           |
| 9.3 | New Admissions   | A metric labelled **"New Admissions"** shows either a number or a dash.                                             |           |
| 9.4 | Incidents Logged | A metric labelled **"Incidents Logged"** shows a number (e.g., **0**). This should always be a number, not a dash.  |           |

---

## 10. Quick Actions (Right Sidebar)

The Quick Actions section is at the bottom of the right sidebar, displayed as a 2-column grid of buttons.

| #    | Button Label                               | Type                                                 | Action                                                           | Expected Result                                                                                                                                                                                                                                                                                                                                          | Pass/Fail |
| ---- | ------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1 | **Register New Family**                    | Button (not a link)                                  | Click it                                                         | A **modal dialog** (popup) opens in the centre of the screen. The dialog title reads **"Register Family"**. It shows **"Step 1 of 5 -- Parent & Household"**. The modal contains a form with fields for parent details. The URL does **not** change -- you remain on `/en/dashboard`. See [Section 12](#12-registration-wizard) for full wizard testing. |           |
| 10.2 | **Register New Student**                   | Link                                                 | Click it                                                         | Browser navigates to `/en/households`. The Households page loads.                                                                                                                                                                                                                                                                                        |           |
| 10.3 | **Record Payment**                         | Link                                                 | Click it                                                         | Browser navigates to `/en/finance/payments/new`. A new payment form page loads.                                                                                                                                                                                                                                                                          |           |
| 10.4 | **Take Attendance**                        | Link                                                 | Click it                                                         | Browser navigates to `/en/attendance`. The attendance page loads.                                                                                                                                                                                                                                                                                        |           |
| 10.5 | **Send Announcement**                      | Link (full width -- spans both columns)              | Click it                                                         | Browser navigates to `/en/communications`. The communications page loads.                                                                                                                                                                                                                                                                                |           |
| 10.6 | **Find Student**                           | Link (full width -- spans both columns)              | Click it                                                         | Browser navigates to `/en/students`. The students list page loads.                                                                                                                                                                                                                                                                                       |           |
| 10.7 | Navigate back to Dashboard after each test | Click browser back button or "Home" in the morph bar | Dashboard reloads correctly every time with all sections intact. |                                                                                                                                                                                                                                                                                                                                                          |

---

## 11. Global Search / Command Palette

The command palette is a search dialog accessible via keyboard shortcut. It is **not a visible button on the dashboard** -- it is triggered by a keyboard combination.

| #    | Action                                                         | Expected Result                                                                                                                                                                                                                          | Pass/Fail |
| ---- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1 | Press **Cmd+K** (Mac) or **Ctrl+K** (Windows/Linux)            | A search dialog appears in the centre of the screen, overlaying the dashboard. The dialog has a **search input field** with a magnifying glass icon. Below the input, a section labelled **"Create new..."** shows quick-create options. |           |
| 11.2 | Verify "Create new..." options                                 | The following options appear: **New Student**, **New Invoice**, **New Staff**.                                                                                                                                                           |           |
| 11.3 | Type a search query (e.g., a student name) in the search field | As you type, search results appear below the input. Results should match students, staff, or other records in the system.                                                                                                                |           |
| 11.4 | Click a search result                                          | The browser navigates to the corresponding record's detail page (e.g., clicking a student name navigates to that student's profile).                                                                                                     |           |
| 11.5 | Press **Escape** (or click the **X / Close** button)           | The search dialog closes. The dashboard is visible again, unchanged.                                                                                                                                                                     |           |
| 11.6 | Open the palette again, click **"New Student"**                | The browser navigates to the new student creation page.                                                                                                                                                                                  |           |
| 11.7 | Navigate back. Open palette, click **"New Invoice"**           | The browser navigates to the new invoice creation page.                                                                                                                                                                                  |           |
| 11.8 | Navigate back. Open palette, click **"New Staff"**             | The browser navigates to the new staff creation page.                                                                                                                                                                                    |           |

---

## 12. Registration Wizard

The Registration Wizard is a 5-step modal dialog triggered **only** by clicking the "Register New Family" quick action button (see Section 10.1). It does not have its own URL.

| #    | What to Check                  | Expected Result                                                                                                                                                                           | Pass/Fail                                                                                                          |
| ---- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --- |
| 12.1 | Wizard opens                   | After clicking "Register New Family", a full-screen or large modal dialog opens. The title reads **"Register Family"**. The step indicator shows **"Step 1 of 5 -- Parent & Household"**. |                                                                                                                    |
| 12.2 | Step 1 form fields             | The form contains the following sections and fields:                                                                                                                                      |                                                                                                                    |
|      |                                | **Primary Parent / Guardian:** First Name (required), Last Name (required), Email, Phone (required), Relationship dropdown (required).                                                    |                                                                                                                    |
|      |                                | **Second Parent / Guardian:** A collapsible section with a **"+ Add Second Parent / Guardian"** button. Clicking it reveals the same fields as the primary parent.                        |                                                                                                                    |
|      |                                | **Household:** Household Name, Address Line 1 (required), Address Line 2, City (required), Country (required), Postal Code.                                                               |                                                                                                                    |
|      |                                | **Emergency Contact:** A collapsible section with a **"+ Add Emergency Contact"** button.                                                                                                 |                                                                                                                    |
| 12.3 | Close the wizard               | Click the **X** button (top-right corner of the modal) or press **Escape**                                                                                                                | The modal closes. The dashboard is fully visible and unchanged. No data is saved. The URL remains `/en/dashboard`. |     |
| 12.4 | Re-open and verify state reset | Click "Register New Family" again                                                                                                                                                         | The wizard opens fresh at Step 1 with all fields empty (no data persisted from the previous opening).              |     |

---

## Appendix A: Mobile Responsiveness (Screen Width < 768px)

If testing on a mobile device or by resizing the browser window to less than 768px wide:

| #   | What to Check                | Expected Result                                                                                                                                                                                                        | Pass/Fail |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| A.1 | Morph bar layout             | The hub navigation buttons (Home, People, Learning, etc.) are **hidden**. A **hamburger menu icon** (three horizontal lines) appears on the far left of the morph bar.                                                 |           |
| A.2 | Click the **hamburger menu** | A full-screen overlay appears showing all hub navigation options (Home, People, Learning, Wellbeing, Operations, Finance, Reports, Regulatory, Settings) and a search button. The school name is displayed at the top. |           |
| A.3 | Quick Actions layout         | The Quick Actions section (Register New Family, etc.) appears as a **horizontally scrollable row** instead of a 2-column grid. You can swipe left/right to see all actions.                                            |           |
| A.4 | School Snapshot layout       | The School Snapshot appears as a **compact 2x2 grid** inline with the main content, not in a side panel.                                                                                                               |           |
| A.5 | No horizontal scrollbar      | The page should not have a horizontal scrollbar. All content fits within the screen width.                                                                                                                             |           |

---

## Appendix B: Summary of All Clickable Elements

For quick reference, here is every clickable element on the dashboard page and where it leads:

| Element                   | Location                      | Type            | Destination / Action                        |
| ------------------------- | ----------------------------- | --------------- | ------------------------------------------- |
| School Logo + Name        | Morph bar, far left           | Display only    | Not clickable                               |
| Home                      | Morph bar                     | Button          | `/en/dashboard`                             |
| People                    | Morph bar                     | Button          | `/en/students`                              |
| Learning                  | Morph bar                     | Button          | `/en/classes`                               |
| Wellbeing                 | Morph bar                     | Button          | `/en/behaviour`                             |
| Operations                | Morph bar                     | Button          | `/en/admissions`                            |
| Finance                   | Morph bar                     | Button          | `/en/finance`                               |
| Reports                   | Morph bar                     | Button          | `/en/reports`                               |
| Regulatory                | Morph bar                     | Button          | `/en/regulatory`                            |
| Settings                  | Morph bar                     | Button          | `/en/settings`                              |
| Bell icon (Notifications) | Morph bar, far right          | Button          | Opens notifications dropdown                |
| User profile              | Morph bar, far right          | Button          | Opens user menu dropdown                    |
| Profile (in user menu)    | User menu dropdown            | Menu item       | `/en/profile`                               |
| Communication preferences | User menu dropdown            | Menu item       | Communication preferences page              |
| Arabic toggle             | User menu dropdown            | Menu item       | Switches UI to Arabic (RTL)                 |
| Light / Dark / System     | User menu dropdown            | Buttons         | Changes colour theme                        |
| Log out                   | User menu dropdown            | Menu item       | Logs out, redirects to `/en/login`          |
| Report Issue              | Greeting row, right side      | Link (mailto)   | Opens email to `support@edupod.app`         |
| Review invoices           | Priority Feed card            | Link            | `/en/finance/invoices`                      |
| View incidents            | Priority Feed card (if shown) | Link            | `/en/behaviour/incidents`                   |
| Review approvals          | Priority Feed card (if shown) | Link            | `/en/approvals`                             |
| Review applications       | Priority Feed card (if shown) | Link            | `/en/admissions`                            |
| Previous month            | Mini Calendar                 | Button          | Shows previous month                        |
| Next month                | Mini Calendar                 | Button          | Shows next month                            |
| Calendar dates            | Mini Calendar                 | Clickable dates | Highlights date; no navigation              |
| All / Academic / Admin    | Upcoming Events filters       | Buttons         | Filters event list by type                  |
| Go to Events -->          | Upcoming Events               | Link            | `/en/engagement/events`                     |
| View all log -->          | Today's Activity              | Link            | `/en/settings/audit-log`                    |
| Register New Family       | Quick Actions                 | Button          | Opens Registration Wizard modal             |
| Register New Student      | Quick Actions                 | Link            | `/en/households`                            |
| Record Payment            | Quick Actions                 | Link            | `/en/finance/payments/new`                  |
| Take Attendance           | Quick Actions                 | Link            | `/en/attendance`                            |
| Send Announcement         | Quick Actions                 | Link            | `/en/communications`                        |
| Find Student              | Quick Actions                 | Link            | `/en/students`                              |
| Cmd+K / Ctrl+K            | Keyboard shortcut             | Shortcut        | Opens Global Search / Command Palette       |
| New Student               | Command Palette               | Option          | Navigates to new student form               |
| New Invoice               | Command Palette               | Option          | Navigates to new invoice form               |
| New Staff                 | Command Palette               | Option          | Navigates to new staff form                 |
| Escape                    | Keyboard                      | Shortcut        | Closes any open modal, dropdown, or palette |
