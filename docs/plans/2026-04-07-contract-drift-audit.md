# Contract Drift Audit

Date: 2026-04-07

## Scope

- Static read-only audit of frontend API callers under `apps/web/src` against backend controllers and Zod-validated request contracts under `apps/api/src` and `packages/shared/src`.
- No code was changed as part of the audit.
- This report includes all findings from the static pass, grouped by type and labelled with confidence where helpful.

## Summary

- Backend routes scanned: **1447**
- Frontend API calls scanned: **1226**
- Missing route findings: **181**
- Query drift findings: **78**
- Body drift findings: **59**
- Hard page-size limit mismatches: **11**

## Confidence Notes

- `page_size_exceeds_max`: High confidence. These are direct literal values from the frontend against backend Zod `.max(...)` constraints.
- `missing_route`: Mixed confidence. Many are real stale path/method mismatches. Dynamic path builders lower confidence for some entries.
- `extra_query_keys`: Medium confidence. These usually indicate ignored or stale query params. They are not always 400s.
- `extra_body_keys`: Mixed confidence. When backend accepted keys are listed, confidence is high. When accepted keys are empty, the schema could not always be fully resolved statically.

## Spot-Checked Confirmed Hard Breaks

- Frontend posts to `/v1/auth/request-password-reset`, but backend exposes `/v1/auth/password-reset/request`.
  Frontend: `apps/web/src/app/[locale]/(auth)/reset-password/page.tsx:35`
  Backend: `apps/api/src/modules/auth/auth.controller.ts:138`
- Frontend posts to `/v1/auth/reset-password`, but backend exposes `/v1/auth/password-reset/confirm`.
  Frontend: `apps/web/src/app/[locale]/(auth)/reset-password/page.tsx:69`
  Backend: `apps/api/src/modules/auth/auth.controller.ts:145`
- Frontend posts to `/v1/auth/mfa-verify`, but backend exposes `/v1/auth/mfa/verify`.
  Frontend: `apps/web/src/app/[locale]/(auth)/mfa-verify/page.tsx:49`
  Backend: `apps/api/src/modules/auth/auth.controller.ts:157`
- Frontend uses `enabled` for tenant module toggling, while backend expects `is_enabled`.
  Frontend: `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/page.tsx:668`
  Backend: `apps/api/src/modules/tenants/tenants.controller.ts:127`
- Frontend sends `payment_reference` when creating finance payments, but backend create schema does not accept that field.
  Frontend: `apps/web/src/app/[locale]/(school)/_components/registration-wizard/step-payment.tsx:76`
  Backend: `apps/api/src/modules/finance/payments.controller.ts:65`

## Hard Page Size Mismatches

1. `GET /v1/classes`
   Frontend: `apps/web/src/app/[locale]/(school)/early-warnings/_components/early-warning-list.tsx:67`
   Backend: `apps/api/src/modules/classes/classes.controller.ts:59`
   Issue: Frontend sends pageSize=200, backend max=100
2. `GET /v1/staff-profiles`
   Frontend: `apps/web/src/app/[locale]/(school)/engagement/conferences/[id]/schedule/page.tsx:67`
   Backend: `apps/api/src/modules/staff-profiles/staff-profiles.controller.ts:49`
   Issue: Frontend sends pageSize=500, backend max=100
3. `GET /v1/staff-profiles`
   Frontend: `apps/web/src/app/[locale]/(school)/engagement/conferences/[id]/setup/page.tsx:86`
   Backend: `apps/api/src/modules/staff-profiles/staff-profiles.controller.ts:49`
   Issue: Frontend sends pageSize=500, backend max=100
4. `GET /v1/staff-profiles`
   Frontend: `apps/web/src/app/[locale]/(school)/engagement/events/[id]/trip-pack/page.tsx:45`
   Backend: `apps/api/src/modules/staff-profiles/staff-profiles.controller.ts:49`
   Issue: Frontend sends pageSize=500, backend max=100
5. `GET /v1/staff-profiles`
   Frontend: `apps/web/src/app/[locale]/(school)/engagement/parent/conferences/[id]/book/page.tsx:75`
   Backend: `apps/api/src/modules/staff-profiles/staff-profiles.controller.ts:49`
   Issue: Frontend sends pageSize=500, backend max=100
6. `GET /v1/staff-profiles`
   Frontend: `apps/web/src/app/[locale]/(school)/engagement/parent/conferences/[id]/my-bookings/page.tsx:43`
   Backend: `apps/api/src/modules/staff-profiles/staff-profiles.controller.ts:49`
   Issue: Frontend sends pageSize=500, backend max=100
7. `GET /v1/households`
   Frontend: `apps/web/src/app/[locale]/(school)/finance/credit-notes/page.tsx:131`
   Backend: `apps/api/src/modules/households/households.controller.ts:85`
   Issue: Frontend sends pageSize=200, backend max=100
8. `GET /v1/students`
   Frontend: `apps/web/src/app/[locale]/(school)/finance/scholarships/page.tsx:138`
   Backend: `apps/api/src/modules/students/students.controller.ts:93`
   Issue: Frontend sends pageSize=500, backend max=100
9. `GET /v1/finance/fee-structures`
   Frontend: `apps/web/src/app/[locale]/(school)/finance/scholarships/page.tsx:139`
   Backend: `apps/api/src/modules/finance/fee-structures.controller.ts:37`
   Issue: Frontend sends pageSize=200, backend max=100
10. `GET /v1/classes`
    Frontend: `apps/web/src/app/[locale]/(school)/homework/new/page.tsx:44`
    Backend: `apps/api/src/modules/classes/classes.controller.ts:59`
    Issue: Frontend sends pageSize=200, backend max=100
11. `GET /v1/staff-profiles`
    Frontend: `apps/web/src/app/[locale]/(school)/scheduling/teacher-config/page.tsx:86`
    Backend: `apps/api/src/modules/staff-profiles/staff-profiles.controller.ts:49`
    Issue: Frontend sends pageSize=200, backend max=100

## Missing Route Findings

1. Confidence: **High**
   Call: `POST /v1/auth/mfa-verify`
   Frontend: `apps/web/src/app/[locale]/(auth)/mfa-verify/page.tsx:49`
   Query keys: none
   Body keys: `mfa_session_token`
2. Confidence: **High**
   Call: `POST /v1/auth/register`
   Frontend: `apps/web/src/app/[locale]/(auth)/register/page.tsx:113`
   Query keys: none
   Body keys: `first_name`, `last_name`, `email`, `phone`, `password`, `communication_preferences`
3. Confidence: **High**
   Call: `POST /v1/auth/request-password-reset`
   Frontend: `apps/web/src/app/[locale]/(auth)/reset-password/page.tsx:35`
   Query keys: none
   Body keys: `email`
4. Confidence: **High**
   Call: `POST /v1/auth/reset-password`
   Frontend: `apps/web/src/app/[locale]/(auth)/reset-password/page.tsx:69`
   Query keys: none
   Body keys: `token`, `new_password`
5. Confidence: **Low**
   Call: `POST /v1/admin/tenants/:param/:param`
   Frontend: `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/page.tsx:214`
   Query keys: none
   Body keys: none
6. Confidence: **Low**
   Call: `PATCH /v1/admission-forms/:param`
   Frontend: `apps/web/src/app/[locale]/(school)/admissions/forms/[id]/page.tsx:498`
   Query keys: none
   Body keys: `name`, `status`, `fields`
7. Confidence: **High**
   Call: `GET /v1/staff`
   Frontend: `apps/web/src/app/[locale]/(school)/behaviour/appeals/[id]/page.tsx:283`
   Query keys: `pageSize`
   Body keys: none
8. Confidence: **High**
   Call: `GET /v1/staff`
   Frontend: `apps/web/src/app/[locale]/(school)/behaviour/appeals/page.tsx:188`
   Query keys: `pageSize`
   Body keys: none
9. Confidence: **High**
   Call: `POST /v1/behaviour/documents`
   Frontend: `apps/web/src/app/[locale]/(school)/behaviour/documents/page.tsx:178`
   Query keys: none
   Body keys: `entity_type`, `entity_id`, `document_type`
10. Confidence: **Medium**
    Call: `POST /v1/behaviour/incidents/:param/transition`
    Frontend: `apps/web/src/app/[locale]/(school)/behaviour/incidents/[id]/page.tsx:138`
    Query keys: none
    Body keys: `status`, `reason`
11. Confidence: **High**
    Call: `GET /v1/behaviour/templates`
    Frontend: `apps/web/src/app/[locale]/(school)/behaviour/incidents/new/page.tsx:98`
    Query keys: `pageSize`
    Body keys: none
12. Confidence: **Medium**
    Call: `POST /v1/behaviour/interventions/:param/transition`
    Frontend: `apps/web/src/app/[locale]/(school)/behaviour/interventions/[id]/_components/status-transition-dialog.tsx:66`
    Query keys: none
    Body keys: `status`, `reason`
13. Confidence: **Medium**
    Call: `GET /v1/behaviour/interventions/:param/incidents`
    Frontend: `apps/web/src/app/[locale]/(school)/behaviour/interventions/[id]/page.tsx:134`
    Query keys: none
    Body keys: none
14. Confidence: **Medium**
    Call: `GET /v1/behaviour/interventions/:param/history`
    Frontend: `apps/web/src/app/[locale]/(school)/behaviour/interventions/[id]/page.tsx:144`
    Query keys: none
    Body keys: none
15. Confidence: **Medium**
    Call: `GET /v1/behaviour/interventions/:param/reviews/auto-populate`
    Frontend: `apps/web/src/app/[locale]/(school)/behaviour/interventions/[id]/page.tsx:167`
    Query keys: none
    Body keys: none
16. Confidence: **High**
    Call: `GET /v1/behaviour/recognition`
    Frontend: `apps/web/src/app/[locale]/(school)/behaviour/recognition/page.tsx:156`
    Query keys: `pageSize`, `status`, `academic_year_id`
    Body keys: none
17. Confidence: **High**
    Call: `GET /v1/behaviour/houses/standings`
    Frontend: `apps/web/src/app/[locale]/(school)/behaviour/recognition/page.tsx:392`
    Query keys: none
    Body keys: none
18. Confidence: **High**
    Call: `GET /v1/behaviour/recognition`
    Frontend: `apps/web/src/app/[locale]/(school)/behaviour/recognition/page.tsx:477`
    Query keys: `status`, `pageSize`
    Body keys: none
19. Confidence: **Low**
    Call: `POST /v1/behaviour/recognition/:param/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/behaviour/recognition/page.tsx:496`
    Query keys: none
    Body keys: none
20. Confidence: **Low**
    Call: `PATCH /v1/classes/:param/enrolments/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/classes/_components/enrolment-management.tsx:295`
    Query keys: none
    Body keys: `status`
21. Confidence: **Low**
    Call: `DELETE /v1/classes/:param/staff/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/classes/_components/staff-assignment.tsx:174`
    Query keys: none
    Body keys: none
22. Confidence: **High**
    Call: `POST /v1/reports/parent-insights`
    Frontend: `apps/web/src/app/[locale]/(school)/dashboard/parent/_components/ai-insight-card.tsx:36`
    Query keys: none
    Body keys: `student_ids`
