---
name: SW-3C — DSAR & Historical Import
description: DSAR review workflow for pastoral records (integrating with the existing compliance module), and structured CSV import for historical Tier 1/2 concern records with validation, preview, and idempotency.
phase: 3
sub_phase: C
dependencies: [SW-1C, SW-3B]
status: NOT STARTED
estimated_effort: Medium
---

# SW-3C: DSAR & Historical Import

## What This Sub-Phase Delivers

1. **DSAR review service** -- when the compliance module receives a data subject access request, pastoral records for the subject are routed to a manual DLP review queue. The DLP decides per-record: include, redact, or exclude (with documented legal basis). No automatic exclusions.
2. **DSAR controller** -- permission-gated endpoints for listing pending reviews, submitting decisions, and viewing completed reviews
3. **Historical import service** -- CSV-based import of Tier 1/2 concern records from legacy systems, with validation preview, confirmation, and idempotency via content hashing
4. **Import controller** -- two-step import flow (validate, then confirm) with permission gating

---

## Prerequisites

| Prerequisite | Source | Why |
|---|---|---|
| `pastoral_concerns` table with RLS | SW-1B | DSAR reviews and imports target concern records |
| `cp_records` with DLP access control | SW-1C | Tier 3 DSAR review requires cp_access enforcement |
| `pastoral_audit_events` append-only table | SW-1A | DSAR decisions and imports generate audit events |
| Compliance module operational | Existing (`apps/api/src/modules/compliance/`) | DSAR requests originate from `compliance_requests` table |
| Export infrastructure from SW-3B | SW-3B | DSAR response pack uses export capabilities |
| `app.current_user_id` infrastructure | SW-1A | Audit trail requires user identity |
| Import infrastructure patterns | Existing (`apps/api/src/modules/imports/`) | CSV parsing and validation patterns |
| Student records operational | Existing | Import resolves student identifiers against enrolled students |

---

## Part 1: DSAR Review

### Database Tables

#### `pastoral_dsar_reviews`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | PK, `DEFAULT gen_random_uuid()` | |
| `tenant_id` | `UUID` | NOT NULL, FK `tenants` | RLS column |
| `compliance_request_id` | `UUID` | NOT NULL, FK `compliance_requests` | The originating DSAR |
| `record_type` | `TEXT` | NOT NULL | `'pastoral_concern'` or `'cp_record'` |
| `record_id` | `UUID` | NOT NULL | FK to `pastoral_concerns.id` or `cp_records.id` |
| `tier` | `INTEGER` | NOT NULL | 1, 2, or 3 |
| `record_summary` | `TEXT` | NOT NULL | Precomputed summary of the record for the reviewer |
| `decision` | `TEXT` | NULL | `'include'`, `'redact'`, `'exclude'` -- NULL means pending |
| `redaction_details` | `TEXT` | NULL | If decision is `redact`, what was redacted |
| `exclusion_legal_basis` | `TEXT` | NULL | Required if decision is `exclude` |
| `exclusion_justification` | `TEXT` | NULL | Freeform justification for exclusion |
| `decided_by_user_id` | `UUID` | NULL, FK `users` | Who made the decision |
| `decided_at` | `TIMESTAMPTZ` | NULL | |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | `@updatedAt` |

**Indexes:**
- `idx_pastoral_dsar_reviews_tenant_request` on `(tenant_id, compliance_request_id)`
- `idx_pastoral_dsar_reviews_tenant_pending` on `(tenant_id, decision)` WHERE `decision IS NULL`
- Unique: `(tenant_id, compliance_request_id, record_type, record_id)`

**RLS:** Standard tenant isolation policy on `tenant_id`.

### Legal Basis Options (Controlled List)

The `exclusion_legal_basis` field requires selection from a controlled list. These are the legally relevant bases for excluding pastoral/CP records from a DSAR response under Irish law:

