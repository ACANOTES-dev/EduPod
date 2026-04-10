# E2E Test Coverage Tracker

**Total Application Pages: 350**

| Route Group | Total Pages | Covered | Remaining |
| ----------- | ----------- | ------- | --------- |
| (school)    | 331         | 36      | 295       |
| (platform)  | 8           | 0       | 8         |
| (auth)      | 5           | 0       | 5         |
| (public)    | 6           | 0       | 6         |
| **TOTAL**   | **350**     | **36**  | **314**   |

**Overall Progress: 36 / 350 (10.3%)**

---

## School Pages Breakdown (331 total)

| #   | Directory                                     | Pages | Spec Document                                       | Status                                                                                                                                          |
| --- | --------------------------------------------- | ----- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/dashboard`                                  | 3     | [1_dashboard](./1_dashboard/dashboard-e2e-spec.md)  | 1/3 covered                                                                                                                                     |
| 2   | `/students` `/staff` `/households` `/parents` | 14    | [2_people](./2_people/people-e2e-spec.md)           | 14/14 covered                                                                                                                                   |
| 3   | `/assessments` `/gradebook` `/analytics`      | 10    | [3_learning/assessment](./3_learning/assessment/)   | 9/10 covered (teacher_view + admin_view)                                                                                                        |
| 4   | `/report-cards` `/report-comments`            | 14    | [3_learning/ReportCards](./3_learning/ReportCards/) | **12/14 covered** (teacher_view + admin_view). Retired redirect stubs `/approvals` + `/bulk` count as 2 uncovered (documented but out-of-flow). |
| 5   | `/settings`                                   | 39    | _Not started_                                       |                                                                                                                                                 |
| 6   | `/behaviour`                                  | 25    | _Not started_                                       |                                                                                                                                                 |
| 7   | `/regulatory`                                 | 25    | _Not started_                                       |                                                                                                                                                 |
| 8   | `/scheduling`                                 | 25    | _Not started_                                       |                                                                                                                                                 |
| 9   | `/engagement`                                 | 22    | _Not started_                                       |                                                                                                                                                 |
| 10  | `/finance`                                    | 23    | _Not started_                                       |                                                                                                                                                 |
| 11  | `/pastoral`                                   | 20    | _Not started_                                       |                                                                                                                                                 |
| 12  | `/reports`                                    | 20    | _Not started_                                       |                                                                                                                                                 |
| 13  | `/homework`                                   | 11    | _Not started_                                       |                                                                                                                                                 |
| 14  | `/gradebook`                                  | 10    | (covered by row 3 above)                            |                                                                                                                                                 |
| 15  | `/payroll`                                    | 10    | _Not started_                                       |                                                                                                                                                 |
| 16  | `/sen`                                        | 8     | _Not started_                                       |                                                                                                                                                 |
| 17  | `/admissions`                                 | 7     | _Not started_                                       |                                                                                                                                                 |
| 18  | `/wellbeing`                                  | 7     | _Not started_                                       |                                                                                                                                                 |
| 19  | `/communications`                             | 5     | _Not started_                                       |                                                                                                                                                 |
| 20  | `/attendance`                                 | 5     | _Not started_                                       |                                                                                                                                                 |
| 21  | `/safeguarding`                               | 5     | _Not started_                                       |                                                                                                                                                 |
| 22  | `/students`                                   | 5     | _Not started_                                       |                                                                                                                                                 |
| 23  | `/classes`                                    | 4     | _Not started_                                       |                                                                                                                                                 |
| 24  | `/households`                                 | 4     | _Not started_                                       |                                                                                                                                                 |
| 25  | `/staff`                                      | 4     | _Not started_                                       |                                                                                                                                                 |
| 26  | `/website`                                    | 4     | _Not started_                                       |                                                                                                                                                 |
| 27  | `/early-warnings`                             | 3     | _Not started_                                       |                                                                                                                                                 |
| 28  | `/inquiries`                                  | 3     | _Not started_                                       |                                                                                                                                                 |
| 29  | `/parent`                                     | 2     | _Not started_                                       |                                                                                                                                                 |
| 30  | `/profile`                                    | 2     | _Not started_                                       |                                                                                                                                                 |
| 31  | `/rooms`                                      | 2     | _Not started_                                       |                                                                                                                                                 |
| 32  | `/approvals`                                  | 2     | _Not started_                                       |                                                                                                                                                 |
| 33  | `/announcements`                              | 1     | _Not started_                                       |                                                                                                                                                 |
| 34  | `/applications`                               | 1     | _Not started_                                       |                                                                                                                                                 |
| 35  | `/class-assignments`                          | 1     | _Not started_                                       |                                                                                                                                                 |
| 36  | `/curriculum-matrix`                          | 1     | _Not started_                                       |                                                                                                                                                 |
| 37  | `/diary`                                      | 1     | _Not started_                                       |                                                                                                                                                 |
| 38  | `/parents`                                    | 1     | _Not started_                                       |                                                                                                                                                 |
| 39  | `/privacy-consent`                            | 1     | _Not started_                                       |                                                                                                                                                 |
| 40  | `/privacy-notice`                             | 1     | _Not started_                                       |                                                                                                                                                 |
| 41  | `/promotion`                                  | 1     | _Not started_                                       |                                                                                                                                                 |
| 42  | `/schedules`                                  | 1     | _Not started_                                       |                                                                                                                                                 |
| 43  | `/subjects`                                   | 1     | _Not started_                                       |                                                                                                                                                 |
| 44  | `/timetables`                                 | 1     | _Not started_                                       |                                                                                                                                                 |

---

## Completed Specifications

Each area has TWO specs — one for the teacher flow and one for the admin (leadership) flow. Both render on the same URLs but detect role at mount and show purpose-built variants.

| #   | Spec                                                                                                    | Perspective | Pages Covered                                                                                                                                                                                         | Date Completed |
| --- | ------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | [Dashboard](./1_dashboard/dashboard-e2e-spec.md)                                                        | —           | 1                                                                                                                                                                                                     | 2026-04-07     |
| 2   | [People](./2_people/people-e2e-spec.md)                                                                 | —           | 14                                                                                                                                                                                                    | 2026-04-07     |
| 3   | [Learning — Assessment Dashboard (Teacher)](./3_learning/assessment/teacher_view/dashboard-e2e-spec.md) | Teacher     | 3                                                                                                                                                                                                     | 2026-04-09     |
| 4   | [Learning — Gradebook (Teacher)](./3_learning/assessment/teacher_view/gradebook-e2e-spec.md)            | Teacher     | 4                                                                                                                                                                                                     | 2026-04-09     |
| 5   | [Learning — Analytics (Teacher)](./3_learning/assessment/teacher_view/analytics-e2e-spec.md)            | Teacher     | 1                                                                                                                                                                                                     | 2026-04-09     |
| 6   | [Learning — Assessment Dashboard (Admin)](./3_learning/assessment/admin_view/dashboard-e2e-spec.md)     | Admin       | 2 (new: approvals page)                                                                                                                                                                               | 2026-04-09     |
| 7   | [Learning — Gradebook (Admin)](./3_learning/assessment/admin_view/gradebook-e2e-spec.md)                | Admin       | 0 (same URLs as teacher spec)                                                                                                                                                                         | 2026-04-09     |
| 8   | [Learning — Analytics (Admin)](./3_learning/assessment/admin_view/analytics-e2e-spec.md)                | Admin       | 0 (same URLs as teacher spec)                                                                                                                                                                         | 2026-04-09     |
| 9   | [Learning — Report Cards (Admin)](./3_learning/ReportCards/admin_view/report-cards-e2e-spec.md)         | Admin       | **12** (report-cards dashboard, class matrix, settings, generate wizard, library, analytics, requests list + detail, report-comments landing, overall editor, subject editor, retired redirect stubs) | 2026-04-10     |
| 10  | [Learning — Report Cards (Teacher)](./3_learning/ReportCards/teacher_view/report-cards-e2e-spec.md)     | Teacher     | 0 (same URLs as admin spec; Admin spec counts the unique pages. Teacher spec documents the scoped variants + teacher-only new-request form.)                                                          | 2026-04-10     |

---

## Notes

- Each spec document includes its own page coverage count in the header.
- The master coverage numbers above are updated as new specs are completed.
- Some directories contain multiple pages (e.g. `/settings` has 39 pages including sub-routes like branding, roles, legal, etc.) — a single spec may cover multiple pages within a directory.
- Platform, auth, and public pages will be tracked separately once school pages are complete.
- **Admin vs Teacher variants**: For pages that render differently per role (e.g. `/en/assessments`, `/en/gradebook`, `/en/report-cards`, `/en/report-comments`), separate spec files document each perspective. These live in `teacher_view/` and `admin_view/` subfolders.

### Report Cards module overhaul (2026-04)

The Report Cards module was completely overhauled between the initial coverage estimate (5 pages) and the admin/teacher specs written on 2026-04-10. The revamped module now spans **14 unique routes** split across `/report-cards/*` and `/report-comments/*`:

1. `/report-cards` — Dashboard with period selector, quick action tiles (4 for admin, 2 for teacher), live run panel, analytics snapshot, classes-by-year-group grid
2. `/report-cards/{classId}` — Per-class grade matrix with period filter + grade/score toggle + top-rank badges
3. `/report-cards/settings` — Tenant-wide settings: display defaults, comment gate, personal info defaults, default template, principal details + signature upload
4. `/report-cards/generate` — 6-step generation wizard (scope / period / template / fields / comment gate / review) + polling + terminal states
5. `/report-cards/library` — Grouped library with by-run / by-year-group / by-class views, row-level publish/unpublish/delete, bundle downloads
6. `/report-cards/analytics` — Summary cards, class comparison chart, per-class generation progress
7. `/report-cards/requests` — Teacher requests list with Pending/All admin tabs
8. `/report-cards/requests/{id}` — Request detail with Approve & Open / Auto-approve / Reject flows
9. `/report-cards/requests/new` — Teacher-only new request form
10. `/report-comments` — Landing page with window banner + homeroom cards + subject cards derived from competencies × curriculum matrix
11. `/report-comments/overall/{classId}` — Overall comments editor with autosave + finalise/unfinalise
12. `/report-comments/subject/{classId}/{subjectId}` — Subject comments editor with per-row AI draft + bulk AI + bulk finalise
13. `/report-cards/approvals` — Retired redirect stub (→ `/report-cards/requests`)
14. `/report-cards/bulk` — Retired redirect stub (→ `/report-cards`)

The admin spec (section count: 78) is the authoritative walkthrough for anyone onboarding the module for QC. The teacher spec (section count: 24) is the paired scope-restricted walkthrough — both must be run before tenant onboarding.
