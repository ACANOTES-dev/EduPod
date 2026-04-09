# E2E Test Specification: Assessment — Analytics

> **Coverage:** This document covers **1 page** within the Assessment section of the Learning hub:
>
> - Assessment Analytics (`/en/analytics`) — class-level grade analytics with three sub-views (Class Overview, Subject Deep Dive, Student Profile)
>
> **School Pages Covered So Far:** 23 / 322

**Base URL:** `https://nhqs.edupod.app`
**Prerequisite:** Logged in as **Sarah Daly** (`sarah.daly@nhqs.test`), Teacher role.
**Navigation path:** Learning → Assessment → **Analytics** (fourth sub-strip item).
**Key principle:** The Analytics page is **filter-driven**. Until a class is chosen, only an empty-state is shown. Once a class is selected, the filters (period / subject / student) determine which of the three views renders.

---

## Table of Contents

1. [Navigating to Analytics](#1-navigating-to-analytics)
2. [Page Load and Class Selector](#2-page-load-and-class-selector)
3. [After Selecting a Class — Filter Bar](#3-after-selecting-a-class--filter-bar)
4. [View Modes and How They Are Chosen](#4-view-modes-and-how-they-are-chosen)
5. [Class Overview — Stats Row](#5-class-overview--stats-row)
6. [Class Overview — Grade Distribution Chart](#6-class-overview--grade-distribution-chart)
7. [Class Overview — Average Score by Subject Chart](#7-class-overview--average-score-by-subject-chart)
8. [Class Overview — Top 5 / Bottom 5 Performers](#8-class-overview--top-5--bottom-5-performers)
9. [Class Overview — Full Student Rankings Table](#9-class-overview--full-student-rankings-table)
10. [Subject Deep Dive — Differences from Class Overview](#10-subject-deep-dive--differences-from-class-overview)
11. [Student Profile View](#11-student-profile-view)
12. [Student Profile — Radar Chart](#12-student-profile--radar-chart)
13. [Student Profile — Strengths and Areas for Improvement](#13-student-profile--strengths-and-areas-for-improvement)
14. [Student Profile — Grade Summary Table](#14-student-profile--grade-summary-table)
15. [All Periods (Year Overview) Mode](#15-all-periods-year-overview-mode)
16. [Error and Empty States](#16-error-and-empty-states)
17. [Arabic / RTL](#17-arabic--rtl)

---

## 1. Navigating to Analytics

| #   | What to Check                                         | Expected Result                                                                                                                                                    | Pass/Fail |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 1.1 | Start at the Assessment Dashboard (`/en/assessments`) | The Assessment sub-strip is visible with four items: Dashboard, Gradebook, Report Cards, **Analytics**.                                                            |           |
| 1.2 | Click **Analytics**                                   | Browser navigates to `/en/analytics`. The Analytics link in the sub-strip is active. The Learning sub-strip above remains visible with **Assessment** highlighted. |           |
| 1.3 | Verify the primary page header                        | A small **BarChart2** icon in primary-600 colour is followed by an `<h1>` that reads **"Analytics"** (localised via `gradebook.analytics`).                        |           |

---

## 2. Page Load and Class Selector

**URL:** `/en/analytics`

| #   | What to Check                                           | Expected Result                                                                                                                                                            | Pass/Fail |
| --- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1 | Page load                                               | For ~500ms two skeleton rounded-xl boxes appear. Then the class selector is rendered.                                                                                      |           |
| 2.2 | A single Select component appears below the page header | Trigger text defaults to **"Select a class"**. Width is `w-full sm:w-56` (narrow on desktop, full-width on mobile).                                                        |           |
| 2.3 | Click the class selector                                | A listbox opens showing one option per **active** class in the tenant, fetched from `GET /api/v1/classes?pageSize=100&status=active`, sorted alphabetically by class name. |           |
| 2.4 | Before any class is selected, the body area             | Shows a centred empty state: a large faded **BarChart2** icon and the text **"Select a class to view grade analytics."**                                                   |           |
| 2.5 | Select a class with data (e.g. **2A**)                  | The class selector trigger updates to show "2A". The `<AnalyticsTab>` component mounts with `key={classId}` so switching classes always fully resets the internal state.   |           |
| 2.6 | Browser console                                         | No red errors relating to `/api/v1/classes`, `/api/v1/gradebook/classes/{id}/allocations`, `/api/v1/academic-periods`, or `/api/v1/gradebook/period-grades/cross-subject`. |           |

---

## 3. After Selecting a Class — Filter Bar

Once a class is selected, the AnalyticsTab renders a filter bar at the top and a `<p>` placeholder below until a period is chosen.

### 3.1 Period dropdown

| #     | What to Check                                | Expected Result                                                                                                                                              | Pass/Fail |
| ----- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 3.1.1 | Placeholder                                  | **"Period"**.                                                                                                                                                |           |
| 3.1.2 | Options                                      | **All Periods** (first), then one option per academic period in the class's academic year (loaded via `/api/v1/academic-periods?academic_year_id={yearId}`). |           |
| 3.1.3 | When Period is empty, body shows placeholder | Paragraph reads **"Select a period to view analytics."** No charts or tables are rendered.                                                                   |           |

### 3.2 Subject dropdown

| #     | What to Check | Expected Result                                                                                                                                                           | Pass/Fail |
| ----- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.2.1 | Placeholder   | **"Subject"**. Default value is **"all"** (All Subjects).                                                                                                                 |           |
| 3.2.2 | Options       | **All Subjects** (first), then one option per subject taught in this class (from `/api/v1/gradebook/classes/{classId}/allocations`, deduplicated, sorted alphabetically). |           |

### 3.3 Student dropdown (only appears after data loads)

| #     | What to Check                                             | Expected Result                                                                                                                                                     | Pass/Fail |
| ----- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.3.1 | After Period and data have loaded, a third Select appears | Placeholder **"Student"**. First option is **"All Students"** (value `__none`). Below that, every student in the loaded matrix, sorted alphabetically by full name. |           |
| 3.3.2 | Changing Period or Subject clears the student selection   | The onChange handler for each of Period and Subject resets `studentId = ''`.                                                                                        |           |

---

## 4. View Modes and How They Are Chosen

The AnalyticsTab derives the active view from the filter state:

| #   | Filters (Subject / Student)                 | View Mode             | What Renders                                                                                                                                      | Pass/Fail |
| --- | ------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1 | Subject = **all**, Student = (none)         | **Class Overview**    | Stats + Grade Distribution + Subject Averages + Top/Bottom + Rankings table                                                                       |           |
| 4.2 | Subject = **specific**, Student = (none)    | **Subject Deep Dive** | Same layout as Class Overview but with subject-specific stats and a different second chart (Student Scores bar chart instead of Subject Averages) |           |
| 4.3 | Student = **specific** (any subject filter) | **Student Profile**   | Student header card + Radar chart + Strengths/Improvements cards + Grade Summary table                                                            |           |

---

## 5. Class Overview — Stats Row

(Triggered by: Class 2A + Period S1 + Subject All + Student None.)

A row of six StatCard components appears, wrapped in a responsive grid (2 cols on mobile, 3 at sm, 6 at lg).

| #   | Label         | Source                                                                                                 | Format                                                                                                                                            | Pass/Fail |
| --- | ------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1 | Mean          | Arithmetic mean of overall scores (Class Overview) or of the subject-column scores (Subject Deep Dive) | `{value}%` (1 decimal)                                                                                                                            |           |
| 5.2 | Median        | Median of same dataset                                                                                 | `{value}%`                                                                                                                                        |           |
| 5.3 | Std Dev       | Standard deviation                                                                                     | Raw number (2 decimals)                                                                                                                           |           |
| 5.4 | Pass Rate     | Percentage of students with score >= 60                                                                | `{value}%`. Accent colour is **green** if >= 60, **red** otherwise.                                                                               |           |
| 5.5 | Highest       | Max score                                                                                              | `{value}%`, green accent                                                                                                                          |           |
| 5.6 | Lowest        | Min score                                                                                              | `{value}%`, red accent                                                                                                                            |           |
| 5.7 | Empty dataset | If the selected class/period has no grade data                                                         | All six StatCards display **"—"**. The body underneath shows the message **"No grade data available for this selection."** instead of the charts. |           |

---

## 6. Class Overview — Grade Distribution Chart

A bordered Section card titled **"Grade Distribution"**.

| #   | What to Check          | Expected Result                                                                                                                                                                                                                                                  | Pass/Fail |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1 | Chart type             | Recharts vertical BarChart with 5 bars (one per letter grade).                                                                                                                                                                                                   |           |
| 6.2 | X axis                 | Categorical with ticks **A**, **B**, **C**, **D**, **F** (bold, size 13).                                                                                                                                                                                        |           |
| 6.3 | Y axis                 | Numeric axis, no decimals (`allowDecimals={false}`). Shows student counts.                                                                                                                                                                                       |           |
| 6.4 | Bar colours            | A=green `#22c55e`, B=blue `#3b82f6`, C=amber `#f59e0b`, D=orange `#f97316`, F=red `#ef4444`.                                                                                                                                                                     |           |
| 6.5 | Tooltip on hover       | Custom styled tooltip reads **"{count} students"** (or "student" singular) with the label **"Count"**.                                                                                                                                                           |           |
| 6.6 | Legend below chart     | Five small dots with "A: {count}", "B: {count}", etc., coloured to match bars.                                                                                                                                                                                   |           |
| 6.7 | Grade derivation rules | If backend provides a `display` value that's NOT a percentage string, it's used directly. Otherwise the percentage is mapped to a letter: `>=90 → A`, `>=81 → B`, `>=71 → C`, `>=60 → D`, `<60 → F`. Anything null becomes `N/A` and is excluded from the chart. |           |

---

## 7. Class Overview — Average Score by Subject Chart

Second chart in a 2-column grid on large screens (only rendered when **Subject = all**).

| #   | What to Check               | Expected Result                                                                                                                   | Pass/Fail |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1 | Section title               | **"Average Score by Subject"**.                                                                                                   |           |
| 7.2 | Chart type                  | Horizontal BarChart (`layout="vertical"`, bars extending right from the category axis).                                           |           |
| 7.3 | X axis                      | Numeric, domain `[0, 100]`.                                                                                                       |           |
| 7.4 | Y axis                      | Categorical with subject names. Width 90px for legibility.                                                                        |           |
| 7.5 | Bar colouring (data-driven) | Average >= 80 → green. 60–79 → blue. 40–59 → amber. <40 → red.                                                                    |           |
| 7.6 | Tooltip                     | `{value}%` followed by label "Average".                                                                                           |           |
| 7.7 | Number of bars              | Equal to the number of subjects in the class (7 for 2A: Biology, Chemistry, Economics, English, Geography, History, Mathematics). |           |

---

## 8. Class Overview — Top 5 / Bottom 5 Performers

| #   | What to Check                        | Expected Result                                                                                                                                                                                                    | Pass/Fail |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 8.1 | Two Section cards in a 2-column grid | Left: **"Top 5 Performers"**. Right: **"Bottom 5 Performers"**.                                                                                                                                                    |           |
| 8.2 | Top 5 card — row layout              | Each row has: rank badge (circle with primary-600 bg and white number 1..5), student name, green percentage, optional letter grade pill coloured per the grade palette.                                            |           |
| 8.3 | Bottom 5 card — row layout           | Same as Top 5 but: rank badge uses `bg-danger-100` with `text-danger-700`; numbering reflects the actual position from the end (e.g. if there are 25 students, bottom 5 show ranks 21–25); percentage text is red. |           |
| 8.4 | Data derivation                      | Students are sorted by score descending from `rankedStudents`. Top 5 = first 5. Bottom 5 = last 5 reversed so the lowest score is at the top of the Bottom 5 card.                                                 |           |
| 8.5 | Ties                                 | Equal scores appear in the order returned by the API (no secondary sort).                                                                                                                                          |           |

---

## 9. Class Overview — Full Student Rankings Table

Below the Top/Bottom cards, a Section card titled **"Full Student Rankings"**.

| #   | What to Check     | Expected Result                                                                                                                                                                                                                                                                                                            | Pass/Fail |
| --- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1 | Column headers    | **#** (rank), **Student**, **Score**, **Grade**, **Percentile**.                                                                                                                                                                                                                                                           |           |
| 9.2 | Row count         | Equal to the number of students who have a non-null overall score. Students with no data are omitted from the ranking.                                                                                                                                                                                                     |           |
| 9.3 | Rank column       | Monospace 1-based position number.                                                                                                                                                                                                                                                                                         |           |
| 9.4 | Grade column      | Coloured round pill (A=green, B=blue, C=amber, D=orange, F=red). Em-dash if no letter grade.                                                                                                                                                                                                                               |           |
| 9.5 | Percentile column | Horizontal bar (rounded, full-width of the cell minus the label), coloured the same way as the subject averages chart based on score band. Text label to the right reads **"P{n}"** where n is `round((totalStudents - i) / totalStudents * 100)`, so the top student is ~P100 and the last student is a small percentile. |           |
| 9.6 | Click a row       | Sets `studentId` to that row's student_id. The view flips to **Student Profile** mode for that student (see section 11).                                                                                                                                                                                                   |           |
| 9.7 | Hover state       | Row background turns to `bg-surface-secondary/50`; cursor is pointer.                                                                                                                                                                                                                                                      |           |

---

## 10. Subject Deep Dive — Differences from Class Overview

Triggered by: Subject = **specific** (not "all"), Student = (none).

| #    | What to Check                              | Expected Result                                                                                                                                                                                                                      | Pass/Fail |
| ---- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 10.1 | Set Subject to **English**                 | Stats row shows subject-specific stats (computed from the students' `subject_grades[englishId].computed` values), not the overall scores.                                                                                            |           |
| 10.2 | Grade Distribution chart                   | Bar heights and counts are now based on the English subject letter grades, not overall grades.                                                                                                                                       |           |
| 10.3 | Second chart swaps to **"Student Scores"** | Instead of "Average Score by Subject", a vertical BarChart titled "Student Scores" appears. It shows up to the top 15 students (by English score) with their first names on the X axis angled -30°. Bars are coloured by score band. |           |
| 10.4 | Top 5 / Bottom 5 cards                     | Show students ranked by their English subject score, not overall.                                                                                                                                                                    |           |
| 10.5 | Full Rankings table                        | Now displays each student's English score, English letter grade, and subject-specific percentile.                                                                                                                                    |           |
| 10.6 | Click a row in the rankings table          | Drills down into the Student Profile for that student (Student Profile still shows ALL subjects, regardless of the current Subject filter).                                                                                          |           |

---

## 11. Student Profile View

Triggered by: any time `studentId` is set — either via a row click in the rankings table or by choosing a specific student from the Student dropdown.

### 11.1 Student header card

| #      | What to Check                       | Expected Result                                                                                                                                                                                    | Pass/Fail |
| ------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1.1 | Card appears at the top of the view | Rounded-xl card with a gradient from `primary-50` to `surface`.                                                                                                                                    |           |
| 11.1.2 | Student avatar                      | Circular badge 48px with primary-600 background, white bold text showing the student's **first-letter of first name + first-letter of last name** (max 2 chars, e.g. "KC" for Karen Carroll).      |           |
| 11.1.3 | Student name                        | `<h2>` with the student's full name.                                                                                                                                                               |           |
| 11.1.4 | Overall line                        | Reads **"Overall: {score}%"** with the percentage in primary-700, semibold. If the student has a letter-grade display that is not a percentage, append ` ({display})` (e.g. "Overall: 47.1% (F)"). |           |
| 11.1.5 | Top N pill (optional)               | If the student is ranked in positions 1–3 of the current view, a small rounded pill appears inline reading **"Top {rank}"** with warning-100 background and warning-800 text.                      |           |

### 11.2 Switching student

| #      | What to Check                                                        | Expected Result                                                                                                       | Pass/Fail |
| ------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.2.1 | From the Student dropdown, pick a different student                  | The page re-renders for the new student; the radar chart and tables update.                                           |           |
| 11.2.2 | From the dropdown, pick **All Students** (value `__none`)            | `studentId` is cleared; the view flips back to Class Overview or Subject Deep Dive (depending on the Subject filter). |           |
| 11.2.3 | From the rankings table in Class Overview, click a different student | Analogous behaviour.                                                                                                  |           |

---

## 12. Student Profile — Radar Chart

A Section card titled **"Performance Across Subjects"**, rendered only if the student has data for more than 2 subjects.

| #    | What to Check                      | Expected Result                                                                                                        | Pass/Fail |
| ---- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | Chart type                         | Recharts RadarChart with one axis per subject, radial domain `[0, 100]`, two radar polygons overlayed.                 |           |
| 12.2 | Radar 1 — Class Average            | Blue dashed line (`#2563eb`), fill opacity 0.12. Dataset: the class's average for each subject.                        |           |
| 12.3 | Radar 2 — Student                  | Solid green (`#15803d`) outline, fill colour `#86efac` opacity 0.35. Dataset: the student's subject scores.            |           |
| 12.4 | Axis labels                        | Subject names on the outer angle axis, 11px font.                                                                      |           |
| 12.5 | Tooltip                            | Hovering a data point shows both the student's score and the class average for that subject.                           |           |
| 12.6 | Legend below chart                 | Two swatches: green dot "{student name}" and blue dot "Class Average".                                                 |           |
| 12.7 | Student has ≤ 2 subjects with data | The Radar chart Section is NOT rendered. Only the header card, Strengths/Improvements, and Grade Summary table appear. |           |

---

## 13. Student Profile — Strengths and Areas for Improvement

Two Section cards side-by-side in a 2-column grid on tablet+.

| #    | What to Check                           | Expected Result                                                                                                                                                                                                       | Pass/Fail |
| ---- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1 | Left card: **"Strengths"**              | Lists the top 3 subjects (by score DESC) for this student. Each row has a light green `bg-success-50` background with the subject name on the left and "{score}%" in monospace green `text-success-700` on the right. |           |
| 13.2 | Right card: **"Areas for Improvement"** | Lists the bottom 3 subjects (by score ASC). Each row has a light red `bg-danger-50` background, subject name left, "{score}%" in red right.                                                                           |           |
| 13.3 | Fewer than 3 subjects                   | Lists only as many rows as the student has subjects with data.                                                                                                                                                        |           |

---

## 14. Student Profile — Grade Summary Table

Below Strengths/Improvements, a Section card titled **"Grade Summary"**.

| #    | What to Check            | Expected Result                                                                                                                                      | Pass/Fail |
| ---- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.1 | Column headers           | **Subject**, **Score**, **Grade**, **Class Avg**, **vs. Class**.                                                                                     |           |
| 14.2 | Row count                | One row per subject in the class, regardless of whether the student has a score for it.                                                              |           |
| 14.3 | Score column             | `{score}%` in monospace LTR. Em-dash for no data.                                                                                                    |           |
| 14.4 | Grade column             | Coloured round pill for the letter grade, or em-dash if no letter.                                                                                   |           |
| 14.5 | Class Avg column         | Mean of class scores for that subject, rounded to 1 decimal, suffixed with `%`. Em-dash if the class has no data.                                    |           |
| 14.6 | vs. Class column         | Difference `student_score - class_average` rounded to 1 decimal. Prefixed with `+` if positive (green) or `-` if negative (red). Shown in monospace. |           |
| 14.7 | Row with no student data | Score, Grade, and vs. Class cells all show em-dash. Class Avg still shows if the class has data for that subject.                                    |           |

---

## 15. All Periods (Year Overview) Mode

When the Period dropdown is set to **All Periods**, the AnalyticsTab normalises the year-overview data into the cross-subject shape so all the charts still render.

| #    | What to Check                                           | Expected Result                                                                                                                                                                                                                                          | Pass/Fail |
| ---- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.1 | Set Period to **All Periods**                           | Fetches `GET /api/v1/gradebook/period-grades/year-overview?class_id={id}&academic_year_id={yearId}`. Data normaliser averages each student's per-subject grades across all periods to produce a pseudo-"cross-subject" dataset.                          |           |
| 15.2 | The view (Overview / Deep Dive / Profile) still renders | Stats, Grade Distribution, Top/Bottom, Rankings all still show using the averaged data. The student "Overall" for the All-Periods view is the `year_overall` value returned by the API (the tenant's actual annual aggregate), NOT a recomputed average. |           |
| 15.3 | Subject Deep Dive with All Periods                      | Each student's subject score is the mean across all periods in which they have a computed grade for that subject. Students with no data for the subject in any period appear in the table with em-dash in the Score/Grade columns.                       |           |
| 15.4 | Student Profile with All Periods                        | The Overall line uses the student's `year_overall.computed` value. The radar chart shows the averaged per-subject values.                                                                                                                                |           |
| 15.5 | If the year-overview API response has no data           | The AnalyticsTab renders the "No grade data available for this selection." message.                                                                                                                                                                      |           |

---

## 16. Error and Empty States

| #    | What to Check                                      | Expected Result                                                                                                                                                                                              | Pass/Fail |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 16.1 | Period selected but API returns 500                | Three skeleton loader boxes are shown briefly, then the empty message "No grade data available for this selection." The `console.error` log includes `[AnalyticsTab]` and the error.                         |           |
| 16.2 | Class has no assessments at all                    | The Class selector still shows the class, but after selection, periods still load (because they're year-based), but the cross-subject data returns an empty `students` array. Shows the no-data empty state. |           |
| 16.3 | Student dropdown visible only after data is loaded | Before `data` state is set, the third Select is not rendered. No way to pick a student until the class + period yields data.                                                                                 |           |
| 16.4 | Switch class while a student is selected           | The `key={classId}` on `<AnalyticsTab>` unmounts and remounts, clearing all state: periodId becomes empty, subjectId resets to "all", studentId resets to ''.                                                |           |
| 16.5 | Switch period while viewing a student profile      | The onChange handler for Period clears `studentId`, so the view falls back to Class Overview for the new period.                                                                                             |           |

---

## 17. Arabic / RTL

| #    | What to Check                           | Expected Result                                                                                                                                                              | Pass/Fail |
| ---- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.1 | Toggle to Arabic. Open `/ar/analytics`  | Page title, filter placeholders, and body text translate to Arabic. Layout flips to RTL.                                                                                     |           |
| 17.2 | Recharts charts in RTL                  | Recharts renders its axes and bars in LTR internally (numbers, percentages, subject names remain readable). Tooltips translate the label text but keep numerical values LTR. |           |
| 17.3 | Stat cards                              | Labels ("Mean", "Median", etc.) translate where the gradebook namespace has Arabic equivalents. Values remain numeric and LTR-wrapped.                                       |           |
| 17.4 | Student Profile Radar chart             | Subject labels in Arabic if the tenant's subjects are Arabic-named. Legend labels translate.                                                                                 |           |
| 17.5 | Strengths / Areas for Improvement cards | Titles translate, subject rows show the Arabic subject name where applicable, percentages remain LTR.                                                                        |           |
| 17.6 | Grade Summary table                     | Column headers translate. Score / Grade / Class Avg / vs. Class values remain LTR (`dir="ltr"` on the cells holding numeric values).                                         |           |
| 17.7 | Toggle back to English                  | URL returns to `/en/analytics`. Full state is preserved (class / period / subject / student all retained).                                                                   |           |

---

## End of Spec

Once all rows above show Pass, the Assessment Analytics page and its three view modes (Class Overview, Subject Deep Dive, Student Profile) are verified, including the All-Periods year-overview normalisation path.
