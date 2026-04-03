# Phase G: Documents + Comms — Implementation Plan

## Section 1 — Overview

Phase G delivers:

1. **Document generation engine** — Handlebars templates rendered to PDF via Puppeteer, stored in S3, tracked in `behaviour_documents`
2. **Document template management** — system templates per locale, school customisation, merge field reference
3. **Parent behaviour portal** — hardened parent-safe content rendering with guardian restriction checks
4. **Notification digest worker** — daily batched parent notifications
5. **Amendment correction chain** — notification/re-acknowledgement flow when amendments occur
6. **20 seed document templates** (10 types × 2 locales)

### Dependencies on Prior Phases

- **Phase A**: Prisma schema (all tables exist), incidents CRUD, parent_description workflow, send-gate, data classification (`packages/shared/src/behaviour/data-classification.ts`)
- **Phase C**: Sanctions full lifecycle (`behaviour-sanctions.service.ts`), exclusion cases (`behaviour-exclusion-cases.service.ts`), appeals with outcomes (`behaviour-appeals.service.ts`), amendments (`behaviour-amendments.service.ts`)
- **Phase D** (implicit): `behaviour_attachments` S3 infrastructure exists via `safeguarding-attachment.service.ts`
- **Phase E**: Guardian restrictions service (`behaviour-guardian-restrictions.service.ts`), recognition service for parent wall

### Key Codebase Patterns

- RLS: `createRlsClient(this.prisma, { tenant_id })` from `apps/api/src/common/middleware/rls.middleware.ts`
- Transaction: `rlsClient.$transaction(async (tx) => { const db = tx as unknown as PrismaService; ... })`
- Worker: Processor extends `WorkerHost`, inner class extends `TenantAwareJob<T>`
- PDF: `PdfRenderingService.renderFromHtml(html)` returns `Buffer`
- S3: `S3Service.upload(tenantId, key, body, contentType)` returns full key; `getPresignedUrl(key, expiresIn)`
- Prisma enum mapping: `DocumentStatus.draft_doc` → DB "draft", `DocumentStatus.sent_doc` → DB "sent"

---

## Section 2 — Database Changes

No new tables needed — all 3 tables exist from Phase A:

- `behaviour_documents` (BehaviourDocument)
- `behaviour_document_templates` (BehaviourDocumentTemplate)
- `behaviour_parent_acknowledgements` (BehaviourParentAcknowledgement)

### Schema Verification

- `BehaviourDocument`: 20 columns, indexes on `(tenant_id, entity_type, entity_id)` and `(tenant_id, student_id)`, RLS policy exists
- `BehaviourDocumentTemplate`: 10 columns, index on `(tenant_id, document_type)`, RLS policy exists
- `BehaviourParentAcknowledgement`: 13 columns, indexes on `(tenant_id, incident_id)` and `(tenant_id, parent_id)`, RLS policy exists

### Potential Index Addition

Add a unique constraint on document templates for dedup:

- `@@unique([tenant_id, document_type, locale, name], name: "uq_behaviour_doc_templates_name")` on `BehaviourDocumentTemplate`

This matches the spec's UNIQUE constraint requirement: `(tenant_id, document_type, locale, name)`.

### Seed Data

20 system document templates (10 types × 2 locales) seeded per tenant. Added to `packages/prisma/seed/behaviour-seed.ts`.

---

## Section 3 — API Endpoints

### Documents Controller — `behaviour-documents.controller.ts` (6 routes)

| #   | Method | Route                                 | Permission         | Request                                                                                 | Response                             |
| --- | ------ | ------------------------------------- | ------------------ | --------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | POST   | `v1/behaviour/documents/generate`     | `behaviour.manage` | `{ document_type, entity_type, entity_id, locale?, template_id? }`                      | Document record (draft)              |
| 2   | GET    | `v1/behaviour/documents`              | `behaviour.view`   | Query: `entity_type?, entity_id?, student_id?, document_type?, status?, page, pageSize` | `{ data: Document[], meta }`         |
| 3   | GET    | `v1/behaviour/documents/:id`          | `behaviour.view`   | —                                                                                       | Document detail                      |
| 4   | PATCH  | `v1/behaviour/documents/:id/finalise` | `behaviour.manage` | `{ notes? }`                                                                            | Updated document                     |
| 5   | POST   | `v1/behaviour/documents/:id/send`     | `behaviour.manage` | `{ channel, recipient_parent_id? }`                                                     | Updated document (sent)              |
| 6   | GET    | `v1/behaviour/documents/:id/download` | `behaviour.view`   | —                                                                                       | `{ url: string }` (presigned S3 URL) |

### Parent Behaviour Controller — `behaviour-parent.controller.ts` (6 routes)

