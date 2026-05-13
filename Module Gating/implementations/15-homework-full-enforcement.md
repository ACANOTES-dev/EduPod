# Implementation 15 — Homework Full Enforcement

> **Phase:** 3 — Wave W3
> **Wave:** W3
> **Depends on:** W1 (01–08)
> **Deploys:** API restart + worker restart + web rebuild
> **Model:** Sonnet 4.6 (template-driven; 6 controllers + 5 processors)

---

## Goal

Wire `@ModuleEnabled('homework')` enforcement across the homework surface — 6 controllers + 5 cron processors + frontend nav for both the staff/admin and student/parent surfaces. After this ships, toggling `homework` off cleanly hides homework UI for all roles and prevents recurring assignment generation, completion reminders, and digest emails.

---

## Critical safety constraints

- **Recurring assignment auto-generation pauses** when disabled. The `HOMEWORK_GENERATE_RECURRING_JOB` cron silently skips disabled tenants. Re-enabling does NOT auto-backfill missed dates — those weeks are permanently un-assigned (acceptable; the human teacher can manually create them).
- **In-flight student submissions** are preserved in `HomeworkSubmission` table. Re-enabling restores access; submissions show as overdue/pending.
- **Homework analytics** is a sub-feature of homework; gates with `homework` (no separate toggle).

---

## Files to modify

### Controllers (add `@ModuleEnabled('homework')` + `ModuleEnabledGuard`)

All 6 controllers under `apps/api/src/modules/homework/`:

- `homework-analytics.controller.ts`
- `homework-completions.controller.ts`
- `homework-diary.controller.ts`
- `homework-parent.controller.ts`
- `homework-student.controller.ts`
- `homework.controller.ts`

### Worker processors (Pattern B)

- `apps/worker/src/processors/homework/completion-reminder.processor.ts`
- `apps/worker/src/processors/homework/digest-homework.processor.ts`
- `apps/worker/src/processors/homework/generate-recurring.processor.ts`
- `apps/worker/src/processors/homework/homework-queue.processor.ts`
- `apps/worker/src/processors/homework/overdue-detection.processor.ts`

### Frontend — nav annotations

- `nav.homework` (and sub-entries: `/homework/assignments`, `/homework/assigned-to-me`, `/homework/set`, `/homework/analytics`, `/homework/diary`) → `moduleKey: 'homework'`
- Student portal `/learning/homework` → `moduleKey: 'homework'`
- Parent portal homework view (if present) → `moduleKey: 'homework'`

### Tests

- Un-skip `homework` block in `module-gating-leakage.e2e-spec.ts`. Probes:
  - `GET /api/v1/homework/assignments` → 404 MODULE_DISABLED
  - `GET /api/v1/homework/student/assignments` → 404 MODULE_DISABLED
  - `GET /api/v1/homework/analytics/overview` → 404 MODULE_DISABLED
- Worker test: enqueue `generate-recurring` for disabled tenant; verify no new HomeworkAssignment row created.

---

## Acceptance

- [ ] All 6 controllers gated. Static-analysis test passes.
- [ ] All 5 worker processors have Pattern B.
- [ ] Frontend nav annotated for staff + student + parent surfaces.
- [ ] Module-gating leakage tests pass for `homework`.
- [ ] Smoke test on NHQS: toggle homework off → /homework hidden for all roles; recurring weekly assignment that was due to fire next cron tick does NOT generate.
- [ ] Re-enable homework after a few days → recurring generation resumes from current date forward; missed weeks NOT backfilled (documented behavior).

---

## Notes

- Homework is one of the simplest W3 specs — small surface, no external integrations, no special webhook/payment complexity.
- The "no backfill" behavior on re-enable is intentional: backfilling would create assignments dated in the past that students never saw and teachers never planned. Better to leave the gap.
