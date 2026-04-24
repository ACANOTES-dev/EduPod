# Implementation 13 — Report Sharing Service (inbox integration)

> **Wave:** 3 (parallel, API restart)
> **Depends on:** 01, 04
> **Deploys:** API restart only

---

## Goal

Build the service that shares a saved report into the inbox: generate the chosen export format, upload as an inbox attachment, create a broadcast conversation to the chosen recipients, audit the share action, and produce a deep-link to a read-only snapshot view.

Snapshot-only per PLAN.md §7.2: the recipient gets the file. If they want live data, they open the source report themselves.

## What to change

### 1. New module: `report-sharing/`

File layout under `apps/api/src/modules/reports/report-sharing/`:

```
report-sharing/
├── report-sharing.service.ts
├── report-sharing.controller.ts
├── report-sharing.service.spec.ts
└── snapshot-storage.service.ts                # wraps object-storage upload
```

### 2. Service interface

```ts
type ShareReportRequest = {
  tenantId: string;
  sharerUserId: string;
  savedReportId: string;
  format: 'pdf' | 'excel' | 'word' | 'all';
  audience: AudienceDefinition; // reuse inbox's AudienceDefinition shape
  messageBody?: string; // optional, defaulted if absent
};

type ShareReportResult = {
  share_id: string; // for read-only snapshot URL
  conversation_id: string; // the inbox broadcast
  artifact_keys: Record<'pdf' | 'excel' | 'word', string>; // S3 keys, one per format generated
  recipients_count: number;
};

class ReportSharingService {
  async share(request: ShareReportRequest): Promise<ShareReportResult>;
  async getSharedSnapshot(shareId: string, userId: string): Promise<SharedSnapshotView>;
  async listSharesByReport(tenantId: string, savedReportId: string): Promise<ReportShareLogRow[]>;
}
```

### 3. Share pipeline

`share()` algorithm:

1. **Authorise** — caller must have `reports.share`; caller must own the saved report OR the report must be `visibility: shared`.
2. **Load report** — via `CustomReportBuilderService.getSavedReport`.
3. **Execute** — via `QueryEngineService.execute` (full, not paginated — caps at the engine's row limit).
4. **Export** — call `ReportExportService.exportPdf / exportExcel / exportWord` for each requested format (or all three if `format: 'all'`).
5. **Upload** — `SnapshotStorageService.upload(tenantId, shareId, format, buffer)` returns an S3 key. One upload per format.
6. **Create inbox broadcast** — `ConversationsService.create({ kind: 'broadcast', audience, allow_replies: false, subject, body })`, attaching each artifact via the existing `InboxAttachmentsService`.
7. **Audit** — insert `report_share_log` row with `{ tenant_id, saved_report_id, shared_by, format, conversation_id, recipients_json, message_body }`.
8. **Return** the ShareReportResult.

All of this runs in one RLS transaction where possible. The inbox side has its own service boundaries; cross-service calls happen inside the same tenant context.

### 4. Default message body

When `messageBody` is absent, generate:

```
{sharerDisplayName} shared a report: {reportName}

{reportDescription or ''}

Open the snapshot: {deep_link_to_/reports/shared/{share_id}}
```

The deep-link resolves to `/reports/shared/:share_id` on the web app (impl 19 implements the page).

### 5. Snapshot view

`getSharedSnapshot(shareId, userId)` returns:

```ts
type SharedSnapshotView = {
  share_id: string;
  saved_report_name: string;
  saved_report_description?: string;
  shared_by_name: string;
  shared_at: string;
  filters_summary: string;
  artifacts: Array<{ format: 'pdf' | 'excel' | 'word'; download_url: string }>; // signed URLs
  can_open_in_builder: boolean; // true iff user has reports.builder AND saved_report is_shared
};
```

Snapshot view is gated — the caller must either be a participant in the share's conversation OR have been added to the conversation as a participant via the inbox's mechanism.

### 6. Endpoint

`POST /v1/reports/builder/:id/share`:

```
body: { format: 'pdf' | 'excel' | 'word' | 'all', audience: AudienceDefinition, message_body?: string }
returns: { data: ShareReportResult }
```

`GET /v1/reports/shared/:share_id`:

```
returns: { data: SharedSnapshotView }
```

`GET /v1/reports/builder/:id/shares` — history of shares for this report.

All guarded with `@RequiresPermission('reports.share')` for share action, `@RequiresPermission('reports.view')` for reading snapshot.

### 7. Snapshot storage

Use the existing S3 infrastructure. Bucket prefix: `tenant/{tenant_id}/report_shares/{share_id}/`.

The artifact object has a `lifecycle_expires_at` metadata tag = now + 90 days. A background cleanup job (out of scope for this phase) will later purge expired objects. For now, artifacts live indefinitely — noted in follow-ups.

Signed URLs expire after 15 minutes. The frontend re-fetches the snapshot view to get fresh URLs.

### 8. Large-report handling

If the export would produce > 5 000 rows, delegate to the `reports:export-batch` BullMQ job (from impl 04). The share response returns a `job_id`; the frontend shows "Preparing, you'll be notified". When the job finishes, the batch processor itself creates the inbox broadcast with the artifact attached. The `report_share_log` row is inserted at the end of the async flow.

### 9. Share visibility control

The owner can see who has shared a given report via `GET /v1/reports/builder/:id/shares`. Recipients see only their own inbox view.

## Testing requirements

- **Unit test** — happy path with mocked export + inbox + storage.
- **Unit test** — authorise rejects non-owner of a private report.
- **Unit test** — large report path enqueues batch job.
- **Integration test** — end-to-end: create a shared report, generate PDF, verify inbox conversation exists with attachment.
- **Permissions test** — user without `reports.share` → 403.
- **RLS test** — sharer in Tenant A can't share to recipients in Tenant B (blocked by inbox side).

## Post-deploy verification

1. `POST /v1/reports/builder/:id/share` with `{ format: 'pdf', audience: { role_groups: ['vice_principal'] }, message_body: 'fyi' }` as owner@nhqs.test.
2. Confirm `share_id` and `conversation_id` returned.
3. Log in as vice-principal@nhqs.test — verify inbox has a new broadcast with the PDF attachment.
4. `GET /v1/reports/shared/:share_id` as vice-principal — verify snapshot view returns signed URL.
5. Download the artifact — confirm it's a real PDF.
6. `SELECT * FROM report_share_log ORDER BY shared_at DESC LIMIT 1;` — audit row present.

## Follow-ups for subsequent waves

- **Impl 19 (Share dialog UI + Saved Reports management)** consumes all three endpoints.
- **Impl 08 (Scheduled worker)** reuses the share service for inbox delivery of scheduled reports.
- Out of scope: snapshot lifecycle cleanup job (90-day purge). Declare need in completion record; defer.

## Rollback

`git revert <sha>` — removes the module. The permissions seeded in impl 01 stay (harmless). Saved reports remain; existing shares are kept in `report_share_log` for audit. Safe.

## Architecture doc update

`docs/architecture/module-blast-radius.md`: reports module now depends on inbox module (conversations, attachments, audience picker).