| Value | Description |
|---|---|
| `third_party_rights` | Would adversely affect the rights of another individual (GDPR Art. 15(4)) |
| `child_protection_proceedings` | Records related to ongoing or potential child protection proceedings |
| `children_first_act` | Exemption under Children First Act 2015 |
| `dpa_2018_section_60` | Data Protection Act 2018, Section 60 (restrictions for safeguarding) |
| `legal_professional_privilege` | Records subject to legal professional privilege |
| `ongoing_investigation` | Records related to an active Tusla or Garda investigation |
| `harm_to_subject` | Disclosure would cause serious harm to the data subject's health |
| `other` | Other legal basis (freeform justification required) |

### DSAR Routing Logic

When a compliance request with `request_type = 'access_export'` is created for a student subject, the pastoral DSAR service is triggered to create review rows:

1. **Trigger point:** The compliance module calls `PastoralDsarService.routeForReview()` after classifying a DSAR. This is a cross-module integration -- the compliance module must import `PastoralModule` (or use an event-based approach).
2. **Record identification:** The service queries `pastoral_concerns` for all records where `student_id` matches the DSAR subject. If the reviewer has `cp_access`, it also queries `cp_records`.
3. **Review row creation:** One `pastoral_dsar_reviews` row per flagged record, with `record_summary` pre-computed.
4. **Tier 3 enhanced review:** For records with `tier = 3` or from `cp_records`, the UI displays an additional warning (see master spec Section 11).

### Integration with Compliance Module

**Option A (recommended): Direct service call.** The compliance module's `execute()` method (which processes approved DSARs) calls `PastoralDsarService.routeForReview()` as part of the access export flow. The pastoral DSAR review is completed before the compliance request proceeds to `completed` status.

**Flow:**
```
compliance_request created (subject: student)
  -> classified as access_export
  -> approved
  -> execute()
    -> AccessExportService.exportSubjectData() (existing)
    -> PastoralDsarService.routeForReview() (NEW)
    -> DLP reviews pastoral records via pastoral DSAR endpoints
    -> PastoralDsarService.getReviewedRecords() returns the final set
    -> Include in the export or separate pastoral DSAR pack
  -> completed
```

**The compliance module must be updated** to:
1. Import `PastoralModule` (via `forwardRef` if circular)
2. Call `PastoralDsarService.routeForReview()` during DSAR execution for student subjects
3. Wait for pastoral review completion before marking the compliance request as `completed`

Alternatively, a `compliance_request_status_changed` event can trigger routing asynchronously, but synchronous is simpler for V1.

---

### DSAR API Endpoints

| Method | Path | Permission | Description |
|---|---|---|---|
| `GET` | `/api/v1/pastoral/dsar-reviews` | `pastoral.dsar_review` | List pending and completed DSAR reviews (filtered by compliance_request_id) |
| `GET` | `/api/v1/pastoral/dsar-reviews/:id` | `pastoral.dsar_review` | Get single review with record details |
| `POST` | `/api/v1/pastoral/dsar-reviews/:id/decide` | `pastoral.dsar_review` | Submit decision (include/redact/exclude) |
| `GET` | `/api/v1/pastoral/dsar-reviews/by-request/:complianceRequestId` | `pastoral.dsar_review` | All reviews for a specific compliance request |
| `GET` | `/api/v1/pastoral/dsar-reviews/by-request/:complianceRequestId/summary` | `pastoral.dsar_review` | Decision summary: counts by decision type, any pending |

### DSAR Service Method Signatures

#### `PastoralDsarService` (`pastoral-dsar.service.ts`)

