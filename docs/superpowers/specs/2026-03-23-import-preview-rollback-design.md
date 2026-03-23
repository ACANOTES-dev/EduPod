# Import Preview & Rollback — Design Spec

## Problem

When a bulk import has bad data, there's no way to catch it before confirm or undo it after. Users must manually delete each imported record.

## Features

### 1. Data Preview (post-validation, pre-confirm)

After validation succeeds, show a preview of what will be imported:

**Summary cards** at the top:
- Total rows
- Breakdown by year_group (e.g. "Year 1: 45, Year 2: 38")
- Breakdown by gender
- Household count (distinct parent1_email values)

**Sample table** below:
- First 30 parsed rows displayed in a scrollable table
- Column headers from the file
- Note: "Showing 30 of 200 rows"

**Implementation:**
- During inline validation in `import.service.ts`, after parsing the file, store `preview_json` on the import_job record containing `{ summary, sample_rows }`
- The existing `GET /api/v1/imports/:id` endpoint already returns the full job — frontend reads `preview_json` from it
- Frontend renders the preview between validation results and the "Confirm Import" button

### 2. Import Rollback

A "Rollback" action on completed imports that safely deletes records created by the import.

**Record tracking:**
- New table `import_job_records` tracks every record created during import processing
- Schema: `(id, tenant_id, import_job_id, record_type, record_id, created_at)`
- `record_type` values: `student`, `parent`, `household`, `household_parent`, `student_parent`, `household_fee_assignment`, `household_emergency_contact`
- Rows inserted during the processing transaction (atomic with record creation)

**Safe deletion with dependency checking:**
- Student: skip if has `attendance_records`, `grades`, `class_enrolments`, `invoice_lines`, or `report_cards`
- Parent: skip if `user_id` is not null (linked to a platform user account)
- Household: skip if has students NOT created by this import
- Junction/child records (student_parents, household_parents, emergency_contacts, fee_assignments): safe to delete if parent record is being deleted

**Deletion order** (FK-safe):
1. student_parents
2. household_parents
3. household_emergency_contacts
4. household_fee_assignments
5. students (safe only)
6. parents (safe only)
7. households (safe only)

**Status transitions:**
- All records deleted → status = `rolled_back`
- Some records skipped → status = `partially_rolled_back`

**API:** `POST /api/v1/imports/:id/rollback`
- Permission: `settings.manage`
- Only works on status = `completed`
- Returns: `{ deleted_count, skipped_count, skipped_details: [{ record_type, record_id, reason }] }`

**Frontend:**
- "Rollback" button on completed imports in history table
- Confirmation dialog before executing
- After rollback: show summary of deleted vs skipped with reasons

## Database Changes

1. Add `rolled_back` and `partially_rolled_back` to `ImportStatus` enum
2. Add `preview_json Json?` column to `import_jobs`
3. New model `ImportJobRecord`:
   - `id` UUID PK
   - `tenant_id` UUID FK → tenants
   - `import_job_id` UUID FK → import_jobs
   - `record_type` String
   - `record_id` UUID
   - `created_at` DateTime

## Files to Change

**Backend:**
- `packages/prisma/schema.prisma` — new model + enum values + preview_json column
- `apps/api/src/modules/imports/import.service.ts` — preview_json storage during validation, rollback endpoint logic
- `apps/api/src/modules/imports/import.controller.ts` — new rollback endpoint
- `apps/api/src/modules/imports/import-processing.service.ts` — insert import_job_records during processing
- `apps/worker/src/processors/imports/import-processing.processor.ts` — same tracking

**Frontend:**
- `apps/web/src/app/[locale]/(school)/settings/imports/page.tsx` — preview section, rollback button + dialog

**Migration:**
- New Prisma migration for schema changes
