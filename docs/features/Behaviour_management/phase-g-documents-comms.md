# Phase G: Documents + Comms — Implementation Spec

> **Module**: `modules/behaviour/`
> **Phase**: G of H
> **Spec source**: behaviour-management-spec-v5-master.md sections 2.1, 3.7, 3.11, 3.12, 3.13, 8.10, 8.11, 8.14, 9, 10, 13, 16

---

## Prerequisites

The following phases must be fully deployed and regression-tested before Phase G work begins:

| Phase | Required Components                                                                                                                                                                            |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | Prisma schema (all 32 tables), incidents CRUD, categories, parent_description workflow, send-gate, parent_description_locked, behaviour_amendment_notices table, data classification framework |
| **C** | Sanctions full lifecycle, exclusion cases, appeals with outcome packaging — these are the primary targets for document generation                                                              |
| **D** | behaviour_attachments with signed URL pipeline — Phase G documents share the same S3 infrastructure                                                                                            |

Phase G does not depend on Phase B (policy engine), Phase E (recognition), or Phase F (analytics).

---

## Objectives

1. Implement the document generation engine — Handlebars templates rendered to PDF via Puppeteer, stored in S3, tracked in `behaviour_documents`.
2. Implement document template management — system templates per locale, school customisation, merge field reference.
3. Wire the parent portal behaviour view with hardened parent-safe content rendering.
4. Implement guardian visibility checks in the portal and notification dispatcher.
5. Implement the notification digest worker (daily batched parent notifications).
6. Implement the amendment correction chain — when a correction notice is dispatched after an amendment, the `behaviour_parent_acknowledgements` table is updated with the `amendment_notice_id` link.
7. Expose all document and parent-behaviour endpoints.
8. Seed ~20 document templates (10 types × 2 locales).

---

## Tables

### `behaviour_documents`

Generated formal documents — detention notices, suspension letters, appeal decisions, board packs.

| Column              | Type                                                                                                                                                                                                                                                      | Notes                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `id`                | UUID PK                                                                                                                                                                                                                                                   | `gen_random_uuid()`                                                        |
| `tenant_id`         | UUID FK NOT NULL                                                                                                                                                                                                                                          | RLS                                                                        |
| `document_type`     | ENUM('detention_notice', 'suspension_letter', 'return_meeting_letter', 'behaviour_contract', 'intervention_summary', 'appeal_hearing_invite', 'appeal_decision_letter', 'exclusion_notice', 'exclusion_decision_letter', 'board_pack', 'custom') NOT NULL |                                                                            |
| `template_id`       | UUID FK NULL                                                                                                                                                                                                                                              | -> `behaviour_document_templates`                                          |
| `entity_type`       | ENUM('incident', 'sanction', 'intervention', 'appeal', 'exclusion_case') NOT NULL                                                                                                                                                                         | Source entity                                                              |
| `entity_id`         | UUID NOT NULL                                                                                                                                                                                                                                             | FK to source entity                                                        |
| `student_id`        | UUID FK NOT NULL                                                                                                                                                                                                                                          | -> `students`                                                              |
| `generated_by_id`   | UUID FK NOT NULL                                                                                                                                                                                                                                          | -> `users`                                                                 |
| `generated_at`      | TIMESTAMPTZ NOT NULL                                                                                                                                                                                                                                      |                                                                            |
| `file_key`          | VARCHAR(500) NOT NULL                                                                                                                                                                                                                                     | S3 key (PDF)                                                               |
| `file_size_bytes`   | BIGINT NOT NULL                                                                                                                                                                                                                                           |                                                                            |
| `sha256_hash`       | VARCHAR(64) NOT NULL                                                                                                                                                                                                                                      | Integrity verification — computed before S3 upload                         |
| `locale`            | VARCHAR(5) NOT NULL DEFAULT 'en'                                                                                                                                                                                                                          | 'en' or 'ar'                                                               |
| `data_snapshot`     | JSONB NOT NULL                                                                                                                                                                                                                                            | All merge-field values frozen at generation time. Immutable after creation |
| `status`            | ENUM('draft', 'finalised', 'sent', 'superseded') DEFAULT 'draft'                                                                                                                                                                                          |                                                                            |
| `sent_at`           | TIMESTAMPTZ NULL                                                                                                                                                                                                                                          |                                                                            |
| `sent_via`          | ENUM('email', 'whatsapp', 'in_app', 'print') NULL                                                                                                                                                                                                         |                                                                            |
| `superseded_by_id`  | UUID FK NULL                                                                                                                                                                                                                                              | -> `behaviour_documents` — set when amendment generates replacement        |
| `superseded_reason` | TEXT NULL                                                                                                                                                                                                                                                 |                                                                            |
| `created_at`        | TIMESTAMPTZ NOT NULL DEFAULT now()                                                                                                                                                                                                                        |                                                                            |

**RLS**: `tenant_id` enforced. Access also requires `behaviour.view` permission minimum; `behaviour.manage` to finalise or send.

**No update to `data_snapshot` after creation** — the snapshot is the forensic record of exactly what was in the document. If the underlying data changes, a new document is generated and the old one is marked `superseded`.

---

### `behaviour_document_templates`

Configurable Handlebars templates per tenant for formal documents.

