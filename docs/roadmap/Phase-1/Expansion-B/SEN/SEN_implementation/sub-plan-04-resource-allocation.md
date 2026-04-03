# SEN Sub-Plan 04 — Resource Allocation

## Overview

SENO resource hours tracking, student-level hour assignment with utilisation monitoring, and SNA (Special Needs Assistant) assignment management with weekly schedules.

**Depends on**: Sub-plan 02 (SEN profiles must exist for student-level assignments).

---

## Proposed Changes

### Backend Files

#### [NEW] Additional files in `apps/api/src/modules/sen/`

```
├── dto/
│   ├── create-resource-allocation.dto.ts
│   ├── update-resource-allocation.dto.ts
│   ├── create-student-hours.dto.ts
│   ├── update-student-hours.dto.ts
│   ├── create-sna-assignment.dto.ts
│   └── update-sna-assignment.dto.ts
├── sen-resource.controller.ts
├── sen-resource.controller.spec.ts
├── sen-resource.service.ts
├── sen-resource.service.spec.ts
├── sen-sna.controller.ts
├── sen-sna.controller.spec.ts
├── sen-sna.service.ts
└── sen-sna.service.spec.ts
```

---

### Resource Allocation Service

#### [NEW] `sen-resource.service.ts`

| Method                                  | Description                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `createAllocation(tenantId, dto)`       | Set school-level SENO/school hours for an academic year. Enforces unique constraint on `(tenant_id, academic_year_id, source)`.             |
| `findAllAllocations(tenantId, query)`   | List allocations filtered by academic year.                                                                                                 |
| `updateAllocation(tenantId, id, dto)`   | Update total hours or notes.                                                                                                                |
| `assignStudentHours(tenantId, dto)`     | Assign hours to a student from an allocation. Validates: student has an active SEN profile, total assigned hours don't exceed allocation.   |
| `findStudentHours(tenantId, query)`     | List student hour assignments. Filters: `academic_year_id`, `student_id`, `sen_profile_id`. Returns with calculated utilisation percentage. |
| `updateStudentHours(tenantId, id, dto)` | Update allocated or used hours.                                                                                                             |
| `getUtilisation(tenantId, query)`       | Utilisation dashboard data: total allocated vs. total assigned vs. total used, by source (SENO/school), by year group.                      |

**Over-allocation guard**: When assigning student hours, the service sums all existing `allocated_hours` for the same `resource_allocation_id` and rejects if adding the new assignment would exceed `total_hours` on the allocation. Returns `400 HOURS_EXCEEDED` with the available remainder.

**Utilisation calculation**:

```
assigned_percentage = SUM(student_hours.allocated_hours) / allocation.total_hours * 100
used_percentage = SUM(student_hours.used_hours) / allocation.total_hours * 100
```

---

### Resource Allocation Controller

#### [NEW] `sen-resource.controller.ts`

| Method | Route                             | Description                                      | Permission             |
| ------ | --------------------------------- | ------------------------------------------------ | ---------------------- |
| POST   | `v1/sen/resource-allocations`     | Set school-level SENO hours for an academic year | `sen.manage_resources` |
| GET    | `v1/sen/resource-allocations`     | List allocations by academic year                | `sen.view`             |
| PATCH  | `v1/sen/resource-allocations/:id` | Update allocation                                | `sen.manage_resources` |
| POST   | `v1/sen/student-hours`            | Assign hours to a student from the allocation    | `sen.manage_resources` |
| GET    | `v1/sen/student-hours`            | List student hour assignments (with utilisation) | `sen.view`             |
| PATCH  | `v1/sen/student-hours/:id`        | Update student hours                             | `sen.manage_resources` |
| GET    | `v1/sen/resource-utilisation`     | Utilisation dashboard                            | `sen.view`             |

---

### SNA Assignment Service

#### [NEW] `sen-sna.service.ts`

| Method                                 | Description                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `create(tenantId, dto)`                | Assign SNA to student(s). Validates: student has active SEN profile, SNA staff profile exists. |
| `findAll(tenantId, query)`             | List active SNA assignments. Filters: `status`, `sna_staff_profile_id`, `student_id`.          |
| `update(tenantId, id, dto)`            | Update assignment (schedule, notes).                                                           |
| `endAssignment(tenantId, id, endDate)` | End an SNA assignment — sets `status = ended`, `end_date`.                                     |
| `findBySna(tenantId, staffId)`         | All assignments for a specific SNA.                                                            |
| `findByStudent(tenantId, studentId)`   | SNA assignments for a specific student.                                                        |

**Schedule JSONB format** (validated by Zod schema):

```typescript
// Weekly format (default)
z.object({
  monday: z.array(z.object({ start: z.string(), end: z.string() })).default([]),
  tuesday: z.array(z.object({ start: z.string(), end: z.string() })).default([]),
  wednesday: z.array(z.object({ start: z.string(), end: z.string() })).default([]),
  thursday: z.array(z.object({ start: z.string(), end: z.string() })).default([]),
  friday: z.array(z.object({ start: z.string(), end: z.string() })).default([]),
});

// Daily format (configurable via tenant settings sen.sna_schedule_format)
// Same structure but school uses it to record daily rather than weekly patterns
```

---

### SNA Assignment Controller

#### [NEW] `sen-sna.controller.ts`

| Method | Route                                          | Description                         | Permission             |
| ------ | ---------------------------------------------- | ----------------------------------- | ---------------------- |
| POST   | `v1/sen/sna-assignments`                       | Assign SNA to student(s)            | `sen.manage_resources` |
| GET    | `v1/sen/sna-assignments`                       | List active SNA assignments         | `sen.view`             |
| PATCH  | `v1/sen/sna-assignments/:id`                   | Update assignment (schedule, notes) | `sen.manage_resources` |
| PATCH  | `v1/sen/sna-assignments/:id/end`               | End an SNA assignment               | `sen.manage_resources` |
| GET    | `v1/sen/sna-assignments/by-sna/:staffId`       | Assignments for a specific SNA      | `sen.view`             |
| GET    | `v1/sen/sna-assignments/by-student/:studentId` | SNA assignments for a student       | `sen.view`             |

Note: Static routes (`by-sna`, `by-student`) are declared before dynamic routes (`:id`) in the controller to avoid route conflicts.

---

### Module Update

#### [MODIFY] `sen.module.ts`

Add `SenResourceService`, `SenSnaService`, `SenResourceController`, `SenSnaController`.

---

## Tests

#### `sen-resource.service.spec.ts`

- Create allocation — success, duplicate rejected
- List allocations — academic year filter
- Update allocation — success, not found
- Assign student hours — success, over-allocation guard, student without SEN profile rejected
- List student hours — with utilisation calculation
- Update student hours — success
- Utilisation dashboard — correct aggregation by source and year group

#### `sen-sna.service.spec.ts`

- Create assignment — success, student without SEN profile rejected, SNA staff not found
- List assignments — status filter, by SNA, by student
- Update assignment — schedule update
- End assignment — sets status and end_date

---

## Verification

```bash
npx jest --config apps/api/jest.config.ts --testPathPattern="modules/sen" --verbose
npx turbo test
npx turbo type-check && npx turbo lint
```
