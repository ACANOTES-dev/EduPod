# Payroll Module Redesign — Handover Document

## Purpose

Payroll run workflow redesign, compensation history tracking, per-class teacher tracking table, and bug fixes.

---

## Current Architecture

### Frontend (`apps/web/src/app/[locale]/(school)/payroll/`)

| Route | Purpose |
|-------|---------|
| `/payroll` | Dashboard + payroll runs list |
| `/payroll/compensation` | Staff compensation records (salaried + per-class) |
| `/payroll/runs/[id]` | Payroll run detail |

### Backend (`apps/api/src/modules/payroll/`)

Services for compensation management, payroll run creation, finalisation, payslip generation.

---

## Changes Required

### 1. Dashboard Cards

Replace "Total Pay This Month" with three cards:

| Position | Label | Calculation |
|----------|-------|-------------|
| 1 | **Total Base Pay** | Sum of all base/standard pay for the current run |
| 2 | **Total Bonus Pay** | Sum of all bonus pay for the current run |
| 3 | **Total Pay** | Base + Bonus |
| 4 | **Headcount** | Keep as-is |

Keep "Current Run" info as-is.

### 2. Staff Compensation — Fixes

#### Staff dropdown blank
The staff member dropdown shows blank rows (same CSS/theme bug as the scheduling module's teacher dropdowns). Fix the text colour/rendering.

#### Remove "Assigned Classes" from per-class compensation
The per-class compensation record currently asks for assigned classes. Remove this — class assignments are not constant month to month. Per-class compensation should only store:
- Per class rate
- Bonus class rate
- Effective from / to

#### Add back button
The compensation detail page has no back navigation. Add a back button/link to return to the compensation list.

#### Compensation History / Revision Log
When a compensation record is edited (e.g., base salary changes from 2500 to 3000), the system must keep a log of the change.

**Implementation options:**
- **Option A**: Append-only records — never edit a compensation record, instead create a new one with a new `effective_from` and set `effective_to` on the old one. The history IS the list of records sorted by date.
- **Option B**: Add a `compensation_revisions` table that logs each change with old value, new value, changed_by, changed_at.

**Recommendation**: Option A is simpler and already partially supported by the `effective_from` / `effective_to` fields. When editing, close the current record (set `effective_to` = today) and create a new one (set `effective_from` = today). The compensation detail page shows the full timeline.

### 3. Payroll Run — Salaried Employees

#### Remove "total working days" from run creation
Currently the payroll run creation prompts for total working days. Remove this field from the creation step.

#### Add master "Total Working Days" input on the salaried view
Inside the payroll run detail, when filtered to salaried employees, show a master input box at the top: "Total Working Days This Month". When confirmed, it populates the prescribed days for ALL salaried staff in that run.

#### Columns for salaried employees

| Column | Source |
|--------|--------|
| Staff Name | From staff profile |
| Prescribed Days | From master input (e.g., 22) |
| Actual Days Worked | Manual input per employee |
| Base Pay | From compensation record (monthly salary) |
| Bonus Days | MAX(0, Actual Days − Prescribed Days) |
| Bonus Pay | Bonus Days × (Base Salary / Prescribed Days) × Bonus Multiplier |
| Total Pay | Base Pay + Bonus Pay |
| Override | Optional override of Total Pay (requires note) |

### 4. Payroll Run — Per-Class Employees

#### Filter by staff type
The payroll run detail must have a filter/tabs: **Salaried** | **Per Class**. Do not show both types mixed in one list.

#### Auto-populate classes
Two auto-populated columns:

| Column | Source |
|--------|--------|
| Assigned Classes | From teacher's timetable/schedule for that month |
| Actual Classes Taught | From a NEW tracking table (see §5) |

#### Calculation

| Column | Calculation |
|--------|------------|
| Base Class Pay | MIN(Actual, Assigned) × Per Class Rate |
| Bonus Classes | MAX(0, Actual − Assigned) |
| Bonus Pay | Bonus Classes × Bonus Class Rate |
| Total Pay | Base Class Pay + Bonus Pay |
| Override | Optional override (requires note) |

### 5. NEW: Per-Class Teacher Tracking Table

A new page/table where the school tracks how many classes each per-class teacher actually taught.

**Structure:**
- Teacher (dropdown of per-class staff)
- Date
- Number of classes taught that day
- Notes (optional)

This feeds into the payroll run's "Actual Classes Taught" column. The payroll run sums all entries for that teacher within the payroll period.

**Location**: Could be a tab within payroll, or within the scheduling section. Recommend putting it under payroll since it's a payroll input.

**Alternative**: If the attendance/scheduling system already tracks which sessions a teacher conducted, this table may not be needed — the system could derive actual classes from attendance sessions where the teacher was the marker. Investigate before building a manual tracking table.

### 6. Override Total Pay

For BOTH salaried and per-class employees, the principal can override the computed total pay.

**When overridden:**
- The override amount is stored separately from the computed amount
- A mandatory note explaining the override is required
- The payroll run shows both: computed amount (strikethrough) and override amount
- Audit trail: who overrode, when, original value, override value, reason

### 7. Finalisation Flow

**Current flow is mostly good.** Keep the confirmation modal showing period, headcount, total base pay, total bonus pay.

**Changes:**
- Both salaried and per-class sections must be saved before the "Finalise" button is enabled
- Once finalised, the payroll run is immutable — cannot be amended
- If changes are needed, the entire run must be deleted and recreated
- The confirmation modal must clearly state: "Once finalised, this payroll run cannot be amended. Any changes will require deletion and recreation."

---

## Bugs to Fix

### Bug 1: Finalise — "Validation failed"
**Location**: Payroll run detail → Finalise button
**Issue**: Clicking finalise triggers a validation error. Investigate the API endpoint and what validation is failing.

### Bug 2: New payroll run — "Payroll run with ID not found"
**Location**: Payroll dashboard → create new run
**Issue**: After creation, navigating to the new run returns a 404. The run may be created but the redirect uses a wrong ID, or the creation itself fails silently.

### Bug 3: Staff member dropdown blank
**Location**: Compensation → Add/Edit compensation → Staff dropdown
**Issue**: Same CSS/theme bug as scheduling module — dropdown rows render but text is invisible.

---

## Key Files to Reference

| Purpose | Path |
|---------|------|
| Payroll frontend | `apps/web/src/app/[locale]/(school)/payroll/` |
| Payroll backend | `apps/api/src/modules/payroll/` |
| Compensation service | `apps/api/src/modules/payroll/compensation.service.ts` |
| Payroll run service | `apps/api/src/modules/payroll/` |
| Calculation service | `apps/api/src/modules/payroll/calculation.service.ts` |
| Staff profiles | `apps/api/src/modules/staff/` |
| Schedule/timetable data | `apps/api/src/modules/scheduling/` |
| Prisma schema | `packages/prisma/schema.prisma` |

---

## Implementation Order

```
Phase A: Bug fixes
  - Fix staff dropdown blank text
  - Fix finalise validation error
  - Fix new payroll run 404
  - Add back button to compensation detail
  - Remove "assigned classes" from per-class compensation

Phase B: Compensation history
  - Implement revision tracking (close old record, create new one with new effective_from)
  - Show compensation timeline on detail page

Phase C: Payroll run redesign
  - Add salaried/per-class filter tabs
  - Remove working days from run creation
  - Add master "Total Working Days" input for salaried section
  - Implement column structure for salaried (prescribed, actual, base, bonus, total)
  - Implement column structure for per-class (assigned, actual, base, bonus, total)
  - Add override with mandatory note for both types

Phase D: Per-class tracking
  - Investigate if actual classes can be derived from existing schedule/attendance data
  - If not, build manual tracking table
  - Wire auto-populate into payroll run

Phase E: Dashboard
  - Replace summary cards (Total Base Pay, Total Bonus Pay, Total Pay, Headcount)

Phase F: Finalisation
  - Require both sections saved before finalise enabled
  - Update confirmation modal text
```
