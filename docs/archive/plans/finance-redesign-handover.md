# Finance Module Redesign — Handover Document

## Purpose

Bug fixes, dashboard redesign, removal of tax references, PDF fixes, payment audit trail, and sticky sub-navigation for the finance module.

---

## Current Architecture

### Frontend Pages (`apps/web/src/app/[locale]/(school)/finance/`)

The finance section has a horizontal sub-nav with these tabs:

- Dashboard (landing page)
- Fee Structures
- Discounts
- Fee Assignments
- Fee Generation
- Invoices
- Payments
- Refunds
- Statements

### Backend (`apps/api/src/modules/finance/`)

Full finance module with services for invoices, payments, refunds, fee structures, fee generation, statements.

---

## Changes Required

### 1. Sticky Sub-Navigation

The horizontal nav bar at the top of the finance section scrolls off screen when the user scrolls down. It must be **fixed/sticky** so it stays visible at all times.

**Fix**: In the finance layout component, add `sticky top-0 z-10 bg-surface` (or equivalent) to the nav bar container. Ensure it stays pinned as content scrolls beneath it.

**Location**: `apps/web/src/app/[locale]/(school)/finance/layout.tsx` or wherever the finance sub-nav is defined.

### 2. Dashboard Redesign

#### Summary Cards (top 4 boxes)

Replace the current cards with:

| Position | Label                 | Calculation                                                           |
| -------- | --------------------- | --------------------------------------------------------------------- |
| 1        | **Expected Revenue**  | Sum of all fees due by all households (total invoiced)                |
| 2        | **Received Payments** | Sum of all payments received                                          |
| 3        | **Outstanding**       | Expected Revenue − Received Payments                                  |
| 4        | **Collection Rate**   | (Received Payments / Expected Revenue) × 100, displayed as percentage |

#### Replace "Overdue Aging Summary"

Remove the current aging buckets (1-30 days, 31-60 days, etc.). Replace with a **household debt breakdown**:

| Label              | Meaning                                               |
| ------------------ | ----------------------------------------------------- |
| 0-10% outstanding  | Households that owe less than 10% of their total fees |
| 10-30% outstanding | Households that owe 10-30%                            |
| 30-50% outstanding | Households that owe 30-50%                            |
| 50%+ outstanding   | Households that owe more than 50%                     |

Each bucket shows the **count of households** (e.g., "75 households owe more than 50%").

This requires a new API endpoint or modifying the existing analytics endpoint to calculate per-household outstanding as a percentage of their total fees.

#### Remove sections

- Invoice Pipeline — remove
- Revenue Summary — remove

#### Keep sections

- Pending Refunds — keep as-is
- Recent Payments — keep, ensure chronological order (most recent first)

#### Recent Payments — clickable

When clicking a payment reference in the recent payments table:

1. View/print a **payment receipt** (PDF opens in modal)
2. View that **household's latest statement**

### 3. Remove ALL Tax References

**Global change across the entire finance module.** Remove:

- Tax columns from invoice tables
- Tax fields from invoice creation/generation
- Tax calculations from invoice line items
- Tax display on PDF receipts/invoices/statements
- Any tax-related API fields or Zod schemas

Tax is irrelevant for school fees. It may become relevant for payroll later, but that's a separate module.

**Search for**: `tax`, `vat`, `tax_amount`, `tax_rate`, `tax_total` across:

- `apps/api/src/modules/finance/`
- `apps/web/src/app/[locale]/(school)/finance/`
- `packages/shared/src/schemas/` (finance-related schemas)
- Prisma schema (invoice/payment models)

### 4. Payment Reference — Auto-Generated

**Current**: Payment reference is a manual text input. This is wrong.

**Required**: Auto-generated sequential reference number. Format should follow the existing sequence pattern (e.g., `PAY-YYYYMM-NNNNN`). This is non-negotiable — manual references break audit trails.

**Implementation**: Use the existing `SequenceService` / `tenant_sequences` table (same pattern used for invoice numbers, student numbers, etc.).

### 5. "Payment Accepted By" — Audit Field

**New requirement**: Every payment must record WHO accepted it.

**Implementation**:

- Add `accepted_by_user_id` to the payment record (if not already there — check the Payment model)
- Auto-populate from the logged-in user's ID when recording a payment
- Display the user's full name on the payment record
- This is auto-populated, NOT a manual field

### 6. Payment Audit Views

Two new audit capabilities needed:

**Audit View A — Search by Payment Reference**

- Input: payment reference number
- Output: full payment details (household, amount, method, date, accepted by, notes)

**Audit View B — Search by Staff Member**

