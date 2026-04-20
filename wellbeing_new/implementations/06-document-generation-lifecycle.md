# Implementation 06 — Document Generation Lifecycle

> **Wave:** 3 (parallel-safe — owns endpoints under `apps/api/src/modules/behaviour/documents/`)
> **Classification:** backend + worker
> **Depends on:** 01, 04
> **Deploys:** API + worker restart

---

## Goal

The behaviour module backend has a full document generation infrastructure (templates, render flow, multi-channel send) per the audit, but the UI never reaches it. Six documents in the catalog: detention notice, suspension letter, exclusion notice, decision letter, board pack, and parent-meeting summary. This impl audits the existing `behaviour_documents`, `behaviour_document_templates`, and document state machine (`generating → draft_doc → finalised → sent_doc`), surfaces the missing endpoints, hardens the PDF render callback, and wires the multi-channel send to use the new `WellbeingNotificationsService` from impl 04.

## Shared files this impl touches

- `apps/api/src/modules/behaviour/behaviour.module.ts` — register documents controller + processors. Edit late.
- `apps/worker/src/processors/behaviour/` — new `document-render.processor.ts` and `document-send.processor.ts`. Yours alone.
- `apps/worker/src/base/queue.constants.ts` — possibly add `BEHAVIOUR_DOCUMENTS` queue constant if not present. Edit late.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **low.**

## What to build

### 1. Audit existing surface

`grep` for: `POST /behaviour/documents/generate`, `POST /behaviour/documents/:id/finalise`, `POST /behaviour/documents/:id/send`, `behaviour_documents`, `behaviour_document_templates`, document state machine. Document what's there.

### 2. Document generation endpoints (verify or build)

```
POST   /v1/behaviour/documents/generate         — kick off generation; returns document in 'generating' state
GET    /v1/behaviour/documents                  — list (already exists — verify shape)
GET    /v1/behaviour/documents/:id              — single doc with state
POST   /v1/behaviour/documents/:id/finalise     — transitions draft_doc → finalised
POST   /v1/behaviour/documents/:id/send         — transitions finalised → sent_doc; multi-channel
GET    /v1/behaviour/documents/:id/preview      — returns signed URL to PDF
GET    /v1/behaviour/documents/templates        — list available templates
GET    /v1/behaviour/documents/templates/:id    — single template (for preview / edit)
```

Permissions: `behaviour.manage` for generate/finalise/send; `behaviour.view` for list/get/preview.

### 3. Generate flow

`POST /generate` body:

```ts
{
  template_key: string;          // 'detention_notice' | 'suspension_letter' | 'exclusion_notice' | 'decision_letter' | 'board_pack' | 'parent_meeting_summary'
  entity_type: string;           // 'incident' | 'sanction' | 'exclusion_case' | 'appeal'
  entity_id: string;             // UUID
  recipient_user_ids?: string[]; // optional pre-set recipients (for send step)
  context_overrides?: Record<string, unknown>; // override template variable values
}
```

Service:

1. Resolve template by key (or 404 if not configured).
2. Resolve entity (or 404).
3. Compose template variables from entity + tenant + overrides.
4. Insert `behaviour_documents` row in `generating` state.
5. Enqueue `behaviour:document-render` job with `{ document_id, tenant_id, template_id, variables }`.
6. Return the document row immediately.

Worker `document-render.processor.ts`:

1. Render the Handlebars template.
2. Convert to PDF (use existing PDF renderer — investigate; likely Puppeteer or wkhtmltopdf wrapper).
3. Upload PDF to Hetzner Object Storage; capture `file_key`.
4. Update document row: state → `draft_doc`, `file_key`, `file_size_bytes`, `rendered_at`.
5. On render failure: state stays `generating` with `last_error`, `retry_count++`. After 3 retries, state → `generation_failed`.

### 4. Finalise

`POST /:id/finalise` checks state is `draft_doc`, transitions to `finalised`, writes audit log, returns updated row. No side effects beyond the state change. Optional body: `final_amendments` (text inserted at end of doc — re-renders).

### 5. Send

`POST /:id/send` body:

```ts
{
  recipient_user_ids: string[];
  channels: Array<'in_app' | 'email' | 'sms' | 'whatsapp'>;
  cover_message?: string;
}
```

Service:

1. Verify state is `finalised` (or `sent_doc` for re-send — increments resend counter).
2. Filter `channels` against tenant notification preferences (in-app always allowed; others depend on tenant prefs).
3. For each recipient × each enabled channel, enqueue `behaviour:document-send` job.
4. State → `sent_doc`, `sent_at = now()`.
5. Return updated row.

Worker `document-send.processor.ts`:

1. Generate signed URL for PDF (24h TTL).
2. Compose dispatch payload (signed URL + cover message + entity context).
3. Call `WellbeingNotificationsService.dispatch(...)` from impl 04 with appropriate event key (e.g. `document.sent_to_parent`).
4. Insert `behaviour_parent_acknowledgements` row per recipient with `sent_at = now()`.

### 6. PDF preview

`GET /:id/preview` returns `{ data: { url: string, expires_at: string } }` — a fresh signed URL (1h TTL).

### 7. Template management

`GET /documents/templates` returns the catalog of 6 default templates plus any tenant-custom templates. Tenant-custom template management is out of scope for Wave 3 (impl 20 may surface it later); list-only is enough.

## Tests

- `documents.service.spec.ts`:
  - Generate creates row in `generating`, enqueues render job
  - Finalise transitions only from `draft_doc`; rejects other transitions with `INVALID_STATE_TRANSITION`
  - Send filters channels by tenant prefs (in-app always survives)
- `document-render.processor.spec.ts`:
  - Successful render transitions to `draft_doc` with file_key set
  - Failed render increments retry, stays `generating`; after 3 failures, `generation_failed`
- `document-send.processor.spec.ts`:
  - Dispatches to `WellbeingNotificationsService` with correct payload
  - Inserts ack row per recipient

## Watch out for

- **Existing render infrastructure** — there may already be a render service used by report cards or invoices. Reuse, don't duplicate.
- **PDF storage cleanup** — old PDFs need a retention sweep (likely covered by behaviour retention worker; verify and add follow-up note if not).
- **Template variable injection** — sanitise. The exclusion letter template is partly drafted by office staff; never `eval` template strings; use Handlebars' safe defaults.
- **State machine validation** — use the canonical state machine in `packages/shared/src/behaviour/state-machine*.ts`. Do not re-implement transitions.

## Deployment notes

- Restart: API + worker.
- Smoke: generate a detention notice for any past incident via curl, observe state progression in DB (`generating` → `draft_doc` within seconds), then finalise + send via curl, confirm in-app inbox row appears for the parent recipient.