23. Confidence: **High**
    Call: `GET /v1/parent/finances`
    Frontend: `apps/web/src/app/[locale]/(school)/dashboard/parent/_components/finances-tab.tsx:100`
    Query keys: none
    Body keys: none
24. Confidence: **Medium**
    Call: `POST /v1/parent/finances/invoices/:param/checkout`
    Frontend: `apps/web/src/app/[locale]/(school)/dashboard/parent/_components/finances-tab.tsx:109`
    Query keys: none
    Body keys: none
25. Confidence: **High**
    Call: `POST /v1/parent/finances/payment-plan-requests`
    Frontend: `apps/web/src/app/[locale]/(school)/dashboard/parent/_components/finances-tab.tsx:164`
    Query keys: none
    Body keys: `invoice_id`, `proposed_installments`, `reason`
26. Confidence: **High**
    Call: `GET /v1/gradebook/student-grades`
    Frontend: `apps/web/src/app/[locale]/(school)/dashboard/parent/_components/grades-tab.tsx:108`
    Query keys: `student_id`, `academic_period_id`
    Body keys: none
27. Confidence: **High**
    Call: `GET /v1/parent/report-card-history`
    Frontend: `apps/web/src/app/[locale]/(school)/dashboard/parent/_components/grades-tab.tsx:125`
    Query keys: `student_id`
    Body keys: none
28. Confidence: **Medium**
    Call: `POST /v1/parent/report-cards/:param/acknowledge`
    Frontend: `apps/web/src/app/[locale]/(school)/dashboard/parent/_components/grades-tab.tsx:159`
    Query keys: none
    Body keys: none
29. Confidence: **High**
    Call: `GET /v1/gradebook/student-grades`
    Frontend: `apps/web/src/app/[locale]/(school)/dashboard/parent/_components/grades-tab.tsx:177`
    Query keys: none
    Body keys: none
30. Confidence: **High**
    Call: `GET /v1/gradebook/student-grades`
    Frontend: `apps/web/src/app/[locale]/(school)/dashboard/parent/_components/grades-tab.tsx:180`
    Query keys: none
    Body keys: none
31. Confidence: **High**
    Call: `GET /v1/parent/timetable`
    Frontend: `apps/web/src/app/[locale]/(school)/dashboard/parent/_components/timetable-tab.tsx:80`
    Query keys: `student_id`
    Body keys: none
32. Confidence: **High**
    Call: `GET /v1/parent/finances`
    Frontend: `apps/web/src/app/[locale]/(school)/dashboard/parent/page.tsx:166`
    Query keys: none
    Body keys: none
33. Confidence: **High**
    Call: `GET /v1/homework/completions/unverified`
    Frontend: `apps/web/src/app/[locale]/(school)/dashboard/teacher/page.tsx:76`
    Query keys: none
    Body keys: none
34. Confidence: **Low**
    Call: `GET /v1/engagement/analytics/overview:param`
    Frontend: `apps/web/src/app/[locale]/(school)/engagement/analytics/page.tsx:178`
    Query keys: none
    Body keys: none
35. Confidence: **Low**
    Call: `GET /v1/engagement/analytics/completion-rates:param`
    Frontend: `apps/web/src/app/[locale]/(school)/engagement/analytics/page.tsx:182`
    Query keys: none
    Body keys: none
36. Confidence: **Low**
    Call: `POST /v1/engagement/events/:param/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/engagement/events/[id]/page.tsx:80`
    Query keys: none
    Body keys: none
37. Confidence: **Low**
    Call: `POST /v1/engagement/events/:param/risk-assessment/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/engagement/events/[id]/risk-assessment/page.tsx:64`
    Query keys: none
    Body keys: none
38. Confidence: **Low**
    Call: `POST /v1/parent/engagement/events/:param/:param/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/engagement/parent/events/[id]/page.tsx:56`
    Query keys: none
    Body keys: none
39. Confidence: **Medium**
    Call: `POST /v1/finance/credit-notes/:param/apply`
    Frontend: `apps/web/src/app/[locale]/(school)/finance/credit-notes/page.tsx:188`
    Query keys: none
    Body keys: `invoice_id`, `amount`
40. Confidence: **High**
    Call: `POST /v1/finance/invoices/bulk`
    Frontend: `apps/web/src/app/[locale]/(school)/finance/invoices/page.tsx:162`
    Query keys: none
    Body keys: `ids`, `action`
41. Confidence: **High**
    Call: `GET /v1/finance/payment-plan-requests`
    Frontend: `apps/web/src/app/[locale]/(school)/finance/payment-plans/page.tsx:95`
    Query keys: `page`, `pageSize`, `status`
    Body keys: none
42. Confidence: **Medium**
    Call: `POST /v1/finance/payment-plan-requests/:param/approve`
    Frontend: `apps/web/src/app/[locale]/(school)/finance/payment-plans/page.tsx:120`
    Query keys: none
    Body keys: none
43. Confidence: **Medium**
    Call: `POST /v1/finance/payment-plan-requests/:param/reject`
    Frontend: `apps/web/src/app/[locale]/(school)/finance/payment-plans/page.tsx:137`
    Query keys: none
    Body keys: `admin_notes`
44. Confidence: **Medium**
    Call: `POST /v1/finance/payment-plan-requests/:param/counter-offer`
    Frontend: `apps/web/src/app/[locale]/(school)/finance/payment-plans/page.tsx:158`
    Query keys: none
    Body keys: `proposed_installments`, `admin_notes`
45. Confidence: **Medium**
    Call: `GET /v1/finance/payments/:param/allocations/suggest`
    Frontend: `apps/web/src/app/[locale]/(school)/finance/payments/_components/allocation-panel.tsx:63`
    Query keys: none
    Body keys: none
46. Confidence: **Low**
    Call: `GET /v1/finance/reports/aging:param`
    Frontend: `apps/web/src/app/[locale]/(school)/finance/reports/page.tsx:104`
    Query keys: none
    Body keys: none
47. Confidence: **Low**
    Call: `GET /v1/finance/reports/revenue:param`
    Frontend: `apps/web/src/app/[locale]/(school)/finance/reports/page.tsx:109`
    Query keys: none
    Body keys: none
48. Confidence: **Low**
    Call: `GET /v1/finance/reports/collection-by-year-group:param`
    Frontend: `apps/web/src/app/[locale]/(school)/finance/reports/page.tsx:114`
    Query keys: none
    Body keys: none
49. Confidence: **Low**
    Call: `GET /v1/finance/reports/payment-methods:param`
    Frontend: `apps/web/src/app/[locale]/(school)/finance/reports/page.tsx:119`
    Query keys: none
    Body keys: none
50. Confidence: **Low**
    Call: `GET /v1/finance/reports/fee-performance:param`
    Frontend: `apps/web/src/app/[locale]/(school)/finance/reports/page.tsx:124`
    Query keys: none
    Body keys: none
51. Confidence: **Medium**
    Call: `GET /v1/gradebook/classes/:param/analytics`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/[classId]/analytics-tab.tsx:104`
    Query keys: `academic_period_id`, `subject_id`
    Body keys: none
52. Confidence: **High**
    Call: `GET /v1/gradebook/ai-query/history`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/ai/page.tsx:57`
    Query keys: `pageSize`
    Body keys: none
53. Confidence: **High**
    Call: `POST /v1/gradebook/ai-query`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/ai/page.tsx:69`
    Query keys: none
    Body keys: `query`
54. Confidence: **High**
    Call: `GET /v1/gradebook/ai-query/history`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/ai/page.tsx:75`
    Query keys: `pageSize`
    Body keys: none
55. Confidence: **High**
    Call: `GET /v1/gradebook/ai-grading-instructions`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/ai-instructions/page.tsx:113`
    Query keys: `page`, `pageSize`
    Body keys: none
56. Confidence: **Low**
    Call: `PATCH /v1/gradebook/ai-grading-instructions/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/ai-instructions/page.tsx:151`
    Query keys: none
    Body keys: `instruction_text`
57. Confidence: **High**
    Call: `POST /v1/gradebook/ai-grading-instructions`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/ai-instructions/page.tsx:156`
    Query keys: none
    Body keys: `class_id`, `subject_id`, `instruction_text`
58. Confidence: **Medium**
    Call: `POST /v1/gradebook/ai-grading-instructions/:param/submit`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/ai-instructions/page.tsx:179`
    Query keys: none
    Body keys: none
59. Confidence: **Medium**
    Call: `POST /v1/gradebook/ai-grading-instructions/:param/approve`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/ai-instructions/page.tsx:195`
    Query keys: none
    Body keys: none
60. Confidence: **Medium**
    Call: `POST /v1/gradebook/ai-grading-instructions/:param/reject`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/ai-instructions/page.tsx:218`
    Query keys: none
    Body keys: `rejection_reason`
61. Confidence: **High**
    Call: `GET /v1/gradebook/insights/teacher-consistency`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/insights/page.tsx:137`
    Query keys: `subject_id`, `academic_period_id`
    Body keys: none
62. Confidence: **High**
    Call: `GET /v1/gradebook/insights/benchmarking`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/insights/page.tsx:296`
    Query keys: `subject_id`, `year_group_id`, `academic_period_id`
    Body keys: none
63. Confidence: **High**
    Call: `GET /v1/gradebook/risk-alerts`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/insights/page.tsx:484`
    Query keys: `page`, `pageSize`, `status`, `subject_id`, `academic_period_id`, `risk_level`
    Body keys: none
64. Confidence: **Medium**
    Call: `PATCH /v1/gradebook/risk-alerts/:param/status`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/insights/page.tsx:506`
    Query keys: none
    Body keys: `status`
65. Confidence: **High**
    Call: `GET /v1/gradebook/progress-reports/draft`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/progress-reports/page.tsx:156`
    Query keys: `class_id`, `academic_period_id`
    Body keys: none
66. Confidence: **Low**
    Call: `GET /v1/homework/analytics/completion-rates:param`
    Frontend: `apps/web/src/app/[locale]/(school)/homework/analytics/page.tsx:82`
    Query keys: none
    Body keys: none
67. Confidence: **Low**
    Call: `GET /v1/homework/analytics/non-completers:param`
    Frontend: `apps/web/src/app/[locale]/(school)/homework/analytics/page.tsx:89`
    Query keys: none
    Body keys: none
68. Confidence: **Medium**
    Call: `GET /v1/households/:param/merge-preview`
    Frontend: `apps/web/src/app/[locale]/(school)/households/_components/merge-dialog.tsx:76`
    Query keys: `target_id`
    Body keys: none
69. Confidence: **High**
    Call: `GET /v1/payroll/class-delivery/summary`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/class-delivery/page.tsx:103`
    Query keys: `date_from`, `date_to`, `staff_profile_id`
    Body keys: none
70. Confidence: **High**
    Call: `GET /v1/payroll/class-delivery/comparison`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/class-delivery/page.tsx:106`
    Query keys: none
    Body keys: none
71. Confidence: **High**
    Call: `GET /v1/payroll/staff`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/class-delivery/page.tsx:107`
    Query keys: `pageSize`
    Body keys: none
72. Confidence: **Low**
    Call: `PATCH /v1/payroll/class-delivery/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/class-delivery/page.tsx:127`
    Query keys: none
    Body keys: `status`
73. Confidence: **High**
    Call: `POST /v1/payroll/compensation/import`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/compensation/_components/bulk-import-dialog.tsx:51`
    Query keys: none
    Body keys: none
