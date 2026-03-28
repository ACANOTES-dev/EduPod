# Regulatory Portal — Implementation Plan

> **Scope**: Build the full Regulatory Portal for EduPod — Compliance Dashboard, Regulatory Calendar, Tusla Reporting, DES September Returns **full data extraction pipeline**, October Returns readiness, P-POD/POD **bidirectional sync infrastructure** (pull *and* push), CBA result sync to PPOD, inter-school transfer support, Anti-Bullying (Bí Cineálta) compliance. All external dependencies (DES file formatting, P-POD/POD data exchange) are designed as **plug-and-play adapters** — the data extraction, validation, and formatting is built now; the transport layer slots in as capabilities mature.
>
> **Critical context**: PPOD and POD are **government web applications** hosted on the DES's secure portal (esinet.ie). There is **no public API**. MIS providers (VSware, Aladdin, Compass) integrate via web automation against the esinet session or file-based exchange. EduPod's v1 transport is **file-based** (CSV import/export matching PPOD/POD field formats) for immediate school value. Automated esinet web integration is a future v2 enhancement. PPOD is the **source of truth** for student records — the primary sync direction is pull (PPOD → EduPod), with push (EduPod → PPOD) for CBA results, subject allocations, and attendance data.

---

## User Review Required

> [!IMPORTANT]
> **Plug-and-Play Architecture**: Both DES file generation and P-POD/POD sync are built with a **strategy/adapter pattern**. The full data extraction pipelines (collect → validate → format) are implemented now. The external-facing layers (DES file export, P-POD/POD data exchange) are abstracted behind interfaces. **v1 adapters produce CSV files matching PPOD/POD/DES field specifications** — immediately useful for manual upload to esinet. When automated esinet web integration is built (v2), you implement one class per adapter — zero changes to the pipeline.
>
> **PPOD is not an API.** It's a government web app on esinet.ie. All MIS providers (VSware, Aladdin, Compass) integrate via web session automation or file exchange. The plan is designed around this reality: v1 = file-based exchange (CSV import/export), v2 = esinet web automation (Puppeteer/Playwright), both behind the same adapter interface.

> [!WARNING]
> This is a large plan covering ~80 files across schema, backend, worker, frontend, and shared packages. It should be executed in phases (see phasing below). The plan is designed to be modular — each phase delivers working, testable functionality.

---

## Phasing

| Phase | Name | Scope |
|-------|------|-------|
| **Phase A** | Schema + Backend Foundation | Migration (9 tables), new module, core services, controllers |
| **Phase B** | DES Pipeline + POD Adapters | DES September Returns file extraction pipeline (Files A–E, Form TL) with **CSV export**; October Returns readiness checker; P-POD/POD **bidirectional** sync infrastructure (pull + push) with **CSV import/export** as v1 transport; CBA result mapper for PPOD sync; inter-school transfer data model |
| **Phase C** | Worker Jobs | Deadline checking, Tusla threshold scanning, sync scheduling |
| **Phase D** | Frontend | Dashboard, calendar, Tusla pages, DES generation UI, POD sync status, October Returns readiness |
| **Phase E** | Anti-Bullying + Board Pack | Bí Cineálta incident tagging, Board report generation |

---

## Proposed Changes

### Schema — Prisma Migration

New migration: `YYYYMMDDHHMMSS_add_regulatory_portal_tables`

> **9 new tables**: `regulatory_calendar_events`, `regulatory_submissions`, `tusla_absence_code_mappings`, `reduced_school_days`, `des_subject_code_mappings`, `ppod_student_mappings`, `ppod_sync_logs`, `ppod_cba_sync_records`, `inter_school_transfers`

---

#### [NEW] New enums (append to [schema.prisma](file:///Users/ram/Library/Mobile%20Documents/com~apple~CloudDocs/Shared/GitHub%20Repos/SDB/packages/prisma/schema.prisma) enums section, ~line 420)

```prisma
// ─── Regulatory Portal Enums ────────────────────────────────────────────────

enum RegulatoryDomain {
  tusla_attendance
  des_september_returns
  des_october_census
  ppod_sync
  pod_sync
  child_safeguarding
  anti_bullying
  fssu_financial
  inspectorate_wse
  sen_provision
  gdpr_compliance
  seai_energy
  admissions_compliance
  board_governance
}

enum RegulatorySubmissionStatus {
  not_started
  in_progress
  ready_for_review
  submitted
  accepted
  rejected
  overdue
}

enum CalendarEventType {
  hard_deadline     // Statutory — cannot be missed
  soft_deadline     // Recommended — can flex
  preparation       // Work should start by this date
  reminder          // Notification-only
}

enum TuslaAbsenceCategory {
  illness
  urgent_family_reason
  holiday
  suspension
  expulsion
  other
  unexplained
}

enum ReducedSchoolDayReason {
  behaviour_management
  medical_needs
  phased_return
  assessment_pending
  other
}
```

---

#### [NEW] `RegulatoryCalendarEvent` — Deadline management (new model)

```prisma
model RegulatoryCalendarEvent {
  id              String                    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id       String                    @db.Uuid
  domain          RegulatoryDomain
  event_type      CalendarEventType
  title           String                    @db.VarChar(255)
  description     String?                   @db.Text
  due_date        DateTime                  @db.Date
  academic_year   String?                   @db.VarChar(20)
  is_recurring    Boolean                   @default(false)
  recurrence_rule String?                   @db.VarChar(100) // e.g. "annual:september:30"
  reminder_days   Int[]                     @db.SmallInt      // e.g. [30, 14, 7, 1]
  status          RegulatorySubmissionStatus @default(not_started)
  completed_at    DateTime?                 @db.Timestamptz()
  completed_by_id String?                   @db.Uuid
  notes           String?                   @db.Text
  created_at      DateTime                  @default(now()) @db.Timestamptz()
  updated_at      DateTime                  @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant       Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  completed_by User?  @relation("reg_event_completed_by", fields: [completed_by_id], references: [id], onDelete: SetNull)

  @@index([tenant_id, domain], name: "idx_reg_calendar_tenant_domain")
  @@index([tenant_id, due_date], name: "idx_reg_calendar_tenant_date")
  @@index([tenant_id, status, due_date], name: "idx_reg_calendar_tenant_status_date")
  @@map("regulatory_calendar_events")
}
```

---

#### [NEW] `RegulatorySubmission` — Audit log of every regulatory submission

```prisma
model RegulatorySubmission {
  id                 String                    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id          String                    @db.Uuid
  domain             RegulatoryDomain
  submission_type    String                    @db.VarChar(100) // e.g. "tusla_sar_period_1", "des_file_a"
  academic_year      String                    @db.VarChar(20)
  period_label       String?                   @db.VarChar(50)  // e.g. "Sep–Dec 2025"
  status             RegulatorySubmissionStatus
  generated_at       DateTime?                 @db.Timestamptz()
  generated_by_id    String?                   @db.Uuid
  submitted_at       DateTime?                 @db.Timestamptz()
  submitted_by_id    String?                   @db.Uuid
  file_key           String?                   @db.VarChar(500) // S3 key for generated file
  file_hash          String?                   @db.VarChar(64)  // SHA-256 of generated file
  record_count       Int?
  validation_errors  Json?                                      // [{field, message, severity}]
  notes              String?                   @db.Text
  created_at         DateTime                  @default(now()) @db.Timestamptz()
  updated_at         DateTime                  @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant       Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  generated_by User?  @relation("reg_sub_generated_by", fields: [generated_by_id], references: [id], onDelete: SetNull)
  submitted_by User?  @relation("reg_sub_submitted_by", fields: [submitted_by_id], references: [id], onDelete: SetNull)

  @@index([tenant_id, domain, academic_year], name: "idx_reg_submissions_tenant_domain_year")
  @@index([tenant_id, status], name: "idx_reg_submissions_tenant_status")
  @@map("regulatory_submissions")
}
```

---

#### [NEW] `TuslaAbsenceCodeMapping` — Map EduPod statuses to Tusla categories

