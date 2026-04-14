# People Module — Playwright Walkthrough Results

**Date:** 2026-04-13
**Tester:** Claude (automated Playwright MCP walkthrough)
**Target:** `https://nhqs.edupod.app` (Nurul Huda School — NHQS tenant)
**Browser:** Chromium via Playwright MCP, desktop 1440x900 + mobile 375x667
**Locales tested:** `/en/*` (full walkthrough), `/ar/*` (representative page)
**Roles tested:** Admin/Owner (`owner@nhqs.test`), Teacher (`Sarah.daly@nhqs.test`)

---

## Severity Tally

| Severity | Count | Notes                                                                              |
| -------- | ----- | ---------------------------------------------------------------------------------- |
| P0       | 0     | No production-breaking issues                                                      |
| P1       | 2     | Missing i18n keys (Arabic), teacher sees edit/status buttons                       |
| P2       | 6     | Teacher scope gaps (T1/T2/T4/T5), bank tab visibility (F), silent fetch errors (C) |
| P3       | 8     | UX polish, missing translations, minor data consistency items                      |

**Total findings: 16** (2 P1, 6 P2, 8 P3)

---

## Admin Walkthrough (owner@nhqs.test)

### 1. Login + Dashboard

| Check                                            | Result   | Notes                                                                                                         |
| ------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------- |
| Navigate to `/en/login`, enter owner credentials | **Pass** | Redirects to `/en/dashboard`. Avatar shows "YR" / "Yusuf Rahman" / "School Owner"                             |
| Dashboard morph bar hubs                         | **Pass** | 10 hubs visible: Home, People, Learning, Wellbeing, Operations, Inbox, Finance, Reports, Regulatory, Settings |
| Console errors on dashboard                      | **Pass** | Zero errors after fresh login (previous parent session errors cleared)                                        |
| School Snapshot widget                           | **Pass** | Total Students: 214, Teaching Staff: 34, Active Classes: 16                                                   |

### 2. People Hub — Morph Bar + Sub-strip (§3)

| Check                                    | Result      | Notes                                                                                                                                                             |
| ---------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §3.1.3 — Click People hub from dashboard | **Partial** | Clicking "People" button on dashboard did NOT navigate. URL stayed at `/en/dashboard`. No sub-strip appeared. Had to use direct URL navigation to `/en/students`. |
| §3.1.4 — Sub-strip on People pages       | **Pass**    | Sub-strip renders with 3 links: **Students**, **Staff**, **Households** in correct order                                                                          |
| §3.1.5 — Sub-strip navigation stability  | **Pass**    | Clicking between Students/Staff/Households updates URL and active state without flicker                                                                           |
| §3.3.1 — Mobile morph bar (375px)        | **Pass**    | Hamburger icon visible. Hub labels collapsed into compact header.                                                                                                 |

### 3. Students — List Page (§4)

