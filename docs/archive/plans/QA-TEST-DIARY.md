# QA Test Diary

Running document of end-to-end QA testing across all roles and modules.

---

## Session 1 — 2026-03-19

**School:** Midaad Ul Qalam (`mdad.edupod.app`)
**Role:** School Owner (`owner@mdad.test` / Abdullah Al-Farsi)
**Tester:** Claude (automated browser via Playwright)

### Infrastructure Issues Encountered

| Issue                                                                               | Resolution                                                                          |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| All subdomains except `nhqs` returned 500 on static assets                          | Missing `pages/_error.tsx` caused Next.js crash loop. Created the file and rebuilt. |
| `.next` build directory corrupted from 150+ pm2 restarts                            | Clean rebuild on server (`rm -rf .next && pnpm build`)                              |
| Missing `prerender-manifest.json` after rebuild                                     | Generated via node script on server                                                 |
| Prisma advisory lock timeout (P1002) during deploy                                  | Restarted pgbouncer + terminated stale advisory lock connections                    |
| Production build type errors (`pathname` / `searchParams` / `params` possibly null) | Added null guards (`??`) across ~60 files for strict production type checking       |

---

### Module-by-Module Test Results

#### 1. Login & Authentication

| Test                                     | Result | Notes                                                     |
| ---------------------------------------- | ------ | --------------------------------------------------------- |
| Navigate to `mdad.edupod.app`            | PASS   | Redirects to `/en/login`                                  |
| Login page renders                       | PASS   | Shows "MDAD" heading, email/password fields, login button |
| Login with owner credentials             | PASS   | Redirects to `/en/dashboard`                              |
| Session persists across page navigations | PASS   | No re-login required                                      |
| Auth token refresh                       | PASS   | 401 on `/auth/refresh` before login is expected           |

#### 2. Dashboard

| Test                                                | Result | Notes                                                             |
| --------------------------------------------------- | ------ | ----------------------------------------------------------------- |
| Greeting with user's first name                     | PASS   | "Good evening, Abdullah"                                          |
| 4 stat cards render                                 | PASS   | Total Students, Total Staff, Active Classes, Pending Approvals    |
| Stats update after creating records                 | PASS   | Students: 0→1, Classes: 0→1 after creating records                |
| Households Needing Completion section               | PASS   | Shows "The Al-Farsi Family - Incomplete" after creating household |
| Today's Attendance section                          | PASS   | Empty state: "No attendance sessions recorded today."             |
| Recent Admissions section                           | PASS   | Empty state: "No admissions activity yet."                        |
| View All links (Households, Attendance, Admissions) | PASS   | All navigate to correct pages                                     |
| Page title in browser tab                           | PASS   | "Dashboard — School OS"                                           |

#### 3. Settings

| Test                                            | Result | Notes                                                                                                                                                                                      |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Settings page loads with sub-tabs               | PASS   | 15 tabs: Branding, General, Notifications, Stripe, Users, Invitations, Roles, Academic Years, Year Groups, Subjects, Grading Scales, Assessment Categories, Audit Log, Compliance, Imports |
| **Branding** — Logo upload area, colour pickers | PASS   | Primary/secondary colour inputs with hex values                                                                                                                                            |
| **Academic Years** — Create new                 | PASS   | Created "2025-2026" with dates, shows Planned status                                                                                                                                       |
| **Year Groups** — Create new                    | PASS   | Created "Grade 1" with display order 1                                                                                                                                                     |
| **Subjects** — Create new                       | PASS   | Created "Mathematics" (code: MATH, type: academic, active toggle on)                                                                                                                       |
| **Subjects** — Table with filters               | PASS   | Type filter, active filter, pagination                                                                                                                                                     |
| **Users** — List all tenant users               | PASS   | Shows 4 seed users with names, emails, roles, statuses, Suspend buttons                                                                                                                    |
| **Roles** — List system roles                   | PASS   | 7 roles with permission counts (Platform Owner: 4, School Owner: 55, etc.)                                                                                                                 |
| **Audit Log** — View activity                   | PASS   | Captured all mutations (subject creation, year group, academic year, auth events), with entity type / actor / action filters and date range                                                |
| Dialog accessibility warning                    | FIXED  | Was showing "Missing Description or aria-describedby" — fixed with `aria-describedby={undefined}` on DialogContent                                                                         |

