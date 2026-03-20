# QA Admin Testing Plan — Comprehensive Checklist

**Role Under Test:** School Admin (`school_admin`)
**Test Account:** A user with ONLY `school_admin` role (no `school_owner`)
**Date Created:** 2026-03-20
**Reference:** QA-OWNER-REPORT.md (format baseline), masterplan.md, all phase instructions P0–P9
**Dataset:** 750-student QA seed (40,000+ records)

---

## Scope & Purpose

This document is the **exhaustive testing checklist** for the `school_admin` role. It covers:

1. **Everything Admin CAN do** — full functional testing of all accessible features
2. **Everything Admin CANNOT do** — negative/boundary testing for owner-exclusive features
3. **Permission enforcement** — verifying RBAC blocks unauthorized actions
4. **Data isolation** — RLS cross-tenant leakage tests
5. **i18n/RTL** — Arabic locale + bidirectional layout
6. **Responsive** — mobile and tablet breakpoints
7. **Cross-entity navigation** — drill-through between related records

### Key Difference from Owner Testing

The `school_admin` role lacks access to:
- Payroll (all endpoints — view, create, manage, finalise)
- Stripe configuration
- Custom domain management
- `schedule.override_conflict` (override hard conflicts with reason)
- `schedule.configure_availability` (teacher availability windows)
- `gradebook.override_final_grade` (override period grade display value)
- `finance.override_refund_guard` (execute refund against guarded invoices)
- `compliance.process_request` (classify, approve, execute compliance requests)

These MUST return 403 or hide UI elements for the admin role.

---

## SECTION A: Authentication & Session Management

### A1. Login & Session

| # | Test | Expected |
|---|------|----------|
| A1.01 | Login with valid admin credentials | Redirects to school admin dashboard |
| A1.02 | Login with invalid password | Error message, no redirect |
| A1.03 | Login with correct email, wrong school context | Appropriate error or school selector |
| A1.04 | Session persists across page refresh | User remains authenticated |
| A1.05 | JWT refresh works (wait for token expiry) | Silent refresh, no logout |
| A1.06 | Logout via user menu | Redirects to login, session invalidated |
| A1.07 | Multiple tabs — logout in one logs out all | All tabs redirect to login |
| A1.08 | Direct URL access without auth | Redirects to login |
| A1.09 | Direct URL access to another tenant's route | 403 or redirect, no data leak |

### A2. Profile & Preferences

| # | Test | Expected |
|---|------|----------|
| A2.01 | View profile page | Shows admin's name, email, locale, theme |
| A2.02 | Edit display name | Saves and reflects in user menu |
| A2.03 | Change preferred locale (en → ar) | UI switches to Arabic + RTL |
| A2.04 | Change preferred locale (ar → en) | UI switches to English + LTR |
| A2.05 | Theme toggle: Light → Dark | Background, text, cards switch to dark palette |
| A2.06 | Theme toggle: Dark → Light | Reverts to light palette |
| A2.07 | Theme toggle: System | Follows OS preference |
| A2.08 | Communication preferences — toggle Email | Saves, reflected on reload |
| A2.09 | Communication preferences — toggle WhatsApp | Saves, reflected on reload |
| A2.10 | Enable MFA — QR code displayed | TOTP QR renders, 6-digit input shown |
| A2.11 | MFA verification with correct code | MFA enabled, confirmation shown |
| A2.12 | MFA verification with wrong code | Error, MFA not enabled |
| A2.13 | View active sessions | Current session listed with device/IP |
| A2.14 | Revoke another session | Session terminated, device logged out |

---

## SECTION B: Dashboard

### B1. Admin Dashboard Widgets

| # | Test | Expected |
|---|------|----------|
| B1.01 | Dashboard page loads without crash | No client-side errors |
| B1.02 | Personalized greeting shows admin name | "Good morning, [Admin Name]" |
| B1.03 | Today's Attendance Summary widget | Shows submitted vs pending session counts |
| B1.04 | Pending Approvals widget | Count by type (announcements, invoices, admissions, etc.) |
| B1.05 | Overdue Invoices widget | Count and total AED amount |
| B1.06 | Recent Admissions widget | Count by status |
| B1.07 | Upcoming Schedule Gaps widget | Unassigned class slots if any |
| B1.08 | Unanswered Parent Inquiries widget | List of open/in_progress inquiries |
| B1.09 | Students Missing Emergency Contacts widget | Flagged households needing completion |
| B1.10 | Households Needing Completion widget | From admissions conversion |
| B1.11 | Parents Without Email widget | Communication-restricted accounts |
| B1.12 | Payroll widget — SHOULD NOT APPEAR | Admin lacks `payroll.view`, widget hidden |
| B1.13 | Click through from each widget to detail | Navigates to correct module/page |
| B1.14 | Dashboard data matches actual DB state | Cross-verify counts with list pages |
| B1.15 | Dashboard in Arabic locale | All widget labels translated, RTL layout |

---

## SECTION C: Students

### C1. Student List

| # | Test | Expected |
|---|------|----------|
| C1.01 | Students list loads | Paginated list with correct total |
| C1.02 | Search by student name | Matching results returned |
| C1.03 | Search by partial name | Fuzzy/partial matching works |
| C1.04 | Filter by status: Active | Only active students shown |
| C1.05 | Filter by status: Applicant | Only applicants shown |
| C1.06 | Filter by status: Withdrawn | Only withdrawn shown |
| C1.07 | Filter by status: Graduated | Only graduated shown |
| C1.08 | Filter by status: Archived | Only archived shown |
| C1.09 | Filter by year group | Only students in selected year group |
| C1.10 | Filter by allergy: Has Allergy | Only flagged students |
| C1.11 | Combined filters (Active + Year 3) | Intersection of both filters |
| C1.12 | Pagination — next/previous page | Correct page shown, different records |
| C1.13 | Pagination — jump to last page | Last page renders |
| C1.14 | Page size reflects in URL/state | Consistent on reload |
| C1.15 | New Student button present | Visible and clickable |
| C1.16 | Row click navigates to detail | Correct student detail loads |

### C2. Student Detail

| # | Test | Expected |
|---|------|----------|
| C2.01 | Student detail page loads | Name, status badge, DOB, student #, year group |
| C2.02 | Overview tab — all fields | Gender, year group, household link, entry date, status |
| C2.03 | Overview tab — household link navigates | Opens correct household detail |
| C2.04 | Classes & Enrolments tab | Lists all class enrolments with class names and status |
| C2.05 | Classes & Enrolments — class link navigates | Opens correct class detail |
| C2.06 | Medical tab | Allergy status, medical notes, mandatory reason if flagged |
| C2.07 | Edit button present | Navigates to edit form |
| C2.08 | Change Status button opens dropdown | Menu with valid transitions |
| C2.09 | Status: Active → Withdrawn | Requires reason, audit-logged, enrolments end-dated |
| C2.10 | Status: Active → Graduated | Via promotion wizard only — verify UI guidance |
| C2.11 | Status: Withdrawn → Active (re-enrollment) | Status changes, new enrolment possible |
| C2.12 | Blocked transition: Applicant → Graduated | Not available in dropdown |
| C2.13 | Blocked transition: Archived → Active | Not available in dropdown |

### C3. Student Create

| # | Test | Expected |
|---|------|----------|
| C3.01 | New Student form renders | All required fields present |
| C3.02 | Required fields: First Name, Last Name, DOB, Gender, Household | Validation errors if empty |
| C3.03 | Submit with valid data | Student created, redirects to detail |
| C3.04 | Submit with missing required fields | Validation errors shown per field |
| C3.05 | Household dropdown populated | Shows all active households |
| C3.06 | Year Group dropdown populated | Shows all year groups in order |
| C3.07 | Student number auto-assigned | If configured, number generated |
| C3.08 | Duplicate student warning | If matching name+DOB exists, warning shown |
| C3.09 | Created student appears in list | Searchable, correct data |
| C3.10 | Created student appears in Meilisearch | Global search finds new student |

### C4. Student Edit

| # | Test | Expected |
|---|------|----------|
| C4.01 | Edit form pre-populated | All current values filled |
| C4.02 | Change first name and save | Name updates in detail and list |
| C4.03 | Change year group and save | Year group updates |
| C4.04 | Change household assignment | Household link updates |
| C4.05 | Add/edit medical notes | Notes saved and visible in Medical tab |
| C4.06 | Toggle allergy flag | Updates with mandatory reason |
| C4.07 | Cancel edit (back button) | No changes saved |

---

## SECTION D: Households

### D1. Household List

| # | Test | Expected |
|---|------|----------|
| D1.01 | Household list loads | Paginated list with total |
| D1.02 | Search by household name | Matching results |
| D1.03 | Filter by status | Active/Archived filter works |
| D1.04 | Pagination | Next/previous/jump |
| D1.05 | Row click → detail | Correct household detail |
| D1.06 | "Incomplete" badge on needs_completion households | Visual indicator present |

### D2. Household Detail

