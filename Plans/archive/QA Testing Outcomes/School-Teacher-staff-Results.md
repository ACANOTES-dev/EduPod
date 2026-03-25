# School Teacher/Staff — QA Test Results

**School**: Midaad Ul Qalam
**Role**: Teacher (staff tier)
**Tester Account**: teacher@mdad.test / Password123!
**Test Environment**: Production (`mdad.edupod.app`)
**Date**: 2026-03-21
**Status**: PASS — 91/91 tests passing after fixes deployed

---

## Executive Summary

| Category | Result |
|----------|--------|
| **API — Accessible Endpoints** | 25/25 PASS |
| **API — Blocked Endpoints (RBAC)** | 25/25 PASS |
| **Playwright — Login Flow** | 4/4 PASS |
| **Playwright — Sidebar Navigation** | 7/7 PASS |
| **Playwright — Page Loads** | 11/11 PASS |
| **Playwright — Admin Pages Blocked** | 9/9 PASS |
| **Playwright — Profile Deep Test** | 10/10 PASS |
| **TOTAL** | **91/91 PASS** |

---

## Part 1: API Testing Results

### 1A. Accessible Endpoints (25 tests)

| # | Method | Endpoint | Expected | Actual | Status |
|---|--------|----------|----------|--------|--------|
| A01 | GET | `/v1/auth/me` | 200 | 200 | PASS |
| A02 | GET | `/v1/auth/sessions` | 200 | 200 | PASS |
| A03 | GET | `/v1/dashboard/teacher` | 200 | 200 | PASS |
| A04 | GET | `/v1/attendance-sessions` | 200 | 200 | PASS |
| A05 | GET | `/v1/gradebook/assessments` | 200 | 200 | PASS |
| A06 | GET | `/v1/gradebook/assessment-categories` | 200 | 200 | PASS |
| A07 | GET | `/v1/gradebook/grading-scales` | 200 | 200 | PASS |
| A08 | GET | `/v1/gradebook/period-grades` | 200 | 200 | PASS |
| A09 | GET | `/v1/staff-scheduling-preferences/own` | 200 | 200 | PASS |
| A10 | GET | `/v1/scheduling-dashboard/preferences` | 200 | 200 | PASS |
| A11 | GET | `/v1/me/preferences` | 200 | 200 | PASS |
| A12 | PATCH | `/v1/me/preferences` | 200 | 200 | PASS |
| A13 | GET | `/v1/notifications` | 200 | 200 | PASS |
| A14 | GET | `/v1/notifications/unread-count` | 200 | 200 | PASS |
| A15 | POST | `/v1/notifications/mark-all-read` | 200 | 200 | PASS |
| A16 | GET | `/v1/search?q=test` | 200 | 200 | PASS |
| A17 | GET | `/v1/students` | 200 | 200 | PASS |
| A18 | GET | `/v1/classes` | 200 | 200 | PASS |
| A19 | GET | `/v1/academic-years` | 200 | 200 | PASS |
| A20 | GET | `/v1/academic-periods` | 200 | 200 | PASS |
| A21 | GET | `/v1/subjects` | 200 | 200 | PASS |
| A22 | GET | `/v1/school-closures` | 200 | 200 | PASS |
| A23 | GET | `/v1/period-grid` | 200 | 200 | PASS |
| A24 | GET | `/v1/timetables/teacher/:staffProfileId` | 200 | 200 | PASS |
| A25 | POST | `/v1/attendance-sessions` (perm check, not 403) | !403 | 400 | PASS |

### 1B. Blocked Endpoints — RBAC Enforcement (25 tests)