```prisma
/// Tenant-configurable mapping from EduPod attendance reasons to Tusla absence categories.
/// Schools may categorise absences differently, so this mapping is per-tenant.
model TuslaAbsenceCodeMapping {
  id                  String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id           String              @db.Uuid
  attendance_status   AttendanceRecordStatus
  reason_pattern      String?             @db.VarChar(255) // Optional regex/keyword match on reason text
  tusla_category      TuslaAbsenceCategory
  display_label       String              @db.VarChar(100) // e.g. "Illness", "Family Emergency"
  is_default          Boolean             @default(false)  // System default vs custom
  created_at          DateTime            @default(now()) @db.Timestamptz()
  updated_at          DateTime            @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@index([tenant_id], name: "idx_tusla_mapping_tenant")
  @@map("tusla_absence_code_mappings")
}
```

---

#### [NEW] `ReducedSchoolDay` — Track students on reduced timetables (Tusla obligation since Jan 2022)

```prisma
model ReducedSchoolDay {
  id                  String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id           String               @db.Uuid
  student_id          String               @db.Uuid
  start_date          DateTime             @db.Date
  end_date            DateTime?            @db.Date
  hours_per_day       Decimal              @db.Decimal(4, 2) // e.g. 3.50
  reason              ReducedSchoolDayReason
  reason_detail       String?              @db.Text
  approved_by_id      String               @db.Uuid
  parent_consent_date DateTime?            @db.Date
  review_date         DateTime?            @db.Date
  tusla_notified      Boolean              @default(false)
  tusla_notified_at   DateTime?            @db.Timestamptz()
  is_active           Boolean              @default(true)
  notes               String?              @db.Text
  created_at          DateTime             @default(now()) @db.Timestamptz()
  updated_at          DateTime             @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant      Tenant  @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  student     Student @relation("reg_reduced_school_day_student", fields: [student_id], references: [id], onDelete: Cascade)
  approved_by User    @relation("reg_reduced_school_day_approver", fields: [approved_by_id], references: [id], onDelete: Restrict)

  @@index([tenant_id, student_id], name: "idx_reduced_school_days_student")
  @@index([tenant_id, is_active], name: "idx_reduced_school_days_active")
  @@map("reduced_school_days")
}
```

---

#### [NEW] `DesSubjectCodeMapping` — Map EduPod subjects to DES canonical codes

```prisma
/// Maps tenant subjects to the DES canonical subject code list.
/// Required for September Returns File D (subjects) and DTR sync.
model DesSubjectCodeMapping {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id       String   @db.Uuid
  subject_id      String   @db.Uuid
  des_code        String   @db.VarChar(10)  // DES canonical code
  des_name        String   @db.VarChar(150) // DES canonical name
  des_level       String?  @db.VarChar(50)  // e.g. "Higher", "Ordinary", "Foundation"
  is_verified     Boolean  @default(false)
  created_at      DateTime @default(now()) @db.Timestamptz()
  updated_at      DateTime @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant  Tenant  @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  subject Subject @relation("reg_des_subject_mapping", fields: [subject_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, subject_id], name: "idx_des_subject_mapping_unique")
  @@index([tenant_id], name: "idx_des_subject_mapping_tenant")
  @@map("des_subject_code_mappings")
}
```

---

#### [NEW] `PpodStudentMapping` — Map EduPod students to P-POD/POD records

```prisma
/// Maps each student to their P-POD (or POD) record identifier.
/// Tracks sync status per student so the adapter knows what to push.
model PpodStudentMapping {
  id                  String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id           String           @db.Uuid
  student_id          String           @db.Uuid
  database_type       PodDatabaseType  // ppod or pod
  external_id         String?          @db.VarChar(50) // P-POD/POD student ID (null = not yet synced)
  sync_status         PodSyncStatus    @default(pending)
  last_synced_at      DateTime?        @db.Timestamptz()
  last_sync_hash      String?          @db.VarChar(64)  // SHA-256 of last synced data snapshot
  last_sync_error     String?          @db.Text
  data_snapshot       Json?                             // Last synced data for diffing
  created_at          DateTime         @default(now()) @db.Timestamptz()
  updated_at          DateTime         @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant  Tenant  @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  student Student @relation("reg_ppod_student_mapping", fields: [student_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, student_id, database_type], name: "idx_ppod_mapping_unique")
  @@index([tenant_id, sync_status], name: "idx_ppod_mapping_status")
  @@map("ppod_student_mappings")
}
```

---

#### [NEW] `PpodSyncLog` — Audit log of every sync attempt

```prisma
/// Append-only audit trail of every P-POD/POD sync operation.
model PpodSyncLog {
  id               String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id        String          @db.Uuid
  database_type    PodDatabaseType
  sync_type        PodSyncType     // full, incremental, manual
  triggered_by_id  String?         @db.Uuid
  started_at       DateTime        @db.Timestamptz()
  completed_at     DateTime?       @db.Timestamptz()
  status           PodSyncLogStatus
  records_pushed   Int             @default(0)
  records_created  Int             @default(0)
  records_updated  Int             @default(0)
  records_failed   Int             @default(0)
  error_details    Json?                           // [{student_id, field, error}]
  transport_used   String          @db.VarChar(50) // 'stub', 'csv_export', 'csv_import', 'esinet_web' (future)
  created_at       DateTime        @default(now()) @db.Timestamptz()

  // Relations
  tenant       Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  triggered_by User?  @relation("reg_sync_triggered_by", fields: [triggered_by_id], references: [id], onDelete: SetNull)

  @@index([tenant_id, database_type, started_at(sort: Desc)], name: "idx_ppod_sync_log_tenant")
  @@map("ppod_sync_logs")
}
```

---

#### [NEW] Additional enums for POD sync (append to Regulatory Portal Enums)

```prisma
enum PodDatabaseType {
  ppod  // Post-primary
  pod   // Primary
}

enum PodSyncStatus {
  pending       // Never synced
  synced        // In sync
  changed       // Local changes not yet pushed
  error         // Last sync failed
  not_applicable // Student not eligible (e.g. wrong school level)
}

enum PodSyncType {
  full          // Full re-sync all students
  incremental   // Only changed students
  manual        // Single student manual push
}

enum PodSyncLogStatus {
  in_progress
  completed
  completed_with_errors
  failed
}

enum TransferDirection {
  inbound   // Student transferring INTO this school
  outbound  // Student transferring OUT of this school
}

enum TransferStatus {
  pending           // Transfer initiated, awaiting other school
  accepted          // Other school accepted
  rejected          // Other school rejected
  completed         // Transfer finalised on PPOD
  cancelled         // Cancelled before completion
}

enum CbaSyncStatus {
  pending           // Not yet synced
  synced            // Successfully pushed to PPOD
  error             // Sync failed
}
```

---

#### [NEW] `PpodCbaSyncRecord` — Track CBA result sync to PPOD

```prisma
/// Tracks which CBA (Classroom-Based Assessment) results have been synced to PPOD.
/// Junior Cycle CBAs must be synced to PPOD before publishing to parents.
model PpodCbaSyncRecord {
  id                String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id         String        @db.Uuid
  student_id        String        @db.Uuid
  subject_id        String        @db.Uuid
  assessment_id     String        @db.Uuid
  academic_year     String        @db.VarChar(20)
  cba_type          String        @db.VarChar(20)  // "CBA1", "CBA2", "SLAR"
  grade             String        @db.VarChar(50)  // e.g. "Exceptional", "Above Expectations"
  sync_status       CbaSyncStatus @default(pending)
  synced_at         DateTime?     @db.Timestamptz()
  sync_error        String?       @db.Text
  created_at        DateTime      @default(now()) @db.Timestamptz()
  updated_at        DateTime      @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant  Tenant  @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  student Student @relation("reg_cba_sync_student", fields: [student_id], references: [id], onDelete: Cascade)

  @@unique([tenant_id, student_id, subject_id, assessment_id], name: "idx_cba_sync_unique")
  @@index([tenant_id, sync_status], name: "idx_cba_sync_status")
  @@map("ppod_cba_sync_records")
}
```

---

#### [NEW] `InterSchoolTransfer` — Track PPOD inter-school transfers

