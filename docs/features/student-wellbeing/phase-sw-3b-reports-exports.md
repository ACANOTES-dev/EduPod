---
name: SW-3B — Reports & Exports
description: Pastoral summary PDFs, compliance reports, DES inspection-ready data, tiered export controls integrating with the CP fortress from SW-1C. Uses the existing PdfRenderingService (Puppeteer) and ReportExportService patterns.
phase: 3
sub_phase: B
dependencies: [SW-2A, SW-2B, SW-1C]
status: NOT STARTED
estimated_effort: High
---

# SW-3B: Reports & Exports

## What This Sub-Phase Delivers

1. **Student Pastoral Summary PDF** -- one-page-per-student comprehensive pastoral record, tier-respecting, exportable via Puppeteer
2. **SST Activity Report** -- operational metrics (cases opened/closed, resolution time, intervention outcomes, concern trends) as JSON endpoint + PDF
3. **Safeguarding Compliance Report** -- for Board of Management oversight aligned to 2025 procedures
4. **Wellbeing Programme Report** -- Junior Cycle engagement and intervention coverage metrics
5. **DES Inspection Readiness Report** -- pre-formatted for WSE and Subject Inspection
6. **Tier 1/2 Export Service** -- standard one-click PDF export with audit event, no watermarking
7. **Tier 3 Export Controls integration** -- Tusla disclosure pack generation using CP export infrastructure from SW-1C (purpose/confirm/watermark flow)

---

## Prerequisites

| Prerequisite                                | Source                                           | Why                                                            |
| ------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| `pastoral_concerns` with version history    | SW-1B                                            | Summary PDF shows full concern chronology                      |
| `cp_records` with DLP access control        | SW-1C                                            | Tier 3 exports require CP record access + export controls      |
| `pastoral_cases` with lifecycle             | SW-1D                                            | SST activity report aggregates case metrics                    |
| SST meeting management with action tracking | SW-2A                                            | SST report includes meeting frequency, action completion rates |
| `pastoral_interventions` with outcomes      | SW-2B                                            | Intervention success rates, continuum coverage                 |
| `pastoral_audit_events` append-only table   | SW-1A                                            | Every export generates an audit event                          |
| `PdfRenderingService` operational           | Existing (`apps/api/src/modules/pdf-rendering/`) | PDF generation via Puppeteer                                   |
| `ReportExportService` operational           | Existing (`apps/api/src/modules/reports/`)       | Excel export infrastructure                                    |
| `app.current_user_id` infrastructure        | SW-1A                                            | Tier access filtering + audit                                  |

---

## Architecture Note: PDF Rendering

This sub-phase follows the established PDF rendering pattern:

1. **Template functions** live in `apps/api/src/modules/pdf-rendering/templates/` -- one per document type per locale (e.g., `pastoral-summary-en.template.ts`, `pastoral-summary-ar.template.ts`)
2. **Templates are registered** in the `TEMPLATES` map in `PdfRenderingService`
3. **Services call** `PdfRenderingService.renderPdf(templateKey, locale, data, branding)` to get a Buffer
4. **Controllers return** the Buffer as a response with `Content-Type: application/pdf`

For report data that feeds both JSON dashboards and PDF export, the service method returns the data object. A separate controller action renders it to PDF via the template.

---

## Reports Specification

### 1. Student Pastoral Summary PDF

**Purpose:** One-page comprehensive view per student -- the document a year head prints before a parent meeting, a DLP opens when Tusla calls, or a guidance counsellor reviews before an SST meeting.

**Content:**

- Student header: name, class, year group, student number
- Concern chronology: all concerns (with version history showing amendments), ordered by date
- Open cases: current active/monitoring cases with case owner and review date
- Interventions: active and completed intervention plans with outcomes
- Referrals: external referral status summary (if any)
- Current status indicator: whether student has open concerns, active case, or all resolved

**Tier filtering:**

- If the requesting user does NOT have `cp_access`, the summary includes Tier 1 and Tier 2 records only. Tier 3 records are excluded at the query level (RLS on `cp_records` and `tier = 3` filter on `pastoral_concerns`). The PDF gives no indication that Tier 3 records exist.
- If the requesting user HAS `cp_access`, the summary merges Tier 1/2/3 into a unified chronology. The Tier 3 section is visually distinguished (e.g., red sidebar, "CHILD PROTECTION" header).

