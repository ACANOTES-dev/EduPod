# Feature Map — School Operating System

> **Purpose**: Complete inventory of every feature, mapped to its code location. This is the single source of truth for "what does this product do and where does it live."
> **Maintenance**: Updated only on user confirmation that a feature change is final. See `.claude/rules/feature-map-maintenance.md`.
> **Last verified**: 2026-03-25

---

## Quick Reference

| Domain | Backend Module | API Endpoints | Frontend Pages | Worker Jobs |
|--------|---------------|---------------|----------------|-------------|
| [Students](#1-students) | `modules/students/` | 8 | 5 | — |
| [Staff](#2-staff-profiles) | `modules/staff-profiles/` | 6 | 4 | — |
| [Parents](#3-parents) | `modules/parents/` | 6 | 1 | — |
| [Households](#4-households) | `modules/households/` | 16 | 4 | — |
| [Registration](#5-registration) | `modules/registration/` | 2 | — | — |
| [Academics](#6-academics) | `modules/academics/` | 21 | 2 | — |
| [Classes](#7-classes) | `modules/classes/` | 16 | 4 | — |
| [Scheduling](#8-scheduling) | `modules/schedules/`, `modules/scheduling/`, `modules/period-grid/`, `modules/class-requirements/`, `modules/staff-availability/`, `modules/staff-preferences/`, `modules/scheduling-runs/`, `modules/school-closures/`, `modules/rooms/` | 128 | 28 | 3 |
| [Attendance](#9-attendance) | `modules/attendance/` | 22 | 6 | 4 |
| [Gradebook & Report Cards](#10-gradebook--report-cards) | `modules/gradebook/` | 148 | 24 | 4 |
| [Finance](#11-finance) | `modules/finance/` | 87 | 23 | 2 |
| [Payroll](#12-payroll) | `modules/payroll/` | 79 | 10 | 3 |
| [Communications](#13-communications) | `modules/communications/` | 17 | 5 | 7 |
| [Parent Inquiries](#14-parent-inquiries) | `modules/parent-inquiries/` | 8 | 3 | 2 |
| [Admissions](#15-admissions) | `modules/admissions/` | 21 | 4 | 1 |
| [Approvals](#16-approvals) | `modules/approvals/` | 9 | — | — |
| [Reports & Analytics](#17-reports--analytics) | `modules/reports/` | 66 | 20 | — |
| [Website CMS](#18-website-cms) | `modules/website/` | 13 | 4 | — |
| [Search](#19-search) | `modules/search/` | 1 | — | 2 |
| [Dashboard](#20-dashboards) | `modules/dashboard/` | 3 | 3 | — |
| [Auth](#21-authentication) | `modules/auth/` | 12 | 5 | — |
| [RBAC](#22-rbac) | `modules/rbac/` | 16 | 5 | — |
| [Configuration](#23-configuration) | `modules/configuration/` | 8 | 5 | — |
| [Preferences](#24-preferences) | `modules/preferences/` | 2 | 2 | — |
| [Compliance](#25-compliance) | `modules/compliance/` | 8 | 1 | 1 |
| [Imports](#26-imports) | `modules/imports/` | 6 | 1 | 3 |
| [Platform Admin](#27-platform-admin) | `modules/tenants/` | 16 | 5 | — |
| [Behaviour](#28-behaviour) | `modules/behaviour/` | 214 | 37 | 16 |
| **TOTAL** | **39 modules** | **~950** | **~207** | **48 jobs** |

---

## 1. Students

**What it does**: CRUD for student records with lifecycle status management (applicant → active → withdrawn/graduated/archived), allergy reporting, search indexing, and export packs.

**Backend**: `apps/api/src/modules/students/`
- `students.controller.ts` — 8 endpoints under `v1/students`
- `students.service.ts` — create, findAll, findOne, update, updateStatus, preview, exportPack, allergyReport

**Key endpoints**:
| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/students` | Create student with parent links, household, year group | `students.manage` |
| GET | `v1/students` | Paginated list with filters (status, year group, allergy, search) | `students.view` |
| GET | `v1/students/:id` | Full detail with household, parents, enrolments | `students.view` |
| PATCH | `v1/students/:id` | Update fields (not status) | `students.manage` |
| PATCH | `v1/students/:id/status` | Transition status with state machine | `students.manage` |
| GET | `v1/students/allergy-report` | Students with allergies, filterable | `students.view` |
| GET | `v1/students/:id/preview` | Hover card data (Redis-cached 30s) | `students.view` |
| GET | `v1/students/:id/export-pack` | Full profile + placeholders | `students.manage` |

**Frontend**: `apps/web/src/app/[locale]/(school)/students/`
| Route | Description |
|-------|-------------|
| `/students` | Paginated list with filters, XLSX/PDF export |
| `/students/new` | Create form |
| `/students/[id]` | Detail view with status transitions, parents, enrolments |
| `/students/[id]/edit` | Edit form |
| `/students/allergy-report` | Allergy report with year group/class filters |

**Shared types**: `packages/shared/src/types/student.ts`, `packages/shared/src/schemas/student.schema.ts`
**Constants**: `packages/shared/src/constants/student-status.ts` (transition map)
**Depends on**: TenantsModule (sequences), AcademicsModule (year groups), SearchModule (indexing)

---

## 2. Staff Profiles

**What it does**: Staff record management with encrypted bank details, auto-generated staff numbers, user account creation, and class assignment tracking.

**Backend**: `apps/api/src/modules/staff-profiles/`
- `staff-profiles.controller.ts` — 6 endpoints under `v1/staff-profiles`
- `staff-profiles.service.ts` — create, findAll, findOne, update, getBankDetails, preview

**Key endpoints**:
| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/staff-profiles` | Create staff + user account + membership + role | `users.manage` |
| GET | `v1/staff-profiles` | Paginated list with status/department/search filters | `users.view` |
| GET | `v1/staff-profiles/:id` | Detail with class assignments | `users.view` |
| PATCH | `v1/staff-profiles/:id` | Update with bank detail re-encryption | `users.manage` |
| GET | `v1/staff-profiles/:id/bank-details` | Masked bank details (AES-256 decryption) | `payroll.view_bank_details` |
| GET | `v1/staff-profiles/:id/preview` | Hover card (Redis-cached 30s) | `users.view` |

**Frontend**: `apps/web/src/app/[locale]/(school)/staff/`
| Route | Description |
|-------|-------------|
| `/staff` | Paginated list with export |
| `/staff/new` | Create form with post-creation credentials dialog |
| `/staff/[id]` | Detail with class assignments, bank details tab |
| `/staff/[id]/edit` | Edit form |

**Shared types**: `packages/shared/src/types/staff-profile.ts`, `packages/shared/src/schemas/staff-profile.schema.ts`
**Depends on**: AuthModule (user creation), ConfigurationModule (encryption, settings), TenantsModule (sequences)

---

## 3. Parents

**What it does**: Parent record management with student/household linking, contact preferences (email, WhatsApp, phone), and billing parent designation.

**Backend**: `apps/api/src/modules/parents/`
- `parents.controller.ts` — 6 endpoints under `v1/parents`

**Key endpoints**:
| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/parents` | Create parent with optional user/household links | `students.manage` |
| GET | `v1/parents` | Paginated list with status/search | `students.view` |
| GET | `v1/parents/:id` | Detail with households and students | `students.view` |
| PATCH | `v1/parents/:id` | Update contact info, billing/primary flags | `students.manage` |
| POST | `v1/parents/:id/students` | Link student to parent | `students.manage` |
| DELETE | `v1/parents/:parentId/students/:studentId` | Unlink student | `students.manage` |

**Frontend**: `apps/web/src/app/[locale]/(school)/parents/`
| Route | Description |
|-------|-------------|
| `/parents/[id]` | Detail with linked households and students |

**Shared types**: `packages/shared/src/types/parent.ts`, `packages/shared/src/schemas/parent.schema.ts`

---

## 4. Households

**What it does**: Family unit management with emergency contacts, billing parent, student/parent linking, household merge/split operations, and completion tracking.

**Backend**: `apps/api/src/modules/households/`
- `households.controller.ts` — 16 endpoints under `v1/households`

**Key features**:
- Create with auto-generated household_number (random XXX999-9 format)
- Emergency contacts (1-3 per household)
- Billing parent designation
- Merge: move students/parents/contacts from source → target, archive source
- Split: create new household, move selected members
- Completion tracking (needs_completion flag)
- Preview for hover cards

**Frontend**: `apps/web/src/app/[locale]/(school)/households/`
| Route | Description |
|-------|-------------|
| `/households` | List with completion issues, student count |
| `/households/new` | Create form |
| `/households/[id]` | Detail with merge/split dialogs, add student, manage parents/contacts |
| `/households/[id]/edit` | Edit with emergency contact sync |

**Shared types**: `packages/shared/src/types/household.ts`, `packages/shared/src/schemas/household.schema.ts`
**Depends on**: TenantsModule (sequences), RegistrationModule (add student)

---

## 5. Registration

**What it does**: Full family registration workflow — creates household, parents, students, fee assignments, and invoice in a single transaction. Also handles adding students to existing households.

**Backend**: `apps/api/src/modules/registration/`
- `registration.controller.ts` — 2 endpoints under `v1/registration`

**Key endpoints**:
| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/registration/family/preview-fees` | Preview fee calculations | `students.manage` |
| POST | `v1/registration/family` | Full registration: household + contacts + parents + students + fees + invoice | `students.manage` |

**Depends on**: TenantsModule (sequences), ConfigurationModule (settings), FinanceModule (invoices)

---

## 6. Academics

**What it does**: Academic year/period lifecycle, year group management with promotion chains, subject CRUD, promotion wizard (promote/hold/skip/graduate/withdraw), and curriculum matrix (class-subject assignment grid).

**Backend**: `apps/api/src/modules/academics/`
- 6 controllers: academic-years, academic-periods, year-groups, subjects, promotion, curriculum-matrix
- 21 total endpoints

**Sub-features**:
- **Academic Years** (5 endpoints): CRUD + status transitions (planned → active → closed). One active year per tenant.
- **Academic Periods** (5 endpoints): Terms/semesters within years. Status transitions trigger report card auto-generation cron.
- **Year Groups** (4 endpoints): CRUD with promotion chain (next_year_group_id). Display order.
- **Subjects** (4 endpoints): CRUD with type (academic/supervision/duty/other) and active flag.
- **Promotion** (2 endpoints): Preview proposed actions per student, then commit (promote/hold_back/skip/graduate/withdraw).
- **Curriculum Matrix** (3 endpoints): Toggle class-subject assignments, bulk create assessments.

**Frontend**: `apps/web/src/app/[locale]/(school)/`
| Route | Description |
|-------|-------------|
| `/subjects` | Subject list with type filters, inline CRUD |
| `/promotion` | Multi-step promotion wizard |
| `/curriculum-matrix` | (accessed via scheduling/gradebook) |

**Settings pages**: Academic years, year groups managed via `/settings/academic-years` and `/settings/year-groups`

---

## 7. Classes

**What it does**: Homeroom and subject class management, student enrolment with lifecycle status, staff assignment with roles, class-to-class bulk assignment of students.

**Backend**: `apps/api/src/modules/classes/`
- 3 controllers: classes, class-enrolments, class-assignments
- 16 total endpoints

**Sub-features**:
- **Classes** (9 endpoints): CRUD, status management, staff assignment, room validation, preview.
- **Enrolments** (4 endpoints): Enrol/drop/complete with state machine, bulk enrol.
- **Class Assignments** (3 endpoints): Drag-and-drop style bulk assignment of students to homeroom classes by year group, with export data.

**Frontend**: `apps/web/src/app/[locale]/(school)/classes/`
| Route | Description |
|-------|-------------|
| `/classes` | List with academic year/year group/status filters |
| `/classes/new` | Create form (name, year, group, teacher, room, capacity) |
| `/classes/[id]` | Detail with tabs: Overview, Enrolment Management, Staff Assignment |
| `/classes/[id]/edit` | Edit form |
| `/class-assignments` | Bulk assignment interface |

**Shared types**: `packages/shared/src/types/class.ts`, `packages/shared/src/schemas/class.schema.ts`
**Constants**: `packages/shared/src/constants/class-enrolment-status.ts` (transition map)

---

## 8. Scheduling

**What it does**: The largest feature domain. Manual timetable management, CSP auto-scheduler (constraint propagation + backtracking), substitution management with AI-ranked suggestions, exam session scheduling, what-if scenarios, rotation weeks (Week A/B), personal timetables with calendar subscription (webcal://), period grid configuration, room/teacher/subject requirements, staff availability and preferences, scheduling analytics, cover reports, and a public substitution board.

**Backend**: 9 modules, 128 total endpoints

| Module | Path | Key Features |
|--------|------|-------------|
| `modules/schedules/` | Manual schedule CRUD, timetable views (teacher/room/student), pin/unpin entries, workload report |
| `modules/scheduling/` | Auto-scheduler orchestration, substitution management, cover reports, exam sessions, scenarios, rotation config, analytics, personal timetable, calendar subscriptions, swaps, emergency changes |
| `modules/period-grid/` | Period template configuration (teaching/break/assembly/lunch/free per weekday) |
| `modules/class-requirements/` | Per-class scheduling requirements (teacher, periods/week, room type, consecutive, spread) |
| `modules/staff-availability/` | Teacher available days/times per academic year |
| `modules/staff-preferences/` | Teacher subject/class/time preferences (prefer/avoid, priority) |
| `modules/scheduling-runs/` | Solver run management (trigger, progress, apply, discard), scheduling dashboard |
| `modules/school-closures/` | School closure management (scope: all/year_group/class) |
| `modules/rooms/` | Room CRUD (type, capacity, exclusive) |

**Worker jobs** (scheduling queue):
- `scheduling:solve` / `scheduling:solve-v2` — Run CSP solver
- `scheduling:reap-stale-runs` — Clean up stuck runs (cron)

**Frontend**: 28 pages under `apps/web/src/app/[locale]/(school)/scheduling/` + `/schedules/` + `/timetables/` + `/rooms/`

Key pages:
| Route | Description |
|-------|-------------|
| `/scheduling/dashboard` | KPI cards, workload heatmap, room utilisation, trends |
| `/scheduling/period-grid` | 7-day grid period template editor |
| `/scheduling/curriculum` | Curriculum requirements per year group |
| `/scheduling/competencies` | Teacher qualification matrix (by teacher / by subject) |
| `/scheduling/auto` | Auto-scheduler with prerequisite check, real-time progress |
| `/scheduling/runs/[id]` | Run detail with grid visualisation, apply/discard |
| `/scheduling/substitutions` | Today tab with AI suggestions + history tab |
| `/scheduling/substitution-board` | Public display board (auto-refresh, branding) |
| `/scheduling/my-timetable` | Personal timetable with calendar export |
| `/scheduling/exams` | Exam session management with auto-generate/invigilator assignment |
| `/scheduling/scenarios` | What-if scenario comparison |
| `/scheduling/cover-reports` | Cover duty reports with fairness analysis |

**Shared**: `packages/shared/src/scheduler/` (pure TypeScript CSP solver — types, domain, constraints, preferences, heuristics, solver, validation)

---

## 9. Attendance

**What it does**: Session-based attendance taking, daily summaries, pattern detection (chronic absence, tardiness), parent notifications, bulk upload (CSV/Excel), exceptions-only upload, AI image scan (OCR of handwritten sheets), quick-mark from natural language, auto-lock, historical amendment with audit trail.

**Backend**: `apps/api/src/modules/attendance/`
- 1 controller, 22 endpoints

**Key features**:
- Session management (create, view, cancel, submit/lock)
- Per-student status recording (present/absent/late/excused + reason + time)
- Historical amendment with audit trail
- Daily summaries with parent-facing view
- Exception detection (missing submissions)
- Pattern alerts (chronic absence, recurring day, tardiness) with acknowledge/resolve/notify-parent
- Four input methods: manual, CSV/Excel upload, exceptions-only, AI image scan
- Quick-mark from natural language text

**Worker jobs** (attendance queue):
- `attendance:generate-sessions` — Auto-create sessions per class
- `attendance:detect-pending` — Flag missing submissions
- `attendance:auto-lock` — Lock past-deadline sessions
- `attendance:detect-patterns` — Create alerts, trigger parent notifications

**Frontend**: 6 pages under `apps/web/src/app/[locale]/(school)/attendance/`
| Route | Description |
|-------|-------------|
| `/attendance` | Session list with create dialog, upload/scan links |
| `/attendance/mark/[sessionId]` | Student-by-student marking (radio groups per student) |
| `/attendance/exceptions` | Pending sessions, pattern alerts with actions |
| `/attendance/upload` | CSV/Excel upload, exceptions-only, quick-mark, undo |
| `/attendance/scan` | AI OCR upload, review/edit, confirm |
| `/reports/attendance` | Attendance analytics (heatmap, trends, chronic absentees) |

---

## 10. Gradebook & Report Cards

**What it does**: The largest backend module (148 endpoints, 35+ services). Assessment management, grade entry (spreadsheet-style and results matrix), period grade computation with configurable weights, grade curves (linear/sqrt/bell/custom), rubric-based grading, curriculum standards mapping, competency scales, GPA computation, AI-assisted grading (inline file grading, comment generation, natural language queries), grade publishing to parents, progress reports, report card generation with multi-step approval workflow, template-based PDF rendering, QR verification, delivery tracking, bulk operations, and comprehensive analytics.

**Backend**: `apps/api/src/modules/gradebook/`
- 9 controllers, 148 endpoints

**Sub-features**:
- **Core Gradebook** (24 endpoints): Grade configs, assessments CRUD + status transitions, grade entry (individual + bulk), period grade computation + override, results matrix, year-group weights, bulk import
- **Advanced Features** (29 endpoints): Rubric templates, curriculum standards, competency scales, GPA, grade curves, assessment templates, default grade fill
- **Insights & AI** (28 endpoints): Grade distribution, student/class trends, teacher consistency, cross-class benchmarking, AI comment generation (single + batch), AI inline grading, AI grading instructions with approval, AI grading references, natural language queries with history, AI progress summaries, grade publishing, progress reports
- **Grading Scales** (5 endpoints): CRUD for numeric/letter/custom scales
- **Assessment Categories** (5 endpoints): CRUD for category types (classwork/quiz/midterm/etc.)
- **Transcripts** (2 endpoints): JSON data + PDF rendering
- **Report Cards Core** (9 endpoints): Generate, list, detail, update, publish, revise, batch PDF, single PDF
- **Report Cards Enhanced** (40 endpoints): Templates (CRUD + AI image-to-template), approval configs + workflow (submit/approve/reject/bulk), delivery (single + bulk), custom fields, grade thresholds, parent acknowledgment, QR verification (public), analytics, bulk operations (generate/publish/deliver)
- **Parent Gradebook** (5 endpoints): Parent-facing grades, report cards, transcript PDFs

**Worker jobs** (gradebook queue):
- `gradebook:mass-report-card-pdf` — Bulk PDF generation
- `gradebook:bulk-import-process` — CSV/Excel grade import
- `gradebook:detect-risks` — Daily 02:00 UTC cron, all tenants
- `report-cards:auto-generate` — Daily 03:00 UTC cron, recently closed periods

**Frontend**: 24 pages under `apps/web/src/app/[locale]/(school)/gradebook/` + `/report-cards/` + 9 settings pages
| Route | Description |
|-------|-------------|
| `/gradebook` | Class card grid, click into class gradebook |
| `/gradebook/[classId]` | Tabs: Assessments, Results Matrix, Period Grades, Analytics |
| `/gradebook/[classId]/assessments/new` | Create assessment form |
| `/gradebook/[classId]/assessments/[id]/grades` | Spreadsheet-style grade entry |
| `/gradebook/import` | 4-step import wizard |
| `/gradebook/publishing` | Readiness dashboard, publish to parents |
| `/gradebook/ai` | Natural language query with suggested queries |
| `/gradebook/ai-instructions` | AI grading instruction CRUD with approval workflow |
| `/gradebook/progress-reports` | Generate + history tabs |
| `/gradebook/insights` | Teacher consistency, benchmarking, at-risk students |
| `/report-cards` | Overview + Generate tabs |
| `/report-cards/[id]` | Full detail with approval timeline, AI comments, custom fields, QR |
| `/report-cards/approvals` | Pending approval queue with bulk approve |
| `/report-cards/analytics` | Summary cards, class comparison, term trends |
| `/report-cards/bulk` | 4-step wizard: Generate → Review → Approve → Notify |
| `/settings/grading-scales` | Scale editor (numeric ranges / letter grades) |
| `/settings/grading-weights` | Category weight config per year group per period |
| `/settings/grade-thresholds` | Threshold config editor |
| `/settings/assessment-categories` | Category CRUD |
| `/settings/assessment-templates` | Template CRUD |
| `/settings/rubric-templates` | Rubric criteria + levels editor |
| `/settings/competency-scales` | Competency scale level editor |
| `/settings/curriculum-standards` | Standards CRUD with bulk import |
| `/settings/report-card-templates` | Template section editor with AI conversion |

---

## 11. Finance

**What it does**: Full financial management — fee structures, discounts, fee assignments, fee generation (preview + confirm), invoicing with 9-state lifecycle, manual payment recording with allocation, Stripe online payments, receipts with PDF, refunds with approval, installment plans, household statements, credit notes, late fees, scholarships, payment plans (approve/reject/counter-offer), recurring invoices, payment reminders (due-soon/overdue/final-notice), bulk operations, parent portal (view invoices, pay online, request payment plan), financial reports (aging, revenue, collection, payment methods, fee performance), and audit trail.

**Backend**: `apps/api/src/modules/finance/`
- 12 controllers, 87 endpoints

**Worker jobs** (finance queue):
- `finance:overdue-detection` — Mark overdue invoices (cron)
- `finance:on-approval` — Invoice approval callback

**Frontend**: 23 pages under `apps/web/src/app/[locale]/(school)/finance/`
| Route | Description |
|-------|-------------|
| `/finance` | Dashboard with revenue, payments, outstanding, collection rate |
| `/finance/invoices` | List with status tabs, bulk actions |
| `/finance/invoices/[id]` | Detail with lines, payments, installments |
| `/finance/payments` | List, record new, allocate to invoices |
| `/finance/payments/[id]` | Detail with allocation panel, receipt PDF |
| `/finance/fee-structures` | CRUD |
| `/finance/fee-assignments` | Link households to fee structures |
| `/finance/fee-generation` | Preview + confirm invoice generation |
| `/finance/discounts` | CRUD |
| `/finance/refunds` | List with approve/reject/execute |
| `/finance/statements` | Household ledger with PDF |
| `/finance/credit-notes` | CRUD with apply-to-invoice |
| `/finance/scholarships` | CRUD with revoke |
| `/finance/payment-plans` | Approve/reject/counter-offer |
| `/finance/audit-trail` | Financial audit log with change diff |
| `/finance/reports` | 5-tab reports: Aging, Revenue, Collection, Methods, Performance |

---

## 12. Payroll

**What it does**: Monthly payroll runs with salaried and per-class compensation models, staff attendance tracking, class delivery confirmation, allowances/deductions, one-off bonuses, payroll adjustments, approval workflow with school-owner bypass, payslip generation with sequence numbers, mass PDF export, email-to-accountant, export templates, payroll reports (cost trend, YTD, bonus analysis, variance, forecast), anomaly detection, payroll calendar.

**Backend**: `apps/api/src/modules/payroll/`
- 7 controllers, 79 endpoints

**Worker jobs** (payroll queue):
- `payroll:generate-sessions` — Background session generation
- `payroll:mass-export-payslips` — Bulk PDF + S3 upload
- `payroll:on-approval` — Payroll finalisation callback (generates payslips)

**Frontend**: 10 pages under `apps/web/src/app/[locale]/(school)/payroll/`
| Route | Description |
|-------|-------------|
| `/payroll` | Dashboard with cost trend, calendar deadlines |
| `/payroll/runs` | Run list with create dialog |
| `/payroll/runs/[id]` | Entries table, finalise, anomaly scan, mass export |
| `/payroll/compensation` | Compensation records with bulk CSV import |
| `/payroll/staff-attendance` | Daily attendance grid for all staff |
| `/payroll/class-delivery` | Class delivery tracker with auto-populate |
| `/payroll/my-payslips` | Self-service payslip download |
| `/payroll/reports` | Cost trend, YTD, bonus, variance, forecast |
| `/payroll/exports` | Export templates and history |
| `/payroll/staff/[id]` | Staff payment history |

---

## 13. Communications

**What it does**: Announcement system with audience targeting (school/year_group/class/household/custom), multi-channel delivery (email/WhatsApp/in-app), delivery tracking (queued/sent/delivered/failed/read), approval workflow, scheduling, notification templates, user notification inbox with unread count, failed delivery admin view, and webhook handlers for email (Resend/Svix) and WhatsApp (Twilio) delivery status.

**Backend**: `apps/api/src/modules/communications/`
- 4 controllers (announcements, notification templates, notifications, webhooks), 17 endpoints

**Worker jobs** (notifications queue):
- `communications:publish-announcement` — Publish and dispatch
- `communications:dispatch-notifications` — Send per-channel
- `communications:retry-failed-notifications` — Retry failures (cron)
- `communications:on-approval` — Announcement approval callback
- `communications:ip-cleanup` — Privacy IP cleanup (cron)

Plus 2 more from other modules that use the notifications queue.

**Frontend**: `apps/web/src/app/[locale]/(school)/communications/`
| Route | Description |
|-------|-------------|
| `/communications` | Announcement list with status tabs |
| `/communications/new` | Create with scope, channels, schedule |
| `/communications/[id]` | Detail with delivery stats |
| `/communications/inquiries` | Admin inquiry list (redirects to parent-inquiries) |
| `/announcements` | Parent-facing announcement feed |

---

## 14. Parent Inquiries

**What it does**: Two-way messaging between parents and school administration. Parents submit inquiries linked to a student, admins respond in a chat-style thread, inquiries have status lifecycle (open → in_progress → closed), stale inquiry detection.

**Backend**: `apps/api/src/modules/parent-inquiries/`
- 1 controller, 8 endpoints

**Worker jobs** (notifications queue):
- `communications:inquiry-notification` — Notify staff of new inquiries
- `communications:stale-inquiry-detection` — Flag unanswered inquiries (cron)

**Frontend**: `apps/web/src/app/[locale]/(school)/inquiries/`
| Route | Description |
|-------|-------------|
| `/inquiries` | Parent's own inquiry list |
| `/inquiries/new` | Submit new inquiry |
| `/inquiries/[id]` | Chat-style thread |

---

## 15. Admissions

**What it does**: Configurable admission forms with versioning, public application submission (no auth required), application review pipeline (submit → review → accept/reject), approval workflow for acceptances, application notes, fee handling (payment received/plan/waive), conversion to enrolled student (creates household + parents + student), parent-facing application tracking, analytics.

**Backend**: `apps/api/src/modules/admissions/`
- 4 controllers (admission forms, applications, parent applications, public admissions), 21 endpoints

**Worker jobs** (admissions queue):
- `admissions:auto-expiry` — Expire stale applications (cron)

**Frontend**: `apps/web/src/app/[locale]/(school)/` and `(public)/`
| Route | Description |
|-------|-------------|
| `/settings/admissions` | (form management via settings) |
| `/applications` | Application list with status pipeline |
| `/applications/[id]` | Detail with review, notes, convert, fee actions |
| `/apply` | Public application form (dynamic from published form definition) |

---

## 16. Approvals

**What it does**: Generic approval workflow engine. Configurable workflows with steps. Used by announcements (publish), invoices (issue), payroll (finalise). Central dispatch hub for approval callbacks via BullMQ.

**Backend**: `apps/api/src/modules/approvals/`
- 2 controllers (workflows, requests), 9 endpoints
- **Critical**: `MODE_A_CALLBACKS` mapping dispatches approved requests to domain-specific worker queues

**Frontend**: Approval actions are embedded in the domain pages (communications, finance, payroll, report cards), not a standalone page.

---

## 17. Reports & Analytics

**What it does**: Comprehensive analytics platform with unified KPI dashboard, cross-module insights (attendance vs grades, cost per student, year group health, teacher effectiveness), domain-specific analytics (attendance, grades, demographics, admissions, staff), custom report builder with saved reports, board reports, compliance report templates with auto-population, scheduled reports, report alerts with thresholds, AI-powered narrative generation and trend prediction, Excel export.

**Backend**: `apps/api/src/modules/reports/`
- 2 controllers (base + enhanced), 66 endpoints
- Queries ALL domain tables directly via PrismaService (no module imports)

**Frontend**: 20 pages under `apps/web/src/app/[locale]/(school)/reports/`
| Route | Description |
|-------|-------------|
| `/reports` | KPI dashboard hub |
| `/reports/attendance` | Attendance analytics (6 sub-reports) |
| `/reports/grades` | Grade analytics (6 sub-reports) |
| `/reports/demographics` | Demographics (6 sub-reports) |
| `/reports/admissions` | Admissions analytics (5 sub-reports) |
| `/reports/staff` | Staff analytics (6 sub-reports) |
| `/reports/insights` | Cross-module insights (4 sub-reports) |
| `/reports/student-progress` | Individual student progress |
| `/reports/builder` | Custom report builder |
| `/reports/board` | Board-level reports |
| `/reports/compliance` | Compliance templates |
| `/reports/scheduled` | Scheduled report management |
| `/reports/alerts` | Threshold-based alerts |
| `/reports/ask-ai` | AI narrative + prediction |
| `/reports/promotion-rollover` | Promotion report |
| `/reports/fee-generation` | Fee generation history |
| `/reports/write-offs` | Write-off report |
| `/reports/notification-delivery` | Delivery analytics |
| `/reports/student-export` | Student data export |
| `/reports/workload` | Staff workload |

---

## 18. Website CMS

**What it does**: Per-school public website with page management, CMS editor, SEO fields, navigation structure, page types (home/about/admissions/contact/custom), publish/unpublish lifecycle, public contact form with spam detection, and ISR-rendered public pages.

**Backend**: `apps/api/src/modules/website/`
- 4 controllers (pages, contact submissions, public pages, public contact), 13 endpoints

**Frontend**: `apps/web/src/app/[locale]/(school)/website/` + `(public)/`
| Route | Description |
|-------|-------------|
| `/website` | Page list with status tabs |
| `/website/new` | Page editor (title, slug, HTML body, SEO, nav) |
| `/website/[id]` | Edit page with publish/unpublish toggle |
| `/website/contact-submissions` | Contact form submissions with status management |
| `(public)/[slug]` | ISR-rendered public page |
| `(public)/contact` | Public contact form |

---

## 19. Search

**What it does**: Global fuzzy search across students, parents, staff, households via Meilisearch with tenant-safe indexes. Entity mutations trigger async search index updates.

**Backend**: `apps/api/src/modules/search/`
- 1 controller, 1 endpoint: `GET v1/search`

**Worker jobs** (search-sync queue):
- `search:index-entity` — Index single entity on mutation
- `search:full-reindex` — Full reindex (admin-triggered)

---

## 20. Dashboards

**What it does**: Role-specific landing pages. Admin sees school stats, incomplete households, attendance, admissions. Parent sees linked students, invoices, announcements, AI insights. Teacher sees today's schedule, sessions, pending attendance.

**Backend**: `apps/api/src/modules/dashboard/`
- 1 controller, 3 endpoints: school-admin, parent, teacher

**Frontend**: `apps/web/src/app/[locale]/(school)/dashboard/`
| Route | Description |
|-------|-------------|
| `/dashboard` | Admin dashboard (auto-redirects by role) |
| `/dashboard/parent` | Parent overview with tabs (grades, timetable, finances) |
| `/dashboard/teacher` | Today's lessons, attendance sessions, pending submissions |

---

## 21. Authentication

**What it does**: Email/password login, optional TOTP MFA with recovery codes, JWT access tokens (15min, in-memory), refresh tokens (7-day, httpOnly cookie, Redis-backed), concurrent sessions, session revocation, tenant switching for multi-tenant users, invitation-based staff onboarding, admissions-linked parent onboarding, password reset, brute force protection.

**Backend**: `apps/api/src/modules/auth/`
- 1 controller, 12 endpoints under `v1/auth`

**Frontend**: `apps/web/src/app/[locale]/(auth)/`
| Route | Description |
|-------|-------------|
| `/login` | Email/password + MFA |
| `/register` | Accept invitation (token-based) |
| `/reset-password` | Request + confirm password reset |
| `/mfa-verify` | 6-digit code or recovery code |
| `/select-school` | Tenant selector for multi-tenant users |

---

## 22. RBAC

**What it does**: Role-based access control with tiered permissions (platform/admin/staff/parent), custom role creation within tier constraints, permission caching in Redis (60s TTL), multi-role handling with context switcher, invitation system with email delivery.

**Backend**: `apps/api/src/modules/rbac/`
- 4 controllers (roles, permissions, memberships, invitations), 16 endpoints

**Frontend**: `apps/web/src/app/[locale]/(school)/settings/`
| Route | Description |
|-------|-------------|
| `/settings/roles` | Role list |
| `/settings/roles/new` | Create role with permission assignment |
| `/settings/roles/[id]` | Edit role permissions |
| `/settings/users` | User management with role/status |
| `/settings/invitations` | Send/revoke invitations |

---

## 23. Configuration

**What it does**: Tenant-level settings (JSONB god object covering all modules), branding (logo, colors), Stripe payment configuration (AES-256 encrypted keys), notification settings per type.

**Backend**: `apps/api/src/modules/configuration/`
- 4 controllers (settings, branding, stripe, notifications), 8 endpoints

**Frontend**: `apps/web/src/app/[locale]/(school)/settings/`
| Route | Description |
|-------|-------------|
| `/settings/general` | School name, timezone, locale, module settings |
| `/settings/branding` | Logo upload, color scheme |
| `/settings/stripe` | Stripe key configuration |
| `/settings/notifications` | Channel toggles per notification type |
| `/settings/custom-fields` | Tenant-specific custom fields |

---

## 24. Preferences

**What it does**: Per-user UI preferences (sidebar, theme, locale, table configs, saved filters, recent/pinned records, active tabs) and communication preferences (channels, language).

**Backend**: `apps/api/src/modules/preferences/`
- 1 controller, 2 endpoints under `v1/me/preferences`

**Frontend**: `apps/web/src/app/[locale]/(school)/profile/`
| Route | Description |
|-------|-------------|
| `/profile` | Personal info, MFA setup, active sessions |
| `/profile/communication` | Communication channel preferences |

---

## 25. Compliance (GDPR)

**What it does**: Data subject request management (access export, erasure, rectification). Request lifecycle: submitted → classified → approved/rejected → completed. Execution via background job (erasure/anonymisation).

**Backend**: `apps/api/src/modules/compliance/`
- 1 controller, 8 endpoints under `v1/compliance-requests`

**Worker jobs** (shares imports queue):
- `compliance:execute` — Execute approved data actions

**Frontend**: `apps/web/src/app/[locale]/(school)/settings/compliance`

---

## 26. Imports

**What it does**: Bulk data import from CSV/XLSX for 6 entity types (students, parents, staff, fees, exam results, staff compensation). Upload → validate → preview → confirm → process pipeline with rollback capability.

**Backend**: `apps/api/src/modules/imports/`
- 1 controller, 6 endpoints under `v1/imports`

**Worker jobs** (imports queue):
- `imports:validate` — File validation
- `imports:process` — Data processing
- `imports:file-cleanup` — S3 cleanup (cron)

**Frontend**: `apps/web/src/app/[locale]/(school)/settings/imports`

---

## 27. Platform Admin

**What it does**: Platform superadmin operations — tenant provisioning, tenant status management (active/suspended/archived), domain management with verification, module enablement per tenant, user impersonation, MFA reset, platform dashboard.

**Backend**: `apps/api/src/modules/tenants/`
- 2 controllers (tenants, domains), 16 endpoints
- **Also exports**: `SequenceService` (used by 13 other modules) and `TenantsService`

**Frontend**: `apps/web/src/app/[locale]/(platform)/admin/`
| Route | Description |
|-------|-------------|
| `/admin` | Platform dashboard (tenant/user counts) |
| `/admin/tenants` | Tenant list |
| `/admin/tenants/new` | Create tenant |
| `/admin/tenants/[id]` | Detail with status, domains, modules, impersonation |
| `/admin/audit-log` | Platform audit log |

---

## 28. Behaviour

**What it does**: The second-largest backend module (214 endpoints, 30 services). Incident logging (detailed, quick-log, bulk positive, AI-parsed), configurable point system with house aggregation, automated policy engine (condition/action rules with versioning), sanctions with suspension lifecycle, interventions with review cycles, formal exclusion cases with board packs and decision letters, appeals with evidence bundles, safeguarding concerns with Tusla/Garda referrals and sealed records, student behaviour profiles with timelines, recognition wall with publications, analytics with AI-powered narrative, parent portal, document generation, task management, pattern detection alerts, guardian restrictions, amendment audit trail, and GDPR-aligned data retention.

**Backend**: `apps/api/src/modules/behaviour/`
- 17 controllers, 30 services, 214 endpoints

| Controller | Endpoints | Route Prefix | Key Features |
|------------|-----------|-------------|-------------|
| `behaviour.controller.ts` | 21 | `v1/behaviour/incidents` | Incident CRUD, quick-log, bulk positive, AI parse, follow-ups, participants, attachments, policy evaluation, history |
| `behaviour-config.controller.ts` | 21 | `v1/behaviour/categories`, `policies`, `description-templates`, `document-templates` | Category CRUD, policy CRUD with versioning/export/import/replay/dry-run, description templates, document templates |
| `behaviour-admin.controller.ts` | 21 | `v1/behaviour/admin` | Health check, dead-letter retry, recompute points, rebuild awards, recompute pulse, backfill tasks, resend notifications, refresh views, policy dry-run, scope audit, reindex search, retention preview/execute, legal holds |
| `safeguarding.controller.ts` | 21 | `v1/safeguarding` | Concern CRUD with status transitions, assign lead, action log, Tusla/Garda referrals, attachments, case file (full + redacted), seal initiate/approve, dashboard, break-glass access/review |
| `behaviour-analytics.controller.ts` | 20 | `v1/behaviour/analytics` | Pulse, overview, heatmap (live + historical), trends, categories, subjects, staff, sanctions, interventions, ratio, comparisons, policy effectiveness, task completion, benchmarks, teachers, class comparisons, CSV export, AI query + history |
| `behaviour-sanctions.controller.ts` | 14 | `v1/behaviour/sanctions` | Sanction CRUD, today view, my-supervision, calendar, active suspensions, returning-soon, bulk mark-served, status transitions, parent meeting, appeal + outcome |
| `behaviour-students.controller.ts` | 13 | `v1/behaviour/students` | Student list, profile, timeline, analytics, points, sanctions, interventions, awards, AI summary, preview, export, parent-view, tasks |
| `behaviour-interventions.controller.ts` | 12 | `v1/behaviour/interventions` | Intervention CRUD, overdue, my-assigned, outcomes, status transitions, reviews, auto-populate, complete |
| `behaviour-recognition.controller.ts` | 12 | `v1/behaviour/recognition` | Recognition wall, leaderboard, house points/detail, award CRUD, publications with approve/reject, public feed, bulk house assign |
| `behaviour-appeals.controller.ts` | 10 | `v1/behaviour/appeals` | Appeal CRUD, decide, withdraw, attachments, generate decision letter, evidence bundle |
| `behaviour-exclusions.controller.ts` | 10 | `v1/behaviour/exclusion-cases` | Exclusion case CRUD, status transitions, generate notice, generate board pack, record decision, timeline, documents |
| `behaviour-alerts.controller.ts` | 8 | `v1/behaviour/alerts` | Alert list, badge count, detail, seen/acknowledge/snooze/resolve/dismiss |
| `behaviour-tasks.controller.ts` | 8 | `v1/behaviour/tasks` | Task list, my-tasks, overdue, stats, detail, update, complete, cancel |
| `behaviour-parent.controller.ts` | 7 | `v1/parent/behaviour` | Parent summary, incidents, points/awards, sanctions, acknowledge, recognition, appeal |
| `behaviour-documents.controller.ts` | 6 | `v1/behaviour/documents` | Generate, list, detail, finalise, send, download |
| `behaviour-guardian-restrictions.controller.ts` | 6 | `v1/behaviour/guardian-restrictions` | Restriction CRUD, active list, revoke |
| `behaviour-amendments.controller.ts` | 4 | `v1/behaviour/amendments` | Amendment list, pending, detail, send correction notice |

**Worker jobs** (16 processors across `behaviour` and `notifications` queues):

| Job Name | Queue | Trigger | Description |
|----------|-------|---------|-------------|
| `behaviour:cron-dispatch-daily` | behaviour | Cron (hourly) | Cross-tenant dispatcher — enqueues per-tenant daily jobs at correct local hour |
| `behaviour:cron-dispatch-sla` | behaviour | Cron (every 5 min) | Cross-tenant dispatcher — enqueues safeguarding SLA checks |
| `behaviour:cron-dispatch-monthly` | behaviour | Cron (1st of month) | Cross-tenant dispatcher — enqueues retention checks |
| `behaviour:evaluate-policy` | behaviour | On incident create/update | Run policy engine rules, auto-create sanctions/tasks/notifications |
| `behaviour:detect-patterns` | behaviour | Daily (05:00 UTC via cron-dispatch) | Detect escalating behaviour patterns, create alerts |
| `behaviour:check-awards` | behaviour | On points change | Evaluate award thresholds, grant awards |
| `behaviour:suspension-return` | behaviour | Daily (07:00 TZ via cron-dispatch) | Process suspension end dates, update statuses |
| `behaviour:task-reminders` | behaviour | Daily (08:00 TZ via cron-dispatch) | Send reminders for overdue/upcoming tasks |
| `behaviour:guardian-restriction-check` | behaviour | Daily (06:00 UTC via cron-dispatch) | Check restriction expiry and compliance |
| `behaviour:retention-check` | behaviour | Monthly (via cron-dispatch) | GDPR retention policy enforcement |
| `behaviour:attachment-scan` | behaviour | On attachment upload | Scan uploaded files for malware/policy compliance |
| `behaviour:refresh-mv-student-summary` | behaviour | On incident/sanction change | Refresh materialised view for student behaviour summary |
| `behaviour:refresh-mv-benchmarks` | behaviour | On data change | Refresh materialised view for benchmarks |
| `behaviour:refresh-mv-exposure-rates` | behaviour | On data change | Refresh materialised view for exposure rates |
| `behaviour:partition-maintenance` | behaviour | Periodic | Manage table partitions for behaviour data |
| `behaviour:break-glass-expiry` | behaviour | On break-glass grant | Expire temporary safeguarding access after timeout |
| `safeguarding:sla-check` | behaviour | Every 5 min (via cron-dispatch) | Check safeguarding concern SLA deadlines, escalate overdue |
| `safeguarding:critical-escalation` | behaviour | On SLA breach | Escalate critical safeguarding concerns to senior staff |
| `behaviour:parent-notification` | notifications | On incident/sanction | Send parent notifications for behaviour events |
| `behaviour:digest-notifications` | notifications | Daily (digest_time TZ via cron-dispatch) | Send daily digest emails to parents |

**Frontend**: 37 pages across `apps/web/src/app/[locale]/(school)/behaviour/`, `(school)/safeguarding/`, and `(school)/settings/behaviour-*`

Behaviour pages (25):
| Route | Description |
|-------|-------------|
| `/behaviour` | Dashboard with pulse, recent incidents, quick actions |
| `/behaviour/incidents` | Incident list with status/polarity/date filters |
| `/behaviour/incidents/new` | Detailed incident creation form |
| `/behaviour/incidents/[id]` | Incident detail with timeline, participants, attachments, policy evaluation |
| `/behaviour/students` | Student behaviour directory with search |
| `/behaviour/students/[studentId]` | Student profile with timeline, points, sanctions, interventions, AI summary |
| `/behaviour/sanctions` | Sanction list with status/type filters |
| `/behaviour/sanctions/today` | Today's sanctions with supervision assignments |
| `/behaviour/appeals` | Appeal list with status filters |
| `/behaviour/appeals/[id]` | Appeal detail with evidence, decision workflow |
| `/behaviour/interventions` | Intervention list with status/type filters |
| `/behaviour/interventions/new` | Create intervention form |
| `/behaviour/interventions/[id]` | Intervention detail with reviews, status transitions |
| `/behaviour/exclusions` | Exclusion case list |
| `/behaviour/exclusions/[id]` | Exclusion detail with timeline, documents, board pack, decision |
| `/behaviour/alerts` | Pattern detection alerts with acknowledge/resolve/dismiss |
| `/behaviour/tasks` | Task management with overdue/my-tasks views |
| `/behaviour/amendments` | Amendment history with correction notice workflow |
| `/behaviour/guardian-restrictions` | Guardian restriction management |
| `/behaviour/recognition` | Recognition wall with awards and leaderboard |
| `/behaviour/documents` | Generated documents list with download/send |
| `/behaviour/analytics` | Analytics dashboard with heatmap, trends, categories, comparisons |
| `/behaviour/analytics/ai` | AI-powered narrative queries with history |
| `/behaviour/parent-portal` | Parent-facing behaviour summary |
| `/behaviour/parent-portal/recognition` | Parent-facing recognition feed |

Safeguarding pages (5):
| Route | Description |
|-------|-------------|
| `/safeguarding` | Safeguarding dashboard with SLA status |
| `/safeguarding/concerns` | Concern list with status/priority filters |
| `/safeguarding/concerns/new` | Report new safeguarding concern |
| `/safeguarding/concerns/[id]` | Concern detail with actions, referrals, seal workflow, case file |
| `/safeguarding/my-reports` | Own reported concerns |

Settings pages (7):
| Route | Description |
|-------|-------------|
| `/settings/behaviour-general` | General behaviour settings (points, notifications, digest) |
| `/settings/behaviour-categories` | Incident category management |
| `/settings/behaviour-policies` | Policy rule configuration with versioning |
| `/settings/behaviour-houses` | House setup for house points system |
| `/settings/behaviour-awards` | Award threshold configuration |
| `/settings/behaviour-admin` | Admin operations (recompute, rebuild, retention) |
| `/settings/behaviour-documents` | Document template management |

**Permissions** (14):
| Permission | Tier | Description |
|------------|------|-------------|
| `behaviour.log` | staff | Create incidents, access quick-log |
| `behaviour.view` | staff | View incidents within scope |
| `behaviour.manage` | staff | Manage sanctions, interventions, tasks, appeals |
| `behaviour.view_sensitive` | staff | View context notes and SEND notes |
| `behaviour.amend` | staff | Send correction notices for incident amendments |
| `behaviour.ai_query` | staff | AI narrative and natural language query |
| `behaviour.view_staff_analytics` | admin | View staff logging activity |
| `behaviour.admin` | admin | Configure behaviour module, admin operations |
| `behaviour.appeal` | parent | Submit appeal as parent |
| `parent.view_behaviour` | parent | View behaviour data for linked students |
| `safeguarding.report` | staff | Report safeguarding concerns |
| `safeguarding.view` | admin | View safeguarding concerns |
| `safeguarding.manage` | admin | Manage safeguarding concerns |
| `safeguarding.seal` | admin | Seal safeguarding concerns (irreversible) |

**Shared types**: `packages/shared/src/behaviour/`
- Enums: `enums.ts` (polarity, entity types, task types/status, change types, scope levels)
- State machines: `state-machine.ts` (incidents), `state-machine-sanction.ts`, `state-machine-intervention.ts`, `state-machine-appeal.ts`, `state-machine-exclusion.ts`, `state-machine-task.ts`, `safeguarding-state-machine.ts`
- Data classification: `data-classification.ts` (GDPR field-level classification)
- Scope: `scope.ts` (visibility scope resolution)
- School calendar: `school-calendar.ts` (school-day calculations for suspensions)
- Schemas (28 files): `schemas/incident.schema.ts`, `schemas/sanction.schema.ts`, `schemas/intervention.schema.ts`, `schemas/appeal.schema.ts`, `schemas/exclusion.schema.ts`, `schemas/safeguarding.schema.ts`, `schemas/analytics.schema.ts`, `schemas/policy-rules.schema.ts`, `schemas/policy-condition.schema.ts`, `schemas/policy-action-config.schema.ts`, `schemas/policy-dry-run.schema.ts`, `schemas/policy-replay.schema.ts`, `schemas/recognition.schema.ts`, `schemas/category.schema.ts`, `schemas/house.schema.ts`, `schemas/settings.schema.ts`, `schemas/task.schema.ts`, `schemas/alert.schema.ts`, `schemas/amendment.schema.ts`, `schemas/guardian-restriction.schema.ts`, `schemas/legal-hold.schema.ts`, `schemas/admin-ops.schema.ts`, `schemas/quick-log.schema.ts`, `schemas/template.schema.ts`, `schemas/participant.schema.ts`, `schemas/document.schema.ts`, `schemas/parent-behaviour.schema.ts`

**Depends on**: AuthModule (user resolution), TenantsModule (tenant context, sequences), ApprovalsModule (appeal/exclusion approval workflows), PdfRenderingModule (document generation, board packs, decision letters), S3Module (attachment storage)
