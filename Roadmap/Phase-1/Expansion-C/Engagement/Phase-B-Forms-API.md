# Phase B — Forms API

**Wave**: 2
**Deploy Order**: d2
**Depends On**: A

## Scope

The complete backend for the Forms & E-Signature engine: template CRUD, form distribution, parent form submission with e-signature, consent record lifecycle, and the form distribution BullMQ job. This is the base primitive that events (Phase C) build upon — when an event opens, it enqueues the `distribute-forms` job that this phase implements.

## Deliverables

### Services

- `apps/api/src/modules/engagement/form-templates.service.ts` — CRUD for form templates (create, list, getById, update, delete, publish, archive). Template immutability after first distribution. Pagination with filters (status, form_type, consent_type).
- `apps/api/src/modules/engagement/form-templates.service.spec.ts`
- `apps/api/src/modules/engagement/form-submissions.service.ts` — Distribution logic (create pending submissions for target students), submission processing (validate responses against template fields, store signature data, create consent record), acknowledge, expire, revoke. Completion stats query (submitted/pending/expired counts per template or event).
- `apps/api/src/modules/engagement/form-submissions.service.spec.ts`
- `apps/api/src/modules/engagement/consent-records.service.ts` — Query consent records by student, form type, date range, status. Revocation logic (validate standing/annual type, set status=revoked, timestamp). Archive search with pagination.
- `apps/api/src/modules/engagement/consent-records.service.spec.ts`

### Controllers

- `apps/api/src/modules/engagement/form-templates.controller.ts` — Admin endpoints:
  - `POST   /v1/engagement/form-templates`
  - `GET    /v1/engagement/form-templates`
  - `GET    /v1/engagement/form-templates/:id`
  - `PATCH  /v1/engagement/form-templates/:id`
  - `DELETE /v1/engagement/form-templates/:id`
  - `POST   /v1/engagement/form-templates/:id/publish`
  - `POST   /v1/engagement/form-templates/:id/archive`
  - `POST   /v1/engagement/form-templates/:id/distribute`
- `apps/api/src/modules/engagement/form-templates.controller.spec.ts`
- `apps/api/src/modules/engagement/form-submissions.controller.ts` — Admin endpoints:
  - `GET    /v1/engagement/form-submissions`
  - `GET    /v1/engagement/form-submissions/:id`
  - `POST   /v1/engagement/form-submissions/:id/acknowledge`
  - `GET    /v1/engagement/consent-records`
  - `GET    /v1/engagement/consent-records/student/:studentId`
- `apps/api/src/modules/engagement/form-submissions.controller.spec.ts`
- `apps/api/src/modules/engagement/parent-forms.controller.ts` — Parent endpoints:
  - `GET    /v1/parent/engagement/pending-forms`
  - `GET    /v1/parent/engagement/forms/:submissionId`
  - `POST   /v1/parent/engagement/forms/:submissionId/submit`
  - `POST   /v1/parent/engagement/consent/:consentId/revoke`
- `apps/api/src/modules/engagement/parent-forms.controller.spec.ts`

### Worker

- `apps/worker/src/engagement/engagement-distribute-forms.processor.ts` — Processes `engagement:distribute-forms` job. Receives `{ tenant_id, form_template_id, target_type, target_config, event_id?, deadline? }`. Resolves target students from year groups/classes/custom list. Creates one `EngagementFormSubmission` (status=pending) per student. Dispatches notification per parent via comms module. Batches in chunks of 100 for large distributions.

### Module Update

- Update `apps/api/src/modules/engagement/engagement.module.ts` — register form-templates, form-submissions, parent-forms controllers and all form-related services as providers.

## Out of Scope

- Events CRUD, lifecycle, participants, staff assignment (Phase C)
- Trip pack, attendance, incidents (Phase D)
- Conference scheduling, bookings (Phase E)
- All frontend pages and components (Phase F)
- Chase-up automation, deadline expiry cron jobs (Phase C — they operate on submissions but are triggered by event lifecycle)

## Dependencies

- **Phase A**: All Prisma models (`EngagementFormTemplate`, `EngagementFormSubmission`, `EngagementConsentRecord`), Zod schemas (`createEngagementFormTemplateSchema`, `submitFormSchema`, `signatureDataSchema`, `distributeFormSchema`), DTO re-exports, state machine constants (`SUBMISSION_VALID_TRANSITIONS`), `ENGAGEMENT` queue constant.

## Implementation Notes

- **Template immutability**: Once a template has been distributed (has at least one submission), it becomes read-only. Edits should be rejected with `400 Bad Request`. Users must create a new template version instead.
- **Signature validation**: The `submitFormSchema` must validate `signature_json` structure (type, data, timestamp). The service layer captures IP address and user agent from the request context and appends them — the parent does not submit these.
- **Consent record creation**: When a form with `consent_type` is submitted, `FormSubmissionsService` must create a corresponding `EngagementConsentRecord`. For `annual` consent, set `expires_at` to the academic year end date. For `standing`, leave `expires_at` null.
- **Revocation**: Only `standing` and `annual` consent types can be revoked. One-time consent (linked to a specific event) cannot be revoked after the event. Revocation updates both the submission (`status=revoked`) and consent record (`status=revoked`).
- **Notification integration**: Distribution triggers a notification per parent (not per student — a parent with 3 children gets one notification listing all pending forms). Use existing `NotificationDispatchService.dispatch()` from the communications module.
- **Permission guards**: All admin endpoints use `@RequiresPermission('engagement.form_templates.*')` or `engagement.consent_archive.view`. Parent endpoints use the existing parent auth guard scoped to own children.
- **RLS**: All write operations use `createRlsClient(this.prisma, { tenant_id }).$transaction(...)`. Reads use `this.prisma.model.findMany({ where: { tenant_id } })`.
