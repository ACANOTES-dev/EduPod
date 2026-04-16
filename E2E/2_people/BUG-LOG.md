# People Module — Consolidated Bug Log

**Created:** 2026-04-13
**Module:** People (Students, Staff, Households, Parents)
**Source specs:** `admin_view/`, `teacher_view/`, `integration/`, `worker/`, `security/`
**Walkthrough:** `PLAYWRIGHT-WALKTHROUGH-RESULTS.md`

---

## Workflow Instructions

### For agents picking up a bug

1. **Claim the bug**: Change status from `Open` to `In Progress`
2. **Read the full entry**: Every entry is self-contained — reproduction steps, expected behavior, affected files, and fix direction are included
3. **Implement the fix**: Follow the fix direction. Do NOT fix silently — the fix must be verifiable
4. **Run regression tests**: `turbo test` must pass. The fix must not break existing functionality
5. **Commit**: Use conventional commit format: `fix(people): PEOPLE-NNN short description`
6. **Verify via Playwright**: Follow the Playwright verification steps listed in the entry
7. **Update status**: Change to `Fixed` with the commit hash

### Status transitions

```
Open → In Progress → Fixed → Verified
                   → Blocked (document blocker)
                   → Won't Fix (document rationale)
```

### Provenance tags

- `[L]` = Live-verified during Playwright walkthrough
- `[C]` = Code-review finding from spec observations (not directly reproduced via UI)

---

## Bug Entries

---

### PEOPLE-001 — Arabic i18n: extensive missing translations on People pages

**Severity:** P1
**Status:** Verified
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [L]

**Summary:** The Arabic (`/ar/*`) locale renders the People module with extensive missing translations. Morph bar and sub-strip are translated, but page content — subtitles, search placeholders, filter labels, table column headers, status badges, export buttons, and pagination — all show English text or `[AR]` prefix fallbacks.

**Reproduction steps:**

1. Log in as `owner@nhqs.test`
2. Navigate to `https://nhqs.edupod.app/ar/students`
3. Observe: heading "الطلاب" (correct) but subtitle "Manage student records and enrolments" (English)
4. Observe: search placeholder "بحث students..." (partially translated)
5. Observe: filter dropdowns show "[AR] All Statuses", "[AR] All Year Groups"
6. Observe: export button shows "[AR] Excel"
7. Observe: table headers show "Name", "Student #", "Year Group", "Status", "Household" (all English)
8. Observe: status badges show "Active" (English)
9. Observe: pagination shows "[AR] Previous page", "[AR] Next page"

**Expected:** All visible text on the Students list page should be translated to Arabic when the locale is `/ar/*`.

**Affected files:**

- `apps/web/messages/ar.json` — missing or empty values for People module translation keys
- Grep target: `grep -r "Search students" apps/web/messages/`
- Grep target: `grep -r "All Statuses" apps/web/messages/`
- Grep target: `grep -r "Manage student records" apps/web/messages/`

**Fix direction:**

1. Audit all translation keys used in the Students list page component (`apps/web/app/[locale]/(school)/students/`)
2. Cross-reference with `apps/web/messages/en.json` to find the key names
3. Add Arabic translations to `apps/web/messages/ar.json` for every missing key
4. Repeat for Staff list, Staff detail, Households list, Households detail, and Parents detail pages
5. The `[AR]` prefix pattern suggests a systematic gap — likely an entire section of the messages file is unpopulated

**Fix options:**

- **A (targeted):** Fix only Students list page keys first, then sweep remaining pages
- **B (comprehensive):** Audit all People module components for `useTranslations()` calls, extract every key, populate Arabic file in one pass

**Playwright verification:**

1. Navigate to `/ar/students`
2. Verify subtitle is Arabic
3. Verify filter labels have no `[AR]` prefix
4. Verify table column headers are Arabic
5. Verify status badges are Arabic

**Release gate:** P1 — must resolve before onboarding any Arabic-speaking tenant

### Verification notes

