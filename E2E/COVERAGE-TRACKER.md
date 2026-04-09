# E2E Test Coverage Tracker

**Total Application Pages: 341**

| Route Group | Total Pages | Covered | Remaining |
| ----------- | ----------- | ------- | --------- |
| (school)    | 322         | 24      | 298       |
| (platform)  | 8           | 0       | 8         |
| (auth)      | 5           | 0       | 5         |
| (public)    | 6           | 0       | 6         |
| **TOTAL**   | **341**     | **24**  | **317**   |

**Overall Progress: 24 / 341 (7.0%)**

---

## School Pages Breakdown (322 total)

| #   | Directory                                     | Pages | Spec Document                                      | Status                                   |
| --- | --------------------------------------------- | ----- | -------------------------------------------------- | ---------------------------------------- |
| 1   | `/dashboard`                                  | 3     | [1_dashboard](./1_dashboard/dashboard-e2e-spec.md) | 1/3 covered                              |
| 2   | `/students` `/staff` `/households` `/parents` | 14    | [2_people](./2_people/people-e2e-spec.md)          | 14/14 covered                            |
| 3   | `/assessments` `/gradebook` `/analytics`      | 10    | [3_learning/assessment](./3_learning/assessment/)  | 9/10 covered (teacher_view + admin_view) |
| 4   | `/settings`                                   | 39    | _Not started_                                      |                                          |
| 5   | `/behaviour`                                  | 25    | _Not started_                                      |                                          |

| 5 | `/regulatory` | 25 | _Not started_ | |
| 6 | `/scheduling` | 25 | _Not started_ | |
| 7 | `/engagement` | 22 | _Not started_ | |
| 8 | `/finance` | 23 | _Not started_ | |
| 9 | `/pastoral` | 20 | _Not started_ | |
| 10 | `/reports` | 20 | _Not started_ | |
| 11 | `/homework` | 11 | _Not started_ | |
| 12 | `/gradebook` | 10 | (covered by row 3 above) | |
| 12 | `/payroll` | 10 | _Not started_ | |
| 13 | `/sen` | 8 | _Not started_ | |
| 14 | `/admissions` | 7 | _Not started_ | |
| 15 | `/wellbeing` | 7 | _Not started_ | |
| 16 | `/communications` | 5 | _Not started_ | |
| 17 | `/attendance` | 5 | _Not started_ | |
| 18 | `/safeguarding` | 5 | _Not started_ | |
| 19 | `/report-cards` | 5 | _Not started_ | |
| 20 | `/students` | 5 | _Not started_ | |
| 21 | `/classes` | 4 | _Not started_ | |
| 22 | `/households` | 4 | _Not started_ | |
| 23 | `/staff` | 4 | _Not started_ | |
| 24 | `/website` | 4 | _Not started_ | |
| 25 | `/early-warnings` | 3 | _Not started_ | |
| 26 | `/inquiries` | 3 | _Not started_ | |
| 27 | `/parent` | 2 | _Not started_ | |
| 28 | `/profile` | 2 | _Not started_ | |
| 29 | `/rooms` | 2 | _Not started_ | |
| 30 | `/approvals` | 2 | _Not started_ | |
| 31 | `/announcements` | 1 | _Not started_ | |
| 32 | `/applications` | 1 | _Not started_ | |
| 33 | `/class-assignments` | 1 | _Not started_ | |
| 34 | `/curriculum-matrix` | 1 | _Not started_ | |
| 35 | `/diary` | 1 | _Not started_ | |
| 36 | `/parents` | 1 | _Not started_ | |
| 37 | `/privacy-consent` | 1 | _Not started_ | |
| 38 | `/privacy-notice` | 1 | _Not started_ | |
| 39 | `/promotion` | 1 | _Not started_ | |
| 40 | `/schedules` | 1 | _Not started_ | |
| 41 | `/subjects` | 1 | _Not started_ | |
| 42 | `/timetables` | 1 | _Not started_ | |

---

## Completed Specifications

Each assessment area has TWO specs — one for the teacher flow and one for the admin (leadership) flow. Both render on the same URLs but detect role at mount and show purpose-built variants.

| #   | Spec                                                                                                    | Perspective | Pages Covered                 | Date Completed |
| --- | ------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------- | -------------- |
| 1   | [Dashboard](./1_dashboard/dashboard-e2e-spec.md)                                                        | —           | 1                             | 2026-04-07     |
| 2   | [People](./2_people/people-e2e-spec.md)                                                                 | —           | 14                            | 2026-04-07     |
| 3   | [Learning — Assessment Dashboard (Teacher)](./3_learning/assessment/teacher_view/dashboard-e2e-spec.md) | Teacher     | 3                             | 2026-04-09     |
| 4   | [Learning — Gradebook (Teacher)](./3_learning/assessment/teacher_view/gradebook-e2e-spec.md)            | Teacher     | 4                             | 2026-04-09     |
| 5   | [Learning — Analytics (Teacher)](./3_learning/assessment/teacher_view/analytics-e2e-spec.md)            | Teacher     | 1                             | 2026-04-09     |
| 6   | [Learning — Assessment Dashboard (Admin)](./3_learning/assessment/admin_view/dashboard-e2e-spec.md)     | Admin       | 2 (new: approvals page)       | 2026-04-09     |
| 7   | [Learning — Gradebook (Admin)](./3_learning/assessment/admin_view/gradebook-e2e-spec.md)                | Admin       | 0 (same URLs as teacher spec) | 2026-04-09     |
| 8   | [Learning — Analytics (Admin)](./3_learning/assessment/admin_view/analytics-e2e-spec.md)                | Admin       | 0 (same URLs as teacher spec) | 2026-04-09     |

---

## Notes

- Each spec document includes its own page coverage count in the header
- The master coverage numbers above are updated as new specs are completed
- Some directories contain multiple pages (e.g., `/settings` has 39 pages including sub-routes like branding, roles, legal, etc.) — a single spec may cover multiple pages within a directory
- Platform, auth, and public pages will be tracked separately once school pages are complete
- **Admin vs Teacher variants**: For pages that render differently per role (e.g., `/en/assessments`, `/en/gradebook`, `/en/analytics`), separate spec files document each perspective. These live in `teacher_view/` and `admin_view/` subfolders. The admin dashboard spec also documents the Approval Queue page (`/en/assessments/approvals`) in full — that page only applies to admins and contributes +1 to the unique page count.
