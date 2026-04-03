# Phase G — Frontend: Trips & Conferences

**Wave**: 4
**Deploy Order**: d7
**Depends On**: D, E, F

## Scope

All frontend pages for trip logistics and conference scheduling: trip leader pack preview with PDF download, mobile-optimised on-the-day attendance check-off, risk assessment approval view, post-event incident reporting, conference setup and slot generation, admin schedule grid, teacher schedule dashboard, parent slot booking, and parent booking summary. This phase completes the UI for all engagement features except analytics.

## Deliverables

### Trip Logistics Pages

- `apps/web/src/app/[locale]/(school)/engagement/events/[id]/trip-pack/page.tsx` — Trip leader pack preview (HTML rendering of the same data that goes into the PDF) with "Download PDF" button. Shows: student roster, medical flags (highlighted allergies), emergency contacts, consent status. Calls `POST /trip-pack/generate` then `GET /trip-pack/download`.
- `apps/web/src/app/[locale]/(school)/engagement/events/[id]/attendance/page.tsx` — Mobile-optimised attendance view. List of participating students with large toggle buttons (present/absent). Headcount display at top (X/Y present). "Confirm Headcount" button. Designed for outdoor use (high contrast, large touch targets 44x44px minimum).
- `apps/web/src/app/[locale]/(school)/engagement/events/[id]/risk-assessment/page.tsx` — Risk assessment view: displays the risk assessment form template content (read-only). Approve / Reject buttons (for users with `engagement.risk_assessment.approve` permission). Status banner showing current approval state.
- `apps/web/src/app/[locale]/(school)/engagement/events/[id]/incidents/page.tsx` — Post-event incident report form (title, description text area) and list of existing reports for the event. Only visible after event status is `in_progress` or `completed`.

### Conference Pages

- `apps/web/src/app/[locale]/(school)/engagement/conferences/[id]/setup/page.tsx` — Conference setup: date picker, time range (start/end), slot duration selector, buffer selector, teacher multi-select (pre-populated from event staff or all teachers). "Generate Slots" button. Preview of slot count per teacher before generation.
- `apps/web/src/app/[locale]/(school)/engagement/conferences/[id]/schedule/page.tsx` — Admin schedule grid: teachers as columns, time slots as rows. Color-coded cells (available=green, booked=blue with student name, blocked=grey). Click to view booking details or manually book/block. Stats row at bottom (X/Y booked per teacher).
- `apps/web/src/app/[locale]/(school)/engagement/conferences/[id]/my-schedule/page.tsx` — Teacher's own schedule for the evening. Clean vertical timeline: time → student name → parent name. No booking management — read-only for teachers. Optimised for printing.
- `apps/web/src/app/[locale]/(school)/engagement/parent/conferences/[id]/book/page.tsx` — Parent slot booking: shows child's teachers with available slots. Slot picker per teacher (visual time grid or dropdown). Conflict warnings if overlapping times. Book button per slot. Booking confirmation.
- `apps/web/src/app/[locale]/(school)/engagement/parent/conferences/[id]/my-bookings/page.tsx` — Parent's booked slots summary: teacher name, time, student name, cancel button (if allowed by tenant config). Empty state if no bookings.

### Shared Components

- `apps/web/src/app/[locale]/(school)/engagement/_components/attendance-toggle.tsx` — Large toggle button for attendance marking: present (green check), absent (red X). Touch-optimised.
- `apps/web/src/app/[locale]/(school)/engagement/_components/schedule-grid.tsx` — Reusable grid component for conference schedule display. Teachers × time slots matrix. Used by admin schedule and adapted for teacher schedule.
- `apps/web/src/app/[locale]/(school)/engagement/_components/slot-picker.tsx` — Slot selection component for parent booking. Shows available time slots per teacher as selectable cards/chips.

### i18n

- Add trip logistics and conference keys to `apps/web/messages/en.json` and `apps/web/messages/ar.json` — attendance labels, trip pack section headers, conference booking flow text, schedule labels, slot status labels.

## Out of Scope

- Form template builder, event creation wizard, consent archive (Phase F — already built)
- Parent form submission, e-signature (Phase F — already built)
- Analytics dashboard (Phase H)
- Calendar integration (Phase H)

## Dependencies

- **Phase D**: Trip Pack & Logistics API endpoints (trip-pack generate/download, risk-assessment approve/reject, attendance, headcount, complete, incidents).
- **Phase E**: Conference API endpoints (time-slots generate/list, bookings CRUD, my-schedule, parent available-slots/book/my-bookings).
- **Phase F**: Engagement frontend layout, shared components (event-status-badge, completion-dashboard), engagement section routing structure, i18n key structure. Trip pages are sub-pages of event detail (created in F). Conference parent pages follow the parent engagement routing pattern established in F.

## Implementation Notes

- **Trip pack preview**: The preview page renders the same data structure as the PDF but in HTML. It calls the trip-pack data aggregation endpoint, not the PDF generation endpoint. The "Download PDF" button triggers `POST /trip-pack/generate` then downloads the result.
- **Attendance mobile UX**: This page is used outdoors by teachers on their phones. Design priorities: high contrast (works in sunlight), large touch targets (44x44px minimum), minimal scrolling, clear headcount at top. Consider a sticky header with the headcount that scrolls with the student list.
- **Conference schedule grid**: For large conferences (15+ teachers × 20+ slots = 300+ cells), the grid must be performant. Use CSS Grid with `position: sticky` for the teacher header row and time column. Virtual scrolling is unlikely needed at this scale but the grid should handle 500 cells smoothly.
- **Parent booking conflict display**: When a parent selects a slot that overlaps with an already-booked slot for another teacher, show a warning badge "Overlaps with [Teacher Name] at [Time]". Do not block the booking — the parent may want to replace the earlier one.
- **Conference cancellation**: The cancel button on parent my-bookings page calls `DELETE /bookings/:id`. If `allow_parent_conference_cancellation` is false in tenant config, hide the cancel button entirely (check via a config endpoint or embed in the bookings response).
- **RTL schedule grid**: In RTL mode, the schedule grid reads right-to-left. Teachers should be in the same column order but the time axis still reads top-to-bottom. Ensure the grid component handles `dir="rtl"` correctly.
- **Print optimisation**: Teacher schedule page (`my-schedule`) should have a `@media print` stylesheet that hides navigation, expands the schedule to full width, and uses serif font for readability. Teachers may print their evening schedule.
