# E2E Test Specification: Report Cards (Teacher View)

> **Coverage:** This document covers every page, button, form, modal, and flow in the Report Cards module as seen by a **Teacher** role user. Teachers are strictly scoped — they only see the classes they teach (via teacher_competencies × curriculum matrix) plus any homeroom they've been assigned to on an open comment window. Everything outside that scope is actively blocked, and the UI hides admin-only affordances entirely.
>
> **Pages documented here (7 reachable routes):**
>
> 1. Report Cards Dashboard — `/en/report-cards` (reduced 2-tile view)
> 2. Class Matrix — `/en/report-cards/{classId}` (scope-restricted)
> 3. Report Card Library — `/en/report-cards/library` (scope-restricted)
> 4. Report Comments Landing — `/en/report-comments` (scope-restricted)
> 5. Overall Comments Editor — `/en/report-comments/overall/{classId}` (own homeroom only)
> 6. Subject Comments Editor — `/en/report-comments/subject/{classId}/{subjectId}` (competencies only)
> 7. Teacher Request — create + list + detail — `/en/report-cards/requests`, `/new`, `/{id}`
>
> **Pages explicitly blocked for teachers:**
>
> - `/en/report-cards/generate` — redirects back with permission denied toast
> - `/en/report-cards/settings` — loads in read-only mode
> - `/en/report-cards/analytics` — admin-only (no link, direct nav blocked)
>
> **Matching admin spec:** `../admin_view/report-cards-e2e-spec.md` — both specs should be run as a pair.

**Base URL:** `https://nhqs.edupod.app`
**Prerequisite:** Logged in as **Sarah Daly** (`sarah.daly@nhqs.test` / `Password123!`), who holds the **Teacher** role in tenant **Nurul Huda School (NHQS)**. Sarah's role setup:

- Homeroom teacher of class **2A**
- Teacher competencies: Business (1st class), English (2nd class), History (3rd class), Mathematics (4th class), Biology (5th class), Arabic (Kindergarten, Junior infants, Senior infants)

After login, Sarah lands on `/en/dashboard/teacher` (NOT `/en/dashboard`).

**Navigation path to start:** Click **Learning** in the morph bar → click **Assessment** in the Learning sub-strip → click **Report Cards** in the Assessment sub-strip.

---

## Table of Contents

