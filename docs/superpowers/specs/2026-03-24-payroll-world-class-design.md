# Payroll World-Class Enhancement — Design Spec

## Overview

24 features transforming payroll from "manual gross calculator" to an automated, record-driven payroll operations platform. EduPod is the source of truth for gross pay and the bridge to the school's accounting team. NO tax calculations, NO net pay — that's the accountant's job.

**Vision:** By the time a payroll run is created, all the numbers are already there from daily attendance and class delivery records. Principal reviews and finalises. Zero manual data entry at payroll time.

**Golden Rule:** Everything configurable by the tenant.

---

## FOUNDATION: Staff Attendance & Class Delivery

### P1. Staff Attendance Tracker

**Purpose:** Daily attendance register for staff — the source of truth for "days worked."

**Data Model:**
- `staff_attendance_records` — tenant_id, staff_profile_id, date (date), status ('present' | 'absent' | 'half_day' | 'unpaid_leave' | 'paid_leave' | 'sick_leave'), marked_by_user_id, notes (text, nullable), created_at, updated_at
  - Unique on (tenant_id, staff_profile_id, date)
  - Index: idx_staff_attendance_tenant_date on (tenant_id, date)
  - Index: idx_staff_attendance_tenant_staff on (tenant_id, staff_profile_id)

**Behavior:**
- Admin/principal opens daily staff attendance page → list of all active staff
- Mark each as present/absent/half-day/leave type
- Bulk mark: "Mark All Present" then edit exceptions (same pattern as student attendance default-present)
- Monthly summary view: calendar grid per staff showing attendance pattern
- Auto-calculate: days_worked = present + half_day×0.5 for a date range

**UI:**
- New top-level page: /payroll/staff-attendance
- Daily view: date picker + staff list with status toggle buttons
- Monthly view: calendar heatmap per staff (green=present, red=absent, yellow=half-day)
- Bulk actions: Mark All Present, Mark All Absent

---

### P2. Class Delivery Tracker

**Purpose:** Track prescribed vs actual classes taught per teacher per month.

**Data Model:**
- `class_delivery_records` — tenant_id, staff_profile_id, schedule_id, delivery_date (date), status ('delivered' | 'absent_covered' | 'absent_uncovered' | 'cancelled'), substitute_staff_id (nullable), notes (text, nullable), confirmed_by_user_id (nullable), created_at, updated_at
  - Unique on (tenant_id, staff_profile_id, schedule_id, delivery_date)
  - Index: idx_class_delivery_tenant_staff_date on (tenant_id, staff_profile_id, delivery_date)

**Behavior:**
- System auto-populates from schedule: for each teaching day, creates "pending" delivery records for each teacher's scheduled classes
- HOD/admin confirms: delivered, absent (covered by sub), absent (uncovered), cancelled
- Monthly summary: prescribed count (from schedule) vs delivered count vs missed
- Feeds directly into payroll: classes_taught = delivered count

**Integration with scheduling:**
- Pulls scheduled classes from Schedule table for the month
- If substitution system is active, auto-marks "absent_covered" when a substitute is assigned

**UI:**
- /payroll/class-delivery
- Weekly/monthly view per teacher
- Table: date, period, subject, class, status (with dropdown to change)
- Summary cards: prescribed, delivered, absent, cancelled
- Filter by teacher, department, date range

---

## CORE GROSS PAY ENGINE

### P3. Fix Known Bugs

- Finalise validation error
- New run 404 (incorrect redirect ID)
- Staff dropdown blank text (CSS issue)

### P4. Multi-Period Corrections

**Data Model:**
- `payroll_adjustments` — tenant_id, payroll_run_id, payroll_entry_id, adjustment_type ('underpayment' | 'overpayment' | 'bonus' | 'reimbursement' | 'other'), amount (decimal 12,2), description (text), reference_period (varchar — e.g., "January 2024"), created_by_user_id, created_at
  - Index: idx_payroll_adjustments_entry on (tenant_id, payroll_entry_id)