74. Confidence: **High**
    Call: `GET /v1/payroll/staff`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/compensation/page.tsx:165`
    Query keys: `pageSize`
    Body keys: none
75. Confidence: **High**
    Call: `GET /v1/payroll/staff-deductions`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/compensation/page.tsx:178`
    Query keys: none
    Body keys: none
76. Confidence: **High**
    Call: `POST /v1/payroll/staff-deductions`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/compensation/page.tsx:275`
    Query keys: none
    Body keys: `total_amount`, `monthly_amount`
77. Confidence: **Low**
    Call: `PATCH /v1/payroll/staff-deductions/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/compensation/page.tsx:300`
    Query keys: none
    Body keys: `active`
78. Confidence: **Low**
    Call: `PATCH /v1/payroll/export-templates/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/exports/page.tsx:84`
    Query keys: none
    Body keys: `name`, `file_format`, `columns_json`
79. Confidence: **High**
    Call: `GET /v1/payroll/export-logs`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/exports/page.tsx:193`
    Query keys: none
    Body keys: none
80. Confidence: **Medium**
    Call: `POST /v1/payroll/export-logs/:param/send`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/exports/page.tsx:222`
    Query keys: none
    Body keys: none
81. Confidence: **High**
    Call: `GET /v1/payroll/my-payslips`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/my-payslips/page.tsx:57`
    Query keys: none
    Body keys: none
82. Confidence: **High**
    Call: `GET /v1/payroll/my-payslips/ytd`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/my-payslips/page.tsx:58`
    Query keys: none
    Body keys: none
83. Confidence: **High**
    Call: `GET /v1/payroll/reports/variance`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/reports/page.tsx:120`
    Query keys: none
    Body keys: none
84. Confidence: **High**
    Call: `GET /v1/payroll/reports/forecast`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/reports/page.tsx:127`
    Query keys: none
    Body keys: none
85. Confidence: **Medium**
    Call: `GET /v1/payroll/runs/:param/allowances`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/runs/[id]/page.tsx:147`
    Query keys: none
    Body keys: none
86. Confidence: **Medium**
    Call: `GET /v1/payroll/runs/:param/adjustments`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/runs/[id]/page.tsx:154`
    Query keys: none
    Body keys: none
87. Confidence: **Medium**
    Call: `GET /v1/payroll/runs/:param/anomalies`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/runs/[id]/page.tsx:161`
    Query keys: none
    Body keys: none
88. Confidence: **Medium**
    Call: `GET /v1/payroll/runs/:param/comparison`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/runs/[id]/page.tsx:168`
    Query keys: none
    Body keys: none
89. Confidence: **Medium**
    Call: `POST /v1/payroll/runs/:param/auto-populate-classes`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/runs/[id]/page.tsx:204`
    Query keys: none
    Body keys: none
90. Confidence: **Medium**
    Call: `POST /v1/payroll/runs/:param/send-to-accountant`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/runs/[id]/page.tsx:273`
    Query keys: none
    Body keys: none
91. Confidence: **Medium**
    Call: `POST /v1/payroll/runs/:param/send-payslips`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/runs/[id]/page.tsx:282`
    Query keys: none
    Body keys: none
92. Confidence: **Medium**
    Call: `POST /v1/payroll/runs/:param/anomalies/:param/acknowledge`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/runs/[id]/page.tsx:291`
    Query keys: none
    Body keys: none
93. Confidence: **Medium**
    Call: `GET /v1/payroll/staff/:param/history`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/staff/[staffProfileId]/page.tsx:48`
    Query keys: `page`, `pageSize`
    Body keys: none
94. Confidence: **High**
    Call: `GET /v1/payroll/staff-attendance`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/staff-attendance/page.tsx:91`
    Query keys: `date`
    Body keys: none
95. Confidence: **High**
    Call: `GET /v1/payroll/staff-attendance/monthly`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/staff-attendance/page.tsx:107`
    Query keys: `year`, `month`
    Body keys: none
96. Confidence: **High**
    Call: `POST /v1/payroll/staff-attendance/bulk`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/staff-attendance/page.tsx:147`
    Query keys: none
    Body keys: `date`, `records`
97. Confidence: **High**
    Call: `GET /v1/parent-portal/age-gate-status`
    Frontend: `apps/web/src/app/[locale]/(school)/privacy-consent/page.tsx:102`
    Query keys: none
    Body keys: none
98. Confidence: **High**
    Call: `GET /v1/report-card-custom-field-defs`
    Frontend: `apps/web/src/app/[locale]/(school)/report-cards/[id]/page.tsx:137`
    Query keys: none
    Body keys: none
99. Confidence: **Medium**
    Call: `POST /v1/report-cards/:param/ai-comment`
    Frontend: `apps/web/src/app/[locale]/(school)/report-cards/[id]/page.tsx:246`
    Query keys: none
    Body keys: `comment_type`
100. Confidence: **High**
     Call: `GET /v1/report-card-approvals`
     Frontend: `apps/web/src/app/[locale]/(school)/report-cards/approvals/page.tsx:61`
     Query keys: `page`, `pageSize`, `status`
     Body keys: none
101. Confidence: **Medium**
     Call: `POST /v1/report-card-approvals/:param/approve`
     Frontend: `apps/web/src/app/[locale]/(school)/report-cards/approvals/page.tsx:81`
     Query keys: none
     Body keys: none
102. Confidence: **High**
     Call: `POST /v1/report-card-approvals/bulk-approve`
     Frontend: `apps/web/src/app/[locale]/(school)/report-cards/approvals/page.tsx:94`
     Query keys: none
     Body keys: `approval_ids`
103. Confidence: **Medium**
     Call: `POST /v1/report-card-approvals/:param/reject`
     Frontend: `apps/web/src/app/[locale]/(school)/report-cards/approvals/page.tsx:118`
     Query keys: none
     Body keys: `reason`
104. Confidence: **High**
     Call: `POST /v1/report-cards/generate-batch-async`
     Frontend: `apps/web/src/app/[locale]/(school)/report-cards/bulk/page.tsx:111`
     Query keys: none
     Body keys: `class_id`, `academic_period_id`
105. Confidence: **High**
     Call: `POST /v1/report-cards/bulk-submit-approval`
     Frontend: `apps/web/src/app/[locale]/(school)/report-cards/bulk/page.tsx:138`
     Query keys: none
     Body keys: `report_card_ids`
106. Confidence: **High**
     Call: `POST /v1/report-cards/bulk-publish`
     Frontend: `apps/web/src/app/[locale]/(school)/report-cards/bulk/page.tsx:162`
     Query keys: none
     Body keys: `report_card_ids`
107. Confidence: **High**
     Call: `POST /v1/report-cards/bulk-notify`
     Frontend: `apps/web/src/app/[locale]/(school)/report-cards/bulk/page.tsx:187`
     Query keys: none
     Body keys: `report_card_ids`
108. Confidence: **High**
     Call: `POST /v1/report-cards/ai-generate-comments`
     Frontend: `apps/web/src/app/[locale]/(school)/report-cards/page.tsx:229`
     Query keys: none
     Body keys: `class_id`, `academic_period_id`
109. Confidence: **Low**
     Call: `PATCH /v1/reports/alerts/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/reports/alerts/page.tsx:87`
     Query keys: none
     Body keys: `active`
110. Confidence: **High**
     Call: `GET /v1/reports/ai-query/history`
     Frontend: `apps/web/src/app/[locale]/(school)/reports/ask-ai/page.tsx:53`
     Query keys: `pageSize`
     Body keys: none
111. Confidence: **High**
     Call: `POST /v1/reports/ai-query`
     Frontend: `apps/web/src/app/[locale]/(school)/reports/ask-ai/page.tsx:65`
     Query keys: none
     Body keys: `query`
112. Confidence: **High**
     Call: `GET /v1/reports/ai-query/history`
     Frontend: `apps/web/src/app/[locale]/(school)/reports/ask-ai/page.tsx:70`
     Query keys: `pageSize`
     Body keys: none
113. Confidence: **High**
     Call: `GET /v1/reports/saved`
     Frontend: `apps/web/src/app/[locale]/(school)/reports/builder/page.tsx:116`
     Query keys: `pageSize`
     Body keys: none
114. Confidence: **High**
     Call: `POST /v1/reports/saved`
     Frontend: `apps/web/src/app/[locale]/(school)/reports/builder/page.tsx:143`
     Query keys: none
     Body keys: `name`, `data_source`, `dimensions_json`, `measures_json`, `filters_json`, `chart_type`, `is_shared`
115. Confidence: **High**
     Call: `POST /v1/reports/analytics/ai-summary`
     Frontend: `apps/web/src/app/[locale]/(school)/reports/insights/page.tsx:191`
     Query keys: none
     Body keys: `section`
116. Confidence: **High**
     Call: `GET /v1/reports/analytics/dashboard`
     Frontend: `apps/web/src/app/[locale]/(school)/reports/page.tsx:323`
     Query keys: none
     Body keys: none
117. Confidence: **High**
     Call: `POST /v1/reports/analytics/ai-summary`
     Frontend: `apps/web/src/app/[locale]/(school)/reports/page.tsx:360`
     Query keys: none
     Body keys: none
118. Confidence: **Low**
     Call: `PATCH /v1/reports/scheduled/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/reports/scheduled/page.tsx:97`
     Query keys: none
     Body keys: `active`
119. Confidence: **High**
     Call: `GET /v1/scheduling/cover-reports/export`
     Frontend: `apps/web/src/app/[locale]/(school)/scheduling/cover-reports/page.tsx:115`
     Query keys: `from`, `to`, `format`
     Body keys: none
120. Confidence: **Medium**
     Call: `GET /v1/scheduling/exam-sessions/:param/slots`
     Frontend: `apps/web/src/app/[locale]/(school)/scheduling/exams/page.tsx:404`
     Query keys: none
     Body keys: none
121. Confidence: **High**
     Call: `POST /v1/staff-scheduling-preferences/own`
     Frontend: `apps/web/src/app/[locale]/(school)/scheduling/my-preferences/page.tsx:187`
     Query keys: none
     Body keys: `academic_year_id`, `preference_type`, `sentiment`, `priority`
122. Confidence: **Low**
     Call: `DELETE /v1/staff-scheduling-preferences/own/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/scheduling/my-preferences/page.tsx:201`
     Query keys: none
     Body keys: none
123. Confidence: **Low**
     Call: `PATCH /v1/staff-scheduling-preferences/own/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/scheduling/my-preferences/page.tsx:212`
     Query keys: none
     Body keys: `sentiment`
124. Confidence: **Low**
     Call: `PATCH /v1/staff-scheduling-preferences/own/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/scheduling/my-preferences/page.tsx:228`
     Query keys: none
     Body keys: `priority`
125. Confidence: **High**
     Call: `GET /v1/scheduling/my-timetable`
     Frontend: `apps/web/src/app/[locale]/(school)/scheduling/my-timetable/page.tsx:273`
     Query keys: `week_offset`
     Body keys: none
126. Confidence: **High**
     Call: `GET /v1/calendar/subscription-url`
     Frontend: `apps/web/src/app/[locale]/(school)/scheduling/my-timetable/page.tsx:291`
     Query keys: none
     Body keys: none
127. Confidence: **High**
     Call: `GET /v1/staff-preferences`
     Frontend: `apps/web/src/app/[locale]/(school)/scheduling/preferences/page.tsx:278`
     Query keys: `staff_profile_id`, `academic_year_id`, `pageSize`
     Body keys: none
128. Confidence: **High**
     Call: `POST /v1/staff-preferences`
     Frontend: `apps/web/src/app/[locale]/(school)/scheduling/preferences/page.tsx:307`
     Query keys: none
     Body keys: `staff_profile_id`, `academic_year_id`, `preference_type`, `sentiment`, `priority`
129. Confidence: **Low**
     Call: `DELETE /v1/staff-preferences/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/scheduling/preferences/page.tsx:320`
     Query keys: none
     Body keys: none
130. Confidence: **Low**
     Call: `PATCH /v1/staff-preferences/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/scheduling/preferences/page.tsx:330`
     Query keys: none
     Body keys: `sentiment`
131. Confidence: **Low**
     Call: `PATCH /v1/staff-preferences/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/scheduling/preferences/page.tsx:343`
     Query keys: none
     Body keys: `priority`
132. Confidence: **Medium**
     Call: `GET /v1/scheduling-runs/:param/cover-candidates`
     Frontend: `apps/web/src/app/[locale]/(school)/scheduling/runs/[id]/_components/cover-teacher-dialog.tsx:79`
     Query keys: `weekday`, `period_order`, `year_group_id`
     Body keys: none
133. Confidence: **Medium**
     Call: `POST /v1/scheduling-runs/:param/validate`
     Frontend: `apps/web/src/app/[locale]/(school)/scheduling/runs/[id]/page.tsx:139`
     Query keys: none
     Body keys: none
134. Confidence: **Medium**
     Call: `GET /v1/scheduling-runs/:param/detail`
     Frontend: `apps/web/src/app/[locale]/(school)/scheduling/runs/compare/page.tsx:87`
     Query keys: none
     Body keys: none
135. Confidence: **Medium**
     Call: `GET /v1/scheduling-runs/:param/detail`
     Frontend: `apps/web/src/app/[locale]/(school)/scheduling/runs/compare/page.tsx:88`
     Query keys: none
     Body keys: none
136. Confidence: **High**
     Call: `GET /v1/staff`
     Frontend: `apps/web/src/app/[locale]/(school)/scheduling/substitutions/page.tsx:366`
     Query keys: `pageSize`, `role`
     Body keys: none
137. Confidence: **Medium**
     Call: `GET /v1/scheduling/absences/:param/suggestions`
     Frontend: `apps/web/src/app/[locale]/(school)/scheduling/substitutions/page.tsx:377`
     Query keys: `schedule_id`
     Body keys: none
138. Confidence: **High**
     Call: `GET /v1/staff`
     Frontend: `apps/web/src/app/[locale]/(school)/sen/sna-assignments/page.tsx:302`
     Query keys: `search`, `pageSize`
     Body keys: none
139. Confidence: **Low**
     Call: `PATCH /v1/academic-years/:param/periods/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/academic-years/_components/period-management.tsx:102`
     Query keys: none
     Body keys: none
140. Confidence: **Medium**
     Call: `POST /v1/behaviour/admin/:param/preview`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-admin/page.tsx:381`
     Query keys: none
     Body keys: none
