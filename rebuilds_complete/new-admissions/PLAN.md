# New Admissions — Master Plan

> **Status:** Plan locked. Implementation split into 15 tasks across 5 waves. See `IMPLEMENTATION_LOG.md` for execution order and per-wave rules.

---

## 1. Why we're rebuilding Admissions

The current admissions module is built around an **honor system**: a parent fills out an application, an admin accepts it, a Student record is created immediately, and fees are collected "later" through the Finance module. For at least one confirmed tenant this has been catastrophic — families commit to €7,000+ annual fees, pay the bare minimum to enrol, then drip-feed the balance throughout the year until it turns into unrecoverable debt.

The rebuild exists to move the school from an honor-based flow to a **financially gated flow**. No student enters the Students list until their admission fee threshold has been paid in full (or an authorised admin has explicitly overridden the rule with a justification on the audit trail). Capacity gating is a secondary goal: schools need to stop accidentally accepting applications into year groups that are already at max capacity.

Two flows exist side by side after the rebuild:

1. **Walk-in flow (unchanged).** The existing `RegistrationWizard` dialog under `/dashboard` — Parent/Household → Students → Fees → Payment → Complete — remains exactly as-is. This is used when a family is physically present at the office and pays at the desk. Admin has eyeballs on capacity at the time of acceptance.
2. **Online flow (new).** A public, rate-limited form (QR code on posters, link on the school website) that anyone can submit from home. Every online application goes through the gated pipeline below. This is what this plan builds.

The old honor-based "accept → convert to student" flow is **deleted**. The old form builder (`/admissions/forms/*`) is **deleted**. There is exactly one system-generated admission form per tenant, auto-derived from the same field set the walk-in wizard uses — so when the wizard becomes tenant-configurable later, the public form inherits that configuration for free with no dual maintenance.

---

## 2. States, transitions, and gates

```
                  ┌─────────────────────────────────┐
                  │  PUBLIC FORM SUBMISSION         │
                  │  (anyone, rate-limited by IP)   │
                  └──────────────┬──────────────────┘
                                 │
                                 ▼
                         ┌───────────────┐
                         │   SUBMITTED   │  ← transient; runs gating on entry
                         └───────┬───────┘
                                 │
                 ┌───────────────┼───────────────────────┐
                 │               │                       │
        seat available     no seats                target year not configured
                 │               │                       │
                 ▼               ▼                       ▼
       ┌─────────────────┐  ┌──────────────┐  ┌───────────────────────────┐
       │ READY TO ADMIT  │  │ WAITING LIST │  │ WAITING LIST              │
       │  (FIFO by       │  │ (FIFO by     │  │   sub-status:             │
       │   apply_date)   │  │  apply_date) │  │   AWAITING YEAR SETUP     │
       └────────┬────────┘  └──────┬───────┘  └───────────────┬───────────┘
                │                  │                          │
  admin decides │                  │ capacity opens           │ school creates
  ┌─────────┬──┘                   │ (new class added,        │ classes for that
  │         │                      │  student leaves, etc.)   │ academic year
  ▼         ▼                      │                          │
┌─────┐  ┌─────────────────────┐   │                          │
│REJCT│  │ CONDITIONAL APPROVAL│◄──┴──────────────────────────┘
└─────┘  │ (seat held,         │       (auto-promote to
         │  7-day payment      │        Ready to Admit, FIFO
         │  window)            │        by original apply_date)
         └──────────┬──────────┘
                    │
       ┌────────────┴────────────────┐
       │                             │
  payment condition met       window lapses
       OR admin override      without payment
       with justification            │
       │                             ▼
       ▼                    ┌──────────────────┐
  ┌─────────┐               │  WAITING LIST    │
  │APPROVED │               │  (seat released, │
  └────┬────┘               │   next in FIFO   │
       │                    │   queue picked)  │
       │                    └──────────────────┘
       ▼
 ┌─────────────────────────────────────┐
 │ Student + Household + Parent records│
 │ auto-created.                       │
 │ Student.status = active,            │
 │ year_group set, NO class assigned.  │
 │ Principal/VP assigns to 2A/2B later │
 │ via /class-assignments.             │
 └─────────────────────────────────────┘
```

