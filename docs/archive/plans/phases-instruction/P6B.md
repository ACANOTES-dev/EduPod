# PHASE 6b: Payroll

**Duration estimate**: 3 weeks
**Dependencies**: Phase 2 (staff_profiles, scheduling), Phase 1 (RBAC, approval workflows), Phase 6 (finance patterns — Puppeteer templates, sequence generation, approval integration)
**Requires shared context**: `00-shared-context.md`
**Adjacent phase reference if needed**: `phase-2-households-students-staff.md` (for staff_profiles table), `phase-4-scheduling-attendance.md` (for schedules table — used to auto-populate class counts)

---

## SCOPE

This phase builds the payroll module: staff compensation management (salaried and per-class models), monthly payroll runs with school-wide working days, real-time calculation preview, immutable snapshot finalisation, approval-gated finalisation for non-principal users, payslip generation (individual and mass-export PDF), staff payment history, and payroll analytics (cost trend chart, YTD summary, bonus analysis). After this phase, the principal can run monthly payroll and generate payslips for all staff.

---

## COMPENSATION MODELS

### Model A — Salaried Staff

The principal defines a **monthly base salary**. Each month, the principal inputs **days worked** for the staff member. The system derives pay against the school-wide **total working days**.

**Calculation**:

```
daily_rate = base_salary / total_working_days

IF days_worked <= total_working_days:
    basic_pay = daily_rate × days_worked
    bonus_pay = 0
ELSE:
    basic_pay = base_salary   (full month)
    bonus_pay = daily_rate × bonus_day_multiplier × (days_worked - total_working_days)

total_pay = basic_pay + bonus_pay
```

`bonus_day_multiplier` is configurable per staff (default 1.0 = same rate, 1.5 = time-and-a-half).

### Model B — Per-Class Staff

The principal defines a **per-class rate**, an **assigned class count**, and a **bonus class rate**.

**Calculation**:

```
IF classes_taught <= assigned_class_count:
    basic_pay = classes_taught × per_class_rate
    bonus_pay = 0
ELSE:
    basic_pay = assigned_class_count × per_class_rate
    bonus_pay = (classes_taught - assigned_class_count) × bonus_class_rate

total_pay = basic_pay + bonus_pay
```

**No minimum guarantee** — per-class staff are paid only for classes taught.

### Auto-Population from Scheduling Module

When `tenant_settings.payroll.autoPopulateClassCounts = true`, the system pre-fills `classes_taught` for per-class teachers from the scheduling module: count of schedule entries where `teacher_staff_id` matches and `effective_start_date <= last_day_of_month AND (effective_end_date IS NULL OR effective_end_date >= first_day_of_month)`. The principal can override. Original auto-populated value preserved in `auto_populated_class_count` for audit.

---

## DATA MODELS

### 3.9 Payroll

#### `staff_compensation`

| Column               | Type                         | Constraints                   |
| -------------------- | ---------------------------- | ----------------------------- |
| id                   | UUID                         | PK                            |
| tenant_id            | UUID                         | FK → tenants, NOT NULL        |
| staff_profile_id     | UUID                         | FK → staff_profiles, NOT NULL |
| compensation_type    | ENUM('salaried','per_class') | NOT NULL                      |
| base_salary          | NUMERIC(12,2)                | NULL                          |
| per_class_rate       | NUMERIC(12,2)                | NULL                          |
| assigned_class_count | INT                          | NULL                          |
| bonus_class_rate     | NUMERIC(12,2)                | NULL                          |
| bonus_day_multiplier | NUMERIC(5,2)                 | NOT NULL DEFAULT 1.0          |
| effective_from       | DATE                         | NOT NULL                      |
| effective_to         | DATE                         | NULL                          |
| created_by_user_id   | UUID                         | FK → users, NOT NULL          |
| created_at           | TIMESTAMPTZ                  | NOT NULL                      |
| updated_at           | TIMESTAMPTZ                  | NOT NULL                      |

**Validation rules**:

- If `compensation_type = 'salaried'`: `base_salary` required; `per_class_rate`, `assigned_class_count`, `bonus_class_rate` must be NULL
- If `compensation_type = 'per_class'`: `per_class_rate`, `assigned_class_count`, `bonus_class_rate` required; `base_salary` must be NULL
- `bonus_day_multiplier` applies only to salaried staff (multiplier on daily rate for extra days). Default 1.0 means same rate. 1.5 means time-and-a-half for extra days. Ignored for per-class staff.
- `bonus_class_rate` is the rate paid for each class above `assigned_class_count`. Can equal `per_class_rate` or differ.
- Only one active compensation record (`effective_to IS NULL`) per `staff_profile_id` at any time. Setting a new compensation record automatically closes the previous one by setting `effective_to = new_record.effective_from - 1 day`.

**Constraint**: Partial unique index — `UNIQUE (tenant_id, staff_profile_id) WHERE effective_to IS NULL`

#### `payroll_runs`

| Column               | Type                                                     | Constraints                  |
| -------------------- | -------------------------------------------------------- | ---------------------------- |
| id                   | UUID                                                     | PK                           |
| tenant_id            | UUID                                                     | FK → tenants, NOT NULL       |
| period_label         | VARCHAR(100)                                             | NOT NULL                     |
| period_month         | SMALLINT                                                 | NOT NULL, CHECK (1-12)       |
| period_year          | SMALLINT                                                 | NOT NULL                     |
| total_working_days   | SMALLINT                                                 | NOT NULL                     |
| status               | ENUM('draft','pending_approval','finalised','cancelled') | NOT NULL DEFAULT 'draft'     |
| total_basic_pay      | NUMERIC(14,2)                                            | NOT NULL DEFAULT 0           |
| total_bonus_pay      | NUMERIC(14,2)                                            | NOT NULL DEFAULT 0           |
| total_pay            | NUMERIC(14,2)                                            | NOT NULL DEFAULT 0           |
| headcount            | INT                                                      | NOT NULL DEFAULT 0           |
| created_by_user_id   | UUID                                                     | FK → users, NOT NULL         |
| finalised_by_user_id | UUID                                                     | NULL, FK → users             |
| finalised_at         | TIMESTAMPTZ                                              | NULL                         |
| approval_request_id  | UUID                                                     | NULL, FK → approval_requests |
| created_at           | TIMESTAMPTZ                                              | NOT NULL                     |
| updated_at           | TIMESTAMPTZ                                              | NOT NULL                     |

**Constraint**: `UNIQUE (tenant_id, period_month, period_year) WHERE status != 'cancelled'` — one payroll run per calendar month per tenant. Cancelled runs excluded so the month can be re-used.

**`period_label`**: Free-text label for display (e.g., "March 2026"). `period_month` and `period_year` are the canonical identifiers.

**`total_working_days`**: School-wide figure entered by the principal. Applied to all salaried staff calculations in this run. Not per-staff.

**Status transitions** (enforced at API layer):

- `draft → pending_approval` (when non-principal user submits for approval)
- `draft → finalised` (when school_owner user finalises directly — no approval needed)
- `pending_approval → finalised` (after approval granted)
- `pending_approval → draft` (if approval rejected — returns to draft for correction)
- `draft → cancelled` (discard before finalisation)
- BLOCKED: `finalised → *` (finalised runs are immutable)

**Finalisation side-effects**:

1. Snapshot all entries (rates, inputs, computations are frozen)
2. Compute `total_basic_pay`, `total_bonus_pay`, `total_pay`, `headcount` from entries
3. Status set to `finalised`, `finalised_by_user_id` and `finalised_at` recorded
4. Audit log entry created
5. All payslips auto-generated for the run

#### `payroll_entries`

| Column                        | Type                         | Constraints                   |
| ----------------------------- | ---------------------------- | ----------------------------- |
| id                            | UUID                         | PK                            |
| tenant_id                     | UUID                         | FK → tenants, NOT NULL        |
| payroll_run_id                | UUID                         | FK → payroll_runs, NOT NULL   |
| staff_profile_id              | UUID                         | FK → staff_profiles, NOT NULL |
| compensation_type             | ENUM('salaried','per_class') | NOT NULL                      |
| snapshot_base_salary          | NUMERIC(12,2)                | NULL                          |
| snapshot_per_class_rate       | NUMERIC(12,2)                | NULL                          |
| snapshot_assigned_class_count | INT                          | NULL                          |
| snapshot_bonus_class_rate     | NUMERIC(12,2)                | NULL                          |
| snapshot_bonus_day_multiplier | NUMERIC(5,2)                 | NULL                          |
| days_worked                   | SMALLINT                     | NULL                          |
| classes_taught                | INT                          | NULL                          |
| auto_populated_class_count    | INT                          | NULL                          |
| basic_pay                     | NUMERIC(12,2)                | NOT NULL DEFAULT 0            |
| bonus_pay                     | NUMERIC(12,2)                | NOT NULL DEFAULT 0            |
| total_pay                     | NUMERIC(12,2)                | NOT NULL DEFAULT 0            |
| notes                         | TEXT                         | NULL                          |
| created_at                    | TIMESTAMPTZ                  | NOT NULL                      |
| updated_at                    | TIMESTAMPTZ                  | NOT NULL                      |

