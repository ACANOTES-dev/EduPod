# Phase F — Frontend: Forms & Events

**Wave**: 3
**Deploy Order**: d6
**Depends On**: B, C

## Scope

All admin and parent frontend pages for forms and events: form template builder, event creation wizard, event dashboards, participant management, parent form submission with e-signature, parent event views, consent archive, and the parent Action Center dashboard card. This phase makes the forms and events system usable by humans.

## Deliverables

### Admin Pages

- `apps/web/src/app/[locale]/(school)/engagement/form-templates/page.tsx` — Form template list with status filters (draft/published/archived), form type filter, search. Paginated table.
- `apps/web/src/app/[locale]/(school)/engagement/form-templates/new/page.tsx` — Form template builder: name, description, type selector, consent type (if consent_form), field editor (add/remove/reorder fields), field type picker (text, signature, checkbox, date, file_upload, info_block, select), live preview panel, save as draft / publish.
- `apps/web/src/app/[locale]/(school)/engagement/form-templates/[id]/page.tsx` — Edit template (if draft), view distribution status (if published — table of submissions with status), distribution action (target selector: whole school / year groups / classes / custom).
- `apps/web/src/app/[locale]/(school)/engagement/consent-archive/page.tsx` — Searchable consent record table: student name, form name, consent type, status, granted date, expiry. Filters by student, type, status, date range.
- `apps/web/src/app/[locale]/(school)/engagement/events/page.tsx` — Event list with type filter (trips, conferences, policy signoffs), status filter, date range. Card or table view.
- `apps/web/src/app/[locale]/(school)/engagement/events/new/page.tsx` — Multi-step event creation wizard: Step 1 (type + basic info), Step 2 (dates + location + capacity), Step 3 (consent form + risk assessment linking), Step 4 (fee + payment deadline), Step 5 (staff assignment), Step 6 (targeting — year groups / classes). Review + create.
- `apps/web/src/app/[locale]/(school)/engagement/events/[id]/page.tsx` — Event detail with embedded dashboard: consent % progress bar, payment % progress bar, registration count / capacity. Status badge. Lifecycle action buttons (publish, open, close, cancel). Tab navigation to participants, staff, and settings.
- `apps/web/src/app/[locale]/(school)/engagement/events/[id]/participants/page.tsx` — Participant table: student name, consent status (badge), payment status (badge), attendance. Inline actions: remind individual. Bulk action: "Remind All Outstanding" button. Export to CSV.

### Parent Pages

- `apps/web/src/app/[locale]/(school)/engagement/parent/forms/[submissionId]/page.tsx` — Form fill view: renders form fields from template, e-signature capture component, legal text display, submit button. Mobile-first layout (single column, large touch targets, 16px min font).
- `apps/web/src/app/[locale]/(school)/engagement/parent/events/page.tsx` — Upcoming events for parent's children: event cards with title, date, status badge, actions (register / view consent / pay).
- `apps/web/src/app/[locale]/(school)/engagement/parent/events/[id]/page.tsx` — Event detail for parent: event info, consent form (if required — inline or link to form page), payment button (if required — links to finance), registration status per child.

### Shared Components

- `apps/web/src/app/[locale]/(school)/engagement/_components/e-signature-pad.tsx` — Canvas-based signature capture. Touch/stylus on mobile, mouse on desktop. "Type your name" fallback mode. Legal text banner. Outputs base64 PNG + metadata. RTL-safe.
- `apps/web/src/app/[locale]/(school)/engagement/_components/form-field-renderer.tsx` — Renders a form field from `fields_json` definition. Handles all field types (text, signature, checkbox, date, file_upload, info_block, select). Bilingual label rendering. Conditional visibility.
- `apps/web/src/app/[locale]/(school)/engagement/_components/completion-dashboard.tsx` — Reusable dashboard widget: progress bars for consent, payment, registration. Used on event detail page.
- `apps/web/src/app/[locale]/(school)/engagement/_components/event-status-badge.tsx` — Status badge component for event lifecycle states.

### Parent Dashboard Modification

- Modify `apps/web/src/app/[locale]/(school)/dashboard/parent/page.tsx` — Add "Action Center" card showing: count of pending forms, count of upcoming events requiring action, count of outstanding payments. Links to parent engagement pages. This card should be prominent (top of dashboard or second card after student overview).

### i18n

- Add engagement-related keys to `apps/web/messages/en.json` and `apps/web/messages/ar.json` — form builder labels, event wizard steps, status labels, button text, error messages, consent type labels, parent action center text.

### Layout

- `apps/web/src/app/[locale]/(school)/engagement/layout.tsx` — Engagement section layout with sidebar navigation (Form Templates, Events, Consent Archive). Uses existing sidebar pattern.

## Out of Scope

- Trip pack preview, attendance, risk assessment, incident pages (Phase G)
- Conference setup, booking, teacher schedule pages (Phase G)
- Analytics dashboard (Phase H)
- Calendar integration (Phase H)

## Dependencies

- **Phase B**: Forms API endpoints (form-templates CRUD, form-submissions, consent-records, parent form endpoints). All `apiClient` calls in form pages hit Phase B's controllers.
- **Phase C**: Events API endpoints (events CRUD, participants, dashboard, staff, parent events). All `apiClient` calls in event pages hit Phase C's controllers.

## Implementation Notes

- **Form builder UX**: The field editor should support drag-and-drop reordering (use `@dnd-kit/core` if already in the project, otherwise a simple up/down button approach). Each field has: label (en + ar), type, required toggle, help text, options (for select fields), conditional visibility config.
- **E-signature component**: Use HTML5 Canvas API. On touch devices, capture `touchstart`/`touchmove`/`touchend`. On desktop, `mousedown`/`mousemove`/`mouseup`. Export canvas content as `toDataURL('image/png')`. The component should display the legal text from the form template's signature field `config.legal_text` in the current locale.
- **Event creation wizard**: Use `react-hook-form` with `zodResolver(createEngagementEventSchema)`. Multi-step form with wizard navigation. Type selection in Step 1 conditionally shows/hides fields in subsequent steps (e.g., conference-specific fields only if type is `parent_conference`).
- **RTL**: All layouts use logical CSS properties (ms-/me-/ps-/pe-/start/end). The form builder, event wizard, and signature pad must all work correctly in RTL mode.
- **Mobile responsiveness**: Parent form submission page is the highest-priority mobile target — parents fill this on their phones. Ensure: 16px minimum font on inputs, full-width inputs, single-column layout, large submit button, signature pad that works on small screens.
- **Action Center card**: Query `GET /v1/parent/engagement/pending-forms` for form count and `GET /v1/parent/engagement/events` (filter by actionable status) for event count. Show combined count as a badge. Empty state: "All caught up!" message.
- **Existing patterns**: Follow the existing page patterns in the codebase — `apiClient<T>()` for data fetching, `useTranslations()` for i18n, `react-hook-form` + Zod for forms, `@school/ui` components for UI elements.
