# Implementation 06 — Stripe Checkout + Webhook

> **Wave:** 3 (parallelizable with 07, 08, 09)
> **Depends on:** 01, 03, 05
> **Deploys:** API + worker restart (API for checkout session + webhook branch, worker for the payment-link email job)

---

## Goal

Wire the payment leg of the gated flow. When an application moves to `conditional_approval`, the system must (1) create a Stripe Checkout Session for exactly the required upfront amount, (2) email the parent a link to that session, (3) receive Stripe's webhook when the parent pays, (4) verify amount/tenant/idempotency, (5) convert the application to a student and mark it approved — all atomically.

## Reuse, don't rebuild

The project already has a mature Stripe integration in `apps/api/src/modules/finance/stripe.service.ts` with:

- Per-tenant encrypted API keys via `tenantStripeConfig` + `encryption.service`.
- Circuit breaker wrapping every outbound Stripe call (`CircuitBreakerRegistry`).
- Webhook signature verification via `stripe.webhooks.constructEvent`.
- Idempotency via `external_event_id` on the `Payment` table.
- A `handleCheckoutCompleted` branch handling the `invoice` use case.

**We do not create a new Stripe service.** We add an admissions branch to the existing one.

## What to build

### 1. Extend `StripeService` with an admissions checkout method

```ts
// apps/api/src/modules/finance/stripe.service.ts — add new method

async createAdmissionsCheckoutSession(
  tenantId: string,
  applicationId: string,
  successUrl: string,
  cancelUrl: string,
): Promise<{ session_id: string; checkout_url: string }> {
  const application = await this.prisma.application.findFirst({
    where: { id: applicationId, tenant_id: tenantId },
  });
  if (!application) {
    throw new NotFoundException({ code: 'APPLICATION_NOT_FOUND', message: `Application with id "${applicationId}" not found` });
  }
  if (application.status !== 'conditional_approval') {
    throw new BadRequestException({ code: 'INVALID_STATUS', message: `Cannot create checkout for application with status "${application.status}"` });
  }
  if (!application.payment_amount_cents || application.payment_amount_cents <= 0) {
    throw new BadRequestException({ code: 'NO_PAYMENT_AMOUNT', message: 'Application has no payment amount set' });
  }

  const stripe = await this.getStripeClient(tenantId);

  const session = await this.circuitBreaker.exec('stripe', () =>
    stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: (application.currency_code ?? 'EUR').toLowerCase(),
            unit_amount: application.payment_amount_cents, // LOCKED
            product_data: {
              name: `Admission fee — application ${application.application_number}`,
              description: `Upfront admission payment for ${application.student_first_name} ${application.student_last_name}`,
            },
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      expires_at: Math.floor(application.payment_deadline!.getTime() / 1000),
      metadata: {
        purpose: 'admissions',
        tenant_id: tenantId,
        application_id: applicationId,
        expected_amount_cents: application.payment_amount_cents.toString(),
      },
    }),
  );

  // Persist the session id so we can regenerate the link if needed
  await this.prisma.application.update({
    where: { id: applicationId },
    data: { stripe_checkout_session_id: session.id },
  });

  return { session_id: session.id, checkout_url: session.url ?? successUrl };
}
```

Key details:

- `unit_amount` is taken server-side from `application.payment_amount_cents`. The parent cannot alter it.
- `expires_at` matches the application's payment deadline — if the window is 7 days, the Stripe session also expires in 7 days. If the parent comes back after the window, the link is dead and they have to ask the school for a new one.
- `metadata.purpose = 'admissions'` is the branch discriminator the webhook uses.
- Amount is also stored in metadata for defence in depth — the webhook will re-verify.

### 2. Extend the webhook handler with an admissions branch

```ts
// stripe.service.ts — modify handleWebhook

switch (event.type) {
  case 'checkout.session.completed': {
    const session = event.data.object as Stripe.Checkout.Session;
    const purpose = session.metadata?.purpose;

    if (purpose === 'admissions') {
      await this.handleAdmissionsCheckoutCompleted(tenantId, event.id, session);
    } else {
      // Existing invoice flow
      await this.handleCheckoutCompleted(tenantId, session);
    }
    break;
  }
  case 'checkout.session.expired': {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.purpose === 'admissions') {
      this.logger.log(
        `Admissions checkout session expired: ${session.id} — cron will handle revert`,
      );
      // Nothing to do — the payment expiry cron (impl 08) handles the state revert.
    }
    break;
  }
  // ... rest unchanged
}
```