```typescript
class PastoralDsarService {
  /**
   * Route pastoral records for manual review.
   * Called by the compliance module when a student DSAR is being processed.
   * Creates pastoral_dsar_reviews rows for each matching record.
   */
  routeForReview(tenantId: string, complianceRequestId: string, studentId: string, reviewerUserId: string): Promise<{ reviewCount: number; tier3Count: number }>;

  /**
   * List reviews for a compliance request with optional decision filter.
   */
  listReviews(tenantId: string, filters: DsarReviewFilterDto): Promise<PaginatedResponse<PastoralDsarReview>>;

  /**
   * Get a single review with full record details.
   * For tier 3 records, validates cp_access before returning.
   */
  getReview(tenantId: string, userId: string, reviewId: string): Promise<PastoralDsarReview>;

  /**
   * Submit a review decision.
   * Validates: exclude requires legal_basis + justification.
   * Generates immutable audit event.
   */
  submitDecision(tenantId: string, userId: string, reviewId: string, dto: DsarDecisionDto): Promise<PastoralDsarReview>;

  /**
   * Get reviews for a compliance request grouped by decision.
   */
  getReviewsByRequest(tenantId: string, complianceRequestId: string): Promise<PastoralDsarReview[]>;

  /**
   * Returns true if all reviews for the compliance request have decisions.
   */
  allReviewsComplete(tenantId: string, complianceRequestId: string): Promise<boolean>;

  /**
   * Get the reviewed records (post-decision) for inclusion in the DSAR export.
   * Returns only records with decision = 'include' or 'redact' (with redactions applied).
   */
  getReviewedRecords(tenantId: string, complianceRequestId: string): Promise<DsarReviewedRecord[]>;
}
```

### DSAR Zod Schemas (`packages/shared/src/schemas/pastoral-dsar.schema.ts`)

```typescript
const dsarDecisionEnum = z.enum(['include', 'redact', 'exclude']);

const exclusionLegalBasisEnum = z.enum([
  'third_party_rights',
  'child_protection_proceedings',
  'children_first_act',
  'dpa_2018_section_60',
  'legal_professional_privilege',
  'ongoing_investigation',
  'harm_to_subject',
  'other',
]);

const dsarDecisionSchema = z.object({
  decision: dsarDecisionEnum,
  redaction_details: z.string().max(5000).optional(),
  exclusion_legal_basis: exclusionLegalBasisEnum.optional(),
  exclusion_justification: z.string().max(5000).optional(),
}).refine(
  (data) => data.decision !== 'redact' || (data.redaction_details && data.redaction_details.trim().length > 0),
  { message: 'redaction_details required for redact decision', path: ['redaction_details'] },
).refine(
  (data) => data.decision !== 'exclude' || data.exclusion_legal_basis,
  { message: 'exclusion_legal_basis required for exclude decision', path: ['exclusion_legal_basis'] },
).refine(
  (data) => data.decision !== 'exclude' || (data.exclusion_justification && data.exclusion_justification.trim().length > 0),
  { message: 'exclusion_justification required for exclude decision', path: ['exclusion_justification'] },
).refine(
  (data) => data.exclusion_legal_basis !== 'other' || (data.exclusion_justification && data.exclusion_justification.length > 20),
  { message: 'Detailed justification required when legal basis is "other"', path: ['exclusion_justification'] },
);

const dsarReviewFilterSchema = z.object({
  compliance_request_id: z.string().uuid().optional(),
  decision: dsarDecisionEnum.optional().or(z.literal('pending')),
  tier: z.coerce.number().int().min(1).max(3).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
```

---

## Part 2: Historical Import

### Import Design

The historical import follows the existing import infrastructure patterns (`apps/api/src/modules/imports/`) but is self-contained within the pastoral module because:
1. It has domain-specific validation (concern categories, severity levels, student matching)
2. It generates pastoral audit events (not general import audit events)
3. It is restricted to Tier 1/2 only

### Two-Step Import Flow

**Step 1: Validate** (`POST /api/v1/pastoral/import/validate`)
- User uploads CSV file
- Service parses the CSV, validates every row
- Returns a validation report with: total rows, valid rows, invalid rows with error details, warnings
- No data is written to the database. The parsed data is stored temporarily (in-memory or a short-lived cache key)

