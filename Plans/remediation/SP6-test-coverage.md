# Sub-Plan 6: Behaviour Module Test Coverage

**Status:** Spec complete, awaiting implementation
**Date:** 2026-03-27
**Scope:** 8 missing service tests, 17 missing controller tests, cross-cutting gap closure

---

## 1. Current State

| Metric | Count | Coverage |
|--------|-------|----------|
| Service files with tests | 21 of 29 | 72% |
| Service files WITHOUT tests | 8 | 0% |
| Controller files with tests | 0 of 17 | 0% |
| Total existing test cases | ~447 | - |
| Endpoints without controller test | 209 | 0% |
| Release gate tests | 7 files, ~129 cases | Exists |

### Existing Test Counts by File (for reference)
```
behaviour.service.spec.ts                    53 tests
safeguarding.service.spec.ts                 35 tests
behaviour-parent.service.spec.ts             21 tests
behaviour-pulse.service.spec.ts              19 tests
behaviour-tasks.service.spec.ts              18 tests
behaviour-document.service.spec.ts           15 tests
behaviour-config.service.spec.ts             15 tests
behaviour-amendments.service.spec.ts         15 tests
behaviour-scope.service.spec.ts              14 tests
behaviour-appeals.service.spec.ts            13 tests
safeguarding-attachment.service.spec.ts      12 tests
behaviour-sanctions.service.spec.ts          11 tests
behaviour-legal-hold.service.spec.ts         11 tests
safeguarding-break-glass.service.spec.ts     10 tests
behaviour-admin.service.spec.ts               9 tests
behaviour-exclusion-cases.service.spec.ts     8 tests
behaviour-history.service.spec.ts             7 tests
behaviour-guardian-restrictions.service.spec.ts 7 tests
behaviour-points.service.spec.ts              6 tests
behaviour-award.service.spec.ts               6 tests
behaviour-alerts.service.spec.ts              5 tests
```

---

## 2. Test Infrastructure & Patterns

### 2.1 RLS Mock Pattern (established)

All behaviour service tests use this pattern:

```typescript
const mockRlsTx: Record<string, Record<string, jest.Mock>> = {
  modelName: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx),
    ),
  }),
}));
```

### 2.2 RLS Isolation Mock Pattern (from release gate 15-7)

For cross-tenant isolation tests:

```typescript
let activeRlsTenantId = TENANT_A;

function createRlsFilteredFindMany(table: string, recordId: string) {
  const record = makeTenantARecord(table, recordId);
  return jest.fn().mockImplementation(() => {
    if (activeRlsTenantId === TENANT_A) return Promise.resolve([record]);
    return Promise.resolve([]);
  });
}

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockImplementation((tenantId: string) => {
    activeRlsTenantId = tenantId;
    return {
      $transaction: jest.fn().mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx),
      ),
    };
  }),
}));
```

### 2.3 Controller Test Pattern (from existing codebase)

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

