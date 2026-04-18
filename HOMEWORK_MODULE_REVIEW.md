# Homework Module — End-to-End Review

**Date:** 2026-04-18
**Status:** Analysis only — no code changes made
**Context:** Scheduling module is now live. Every class has a published timetable with known teacher/subject/period mappings. This review examines how ready the homework module is to consume that data and wire into the existing inbox/notifications infrastructure.

---

## TL;DR

The backend is **~95% built** (44 endpoints, full state machine, analytics, recurrence, attachments, parent views, diary). The frontend has **teacher/admin/parent surfaces but zero student surface**. The whole thing is **functionally silo'd** — it does not talk to Scheduling, does not trigger multi-channel notifications, and its own BullMQ queue is registered but unused.

The good news: the two systems we want to plug into (inbox + scheduling) are both live, and the integration surface is small. **This is wiring work, not a rebuild.**

---

## 1. Current State

### 1.1 Backend (`apps/api/src/modules/homework/`)

**Prisma models (all RLS-enforced):**

- `HomeworkAssignment` — title, description, type, status, due date/time, class, subject, academic year/period, assigned_by, recurrence ref, copied_from ref, max_points.
- `HomeworkAttachment` — file / link / video, S3-backed.
- `HomeworkCompletion` — per-student completion row with status, points, verification, optimistic locking.
- `HomeworkRecurrenceRule` — frequency, interval, days of week, start/end.
- `DiaryNote` — per-student daily note.
- `DiaryParentNote` — bidirectional parent↔teacher thread.

**Enums:**

- `HomeworkType`: written, reading, research, revision, project_work, online_activity
- `HomeworkStatus`: draft, published, archived
- `CompletionStatus`: not_started, in_progress, completed
- `RecurrenceFrequency`: daily, weekly, custom

**Controllers (44 endpoints total):**

| Controller                      | Path                          | Endpoints                                                                                                                  |
| ------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `HomeworkController`            | `v1/homework`                 | 17 — CRUD, status, copy, attachments, recurrence rules, bulk-create, by-class, week, today, templates                      |
| `HomeworkCompletionsController` | `v1/homework/:id/completions` | 5 — list, self-report, bulk mark, per-student update, completion rate                                                      |
| `HomeworkParentController`      | `v1/parent/homework`          | 6 — list, today, overdue, week, per-child summary, per-child diary                                                         |
| `HomeworkDiaryController`       | `v1/diary`                    | 6 — notes CRUD + parent-notes thread + acknowledge                                                                         |
| `HomeworkAnalyticsController`   | `v1/homework/analytics`       | 10 — completion rates, load (daily + weekly), non-completers, correlation, student/class/subject/teacher/year-group trends |

**State machine:**

```
draft      → [published, archived]
published  → [archived]
archived   → (terminal)
```

Side effect: `draft → published` sets `published_at`. Edits and deletes only allowed in `draft`.

**Tests:** 16 co-located `.spec.ts` files (service, controller, branch, rls, performance).

### 1.2 Frontend (`apps/web/src/app/[locale]/(school)/homework/...`)

**Teacher / admin routes:**

- `/homework` — dashboard (today + recent published)
- `/homework/new` — create form (react-hook-form + zodResolver)
- `/homework/[id]` — detail view with status toggle, copy, delete
- `/homework/[id]/completions` — bulk student grading grid
- `/homework/analytics` — completion rates, non-completers, class/subject breakdowns
- `/homework/analytics/load` — heatmap (year groups × days of week), insights
- `/homework/templates` — browse published as templates, copy with new date
- `/homework/by-class/[classId]` — list + week view

**Parent routes:**

- `/homework/parent` — aggregated view across children (overdue, today, this week)
- `/homework/parent/[studentId]` — per-child detail with filters and calendar toggle
- `/homework/parent/[studentId]/notes` — parent-teacher thread, compose, acknowledge

**Student routes:** **None.** Students cannot view or interact with homework.

