# Feature Map — School Operating System

> **Purpose**: Complete inventory of every implemented feature, mapped to its code location. This document answers "what does the product do and where does it live?"
> **Maintenance**: Update only when a feature change is confirmed final. This file is intended to be the architecture-level source of truth for product scope.
> **Last verified**: 2026-04-26 (Payroll overhaul rebuild Waves 1–5 shipped — Decimal-safe calculation engine consuming every input source, unified `FinalisationService` powering both direct and approval-callback paths, worker job-name + Redis-key alignment via `@school/shared/payroll`, missing self-service / sub-resource / tenant-wide endpoints, cross-path equivalence guards, RHF + zod migration across operational pages, mobile sweep, dead-code removal. See `payrollnew/IMPLEMENTATION_LOG.md`.)

---

## Quick Reference

| Domain                                                                                             | Backend Module(s)                                                                                                                                                                                                                         | API Endpoints | Frontend Pages | Worker Jobs |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------- | ----------- |
| [Students](#1-students)                                                                            | `modules/students/`                                                                                                                                                                                                                       | 8             | 5              | —           |
| [Staff Profiles](#2-staff-profiles)                                                                | `modules/staff-profiles/`                                                                                                                                                                                                                 | 6             | 4              | —           |
| [Parents](#3-parents)                                                                              | `modules/parents/`                                                                                                                                                                                                                        | 6             | 1              | —           |
| [Households](#4-households)                                                                        | `modules/households/`                                                                                                                                                                                                                     | 17            | 4              | —           |
| [Registration](#5-registration)                                                                    | `modules/registration/`                                                                                                                                                                                                                   | 2             | —              | —           |
| [Academics](#6-academics)                                                                          | `modules/academics/`                                                                                                                                                                                                                      | 21            | 5+             | —           |
| [Classes](#7-classes)                                                                              | `modules/classes/`                                                                                                                                                                                                                        | 16            | 5              | —           |
| [Scheduling & Timetabling](#8-scheduling--timetabling)                                             | `modules/schedules/`, `modules/scheduling/`, `modules/period-grid/`, `modules/class-requirements/`, `modules/staff-availability/`, `modules/staff-preferences/`, `modules/scheduling-runs/`, `modules/school-closures/`, `modules/rooms/` | 128           | 30+            | 3           |
| [Attendance](#9-attendance)                                                                        | `modules/attendance/`                                                                                                                                                                                                                     | 22            | 6              | 4           |
| [Gradebook & Report Cards](#10-gradebook--report-cards)                                            | `modules/gradebook/`                                                                                                                                                                                                                      | 148           | 30+            | 4           |
| [Homework & Diary](#11-homework--diary)                                                            | `modules/homework/`                                                                                                                                                                                                                       | 44            | 12             | —           |
| [Finance](#12-finance)                                                                             | `modules/finance/`                                                                                                                                                                                                                        | 87            | 23             | 2           |
| [Payroll](#13-payroll)                                                                             | `modules/payroll/`                                                                                                                                                                                                                        | 79            | 10             | 3           |
| [Communications & Announcements](#14-communications--announcements)                                | `modules/communications/`                                                                                                                                                                                                                 | 20            | 9              | 7           |
| [Parent Inquiries](#15-parent-inquiries)                                                           | `modules/parent-inquiries/`                                                                                                                                                                                                               | 8             | 3              | 2           |
| [Engagement](#16-engagement)                                                                       | `modules/engagement/`                                                                                                                                                                                                                     | 64            | 22             | 8           |
| [Admissions](#17-admissions)                                                                       | `modules/admissions/`, `modules/public-households/`                                                                                                                                                                                       | 29            | 9              | 1           |
| [Approvals](#18-approvals)                                                                         | `modules/approvals/`                                                                                                                                                                                                                      | 12            | 2              | 1           |
| [Reports & Analytics](#19-reports--analytics)                                                      | `modules/reports/`                                                                                                                                                                                                                        | 95            | 22             | 4           |
| [Website CMS & Public Web](#20-website-cms--public-web)                                            | `modules/website/`                                                                                                                                                                                                                        | 13            | 7              | —           |
| [Search](#21-search)                                                                               | `modules/search/`                                                                                                                                                                                                                         | 1             | —              | 2           |
| [Dashboards](#22-dashboards)                                                                       | `modules/dashboard/`                                                                                                                                                                                                                      | 3             | 3              | —           |
| [Authentication](#23-authentication)                                                               | `modules/auth/`                                                                                                                                                                                                                           | 12            | 5              | —           |
| [RBAC & User Administration](#24-rbac--user-administration)                                        | `modules/rbac/`                                                                                                                                                                                                                           | 16            | 5              | —           |
| [Configuration](#25-configuration)                                                                 | `modules/configuration/`                                                                                                                                                                                                                  | 8             | 5              | —           |
| [Preferences & Profiles](#26-preferences--profiles)                                                | `modules/preferences/`                                                                                                                                                                                                                    | 2             | 2              | —           |
| [Compliance, Privacy & Legal](#27-compliance-privacy--legal)                                       | `modules/compliance/`, `modules/gdpr/`                                                                                                                                                                                                    | 34            | 7              | 3           |
| [Imports](#28-imports)                                                                             | `modules/imports/`                                                                                                                                                                                                                        | 6             | 1              | 3           |
| [Platform Admin & Operations](#29-platform-admin--operations)                                      | `modules/tenants/`, `modules/audit-log/`, `modules/security-incidents/`, `modules/health/`                                                                                                                                                | 30            | 8              | —           |
| [Behaviour](#30-behaviour)                                                                         | `modules/behaviour/`                                                                                                                                                                                                                      | 214           | 32             | 16          |
| [Safeguarding](#31-safeguarding)                                                                   | `modules/safeguarding/`                                                                                                                                                                                                                   | 21            | 5              | 4+          |
| [Pastoral](#32-pastoral)                                                                           | `modules/pastoral/`                                                                                                                                                                                                                       | 149           | 20             | 8           |
| [Early Warning](#33-early-warning)                                                                 | `modules/early-warning/`                                                                                                                                                                                                                  | 8             | 3              | 3           |
| [SEN](#34-sen)                                                                                     | `modules/sen/`                                                                                                                                                                                                                            | 35            | 10             | —           |
| [Child Protection](#35-child-protection)                                                           | `modules/child-protection/`                                                                                                                                                                                                               | 12            | —              | —           |
| [Regulatory](#36-regulatory)                                                                       | `modules/regulatory/`                                                                                                                                                                                                                     | 67            | 33             | —           |
| [Staff Wellbeing](#37-staff-wellbeing)                                                             | `modules/staff-wellbeing/`                                                                                                                                                                                                                | 24            | 7              | —           |
| [Inbox & Messaging](#38-inbox--messaging)                                                          | `modules/inbox/`                                                                                                                                                                                                                          | 34            | 10             | 5           |
| [Wellbeing Super-Hub + AI Flags + Notifications](#39-wellbeing-super-hub--ai-flags--notifications) | `modules/wellbeing-aggregate/`, `modules/ai-flags/`, `modules/wellbeing-notifications/`                                                                                                                                                   | 4             | 2              | —           |
| [Leave Management](#40-leave-management)                                                           | `modules/leave/`                                                                                                                                                                                                                          | 15            | 5              | —           |
| **TOTAL**                                                                                          | **40 product domains across 55+ active modules**                                                                                                                                                                                          | **~1,447+**   | **~348+**      | **77+**     |

---

## 1. Students

**What it does**: Core student record management with lifecycle status transitions, household and parent links, year-group assignment, previews, allergy reporting, and export packs.

**Backend**: `apps/api/src/modules/students/`

- `students.controller.ts` under `v1/students`
- Student CRUD, status updates, allergy report, hover previews, export packs

**Frontend**: `apps/web/src/app/[locale]/(school)/students/`

- `/students`
- `/students/new`
- `/students/[id]`
- `/students/[id]/edit`
- `/students/allergy-report`

**Depends on**: Academics, households, parents, search indexing, sequences.

---

## 2. Staff Profiles

**What it does**: Staff directory and record management with encrypted bank details, auto-generated staff numbers, account creation, and assignment context for payroll, scheduling, and classes.

**Backend**: `apps/api/src/modules/staff-profiles/`

- Staff CRUD, list/detail views, bank detail retrieval, previews

**Frontend**: `apps/web/src/app/[locale]/(school)/staff/`

- `/staff`
- `/staff/new`
- `/staff/[id]`
- `/staff/[id]/edit`

**Depends on**: Auth, configuration encryption, sequences.

---

## 3. Parents

**What it does**: Parent records, contact preferences, student links, household links, and billing-parent management.

**Backend**: `apps/api/src/modules/parents/`

- Parent CRUD plus link and unlink student relationships

**Frontend**: `apps/web/src/app/[locale]/(school)/parents/`

- `/parents/[id]`

**Depends on**: Students and households.

---

## 4. Households

**What it does**: Family-unit management including emergency contacts, billing parent, merge and split operations, completion tracking, and household reference generation.

**Backend**: `apps/api/src/modules/households/`

- Household CRUD
- Merge and split operations
- Completion-issue tracking and previews

**Frontend**: `apps/web/src/app/[locale]/(school)/households/`

- `/households`
- `/households/new`
- `/households/[id]`
- `/households/[id]/edit`

**Depends on**: Students, parents, registration, sequences.

---

## 5. Registration

**What it does**: One-shot family registration flow that creates household, parents, students, fee assignments, and invoice within one coordinated workflow.

**Backend**: `apps/api/src/modules/registration/`

- `v1/registration/family/preview-fees`
- `v1/registration/family`

**Frontend**: No dedicated standalone route group. Registration is consumed through admissions and household/student workflows.

**Depends on**: Households, parents, students, finance, configuration, sequences.

---

## 6. Academics

**What it does**: Academic years, academic periods, year groups, subjects, promotion logic, and curriculum-matrix setup for class-subject coverage.

**Backend**: `apps/api/src/modules/academics/`

- Academic years and period lifecycle
- Year group CRUD and promotion chains
- Subject CRUD
- Promotion preview and commit flows
- Curriculum matrix

**Frontend**:

- `apps/web/src/app/[locale]/(school)/subjects/`
- `apps/web/src/app/[locale]/(school)/promotion/`
- `apps/web/src/app/[locale]/(school)/curriculum-matrix/`
- `apps/web/src/app/[locale]/(school)/settings/academic-years/`
- `apps/web/src/app/[locale]/(school)/settings/year-groups/`

**Depends on**: Classes, gradebook, scheduling, finance, report cards, promotion reporting.

---

## 7. Classes

**What it does**: Class lifecycle management, homeroom and subject classes, student enrolments, class staffing, and bulk class assignment tooling.

**Backend**: `apps/api/src/modules/classes/`

- Class CRUD and status
- Enrolment lifecycle
- Staff assignment
- Bulk class assignment surfaces

**Frontend**:

- `/classes`
- `/classes/new`
- `/classes/[id]`
- `/classes/[id]/edit`
- `/class-assignments`

**Depends on**: Students, staff profiles, academics, rooms, scheduling, gradebook, attendance.

---

## 8. Scheduling & Timetabling

**What it does**: Full timetable and scheduling stack including manual schedules, CSP auto-solver, scheduling runs, substitution management, exam scheduling, scenario planning, period grids, room management, staff availability/preferences, teacher competencies, cover reports, and personal timetables.

**Backend**:

- `apps/api/src/modules/schedules/`
- `apps/api/src/modules/scheduling/`
- `apps/api/src/modules/period-grid/`
- `apps/api/src/modules/class-requirements/`
- `apps/api/src/modules/staff-availability/`
- `apps/api/src/modules/staff-preferences/`
- `apps/api/src/modules/scheduling-runs/`
- `apps/api/src/modules/school-closures/`
- `apps/api/src/modules/rooms/`

**Key capabilities**:

- Manual timetable CRUD and timetable views
- Auto-scheduling orchestration and run review/apply/discard
- Teacher qualification and competency coverage
- Staff availability and preference capture
- Break groups, room closures, school closures
- Substitution suggestions and public substitution board
- Exam sessions and invigilation planning
- Calendar subscription for personal timetables
- Timetable quality and cover reporting
- CP-SAT solver telemetry: every scheduling run persists a `SolverDiagnosticsV3` payload (improvement trajectory, terminal state, worker/seed config, placement counts) to `scheduling_runs.solver_diagnostics` for post-hoc analysis

**Frontend**:

- `apps/web/src/app/[locale]/(school)/scheduling/`
- `apps/web/src/app/[locale]/(school)/schedules/`
- `apps/web/src/app/[locale]/(school)/timetables/`
- `apps/web/src/app/[locale]/(school)/rooms/`
- `apps/web/src/app/[locale]/(school)/settings/closures/`

**Worker jobs**:

- `scheduling:solve`
- `scheduling:solve-v2`
- `scheduling:reap-stale-runs`

**Shared**: `packages/shared/src/scheduler/` contains the pure TypeScript CSP solver and scheduler domain model.

---

## 9. Attendance

**What it does**: Session-based attendance, marking, uploads, AI-assisted scan workflows, pending-session detection, auto-locking, pattern alerts, parent notifications, and attendance analytics.

**Backend**: `apps/api/src/modules/attendance/`

- Session creation, marking, locking, cancellation
- Historical amendment and reporting
- Pattern detection and parent notifications
- Daily summary generation

**Frontend**:

- `/attendance`
- `/attendance/mark/[sessionId]`
- `/attendance/exceptions`
- `/attendance/upload`
- `/attendance/scan`
- `/reports/attendance`

**Worker jobs**:

- `attendance:generate-sessions`
- `attendance:detect-pending`
- `attendance:auto-lock`
- `attendance:detect-patterns`

**Depends on**: Classes, schedules, school closures, communications, early warning, regulatory, reports.

---

## 10. Gradebook & Report Cards

**What it does**: Assessment setup, grade entry, period grades, grading scales, rubrics, competency scales, curriculum standards, GPA, grade curves, AI-assisted grading and comments, progress reports, transcripts, report cards, approvals, delivery, analytics, and public verification.

**Backend**: `apps/api/src/modules/gradebook/`

- Core assessments and grade entry
- Results matrix and period grade computation
- Grading scales, assessment categories, rubric templates
- Competency scales and curriculum standards
- Grade publishing and progress reports
- Transcript generation
- Report card generation, templates, approvals, delivery, analytics
- QR/public verification endpoint

**Frontend**:

- `apps/web/src/app/[locale]/(school)/gradebook/`
- `apps/web/src/app/[locale]/(school)/analytics/`
- `apps/web/src/app/[locale]/(school)/report-cards/`
- `apps/web/src/app/[locale]/(school)/settings/grading-scales/`
- `apps/web/src/app/[locale]/(school)/settings/grading-weights/`
- `apps/web/src/app/[locale]/(school)/settings/grade-thresholds/`
- `apps/web/src/app/[locale]/(school)/settings/assessment-categories/`
- `apps/web/src/app/[locale]/(school)/settings/assessment-templates/`
- `apps/web/src/app/[locale]/(school)/settings/rubric-templates/`
- `apps/web/src/app/[locale]/(school)/settings/competency-scales/`
- `apps/web/src/app/[locale]/(school)/settings/curriculum-standards/`
- `apps/web/src/app/[locale]/(school)/settings/report-card-templates/`
- `apps/web/src/app/[locale]/(public)/verify/[token]/`

**Worker jobs**:

- `gradebook:mass-report-card-pdf`
- `gradebook:bulk-import-process`
- `gradebook:detect-risks`
- `report-cards:auto-generate`

**Depends on**: Academics, classes, attendance, communications, GDPR tokenisation, PDF rendering, reports.

---

## 11. Homework & Diary

**What it does**: Homework assignment lifecycle, recurrence rules, attachments, templates, completion tracking, homework analytics, parent homework views, teacher-parent notes, and student diary entries.

**Backend**: `apps/api/src/modules/homework/`

- `homework.controller.ts` for assignment CRUD, recurrence rules, copy, status, attachments
- `homework-completions.controller.ts` for completions and completion rates
- `homework-analytics.controller.ts` for load, correlation, non-completers, class and student analytics
- `homework-parent.controller.ts` for parent homework views
- `homework-diary.controller.ts` for diary notes and parent notes

**Frontend**:

- `/homework`
- `/homework/new`
- `/homework/[id]`
- `/homework/[id]/completions`
- `/homework/by-class/[classId]`
- `/homework/templates`
- `/homework/analytics`
- `/homework/analytics/load`
- `/homework/parent`
- `/homework/parent/[studentId]`
- `/homework/parent/[studentId]/notes`
- `/diary`

**Depends on**: Classes, students, parents, communications, analytics, parent daily digest.

---

## 12. Finance

**What it does**: Student fee and payment management across fee structures, assignments, invoice generation, payments, Stripe checkout, receipts, refunds, credit notes, scholarships, payment plans, statements, late fees, recurring invoices, and finance reporting.

**Backend**: `apps/api/src/modules/finance/`

- Fee structures, discounts, assignments, and generation
- Invoice lifecycle and approval integration
- Payments, allocation, receipts
- Refunds and credit notes
- Scholarships and payment plans
- Statements, reminders, recurring invoices, late fees
- Finance dashboards and reports

**Frontend**: `apps/web/src/app/[locale]/(school)/finance/`

- Dashboard, invoices, payments, fee structures, fee assignments, fee generation
- Discounts, refunds, statements, credit notes, scholarships, payment plans
- Audit trail and finance reporting

**Worker jobs**:

- `finance:overdue-detection`
- `finance:on-approval`

**Depends on**: Households, students, Stripe config, approvals, reports, registration.

---

## 13. Payroll

**What it does**: Payroll run management for salaried, per-class, and mixed compensation with staff attendance, class delivery, allowances, recurring deductions, one-offs, adjustments, finalisation approvals, payslip generation, exports, analytics, anomaly detection, and staff self-service. The 2026-04-26 rebuild unified the dual finalisation paths under a single `FinalisationService.finaliseAtomic` and made every input the engine had advertised actually wire through. See `payrollnew/PLAN.md`.

**Backend**: `apps/api/src/modules/payroll/`

- Payroll runs, approvals, and unified finalisation (`FinalisationService`)
- Period-bracketed compensation lookups (`CompensationService.findActiveForPeriod`)
- Staff attendance, class delivery, allowances, recurring deductions (two-phase via `payroll_deduction_applications`), one-offs, adjustments — all consumed by `PayrollInputResolver`
- Decimal-safe calculation engine (`CalculationService.compute`)
- Payslip generation with shared `formatPayslipNumber` (`<PREFIX>-YYYYMM-NNNNNN`) and Zod-validated snapshot schema
- Exports (templates + history + per-log re-send), tenant-wide allowances/deductions listings
- Self-service surface (`/my-payslips`, `/my-payslips/ytd`, `/my-payslips/:id/pdf`) — strictly scoped to the calling user via `StaffProfileReadFacade.findByUserId`
- Anomaly detection (in-memory scan), reports (variance + forecast + staff history)
- Boot-time permission backfill (`PayrollPermissionsInit`) for `payroll.self_service` + `payroll.manage_attendance`
- `@ModuleEnabled('payroll')` on every controller

**Frontend**: `apps/web/src/app/[locale]/(school)/payroll/`

- Hub dashboard (KPIs, payday calendar, top anomalies, cost trend)
- Runs (list + detail with entries / allowances / adjustments / anomalies / comparison tabs)
- Compensation (RHF + `createCompensationSchema` form, bulk-import)
- Staff attendance (daily grid + monthly heatmap + bulk-mark)
- Class delivery (records + per-teacher rollup)
- Reports (cost trend, YTD, bonus analysis, variance with run picker, forecast)
- Exports (templates + tenant-wide history)
- Staff history (per staff profile)
- My payslips (YTD card + by-month chart + per-payslip PDF download)
- Absences (cross-period leave summary)

**Worker jobs** (queue: `payroll`, names sourced from `@school/shared/payroll/job-names.ts`):

- `payroll:on-approval` — finalises a `pending_approval` run when its approval request executes; mirrors `FinalisationService` behaviour
- `payroll:session-generation` — counts confirmed `class_delivery_records` (status `delivered`) bracketed to the run period; status surfaced via `buildSessionGenStatusKey`
- `payroll:mass-export` — renders all payslips in a run to a single PDF cached in Redis under `buildMassExportPdfKey` (TTL 1200s); idempotent via `jobId: mass-export:{runId}:{locale}`

**Depends on**: Staff profiles, schedules, school closures, PDF rendering, approvals, configuration (typed `payrollSettingsSchema` exposes `payDay`, `payrollPreparationLeadDays`, `payrollAccountantEmail`).

---

## 14. Communications & Announcements

**What it does**: Multi-channel messaging and announcement publishing with audience targeting, templates, approvals, delivery tracking, retries, webhooks, and notification fan-out. As of the 2026-04-11 inbox rebuild, every outbound message is **additionally** fanned into the new first-class in-app inbox (see §38) as its always-on default channel. SMS / Email / WhatsApp remain opt-in escalations.

**Backend**: `apps/api/src/modules/communications/`

- Announcements
- Notification templates
- Notification inbox and unread counts
- Delivery and failure tracking
- Webhook handlers
- Audience resolution and template rendering
- Inbox channel bridge (impl 06 — forwards every fan-out into `ConversationsService`)

**Frontend**:

- `/communications`
- `/communications/new`
- `/communications/[id]`
- `/communications/inquiries`
- `/communications/inquiries/[id]`
- `/announcements`
- Parent and admin notification/inquiry entry points

**Worker jobs**:

- `communications:publish-announcement`
- `communications:dispatch-notifications`
- `communications:retry-failed-notifications`
- `communications:on-approval`
- `communications:ip-cleanup`
- `notifications:parent-daily-digest`
- `notifications:dispatch-queued`

**Depends on**: Approvals, GDPR consent, attendance, gradebook, pastoral, engagement, parent inquiries, **inbox** (as default channel).

---

## 15. Parent Inquiries

**What it does**: Parent-admin threaded messaging for inquiries linked to students with status lifecycle and stale-inquiry detection.

**Backend**: `apps/api/src/modules/parent-inquiries/`

- Inquiry creation, thread replies, list/detail views, status updates

**Frontend**:

- `/inquiries`
- `/inquiries/new`
- `/inquiries/[id]`

**Worker jobs**:

- `communications:inquiry-notification`
- `communications:stale-inquiry-detection`

---

## 16. Engagement

**What it does**: Parent forms, event management, conferences, consent records, trip packs, participation workflows, reminders, annual consent renewal, parent event inboxes, and engagement analytics.

**Backend**: `apps/api/src/modules/engagement/`

- Form templates and submissions
- Consent archive
- Events and event dashboards
- Trip-pack generation
- Conference scheduling and booking
- Parent event and parent form APIs
- Engagement analytics and calendar feed

**Frontend**: `apps/web/src/app/[locale]/(school)/engagement/`

- Form template builder and management
- Consent archive
- Events list, detail, participants, attendance, incidents, trip packs
- Conference setup and schedule pages
- Parent event and conference booking flows
- Parent form completion flows
- Engagement analytics

**Worker jobs**:

- `engagement-annual-renewal`
- `engagement-distribute-forms`
- `generate-invoices`
- `chase-outstanding`
- `expire-pending`
- `cancel-event`
- `engagement-conference-reminders`
- `engagement-generate-trip-pack`

**Depends on**: Students, classes, academics, finance, communications, PDF rendering.

---

## 17. Admissions

**What it does**: Public admissions and internal application review with admission-form versioning, analytics, fee handling, notes, approval-gated acceptance, and conversion into enrolled student records.

**Backend**: `apps/api/src/modules/admissions/`

- Admission form CRUD and publication
- Public application submission
- Internal application review and status transitions
- Parent-facing application access
- Conversion to enrolled records

**Frontend**:

- `/admissions`
- `/admissions/forms`
- `/admissions/forms/new`
- `/admissions/forms/[id]`
- `/admissions/[id]`
- `/admissions/[id]/convert`
- `/admissions/analytics`
- `/applications`
- `(public)/apply`

**Worker jobs**:

- `admissions:auto-expiry`

**Depends on**: Registration, finance, approvals, public website, households.

### Household numbers & multi-student applications

- **Primitive**: 6-char alphanumeric household identifier (`XYZ476`), auto-generated at household creation via `HouseholdNumberService`.
- **Student numbers**: derived as `{household_number}-{nn}` for households that have a number; legacy households continue on `STU-NNNNNN`.
- **Public API**: one submission can create up to 20 applications. Existing families authenticate via household number + parent email (`POST /v1/public/households/lookup`); new families provide their details up front.
- **Mode picker**: the public apply form starts with "New family" vs "Adding a child to existing family" choice.
- **Sibling priority**: waiting-list auto-promotion runs tiered FIFO (`is_sibling_application DESC, apply_date ASC`).
- **Admin surfaces**: admissions queue rows show a "Sibling" badge; household detail page shows the household number; walk-in wizard previews the next available household number.
- **Location**: see `household-numbers/PLAN.md` for the full design.

---

## 18. Approvals

**What it does**: Shared approval engine for announcement publishing, invoice issuance, payroll finalisation, and other approval-gated actions, including callback dispatch health and retry tooling.

**Backend**: `apps/api/src/modules/approvals/`

- Workflow management
- Approval request queue and detail
- Callback retry and health endpoints

**Frontend**:

- `/approvals`
- `/approvals/[id]`

**Worker jobs**:

- `approvals:callback-reconciliation`

**Depends on**: Communications, finance, payroll, report-card style approval flows.

---

## 19. Reports & Analytics

**What it does**: Multi-tenant analytics + BI layer. The hub renders 10 movable weekly KPIs with info-icon tooltips, severity colour-coding and click-through drill-downs (impl 14). Eleven domain reports — attendance, grades, demographics, admissions, staff, student progress, cross-module insights, plus legacy promotion/rollover, fee-generation, write-offs, notification-delivery, student-export, workload — render real data through impl 05's domain analytics services. The custom report builder (impl 02 + 16) is a first-class feature backed by a curated subject registry: each of the eleven primary subjects (Student, Staff, Household, Class, Invoice, Application, Behaviour Incident, Safeguarding Concern, Attendance Record, Grade, Payroll Entry) exposes a permission-scoped field tree, the engine compiles `subject + columns + filters + group-by` into a single Prisma query, and enforces RLS, permission scoping, a 10k row cap, and a 30s timeout. AI is the rebuild's flagship: three flag-gated features (`reports_narration` / `reports_ask_ai` / `reports_predictions`) — narrate dashboards, translate plain English to a builder report, predict student risk + attendance + cash-flow. All AI flags default off; tenants opt in via `Settings → Reports` and absorb Anthropic cost. Saved reports can be scheduled (cron worker, impl 08) or alert-bound (threshold worker, impl 09), and shared into the inbox as PDF/Excel/Word attachments (impl 13). Board (impl 06) and Compliance (impl 07) reports aggregate across modules with honest gap surfacing for regulators.

**Backend**: `apps/api/src/modules/reports/` (95 endpoints)

- **KPI dashboard** — `GET /v1/reports/analytics/dashboard`, `PUT /v1/reports/settings/kpi-visibility` (impl 03 + impl 21).
- **Domain analytics** — attendance / grades / demographics / admissions / staff / student-progress / cross-module-insights endpoints (impl 05).
- **Custom report builder** — `GET /v1/reports/builder/subjects`, `GET /v1/reports/builder/subjects/:key/fields`, `POST /v1/reports/builder/preview`, `POST /v1/reports/builder` (save), `POST /v1/reports/builder/:id/duplicate`, `PATCH/DELETE /v1/reports/builder/:id`, `POST /v1/reports/builder/:id/export` (impls 02 + 16 + 19).
- **Saved-report draft autosave** — `GET / PUT / DELETE /v1/reports/builder/draft` (impl 16).
- **AI features** — `POST /v1/reports/ai-narrator/dashboard`, `POST /v1/reports/ai-narrator/report/:reportKey`, `POST /v1/reports/ai-narrator/saved/:id` (impl 10), `POST /v1/reports/ai-ask-ai`, `GET /v1/reports/ai-ask-ai/history` (impl 11), `GET /v1/reports/predictions/student-risk/:studentId`, `GET /v1/reports/predictions/attendance-forecast/:yearGroupId`, `GET /v1/reports/predictions/cash-flow` (impl 12). All three gated by `@RequiresAiFlag`.
- **Scheduled reports** — `POST /v1/reports/scheduled`, `GET /v1/reports/scheduled`, `PATCH /v1/reports/scheduled/:id`, `DELETE /v1/reports/scheduled/:id`, `GET /v1/reports/scheduled/:id/runs` (impl 08).
- **Report alerts** — `POST /v1/reports/alerts`, `GET /v1/reports/alerts`, `PATCH /v1/reports/alerts/:id`, `DELETE /v1/reports/alerts/:id`, `GET /v1/reports/alerts/:id/runs` (impl 09).
- **Sharing** — `POST /v1/reports/builder/:id/share` (writes a `report_share_log` row + posts to inbox), `GET /v1/reports/shared/:share_id` (impl 13).
- **Board / Compliance** — `POST /v1/reports/board`, `GET /v1/reports/board/history`, `POST /v1/reports/compliance/generate`, `GET /v1/reports/compliance/history` (impls 06 + 07).
- **Settings** — `GET /v1/reports/settings`, `PUT /v1/reports/settings/defaults`, `PUT /v1/reports/settings/kpi-visibility` (impl 21).

**Frontend**: `apps/web/src/app/[locale]/(school)/reports/` (22 pages) + `settings/reports/` (1 page)

- `/reports` — Hub + KPI dashboard with 10 cards, 6-month trends chart, AI summary panel (flag-gated), 15-tile quick-link grid.
- `/reports/{attendance,grades,demographics,admissions,staff,student-progress,insights}` — Domain reports with real data, AI summary panel, info-tooltips, drill-down click-through.
- `/reports/builder` and `/reports/builder/[id]` — Three-pane custom builder: Saved-Reports sidebar (favourite/rename/duplicate/share/delete) · Subject + Field-tree picker · Filters + Group-by + Chart-type · Preview pane. Editor / Share-history tabs on owned reports.
- `/reports/ask-ai` — Plain-English query → builder pre-fill (flag-gated).
- `/reports/scheduled` and `/reports/alerts` — Cron + threshold management with run history.
- `/reports/board` and `/reports/compliance` — Aggregate reports for board packets and regulator submissions, with print:break-before-page CSS for browser-print PDF.
- `/reports/shared/[share_id]` — Read-only snapshot view for share recipients.
- `/reports/{promotion-rollover,fee-generation,write-offs,notification-delivery,student-export,workload}` — Legacy report pages (live data; some are pending replacement by builder reports).
- `/settings/reports` — AI Features / KPI Dashboard / Defaults tabs with deep-link query/hash routing (impl 21).

**Worker jobs** (4 BullMQ jobs across `apps/worker/`)

- `reports:scheduled-run` — every 15 min, scans `scheduled_reports` due, fans out per saved report.
- `reports:scheduled-deliver` — per saved report, runs the query through `QueryEngineService`, exports PDF/Excel/Word, emails recipients + writes `scheduled_report_runs` row.
- `reports:alert-evaluate` — every 30 min, fans out per active tenant.
- `reports:alert-evaluate-tenant` — per tenant, evaluates each alert's threshold and writes `report_alert_runs` (+ inbox notification on breach).

**Tables**: `saved_reports`, `saved_report_drafts`, `scheduled_report_runs`, `report_alert_runs`, `report_share_log`, `reports_kpi_tenant_preferences`, `reports_tenant_settings`. All tenant-scoped, all `FORCE ROW LEVEL SECURITY` with `<table>_tenant_isolation` policies.

**Permissions**: `analytics.view`, `analytics.manage_reports`, `analytics.export`, `reports.builder`, `reports.scheduled.*`, `reports.alerts.*`, `reports.share`, `reports.board.generate`, `reports.compliance.generate`, `reports.settings`. Plus per-subject permissions for builder field-tree visibility (e.g. `students.medical.view` controls medical fields).

**Cross-module dependencies**: AdmissionsModule (funnel data), SchedulesModule (cover gaps KPI), AiFlagsModule (flag gating + audit), InboxModule (share-to-inbox), MailerModule (scheduled email delivery). See `module-blast-radius.md` for the full graph.

**Depends on**: Nearly every tenant-scoped data domain — students, staff, classes, attendance, grades, behaviour, safeguarding, finance, payroll, admissions, audit-log.

---

## 20. Website CMS & Public Web

**What it does**: Per-school public website management with page editor, navigation, SEO, publish lifecycle, contact submissions, public pages, and public contact handling.

**Backend**: `apps/api/src/modules/website/`

- Website pages and navigation
- Contact submission admin
- Public page delivery
- Public contact submission endpoint

**Frontend**:

- `/website`
- `/website/new`
- `/website/[id]`
- `/website/contact-submissions`
- `(public)/`
- `(public)/[slug]`
- `(public)/contact`

**Depends on**: Branding, admissions, public marketing surface.

---

## 21. Search

**What it does**: Global tenant-safe fuzzy search across core people records.

**Backend**: `apps/api/src/modules/search/`

- `GET v1/search`

**Frontend**: Search is embedded into school UI surfaces rather than maintained as a standalone page.

**Worker jobs**:

- `search:index-entity`
- `search:full-reindex`

---

## 22. Dashboards

**What it does**: Role-specific landing dashboards for school admins, teachers, and parents.

**Backend**: `apps/api/src/modules/dashboard/`

- School admin dashboard
- Parent dashboard
- Teacher dashboard

**Frontend**: `apps/web/src/app/[locale]/(school)/dashboard/`

- `/dashboard`
- `/dashboard/parent`
- `/dashboard/teacher`

---

## 23. Authentication

**What it does**: Login, MFA, tenant selection, invitation acceptance, password reset, session handling, and token refresh flows.

**Backend**: `apps/api/src/modules/auth/`

- `v1/auth` endpoints for login, refresh, logout, MFA, register, password reset, tenant switch

**Frontend**: `apps/web/src/app/[locale]/(auth)/`

- `/login`
- `/register`
- `/reset-password`
- `/mfa-verify`
- `/select-school`

---

## 24. RBAC & User Administration

**What it does**: Roles, permissions, memberships, invitations, and school-level user administration.

**Backend**: `apps/api/src/modules/rbac/`

- Roles
- Permissions
- Memberships
- Invitations

**Frontend**:

- `/settings/roles`
- `/settings/roles/new`
- `/settings/roles/[id]`
- `/settings/users`
- `/settings/invitations`

**Depends on**: Auth, platform admin, approvals, permission guard.

---

## 25. Configuration

**What it does**: Tenant settings, branding, Stripe settings, notification settings, and custom-field configuration.

**Backend**: `apps/api/src/modules/configuration/`

- Settings
- Branding
- Stripe configuration
- Notification settings

**Frontend**:

- `/settings/general`
- `/settings/branding`
- `/settings/stripe`
- `/settings/notifications`
- `/settings/custom-fields`

---

## 26. Preferences & Profiles

**What it does**: Per-user profile management, communication preferences, MFA/session views, and UI preference persistence.

**Backend**: `apps/api/src/modules/preferences/`

- `v1/me/preferences`

**Frontend**:

- `/profile`
- `/profile/communication`

---

## 27. Compliance, Privacy & Legal

**What it does**: DSAR requests, erasure and anonymisation orchestration, retention policies, legal holds, consent management, privacy notices, DPA acceptance, AI audit visibility, public sub-processor register, and parent privacy-consent self-service.

**Backend**:

- `apps/api/src/modules/compliance/`
- `apps/api/src/modules/gdpr/`

**Key capabilities**:

- Compliance request lifecycle
- Retention policy management and enforcement
- Consent grant and withdrawal
- Parent consent self-service
- Privacy notice management and acknowledgement
- DPA current/status/acceptance
- AI audit stats and records
- GDPR token usage and export-policy visibility
- Public sub-processor register

**Frontend**:

- `/settings/compliance`
- `/privacy-consent`
- `/settings/legal`
- `/settings/legal/dpa`
- `/settings/legal/privacy-notices`
- `/privacy-notice`
- `(public)/sub-processors`

**Worker jobs**:

- `compliance:execute`
- `data-retention:enforce`
- `compliance:deadline-check`

---

## 28. Imports

**What it does**: CSV/XLSX import workflows with validate, preview, confirm, process, and cleanup stages.

**Backend**: `apps/api/src/modules/imports/`

- Bulk import endpoints for supported import job types

**Frontend**:

- `/settings/imports`

**Worker jobs**:

- `imports:validate`
- `imports:process`
- `imports:file-cleanup`

---

## 29. Platform Admin & Operations

**What it does**: Platform-owner tooling for tenant provisioning and status management, domain management, module enablement, impersonation, MFA reset, platform audit visibility, security incident management, and service health checks.

**Backend**:

- `apps/api/src/modules/tenants/`
- `apps/api/src/modules/audit-log/`
- `apps/api/src/modules/security-incidents/`
- `apps/api/src/modules/health/`

**Frontend**:

- `/admin`
- `/admin/tenants`
- `/admin/tenants/new`
- `/admin/tenants/[id]`
- `/admin/audit-log`
- `/admin/security-incidents`
- `/admin/security-incidents/[id]`
- `/admin/health`

**Also includes**:

- School audit-log surface at `/settings/audit-log`
- Platform and school operational visibility for diagnostics and compliance review

---

## 30. Behaviour

**What it does**: Full behaviour-management domain covering incidents, quick-log, categories, points and houses, sanctions, interventions, recognition, exclusions, appeals, alerts, tasking, guardian restrictions, amendments, documents, analytics, and parent behaviour views.

**Backend**: `apps/api/src/modules/behaviour/`

- Incident CRUD and quick-log
- Behaviour configuration and templates
- Admin operations
- Analytics
- Sanctions
- Student behaviour profiles
- Interventions
- Recognition and awards
- Appeals
- Exclusions
- Alerts
- Tasks
- Parent behaviour endpoints
- Documents
- Amendments
- Guardian restrictions

**Frontend**:

- `/behaviour` (flagship sub-hub — Wave 5 Impl 14, 14 hub cards + KPI strip + Recognition Wall preview + inline AI parse)
- `/behaviour/incidents`
- `/behaviour/incidents/new`
- `/behaviour/incidents/[id]`
- `/behaviour/students`
- `/behaviour/students/[studentId]`
- `/behaviour/sanctions`
- `/behaviour/sanctions/today`
- `/behaviour/appeals`
- `/behaviour/appeals/[id]`
- `/behaviour/interventions`
- `/behaviour/interventions/new`
- `/behaviour/interventions/[id]`
- `/behaviour/exclusions`
- `/behaviour/exclusions/[id]`
- `/behaviour/alerts`
- `/behaviour/tasks`
- `/behaviour/amendments`
- `/behaviour/guardian-restrictions` (with type tooltips — pre-24 cleanup)
- `/behaviour/recognition` (celebratory hero + gold/silver/bronze podium — Wave 6 Impl 23)
- `/behaviour/documents` (list + `/[id]` detail — Wave 6 Impl 20)
- `/behaviour/analytics`
- `/behaviour/analytics/ai` (NL query rebuild — Wave 6 Impl 19)
- `/behaviour/admin` (6 repair-op tiles — Wave 6 Impl 23)
- `/behaviour/admin/legal-holds` (list / create / release — Wave 6 Impl 23)
- `/behaviour/policies/replay` (typed-confirmation replay preview — Wave 6 Impl 23)
- `/behaviour/parent-portal`
- `/behaviour/parent-portal/recognition`
- Behaviour settings under `/settings/behaviour-*`

**Wellbeing rebuild additions** (Waves 2–7): incident-stats, tasks-stats, recognition feed, document templates (read), document preview signed-URL, exclusion named endpoints (`issue-notice`, `schedule-hearing`, `record-hearing`, `finalise`, `overturn`), amendment send-correction dispatch, behaviour acknowledgements (`GET` + `POST /:id/read`), AI parse / per-student summary / NL-query history (all gated via `@RequiresAiFlag('behaviour')`), policy replay aliases (`/policies/replay/preview`, `/policy-dry-run`), admin repair endpoints with `confirm_phrase` enforcement, AI query history table.

**Worker jobs**:

- Policy evaluation
- Award checks
- Suspension return handling
- Pattern detection
- Task reminders
- Guardian restriction checks
- Attachment scans
- Retention checks
- Partition maintenance
- Materialized-view refreshes
- Break-glass expiry
- Parent notification and digest flows

**Depends on**: Safeguarding, pastoral, policy engine, approvals, PDF rendering, S3, sequences, early warning.

---

## 31. Safeguarding

**What it does**: Dedicated safeguarding concern management with status transitions, assignment, action logs, referrals, attachments, case files, sealing, dashboarding, and break-glass access review.

**Backend**: `apps/api/src/modules/safeguarding/`

- Concern CRUD and status transitions
- Assignment and action logging
- Tusla and Garda referral actions
- Attachment upload and secure download
- Full and redacted case-file generation
- Seal initiate and approve flows
- Break-glass access and review
- Safeguarding dashboard

**Frontend**:

- `/safeguarding` (flagship sub-hub — Wave 5 Impl 17, replaces the old pastoral redirect)
- `/safeguarding/concerns`
- `/safeguarding/concerns/new`
- `/safeguarding/concerns/[id]`
- `/safeguarding/my-reports`
- `/safeguarding/sla` (first-response timer dashboard — Wave 5 Impl 17)
- `/safeguarding/sealed` (redacted dual-approval-sealed index — Wave 5 Impl 17)
- `/safeguarding/break-glass` (list + `/[id]` detail — Wave 6 Impl 23)
- `/safeguarding/reviews` (after-action review queue — pre-24 cleanup)

**Wellbeing rebuild additions** (Waves 3 + 6): seal reject (`POST /:id/seal/reject`), `GET /:id/seal-status`, `GET /break-glass/:id` hydrated detail, `GET /break-glass/:id/access-log` (projected from `safeguarding_actions`), widened `listActiveGrants` with 30-day window + `active` / `review_completed_at` / `review_overdue` flags. Sealing dual-approval UI added to pastoral concern detail.

**Worker jobs**:

- `safeguarding:sla-check`
- `safeguarding:critical-escalation`
- Shared attachment-scan and break-glass expiry support through the behaviour queue

**Depends on**: Child protection, behaviour attachments/constants, regulatory and pastoral reporting.

---

## 32. Pastoral

**What it does**: Student wellbeing and pastoral-care workspace spanning concerns, cases, interventions, referrals, SST coordination, check-ins, critical incidents, parent contacts, chronology, exports, DSAR review, and reporting.

**Backend**: `apps/api/src/modules/pastoral/`

- Concerns and concern version history
- Cases and case transfers/linking
- Interventions and intervention actions/progress
- Referrals, recommendations, and NEPS visits
- SST members, meetings, agendas, and actions
- Student check-ins plus admin analytics and configuration
- Critical incidents and affected-person tracking
- Parent contacts
- Student chronology
- Pastoral reports and exports
- Pastoral import and DSAR review
- Parent pastoral views
- Escalation admin dashboard and settings

**Frontend**:

- `/pastoral`
- `/pastoral/concerns`
- `/pastoral/concerns/new`
- `/pastoral/concerns/[id]`
- `/pastoral/concerns/[id]/edit`
- `/pastoral/cases`
- `/pastoral/cases/new`
- `/pastoral/cases/[id]`
- `/pastoral/interventions`
- `/pastoral/interventions/new`
- `/pastoral/interventions/[id]`
- `/pastoral/referrals`
- `/pastoral/referrals/new`
- `/pastoral/referrals/[id]`
- `/pastoral/checkins`
- `/pastoral/checkins/flagged` (severity-ordered flagged queue — Wave 6 Impl 22)
- `/pastoral/sst`
- `/pastoral/sst/[id]`
- `/pastoral/critical-incidents`
- `/pastoral/critical-incidents/new`
- `/pastoral/critical-incidents/[id]`
- `/pastoral/dsar` (DSAR review queue — Wave 6 Impl 22)
- `/pastoral/dsar/[complianceRequestId]` (per-item Include / Redact / Exclude — Wave 6 Impl 22)
- `/pastoral/import` (3-step CSV wizard — Wave 6 Impl 22)

**Wellbeing rebuild additions** (Waves 3 + 6): DSAR stats endpoint, flagged check-in queue + escalate/dismiss, critical-incident support log (`GET /affected/:personId/support` + `recordSupportOffered` append-only), SST agenda refresh gated by `@RequiresAiFlag('pastoral')`, agenda projection with cross-cutting-themes section + per-item AI source tags (`auto_new_concern`, `auto_case_review`, `auto_overdue_action`, `auto_early_warning`, `auto_neps`, `auto_intervention_review`).

**Worker jobs**:

- `pastoral:notify-concern`
- `pastoral:escalation-timeout`
- `pastoral:checkin-alert`
- `pastoral:intervention-review-reminder`
- `pastoral:overdue-actions`
- `pastoral:precompute-agenda`
- `pastoral:sync-behaviour-safeguarding`
- `pastoral:wellbeing-flag-expiry`

**Depends on**: Communications, child protection, PDF rendering, sequences, early warning, compliance.

---

## 33. Early Warning

**What it does**: Student risk profiling across attendance, behaviour, grades, engagement, and wellbeing with cohort views, signal breakdown, tier history, acknowledgement, assignment, and tenant-level configuration.

**Backend**: `apps/api/src/modules/early-warning/`

- Risk list and student detail
- Summary and cohort views
- Tenant config read/update
- Acknowledge and assign flows

**Frontend**:

- `/early-warnings` (flagship sub-hub rewrite — Wave 5 Impl 16, amber-gradient hero KPIs with sparklines + deterministic AI insights panel + at-risk matrix + cohort charts)
- `/early-warnings/intervene` (multi-select intervention triage — pre-24 cleanup)
- `/early-warnings/cohort`
- `/early-warnings/settings`

**Worker jobs**:

- `early-warning:compute-daily`
- `early-warning:compute-student`
- `early-warning:weekly-digest`

**Depends on**: Attendance, behaviour, gradebook, engagement, pastoral, staff routing rules.

---

## 34. SEN

**What it does**: Special educational needs management including SEN profiles, support plans, SMART goals, strategies, progress, resource allocation, student hours, SNA assignments, professional involvement, accommodations, compliance reporting, transition notes, handover packs, and parent SEN visibility.

**Backend**: `apps/api/src/modules/sen/`

- SEN profile APIs
- Support-plan lifecycle and plan-number generation
- Goals, strategies, and progress
- Resource allocation and student hours
- SNA assignments
- Professional involvement and accommodations
- SEN reports and transition/handover payloads

**Frontend**:

- `/sen`
- `/sen/students`
- `/sen/students/[studentId]`
- `/sen/plans/[planId]`
- `/sen/plans/[planId]/goals/new`
- `/sen/resource-allocation`
- `/sen/sna-assignments`
- `/sen/reports`
- `/parent/sen`
- `/parent/sen/[planId]`

**Depends on**: Students, staff profiles, academics, pastoral linkage, settings, sequences.

---

## 35. Child Protection

**What it does**: Child-protection record handling, export generation, access grants and checks, and mandated-report support.

**Backend**: `apps/api/src/modules/child-protection/`

- CP record CRUD
- Export preview and generate flows
- Export download token endpoint
- Access grant, revoke, list, and check endpoints

**Frontend**: No dedicated standalone page group yet. This domain is currently exposed primarily through protected backend and integrated safeguarding/pastoral/admin workflows.

**Depends on**: Safeguarding and pastoral modules.

---

## 36. Regulatory

**What it does**: Irish compliance and regulatory operations — the super-hub that stitches together Tusla attendance reporting, DES returns, October returns, PPOD sync/import/export/transfers, CBA sync, reduced school day records, anti-bullying oversight, safeguarding governance registers, GDPR/DSAR management, submissions tracking, and a cross-regulator calendar. Shipped as a 12-phase redesign (`regulatory-new/`) spanning 2026-04-23 to 2026-04-24 that eliminated 5 crash routes, 100+ missing translation keys, and the legacy in-page `RegulatoryNav`, and consolidated the four standalone compliance paths (`/dpa`, `/data-retention`, `/privacy-notices`, `/compliance`) under a single `/regulatory/gdpr/*` sub-hub.

**Backend**: `apps/api/src/modules/regulatory/` — single monolithic `RegulatoryModule` exposing one `RegulatoryController` under `v1/regulatory/`. The controller delegates to 15 domain services (dashboard, calendar, submissions, tusla, tusla-mappings, des, des-mappings, reduced-days, october-returns, ppod, cba, transfers, anti-bullying, safeguarding, gdpr). Cross-module reads go through each owning facade (behaviour, safeguarding, attendance, academics, schedules, classes, staff-profiles, students, compliance) rather than directly into their Prisma queries.

**API Endpoints** (prefixed `v1/regulatory/` — **67 total**):

- Dashboard: `GET /dashboard`, `GET /dashboard/overdue`, `GET /academic-years`
- Calendar: `GET /calendar`, `POST /calendar`, `PATCH /calendar/:id`, `DELETE /calendar/:id`, `POST /calendar/seed-defaults`
- Submissions: `GET /submissions`, `GET /submissions/:id`, `POST /submissions`, `PATCH /submissions/:id`
- Tusla: `GET /tusla/absence-mappings`, `POST /tusla/absence-mappings`, `DELETE /tusla/absence-mappings/:id`, `GET /tusla/threshold-monitor`, `POST /tusla/sar/generate`, `GET /tusla/sar/:id/export`, `POST /tusla/aar/generate`, `GET /tusla/aar/:id/export`, `GET /tusla/suspensions`, `GET /tusla/expulsions`
- DES returns: `GET /des/subject-mappings`, `POST /des/subject-mappings`, `DELETE /des/subject-mappings/:id`, `GET /des/readiness`, `GET /des/preview/:fileType`, `POST /des/generate/:fileType`
- Reduced school days: `GET /reduced-school-days`, `POST /reduced-school-days`, `GET /reduced-school-days/:id`, `PATCH /reduced-school-days/:id`
- October returns: `GET /october-returns/readiness`, `GET /october-returns/preview`, `GET /october-returns/issues`
- PPOD: `GET /ppod/status`, `GET /ppod/students`, `GET /ppod/sync-log`, `GET /ppod/diff`, `POST /ppod/import`, `POST /ppod/export-csv`, `POST /ppod/sync`, `POST /ppod/sync/:studentId`
- CBA: `GET /cba/status`, `GET /cba/pending`, `POST /cba/sync`, `POST /cba/sync/:studentId`
- Transfers: `GET /transfers`, `POST /transfers`, `GET /transfers/:id`, `PATCH /transfers/:id`
- Anti-bullying: `GET /anti-bullying/summary`
- Safeguarding registers: `GET /safeguarding/dashboard`, `GET /safeguarding/mandatory-reports`, `GET|POST|PATCH|DELETE /safeguarding/dlp-register[/:id]`, `GET|POST|PATCH|DELETE /safeguarding/staff-vetting[/:id]`, `GET|POST|PATCH|DELETE /safeguarding/cp-reviews[/:id]`
- GDPR: `GET /gdpr/dashboard` (plus the long-standing `gdpr` module at `v1/gdpr/*` for DSAR CRUD, privacy-notice versions, retention policies, retention holds, DPA acceptance — unchanged)

**Frontend**: `apps/web/src/app/[locale]/(school)/regulatory/` — **33 pages** — all routed through the shared Morphing Shell pattern described in `docs/plans/ux-redesign-final-spec.md`. No per-page sub-strip (ruled off-pattern for this module); every page uses `PageHeader.back` + a KPI strip + (optional) HubTile grid or table, teal accent `from-teal-400 to-teal-600`.

- Super hub: `/regulatory` (KPI strip + 9 HubTiles)
- Calendar: `/regulatory/calendar`
- Submissions: `/regulatory/submissions`
- Tusla sub-hub: `/regulatory/tusla`, `/regulatory/tusla/sar`, `/regulatory/tusla/aar`, `/regulatory/tusla/reduced-days`, `/regulatory/tusla/mappings`
- DES returns sub-hub: `/regulatory/des-returns`, `/regulatory/des-returns/subject-mappings`, `/regulatory/des-returns/generate`
- October returns sub-hub: `/regulatory/october-returns`, `/regulatory/october-returns/preview`, `/regulatory/october-returns/issues`
- PPOD sub-hub: `/regulatory/ppod`, `/regulatory/ppod/students`, `/regulatory/ppod/sync-log`, `/regulatory/ppod/import`, `/regulatory/ppod/export`
- CBA: `/regulatory/cba` (moved from `/regulatory/ppod/cba` in Phase 4)
- Transfers: `/regulatory/transfers`, `/regulatory/transfers/new` (moved from `/regulatory/ppod/transfers*` in Phase 4)
- Anti-bullying: `/regulatory/anti-bullying` (promoted from redirect stub in Phase 8)
- Safeguarding sub-hub: `/regulatory/safeguarding`, `/regulatory/safeguarding/annual-review`, `/regulatory/safeguarding/dlp-register`, `/regulatory/safeguarding/mandatory-reporting`, `/regulatory/safeguarding/staff-vetting` (promoted from redirect stub in Phase 9)
- GDPR sub-hub: `/regulatory/gdpr`, `/regulatory/gdpr/dsar`, `/regulatory/gdpr/dpa-policy`, `/regulatory/gdpr/data-retention`, `/regulatory/gdpr/privacy-notices` (Phase 10 consolidation — replaces the 4 standalone compliance pages)

**Legacy-path redirects** (Phase 10 — `apps/web/next.config.mjs`, 8 entries total, `permanent: false` / 307 until ~2026-07-23 soak window closes):

- `/regulatory/compliance` → `/regulatory/gdpr/dsar`
- `/regulatory/dpa` → `/regulatory/gdpr/dpa-policy`
- `/regulatory/data-retention` → `/regulatory/gdpr/data-retention`
- `/regulatory/privacy-notices` → `/regulatory/gdpr/privacy-notices`

Flip to `permanent: true` / 308 after the soak — tracked as item #23 in `docs/operations/PRE-LAUNCH-CHECKLIST.md`.

**i18n**: full EN/AR parity for every `regulatory.*` key (Phase 11). Date/number formatters are routed through `@/lib/i18n-format.fmtLocale()` on every regulatory page so Arabic locale renders Western digits + Gregorian calendar. Parity enforced by unit test `apps/web/src/__tests__/translation-parity.spec.ts` (zero placeholder `[AR]` values, zero missing keys) and by an RTL route walk at `apps/web/e2e/regulatory/regulatory-rtl.spec.ts` (every `/ar/regulatory/*` route rendered, no `MISSING_MESSAGE` console warnings).

**Depends on**: Attendance (threshold monitor, SAR/AAR data source), behaviour (anti-bullying summary, via `BehaviourModule` facade), safeguarding (safeguarding dashboard, CP reviews), academics (subject mappings, October returns), schedules + classes (calendar cross-referencing), staff-profiles (staff-vetting register), students (PPOD student sync, transfers), compliance + gdpr (GDPR dashboard, DSAR module — Phase 10 consumer).

---

## 37. Staff Wellbeing

**What it does**: Staff wellbeing analytics and survey programme including workload summaries, cover fairness, timetable quality, substitution pressure, absence trends, personal workload views, board reporting, anonymous surveys, survey moderation, and wellbeing resources.

**Backend**: `apps/api/src/modules/staff-wellbeing/`

- Aggregate workload endpoints
- Personal workload endpoints
- Survey CRUD, activation, closure, response capture
- Survey results and moderation
- Resource library endpoint
- Termly board report endpoint

**Frontend**:

- `/wellbeing/staff` (folded super-page — Wave 5 Impl 15, replaces the fragmented 5-route layout)
- `/wellbeing/dashboard` → 302 redirect to `/wellbeing/staff#aggregate`
- `/wellbeing/my-workload` → 302 redirect to `/wellbeing/staff#my`
- `/wellbeing/reports` → 302 redirect to `/wellbeing/staff#board-report`
- `/wellbeing/resources` → 302 redirect to `/wellbeing/staff#resources`
- `/wellbeing/survey` (survey response page — kept)
- `/wellbeing/surveys` → 302 redirect to `/wellbeing/staff#surveys`
- `/wellbeing/surveys/[id]` (survey detail — kept, breadcrumbs back to staff hub)

**Depends on**: Payroll, scheduling, attendance, communications, audit and anonymity controls.

---

## 38. Inbox & Messaging

**What it does**: First-class in-app messaging — the always-on default channel for every outbound fan-out. Supports three conversation kinds (direct / group / broadcast), a tenant-configurable 9×9 role permission matrix, smart audiences (static + dynamic with AND/OR/NOT providers like `fees_in_arrears`), read receipts (sender-only, one-way visibility rule), editable / deletable messages with full audit, attachments, admin oversight with freeze + PDF export, safeguarding keyword scanner, notification fallback to SMS / Email / WhatsApp, and full-text search. Shipped 2026-04-11 via the 16-implementation `new-inbox/` rebuild.

**Backend**: `apps/api/src/modules/inbox/`

- `conversations/` — `ConversationsService` + `MessagesService` for direct, group, and broadcast threads (create / reply / edit / delete / freeze / unfreeze)
- `policy/` — `MessagingPolicyService` (single chokepoint for `canStartConversation` / `canReplyToConversation`), `RelationalScopeResolver` (hard-coded privacy invariants — teacher ↔ parent via taught classes), `RoleMappingService`, `TenantMessagingPolicyRepository` (per-tenant 5-minute cache)
- `audience/` — `AudienceProviderRegistry` (process-wide singleton), 13 registered providers (`school`, `parents_school`, `staff_all`, `staff_by_role`, `year_group_parents`, `class_parents`, `section_parents`, `year_group_students`, `class_students`, `event_attendees`, `trip_roster`, `handpicked`, `saved_group`), `AudienceComposer` (AND/OR/NOT with cycle detection), `AudienceResolutionService`, `SavedAudiencesService` + `SavedAudiencesRepository`
- `oversight/` — `InboxOversightService` (tenant-wide read, freeze / unfreeze, flag review, PDF export, audit log)
- `settings/` — `InboxSettingsService` + `InboxSettingsController` for the matrix / kill switches / edit window / retention / fallback config
- `safeguarding/` — keyword CRUD + bulk import + scanner trigger (scanner processor lives in worker)
- `search/` — full-text search backed by `messages.body_search` generated `tsvector` GIN-indexed column (raw SQL inside RLS middleware — the one exception permitted by schema)
- `common/inbox-outbox.service.ts` — the enqueue-after-commit layer for `inbox:dispatch-channels`, `safeguarding:scan-message`, and (new in impl 16) `inbox:fallback-scan-tenant` debug enqueue
- Cross-module providers: `FeesInArrearsProvider` (lives in `FinanceModule`, resolves households → parents); `EventAttendeesProvider` + `TripRosterProvider` (placeholders in `EventsModule`/`TripsModule` stubs)
- Bridge into `CommunicationsModule` dispatcher: every outbound fan-out calls `ConversationsService.createConversation` / `sendMessage` so the inbox is always delivered

**API Endpoints** (prefixed `v1/inbox/`):

- Conversations: `GET /conversations`, `POST /conversations`, `GET /conversations/:id`, `POST /conversations/:id/messages`, `PATCH /conversations/:id/messages/:mid`, `DELETE /conversations/:id/messages/:mid`, `POST /conversations/:id/read`, `GET /conversations/:id/read-receipts`, `GET /state`
- Search: `GET /search`
- People picker: `GET /people-search`
- Attachments: `POST /attachments`
- Audiences: `GET /audiences`, `POST /audiences`, `GET /audiences/:id`, `PUT /audiences/:id`, `DELETE /audiences/:id`, `POST /audiences/preview`, `POST /audiences/:id/resolve`, `GET /audiences/providers`
- Settings: `GET /settings/policy`, `GET /settings/inbox`, `PUT /settings/inbox`, `PUT /settings/policy`, `POST /settings/policy/reset`, `POST /settings/fallback/test` (impl 16 debug endpoint, env-flag gated)
- Oversight: `GET /oversight/conversations`, `GET /oversight/conversations/:id`, `GET /oversight/flags`, `POST /oversight/flags/:id/dismiss`, `POST /oversight/flags/:id/escalate`, `POST /oversight/conversations/:id/freeze`, `POST /oversight/conversations/:id/unfreeze`, `POST /oversight/conversations/:id/export`, `GET /oversight/audit-log`
- Safeguarding keywords: `GET /safeguarding/keywords`, `POST /safeguarding/keywords`, `PATCH /safeguarding/keywords/:id`, `DELETE /safeguarding/keywords/:id`, `POST /safeguarding/keywords/bulk-import`
- **34 endpoints total**

**Frontend**: `apps/web/src/app/[locale]/(school)/inbox/` and `settings/communications/*` / `settings/messaging-policy/`

- `/inbox` — sidebar + thread list + empty state
- `/inbox/threads/[id]` — thread view with reply composer, read receipts, frozen banner
- `/inbox/search?q=…` — full-text search results with snippet highlighting
- `/inbox/audiences` — saved audiences manager (list, filter, search, duplicate, delete)
- `/inbox/audiences/new` + `/inbox/audiences/[id]` — react-hook-form audience editor with live preview + people picker + chip builder
- `/inbox/oversight` — tabbed dashboard (Conversations / Flags / Audit log), required audit-log banner
- `/inbox/oversight/threads/[id]` — read-only thread view with freeze / unfreeze / export / flag-review toolbar
- `/settings/messaging-policy` — 9×9 matrix + global kill switches + edit window + retention + confirmation modals
- `/settings/communications/safeguarding` — keyword list / edit / bulk-import / toggle
- `/settings/communications/fallback` — per-sender-class fallback window and channel routing
- Morph bar: `InboxBadge` (envelope + unread pill) on every school-facing page, powered by `InboxPollingProvider` at the school-shell layout
- Morph bar hub: dedicated `communications` hub with sub-strip tabs Inbox / Audiences / Announcements / Oversight (+ overflow: Safeguarding keywords, Messaging Policy, Fallback)
- Dashboard: `SafeguardingAlertsWidget` (polls every 60s, shows pending flags, never renders message bodies)
- Compose surface: `ComposeDialog` launched from the sidebar Compose button or the `c` keyboard shortcut — three tabs (Direct / Group / Broadcast) + `PeoplePicker` + `AudiencePicker` + `ChannelSelector` + `AttachmentUploader`
- **10 distinct pages**

**Worker jobs**:

- `inbox:dispatch-channels` (notifications queue) — fan-out to extra channels after every message commit
- `inbox:fallback-check` (notifications queue, cron every 5 minutes) — cross-tenant scan, enqueues one `inbox:fallback-scan-tenant` per tenant with `fallback_enabled = true`
- `inbox:fallback-scan-tenant` (notifications queue) — per-tenant fallback escalation for unread messages past the configured window
- `safeguarding:scan-message` (safeguarding queue) — keyword matcher per inbound message; creates `message_flags` rows on matches
- `safeguarding:notify-reviewers` (safeguarding queue) — severity-routed notification to admin-tier reviewers after a flag is created
- **5 new jobs**

**Permissions** (seeded by `InboxPermissionsInit` at boot):

- `inbox.read` — seen by everyone (parents / students included, per inbox-always-on invariant)
- `inbox.send` — staff roles; governs the people-picker surface and send rate
- `inbox.oversight.read` — admin tier (owner / principal / vice principal)
- `inbox.settings.read` — admin tier
- `inbox.settings.write` — admin tier (gates matrix edits, fallback config, keyword CRUD, fallback-test debug endpoint)

**Tables** (14 new, all tenant-scoped with `FORCE ROW LEVEL SECURITY` + `tenant_isolation` policy):

- `conversations`, `conversation_participants`, `messages`, `message_reads`, `message_edits`, `message_attachments`
- `broadcast_audience_definitions`, `broadcast_audience_snapshots`, `saved_audiences`
- `tenant_messaging_policy`, `tenant_settings_inbox`
- `safeguarding_keywords`, `message_flags`, `oversight_access_log`

**State machines**: `ConversationLifecycle` (active → frozen → unfrozen → archived) and `MessageFlagReviewState` (pending → dismissed / escalated / frozen) — see `docs/architecture/state-machines.md`.

**Danger zones**: `DZ-Inbox-1` (inbox must remain default channel in every dispatch path), `DZ-Inbox-2` (tenant policy matrix cached 5 min), `DZ-Inbox-3` (broadcast replies spawn new direct conversations) — see `docs/architecture/danger-zones.md`.

**Tenant feature reference**: `docs/features/inbox.md`.

**Depends on**: Rbac (role resolution), Finance (`FeesInArrearsProvider`), Safeguarding (downstream handoff), Communications (dispatcher bridge), Pdf rendering (oversight exports), Notifications queue.

---

## 39. Wellbeing Super-Hub + AI Flags + Notifications

**What it does**: Three aggregate / cross-cutting modules that compose the flagship `/wellbeing` super-hub (Wave 5 Impl 13) into a single surface by cross-querying behaviour / pastoral / safeguarding / early-warning / staff-wellbeing. Per-module AI feature gating (behaviour / pastoral / staff_wellbeing / early_warning). Wellbeing event routing with in-app always-on + per-event channel overrides for email / SMS / WhatsApp (providers stubbed per `PLAN.md §8`).

**Backend**: three modules under `apps/api/src/modules/`:

- `wellbeing-aggregate/` — `WellbeingAggregateService.getDashboardSummary` composes KPIs + pending-attention banner + hub_counts + recent-activity via `Promise.allSettled` across five read facades. Uses `ReadFacadesModule` (`BehaviourReadFacade`, `PastoralReadFacade`, `SafeguardingReadFacade`, `EarlyWarningReadFacade`, `StaffWellbeingReadFacade`). Flag-gated sources via `tenant_modules` (skipped when disabled). Route: `GET /api/v1/wellbeing/dashboard-summary` (gated by `wellbeing.view_dashboard`).
- `ai-flags/` — `AiFlagsService` with 5-minute in-memory TTL cache, `AiFlagsController` at `/v1/ai-flags` (GET list + PATCH `:moduleKey`), global `@RequiresAiFlag(moduleKey)` decorator + `AiFlagGuard` via `APP_GUARD`. Gates `POST /behaviour/incidents/ai-parse`, `GET /behaviour/students/:id/ai-summary`, `POST /behaviour/analytics/ai-query`, `POST /pastoral/sst/meetings/:id/agenda/refresh`. Returns `403 AI_DISABLED` when the flag is off.
- `wellbeing-notifications/` — `WellbeingNotificationsService.dispatch(event, recipients)` writes in-app inbox rows (always-on) then fans out to email / SMS / WhatsApp per `tenant_notification_preferences.wellbeing_channels` (defaults + per-event overrides). Event-key catalogue: `incident.logged`, `incident.escalated`, `concern.raised`, `concern.acknowledged`, `sanction.scheduled`, `sanction.served`, `sla.breach`, `critical.declared`, `appeal.submitted`, `appeal.decided`, `recognition.awarded`, `document.sent_to_parent`, `amendment.sent`, `reminder.acknowledgement`, etc. Provider implementations throw `PROVIDER_NOT_WIRED`; `safeDispatch` swallows so callers never 500 on provider failure.

**Frontend**:

- `/wellbeing` (super-hub landing — Wave 5 Impl 13)
- `/settings/ai-flags` (tenant admin AI flag toggles — Wave 5 Impl 18)

**Tables**:

- `tenant_ai_flags` (per-module AI gate — impl 01)
- `tenant_notification_preferences` (`wellbeing_channels` JSONB — impl 01)
- `behaviour_ai_query_history` (NL-query round-trip audit — impl 05)

Four new permissions: `ai_flag.manage`, `wellbeing.view_dashboard`, `safeguarding.dedicated_view`, `wellbeing_notifications.configure`.

**Shared types**: `packages/shared/src/wellbeing/` — `wellbeingDashboardSummarySchema`, `WellbeingDashboardSummary`, `WELLBEING_NOTIFICATION_EVENT_KEYS`, `WELLBEING_DISPATCH_SEVERITIES`.

**Worker jobs**:

- `behaviour:exclusion-deadline-check` (every 6h UTC, per tenant)
- `behaviour:ack-reminders` (daily 9am tenant-local)
- Document render / send via the existing `pdf-rendering` + `behaviour:document-ready` chain
- `pastoral:precompute-agenda` (deferred — deterministic generator ships today)

**Depends on**: Behaviour, pastoral, safeguarding, early-warning, staff-wellbeing (via `ReadFacadesModule`); notifications queue; tenant_modules flag table; inbox (for in-app channel writes).

**Source of truth for the rebuild**: `wellbeing_new/PLAN.md`, `wellbeing_new/IMPLEMENTATION_LOG.md`, `wellbeing_new/SIGN_OFF.md`.

---

## 40. Leave Management

**What it does**: Planned-absence workflow for teaching and non-teaching staff: a tenant-configurable leave-type catalogue (annual / sick / bereavement / unpaid…), submission of leave requests with optional evidence, admin approval with notes, automatic creation of the backing `teacher_absence` row on approval (which triggers the existing substitution cascade), staff self-service balance, and a month-end aggregation used by payroll to compute paid / unpaid days missed per staff member. Integrates with the scheduling module's substitution cascade so approved leave automatically fans out cover offers.

**Backend**: `apps/api/src/modules/leave/`

- `LeaveController` — routes mounted at `/v1/leave`:
  - `GET /types` — effective catalogue for the submit dropdown (tenant rows shadow same-code system rows). Permission: `leave.submit_request`.
  - `GET /types/admin`, `POST /types`, `PATCH /types/:id`, `DELETE /types/:id` — admin catalogue management. Permission: `leave.manage_types`.
  - `GET /balance`, `GET /balance/:staffProfileId` — per-staff balance summary aggregated across the current academic year. Self-serve endpoint is `leave.submit_request`; the admin-targeted `:staffProfileId` variant requires `leave.approve_requests`.
  - `POST /requests`, `GET /requests/my`, `POST /requests/:id/withdraw` — staff submission + withdraw. Permission: `leave.submit_request`.
  - `GET /requests`, `POST /requests/:id/approve`, `POST /requests/:id/reject` — admin queue. Permission: `leave.approve_requests`.
- `PayrollAttendanceController` — `GET /v1/payroll/absence-periods?period=YYYY-MM` returns per-staff days_worked / days_missed with paid / unpaid breakdown and leave-type split for month-end payroll. Permission: `payroll.manage_attendance`.
- `LeaveRequestsService` — submission, approval (creates `teacher_absence` with `absence_type='approved_leave'` + `leave_request_id` link, triggers `SubstitutionCascadeService.runCascade`), rejection, withdrawal. State machine: `pending → approved / rejected / withdrawn`; `approved → cancelled`. Cross-day overlap check against the date range + max-days-per-request enforcement.
- `LeaveTypesService` — list (effective), listAdmin (full catalogue + override flags), create / update / archive (system rows are read-only; tenants create an override row with the same code to customise), and two balance aggregators (`getBalanceForUser` / `getBalanceForStaff`) that sum `teacher_absences.days_counted` for the current academic year and count pending-request days per leave type.
- `PayrollAttendanceService` — aggregates overlap-weighted days missed per staff for a calendar month, excluding weekends. School holidays are NOT yet excluded (no `school_holidays` table).

**Frontend**:

- `/leave` — staff hub: balance tiles (academic year, days taken, days pending, pending request count) + per-type balance table + pending + history + submit dialog. Links to the admin review queue and leave-type catalogue when the role permits.
- `/dashboard/teacher/leave` — original teacher self-service entry (form + history). Kept in place alongside `/leave`; the new hub is the unified surface.
- `/scheduling/leave-requests` — admin approve / reject queue with optional review notes.
- `/settings/leave-types` — tenant leave-type catalogue: table of system + tenant rows with scope / paid / approval / evidence / max-days / active columns, create / edit / archive, and a one-click "Override" for shadowing a system default.
- `/payroll/absences` — month-end absence summary: month picker, totals (school days, staff, with absences, paid vs unpaid days missed), per-staff table with per-type breakdown badges, and CSV export. Reachable from the payroll hub card.

**Tables** (all with RLS tenant_isolation policies in `post_migrate.sql` of `20260414140000_add_leave_and_cover`):

- `leave_types` — tenant-scoped catalogue with `tenant_id IS NULL` system defaults (`USING tenant_id IS NULL OR tenant_id = current_tenant`). Partial unique indexes `idx_leave_types_system_code` (where tenant_id IS NULL) + `idx_leave_types_tenant_code` (where tenant_id IS NOT NULL).
- `leave_requests` — submission state, reviewer metadata, and the backing `LeaveRequestStatus` enum (`pending` / `approved` / `rejected` / `cancelled` / `withdrawn`). Approval creates a `teacher_absences` row linked via `leave_request_id`.
- `teacher_absences` — already owned by scheduling; extended in the same migration with `date_to`, `absence_type` enum (`self_reported` / `approved_leave`), `leave_type_id`, `leave_request_id`, `is_paid`, `days_counted`.
- Sibling tables from the same migration: `substitution_offers`, `tenant_scheduling_settings`.

**Permissions**: `leave.submit_request`, `leave.approve_requests`, `leave.manage_types` (all in `packages/prisma/seed/permissions.ts`). Default role mapping: `school_owner` / `school_principal` / `admin` get all three; `school_vice_principal` gets submit + approve; `teacher` gets submit.

**Shared types**: `packages/shared/src/schemas/leave.schema.ts` — `leaveTypeResponseSchema`, `leaveTypeAdminResponseSchema`, `createLeaveTypeSchema`, `updateLeaveTypeSchema`, `createLeaveRequestSchema`, `reviewLeaveRequestSchema`, `leaveRequestQuerySchema`, `leaveBalanceResponseSchema`.

**Backfill scripts** (production — run once post-deploy):

- `packages/prisma/scripts/sync-missing-permissions.ts` — registers `leave.manage_types` in the global `permissions` table. Idempotent.
- `packages/prisma/scripts/grant-leave-manage-types-permission.ts` — grants `leave.manage_types` to `school_owner` / `school_principal` / `admin` roles on every tenant. Idempotent.

**Depends on**: Scheduling (`SubstitutionCascadeService`, `CoverNotificationsService`), Staff Profiles (`StaffProfileReadFacade`), Academics (`AcademicReadFacade` for current-year balance window), Notifications (via `cover-notifications.service`).

---

## 41. Budgeting & Analysis ("Modeling")

**What it does**: Driver-based annual financial modelling alongside a lightweight event/trip cost calculator. Annual financial models support 1/3/5-year horizons with a base case + up to 3 alternative scenarios driven by 11 canonical drivers (enrollment, fee uplift, staff headcount, salary uplift, discount/scholarship capture, utilities/materials inflation, capex, donations, grants, custom). Variance is materialised against live finance and payroll actuals. Snapshots are immutable on publish and render to PDF (Puppeteer) + Excel (exceljs) board packs with tenant-branded templates. Three output channels: PDF, Excel, public read-only shareable URLs (UUID token, optional password, expiry windows of 7/14/30/90 days). Event budgets push fees end-to-end into the Finance module via a single transactional cross-module write through `FeeAssignmentsService.bulkCreate()` gated by three permissions.

**Backend**: `apps/api/src/modules/budgeting/`

- `financial-models/` — model + scenarios CRUD (impl 03)
- `line-items/` — driver-derived / custom / override / locked line-item management (impl 04)
- `snapshots/` — immutable snapshot publish / restore / archive (impl 05)
- `variance/` — read materialised variance cache; manual-actuals upsert (impl 06)
- `event-budgets/` — event/trip workspace + scenarios (impl 07)
- `exports/` — PDF + Excel renderers + signed-URL serving (impl 09)
- `trip-fee-integration/` — preview + generate-fees + mark-school-funded (impl 10)
- `shareable-links/` — issue / list / revoke + public open-route resolver (impl 11)
- `tenant-preferences/` — per-tenant defaults (impl 20)

**Endpoints** (all `/api/v1/budgeting/*` unless noted):

| Method                      | Path                                                                     | Permission                                                          |
| --------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| GET / POST / PATCH / DELETE | `/financial-models[/:id]`                                                | `budgeting.view` / `.manage` / `.archive`                           |
| GET / POST / PATCH          | `/financial-models/:id/scenarios[/:sid]`                                 | `budgeting.view` / `.manage`                                        |
| POST                        | `/financial-models/:id/line-items/...` (custom / override / lock / etc.) | `budgeting.manage`                                                  |
| GET / POST                  | `/financial-models/:id/snapshots[/publish/:sid]`                         | `budgeting.view` / `.publish`                                       |
| GET / POST                  | `/financial-models/:id/variance[/refresh]`                               | `budgeting.view`                                                    |
| GET / POST / PATCH / DELETE | `/event-budgets[/:id]`                                                   | `budgeting.view` / `.manage` / `.archive`                           |
| GET / POST                  | `/event-budgets/:id/generate-fees[/preview]`                             | `budgeting.view` AND `budgeting.generate_fees` AND `finance.manage` |
| POST                        | `/event-budgets/:id/mark-school-funded`                                  | `budgeting.generate_fees`                                           |
| GET / POST                  | `/financial-models/:id/snapshots/:sid/exports/(pdf\|excel\|regenerate)`  | `budgeting.view` / `.publish`                                       |
| GET / POST                  | `/financial-models/:id/snapshots/:sid/links[/:linkId/revoke]`            | `budgeting.view` / `.share`                                         |
| GET (public)                | `/budgeting/share/:token`                                                | (open)                                                              |
| GET / PATCH                 | `/budgeting/tenant-preferences`                                          | `budgeting.view` / `.manage`                                        |

**Worker jobs**:

- `budgeting:variance-refresh` — daily 02:00 in tenant timezone; rewrites `variance_cache` rows for all active published models (impl 08)
- `budgeting:variance-refresh-bootstrap` — bootstrap iterator that registers per-tenant repeatables on worker startup
- `budgeting:board-pack-render` — on-demand; renders PDF + Excel into Hetzner object storage and updates the snapshot row (impl 09)
- `budgeting:shareable-link-cleanup` — daily 03:00 UTC cross-tenant; hard-deletes links expired more than 30 days (impl 11)

**Frontend**: `apps/web/src/app/[locale]/(school)/finance/budgeting/`

- `/finance/budgeting` — hub (Models / Events / Settings tiles + recent activity)
- `/finance/budgeting/models[/new]` — model list + create form
- `/finance/budgeting/models/[id]` — workspace (KPI strip, scenarios, drivers drawer, line-item table)
- `/finance/budgeting/models/[id]/compare` — scenario comparison (chart / cards / table)
- `/finance/budgeting/models/[id]/variance` — planned vs actual dashboard
- `/finance/budgeting/models/[id]/snapshots` — version history + publish modal + detail drawer
- `/finance/budgeting/models/[id]/share` — issue / list / revoke shareable links
- `/finance/budgeting/events[/new]` — event list + create form
- `/finance/budgeting/events/[id]` — calculator workspace
- `/finance/budgeting/events/[id]/generate-fees` — trip → invoicing dry-run + confirm flow
- `/finance/budgeting/settings` — tenant preferences (horizon / household share / contingency / format / max expiry / hidden KPIs)

Public open route (outside `(school)` group):

- `/finance/budgeting/share/[token]` — unauthenticated read-only renderer; 4 tabs (Summary / Scenarios / Line items / Assumptions); password prompt + lockout after 5 wrong attempts; PII scrubbed by backend before payload reaches the page.

**Tables** (all RLS `<table>_tenant_isolation` policies in `post_migrate.sql` of `20260426100000_budgeting_modeling_foundation`):

- `financial_models`, `scenarios`, `financial_model_line_items`, `financial_model_snapshots`
- `event_budgets`, `event_budget_scenarios`
- `variance_cache`
- `shareable_links`
- `budgeting_tenant_preferences`

**Permissions**: `budgeting.view`, `budgeting.manage`, `budgeting.publish`, `budgeting.share`, `budgeting.generate_fees`, `budgeting.archive` — seeded by the schema migration; granted to `school_owner` / `school_principal` / `school_vice_principal` by default.

**Shared types**: `packages/shared/src/budgeting/` — `drivers`, `engine`, `event-engine`, `scenario-merge`, `source-data`, plus per-entity Zod schemas (`financial-models`, `scenarios`, `line-items`, `snapshots`, `variance`, `event-budgets`, `trip-fee-integration`, `shareable-links`, `tenant-preferences`). The driver engine is pure-TS, dependency-free — backend services + the worker's board-pack renderer + the workspace's live-recompute all run identical math.

**Cross-module dependencies**:

- Reads: `FinanceReadFacade` (variance + fee structures), `PayrollReadFacade` (variance staff costs), `StudentReadFacade`, `StaffProfileReadFacade`, `ClassesReadFacade`, `HouseholdReadFacade`, `AcademicReadFacade`.
- Writes: `FeeAssignmentsService.bulkCreate()` — single permitted cross-module write path, triggered by trip → fee generation. Three-permission gating (`budgeting.view` AND `budgeting.generate_fees` AND `finance.manage`); single `createRlsClient($transaction)` so partial invoicing is structurally impossible.

**Snapshot immutability**: Once a `financial_model_snapshot` row is written, only `pdf_object_key` / `excel_object_key` / `rendered_at` may be updated (by the board-pack worker). The frontend trusts this invariant for the public renderer.

**Public PII scrubbing**: `filterPayloadForPublic` in `shareable-links.service.ts` strips `households` / `students` / `staff` / `individual_payroll`, removes per-row arrays from `source_data_snapshot` / `source_snapshot`, and removes `computed_from` from line items at the top level and inside `base_case`. The frontend treats the payload as `Record<string, unknown>` and only reads documented safe keys.
