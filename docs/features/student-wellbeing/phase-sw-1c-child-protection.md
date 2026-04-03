---
sub-phase: SW-1C
name: Child Protection Fortress
status: NOT STARTED
dependencies: [SW-1A, SW-1B]
estimated-effort: High
date: 2026-03-27
---

# SW-1C: Child Protection Fortress

## Summary

This sub-phase implements the Tier 3 child protection infrastructure: the physically separated `cp_records` table with dual RLS enforcement, DLP-managed per-user access grants, a dedicated guard that reveals nothing about CP record existence, mandated report lifecycle management, and watermarked PDF export with purpose tracking. Every read and write to CP data generates an immutable `pastoral_events` entry. The security posture is defence-in-depth: PostgreSQL RLS (tenant + user-level), application-layer guard, and immutable audit chronology. Even if any one layer is misconfigured, the others prevent leakage.

This is the most security-critical sub-phase in the entire Student Wellbeing module. It must be reviewed with the same gravity as a financial controls implementation.

---

## Prerequisites

| Dependency | What must be complete                                                                                                                                                                                                                                                                                                               | Verification                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| SW-1A      | `app.current_user_id` set in every RLS transaction; `prevent_immutable_modification()` trigger function exists; `pastoral_events` table created with INSERT-only trigger; `cp_records` table created with dual RLS policy; `cp_access_grants` table created with partial unique index; `pastoral_concerns` tiered RLS policy active | Run migration, verify `SET LOCAL app.current_user_id` in `createRlsClient()`, verify `cp_records` RLS policy via `\dp cp_records` |
| SW-1B      | `PastoralEventService` operational (can INSERT into `pastoral_events`); `ConcernService` can create concerns including tier=3 (which triggers auto-escalation trigger); `pastoral_concerns` tiered RLS tested and passing                                                                                                           | Run SW-1B test suite; verify a tier=3 concern is invisible to non-DLP users at RLS level                                          |

---

## File Paths

All paths relative to repository root.

### New Files

| File                                                                         | Purpose                                       |
| ---------------------------------------------------------------------------- | --------------------------------------------- |
| `apps/api/src/modules/child-protection/child-protection.module.ts`           | NestJS module definition                      |
| `apps/api/src/modules/child-protection/controllers/cp-records.controller.ts` | CP record CRUD endpoints                      |
| `apps/api/src/modules/child-protection/controllers/cp-access.controller.ts`  | Grant/revoke CP access endpoints              |
| `apps/api/src/modules/child-protection/controllers/cp-export.controller.ts`  | Tier 3 export with watermarking               |
| `apps/api/src/modules/child-protection/services/cp-record.service.ts`        | CP record business logic                      |
| `apps/api/src/modules/child-protection/services/cp-access.service.ts`        | CP access grant management                    |
| `apps/api/src/modules/child-protection/services/cp-export.service.ts`        | PDF generation + watermarking                 |
| `apps/api/src/modules/child-protection/services/mandated-report.service.ts`  | Mandated report lifecycle                     |
| `apps/api/src/modules/child-protection/guards/cp-access.guard.ts`            | Guard checking `cp_access_grants`             |
| `apps/api/src/modules/child-protection/child-protection.constants.ts`        | Export purpose enum, mandated report statuses |
| `packages/shared/src/schemas/cp-record.schema.ts`                            | Zod schemas for CP record DTOs                |
| `packages/shared/src/schemas/cp-access.schema.ts`                            | Zod schemas for CP access grant DTOs          |
| `packages/shared/src/schemas/cp-export.schema.ts`                            | Zod schemas for CP export DTOs                |
| `packages/shared/src/schemas/mandated-report.schema.ts`                      | Zod schemas for mandated report DTOs          |
| `apps/api/src/modules/pdf-rendering/templates/cp-export-en.template.ts`      | English CP export PDF template                |
| `apps/api/src/modules/pdf-rendering/templates/cp-export-ar.template.ts`      | Arabic CP export PDF template                 |

### New Test Files

| File                                                                              | Purpose                                               |
| --------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `apps/api/src/modules/child-protection/services/cp-record.service.spec.ts`        | Unit tests for CP record service                      |
| `apps/api/src/modules/child-protection/services/cp-access.service.spec.ts`        | Unit tests for CP access service                      |
| `apps/api/src/modules/child-protection/services/cp-export.service.spec.ts`        | Unit tests for CP export service                      |
| `apps/api/src/modules/child-protection/services/mandated-report.service.spec.ts`  | Unit tests for mandated report service                |
| `apps/api/src/modules/child-protection/guards/cp-access.guard.spec.ts`            | Unit tests for CP access guard                        |
| `apps/api/src/modules/child-protection/controllers/cp-records.controller.spec.ts` | Controller tests                                      |
| `apps/api/src/modules/child-protection/controllers/cp-access.controller.spec.ts`  | Controller tests                                      |
| `apps/api/src/modules/child-protection/controllers/cp-export.controller.spec.ts`  | Controller tests                                      |
| `apps/api/test/child-protection-rls.spec.ts`                                      | Integration: RLS leakage + zero-discoverability tests |

### Modified Files

| File                                                          | Change                                                                                                   |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `apps/api/src/app.module.ts`                                  | Import `ChildProtectionModule`                                                                           |
| `apps/api/src/modules/pdf-rendering/pdf-rendering.service.ts` | Register `cp-export` template key in `TEMPLATES` map                                                     |
| `apps/api/src/modules/pdf-rendering/pdf-rendering.module.ts`  | No change needed (already exports `PdfRenderingService`)                                                 |
| `packages/shared/src/schemas/index.ts`                        | Re-export CP schemas                                                                                     |
| `packages/prisma/seed/permissions.ts`                         | Add `pastoral.manage_cp_access`, `pastoral.export_tier3`, `pastoral.manage_mandated_reports` permissions |