| # | Test | Expected |
|---|------|----------|
| D2.01 | Detail page loads | Name, status, address |
| D2.02 | Students count metric | Correct count |
| D2.03 | Parents count metric | Correct count (not 0) |
| D2.04 | Emergency Contacts count metric | Shows 0–3 |
| D2.05 | Address display | Full address with all components |
| D2.06 | Billing Parent display | Shows assigned parent or "Not set" |
| D2.07 | Incomplete banner for needs_completion | Warning shown |
| D2.08 | Students tab — list with names | Student names + status badges visible |
| D2.09 | Students tab — click navigates to student | Correct student detail |
| D2.10 | Parents tab — list with names | Parent names + roles visible |
| D2.11 | Parents tab — primary/billing flags | Correctly indicated |
| D2.12 | Emergency Contacts tab | Name, relationship, phone, edit/remove/add |
| D2.13 | Financial cross-reference link | Link to household statement/invoices |
| D2.14 | Edit button present | Navigates to edit form |
| D2.15 | Merge button present | Opens merge dialog |
| D2.16 | Split button present | Opens split dialog |

### D3. Household Create

| # | Test | Expected |
|---|------|----------|
| D3.01 | Create household form renders | All fields present |
| D3.02 | Submit with valid data | Household created, redirects to detail |
| D3.03 | Required fields validated | Address fields enforced |
| D3.04 | New household appears in list | Searchable |

### D4. Household Edit

| # | Test | Expected |
|---|------|----------|
| D4.01 | Edit form pre-populated (9 fields) | Name, address (5 fields), emergency contacts |
| D4.02 | Change household name and save | Updates in list and detail |
| D4.03 | Update address fields | All components save correctly |
| D4.04 | Set billing parent | Dropdown shows linked parents, saves |
| D4.05 | Add emergency contact | Appears in Emergency Contacts tab |
| D4.06 | Edit emergency contact | Updated values saved |
| D4.07 | Remove emergency contact (if >1) | Removed, minimum 1 enforced |
| D4.08 | Remove last emergency contact | Blocked — minimum 1 required |

### D5. Household Merge

| # | Test | Expected |
|---|------|----------|
| D5.01 | Merge dialog opens | Target household selector visible |
| D5.02 | Select target household | Preview shows what will be merged |
| D5.03 | Warning text present | Explains irreversibility |
| D5.04 | Confirm merge | Source archived, all children reassigned to target |
| D5.05 | Post-merge: students moved to target | Verify via target detail |
| D5.06 | Post-merge: parents moved to target | Verify via target detail |
| D5.07 | Post-merge: invoices reassigned | Invoice household references updated |
| D5.08 | Post-merge: payment allocations intact | Allocation references still valid |
| D5.09 | Post-merge: source shows "Merged into [target]" | Terminal status with date |
| D5.10 | Audit log entry created | Records all reassigned entity IDs |
| D5.11 | Concurrent merge on same household | Blocked by concurrency guard |

### D6. Household Split

| # | Test | Expected |
|---|------|----------|
| D6.01 | Split dialog opens | New name input, student checkboxes |
| D6.02 | Select students to move | Checkboxes functional |
| D6.03 | Emergency contacts for new household | Input fields present |
| D6.04 | Confirm split | New household created with moved entities |
| D6.05 | Post-split: selected students in new household | Verify via new household detail |
| D6.06 | Post-split: existing invoices stay with original | Not moved |
| D6.07 | Post-split: new household status = active | Correct default |
| D6.08 | Audit log entry created | Records moved entity IDs |

---

## SECTION E: Parents

### E1. Parent Management

| # | Test | Expected |
|---|------|----------|
| E1.01 | Parent list loads (if standalone page exists) | Paginated with names, emails |
| E1.02 | Parent detail via household tab | Shows parent profile |
| E1.03 | Create parent record | Email, name, phone, optional WhatsApp |
| E1.04 | Edit parent record | Update name, phone, communication prefs |
| E1.05 | Link parent to household | Via household detail |
| E1.06 | Link parent to student | Via student_parents junction |
| E1.07 | Set primary contact flag | Toggles correctly |
| E1.08 | Set billing contact flag | Toggles correctly |
| E1.09 | View communication preferences | Email/WhatsApp/Both shown |
| E1.10 | Edit communication preferences | Saves, effective on next notification |
| E1.11 | Parent without email flagged | Appears in dashboard widget |

---

## SECTION F: Staff

### F1. Staff List

| # | Test | Expected |
|---|------|----------|
| F1.01 | Staff list loads | Paginated with name, email, role, status |
| F1.02 | Search by staff name | Matching results |
| F1.03 | Filter by employment type | Full-time, part-time, contract |
| F1.04 | Row click → detail | Navigates to staff detail |

### F2. Staff Detail

| # | Test | Expected |
|---|------|----------|
| F2.01 | Staff detail loads (not blank) | Name, email, phone, department, employment type |
| F2.02 | Overview tab | All profile fields visible |
| F2.03 | Classes tab | Assigned classes with roles |
| F2.04 | Bank Details tab — VISIBILITY CHECK | Admin WITHOUT `payroll.view_bank_details` sees masked or hidden bank info |
| F2.05 | Edit button present | Navigates to edit form |

### F3. Staff Create

| # | Test | Expected |
|---|------|----------|
| F3.01 | New Staff form renders (12 inputs) | All fields present |
| F3.02 | User Account dropdown | Shows unlinked users with emails |
| F3.03 | Submit with valid data | Staff created, redirects to detail |
| F3.04 | Required field validation | Errors shown for missing required fields |
| F3.05 | Staff number auto-assigned | If configured |
| F3.06 | Bank detail fields present | Bank name, account number, IBAN |
| F3.07 | Created staff appears in list | Searchable |

### F4. Staff Edit

| # | Test | Expected |
|---|------|----------|
| F4.01 | Edit form pre-populated | All current values filled |
| F4.02 | Change department and save | Updates |
| F4.03 | Change employment type | Updates |
| F4.04 | Edit bank details | Encrypted on save, last 4 shown |
| F4.05 | Cancel edit | No changes saved |

---

## SECTION G: Academic Structure

### G1. Academic Years

| # | Test | Expected |
|---|------|----------|
| G1.01 | Academic years page loads | Shows year with name, dates, status |
| G1.02 | Period count shows correctly | Not "0 periods" if periods exist |
| G1.03 | Create academic year | Name, start date, end date, status = Planned |
| G1.04 | Edit academic year | Update name, dates, status transitions |
| G1.05 | Status lifecycle: Planned → Active | Only one active year at a time |
| G1.06 | Status lifecycle: Active → Closed | Blocks if open references exist |
| G1.07 | Delete academic year | Blocked if classes/schedules reference it |

### G2. Academic Periods

| # | Test | Expected |
|---|------|----------|
| G2.01 | Periods listed under academic year | Term/Semester/Quarter with dates |
| G2.02 | Create period | Name, type, start date, end date |
| G2.03 | Overlapping period dates blocked | DB exclusion constraint enforced |
| G2.04 | Edit period | Update dates (non-overlapping) |
| G2.05 | Delete period | Blocked if gradebook data references it |

### G3. Year Groups

| # | Test | Expected |
|---|------|----------|
| G3.01 | Year groups page loads | Shows groups with display order |
| G3.02 | Create year group | Name, display order, next year group |
| G3.03 | Edit year group (dialog pre-populated) | Name, display order, next year group chain |
| G3.04 | Year group chain visible | Next-year-group links shown |
| G3.05 | Delete year group | Blocked if students/classes reference it |

### G4. Subjects

| # | Test | Expected |
|---|------|----------|
| G4.01 | Subjects page loads | 15 subjects with codes, types |
| G4.02 | Create subject | Name, code, type (academic/supervision/duty/other), active |
| G4.03 | Edit subject (dialog pre-populated) | Name, code, type, active toggle |
| G4.04 | Toggle subject active/inactive | Status updates |
| G4.05 | Supervision type subjects don't appear in gradebook | Verify gradebook filters |
| G4.06 | Delete subject | Blocked if classes reference it |

### G5. Classes

| # | Test | Expected |
|---|------|----------|
| G5.01 | Classes list loads | 420 classes, paginated |
| G5.02 | Filter by year group | Correct subset |
| G5.03 | Filter by academic year | Correct subset |
| G5.04 | Filter by subject | Correct subset |
| G5.05 | Row click → class detail | Correct class detail page |
| G5.06 | Class detail — Overview tab | Academic year, year group, subject, status |
| G5.07 | Class detail — Students tab shows enrolled students | Names + status badges (not "No students") |
| G5.08 | Class detail — Staff tab shows assigned staff | Names + roles (not "No staff") |
| G5.09 | Create class (11 inputs) | Academic year, year group, subject, homeroom teacher dropdowns populated |
| G5.10 | Edit class | Form renders with current values (not blank) |
| G5.11 | Enrol student dialog | Student search, start date, enrol button |
| G5.12 | Bulk enrol students | Select multiple students, all enrolled |
| G5.13 | Assign staff dialog | Staff search, role selector (teacher/assistant/homeroom/substitute) |
| G5.14 | Remove student enrolment | Enrolment ended/dropped |
| G5.15 | Remove staff assignment | Staff unlinked from class |
| G5.16 | Inactivate class side-effect | Future schedule entries end-dated |
| G5.17 | Class enrolment status transitions | Active → Dropped, Active → Completed |