```prisma
/// Tracks student transfers between schools via the PPOD inter-school transfer mechanism.
/// Outbound: school marks student as early leaver with destination roll number.
/// Inbound: student appears on school's Inter-School Transfer List for acceptance.
model InterSchoolTransfer {
  id                    String            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id             String            @db.Uuid
  student_id            String            @db.Uuid
  direction             TransferDirection
  other_school_roll_no  String            @db.VarChar(20)  // DES roll number of the other school
  other_school_name     String?           @db.VarChar(255)
  transfer_date         DateTime          @db.Date
  leaving_reason        String?           @db.VarChar(100) // PPOD early leaving reason code
  status                TransferStatus    @default(pending)
  ppod_confirmed        Boolean           @default(false)  // Confirmed on PPOD
  ppod_confirmed_at     DateTime?         @db.Timestamptz()
  notes                 String?           @db.Text
  initiated_by_id       String?           @db.Uuid
  created_at            DateTime          @default(now()) @db.Timestamptz()
  updated_at            DateTime          @default(now()) @updatedAt @db.Timestamptz()

  // Relations
  tenant       Tenant  @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  student      Student @relation("reg_transfer_student", fields: [student_id], references: [id], onDelete: Cascade)
  initiated_by User?   @relation("reg_transfer_initiated_by", fields: [initiated_by_id], references: [id], onDelete: SetNull)

  @@index([tenant_id, student_id], name: "idx_transfer_student")
  @@index([tenant_id, status], name: "idx_transfer_status")
  @@index([tenant_id, direction, status], name: "idx_transfer_direction_status")
  @@map("inter_school_transfers")
}
```

---

#### [MODIFY] Existing models — Add relation fields

**`Student` model** (~line 1432, before `@@index` declarations):

```prisma
  // Regulatory Portal Relations
  reg_reduced_school_days  ReducedSchoolDay[]     @relation("reg_reduced_school_day_student")
  reg_ppod_mappings        PpodStudentMapping[]   @relation("reg_ppod_student_mapping")
  reg_cba_sync_records     PpodCbaSyncRecord[]    @relation("reg_cba_sync_student")
  reg_transfers            InterSchoolTransfer[]  @relation("reg_transfer_student")
```

**`Subject` model** (~line 1704, before `@@unique` declarations):

```prisma
  // Regulatory Portal Relations
  reg_des_code_mapping DesSubjectCodeMapping? @relation("reg_des_subject_mapping")
```

**`Tenant` model** (~add new relation block after existing blocks, ~line 620):

```prisma
  // Regulatory Portal Relations
  regulatory_calendar_events  RegulatoryCalendarEvent[]
  regulatory_submissions      RegulatorySubmission[]
  tusla_absence_code_mappings TuslaAbsenceCodeMapping[]
  reduced_school_days         ReducedSchoolDay[]
  des_subject_code_mappings   DesSubjectCodeMapping[]
  ppod_student_mappings       PpodStudentMapping[]
  ppod_sync_logs              PpodSyncLog[]
  ppod_cba_sync_records       PpodCbaSyncRecord[]
  inter_school_transfers      InterSchoolTransfer[]
```

**`User` model** (~add relation fields for completed_by, approved_by, etc.):

```prisma
  // Regulatory Portal Relations
  reg_calendar_completed   RegulatoryCalendarEvent[] @relation("reg_event_completed_by")
  reg_submissions_gen      RegulatorySubmission[]    @relation("reg_sub_generated_by")
  reg_submissions_sub      RegulatorySubmission[]    @relation("reg_sub_submitted_by")
  reg_reduced_day_approver ReducedSchoolDay[]        @relation("reg_reduced_school_day_approver")
  reg_sync_triggered       PpodSyncLog[]             @relation("reg_sync_triggered_by")
  reg_transfers_initiated  InterSchoolTransfer[]     @relation("reg_transfer_initiated_by")
```

---

#### [NEW] RLS policies (`post_migrate.sql` in migration directory)

Standard tenant isolation for all 9 new tables:
- `regulatory_calendar_events`
- `regulatory_submissions`
- `tusla_absence_code_mappings`
- `reduced_school_days`
- `des_subject_code_mappings`
- `ppod_student_mappings`
- `ppod_sync_logs`
- `ppod_cba_sync_records`
- `inter_school_transfers`
- `ppod_student_mappings`
- `ppod_sync_logs`

Each gets the standard `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, and `{table}_tenant_isolation` policy.

---

### Shared Package — `packages/shared/src`

---

#### [NEW] `packages/shared/src/regulatory/index.ts`

Re-export barrel file for all regulatory shared types and schemas.

#### [NEW] `packages/shared/src/regulatory/regulatory.schemas.ts`

Zod schemas for all new DTOs:
- `createCalendarEventSchema` / `updateCalendarEventSchema`
- `createSubmissionSchema` / `updateSubmissionSchema`
- `createTuslaAbsenceCodeMappingSchema`
- `createReducedSchoolDaySchema` / `updateReducedSchoolDaySchema`
- `createDesSubjectCodeMappingSchema`
- `generateTuslaSarSchema` (date range, academic year)
- `generateTuslaAarSchema` (academic year)
- `tuslaThresholdConfigSchema` (threshold days, default 20)
- `desReadinessCheckSchema` (academic year)
- `octoberReturnsReadinessSchema` (academic year)
- `ppodImportSchema` (database type, file validation)
- `ppodExportSchema` (database type, scope: full/incremental)
- `cbaSyncSchema` (academic year, subject filter, class filter)
- `createTransferSchema` (direction, student, destination school roll number, date, reason)
- `updateTransferSchema` (status, ppod_confirmed)
- `listCalendarEventsQuerySchema` (pagination + filters)
- `listSubmissionsQuerySchema` (pagination + filters)
- `listTransfersQuerySchema` (pagination + direction + status filters)

#### [NEW] `packages/shared/src/regulatory/regulatory.constants.ts`

Constants:
- `TUSLA_DEFAULT_THRESHOLD_DAYS = 20`
- `TUSLA_SAR_PERIODS` — Period 1 (start–Christmas) and Period 2 (Christmas–end)
- `REGULATORY_DOMAINS` — Labels and descriptions per domain
- `DEFAULT_CALENDAR_EVENTS` — Template of standard Irish school regulatory deadlines (includes October Returns deadline ~late Oct, September Returns deadline, Tusla SAR Period 1 & 2, CBA sync windows)
- `DES_SUBJECT_CODES` — Canonical DES subject code list (can be populated from publicly available DES subject code lists)
- `PPOD_SUBJECT_CODES` — PPOD September Returns subject codes (distinct from DES codes, used for DTR)
- `PPOD_EARLY_LEAVING_REASONS` — Standard PPOD early leaving reason codes (Another 2nd Level School in the State, Further Education, Employment, etc.)
- `CBA_GRADE_DESCRIPTORS` — Junior Cycle CBA grade descriptors (Exceptional, Above Expectations, In Line with Expectations, Yet to Meet Expectations)
- `ANTI_BULLYING_CATEGORIES` — Bí Cineálta bullying categories (cyberbullying, identity-based, racist, sexist, sexual harassment, etc.)
- `OCTOBER_RETURNS_FIELDS` — Field definitions for October Returns validation (enrolment data that determines teacher allocation and capitation)

---

### Backend — `apps/api/src/modules/`

---

#### [NEW] `modules/regulatory/` — New module (follows existing flat structure)

```
modules/regulatory/
├── dto/
│   ├── calendar-event.dto.ts         # Re-export from @school/shared
│   ├── generate-tusla-sar.dto.ts
│   ├── generate-tusla-aar.dto.ts
│   ├── reduced-school-day.dto.ts
│   ├── des-readiness.dto.ts
│   ├── ppod-sync.dto.ts
│   ├── cba-sync.dto.ts
│   └── inter-school-transfer.dto.ts
├── adapters/                          # ← Plug-and-play adapter layer
│   ├── des-file-exporter.interface.ts
│   ├── des-file-exporter.csv.ts      # v1: CSV matching DES field spec (usable for manual esinet upload)
│   ├── des-file-exporter.stub.ts     # Testing: outputs JSON for pipeline verification
│   ├── pod-transport.interface.ts
│   ├── pod-transport.csv-export.ts   # v1 PUSH: CSV export matching PPOD field format for manual upload
│   ├── pod-transport.csv-import.ts   # v1 PULL: CSV import from PPOD esinet export
│   ├── pod-transport.stub.ts         # Testing: logs to sync_log, returns success
│   └── pod-transport.esinet.ts       # v2 FUTURE: web automation against esinet session (Puppeteer)
├── regulatory.module.ts
├── regulatory.controller.ts           # /v1/regulatory/* routes
├── regulatory.controller.spec.ts
├── regulatory-calendar.service.ts     # Deadline management
├── regulatory-calendar.service.spec.ts
├── regulatory-dashboard.service.ts    # Aggregation for dashboard
├── regulatory-dashboard.service.spec.ts
├── regulatory-tusla.service.ts        # SAR/AAR generation, threshold queries
├── regulatory-tusla.service.spec.ts
├── regulatory-des.service.ts          # DES September Returns data extraction pipeline
├── regulatory-des.service.spec.ts
├── regulatory-october-returns.service.ts  # October Returns readiness + validation
├── regulatory-october-returns.service.spec.ts
├── regulatory-ppod.service.ts         # P-POD/POD bidirectional sync engine
├── regulatory-ppod.service.spec.ts
├── regulatory-cba.service.ts          # CBA result sync to PPOD
├── regulatory-cba.service.spec.ts
├── regulatory-transfers.service.ts    # Inter-school transfer tracking
├── regulatory-transfers.service.spec.ts
├── regulatory-submission.service.ts   # Submission audit log CRUD
└── regulatory-submission.service.spec.ts
```

---

#### [NEW] `regulatory.module.ts`

```typescript
@Module({
  imports: [PrismaModule],
  controllers: [RegulatoryController],
  providers: [
    RegulatoryCalendarService,
    RegulatoryDashboardService,
    RegulatoryTuslaService,
    RegulatoryDesService,
    RegulatoryOctoberReturnsService,
    RegulatoryPpodService,
    RegulatoryCbaService,
    RegulatoryTransfersService,
    RegulatorySubmissionService,
    // Adapter injection — swap for real implementation when ready
    // DES: v1 = CSV export for manual esinet upload; stub for testing
    { provide: 'DES_FILE_EXPORTER', useClass: DesFileExporterCsv },
    // POD: v1 = CSV export/import for manual esinet exchange; stub for testing
    // FUTURE: swap to EsinetWebTransport for automated sync
    { provide: 'POD_TRANSPORT', useClass: PodTransportCsvExport },
  ],
  exports: [RegulatoryTuslaService, RegulatoryPpodService, RegulatoryCbaService],
})
export class RegulatoryModule {}
```

Register in `apps/api/src/app.module.ts` imports array.

---

#### [NEW] `regulatory.controller.ts` — API endpoints

```
// Compliance Dashboard
GET    /v1/regulatory/dashboard                 # Aggregate compliance status
GET    /v1/regulatory/dashboard/overdue         # Overdue items only