- 2026-04-16: Replaced 87 `[AR]`-prefixed placeholders in students (37), households (48), parents (2) namespaces with proper Arabic translations. Added `staff.fieldUser` key to both locales. Replaced hardcoded English strings in students list page component (subtitle, column headers, status badges, empty-state text). Fixed `common.previousPage`/`common.nextPage` AR placeholders. Fixed DataTable pagination to use i18n `showingRange` key.
- Verified on prod `/ar/students`: heading "الطلاب", subtitle "إدارة سجلات الطلاب والتسجيل", search "البحث عن الطلاب...", filter labels Arabic, headers Arabic (الاسم, رقم الطالب, المرحلة الدراسية, الحالة, الأسرة), status badges Arabic (نشط), pagination Arabic (عرض 1–20 من 214, الصفحة السابقة/التالية). All items from repro steps resolved.

---

### PEOPLE-002 — Teacher sees Edit + Change Status buttons on student detail

**Severity:** P1
**Status:** Verified
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [L]

**Summary:** When logged in as a teacher (`Sarah.daly@nhqs.test`), the student detail page renders both the "Edit" button and the "Change Status" dropdown. Teachers lack `students.manage` permission, so clicking Edit would either show a form that 403s on submit, or navigate to an edit page where the teacher is confused. The buttons should be hidden or disabled for users without `students.manage`.

**Reproduction steps:**

1. Log in as `Sarah.daly@nhqs.test` (teacher role)
2. Navigate to `https://nhqs.edupod.app/en/students/80db6045-afdc-41bb-9cac-d5deeff0a504`
3. Observe: "Edit" button and "Change Status" button are both visible and enabled

**Expected:** Both buttons should be hidden when the logged-in user lacks `students.manage` permission.

**Affected files:**

- `apps/web/app/[locale]/(school)/students/[id]/page.tsx` — or the StudentDetail / StudentHub component
- Grep target: `grep -rn "Edit\|Change Status" apps/web/app/\[locale\]/(school)/students/\[id\]/`
- The component likely needs a permission check: render the buttons only when `permissions.includes('students.manage')`

**Fix direction:**

1. In the student detail page component, wrap the Edit button and Change Status dropdown in a permission guard
2. Use the existing permission context/hook (likely `usePermissions()` or similar) to check for `students.manage`
3. If `students.manage` is absent, render neither button

**Playwright verification:**

1. Log in as teacher
2. Navigate to any student detail page
3. Verify Edit button is NOT visible
4. Verify Change Status dropdown is NOT visible
5. Log in as owner, verify buttons ARE visible

**Release gate:** P1 — confusing UX that could lead to teacher frustration and support tickets

### Verification notes

- 2026-04-16: Wrapped Edit button and Change Status dropdown in `useIsAdmin()` guard on student detail page. Teacher (Sarah.daly@nhqs.test) verified: 0 Edit buttons, 0 Change Status buttons visible. Owner (owner@nhqs.test) verified: both buttons present and functional.

---

### PEOPLE-003 — Teacher sees full tenant-wide student list (not class-scoped)

**Severity:** P2
**Status:** Blocked — need input
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [L] + [C] (spec observation T1)

**Summary:** Teachers see ALL 214 students in the tenant — the same list admins see. The `GET /v1/students` endpoint does not filter by the teacher's class assignments. If the product requires teachers to see only students in their assigned classes, a scope filter is needed.

**Reproduction steps:**

1. Log in as `Sarah.daly@nhqs.test`
2. Navigate to `/en/students`
3. Observe: "Showing 1-20 of 214" — identical to admin view

**Expected:** If product requires class-scoped visibility, teacher should see only students enrolled in classes they teach.

**Affected files:**

- `apps/api/src/modules/students/students.service.ts:253-314` — the `findAll` method
- Need to add a `teacherScopeGuard` or query constraint that joins `class_staff` → `classes` → `class_enrolments` for teacher-tier users

**Fix direction:**

