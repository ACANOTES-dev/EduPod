# Family Registration Wizard — Design Specification

## Problem

Registering a family in-person requires the admin to create a household, then navigate to students to add each child individually, then navigate to finance to check fees, then navigate to payments to record a deposit. For a family with 3 children, this takes ~15 minutes across 4+ screens. With 20 families queuing in September, this workflow is unsustainable.

## Solution

A single "Register Family" wizard that captures everything in one flow: parent details, household, all students, fee summary, and optional payment. The admin never leaves the wizard. Nothing is saved until the parent agrees to the fees. Total time per family: ~5-7 minutes.

---

## Wizard Overview

| Step | Title | Purpose | Saves Data? |
|------|-------|---------|-------------|
| 1 | Parent & Household | Capture parent(s), household, emergency contact | No |
| 2 | Students | Add all children with year groups | No |
| 3 | Fee Summary | Show annual fees, discounts, grand total | No |
| 4 | Payment | Record optional payment | Yes (Step 3 confirm triggers atomic save, Step 4 saves payment) |
| 5 | Complete | Summary, print, email receipt | No (display only) |

**Nothing is persisted to the database until the admin clicks "Confirm & Register" on Step 3.** This means if a parent sees the fees and walks away, zero cleanup is needed.

---

## Entry Point

- **Location**: Top of the sidebar, above all navigation items
- **Visibility**: Only shown to users with the `students.manage` permission (school owners, school admins). Not visible to teachers or parents.
- **Appearance**: Prominent blue button with `+` icon: "Register Family"
- **Behaviour**: Opens a large modal overlay (90% viewport width/height) with a backdrop. The wizard renders inside this modal. Closing the modal (X button or Cancel) prompts a confirmation if any data has been entered.

---

## Step 1 — Parent & Household

### Primary Parent / Guardian (Required)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| First Name | text | Yes | |
| Last Name | text | Yes | |
| Email | email (LTR) | No | Used for receipt emails. Auto-links to existing User if email matches. |
| Phone | tel (LTR) | Yes | |
| Relationship | select | Yes | Father, Mother, Guardian, Other |

### Second Parent / Guardian (Optional)

- Collapsed by default with "+ Add Second Parent / Guardian" prompt
- When expanded, shows the same fields as primary parent
- Can be collapsed/removed

### Household (Auto-derived)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Household Name | text | Yes | Auto-filled from primary parent's last name + "Family". Editable. |
| Address Line 1 | text | No | |
| Address Line 2 | text | No | |
| City | text | No | |
| Country | text | No | |
| Postal Code | text | No | |

### Emergency Contact (Required, 1 minimum)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Contact Name | text | Yes | |
| Phone | tel (LTR) | Yes | |
| Relationship | text | Yes | e.g. Uncle, Grandparent |

- "+ Add Another Emergency Contact" button (max 3)

### Auto-populated (invisible to admin)

- `household_number`: auto-generated via SequenceService (HH-YYYYMM-NNNNNN)
- `primary_billing_parent_id`: set to primary parent
- `needs_completion`: set to `false` (both emergency contact and billing parent exist)
- Primary parent: `is_primary_contact: true`, `is_billing_contact: true`
- Secondary parent (if provided): `is_primary_contact: false`, `is_billing_contact: false`
- `preferred_contact_channels`: `['email']` if email provided, otherwise `['sms']`
- `HouseholdParent.role_label`: copied from parent's `relationship_label` (e.g. "Father", "Mother")

---

## Step 2 — Students

### Accordion Pattern

Each student is an accordion section:
- **Collapsed state**: Shows number badge, full name, year group, gender, DOB, and a "Complete" checkmark
- **Expanded state**: Shows the full edit form
- Only one student can be expanded at a time
- Last name auto-fills from the household name (editable)

### Student Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| First Name | text | Yes | |
| Last Name | text | Yes | Auto-filled from parent's last name |
| Date of Birth | date (LTR) | Yes | |
| Gender | select | Yes | Male, Female, Other, Prefer not to say |
| Year Group | select | Yes | Fetched from active year groups |
| National ID | text (LTR) | Yes | |