| # | Method | Endpoint | Expected | Actual | Status |
|---|--------|----------|----------|--------|--------|
| B01 | POST | `/v1/students` | 403 | 403 | PASS |
| B02 | PATCH | `/v1/students/:id` | 403 | 403 | PASS |
| B03 | GET | `/v1/users` | 403 | 403 | PASS |
| B04 | POST | `/v1/roles` | 403 | 403 | PASS |
| B05 | GET | `/v1/roles` | 403 | 403 | PASS |
| B06 | PATCH | `/v1/settings` | 403 | 403 | PASS |
| B07 | PATCH | `/v1/branding` | 403 | 403 | PASS |
| B08 | GET | `/v1/finance/invoices` | 403 | 403 | PASS |
| B09 | GET | `/v1/finance/dashboard` | 403 | 403 | PASS |
| B10 | GET | `/v1/payroll/runs` | 403 | 403 | PASS |
| B11 | GET | `/v1/payroll/dashboard` | 403 | 403 | PASS |
| B12 | GET | `/v1/applications` | 403 | 403 | PASS |
| B13 | GET | `/v1/announcements` | 403 | 403 | PASS |
| B14 | GET | `/v1/approval-requests` | 403 | 403 | PASS |
| B15 | GET | `/v1/compliance-requests` | 403 | 403 | PASS |
| B16 | GET | `/v1/website/pages` | 403 | 403 | PASS |
| B17 | POST | `/v1/schedules` | 403 | 403 | PASS |
| B18 | GET | `/v1/rooms` | 403 | 403 | PASS |
| B19 | POST | `/v1/scheduling-runs` | 403 | 403 | PASS |
| B20 | GET | `/v1/staff-profiles` | 403 | 403 | PASS |
| B21 | POST | `/v1/invitations` | 403 | 403 | PASS |
| B22 | POST | `/v1/gradebook/period-grades/compute` | 403 | 403 | PASS |
| B23 | POST | `/v1/gradebook/period-grades/:id/override` | 403 | 403 | PASS |
| B24 | DELETE | `/v1/gradebook/assessments/:id` | 403 | 403 | PASS |
| B25 | POST | `/v1/report-cards/generate` | 403 | 403 | PASS |

---

## Part 2: Browser (Playwright) Testing Results

### 2A. Login Flow (4 tests)

| # | Test | Status |
|---|------|--------|
| L1 | Login page renders (email, password, submit button) | PASS |
| L2 | Login with teacher credentials succeeds | PASS |
| L3 | Redirects to `/dashboard/teacher` | PASS |
| L4 | Session persists across navigation | PASS |

### 2B. Sidebar Navigation (7 tests)

| # | Test | Status | Notes |
|---|------|--------|-------|
| S1 | Dashboard link visible | PASS | |
| S2 | Students link visible | PASS | Staff/Households correctly hidden |
| S3 | Classes link visible | PASS | Promotion/Report Cards correctly hidden |
| S4 | Attendance link visible | PASS | |
| S5 | Gradebook link visible | PASS | |
| S6 | Timetables link visible | PASS | Admin scheduling pages correctly hidden |
| S7 | Reports link visible | PASS | |

### 2C. Page Load Tests (11 tests)

| # | Page | URL | Status |
|---|------|-----|--------|
| P1 | Teacher Dashboard | `/dashboard/teacher` | PASS |
| P2 | Main Dashboard redirects to teacher | `/dashboard` | PASS |
| P3 | Students | `/students` | PASS |
| P4 | Classes | `/classes` | PASS |
| P5 | Attendance | `/attendance` | PASS |
| P6 | Gradebook | `/gradebook` | PASS |
| P7 | Timetables | `/timetables` | PASS |
| P8 | Reports | `/reports` | PASS |
| P9 | Profile | `/profile` | PASS |
| P10 | My Preferences | `/scheduling/my-preferences` | PASS |
| P11 | My Satisfaction | `/scheduling/my-satisfaction` | PASS |

### 2D. Admin Pages Blocked (9 tests)