**Hub integration:** Homework sits under the Learning hub. Navigation entry exists in `nav-config.ts`. **No sub-strip tabs configured** — no in-shell navigation between list / analytics / load / templates.

### 1.3 Workers (`apps/worker/src/processors/homework/`)

Four cron-driven processors:

| Processor             | Cron            | Output                                                      |
| --------------------- | --------------- | ----------------------------------------------------------- |
| `generate-recurring`  | 05:00 UTC daily | Auto-creates draft assignments from active recurrence rules |
| `overdue-detection`   | 06:00 UTC daily | Creates overdue notifications (in-app only) for parents     |
| `digest-homework`     | 07:00 UTC daily | Creates digest notifications (in-app only) for parents      |
| `completion-reminder` | 15:00 UTC daily | Creates 24h-before reminders (in-app only) for parents      |

**All four write directly to the `Notification` table with `channel: 'in_app'` and `status: 'delivered'`.** No email, SMS, WhatsApp. No BullMQ dispatch.

### 1.4 Documented Known Issues

From `docs/architecture/danger-zones.md`:

- **DZ-Homework-1 (LIVE DRIFT):** `homework:digest-homework` and `homework:completion-reminder` have a dual-dispatch mismatch. The direct cron registrations in `CronSchedulerService` send empty `{}` payloads, but the processors expect `tenant_id`. Only the behaviour-dispatch path (`behaviour:cron-dispatch-daily`) currently works correctly.
- **DZ-Homework-2:** `homework.performance.spec.ts` calls analytics methods by name. Renames break it silently.
- **DZ-Homework-3:** `generate-recurring` and `overdue-detection` are cross-tenant and must avoid RLS-backed relation filters before tenant context is set.

---

## 2. Wiring Gaps (Ranked)

| #   | Gap                                                  | Severity | Why                                                                                                                                                                  |
| --- | ---------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **No Scheduling integration**                        | High     | Any user with `homework.manage` can assign to any class. No check that the teacher actually teaches that class/subject. This is the core gap.                        |
| 2   | **No student UI**                                    | High     | Students cannot view assigned homework or submit work. Only parent "mark done" exists.                                                                               |
| 3   | **Notifications are in-app only**                    | High     | `communications` module has Resend (email) + Twilio (SMS/WhatsApp) + inbox broadcasts fully wired. Homework calls none of it. No channel toggles on the create form. |
| 4   | **BullMQ queue is orphaned**                         | Medium   | `homework` queue registered; no `.add()` calls anywhere. All background work is cron-driven, not event-driven.                                                       |
| 5   | **Dual-dispatch cron bug (DZ-Homework-1)**           | Medium   | Documented. Needs fix before we add more worker surface.                                                                                                             |
| 6   | **Edit page missing**                                | Medium   | Detail view's "Edit" button is a dead link. No `/homework/[id]/edit` route.                                                                                          |
| 7   | **Attachments built but not wired into create form** | Low      | `AttachmentManager` component exists; quick form doesn't render it.                                                                                                  |
| 8   | **Recurrence has no UI**                             | Low      | Backend supports it; form has no "repeat weekly" toggle.                                                                                                             |
| 9   | **No granular recipient selection**                  | Low      | Create form is whole-class only. Can't pick specific students.                                                                                                       |
| 10  | **No homework sub-strip in morphing shell**          | Low      | Teachers navigate via URL / ad-hoc links between homework sub-pages.                                                                                                 |

---

## 3. What We Can Plug Into (Inventory of Live Infrastructure)

### 3.1 Inbox / Communications (`apps/api/src/modules/communications/` + `apps/api/src/modules/inbox/`)