**Step 2: Confirm** (`POST /api/v1/pastoral/import/confirm`)
- User reviews validation report and confirms
- Service creates backdated `pastoral_concerns` records for all valid rows
- Each record has `imported = true` and `logged_by` = importing user
- Each record generates a `concern_created` audit event with `payload.source = 'historical_import'`
- Returns import result summary

### CSV Template Format

| Column | Required | Description | Example |
|---|---|---|---|
| `date` | YES | Concern date (YYYY-MM-DD) | `2025-09-15` |
| `student_identifier` | YES | Enrolment ID (preferred) or name+DOB in format `FirstName LastName (YYYY-MM-DD)` | `MDAD-S-00001` or `Aisha Al-Mansour (2015-03-15)` |
| `category` | YES | Must match a configured concern category | `academic` |
| `severity` | YES | Must be: `routine`, `elevated`, `urgent`, `critical` | `routine` |
| `narrative` | YES | The concern text | `Student appears withdrawn in class, not engaging with group work` |
| `actions_taken` | NO | Actions taken at the time | `Spoke with student after class` |
| `follow_up_notes` | NO | Follow-up notes | `Referred to year head for monitoring` |

### Validation Rules

| Rule | Error / Warning |
|---|---|
| Missing `date`, `student_identifier`, `category`, `severity`, or `narrative` | ERROR: row rejected |
| `date` is not a valid date or is in the future | ERROR: row rejected |
| `category` does not match any configured concern category for the tenant | ERROR: row rejected |
| `severity` is not one of `routine`, `elevated`, `urgent`, `critical` | ERROR: row rejected |
| `student_identifier` does not match any enrolled student | ERROR: row rejected |
| `narrative` is shorter than 10 characters | ERROR: row rejected |
| `severity` is `urgent` or `critical` (historical imports should rarely contain these) | WARNING: row accepted with warning |
| Duplicate detected (hash match on student_id + date + narrative) | WARNING: row skipped (idempotency) |

### Idempotency

Each imported concern is hashed: `SHA-256(student_id + date + narrative)`. The hash is stored in a `import_hash` column on `pastoral_concerns`. Before inserting, the service checks for an existing record with the same hash. Duplicates are skipped with a warning in the import report, not rejected as errors.

### Database Changes

Add to `pastoral_concerns` (created in SW-1B):

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `imported` | `BOOLEAN` | NOT NULL, DEFAULT `false` | Marks imported records |
| `import_hash` | `TEXT` | NULL, UNIQUE per tenant | SHA-256 hash for idempotency |

**Index:** `idx_pastoral_concerns_import_hash` on `(tenant_id, import_hash)` WHERE `import_hash IS NOT NULL`

### Tier Restriction

Historical import creates concerns at **Tier 1 only** (severity `routine` or `elevated`) or **Tier 2** (severity `urgent` -- note: urgency in a historical context is still sensitive). **Tier 3 is never assigned by import.** The master spec is explicit: "No Tier 3 import. Child protection records are too sensitive for bulk ingestion." If the imported concern category is `child_protection`, the import rejects the row with an error message: "Child protection records cannot be imported in bulk. Enter these manually via the DLP interface."

### Import API Endpoints

| Method | Path | Permission | Description |
|---|---|---|---|
| `POST` | `/api/v1/pastoral/import/validate` | `pastoral.import_historical` | Upload CSV, receive validation report |
| `POST` | `/api/v1/pastoral/import/confirm` | `pastoral.import_historical` | Confirm and execute import |
| `GET` | `/api/v1/pastoral/import/template` | `pastoral.import_historical` | Download CSV template |

### Import Service Method Signatures

#### `PastoralImportService` (`pastoral-import.service.ts`)