### Auto-populated (invisible to admin)

- `student_number`: auto-generated via SequenceService (STU-YYYYMM-NNNNNN)
- `full_name`: derived from `first_name + ' ' + last_name`
- `entry_date`: set to today
- `status`: set to `applicant`
- `household_id`: from Step 1
- `parent_links`: both parents linked automatically with `relationship_label` from parent's relationship

### Controls

- "+ Add Another Student" button below the accordion stack
- Students can be removed (trash icon) if more than one exists
- Minimum 1 student required to proceed

---

## Step 3 — Fee Summary

### Auto-Assignment Logic

When the admin arrives at Step 3, the system:

1. For each student, queries all **active** `FeeStructure` records where:
   - `year_group_id` matches the student's selected year group, OR
   - `year_group_id` is NULL (household-level fees that apply to all)
2. Calculates the annual amount for each fee:
   - `one_off`: amount as-is
   - `term`: amount x number of terms in the active academic year
   - `monthly`: amount x 12
   - `custom`: amount as-is (treated as annual)
3. Lists all **active** `Discount` records in the discounts section for the admin to see — but does **not** auto-apply any. The admin manually adds discounts via the inline form (either selecting an existing discount or creating an ad-hoc one). The Discount model has no criteria fields for automatic matching.

### Display Structure

```
Student 1: Ahmad Al-Sheikh — Year 1
  Annual Tuition (Year 1)          €4,500.00  [✕ remove]
  Textbook Fee (Year 1)              €150.00  [✕ remove]
  ─────────────────────────────────────────
  Subtotal                         €4,650.00

Student 2: Fatima Al-Sheikh — Year 4
  Annual Tuition (Year 4)          €5,200.00  [✕ remove]
  Textbook Fee (Year 4)              €200.00  [✕ remove]
  Uniform Fee                        €120.00  [✕ remove]
  ─────────────────────────────────────────
  Subtotal                         €5,520.00

Discounts
  Sibling Discount (10%)          -€1,017.00
  [+ Add Custom Discount: label ___  amount €___ ]

═══════════════════════════════════════════
ANNUAL TOTAL                       €9,153.00
Al-Sheikh Family · 2 students
```

### Fee Removal

Each fee line has a remove (✕) button. Removing a fee means it won't be assigned to this household. The admin can remove fees that don't apply (e.g. the family already has uniforms from a sibling).

### Discounts Section

Two ways to add discounts:

1. **Select existing discount**: Dropdown of active `Discount` records. Select one and it applies its configured value (fixed or percent) to the total.
2. **Ad-hoc discount**: Inline form with label input + currency amount input + "Add" button. Creates a negative `InvoiceLine` on the invoice with the label as description and the amount as a negative `line_total`. This does NOT create a `Discount` entity — it's a one-time invoice adjustment, avoiding unique name conflicts and keeping the reusable discount catalog clean.

Both types appear in the Discounts section of the fee summary and are fully visible on the invoice and statement.

### Confirm & Register Button

- Green button: "Confirm & Register"
- This triggers the **atomic save** of everything:
  1. Create Household (with `household_number`, address, emergency contacts)
  2. Create Parent(s) (with auto-link to User if email matches)
  3. Link Parent(s) to Household (`HouseholdParent`)
  4. Set primary billing parent on Household
  5. Create Student(s) (with auto-generated `student_number`, `entry_date`, `national_id`)
  6. Link Student(s) to Parent(s) (`StudentParent`)
  7. Create `HouseholdFeeAssignment` records for each fee-student pair (with `effective_from` set to today)
  8. For selected existing discounts, create `HouseholdFeeAssignment` records with `discount_id`
  9. Generate a single `Invoice` with line items for all fees. Ad-hoc discounts are added as negative `InvoiceLine` entries. Existing discounts are applied via the fee assignment's discount reference. `billing_period_start` and `billing_period_end` set to the active academic year's start/end dates.
  10. Set invoice status to `draft`, then call the existing `InvoicesService.issue()` method which respects the tenant's `requireApprovalForInvoiceIssue` setting. If approval is required, the invoice goes to `pending_approval`; otherwise it goes to `issued`. `due_date` set based on tenant's `defaultPaymentTermDays` setting.