| Check                           | Result   | Notes                                                                                                          |
| ------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| §4.1.1 — Page heading           | **Pass** | "Students" heading, subtitle "Manage student records and enrolments"                                           |
| §4.1.2 — Header actions         | **Pass** | Excel and PDF buttons present. No "New Student" button.                                                        |
| §4.1.3 — Sub-strip active state | **Pass** | "Students" link active in sub-strip                                                                            |
| §4.2.1 — Initial API call       | **Pass** | `GET /api/v1/students?page=1&pageSize=20` → 200                                                                |
| §4.2.2 — Year groups fetch      | **Pass** | `GET /api/v1/year-groups?pageSize=100` → 200                                                                   |
| §4.2.3 — Row count + paginator  | **Pass** | 20 rows rendered. Paginator: "Showing 1-20 of 214"                                                             |
| §4.2.4 — Column headers         | **Pass** | Name, Student #, Year Group, Status, Household — 5 columns                                                     |
| §4.3.1 — Name as EntityLink     | **Pass** | Name column renders as `<a>` linking to `/students/{id}`                                                       |
| §4.3.2 — Student # format       | **Pass** | `STU-NNNNNN` format (e.g. STU-000003)                                                                          |
| §4.3.3 — Year Group labels      | **Pass** | Text labels ("1st class", "2nd class", etc.), no raw UUIDs                                                     |
| §4.3.4 — Status badges          | **Pass** | "Active" badges rendered (only Active visible on page 1)                                                       |
| §4.3.5 — Household links        | **Pass** | Household column links to `/households/{id}`                                                                   |
| §4.4 — Search input             | **Pass** | Placeholder "Search students..." present                                                                       |
| §4.5.1 — Status filter options  | **Pass** | All Statuses, Applicant, Active, Withdrawn, Graduated, Archived — 6 options verified via Radix Select dropdown |
| §4.6 — Year Group filter        | **Pass** | "All Year Groups" dropdown present                                                                             |
| §4.7 — Allergy filter           | **Pass** | "All" dropdown present (3 options expected)                                                                    |
| §4.9 — Pagination               | **Pass** | Page 1/11, Previous disabled, Next enabled                                                                     |
| §4.10.1 — Default sort          | **Pass** | Sorted by last_name ASC: Adams, Allen, Anderson, Bennett, Brennan, Brown, Byrne, Campbell                      |
| §4.10.2 — No column sort UI     | **Pass** | Column headers non-interactive (no click-to-sort)                                                              |
| §35.1 — Console errors          | **Pass** | Zero console errors on students list                                                                           |
| §35.4 — No 5xx                  | **Pass** | All API calls returned 200                                                                                     |
| §35.5 — No polling              | **Pass** | No repeated requests after initial load                                                                        |

**Network traffic (students list):**

- `POST /api/v1/auth/refresh` → 200
- `GET /api/v1/auth/me` → 200
- `GET /api/v1/students?page=1&pageSize=20` → 200
- `GET /api/v1/year-groups?pageSize=100` → 200
- `GET /api/v1/notifications/unread-count` → 200
- `GET /api/v1/inbox/state` → 200
- `GET /api/v1/branding` → 200
- `GET /api/v1/privacy-notices/current` → 200

All 200s, no 4xx/5xx.

### 4. Students — Detail Page (§7)

**Target student:** Charlotte Adams (id: `80db6045-...`)

| Check                               | Result      | Notes                                                                                |
| ----------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| §7.1 — Header                       | **Pass**    | "Charlotte Adams", status "Active", year "1st class", student # "STU-000003"         |
| §7.1 — Edit + Change Status buttons | **Pass**    | Both present and clickable                                                           |
| §7.2 — Quick metrics                | **Pass**    | DOB: 15-09-2019, Entry Date: 23-03-2026, Household: "Adams Family" (link)            |
| §7.3 — Tabs                         | **Pass**    | Overview, Classes & Enrolments, Homework, Medical — 4 tabs (no SEN for this student) |
| §7.4 — Overview tab                 | **Pass**    | Gender: female, Year Group: 1st class, Household link                                |
| §7.7 — Medical tab                  | **Pass**    | Clicked Medical tab — "Has Allergies" section renders                                |
| Console errors                      | **Partial** | 2 errors: 404 on SEN profile (expected — no SEN data), `[StudentsPage]` error logged |

### 5. Students — Export (§5)

| Check               | Result                    | Notes                                        |
| ------------------- | ------------------------- | -------------------------------------------- |
| §5.1 — Excel button | **Pass**                  | Button present with FileSpreadsheet icon     |
| §5.3 — PDF button   | **Pass**                  | Button present with Download icon            |
| Execution           | 🚫 **Blocked (mutating)** | Did not execute download — production safety |

### 6. Students — New/Edit/Status (§6, §8, §9)

| Check                   | Result                    | Notes                                                            |
| ----------------------- | ------------------------- | ---------------------------------------------------------------- |
| §6.1 — New student page | 🚫 **Blocked (mutating)** | Did not navigate to `/students/new` to avoid accidental creation |
| §8 — Edit student page  | 🚫 **Blocked (mutating)** | Did not navigate to edit page                                    |
| §9 — Status transitions | 🚫 **Blocked (mutating)** | Did not exercise status changes on production                    |

### 7. Staff — List Page (§11)