141. Confidence: **Low**
     Call: `POST /v1/behaviour/admin/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-admin/page.tsx:400`
     Query keys: none
     Body keys: none
142. Confidence: **High**
     Call: `GET /v1/behaviour/award-types`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-awards/page.tsx:112`
     Query keys: `pageSize`, `sort`, `order`
     Body keys: none
143. Confidence: **Low**
     Call: `PATCH /v1/behaviour/award-types/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-awards/page.tsx:181`
     Query keys: none
     Body keys: `name`, `name_ar`, `points_threshold`, `repeat_mode`, `repeat_max_per_year`, `tier_group`, `tier_level`, `supersedes_lower_tiers`, `icon`, `color`, `display_order`, `is_active`
144. Confidence: **High**
     Call: `POST /v1/behaviour/award-types`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-awards/page.tsx:186`
     Query keys: none
     Body keys: `name`, `name_ar`, `points_threshold`, `repeat_mode`, `repeat_max_per_year`, `tier_group`, `tier_level`, `supersedes_lower_tiers`, `icon`, `color`, `display_order`, `is_active`
145. Confidence: **Low**
     Call: `DELETE /v1/behaviour/award-types/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-awards/page.tsx:206`
     Query keys: none
     Body keys: none
146. Confidence: **Low**
     Call: `PATCH /v1/behaviour/award-types/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-awards/page.tsx:219`
     Query keys: none
     Body keys: `is_active`
147. Confidence: **Low**
     Call: `DELETE /v1/behaviour/categories/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-categories/page.tsx:217`
     Query keys: none
     Body keys: none
148. Confidence: **High**
     Call: `GET /v1/behaviour/houses`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-houses/page.tsx:143`
     Query keys: `pageSize`, `sort`, `order`, `include_count`
     Body keys: none
149. Confidence: **Low**
     Call: `PATCH /v1/behaviour/houses/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-houses/page.tsx:197`
     Query keys: none
     Body keys: `name`, `name_ar`, `color`, `icon`, `display_order`, `is_active`
150. Confidence: **High**
     Call: `POST /v1/behaviour/houses`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-houses/page.tsx:202`
     Query keys: none
     Body keys: `name`, `name_ar`, `color`, `icon`, `display_order`, `is_active`
151. Confidence: **Low**
     Call: `DELETE /v1/behaviour/houses/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-houses/page.tsx:222`
     Query keys: none
     Body keys: none
152. Confidence: **High**
     Call: `GET /v1/behaviour/houses`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-houses/page.tsx:470`
     Query keys: `pageSize`, `is_active`, `sort`, `order`
     Body keys: none
153. Confidence: **Medium**
     Call: `GET /v1/behaviour/houses/:param/members`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-houses/page.tsx:489`
     Query keys: `pageSize`
     Body keys: none
154. Confidence: **Medium**
     Call: `GET /v1/behaviour/houses/:param/available-students`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-houses/page.tsx:515`
     Query keys: `pageSize`
     Body keys: none
155. Confidence: **Medium**
     Call: `POST /v1/behaviour/houses/:param/members/bulk`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-houses/page.tsx:543`
     Query keys: none
     Body keys: `student_ids`
156. Confidence: **Low**
     Call: `DELETE /v1/behaviour/houses/:param/members/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-houses/page.tsx:561`
     Query keys: none
     Body keys: none
157. Confidence: **High**
     Call: `GET /v1/academic/year-groups`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-policies/page.tsx:87`
     Query keys: `pageSize`
     Body keys: none
158. Confidence: **Low**
     Call: `POST /v1/compliance-requests/:param/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/compliance/page.tsx:217`
     Query keys: none
     Body keys: none
159. Confidence: **Low**
     Call: `PATCH /v1/gradebook/curriculum-standards/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/curriculum-standards/page.tsx:170`
     Query keys: none
     Body keys: `code`, `description`, `subject_id`, `year_group_id`
160. Confidence: **High**
     Call: `GET /v1/report-card-custom-field-defs`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/custom-fields/page.tsx:56`
     Query keys: none
     Body keys: none
161. Confidence: **Low**
     Call: `DELETE /v1/report-card-custom-field-defs/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/custom-fields/page.tsx:94`
     Query keys: none
     Body keys: none
162. Confidence: **High**
     Call: `PATCH /v1/report-card-custom-field-defs/reorder`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/custom-fields/page.tsx:125`
     Query keys: none
     Body keys: `order`
163. Confidence: **High**
     Call: `POST /v1/report-card-custom-field-defs`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/custom-fields/page.tsx:145`
     Query keys: none
     Body keys: `name`, `label`, `label_ar`, `field_type`, `options_json`, `section_type`, `display_order`
164. Confidence: **Low**
     Call: `PATCH /v1/report-card-custom-field-defs/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/custom-fields/page.tsx:158`
     Query keys: none
     Body keys: `label`, `label_ar`, `field_type`, `options_json`, `section_type`
165. Confidence: **High**
     Call: `GET /v1/grade-threshold-configs`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/grade-thresholds/page.tsx:44`
     Query keys: none
     Body keys: none
166. Confidence: **Low**
     Call: `DELETE /v1/grade-threshold-configs/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/grade-thresholds/page.tsx:80`
     Query keys: none
     Body keys: none
167. Confidence: **Medium**
     Call: `POST /v1/grade-threshold-configs/:param/set-default`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/grade-thresholds/page.tsx:91`
     Query keys: none
     Body keys: none
168. Confidence: **High**
     Call: `POST /v1/grade-threshold-configs`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/grade-thresholds/page.tsx:104`
     Query keys: none
     Body keys: `name`, `thresholds_json`
169. Confidence: **Low**
     Call: `PATCH /v1/grade-threshold-configs/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/grade-thresholds/page.tsx:112`
     Query keys: none
     Body keys: `name`, `thresholds_json`
170. Confidence: **High**
     Call: `GET /v1/report-card-templates`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/report-card-templates/page.tsx:208`
     Query keys: none
     Body keys: none
171. Confidence: **Medium**
     Call: `POST /v1/report-card-templates/:param/set-default`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/report-card-templates/page.tsx:245`
     Query keys: none
     Body keys: none
172. Confidence: **Low**
     Call: `DELETE /v1/report-card-templates/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/report-card-templates/page.tsx:256`
     Query keys: none
     Body keys: none
173. Confidence: **High**
     Call: `POST /v1/report-card-templates`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/report-card-templates/page.tsx:273`
     Query keys: none
     Body keys: `name`, `locale`, `sections_json`, `branding_overrides_json`
174. Confidence: **Low**
     Call: `PATCH /v1/report-card-templates/:param`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/report-card-templates/page.tsx:283`
     Query keys: none
     Body keys: `name`, `sections_json`, `branding_overrides_json`
175. Confidence: **High**
     Call: `POST /v1/report-card-templates/ai-convert`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/report-card-templates/page.tsx:477`
     Query keys: none
     Body keys: none
