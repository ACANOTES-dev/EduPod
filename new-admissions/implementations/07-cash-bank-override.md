# Implementation 07 — Cash, Bank Transfer, and Admin Override

> **Wave:** 3 (parallelizable with 06, 08, 09)
> **Depends on:** 01, 03, 05
> **Deploys:** API restart only

---

## Goal

Build the non-Stripe payment paths — cash and bank transfer recording — plus the admin override path for genuine hardship cases. All three paths share the same destination logic (convert to student + mark approved) but differ in how they validate and record the payment. Admin overrides must leave a complete audit trail.

## What to build

### 1. New service — `apps/api/src/modules/admissions/admissions-payment.service.ts`

If a service with this name already exists from the old module, rewrite it. Methods:

```ts
@Injectable()
export class AdmissionsPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversionService: ApplicationConversionService,
    private readonly stateMachine: ApplicationStateMachineService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Records an in-person cash payment against a conditional_approval application.
   * Validates amount meets or exceeds the expected upfront.
   * On success, converts to student and marks approved inside one transaction.
   */
  async recordCashPayment(
    tenantId: string,
    applicationId: string,
    params: {
      actingUserId: string;
      amountCents: number;
      receiptNumber?: string; // if the school prints a physical receipt
      notes?: string;
    },
  ): Promise<{ approved: true; student_id: string }>;

  /**
   * Records a bank transfer payment. Same validation as cash but also captures
   * the transfer reference and date for reconciliation.
   */
  async recordBankTransfer(
    tenantId: string,
    applicationId: string,
    params: {
      actingUserId: string;
      amountCents: number;
      transferReference: string; // the bank's reference, matched against the household number
      transferDate: string; // ISO date
      notes?: string;
    },
  ): Promise<{ approved: true; student_id: string }>;

  /**
   * Admin override — promotes a conditional_approval application to approved
   * WITHOUT a matching payment. Requires a mandatory justification and creates
   * an AdmissionOverride audit row. Only certain roles can use this.
   */
  async forceApproveWithOverride(
    tenantId: string,
    applicationId: string,
    params: {
      actingUserId: string;
      actingUserRoleKeys: string[];
      overrideType: 'full_waiver' | 'partial_waiver' | 'deferred_payment';
      actualAmountCollectedCents: number; // can be 0 for full waiver
      justification: string; // min 20 chars
    },
  ): Promise<{ approved: true; student_id: string; override_id: string }>;
}
```

### 2. Shared transaction template

All three methods follow the same skeleton:

```
interactive transaction:
  lock application row (FOR UPDATE)
  assert status === 'conditional_approval'
  assert tenant settings allow this payment method
  validate amount (or override)
  INSERT AdmissionsPaymentEvent row (idempotency not needed — these are manual actions)
  IF override: INSERT AdmissionOverride row, link application.override_record_id
  CALL conversionService.convertToStudent(...)
  CALL stateMachine.markApproved(...) with appropriate paymentSource
  RETURN { student_id, ... }
```

Extract the shared tail into a private helper to avoid triplication.

### 3. Validation details

**Cash:**

- `actualAmount >= expectedAmount` → proceed.
- `actualAmount < expectedAmount` → throw `PAYMENT_BELOW_THRESHOLD` with a structured error response including `expected_cents` and `received_cents` so the frontend can show "You're €X short — collect the balance or use Admin Override".
- Reject if `tenantSettings.admissions.allow_cash === false`.

**Bank transfer:**

- Same amount validation as cash.
- Reject if `tenantSettings.admissions.allow_bank_transfer === false`.
- `transferReference` is required but not machine-validated against an actual bank statement — admin is attesting they've seen the money. Store for audit.

**Override:**

- Reject if acting user doesn't have `tenantSettings.admissions.require_override_approval_role` or higher. By default: `school_principal` or `school_owner`.
- Reject if `justification.trim().length < 20` with `JUSTIFICATION_TOO_SHORT`.
- The `actual_amount_collected_cents` can be 0 (full waiver) or any positive amount (partial waiver / deferred payment agreement).
- Write a detailed audit log entry in addition to the `AdmissionOverride` row — use the existing `auditLogService.log` pattern with `action: 'admissions_override'`, `entity_type: 'application'`, `entity_id: applicationId`, and `metadata: { override_type, expected_cents, actual_cents, justification }`.