### G6. Promotion Wizard

| # | Test | Expected |
|---|------|----------|
| G6.01 | Promotion wizard page loads | Step 1: year selector |
| G6.02 | Step 1: Select academic year | Populates student list for review |
| G6.03 | Step 2: Review students by year group | Proposed next year group shown per student |
| G6.04 | Step 2: Override — hold back a student | Override saved |
| G6.05 | Step 2: Override — skip a year group | Override saved |
| G6.06 | Step 2: Override — graduate Y6 students | Graduation status set |
| G6.07 | Step 3-4: Preview summary | Promoted, held back, graduated, withdrawn counts |
| G6.08 | Step 5: Commit promotion | Year groups updated, old enrolments closed |
| G6.09 | Promotion audit log | Batch audit entry created |
| G6.10 | Promotion report generated | Shows all outcomes |
| G6.11 | Steps 2-5 render content (not blank) | Bug M16 must be fixed first |

---

## SECTION H: Scheduling

### H1. Rooms

| # | Test | Expected |
|---|------|----------|
| H1.01 | Rooms list loads | Paginated with type, capacity |
| H1.02 | Filter by room type | Classroom, Lab, Library, etc. |
| H1.03 | Create room dialog | Name, type (8 options), capacity, exclusive toggle |
| H1.04 | Submit creates room | Appears in list |
| H1.05 | Edit room | Update name, capacity, type |
| H1.06 | Delete room | Blocked if schedule entries reference it |

### H2. Manual Schedule Entries

| # | Test | Expected |
|---|------|----------|
| H2.01 | Schedule entry creation form | Class, room, teacher, weekday, time, date range |
| H2.02 | Create entry with no conflicts | Entry saved, appears in timetable |
| H2.03 | Create entry with room double-booking (exclusive) | Hard conflict — blocked |
| H2.04 | Create entry with teacher double-booking | Hard conflict — blocked |
| H2.05 | Create entry with student double-booking | Hard conflict — blocked |
| H2.06 | Room over-capacity (non-exclusive) | Soft warning shown, can proceed |
| H2.07 | Teacher workload threshold exceeded | Soft warning shown |
| H2.08 | Override hard conflict — SHOULD FAIL | Admin lacks `schedule.override_conflict` — 403 |
| H2.09 | Edit schedule entry | Update class, teacher, room, time |
| H2.10 | Delete schedule entry (no attendance sessions) | Hard delete |
| H2.11 | Delete schedule entry (with attendance sessions) | Soft delete via end-dating |

### H3. Timetable Views

| # | Test | Expected |
|---|------|----------|
| H3.01 | Weekly grid view | All entries for selected week |
| H3.02 | Teacher timetable view | Entries for selected teacher |
| H3.03 | Room timetable view | Entries for selected room |
| H3.04 | Student timetable view | Derived from active class enrolments |
| H3.05 | Navigate between weeks | Previous/next week |
| H3.06 | Timetable in Arabic locale | RTL layout, day names in Arabic |

### H4. School Closures

| # | Test | Expected |
|---|------|----------|
| H4.01 | Closures page loads | 8 closures with dates and reasons |
| H4.02 | Date column not blank | Dates render correctly |
| H4.03 | Create closure dialog | From/To dates, reason, scope, skip weekends |
| H4.04 | Bulk create closures (date range) | One closure per date |
| H4.05 | Scope options | School / Year Group / Class |
| H4.06 | Closure prevents attendance session generation | Verify no sessions on closure dates |
| H4.07 | Delete closure | Removes block on that date |
| H4.08 | Override closure for emergency session | Requires `attendance.override_closure` + mandatory reason |
| H4.09 | Open sessions auto-cancelled on closure creation | `open` sessions become cancelled |
| H4.10 | Submitted/locked sessions flagged on closure | Admin notified for resolution |

### H5. Period Grid Configuration

| # | Test | Expected |
|---|------|----------|
| H5.01 | Period grid page loads (not crash) | Visual grid editor renders |
| H5.02 | Define period structure per weekday | Rows = periods, columns = days |
| H5.03 | Add period to all days | Quick action works |
| H5.04 | Copy Monday to all weekdays | Quick action works |
| H5.05 | Configure period types | teaching, break_supervision, assembly, lunch_duty, free |
| H5.06 | Bilingual period names | English + Arabic names |
| H5.07 | No overlapping periods | DB exclusion constraint enforced |
| H5.08 | Save period grid | Persisted, survives reload |

### H6. Class Scheduling Requirements

| # | Test | Expected |
|---|------|----------|
| H6.01 | Requirements page loads | Table of classes with config status |
| H6.02 | Completeness indicator | "X of Y classes configured" |
| H6.03 | Configure class requirements | Periods/week, room type, preferred room, max/min consecutive |
| H6.04 | Spread preference options | spread_evenly, cluster, no_preference |
| H6.05 | Bulk edit support | Multiple classes configurable at once |
| H6.06 | "Configure remaining" button | Opens unconfigured classes |
| H6.07 | Save requirements | Persisted per class |

### H7. Teacher Preferences

| # | Test | Expected |
|---|------|----------|
| H7.01 | Teacher preferences page loads | Per-teacher editor |
| H7.02 | Subject Preferences tab | Multi-select subjects, priority (low/medium/high), mode (prefer/avoid) |
| H7.03 | Class Preferences tab | Multi-select classes, priority, mode |
| H7.04 | Time Preferences tab | Visual weekly grid, click to mark preferred/avoided |
| H7.05 | Admin can manage ANY teacher's preferences | `schedule.manage_preferences` allows all teachers |
| H7.06 | Save preferences | Persisted per teacher per academic year |

### H8. Teacher Availability — NEGATIVE TEST

| # | Test | Expected |
|---|------|----------|
| H8.01 | Teacher Availability page — access as admin | Page blocked/hidden OR loads as read-only |
| H8.02 | API: PUT /scheduling/availability | Returns 403 — admin lacks `schedule.configure_availability` |
| H8.03 | Sidebar/menu item hidden if no permission | Availability link not shown to admin |

### H9. Pinned Entries

| # | Test | Expected |
|---|------|----------|
| H9.01 | Pin an existing schedule entry | Pin icon appears, visual distinction |
| H9.02 | Unpin a pinned entry | Pin removed |
| H9.03 | Bulk pin multiple entries | All pinned |
| H9.04 | Pinned entries survive auto-scheduler apply | Not moved or deleted |

### H10. Auto-Scheduler

| # | Test | Expected |
|---|------|----------|
| H10.01 | Auto-scheduler page loads | Prerequisites checklist, year selector |
| H10.02 | Year selector — select academic year | Content renders (not blank — Bug M17 must be fixed) |
| H10.03 | Prerequisites checklist | Period grid, class requirements, teacher assignments, no pin conflicts |
| H10.04 | Solver button disabled until prerequisites met | Grey/disabled state |
| H10.05 | Prerequisites fix links navigate correctly | Each item links to configuration page |
| H10.06 | Generate Timetable — confirmation dialog | Entry counts, mode description |
| H10.07 | Solver runs via background job | Live progress counter visible |
| H10.08 | Cancel solver mid-run | Run cancelled, no schedule changes |
| H10.09 | Solver completes — proposed timetable shown | "PROPOSED — Not Yet Applied" banner |
| H10.10 | Proposed timetable — visual states | Pinned (solid), auto-generated (dashed) |
| H10.11 | Constraint report side panel | Hard violations, soft satisfaction %, per-teacher breakdown |
| H10.12 | Unassigned slots with blocking reasons | Listed in report |
| H10.13 | Teacher workload summary | Per-teacher period counts |
| H10.14 | Manual adjustment: drag-and-drop | Move class between slots, real-time validation |
| H10.15 | Manual adjustment: swap two entries | Swap slots successfully |
| H10.16 | Manual adjustment: remove entry | Auto-generated entry removed |
| H10.17 | Manual adjustment: add entry | Manually place class in empty slot |
| H10.18 | Adjustments persisted server-side (crash-safe) | PATCH saves incrementally |
| H10.19 | Constraint report updates live | Reflects adjustments in real-time |

### H11. Apply or Discard Proposed Timetable

| # | Test | Expected |
|---|------|----------|
| H11.01 | Apply timetable — approval check | If `requireApprovalForNonPrincipal = true`: routes to approval workflow |
| H11.02 | Apply timetable — approval NOT required | Schedule entries created from proposed timetable |
| H11.03 | Old auto-generated entries replaced | Without attendance: hard-deleted; with attendance: end-dated |
| H11.04 | Pinned entries preserved | Not touched by apply |
| H11.05 | Period grid drift guard | Blocked if grid changed since run |
| H11.06 | Class status guard | Inactive classes excluded with warning |
| H11.07 | Concurrency guard | Only one apply proceeds at a time |
| H11.08 | Discard timetable | Status → discarded, no schedule changes |
| H11.09 | Run history shows discarded run | Listed in run history |
| H11.10 | Apply generates audit log | Run ID recorded |

