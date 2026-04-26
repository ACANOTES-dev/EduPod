# Implementation 03 — State Machine Rewrite

> **Wave:** 2 (parallelizable with 02, 04, 05)
> **Depends on:** 01
> **Deploys:** API restart only

---

## Goal

Replace `apps/api/src/modules/admissions/application-state-machine.service.ts` with a new implementation that encodes the state graph from `PLAN.md` §2. The new state machine calls the capacity service (built in parallel under impl 02) to gate every transition that needs a seat check. It must also run the gating check at submission time, not just at review time.

This implementation does NOT handle auto-promotion triggers (those are impl 09) or payment rails (impls 06, 07). It only handles admin-driven state transitions and the initial submission routing.

## State graph (reference)

```
submitted (transient, single transaction) ──► ready_to_admit
                                           │
                                           ├► waiting_list (if no seats)
                                           │
                                           └► waiting_list + awaiting_year_setup
                                              (if target year has zero classes)

ready_to_admit ──► conditional_approval (admin action: Approve)
             ├──► rejected              (admin action: Reject)
             └──► withdrawn             (parent action or admin-on-behalf)

waiting_list  ──► rejected              (admin action, releases seat if any)
             ├──► withdrawn             (parent/admin)
             └──► (nothing else; auto-promotion handled by impl 09)

conditional_approval ──► approved    (impls 06, 07 — payment events)
                     ├──► waiting_list (impl 08 — expiry cron)
                     ├──► rejected    (admin action)
                     └──► withdrawn   (parent/admin)

approved / rejected / withdrawn — terminal
```

## What to build

### 1. Rewrite `application-state-machine.service.ts`

The new file has these public methods:

```ts
@Injectable()
export class ApplicationStateMachineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capacityService: AdmissionsCapacityService,
    private readonly searchIndexService: SearchIndexService,
  ) {}

  /**
   * Called by PublicAdmissionsController and ApplicationsService (for internal
   * admin-created drafts). Runs gating inside one transaction and routes the
   * new application to ready_to_admit / waiting_list / awaiting_year_setup.
   */
  async submit(
    tenantId: string,
    params: {
      formDefinitionId: string;
      targetAcademicYearId: string;
      targetYearGroupId: string;
      payloadJson: Record<string, unknown>;
      submittedByParentId: string | null;
      applyDate: Date; // defaults to now(), passed explicitly for testability
    },
  ): Promise<Application>;

  /**
   * Admin: ready_to_admit → conditional_approval.
   * Re-checks capacity under the same transaction (concurrency guard).
   * Resolves the fee amount via the finance module facade and stamps
   * payment_amount_cents and payment_deadline.
   * Emits a job to notifications/admissions-payment-link processor
   * to generate the Stripe checkout link and email the parent.
   */
  async moveToConditionalApproval(
    tenantId: string,
    applicationId: string,
    actingUserId: string,
  ): Promise<Application>;

  /**
   * Admin rejects from any non-terminal state. Writes rejection_reason.
   * Releases a held seat if the previous state was conditional_approval.
   */
  async reject(
    tenantId: string,
    applicationId: string,
    params: { reason: string; actingUserId: string },
  ): Promise<Application>;

  /**
   * Parent (or admin on their behalf) withdraws from any non-terminal state.
   * Releases a held seat if the previous state was conditional_approval.
   */
  async withdraw(
    tenantId: string,
    applicationId: string,
    params: { actingUserId: string; isParent: boolean },
  ): Promise<Application>;

  /**
   * Called BY IMPL 06/07 (payment rails) and IMPL 09 (admin override path).
   * conditional_approval → approved. Does NOT call the student conversion
   * service directly — that's impl 05's job; this method just flips the state.
   * The caller is responsible for running the conversion within the same
   * transaction.
   */
  async markApproved(
    tenantId: string,
    applicationId: string,
    params: {
      actingUserId: string | null; // null for webhook-driven path
      paymentSource: 'stripe' | 'cash' | 'bank_transfer' | 'override';
      overrideRecordId: string | null;
    },
    db?: PrismaService, // optional transaction client for in-txn calls
  ): Promise<Application>;

  /**
   * Called BY IMPL 08 (cron). conditional_approval → waiting_list.
   * Releases the seat. After the revert, the cron is expected to call
   * the auto-promotion service (impl 09) to pull the next FIFO applicant up.
   */
  async revertToWaitingList(
    tenantId: string,
    applicationId: string,
    reason: 'payment_expired',
    db?: PrismaService,
  ): Promise<Application>;
}
```

### 2. Transition validation

A single `VALID_TRANSITIONS` map at the top of the file:

```ts
const VALID_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ['ready_to_admit', 'waiting_list'], // transient — resolved inside submit()
  waiting_list: ['ready_to_admit', 'rejected', 'withdrawn'],
  ready_to_admit: ['conditional_approval', 'rejected', 'withdrawn'],
  conditional_approval: ['approved', 'waiting_list', 'rejected', 'withdrawn'],
  approved: [], // terminal
  rejected: [], // terminal
  withdrawn: [], // terminal
};
```

Every mutation method asserts the transition is valid before writing. Invalid transitions throw `BadRequestException` with code `INVALID_STATUS_TRANSITION`.

### 3. Submit() routing logic

Inside a single interactive RLS transaction:

1. Create the application row with `status: 'submitted'` as a temporary placeholder (or skip this write and go directly to the final state — preferable, one insert).
2. Call `capacityService.getAvailableSeats(db, { tenantId, academicYearId, yearGroupId })`.
3. Branch:
   - `!configured` → insert with `status: 'waiting_list'`, `waiting_list_substatus: 'awaiting_year_setup'`.
   - `configured && available_seats > 0` → insert with `status: 'ready_to_admit'`.
   - `configured && available_seats === 0` → insert with `status: 'waiting_list'` (no sub-status).
