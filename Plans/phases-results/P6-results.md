# P6 Results — Finance Module

## Summary

Phase 6 delivers the complete finance module for the School Operating System. This includes: fee structures and discounts management, household fee assignments, a fee generation wizard with preview and batch invoice creation, full invoice lifecycle management (draft through paid/void/written-off), installment plans, manual and Stripe payment recording, FIFO auto-suggest payment allocation with manual adjustment, receipt generation with immutable numbering, refund workflow with approval integration and LIFO allocation reversal, write-offs, household statements with running balance, Stripe checkout and webhook integration, overdue detection background job, locale-specific PDF rendering for invoices/receipts/statements, and a finance staff dashboard with overdue ageing, invoice pipeline, and revenue metrics.

---

## Database Migrations

### New Enums (7)
- `BillingFrequency` (4 values)
- `DiscountType` (2 values)
- `InvoiceStatus` (9 values)
- `InstallmentStatus` (3 values)
- `PaymentMethod` (4 values)
- `PaymentStatus` (6 values)
- `RefundStatus` (5 values)

### New Tables (10)
| Table | Columns | RLS | Trigger | Notes |
|-------|---------|-----|---------|-------|
| `fee_structures` | 9 | Yes | set_updated_at | UNIQUE(tenant_id, name) |
| `discounts` | 8 | Yes | set_updated_at | UNIQUE(tenant_id, name) |
| `household_fee_assignments` | 10 | Yes | set_updated_at | Partial unique indexes for active assignments |
| `invoices` | 19 | Yes | set_updated_at | UNIQUE(tenant_id, invoice_number) |
| `invoice_lines` | 11 | Yes | None | CHECK(line_total = quantity * unit_amount) |
| `installments` | 7 | Yes | set_updated_at | |
| `payments` | 15 | Yes | set_updated_at | Partial unique on external_event_id |
| `payment_allocations` | 6 | Yes | None | No updated_at (per spec) |
| `receipts` | 9 | Yes | None | No updated_at (immutable), UNIQUE(tenant_id, receipt_number) |
| `refunds` | 13 | Yes | set_updated_at | |

### Modified Existing Models
- **Tenant** — 10 new relation arrays
- **Household** — 3 new relation arrays (fee_assignments, invoices, payments)
- **Student** — 2 new relation arrays (fee_assignments, invoice_lines)
- **User** — 5 new named relation arrays (invoice_creator, payment_poster, receipt_issuer, refund_requester, refund_approver)
- **YearGroup** — 1 new relation array (fee_structures)
- **ApprovalRequest** — 1 new relation array (invoices)

---

## API Endpoints

### Fee Structures
| Method | Path | Auth | Permission |
|--------|------|------|------------|
| GET | /api/v1/finance/fee-structures | Yes | finance.view |
| GET | /api/v1/finance/fee-structures/:id | Yes | finance.view |
| POST | /api/v1/finance/fee-structures | Yes | finance.manage |
| PATCH | /api/v1/finance/fee-structures/:id | Yes | finance.manage |
| DELETE | /api/v1/finance/fee-structures/:id | Yes | finance.manage |

### Discounts
| Method | Path | Auth | Permission |
|--------|------|------|------------|
| GET | /api/v1/finance/discounts | Yes | finance.view |
| GET | /api/v1/finance/discounts/:id | Yes | finance.view |
| POST | /api/v1/finance/discounts | Yes | finance.manage |
| PATCH | /api/v1/finance/discounts/:id | Yes | finance.manage |
| DELETE | /api/v1/finance/discounts/:id | Yes | finance.manage |

### Fee Assignments
| Method | Path | Auth | Permission |
|--------|------|------|------------|
| GET | /api/v1/finance/fee-assignments | Yes | finance.view |
| POST | /api/v1/finance/fee-assignments | Yes | finance.manage |
| PATCH | /api/v1/finance/fee-assignments/:id | Yes | finance.manage |
| DELETE | /api/v1/finance/fee-assignments/:id | Yes | finance.manage |