176. Confidence: **High**
     Call: `GET /v1/safeguarding/settings`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/safeguarding/page.tsx:50`
     Query keys: none
     Body keys: none
177. Confidence: **High**
     Call: `PATCH /v1/safeguarding/settings`
     Frontend: `apps/web/src/app/[locale]/(school)/settings/safeguarding/page.tsx:62`
     Query keys: none
     Body keys: none
178. Confidence: **Low**
     Call: `GET /v1/staff-wellbeing/surveys/:param/results:param`
     Frontend: `apps/web/src/app/[locale]/(school)/wellbeing/surveys/[id]/page.tsx:132`
     Query keys: none
     Body keys: none
179. Confidence: **High**
     Call: `GET /v1/behaviour/templates`
     Frontend: `apps/web/src/components/behaviour/quick-log-sheet.tsx:69`
     Query keys: `pageSize`
     Body keys: none
180. Confidence: **High**
     Call: `POST /v1/behaviour/incidents/quick-log`
     Frontend: `apps/web/src/components/behaviour/quick-log-sheet.tsx:114`
     Query keys: none
     Body keys: `category_id`, `student_ids`, `description`, `context_type`, `idempotency_key`, `academic_year_id`
181. Confidence: **Medium**
     Call: `GET /v1/:params/:param/preview`
     Frontend: `apps/web/src/components/hover-preview-card.tsx:40`
     Query keys: none
     Body keys: none

## Query Drift Findings

1. `GET /v1/admin/audit-logs`
   Frontend: `apps/web/src/app/[locale]/(platform)/admin/audit-log/page.tsx:112`
   Backend match: `apps/api/src/modules/audit-log/audit-log.controller.ts:37` -> `/v1/admin/audit-logs`
   Unexpected query keys: `actor`
2. `GET /v1/admin/security-incidents`
   Frontend: `apps/web/src/app/[locale]/(platform)/admin/security-incidents/page.tsx:321`
   Backend match: `apps/api/src/modules/security-incidents/security-incidents.controller.ts:42` -> `/v1/admin/security-incidents`
   Unexpected query keys: `page`, `pageSize`, `status`, `severity`, `start_date`, `end_date`
3. `GET /v1/admin/security-incidents`
   Frontend: `apps/web/src/app/[locale]/(platform)/layout.tsx:43`
   Backend match: `apps/api/src/modules/security-incidents/security-incidents.controller.ts:42` -> `/v1/admin/security-incidents`
   Unexpected query keys: `pageSize`, `severity`
4. `GET /v1/year-groups`
   Frontend: `apps/web/src/app/[locale]/(school)/_components/registration-wizard/step-students.tsx:65`
   Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
   Unexpected query keys: `pageSize`
5. `GET /v1/admission-forms`
   Frontend: `apps/web/src/app/[locale]/(school)/admissions/forms/page.tsx:59`
   Backend match: `apps/api/src/modules/admissions/admission-forms.controller.ts:56` -> `/v1/admission-forms`
   Unexpected query keys: `search`
6. `GET /v1/parent/applications`
   Frontend: `apps/web/src/app/[locale]/(school)/applications/page.tsx:48`
   Backend match: `apps/api/src/modules/admissions/parent-applications.controller.ts:28` -> `/v1/parent/applications`
   Unexpected query keys: `page`, `pageSize`
7. `GET /v1/sen/profiles`
   Frontend: `apps/web/src/app/[locale]/(school)/attendance/mark/[sessionId]/page.tsx:170`
   Backend match: `apps/api/src/modules/sen/sen-profile.controller.ts:79` -> `/v1/sen/profiles`
   Unexpected query keys: `is_active`, `pageSize`
8. `GET /v1/behaviour/documents`
   Frontend: `apps/web/src/app/[locale]/(school)/behaviour/documents/page.tsx:149`
   Backend match: `apps/api/src/modules/behaviour/behaviour-documents.controller.ts:52` -> `/v1/behaviour/documents`
   Unexpected query keys: `student_search`
9. `GET /v1/behaviour/categories`
   Frontend: `apps/web/src/app/[locale]/(school)/behaviour/incidents/new/page.tsx:93`
   Backend match: `apps/api/src/modules/behaviour/behaviour-config.controller.ts:69` -> `/v1/behaviour/categories`
   Unexpected query keys: `pageSize`, `is_active`
10. `GET /v1/behaviour/categories`
    Frontend: `apps/web/src/app/[locale]/(school)/behaviour/incidents/page.tsx:93`
    Backend match: `apps/api/src/modules/behaviour/behaviour-config.controller.ts:69` -> `/v1/behaviour/categories`
    Unexpected query keys: `pageSize`, `is_active`
11. `GET /v1/behaviour/students`
    Frontend: `apps/web/src/app/[locale]/(school)/behaviour/interventions/new/page.tsx:112`
    Backend match: `apps/api/src/modules/behaviour/behaviour-students.controller.ts:52` -> `/v1/behaviour/students`
    Unexpected query keys: `search`
12. `GET /v1/parent/behaviour/sanctions`
    Frontend: `apps/web/src/app/[locale]/(school)/behaviour/parent-portal/page.tsx:184`
    Backend match: `apps/api/src/modules/behaviour/behaviour-parent.controller.ts:70` -> `/v1/parent/behaviour/sanctions`
    Unexpected query keys: `pageSize`
13. `GET /v1/behaviour/recognition/leaderboard`
    Frontend: `apps/web/src/app/[locale]/(school)/behaviour/recognition/page.tsx:282`
    Backend match: `apps/api/src/modules/behaviour/behaviour-recognition.controller.ts:81` -> `/v1/behaviour/recognition/leaderboard`
    Unexpected query keys: `period`
14. `GET /v1/behaviour/sanctions`
    Frontend: `apps/web/src/app/[locale]/(school)/behaviour/sanctions/page.tsx:171`
    Backend match: `apps/api/src/modules/behaviour/behaviour-sanctions.controller.ts:60` -> `/v1/behaviour/sanctions`
    Unexpected query keys: `student_search`
15. `GET /v1/behaviour/tasks`
    Frontend: `apps/web/src/app/[locale]/(school)/behaviour/students/[studentId]/page.tsx:152`
    Backend match: `apps/api/src/modules/behaviour/behaviour-tasks.controller.ts:50` -> `/v1/behaviour/tasks`
    Unexpected query keys: `student_id`
16. `GET /v1/behaviour/students`
    Frontend: `apps/web/src/app/[locale]/(school)/behaviour/students/page.tsx:56`
    Backend match: `apps/api/src/modules/behaviour/behaviour-students.controller.ts:52` -> `/v1/behaviour/students`
    Unexpected query keys: `search`
17. `GET /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/classes/_components/class-form.tsx:93`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
    Unexpected query keys: `pageSize`
18. `GET /v1/classes/:param/enrolments`
    Frontend: `apps/web/src/app/[locale]/(school)/classes/_components/enrolment-management.tsx:273`
    Backend match: `apps/api/src/modules/classes/class-enrolments.controller.ts:42` -> `/v1/classes/:classId/enrolments`
    Unexpected query keys: `page`, `pageSize`
19. `GET /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/classes/page.tsx:82`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
    Unexpected query keys: `pageSize`
20. `GET /v1/behaviour/incidents`
    Frontend: `apps/web/src/app/[locale]/(school)/dashboard/_components/admin-home.tsx:177`
    Backend match: `apps/api/src/modules/behaviour/behaviour.controller.ts:124` -> `/v1/behaviour/incidents`
    Unexpected query keys: `start_date`, `end_date`
21. `GET /v1/early-warnings`
    Frontend: `apps/web/src/app/[locale]/(school)/early-warnings/_components/early-warning-list.tsx:84`
    Backend match: `apps/api/src/modules/early-warning/early-warning.controller.ts:57` -> `/v1/early-warnings`
    Unexpected query keys: `page`, `pageSize`, `tier`, `year_group_id`, `class_id`
22. `GET /v1/early-warnings/cohort`
    Frontend: `apps/web/src/app/[locale]/(school)/early-warnings/cohort/_components/cohort-heatmap.tsx:38`
    Backend match: `apps/api/src/modules/early-warning/early-warning.controller.ts:92` -> `/v1/early-warnings/cohort`
    Unexpected query keys: `group_by`
23. `GET /v1/audit-logs`
    Frontend: `apps/web/src/app/[locale]/(school)/finance/audit-trail/page.tsx:78`
    Backend match: `apps/api/src/modules/audit-log/audit-log.controller.ts:21` -> `/v1/audit-logs`
    Unexpected query keys: `domain`, `search`, `date_from`, `date_to`, `user_search`
24. `GET /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/finance/fee-generation/_components/fee-generation-wizard.tsx:111`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
    Unexpected query keys: `pageSize`
25. `GET /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/finance/fee-structures/_components/fee-structure-form.tsx:62`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
    Unexpected query keys: `pageSize`
26. `GET /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/finance/fee-structures/page.tsx:95`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
    Unexpected query keys: `pageSize`
27. `GET /v1/finance/refunds`
    Frontend: `apps/web/src/app/[locale]/(school)/finance/refunds/page.tsx:74`
    Backend match: `apps/api/src/modules/finance/refunds.controller.ts:37` -> `/v1/finance/refunds`
    Unexpected query keys: `search`
28. `GET /v1/gradebook/assessment-categories`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/[classId]/assessments/new/page.tsx:79`
    Backend match: `apps/api/src/modules/gradebook/assessment-categories.controller.ts:42` -> `/v1/gradebook/assessment-categories`
    Unexpected query keys: `pageSize`
29. `GET /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/insights/page.tsx:713`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
    Unexpected query keys: `pageSize`
30. `GET /v1/gradebook/publishing/readiness`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/publishing/page.tsx:109`
    Backend match: `apps/api/src/modules/gradebook/gradebook-insights.controller.ts:449` -> `/v1/gradebook/publishing/readiness`
    Unexpected query keys: `page`, `pageSize`, `academic_period_id`
31. `GET /v1/homework/:param/completions`
    Frontend: `apps/web/src/app/[locale]/(school)/homework/[id]/page.tsx:97`
    Backend match: `apps/api/src/modules/homework/homework-completions.controller.ts:32` -> `/v1/homework/:id/completions`
    Unexpected query keys: `pageSize`
32. `GET /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/households/[id]/page.tsx:201`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
    Unexpected query keys: `pageSize`
33. `GET /v1/staff-profiles`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/compensation/_components/compensation-form.tsx:73`
    Backend match: `apps/api/src/modules/staff-profiles/staff-profiles.controller.ts:49` -> `/v1/staff-profiles`
    Unexpected query keys: `fields`
