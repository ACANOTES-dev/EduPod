# School Parent (school_parent) — Complete Functionality Manual

**Application:** School Operating System (EduPod)
**Role:** School Parent (`school_parent`)
**Test Account:** `parent@mdad.test` (Khadija Mahmoud) — Midaad Ul Qalam
**Password:** `Password123!`
**Default Locale:** Arabic (ar)
**Date:** 2026-03-21

---

## Table of Contents

1. [Login & Authentication](#1-login--authentication)
2. [Dashboard](#2-dashboard)
3. [Grades & Report Cards](#3-grades--report-cards)
4. [Announcements](#4-announcements)
5. [Inquiries (Parent-to-School Communication)](#5-inquiries-parent-to-school-communication)
6. [Applications Tracking](#6-applications-tracking)
7. [User Profile & Preferences](#7-user-profile--preferences)
8. [Communication Preferences](#8-communication-preferences)
9. [Active Sessions Management](#9-active-sessions-management)
10. [Multi-Factor Authentication (MFA)](#10-multi-factor-authentication-mfa)
11. [Global UI Elements](#11-global-ui-elements)
12. [Locale Switching & RTL](#12-locale-switching--rtl)
13. [What School Parent CANNOT Do](#13-what-school-parent-cannot-do)

---

## Role Summary

The **School Parent** role is the most restricted role in the system. Parents can only view information about their own linked children and communicate with the school. They have no administrative, teaching, or staff capabilities.

| Feature Area                                    | Access Level                                                  |
| ----------------------------------------------- | ------------------------------------------------------------- |
| Dashboard                                       | Own children only                                             |
| Grades & Report Cards                           | View own children's grades, download report cards/transcripts |
| Announcements                                   | View published announcements targeted to parents              |
| Inquiries                                       | Submit and track inquiries to the school                      |
| Applications                                    | View own admission applications (read-only)                   |
| Profile                                         | Edit own name, locale, theme                                  |
| Communication Preferences                       | Manage notification channels                                  |
| Sessions                                        | View and revoke login sessions                                |
| MFA                                             | Enable/disable two-factor authentication                      |
| Students/Staff/Classes/Finance/Payroll/Settings | **No access**                                                 |

### Permissions (8 total)

| Permission Key              | Description                             |
| --------------------------- | --------------------------------------- |
| `parent.view_own_students`  | View linked students/children           |
| `parent.view_attendance`    | View children's attendance records      |
| `parent.view_grades`        | View children's grades and report cards |
| `parent.view_invoices`      | View household invoices (placeholder)   |
| `parent.make_payments`      | Make payments on invoices (placeholder) |
| `parent.submit_inquiry`     | Submit inquiries/messages to school     |
| `parent.view_announcements` | View school announcements               |
| `parent.view_transcripts`   | View and download transcripts           |

---

## 1. Login & Authentication

### 1.1 Login

1. Navigate to the login page at `/en/login` (or `/ar/login` for Arabic)
2. Enter email: `parent@mdad.test`
3. Enter password: `Password123!`
4. Click "Sign In"
5. If MFA is enabled, enter the 6-digit TOTP code from your authenticator app
6. If the account has multiple school memberships, the school selection page appears — select the school

### 1.2 School Selection (if applicable)

- After login, if the user has memberships in multiple schools, `/select-school` page displays a list of schools
- Click on the school card to proceed to the dashboard

### 1.3 Logout

1. Click the user avatar/name in the top-right corner of the screen
2. From the dropdown menu, click "Logout" (red text)
3. The user is redirected to the login page

### 1.4 Session Persistence

- JWT stored in memory (not localStorage)
- Refresh token via httpOnly cookie
- Session survives page refresh but not browser close (unless "remember me" is active)

---

## 2. Dashboard

**Navigation:** Sidebar > Dashboard (only visible sidebar item for parents)
**URL:** `/{locale}/dashboard`
**API:** `GET /api/v1/dashboard/parent`
**Permission:** `parent.view_own_students`

### 2.1 What You See

The parent dashboard contains three sections:

#### 2.1.1 Greeting Header

- Personalised time-based greeting: "Good morning/afternoon/evening, {first_name}"
- Subtitle: "Here's what's happening at your school today."

#### 2.1.2 Your Students (Linked Children)

- **Section title:** "Your Students"
- **Grid layout:** 1 column on mobile, 2 on tablet, 3 on desktop
- **Each student card displays:**
  - Graduation cap icon (purple circle)
  - Student first name + last name
  - Year group name (e.g., "Grade 5")
  - Status badge with colour coding:
    - Active = green dot + "Active"
    - Applicant = blue dot + "Applicant"
    - Withdrawn = red dot + "Withdrawn"
    - Graduated = grey dot + "Graduated"
    - Archived = grey dot + "Archived"
- **Empty state:** "No students are linked to your account yet." (with graduation cap icon)
- **Loading state:** 2 skeleton cards with pulse animation

#### 2.1.3 Outstanding Invoices

- **Section title:** "Outstanding Invoices"
- **Current state:** Always shows empty state — "No outstanding invoices" (finance module placeholder)
- **Note:** The `parent.view_invoices` permission exists but the invoice listing is not yet connected to real data

#### 2.1.4 Recent Announcements

- **Section title:** "Recent Announcements"
- **Current state:** Always shows empty state — "No announcements have been published recently."
- **Note:** Announcements data exists via the `/api/v1/announcements/my` endpoint but is not yet wired into the dashboard summary section

### 2.2 Actions Available

- **None** — the dashboard is read-only. Student cards are not clickable (no drill-through to student detail). No action buttons on any section.

### 2.3 What You Cannot Do

- Cannot click student cards to view detailed student profiles
- Cannot view attendance from the dashboard
- Cannot view grades from the dashboard (GradesTab component exists but is not integrated)
- Cannot interact with invoice placeholders

---

## 3. Grades & Report Cards

**Component:** `GradesTab` (exists at `dashboard/parent/_components/grades-tab.tsx`)
**API Endpoints:**

- `GET /api/v1/academic-periods?pageSize=50` — Load academic periods
- `GET /api/v1/gradebook/student-grades?student_id={id}&academic_period_id={id}` — Load grades
- `GET /api/v1/report-cards/{id}/pdf` — Preview report card PDF
- `GET /api/v1/transcripts/{studentId}/pdf` — Download transcript PDF
  **Permissions:** `parent.view_grades`, `parent.view_transcripts`

### 3.1 Current Status

**WARNING:** The GradesTab component is built but **NOT integrated** into the parent dashboard page. It exists as an orphan component. The parent currently has **no UI path** to view grades, report cards, or transcripts.

### 3.2 Intended Functionality (when integrated)

#### 3.2.1 Student Selector

- If the parent has more than one child, a dropdown selector appears
- Pre-selects the first child
- Dropdown shows each child's name

#### 3.2.2 Academic Period Selector

- Dropdown showing all academic periods (fetched from API)
- Pre-selects the most recent period
- Changes automatically refresh the grades table

#### 3.2.3 Grades Table

- **Columns:** Subject Name | Score | Grade
- Score displayed in monospace font, LTR direction
- Grade shown as a blue status badge (e.g., "A", "B+")
- Dash ("—") shown if score or grade is null
- "No results" message if no grades exist for the selected period

#### 3.2.4 Published Report Cards

- Listed below the grades table
- Each card shows: Academic Period Name + Published Date (monospace, LTR)
- **Preview button:** Opens the report card PDF in a new browser tab
- Only appears if report cards exist for the selected period

#### 3.2.5 Transcript Download

- "Download Transcript" button (outline style with download icon)
- Opens the transcript PDF in a new browser tab
- Available regardless of period selection (transcript covers all periods)

---

## 4. Announcements

**Navigation:** Direct URL only — not in sidebar
**URL:** `/{locale}/announcements`
**API:** `GET /api/v1/announcements/my`
**Permission:** `parent.view_announcements`

### 4.1 What You See

#### 4.1.1 Page Header

- **Title:** "Announcements" (from translations)
- **Description:** From translations

#### 4.1.2 Announcement Cards

- Displayed as a vertical list of cards
- **Each card shows:**
  - **Title** — bold, left-aligned (or right-aligned in RTL)
  - **Published date** — top-right corner, small grey text
  - **Body preview** — truncated to 200 characters with "..." ellipsis
  - **Author attribution** — "Published at by {author_name}" at the bottom in small grey text

#### 4.1.3 Empty State

- Megaphone icon
- "No announcements" title
- Description text from translations

### 4.2 How to View Announcements

1. Navigate to `/{locale}/announcements` (type in URL bar — no sidebar link exists)
2. The page loads all announcements published to parents
3. Scroll through the announcement cards
4. No pagination — all announcements load at once
5. No search or filter functionality

### 4.3 What You Cannot Do

- Cannot create announcements
- Cannot reply to announcements
- Cannot mark announcements as read
- Cannot filter or search announcements
- Cannot view announcement details (no detail page — full body shown truncated in preview)

---

## 5. Inquiries (Parent-to-School Communication)

**Navigation:** Direct URL only — not in sidebar
**URL:** `/{locale}/inquiries`
**API Endpoints:**

- `GET /api/v1/inquiries/my` — List own inquiries
- `POST /api/v1/inquiries` — Create new inquiry
- `GET /api/v1/inquiries/{id}/parent` — View inquiry detail
- `POST /api/v1/inquiries/{id}/messages` — Send reply message
  **Permission:** `parent.submit_inquiry`
  **Module Required:** `parent_inquiries` (must be enabled on tenant)

### 5.1 Inquiries List Page

#### 5.1.1 Page Header

- **Title:** "Inquiries" (from translations)
- **Description:** "Your inquiries to the school"
- **Action button:** "+ New Inquiry" (primary blue button, top-right)

#### 5.1.2 Inquiry Cards

- Each inquiry displays as a clickable card/row
- **Content per card:**
  - **Subject** — bold, truncated if too long
  - **Status badge** — inline with subject:
    - Open = green dot + "Open"
    - In Progress = orange dot + "In Progress"
    - Closed = grey dot + "Closed"
  - **Last message preview** — truncated, grey text (below subject)
  - **Date** — top-right corner, small grey text (last message date or creation date)
  - **Message count badge** — blue pill with number (only if > 0 messages)
- **Hover effect:** Background changes to secondary surface colour
- **Click action:** Navigates to inquiry detail page

#### 5.1.3 Empty State

- MessageCircle icon
- "No inquiries yet" title
- "Have a question? Send an inquiry to the school." description
- "+ New Inquiry" action button

#### 5.1.4 Loading State

- 3 skeleton rows with pulse animation

### 5.2 Create New Inquiry

**URL:** `/{locale}/inquiries/new`

#### 5.2.1 How to Create an Inquiry

1. From the inquiries list, click "+ New Inquiry" button
2. Fill in the form:
   - **Subject** (required) — text input, max 200 characters
   - **Message** (required) — textarea, 6 rows
   - **Which student is this about?** (optional) — text input for student ID
     - Helper text: "If this inquiry is about a specific student, enter their ID here."
3. Click "Submit" button
4. On success: toast notification "Inquiry submitted" + redirect to inquiry detail page
5. On failure: toast error notification

#### 5.2.2 Form Actions

- **Back button** — top-right, ghost style with left arrow icon (rotates in RTL), navigates back
- **Cancel button** — ghost style, navigates back
- **Submit button** — primary style, disabled when:
  - Subject is empty
  - Message is empty
  - Form is currently submitting (shows "Submitting..." text)

### 5.3 Inquiry Detail Page

**URL:** `/{locale}/inquiries/{id}`

#### 5.3.1 What You See

- **Page title:** The inquiry subject
- **Back button:** Top-right, ghost style with left arrow
- **Status section:** Status badge + "Opened {date}" text

#### 5.3.2 Message Thread

- Displayed as a chat-like interface inside a bordered card
- **Min height:** 320px, **Max height:** 560px (scrollable)
- **Parent messages (your messages):**
  - Left-aligned
  - Light grey background
  - Rounded corners (except bottom-start)
  - Label: "You"
  - Timestamp below
- **Admin messages (school responses):**
  - Right-aligned
  - Primary blue background with white text
  - Rounded corners (except bottom-end)
  - Label: "School Administration" (admin names are masked)
  - Timestamp below
- **Empty state:** "No messages yet." (centred text)
- Auto-scrolls to latest message when loaded

#### 5.3.3 Reply Area

- **If inquiry is Open or In Progress:**
  - Textarea (3 rows) for composing a reply
  - Placeholder text from translations
  - "Send" button with Send icon (small, primary)
  - **Keyboard shortcut:** Cmd+Enter (Mac) or Ctrl+Enter (Windows) to send
  - Button disabled when: reply is empty or message is sending
- **If inquiry is Closed:**
  - Message: "This inquiry is closed" (centred, cannot reply)

#### 5.3.4 Not Found State

- If inquiry ID is invalid or doesn't belong to this parent:
  - Back button
  - Error message from translations

### 5.4 What You Cannot Do

- Cannot close or reopen inquiries
- Cannot delete inquiries
- Cannot change inquiry subject after creation
- Cannot attach files to inquiries
- Cannot see which specific admin responded (always shows "School Administration")

---

## 6. Applications Tracking

**Navigation:** Direct URL only — not in sidebar
**URL:** `/{locale}/applications`
**API:** `GET /api/v1/applications/mine?page={n}&pageSize={n}`
**Permission:** Authentication required (no specific permission guard)

### 6.1 What You See

#### 6.1.1 Page Header

- **Title:** "Applications"
- **Description:** "Track the status of your applications"

#### 6.1.2 Applications Data Table

- **Columns:**
  | Column | Description |
  |---|---|
  | Application Number | Monospace, small grey text (e.g., "APP-202603-001") |
  | Student Name | Bold, primary text |
  | Form | Secondary text (admission form name) |
  | Status | Colour-coded status badge |
  | Submitted At | Date or "—" if not yet submitted |

- **Pagination:**
  - 20 items per page
  - Offset-based pagination controls at bottom
  - Shows total count

- **Row click:** Navigates to application detail at `/{locale}/admissions/{applicationId}`

#### 6.1.3 Empty State

- ClipboardList icon
- "No applications yet" title

#### 6.1.4 Loading State

- Skeleton rows from DataTable component

### 6.2 How to View Applications

1. Navigate to `/{locale}/applications` (type in URL bar)
2. The table loads showing all your admission applications
3. Click any row to view the full application detail
4. Use pagination controls to navigate between pages

### 6.3 What You Cannot Do

- Cannot create new applications from this page (applications are created during the admissions flow)
- Cannot edit existing applications from this page
- Cannot delete or withdraw applications from this page
- Cannot filter or search applications

---

## 7. User Profile & Preferences

**Navigation:** Click user avatar/name in top-right > Profile (or navigate to `/{locale}/profile`)
**URL:** `/{locale}/profile`
**API:** `PATCH /api/v1/me/preferences`

### 7.1 Personal Information Section

#### 7.1.1 Editable Fields

- **First Name** — text input with autocomplete="given-name"
- **Last Name** — text input with autocomplete="family-name"
- **Preferred Locale** — dropdown with options: English, Arabic (العربية)
- **Theme** — toggle buttons (Light/Dark/System) with icons (Sun/Moon/Monitor)
  - Selected theme has primary blue border and background

#### 7.1.2 Read-Only Fields

- **Email** — disabled input, greyed out, shows current email

#### 7.1.3 How to Update Profile

1. Navigate to `/{locale}/profile`
2. Edit First Name and/or Last Name
3. Optionally change Preferred Locale dropdown
4. Optionally change Theme selection
5. Click "Save Profile" button
6. Success: green text "Profile saved" appears
7. Error: red text with error message

---

## 8. Communication Preferences

**Navigation:** Profile page > Communication Preferences link
**URL:** `/{locale}/profile/communication`
**API:** `PATCH /api/v1/me/preferences` (with `communication` field)

### 8.1 What You See

#### 8.1.1 Communication Channels Section

- **Email** — checkbox (default: checked)
  - Description text explaining email notifications
- **SMS** — checkbox (default: unchecked)
  - Description text explaining SMS notifications
- **Push Notifications** — checkbox (default: unchecked)
  - Description text explaining push notifications

#### 8.1.2 Preferred Language

- Dropdown: English / Arabic (العربية)
- Separate from the profile locale preference (this controls notification language)

### 8.2 How to Update Communication Preferences

1. Navigate to `/{locale}/profile/communication` (or click link from Profile page)
2. Toggle the checkboxes for Email, SMS, Push as desired
3. Select preferred language from dropdown
4. Click "Save" button
5. Success: green text confirmation
6. Error: red text with error message

---

## 9. Active Sessions Management

**Location:** Profile page, "Active Sessions" section
**API:**

- `GET /api/v1/auth/sessions` — List sessions
- `DELETE /api/v1/auth/sessions/{id}` — Revoke session

### 9.1 What You See

- **Section title:** "Active Sessions"
- **Description:** "Manage your active login sessions"
- **Session list:** Each session shows:
  - Device/User Agent string (or "Device" placeholder)
  - "Current" badge on the session you're using now
  - IP address (small, LTR formatted)
  - "Last Active: {timestamp}"
  - **Revoke button** (red text with trash icon) — only on non-current sessions

### 9.2 How to Revoke a Session

1. Navigate to `/{locale}/profile`
2. Scroll to "Active Sessions" section
3. Find the session you want to revoke (cannot revoke current session)
4. Click the red "Revoke" button
5. Session is removed from the list
6. Success message appears

---

## 10. Multi-Factor Authentication (MFA)

**Location:** Profile page, "Two-Factor Authentication" section
**API:**

- `POST /api/v1/auth/mfa/setup` — Generate QR code
- `POST /api/v1/auth/mfa/verify` — Verify and enable MFA

### 10.1 MFA Status Display

- If MFA is enabled: Green "Enabled" badge
- If MFA is disabled: "Not Enabled" grey text

### 10.2 How to Enable MFA

1. Navigate to `/{locale}/profile`
2. Find "Two-Factor Authentication" section
3. Click "Enable MFA" button (outline style)
4. A QR code appears (192x192px, bordered)
5. Scan the QR code with an authenticator app (Google Authenticator, Authy, etc.)
6. Enter the 6-digit code from the authenticator app
   - Input is monospace, numeric-only, LTR direction, max 6 digits
7. Click "Verify and Enable" button
8. Success: green text "MFA enabled successfully"
9. The MFA section now shows "Enabled" badge

### 10.3 What You Cannot Do

- Cannot disable MFA from the UI once enabled (no disable button visible)
- Cannot generate backup codes

---

## 11. Global UI Elements

### 11.1 Sidebar Navigation

Parents see only ONE section in the sidebar:

- **Overview**
  - Dashboard (LayoutDashboard icon)

All other sections (People, Academics, Scheduling, Operations, Reports, School) are hidden from parents.

### 11.2 Top Bar

- **Left:** Hamburger menu (mobile) or sidebar toggle
- **Right:**
  - Global Search (Command+K or Ctrl+K)
  - Notification bell
  - User avatar/menu

### 11.3 User Menu Dropdown

- User name and email displayed
- Theme toggle (Light/Dark/System)
- Profile link
- Logout button (red text)

### 11.4 Global Search (Command Palette)

- **Keyboard shortcut:** Cmd+K (Mac) / Ctrl+K (Windows)
- Parents can access the command palette but search results are filtered by permissions
- Parents will see limited results (if any) compared to admin roles

### 11.5 Notification Panel

- Bell icon in the top bar
- Shows in-app notifications (announcements, inquiry responses)
- Click notification to navigate to related content

### 11.6 Toast Notifications

- Success: green themed
- Error: red themed
- Appear temporarily at bottom or top of screen

---

## 12. Locale Switching & RTL

### 12.1 How to Switch Locale

1. Navigate to `/{locale}/profile`
2. Change the "Preferred Locale" dropdown to Arabic (العربية) or English
3. Click "Save Profile"
4. The interface switches to the selected language
5. URL prefix changes (e.g., `/en/dashboard` becomes `/ar/dashboard`)

### 12.2 RTL Behaviour (Arabic Locale)

When Arabic is selected:

- **Layout direction:** Right-to-Left (RTL)
- **Sidebar:** Appears on the right side
- **Text alignment:** Right-aligned by default
- **Navigation arrows:** Rotate 180 degrees (back arrows point right)
- **Form layouts:** Mirror horizontally
- **Dates and numbers:** Remain LTR (Western numerals, Gregorian calendar)
- **Email addresses:** Forced LTR direction
- **IP addresses:** Forced LTR direction
- **Monospace content:** Forced LTR direction

### 12.3 Locale Enforcement

- All text uses translation keys from `messages/{locale}.json`
- Some hardcoded English strings exist (e.g., "You" in inquiry messages, "No messages yet.")
- Parent's default locale is Arabic (ar) as set in seed data

---

## 13. What School Parent CANNOT Do

### 13.1 Administrative Functions — No Access

| Function                  | Result                                     |
| ------------------------- | ------------------------------------------ |
| View/manage students list | Blocked — no sidebar item, API returns 403 |
| View/manage staff         | Blocked — no sidebar item, API returns 403 |
| View/manage households    | Blocked — no sidebar item, API returns 403 |
| View/manage classes       | Blocked — no sidebar item, API returns 403 |
| Create/edit students      | Blocked — no API permission                |
| Create/edit staff         | Blocked — no API permission                |

### 13.2 Academic Functions — No Access

| Function                   | Result                                     |
| -------------------------- | ------------------------------------------ |
| Take attendance            | Blocked — no `attendance.take` permission  |
| View attendance admin page | Blocked — no sidebar item                  |
| Enter grades               | Blocked — no `gradebook.manage` permission |
| Manage report cards        | Blocked — no sidebar item                  |
| Create/manage classes      | Blocked — no sidebar item                  |
| Manage promotions          | Blocked — no sidebar item                  |

### 13.3 Operations Functions — No Access

| Function                           | Result                                     |
| ---------------------------------- | ------------------------------------------ |
| Manage admissions                  | Blocked — no sidebar item, API returns 403 |
| Process/manage finance             | Blocked — no sidebar item                  |
| View/manage payroll                | Blocked — no sidebar item, API returns 403 |
| Manage communications (admin side) | Blocked — no sidebar item                  |
| Manage approvals                   | Blocked — no sidebar item                  |

### 13.4 Scheduling Functions — No Access

| Function              | Result                    |
| --------------------- | ------------------------- |
| View/manage rooms     | Blocked — no sidebar item |
| View/manage schedules | Blocked — no sidebar item |
| View timetables       | Blocked — no sidebar item |
| Run auto-scheduling   | Blocked — no sidebar item |

### 13.5 School Management — No Access

| Function            | Result                    |
| ------------------- | ------------------------- |
| School settings     | Blocked — no sidebar item |
| Website management  | Blocked — no sidebar item |
| Reports             | Blocked — no sidebar item |
| Closures management | Blocked — no sidebar item |

### 13.6 Platform Functions — No Access

| Function              | Result                                    |
| --------------------- | ----------------------------------------- |
| Platform admin panel  | Blocked — separate route group, no access |
| Create/manage tenants | Blocked                                   |
| Manage platform users | Blocked                                   |

---

## Appendix A: Page URL Reference

| Page                      | URL                               | In Sidebar?      |
| ------------------------- | --------------------------------- | ---------------- |
| Login                     | `/{locale}/login`                 | N/A              |
| School Selection          | `/{locale}/select-school`         | N/A              |
| Dashboard                 | `/{locale}/dashboard`             | Yes              |
| Announcements             | `/{locale}/announcements`         | No               |
| Inquiries List            | `/{locale}/inquiries`             | No               |
| New Inquiry               | `/{locale}/inquiries/new`         | No               |
| Inquiry Detail            | `/{locale}/inquiries/{id}`        | No               |
| Applications              | `/{locale}/applications`          | No               |
| Profile                   | `/{locale}/profile`               | Via user menu    |
| Communication Preferences | `/{locale}/profile/communication` | Via profile page |

## Appendix B: API Endpoint Reference

| Endpoint                                             | Method    | Permission                  | Description           |
| ---------------------------------------------------- | --------- | --------------------------- | --------------------- |
| `/api/v1/dashboard/parent`                           | GET       | `parent.view_own_students`  | Parent dashboard data |
| `/api/v1/announcements/my`                           | GET       | `parent.view_announcements` | Parent announcements  |
| `/api/v1/inquiries/my`                               | GET       | `parent.submit_inquiry`     | List own inquiries    |
| `/api/v1/inquiries`                                  | POST      | `parent.submit_inquiry`     | Create inquiry        |
| `/api/v1/inquiries/{id}/parent`                      | GET       | `parent.submit_inquiry`     | View inquiry detail   |
| `/api/v1/inquiries/{id}/messages`                    | POST      | `parent.submit_inquiry`     | Send reply            |
| `/api/v1/applications/mine`                          | GET       | Auth only                   | List own applications |
| `/api/v1/academic-periods`                           | GET       | Auth only                   | List academic periods |
| `/api/v1/gradebook/student-grades`                   | GET       | `parent.view_grades`        | Student grades        |
| `/api/v1/report-cards/{id}/pdf`                      | GET       | `parent.view_grades`        | Report card PDF       |
| `/api/v1/transcripts/{id}/pdf`                       | GET       | `parent.view_transcripts`   | Transcript PDF        |
| `/api/v1/attendance/parent/students/{id}/attendance` | GET       | `parent.view_attendance`    | Child attendance      |
| `/api/v1/me/preferences`                             | GET/PATCH | Auth only                   | Profile/preferences   |
| `/api/v1/auth/sessions`                              | GET       | Auth only                   | List sessions         |
| `/api/v1/auth/sessions/{id}`                         | DELETE    | Auth only                   | Revoke session        |
| `/api/v1/auth/mfa/setup`                             | POST      | Auth only                   | Start MFA setup       |
| `/api/v1/auth/mfa/verify`                            | POST      | Auth only                   | Verify MFA code       |

## Appendix C: Known Issues & Missing Features

| Issue                         | Severity | Description                                                                           |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------- |
| GradesTab not integrated      | High     | The grades tab component exists but is not imported/rendered on the parent dashboard  |
| Announcements not in sidebar  | Medium   | Parents have no sidebar link to announcements page                                    |
| Inquiries not in sidebar      | Medium   | Parents have no sidebar link to inquiries page                                        |
| Applications not in sidebar   | Medium   | Parents have no sidebar link to applications page                                     |
| Dashboard announcements empty | Medium   | Dashboard always shows empty state for announcements even when announcements exist    |
| Invoices placeholder only     | Low      | Outstanding invoices section is a static empty state                                  |
| Attendance no UI              | Medium   | `parent.view_attendance` permission exists with API endpoint but no frontend page     |
| Hardcoded English strings     | Low      | Several strings in inquiry pages are not translated (e.g., "You", "No messages yet.") |
| Student cards not clickable   | Medium   | Parent cannot drill into student details from dashboard                               |