#### 4. Students

| Test                               | Result            | Notes                                                                                                                                       |
| ---------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Students list — empty state        | PASS              | "No students yet" with New Student button                                                                                                   |
| Navigate to New Student form       | PASS              | Full form: First/Last Name, Arabic names, DOB, Gender, Household, Year Group, Student Number, Status, Medical Notes, Allergies checkbox     |
| Gender dropdown                    | PASS              | Options: Male, Female, Other, Prefer not to say                                                                                             |
| Household dropdown                 | PASS              | Shows "The Al-Farsi Family" (created earlier)                                                                                               |
| Year Group dropdown                | PASS              | Shows "Grade 1" (created earlier)                                                                                                           |
| Create student                     | PASS              | Created "Omar Al-Farsi" — redirected to student detail page with success toast                                                              |
| Student detail page                | PASS              | Shows name, status badge, year group, student number, DOB, household link, tabs (Overview, Classes & Enrolments, Medical)                   |
| Change Status (Applicant → Active) | PASS (was BROKEN) | **Fixed:** Was hitting wrong API endpoint (`PATCH /students/:id` instead of `PATCH /students/:id/status`). Now persists after page refresh. |
| Status persists after refresh      | PASS              | Badge shows "Active" after full page reload                                                                                                 |

#### 5. Households

| Test                           | Result | Notes                                                                                                                                                                    |
| ------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Households list — empty state  | PASS   | "No households yet" with New Household button                                                                                                                            |
| Navigate to New Household form | PASS   | Fields: Household Name, Address (line 1, line 2, city, country, postal code), Emergency Contacts (name, phone, relationship)                                             |
| Create household               | PASS   | Created "The Al-Farsi Family" with address and emergency contact — redirected to detail page with success toast                                                          |
| Household detail page          | PASS   | Shows name, Active status, Edit/Merge/Split buttons, stats (0 students, 0 parents, 1 emergency contact), address, tabs (Overview, Students, Parents, Emergency Contacts) |
| Incomplete household warning   | PASS   | Shows "This household record is incomplete" alert                                                                                                                        |
| Household appears on dashboard | PASS   | "Households Needing Completion" section shows "The Al-Farsi Family - Incomplete"                                                                                         |

#### 6. Staff

| Test                              | Result            | Notes                                                                                                                                                                                           |
| --------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Staff list — empty state          | PASS              | Table with search, status filter, "New Staff Profile" button, "No results found"                                                                                                                |
| New Staff Profile form            | PASS              | Fields: User Account dropdown, Staff Number, Job Title, Department, Employment Status, Employment Type, Bank Details (name, account, IBAN)                                                      |
| User Account dropdown shows names | PASS (was BROKEN) | **Fixed:** Was showing "()" for all users. Now shows "Ibrahim Nasser (teacher@mdad.test)" etc. Root cause: API returns memberships with nested `user` object, frontend was reading flat fields. |
| Create staff profile              | PASS (was BROKEN) | **Fixed:** Was failing with "User not found". Root cause: frontend sent membership ID instead of user ID. Now correctly extracts `user.id` from membership response.                            |
| Staff appears in list             | PASS              | "Ibrahim Nasser, Mathematics Teacher, Academics, Active, full time"                                                                                                                             |

#### 7. Classes

| Test                         | Result            | Notes                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Classes list                 | PASS              | Table with filters (All Years, All Groups, All Statuses), New Class button                                                                                                                                                                                                                               |
| New Class form               | PASS              | Fields: Class Name, Academic Year dropdown, Year Group dropdown, Subject dropdown (with "No subject" option), Homeroom Teacher, Status                                                                                                                                                                   |
| Create class                 | PASS              | Created "Grade 1 - Math" — appears in table                                                                                                                                                                                                                                                              |
| Class detail page            | PASS (was BROKEN) | **Fixed:** Was crashing with "Cannot read properties of undefined (reading 'name')". Two root causes: (1) `useParams` destructuring failed in Next.js 14.2+, fixed with `useParams()?.id`, (2) API response wrapped in `{ data: ... }` by ResponseTransformInterceptor but frontend expected raw object. |
| Class detail — Overview tab  | PASS              | Shows Academic Year, Year Group, Subject, Status                                                                                                                                                                                                                                                         |
| Class detail — Students tab  | PASS              | Shows "(0)" count, Enrol Student / Bulk Enrol buttons, empty state                                                                                                                                                                                                                                       |
| Class detail — Staff tab     | PASS              | Shows "(0)" count, Assign Staff button, empty state                                                                                                                                                                                                                                                      |
| Class detail — Metrics strip | PASS              | Students: 0, Staff: 0, Subject: Mathematics                                                                                                                                                                                                                                                              |