### State definitions

| State                                             | Meaning                                                                                                                                                                                         | How you enter                                                                           | How you leave                                                                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submitted`                                       | Application just arrived from the public form or a parent draft. Transient — the state machine evaluates gating immediately and moves it to one of the next states within the same transaction. | `POST /v1/public/admissions/applications`                                               | Auto-routes to `ready_to_admit`, `waiting_list`, or `waiting_list` + `awaiting_year_setup`.                                                                    |
| `ready_to_admit`                                  | There is at least one free seat in the target year group (for the target academic year) after accounting for active students + in-flight conditional approvals. Admin can act.                  | Gating pass at submission, or auto-promotion from waiting list.                         | Admin clicks **Approve** → `conditional_approval`, or **Reject** → `rejected`, or applicant **Withdraws** → `withdrawn`.                                       |
| `waiting_list`                                    | No seat available right now. Will auto-promote when capacity opens.                                                                                                                             | Gating fail at submission, or lapse from conditional approval.                          | Auto-promotion to `ready_to_admit` when a seat opens (FIFO by `apply_date`), manual rejection, or withdraw.                                                    |
| `waiting_list` + sub-status `awaiting_year_setup` | Applicant targeted an academic year that has no classes configured yet. Sits inert.                                                                                                             | Gating detects target academic year has zero classes for the target year group.         | When the school creates classes for that year, retroactive gating runs and (if there's capacity) FIFO-promotes.                                                |
| `conditional_approval`                            | School has decided to admit. A seat is held. Parent has 7 days (tenant-configurable) to pay the upfront amount.                                                                                 | Admin approves from `ready_to_admit`.                                                   | Automatic → `approved` on payment match, cron → `waiting_list` on 7-day lapse, admin override → `approved`, admin reject → `rejected`, withdraw → `withdrawn`. |
| `approved`                                        | Money is in the bank (or explicitly waived by an authorised admin with a justification recorded). Student record exists.                                                                        | Payment match via Stripe webhook, cash record, bank transfer record, or admin override. | Terminal.                                                                                                                                                      |
| `rejected`                                        | Rejected by admin with mandatory reason. Seat released (if one was held).                                                                                                                       | Admin reject from any non-terminal state.                                               | Terminal.                                                                                                                                                      |
| `withdrawn`                                       | Parent withdrew. Seat released (if one was held).                                                                                                                                               | Parent action via portal, or admin acting on parent's behalf.                           | Terminal.                                                                                                                                                      |

**Removed states:** `draft`, `under_review`, `pending_acceptance_approval`, `accepted`. The old flow had multiple admin acknowledgement stages that added no value — the new flow has one decision point (`ready_to_admit` → `conditional_approval` → `approved`).

---

## 3. The capacity math (critical)

Capacity is computed **per year group, per academic year**, on the fly — no denormalised counter. The formula:

```
year_group_total_capacity =
    SUM( class.max_capacity )
    WHERE class.academic_year_id = target_academic_year_id
      AND class.year_group_id = target_year_group_id
      AND class.status = 'active'

year_group_consumed =
      (count of Students with status='active' and year_group_id=target_year_group_id
       whose current class_enrolment.academic_year_id = target_academic_year_id)
    + (count of Applications with status='conditional_approval'
       AND target_academic_year_id=target_academic_year_id
       AND target_year_group_id=target_year_group_id)

