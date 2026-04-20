# Implementation 20 — Document Generation UI

> **Wave:** 6 (**parallel-risky** — apply rules H1–H10)
> **Classification:** frontend
> **Depends on:** 06, 14
> **Deploys:** Web restart only

---

## Goal

Surface the document generation lifecycle (impl 06) in the UI. Templates browser, generate dialog (with template picker + entity picker + variable overrides), document list with state badges, PDF preview, finalise action, multi-channel send dialog with recipient picker. All on top of the existing `/behaviour/documents` page (which today is an empty list shell).

## Shared files this impl touches

- `apps/web/messages/en.json` + `ar.json` — add `documentGen.*` namespace. Apply Rules H8 + H9.
- `apps/web/src/app/[locale]/(school)/behaviour/documents/page.tsx` — full rewrite. Yours.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **MEDIUM** (translations).

## What to build

### 1. Documents list page

Edit `apps/web/src/app/[locale]/(school)/behaviour/documents/page.tsx`. Sections:

- **PageHeader** — "Documents", header CTA: "Generate document" button (opens generate dialog).
- **Filter bar** — by status (`generating | draft_doc | finalised | sent_doc | superseded | generation_failed`), type (detention notice / suspension letter / etc.), student, date range.
- **List** (paginated) — each row: doc type icon, title/subject, related student/entity, generated_at, current state badge, actions menu (Preview, Finalise, Send, Resend, Cancel).

### 2. Generate dialog (`_components/generate-document-dialog.tsx`)

Multi-step form:

- Step 1: Template picker (grid of cards with template name + sample preview thumb)
- Step 2: Entity picker (search by student / incident / sanction / exclusion case)
- Step 3: Variable overrides (form auto-derived from template variables; each field defaulted from the resolved entity)
- Step 4: Confirm + generate

On submit, calls `POST /api/v1/behaviour/documents/generate`. Closes dialog and navigates to the document's detail page (which polls for state until `draft_doc`).

### 3. Document detail page (`apps/web/src/app/[locale]/(school)/behaviour/documents/[id]/page.tsx`)

NEW. Layout:

- Header: title, state badge, related entity link, generated metadata
- Left panel: PDF preview (embed via `<iframe src={signed_url}>` or PDF.js if available)
- Right panel: action sidebar
  - Finalise (only when state = `draft_doc`)
  - Send (only when state = `finalised` or `sent_doc`) — opens send dialog
  - Resend (when sent)
  - Cancel (when draft / generating)
  - Audit log link
- Polling: if state is `generating`, poll `/api/v1/behaviour/documents/:id` every 2s for up to 60s. After 60s show a "Render is taking longer than usual — check back later" message.

### 4. Send dialog (`_components/send-document-dialog.tsx`)

- Recipient picker: pre-populated with the entity's parents/guardians; allows adding additional recipients
- Channel checkboxes: in-app (always on, disabled), email, sms, whatsapp (each enabled only if tenant prefs allow it; show tooltip explaining "WhatsApp not configured for this tenant" when disabled)
- Cover message (optional textarea)
- Confirm button → calls `POST /:id/send`, closes, redirects back to detail page

### 5. Translation additions

Namespace `documentGen.*`. Apply Rule H8.

## Tests

- `documents/page.spec.tsx`: filter, paginate, generate-dialog open
- `generate-document-dialog.spec.tsx`: 4-step flow + submit
- `documents/[id]/page.spec.tsx`: state-based action visibility, polling logic
- `send-document-dialog.spec.tsx`: channel enablement, cover message optional

## Watch out for

- **PDF preview iframe security** — sign the URL with short TTL. Don't expose raw object-storage URLs.
- **Polling exhaustion** — cap the polling at 30 attempts (60s). After that, switch to a manual "Refresh" button.
- **Stuck `generating` state** — if a doc is stuck for >5 minutes, the action sidebar should expose a "Retry generation" button (calls a backend endpoint that re-enqueues the render job; coordinate with impl 06 if this endpoint isn't yet exposed).
- **WhatsApp checkbox** — even though the provider is stubbed (impl 04 / 06), the UI should still let users tick it; the backend will silently no-op the send (per the stub contract). Tooltip should say "WhatsApp delivery is not yet wired — messages will be queued for later delivery once configured."

## Deployment notes

- Restart: web only.
- Smoke: visit `/en/behaviour/documents`, click Generate, walk through the 4-step flow against a real incident, observe doc appearing in list, click into detail, watch state progress to `draft_doc`, finalise, send to the seeded parent (in-app only), verify in-app inbox row.