| #   | Method | Route                                                 | Permission  | Request                             | Response                           |
| --- | ------ | ----------------------------------------------------- | ----------- | ----------------------------------- | ---------------------------------- |
| 1   | GET    | `v1/parent/behaviour/summary`                         | parent role | —                                   | `{ data: ChildSummary[] }`         |
| 2   | GET    | `v1/parent/behaviour/incidents`                       | parent role | Query: `student_id, page, pageSize` | `{ data: ParentIncident[], meta }` |
| 3   | GET    | `v1/parent/behaviour/points-awards`                   | parent role | Query: `student_id`                 | `{ data: PointsAwards }`           |
| 4   | GET    | `v1/parent/behaviour/sanctions`                       | parent role | Query: `student_id`                 | `{ data: { upcoming, recent } }`   |
| 5   | POST   | `v1/parent/behaviour/acknowledge/:acknowledgement_id` | parent role | —                                   | `{ data: { acknowledged: true } }` |
| 6   | GET    | `v1/parent/behaviour/recognition`                     | parent role | —                                   | `{ data: RecognitionItem[] }`      |

### Document Templates (added to config controller) — 3 routes

| #   | Method | Route                                 | Permission        | Request                                                        | Response         |
| --- | ------ | ------------------------------------- | ----------------- | -------------------------------------------------------------- | ---------------- |
| 1   | GET    | `v1/behaviour/document-templates`     | `behaviour.admin` | Query: `document_type?, locale?, is_active?`                   | Template list    |
| 2   | POST   | `v1/behaviour/document-templates`     | `behaviour.admin` | `{ document_type, name, locale, template_body, merge_fields }` | Created template |
| 3   | PATCH  | `v1/behaviour/document-templates/:id` | `behaviour.admin` | `{ name?, template_body?, is_active? }`                        | Updated template |

---

## Section 4 — Service Layer

### `BehaviourDocumentService`

- **File**: `apps/api/src/modules/behaviour/behaviour-document.service.ts`
- **Dependencies**: PrismaService, S3Service, PdfRenderingService, BehaviourHistoryService
- **Methods**:
  - `generateDocument(tenantId, userId, dto)` — 8-step pipeline: load template → populate merge fields → Handlebars render → Puppeteer PDF → SHA-256 → S3 upload → create DB record → return draft
  - `listDocuments(tenantId, query)` — Paginated list with filters
  - `getDocument(tenantId, documentId)` — Single document detail
  - `finaliseDocument(tenantId, userId, documentId, notes?)` — draft → finalised transition
  - `sendDocument(tenantId, userId, documentId, channel, recipientParentId?)` — finalised → sent, creates acknowledgement row, dispatches notification
  - `getDownloadUrl(tenantId, documentId)` — Returns presigned S3 URL (15min expiry)
  - `supersededDocument(tx, documentId, newDocumentId, reason)` — Mark old doc superseded
  - `resolvemergeFields(tx, tenantId, entityType, entityId, studentId)` — Collects all merge field values from entity + student + school context
  - `autoGenerateDocument(tx, tenantId, userId, documentType, entityType, entityId, studentId)` — Called inline during sanction/exclusion/appeal creation when auto-generate enabled

### `BehaviourDocumentTemplateService`

- **File**: `apps/api/src/modules/behaviour/behaviour-document-template.service.ts`
- **Dependencies**: PrismaService
- **Methods**:
  - `listTemplates(tenantId, filters)` — List all templates with optional filters
  - `createTemplate(tenantId, dto)` — Create school-custom template (is_system=false)
  - `updateTemplate(tenantId, templateId, dto)` — Update template (system templates: only is_active and template_body editable)
  - `getActiveTemplate(tx, tenantId, documentType, locale)` — Find best active template (school custom preferred over system)
  - `getMergeFieldsForType(documentType)` — Returns available merge fields for a document type

### `BehaviourParentService`

- **File**: `apps/api/src/modules/behaviour/behaviour-parent.service.ts`
- **Dependencies**: PrismaService, BehaviourGuardianRestrictionsService, BehaviourPointsService, BehaviourRecognitionService
- **Methods**:
  - `getSummary(tenantId, parentId)` — Per-child summary cards with restriction checks
  - `getIncidents(tenantId, parentId, studentId, page, pageSize)` — Parent-safe incident list using content priority chain
  - `getPointsAwards(tenantId, parentId, studentId)` — Points total + recent awards
  - `getSanctions(tenantId, parentId, studentId)` — Upcoming/recent sanctions (parent-safe fields only)
  - `acknowledge(tenantId, parentId, acknowledgementId)` — Set acknowledged_at and method
  - `getRecognitionWall(tenantId, parentId)` — Published recognition items
  - `renderIncidentForParent(incident, parentLocale)` — Content priority chain: parent_description → template text → category+date
  - `checkGuardianRestriction(tx, tenantId, studentId, parentId)` — Returns true if restricted