year_group_available = year_group_total_capacity - year_group_consumed
```

The **crucial** piece is that `conditional_approval` applications hold a seat. If capacity is 50, there are 40 enrolled students and 5 conditional approvals in flight, we can only accept 5 more applications to `ready_to_admit`, not 10. Without this, two admins approving concurrently can oversubscribe the year group.

All capacity reads happen inside the same transaction that mutates the application's state, so the seat count is consistent under concurrency.

---

## 4. Auto-promotion triggers

Two hooks trigger FIFO auto-promotion from the waiting list to ready-to-admit:

1. **New class created in an existing year group.** Example: School adds class `2C` (max 25) to "Second Class" year group mid-term. After the class is created, the system scans applications with `status='waiting_list'` targeting "Second Class" + that academic year, ordered by `apply_date ASC`, and promotes as many as fit into the newly-opened seats. Each promoted app transitions to `ready_to_admit` with a system-generated audit note.
2. **Classes created for a previously-unconfigured academic year.** Example: School configures classes for 2027-2028 for the first time. System scans applications with `status='waiting_list'` + sub-status `awaiting_year_setup` targeting 2027-2028, drops the sub-status, runs the normal capacity gate, and routes each to either `ready_to_admit` (FIFO) or keeps them in `waiting_list` if there's still no room.

A third implicit trigger also exists: **conditional approval lapse**. When the 7-day payment window expires, a cron-driven worker reverts the application to `waiting_list` (freeing the seat) and immediately runs a promotion pass for that year group — so the next applicant in the FIFO queue moves up automatically.

**Student leaving the school** (withdrawal, transfer) does NOT auto-promote waiting list applications. That's intentional — schools handle mid-year departures differently and we don't want a surprise admission to happen without a human decision.

---

## 5. Payment flow — how the €700 of €1000 gets enforced

### Principle

**The parent never picks the amount.** The system computes the required upfront amount server-side at the moment of conditional approval, creates a Stripe Checkout Session for exactly that amount (amount is baked into the session and locked on Stripe's servers), and emails the link to the parent. The parent literally cannot pay less via Stripe — Stripe's hosted checkout shows a non-editable amount.

For cash and bank transfer, the admin records the received amount manually, and the system validates it against the stored expected amount.

### Step-by-step

1. **Application moves to `conditional_approval`.** The state machine:
   - Reuses `finance.feeStructuresService` to resolve the annual fee schedule for the target year group.
   - Applies any default/automatic discounts.
   - Multiplies by `tenantSettings.admissions.upfront_percentage` (default 100%, configurable per tenant).
   - Stores the result on `application.payment_amount_cents` (integer cents, not decimal — for binary comparison).
   - Sets `application.payment_deadline = now() + tenantSettings.admissions.payment_window_days` (default 7).
   - Emits a `notifications:admissions-payment-link` job that generates the Stripe Checkout Session and emails the link.
2. **Stripe Checkout Session** is created server-side by a new method on `StripeService`: `createAdmissionsCheckoutSession(tenantId, applicationId)`. It mirrors the existing `createCheckoutSession` for invoices but:
   - Uses the application's currency.
   - Uses `unit_amount: application.payment_amount_cents` (NOT a parent-entered number).
   - Attaches metadata `{ purpose: 'admissions', tenant_id, application_id, expected_amount_cents }`.
   - Returns a checkout URL.
3. **Parent clicks the emailed link**, lands on Stripe's hosted page showing the exact amount, pays by card, Stripe completes the session.
4. **Webhook fires** `checkout.session.completed`. The existing webhook handler in `StripeService.handleCheckoutCompleted` is extended: if `metadata.purpose === 'admissions'`, route to a new `handleAdmissionsCheckoutCompleted` branch that:
   - Dedups on `event.id` via the existing `external_event_id` idempotency pattern.
   - Loads the application by `metadata.application_id`.
   - Verifies `session.amount_total === application.payment_amount_cents` (defence in depth).
   - Verifies `metadata.tenant_id` matches the current tenant.
   - Promotes the application to `approved` inside a transaction.
   - Fires the auto-create-student flow (reusing the existing `applicationConversionService`, refactored to run with machine-provided inputs rather than the old admin wizard).
5. **Cash and bank transfer** bypass Stripe entirely. The admin hits **Record Payment** in the Conditional Approval queue, picks cash/bank, enters the received amount and (for bank) the transfer reference. The backend endpoint validates `received_cents >= application.payment_amount_cents`. If yes → promote to `approved`. If less → rejected with `PAYMENT_BELOW_THRESHOLD` and an inline option to escalate to the override path.
6. **Admin override** is a separate, audited button in the Conditional Approval queue: **Force Approve Without Payment**. Opens a modal requiring the admin to enter a justification (mandatory, min 20 chars). The backend writes a `AdmissionOverride` audit row (who, when, why, which application, the expected amount that was waived) and promotes the application. The owner and principal can see every override on a dedicated audit page.
7. **Payment window lapse.** A worker cron (`admissions-payment-expiry`, runs every 15 minutes) finds applications with `status='conditional_approval'` and `payment_deadline < now()`, reverts them to `waiting_list` (releasing the seat), writes an internal note explaining the lapse, and fires an email to the parent saying the window has expired. After the revert, it immediately runs an auto-promotion pass for that year group so the next FIFO applicant moves into the freed seat.

### What the system does NOT do

- It does not accept partial payments. There is no "pay €300 now, €400 later" flow inside admissions. You either pay the full required upfront amount or you don't. The admin override exists for genuine hardship cases, not as a routine partial-payment path.
- It does not rely on unsigned Stripe webhooks. Signature verification uses the existing `webhooks.constructEvent` path.
- It does not auto-create the student before payment clears. There is exactly one place where the Students table grows: the `handleAdmissionsCheckoutCompleted` or `recordAdmissionsPayment` or `forceApproveWithOverride` paths.

---

## 6. Data model changes

### Application model — extend

```prisma
model Application {
  // ... existing columns ...
  target_academic_year_id  String?   @db.Uuid
  target_year_group_id     String?   @db.Uuid
  apply_date               DateTime? @db.Timestamptz()  // denormalised for FIFO sort
  payment_amount_cents     Int?      // replaces payment_amount (decimal) for exact comparison
  currency_code            String?   @db.VarChar(3)
  stripe_checkout_session_id String? @db.VarChar(255)
  waiting_list_substatus   ApplicationWaitingListSubstatus?
  override_record_id       String?   @db.Uuid
  // ... relations ...
  target_academic_year     AcademicYear? @relation(...)
  target_year_group        YearGroup?    @relation(...)
  override_record          AdmissionOverride? @relation(...)
}

