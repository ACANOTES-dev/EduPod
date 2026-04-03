# Phase A — Foundation (Schema + Shared Types)

**Wave**: 1
**Deploy Order**: d1
**Depends On**: None

## Scope

All database tables, enums, indexes, RLS policies, Prisma migration, shared Zod schemas, TypeScript constants, DTO re-exports, tenant configuration schema, BullMQ queue constant, and the NestJS module shell. This phase creates every data structure the engagement feature needs — no business logic, no endpoints, no UI. Every subsequent phase depends on this.

## Deliverables

### Prisma Migration

- **Migration file**: `packages/prisma/migrations/YYYYMMDDHHMMSS_add_engagement_tables/migration.sql`
- **16 new enums** added to `packages/prisma/schema.prisma`:
  - `EngagementFormType`, `ConsentType`, `EngagementFormStatus`, `FormSubmissionStatus`
  - `EngagementEventType`, `EngagementEventStatus`, `EventTargetType`, `EventStaffRole`
  - `ParticipantStatus`, `ParticipantConsentStatus`, `ParticipantPaymentStatus`
  - `ConsentRecordStatus`, `TimeSlotStatus`, `ConferenceBookingStatus`, `BookingType`
- **9 new tables** added to `packages/prisma/schema.prisma`:
  - `engagement_form_templates` (EngagementFormTemplate)
  - `engagement_form_submissions` (EngagementFormSubmission)
  - `engagement_consent_records` (EngagementConsentRecord)
  - `engagement_events` (EngagementEvent)
  - `engagement_event_staff` (EngagementEventStaff)
  - `engagement_event_participants` (EngagementEventParticipant)
  - `conference_time_slots` (ConferenceTimeSlot)
  - `conference_bookings` (ConferenceBooking)
  - `engagement_incident_reports` (EngagementIncidentReport)
- **Relation fields** added to existing models: `Student`, `StaffProfile`, `Invoice`, `AcademicYear`, `User`, `Tenant`
- **All indexes** as defined in ENG-MSTR Section 3
- **All unique constraints**: `uq_eng_event_staff`, `uq_eng_event_participant`, unique `time_slot_id` on bookings

### RLS Policies

- **File**: `packages/prisma/rls/post_migrate.sql` (append)
- **9 policies**: one `{table_name}_tenant_isolation` policy per new table, with `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`

### Shared Types (`packages/shared/src/engagement/`)

- `engagement-form-template.schema.ts` — `createEngagementFormTemplateSchema`, `updateEngagementFormTemplateSchema`, `engagementFormFieldSchema`, `distributeFormSchema`
- `engagement-form-submission.schema.ts` — `submitFormSchema`, `signatureDataSchema`
- `engagement-event.schema.ts` — `createEngagementEventSchema`, `updateEngagementEventSchema`, `eventTargetConfigSchema`, `eventDashboardQuerySchema`
- `engagement-conference.schema.ts` — `generateTimeSlotsSchema`, `createBookingSchema`
- `engagement-config.schema.ts` — `engagementConfigSchema`
- `engagement-constants.ts` — state machine transition maps (`EVENT_VALID_TRANSITIONS`, `SUBMISSION_VALID_TRANSITIONS`, `SLOT_VALID_TRANSITIONS`, `BOOKING_VALID_TRANSITIONS`), permission key constants
- `index.ts` — barrel export

### DTOs (`apps/api/src/modules/engagement/dto/`)

- `create-form-template.dto.ts`
- `update-form-template.dto.ts`
- `distribute-form.dto.ts`
- `submit-form.dto.ts`
- `create-event.dto.ts`
- `update-event.dto.ts`
- `create-booking.dto.ts`
- `generate-time-slots.dto.ts`

Each DTO is a thin re-export of the corresponding Zod schema and inferred type from `@school/shared`.

### Module Shell

- `apps/api/src/modules/engagement/engagement.module.ts` — empty NestJS module registered in `AppModule`, imports `PrismaModule`. Controllers and providers added by subsequent phases.

### Queue Constant

- `apps/worker/src/base/queue.constants.ts` — add `ENGAGEMENT: 'engagement'` to `QUEUE_NAMES`

### Sequence Number

- Add `EVI` prefix to `tenant_sequences` seed data (for event invoice numbering)

## Out of Scope

- No service logic, no controllers, no endpoints
- No worker processors
- No frontend pages or components
- No notification templates
- No PDF templates
- No test files for services/controllers (those come with the services in later phases)

## Dependencies

None.

## Implementation Notes

- The Prisma schema changes add relation fields to `Student`, `StaffProfile`, `Invoice`, `AcademicYear`, `User`, and `Tenant`. These are backward-compatible additions (new optional relation arrays) but require care to not conflict with other in-flight migrations.
- The `engagement_events` table uses a single-table polymorphic design with `event_type` discriminator. Type-specific fields (e.g., `slot_duration_minutes` for conferences, `fee_amount` for trips) are nullable — validation of required fields per type is enforced at the Zod schema / service layer, not the database.
- `engagement_event_participants.invoice_id` references the existing `invoices` table — this is the integration point with the finance module.
- `conference_time_slots.teacher_id` references `staff_profiles`, not `users` — teachers are always staff.
- The `engagement-constants.ts` file exports the state machine transition maps as `Record<EnumType, EnumType[]>`. These are imported by both API services and shared types consumers.
- Run `npx prisma migrate dev --name add-engagement-tables` to generate the migration.
- After migration, append RLS policies to `post_migrate.sql` and execute.
