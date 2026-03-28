# SEN Sub-Plan 02 — SEN Profile Service + Controller

## Overview

Core CRUD for student SEN profiles with permission-based scoped access. This phase introduces the SEN NestJS module, scope resolution service, and the first set of API endpoints.

**Depends on**: Sub-plan 01 (data model must be migrated).

---

## Proposed Changes

### Backend Module

#### [NEW] `apps/api/src/modules/sen/`

```
modules/sen/
├── dto/
│   ├── create-sen-profile.dto.ts
│   ├── update-sen-profile.dto.ts
│   └── list-sen-profiles.dto.ts
├── sen.module.ts
├── sen-profile.controller.ts
├── sen-profile.controller.spec.ts
├── sen-profile.service.ts
├── sen-profile.service.spec.ts
├── sen-scope.service.ts
└── sen-scope.service.spec.ts
```

---

### Scope Resolution Service

#### [NEW] `sen-scope.service.ts`

Permission-based scope filtering, mirroring the `BehaviourScopeService` pattern:

```typescript
@Injectable()
export class SenScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserScope(
    tenantId: string,
    userId: string,
    permissions: string[],
  ): Promise<SenScopeResult> {
    // sen.admin or sen.manage → 'all' (SEN coordinator sees everything)
    if (
      permissions.includes('sen.admin') ||
      permissions.includes('sen.manage')
    ) {
      return { scope: 'all' };
    }

    // sen.view → 'class' (class teacher sees their class students)
    if (permissions.includes('sen.view')) {
      const staffProfile = await this.prisma.staffProfile.findFirst({
        where: { user_id: userId, tenant_id: tenantId },
        select: { id: true },
      });

      if (staffProfile) {
        const classStaff = await this.prisma.classStaff.findMany({
          where: { staff_profile_id: staffProfile.id, tenant_id: tenantId },
          select: { class_id: true },
        });

        if (classStaff.length > 0) {
          const classIds = classStaff.map((cs) => cs.class_id);
          const enrolments = await this.prisma.classEnrolment.findMany({
            where: {
              class_id: { in: classIds },
              tenant_id: tenantId,
              status: 'active',
            },
            select: { student_id: true },
          });

          return {
            scope: 'class',
            studentIds: [...new Set(enrolments.map((e) => e.student_id))],
          };
        }
      }
      return { scope: 'none' };
    }

    // No SEN permission → nothing
    return { scope: 'none' };
  }
}
```

**Scope types**:
- `all` — SEN coordinator, principal, sen.admin/manage holders see all profiles
- `class` — Class teachers see SEN profiles for students in their classes
- `none` — No access

The `sen.view_sensitive` permission is a **secondary gate** within the scope. Users with `sen.view` see profiles but with diagnosis/professional details redacted. Users with `sen.view_sensitive` see full details.

---

### SEN Profile Service

#### [NEW] `sen-profile.service.ts`

| Method | Description |
|--------|-------------|
| `create(tenantId, dto)` | Create SEN profile for a student. Enforces unique constraint (one per student). |
| `findAll(tenantId, userId, permissions, query)` | List SEN profiles with scope filtering. Filters: `is_active`, `primary_category`, `support_level`, `year_group_id`, `search` (student name). |
| `findOne(tenantId, userId, permissions, id)` | Profile detail with linked support plans, accommodations, professional involvements. Redacts sensitive fields if user lacks `sen.view_sensitive`. |
| `findByStudent(tenantId, userId, permissions, studentId)` | Find profile by student ID. |
| `update(tenantId, id, dto)` | Update profile fields. |
| `getOverview(tenantId)` | Dashboard summary — total SEN students, breakdown by category, by support level, by year group. |

**Sensitive field redaction**: When the requesting user lacks `sen.view_sensitive`, the following fields are returned as `null`:
- `diagnosis`, `diagnosis_date`, `diagnosis_source`, `assessment_notes`
- Professional involvement records are excluded entirely

---

### SEN Profile Controller

#### [NEW] `sen-profile.controller.ts`

| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/sen/profiles` | Create SEN profile for a student | `sen.manage` |
| GET | `v1/sen/profiles` | List SEN profiles (scoped, filtered) | `sen.view` |
| GET | `v1/sen/profiles/:id` | SEN profile detail | `sen.view` |
| PATCH | `v1/sen/profiles/:id` | Update SEN profile | `sen.manage` |
| GET | `v1/sen/students/:studentId/profile` | Get SEN profile by student ID | `sen.view` |
| GET | `v1/sen/overview` | Dashboard summary | `sen.view` |

Guards: `@UseGuards(AuthGuard, PermissionGuard)` at class level.

---

### SEN Module Registration

#### [NEW] `sen.module.ts`

```typescript
@Module({
  imports: [AuthModule],
  controllers: [SenProfileController],
  providers: [SenProfileService, SenScopeService],
  exports: [SenProfileService, SenScopeService],
})
export class SenModule {}
```

Register in `app.module.ts`.

---

### DTO Re-exports

#### [NEW] `dto/create-sen-profile.dto.ts`

```typescript
import { createSenProfileSchema } from '@school/shared';
import type { CreateSenProfileDto } from '@school/shared';
export { createSenProfileSchema };
export type { CreateSenProfileDto };
```

Same pattern for `update-sen-profile.dto.ts` and `list-sen-profiles.dto.ts`.

---

## Tests

#### [NEW] `sen-profile.service.spec.ts`

Coverage:
- Create profile — success, duplicate student rejected
- `findAll` — scope filtering (all vs class vs none), category filter, support level filter, year group filter, search
- `findOne` — success, not found, sensitive field redaction with/without `sen.view_sensitive`
- `findByStudent` — success, not found
- `update` — success, not found
- `getOverview` — aggregation correctness

#### [NEW] `sen-profile.controller.spec.ts`

Coverage:
- Route mapping, guard presence, permission decorators, param validation

Test pattern:
```typescript
const TENANT_ID = 'test-tenant-uuid';
const STUDENT_ID = 'test-student-uuid';
const PROFILE_ID = 'test-profile-uuid';

afterEach(() => jest.clearAllMocks());

jest.mock('../../common/middleware/rls.middleware');
```

---

## Verification

```bash
# Run SEN module tests
npx jest --config apps/api/jest.config.ts --testPathPattern="modules/sen" --verbose

# Full regression
npx turbo test

# CI pre-flight
npx turbo type-check && npx turbo lint
```
