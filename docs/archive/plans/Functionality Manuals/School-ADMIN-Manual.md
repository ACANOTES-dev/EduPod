# School Admin (school_admin) — Complete Functionality Manual

**Application:** School Operating System (EduPod)
**Role:** School Admin (`school_admin`)
**Test Account:** `admin@mdad.test` (Maryam Al-Sayed) — Midaad Ul Qalam
**Password:** `Password123!`
**Date:** 2026-03-21

---

## Table of Contents

1. [Login & Authentication](#1-login--authentication)
2. [Dashboard](#2-dashboard)
3. [Students](#3-students)
4. [Staff](#4-staff)
5. [Households](#5-households)
6. [Classes](#6-classes)
7. [Promotion](#7-promotion)
8. [Attendance](#8-attendance)
9. [Gradebook](#9-gradebook)
10. [Report Cards](#10-report-cards)
11. [Rooms](#11-rooms)
12. [Schedules](#12-schedules)
13. [Timetables](#13-timetables)
14. [Auto-Scheduling Module](#14-auto-scheduling-module)
15. [Admissions](#15-admissions)
16. [Finance (View Only)](#16-finance-view-only)
17. [Communications](#17-communications)
18. [Approvals (View Only)](#18-approvals-view-only)
19. [Reports](#19-reports)
20. [Website Management](#20-website-management)
21. [Settings](#21-settings)
22. [User Profile & Preferences](#22-user-profile--preferences)
23. [Global Search (Command Palette)](#23-global-search-command-palette)
24. [Notifications](#24-notifications)
25. [Locale Switching & RTL](#25-locale-switching--rtl)
26. [What School Admin CANNOT Do](#26-what-school-admin-cannot-do)

---

## Role Summary

The **School Admin** role is the second-highest role after School Owner. It has broad administrative access across all school modules, with the following key restrictions compared to School Owner:

| Feature                       |  School Admin  | School Owner |
| ----------------------------- | :------------: | :----------: |
| Payroll (all)                 |       No       |     Yes      |
| Stripe configuration          |       No       |     Yes      |
| Module enable/disable         |       No       |     Yes      |
| Domain management             |       No       |     Yes      |
| Approval workflow config      | No (view only) |     Yes      |
| Finance management            |   View only    |     Full     |
| Process payments              |       No       |     Yes      |
| Issue refunds                 |       No       |     Yes      |
| Run auto-scheduler            |       No       |     Yes      |
| Apply auto-scheduler results  |       No       |     Yes      |
| Override scheduling conflicts |       No       |     Yes      |
| Manage compliance settings    |   View only    |     Yes      |

---

## 1. Login & Authentication

### 1.1 Login

1. Navigate to the login page at `/en/login`
2. Enter email: `admin@mdad.test`
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

---

## 2. Dashboard

**Navigation:** Sidebar > Dashboard
**URL:** `/en/dashboard`

### 2.1 What You See

- **Greeting header** — personalised greeting with the user's name
- **Summary line** — brief description of the day's overview
- **4 Stat Cards:**
  - Total Students — count of all students in the school
  - Total Staff — count of all staff members
  - Active Classes — count of active classes
  - Pending Approvals — count of approval requests awaiting action
- **Households Needing Completion** — list of households with incomplete records, each clickable to navigate to the household detail page. Shows "All households are complete" if none.
- **Today's Attendance** — shows attendance sessions for today, or empty state if none
- **Recent Admissions** — 3-card grid showing:
  - Recent Submissions count
  - Pending Review count (orange)
  - Accepted count (green)

### 2.2 Actions Available

- Click any stat card (informational only, no link)
- Click a household in the "Needs Completion" list to navigate to its detail page
- Click "View All" next to Households to go to `/households`
- Click "View All" next to Attendance to go to `/attendance`
- Click "View All" next to Admissions to go to `/admissions`

---

## 3. Students

**Navigation:** Sidebar > People > Students
**URL:** `/en/students`

### 3.1 Student List

**What you see:**

- Page header: "Students" with description "Manage student records and enrolments"
- **"New Student" button** (top right) — navigates to `/students/new`
- **Search box** — search by student name
- **Filters:**
  - Status: All / Applicant / Active / Withdrawn / Graduated / Archived
  - Year Group: All / [dynamic list of year groups]
  - Allergy: All / Has Allergy / No Allergy
- **Data table** columns:
  - Name (clickable link to student detail)
  - Student # (monospace)
  - Year Group
  - Status (colour-coded badge: green=active, blue=applicant, orange=withdrawn, grey=graduated/archived)
  - Household (clickable link to household detail)
- Pagination: 20 per page

### 3.2 Create a New Student

1. Click "New Student" button
2. Fill in the form fields:
   - First Name (required)
   - Last Name (required)
   - Date of Birth
   - Gender
   - Nationality
   - Status (applicant/active)
   - Year Group (dropdown)
   - Household (dropdown or search)
   - Medical/allergy information
   - Emergency contact details
3. Click "Save" / "Create Student"

### 3.3 View Student Detail

1. Click a student name in the list
2. **URL:** `/en/students/[id]`
3. **What you see:**
   - Student header with full name, student number, status badge
   - **Tabs:** Overview, Enrolments, Attendance, Grades, Documents
   - **Overview tab:** personal info, date of birth, gender, nationality, medical/allergy info, emergency contacts, household link
   - **Enrolments tab:** list of class enrolments with class name, academic year, status
   - **Attendance tab:** attendance summary statistics, recent attendance records
   - **Grades tab:** grade summaries per class/period
   - **Documents tab:** uploaded documents if any

### 3.4 Edit a Student

1. From student detail page, click "Edit" button
2. **URL:** `/en/students/[id]/edit`
3. Modify any fields
4. Click "Save Changes"

### 3.5 Allergy Report

1. **URL:** `/en/students/allergy-report`
2. Accessible from the Reports hub or direct URL
3. Shows all students with allergy information in a filterable list

---

## 4. Staff

**Navigation:** Sidebar > People > Staff (admin-only)
**URL:** `/en/staff`

### 4.1 Staff List

- Page header: "Staff" with "New Staff" button
- **Search box** — search by name
- **Status filter:** All / Active / Inactive
- **Data table** columns:
  - Name
  - Job Title
  - Department
  - Status (green=active, grey=inactive)
  - Employment Type (full-time, part-time, contract)
- Pagination: 20 per page
- Click a row to navigate to staff detail

### 4.2 Create New Staff

1. Click "New Staff" button
2. **URL:** `/en/staff/new`
3. Fill in:
   - First Name, Last Name
   - Email address
   - Phone number
   - Job Title
   - Department
   - Employment Type (full-time, part-time, contract)
   - Employment Status (active, inactive)
   - Start Date
   - Bank details (if applicable — encrypted)
4. Click "Create"

### 4.3 View Staff Detail

1. Click staff name in the list
2. **URL:** `/en/staff/[id]`
3. Tabs: Overview, Classes, Bank Details
   - **Overview:** personal info, job title, department, employment details
   - **Classes:** assigned classes
   - **Bank Details:** masked bank account info (last 4 digits only)

### 4.4 Edit Staff

1. From staff detail, click "Edit"
2. **URL:** `/en/staff/[id]/edit`
3. Modify fields and save

---

## 5. Households

**Navigation:** Sidebar > People > Households (admin-only)
**URL:** `/en/households`

### 5.1 Household List

- Page header: "Households" with "New Household" button
- **Search box** — search by household name
- **Status filter:** All / Active / Inactive / Archived
- **Data table** columns:
  - Household Name (with "Incomplete" warning badge if needs_completion)
  - Status (colour-coded badge)
  - Students (count)
  - Billing Parent (clickable link)
- Pagination: 20 per page

### 5.2 Create New Household

1. Click "New Household" button
2. **URL:** `/en/households/new`
3. Fill in:
   - Household Name
   - Primary billing parent details
   - Additional parents/guardians
   - Link existing students
4. Click "Create"

### 5.3 View Household Detail

1. Click household name in list
2. **URL:** `/en/households/[id]`
3. Sections:
   - Household info and status
   - Parents/guardians list with contact details
   - Students in the household
   - Financial summary (linked invoices, balance)
   - Communication preferences

### 5.4 Edit Household

1. From detail page, click "Edit"
2. **URL:** `/en/households/[id]/edit`
3. Modify and save

---

## 6. Classes

**Navigation:** Sidebar > Academics > Classes
**URL:** `/en/classes`

### 6.1 Class List

- Page header: "Classes" with "New Class" button
- **Filters:**
  - Academic Year (dropdown)
  - Year Group (dropdown)
  - Status: All / Active / Inactive / Archived
- **Data table** columns:
  - Name
  - Academic Year
  - Year Group
  - Subject
  - Status (badge)
  - Students (enrolled count)
- Pagination: 20 per page
- Click a row to view class detail

### 6.2 Create New Class

1. Click "New Class" button
2. **URL:** `/en/classes/new`
3. Fill in:
   - Class Name
   - Academic Year (dropdown)
   - Year Group (dropdown)
   - Subject (dropdown, optional)
   - Status
4. Click "Create"

### 6.3 View Class Detail

1. Click class name in list
2. **URL:** `/en/classes/[id]`
3. Tabs:
   - **Overview:** class info, academic year, year group, subject, teacher assignment
   - **Students:** enrolled students list with names and student numbers
   - **Staff:** assigned teachers
   - **Schedule:** timetable entries for this class

### 6.4 Edit Class

1. From class detail, click "Edit"
2. **URL:** `/en/classes/[id]/edit`
3. Modify fields and save

---

## 7. Promotion

**Navigation:** Sidebar > Academics > Promotion (admin-only)
**URL:** `/en/promotion`

### 7.1 Student Promotion Wizard

- Multi-step wizard to promote students from one year group to the next
- Steps:
  1. Select source academic year and year group
  2. Review eligible students
  3. Set promotion rules (promote all, select individual)
  4. Confirm and execute promotion
- Students can be marked as: Promoted, Held Back, Graduated, Withdrawn

---

## 8. Attendance

**Navigation:** Sidebar > Academics > Attendance
**URL:** `/en/attendance`

### 8.1 Attendance Sessions List

- Shows all attendance sessions with:
  - Date
  - Class name
  - Status: Open / Submitted / Locked / Cancelled
  - Marked count
- **Filters:** Date range, Class, Status
- **"Create Session" button** to create a new attendance session
- **"Mark Attendance" button** appears on open sessions

### 8.2 Create Attendance Session

1. Click "Create Session"
2. Select class and date
3. Confirm creation
4. Session is created with "open" status

### 8.3 Mark Attendance

1. Click "Mark Attendance" on an open session, or navigate to `/en/attendance/mark/[sessionId]`
2. **What you see:**
   - Session info (date, class name)
   - List of students with their avatars
   - For each student, radio buttons:
     - Present
     - Absent (Unexcused)
     - Absent (Excused)
     - Late
     - Left Early
   - Reason text field (appears when status is not "Present")
3. **Actions:**
   - "Mark All Present" — sets all students to Present
   - "Save" — saves current state without submitting
   - "Submit" — finalises the session (changes status to "submitted")
4. Sessions can only be edited while in "open" status

### 8.4 Attendance Exceptions

**URL:** `/en/attendance/exceptions`

- **Pending Sessions section:** shows sessions that haven't been marked yet, with class name, teacher, date
- **Excessive Absences section:** students exceeding the absence threshold, with student name, class, absence count, threshold

---

## 9. Gradebook

**Navigation:** Sidebar > Academics > Gradebook
**URL:** `/en/gradebook`

### 9.1 Gradebook Overview

- Grid of class cards, each showing:
  - Class name (clickable)
  - Subject name
  - Assessment count badge
- **Filters:** Academic Year, Academic Period
- Click a class card to view the class gradebook

### 9.2 Class Gradebook (`/en/gradebook/[classId]`)

Three tabs:

**Assessments Tab:**

- Table: Title, Status, Category, Max Score, Due Date
- Status: Draft / Open / Closed / Locked
- Actions per assessment:
  - "Grade Entry" button — navigates to grade entry page
  - Status change via dialog
- "+ New Assessment" button to create assessment

**Period Grades Tab:**

- Table: Student, Computed Score (with letter grade), Override Score, Final Score
- "Compute Grades" button to recalculate
- "Override" button per student to set manual grade

**Grade Config Tab:**

- Grading Scale selector
- Category Weights section with percentage inputs
- Save button

### 9.3 Create New Assessment

1. Click "+ New Assessment" in the class gradebook
2. **URL:** `/en/gradebook/[classId]/assessments/new`
3. Fill in:
   - Title
   - Category (from assessment categories)
   - Max Score
   - Due Date
4. Click "Create"

### 9.4 Enter Grades

1. Click "Grade Entry" on an assessment
2. **URL:** `/en/gradebook/[classId]/assessments/[assessmentId]/grades`
3. Table of students with score input fields
4. Enter scores for each student
5. Click "Save"

### 9.5 Bulk Import Grades

1. Navigate to `/en/gradebook/import`
2. **4-step wizard:**
   - **Step 1 — Upload:** Click "Download Template" to get CSV template, then upload filled CSV/XLSX
   - **Step 2 — Validation:** Review matched/unmatched/error rows
   - **Step 3 — Review:** Confirm the data to be imported
   - **Step 4 — Success:** See confirmation and return to gradebook

### 9.6 Override Period Grade

1. In the Period Grades tab, click "Override" on a student row
2. Enter override score and letter grade
3. Click "Save"

---

## 10. Report Cards

**Navigation:** Sidebar > Academics > Report Cards (admin-only)
**URL:** `/en/report-cards`

### 10.1 Report Cards List

- **Filters:** Academic Period, Status, Search
- **Columns:** Student, Period, Status, Locale, Published Date, Actions
- **Status badges:** Draft (orange), Published (green), Revised (grey)
- **Actions per card:**
  - Eye icon — view/preview
  - FileText icon — PDF preview
  - Publish button (if draft)
  - Revise button (if published)
- **"+ Generate" button** — opens generate dialog to batch-generate report cards

### 10.2 Generate Report Cards

1. Click "+ Generate"
2. Select academic period
3. Select classes or all
4. Click "Generate"
5. Report cards are created in "draft" status

### 10.3 View Report Card Detail

1. Click on a report card
2. **URL:** `/en/report-cards/[id]`
3. **What you see:**
   - Student name, period, status, locale
   - Teacher Comment text area
   - Principal Comment text area (editable when draft)
   - Grade Summary showing all grades
   - Revision Chain showing version history
4. **Actions:** Preview, Download PDF, Publish/Revise

### 10.4 Publish a Report Card

1. From the report card detail or list
2. Click "Publish"
3. The report card status changes from "draft" to "published"
4. It becomes visible to parents

### 10.5 Revise a Published Report Card

1. From a published report card, click "Revise"
2. A new version is created in "draft" status
3. Edit comments, then publish the revision

---

## 11. Rooms

**Navigation:** Sidebar > Scheduling > Rooms (admin-only)
**URL:** `/en/rooms`

### 11.1 Room List

- **Filters:** Room Type (classroom, lab, library, hall, gym, office, other), Active/Inactive
- **Columns:** Name, Type, Capacity, Exclusive (yes/no), Active status
- **Actions per room:** Edit (opens dialog), Delete (red, with confirmation)
- **"+ Create Room" button**

### 11.2 Create a Room

1. Click "+ Create Room"
2. Fill in: Name, Type (dropdown), Capacity (number), Exclusive (toggle), Active (toggle)
3. Click "Create"

### 11.3 Edit a Room

1. Click the Edit action on a room row
2. Modify fields in the dialog
3. Click "Save"

### 11.4 Delete a Room

1. Click the Delete action on a room row
2. Confirm deletion

---

## 12. Schedules

**Navigation:** Sidebar > Scheduling > Schedules (admin-only)
**URL:** `/en/schedules`

### 12.1 Schedules List (Master Schedule)

- **Filters:** Academic Year, Class, Teacher, Room, Weekday (Mon-Sat)
- **Columns:** Class, Teacher, Room, Weekday, Time (12-hr format), Effective Dates, Source
- **"+ Create Schedule" button**
- Pagination: 20 per page

### 12.2 Create a Schedule Entry

1. Click "+ Create Schedule"
2. Fill in: Class, Teacher, Room, Weekday, Start Time, End Time, Effective From/To
3. Click "Create"

---

## 13. Timetables

**Navigation:** Sidebar > Scheduling > Timetables
**URL:** `/en/timetables`

### 13.1 Timetable View

- **Academic Year filter** (dropdown)
- **3 Tab views:**
  - Teacher — select a teacher to view their weekly timetable
  - Room — select a room to view its weekly schedule
  - Student — select a student to view their weekly timetable
- **Weekly grid display** showing time slots with class name, room, teacher, subject
- Each entity is selected via a dropdown

---

## 14. Auto-Scheduling Module

**Navigation:** Sidebar > Scheduling > Auto-Scheduling (admin-only)
The scheduling module has a tabbed layout with the following sub-pages:

### 14.1 Scheduling Dashboard (`/en/scheduling/dashboard`)

- Overview of the scheduling module with solver status and statistics

### 14.2 Period Grid (`/en/scheduling/period-grid`)

- Configure time slots for the school week
- Define teaching periods and break periods
- Set start/end times for each period

### 14.3 Curriculum Requirements (`/en/scheduling/curriculum`)

- Define curriculum requirements per class: subject, periods per week, room constraints

### 14.4 Teacher Competencies (`/en/scheduling/competencies`)

- Map which teachers can teach which subjects
- Set proficiency levels

### 14.5 Break Groups (`/en/scheduling/break-groups`)

- Define break groups (which year groups/classes share break times)

### 14.6 Teacher Configuration (`/en/scheduling/teacher-config`)

- Configure per-teacher scheduling constraints
- Max periods per day/week, preferred rooms

### 14.7 Room Closures (`/en/scheduling/room-closures`)

- Schedule room closures for maintenance or other reasons

### 14.8 Staff Availability (`/en/scheduling/availability`)

- Configure teacher availability windows per weekday

### 14.9 Scheduling Preferences (`/en/scheduling/preferences`)

- Admin view of all teacher scheduling preferences
- Preferred/disliked time slots

### 14.10 Scheduling Requirements (`/en/scheduling/requirements`)

- Define class scheduling requirements (room type, equipment, etc.)

### 14.11 Scheduling Runs (`/en/scheduling/runs`)

- View history of auto-scheduler runs
- Each run shows: status, date, quality metrics

### 14.12 Scheduling Run Detail (`/en/scheduling/runs/[id]`)

- Full detail of a scheduling run including workload analysis
- Review button to approve/reject the generated schedule

### 14.13 Compare Runs (`/en/scheduling/runs/compare`)

- Side-by-side comparison of two scheduling runs

### 14.14 Important: School Admin CANNOT

- **Run the auto-scheduler** (requires `schedule.run_auto` permission — owner only)
- **Apply auto-scheduler results** (requires `schedule.apply_auto` permission — owner only)
- **Override scheduling conflicts** (requires `schedule.override_conflict` permission — owner only)

School Admin CAN:

- Configure period grid, requirements, availability, preferences
- Pin schedule entries
- View auto-scheduler reports and run history
- Manage break groups, teacher config, room closures, competencies

---

## 15. Admissions

**Navigation:** Sidebar > Operations > Admissions
**URL:** `/en/admissions`

### 15.1 Admissions Dashboard

- **Funnel summary cards** (5 columns): Total, Submitted, Under Review, Accepted, Rejected
- **Status filter tabs:** All / Submitted / Under Review / Accepted / Rejected / Withdrawn
- **Search box**
- **Data table** columns: Application #, Student Name, Form, Status, Submitted At
- **"Analytics" button** — navigates to admissions analytics
- **"Forms" button** — navigates to admission form management

### 15.2 View Application Detail (`/en/admissions/[id]`)

- Full application data with all submitted form fields
- Status badge, submission date, form definition
- Submitted by, reviewed by (if applicable)
- Notes and history
- **Actions:** Change status (under review, accepted, rejected), add notes

### 15.3 Convert Applicant to Student (`/en/admissions/[id]/convert`)

- After accepting an application, convert the applicant into a full student record
- Select year group, class assignment
- Create household if needed

### 15.4 Admission Forms Management (`/en/admissions/forms`)

- List of form definitions with: Name, Status, Version, Field count, Created date
- **Status tabs:** All / Draft / Published / Archived
- **Search box**
- **"+ Create Form" button**

### 15.5 Create New Admission Form (`/en/admissions/forms/new`)

1. Enter form name
2. Add fields using the dynamic form builder:
   - Click "+ Add Field"
   - Set field label, type (short_text, long_text, number, date, boolean, single_select, multi_select, phone, email, country, yes_no)
   - Set help text (optional)
   - Mark as required (checkbox)
   - For select types, add options
   - Set conditional visibility (optional)
3. Reorder fields using up/down arrows
4. Click "Save Draft" or "Publish"

### 15.6 Edit Admission Form (`/en/admissions/forms/[id]`)

- Same interface as create, pre-populated with existing fields
- Can add/remove/reorder fields

### 15.7 Admissions Analytics (`/en/admissions/analytics`)

- Dashboard with charts showing:
  - Application funnel conversion rates
  - Submissions over time
  - Status distribution

### 15.8 Applications (Parent-Submitted) (`/en/applications`)

- Alternative view of applications, may be used for parent-facing portal

---

## 16. Finance (View Only)

**Navigation:** Sidebar > Operations > Finance
**URL:** `/en/finance`

**Important:** School Admin has `finance.view` permission only. They can VIEW all financial data but CANNOT:

- Create/edit fee structures
- Create/edit discounts
- Create fee assignments
- Generate fees
- Process payments
- Issue refunds
- Manage any financial configuration

The finance module has a tabbed layout:

### 16.1 Finance Dashboard (`/en/finance`)

- **Stat cards:** Overdue Amount, Unallocated Payments, Pending Refunds, Current Month Collected
- **Overdue Ageing Bar:** 1-30d, 31-60d, 61-90d, 90+d segments with amounts
- **Invoice Pipeline:** Draft, Pending Approval, Issued, Overdue, Paid (counts and amounts)
- **Revenue Summary:** current/previous month comparison
- **Recent Payments Table:** reference, household, amount, status, date

### 16.2 Fee Structures (`/en/finance/fee-structures`)

- View list of fee structures: Name, Amount, Billing Frequency, Year Group, Status

### 16.3 Discounts (`/en/finance/discounts`)

- View list of discount rules

### 16.4 Fee Assignments (`/en/finance/fee-assignments`)

- View which fees are assigned to which households/students

### 16.5 Fee Generation (`/en/finance/fee-generation`)

- View fee generation history and status

### 16.6 Invoices (`/en/finance/invoices`)

- **Status tabs:** All / Draft / Pending / Issued / Partial / Paid / Overdue / Closed
- **Search and date range filters**
- **Columns:** Invoice #, Household, Status, Total, Balance, Due Date, Issue Date
- Click to view invoice detail

### 16.7 Invoice Detail (`/en/finance/invoices/[id]`)

- Full invoice with line items, amounts, balance
- Payment history linked to this invoice
- Status and approval information

### 16.8 Payments (`/en/finance/payments`)

- View payment records

### 16.9 Refunds (`/en/finance/refunds`)

- View refund records

### 16.10 Statements (`/en/finance/statements`)

- View household financial statements

### 16.11 Household Statement Detail (`/en/finance/statements/[householdId]`)

- Complete financial history for a specific household

---

## 17. Communications

**Navigation:** Sidebar > Operations > Communications (admin-only)
**URL:** `/en/communications`

### 17.1 Announcements List

- **Status tabs:** All / Draft / Scheduled / Published / Archived
- **Columns:** Title, Scope, Status, Published At, Author
- **Scope types:** School-wide, Year Group, Class, Household, Custom
- **"+ New Announcement" button**
- Click to view detail

### 17.2 Create New Announcement (`/en/communications/new`)

1. Enter title
2. Write content (rich text editor)
3. Select scope:
   - School-wide (all parents/staff)
   - Year Group (select year groups)
   - Class (select classes)
   - Household (select households)
   - Custom (select individual recipients)
4. Choose: Save as Draft, Schedule, or Publish immediately

### 17.3 View Announcement Detail (`/en/communications/[id]`)

- Full announcement content
- Author name, published date, status
- Delivery statistics (sent/delivered/read counts)
- **Actions:** Edit (if draft), Archive, Delete

### 17.4 Inquiries (`/en/communications/inquiries`)

- List of parent inquiries/messages
- **Columns:** Subject, Parent name, Status, Date
- Click to view inquiry detail

### 17.5 Inquiry Detail (`/en/communications/inquiries/[id]`)

- Message thread showing parent's inquiry and staff responses
- Reply text input + Send button
- Status management (open, resolved, etc.)

### 17.6 Inquiries (Alternative Route: `/en/inquiries`)

- Same inquiry management from a different navigation path
- Create new inquiry at `/en/inquiries/new`

---

## 18. Approvals (View Only)

**Navigation:** Sidebar > Operations > Approvals (admin-only)
**URL:** `/en/approvals`

**Important:** School Admin has `approvals.view` permission only. They can VIEW approval requests but CANNOT configure approval workflows (that requires `approvals.manage`).

### 18.1 What You See

- List of approval requests across all modules (finance, payroll, communications, etc.)
- Each request shows: type, requested by, date, status (pending/approved/rejected/expired)
- Filtering by type and status

---

## 19. Reports

**Navigation:** Sidebar > Reports
**URL:** `/en/reports`

### 19.1 Reports Hub

Card-based layout organized in 5 groups:

**Academic Reports:**

- Promotion Rollover — student promotion results
- Workload Report — teacher workload distribution

**Finance Reports:**

- Fee Generation — fee generation run history
- Write-Offs — written off invoices/amounts
- Household Statements — financial statements

**Operations Reports:**

- Admissions Funnel — admission pipeline metrics
- Attendance Exceptions — missing/late attendance
- Notification Delivery — communication delivery stats
- Allergy Report — students with allergies

**Payroll Reports:**

- Payroll Reports — payroll summaries (may be view-restricted for admin)

**Data Reports:**

- Student Export — export student data as CSV/XLSX

### 19.2 Individual Report Pages

Each report has its own page with filters, data tables, and/or charts:

- `/en/reports/workload` — teacher workload distribution
- `/en/reports/fee-generation` — fee generation run results
- `/en/reports/write-offs` — write-off summary
- `/en/reports/notification-delivery` — notification delivery stats
- `/en/reports/student-export` — export student data with column selection

---

## 20. Website Management

**Navigation:** Sidebar > School > Website (admin-only)
**URL:** `/en/website`

### 20.1 Website Pages List

- List of public website pages with: Title, Status, Last Updated
- **"+ New Page" button**

### 20.2 Create New Website Page (`/en/website/new`)

1. Enter page title
2. Enter page slug (URL path)
3. Write page content (rich text editor with bilingual support)
4. Set status: Draft or Published
5. Click "Create"

### 20.3 Edit Website Page (`/en/website/[id]`)

- Edit existing page content, title, slug, status

### 20.4 Contact Submissions (`/en/website/contact-submissions`)

- List of contact form submissions from the public website
- Shows: name, email, message, date

---

## 21. Settings

**Navigation:** Sidebar > School > Settings (admin-only)
**URL:** `/en/settings`

The settings page has a tabbed layout with 15 tabs:

### 21.1 Branding (`/en/settings/branding`)

- School name display
- Logo upload
- Colour scheme customisation

### 21.2 General Settings (`/en/settings/general`)

10 collapsible sections with configuration options:

1. **General:** Parent Portal Enabled, Attendance Visible to Parents, Grades Visible to Parents, Inquiry Stale Hours
2. **Attendance:** Allow Teacher Amendment, Auto Lock After Days, Pending Alert Time Hour
3. **Gradebook:** Default Missing Grade Policy, Require Grade Comment
4. **Admissions:** Require Approval for Acceptance
5. **Finance:** Require Approval for Invoice Issue, Default Payment Term Days, Allow Partial Payment
6. **Communications:** Primary Outbound Channel, Require Approval for Announcements
7. **Payroll:** Payroll Require Approval, Default Bonus Multiplier, Auto Populate Class Counts
8. **Scheduling:** Auto Scheduler Enabled, Scheduling Require Approval, Teacher Weekly Max Periods, Max Solver Duration
9. **Approvals:** Approvals Expiry Days, Approvals Reminder After Hours
10. **Compliance:** Audit Log Retention Months

Click "Save Changes" to apply.

### 21.3 Notifications (`/en/settings/notifications`)

- Configure which notification types are enabled
- Set channels (email, SMS, etc.) per notification type
- Notification types: invoice.issued, payment.received, report_card.published, attendance.exception, etc.

### 21.4 Stripe (`/en/settings/stripe`)

- **Important:** School Admin CANNOT access this — requires `stripe.manage` permission (owner only)
- If the admin navigates here, they should see an access denied or empty state

### 21.5 Users (`/en/settings/users`)

- List of users in the school tenant
- Name, email, role, status
- Actions: edit role, suspend, reactivate

### 21.6 Invitations (`/en/settings/invitations`)

- Send email invitations to new users
- View pending invitations
- Resend or revoke invitations

### 21.7 Roles (`/en/settings/roles`)

- List of roles (system and custom)
- System roles: School Owner, School Admin, Teacher, Finance Staff, Admissions Staff, Parent
- **"+ New Role" button** to create custom roles

### 21.8 Create New Role (`/en/settings/roles/new`)

1. Enter role name
2. Select permissions from the complete permission list
3. Click "Create"

### 21.9 Edit Role (`/en/settings/roles/[id]`)

- View/edit role permissions
- System roles cannot be modified

### 21.10 Academic Years (`/en/settings/academic-years`)

- List of academic years with name, start date, end date, status
- Create/edit academic years and terms

### 21.11 Year Groups (`/en/settings/year-groups`)

- List of year groups (e.g., Year 1, Year 2, etc.)
- Create/edit/reorder year groups

### 21.12 Subjects (`/en/settings/subjects`)

- List of subjects taught
- Create/edit/delete subjects

### 21.13 Grading Scales (`/en/settings/grading-scales`)

- Define grading scales (e.g., A-F, 1-10)
- Set score thresholds for each grade level

### 21.14 Assessment Categories (`/en/settings/assessment-categories`)

- Define assessment categories (e.g., Homework, Quiz, Exam, Project)

### 21.15 Audit Log (`/en/settings/audit-log`)

- View audit trail of all mutations in the system
- Filterable by user, action type, date range

### 21.16 Compliance (`/en/settings/compliance`)

- **School Admin can VIEW but CANNOT MANAGE** (has `compliance.view` only)
- View compliance settings and data retention policies
- GDPR data export/deletion requests

### 21.17 Imports (`/en/settings/imports`)

- Bulk import wizard for students, staff, and other data
- Upload CSV/XLSX, validate, review, import

---

## 22. User Profile & Preferences

**Navigation:** User Menu (avatar dropdown) > Profile
**URL:** `/en/profile`

### 22.1 Personal Information

- First Name, Last Name (editable)
- Email (read-only, shown with LTR direction)
- Preferred Locale (en/ar dropdown)
- Theme selector (Light / Dark / System)
- Click "Save Profile" to update

### 22.2 MFA (Multi-Factor Authentication)

- Status badge: Enabled / Not Enabled
- **Enable MFA:**
  1. Click "Enable MFA"
  2. Scan QR code with authenticator app (Google Authenticator, Authy, etc.)
  3. Enter the 6-digit verification code
  4. Click "Verify and Enable"
- MFA is then required on future logins

### 22.3 Active Sessions

- List of active login sessions
- Each shows: device/browser info, IP address, last active time
- "Current" badge on the current session
- "Revoke Session" button to log out other sessions

### 22.4 Communication Preferences (`/en/profile/communication`)

- Toggle notification preferences by channel (email, SMS, in-app)
- Navigate from Profile page or User Menu > Communication Preferences

---

## 23. Global Search (Command Palette)

**Trigger:** Click the search bar in the top bar, or press `Cmd+K` (Mac) / `Ctrl+K` (Windows)

### 23.1 What You Can Search

- Students by name
- Staff by name
- Households by name
- Classes by name
- Other entities

### 23.2 How to Use

1. Press `Cmd+K` or click the search bar
2. Type a search term
3. Results appear grouped by entity type
4. Click a result to navigate to its detail page

---

## 24. Notifications

**Location:** Bell icon in the top bar (next to user menu)

### 24.1 Notification Panel

- Click the bell icon to open the notification panel
- Shows recent notifications: announcements, attendance alerts, approval requests, etc.
- Each notification is clickable to navigate to the relevant page
- Mark notifications as read

---

## 25. Locale Switching & RTL

### 25.1 Switch Language

1. Click the user avatar/menu in the top right
2. Click the language option (shows "العربية" when in English, "English" when in Arabic)
3. The entire interface switches language and layout direction

### 25.2 RTL Behaviour

- When Arabic is selected, the entire layout mirrors:
  - Sidebar moves to the right
  - Text alignment flips to right-to-left
  - All directional spacing uses logical properties (start/end)
- Email addresses, phone numbers, and numeric inputs remain LTR
- Western numerals (0-9) are used in both locales

---

## 26. What School Admin CANNOT Do

This section documents features that are blocked for school_admin and should return 403 or not appear in the UI.

### 26.1 Payroll (All Features)

- Cannot view payroll dashboard
- Cannot view payroll runs
- Cannot create payroll runs
- Cannot finalise payroll runs
- Cannot view/manage compensation
- Cannot generate payslips
- Cannot view bank details
- Cannot view payroll reports
- **Sidebar:** "Payroll" menu item should be VISIBLE (it's in ADMIN_ROLES) — this is a potential issue since school_admin doesn't have payroll permissions but the nav shows it

### 26.2 Stripe Configuration

- Cannot access `/en/settings/stripe`
- Should see access denied or the page should be hidden

### 26.3 Module Management

- Cannot enable/disable tenant modules (no `modules.manage` permission)

### 26.4 Domain Management

- Cannot manage custom domains (no `domains.manage` permission)

### 26.5 Approval Workflow Configuration

- Cannot create/edit approval workflows (no `approvals.manage`)
- Can only view existing approval requests

### 26.6 Finance Management

- Cannot create/edit fee structures
- Cannot create/edit discounts
- Cannot create fee assignments
- Cannot generate fees (run fee generation)
- Cannot process payments
- Cannot record new payments
- Cannot issue refunds
- Can only VIEW financial data

### 26.7 Auto-Scheduler Operations

- Cannot run the auto-scheduler solver (no `schedule.run_auto`)
- Cannot apply auto-scheduler results to live schedule (no `schedule.apply_auto`)
- Cannot override scheduling conflicts (no `schedule.override_conflict`)

### 26.8 Compliance Management

- Cannot modify compliance settings (no `compliance.manage`)
- Can only view compliance information

### 26.9 Platform Administration

- Cannot access `/admin` platform routes
- Cannot manage tenants
- Cannot impersonate users

---

## Appendix A: Navigation Map for School Admin

### Sidebar Menu Items (Visible to school_admin)

```
Overview
  Dashboard ...................... /dashboard

People
  Students ...................... /students
  Staff ......................... /staff
  Households .................... /households

Academics
  Classes ....................... /classes
  Promotion ..................... /promotion
  Attendance .................... /attendance
  Gradebook ..................... /gradebook
  Report Cards .................. /report-cards

Scheduling
  Rooms ......................... /rooms
  Schedules ..................... /schedules
  Timetables .................... /timetables
  Auto-Scheduling ............... /scheduling/auto
  Period Grid ................... /scheduling/period-grid
  Curriculum .................... /scheduling/curriculum
  Competencies .................. /scheduling/competencies
  Scheduling Runs ............... /scheduling/runs

Operations
  Admissions .................... /admissions
  Finance ....................... /finance
  Payroll* ...................... /payroll         *[VISIBLE BUT BLOCKED]
  Communications ................ /communications
  Approvals ..................... /approvals

Reports
  Reports ....................... /reports

School
  Website ....................... /website
  Settings ...................... /settings
  Closures ...................... /settings/closures
```

### Settings Sub-Tabs

```
Branding | General | Notifications | Stripe* | Users | Invitations
Roles | Academic Years | Year Groups | Subjects | Grading Scales
Assessment Categories | Audit Log | Compliance* | Imports

* Stripe: BLOCKED (no stripe.manage)
* Compliance: VIEW ONLY (no compliance.manage)
```

### Finance Sub-Tabs

```
Dashboard | Fee Structures | Discounts | Fee Assignments | Fee Generation
Invoices | Payments | Refunds | Statements

All are VIEW ONLY for school_admin
```

### Scheduling Sub-Tabs

```
Dashboard | Period Grid | Curriculum | Competencies | Break Groups
Teacher Config | Room Closures | Availability | Preferences
Requirements | Auto-Scheduler* | Runs

* Auto-Scheduler: Cannot RUN or APPLY (can configure)
```

---

## Appendix B: Complete Permission List for School Admin

```
users.manage, users.invite, users.view, roles.manage,
settings.manage, branding.manage, notifications.manage,
approvals.view,
schedule.manage, schedule.manage_closures,
schedule.configure_period_grid, schedule.configure_requirements,
schedule.configure_availability, schedule.manage_preferences,
schedule.pin_entries, schedule.view_auto_reports,
students.manage, students.view,
attendance.manage, attendance.view, attendance.take,
gradebook.manage, gradebook.view, gradebook.enter_grades,
gradebook.override_final_grade, gradebook.publish_report_cards,
transcripts.generate,
admissions.manage, admissions.view,
finance.view,
communications.manage, communications.view, communications.send,
inquiries.view, inquiries.respond,
website.manage, analytics.view,
compliance.view
```

**Total: 35 permissions**

---

_End of School Admin Manual_