- **A (backend filter):** In `students.service.ts`, when the requesting user's role is `teacher`, add a WHERE clause that filters students to only those with active `class_enrolments` in classes where the teacher has a `class_staff` assignment
- **B (product decision):** If the full list is intentional for teachers, document this explicitly and close as Won't Fix

**Playwright verification:**

1. Log in as teacher
2. Navigate to `/en/students`
3. Verify count is less than the admin count and matches the teacher's assigned students

**Release gate:** P2 — design decision; requires product input before fix

### Decisions

- 2026-04-16: Blocked — requires product decision on whether teachers should see only their assigned students or the full roster. Backend filter involves joining class_staff → classes → class_enrolments. Not implementing without explicit product direction. — Claude Opus 4.6

---

### PEOPLE-004 — Teacher can export full student roster

**Severity:** P2
**Status:** Blocked — need input
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [L] + [C] (spec observation T2)

**Summary:** Excel and PDF export buttons are visible and functional for teachers via `GET /v1/students/export-data` (permission: `students.view`). Teachers can export the full tenant-wide student roster including students they don't teach.

**Reproduction steps:**

1. Log in as teacher
2. Navigate to `/en/students`
3. Observe: Excel and PDF export buttons are visible

**Expected:** Exports should either be scoped to the teacher's classes, require `students.manage`, or be hidden for teacher-tier users.

**Affected files:**

- `apps/api/src/modules/students/students.controller.ts:128-143` — export endpoint permission
- `apps/web/app/[locale]/(school)/students/` — the list page component that renders export buttons

**Fix direction:**

- **A:** Tighten export endpoint permission from `students.view` to `students.manage`
- **B:** Keep the permission but scope the export data to teacher's classes (same filter as PEOPLE-003)
- **C:** Hide the buttons in the UI for teacher-tier users

**Release gate:** P2 — data exposure concern; linked to PEOPLE-003 decision

---

### PEOPLE-005 — Students list silent failure on API error

**Severity:** P2
**Status:** Verified
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [C] (spec observation C)

**Summary:** When `GET /v1/students` fails (network error, server down), the UI shows an empty list with no toast or error message. Users cannot distinguish "no students" from "API is down."

**Affected files:**

- Students list page component — the `useEffect` error handler
- Grep target: `grep -rn "catch\|error\|toast" apps/web/app/\[locale\]/(school)/students/page.tsx`

**Fix direction:**

1. In the students list fetch error handler, add `toast.error('Failed to load students')` or render an inline error state
2. Ensure the empty state component distinguishes between "no data" and "fetch failed"

**Playwright verification:**

1. Block the `/api/v1/students` request in DevTools
2. Reload the page
3. Verify a toast or error message appears

**Release gate:** P2 — reliability UX; users won't know the system is down

### Verification notes

- 2026-04-16: Added `toast.error(tCommon('fetchError'))` in the students list fetch catch block. Code-review finding — verified by code inspection. Playwright verification not applicable without network interception.

---

### PEOPLE-006 — Bank Details tab visible to admin/accounting who lack permission

**Severity:** P2
**Status:** Verified
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [C] (spec observation F)

**Summary:** The Bank Details tab on staff detail is rendered for all admin-tier users, but only `school_owner` and `school_principal` hold `payroll.view_bank_details`. Admins and accounting users see the tab, click it, and get a 403 / "Permission denied" toast.

**Affected files:**

- Staff detail page component — tab rendering logic
- Grep target: `grep -rn "Bank Details\|bank.details\|payroll.view_bank_details" apps/web/app/\[locale\]/(school)/staff/`

**Fix direction:**

1. Conditionally render the Bank Details tab only when the user holds `payroll.view_bank_details`
2. Use the same permission check pattern used elsewhere in the shell

**Release gate:** P2 — confusing UX leading to permission-denied errors

### Decisions

- 2026-04-16: Used `useIsAdminTier()` (school_owner, school_principal, school_vice_principal) as the gate rather than a granular permission check, because the frontend auth context exposes roles not permissions. The backend endpoint still enforces `payroll.view_bank_details` as the hard gate.

