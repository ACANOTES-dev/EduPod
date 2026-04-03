# Settings — Users, Roles & Permissions — Handover Document

## Purpose

The role-based access control (RBAC) system needs to be fully configurable by the school owner through the UI. Currently the permissions list is empty when creating roles, and users can't be filtered. This is a critical gap — different schools have different policies on who can do what.

---

## Issues Identified

### 1. Users Page — Missing Filters

**Location**: `/settings/users`

**Current state**: Shows a list of users but no way to search or filter.

**Required**:

- **Name search** — text input to search by name
- **Role filter** — dropdown of roles (admin, teacher, finance_staff, etc.)
- **Status filter** — active / suspended

### 2. Roles Page — Permissions List Empty

**Location**: `/settings/roles` → Create New Role

**Current state**: The create role form has:

- Role key (text input)
- Display name (text input)
- Tier selection (admin / staff / parent)
- Permissions section that says "Only permissions at or below the selected tier are shown" — but the list is **empty** for all tiers.

**Root cause to investigate**: The permissions are likely defined in a constants file (check `packages/shared/src/constants/permissions.ts`) but the frontend is either not fetching them or the API endpoint that serves available permissions is broken/missing.

**What exists in the codebase**:

- `packages/shared/src/constants/permissions.ts` — defines all permissions with their tiers
- The `RequiresPermission` decorator on every controller method references these permission keys
- `TenantRolePermission` table in the schema links roles to permissions
- The seed data creates default roles (school_owner, school_admin, teacher, finance_staff, admissions_staff, parent) with pre-assigned permissions

### 3. Assessment Categories — 404

**Location**: `/settings/assessment-categories`

**Issue**: Page returns a 404/broken page. Either the page component doesn't exist or the route is misconfigured.

### 4. Audit Logs — Needs Explanation

The audit log tab in settings shows a log of significant actions taken in the system. It's powered by the `AuditLogInterceptor` which automatically logs mutations (POST/PATCH/DELETE) on API endpoints.

**What it captures**: Who did what, when, on which entity. For example: "Abdullah Al-Farsi updated student Ramadan Duadu at 2026-03-22 14:30".

**This is a read-only view** for the school owner to review staff activity. No changes needed to the concept — just ensure it's working and displaying data.

---

## The Big Requirement: Configurable RBAC

### User's Vision

The school owner must be able to:

1. **Create custom roles** — not just the default 5-6 roles, but custom ones like "Admin Level 1", "Admin Level 2", "Admin Level 3"
2. **Assign granular permissions** to each role — e.g., Admin Level 3 can view students but not edit, Admin Level 2 can edit but not delete, Admin Level 1 can do everything
3. **Additive permission model** — higher-level roles inherit lower-level permissions and add more on top
4. **Per-school configuration** — different schools have different policies. One school's admin might manage schedules, another school restricts that to the principal only.

### What Already Exists (Schema)

The schema already supports this. Check:

```
TenantRole {
  id, tenant_id, role_key, display_name, tier (admin/staff/parent),
  is_system (boolean — true for default roles, false for custom)
}

TenantRolePermission {
  id, tenant_id, role_id, permission_key
}

TenantMembership {
  id, tenant_id, user_id
  → roles: TenantMembershipRole[] (junction to TenantRole)
}
```

And in shared constants:

```
permissions.ts — defines all permission keys with:
  - key (e.g., 'students.view', 'students.manage', 'attendance.take')
  - tier (admin/staff/parent — which tier level can have this permission)
  - description
```

### What's Missing

1. **API endpoint to list available permissions** — the frontend needs `GET /api/v1/permissions` (or similar) that returns all permission keys grouped by module, filtered by the selected tier
2. **Frontend permissions picker** — a checkbox list grouped by module (Students, Attendance, Finance, etc.) showing each permission with its description
3. **Role creation/editing flow** — create role with display name + tier + selected permissions
4. **Potentially**: A way to "copy permissions from" an existing role when creating a new one (similar to the grading weights "copy from" feature)

### Implementation Approach

**Phase A: Fix the permissions list**

1. Check if `GET /api/v1/roles/permissions` or similar endpoint exists in the backend
2. If not, create it — return all permissions from `packages/shared/src/constants/permissions.ts`, grouped by module, filtered by tier
3. Fix the frontend role creation form to fetch and display these permissions as a checkbox list
4. Group permissions by module: Students, Staff, Attendance, Gradebook, Finance, Payroll, Admissions, Communications, Scheduling, Settings, Approvals

**Phase B: Permission picker UI**
The permissions picker should look like:

```
Students
  ☑ students.view — View student records
  ☑ students.manage — Create, edit, delete students
  ☐ students.export — Export student data

Attendance
  ☑ attendance.view — View attendance sessions
  ☑ attendance.take — Mark attendance
  ☐ attendance.manage — Create/cancel sessions, manage all classes
  ☐ attendance.amend_historical — Amend submitted attendance

Finance
  ☑ finance.view — View invoices and payments
  ☐ finance.manage — Create invoices, record payments
  ☐ finance.approve — Approve financial actions
  ...
```

Each permission shows its key and description. Checkboxes are grouped by module. The tier filter controls which permissions are available (admin tier sees all, staff tier sees staff+parent level, parent tier sees only parent level).

**Phase C: Role management improvements**

- Edit existing custom roles (change permissions)
- System roles (is_system=true) should be viewable but not editable/deletable
- "Copy permissions from..." dropdown when creating a new role
- Show which users are assigned to each role

**Phase D: User filters**

- Add name search, role filter, status filter to the users page
- These are straightforward DataTable filters following existing patterns

---

## Key Files to Reference

| Purpose                | Path                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| Permissions constants  | `packages/shared/src/constants/permissions.ts`                                                  |
| Role/membership models | `packages/prisma/schema.prisma` (search for TenantRole, TenantRolePermission, TenantMembership) |
| Roles frontend         | `apps/web/src/app/[locale]/(school)/settings/roles/`                                            |
| Users frontend         | `apps/web/src/app/[locale]/(school)/settings/users/`                                            |
| Auth/RBAC backend      | `apps/api/src/modules/auth/` or `apps/api/src/modules/tenants/`                                 |
| Permission guard       | `apps/api/src/common/guards/permission.guard.ts`                                                |
| Permission cache       | `apps/api/src/common/services/permission-cache.service.ts`                                      |
| Settings layout        | `apps/web/src/app/[locale]/(school)/settings/layout.tsx`                                        |
| Assessment categories  | `apps/web/src/app/[locale]/(school)/settings/assessment-categories/`                            |

---

## Implementation Order

```
Phase A: Fix permissions list (critical — unblocks role management)
  - Create or fix the permissions API endpoint
  - Fix the role creation form to display permission checkboxes

Phase B: Permission picker UI
  - Grouped checkbox list by module
  - Tier filtering
  - Save selected permissions to TenantRolePermission

Phase C: Role management
  - Edit custom roles
  - Protect system roles from editing/deletion
  - "Copy from" when creating new roles
  - Show user count per role

Phase D: Users page filters
  - Name search
  - Role filter dropdown
  - Status filter (active/suspended)

Phase E: Fix assessment categories 404
  - Check if page exists, fix route or create page
```
