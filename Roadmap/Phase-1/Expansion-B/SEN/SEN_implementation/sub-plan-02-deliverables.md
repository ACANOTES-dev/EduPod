# Sub-Plan 02 Deliverables Checklist — SEN Profile Service + Controller

Use this checklist alongside `sub-plan-02-sen-profile.md` (the spec). Every item below must be delivered. Do not report completion until every item is checked.

---

## Files to CREATE (10 files)

### Module

- [ ] `apps/api/src/modules/sen/sen.module.ts`
  - Import `AuthModule`
  - Register `SenProfileController` in controllers
  - Register `SenProfileService`, `SenScopeService` in providers
  - Export `SenProfileService`, `SenScopeService`

### DTOs (3 files)

- [ ] `apps/api/src/modules/sen/dto/create-sen-profile.dto.ts`
  - Re-export `createSenProfileSchema` and `CreateSenProfileDto` type from `@school/shared`
- [ ] `apps/api/src/modules/sen/dto/update-sen-profile.dto.ts`
  - Re-export `updateSenProfileSchema` and `UpdateSenProfileDto` type from `@school/shared`
- [ ] `apps/api/src/modules/sen/dto/list-sen-profiles.dto.ts`
  - Re-export `listSenProfilesQuerySchema` and `ListSenProfilesQuery` type from `@school/shared`

### Scope Service

- [ ] `apps/api/src/modules/sen/sen-scope.service.ts`
  - Injectable service with `PrismaService` dependency
  - Method: `getUserScope(tenantId, userId, permissions)` returning `{ scope, studentIds? }`
  - Scope resolution logic (mirrors `BehaviourScopeService` pattern):
    - `sen.admin` or `sen.manage` → scope `'all'`
    - `sen.view` + staff with class assignments → scope `'class'` + `studentIds` from active enrolments
    - `sen.view` + staff without classes → scope `'none'`
    - No SEN permission → scope `'none'`
  - Deduplicate studentIds using `Set`
  - All queries include `tenant_id` filter

### Profile Service

- [ ] `apps/api/src/modules/sen/sen-profile.service.ts`
  - Injectable service with `PrismaService` and `SenScopeService` dependencies
  - 6 methods:
    1. `create(tenantId, dto)` — Create SEN profile. Use RLS transaction (`createRlsClient`). Handle P2002 duplicate → `ConflictException`
    2. `findAll(tenantId, userId, permissions, query)` — List with scope filtering + pagination. Filters: `is_active`, `primary_category`, `support_level`, `search` (student name). Return `{ data, meta: { page, pageSize, total } }`
    3. `findOne(tenantId, userId, permissions, id)` — Detail with relations (support_plans, accommodations, involvements). Redact sensitive fields if user lacks `sen.view_sensitive`. Throw `NotFoundException` if not found
    4. `findByStudent(tenantId, userId, permissions, studentId)` — Find by student ID with same scope/redaction logic. Throw `NotFoundException` if not found
    5. `update(tenantId, id, dto)` — Update profile via RLS transaction. Throw `NotFoundException` if not found
    6. `getOverview(tenantId)` — Dashboard: total SEN students, breakdown by category, by support level
  - **Sensitive field redaction**: When user lacks `sen.view_sensitive`, return `null` for: `diagnosis`, `diagnosis_date`, `diagnosis_source`, `assessment_notes`. Exclude `involvements` (professional involvement records) entirely.

### Profile Controller

- [ ] `apps/api/src/modules/sen/sen-profile.controller.ts`
  - `@Controller('v1')`
  - `@ModuleEnabled('sen')`
  - `@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)`
  - 6 routes (static routes BEFORE dynamic):
    1. `GET v1/sen/overview` — `@RequiresPermission('sen.view')` → `getOverview()`
    2. `GET v1/sen/students/:studentId/profile` — `@RequiresPermission('sen.view')` + `ParseUUIDPipe` → `findByStudent()`
    3. `POST v1/sen/profiles` — `@RequiresPermission('sen.manage')` + `ZodValidationPipe(createSenProfileSchema)` → `create()`
    4. `GET v1/sen/profiles` — `@RequiresPermission('sen.view')` + `ZodValidationPipe(listSenProfilesQuerySchema)` on query → `findAll()`
    5. `GET v1/sen/profiles/:id` — `@RequiresPermission('sen.view')` + `ParseUUIDPipe` → `findOne()`
    6. `PATCH v1/sen/profiles/:id` — `@RequiresPermission('sen.manage')` + `ParseUUIDPipe` + `ZodValidationPipe(updateSenProfileSchema)` → `update()`
  - Use `@CurrentTenant()` for tenant context and `@CurrentUser()` for JWT payload
  - Thin controller — zero business logic, delegate to service