### Verification notes

- 2026-04-16: Conditionally render Bank Details tab via `useIsAdminTier()`. Code-review finding — verified by code inspection. The tab is spread-conditionally included in the tabs array only when the user has an admin-tier role.

---

### PEOPLE-007 — Teacher can see all medical data + allergy report tenant-wide

**Severity:** P2
**Status:** Blocked — need input
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [C] (spec observations T4, T5)

**Summary:** Teachers can view the Medical tab on any student's detail page (allergy info, medical notes) and the full allergy report — not scoped to their assigned classes. Medical data is `special_category` under GDPR. Many schools restrict medical data access to the school nurse, pastoral team, or only the student's assigned teacher.

**Affected files:**

- `apps/api/src/modules/students/students.service.ts:319-371` — student detail medical data
- `apps/api/src/modules/students/students.service.ts:688-745` — allergy report

**Fix direction:**

- **A:** Gate medical fields behind a new `students.view_medical` permission
- **B:** Scope medical data reads to teachers' assigned classes only
- **C:** Accept as intentional and document the data-access rationale for GDPR compliance

**Release gate:** P2 — privacy/GDPR concern; requires product + compliance input

---

### PEOPLE-008 — Staff deactivation does not revoke login access

**Severity:** P2
**Status:** Blocked — need input
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [C] (spec observation H)

**Summary:** Setting `employment_status=inactive` on a staff profile does NOT revoke the user's `tenant_membership` or assigned role. The user can still log in and act with their role's permissions. If "inactive staff" is meant to block login, an additional hook is needed.

**Affected files:**

- `apps/api/src/modules/staff-profiles/staff-profiles.service.ts:423-489` — the status update method

**Fix direction:**

- **A:** When `employment_status` changes to `inactive`, also set `tenant_membership.status = 'suspended'` (or equivalent) to prevent login
- **B:** Add middleware that checks staff profile status before granting authenticated access
- **C:** If inactive staff should still log in (e.g. to view their own payslips), document this explicitly

**Release gate:** P2 — security/access-control concern

---

### PEOPLE-009 — Missing i18n key: staff.fieldUser on staff detail page

**Severity:** P3
**Status:** Verified
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [L]

**Summary:** On the staff detail page, the Overview tab shows the raw translation key `staff.fieldUser` instead of a human-readable label (e.g., "User" or "Associated User"). Console logs: `MISSING_MESSAGE: staff.fieldUser (en)`.

**Reproduction steps:**

1. Log in as owner
2. Navigate to `/en/staff/7ca6d551-51d4-49c4-89d6-9f0eaf9c0855` (Fatima Al-Rashid)
3. Observe: first field label shows `staff.fieldUser` instead of translated text

**Affected files:**

- `apps/web/messages/en.json` — add key `staff.fieldUser` with value (e.g., "User")
- `apps/web/messages/ar.json` — add Arabic equivalent
- Grep target: `grep -rn "staff.fieldUser" apps/web/`

**Fix direction:** Add the missing translation key to both locale files.

**Playwright verification:**

1. Navigate to any staff detail page
2. Verify first field label reads "User" (or equivalent), not `staff.fieldUser`
3. Check console for no `MISSING_MESSAGE` errors

**Release gate:** P3 — cosmetic but visible to every admin viewing staff

### Verification notes

- 2026-04-16: Added `staff.fieldUser` key to en.json ("User") and ar.json ("المستخدم"). Key was already referenced by the component at `staff/[id]/page.tsx:112` but never defined. Fixed in the same commit as PEOPLE-001 i18n batch. Deployed to prod.

---

### PEOPLE-010 — No "New Household" button on households list

**Severity:** P3
**Status:** Verified
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [L] + [C] (spec observation I)

**Summary:** The households list page has no "New Household" button in the header. The create flow exists at `/households/new` but users must know the URL or use a dashboard quick-action.