**Behavior:**
- When creating/editing a payroll entry, admin can add adjustment line items
- Each adjustment: type, amount (+/-), description, which period it relates to
- Adjustments added to gross total
- Visible on payslip as separate line items
- Audit trail: who added, when, why

### P5. YTD Tracking

**No new tables** — computed from PayrollEntry across runs in the fiscal year.

**Behavior:**
- For each payslip: calculate cumulative gross basic, gross bonus, allowances, adjustments from all finalised runs in the same fiscal year
- Display on payslip: "Year-to-Date" section
- Fiscal year start: tenant's `academic_year_start_month` setting

---

## ACCOUNTANT EXPORT (The Bridge)

### P6. Configurable Export Templates

**Data Model:**
- `payroll_export_templates` — tenant_id, name, columns_json (JSON array of {field, header, format?}), file_format ('csv' | 'xlsx'), created_by_user_id, created_at, updated_at
  - Available fields: staff_name, staff_number, department, compensation_type, days_worked, classes_taught, gross_basic, gross_bonus, allowances_total, adjustments_total, gross_total, period, notes
  - Unique on (tenant_id, name)

**Behavior:**
- Tenant creates export templates matching their accountant's requirements
- Presets: "Generic CSV", "Sage Import", "BrightPay Import"
- When exporting a payroll run, select template → generates file with configured columns/format
- Template preview with sample data

### P7. Export History

**Data Model:**
- `payroll_export_logs` — tenant_id, payroll_run_id, export_template_id, exported_by_user_id, exported_at, file_name, row_count, created_at
  - Index: idx_payroll_export_logs_run on (tenant_id, payroll_run_id)

**Behavior:**
- Every export logged: who, when, which run, which template, row count
- Prevents duplicate sends: "January's data was already exported on the 26th by Sarah"
- Accessible from run detail page

### P8. Email Export to Accountant

**Behavior:**
- Tenant configures accountant email in settings: `payrollAccountantEmail`
- On payroll run detail: "Send to Accountant" button
- Generates export using default template, attaches to email, sends
- Logged in export history
- Confirmation: "Sent January 2024 payroll to accounts@school.ie"

---

## OPERATIONAL WORKFLOW

### P9. Payroll Calendar

**No new tables** — uses tenant settings.

**Tenant Settings:**
- `payDay` — number (1-28, day of month)
- `payrollPreparationLeadDays` — number (default: 5)

**Behavior:**
- Dashboard shows: "Next pay date: March 25th (3 days away)"
- Auto-reminder notification to admin when preparation should start (payDay - leadDays)
- Calendar view showing pay dates for the year

### P10. Auto-Create Monthly Runs

**Behavior:**
- Worker job: `payroll:auto-create-run` runs on configurable day (e.g., 1st of month)
- Creates draft run for current month, auto-populates from staff attendance + class delivery data
- Admin notification: "March 2024 payroll draft created with 45 staff entries"
- All numbers pre-filled from P1 (attendance) and P2 (class delivery)

**Tenant Settings:**
- `autoCreatePayrollRun` — boolean (default: false)
- `autoCreateRunDay` — number (1-28, default: 1)

### P11. Payroll Approval Chain

**Data Model:**
- Reuses existing ApprovalRequest system
- `payroll_approval_configs` — tenant_id, steps_json (JSON array of {order, role_key, label}), is_active (boolean), created_at, updated_at

**Behavior:**
- Configurable multi-step: HR prepares → Finance reviews → Principal approves
- Same pattern as report card approval workflow
- Presets: "Direct" (no approval), "Two-Step" (preparer → principal), "Three-Step" (HR → finance → principal)

### P12. Incomplete Entry Alerts

**Behavior:**
- Dashboard widget: "5 staff missing attendance data for March"
- Notification to department heads: "Please submit March attendance for your team by March 20th"
- Configurable deadline (X days before pay date)
- Blocks finalisation if incomplete entries remain

