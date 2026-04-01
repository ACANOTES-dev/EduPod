# Finance

## Purpose

Manages the full student fee and payment lifecycle: fee structures, discounts, invoice generation, payments, Stripe integration, refunds, credit notes, late fees, payment plans, recurring invoices, household statements, and financial reporting.

## Public API (Exports)

- `InvoicesService` — invoice CRUD, status transitions, approval integration
- `PaymentsService` — payment recording and reconciliation
- `ReceiptsService` — receipt generation and sequence numbers
- `ScholarshipsService` — scholarship/bursary management
- `PaymentRemindersService` — automated payment reminder rules
- `RecurringInvoicesService` — recurring invoice scheduling
- `LateFeesService` — late fee calculation and application

## Inbound Dependencies (What this module imports)

- `ApprovalsModule` — approval workflow for invoice issuance and bulk operations
- `SequenceModule` — receipt and invoice sequence numbers
- `ConfigurationModule` — `SettingsService` (payment reminders, recurring invoice rules), `EncryptionService` (Stripe key encryption/decryption)
- `PdfRenderingModule` — invoice, receipt, and statement PDF generation

## Outbound Consumers (Who imports this module)

- `RegistrationModule` — imports `InvoicesService` to create registration invoices on enrolment
- `ComplianceModule` worker — reads invoice count for retention eligibility checks (Prisma direct)
- Worker: `notifications:parent-daily-digest` reads `invoices` directly for parent digest content

## BullMQ Queues

**Queue: `finance`** (3 retries, 5s exponential)

- `finance:on-approval` — callback when an invoice issue approval is granted; marks invoice as `issued`, sets `issued_at`
- `finance:overdue-detection` — cron job scanning for unpaid past-due invoices; marks them `overdue`

## Cross-Module Prisma Reads

Finance services read `students`, `student_parents`, `households`, `academic_years` for invoice generation and financial reporting. FinanceDashboardService uses RLS transactions directly for security.

## Key Danger Zones

- **DZ-01**: Invoice status machine is MITIGATED — `VALID_INVOICE_TRANSITIONS` map enforces all transitions. Three transitions still occur outside the invoice service: `overdue` (cron worker), `issued` (approval callback worker), `partially_paid`/`paid` (payment service via `deriveInvoiceStatus()`).
- **DZ-04**: The `refund` sequence type is used in `RefundsService` but is NOT in the canonical `SEQUENCE_TYPES` constant. Adding validation against that constant would silently break refund number generation.
- **DZ-09**: Stripe keys are AES-256 encrypted via `EncryptionService`. Never change the encryption algorithm or key without a data migration plan for existing encrypted values.
- Invoice state machine: `VALID_INVOICE_TRANSITIONS` in `packages/shared/src/constants/invoice-status.ts`. `validateInvoiceTransition()` helper enforces user-initiated transitions; `deriveInvoiceStatus()` handles payment-driven transitions.