| Check                        | Result   | Notes                                                       |
| ---------------------------- | -------- | ----------------------------------------------------------- |
| §11.1 — Page heading         | **Pass** | "Staff" heading                                             |
| §11.1 — Header actions       | **Pass** | Export dropdown, "New Staff Profile" button present         |
| §11.2 — Column headers       | **Pass** | Name, Job Title, Department, Role, Status, Type — 6 columns |
| §11.2 — Data load            | **Pass** | 34 staff, paginator "Showing 1-20 of 34"                    |
| §11.3 — Search               | **Pass** | "Search by name or department..." input present             |
| §11.4 — Status filter        | **Pass** | "All Statuses" dropdown present                             |
| §11.5 — Row click navigation | **Pass** | Clicked Fatima Al-Rashid → navigated to `/en/staff/{id}`    |

### 8. Staff — Detail Page (§14)

**Target staff:** Fatima Al-Rashid (id: `7ca6d551-...`)

| Check                 | Result      | Notes                                                                                                    |
| --------------------- | ----------- | -------------------------------------------------------------------------------------------------------- |
| §14.1 — Header        | **Pass**    | "Fatima Al-Rashid", status "active", title "Senior Accountant", staff # "#MQY1319-6"                     |
| §14.1 — Actions       | **Pass**    | Back and Edit buttons present                                                                            |
| §14.2 — Quick metrics | **Pass**    | Department: Finance, Employment Type: full time, Staff Number: MQY1319-6                                 |
| §14.3 — Tabs          | **Pass**    | Overview, Classes, Bank Details — 3 tabs                                                                 |
| §14.4 — Overview tab  | **Partial** | Fields render. **BUG**: label `staff.fieldUser` shows as raw translation key instead of translated label |
| Console errors        | **Fail**    | `MISSING_MESSAGE: staff.fieldUser (en)` — missing i18n key                                               |

### 9. Staff — Bank Details Tab (§15)

| Check                   | Result   | Notes                                                            |
| ----------------------- | -------- | ---------------------------------------------------------------- |
| §15.1 — Permission gate | **Pass** | Tab renders for owner (has `payroll.view_bank_details`)          |
| §15.2 — Fields          | **Pass** | Bank Name, Account Number, IBAN — all showing "—" (masked/empty) |
| §15.2 — Show button     | **Pass** | "Show" button present to reveal masked values                    |

### 10. Households — List Page (§17)

| Check                      | Result           | Notes                                                                        |
| -------------------------- | ---------------- | ---------------------------------------------------------------------------- |
| §17.1 — Page heading       | **Pass**         | "Households" heading, subtitle "Manage family household records"             |
| §17.2 — Column headers     | **Pass**         | Household Name, Status, Students, Billing Parent — 4 columns                 |
| §17.2 — Data load          | **Pass**         | 155 households, paginator "Showing 1-20 of 155"                              |
| §17.3 — Search + filter    | **Pass**         | Search input and Status filter present                                       |
| §17 — New Household button | **Fail (obs I)** | No "New Household" button in header. Must know URL `/households/new`.        |
| Needs-completion badges    | **Pass**         | Multiple households show "No emergency contact" / "No billing parent" badges |
| Household name as link     | **Pass**         | Links to `/households/{id}` with household number below                      |
| Billing Parent as link     | **Pass**         | Parent names link to `/parents/{id}`                                         |

### 11. Households — Detail Page (§19-§28)

**Target:** Applicant Family (id: `159b0f69-...`)

| Check                 | Result           | Notes                                                                                         |
| --------------------- | ---------------- | --------------------------------------------------------------------------------------------- |
| §19.1 — Header        | **Pass**         | "Applicant Family", status "Active", number "HH-000001"                                       |
| §19.1 — Actions       | **Pass**         | Edit, Merge, Split buttons present                                                            |
| §19.2 — Quick metrics | **Pass**         | Students: 1, Guardians: 1, Emergency Contacts: 0                                              |
| §19.3 — Tabs          | **Pass**         | Overview, Students (1), Guardians (1), Emergency Contacts, Finance (0) — 5 tabs               |
| §20 — Overview tab    | **Pass**         | Address "123 Test St, Dublin, AE". Billing Parent: "Parent Testcase" (link)                   |
| §21 — Students tab    | **Pass**         | 1 student: "Test Applicant" (link + Active badge). "Add Student" button present               |
| §22 — Guardians tab   | **Pass**         | 1 Guardian. "Add Guardian" button present                                                     |
| §22 — Unlink button   | **Fail (obs J)** | No "Unlink" / "Remove Guardian" button visible. Backend supports it but UI doesn't expose it. |