- Input: dropdown of staff/admin users who have accepted payments
- Output: all payments accepted by that person, with timestamps, amounts, references, and households
- Sortable by date
- This is critical for cash reconciliation and corruption prevention

**Implementation**: These could be additional filters on the existing payments page, or a dedicated "Payment Audit" tab in the finance sub-nav.

### 7. PDF Generation Fixes

Multiple PDF buttons are broken across finance:

| Location               | Issue                            |
| ---------------------- | -------------------------------- |
| Invoices → Print PDF   | "Failed to download PDF" error   |
| Payments → Receive PDF | Button does nothing (dead click) |
| Statements → PDF       | Button does nothing (dead click) |

**Additional requirement**: PDFs must NOT download directly. They must **open in a modal** for review first, with a print/download option from the modal. This applies to ALL PDF generation in finance (invoices, receipts, statements).

**Implementation**: Generate the PDF server-side (Puppeteer), return as a blob, display in an `<iframe>` or PDF viewer modal, with print/download buttons.

### 8. Fee Generation — Preview Invoices 404

**Bug**: Selecting year group + fee structure + dates → clicking "Preview Invoices" → 404 page.

**Investigate**: Check the preview route/endpoint. The frontend likely navigates to a page or calls an API that doesn't exist or has the wrong path.

### 9. Statements — Billing Parent Empty

**Bug**: The statements table shows household names but the "Billing Parent" column is empty for all rows. When clicking into a specific household, the billing parent IS shown correctly.

**Cause**: The list endpoint likely doesn't include the billing parent relation in its query. The detail endpoint does.

**Fix**: Add the billing parent include/join to the statements list query.

---

## Sections That Are Good (No Changes)

- **Fee Structures** — intuitive, no changes needed
- **Percentage Discounts** — early bird, early payment, siblings, staff child — all good
- **Fee Assignments** — leave as-is for now (manual assignment is tedious but functional; bulk assignment can come later)
- **Refunds** — no specific issues noted

---

## Key Files to Reference

| Purpose                        | Path                                                     |
| ------------------------------ | -------------------------------------------------------- |
| Finance frontend               | `apps/web/src/app/[locale]/(school)/finance/`            |
| Finance layout (sub-nav)       | `apps/web/src/app/[locale]/(school)/finance/layout.tsx`  |
| Finance backend                | `apps/api/src/modules/finance/`                          |
| Payment service                | `apps/api/src/modules/finance/payments.service.ts`       |
| Invoice service                | `apps/api/src/modules/finance/invoices.service.ts`       |
| Fee generation service         | `apps/api/src/modules/finance/fee-generation.service.ts` |
| Statements service             | `apps/api/src/modules/finance/statements.service.ts`     |
| Sequence service               | `apps/api/src/modules/` (search for SequenceService)     |
| Prisma schema (finance models) | `packages/prisma/schema.prisma`                          |
| Finance Zod schemas            | `packages/shared/src/schemas/`                           |
| Translation files              | `apps/web/messages/en.json`, `apps/web/messages/ar.json` |

---

## Implementation Order

```
Phase A: Quick fixes
  - Sticky sub-nav
  - Fee generation preview 404
  - Statements billing parent empty
  - PDF button fixes (invoices, payments, statements)
  - PDFs open in modal, not download

Phase B: Dashboard redesign
  - Replace 4 summary cards (expected revenue, received, outstanding, collection rate)
  - Replace aging summary with household debt breakdown
  - Remove invoice pipeline + revenue summary
  - Make recent payments clickable (receipt + statement links)

Phase C: Tax removal
  - Remove all tax references from finance (global search + remove)
  - Update schemas, API responses, frontend displays, PDF templates

Phase D: Payment audit
  - Auto-generate payment references (SequenceService)
  - Add "accepted by" field (auto-populated from logged-in user)
  - Add audit view: search by payment reference
  - Add audit view: search by staff member (all their accepted payments)
```

---

**Prompt for the new session:**

```
Read plans/finance-redesign-handover.md and CLAUDE.md for project conventions. Start with Phase A — fix the sticky sub-nav in the finance layout, fix the fee generation preview 404, fix the statements billing parent showing empty, and fix all PDF buttons (invoices, payments, statements). PDFs must open in a modal for review, not download directly. Then Phase B — redesign the finance dashboard with the 4 new summary cards (Expected Revenue, Received Payments, Outstanding, Collection Rate) and replace the aging summary with a household debt breakdown by percentage owed. Then Phase C — remove ALL tax references from the entire finance module. Then Phase D — auto-generate payment references, add "accepted by" audit field, and build the two payment audit views (search by reference, search by staff member).
```