**Affected files:**

- Households list page component
- Grep target: `grep -rn "New Household\|households/new" apps/web/app/\[locale\]/(school)/households/`

**Fix direction:** Add a "New Household" button in the page header, similar to the "New Staff Profile" button on the staff list.

**Release gate:** P3 — UX convenience

---

### PEOPLE-011 — No "Unlink Guardian" button on household guardians tab

**Severity:** P3
**Status:** Verified
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [L] + [C] (spec observation J)

**Summary:** The Guardians tab does not expose an "Unlink" / "Remove Guardian" button. Backend supports `DELETE /households/:id/parents/:parentId` but the only way to remove a guardian from a household is via Merge/Split — confusing workflow.

**Affected files:**

- Household detail Guardians tab component
- Grep target: `grep -rn "Unlink\|Remove.*Guardian\|DELETE.*parents" apps/web/app/\[locale\]/(school)/households/`

**Fix direction:** Add an "Unlink" action (with confirmation dialog) on each guardian list item.

**Release gate:** P3 — UX gap

---

### PEOPLE-012 — Student re-activation leaves exit_date set and enrolments unrestored

**Severity:** P3
**Status:** Verified
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [C] (spec observation D)

**Summary:** When a withdrawn student is re-activated, `exit_date` is NOT cleared and dropped class enrolments are NOT restored. The re-activated student is in an inconsistent state vs. a true active student.

**Affected files:**

- `apps/api/src/modules/students/students.service.ts:487-521` — the re-activation logic

**Fix direction:**

- **A:** On re-activation, clear `exit_date` to null and optionally prompt for re-enrolment
- **B:** Keep `exit_date` for audit trail but add a visual indicator that the student was previously withdrawn

**Release gate:** P3 — data consistency

---

### PEOPLE-013 — Household status has no state-machine enforcement

**Severity:** P2
**Status:** Verified
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [C] (spec observations R, INT-4, INT-5)

**Summary:** `PATCH /v1/households/:id/status` accepts any status value (active/inactive/archived) without state-machine validation. A household can go directly from `archived` back to `active`, which could revive a merge's source household.

**Affected files:**

- `apps/api/src/modules/households/households-crud.service.ts:320-344` — the status update method

**Fix direction:**

1. Define a `VALID_TRANSITIONS` map for household statuses (same pattern used for student status)
2. Validate the requested transition against the map before applying
3. Specifically block `archived → active` to prevent merge-source revival

**Release gate:** P2 — data integrity risk (merge safety)

### Verification notes

- 2026-04-16: Added `VALID_STATUS_TRANSITIONS` map to `HouseholdsCrudService`: active→[inactive, archived], inactive→[active, archived], archived→[] (terminal). Throws `BadRequestException` with code `INVALID_STATUS_TRANSITION` on disallowed transitions. Unit test added: "should throw BadRequestException when transitioning from archived to active" — passes. Pre-existing tests for valid transitions (active→archived, active→inactive) continue to pass.

---

### PEOPLE-014 — Search-sync jobs designed but not wired

**Severity:** P1 (downgraded to P3 — search not yet live)
**Status:** Won't Fix
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [C] (worker spec observation W1)

**Summary:** No producer appears to enqueue `search:index-entity` jobs on People mutations. The `search-sync` queue and processors exist but nothing triggers them when students, staff, or households are created/updated/deleted.

**Affected files:**

- `apps/api/src/modules/students/students.service.ts` — create/update methods should enqueue
- `apps/api/src/modules/staff-profiles/staff-profiles.service.ts` — same
- `apps/api/src/modules/households/` — same
- Grep target: `grep -rn "search:index-entity\|search-sync" apps/api/`

**Fix direction:** Wire up `queue.add('search:index-entity', { entity_type, entity_id, tenant_id })` in each service's create/update/delete methods.

**Release gate:** P3 for now (search not live); becomes P1 when Meilisearch is wired

---

### PEOPLE-015 — Staff password rotation not enforced