---

## API Endpoints

All endpoints are under `/api/v1/child-protection/`. The `CpAccessGuard` is applied at the controller level to all CP record and export endpoints. CP access management endpoints use RBAC `@RequiresPermission` instead (the DLP doesn't need a grant to themselves to manage grants).

### CP Records

| Method  | Path              | Permission / Guard | Description                                                            |
| ------- | ----------------- | ------------------ | ---------------------------------------------------------------------- |
| `POST`  | `/cp-records`     | `CpAccessGuard`    | Create a CP record (linked to tier=3 concern)                          |
| `GET`   | `/cp-records`     | `CpAccessGuard`    | List CP records for a student (query param: `student_id`)              |
| `GET`   | `/cp-records/:id` | `CpAccessGuard`    | Get single CP record with full detail                                  |
| `PATCH` | `/cp-records/:id` | `CpAccessGuard`    | Update CP record metadata (mandated report status, Tusla contact info) |

### CP Access Grants

| Method   | Path                      | Permission / Guard                                 | Description                                                                        |
| -------- | ------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `POST`   | `/cp-access/grants`       | `@RequiresPermission('pastoral.manage_cp_access')` | Grant CP access to a user                                                          |
| `DELETE` | `/cp-access/grants/:id`   | `@RequiresPermission('pastoral.manage_cp_access')` | Revoke CP access (sets `revoked_at`)                                               |
| `GET`    | `/cp-access/grants`       | `@RequiresPermission('pastoral.manage_cp_access')` | List all active grants for tenant                                                  |
| `GET`    | `/cp-access/grants/check` | `AuthGuard` only                                   | Check if the current user has active CP access (returns `{ has_access: boolean }`) |

### Mandated Reports

| Method  | Path                                                 | Permission / Guard                                                          | Description                                                   |
| ------- | ---------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `POST`  | `/cp-records/:id/mandated-report`                    | `CpAccessGuard` + `@RequiresPermission('pastoral.manage_mandated_reports')` | Create mandated report draft linked to CP record              |
| `PATCH` | `/cp-records/:cpRecordId/mandated-report/:id/submit` | `CpAccessGuard` + `@RequiresPermission('pastoral.manage_mandated_reports')` | Submit report (draft -> submitted, records Tusla ref)         |
| `PATCH` | `/cp-records/:cpRecordId/mandated-report/:id/status` | `CpAccessGuard` + `@RequiresPermission('pastoral.manage_mandated_reports')` | Update status (submitted -> acknowledged -> outcome_received) |
| `GET`   | `/cp-records/:cpRecordId/mandated-report`            | `CpAccessGuard`                                                             | Get mandated report for a CP record                           |

### CP Exports

| Method | Path                         | Permission / Guard                                               | Description                                                              |
| ------ | ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `POST` | `/cp-export/preview`         | `CpAccessGuard` + `@RequiresPermission('pastoral.export_tier3')` | Generate export preview (returns record count, date range, summary)      |
| `POST` | `/cp-export/generate`        | `CpAccessGuard` + `@RequiresPermission('pastoral.export_tier3')` | Confirm and generate watermarked PDF; returns download token             |
| `GET`  | `/cp-export/download/:token` | `CpAccessGuard` + `@RequiresPermission('pastoral.export_tier3')` | Download generated PDF (one-time token, expires after use or 15 minutes) |

---

## Service Method Signatures

### CpRecordService (`cp-record.service.ts`)

```typescript
@Injectable()
export class CpRecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Create a CP record linked to a tier=3 pastoral concern.
   * Uses its own interactive transaction with BOTH app.current_tenant_id
   * AND app.current_user_id set — activating the cp_records RLS policy.
   *
   * Generates pastoral_event: cp_record_created (entity_type: 'cp_record')
   */
  async create(
    tenantId: string,
    userId: string,
    dto: CreateCpRecordDto,
    ipAddress: string | null,
  ): Promise<{ data: CpRecordResponse }>;

  /**
   * List CP records for a student. DLP-only (enforced by RLS + guard).
   * Every call generates a pastoral_event: cp_record_accessed.
   *
   * Supports pagination: page, pageSize.
   * Returns records ordered by created_at DESC.
   */
  async listByStudent(
    tenantId: string,
    userId: string,
    query: ListCpRecordsQuery,
    ipAddress: string | null,
  ): Promise<{ data: CpRecordSummary[]; meta: PaginationMeta }>;

  /**
   * Get single CP record with full detail.
   * Generates pastoral_event: cp_record_accessed.
   */
  async getById(
    tenantId: string,
    userId: string,
    recordId: string,
    ipAddress: string | null,
  ): Promise<{ data: CpRecordResponse }>;

  /**
   * Update CP record metadata. Only specific fields are updatable:
   * mandated_report_status, mandated_report_ref, tusla_contact_name,
   * tusla_contact_date, legal_hold.
   *
   * Generates pastoral_event: cp_record_updated with changed fields.
   */
  async update(
    tenantId: string,
    userId: string,
    recordId: string,
    dto: UpdateCpRecordDto,
    ipAddress: string | null,
  ): Promise<{ data: CpRecordResponse }>;
}
```

**Critical implementation detail:** `CpRecordService` does NOT use the standard `createRlsClient(prisma, { tenant_id })` pattern. It creates its own interactive transaction that sets BOTH context variables:

```typescript
// Inside every CpRecordService method:
await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', $1, true)`, tenantId);
  await tx.$executeRawUnsafe(`SELECT set_config('app.current_user_id', $1, true)`, userId);
  // ... all queries within this tx respect both RLS policies
});
```

After SW-1A modifies `createRlsClient()` to accept `user_id`, this service should use the updated `createRlsClient(prisma, { tenant_id, user_id })` instead. The key point is that **both** context variables must be set before any query touches `cp_records`.

### CpAccessService (`cp-access.service.ts`)

```typescript
@Injectable()
export class CpAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Grant CP access to a user. Only the DLP (or principal with
   * pastoral.manage_cp_access permission) can call this.
   *
   * Creates cp_access_grants row.
   * Generates pastoral_event: cp_access_granted.
   *
   * Idempotent: if user already has an active grant, returns existing grant
   * without creating a duplicate.
   */
  async grant(
    tenantId: string,
    grantedByUserId: string,
    dto: GrantCpAccessDto,
    ipAddress: string | null,
  ): Promise<{ data: CpAccessGrantResponse }>;

  /**
   * Revoke CP access. Sets revoked_at and revoked_by_user_id.
   * Generates pastoral_event: cp_access_revoked.
   *
   * A user cannot revoke their own access (DLP cannot lock themselves out).
   */
  async revoke(
    tenantId: string,
    revokedByUserId: string,
    grantId: string,
    dto: RevokeCpAccessDto,
    ipAddress: string | null,
  ): Promise<{ data: { revoked: true } }>;

  /**
   * List all active CP access grants for the tenant.
   * Returns: grant id, user name, granted_by name, granted_at.
   */
  async listActive(tenantId: string): Promise<{ data: CpAccessGrantSummary[] }>;

  /**
   * Check if a specific user has active CP access.
   * Used by CpAccessGuard and by service-layer checks.
   * Does NOT generate an audit event (called on every CP-related request).
   */
  async hasAccess(tenantId: string, userId: string): Promise<boolean>;
}
```

### CpAccessGuard (`cp-access.guard.ts`)

```typescript
@Injectable()
export class CpAccessGuard implements CanActivate {
  constructor(private readonly cpAccessService: CpAccessService) {}