const TENANT: TenantContext = {
  tenant_id: 'tenant-uuid',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: 'user-uuid',
  tenant_id: 'tenant-uuid',
  email: 'admin@test.com',
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

describe('SomeController', () => {
  let controller: SomeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SomeController],
      providers: [
        { provide: SomeService, useValue: mockService },
        // ... other dependencies
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SomeController>(SomeController);
    jest.clearAllMocks();
  });

  it('should call service.method with correct args', async () => {
    mockService.method.mockResolvedValue({ id: 'result' });
    await controller.method(TENANT, USER, dto);
    expect(mockService.method).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', dto);
  });
});
```

### 2.4 NestJS Test Module Setup

- Jest config: `apps/api/jest.config.js` (standard ts-jest, node environment)
- Module path alias: `@/` maps to `<rootDir>/src/`
- Test pattern: `*.spec.ts` co-located with source

---

## 3. Missing Service Tests -- Detailed Spec

### 3.1 behaviour-interventions.service.spec.ts (CRITICAL)

**File:** `apps/api/src/modules/behaviour/behaviour-interventions.service.ts`
**Dependencies:** PrismaService, SequenceService, BehaviourHistoryService
**Methods:** 12 public methods
**State machine:** InterventionStatus (planned -> active_intervention -> monitoring -> completed_intervention/abandoned)
**Minimum test count:** 35

#### Test Cases

```
describe('BehaviourInterventionsService')

  describe('create')
    - should generate IV- sequence number on creation
    - should calculate next_review_date from start_date + review_frequency_days
    - should map DTO status "active" to Prisma enum "active_intervention"
    - should map DTO type "other" to Prisma enum "other_intervention"
    - should record history on creation
    - should link incident IDs when provided

  describe('list')
    - should return paginated interventions with meta
    - should filter by status when provided
    - should filter by student_id when provided
    - should strip send_notes when hasSensitivePermission is false
    - should include send_notes when hasSensitivePermission is true

  describe('getDetail')
    - should return intervention with reviews and linked incidents
    - should throw NotFoundException for non-existent ID
    - should strip send_notes based on permission flag

  describe('update')
    - should update allowed fields and record history
    - should throw NotFoundException for non-existent intervention
    - should record old and new values in history

  describe('transitionStatus')
    - should allow planned -> active_intervention
    - should allow active_intervention -> monitoring
    - should allow active_intervention -> completed_intervention
    - should allow active_intervention -> abandoned
    - should allow monitoring -> completed_intervention
    - should allow monitoring -> active_intervention (re-activation)
    - should reject completed_intervention -> any (terminal)
    - should reject abandoned -> any (terminal)
    - should reject planned -> completed_intervention (invalid skip)
    - should reject planned -> monitoring (invalid skip)
    - should auto-create intervention_review task on activation
    - should set actual_end_date on completion
    - should set actual_end_date on abandonment
    - should record status_changed history

  describe('createReview')
    - should create review record for active intervention
    - should throw NotFoundException for non-existent intervention
    - should update next_review_date after review creation
    - should record history on review creation

  describe('getAutoPopulateData')
    - should return linked incident data for form pre-population

  describe('listReviews')
    - should return paginated reviews for an intervention

  describe('complete')
    - should transition to completed_intervention with outcome

  describe('listOverdue')
    - should return interventions past next_review_date

  describe('listMy')
    - should filter by assigned_to_id matching userId

  describe('getOutcomeAnalytics')
    - should aggregate outcomes by type
    - edge: should handle zero interventions gracefully
```

---

### 3.2 behaviour-analytics.service.spec.ts (CRITICAL)

**File:** `apps/api/src/modules/behaviour/behaviour-analytics.service.ts`
**Dependencies:** PrismaService, BehaviourScopeService, BehaviourPulseService
**Methods:** 13 aggregation methods
**Minimum test count:** 40

#### Test Cases

```
describe('BehaviourAnalyticsService')

  describe('getOverview')
    - should return incident count, positive/negative split, points total
    - should respect scope filter from scopeService
    - should exclude withdrawn and converted_to_safeguarding statuses
    - should filter by date range when from/to provided
    - should default to last 30 days when no date range
    - should filter by academicYearId when provided
    - should filter by polarity when provided
    - edge: should return zeroes when no data exists

  describe('getHeatmap')
    - should return hour-of-day x day-of-week matrix
    - should respect scope filtering
    - edge: should return empty matrix for zero incidents

  describe('getTrends')
    - should return daily trend points within date range
    - should separate positive and negative trends
    - should respect scope filtering
    - edge: should fill zero-count days in date range

  describe('getCategories')
    - should return category breakdown with counts
    - should order by count descending
    - should respect scope filtering

  describe('getSubjects')
    - should aggregate incidents by subject
    - should handle incidents without subject association

  describe('getStaffActivity')
    - should aggregate by reporting staff member
    - should respect scope filtering
    - should return per-staff positive/negative breakdown

  describe('getSanctions')
    - should summarize sanctions by type
    - should include served/pending/cancelled breakdown

  describe('getInterventionOutcomes')
    - should aggregate intervention outcomes
    - should calculate success rate percentage

  describe('getRatio')
    - should calculate positive-to-negative ratio
    - edge: should handle zero negatives (avoid division by zero)
    - edge: should handle zero total incidents

  describe('getComparisons')
    - should compare across year groups or classes
    - should normalize by student count when requested

  describe('getPolicyEffectiveness')
    - should calculate policy rule trigger vs outcome rates

  describe('getTaskCompletion')
    - should calculate task completion rate
    - should break down by task type

  describe('getHistoricalHeatmap')
    - should return multi-month heatmap data