// Calendar
GET    /v1/regulatory/calendar                  # List calendar events (paginated, filterable by domain)
POST   /v1/regulatory/calendar                  # Create custom calendar event
PATCH  /v1/regulatory/calendar/:id              # Update status/notes
DELETE /v1/regulatory/calendar/:id              # Delete custom event
POST   /v1/regulatory/calendar/seed-defaults    # Seed default Irish regulatory calendar for academic year

// Tusla
GET    /v1/regulatory/tusla/threshold-monitor   # Students approaching/exceeding 20-day threshold
POST   /v1/regulatory/tusla/sar/generate        # Generate SAR for a given period
POST   /v1/regulatory/tusla/aar/generate        # Generate AAR for academic year
GET    /v1/regulatory/tusla/absence-mappings    # List tenant's Tusla absence code mappings
POST   /v1/regulatory/tusla/absence-mappings    # Create/update mapping
GET    /v1/regulatory/tusla/suspensions         # List suspensions ≥6 days (Tusla notification required)
GET    /v1/regulatory/tusla/expulsions          # List expulsions (Tusla notification required)

// Reduced School Days
GET    /v1/regulatory/reduced-school-days       # List all reduced school day records
POST   /v1/regulatory/reduced-school-days       # Create reduced school day record
PATCH  /v1/regulatory/reduced-school-days/:id   # Update (e.g. end date, Tusla notification)
GET    /v1/regulatory/reduced-school-days/:id   # Get single record

// DES Returns — Full extraction pipeline
GET    /v1/regulatory/des/readiness             # Check data readiness for September Returns
POST   /v1/regulatory/des/generate/:fileType    # Generate DES file (file_a|file_b|file_c|file_d|file_e|form_tl)
GET    /v1/regulatory/des/preview/:fileType      # Preview file data without generating
GET    /v1/regulatory/des/subject-mappings      # List DES subject code mappings
POST   /v1/regulatory/des/subject-mappings      # Create/update DES subject code mapping

// October Returns — Readiness and validation
GET    /v1/regulatory/october-returns/readiness  # Validate enrolment data completeness for October Returns
GET    /v1/regulatory/october-returns/preview    # Preview student data as it would appear in PPOD October Returns
GET    /v1/regulatory/october-returns/issues     # List students with data issues that would block October Returns

// P-POD / POD — Bidirectional sync adapter
GET    /v1/regulatory/ppod/status               # Sync status overview (pending, synced, error counts)
GET    /v1/regulatory/ppod/students             # List student mappings with sync status
POST   /v1/regulatory/ppod/sync                 # Trigger push sync (full or incremental)
POST   /v1/regulatory/ppod/sync/:studentId      # Push sync single student
POST   /v1/regulatory/ppod/import               # Import students from PPOD CSV export (PULL direction)
GET    /v1/regulatory/ppod/sync-log             # Sync history audit log
GET    /v1/regulatory/ppod/diff                 # Preview what would change on next push sync
POST   /v1/regulatory/ppod/export-csv           # Generate CSV for manual upload to esinet (PUSH direction)

// CBA Sync — Junior Cycle Classroom-Based Assessment results to PPOD
GET    /v1/regulatory/cba/status                # CBA sync status per subject/class
GET    /v1/regulatory/cba/pending               # CBA results not yet synced
POST   /v1/regulatory/cba/sync                  # Sync CBA results (generates CSV for PPOD upload)
POST   /v1/regulatory/cba/sync/:studentId       # Sync single student's CBA results

// Inter-School Transfers
GET    /v1/regulatory/transfers                 # List all transfers (inbound + outbound)
POST   /v1/regulatory/transfers                 # Create transfer record (outbound: early leaver)
PATCH  /v1/regulatory/transfers/:id             # Update transfer status (accept/reject inbound)
GET    /v1/regulatory/transfers/:id             # Get single transfer detail

// Submissions Audit
GET    /v1/regulatory/submissions               # List all regulatory submissions (audit log)
GET    /v1/regulatory/submissions/:id           # Single submission detail
```

All routes: `@UseGuards(AuthGuard, PermissionGuard)`, class-level `@RequiresPermission('regulatory.view')`. Write operations: `@RequiresPermission('regulatory.manage')`.

---

#### [NEW] `regulatory-tusla.service.ts` — Key business logic

**Core methods:**

```typescript
// Query DailyAttendanceSummary to find students with ≥ threshold absent days
async getThresholdMonitor(tenantId: string, options: ThresholdOptions): Promise<ThresholdResult[]>

// Generate SAR (Student Absence Report) for a date range
// Joins: students + daily_attendance_summaries + tusla_absence_code_mappings
// Returns: CSV/JSON with per-student rows and Tusla-categorised absence counts
async generateSar(tenantId: string, dto: GenerateTuslaSarDto): Promise<SarReport>

// Generate AAR (Annual Attendance Report) for academic year
// Aggregates: total students, total days lost, students with 20+ absences
async generateAar(tenantId: string, dto: GenerateTuslaAarDto): Promise<AarReport>

// Query suspensions ≥6 consecutive days (joins BehaviourSanction where type = suspension_*)
async getSuspensionsRequiringNotification(tenantId: string, academicYear: string): Promise<SuspensionNotification[]>

// Query expulsions (joins BehaviourExclusionCase)
async getExpulsionsRequiringNotification(tenantId: string, academicYear: string): Promise<ExpulsionNotification[]>
```

**Integration points (read-only queries against existing tables):**
- `daily_attendance_summaries` — cumulative absence counts
- `attendance_records` — individual session records for Tusla categorisation
- `behaviour_sanctions` — suspension data (type `suspension_internal` | `suspension_external`, `suspension_days ≥ 6`)
- `behaviour_exclusion_cases` — expulsion data
- `tusla_absence_code_mappings` — tenant-configurable code mapping (new table)

---

#### [NEW] `regulatory-des.service.ts` — DES File Extraction Pipeline

This is the full data extraction + formatting pipeline. The **exporter is a pluggable adapter**.

```typescript
// ─── Pipeline Architecture ────────────────────────────────────────────────────
//
//  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
//  │  Collector   │ →  │  Validator   │ →  │  Formatter   │ →  │  Exporter    │
//  │  (query DB)  │    │  (rules)     │    │  (structure) │    │  (adapter)   │
//  └─────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
//                                                               ↑
//                                                    Injected via DI token
//                                                    Default: DesFileExporterCsv
//                                                    Testing: DesFileExporterStub
//

