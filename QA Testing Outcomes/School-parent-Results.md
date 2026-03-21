# School Parent (school_parent) — QA Test Results

**Application:** School Operating System (EduPod)
**Role:** School Parent (`school_parent`)
**Test Account:** `parent@mdad.test` (Khadija Mahmoud) — Midaad Ul Qalam
**Environment:** Production (`mdad.edupod.app`)
**Date:** 2026-03-21
**Tester:** Automated QA (API + Playwright browser testing)

---

## Executive Summary

- **Total tests:** 63
- **Passed:** 47 (75%)
- **Failed:** 16 (25%)
- **Critical/High bugs:** 5
- **Medium bugs:** 7
- **Low/Info bugs:** 4

The parent role has significant security gaps (settings/branding/notification-settings endpoints exposed), broken core features (inquiry reply, applications page), missing UI functionality (grades tab not integrated, no sidebar links to parent pages), and i18n issues (hardcoded English strings in Arabic locale).

---

## Part 1: API Endpoint Tests (Production)

### Positive Tests (Expected: 200 OK)

| # | Endpoint | Status | Result | Notes |
|---|----------|--------|--------|-------|
| P1 | `GET /api/v1/dashboard/parent` | 200 | **PASS** | Returns greeting + 1 student (Ahmad Al-Farsi, Year 1, Y1A, active) |
| P2 | `GET /api/v1/announcements/my` | 200 | **PASS** | Returns empty array (no notifications dispatched to this parent) |
| P3 | `GET /api/v1/inquiries/my` | 200 | **PASS** | Returns 1 existing inquiry + QA test inquiry |
| P4 | `POST /api/v1/inquiries` | 201 | **PASS** | Created inquiry with subject/message |
| P5 | `GET /api/v1/inquiries/{id}/parent` | 200 | **PASS** | Returns inquiry detail with messages array |
| P6 | `POST /api/v1/inquiries/{id}/messages/parent` | 201 | **PASS** | Reply created (correct endpoint is `/messages/parent`) |
| P7 | `GET /api/v1/inquiries/{id}/parent` (verify reply) | 200 | **PASS** | Both original and reply appear |
| P8 | `GET /api/v1/applications/mine` | **403** | **FAIL** | Requires `admissions.view` — parent lacks this permission |
| P9 | `GET /api/v1/academic-periods` | **403** | **FAIL** | Requires `students.view` — parent lacks this permission |
| P10 | `GET /api/v1/auth/me` | 200 | **PASS** | Returns user info with memberships and parent role |
| P11 | `GET /api/v1/auth/sessions` | 200 | **PASS** | Returns active sessions |
| P12 | `GET /api/v1/me/preferences` | 200 | **PASS** | Returns preferences |
| P13 | `PATCH /api/v1/me/preferences` | 200 | **PASS** | Successfully updates preferences |
| P14 | `GET /api/v1/notifications` | 200 | **PASS** | Returns empty array |
| P15 | `GET /api/v1/notifications/unread-count` | 200 | **PASS** | Returns 0 |
| P16 | `GET /api/v1/parent/students/{id}/grades` | 200 | **PASS** | Returns 24 grade entries across 5 subjects |
| P17 | `GET /api/v1/parent/students/{id}/attendance` | 200 | **PASS** | Returns 10 attendance records |

### Negative Tests (Expected: 403 Forbidden)