**Templates:**

- `pastoral-summary-en.template.ts`
- `pastoral-summary-ar.template.ts`

### 2. SST Activity Report

**Purpose:** Operational metrics for the pastoral care coordinator, deputy principal, or principal to assess the SST's workload and effectiveness.

**Metrics:**

- Cases opened in period (count, by severity)
- Cases closed/resolved in period (count)
- Average time to resolution (days, from case open to closed)
- Concern volume: total concerns logged per week/month, by category, by severity
- Intervention success rates: % of interventions with outcome "achieved" vs "not achieved" vs "escalated"
- Action completion rate: % of SST meeting actions completed by due date
- Overdue actions count (current)
- Year group breakdown: concerns per year group (normalised per student)

**Output:** JSON endpoint (for dashboard rendering on frontend) + PDF export.

### 3. Safeguarding Compliance Report

**Purpose:** Board of Management oversight document required under the 2025 Child Protection Procedures.

**Content:**

- Concern counts by tier (Tier 1, Tier 2, Tier 3 -- Tier 3 count only visible to DLP/principal)
- Number of mandated reports submitted to Tusla (with status: pending, submitted, acknowledged)
- Training compliance: DLP appointment date, DLP Children First training date, Deputy DLP training date, staff Children First training compliance rate (% trained, with list of non-compliant)
- Child Safeguarding Statement: review date, next review due, whether the Board has signed off
- Number of active child protection cases (Tier 3 -- visible to DLP only)
- Year-on-year comparison (if data available)

**Access:** The full report (including Tier 3 counts) requires `cp_access`. Non-DLP Board members see only Tier 1/2 aggregate counts and the training/statement compliance data.

**Output:** JSON endpoint + PDF export.

### 4. Wellbeing Programme Report

**Purpose:** Junior Cycle wellbeing area compliance -- evidence that the school is meeting the DES continuum-of-support expectations.

**Metrics:**

- Intervention coverage: % of students who received Level 2+ support
- Continuum distribution: how many interventions at Level 1, Level 2, Level 3
- Student engagement metrics: referral rates, concern-to-case conversion rate
- Intervention type distribution: academic, social-emotional, attendance, etc.
- Year group breakdown

**Output:** JSON endpoint + PDF export.

### 5. DES Inspection Readiness Report

**Purpose:** Pre-formatted evidence pack for WSE (Whole-School Evaluation) and Subject Inspection. Provides structured evidence that pastoral care structures exist and function.

**Content:**