### H12. Scheduling Dashboard

| # | Test | Expected |
|---|------|----------|
| H12.01 | Dashboard loads without API errors | All KPIs render |
| H12.02 | Assignment Overview | Total slots, pinned, auto, unassigned, completion % |
| H12.03 | Staleness indicator | Shows if config changed since last applied run |
| H12.04 | Teacher Workload View | Teacher, total periods, teaching, supervision, utilisation % |
| H12.05 | Workload colour coding | Green/amber/red based on utilisation |
| H12.06 | Unassigned Classes View | Class, subject, periods needed, assigned, remaining, reason |
| H12.07 | Preference Satisfaction Report | Per-teacher breakdown with scores |
| H12.08 | Run History | All runs for academic year, date, mode, status, score |
| H12.09 | Run History — no large JSONB in listing | Performance acceptable |

---

## SECTION I: Attendance

### I1. Attendance Overview

| # | Test | Expected |
|---|------|----------|
| I1.01 | Attendance page loads (not crash) | Bug C01 must be fixed first |
| I1.02 | Admin sees ALL classes attendance | `attendance.view_all` permission active |
| I1.03 | Class filter | Select specific class |
| I1.04 | Date picker | Navigate to specific date |
| I1.05 | Session list for selected date/class | Shows sessions with status |

### I2. Attendance Session Management

| # | Test | Expected |
|---|------|----------|
| I2.01 | View session details | Student list with attendance status per student |
| I2.02 | Session generation on-demand | Opening marking screen creates session |
| I2.03 | Nightly batch generation | Sessions created for applicable schedules |
| I2.04 | Session not generated on closure date | Respects closures |
| I2.05 | Race prevention | Two concurrent opens don't create duplicate sessions |
| I2.06 | Mark all present then adjust | Bulk mark + individual exceptions |
| I2.07 | Submit session | Status: open → submitted |
| I2.08 | Lock submitted session | `attendance.lock_sessions` — status: submitted → locked |

### I3. Historical Amendments

| # | Test | Expected |
|---|------|----------|
| I3.01 | Amend past attendance record | Requires `attendance.amend_historical` permission |
| I3.02 | Mandatory amendment reason | Cannot amend without reason |
| I3.03 | Original status preserved | `amended_from_status` field populated |
| I3.04 | Amendment audit trail | Complete trail visible |

### I4. Override Closure

| # | Test | Expected |
|---|------|----------|
| I4.01 | Create session on closure date | Requires `attendance.override_closure` + mandatory reason |
| I4.02 | Override reason recorded | Audit-logged |

### I5. Exception Dashboard

| # | Test | Expected |
|---|------|----------|
| I5.01 | Exception dashboard loads | Pending sessions, excessive absences |
| I5.02 | Pending sessions identified | Unsubmitted sessions listed |
| I5.03 | Excessive absences flagged | Students with threshold-exceeding absences |
| I5.04 | Drill down into exceptions | Navigate to session/student detail |

---

## SECTION J: Gradebook & Report Cards

### J1. Grading Scales

| # | Test | Expected |
|---|------|----------|
| J1.01 | Grading scales page loads | Existing scales listed |
| J1.02 | Create grading scale | Numeric ranges, letter grades, custom |
| J1.03 | Scale immutability | Cannot modify scale with assessments graded against it |
| J1.04 | Create new scale for changes | Must create new scale |

### J2. Assessment Categories

| # | Test | Expected |
|---|------|----------|
| J2.01 | Assessment categories page loads | Shows categories (not "No results found" — Bug M07) |
| J2.02 | Create category with default weight | Name, weight saved |
| J2.03 | Per-class-subject weight override | Configure overrides per class |
| J2.04 | Weights normalization warning | Shown when sum != 100% |

### J3. Assessments

| # | Test | Expected |
|---|------|----------|
| J3.01 | Gradebook page loads with class cards | Classes visible (not "No classes configured" — Bug C04) |
| J3.02 | Create assessment | Title, category, scale, max score, date |
| J3.03 | Enter grades for students | Per-student grade entry |
| J3.04 | Close assessment | No further grade entry allowed |
| J3.05 | Missing grade handling | Excluded or zero per tenant setting |

### J4. Period Grades

| # | Test | Expected |
|---|------|----------|
| J4.01 | Compute period grades | Weighted average per student per subject |
| J4.02 | Grading scale applied | Display value derived from scale |
| J4.03 | Period grade snapshot created | Frozen computation result |
| J4.04 | Grade override — NEGATIVE TEST | Admin WITHOUT `gradebook.override_final_grade` blocked |
| J4.05 | API: PUT /gradebook/period-grades/:id/override | Returns 403 for admin without permission |

### J5. Report Cards

| # | Test | Expected |
|---|------|----------|
| J5.01 | Report cards page loads | Existing cards listed |
| J5.02 | Generate report card | From period grade snapshots + attendance + comments |
| J5.03 | Report card status: draft | Editable |
| J5.04 | Publish report card | Status → published, immutable |
| J5.05 | Published card immutability | Cannot edit published card |
| J5.06 | Revision workflow | Create new card with `revision_of_report_card_id` |
| J5.07 | Original marked as revised | Old card shows revised status |
| J5.08 | Locale selection | Renders in selected locale (en/ar) |
| J5.09 | PDF rendering | Puppeteer generates readable PDF |
| J5.10 | Both locale PDFs | English and Arabic templates render correctly |

### J6. Transcripts

| # | Test | Expected |
|---|------|----------|
| J6.01 | Generate academic transcript | Compiled from published report cards only |
| J6.02 | Complete academic history | All academic years included |
| J6.03 | Transcript in both locales | English and Arabic render correctly |

### J7. Exam Results Import

| # | Test | Expected |
|---|------|----------|
| J7.01 | CSV upload for exam results | File accepted |
| J7.02 | System matches students and assessments | Matching logic correct |
| J7.03 | Admin reviews matches before processing | Preview screen |
| J7.04 | Unmatched rows flagged | Validation errors listed |
| J7.05 | Process import | Grades created from CSV |

---

## SECTION K: Finance

### K1. Fee Structures

| # | Test | Expected |
|---|------|----------|
| K1.01 | Fee structures page loads | Structures listed with readable labels (not i18n keys — Bug H01) |
| K1.02 | Create fee structure | Amount, billing frequency (one_off/term/monthly/custom), year group link |
| K1.03 | Edit fee structure | Update amount, frequency |
| K1.04 | Toggle active/inactive | Status updates |
| K1.05 | Fee structure detail | Navigates with readable labels |

### K2. Discounts

| # | Test | Expected |
|---|------|----------|
| K2.01 | Discounts page loads | Listed with type and values |
| K2.02 | Create discount — fixed amount | Saves correctly |
| K2.03 | Create discount — percentage | Saves correctly |
| K2.04 | Toggle active/inactive | Status updates |

### K3. Fee Assignments

| # | Test | Expected |
|---|------|----------|
| K3.01 | Fee assignments page loads | Assignments listed |
| K3.02 | Assign fee to household | Household selector, fee selector |
| K3.03 | Assign fee per student (optional) | Student-level assignment |
| K3.04 | Attach discount (one per assignment) | Discount dropdown |
| K3.05 | Set effective dates | From/to dates saved |
| K3.06 | Edit assignment | Update fee, discount, dates |

### K4. Fee Generation Wizard

| # | Test | Expected |
|---|------|----------|
| K4.01 | Fee generation wizard loads (3 steps) | Structure visible, labels readable |
| K4.02 | Step 1: Select period + year groups + fee structures | Checkboxes functional |
| K4.03 | Step 2: Preview households x fee lines | Discounts applied correctly |
| K4.04 | Step 2: Exclude specific households | Checkbox to exclude |
| K4.05 | Step 2: Blocked for households without billing parent | Error/warning shown |
| K4.06 | Step 3: Confirm generation | Draft invoices created in batch |
| K4.07 | Duplicate prevention | Re-running same params blocked |
| K4.08 | Fee generation report | Invoices created, amounts, households affected |

### K5. Invoices

| # | Test | Expected |
|---|------|----------|
| K5.01 | Invoice list loads | Paginated with correct total |
| K5.02 | Status tabs | Draft, Pending, Issued, Overdue, Paid, Partial, All |
| K5.03 | Filter by paid tab | 600 invoices (80% of 750) |
| K5.04 | Filter by overdue tab | 37 invoices |
| K5.05 | Filter by partial tab | 75 invoices |
| K5.06 | Row click → invoice detail | Correct invoice renders |
| K5.07 | Invoice detail — header | Invoice #, status badge, household name |
| K5.08 | Invoice detail — amounts (no NaN) | Subtotal, total, discount, tax, paid, balance all numeric |
| K5.09 | Invoice detail — line items | Fee description, quantity, amount |
| K5.10 | Invoice detail — Print PDF button | Generates downloadable PDF |
| K5.11 | Invoice detail — Payments tab | Shows linked payments |
| K5.12 | Invoice detail — Installments tab | Shows installment breakdown |
| K5.13 | Issue invoice (no approval required) | Status: draft → issued, issue date set |
| K5.14 | Issue invoice (approval required) | Status: draft → pending_approval, routed to approver |
| K5.15 | Void invoice (balance = total, no payments) | Status → void |
| K5.16 | Void invoice (with payments applied) | Blocked — cannot void |
| K5.17 | Cancel invoice (from draft) | Status → cancelled |
| K5.18 | Cancel invoice (from issued) | Blocked — cannot cancel issued |
| K5.19 | Write off invoice | Records write_off_amount + reason, status → written_off, balance zeroed |
| K5.20 | Invoice status auto-derivation | Correct status based on balance, due date, payments |
| K5.21 | Cross-navigation: Invoice → Household | Link navigates correctly |