// Step 1: COLLECT — pull raw data from EduPod tables
async collectFileA(tenantId: string, year: string): Promise<DesFileAData>
// → Queries: staff_profiles (qualifications, employment_type, hours), users (names)

async collectFileC(tenantId: string, year: string): Promise<DesFileCData>
// → Queries: classes (sizes, year groups), class_enrolments (counts)

async collectFileD(tenantId: string, year: string): Promise<DesFileDData>
// → Queries: subjects + des_subject_code_mappings (DES codes, levels)

async collectFileE(tenantId: string, year: string): Promise<DesFileEData>
// → Queries: students (national_id/PPSN, DOB, gender, nationality, enrolment)

async collectFormTl(tenantId: string, year: string): Promise<FormTlData>
// → Queries: schedules + staff_profiles + subjects + des_subject_code_mappings

// Step 2: VALIDATE — run DES-specific validation rules
async validate(data: DesFileData): Promise<ValidationResult>
// → Checks: PPSN format, required fields, subject code consistency, date ranges

// Step 3: FORMAT — structure data into DES file layout
format(data: DesFileData, fileType: DesFileType): DesFormattedOutput
// → Produces structured rows matching DES field ordering

// Step 4: EXPORT — delegate to injected adapter
async generateFile(tenantId: string, fileType: DesFileType, year: string): Promise<DesGeneratedFile>
// → Calls collect → validate → format → this.exporter.export(formatted)
// → Stores result in S3, creates RegulatorySubmission record
```

**Plug-and-play adapter interface:**

```typescript
// adapters/des-file-exporter.interface.ts
export interface DesFileExporter {
  /** Export formatted DES data into a file for submission */
  export(data: DesFormattedOutput, fileType: DesFileType): Promise<Buffer>;
  /** File extension for the output (e.g. '.csv', '.json') */
  outputExtension(fileType: DesFileType): string;
  /** MIME type for download */
  mimeType(fileType: DesFileType): string;
}

// adapters/des-file-exporter.csv.ts
// v1 DEFAULT: outputs CSV with correct DES field ordering — admin downloads and uploads to esinet
@Injectable()
export class DesFileExporterCsv implements DesFileExporter {
  async export(data: DesFormattedOutput, fileType: DesFileType): Promise<Buffer> {
    // Render rows into CSV with DES-specified column headers and field ordering
    // Uses DES subject codes, PPSN formatting, date formats matching DES expectations
    return Buffer.from(this.renderCsv(data, fileType), 'utf-8');
  }
  outputExtension(): string { return '.csv'; }
  mimeType(): string { return 'text/csv'; }
}

// adapters/des-file-exporter.stub.ts
// Testing: outputs JSON for pipeline verification
@Injectable()
export class DesFileExporterStub implements DesFileExporter {
  async export(data: DesFormattedOutput): Promise<Buffer> {
    return Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
  }
  outputExtension(): string { return '.json'; }
  mimeType(): string { return 'application/json'; }
}
```

---

#### [NEW] `regulatory-ppod.service.ts` — P-POD/POD Bidirectional Sync Engine

Full sync infrastructure with pluggable transport. **PPOD is the source of truth** for student records — pull (PPOD → EduPod) is the primary operation. Push (EduPod → PPOD) is for CBA results, subject allocations, and attendance data.

```typescript
// ─── Sync Architecture ──────────────────────────────────────────────────────
//
//  PULL (PPOD → EduPod) — primary direction, used for onboarding + yearly rollover
//  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
//  │  Transport   │ →  │ Data Mapper  │ →  │  Validator   │ →  │  Importer    │
//  │  (adapter)   │    │ (POD→EduPod) │    │  (rules)     │    │  (upsert)    │
//  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
//
//  PUSH (EduPod → PPOD) — secondary direction, for CBA/subject/attendance data
//  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
//  │ Data Mapper  │ →  │ Diff Engine  │ →  │  Validator   │ →  │  Transport   │
//  │ (EduPod→POD) │    │ (hash diff)  │    │  (rules)     │    │  (adapter)   │
//  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
//                                                               ↑
//                                                    Injected via DI token
//                                                    v1: PodTransportCsvExport / CsvImport
//                                                    v2: EsinetWebTransport (future)
//

// ─── PULL operations (PPOD → EduPod) ───────────────────────────────────────

// Import students from PPOD data (CSV uploaded by admin from esinet export)
async importFromPpod(tenantId: string, csvBuffer: Buffer, dbType: PodDatabaseType): Promise<ImportResult>
// → Parses PPOD CSV → maps to EduPod student format → validates → upserts students
// → Creates/updates PpodStudentMapping records with sync hashes
// → Creates PpodSyncLog entry
// → Returns: { created: number, updated: number, skipped: number, errors: ImportError[] }

// Map PPOD record to EduPod student format
mapPodToStudent(podRecord: PodStudentRecord): Partial<StudentCreateInput>
// → Maps: PPSN → national_id, forename/surname, DOB, gender,
//   nationality, address → household, enrolment year, class group

// ─── PUSH operations (EduPod → PPOD) ───────────────────────────────────────

// Step 1: MAP — transform EduPod student data to POD/P-POD format
mapStudentToPod(student: StudentWithRelations): PodStudentRecord
// → Maps: national_id → PPSN, first_name/last_name, DOB, gender,
//   nationality, mother_tongue (from Student), ethnic/cultural background,
//   address (from Household), religion (if consent on file)

// Step 2: DIFF — identify what's changed since last sync
async calculateDiff(tenantId: string, dbType: PodDatabaseType): Promise<SyncDiff>
// → Compares current data hash vs ppod_student_mappings.last_sync_hash
// → Returns: { created: Student[], updated: Student[], unchanged: Student[] }

// Step 3: VALIDATE — POD/P-POD-specific validation
validate(records: PodStudentRecord[]): PodValidationResult
// → Checks: PPSN format, required fields, age range, enrolment status

// Step 4: EXPORT — generate CSV for manual upload to esinet
async exportForPpod(tenantId: string, dto: SyncDto): Promise<ExportResult>
// → Calls map → diff → validate → generates CSV matching PPOD import format
// → Updates ppod_student_mappings with new hashes
// → Creates PpodSyncLog entry with transport_used = 'csv_export'
// → Returns downloadable CSV buffer

// Preview what would change without actually syncing
async previewDiff(tenantId: string, dbType: PodDatabaseType): Promise<SyncDiffPreview>

// Get sync status overview
async getSyncStatus(tenantId: string): Promise<SyncStatusSummary>
```

**Plug-and-play transport interface:**

```typescript
// adapters/pod-transport.interface.ts
export interface PodTransport {
  /** Push student records to POD/P-POD (generates export file or automates esinet) */
  push(records: PodStudentRecord[], dbType: PodDatabaseType): Promise<PodTransportResult>;
  /** Pull student records from POD/P-POD (parses import file or reads from esinet) */
  pull(data: Buffer, dbType: PodDatabaseType): Promise<PodStudentRecord[]>;
  /** Transport name for audit logging */
  transportName: string;
}

export interface PodTransportResult {
  success: boolean;
  recordsPushed: number;
  recordsFailed: number;
  errors: Array<{ studentId: string; field: string; error: string }>;
  /** For file-based transports: the generated file buffer for download */
  exportBuffer?: Buffer;
  exportFilename?: string;
}

// adapters/pod-transport.csv-export.ts
// v1 PUSH: generates CSV matching PPOD's expected field format for manual upload to esinet
@Injectable()
export class PodTransportCsvExport implements PodTransport {
  transportName = 'csv_export';
  async push(records: PodStudentRecord[], dbType: PodDatabaseType): Promise<PodTransportResult> {
    // Render records into CSV with PPOD-specified column headers
    // Return buffer for admin to download and upload to esinet manually
    const csv = this.renderPpodCsv(records, dbType);
    return {
      success: true, recordsPushed: records.length, recordsFailed: 0, errors: [],
      exportBuffer: Buffer.from(csv, 'utf-8'),
      exportFilename: `ppod-export-${dbType}-${new Date().toISOString().slice(0,10)}.csv`,
    };
  }
  async pull(data: Buffer, dbType: PodDatabaseType): Promise<PodStudentRecord[]> {
    // Parse CSV exported from esinet PPOD portal
    return this.parsePpodCsv(data, dbType);
  }
}