### 3. New method — `handleAdmissionsCheckoutCompleted`

```ts
private async handleAdmissionsCheckoutCompleted(
  tenantId: string,
  eventId: string,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const applicationId = session.metadata?.application_id;
  const expectedCentsStr = session.metadata?.expected_amount_cents;

  if (!applicationId || !expectedCentsStr) {
    this.logger.warn(`admissions checkout.session.completed missing metadata: ${session.id}`);
    return;
  }

  const expectedCents = parseInt(expectedCentsStr, 10);
  const actualCents = session.amount_total ?? 0;

  const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

  await rlsClient.$transaction(async (tx) => {
    const db = tx as unknown as PrismaService;

    // Idempotency — already processed this event?
    const existing = await db.admissionsPaymentEvent.findUnique({
      where: { stripe_event_id: eventId },
    });
    if (existing) {
      this.logger.log(`Duplicate admissions event ${eventId} — skipping`);
      return;
    }

    // Load application with row lock
    const application = await db.application.findFirst({
      where: { id: applicationId, tenant_id: tenantId },
    });
    if (!application) {
      this.logger.error(`Admissions webhook: application ${applicationId} not found for tenant ${tenantId}`);
      throw new NotFoundException({ code: 'APPLICATION_NOT_FOUND', message: '...' });
    }

    // Defence-in-depth amount check
    if (application.payment_amount_cents !== expectedCents) {
      this.logger.error(`Admissions webhook: metadata expected ${expectedCents} but application stored ${application.payment_amount_cents}`);
      throw new BadRequestException({ code: 'AMOUNT_MISMATCH_METADATA', message: '...' });
    }
    if (actualCents !== expectedCents) {
      this.logger.error(`Admissions webhook: Stripe actual ${actualCents} but expected ${expectedCents}`);
      throw new BadRequestException({ code: 'AMOUNT_MISMATCH_ACTUAL', message: '...' });
    }
    if (application.status !== 'conditional_approval') {
      this.logger.warn(`Admissions webhook: application ${applicationId} is in status ${application.status}, not conditional_approval — ignoring`);
      // Either already approved (idempotency) or reverted. Record the event but don't mutate.
      await db.admissionsPaymentEvent.create({
        data: {
          tenant_id: tenantId,
          application_id: applicationId,
          stripe_event_id: eventId,
          stripe_session_id: session.id,
          amount_cents: actualCents,
          status: 'received_out_of_band',
        },
      });
      return;
    }

    // Create the payment event record (idempotency key)
    await db.admissionsPaymentEvent.create({
      data: {
        tenant_id: tenantId,
        application_id: applicationId,
        stripe_event_id: eventId,
        stripe_session_id: session.id,
        amount_cents: actualCents,
        status: 'succeeded',
      },
    });

    // Convert application → student
    await this.conversionService.convertToStudent(db, { tenantId, applicationId });

    // Flip application status to approved
    await this.stateMachine.markApproved(
      tenantId,
      applicationId,
      { actingUserId: null, paymentSource: 'stripe', overrideRecordId: null },
      db,
    );
  });
}
```

### 4. New table — `admissions_payment_events`

This is the idempotency ledger for admissions-specific payment events. It mirrors the `Payment.external_event_id` pattern but is scoped to admissions so it doesn't collide with invoice payment logic.

Add to the Prisma schema (yes, this is a small migration inside wave 3 — add it to impl 01's follow-up if 01 hasn't deployed yet, otherwise land it here):

```prisma
model AdmissionsPaymentEvent {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id         String   @db.Uuid
  application_id    String   @db.Uuid
  stripe_event_id   String   @unique @db.VarChar(255)
  stripe_session_id String?  @db.VarChar(255)
  amount_cents      Int
  status            AdmissionsPaymentEventStatus
  created_at        DateTime @default(now()) @db.Timestamptz()

  tenant      Tenant      @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  application Application @relation(fields: [application_id], references: [id], onDelete: Cascade)

  @@index([tenant_id, application_id], name: "idx_admissions_payment_events_app")
  @@map("admissions_payment_events")
}

enum AdmissionsPaymentEventStatus {
  succeeded
  failed
  received_out_of_band
}
```

RLS policy: identical pattern to other tenant-scoped tables.

**Coordinate with impl 01:** the cleanest thing is to add this table to 01's migration before 01 deploys. If 01 has already deployed, add a small follow-up migration in this impl.

### 5. Dependency injection

