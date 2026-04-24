# Implementation 19 — Share-to-Inbox Dialog + Saved Reports Management

> **Wave:** 4 (parallel, web restart)
> **Depends on:** 01, 13, 16
> **Deploys:** web restart only

---

## Goal

Build the share-to-inbox dialog (reusing the inbox's audience picker) and finish the saved-reports management surface (list, rename, duplicate, delete, favorite). Also build the read-only shared-snapshot view at `/reports/shared/:share_id`.

## What to change

### 1. Share dialog component

New file: `apps/web/src/app/[locale]/(school)/reports/_components/share-dialog.tsx`.

Triggered from a "Share" button on any saved report (centre pane of the builder, saved-reports sidebar 3-dot menu, or the shared snapshot view's "share again" affordance).

**Modal fields:**

- **Format**: PDF / Excel / Word / All three. Radio group. Default PDF.
- **Message** (optional): textarea, 500 chars max. Placeholder: "I've shared the latest {report name}. Let me know if you have any questions."
- **Recipients**: the inbox's `InboxAudiencePicker` component embedded here. Shows individual users, saved audiences, role groups. Respects the tenant messaging policy (so the sender sees only groups they can legally broadcast to).

**Footer:**

- Cancel button.
- Share button — disabled until recipients selected.

**On submit:**

- `POST /v1/reports/builder/:id/share` with `{ format, audience, message_body }`.
- Toast on success: "Shared with {N} people. They'll see it in their inbox."
- Backend returns `share_id` and `conversation_id`.
- If the artifact is large and the backend returns 202 + `job_id`: show "Preparing, we'll notify you when ready." No further action needed (the worker delivers).

### 2. Share permission gate

The Share button only renders if the user has `reports.share` permission. The dialog itself re-checks at submit time via backend 403 handling.

### 3. Saved reports management

Extend the saved-reports sidebar in the builder (impl 16) with per-item actions:

- **Favorite toggle** (star icon in list).
- **3-dot menu**:
  - Open
  - Rename (inline or modal)
  - Duplicate (creates a `{name} (copy)` report with a fresh id)
  - Share (opens share dialog)
  - Delete (confirmation required)

Backend calls:

- Rename: `PATCH /v1/reports/builder/:id { name: '...' }`.
- Duplicate: `POST /v1/reports/builder/:id/duplicate`.
- Favorite: `PATCH /v1/reports/builder/:id { is_favorite: true }`.
- Delete: `DELETE /v1/reports/builder/:id`.

### 4. Shared snapshot view

New page: `apps/web/src/app/[locale]/(school)/reports/shared/[share_id]/page.tsx`.

**Layout:**

- Page header with report name + "Shared by {name} on {date}" subtitle.
- Filter summary badge — a card listing "Filters applied: …" in human-readable form.
- **Artifact downloads** — one button per format that was generated (PDF / Excel / Word). Clicking hits a signed download URL.
- **Open in builder** button — only visible if user has `reports.builder` AND the source report has `visibility: shared`. Navigates to `/reports/builder/<saved_report_id>` where a re-run against live data can happen (permission permitting).
- No edit controls. No "save as". No delete.

Data source: `GET /v1/reports/shared/:share_id`.

If the share expired (snapshot purged — future cleanup), show "This shared snapshot has expired. Ask the sender to reshare."

### 5. Share history per report

In the builder, add a "Share history" tab alongside the main editor for saved reports (visible only if the user owns the report). Lists from `GET /v1/reports/builder/:id/shares`:

- Date
- Shared by (if multi-author shared report)
- Format
- Recipients (count)
- Link to the inbox conversation

### 6. Integration with inbox

When a user receives a shared report in their inbox, the inbox thread shows the attached artifact(s) inline (existing inbox attachment rendering). Clicking opens a download via the signed URL. The message body contains the deep-link to `/reports/shared/:share_id`.

## Testing requirements

- **Component test** — share dialog renders, audience picker embeds correctly, submit calls the endpoint.
- **Component test** — shared snapshot view renders with fixture.
- **Playwright e2e** — share flow: click Share on a saved report → pick recipients → submit → log in as recipient → see inbox message → download artifact.
- **Permission tests** — user without `reports.share` can't see Share button.

## Post-deploy verification

1. On a saved report, click Share; modal opens; pick "Vice Principal" role group; select PDF; submit.
2. Toast confirms.
3. Log in as VP; inbox shows new broadcast with attached PDF; download works.
4. Click deep-link → `/reports/shared/:id` opens read-only view; download button works.
5. Owner opens "Share history" tab — sees the share entry.

## Follow-ups for subsequent waves

- **Impl 22 (Polish)** — mobile pass on the share dialog.
- Out of scope: snapshot expiry cleanup — future cycle.

## Rollback

`git revert <sha>` — share UI disappears; backend service stays. No data loss. Safe.