- **`AnnouncementsService.executePublish()`** — existing orchestrator: resolve audience → batch notifications → enqueue dispatch. This is the template homework should mirror.
- **`NotificationDispatchService`** — per-channel fan-out with fallback chain: `whatsapp → sms → email → in_app`.
- **Providers:** Resend (email), Twilio SMS, Twilio WhatsApp, Inbox channel — all live.
- **Audience providers** (29 of them, in `apps/api/src/modules/inbox/audience/providers/`): `class-parents`, `class-students`, `year-group-parents`, `year-group-students`, `household`, `custom`. "Students in 2A + their parents" is a one-liner.
- **Preference gates:** `Parent.preferred_contact_channels` (per-parent) + `TenantNotificationSetting` (tenant-level per-type). Already enforced in dispatch.
- **Template renderer:** Handlebars with `formatDate` helper. Template lookup by key + locale + channel.
- **`ConversationsService.createBroadcast()`** — Wave 3 inbox path if we want conversation threading instead of one-shot notifications.

### 3.2 Scheduling (`apps/api/src/modules/scheduling/`)

- **`Schedule` table:** `teacher_staff_id` + `class_id` + `academic_year_id` + `effective_start_date` / `effective_end_date`. This is the authority source.
- **`Class.subject_id`:** every class has a subject on it.
- **`TeacherCompetency`:** certifies a teacher for subject/year-group pairs.
- **`SchedulingReadFacade.findTeacherCompetencies()`** — exists, but doesn't expose "classes I teach." We need to add one method.
- **`ClassesReadFacade.findEnrolledStudentIds(tenantId, classId)`** — resolves the class roster today.

---

## 4. Four-Wave Implementation Plan

> Each wave is self-contained and independently deployable. Order matters: later waves assume authority (wave 1) and notifications (wave 2) already land.

---

### Wave 1 — Teacher Authority + Entry Surface

**Goal:** A teacher opens the app, sees exactly the classes they teach (per schedule), picks one, picks a subject they're actually assigned for, and only then gets to the homework form. Server-side enforcement mirrors this.

**Backend work:**

- Add `SchedulingReadFacade.findClassesTaughtByTeacher(tenantId, staffProfileId, academicYearId)` returning `{ class_id, class_name, subject_id, subject_name, year_group_id, periods_per_week }[]`.
- Add a guard helper `SchedulingAuthorityService.canAssignHomework(tenantId, teacherUserId, classId, subjectId)` that queries `Schedule` + cross-checks `Class.subject_id`. Principals/admins bypass.
- Wire the guard into `POST /v1/homework` (create), `POST /v1/homework/:id/copy`, `POST /v1/homework/bulk-create`. Throw `ForbiddenException({ code: 'NOT_YOUR_CLASS', message: ... })` on fail.
- Add `GET /v1/homework/my-classes` — returns teacher's scheduled classes for the current academic year. Admin can pass `?teacher_id=` to browse.
- Schema: no changes required.

**Frontend work:**

- New page: `/homework/my-classes` — card grid of class × subject tiles (Sarah → English 2A, English 2B, …). Each card shows counts: active HW, overdue, pending grading.
- Refactor `/homework/new` to accept `?class_id=&subject_id=` pre-fill. Remove the free-form class picker for teachers (keep for admins/principals).
- Dashboard tweak: `/homework` shows "My Classes" tile as the primary CTA for teachers.
- Morphing shell: add a homework sub-strip with tabs: `My Classes | List | Templates | Analytics | Load`.

**Tests:**

- Service spec: teacher can/cannot assign for scheduled/unscheduled class.
- Controller spec: 403 on unscheduled class for teacher role, 200 for admin.
- RLS leakage spec: teacher in tenant A cannot see tenant B's schedule data via `my-classes`.
- E2E: Sarah creates HW for English 2A → succeeds; attempts Maths 2A → blocked.

**Definition of done:**

- Every create/copy/bulk path gated by scheduling.
- Teachers land on `/homework/my-classes` as the default homework entry.
- Sub-strip renders; tabs wired.
- All tests green; DI check passes; coverage ratchet.

---

### Wave 2 — Multi-Channel Notifications on Publish

**Goal:** When a teacher publishes homework, they pick which channels fire (in-app / email / SMS / WhatsApp) and which audience (students / parents / both). Everything flows through the existing communications dispatch pipeline.

**Backend work:**

