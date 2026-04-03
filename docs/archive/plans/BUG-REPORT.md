# EduPod.app — Bug Report (Updated)

**Date**: 2026-03-19
**Tenant**: Nurul Huda School (nhqs.edupod.app)
**Roles Tested**: Owner, Admin, Teacher, Parent
**Tester**: Claude (automated browser testing via Playwright)

---

## SEVERITY LEGEND

| Level             | Meaning                                                       |
| ----------------- | ------------------------------------------------------------- |
| **P1 — CRITICAL** | Core flow broken, blocks downstream features                  |
| **P2 — HIGH**     | Feature broken but has workaround or is not a core dependency |
| **P3 — MEDIUM**   | UX issue, cosmetic, or minor functional gap                   |
| **P4 — LOW**      | Polish, accessibility, minor inconsistency                    |

---

## PREVIOUSLY FIXED (this session)

| Bug                                    | Fix                                                                           | Status                        |
| -------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------- |
| All API endpoints return 404 (P0)      | `NEXT_PUBLIC_API_URL` set to empty, tenant resolution now works via subdomain | **DEPLOYED**                  |
| No role-based sidebar filtering (P1)   | Added role-based nav filtering in layout                                      | **COMMITTED, pending deploy** |
| No teacher dashboard (P1)              | Created `/dashboard/teacher` page + login redirect                            | **COMMITTED, pending deploy** |
| `/approvals` route 404 (P2)            | Created approvals list page                                                   | **COMMITTED, pending deploy** |
| Header title stuck on "Dashboard" (P2) | Dynamic title from current route                                              | **COMMITTED, pending deploy** |
| Missing favicon (P2)                   | Added icon metadata pointing to PWA icon                                      | **COMMITTED, pending deploy** |

---

## CURRENT BUGS

### P1 — CRITICAL

#### BUG-001: Year Groups creation crashes — blocks all downstream flows

**Page**: Settings > Year Groups (`/en/settings/year-groups`)
**Error**: `A <Select.Item /> must have a value prop that is not an empty string`
**Impact**: Cannot create year groups. This blocks: student creation, class creation, attendance, gradebook, scheduling, promotion — essentially every academic feature.
**Root cause**: The Academic Year select dropdown in the "New Year Group" dialog renders an item with an empty string value, likely from the academic year data having a null/empty field.

#### BUG-002: Classes creation crashes with same Select.Item error

**Page**: Classes > New Class (`/en/classes/new`)
**Error**: Same `<Select.Item />` empty value crash as BUG-001
**Also**: 400 error on `/api/v1/staff-profiles?pageSize=200`
**Impact**: Cannot create classes. Blocks attendance, gradebook, scheduling.

#### BUG-003: Payroll dashboard crashes on load

**Page**: Payroll (`/en/payroll`)
**Error**: `TypeError: Cannot read properties of undefined (reading 'total_pay_this_month')`
**Impact**: Entire payroll section is inaccessible. The component doesn't handle null/empty API response for summary stats.

---

### P2 — HIGH

#### BUG-004: Systemic — `pageSize=200` rejected by backend (max is 100)

**Affected**: Multiple pages where dropdowns load related data
**Endpoints returning 400**: `/api/v1/users?pageSize=200`, `/api/v1/classes?pageSize=200`, `/api/v1/rooms?pageSize=200`, `/api/v1/staff-profiles?pageSize=200`, `/api/v1/students?pageSize=200`, `/api/v1/academic-periods?pageSize=50` (some also 400)
**Impact**: Dropdown filters are empty across the app — attendance class filter, schedules filters, timetable teacher/room/student pickers, competencies teacher picker, new class form staff dropdown, new staff form user dropdown.
**Root cause**: Frontend requests `pageSize=200` but backend pagination validates max 100. Frontend needs to either request `pageSize=100` or the backend needs to accept larger page sizes for dropdown data.

#### BUG-005: Subjects — created subject doesn't appear in list

**Page**: Settings > Subjects (`/en/settings/subjects`)
**Details**: POST to create subject succeeds (visible in audit log) but the subject list still shows "No results found" after page reload. The list query is broken or uses different filtering that excludes results.

#### BUG-006: Communications — cannot save announcement draft

**Page**: Communications > New (`/en/communications/new`)
**Error**: 400 from `POST /api/v1/announcements`, toast shows "Failed to save announcement"
**Impact**: Cannot create announcements at all.

#### BUG-007: Five backend API routes are genuinely missing (404)

**Endpoints**:

- `/api/v1/grading-scales` — Settings > Grading Scales page has no data source
- `/api/v1/audit-log` — Settings > Audit Log (page may use a different endpoint)
- `/api/v1/closures` — Settings > Closures page has no data source
- `/api/v1/scheduling/period-templates` — Period Grid page has no data source
- `/api/v1/compliance` — Settings > Compliance page has no data source

**Note**: Some of these pages may use different endpoint paths than tested. Need to verify by checking the actual frontend fetch calls on each page.

---

### P3 — MEDIUM

#### BUG-008: Notifications page shows raw technical keys

**Page**: Settings > Notifications (`/en/settings/notifications`)
**Details**: Notification type names and descriptions show raw keys like `admission.status_change` instead of human-readable labels like "Admission Status Change".

#### BUG-009: Browser tab title always "School OS"

**Page**: All pages
**Details**: The `<title>` tag is always "School OS" regardless of current page. Should be "Students — School OS", "Settings — School OS", etc.

#### BUG-010: Login page shows "School OS" instead of tenant branding

**Page**: Login (`/en/login`)
**Details**: Shows generic "School OS" header, no school logo or name. Should display the tenant's school name once logged in context is available.

#### BUG-011: Dashboard widgets show "Coming soon" placeholders

**Page**: Dashboard (`/en/dashboard`)
**Details**: "Households Needing Completion" shows "Coming soon" (even though the data field exists in the API), "Today's Attendance" and "Recent Admissions" show "Coming soon" empty states.

#### BUG-012: No error feedback when API calls fail

**Page**: Multiple (Students, Staff, Classes, etc.)
**Details**: When API calls fail (400, 500), the UI silently shows empty tables with "No results found" instead of an error message. Users cannot distinguish "no data exists" from "the system is broken". Should show toast or inline error.

---

### P4 — LOW

#### BUG-013: Search dialog (Cmd+K) missing accessibility title

**Page**: Global (search dialog)
**Error**: `DialogContent requires a DialogTitle for the component to be accessible`
**Details**: Functions correctly but has an a11y violation.

#### BUG-014: .env Stripe key parsing error in deploy script

**Details**: `.env` line 20 has an unquoted Stripe test key with a `>` character that bash's `source` command can't parse. Shows as `syntax error near unexpected token 'newline'` during deploy. Doesn't break the build but clutters deploy logs.
**Fix**: Wrap the value in single quotes in `.env` on the server.

---

## SUMMARY

| Severity      | Count  | Key Theme                                                                                     |
| ------------- | ------ | --------------------------------------------------------------------------------------------- |
| P1 — Critical | 3      | Select.Item crash blocks year groups + classes; Payroll crash                                 |
| P2 — High     | 4      | pageSize validation mismatch; subjects list; announcements; missing API routes                |
| P3 — Medium   | 5      | Notification labels; browser title; login branding; dashboard placeholders; no error feedback |
| P4 — Low      | 2      | Search a11y; .env parse warning                                                               |
| **TOTAL**     | **14** |                                                                                               |

## PAGES CONFIRMED WORKING

- Dashboard (loads with real greeting + stats)
- Settings: Branding (save works), General (save works), Academic Years (CRUD works), Users (shows 4 users), Roles (shows 7 system roles), Invitations, Imports, Stripe
- Households (CRUD works — created "Al-Rahman Family")
- Attendance (loads, empty state correct)
- Gradebook (loads, empty state correct)
- Report Cards (loads, empty state correct)
- Promotion wizard (loads with 5-step flow)
- Rooms (loads, shows 5 seed rooms)
- Schedules, Timetables, Period Grid, Curriculum, Competencies, Scheduling Runs, Auto-Scheduling (all load)
- Admissions (loads, empty state correct)
- Finance dashboard (loads with stats layout)
- Reports hub (loads with all report category links)
- Website pages management (loads)
- Profile page (loads with personal info, MFA, sessions)
- Notifications bell (works, shows empty state)

## PRIORITY ACTION PLAN

### Immediate (unblocks everything)

1. **Fix BUG-001 + BUG-002**: The Select.Item crash in Year Groups and Classes — likely a one-line fix where a combobox option has an empty string value
2. **Fix BUG-004**: Change `pageSize=200` to `pageSize=100` across all frontend dropdown fetches (systemic fix)

### After those

3. Fix BUG-003 (Payroll null check)
4. Fix BUG-005 (Subjects list query)
5. Fix BUG-006 (Announcements creation)
6. Verify BUG-007 (missing API routes — check actual frontend calls)

### Polish

7. BUG-008 through BUG-014