| Column          | Type                                                      | Notes                                                                                                                     |
| --------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `id`            | UUID PK                                                   | `gen_random_uuid()`                                                                                                       |
| `tenant_id`     | UUID FK NOT NULL                                          | RLS                                                                                                                       |
| `document_type` | ENUM — same values as `behaviour_documents.document_type` | One active template per type per locale per tenant is the convention; multiple allowed                                    |
| `name`          | VARCHAR(200) NOT NULL                                     | Display name, e.g. "Suspension Letter (English)"                                                                          |
| `locale`        | VARCHAR(5) NOT NULL DEFAULT 'en'                          | 'en' or 'ar'                                                                                                              |
| `template_body` | TEXT NOT NULL                                             | Handlebars template. Supports `{{merge_field}}`, `{{#if condition}}`, `{{#each list}}`. See merge fields below            |
| `merge_fields`  | JSONB NOT NULL                                            | `[{ field_name: string, source: string, description: string }]` — documents available merge fields for this template type |
| `is_active`     | BOOLEAN DEFAULT true                                      | Inactive templates not shown in generation UI but retained for historical document re-render                              |
| `is_system`     | BOOLEAN DEFAULT false                                     | System templates provided at tenant provisioning. Schools can deactivate but not delete them                              |
| `created_at`    | TIMESTAMPTZ NOT NULL DEFAULT now()                        |                                                                                                                           |
| `updated_at`    | TIMESTAMPTZ NOT NULL DEFAULT now()                        |                                                                                                                           |

**Template engine**: Handlebars. Supports:

- Simple replacement: `{{student_name}}`, `{{sanction_date}}`
- Conditionals: `{{#if suspension_days}}` / `{{/if}}`
- Loops: `{{#each evidence_list}}` / `{{/each}}` for board packs
- HTML is rendered in the template body; Puppeteer converts to PDF

**UNIQUE constraint**: `(tenant_id, document_type, locale, name)` — prevents duplicate template names per type/locale.

**Seed data**: 20 system templates seeded at tenant provisioning — one per document type per locale (en + ar). See Seed Data section.

---

### `behaviour_parent_acknowledgements`

Tracks parent acknowledgement of behaviour notifications. Append-only — records are never updated, only new rows inserted.

| Column                   | Type                                                       | Notes                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                     | UUID PK                                                    | `gen_random_uuid()`                                                                                                                                                     |
| `tenant_id`              | UUID FK NOT NULL                                           | RLS                                                                                                                                                                     |
| `incident_id`            | UUID FK NULL                                               | -> `behaviour_incidents`. NULL when acknowledgement is for a sanction only                                                                                              |
| `sanction_id`            | UUID FK NULL                                               | -> `behaviour_sanctions`. NULL when for incident only                                                                                                                   |
| `amendment_notice_id`    | UUID FK NULL                                               | -> `behaviour_amendment_notices`. Set when this acknowledgement is a re-acknowledgement triggered by an amendment. Links the correction to its prior notification chain |
| `parent_id`              | UUID FK NOT NULL                                           | -> `parents`                                                                                                                                                            |
| `notification_id`        | UUID FK NULL                                               | -> `notifications` — the outbound notification that triggered this tracking row                                                                                         |
| `channel`                | ENUM('email', 'whatsapp', 'in_app') NOT NULL               | Channel used for this send                                                                                                                                              |
| `sent_at`                | TIMESTAMPTZ NOT NULL                                       | When the notification was dispatched                                                                                                                                    |
| `delivered_at`           | TIMESTAMPTZ NULL                                           | Delivery webhook from comms module                                                                                                                                      |
| `read_at`                | TIMESTAMPTZ NULL                                           | Read receipt (in-app: on open; email: pixel)                                                                                                                            |
| `acknowledged_at`        | TIMESTAMPTZ NULL                                           | Parent actively tapped/clicked "Acknowledge"                                                                                                                            |
| `acknowledgement_method` | ENUM('in_app_button', 'email_link', 'whatsapp_reply') NULL | How they acknowledged                                                                                                                                                   |
| `created_at`             | TIMESTAMPTZ NOT NULL DEFAULT now()                         |                                                                                                                                                                         |

**Append-only**: The service never updates existing rows. Delivery webhooks, read receipts, and acknowledgements each update the relevant nullable columns on the existing row via `UPDATE WHERE id = ?`. The table is otherwise insert-only from the application perspective — no business logic deletes rows.

**`amendment_notice_id` usage**: When an amendment is made to a previously-notified record and `requires_parent_reacknowledgement = true`, the `behaviour:parent-notification` worker creates a new `behaviour_parent_acknowledgements` row with `amendment_notice_id` pointing to the `behaviour_amendment_notices` record. This allows querying "all re-acknowledgements triggered by amendment X" directly.

**Partitioned**: Monthly range partition on `created_at`. See Phase H for partition management details.

---

## Business Logic

### Document Generation Engine (Section 3.13)

The document generation engine is the central service for Phase G. It is implemented as `BehaviourDocumentService` in `apps/api/src/modules/behaviour/services/behaviour-document.service.ts`.

#### Supported Document Types with Triggers and Auto-Generate Flags

| Type                        | Trigger                                        | Auto-generate?            | Setting Key                                |
| --------------------------- | ---------------------------------------------- | ------------------------- | ------------------------------------------ |
| `detention_notice`          | Detention sanction created                     | Optional (off by default) | `document_auto_generate_detention_notice`  |
| `suspension_letter`         | Suspension sanction created                    | Default on                | `document_auto_generate_suspension_letter` |
| `return_meeting_letter`     | Return meeting scheduled on sanction           | Manual only               | —                                          |
| `behaviour_contract`        | Intervention with contract type created        | Manual only               | —                                          |
| `intervention_summary`      | For parent meeting preparation                 | Manual only               | —                                          |
| `appeal_hearing_invite`     | Hearing date set on `behaviour_appeals`        | Auto (always)             | —                                          |
| `appeal_decision_letter`    | Appeal decided (outcome recorded)              | Auto (always)             | —                                          |
| `exclusion_notice`          | Exclusion case `initiated` status              | Auto (always)             | `document_auto_generate_exclusion_notice`  |
| `exclusion_decision_letter` | Exclusion case `decision_made` status          | Auto (always)             | —                                          |
| `board_pack`                | Manual trigger from exclusion case detail page | Manual only               | —                                          |

