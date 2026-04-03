# Phase E — Conference API

**Wave**: 3
**Deploy Order**: d5
**Depends On**: C

## Scope

Backend for parent-teacher conference scheduling: bulk time slot generation from event config, teacher availability (block/unblock slots), parent self-service booking with double-booking conflict prevention, admin/walk-in booking, teacher schedule view, and the conference reminders BullMQ job. This makes `parent_conference` event types fully operational.

## Deliverables

### Services

- `apps/api/src/modules/engagement/conferences.service.ts` — Slot generation (from event date range, slot duration, buffer, teacher list — creates `ConferenceTimeSlot` rows). Block/unblock slot. Create booking with conflict prevention (`SELECT ... FOR UPDATE` on slot row). Cancel booking (returns slot to available). Teacher schedule query (all slots/bookings for a teacher in an event). Available slots query (for parent — filters by child's teachers, excludes booked/blocked). Admin booking (walk-in). Booking stats (total slots, booked, available, blocked per teacher).
- `apps/api/src/modules/engagement/conferences.service.spec.ts`

### Controllers

- `apps/api/src/modules/engagement/conferences.controller.ts` — Admin endpoints:
  - `POST   /v1/engagement/conferences/:eventId/time-slots/generate`
  - `GET    /v1/engagement/conferences/:eventId/time-slots`
  - `PATCH  /v1/engagement/conferences/:eventId/time-slots/:slotId`
  - `GET    /v1/engagement/conferences/:eventId/bookings`
  - `POST   /v1/engagement/conferences/:eventId/bookings`
  - `DELETE /v1/engagement/conferences/:eventId/bookings/:bookingId`
  - `GET    /v1/engagement/conferences/:eventId/my-schedule` (teacher)
- `apps/api/src/modules/engagement/conferences.controller.spec.ts`
- `apps/api/src/modules/engagement/parent-conferences.controller.ts` — Parent endpoints:
  - `GET    /v1/parent/engagement/conferences/:eventId/available-slots`
  - `POST   /v1/parent/engagement/conferences/:eventId/book`
  - `GET    /v1/parent/engagement/conferences/:eventId/my-bookings`
  - `DELETE /v1/parent/engagement/conferences/:eventId/bookings/:bookingId`
- `apps/api/src/modules/engagement/parent-conferences.controller.spec.ts`

### Worker

- `apps/worker/src/engagement/engagement-conference-reminders.processor.ts` — Cron job (daily 08:00). Iterates all tenants. Finds confirmed bookings with `start_time` in the next 24 hours. Dispatches reminder notification to the parent (via comms module) with slot time, teacher name, and location.

### Cron Registration

- Update `CronSchedulerService` in worker — register `engagement:conference-reminders` (daily 08:00) with `jobId: 'cron:CONFERENCE_REMINDERS_JOB'`.

### Module Update

- Update `apps/api/src/modules/engagement/engagement.module.ts` — register conferences, parent-conferences controllers and ConferencesService.

## Out of Scope

- Form template CRUD, submissions, consent records (Phase B)
- Event CRUD, lifecycle, participants, staff (Phase C — already built)
- Trip pack, attendance, incidents (Phase D)
- All frontend pages (Phases F, G)
- Analytics, calendar integration (Phase H)

## Dependencies

- **Phase C**: `EventsService` (validates event exists and is type `parent_conference`), `EngagementEvent` model (reads event config for slot_duration_minutes, buffer_minutes, booking_deadline).
- **Phase A** (transitive via C): Prisma models (`ConferenceTimeSlot`, `ConferenceBooking`), Zod schemas (`generateTimeSlotsSchema`, `createBookingSchema`), state machine constants (`SLOT_VALID_TRANSITIONS`, `BOOKING_VALID_TRANSITIONS`), DTOs.

## Implementation Notes

- **Slot generation**: `generateTimeSlotsSchema` accepts `{ date, start_time, end_time, slot_duration_minutes, buffer_minutes, teacher_ids }`. The service calculates slot windows: for each teacher, generate slots from `start_time` to `end_time` with `slot_duration + buffer` gaps. Example: 16:00-20:00 with 10min slots + 2min buffer = 20 slots per teacher.
- **Conflict prevention (critical)**: Booking must use `SELECT ... FOR UPDATE` on the `ConferenceTimeSlot` row within an RLS transaction. Check `status = available` AFTER acquiring the lock. If not available, return `409 Conflict`. This prevents two parents booking the same slot under concurrency.
- **Parent double-booking prevention**: Before creating a booking, check if the parent already has a booking for ANY slot overlapping the requested time range. Parents cannot be in two meetings at once.
- **Teacher double-booking prevention**: Inherent in the model — one slot per teacher per time window. The slot's `status` field prevents double-booking.
- **Available slots for parent**: Query all slots for the event where `status = available` AND `teacher_id` is in the set of teachers for the parent's child's enrolled classes. This requires joining through `ClassEnrolment` → `ClassStaff` to determine which teachers the student has.
- **Parent cancellation**: Governed by tenant config `allow_parent_conference_cancellation`. If false, parent cancellation endpoint returns `403`. If true, cancellation sets booking `status = cancelled`, `cancelled_at`, and returns the time slot to `status = available`.
- **Admin/walk-in booking**: Same as parent booking but uses `BookingType.admin_booked` or `BookingType.walk_in`. No restriction on which teachers — admin can book any available slot.
- **Teacher schedule**: Returns all time slots for a specific teacher in an event, ordered by `start_time`, with booking details (student name, parent name) for booked slots.
- **Event type guard**: All conference endpoints must validate that the event is of type `parent_conference`. Return `400 Bad Request` if not.
