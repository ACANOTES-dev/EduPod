# E2E Test Specification: Assessment — Analytics (Admin View)

> **Coverage:** This document covers the Assessment Analytics page (`/en/analytics`) from an administrator's perspective. The same component and URL render for both teachers and admins, but the data scope differs materially:
>
> - Teachers see only classes they teach (filtered via the `classes` API as the current user)
> - **Admins see every active class in the tenant** (16 for NHQS vs 3 for a typical teacher)
>
> All three view modes (Class Overview, Subject Deep Dive, Student Profile) are reachable for admin with no ownership restrictions, across any class, any period, any student.

**Base URL:** `https://nhqs.edupod.app`
**Prerequisite:** Logged in as **Yusuf Rahman** (`owner@nhqs.test` / `Password123!`), School Owner role in **Nurul Huda School (NHQS)**.
**Navigation path:** Learning → Assessment → **Analytics** (fourth Assessment sub-strip item).
**Key principle:** Admin gets the full tenant picture — filter by any class, period, subject, or student without ownership gating.

---

## Table of Contents

1. [Navigating to Analytics as Admin](#1-navigating-to-analytics-as-admin)
2. [Page Load and Class Selector — Admin Scope](#2-page-load-and-class-selector--admin-scope)
3. [After Selecting a Class — Filter Bar](#3-after-selecting-a-class--filter-bar)
4. [View Modes — Admin Coverage](#4-view-modes--admin-coverage)
5. [Class Overview — Stats Row (Admin)](#5-class-overview--stats-row-admin)
6. [Class Overview — Grade Distribution Chart](#6-class-overview--grade-distribution-chart)
7. [Class Overview — Average Score by Subject](#7-class-overview--average-score-by-subject)
8. [Class Overview — Top 5 / Bottom 5](#8-class-overview--top-5--bottom-5)
9. [Class Overview — Full Student Rankings](#9-class-overview--full-student-rankings)
10. [Subject Deep Dive (Admin)](#10-subject-deep-dive-admin)
11. [Student Profile (Admin)](#11-student-profile-admin)
12. [Student Profile — Radar Chart](#12-student-profile--radar-chart)
13. [Student Profile — Strengths and Areas for Improvement](#13-student-profile--strengths-and-areas-for-improvement)
14. [Student Profile — Grade Summary Table](#14-student-profile--grade-summary-table)
15. [All Periods (Year Overview) Mode](#15-all-periods-year-overview-mode)
16. [Cross-Class Exploration Workflow](#16-cross-class-exploration-workflow)
17. [Error and Empty States](#17-error-and-empty-states)
18. [Arabic / RTL](#18-arabic--rtl)
19. [Role Gating Sanity Check](#19-role-gating-sanity-check)

---

## 1. Navigating to Analytics as Admin

| #   | What to Check                                                        | Expected Result                                                                                                                                                              | Pass/Fail |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1.1 | From the Leadership Assessment Dashboard, click the **Jump-to** card | Find the "Grade analytics" jump card at the bottom of `/en/assessments`. Clicking it navigates to `/en/analytics`. Alternative entry: Assessment sub-strip → Analytics link. |           |
| 1.2 | Direct navigation via Assessment sub-strip                           | Assessment sub-strip shows four items (Dashboard, Gradebook, Report Cards, Analytics). Click **Analytics**. Lands on `/en/analytics`. The Analytics link is active.          |           |
| 1.3 | Page header                                                          | A small **BarChart2** icon in `text-primary-600` sits next to an `<h1>` that reads **"Analytics"** (localised via `gradebook.analytics`).                                    |           |

---

## 2. Page Load and Class Selector — Admin Scope

**URL:** `/en/analytics`

| #   | What to Check                      | Expected Result                                                                                                                                                                                                                                                                | Pass/Fail |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 2.1 | Page load                          | Two skeleton rounded-xl boxes appear for ~500ms, then the class selector renders.                                                                                                                                                                                              |           |
| 2.2 | Class selector                     | Single Select component below the page header. Trigger text defaults to **"Select a class"**. Width `w-full sm:w-56`.                                                                                                                                                          |           |
| 2.3 | Before a class is selected         | Body area shows a centred empty state: large faded **BarChart2** icon and text **"Select a class to view grade analytics."**                                                                                                                                                   |           |
| 2.4 | Click the class selector           | A listbox opens showing one option per **active** class in the tenant. Data source: `GET /api/v1/classes?pageSize=100&status=active`. Sorted alphabetically by class name.                                                                                                     |           |
| 2.5 | **Admin sees all 16 NHQS classes** | For NHQS, the dropdown must list: **1A**, **1B**, **2A**, **2B**, **3A**, **3B**, **4A**, **4B**, **5A**, **5B**, **6A**, **6B**, **J1A**, **K1A**, **K1B**, **SF1A**. This is the key difference from the teacher view, which would only show the teacher's assigned classes. |           |
| 2.6 | Select a class with data (**2A**)  | Trigger updates to "2A". The `<AnalyticsTab>` component mounts with `key={classId}` so switching classes resets internal state (period, subject, student).                                                                                                                     |           |
| 2.7 | Browser console                    | No red errors from `/api/v1/classes`, `/api/v1/gradebook/classes/{id}/allocations`, `/api/v1/academic-periods`, or `/api/v1/gradebook/period-grades/cross-subject`.                                                                                                            |           |
| 2.8 | Permission scope                   | The `/v1/classes` endpoint requires `students.view` permission which admins hold. The response is tenant-scoped via RLS, so admins see the complete active-class list without leaking across tenants.                                                                          |           |

---

## 3. After Selecting a Class — Filter Bar

Once a class is selected, `<AnalyticsTab>` renders a filter bar at the top. A placeholder `<p>` appears below until a period is chosen.

### 3.1 Period dropdown

| #     | What to Check                                | Expected Result                                                                                                                                                                                           | Pass/Fail |
| ----- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1.1 | Placeholder                                  | **"Period"**.                                                                                                                                                                                             |           |
| 3.1.2 | Options                                      | **All Periods** (first), then one option per academic period in the class's academic year. Loaded via `/api/v1/academic-periods?academic_year_id={yearId}`. For NHQS 2A: **All Periods**, **S1**, **S2**. |           |
| 3.1.3 | When Period is empty, body shows placeholder | Paragraph: **"Select a period to view analytics."** No charts or tables rendered.                                                                                                                         |           |

### 3.2 Subject dropdown

| #     | What to Check | Expected Result                                                                                                                                                                                                                                                                                             | Pass/Fail |
| ----- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.2.1 | Placeholder   | **"Subject"**. Default value: **"all"** (All Subjects).                                                                                                                                                                                                                                                     |           |
| 3.2.2 | Options       | **All Subjects** (first), then one option per subject taught in this class. Source: `/api/v1/gradebook/classes/{classId}/allocations`, deduplicated, alphabetical.                                                                                                                                          |           |
| 3.2.3 | 2A options    | **All Subjects**, **Biology**, **Chemistry**, **English**, **Geography**, **History**, **Mathematics** (note: **Economics** may be missing from the subject filter if the allocations endpoint doesn't return it — assessments exist but no teaching allocation record — see gradebook admin spec §5.1.10). |           |

### 3.3 Student dropdown (only appears after data loads)

| #     | What to Check                                           | Expected Result                                                                                                                         | Pass/Fail |
| ----- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.3.1 | After Period and data load, a third Select appears      | Placeholder **"Student"**. First option **"All Students"** (value `__none`). Below: every student in the matrix, sorted alphabetically. |           |
| 3.3.2 | Changing Period or Subject clears the student selection | onChange handlers for Period and Subject reset `studentId = ''`.                                                                        |           |

---

## 4. View Modes — Admin Coverage

The AnalyticsTab derives the active view from the filter state. Admin reaches all three identically to teacher, except admin can reach them for **every** class.

| #   | Filters (Subject / Student)              | View Mode             | What Renders                                                                                                                     | Pass/Fail |
| --- | ---------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1 | Subject = **all**, Student = (none)      | **Class Overview**    | Stats + Grade Distribution + Subject Averages + Top/Bottom + Rankings table                                                      |           |
| 4.2 | Subject = **specific**, Student = (none) | **Subject Deep Dive** | Subject-specific stats + Grade Distribution + Student Scores bar chart + subject-specific Top/Bottom + subject-specific Rankings |           |
| 4.3 | Student = **specific**                   | **Student Profile**   | Student header card + Radar chart (if ≥3 subjects) + Strengths/Improvements + Grade Summary table                                |           |

---

## 5. Class Overview — Stats Row (Admin)

Triggered by: Class 2A + Period S1 + Subject All + Student None.

A row of six StatCard components. Grid: 2 cols mobile, 3 at `sm:`, 6 at `lg:`.

| #   | Label       | Source                                                                                            | Format                                                                                                             | Pass/Fail |
| --- | ----------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------- |
| 5.1 | Mean        | Arithmetic mean of students' overall scores (Class Overview) or subject-column scores (Deep Dive) | `{value}%` (1 decimal)                                                                                             |           |
| 5.2 | Median      | Median of same dataset                                                                            | `{value}%`                                                                                                         |           |
| 5.3 | Std Dev     | Standard deviation                                                                                | Raw number (2 decimals)                                                                                            |           |
| 5.4 | Pass Rate   | Percentage of students with score >= 60                                                           | `{value}%`. Accent: green if >= 60, red otherwise.                                                                 |           |
| 5.5 | Highest     | Max score                                                                                         | `{value}%`, green accent                                                                                           |           |
| 5.6 | Lowest      | Min score                                                                                         | `{value}%`, red accent                                                                                             |           |
| 5.7 | Empty state | If the selected class/period has no grade data                                                    | All six StatCards display **"—"**. Body shows **"No grade data available for this selection."** instead of charts. |           |

---

## 6. Class Overview — Grade Distribution Chart

Bordered Section card titled **"Grade Distribution"**.

| #   | What to Check          | Expected Result                                                                                                                                                                                                                          | Pass/Fail |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1 | Chart type             | Recharts vertical BarChart. 5 bars — one per letter grade.                                                                                                                                                                               |           |
| 6.2 | X axis                 | Categorical ticks **A**, **B**, **C**, **D**, **F**. Bold, size 13.                                                                                                                                                                      |           |
| 6.3 | Y axis                 | Numeric axis, `allowDecimals={false}`. Shows student counts.                                                                                                                                                                             |           |
| 6.4 | Bar colours            | A = `#22c55e` (green). B = `#3b82f6` (blue). C = `#f59e0b` (amber). D = `#f97316` (orange). F = `#ef4444` (red).                                                                                                                         |           |
| 6.5 | Tooltip on hover       | Custom tooltip reads **"{count} students"** (or "student" singular) with label **"Count"**.                                                                                                                                              |           |
| 6.6 | Legend below chart     | Five coloured dots with "A: {count}", "B: {count}", etc.                                                                                                                                                                                 |           |
| 6.7 | Grade derivation rules | If backend provides a `display` string that's NOT a percentage, use it directly. Otherwise map percentage to letter: `>=90 → A`, `>=81 → B`, `>=71 → C`, `>=60 → D`, `<60 → F`. Null becomes `N/A` and is excluded from the chart count. |           |

---

## 7. Class Overview — Average Score by Subject

Second chart in a 2-column grid on large screens. Only rendered when **Subject = all**.

| #   | What to Check               | Expected Result                                                                                                      | Pass/Fail |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1 | Section title               | **"Average Score by Subject"**.                                                                                      |           |
| 7.2 | Chart type                  | Horizontal BarChart (`layout="vertical"`, bars extending right from the category axis).                              |           |
| 7.3 | X axis                      | Numeric, domain `[0, 100]`.                                                                                          |           |
| 7.4 | Y axis                      | Categorical subject names. Width 90px.                                                                               |           |
| 7.5 | Bar colouring (data-driven) | Average >= 80 → green. 60–79 → blue. 40–59 → amber. <40 → red.                                                       |           |
| 7.6 | Tooltip                     | `{value}%` with label "Average".                                                                                     |           |
| 7.7 | Number of bars — 2A         | Up to 7 bars (Biology, Chemistry, Economics, English, Geography, History, Mathematics) depending on which have data. |           |

---

## 8. Class Overview — Top 5 / Bottom 5

| #   | What to Check                        | Expected Result                                                                                                                                                                                        | Pass/Fail |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 8.1 | Two Section cards in a 2-column grid | Left: **"Top 5 Performers"**. Right: **"Bottom 5 Performers"**.                                                                                                                                        |           |
| 8.2 | Top 5 row layout                     | Rank badge (circle, `bg-primary-600` + white number 1..5) + student name + green percentage + optional letter-grade pill.                                                                              |           |
| 8.3 | Bottom 5 row layout                  | Same layout but rank badge uses `bg-danger-100` + `text-danger-700`. Numbering reflects actual position from the end (e.g. if 25 students total, bottom 5 show ranks 21–25). Percentages shown in red. |           |
| 8.4 | Data derivation                      | Sort `rankedStudents` by score DESC. Top 5 = first 5. Bottom 5 = last 5 reversed so the lowest score is at the top of the Bottom 5 card.                                                               |           |
| 8.5 | Ties                                 | Equal scores appear in API return order; no secondary sort.                                                                                                                                            |           |

---

## 9. Class Overview — Full Student Rankings

Below Top/Bottom, a Section card titled **"Full Student Rankings"**.

| #   | What to Check     | Expected Result                                                                                                                                               | Pass/Fail |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1 | Column headers    | **#** (rank), **Student**, **Score**, **Grade**, **Percentile**.                                                                                              |           |
| 9.2 | Row count         | Equal to the number of students with a non-null overall score. Null-score students are omitted.                                                               |           |
| 9.3 | Rank column       | Monospace 1-based position number.                                                                                                                            |           |
| 9.4 | Grade column      | Round coloured pill (A=green, B=blue, C=amber, D=orange, F=red). Em-dash if no letter.                                                                        |           |
| 9.5 | Percentile column | Horizontal rounded bar coloured by score band. Label **"P{n}"** on the right where n = `round((totalStudents - i) / totalStudents * 100)`. Top student ~P100. |           |
| 9.6 | Click a row       | Sets `studentId` to that row's student_id. View flips to **Student Profile** mode (section 11).                                                               |           |
| 9.7 | Hover state       | Row background `bg-surface-secondary/50`; cursor pointer.                                                                                                     |           |

---

## 10. Subject Deep Dive (Admin)

Triggered by: Subject = specific, Student = none.

| #    | What to Check                                                              | Expected Result                                                                                                                                          | Pass/Fail |
| ---- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1 | Set Subject to **English**                                                 | Stats row shows subject-specific stats (computed from `students[i].subject_grades[englishId].computed`), not overall scores.                             |           |
| 10.2 | Admin-specific: set Subject to any subject — even ones admin doesn't teach | Admin can pick Biology, Geography, History, etc. No ownership gate. Each selection re-renders the Subject Deep Dive for that subject.                    |           |
| 10.3 | Grade Distribution chart                                                   | Bar heights and counts are now based on the selected subject's letter grades, not overall.                                                               |           |
| 10.4 | Second chart swaps to **"Student Scores"**                                 | Vertical BarChart titled "Student Scores". Shows top 15 students for this subject with first names on X axis (angled -30°). Bars coloured by score band. |           |
| 10.5 | Top 5 / Bottom 5 cards                                                     | Ranked by the selected subject's score, not overall.                                                                                                     |           |
| 10.6 | Full Rankings table                                                        | Each student's {subject} score, {subject} letter grade, and subject-specific percentile.                                                                 |           |
| 10.7 | Click a row                                                                | Drills into Student Profile. Student Profile still shows ALL subjects regardless of the current Subject filter.                                          |           |

---

## 11. Student Profile (Admin)

Triggered by: `studentId` is set — either via a row click in rankings or via the Student dropdown.

### 11.1 Student header card

| #      | What to Check               | Expected Result                                                                                                                                                                | Pass/Fail |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 11.1.1 | Card appears at top of view | Rounded-xl card with gradient from `primary-50` to `surface`.                                                                                                                  |           |
| 11.1.2 | Student avatar              | Circular 48px badge with `primary-600` background, white bold initials (first letter of first_name + first letter of last_name, max 2 chars).                                  |           |
| 11.1.3 | Student name                | `<h2>` with full name.                                                                                                                                                         |           |
| 11.1.4 | Overall line                | **"Overall: {score}%"** with the percentage in `primary-700 font-semibold`. If display is a letter that isn't a percentage, append ` ({display})` — e.g. "Overall: 47.1% (F)". |           |
| 11.1.5 | Top N pill (optional)       | If student is ranked 1–3 in the current view, a small pill reads **"Top {rank}"** with `warning-100` background and `warning-800` text.                                        |           |

### 11.2 Admin-specific: open any student in any class

| #      | What to Check                                                            | Expected Result                                                                                         | Pass/Fail |
| ------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | --------- |
| 11.2.1 | Switch class to **3A**                                                   | `<AnalyticsTab key={classId}>` unmounts and remounts; all state clears.                                 |           |
| 11.2.2 | Switch class to **1A**, select a period, pick a student                  | Student Profile renders for the 1A student. Admin has full cross-class access.                          |           |
| 11.2.3 | From the Student dropdown in any class, pick **All Students** (`__none`) | `studentId` clears. View flips back to Class Overview or Subject Deep Dive based on the Subject filter. |           |

---

## 12. Student Profile — Radar Chart

Section card titled **"Performance Across Subjects"**. Only rendered when the student has data for **more than 2 subjects**.

| #    | What to Check                      | Expected Result                                                                                    | Pass/Fail |
| ---- | ---------------------------------- | -------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | Chart type                         | Recharts RadarChart. One axis per subject, radial domain `[0, 100]`. Two radar polygons overlayed. |           |
| 12.2 | Radar 1 — Class Average            | Blue dashed line `#2563eb`, fill opacity 0.12. Dataset: class average per subject.                 |           |
| 12.3 | Radar 2 — Student                  | Solid green `#15803d` outline, fill `#86efac` opacity 0.35. Dataset: student's subject scores.     |           |
| 12.4 | Axis labels                        | Subject names on outer angle axis, 11px font.                                                      |           |
| 12.5 | Tooltip                            | On hover, shows both the student's score and the class average for that subject.                   |           |
| 12.6 | Legend below chart                 | Two swatches: green dot "{student name}" and blue dot "Class Average".                             |           |
| 12.7 | Student has ≤ 2 subjects with data | The Radar section is NOT rendered. Only header, Strengths/Improvements, and Grade Summary appear.  |           |

---

## 13. Student Profile — Strengths and Areas for Improvement

Two Section cards side-by-side in a 2-column grid on tablet+.

| #    | What to Check                           | Expected Result                                                                                                                        | Pass/Fail |
| ---- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1 | Left card: **"Strengths"**              | Top 3 subjects by score DESC. Each row `bg-success-50` with subject name left and "{score}%" in mono green (`text-success-700`) right. |           |
| 13.2 | Right card: **"Areas for Improvement"** | Bottom 3 subjects by score ASC. Each row `bg-danger-50`, subject name left, "{score}%" in red right.                                   |           |
| 13.3 | Fewer than 3 subjects                   | Lists only as many rows as the student has subjects with data.                                                                         |           |

---

## 14. Student Profile — Grade Summary Table

Section card titled **"Grade Summary"**.

| #    | What to Check            | Expected Result                                                                                                 | Pass/Fail |
| ---- | ------------------------ | --------------------------------------------------------------------------------------------------------------- | --------- |
| 14.1 | Column headers           | **Subject**, **Score**, **Grade**, **Class Avg**, **vs. Class**.                                                |           |
| 14.2 | Row count                | One per subject in the class, regardless of whether the student has a score.                                    |           |
| 14.3 | Score column             | `{score}%` in mono LTR. Em-dash for no data.                                                                    |           |
| 14.4 | Grade column             | Coloured round pill. Em-dash if no letter.                                                                      |           |
| 14.5 | Class Avg column         | Mean of class scores for that subject, 1 decimal, suffixed `%`. Em-dash if class has no data.                   |           |
| 14.6 | vs. Class column         | `student_score - class_average`. 1 decimal. Prefixed `+` (green) if positive, `-` (red) if negative. Monospace. |           |
| 14.7 | Row with no student data | Score / Grade / vs. Class all em-dash. Class Avg still shown if class has data.                                 |           |

---

## 15. All Periods (Year Overview) Mode

When the Period dropdown is set to **All Periods**, the AnalyticsTab normalises the year-overview response into the cross-subject shape so all the charts still render.

| #    | What to Check                                 | Expected Result                                                                                                                                                                                                                                                          | Pass/Fail |
| ---- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 15.1 | Set Period to **All Periods**                 | GET `/api/v1/gradebook/period-grades/year-overview?class_id={id}&academic_year_id={yearId}`. Data normaliser averages each student's per-subject grades across periods to produce a cross-subject-shaped dataset. Overall score uses `year_overall` returned by the API. |           |
| 15.2 | All views still render                        | Stats, Grade Distribution, Top/Bottom, Rankings all use the averaged data. Student Profile uses the year's annual aggregate for the Overall line.                                                                                                                        |           |
| 15.3 | Subject Deep Dive with All Periods            | Each student's subject score is the mean across all periods with a computed grade. Students with no data in any period show em-dash.                                                                                                                                     |           |
| 15.4 | Student Profile with All Periods              | Overall uses `year_overall.computed`. Radar chart shows the averaged per-subject values.                                                                                                                                                                                 |           |
| 15.5 | If the year-overview API response has no data | Renders **"No grade data available for this selection."**                                                                                                                                                                                                                |           |

---

## 16. Cross-Class Exploration Workflow

This workflow is only practical for admin because it requires visibility across multiple classes.

| #    | What to Check                                           | Expected Result                                                                                                                                                                                                           | Pass/Fail |
| ---- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1 | Start at `/en/analytics`. Select **2A** → Period **S1** | Class Overview renders with 2A/S1 stats.                                                                                                                                                                                  |           |
| 16.2 | Click the class selector → switch to **2B**             | Because of `key={classId}`, the AnalyticsTab remounts. Period/Subject/Student reset. Pick Period S1 again.                                                                                                                |           |
| 16.3 | Continue through **3A**, **3B**, **4A**…                | Admin can iterate across all 16 classes without hitting any permission error.                                                                                                                                             |           |
| 16.4 | For classes with no assessments                         | The class still appears in the selector (active status is the only filter). On selecting, periods load fine but the cross-subject data returns an empty `students` array → "No grade data available" empty state renders. |           |
| 16.5 | Principal oversight use case                            | Admin can quickly compare class averages term-over-term by switching classes and picking the same period — useful for end-of-term report card reviews.                                                                    |           |

---

## 17. Error and Empty States

| #    | What to Check                                  | Expected Result                                                                                                                                                                          | Pass/Fail |
| ---- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.1 | Period selected but API returns 500            | Three skeleton loaders briefly, then the empty message **"No grade data available for this selection."** `console.error` logs `[AnalyticsTab]` and the error.                            |           |
| 17.2 | Class has no assessments at all                | Selector lists the class. After selection, periods load (year-based), but cross-subject data returns empty `students`. Empty-state message renders.                                      |           |
| 17.3 | Student dropdown visible only after data loads | Before `data` state is set, the Student Select is not rendered. No way to pick a student until class + period yields data.                                                               |           |
| 17.4 | Switch class while a student is selected       | `key={classId}` unmounts and remounts; periodId becomes empty, subjectId resets to "all", studentId resets to "".                                                                        |           |
| 17.5 | Switch period while viewing a student profile  | The onChange handler for Period clears `studentId`, so view falls back to Class Overview for the new period.                                                                             |           |
| 17.6 | Class has no active students                   | After selecting a class and period, the matrix returns an empty `students` array. Empty state shown. All stats show em-dash.                                                             |           |
| 17.7 | Admin without `students.view` permission       | Unlikely for any admin role, but if a custom role strips `students.view`, the class selector fails to load classes and the page shows an empty selector. Flag as a permission misconfig. |           |

---

## 18. Arabic / RTL

| #    | What to Check                           | Expected Result                                                                                                                                               | Pass/Fail |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 18.1 | Toggle to Arabic. Open `/ar/analytics`  | Page title, filter placeholders, body text translate. Layout flips RTL.                                                                                       |           |
| 18.2 | Class selector in Arabic                | Placeholder becomes the Arabic equivalent (localised from `gradebook.selectClass` or fallback). Options are the same class names (not translated).            |           |
| 18.3 | Recharts charts in RTL                  | Recharts renders axes and bars in LTR internally; numbers, percentages, subject names remain readable. Tooltips translate labels but keep numeric values LTR. |           |
| 18.4 | Stat cards                              | Labels ("Mean", "Median", etc.) translate where the `gradebook` namespace has Arabic equivalents. Numeric values remain LTR-wrapped.                          |           |
| 18.5 | Student Profile Radar chart             | Subject labels in Arabic if the tenant's subjects are Arabic-named. Legend labels translate.                                                                  |           |
| 18.6 | Strengths / Areas for Improvement cards | Titles translate, subject rows show Arabic subject names where applicable, percentages remain LTR.                                                            |           |
| 18.7 | Grade Summary table                     | Column headers translate. Score / Grade / Class Avg / vs. Class values remain LTR (`dir="ltr"` on numeric cells).                                             |           |
| 18.8 | Toggle back to English                  | URL returns to `/en/analytics`. Full state preserved (class / period / subject / student all retained).                                                       |           |

---

## 19. Role Gating Sanity Check

Because the same page serves both roles, this section guards against regressions.

| #    | What to Check                                         | Expected Result                                                                                                                                                                               | Pass/Fail |
| ---- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 19.1 | As admin, the class selector lists all active classes | 16 classes visible for NHQS.                                                                                                                                                                  |           |
| 19.2 | Log out, log in as a teacher (`sarah.daly@nhqs.test`) | Sarah Daly sees only the classes she teaches. For NHQS Sarah teaches English across multiple classes; her class selector shows the subset, not 16.                                            |           |
| 19.3 | Log back in as admin (`owner@nhqs.test`)              | Full 16-class scope restored.                                                                                                                                                                 |           |
| 19.4 | Direct URL manipulation                               | As admin, entering `/en/analytics?class_id={anyClassId}` (hypothetical) does not bypass the selector — the page loads with no class selected. The Select component drives state, not the URL. |           |
| 19.5 | RLS safety check                                      | At a DB level, `/api/v1/classes` is tenant-scoped via RLS. An admin cannot see classes belonging to other tenants regardless of the URL pattern used.                                         |           |

---

## End of Spec

Once all rows above show Pass, the admin's Analytics page — including full 16-class scope, all three view modes (Class Overview, Subject Deep Dive, Student Profile), All-Periods year overview, cross-class exploration, and Arabic/RTL — is verified from the admin perspective.
