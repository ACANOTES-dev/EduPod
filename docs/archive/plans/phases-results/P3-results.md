# Phase 3 Results — Admissions

## Summary

Phase 3 delivers the complete configurable admissions system: a form builder with versioning for defining application forms, a public-facing application page with rate limiting and honeypot protection, a multi-step application review workflow with internal notes and approval-gated acceptance (integrated with P1's approval framework), duplicate detection on submission, application-to-student conversion creating student/parent/household records in a single transaction, application number sequence generation, basic admissions funnel analytics, and parent-facing application tracking. The system supports all 11 field types with conditional visibility, bilingual (en/ar) UI with full RTL support, and Meilisearch indexing for applications.

---

## Database Migrations

### New Enums (3)

| Enum                   | Values                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `FormDefinitionStatus` | `draft`, `published`, `archived`                                                                                               |
| `ApplicationFieldType` | `short_text`, `long_text`, `number`, `date`, `boolean`, `single_select`, `multi_select`, `phone`, `email`, `country`, `yes_no` |
| `ApplicationStatus`    | `draft`, `submitted`, `under_review`, `pending_acceptance_approval`, `accepted`, `rejected`, `withdrawn`                       |

### New Tables (4)

| Table                        | Columns | RLS | Trigger                       |
| ---------------------------- | ------- | --- | ----------------------------- |
| `admission_form_definitions` | 8       | Yes | `set_updated_at()`            |
| `admission_form_fields`      | 17      | Yes | No (immutable once published) |
| `applications`               | 14      | Yes | `set_updated_at()`            |
| `application_notes`          | 7       | Yes | No (append-only)              |

### Migration File

- `packages/prisma/migrations/20260316120000_add_p3_admissions/post_migrate.sql`
- Contains: RLS policies (4 tables), triggers (2 tables), partial unique index for root form names

---

## API Endpoints

### Form Definition Endpoints

| Method | Path                                   | Auth | Permission          |
| ------ | -------------------------------------- | ---- | ------------------- |
| `POST` | `/api/v1/admission-forms`              | Yes  | `admissions.manage` |
| `GET`  | `/api/v1/admission-forms`              | Yes  | `admissions.view`   |
| `GET`  | `/api/v1/admission-forms/:id`          | Yes  | `admissions.view`   |
| `PUT`  | `/api/v1/admission-forms/:id`          | Yes  | `admissions.manage` |
| `POST` | `/api/v1/admission-forms/:id/publish`  | Yes  | `admissions.manage` |
| `POST` | `/api/v1/admission-forms/:id/archive`  | Yes  | `admissions.manage` |
| `GET`  | `/api/v1/admission-forms/:id/versions` | Yes  | `admissions.view`   |

### Application Endpoints

| Method | Path                                          | Auth | Permission          |
| ------ | --------------------------------------------- | ---- | ------------------- |
| `GET`  | `/api/v1/applications`                        | Yes  | `admissions.view`   |
| `GET`  | `/api/v1/applications/analytics`              | Yes  | `admissions.view`   |
| `GET`  | `/api/v1/applications/:id`                    | Yes  | `admissions.view`   |
| `GET`  | `/api/v1/applications/:id/preview`            | Yes  | `admissions.view`   |
| `POST` | `/api/v1/applications/:id/review`             | Yes  | `admissions.manage` |
| `POST` | `/api/v1/applications/:id/withdraw`           | Yes  | `admissions.manage` |
| `GET`  | `/api/v1/applications/:id/conversion-preview` | Yes  | `admissions.manage` |
| `POST` | `/api/v1/applications/:id/convert`            | Yes  | `admissions.manage` |
| `GET`  | `/api/v1/applications/:applicationId/notes`   | Yes  | `admissions.view`   |
| `POST` | `/api/v1/applications/:applicationId/notes`   | Yes  | `admissions.manage` |

### Public Endpoints (No Auth)

| Method | Path                                     | Auth | Permission          |
| ------ | ---------------------------------------- | ---- | ------------------- |
| `GET`  | `/api/v1/public/admissions/form`         | No   | None                |
| `POST` | `/api/v1/public/admissions/applications` | No   | None (rate limited) |

### Parent Endpoints

| Method | Path                                       | Auth | Permission  |
| ------ | ------------------------------------------ | ---- | ----------- |
| `GET`  | `/api/v1/parent/applications`              | Yes  | Parent role |
| `GET`  | `/api/v1/parent/applications/:id`          | Yes  | Parent role |
| `POST` | `/api/v1/parent/applications/:id/submit`   | Yes  | Parent role |
| `POST` | `/api/v1/parent/applications/:id/withdraw` | Yes  | Parent role |

---

## Services

| Service                      | File                                                               | Responsibilities                                                                                            |
| ---------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `SequenceService`            | `apps/api/src/modules/tenants/sequence.service.ts`                 | Reusable sequence number generator using `FOR UPDATE` locking. Formats: `APP-YYYY-000001` for applications. |
| `AdmissionsRateLimitService` | `apps/api/src/modules/admissions/admissions-rate-limit.service.ts` | Redis-based rate limiter: 3 submissions per IP per tenant per hour                                          |
| `AdmissionFormsService`      | `apps/api/src/modules/admissions/admission-forms.service.ts`       | Form CRUD with versioning, field validation, conditional visibility validation                              |
| `ApplicationNotesService`    | `apps/api/src/modules/admissions/application-notes.service.ts`     | Note CRUD with internal/external visibility filtering                                                       |
| `ApplicationsService`        | `apps/api/src/modules/admissions/applications.service.ts`          | Full application lifecycle: create, submit, review, withdraw, convert, analytics, parent access             |

---

## Frontend

### Pages

| Route                               | File                                        | Type   | Description                                     |
| ----------------------------------- | ------------------------------------------- | ------ | ----------------------------------------------- |
| `/{locale}/admissions`              | `(school)/admissions/page.tsx`              | Server | Application list with status filters and search |
| `/{locale}/admissions/forms`        | `(school)/admissions/forms/page.tsx`        | Server | Form definition list                            |
| `/{locale}/admissions/forms/new`    | `(school)/admissions/forms/new/page.tsx`    | Client | Form builder (create)                           |
| `/{locale}/admissions/forms/{id}`   | `(school)/admissions/forms/[id]/page.tsx`   | Client | Form builder (edit)                             |
| `/{locale}/admissions/{id}`         | `(school)/admissions/[id]/page.tsx`         | Client | Application detail (RecordHub)                  |
| `/{locale}/admissions/{id}/convert` | `(school)/admissions/[id]/convert/page.tsx` | Client | Application-to-student conversion               |
| `/{locale}/admissions/analytics`    | `(school)/admissions/analytics/page.tsx`    | Client | Admissions funnel analytics                     |
| `/{locale}/applications`            | `(school)/applications/page.tsx`            | Server | Parent-facing application list                  |
| `/{locale}/admissions` (public)     | `(public)/admissions/page.tsx`              | Client | Public application form                         |

### Components

| Component                | File                                                 | Description                                      |
| ------------------------ | ---------------------------------------------------- | ------------------------------------------------ |
| `DynamicFormRenderer`    | `components/admissions/dynamic-form-renderer.tsx`    | Renders form fields dynamically from definitions |
| `ApplicationStatusBadge` | `components/admissions/application-status-badge.tsx` | Status-to-badge variant mapper                   |

---

## Background Jobs

| Job                        | Queue               | Trigger                            | Description                             |
| -------------------------- | ------------------- | ---------------------------------- | --------------------------------------- |
| `search:index-application` | `search` (existing) | Application submission, conversion | Indexes application data in Meilisearch |

The `applications` entity type was added to `SearchIndexService.formatDocument()`.

---

## Configuration

### Seed Data

- No new seed data required. The `application` sequence type is already in `SEQUENCE_TYPES` constant and seeded per tenant on creation.
- `application_accept` approval action type already exists in `ApprovalActionType` enum.
- `admissions.manage` and `admissions.view` permissions already exist in seeded permissions.
- `tenant_settings.admissions.requireApprovalForAcceptance` already defined in tenant settings Zod schema.

### i18n

- 56 admissions keys added to `apps/web/messages/en.json`
- 56 matching Arabic keys added to `apps/web/messages/ar.json`

---

## Files Created

### Backend

- `apps/api/src/modules/tenants/sequence.service.ts`
- `apps/api/src/modules/admissions/admissions.module.ts`
- `apps/api/src/modules/admissions/admissions-rate-limit.service.ts`
- `apps/api/src/modules/admissions/admission-forms.service.ts`
- `apps/api/src/modules/admissions/application-notes.service.ts`
- `apps/api/src/modules/admissions/applications.service.ts`
- `apps/api/src/modules/admissions/admission-forms.controller.ts`
- `apps/api/src/modules/admissions/applications.controller.ts`
- `apps/api/src/modules/admissions/public-admissions.controller.ts`
- `apps/api/src/modules/admissions/parent-applications.controller.ts`

### Shared

- `packages/shared/src/schemas/admission-form.schema.ts`
- `packages/shared/src/schemas/application.schema.ts`

### Database

- `packages/prisma/migrations/20260316120000_add_p3_admissions/post_migrate.sql`

### Frontend

- `apps/web/src/components/admissions/dynamic-form-renderer.tsx`
- `apps/web/src/components/admissions/application-status-badge.tsx`
- `apps/web/src/app/[locale]/(school)/admissions/page.tsx`
- `apps/web/src/app/[locale]/(school)/admissions/forms/page.tsx`
- `apps/web/src/app/[locale]/(school)/admissions/forms/new/page.tsx`
- `apps/web/src/app/[locale]/(school)/admissions/forms/[id]/page.tsx`
- `apps/web/src/app/[locale]/(school)/admissions/[id]/page.tsx`
- `apps/web/src/app/[locale]/(school)/admissions/[id]/convert/page.tsx`
- `apps/web/src/app/[locale]/(school)/admissions/analytics/page.tsx`
- `apps/web/src/app/[locale]/(school)/applications/page.tsx`
- `apps/web/src/app/[locale]/(public)/admissions/page.tsx`

---

## Files Modified

| File                                                  | Changes                                                  |
| ----------------------------------------------------- | -------------------------------------------------------- |
| `packages/prisma/schema.prisma`                       | Added 3 enums, 4 models, relations on Tenant/User/Parent |
| `packages/shared/src/index.ts`                        | Added barrel exports for new schema files                |
| `apps/api/src/app.module.ts`                          | Added `AdmissionsModule` to imports                      |
| `apps/api/src/modules/tenants/tenants.module.ts`      | Added `SequenceService` to providers and exports         |
| `apps/api/src/modules/search/search-index.service.ts` | Added `applications` case to `formatDocument()`          |
| `apps/api/src/modules/dashboard/dashboard.service.ts` | Added admissions counts to admin dashboard               |
| `apps/web/src/app/[locale]/(school)/layout.tsx`       | Added Admissions nav item with `UserPlus` icon           |
| `apps/web/messages/en.json`                           | Added 56 admissions i18n keys                            |
| `apps/web/messages/ar.json`                           | Added 56 admissions Arabic i18n keys                     |

---

## Known Limitations

1. **Draft application cleanup**: Draft applications from the public endpoint that are never submitted persist indefinitely. A scheduled cleanup job is deferred to a future phase.
2. **Form preview page**: A dedicated `/forms/{id}/preview` route is not implemented as a separate page — the form builder itself includes inline preview via the `DynamicFormRenderer` in read-only mode.
3. **Approval callback**: When an approval for `application_accept` is approved/rejected by an approver, the application status transition is handled when the reviewing admin checks the application next. There is no automatic push-based callback from the approval module to update application status. This works because the admin checks the application to proceed with conversion.
4. **No drag-and-drop**: Field reordering in the form builder uses up/down move buttons rather than native drag-and-drop, which avoids a library dependency. Can be enhanced later.

---

## Deviations from Plan

1. **Sequence number format**: The plan specified `APP-{YYYY}-{padded}` but the implementation uses `APP-{YYYYMM}-{padded}` (includes month) in the `SequenceService` for consistency with the receipt/invoice format convention. This is a minor format difference that can be adjusted if needed.
2. **Form preview page**: Plan specified a separate `/forms/{id}/preview/page.tsx` route. Implemented as inline read-only rendering within the form builder instead, which is more practical and avoids an extra page.
3. **Parent application submit/withdraw**: These were placed on the `ParentApplicationsController` (`/api/v1/parent/applications/:id/submit` and `/withdraw`) rather than on the public admissions controller, as they require authentication.
