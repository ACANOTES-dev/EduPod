# Implementation 02 — Household Number Generator + Student Number Refactor

> **Wave:** 2 (parallel-safe with impl 03)
> **Classification:** backend
> **Depends on:** 01
> **Deploys:** API restart only

---

## Goal

Implement the actual household-number generation and hook it into every code path that creates a new `Household` row. Also refactor the student-number generator so that any student created under a household with a `household_number` gets the new `{household_number}-{nn}` format. Students created under legacy households (no `household_number`) continue to receive `STU-NNNNNN`.

This impl is purely in the `households` and `students` module directories. It does NOT touch admissions code — impl 03 handles the admissions pipeline. The separation means impl 02 and impl 03 can run in parallel without shared files.

## Shared files this impl touches

- `apps/api/src/modules/households/households.module.ts` — registers `HouseholdNumberService` in providers and exports it for impl 03 to consume. Edit in the final commit window.
- `apps/api/src/modules/students/students.module.ts` — if the student-number generator is imported from a new service, wire it here.
- `IMPLEMENTATION_LOG.md` — status flips + completion record. Separate commit.

Everything else is this impl's exclusive footprint — `household-number.service.ts`, `households.service.ts`, the student-number code, and their spec files.

## What to build

### Sub-step 1: `HouseholdNumberService`

Create `apps/api/src/modules/households/household-number.service.ts`:

```ts
@Injectable()
export class HouseholdNumberService {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  /**
   * Generates a fresh household number unique within the given tenant, using
   * a retry loop. In a 17.5M code space per tenant, a collision is microscopic,
   * but we still retry up to HOUSEHOLD_NUMBER_GENERATION_MAX_ATTEMPTS times
   * before throwing.
   *
   * Called inside an RLS transaction — pass the tx client in so the SELECT ...
   * EXISTS check runs with the caller's tenant context.
   */
  async generateUniqueForTenant(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
    for (let attempt = 0; attempt < HOUSEHOLD_NUMBER_GENERATION_MAX_ATTEMPTS; attempt++) {
      const candidate = this.randomHouseholdNumber();
      const existing = await tx.household.findFirst({
        where: { tenant_id: tenantId, household_number: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
    }
    throw new InternalServerErrorException({
      code: 'HOUSEHOLD_NUMBER_GENERATION_EXHAUSTED',
      message: `Could not generate a unique household number after ${HOUSEHOLD_NUMBER_GENERATION_MAX_ATTEMPTS} attempts`,
    });
  }

  /**
   * Non-persisting preview — generates a candidate number that LOOKS unused
   * at this instant. Used by the walk-in wizard's "refresh" button to show
   * the parent a number they can expect (not a guarantee — two simultaneous
   * wizards could race and the loser resolves via generateUniqueForTenant at
   * commit time, which will pick a different number).
   *
   * Crucially, this MUST check tenant context via the RLS transaction — do
   * not allow cross-tenant existence checks.
   */
  async previewForTenant(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
    return this.generateUniqueForTenant(tx, tenantId);
  }

  /**
   * Increments a household's student_counter and returns the new counter
   * value. Uses SELECT ... FOR UPDATE so concurrent sibling inserts under
   * the same household serialise and each gets a distinct counter value.
   * Throws HOUSEHOLD_STUDENT_CAP_REACHED if the next value would exceed 99.
   */
  async incrementStudentCounter(
    tx: Prisma.TransactionClient,
    householdId: string,
  ): Promise<number> {
    // Raw FOR UPDATE select — inside the caller's RLS tx.
    // eslint-disable-next-line school/no-raw-sql-outside-rls -- documented exception for row lock
    const rows = await (tx as unknown as { $queryRaw: <T>(q: Prisma.Sql) => Promise<T[]> })
      .$queryRaw<{ student_counter: number }[]>(Prisma.sql`
        SELECT student_counter
        FROM households
        WHERE id = ${householdId}::uuid
        FOR UPDATE
      `);
    const current = rows[0]?.student_counter ?? 0;
    const next = current + 1;
    if (next > HOUSEHOLD_MAX_STUDENTS) {
      throw new BadRequestException({
        code: 'HOUSEHOLD_STUDENT_CAP_REACHED',
        message: `Household has reached the ${HOUSEHOLD_MAX_STUDENTS}-student cap`,
      });
    }
    await tx.household.update({
      where: { id: householdId },
      data: { student_counter: next },
    });
    return next;
  }

  private randomHouseholdNumber(): string {
    // 26³ × 10³ = 17,576,000 addresses per tenant
    const letters = '';
    const digits = '';
    // ... use crypto.randomInt for each character
    return `${letters}${digits}`;
  }
}
```

The `randomHouseholdNumber` implementation uses `crypto.randomInt(0, 26)` per letter and `crypto.randomInt(0, 10)` per digit (from the `node:crypto` module). Do NOT use `Math.random()` — the predictability is a security smell even inside a tenant.