```typescript
class PastoralImportService {
  /**
   * Parse and validate the uploaded CSV.
   * Returns a validation report without writing to the database.
   * Stores parsed rows in a short-lived cache keyed by a validation token.
   */
  validate(tenantId: string, userId: string, fileBuffer: Buffer): Promise<ImportValidationResult>;

  /**
   * Execute the import for previously validated rows.
   * Creates backdated pastoral_concerns with imported=true.
   * Each record generates an audit event.
   */
  confirm(tenantId: string, userId: string, validationToken: string): Promise<ImportConfirmResult>;

  /**
   * Generate a CSV template file for download.
   */
  generateTemplate(): Buffer;

  // Internal
  private parseCsv(buffer: Buffer): ParsedRow[];
  private resolveStudent(tenantId: string, identifier: string): Promise<{ id: string; name: string } | null>;
  private validateCategory(tenantId: string, category: string): Promise<boolean>;
  private computeHash(studentId: string, date: string, narrative: string): string;
  private checkDuplicateHash(tenantId: string, hash: string): Promise<boolean>;
  private determineTier(category: string, severity: string): number;
}
```

### Import Data Types

```typescript
interface ImportValidationResult {
  validation_token: string; // Used to reference cached data for confirm step
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  skipped_rows: number; // Duplicates
  errors: Array<{
    row: number;
    field: string;
    message: string;
  }>;
  warnings: Array<{
    row: number;
    message: string;
  }>;
  preview: Array<{
    row: number;
    student_name: string;
    date: string;
    category: string;
    severity: string;
    narrative_preview: string; // First 100 characters
  }>;
}

interface ImportConfirmResult {
  total_imported: number;
  skipped_duplicates: number;
  audit_events_created: number;
}
```

### Import Zod Schemas (`packages/shared/src/schemas/pastoral-import.schema.ts`)

```typescript
const importConfirmSchema = z.object({
  validation_token: z.string().min(1),
});

const severityEnum = z.enum(['routine', 'elevated', 'urgent', 'critical']);
```

---

## Cross-Module Integration Points

| Imported From | Service/Method | Purpose | Access Mode |
|---|---|---|---|
| `ComplianceModule` | `ComplianceService` | DSAR request lifecycle | Read + status check |
| Pastoral (own) | `ConcernService` (SW-1B) | Query pastoral concerns for DSAR + create imported concerns | Read + Write |
| Pastoral (own) | `CpRecordService` (SW-1C) | Query CP records for DSAR (tier 3) | Read-only (cp_access checked) |
| Pastoral (own) | `PastoralAuditService` (SW-1A) | Record DSAR decision and import audit events | Write |
| Pastoral (own) | `PastoralConfigService` (SW-1A) | Validate concern categories against tenant config | Read-only |

**Compliance module modification:** The `ComplianceModule` must be updated to call `PastoralDsarService.routeForReview()` when processing student access export requests. This requires:
1. `ComplianceModule` imports `PastoralModule` (via `forwardRef`)
2. `ComplianceService.execute()` checks if `subject_type === 'student'` and calls the pastoral DSAR routing
3. The compliance request enters a `pending_pastoral_review` intermediate state (or the pastoral review is synchronous within the `execute()` transaction)

---

## Audit Events Generated

### DSAR Events

| Event Type | When | Payload |
|---|---|---|
| `dsar_review_routed` | Pastoral records flagged for review | `{ compliance_request_id, student_id, review_count, tier3_count }` |
| `dsar_review_decided` | Decision submitted for a record | `{ review_id, compliance_request_id, record_type, record_id, decision, legal_basis (if exclude) }` |
| `dsar_review_completed` | All reviews for a request are decided | `{ compliance_request_id, total_reviews, included, redacted, excluded }` |

### Import Events

| Event Type | When | Payload |
|---|---|---|
| `historical_import_validated` | CSV validated (preview generated) | `{ user_id, total_rows, valid_rows, error_rows }` |
| `historical_import_executed` | Import confirmed and records created | `{ user_id, total_imported, skipped_duplicates }` |
| `concern_created` | Per imported concern | `{ concern_id, student_id, source: 'historical_import', imported_by }` |