---

## ALLOWANCES & ADDITIONS

### P13. Configurable Allowance Types

**Data Model:**
- `payroll_allowance_types` — tenant_id, name, name_ar (nullable), is_recurring (boolean), default_amount (decimal 12,2, nullable), active (boolean), created_at, updated_at
  - Unique on (tenant_id, name)
- `staff_allowances` — tenant_id, staff_profile_id, allowance_type_id, amount (decimal 12,2), effective_from (date), effective_to (date, nullable), created_at, updated_at
  - Index: idx_staff_allowances_tenant_staff on (tenant_id, staff_profile_id)

**Behavior:**
- Tenant defines allowance types: Housing, Transport, Phone, Meal, etc.
- Assign allowances to individual staff with amounts and effective dates
- Auto-included in payroll entries as separate line items
- Visible on payslip under "Allowances" section
- Included in gross total and accountant export

### P14. One-Off Additions

**Data Model:**
- `payroll_one_off_items` — tenant_id, payroll_entry_id, description (text), amount (decimal 12,2), item_type ('bonus' | 'reimbursement' | 'other'), created_by_user_id, created_at
  - Index: idx_payroll_one_off_entry on (tenant_id, payroll_entry_id)

**Behavior:**
- Admin adds ad-hoc items to a specific payroll entry: bonuses, reimbursements, special payments
- Each has description and amount
- Added to gross total
- Visible on payslip as separate line items

### P15. Recurring Deductions (Non-Tax)

**Data Model:**
- `staff_recurring_deductions` — tenant_id, staff_profile_id, description (text), total_amount (decimal 12,2), monthly_amount (decimal 12,2), remaining_amount (decimal 12,2), start_date (date), months_remaining (int), active (boolean), created_by_user_id, created_at, updated_at
  - Index: idx_staff_deductions_tenant_staff on (tenant_id, staff_profile_id)

**Behavior:**
- Admin creates: "Salary advance of £1,000, deducted £200/month for 5 months"
- Auto-applied each payroll run: deduction line on payslip, remaining balance decremented
- When fully repaid: marked inactive
- Visible on payslip under "Deductions" section
- Reduces gross total (accountant sees the deduction in the export)

---

## LEAVE INTEGRATION

### P16. Leave-to-Payroll Sync

**No new tables** — reads from staff_attendance_records (P1).

**Behavior:**
- Staff attendance records include leave types: unpaid_leave, paid_leave, sick_leave
- Payroll auto-calculates:
  - days_worked = working_days - unpaid_leave_days - absent_days
  - half_days count as 0.5
  - paid_leave and sick_leave do NOT reduce days_worked (still paid)
- Admin can override if needed

---

## SMART FEATURES

### P17. AI Payroll Anomaly Detection

**Behavior:**
- Before finalisation, AI scans all entries and flags:
  - Pay significantly different from previous month (>20% change)
  - Per-class staff with 0 classes taught
  - Days worked exceeding total working days without explanation
  - Duplicate staff entries
  - Staff with no compensation record
- Flags shown as warnings on run detail page (does not block finalisation)
- "3 anomalies detected — review before finalising"

### P18. Month-Over-Month Comparison

**No new tables** — computed from current and previous PayrollRun.

**UI:**
- Run detail page: "Compare to Previous" button
- Side-by-side table: staff name, last month gross, this month gross, difference, reason
- Highlights: new staff (green), departed (red), changed amounts (yellow)

### P19. Staff Cost Forecasting

**Behavior:**
- Based on current compensation + allowances, project monthly payroll cost for next 6-12 months
- Factor in: known departures (effective_to dates), planned hires (if entered)
- Recharts line chart: projected cost trend
- "Your projected monthly payroll cost is £45,000 for Q2 2024"

---

## PAYSLIP ENHANCEMENTS