---

## Section 5 — Frontend Pages and Components

### `/behaviour/documents` — Document Management

- **File**: `apps/web/src/app/[locale]/(school)/behaviour/documents/page.tsx`
- **Type**: Client component (interactive filters)
- **Data**: `GET v1/behaviour/documents` with filter params
- **UI**: Filter bar (type multi-select, status, date range, student search) + results table (student, type, generated at, status, generated by, actions). Draft docs show yellow "Needs review" badge. Superseded docs shown with strikethrough. "Generate Document" button opens modal.
- **Mobile**: Card layout replacing table

### `/parent/behaviour` — Parent Behaviour Portal

- **File**: `apps/web/src/app/[locale]/(parent)/behaviour/page.tsx`
- **Type**: Client component (tabs, acknowledgement)
- **Data**: `GET v1/parent/behaviour/summary`, then per-child: incidents, sanctions, points-awards
- **UI**: Child tab bar → per child: summary card, incidents list (parent-safe rendered), upcoming sanctions, recognition, acknowledgement prompts
- **Mobile**: 375px full support, scrollable tabs, full-width acknowledge CTA

### `/parent/behaviour/recognition` — Recognition Wall

- **File**: `apps/web/src/app/[locale]/(parent)/behaviour/recognition/page.tsx`
- **Type**: Server component
- **Data**: `GET v1/parent/behaviour/recognition`
- **UI**: Achievement card grid (2-col sm+, 1-col mobile). Student first name + last initial, award type, icon, date.

### `/settings/behaviour-documents` — Template Editor

- **File**: `apps/web/src/app/[locale]/(school)/settings/behaviour-documents/page.tsx`
- **Type**: Client component (editor interactions)
- **Data**: `GET v1/behaviour/document-templates`
- **UI**: Left panel (template list grouped by type, system lock icon, custom edit/delete) + right panel (name, locale, template body textarea with merge field reference panel, preview button, save)
- **Mobile**: Stacked vertical layout

---

## Section 6 — Background Jobs

### `behaviour:digest-notifications`

- **Queue**: `notifications`
- **Trigger**: Cron at tenant-configured time (default 16:00), per-tenant in tenant timezone
- **Payload**: `{ tenant_id: string }`
- **File**: `apps/worker/src/processors/behaviour/digest-notifications.processor.ts`
- **Processing**:
  1. Load parents with pending unsent behaviour notifications
  2. Per parent: load linked students, apply guardian restriction check per student
  3. Load incidents since last digest where `parent_notification_status = 'pending'` and `parent_visible = true`
  4. Apply parent-safe rendering priority chain per incident
  5. Compose single digest notification
  6. Dispatch via parent's preferred channel
  7. Create `behaviour_parent_acknowledgements` rows
  8. Update incidents `parent_notification_status` to 'sent'
- **Error handling**: Individual parent failures don't abort the batch
- **Dedup**: Check existing acknowledgement rows for same incident+parent created today

---

## Section 7 — Implementation Order

### Step 1: Install Handlebars dependency

- `cd apps/api && npm install handlebars`
- Add `@types/handlebars` if needed (Handlebars ships its own types)

### Step 2: Shared types and Zod schemas

- `packages/shared/src/behaviour/schemas/document.schema.ts`
- `packages/shared/src/behaviour/schemas/parent-behaviour.schema.ts`
- Export from `packages/shared/src/behaviour/schemas/index.ts`

### Step 3: Prisma schema update (unique constraint)

- Add unique constraint on `BehaviourDocumentTemplate`
- Generate and apply migration

### Step 4: Document template service

- `behaviour-document-template.service.ts`
- Merge field definitions per document type

### Step 5: Document generation service

- `behaviour-document.service.ts`
- 8-step generation pipeline
- Auto-generate integration points

### Step 6: Document controller

- `behaviour-documents.controller.ts`
- 6 endpoints

### Step 7: Parent behaviour service

- `behaviour-parent.service.ts`
- Parent-safe rendering, restriction checks

### Step 8: Parent behaviour controller

- `behaviour-parent.controller.ts`
- 6 endpoints

### Step 9: Document template endpoints on config controller

- Add 3 template management endpoints to `behaviour-config.controller.ts`

### Step 10: Digest notifications worker

- `digest-notifications.processor.ts`
- Register in worker module

### Step 11: Seed data

- 20 document templates in `behaviour-seed.ts`

### Step 12: Frontend — Document management page

- `/behaviour/documents/page.tsx`

### Step 13: Frontend — Parent behaviour portal

- `/parent/behaviour/page.tsx`

### Step 14: Frontend — Recognition wall

- `/parent/behaviour/recognition/page.tsx`

### Step 15: Frontend — Template editor settings page

- `/settings/behaviour-documents/page.tsx`

