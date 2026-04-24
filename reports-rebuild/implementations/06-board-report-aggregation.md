# Implementation 06 — Board Report Aggregation

> **Wave:** 2 (parallel, API restart)
> **Depends on:** 01
> **Deploys:** API restart only

---

## Goal

Replace the stubbed `BoardReportService.generateBoardReport()` with a real implementation that aggregates a termly board packet from the domain data. Output is a structured `BoardReport` object that the UI renders section-by-section and the export pipeline serialises.

## Board report structure

The board report is a fixed-shape document with sections the user chooses at generation time. Ship the following 8 sections:

1. **Executive summary** — key movements this term (student headcount, attendance rate, collection rate, at-risk count, safeguarding caseload).
2. **Enrolment & demographics** — headcount by year group, gender balance, nationality split, enrolment vs last term.
3. **Attendance** — average rate by year group + subject; chronic absenteeism count; day-of-week pattern.
4. **Academic performance** — pass/fail rates by year group, subject average grades, top/bottom performers (anonymised — student initials only).
5. **Behaviour** — incident count by type, sanction outcomes, appeals outcome, trend vs last term.
6. **Safeguarding** — open concerns count + age histogram, actions taken, critical incidents summary (DLP-only detail; board packet gets counts not names by default).
7. **Finance** — invoices issued, collection rate, overdue amount, write-offs. Cash-flow snapshot.
8. **Staffing** — headcount, turnover, attendance, pending leave, cover statistics.

Each section is optional at generation time (UI lets author tick which to include). The default is all 8.

## What to change

### 1. `BoardReportService` rewrite (`apps/api/src/modules/reports/board-report.service.ts`)

Public interface:

```ts
type BoardReportRequest = {
  tenantId: string;
  term: { academic_year_id: string; term_number: number };
  sections: BoardReportSection[]; // ['executive', 'enrolment', 'attendance', ...]
  anonymise: boolean; // default true for student-level detail
};

type BoardReport = {
  tenant: { name: string; academic_year: string; term: string };
  generated_at: string;
  generated_by: string;
  sections: {
    executive?: ExecutiveSummarySection;
    enrolment?: EnrolmentSection;
    attendance?: AttendanceSection;
    academic?: AcademicSection;
    behaviour?: BehaviourSection;
    safeguarding?: SafeguardingSection;
    finance?: FinanceSection;
    staffing?: StaffingSection;
  };
};

class BoardReportService {
  async generate(request: BoardReportRequest, userId: string): Promise<BoardReport>;
}
```

Each section type is a discriminated-union Zod schema in `@school/shared/reports/board-report`.

### 2. Section aggregators

One file per section in `apps/api/src/modules/reports/board-report/sections/`:

- `executive-summary.aggregator.ts`
- `enrolment.aggregator.ts`
- `attendance.aggregator.ts`
- `academic.aggregator.ts`
- `behaviour.aggregator.ts`
- `safeguarding.aggregator.ts`
- `finance.aggregator.ts`
- `staffing.aggregator.ts`

Each exports a `aggregate(tx, tenantId, term, options): Promise<SectionResult>`. Each uses existing domain services where possible (`AttendanceAnalyticsService`, `StaffAnalyticsService`, etc.) — do not re-implement analytics that already exist.

All aggregators run inside one RLS transaction in the service's `generate` method to avoid N transactions per board packet.

### 3. Anonymisation

When `anonymise: true` (default):

- In academic section's top/bottom performers: show initials only (`"A.S."`) and year group, not full name or student id.
- In behaviour section: aggregate counts by incident type and year group; do not list specific incidents.
- In safeguarding section: counts only, no student identifiers, no concern summaries.

When `anonymise: false` (requires `safeguarding.view_detail` permission): full names and identifiers appear. This is gated at the controller level.

### 4. Generation history

Each generated board report is saved to a `BoardReport` Prisma model if one exists (check schema). If not, add a simple one in impl 01 (already covered under "schema extensions" — BoardReport already exists, just verify). The service writes a `BoardReport` row with `{ tenant_id, term, generated_at, generated_by, sections_json, anonymise }`.

If the schema already has this table, reuse it. Otherwise add it in a fix-forward migration.

### 5. Endpoint

The existing `POST /v1/reports/board` endpoint — update its body Zod schema to match `BoardReportRequest`. Update controller to call `generate` and return `{ data: boardReport, meta: { generated_at, generated_by } }`.

Add `GET /v1/reports/board/history` — list prior generations with id, term, generated_at, generated_by, sections_included. Paginated.

### 6. Export integration

The board report is rendered either as JSON (default, for in-app display) or exported as PDF/Excel/Word through impl 04's pipeline. Pass the board-report result into `ReportExportService` wrapping it in the `ExportInput` shape. Each section renders as one or two pages in the PDF; each section gets its own sheet in Excel; each section is a chapter in Word.

## Testing requirements

- **Unit test per section aggregator** — seed targeted fixture, call aggregate, assert shape + values.
- **Integration test** — `POST /v1/reports/board` with a full 8-section request, verify a parseable BoardReport is returned.
- **Anonymise test** — same request with `anonymise: true` vs `false`; verify names collapse to initials in the former.
- **RLS test** — Tenant A's board report does not leak into Tenant B's.

## Post-deploy verification

1. `POST /v1/reports/board` with `{ term: { academic_year_id: '<current>', term_number: 2 }, sections: ['executive', 'attendance', 'finance'] }` as owner@nhqs.test.
2. Confirm all three sections have real numbers matching the underlying data (cross-check against `/reports/attendance` and `/finance/reports`).
3. Generate again with full 8 sections → confirm all present.
4. Call the export pipeline with format=pdf, verify a multi-page PDF with section headers.

## Follow-ups for subsequent waves

- **Impl 20 (Board + Compliance UI)** consumes this endpoint and renders the sections.
- **Impl 08 (Scheduled worker)** can run a scheduled board report with a cron.

## Rollback

`git revert <sha>` — service changes only. Safe.
