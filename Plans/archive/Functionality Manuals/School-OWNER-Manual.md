# School Owner Functionality Manual

**Role:** School Owner (`school_owner`)
**Scope:** Full administrative control over a single school tenant
**Permissions:** 60 admin-tier permissions across all modules
**Date:** 2026-03-21

---

## Table of Contents

1. [Authentication & Session Management](#1-authentication--session-management)
2. [Dashboard](#2-dashboard)
3. [Students Management](#3-students-management)
4. [Staff Management](#4-staff-management)
5. [Households Management](#5-households-management)
6. [Classes & Enrolments](#6-classes--enrolments)
7. [Attendance](#7-attendance)
8. [Gradebook & Assessments](#8-gradebook--assessments)
9. [Report Cards & Transcripts](#9-report-cards--transcripts)
10. [Student Promotion](#10-student-promotion)
11. [Admissions](#11-admissions)
12. [Finance](#12-finance)
13. [Payroll](#13-payroll)
14. [Scheduling & Timetables](#14-scheduling--timetables)
15. [Communications & Announcements](#15-communications--announcements)
16. [Approvals](#16-approvals)
17. [Inquiries](#17-inquiries)
18. [Reports Hub](#18-reports-hub)
19. [Website Management](#19-website-management)
20. [Settings](#20-settings)
21. [User Profile](#21-user-profile)
22. [Global Features](#22-global-features)

---

## 1. Authentication & Session Management

### 1.1 Login

**Route:** `/en/login`

**How to login:**
1. Navigate to the login page
2. Enter email: `owner@mdad.test`
3. Enter password: `Password123!`
4. Click "Sign In"
5. If MFA is enabled, enter the 6-digit TOTP code on the MFA verification screen
6. If the user belongs to multiple schools, the school selection page appears - select the school

**Fields:**
- Email (text input, LTR enforced)
- Password (password input)

### 1.2 School Selection

**Route:** `/en/select-school`

After login, if the user has memberships in multiple tenants, this page lists all available schools. Click a school card to enter that tenant context.

### 1.3 Password Reset

**Route:** `/en/reset-password`

**How to reset password:**
1. Click "Forgot password?" on the login page
2. Enter your email address
3. Click "Send Reset Link"
4. Check email for the reset link
5. Click the link, enter new password twice
6. Submit to confirm

### 1.4 Session Management

**Route:** `/en/profile` (Sessions section)

**How to view/revoke sessions:**
1. Navigate to Profile (click avatar in top bar > Profile)
2. Scroll to "Active Sessions" section
3. View list of sessions (device, IP, last active time)
4. Click "Revoke" on any session to terminate it

---

## 2. Dashboard

### 2.1 Main Dashboard

**Route:** `/en/dashboard`

**What is displayed:**
- **Greeting header** with dynamic time-based greeting
- **4 Stat Cards:**
  - Total Students (count of all active students)
  - Total Staff (count of active staff members)
  - Active Classes (count of classes with active status)
  - Pending Approvals (count of approval requests awaiting action)
- **Incomplete Households** section: list of households flagged as needing completion (missing address, contacts, etc.). Each row is clickable and links to the household detail page.
- **Today's Attendance** section: shows attendance session summary for the current day, or empty state if no sessions recorded
- **Recent Admissions** summary: 3 cards showing counts of Recent Submissions, Pending Review (warning colour), and Accepted (success colour)

**Navigation from Dashboard:**
- Click "View All" on Incomplete Households > goes to `/households`
- Click any household row > goes to `/households/{id}`
- Click "View All" on Today's Attendance > goes to `/attendance`
- Click "View All" on Recent Admissions > goes to `/admissions`

---

## 3. Students Management

### 3.1 Students List

**Route:** `/en/students`

**What is displayed:**
- Page header: "Students" with description "Manage student records and enrolments"
- Data table with columns: Name (linked), Student # (monospace), Year Group, Status (badge), Household (linked)
- Pagination: 20 records per page

**Filters:**
- **Search box** (real-time) - searches student names
- **Status dropdown**: All Statuses, Applicant, Active, Withdrawn, Graduated, Archived
- **Year Group dropdown**: dynamically loaded from academic year groups
- **Allergy dropdown**: All, Has Allergy, No Allergy

**How to search for a student:**
1. Type the student's name in the search box
2. Results filter in real-time as you type
3. Optionally narrow by status, year group, or allergy flag

**How to navigate to a student:**
- Click any row in the table to open the student detail page

### 3.2 Create a New Student

**Route:** `/en/students/new`

**How to create a student:**
1. Click "+ New Student" button on the Students list page
2. Fill in the form:
   - **First Name** (required)
   - **Last Name** (required)
   - **First Name (Arabic)** (optional, RTL input)
   - **Last Name (Arabic)** (optional, RTL input)
   - **Date of Birth** (required, date picker)
   - **Gender** (required): Male, Female, Other, Prefer not to say
   - **Household** (required): select from dropdown of active households
   - **Year Group** (required): select from dropdown
   - **Student Number** (required): e.g., STU-2026-001, LTR enforced
   - **Status**: Applicant (default) or Active
   - **Medical Notes** (optional, textarea)
   - **Has Allergies** (checkbox): if checked, Allergy Details textarea becomes required
3. Click "Create Student"
4. On success, redirects to the new student's detail page

### 3.3 Student Detail

**Route:** `/en/students/{id}`

**What is displayed:**
- Student name as title, year group as subtitle
- Status badge (colour-coded by status)
- Reference: Student number
- **Metrics:** Date of Birth, Entry Date, Household (linked)

**Tabs:**

**Overview Tab:**
- Gender
- Year Group
- Household name (clickable link to household)
- Parents/Guardians list with name (linked), relationship, and "Primary" badge if applicable

**Classes & Enrolments Tab:**
- List of class enrolments showing: Class name, Subject name, Academic year, Status badge

**Medical Tab:**
- Allergy status badge (Has Allergies / No Known Allergies)
- If allergies present: coloured alert box with allergy details text
- Medical notes (if any)

**Actions:**
- **Edit button** > navigates to `/students/{id}/edit`
- **Change Status dropdown** > shows valid next statuses based on current state:
  - Applicant > Active, Withdrawn
  - Active > Withdrawn, Graduated, Archived
  - Withdrawn > Active, Archived
  - Graduated > Archived

### 3.4 Edit a Student

**Route:** `/en/students/{id}/edit`

**How to edit a student:**
1. From the student detail page, click "Edit"
2. Modify any fields (same form as create, pre-populated)
3. Click "Save Changes"
4. On success, redirects back to the student detail page

### 3.5 Allergy Report

**Route:** `/en/students/allergy-report`

**What is displayed:**
- Table of students with known allergies
- Columns: Student (linked), Year Group, Homeroom Class, Allergy Details (in danger/red text)

**Filters:**
- **Year Group dropdown**: All Year Groups + dynamic list
- **Class dropdown**: All Classes + active classes

**How to view the allergy report:**
1. Navigate to Students > Allergy Report (or `/en/students/allergy-report`)
2. Optionally filter by year group or class
3. Review students with allergies and their details

---

## 4. Staff Management

### 4.1 Staff List

**Route:** `/en/staff`

**What is displayed:**
- Data table with columns: Name, Job Title, Department, Status (badge), Employment Type

**Filters:**
- **Search box** (submit on Enter/click) - searches name/email
- **Status dropdown**: All Statuses, Active, Inactive

**How to find a staff member:**
1. Type name or email in search box and press Enter
2. Optionally filter by status
3. Click any row to open staff detail

### 4.2 Create a New Staff Member

**Route:** `/en/staff/new`

**How to create a staff profile:**
1. Click "+ New Staff" on the Staff list page
2. Fill in the form:
   - **User** (required, create only): select from dropdown of existing users (shows name + email)
   - **Staff Number** (optional, LTR)
   - **Job Title** (optional)
   - **Department** (optional)
   - **Employment Status** (required): Active, Inactive (default: Active)
   - **Employment Type** (required): Full Time, Part Time, Contract (default: Full Time)
   - **Bank Details** (optional, create only):
     - Bank Name
     - Bank Account Number (LTR)
     - Bank IBAN (LTR)
3. Click "Save"
4. Redirects to the staff list

### 4.3 Staff Detail

**Route:** `/en/staff/{id}`

**What is displayed:**
- Staff name as title, job title as subtitle
- Employment status badge
- Reference: Staff number
- **Metrics:** Department, Employment Type, Staff Number

**Tabs:**

**Overview Tab:**
- Grid showing: User name, Email (LTR), Job Title, Department, Employment Type, Staff Number (monospace, LTR)

**Classes Tab:**
- Table of class assignments: Class Name, Academic Year, Role
- Click a row to navigate to the class detail page

**Bank Details Tab:**
- Show/Hide toggle button
- Fields: Bank Name, Account Number (masked `****XXXX` until shown), IBAN (masked until shown)
- "No bank details recorded" message if none set

**Actions:**
- **Back button** > returns to previous page
- **Edit button** > navigates to `/staff/{id}/edit`

### 4.4 Edit a Staff Member

**Route:** `/en/staff/{id}/edit`

**How to edit staff:**
1. From staff detail, click "Edit"
2. Modify fields (same as create except: User is locked, no bank details section)
3. Click "Save"
4. Redirects to staff detail page

---

## 5. Households Management

### 5.1 Households List

**Route:** `/en/households`

**What is displayed:**
- Data table with columns: Household Name (with "Incomplete" badge if applicable), Status (badge), Students (count), Billing Parent (linked or "---")

**Filters:**
- **Search box** (real-time) - searches household names
- **Status dropdown**: All Statuses, Active, Inactive, Archived

### 5.2 Create a New Household

**Route:** `/en/households/new`

**How to create a household:**
1. Click "+ New Household" on the Households list page
2. Fill in the form:
   - **Household Name** (required)
   - **Address Line 1** (optional)
   - **Address Line 2** (optional)
   - **City** (optional)
   - **Country** (optional)
   - **Postal Code** (optional, LTR)
   - **Emergency Contacts** (minimum 1, maximum 3):
     - Contact Name (required)
     - Phone (required, LTR)
     - Relationship (required)
3. Click "Create Household"
4. Redirects to household detail page

### 5.3 Household Detail

**Route:** `/en/households/{id}`

**What is displayed:**
- Household name as title, status badge
- **Metrics:** Students count, Parents count, Emergency Contacts count
- Warning alert if `needs_completion = true`

**Tabs:**

**Overview Tab:**
- Address (formatted multi-line)
- Billing Parent name (linked) or "Not set"

**Students Tab (count):**
- List of students: Name (linked), Year Group, Status badge
- Colour coding: active=success, applicant=info, other=neutral

**Parents Tab (count):**
- List of parents: Name (linked), Relationship
- Badges: "Primary" if primary contact, "Billing" if billing contact
- "Set Billing" button to designate billing parent

**Emergency Contacts Tab:**
- Sorted by display order (up to 3)
- Each shows: Name, Relationship, Phone (LTR)
- Inline Edit (pencil) and Delete (trash) buttons per contact
- "Add Contact" button if fewer than 3 contacts

**Finance Tab (count):**
- "View Statement" link to `/finance/statements/{id}`
- Invoice table: Invoice #, Status (badge), Total Amount, Balance, Due Date
- Click any invoice row to view invoice detail

**Actions:**
- **Edit** > navigates to `/households/{id}/edit`
- **Merge** > opens merge dialog to combine two households
- **Split** > opens split dialog to separate students/parents into a new household

### 5.4 Edit a Household

**Route:** `/en/households/{id}/edit`

Same form as create, pre-populated with existing data.

### 5.5 Manage Emergency Contacts

**How to add an emergency contact:**
1. Go to household detail > Emergency Contacts tab
2. Click "Add Contact" (available if fewer than 3 exist)
3. Fill in: Contact Name, Phone, Relationship
4. Click Save in the dialog

**How to edit an emergency contact:**
1. Click the pencil icon next to the contact
2. Modify fields in the dialog
3. Click Save

**How to delete an emergency contact:**
1. Click the trash icon next to the contact
2. Confirm deletion

### 5.6 Set Billing Parent

**How to set the billing parent:**
1. Go to household detail > Parents tab
2. Click "Set Billing" next to the desired parent
3. The parent is now designated as the billing contact

### 5.7 Merge Households

**How to merge two households:**
1. Go to the primary household detail
2. Click "Merge" action button
3. Select the household to merge into this one
4. Confirm - all students and parents from the secondary household move to this one

### 5.8 Split a Household

**How to split a household:**
1. Go to the household detail
2. Click "Split" action button
3. Select which students and parents to move to a new household
4. Confirm - a new household is created with the selected members

---

## 6. Classes & Enrolments

### 6.1 Classes List

**Route:** `/en/classes`

**What is displayed:**
- Data table with columns: Name, Academic Year, Year Group, Subject, Status (badge), Students Count

**Filters:**
- **Academic Year dropdown**: All + specific years
- **Year Group dropdown**: All + specific groups
- **Status dropdown**: All, Active, Inactive, Archived

### 6.2 Create a New Class

**Route:** `/en/classes/new`

**How to create a class:**
1. Click "+ New Class" on the Classes list page
2. Fill in: Name, Academic Year, Year Group, Subject (optional), Homeroom Teacher (optional), Status
3. Click "Create Class"

### 6.3 Class Detail

**Route:** `/en/classes/{id}`

**What is displayed:**
- Class name as title, academic year as subtitle
- Status badge, year group as reference
- **Metrics:** Student count, Staff count, Subject name

**Tabs:**

**Overview Tab:**
- Academic Year, Year Group, Subject, Status

**Students Tab (count):**
- Enrolment management component for adding/removing students from the class

**Staff Tab (count):**
- Staff assignment component for assigning teachers to the class

**Actions:**
- **Edit** > navigates to `/classes/{id}/edit`

### 6.4 Enrol a Student in a Class

**How to enrol a student:**
1. Go to the class detail > Students tab
2. Use the enrolment management interface
3. Search for and select the student to enrol
4. The student is added to the class roster

### 6.5 Remove a Student from a Class

**How to remove enrolment:**
1. Go to the class detail > Students tab
2. Find the student in the enrolment list
3. Click the remove/delete action
4. Confirm removal

---

## 7. Attendance

### 7.1 Attendance Sessions List

**Route:** `/en/attendance`

**What is displayed:**
- Data table with columns: Session Date (monospace), Class, Status (badge), Marked Count, Actions

**Filters:**
- **Date From** (date picker)
- **Date To** (date picker)
- **Class dropdown**: All + specific classes
- **Status dropdown**: All, Open, Submitted, Locked, Cancelled

### 7.2 Create an Attendance Session

**How to create a session:**
1. Click "+ Create Session" on the Attendance list page
2. A new session is created automatically and you are redirected to the marking page

### 7.3 Mark Attendance

**Route:** `/en/attendance/mark/{sessionId}`

**How to mark attendance:**
1. From the attendance list, click "Mark Attendance" on an open session
2. The marking page shows all students in the class
3. For each student, select: Present, Absent, Late, or Excused
4. Optionally add notes for individual students
5. Click "Submit" to finalize the attendance session

### 7.4 Attendance Exceptions

**Route:** `/en/attendance/exceptions`

View attendance exceptions (absences, late arrivals) with filtering and reporting capabilities.

---

## 8. Gradebook & Assessments

### 8.1 Gradebook Overview

**Route:** `/en/gradebook`

**What is displayed:**
- Grid of class cards, each showing: Class name, Subject name, Assessment count badge
- Cards are clickable, linking to the class gradebook

**Filters:**
- **Academic Year dropdown**
- **Academic Period dropdown**

**How to access a class gradebook:**
1. Navigate to Gradebook
2. Optionally filter by year or period
3. Click the class card to open the detailed gradebook

### 8.2 Class Gradebook

**Route:** `/en/gradebook/{classId}`

**Tabs:**

**Assessments Tab:**
- Table of assessments: Title, Status, Category, Max Score, Due Date, Actions (Grade Entry, Status Change)
- Click "Grade Entry" to enter/edit grades for an assessment

**Period Grades Tab:**
- Table showing: Student, Computed Score/Letter, Override Score/Letter, Final Score/Letter
- Override button to manually adjust a student's final grade

**Grade Config Tab:**
- Select grading scale for the class
- Adjust category weights (percentage-based, must total 100%)
- Save configuration

### 8.3 Create an Assessment

**Route:** `/en/gradebook/{classId}/assessments/new`

**How to create an assessment:**
1. From the class gradebook, click "+ New Assessment"
2. Fill in: Title, Category, Max Score, Due Date, Description
3. Click "Create"

### 8.4 Enter Grades

**Route:** `/en/gradebook/{classId}/assessments/{assessmentId}/grades`

**How to enter grades:**
1. From the class gradebook > Assessments tab, click "Grade Entry" on an assessment
2. The grade entry page shows all enrolled students
3. Enter the score for each student
4. Optionally add comments
5. Save grades

### 8.5 Override a Final Grade

**How to override a grade:**
1. Go to class gradebook > Period Grades tab
2. Click the Override button next to a student
3. Enter the override score and/or letter grade
4. Submit - the override replaces the computed grade

---

## 9. Report Cards & Transcripts

### 9.1 Report Cards List

**Route:** `/en/report-cards`

**What is displayed:**
- Data table with columns: Student, Period, Status (badge), Locale, Published At, Actions

**Filters:**
- **Search** (student name)
- **Period dropdown**: All + specific periods
- **Status dropdown**: All, Draft, Published, Revised

**Actions per row:**
- **View** (eye icon) > navigates to report card detail
- **PDF Preview** (file icon) > opens PDF in modal
- **Publish** (only if draft) > publishes to parents
- **Revise** (only if published) > creates revision

### 9.2 Generate Report Cards

**How to generate report cards:**
1. Click "+ Generate" on the Report Cards list page
2. The Generate Dialog opens
3. Select: Academic Period, Locale (en/ar), Year Group or specific students
4. Click "Generate"
5. Report cards are created in draft status

### 9.3 Report Card Detail

**Route:** `/en/report-cards/{id}`

**What is displayed:**
- Student name, period, status, locale
- Grade snapshot summary (computed grades at time of generation)
- Teacher comment and Principal comment (editable in draft status)
- Revision chain (version history)

**Actions:**
- **Edit comments** (draft only): modify teacher_comment and principal_comment, then Save
- **Preview PDF**: view rendered PDF in modal
- **Download PDF**: download as file
- **Publish**: make available to parents
- **Revise**: create a new version (published only)

### 9.4 Transcripts

**Route:** via Reports or direct API

**How to generate a transcript:**
1. Use the transcript generation endpoint
2. Select the student
3. Generate transcript (compiles all academic records)
4. Download as PDF

---

## 10. Student Promotion

### 10.1 Promotion Wizard

**Route:** `/en/promotion`

**What is displayed:**
- Multi-step wizard for promoting students to the next academic year

**How to promote students:**
1. Navigate to Academics > Promotion
2. The wizard guides you through:
   - Step 1: Select source academic year and period
   - Step 2: Preview which students will be promoted and to which year group
   - Step 3: Review promotion assignments (some may need manual adjustment)
   - Step 4: Confirm and execute promotion
3. Students are moved to the next year group based on configuration
4. A promotion rollover report is generated

---

## 11. Admissions

### 11.1 Applications List

**Route:** `/en/admissions`

**What is displayed:**
- **5 Stat Cards:** Total Applications, Submitted, Under Review, Accepted, Rejected
- Data table with columns: Application Number (monospace), Student Name, Form, Status (badge), Submitted At

**Filters:**
- **Status tab bar**: All, Submitted, Under Review, Accepted, Rejected, Withdrawn
- **Search input**: searches applications

**Actions:**
- **Analytics button** > navigates to `/admissions/analytics`
- **Forms button** > navigates to `/admissions/forms`
- Click any row > navigates to application detail

### 11.2 Application Detail

**Route:** `/en/admissions/{id}`

**What is displayed:**
- Student name as title, application number as reference
- Status badge and application metrics

**Tabs:**

**Application Tab:**
- Dynamic form renderer showing all submitted form fields (read-only)

**Notes Tab:**
- List of existing notes
- Add note form (textarea + submit)

**Timeline Tab:**
- Vertical timeline of all events (status changes, notes, actions)

**Actions (status-dependent):**
- **Start Review** (submitted > under_review)
- **Accept** (under_review > accepted): requires reason
- **Reject** (under_review > rejected): requires reason
- **Convert to Student** (accepted > conversion): preview conversion data, then confirm
- **Withdraw** (available from non-final states)

### 11.3 Convert Application to Student

**How to convert an accepted application to a student enrolment:**
1. Go to the accepted application detail
2. Click "Convert to Student"
3. Preview the conversion data (student record that will be created)
4. Confirm conversion
5. A student record is created and linked to a household

### 11.4 Admissions Analytics

**Route:** `/en/admissions/analytics`

**What is displayed:**
- 3 stat cards: Total Applications, Conversion Rate (%), Average Days to Decision
- Funnel chart (Recharts bar chart) showing application pipeline stages

### 11.5 Admission Forms

**Route:** `/en/admissions/forms`

Manage the custom admission form schema:
- View current form fields
- Edit form structure (add/remove/reorder fields)
- Configure required vs optional fields

---

## 12. Finance

### 12.1 Finance Dashboard

**Route:** `/en/finance`

**What is displayed:**
- **4 Stat Cards:** Overdue Amount, Unallocated Payments (count), Pending Refunds (count), Current Month Collected
- **Ageing Bar Chart:** Horizontal segmented bar showing overdue invoice distribution across 4 buckets:
  - 1-30 days (amber)
  - 31-60 days (orange)
  - 61-90 days (red)
  - 90+ days (dark red)
  - Legend with bucket colour, label, amount, and invoice count
- **Invoice Pipeline (5-stage):** Draft, Pending Approval, Issued, Overdue, Paid - each showing count and total amount
- **Revenue Summary (3 columns):** Current Month Collected (with % change vs previous month), Previous Month Collected, Current Month Invoiced
- **Unallocated Payments Alert:** Shows if count > 0 with icon and total amount
- **Pending Refunds Alert:** Shows if count > 0 with "View All" link to refunds
- **Recent Payments Table:** Reference, Household (linked), Amount, Status (badge), Date

**Navigation Tabs (Finance Layout):**
Dashboard | Fee Structures | Discounts | Fee Assignments | Fee Generation | Invoices | Payments | Refunds | Statements

### 12.2 Fee Structures

**Route:** `/en/finance/fee-structures`

**What is displayed:**
- Table with columns: Name, Amount, Billing Frequency (One-off / Per Term / Monthly / Custom), Year Group, Status (Active/Inactive badge)

**Filters:**
- Search input
- Active status dropdown: All, Active, Inactive

**How to create a fee structure:**
1. Click "+ New Fee Structure"
2. Fill in: Name, Amount, Billing Frequency, Year Group (optional)
3. Click "Create"

**How to edit a fee structure:**
1. Click a row to open the detail/edit page
2. Modify fields: Name, Amount, Billing Frequency, Year Group, Active toggle
3. Click "Save"

### 12.3 Discounts

**Route:** `/en/finance/discounts`

**What is displayed:**
- Table with columns: Name, Type (Percent / Fixed), Value (% or amount), Status (Active/Inactive)

**How to create a discount:**
1. Click "+ New Discount"
2. Fill in: Name, Discount Type (percent/fixed), Value
3. Click "Create"

**How to edit a discount:**
1. Click a row to open the detail/edit page
2. Modify fields: Name, Type, Value, Active toggle
3. Click "Save"

### 12.4 Fee Assignments

**Route:** `/en/finance/fee-assignments`

**What is displayed:**
- Table with columns: Household, Student, Fee Structure, Discount, Effective Dates (from - to or "Ongoing")

**Filters:**
- Household selector (combobox with search)
- Clear filter button

**How to create a fee assignment:**
1. Click "+ New Fee Assignment"
2. Select: Household, Student (optional), Fee Structure, Discount (optional), Effective From date, Effective To date (optional)
3. Click "Create"

### 12.5 Fee Generation

**Route:** `/en/finance/fee-generation`

**What is displayed:**
- Multi-step wizard for bulk invoice generation

**How to generate fees (create invoices in bulk):**
1. Navigate to Finance > Fee Generation
2. The wizard guides through:
   - Step 1: Select billing period/term
   - Step 2: Preview generated invoices (shows household, student, amount, fee structure)
   - Step 3: Review and confirm
3. Click "Generate" to create all invoices in draft status
4. Invoices can then be issued individually or in bulk

### 12.6 Invoices

**Route:** `/en/finance/invoices`

**What is displayed:**
- **Status filter tabs:** All, Draft, Pending, Issued, Partial, Paid, Overdue, Closed
- Table with columns: Invoice # (monospace), Household (linked), Status (badge), Total, Balance (red if > 0), Due Date, Issue Date

**Filters:**
- Status tab bar (8 options)
- Search input
- Date From / Date To (date pickers)

**How to view an invoice:**
1. Click any row to open the invoice detail page

### 12.7 Invoice Detail

**Route:** `/en/finance/invoices/{id}`

**What is displayed:**
- Invoice number as reference, household name, status badge
- **Metrics:** Total amount, Balance, Due Date

**Tabs:**

**Lines Tab:**
- Table: Description, Quantity, Unit Amount, Total, Student/Fee Structure link

**Payments Tab:**
- Table: Invoice, Due Date, Invoice Total, Allocated Amount, Date

**Installments Tab:**
- Table: Due Date, Amount, Status
- Create installment plan button

**Actions (status-dependent):**
- **Issue** (draft > pending_approval/issued): submit for approval or directly issue
- **Void** (issued): void an issued invoice
- **Cancel** (draft): cancel a draft invoice
- **Write Off**: write off remaining balance with reason
- **Create Installments**: set up payment plan with multiple due dates

### 12.8 Payments

**Route:** `/en/finance/payments`

**What is displayed:**
- Table with columns: Reference (monospace), Household (linked), Amount, Payment Method, Status (badge), Received Date, Allocated/Unallocated amounts

**Filters:**
- Search input
- Status dropdown: All, Pending, Posted, Failed, Voided, Partially Refunded, Fully Refunded
- Payment Method dropdown: All, Cash, Bank Transfer, Card (Manual), Stripe
- Date From / Date To

**How to record a payment:**
1. Click "Record Payment" (or navigate to `/finance/payments/new`)
2. Fill in the payment form: Household, Amount, Payment Method, Reference, Received Date
3. Click "Submit"
4. Allocate the payment to specific invoices

### 12.9 Payment Detail

**Route:** `/en/finance/payments/{id}`

**What is displayed:**
- Payment reference, household (linked), status badge
- **Metrics:** Amount, Method, Received Date
- **Allocations table:** Invoice Number, Due Date, Invoice Total, Allocated Amount, Date
- **Refunds table:** Amount, Reason, Status, Date

**Actions:**
- **Download Receipt PDF**
- **Allocate Payment**: allocate unallocated funds to invoices
- **Request Refund**: initiate refund process

### 12.10 Refunds

**Route:** `/en/finance/refunds`

**What is displayed:**
- Table with columns: Refund Reference, Payment Reference, Household, Amount, Status (badge), Requested By, Reason, Actions

**Filters:**
- Search input
- Status dropdown: All, Pending Approval, Approved, Executed, Failed, Rejected

**Action buttons (status-dependent):**
- **Approve** (if pending_approval)
- **Reject** (if pending_approval)
- **Execute** (if approved)

### 12.11 Statements

**Route:** `/en/finance/statements`

**What is displayed:**
- Table of households with columns: Household Name, Billing Parent Name, "View Statement" button

**How to view a household statement:**
1. Navigate to Finance > Statements
2. Search for a household
3. Click "View Statement"

### 12.12 Household Statement Detail

**Route:** `/en/finance/statements/{householdId}`

**What is displayed:**
- Household name, date range filter
- **Ledger table (7 columns):** Date, Type (badge: invoice_issued, payment_received, allocation, refund, write_off), Reference, Description, Debit, Credit, Running Balance

**Filters:**
- Date From / Date To (client-side filtering)

**Actions:**
- **Download PDF** with selected date range

---

## 13. Payroll

### 13.1 Payroll Dashboard

**Route:** `/en/payroll`

**What is displayed:**
- **3 Stat Cards:** Total Pay This Month, Headcount, Total Bonus
- **Current Run Card:** Period label, Status badge, Headcount, Total Pay
- **Incomplete Entries Warning** (conditional): list of staff with missing compensation data
- **Quick Links (3 cards):**
  - Compensation > `/payroll/compensation`
  - Payroll Runs > `/payroll/runs`
  - Reports > `/payroll/reports`

**Actions:**
- **Continue Draft** (if active draft run exists) > navigates to run detail
- **New Payroll Run** (otherwise) > navigates to runs list

### 13.2 Compensation Management

**Route:** `/en/payroll/compensation`

**What is displayed:**
- Table with columns: Staff Name, Type (Salaried/Per Class badge), Rate (currency or "X / per class"), Bonus Config, Effective From, Actions (Edit)

**Filters:**
- Type dropdown: All, Salaried, Per Class

**How to add compensation:**
1. Click "+ Add Compensation"
2. Fill in dialog form: Staff Profile, Compensation Type, Base Salary or Per Class Rate, Bonus Class Rate, Bonus Day Multiplier, Effective From, Status
3. Click "Save"

**How to bulk import compensation:**
1. Click "Bulk Import"
2. Upload CSV file with compensation data
3. Review validation results
4. Confirm import

### 13.3 Payroll Runs List

**Route:** `/en/payroll/runs`

**What is displayed:**
- Table with columns: Period, Status (badge), Headcount, Total Pay, Created Date

**Filters:**
- Status dropdown: All, Draft, Pending Approval, Finalised, Cancelled
- Year dropdown: current and previous 4 years

**How to create a new payroll run:**
1. Click "+ New Payroll Run"
2. The Create Run Dialog opens
3. Fill in the period details
4. Click "Create"
5. Navigate to the new run detail page

### 13.4 Payroll Run Detail

**Route:** `/en/payroll/runs/{id}`

**What is displayed:**
- Run period, status, working days configuration
- Entries table (paginated, editable): Staff Name, Basic Pay, Bonus, Deductions, Net Pay
- Incomplete entries warning if applicable

**Actions:**
- **Update Working Days**: modify total working days for the run
- **Refresh Entries**: recalculate all entries from compensation data
- **Auto-populate Classes**: fill in class counts from scheduling data
- **Finalise Run**: lock the run and submit for approval (or directly finalise if owner)
- **Cancel Run**: cancel a draft run
- **Export Payslips**: generate and download PDF payslips for all staff

### 13.5 Staff Payroll History

**Route:** `/en/payroll/staff/{staffProfileId}`

**What is displayed:**
- Staff name as title
- Table with columns: Month, Period Label, Basic Pay, Bonus Pay, Total Pay, Print Payslip button

### 13.6 Payroll Reports

**Route:** `/en/payroll/reports`

**Tabs:**

**Cost Trend Tab:**
- Line chart showing monthly payroll costs over time
- Basic vs Bonus split visualisation
- Headcount overlay

**YTD Summary Tab:**
- Table of all staff: YTD Basic, YTD Bonus, YTD Total, Months Paid

**Bonus Analysis Tab:**
- Table of staff: Bonus Frequency, Total Bonus Amount, Average Bonus

---

## 14. Scheduling & Timetables

### 14.1 Scheduling Hub

**Route:** `/en/scheduling` (redirects to `/scheduling/dashboard`)

The scheduling module is accessed via a tabbed layout with the following sub-pages:

**Scheduling Tabs:**
Dashboard | Period Grid | Curriculum | Competencies | Break Groups | Teacher Config | Room Closures | Availability | Preferences | Requirements | Auto Scheduler | Runs

### 14.2 Period Grid

**Route:** `/en/scheduling/period-grid`

**What is displayed:**
- 7-column grid (one per weekday) with colour-coded period cards
- Each period card shows: Name, Time range, Type icon

**Selectors:**
- Academic Year dropdown
- Year Group dropdown

**How to configure the period grid:**
1. Select Academic Year and Year Group
2. Click "Add Period" on any weekday column
3. Fill in: Period Name, Arabic Name (optional), Start Time, End Time, Type (teaching/break/lunch/assembly/free), Supervision Mode, Break Group
4. Save the period
5. Use "Copy Monday to All" to duplicate Monday's schedule to all weekdays
6. Use "Copy from Year Group" to copy another group's grid

**Period Types:**
- Teaching (primary colour)
- Break Supervision (amber)
- Lunch Duty (orange)
- Assembly (purple)
- Free (grey)

### 14.3 Curriculum Requirements

**Route:** `/en/scheduling/curriculum`

**What is displayed:**
- Subject allocation table per year group
- Capacity warning if total periods exceed available teaching slots

**Selectors:**
- Academic Year, Year Group

**How to set curriculum requirements:**
1. Select Year and Year Group
2. Click "Add Requirement"
3. Fill in: Subject, Min Periods/Week, Max Periods/Day, Preferred Periods/Week, Requires Double Period (toggle), Double Period Count
4. Save
5. Review remaining capacity indicator

### 14.4 Teacher Competencies

**Route:** `/en/scheduling/competencies`

**Two views:**

**By Teacher Tab:**
1. Select a teacher from dropdown
2. Matrix of Subjects x Year Groups with checkboxes
3. Check/uncheck to assign/remove competencies
4. Toggle "Primary" to designate primary teacher for subject/group

**By Subject Tab:**
1. Select Subject and Year Group
2. List of eligible teachers with primary toggle
3. Add/remove teachers from the eligible list

**Actions:**
- Copy competencies from previous year

### 14.5 Rooms Management

**Route:** `/en/rooms`

**What is displayed:**
- Table with columns: Name, Type (badge), Capacity, Exclusive flag, Active status

**Filters:**
- Room Type: Classroom, Lab, Library, Hall, Gym, Office, Other
- Active status

**How to create a room:**
1. Click "+ New Room"
2. Fill in: Name, Room Type, Capacity, Is Exclusive (toggle)
3. Save

### 14.6 Auto Scheduler

**Route:** `/en/scheduling/auto`

**What is displayed:**
- Prerequisites card with pass/fail checks and fix links
- Mode label (auto or hybrid with count of pinned entries)
- Run history table

**How to run the auto-scheduler:**
1. Select Academic Year
2. Review prerequisites (all must pass):
   - Period grid configured
   - Curriculum requirements set
   - Teacher competencies assigned
   - Rooms available
3. Click "Generate Timetable"
4. Confirm in the dialog
5. Progress modal shows: Phase name, Slots assigned/total, Duration, Progress bar
6. When complete, click "View & Review" to review results

### 14.7 Scheduling Runs

**Route:** `/en/scheduling/runs`

**What is displayed:**
- Table with columns: Date, Mode (auto/hybrid badge), Status (badge), Assigned count, Unassigned count, Score (colour-coded: green >= 80, amber >= 60, red < 60), Duration, Actions

### 14.8 Scheduling Run Detail & Review

**Route:** `/en/scheduling/runs/{id}`

**What is displayed:**
- Status banner (proposed/applied)
- Year group tabs
- Interactive schedule grid with drag-to-move capability
- Validation results (health score, violations)
- Workload sidebar (proposed only, large screens)

**Actions:**
- **Validate**: run constraint validation
- **Apply**: apply the proposed schedule to the live timetable
- **Discard**: discard the proposed schedule
- **Move entries**: drag-and-drop to new time slots
- **Cover teacher**: right-click to assign cover teacher
- **Export PDF**: by year group, teacher, or full schedule

### 14.9 Timetables

**Route:** `/en/timetables`

**Tabs:**
- **Teacher view**: select teacher, view their weekly timetable
- **Room view**: select room, view bookings
- **Student view**: select student, view their schedule

Each view shows a TimetableGrid with period slots displaying: Class name, Room, Teacher, Subject.

---

## 15. Communications & Announcements

### 15.1 Announcements List

**Route:** `/en/communications`

**What is displayed:**
- Tab bar: All, Draft, Scheduled, Published, Archived
- Table with columns: Title, Scope, Status (badge), Published/Scheduled Date, Author Name

### 15.2 Create an Announcement

**Route:** `/en/communications/new`

**How to create an announcement:**
1. Click "+ New Announcement"
2. Fill in:
   - **Title** (required)
   - **Body** (rich text, required for publish)
   - **Scope**: School-wide, Year Group, Class, Household, or Custom
   - **Target IDs** (conditional): select specific year groups, classes, households, or users based on scope
   - **Schedule** (optional): toggle scheduling and set date/time
3. Click "Save as Draft" to save without publishing
4. Click "Publish" to send immediately (or at scheduled time)

### 15.3 Announcement Detail

**Route:** `/en/communications/{id}`

**What is displayed:**
- Title, author, date, status badge, scope badge
- Body content (editable if draft)
- Delivery stats (published only): Queued, Sent, Delivered, Failed, Read counts

**Actions:**
- **Edit** (draft only): modify title and body
- **Publish** (draft): send the announcement
- **Archive** (published): archive the announcement

---

## 16. Approvals

### 16.1 Approval Requests List

**Route:** `/en/approvals`

**What is displayed:**
- Table with columns: Type (descriptive label), Requested By, Submitted Date, Status (badge)

**Approval Types:**
- Admissions: Accept Applicant
- Finance: Issue Invoice
- Payroll: Finalise Run
- Communications: Publish Announcement

**Filters:**
- Status dropdown: Pending Approval, Approved, Rejected, Cancelled, All

**How to process an approval:**
1. Click a row to view the approval detail
2. Review the request details
3. Click "Approve" to approve, or "Reject" with a reason

---

## 17. Inquiries

### 17.1 Inquiries List (Admin View)

**Route:** `/en/inquiries`

**What is displayed:**
- List of parent inquiry cards with: Subject, Status (open/in_progress/closed), Message count, Last message preview, Timestamp

**How to respond to an inquiry:**
1. Click an inquiry card to open the conversation
2. Read the inquiry thread
3. Type a reply in the response box
4. Click "Send"

**How to resolve an inquiry:**
1. Open the inquiry
2. Click "Mark Resolved"
3. The inquiry status changes to closed

---

## 18. Reports Hub

### 18.1 Reports Index

**Route:** `/en/reports`

**Report Groups:**

**Academic:**
- Promotion Rollover > `/reports/promotion-rollover`
- Teacher Workload > `/reports/workload`

**Finance:**
- Fee Generation > `/reports/fee-generation`
- Write-Offs > `/reports/write-offs`
- Household Statements > `/finance/statements`

**Operations:**
- Admissions Funnel > `/admissions/analytics`
- Attendance Exceptions > `/attendance/exceptions`
- Notification Delivery > `/reports/notification-delivery`
- Allergy Report > `/students/allergy-report`

**Payroll:**
- Payroll Reports > `/payroll/reports`

**Data:**
- Student Export > `/reports/student-export`

---

## 19. Website Management

### 19.1 Website Pages List

**Route:** `/en/website`

**What is displayed:**
- Tab bar: All, Published, Draft, Archived
- Table with columns: Title, Slug (monospace, prefixed with "/"), Type (badge), Status (badge), In Nav (yes/no), Published At

**Actions:**
- **Contact Submissions** > `/website/contact-submissions`
- **+ New Page** > `/website/new`
- Click any row > edit page

### 19.2 Create a Website Page

**Route:** `/en/website/new`

**How to create a page:**
1. Click "+ New Page"
2. Fill in:
   - **Title** (required, auto-generates slug)
   - **Slug** (auto-slugified, manually editable)
   - **Page Type**: Home, About, Admissions, Contact, Custom
   - **Body HTML** (rich text editor)
   - **SEO:** Meta Title, Meta Description
   - **Navigation:** Show in Nav (toggle), Nav Order (if shown)
3. Click "Save" (saves as draft)

### 19.3 Edit a Website Page

**Route:** `/en/website/{id}`

**3-column layout:**
- Left: Page Details (title, slug, type), Content (rich HTML), SEO Settings (meta title, description)
- Right: Status info, Navigation settings (show in nav, order)

**Actions:**
- **Save**: update the page
- **Publish**: make live on the public website
- **Unpublish**: take offline
- **Delete**: remove the page (with confirmation)
- **Preview**: view rendered content in a dialog

### 19.4 Contact Form Submissions

**Route:** `/en/website/contact-submissions`

View and manage contact form submissions from the public website.

---

## 20. Settings

### 20.1 Settings Hub

**Route:** `/en/settings` (redirects to `/settings/branding`)

**Settings Tabs:**
Branding | General | Notifications | Stripe | Users | Invitations | Roles | Academic Years | Year Groups | Subjects | Grading Scales | Assessment Categories | Closures | Compliance | Imports | Audit Log

### 20.2 Branding

**Route:** `/en/settings/branding`

**How to update school branding:**
1. Navigate to Settings > Branding
2. Upload school logo (image file upload)
3. Set Primary Colour using the colour picker or hex input
4. Set Secondary Colour
5. Click "Save"

### 20.3 General Settings

**Route:** `/en/settings/general`

**Collapsible Settings Sections:**

**General:**
- Parent Portal Enabled (toggle)
- Attendance Visible to Parents (toggle)
- Grades Visible to Parents (toggle)
- Inquiry Stale Hours (number, min: 1)

**Attendance:**
- Allow Teacher Amendment (toggle)
- Auto Lock After Days (number, nullable)
- Pending Alert Time Hour (0-23)

**Gradebook:**
- Default Missing Grade Policy (Exclude / Zero)
- Require Grade Comment (toggle)

**Admissions:**
- Require Approval for Acceptance (toggle)

**Finance:**
- Require Approval for Invoice Issue (toggle)
- Default Payment Term Days (number, min: 0)
- Allow Partial Payment (toggle)

**Communications:**
- Primary Outbound Channel (Email / WhatsApp)
- Require Approval for Announcements (toggle)

**Payroll:**
- Require Approval for Non-Principal (toggle)
- Default Bonus Multiplier (number, min: 0)
- Auto Populate Class Counts (toggle)

**Scheduling:**
- Auto Scheduler Enabled (toggle)
- Require Approval for Non-Principal (toggle)
- Teacher Weekly Max Periods (number, nullable)
- Max Solver Duration Seconds (number, min: 1)

**Approvals:**
- Expiry Days (number, min: 1)
- Reminder After Hours (number, min: 1)

**Compliance:**
- Audit Log Retention Months (number, min: 1)

### 20.4 Notification Settings

**Route:** `/en/settings/notifications`

**How to configure notifications:**
1. Navigate to Settings > Notifications
2. For each notification type, toggle enabled/disabled
3. Select delivery channels (Email, SMS, Push) via checkboxes
4. Changes save automatically per type

**Notification Types:**
invoice.issued, payment.received, payment.failed, report_card.published, attendance.exception, admission.status_change, announcement.published, approval.requested, approval.decided, inquiry.new_message, payroll.finalised, payslip.generated

### 20.5 Stripe Configuration

**Route:** `/en/settings/stripe`

**How to configure Stripe:**
1. Navigate to Settings > Stripe
2. Enter Stripe Secret Key (password field)
3. Enter Stripe Publishable Key (password field)
4. Enter Stripe Webhook Secret (password field)
5. Click "Save"
6. After saving, keys show as masked (last 4 characters only)
7. "Configured" badge appears when set up

### 20.6 Users & Memberships

**Route:** `/en/settings/users`

**What is displayed:**
- Table with columns: Name, Email (LTR), Role(s), Status (badge), Actions (Suspend/Reactivate)

**How to invite a user:**
1. Click "+ Invite"
2. Enter email address
3. Select role from dropdown
4. Click "Send Invitation"
5. Success banner appears for 4 seconds

**How to suspend a user:**
1. Click "Suspend" in the Actions column
2. Confirm in the dialog
3. User status changes to "Suspended"

**How to reactivate a user:**
1. Click "Reactivate" in the Actions column
2. Confirm in the dialog
3. User status changes to "Active"

### 20.7 Invitations

**Route:** `/en/settings/invitations`

**What is displayed:**
- Table with columns: Email, Status (pending/accepted/expired/revoked), Expires At, Revoke action

**How to revoke an invitation:**
1. Click "Revoke" on a pending invitation
2. Confirm revocation
3. The invitation can no longer be accepted

### 20.8 Roles Management

**Route:** `/en/settings/roles`

**What is displayed:**
- Table with columns: Name (lock icon if system role), Key (monospace), Tier (badge), System Role, Permissions count, Actions (Edit, Delete)

**How to create a custom role:**
1. Click "+ New Role"
2. Fill in: Role Key (lowercase with underscores), Display Name, Tier (Admin/Staff/Parent)
3. Use the Permission Picker to select permissions (grouped by domain)
4. Click "Create"

**How to edit role permissions:**
1. Click "Edit" on a role row (or click the row)
2. Navigate to the role detail page
3. Modify permissions using the Permission Picker
4. Click "Save"

**Note:** System roles (school_owner, school_admin, teacher, etc.) cannot be deleted. Their permissions can be viewed but are managed by the platform.

### 20.9 Academic Years

**Route:** `/en/settings/academic-years`

**How to create an academic year:**
1. Click "+ New Academic Year"
2. Fill in: Name, Start Date, End Date, Status (Planned/Active/Closed)
3. Click "Create"

**How to manage academic periods within a year:**
1. Click the expand arrow on an academic year row
2. The PeriodManagement component opens inline
3. Add periods: Name, Start Date, End Date, Status
4. Edit or remove periods

**Status transitions:** Planned > Active > Closed

### 20.10 Year Groups

**Route:** `/en/settings/year-groups`

**How to create a year group:**
1. Click "+ New Year Group"
2. Fill in: Name (e.g., "Grade 1"), Display Order (numeric), Next Year Group (for promotion chain)
3. Click "Create"

### 20.11 Subjects

**Route:** `/en/settings/subjects`

**What is displayed:**
- Table with columns: Name, Code, Type (badge), Active (toggle), Edit button

**Filters:**
- Subject Type: Academic, Supervision, Duty, Other
- Active status

**How to create a subject:**
1. Click "+ New Subject"
2. Fill in: Name, Code, Subject Type, Active
3. Click "Create"

### 20.12 Grading Scales

**Route:** `/en/settings/grading-scales`

**How to create a grading scale:**
1. Click "+ New Grading Scale"
2. Select type: Numeric, Letter, or Custom
3. For Numeric: define ranges (min, max, label for each range)
4. For Letter: define labels (key, label for each letter grade)
5. Click "Create"

**Note:** Scales that are "in use" by classes cannot be deleted.

### 20.13 Assessment Categories

**Route:** `/en/settings/assessment-categories`

**How to create a category:**
1. Click "+ New Category"
2. Fill in: Name (e.g., "Formative", "Summative", "Participation"), Default Weight (0-100%)
3. Click "Create"

### 20.14 School Closures

**Route:** `/en/settings/closures`

**What is displayed:**
- Table with columns: Date, Reason, Scope (badge: All School / Year Group / Room), Created By

**How to add a school closure:**
1. Click "+ New Closure"
2. Fill in: Closure Date, Reason, Affects Scope (All School / Specific Year Group / Specific Room), Scope Entity (if not all school)
3. Click "Create"

### 20.15 Compliance

**Route:** `/en/settings/compliance`

**What is displayed:**
- Table of compliance requests with status filter
- Request Types: Data Export, Data Deletion, Data Access, Data Rectification

**How to create a compliance request:**
1. Click "+ New Request"
2. Fill in: Request Type, Subject Type, Subject ID
3. Click "Submit"

**How to process compliance requests:**
Status flow: Submitted > Classify > Approve/Reject > Execute
1. Open a submitted request
2. Classify the request
3. Approve or reject with reason
4. If approved, execute the request

### 20.16 Imports

**Route:** `/en/settings/imports`

**How to import data:**
1. Select import type: Students, Parents, Staff, Fees, Exam Results, Staff Compensation
2. Download the CSV template (click "Download Template")
3. Fill in the template with your data
4. Upload the CSV file (drag-and-drop or click-to-upload, max 10MB)
5. Review validation results: Total Rows, Valid Rows, Invalid Rows, Error details
6. If valid rows exist, click "Confirm Import"
7. Import processes in background (status polls every 2 seconds)

**Import History:**
- Table showing past imports: Type, Status, Row Counts, Timestamps

### 20.17 Audit Log

**Route:** `/en/settings/audit-log`

**What is displayed:**
- Table with columns: Timestamp, Actor Name, Action, Entity Type, Entity ID

**Filters:**
- Entity Type dropdown
- Actor search
- Action filter
- Date range (Start Date, End Date)

---

## 21. User Profile

### 21.1 Profile Settings

**Route:** `/en/profile`

**Sections:**

**Personal Info:**
- First Name, Last Name (editable)
- Email (read-only)
- Preferred Locale selection
- Theme selector

**MFA Setup:**
1. Click "Set Up MFA"
2. Scan the QR code with an authenticator app
3. Enter the 6-digit verification code
4. Click "Verify"
5. MFA is now enabled for your account

**Active Sessions:**
- List of sessions: Device/User Agent, IP Address, Last Active
- "Revoke" button to terminate other sessions

**Communication Preferences:**
- Link to communication preferences page

---

## 22. Global Features

### 22.1 Global Search (Cmd+K)

**How to use global search:**
1. Press Cmd+K (Mac) or Ctrl+K (Windows) anywhere in the app
2. The command palette opens
3. Type to search across: Students, Staff, Households, Classes, Invoices
4. Click a result to navigate directly to that record

### 22.2 Notifications Panel

**How to view notifications:**
1. Click the bell icon in the top bar
2. The notification panel opens showing recent notifications
3. Click a notification to navigate to the related record
4. Click "Mark All Read" to clear all unread notifications

### 22.3 Language Switching

**How to switch between English and Arabic:**
1. Click the language toggle in the top bar or go to Profile > Preferred Locale
2. Select "English" or "Arabic"
3. The entire interface switches language and direction (LTR/RTL)

### 22.4 Sidebar Navigation

The sidebar contains role-based navigation organized into sections:

**Overview:** Dashboard
**People:** Students, Staff, Households
**Academics:** Classes, Promotion, Attendance, Gradebook, Report Cards
**Scheduling:** Rooms, Schedules, Timetables, Auto Scheduling, Period Grid, Curriculum, Competencies, Scheduling Runs
**Operations:** Admissions, Finance, Payroll, Communications, Approvals
**Reports:** Reports Hub
**School:** Website, Settings, Closures

The sidebar is collapsible and includes a mobile drawer variant for smaller screens.

---

## Appendix A: School Owner Permissions (60)

| Permission | Description |
|---|---|
| `users.manage` | Create, update, suspend, reactivate users |
| `users.invite` | Send and manage invitations |
| `users.view` | View user list and details |
| `roles.manage` | Create, edit, delete custom roles |
| `settings.manage` | Modify all tenant settings |
| `branding.manage` | Update school branding (logo, colours) |
| `stripe.manage` | Configure Stripe payment keys |
| `notifications.manage` | Configure notification templates |
| `modules.manage` | Enable/disable tenant modules |
| `domains.manage` | Manage custom domains |
| `approvals.manage` | Approve or reject approval requests |
| `approvals.view` | View pending approvals |
| `payroll.view` | View payroll data |
| `payroll.manage_compensation` | Create/edit compensation records |
| `payroll.create_run` | Create and manage payroll runs |
| `payroll.finalise_run` | Finalise and lock payroll runs |
| `payroll.generate_payslips` | Generate and export payslip PDFs |
| `payroll.view_bank_details` | View staff bank details |
| `payroll.view_reports` | Access payroll reports |
| `schedule.manage` | Create/edit/delete schedule entries |
| `schedule.override_conflict` | Override scheduling conflicts |
| `schedule.manage_closures` | Manage school closure dates |
| `schedule.configure_period_grid` | Configure period time grid |
| `schedule.configure_requirements` | Set curriculum requirements |
| `schedule.configure_availability` | Manage staff availability |
| `schedule.manage_preferences` | Manage scheduling preferences |
| `schedule.run_auto` | Execute auto-scheduler |
| `schedule.apply_auto` | Apply auto-scheduler results |
| `schedule.pin_entries` | Pin schedule entries |
| `schedule.view_auto_reports` | View scheduling reports |
| `students.manage` | Create/edit/archive students |
| `students.view` | View student records |
| `attendance.manage` | Manage attendance sessions |
| `attendance.view` | View attendance data |
| `attendance.take` | Mark attendance |
| `gradebook.manage` | Manage gradebook configuration |
| `gradebook.view` | View grades |
| `gradebook.enter_grades` | Enter and edit grades |
| `gradebook.override_final_grade` | Override computed final grades |
| `gradebook.publish_report_cards` | Publish report cards |
| `transcripts.generate` | Generate student transcripts |
| `admissions.manage` | Process applications |
| `admissions.view` | View applications |
| `finance.manage` | Manage fee structures, invoices, discounts |
| `finance.view` | View financial data |
| `finance.process_payments` | Record and allocate payments |
| `finance.issue_refunds` | Process refunds |
| `communications.manage` | Create and manage announcements |
| `communications.view` | View communications |
| `communications.send` | Publish and send communications |
| `inquiries.view` | View parent inquiries |
| `inquiries.respond` | Reply to inquiries |
| `website.manage` | Manage public website pages |
| `analytics.view` | View analytics dashboards |
| `compliance.manage` | Manage compliance requests |
| `compliance.view` | View audit logs and compliance data |

---

## Appendix B: Module Toggles

The school owner can enable/disable these modules per tenant:

| Module Key | Controls |
|---|---|
| `admissions` | Application forms, pipeline, analytics |
| `attendance` | Attendance sessions, marking, exceptions |
| `gradebook` | Assessments, grades, report cards |
| `finance` | Fee structures, invoices, payments, refunds |
| `payroll` | Compensation, payroll runs, payslips |
| `communications` | Announcements, notifications |
| `website` | Public website pages |
| `analytics` | Analytics dashboards |
| `compliance` | Compliance requests, GDPR tools |
| `parent_inquiries` | Parent inquiry system |
| `auto_scheduling` | Auto-scheduler solver |

---

## Appendix C: Status State Machines

### Student Status
```
applicant --> active --> withdrawn --> archived
                   \--> graduated --> archived
withdrawn --> active
```

### Invoice Status
```
draft --> pending_approval --> issued --> partially_paid --> paid
                                    \--> overdue
draft --> cancelled
issued --> void
issued --> written_off
```

### Payroll Run Status
```
draft --> pending_approval --> finalised
draft --> cancelled
```

### Application Status
```
draft --> submitted --> under_review --> accepted --> converted
                                   \--> rejected
(any non-final) --> withdrawn
```

### Announcement Status
```
draft --> published --> archived
draft --> scheduled --> published --> archived
```

### Approval Request Status
```
pending_approval --> approved
pending_approval --> rejected
pending_approval --> cancelled
```

### Academic Year Status
```
planned --> active --> closed
```

### Report Card Status
```
draft --> published --> revised
```
