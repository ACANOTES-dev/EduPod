# School Teacher/Staff — QA Test Results

**School**: Midaad Ul Qalam
**Role**: Teacher (staff tier)
**Tester Account**: teacher@mdad.test / Password123!
**Date**: 2026-03-21
**Status**: FAIL — Critical bugs found, fixes required

---

## Executive Summary

| Category | Result |
|----------|--------|
| **RBAC Security (Blocked endpoints)** | 25/25 PASS — All admin endpoints correctly return 403 |
| **RBAC Completeness (Teacher permissions)** | FAIL — Teacher role missing 2 critical read permissions |
| **Teacher Dashboard** | FAIL — Crashes on load (field name mismatch) |
| **Page Accessibility** | 2/11 pages work, 9/11 broken by permission gaps |
| **Admin Page Blocking** | 9/9 PASS — Admin pages all properly blocked |
| **Profile Page** | PASS — Fully functional |
| **Login Flow** | PASS — Works correctly |

---

## Part 1: API Testing Results

### 1A. Accessible Endpoints (Teacher SHOULD access)

| # | Endpoint | Method | Expected | Actual | Status | Notes |
|---|----------|--------|----------|--------|--------|-------|
| 1 | `/v1/auth/me` | GET | 200 | 200 | PASS | Returns user info, memberships, teacher role |
| 2 | `/v1/auth/sessions` | GET | 200 | 200 | PASS | Returns active session list |
| 3 | `/v1/dashboard/teacher` | GET | 200 | 200 | PASS | Returns data but field names mismatch frontend |
| 4 | `/v1/attendance-sessions` | GET | 200 | **403** | **FAIL** | Needs `attendance.view` — teacher only has `attendance.take` |
| 5 | `/v1/attendance-sessions` | POST | 201 | 400 | PASS* | Permission OK; validation error for missing fields |
| 6 | `/v1/gradebook/assessments` | GET | 200 | 200 | PASS | Returns empty array |
| 7 | `/v1/gradebook/assessment-categories` | GET | 200 | 200 | PASS | Returns empty array |
| 8 | `/v1/gradebook/grading-scales` | GET | 200 | 200 | PASS | Returns empty array |
| 9 | `/v1/gradebook/period-grades` | GET | 200 | 400 | PASS* | Requires query params |
| 10 | `/v1/staff-scheduling-preferences/own` | GET | 200 | 200 | PASS | Requires `academic_year_id` param |
| 11 | `/v1/scheduling-dashboard/preferences` | GET | 200 | 400 | PASS* | Requires `academic_year_id` param |
| 12 | `/v1/me/preferences` | GET | 200 | 200 | PASS | Returns preferences |
| 13 | `/v1/me/preferences` | PATCH | 200 | 200 | PASS | Successfully updates profile |
| 14 | `/v1/notifications` | GET | 200 | 200 | PASS | Returns empty list |
| 15 | `/v1/notifications/unread-count` | GET | 200 | 200 | PASS | Returns count: 0 |
| 16 | `/v1/notifications/mark-all-read` | POST | 200 | 200 | PASS | Success |
| 17 | `/v1/settings` | GET | 200 | 200 | PASS | Read-only access works |
| 18 | `/v1/branding` | GET | 200 | 200 | PASS | Returns branding data |
| 19 | `/v1/search?q=test` | GET | 200 | 200 | PASS | Returns results |
| 20 | `/v1/students` | GET | 200 | **403** | **FAIL** | Needs `students.view` — teacher lacks this |
| 21 | `/v1/classes` | GET | 200 | **403** | **FAIL** | Needs `students.view` — teacher lacks this |
| 22 | `/v1/academic-years` | GET | 200 | **403** | **FAIL** | Needs `students.view` — teacher lacks this |
| 23 | `/v1/academic-periods` | GET | 200 | **403** | **FAIL** | Needs `students.view` — teacher lacks this |
| 24 | `/v1/subjects` | GET | 200 | **403** | **FAIL** | Needs `students.view` — teacher lacks this |
| 25 | `/v1/school-closures` | GET | 200 | **403** | **FAIL** | Needs `attendance.view` — teacher lacks this |
| 26 | `/v1/period-grid` | GET | 200 | **403** | **FAIL** | Needs `schedule.configure_period_grid` |

**Result: 14 PASS / 8 FAIL** — Teacher role missing `students.view` and `attendance.view`

### 1B. Blocked Endpoints (Teacher should NOT access — expect 403)