| # | Page | URL | Status |
|---|------|-----|--------|
| X1 | Staff | `/staff` | PASS — data blocked by API 403 |
| X2 | Households | `/households` | PASS — data blocked by API 403 |
| X3 | Finance | `/finance` | PASS — data blocked by API 403 |
| X4 | Payroll | `/payroll` | PASS — data blocked by API 403 |
| X5 | Admissions | `/admissions` | PASS — data blocked by API 403 |
| X6 | Settings | `/settings` | PASS — data blocked by API 403 |
| X7 | Communications | `/communications` | PASS — data blocked by API 403 |
| X8 | Approvals | `/approvals` | PASS — data blocked by API 403 |
| X9 | Website | `/website` | PASS — data blocked by API 403 |

### 2E. Profile Deep Test (10 tests)

| # | Feature | Status |
|---|---------|--------|
| F1 | First name field visible | PASS |
| F2 | Last name field visible | PASS |
| F3 | Email field disabled (read-only) | PASS |
| F4 | Locale selector visible | PASS |
| F5 | Theme buttons visible (Light/Dark/System) | PASS |
| F6 | Save profile button visible | PASS |
| F7 | MFA section visible | PASS |
| F8 | Active sessions section visible | PASS |
| F9 | Current session shown | PASS |
| F10 | Communication preferences link | PASS |

---

## Part 3: Bugs Found & Fixed

7 bugs were discovered during initial testing. All have been fixed and verified on production.

### BUG-T01: CRITICAL — Teacher Dashboard Crash (Route Collision)

**Severity**: Critical
**Status**: FIXED
**Component**: `apps/api/src/modules/attendance/attendance.controller.ts`
**Root Cause**: Two controllers both defined `GET /v1/dashboard/teacher`. The `AttendanceController` (at `@Controller('v1')` + `@Get('dashboard/teacher')`) collided with the `DashboardController` (at `@Controller('v1/dashboard')` + `@Get('teacher')`). The attendance version returned `{ today, schedules, sessions }` but the frontend expected `{ greeting, todays_schedule, todays_sessions, pending_submissions }`.
**Fix**: Removed the duplicate endpoint from `AttendanceController`. The `DashboardController` now handles the route and returns the correct field names.

### BUG-T02: CRITICAL — Teacher Role Missing `students.view`

**Severity**: Critical
**Status**: FIXED
**Component**: `packages/prisma/seed/system-roles.ts` + production DB
**Root Cause**: Teacher role only had 6 permissions. Without `students.view`, teachers could not access Students, Classes, Academic Years, Academic Periods, Subjects, Gradebook, Timetables, or Scheduling Preferences pages.
**Fix**: Added `students.view` to teacher role in seed file + applied via SQL migration on production.

### BUG-T03: CRITICAL — Teacher Role Missing `attendance.view`

**Severity**: Critical
**Status**: FIXED
**Component**: `packages/prisma/seed/system-roles.ts` + production DB
**Root Cause**: Teacher had `attendance.take` but not `attendance.view`. Could not list attendance sessions.
**Fix**: Added `attendance.view` to teacher role in seed file + applied via SQL migration on production.

### BUG-T04: HIGH — Main Dashboard Doesn't Redirect Teachers

**Severity**: High
**Status**: FIXED
**Component**: `apps/web/src/app/[locale]/(school)/dashboard/page.tsx`
**Root Cause**: `/dashboard` showed the school-admin dashboard to all users regardless of role.
**Fix**: Added role-based redirect — teachers go to `/dashboard/teacher`, parents to `/dashboard/parent`.

### BUG-T05: HIGH — My Preferences Page Wrong API Route

**Severity**: High
**Status**: FIXED
**Component**: `apps/web/src/app/[locale]/(school)/scheduling/my-preferences/page.tsx`
**Root Cause**: Frontend called `/api/v1/staff-preferences/own` but the correct route is `/api/v1/staff-scheduling-preferences/own`.
**Fix**: Updated all 5 occurrences of the API path.

### BUG-T06: HIGH — My Satisfaction Page Wrong API Route

