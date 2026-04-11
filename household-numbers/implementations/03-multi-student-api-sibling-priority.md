# Implementation 03 — Multi-Student API + Sibling Priority + Public Household Lookup

> **Wave:** 2 (parallel-safe with impl 02)
> **Classification:** backend
> **Depends on:** 01
> **Deploys:** API restart only

---

## Goal

Rewrite the public admissions create path to accept one or many students in a single submission, link each new Application row to a household (either existing or to-be-materialised), and compute the `is_sibling_application` flag at submission time. Add a tiered-FIFO sort to `AdmissionsAutoPromotionService.promoteYearGroup` so siblings auto-promote from the waiting list ahead of non-siblings. Ship a new `POST /v1/public/households/lookup` endpoint that accepts a household number + parent email and returns the household name + active student count on double-match.

This impl runs in the `admissions` + new `public-households` module directories. It does NOT touch `households` or `students` module code — impl 02 owns that. The separation means 02 and 03 run in parallel safely.

## Shared files this impl touches

- `apps/api/src/modules/admissions/admissions.module.ts` — imports `HouseholdsModule` (for `HouseholdNumberService`), registers the new `PublicHouseholdsModule`. Edit in the final commit window.
- `apps/api/src/app.module.ts` — wires the new `PublicHouseholdsModule` into the app graph. Edit in the final commit window.
- `apps/api/src/common/middleware/tenant-resolution.middleware.ts` — add `/v1/public/households/*` to the slug-header fallback list (same pattern as `/v1/public/admissions/*`). Edit in the final commit window.
- `apps/api/src/api-surface.snapshot.json` — refresh after adding the new controller route. Edit in the final commit window.
- `IMPLEMENTATION_LOG.md` — status flips + completion record. Separate commit.

Everything else is this impl's exclusive footprint.

## What to build

### Sub-step 1: `PublicHouseholdsService` + controller

Create `apps/api/src/modules/public-households/public-households.service.ts`:

```ts
@Injectable()
export class PublicHouseholdsService {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly rateLimit: PublicHouseholdsRateLimitService,
  ) {}

  async lookupByNumberAndEmail(
    tenantId: string,
    tenantSlug: string,
    dto: PublicHouseholdLookupDto,
    clientIp: string,
  ): Promise<PublicHouseholdLookupResult> {
    // 1. Rate limit
    const limit = await this.rateLimit.consume(tenantId, clientIp);
    if (!limit.allowed) {
      throw new ForbiddenException({
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many lookup attempts. Please try again later.',
      });
    }

    // 2. Single query — load household by number within tenant, filter join
    //    parents by email. Return NOT_FOUND if either half fails. DO NOT
    //    return different error codes for the two failure modes.
    return runWithRlsContext(this.prisma, { tenant_id: tenantId }, async (tx) => {
      const household = await tx.household.findFirst({
        where: {
          tenant_id: tenantId,
          household_number: dto.household_number,
          parents: {
            some: {
              email: { equals: dto.parent_email, mode: 'insensitive' },
            },
          },
        },
        select: {
          id: true,
          household_number: true,
          name: true,
          _count: {
            select: { students: { where: { status: 'active' } } },
          },
        },
      });

      if (!household || !household.household_number) {
        throw new NotFoundException({
          code: 'HOUSEHOLD_NOT_FOUND',
          message: 'No household matches the number and email you provided.',
        });
      }

      return {
        household_id: household.id,
        household_number: household.household_number,
        household_name: household.name,
        active_student_count: household._count.students,
      };
    });
  }
}
```

Create `public-households.controller.ts`:

```ts
@Controller('v1/public/households')
export class PublicHouseholdsController {
  constructor(private readonly service: PublicHouseholdsService) {}

  @Post('lookup')
  async lookup(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(publicHouseholdLookupSchema))
    dto: PublicHouseholdLookupDto,
    @Req() req: Request,
  ) {
    return this.service.lookupByNumberAndEmail(
      tenant.tenant_id,
      dto.tenant_slug,
      dto,
      this.extractClientIp(req),
    );
  }

  private extractClientIp(req: Request): string {
    // Same pattern as PublicAdmissionsController — prefer cf-connecting-ip
    const cfIp = req.headers['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp.trim()) return cfIp.trim();
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string') return fwd.split(',')[0]?.trim() ?? 'unknown';
    return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  }
}
```

Rate limit service — dedicated key namespace, 5 attempts per IP per hour per tenant (higher cost than the admissions submission bucket because each attempt here is a guess at a household). Copy the existing `AdmissionsRateLimitService` structure.

Key format: `ratelimit:public-household-lookup:{tenantId}:{ip}`

Create `public-households.module.ts` and wire it into `AppModule`.

### Sub-step 2: Tenant resolution middleware update

Edit `apps/api/src/common/middleware/tenant-resolution.middleware.ts` — add `/api/v1/public/households/*` to the list of paths that accept `X-Tenant-Slug` header-based tenant resolution (same treatment as the existing `/api/v1/public/admissions/*` routes).

