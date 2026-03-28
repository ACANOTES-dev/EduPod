# Phase C — DES Returns & October Returns Pipeline

**Wave**: 2
**Deploy Order**: d3
**Depends On**: A

## Scope

Implements the full DES September Returns data extraction pipeline (Files A–E and Form TL) with a pluggable adapter architecture, plus the October Returns readiness checker. The pipeline follows a four-stage pattern — collect (query DB) → validate (DES rules) → format (DES field layout) → export (adapter). The v1 adapter outputs CSV matching DES field specifications for manual upload to esinet. A stub adapter outputs JSON for testing. October Returns readiness validates that student data is complete and consistent with what PPOD expects.

## Deliverables

### DES Service & Adapters
- `apps/api/src/modules/regulatory/regulatory-des.service.ts` — full pipeline: collectFileA/C/D/E, collectFormTl, validate, format, generateFile
- `apps/api/src/modules/regulatory/regulatory-des.service.spec.ts`
- `apps/api/src/modules/regulatory/adapters/des-file-exporter.interface.ts` — `DesFileExporter` interface
- `apps/api/src/modules/regulatory/adapters/des-file-exporter.csv.ts` — v1 CSV adapter (DES field ordering, column headers)
- `apps/api/src/modules/regulatory/adapters/des-file-exporter.stub.ts` — test adapter (JSON output)

### October Returns Service
- `apps/api/src/modules/regulatory/regulatory-october-returns.service.ts` — readiness check, student issues, preview, single-student validation
- `apps/api/src/modules/regulatory/regulatory-october-returns.service.spec.ts`

### Controller Endpoints
- `apps/api/src/modules/regulatory/regulatory.controller.ts` — **add** DES + October Returns endpoint groups:
  - `GET /v1/regulatory/des/readiness`
  - `POST /v1/regulatory/des/generate/:fileType`
  - `GET /v1/regulatory/des/preview/:fileType`
  - `GET /v1/regulatory/des/subject-mappings`
  - `POST /v1/regulatory/des/subject-mappings`
  - `GET /v1/regulatory/october-returns/readiness`
  - `GET /v1/regulatory/october-returns/preview`
  - `GET /v1/regulatory/october-returns/issues`
- `apps/api/src/modules/regulatory/regulatory.controller.spec.ts` — **add** DES + October Returns test cases

## Out of Scope

- DES subject code mapping CRUD (already in Phase A — the `des_subject_code_mappings` table and basic CRUD)
- Worker processor for background DES file generation (Phase E)
- DES and October Returns frontend pages (Phase G)
- Automated esinet upload (v2 future — not in any phase)
- P-POD/POD sync (Phase D)
- Tusla services (Phase B)

## Dependencies

**Phase A** provides:
- `des_subject_code_mappings` table — maps tenant subjects to DES canonical codes
- `regulatory_submissions` table — stores generated file metadata and S3 keys
- Zod schemas: `desReadinessCheckSchema`, `octoberReturnsReadinessSchema`
- Constants: `DES_SUBJECT_CODES`, `PPOD_SUBJECT_CODES`, `OCTOBER_RETURNS_FIELDS`
- The controller file, module registration, and `DES_FILE_EXPORTER` DI token in the module

## Implementation Notes

- **DES pipeline architecture**: The service implements collect/validate/format as internal methods. The export step delegates to the injected `DES_FILE_EXPORTER` adapter. The module binds `DesFileExporterCsv` as the default; tests swap in `DesFileExporterStub`.
- **Integration points (read-only against existing tables)**:
  - File A: `staff_profiles` (qualifications, employment type, hours) + `users` (names)
  - File C: `classes` (sizes, year groups) + `class_enrolments` (counts)
  - File D: `subjects` + `des_subject_code_mappings` (DES codes, levels)
  - File E: `students` (PPSN, DOB, gender, nationality, enrolment)
  - Form TL: `schedules` + `staff_profiles` + `subjects` + `des_subject_code_mappings`
  - October Returns: `students`, `households` (address), `class_enrolments`, `subjects` + `des_subject_code_mappings`, `academic_years`/`academic_periods`
- **Validation rules**: PPSN format (7 digits + 1-2 letters), required field presence, subject code consistency, date range validity, DES-specific field constraints.
- **October Returns**: The single most important statutory return — determines teacher allocation and capitation. EduPod validates data quality before the school generates returns via PPOD on esinet. Readiness returns pass/fail per category; student issues returns per-student missing/invalid fields.
- Controller endpoints added under `// ─── DES Returns ───` and `// ─── October Returns ───` section separators.
- The `generateFile` method stores the output in S3 and creates a `RegulatorySubmission` record (uses the submission service from Phase A).