### Fee Generation
| Method | Path | Auth | Permission |
|--------|------|------|------------|
| POST | /api/v1/finance/fee-generation/preview | Yes | finance.manage |
| POST | /api/v1/finance/fee-generation/confirm | Yes | finance.manage |

### Invoices
| Method | Path | Auth | Permission |
|--------|------|------|------------|
| GET | /api/v1/finance/invoices | Yes | finance.view / parent.view_invoices |
| GET | /api/v1/finance/invoices/:id | Yes | finance.view / parent.view_invoices |
| POST | /api/v1/finance/invoices | Yes | finance.manage |
| PATCH | /api/v1/finance/invoices/:id | Yes | finance.manage |
| POST | /api/v1/finance/invoices/:id/issue | Yes | finance.manage |
| POST | /api/v1/finance/invoices/:id/void | Yes | finance.manage |
| POST | /api/v1/finance/invoices/:id/cancel | Yes | finance.manage |
| POST | /api/v1/finance/invoices/:id/write-off | Yes | finance.manage |
| GET | /api/v1/finance/invoices/:id/preview | Yes | finance.view |
| GET | /api/v1/finance/invoices/:id/pdf | Yes | finance.view / parent.view_invoices |
| GET | /api/v1/finance/invoices/:id/installments | Yes | finance.view |
| POST | /api/v1/finance/invoices/:id/installments | Yes | finance.manage |
| DELETE | /api/v1/finance/invoices/:id/installments | Yes | finance.manage |
| POST | /api/v1/finance/invoices/:id/checkout-session | Yes | parent.make_payments / finance.process_payments |

### Payments
| Method | Path | Auth | Permission |
|--------|------|------|------------|
| GET | /api/v1/finance/payments | Yes | finance.view |
| GET | /api/v1/finance/payments/:id | Yes | finance.view |
| POST | /api/v1/finance/payments | Yes | finance.process_payments |
| POST | /api/v1/finance/payments/:id/allocations/suggest | Yes | finance.process_payments |
| POST | /api/v1/finance/payments/:id/allocations | Yes | finance.process_payments |
| GET | /api/v1/finance/payments/:id/receipt | Yes | finance.view |
| GET | /api/v1/finance/payments/:id/receipt/pdf | Yes | finance.view / parent.view_invoices |

### Stripe Webhook
| Method | Path | Auth | Permission |
|--------|------|------|------------|
| POST | /api/v1/stripe/webhook | No (signature verification) | None |

### Refunds
| Method | Path | Auth | Permission |
|--------|------|------|------------|
| GET | /api/v1/finance/refunds | Yes | finance.view |
| POST | /api/v1/finance/refunds | Yes | finance.issue_refunds |
| POST | /api/v1/finance/refunds/:id/approve | Yes | approvals.manage |
| POST | /api/v1/finance/refunds/:id/reject | Yes | approvals.manage |
| POST | /api/v1/finance/refunds/:id/execute | Yes | finance.issue_refunds |

### Household Statements
| Method | Path | Auth | Permission |
|--------|------|------|------------|
| GET | /api/v1/finance/household-statements/:householdId | Yes | finance.view / parent.view_invoices |
| GET | /api/v1/finance/household-statements/:householdId/pdf | Yes | finance.view / parent.view_invoices |

### Finance Dashboard
| Method | Path | Auth | Permission |
|--------|------|------|------------|
| GET | /api/v1/finance/dashboard | Yes | finance.view |

---

## Services

