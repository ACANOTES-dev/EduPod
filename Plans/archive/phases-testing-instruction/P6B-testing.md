# Phase 6B Testing Instructions — Payroll

---

## Section 1 — Unit Tests

### 1.1 CalculationService

**File**: `apps/api/src/modules/payroll/calculation.service.spec.ts`

#### Salaried Calculations
- **"should calculate pro-rata basic pay when days_worked < total_working_days"**
  - Input: base_salary=3000, total_working_days=22, days_worked=15, bonus_day_multiplier=1.0
  - Expected: daily_rate=136.3636, basic_pay=2045.45, bonus_pay=0, total_pay=2045.45

- **"should calculate full basic pay when days_worked = total_working_days"**
  - Input: base_salary=3000, total_working_days=22, days_worked=22
  - Expected: basic_pay=3000.00, bonus_pay=0, total_pay=3000.00

- **"should calculate bonus when days_worked > total_working_days with multiplier 1.0"**
  - Input: base_salary=3000, total_working_days=22, days_worked=25, bonus_day_multiplier=1.0
  - Expected: basic_pay=3000.00, bonus_pay=409.09, total_pay=3409.09

- **"should calculate bonus with 1.5x multiplier (time-and-a-half)"**
  - Input: base_salary=3000, total_working_days=22, days_worked=25, bonus_day_multiplier=1.5
  - Expected: basic_pay=3000.00, bonus_pay=613.64, total_pay=3613.64

- **"should return zero pay when days_worked is 0"**
  - Input: base_salary=3000, total_working_days=22, days_worked=0
  - Expected: basic_pay=0, bonus_pay=0, total_pay=0

- **"edge: should handle total_working_days = 0 gracefully"**
  - Input: base_salary=3000, total_working_days=0, days_worked=10
  - Expected: basic_pay=0, bonus_pay=0, total_pay=0 (defensive guard)

- **"should round intermediate daily_rate to 4dp and final values to 2dp"**
  - Input: base_salary=1000, total_working_days=3, days_worked=2
  - Expected: daily_rate=333.3333, basic_pay=666.67, total_pay=666.67

#### Per-Class Calculations
- **"should calculate basic pay when classes_taught <= assigned_class_count"**
  - Input: per_class_rate=50, assigned_class_count=20, classes_taught=15, bonus_class_rate=75
  - Expected: basic_pay=750.00, bonus_pay=0, total_pay=750.00

- **"should calculate full basic and bonus when classes_taught > assigned_class_count"**
  - Input: per_class_rate=50, assigned_class_count=20, classes_taught=25, bonus_class_rate=75
  - Expected: basic_pay=1000.00, bonus_pay=375.00, total_pay=1375.00

- **"should return zero when classes_taught is 0"**
  - Expected: basic_pay=0, bonus_pay=0, total_pay=0

- **"should handle bonus_class_rate = 0 (no bonus pay)"**
  - Input: per_class_rate=50, assigned_class_count=20, classes_taught=25, bonus_class_rate=0
  - Expected: basic_pay=1000.00, bonus_pay=0, total_pay=1000.00

### 1.2 CompensationService

**File**: `apps/api/src/modules/payroll/compensation.service.spec.ts`

- **"should create a salaried compensation record"** — verify correct fields saved, effective_to = null
- **"should create a per_class compensation record"** — verify per_class fields, base_salary null
- **"should auto-close previous active record when creating new one"** — create A, create B with later effective_from; A.effective_to should be B.effective_from - 1 day
- **"should reject if staff_profile_id not found"** — 404
- **"should reject salaried compensation with base_salary = null"** — validation error
- **"should reject per_class compensation with missing per_class_rate"** — validation error
- **"should reject per_class compensation with non-null base_salary"** — validation error
- **"should handle effective_date conflict"** — new effective_from <= existing effective_from

### 1.3 PayrollRunsService

**File**: `apps/api/src/modules/payroll/payroll-runs.service.spec.ts`

- **"should create a draft run and auto-populate entries"** — verify run status=draft, entries created with snapshotted rates
- **"should reject duplicate month/year run"** — 409
- **"should allow creating a run for a month that had a cancelled run"** — success
- **"should refresh entries: add new staff, update rates, remove inactive"**
- **"should finalise directly when user is school_owner"** — status=finalised, payslips generated
- **"should route to approval when non-school-owner and requireApproval enabled"** — status=pending_approval
- **"should block finalisation when entries are incomplete"** — PAYROLL_INCOMPLETE_ENTRIES
- **"should cancel a draft run"** — status=cancelled
- **"should cancel a pending_approval run and cancel linked approval request"**
- **"should block cancellation of finalised run"** — 400
- **"should block editing non-draft run"** — 400
- **"should recalculate salaried entries when total_working_days changes"**

