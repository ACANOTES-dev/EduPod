# Teacher Competency — Copy Wizard & Lock/Unlock

**Date:** 2026-03-26
**Status:** Approved
**Scope:** Frontend changes to the competencies page + one new backend endpoint

---

## Overview

Two enhancements to the teacher competency matrix (By Teacher tab):

1. **Copy Wizard** — Copy teacher competencies from one year group to other year groups, filtering to common subjects only.
2. **Lock/Unlock** — Gate all editing behind a lock toggle, restricted to school owner and principal roles.

---

## Feature 1: Copy Wizard

### Trigger

An inline "Copy to Other Years..." button appears next to the year group dropdown on the By Teacher tab. Only visible when a year group is selected and the matrix is unlocked.

### Flow

**Step 1 — Select Target Year Groups**

A dialog opens. It lists all year groups except the currently selected (source) year group. Each is a checkbox. Year groups that share zero common subjects with the source are disabled with a "no common subjects" label. The user selects one or more targets and clicks "Next".

**Step 2 — Select Subjects to Copy (Checkbox Grid)**

A matrix is shown:
- **Rows:** selected target year groups
- **Columns:** subjects that exist in both the source year group AND at least one target year group (determined via the `matrix-subjects` endpoint for each year group)
- **Cells:** checkbox where the subject is common between source and that specific target row; greyed-out dash (`—`) where the subject does not exist in that target's curriculum

All applicable cells default to checked. The user can uncheck individual cells to exclude specific subject+year combinations.

A footer note reads: "Merge mode: Existing teacher assignments in target years will be kept. New ones from [source] will be added."

The confirm button shows a count: "Copy N Assignments".

### Backend — New Endpoint

**`POST /api/v1/scheduling/teacher-competencies/copy-to-years`**

Request body:
```json
{
  "academic_year_id": "uuid",
  "source_year_group_id": "uuid",
  "targets": [
    { "year_group_id": "uuid", "subject_ids": ["uuid", "uuid"] },
    { "year_group_id": "uuid", "subject_ids": ["uuid"] }
  ]
}
```

Processing:
1. Validate all referenced entities exist and belong to the tenant.
2. For each target entry, fetch all competencies from the source year group for the given subject IDs.
3. For each source competency, check if an identical record (same tenant, academic year, staff_profile, subject, target year_group) already exists.
4. If it does not exist, create it (merge). If it already exists, skip it (no duplicate, no error).
5. Return `{ data: { copied: number, skipped: number } }`.

Uses `createRlsClient` with an interactive transaction. Wrapped in a single transaction for atomicity.

### Frontend — Common Subjects Resolution

To determine which subjects are common between the source and each target year group, the frontend calls the existing `matrix-subjects` endpoint for each selected target year group. This is done after the user selects targets in Step 1 and clicks Next. The intersection of source subjects ∩ target subjects determines which cells are checkboxes vs greyed-out dashes.

The source year group's subjects are already loaded (they drive the main matrix columns via `matrixSubjects` / `curriculumSubjectIds`).

---

## Feature 2: Lock/Unlock

### Behavior

- The matrix loads in **locked** state by default.
- When locked: all checkboxes are visually disabled, primary star buttons are non-interactive, the "Copy to Other Years..." button is hidden.
- A lock toggle button appears in the header area (same position/style as the curriculum matrix lock).
- Only users with `school_owner` or `school_principal` role can unlock. Others see the lock but clicking shows a toast: "Only the School Owner or School Principal can unlock this page."

### Implementation

Uses the existing `useRoleCheck` hook from `@/hooks/use-role-check`:
```
const UNLOCK_ROLES = ['school_owner', 'school_principal'];
const { hasAnyRole } = useRoleCheck();
const canUnlock = hasAnyRole('school_owner', 'school_principal');
```

Lock state is client-side boolean: `const [isLocked, setIsLocked] = React.useState(true)`.

When locked, the table container gets `opacity-60 pointer-events-none select-none` (matching curriculum matrix pattern). The lock button toggles between locked/unlocked icons with label text.

### Save Behavior

Immediate save per click (current behavior). The lock is purely a UI gate — it prevents accidental edits but does not batch changes. Each checkbox toggle and primary star toggle makes an immediate API call when unlocked, same as today.

---

## Permissions

- **View competencies:** `schedule.configure_requirements` (existing, unchanged)
- **Edit competencies (unlock):** Role-based: `school_owner` or `school_principal` (frontend gate via `useRoleCheck`)
- **Copy wizard:** Same as edit — only available when unlocked

---

## What Does NOT Change

- The By Subject + Year tab — untouched
- The existing "Copy from Academic Year" feature — untouched
- The existing create/delete/patch API endpoints — untouched
- The curriculum-driven subject filtering — untouched

---

## Files Affected

**Backend (new):**
- `apps/api/src/modules/scheduling/teacher-competencies.service.ts` — add `copyToYears` method
- `apps/api/src/modules/scheduling/teacher-competencies.controller.ts` — add `POST copy-to-years` route

**Backend (schema):**
- `packages/shared/src/schemas/scheduling.schema.ts` — add `copyToYearsSchema` Zod schema

**Frontend (modified):**
- `apps/web/src/app/[locale]/(school)/scheduling/competencies/page.tsx` — add lock state, lock button, copy wizard dialog, disable controls when locked

**Translations:**
- `apps/web/messages/en.json` — add wizard and lock-related strings
- `apps/web/messages/ar.json` — Arabic equivalents