- Add `HomeworkNotificationService` in the homework module that mirrors the `AnnouncementsService.executePublish()` pattern.
- On `draft → published` transition (or explicit `POST /v1/homework/:id/notify`), the service:
  1. Resolves recipients using the inbox audience providers (`class-students` + `class-parents`).
  2. Filters against `Parent.preferred_contact_channels` and `TenantNotificationSetting`.
  3. Creates a `Notification` batch with `chain_id` for fallback tracking.
  4. Enqueues the `communications:dispatch-notifications` BullMQ job.
  5. Writes an `inbox` conversation broadcast if the teacher opts in.
- New notification templates (tenant-seeded, bilingual EN/AR): `homework_assigned_in_app`, `homework_assigned_email`, `homework_assigned_sms`, `homework_assigned_whatsapp`. Include variables: `student_name`, `subject`, `title`, `due_date`, `teacher_name`, `homework_url`.
- Extend `POST /v1/homework` and `PATCH /v1/homework/:id/status` payloads with optional `notification_options`:
  ```
  {
    channels: ['in_app', 'email', 'sms', 'whatsapp']?,
    audience: 'students' | 'parents' | 'both',
    send_inbox_message: boolean,
    custom_message: string?
  }
  ```
- If `notification_options` omitted, default to tenant setting or in-app-only.
- Fix **DZ-Homework-1** as part of this wave: migrate the direct cron registrations to per-tenant enqueue through the behaviour-dispatch path, or pass `tenant_id` correctly. Add a regression test.
- Worker: the existing homework cron processors (digest, reminder, overdue) switch from writing `channel: 'in_app'` directly to enqueuing `communications:dispatch-notifications` with the right template keys so they pick up multi-channel routing too.

**Frontend work:**

- Extend `HomeworkQuickForm` (`/homework/new`) with a "Notify" section:
  - Checkbox group: In-app (default on, disabled) / Email / SMS / WhatsApp.
  - Audience radio: Students only / Parents only / Both.
  - Checkbox: "Also post as inbox message" (opens rich textarea for optional custom note).
  - Summary line: "Will notify 28 students + 41 parents via in-app and email."
- Tenant settings page: add homework notification defaults (which channels pre-ticked, tenant-level opt-in matrix).
- Detail page `/homework/[id]`: add a "Re-notify" button that opens the same modal (useful for reminders / corrections).

**Tests:**

- Service spec: published homework enqueues correct batch with correct channels.
- Service spec: parent preferences filter out disabled channels.
- Service spec: tenant settings filter out disabled channels.
- E2E: teacher publishes with email+sms → `Notification` rows created for each recipient × channel, dispatch job enqueued.
- Regression: DZ-Homework-1 fix — cron-triggered dispatch reaches the correct per-tenant processor.

**Definition of done:**

- Publishing a homework fires multi-channel notifications end-to-end in staging.
- Teacher UI exposes channel + audience controls.
- DZ-Homework-1 closed in `danger-zones.md`.
- No regressions in existing in-app-only flows.
- All tests green.

---

### Wave 3 — Student Surface + Submissions

**Goal:** Students log in, see assigned homework, submit work (text + file attachments). Teachers see submissions in the grading grid and give feedback. This is the biggest user-facing change.

**Backend work:**

- Schema additions:
  - `HomeworkSubmission` table: id, tenant_id, homework_assignment_id, student_id, submitted_at, submission_text (nullable), status enum (`not_submitted`, `submitted`, `returned_for_revision`, `graded`), teacher_feedback (nullable), graded_by_user_id (nullable), graded_at (nullable), points_awarded (nullable), version (optimistic lock).
  - Unique `(tenant_id, homework_assignment_id, student_id)`.
  - `HomeworkSubmissionAttachment` table: same shape as `HomeworkAttachment` but FK to submission.
  - RLS policies + indexes per conventions.
  - Migration + `post_migrate.sql`.