| # | Endpoint | Method | Expected | Actual | Status |
|---|----------|--------|----------|--------|--------|
| 1 | `/v1/students` | POST | 403 | 403 | PASS |
| 2 | `/v1/students/:id` | PATCH | 403 | 403 | PASS |
| 3 | `/v1/users` | GET | 403 | 403 | PASS |
| 4 | `/v1/roles` | POST | 403 | 403 | PASS |
| 5 | `/v1/roles` | GET | 403 | 403 | PASS |
| 6 | `/v1/settings` | PATCH | 403 | 403 | PASS |
| 7 | `/v1/branding` | PATCH | 403 | 403 | PASS |
| 8 | `/v1/finance/invoices` | GET | 403 | 403 | PASS |
| 9 | `/v1/finance/dashboard` | GET | 403 | 403 | PASS |
| 10 | `/v1/payroll/runs` | GET | 403 | 403 | PASS |
| 11 | `/v1/payroll/dashboard` | GET | 403 | 403 | PASS |
| 12 | `/v1/applications` | GET | 403 | 403 | PASS |
| 13 | `/v1/announcements` | GET | 403 | 403 | PASS |
| 14 | `/v1/approval-requests` | GET | 403 | 403 | PASS |
| 15 | `/v1/compliance-requests` | GET | 403 | 403 | PASS |
| 16 | `/v1/website/pages` | GET | 403 | 403 | PASS |
| 17 | `/v1/schedules` | POST | 403 | 403 | PASS |
| 18 | `/v1/rooms` | GET | 403 | 403 | PASS |
| 19 | `/v1/scheduling-runs` | POST | 403 | 403 | PASS |
| 20 | `/v1/staff-profiles` | GET | 403 | 403 | PASS |
| 21 | `/v1/invitations` | POST | 403 | 403 | PASS |
| 22 | `/v1/gradebook/period-grades/compute` | POST | 403 | 403 | PASS |
| 23 | `/v1/gradebook/period-grades/:id/override` | POST | 403 | 403 | PASS |
| 24 | `/v1/gradebook/assessments/:id` | DELETE | 403 | 403 | PASS |
| 25 | `/v1/report-cards/generate` | POST | 403 | 403 | PASS |

**Result: 25/25 PASS — RBAC security is excellent**

---

## Part 2: Browser (Playwright) Testing Results

### 2A. Login Flow

| Test | Status | Notes |
|------|--------|-------|
| Navigate to app | PASS | Redirects to `/en/login` |
| Login form renders | PASS | Email, password, submit button visible |
| Login with teacher credentials | PASS | Redirects to `/en/dashboard/teacher` |
| Session cookie set | PASS | Auth persists across navigation |

### 2B. Sidebar Navigation

**What the teacher sees:**

| Section | Items | Correct? |
|---------|-------|----------|
| Overview | Dashboard | PASS |
| People | Students | PASS — Staff/Households correctly hidden |
| Academics | Classes, Attendance, Gradebook | PASS — Promotion/Report Cards correctly hidden |
| Scheduling | Timetables | PASS — Admin scheduling pages correctly hidden |
| Reports | Reports | PASS |
| Operations | (empty - hidden) | PASS — Finance/Payroll/etc correctly hidden |
| School | (empty - hidden) | PASS — Settings/Website correctly hidden |

**Sidebar verdict: PASS** — Role-based filtering works correctly.

### 2C. Page Load Tests

| Page | URL | Expected | Actual | Status | Details |
|------|-----|----------|--------|--------|---------|
| Teacher Dashboard | `/dashboard/teacher` | Renders | **CRASH** | **FAIL** | `TypeError: Cannot read properties of undefined (reading 'length')` at line 88 — API returns `schedules` but frontend expects `todays_schedule` |
| Main Dashboard | `/dashboard` | Redirect to teacher | Shows admin dashboard | **FAIL** | Teachers see admin dashboard with all zeros and "Missing required permission: students.view" toast |
| Students | `/students` | Renders | Shows error toast | **FAIL** | API returns 403 — teacher lacks `students.view` |
| Classes | `/classes` | Renders | Shows error toast | **FAIL** | API returns 403 — teacher lacks `students.view` |
| Attendance | `/attendance` | Renders | Shows error toast | **FAIL** | API returns 403 — teacher lacks `attendance.view` |
| Gradebook | `/gradebook` | Renders | Shows error toast | **FAIL** | Calls `academic-years` and `academic-periods` which need `students.view` |
| Timetables | `/timetables` | Renders | Shows error toasts | **FAIL** | Calls `staff-profiles`, `rooms`, `students` — all need permissions |
| Reports | `/reports` | Renders | Shows error text | **FAIL** | Renders but with error content visible |
| Profile | `/profile` | Renders | Renders fully | **PASS** | All sections work: personal info, MFA, sessions, theme |
| My Preferences | `/scheduling/my-preferences` | Renders | Shows error toasts | **FAIL** | Calls `academic-years`, `subjects`, `classes` — need `students.view` |
| My Satisfaction | `/scheduling/my-satisfaction` | Renders | Shows error | **FAIL** | API returns error |