Inject `ApplicationConversionService` and `ApplicationStateMachineService` into `StripeService`. This creates a cross-module dependency from finance → admissions. That's fine because the webhook handler lives in finance for historical reasons. Document the dependency in `docs/architecture/module-blast-radius.md`.

### 6. Worker — admissions payment link email job

Create `apps/worker/src/admissions/admissions-payment-link.processor.ts`:

```ts
@Processor(QUEUE_NAMES.ADMISSIONS)
export class AdmissionsPaymentLinkProcessor extends WorkerHost {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly stripeService: StripeService,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<{ tenant_id: string; application_id: string }>): Promise<void> {
    if (job.name !== ADMISSIONS_PAYMENT_LINK_JOB) return;

    // TenantAwareJob pattern
    // 1. Set RLS context
    // 2. Load the application + tenant branding
    // 3. Call stripeService.createAdmissionsCheckoutSession(...)
    // 4. Build a locale-aware email body with the checkout URL
    // 5. Enqueue a notification dispatch (reuse the existing notifications infra)
  }
}
```

Register this processor in `AdmissionsModule` (worker side) and add the job constant to `queue.constants.ts`.

Add a new queue `ADMISSIONS` if it doesn't exist, or reuse `NOTIFICATIONS` if appropriate. Check the existing queue pattern and follow it.

### 7. Admin-visible "regenerate payment link" endpoint

A small API endpoint the frontend (impl 11 — Conditional Approval page) can call when an admin wants to regenerate the Stripe link (e.g. if the parent lost the original email):

```
POST /v1/applications/:id/payment-link/regenerate
```

Controller hits `stripeService.createAdmissionsCheckoutSession` and returns the URL for the admin to copy or trigger a re-send to the parent.

### 8. Success / cancel URLs

Define a stable pattern:

- Success: `https://<tenant-public-domain>/en/apply/${tenant_slug}/payment-success?ref=${application_number}`
- Cancel: `https://<tenant-public-domain>/en/apply/${tenant_slug}/payment-cancelled?ref=${application_number}`

Impl 14 builds these pages. For this impl, just reference the URL pattern; if the pages don't exist yet, Stripe will redirect to a 404 — acceptable as a mid-rebuild state.

## Tests

- `createAdmissionsCheckoutSession`:
  - Happy path: creates session with correct amount, metadata, expiry.
  - Rejects if application isn't in `conditional_approval`.
  - Rejects if `payment_amount_cents` is null.
  - Uses the tenant's encrypted Stripe key.
  - Respects circuit breaker.
- `handleAdmissionsCheckoutCompleted`:
  - Happy path: converts to student, marks approved, records the payment event.
  - Idempotent on duplicate events (same `stripe_event_id`).
  - Rejects amount mismatch (metadata vs actual).
  - Rejects amount mismatch (metadata vs application row).
  - Ignores events for applications not in `conditional_approval` (records as `received_out_of_band`, does not mutate).
  - Cross-tenant metadata mismatch → rejected.
- Worker: `AdmissionsPaymentLinkProcessor` — reads a job, calls `StripeService`, enqueues email. Unit tested with mocked deps.

## Deployment

1. Commit locally.
2. Patch → production.
3. If a schema change is in this impl (for `admissions_payment_events`), run `pnpm db:migrate` and `pnpm db:post-migrate`.
4. Build `@school/api` and `@school/worker`.
5. Restart api and worker: `pm2 restart api worker --update-env`.
6. Smoke test:
   - Cannot fully smoke-test without creating a Stripe event in production. Acceptable: verify API health, worker picked up the queue, and an end-to-end check by manually running a queue job using the existing BullMQ admin pattern.
7. Update `IMPLEMENTATION_LOG.md`.

## Definition of done

- `StripeService.createAdmissionsCheckoutSession` exists and is unit-tested.
- Webhook handler branches on `metadata.purpose === 'admissions'` and calls the new branch.
- `AdmissionsPaymentEvent` table exists with RLS policy.
- Worker processor for payment-link emails exists.
- API + worker restarted on production.
- Completion record added to the log.

## Notes for downstream implementations

- **07 (cash / bank / override)** calls `conversionService.convertToStudent` + `stateMachine.markApproved` with `paymentSource: 'cash' | 'bank_transfer' | 'override'`. Same pattern as the webhook branch, just triggered from an API endpoint instead.
- **08 (expiry cron)** looks at `payment_deadline` and reverts, does NOT look at this table.
- **11 (conditional approval page)** surfaces the checkout URL (regeneratable), and a "Copy link" button for admins to share manually.