### 1.4 PayslipsService

- **"should generate payslips for all entries in a run"** — correct payslip_numbers, snapshot payloads
- **"should generate sequential payslip numbers"** — PSL-202603-000001, PSL-202603-000002, etc.
- **"should render individual payslip PDF"** — verify PdfRenderingService called with correct template/locale/data
- **"should handle missing bank details gracefully in snapshot"** — bank fields null in payload

---

## Section 2 — Integration Tests

### 2.1 Compensation API

**File**: `apps/api/test/payroll-compensation.e2e-spec.ts`

#### Happy Path
- `POST /api/v1/payroll/compensation` with valid salaried data → 201, correct fields
- `POST /api/v1/payroll/compensation` with valid per_class data → 201, correct fields
- `GET /api/v1/payroll/compensation` → paginated list with staff names
- `GET /api/v1/payroll/compensation/:id` → single record
- `PUT /api/v1/payroll/compensation/:id` → updated record

#### Failure Paths
- `POST` without auth → 401
- `POST` without `payroll.manage_compensation` permission → 403
- `POST` with invalid staff_profile_id → 404
- `POST` salaried with null base_salary → 400
- `POST` per_class with null per_class_rate → 400
- `GET /` without `payroll.view` permission → 403

### 2.2 Payroll Runs API

**File**: `apps/api/test/payroll-runs.e2e-spec.ts`

#### Happy Path
- `POST /api/v1/payroll/runs` → 201, draft run with auto-populated entries
- `GET /api/v1/payroll/runs` → paginated list
- `GET /api/v1/payroll/runs/:id` → run with entries
- `PATCH /api/v1/payroll/runs/:id` with total_working_days change → 200, entries recalculated
- `POST /api/v1/payroll/runs/:id/refresh-entries` → 200, entries refreshed
- `POST /api/v1/payroll/runs/:id/finalise` as school_owner → 200, status=finalised
- `POST /api/v1/payroll/runs/:id/cancel` → 200, status=cancelled

#### Failure Paths
- `POST` duplicate month → 409
- `POST` with total_working_days=0 → 400
- `PATCH` on finalised run → 400
- `POST /finalise` with incomplete entries → 400 PAYROLL_INCOMPLETE_ENTRIES
- `POST /cancel` on finalised run → 400
- Without auth → 401
- Without required permission → 403

### 2.3 Payroll Entries API

**File**: `apps/api/test/payroll-entries.e2e-spec.ts`

- `PATCH /api/v1/payroll/entries/:id` with days_worked for salaried → 200, recalculated
- `PATCH /api/v1/payroll/entries/:id` with classes_taught for per_class → 200, recalculated
- `PATCH` with days_worked on per_class entry → 400 INVALID_FIELD_FOR_COMPENSATION_TYPE
- `PATCH` on finalised run's entry → 400 PAYROLL_RUN_NOT_DRAFT
- `POST /api/v1/payroll/entries/:id/calculate` → preview without persist
- Concurrent modification → 409

### 2.4 Payslips API

**File**: `apps/api/test/payroll-payslips.e2e-spec.ts`

- `GET /api/v1/payroll/payslips` → paginated list
- `GET /api/v1/payroll/payslips/:id` → single payslip with snapshot
- `GET /api/v1/payroll/payslips/:id/pdf` → PDF stream with correct Content-Type
- Without `payroll.generate_payslips` permission → 403

### 2.5 Reports API

**File**: `apps/api/test/payroll-reports.e2e-spec.ts`

- `GET /api/v1/payroll/reports/cost-trend` → array of data points from finalised runs
- `GET /api/v1/payroll/reports/ytd-summary` → per-staff aggregates
- `GET /api/v1/payroll/reports/bonus-analysis` → staff with bonuses
- `GET /api/v1/payroll/reports/monthly-summary/:runId` → entries with totals
- `GET /api/v1/payroll/reports/staff/:staffProfileId/history` → per-staff history
- Without `payroll.view_reports` permission → 403

### 2.6 Dashboard API

- `GET /api/v1/payroll/dashboard` → composite data
- Without `payroll.view` permission → 403

---

## Section 3 — RLS Leakage Tests

### For every tenant-scoped table, follow this pattern:

**File**: `apps/api/test/payroll-rls.e2e-spec.ts`

#### staff_compensation
1. Create compensation record as Tenant A
2. Query compensation list as Tenant B
3. Assert: Tenant A's record NOT in Tenant B's results

#### payroll_runs
1. Create payroll run as Tenant A
2. Query runs list as Tenant B
3. Assert: Tenant A's run NOT visible to Tenant B
4. Attempt `GET /runs/:tenantA_run_id` as Tenant B → 404