  /**
   * Checks cp_access_grants for the current user.
   *
   * SECURITY: On failure, returns a generic 403 "Forbidden" with no
   * indication that CP records exist. The error response must be
   * indistinguishable from any other permission denial. Specifically:
   *
   * - Do NOT say "you need CP access"
   * - Do NOT say "CP records are restricted"
   * - Do NOT return a different HTTP status than other permission failures
   * - Use the same error shape as PermissionGuard: { error: { code: 'PERMISSION_DENIED', message: 'Forbidden' } }
   *
   * This guard runs AFTER AuthGuard and PermissionGuard in the guard chain.
   */
  async canActivate(context: ExecutionContext): Promise<boolean>;
}
```

**Guard chain order on CP endpoints:** `AuthGuard` -> `PermissionGuard` (if `@RequiresPermission` present) -> `CpAccessGuard`.

### MandatedReportService (`mandated-report.service.ts`)

```typescript
@Injectable()
export class MandatedReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
  ) {}

  /**
   * Create a mandated report draft linked to a CP record.
   * Sets mandated_report_status = 'draft' on the cp_records row.
   * Generates pastoral_event: mandated_report_generated.
   *
   * A CP record can have at most one mandated report. If one already exists,
   * returns 409 Conflict.
   */
  async createDraft(
    tenantId: string,
    userId: string,
    cpRecordId: string,
    dto: CreateMandatedReportDto,
    ipAddress: string | null,
  ): Promise<{ data: MandatedReportResponse }>;

  /**
   * Submit the mandated report. Transitions status: draft -> submitted.
   * Records Tusla reference number.
   * Generates pastoral_event: mandated_report_submitted.
   *
   * Validates: status must be 'draft'. Returns 400 if not.
   */
  async submit(
    tenantId: string,
    userId: string,
    cpRecordId: string,
    mandatedReportId: string,
    dto: SubmitMandatedReportDto,
    ipAddress: string | null,
  ): Promise<{ data: MandatedReportResponse }>;

  /**
   * Update mandated report status through lifecycle.
   * Valid transitions:
   *   submitted -> acknowledged
   *   acknowledged -> outcome_received
   *
   * Each transition generates a pastoral_event with the old and new status.
   */
  async updateStatus(
    tenantId: string,
    userId: string,
    cpRecordId: string,
    mandatedReportId: string,
    dto: UpdateMandatedReportStatusDto,
    ipAddress: string | null,
  ): Promise<{ data: MandatedReportResponse }>;

  /**
   * Get the mandated report for a CP record. Returns null if none exists.
   * Generates pastoral_event: cp_record_accessed (mandated report is part
   * of the CP record access surface).
   */
  async getForCpRecord(
    tenantId: string,
    userId: string,
    cpRecordId: string,
    ipAddress: string | null,
  ): Promise<{ data: MandatedReportResponse | null }>;
}
```

**Mandated report status machine:**

```
draft -> submitted -> acknowledged -> outcome_received
```

No backward transitions. Each forward transition is validated in `updateStatus()`. Invalid transitions return 400 with `{ error: { code: 'INVALID_STATUS_TRANSITION', message: 'Cannot transition from {current} to {requested}' } }`.

### CpExportService (`cp-export.service.ts`)

```typescript
@Injectable()
export class CpExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfRenderingService: PdfRenderingService,
    private readonly eventService: PastoralEventService,
    private readonly sequenceService: SequenceService,
  ) {}

  /**
   * Generate export preview. Returns metadata about what will be exported
   * without generating the PDF. Used by the confirmation step.
   *
   * Does NOT generate an audit event (preview is not an export).
   */
  async preview(
    tenantId: string,
    userId: string,
    dto: CpExportPreviewDto,
  ): Promise<{ data: CpExportPreview }>;

  /**
   * Generate the watermarked PDF export.
   *
   * Workflow:
   * 1. Validate purpose is from controlled list
   * 2. Generate unique export reference ID via SequenceService (prefix: CPX)
   * 3. Query CP records matching the export scope
   * 4. Render PDF using PdfRenderingService with cp-export template
   * 5. Apply watermark: exporting user's name, date/time, purpose, export ref ID
   *    - Visual watermark on every page (diagonal text, 30% opacity)
   *    - Embedded in PDF metadata (Author, Subject, Keywords fields)
   * 6. Store PDF temporarily (in-memory or temp file, NOT in database)
   * 7. Generate one-time download token (UUID, stored in Redis, expires 15 min)
   * 8. Record pastoral_event: record_exported with full metadata
   * 9. Return download token + export ref ID
   */
  async generate(
    tenantId: string,
    userId: string,
    dto: CpExportGenerateDto,
    ipAddress: string | null,
  ): Promise<{ data: CpExportResult }>;

  /**
   * Download a generated PDF using the one-time token.
   * Token is invalidated after use. Expired tokens return 404.
   *
   * Generates pastoral_event: record_exported (download_completed).
   */
  async download(
    tenantId: string,
    userId: string,
    token: string,
    ipAddress: string | null,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }>;
}
```

**Controlled export purpose list (enforced by Zod enum):**

| Key                 | Label                            |
| ------------------- | -------------------------------- |
| `tusla_request`     | Tusla request                    |
| `section_26`        | Section 26 inquiry               |
| `legal_proceedings` | Legal proceedings                |
| `school_transfer`   | School transfer (CP records)     |
| `board_oversight`   | Board of Management oversight    |
| `other`             | Other (freeform reason required) |

When purpose is `other`, the `other_reason` field becomes required in the DTO.

---

## Zod Schemas

### `packages/shared/src/schemas/cp-record.schema.ts`

```typescript
// --- Create ---
export const createCpRecordSchema = z.object({
  concern_id: z.string().uuid(), // must be a tier=3 pastoral_concern
  student_id: z.string().uuid(),
  record_type: z.enum([
    'concern',
    'mandated_report',
    'tusla_correspondence',
    'section_26',
    'disclosure',
    'retrospective_disclosure',
  ]),
  narrative: z.string().min(1).max(50000),
});