**Severity**: High
**Status**: FIXED
**Component**: `apps/web/src/app/[locale]/(school)/scheduling/my-satisfaction/page.tsx`
**Root Cause**: Frontend called `/api/v1/scheduling-dashboard/my-satisfaction` which doesn't exist. Correct route is `/api/v1/scheduling-dashboard/preferences` with `academic_year_id` query param.
**Fix**: Updated to use correct route with automatic academic year resolution.

### BUG-T07: MEDIUM — Period Grid Read-Only Blocked for Teachers

**Severity**: Medium
**Status**: FIXED
**Component**: `apps/api/src/modules/period-grid/period-grid.controller.ts` + `apps/api/src/common/guards/permission.guard.ts` + `apps/api/src/common/decorators/requires-permission.decorator.ts`
**Root Cause**: `GET /v1/period-grid` required `schedule.configure_period_grid` (admin-only). Teachers need to read the period grid for time-slot preference selection.
**Fix**: Extended `@RequiresPermission` decorator to support OR logic (multiple permissions). Period grid GET now accepts `schedule.configure_period_grid` OR `schedule.view_own`.

---

## Part 4: Files Modified

| File | Change |
|------|--------|
| `packages/prisma/seed/system-roles.ts` | Added `students.view` and `attendance.view` to teacher default_permissions |
| `packages/prisma/scripts/fix-teacher-permissions.ts` | New migration script for production DB |
| `apps/api/src/modules/attendance/attendance.controller.ts` | Removed duplicate `GET dashboard/teacher` route |
| `apps/api/src/common/decorators/requires-permission.decorator.ts` | Support variadic permissions (OR logic) |
| `apps/api/src/common/guards/permission.guard.ts` | Handle array of permissions with `some()` |
| `apps/api/src/modules/period-grid/period-grid.controller.ts` | GET allows `schedule.view_own` as alternative |
| `apps/web/src/app/[locale]/(school)/dashboard/page.tsx` | Role-based redirect for teacher/parent |
| `apps/web/src/app/[locale]/(school)/scheduling/my-preferences/page.tsx` | Fixed API route (5 occurrences) |
| `apps/web/src/app/[locale]/(school)/scheduling/my-satisfaction/page.tsx` | Fixed API route + academic year resolution |

---

## Part 5: Teacher Permission Set (Final)

After fixes, the teacher role has **8 permissions**:

| Permission Key | Purpose |
|---|---|
| `students.view` | View students, classes, academic years, periods, subjects |
| `attendance.take` | Create and submit attendance sessions |
| `attendance.view` | List and browse attendance sessions |
| `gradebook.enter_grades` | Create assessments and enter grades |
| `gradebook.view` | View assessments, period grades, grading scales, categories |
| `schedule.view_own` | View own timetable + read period grid |
| `schedule.manage_own_preferences` | Set scheduling preferences (subject, class, time slot) |
| `schedule.view_own_satisfaction` | View preference satisfaction scores |

---

## Part 6: Test Environment

| Component | Details |
|-----------|---------|
| Production URL | `https://mdad.edupod.app` |
| API Health | `https://mdad.edupod.app/api/health` — 200 OK |
| Database | PostgreSQL 16 (Docker: `edupod-postgres-1`) |
| Redis | Redis 7 (Docker: `edupod-redis-1`) |
| Browser | Chrome via Playwright MCP |
| Test Date | 2026-03-21 |
| Test Account | teacher@mdad.test / Password123! |

---

## Grand Total

| Category | Pass | Fail | Total |
|----------|------|------|-------|
| API — Accessible | 25 | 0 | 25 |
| API — Blocked | 25 | 0 | 25 |
| Playwright — Login | 4 | 0 | 4 |
| Playwright — Sidebar | 7 | 0 | 7 |
| Playwright — Pages | 11 | 0 | 11 |
| Playwright — Admin Blocked | 9 | 0 | 9 |
| Playwright — Profile | 10 | 0 | 10 |
| **TOTAL** | **91** | **0** | **91** |