#### payroll_entries
1. Create run with entries as Tenant A
2. Query entries as Tenant B (via run detail or direct)
3. Assert: Tenant A's entries NOT visible
4. Attempt `PATCH /entries/:tenantA_entry_id` as Tenant B → 404

#### payslips
1. Finalise run as Tenant A (generates payslips)
2. Query payslips list as Tenant B
3. Assert: Tenant A's payslips NOT visible
4. Attempt `GET /payslips/:tenantA_payslip_id/pdf` as Tenant B → 404

#### Reports cross-tenant isolation
1. Create and finalise runs for both Tenant A and Tenant B
2. Query cost-trend as Tenant A → only Tenant A data
3. Query ytd-summary as Tenant B → only Tenant B data
4. Query staff history for Tenant A staff as Tenant B → empty/404

---

## Section 4 — Manual QA Checklist

### 4.1 Compensation Management
- [ ] Navigate to `/payroll/compensation`
- [ ] Click "Add Compensation" → form dialog opens
- [ ] Select a staff member → verify only active staff shown
- [ ] Select "Salaried" → verify Base Salary and Bonus Day Multiplier fields shown, per-class fields hidden
- [ ] Select "Per Class" → verify Per-Class Rate, Assigned Classes, Bonus Class Rate shown, base salary hidden
- [ ] Create salaried compensation → verify appears in table
- [ ] Create second compensation for same staff → verify first auto-closed (effective_to set)
- [ ] Verify compensation list shows correct staff names, types, rates
- [ ] Test in Arabic locale → verify RTL layout, Arabic labels

### 4.2 Create Payroll Run
- [ ] Navigate to `/payroll/runs`
- [ ] Click "New Payroll Run" → dialog opens
- [ ] Enter period label "March 2026", month 3, year 2026, total working days 22
- [ ] Submit → run created, navigate to detail page
- [ ] Verify all staff with active compensation appear as entries
- [ ] Verify snapshot rates match compensation records

### 4.3 Edit Draft Run — Salaried
- [ ] On run detail page, find a salaried staff entry
- [ ] Enter days_worked = 20 → verify basic_pay recalculates in real-time
- [ ] Enter days_worked = 25 (> total_working_days) → verify bonus_pay appears
- [ ] Add a note → verify saves
- [ ] Verify footer totals update

### 4.4 Edit Draft Run — Per-Class
- [ ] Find a per-class staff entry
- [ ] If auto-populate enabled, verify classes_taught pre-populated
- [ ] Override classes_taught → verify calculation updates
- [ ] Enter classes_taught > assigned_class_count → verify bonus_pay

### 4.5 Finalise Run
- [ ] Fill in all entries (no missing inputs)
- [ ] Click "Finalise" → confirmation dialog
- [ ] Confirm → run status changes to "Finalised"
- [ ] Verify run is now read-only (no editing)
- [ ] Verify payslips generated (check payslips list)

### 4.6 Payslip PDF
- [ ] Navigate to a finalised run's payslips
- [ ] Click print on individual payslip → PDF opens in new tab
- [ ] Verify PDF contains: school name/logo, staff details, period, compensation breakdown, totals, bank details (if present)
- [ ] Test with Arabic locale → verify RTL PDF with Arabic labels

### 4.7 Staff Payment History
- [ ] Navigate to `/payroll/staff/{id}` for a staff member with finalised entries
- [ ] Verify table shows all months
- [ ] Verify payslip print button works

### 4.8 Reports
- [ ] Navigate to `/payroll/reports`
- [ ] **Cost Trend tab**: verify chart renders with data from finalised runs, hover tooltips work
- [ ] **YTD Summary tab**: verify per-staff aggregates, export CSV works
- [ ] **Bonus Analysis tab**: verify only staff with bonuses shown

### 4.9 Dashboard
- [ ] Navigate to `/payroll`
- [ ] Verify stat cards show correct data
- [ ] Verify current run card shows correct status
- [ ] Verify incomplete entries warning (if applicable)
- [ ] Verify quick links navigate correctly

### 4.10 Edge Cases
- [ ] Try creating duplicate run for same month → blocked
- [ ] Cancel a draft run → month freed, can create new run
- [ ] Change compensation rate, refresh draft run → new rates picked up
- [ ] Attempt to finalise with missing inputs → error shown
- [ ] Verify finalised run cannot be edited or cancelled

### 4.11 Locale Testing
- [ ] Switch to Arabic locale
- [ ] Verify all payroll pages render RTL
- [ ] Verify all text labels are Arabic
- [ ] Verify numeric inputs remain LTR
- [ ] Verify payslip PDF renders in Arabic with correct fonts
