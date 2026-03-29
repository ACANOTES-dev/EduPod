# Phase F — School Diary

**Wave**: 3
**Deploy Order**: d6
**Depends On**: B

## Scope

Builds the school diary pages — the daily diary view that combines personal notes, homework items, and school events into a unified daily planner. Also includes the personal diary notes feature for students (proxy-written in V1 since no student login exists). This is the "journal replacement" component of the feature.

## Deliverables

### Pages (`apps/web/src/app/[locale]/(school)/diary/`)

#### Daily Diary View
- [ ] `page.tsx` — Diary daily view for a student
  - Date selector at top (prev/next day, date picker)
  - Sections:
    1. **Today's Homework** — pulled from `/parent/homework/today` or `/homework/by-class/:id`
    2. **School Events** — pulled from `school_closures` + any events for this date
    3. **Personal Notes** — from `diary_notes` table
  - Unified timeline layout: everything in one scrollable daily view
  - "Add a note" inline editor for personal notes (one per day)

#### Diary Sidebar Entry
- [ ] Add "Diary" entry to sidebar under **ACADEMICS** section (after Homework)
  - Icon: `CalendarDays` from `lucide-react`
  - Route: `/diary`
  - Permission guard: `homework.view_diary`

### Page-Local Components (`_components/`)
- [ ] `diary-day-view.tsx` — main daily layout combining homework + notes + events
- [ ] `diary-personal-note.tsx` — inline text editor for personal notes (one per day, auto-save)
- [ ] `diary-date-navigator.tsx` — date picker with prev/next day buttons
- [ ] `diary-event-card.tsx` — school event/closure display card
- [ ] `diary-homework-section.tsx` — today's homework embedded in diary view

### i18n
- [ ] English strings for diary UI
- [ ] Arabic strings for diary UI
- [ ] RTL layout verification

## Out of Scope

- Teacher homework management (Phase D)
- Parent homework views (Phase E)
- Student login / student portal
- Rich text/markdown editor (V1 uses plain text)
- Integration with external calendars (Google Calendar, iCal)

## Dependencies

- **Phase B**: Diary API endpoints (`v1/diary/:studentId` for personal notes), parent homework endpoints (for homework section), and the school closures read from existing scheduling data

## Implementation Notes

- **Personal notes**: one note per student per day. If a note exists for today, show it pre-filled and allow editing. If not, show an empty editor. Save on blur or explicit "Save" button.
- **Diary as proxy in V1**: since there's no student login, the diary is accessed by:
  - Teachers: viewing a student's diary from the student hub or class view
  - Parents: viewing their child's diary from the parent homework page
  - Proxy note creation: teachers can write personal notes on behalf of students (permission: `homework.write_diary`)
- **School events**: query `school_closures` for the selected date. In V1, this is the only event source. Future phases could add a full events table.
- **Date navigation**: default to today. Allow browsing backward (to review past homework/notes) and forward (to see upcoming homework). Past dates show read-only homework status. Future dates show upcoming homework.
- **Unified timeline design**: the daily view should feel like a physical diary page — header with the date, sections stacked vertically. Clean, minimal, easy to scan.
- **Auto-save**: personal notes auto-save after 2 seconds of inactivity (debounced) to mimic the feel of writing in a physical diary. Show a subtle "Saved ✓" indicator.