### 4. Controller — `apps/api/src/modules/admissions/admissions-payment.controller.ts`

```ts
@Controller('v1/applications/:id/payment')
@UseGuards(AuthGuard, PermissionGuard)
export class AdmissionsPaymentController {
  constructor(private readonly service: AdmissionsPaymentService) {}

  @Post('cash')
  @RequiresPermission('admissions.manage')
  @HttpCode(HttpStatus.OK)
  async recordCash(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user,
    @Param('id', ParseUUIDPipe) applicationId: string,
    @Body(new ZodValidationPipe(recordCashPaymentSchema)) dto,
  ) {
    return this.service.recordCashPayment(tenant.tenant_id, applicationId, {
      actingUserId: user.id,
      amountCents: dto.amount_cents,
      receiptNumber: dto.receipt_number,
      notes: dto.notes,
    });
  }

  @Post('bank-transfer')
  @RequiresPermission('admissions.manage')
  @HttpCode(HttpStatus.OK)
  async recordBankTransfer(/* ... */) {
    /* ... */
  }

  @Post('override')
  @RequiresPermission('admissions.manage')
  @HttpCode(HttpStatus.OK)
  async forceApproveWithOverride(/* ... */) {
    /* ... */
  }
}
```

### 5. Zod schemas (in `@school/shared`)

```ts
export const recordCashPaymentSchema = z.object({
  amount_cents: z.number().int().positive(),
  receipt_number: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
});

export const recordBankTransferSchema = z.object({
  amount_cents: z.number().int().positive(),
  transfer_reference: z.string().min(1).max(100),
  transfer_date: z.string().datetime(),
  notes: z.string().max(1000).optional(),
});

export const forceApproveOverrideSchema = z.object({
  override_type: z.enum(['full_waiver', 'partial_waiver', 'deferred_payment']),
  actual_amount_collected_cents: z.number().int().nonnegative(),
  justification: z.string().min(20).max(2000),
});
```

### 6. Override audit read endpoint

Since the owner will want to see every override, add a listing endpoint:

```
GET /v1/applications/overrides?page=1&pageSize=20
```

Returns a paginated list of `AdmissionOverride` rows joined with the application + approving user. Permission: `admissions.manage`. Impl 11 or 15 can surface this in the UI later.

### 7. Permission check

`admissions.manage` is the baseline. The override path additionally checks the user's role against `tenantSettings.admissions.require_override_approval_role`. This is a second-level check beyond the permission system — a vice principal might have `admissions.manage` for day-to-day use but not the override role.

## Tests

- `recordCashPayment`:
  - Happy path: exact amount → approved, student created.
  - Happy path: more than expected → approved, excess recorded as note (not treated as credit, no finance-module interaction).
  - Below threshold → throws PAYMENT_BELOW_THRESHOLD with structured details.
  - Application not in `conditional_approval` → INVALID_STATUS.
  - Tenant has `allow_cash: false` → rejected.
  - Cross-tenant leakage test.
- `recordBankTransfer`: same as cash, plus transfer reference required, plus `allow_bank_transfer` gate.
- `forceApproveWithOverride`:
  - Happy path: principal role + valid justification → approved, override row written, audit log entry written.
  - Justification too short → rejected.
  - Wrong role (vice principal when rule requires principal) → rejected.
  - Cannot override from a state other than `conditional_approval`.
- `GET /overrides`: returns tenant-scoped list, pagination works, no cross-tenant leakage.

## Deployment

1. Commit locally.
2. Patch → production.
3. Build `@school/api`, restart api.
4. Smoke test: create a test application in staging tenant, move it to conditional approval manually, then hit the cash endpoint with the expected amount — verify student appears in Students list.
5. Update `IMPLEMENTATION_LOG.md`.

## Definition of done

- `AdmissionsPaymentService` with three methods, tested.
- Controller with three endpoints + override listing endpoint, tested.
- Zod schemas in `@school/shared`.
- Permission + role checks working.
- API restarted on production.
- Completion record added to the log.

## Notes for downstream implementations

- **11 (conditional approval page)** surfaces three buttons: "Record Cash Payment", "Record Bank Transfer", "Force Approve Without Payment". The override button is hidden for users who don't have the required role.
- **12 (application detail page)** links to the override record if one exists.
- **15 (cleanup)** can add a dedicated Overrides log page if time allows.