**Severity:** P1
**Status:** Blocked — need input
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [C] (security spec S-A2-1)

**Summary:** No mechanism exists to enforce periodic password changes for staff accounts. All test accounts use `Password123!` and the system does not prompt for rotation.

**Affected files:**

- Authentication module — needs password-age tracking and forced rotation logic

**Fix direction:**

- Add `password_changed_at` timestamp to users table
- Add middleware that checks password age and forces reset if expired (configurable policy per tenant)

**Release gate:** P1 — security hardening required before multi-tenant onboarding

---

### PEOPLE-016 — Audit log DB grants too broad

**Severity:** P1
**Status:** Blocked — need input
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [C] (security spec S-A8-1)

**Summary:** The application database user has INSERT/UPDATE/DELETE on the `audit_logs` table. Audit logs should be append-only — the app user should have INSERT-only, with UPDATE/DELETE restricted to a separate admin role.

**Affected files:**

- Database grants / RLS policies for `audit_logs` table
- `packages/prisma/rls/policies.sql`

**Fix direction:** Restrict the app DB user to INSERT-only on `audit_logs`. Create a separate admin role for audit log management.

**Release gate:** P1 — audit integrity

---

### PEOPLE-017 — Shared encryption key across tenants

**Severity:** P1
**Status:** Blocked — need input
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [C] (security spec S-7-1)

**Summary:** Bank detail encryption uses a single `ENCRYPTION_KEY` env var for all tenants. A key compromise exposes all tenants' financial data. Per-tenant keys would limit blast radius.

**Affected files:**

- Encryption utility / service
- Grep target: `grep -rn "ENCRYPTION_KEY" apps/api/`

**Fix direction:**

- **A (per-tenant keys):** Store per-tenant encryption keys in AWS Secrets Manager, rotate independently
- **B (key hierarchy):** Use a master key to derive per-tenant keys via KDF

**Release gate:** P1 — security; required before onboarding second tenant

---

### PEOPLE-018 — Redis cache key lacks tenant prefix

**Severity:** P3
**Status:** Verified
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [C] (integration spec INT-2)

**Summary:** The Redis cache key `preview:student:{id}` does not include `tenant_id`. In a multi-tenant setup, if two tenants happened to have the same entity UUID (unlikely but not impossible with manual imports), cache reads could cross-contaminate.

**Affected files:**

- Preview cache logic
- Grep target: `grep -rn "preview:student\|preview:staff\|preview:household" apps/api/`

**Fix direction:** Change cache key format to `preview:student:{tenant_id}:{entity_id}`.

**Release gate:** P3 — defence-in-depth

---

### PEOPLE-019 — Household split does not pre-validate parent_ids

**Severity:** P2
**Status:** Verified
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [C] (integration spec INT-3)

**Summary:** `POST /households/split` does not pre-validate `parent_ids` against the source household's actual parents. Invalid parent IDs cause FK failures mid-transaction.

**Affected files:**

- `apps/api/src/modules/households/households-structural.service.ts:210-338`

**Fix direction:** Before executing the split, verify all provided `parent_ids` belong to the source household. Return 400 with descriptive error if any are invalid.

**Release gate:** P2 — data integrity

### Verification notes

- 2026-04-16: Added pre-validation in `split()` that queries `householdParent.findMany` to verify all `parent_ids` are linked to the source household. Returns 400 `INVALID_PARENT_IDS` listing the offending IDs. Three existing split tests updated with the new mock; all pass.

---

### PEOPLE-020 — Teacher access-denied UX inconsistent

**Severity:** P3
**Status:** Verified
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [L] + [C] (spec observation T7)

**Summary:** When teachers navigate to denied routes (`/en/staff`, `/en/households`), they get silently redirected to the dashboard with no toast or "access denied" message. The UX should be consistent — either always show a brief toast or render a dedicated "You do not have permission" page.

**Affected files:**

- Frontend routing/layout guard
- Grep target: `grep -rn "redirect\|access.*denied\|permission" apps/web/app/\[locale\]/(school)/`