34. `GET /v1/payroll/runs`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/runs/page.tsx:75`
    Backend match: `apps/api/src/modules/payroll/payroll-runs.controller.ts:50` -> `/v1/payroll/runs`
    Unexpected query keys: `year`
35. `GET /v1/academic-years`
    Frontend: `apps/web/src/app/[locale]/(school)/promotion/_components/promotion-wizard.tsx:97`
    Backend match: `apps/api/src/modules/academics/academic-years.controller.ts:50` -> `/v1/academic-years`
    Unexpected query keys: `sort`, `order`
36. `GET /v1/behaviour/incidents/summary`
    Frontend: `apps/web/src/app/[locale]/(school)/regulatory/anti-bullying/page.tsx:39`
    Backend match: `apps/api/src/modules/behaviour/behaviour.controller.ts:170` -> `/v1/behaviour/incidents/:id`
    Unexpected query keys: `categories`
37. `GET /v1/report-cards/eligible-students`
    Frontend: `apps/web/src/app/[locale]/(school)/report-cards/_components/generate-dialog.tsx:74`
    Backend match: `apps/api/src/modules/gradebook/report-cards/report-cards.controller.ts:97` -> `/v1/report-cards/:id`
    Unexpected query keys: `academic_period_id`
38. `GET /v1/report-cards/analytics`
    Frontend: `apps/web/src/app/[locale]/(school)/report-cards/analytics/page.tsx:84`
    Backend match: `apps/api/src/modules/gradebook/report-cards/report-cards.controller.ts:97` -> `/v1/report-cards/:id`
    Unexpected query keys: `academic_period_id`
39. `GET /v1/report-cards/bulk-status`
    Frontend: `apps/web/src/app/[locale]/(school)/report-cards/bulk/page.tsx:92`
    Backend match: `apps/api/src/modules/gradebook/report-cards/report-cards.controller.ts:97` -> `/v1/report-cards/:id`
    Unexpected query keys: `class_id`, `academic_period_id`
40. `GET /v1/students/search`
    Frontend: `apps/web/src/app/[locale]/(school)/reports/student-progress/page.tsx:107`
    Backend match: `apps/api/src/modules/students/students.controller.ts:146` -> `/v1/students/:id`
    Unexpected query keys: `q`, `pageSize`
41. `GET /v1/schedules`
    Frontend: `apps/web/src/app/[locale]/(school)/schedules/page.tsx:138`
    Backend match: `apps/api/src/modules/schedules/schedules.controller.ts:75` -> `/v1/schedules`
    Unexpected query keys: `teacher_id`
42. `GET /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/scheduling/break-groups/page.tsx:87`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
    Unexpected query keys: `pageSize`
43. `GET /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/scheduling/competencies/page.tsx:142`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
    Unexpected query keys: `pageSize`
44. `GET /v1/scheduling/cover-reports`
    Frontend: `apps/web/src/app/[locale]/(school)/scheduling/cover-reports/page.tsx:96`
    Backend match: `apps/api/src/modules/scheduling/scheduling-enhanced.controller.ts:174` -> `/v1/scheduling/cover-reports`
    Unexpected query keys: `from`, `to`
45. `GET /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/scheduling/curriculum/page.tsx:91`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
    Unexpected query keys: `pageSize`
46. `GET /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/scheduling/exams/page.tsx:248`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
    Unexpected query keys: `pageSize`
47. `GET /v1/staff-scheduling-preferences/own`
    Frontend: `apps/web/src/app/[locale]/(school)/scheduling/my-preferences/page.tsx:131`
    Backend match: `apps/api/src/modules/staff-preferences/staff-preferences.controller.ts:65` -> `/v1/staff-scheduling-preferences/own`
    Unexpected query keys: `pageSize`
48. `GET /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/scheduling/period-grid/page.tsx:145`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
    Unexpected query keys: `pageSize`
49. `GET /v1/class-scheduling-requirements`
    Frontend: `apps/web/src/app/[locale]/(school)/scheduling/requirements/page.tsx:183`
    Backend match: `apps/api/src/modules/class-requirements/class-requirements.controller.ts:47` -> `/v1/class-scheduling-requirements`
    Unexpected query keys: `class_id`
50. `GET /v1/scheduling-runs`
    Frontend: `apps/web/src/app/[locale]/(school)/scheduling/scenarios/page.tsx:353`
    Backend match: `apps/api/src/modules/scheduling-runs/scheduling-runs.controller.ts:93` -> `/v1/scheduling-runs`
    Unexpected query keys: `status`
51. `GET /v1/scheduling/absences`
    Frontend: `apps/web/src/app/[locale]/(school)/scheduling/substitutions/page.tsx:352`
    Backend match: `apps/api/src/modules/scheduling/scheduling-enhanced.controller.ts:92` -> `/v1/scheduling/absences`
    Unexpected query keys: `date`
52. `GET /v1/scheduling/substitutions`
    Frontend: `apps/web/src/app/[locale]/(school)/scheduling/substitutions/page.tsx:529`
    Backend match: `apps/api/src/modules/scheduling/scheduling-enhanced.controller.ts:156` -> `/v1/scheduling/substitutions`
    Unexpected query keys: `search`
53. `GET /v1/sen/reports/plan-compliance`
    Frontend: `apps/web/src/app/[locale]/(school)/sen/page.tsx:77`
    Backend match: `apps/api/src/modules/sen/sen-reports.controller.ts:72` -> `/v1/sen/reports/plan-compliance`
    Unexpected query keys: `due_within_days`, `overdue`
54. `GET /v1/sen/reports/ncse-return`
    Frontend: `apps/web/src/app/[locale]/(school)/sen/reports/_components/ncse-return-tab.tsx:79`
    Backend match: `apps/api/src/modules/sen/sen-reports.controller.ts:40` -> `/v1/sen/reports/ncse-return`
    Unexpected query keys: `academic_year_id`
55. `GET /v1/sen/reports/plan-compliance`
    Frontend: `apps/web/src/app/[locale]/(school)/sen/reports/_components/plan-compliance-tab.tsx:68`
    Backend match: `apps/api/src/modules/sen/sen-reports.controller.ts:72` -> `/v1/sen/reports/plan-compliance`
    Unexpected query keys: `due_within_days`, `stale_goal_weeks`
56. `GET /v1/sen/reports/resource-utilisation`
    Frontend: `apps/web/src/app/[locale]/(school)/sen/reports/_components/resource-utilisation-tab.tsx:100`
    Backend match: `apps/api/src/modules/sen/sen-reports.controller.ts:62` -> `/v1/sen/reports/resource-utilisation`
    Unexpected query keys: `academic_year_id`
57. `GET /v1/sen/resource-allocations`
    Frontend: `apps/web/src/app/[locale]/(school)/sen/resource-allocation/page.tsx:482`
    Backend match: `apps/api/src/modules/sen/sen-resource.controller.ts:82` -> `/v1/sen/resource-allocations`
    Unexpected query keys: `pageSize`
58. `GET /v1/sen/sna-assignments`
    Frontend: `apps/web/src/app/[locale]/(school)/sen/sna-assignments/page.tsx:679`
    Backend match: `apps/api/src/modules/sen/sen-sna.controller.ts:69` -> `/v1/sen/sna-assignments`
    Unexpected query keys: `pageSize`
59. `GET /v1/sen/student-hours`
    Frontend: `apps/web/src/app/[locale]/(school)/sen/students/[studentId]/page.tsx:290`
    Backend match: `apps/api/src/modules/sen/sen-resource.controller.ts:117` -> `/v1/sen/student-hours`
    Unexpected query keys: `sen_profile_id`
60. `GET /v1/sen/profiles`
    Frontend: `apps/web/src/app/[locale]/(school)/sen/students/page.tsx:106`
    Backend match: `apps/api/src/modules/sen/sen-profile.controller.ts:79` -> `/v1/sen/profiles`
    Unexpected query keys: `page`, `pageSize`, `search`, `primary_category`, `support_level`, `is_active`
61. `GET /v1/academic-years`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/academic-years/page.tsx:53`
    Backend match: `apps/api/src/modules/academics/academic-years.controller.ts:50` -> `/v1/academic-years`
    Unexpected query keys: `sort`, `order`
62. `GET /v1/gradebook/assessment-categories`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/assessment-categories/page.tsx:63`
    Backend match: `apps/api/src/modules/gradebook/assessment-categories.controller.ts:42` -> `/v1/gradebook/assessment-categories`
    Unexpected query keys: `page`, `pageSize`
63. `GET /v1/gradebook/assessment-categories`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/assessment-templates/page.tsx:96`
    Backend match: `apps/api/src/modules/gradebook/assessment-categories.controller.ts:42` -> `/v1/gradebook/assessment-categories`
    Unexpected query keys: `pageSize`
64. `GET /v1/audit-logs`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/audit-log/page.tsx:88`
    Backend match: `apps/api/src/modules/audit-log/audit-log.controller.ts:21` -> `/v1/audit-logs`
    Unexpected query keys: `actor`
65. `GET /v1/behaviour/categories`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-categories/page.tsx:126`
    Backend match: `apps/api/src/modules/behaviour/behaviour-config.controller.ts:69` -> `/v1/behaviour/categories`
    Unexpected query keys: `pageSize`, `sort`, `order`
66. `GET /v1/behaviour/document-templates`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-documents/page.tsx:162`
    Backend match: `apps/api/src/modules/behaviour/behaviour-config.controller.ts:243` -> `/v1/behaviour/document-templates`
    Unexpected query keys: `pageSize`
67. `GET /v1/behaviour/categories`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-policies/page.tsx:86`
    Backend match: `apps/api/src/modules/behaviour/behaviour-config.controller.ts:69` -> `/v1/behaviour/categories`
    Unexpected query keys: `pageSize`
68. `GET /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/closures/_components/closure-form.tsx:60`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
    Unexpected query keys: `pageSize`
69. `GET /v1/gradebook/competency-scales`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/competency-scales/page.tsx:72`
    Backend match: `apps/api/src/modules/gradebook/gradebook-advanced.controller.ts:233` -> `/v1/gradebook/competency-scales`
    Unexpected query keys: `page`, `pageSize`
70. `GET /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/curriculum-standards/page.tsx:105`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
    Unexpected query keys: `pageSize`
71. `GET /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/grading-weights/page.tsx:77`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
    Unexpected query keys: `pageSize`
72. `GET /v1/gradebook/assessment-categories`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/grading-weights/page.tsx:83`
    Backend match: `apps/api/src/modules/gradebook/assessment-categories.controller.ts:42` -> `/v1/gradebook/assessment-categories`
    Unexpected query keys: `pageSize`
73. `GET /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/year-groups/page.tsx:53`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
    Unexpected query keys: `pageSize`, `sort`, `order`
74. `GET /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/students/_components/student-form.tsx:121`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
    Unexpected query keys: `pageSize`
75. `GET /v1/students/allergy-report`
    Frontend: `apps/web/src/app/[locale]/(school)/students/allergy-report/page.tsx:60`
    Backend match: `apps/api/src/modules/students/students.controller.ts:115` -> `/v1/students/allergy-report`
    Unexpected query keys: `page`, `pageSize`
76. `GET /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/students/allergy-report/page.tsx:78`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
    Unexpected query keys: `pageSize`
