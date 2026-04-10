# Implementation 09 — Auto-Promotion Hooks

> **Wave:** 3 (parallelizable with 06, 07, 08)
> **Depends on:** 01, 02, 03
> **Deploys:** API restart only

---

## Goal

Build the auto-promotion service that pulls waiting-list applications into `ready_to_admit` FIFO when capacity opens up. Wire three triggers:

1. **A new class is added to an existing year group** (via the Classes create endpoint). Promote as many waiting-list applications as fit into the newly opened seats, ordered by `apply_date ASC`.
2. **The first class is created for a year group in a future academic year** (previously unconfigured). Drop the `awaiting_year_setup` sub-status from every matching application and re-run the gate.
3. **A conditional-approval application is released** (rejection, withdrawal, expiry). The releasing code path (state machine methods + expiry cron) also runs a promotion pass for the affected year group.

## What to build

### 1. New service — `apps/api/src/modules/admissions/admissions-auto-promotion.service.ts`

```ts
@Injectable()
export class AdmissionsAutoPromotionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacityService: AdmissionsCapacityService,
    private readonly searchIndexService: SearchIndexService,
  ) {}

  /**
   * Hook: called by ClassesService after a new class is persisted.
   * Runs inside the caller's transaction (db passed through).
   * Promotes as many waiting-list applications as fit.
   */
  async onClassAdded(
    db: PrismaService,
    params: {
      tenantId: string;
      classId: string;
    },
  ): Promise<PromotionResult>;

  /**
   * Hook: called when the first active class is created for a
   * (year_group, academic_year) pair that previously had zero classes.
   * Scans applications with waiting_list_substatus = 'awaiting_year_setup'
   * matching the pair, drops the substatus, and runs a normal promotion.
   */
  async onYearGroupActivated(
    db: PrismaService,
    params: {
      tenantId: string;
      academicYearId: string;
      yearGroupId: string;
    },
  ): Promise<PromotionResult>;

  /**
   * Generic promotion pass — called by state machine revert paths and
   * by both hooks above. Does NOT create its own transaction — caller
   * owns the transaction.
   */
  async promoteYearGroup(
    db: PrismaService,
    params: {
      tenantId: string;
      academicYearId: string;
      yearGroupId: string;
    },
  ): Promise<PromotionResult>;
}

interface PromotionResult {
  promoted_count: number;
  promoted_application_ids: string[];
  remaining_seats: number;
}
```

### 2. `promoteYearGroup` — the core logic

```
1. Call capacityService.getAvailableSeats(...) for the pair.
2. If available_seats === 0, return { promoted_count: 0, ... }.
3. Query applications:
     WHERE tenant_id = X
       AND status = 'waiting_list'
       AND waiting_list_substatus IS NULL  -- awaiting_year_setup is handled separately
       AND target_academic_year_id = X
       AND target_year_group_id = X
     ORDER BY apply_date ASC
     LIMIT available_seats
     FOR UPDATE SKIP LOCKED  -- concurrency safe
4. For each application:
     - UPDATE status = 'ready_to_admit'
     - Write an internal note: "Auto-promoted from waiting list (seat opened in year group X)"
     - Fire search index job
     - Fire notification job to the parent: "your application is now being reviewed"
5. Return the list.
```

The `FOR UPDATE SKIP LOCKED` pattern prevents two concurrent promotion passes from promoting the same application.

### 3. `onClassAdded` logic

```
1. Load the new class to get its (academic_year_id, year_group_id).
2. Call promoteYearGroup with that pair.
3. Return result.
```

### 4. `onYearGroupActivated` logic

This is called when a `(academic_year, year_group)` pair transitions from "zero classes" to "at least one class". Detection happens in the classes service (see hook wiring below).

```
1. Query applications:
     WHERE tenant_id = X
       AND status = 'waiting_list'
       AND waiting_list_substatus = 'awaiting_year_setup'
       AND target_academic_year_id = X
       AND target_year_group_id = X
     ORDER BY apply_date ASC
     FOR UPDATE
2. For each application:
     - Drop the substatus (set to null)
     - Leave status as 'waiting_list' for now
3. Call promoteYearGroup with the same pair — applications are now
   eligible for promotion by the normal logic.
4. Return result.
```

### 5. Hook wiring in `classes.service.ts`

