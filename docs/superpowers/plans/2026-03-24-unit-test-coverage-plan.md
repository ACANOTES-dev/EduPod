# Unit Test Coverage Plan — Parallel Agent Execution

## Current State: 111 spec files, 1333 tests passing, ~170 untested files

Each section below is an independent batch that can be assigned to a separate agent.

---

## BATCH 1: Academics + Class Requirements + Dashboard (14 files)
**Priority: HIGH** (core academic data)

Needs tests:
- academics/academic-years.service.ts
- academics/academic-periods.service.ts
- academics/subjects.service.ts
- academics/year-groups.service.ts
- academics/promotion.service.ts
- academics/year-groups.controller.ts
- academics/promotion.controller.ts
- academics/academic-years.controller.ts
- academics/academic-periods.controller.ts
- academics/subjects.controller.ts
- class-requirements/class-requirements.service.ts
- class-requirements/class-requirements.controller.ts
- dashboard/dashboard.service.ts
- dashboard/dashboard.controller.ts

---

## BATCH 2: Classes + Households + Parents + Students (12 files)
**Priority: HIGH** (core student/class data)

Needs tests:
- classes/classes.controller.ts
- classes/class-assignments.service.ts
- classes/class-assignments.controller.ts
- classes/class-enrolments.service.ts
- classes/class-enrolments.controller.ts
- households/households.service.ts
- households/households.controller.ts
- parents/parents.service.ts
- parents/parents.controller.ts
- students/students.controller.ts
- staff-profiles/staff-profiles.service.ts
- staff-profiles/staff-profiles.controller.ts

---

## BATCH 3: Scheduling Core (24 files)
**Priority: HIGH** (largest untested area)

Needs tests:
- scheduling/curriculum-requirements.service.ts
- scheduling/curriculum-requirements.controller.ts
- scheduling/teacher-competencies.service.ts
- scheduling/teacher-competencies.controller.ts
- scheduling/teacher-scheduling-config.service.ts
- scheduling/teacher-scheduling-config.controller.ts
- scheduling/break-groups.service.ts
- scheduling/break-groups.controller.ts
- scheduling/room-closures.service.ts
- scheduling/room-closures.controller.ts
- scheduling/cover-teacher.service.ts
- scheduling/cover-teacher.controller.ts
- scheduling/scheduler-orchestration.service.ts
- scheduling/scheduler-orchestration.controller.ts
- scheduling/scheduler-validation.service.ts
- scheduling/scheduler-validation.controller.ts
- scheduling/scheduling-enhanced.controller.ts
- scheduling/scheduling-public.controller.ts
- scheduling-runs/scheduling-runs.service.ts
- scheduling-runs/scheduling-runs.controller.ts
- scheduling-runs/scheduling-apply.service.ts
- scheduling-runs/scheduling-prerequisites.service.ts
- scheduling-runs/scheduling-dashboard.service.ts
- scheduling-runs/scheduling-dashboard.controller.ts

---

## BATCH 4: Finance Core (23 files)
**Priority: MEDIUM** (new enhancement services already tested, these are original)

Needs tests:
- finance/fee-structures.service.ts
- finance/fee-structures.controller.ts
- finance/discounts.service.ts
- finance/discounts.controller.ts
- finance/fee-assignments.service.ts
- finance/fee-assignments.controller.ts
- finance/fee-generation.service.ts
- finance/fee-generation.controller.ts
- finance/invoices.service.ts
- finance/invoices.controller.ts
- finance/payments.service.ts
- finance/payments.controller.ts
- finance/receipts.service.ts
- finance/refunds.service.ts
- finance/refunds.controller.ts
- finance/household-statements.service.ts
- finance/household-statements.controller.ts
- finance/stripe.service.ts
- finance/stripe-webhook.controller.ts
- finance/finance-dashboard.service.ts
- finance/finance-dashboard.controller.ts
- finance/finance-enhanced.controller.ts
- finance/parent-finance.controller.ts

---

## BATCH 5: Gradebook Remaining (26 files)
**Priority: MEDIUM** (enhancement services tested, original core + controllers untested)