### K6. Installment Plans

| # | Test | Expected |
|---|------|----------|
| K6.01 | Create installments on invoice | Due dates and amounts per installment |
| K6.02 | SUM(installments) = total_amount | Validation enforced |
| K6.03 | Track installment status | Pending, paid, overdue |
| K6.04 | Edit installments | Update due dates, amounts |

### K7. Payments

| # | Test | Expected |
|---|------|----------|
| K7.01 | Payment list loads | Paginated with reference, amount, method, status |
| K7.02 | Record Payment form | Household search, method (Cash/Bank/Card), reference, amount, date, reason |
| K7.03 | Record cash payment | Creates payment record |
| K7.04 | Record bank transfer payment | Creates with reference |
| K7.05 | Stripe payment flow | If Stripe configured: checkout creation |
| K7.06 | Payment detail — amounts (no NaN) | Amount, allocated, unallocated all numeric |
| K7.07 | Payment detail — Receipt PDF button | Generates downloadable PDF |
| K7.08 | Payment detail — Allocations tab | Shows allocation breakdown |
| K7.09 | Payment detail — Refunds tab | Shows linked refunds |
| K7.10 | Cross-navigation: Payment → Household | Link navigates correctly |

### K8. Payment Allocation

| # | Test | Expected |
|---|------|----------|
| K8.01 | Auto-suggest FIFO allocation | Oldest unpaid invoices first |
| K8.02 | Admin reviews and adjusts allocations | Manual override of auto-suggestion |
| K8.03 | Confirm allocations | Invoice statuses/balances updated |
| K8.04 | SUM(allocations) <= payment amount | Validation enforced |
| K8.05 | Per-invoice allocation <= remaining balance | Validation enforced |
| K8.06 | Cross-period allocations allowed | Not blocked across periods |
| K8.07 | Unallocated remainder flagged | Admin notification for leftover |

### K9. Refunds

| # | Test | Expected |
|---|------|----------|
| K9.01 | Refunds list loads | Refund ref, amount, status, reason, related payment |
| K9.02 | Relation columns populated (not blank) | Payment ref, household, requested by visible |
| K9.03 | Create refund request | Linked to payment, amount <= unrefunded portion |
| K9.04 | Amount exceeds unrefunded portion | Blocked with error |
| K9.05 | Approval-gated refund (if configured) | Routes to approver |
| K9.06 | Execute refund (after approval) | Stripe or manual processing |
| K9.07 | Execute refund API — no error | Bug M18 must be fixed first |
| K9.08 | LIFO allocation reversal | Most recent allocations reversed first |
| K9.09 | Refund guard — void invoice | Blocked |
| K9.10 | Refund guard — written-off invoice | Blocked |
| K9.11 | Override refund guard — NEGATIVE TEST | Admin lacks `finance.override_refund_guard` — blocked |

### K10. Receipts

| # | Test | Expected |
|---|------|----------|
| K10.01 | Receipt auto-generated on payment | Immutable receipt number |
| K10.02 | Receipt PDF download | Generates correctly |
| K10.03 | Receipt number format | {prefix}-{YYYYMM}-{padded_sequence} |
| K10.04 | Receipt in Arabic locale | Arabic template renders correctly |

### K11. Household Statements

| # | Test | Expected |
|---|------|----------|
| K11.01 | Statements page loads | Household list with View Statement links |
| K11.02 | Statement detail | Invoices, payments, allocations, refunds |
| K11.03 | Running balance calculation | Correct running total |
| K11.04 | Print PDF button | Generates downloadable PDF |
| K11.05 | Statement in Arabic locale | Arabic template correct |

### K12. Finance Dashboard

| # | Test | Expected |
|---|------|----------|
| K12.01 | Dashboard loads | Stats, pipeline, revenue render |
| K12.02 | Invoice pipeline visual | Draft → Issued → Overdue → Paid counts |
| K12.03 | Recent payments list | Latest payments with methods |
| K12.04 | Pending refund approvals | Refunds awaiting decision |
| K12.05 | Revenue summary | Total invoiced, paid, outstanding, overdue |
| K12.06 | Overdue amount | Correct AED figure |

---

## SECTION L: Payroll — NEGATIVE TESTS (Admin Must Be Blocked)

The entire payroll module is `school_owner`-exclusive. Admin must NOT have access.

| # | Test | Expected |
|---|------|----------|
| L1.01 | Payroll sidebar menu item | Hidden for admin role |
| L1.02 | Direct URL: /payroll | 403 or redirect to dashboard |
| L1.03 | Direct URL: /payroll/runs | 403 |
| L1.04 | Direct URL: /payroll/runs/new | 403 |
| L1.05 | Direct URL: /payroll/runs/:id | 403 |
| L1.06 | Direct URL: /payroll/compensation | 403 |
| L1.07 | Direct URL: /payroll/reports | 403 |
| L1.08 | API: GET /api/v1/payroll/runs | 403 |
| L1.09 | API: POST /api/v1/payroll/runs | 403 |
| L1.10 | API: GET /api/v1/payroll/compensation | 403 |
| L1.11 | API: POST /api/v1/payroll/runs/:id/finalise | 403 |
| L1.12 | API: GET /api/v1/payroll/payslips | 403 |
| L1.13 | API: GET /api/v1/staff/:id/bank-details | 403 (unless admin has explicit permission) |
| L1.14 | Payroll dashboard widget on main dashboard | Not visible to admin |
| L1.15 | Payroll reports in Reports Hub | Not shown for admin |

---

## SECTION M: Admissions

### M1. Form Builder

| # | Test | Expected |
|---|------|----------|
| M1.01 | Admission forms list | Shows forms with status (Published/Draft) |
| M1.02 | Form editor loads with fields | Fields visible (not "No fields" — Bug C09) |
| M1.03 | Add field | Type selector (short_text, long_text, number, date, boolean, etc.) |
| M1.04 | Configure field properties | Label, help text, required, visibility, searchable, reportable |
| M1.05 | Conditional visibility | Show field X when field Y = value Z |
| M1.06 | DOB not required warning | Platform warning shown |
| M1.07 | Publish form | Creates new version if editing published |
| M1.08 | Version history | Old version archived, existing apps preserved |

### M2. Application Review

| # | Test | Expected |
|---|------|----------|
| M2.01 | Applications list loads | Table with Application #, student name, status, date |
| M2.02 | Student Name column populated (not blank) | Bug H05 must be fixed |
| M2.03 | Form Name column populated (not blank) | Visible |
| M2.04 | Status tabs | All: Submitted, Under Review, Pending Acceptance, Accepted, Enrolled, Rejected, Withdrawn |
| M2.05 | Row click → application detail | Detail page renders (not blank — Bug H06) |
| M2.06 | Application detail — submitted answers | All form responses visible |
| M2.07 | Change status: Submitted → Under Review | Status updates |
| M2.08 | Change status: Under Review → Accepted | Direct or via approval |
| M2.09 | Acceptance with approval gating | If configured: routed to approver |
| M2.10 | Change status: → Rejected | Recorded with optional reason |
| M2.11 | Add internal note (not visible to parents) | Note saved with author + timestamp |
| M2.12 | Duplicate detection flag | Matching name+DOB flagged |

### M3. Application-to-Student Conversion

| # | Test | Expected |
|---|------|----------|
| M3.01 | Conversion screen opens from accepted application | Pre-populated fields |
| M3.02 | Required fields validation | First name, last name, DOB, year group, parent1 first/last |
| M3.03 | Recommended fields warning | Parent emails show warning if missing |
| M3.04 | Parent matching by email | Existing parent linked, not duplicated |
| M3.05 | New household creation | With `needs_completion = true` |
| M3.06 | Student created (status: active) | Entry date: today |
| M3.07 | Parent linked to household | student_parents + household_parents junctions created |
| M3.08 | Emergency contacts flagged as needed | Household shows completion warning |
| M3.09 | Meilisearch index updated | Global search finds new student |
| M3.10 | Audit log entry | All created entity IDs recorded |
| M3.11 | Application status → enrolled | After successful conversion |

### M4. Admissions Analytics

| # | Test | Expected |
|---|------|----------|
| M4.01 | Analytics page loads | Stats render (not contradictory — Bug M14) |
| M4.02 | Total Applications count | Matches actual count |
| M4.03 | Conversion Rate | Correct percentage |
| M4.04 | Average Processing Days | Correct calculation |
| M4.05 | Funnel visualization | Application counts by status |
| M4.06 | No "No applications yet" with existing data | Bug M14 must be fixed |