- Pastoral care policy summary (configured per tenant -- references the school's policy document)
- SST composition (roster from SW-2A)
- Meeting frequency and attendance (from meeting records)
- Concern logging activity (volume, category distribution)
- Intervention documentation quality: % of interventions with measurable targets, % with documented outcomes
- Referral pathways: number of external referrals, types, outcomes
- Continuum-of-support evidence: Level 1/2/3 coverage data
- Staff engagement: number of distinct staff who logged concerns (indicator of whole-school culture)

**Output:** PDF only (this is a print-and-file document).

---

## Export Services Specification

### 6. Tier 1/2 Export Service (`pastoral-export.service.ts`)

**Behaviour:** Standard operational export. One-click PDF generation with an audit event recorded.

- No watermarking
- No purpose selection
- No confirmation step
- Generates `record_exported` audit event with payload: `{ exported_by, timestamp, tier: 'tier_1_2', scope, format: 'pdf' }`

**Endpoints use this for:** Student pastoral summary (non-CP), SST activity report, wellbeing programme report, DES readiness report.

### 7. Tier 3 Export Controls (from SW-1C, integrated here)

**Behaviour:** High-consequence export for safeguarding records. This sub-phase does NOT build the export controls infrastructure (that is in SW-1C's `CpExportService`). This sub-phase integrates it:

- **Tusla disclosure pack generation:** Combines CP records + concern chronology + mandated report records into a single document
- The controller calls `CpExportService.generateDisclosurePack()` from SW-1C
- Purpose selection, confirmation, watermarking, and enhanced audit logging are all handled by `CpExportService`

**Integration flow:**

1. DLP clicks "Generate Tusla Response Pack" on the pastoral reports screen
2. Controller calls `CpExportService.initExport(tenantId, userId, { purpose, scope })` -- returns preview of what will be included
3. DLP reviews preview, confirms
4. Controller calls `CpExportService.executeExport(tenantId, userId, exportId)` -- generates watermarked PDF
5. Audit event recorded with full export metadata

---

## API Endpoints

### Report Endpoints

| Method | Path                                                      | Permission              | Description                                |
| ------ | --------------------------------------------------------- | ----------------------- | ------------------------------------------ |
| `GET`  | `/api/v1/pastoral/reports/student-summary/:studentId`     | `pastoral.view_reports` | Get student pastoral summary data (JSON)   |
| `GET`  | `/api/v1/pastoral/reports/student-summary/:studentId/pdf` | `pastoral.view_reports` | Download student pastoral summary as PDF   |
| `GET`  | `/api/v1/pastoral/reports/sst-activity`                   | `pastoral.view_reports` | SST activity report data (JSON)            |
| `GET`  | `/api/v1/pastoral/reports/sst-activity/pdf`               | `pastoral.view_reports` | SST activity report as PDF                 |
| `GET`  | `/api/v1/pastoral/reports/safeguarding-compliance`        | `pastoral.view_reports` | Safeguarding compliance report (JSON)      |
| `GET`  | `/api/v1/pastoral/reports/safeguarding-compliance/pdf`    | `pastoral.view_reports` | Safeguarding compliance report as PDF      |
| `GET`  | `/api/v1/pastoral/reports/wellbeing-programme`            | `pastoral.view_reports` | Wellbeing programme report (JSON)          |
| `GET`  | `/api/v1/pastoral/reports/wellbeing-programme/pdf`        | `pastoral.view_reports` | Wellbeing programme report as PDF          |
| `GET`  | `/api/v1/pastoral/reports/des-inspection/pdf`             | `pastoral.view_reports` | DES inspection readiness report (PDF only) |

### Export Endpoints

| Method | Path                                                  | Permission                            | Description                              |
| ------ | ----------------------------------------------------- | ------------------------------------- | ---------------------------------------- |
| `POST` | `/api/v1/pastoral/exports/student-summary/:studentId` | `pastoral.export_tier1_2`             | Export Tier 1/2 student summary PDF      |
| `POST` | `/api/v1/pastoral/exports/sst-activity`               | `pastoral.export_tier1_2`             | Export SST activity report PDF           |
| `POST` | `/api/v1/pastoral/exports/tier3/init`                 | `pastoral.export_tier3` + `cp_access` | Initiate Tier 3 export (returns preview) |
| `POST` | `/api/v1/pastoral/exports/tier3/:exportId/confirm`    | `pastoral.export_tier3` + `cp_access` | Confirm and execute Tier 3 export        |
| `GET`  | `/api/v1/pastoral/exports/tier3/:exportId/download`   | `pastoral.export_tier3` + `cp_access` | Download watermarked Tier 3 PDF          |

### Report Filter Parameters (Query String)

All report endpoints accept:

- `from_date` (ISO date string, optional) -- period start
- `to_date` (ISO date string, optional) -- period end
- `year_group_id` (UUID, optional) -- filter by year group

Student summary accepts:

- `include_resolved` (boolean, default false) -- include resolved/closed cases

---

## Service Method Signatures

### `PastoralReportService` (`pastoral-report.service.ts`)

```typescript
class PastoralReportService {
  // Student pastoral summary
  getStudentSummary(
    tenantId: string,
    userId: string,
    studentId: string,
    options: StudentSummaryOptions,
  ): Promise<StudentPastoralSummaryData>;

  // SST activity report
  getSstActivity(tenantId: string, filters: ReportFilterDto): Promise<SstActivityReportData>;

  // Safeguarding compliance report
  getSafeguardingCompliance(
    tenantId: string,
    userId: string,
    filters: ReportFilterDto,
  ): Promise<SafeguardingComplianceReportData>;

  // Wellbeing programme report
  getWellbeingProgramme(
    tenantId: string,
    filters: ReportFilterDto,
  ): Promise<WellbeingProgrammeReportData>;

  // DES inspection readiness
  getDesInspection(tenantId: string, filters: ReportFilterDto): Promise<DesInspectionReportData>;

  // Internal helpers
  private hasCpAccess(tenantId: string, userId: string): Promise<boolean>;
  private getConcernChronology(
    tenantId: string,
    studentId: string,
    includeTier3: boolean,
  ): Promise<ConcernChronologyItem[]>;
}
```

### `PastoralExportService` (`pastoral-export.service.ts`)

```typescript
class PastoralExportService {
  /**
   * Generate a Tier 1/2 PDF export with audit event.
   * No watermarking, no purpose selection.
   */
  exportStudentSummary(
    tenantId: string,
    userId: string,
    studentId: string,
    locale: string,
  ): Promise<Buffer>;
  exportSstActivity(
    tenantId: string,
    userId: string,
    filters: ReportFilterDto,
    locale: string,
  ): Promise<Buffer>;

  /**
   * Integration with CpExportService for Tier 3 exports.
   * Delegates to SW-1C infrastructure.
   */
  initTier3Export(
    tenantId: string,
    userId: string,
    dto: InitTier3ExportDto,
  ): Promise<Tier3ExportPreview>;
  confirmTier3Export(tenantId: string, userId: string, exportId: string): Promise<void>;
  downloadTier3Export(tenantId: string, userId: string, exportId: string): Promise<Buffer>;

  // Internal
  private recordExportAuditEvent(
    tenantId: string,
    userId: string,
    scope: ExportScope,
    tier: 'tier_1_2',
  ): Promise<void>;
}
```

---

## Report Data Shapes

### `StudentPastoralSummaryData`

```typescript
interface StudentPastoralSummaryData {
  student: {
    id: string;
    full_name: string;
    student_number: string;
    year_group: string;
    class_name: string;
  };
  concerns: Array<{
    id: string;
    date: string;
    category: string;
    severity: string;
    tier: number;
    narrative: string;
    versions: Array<{
      version: number;
      text: string;
      amended_at: string;
      amended_by: string;
      reason: string;
    }>;
    logged_by: string;
    actions_taken: string | null;
  }>;
  cases: Array<{
    id: string;
    status: string;
    case_owner: string;
    opened_at: string;
    review_date: string | null;
    linked_concern_count: number;
  }>;
  interventions: Array<{
    id: string;
    type: string;
    continuum_level: number;
    status: string;
    target_outcomes: string;
    outcome: string | null;
    start_date: string;
    end_date: string | null;
  }>;
  referrals: Array<{
    id: string;
    referral_type: string;
    status: string;
    submitted_at: string | null;
    wait_days: number | null;
  }>;
  has_cp_records: boolean; // true only if requesting user has cp_access and records exist
}
```

### `SstActivityReportData`

```typescript
interface SstActivityReportData {
  period: { from: string; to: string };
  cases_opened: number;
  cases_closed: number;
  cases_by_severity: Record<string, number>;
  avg_resolution_days: number | null;
  concern_volume: {
    total: number;
    by_category: Record<string, number>;
    by_severity: Record<string, number>;
    weekly_trend: Array<{ week: string; count: number }>;
  };
  intervention_outcomes: {
    achieved: number;
    partially_achieved: number;
    not_achieved: number;
    escalated: number;
    in_progress: number;
  };
  action_completion_rate: number; // 0-100
  overdue_actions: number;
  by_year_group: Array<{
    year_group_name: string;
    student_count: number;
    concern_count: number;
    concerns_per_student: number;
  }>;
}
```

### `SafeguardingComplianceReportData`

```typescript
interface SafeguardingComplianceReportData {
  period: { from: string; to: string };
  concern_counts: {
    tier_1: number;
    tier_2: number;
    tier_3: number | null; // null if requesting user lacks cp_access
  };
  mandated_reports: {
    total: number;
    by_status: Record<string, number>;
  } | null; // null if requesting user lacks cp_access
  training_compliance: {
    dlp_name: string;
    dlp_training_date: string | null;
    deputy_dlp_name: string;
    deputy_dlp_training_date: string | null;
    staff_trained_count: number;
    staff_total_count: number;
    staff_compliance_rate: number; // 0-100
    non_compliant_staff: Array<{ name: string; user_id: string }>;
  };
  child_safeguarding_statement: {
    last_review_date: string | null;
    next_review_due: string | null;
    board_signed_off: boolean;
  };
  active_cp_cases: number | null; // null if requesting user lacks cp_access
}
```

---

## Zod Schemas (`packages/shared/src/schemas/pastoral-report.schema.ts`)

```typescript
const reportFilterSchema = z.object({
  from_date: z.string().date().optional(),
  to_date: z.string().date().optional(),
  year_group_id: z.string().uuid().optional(),
});

const studentSummaryOptionsSchema = reportFilterSchema.extend({
  include_resolved: z.coerce.boolean().default(false),
});

const initTier3ExportSchema = z
  .object({
    purpose: z.enum([
      'tusla_request',
      'section_26_inquiry',
      'legal_proceedings',
      'school_transfer_cp',
      'board_of_management_oversight',
      'other',
    ]),
    purpose_other: z.string().max(500).optional(),
    student_id: z.string().uuid().optional(),
    from_date: z.string().date().optional(),
    to_date: z.string().date().optional(),
  })
  .refine(
    (data) =>
      data.purpose !== 'other' || (data.purpose_other && data.purpose_other.trim().length > 0),
    { message: 'purpose_other required when purpose is "other"', path: ['purpose_other'] },
  );
```

---

## PDF Templates to Create

| Template Key              | Locale | File                                                                                  |
| ------------------------- | ------ | ------------------------------------------------------------------------------------- |
| `pastoral-summary`        | `en`   | `apps/api/src/modules/pdf-rendering/templates/pastoral-summary-en.template.ts`        |
| `pastoral-summary`        | `ar`   | `apps/api/src/modules/pdf-rendering/templates/pastoral-summary-ar.template.ts`        |
| `sst-activity`            | `en`   | `apps/api/src/modules/pdf-rendering/templates/sst-activity-en.template.ts`            |
| `sst-activity`            | `ar`   | `apps/api/src/modules/pdf-rendering/templates/sst-activity-ar.template.ts`            |
| `safeguarding-compliance` | `en`   | `apps/api/src/modules/pdf-rendering/templates/safeguarding-compliance-en.template.ts` |
| `safeguarding-compliance` | `ar`   | `apps/api/src/modules/pdf-rendering/templates/safeguarding-compliance-ar.template.ts` |
| `wellbeing-programme`     | `en`   | `apps/api/src/modules/pdf-rendering/templates/wellbeing-programme-en.template.ts`     |
| `wellbeing-programme`     | `ar`   | `apps/api/src/modules/pdf-rendering/templates/wellbeing-programme-ar.template.ts`     |
| `des-inspection`          | `en`   | `apps/api/src/modules/pdf-rendering/templates/des-inspection-en.template.ts`          |
| `des-inspection`          | `ar`   | `apps/api/src/modules/pdf-rendering/templates/des-inspection-ar.template.ts`          |

Each template follows the existing pattern: a function that receives `(data: T, branding: PdfBranding)` and returns an HTML string. The `PdfRenderingService` TEMPLATES map is updated to register them.

---

## Cross-Module Integration Points

| Imported From        | Service/Method                                 | Purpose                                                  | Access Mode                   |
| -------------------- | ---------------------------------------------- | -------------------------------------------------------- | ----------------------------- |
| Pastoral (own)       | `ConcernService` (SW-1B)                       | Concern chronology, version history                      | Read-only                     |
| Pastoral (own)       | `CpRecordService` (SW-1C)                      | Tier 3 records for DLP users                             | Read-only (cp_access checked) |
| Pastoral (own)       | `CpExportService` (SW-1C)                      | Tier 3 export infrastructure (purpose/confirm/watermark) | Delegated                     |
| Pastoral (own)       | `CaseService` (SW-1D)                          | Case data for summary and SST report                     | Read-only                     |
| Pastoral (own)       | `SstService` (SW-2A)                           | Meeting frequency, action completion data                | Read-only                     |
| Pastoral (own)       | `InterventionService` (SW-2B)                  | Intervention plans, outcomes, continuum levels           | Read-only                     |
| Pastoral (own)       | `PastoralAuditService` (SW-1A)                 | Record export audit events                               | Write                         |
| `PdfRenderingModule` | `PdfRenderingService.renderPdf()`              | PDF generation via Puppeteer                             | Read-only                     |
| `ReportsModule`      | `ReportExportService.generateFormattedExcel()` | Excel export (optional, for SST activity)                | Read-only                     |

---

## Audit Events Generated

| Event Type                 | When                                  | Payload                                                         |
| -------------------------- | ------------------------------------- | --------------------------------------------------------------- |
| `report_generated`         | Any report data fetched               | `{ report_type, requested_by, filters }`                        |
| `record_exported`          | Tier 1/2 PDF exported                 | `{ exported_by, tier: 'tier_1_2', scope, format: 'pdf' }`       |
| `tier3_export_initiated`   | Tier 3 export preview requested       | Handled by `CpExportService` (SW-1C)                            |
| `tier3_export_completed`   | Tier 3 export confirmed and generated | Handled by `CpExportService` (SW-1C)                            |
| `student_summary_accessed` | Student pastoral summary viewed       | `{ student_id, accessed_by, included_tiers: [1,2] or [1,2,3] }` |

---

## Permissions

| Permission Key            | Description                                                                      |
| ------------------------- | -------------------------------------------------------------------------------- |
| `pastoral.view_reports`   | View pastoral reports (JSON data, all report types)                              |
| `pastoral.export_tier1_2` | Export Tier 1/2 records as PDF                                                   |
| `pastoral.export_tier3`   | Initiate, confirm, and download Tier 3 exports (also requires `cp_access` grant) |

**Note on `cp_access`:** The `pastoral.export_tier3` permission alone is insufficient. The user must ALSO have an active entry in `cp_access_grants` (the per-user DLP access table from SW-1C). This is a defence-in-depth measure -- even if someone accidentally gets the RBAC permission, they cannot export CP records without the DLP's explicit per-user grant.

---

## Test Requirements

### Unit Tests

| Test                                                                   | File                              |
| ---------------------------------------------------------------------- | --------------------------------- |
| Student summary returns concerns, cases, interventions for the student | `pastoral-report.service.spec.ts` |
| Student summary excludes Tier 3 records when user lacks cp_access      | `pastoral-report.service.spec.ts` |
| Student summary includes Tier 3 records when user has cp_access        | `pastoral-report.service.spec.ts` |
| SST activity report computes correct metrics for the period            | `pastoral-report.service.spec.ts` |
| SST activity report handles empty data (no cases, no concerns)         | `pastoral-report.service.spec.ts` |
| Safeguarding compliance report hides Tier 3 data from non-DLP users    | `pastoral-report.service.spec.ts` |
| Safeguarding compliance report includes Tier 3 data for DLP users      | `pastoral-report.service.spec.ts` |
| Wellbeing programme report computes intervention coverage correctly    | `pastoral-report.service.spec.ts` |
| DES inspection report aggregates all required data sections            | `pastoral-report.service.spec.ts` |
| Tier 1/2 export generates PDF buffer and records audit event           | `pastoral-export.service.spec.ts` |
| Tier 1/2 export does NOT include Tier 3 records                        | `pastoral-export.service.spec.ts` |
| Tier 3 export init returns preview with record counts                  | `pastoral-export.service.spec.ts` |
| Tier 3 export confirm fails without prior init                         | `pastoral-export.service.spec.ts` |
| Tier 3 export fails if user lacks cp_access                            | `pastoral-export.service.spec.ts` |

### RLS Leakage Tests

| Test                                               | File                              |
| -------------------------------------------------- | --------------------------------- |
| Tenant A student summary not visible to Tenant B   | `pastoral-report.service.spec.ts` |
| Tenant A SST report does not include Tenant B data | `pastoral-report.service.spec.ts` |

### Permission Tests

| Test                                                                                | File                                  |
| ----------------------------------------------------------------------------------- | ------------------------------------- |
| User without `pastoral.view_reports` gets 403 on report endpoints                   | `pastoral-reports.controller.spec.ts` |
| User without `pastoral.export_tier1_2` gets 403 on Tier 1/2 export                  | `pastoral-reports.controller.spec.ts` |
| User without `pastoral.export_tier3` gets 403 on Tier 3 export                      | `pastoral-reports.controller.spec.ts` |
| User with `pastoral.export_tier3` but without `cp_access` gets 403 on Tier 3 export | `pastoral-reports.controller.spec.ts` |

---

## Verification Checklist

- [ ] Student pastoral summary renders correctly for Tier 1/2 users
- [ ] Student pastoral summary renders with Tier 3 records for DLP users
- [ ] Student pastoral summary gives zero indication of CP records to non-DLP users
- [ ] SST activity report computes all metrics correctly with edge cases (no data, single case, etc.)
- [ ] Safeguarding compliance report tier-filters correctly based on cp_access
- [ ] Wellbeing programme report intervention coverage calculation is accurate
- [ ] DES inspection report includes all required evidence sections
- [ ] Tier 1/2 export generates valid PDF via PdfRenderingService
- [ ] Tier 1/2 export records audit event
- [ ] Tier 3 export delegates to CpExportService from SW-1C
- [ ] Tier 3 export enforces both `pastoral.export_tier3` permission AND `cp_access` grant
- [ ] Tier 3 export includes watermark (verified in generated PDF)
- [ ] All 10 PDF templates created (5 report types x 2 locales)
- [ ] All templates registered in PdfRenderingService TEMPLATES map
- [ ] All RLS leakage tests pass
- [ ] All permission tests pass (including dual cp_access check)
- [ ] `turbo lint` and `turbo type-check` pass
- [ ] Regression suite passes (`turbo test`)

---

## Files Created / Modified

| Action | Path                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------- |
| CREATE | `apps/api/src/modules/pastoral/pastoral-report.service.ts`                                                              |
| CREATE | `apps/api/src/modules/pastoral/pastoral-report.service.spec.ts`                                                         |
| CREATE | `apps/api/src/modules/pastoral/pastoral-export.service.ts`                                                              |
| CREATE | `apps/api/src/modules/pastoral/pastoral-export.service.spec.ts`                                                         |
| CREATE | `apps/api/src/modules/pastoral/pastoral-reports.controller.ts`                                                          |
| CREATE | `apps/api/src/modules/pastoral/pastoral-reports.controller.spec.ts`                                                     |
| CREATE | `packages/shared/src/schemas/pastoral-report.schema.ts`                                                                 |
| MODIFY | `packages/shared/src/index.ts` (export new schemas)                                                                     |
| CREATE | `apps/api/src/modules/pdf-rendering/templates/pastoral-summary-en.template.ts`                                          |
| CREATE | `apps/api/src/modules/pdf-rendering/templates/pastoral-summary-ar.template.ts`                                          |
| CREATE | `apps/api/src/modules/pdf-rendering/templates/sst-activity-en.template.ts`                                              |
| CREATE | `apps/api/src/modules/pdf-rendering/templates/sst-activity-ar.template.ts`                                              |
| CREATE | `apps/api/src/modules/pdf-rendering/templates/safeguarding-compliance-en.template.ts`                                   |
| CREATE | `apps/api/src/modules/pdf-rendering/templates/safeguarding-compliance-ar.template.ts`                                   |
| CREATE | `apps/api/src/modules/pdf-rendering/templates/wellbeing-programme-en.template.ts`                                       |
| CREATE | `apps/api/src/modules/pdf-rendering/templates/wellbeing-programme-ar.template.ts`                                       |
| CREATE | `apps/api/src/modules/pdf-rendering/templates/des-inspection-en.template.ts`                                            |
| CREATE | `apps/api/src/modules/pdf-rendering/templates/des-inspection-ar.template.ts`                                            |
| MODIFY | `apps/api/src/modules/pdf-rendering/pdf-rendering.service.ts` (register 5 new template keys)                            |
| MODIFY | `apps/api/src/modules/pastoral/pastoral.module.ts` (register new services/controllers, import PdfRenderingModule)       |
| MODIFY | `packages/prisma/seed/permissions.ts` (add `pastoral.view_reports`, `pastoral.export_tier1_2`, `pastoral.export_tier3`) |