Auto-generate means the service calls `generateDocument()` inline during the triggering service method (e.g. `createSanction()`), without requiring a separate API call. Manual types are triggered by `POST v1/behaviour/documents/generate`.

#### Generation Pipeline — 8 Steps

Every document, auto or manual, goes through this pipeline in order:

**Step 1 — Load template**

```typescript
const template = await tx.behaviour_document_templates.findFirst({
  where: {
    tenant_id: tenantId,
    document_type: documentType,
    locale: targetLocale,
    is_active: true,
  },
  orderBy: { is_system: 'asc' }, // school custom templates take priority over system
});
if (!template)
  throw new NotFoundException(`No active template for ${documentType}/${targetLocale}`);
```

**Step 2 — Populate merge fields from entity + student + school context**

Load the source entity (incident, sanction, intervention, appeal, or exclusion_case) and resolve all merge fields. Merge fields are drawn from:

- The source entity's `context_snapshot` / `data_snapshot` JSONB (immutable, already populated at entity creation)
- The current student record (name, year group, date of birth where needed)
- The school profile (`tenant_settings.school_name`, `tenant_settings.principal_name`, `tenant_settings.school_logo_url`)
- Today's date in tenant timezone
- The target entity's specific fields (e.g. `sanction.suspension_start_date`, `appeal.decision_reasoning`)

All resolved merge field values are collected into a plain `data_snapshot` object that is stored immutably on the resulting `behaviour_documents` record.

**Step 3 — Handlebars render to HTML**

```typescript
const compiledTemplate = Handlebars.compile(template.template_body);
const renderedHtml = compiledTemplate(dataSnapshot);
```

Handlebars is configured with `strict: true` (unresolved merge fields throw, not silently blank). RTL support: when `locale = 'ar'`, the template body includes `<html dir="rtl" lang="ar">` wrapper. Noto Sans Arabic is loaded as a web font in the Puppeteer rendering context.

**Step 4 — PDF generation via Puppeteer**

Use the existing `PdfRenderingService` (already used elsewhere in the codebase):

```typescript
const pdfBuffer = await pdfRenderingService.renderHtmlToPdf(renderedHtml, {
  format: 'A4',
  margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
  printBackground: true,
});
```

For board packs, the page count and table of contents are generated by Puppeteer's multi-page support. The `{{page_number}}` and `{{total_pages}}` merge fields are injected via Puppeteer's header/footer template feature.

**Step 5 — SHA-256 hash**

```typescript
const sha256Hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
```

The hash is stored on the `behaviour_documents` record and can be used by the document recipient to verify the PDF has not been tampered with.

**Step 6 — S3 upload**

```typescript
const fileKey = `tenants/${tenantId}/behaviour/documents/${documentType}/${documentId}.pdf`;
await s3Service.upload(fileKey, pdfBuffer, {
  ContentType: 'application/pdf',
  ContentDisposition: 'attachment',
  ServerSideEncryption: 'AES256',
  // ACL: private (no public access)
});
```

**Step 7 — Create `behaviour_documents` DB record**

```typescript
const document = await tx.behaviour_documents.create({
  data: {
    id: documentId, // pre-generated to use as the S3 key before upload
    tenant_id: tenantId,
    document_type: documentType,
    template_id: template.id,
    entity_type: entityType,
    entity_id: entityId,
    student_id: studentId,
    generated_by_id: generatedById,
    generated_at: new Date(),
    file_key: fileKey,
    file_size_bytes: BigInt(pdfBuffer.length),
    sha256_hash: sha256Hash,
    locale: targetLocale,
    data_snapshot: dataSnapshot,
    status: 'draft',
  },
});
```

**Step 8 — Status is `draft`**

The document is created with `status = 'draft'`. For auto-generated documents (suspension letters, exclusion notices, appeal invites), a notification is sent to the relevant staff member (year head / case owner) informing them a document is ready for review. They review via the document detail page, optionally edit the underlying template for this specific instance (not the master template), then call `PATCH /documents/:id/finalise` to move it to `finalised`. Only finalised documents can be sent to parents.

**Locale selection rule**:

- Parent-facing documents: generate in the parent's preferred locale (`parent.locale_preference`). If `parent_description_ar` is NULL and locale is 'ar', fall back to 'en'.
- Staff-internal documents (board packs, intervention summaries): generate in the requesting staff member's locale.

---

### Document Template Management

**System templates** are seeded at tenant provisioning (see Seed Data section). They are marked `is_system = true` and cannot be deleted, but can be deactivated (`is_active = false`) and replaced by school-custom templates.

**School customisation**: Schools create their own templates via the `/settings/behaviour-documents` page. A school-custom template for a given `(document_type, locale)` takes priority over the system template during generation (the `findFirst` query orders by `is_system ASC`, so `is_system = false` rows sort first).

**Merge field reference**: Each template record stores a `merge_fields` JSONB array that lists the available merge fields for that document type. This array powers the merge field picker in the template editor UI — staff click to insert `{{field_name}}` without typing it manually. The `merge_fields` array is populated by the system and cannot be edited by schools (it is a reference, not configuration).

#### Available Merge Fields (All Document Types)

The following fields are available across all document types:

| Merge Field                     | Source                                      | Description                                         |
| ------------------------------- | ------------------------------------------- | --------------------------------------------------- |
| `{{student_name}}`              | `student_snapshot.student_name`             | Student full name                                   |
| `{{student_year_group}}`        | `student_snapshot.year_group_name`          | e.g. "Year 9"                                       |
| `{{student_class}}`             | `student_snapshot.class_name`               | Class name                                          |
| `{{student_dob}}`               | `students.date_of_birth`                    | Date of birth (formatted)                           |
| `{{incident_date}}`             | `behaviour_incidents.occurred_at`           | Formatted in tenant timezone                        |
| `{{incident_category}}`         | `context_snapshot.category_name`            | e.g. "Verbal Warning"                               |
| `{{incident_description}}`      | `behaviour_incidents.parent_description`    | Parent-safe description only                        |
| `{{incident_location}}`         | `behaviour_incidents.location`              | Location if recorded                                |
| `{{sanction_type}}`             | `behaviour_sanctions.type`                  | e.g. "Suspension (External)"                        |
| `{{sanction_date}}`             | `behaviour_sanctions.scheduled_date`        | Formatted date                                      |
| `{{sanction_start_date}}`       | `behaviour_sanctions.suspension_start_date` |                                                     |
| `{{sanction_end_date}}`         | `behaviour_sanctions.suspension_end_date`   |                                                     |
| `{{suspension_days}}`           | `behaviour_sanctions.suspension_days`       | Integer                                             |
| `{{return_conditions}}`         | `behaviour_sanctions.return_conditions`     | Return conditions text                              |
| `{{appeal_grounds}}`            | `behaviour_appeals.grounds`                 |                                                     |
| `{{appeal_hearing_date}}`       | `behaviour_appeals.hearing_date`            | Formatted                                           |
| `{{appeal_decision}}`           | `behaviour_appeals.decision`                | e.g. "Upheld original"                              |
| `{{appeal_decision_reasoning}}` | `behaviour_appeals.decision_reasoning`      |                                                     |
| `{{school_name}}`               | `tenant_settings.school_name`               |                                                     |
| `{{school_address}}`            | `tenant_settings.school_address`            |                                                     |
| `{{school_logo_url}}`           | `tenant_settings.school_logo_url`           | For `<img>` in template                             |
| `{{principal_name}}`            | `tenant_settings.principal_name`            |                                                     |
| `{{today_date}}`                | `new Date()` in tenant timezone             | Formatted                                           |
| `{{academic_year}}`             | `academic_years.name`                       | e.g. "2025/26"                                      |
| `{{parent_name}}`               | `parents.full_name`                         | Primary guardian                                    |
| `{{parent_address}}`            | `parents.address`                           |                                                     |
| `{{evidence_list}}`             | `behaviour_attachments[]` (board pack only) | Array of `{ name, classification }` for `{{#each}}` |
| `{{intervention_goals}}`        | `behaviour_interventions.goals`             | Array for `{{#each}}`                               |

---

### Document Lifecycle

Documents move through four states. Transitions are one-directional:

```
draft -> finalised    (staff reviews and confirms)
finalised -> sent     (dispatched via notification channel or print)
finalised -> superseded (amendment generates replacement)
sent -> superseded    (amendment to a sent document)
```

**Rules**:

- Only `finalised` documents can be sent via `POST /documents/:id/send`.
- Sending a document dispatches it via the communications module using the channel specified in the request (`email`, `whatsapp`, `in_app`, or `print`). Print generates a second signed URL and logs the download as a "print" event in entity history.
- When an amendment supersedes a document: the original document's `status` is set to `superseded`, `superseded_by_id` is set to the new document's ID, and `superseded_reason` is set. The new document is generated fresh and starts at `draft`. Both versions are retained for audit.

---

### Parent Portal Safe Rendering (Section 3.7)

The parent behaviour portal (`/parent/behaviour`) renders incident data using a strict content priority chain. The rendering logic lives in `BehaviourParentService.renderIncidentForParent()` and is applied to every incident before it leaves the API.

#### Content Rendering Priority

```
Priority 1: if (incident.parent_description is not null and not empty)
              -> show incident.parent_description
              (locale: if parent's locale is 'ar' and parent_description_ar is not null,
               show parent_description_ar, else show parent_description)

Priority 2: else if (incident was created using a description template)
              -> show the template text
              (identified by checking context_snapshot for template usage flag;
               the template text is stored in context_snapshot.description_template_text
               at creation time for exactly this fallback purpose)

Priority 3: else
              -> show category name + date only
              (e.g. "Verbal Warning — 14 Nov 2025")
```

**Invariant**: No path in this priority chain ever returns the raw `description` field (internal staff description) to a parent. This is enforced at the service layer — the `renderIncidentForParent()` function does not even receive the `description` field in its input.

**What is never shown to a parent**:

- `description` (internal staff description) — never passed to parent rendering
- `context_notes` — never exposed in any parent surface
- Existence or content of any `behaviour_attachments` — the parent view contains no attachment references
- Names of other participants — the parent view shows only their own child's entry. Multi-student incidents appear in each parent's view as a single-student incident (their child only)

**Locale fallback chain** (applied in order):

1. Parent's `locale_preference` field
2. If `locale_preference = 'ar'` but `parent_description_ar IS NULL`: fall back to `parent_description` (en)
3. If both are NULL: fall back to category name in the appropriate locale (`behaviour_categories.name` or `behaviour_categories.name_ar`)

#### Guardian Restriction Checks

Before the portal or notification dispatcher renders or sends any behaviour data for a parent, the service executes an active restriction check:

```typescript
const activeRestriction = await tx.behaviour_guardian_restrictions.findFirst({
  where: {
    tenant_id: tenantId,
    student_id: studentId,
    parent_id: parentId,
    restriction_type: { in: ['no_behaviour_visibility', 'no_behaviour_notifications'] },
    status: 'active',
    effective_from: { lte: today },
    OR: [{ effective_until: null }, { effective_until: { gte: today } }],
  },
});
if (activeRestriction) {
  // Portal: return empty result set (no error, no indication of why)
  // Notifications: skip dispatch, do not create acknowledgement row
  return [];
}
```

The check is timezone-aware using the tenant's configured timezone for evaluating `effective_from` and `effective_until` date boundaries. The parent receives no indication that a restriction exists — the portal simply shows no behaviour data for that child.

---

### Notification Digest

When `parent_notification_digest_enabled = true` in tenant settings, individual parent notifications are batched rather than sent immediately.

**Digest worker** (`behaviour:digest-notifications`):

- Cron schedule: tenant-configured time in tenant timezone (default `16:00`)
- For each parent with pending behaviour notifications since the last digest:
  1. Load all unsent behaviour notifications for this parent (incidents + sanctions + awards from the last 24 hours)
  2. Apply guardian restriction check for each student in the batch
  3. Render each incident using the parent-safe rendering priority chain
  4. Compose a single digest notification containing all entries
  5. Dispatch via the parent's preferred channel
  6. Create `behaviour_parent_acknowledgements` rows for each incident/sanction in the batch, all with the same `notification_id` (the batch notification)
  7. Update each `behaviour_incidents.parent_notification_status` to `'sent'`

**Digest is disabled by default** (`parent_notification_digest_enabled: false`). When disabled, the `behaviour:parent-notification` worker sends notifications immediately upon incident creation per the existing per-event notification flow.

---

### Amendment Correction Chain

This business logic connects Phase C's `behaviour_amendment_notices` table to Phase G's notification and acknowledgement infrastructure.

**Trigger**: When a record is edited after a parent notification has already been sent (i.e. `parent_notification_status` is `sent`, `delivered`, `read`, or `acknowledged`), and the edit affects parent-visible fields (category, `parent_description`, sanction dates, or appeal outcome), the amendment workflow fires:

1. `behaviour_amendment_notices` record created (already handled in Phase C's `BehaviourAmendmentService`)
2. If `parent_description_locked = true`: the edit is blocked until a staff member with `behaviour.manage` explicitly calls the unlock endpoint with a reason. The unlock is logged in `behaviour_entity_history` with `change_type = 'parent_description_unlocked'`.
3. After unlock: staff writes the corrected `parent_description`.
4. Correction notification queued: `behaviour:parent-notification` worker creates a notification using template `behaviour_correction_parent`.
5. A new `behaviour_parent_acknowledgements` row is created with `amendment_notice_id` set to the amendment notice ID. This links the correction send to the amendment for audit purposes.
6. If the amendment's severity warrants re-acknowledgement (`requires_parent_reacknowledgement = true` on the notice): the notification uses template `behaviour_reacknowledgement_request` instead, prompting an explicit acknowledgement action.
7. `amendment_notice.correction_notification_sent` is set to `true`, `correction_notification_sent_at` set to now.
8. When the parent acknowledges: `amendment_notice.parent_reacknowledged_at` is set and the acknowledgement row's `acknowledged_at` is updated.

**Document supersession** (when a PDF was already sent):

1. The original `behaviour_documents` record's `status` -> `superseded`, `superseded_by_id` set to the new document's ID, `superseded_reason` set.
2. A new document is generated with an "Amended — [date]" watermark applied to the PDF header via Puppeteer.
3. The new document starts at `draft` and follows the normal finalise -> send lifecycle.
4. Both versions are permanently retained for audit.

---

## API Endpoints

### Documents (8.14) — `behaviour-documents.controller.ts`

**Base path**: `v1/behaviour/documents`

| Method  | Route           | Description                                      | Permission         | Notes                                                                                                                                                                                                                                  |
| ------- | --------------- | ------------------------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`  | `/generate`     | Generate document from template + source entity  | `behaviour.manage` | Body: `{ document_type, entity_type, entity_id, locale? }`. If `template_id` omitted, service auto-selects active template for type+locale. Returns created document record at `draft` status.                                         |
| `GET`   | `/`             | List documents with filters                      | `behaviour.view`   | Query: `entity_type`, `entity_id`, `student_id`, `document_type`, `status`, `page`, `pageSize`. Returns paginated `{ data: BehaviourDocument[], meta }`.                                                                               |
| `GET`   | `/:id`          | Document detail                                  | `behaviour.view`   | Includes `data_snapshot`, `template_id`, `status`, `sent_at`. Does NOT return a download URL — use the download endpoint.                                                                                                              |
| `PATCH` | `/:id/finalise` | Move document from `draft` to `finalised`        | `behaviour.manage` | Body empty or `{ notes? }`. Logs to `behaviour_entity_history`.                                                                                                                                                                        |
| `POST`  | `/:id/send`     | Send finalised document via notification channel | `behaviour.manage` | Body: `{ channel: 'email' \| 'whatsapp' \| 'in_app' \| 'print', recipient_parent_id? }`. Only allowed if `status = 'finalised'`. Creates `behaviour_parent_acknowledgements` row. Dispatches via comms module. Sets `status = 'sent'`. |
| `GET`   | `/:id/download` | Download PDF — returns pre-signed S3 URL         | `behaviour.view`   | URL valid for 15 minutes. Generates audit log entry.                                                                                                                                                                                   |

**Response shape** (document record):

```typescript
interface BehaviourDocumentResponse {
  id: string;
  document_type: string;
  template_id: string | null;
  entity_type: string;
  entity_id: string;
  student_id: string;
  generated_by_id: string;
  generated_at: string; // ISO timestamp
  file_size_bytes: number;
  sha256_hash: string;
  locale: string;
  data_snapshot: Record<string, unknown>;
  status: 'draft' | 'finalised' | 'sent' | 'superseded';
  sent_at: string | null;
  sent_via: string | null;
  superseded_by_id: string | null;
  superseded_reason: string | null;
  created_at: string;
}
```

---

### Parent Behaviour (8.11) — `parent-behaviour.controller.ts`

**Base path**: `v1/parent/behaviour`
**Auth**: Parent JWT. All endpoints implicitly scoped to the authenticated parent's children. Guardian restrictions enforced on every endpoint before returning data.

| Method | Route                              | Description                                      | Permission    | Notes                                                                                                                                                                                                                        |
| ------ | ---------------------------------- | ------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/summary`                         | Per-child summary cards                          | `parent` role | Returns array of child summaries: `{ student_id, student_name, positive_count_7d, negative_count_7d, points_total, pending_acknowledgements }`. One entry per child. Restriction check applied per child.                    |
| `GET`  | `/incidents`                       | Paginated incident list for authenticated parent | `parent` role | Query: `student_id` (required — one child at a time), `page`, `pageSize`. Returns incidents using parent-safe rendering priority. Never returns `description`, `context_notes`, other participant names, or attachment info. |
| `GET`  | `/points-awards`                   | Points total and recent awards for a child       | `parent` role | Query: `student_id`. Returns: `{ points_total, points_change_7d, awards: [{ award_type_name, awarded_at, tier_level }] }`                                                                                                    |
| `GET`  | `/sanctions`                       | Upcoming and recent sanctions for a child        | `parent` role | Query: `student_id`. Returns: `{ upcoming: BehaviourSanctionParentView[], recent: BehaviourSanctionParentView[] }`. Only sanction type, date, and status exposed (no internal notes).                                        |
| `POST` | `/acknowledge/:acknowledgement_id` | Parent acknowledges a notification               | `parent` role | Sets `acknowledged_at` and `acknowledgement_method` on the `behaviour_parent_acknowledgements` row. If `amendment_notice_id` is set, also sets `amendment_notice.parent_reacknowledged_at`.                                  |
| `GET`  | `/recognition`                     | School recognition wall (published awards)       | `parent` role | Returns published recognition wall items. Respects `recognition_wall_public` setting.                                                                                                                                        |

**Parent-safe field contract** (enforced at service layer for all parent behaviour endpoints):

- `description` field is NEVER included in any response
- `context_notes` is NEVER included
- `parent_description` is returned as `incident_description` (renamed to remove internal terminology)
- `reported_by_id` / `reported_by_name` omitted when `parent_visibility_show_teacher_name = false`
- No attachment metadata (not even file counts)
- Participant list contains only the authenticated parent's child; all other participant entries stripped

---

### Document Templates (from 8.10) — `behaviour-config.controller.ts`

These three endpoints are part of the configuration controller, which is the home for all settings-tier endpoints.

**Base path**: `v1/behaviour/document-templates`

| Method  | Route  | Description                         | Permission        | Notes                                                                                                                                                                                                                                 |
| ------- | ------ | ----------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/`    | List all templates for the tenant   | `behaviour.admin` | Returns all templates including system and custom, active and inactive. Query: `document_type?`, `locale?`, `is_active?`.                                                                                                             |
| `POST`  | `/`    | Create a new school-custom template | `behaviour.admin` | Body: `{ document_type, name, locale, template_body, merge_fields }`. School cannot create `is_system = true` templates.                                                                                                              |
| `PATCH` | `/:id` | Update a template                   | `behaviour.admin` | Allowed on both system and custom templates. System templates: only `is_active` and `template_body` can be changed (name, document_type, locale, merge_fields are locked on system templates). Custom templates: all fields editable. |

---

## Frontend Pages

### `/behaviour/documents`

**Purpose**: Staff-facing document list — all generated notices, letters, and packs.

**Layout**:

- Filter bar: document type (multi-select), status (draft/finalised/sent/superseded), date range, student search
- Results table: columns — student name, document type, generated at, status, generated by, actions (view, download, finalise, send)
- Draft documents show a yellow "Needs review" badge
- Superseded documents shown with strikethrough and link to replacement
- "Generate Document" button — opens modal to select entity + document type

**Mobile**: Table collapses to card layout. Each card shows student name, document type, status, primary action button.

**Permissions**: Requires `behaviour.view`. Finalise/send actions require `behaviour.manage`.

---

### `/parent/behaviour`

**Purpose**: Per-child behaviour summary for the authenticated parent.

**Layout**:

- If multiple children: tab bar at top (one tab per child)
- Per child:
  - Summary card: points total with sparkline, positive/negative counts (last 30 days), pending acknowledgements badge
  - "Incidents" section: paginated list using parent-safe rendering (parent_description or template text or category+date)
  - "Upcoming" section: upcoming sanctions (type + date)
  - "Recognition" section: recent awards earned
  - Acknowledgement prompts: if `pending_acknowledgements > 0`, show inline action cards with "Acknowledge" button

**Content rules enforced in UI** (in addition to API-layer rules):

- No "Description" label shown — rendered content is presented without labelling it as a description
- No "Teacher" information shown unless `parent_visibility_show_teacher_name = true`
- No "other students involved" shown

**Guardian restriction**: If a restriction is active, the child's tab shows a friendly message: "Behaviour information is not available for this child at this time." No further detail.

**Mobile**: Full 375px support. Tab bar scrollable. Incident cards stack vertically. Acknowledgement button is a full-width CTA.

**RTL**: Full logical-property classes. Arabic incidents render with `dir="rtl"` on the text container.

---

### `/parent/behaviour/recognition`

**Purpose**: School recognition wall — published positive awards visible to parents.

**Layout**:

- Wall of achievement cards, newest first
- Card: student first name + last initial, award type name, award icon, date
- If `recognition_wall_public = false`: only visible to authenticated parents
- If `recognition_wall_requires_consent = true`: only awards with granted consent appear
- No detailed incident information — awards only

**Mobile**: 2-column grid at ≥sm, single column below.

---

### `/settings/behaviour-documents`

**Purpose**: Document template editor — school admins customise formal document templates.

**Layout**:

- Left panel: template list grouped by document type
  - Each type expandable to show en + ar templates
  - System templates shown with lock icon (partially editable)
  - Custom templates shown with edit/delete actions
  - "Add custom template" button per type
- Right panel: template editor
  - Template name input
  - Locale selector
  - Handlebars editor (CodeMirror or Monaco with syntax highlighting)
  - Merge field reference panel: collapsible list of available `{{fields}}` for this document type, click to insert
  - Preview button: renders the template with dummy data to show approximate output
  - "Save" button — updates template body

**Merge field reference panel** shows the `merge_fields` JSONB array from the template record. Fields are grouped by source (student, incident, sanction, school, etc.).

**Validation**: The save action validates that all `{{field_name}}` references in the template body exist in the template's `merge_fields` array. Unknown fields are highlighted as errors.

**Mobile**: On small screens, the two-panel layout stacks vertically (list above, editor below). The merge field panel collapses to a slide-up drawer.

---

## Worker Jobs

### `behaviour:digest-notifications`

| Property    | Value                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Queue**   | `notifications`                                                                                                                      |
| **Trigger** | Cron at tenant-configured time (`parent_notification_digest_time` setting, default `16:00`), evaluated per-tenant in tenant timezone |
| **Class**   | Extends `TenantAwareJob` — tenant_id in payload, RLS set before DB access                                                            |
| **Payload** | `{ tenant_id: string }`                                                                                                              |

**Processing**:

1. Load all parents for this tenant with at least one pending unsent behaviour notification
2. For each parent:
   a. Load their linked students
   b. For each student, apply guardian restriction check
   c. Load all behaviour incidents created since last digest where `parent_notification_status = 'pending'` and `parent_visible = true`
   d. Apply parent-safe rendering (priority chain) to each incident
   e. Load pending sanctions for the parent's notification
   f. Compose a single digest message (template: `behaviour_acknowledgement_request` if any require acknowledgement, else `behaviour_negative_parent` / `behaviour_positive_parent` as appropriate)
   g. Dispatch via the parent's preferred channel via the communications module
   h. Create `behaviour_parent_acknowledgements` rows for each incident/sanction in the batch
   i. Update each incident's `parent_notification_status` to `'sent'`
3. Log: number of parents notified, total notifications sent, any failures

**Error handling**: If an individual parent's digest fails (e.g. bad phone number), log the error, mark that parent's items as failed, continue processing other parents. Do not abort the entire tenant's digest on a single parent failure.

**Dedup guard**: Check `behaviour_parent_acknowledgements` for rows with the same `incident_id` + `parent_id` created today before sending. If already sent today (e.g. from a non-digest channel), skip.

---

## Notification Templates

### `behaviour_acknowledgement_request`

| Property         | Value                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Trigger**      | Incident with severity >= `parent_acknowledgement_required_severity` sent to parent (direct or digest)                                                                                      |
| **Channels**     | In-app (always) + email                                                                                                                                                                     |
| **Subject (en)** | "Please acknowledge: [category name] — [student first name]"                                                                                                                                |
| **Subject (ar)** | "يرجى التأكيد: [اسم الفئة] — [اسم الطالب]"                                                                                                                                                  |
| **Body (en)**    | "A behaviour incident has been recorded for [student name] on [date]. Category: [category]. [parent_description or template text]. Please tap 'Acknowledge' to confirm you have seen this." |
| **Body (ar)**    | Arabic equivalent using `parent_description_ar` if available                                                                                                                                |
| **Action**       | "Acknowledge" button — calls `POST v1/parent/behaviour/acknowledge/:acknowledgement_id`                                                                                                     |

**Note**: Other notification templates referenced in Phase G (`behaviour_correction_parent`, `behaviour_reacknowledgement_request`) are triggered by the amendment correction chain but are defined in the master notification templates list (section 13 of the master spec). Phase G implements the wiring; the template shell is defined once at module initialisation.

---

## Seed Data

### ~20 Document Templates (10 types × 2 locales)

The following system templates are seeded at tenant provisioning. All have `is_system = true`, `is_active = true`.

Each template body is a Handlebars HTML string. The actual template bodies should be written in full during implementation with proper school letterhead structure (logo, school name, date, recipient address, body, signature block). What follows is the content structure per type:

| Template                       | Locale | Document Type               | Key Merge Fields Used                                                                                                                                                                                   |
| ------------------------------ | ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Detention Notice (en)          | en     | `detention_notice`          | student_name, student_year_group, sanction_date, school_name, principal_name, today_date                                                                                                                |
| Detention Notice (ar)          | ar     | `detention_notice`          | Same fields, RTL wrapper                                                                                                                                                                                |
| Suspension Letter (en)         | en     | `suspension_letter`         | student_name, sanction_start_date, sanction_end_date, suspension_days, incident_category, incident_description, return_conditions, school_name, principal_name, today_date, parent_name, parent_address |
| Suspension Letter (ar)         | ar     | `suspension_letter`         | Same, RTL wrapper                                                                                                                                                                                       |
| Return Meeting Letter (en)     | en     | `return_meeting_letter`     | student_name, sanction_end_date, return_conditions, school_name, today_date                                                                                                                             |
| Return Meeting Letter (ar)     | ar     | `return_meeting_letter`     | Same, RTL wrapper                                                                                                                                                                                       |
| Behaviour Contract (en)        | en     | `behaviour_contract`        | student_name, intervention_goals, today_date, school_name                                                                                                                                               |
| Behaviour Contract (ar)        | ar     | `behaviour_contract`        | Same, RTL wrapper                                                                                                                                                                                       |
| Intervention Summary (en)      | en     | `intervention_summary`      | student_name, student_year_group, today_date, intervention_goals, school_name                                                                                                                           |
| Intervention Summary (ar)      | ar     | `intervention_summary`      | Same, RTL wrapper                                                                                                                                                                                       |
| Appeal Hearing Invite (en)     | en     | `appeal_hearing_invite`     | student_name, appeal_grounds, appeal_hearing_date, school_name, today_date, parent_name                                                                                                                 |
| Appeal Hearing Invite (ar)     | ar     | `appeal_hearing_invite`     | Same, RTL wrapper                                                                                                                                                                                       |
| Appeal Decision Letter (en)    | en     | `appeal_decision_letter`    | student_name, appeal_grounds, appeal_hearing_date, appeal_decision, appeal_decision_reasoning, school_name, today_date                                                                                  |
| Appeal Decision Letter (ar)    | ar     | `appeal_decision_letter`    | Same, RTL wrapper                                                                                                                                                                                       |
| Exclusion Notice (en)          | en     | `exclusion_notice`          | student_name, sanction_type, sanction_start_date, incident_category, return_conditions, school_name, principal_name, today_date, parent_name, parent_address                                            |
| Exclusion Notice (ar)          | ar     | `exclusion_notice`          | Same, RTL wrapper                                                                                                                                                                                       |
| Exclusion Decision Letter (en) | en     | `exclusion_decision_letter` | student_name, appeal_decision, appeal_decision_reasoning, today_date, school_name, principal_name                                                                                                       |
| Exclusion Decision Letter (ar) | ar     | `exclusion_decision_letter` | Same, RTL wrapper                                                                                                                                                                                       |
| Board Pack (en)                | en     | `board_pack`                | student_name, student_year_group, academic_year, today_date, incident_category, incident_description, sanction_type, suspension_days, evidence_list, school_name                                        |
| Board Pack (ar)                | ar     | `board_pack`                | Same, RTL wrapper                                                                                                                                                                                       |

---

## Acceptance Criteria

1. `POST v1/behaviour/documents/generate` with a valid sanction entity produces a PDF in S3 with a correct SHA-256 hash, a `draft` status `behaviour_documents` record, and a `data_snapshot` containing all resolved merge fields.
2. Calling `PATCH /documents/:id/finalise` transitions status to `finalised` and creates an entity history entry.
3. Calling `POST /documents/:id/send` with `channel: 'email'` dispatches the notification, creates a `behaviour_parent_acknowledgements` row, and transitions status to `sent`.
4. When `document_auto_generate_suspension_letter = true` and a suspension sanction is created, a document is auto-generated without a manual API call.
5. `GET v1/parent/behaviour/incidents?student_id=X` never returns `description`, `context_notes`, attachment info, or other participant names for any incident.
6. Content rendering priority: if `parent_description` is set, it is returned; if not but a template was used, template text is returned; otherwise category + date only.
7. Parent portal returns an empty result set (not an error) when a guardian restriction with matching type is active for a student/parent pair.
8. When `parent_notification_digest_enabled = true`, `behaviour:digest-notifications` job sends one batched notification per parent per day instead of per-event notifications.
9. When an amendment is made to a sent incident, a new `behaviour_parent_acknowledgements` row is created with `amendment_notice_id` set. The original document is marked `superseded` and a new document is generated with the "Amended" watermark.
10. `/settings/behaviour-documents` lists all system and custom templates, allows editing template bodies, and validates that merge field references exist in the merge_fields array.
11. All 20 seed templates are present and active after tenant provisioning.

---

## Test Requirements

### Unit Tests

- `BehaviourDocumentService.generateDocument()` — test all 10 document types with mock entity data, verify merge field resolution, verify `data_snapshot` populated correctly
- `BehaviourParentService.renderIncidentForParent()` — test all three priority paths (parent_description, template text, category fallback)
- `BehaviourParentService.renderIncidentForParent()` — test locale fallback chain (ar with null `parent_description_ar`, both null)
- `GuardianRestrictionService.checkRestriction()` — test `effective_from` / `effective_until` boundaries, test all restriction types

### Integration Tests

- `POST /documents/generate` — happy path for sanction, appeal, exclusion_case source entities
- `POST /documents/generate` — returns 404 when no active template exists for the type+locale
- `POST /documents/:id/send` — blocked when `status = 'draft'`
- `GET /parent/behaviour/incidents` — never returns `description` field regardless of data in DB
- `GET /parent/behaviour/incidents` — returns empty array when guardian restriction is active
- `POST /parent/behaviour/acknowledge/:id` — sets `acknowledged_at` and `acknowledgement_method`

### Release-Gate Tests (Phase H)

Phase H's 15.4 Parent-Safe Rendering suite covers this phase's parent portal logic. Phase G must pass all tests in 15.4 before Phase H begins.