- New module: `apps/api/src/modules/homework/student/` (or nested under homework) with:
  - `HomeworkStudentController` (`v1/student/homework`): `GET /`, `GET /today`, `GET /this-week`, `GET /overdue`, `GET /:id`, `POST /:id/submit`, `POST /:id/submit/attachments`, `DELETE /:id/submit/attachments/:attId`, `PATCH /:id/submit` (edit before due date).
  - `HomeworkStudentService` — resolves student from auth, returns homework via class enrolment.
  - Permissions: new `student.homework.view`, `student.homework.submit`.
- Extend `HomeworkCompletion` lifecycle to sync with submission status: submitting flips completion to `completed` and links the submission.
- Extend `HomeworkCompletionsService.bulkMark` (grading grid) to accept `teacher_feedback` and `points_awarded`, writing to the submission when one exists.
- New endpoint: `POST /v1/homework/:id/submissions/:submissionId/return` — teacher returns for revision with feedback; emits a notification using Wave 2 infrastructure.
- Notification triggers (Wave 2 pipeline): `homework_submitted` (to teacher), `homework_returned` (to student + parents), `homework_graded` (to student + parents).

**Frontend work:**

- New role shell for students if it doesn't exist — check current student surface before assuming greenfield.
- New pages:
  - `/student/homework` — today / this week / overdue tabs. Cards show title, subject, due date, status badge.
  - `/student/homework/[id]` — detail view with description, attachments, due date.
  - `/student/homework/[id]/submit` — text field + file upload (reuses `AttachmentManager`). Submit button. Pre-filled if draft submission exists.
  - `/student/homework/[id]/result` — shows teacher feedback, grade, points.
- Teacher grading grid (`/homework/[id]/completions`) extended:
  - Each row shows submission status + attachments links.
  - Inline feedback textarea + points input.
  - "Return for revision" action per row.
- Parent view extended: per-child detail shows submission status + teacher feedback (read-only).

**Tests:**

- Schema/RLS leakage: student A in tenant X cannot see student B's submissions.
- Service spec: submission state transitions.
- Service spec: submitting past `due_date` flags `late: true`.
- Controller spec: student without class enrolment cannot see homework.
- E2E: student submits → teacher grades → notifications fire → parent sees grade.
- Mobile: submission page usable at 375px (file upload, text input).

**Definition of done:**

- Students can log in and complete the submit → graded → feedback loop.
- Parents see submission status and grades.
- Teachers grade from the existing completions grid.
- All RLS tests green.
- Performance: submission list endpoint returns in < 300ms at test-data scale.

---

### Wave 4 — Polish, Recurrence UI, Edit Page, Cleanup

**Goal:** Close out the known UI dead ends and tidy the morphing shell integration. No new systems — just finishing what's already partially built.

**Backend work:**

- None required — all endpoints already exist for the below features.
- Housekeeping: add missing index on `homework_assignments (tenant_id, subject_id, due_date)` if analytics query plan shows hot scans.
- Close DZ-Homework-2: stabilise `homework.performance.spec.ts` by method reference rather than string, or mark skip with clear rationale.

**Frontend work:**

- Build `/homework/[id]/edit` — full form (not quick form) with the same fields as create + attachment manager. Only allowed while `status = 'draft'`; UI disables the edit entry point otherwise.
- Add recurrence UI to `/homework/new` and `/homework/[id]/edit`:
  - "Repeat" toggle → frequency (daily/weekly/custom), days-of-week selector, start date, end date.
  - Preview: "This will create 12 assignments between Apr 18 and Jun 30, skipping school closures."
- Add granular recipient selection to the create form:
  - Default "Whole class" radio.
  - "Specific students" opens multi-select against the class roster.
  - Server-side: extend `CreateHomeworkDto` with optional `target_student_ids: string[]`, validate all belong to the class, and scope completion rows accordingly.
- Wire `AttachmentManager` into the create/edit form (currently only available on detail).
- Morphing shell: finalise homework sub-strip (from Wave 1) with all tabs: `My Classes | List | Templates | Analytics | Load | By Class`. Role-aware so parents see a different set.
- Mobile audit pass: verify every homework page works at 375px, especially the grading grid and heatmap.