---

## SECTION N: Communications

### N1. Announcements

| # | Test | Expected |
|---|------|----------|
| N1.01 | Announcements list loads | Titles, scopes, statuses visible |
| N1.02 | Status tabs | All, Draft, Scheduled, Published, Archived |
| N1.03 | New Announcement button | Present |
| N1.04 | Create announcement form | Title, rich text body (TipTap), scope, targets |
| N1.05 | Scope options (not raw i18n key) | "School-wide", "Year Group", "Class", "Household", "Custom" |
| N1.06 | Save as draft | Draft status, editable |
| N1.07 | Schedule for future publish | `scheduled_publish_at` set |
| N1.08 | Publish immediately (no approval) | Audience resolved, notifications dispatched |
| N1.09 | Publish with approval gating | If configured: routes to approver, self-approval blocked |
| N1.10 | Announcement detail loads (not blank) | Bug C07 must be fixed |
| N1.11 | Edit draft announcement | Modify title, body, scope |
| N1.12 | Archive published announcement | Status → archived |
| N1.13 | Audience resolution | Scope → students → parents → users correctly resolved |
| N1.14 | Notification batch dispatch | BullMQ dispatches in batches of 100 |

### N2. Notification Delivery

| # | Test | Expected |
|---|------|----------|
| N2.01 | Notification delivery audit page | Delivery statuses: queued, sent, delivered, read, failed |
| N2.02 | Failed notifications surfaced | Listed with failure reasons |
| N2.03 | Delivery rates by channel | Email/WhatsApp/in-app breakdown |
| N2.04 | WhatsApp-to-email fallback | Failed WhatsApp → email sent if available |
| N2.05 | Communication preferences respected | Per-user channel preferences applied |

### N3. Parent Inquiries

| # | Test | Expected |
|---|------|----------|
| N3.01 | Inquiries list loads | Subject, status, parent, student columns populated |
| N3.02 | Parent and Student columns not blank | Bug M04 must be fixed |
| N3.03 | Row click → inquiry detail (not blank) | Bug C08 must be fixed |
| N3.04 | View inquiry message thread | Parent messages + admin replies |
| N3.05 | Reply to inquiry | Author stored as admin, shown as "School Administration" to parent |
| N3.06 | Auto-transition: open → in_progress | On first admin reply |
| N3.07 | Close inquiry | Status → closed, no further messages |
| N3.08 | Closed inquiry is read-only | Cannot add messages |
| N3.09 | In-app notification to parent on reply | Respecting communication preferences |
| N3.10 | Stale inquiries on dashboard | Flagged after `inquiryStaleHours` threshold |

---

## SECTION O: Website CMS

### O1. Page Management

| # | Test | Expected |
|---|------|----------|
| O1.01 | Website pages list loads | Shows pages with status (Published/Draft) |
| O1.02 | Create page | Title, slug, type (home/about/admissions/contact/custom), body |
| O1.03 | Rich text editor (TipTap) | Functional with BiDi support |
| O1.04 | SEO fields | Meta title, description with character counter |
| O1.05 | Save as draft | Draft status |
| O1.06 | Publish page | Status → published |
| O1.07 | Unpublish page | Status → unpublished |
| O1.08 | Homepage enforcement | Publishing new homepage unpublishes old one |
| O1.09 | Edit existing page | Pre-populated editor with all fields |
| O1.10 | Navigation settings | show_in_nav toggle, nav_order number |
| O1.11 | Preview page | Preview rendering |
| O1.12 | HTML sanitization | DOMPurify strips malicious content |

### O2. Contact Form Submissions

| # | Test | Expected |
|---|------|----------|
| O2.01 | Contact submissions page loads | Submissions listed |
| O2.02 | Date column not "Invalid Date" | Bug M12 must be fixed |
| O2.03 | Status not raw enum | "New" not "new_submission" |
| O2.04 | Status tabs | New, Reviewed, Closed, Spam |
| O2.05 | Change submission status | new → reviewed → closed / spam |
| O2.06 | View submission details | Name, email, message content |
| O2.07 | Rate limiting verified | >5 submissions per IP per hour blocked |

---

## SECTION P: Settings & Configuration

### P1. Branding

| # | Test | Expected |
|---|------|----------|
| P1.01 | Branding page loads | Color pickers, file upload, save button |
| P1.02 | Upload logo (PNG/JPG/WebP/SVG, <2MB) | Logo saved and displayed |
| P1.03 | Upload oversized logo (>2MB) | Rejected with error |
| P1.04 | Set primary/secondary colors | CSS custom properties updated |
| P1.05 | Set school name (English + Arabic) | Saved, reflected in UI |
| P1.06 | Set email sender names (en + ar) | Saved |
| P1.07 | Set support contact | Email, phone saved |
| P1.08 | Set receipt/invoice/payslip prefix | Prefixes saved |
| P1.09 | Save button works | Settings persist |

### P2. General Settings

| # | Test | Expected |
|---|------|----------|
| P2.01 | General settings page loads | 13+ toggles visible |
| P2.02 | Parent portal enabled toggle | Saves |
| P2.03 | Attendance visible to parents toggle | Saves |
| P2.04 | Grades visible to parents toggle | Saves |
| P2.05 | Inquiry stale hours threshold | Saves numeric value |
| P2.06 | Approval gating: invoices | Enable/disable |
| P2.07 | Approval gating: announcements | Enable/disable |
| P2.08 | Approval gating: admissions acceptance | Enable/disable |
| P2.09 | Approval gating: scheduling | Enable/disable |
| P2.10 | Default payment terms (days) | Saves |
| P2.11 | Partial payment allowance | Saves |
| P2.12 | Teacher max periods per week | Saves |
| P2.13 | Auto-scheduler enabled toggle | Saves |
| P2.14 | Solver timeout (seconds) | Saves |
| P2.15 | Solver preference weights | Saves |
| P2.16 | Save all settings | Persists, survives reload |

### P3. Notification Settings

| # | Test | Expected |
|---|------|----------|
| P3.01 | Notifications settings page loads | 12+ notification types listed |
| P3.02 | Toggle Email channel per type | Saves |
| P3.03 | Toggle WhatsApp channel per type | Saves |
| P3.04 | Toggle In-App channel per type | Saves |
| P3.05 | Disable entire notification type | No notifications sent for type |
| P3.06 | Save settings | Persists |

### P4. Module Configuration

| # | Test | Expected |
|---|------|----------|
| P4.01 | Module toggles page (if exists) | List of modules with enable/disable |
| P4.02 | Disable a module (e.g., admissions) | Module hidden from sidebar, endpoints blocked |
| P4.03 | Re-enable module | Data preserved, module visible again |
| P4.04 | Disabled module API endpoints | Return appropriate error |

### P5. Stripe Configuration — NEGATIVE TEST

| # | Test | Expected |
|---|------|----------|
| P5.01 | Stripe settings page — access as admin | Hidden or read-only for admin |
| P5.02 | API: PUT /api/v1/stripe-config | 403 — admin lacks `tenant.manage_stripe` |
| P5.03 | Sidebar/settings menu hides Stripe for admin | Item not shown or disabled |

### P6. Custom Domain — NEGATIVE TEST

| # | Test | Expected |
|---|------|----------|
| P6.01 | Domain configuration — access as admin | Hidden or blocked |
| P6.02 | API: POST /api/v1/domains | 403 — admin lacks `tenant.manage_domains` |

---

## SECTION Q: Users & Roles

### Q1. User Management

| # | Test | Expected |
|---|------|----------|
| Q1.01 | Users page loads | Paginated list with name, email, role, status |
| Q1.02 | User count matches | Correct total |
| Q1.03 | Search users | By name or email |
| Q1.04 | Invite Staff button | Opens invite dialog |
| Q1.05 | Invite staff: enter email + role | Creates invitation |
| Q1.06 | Invite existing user (by email) | Notification to log in, no new account |
| Q1.07 | Invite new user | Registration link sent |
| Q1.08 | Invite Parent button | Opens parent invite dialog |
| Q1.09 | Invite parent with email | Creates invitation |
| Q1.10 | Suspend user (via Suspend button) | Confirmation dialog, user cannot log in |
| Q1.11 | Reactivate suspended user | User can log in again |
| Q1.12 | Assign multiple roles to one user | Union of permissions applied |
| Q1.13 | Revoke role from user | Permission removed |
| Q1.14 | Invitations list/tab | Shows sent invitations with status |

### Q2. Custom Roles

| # | Test | Expected |
|---|------|----------|
| Q2.01 | Roles page loads | System roles listed (locked) |
| Q2.02 | System roles not editable | school_owner, school_admin, etc. locked |
| Q2.03 | Create custom role | Role key, display name, tier selector |
| Q2.04 | Tier restriction | Admin-tier custom roles cannot include platform permissions |
| Q2.05 | Permission selection | Checkbox grid of available permissions |
| Q2.06 | Assign custom role to user | Via user management |
| Q2.07 | Verify custom role permissions work | User gains assigned permissions |
| Q2.08 | Edit custom role | Update permissions |
| Q2.09 | Delete custom role | Only if no users assigned |