// adapters/pod-transport.stub.ts
// Testing: validates data and logs to sync_log
@Injectable()
export class PodTransportStub implements PodTransport {
  transportName = 'stub';
  async push(records: PodStudentRecord[]): Promise<PodTransportResult> {
    return { success: true, recordsPushed: records.length, recordsFailed: 0, errors: [] };
  }
  async pull(): Promise<PodStudentRecord[]> { return []; }
}

// FUTURE: adapters/pod-transport.esinet.ts
// v2: Automated web interaction with esinet portal using school's credentials
// Uses Puppeteer/Playwright to log in, navigate PPOD, push/pull data
// Requires: school's esinet username + password stored encrypted in tenant config
// Fragile: any DES UI change can break this — file-based remains as fallback
// Swap in module: { provide: 'POD_TRANSPORT', useClass: EsinetWebTransport }
```

---

#### [NEW] `regulatory-dashboard.service.ts` — Dashboard aggregation

```typescript
// Returns status summary across all regulatory domains
// Joins: regulatory_calendar_events (upcoming deadlines), regulatory_submissions (recent),
// live counts from attendance/behaviour for Tusla metrics, ppod sync status,
// October Returns readiness, CBA sync status
async getDashboard(tenantId: string): Promise<DashboardSummary>
```

---

#### [NEW] `regulatory-october-returns.service.ts` — October Returns Readiness

The October Returns is the **single most important statutory return** — it determines teacher allocation and capitation funding for the school. It's generated *through PPOD* (not as a separate file), but EduPod must ensure data quality matches what's in PPOD.

```typescript
// ─── October Returns Readiness ──────────────────────────────────────────────
// The school generates October Returns via PPOD by late October each year.
// EduPod's role: validate that local student data is complete and consistent
// with what should be in PPOD, flagging issues BEFORE the school attempts
// to generate returns on esinet.

// Check overall readiness — returns pass/fail per validation category
async checkReadiness(tenantId: string, academicYear: string): Promise<OctoberReturnsReadiness>
// → Checks: every enrolled student has PPSN, DOB, gender, nationality,
//   address, class assignment, year group, programme code, subject allocations
// → Returns: { ready: boolean, categories: [{name, status, issues}] }

// List students with data issues that would block October Returns
async getStudentIssues(tenantId: string, academicYear: string): Promise<StudentIssue[]>
// → Returns per-student list: { student, missingFields[], invalidFields[], warnings[] }

// Preview student data as it would appear in October Returns
async previewReturnsData(tenantId: string, academicYear: string): Promise<OctoberReturnsPreview>
// → Generates the exact dataset that PPOD would use for returns:
//   student count by year group, programme, gender; subject enrolment counts;
//   recognised vs short-term student classification

// Validate specific student for October Returns compliance
async validateStudent(tenantId: string, studentId: string): Promise<StudentValidation>
```

**Integration points (read-only queries against existing tables):**
- `students` — PPSN, DOB, gender, nationality, enrolment status
- `households` — address data
- `class_enrolments` — class assignment for current academic year
- `subjects` + `des_subject_code_mappings` — subject allocation with PPOD codes
- `academic_years` / `academic_periods` — current year context

---

#### [NEW] `regulatory-cba.service.ts` — CBA Result Sync to PPOD

Junior Cycle Classroom-Based Assessments (CBA1, CBA2, SLAR) must be synced to PPOD before results can be published to parents. VSware has a one-click "Synchronise all CBA Data with PPOD" button — EduPod must match this.

```typescript
// Get CBA sync status across all subjects/classes
async getCbaStatus(tenantId: string, academicYear: string): Promise<CbaSyncStatusSummary>
// → Returns: per-subject counts of pending, synced, error

// List CBA results not yet synced to PPOD
async getPendingCbaResults(tenantId: string, academicYear: string): Promise<PendingCbaResult[]>
// → Joins: gradebook assessments (where category = CBA) + ppod_cba_sync_records
// → Returns: students with CBA grades that haven't been synced

// Generate CBA sync export (CSV matching PPOD's expected CBA import format)
async syncCbaResults(tenantId: string, dto: CbaSyncDto): Promise<CbaSyncResult>
// → Collects CBA grades from gradebook → maps to PPOD grade descriptors
// → Generates CSV for manual upload to esinet PPOD CBA section
// → Creates PpodCbaSyncRecord entries for each student/subject
// → Returns: { synced: number, failed: number, exportBuffer: Buffer }

// Sync single student's CBA results
async syncStudentCba(tenantId: string, studentId: string): Promise<CbaSyncResult>

// Map EduPod assessment grade to PPOD CBA descriptor
mapGradeToCbaDescriptor(grade: string, cbaType: string): string
// → Maps internal grade values to: Exceptional, Above Expectations,
//   In Line with Expectations, Yet to Meet Expectations
```

**Integration points:**
- `assessments` + `assessment_grades` — CBA results from gradebook module
- `assessment_categories` — filter for CBA category assessments
- `ppod_cba_sync_records` — track what's been synced (new table)
- `des_subject_code_mappings` — PPOD subject codes for CBA submission

---

#### [NEW] `regulatory-transfers.service.ts` — Inter-School Transfer Tracking

PPOD handles student transfers between schools. When a student leaves, the school marks them as an early leaver on PPOD with the destination school's roll number. The destination school then sees the student on their Inter-School Transfer List and accepts/rejects. EduPod must track this workflow.

```typescript
// List all transfers for the school (inbound + outbound)
async listTransfers(tenantId: string, filters: TransferFilters): Promise<PaginatedResult<TransferRecord>>

// Create outbound transfer (student leaving this school)
async createOutboundTransfer(tenantId: string, dto: CreateTransferDto): Promise<TransferRecord>
// → Creates InterSchoolTransfer record with direction = outbound
// → Optionally triggers student status change to 'withdrawn'
// → Generates data needed for PPOD early leaver entry (roll number, reason, date)

// Record inbound transfer (student arriving from another school)
async createInboundTransfer(tenantId: string, dto: CreateTransferDto): Promise<TransferRecord>
// → Creates InterSchoolTransfer record with direction = inbound
// → Links to existing or newly created student record

// Update transfer status (e.g. mark as confirmed on PPOD)
async updateTransfer(tenantId: string, transferId: string, dto: UpdateTransferDto): Promise<TransferRecord>

// Get transfer detail with full student info
async getTransfer(tenantId: string, transferId: string): Promise<TransferDetail>
```

**Integration points:**
- `students` — student records being transferred
- `inter_school_transfers` — transfer tracking (new table)
- Student status lifecycle (`updateStatus`) — for withdrawals on outbound transfer

---

### Worker — `apps/worker/src/`

---

#### [MODIFY] `apps/worker/src/base/queue.constants.ts`

Add new queue:

```diff
 export const QUEUE_NAMES = {
   ADMISSIONS: 'admissions',
   // ...existing...
+  REGULATORY: 'regulatory',
   REPORTS: 'reports',
   // ...existing...
 } as const;