### P20. Enhanced Payslip Layout

**Behavior:**
- Payslip now shows:
  - Gross Basic Pay
  - Gross Bonus Pay
  - Allowances (itemised: Housing £500, Transport £200)
  - One-off additions (itemised)
  - Recurring deductions (itemised: Salary Advance -£200)
  - Adjustments (itemised with reference period)
  - **Gross Total**
  - YTD Totals
  - *Note: "Net pay calculated by your accounting department"*
- Clean, professional layout
- Bilingual (en/ar)

### P21. Digital Payslip Delivery

**Behavior:**
- On finalisation, email payslip PDF to each staff member
- Staff receives: "Your March 2024 payslip is ready"
- Configurable: auto-send on finalise (tenant setting) or manual "Send All Payslips" button

**Tenant Settings:**
- `autoSendPayslips` — boolean (default: false)
- `payslipDeliveryMethod` — 'email' | 'in_app' | 'both' (default: 'email')

### P22. Staff Payslip Portal

**Behavior:**
- Staff logs in → "My Payslips" section
- List of all payslips across months with download buttons
- YTD summary card at top
- Allowance and deduction history

**UI:**
- /payroll/my-payslips (for staff)
- Table: month, gross basic, bonus, allowances, deductions, gross total, PDF download

---

## REPORTING

### P23. Payroll Cost Dashboard (Enhanced)

**Metrics:**
- Monthly cost trend (Recharts area chart — basic, bonus, allowances stacked)
- Cost by department (bar chart)
- Cost per student (total payroll ÷ enrolled students)
- Budget vs actual (if budget entered)
- Headcount trend
- Average compensation by role/department

### P24. Variance Report

**Behavior:**
- Auto-generated summary: what changed between this run and last
- New joiners, leavers, compensation changes, allowance changes
- Total impact: "+£2,300 vs last month (2 new staff, 1 departure, 3 allowance adjustments)"
- Exportable PDF for management

---

## New Database Tables Summary

| Table | Purpose |
|---|---|
| `staff_attendance_records` | Daily staff attendance (present/absent/leave) |
| `class_delivery_records` | Prescribed vs actual classes delivered |
| `payroll_adjustments` | Multi-period corrections and adjustments |
| `payroll_export_templates` | Configurable export column layouts |
| `payroll_export_logs` | Export history tracking |
| `payroll_approval_configs` | Multi-step approval workflow |
| `payroll_allowance_types` | Tenant-defined allowance categories |
| `staff_allowances` | Per-staff allowance assignments |
| `payroll_one_off_items` | Ad-hoc bonuses/reimbursements per run |
| `staff_recurring_deductions` | Loan/advance repayment tracking |

All tables tenant-scoped with RLS.

---

## New Tenant Settings

**payroll section:**
- `payDay` — number (1-28)
- `payrollPreparationLeadDays` — number (default: 5)
- `autoCreatePayrollRun` — boolean (default: false)
- `autoCreateRunDay` — number (1-28, default: 1)
- `payrollAccountantEmail` — string (nullable)
- `autoSendPayslips` — boolean (default: false)
- `payslipDeliveryMethod` — 'email' | 'in_app' | 'both' (default: 'email')

---

## Implementation Order

1. **Foundation:** P1 (staff attendance) + P2 (class delivery) — these feed everything
2. **Core:** P3 (bug fixes) + P4 (adjustments) + P5 (YTD) + P13-P15 (allowances/additions/deductions)
3. **Export:** P6 (templates) + P7 (history) + P8 (email to accountant)
4. **Workflow:** P9 (calendar) + P10 (auto-create) + P11 (approval chain) + P12 (alerts) + P16 (leave sync)
5. **Payslips:** P20 (enhanced layout) + P21 (delivery) + P22 (portal)
6. **Smart:** P17 (anomaly) + P18 (comparison) + P19 (forecasting)
7. **Reporting:** P23 (dashboard) + P24 (variance)