// --- Update (metadata only) ---
export const updateCpRecordSchema = z.object({
  tusla_contact_name: z.string().max(255).optional(),
  tusla_contact_date: z.string().datetime().optional(),
  legal_hold: z.boolean().optional(),
});

// --- List query ---
export const listCpRecordsQuerySchema = z.object({
  student_id: z.string().uuid(),
  record_type: z
    .enum([
      'concern',
      'mandated_report',
      'tusla_correspondence',
      'section_26',
      'disclosure',
      'retrospective_disclosure',
    ])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
```

### `packages/shared/src/schemas/cp-access.schema.ts`

```typescript
export const grantCpAccessSchema = z.object({
  user_id: z.string().uuid(), // user to grant access to
});

export const revokeCpAccessSchema = z.object({
  revocation_reason: z.string().min(1).max(1000),
});
```

### `packages/shared/src/schemas/mandated-report.schema.ts`

```typescript
export const createMandatedReportSchema = z.object({
  // No additional fields needed — draft is created from the CP record context.
  // The CP record already holds student_id, narrative, etc.
});

export const submitMandatedReportSchema = z.object({
  tusla_reference: z.string().min(1).max(100),
});

export const updateMandatedReportStatusSchema = z.object({
  status: z.enum(['acknowledged', 'outcome_received']),
  outcome_notes: z.string().max(10000).optional(),
});
```

### `packages/shared/src/schemas/cp-export.schema.ts`

```typescript
export const cpExportPurpose = z.enum([
  'tusla_request',
  'section_26',
  'legal_proceedings',
  'school_transfer',
  'board_oversight',
  'other',
]);

export const cpExportPreviewSchema = z.object({
  student_id: z.string().uuid(),
  record_types: z
    .array(
      z.enum([
        'concern',
        'mandated_report',
        'tusla_correspondence',
        'section_26',
        'disclosure',
        'retrospective_disclosure',
      ]),
    )
    .optional(), // if omitted, all types included
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
});

export const cpExportGenerateSchema = z
  .object({
    student_id: z.string().uuid(),
    purpose: cpExportPurpose,
    other_reason: z.string().min(1).max(1000).optional(),
    record_types: z
      .array(
        z.enum([
          'concern',
          'mandated_report',
          'tusla_correspondence',
          'section_26',
          'disclosure',
          'retrospective_disclosure',
        ]),
      )
      .optional(),
    date_from: z.string().datetime().optional(),
    date_to: z.string().datetime().optional(),
    locale: z.enum(['en', 'ar']).default('en'),
  })
  .refine(
    (data) => data.purpose !== 'other' || (data.other_reason && data.other_reason.length > 0),
    { message: 'other_reason is required when purpose is "other"', path: ['other_reason'] },
  );
```

---

## NestJS Module Definition

```typescript
// child-protection.module.ts
@Module({
  imports: [
    PrismaModule,
    AuditLogModule,
    PdfRenderingModule,
    TenantsModule, // for SequenceService (export ref IDs)
    // NOTE: PastoralModule is NOT imported here to avoid circular dependency.
    // PastoralEventService is imported directly or provided via forwardRef.
  ],
  controllers: [CpRecordsController, CpAccessController, CpExportController],
  providers: [
    CpRecordService,
    CpAccessService,
    CpExportService,
    MandatedReportService,
    CpAccessGuard,
  ],
  exports: [
    CpRecordService, // consumed by behaviour safeguarding facade (SW-2D)
    CpAccessService, // consumed by PastoralModule for tier-access checks
    CpAccessGuard, // reusable guard
  ],
})
export class ChildProtectionModule {}
```

**Circular dependency note:** `PastoralEventService` (from the `PastoralModule`, built in SW-1B) writes to `pastoral_events`. The `ChildProtectionModule` needs this service to record audit events. Use `@Inject(forwardRef(() => PastoralEventService))` or extract `PastoralEventService` into a shared sub-module that both `PastoralModule` and `ChildProtectionModule` import. The preferred approach is a `PastoralCoreModule` containing `PastoralEventService` and `PrismaModule`, imported by both.

---

## Immutable Audit Events Generated

Every CP operation generates an immutable `pastoral_events` row. These are the event types specific to SW-1C:

| Event Type                       | Entity Type       | Trigger                                                             | Payload Fields                                                                                    |
| -------------------------------- | ----------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `cp_record_created`              | `cp_record`       | `CpRecordService.create()`                                          | `cp_record_id, concern_id, student_id, record_type`                                               |
| `cp_record_accessed`             | `cp_record`       | Every `getById()`, `listByStudent()` call, and mandated report read | `cp_record_id, student_id`                                                                        |
| `cp_record_updated`              | `cp_record`       | `CpRecordService.update()`                                          | `cp_record_id, changed_fields, previous_values, new_values`                                       |
| `cp_access_granted`              | `cp_access_grant` | `CpAccessService.grant()`                                           | `grant_id, granted_to_user_id, granted_by_user_id`                                                |
| `cp_access_revoked`              | `cp_access_grant` | `CpAccessService.revoke()`                                          | `grant_id, user_id, revoked_by_user_id, reason`                                                   |
| `mandated_report_generated`      | `cp_record`       | `MandatedReportService.createDraft()`                               | `cp_record_id, student_id`                                                                        |
| `mandated_report_submitted`      | `cp_record`       | `MandatedReportService.submit()`                                    | `cp_record_id, student_id, tusla_ref`                                                             |
| `mandated_report_status_changed` | `cp_record`       | `MandatedReportService.updateStatus()`                              | `cp_record_id, old_status, new_status, outcome_notes`                                             |
| `record_exported`                | `export`          | `CpExportService.generate()`                                        | `export_tier: 3, entity_type: 'cp_record', entity_ids, purpose, export_ref_id, watermarked: true` |
| `record_export_downloaded`       | `export`          | `CpExportService.download()`                                        | `export_ref_id, downloaded_by_user_id`                                                            |

**All CP events are logged at `tier: 3` in the `pastoral_events` row.** This ensures CP audit events are themselves subject to tier-based visibility when audit logs are queried.

---

## Watermarking Implementation

The CP export PDF watermark has two components:

### 1. Visual watermark (every page)

Rendered as part of the HTML template before Puppeteer PDF generation. Each page includes a fixed-position, rotated, semi-transparent overlay:

```css
.cp-watermark {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-45deg);
  font-size: 48px;
  color: rgba(200, 0, 0, 0.08);
  white-space: nowrap;
  pointer-events: none;
  z-index: 9999;
}
```

Content: `{Exporting User Name} | {ISO DateTime} | {Purpose} | Ref: {CPX-YYYYMM-NNN}`

### 2. PDF metadata watermark

Set via Puppeteer `page.pdf()` options or post-processing:

| Metadata Field | Value                                                                         |
| -------------- | ----------------------------------------------------------------------------- |
| Author         | Exporting user's full name                                                    |
| Subject        | `Child Protection Records Export - {Purpose}`                                 |
| Keywords       | `export_ref:{CPX-YYYYMM-NNN}, tenant:{tenant_id}, exported_at:{ISO DateTime}` |
| Creator        | `EduPod Child Protection Module`                                              |

### Export reference format

Generated via `SequenceService` with sequence type `cp_export` and prefix `CPX`. Format: `CPX-YYYYMM-NNN` (e.g., `CPX-202603-001`).

---

## Security Verification Checklist

This checklist MUST be completed and verified before SW-1C is considered done. Each item is a test that must pass.

### RLS Enforcement

- [ ] **CP-SEC-01:** User without `cp_access_grants` row cannot read any `cp_records` rows, even with correct `tenant_id` set via RLS
- [ ] **CP-SEC-02:** User without `cp_access_grants` row cannot read `pastoral_concerns` rows where `tier = 3`, even with correct `tenant_id`
- [ ] **CP-SEC-03:** User with revoked grant (`revoked_at IS NOT NULL`) cannot read `cp_records` or tier=3 `pastoral_concerns`
- [ ] **CP-SEC-04:** User with active grant in Tenant A cannot read `cp_records` in Tenant B (cross-tenant isolation)
- [ ] **CP-SEC-05:** System sentinel user (`00000000-0000-0000-0000-000000000000`) cannot read `cp_records` (no grant row exists for sentinel)
- [ ] **CP-SEC-06:** `cp_access_grants` table itself is tenant-scoped via standard RLS (Tenant B cannot see Tenant A's grants)
- [ ] **CP-SEC-07:** `pastoral_events` rows with `tier = 3` are subject to tenant RLS (but NOT cp_access_grants filtering -- all tenant staff with audit log access can see that events occurred, but event payloads for tier=3 are filtered at the application layer by the event read service, not at RLS level)

### Zero Discoverability

- [ ] **CP-SEC-08:** A non-DLP user querying `GET /api/v1/pastoral/concerns?student_id={id}` for a student who has tier=3 concerns receives ONLY tier 1/2 concerns. No indication of hidden records (no `total` count including tier=3, no "some records are hidden" message, no different response shape)
- [ ] **CP-SEC-09:** A non-DLP user querying `GET /api/v1/pastoral/concerns?student_id={id}` for a student who has ONLY tier=3 concerns receives an empty result set, not a 403 or 404
- [ ] **CP-SEC-10:** Search index (`SearchModule`) does not contain any data from `cp_records` or from `pastoral_concerns` where `tier = 3`
- [ ] **CP-SEC-11:** Student profile API response does not include any count or indicator of CP records existing
- [ ] **CP-SEC-12:** The `pastoral_cases` table's `tier` field (max tier of linked concerns) does not leak to non-DLP users. Cases linked to tier=3 concerns are visible to SST members but the `tier` field is capped at `2` in the API response for non-DLP users. (The case itself may be visible if it also has tier 1/2 concerns; only the tier indicator is masked.)

### Access Guard

- [ ] **CP-SEC-13:** `CpAccessGuard` returns 403 with error shape `{ error: { code: 'PERMISSION_DENIED', message: 'Forbidden' } }` -- identical to `PermissionGuard` failure shape
- [ ] **CP-SEC-14:** `CpAccessGuard` does not include "CP", "child protection", "access grant", or any CP-specific terminology in the 403 response
- [ ] **CP-SEC-15:** `CpAccessGuard` logs the rejected access attempt (for security monitoring) without revealing CP existence to the requesting user
- [ ] **CP-SEC-16:** Unauthenticated requests to CP endpoints return 401 (from `AuthGuard`), not 403 -- the guard chain order is correct

### Grant Lifecycle

- [ ] **CP-SEC-17:** Only users with `pastoral.manage_cp_access` permission can grant CP access
- [ ] **CP-SEC-18:** Only users with `pastoral.manage_cp_access` permission can revoke CP access
- [ ] **CP-SEC-19:** A user cannot revoke their own CP access
- [ ] **CP-SEC-20:** Granting access to a user who already has an active grant is idempotent (returns existing grant, does not create a duplicate)
- [ ] **CP-SEC-21:** Revoking a grant that is already revoked returns 404 (the grant is no longer in the active grants list)
- [ ] **CP-SEC-22:** After revocation, all subsequent CP record queries by the revoked user return empty results (RLS immediately enforces)

### Mandated Report Lifecycle

- [ ] **CP-SEC-23:** Mandated report status can only move forward: `draft -> submitted -> acknowledged -> outcome_received`
- [ ] **CP-SEC-24:** Backward transitions (e.g., submitted -> draft) return 400
- [ ] **CP-SEC-25:** Each status transition generates an immutable `pastoral_events` entry
- [ ] **CP-SEC-26:** A CP record can have at most one mandated report. Creating a second returns 409.

### Export Controls

- [ ] **CP-SEC-27:** Export `purpose` must be from the controlled enum. Arbitrary strings are rejected by Zod validation.
- [ ] **CP-SEC-28:** When `purpose = 'other'`, `other_reason` is required. Omitting it returns 400.
- [ ] **CP-SEC-29:** Every generated PDF has a visual watermark on every page
- [ ] **CP-SEC-30:** Every generated PDF has embedded metadata (Author, Subject, Keywords)
- [ ] **CP-SEC-31:** Download tokens are single-use. Second download attempt returns 404.
- [ ] **CP-SEC-32:** Download tokens expire after 15 minutes. Expired token returns 404.
- [ ] **CP-SEC-33:** Export generates an immutable `record_exported` event with full metadata (user, IP, purpose, scope, export ref ID)
- [ ] **CP-SEC-34:** Export requires BOTH `cp_access_grants` active AND `pastoral.export_tier3` permission. Having only one is insufficient.

### Immutability

- [ ] **CP-SEC-35:** `pastoral_events` rows with CP event types cannot be UPDATEd (trigger fires exception)
- [ ] **CP-SEC-36:** `pastoral_events` rows with CP event types cannot be DELETEd (trigger fires exception)
- [ ] **CP-SEC-37:** `pastoral_concern_versions` rows for tier=3 concerns are subject to the same immutability trigger

### Audit Trail Completeness

- [ ] **CP-SEC-38:** Creating a CP record generates exactly one `cp_record_created` event
- [ ] **CP-SEC-39:** Reading a CP record (by ID or in list) generates a `cp_record_accessed` event per record viewed
- [ ] **CP-SEC-40:** Updating a CP record generates a `cp_record_updated` event with before/after values
- [ ] **CP-SEC-41:** Granting CP access generates a `cp_access_granted` event
- [ ] **CP-SEC-42:** Revoking CP access generates a `cp_access_revoked` event with reason
- [ ] **CP-SEC-43:** Creating a mandated report draft generates a `mandated_report_generated` event
- [ ] **CP-SEC-44:** Submitting a mandated report generates a `mandated_report_submitted` event with Tusla ref
- [ ] **CP-SEC-45:** Each mandated report status change generates a `mandated_report_status_changed` event
- [ ] **CP-SEC-46:** Generating an export generates a `record_exported` event
- [ ] **CP-SEC-47:** Downloading an export generates a `record_export_downloaded` event
- [ ] **CP-SEC-48:** All CP audit events include `ip_address` when available (from request context)

---

## Test Requirements

### Unit Tests

#### `cp-record.service.spec.ts`

| Test                                                                      | Category             |
| ------------------------------------------------------------------------- | -------------------- |
| should create a CP record linked to a tier=3 concern                      | happy path           |
| should reject creation when concern_id does not exist                     | validation           |
| should reject creation when concern tier is not 3                         | validation           |
| should generate cp_record_created pastoral event on creation              | audit                |
| should list CP records for a student with pagination                      | happy path           |
| should generate cp_record_accessed event for each record in list response | audit                |
| should get CP record by ID with full detail                               | happy path           |
| should generate cp_record_accessed event on get-by-id                     | audit                |
| should return 404 when CP record does not exist (not "access denied")     | zero discoverability |
| should update metadata fields (tusla_contact_name, legal_hold)            | happy path           |
| should reject update of non-updatable fields (narrative, student_id)      | validation           |
| should generate cp_record_updated event with changed fields               | audit                |
| should set both tenant_id and user_id in transaction context              | RLS                  |

#### `cp-access.service.spec.ts`

| Test                                                                            | Category    |
| ------------------------------------------------------------------------------- | ----------- |
| should grant CP access and create cp_access_grants row                          | happy path  |
| should generate cp_access_granted pastoral event                                | audit       |
| should be idempotent -- return existing grant if user already has active access | idempotency |
| should revoke CP access by setting revoked_at                                   | happy path  |
| should generate cp_access_revoked pastoral event with reason                    | audit       |
| should prevent self-revocation                                                  | validation  |
| should return 404 when revoking already-revoked grant                           | validation  |
| should list only active grants (revoked_at IS NULL and correct tenant)          | happy path  |
| should return true for hasAccess when active grant exists                       | happy path  |
| should return false for hasAccess when no grant exists                          | happy path  |
| should return false for hasAccess when grant is revoked                         | happy path  |

#### `mandated-report.service.spec.ts`

| Test                                                                       | Category      |
| -------------------------------------------------------------------------- | ------------- |
| should create mandated report draft and set status to 'draft' on CP record | happy path    |
| should return 409 if CP record already has a mandated report               | validation    |
| should generate mandated_report_generated pastoral event                   | audit         |
| should submit report: transition draft -> submitted with Tusla ref         | happy path    |
| should reject submit when status is not draft                              | state machine |
| should generate mandated_report_submitted pastoral event with tusla_ref    | audit         |
| should transition submitted -> acknowledged                                | state machine |
| should transition acknowledged -> outcome_received                         | state machine |
| should reject backward transition submitted -> draft                       | state machine |
| should reject invalid transition draft -> acknowledged                     | state machine |
| should generate mandated_report_status_changed event on each transition    | audit         |
| should return null when no mandated report exists for CP record            | happy path    |

#### `cp-export.service.spec.ts`

| Test                                                              | Category        |
| ----------------------------------------------------------------- | --------------- |
| should generate export preview with record count and date range   | happy path      |
| should not generate audit event on preview                        | audit           |
| should generate watermarked PDF with correct export ref ID        | happy path      |
| should generate record_exported pastoral event with full metadata | audit           |
| should include visual watermark text in rendered HTML             | watermark       |
| should include metadata in PDF (Author, Subject, Keywords)        | watermark       |
| should generate one-time download token stored in Redis           | happy path      |
| should invalidate download token after first use                  | token lifecycle |
| should expire download token after 15 minutes                     | token lifecycle |
| should require 'other_reason' when purpose is 'other'             | validation      |
| should reject invalid purpose values                              | validation      |
| should generate export ref via SequenceService with CPX prefix    | sequence        |

#### `cp-access.guard.spec.ts`

| Test                                                                    | Category             |
| ----------------------------------------------------------------------- | -------------------- |
| should allow request when user has active CP access grant               | happy path           |
| should return 403 when user has no CP access grant                      | access control       |
| should return 403 with generic error shape (no CP-specific terminology) | zero discoverability |
| should return 403 when user has revoked grant                           | access control       |
| should extract user from request.currentUser                            | integration          |
| should handle missing currentUser gracefully (return 403)               | edge case            |

### Integration / RLS Leakage Tests (`apps/api/test/child-protection-rls.spec.ts`)

These tests operate against a real database (test environment) and verify RLS policies work as intended.

| Test                                                                                                          | Category             |
| ------------------------------------------------------------------------------------------------------------- | -------------------- |
| **RLS-CP-01:** Tenant A user with CP grant can read Tenant A cp_records                                       | happy path           |
| **RLS-CP-02:** Tenant A user without CP grant reads zero cp_records (not 403)                                 | zero discoverability |
| **RLS-CP-03:** Tenant B user with CP grant in Tenant B cannot read Tenant A cp_records                        | cross-tenant         |
| **RLS-CP-04:** Tenant A user with CP grant cannot read Tenant B cp_records                                    | cross-tenant         |
| **RLS-CP-05:** User with revoked grant reads zero cp_records immediately after revocation                     | grant lifecycle      |
| **RLS-CP-06:** Tier=3 pastoral_concerns are invisible to users without CP grant                               | zero discoverability |
| **RLS-CP-07:** Tier=3 pastoral_concerns are visible to users with active CP grant                             | happy path           |
| **RLS-CP-08:** Tier=1 and tier=2 pastoral_concerns are visible regardless of CP grant status                  | non-interference     |
| **RLS-CP-09:** System sentinel user cannot read cp_records                                                    | sentinel isolation   |
| **RLS-CP-10:** cp_access_grants rows are tenant-scoped (Tenant B cannot see Tenant A grants)                  | cross-tenant         |
| **RLS-CP-11:** INSERT into cp_records by user with active grant succeeds                                      | write access         |
| **RLS-CP-12:** INSERT into cp_records by user without active grant fails (RLS WITH CHECK)                     | write access         |
| **RLS-CP-13:** pastoral_events with tier=3 are tenant-scoped via standard RLS                                 | audit isolation      |
| **RLS-CP-14:** pastoral_events immutability trigger fires on UPDATE attempt                                   | immutability         |
| **RLS-CP-15:** pastoral_events immutability trigger fires on DELETE attempt                                   | immutability         |
| **RLS-CP-16:** Count query on pastoral_concerns excludes tier=3 for non-DLP users (total count does not leak) | zero discoverability |

---

## Error Response Conventions

All error responses from CP endpoints follow the standard EduPod error shape. CP-specific error codes are intentionally vague to prevent information leakage.

| Scenario                                   | HTTP Status | Error Code                  | Message                                           |
| ------------------------------------------ | ----------- | --------------------------- | ------------------------------------------------- |
| User lacks CP access                       | 403         | `PERMISSION_DENIED`         | `Forbidden`                                       |
| User lacks RBAC permission                 | 403         | `PERMISSION_DENIED`         | `Missing required permission: {perm}`             |
| CP record not found (or user lacks access) | 404         | `NOT_FOUND`                 | `Resource not found`                              |
| CP record not found for export             | 404         | `NOT_FOUND`                 | `Resource not found`                              |
| Invalid mandated report status transition  | 400         | `INVALID_STATUS_TRANSITION` | `Cannot transition from {current} to {requested}` |
| Mandated report already exists             | 409         | `CONFLICT`                  | `Mandated report already exists for this record`  |
| Download token expired or used             | 404         | `NOT_FOUND`                 | `Resource not found`                              |
| Invalid export purpose                     | 400         | `VALIDATION_ERROR`          | Standard Zod validation error                     |

**Critical:** When a user without CP access requests a CP record that exists, the response MUST be 404 `Resource not found`, NOT 403. This prevents an attacker from distinguishing "this student has no CP records" from "this student has CP records but I cannot see them."

---

## Permissions to Seed

Add to `packages/prisma/seed/permissions.ts`:

| Permission Key                     | Description                                                | Category   |
| ---------------------------------- | ---------------------------------------------------------- | ---------- |
| `pastoral.manage_cp_access`        | Grant and revoke child protection access to users          | `pastoral` |
| `pastoral.export_tier3`            | Export Tier 3 (child protection) records with watermarking | `pastoral` |
| `pastoral.manage_mandated_reports` | Create and manage mandated reports                         | `pastoral` |

---

## Tenant Sequence to Seed

Add to the tenant sequences seed:

| Sequence Type | Prefix | Description                               |
| ------------- | ------ | ----------------------------------------- |
| `cp_export`   | `CPX`  | Child protection export reference numbers |

---

## PDF Template Registration

Register in `apps/api/src/modules/pdf-rendering/pdf-rendering.service.ts`:

```typescript
const TEMPLATES: Record<string, Record<string, TemplateFn>> = {
  // ... existing templates ...
  'cp-export': {
    en: renderCpExportEn as TemplateFn,
    ar: renderCpExportAr as TemplateFn,
  },
};
```

The template receives `CpExportTemplateData` containing:

- `student`: name, DOB, enrolment ID
- `records`: array of CP records with narratives, dates, record types
- `mandated_reports`: linked mandated report summaries
- `watermark`: { user_name, exported_at, purpose, export_ref }
- `branding`: standard `PdfBranding` (school name, logo)

---

## Out of Scope (deferred to later sub-phases)

| Item                                                                                     | Deferred to                 |
| ---------------------------------------------------------------------------------------- | --------------------------- |
| Behaviour safeguarding facade wiring (calling `CpRecordService.create()` from behaviour) | SW-2D                       |
| Tier 3 export as part of broader reporting/evidence pack                                 | SW-3B                       |
| DSAR review routing for CP records                                                       | SW-3C                       |
| CP record search exclusion enforcement (ESLint rule for module boundary)                 | SW-1A (infra) or SW-3B      |
| Frontend UI for CP records management                                                    | Separate frontend sub-phase |
| Notification dispatch on CP record creation                                              | SW-1E (notifications)       |

---

## Architecture Document Updates Required

After completing SW-1C, update:

| Document                              | Change                                                                                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `architecture/module-blast-radius.md` | Add `ChildProtectionModule` with exports (`CpRecordService`, `CpAccessService`, `CpAccessGuard`) and consumers (behaviour facade in SW-2D, pastoral DSAR in SW-3C)                                      |
| `architecture/state-machines.md`      | Add mandated report status machine: `draft -> submitted -> acknowledged -> outcome_received`                                                                                                            |
| `architecture/danger-zones.md`        | Add entry: "CP record queries require both `app.current_tenant_id` AND `app.current_user_id` set in transaction -- missing either one causes RLS to reject all rows silently (empty result, not error)" |
| `architecture/event-job-catalog.md`   | Add CP-specific pastoral event types listed in this spec                                                                                                                                                |

---

## Implementation Order

Within SW-1C, implement in this order:

1. **Zod schemas** (`packages/shared/src/schemas/cp-*.ts`) -- types first
2. **CpAccessService + CpAccessGuard** -- access control before any CP data access
3. **CpRecordService** -- core CRUD, depends on access service for validation
4. **MandatedReportService** -- depends on CpRecordService
5. **CP PDF template** (`cp-export-en.template.ts`, `cp-export-ar.template.ts`)
6. **CpExportService** -- depends on PDF template, sequence service
7. **Controllers** -- thin wiring of services
8. **ChildProtectionModule** registration in `app.module.ts`
9. **Unit tests** for each service
10. **RLS integration tests** (`child-protection-rls.spec.ts`)
11. **Security verification checklist** -- run through every item
12. **Permission seed + sequence seed**
