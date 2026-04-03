# Phase D — Teacher Frontend

**Wave**: 3
**Deploy Order**: d4
**Depends On**: B

## Scope

Builds all teacher-facing frontend pages for homework management — the homework dashboard, quick-entry form, assignment detail, completion tracking grid, class homework views, templates, and analytics pages. Also adds the homework sidebar entry and dashboard integration cards.

## Deliverables

### Sidebar & Navigation

- [ ] Add "Homework" entry to the school sidebar under **ACADEMICS** section (between Gradebook and Report Cards)
  - Icon: `BookOpen` from `lucide-react`
  - Route: `/homework`
  - Permission guard: `homework.view`
  - Conditional on `tenant_modules` having homework enabled
- [ ] i18n strings for navigation items (`en.json`, `ar.json`)

### Pages (`apps/web/src/app/[locale]/(school)/homework/`)

#### Dashboard

- [ ] `page.tsx` — Homework dashboard
  - Today's assignments across teacher's classes
  - Pending completions count (unverified)
  - Quick-set button → `/homework/new`
  - Recently published homework list
  - This week overview compact view

#### Quick-Entry Form

- [ ] `new/page.tsx` — Assignment creation form
  - Minimal required fields: class (select), title (text), due date (date picker)
  - Optional fields: description (textarea), homework type (select), subject (auto-populated from class), attachments, max points
  - "Publish immediately" toggle (default: true)
  - "Set as recurring" toggle → shows recurrence fields
  - Target: under 30 seconds for experienced users
  - Uses `react-hook-form` + `zodResolver(createHomeworkSchema)`

#### Assignment Detail

- [ ] `[id]/page.tsx` — Assignment detail view
  - Full assignment info with type badge, due date, status
  - Attached files/links with download/preview
  - Completion summary donut chart (completed/in-progress/not-started)
  - Action buttons: Edit, Publish, Archive, Copy
  - Completions list preview (first 10 students)

#### Completion Grid

- [ ] `[id]/completions/page.tsx` — Full completion tracking
  - Spreadsheet-like grid: student name | status toggle | notes | points
  - "Mark all completed" bulk action
  - Filter by completion status
  - Teacher verification toggle per student
  - Save changes via bulk API call

#### Class View

- [ ] `by-class/[classId]/page.tsx` — Class homework list
  - Week view toggle (calendar-style grid showing homework per day)
  - List view with filters (status, type, date range)
  - Copy-from button for each assignment

#### Templates

- [ ] `templates/page.tsx` — Browse & copy past assignments
  - Filter by class, subject, academic period
  - Preview assignment content
  - One-click copy with date adjustment dialog

#### Analytics

- [ ] `analytics/page.tsx` — Analytics dashboard
  - Completion rate cards per class
  - Non-completers list with trends
  - Subject-level breakdown
  - Teacher comparison (admin only)
- [ ] `analytics/load/page.tsx` — Load heatmap
  - Daily/weekly view of homework volume per year group
  - Cross-subject load comparison
  - "Is Wednesday overloaded?" type insights

### Page-Local Components (`_components/`)

- [ ] `homework-quick-form.tsx` — the quick-entry form component
- [ ] `completion-grid.tsx` — spreadsheet-like completion tracking
- [ ] `homework-week-view.tsx` — calendar-style week view
- [ ] `homework-card.tsx` — reusable assignment card (used in lists/dashboard)
- [ ] `load-heatmap.tsx` — homework load visualisation
- [ ] `homework-calendar.tsx` — month calendar view of assignments
- [ ] `homework-type-badge.tsx` — coloured badge for homework type
- [ ] `completion-donut.tsx` — donut chart for completion rates
- [ ] `attachment-manager.tsx` — upload/manage file attachments

### Dashboard Integration

- [ ] Add "Homework Today" card to teacher dashboard widget area
- [ ] Add "Unverified Completions" count badge

### i18n

- [ ] English strings for all homework UI text
- [ ] Arabic strings for all homework UI text
- [ ] RTL layout verification for all pages

## Out of Scope

- Parent-facing pages (Phase E)
- Diary pages (Phase F)
- Student login / student portal
- Mobile-specific layouts (Phase 3 roadmap)

## Dependencies

- **Phase B**: All API endpoints must be available for data fetching via `apiClient<T>()`

## Implementation Notes

- **Data fetching pattern**: imperative `apiClient<T>()` from `@/lib/api-client` with `useEffect`. No server-component data fetching.
- **Forms**: `react-hook-form` with `zodResolver` and schemas from `@school/shared`. No individual `useState` per field.
- **Styling**: Tailwind CSS with semantic design tokens (`bg-background`, `text-text-primary`). Dark mode support mandatory.
- **RTL**: use logical CSS properties (`start`/`end`, `ps-`/`pe-`/`ms-`/`me-`). Never `left`/`right`.
- **Quick-entry form** is the most critical UX component — it must be fast and intuitive. Pre-populate subject from class. Default due date to next school day. Auto-publish unless explicitly toggled.
- **Completion grid**: inspired by the attendance marking grid pattern (from `attendance/` pages). Similar spreadsheet UX with per-row toggles.
- **Analytics pages**: read-only visualisation. Use a charting library already in the project (or add one if none exists — check for `recharts` or similar).
- **Week view**: horizontal calendar grid showing Mon–Fri (or Sun–Thu for tenants with Arabic locale), homework blocks per day, colour-coded by type.
- **Permission gating**: pages check permissions client-side and redirect/show empty state if not authorised.
- **Sidebar placement**: under ACADEMICS, using `BookOpen` icon. Follows the existing sidebar structure pattern.