**Tests:**

- Edit page happy-path + guard (cannot edit published).
- Recurrence rule creation + preview accuracy.
- Granular recipient creation produces correct completion rows.
- Mobile snapshot pass on all homework pages.

**Definition of done:**

- Every "dead link" or "half-built" item from the gap list is resolved.
- Morphing shell integration complete.
- Mobile responsiveness signed off.
- Architecture docs updated: `feature-map.md`, `module-blast-radius.md` (new dependency on scheduling + communications), `event-job-catalog.md` (homework queue now in use), `state-machines.md` (submission state machine added in Wave 3).
- Recovery backlog: any items added during the four waves closed or explicitly deferred.

---

## 5. Cross-Wave Concerns

- **Permissions matrix:** need new permissions — `student.homework.view`, `student.homework.submit`, plus extend `homework.manage` gating with scheduling authority. Decide in Wave 1 whether to split `homework.manage` into `homework.assign` (teacher, scheduled-class-only) and `homework.manage` (admin, any class).
- **Tenant defaults:** Wave 2 introduces notification channel defaults per tenant. Decide whether the UI lives inside Settings → Notifications or Settings → Homework.
- **Localisation:** all new templates and UI strings EN + AR; RTL-safe logical properties throughout.
- **Rate limiting / cost control:** Wave 2 + 3 will materially increase SMS and WhatsApp volume. Confirm Twilio budget + add a per-tenant daily cap before Wave 2 ships.
- **GDPR:** student submissions contain student-authored content + attachments. Confirm retention policy in `docs/features/` and align with existing attachment retention.
- **Architecture doc updates (mandatory per `.claude/rules/architecture-policing.md`):**
  - `module-blast-radius.md` — homework gains dependencies on SchedulingModule + CommunicationsModule.
  - `event-job-catalog.md` — homework queue becomes active; new job names documented.
  - `state-machines.md` — submission state machine added.
  - `danger-zones.md` — DZ-Homework-1 closed; possibly new entries for rate-limit cliffs.
  - `feature-map.md` — updated endpoint and page counts (asked at end of each wave per feature-map-maintenance rule).

---

## 6. Open Questions for the User

These need a call before wave 1 kicks off:

1. **Authority override:** Should principals/admins bypass the scheduling check entirely, or be required to impersonate a teacher? (Default assumption: admin bypass.)
2. **Student UI — new role shell?** Does a student role already have an app shell, or is Wave 3 introducing the student app surface for the first time?
3. **Notification defaults:** If the teacher doesn't tick anything, do we send in-app only, or respect a tenant-configured default? (Default assumption: tenant-configured default, falling back to in-app only.)
4. **Submission lateness:** Does a late submission auto-flip `HomeworkCompletion.status` to `completed (late)`, or stay `in_progress` until teacher grades? (Default assumption: `completed` with a `late: true` flag on the submission.)
5. **SMS/WhatsApp cost gating:** Should the teacher see a "this will cost ~X SMS credits" estimate before publishing with those channels? (Default assumption: yes, soft warning only, no hard block.)
6. **Recurrence + notifications:** When a recurrence rule auto-generates a new draft, should it auto-publish and notify, or wait for teacher publication? (Default assumption: wait for teacher.)

---

## 7. Rough Sizing

| Wave                      | Backend | Frontend | Tests | Total            |
| ------------------------- | ------- | -------- | ----- | ---------------- |
| 1 — Authority + Entry     | S       | M        | S     | **Small-Medium** |
| 2 — Notifications         | M       | M        | M     | **Medium**       |
| 3 — Student + Submissions | L       | L        | M     | **Large**        |
| 4 — Polish                | S       | M        | S     | **Small-Medium** |

Wave 3 is the biggest by a wide margin — it introduces new schema, new RLS policies, new permissions, new pages, and potentially a new role shell. Waves 1, 2, and 4 are predominantly wiring and UI.