```

---

### 3.3 behaviour-ai.service.spec.ts (CRITICAL)

**File:** `apps/api/src/modules/behaviour/behaviour-ai.service.ts`
**Dependencies:** PrismaService, BehaviourScopeService, BehaviourAnalyticsService, ConfigService
**External:** Anthropic SDK (must be mocked)
**Minimum test count:** 18

#### Test Cases

```
describe('BehaviourAIService')

  describe('processNLQuery')
    - should throw ForbiddenException when ai_nl_query_enabled is false
    - should resolve scope via scopeService before fetching data
    - should call analyticsService.getOverview, getTrends, getCategories in parallel
    - should anonymise data context before sending to AI
    - should build prompt with user query and anonymised data
    - should de-anonymise AI response before returning
    - should return ai_generated: true and scope_applied label
    - should throw ServiceUnavailableException when AI call fails
    - should write audit log when ai_audit_logging is enabled
    - should not write audit log when ai_audit_logging is disabled
    - should not crash if audit log write fails (graceful catch)
    - edge: should handle empty analytics data without error

  describe('callAI (private, tested via processNLQuery)')
    - should throw Error when anthropicClient is null (no API key configured)
    - should use 15-second timeout via AbortController
    - should extract text block from Anthropic response
    - should throw when response has no text block

  describe('getQueryHistory')
    - should return paginated audit log entries for ai_query actions
    - should filter by tenant_id and user_id
```

**Mocking strategy for Anthropic SDK:**
```typescript
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'AI response text' }],
      }),
    },
  })),
}));
```

---

### 3.4 behaviour-house.service.spec.ts (HIGH)

**File:** `apps/api/src/modules/behaviour/behaviour-house.service.ts`
**Dependencies:** PrismaService, BehaviourPointsService
**Methods:** 5 public methods
**Minimum test count:** 20

#### Test Cases

```
describe('BehaviourHouseService')

  describe('listHouses')
    - should return active houses with member counts
    - should return member_count=0 when no current academic year exists
    - should order houses by display_order ascending
    - edge: should handle zero houses gracefully

  describe('getHouseDetail')
    - should return house with members sorted by points descending
    - should calculate total_points as sum of member points
    - should throw NotFoundException for non-existent house
    - should fetch points per member via pointsService.getStudentPoints

  describe('createHouse')
    - should create house with required fields
    - should set optional fields (name_ar, icon, display_order) when provided
    - should throw ConflictException on duplicate name within tenant
    - should default display_order to 0 when not provided

  describe('updateHouse')
    - should update allowed fields
    - should throw NotFoundException for non-existent house
    - should throw ConflictException when renaming to existing name
    - should allow updating name to same name (no conflict)
    - should allow partial update (only is_active)

  describe('bulkAssign')
    - should delete existing memberships and create new ones
    - should return { assigned: 0 } for empty assignments array
    - should invalidate house points cache for affected houses
    - edge: should handle reassigning student from one house to another
```

---

### 3.5 behaviour-document-template.service.spec.ts (HIGH)

**File:** `apps/api/src/modules/behaviour/behaviour-document-template.service.ts`
**Dependencies:** PrismaService (only)
**Methods:** 4 async + 1 sync
**Minimum test count:** 16

#### Test Cases

```
describe('BehaviourDocumentTemplateService')

  describe('listTemplates')
    - should return all templates for tenant
    - should filter by document_type when provided
    - should filter by locale when provided
    - should filter by is_active when provided

  describe('createTemplate')
    - should create template with is_system=false
    - should use provided merge_fields when given
    - should auto-populate merge_fields from type when not provided
    - should default locale to "en" when not provided

  describe('updateTemplate')
    - should update custom template fields (name, body, is_active)
    - should restrict system template updates (only is_active, template_body)
    - should throw BadRequestException when renaming system template
    - should throw NotFoundException for non-existent template

  describe('getActiveTemplate')
    - should return custom template over system template (orderBy is_system asc)
    - should return null when no active template matches
    - should match by document_type and locale

  describe('getMergeFieldsForType')
    - should return type-specific merge fields for known types
    - should return COMMON_MERGE_FIELDS for unknown/custom types