Needs tests:
- gradebook/report-cards/report-cards.service.ts
- gradebook/report-cards/report-cards.controller.ts
- gradebook/report-cards/report-cards-enhanced.controller.ts
- gradebook/report-cards/grade-threshold.service.ts
- gradebook/assessments/assessments.service.ts
- gradebook/assessments/grade-curve.service.ts
- gradebook/grading/period-grade-computation.service.ts
- gradebook/grading/gpa.service.ts
- gradebook/grading/rubric.service.ts
- gradebook/grading/analytics.service.ts
- gradebook/ai/ai-progress-summary.service.ts
- gradebook/bulk-import.service.ts
- gradebook/results-matrix.service.ts
- gradebook/grades.service.ts
- gradebook/grading-scales.service.ts
- gradebook/grading-scales.controller.ts
- gradebook/assessment-categories.service.ts
- gradebook/assessment-categories.controller.ts
- gradebook/class-grade-configs.service.ts
- gradebook/transcripts.service.ts
- gradebook/transcripts.controller.ts
- gradebook/year-group-grade-weights.service.ts
- gradebook/gradebook.controller.ts
- gradebook/gradebook-advanced.controller.ts
- gradebook/gradebook-insights.controller.ts
- gradebook/parent-gradebook.controller.ts

---

## BATCH 6: Reports + Payroll Remaining (19 files)
**Priority: MEDIUM**

Needs tests:
- reports/student-progress.service.ts
- reports/staff-analytics.service.ts
- reports/report-alerts.service.ts
- reports/ai-report-narrator.service.ts
- reports/ai-predictions.service.ts
- reports/custom-report-builder.service.ts
- reports/report-export.service.ts
- reports/compliance-report.service.ts
- reports/reports.controller.ts
- reports/reports-enhanced.controller.ts
- payroll/payroll-dashboard.service.ts
- payroll/payroll-dashboard.controller.ts
- payroll/payroll-reports.service.ts
- payroll/payroll-reports.controller.ts
- payroll/payroll-runs.controller.ts
- payroll/compensation.controller.ts
- payroll/payroll-entries.controller.ts
- payroll/payslips.controller.ts
- payroll/payroll-enhanced.controller.ts

---

## BATCH 7: RBAC + Auth + Communications + Config (20 files)
**Priority: MEDIUM**

Needs tests:
- rbac/roles.controller.ts
- rbac/invitations.controller.ts
- rbac/permissions.controller.ts
- rbac/memberships.controller.ts
- auth/auth.controller.ts
- communications/announcements.controller.ts
- communications/notification-templates.controller.ts
- communications/notifications.controller.ts
- communications/webhook.controller.ts
- configuration/settings.controller.ts
- configuration/branding.service.ts
- configuration/branding.controller.ts
- configuration/stripe-config.service.ts
- configuration/stripe-config.controller.ts
- configuration/notification-settings.service.ts
- configuration/notification-settings.controller.ts
- approvals/approval-workflows.service.ts
- approvals/approval-requests.controller.ts
- approvals/approval-workflows.controller.ts
- compliance/compliance.controller.ts

---

## BATCH 8: Small Modules (20 files)
**Priority: LOW** (infrastructure + small modules)

Needs tests:
- schedules/schedules.service.ts
- schedules/schedules.controller.ts
- schedules/timetables.service.ts
- schedules/timetables.controller.ts
- school-closures/school-closures.controller.ts
- imports/import.controller.ts
- imports/import-template.service.ts
- health/health.controller.ts
- audit-log/audit-log.controller.ts
- audit-log/engagement.controller.ts
- parent-inquiries/parent-inquiries.controller.ts
- search/search.service.ts
- search/search-index.service.ts
- search/search.controller.ts
- registration/registration.service.ts
- registration/registration.controller.ts
- staff-availability/staff-availability.service.ts
- staff-availability/staff-availability.controller.ts
- staff-preferences/staff-preferences.service.ts
- staff-preferences/staff-preferences.controller.ts
- rooms/rooms.service.ts
- rooms/rooms.controller.ts
- period-grid/period-grid.service.ts
- period-grid/period-grid.controller.ts
- pdf-rendering/pdf-rendering.service.ts
- prisma/prisma.service.ts
- redis/redis.service.ts
- s3/s3.service.ts
- tenants/domains.service.ts
- tenants/domains.controller.ts
- tenants/tenants.controller.ts
- website/website-pages.controller.ts
- website/public-website.service.ts
- website/public-website.controller.ts
- website/contact-submissions.controller.ts
- website/public-contact.controller.ts

---

## SUMMARY

| Batch | Files | Priority | Focus |
|-------|-------|----------|-------|
| 1 | 14 | HIGH | Academics, class requirements, dashboard |
| 2 | 12 | HIGH | Classes, households, parents, students, staff |
| 3 | 24 | HIGH | Scheduling core + scheduling runs |
| 4 | 23 | MEDIUM | Finance core (original services) |
| 5 | 26 | MEDIUM | Gradebook remaining |
| 6 | 19 | MEDIUM | Reports + payroll remaining |
| 7 | 20 | MEDIUM | RBAC, auth, comms, config, approvals |
| 8 | 36 | LOW | Small/infrastructure modules |
| **Total** | **~174** | | |

Each batch is independent — no cross-dependencies between batches.