| # | Endpoint | Status | Result | Notes |
|---|----------|--------|--------|-------|
| N1 | `GET /api/v1/students` | 403 | **PASS** | Correctly blocked |
| N2 | `GET /api/v1/staff-profiles` | 403 | **PASS** | Correctly blocked |
| N3 | `GET /api/v1/households` | 403 | **PASS** | Correctly blocked |
| N4 | `GET /api/v1/classes` | 403 | **PASS** | Correctly blocked |
| N5 | `GET /api/v1/finance/invoices` | 403 | **PASS** | Correctly blocked |
| N6 | `GET /api/v1/payroll/runs` | 403 | **PASS** | Correctly blocked |
| N7 | `POST /api/v1/students` | 403 | **PASS** | Correctly blocked |
| N8 | `GET /api/v1/attendance-sessions` | 403 | **PASS** | Correctly blocked |
| N9 | `GET /api/v1/gradebook/assessments` | 403 | **PASS** | Correctly blocked |
| N10 | `GET /api/v1/dashboard/school-admin` | 403 | **PASS** | Correctly blocked |
| N11 | `GET /api/v1/settings` | **200** | **FAIL** | **SECURITY BUG** — Returns ALL tenant config |
| N12 | `PATCH /api/v1/settings` | 403 | **PASS** | Write correctly blocked |
| N13 | `GET /api/v1/approval-requests` | 403 | **PASS** | Correctly blocked |
| N14 | `GET /api/v1/announcements` (admin) | 403 | **PASS** | Correctly blocked |
| N15 | `POST /api/v1/announcements` | 403 | **PASS** | Correctly blocked |
| N16 | `GET /api/v1/admission-forms` | 403 | **PASS** | Correctly blocked |
| N17 | `GET /api/v1/users` | 403 | **PASS** | Correctly blocked |
| N18 | `GET /api/v1/stripe-config` | 403 | **PASS** | Correctly blocked |
| N19 | `GET /api/v1/finance/fee-structures` | 403 | **PASS** | Correctly blocked |
| N20 | `GET /api/v1/audit-logs` | 403 | **PASS** | Correctly blocked |
| N21 | `GET /api/v1/schedules` | 403 | **PASS** | Correctly blocked |
| N22 | `GET /api/v1/notification-settings` | **200** | **FAIL** | **SECURITY BUG** — Returns all notification type configs |
| N23 | `GET /api/v1/branding` | **200** | **FAIL** | **SECURITY BUG** — Returns branding including prefixes |

### RLS Cross-Tenant Tests

| # | Test | Status | Result |
|---|------|--------|--------|
| RLS1 | Login as Al Noor parent | 200 | **PASS** |
| RLS2 | Al Noor token on MDAD dashboard | 401 | **PASS** |
| RLS3 | Al Noor token on MDAD inquiries | 401 | **PASS** |
| RLS4 | Al Noor token on MDAD announcements | 401 | **PASS** |

### Auth Edge Cases

| # | Test | Status | Result |
|---|------|--------|--------|
| AUTH1 | No Authorization header | 401 | **PASS** |
| AUTH2 | Invalid/garbage token | 401 | **PASS** |
| AUTH3 | Expired token | 401 | **PASS** |

---

## Part 2: Playwright Browser Tests (Production)

### Login & Navigation

| # | Test | Result | Notes |
|---|------|--------|-------|
| B1 | Login at `mdad.edupod.app/en/login` | **PASS** | Login page shows "MDAD" branding. Login succeeds, redirects to `/en/dashboard/parent` |
| B2 | Dashboard loads correctly | **PASS** | Shows greeting, student card (Ahmad Al-Farsi, Year 1, Active), empty invoices, empty announcements |
| B3 | Sidebar shows only Dashboard | **PASS** | Only "Overview > Dashboard" visible. All admin sections hidden |
| B4 | User menu dropdown | **PASS** | Shows name, email, Profile link, Communication preferences, Arabic switch, theme toggle, logout |
| B5 | Topbar displays role | **PASS** | Shows "Khadija Mahmoud" with "Parent" subtitle |

### Inquiries

| # | Test | Result | Notes |
|---|------|--------|-------|
| B6 | Inquiries list page loads | **PASS** | Shows 2 inquiries with subject, status badge, date |
| B7 | Inquiry detail page loads | **PASS** | Shows title, status, opened date, message thread, reply area |
| B8 | Inquiry message bodies visible | **FAIL** | **Message text is invisible** — bubbles render but body text not visible. Only sender labels + timestamps shown |
| B9 | Send reply from inquiry detail | **FAIL** | **403 error** — Frontend posts to `/messages` instead of `/messages/parent`. Toast: "Missing required permission: inquiries.respond" |
| B10 | New inquiry form loads | **PASS** | Subject, Message, Student ID fields. Submit disabled until filled |
| B11 | Student field UX | **FAIL** | Expects raw UUID. Should be dropdown of linked children |

### Announcements

| # | Test | Result | Notes |
|---|------|--------|-------|
| B12 | Announcements page loads | **PASS** | Empty state with "No announcements yet" |
| B13 | Announcements accessible from sidebar | **FAIL** | No sidebar link. Must type URL manually |

### Applications

| # | Test | Result | Notes |
|---|------|--------|-------|
| B14 | Applications page loads | **FAIL** | Shows empty state "No applications yet" but console shows 403 error. Silently swallows permission error |
| B15 | Applications accessible from sidebar | **FAIL** | No sidebar link. Must type URL manually |