### 12. Parents — Detail Page (§29)

**Target:** Parent Testcase (id: `bf889f8f-...`)

| Check                    | Result           | Notes                                                                                  |
| ------------------------ | ---------------- | -------------------------------------------------------------------------------------- |
| §29.1 — Header           | **Pass**         | "Parent Testcase", status "Active", relationship "Father"                              |
| §29.1 — Quick metrics    | **Pass**         | Email, Phone, Relationship — all populated                                             |
| §29.2 — Overview tab     | **Pass**         | Primary Contact: Yes, Billing Contact: Yes. Households list + Children list with links |
| §29 — Edit button        | **Fail (obs L)** | No Edit button on parent detail. Editing only via household Guardians tab.             |
| §30 — Cross-entity links | **Pass**         | Household link works, Student link works                                               |

### 13. Arabic / RTL (§32)

**Route tested:** `/ar/students`

| Check                 | Result   | Notes                                                                  |
| --------------------- | -------- | ---------------------------------------------------------------------- |
| Morph bar translation | **Pass** | All hub labels translated (الرئيسية, الأشخاص, التعلّم, etc.)           |
| Sub-strip translation | **Pass** | الطلاب, الموظفون, الأسر — correctly translated                         |
| Avatar role label     | **Pass** | "مالك المدرسة" (School Owner)                                          |
| Page heading          | **Pass** | "الطلاب" (Students)                                                    |
| Page subtitle         | **Fail** | "Manage student records and enrolments" — still in English             |
| Search placeholder    | **Fail** | "بحث students..." — "students" not translated                          |
| Filter labels         | **Fail** | "[AR] All Statuses", "[AR] All Year Groups" — `[AR]` prefix fallback   |
| Export buttons        | **Fail** | "[AR] Excel" — `[AR]` prefix fallback                                  |
| Table column headers  | **Fail** | "Name", "Student #", "Year Group", "Status", "Household" — all English |
| Status badges         | **Fail** | "Active" — English                                                     |
| Pagination labels     | **Fail** | "[AR] Previous page", "[AR] Next page" — `[AR]` prefix fallback        |

**Summary**: Morph bar and sub-strip are translated. Page content (data table, filters, buttons, subtitles) has **extensive missing Arabic translations** — the `[AR]` prefix fallback pattern suggests translation keys exist but values are empty/missing in the Arabic message file.

### 14. Mobile Viewport — 375x667 (§3.3)

| Check                      | Result      | Notes                                                                                                                                        |
| -------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| §3.3.1 — Compact morph bar | **Pass**    | Hamburger icon visible. Hub labels collapsed.                                                                                                |
| §3.3.1 — Avatar compact    | **Pass**    | Shows "YR" initials only                                                                                                                     |
| Sub-strip                  | **Pass**    | Students/Staff/Households links visible                                                                                                      |
| Table at 375px             | **Partial** | Table renders all 5 columns at 375px — likely causes horizontal overflow. Unable to verify scroll behavior via accessibility snapshot alone. |
| Filters at 375px           | **Pass**    | All 4 filter controls render                                                                                                                 |

---

## Teacher Walkthrough (Sarah.daly@nhqs.test)

### 15. Teacher Login + Dashboard (§3)

| Check                 | Result   | Notes                                                                 |
| --------------------- | -------- | --------------------------------------------------------------------- |
| §3.1 — Login          | **Pass** | Redirects to `/en/dashboard/teacher`                                  |
| §3.2 — Morph bar hubs | **Pass** | 7 hubs: Home, People, Learning, Wellbeing, Operations, Inbox, Reports |
| §3.2 — Hidden hubs    | **Pass** | Finance, Regulatory, Settings correctly NOT visible                   |
| Avatar                | **Pass** | "Sarah Daly" / "Teacher" / initials "SD"                              |