#### 8. Rooms (Scheduling)

| Test                             | Result            | Notes                                                                                                      |
| -------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| Rooms list                       | PASS              | 5 seed rooms: Room 101, Room 102, Science Lab, Gymnasium, Library                                          |
| Room type and capacity displayed | PASS              | classroom/30, lab/25, gym/100, library/50                                                                  |
| Rooms Active status              | PASS (was BROKEN) | **Fixed:** Frontend used `is_active` field name but API/Prisma uses `active`. All rooms now show "Active". |
| Room type filter                 | PASS              | Dropdown: All Types                                                                                        |
| Active filter                    | PASS              | Dropdown: All, Active, Inactive                                                                            |

#### 9. Admissions

| Test                  | Result | Notes                                                                |
| --------------------- | ------ | -------------------------------------------------------------------- |
| Admissions page loads | PASS   | Funnel stats (Total: 0, Submitted, Under Review, Accepted, Rejected) |
| Analytics button      | PASS   | Clickable                                                            |
| Forms button          | PASS   | Clickable                                                            |
| Empty state           | PASS   | "No applications yet."                                               |

#### 10. Finance

| Test                   | Result | Notes                                                                                                                   |
| ---------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| Finance dashboard      | PASS   | Full dashboard with 4 stat cards (Overdue Amount, Unallocated Payments, Pending Refunds, Current Month Collected)       |
| Overdue Ageing Summary | PASS   | 4 buckets: 1-30, 31-60, 61-90, 90+ days                                                                                 |
| Invoice Pipeline       | PASS   | 5 stages: Draft, Pending Approval, Issued, Overdue, Paid                                                                |
| Revenue Summary        | PASS   | Current/Previous month collected, Current month invoiced                                                                |
| Recent Payments table  | PASS   | Empty: "No recent payments"                                                                                             |
| Sub-navigation         | PASS   | 9 pages: Dashboard, Fee Structures, Discounts, Fee Assignments, Fee Generation, Invoices, Payments, Refunds, Statements |

#### 11. Payroll

| Test                   | Result | Notes                                                                 |
| ---------------------- | ------ | --------------------------------------------------------------------- |
| Payroll dashboard      | PASS   | Stats: Total Pay This Month (0.00), Headcount (0), Total Bonus (0.00) |
| New Payroll Run button | PASS   | Clickable                                                             |
| Navigation cards       | PASS   | Staff Compensation, Payroll Runs, Reports & Analytics                 |

#### 12. Global UI

| Test                                     | Result            | Notes                                                                                                                                               |
| ---------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar — all sections visible for owner | PASS              | Overview, People, Academics, Scheduling, Operations, Reports, School                                                                                |
| Sidebar collapse button                  | PASS              | Present and clickable                                                                                                                               |
| Command palette (Cmd+K / Search button)  | PASS (was BROKEN) | **Fixed:** Search input wasn't wired to API. Added `onQueryChange` prop to CommandPalette component and connected GlobalSearch to pass typed query. |
| User menu dropdown                       | PASS              | Shows: user name/email, Profile, Communication preferences, Arabic locale switch, Theme toggle (Light/Dark/System), Log out                         |
| Arabic locale switch                     | PASS              | Full RTL layout, all sidebar items translated, page content in Arabic, URL changes to `/ar/` prefix                                                 |
| Theme toggle                             | PASS              | Light/Dark/System options visible                                                                                                                   |
| Page titles in browser tab               | PASS              | Dynamic titles: "Dashboard — School OS", "Students — School OS", etc.                                                                               |
| Notification bell                        | PASS              | Present and clickable                                                                                                                               |