```

---

#### [NEW] `apps/worker/src/processors/regulatory/` — New processor directory

```
processors/regulatory/
├── deadline-check.processor.ts       # Daily cron: check approaching deadlines, send reminders
├── tusla-threshold-scan.processor.ts # Daily cron: scan for students approaching 20-day threshold
├── des-returns-generate.processor.ts # On-demand: background generation of DES data files (CSV export)
├── ppod-sync.processor.ts            # On-demand: P-POD/POD push export via transport adapter
└── ppod-import.processor.ts          # On-demand: P-POD/POD pull import (CSV parse + student upsert)
```

---

#### [NEW] `deadline-check.processor.ts`

- Job name: `regulatory:deadline-check`
- Cron: daily at 07:00
- Logic: Iterate all tenants → query `regulatory_calendar_events` where `due_date - today` is in `reminder_days` array → enqueue notification jobs for matching events
- Requires: `QUEUE_NAMES.NOTIFICATIONS` injection to dispatch reminder notifications

---

#### [NEW] `tusla-threshold-scan.processor.ts`

- Job name: `regulatory:tusla-threshold-scan`
- Cron: daily at 06:00
- Logic: Iterate all tenants → query cumulative absence counts from `daily_attendance_summaries` → create `AttendancePatternAlert` records for students hitting the threshold → notify relevant staff
- Extends existing `excessive_absences` alert type — no new enum needed, just a new threshold check with Tusla-specific context in `details_json`

---

#### [NEW] `des-returns-generate.processor.ts`

- Job name: `regulatory:des-returns-generate`
- Triggered: on-demand (user clicks "Generate" in UI)
- Logic: Runs the full DES pipeline → collect → validate → format → export (via adapter) → store as `RegulatorySubmission` with file in S3
- Default adapter: `DesFileExporterCsv` outputs CSV with correct DES field ordering — admin downloads and uploads to esinet manually. Stub adapter outputs JSON for testing.

---

#### [NEW] `ppod-sync.processor.ts`

- Job name: `regulatory:ppod-sync`
- Triggered: on-demand (user clicks "Export for PPOD" in UI)
- Logic: Runs the full push pipeline → map → diff → validate → export CSV (via adapter) → update `ppod_student_mappings` → create `PpodSyncLog` entry
- Default adapter: `PodTransportCsvExport` generates a downloadable CSV matching PPOD's expected format. Admin uploads this to esinet manually.
- Future: `EsinetWebTransport` would automate the esinet session — zero pipeline changes needed.

---

#### [NEW] `ppod-import.processor.ts`

- Job name: `regulatory:ppod-import`
- Triggered: on-demand (user uploads CSV exported from esinet PPOD)
- Logic: Parse PPOD CSV → map POD fields to EduPod student format → validate (PPSN, required fields) → upsert students → create/update `ppod_student_mappings` with sync hashes → create `PpodSyncLog` entry
- This is the **primary onboarding flow** — when a school joins EduPod, they export their students from PPOD and import here. Also used after yearly PPOD progression/rollover.

---

#### [MODIFY] `apps/worker/src/cron/cron-scheduler.service.ts`

Add two new cron registrations in `onModuleInit()`:

```typescript
// Regulatory: deadline reminders — daily 07:00
await this.regulatoryQueue.add(
  REGULATORY_DEADLINE_CHECK_JOB,
  {},
  { repeat: { pattern: '0 7 * * *' }, jobId: `cron:${REGULATORY_DEADLINE_CHECK_JOB}`, removeOnComplete: 10, removeOnFail: 50 },
);

// Regulatory: Tusla threshold scan — daily 06:00
await this.regulatoryQueue.add(
  REGULATORY_TUSLA_THRESHOLD_SCAN_JOB,
  {},
  { repeat: { pattern: '0 6 * * *' }, jobId: `cron:${REGULATORY_TUSLA_THRESHOLD_SCAN_JOB}`, removeOnComplete: 10, removeOnFail: 50 },
);
```

Inject: `@InjectQueue(QUEUE_NAMES.REGULATORY) private readonly regulatoryQueue: Queue`

---

### Permissions — `packages/prisma/seed/permissions.ts`

---

#### [MODIFY] Add regulatory permission block (~line 193, after safeguarding block):

```typescript
  // ─── Regulatory Portal ────────────────────────────────────────────────────
  { permission_key: 'regulatory.view', description: 'View regulatory compliance dashboard and submissions', permission_tier: 'admin' },
  { permission_key: 'regulatory.manage', description: 'Manage regulatory submissions, calendar events, and mappings', permission_tier: 'admin' },
  { permission_key: 'regulatory.generate_reports', description: 'Generate Tusla SAR/AAR and DES Returns data files', permission_tier: 'admin' },
  { permission_key: 'regulatory.manage_reduced_days', description: 'Create and manage reduced school day records', permission_tier: 'admin' },
  { permission_key: 'regulatory.view_tusla', description: 'View Tusla threshold monitor and absence reports', permission_tier: 'staff' },
  { permission_key: 'regulatory.manage_des_mappings', description: 'Map subjects to DES codes and manage DES configuration', permission_tier: 'admin' },
  { permission_key: 'regulatory.manage_ppod_sync', description: 'Trigger P-POD/POD import/export and manage student mappings', permission_tier: 'admin' },
  { permission_key: 'regulatory.view_ppod', description: 'View P-POD/POD sync status and student mappings', permission_tier: 'admin' },
  { permission_key: 'regulatory.manage_cba_sync', description: 'Sync CBA results to PPOD and manage CBA sync records', permission_tier: 'admin' },
  { permission_key: 'regulatory.manage_transfers', description: 'Create and manage inter-school transfer records', permission_tier: 'admin' },
  { permission_key: 'regulatory.view_october_returns', description: 'View October Returns readiness and student data issues', permission_tier: 'admin' },
```

---

### Frontend — `apps/web/src/`

---

#### [NEW] Route group: `apps/web/src/app/[locale]/(school)/regulatory/`

```
regulatory/
├── page.tsx                          # Compliance Dashboard (main landing page)
├── _components/
│   ├── compliance-status-card.tsx    # Status card per domain
│   ├── deadline-timeline.tsx         # Scrollable deadline timeline
│   ├── regulatory-nav.tsx            # Sub-nav within regulatory section
│   └── submission-history-table.tsx  # Audit log table
├── calendar/
│   └── page.tsx                      # Regulatory Calendar view
├── tusla/
│   ├── page.tsx                      # Tusla hub — threshold monitor
│   ├── sar/
│   │   └── page.tsx                  # SAR generation wizard
│   ├── aar/
│   │   └── page.tsx                  # AAR generation wizard
│   ├── reduced-days/
│   │   └── page.tsx                  # Reduced school day register
│   └── _components/
│       ├── threshold-monitor-table.tsx
│       ├── sar-wizard.tsx
│       ├── aar-wizard.tsx
│       └── reduced-day-form.tsx
├── des-returns/
│   ├── page.tsx                      # DES generation dashboard (readiness + file generation)
│   ├── subject-mappings/
│   │   └── page.tsx                  # DES subject code mapping
│   ├── generate/
│   │   └── page.tsx                  # File generation wizard (select file → preview → generate → download CSV)
│   └── _components/
│       ├── readiness-checklist.tsx
│       ├── subject-mapping-table.tsx
│       ├── file-preview.tsx          # Preview file data before generating
│       └── file-generation-wizard.tsx
├── october-returns/
│   ├── page.tsx                      # October Returns readiness dashboard
│   └── _components/
│       ├── readiness-overview.tsx    # Pass/fail per validation category
│       ├── student-issues-table.tsx  # Students with blocking data issues
│       └── returns-preview.tsx       # Preview data as PPOD would see it
├── ppod/
│   ├── page.tsx                      # P-POD/POD sync status dashboard
│   ├── students/
│   │   └── page.tsx                  # Student mapping list with sync status
│   ├── import/
│   │   └── page.tsx                  # Import from PPOD CSV export (PULL)
│   ├── export/
│   │   └── page.tsx                  # Export for PPOD manual upload (PUSH)
│   ├── sync-log/
│   │   └── page.tsx                  # Sync history audit log
│   ├── cba/
│   │   └── page.tsx                  # CBA sync status + trigger sync
│   ├── transfers/
│   │   ├── page.tsx                  # Inter-school transfer list
│   │   └── new/
│   │       └── page.tsx              # Create transfer (outbound early leaver)
│   └── _components/
│       ├── sync-status-overview.tsx
│       ├── student-mapping-table.tsx
│       ├── sync-diff-preview.tsx     # Preview what would change
│       ├── sync-log-table.tsx
│       ├── csv-import-wizard.tsx     # Upload + preview + confirm PPOD CSV import
│       ├── csv-export-wizard.tsx     # Select scope → preview → generate → download
│       ├── cba-sync-table.tsx        # CBA results pending sync
│       └── transfer-form.tsx         # Create/edit transfer record
├── anti-bullying/
│   ├── page.tsx                      # Bí Cineálta compliance hub
│   └── _components/
│       └── bullying-incident-summary.tsx
├── submissions/
│   └── page.tsx                      # Submission audit log
└── safeguarding/
    └── page.tsx                      # Safeguarding compliance view (links to existing)