### Sub-step 2: Hook household creation

Find every place that creates a new Household row. Grep targets:

- `apps/api/src/modules/households/households.service.ts` → `create` method
- `apps/api/src/modules/admissions/application-conversion.service.ts` → the new-household-materialisation path (creates a Household when a new-household application is approved)
- `apps/api/src/modules/registration/registration.service.ts` → the walk-in wizard server-side submission

At every one of these sites, inside the caller's RLS `$transaction`, call `HouseholdNumberService.generateUniqueForTenant(tx, tenantId)` and set `household.household_number = <generated>` on the created row.

**Important:** impl 03 may also call this from `ApplicationConversionService`. If impl 03 ships first, they'll import `HouseholdNumberService` from `HouseholdsModule`, so make sure you add it to `exports` in `households.module.ts`.

### Sub-step 3: Student-number generator refactor

Find the code that produces student numbers. Likely targets:

- `apps/api/src/modules/students/students.service.ts` → wherever `student_number` is assigned on insert
- Possibly a shared helper in `apps/api/src/modules/sequences/` or similar

The new branching logic:

```ts
async function generateStudentNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  householdId: string,
): Promise<string> {
  const household = await tx.household.findFirstOrThrow({
    where: { id: householdId, tenant_id: tenantId },
    select: { id: true, household_number: true },
  });

  if (household.household_number) {
    // New path — per-household counter
    const counter = await householdNumberService.incrementStudentCounter(tx, household.id);
    return formatStudentNumberFromHousehold(household.household_number, counter);
  }

  // Legacy path — global tenant sequence (existing code)
  return sequencesService.generateStudentNumber(tx, tenantId);
}
```

Every call site that creates a Student row must flow through this helper. Existing students created in households without a household_number continue to get `STU-NNNNNN`. There is no mixed-format household — once a household has a household_number, ALL new students in it use the new format, and any legacy students stay with their old numbers forever.

### Sub-step 4: Module wiring

Update `apps/api/src/modules/households/households.module.ts`:

```ts
@Module({
  // ...
  providers: [HouseholdsService, HouseholdNumberService],
  exports: [HouseholdsService, HouseholdNumberService],
})
export class HouseholdsModule {}
```

Students module imports `HouseholdsModule` if it doesn't already.

### Sub-step 5: Tests

- `household-number.service.spec.ts`
  - `generateUniqueForTenant` returns a value matching the format regex
  - it retries on collision (mock existing candidate once, assert second attempt succeeds)
  - it throws `HOUSEHOLD_NUMBER_GENERATION_EXHAUSTED` after max attempts
  - `incrementStudentCounter` returns 1 on a fresh household, then 2, then 3
  - `incrementStudentCounter` throws `HOUSEHOLD_STUDENT_CAP_REACHED` when the next value would exceed 99
  - `previewForTenant` tenant-scopes the EXISTS check (cross-tenant probe returns a valid number)

- Integration-level test for `HouseholdsService.create`:
  - new household gets a household_number assigned automatically
  - calling create twice under the same tenant yields two different household_numbers

- Students service test:
  - student created in a household with household_number = `XYZ476` and counter = 0 gets `XYZ476-01`
  - next student under the same household gets `XYZ476-02`
  - student created in a household without household_number gets `STU-NNNNNN` (legacy path still works)
  - 100th student throws `HOUSEHOLD_STUDENT_CAP_REACHED`

## Watch out for

- `SELECT ... FOR UPDATE` inside an interactive Prisma transaction is the correct pattern for the counter row lock. Do not try to use Prisma's `.update` alone for the increment — two concurrent sibling inserts could read stale counter values and produce duplicates.
- The CHECK constraint on `households.household_number` is a belt-and-braces guard. Your generator should always produce matching values, but the constraint will reject anything that slips through.
- The student-number branching must be inside the same transaction that inserts the Student row. Otherwise the counter increment and the Student insert can commit separately and drift out of sync under failure.
- Walk-in wizard's `registration.service.ts` likely creates households with a flat `prisma.household.create({...})` call. You need to wrap that path in a transaction if it's not already, so the counter lock is available.
- `crypto.randomInt` throws on invalid ranges — guard the input (26 and 10 are fine; just don't hand-roll the range math).
- Be careful not to regenerate a household number on update. The number is immutable once assigned — `HouseholdsService.update` must not overwrite it.

## Deployment notes

1. Commit code by sub-step — at least one commit per sub-step.
2. Patch → prod → API build → API restart.
3. Smoke test via the walk-in wizard:
   - Create a new household via `/households/new`
   - Open the detail page, confirm it shows a household_number in the format `AAA000`
   - Create a student under that household, confirm student_number is `{hh}-01`
   - Create a second student, confirm it's `{hh}-02`
4. DO NOT touch the 210 existing students. They must still return `STU-NNNNNN` for any follow-up creates (the legacy path).
5. Flip log to completed in separate commit.
