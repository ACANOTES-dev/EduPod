# E2E Test Specification: Assessment — Dashboard (Teacher View)

> **Coverage:** This document covers **3 pages** within the Assessment section of the Learning hub:
>
> - Assessment Dashboard (`/en/assessments`) — teacher's landing page
> - Subject Workspace (`/en/assessments/workspace/{classId}/{subjectId}`) — per-allocation workspace
> - New Assessment (`/en/gradebook/{classId}/assessments/new`) — create assessment form
>
> Plus full sub-flows for: creating an assessment, editing dates, cancelling, rescheduling (duplicate), and the teacher-side configuration status panel.
>
> **School Pages Covered So Far:** 18 / 322

**Base URL:** `https://nhqs.edupod.app` (never use `nurul-huda.edupod.app`)
**Prerequisite:** Logged in as **Sarah Daly** (`sarah.daly@nhqs.test`), a **Teacher** role in tenant **Nurul Huda School (NHQS)**. After login you land on `/en/dashboard/teacher`.
**Navigation path to start:** Click **Learning** in the morph bar → click **Assessment** in the Learning sub-strip → click **Dashboard** in the Assessment sub-strip (first item, already active by default).

---

## Table of Contents

1. [Navigating to the Assessment Dashboard](#1-navigating-to-the-assessment-dashboard)
2. [Assessment Dashboard — Page Load](#2-assessment-dashboard--page-load)
3. [Assessment Dashboard — Summary Cards](#3-assessment-dashboard--summary-cards)
4. [Assessment Dashboard — My Teaching Allocations Table](#4-assessment-dashboard--my-teaching-allocations-table)
5. [Assessment Dashboard — Assessment Configuration Quick-Access](#5-assessment-dashboard--assessment-configuration-quick-access)
6. [Assessment Dashboard — My Configuration Status Panel](#6-assessment-dashboard--my-configuration-status-panel)
7. [Clicking into a Workspace (2A English)](#7-clicking-into-a-workspace-2a-english)
8. [Workspace — Header and Setup Status Cards](#8-workspace--header-and-setup-status-cards)
9. [Workspace — Recent Assessments Table](#9-workspace--recent-assessments-table)
10. [Workspace — Create Assessment Workflow](#10-workspace--create-assessment-workflow)
11. [Workspace — Edit Dates Workflow](#11-workspace--edit-dates-workflow)
12. [Workspace — Cancel Assessment Workflow](#12-workspace--cancel-assessment-workflow)
13. [Workspace — Reschedule (Duplicate) Workflow](#13-workspace--reschedule-duplicate-workflow)
14. [Workspace — Arabic / RTL](#14-workspace--arabic--rtl)

---

## 1. Navigating to the Assessment Dashboard

| #   | What to Check                                                         | Expected Result                                                                                                                                                         | Pass/Fail |
| --- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.1 | After login, verify you land on the Teacher home page                 | URL is `/en/dashboard/teacher`. Greeting reads **"Good [morning/afternoon/evening], Sarah"** with subtitle **"Here's your day at a glance."**                           |           |
| 1.2 | Inspect the morph bar                                                 | Only these hubs are visible for a Teacher: **Home**, **People**, **Learning**, **Wellbeing**, **Operations**, **Reports**. Finance/Regulatory/Settings are NOT visible. |           |
| 1.3 | Click the **Learning** hub button                                     | Browser navigates to `/en/classes`. A sub-strip appears with links: **Classes**, **Assessment**, **Homework**, **Attendance**.                                          |           |
| 1.4 | Click the **Assessment** link in the sub-strip                        | Browser navigates to `/en/assessments`. The Assessment link is highlighted as active.                                                                                   |           |
| 1.5 | Verify a secondary sub-strip (assessment-module nav) appears          | Below the Learning sub-strip, a second nav row appears with: **Dashboard**, **Gradebook**, **Report Cards**, **Analytics**. "Dashboard" is active.                      |           |
| 1.6 | Verify the right-side profile button reads **"Sarah Daly / Teacher"** | The "SD" initials circle is shown, and the role label reads **"Teacher"** (not "School Owner" or "Administrator").                                                      |           |

---

## 2. Assessment Dashboard — Page Load

**URL:** `/en/assessments`

| #   | What to Check                         | Expected Result                                                                                                                                                                                                                               | Pass/Fail |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1 | Page heading                          | An `<h1>` reads **"Assessment Dashboard"**.                                                                                                                                                                                                   |           |
| 2.2 | Page subtitle                         | Below the heading: **"View your teaching allocations and assessment setup status"**.                                                                                                                                                          |           |
| 2.3 | Wait up to 5 seconds for data to load | All sections (summary cards, allocations table, config quick-access cards, my config status panel) are populated. No infinite loading skeletons remain.                                                                                       |           |
| 2.4 | Browser console                       | No red errors related to `/api/v1/gradebook/teaching-allocations`, `/api/v1/gradebook/assessment-categories`, `/api/v1/gradebook/teacher-grading-weights`, `/api/v1/gradebook/rubric-templates`, or `/api/v1/gradebook/curriculum-standards`. |           |

---

## 3. Assessment Dashboard — Summary Cards

Four stat cards appear in a single row below the page header.

| #   | Card Label                        | Expected Value (for Sarah Daly, 2026-04)                                                                                      | Pass/Fail |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1 | **Total Allocations**             | A number representing how many (class, subject) pairs Sarah teaches. Expected: **14**.                                        |           |
| 3.2 | **Missing Config**                | A number counting allocations where any of grade config / approved categories / approved weights is missing. Expected: **4**. |           |
| 3.3 | **Approved Weights**              | Fraction in the form `X/Y` where Y = Total Allocations and X = allocations with approved weights. Expected: **10/14**.        |           |
| 3.4 | **Total Assessments**             | Sum of `assessment_count` across all allocations. Expected: **9**.                                                            |           |
| 3.5 | Values are real, not placeholders | All four cards must show real numbers. If any shows a dash, skeleton, or `0/0`, the API failed.                               |           |

---

## 4. Assessment Dashboard — My Teaching Allocations Table

Below the summary cards, a table titled implicitly (no heading, just the helper text **"Click a row to manage assessments for that allocation"**).

### 4.1 Table structure

| #     | What to Check                                             | Expected Result                                                                                                                                                                     | Pass/Fail |
| ----- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1.1 | Column headers (left to right)                            | **Class**, **Subject**, **Year Group** (hidden on mobile), **Grade Config**, **Assessment Categories**, **Weights**, **Assessments**, then an empty action column on the far right. |           |
| 4.1.2 | Row count                                                 | One row per teaching allocation. For Sarah Daly: **14 rows**.                                                                                                                       |           |
| 4.1.3 | First and last row (alphabetical by class name + subject) | Rows are sorted by the order the API returns them (teaching allocation order). Typical order starts with K1A / Arabic and ends with 5B / Biology.                                   |           |

### 4.2 Column content — verify a known row (2A English)

| #     | What to Check                                                                | Expected Result                                                                                                   | Pass/Fail |
| ----- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 4.2.1 | Locate the row whose **Class** is `2A` and **Subject** starts with `English` | The row exists exactly once.                                                                                      |           |
| 4.2.2 | **Class** cell                                                               | Reads **2A**, and is a clickable link.                                                                            |           |
| 4.2.3 | **Subject** cell                                                             | Reads **English**, followed by a small monospace code in parentheses: **(ENG)**.                                  |           |
| 4.2.4 | **Year Group** cell                                                          | Reads **2nd class** (hidden on mobile width).                                                                     |           |
| 4.2.5 | **Grade Config** cell                                                        | Shows a green check icon (✓) — this allocation has a grade config.                                                |           |
| 4.2.6 | **Assessment Categories** cell                                               | Shows a Badge with the number **4**. Green background because value > 0.                                          |           |
| 4.2.7 | **Weights** cell                                                             | Shows a green check icon (✓) — weights are approved.                                                              |           |
| 4.2.8 | **Assessments** cell                                                         | Shows the number **9** in monospace, right-aligned.                                                               |           |
| 4.2.9 | On hover, the rightmost "external link" icon fades in                        | An `<ExternalLink>` icon appears on the far right of the hovered row, as an affordance that the row is clickable. |           |

### 4.3 Incomplete allocations

| #     | What to Check                                                    | Expected Result                                                                                                                                               | Pass/Fail |
| ----- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.3.1 | Find any row where **Grade Config** shows a red X icon           | These allocations are counted in the "Missing Config" summary card. (In the Nurul Huda tenant, rows for Arabic and Business subjects have incomplete config.) |           |
| 4.3.2 | Find any row where the **Assessment Categories** badge shows `0` | The badge background is yellow (warning variant) instead of green.                                                                                            |           |
| 4.3.3 | **Missing Config** count math check                              | Count all rows where ANY of (Grade Config ✗, Categories = 0, Weights ✗) is true. The count MUST equal the "Missing Config" summary card value.                |           |

### 4.4 Mobile view (<640px viewport)

| #     | What to Check                  | Expected Result                                                                                                                                                                                                          | Pass/Fail |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 4.4.1 | Shrink viewport to 375px width | The table disappears and is replaced with stacked cards. Each card shows Class name, Subject (with code), Year Group, three small setup-status squares (Grade Config / Categories / Weights), and the Assessments count. |           |
| 4.4.2 | Tap a mobile card              | Same behaviour as clicking a desktop row — navigates to the Subject Workspace.                                                                                                                                           |           |

---

## 5. Assessment Dashboard — Assessment Configuration Quick-Access

A section below the allocations table, with the heading **"Assessment Configuration"**.

| #   | Card                  | Link                                | Expected Icon | Count Badge                         | Pass/Fail |
| --- | --------------------- | ----------------------------------- | ------------- | ----------------------------------- | --------- |
| 5.1 | Assessment Categories | `/assessments/categories`           | BookOpen      | `{approved}/{total}` — e.g. **4/4** |           |
| 5.2 | Grading Weights       | `/assessments/grading-weights`      | Scale         | total count — e.g. **18**           |           |
| 5.3 | Rubric Templates      | `/assessments/rubric-templates`     | ClipboardList | total count — e.g. **0**            |           |
| 5.4 | Curriculum Standards  | `/assessments/curriculum-standards` | Target        | total count — e.g. **1**            |           |

| #    | What to Check                        | Expected Result                                                                                             | Pass/Fail |
| ---- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | --------- |
| 5.5  | Each card has a description line     | Short one-liner below the title explaining the purpose (e.g. "Define assessment types and scopes").         |           |
| 5.6  | Click **Assessment Categories** card | Navigates to `/en/assessments/categories`. The page title is **"Assessment Categories"**. Use browser Back. |           |
| 5.7  | Click **Grading Weights** card       | Navigates to `/en/assessments/grading-weights`. Use browser Back to return.                                 |           |
| 5.8  | Click **Rubric Templates** card      | Navigates to `/en/assessments/rubric-templates`. Use browser Back to return.                                |           |
| 5.9  | Click **Curriculum Standards** card  | Navigates to `/en/assessments/curriculum-standards`. Use browser Back to return.                            |           |
| 5.10 | Hover state                          | Card border changes to primary-300 on hover; cursor becomes pointer.                                        |           |

---

## 6. Assessment Dashboard — My Configuration Status Panel

Below the quick-access cards, a heading reads **"My Configuration Status"**.

### 6.1 Tab bar

| #     | What to Check                                   | Expected Result                                                                                                                                                   | Pass/Fail |
| ----- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1.1 | Four tab buttons appear horizontally            | **Assessment Categories (4)**, **Weights (18)**, **Rubric Templates (0)**, **Curriculum Standards (1)**. Number in parentheses is the count of items in that tab. |           |
| 6.1.2 | The first tab (Assessment Categories) is active | Its label is in primary colour; a primary-coloured bottom border underlines the active tab.                                                                       |           |

### 6.2 Assessment Categories tab content

| #     | What to Check                               | Expected Result                                                                                                                                         | Pass/Fail |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.2.1 | Table columns                               | **Name**, **Status**, **Rejection Reason**.                                                                                                             |           |
| 6.2.2 | Rows                                        | At least 4 rows: **End of Term Test**, **Homework**, **Mid-Term Test**, **Weekly Class Test**. Each shows Status **Approved** (green dot badge).        |           |
| 6.2.3 | Rejection Reason column for an Approved row | Shows an em-dash (—) because there is no rejection reason.                                                                                              |           |
| 6.2.4 | Sort order                                  | Items are sorted by status priority: `pending_approval` > `rejected` > `draft` > `approved` > `archived`. Approved rows sink to the bottom of the list. |           |

### 6.3 Weights tab

| #     | What to Check                                                | Expected Result                                                                            | Pass/Fail |
| ----- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | --------- |
| 6.3.1 | Click the **Weights (18)** tab                               | Tab becomes active; table content switches to weights.                                     |           |
| 6.3.2 | Table shows one row per (Subject / Year Group) weight config | **Name** column format: `{subject_name} / {year_group_name}` (e.g. `English / 2nd class`). |           |
| 6.3.3 | All entries show Status **Approved**                         | Green Approved badge. Rejection reason is em-dash.                                         |           |

### 6.4 Rubric Templates tab

| #     | What to Check                  | Expected Result                                                                                                                   | Pass/Fail |
| ----- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.4.1 | Click **Rubric Templates (0)** | Tab becomes active; content area shows the message **"No configuration items"** inside a bordered 2xl card. No table is rendered. |           |

### 6.5 Curriculum Standards tab

| #     | What to Check                      | Expected Result                                                                       | Pass/Fail |
| ----- | ---------------------------------- | ------------------------------------------------------------------------------------- | --------- |
| 6.5.1 | Click **Curriculum Standards (1)** | Tab becomes active; the single standard row appears with its code in the Name column. |           |

---

## 7. Clicking into a Workspace (2A English)

The Workspace is the per-allocation detail page. From the Assessment Dashboard we enter it by clicking into a teaching allocation row.

| #   | What to Check                                                                                 | Expected Result                                                                                                                                                                           | Pass/Fail |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1 | From the allocations table, click the row for **2A / English(ENG)**                           | Browser navigates to `/en/assessments/workspace/{classId}/{subjectId}`. (The URL contains two UUIDs — the class id and the subject id.)                                                   |           |
| 7.2 | Alternative: click just the **Class** cell text or the **Subject** cell text                  | Each cell is an anchor wrapping the text; clicking any of them goes to the same workspace URL.                                                                                            |           |
| 7.3 | Alternative: click the **external-link** icon that fades in on hover                          | Also navigates to the workspace URL.                                                                                                                                                      |           |
| 7.4 | The Assessment sub-strip (**Dashboard / Gradebook / Report Cards / Analytics**) stays visible | The workspace page is a child of the Assessment section, so its sub-strip must still be rendered. Dashboard link is no longer active because the URL is now `/assessments/workspace/...`. |           |

---

## 8. Workspace — Header and Setup Status Cards

**URL:** `/en/assessments/workspace/{classId}/{subjectId}` — example `/en/assessments/workspace/76ce55f7.../37fb608d...`

### 8.1 Header row

| #     | What to Check                            | Expected Result                                                                                                                                                                            | Pass/Fail |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 8.1.1 | Page heading                             | Large heading reads **"{class_name} — {subject_name}"** — for example **"2A — English"**.                                                                                                  |           |
| 8.1.2 | Page description                         | Below the heading, a small text line shows the year group — for example **"2nd class"**.                                                                                                   |           |
| 8.1.3 | **Create Assessment** button (top right) | Primary-coloured button with a `+` icon and text "Create Assessment". It is ONLY rendered when setup is complete (grade config ✓, approved categories > 0, approved weights ✓).            |           |
| 8.1.4 | Setup warning banner                     | If setup is incomplete, an amber warning banner appears between the header and the setup cards, with the message "Setup incomplete" and a longer description. The Create button is hidden. |           |

### 8.2 Setup Status section

A small-caps heading reads **"SETUP STATUS"**. Below it, three cards in a grid.

| #     | Card Label              | Expected Content (for 2A English)                                                                | Pass/Fail |
| ----- | ----------------------- | ------------------------------------------------------------------------------------------------ | --------- |
| 8.2.1 | **Grade Config**        | Green check icon (✓) and the text **"Configured"**.                                              |           |
| 8.2.2 | **Approved Categories** | A green Badge with the number **4**, followed by the text **"Approved"**.                        |           |
| 8.2.3 | **Approved Weights**    | Green check icon (✓) and the text **"Configured"**.                                              |           |
| 8.2.4 | If setup is incomplete  | Ok icons become red X (`<XCircle>`), counts become 0, and the Create Assessment button vanishes. |           |

---

## 9. Workspace — Recent Assessments Table

A small-caps heading reads **"RECENT ASSESSMENTS"** below the Setup Status section.

### 9.1 Table columns and row structure

| #     | What to Check | Expected Result                                                                                                     | Pass/Fail |
| ----- | ------------- | ------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1.1 | Columns       | **Title**, **Status**, **Max Score** (right-aligned), **Due Date**, **Actions** (right-aligned).                    |           |
| 9.1.2 | Page size     | Up to **10** assessments are shown. No pagination control.                                                          |           |
| 9.1.3 | Sort order    | As returned by the API — typically most-recently created first, but includes both active and cancelled assessments. |           |
| 9.1.4 | Empty state   | If the allocation has 0 assessments, a bordered card with a LayoutGrid icon reads **"No assessments yet"**.         |           |

### 9.2 Status badge variants

Each row shows a StatusBadge using the following status → variant mapping:

| Status (backend)   | Display Label (EN) | Badge Variant | Pass/Fail |
| ------------------ | ------------------ | ------------- | --------- |
| `draft`            | Draft              | warning       |           |
| `open`             | Open               | info          |           |
| `closed`           | Cancelled          | danger        |           |
| `submitted_locked` | Submitted          | success       |           |
| `unlock_requested` | Unlock Requested   | warning       |           |
| `reopened`         | Reopened           | info          |           |
| `final_locked`     | Final Locked       | neutral       |           |

### 9.3 Cancelled row helper text

| #     | What to Check                                                   | Expected Result                                                                                                                               | Pass/Fail |
| ----- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.3.1 | Any row with status **Cancelled**                               | Below the title, a small grey line reads **"Reason: {cancellation_reason}"** — for example `Reason: School closure due to weather emergency`. |           |
| 9.3.2 | Cancelled rows show a **Reschedule** button in the Actions cell | An outline Button labelled **"Reschedule"** with a Copy icon, instead of the kebab menu.                                                      |           |

### 9.4 Non-cancelled row actions (kebab menu)

| #     | What to Check                                                                                                   | Expected Result                                                                                                              | Pass/Fail |
| ----- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.4.1 | On any non-cancelled non-final-locked row, the Actions cell shows a ghost button with a vertical three-dot icon | This is the kebab menu. Clicking it opens a Radix DropdownMenu.                                                              |           |
| 9.4.2 | DropdownMenu items for `draft` / `open` / `reopened` statuses                                                   | Two items: **"Edit Dates"** (with CalendarDays icon) and **"Cancel Assessment"** (with Trash2 icon, destructive red colour). |           |
| 9.4.3 | DropdownMenu items for `submitted_locked` / `unlock_requested`                                                  | ONLY one item: **"Cancel Assessment"**. "Edit Dates" is hidden because dates are locked after submission.                    |           |
| 9.4.4 | Final-locked row                                                                                                | No kebab menu at all; the Actions cell shows an em-dash (—).                                                                 |           |

---

## 10. Workspace — Create Assessment Workflow

### 10.1 Opening the New Assessment form

| #      | What to Check                                                  | Expected Result                                                                                                                       | Pass/Fail |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1.1 | Click the **Create Assessment** button in the workspace header | Browser navigates to `/en/gradebook/{classId}/assessments/new?subject_id={subjectId}`. The URL includes the `subject_id` query param. |           |
| 10.1.2 | Page heading                                                   | Reads **"New Assessment"** with a back button to its left.                                                                            |           |
| 10.1.3 | Subject field                                                  | A combobox pre-populated with **English** (read-only / locked to the URL's subject_id).                                               |           |

### 10.2 Form fields

| #      | Field                     | Type                  | Initial Value / Placeholder          | Required?     | Pass/Fail |
| ------ | ------------------------- | --------------------- | ------------------------------------ | ------------- | --------- |
| 10.2.1 | Title                     | Text input            | Placeholder: **"e.g. Midterm Exam"** | Yes           |           |
| 10.2.2 | Subject                   | Combobox (pre-filled) | **English**                          | Yes           |           |
| 10.2.3 | Period                    | Combobox              | Placeholder: **"Select period"**     | Yes           |           |
| 10.2.4 | Category                  | Combobox              | Placeholder: **"Select category"**   | Yes           |           |
| 10.2.5 | Max Score                 | Number spinbutton     | Default: **100**                     | Yes           |           |
| 10.2.6 | Due Date                  | Date input            | Empty                                | Yes           |           |
| 10.2.7 | Grading Deadline          | Date input            | Empty                                | No (optional) |           |
| 10.2.8 | Counts toward report card | Checkbox              | Checked by default                   | —             |           |

### 10.3 Period dropdown options

| #      | What to Check             | Expected Result                                                                      | Pass/Fail |
| ------ | ------------------------- | ------------------------------------------------------------------------------------ | --------- |
| 10.3.1 | Click the Period combobox | A listbox appears with the active academic year's periods. For NHQS: **S1**, **S2**. |           |
| 10.3.2 | Select **S1**             | The combobox now displays "S1"; the listbox closes.                                  |           |

### 10.4 Category dropdown options

| #      | What to Check               | Expected Result                                                                                                                       | Pass/Fail |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.4.1 | Click the Category combobox | Listbox shows the approved categories for this subject: **End of Term Test**, **Homework**, **Mid-Term Test**, **Weekly Class Test**. |           |
| 10.4.2 | Select **Homework**         | Combobox now displays "Homework".                                                                                                     |           |

### 10.5 Create button gate

| #      | What to Check                                                                                                    | Expected Result                                                                                                                                                               | Pass/Fail |
| ------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.5.1 | Before filling in required fields, check the **Create** button                                                   | **Create** is DISABLED (greyed out, not clickable).                                                                                                                           |           |
| 10.5.2 | Fill Title = `E2E TEST Assessment - DELETE ME`, Period = `S1`, Category = `Homework`, Due Date = today + 30 days | All fields accept input without error.                                                                                                                                        |           |
| 10.5.3 | Verify Create button state                                                                                       | The **Create** button becomes ENABLED.                                                                                                                                        |           |
| 10.5.4 | Click **Create**                                                                                                 | HTTP POST to `/api/v1/gradebook/assessments`. On success, the browser redirects to `/en/gradebook/{classId}` (the class gradebook workspace).                                 |           |
| 10.5.5 | Verify the new assessment exists                                                                                 | On the class gradebook workspace (`/en/gradebook/{classId}`), find a row with title **"E2E TEST Assessment - DELETE ME"** under the English section. Its status is **Draft**. |           |

### 10.6 Cancel button behaviour

| #      | What to Check                          | Expected Result                                                                       | Pass/Fail |
| ------ | -------------------------------------- | ------------------------------------------------------------------------------------- | --------- |
| 10.6.1 | Open New Assessment form again         | Navigate to `/en/gradebook/{classId}/assessments/new`                                 |           |
| 10.6.2 | Fill Title only, then click **Cancel** | Form discards without saving; browser returns to the previous URL. No record created. |           |

---

## 11. Workspace — Edit Dates Workflow

Edit Dates is only available on the Workspace page (not on the class gradebook's Assessments tab). The target assessment must be in `draft`, `open`, or `reopened` state.

| #    | What to Check                                                                                  | Expected Result                                                                                                                                                                                                                                | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1 | Navigate back to `/en/assessments/workspace/{classId}/{subjectId}`                             | Workspace page shows the updated Recent Assessments list including the newly created **E2E TEST Assessment - DELETE ME** row (status: Draft).                                                                                                  |           |
| 11.2 | Click the kebab menu on the **E2E TEST Assessment** row                                        | DropdownMenu opens with **"Edit Dates"** and **"Cancel Assessment"**.                                                                                                                                                                          |           |
| 11.3 | Click **Edit Dates**                                                                           | A modal dialog appears with the title **"Edit dates"** (or similar), and two date inputs: **Due Date** (pre-filled with the existing date, in `YYYY-MM-DD` format) and **Grading Deadline** (empty).                                           |           |
| 11.4 | Change Due Date to a new value (e.g. today + 45 days) and set Grading Deadline to 7 days after | Both inputs accept the change.                                                                                                                                                                                                                 |           |
| 11.5 | Click **Save**                                                                                 | HTTP PATCH to `/api/v1/gradebook/assessments/{id}` with the two fields. On success, a toast reads **"Saved"** (or the common "saved" translation), the dialog closes, the table reloads, and the row's Due Date column reflects the new value. |           |
| 11.6 | Click **Cancel** in the dialog instead                                                         | Dialog closes; no PATCH is made; the table is unchanged.                                                                                                                                                                                       |           |

---

## 12. Workspace — Cancel Assessment Workflow

| #    | What to Check                                                       | Expected Result                                                                                                                                                                                                          | Pass/Fail |
| ---- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 12.1 | Click the kebab menu on the **E2E TEST Assessment - DELETE ME** row | DropdownMenu opens.                                                                                                                                                                                                      |           |
| 12.2 | Click **Cancel Assessment**                                         | A modal dialog appears with title **"Cancel Assessment"** and description **"Please provide a reason for cancelling this assessment. This cannot be undone."**.                                                          |           |
| 12.3 | Inspect the reason textarea                                         | Placeholder text reads **"e.g. School closure due to weather, exam rescheduled..."**. Empty by default.                                                                                                                  |           |
| 12.4 | Inspect the confirm button                                          | Labelled **"Confirm Cancellation"** (destructive/red variant). It is DISABLED while the textarea is empty.                                                                                                               |           |
| 12.5 | Type a reason: **`E2E test cleanup`**                               | The confirm button becomes ENABLED.                                                                                                                                                                                      |           |
| 12.6 | Click **Confirm Cancellation**                                      | HTTP PATCH to `/api/v1/gradebook/assessments/{id}/status` with body `{status: "closed", cancellation_reason: "E2E test cleanup"}`. On success: dialog closes, toast reads **"Assessment cancelled"**, the table reloads. |           |
| 12.7 | Verify the row has updated                                          | The E2E TEST row now shows status **Cancelled** (danger variant), and below its title it shows **"Reason: E2E test cleanup"**. The Actions column is now a **Reschedule** button, not a kebab menu.                      |           |
| 12.8 | Click **Cancel** in the dialog (negative path)                      | Dialog closes; no API call; the table is unchanged. Re-open the dialog and try again.                                                                                                                                    |           |

---

## 13. Workspace — Reschedule (Duplicate) Workflow

Reschedule creates a copy of the cancelled assessment as a new draft, then opens the Edit Dates dialog so the teacher can set fresh dates.

| #    | What to Check                                                                      | Expected Result                                                                                                                                                                                     | Pass/Fail |
| ---- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1 | On the cancelled row, click **Reschedule**                                         | HTTP POST to `/api/v1/gradebook/assessments/{id}/duplicate`. On success, a toast reads **"Assessment rescheduled"** (or similar), the table reloads showing the new draft row.                      |           |
| 13.2 | Immediately after POST, the Edit Dates dialog auto-opens                           | The dialog is pre-populated with empty Due Date and Grading Deadline (so the teacher is forced to set new dates).                                                                                   |           |
| 13.3 | Set Due Date = today + 14 days, Grading Deadline = today + 21 days, click **Save** | PATCH to `/api/v1/gradebook/assessments/{newId}` with the two dates. Toast "Saved". Dialog closes.                                                                                                  |           |
| 13.4 | Verify the duplicated row                                                          | A new row appears in the table with the same title as the original, status **Draft**, Max Score the same, Due Date reflecting the new date. The original cancelled row still exists above/below it. |           |
| 13.5 | Cleanup — cancel the duplicated row too                                            | Follow the cancellation flow in section 12 with reason **"E2E test cleanup"** to remove the reschedule artefact.                                                                                    |           |
| 13.6 | Error path: click Reschedule on a cancelled row while offline                      | Toast reads **"Reschedule failed"** (or similar); the table does not change.                                                                                                                        |           |

---

## 14. Workspace — Arabic / RTL

| #    | What to Check                                                           | Expected Result                                                                                                                                     | Pass/Fail |
| ---- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.1 | Open the user profile menu and toggle to **Arabic**                     | URL changes from `/en/...` to `/ar/...`. All visible text becomes Arabic script.                                                                    |           |
| 14.2 | Verify overall layout flips to RTL                                      | The back button is on the right. The Create Assessment button is on the left. The morph-bar hubs flow right-to-left. Sub-strip flows right-to-left. |           |
| 14.3 | Numeric fields (Max Score, Due Date) still render LTR                   | Numbers and dates are displayed in Western digits (0-9) within LTR `dir` wrappers.                                                                  |           |
| 14.4 | Open the New Assessment form in Arabic                                  | All field labels and placeholders are in Arabic. The Category dropdown options are still English (category names are not translated).               |           |
| 14.5 | Create + Cancel buttons in forms are still labelled correctly in Arabic | No missing-translation fallbacks. If "common.save" / "common.cancel" are missing, the keys would leak — this is a FAIL.                             |           |
| 14.6 | Toggle back to **English**                                              | URL returns to `/en/...`. Layout flips to LTR. All previous state is preserved.                                                                     |           |

---

## End of Spec

Once all rows above show Pass, the Teacher Assessment Dashboard and per-allocation Workspace (including the full Create → Edit → Cancel → Reschedule lifecycle) are verified.