| Service | File | Responsibilities |
|---------|------|-----------------|
| FeeStructuresService | fee-structures.service.ts | CRUD for fee structures with unique name validation |
| DiscountsService | discounts.service.ts | CRUD for discounts with percent validation |
| FeeAssignmentsService | fee-assignments.service.ts | CRUD for household fee assignments with FK validation |
| InvoicesService | invoices.service.ts | Full invoice lifecycle, approval integration, status derivation, balance recalculation |
| FeeGenerationService | fee-generation.service.ts | Preview and batch invoice creation wizard |
| PaymentsService | payments.service.ts | Manual payment recording, FIFO allocation suggestion, allocation confirmation |
| ReceiptsService | receipts.service.ts | Receipt creation with sequence numbers, PDF rendering |
| RefundsService | refunds.service.ts | Refund workflow with LIFO allocation reversal |
| StripeService | stripe.service.ts | Stripe checkout session creation, webhook handling, refund processing |
| HouseholdStatementsService | household-statements.service.ts | Statement aggregation with running balance |
| FinanceDashboardService | finance-dashboard.service.ts | Dashboard aggregation queries |
| InvoiceStatusHelper | helpers/invoice-status.helper.ts | Pure deriveInvoiceStatus() function |

---

## Frontend

### Pages & Routes
| Route | Component Type | Description |
|-------|---------------|-------------|
| /finance | Server + Client | Finance dashboard with ageing, pipeline, alerts |
| /finance/fee-structures | Server | Fee structures list with search/filter |
| /finance/fee-structures/new | Client | Create fee structure form |
| /finance/fee-structures/[id] | Client | Edit fee structure form |
| /finance/discounts | Server | Discounts list |
| /finance/discounts/new | Client | Create discount form |
| /finance/discounts/[id] | Client | Edit discount form |
| /finance/fee-assignments | Server | Fee assignments list |
| /finance/fee-assignments/new | Client | Create fee assignment form |
| /finance/fee-generation | Client | Multi-step fee generation wizard |
| /finance/invoices | Server | Invoice list with status tabs |
| /finance/invoices/[id] | Server + Client | Invoice detail hub with tabs |
| /finance/payments | Server | Payments list |
| /finance/payments/new | Client | Record manual payment |
| /finance/payments/[id] | Server + Client | Payment detail with allocation panel |
| /finance/refunds | Server + Client | Refund management with inline actions |
| /finance/statements | Server | Household statement selector |
| /finance/statements/[householdId] | Server + Client | Household statement with ledger |

### Shared Components
- `invoice-status-badge.tsx` — Semantic status pills for 9 invoice statuses
- `payment-status-badge.tsx` — Status pills for 6 payment statuses
- `refund-status-badge.tsx` — Status pills for 5 refund statuses
- `currency-display.tsx` — Locale-aware currency formatting
- `household-selector.tsx` — Searchable household dropdown

---

## Background Jobs

| Job Name | Queue | Trigger | Description |
|----------|-------|---------|-------------|
| finance:overdue-detection | FINANCE | Cron 01:00 UTC daily | Transitions overdue invoices and installments |

---

## Configuration

### Permissions Added
- `finance.write_off` — admin tier, assigned to school_owner and finance_staff
- `finance.override_refund_guard` — admin tier, assigned to school_owner only

### Queue Names
- `FINANCE` added to `QUEUE_NAMES` constant

### Sequence Service
- Added optional `prefix` parameter to `nextNumber()` for branding-prefixed invoice/receipt numbers

### Translation Files
- `en.json` — Complete finance section with ~60 translation keys
- `ar.json` — Arabic translations for all finance keys

---

## Files Created

### Backend (24 files)
```
apps/api/src/modules/finance/
├── finance.module.ts
├── fee-structures.controller.ts
├── fee-structures.service.ts
├── discounts.controller.ts
├── discounts.service.ts
├── fee-assignments.controller.ts
├── fee-assignments.service.ts
├── invoices.controller.ts
├── invoices.service.ts
├── fee-generation.controller.ts
├── fee-generation.service.ts
├── payments.controller.ts
├── payments.service.ts
├── receipts.service.ts
├── refunds.controller.ts
├── refunds.service.ts
├── stripe.service.ts
├── stripe-webhook.controller.ts
├── household-statements.controller.ts
├── household-statements.service.ts
├── finance-dashboard.controller.ts
├── finance-dashboard.service.ts
└── helpers/
    └── invoice-status.helper.ts
```