### Step 16: Module registration

- Register new services and controllers in `behaviour.module.ts`
- Import PdfRenderingModule and S3Module
- Register worker processor in `worker.module.ts`

### Step 17: Tests

- Unit tests for all service methods
- RLS leakage tests for document operations
- Parent-safe rendering priority chain tests

---

## Section 8 — Files to Create

### Backend

- `apps/api/src/modules/behaviour/behaviour-document.service.ts`
- `apps/api/src/modules/behaviour/behaviour-document-template.service.ts`
- `apps/api/src/modules/behaviour/behaviour-parent.service.ts`
- `apps/api/src/modules/behaviour/behaviour-documents.controller.ts`
- `apps/api/src/modules/behaviour/behaviour-parent.controller.ts`

### Shared

- `packages/shared/src/behaviour/schemas/document.schema.ts`
- `packages/shared/src/behaviour/schemas/parent-behaviour.schema.ts`

### Worker

- `apps/worker/src/processors/behaviour/digest-notifications.processor.ts`

### Frontend

- `apps/web/src/app/[locale]/(school)/behaviour/documents/page.tsx`
- `apps/web/src/app/[locale]/(parent)/behaviour/page.tsx`
- `apps/web/src/app/[locale]/(parent)/behaviour/recognition/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/behaviour-documents/page.tsx`

### Tests

- `apps/api/src/modules/behaviour/behaviour-document.service.spec.ts`
- `apps/api/src/modules/behaviour/behaviour-parent.service.spec.ts`

---

## Section 9 — Files to Modify

| File                                                            | Changes                                                                           |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `packages/prisma/schema.prisma`                                 | Add unique constraint on BehaviourDocumentTemplate                                |
| `packages/shared/src/behaviour/schemas/index.ts`                | Export new schema files                                                           |
| `apps/api/src/modules/behaviour/behaviour.module.ts`            | Register 3 new services + 2 new controllers, import PdfRenderingModule + S3Module |
| `apps/api/src/modules/behaviour/behaviour-config.controller.ts` | Add 3 document template endpoints                                                 |
| `apps/api/package.json`                                         | Add `handlebars` dependency                                                       |
| `apps/worker/src/worker.module.ts`                              | Register DigestNotificationsProcessor                                             |
| `packages/prisma/seed/behaviour-seed.ts`                        | Add 20 document template seeds                                                    |
| `architecture/module-blast-radius.md`                           | Update BehaviourModule imports (PdfRenderingModule, S3Module)                     |
| `architecture/event-job-catalog.md`                             | Add behaviour:digest-notifications job                                            |

---

## Section 10 — Key Context for Executor

### Prisma Enum Mapping Gotchas

- `DocumentStatus.draft_doc` maps to DB value `"draft"` — use `draft_doc` in Prisma code
- `DocumentStatus.sent_doc` maps to DB value `"sent"` — use `sent_doc` in Prisma code
- `DocumentType.custom_document` maps to DB value `"custom_document"` — spec says `custom`, code says `custom_document`

### PdfRenderingService Usage

- For dynamic Handlebars templates, use `renderFromHtml(html)` (not `renderPdf()` which requires registered templates)
- Puppeteer is already installed (v23.11.0)

### S3 Upload Pattern

- `s3Service.upload(tenantId, key, body, contentType)` — key is relative, tenantId is prepended automatically
- Key pattern: `behaviour/documents/${documentType}/${documentId}.pdf`
- Download via presigned URL: `s3Service.getPresignedUrl(fullKey, 900)` (15 min)

### Parent Portal Authentication

- Parent routes use same JWT auth but check role = parent
- Parent ID resolved from JWT `sub` (user_id) → `parents.user_id` join
- Every parent endpoint must scope to parent's own children via `student_parents` join

### Guardian Restriction Check Pattern

```typescript
const restricted = await db.behaviourGuardianRestriction.findFirst({
  where: {
    tenant_id: tenantId,
    student_id: studentId,
    parent_id: parentId,
    restriction_type: { in: ['no_behaviour_visibility', 'no_behaviour_notifications'] },
    status: 'active_restriction',
    effective_from: { lte: today },
    OR: [{ effective_until: null }, { effective_until: { gte: today } }],
  },
});
```

Note: Status uses Prisma enum `active_restriction` (not `active`).

### Parent-Safe Rendering Priority Chain

1. `parent_description` (or `parent_description_ar` if parent locale is ar)
2. Template text from `context_snapshot.description_template_text`
3. Category name + date fallback

### Amendment Correction Chain Integration

Phase C's `BehaviourAmendmentsService` already creates `behaviour_amendment_notices` records. Phase G wires the notification dispatch: when `correction_notification_sent = false` and a correction is triggered, create acknowledgement row with `amendment_notice_id`.