1. [Login & Teacher Landing](#1-login--teacher-landing)
2. [Navigation — Teacher Morph Bar](#2-navigation--teacher-morph-bar)
3. [Report Cards Dashboard (Teacher View)](#3-report-cards-dashboard-teacher-view)
4. [Class Matrix Page (Scoped)](#4-class-matrix-page-scoped)
5. [Report Cards Library (Scoped)](#5-report-cards-library-scoped)
6. [Report Comments Landing (Scoped)](#6-report-comments-landing-scoped)
7. [Overall Comments Editor — Teacher](#7-overall-comments-editor--teacher)
8. [Overall Comments Editor — Write & Finalise](#8-overall-comments-editor--write--finalise)
9. [Overall Comments Editor — Unfinalise & Filter](#9-overall-comments-editor--unfinalise--filter)
10. [Subject Comments Editor — Teacher](#10-subject-comments-editor--teacher)
11. [Subject Comments Editor — Write & Autosave](#11-subject-comments-editor--write--autosave)
12. [Subject Comments Editor — AI Draft (Per Row)](#12-subject-comments-editor--ai-draft-per-row)
13. [Subject Comments Editor — Bulk AI Draft](#13-subject-comments-editor--bulk-ai-draft)
14. [Subject Comments Editor — Bulk Finalise](#14-subject-comments-editor--bulk-finalise)
15. [Subject Comments Editor — Unfinalise](#15-subject-comments-editor--unfinalise)
16. [Request Window Reopen Modal](#16-request-window-reopen-modal)
17. [Teacher Requests — List Page](#17-teacher-requests--list-page)
18. [Teacher Requests — New Request Page](#18-teacher-requests--new-request-page)
19. [Teacher Request — Detail & Cancel](#19-teacher-request--detail--cancel)
20. [Cross-Class Blocking (Negative Assertions)](#20-cross-class-blocking-negative-assertions)
21. [What Teachers Must NOT See or Do](#21-what-teachers-must-not-see-or-do)
22. [Arabic / RTL](#22-arabic--rtl)
23. [Console & Network Health](#23-console--network-health)
24. [Backend Endpoint Map (Teacher Scope)](#24-backend-endpoint-map-teacher-scope)

---

## 1. Login & Teacher Landing

| #   | What to Check                                                       | Expected Result                                                                                           | Pass/Fail |
| --- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------- |
| 1.1 | Open `https://nhqs.edupod.app/en/login` in a fresh incognito window | Login form renders.                                                                                       |           |
| 1.2 | Enter `sarah.daly@nhqs.test` / `Password123!` and click **Log in**  | Browser navigates to `/en/dashboard/teacher` (NOT `/en/dashboard`). This is the teacher-specific landing. |           |
| 1.3 | Top-right profile button                                            | Initials **SD**, name **Sarah Daly**, role label **Teacher**.                                             |           |
| 1.4 | Greeting                                                            | **"Good [morning/afternoon/evening], Sarah"** with subtitle **"Here's your day at a glance."**.           |           |

---

## 2. Navigation — Teacher Morph Bar

| #   | What to Check                           | Expected Result                                                                                                                                                                       | Pass/Fail |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2.1 | Morph bar hubs                          | Only 6 hubs visible: **Home**, **People**, **Learning**, **Wellbeing**, **Operations**, **Reports**. Finance, Regulatory, Settings are NOT visible.                                   |           |
| 2.2 | Click **Learning**                      | Navigates to `/en/classes` (teacher's first accessible basePath in Learning). Learning sub-strip shows **Classes**, **Assessment**, **Homework**, **Attendance** (no Curriculum tab). |           |
| 2.3 | Click **Assessment**                    | Navigates to `/en/assessments`. Assessment sub-strip shows **Dashboard**, **Gradebook**, **Report Cards**, **Analytics** (Analytics link opens the teacher-flavoured Analytics page). |           |
| 2.4 | Click **Report Cards** in the sub-strip | Navigates to `/en/report-cards`. Tab is highlighted active.                                                                                                                           |           |

---

## 3. Report Cards Dashboard (Teacher View)

**URL:** `/en/report-cards`

The dashboard renders a **reduced** layout for teachers. Every admin-only panel is hidden by the `isAdmin` check in `page.tsx`.

### 3.1 Header

| #     | What to Check          | Expected Result                                                                                                   | Pass/Fail |
| ----- | ---------------------- | ----------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1.1 | Page heading           | **"Report Cards"**.                                                                                               |           |
| 3.1.2 | Subtitle (period name) | Shows the active period (e.g. **"S1"**).                                                                          |           |
| 3.1.3 | Period selector        | Same 3-option dropdown as the admin view: **Full Year**, **S1**, **S2**. Teacher can change scope.                |           |
| 3.1.4 | Settings cog button    | **NOT rendered**. `isAdmin` check hides it. A teacher has no way to open `/en/report-cards/settings` from the UI. |           |

### 3.2 Quick action tiles (2 tiles only)

| #     | Tile                      | Rendered for teacher? | Reason                                                                                                      | Pass/Fail |
| ----- | ------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- | --------- |
| 3.2.1 | **Generate report cards** | NO                    | Admin-only. Hidden by `isAdmin` check.                                                                      |           |
| 3.2.2 | **Write comments**        | YES                   | The core teacher entry point. On click, navigates to `/en/report-comments`.                                 |           |
| 3.2.3 | **Library**               | YES                   | Teachers see a scope-restricted library (see section 5). On click, navigates to `/en/report-cards/library`. |           |
| 3.2.4 | **Teacher requests**      | NO                    | Admin-only. Hidden.                                                                                         |           |

### 3.3 Admin-only panels (all hidden)

| #     | Panel                      | Expected Result                                                                                                     | Pass/Fail |
| ----- | -------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.3.1 | Live generation run panel  | Not rendered.                                                                                                       |           |
| 3.3.2 | Analytics snapshot panel   | Not rendered.                                                                                                       |           |
| 3.3.3 | Classes-by-year-group grid | Still rendered — the teacher can click into any class to read its matrix (subject to the scope check in section 4). |           |

### 3.4 Classes grid

| #     | What to Check                                | Expected Result                                                                                                                                                                                                       | Pass/Fail |
| ----- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.4.1 | Grid renders the full tenant's classes       | Even though the teacher can only actually _read_ their own classes, the grid itself renders every class because the classes endpoint is permission-agnostic. Clicking an out-of-scope class is what triggers the 403. |           |
| 3.4.2 | Click a class Sarah teaches (e.g. 2A)        | Navigates to `/en/report-cards/{2A id}`. Matrix loads successfully.                                                                                                                                                   |           |
| 3.4.3 | Click a class Sarah does NOT teach (e.g. 6A) | Navigates to the URL. Matrix call returns 403 `CLASS_OUT_OF_SCOPE`. The page shows an EmptyState or load-failed card (depending on how the error code is interpreted).                                                |           |

### 3.5 Navigating to blocked routes directly

| #     | What to Check                                      | Expected Result                                                                                                                                                                   | Pass/Fail |
| ----- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.5.1 | Type `/en/report-cards/generate` into the URL bar  | Teacher lands briefly, the page detects the missing role, shows a toast **"Permission denied"**, and calls `router.replace('/en/report-cards')`. The wizard body never renders.   |           |
| 3.5.2 | Type `/en/report-cards/settings` into the URL bar  | The page loads in **read-only mode**: a grey banner reads **"You're viewing this in read-only mode."**, every input is disabled, and the **Save changes** button is not rendered. |           |
| 3.5.3 | Type `/en/report-cards/analytics` into the URL bar | If Sarah has `report_cards.view`, the page loads with the summary cards (no class comparison chart). In the standard tenant seed, `report_cards.view` is granted to all teachers. |           |

---

## 4. Class Matrix Page (Scoped)

**URL:** `/en/report-cards/{classId}`

### 4.1 Allowed classes

The backend's `assertClassReadScope()` helper lets the teacher read a class's matrix if the class is in ANY of:

- The teacher's `overall_class_ids` (homeroom on the open comment window)
- The teacher's `subject_assignments` (competencies × curriculum matrix)

For Sarah, that means: 2A (homeroom) PLUS the 11–14 classes she teaches subjects in via competencies.

| #   | What to Check                          | Expected Result                                                                                                                                                                     | Pass/Fail |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1 | Navigate to `/en/report-cards/{2A id}` | Matrix loads. Same visual layout as the admin spec sections 9-12: sticky student column, subject columns, Overall column, grade/score toggle, period filter, top-rank badges.       |           |
| 4.2 | Navigate to `/en/report-cards/{1B id}` | Matrix loads — 1B is in Sarah's scope via Business competency for 1st class. She has legitimate read access.                                                                        |           |
| 4.3 | Navigate to `/en/report-cards/{6A id}` | Matrix endpoint returns 403 `CLASS_OUT_OF_SCOPE` with message **"You do not teach this class and cannot read its report cards"**. The page shows an EmptyState with ArrowLeft icon. |           |
| 4.4 | Period filter + Grade/Score toggle     | Work identically to the admin view for classes the teacher is scoped to.                                                                                                            |           |

---

## 5. Report Cards Library (Scoped)

**URL:** `/en/report-cards/library`

### 5.1 Scope enforcement

| #   | What to Check                          | Expected Result                                                                                                                                                                                                                  | Pass/Fail |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1 | Navigate to `/en/report-cards/library` | Network: `GET /api/v1/report-cards/library/grouped` (200). The backend calls `getLandingScopeForActor()` and filters the rows so only report cards for the teacher's scope (homeroom + subject-assignment classes) are returned. |           |
| 5.2 | Row count                              | For Sarah with existing runs in 1A and 2A: **50** rows total (25 + 25). If runs only exist in classes outside her scope, the library shows the **"No documents yet"** empty state.                                               |           |
| 5.3 | View toggles                           | **By run** / **By year group** / **By class** all work. Empty groups are hidden.                                                                                                                                                 |           |

### 5.2 Row-level actions (teachers have fewer)

| #     | Action                             | Teacher result                                                                                                                                                                                                   | Pass/Fail |
| ----- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.2.1 | **Download** (on rows she can see) | Works. Opens the presigned URL in a new tab. Verify the student name on the downloaded PDF matches the expected student.                                                                                         |           |
| 5.2.2 | **Publish** (draft row)            | **403 Forbidden**. The teacher lacks `gradebook.publish_report_cards`. The button is still rendered in the UI but clicking it surfaces an error toast. (A safer fix would be to hide the button for non-admins.) |           |
| 5.2.3 | **Unpublish** / **Revise**         | **403**. Teachers can't unpublish — `gradebook.manage` required.                                                                                                                                                 |           |
| 5.2.4 | **Delete** (draft row or bulk)     | **403**. Teachers can't delete — `gradebook.manage` required.                                                                                                                                                    |           |
| 5.2.5 | **Bundle** downloads               | Work. Bundle endpoint only requires `report_cards.view`. Teachers can export their scoped set to PDF/ZIP.                                                                                                        |           |

### 5.3 Note on admin-only UI exposure

| #     | Observation                                                                          | Expected Result                                                                                                                                                                                                                                     | Pass/Fail |
| ----- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.3.1 | Publish / Unpublish / Delete buttons are visible even though teachers can't use them | UX tightening opportunity: hide these buttons in the row actions column when the user lacks `gradebook.manage`. Current behaviour surfaces permission errors on click rather than hiding the button. Flag for future improvement but not a blocker. |           |

---

## 6. Report Comments Landing (Scoped)

**URL:** `/en/report-comments`

### 6.1 Scope response

| #   | What to Check                    | Expected Result                                                                                                                                                                                                                                           | Pass/Fail |
| --- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1 | Landing scope response for Sarah | `GET /api/v1/report-comment-windows/landing` returns `{is_admin: false, overall_class_ids: ['{2A id}'], subject_assignments: [14 pairs from her competencies], active_window_id: '{id}'}` when a window is open, or `active_window_id: null` when closed. |           |
| 6.2 | Window banner                    | When open: emerald banner with **"Comment window open"**, the period + closes_at, and the principal's note if set. When closed: grey banner with **"Comment window closed"** and a **"Request window reopen"** outline button (teacher-only).             |           |
| 6.3 | Homeroom cards section           | Rendered only when `overall_class_ids.length > 0`. For Sarah: **1 card** titled **"Overall comments · 2A"** with the student count + finalised progress bar.                                                                                              |           |
| 6.4 | Subject cards section            | One section per year group. For Sarah: 5 year-group sections with a total of **11 visible cards** (14 pairs minus the 3 with 0 enrolments: K1B, J1A, SF1A).                                                                                               |           |

### 6.2 Subject cards per year group (Sarah — NHQS)

| #     | Year group   | Cards                              | Pass/Fail |
| ----- | ------------ | ---------------------------------- | --------- |
| 6.2.1 | Kindergarten | Arabic · K1A                       |           |
| 6.2.2 | 1st class    | Business · 1A, Business · 1B       |           |
| 6.2.3 | 2nd class    | English · 2A, English · 2B         |           |
| 6.2.4 | 3rd Class    | History · 3A, History · 3B         |           |
| 6.2.5 | 4th Class    | Mathematics · 4A, Mathematics · 4B |           |
| 6.2.6 | 5th Class    | Biology · 5A, Biology · 5B         |           |

### 6.3 Card-level behaviour

| #     | What to Check                          | Expected Result                                                                                                                                            | Pass/Fail |
| ----- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.3.1 | Card progress bar                      | Uses the `finalised / total` counts fetched per pair (teachers DO get the counts fan-out since they have few cards — the B10 skip applies to admins only). |           |
| 6.3.2 | Progress label                         | **"{done} / {total}"** in tabular numbers. When `total === 0`, shows **"No comments yet"**.                                                                |           |
| 6.3.3 | Card is disabled when window is closed | Background opacity 75, hover border becomes `border-border/80`, and a small tertiary line reads **"Read only"**.                                           |           |
| 6.3.4 | Click a homeroom card                  | Navigates to `/en/report-comments/overall/{class_id}` (section 7).                                                                                         |           |
| 6.3.5 | Click a subject card                   | Navigates to `/en/report-comments/subject/{class_id}/{subject_id}` (section 10).                                                                           |           |

### 6.4 Admin-only controls hidden

| #     | Control                                 | Expected Result                                           | Pass/Fail |
| ----- | --------------------------------------- | --------------------------------------------------------- | --------- |
| 6.4.1 | **Open window** button on closed banner | Hidden. Teachers see **"Request window reopen"** instead. |           |
| 6.4.2 | **Close now** button on open banner     | Hidden.                                                   |           |
| 6.4.3 | **Extend** button on open banner        | Hidden.                                                   |           |
| 6.4.4 | **Reopen** button                       | Hidden.                                                   |           |

---

## 7. Overall Comments Editor — Teacher

**URL:** `/en/report-comments/overall/{classId}` — reachable only for classes where the teacher is on the active window's homeroom assignment list (i.e. `overall_class_ids`).

| #   | What to Check                      | Expected Result                                                                                         | Pass/Fail |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- | --------- |
| 7.1 | Click the 2A homeroom card         | Navigates to `/en/report-comments/overall/{2A id}`. Matrix + comments load in parallel.                 |           |
| 7.2 | Page heading                       | **"Overall comments — 2A"**. Subtitle **"Period: S1"** (or whatever period is active).                  |           |
| 7.3 | **Back to Report Comments** button | Navigates to `/en/report-comments`.                                                                     |           |
| 7.4 | Window banner                      | Same `<WindowBanner>` — when closed, shows the **"Request window reopen"** outline button for teachers. |           |
| 7.5 | Filter dropdown                    | **All** / **Unfinalised** / **Finalised**.                                                              |           |
| 7.6 | Row count                          | Exactly `matrix.students.length` — one row per active enrolment in 2A. For NHQS: **25 rows**.           |           |
| 7.7 | Loading skeleton                   | 6 pulsing bars.                                                                                         |           |

---

## 8. Overall Comments Editor — Write & Finalise

### 8.1 Write a new comment

| #     | What to Check                                            | Expected Result                                                                                                                        | Pass/Fail |
| ----- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1.1 | Click into a row's Textarea                              | Focus ring appears, cursor is in the textarea.                                                                                         |           |
| 8.1.2 | Type a comment (e.g. "Excellent progress this semester") | Local state updates immediately. 500ms after the last keystroke, `POST /api/v1/report-card-overall-comments` fires.                    |           |
| 8.1.3 | During the save                                          | Status helper line above the textarea flips to tertiary **"Saving…"**.                                                                 |           |
| 8.1.4 | After success                                            | Status flips to emerald **"Saved"** for 1.2s then back to idle. `comment_id` is stored so Finalise is now enabled.                     |           |
| 8.1.5 | Save failure                                             | Status flips to red **"Failed to save"**. Toast **"Failed to save"**. The textarea keeps its unsaved content so the teacher can retry. |           |
| 8.1.6 | Empty / whitespace-only text                             | No API call. Status resets to idle. The row is not created in the database.                                                            |           |

### 8.2 Finalise

| #     | What to Check                            | Expected Result                                                                                                                                                           | Pass/Fail |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.2.1 | **Finalise** primary button (Check icon) | Disabled until the row has: non-empty text, a `comment_id` (i.e. at least one successful save), and the window is open.                                                   |           |
| 8.2.2 | Click Finalise                           | `PATCH /api/v1/report-card-overall-comments/{id}/finalise`. Emerald **"Finalised"** badge renders above the textarea. Textarea flips to read-only. Toast **"Finalised"**. |           |
| 8.2.3 | Finalise failure                         | Toast **"Failed to finalise"**. Row stays draft.                                                                                                                          |           |
| 8.2.4 | Finalise when window is closed           | Button is disabled. Cannot be triggered.                                                                                                                                  |           |

---

## 9. Overall Comments Editor — Unfinalise & Filter

### 9.1 Unfinalise

| #     | What to Check                 | Expected Result                                                                                                                                                     | Pass/Fail |
| ----- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.1.1 | **Unfinalise** outline button | RotateCw icon. Replaces Finalise when row has `finalised_at !== null`.                                                                                              |           |
| 9.1.2 | Click Unfinalise              | `PATCH /api/v1/report-card-overall-comments/{id}/unfinalise`. Finalised badge disappears. Textarea becomes editable. The teacher can tweak the text and refinalise. |           |

### 9.2 Filter

| #     | What to Check           | Expected Result                          | Pass/Fail |
| ----- | ----------------------- | ---------------------------------------- | --------- |
| 9.2.1 | Filter dropdown default | **All**. Every row visible.              |           |
| 9.2.2 | Select **Unfinalised**  | Only rows without `finalised_at` render. |           |
| 9.2.3 | Select **Finalised**    | Only rows with `finalised_at` render.    |           |

### 9.3 Closed-window state

| #     | What to Check             | Expected Result                                                                                                                                   | Pass/Fail |
| ----- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 9.3.1 | When the window is closed | Banner shows **"Comment window closed"** + **"Request window reopen"** button. All textareas are read-only. Finalise/Unfinalise buttons disabled. |           |
| 9.3.2 | Footer banner             | Below the table, a grey info card: **"The comment window is closed — you're viewing a read-only snapshot."**.                                     |           |

---

## 10. Subject Comments Editor — Teacher

**URL:** `/en/report-comments/subject/{classId}/{subjectId}`

| #    | What to Check                                    | Expected Result                                                                                                     | Pass/Fail |
| ---- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1 | Click a subject card (e.g. **Mathematics · 4A**) | Navigates to `/en/report-comments/subject/{4A id}/{Mathematics id}`. Matrix + subject comments load.                |           |
| 10.2 | Page heading                                     | **"Mathematics — 4A"**. Subtitle **"Period: S1"**.                                                                  |           |
| 10.3 | **Back to Report Comments** button               | Navigates to `/en/report-comments`.                                                                                 |           |
| 10.4 | Toolbar                                          | Two primary buttons on the left (**AI-draft all empty**, **Finalise all drafts**) + a filter dropdown on the right. |           |
| 10.5 | Row count                                        | One row per student in the class (not filtered by subject — every student in 4A is a potential comment recipient).  |           |
| 10.6 | Score column                                     | Shows the student's actual `{subject}` cell score. The row's sparkline visualises `[score, weighted_average]`.      |           |

---

## 11. Subject Comments Editor — Write & Autosave

| #    | What to Check                       | Expected Result                                                                                                                                                                                                                    | Pass/Fail |
| ---- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1 | Type a comment in a row             | Local state updates. 500ms later, `POST /api/v1/report-card-subject-comments` fires with `{student_id, subject_id, class_id, academic_period_id, comment_text, is_ai_draft: false}`.                                               |           |
| 11.2 | Successful save                     | Row id, is_ai_draft, and finalised_at are updated from the response. Status flips idle → saving → saved → idle.                                                                                                                    |           |
| 11.3 | Save while typing resets the timer  | Each keystroke clears the previous `setTimeout` — only one save fires per "typing burst".                                                                                                                                          |           |
| 11.4 | Editing a previously AI-drafted row | The purple **AI draft** badge disappears immediately as soon as the teacher edits the text. Saved payload includes `is_ai_draft: false`.                                                                                           |           |
| 11.5 | Save failure                        | Toast **"Failed to save"**. Status flips to error. Textarea keeps the unsaved text.                                                                                                                                                |           |
| 11.6 | Cross-class write attempt           | Not reachable from the UI — the editor will only load for classes in the teacher's `subject_assignments`. A direct POST with a class/subject pair the teacher doesn't own returns 403 with the corresponding INVALID_AUTHOR error. |           |

---

## 12. Subject Comments Editor — AI Draft (Per Row)

| #    | What to Check                                               | Expected Result                                                                                                                                                                                                                     | Pass/Fail |
| ---- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | **AI draft** outline button (Sparkles icon) on a single row | Disabled when window closed, row is drafting, or row is already finalised.                                                                                                                                                          |           |
| 12.2 | Click AI draft                                              | Status flips to purple **"Drafting…"**. `POST /api/v1/report-card-subject-comments/ai-draft` fires with the same payload shape as a normal save but no `comment_text`.                                                              |           |
| 12.3 | Successful response                                         | The backend calls the AI service, generates a comment based on the student's scores, and returns the row. The Textarea is populated with the new text. A purple **"AI draft"** Badge appears above. Toast **"AI draft generated"**. |           |
| 12.4 | Subsequent edits                                            | As soon as the teacher types, the purple badge vanishes and `is_ai_draft` flips to false for the next autosave.                                                                                                                     |           |
| 12.5 | AI failure                                                  | Toast **"AI draft failed"**. Status flips to error.                                                                                                                                                                                 |           |

---

## 13. Subject Comments Editor — Bulk AI Draft

| #    | What to Check                         | Expected Result                                                                                                                                                           | Pass/Fail |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1 | **AI-draft all empty** toolbar button | Sparkles icon. Label flips to **"Drafting…"** while running. Disabled while any bulk is in flight or window is closed.                                                    |           |
| 13.2 | Click                                 | Filters rows with empty text. For each such row, calls `handleAiDraft()` sequentially (no parallel stampede). Each row's status transitions purple → saved independently. |           |
| 13.3 | Empty result                          | If no rows are empty, an error toast **"No empty rows to draft"** appears and no API calls fire.                                                                          |           |
| 13.4 | Partial failure                       | If one row's draft fails, the loop continues to the next. The failed row stays with a red error state.                                                                    |           |

---

## 14. Subject Comments Editor — Bulk Finalise

| #    | What to Check                          | Expected Result                                                                                                                                                                                                                                               | Pass/Fail |
| ---- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.1 | **Finalise all drafts** toolbar button | Check icon. Label flips to **"Finalising…"** while running.                                                                                                                                                                                                   |           |
| 14.2 | Click                                  | Filters rows with `comment_id`, non-empty text, and not already finalised. If zero matches, toast **"No comments to finalise"**. Otherwise fires `POST /api/v1/report-card-subject-comments/bulk-finalise` with `{class_id, subject_id, academic_period_id}`. |           |
| 14.3 | Successful response                    | Response is `{count: n}`. All matching rows locally get `finalised_at = new Date().toISOString()`. Toast **"Finalised {n} drafts"**. Rows become read-only.                                                                                                   |           |
| 14.4 | Failure                                | Toast **"Failed to finalise"**. No optimistic update.                                                                                                                                                                                                         |           |

---

## 15. Subject Comments Editor — Unfinalise

| #    | What to Check                         | Expected Result                                                                                                                                    | Pass/Fail |
| ---- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 15.1 | **Unfinalise** outline button per row | RotateCw icon. Replaces Finalise when row is finalised. Disabled when window closed.                                                               |           |
| 15.2 | Click                                 | `PATCH /api/v1/report-card-subject-comments/{id}/unfinalise`. Finalised badge disappears. Textarea editable. Teacher can refinalise after editing. |           |

---

## 16. Request Window Reopen Modal

Only reachable when the window is closed.

### 16.1 Opening the modal

| #      | What to Check                                     | Expected Result                                                                                                | Pass/Fail |
| ------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1.1 | **Request window reopen** button on closed banner | MailPlus icon. Only visible for non-admins when `onRequestReopen` is passed. Opens the `<RequestReopenModal>`. |           |
| 16.1.2 | Network calls on open                             | `GET /api/v1/academic-periods?pageSize=50`, `GET /api/v1/academic-years?pageSize=20`.                          |           |

### 16.2 Period/Year picker

| #      | What to Check             | Expected Result                                                                                                                                              | Pass/Fail |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 16.2.1 | Dropdown contents         | Top section: one **"Full year — {year name}"** option per year (active year first). Below that: every period from the first call in order (S1, S2 for NHQS). |           |
| 16.2.2 | Default value             | Pre-filled with `defaultPeriodId` when the modal is opened from a specific window. Otherwise empty (placeholder).                                            |           |
| 16.2.3 | Select a period           | Stores the period UUID in `scope_token` state.                                                                                                               |           |
| 16.2.4 | Select a Full Year option | Stores `full_year:{year_id}` as the scope_token.                                                                                                             |           |
| 16.2.5 | Validation                | The Zod schema requires a UUID OR a `full_year:{uuid}` pattern. Empty submit shows **"Please select a period"** error.                                       |           |

### 16.3 Reason field

| #      | What to Check | Expected Result                                                                                                            | Pass/Fail |
| ------ | ------------- | -------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.3.1 | Textarea      | 4 rows. Placeholder explains why a reason is needed.                                                                       |           |
| 16.3.2 | Validation    | Min 10 characters after trim, max 2000. Empty or too-short submit shows **"Reason must be at least 10 characters"** error. |           |

### 16.4 Submit

| #      | What to Check            | Expected Result                                                                                                                                                                                                         | Pass/Fail |
| ------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.4.1 | Click **Submit request** | `POST /api/v1/report-card-teacher-requests` with `{request_type: 'open_comment_window', academic_period_id or academic_year_id, target_scope_json: null, reason}`. On 201, toast **"Request submitted"**. Modal closes. |           |
| 16.4.2 | Full-year variant        | When the scope_token starts with `full_year:`, the payload sends `academic_period_id: null` and `academic_year_id: {year_id}`.                                                                                          |           |
| 16.4.3 | Per-period variant       | Payload sends only `academic_period_id: {period_id}` (no academic_year_id override — the backend derives it from the period).                                                                                           |           |
| 16.4.4 | Failure                  | Toast **"Failed to submit"**. Modal stays open.                                                                                                                                                                         |           |

---

## 17. Teacher Requests — List Page

**URL:** `/en/report-cards/requests`

Teachers see only their own requests (backend-scoped by `requested_by_user_id = user.id`).

| #    | What to Check                           | Expected Result                                                                                                                                                          | Pass/Fail |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 17.1 | Navigate to `/en/report-cards/requests` | Network: `GET /api/v1/report-card-teacher-requests?pageSize=100`. Backend scopes to Sarah's requests only. `GET /api/v1/academic-periods?pageSize=100` for period names. |           |
| 17.2 | Page heading                            | **"Report Card Requests"** with subtitle.                                                                                                                                |           |
| 17.3 | Tab row                                 | Teachers do NOT see the admin tabs (**Pending review** / **All**). They see a flat list of their own requests in every status.                                           |           |
| 17.4 | **New request** button                  | Visible for teachers (Plus icon, primary). On click, navigates to `/en/report-cards/requests/new`.                                                                       |           |
| 17.5 | Empty state                             | When Sarah has no requests: EmptyState with MessageSquare icon and localised **"No requests yet"** title.                                                                |           |
| 17.6 | Table columns (teacher view)            | **Type**, **Period**, **Scope**, **Reason**, **Status**, **Requested**, **Actions**. **Requester** column is admin-only and hidden for teachers.                         |           |
| 17.7 | Row action — **Cancel**                 | Only visible on Sarah's own `pending` rows. Opens a destructive-variant ConfirmDialog.                                                                                   |           |
| 17.8 | Row action — **Review** (ghost variant) | Visible on all non-pending own rows and (redundantly) as a secondary action. Navigates to the detail page.                                                               |           |
| 17.9 | Status badge variants                   | Same as admin spec: `pending` warning, `approved` info, `completed` success, `rejected` danger, `cancelled` secondary.                                                   |           |

---

## 18. Teacher Requests — New Request Page

**URL:** `/en/report-cards/requests/new`

| #     | What to Check                                   | Expected Result                                                                                                                                                                                                                          | Pass/Fail |
| ----- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 18.1  | Navigate via the **New request** button         | URL becomes `/en/report-cards/requests/new`. Network: `GET /api/v1/academic-periods?pageSize=50`, `GET /api/v1/year-groups?pageSize=100`, `GET /api/v1/classes?pageSize=200`.                                                            |           |
| 18.2  | Page heading                                    | **"Submit a request"** (localised) with subtitle.                                                                                                                                                                                        |           |
| 18.3  | **Back to requests** button                     | Navigates to `/en/report-cards/requests`.                                                                                                                                                                                                |           |
| 18.4  | **Request type** radio group                    | Two options:                                                                                                                                                                                                                             |           |
|       | Option 1: **Reopen comment window**             | Radio value `open_comment_window`. Default selected.                                                                                                                                                                                     |           |
|       | Option 2: **Regenerate report cards**           | Radio value `regenerate_reports`.                                                                                                                                                                                                        |           |
| 18.5  | **Period** Select                               | Required. Every period from the API.                                                                                                                                                                                                     |           |
| 18.6  | **Scope** section (only when type = regenerate) | A second radio group: **Year group**, **Class**, **Student**. Required.                                                                                                                                                                  |           |
| 18.7  | **Scope** — Year group mode                     | Checklist of every year group. Click to select one or more.                                                                                                                                                                              |           |
| 18.8  | **Scope** — Class mode                          | Checklist of every class. Click to select.                                                                                                                                                                                               |           |
| 18.9  | **Scope** — Student mode                        | Search input + debounced results list + selected chips. Min 2 characters to search; `GET /api/v1/students?pageSize=20&search=...` fires on each trigger.                                                                                 |           |
| 18.10 | **Reason** textarea                             | Min 10 characters, max 2000. Error message when too short.                                                                                                                                                                               |           |
| 18.11 | Submit                                          | `POST /api/v1/report-card-teacher-requests` with `{request_type, academic_period_id, target_scope_json, reason}`. On success, toast **"Submitted"** + navigate to `/en/report-cards/requests`. On failure, toast **"Failed to submit"**. |           |
| 18.12 | Query-param pre-fill                            | Navigating to `/en/report-cards/requests/new?type=regenerate_reports&period_id=...&class_id=...` auto-selects regenerate + class scope + the given class id. Query params are cleared after consumption.                                 |           |

---

## 19. Teacher Request — Detail & Cancel

**URL:** `/en/report-cards/requests/{id}`

| #    | What to Check                                                  | Expected Result                                                                                                                              | Pass/Fail |
| ---- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 19.1 | Navigate to Sarah's own pending request                        | Page loads with the detail card. Same layout as admin spec section 51 minus the admin action buttons.                                        |           |
| 19.2 | Action buttons for a teacher viewing their own pending request | Only **Cancel** outline button. No Approve / Auto-approve / Reject (admin-only).                                                             |           |
| 19.3 | Click **Cancel**                                               | Opens a ConfirmDialog titled **"Cancel this request?"** with destructive variant. Confirm button labelled **"Cancel request"**.              |           |
| 19.4 | Confirm the cancel                                             | `PATCH /api/v1/report-card-teacher-requests/{id}/cancel`. Toast **"Request cancelled"**. Detail page refetches; status flips to `cancelled`. |           |
| 19.5 | Cancel an already-approved or rejected request                 | Backend rejects with an error. Toast **"Failed to cancel"**. Status stays.                                                                   |           |
| 19.6 | Navigate to another teacher's request (by guessing the id)     | Backend scopes the detail endpoint — returns 404 `TEACHER_REQUEST_NOT_FOUND`. The page shows the not-found EmptyState.                       |           |

---

## 20. Cross-Class Blocking (Negative Assertions)

These are the invariants the backend must enforce for Sarah. Run each check from DevTools' Console or a REST client with Sarah's bearer token.

### 20.1 Write blocks

| #      | Action                                                           | Expected Result                                                                                                                                                                            | Pass/Fail |
| ------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 20.1.1 | POST overall comment for 1B (not Sarah's homeroom)               | `POST /api/v1/report-card-overall-comments` with `{class_id: '{1B id}', ...}` returns `403 INVALID_AUTHOR` "No homeroom teacher is assigned for this class on the current comment window". |           |
| 20.1.2 | POST subject comment for History 6A (Sarah has no 6A competency) | `403 INVALID_AUTHOR` "Only the assigned subject teacher can author this comment".                                                                                                          |           |
| 20.1.3 | PATCH finalise on a comment created by another teacher           | `403`.                                                                                                                                                                                     |           |
| 20.1.4 | PATCH unfinalise on a comment created by another teacher         | `403`.                                                                                                                                                                                     |           |
| 20.1.5 | POST AI draft for a subject/class pair Sarah doesn't teach       | `403 INVALID_AUTHOR`.                                                                                                                                                                      |           |
| 20.1.6 | POST bulk-finalise for a subject/class pair Sarah doesn't teach  | `403 INVALID_AUTHOR`.                                                                                                                                                                      |           |

### 20.2 Read blocks (B12)

| #      | Action                                                                | Expected Result                                                                                                                                     | Pass/Fail |
| ------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.2.1 | GET `/api/v1/report-cards/classes/{6A id}/matrix`                     | `403 CLASS_OUT_OF_SCOPE` "You do not teach this class and cannot read its report cards". 6A is out of Sarah's scope (no 6th class competency).      |           |
| 20.2.2 | GET `/api/v1/report-cards?class_id=...` with an out-of-scope class id | For non-admins, the controller narrows `class_ids` to the teacher's allowed set via `getLandingScopeForActor()`. Out-of-scope ids are filtered out. |           |
| 20.2.3 | GET `/api/v1/report-cards?pageSize=100` with no class filter          | Returns only report cards scoped to Sarah's classes (homeroom + subject_assignments).                                                               |           |
| 20.2.4 | GET `/api/v1/report-card-overall-comments?class_id={1B id}`           | The backend scopes overall comments to the teacher's homeroom. Non-homeroom reads return an empty list (not a 403).                                 |           |

### 20.3 Admin-only management blocks

| #      | Action                                 | Expected Result                         | Pass/Fail |
| ------ | -------------------------------------- | --------------------------------------- | --------- |
| 20.3.1 | POST to open a comment window          | `403` — `report_cards.manage` required. |           |
| 20.3.2 | PATCH close / extend / reopen          | `403`.                                  |           |
| 20.3.3 | PATCH approve / reject teacher request | `403`.                                  |           |
| 20.3.4 | POST generation run                    | `403` — `report_cards.manage` required. |           |
| 20.3.5 | PATCH tenant settings                  | `403` — `report_cards.manage` required. |           |
| 20.3.6 | POST / DELETE principal signature      | `403`.                                  |           |

---

## 21. What Teachers Must NOT See or Do

A quick negative-assertion checklist. Every item should be **absent** in the teacher UI.

| #     | Feature                                                                     | Present on admin UI? | Expected for teacher                                              | Pass/Fail |
| ----- | --------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------- | --------- |
| 21.1  | Dashboard — **Generate report cards** tile                                  | Yes                  | Hidden                                                            |           |
| 21.2  | Dashboard — **Teacher requests** tile                                       | Yes                  | Hidden                                                            |           |
| 21.3  | Dashboard — Live generation run panel                                       | Yes                  | Hidden                                                            |           |
| 21.4  | Dashboard — Analytics snapshot panel                                        | Yes                  | Hidden                                                            |           |
| 21.5  | Dashboard — Settings cog button                                             | Yes                  | Hidden                                                            |           |
| 21.6  | Report Comments landing — **Open window** button                            | Yes                  | Hidden (replaced with **Request window reopen** only when closed) |           |
| 21.7  | Report Comments landing — **Close now** button                              | Yes                  | Hidden                                                            |           |
| 21.8  | Report Comments landing — **Extend** button                                 | Yes                  | Hidden                                                            |           |
| 21.9  | Report Comments landing — **Reopen** button                                 | Yes                  | Hidden                                                            |           |
| 21.10 | Requests list — **Pending review** / **All** tabs                           | Yes                  | Hidden (flat own-only list)                                       |           |
| 21.11 | Requests list — **Requester** column                                        | Yes                  | Hidden                                                            |           |
| 21.12 | Request detail — **Approve & open** / **Auto-approve** / **Reject** buttons | Yes                  | Hidden                                                            |           |
| 21.13 | Settings page — all Save buttons + enabled inputs                           | Yes                  | Hidden / disabled (read-only banner at top)                       |           |
| 21.14 | Generate wizard — entire page                                               | Yes                  | Redirected with "Permission denied" toast                         |           |

---

## 22. Arabic / RTL

Switch to `/ar/` by replacing the locale segment in the URL.

| #    | What to Check          | Expected Result                                                                                                         | Pass/Fail |
| ---- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------- |
| 22.1 | `/ar/report-cards`     | Full RTL layout, Arabic labels. Quick action tiles mirror. Period selector mirrors.                                     |           |
| 22.2 | `/ar/report-comments`  | Same — the landing page mirrors cleanly. Year-group section headers are Arabic.                                         |           |
| 22.3 | Overall/Subject editor | Sticky student column is on the right in RTL. Score column in the middle. Comment column on the left.                   |           |
| 22.4 | Grade cells            | Wrapped in `dir="ltr"` so numeric grades and letters render left-to-right inside the RTL layout.                        |           |
| 22.5 | Textarea content       | Accepts Arabic input. Autosave POSTs the UTF-8 text without mangling.                                                   |           |
| 22.6 | Dates                  | Rendered via `Intl.DateTimeFormat('ar-u-ca-gregory-nu-latn')` — Gregorian calendar, Latin numerals, Arabic month names. |           |
| 22.7 | Request reopen modal   | Period picker items include Arabic translations for "Full year".                                                        |           |

---

## 23. Console & Network Health

| #    | What to Check                 | Expected Result                                                                                                                                                                          | Pass/Fail |
| ---- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 23.1 | Console errors                | Zero uncaught errors. `console.error` lines only when an API call genuinely fails.                                                                                                       |           |
| 23.2 | 401 on `/api/v1/auth/refresh` | Expected at initial login page load before login. After login, should not reappear unless the access token expires mid-session (refresh flow).                                           |           |
| 23.3 | 403 responses                 | Only on deliberate out-of-scope writes/reads (section 20). The UI surfaces these with toasts, not crashes.                                                                               |           |
| 23.4 | 429 rate limit                | Should NOT appear on the Report Comments landing. Teachers have at most 14 subject pairs + ~1 homeroom — the 2×N count fan-out at batch size 5 fits within the 100 req / 60 s throttler. |           |
| 23.5 | Autosave deduplication        | Fast typing triggers a single save per 500ms. No burst of redundant POSTs.                                                                                                               |           |

---

## 24. Backend Endpoint Map (Teacher Scope)

Quick reference of every endpoint a teacher actually hits. All others should return 403 for Sarah.

| Method | Path                                                                                                   | Used by                                                   | Required permission                            |
| ------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------------- |
| GET    | `/api/v1/report-cards`                                                                                 | Library (section 5)                                       | `gradebook.view` (scoped by controller)        |
| GET    | `/api/v1/report-cards/classes/:classId/matrix?academic_period_id=...`                                  | Class matrix (4), Overall editor (7), Subject editor (10) | `report_cards.view` + `assertClassReadScope()` |
| GET    | `/api/v1/report-cards/library?page=1&pageSize=1`                                                       | Dashboard library count                                   | `report_cards.view`                            |
| GET    | `/api/v1/report-cards/library/grouped`                                                                 | Library page (5)                                          | `report_cards.view` (backend filters by scope) |
| GET    | `/api/v1/report-cards/library/bundle-pdf?...`                                                          | Bundle downloads (5.2.5)                                  | `report_cards.view`                            |
| GET    | `/api/v1/report-cards/analytics/dashboard?academic_period_id=...`                                      | Direct-nav analytics page                                 | `report_cards.view`                            |
| GET    | `/api/v1/report-card-tenant-settings`                                                                  | Settings page (read-only)                                 | `report_cards.view`                            |
| GET    | `/api/v1/report-cards/templates/content-scopes`                                                        | Settings template dropdown (read-only)                    | `report_cards.view`                            |
| GET    | `/api/v1/report-card-teacher-requests?pageSize=100`                                                    | Requests list (17)                                        | `report_cards.comment` (scoped by controller)  |
| GET    | `/api/v1/report-card-teacher-requests/:id`                                                             | Request detail (19)                                       | `report_cards.comment` (scoped)                |
| POST   | `/api/v1/report-card-teacher-requests`                                                                 | New request form (18), Request reopen modal (16)          | `report_cards.comment`                         |
| PATCH  | `/api/v1/report-card-teacher-requests/:id/cancel`                                                      | Cancel own (19.3-4)                                       | `report_cards.comment`                         |
| GET    | `/api/v1/report-comment-windows/active`                                                                | Landing, Overall editor, Subject editor                   | `report_cards.view`                            |
| GET    | `/api/v1/report-comment-windows/landing`                                                               | Landing scope (6)                                         | `report_cards.view`                            |
| GET    | `/api/v1/report-card-overall-comments?class_id=...&academic_period_id=...&pageSize=200`                | Overall editor (7)                                        | `report_cards.view`                            |
| POST   | `/api/v1/report-card-overall-comments`                                                                 | Overall autosave (8.1)                                    | `report_cards.comment` + homeroom check        |
| PATCH  | `/api/v1/report-card-overall-comments/:id/finalise`                                                    | Finalise (8.2)                                            | `report_cards.comment` + homeroom check        |
| PATCH  | `/api/v1/report-card-overall-comments/:id/unfinalise`                                                  | Unfinalise (9.1)                                          | `report_cards.comment` + homeroom check        |
| GET    | `/api/v1/report-card-subject-comments?class_id=...&subject_id=...&academic_period_id=...&pageSize=200` | Subject editor (10)                                       | `report_cards.view`                            |
| POST   | `/api/v1/report-card-subject-comments`                                                                 | Subject autosave (11)                                     | `report_cards.comment` + competency check      |
| POST   | `/api/v1/report-card-subject-comments/ai-draft`                                                        | AI draft (12, 13)                                         | `report_cards.comment` + competency check      |
| POST   | `/api/v1/report-card-subject-comments/bulk-finalise`                                                   | Bulk finalise (14)                                        | `report_cards.comment` + competency check      |
| PATCH  | `/api/v1/report-card-subject-comments/:id/finalise`                                                    | Row finalise (11, 13)                                     | `report_cards.comment` + competency check      |
| PATCH  | `/api/v1/report-card-subject-comments/:id/unfinalise`                                                  | Row unfinalise (15)                                       | `report_cards.comment` + competency check      |
| GET    | `/api/v1/academic-periods?pageSize=...`                                                                | Everywhere                                                | any authenticated                              |
| GET    | `/api/v1/academic-years?pageSize=...`                                                                  | Request reopen modal                                      | any authenticated                              |
| GET    | `/api/v1/year-groups?pageSize=100`                                                                     | Dashboard, Landing, New request                           | any authenticated                              |
| GET    | `/api/v1/classes?pageSize=...`                                                                         | Dashboard, Landing, New request                           | any authenticated                              |
| GET    | `/api/v1/subjects?pageSize=100`                                                                        | Landing                                                   | any authenticated                              |
| GET    | `/api/v1/students?pageSize=20&search=...`                                                              | New request student search                                | `students.view`                                |

---

**End of Teacher spec.** Sign off below when every row is checked.

| Reviewer name | Date | Pass count | Fail count | Overall result |
| ------------- | ---- | ---------- | ---------- | -------------- |
|               |      |            |            |                |