77. `GET /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/students/page.tsx:169`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:41` -> `/v1/year-groups`
    Unexpected query keys: `pageSize`
78. `GET /v1/behaviour/categories`
    Frontend: `apps/web/src/components/behaviour/quick-log-sheet.tsx:64`
    Backend match: `apps/api/src/modules/behaviour/behaviour-config.controller.ts:69` -> `/v1/behaviour/categories`
    Unexpected query keys: `pageSize`, `is_active`

## Body Drift Findings

1. `POST /v1/admin/security-incidents/:param/events`
   Frontend: `apps/web/src/app/[locale]/(platform)/admin/security-incidents/[id]/page.tsx:377`
   Backend match: `apps/api/src/modules/security-incidents/security-incidents.controller.ts:78` -> `/v1/admin/security-incidents/:id/events`
   Unexpected body keys: `event_type`, `description`
   Backend accepted keys discovered statically: none
2. `PATCH /v1/admin/security-incidents/:param`
   Frontend: `apps/web/src/app/[locale]/(platform)/admin/security-incidents/[id]/page.tsx:493`
   Backend match: `apps/api/src/modules/security-incidents/security-incidents.controller.ts:67` -> `/v1/admin/security-incidents/:id`
   Unexpected body keys: `status`
   Backend accepted keys discovered statically: none
3. `POST /v1/admin/security-incidents`
   Frontend: `apps/web/src/app/[locale]/(platform)/admin/security-incidents/page.tsx:179`
   Backend match: `apps/api/src/modules/security-incidents/security-incidents.controller.ts:51` -> `/v1/admin/security-incidents`
   Unexpected body keys: `severity`, `incident_type`, `description`
   Backend accepted keys discovered statically: none
4. `PATCH /v1/admin/tenants/:param/modules/:param`
   Frontend: `apps/web/src/app/[locale]/(platform)/admin/tenants/[id]/page.tsx:668`
   Backend match: `apps/api/src/modules/tenants/tenants.controller.ts:127` -> `/v1/admin/tenants/:id/modules/:key`
   Unexpected body keys: `enabled`
   Backend accepted keys discovered statically: `is_enabled`
5. `POST /v1/admin/tenants`
   Frontend: `apps/web/src/app/[locale]/(platform)/admin/tenants/new/page.tsx:124`
   Backend match: `apps/api/src/modules/tenants/tenants.controller.ts:52` -> `/v1/admin/tenants`
   Unexpected body keys: `name`, `slug`, `default_locale`, `timezone`, `date_format`, `currency_code`, `academic_year_start_month`
   Backend accepted keys discovered statically: none
6. `POST /v1/finance/payments`
   Frontend: `apps/web/src/app/[locale]/(school)/_components/registration-wizard/step-payment.tsx:76`
   Backend match: `apps/api/src/modules/finance/payments.controller.ts:65` -> `/v1/finance/payments`
   Unexpected body keys: `payment_reference`
   Backend accepted keys discovered statically: `household_id`, `payment_method`, `amount`, `received_at`, `reason`
7. `POST /v1/admission-forms/:param/validate-fields`
   Frontend: `apps/web/src/app/[locale]/(school)/admissions/forms/[id]/page.tsx:484`
   Backend match: `apps/api/src/modules/admissions/admission-forms.controller.ts:84` -> `/v1/admission-forms/:id/validate-fields`
   Unexpected body keys: `fields`, `justifications`
   Backend accepted keys discovered statically: none
8. `POST /v1/admission-forms`
   Frontend: `apps/web/src/app/[locale]/(school)/admissions/forms/new/page.tsx:451`
   Backend match: `apps/api/src/modules/admissions/admission-forms.controller.ts:46` -> `/v1/admission-forms`
   Unexpected body keys: `status`
   Backend accepted keys discovered statically: `name`, `fields`
9. `POST /v1/admission-forms/:param/validate-fields`
   Frontend: `apps/web/src/app/[locale]/(school)/admissions/forms/new/page.tsx:458`
   Backend match: `apps/api/src/modules/admissions/admission-forms.controller.ts:84` -> `/v1/admission-forms/:id/validate-fields`
   Unexpected body keys: `fields`, `justifications`
   Backend accepted keys discovered statically: none
10. `POST /v1/behaviour/interventions`
    Frontend: `apps/web/src/app/[locale]/(school)/behaviour/interventions/new/page.tsx:179`
    Backend match: `apps/api/src/modules/behaviour/behaviour-interventions.controller.ts:54` -> `/v1/behaviour/interventions`
    Unexpected body keys: `intervention_type`, `send_awareness`, `assigned_to`
    Backend accepted keys discovered statically: `student_id`, `title`, `type`, `trigger_description`, `goals`, `strategies`, `assigned_to_id`, `start_date`, `target_end_date`, `review_frequency_days`, `send_aware`, `send_notes`, `incident_ids`
11. `PATCH /v1/classes/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/classes/[id]/edit/page.tsx:50`
    Backend match: `apps/api/src/modules/classes/classes.controller.ts:85` -> `/v1/classes/:id`
    Unexpected body keys: `academic_year_id`, `homeroom_id`
    Backend accepted keys discovered statically: `year_group_id`, `subject_id`, `homeroom_teacher_staff_id`, `name`, `max_capacity`, `status`
12. `POST /v1/classes/:param/staff`
    Frontend: `apps/web/src/app/[locale]/(school)/classes/_components/staff-assignment.tsx:78`
    Backend match: `apps/api/src/modules/classes/classes.controller.ts:115` -> `/v1/classes/:id/staff`
    Unexpected body keys: `role`
    Backend accepted keys discovered statically: `staff_profile_id`, `assignment_role`
13. `PATCH /v1/announcements/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/communications/[id]/page.tsx:121`
    Backend match: `apps/api/src/modules/communications/announcements.controller.ts:94` -> `/v1/announcements/:id`
    Unexpected body keys: `body`
    Backend accepted keys discovered statically: `title`, `body_html`, `scope`, `target_payload`, `scheduled_publish_at`, `delivery_channels`
14. `POST /v1/inquiries/:param/messages`
    Frontend: `apps/web/src/app/[locale]/(school)/communications/inquiries/[id]/page.tsx:106`
    Backend match: `apps/api/src/modules/parent-inquiries/parent-inquiries.controller.ts:92` -> `/v1/inquiries/:id/messages`
    Unexpected body keys: `body`
    Backend accepted keys discovered statically: `message`
15. `POST /v1/gradebook/progress-reports/send`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/progress-reports/page.tsx:190`
    Backend match: `apps/api/src/modules/gradebook/gradebook-insights.controller.ts:537` -> `/v1/gradebook/progress-reports/send`
    Unexpected body keys: `class_id`, `academic_period_id`, `reports`
    Backend accepted keys discovered statically: `progress_report_id`
16. `POST /v1/gradebook/publishing/publish-period`
    Frontend: `apps/web/src/app/[locale]/(school)/gradebook/publishing/page.tsx:177`
    Backend match: `apps/api/src/modules/gradebook/gradebook-insights.controller.ts:478` -> `/v1/gradebook/publishing/publish-period`
    Unexpected body keys: `academic_period_id`
    Backend accepted keys discovered statically: `class_id`, `period_id`
17. `POST /v1/homework`
    Frontend: `apps/web/src/app/[locale]/(school)/homework/templates/page.tsx:119`
    Backend match: `apps/api/src/modules/homework/homework.controller.ts:107` -> `/v1/homework`
    Unexpected body keys: `status`
    Backend accepted keys discovered statically: `title`, `class_id`, `subject_id`, `academic_year_id`, `academic_period_id`, `homework_type`, `due_date`, `due_time`, `description`, `max_points`, `copied_from_id`, `recurrence_rule_id`
18. `PATCH /v1/sen/plans/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/parent/sen/[planId]/page.tsx:207`
    Backend match: `apps/api/src/modules/sen/sen-support-plan.controller.ts:94` -> `/v1/sen/plans/:id`
    Unexpected body keys: `parent_input`
    Backend accepted keys discovered statically: none
19. `POST /v1/pastoral/concerns/:param/amend`
    Frontend: `apps/web/src/app/[locale]/(school)/pastoral/concerns/[id]/edit/page.tsx:161`
    Backend match: `apps/api/src/modules/pastoral/controllers/concerns.controller.ts:164` -> `/v1/pastoral/concerns/:id/amend`
    Unexpected body keys: `narrative`
    Backend accepted keys discovered statically: `new_narrative`, `amendment_reason`
20. `POST /v1/payroll/class-delivery/auto-populate`
    Frontend: `apps/web/src/app/[locale]/(school)/payroll/class-delivery/page.tsx:141`
    Backend match: `apps/api/src/modules/payroll/payroll-enhanced.controller.ts:185` -> `/v1/payroll/class-delivery/auto-populate`
    Unexpected body keys: `date_from`, `date_to`
    Backend accepted keys discovered statically: `month`, `year`
21. `PATCH /v1/me/preferences`
    Frontend: `apps/web/src/app/[locale]/(school)/profile/communication/page.tsx:92`
    Backend match: `apps/api/src/modules/preferences/preferences.controller.ts:23` -> `/v1/me/preferences`
    Unexpected body keys: `communication`
    Backend accepted keys discovered statically: none
22. `PATCH /v1/me/preferences`
    Frontend: `apps/web/src/app/[locale]/(school)/profile/page.tsx:136`
    Backend match: `apps/api/src/modules/preferences/preferences.controller.ts:23` -> `/v1/me/preferences`
    Unexpected body keys: `first_name`, `last_name`, `preferred_locale`
    Backend accepted keys discovered statically: none
23. `POST /v1/auth/mfa/verify`
    Frontend: `apps/web/src/app/[locale]/(school)/profile/page.tsx:175`
    Backend match: `apps/api/src/modules/auth/auth.controller.ts:170` -> `/v1/auth/mfa/verify`
    Unexpected body keys: `code`
    Backend accepted keys discovered statically: none
24. `POST /v1/promotion/commit`
    Frontend: `apps/web/src/app/[locale]/(school)/promotion/_components/promotion-wizard.tsx:175`
    Backend match: `apps/api/src/modules/academics/promotion.controller.ts:37` -> `/v1/promotion/commit`
    Unexpected body keys: `academic_year_id`, `overrides`
    Backend accepted keys discovered statically: none
25. `PATCH /v1/report-cards/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/report-cards/[id]/page.tsx:165`
    Backend match: `apps/api/src/modules/gradebook/report-cards/report-cards.controller.ts:106` -> `/v1/report-cards/:id`
    Unexpected body keys: `custom_field_values`
    Backend accepted keys discovered statically: `teacher_comment`, `principal_comment`, `template_locale`, `expected_updated_at`
26. `POST /v1/reports/board`
    Frontend: `apps/web/src/app/[locale]/(school)/reports/board/page.tsx:82`
    Backend match: `apps/api/src/modules/reports/reports-enhanced.controller.ts:554` -> `/v1/reports/board`
    Unexpected body keys: `period`, `sections`
    Backend accepted keys discovered statically: `title`, `academic_period_id`, `report_type`, `sections_json`
27. `PATCH /v1/schedules/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/schedules/_components/schedule-form.tsx:152`
    Backend match: `apps/api/src/modules/schedules/schedules.controller.ts:102` -> `/v1/schedules/:id`
    Unexpected body keys: `class_id`, `teacher_id`, `effective_from`, `effective_to`, `override`
    Backend accepted keys discovered statically: `room_id`, `teacher_staff_id`, `weekday`, `start_time`, `end_time`, `effective_start_date`, `effective_end_date`, `is_pinned`, `pin_reason`, `override_conflicts`, `override_reason`
28. `POST /v1/schedules`
    Frontend: `apps/web/src/app/[locale]/(school)/schedules/_components/schedule-form.tsx:157`
    Backend match: `apps/api/src/modules/schedules/schedules.controller.ts:54` -> `/v1/schedules`
    Unexpected body keys: `teacher_id`, `effective_from`, `effective_to`, `override`
    Backend accepted keys discovered statically: `class_id`, `room_id`, `teacher_staff_id`, `weekday`, `start_time`, `end_time`, `effective_start_date`, `effective_end_date`, `override_conflicts`, `override_reason`
29. `PATCH /v1/scheduling/break-groups/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/scheduling/break-groups/page.tsx:159`
    Backend match: `apps/api/src/modules/scheduling/break-groups.controller.ts:58` -> `/v1/scheduling/break-groups/:id`
    Unexpected body keys: `academic_year_id`
    Backend accepted keys discovered statically: `name`, `name_ar`, `location`, `required_supervisor_count`, `year_group_ids`
30. `PATCH /v1/scheduling/teacher-competencies/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/scheduling/competencies/page.tsx:267`
    Backend match: `apps/api/src/modules/scheduling/teacher-competencies.controller.ts:128` -> `/v1/scheduling/teacher-competencies/:id`
    Unexpected body keys: `is_primary`
    Backend accepted keys discovered statically: none
31. `POST /v1/class-scheduling-requirements/bulk`
    Frontend: `apps/web/src/app/[locale]/(school)/scheduling/requirements/page.tsx:403`
    Backend match: `apps/api/src/modules/class-requirements/class-requirements.controller.ts:90` -> `/v1/class-scheduling-requirements/bulk`
    Unexpected body keys: `apply_defaults_to_unconfigured`
    Backend accepted keys discovered statically: `academic_year_id`, `requirements`