All within a single Prisma interactive transaction with RLS context.

---

## Step 4 — Payment (Optional)

### Context

After the atomic save, the wizard shows a success banner confirming the family was registered and the invoice was created. The admin is then asked: "Would you like to record a payment now?"

### Payment Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Payment Amount | currency (LTR) | Yes | Defaults to invoice total. Can be partial. |
| Payment Method | select | Yes | Cash, Bank Transfer, Card (Manual), Stripe |
| Reference / Notes | text | No | Auto-generated as `REG-{household_number}` if left blank. Admin can override. |
| Date Received | date (LTR) | Yes | Defaults to today |

### Balance Display

Shows a running calculation:
```
Invoice Total:      €9,153.00
This Payment:      -€2,000.00
─────────────────────────────
Remaining Balance:  €7,153.00
```

### Actions

- **"Record Payment"**: Creates the payment, auto-allocates to the invoice (FIFO), auto-generates receipt, proceeds to Step 5
- **"Skip — No Payment"**: Proceeds to Step 5 without recording payment

### Behind the Scenes

1. Create `Payment` record with status `posted`
2. Create `PaymentAllocation` linking payment to invoice
3. Recalculate invoice `balance_amount` and derive status (`partially_paid` or `paid`)
4. Auto-generate `Receipt` with receipt number via SequenceService (inside the payment transaction)
5. Send receipt email to billing parent's email address asynchronously via the notification queue (fire-and-forget — does not block the wizard)

---

## Step 5 — Complete

### Success Display

- Large checkmark icon
- "Registration Complete" heading
- Summary line: family name, student count, payment amount
- Email confirmation: "Receipt sent to mohammed@email.com"

### Summary Table

| Item | Value |
|------|-------|
| Household | Al-Sheikh Family (HH-202603-000012) |
| Students | Ahmad (STU-202603-000227), Fatima (STU-202603-000228) |
| Annual Fees | €9,153.00 |
| Payment Recorded | €2,000.00 (Cash) |
| Outstanding Balance | €7,153.00 |

### Print Buttons

Two buttons side by side:

1. **Print Receipt** — Opens the receipt PDF in a new browser tab via the existing `PdfRenderingService`. The admin prints from the browser's native print dialog.
2. **Print Statement** — Opens the household finance statement PDF in a new tab via the existing `HouseholdStatementsService`.

Both use the billing parent's preferred locale (or tenant default) for the PDF language.

### Close

- "Done — Close Wizard" button closes the modal and returns to whatever page the admin was on
- The underlying page does not need to refresh — the wizard is self-contained

---

## Permissions

Both endpoints use the existing `students.manage` permission — no new permissions needed. This permission is already assigned to `school_owner` and `school_admin` roles.

- `POST /api/v1/registration/family` — `@RequiresPermission('students.manage')`
- `POST /api/v1/registration/family/preview-fees` — `@RequiresPermission('students.manage')`

---

## Backend: New API Endpoint

### `POST /api/v1/registration/family`

A single endpoint that handles the entire atomic registration.

**Request Body:**

```typescript
interface FamilyRegistrationDto {
  // Parent(s)
  primary_parent: {
    first_name: string;
    last_name: string;
    email?: string;
    phone: string;
    relationship_label: string;
  };
  secondary_parent?: {
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    relationship_label: string;
  };

  // Household
  household: {
    household_name: string;
    address_line_1?: string;
    address_line_2?: string;
    city?: string;
    country?: string;
    postal_code?: string;
  };

  // Emergency contacts
  emergency_contacts: {
    contact_name: string;
    phone: string;
    relationship_label: string;
  }[];

  // Students
  students: {
    first_name: string;
    last_name: string;
    date_of_birth: string;
    gender: 'male' | 'female' | 'other' | 'prefer_not_to_say';
    year_group_id: string;
    national_id: string;
  }[];

  // Fee selections (from Step 3)
  fee_assignments: {
    student_index: number; // references students array index
    fee_structure_id: string;
  }[];

  // Existing discounts (from the Discount catalog)
  applied_discounts: {
    discount_id: string;
    fee_assignment_index: number; // references fee_assignments array index
  }[];

  // Ad-hoc discounts (one-time invoice line adjustments)
  adhoc_adjustments: {
    label: string;
    amount: number; // positive value — will be stored as negative line_total
  }[];
}
```

