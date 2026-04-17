# Scheduling Bug Fix Decisions

**Started:** 2026-04-17

## Reading the bug log

The bug log has 41 entries (SCHED-001 through SCHED-042, with SCHED-014 skipped and SCHED-037 reserved). When an entry's `**Status:**` field and the later `## Resolution — YYYY-MM-DD` block disagree, **the Resolution block is authoritative** — it's the most recently appended note and it always cites commits / run IDs / production verification. Stale `Open` markers on the entry header are doc-hygiene debt from sessions that shipped the fix but forgot to flip the header.

Verified this way for SCHED-016, SCHED-020, SCHED-021 (2026-04-17): the entry header still said `Open` but the 2026-04-15 stress-test Resolution block lists them Fixed + deployed, and grepping the live codebase confirms the fix is in place. Entry headers flipped to `Fixed` with a citation to the source file + line so future readers don't need to rediscover this.

---

## Bug fixes applied (2026-04-17 session)

- **SCHED-031 (P1, Fixed):** Admin cross-perspective student picker. Mapped `/v1/students` response `{first_name, last_name, class_entity.name}` → `{id, name: "First Last — Class"}` in `apps/web/src/app/[locale]/(school)/timetables/page.tsx`.
- **SCHED-033 (P1, Fixed):** Scheduling-hub "Total Slots: 0". Root cause was `ClassesReadFacade.countByAcademicYear({subjectType: 'academic'})` filtering `subject.subject_type = academic`, which excludes homeroom-style classes (NHQS et al have `subject_id IS NULL`). Added the `OR: [{ subject_id: null }, { subject: { subject_type: 'academic' } }]` branch mirroring `findActiveAcademicClassesWithYearGroup`. Test coverage updated.
- **SCHED-034 (P2, Fixed):** Student dashboard `MISSING_MESSAGE`. Added keys `common.subjects`, `common.active`, `dashboard.greeting`, `reportCards.noReportCards` to en.json + ar.json.
- **SCHED-035 (P0, Fixed):** Parent timetable 404. New `ParentTimetableController` + `ParentTimetableService` under `apps/api/src/modules/parents/`. Endpoint `GET /v1/parent/timetable?student_id=<uuid>` with new `parent.view_timetable` permission (seeded into the `parent` default role). Response assembles the rich `{ class_name, classroom_model, weekdays[], periods[], cells[], week_start, week_end }` shape from `schedule_period_templates` + `schedules` + `year_group.classroom_model`.
- **SCHED-036 (P1, Fixed):** Parent toast spam. Added `silent: true` to every background mount-time fetch on `parent-home.tsx`, `timetable-tab.tsx`, `grades-tab.tsx`, `finances-tab.tsx`, `ai-insight-card.tsx`. Errors still log to console; they no longer surface as toasts.
- **SCHED-032 (P0, Fixed):** Student in-app timetable. Chose Option A from the bug entry (extend existing `/v1/scheduling/timetable/my` to handle students) over Option B (dedicated route) because it's less code and reuses the existing `/en/scheduling/my-timetable` page unchanged. Added `PersonalTimetableService.getMyTimetable()` with staff-first / student-fallback resolution via `AuthReadFacade` + `StudentReadFacade.findByUserName` (students carry no `user_id` FK — name-match is the existing codebase pattern). Added `schedule.view_own` to the student default role. Added a Timetable quick-link card to `/dashboard/student`. Introduced a `forwardRef()` on the StudentsModule ↔ ParentsModule module edge to resolve the cycle both SCHED-035 and SCHED-032 would have introduced.
- **SCHED-042 (P2, Verified — no code defect):** Queried prod via `DATABASE_MIGRATE_URL`. All three failed runs have legitimate structured failure reasons: two admin `Cancelled by user`, one `CP_SAT_UNREACHABLE`. Not a bug — the expected behaviour of the cancel path (SCHED-027) and the sidecar failure path (STRESS-084).
- **SCHED-038 (P2, Verified — no production code path reproduces):** Audited every `users` write path in the codebase. All four production paths (`invitations`, `imports`, `staff-profiles`, `auth-password-reset`) use bcrypt with `email_verified_at = new Date()`. Adam Moore's bad row was a one-off direct-DB insert per MEMORY.md, not a repeatable production bug. The "distinguish unverified from invalid-credentials at login" suggestion is an intentional anti-pattern (user enumeration defence); declined.

## Bugs dispositioned without a code fix (2026-04-17)

- **SCHED-039 (P3, Won't Fix — tenant data/config, not code):** NHQS curriculum demand exceeds period-grid capacity for 4th–6th class. Three resolution paths documented in the entry (add 7th period / reduce hours / accept gap). Solver behaviour on infeasible input is already correct post-SCHED-017. Filed on NHQS data-readiness checklist.
- **SCHED-040 (P3, Won't Fix — tenant data, not code):** K1B has required subjects without any competent teacher in `teacher_competencies`. Orchestration pre-drops these rows to avoid trivial infeasibility; the code-side enhancement (emit structured `coverage_warnings`) is a net-new feature, filed for future planning.
- **SCHED-041 (P1, Blocked — needs dedicated stage):** CP-SAT doesn't improve on greedy seed. The fix direction (AddHint, tighten objective to ~10 lexicographic levels, multi-thread, early-exit, surface `reason_for_termination`) is a multi-commit solver-performance workstream with its own benchmark matrix and memory audit. Must be scheduled as Stage 9.5.3 / 10 follow-up, not a drive-by fix.

---

## Doc-hygiene flips (no code change)

- **SCHED-016**, **SCHED-020**, **SCHED-021:** entry `Status:` header flipped `Open → Fixed` with citations; the fixes themselves shipped 2026-04-15 per the stress-test Resolution block, verified still in the code today.