**Constraint**: `UNIQUE (tenant_id, payroll_run_id, staff_profile_id)` — one entry per staff per run.

**Snapshot fields** (`snapshot_*`): Captured from the staff member's active `staff_compensation` record at the time the payroll run is created (or when a draft run's entries are refreshed). These are the rates used for calculation and are **never updated after finalisation**, even if the live compensation record changes.

**Input fields**:

- `days_worked`: Entered by principal for salaried staff. NULL for per-class staff.
- `classes_taught`: For per-class staff. If `tenant_settings.payroll.autoPopulateClassCounts = true`, this is pre-populated from the scheduling module (count of schedule entries for this teacher in the run's month where `effective_start_date <= last_day_of_month AND (effective_end_date IS NULL OR effective_end_date >= first_day_of_month)`). Principal can override.
- `auto_populated_class_count`: The original value from the scheduling module before any principal override. Preserved for audit trail. NULL if auto-population is disabled or for salaried staff.

**Calculation rules** (computed in real-time during draft, frozen on finalisation):

For `compensation_type = 'salaried'`:

```
daily_rate = snapshot_base_salary / payroll_run.total_working_days

IF days_worked <= total_working_days:
    basic_pay = daily_rate × days_worked
    bonus_pay = 0
ELSE:
    basic_pay = snapshot_base_salary
    bonus_pay = daily_rate × snapshot_bonus_day_multiplier × (days_worked - total_working_days)

total_pay = basic_pay + bonus_pay
```

For `compensation_type = 'per_class'`:

```
IF classes_taught <= snapshot_assigned_class_count:
    basic_pay = classes_taught × snapshot_per_class_rate
    bonus_pay = 0
ELSE:
    basic_pay = snapshot_assigned_class_count × snapshot_per_class_rate
    bonus_pay = (classes_taught - snapshot_assigned_class_count) × snapshot_bonus_class_rate

total_pay = basic_pay + bonus_pay
```

**Rounding rules**: Intermediate values (daily_rate) computed to 4 decimal places using `ROUND(x, 4)` (standard half-up). Final values (basic_pay, bonus_pay, total_pay) rounded to 2 decimal places as the last step. Run totals are `SUM()` of already-rounded entry values, then rounded to 2dp.

All monetary values are rounded to 2 decimal places. Division uses `NUMERIC` precision (no floating-point).

**`notes`**: Optional free-text note per entry, `VARCHAR(1000)` max length. The principal can annotate individual entries (e.g., "Covered for absent teacher 3 days").

#### `payslips`

| Column                | Type        | Constraints                           |
| --------------------- | ----------- | ------------------------------------- |
| id                    | UUID        | PK                                    |
| tenant_id             | UUID        | FK → tenants, NOT NULL                |
| payroll_entry_id      | UUID        | UNIQUE FK → payroll_entries, NOT NULL |
| payslip_number        | VARCHAR(50) | NOT NULL, immutable                   |
| template_locale       | VARCHAR(10) | NOT NULL                              |
| issued_at             | TIMESTAMPTZ | NOT NULL                              |
| issued_by_user_id     | UUID        | NULL, FK → users                      |
| snapshot_payload_json | JSONB       | NOT NULL                              |
| render_version        | VARCHAR(50) | NOT NULL                              |
| created_at            | TIMESTAMPTZ | NOT NULL                              |

**Constraint**: `UNIQUE (tenant_id, payslip_number)`

**`payslip_number` generation**: `{branding.payslip_prefix}-{YYYYMM}-{padded_sequence}` using `tenant_sequences WHERE sequence_type = 'payslip'`. Row-level `SELECT ... FOR UPDATE` locking.

**`snapshot_payload_json` schema**:

```typescript
{
  staff: {
    full_name: string,
    staff_number: string | null,
    department: string | null,
    job_title: string | null,
    employment_type: string,
    bank_name: string | null,
    bank_account_last4: string | null,
    bank_iban_last4: string | null
  },
  period: {
    label: string,
    month: number,
    year: number,
    total_working_days: number
  },
  compensation: {
    type: 'salaried' | 'per_class',
    base_salary: number | null,
    per_class_rate: number | null,
    assigned_class_count: number | null,
    bonus_class_rate: number | null,
    bonus_day_multiplier: number | null
  },
  inputs: {
    days_worked: number | null,
    classes_taught: number | null
  },
  calculations: {
    basic_pay: number,
    bonus_pay: number,
    total_pay: number
  },
  school: {
    name: string,
    name_ar: string | null,
    logo_url: string | null,
    currency_code: string
  }
}
```

**Immutability**: Payslips are generated on payroll finalisation and are never modified. `snapshot_payload_json` is the source of truth for rendering — it contains all data needed to produce the payslip without any database lookups.

**Mass export**: Puppeteer renders a single consolidated PDF from all payslips in a payroll run (one payslip per page, page breaks between staff). Individual payslip rendering uses the same template but produces a single-page PDF.

**Indexes (Section 3.10)**:

```sql
CREATE INDEX idx_staff_compensation_tenant_staff ON staff_compensation(tenant_id, staff_profile_id);
CREATE UNIQUE INDEX idx_staff_compensation_active ON staff_compensation(tenant_id, staff_profile_id) WHERE effective_to IS NULL;
CREATE INDEX idx_payroll_runs_tenant ON payroll_runs(tenant_id);
CREATE UNIQUE INDEX idx_payroll_runs_period ON payroll_runs(tenant_id, period_month, period_year);
CREATE INDEX idx_payroll_runs_tenant_status ON payroll_runs(tenant_id, status);
CREATE INDEX idx_payroll_entries_run ON payroll_entries(tenant_id, payroll_run_id);
CREATE UNIQUE INDEX idx_payroll_entries_unique ON payroll_entries(tenant_id, payroll_run_id, staff_profile_id);
CREATE INDEX idx_payroll_entries_staff ON payroll_entries(tenant_id, staff_profile_id);
CREATE UNIQUE INDEX idx_payslips_number ON payslips(tenant_id, payslip_number);
CREATE INDEX idx_payslips_entry ON payslips(payroll_entry_id);
```

---

## FUNCTIONAL REQUIREMENTS

### 4.12 Payroll

**4.12.1 Staff Compensation Configuration**

- Principal defines compensation packages per staff member via a dedicated compensation management screen
- Two types: **salaried** (monthly base salary + bonus day multiplier) and **per-class** (per-class rate + assigned class count + bonus class rate)
- Compensation records have an effective date; updating creates a new record and auto-closes the previous one
- Rates table shows all staff with their current compensation type, rate/salary, bonus configuration, and effective date
- Bulk import supported via CSV (import type: `staff_compensation`)
- **Acceptance**: compensation records created with correct validation per type, only one active record per staff at a time

**4.12.2 Create Payroll Run**

- Principal creates a new payroll run for a calendar month
- System enforces one run per month per tenant (duplicate blocked)
- Principal enters: period label (e.g., "March 2026") and total working days for the month (school-wide)
- On creation, system auto-populates entries for all active staff with active compensation records
- Each entry snapshots the staff member's current rates from `staff_compensation`
- Run created in `draft` status
- **Acceptance**: run created with all active staff pre-populated, rates snapshotted, duplicate month blocked

**4.12.3 Edit Draft Payroll Run — Salaried Staff**

- For each salaried staff entry, principal enters `days_worked`
- System calculates in real-time: `daily_rate`, `basic_pay`, `bonus_pay`, `total_pay` using the salaried formula
- If `days_worked` ≤ `total_working_days`: pro-rata basic pay, no bonus
- If `days_worked` > `total_working_days`: full base salary as basic pay + bonus at `daily_rate × bonus_day_multiplier × extra_days`
- Principal can add optional notes per entry
- **Acceptance**: calculations update live as values are entered, formulas applied correctly

**4.12.4 Edit Draft Payroll Run — Per-Class Staff**

- If `tenant_settings.payroll.autoPopulateClassCounts = true`: `classes_taught` is pre-populated from the scheduling module (count of scheduled class sessions for this teacher in the payroll month). Original auto-populated value preserved in `auto_populated_class_count` for audit.
- Principal can override `classes_taught` to reflect actual classes delivered
- **Session generation batch job**: Before counting `classes_taught` for per-class staff, enqueue BullMQ job to trigger batch session generation for all past/current dates in the payroll month. Batch skips closure dates, uses `INSERT ... ON CONFLICT DO NOTHING` idempotency. Frontend polls `GET /api/v1/payroll/runs/{run_id}/session-generation-status` every 10s, max 120s (12 attempts). Response: `{ status: 'running' | 'completed' | 'failed', updated_entry_count: number, started_at: ISO8601 }`. Backend job has 5-minute hard timeout.
- System calculates in real-time using the per-class formula
- If `classes_taught` ≤ `assigned_class_count`: basic pay only (paid for actual classes)
- If `classes_taught` > `assigned_class_count`: basic pay for assigned count + bonus pay for extra classes at `bonus_class_rate`
- No minimum guarantee — per-class staff are paid only for classes taught
- **Acceptance**: auto-population works from schedule data, override preserved, calculations correct

**4.12.5 Payroll Run Summary Review**

- Before finalising, principal sees a summary screen showing all staff in the run
- Columns: Staff Name | Type (Salaried/Per-Class) | Basic Pay | Bonus Pay | Total Pay
- Footer row with: Total Headcount | Total Basic Pay | Total Bonus Pay | Grand Total Pay
- Sortable by any column, filterable by compensation type
- This is the "confirm before finalise" screen
- **Summary query note**: Summary screen loaded via single query joining `payroll_entries` → `staff_profiles` → `users`. NOT implemented as N individual preview endpoint calls.
- **Acceptance**: summary matches individual entry calculations, totals correct

**4.12.6 Payroll Run Finalisation**

- If actor holds `school_owner` role: finalise directly (no approval required)
- If actor does NOT hold `school_owner` role and `tenant_settings.payroll.requireApprovalForNonPrincipal = true`: approval request created with `action_type = 'payroll.finalise'`, routed to a user with `school_owner` role. Run status → `pending_approval`. On approval → finalised. On rejection → returns to `draft`.
- On finalisation: all entries frozen (snapshot immutability), run totals computed, payslips auto-generated for all entries, audit log entry created
- **Finalisation blocking rule**: All entries must have `days_worked` (salaried) or `classes_taught` (per-class) filled before finalisation. Error: `PAYROLL_INCOMPLETE_ENTRIES`.
- **Once finalised, a payroll run and all its entries and payslips are immutable. No recalculation, no editing.**
- **Acceptance**: principal can finalise directly, non-principal requires approval, immutability enforced

**4.12.7 Payslip Generation**

- Payslips are auto-generated on payroll finalisation for all entries in the run
- Each payslip captures a complete `snapshot_payload_json` containing all data needed for rendering (staff details, period, rates, inputs, calculations, school branding)
- Payslip numbers generated via `tenant_sequences` with `SELECT ... FOR UPDATE` locking
- Locale-specific templates: English and Arabic (same pattern as report cards and invoices)
- **Individual payslip PDF**: Rendered on demand via Puppeteer from `snapshot_payload_json`. Streamed to client, not stored.
- **Mass payslip PDF**: Single consolidated PDF with all payslips in the run, one per page with page breaks. Rendered via Puppeteer as a background BullMQ job (payload includes `tenant_id` and `payroll_run_id`). Streamed on completion.
- **Acceptance**: payslips generated with correct numbers, rendering produces valid PDFs, mass export works for 60+ staff

**4.12.8 Individual Staff Payment History**

- Clicking into a staff member from the payroll dashboard shows a table of all their payroll entries across all finalised runs
- Columns: Month | Period Label | Basic Pay | Bonus Pay | Total Pay | Payslip (print button)
- Each row's print button renders the payslip PDF for that month on demand
- No mass print from this view — individual month printing only
- **Acceptance**: history shows all months, payslip links work, data from immutable snapshots

**4.12.9 Mid-Month Rate Change Handling**

- Rate changes to `staff_compensation` take effect on the current payroll run (not deferred to next month)
- If a draft payroll run exists for the current month: the principal must manually refresh entries to pick up new rates (explicit action, not automatic) or the new rates apply when the run is created
- If a payroll run is already finalised: the old rates are preserved in the snapshot. The new rates will appear in the next month's run.
- **Acceptance**: rate changes reflected in current draft run on refresh, finalised runs untouched

**4.12.10 Payroll Run Cancellation**

- Draft runs can be cancelled (status → `cancelled`)
- Cancelled runs free up the month for a new run
- Finalised runs cannot be cancelled
- **Acceptance**: cancellation allowed only in draft, month freed for re-creation

---

## REPORTS & ANALYTICS

From Section 4.19:

**4.19.11 Monthly Payroll Summary Report**

- For a given payroll run: every staff member with Staff Name | Type | Basic Pay | Bonus Pay | Total Pay
- Footer with grand totals
- Exportable to CSV and PDF
- **Acceptance**: matches payroll run data, totals correct

**4.19.12 Payroll Cost Trend (Interactive)**

- Interactive line chart with area fill plotting total payroll cost month-over-month across the academic year
- Hover on any data point shows: month, total basic pay, total bonus pay, total pay, headcount
- Click on data point drills into that month's summary table
- Optional toggle to overlay basic pay vs bonus pay as stacked areas
- Built with Recharts in the frontend
- **Acceptance**: chart reflects all finalised payroll runs, interactivity works, drill-through navigates correctly

**4.19.13 Individual Staff Payment History Report**

- For a selected staff member: table of every finalised month's payment
- Columns: Month | Basic Pay | Bonus Pay | Total Pay | Payslip (print)
- **Acceptance**: complete history from immutable snapshots, payslip links functional

**4.19.14 Year-to-Date Staff Cost Summary**

- Aggregated view showing each staff member's total earnings for the academic year so far
- Columns: Staff Name | Type | YTD Basic | YTD Bonus | YTD Total
- Sortable, exportable to CSV and PDF
- **Acceptance**: aggregation correct across all finalised runs in the academic year

**4.19.15 Bonus Analysis Report**

- Shows which staff earned bonuses, frequency, and total bonus amount per person
- Columns: Staff Name | Type | Months with Bonus | Total Bonus Amount | Average Bonus per Month
- Helps principal spot patterns (e.g., teacher consistently exceeding class allocation)
- **Acceptance**: bonus data accurate, aggregated from immutable snapshots

---

## DASHBOARDS

**Principal Payroll Dashboard** (from Section 4.20.6):

- Current/latest payroll run status (draft in progress, or last finalised)
- Quick stats: total payroll cost this month, headcount, total bonus paid
- Payroll cost trend mini-chart (last 6 months)
- Staff with missing payroll inputs (salaried without days_worked, per-class without classes_taught)
- Quick action: "Start New Payroll Run" or "Continue Draft"
- Quick action: "Export All Payslips" (for last finalised run)
- Link to individual staff payment histories

---

## EDGE CASES

### 5.8 Payroll

| Edge Case                                     | Handling                                                                                                                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate payroll run for same month          | Blocked by unique constraint on (tenant_id, period_month, period_year)                                                                                            |
| Staff added after payroll run created         | Principal manually refreshes entries in draft run to pick up new staff. Finalised runs are immutable.                                                             |
| Staff terminated mid-month                    | Entry remains in draft run; principal enters actual days/classes worked before termination. If staff compensation record is closed, snapshot preserves the rates. |
| Rate change during draft payroll run          | Principal can refresh entries to pick up new rates. Snapshotted rates update only while run is in draft.                                                          |
| Rate change after payroll finalisation        | No effect on finalised run. Snapshot is immutable. New rates appear in next month's run.                                                                          |
| Per-class teacher with no schedule data       | `auto_populated_class_count` is 0; principal manually enters `classes_taught`                                                                                     |
| Division by zero (total_working_days = 0)     | Blocked at API validation: `total_working_days` must be ≥ 1                                                                                                       |
| Non-principal user attempts finalisation      | If `requireApprovalForNonPrincipal = true`: routed to approval workflow. If user lacks `payroll.finalise_run` permission: blocked.                                |
| Concurrent payslip number generation          | Row-level `SELECT ... FOR UPDATE` lock on `tenant_sequences` (same pattern as receipts/invoices)                                                                  |
| Mass payslip export timeout (large staff)     | BullMQ background job with progress tracking. Timeout set to 5 minutes. If Puppeteer fails, retry once, then surface error to principal.                          |
| Cancelled draft run                           | Month freed for new run creation. Cancelled run data preserved but hidden from reports.                                                                           |
| Payroll run exists but no entries have inputs | Finalisation blocked: all entries must have `days_worked` (salaried) or `classes_taught` (per-class) filled in before finalisation is allowed                     |
| Bank details missing on staff                 | Not blocking for payroll. Payslip renders with "N/A" for bank fields. Warning shown on compensation management screen.                                            |
| Compliance erasure on payroll data            | Staff identifier anonymised in payslips and entries. Financial records retained. Same pattern as finance module.                                                  |

**Additional edge case details**:

- **Duplicate month blocked**: Unique constraint prevents two active runs for the same month. Cancelled runs excluded from the constraint so the month can be re-used.
- **Staff added after run created**: Principal manually refreshes entries in draft run to pick up new staff. Refresh re-snapshots rates from current `staff_compensation` records.
- **Staff terminated mid-month**: Entry preserved in draft run; principal enters actual days/classes worked before termination. If compensation record is closed, snapshot preserves the rates.
- **Rate change during draft**: Refresh picks up new rates from `staff_compensation`. Snapshotted rates update only while run is in draft status.
- **Division by zero blocked**: `total_working_days` must be >= 1. API validation rejects 0.
- **Bank details missing**: Not blocking for payroll. Payslip renders with "N/A" for bank fields. Warning shown on compensation management screen.

---

## INTEGRATION CONTRACTS

### Puppeteer (for payslips — individual and mass-export)

### 6.6 Puppeteer

| Aspect                        | Detail                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| **Inputs**                    | Template key, locale, render payload, branding, font assets                                       |
| **Outputs**                   | PDF byte stream                                                                                   |
| **Templates**                 | Report cards, transcripts, receipts, invoices, payslips (individual and mass-export consolidated) |
| **Failure: missing template** | Block render, return specific error                                                               |
| **Failure: font/CSS failure** | Block render, return specific error                                                               |
| **Failure: Chromium timeout** | Retry once, then return "temporarily unavailable"                                                 |
| **No storage**                | PDF is streamed to client, never persisted                                                        |

---

## DELIVERABLES

### Phase 6b: Payroll

**Duration estimate**: 3 weeks
**Dependencies**: Phase 2 (staff_profiles, scheduling), Phase 1 (RBAC, approval workflows), Phase 6 (finance patterns — Puppeteer templates, sequence generation, approval integration)

**Deliverables**:

- `staff_compensation` — full CRUD with compensation type validation
- Staff bank detail management (encrypted storage, restricted view)
- Compensation bulk import via CSV
- Extended `staff_profiles` columns (department, employment_type, bank details)
- `payroll_runs` — full CRUD with status lifecycle
- `payroll_entries` — auto-population from active staff, rate snapshotting
- Auto-population of per-class teacher class counts from scheduling module
- Salaried calculation engine (pro-rata + bonus day multiplier)
- Per-class calculation engine (assigned count + bonus class rate)
- Real-time calculation preview during draft editing
- Payroll run summary review screen
- Finalisation workflow: direct for school_owner, approval-gated for non-principal
- `payslips` — generation on finalisation, payslip number sequence
- Payslip `snapshot_payload_json` generation
- Locale-specific payslip templates (English + Arabic)
- Puppeteer rendering for individual payslips
- Puppeteer mass-export consolidated PDF (BullMQ background job)
- Individual staff payment history view
- Monthly payroll summary report
- Payroll cost trend interactive chart (Recharts)
- Year-to-date staff cost summary report
- Bonus analysis report
- Principal payroll dashboard
- Payroll module toggle in `tenant_modules`
- Payroll permissions seeding for system roles
- Snapshot testing for payslip PDF rendering in CI
- Audit logging for all payroll operations (compensation changes, run finalisation, bank detail access)
