# EduPod.app — Comprehensive Bug Report

**Date**: 2026-03-19
**Tenant**: Nurul Huda School (nhqs.test)
**Roles Tested**: Owner, Admin, Teacher, Parent
**Tester**: Claude (automated browser testing via Playwright)

---

## SEVERITY LEGEND

| Level | Meaning |
|-------|---------|
| **P0 — BLOCKER** | App is non-functional, no workaround |
| **P1 — CRITICAL** | Major feature broken, security risk, or data integrity issue |
| **P2 — HIGH** | Feature doesn't work but has workaround or is not core flow |
| **P3 — MEDIUM** | UX issue, cosmetic, or minor functional gap |
| **P4 — LOW** | Polish, nice-to-have, minor inconsistency |

---

## P0 — BLOCKERS

### BUG-001: ALL API endpoints return 404 (except auth)

**Severity**: P0 — BLOCKER
**Impact**: The entire application is non-functional. No data can be loaded, created, updated, or deleted.

**Details**: Every single `/api/v1/*` endpoint returns HTTP 404 except the authentication endpoints. This was confirmed by programmatically testing 40+ endpoints:

**Working (200):**
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/switch-tenant`
- `POST /api/v1/auth/refresh`

**All returning 404 (40 endpoints tested):**
- `/api/v1/students`
- `/api/v1/staff-profiles`
- `/api/v1/households`
- `/api/v1/classes`
- `/api/v1/year-groups`
- `/api/v1/academic-years`
- `/api/v1/subjects`
- `/api/v1/rooms`
- `/api/v1/attendance-sessions`
- `/api/v1/applications`
- `/api/v1/applications/funnel`
- `/api/v1/branding`
- `/api/v1/settings`
- `/api/v1/finance/fee-structures`
- `/api/v1/finance/invoices`
- `/api/v1/finance/payments`
- `/api/v1/finance/dashboard`
- `/api/v1/payroll/runs`
- `/api/v1/payroll/staff`
- `/api/v1/payroll/dashboard`
- `/api/v1/communications`
- `/api/v1/announcements`
- `/api/v1/approvals`
- `/api/v1/roles`
- `/api/v1/users`
- `/api/v1/grading-scales`
- `/api/v1/assessment-categories`
- `/api/v1/audit-log`
- `/api/v1/closures`
- `/api/v1/scheduling/period-templates`
- `/api/v1/scheduling/curriculum`
- `/api/v1/scheduling/runs`
- `/api/v1/timetables`
- `/api/v1/website/pages`
- `/api/v1/reports/workload`
- `/api/v1/invitations`
- `/api/v1/promotion/eligible`
- `/api/v1/report-cards`
- `/api/v1/gradebook/classes`
- `/api/v1/gradebook/assessments`
- `/api/v1/academic-periods`
- `/api/v1/compliance`
- `/api/v1/imports`
- `/api/v1/notifications/unread-count`
- `/api/v1/dashboard/school-admin`
- `/api/v1/dashboard/parent`
- `/api/v1/schedules`

**Root cause hypothesis**: The NestJS API either:
1. Is not running / not deployed with the latest code
2. Has a routing prefix mismatch (modules not registered under `/api/v1/`)
3. The reverse proxy / Caddy config is not forwarding `/api/v1/*` to the NestJS backend (except `/api/v1/auth/*` which has a separate rule)
4. NestJS modules are not imported into the AppModule

**Action**: Check the deployed API server logs and NestJS module registration.

---

## P1 — CRITICAL

### BUG-002: No role-based sidebar filtering — all roles see everything

**Severity**: P1 — CRITICAL (security/access control)
**Impact**: Teachers and Parents can see and navigate to admin-only pages like Payroll, Finance, Settings, Admissions, Auto-Scheduling, Website management, etc.

**Details**: The sidebar navigation is identical for ALL four roles tested:
- **Owner** (Yusuf Rahman): Full sidebar — **expected**
- **Admin** (Aisha Patel): Full sidebar — **possibly expected, but should be verified**
- **Teacher** (Hamza Khan): Full sidebar — **WRONG** — should only see: Dashboard, My Classes, Attendance, Gradebook, Timetables, My Preferences, Profile
- **Parent** (Zainab Ali): Full sidebar — **WRONG** — should only see: Dashboard, My Students, Invoices/Payments, Announcements, Report Cards, Profile

The sidebar currently shows 30+ navigation items to all roles including:
- Payroll (admin/owner only)
- Finance admin (admin/owner only)
- Settings (admin/owner only)
- Auto-Scheduling, Period Grid, Curriculum, Competencies, Runs (admin/owner only)
- Staff management (admin/owner only)
- Household management (not for teachers)
- Website management (admin/owner only)
- Approvals (admin/owner only)
- Admissions (admin/owner only)
- Reports hub (role-filtered reports only)
- Promotion wizard (admin/owner only)

**Note**: Even though the API endpoints are 404, once they're fixed this sidebar issue means any role could attempt API calls to endpoints they shouldn't access. Backend permission guards may block the actual requests, but the navigation exposure is itself a security issue (information disclosure).

### BUG-003: No dashboard differentiation by role

**Severity**: P1 — CRITICAL
**Impact**: All staff roles see the same admin dashboard with irrelevant widgets

**Details**:
- **Owner/Admin dashboard**: Shows "Total Students: 0", "Total Staff: 0", "Active Classes: 0", "Pending Approvals: 0", "Households Needing Completion: Coming soon", "Today's Attendance: Coming soon", "Recent Admissions: Coming soon" — appropriate for admin roles
- **Teacher dashboard**: Shows the **exact same admin dashboard** — should show: My Classes Today, My Attendance Sessions, My Timetable, upcoming lessons
- **Parent dashboard**: Correctly redirects to `/dashboard/parent` showing "Your Students", "Outstanding Invoices", "Recent Announcements" — all "Coming soon" but the structure is correct. However, the parent can still navigate to the admin dashboard via the sidebar Dashboard link.

---

## P2 — HIGH

### BUG-004: /approvals route returns frontend 404

**Severity**: P2 — HIGH
**Impact**: "Approvals" appears in the sidebar for all roles but clicking it shows a 404 page

**Details**: Navigating to `https://edupod.app/en/approvals` returns a Next.js 404 page. The route directory exists in the codebase at `(school)/approvals` but the page is not rendering. The sidebar link points to `/approvals` which resolves to this broken route.

### BUG-005: favicon.ico missing (404)

**Severity**: P2 — HIGH (brand/professionalism)
**Impact**: Browser tab shows no icon, console errors on every page load

**Details**: `https://edupod.app/favicon.ico` returns 404. Every page navigation generates a console error for this.

### BUG-006: Header title stuck on "Dashboard" on all pages

**Severity**: P2 — HIGH
**Impact**: The top header bar always displays "Dashboard" as the page title, regardless of which page the user is on

**Details**: When navigating to Students, Staff, Classes, Settings, Finance, etc., the header `<h1>` always reads "Dashboard". The main content area shows the correct page title (e.g., "Students", "Staff", etc.), so the header title is not updating based on the current route.

### BUG-007: Settings > Branding — branding API returns 404

**Severity**: P2 — HIGH
**Impact**: Cannot upload logo or save brand colours

**Details**: The branding page renders with default values (Primary: #1a56db, Secondary: #6b7280) but `/api/v1/branding` returns 404. Changes cannot be persisted.

### BUG-008: Settings > General — settings API returns 404

**Severity**: P2 — HIGH
**Impact**: Cannot save any general settings (parent portal, attendance, gradebook, admissions, finance, communications, payroll, scheduling, approvals, compliance settings)

**Details**: The general settings page renders with apparent default values for all module settings, but `/api/v1/settings` returns 404. The form appears fully functional with all toggles and inputs, but changes cannot be saved.

---

## P3 — MEDIUM

### BUG-009: Dashboard widgets all show "Coming soon"

**Severity**: P3 — MEDIUM (blocked by BUG-001)
**Impact**: Dashboard provides no value to any user

**Details**: All dashboard widgets show placeholder content:
- "Households Needing Completion" → "Coming soon"
- "Today's Attendance" → "Coming soon" with empty state illustration
- "Recent Admissions" → "Coming soon" with empty state illustration
- Parent dashboard: "Your Students" → "Coming soon", "Outstanding Invoices" → "Coming soon", "Recent Announcements" → "Coming soon"

This is partially blocked by BUG-001 (API 404s), but even the widget structure suggests these are hardcoded placeholders, not API-dependent renders.

### BUG-010: All data tables show "No results found" with no error indication

**Severity**: P3 — MEDIUM
**Impact**: User sees empty tables with no indication that the data failed to load (API error) vs. genuinely empty

**Details**: Pages like Students, Staff, Classes, Attendance, Rooms, Schedules, Report Cards all show a table with "No results found" in a table cell. There is no error banner, toast, or indication that the API call failed. Users cannot distinguish between "no data exists" and "the system is broken."

**Affected pages**: Students, Staff, Classes, Attendance, Rooms, Schedules, Report Cards, Gradebook, Admissions, Communications, Website Pages, Finance sub-pages.

### BUG-011: No error boundaries or fallback UI for API failures

**Severity**: P3 — MEDIUM
**Impact**: Failed API calls silently fail with no user feedback

**Details**: When API calls return 404 (or any error), the frontend silently renders empty states. There should be:
1. Toast notifications for failed API calls
2. Error boundaries that catch and display meaningful error messages
3. Retry buttons for transient failures

### BUG-012: Page title in browser tab is always "School OS"

**Severity**: P3 — MEDIUM
**Impact**: Cannot distinguish between tabs when multiple pages are open

**Details**: The `<title>` tag is always "School OS" regardless of which page is active. Should be "Students — School OS", "Settings — School OS", etc.

### BUG-013: Login page shows "School OS" instead of tenant branding

**Severity**: P3 — MEDIUM
**Impact**: No school identity on login, generic experience

**Details**: The login page header says "School OS" and shows no school logo. Should display the tenant's school name and logo (once branding API works).

### BUG-014: Notifications bell does nothing useful

**Severity**: P3 — MEDIUM
**Impact**: Notification icon present but non-functional

**Details**: The notifications button exists in the header but `/api/v1/notifications/unread-count` returns 404. Clicking the bell opens a "Notifications alt+T" region that appears empty.

### BUG-015: Dropdowns on forms have no options (blocked by API)

**Severity**: P3 — MEDIUM (blocked by BUG-001)
**Impact**: Cannot create any records because dependent dropdowns are empty

**Details**: On the "New Student" form:
- Household dropdown: empty (API 404)
- Year Group dropdown: empty (API 404)
- Gender dropdown: appears to have client-side options (works)
- Status dropdown: appears to have client-side options (works)

On the "New Class" form / filter dropdowns:
- All Years, All Groups, All Statuses: empty

On Schedules page: All Years, All Classes, All Teachers, All Rooms, All Days: all empty

### BUG-016: Promotion wizard cannot proceed — no academic years

**Severity**: P3 — MEDIUM (blocked by BUG-001)
**Impact**: Promotion wizard Step 1 asks for academic year but dropdown is empty

**Details**: The promotion wizard renders a 5-step flow but cannot proceed past step 1 because the academic year combobox has no options.

---

## P4 — LOW

### BUG-017: Search shortcut (⌘K) — functionality unknown

**Severity**: P4 — LOW
**Impact**: Search button present with ⌘K hint but untested due to API issues

**Details**: The search button shows "Search ⌘K" in the header. Without working APIs, search functionality cannot be tested.

### BUG-018: Arabic locale switch available but untested

**Severity**: P4 — LOW
**Impact**: Arabic toggle exists in user menu ("العربية") but RTL behaviour cannot be verified without working data

**Details**: The user dropdown menu includes a language switch to Arabic. Without working API endpoints and data, the RTL layout, Arabic translations, and bidirectional text handling cannot be properly tested.

### BUG-019: Theme switcher (Light/Dark/System) — untested

**Severity**: P4 — LOW
**Impact**: Theme options exist but dark mode behaviour not verified

**Details**: User menu includes Light, Dark, and System theme buttons. These appear functional (client-side) but dark mode styling quality cannot be fully assessed without data-populated pages.

### BUG-020: Profile and Communication preferences pages — untested

**Severity**: P4 — LOW
**Impact**: User menu links to Profile and Communication preferences pages — cannot verify without working APIs

---

## SUMMARY

| Severity | Count | Key Theme |
|----------|-------|-----------|
| P0 — BLOCKER | 1 | API backend not serving any domain endpoints |
| P1 — CRITICAL | 2 | No RBAC on sidebar, no role-specific dashboards |
| P2 — HIGH | 5 | Missing route, missing favicon, stuck header, settings broken |
| P3 — MEDIUM | 8 | Empty states, no error handling, no page titles, broken forms |
| P4 — LOW | 4 | Untestable features due to API blockers |
| **TOTAL** | **20** | |

## PRIORITY ACTION PLAN

### Immediate (fix BUG-001 first — everything else depends on it)
1. **Investigate why all non-auth API routes return 404**. Check:
   - Is the NestJS API process running?
   - Are all NestJS modules registered in `AppModule`?
   - Is the reverse proxy (Caddy/Nginx) correctly forwarding `/api/v1/*` to the backend?
   - Is there a global route prefix mismatch?
   - Check API server logs for startup errors or missing module imports

### After API is fixed
2. Implement role-based sidebar filtering (BUG-002)
3. Implement role-specific dashboards (BUG-003)
4. Fix the Approvals frontend route (BUG-004)
5. Add favicon (BUG-005)
6. Fix header title to reflect current page (BUG-006)
7. Add error handling / toast notifications for API failures (BUG-010, BUG-011)
8. Add dynamic page titles (BUG-012)

### After data can be created
9. Re-test all CRUD flows (create students, staff, households, classes, etc.)
10. Test all form validations
11. Test Arabic locale and RTL
12. Test dark mode
13. Test all role-specific permissions and access controls
14. Test all scheduling, finance, payroll, admissions, and communications workflows