### 2D. Profile Page Deep Test

| Feature | Status | Notes |
|---------|--------|-------|
| Personal info display | PASS | First name, last name, email shown correctly |
| First/Last name editable | PASS | Input fields work |
| Email read-only | PASS | Greyed out, not editable |
| Locale selector | PASS | English/Arabic dropdown |
| Theme selector | PASS | Light/Dark/System buttons |
| Save profile button | PASS | Successfully saves |
| MFA section | PASS | Shows "not enabled" with enable button |
| Active sessions list | PASS | Shows current session with device info |
| Revoke session button | PASS | Available on non-current sessions |
| Communication prefs link | PASS | Links to `/profile/communication` |

### 2E. Admin Pages Blocked (Teacher should NOT see)

| Page | URL | Status | Notes |
|------|-----|--------|-------|
| Staff | `/staff` | PASS — blocked | Shows error/empty |
| Households | `/households` | PASS — blocked | Shows error/empty |
| Finance | `/finance` | PASS — blocked | Shows error/empty |
| Payroll | `/payroll` | PASS — blocked | Shows error/empty |
| Admissions | `/admissions` | PASS — blocked | Shows error/empty |
| Settings | `/settings` | PASS — blocked | Shows error/empty |
| Communications | `/communications` | PASS — blocked | Shows error/empty |
| Approvals | `/approvals` | PASS — blocked | Shows error/empty |
| Website | `/website` | PASS — blocked | Shows error/empty |

---

## Part 3: Bugs Found

### BUG-T01: CRITICAL — Teacher Dashboard Crashes on Load

**Severity**: Critical
**Component**: `apps/web/src/app/[locale]/(school)/dashboard/teacher/page.tsx:88`
**Description**: The teacher dashboard page crashes with `TypeError: Cannot read properties of undefined (reading 'length')`.

**Root Cause**: The API endpoint `GET /v1/dashboard/teacher` returns:
```json
{ "data": { "today": "2026-03-21", "schedules": [], "sessions": [] } }
```
But the frontend component expects:
```json
{ "data": { "greeting": "...", "todays_schedule": [], "todays_sessions": [], "pending_submissions": 0 } }
```

The field names `schedules` vs `todays_schedule` and `sessions` vs `todays_sessions` don't match. The `greeting` and `pending_submissions` fields are completely missing from the API response.

**Fix**: Either update the API to return the field names the frontend expects, or update the frontend to match the API response structure.

---

### BUG-T02: CRITICAL — Teacher Role Missing `students.view` Permission

**Severity**: Critical
**Component**: `packages/prisma/seed/system-roles.ts`
**Description**: The teacher role only has 6 permissions. It is missing `students.view`, which is required for:
- Viewing students list (`/students`)
- Viewing classes list (`/classes`)
- Viewing academic years (needed by Gradebook, Timetables, My Preferences)
- Viewing academic periods (needed by Gradebook)
- Viewing subjects (needed by My Preferences, Gradebook)

Without `students.view`, 6+ pages in the teacher's sidebar are completely broken.

**Fix**: Add `students.view` to the teacher role's permissions in the seed file.

---

### BUG-T03: CRITICAL — Teacher Role Missing `attendance.view` Permission

**Severity**: Critical
**Component**: `packages/prisma/seed/system-roles.ts`
**Description**: The teacher has `attendance.take` but NOT `attendance.view`. The attendance sessions list endpoint (`GET /v1/attendance-sessions`) requires `attendance.view`. Teachers can create and submit attendance but cannot list/browse their sessions.

**Fix**: Add `attendance.view` to the teacher role's permissions in the seed file.

---

### BUG-T04: HIGH — Main Dashboard Doesn't Redirect Teachers

