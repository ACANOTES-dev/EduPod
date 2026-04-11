# Admissions Module — Admin E2E Test Specification

**Module:** Admissions (Operations)
**Perspective:** Admin (school_owner, school_principal, admin, school_vice_principal, front_office)
**Pages Covered:** 18 unique routes (10 staff-facing + 8 public-facing)
**Last Updated:** 2026-04-11

---

## Table of Contents

1. [Prerequisites & Test Data](#1-prerequisites--test-data)
2. [Admissions Dashboard / Hub](#2-admissions-dashboard--hub)
3. [Ready-to-Admit Queue](#3-ready-to-admit-queue)
4. [Conditional Approval Queue](#4-conditional-approval-queue)
5. [Waiting List Queue](#5-waiting-list-queue)
6. [Approved Queue](#6-approved-queue)
7. [Rejected Archive](#7-rejected-archive)
8. [Application Detail — General](#8-application-detail--general)
9. [Application Detail — Application Tab](#9-application-detail--application-tab)
10. [Application Detail — Timeline Tab](#10-application-detail--timeline-tab)
11. [Application Detail — Notes Tab](#11-application-detail--notes-tab)
12. [Application Detail — Payment Tab](#12-application-detail--payment-tab)
13. [Application Detail — Actions (ready_to_admit)](#13-application-detail--actions-ready_to_admit)
14. [Application Detail — Actions (conditional_approval)](#14-application-detail--actions-conditional_approval)
15. [Application Detail — Actions (waiting_list)](#15-application-detail--actions-waiting_list)
16. [Application Detail — Actions (approved)](#16-application-detail--actions-approved)
17. [Application Detail — Reject Dialog](#17-application-detail--reject-dialog)
18. [Application Detail — Force Approve Modal](#18-application-detail--force-approve-modal)
19. [Application Detail — Record Cash Modal](#19-application-detail--record-cash-modal)
20. [Application Detail — Record Bank Transfer Modal](#20-application-detail--record-bank-transfer-modal)
21. [Admissions Analytics](#21-admissions-analytics)
22. [Form Preview](#22-form-preview)
23. [Admissions Settings](#23-admissions-settings)
24. [Public Apply — Generic Form](#24-public-apply--generic-form)
25. [Public Apply — Tenant-Specific Form (Mode Picker)](#25-public-apply--tenant-specific-form-mode-picker)
26. [Public Apply — Tenant-Specific Form (New Family)](#26-public-apply--tenant-specific-form-new-family)
27. [Public Apply — Tenant-Specific Form (Existing Family Lookup)](#27-public-apply--tenant-specific-form-existing-family-lookup)
28. [Public Apply — Tenant-Specific Form (Existing Family Submit)](#28-public-apply--tenant-specific-form-existing-family-submit)
29. [Public Apply — Students Section Component](#29-public-apply--students-section-component)
30. [Public Apply — Submitted Confirmation](#30-public-apply--submitted-confirmation)
31. [Public Apply — Payment Success (Tenant)](#31-public-apply--payment-success-tenant)
32. [Public Apply — Payment Cancelled (Tenant)](#32-public-apply--payment-cancelled-tenant)
33. [Public Apply — Payment Success (Root)](#33-public-apply--payment-success-root)
34. [Public Apply — Payment Cancelled (Root)](#34-public-apply--payment-cancelled-root)
35. [Queue Components — ApplicationRow](#35-queue-components--applicationrow)
36. [Queue Components — CapacityChip](#36-queue-components--capacitychip)
37. [Queue Components — QueueHeader](#37-queue-components--queueheader)
38. [Queue Components — PaymentRecordModal](#38-queue-components--paymentrecordmodal)
39. [Queue Components — ForceApproveModal (Queue)](#39-queue-components--forceapprovemodal-queue)
40. [Queue Components — RejectDialog (Queue)](#40-queue-components--rejectdialog-queue)
41. [Queue Components — ManualPromoteDialog](#41-queue-components--manualpromote-dialog)
42. [State Machine — Full Transition Graph](#42-state-machine--full-transition-graph)
43. [End-to-End Flow — New Family Application](#43-end-to-end-flow--new-family-application)
44. [End-to-End Flow — Existing Family Application](#44-end-to-end-flow--existing-family-application)
45. [End-to-End Flow — Stripe Payment Completion](#45-end-to-end-flow--stripe-payment-completion)
46. [End-to-End Flow — Cash Payment Approval](#46-end-to-end-flow--cash-payment-approval)
47. [End-to-End Flow — Force Approve Override](#47-end-to-end-flow--force-approve-override)
48. [End-to-End Flow — Payment Expiry & Revert](#48-end-to-end-flow--payment-expiry--revert)
49. [End-to-End Flow — Manual Promotion from Waiting List](#49-end-to-end-flow--manual-promotion-from-waiting-list)
50. [End-to-End Flow — Application Rejection](#50-end-to-end-flow--application-rejection)
51. [End-to-End Flow — Application Withdrawal](#51-end-to-end-flow--application-withdrawal)
52. [Permission & Role Guard Tests](#52-permission--role-guard-tests)
53. [Arabic / RTL Verification](#53-arabic--rtl-verification)
54. [Backend Endpoint Map](#54-backend-endpoint-map)
55. [Console & Network Health](#55-console--network-health)
56. [Observations & Bugs Found During Walkthrough](#56-observations--bugs-found-during-walkthrough)
57. [Sign-Off](#57-sign-off)

---

## 1. Prerequisites & Test Data

Before executing this spec, ensure the following are in place:

**Tenant Configuration:**

- A test tenant with at least one active academic year
- At least two year groups with classes configured (capacity > 0)
- At least one year group at full capacity (enrolled = total_capacity) for capacity-exhausted tests
- Fee structures configured for each year group
- Stripe test keys configured (pk*test*_, sk*test*_, whsec\_\*) — or, at minimum, "allow_cash" enabled in admissions settings
- Tenant branding with logo, display_name, support_email, support_phone
- Tenant slug configured (e.g., "nhqs")

**User Accounts:**

- Admin account (role: admin or school_owner) — full access
- Front Office account (role: front_office) — restricted access (no settings, rejected, form preview, overrides)
- School Owner account — for force-approve tests
- Teacher account — for negative assertion tests (separate teacher spec)

**Test Applications:**

- At least 2 applications in each status: submitted, waiting_list, ready_to_admit, conditional_approval, approved, rejected, withdrawn
- At least 1 application with sibling flag (`is_sibling_application = true`)
- At least 1 application in conditional_approval with payment deadline in the past (overdue)
- At least 1 application in conditional_approval with payment deadline within 2 days (near expiry)
- At least 1 application from an existing household (mode: existing_household)

**Browser:**

- Chrome DevTools open (Console + Network tabs)
- Clear application storage before starting

---

## 2. Admissions Dashboard / Hub

**URL:** `/{locale}/admissions`
**API:** `GET /api/v1/admissions/dashboard-summary` (Permission: `admissions.view`)
**Translation Namespace:** `admissionsHub`

| #    | What to Check                                      | Expected Result                                                                                                                                                                                                                                                                                                                                        | Pass/Fail |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 2.1  | Navigate to `/{locale}/admissions` as admin        | Page loads. Network tab shows `GET /api/v1/admissions/dashboard-summary` returning 200. Page title reads the translated value of `admissionsHub.title`.                                                                                                                                                                                                |           |
| 2.2  | KPI strip renders 5 tiles                          | Five tiles visible in a horizontal row: "Ready to Admit", "Waiting List", "Conditional Approval", "Approved This Month", "Rejected This Month". Each shows a numeric count matching the API response fields `counts.ready_to_admit`, `counts.waiting_list`, `counts.conditional_approval`, `counts.approved_this_month`, `counts.rejected_this_month`. |           |
| 2.3  | KPI tile numbers match API response                | Open Network tab → preview the dashboard-summary response. Compare each tile's displayed number against the corresponding `counts.*` field. All 5 must match exactly.                                                                                                                                                                                  |           |
| 2.4  | Cards grid renders 8 cards for admin               | Eight navigation cards visible in a grid layout: Ready to Admit (amber), Conditional Approval (violet), Waiting List (sky), Approved (emerald), Rejected (rose), Form Preview (emerald), Overrides (slate), Settings (zinc). Each card shows an icon, title, and description with dynamic count text.                                                  |           |
| 2.5  | Ready to Admit card — click navigates              | Click the "Ready to Admit" card. Browser navigates to `/{locale}/admissions/ready-to-admit`. Use browser back to return.                                                                                                                                                                                                                               |           |
| 2.6  | Conditional Approval card — attention badge        | If `counts.conditional_approval_near_expiry > 0`, the Conditional Approval card shows an attention badge (small colored indicator). If 0, no badge shown. Verify against API response.                                                                                                                                                                 |           |
| 2.7  | Waiting List card — awaiting year setup text       | If `counts.waiting_list_awaiting_year_setup > 0`, the Waiting List card shows secondary text indicating the count. If 0, no secondary text. Verify against API response.                                                                                                                                                                               |           |
| 2.8  | Approved card — click navigates                    | Click "Approved" card. Navigates to `/{locale}/admissions/approved`.                                                                                                                                                                                                                                                                                   |           |
| 2.9  | Rejected card — visible only for ADMIN_ROLES       | Log in as admin → card visible. Log in as front_office → card NOT visible. The Rejected card requires `ADMIN_ROLES` (school_owner, school_principal, admin, school_vice_principal).                                                                                                                                                                    |           |
| 2.10 | Form Preview card — visible only for ADMIN_ROLES   | Same as 2.9 — visible for admin, NOT for front_office.                                                                                                                                                                                                                                                                                                 |           |
| 2.11 | Overrides card — visible only for ADMIN_ROLES      | Same as 2.9 — visible for admin, NOT for front_office.                                                                                                                                                                                                                                                                                                 |           |
| 2.12 | Settings card — visible only for ADMIN_ROLES       | Same as 2.9 — visible for admin, NOT for front_office.                                                                                                                                                                                                                                                                                                 |           |
| 2.13 | Overrides card — click navigates (404 expected)    | Click the "Overrides" card. Navigates to `/{locale}/admissions/overrides`. **Note:** This page does not currently exist — a 404 or blank page is the expected current behavior. See Observations section.                                                                                                                                              |           |
| 2.14 | Settings card — click navigates                    | Click "Settings" card. Navigates to `/{locale}/admissions/settings`. Settings page loads.                                                                                                                                                                                                                                                              |           |
| 2.15 | Capacity pressure table — renders when data exists | If `capacity_pressure` array in API response is non-empty, a table appears below the cards showing columns: Year Group Name, Waiting List Count, Capacity (format: "total / enrolled / conditional"). The table is hidden on mobile viewports (`hidden md:block`).                                                                                     |           |
| 2.16 | Capacity pressure table — data matches API         | For each row in the table, verify year group name and numeric values match the corresponding `capacity_pressure[]` entry from the API response. Capacity column shows `total_capacity / enrolled_count / conditional_count` in monospace font.                                                                                                         |           |
| 2.17 | Capacity pressure table — hidden when empty        | If `capacity_pressure` array is empty (no waiting list applications), the table section does not render.                                                                                                                                                                                                                                               |           |
| 2.18 | Auto-refresh every 60 seconds                      | Stay on the page with DevTools Network tab open. After approximately 60 seconds, observe a new `GET /api/v1/admissions/dashboard-summary` request. Counts should update if backend data changed.                                                                                                                                                       |           |
| 2.19 | Auto-refresh pauses when tab hidden                | Switch to another browser tab. Wait 60+ seconds. Switch back. Verify that requests did NOT fire while tab was hidden (only resumes on tab focus).                                                                                                                                                                                                      |           |
| 2.20 | Loading state — skeleton cards                     | Hard-refresh the page. During the brief loading period, skeleton placeholder cards should render (animated pulse) before real data appears.                                                                                                                                                                                                            |           |
| 2.21 | Empty state — all counts zero                      | If all counts are zero (no applications at all), an empty state message with a ClipboardList icon and descriptive text appears instead of the cards grid.                                                                                                                                                                                              |           |
| 2.22 | Error handling — API failure                       | Simulate network failure (DevTools → Network → Offline). Reload page. Console shows `[AdmissionsHub]` error log. Page shows loading state or empty state — no unhandled crash.                                                                                                                                                                         |           |
| 2.23 | Front office user sees 4 cards only                | Log in as front_office role. Navigate to admissions. Only 4 cards visible: Ready to Admit, Conditional Approval, Waiting List, Approved. The 4 admin-only cards (Rejected, Form Preview, Overrides, Settings) are NOT rendered.                                                                                                                        |           |

---

## 3. Ready-to-Admit Queue

**URL:** `/{locale}/admissions/ready-to-admit`
**API:** `GET /api/v1/applications/queues/ready-to-admit` (Permission: `admissions.view`)
**Translation Namespace:** `admissionsQueues`

| #    | What to Check                                 | Expected Result                                                                                                                                                                                                      | Pass/Fail |
| ---- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 3.1  | Page loads with queue header                  | QueueHeader component renders with title matching `t('readyToAdmit.title')`, description matching `t('readyToAdmit.description')`, and total count badge. Back button links to `/{locale}/admissions`.               |           |
| 3.2  | API call fires on mount                       | Network tab shows `GET /api/v1/applications/queues/ready-to-admit` returning 200. Response is an array of `QueueYearGroupBucket` objects.                                                                            |           |
| 3.3  | Applications grouped by year group            | Applications are grouped under year group section headers. Each section shows the year group name and academic year.                                                                                                 |           |
| 3.4  | Capacity chips per year group                 | Each year group section header includes a CapacityChip showing capacity info: "Year Group · enrolled/total · N conditional · M free". Color: green (3+ free), amber (1-2 free), red (0 free).                        |           |
| 3.5  | Application rows render correctly             | Each application row shows: application number (monospace), student name, sibling badge (if applicable), age, FIFO position, parent name, parent contact (email/phone), applied date with relative days.             |           |
| 3.6  | Sibling badge — visible when applicable       | Applications with `is_sibling_application = true` show a sky-colored "Sibling" badge next to the student name.                                                                                                       |           |
| 3.7  | Approve button — enabled when seats available | For year groups with available seats > 0, the "Move to conditional approval" button is enabled (not greyed out).                                                                                                     |           |
| 3.8  | Approve button — disabled at capacity         | For year groups where available_seats = 0, the approve button is disabled. A tooltip appears on hover explaining: `t('readyToAdmit.atCapacityTooltip')`.                                                             |           |
| 3.9  | Approve button — click triggers review        | Click "Move to conditional approval" for an enabled application. Network tab shows `POST /api/v1/applications/{id}/review` with body `{ status: 'conditional_approval', expected_updated_at: <ISO> }` returning 200. |           |
| 3.10 | Approve success — toast and refresh           | After successful approval, a success toast appears: `t('readyToAdmit.approveSuccess')`. The application disappears from the queue (list refreshes automatically).                                                    |           |
| 3.11 | Approve button — disabled during submission   | While the POST is in flight, the approve button shows a loading state and is disabled. No double-click possible.                                                                                                     |           |
| 3.12 | Reject button — opens RejectDialog            | Click the "Reject" button on any application. A dialog opens with title, reason textarea, and Cancel/Reject buttons. (Full dialog testing in Section 40.)                                                            |           |
| 3.13 | View button — navigates to detail             | Click "View" on any application. Browser navigates to `/{locale}/admissions/{applicationId}`.                                                                                                                        |           |
| 3.14 | Loading state                                 | Hard-refresh the page. "Loading..." text appears briefly before data loads.                                                                                                                                          |           |
| 3.15 | Empty state                                   | If no applications are in ready_to_admit status, an EmptyState component renders with Eye icon, title `t('readyToAdmit.emptyTitle')`, and description `t('readyToAdmit.emptyDescription')`.                          |           |
| 3.16 | Error toast on approve failure                | Simulate a 409 Conflict (capacity exhausted between page load and click). Toast shows `t('readyToAdmit.approveError')`. Application remains in the list.                                                             |           |
| 3.17 | Optimistic locking — stale updated_at         | If another admin approved the same application simultaneously, the POST returns 409 with `INVALID_STATUS_TRANSITION`. Toast shows error. Page refreshes to reflect current state.                                    |           |

---

## 4. Conditional Approval Queue

**URL:** `/{locale}/admissions/conditional-approval`
**API:** `GET /api/v1/applications/queues/conditional-approval?page=1&pageSize=50` (Permission: `admissions.view`)
**Translation Namespace:** `admissionsQueues`

| #    | What to Check                                          | Expected Result                                                                                                                                                                                             | Pass/Fail |
| ---- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 4.1  | Page loads with queue header                           | QueueHeader renders with title, description, and total count. Header shows badges for overdue and near-expiry counts if > 0.                                                                                |           |
| 4.2  | API call fires on mount                                | Network tab shows `GET /api/v1/applications/queues/conditional-approval?page=1&pageSize=50` returning 200. Response includes `data[]` and `meta` with `near_expiry_count` and `overdue_count`.              |           |
| 4.3  | Overdue badge — visible when overdue_count > 0         | A red badge shows the overdue count in the header. If `overdue_count = 0`, badge is NOT rendered.                                                                                                           |           |
| 4.4  | Near-expiry badge — visible when near_expiry_count > 0 | An orange/warning badge shows the near-expiry count. If `near_expiry_count = 0`, badge is NOT rendered.                                                                                                     |           |
| 4.5  | Row layout — all columns present                       | Each row shows: application number + student name + year group (col 1), parent name + contact (col 2), payment amount + urgency badge + deadline text (col 3), action buttons (col 4).                      |           |
| 4.6  | Payment amount display                                 | Payment amount is formatted as a currency value (e.g., "€500.00" or "500.00 EUR"). Amount comes from `payment_amount_cents` divided by 100.                                                                 |           |
| 4.7  | Urgency badge — overdue styling                        | Applications with `urgency = 'overdue'` show a red-tinted badge with `bg-danger-500/10 text-danger-700 border-danger-500/40`.                                                                               |           |
| 4.8  | Urgency badge — near_expiry styling                    | Applications with `urgency = 'near_expiry'` show an orange-tinted badge with `bg-warning-500/10 text-warning-700 border-warning-500/40`.                                                                    |           |
| 4.9  | Urgency badge — normal styling                         | Applications with `urgency = 'normal'` show a muted badge with `bg-surface-muted text-text-secondary border-border`.                                                                                        |           |
| 4.10 | Deadline relative text — future                        | For a deadline 3 days from now, text reads `t('conditionalApproval.inDays', { days: 3 })`.                                                                                                                  |           |
| 4.11 | Deadline relative text — today                         | For a deadline expiring today, text reads `t('conditionalApproval.deadlineToday')`.                                                                                                                         |           |
| 4.12 | Deadline relative text — overdue                       | For a deadline 2 days in the past, text reads `t('conditionalApproval.overdueBy', { days: 2 })`.                                                                                                            |           |
| 4.13 | Deadline relative text — no deadline                   | If `payment_deadline` is null, text reads `t('conditionalApproval.noDeadline')`.                                                                                                                            |           |
| 4.14 | Copy Payment Link button — click                       | Click "Copy Link" on any row. Network tab shows `POST /api/v1/applications/{id}/payment-link/regenerate` returning 200 with `{ url: "https://checkout.stripe.com/..." }`.                                   |           |
| 4.15 | Copy Payment Link — clipboard + toast                  | After successful link generation, the URL is copied to clipboard. Toast shows `t('conditionalApproval.linkCopied')`.                                                                                        |           |
| 4.16 | Copy Payment Link — error toast                        | If the POST fails (e.g., Stripe not configured), toast shows `t('conditionalApproval.linkCopyError')`.                                                                                                      |           |
| 4.17 | Record Payment button — opens modal                    | Click "Record Payment". PaymentRecordModal opens with tabs for cash/bank/stripe. (Full modal testing in Section 38.)                                                                                        |           |
| 4.18 | Force Approve button — visible for owners only         | Log in as school_owner → "Force Approve" button visible. Log in as admin (not owner/principal) → button NOT visible. The `canForceApprove` check requires `hasAnyRole('school_owner', 'school_principal')`. |           |
| 4.19 | Force Approve button — opens modal                     | Click "Force Approve" (as school_owner). ForceApproveModal opens. (Full modal testing in Section 39.)                                                                                                       |           |
| 4.20 | Reject button — opens dialog                           | Click "Reject". RejectDialog opens. (Full dialog testing in Section 40.)                                                                                                                                    |           |
| 4.21 | View button — navigates to detail                      | Click "View". Browser navigates to `/{locale}/admissions/{applicationId}`.                                                                                                                                  |           |
| 4.22 | Pagination — visible when total > 50                   | If `meta.total > 50`, pagination controls appear at the bottom with Previous/Next buttons and page indicator text.                                                                                          |           |
| 4.23 | Pagination — next page loads                           | Click "Next". Network tab shows `GET ...?page=2&pageSize=50` returning 200. New rows render. Previous button becomes enabled.                                                                               |           |
| 4.24 | Pagination — previous disabled on page 1               | On page 1, the Previous button is disabled (cannot go below page 1).                                                                                                                                        |           |
| 4.25 | Loading state                                          | "Loading..." text appears during initial fetch.                                                                                                                                                             |           |
| 4.26 | Empty state                                            | If no conditional_approval applications exist, EmptyState renders with appropriate icon, title `t('conditionalApproval.emptyTitle')`, and description `t('conditionalApproval.emptyDescription')`.          |           |

---

## 5. Waiting List Queue

**URL:** `/{locale}/admissions/waiting-list`
**API:** `GET /api/v1/applications/queues/waiting-list` (Permission: `admissions.view`)
**Translation Namespace:** `admissionsQueues`

| #    | What to Check                                      | Expected Result                                                                                                                                                                                   | Pass/Fail |
| ---- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 5.1  | Page loads with queue header                       | QueueHeader renders with title `t('waitingList.title')`, description, and total count badge.                                                                                                      |           |
| 5.2  | API call fires on mount                            | Network tab shows `GET /api/v1/applications/queues/waiting-list` returning 200. Response has `{ waiting: [...], awaiting_year_setup: [...] }`.                                                    |           |
| 5.3  | Two sections render when both have data            | If both arrays are non-empty, two sections appear: "Waiting" section (normal waiting list) and "Awaiting year setup" section (with reduced opacity).                                              |           |
| 5.4  | Waiting section — title and applications           | Section title reads `t('waitingList.waitingSectionTitle')`. Applications render as ApplicationRow components grouped by year group.                                                               |           |
| 5.5  | Awaiting year setup section — styling              | This section has `opacity-80` and a subtitle explaining why these applications are held. Title: `t('waitingList.awaitingYearSetupSectionTitle')`.                                                 |           |
| 5.6  | Awaiting year setup — note text                    | A note appears: `t('waitingList.awaitingYearSetupNote')` explaining that these applications will auto-promote once classes are created for their year group.                                      |           |
| 5.7  | Manual Promote button — visible in waiting section | Applications in the "Waiting" section show a "Manual Promote" button (outline variant).                                                                                                           |           |
| 5.8  | Manual Promote button — NOT in awaiting section    | Applications in the "Awaiting year setup" section do NOT show a Manual Promote button.                                                                                                            |           |
| 5.9  | Manual Promote button — disabled at capacity       | For year groups where `available_seats = 0`, the Manual Promote button is disabled. Tooltip: `t('waitingList.atCapacityTooltip')`.                                                                |           |
| 5.10 | Manual Promote button — opens dialog               | Click "Manual Promote" (enabled). ManualPromoteDialog opens with justification textarea. (Full dialog testing in Section 41.)                                                                     |           |
| 5.11 | Reject button — present on all rows                | Both waiting and awaiting-year-setup applications show a "Reject" button.                                                                                                                         |           |
| 5.12 | Reject button — opens dialog                       | Click "Reject". RejectDialog opens.                                                                                                                                                               |           |
| 5.13 | View button — navigates to detail                  | Click "View". Navigates to `/{locale}/admissions/{id}`.                                                                                                                                           |           |
| 5.14 | Capacity chips per year group                      | Each year group bucket shows a CapacityChip with color-coded availability.                                                                                                                        |           |
| 5.15 | FIFO ordering                                      | Within each year group, applications are ordered by: sibling priority first (is_sibling_application = true comes first), then by apply_date ascending (earliest first). Verify the order matches. |           |
| 5.16 | Loading state                                      | "Loading..." text during fetch.                                                                                                                                                                   |           |
| 5.17 | Empty state                                        | If both arrays empty, EmptyState with Hourglass icon, title `t('waitingList.emptyTitle')`, description `t('waitingList.emptyDescription')`.                                                       |           |

---

## 6. Approved Queue

**URL:** `/{locale}/admissions/approved`
**API:** `GET /api/v1/applications/queues/approved?page=1&pageSize=20` (Permission: `admissions.view`)
**Translation Namespace:** `admissionsQueues`

| #    | What to Check                             | Expected Result                                                                                                                                                                              | Pass/Fail |
| ---- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 6.1  | Page loads with queue header              | QueueHeader shows title `t('approved.title')`, description `t('approved.description')`, and count label `t('approved.countLabel')` with total count.                                         |           |
| 6.2  | API call fires on mount                   | Network tab shows `GET /api/v1/applications/queues/approved?page=1&pageSize=20` returning 200 with `{ data: ApprovedRow[], meta: { page, pageSize, total } }`.                               |           |
| 6.3  | Search form renders                       | A search form appears with a Search icon and input placeholder `t('approved.searchPlaceholder')`. The input has `ps-9` padding for the icon.                                                 |           |
| 6.4  | Search — submitting filters results       | Type a student name in the search input. Press Enter (form submit). Network tab shows a new GET request with `&search=<term>`. Page resets to page 1. Results update.                        |           |
| 6.5  | Search — clearing resets                  | Clear the search input and submit. Request fires without `search` param. Full unfiltered list returns.                                                                                       |           |
| 6.6  | Table columns — all 7 present             | Table header shows 7 columns: Student Number, Student, Household, Class, Admitted By, Admitted On, and an empty column for the View button.                                                  |           |
| 6.7  | Student Number column                     | Shows `row.student_number` in monospace `font-mono text-xs` styling. If null, shows "—" (em-dash).                                                                                           |           |
| 6.8  | Student column — linked when materialized | If `row.student_id` exists, student name (`first_name last_name`) renders as a link to `/{locale}/students/{student_id}` with hover color change. If no `student_id`, renders as plain text. |           |
| 6.9  | Household column — linked when exists     | If `row.household_id` exists, renders as a link to `/{locale}/households/{household_id}` showing household number (monospace) + household name (tertiary text). If no household, shows "—".  |           |
| 6.10 | Class column                              | Shows `row.class_name`. If null, shows `t('approved.unassigned')` text.                                                                                                                      |           |
| 6.11 | Admitted By column                        | Shows the reviewer's full name (`reviewed_by.first_name reviewed_by.last_name`). If null, shows "—".                                                                                         |           |
| 6.12 | Admitted On column                        | Shows `formatDate(row.reviewed_at)` — formatted date string.                                                                                                                                 |           |
| 6.13 | View button                               | Each row has a "View" button (ghost variant, sm size) linking to `/{locale}/admissions/{row.id}`.                                                                                            |           |
| 6.14 | Pagination — visible when totalPages > 1  | If total > 20, pagination controls appear: Previous button, page indicator ("Page X of Y"), Next button.                                                                                     |           |
| 6.15 | Pagination — next page                    | Click "Next". API call fires with `page=2`. New rows render.                                                                                                                                 |           |
| 6.16 | Pagination — previous disabled on page 1  | On page 1, Previous button is disabled.                                                                                                                                                      |           |
| 6.17 | Pagination — next disabled on last page   | On the last page, Next button is disabled.                                                                                                                                                   |           |
| 6.18 | Loading state                             | "Loading..." text during initial fetch.                                                                                                                                                      |           |
| 6.19 | Empty state                               | If no approved applications, EmptyState with CheckCircle2 icon, title `t('approved.emptyTitle')`, description `t('approved.emptyDescription')`.                                              |           |

---

## 7. Rejected Archive

**URL:** `/{locale}/admissions/rejected`
**API:** `GET /api/v1/applications/queues/rejected?page=1&pageSize=20` (Permission: `admissions.view`)
**Translation Namespace:** `admissionsQueues`

| #    | What to Check                              | Expected Result                                                                                                                                                                         | Pass/Fail |
| ---- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 7.1  | Page loads with queue header               | QueueHeader shows title `t('rejected.title')`, description, count label with total.                                                                                                     |           |
| 7.2  | API call fires                             | `GET /api/v1/applications/queues/rejected?page=1&pageSize=20` returns 200.                                                                                                              |           |
| 7.3  | Access restricted to ADMIN_ROLES           | Log in as front_office → navigate to `/admissions/rejected`. Page should NOT render (route guard blocks). Only admin, school_owner, school_principal, school_vice_principal can access. |           |
| 7.4  | Search form renders                        | Search input with placeholder `t('rejected.searchPlaceholder')` and Search icon.                                                                                                        |           |
| 7.5  | Search — filters by name                   | Type search term → submit. API re-fires with `&search=<term>`, page resets to 1.                                                                                                        |           |
| 7.6  | Table columns — all 7 present              | Columns: Application Number, Student, Parent, Reason, Rejected By, Rejected On, View button column.                                                                                     |           |
| 7.7  | Application Number column                  | Shows `application_number` in monospace `font-mono text-xs`.                                                                                                                            |           |
| 7.8  | Student column                             | Shows `student_first_name student_last_name` in medium font weight.                                                                                                                     |           |
| 7.9  | Parent column                              | Shows `parent_first_name parent_last_name` in secondary text color.                                                                                                                     |           |
| 7.10 | Reason column — truncated                  | Rejection reason truncated to ~80 characters with "…" appended if longer. Full text visible in tooltip on hover.                                                                        |           |
| 7.11 | Rejected By column                         | Shows reviewer full name or "—" if null.                                                                                                                                                |           |
| 7.12 | Rejected On column                         | Shows formatted date from `reviewed_at`.                                                                                                                                                |           |
| 7.13 | View button                                | Each row has "View" button navigating to `/{locale}/admissions/{row.id}`.                                                                                                               |           |
| 7.14 | Pagination — controls match approved queue | Same pagination behavior as Section 6 (Previous/Next, page indicator, disabled states).                                                                                                 |           |
| 7.15 | Empty state                                | EmptyState with appropriate icon, title, description when no rejected applications.                                                                                                     |           |

---

## 8. Application Detail — General

**URL:** `/{locale}/admissions/{id}`
**API:** `GET /api/v1/applications/{id}` (Permission: `admissions.view`)

| #    | What to Check                        | Expected Result                                                                                                                                                                                                                                                        | Pass/Fail |
| ---- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 8.1  | Page loads with application data     | Network tab shows `GET /api/v1/applications/{id}` returning 200. Page renders RecordHub layout with title, reference, status badge, metrics, tabs, and sidebar.                                                                                                        |           |
| 8.2  | Title — student name                 | Page title shows the student's full name: `student_first_name student_last_name`.                                                                                                                                                                                      |           |
| 8.3  | Reference — application number       | Reference line shows the application number (e.g., "APP-202604-0001").                                                                                                                                                                                                 |           |
| 8.4  | Status badge — correct variant       | Status badge shows the current status with correct color variant: submitted→info (blue), waiting_list→neutral (grey), ready_to_admit→warning (amber), conditional_approval→warning (amber), approved→success (green), rejected→danger (red), withdrawn→neutral (grey). |           |
| 8.5  | Metrics panel — 5 fields             | Metrics panel shows: Submitted date, Apply date, Target year group name, Academic year name, Days in state (with Clock icon + numeric value).                                                                                                                          |           |
| 8.6  | Capacity panel — sidebar             | Right sidebar shows CapacityPanel with 4 cells: Total capacity, Enrolled count, Conditional holds, Available seats. Available seats cell is color-coded (green if >0, warning/red if at capacity).                                                                     |           |
| 8.7  | Capacity panel — not configured      | If no classes exist for this year group, panel shows "Not configured" message instead of capacity cells.                                                                                                                                                               |           |
| 8.8  | Tabs — 3 or 4 tabs visible           | Three tabs always visible: "Application", "Timeline", "Notes". Fourth tab "Payment" appears only when `hasPaymentHistory` is true (application has payment data).                                                                                                      |           |
| 8.9  | Default tab — Application            | On initial load, the "Application" tab is selected and its content visible.                                                                                                                                                                                            |           |
| 8.10 | Loading state                        | Skeleton placeholders render during data fetch.                                                                                                                                                                                                                        |           |
| 8.11 | Not found — invalid UUID             | Navigate to `/{locale}/admissions/{invalid-uuid}`. Page shows "Application not found" message. API returns 404.                                                                                                                                                        |           |
| 8.12 | Not found — valid UUID, wrong tenant | Navigate to an application ID from a different tenant. API returns 404 (RLS blocks cross-tenant access). Page shows not-found message.                                                                                                                                 |           |

---

## 9. Application Detail — Application Tab

| #   | What to Check                      | Expected Result                                                                                                                                                                                                                                                                                                                | Pass/Fail |
| --- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 9.1 | Application tab shows form fields  | DynamicFormRenderer renders all form fields in read-only mode. Each field shows its label and the submitted value.                                                                                                                                                                                                             |           |
| 9.2 | All field types render correctly   | Verify each field type renders properly: short_text as text, long_text as multi-line, number as numeric, date as formatted date, boolean as checked/unchecked, single_select as selected option label, multi_select as list of selected options, phone/email with `dir="ltr"`, country as country name, yes_no as Yes/No text. |           |
| 9.3 | Read-only — no editing possible    | All form inputs are disabled. No input accepts keyboard input. No dropdown opens.                                                                                                                                                                                                                                              |           |
| 9.4 | Conditional fields — visibility    | If form has conditional visibility rules, only fields whose conditions are met (based on submitted values) are shown. Hidden conditional fields are not rendered.                                                                                                                                                              |           |
| 9.5 | Required field indicators          | Required fields show a green asterisk (\*) next to their label.                                                                                                                                                                                                                                                                |           |
| 9.6 | Help text — displayed below fields | Fields with `help_text` show the help text below the input in smaller secondary text.                                                                                                                                                                                                                                          |           |
| 9.7 | Field ordering                     | Fields render in `display_order` ascending order (lowest first).                                                                                                                                                                                                                                                               |           |

---

## 10. Application Detail — Timeline Tab

| #     | What to Check                        | Expected Result                                                                                                                                                         | Pass/Fail |
| ----- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 10.1  | Click Timeline tab                   | Tab content switches to show a vertical timeline of events.                                                                                                             |           |
| 10.2  | Events ordered chronologically       | Events are listed in reverse chronological order (newest first) or chronological order (verify which). Each event shows timestamp, kind badge, message, and actor name. |           |
| 10.3  | Event kind — submitted               | Events of kind "submitted" show an info-colored badge (`info-surface` background).                                                                                      |           |
| 10.4  | Event kind — status_changed          | Events of kind "status_changed" show a warning-colored badge (`warning-surface` background).                                                                            |           |
| 10.5  | Event kind — system_event            | Events of kind "system_event" show a muted badge (`surface-secondary` background).                                                                                      |           |
| 10.6  | Event kind — admin_note              | Events of kind "admin_note" show a muted badge (`surface-secondary` background).                                                                                        |           |
| 10.7  | Event kind — payment_event           | Events of kind "payment_event" show a success-colored badge (`success-surface` background).                                                                             |           |
| 10.8  | Event kind — override_granted        | Events of kind "override_granted" show a danger-colored badge (`danger-surface` background).                                                                            |           |
| 10.9  | Event message — whitespace preserved | Event message text uses `whitespace-pre-wrap` CSS, preserving line breaks in multi-line messages.                                                                       |           |
| 10.10 | Actor name                           | Each event shows the actor's name (the admin/system that caused the event). If no actor, field is omitted.                                                              |           |
| 10.11 | Timestamp — localized                | Timestamps are formatted in the current locale's date/time format.                                                                                                      |           |
| 10.12 | Empty timeline                       | If no events exist (unlikely for a valid application), shows "No timeline events yet" message.                                                                          |           |

---

## 11. Application Detail — Notes Tab

| #    | What to Check                     | Expected Result                                                                                                                                                                         | Pass/Fail |
| ---- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 11.1 | Click Notes tab                   | Tab content switches to show notes section with "Add note" input and existing notes list.                                                                                               |           |
| 11.2 | Add note — textarea renders       | A textarea appears with placeholder text. An "Add note" button appears next to or below it.                                                                                             |           |
| 11.3 | Add note — submit new note        | Type a note in the textarea. Click "Add note". Network tab shows `POST /api/v1/applications/{applicationId}/notes` with body `{ note: "<text>", is_internal: true }` returning 200/201. |           |
| 11.4 | Add note — success toast          | After successful submission, toast shows "Note added". The textarea clears. The new note appears in the list.                                                                           |           |
| 11.5 | Add note — error toast            | If the POST fails, toast shows "Failed to add note". The note text remains in the textarea for retry.                                                                                   |           |
| 11.6 | Existing notes list               | Each note shows: author name, timestamp (formatted), and note content. Notes are ordered newest-first.                                                                                  |           |
| 11.7 | Internal notes — visible to staff | All notes have `is_internal: true` when created by staff. These notes include internal-only content.                                                                                    |           |
| 11.8 | Empty notes                       | If no notes exist, message "No notes yet." appears.                                                                                                                                     |           |
| 11.9 | GET notes — includes internal     | Network tab: `GET /api/v1/applications/{applicationId}/notes` is called. The `includeInternal` parameter is `true` for staff, so internal notes are included.                           |           |

---

## 12. Application Detail — Payment Tab

| #    | What to Check                                       | Expected Result                                                                                                                                                                     | Pass/Fail |
| ---- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 12.1 | Payment tab — visible only when payment data exists | The Payment tab only appears in the tab bar when the application has payment history (conditional_approval or later status with payment fields set).                                |           |
| 12.2 | Expected Payment section                            | Shows: payment amount (formatted as major.minor), payment deadline (date with "expired" label if in the past), Stripe checkout session ID (monospace), current payment status.      |           |
| 12.3 | Payment deadline — expired label                    | If `payment_deadline` is in the past, a red "expired" label appears next to the date.                                                                                               |           |
| 12.4 | Stripe session ID — monospace                       | The Stripe session ID (if set) renders in monospace font for easy copy/reference.                                                                                                   |           |
| 12.5 | Payment Events list                                 | If payment events exist, each shows: Stripe event ID, timestamp, amount, and status. Listed in chronological order.                                                                 |           |
| 12.6 | Payment Events — empty                              | If no payment events, shows "No payment events recorded yet" or similar message.                                                                                                    |           |
| 12.7 | Admin Override section — conditional                | If an admin override was recorded, a third section shows: override type, approved by (staff name), expected amount, collected amount, justification (pre-wrap), approved timestamp. |           |
| 12.8 | Admin Override — not visible without override       | If no override exists, the override section does not render.                                                                                                                        |           |

---

## 13. Application Detail — Actions (ready_to_admit)

| #    | What to Check                                       | Expected Result                                                                                                                                    | Pass/Fail |
| ---- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 13.1 | Action bar shows 3 buttons                          | For `status = ready_to_admit`: "Move to conditional approval", "Reject", "Withdraw" buttons visible.                                               |           |
| 13.2 | Move to conditional approval — click                | Click the button. Network tab shows `POST /api/v1/applications/{id}/review` with `{ status: 'conditional_approval', expected_updated_at: <ISO> }`. |           |
| 13.3 | Move to conditional approval — disabled at capacity | If no seats available for this year group, button is disabled.                                                                                     |           |
| 13.4 | Move to conditional approval — success              | Toast: "Moved to conditional approval. Payment link will be emailed." Page refreshes showing the application now in conditional_approval status.   |           |
| 13.5 | Reject — opens dialog                               | Click "Reject". RejectDialog opens. (Tested in Section 17.)                                                                                        |           |
| 13.6 | Withdraw — click                                    | Click "Withdraw". Network tab shows `POST /api/v1/applications/{id}/withdraw` returning 200.                                                       |           |
| 13.7 | Withdraw — success toast                            | Toast: "Application withdrawn". Page refreshes to show withdrawn status.                                                                           |           |

---

## 14. Application Detail — Actions (conditional_approval)

| #     | What to Check                                    | Expected Result                                                                                                                                                  | Pass/Fail |
| ----- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 14.1  | Action bar shows 5-6 buttons                     | For `status = conditional_approval`: "Copy payment link", "Record cash", "Record bank transfer", optionally "Force approve" (owners only), "Reject", "Withdraw". |           |
| 14.2  | Copy payment link — click                        | Click "Copy payment link". Network tab shows `POST /api/v1/applications/{id}/payment-link/regenerate` returning 200 with `{ checkout_url: "https://..." }`.      |           |
| 14.3  | Copy payment link — clipboard                    | The checkout URL is written to the clipboard. Toast: "Payment link copied to clipboard".                                                                         |           |
| 14.4  | Copy payment link — fallback                     | If clipboard API unavailable, toast shows the URL directly: "Payment link: {url}".                                                                               |           |
| 14.5  | Record cash — opens modal                        | Click "Record cash". RecordCashModal opens. (Tested in Section 19.)                                                                                              |           |
| 14.6  | Record bank transfer — opens modal               | Click "Record bank transfer". RecordBankTransferModal opens. (Tested in Section 20.)                                                                             |           |
| 14.7  | Force approve — visible for owner/principal only | Log in as school_owner → button visible. Log in as admin (non-owner) → button NOT visible.                                                                       |           |
| 14.8  | Force approve — opens modal                      | Click "Force approve". ForceApproveModal opens. (Tested in Section 18.)                                                                                          |           |
| 14.9  | Reject — opens dialog                            | RejectDialog opens.                                                                                                                                              |           |
| 14.10 | Withdraw — click and confirm                     | "Withdraw" click → POST withdraw → toast "Application withdrawn".                                                                                                |           |

---

## 15. Application Detail — Actions (waiting_list)

| #    | What to Check              | Expected Result                                                                                      | Pass/Fail |
| ---- | -------------------------- | ---------------------------------------------------------------------------------------------------- | --------- |
| 15.1 | Action bar shows 2 buttons | For `status = waiting_list`: "Reject" and "Withdraw" buttons visible. No approve or payment buttons. |           |
| 15.2 | Reject — opens dialog      | Click "Reject". RejectDialog opens.                                                                  |           |
| 15.3 | Withdraw — click           | Click "Withdraw". POST fires. Toast: "Application withdrawn".                                        |           |

---

## 16. Application Detail — Actions (approved)

| #    | What to Check                               | Expected Result                                                                                                                             | Pass/Fail |
| ---- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 16.1 | Action bar shows 1 button (if materialized) | For `status = approved` with `materialised_student_id`: a "View student" link button appears, linking to `/{locale}/students/{student_id}`. |           |
| 16.2 | View student — click navigates              | Click "View student". Browser navigates to the student profile page.                                                                        |           |
| 16.3 | No actions if terminal and no student       | For approved without materialized student (edge case), no action buttons visible.                                                           |           |
| 16.4 | Rejected status — no actions                | For `status = rejected`, no action buttons appear (terminal state).                                                                         |           |
| 16.5 | Withdrawn status — no actions               | For `status = withdrawn`, no action buttons appear (terminal state).                                                                        |           |

---

## 17. Application Detail — Reject Dialog

| #    | What to Check                             | Expected Result                                                                                                                                                                                                       | Pass/Fail |
| ---- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 17.1 | Dialog opens with title                   | Title reads "Reject application" or translated equivalent. Description text explains the action.                                                                                                                      |           |
| 17.2 | Rejection reason textarea                 | A textarea renders for entering the rejection reason. Rows: 4.                                                                                                                                                        |           |
| 17.3 | Validation — minimum length               | Submit with fewer than 10 characters. Error appears stating the reason is too short. Button stays enabled. No API call fires.                                                                                         |           |
| 17.4 | Validation — empty submission blocked     | Submit with empty textarea. Validation error appears.                                                                                                                                                                 |           |
| 17.5 | Cancel button                             | Click "Cancel". Dialog closes. No API call fires. Application remains unchanged.                                                                                                                                      |           |
| 17.6 | Reject button — submit                    | Enter valid reason (10+ chars). Click "Reject". Network tab shows `POST /api/v1/applications/{id}/review` with body `{ status: 'rejected', rejection_reason: "<text>", expected_updated_at: "<ISO>" }` returning 200. |           |
| 17.7 | Reject success — toast + close            | Toast: `t('rejectDialog.success')`. Dialog closes. Page refreshes to show rejected status.                                                                                                                            |           |
| 17.8 | Reject error — toast                      | If POST fails, toast: `t('rejectDialog.errorGeneric')`. Dialog stays open for retry.                                                                                                                                  |           |
| 17.9 | Submit button — disabled while submitting | During POST, submit button shows "Working..." text and is disabled. Cancel is also disabled.                                                                                                                          |           |

---

## 18. Application Detail — Force Approve Modal

| #     | What to Check                               | Expected Result                                                                                                                                                                                                                                                                           | Pass/Fail |
| ----- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 18.1  | Modal opens with title and expected amount  | Title: `t('forceApproveModal.title')`. Description shows expected amount from the application's `payment_amount_cents`.                                                                                                                                                                   |           |
| 18.2  | Override type select                        | Select dropdown with 3 options: "Full waiver", "Partial waiver", "Deferred payment" (translated). Default: first option or empty.                                                                                                                                                         |           |
| 18.3  | Collected amount input                      | Number input for the actual amount collected. Step: 0.01. Min: 0.                                                                                                                                                                                                                         |           |
| 18.4  | Justification textarea                      | Textarea with rows=4, maxLength=2000. Placeholder text. Min-length hint visible.                                                                                                                                                                                                          |           |
| 18.5  | Validation — justification minimum 20 chars | Submit with < 20 characters in justification. Error: `t('forceApproveModal.errorTooShort')`. No API call.                                                                                                                                                                                 |           |
| 18.6  | Validation — invalid amount                 | Submit with negative or non-numeric amount. Error: `t('forceApproveModal.errorInvalidAmount')`.                                                                                                                                                                                           |           |
| 18.7  | Cancel button                               | Click "Cancel". Modal closes without API call.                                                                                                                                                                                                                                            |           |
| 18.8  | Force approve — submit                      | Fill valid data (justification 20+ chars, valid amount, selected type). Click "Force approve". Network tab shows `POST /api/v1/applications/{id}/payment/override` with body `{ override_type: "full_waiver", actual_amount_collected_cents: N, justification: "<text>" }` returning 200. |           |
| 18.9  | Success — toast + close                     | Toast: `t('forceApproveModal.success')`. Modal closes. Page refreshes showing approved status.                                                                                                                                                                                            |           |
| 18.10 | Error — toast stays open                    | If POST fails (e.g., role insufficient), toast: `t('forceApproveModal.errorGeneric')`. Modal stays open for retry.                                                                                                                                                                        |           |

---

## 19. Application Detail — Record Cash Modal

| #    | What to Check                      | Expected Result                                                                                                                                                                             | Pass/Fail |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 19.1 | Modal opens with amount pre-filled | Modal opens. Amount field pre-filled with `expectedAmountCents / 100`.                                                                                                                      |           |
| 19.2 | Form fields                        | Three fields: Amount received (required, number), Receipt number (optional, text), Notes (optional, textarea).                                                                              |           |
| 19.3 | Uses react-hook-form + Zod         | The form uses `useForm` with `zodResolver(recordCashPaymentSchema)`. Validation is schema-driven.                                                                                           |           |
| 19.4 | Submit — valid data                | Fill amount ≥ expected. Click submit. Network tab shows `POST /api/v1/applications/{id}/payment/cash` with body `{ amount_cents: N, receipt_number?: "...", notes?: "..." }` returning 200. |           |
| 19.5 | Submit — amount below expected     | Enter amount < expected. The backend returns 400 with `PAYMENT_BELOW_THRESHOLD`. Error toast appears.                                                                                       |           |
| 19.6 | Success toast                      | Toast: "Cash payment recorded. Application approved." Modal closes. Page refreshes to approved status.                                                                                      |           |
| 19.7 | Cash disabled — backend rejection  | If tenant has `allow_cash = false` in admissions settings, backend returns 400 with `CASH_PAYMENT_DISABLED`. Toast shows error.                                                             |           |
| 19.8 | Cancel — closes modal              | Click Cancel. Modal closes. No API call.                                                                                                                                                    |           |

---

## 20. Application Detail — Record Bank Transfer Modal

| #    | What to Check                 | Expected Result                                                                                                                                                                                                     | Pass/Fail |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 20.1 | Modal opens with fields       | Modal opens. Four fields: Amount received (number, required), Transfer reference (text, required), Transfer date (datetime-local picker, defaults to current date/time), Notes (optional textarea).                 |           |
| 20.2 | Transfer reference — required | Submit without transfer reference. Validation error appears. No API call.                                                                                                                                           |           |
| 20.3 | Submit — valid data           | Fill all required fields. Click submit. Network tab shows `POST /api/v1/applications/{id}/payment/bank-transfer` with body `{ amount_cents: N, transfer_reference: "...", transfer_date: "<ISO>", notes?: "..." }`. |           |
| 20.4 | Success toast                 | Toast: "Bank transfer recorded. Application approved." Modal closes. Page refreshes to approved status.                                                                                                             |           |
| 20.5 | Bank transfer disabled        | If tenant has `allow_bank_transfer = false`, backend returns 400 with `BANK_TRANSFER_DISABLED`.                                                                                                                     |           |
| 20.6 | Amount below expected         | Amount < expected → backend 400 `PAYMENT_BELOW_THRESHOLD`.                                                                                                                                                          |           |
| 20.7 | Cancel — closes modal         | Click Cancel. Modal closes without API call.                                                                                                                                                                        |           |

---

## 21. Admissions Analytics

**URL:** `/{locale}/admissions/analytics`
**API:** `GET /api/v1/applications/analytics` (Permission: `admissions.view`)
**Translation Namespace:** `admissions`

| #    | What to Check                   | Expected Result                                                                                                                                                                                                                | Pass/Fail |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 21.1 | Page loads                      | Network tab shows `GET /api/v1/applications/analytics` returning 200.                                                                                                                                                          |           |
| 21.2 | Stat cards — 3 cards            | Three stat cards: "Total Applications" (showing `analytics.total`), "Conversion Rate" (showing `analytics.conversion_rate.toFixed(1)%`), "Average Days to Decision" (showing `analytics.avg_days_to_decision` or "—" if null). |           |
| 21.3 | Funnel chart — renders          | A horizontal bar chart (Recharts BarChart) renders showing the funnel stages: submitted → ready_to_admit → conditional_approval → approved. Each bar shows the count.                                                          |           |
| 21.4 | Funnel chart — data matches API | Bar heights/lengths correspond to the `funnel.*` values from the API response.                                                                                                                                                 |           |
| 21.5 | Funnel chart — green bars       | Bars use the color `#059669` (emerald/green).                                                                                                                                                                                  |           |
| 21.6 | Back button                     | A back button appears. Click it → navigates to `/{locale}/admissions`.                                                                                                                                                         |           |
| 21.7 | Loading state                   | Skeleton bars render during data fetch.                                                                                                                                                                                        |           |
| 21.8 | Empty state                     | If `total = 0`, message `t('noApplicationsYet')` appears instead of the chart.                                                                                                                                                 |           |

---

## 22. Form Preview

**URL:** `/{locale}/admissions/form-preview`
**API:** `GET /api/v1/admission-forms/system` (Permission: `admissions.view`)
**Translation Namespace:** (mostly hardcoded labels)

| #     | What to Check                    | Expected Result                                                                                                                                                                                    | Pass/Fail |
| ----- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 22.1  | Page loads with form data        | Network tab shows `GET /api/v1/admission-forms/system` returning 200 with published form definition.                                                                                               |           |
| 22.2  | Public link panel                | Displays the public application URL built from tenant slug and locale. URL is selectable/copyable.                                                                                                 |           |
| 22.3  | Copy link button                 | Click "Copy link". URL copied to clipboard. Toast: "Link copied to clipboard".                                                                                                                     |           |
| 22.4  | Copy link — error                | If clipboard API fails, toast: "Could not copy link".                                                                                                                                              |           |
| 22.5  | QR code — renders                | A QR code (224px) renders from the `QRCodeCanvas` component, encoding the public URL.                                                                                                              |           |
| 22.6  | Download QR code                 | Click "Download QR code". A PNG file downloads via `file-saver`. The PNG contains the QR code.                                                                                                     |           |
| 22.7  | Download QR — error toast        | If download fails, toast: "Could not export QR code".                                                                                                                                              |           |
| 22.8  | Form preview section             | Shows form version number and field count. DynamicFormRenderer renders all fields in read-only mode. A disabled "Submit application" button appears at the bottom (demonstrating the form layout). |           |
| 22.9  | No form available                | If GET returns null/empty, message: "No form is currently available for this tenant." No QR code or preview shown.                                                                                 |           |
| 22.10 | Rebuild button — admin only      | If user `canManageForm` (admin roles), a "Rebuild form" button appears. If user is front_office, button is NOT visible.                                                                            |           |
| 22.11 | Rebuild — click                  | Click "Rebuild form". Confirmation dialog appears.                                                                                                                                                 |           |
| 22.12 | Rebuild — confirm                | Confirm rebuild. Network tab shows `POST /api/v1/admission-forms/system/rebuild` returning 200. Button shows "Rebuilding…" during request.                                                         |           |
| 22.13 | Rebuild — success toast          | Toast: "Form rebuilt from the latest wizard field set." Form preview updates with new version.                                                                                                     |           |
| 22.14 | Rebuild — error                  | If POST fails, toast shows error message from API response.                                                                                                                                        |           |
| 22.15 | Access restricted to ADMIN_ROLES | Front office user navigating to this page is blocked by route guard (only ADMIN_ROLES can access).                                                                                                 |           |
| 22.16 | Loading state                    | Skeleton loaders for QR area and form fields during initial fetch.                                                                                                                                 |           |

---

## 23. Admissions Settings

**URL:** `/{locale}/admissions/settings`
**API:** `GET /api/v1/settings/admissions`, `PATCH /api/v1/settings/admissions` (Permission: `settings.manage`)
**Translation Namespace:** `admissionsSettings`

| #     | What to Check                         | Expected Result                                                                                                                                                                                                                                                                                             | Pass/Fail |
| ----- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 23.1  | Page loads with current settings      | Network tab shows `GET /api/v1/settings/admissions` returning 200. Form fields populated with current values.                                                                                                                                                                                               |           |
| 23.2  | Payment Settings section              | Section contains: Upfront percentage (number, 0-100), Payment window days (number, min 1), Allow cash toggle (checkbox), Cash deadline days (number, min 1, shown when cash enabled), Allow bank transfer toggle (checkbox), Bank IBAN (text, monospace, shown when bank enabled), Link to Stripe settings. |           |
| 23.3  | Upfront percentage — range validation | Enter 101 → validation error (max 100). Enter -1 → validation error (min 0). Enter 50 → accepted.                                                                                                                                                                                                           |           |
| 23.4  | Payment window days — min validation  | Enter 0 → validation error (min 1). Enter 7 → accepted.                                                                                                                                                                                                                                                     |           |
| 23.5  | Allow cash toggle                     | Toggle on → cash deadline field appears. Toggle off → cash deadline field hides.                                                                                                                                                                                                                            |           |
| 23.6  | Allow bank transfer toggle            | Toggle on → IBAN field appears. Toggle off → IBAN field hides.                                                                                                                                                                                                                                              |           |
| 23.7  | IBAN field — monospace styling        | IBAN input uses monospace font for readability.                                                                                                                                                                                                                                                             |           |
| 23.8  | Stripe settings link                  | A link labeled "Manage Stripe configuration" navigates to `/{locale}/settings/stripe`.                                                                                                                                                                                                                      |           |
| 23.9  | Application Rules section             | Contains: Max application horizon (number, 0-5 years). Controls how many academic years ahead parents can apply.                                                                                                                                                                                            |           |
| 23.10 | Approval & Override section           | Contains: Require approval for acceptance toggle (checkbox), Override approval role select dropdown (options: school_owner, school_principal).                                                                                                                                                              |           |
| 23.11 | Save Changes button                   | "Save Changes" button at the bottom right. Initially enabled.                                                                                                                                                                                                                                               |           |
| 23.12 | Save — click                          | Click "Save Changes". Network tab shows `PATCH /api/v1/settings/admissions` with the full settings object. Returns 200.                                                                                                                                                                                     |           |
| 23.13 | Save — success toast                  | Toast: `t('admissionsSettings.saved')` ("Settings saved successfully").                                                                                                                                                                                                                                     |           |
| 23.14 | Save — error toast                    | If PATCH fails, toast: `t('admissionsSettings.saveError')` ("Failed to save settings").                                                                                                                                                                                                                     |           |
| 23.15 | Save — button shows saving state      | During PATCH, button text changes to `t('admissionsSettings.saving')` and is disabled.                                                                                                                                                                                                                      |           |
| 23.16 | Back button                           | Back button navigates to `/{locale}/admissions` (hub).                                                                                                                                                                                                                                                      |           |
| 23.17 | Loading state                         | Spinner shown while GET is in flight.                                                                                                                                                                                                                                                                       |           |
| 23.18 | Load error state                      | If GET fails, error message: `t('admissionsSettings.loadError')` ("Failed to load settings").                                                                                                                                                                                                               |           |
| 23.19 | Access restricted to ADMIN_ROLES      | Front office user cannot access this page (route guard blocks).                                                                                                                                                                                                                                             |           |
| 23.20 | Stripe section                        | A separate section or card linking to Stripe management.                                                                                                                                                                                                                                                    |           |

---

## 24. Public Apply — Generic Form

**URL:** `/{locale}/apply`
**API:** `GET /api/v1/public/admissions/form` (No auth), `POST /api/v1/public/admissions/applications` (No auth)
**Translation Namespace:** `admissions`

| #     | What to Check               | Expected Result                                                                                                                                                                                                                           | Pass/Fail |
| ----- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 24.1  | Page loads — form available | Network tab shows `GET /api/v1/public/admissions/form` (no auth token) returning 200. Form renders with title from `form.name`.                                                                                                           |           |
| 24.2  | Page loads — no form        | If no published form exists, message `t('noAdmissionFormIsCurrently')` ("No admission form is currently available") appears. No form fields rendered.                                                                                     |           |
| 24.3  | Student name fields         | Two inputs: First name (required, marked with _) and Last name (required, marked with _).                                                                                                                                                 |           |
| 24.4  | Date of birth field         | Date input with `dir="ltr"`. Optional field.                                                                                                                                                                                              |           |
| 24.5  | Dynamic form fields         | Form fields from the published form definition render via DynamicFormRenderer. All field types supported.                                                                                                                                 |           |
| 24.6  | Consent section             | Section titled `t('consentTitle')` with description. Checkboxes: Health data, WhatsApp channel. AI features sub-section with 4 checkboxes: AI grading, AI comments, AI risk detection, AI progress summary. Each has a description label. |           |
| 24.7  | Honeypot field              | A hidden input `website_url` exists at position `absolute -start-[9999px] opacity-0`. It must NOT be visible to real users.                                                                                                               |           |
| 24.8  | Submit — requires auth      | Click "Submit Application". If not authenticated, a toast appears: `t('loginToSubmit')` ("You must be logged in to submit"). Browser redirects to `/{locale}/login?returnTo=<encoded_current_path>`.                                      |           |
| 24.9  | Submit — authenticated      | Log in as parent, return to form. Fill required fields. Click "Submit". POST fires: `POST /api/v1/public/admissions/applications` followed by `POST /api/v1/parent/applications/{id}/submit`.                                             |           |
| 24.10 | Submit — success            | Page transitions to success state: checkmark icon, title `t('applicationSubmitted')`, message `t('yourApplicationHasBeenReceived')`.                                                                                                      |           |
| 24.11 | Submit — validation failure | Submit with empty student name → toast with validation error. No API call fires.                                                                                                                                                          |           |
| 24.12 | Honeypot — bot detection    | If `website_url` field is filled (by a bot), form silently returns without making any API call. No error shown.                                                                                                                           |           |
| 24.13 | Loading state               | Skeleton placeholders during initial form fetch.                                                                                                                                                                                          |           |

---

## 25. Public Apply — Tenant-Specific Form (Mode Picker)

**URL:** `/{locale}/apply/{tenantSlug}`
**API:** `GET /api/v1/public/tenants/by-slug/{tenantSlug}`, `GET /api/v1/public/admissions/form`
**Translation Namespace:** `publicApplyForm`

| #     | What to Check                      | Expected Result                                                                                                                                                                           | Pass/Fail |
| ----- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 25.1  | Page loads — tenant found          | Network tab shows `GET /api/v1/public/tenants/by-slug/{tenantSlug}` returning 200. Tenant header renders with logo (or initials badge) and display name.                                  |           |
| 25.2  | Page loads — tenant not found      | For invalid slug, API returns 404. Page shows error: `t('schoolNotFoundTitle')` and `t('schoolNotFoundBody')`.                                                                            |           |
| 25.3  | Form fetch — success               | After tenant loads, `GET /api/v1/public/admissions/form` fires with `X-Tenant-Slug` header. Form definition loads.                                                                        |           |
| 25.4  | Form fetch — no form               | If no published form, page shows: `t('formUnavailableTitle')` and `t('formUnavailableBody')`.                                                                                             |           |
| 25.5  | Tenant header — logo               | If tenant has a logo_url, image renders (presigned S3 URL). If no logo, initials badge shows (14×14px).                                                                                   |           |
| 25.6  | Tenant header — display name       | Tenant `display_name` shown (or `display_name_ar` if `locale === 'ar'`).                                                                                                                  |           |
| 25.7  | Eyebrow text                       | Text "Admissions" (or translated) appears above the tenant name.                                                                                                                          |           |
| 25.8  | Mode picker renders                | Two clickable cards appear: "Apply as new family" and "Add to existing family". Each has title (`t('modePickerOptionNewLabel')` / `t('modePickerOptionExistingLabel')`) and description.  |           |
| 25.9  | New family card — click            | Click "Apply as new family". Mode switches to `new_family`. Full household form renders (Section 26).                                                                                     |           |
| 25.10 | Existing family card — click       | Click "Add to existing family". Mode switches to `lookup`. Household lookup form renders (Section 27).                                                                                    |           |
| 25.11 | Draft persistence — sessionStorage | After selecting a mode, check `sessionStorage.getItem('public-apply-draft-{tenantSlug}')`. It should contain a JSON object with `{ mode, students, householdValues, existingHousehold }`. |           |
| 25.12 | Draft restoration — reload page    | Select a mode, add student data. Reload the page. The form should restore from the draft: mode, student data, household values.                                                           |           |
| 25.13 | Support footer                     | If tenant has `support_email` or `support_phone`, a footer section renders with contact info (email link, phone link).                                                                    |           |

---

## 26. Public Apply — Tenant-Specific Form (New Family)

**URL:** `/{locale}/apply/{tenantSlug}` (mode: new_family)

| #     | What to Check                        | Expected Result                                                                                                                                                                                                                                   | Pass/Fail |
| ----- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 26.1  | Back button                          | "Back to mode picker" button visible. Click → returns to mode picker view.                                                                                                                                                                        |           |
| 26.2  | Parent 1 section                     | Section header "Parent 1" (or translated). Fields: First name (required), Last name (required), Email (required, valid email), Phone (required, min 5 chars), Relationship (required).                                                            |           |
| 26.3  | Parent 2 section                     | Section header "Parent 2" (or translated). All fields optional: First name, Last name, Email, Phone, Relationship.                                                                                                                                |           |
| 26.4  | Address section                      | Section header "Address". Fields: Address line 1 (required), Address line 2 (optional), City (required), Country (required, 2-char ISO code select), Postal code (optional).                                                                      |           |
| 26.5  | Emergency contact section            | Section conditionally rendered (if form definition includes emergency fields). Fields: Name, Phone, Relationship — all optional.                                                                                                                  |           |
| 26.6  | Students section                     | StudentsSection component renders with at least 1 student block. (Full testing in Section 29.)                                                                                                                                                    |           |
| 26.7  | Honeypot field                       | Hidden `website_url` input present.                                                                                                                                                                                                               |           |
| 26.8  | Privacy notice                       | Privacy notice text appears before the submit button.                                                                                                                                                                                             |           |
| 26.9  | Submit button — singular/plural      | With 1 student: button reads `t('submitButtonSingular')`. With 2+ students: `t('submitButtonPlural')` with count.                                                                                                                                 |           |
| 26.10 | Submit button — disabled until valid | Button disabled until all required household fields AND all student fields are filled.                                                                                                                                                            |           |
| 26.11 | Submit — API call                    | Click submit (valid data). Network tab shows `POST /api/v1/public/admissions/applications` with body: `{ mode: 'new_household', form_definition_id: UUID, students: [...], household_payload: {...}, website_url: '' }`. Header: `X-Tenant-Slug`. |           |
| 26.12 | Submit — success redirect            | On 200 response, browser navigates to `/{locale}/apply/{tenantSlug}/submitted?batch={submission_batch_id}`. Batch results stored in sessionStorage.                                                                                               |           |
| 26.13 | Submit — rate limit (429)            | If rate limited, toast: `t('rateLimitError')` ("Too many submissions"). No redirect.                                                                                                                                                              |           |
| 26.14 | Submit — generic error               | On non-429 error, toast shows generic error message. Form stays open for retry.                                                                                                                                                                   |           |
| 26.15 | Honeypot detection                   | If `website_url` is filled, form silently returns. No API call.                                                                                                                                                                                   |           |
| 26.16 | Draft cleared on success             | After successful submit, sessionStorage `public-apply-draft-{tenantSlug}` is cleared.                                                                                                                                                             |           |
| 26.17 | Field sections from form definition  | The sections (Parent 1, Parent 2, Address, Emergency) are driven by the form definition's field groups, not hardcoded. If the form definition omits a section, it doesn't render.                                                                 |           |

---

## 27. Public Apply — Tenant-Specific Form (Existing Family Lookup)

**URL:** `/{locale}/apply/{tenantSlug}` (mode: lookup)

| #     | What to Check                                | Expected Result                                                                                                                                                                                                                                                       | Pass/Fail |
| ----- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 27.1  | Lookup form renders                          | Two inputs: Household number (text, max 6 chars, uppercase transform) and Parent email (email input). "Look up household" button.                                                                                                                                     |           |
| 27.2  | Household number — uppercase                 | Type lowercase characters. Input automatically transforms to uppercase. Max length enforced at 6.                                                                                                                                                                     |           |
| 27.3  | Back button                                  | "Back to mode picker" returns to mode picker.                                                                                                                                                                                                                         |           |
| 27.4  | Lookup — click                               | Fill household number (e.g., "SGW109") and parent email. Click "Look up household". Network tab shows `POST /api/v1/public/households/lookup` with body `{ tenant_slug, household_number: "SGW109", parent_email: "parent@example.com" }` and `X-Tenant-Slug` header. |           |
| 27.5  | Lookup — success                             | On 200 response with matching household, mode transitions to `existing_family`. Matched household banner appears showing household name and active student count. (Section 28.)                                                                                       |           |
| 27.6  | Lookup — not found (404)                     | If no match (wrong number or wrong email), toast: `t('lookupFailedError')` ("Household not found"). Form stays in lookup mode.                                                                                                                                        |           |
| 27.7  | Lookup — rate limit (429/403)                | If rate limited, toast: `t('lookupRateLimitError')` ("Too many lookup attempts").                                                                                                                                                                                     |           |
| 27.8  | Lookup — both fields required                | Button disabled if either field is empty. Both must be filled.                                                                                                                                                                                                        |           |
| 27.9  | Lookup — loading state                       | During POST, lookup button is disabled and shows "Loading" text.                                                                                                                                                                                                      |           |
| 27.10 | Privacy invariant — timing attack prevention | Both "not found" (wrong number) and "email mismatch" return identical 404 with `HOUSEHOLD_NOT_FOUND`. No information leaks about which field was wrong. Verify by testing: correct number + wrong email vs wrong number + correct email — both show the same error.   |           |

---

## 28. Public Apply — Tenant-Specific Form (Existing Family Submit)

**URL:** `/{locale}/apply/{tenantSlug}` (mode: existing_family)

| #    | What to Check            | Expected Result                                                                                                                                        | Pass/Fail |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 28.1 | Matched household banner | A banner appears showing: `t('matchedBannerTitle')` with household name, `t('matchedBannerCount')` with active student count from the lookup response. |           |
| 28.2 | No household fields      | Parent 1, Parent 2, Address, and Emergency sections are NOT rendered. Only the Students section appears (household already exists).                    |           |
| 28.3 | Students section         | StudentsSection renders for adding new students to the existing household.                                                                             |           |
| 28.4 | Submit — API call        | Click submit. POST body includes `{ mode: 'existing_household', existing_household_id: UUID, students: [...] }`. NO `household_payload` field.         |           |
| 28.5 | Submit — success         | Same redirect to submitted page. Batch results stored.                                                                                                 |           |
| 28.6 | Back button              | "Back to mode picker" returns to mode picker (clears existing household state).                                                                        |           |
| 28.7 | Student subtitle text    | Subtitle text uses `t('studentsExistingSubtitle')` (different from new family subtitle).                                                               |           |

---

## 29. Public Apply — Students Section Component

| #     | What to Check                        | Expected Result                                                                                                                                                                                                                                                                                                                               | Pass/Fail |
| ----- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 29.1  | Initial state — 1 student            | One student block renders with heading "Student 1".                                                                                                                                                                                                                                                                                           |           |
| 29.2  | Student fields — all present         | Each student block has: First name (required _), Middle name (optional), Last name (required _), Date of birth (date input, LTR, required), Gender (select: male/female, required), National ID (text, LTR, required), Academic year (select dropdown, required), Year group (select dropdown, required), Medical notes (textarea, optional). |           |
| 29.3  | Add student button                   | "Add student" button (Plus icon, outline) at bottom. Click → new student block appears as "Student 2".                                                                                                                                                                                                                                        |           |
| 29.4  | Max students                         | Up to 20 students can be added (Zod schema `max(20)`). The 21st add should be blocked or button disabled.                                                                                                                                                                                                                                     |           |
| 29.5  | Remove student button                | Each student block (when >1 exists) shows a remove button (trash icon). Click → that student block is removed.                                                                                                                                                                                                                                |           |
| 29.6  | Remove button — disabled when only 1 | When only 1 student exists, the remove button is disabled or hidden.                                                                                                                                                                                                                                                                          |           |
| 29.7  | Student heading — indexed            | Headings update dynamically: "Student 1", "Student 2", etc. After removing student 2 of 3, remaining students re-index to "Student 1" and "Student 2".                                                                                                                                                                                        |           |
| 29.8  | Academic year dropdown               | Options come from the form definition's academic year list. Each option shows the year name.                                                                                                                                                                                                                                                  |           |
| 29.9  | Year group dropdown                  | Options come from the form definition's year group list. Each option shows the year group name.                                                                                                                                                                                                                                               |           |
| 29.10 | Gender select                        | Two options: "Male" and "Female" (translated).                                                                                                                                                                                                                                                                                                |           |
| 29.11 | Date of birth — LTR                  | Date input always renders with `dir="ltr"` regardless of page direction.                                                                                                                                                                                                                                                                      |           |
| 29.12 | National ID — LTR                    | National ID input renders with `dir="ltr"`.                                                                                                                                                                                                                                                                                                   |           |
| 29.13 | Medical notes — optional             | Textarea with rows=2. No required marker.                                                                                                                                                                                                                                                                                                     |           |

---

## 30. Public Apply — Submitted Confirmation

**URL:** `/{locale}/apply/{tenantSlug}/submitted?batch={batchId}`
**Translation Namespace:** `publicApplyForm`

| #     | What to Check                  | Expected Result                                                                                                                                                                       | Pass/Fail |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 30.1  | Page renders success state     | Success checkmark icon in green circle. Title: `t('submittedTitle')` (singular) or `t('submittedTitlePlural')` (if multiple applications).                                            |           |
| 30.2  | Subtitle text                  | Body text: `t('submittedBody')`.                                                                                                                                                      |           |
| 30.3  | Household number — conditional | If submission was for existing_household mode or new household was created, the household number appears in a monospace, LTR, semibold box with label `t('submittedHouseholdLabel')`. |           |
| 30.4  | Applications list              | Each submitted application shows: student name (first + last), application number (monospace, tertiary), status badge (e.g., "Ready to admit" or "Waiting list").                     |           |
| 30.5  | Status labels — correct        | Status badges map: ready_to_admit → "Ready to admit", waiting_list → "Waiting list", awaiting_year_setup → "Awaiting year setup", submitted → "Submitted".                            |           |
| 30.6  | Next steps text                | Text: `t('submittedNextSteps')` explaining what happens next.                                                                                                                         |           |
| 30.7  | Support footer                 | If tenant has support_email/phone, contact info appears at the bottom.                                                                                                                |           |
| 30.8  | SessionStorage — batch data    | Page reads from `sessionStorage.getItem('public-apply-draft-{tenantSlug}-batch')`. If `batchId` matches `submission_batch_id`, it displays the stored results.                        |           |
| 30.9  | Legacy fallback — ref param    | If no batch data found but `?ref=` query param exists, shows a single reference number display instead of the batch list.                                                             |           |
| 30.10 | Tenant fetch                   | Network tab shows `GET /api/v1/public/tenants/by-slug/{tenantSlug}` for the support footer data.                                                                                      |           |

---

## 31. Public Apply — Payment Success (Tenant)

**URL:** `/{locale}/apply/{tenantSlug}/payment-success`
**Translation Namespace:** `publicApplyForm`

| #    | What to Check    | Expected Result                                                                                               | Pass/Fail |
| ---- | ---------------- | ------------------------------------------------------------------------------------------------------------- | --------- |
| 31.1 | Page renders     | Success checkmark icon in emerald circle. Title: `t('paymentSuccessTitle')`. Body: `t('paymentSuccessBody')`. |           |
| 31.2 | Followup message | Text: `t('paymentSuccessFollowup')` explaining next steps after payment.                                      |           |
| 31.3 | Support footer   | If tenant has contact info, it renders.                                                                       |           |
| 31.4 | Tenant fetch     | `GET /api/v1/public/tenants/by-slug/{tenantSlug}` fires for tenant display info.                              |           |
| 31.5 | No auth required | Page is public — no authentication needed.                                                                    |           |

---

## 32. Public Apply — Payment Cancelled (Tenant)

**URL:** `/{locale}/apply/{tenantSlug}/payment-cancelled`
**Translation Namespace:** `publicApplyForm`

| #    | What to Check    | Expected Result                                                                                             | Pass/Fail |
| ---- | ---------------- | ----------------------------------------------------------------------------------------------------------- | --------- |
| 32.1 | Page renders     | AlertCircle icon in warning circle. Title: `t('paymentCancelledTitle')`. Body: `t('paymentCancelledBody')`. |           |
| 32.2 | Followup message | Text: `t('paymentCancelledFollowup')` guiding parent on retrying.                                           |           |
| 32.3 | Support footer   | Tenant contact info if available.                                                                           |           |
| 32.4 | No auth required | Public page.                                                                                                |           |

---

## 33. Public Apply — Payment Success (Root)

**URL:** `/{locale}/apply/payment-success?application={id}`
**Translation Namespace:** `paymentResult`

| #    | What to Check         | Expected Result                                                                                                                                 | Pass/Fail |
| ---- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 33.1 | Page renders          | CheckCircle2 icon in emerald-100 background. Title: `t('successTitle')`. Body: `t('successBody')`.                                              |           |
| 33.2 | Application reference | If `?application=` query param present, shows reference box with first 8 characters of the ID (uppercased). Label: `t('applicationReference')`. |           |
| 33.3 | No application param  | If no query param, reference box is NOT rendered.                                                                                               |           |
| 33.4 | Next steps            | Text: `t('successNextSteps')`.                                                                                                                  |           |
| 33.5 | No auth required      | Public page.                                                                                                                                    |           |

---

## 34. Public Apply — Payment Cancelled (Root)

**URL:** `/{locale}/apply/payment-cancelled?application={id}`
**Translation Namespace:** `paymentResult`

| #    | What to Check         | Expected Result                                                                                       | Pass/Fail |
| ---- | --------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| 34.1 | Page renders          | AlertTriangle icon in amber-100 background. Title: `t('cancelledTitle')`. Body: `t('cancelledBody')`. |           |
| 34.2 | Application reference | If `?application=` param present, shows reference with first 8 chars uppercased.                      |           |
| 34.3 | Help text             | Text: `t('cancelledHelp')` with guidance.                                                             |           |
| 34.4 | No auth required      | Public page.                                                                                          |           |

---

## 35. Queue Components — ApplicationRow

| #    | What to Check                  | Expected Result                                                                                               | Pass/Fail |
| ---- | ------------------------------ | ------------------------------------------------------------------------------------------------------------- | --------- |
| 35.1 | Application number — monospace | Application number renders in `font-mono text-xs text-text-secondary`.                                        |           |
| 35.2 | Student name — bold            | Student name renders in `text-base font-semibold text-text-primary`.                                          |           |
| 35.3 | Sibling badge                  | If `is_sibling_application = true`, a sky-colored badge with "Sibling" text appears next to the student name. |           |
| 35.4 | Age display                    | Age calculated from DOB: `computeAge(dob)` shows years. If DOB not available, shows "Unknown".                |           |
| 35.5 | FIFO position                  | Position number displayed (e.g., "#1", "#2") indicating queue order.                                          |           |
| 35.6 | Parent name                    | Parent name rendered with `truncate` overflow handling.                                                       |           |
| 35.7 | Parent contact — LTR           | Email or phone shown in `text-xs text-text-secondary` with `dir="ltr"` (always left-to-right).                |           |
| 35.8 | Applied date — relative        | Shows applied date + relative days: "today", "1 day ago", "N days ago".                                       |           |
| 35.9 | Action buttons slot            | Action buttons (passed as `actions` prop) render in the last column.                                          |           |

---

## 36. Queue Components — CapacityChip

| #    | What to Check         | Expected Result                                                                                | Pass/Fail |
| ---- | --------------------- | ---------------------------------------------------------------------------------------------- | --------- |
| 36.1 | Renders inline badge  | Shows as compact inline badge with capacity info.                                              |           |
| 36.2 | Content format        | Text: "Year Group · enrolled/total · N conditional · M free".                                  |           |
| 36.3 | Green — 3+ available  | If available_seats ≥ 3, chip background is green.                                              |           |
| 36.4 | Amber — 1-2 available | If available_seats is 1 or 2, chip background is amber/yellow.                                 |           |
| 36.5 | Red — 0 available     | If available_seats = 0, chip background is red.                                                |           |
| 36.6 | Not configured        | If no classes exist for the year group (`configured = false`), shows "Not configured" message. |           |

---

## 37. Queue Components — QueueHeader

| #    | What to Check    | Expected Result                                                                             | Pass/Fail |
| ---- | ---------------- | ------------------------------------------------------------------------------------------- | --------- |
| 37.1 | Back button      | "Back" button with left arrow navigates to `/{locale}/admissions`.                          |           |
| 37.2 | Title            | Queue title renders in heading style.                                                       |           |
| 37.3 | Count badge      | If `count` prop provided, shows numeric badge next to or below the title with `countLabel`. |           |
| 37.4 | Description      | If `description` prop provided, renders below the title.                                    |           |
| 37.5 | Optional badges  | If `badges` prop provided, renders badges row below description.                            |           |
| 37.6 | Optional actions | If `actions` prop provided, renders action buttons row.                                     |           |

---

## 38. Queue Components — PaymentRecordModal

| #     | What to Check                    | Expected Result                                                                                                                                  | Pass/Fail |
| ----- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 38.1  | Modal opens with title           | Title: `t('paymentModal.title')`. Description includes expected amount: `t('paymentModal.description', { amount })`.                             |           |
| 38.2  | Three tabs                       | Tab bar with: "Cash", "Bank", "Stripe". Default: Cash tab.                                                                                       |           |
| 38.3  | Cash tab — fields                | Amount (number, pre-filled with expected), Receipt number (text, optional), Notes (textarea, 2 rows, optional). Submit button.                   |           |
| 38.4  | Cash tab — submit                | Fill valid amount. Click submit. `POST /api/v1/applications/{id}/payment/cash` with `{ amount_cents, receipt_number?, notes? }`.                 |           |
| 38.5  | Cash tab — amount below expected | Enter amount < expected. Error toast: `t('paymentModal.errorBelowExpected')`. No API call.                                                       |           |
| 38.6  | Cash tab — success               | Toast: `t('paymentModal.successCash')`. Modal closes. Queue refreshes.                                                                           |           |
| 38.7  | Bank tab — fields                | Amount (number), Transfer reference (text, required), Transfer date (date picker, defaults to today), Notes (textarea, optional). Submit button. |           |
| 38.8  | Bank tab — reference required    | Submit without reference → error: `t('paymentModal.errorReferenceRequired')`.                                                                    |           |
| 38.9  | Bank tab — submit                | `POST /api/v1/applications/{id}/payment/bank-transfer` with `{ amount_cents, transfer_reference, transfer_date, notes? }`.                       |           |
| 38.10 | Bank tab — success               | Toast: `t('paymentModal.successBank')`. Modal closes.                                                                                            |           |
| 38.11 | Stripe tab — read-only           | No input fields. Text: `t('paymentModal.stripeDescription')` ("Payments recorded via Stripe are shown in the Payment tab"). Close button only.   |           |
| 38.12 | Generic error                    | On API failure, toast: `t('paymentModal.errorGeneric')`. Modal stays open.                                                                       |           |

---

## 39. Queue Components — ForceApproveModal (Queue)

| #    | What to Check                         | Expected Result                                                                                 | Pass/Fail |
| ---- | ------------------------------------- | ----------------------------------------------------------------------------------------------- | --------- |
| 39.1 | Modal opens                           | Title: `t('forceApproveModal.title')`. Description with expected amount.                        |           |
| 39.2 | Override type select                  | 3 options: Full waiver (`t('forceApproveModal.fullWaiver')`), Partial waiver, Deferred payment. |           |
| 39.3 | Collected amount input                | Number input, step 0.01, min 0.                                                                 |           |
| 39.4 | Justification textarea                | Rows 4, maxLength 2000, placeholder, min-length hint.                                           |           |
| 39.5 | Validation — justification < 20 chars | Error: `t('forceApproveModal.errorTooShort')`.                                                  |           |
| 39.6 | Submit                                | `POST /api/v1/applications/{id}/payment/override` with override data.                           |           |
| 39.7 | Success                               | Toast: `t('forceApproveModal.success')`. Modal closes. Queue refreshes.                         |           |

---

## 40. Queue Components — RejectDialog (Queue)

| #    | What to Check               | Expected Result                                                                                               | Pass/Fail |
| ---- | --------------------------- | ------------------------------------------------------------------------------------------------------------- | --------- |
| 40.1 | Dialog opens                | Title: `t('rejectDialog.title')`. Description text.                                                           |           |
| 40.2 | Reason textarea             | Rows 4, maxLength 2000, placeholder: `t('rejectDialog.placeholder')`. Min-length hint shown.                  |           |
| 40.3 | Validation — < 10 chars     | Error: `t('rejectDialog.errorTooShort')`.                                                                     |           |
| 40.4 | Cancel                      | Dialog closes. No API call.                                                                                   |           |
| 40.5 | Submit                      | `POST /api/v1/applications/{id}/review` with `{ status: 'rejected', rejection_reason, expected_updated_at }`. |           |
| 40.6 | Success                     | Toast: `t('rejectDialog.success')`. Dialog closes. Queue refreshes (application removed).                     |           |
| 40.7 | Error                       | Toast: `t('rejectDialog.errorGeneric')`. Dialog stays open.                                                   |           |
| 40.8 | Button states during submit | Reject button: "Working..." + disabled. Cancel: disabled.                                                     |           |

---

## 41. Queue Components — ManualPromote Dialog

| #    | What to Check               | Expected Result                                                                                                    | Pass/Fail |
| ---- | --------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------- |
| 41.1 | Dialog opens                | Title: `t('manualPromoteDialog.title')`. Description text.                                                         |           |
| 41.2 | Justification textarea      | Rows 4, maxLength 2000, placeholder: `t('manualPromoteDialog.placeholder')`. Min hint.                             |           |
| 41.3 | Validation — < 10 chars     | Error: `t('manualPromoteDialog.errorTooShort')`.                                                                   |           |
| 41.4 | Cancel                      | Dialog closes. No API call.                                                                                        |           |
| 41.5 | Submit                      | `POST /api/v1/applications/{id}/manual-promote` with `{ justification }`.                                          |           |
| 41.6 | Success                     | Toast: `t('manualPromoteDialog.success')`. Dialog closes. Application moves to ready_to_admit queue.               |           |
| 41.7 | Error — capacity exhausted  | If capacity = 0, backend returns 409 with `CAPACITY_EXHAUSTED`. Error toast. Dialog stays open.                    |           |
| 41.8 | Error — awaiting year setup | If application is in `awaiting_year_setup` substatus, backend returns 400 with `AWAITING_YEAR_SETUP`. Error toast. |           |

---

## 42. State Machine — Full Transition Graph

| #     | What to Check                              | Expected Result                                                                                                              | Pass/Fail |
| ----- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------- |
| 42.1  | submitted → ready_to_admit                 | Automatic routing on submission when capacity available. Application appears in ready-to-admit queue.                        |           |
| 42.2  | submitted → waiting_list                   | Automatic routing when capacity exhausted. Application appears in waiting list.                                              |           |
| 42.3  | waiting_list → ready_to_admit              | Via manual promote or auto-promotion. Application moves to ready-to-admit.                                                   |           |
| 42.4  | ready_to_admit → conditional_approval      | Via admin "Move to conditional approval" action. Payment fields set. Payment link job enqueued.                              |           |
| 42.5  | conditional_approval → approved            | Via Stripe webhook, cash payment, bank transfer, or force-approve override. Student materialized.                            |           |
| 42.6  | conditional_approval → waiting_list        | Via payment expiry cron (payment deadline passed). Payment fields cleared. Seat released.                                    |           |
| 42.7  | conditional_approval → rejected            | Via admin reject action. Seat released. Auto-promotion triggered.                                                            |           |
| 42.8  | conditional_approval → withdrawn           | Via admin or parent withdraw. Seat released. Auto-promotion triggered.                                                       |           |
| 42.9  | waiting_list → rejected                    | Via admin reject action from waiting list.                                                                                   |           |
| 42.10 | waiting_list → withdrawn                   | Via admin or parent withdraw from waiting list.                                                                              |           |
| 42.11 | ready_to_admit → rejected                  | Via admin reject from ready-to-admit queue.                                                                                  |           |
| 42.12 | ready_to_admit → withdrawn                 | Via admin or parent withdraw.                                                                                                |           |
| 42.13 | approved → (terminal)                      | No further transitions possible. Only action: view student profile.                                                          |           |
| 42.14 | rejected → (terminal)                      | No further transitions. Application archived.                                                                                |           |
| 42.15 | withdrawn → (terminal)                     | No further transitions.                                                                                                      |           |
| 42.16 | Invalid transition — ready_to_admit target | `POST /review` with `status: 'ready_to_admit'` returns 400 `INVALID_STATUS_TRANSITION` — this state is not admin-actionable. |           |
| 42.17 | Invalid transition — approved target       | `POST /review` with `status: 'approved'` returns 400 `INVALID_STATUS_TRANSITION` — must go through payment/override path.    |           |

---

## 43. End-to-End Flow — New Family Application

| #    | What to Check                 | Expected Result                                                                                                                                                  | Pass/Fail |
| ---- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 43.1 | Parent opens public form      | Navigate to `/{locale}/apply/{tenantSlug}`. Mode picker loads.                                                                                                   |           |
| 43.2 | Select "Apply as new family"  | Full household form appears with parent, address, students sections.                                                                                             |           |
| 43.3 | Fill all required fields      | Parent 1 fields, address, at least 1 student with all required fields.                                                                                           |           |
| 43.4 | Submit                        | POST fires with `mode: 'new_household'`. Returns 200 with `submission_batch_id` and application list.                                                            |           |
| 43.5 | Redirect to submitted page    | Browser navigates to `/submitted?batch={id}`. Success confirmation shows with application numbers and statuses.                                                  |           |
| 43.6 | Admin sees applications       | Log in as admin. Navigate to admissions hub. Counts updated. New applications appear in the appropriate queue (ready-to-admit if capacity, waiting-list if not). |           |
| 43.7 | Application detail accessible | Navigate to one of the new applications. All form data visible in Application tab. Timeline shows "submitted" event.                                             |           |
| 43.8 | Household created             | Household number appears in application detail. Household link works.                                                                                            |           |

---

## 44. End-to-End Flow — Existing Family Application

| #    | What to Check                        | Expected Result                                                                                                    | Pass/Fail |
| ---- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------- |
| 44.1 | Select "Add to existing family"      | Lookup form appears.                                                                                               |           |
| 44.2 | Enter valid household number + email | E.g., "SGW109" + matching parent email. Click lookup.                                                              |           |
| 44.3 | Household found                      | Mode transitions to existing_family. Banner shows household name and student count. Only students section visible. |           |
| 44.4 | Add students and submit              | POST with `mode: 'existing_household'`, `existing_household_id`.                                                   |           |
| 44.5 | Success + household linked           | Applications created with existing household. Student numbers derive from household number (e.g., SGW109-03).      |           |
| 44.6 | Admin verification                   | Applications appear in admin queues with household number linked.                                                  |           |

---

## 45. End-to-End Flow — Stripe Payment Completion

| #    | What to Check                    | Expected Result                                                                                                                       | Pass/Fail |
| ---- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 45.1 | Admin approves to conditional    | From ready-to-admit, move to conditional approval. Payment amount and deadline set. BullMQ job enqueued for payment link.             |           |
| 45.2 | Payment link generated           | Copy payment link from conditional approval queue. Stripe checkout URL obtained.                                                      |           |
| 45.3 | Parent completes Stripe checkout | Open the checkout URL. Complete payment with test card (4242424242424242).                                                            |           |
| 45.4 | Stripe webhook fires             | `checkout.session.completed` webhook fires. Network: `POST /api/v1/webhooks/stripe` returns 200.                                      |           |
| 45.5 | Application approved             | Application status transitions to approved. Student materialized. Household fee assignment, invoice, payment, and allocation created. |           |
| 45.6 | Parent redirected                | Parent lands on payment-success page showing confirmation.                                                                            |           |
| 45.7 | Admin sees in approved queue     | Refresh approved queue. New entry with student number, household link, class info.                                                    |           |
| 45.8 | Financial records created        | In finance module: invoice exists with payment allocated. Household balance reflects the payment.                                     |           |

---

## 46. End-to-End Flow — Cash Payment Approval

| #    | What to Check                | Expected Result                                                                               | Pass/Fail |
| ---- | ---------------------------- | --------------------------------------------------------------------------------------------- | --------- |
| 46.1 | Prerequisites                | Application in conditional_approval. Tenant has `allow_cash = true`.                          |           |
| 46.2 | Record cash from detail page | Open application detail → "Record cash" → fill amount ≥ expected → submit.                    |           |
| 46.3 | Application approved         | Status changes to approved. Student materialized. Financial records created.                  |           |
| 46.4 | Toast confirmation           | "Cash payment recorded. Application approved."                                                |           |
| 46.5 | Audit trail                  | Timeline shows payment_event. Application note records cash details (amount, receipt number). |           |

---

## 47. End-to-End Flow — Force Approve Override

| #    | What to Check            | Expected Result                                                                     | Pass/Fail |
| ---- | ------------------------ | ----------------------------------------------------------------------------------- | --------- |
| 47.1 | Prerequisites            | Application in conditional_approval. User is school_owner.                          |           |
| 47.2 | Open force approve modal | From detail page or queue → "Force Approve".                                        |           |
| 47.3 | Fill override details    | Select "Full waiver", collected amount = 0, justification (20+ chars). Submit.      |           |
| 47.4 | Application approved     | Status changes to approved. Student materialized. AdmissionOverride record created. |           |
| 47.5 | Override in timeline     | Timeline shows override_granted event with details.                                 |           |
| 47.6 | Override in payment tab  | Payment tab shows the admin override section with all fields.                       |           |
| 47.7 | Override audit           | Override appears in overrides list (when the overrides page exists).                |           |

---

## 48. End-to-End Flow — Payment Expiry & Revert

| #    | What to Check            | Expected Result                                                                                                    | Pass/Fail |
| ---- | ------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------- |
| 48.1 | Prerequisites            | Application in conditional_approval with `payment_deadline` in the past.                                           |           |
| 48.2 | Cron fires               | The `admissions:payment-expiry` cron runs every 15 minutes. It finds expired applications.                         |           |
| 48.3 | Application reverted     | Application status reverts from conditional_approval → waiting_list. Payment fields cleared.                       |           |
| 48.4 | Seat released            | Capacity count shows seat is now free.                                                                             |           |
| 48.5 | Auto-promotion triggered | If waiting_list applications exist for that year group, the next FIFO application auto-promotes to ready_to_admit. |           |
| 48.6 | Internal note            | Application note records: "Payment deadline expired — reverted to waiting list." Attributed to original approver.  |           |
| 48.7 | Notification sent        | `notifications:admissions-payment-expired` job enqueued.                                                           |           |

---

## 49. End-to-End Flow — Manual Promotion from Waiting List

| #    | What to Check                 | Expected Result                                                                                              | Pass/Fail |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------------------------ | --------- |
| 49.1 | Prerequisites                 | Application in waiting_list. Year group has available seats.                                                 |           |
| 49.2 | Click Manual Promote          | From waiting list queue → "Manual Promote" → enter justification (10+ chars) → submit.                       |           |
| 49.3 | Application promoted          | Status changes from waiting_list → ready_to_admit. Application appears in ready-to-admit queue.              |           |
| 49.4 | Audit trail                   | Timeline note: "Manually promoted to ready-to-admit. Justification: <text>."                                 |           |
| 49.5 | Capacity exhausted — blocked  | If no seats, POST returns 409 `CAPACITY_EXHAUSTED`. Application stays in waiting list.                       |           |
| 49.6 | Awaiting year setup — blocked | If application has `waiting_list_substatus = 'awaiting_year_setup'`, POST returns 400 `AWAITING_YEAR_SETUP`. |           |

---

## 50. End-to-End Flow — Application Rejection

| #    | What to Check                   | Expected Result                                                                                       | Pass/Fail |
| ---- | ------------------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| 50.1 | From ready_to_admit             | Reject → enter reason (10+ chars) → submit. Status → rejected.                                        |           |
| 50.2 | From conditional_approval       | Reject → enter reason → submit. Status → rejected. Seat released. Auto-promotion fires if applicable. |           |
| 50.3 | From waiting_list               | Reject → enter reason → submit. Status → rejected.                                                    |           |
| 50.4 | Rejection reason required       | Empty reason → 400 `REJECTION_REASON_REQUIRED`.                                                       |           |
| 50.5 | Rejected application in archive | Rejected application appears in the rejected archive page with reason displayed.                      |           |

---

## 51. End-to-End Flow — Application Withdrawal

| #    | What to Check                             | Expected Result                                                 | Pass/Fail |
| ---- | ----------------------------------------- | --------------------------------------------------------------- | --------- |
| 51.1 | Admin withdrawal                          | From any active status → "Withdraw" → POST. Status → withdrawn. |           |
| 51.2 | From conditional_approval — seat released | Withdrawal releases the conditional hold. Auto-promotion fires. |           |
| 51.3 | Toast                                     | "Application withdrawn" confirmation.                           |           |
| 51.4 | Withdrawn not in queues                   | Withdrawn applications do not appear in any active queue page.  |           |

---

## 52. Permission & Role Guard Tests

| #     | What to Check                           | Expected Result                                                                                                                | Pass/Fail |
| ----- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 52.1  | Admin can access all pages              | All 10 staff-facing pages load successfully for admin role.                                                                    |           |
| 52.2  | Front office — 4 queue pages accessible | front_office can access: ready-to-admit, conditional-approval, waiting-list, approved.                                         |           |
| 52.3  | Front office — 4 admin pages blocked    | front_office CANNOT access: rejected, form-preview, overrides, settings. Route guard redirects or blocks.                      |           |
| 52.4  | Teacher — all admissions blocked        | Teacher role navigating to any `/admissions/*` URL is blocked. Route-roles.ts does not include 'teacher' in admissions prefix. |           |
| 52.5  | Parent — all admin admissions blocked   | Parent role cannot access any staff-facing admissions page.                                                                    |           |
| 52.6  | admissions.view permission              | Users without `admissions.view` permission get 403 on all GET queue endpoints.                                                 |           |
| 52.7  | admissions.manage permission            | Users without `admissions.manage` permission get 403 on POST review/withdraw/notes/promote/payment endpoints.                  |           |
| 52.8  | Force approve — role check              | Non-owner/non-principal calling `POST /payment/override` gets 403 `OVERRIDE_ROLE_REQUIRED`.                                    |           |
| 52.9  | settings.manage permission              | Users without `settings.manage` cannot access GET/PATCH settings/admissions.                                                   |           |
| 52.10 | stripe.manage permission                | Users without `stripe.manage` cannot access GET/PUT stripe-config.                                                             |           |
| 52.11 | Parent withdrawal — ownership check     | Parent A cannot withdraw Parent B's application. Returns 400 `NOT_APPLICATION_OWNER`.                                          |           |
| 52.12 | RLS isolation — cross-tenant            | Admin of Tenant A cannot see applications from Tenant B. GET /{id} returns 404 for cross-tenant IDs.                           |           |
| 52.13 | Public endpoints — no auth              | `/v1/public/admissions/form` and `/v1/public/admissions/applications` work without auth tokens.                                |           |
| 52.14 | Rate limiting — public submissions      | After 3 submissions from the same IP within 1 hour, 4th submission returns 400 `RATE_LIMIT_EXCEEDED`.                          |           |

---

## 53. Arabic / RTL Verification

| #     | What to Check                        | Expected Result                                                                                                                                                                                     | Pass/Fail |
| ----- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 53.1  | Page direction                       | Switch to Arabic (`/ar/admissions`). Page `dir` attribute is `rtl`. All content flows right-to-left.                                                                                                |           |
| 53.2  | Dashboard cards — mirrored           | Card grid flows from right to left. Card icons are on the start (right) side.                                                                                                                       |           |
| 53.3  | Queue tables — text alignment        | Table headers use `text-start` (becomes `text-right` in RTL). Columns align to the right.                                                                                                           |           |
| 53.4  | Search input — icon position         | Search icon positioned at `start-3` (right side in RTL). Input padding `ps-9` (padding-start = padding-right in RTL).                                                                               |           |
| 53.5  | Application row — parent contact LTR | Email addresses and phone numbers wrapped in `dir="ltr"` regardless of page direction. They display left-to-right.                                                                                  |           |
| 53.6  | Date inputs — LTR                    | All date inputs use `dir="ltr"`. Dates display in Gregorian format with Western numerals (0-9).                                                                                                     |           |
| 53.7  | National ID input — LTR              | National ID field uses `dir="ltr"`.                                                                                                                                                                 |           |
| 53.8  | Monospace codes — LTR                | Application numbers, student numbers, household numbers in monospace render left-to-right.                                                                                                          |           |
| 53.9  | Capacity chip — mirrored             | CapacityChip content flows RTL. Numeric values remain Western (0-9).                                                                                                                                |           |
| 53.10 | Pagination — mirrored                | Previous/Next buttons: Previous on the right, Next on the left in RTL.                                                                                                                              |           |
| 53.11 | Modal dialogs — mirrored             | Dialog content flows RTL. Cancel on the right, Submit on the left.                                                                                                                                  |           |
| 53.12 | Translation completeness             | All `t()` translation calls resolve to Arabic text. No English fallbacks visible. Check browser console for missing translation warnings.                                                           |           |
| 53.13 | Form preview QR code — LTR           | QR code image renders identically in both LTR and RTL.                                                                                                                                              |           |
| 53.14 | Public apply form — RTL              | Tenant-specific form: mode picker cards flow RTL. Student section fields flow RTL except LTR-forced inputs (date, phone, email, national ID).                                                       |           |
| 53.15 | Status badges — translated           | All status badges show Arabic text: submitted=مقدم, waiting_list=قائمة الانتظار, ready_to_admit=جاهز للقبول, conditional_approval=قبول مشروط, approved=موافق عليه, rejected=مرفوض, withdrawn=منسحب. |           |
| 53.16 | Logical CSS properties               | Verify no physical directional classes used: no `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`. All should be `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`.                                          |           |
| 53.17 | Back button — arrow direction        | Back buttons use logical direction. Arrow points to the right in RTL (back = towards start).                                                                                                        |           |
| 53.18 | Numerals — Western                   | All numbers display as Western Arabic numerals (0-9), not Eastern Arabic (٠-٩).                                                                                                                     |           |
| 53.19 | Calendar — Gregorian                 | Date pickers and displayed dates use the Gregorian calendar in both locales.                                                                                                                        |           |
| 53.20 | Tenant display name — Arabic         | In Arabic locale, tenant `display_name_ar` is used if available. Falls back to `display_name`.                                                                                                      |           |

---

## 54. Backend Endpoint Map

| #   | Method | Path                                                | Permission        | Exercised In Section(s)          |
| --- | ------ | --------------------------------------------------- | ----------------- | -------------------------------- |
| 1   | GET    | `/api/v1/admissions/dashboard-summary`              | admissions.view   | 2                                |
| 2   | GET    | `/api/v1/applications/queues/ready-to-admit`        | admissions.view   | 3                                |
| 3   | GET    | `/api/v1/applications/queues/conditional-approval`  | admissions.view   | 4                                |
| 4   | GET    | `/api/v1/applications/queues/waiting-list`          | admissions.view   | 5                                |
| 5   | GET    | `/api/v1/applications/queues/approved`              | admissions.view   | 6                                |
| 6   | GET    | `/api/v1/applications/queues/rejected`              | admissions.view   | 7                                |
| 7   | GET    | `/api/v1/applications/{id}`                         | admissions.view   | 8-16                             |
| 8   | GET    | `/api/v1/applications/{id}/preview`                 | admissions.view   | 9                                |
| 9   | POST   | `/api/v1/applications/{id}/review`                  | admissions.manage | 3, 13, 17, 40, 42, 50            |
| 10  | POST   | `/api/v1/applications/{id}/withdraw`                | admissions.manage | 13-15, 51                        |
| 11  | GET    | `/api/v1/applications/{applicationId}/notes`        | admissions.view   | 11                               |
| 12  | POST   | `/api/v1/applications/{applicationId}/notes`        | admissions.manage | 11                               |
| 13  | POST   | `/api/v1/applications/{id}/manual-promote`          | admissions.manage | 41, 49                           |
| 14  | POST   | `/api/v1/applications/{id}/payment-link/regenerate` | admissions.manage | 4, 14, 45                        |
| 15  | POST   | `/api/v1/applications/{id}/payment/cash`            | admissions.manage | 19, 38, 46                       |
| 16  | POST   | `/api/v1/applications/{id}/payment/bank-transfer`   | admissions.manage | 20, 38                           |
| 17  | POST   | `/api/v1/applications/{id}/payment/override`        | admissions.manage | 18, 39, 47                       |
| 18  | GET    | `/api/v1/admission-overrides`                       | admissions.manage | (overrides page — not yet built) |
| 19  | GET    | `/api/v1/applications`                              | admissions.view   | (list all, used internally)      |
| 20  | GET    | `/api/v1/applications/analytics`                    | admissions.view   | 21                               |
| 21  | GET    | `/api/v1/admission-forms/system`                    | admissions.view   | 22                               |
| 22  | POST   | `/api/v1/admission-forms/system/rebuild`            | admissions.manage | 22                               |
| 23  | GET    | `/api/v1/settings/admissions`                       | settings.manage   | 23                               |
| 24  | PATCH  | `/api/v1/settings/admissions`                       | settings.manage   | 23                               |
| 25  | GET    | `/api/v1/stripe-config`                             | stripe.manage     | 23 (link)                        |
| 26  | PUT    | `/api/v1/stripe-config`                             | stripe.manage     | (Stripe settings page)           |
| 27  | GET    | `/api/v1/public/admissions/form`                    | (none — public)   | 24, 25                           |
| 28  | POST   | `/api/v1/public/admissions/applications`            | (none — public)   | 24, 26, 28, 43, 44               |
| 29  | POST   | `/api/v1/public/households/lookup`                  | (none — public)   | 27                               |
| 30  | GET    | `/api/v1/public/tenants/by-slug/{slug}`             | (none — public)   | 25, 30-32                        |
| 31  | GET    | `/api/v1/parent/applications`                       | (auth — parent)   | (parent view)                    |
| 32  | GET    | `/api/v1/parent/applications/{id}`                  | (auth — parent)   | (parent view)                    |
| 33  | POST   | `/api/v1/parent/applications/{id}/withdraw`         | (auth — parent)   | (parent view)                    |
| 34  | POST   | `/api/v1/parent/applications/{id}/submit`           | (auth — parent)   | 24                               |
| 35  | POST   | `/api/v1/webhooks/stripe`                           | (none — Stripe)   | 45                               |

---

## 55. Console & Network Health

| #    | What to Check                 | Expected Result                                                                                                                                                                                                                                                                            | Pass/Fail |
| ---- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| 55.1 | Zero unhandled console errors | While running this entire spec, the browser console should show ZERO red uncaught errors. Yellow warnings may exist but should not indicate functional issues.                                                                                                                             |           |
| 55.2 | No 500 errors from API        | All API responses should be 2xx or expected 4xx (permission tests, validation). No 500s.                                                                                                                                                                                                   |           |
| 55.3 | Expected 4xx responses        | The following 4xx responses are intentional and expected during testing: 400 (validation failures in Sections 17-20, 40-41), 403 (permission tests in Section 52), 404 (not-found tests in 8.11-8.12, lookup failure in 27.6), 409 (capacity exhausted in 3.16, 41.7, stale data in 3.17). |           |
| 55.4 | No CORS errors                | All API requests include proper CORS headers. No CORS-related console errors.                                                                                                                                                                                                              |           |
| 55.5 | No rate limit surprises       | Navigating between pages should not trigger 429 responses. Only public form submission (3+ per hour per IP) triggers rate limiting.                                                                                                                                                        |           |
| 55.6 | Dashboard polling cadence     | The admissions dashboard fires `GET /dashboard-summary` approximately every 60 seconds. No more frequent. Verify in Network tab with timestamp column.                                                                                                                                     |           |
| 55.7 | No duplicate API calls        | Each page should fire its primary GET once on mount, not multiple times. Watch for double-fetching patterns.                                                                                                                                                                               |           |
| 55.8 | Clean navigation              | Navigating between pages should not leave orphaned API calls or stale event listeners.                                                                                                                                                                                                     |           |
| 55.9 | Console error on API failure  | When API calls fail (simulated offline), `[ComponentName]` error logs appear in console (not swallowed).                                                                                                                                                                                   |           |

---

## 56. Observations & Bugs Found During Walkthrough

1. **Overrides page does not exist.** The dashboard has an "Overrides" card linking to `/{locale}/admissions/overrides`, but no `page.tsx` file exists at that path. Clicking it results in a 404. The backend endpoint `GET /api/v1/admission-overrides` exists and returns data, but the frontend page is not built.

2. **Parent applications page does not exist.** The route-roles file references `/applications` with parent access, and the backend has `GET /api/v1/parent/applications`, but there is no corresponding frontend page at `/{locale}/applications` or `/{locale}/admissions/applications` for the parent perspective. Parents cannot currently view their own applications in the UI.

3. **Copy payment link — potential `unwrap()` issue.** The "Copy payment link" button on the conditional approval queue and detail page reads `checkout_url` from the API response. If the ResponseTransformInterceptor wraps the response in `{ data: { checkout_url } }`, the frontend may get `undefined` for the URL. This was identified in a prior session but may not be fully resolved — verify by checking what gets written to clipboard.

4. **Payment tab — hardcoded labels.** The Payment tab in the application detail page uses hardcoded English labels instead of translation keys. This means the Payment tab will not be translated in Arabic locale.

5. **Notes tab — hardcoded labels.** "Add note", "No notes yet.", and some other Notes tab strings are hardcoded rather than using translation keys.

6. **Reports admissions page — mock data.** The `reports/admissions/page.tsx` uses mock/demo data rather than live API data. It is not connected to the real analytics endpoint.

7. **Application detail page — some hardcoded toasts.** Several toast messages are hardcoded in English rather than using the translation system (e.g., "Moved to conditional approval. Payment link will be emailed.", "Application withdrawn", "Note added").

8. **Rate limiting — front_office included.** The `route-roles.ts` includes `front_office` in the admissions prefix, but the dashboard hides admin-only cards from front_office. If a front_office user navigates directly to `/admissions/rejected` via URL, the route guard behavior needs verification.

---

## 57. Sign-Off

| Field                 | Value       |
| --------------------- | ----------- |
| Reviewer Name         |             |
| Review Date           |             |
| Total Checks Executed |             |
| Checks Passed         |             |
| Checks Failed         |             |
| Blockers Found        |             |
| Overall Result        | PASS / FAIL |
| Notes                 |             |