**Response:**

```typescript
interface FamilyRegistrationResult {
  household: { id: string; household_number: string; household_name: string };
  parents: { id: string; first_name: string; last_name: string }[];
  students: { id: string; student_number: string; first_name: string; last_name: string }[];
  invoice: { id: string; invoice_number: string; total_amount: number; balance_amount: number };
}
```

### `POST /api/v1/registration/family/preview-fees`

A read-only endpoint that calculates fees without saving anything.

**Request Body:**

```typescript
interface PreviewFeesDto {
  students: {
    year_group_id: string;
  }[];
}
```

**Response:**

```typescript
interface PreviewFeesResult {
  students: {
    student_index: number;
    year_group_name: string;
    fees: {
      fee_structure_id: string;
      name: string;
      billing_frequency: string;
      base_amount: number;
      annual_amount: number; // calculated based on frequency
    }[];
    subtotal: number;
  }[];
  available_discounts: {
    discount_id: string;
    name: string;
    discount_type: 'fixed' | 'percent';
    value: number;
  }[];
  grand_total: number;
}
```

---

## Frontend: New Components

### File Structure

```
apps/web/src/app/[locale]/(school)/_components/
  registration-wizard/
    registration-wizard.tsx        # Main modal + step orchestration
    step-parent-household.tsx      # Step 1
    step-students.tsx              # Step 2
    step-fee-summary.tsx           # Step 3
    step-payment.tsx               # Step 4
    step-complete.tsx              # Step 5
```

### Sidebar Integration

The "Register Family" button is added to the sidebar layout component. It renders the `RegistrationWizard` modal when clicked.

### State Management

All wizard state is held in a single `useReducer` in `registration-wizard.tsx`. No global state. The state resets when the modal closes.

```typescript
interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  primaryParent: ParentFormData;
  secondaryParent: ParentFormData | null;
  household: HouseholdFormData;
  emergencyContacts: EmergencyContactData[];
  students: StudentFormData[];
  feePreview: PreviewFeesResult | null;
  removedFees: string[]; // fee_structure_ids removed by admin
  appliedDiscounts: { discount_id: string; fee_assignment_index: number }[];
  adhocAdjustments: { label: string; amount: number }[];
  registrationResult: FamilyRegistrationResult | null;
  paymentResult: PaymentResult | null;
}
```

---

## Error Handling

- **Validation errors**: Inline field-level errors on each step. The "Next" button is disabled until required fields are filled.
- **API errors**: Toast notification with error message. The wizard stays on the current step.
- **Transaction failure**: If the atomic save fails, nothing is persisted. The admin can retry.
- **Duplicate detection**: If a parent with the same email already exists as a Parent in this tenant, warn the admin and offer to link to the existing parent instead of creating a new one.

---

## Email Notification

After payment is recorded (Step 4), the system sends a receipt email to the billing parent's email address:

- Uses the existing notification infrastructure
- Template: receipt PDF attached
- Fallback: if no email is provided, skip silently (the admin can still print)
- Triggered regardless of whether the admin prints — ensures the parent always has a record

---

## RTL / i18n Considerations

- All wizard text uses translation keys via `useTranslations()`
- LTR enforcement on: email, phone, national ID, currency amounts, dates, student/household numbers
- The fee summary table uses `text-end` for amounts (logical, not physical)
- Print PDFs render in the billing parent's preferred locale

---

## What This Does NOT Cover

- Online/parent-facing registration (handled by the admissions module)
- Stripe payment processing (the Stripe option records the payment manually; actual Stripe integration is separate)
- Editing a registration after completion (use existing household/student/finance pages)
- Bulk import of families (separate feature)