---

## SECTION R: Approvals

### R1. Approval Workflows

| # | Test | Expected |
|---|------|----------|
| R1.01 | Approvals page loads | Pending approvals listed or "No approval requests" |
| R1.02 | Pending approval count on dashboard | Matches actual count |
| R1.03 | View approval request detail | Action type, requester, entity, status |
| R1.04 | Approve a request | Status → approved, action executes (or awaits manual) |
| R1.05 | Reject a request | Status → rejected, entity reverted |
| R1.06 | Self-approval prevention | Cannot approve own request |
| R1.07 | Expired approvals | After `expiryDays`, status → expired |
| R1.08 | Reminder notification | Sent after `reminderAfterHours` if still pending |
| R1.09 | Cancel pending request (as requester) | Status → cancelled |
| R1.10 | Approved-but-unexecuted flagged | If manual mode, flagged after 48h |

### R2. Approval Integration Points

| # | Test | Expected |
|---|------|----------|
| R2.01 | Invoice issuance approval | Routes correctly if configured |
| R2.02 | Announcement publish approval | Routes correctly if configured |
| R2.03 | Admissions acceptance approval | Routes correctly if configured |
| R2.04 | Refund execution approval | Routes correctly if configured |
| R2.05 | Schedule apply approval (non-owner) | Routes to school_owner if configured |

---

## SECTION S: Compliance & Audit

### S1. Audit Log

| # | Test | Expected |
|---|------|----------|
| S1.01 | Audit log page loads | Entries listed with timestamps, actions |
| S1.02 | Filter by entity type | Correct subset |
| S1.03 | Filter by actor | Correct subset |
| S1.04 | Filter by date range | Correct subset |
| S1.05 | Pagination | Large audit log navigable |
| S1.06 | Audit entries append-only | Cannot delete or edit entries |
| S1.07 | Tenant-scoped audit | Only current tenant's log visible |

### S2. Compliance Requests

| # | Test | Expected |
|---|------|----------|
| S2.01 | Compliance page loads | Status tabs (New/In Progress/Complete/etc.) |
| S2.02 | New Request button | Opens dialog |
| S2.03 | Submit access export request | Request type, subject type, subject ID |
| S2.04 | Submit erasure request | Request created |
| S2.05 | Process compliance request — NEGATIVE TEST | Admin lacks `compliance.process_request` — blocked |
| S2.06 | API: POST /api/v1/compliance/:id/process | 403 for admin |
| S2.07 | View request status | Status updates visible |

---

## SECTION T: Imports

### T1. Bulk Import

| # | Test | Expected |
|---|------|----------|
| T1.01 | Imports page loads | File upload, type selector, drag-and-drop |
| T1.02 | Import type options | Students, parents, staff, fees, exam_results, staff_compensation |
| T1.03 | CSV-only restriction | Non-CSV files rejected |
| T1.04 | Upload CSV | File accepted, validation begins |
| T1.05 | Validation preview | Row-level errors flagged, matches shown |
| T1.06 | Duplicate detection | Warnings for potential duplicates |
| T1.07 | Admin review before processing | Preview screen with approve/reject |
| T1.08 | Process import | Records created from CSV |
| T1.09 | Import history table | Previous imports listed with status |
| T1.10 | Error report download | Downloadable error details |

---

## SECTION U: Search

### U1. Global Search

| # | Test | Expected |
|---|------|----------|
| U1.01 | Search bar accessible from any page | Visible in header |
| U1.02 | Command palette (Cmd+K / Ctrl+K) | Dialog opens |
| U1.03 | Search students by name | Results returned (not 0 — Bug M11) |
| U1.04 | Search staff by name | Results returned |
| U1.05 | Search parents by name | Results returned |
| U1.06 | Search households by name | Results returned |
| U1.07 | Search invoices by number | Results returned |
| U1.08 | Search applications by ID | Results returned |
| U1.09 | Fuzzy matching | "Omr" finds "Omar" |
| U1.10 | Tenant-scoped results | Only current tenant's data |
| U1.11 | Permission-filtered results | Admin doesn't see payroll results |
| U1.12 | Click result navigates to entity | Correct detail page opens |
| U1.13 | Meilisearch fallback | If Meilisearch down, PostgreSQL search works |

---

## SECTION V: Reports & Analytics

### V1. Report Hub

| # | Test | Expected |
|---|------|----------|
| V1.01 | Reports hub page loads | All report cards by domain |
| V1.02 | Report categories | Academic, Finance, Operations, Data |
| V1.03 | Payroll reports — HIDDEN for admin | Not shown in hub |

### V2. Individual Reports

| # | Test | Expected |
|---|------|----------|
| V2.01 | Student Promotion/Rollover Report | Promoted, held back, graduated, withdrawn (not blank — Bug H11) |
| V2.02 | Teacher Workload Report | Teaching hours per staff per week |
| V2.03 | Fee Generation Report | Invoices created, amounts, households affected |
| V2.04 | Write-Off/Scholarship Report | Date range picker, write-offs by period/amount/reason |
| V2.05 | Student Export | Search-based export interface |
| V2.06 | Notification Delivery Report | Date range + channel filter, delivery rates |
| V2.07 | Household Ledger/Statement Report | Complete financial history per household |
| V2.08 | Admissions Funnel Analytics | Application counts by status, conversion rates |
| V2.09 | Attendance Exception Report | Students with excessive absences, pending sessions |
| V2.10 | Allergy Report | Students flagged, filterable by class/year group, exportable |
| V2.11 | Academic Transcripts | Complete academic history per student |

---

## SECTION W: Global UI & Navigation

### W1. Sidebar & Navigation

| # | Test | Expected |
|---|------|----------|
| W1.01 | Sidebar shows all admin-accessible sections | Overview, People, Academics, Scheduling, Operations, Reports, School |
| W1.02 | Payroll section — hidden for admin | Not visible in sidebar |
| W1.03 | Sidebar collapse/expand | Toggles correctly |
| W1.04 | Collapsed sidebar icon navigation | Icons still navigate |
| W1.05 | Active page highlighted | Current page indicated in sidebar |
| W1.06 | All sub-menu items accessible | Every route navigable via sidebar |

### W2. Header & User Menu

| # | Test | Expected |
|---|------|----------|
| W2.01 | User menu button | Shows admin name and role |
| W2.02 | User menu options | Profile, Communication preferences, Locale toggle, Theme, Log out |
| W2.03 | Notification panel | Opens on bell icon click |
| W2.04 | Notification count badge | Shows unread count |
| W2.05 | Read notification | Marked as read, count decreases |

### W3. Error Handling

| # | Test | Expected |
|---|------|----------|
| W3.01 | 404 page for non-existent entity | Clean error message |
| W3.02 | API error during page load | Graceful error state (not crash) |
| W3.03 | Network offline indicator | If PWA cached, shows offline state |
| W3.04 | Browser back button | Correct previous page |
| W3.05 | Browser forward button | Correct next page |

### W4. Keyboard Shortcuts

| # | Test | Expected |
|---|------|----------|
| W4.01 | Cmd+K / Ctrl+K | Opens command palette |
| W4.02 | Escape | Closes dialogs/modals |
| W4.03 | Alt+T for notifications | Bug L07 — verify after fix |

---

## SECTION X: i18n & RTL

### X1. Arabic Locale

| # | Test | Expected |
|---|------|----------|
| X1.01 | Switch to Arabic locale | `dir="rtl"`, `lang="ar"` on html |
| X1.02 | Dashboard in Arabic | All widget labels translated |
| X1.03 | Greeting in Arabic | Not English "Good morning" |
| X1.04 | Navigation labels in Arabic | All sidebar items translated |
| X1.05 | Table headers in Arabic | All column headers translated |
| X1.06 | Form labels in Arabic | All input labels translated |
| X1.07 | Button text in Arabic | All buttons translated |
| X1.08 | Status badges in Arabic | Not raw English values |
| X1.09 | Error messages in Arabic | Validation errors translated |
| X1.10 | Finance module labels (not i18n keys) | Bug H01-H04 must be fixed |
| X1.11 | Announcement scope labels | Not raw i18n keys (Bug L06) |

### X2. RTL Layout

| # | Test | Expected |
|---|------|----------|
| X2.01 | Sidebar on right side | RTL sidebar position |
| X2.02 | Text alignment: start (not left) | `text-start` used |
| X2.03 | Margins/padding logical | `ms-`/`me-`/`ps-`/`pe-` used |
| X2.04 | Icons/arrows mirrored | Chevrons point correct direction |
| X2.05 | Tables read right-to-left | Column order appropriate |
| X2.06 | Forms layout RTL | Labels and inputs aligned correctly |
| X2.07 | Modals/dialogs RTL | Close button, content aligned RTL |

### X3. LTR Enforcement

