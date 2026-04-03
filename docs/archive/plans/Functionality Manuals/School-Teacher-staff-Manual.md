# School Teacher/Staff — Complete Functionality Manual

**School**: Midaad Ul Qalam
**Role**: Teacher (staff tier)
**Date**: 2026-03-21
**System**: School Operating System (SDB)

---

## Table of Contents

1. [Role Overview](#1-role-overview)
2. [Authentication & Login](#2-authentication--login)
3. [Navigation & Layout](#3-navigation--layout)
4. [Teacher Dashboard](#4-teacher-dashboard)
5. [Students (Read-Only)](#5-students-read-only)
6. [Classes (Read-Only)](#6-classes-read-only)
7. [Attendance](#7-attendance)
8. [Gradebook](#8-gradebook)
9. [Timetables](#9-timetables)
10. [Scheduling Preferences](#10-scheduling-preferences)
11. [Preference Satisfaction](#11-preference-satisfaction)
12. [Reports Hub](#12-reports-hub)
13. [Profile & Settings](#13-profile--settings)
14. [Global Search](#14-global-search)
15. [Notifications](#15-notifications)
16. [Access Restrictions (What Teachers Cannot Do)](#16-access-restrictions)
17. [i18n & RTL Support](#17-i18n--rtl-support)

---

## 1. Role Overview

The **Teacher** role is a system-defined, immutable role at the **staff tier**. It provides focused access to classroom operations: attendance marking, gradebook management, timetable viewing, and scheduling preferences.

### Permissions Granted (6 total)

| Permission Key                    | Description                                            |
| --------------------------------- | ------------------------------------------------------ |
| `attendance.take`                 | Mark and submit attendance for assigned classes        |
| `gradebook.enter_grades`          | Create assessments and enter grades                    |
| `gradebook.view`                  | View gradebook data, assessments, period grades        |
| `schedule.view_own`               | View own timetable/schedule                            |
| `schedule.manage_own_preferences` | Set scheduling preferences (subject, class, time slot) |
| `schedule.view_own_satisfaction`  | View preference satisfaction scores                    |

### Data Scope

- All data access is **tenant-scoped** (school-specific via RLS)
- Attendance and gradebook actions are scoped to **assigned classes only**
- Schedule viewing is scoped to **own timetable only**

---

## 2. Authentication & Login

### How to Log In

1. Navigate to the application URL
2. Enter email: `teacher@mdad.test`
3. Enter password: `Password123!`
4. Click **Sign In**
5. If MFA is enabled, enter the 6-digit code from your authenticator app

### Session Management

- JWT-based authentication (token in memory, refresh via httpOnly cookie)
- Sessions can be viewed and revoked from the Profile page
- Automatic token refresh on expiry

### Switching Tenants

- If the user has memberships in multiple schools, use **Switch Tenant** from the auth menu
- API: `POST /api/v1/auth/switch-tenant`

---

## 3. Navigation & Layout

### Sidebar Menu (What Teachers See)

Teachers see a **filtered sidebar** with only their permitted sections:

```
OVERVIEW
  Dashboard          /dashboard

PEOPLE
  Students           /students

ACADEMICS
  Classes            /classes
  Attendance         /attendance
  Gradebook          /gradebook

SCHEDULING
  Timetables         /timetables

REPORTS
  Reports            /reports
```

**Hidden from teachers**: Staff, Households, Promotion, Report Cards, Rooms, Schedules, Auto Scheduling, Period Grid, Curriculum, Competencies, Scheduling Runs, Admissions, Finance, Payroll, Communications, Approvals, Website, Settings, Closures.

### Top Bar

- **Page title** — dynamically set from current route
- **Search bar** — global search (Cmd/Ctrl + K)
- **Notification bell** — notification panel
- **User menu** — profile, theme, locale, logout
- **Hamburger menu** (mobile) — opens mobile sidebar drawer

### Mobile Sidebar

- Triggered by hamburger icon on screens < 1024px
- Slide-in drawer with full navigation
- User menu at bottom

---

## 4. Teacher Dashboard

**Route**: `/dashboard/teacher`
**API**: `GET /api/v1/dashboard/teacher` (requires `attendance.take`)

### What It Shows

1. **Greeting Header**
   - Personalised greeting (e.g. "Good morning, Ahmed")
   - Summary line with pending counts

2. **Stat Cards** (3 cards in a row)
   - **Today's Lessons** — count of scheduled classes for today
   - **Attendance Sessions** — count of today's attendance sessions
   - **Pending Submissions** — count of unsubmitted attendance sessions

3. **Today's Schedule Section**
   - List of timetable entries for the current day
   - Each entry shows: time range (start – end), class name, room name
   - Empty state if no lessons today

4. **Attendance Sessions Section**
   - List of today's attendance sessions
   - Each entry shows: class name, status badge (Pending/Submitted), marked count / enrolled count
   - **Clickable** — clicking navigates to the mark attendance page for that session
   - Empty state if no sessions today

### How to Use

1. Log in → automatically redirected to `/dashboard`
2. The system detects the teacher role and shows the teacher dashboard
3. Review today's schedule at a glance
4. Click any pending attendance session to begin marking

---

## 5. Students (Read-Only)

**Route**: `/students`
**API**: `GET /api/v1/students` (requires `students.view`)

### Student List Page

**View capabilities**:

- Paginated table of all students in the school
- Columns: Name, Student #, Year Group, Status, Household
- **Search** by student name or number
- **Filters**: Status (active/inactive/archived), Year Group, Allergy flag
- **Pagination**: 20 per page, navigate with page controls

### How to Search for a Student

1. Go to **Students** in the sidebar
2. Type the student name or number in the search box
3. Results filter in real-time
4. Click a student row to view their detail page

### Student Detail Page

**Route**: `/students/[id]`
**API**: `GET /api/v1/students/:id` (requires `students.view`)

- Student name, student number, status badge
- Year group, class enrolments
- Parents/guardians linked
- Household information
- **Action dropdown** — limited to view-only operations for teachers

### Student Preview (Hover Card)

- Hovering over a student name in any table shows a floating preview card
- Shows: name, student number, status, year group, class
- Click to navigate to full detail

### Allergy Report

**Route**: `/students/allergy-report`
**API**: `GET /api/v1/students/allergy-report` (requires `students.view`)

- Filterable by year group and class
- Shows students with recorded allergies

### What Teachers CANNOT Do with Students

- Cannot create new students
- Cannot edit student profiles
- Cannot change student status
- Cannot manage enrolments
- Cannot export student data packs

---

## 6. Classes (Read-Only)

**Route**: `/classes`
**API**: `GET /api/v1/classes` (requires `students.view`)

### Class List Page

- Paginated table of all classes
- Columns: Class name, Academic Year, Year Group, Status
- **Search** by class name
- **Filters**: Academic Year, Year Group, Status
- **Pagination**: 20 per page

### How to View a Class

1. Go to **Classes** in the sidebar
2. Browse or search for the class
3. Click a class row to view details

### Class Detail Page

**Route**: `/classes/[id]`
**API**: `GET /api/v1/classes/:id` (requires `students.view`)

- Class name, year group, academic year, status
- Enrolled students list
- Assigned staff (teachers, assistants)
- Class preview card on hover

### What Teachers CANNOT Do with Classes

- Cannot create new classes
- Cannot edit class details
- Cannot change class status
- Cannot assign/remove staff
- Cannot enrol/remove students

---

## 7. Attendance

### 7.1 Attendance Sessions List

**Route**: `/attendance`
**API**: `GET /api/v1/attendance-sessions` (requires `attendance.take` for creation, list shows all)

**View**:

- Paginated table of attendance sessions
- Columns: Session Date, Class, Status (open/submitted/locked/cancelled), Marked Count
- **Filters**:
  - Date range (From / To date pickers)
  - Class dropdown
  - Status dropdown (All / Open / Submitted / Locked / Cancelled)
- **Actions column**: "Mark Attendance" button appears for sessions with status `open`
- **Create Session** button in page header

### 7.2 Create an Attendance Session

**How to create**:

1. Go to **Attendance** in the sidebar
2. Click the **+ Create Session** button (top right)
3. The system creates a new session and redirects to the marking page

**API**: `POST /api/v1/attendance-sessions` (requires `attendance.take`)

### 7.3 Mark Attendance

**Route**: `/attendance/mark/[sessionId]`
**API**: `GET /api/v1/attendance-sessions/:id` (get session + student records)
**API**: `PUT /api/v1/attendance-sessions/:sessionId/records` (save records)
**API**: `PATCH /api/v1/attendance-sessions/:sessionId/submit` (submit session)

**Page layout**:

- **Header**: "Mark Attendance" title, class name, date, session status badge
- **Mark All Present** button — sets all students to present in one click
- **Back button** — returns to attendance list

**Student list** (one card per student):

- Student avatar (first letter), name
- **Radio group** with 5 statuses:
  - Present
  - Absent (Unexcused)
  - Absent (Excused)
  - Late
  - Left Early
- **Reason textarea** — appears when status is not "present" (for providing absence reasons)

**Action buttons** (sticky bottom bar):

- **Save** — saves current selections without submitting (can return later)
- **Submit** — saves and submits the session (locks it from further editing by the teacher)

### How to Take Attendance Step by Step

1. Navigate to **Attendance** → click **Create Session** (or click a pending session)
2. You see the list of enrolled students
3. Click **Mark All Present** to default everyone to present
4. For absent/late students, click the appropriate radio button
5. Add a reason for any non-present status
6. Click **Save** to save progress (keep session open)
7. Click **Submit** when all students are marked (session becomes submitted)

### Session Status Workflow

```
open → submitted → locked → (admin can cancel)
```

- Teachers can only work with **open** sessions
- Once **submitted**, the session is read-only for teachers
- Only admins can **lock** or **cancel** sessions

### What Teachers CANNOT Do with Attendance

- Cannot amend submitted or locked attendance records
- Cannot cancel sessions
- Cannot lock sessions
- Cannot override school closure dates
- Cannot view the attendance exceptions page (requires `attendance.manage`)

---

## 8. Gradebook

### 8.1 Gradebook Home (Class Selector)

**Route**: `/gradebook`
**API**: `GET /api/v1/gradebook/assessments` (requires `gradebook.view`)

**View**:

- **Filter bar**: Academic Year dropdown, Academic Period dropdown
- **Class cards grid**: Each card shows class name, subject name, assessment count
- Click a card to enter that class's gradebook

### How to Access a Class Gradebook

1. Go to **Gradebook** in the sidebar
2. Optionally filter by Academic Year or Period
3. Click the class card you want to work with

### 8.2 Class Gradebook Page

**Route**: `/gradebook/[classId]`

Three tabs:

#### Tab 1: Assessments

**API**: `GET /api/v1/gradebook/assessments?class_id=...` (requires `gradebook.view`)

- Paginated table of assessments for this class
- Columns: Title, Status (Draft/Open/Closed/Locked), Category, Max Score, Due Date, Actions
- **Actions per row**:
  - **Grade Entry** button — navigates to the grade entry page
  - **Status** button — opens a dialog to change assessment status
- **+ New Assessment** button in header — navigates to the create assessment form

**Status Change Dialog**:

- Shows current status
- Dropdown to select new status: Draft, Open, Closed, Locked
- Confirm / Cancel buttons

#### Tab 2: Period Grades

**API**: `GET /api/v1/gradebook/period-grades?class_id=...` (requires `gradebook.view`)

- Paginated table of student period grades
- Columns: Student, Computed (score + letter), Override (score + letter), Final (score + letter), Actions
- **Compute Grades** button in header — triggers period grade computation
- **Override** button per row — opens dialog to set override score/letter

**Override Dialog** (teachers may see this but the API requires `gradebook.override_final_grade` which teachers DON'T have):

- Student name
- Override Score (number input)
- Override Letter Grade (text input)
- Save / Cancel buttons

#### Tab 3: Grade Config

**API**: `GET /api/v1/gradebook/grade-config?class_id=...` (requires `gradebook.view`)
**API**: `PUT /api/v1/gradebook/grade-config` (requires `gradebook.manage` — teachers DON'T have this)

- Grading Scale selector
- Category Weights editor (category name + percentage input per category)
- Weights sum warning if total != 100%
- Save button

**Note**: Teachers can VIEW the grade config but should NOT be able to save changes (requires `gradebook.manage`).

### 8.3 Create Assessment

**Route**: `/gradebook/[classId]/assessments/new`
**API**: `POST /api/v1/gradebook/assessments` (requires `gradebook.enter_grades`)

**Form fields**:

- **Title** (required) — e.g. "Midterm Exam"
- **Subject** (required) — dropdown of subjects
- **Academic Period** (required) — dropdown of periods
- **Category** (required) — dropdown of assessment categories (Formative, Summative, etc.)
- **Max Score** (required, default 100) — number input
- **Due Date** (optional) — date picker
- **Grading Deadline** (optional) — date picker
- **Cancel / Create** buttons

### How to Create an Assessment

1. Go to **Gradebook** → select a class → ensure you're on the **Assessments** tab
2. Click **+ New Assessment**
3. Fill in: Title, Subject, Period, Category, Max Score
4. Optionally set Due Date and Grading Deadline
5. Click **Create**
6. Redirected back to the class gradebook

### 8.4 Grade Entry

**Route**: `/gradebook/[classId]/assessments/[assessmentId]/grades`
**API**: `GET /api/v1/gradebook/assessments/:assessmentId/grades` (requires `gradebook.view`)
**API**: `PUT /api/v1/gradebook/assessments/:assessmentId/grades` (requires `gradebook.enter_grades`)

**Page layout**:

- **Back button** — returns to class gradebook
- **Assessment header**: Title, status badge, category, max score
- **Locked warning** — shown if assessment is closed/locked
- **Progress bar**: "X of Y students graded"

**Grade entry table**:

- Columns: Student, Score, Missing, Comment
- **Score input** — number field, capped at max score, Tab to next student
- **Missing checkbox** — marks student as "did not submit" (clears score)
- **Comment textarea** — optional per-student comment

**Save button** (bottom right, hidden when locked)

### How to Enter Grades

1. Go to **Gradebook** → select a class → **Assessments** tab
2. Click **Grade Entry** on the assessment row
3. For each student:
   - Enter the score (0 to max score)
   - Check "Missing" if the student didn't submit
   - Optionally add a comment
4. Press **Tab** to move between score fields quickly
5. Click **Save** when done

### Gradebook Import

**Route**: `/gradebook/import`
**API**: `POST /api/v1/gradebook/import/validate` and `/import/process` (requires `gradebook.manage`)

- CSV file upload for bulk grade import
- Validate → Review → Confirm workflow
- **Note**: Teachers need `gradebook.manage` for this, which they don't have

### What Teachers CANNOT Do in Gradebook

- Cannot override final/period grades (requires `gradebook.override_final_grade`)
- Cannot manage grade configuration (requires `gradebook.manage`)
- Cannot delete assessments (requires `gradebook.manage`)
- Cannot compute period grades (requires `gradebook.manage`)
- Cannot publish report cards (requires `gradebook.publish_report_cards`)
- Cannot import grades in bulk (requires `gradebook.manage`)

---

## 9. Timetables

**Route**: `/timetables`
**API**: `GET /api/v1/timetables/teacher/:staffProfileId` (public, no guard)

### Timetable Page

**View tabs**: Teacher | Room | Student

**Filter bar**:

- Academic Year dropdown (All Years + specific years)

**Entity selector**:

- Dropdown to select which teacher/room/student to view

**Timetable grid**:

- Visual grid showing periods x weekdays
- Each cell shows: class name, room name, teacher name, subject name
- Empty cells where no class is scheduled

### How to View Your Timetable

1. Go to **Timetables** in the sidebar
2. Select the **Teacher** tab (default)
3. Select your name from the dropdown
4. The grid displays your weekly schedule
5. Optionally filter by Academic Year

### How to View a Student's Timetable

1. Go to **Timetables**
2. Select the **Student** tab
3. Select the student from the dropdown
4. View their weekly timetable

### How to View a Room's Timetable

1. Go to **Timetables**
2. Select the **Room** tab
3. Select the room from the dropdown
4. View the room's usage schedule

---

## 10. Scheduling Preferences

**Route**: `/scheduling/my-preferences`
**API**: `GET /api/v1/staff-preferences/own` (requires `schedule.manage_own_preferences`)
**API**: `POST /api/v1/staff-preferences/own` (create)
**API**: `PATCH /api/v1/staff-preferences/own/:id` (update)
**API**: `DELETE /api/v1/staff-preferences/own/:id` (delete)

**Note**: This page is NOT in the sidebar — access via direct URL or from the scheduling sub-navigation if within the scheduling layout.

### Page Layout

- **Page header**: "My Preferences" with Academic Year selector
- **Info banner**: "These preferences are best-effort. The scheduler will try to honour them..."
- **Three tabs**: Subject | Class | Time Slot (with count badges)

### Per-Tab Interface

**Add row** (dashed border):

- Entity dropdown (select subject/class/time slot)
- Sentiment dropdown (Prefer / Avoid)
- **Add** button

**Preference list** (per tab):

- Entity name
- Sentiment badge (clickable to toggle prefer/avoid)
- Priority dropdown (Low / Medium / High)
- Delete button (trash icon)

### How to Set Scheduling Preferences

1. Navigate to `/scheduling/my-preferences`
2. Select the Academic Year
3. Choose a tab (Subject, Class, or Time Slot)
4. Select an entity from the dropdown
5. Choose Prefer or Avoid
6. Click **Add**
7. Adjust priority (Low/Medium/High) using the dropdown
8. Click the sentiment badge to toggle between Prefer and Avoid
9. Click the trash icon to remove a preference

### How Preferences Work

- **Prefer** = you'd like to be assigned to this subject/class/time
- **Avoid** = you'd prefer not to be assigned to this
- **Priority** = how important this preference is (High > Medium > Low)
- The auto-scheduler considers these preferences but cannot guarantee satisfaction when they conflict with constraints

---

## 11. Preference Satisfaction

**Route**: `/scheduling/my-satisfaction`
**API**: `GET /api/v1/scheduling-dashboard/my-satisfaction` (requires `schedule.view_own_satisfaction`)

**Note**: This page is NOT in the sidebar — access via direct URL.

### Page Layout

1. **KPI Cards** (3 cards):
   - Satisfaction Percentage (e.g. 88%) — brand-coloured
   - Total Preferences — total number of preferences set
   - Satisfied — count of preferences honoured

2. **Progress Bar**: Visual bar showing X of Y preferences satisfied

3. **Run timestamp**: "Based on run: [date/time]"

4. **Preference Details** (expandable list):
   - Each preference shows: target label, preference type, satisfied indicator (green check vs grey)
   - Direction badge (Prefer/Avoid)
   - Priority badge (Low/Medium/High)
   - Green background for satisfied preferences

### How to Check Your Satisfaction Score

1. Navigate to `/scheduling/my-satisfaction`
2. Review the overall percentage
3. Scroll down to see which preferences were satisfied and which weren't
4. The data is based on the most recent auto-scheduler run

---

## 12. Reports Hub

**Route**: `/reports`
**API**: Various report endpoints

### Reports Page

- Gallery of report cards organised by category
- Each card shows: icon, title, description, link
- Available reports depend on permissions

### Reports Available to Teachers

Based on permissions, teachers may see limited reports. Most reports require `analytics.view` or `finance.view` which teachers don't have.

Reports requiring `analytics.view` (NOT available to teachers):

- Promotion Rollover
- Notification Delivery

Reports requiring `finance.view` (NOT available to teachers):

- Fee Generation
- Write-offs

Reports requiring `students.view` (available to teachers):

- Student Export (individual)

Reports requiring `schedule.manage` (NOT available to teachers):

- Workload Report

---

## 13. Profile & Settings

**Route**: `/profile`

### Personal Information Section

- **First Name** (editable text input)
- **Last Name** (editable text input)
- **Email** (read-only, greyed out)
- **Preferred Locale** (dropdown: English / Arabic)
- **Theme** (three buttons: Light / Dark / System)
- **Save Profile** button

### How to Update Your Profile

1. Click your avatar/name in the top bar → select **Profile**
2. Edit First Name and/or Last Name
3. Change preferred locale if desired
4. Click **Save Profile**
5. Success message appears

### How to Change Theme

1. Go to Profile
2. In the Theme section, click Light, Dark, or System
3. The theme changes immediately

### How to Change Language

1. Go to Profile
2. Change "Preferred Locale" to Arabic or English
3. Click Save Profile
4. The UI language and direction (LTR/RTL) change on next page load

### MFA (Multi-Factor Authentication) Section

- Shows current MFA status: Enabled (green badge) or Not Enabled
- **Enable MFA** button (if not enabled):
  1. Click **Enable MFA**
  2. QR code appears — scan with authenticator app (Google Authenticator, Authy, etc.)
  3. Enter the 6-digit code from the app
  4. Click **Verify and Enable**
  5. MFA is now active on your account

### Active Sessions Section

- List of all active login sessions
- Each session shows: device/user agent, IP address, last active timestamp
- **Current session** has a badge label
- **Revoke Session** button on non-current sessions — logs out that session

### Communication Preferences

- Link to `/profile/communication`
- Manage notification delivery preferences (email, SMS, in-app)

---

## 14. Global Search

**Trigger**: Click the search bar in the top bar, or press **Cmd+K** (Mac) / **Ctrl+K** (Windows)

**API**: `GET /api/v1/search?q=...`

### How to Search

1. Press **Cmd+K** or click the search bar
2. Type a search query (student name, class name, etc.)
3. Results appear in a command palette dropdown
4. Click a result to navigate to that record
5. Press **Escape** to close

### Search Scope for Teachers

- Students (name, student number)
- Classes (class name)
- Results are filtered by the teacher's data access scope

---

## 15. Notifications

**Location**: Bell icon in the top bar

**API**: `GET /api/v1/notifications` and `GET /api/v1/notifications/unread-count`

### How to View Notifications

1. Click the bell icon in the top bar
2. The notification panel slides open
3. View unread and recent notifications
4. Click a notification to navigate to the relevant record
5. Click **Mark as Read** on individual notifications
6. Click **Mark All as Read** to clear all

### Types of Notifications Teachers May Receive

- Attendance session reminders
- Grading deadline reminders
- Schedule changes
- System announcements

---

## 16. Access Restrictions (What Teachers Cannot Do)

### Pages Blocked by Sidebar Filtering

These pages are hidden from the teacher's sidebar navigation:

| Page             | Required Role                                |
| ---------------- | -------------------------------------------- |
| Staff Management | school_owner, school_admin                   |
| Households       | school_owner, school_admin                   |
| Promotion        | school_owner, school_admin                   |
| Report Cards     | school_owner, school_admin                   |
| Rooms            | school_owner, school_admin                   |
| Schedules        | school_owner, school_admin                   |
| Auto Scheduling  | school_owner, school_admin                   |
| Period Grid      | school_owner, school_admin                   |
| Curriculum       | school_owner, school_admin                   |
| Competencies     | school_owner, school_admin                   |
| Scheduling Runs  | school_owner, school_admin                   |
| Admissions       | school_owner, school_admin, admissions_staff |
| Finance          | school_owner, school_admin, finance_staff    |
| Payroll          | school_owner, school_admin                   |
| Communications   | school_owner, school_admin                   |
| Approvals        | school_owner, school_admin                   |
| Website          | school_owner, school_admin                   |
| Settings         | school_owner, school_admin                   |
| Closures         | school_owner, school_admin                   |

### API Endpoints Blocked by Permission Guards

Teachers will receive **403 Forbidden** when attempting to call endpoints requiring:

- `users.manage`, `users.invite`, `users.view` (user management)
- `roles.manage` (role management)
- `settings.manage`, `branding.manage`, `stripe.manage` (settings)
- `students.manage` (student CRUD)
- `attendance.manage`, `attendance.amend_historical` (admin attendance)
- `gradebook.manage`, `gradebook.override_final_grade`, `gradebook.publish_report_cards` (admin gradebook)
- `schedule.manage`, `schedule.run_auto`, `schedule.apply_auto` (admin scheduling)
- `finance.*`, `payroll.*`, `admissions.*`, `communications.*`, `approvals.*`, `compliance.*`, `website.*`, `analytics.*`

### Direct URL Access

If a teacher navigates directly to a blocked page URL (e.g. `/settings`), they should either:

- See a 403/permission denied page
- Be redirected to their dashboard
- See an empty state with no data (API returns 403)

---

## 17. i18n & RTL Support

### Language Support

- **English** (LTR) — default
- **Arabic** (RTL) — full right-to-left layout

### How RTL Works

- All layout flips: sidebar moves to right, text aligns right
- Logical CSS utilities used: `ms-` (margin-start), `me-` (margin-end), `ps-` (padding-start), `pe-` (padding-end)
- Arrows rotate in RTL (back button, chevrons)
- LTR enforced on: email addresses, phone numbers, numeric inputs, student IDs, dates

### Switching Language

1. Go to **Profile** → change **Preferred Locale** to Arabic
2. Click **Save Profile**
3. The entire UI switches to Arabic with RTL layout

### What Should Display Correctly in Arabic

- All navigation labels
- All page titles and descriptions
- All form labels and buttons
- All table headers
- All status badges
- All empty states
- All error messages
- Dashboard greeting and stats
- Attendance status labels
- Gradebook column headers and status badges

---

## Appendix A: Complete API Endpoint Access Matrix

### Accessible Endpoints (Teacher)

| Endpoint                                           | Method | Permission                         |
| -------------------------------------------------- | ------ | ---------------------------------- |
| `/api/v1/auth/login`                               | POST   | Public                             |
| `/api/v1/auth/refresh`                             | POST   | Public                             |
| `/api/v1/auth/logout`                              | POST   | AuthGuard                          |
| `/api/v1/auth/me`                                  | GET    | AuthGuard                          |
| `/api/v1/auth/sessions`                            | GET    | AuthGuard                          |
| `/api/v1/auth/sessions/:id`                        | DELETE | AuthGuard                          |
| `/api/v1/auth/mfa/setup`                           | POST   | AuthGuard                          |
| `/api/v1/auth/mfa/verify`                          | POST   | AuthGuard                          |
| `/api/v1/dashboard/teacher`                        | GET    | `attendance.take`                  |
| `/api/v1/attendance-sessions`                      | GET    | `attendance.take`                  |
| `/api/v1/attendance-sessions`                      | POST   | `attendance.take`                  |
| `/api/v1/attendance-sessions/:id`                  | GET    | `attendance.take`                  |
| `/api/v1/attendance-sessions/:id/records`          | PUT    | `attendance.take`                  |
| `/api/v1/attendance-sessions/:id/submit`           | PATCH  | `attendance.take`                  |
| `/api/v1/gradebook/assessments`                    | GET    | `gradebook.view`                   |
| `/api/v1/gradebook/assessments/:id`                | GET    | `gradebook.view`                   |
| `/api/v1/gradebook/assessments`                    | POST   | `gradebook.enter_grades`           |
| `/api/v1/gradebook/assessments/:id`                | PATCH  | `gradebook.enter_grades`           |
| `/api/v1/gradebook/assessments/:id/status`         | PATCH  | `gradebook.enter_grades`           |
| `/api/v1/gradebook/assessments/:id/grades`         | GET    | `gradebook.view`                   |
| `/api/v1/gradebook/assessments/:id/grades`         | PUT    | `gradebook.enter_grades`           |
| `/api/v1/gradebook/period-grades`                  | GET    | `gradebook.view`                   |
| `/api/v1/gradebook/grading-scales`                 | GET    | `gradebook.view`                   |
| `/api/v1/gradebook/assessment-categories`          | GET    | `gradebook.view`                   |
| `/api/v1/gradebook/classes/:classId/grade-configs` | GET    | `gradebook.view`                   |
| `/api/v1/staff-preferences/own`                    | GET    | `schedule.manage_own_preferences`  |
| `/api/v1/staff-preferences/own`                    | POST   | `schedule.manage_own_preferences`  |
| `/api/v1/staff-preferences/own/:id`                | PATCH  | `schedule.manage_own_preferences`  |
| `/api/v1/staff-preferences/own/:id`                | DELETE | `schedule.manage_own_preferences`  |
| `/api/v1/scheduling-dashboard/my-satisfaction`     | GET    | `schedule.view_own_satisfaction`   |
| `/api/v1/timetables/teacher/:staffProfileId`       | GET    | Public                             |
| `/api/v1/me/preferences`                           | GET    | AuthGuard                          |
| `/api/v1/me/preferences`                           | PATCH  | AuthGuard                          |
| `/api/v1/notifications`                            | GET    | AuthGuard                          |
| `/api/v1/notifications/unread-count`               | GET    | AuthGuard                          |
| `/api/v1/notifications/:id/read`                   | PATCH  | AuthGuard                          |
| `/api/v1/notifications/mark-all-read`              | POST   | AuthGuard                          |
| `/api/v1/search`                                   | GET    | Public                             |
| `/api/v1/settings`                                 | GET    | No permission                      |
| `/api/v1/branding`                                 | GET    | No permission                      |
| `/api/v1/students`                                 | GET    | `students.view`\*                  |
| `/api/v1/students/:id`                             | GET    | `students.view`\*                  |
| `/api/v1/classes`                                  | GET    | `students.view`\*                  |
| `/api/v1/classes/:id`                              | GET    | `students.view`\*                  |
| `/api/v1/academic-years`                           | GET    | `students.view`\*                  |
| `/api/v1/academic-periods`                         | GET    | `students.view`\*                  |
| `/api/v1/subjects`                                 | GET    | `students.view`\*                  |
| `/api/v1/period-grid`                              | GET    | `schedule.configure_period_grid`\* |

\*Note: Teachers do NOT have `students.view` or `schedule.configure_period_grid` — these are listed here because the frontend calls them. If teachers lack these permissions, the API will return 403 and the frontend will show empty states or errors. This is a potential issue to test.

### Blocked Endpoints (Teacher gets 403)

All endpoints requiring permissions not in the teacher's set of 6 will return 403. Key ones:

- All `students.manage` endpoints (POST/PATCH/DELETE students)
- All `finance.*` endpoints
- All `payroll.*` endpoints
- All `admissions.*` endpoints
- All `communications.*` endpoints
- All `schedule.manage` endpoints
- All `settings.manage` endpoints
- All `users.manage` endpoints
- All `roles.manage` endpoints
- All `compliance.*` endpoints

---

## Appendix B: Test Credentials

| Field       | Value                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| School      | Midaad Ul Qalam                                                                                                                             |
| Email       | teacher@mdad.test                                                                                                                           |
| Password    | Password123!                                                                                                                                |
| Role        | Teacher (staff tier)                                                                                                                        |
| Permissions | attendance.take, gradebook.enter_grades, gradebook.view, schedule.view_own, schedule.manage_own_preferences, schedule.view_own_satisfaction |