### Tests (3 files)

- [ ] `apps/api/src/modules/sen/sen-scope.service.spec.ts`
  - Test all scope resolution paths:
    - `sen.admin` → scope `'all'`
    - `sen.manage` → scope `'all'`
    - `sen.view` with class assignments → scope `'class'` with correct studentIds
    - `sen.view` without class assignments → scope `'none'`
    - No permissions → scope `'none'`
    - StudentId deduplication across multiple classes
  - Mock `PrismaService` (staffProfile.findFirst, classStaff.findMany, classEnrolment.findMany)
  - Use NestJS `Test.createTestingModule` pattern
  - `afterEach(() => jest.clearAllMocks())`

- [ ] `apps/api/src/modules/sen/sen-profile.service.spec.ts`
  - Mock RLS: `jest.mock('../../common/middleware/rls.middleware')`
  - Test fixtures: `TENANT_ID`, `STUDENT_ID`, `PROFILE_ID` as constants
  - Tests per method:
    - `create`: success, duplicate student P2002 → ConflictException
    - `findAll`: scope 'all' returns everything, scope 'class' filters by studentIds, scope 'none' returns empty, category filter, support level filter, search filter, pagination
    - `findOne`: success with relations, not found → NotFoundException, sensitive field redaction WITH `sen.view_sensitive`, redaction WITHOUT `sen.view_sensitive`
    - `findByStudent`: success, not found → NotFoundException
    - `update`: success, not found → NotFoundException
    - `getOverview`: correct aggregation counts

- [ ] `apps/api/src/modules/sen/sen-profile.controller.spec.ts`
  - Test route mapping, guard presence, permission decorators
  - Test `ParseUUIDPipe` on `:id` and `:studentId` params
  - Test `ZodValidationPipe` applied to body/query
  - Mock `SenProfileService` methods

---

## Files to MODIFY (1 file)

- [ ] `apps/api/src/app.module.ts`
  - Import `SenModule` from `'./modules/sen/sen.module'`
  - Add to `imports` array

---

## Conventions to Follow

- File naming: `kebab-case.suffix.ts` (e.g., `sen-profile.controller.ts`)
- Imports: external → `@school/*` → relative, separated by blank lines
- Guards: `@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)` at class level
- Route comments: `// GET /v1/sen/profiles` above each handler
- Service methods: `tenantId` as first parameter, always
- RLS writes: `createRlsClient(this.prisma, { tenant_id }).$transaction(async (tx) => { ... })`
- RLS reads: direct `this.prisma.model.findMany()` with `tenant_id` in `where`
- Pagination: `{ data, meta: { page, pageSize, total } }`
- Errors: `NotFoundException({ code: 'SEN_PROFILE_NOT_FOUND', message: '...' })`, `ConflictException({ code: 'SEN_PROFILE_ALREADY_EXISTS', message: '...' })`
- No `any` types, no `@ts-ignore`, no `as unknown as X`
- `import type` for type-only imports

---

## Verification Commands

After all files are created:

```bash
# Type-check
npx turbo type-check

# Lint
npx turbo lint

# Run SEN tests only
npx jest --config apps/api/jest.config.ts --testPathPattern="modules/sen" --verbose

# Full regression
npx turbo test
```

---

## Definition of Done

- [ ] All 10 files created
- [ ] `app.module.ts` modified with SEN module import
- [ ] All tests pass (`npx jest --testPathPattern="modules/sen"`)
- [ ] `npx turbo type-check` passes
- [ ] `npx turbo lint` passes
- [ ] Work committed and pushed to remote branch