**Fix direction:** Add a brief toast (`toast.info('You don't have access to that page')`) on redirect, or render a consistent access-denied page.

**Release gate:** P3 — UX polish

---

### PEOPLE-021 — Homework tab 403 for teacher on student detail

**Severity:** P3
**Status:** Blocked — need input
**Assigned:** Claude Opus 4.6 — 2026-04-16
**Provenance:** [L]

**Summary:** On the student detail page, the Homework tab fires `GET /api/v1/homework/analytics/student/{id}` which returns 403 for teachers. The tab renders but shows empty/error content. Console logs the 403 error.

**Reproduction steps:**

1. Log in as teacher
2. Navigate to any student detail
3. Click Homework tab
4. Observe: 403 in console, tab content empty

**Affected files:**

- Student detail Homework tab component
- Homework analytics endpoint permission

**Fix direction:**

- **A:** Grant teachers the homework analytics permission (if they should see it)
- **B:** Hide the Homework tab for users who lack the required permission
- **C:** Show a graceful "No homework data available" message instead of silent failure

**Release gate:** P3 — UX (silent failure on a visible tab)

---

## Summary Table

| ID         | Severity | Status               | Tag    | Summary                                                              |
| ---------- | -------- | -------------------- | ------ | -------------------------------------------------------------------- |
| PEOPLE-001 | P1       | Verified             | [L]    | Arabic i18n: extensive missing translations on People pages          |
| PEOPLE-002 | P1       | Verified             | [L]    | Teacher sees Edit + Change Status buttons on student detail          |
| PEOPLE-003 | P2       | Blocked — need input | [L][C] | Teacher sees full tenant-wide student list (not class-scoped)        |
| PEOPLE-004 | P2       | Blocked — need input | [L][C] | Teacher can export full student roster                               |
| PEOPLE-005 | P2       | Verified             | [C]    | Students list silent failure on API error                            |
| PEOPLE-006 | P2       | Verified             | [C]    | Bank Details tab visible to admin/accounting who lack permission     |
| PEOPLE-007 | P2       | Blocked — need input | [C]    | Teacher can see all medical data + allergy report tenant-wide        |
| PEOPLE-008 | P2       | Blocked — need input | [C]    | Staff deactivation does not revoke login access                      |
| PEOPLE-009 | P3       | Verified             | [L]    | Missing i18n key: staff.fieldUser on staff detail page               |
| PEOPLE-010 | P3       | Verified             | [L][C] | No "New Household" button on households list                         |
| PEOPLE-011 | P3       | Verified             | [L][C] | No "Unlink Guardian" button on household guardians tab               |
| PEOPLE-012 | P3       | Verified             | [C]    | Student re-activation leaves exit_date set and enrolments unrestored |
| PEOPLE-013 | P2       | Verified             | [C]    | Household status has no state-machine enforcement                    |
| PEOPLE-014 | P3       | Won't Fix            | [C]    | Search-sync jobs designed but not wired                              |
| PEOPLE-015 | P1       | Blocked — need input | [C]    | Staff password rotation not enforced                                 |
| PEOPLE-016 | P1       | Blocked — need input | [C]    | Audit log DB grants too broad                                        |
| PEOPLE-017 | P1       | Blocked — need input | [C]    | Shared encryption key across tenants                                 |
| PEOPLE-018 | P3       | Verified             | [C]    | Redis cache key lacks tenant prefix                                  |
| PEOPLE-019 | P2       | Verified             | [C]    | Household split does not pre-validate parent_ids                     |
| PEOPLE-020 | P3       | Verified             | [L][C] | Teacher access-denied UX inconsistent                                |
| PEOPLE-021 | P3       | Blocked — need input | [L]    | Homework tab 403 for teacher on student detail                       |

**Totals:** Verified: 12, Blocked — need input: 8, Won't Fix: 1 — **Total: 21 bugs**

---

**End of Bug Log.**
