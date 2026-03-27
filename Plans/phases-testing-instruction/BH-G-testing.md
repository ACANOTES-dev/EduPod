# Phase G: Documents + Comms — Testing Instructions

## Unit Tests (30 tests, 2 suites)

### `behaviour-document.service.spec.ts` (16 tests)
- `generateDocument` — happy path: full 8-step pipeline (template → Handlebars → PDF → SHA-256 → S3 → DB)
- `generateDocument` — direct template_id lookup path
- `generateDocument` — 404 when no active template exists
- `listDocuments` — paginated response with meta
- `listDocuments` — filter forwarding to DB queries
- `getDocument` — returns document by ID with relations
- `getDocument` — 404 for non-existent document
- `finaliseDocument` — draft → finalised transition + history recording
- `finaliseDocument` — BadRequest when not in draft status
- `finaliseDocument` — 404 for missing document
- `sendDocument` — finalised → sent transition + acknowledgement creation
- `sendDocument` — BadRequest when not finalised
- `sendDocument` — skips acknowledgement when no recipient_parent_id
- `getDownloadUrl` — returns presigned URL with 900s expiry
- `getDownloadUrl` — 404 for missing document

### `behaviour-parent.service.spec.ts` (14 tests)
- `getSummary` — returns per-child summary with counts for authenticated parent
- `getSummary` — returns zero data for restricted children (no indication of restriction)
- `getSummary` — 404 when parent profile not found
- `getIncidents` — returns parent-safe incidents (no raw description)
- `getIncidents` — returns empty array when guardian restriction active
- `getIncidents` — ForbiddenException for unlinked student
- `renderIncidentForParent` — priority 1: parent_description when set
- `renderIncidentForParent` — priority 2: template text from context_snapshot
- `renderIncidentForParent` — priority 3: category name + date fallback
- `acknowledge` — sets acknowledged_at and acknowledgement_method
- `acknowledge` — updates amendment notice parent_reacknowledged_at when amendment_notice_id present
- `acknowledge` — returns already_acknowledged if previously acknowledged
- `acknowledge` — 404 for missing acknowledgement
- `acknowledge` — updates incident parent_notification_status when all acks done

## Integration Tests (manual)

### Document Generation
1. `POST /api/v1/behaviour/documents/generate` with `{ document_type: "suspension_letter", entity_type: "sanction", entity_id: "<valid_sanction_id>" }`
   - Verify: 201, document record returned with status "draft"
   - Verify: S3 file exists at expected key
   - Verify: data_snapshot contains resolved merge fields
2. Same request with non-existent entity_id → 404
3. Same request with no active template → 404

### Document Lifecycle
1. `PATCH /api/v1/behaviour/documents/:id/finalise` → status changes to "finalised"
2. `POST /api/v1/behaviour/documents/:id/send` with `{ channel: "email" }` → status changes to "sent"
3. `POST /api/v1/behaviour/documents/:id/send` on draft document → 400
4. `GET /api/v1/behaviour/documents/:id/download` → returns presigned URL

### Parent Portal
1. `GET /api/v1/parent/behaviour/summary` as authenticated parent → per-child summaries
2. `GET /api/v1/parent/behaviour/incidents?student_id=X` → never returns `description` or `context_notes`
3. Same endpoint with active guardian restriction → empty array (no error)
4. `POST /api/v1/parent/behaviour/acknowledge/:id` → sets acknowledged_at

### Document Templates
1. `GET /api/v1/behaviour/document-templates` → lists all templates
2. `POST /api/v1/behaviour/document-templates` → creates custom template
3. `PATCH /api/v1/behaviour/document-templates/:id` on system template → only allows is_active and template_body changes

## RLS Leakage Tests
1. Create document as Tenant A, attempt to read as Tenant B → not found
2. Create acknowledgement as Tenant A, attempt to acknowledge as Tenant B → not found
3. Parent in Tenant A should not see behaviour data from Tenant B

## Manual QA Checklist
- [ ] Generate a suspension letter PDF and verify it contains school letterhead, student name, dates
- [ ] Arabic template generates RTL PDF with Noto Sans Arabic font
- [ ] Parent portal shows correct incident count and points total
- [ ] Parent portal hides teacher names when `parent_visibility_show_teacher_name = false`
- [ ] Guardian restriction causes empty view for restricted child (no error message)
- [ ] Acknowledgement button works and updates status
- [ ] Template editor allows editing template body for system templates
- [ ] Template editor prevents renaming system templates
- [ ] Custom template takes priority over system template in document generation
- [ ] Superseded documents show with strikethrough in list