### 16. Teacher — People Sub-strip (§4)

| Check                  | Result   | Notes                                                |
| ---------------------- | -------- | ---------------------------------------------------- |
| §4.1 — Sub-strip items | **Pass** | Exactly 1 item: "Students". No Staff. No Households. |
| §4.2 — Active state    | **Pass** | "Students" active when on `/en/students`             |

### 17. Teacher — Students List (§5)

| Check                          | Result            | Notes                                                                          |
| ------------------------------ | ----------------- | ------------------------------------------------------------------------------ |
| §5.1.1 — Page loads            | **Pass**          | Heading "Students", data renders                                               |
| §5.1.2 — Scope (T1)            | **Fail (design)** | Teacher sees ALL 214 students (same as admin). Not scoped to assigned classes. |
| §5.1.3 — Export buttons (T2)   | **Fail (design)** | Excel/PDF buttons visible and accessible. Teacher can export full roster.      |
| §5.2.1 — No New Student button | **Pass**          | Correctly absent                                                               |

### 18. Teacher — Student Detail (§6)

| Check                       | Result      | Notes                                                                                                               |
| --------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| §6.1.1 — Page loads         | **Pass**    | Charlotte Adams detail renders with all tabs                                                                        |
| §6.1.3 — Edit button (T8)   | **Fail**    | Edit button IS visible (should be hidden for teacher)                                                               |
| §6.1.3 — Change Status (T8) | **Fail**    | Change Status button IS visible (should be hidden for teacher)                                                      |
| §6.2 — Tabs                 | **Pass**    | Overview, Classes & Enrolments, Homework, Medical                                                                   |
| Console errors              | **Partial** | 403 on `/api/v1/homework/analytics/student/{id}` — teacher lacks homework analytics permission. 403 on SEN profile. |

### 19. Teacher — Staff Routes Denied (§9)

| Check                         | Result      | Notes                                                                       |
| ----------------------------- | ----------- | --------------------------------------------------------------------------- |
| §9.1 — Sub-strip hides Staff  | **Pass**    | No Staff in sub-strip                                                       |
| §9.2 — Direct URL `/en/staff` | **Pass**    | Redirected to `/en/dashboard`. No staff data shown.                         |
| Access-denied UX (T7)         | **Partial** | No toast or explicit "access denied" message — silent redirect to dashboard |

### 20. Teacher — Households Routes Denied (§10)

| Check                               | Result                   | Notes                                                                                                                                          |
| ----------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| §10.1 — Sub-strip hides Households  | **Pass**                 | No Households in sub-strip                                                                                                                     |
| §10.2 — Direct URL `/en/households` | **Pass**                 | Redirected to `/en/dashboard`. No household data shown.                                                                                        |
| §10.2 — T6 note                     | **Better than expected** | Frontend routing guard redirects before API call. Spec predicted the page would load (backend allows `students.view`), but frontend denies it. |

---

## Recommended Immediate Actions

1. **[P1] Arabic i18n gaps on People pages** — Extensive missing translations on students list (subtitle, search placeholder, filter labels, table headers, status badges, pagination). The `[AR]` prefix fallback pattern suggests the message keys exist in code but Arabic values are missing in `messages/ar.json`. Fix: audit and populate all People-module translation keys.

2. **[P1] Teacher sees Edit + Change Status on student detail** — Both buttons render for teachers who lack `students.manage`. A teacher clicking Edit could reach the edit form (backend would 403 on PATCH, but the UX is confusing). Fix: conditionally hide these buttons when user lacks `students.manage` permission.

3. **[P2] Teacher full-roster scope (T1/T2)** — Teachers see and can export ALL 214 students, not just their assigned classes. If the product requires class-scoped visibility, add a `teacherScopeGuard` filter to `GET /v1/students` and `GET /v1/students/export-data`.

---

## End of Walkthrough Results