### Sub-step 3: Rewrite `ApplicationsService.createPublic`

The new signature:

```ts
async createPublic(
  tenantId: string,
  dto: CreatePublicApplicationDto,
  clientIp: string,
): Promise<{
  mode: 'new_household' | 'existing_household';
  submission_batch_id: string;
  household_number: string | null;
  applications: Array<{
    id: string;
    application_number: string;
    status: ApplicationStatus;
    student_first_name: string;
    student_last_name: string;
    target_year_group_id: string;
    target_year_group_name: string;
  }>;
}>
```

Logic:

```
1. Rate limit (existing AdmissionsRateLimitService).
2. Fetch the form definition (authoritative field set).
3. Validate the payload against the form's required-field list.
   - Old validator ran over a single payload_json. New validator runs over
     the union of household_payload + each student's fields, since different
     canonical keys live in different buckets now.
4. Generate a submission_batch_id = randomUUID().
5. Inside one RLS transaction:
   a. If mode = 'existing_household':
      - Load household by existing_household_id, verify tenant_id match and
        household_number IS NOT NULL. If not, throw HOUSEHOLD_NOT_FOUND.
      - is_sibling = (household has ≥1 active student) — computed via
        SELECT EXISTS(SELECT 1 FROM students WHERE household_id = ... AND status='active')
      - household_id_for_apps = household.id
      - household_number_for_response = household.household_number
   b. If mode = 'new_household':
      - is_sibling = false (no existing household = no siblings by definition)
      - household_id_for_apps = NULL
      - household_number_for_response = null (not yet assigned — materialised on first approval)
      - household_payload is serialised into EACH application's payload_json
        so the conversion service can materialise the household later
   c. For each student in dto.students:
      - Resolve fees via existing fee-structure facade (needed for the
        conditional approval amount, computed server-side per student)
      - Insert Application row:
        {
          form_definition_id,
          student_first_name: student.first_name,
          student_last_name: student.last_name,
          date_of_birth: student.date_of_birth,
          target_academic_year_id: student.target_academic_year_id,
          target_year_group_id: student.target_year_group_id,
          payload_json: { ...household_payload (shared), ...student fields, consents },
          household_id: household_id_for_apps,
          submission_batch_id,
          is_sibling_application: is_sibling,
          status: 'submitted',
          apply_date: now,
        }
      - Run ApplicationStateMachineService.submit(tx, row.id) — gates and
        routes each row to ready_to_admit / waiting_list / waiting_list +
        awaiting_year_setup independently
6. Return the summary envelope.
```

Key decisions to flag in code comments:

- Each student's application runs the gate independently. That means in ONE submission you can have 2 apps land in `ready_to_admit` and 1 in `waiting_list` because the year groups are different or capacity is asymmetric.
- `is_sibling_application` is a SNAPSHOT at submission time. It is NOT re-evaluated if the source students' statuses change later.
- For `new_household` mode, `household_payload` is duplicated onto every application in the batch (because the household doesn't exist yet, and we need the parent/address data available on each Application for conversion-time materialisation). Yes it's redundant data — the trade-off is avoiding a phantom Household row for never-approved batches.

### Sub-step 4: Tiered FIFO in auto-promotion

Edit `apps/api/src/modules/admissions/admissions-auto-promotion.service.ts`.

Current `promoteYearGroup` query:

```sql
SELECT id FROM applications
WHERE tenant_id = $1
  AND target_academic_year_id = $2
  AND target_year_group_id = $3
  AND status = 'waiting_list'
  AND (waiting_list_substatus IS NULL OR waiting_list_substatus != 'awaiting_year_setup')
ORDER BY apply_date ASC
FOR UPDATE SKIP LOCKED
LIMIT $4
```

New query:

```sql
SELECT id FROM applications
WHERE tenant_id = $1
  AND target_academic_year_id = $2
  AND target_year_group_id = $3
  AND status = 'waiting_list'
  AND (waiting_list_substatus IS NULL OR waiting_list_substatus != 'awaiting_year_setup')
ORDER BY is_sibling_application DESC, apply_date ASC
FOR UPDATE SKIP LOCKED
LIMIT $4
```

`ORDER BY is_sibling_application DESC, apply_date ASC` puts `true` (siblings) first, then `apply_date` within each tier. This matches the tiered-FIFO semantics exactly.

No other auto-promotion method changes — `onClassAdded` and `onYearGroupActivated` both delegate to `promoteYearGroup`, so the tiered sort propagates automatically.

### Sub-step 5: Conversion service — batch household materialisation

Edit `apps/api/src/modules/admissions/application-conversion.service.ts`.

The `convertToStudent` method currently:

1. Loads the application
2. Parses the `payload_json` for parent/address data
3. Either finds or creates a household, then links the Student into it

New behaviour:

- If `application.household_id IS NOT NULL`: the household already exists. Load it, increment its `student_counter` via `HouseholdNumberService.incrementStudentCounter`, use the returned counter to assemble the student number, insert the Student row linked to the household.
- If `application.household_id IS NULL` (new-household batch, first approval): materialise the household now. Generate a household_number via `HouseholdNumberService.generateUniqueForTenant`. Create the Household row. Then for EVERY other application with the same `submission_batch_id` and `household_id IS NULL`, set their `household_id` to the newly created household. (This way the second approval in the batch finds `household_id` already set and takes the "existing household" branch.) Insert the Student under the new household with counter=1.
- Always: use `formatStudentNumberFromHousehold(household.household_number, counter)` to assemble the final student number.

The materialisation must run inside the caller's RLS transaction (same one that advances the Application state). Do not fan out into a separate transaction — the failure modes are worse than the complexity saved.

### Sub-step 6: Submit state machine update

Edit `apps/api/src/modules/admissions/application-state-machine.service.ts`.

`submit(tx, applicationId)` currently reads the application, runs the capacity gate, and routes to `ready_to_admit` / `waiting_list` / `waiting_list + awaiting_year_setup`. No changes to the routing logic — the sibling-priority tier only matters at promotion time, not at the initial gate.

BUT the old `submit` also CREATED the application row (because the old single-student path bundled creation + transition into one call). In the new shape, `ApplicationsService.createPublic` creates the row and then calls `submit` to transition it. Split the responsibilities: `submit` no longer creates rows. It transitions an existing `submitted` row into the next state. This is cleaner and makes the multi-student create path easier to reason about.

If there is a legacy test that assumed `submit` creates the row, update it.

### Sub-step 7: Tests

- `public-households.service.spec.ts`
  - happy path: matching number + email returns the household
  - number matches but email doesn't → 404 HOUSEHOLD_NOT_FOUND (not a 403 or 401, not a different code)
  - email matches but number doesn't → 404 HOUSEHOLD_NOT_FOUND (same code)
  - cross-tenant attempt → 404 (tenant scoping)
  - rate limit exceeded → 403
  - case-insensitive email match
- `applications.service.spec.ts` (rewrite/extend)
  - createPublic new_household mode: single student → one Application, household_id=null, batch_id set, is_sibling=false
  - createPublic new_household mode: three students → three Applications, all share submission_batch_id, all is_sibling=false
  - createPublic existing_household mode with active siblings → three Applications, household_id set, is_sibling=true
  - createPublic existing_household mode with household that has only withdrawn students → is_sibling=false
  - createPublic rejects existing_household_id from a different tenant
  - each student's application runs through the gate independently (mocked capacity service)
- `admissions-auto-promotion.service.spec.ts` (extend)
  - promoteYearGroup with 2 siblings + 2 non-siblings all in waiting_list, capacity frees 2: returns the 2 siblings
  - promoteYearGroup with 1 sibling (apply_date=later) + 1 non-sibling (apply_date=earlier), capacity frees 1: returns the sibling
  - FIFO still holds within a tier: 2 siblings, older apply_date wins

## Watch out for

- The Postgres index `idx_applications_auto_promotion_tiered` (from impl 01) already specifies `is_sibling_application DESC, apply_date ASC`. Your `ORDER BY` must match exactly or the planner won't use it.
- `runWithRlsContext` vs `createRlsClient.$transaction`: use whichever pattern the module already uses. Don't mix them in one service.
- The `parents` relation check on `Household` must be case-insensitive. Postgres `ILIKE` doesn't compare equality — use Prisma's `equals` + `mode: 'insensitive'` or `LOWER()` on both sides.
- The new `HOUSEHOLD_NOT_FOUND` response for the lookup endpoint must be a 404 — not a 400 and not a 200 with `{exists: false}`. A 404 is the weakest privacy signal.
- Do not expose the rate-limit counter to the client. The failing response says "too many lookup attempts" with no remaining count.
- If the lookup rate limit is hit by a legitimate user, they're locked out for up to 60 minutes. Document this for the frontend copy (impl 04).
- Sequencing: you can ship impl 03 before impl 02. The `ApplicationConversionService` changes in impl 03 import `HouseholdNumberService` from `HouseholdsModule` which exists today but gains its new methods in impl 02. If you deploy impl 03 without impl 02, the import will resolve but the `incrementStudentCounter` method won't exist and conversion will throw at runtime. So: the DEPLOY order is impl 02 before impl 03 even though they can be CODED in parallel.

## Deployment notes

1. Commit by sub-step.
2. Patch → prod → API build → API restart.
3. Pre-deploy serialisation: if impl 02 is `deploying`, wait per Rule 6b.
4. Smoke test:
   - `curl POST /api/v1/public/households/lookup` with bogus data → 404
   - `curl POST /api/v1/public/admissions/applications` with new multi-student shape → either 201 (if authenticated as expected) or the Zod 400
   - Startup logs show `PublicHouseholdsController` and the existing admissions routes mapped
5. Flip log to `completed` in a separate commit.