---

### Bugs Found & Fixed (This Session)

| #       | Severity | Module   | Description                                              | Root Cause                                                                                                                   | Fix                                                                                    |
| ------- | -------- | -------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| BUG-001 | High     | Students | Status change didn't persist after refresh               | Frontend called `PATCH /students/:id` instead of `PATCH /students/:id/status`                                                | Fixed endpoint URL in `students/[id]/page.tsx`                                         |
| BUG-002 | High     | Staff    | User dropdown showed "()" for all users                  | API returns memberships with nested `user` object; frontend read flat fields                                                 | Added `MembershipResponse` interface, map `m.user.first_name` etc. in `staff-form.tsx` |
| BUG-003 | High     | Staff    | Staff creation failed "User not found"                   | Frontend sent membership ID instead of user ID                                                                               | Extract `m.user.id` instead of `m.id` in `staff-form.tsx`                              |
| BUG-004 | Critical | Classes  | Class detail page crashed                                | (1) `useParams` destructuring null in Next.js 14.2+, (2) API response wrapped in `{ data }` but frontend expected raw object | Fixed `useParams()?.id` and `res.data` unwrapping in `classes/[id]/page.tsx`           |
| BUG-005 | Low      | Rooms    | All rooms showed "Inactive"                              | Frontend field name `is_active` didn't match API field `active`                                                              | Renamed to `active` in `rooms/page.tsx` and `rooms/[id]/page.tsx`                      |
| BUG-006 | Medium   | Search   | Command palette returned no results                      | `CommandPalette` didn't expose `onQueryChange`; `GlobalSearch` query state never updated                                     | Added `onQueryChange` prop, wired to `setQuery`, disabled cmdk built-in filter         |
| BUG-007 | Minor    | UI       | Recurring aria-describedby warning on all dialogs        | Radix Dialog expects Description or explicit opt-out                                                                         | Added `aria-describedby={undefined}` to `DialogContent`                                |
| INFRA   | Critical | Server   | All subdomains except nhqs broken (500 on static assets) | Missing `pages/_error.tsx` caused Next.js crash loop                                                                         | Created `apps/web/src/pages/_error.tsx`                                                |
| BUILD   | Critical | API      | `periodTemplate` model didn't exist                      | Wrong Prisma model name                                                                                                      | Changed to `schedulePeriodTemplate` with `schedule_period_type` field                  |

---

### Not Yet Tested (Owner Role)

These modules loaded correctly but were not deeply tested with real data creation/interaction:

- [ ] Promotion — needs active students enrolled in classes
- [ ] Attendance — needs active classes with enrolled students and schedule entries
- [ ] Gradebook — needs classes with enrolled students and assessment categories
- [ ] Report Cards — needs gradebook data
- [ ] Schedules — needs rooms, classes, staff, and period grid configured
- [ ] Timetables — needs schedule entries
- [ ] Auto-Scheduling — needs full scheduling prerequisites
- [ ] Period Grid — needs academic year with period templates
- [ ] Curriculum — needs subjects and year groups mapped
- [ ] Competencies — needs staff profiles and subjects
- [ ] Scheduling Runs — needs auto-scheduling to have been run
- [ ] Communications — create/send announcements
- [ ] Approvals — needs approval workflows triggered
- [ ] Reports — generate and view reports
- [ ] Website — CMS page management
- [ ] Closures — school closure dates
- [ ] Settings: General, Notifications, Stripe, Invitations, Grading Scales, Assessment Categories, Compliance, Imports
- [ ] Student edit flow
- [ ] Household edit, merge, split flows
- [ ] Staff detail page and edit flow
- [ ] Class edit flow, student enrolment, staff assignment
- [ ] Room create, edit, detail page
- [ ] Finance sub-pages: Fee Structures, Discounts, Fee Assignments, Fee Generation, Invoices, Payments, Refunds, Statements
- [ ] Payroll: Staff Compensation, Payroll Runs, Reports
- [ ] Admissions: Forms builder, Analytics, Application detail, Convert to student

### Other Roles Not Yet Tested

- [ ] School Admin (`admin@mdad.test`)
- [ ] Teacher (`teacher@mdad.test`)
- [ ] Parent (`parent@mdad.test`)