---

## Permissions

| Permission Key | Description |
|---|---|
| `pastoral.dsar_review` | Review, decide on, and view pastoral DSAR review records |
| `pastoral.import_historical` | Upload, validate, and confirm historical concern imports |

**Note on DSAR review:** The `pastoral.dsar_review` permission is typically assigned to the DLP only. For Tier 3 records within the DSAR review, the reviewer must also have `cp_access`. If a reviewer lacks `cp_access`, they see Tier 1/2 reviews only -- Tier 3 reviews are invisible to them (same zero-discoverability principle as elsewhere).

---

## Test Requirements

### DSAR Unit Tests

| Test | File |
|---|---|
| `routeForReview` creates review rows for all matching pastoral concerns | `pastoral-dsar.service.spec.ts` |
| `routeForReview` includes CP records when routing user has cp_access | `pastoral-dsar.service.spec.ts` |
| `routeForReview` excludes CP records when routing user lacks cp_access | `pastoral-dsar.service.spec.ts` |
| `routeForReview` does not create duplicates on re-run | `pastoral-dsar.service.spec.ts` |
| `submitDecision` with `include` succeeds | `pastoral-dsar.service.spec.ts` |
| `submitDecision` with `redact` requires `redaction_details` | `pastoral-dsar.service.spec.ts` |
| `submitDecision` with `exclude` requires `exclusion_legal_basis` + `exclusion_justification` | `pastoral-dsar.service.spec.ts` |
| `submitDecision` with `exclude` + legal_basis `other` requires detailed justification (>20 chars) | `pastoral-dsar.service.spec.ts` |
| `submitDecision` generates audit event | `pastoral-dsar.service.spec.ts` |
| `allReviewsComplete` returns false when pending reviews exist | `pastoral-dsar.service.spec.ts` |
| `allReviewsComplete` returns true when all reviews decided | `pastoral-dsar.service.spec.ts` |
| `getReviewedRecords` returns only included and redacted records | `pastoral-dsar.service.spec.ts` |
| `getReviewedRecords` applies redactions to redacted records | `pastoral-dsar.service.spec.ts` |
| Tier 3 review records invisible to user without cp_access | `pastoral-dsar.service.spec.ts` |

### Import Unit Tests

| Test | File |
|---|---|
| Valid CSV produces correct validation report | `pastoral-import.service.spec.ts` |
| Missing required fields produce row-level errors | `pastoral-import.service.spec.ts` |
| Unrecognised category produces error | `pastoral-import.service.spec.ts` |
| Invalid severity produces error | `pastoral-import.service.spec.ts` |
| Unmatched student identifier produces error | `pastoral-import.service.spec.ts` |
| Future date produces error | `pastoral-import.service.spec.ts` |
| `child_protection` category produces error (no Tier 3 import) | `pastoral-import.service.spec.ts` |
| `urgent`/`critical` severity produces warning | `pastoral-import.service.spec.ts` |
| Duplicate hash detection skips row with warning | `pastoral-import.service.spec.ts` |
| Confirm creates concerns with `imported = true` | `pastoral-import.service.spec.ts` |
| Confirm creates audit events with `source = 'historical_import'` | `pastoral-import.service.spec.ts` |
| Confirm with invalid/expired validation token throws | `pastoral-import.service.spec.ts` |
| Re-upload of same CSV skips previously imported rows (idempotency) | `pastoral-import.service.spec.ts` |
| Student resolution works with both enrolment ID and name+DOB format | `pastoral-import.service.spec.ts` |
| Tier assignment: routine/elevated = Tier 1, urgent = Tier 2 | `pastoral-import.service.spec.ts` |
| Template generation produces valid CSV buffer | `pastoral-import.service.spec.ts` |

### RLS Leakage Tests

