# Phase D — P-POD/POD Sync, CBA Sync, Transfers

**Wave**: 2
**Deploy Order**: d4
**Depends On**: A

## Scope

Implements the bidirectional P-POD/POD sync engine with pluggable transport adapters, CBA (Classroom-Based Assessment) result sync to PPOD, and inter-school transfer tracking. PPOD is the source of truth for student records — pull (PPOD → EduPod) is the primary operation used for onboarding and yearly rollover. Push (EduPod → PPOD) is for CBA results, subject allocations, and attendance data. The v1 transport is file-based: CSV export for manual upload to esinet (push) and CSV import from esinet export (pull). The transport interface supports a future v2 esinet web automation adapter with zero pipeline changes.

## Deliverables

### PPOD Sync Service & Adapters

- `apps/api/src/modules/regulatory/regulatory-ppod.service.ts` — pull (importFromPpod, mapPodToStudent), push (mapStudentToPod, calculateDiff, validate, exportForPpod, previewDiff), getSyncStatus
- `apps/api/src/modules/regulatory/regulatory-ppod.service.spec.ts`
- `apps/api/src/modules/regulatory/adapters/pod-transport.interface.ts` — `PodTransport` interface + `PodTransportResult` type
- `apps/api/src/modules/regulatory/adapters/pod-transport.csv-export.ts` — v1 push: CSV matching PPOD import format
- `apps/api/src/modules/regulatory/adapters/pod-transport.csv-import.ts` — v1 pull: parse PPOD CSV export
- `apps/api/src/modules/regulatory/adapters/pod-transport.stub.ts` — test adapter

### CBA Sync Service

- `apps/api/src/modules/regulatory/regulatory-cba.service.ts` — CBA status, pending results, sync export, single-student sync, grade-to-descriptor mapping
- `apps/api/src/modules/regulatory/regulatory-cba.service.spec.ts`

### Transfers Service

- `apps/api/src/modules/regulatory/regulatory-transfers.service.ts` — list, create outbound/inbound, update status, get detail
- `apps/api/src/modules/regulatory/regulatory-transfers.service.spec.ts`

### Controller Endpoints

- `apps/api/src/modules/regulatory/regulatory.controller.ts` — **add** PPOD, CBA, and Transfers endpoint groups:
  - `GET /v1/regulatory/ppod/status`
  - `GET /v1/regulatory/ppod/students`
  - `POST /v1/regulatory/ppod/sync`
  - `POST /v1/regulatory/ppod/sync/:studentId`
  - `POST /v1/regulatory/ppod/import`
  - `GET /v1/regulatory/ppod/sync-log`
  - `GET /v1/regulatory/ppod/diff`
  - `POST /v1/regulatory/ppod/export-csv`
  - `GET /v1/regulatory/cba/status`
  - `GET /v1/regulatory/cba/pending`
  - `POST /v1/regulatory/cba/sync`
  - `POST /v1/regulatory/cba/sync/:studentId`
  - `GET /v1/regulatory/transfers`
  - `POST /v1/regulatory/transfers`
  - `PATCH /v1/regulatory/transfers/:id`
  - `GET /v1/regulatory/transfers/:id`
- `apps/api/src/modules/regulatory/regulatory.controller.spec.ts` — **add** PPOD, CBA, transfers test cases

## Out of Scope

- Worker processors for background PPOD sync/import (Phase E)
- PPOD/CBA/transfers frontend pages (Phase H)
- Automated esinet web transport (`pod-transport.esinet.ts`) — v2 future, interface only
- Tusla services (Phase B)
- DES pipeline (Phase C)

## Dependencies

**Phase A** provides:

- `ppod_student_mappings` table — maps students to PPOD records with sync hashes
- `ppod_sync_logs` table — audit trail of sync operations
- `ppod_cba_sync_records` table — tracks CBA result sync per student/subject
- `inter_school_transfers` table — transfer tracking
- Zod schemas: `ppodImportSchema`, `ppodExportSchema`, `cbaSyncSchema`, `createTransferSchema`, `updateTransferSchema`, `listTransfersQuerySchema`
- Constants: `PPOD_SUBJECT_CODES`, `PPOD_EARLY_LEAVING_REASONS`, `CBA_GRADE_DESCRIPTORS`
- The controller file, module registration, and `POD_TRANSPORT` DI token in the module

## Implementation Notes

- **PPOD sync architecture**: Pull uses transport.pull() to parse CSV → mapPodToStudent → validate → upsert students. Push uses mapStudentToPod → calculateDiff (hash comparison) → validate → transport.push() to generate CSV. Both create PpodSyncLog entries.
- **Hash-based diffing**: Each student mapping stores a SHA-256 hash of the last synced data snapshot. On push, current data is hashed and compared — only changed/new records are included in the export.
- **Integration points**:
  - PPOD sync: `students` (full profile for mapping), `households` (address), `ppod_student_mappings`, `ppod_sync_logs`
  - CBA sync: `assessments` + `assessment_grades` (CBA results from gradebook), `assessment_categories` (filter for CBA category), `ppod_cba_sync_records`, `des_subject_code_mappings` (PPOD subject codes)
  - Transfers: `students`, `inter_school_transfers`, student status lifecycle
- **CBA grade mapping**: Maps internal grade values to Junior Cycle descriptors (Exceptional, Above Expectations, In Line with Expectations, Yet to Meet Expectations).
- **Transfer workflow**: Outbound = school marks student as early leaver with destination roll number. Inbound = student appears on inter-school transfer list for acceptance/rejection. Both directions tracked with status machine (pending → accepted/rejected → completed/cancelled).
- Controller endpoints added under `// ─── P-POD/POD ───`, `// ─── CBA Sync ───`, and `// ─── Transfers ───` section separators.
- The PPOD import flow is the primary onboarding mechanism — schools export from PPOD and import here.
