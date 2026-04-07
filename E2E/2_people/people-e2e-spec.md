# E2E Test Specification: People Section (Students, Staff, Households)

> **Coverage:** This document covers **14 pages** across 3 sub-sections:
>
> - Students: list, detail, edit (3 pages)
> - Staff: list, detail, new (3 pages)
> - Households: list, detail, edit, new (4 pages)
> - Parents/Guardians: detail (1 page)
> - Finance Statements: household statement (1 page — cross-linked from household)
> - Plus 2 sub-flows: merge dialog, split dialog
>
> **School Pages Covered So Far:** 15 / 322

**Base URL:** `https://edupod.app`
**Prerequisite:** Logged in as **School Owner** (owner@nhqs.test / Password123!) for tenant **Nurul Huda School (NHQS)**.
**Sub-navigation:** The People hub shows 3 tabs: **Students**, **Staff**, **Households**.

---

## Table of Contents

1. [People Sub-Navigation](#1-people-sub-navigation)
2. [Students — List Page](#2-students--list-page)
3. [Students — Detail Page](#3-students--detail-page)
4. [Students — Arabic / RTL](#4-students--arabic--rtl)
5. [Staff — List Page](#5-staff--list-page)
6. [Staff — Detail Page](#6-staff--detail-page)
7. [Staff — New Staff Profile](#7-staff--new-staff-profile)
8. [Staff — Arabic / RTL](#8-staff--arabic--rtl)
9. [Households — List Page](#9-households--list-page)
10. [Households — Detail Page](#10-households--detail-page)
11. [Households — Guardians Tab](#11-households--guardians-tab)
12. [Households — Add Student](#12-households--add-student)
13. [Households — Finance Tab & Statement PDF](#13-households--finance-tab--statement-pdf)
14. [Households — Merge](#14-households--merge)
15. [Households — Split](#15-households--split)
16. [Households — Edit Page](#16-households--edit-page)
17. [Guardian Detail Page](#17-guardian-detail-page)
18. [Households — Arabic / RTL](#18-households--arabic--rtl)

---

## 1. People Sub-Navigation

| #   | What to Check                         | Expected Result                                                                             | Pass/Fail |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------- | --------- |
| 1.1 | Click **People** in the morph bar     | Sub-strip appears below the morph bar with 3 links: **Students**, **Staff**, **Households** |           |
| 1.2 | Click **Students** in the sub-strip   | Navigates to `/en/students`. The Students link appears active/highlighted.                  |           |
| 1.3 | Click **Staff** in the sub-strip      | Navigates to `/en/staff`. The Staff link appears active/highlighted.                        |           |
| 1.4 | Click **Households** in the sub-strip | Navigates to `/en/households`. The Households link appears active/highlighted.              |           |

---

## 2. Students — List Page

**URL:** `/en/students`

### 2.1 Page Load

| #     | What to Check              | Expected Result                                                                              | Pass/Fail |
| ----- | -------------------------- | -------------------------------------------------------------------------------------------- | --------- |
| 2.1.1 | Navigate to `/en/students` | Page loads with heading **"Students"** and subtitle "Manage student records and enrolments". |           |
| 2.1.2 | Verify student count       | Pagination shows **"Showing 1–20 of 209"** (or current total). Table has 20 rows on page 1.  |           |

### 2.2 Table Columns

| #     | What to Check         | Expected Result                                                                   | Pass/Fail |
| ----- | --------------------- | --------------------------------------------------------------------------------- | --------- |
| 2.2.1 | Table headers         | Columns: **Name**, **Student #**, **Year Group**, **Status**, **Household**       |           |
| 2.2.2 | Student number format | Numbers follow format **STU-XXXXXX** (e.g., STU-000003). No YYYYMM in the middle. |           |
| 2.2.3 | Status column         | Shows coloured badge (green = Active, blue = Applicant, etc.)                     |           |
| 2.2.4 | Household column      | Each student shows a clickable household name link                                |           |

### 2.3 Search

| #     | What to Check                 | Expected Result                                                                                    | Pass/Fail |
| ----- | ----------------------------- | -------------------------------------------------------------------------------------------------- | --------- |
| 2.3.1 | Type "Ryan" in the search box | Table filters to show only students with "Ryan" in name. Count updates (e.g., "Showing 1–5 of 5"). |           |
| 2.3.2 | Clear the search box          | Table returns to showing all 209 students.                                                         |           |

### 2.4 Filters

| #     | What to Check                            | Expected Result                                                                  | Pass/Fail |
| ----- | ---------------------------------------- | -------------------------------------------------------------------------------- | --------- |
| 2.4.1 | Click the **Status** filter dropdown     | Options appear: All Statuses, Active, Applicant, Withdrawn, Graduated, Archived. |           |
| 2.4.2 | Select "Active"                          | Table shows only active students. Count updates.                                 |           |
| 2.4.3 | Click the **Year Group** filter dropdown | Options list all year groups (1st class, 2nd class, etc.).                       |           |
| 2.4.4 | Select a year group                      | Table filters to show only that year group.                                      |           |
| 2.4.5 | Reset all filters to "All"               | Full student list returns.                                                       |           |

### 2.5 Export — Excel

| #     | What to Check                             | Expected Result                                                                                                            | Pass/Fail |
| ----- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.5.1 | Click the **Excel** button (top right)    | An "Export to Excel" dialog opens with column checkboxes grouped by: Student Details, Enrolment, Parent/Guardian, Medical. |           |
| 2.5.2 | Click **Export** without changing columns | An `.xlsx` file downloads (filename: `Students_List.xlsx`).                                                                |           |
| 2.5.3 | Open the downloaded file                  | File contains student data with selected columns. Data is correct.                                                         |           |

### 2.6 Export — PDF

| #     | What to Check                        | Expected Result                                          | Pass/Fail |
| ----- | ------------------------------------ | -------------------------------------------------------- | --------- |
| 2.6.1 | Click the **PDF** button (top right) | An "Export to PDF" dialog opens with column checkboxes.  |           |
| 2.6.2 | Click **Export**                     | A `.pdf` file downloads (filename: `Students_List.pdf`). |           |
| 2.6.3 | Open the downloaded file             | PDF contains a formatted table of student data.          |           |

### 2.7 Pagination

| #     | What to Check                     | Expected Result                                                      | Pass/Fail |
| ----- | --------------------------------- | -------------------------------------------------------------------- | --------- |
| 2.7.1 | Click the **Next page** arrow     | Table shows page 2 (rows 21–40). Page indicator updates to "2 / 11". |           |
| 2.7.2 | Click the **Previous page** arrow | Table returns to page 1.                                             |           |

### 2.8 Click-Through to Student Detail

| #     | What to Check                                     | Expected Result                                                                   | Pass/Fail |
| ----- | ------------------------------------------------- | --------------------------------------------------------------------------------- | --------- |
| 2.8.1 | Click on a student name (e.g., "Charlotte Adams") | Navigates to `/en/students/{id}`. Student detail page loads — see section 3.      |           |
| 2.8.2 | Click on a household name (e.g., "Adams Family")  | Navigates to `/en/households/{id}`. Household detail page loads — see section 10. |           |

---

## 3. Students — Detail Page

**URL:** `/en/students/{id}` (e.g., Charlotte Adams)

### 3.1 Header

| #     | What to Check                             | Expected Result                                                                 | Pass/Fail |
| ----- | ----------------------------------------- | ------------------------------------------------------------------------------- | --------- |
| 3.1.1 | Page loads without "Something went wrong" | Student name appears as heading (e.g., **"Charlotte Adams"**). No error screen. |           |
| 3.1.2 | Status badge                              | Shows coloured status badge (e.g., green "Active").                             |           |
| 3.1.3 | Year group subtitle                       | Shows year group below name (e.g., "1st class").                                |           |
| 3.1.4 | Student number                            | Shows reference number in format **STU-XXXXXX** (e.g., STU-000003).             |           |
| 3.1.5 | Action buttons                            | **Edit** button and **Change Status** dropdown are visible.                     |           |

### 3.2 Metrics Row

| #     | What to Check | Expected Result                                                      | Pass/Fail |
| ----- | ------------- | -------------------------------------------------------------------- | --------- |
| 3.2.1 | Date of Birth | Shows formatted date (e.g., 15-09-2019).                             |           |
| 3.2.2 | Entry Date    | Shows formatted date (e.g., 23-03-2026).                             |           |
| 3.2.3 | Household     | Shows clickable household link. Click navigates to household detail. |           |

### 3.3 Tabs

| #     | What to Check            | Expected Result                                                                                                                     | Pass/Fail |
| ----- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.3.1 | Tab labels               | Tabs visible: **Overview**, **Classes & Enrolments**, **Homework**, **Medical**. (SEN tab appears only if student has SEN profile.) |           |
| 3.3.2 | Overview tab             | Shows gender, year group, nationality (if set), city of birth (if set). Shows household link. Shows parents/guardians list if any.  |           |
| 3.3.3 | Classes & Enrolments tab | Click tab. Shows list of class enrolments with status badges, or "No class enrolments found."                                       |           |
| 3.3.4 | Homework tab             | Click tab. Shows homework statistics (Total Assigned, Completed, Completion Rate) or "No homework data available". No crash.        |           |
| 3.3.5 | Medical tab              | Click tab. Shows allergy status badge and medical notes, or "No medical information on file."                                       |           |

### 3.4 Edit Button

| #     | What to Check  | Expected Result                                                                 | Pass/Fail |
| ----- | -------------- | ------------------------------------------------------------------------------- | --------- |
| 3.4.1 | Click **Edit** | Navigates to `/en/students/{id}/edit`. Edit form loads with pre-populated data. |           |

### 3.5 Change Status

| #     | What to Check                    | Expected Result                                                                                       | Pass/Fail |
| ----- | -------------------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| 3.5.1 | Click **Change Status** dropdown | Shows valid next statuses based on current status (e.g., for Active: Withdrawn, Graduated, Archived). |           |

---

## 4. Students — Arabic / RTL

| #   | What to Check                   | Expected Result                                                                                     | Pass/Fail |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------- | --------- |
| 4.1 | Navigate to `/ar/students`      | Page loads in RTL layout. Heading shows Arabic equivalent. Sub-strip shows الطلاب, الموظفون, الأسر. |           |
| 4.2 | Table headers in Arabic         | All column headers are translated.                                                                  |           |
| 4.3 | Navigate to `/ar/students/{id}` | Student detail page loads in Arabic/RTL. Tab labels translated.                                     |           |

---

## 5. Staff — List Page

**URL:** `/en/staff`

### 5.1 Page Load

| #     | What to Check           | Expected Result                                      | Pass/Fail |
| ----- | ----------------------- | ---------------------------------------------------- | --------- |
| 5.1.1 | Navigate to `/en/staff` | Page loads with heading **"Staff"**.                 |           |
| 5.1.2 | Verify staff count      | Pagination shows total (e.g., "Showing 1–20 of 34"). |           |

### 5.2 Table Columns

| #     | What to Check  | Expected Result                                                                                          | Pass/Fail |
| ----- | -------------- | -------------------------------------------------------------------------------------------------------- | --------- |
| 5.2.1 | Table headers  | Columns: **Name**, **Job Title**, **Department**, **Role**, **Status**, **Type**.                        |           |
| 5.2.2 | Data rendering | Each row shows staff name, job title (or "—"), department (or "—"), role, status badge, employment type. |           |

### 5.3 Search

| #     | What to Check                              | Expected Result                  | Pass/Fail |
| ----- | ------------------------------------------ | -------------------------------- | --------- |
| 5.3.1 | Type a name in search box and click Search | Table filters to matching staff. |           |
| 5.3.2 | Clear search                               | Full list returns.               |           |

### 5.4 Export — Excel

| #     | What to Check                                           | Expected Result                                                 | Pass/Fail |
| ----- | ------------------------------------------------------- | --------------------------------------------------------------- | --------- |
| 5.4.1 | Click the **Export** dropdown, select **Excel (.xlsx)** | "Export Excel" dialog opens with column checkboxes.             |           |
| 5.4.2 | Click **Export**                                        | An `.xlsx` file downloads (filename: `Staff_List_School.xlsx`). |           |

### 5.5 Export — PDF

| #     | What to Check                                 | Expected Result                                              | Pass/Fail |
| ----- | --------------------------------------------- | ------------------------------------------------------------ | --------- |
| 5.5.1 | Click the **Export** dropdown, select **PDF** | "Export PDF" dialog opens with column checkboxes.            |           |
| 5.5.2 | Click **Export**                              | A `.pdf` file downloads (filename: `Staff_List_School.pdf`). |           |

---

## 6. Staff — Detail Page

**URL:** `/en/staff/{id}` (click any staff row)

| #   | What to Check                          | Expected Result                                                                             | Pass/Fail |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------- | --------- |
| 6.1 | Click a staff row (e.g., "Sarah Daly") | Navigates to `/en/staff/{id}`. Profile page loads with name as heading.                     |           |
| 6.2 | Header info                            | Shows name, status badge, staff number reference (e.g., #TSM2568-7).                        |           |
| 6.3 | Metrics row                            | Shows Department, Employment Type, Staff Number.                                            |           |
| 6.4 | Tabs                                   | **Overview**, **Classes**, **Bank Details** tabs are present.                               |           |
| 6.5 | Overview tab                           | Shows user account info, name, email, job title, department, employment type, staff number. |           |
| 6.6 | Bank Details tab                       | Click tab. Shows bank details (may be empty/masked).                                        |           |
| 6.7 | Back button                            | Click **Back**. Returns to staff list.                                                      |           |
| 6.8 | Edit button                            | Click **Edit**. Navigates to edit page with pre-populated form.                             |           |

---

## 7. Staff — New Staff Profile

**URL:** `/en/staff/new`

| #    | What to Check                                  | Expected Result                                                                                                                           | Pass/Fail |
| ---- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1  | Click **New Staff Profile** on staff list page | Navigates to `/en/staff/new`. Form loads with heading "New Staff Profile".                                                                |           |
| 7.2  | Form sections                                  | Three sections visible: **Personal Information**, **Employment Details**, **Bank Details**.                                               |           |
| 7.3  | Personal Information fields                    | First Name, Last Name, Email, Phone, Role (dropdown), Staff Number (auto-generated with regenerate button).                               |           |
| 7.4  | Staff Number note                              | Text below staff number reads: "This will be the staff member's initial login password."                                                  |           |
| 7.5  | Role dropdown options                          | Click Role dropdown. Options include: School Principal, Admin, Teacher, Accounting, Front Office, Parent, School Vice-Principal, Student. |           |
| 7.6  | Employment Details fields                      | Job Title, Department, Employment Status (default: Active), Employment Type (default: Full Time).                                         |           |
| 7.7  | Bank Details fields                            | Bank Name, Account Number, IBAN.                                                                                                          |           |
| 7.8  | Create Teacher                                 | Fill: First Name=Test, Last Name=Teacher, Email=test.teacher@example.com, Role=Teacher. Click **Create Staff Profile**.                   |           |
| 7.9  | Credentials dialog                             | A "Staff Profile Created" dialog appears showing the email and password (staff number). Has copy buttons and Done.                        |           |
| 7.10 | Click Done                                     | Dialog closes. Redirects to staff list. New staff appears in the list.                                                                    |           |
| 7.11 | Create Accounting staff                        | Repeat with Role=Accounting, Department=Finance. Verify same flow.                                                                        |           |

---

## 8. Staff — Arabic / RTL

| #   | What to Check               | Expected Result                                 | Pass/Fail |
| --- | --------------------------- | ----------------------------------------------- | --------- |
| 8.1 | Navigate to `/ar/staff`     | Page loads in RTL. Heading translated.          |           |
| 8.2 | Navigate to `/ar/staff/new` | New staff form loads in RTL. Labels translated. |           |

---

## 9. Households — List Page

**URL:** `/en/households`

### 9.1 Page Load

| #     | What to Check                | Expected Result                                                                               | Pass/Fail |
| ----- | ---------------------------- | --------------------------------------------------------------------------------------------- | --------- |
| 9.1.1 | Navigate to `/en/households` | Page loads with heading **"Households"** and subtitle "Manage family household records".      |           |
| 9.1.2 | Table columns                | Columns: **Household Name**, **Status**, **Students**, **Billing Parent**.                    |           |
| 9.1.3 | Completion warnings          | Households missing emergency contacts or billing parent show warning badges in the name cell. |           |

### 9.2 Search & Filter

| #     | What to Check             | Expected Result                                                                    | Pass/Fail |
| ----- | ------------------------- | ---------------------------------------------------------------------------------- | --------- |
| 9.2.1 | Type a name in search box | Table filters to matching households.                                              |           |
| 9.2.2 | Status filter dropdown    | Options: All Statuses, Active, Inactive, Archived. Selecting one filters the list. |           |

### 9.3 Click-Through

| #     | What to Check               | Expected Result                                              | Pass/Fail |
| ----- | --------------------------- | ------------------------------------------------------------ | --------- |
| 9.3.1 | Click a household name      | Navigates to `/en/households/{id}`. Detail page loads.       |           |
| 9.3.2 | Click a billing parent name | Navigates to `/en/parents/{id}`. Guardian detail page loads. |           |

---

## 10. Households — Detail Page

**URL:** `/en/households/{id}` (e.g., RAM TEST Family)

### 10.1 Header

| #      | What to Check  | Expected Result                                                             | Pass/Fail |
| ------ | -------------- | --------------------------------------------------------------------------- | --------- |
| 10.1.1 | Page loads     | Household name as heading (e.g., "RAM TEST Family"). Status badge (Active). |           |
| 10.1.2 | Action buttons | **Edit**, **Merge**, **Split** buttons visible.                             |           |

### 10.2 Metrics Row

| #      | What to Check | Expected Result                                                                                                           | Pass/Fail |
| ------ | ------------- | ------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.2.1 | Metrics       | Shows: **Students** (count), **Guardians** (count), **Emergency Contacts** (count). Label says "Guardians" NOT "Parents". |           |

### 10.3 Tabs

| #      | What to Check      | Expected Result                                                                                                                    | Pass/Fail |
| ------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.3.1 | Tab labels         | **Overview**, **Students (N)**, **Guardians (N)**, **Emergency Contacts**, **Finance (N)** — label says "Guardians" not "Parents". |           |
| 10.3.2 | Overview tab       | Shows Address and Billing Parent. Billing parent is a clickable link.                                                              |           |
| 10.3.3 | Incomplete warning | If household is missing emergency contact or billing parent, a yellow warning banner appears below metrics.                        |           |

---

## 11. Households — Guardians Tab

| #    | What to Check                         | Expected Result                                                                                                                                        | Pass/Fail |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 11.1 | Click **Guardians** tab               | Tab becomes active. Shows guardian count heading (e.g., "1 Guardian") and **Add Guardian** button.                                                     |           |
| 11.2 | Guardian list                         | Each guardian shows: clickable name link, relationship label (e.g., "(father)"), Primary/Billing badges, Set Billing button, Edit (pencil) icon.       |           |
| 11.3 | Click **Edit Guardian** (pencil icon) | "Edit Guardian" dialog opens. Form pre-populates with guardian's data: First Name, Last Name, Email, Phone, WhatsApp, Relationship, Preferred Contact. |           |
| 11.4 | Modify a field and click **Save**     | Toast shows "Guardian updated successfully". Dialog closes. Data refreshes.                                                                            |           |
| 11.5 | Click **Add Guardian**                | "Add Guardian" dialog opens with empty form: First Name, Last Name, Email, Phone, WhatsApp, Relationship, Preferred Contact.                           |           |
| 11.6 | Fill form and click **Save**          | Toast shows "Guardian saved successfully". Dialog closes. Guardian count increases. New guardian appears in list.                                      |           |
| 11.7 | Click **Set Billing** for a guardian  | Toast shows "Billing parent updated". Billing badge moves to selected guardian.                                                                        |           |
| 11.8 | Click guardian name link              | Navigates to `/en/parents/{id}`. Guardian detail page loads (see section 17).                                                                          |           |

---

## 12. Households — Add Student

| #    | What to Check                                     | Expected Result                                                                                                                                                  | Pass/Fail |
| ---- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | Click **Students** tab                            | Shows student list with **Add Student** button.                                                                                                                  |           |
| 12.2 | Click **Add Student**                             | "Add Student to {household name}" dialog opens.                                                                                                                  |           |
| 12.3 | Form fields                                       | First Name, Middle Name, Last Name (with family name placeholder), Date of Birth, Gender dropdown, Year Group dropdown, National ID, Nationality, City of Birth. |           |
| 12.4 | Required fields                                   | First Name, Date of Birth, Gender, Year Group, National ID are required (marked with \*).                                                                        |           |
| 12.5 | Fill form and click **Add Student & Assign Fees** | Toast shows "Student added and fees assigned". Dialog closes. Student count increases.                                                                           |           |

---

## 13. Households — Finance Tab & Statement PDF

| #    | What to Check                    | Expected Result                                                                                                                          | Pass/Fail |
| ---- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1 | Click **Finance** tab            | Shows invoice table with columns: Invoice #, Status, Total Amount, Balance, Due Date. Or "No invoices for this household."               |           |
| 13.2 | **View Statement** link          | A "View Statement" link appears above the invoice table.                                                                                 |           |
| 13.3 | Click **View Statement**         | Navigates to `/en/finance/statements/{householdId}`. Statement page loads with heading "Household Statement".                            |           |
| 13.4 | Statement page content           | Shows: Billing Parent name, Date filter (From/To), Ledger table with Opening Balance, transactions (invoices/payments), Closing Balance. |           |
| 13.5 | Date filter                      | Change the From or To date. Table updates to show transactions within the new range.                                                     |           |
| 13.6 | Click **Preview PDF**            | "Statement PDF" dialog opens. After a few seconds, PDF renders inside an iframe. Print and Download buttons become enabled.              |           |
| 13.7 | PDF content                      | The PDF shows: "ACCOUNT STATEMENT", school name, account holder, transaction table, closing balance.                                     |           |
| 13.8 | Click **Download** in PDF dialog | PDF file downloads to local machine.                                                                                                     |           |
| 13.9 | Click **Print** in PDF dialog    | Print dialog opens (browser's native print).                                                                                             |           |

---

## 14. Households — Merge

| #    | What to Check                              | Expected Result                                                                                                                                        | Pass/Fail |
| ---- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 14.1 | Click **Merge** button on household detail | "Merge Household" dialog opens.                                                                                                                        |           |
| 14.2 | Dialog content                             | Warning text: "All students, parents, and emergency contacts from this household will be moved to the target household. This action cannot be undone." |           |
| 14.3 | Target household selector                  | A searchable "Merge into" combobox is present.                                                                                                         |           |
| 14.4 | Confirm Merge disabled                     | **Confirm Merge** button is disabled until a target is selected.                                                                                       |           |
| 14.5 | Cancel                                     | Click Cancel or Close. Dialog closes without action.                                                                                                   |           |

---

## 15. Households — Split

| #    | What to Check                              | Expected Result                                                                                                                       | Pass/Fail |
| ---- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.1 | Click **Split** button on household detail | "Split Household" dialog opens.                                                                                                       |           |
| 15.2 | Dialog content                             | Description: "Create a new household by moving selected students and parents from this one."                                          |           |
| 15.3 | New Household Name                         | Text input with placeholder "e.g. The Smith Family".                                                                                  |           |
| 15.4 | Students to move                           | Checkboxes listing all students in the household.                                                                                     |           |
| 15.5 | Parents to move                            | Checkboxes listing all parents/guardians in the household.                                                                            |           |
| 15.6 | Emergency Contacts                         | Section for adding emergency contacts to the new household, with Name, Phone, Relationship fields. "Add" button to add more contacts. |           |
| 15.7 | Cancel                                     | Click Cancel or Close. Dialog closes without action.                                                                                  |           |

---

## 16. Households — Edit Page

**URL:** `/en/households/{id}/edit`

| #    | What to Check                      | Expected Result                                                                                                       | Pass/Fail |
| ---- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1 | Click **Edit** on household detail | Navigates to `/en/households/{id}/edit`. Edit form loads.                                                             |           |
| 16.2 | Pre-populated fields               | Household Name, Address Line 1, Address Line 2, City, Country, Postal Code — all pre-filled with current values.      |           |
| 16.3 | Modify and save                    | Change a field (e.g., city), click **Save Changes**. Toast shows success. Redirects to detail page with updated data. |           |

---

## 17. Guardian Detail Page

**URL:** `/en/parents/{id}`

| #    | What to Check                                           | Expected Result                                                                                                                                                        | Pass/Fail |
| ---- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.1 | Click a guardian name link from household Guardians tab | Navigates to `/en/parents/{id}`. Page loads with guardian name as heading. No "Cannot GET" error.                                                                      |           |
| 17.2 | Header                                                  | Guardian name, status badge (Active), relationship subtitle (e.g., "Mother").                                                                                          |           |
| 17.3 | Metrics row                                             | Email (dir="ltr"), Phone (dir="ltr"), Relationship.                                                                                                                    |           |
| 17.4 | Overview tab                                            | Shows: Primary Contact (Yes/No), Billing Contact (Yes/No), linked Households (clickable), linked Children/Students (clickable with student numbers and status badges). |           |

---

## 18. Households — Arabic / RTL

| #    | What to Check                     | Expected Result                                                                     | Pass/Fail |
| ---- | --------------------------------- | ----------------------------------------------------------------------------------- | --------- |
| 18.1 | Navigate to `/ar/households`      | Page loads in RTL. Heading "الأسر".                                                 |           |
| 18.2 | Navigate to `/ar/households/{id}` | Detail page in RTL. Metrics label shows "أولياء الأمور" (Guardians), not "Parents". |           |
| 18.3 | Guardians tab label               | Tab says "أولياء الأمور (N)" — Arabic translation of Guardians.                     |           |
| 18.4 | Edit/Merge/Split buttons          | Buttons show Arabic labels: تعديل, دمج, تقسيم.                                      |           |
| 18.5 | Guardian dialog                   | Click Add Guardian or Edit Guardian. Dialog title and field labels are in Arabic.   |           |
| 18.6 | Phone/email fields                | Phone and email fields have `dir="ltr"` even in Arabic mode.                        |           |

---

## Known Issues Tracked

| Issue                                                                                                                    | Status           | Notes                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Student detail page crashed with "Something went wrong"                                                                  | **FIXED**        | Homework analytics API response was not unwrapped from `{ data: ... }` envelope.                                                                                 |
| Student numbers included YYYYMM (e.g., STU-202603-000003)                                                                | **FIXED**        | Sequence service format simplified to STU-XXXXXX. Existing numbers migrated in DB.                                                                               |
| Household "Parents" tab not labelled as "Guardians"                                                                      | **FIXED**        | Tab, metrics, and all labels renamed to "Guardians" with Arabic translations.                                                                                    |
| No "Add Guardian" button on households                                                                                   | **FIXED**        | Added Add Guardian button and dialog with full form (name, email, phone, WhatsApp, relationship, contact channel).                                               |
| No edit functionality for guardians                                                                                      | **FIXED**        | Added Edit Guardian pencil button on each guardian row, with edit dialog that pre-populates from API.                                                            |
| Household statement PDF showing "Failed to load PDF"                                                                     | **FIXED**        | Two issues: (1) Template key mismatch (`'statement'` → `'household-statement'`), (2) Missing Chrome/Chromium dependencies on server for Puppeteer PDF rendering. |
| Some Arabic translations still showing English (e.g., "Students", "Emergency Contacts", "Overview", "Finance", "Active") | **Pre-existing** | These are pre-existing translation gaps unrelated to this session's changes. Should be addressed in a future i18n pass.                                          |
| `staff.fieldUser` showing as raw translation key on staff detail page                                                    | **Pre-existing** | Missing translation key in staff detail overview tab.                                                                                                            |