```

---

### 3.6 behaviour-quick-log.service.spec.ts (MEDIUM)

**File:** `apps/api/src/modules/behaviour/behaviour-quick-log.service.ts`
**Dependencies:** PrismaService, BehaviourService
**Methods:** 3 public methods
**Minimum test count:** 12

#### Test Cases

```
describe('BehaviourQuickLogService')

  describe('getContext')
    - should return active categories ordered by display_order
    - should return active templates grouped by category_id
    - should return recent 20 distinct students from user's incidents
    - should return student details (id, first_name, last_name, year_group)
    - should filter out participants with null student references
    - edge: should return empty recent_students when user has no incidents

  describe('quickLog')
    - should delegate to behaviourService.createIncident with auto_submit=true
    - should set occurred_at to current time
    - should pass through category_id, student_ids, description
    - should pass through optional fields (template_id, context_type, etc.)

  describe('bulkPositive')
    - should create one incident per student_id via behaviourService
    - should return count matching student_ids length
```

---

### 3.7 behaviour-recognition.service.spec.ts (MEDIUM)

**File:** `apps/api/src/modules/behaviour/behaviour-recognition.service.ts`
**Dependencies:** PrismaService, BehaviourHistoryService
**Methods:** 6 public methods
**Minimum test count:** 20

#### Test Cases

```
describe('BehaviourRecognitionService')

  describe('getWall')
    - should return published items (published_at not null, unpublished_at null)
    - should paginate results
    - should filter by year_group_id when provided
    - edge: should return empty data for no published items

  describe('createPublicationApproval')
    - should set parent_consent_status to "not_requested" when requires_parent_consent=true
    - should set parent_consent_status to "granted" when requires_parent_consent=false
    - should auto-publish when both gates pass (no consent + no admin approval)
    - should not publish when admin_approval_required=true
    - should not publish when requires_parent_consent=true

  describe('approvePublication')
    - should set admin_approved=true
    - should publish (set published_at) when consent already granted
    - should not publish when consent not yet granted
    - should throw NotFoundException for non-existent publication
    - should record history on approval

  describe('rejectPublication')
    - should set unpublished_at timestamp
    - should throw NotFoundException for non-existent publication
    - should record history on rejection

  describe('getPublicFeed')
    - should cap pageSize at 50
    - should only return published, non-unpublished items
    - should order by published_at descending

  describe('getPublicationDetail')
    - should return full publication details
    - should throw NotFoundException for non-existent record