| Test | File |
|---|---|
| Tenant A DSAR reviews not visible to Tenant B | `pastoral-dsar.service.spec.ts` |
| Tenant A imported concerns not visible to Tenant B | `pastoral-import.service.spec.ts` |

### Permission Tests

| Test | File |
|---|---|
| User without `pastoral.dsar_review` gets 403 on DSAR endpoints | `pastoral-dsar.controller.spec.ts` |
| User without `pastoral.import_historical` gets 403 on import endpoints | `pastoral-import.controller.spec.ts` |

---

## Verification Checklist

### DSAR

- [ ] `routeForReview` creates correct number of review rows
- [ ] Tier 3 records only visible to reviewers with cp_access
- [ ] Decision validation: `redact` requires details, `exclude` requires legal basis + justification
- [ ] `other` legal basis requires justification > 20 characters
- [ ] Every decision generates an immutable audit event
- [ ] `getReviewedRecords` correctly filters and applies redactions
- [ ] Integration with compliance module: DSAR for student subjects triggers pastoral routing
- [ ] `allReviewsComplete` accurately reflects pending state

### Import

- [ ] CSV parsing handles various formats (UTF-8 BOM, different line endings)
- [ ] All validation rules produce correct errors/warnings
- [ ] `child_protection` category is rejected with clear error message
- [ ] Student resolution works with enrolment ID format
- [ ] Student resolution works with name+DOB format
- [ ] Idempotency: duplicate hash prevents re-import
- [ ] Imported concerns have `imported = true` and correct `logged_by`
- [ ] Every imported concern generates a `concern_created` audit event with `source = 'historical_import'`
- [ ] Tier assignment is correct (routine/elevated = Tier 1, urgent = Tier 2, critical rejected or Tier 2)
- [ ] Validation token expires after reasonable time (e.g., 30 minutes)
- [ ] Template CSV has correct headers and example row

### General

- [ ] All RLS leakage tests pass
- [ ] All permission tests pass
- [ ] `turbo lint` and `turbo type-check` pass
- [ ] Regression suite passes (`turbo test`)

---

## Files Created / Modified

| Action | Path |
|---|---|
| CREATE | `apps/api/src/modules/pastoral/pastoral-dsar.service.ts` |
| CREATE | `apps/api/src/modules/pastoral/pastoral-dsar.service.spec.ts` |
| CREATE | `apps/api/src/modules/pastoral/pastoral-dsar.controller.ts` |
| CREATE | `apps/api/src/modules/pastoral/pastoral-dsar.controller.spec.ts` |
| CREATE | `apps/api/src/modules/pastoral/pastoral-import.service.ts` |
| CREATE | `apps/api/src/modules/pastoral/pastoral-import.service.spec.ts` |
| CREATE | `apps/api/src/modules/pastoral/pastoral-import.controller.ts` |
| CREATE | `apps/api/src/modules/pastoral/pastoral-import.controller.spec.ts` |
| CREATE | `packages/shared/src/schemas/pastoral-dsar.schema.ts` |
| CREATE | `packages/shared/src/schemas/pastoral-import.schema.ts` |
| MODIFY | `packages/shared/src/index.ts` (export new schemas) |
| MODIFY | `packages/prisma/schema.prisma` (add `pastoral_dsar_reviews` table, add `imported` + `import_hash` columns to `pastoral_concerns`) |
| CREATE | `packages/prisma/migrations/YYYYMMDD_sw_3c_dsar_import/migration.sql` |
| MODIFY | `apps/api/src/modules/pastoral/pastoral.module.ts` (register new services/controllers) |
| MODIFY | `apps/api/src/modules/compliance/compliance.module.ts` (import PastoralModule via forwardRef) |
| MODIFY | `apps/api/src/modules/compliance/compliance.service.ts` (call pastoral DSAR routing for student subjects) |
| MODIFY | `packages/prisma/seed/permissions.ts` (add `pastoral.dsar_review`, `pastoral.import_historical`) |
