# Phase E — Parent Frontend

**Wave**: 3
**Deploy Order**: d5
**Depends On**: B

## Scope

Builds all parent-facing frontend pages for homework viewing, completion tracking, and parent-teacher communication notes. Surfaces homework data through the parent portal — per-child tabs, today/overdue views, and diary parent notes. Also integrates homework into the parent dashboard and student hub page.

## Deliverables

### Pages (`apps/web/src/app/[locale]/(school)/homework/parent/`)

#### Parent Homework Dashboard
- [ ] `page.tsx` — Parent homework overview
  - Per-child tabs (if multiple children)
  - Today's homework per child: grouped by subject, title, type badge, due date, status
  - Overdue section: prominently highlighted items sorted by most overdue
  - This week overview per child
  - "Mark as done" button (if `allow_student_self_report` enabled)

#### Per-Child Detail
- [ ] `[studentId]/page.tsx` — Full homework history for one child
  - Calendar view showing homework per day per subject
  - Filter by subject, type, completion status
  - Monthly completion rate trend
  - Overdue items count

#### Parent-Teacher Notes
- [ ] `[studentId]/notes/page.tsx` — Parent-teacher diary communication
  - Thread-style view per date
  - Create new note button
  - Acknowledgement flow (parent acknowledges teacher's note)
  - Teacher notes show as "from [Teacher Name]"
  - Parent notes show as "from [Parent Name]"

### Page-Local Components (`_components/`)
- [ ] `parent-homework-list.tsx` — homework list for a specific child
- [ ] `parent-homework-calendar.tsx` — calendar view for parent
- [ ] `parent-completion-toggle.tsx` — "Mark as done" button with confirmation
- [ ] `parent-note-thread.tsx` — diary parent-note conversation thread
- [ ] `overdue-alert-card.tsx` — prominent overdue item display
- [ ] `child-switcher.tsx` — tab/dropdown for switching between children

### Dashboard Integration
- [ ] Add "Homework Today" card to parent dashboard
  - Per-child summary: X items due today, Y overdue
  - Quick-link to homework parent view
- [ ] Add "Notes" badge to parent dashboard if unacknowledged notes exist

### Student Hub Integration
- [ ] Add "Homework" tab to student detail page (`/students/[id]`)
  - Recent homework per subject for this student
  - Completion rate trend chart
  - Overdue items list
  - Visible to staff with `homework.view` permission

### i18n
- [ ] English strings for all parent homework UI
- [ ] Arabic strings for all parent homework UI
- [ ] RTL layout verification

## Out of Scope

- Teacher-facing homework management pages (Phase D)
- Diary personal notes for students (Phase F)
- Student login / student portal
- Push notifications / mobile app notifications (Phase 3 roadmap)

## Dependencies

- **Phase B**: Parent API endpoints (`v1/parent/homework/*`), diary parent-note endpoints (`v1/diary/*/parent-notes`), completion marking endpoint

## Implementation Notes

- **Parent scoping**: the parent API already resolves `user_id → parent_id → student_parents → student_ids`. The frontend calls `v1/parent/homework` and receives homework scoped to their linked children only.
- **Child switching**: if a parent has multiple children, the UI shows tabs at the top (first child selected by default). This follows the existing pattern in the parent inquiries section.
- **"Mark as done"**: sends `POST v1/homework/:id/completions` with `status: 'completed'`. Only available if `allow_student_self_report` in tenant settings. Shows a confirmation dialog: "Are you sure you want to mark this as done?"
- **Overdue styling**: red border, `⚠️ Overdue` badge, sorted by `days_overdue DESC`. Use `text-destructive` design token.
- **Acknowledgement flow**: teacher creates a note → parent sees it with an "Acknowledge" button → parent clicks → `PATCH v1/diary/parent-notes/:id/acknowledge`. Acknowledged notes show a ✓ checkmark.
- **Calendar view**: similar to the teacher week view but read-only. Shows homework blocks per day, colour-coded by type. Click to expand details.
- **Student hub tab**: staff-facing view showing a specific student's homework data. Uses `v1/homework/analytics/student/:studentId` endpoint.