enum ApplicationStatus {
  submitted
  waiting_list
  ready_to_admit
  conditional_approval
  approved
  rejected
  withdrawn
}

enum ApplicationWaitingListSubstatus {
  awaiting_year_setup
}
```

The old enum values (`draft`, `under_review`, `pending_acceptance_approval`, `accepted`) are removed. A data migration maps any existing rows: `draft → withdrawn` (they never got submitted), `under_review → ready_to_admit`, `pending_acceptance_approval → ready_to_admit`, `accepted → approved`. Migration is additive-first (expand/contract): add new enum values, migrate rows, remove old values.

### New model — AdmissionOverride

```prisma
model AdmissionOverride {
  id                 String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id          String   @db.Uuid
  application_id     String   @db.Uuid
  approved_by_user_id String  @db.Uuid
  expected_amount_cents Int
  actual_amount_cents   Int   @default(0)
  justification      String   @db.Text
  override_type      AdmissionOverrideType
  created_at         DateTime @default(now()) @db.Timestamptz()

  tenant       Tenant      @relation(...)
  application  Application @relation(...)
  approved_by  User        @relation(...)

  @@index([tenant_id, created_at])
  @@map("admission_overrides")
}

enum AdmissionOverrideType {
  full_waiver
  partial_waiver
  deferred_payment
}
```

RLS policy required on this table — tenant isolation with `FORCE ROW LEVEL SECURITY`.

### Class model — tighten

Change `max_capacity Int?` to `max_capacity Int` (NOT NULL). Migration: `UPDATE classes SET max_capacity = 25 WHERE max_capacity IS NULL` (configurable default), then `ALTER COLUMN SET NOT NULL`. The Zod schema already requires it at input — we're just catching up the DB.

### Tenant settings — extend (no migration)

Add keys to the JSONB blob:

```json
{
  "admissions": {
    "upfront_percentage": 100, // 0..100, percent of net fees due upfront
    "payment_window_days": 7, // days before conditional approval lapses
    "max_application_horizon_years": 2, // how far ahead parents can apply
    "allow_cash": true,
    "allow_bank_transfer": true,
    "bank_iban": null, // shown on bank transfer instructions, null if not configured
    "require_override_approval_role": "school_principal"
  }
}
```

---

## 7. Component map — what exists vs. what's new

### Backend (`apps/api/src/modules/admissions/`)

| File                                     | Status         | Change                                                                                                                             |
| ---------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `admission-forms.service.ts`             | keep, simplify | Remove form builder / multi-form logic; keep `getPublishedForm` + `createSystemForm` only.                                         |
| `admission-forms.controller.ts`          | keep, simplify | Remove CRUD endpoints for form definitions; keep GET system form + POST system-form-rebuild.                                       |
| `applications.service.ts`                | rewrite        | New public-create path that runs gating inside the transaction.                                                                    |
| `application-state-machine.service.ts`   | **rewrite**    | New state graph per §2; capacity-aware transitions.                                                                                |
| `application-conversion.service.ts`      | rewrite        | No longer admin-driven; called by the state machine when approving. Input is machine-provided, output is Student/Household/Parent. |
| `admissions-payment.service.ts`          | **rewrite**    | New service: resolve fees, compute upfront, create Stripe session (via StripeService), record cash/bank, record override.          |
| `admissions-capacity.service.ts`         | **new**        | Computes `year_group_available` with conditional-aware math; used everywhere gating runs.                                          |
| `admissions-auto-promotion.service.ts`   | **new**        | FIFO promotion logic; called by the state machine, the classes service hook, and the academic year hook.                           |
| `admissions-override.service.ts`         | **new**        | Admin override path with audit trail.                                                                                              |
| `admissions-payment-expiry.processor.ts` | **new**        | Worker cron — runs every 15 min, expires conditional approvals past deadline.                                                      |

### Backend — cross-module hooks

| Module                                                | Hook                                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `classes.service.ts`                                  | On `create()`, after the class is persisted, call `admissionsAutoPromotionService.onClassAdded(tenantId, classId)`. Inside the same transaction.                               |
| `academics.service.ts` (or wherever year setup lives) | On creating the first class for a `(academic_year_id, year_group_id)` pair, call `admissionsAutoPromotionService.onYearGroupActivated(tenantId, academicYearId, yearGroupId)`. |
| `finance.feeStructuresService`                        | Consumed read-only by `admissions-payment.service.ts`. No changes to finance.                                                                                                  |

### Frontend (`apps/web/src/app/[locale]/(school)/`)

| Path                                       | Status     | Change                                                                                                                                         |
| ------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `admissions/page.tsx`                      | rewrite    | Dashboard hub with 5 cards (Ready to Admit, Waiting List, Conditional Approval, Rejected, Admission Form) matching the Operations hub pattern. |
| `admissions/ready-to-admit/page.tsx`       | **new**    | Queue view, table with FIFO order, row actions (Approve / Reject).                                                                             |
| `admissions/waiting-list/page.tsx`         | **new**    | Queue view split by year group; shows `awaiting_year_setup` sub-group; manual promote button.                                                  |
| `admissions/conditional-approval/page.tsx` | **new**    | Queue showing payment deadlines, Record Payment, Force Approve Override.                                                                       |
| `admissions/rejected/page.tsx`             | **new**    | Read-only archive.                                                                                                                             |
| `admissions/[id]/page.tsx`                 | rewrite    | Application detail; review actions match new state machine.                                                                                    |
| `admissions/form-preview/page.tsx`         | **new**    | Read-only preview of the system form + public URL + QR code download.                                                                          |
| `admissions/analytics/page.tsx`            | keep       | Out-of-scope for this rebuild. Funnel numbers still display from the new enum.                                                                 |
| `admissions/forms/*`                       | **DELETE** | Entire `forms/` subtree (list, new, [id]).                                                                                                     |
| `admissions/[id]/convert/page.tsx`         | **DELETE** | Conversion is now automatic; no admin-facing UI.                                                                                               |

### Public-facing (new)

| Path                                             | Description                                                                                                                                                                                                                                                            |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/[locale]/apply/[tenant]/page.tsx`           | Unauthenticated customer-facing form. Resolves `[tenant]` to a tenant by slug, fetches the system form, renders it with `DynamicFormRenderer`, submits via `POST /v1/public/admissions/applications`. Rate-limited by IP via existing `admissions-rate-limit.service`. |
| `app/[locale]/apply/[tenant]/submitted/page.tsx` | Simple "Thank you, your application has been received" page with reference number.                                                                                                                                                                                     |

The route lives under `(public)` group so no school-shell layout is applied. Rate limiting and honeypot already exist in `admissions-rate-limit.service` — reuse.

### Worker (`apps/worker/src/`)

| File                                                | Status                                                                              |
| --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `admissions/admissions-payment-expiry.processor.ts` | **new** — cron every 15 min.                                                        |
| `admissions/admissions-payment-link.processor.ts`   | **new** — builds Stripe session + emails link when app enters conditional approval. |

---

## 8. Operations hub integration

The existing Operations hub dashboard (shipped earlier) currently has a placeholder card for Admissions. After this rebuild, the card will show a live count of applications in `ready_to_admit` (the "things an admin needs to look at") with an amber badge when > 0. Implementation lives in the final cleanup wave (15).

---

## 9. Out of scope for this rebuild

- **Analytics page.** Stays as-is, just needs its enum values updated. Redesign is deferred.
- **Multiple custom forms per tenant / form builder.** Gone and not coming back without an explicit request.
- **Partial payment tracking / payment plans inside admissions.** Explicitly excluded — that's what the honor system was. Payment plans for ongoing tuition remain a Finance module concern for after the student is enrolled.
- **Automatic bank reconciliation.** Bank transfers are manual: admin watches their bank account, clicks Record Payment. A future implementation could add Stripe SEPA/ACH for automation.
- **Sibling priority, returning-family priority, lottery systems.** Not in scope. If the school wants a non-FIFO waiting list policy later, we revisit.
- **Multi-session tracking in the implementation log.** No file locking — sessions coordinate via the deployment-order rule in `IMPLEMENTATION_LOG.md`.

---

## 10. Where the details live

This PLAN.md is the master document. For execution-level detail (which files to touch, what functions to add, how to test), see the individual implementation files under `implementations/`:

- `01-schema-foundation.md` — migration, enums, shared types
- `02-capacity-service.md` — `AdmissionsCapacityService`
- `03-state-machine-rewrite.md` — new state graph, transitions, capacity gate integration
- `04-form-service.md` — system form generator simplification + public fetch
- `05-conversion-to-student.md` — auto-conversion on approval
- `06-stripe-checkout-webhook.md` — admissions checkout session + webhook branch
- `07-cash-bank-override.md` — cash, bank transfer, admin override + audit
- `08-payment-expiry-cron.md` — worker cron for 7-day lapse
- `09-auto-promotion-hooks.md` — hooks on class creation + year setup
- `10-admissions-dashboard.md` — new hub dashboard
- `11-queue-subpages.md` — Ready to Admit / Waiting List / Conditional Approval / Rejected pages
- `12-application-detail.md` — rewrite of the detail page
- `13-form-preview-page.md` — read-only form preview + QR code
- `14-public-form-qr.md` — public customer-facing form route + rate limiting
- `15-cleanup-polish.md` — delete old pages, translations, operations hub live counts

See `IMPLEMENTATION_LOG.md` for wave structure, prerequisites, deployment ordering, and the rules every session must follow.