```ts
// apps/api/src/modules/classes/classes.service.ts — modify create()

async create(tenantId: string, dto: CreateClassDto) {
  const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

  return rlsClient.$transaction(async (tx) => {
    const db = tx as unknown as PrismaService;

    // Detect if this will be the first active class for the (year, year_group) pair
    const existingClasses = await db.class.count({
      where: {
        tenant_id: tenantId,
        academic_year_id: dto.academic_year_id,
        year_group_id: dto.year_group_id,
        status: 'active',
      },
    });
    const isFirstForPair = existingClasses === 0;

    // ... existing creation logic ...
    const newClass = await db.class.create({ data: { ... } });

    // Auto-promotion hooks
    if (isFirstForPair) {
      await this.autoPromotionService.onYearGroupActivated(db, {
        tenantId,
        academicYearId: dto.academic_year_id,
        yearGroupId: dto.year_group_id,
      });
    } else {
      await this.autoPromotionService.onClassAdded(db, {
        tenantId,
        classId: newClass.id,
      });
    }

    return newClass;
  });
}
```

Inject `AdmissionsAutoPromotionService` into `ClassesService`. This creates a cross-module dependency from classes → admissions. That's the opposite of usual (classes is lower in the dependency graph than admissions), so there is a small module wiring challenge:

**Option A:** Import `AdmissionsModule` in `ClassesModule`. Risk of circular dependency if admissions imports classes for something. Verify no circular dep before landing.

**Option B:** Event-driven via BullMQ. `ClassesService.create` enqueues a `classes:created` job; `AdmissionsAutoPromotionProcessor` consumes it asynchronously. Pros: no cross-module coupling. Cons: eventually consistent — a parent applying the instant after a class is created might still get waiting-listed for a few seconds.

**Recommendation:** go with Option A for simplicity. Document it in `docs/architecture/module-blast-radius.md`. If a circular dep emerges, switch to Option B. The hook is a small, localised call.

### 6. Hook wiring for state machine releases

In `application-state-machine.service.ts` (already rewritten in impl 03), call `autoPromotionService.promoteYearGroup` at the end of `reject()`, `withdraw()`, and `revertToWaitingList()` when the previous state was `conditional_approval`. This is the seat-release propagation.

Inject `AdmissionsAutoPromotionService` into the state machine. Same module.

### 7. Race condition note

When `promoteYearGroup` runs inside the same transaction as the seat-releasing action, the capacity check will correctly see the freed seat (the release UPDATE is visible to subsequent queries in the same transaction). This is why we require the caller to pass their transaction client.

### 8. Notifications

When an application is auto-promoted to `ready_to_admit`, fire a notification to the parent: "Good news — a seat has opened up and your application is now being reviewed". Template key: `admissions.auto_promoted`. Uses the existing notifications infrastructure; do not build a new one.

## Tests

- `promoteYearGroup`:
  - No seats available → no promotion.
  - 5 seats, 10 waiting → promotes 5 in FIFO order.
  - 5 seats, 3 waiting → promotes 3.
  - Concurrent calls don't double-promote (use the SKIP LOCKED test pattern).
  - Ignores `awaiting_year_setup` applications.
- `onClassAdded`:
  - New class → promotes from waiting list.
  - When calling with a class in a year group that has no waiting list → no-op.
- `onYearGroupActivated`:
  - Drops substatus from matching applications.
  - Then promotes FIFO.
  - Does not touch other year groups.
- Integration: full flow through `classes.service.create` → verify application auto-promoted.
- State machine releases: reject a conditional_approval app → verify next FIFO app auto-promotes.

## Deployment

1. Commit locally.
2. Patch → production.
3. Build `@school/api`, restart api.
4. Smoke test:
   - In staging, create a test waiting-list application.
   - Create a new class in the target year group with max capacity that exposes at least one free seat.
   - Verify the application auto-promoted (check status in DB or UI).
5. Update `IMPLEMENTATION_LOG.md`.

## Definition of done

- `AdmissionsAutoPromotionService` built and unit-tested.
- Hooks wired in `ClassesService.create` + state machine release methods.
- No circular dependency issues.
- `docs/architecture/module-blast-radius.md` updated.
- API restarted on production.
- Completion record added to the log.

## Notes for downstream implementations

- **10, 11 (dashboard + queue pages)** will visibly benefit from live auto-promotion — waiting-list counts drop, ready-to-admit counts rise, without any admin action.
- **12 (application detail page)** should show the internal note explaining auto-promotion.
- **15 (operations hub card)** pulls a live count of `ready_to_admit` applications, which naturally updates as auto-promotion fires.