```

---

#### [MODIFY] Sidebar navigation — `apps/web/src/app/[locale]/(school)/layout.tsx`

Add `Regulatory` item to the sidebar navigation, after existing nav items. Use `Shield` icon from `lucide-react`.

```typescript
{
  title: t('nav.regulatory'),
  href: '/regulatory',
  icon: Shield,
  permission: 'regulatory.view',
  children: [
    { title: t('nav.regulatory_dashboard'), href: '/regulatory' },
    { title: t('nav.regulatory_calendar'), href: '/regulatory/calendar' },
    { title: t('nav.regulatory_tusla'), href: '/regulatory/tusla' },
    { title: t('nav.regulatory_des'), href: '/regulatory/des-returns' },
    { title: t('nav.regulatory_october'), href: '/regulatory/october-returns' },
    { title: t('nav.regulatory_ppod'), href: '/regulatory/ppod' },
    { title: t('nav.regulatory_cba'), href: '/regulatory/ppod/cba' },
    { title: t('nav.regulatory_transfers'), href: '/regulatory/ppod/transfers' },
    { title: t('nav.regulatory_bullying'), href: '/regulatory/anti-bullying' },
    { title: t('nav.regulatory_submissions'), href: '/regulatory/submissions' },
  ],
}
```

---

#### [NEW] i18n keys — `apps/web/messages/en.json` and `apps/web/messages/ar.json`

Add `regulatory` namespace with keys for all navigation items, page titles, form labels, status descriptions, and error messages.

---

### Architecture Docs Update

---

#### [MODIFY] `architecture/feature-map.md`

Add new "Regulatory Portal" section documenting the new module, routes, and integrations.

#### [MODIFY] `architecture/module-blast-radius.md`

Document that `regulatory` module reads from `attendance`, `behaviour`, `scheduling`, `students`, `gradebook`, and `classes` modules but does not write to them (except student upserts during PPOD import, which go through the standard students module).

#### [MODIFY] `architecture/event-job-catalog.md`

Add five new jobs: `regulatory:deadline-check`, `regulatory:tusla-threshold-scan`, `regulatory:des-returns-generate`, `regulatory:ppod-sync`, `regulatory:ppod-import`.

---

## Verification Plan

### Automated Tests

Each new service file has a co-located `.spec.ts` file. Tests follow existing patterns:

**Test command:**
```bash
cd apps/api && npx jest --testPathPattern="regulatory" --verbose
```

**Key test cases per service:**

#### `regulatory-calendar.service.spec.ts`
- Create, update, delete calendar events
- Seed default events for academic year
- Filter by domain, date range, status
- Pagination shape `{ data, meta }`

#### `regulatory-tusla.service.spec.ts`
- Threshold monitor returns students with ≥ N absent days
- SAR generation produces correct row count and categorisation
- SAR excludes students < 20 days
- AAR produces correct aggregate counts
- Suspensions query filters by `suspension_days >= 6`
- Expulsions query returns all exclusion cases

#### `regulatory-des.service.spec.ts`
- Readiness check reports missing PPSN as validation error
- Readiness check reports unmapped subjects
- File A collector produces correct staff data shape
- File C collector produces correct class data shape
- File D collector produces correct subject + DES code data shape
- File E collector produces correct student data shape
- Form TL generates correct teacher-hours-per-subject data
- Validator catches PPSN format errors, missing required fields
- Formatter structures data into correct DES field ordering
- CSV exporter outputs valid CSV with correct column headers
- Full pipeline (collect → validate → format → export) produces a downloadable CSV file
- Subject mapping CRUD operations

#### `regulatory-october-returns.service.spec.ts`
- Readiness check identifies students missing PPSN
- Readiness check identifies students without class assignment
- Readiness check identifies students without subject allocations
- Readiness check produces per-category pass/fail
- Student issues list returns correct missing/invalid fields per student
- Preview returns correct student counts by year group, programme, gender
- Preview returns correct subject enrolment counts
- Validate single student catches all required field gaps

#### `regulatory-ppod.service.spec.ts`
- **PUSH**: Data mapper transforms EduPod student to POD format correctly
- **PUSH**: PPSN, name, DOB, gender, nationality, address all mapped
- **PUSH**: Diff engine detects new students (no existing mapping)
- **PUSH**: Diff engine detects changed students (hash mismatch)
- **PUSH**: Diff engine skips unchanged students (hash match)
- **PUSH**: Validator catches missing required fields
- **PUSH**: Export with CSV transport produces valid CSV with PPOD column headers
- **PUSH**: Export updates mappings and creates sync log entry
- **PULL**: CSV import parser correctly reads PPOD export format
- **PULL**: Data mapper transforms POD record to EduPod student format
- **PULL**: Import creates new students for unmatched PPSN
- **PULL**: Import updates existing students for matched PPSN (via mapping)
- **PULL**: Import skips unchanged records (hash match)
- **PULL**: Import creates PpodStudentMapping entries with correct hashes
- **PULL**: Import creates PpodSyncLog entry with record counts
- **PULL**: Import validates required fields before upsert
- Sync status returns correct pending/synced/error counts
- Single student export works correctly

#### `regulatory-cba.service.spec.ts`
- CBA status returns per-subject counts of pending, synced, error
- Pending CBA results correctly joins gradebook assessments with sync records
- CBA grade to descriptor mapping is correct for all four Junior Cycle levels
- Sync generates CSV with correct PPOD CBA format (student PPSN, subject code, CBA type, descriptor)
- Sync creates PpodCbaSyncRecord entries for each student/subject
- Sync skips already-synced results (idempotent)
- Single student CBA sync works correctly

#### `regulatory-transfers.service.spec.ts`
- Create outbound transfer with valid data succeeds
- Create outbound transfer requires destination school roll number
- Create inbound transfer links to existing student record
- List transfers filters by direction and status
- Update transfer status to completed marks ppod_confirmed
- Transfer pagination and sorting work correctly

#### `regulatory-dashboard.service.spec.ts`
- Dashboard returns status for all domains
- Overdue items correctly identified

#### `regulatory-submission.service.spec.ts`
- Create, update, list submissions
- Filter by domain and academic year

**Existing test suite regression:**
```bash
# Run full suite to verify no regressions
cd /Users/ram/Library/Mobile\ Documents/com~apple~CloudDocs/Shared/GitHub\ Repos/SDB
npx turbo test
```

### Pre-flight
```bash
npx turbo type-check
npx turbo lint
```

### Manual Verification

> [!NOTE]
> Ram — I'd appreciate your guidance on which of these you'd like tested manually in the browser vs. just via unit tests. The frontend pages in particular are hard to unit-test meaningfully. Here's what I'd recommend for browser verification:

1. **Navigate to Regulatory Portal** — Verify sidebar shows "Regulatory" with Shield icon, click opens compliance dashboard
2. **Compliance Dashboard** — Verify domain status cards render, calendar events show upcoming deadlines
3. **Tusla Threshold Monitor** — Navigate to `/regulatory/tusla`, verify table shows students approaching 20-day threshold with correct absence counts
4. **Reduced School Day** — Create a reduced school day record, verify it appears in the list
5. **DES Subject Mapping** — Navigate to `/regulatory/des-returns/subject-mappings`, map a subject to a DES code, verify it saves
6. **DES File Generation** — Navigate to `/regulatory/des-returns/generate`, select File E, preview data, generate CSV, verify download contains correct student data with PPSN and DES-formatted fields
7. **October Returns Readiness** — Navigate to `/regulatory/october-returns`, verify readiness categories show pass/fail, verify student issues table shows students with missing data
8. **PPOD Import (Pull)** — Navigate to `/regulatory/ppod/import`, upload a test CSV matching PPOD export format, verify preview shows correct field mapping, confirm import, verify students appear in student list
9. **PPOD Export (Push)** — Navigate to `/regulatory/ppod/export`, verify diff preview shows which students would be exported, generate CSV, verify download contains correct PPOD-formatted data
10. **CBA Sync** — Navigate to `/regulatory/ppod/cba`, verify pending CBA results show from gradebook, trigger sync, verify CSV is generated with correct CBA descriptors
11. **Inter-School Transfers** — Navigate to `/regulatory/ppod/transfers`, create an outbound transfer record, verify it appears in list with correct status