32. `PATCH /v1/scheduling-runs/:param/adjustments`
    Frontend: `apps/web/src/app/[locale]/(school)/scheduling/runs/[id]/_components/cover-teacher-dialog.tsx:91`
    Backend match: `apps/api/src/modules/scheduling-runs/scheduling-runs.controller.ts:150` -> `/v1/scheduling-runs/:id/adjustments`
    Unexpected body keys: `action`, `staff_profile_id`, `weekday`, `period_order`, `year_group_id`
    Backend accepted keys discovered statically: `adjustment`, `expected_updated_at`
33. `PATCH /v1/scheduling-runs/:param/adjustments`
    Frontend: `apps/web/src/app/[locale]/(school)/scheduling/runs/[id]/page.tsx:183`
    Backend match: `apps/api/src/modules/scheduling-runs/scheduling-runs.controller.ts:150` -> `/v1/scheduling-runs/:id/adjustments`
    Unexpected body keys: `action`, `entry_id`, `to_weekday`, `to_period_order`
    Backend accepted keys discovered statically: `adjustment`, `expected_updated_at`
34. `PATCH /v1/scheduling-runs/:param/adjustments`
    Frontend: `apps/web/src/app/[locale]/(school)/scheduling/runs/[id]/review/page.tsx:142`
    Backend match: `apps/api/src/modules/scheduling-runs/scheduling-runs.controller.ts:150` -> `/v1/scheduling-runs/:id/adjustments`
    Unexpected body keys: `entry_a_id`, `entry_b_id`
    Backend accepted keys discovered statically: `adjustment`, `expected_updated_at`
35. `PATCH /v1/sen/plans/:param/status`
    Frontend: `apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx:254`
    Backend match: `apps/api/src/modules/sen/sen-support-plan.controller.ts:105` -> `/v1/sen/plans/:id/status`
    Unexpected body keys: `status`
    Backend accepted keys discovered statically: none
36. `POST /v1/sen/plans/:param/clone`
    Frontend: `apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx:289`
    Backend match: `apps/api/src/modules/sen/sen-support-plan.controller.ts:118` -> `/v1/sen/plans/:id/clone`
    Unexpected body keys: `academic_year_id`
    Backend accepted keys discovered statically: none
37. `POST /v1/sen/goals/:param/strategies`
    Frontend: `apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx:328`
    Backend match: `apps/api/src/modules/sen/sen-goal.controller.ts:145` -> `/v1/sen/goals/:id/strategies`
    Unexpected body keys: `description`, `frequency`
    Backend accepted keys discovered statically: none
38. `POST /v1/sen/goals/:param/progress`
    Frontend: `apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx:361`
    Backend match: `apps/api/src/modules/sen/sen-goal.controller.ts:118` -> `/v1/sen/goals/:id/progress`
    Unexpected body keys: `note`, `current_level`
    Backend accepted keys discovered statically: none
39. `PATCH /v1/sen/goals/:param/status`
    Frontend: `apps/web/src/app/[locale]/(school)/sen/plans/[planId]/page.tsx:394`
    Backend match: `apps/api/src/modules/sen/sen-goal.controller.ts:105` -> `/v1/sen/goals/:id/status`
    Unexpected body keys: `status`, `note`
    Backend accepted keys discovered statically: none
40. `PATCH /v1/sen/resource-allocations/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/sen/resource-allocation/page.tsx:147`
    Backend match: `apps/api/src/modules/sen/sen-resource.controller.ts:93` -> `/v1/sen/resource-allocations/:id`
    Unexpected body keys: `academic_year_id`, `total_hours`, `source`, `notes`
    Backend accepted keys discovered statically: none
41. `POST /v1/sen/resource-allocations`
    Frontend: `apps/web/src/app/[locale]/(school)/sen/resource-allocation/page.tsx:153`
    Backend match: `apps/api/src/modules/sen/sen-resource.controller.ts:71` -> `/v1/sen/resource-allocations`
    Unexpected body keys: `academic_year_id`, `total_hours`, `source`, `notes`
    Backend accepted keys discovered statically: none
42. `POST /v1/sen/student-hours`
    Frontend: `apps/web/src/app/[locale]/(school)/sen/resource-allocation/page.tsx:318`
    Backend match: `apps/api/src/modules/sen/sen-resource.controller.ts:106` -> `/v1/sen/student-hours`
    Unexpected body keys: `resource_allocation_id`, `student_id`, `sen_profile_id`, `allocated_hours`, `notes`
    Backend accepted keys discovered statically: none
43. `PATCH /v1/sen/sna-assignments/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/sen/sna-assignments/page.tsx:343`
    Backend match: `apps/api/src/modules/sen/sen-sna.controller.ts:107` -> `/v1/sen/sna-assignments/:id`
    Unexpected body keys: `schedule`, `notes`
    Backend accepted keys discovered statically: none
44. `POST /v1/sen/sna-assignments`
    Frontend: `apps/web/src/app/[locale]/(school)/sen/sna-assignments/page.tsx:350`
    Backend match: `apps/api/src/modules/sen/sen-sna.controller.ts:56` -> `/v1/sen/sna-assignments`
    Unexpected body keys: `sna_staff_profile_id`, `student_id`, `sen_profile_id`, `schedule`, `start_date`, `notes`
    Backend accepted keys discovered statically: none
45. `PATCH /v1/sen/sna-assignments/:param/end`
    Frontend: `apps/web/src/app/[locale]/(school)/sen/sna-assignments/page.tsx:541`
    Backend match: `apps/api/src/modules/sen/sen-sna.controller.ts:118` -> `/v1/sen/sna-assignments/:id/end`
    Unexpected body keys: `end_date`
    Backend accepted keys discovered statically: none
46. `POST /v1/academic-years/:param/periods`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/academic-years/_components/period-management.tsx:107`
    Backend match: `apps/api/src/modules/academics/academic-periods.controller.ts:52` -> `/v1/academic-years/:yearId/periods`
    Unexpected body keys: `academic_year_id`
    Backend accepted keys discovered statically: `name`, `period_type`, `start_date`, `end_date`, `status`
47. `PATCH /v1/behaviour/categories/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-categories/page.tsx:192`
    Backend match: `apps/api/src/modules/behaviour/behaviour-config.controller.ts:86` -> `/v1/behaviour/categories/:id`
    Unexpected body keys: `name`, `name_ar`, `polarity`, `severity`, `point_value`, `color`, `icon`, `benchmark_category`, `requires_follow_up`, `requires_parent_notification`, `parent_visible`, `display_order`
    Backend accepted keys discovered statically: none
48. `PATCH /v1/behaviour/categories/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-categories/page.tsx:230`
    Backend match: `apps/api/src/modules/behaviour/behaviour-config.controller.ts:86` -> `/v1/behaviour/categories/:id`
    Unexpected body keys: `is_active`
    Backend accepted keys discovered statically: none
49. `PATCH /v1/behaviour/document-templates/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-documents/page.tsx:234`
    Backend match: `apps/api/src/modules/behaviour/behaviour-config.controller.ts:264` -> `/v1/behaviour/document-templates/:id`
    Unexpected body keys: `document_type`, `locale`, `body`
    Backend accepted keys discovered statically: `name`, `template_body`, `is_active`
50. `POST /v1/behaviour/document-templates`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-documents/page.tsx:239`
    Backend match: `apps/api/src/modules/behaviour/behaviour-config.controller.ts:253` -> `/v1/behaviour/document-templates`
    Unexpected body keys: `body`
    Backend accepted keys discovered statically: `document_type`, `name`, `locale`, `template_body`, `merge_fields`
51. `PATCH /v1/settings`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/behaviour-general/page.tsx:246`
    Backend match: `apps/api/src/modules/configuration/settings.controller.ts:43` -> `/v1/settings`
    Unexpected body keys: `behaviour`
    Backend accepted keys discovered statically: none
52. `POST /v1/school-closures/bulk`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/closures/_components/closure-form.tsx:87`
    Backend match: `apps/api/src/modules/school-closures/school-closures.controller.ts:53` -> `/v1/school-closures/bulk`
    Unexpected body keys: `scope`, `entity_id`
    Backend accepted keys discovered statically: `start_date`, `end_date`, `reason`, `affects_scope`, `scope_entity_id`, `skip_weekends`
53. `PATCH /v1/settings`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/sen/page.tsx:75`
    Backend match: `apps/api/src/modules/configuration/settings.controller.ts:43` -> `/v1/settings`
    Unexpected body keys: `sen`
    Backend accepted keys discovered statically: none
54. `POST /v1/year-groups`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/year-groups/page.tsx:70`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:32` -> `/v1/year-groups`
    Unexpected body keys: `classroom_model`
    Backend accepted keys discovered statically: `name`, `display_order`, `next_year_group_id`
55. `PATCH /v1/year-groups/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/settings/year-groups/page.tsx:84`
    Backend match: `apps/api/src/modules/academics/year-groups.controller.ts:47` -> `/v1/year-groups/:id`
    Unexpected body keys: `classroom_model`
    Backend accepted keys discovered statically: `name`, `display_order`, `next_year_group_id`
56. `POST /v1/website/pages`
    Frontend: `apps/web/src/app/[locale]/(school)/website/new/page.tsx:80`
    Backend match: `apps/api/src/modules/website/website-pages.controller.ts:69` -> `/v1/website/pages`
    Unexpected body keys: `status`
    Backend accepted keys discovered statically: `locale`, `page_type`, `slug`, `title`, `meta_title`, `meta_description`, `body_html`, `show_in_nav`, `nav_order`
57. `PATCH /v1/staff-wellbeing/surveys/:param`
    Frontend: `apps/web/src/app/[locale]/(school)/wellbeing/surveys/_components/survey-form-dialog.tsx:210`
    Backend match: `apps/api/src/modules/staff-wellbeing/controllers/survey.controller.ts:95` -> `/v1/staff-wellbeing/surveys/:id`
    Unexpected body keys: `title`, `description`, `frequency`, `window_opens_at`, `window_closes_at`, `min_response_threshold`, `dept_drill_down_threshold`, `moderation_enabled`, `questions`
    Backend accepted keys discovered statically: none
58. `POST /v1/auth/login`
    Frontend: `apps/web/src/providers/auth-provider.tsx:137`
    Backend match: `apps/api/src/modules/auth/auth.controller.ts:48` -> `/v1/auth/login`
    Unexpected body keys: `email`, `password`
    Backend accepted keys discovered statically: none
59. `POST /v1/auth/switch-tenant`
    Frontend: `apps/web/src/providers/auth-provider.tsx:192`
    Backend match: `apps/api/src/modules/auth/auth.controller.ts:213` -> `/v1/auth/switch-tenant`
    Unexpected body keys: `tenant_id`
    Backend accepted keys discovered statically: none

## Notes

- This report is intentionally exhaustive from the static pass. Some low-confidence route misses come from dynamically assembled paths and should be manually confirmed before treating them as production defects.
- The most actionable buckets for immediate cleanup are:
- hard page-size mismatches
- auth path mismatches
- body key renames where backend accepted keys are known
- repeated pagination/query drift on lookup endpoints like `year-groups`, `assessment-categories`, `sen/profiles`, and similar selectors