### Profile

| # | Test | Result | Notes |
|---|------|--------|-------|
| B16 | Profile page loads | **PASS** | Shows first/last name, email (disabled), locale, theme, MFA, sessions, comm prefs link |
| B17 | Personal info editable | **PASS** | First name, last name, locale dropdown all functional |
| B18 | Theme toggle works | **PASS** | Light/Dark/System buttons functional |
| B19 | MFA section displays | **PASS** | Shows "MFA is not enabled" with "Enable MFA" button |
| B20 | Sessions display | **PASS** | Lists all active sessions with user agent, IP, last active |
| B21 | Current session badge | **FAIL** | No "Current" badge on the active session. All sessions show "Revoke" button including current one |
| B22 | Communication preferences link | **PASS** | "Manage preferences" link navigates correctly |

### Admin Page Guards (Direct URL Navigation)

| # | Test | Result | Notes |
|---|------|--------|-------|
| B23 | Parent navigates to `/en/students` | **FAIL** | **Page renders with full admin UI** including "New Student" button. API returns 403 but page is not guarded |
| B24 | Parent navigates to `/en/settings` | **FAIL** | **Full settings page accessible** — Branding, General, Stripe, Users, Roles, Compliance all visible. Branding has "Save changes" button |

### Arabic (RTL) Locale

| # | Test | Result | Notes |
|---|------|--------|-------|
| B25 | Arabic dashboard loads | **PASS** | RTL layout correct. Sidebar on right. Text right-aligned |
| B26 | Section headers translated | **PASS** | "أبناؤك", "الفواتير المستحقة", "الإعلانات الأخيرة" all correct |
| B27 | Greeting translated | **FAIL** | "Good morning, Khadija" stays English — not translated to Arabic |
| B28 | Empty state descriptions | **FAIL** | "You have no outstanding invoices." and "No announcements have been published recently." are English |
| B29 | User menu role label | **FAIL** | "Parent" shows in English — should be "ولي الأمر" |

### Mobile Responsive (375x812)

| # | Test | Result | Notes |
|---|------|--------|-------|
| B30 | Dashboard mobile layout | **PASS** | Sidebar collapses to hamburger. Content stacks vertically. Student card displays correctly |

---

## Part 3: Bug Registry

### CRITICAL / HIGH Severity

| ID | Severity | Category | Description | File(s) | Fix Required |
|---|---|---|---|---|---|
| BUG-01 | **CRITICAL** | Security | `GET /api/v1/settings` readable by parent — returns ALL tenant config (payroll multipliers, scheduler weights, compliance settings, approval config) | `apps/api/src/modules/configuration/settings.controller.ts` | Add `@RequiresPermission('settings.view')` to GET handler |
| BUG-02 | **CRITICAL** | Security | `GET /api/v1/notification-settings` readable by parent — returns all notification type configs | `apps/api/src/modules/configuration/notification-settings.controller.ts` | Add `@RequiresPermission('notifications.manage')` to GET handler |
| BUG-03 | **CRITICAL** | Security | `GET /api/v1/branding` readable by parent — returns branding including invoice/receipt/payslip prefixes and support contact | `apps/api/src/modules/configuration/branding.controller.ts` | Add `@RequiresPermission('settings.view')` to GET handler |
| BUG-04 | **HIGH** | Security | Admin pages render for parent when navigated to directly (e.g., `/en/students`, `/en/settings`) — no client-side route guard. Full admin UI with action buttons visible | `apps/web/src/app/[locale]/(school)/` — all admin page components | Add permission-based route guards or redirect to dashboard if user lacks required permissions |
| BUG-05 | **HIGH** | Functionality | Inquiry reply fails — frontend posts to `/api/v1/inquiries/{id}/messages` (admin endpoint requiring `inquiries.respond`) instead of `/api/v1/inquiries/{id}/messages/parent` | `apps/web/src/app/[locale]/(school)/inquiries/[id]/page.tsx:105` | Change URL from `/messages` to `/messages/parent` |

### MEDIUM Severity