4. Generate the `application_number` using the existing sequence service.
5. Set `apply_date = params.applyDate` (defaults to `now()`, but explicit param lets us deterministic-test).
6. Fire search index job and a notification email job to the parent ("your application has been received").
7. Return the row.

### 4. moveToConditionalApproval() — the important one

This is where the gating re-check matters. Under load, two admins could both click Approve on the last free seat. We must prevent oversubscribing.

Steps inside a single transaction:

1. Load the application with a `SELECT ... FOR UPDATE` lock (use Prisma raw or the interactive transaction's row lock).
2. Assert `status === 'ready_to_admit'`.
3. Assert `target_academic_year_id` and `target_year_group_id` are set.
4. Re-call `capacityService.getAvailableSeats` — this is the concurrency check. If `available_seats === 0`, throw `BadRequestException({ code: 'CAPACITY_EXHAUSTED', message: 'No seats remain in this year group — application stays in Ready to Admit until another is rejected or withdrawn.' })`. The admin sees the error and can choose to reject/withdraw another application first.
5. Call a new helper `resolveFeeAmount(tenantId, academicYearId, yearGroupId)` that delegates to the Finance module (read-only facade) to return the net annual fee for that year group.
6. Apply `tenantSettings.admissions.upfront_percentage` to compute `payment_amount_cents = Math.round(netFeeCents * percentage / 100)`.
7. Set `payment_deadline = now() + tenantSettings.admissions.payment_window_days * 86400 seconds`.
8. UPDATE the application: `status = 'conditional_approval'`, `payment_amount_cents`, `payment_deadline`, `reviewed_at`, `reviewed_by_user_id`.
9. Write an `ApplicationNote` entry: "Moved to Conditional Approval. Seat held. Payment deadline: <date>."
10. Enqueue a `notifications:admissions-payment-link` job with the application ID (impl 06 builds the processor).
11. Return.

### 5. Reject() / Withdraw() seat release

When transitioning from `conditional_approval` → any other state, the seat is implicitly released (the capacity query will no longer count this row). Explicitly write an internal note: "Seat released: now counted as available in year group <name>". No further action needed — the next auto-promotion hook (impl 09) will handle pulling from the waiting list.

### 6. Remove old code paths

Delete the old `submit`, `review`, `withdraw` methods and their private helpers. The existing tests will break — update them minimally to call the new methods or mark as skipped with TODO comments pointing at impls 06/07/08/09 for the tests that depend on things not yet built.

### 7. Fee resolution helper

Do NOT reinvent fee logic. Create a tiny facade:

```ts
// apps/api/src/modules/admissions/finance-fees.facade.ts
@Injectable()
export class FinanceFeesFacade {
  constructor(private readonly feeStructuresService: FeeStructuresService) {}

  async resolveAnnualNetFeeCents(
    tenantId: string,
    academicYearId: string,
    yearGroupId: string,
    db: PrismaService,
  ): Promise<{ amount_cents: number; currency_code: string }> {
    // Look up the active fee structure for this year group
    // Sum academic + mandatory fees
    // Apply any automatic tenant-wide discounts
    // Return as integer cents
  }
}
```

Inject it into the state machine. The facade belongs in the admissions module, not finance — we are a finance consumer.

## Tests

`application-state-machine.service.spec.ts` — rewrite.

- `submit()`:
  - Routes to `ready_to_admit` when seats available.
  - Routes to `waiting_list` when seats exhausted.
  - Routes to `waiting_list` + `awaiting_year_setup` when target year unconfigured.
  - Generates application number correctly.
  - Fires search index + notification jobs.
- `moveToConditionalApproval()`:
  - Happy path: updates status, sets amount_cents, sets deadline.
  - Concurrency guard: simulate two concurrent calls, one throws CAPACITY_EXHAUSTED.
  - Rejects if current status is not `ready_to_admit`.
  - Uses tenant settings for percentage and window.
  - Enqueues the payment-link job.
- `reject()`:
  - Releases seat when coming from `conditional_approval`.
  - Requires rejection reason.
  - Idempotent on already-rejected apps (throws INVALID_STATUS_TRANSITION, does not corrupt state).
- `markApproved()`:
  - Only transitions from `conditional_approval`.
  - Stores payment source + override record id.
- `revertToWaitingList()`:
  - Only transitions from `conditional_approval`.
  - Writes an internal note.

## Deployment

1. Commit locally.
2. Patch → production.
3. Build `@school/api`, restart api.
4. Smoke test: create a dummy application via the existing admin POST endpoint, verify it lands in the right state, then reject it.
5. Update `IMPLEMENTATION_LOG.md`.

## Definition of done

- State machine rewritten and passing its unit tests.
- Capacity check integrated at both submission and conditional-approval transitions.
- Fee resolution facade built and tested.
- API restarted on production.
- Completion record added to the log.

## Notes for downstream implementations

- **06 (Stripe)** will call `markApproved(... paymentSource: 'stripe')` from the webhook handler.
- **07 (cash / bank / override)** will call `markApproved(... paymentSource: 'cash' | 'bank_transfer' | 'override')`.
- **08 (expiry cron)** will call `revertToWaitingList` and then impl 09's promotion helper.
- **09 (auto-promotion)** will flip `waiting_list` → `ready_to_admit` directly via a dedicated method in the auto-promotion service, not through this state machine, because promotion is a batch operation and owning its own transaction is cleaner.