```

---

### 3.8 behaviour-students.service.spec.ts (MEDIUM)

**File:** `apps/api/src/modules/behaviour/behaviour-students.service.ts`
**Dependencies:** PrismaService, BehaviourScopeService, BehaviourPointsService
**Methods:** 6 public methods
**Minimum test count:** 22

#### Test Cases

```
describe('BehaviourStudentsService')

  describe('listStudents')
    - should return paginated students with behaviour summary
    - should apply "all" scope (no filter)
    - should apply "class" scope (filter by classStudentIds)
    - should apply "year_group" scope (filter by yearGroupIds)
    - should apply "own" scope (students from user's incidents only)
    - should include total_points and incident_count per student
    - edge: should return empty data when no students match scope

  describe('getStudentProfile')
    - should return student with points, summary counts
    - should throw NotFoundException for non-existent student
    - should aggregate positive/negative/total counts correctly
    - should use pointsService for points calculation

  describe('getStudentTimeline')
    - should return paginated timeline ordered by occurred_at desc
    - should exclude withdrawn incidents
    - should include category and reported_by details

  describe('getStudentPoints')
    - should aggregate points_awarded via Prisma aggregate
    - should return 0 when no participants exist

  describe('getStudentTasks')
    - should return tasks for incidents involving the student
    - should paginate results
    - edge: should return empty when student has no incident participation

  describe('getStudentPreview')
    - should return lightweight preview (id, name, year_group, summary)
    - should NOT include sensitive fields (context_notes, send_notes)
```

---

## 4. Controller Tests -- Template & Per-Controller Spec

### 4.1 Controller Test Template

Every controller test file follows this structure:

```typescript
// 1. Setup mock service with all methods as jest.fn()
// 2. Build NestJS TestingModule with controller + mock providers
// 3. Override AuthGuard and PermissionGuard
// 4. For each endpoint:
//    a. Test service delegation (correct method called with correct args)
//    b. Test that service is called with tenant.tenant_id (not full tenant object)
```

### 4.2 Controller Endpoint Matrix

| Controller | Endpoints | Required Permission | Service | Min Tests |
|---|---|---|---|---|
| behaviour.controller | 21 | log, view, manage | BehaviourService, QuickLogService | 21 |
| behaviour-admin.controller | 21 | admin | BehaviourAdminService, ConfigService | 21 |
| behaviour-analytics.controller | 16 | view, view_staff_analytics, ai_query | AnalyticsService, PulseService, AIService | 16 |
| behaviour-sanctions.controller | 14 | manage | SanctionsService | 14 |
| behaviour-students.controller | 13 | view, manage | StudentsService | 13 |
| behaviour-interventions.controller | 12 | manage | InterventionsService | 12 |
| behaviour-recognition.controller | 12 | view, manage | RecognitionService | 12 |
| behaviour-appeals.controller | 10 | manage, appeal | AppealsService | 10 |
| behaviour-exclusions.controller | 10 | manage | ExclusionCasesService | 10 |
| behaviour-alerts.controller | 8 | view | AlertsService | 8 |
| behaviour-tasks.controller | 8 | view, manage | TasksService | 8 |
| safeguarding.controller | 21 | safeguarding.* | SafeguardingService | 21 |
| behaviour-guardian-restrictions.controller | 6 | manage | GuardianRestrictionsService | 6 |
| behaviour-documents.controller | 6 | view, manage | DocumentService, TemplateService | 6 |
| behaviour-parent.controller | 6 | (parent scope) | ParentService | 6 |
| behaviour-amendments.controller | 4 | manage | AmendmentsService | 4 |
| behaviour-config.controller | 21 | admin | ConfigService | 21 |
| **Total** | **209** | | | **209** |

### 4.3 Per-Controller Test Cases

Each controller spec tests one thing per endpoint: **service delegation with correct arguments**.

Format: `should call service.{method} with {args extracted from decorators}`

**Example for behaviour-interventions.controller.spec.ts (12 tests):**
```
- should call interventionsService.create with tenant_id, user.sub, dto
- should call interventionsService.list with tenant_id, user.sub, query, hasSensitive
- should call interventionsService.getDetail with tenant_id, id, hasSensitive
- should call interventionsService.update with tenant_id, id, user.sub, dto
- should call interventionsService.transitionStatus with tenant_id, id, user.sub, dto
- should call interventionsService.createReview with tenant_id, id, user.sub, dto
- should call interventionsService.listReviews with tenant_id, id, page, pageSize
- should call interventionsService.getAutoPopulateData with tenant_id, id
- should call interventionsService.complete with tenant_id, id, user.sub, dto
- should call interventionsService.listOverdue with tenant_id, page, pageSize
- should call interventionsService.listMy with tenant_id, user.sub, page, pageSize
- should call interventionsService.getOutcomeAnalytics with tenant_id, query
```

---

## 5. Permission-Denied Test Matrix

Permission-denied tests verify that endpoints with `@RequiresPermission` reject requests from users without the required permission. These are tested at the **service level** by verifying that the controller passes the correct permission requirement.

### 5.1 Permission Keys Used in Behaviour Module

| Permission Key | Tier | Controllers Using It |
|---|---|---|
| `behaviour.log` | staff | behaviour |
| `behaviour.view` | staff | behaviour, analytics, alerts, documents, students |
| `behaviour.manage` | staff | behaviour, sanctions, interventions, appeals, exclusions, tasks, recognition, guardian-restrictions, amendments, documents |
| `behaviour.admin` | admin | admin, config |
| `behaviour.view_sensitive` | staff | (inline check in services, not decorator) |
| `behaviour.view_staff_analytics` | admin | analytics |
| `behaviour.ai_query` | staff | analytics |
| `behaviour.appeal` | parent | appeals |
| `safeguarding.view` | staff | safeguarding |
| `safeguarding.manage` | staff | safeguarding |

### 5.2 Permission-Denied Tests Per Service (3-5 each)

These test that the service itself enforces access rules where applicable (not just the guard):

```
behaviour-interventions.service
  - should strip send_notes when hasSensitivePermission=false (list)
  - should strip send_notes when hasSensitivePermission=false (getDetail)

behaviour-analytics.service
  - should enforce scope restrictions per user role
  - should exclude converted_to_safeguarding from non-safeguarding users

behaviour-ai.service
  - should throw ForbiddenException when ai_nl_query_enabled=false
  - should never include SENSITIVE fields in AI prompt data

behaviour-students.service
  - should restrict "own" scope teacher to their incidents only
  - should restrict "class" scope teacher to class students only
  - should restrict "year_group" scope to year group students only

behaviour-recognition.service
  - should require admin_approved=true before publishing
  - should require parent_consent_status=granted before publishing
```

---

## 6. State Machine Blocked-Transition Matrix

### 6.1 Intervention State Machine

Valid transitions (already tested in valid-path tests above):
```
planned -> active_intervention, abandoned
active_intervention -> monitoring, completed_intervention, abandoned
monitoring -> completed_intervention, active_intervention
```

**Blocked transitions to test (9 tests):**
```
- completed_intervention -> planned (terminal, blocked)
- completed_intervention -> active_intervention (terminal, blocked)
- completed_intervention -> monitoring (terminal, blocked)
- abandoned -> planned (terminal, blocked)
- abandoned -> active_intervention (terminal, blocked)
- abandoned -> monitoring (terminal, blocked)
- planned -> monitoring (invalid skip)
- planned -> completed_intervention (invalid skip)
- monitoring -> planned (no backward)
```

### 6.2 Incident State Machine (verify in behaviour.service.spec.ts)

Terminal statuses: withdrawn, closed_after_appeal, superseded, converted_to_safeguarding

**Blocked transitions to verify exist (6 tests):**
```
- withdrawn -> any (terminal)
- closed_after_appeal -> any (terminal, except resolved->closed_after_appeal is valid)
- superseded -> any (terminal)
- converted_to_safeguarding -> any (terminal)
- draft -> resolved (invalid skip)
- active -> closed_after_appeal (invalid skip)
```

### 6.3 Sanction State Machine (verify in behaviour-sanctions.service.spec.ts)

Terminal statuses: served, partially_served, cancelled, replaced, superseded

**Blocked transitions to verify exist (5 tests):**
```
- served -> any (terminal)
- partially_served -> any (terminal)
- cancelled -> any (terminal)
- replaced -> any (terminal)
- superseded -> any (terminal)
```

### 6.4 Appeal State Machine (verify in behaviour-appeals.service.spec.ts)

Terminal statuses: decided, withdrawn_appeal

**Blocked transitions to verify exist (4 tests):**
```
- decided -> any (terminal)
- withdrawn_appeal -> any (terminal)
- submitted -> decided (invalid skip)
- submitted -> hearing_scheduled (invalid skip)
```

### 6.5 Exclusion State Machine (verify in behaviour-exclusion-cases.service.spec.ts)

Terminal statuses: finalised, overturned

**Blocked transitions to verify exist (3 tests):**
```
- finalised -> any (terminal)
- overturned -> any (terminal)
- initiated -> hearing_scheduled_exc (must go through notice_issued)
```

### 6.6 Safeguarding State Machine (verify in safeguarding.service.spec.ts)

Terminal status: sealed

**Blocked transitions to verify exist (3 tests):**
```
- sealed -> any (terminal)
- reported -> under_investigation (must go through acknowledged)
- acknowledged -> resolved (must go through under_investigation)
```

---

## 7. RLS Isolation Tests

The release gate test `15-7-rls-verification.spec.ts` already covers all 33+ behaviour tables with the cross-tenant isolation pattern. No additional RLS table-level tests are needed.

However, each **new service test** must include at least one RLS-aware test verifying the service uses `createRlsClient` correctly:

```
Per service (8 services x 1 test = 8 tests):
  - should create RLS client with correct tenant_id before DB operations
```

These are implicitly tested by the mock setup (createRlsClient mock returns the mockRlsTx), but should be explicit:

```typescript
it('should use RLS client scoped to tenant_id', async () => {
  await service.someMethod(TENANT_ID, ...);
  expect(createRlsClient).toHaveBeenCalledWith(
    expect.anything(),
    { tenant_id: TENANT_ID },
  );
});
```

---

## 8. Edge Case & Boundary Tests

Include these in the relevant service test files:

### Numeric Boundaries
```
behaviour-analytics: zero incidents -> all metrics return 0 or empty
behaviour-analytics: getRatio with zero negatives -> no division by zero
behaviour-house: bulkAssign with empty array -> early return { assigned: 0 }
behaviour-students: getStudentPoints with no participation -> total_points=0
behaviour-recognition: getPublicFeed pageSize > 50 -> capped at 50
```

### Null/Missing Data
```
behaviour-quick-log: student with no year_group -> year_group=null
behaviour-students: student with no class_enrolments -> empty scope
behaviour-ai: empty analytics data -> still produces valid AI prompt
behaviour-document-template: unknown document_type -> returns COMMON_MERGE_FIELDS
```

### External Service Failures
```
behaviour-ai: Anthropic API timeout -> ServiceUnavailableException
behaviour-ai: Anthropic API error -> ServiceUnavailableException
behaviour-ai: Anthropic response with no text block -> Error thrown
behaviour-ai: audit log write failure -> does not crash (graceful catch)
```

---

## 9. Acceptance Criteria

### Minimum Test Counts Per File

| File | Min Tests |
|---|---|
| behaviour-interventions.service.spec.ts | 35 |
| behaviour-analytics.service.spec.ts | 40 |
| behaviour-ai.service.spec.ts | 18 |
| behaviour-house.service.spec.ts | 20 |
| behaviour-document-template.service.spec.ts | 16 |
| behaviour-quick-log.service.spec.ts | 12 |
| behaviour-recognition.service.spec.ts | 20 |
| behaviour-students.service.spec.ts | 22 |
| **Service subtotal** | **183** |
| 17 controller spec files (1 test per endpoint) | 209 |
| Blocked-transition supplement tests (across existing files) | 30 |
| **Grand total new tests** | **~422** |

### Quality Gates

1. Every test file passes `turbo test` independently
2. No `any` types in test files
3. Every service method has at least one happy-path test
4. Every state machine has terminal-state blocked-transition tests
5. Every NotFoundException path is tested
6. Every service with SENSITIVE field handling has a stripping test
7. All 17 controller specs have service delegation tests for every endpoint
8. Zero regressions in existing test suite

---

## 10. Parallel Execution Strategy

### Wave 1 (4 parallel sessions, no interdependency)

| Session | Files | Est. Tests | Rationale |
|---|---|---|---|
| A | behaviour-interventions.service.spec.ts | 35 | Standalone, complex state machine |
| B | behaviour-analytics.service.spec.ts | 40 | Standalone, many methods |
| C | behaviour-ai.service.spec.ts + behaviour-document-template.service.spec.ts | 34 | Both small, independent |
| D | behaviour-house.service.spec.ts + behaviour-quick-log.service.spec.ts | 32 | Both small, independent |

### Wave 2 (2 parallel sessions)

| Session | Files | Est. Tests | Rationale |
|---|---|---|---|
| E | behaviour-recognition.service.spec.ts + behaviour-students.service.spec.ts | 42 | Both medium, independent |
| F | Blocked-transition supplement tests across existing service specs | 30 | Touches multiple existing files |

### Wave 3 (4 parallel sessions, controllers)

| Session | Files | Est. Tests |
|---|---|---|
| G | behaviour.controller, behaviour-admin.controller, behaviour-config.controller | 63 |
| H | behaviour-analytics.controller, behaviour-sanctions.controller, behaviour-students.controller | 43 |
| I | behaviour-interventions.controller, behaviour-recognition.controller, behaviour-appeals.controller, behaviour-exclusions.controller | 44 |
| J | behaviour-alerts.controller, behaviour-tasks.controller, safeguarding.controller, behaviour-documents.controller, behaviour-parent.controller, behaviour-amendments.controller, behaviour-guardian-restrictions.controller | 59 |

### Dependencies Between Waves

- Wave 1 and Wave 2 are **independent** -- can run in parallel if enough sessions
- Wave 3 depends on Wave 1+2 being committed (controllers reference service types that should be tested first, but technically the controller tests mock services so there is no code dependency)
- Recommendation: run Wave 1 first, then Wave 2+3 in parallel

---

## 11. File Inventory Summary

### New Files to Create (25 total)

**Service specs (8):**
```
apps/api/src/modules/behaviour/behaviour-interventions.service.spec.ts
apps/api/src/modules/behaviour/behaviour-analytics.service.spec.ts
apps/api/src/modules/behaviour/behaviour-ai.service.spec.ts
apps/api/src/modules/behaviour/behaviour-house.service.spec.ts
apps/api/src/modules/behaviour/behaviour-document-template.service.spec.ts
apps/api/src/modules/behaviour/behaviour-quick-log.service.spec.ts
apps/api/src/modules/behaviour/behaviour-recognition.service.spec.ts
apps/api/src/modules/behaviour/behaviour-students.service.spec.ts
```

**Controller specs (17):**
```
apps/api/src/modules/behaviour/behaviour.controller.spec.ts
apps/api/src/modules/behaviour/behaviour-admin.controller.spec.ts
apps/api/src/modules/behaviour/behaviour-analytics.controller.spec.ts
apps/api/src/modules/behaviour/behaviour-sanctions.controller.spec.ts
apps/api/src/modules/behaviour/behaviour-students.controller.spec.ts
apps/api/src/modules/behaviour/behaviour-interventions.controller.spec.ts
apps/api/src/modules/behaviour/behaviour-recognition.controller.spec.ts
apps/api/src/modules/behaviour/behaviour-appeals.controller.spec.ts
apps/api/src/modules/behaviour/behaviour-exclusions.controller.spec.ts
apps/api/src/modules/behaviour/behaviour-alerts.controller.spec.ts
apps/api/src/modules/behaviour/behaviour-tasks.controller.spec.ts
apps/api/src/modules/behaviour/safeguarding.controller.spec.ts
apps/api/src/modules/behaviour/behaviour-documents.controller.spec.ts
apps/api/src/modules/behaviour/behaviour-parent.controller.spec.ts
apps/api/src/modules/behaviour/behaviour-amendments.controller.spec.ts
apps/api/src/modules/behaviour/behaviour-guardian-restrictions.controller.spec.ts
apps/api/src/modules/behaviour/behaviour-config.controller.spec.ts
```

### Existing Files to Supplement (blocked-transition tests)

```
apps/api/src/modules/behaviour/behaviour.service.spec.ts              (+6 blocked transition tests)
apps/api/src/modules/behaviour/behaviour-sanctions.service.spec.ts    (+5 blocked transition tests)
apps/api/src/modules/behaviour/behaviour-appeals.service.spec.ts      (+4 blocked transition tests)
apps/api/src/modules/behaviour/behaviour-exclusion-cases.service.spec.ts (+3 blocked transition tests)
apps/api/src/modules/behaviour/safeguarding.service.spec.ts           (+3 blocked transition tests)
```

---

## 12. Implementation Notes

### Mock Factories to Reuse

Create factory helpers per service (following the `makeCategory`, `makeStudent`, `makeIncident` pattern from behaviour.service.spec.ts):

- `makeIntervention(overrides?)` -- for interventions service
- `makeReview(overrides?)` -- for intervention reviews
- `makeAnalyticsQuery(overrides?)` -- for analytics service
- `makeHouse(overrides?)` -- for house service
- `makeDocumentTemplate(overrides?)` -- for document template service
- `makePublicationApproval(overrides?)` -- for recognition service

### Services That Use Direct PrismaService (not RLS)

Some services query Prisma directly (not via createRlsClient). These are safe because they are read-only operations with explicit `tenant_id` in the where clause:

- `behaviour-analytics.service.ts` -- direct `this.prisma` for aggregations
- `behaviour-students.service.ts` -- direct `this.prisma` for reads
- `behaviour-quick-log.service.ts` -- direct `this.prisma` for context loading

Mock these with `mockPrisma` pattern (not `mockRlsTx`).

### Services That Use createRlsClient

These must use the `jest.mock('../../common/middleware/rls.middleware')` pattern:

- `behaviour-interventions.service.ts`
- `behaviour-house.service.ts` (bulkAssign only)
- `behaviour-document-template.service.ts`
- `behaviour-recognition.service.ts`

### AI Service Special Handling

- Mock `@anthropic-ai/sdk` at module level
- Mock `ConfigService.get('ANTHROPIC_API_KEY')` to return a test key
- Mock `anonymiseForAI` and `deAnonymiseFromAI` from `@school/shared` if needed, or let them run (they are pure functions)
- Test timeout behavior by making the mock reject with an AbortError