| ID | Severity | Category | Description | File(s) | Fix Required |
|---|---|---|---|---|---|
| BUG-06 | **MEDIUM** | Functionality | Applications page returns 403 — `/api/v1/applications/mine` requires `admissions.view` which parent lacks. Page silently shows empty state instead of error | `apps/api/src/modules/admissions/parent-applications.controller.ts` | Either grant parent a specific permission or remove the `admissions.view` guard from the `/mine` endpoint |
| BUG-07 | **MEDIUM** | Functionality | GradesTab component built but NOT integrated into parent dashboard — orphan component. Parents have no UI path to view grades/report cards/transcripts | `apps/web/src/app/[locale]/(school)/dashboard/parent/page.tsx` | Import and render GradesTab on the parent dashboard |
| BUG-08 | **MEDIUM** | Functionality | Inquiry message body text invisible — admin message bubbles render (green circles) but body text not visible on screen | `apps/web/src/app/[locale]/(school)/inquiries/[id]/page.tsx` | Check text colour/contrast on admin message bubbles (likely white-on-white or transparent text) |
| BUG-09 | **MEDIUM** | Navigation | Inquiries, Announcements, and Applications pages not accessible from sidebar — parents must type URLs manually | `apps/web/src/app/[locale]/(school)/layout.tsx` | Add parent-specific sidebar items for inquiries, announcements, and applications |
| BUG-10 | **MEDIUM** | Functionality | Academic periods endpoint returns 403 for parent (`students.view` required) — parents need this to filter grades by term | `apps/api/src/modules/academics/academic-periods.controller.ts` | Add parent-accessible endpoint or include periods in parent grades response |
| BUG-11 | **MEDIUM** | UI | Student field in new inquiry form expects raw UUID — parents don't know student UUIDs | `apps/web/src/app/[locale]/(school)/inquiries/new/page.tsx` | Replace with dropdown of parent's linked children (use dashboard API data) |
| BUG-12 | **MEDIUM** | UI | Active sessions — no "Current" badge on the active session. All sessions (including current) show "Revoke" button | `apps/web/src/app/[locale]/(school)/profile/page.tsx` | Check `is_current` flag from API response; hide Revoke button on current session |

### LOW / INFO Severity

| ID | Severity | Category | Description | File(s) | Fix Required |
|---|---|---|---|---|---|
| BUG-13 | **LOW** | i18n | Greeting "Good morning, Khadija" not translated to Arabic | `apps/api/src/modules/dashboard/dashboard.service.ts:15-19` | Build greeting from translation keys instead of hardcoded English |
| BUG-14 | **LOW** | i18n | Hardcoded English strings in parent dashboard: "You have no outstanding invoices.", "No announcements have been published recently." | `apps/web/src/app/[locale]/(school)/dashboard/parent/page.tsx:119,133,145` | Use translation keys instead of hardcoded strings |
| BUG-15 | **LOW** | i18n | User menu role label "Parent" not translated to "ولي الأمر" in Arabic | `apps/web/src/app/[locale]/(school)/layout.tsx` or user menu component | Translate role labels |
| BUG-16 | **LOW** | UI | Page title in topbar always shows "Dashboard" on non-dashboard pages (inquiries, profile, announcements, applications) | `apps/web/src/app/[locale]/(school)/layout.tsx` | Derive topbar title from current route or page metadata |

---

## Part 4: Test Coverage Summary

| Area | Tests | Pass | Fail | Coverage |
|---|---|---|---|---|
| API Positive | 17 | 15 | 2 | 88% |
| API Negative | 23 | 20 | 3 | 87% |
| API RLS | 4 | 4 | 0 | 100% |
| API Auth | 3 | 3 | 0 | 100% |
| Browser UI | 30 | 19 | 11 | 63% |
| **Total** | **63** | **47** | **16** | **75%** |

---

## Part 5: Recommendations

### Must Fix Before Launch
1. **BUG-01, 02, 03** — Settings/notification-settings/branding API endpoints MUST have permission guards
2. **BUG-05** — Inquiry reply endpoint URL MUST be corrected
3. **BUG-04** — Client-side route guards for admin pages

### Should Fix Before Launch
4. **BUG-06** — Applications page permission fix
5. **BUG-07** — Integrate GradesTab into dashboard
6. **BUG-08** — Fix invisible inquiry message bodies
7. **BUG-09** — Add parent pages to sidebar
8. **BUG-12** — Fix current session badge

### Nice to Have
9. **BUG-10** — Academic periods accessible to parents
10. **BUG-11** — Student dropdown in new inquiry form
11. **BUG-13, 14, 15** — i18n translations
12. **BUG-16** — Dynamic page titles