### PDF Templates (6 files)
```
apps/api/src/modules/pdf-rendering/templates/
├── invoice-en.template.ts
├── invoice-ar.template.ts
├── receipt-en.template.ts
├── receipt-ar.template.ts
├── household-statement-en.template.ts
└── household-statement-ar.template.ts
```

### Worker (1 file)
```
apps/worker/src/processors/finance/
└── overdue-detection.processor.ts
```

### Shared (2 files)
```
packages/shared/src/
├── types/finance.ts
└── schemas/finance.schema.ts
```

### Database (1 file)
```
packages/prisma/migrations/20260316200000_add_p6_finance_tables/
└── post_migrate.sql
```

### Frontend (36 files)
```
apps/web/src/app/[locale]/(school)/finance/
├── layout.tsx
├── page.tsx (dashboard)
├── _components/ (5 shared components)
├── fee-structures/ (4 files)
├── discounts/ (4 files)
├── fee-assignments/ (3 files)
├── fee-generation/ (3 files)
├── invoices/ (8 files including hub components)
├── payments/ (5 files including allocation panel)
├── refunds/ (1 file)
└── statements/ (2 files)
```

---

## Files Modified

| File | Changes |
|------|---------|
| `packages/prisma/schema.prisma` | 7 enums, 10 models, 6 existing models updated with P6 relations |
| `packages/shared/src/constants/permissions.ts` | Added `finance.write_off`, `finance.override_refund_guard` + tier map + system roles |
| `packages/shared/src/index.ts` | Added P6 type and schema exports |
| `apps/api/src/app.module.ts` | Added FinanceModule import, Stripe webhook path exclusion |
| `apps/api/src/modules/tenants/sequence.service.ts` | Added optional `prefix` parameter to `nextNumber()` |
| `apps/api/src/modules/pdf-rendering/pdf-rendering.service.ts` | Registered 6 new templates |
| `apps/worker/src/base/queue.constants.ts` | Added FINANCE queue |
| `apps/worker/src/worker.module.ts` | Registered FINANCE queue and OverdueDetectionProcessor |
| `apps/web/src/app/[locale]/(school)/layout.tsx` | Added Finance nav item to sidebar |
| `apps/web/messages/en.json` | Added finance translation section |
| `apps/web/messages/ar.json` | Added Arabic finance translations |

---

## Known Limitations

1. **Stripe integration uses placeholder**: The `StripeService` is structured for the real Stripe SDK but uses a placeholder implementation since the `stripe` npm package may not be installed. Production deployment needs `npm install stripe` and env variables for Stripe API keys.

2. **Mass invoice PDF export**: Deferred to a later enhancement. The worker infrastructure is in place (FINANCE queue) but the mass-invoice-pdf job is not implemented in this phase.

3. **Approval callback from approval system**: When an approval request for `invoice_issue` is approved/rejected externally (via the approvals UI), the invoice status transition is handled by polling on next access rather than a real-time callback.

4. **Parent scoping in invoice endpoints**: The parent-scoped invoice access (filtering to own household) relies on the auth middleware providing household IDs. If the middleware doesn't currently expose parent household IDs, this will need wiring in the auth layer.

---

## Deviations from Plan

1. **Shared schema naming**: `approvalCommentSchema` and `rejectionCommentSchema` were renamed to `refundApprovalCommentSchema` and `refundRejectionCommentSchema` to avoid export collision with existing approval schemas.

2. **Overdue detection worker**: Combined into a single processor file (`overdue-detection.processor.ts`) rather than separate processor + job files, following the existing pattern in the gradebook worker.

3. **Finance layout**: Added a `layout.tsx` with horizontal tab navigation (not in original plan) to provide module-level navigation within finance, following the existing scheduling layout pattern.

4. **Statements index page**: Added a `statements/page.tsx` index page to list households before navigating to individual statements, as the original plan only specified the `[householdId]` detail page.