| # | Test | Expected |
|---|------|----------|
| X3.01 | Email addresses always LTR | Even in Arabic locale |
| X3.02 | URLs always LTR | Even in Arabic locale |
| X3.03 | Phone numbers always LTR | Even in Arabic locale |
| X3.04 | Numeric inputs always LTR | Even in Arabic locale |
| X3.05 | Enrolment IDs always LTR | Even in Arabic locale |
| X3.06 | Western numerals (0-9) | In both locales |
| X3.07 | Gregorian calendar | In both locales |

---

## SECTION Y: Responsive Design

### Y1. Mobile (375px)

| # | Test | Expected |
|---|------|----------|
| Y1.01 | Sidebar hidden on mobile | Correct collapse |
| Y1.02 | Hamburger/menu button present | Bug H13 — verify after fix |
| Y1.03 | Navigation accessible via hamburger | All routes reachable |
| Y1.04 | Content fills mobile width | No horizontal overflow |
| Y1.05 | Tables responsive | Horizontal scroll or column stacking |
| Y1.06 | Forms usable on mobile | All inputs accessible |
| Y1.07 | Dialogs/modals fit mobile screen | Not overflowing |
| Y1.08 | Dashboard widgets stack | Single column on mobile |

### Y2. Tablet (768px)

| # | Test | Expected |
|---|------|----------|
| Y2.01 | Sidebar collapsible | Toggle works at tablet breakpoint |
| Y2.02 | Content layout | Adapts to medium width |
| Y2.03 | Tables readable | Columns fit or scroll |
| Y2.04 | Charts render correctly | Not clipped or overflowing |

---

## SECTION Z: Cross-Tenant Data Isolation (RLS)

### Z1. RLS Leakage Tests

For every entity type, verify that admin at School A cannot see School B's data.

| # | Test | Expected |
|---|------|----------|
| Z1.01 | Student list — only current tenant | No students from other schools |
| Z1.02 | Household list — only current tenant | No households from other schools |
| Z1.03 | Staff list — only current tenant | No staff from other schools |
| Z1.04 | Class list — only current tenant | No classes from other schools |
| Z1.05 | Invoice list — only current tenant | No invoices from other schools |
| Z1.06 | Payment list — only current tenant | No payments from other schools |
| Z1.07 | Application list — only current tenant | No applications from other schools |
| Z1.08 | Announcement list — only current tenant | No announcements from other schools |
| Z1.09 | Inquiry list — only current tenant | No inquiries from other schools |
| Z1.10 | Audit log — only current tenant | No other tenant's log entries |
| Z1.11 | Search results — only current tenant | No cross-tenant leakage in Meilisearch |
| Z1.12 | Schedule entries — only current tenant | No other tenant's schedules |
| Z1.13 | Attendance sessions — only current tenant | No other tenant's attendance |
| Z1.14 | Gradebook data — only current tenant | No other tenant's grades |
| Z1.15 | Report cards — only current tenant | No other tenant's reports |
| Z1.16 | Website pages — only current tenant | No other tenant's CMS content |
| Z1.17 | Contact submissions — only current tenant | No cross-tenant submissions |
| Z1.18 | Compliance requests — only current tenant | No other tenant's requests |
| Z1.19 | Fee structures/assignments — only current tenant | No other tenant's fee data |
| Z1.20 | Closures — only current tenant | No other tenant's closures |

### Z2. Direct ID Access

| # | Test | Expected |
|---|------|----------|
| Z2.01 | GET /api/v1/students/:other_tenant_id | 404 or 403, not the student |
| Z2.02 | GET /api/v1/households/:other_tenant_id | 404 or 403 |
| Z2.03 | GET /api/v1/invoices/:other_tenant_id | 404 or 403 |
| Z2.04 | GET /api/v1/staff/:other_tenant_id | 404 or 403 |
| Z2.05 | PUT /api/v1/students/:other_tenant_id | 404 or 403, no mutation |
| Z2.06 | DELETE /api/v1/students/:other_tenant_id | 404 or 403, no deletion |

---

## SECTION AA: Permission Boundary Summary

Consolidated negative tests — admin must be BLOCKED from all of these:

| # | Feature | Permission Required | Expected |
|---|---------|-------------------|----------|
| AA.01 | View payroll runs | `payroll.view` | 403 |
| AA.02 | Create payroll run | `payroll.create_run` | 403 |
| AA.03 | Finalise payroll | `payroll.finalise_run` | 403 |
| AA.04 | View compensation | `payroll.manage_compensation` | 403 |
| AA.05 | Generate payslips | `payroll.generate_payslips` | 403 |
| AA.06 | View bank details (decrypted) | `payroll.view_bank_details` | 403 |
| AA.07 | View payroll reports | `payroll.view_reports` | 403 |
| AA.08 | Configure Stripe keys | `tenant.manage_stripe` | 403 |
| AA.09 | Manage custom domains | `tenant.manage_domains` | 403 |
| AA.10 | Override schedule hard conflict | `schedule.override_conflict` | 403 |
| AA.11 | Configure teacher availability | `schedule.configure_availability` | 403 |
| AA.12 | Override final grade | `gradebook.override_final_grade` | 403 |
| AA.13 | Override refund guard | `finance.override_refund_guard` | 403 |
| AA.14 | Process compliance request | `compliance.process_request` | 403 |

---

## Test Count Summary

| Section | Area | Test Count |
|---------|------|-----------|
| A | Authentication & Session | 14 |
| B | Dashboard | 15 |
| C | Students | 38 |
| D | Households | 41 |
| E | Parents | 11 |
| F | Staff | 17 |
| G | Academic Structure | 46 |
| H | Scheduling (Manual + Auto) | 76 |
| I | Attendance | 17 |
| J | Gradebook & Report Cards | 32 |
| K | Finance | 66 |
| L | Payroll Negative Tests | 15 |
| M | Admissions | 28 |
| N | Communications | 24 |
| O | Website CMS | 19 |
| P | Settings & Configuration | 28 |
| Q | Users & Roles | 22 |
| R | Approvals | 15 |
| S | Compliance & Audit | 7 |
| T | Imports | 10 |
| U | Search | 13 |
| V | Reports & Analytics | 14 |
| W | Global UI & Navigation | 16 |
| X | i18n & RTL | 25 |
| Y | Responsive Design | 12 |
| Z | Cross-Tenant RLS | 26 |
| AA | Permission Boundaries | 14 |
| **TOTAL** | | **~641** |

---

## Dependencies on Known Bugs (from QA-OWNER-REPORT)

The following tests cannot pass until the corresponding bugs from the Owner QA report are fixed. These same bugs affect the Admin role:

| Bug | Affects Section | Tests Blocked |
|-----|----------------|---------------|
| BUG-C01 | Attendance crash | I1.01 |
| BUG-C02 | Period Grid crash | H5.01 |
| BUG-C03 | Staff Availability crash | H8.01 (read-only view) |
| BUG-C04 | Gradebook API error | J3.01, J4.01-J4.03 |
| BUG-C05 | Finance NaN | K5.08, K7.06 |
| BUG-C06 | Class tabs empty | G5.07, G5.08 |
| BUG-C07 | Announcement detail blank | N1.10 |
| BUG-C08 | Inquiry detail blank | N3.03, N3.04, N3.05 |
| BUG-C09 | Form fields not showing | M1.02 |
| BUG-H01-H04 | Finance i18n | K1.01, K4.01 |
| BUG-H05-H06 | Admissions blank | M2.02, M2.05 |
| BUG-H07 | Staff detail blank | F2.01 |
| BUG-H11 | Promotion report blank | V2.01 |
| BUG-H13 | Mobile no nav | Y1.02, Y1.03 |
| BUG-H14 | Class edit blank | G5.10 |
| BUG-M04 | Inquiry columns blank | N3.02 |
| BUG-M07 | Assessment categories empty | J2.01 |
| BUG-M11 | Command palette 0 results | U1.03-U1.08 |
| BUG-M12 | Contact submissions dates | O2.02, O2.03 |
| BUG-M14 | Admissions analytics contradictory | M4.06 |
| BUG-M16 | Promotion wizard steps blank | G6.02-G6.08 |
| BUG-M17 | Auto-scheduler blank | H10.02 |
| BUG-M18 | Execute refund API error | K9.07 |
| BUG-L06 | Scope i18n key | N1.05 |
| BUG-L07 | Alt+T shortcut | W4.03 |

---

## Execution Notes

1. **Test account setup**: Create a user with ONLY `school_admin` role (no `school_owner`). This is critical — using a dual-role user masks permission boundary issues.

2. **Two-school setup**: For RLS tests (Section Z), ensure the test account has membership at only one school, and a separate account exists at the second school for data seeding.

3. **Approval testing**: Requires a second admin account (or owner account) to be the approver for approval workflow tests.

4. **Order of execution**: Start with Sections A, W, B (auth, navigation, dashboard) then proceed module by module. Save destructive tests (create/edit/delete) for after read-only verification passes. Run permission boundary tests (L, AA) as a dedicated pass.

5. **Bug dependencies**: Many tests are blocked by known bugs from the Owner report. Track which bugs are fixed before attempting those tests.