**Severity**: High
**Component**: `apps/web/src/app/[locale]/(school)/dashboard/page.tsx`
**Description**: When a teacher navigates to `/dashboard`, they see the school-admin dashboard (with all zeros and permission error toasts) instead of being redirected to `/dashboard/teacher`.

**Fix**: The dashboard page should detect the user's role and redirect teachers to `/dashboard/teacher`.

---

### BUG-T05: HIGH — Timetables Page Calls Admin-Only Endpoints

**Severity**: High
**Component**: `apps/web/src/app/[locale]/(school)/timetables/page.tsx:66-71`
**Description**: The timetables page calls `GET /api/v1/staff-profiles`, `GET /api/v1/rooms`, and `GET /api/v1/students` on mount. All three require permissions the teacher doesn't have (`users.view` for staff-profiles, `schedule.manage` for rooms).

**Fix**: These endpoints need read-only alternatives or the teacher role needs limited read access.

---

### BUG-T06: HIGH — My Preferences Page Uses Wrong API Route

**Severity**: High
**Component**: `apps/web/src/app/[locale]/(school)/scheduling/my-preferences/page.tsx:132-134`
**Description**: The frontend calls `/api/v1/staff-preferences/own` but the correct API route is `/api/v1/staff-scheduling-preferences/own`. Additionally, it calls `academic-years`, `subjects`, and `classes` which all require `students.view`.

**Fix**: Update the API path and the permission set.

---

### BUG-T07: MEDIUM — Gradebook Home Calls Endpoints Requiring `students.view`

**Severity**: Medium (blocked by BUG-T02)
**Component**: `apps/web/src/app/[locale]/(school)/gradebook/page.tsx:82-87`
**Description**: Gradebook home page loads `academic-years` and `academic-periods` which both require `students.view`. Once BUG-T02 is fixed (adding `students.view` to teacher role), this will resolve automatically.

---

### BUG-T08: MEDIUM — Period Grid View Requires Admin Permission

**Severity**: Medium
**Component**: `apps/api/src/modules/scheduling/period-grid.controller.ts`
**Description**: `GET /v1/period-grid` requires `schedule.configure_period_grid` (admin-only). Teachers need to read the period grid for scheduling preferences (time slot selection). There is no read-only alternative.

**Fix**: Either add a separate `schedule.view_period_grid` permission or allow `schedule.view_own` to read the period grid.

---

### BUG-T09: LOW — Teacher Dashboard Shows Empty Title

**Severity**: Low
**Component**: `apps/web/src/app/[locale]/(school)/layout.tsx:182-186`
**Description**: When on `/dashboard/teacher`, the browser tab title shows just "School OS" without the page title prefix, because the layout's `pageTitle` derivation doesn't match `/dashboard/teacher` (it only matches `/dashboard`).

---

## Part 4: Data Setup Issues

| Issue | Details |
|-------|---------|
| No staff_profile for teacher | Teacher user had no `staff_profiles` row — created during testing. Should be part of seed data. |
| No academic data for tenant | Midaad Ul Qalam had zero academic years, classes, students, or subjects. QA seed data only populated Al Noor tenant. |
| Localhost domain mapping | `localhost` was mapped to Al Noor tenant — had to update to Midaad Ul Qalam for browser testing. |

---

## Part 5: Overall Verdict

### What Works
- Login/auth flow
- RBAC security (all admin endpoints properly blocked)
- Sidebar role-based filtering
- Profile page (all features)
- Notification bell
- Global search (Cmd+K)
- User menu display (shows name + role)

### What's Broken
- **Teacher dashboard crashes** (field name mismatch)
- **9 out of 11 teacher pages non-functional** (missing `students.view` and `attendance.view`)
- **Main dashboard shows admin view** to teachers
- **Timetables page** calls endpoints teacher can't access
- **Scheduling preferences** page uses wrong API route

### Required Fixes Before Launch

1. Add `students.view` and `attendance.view` to teacher role permissions
2. Fix teacher dashboard API response field names to match frontend
3. Add dashboard role-based redirect for teachers
4. Fix scheduling preferences API route in frontend
5. Handle timetables page gracefully for teacher role

---

## Appendix: Test Environment

| Component | Details |
|-----------|---------|
| API Server | NestJS @ localhost:5552 |
| Web Server | Next.js 14.2.35 @ localhost:3000 |
| Database | PostgreSQL 16 @ localhost:5553 (Docker) |
| Redis | Redis 7 @ localhost:5554 (Docker) |
| Browser | Chrome (Playwright MCP) |
| Test Date | 2026-03-21 |
