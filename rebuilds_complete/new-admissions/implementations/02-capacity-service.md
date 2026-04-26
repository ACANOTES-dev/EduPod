# Implementation 02 — Capacity Service

> **Wave:** 2 (parallelizable with 03, 04, 05)
> **Depends on:** 01
> **Deploys:** API restart only

---

## Goal

Build a single, authoritative service that answers one question reliably under concurrency: **how many open seats does this year group have in this academic year, right now?** Every gating decision in the rebuild must route through this service. No other code is allowed to compute capacity.

## Why this must be its own service

Capacity math is subtle. It must account for three things simultaneously:

1. Sum of `class.max_capacity` across active sections of a (year_group, academic_year) pair.
2. Count of currently-enrolled students in that year group for that academic year.
3. Count of applications in `conditional_approval` targeting the same (year_group, academic_year) — because those seats are held pending payment.

Getting this wrong means the school oversubscribes a class under concurrent approvals. The service is the single place this arithmetic lives so there's one spot to audit, test, and fix.

## What to build

### 1. New service — `apps/api/src/modules/admissions/admissions-capacity.service.ts`

```ts
@Injectable()
export class AdmissionsCapacityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Computes available seats for a (year_group, academic_year) pair.
   * MUST be called inside an active interactive transaction that has
   * already set the tenant RLS context — the caller's transaction client
   * is passed in via `db`.
   */
  async getAvailableSeats(
    db: PrismaService,
    params: {
      tenantId: string;
      academicYearId: string;
      yearGroupId: string;
    },
  ): Promise<{
    total_capacity: number;
    enrolled_student_count: number;
    conditional_approval_count: number;
    available_seats: number;
    configured: boolean; // false if there are zero classes for this (year, year_group)
  }> {
    /* ... */
  }

  /**
   * Batched version — takes a list of (year, year_group) pairs and returns
   * a map. Used by the dashboard and queue pages to avoid N+1 queries.
   */
  async getAvailableSeatsBatch(
    db: PrismaService,
    params: {
      tenantId: string;
      pairs: Array<{ academicYearId: string; yearGroupId: string }>;
    },
  ): Promise<Map<string, AvailableSeatsResult>> {
    /* ... */
  }

  /**
   * Finds the (year_group, academic_year) that a student record belongs to.
   * Helper used by the auto-promotion hooks.
   */
  async getStudentYearGroupCapacity(
    db: PrismaService,
    params: { tenantId: string; studentId: string },
  ): Promise<AvailableSeatsResult | null> {
    /* ... */
  }
}
```

### 2. The actual query

Prefer a single SQL query using `Prisma.sql` (it stays inside the RLS middleware because `createRlsClient` wraps the transaction) over three separate `findMany` calls. Pseudocode:

```sql
WITH capacity AS (
  SELECT COALESCE(SUM(max_capacity), 0)::int AS total
  FROM classes
  WHERE tenant_id = $1
    AND academic_year_id = $2
    AND year_group_id = $3
    AND status = 'active'
),
class_list AS (
  SELECT id FROM classes
  WHERE tenant_id = $1
    AND academic_year_id = $2
    AND year_group_id = $3
    AND status = 'active'
),
enrolled AS (
  SELECT COUNT(DISTINCT ce.student_id)::int AS enrolled
  FROM class_enrolments ce
  WHERE ce.tenant_id = $1
    AND ce.class_id IN (SELECT id FROM class_list)
    AND ce.status = 'active'
),
conditional AS (
  SELECT COUNT(*)::int AS conditional
  FROM applications
  WHERE tenant_id = $1
    AND status = 'conditional_approval'
    AND target_academic_year_id = $2
    AND target_year_group_id = $3
)
SELECT
  capacity.total AS total_capacity,
  enrolled.enrolled AS enrolled_student_count,
  conditional.conditional AS conditional_approval_count,
  GREATEST(0, capacity.total - enrolled.enrolled - conditional.conditional) AS available_seats,
  (capacity.total > 0) AS configured
FROM capacity, enrolled, conditional;
```

Use `db.$queryRaw<T[]>` inside the caller's transaction. This is allowed because the caller has already set the RLS tenant context — the `no-sql-outside-middleware` lint exception is specifically about ad-hoc SQL in services, and here the SQL is confined to this one service file and reviewed.

Alternative — three separate `groupBy` / `count` calls via the Prisma client. Slower but stays within the idiomatic layer. Acceptable if the raw SQL raises reviewer concerns.

### 3. Batched variant

For the dashboard, we need capacity for every (year, year_group) pair at once. Implement `getAvailableSeatsBatch` with a single query using `IN (VALUES ...)` or an array parameter. Returns a `Map<string, AvailableSeatsResult>` keyed by `${academicYearId}:${yearGroupId}`.

### 4. `configured: false` semantics

If `total_capacity === 0`, the tuple is "not configured" — no classes exist for this year group in this academic year. The state machine uses this to decide whether to set `waiting_list_substatus = 'awaiting_year_setup'`.

### 5. Module wiring

Add the service to `AdmissionsModule` providers + exports so other admissions services can inject it.

## Tests

Co-located spec: `admissions-capacity.service.spec.ts`.

Test cases (each one builds a minimal Prisma mock, or — preferred — uses the existing `test/integration/` infrastructure to hit a real Postgres):

- **Empty year group:** no classes → returns `total: 0, configured: false, available: 0`.
- **One class, no students:** capacity 25, students 0, conditional 0 → available 25.
- **Two classes, some students:** capacity 50, students 40, conditional 0 → available 10.
- **Conditional approvals consume seats:** capacity 50, students 40, conditional 5 → available 5.
- **Over-consumed edge case:** capacity 50, students 48, conditional 5 → available 0 (clamped by `GREATEST(0, ...)`).
- **Inactive classes excluded:** archived class doesn't contribute to capacity.
- **Cross-tenant isolation:** data from another tenant does not leak (proves the RLS transaction is working).
- **Batched:** requesting 10 pairs returns a map with 10 entries, order-independent.

Target: 100% line coverage on this file.

## Deployment

1. Commit locally.
2. Patch → production.
3. `pnpm turbo run build --filter=@school/api`.
4. `pm2 restart api --update-env`.
5. Smoke: `curl` the API health endpoint + exercise the existing admissions list endpoint (it doesn't use capacity yet, but restart should be clean).
6. Update `IMPLEMENTATION_LOG.md`.

## Definition of done

- `AdmissionsCapacityService` exists, is registered in the module, exported, and covered by unit tests.
- `pnpm turbo run test --filter=@school/api` passes.
- API restarted on production.
- Completion record added to the log.

## Notes for downstream implementations

- **03 (state machine)** will call `getAvailableSeats` inside its transition transaction when moving applications into `ready_to_admit` / `waiting_list`, and before moving into `conditional_approval` to do a final re-check.
- **09 (auto-promotion)** will batch-query for every waiting-list candidate.
- **10, 11 (dashboard / queue pages)** will use `getAvailableSeatsBatch` to surface capacity chips.
