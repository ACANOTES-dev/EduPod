# Phase D — Trip Pack & Logistics API

**Wave**: 3
**Deploy Order**: d4
**Depends On**: C

## Scope

Backend for trip logistics: risk assessment gate (approve/reject before event can open), Trip Leader Pack PDF generation with live medical data aggregation, on-the-day mobile attendance marking with headcount confirmation, post-event incident reporting, and event completion. This phase makes trip-type events fully operational end-to-end.

## Deliverables

### Services

- `apps/api/src/modules/engagement/trip-pack.service.ts` — Aggregates data for trip leader pack: attending students with medical notes, allergy details (highlighted flag), emergency contacts, dietary info, signed consent copies, risk assessment. Calls `PdfRenderingService` with the new trip-leader-pack template. Returns generated PDF buffer.
- `apps/api/src/modules/engagement/trip-pack.service.spec.ts`

### Controller Extensions

Add the following endpoints to `apps/api/src/modules/engagement/events.controller.ts` (created in Phase C):

- `POST   /v1/engagement/events/:id/risk-assessment/approve`
- `POST   /v1/engagement/events/:id/risk-assessment/reject`
- `POST   /v1/engagement/events/:id/trip-pack/generate`
- `GET    /v1/engagement/events/:id/trip-pack/download`
- `GET    /v1/engagement/events/:id/attendance`
- `POST   /v1/engagement/events/:id/attendance`
- `POST   /v1/engagement/events/:id/headcount`
- `POST   /v1/engagement/events/:id/complete`
- `POST   /v1/engagement/events/:id/incidents`
- `GET    /v1/engagement/events/:id/incidents`

Update `apps/api/src/modules/engagement/events.controller.spec.ts` with tests for new endpoints.

### Worker

- `apps/worker/src/engagement/engagement-generate-trip-pack.processor.ts` — Processes `engagement:generate-trip-pack`. Receives `{ tenant_id, event_id }`. Calls `TripPackService` to aggregate data and generate PDF. Stores result (file path or buffer) for download.

### PDF Templates

- `apps/api/src/modules/pdf-rendering/templates/trip-leader-pack-en.template.ts` — English template
- `apps/api/src/modules/pdf-rendering/templates/trip-leader-pack-ar.template.ts` — Arabic template

Both templates render:

1. Event summary header (title, date, time, location, staff list)
2. Student roster table (name, year group, class)
3. Medical flags section (per student: medical_notes, allergy_details with red highlight if has_allergy)
4. Emergency contacts section (per student: from HouseholdEmergencyContact)
5. Dietary requirements (extracted from medical notes)
6. Consent status list (parent name, signature thumbnail, timestamp)
7. Risk assessment copy (if attached)
8. School emergency contacts (from tenant config)

### Module Update

- Update `apps/api/src/modules/engagement/engagement.module.ts` — register TripPackService.

## Out of Scope

- Form template CRUD, submissions, consent records (Phase B)
- Event CRUD, lifecycle, participants, staff (Phase C — already built)
- Conference scheduling, bookings (Phase E)
- All frontend pages (Phases F, G)
- Analytics, calendar integration (Phase H)

## Dependencies

- **Phase C**: `EventsService` (this phase adds methods to the events controller and interacts with event lifecycle), `EventParticipantsService` (reads participant data for trip pack and attendance).
- **Phase A** (transitive via C): Prisma models (`EngagementEvent`, `EngagementEventParticipant`, `EngagementIncidentReport`), Zod schemas.

## Implementation Notes

- **Risk assessment gate**: The `approve` endpoint sets `risk_assessment_approved = true`, `risk_assessment_approved_by`, and `risk_assessment_approved_at` on the event. The `reject` endpoint clears these. The events service (Phase C) already enforces the gate: trip events cannot transition `published → open` if `risk_assessment_required && !risk_assessment_approved`.
- **Medical data freshness**: The trip pack generator pulls medical data LIVE from `Student.medical_notes`, `Student.allergy_details`, and `HouseholdEmergencyContact` at generation time — never cached. The generated PDF includes a "Generated at: {timestamp}" footer so staff know the data currency.
- **Attendance marking**: Uses `EngagementEventParticipant.attendance_marked` (boolean) and `attendance_marked_at` / `attendance_marked_by`. The `POST /attendance` endpoint accepts `{ student_id, present: boolean }`. Headcount endpoint validates `count_present === expected` and transitions event to `in_progress` if not already.
- **Event completion**: The `POST /complete` endpoint transitions the event from `in_progress → completed`. Guards: all participants must have attendance resolved (no `null` attendance state). Triggers financial reconciliation check if event had fees.
- **Incident reports**: Simple append-only entity — create and list. No status lifecycle. Permission: `engagement.incidents.create` for assigned staff, `engagement.incidents.view` for admins.
- **PDF template pattern**: Follow the existing template pattern in `apps/api/src/modules/pdf-rendering/templates/` — Handlebars with bilingual support, school branding (logo, colors, name), Puppeteer rendering.
- **File overlap**: This phase adds routes to `events.controller.ts` (created in Phase C). Place new routes AFTER existing routes. Static routes (`/risk-assessment`, `/trip-pack`, `/attendance`, `/headcount`, `/complete`, `/incidents`) must be declared BEFORE the dynamic `:id` route — but since these are sub-paths of `/:id/`, they are fine under the existing `/:id` prefix.
