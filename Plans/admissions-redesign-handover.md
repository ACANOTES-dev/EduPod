# Admissions Module Redesign — Handover Document

## Purpose

This document provides a new session with everything needed to fix bugs, align the public application form with the internal wizard, and implement the payment-gated submission flow.

---

## User's Vision (Summary)

The public admission form must mirror the internal Registration Wizard exactly (same fields, same steps). Email becomes mandatory for online applications. Payment via Stripe is required before an application enters the queue as "submitted". A cash fallback option keeps the application as "draft" with a 14-day auto-expiry warning. The household reference number becomes the parent's initial login password — it must be randomised, not sequential.

---

## Current Architecture

### Database Models (schema.prisma)

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `AdmissionFormDefinition` | Form template with versioning | `name`, `status` (draft/published/archived), `version_number`, `base_form_id` |
| `AdmissionFormField` | Individual field on a form | `field_key`, `label`, `field_type`, `required`, `display_order`, `options_json`, `validation_rules_json` |
| `Application` | Individual application | `application_number`, `student_first_name`, `student_last_name`, `status`, `payload_json` (JSONB with all answers), `submitted_at`, `reviewed_at` |
| `ApplicationNote` | Append-only notes on applications | `note`, `is_internal`, `author_user_id` |

### Application Status Lifecycle

```
draft → submitted → under_review → accepted → converted to student
                  → rejected                 → withdrawn
```

With approval workflow enabled:
```
under_review → pending_acceptance_approval → accepted
```

### Backend Services (`apps/api/src/modules/admissions/`)

| File | Purpose |
|------|---------|
| `admission-forms.service.ts` | Form CRUD, publish/archive, versioning |
| `applications.service.ts` | Application lifecycle, status transitions, convert to student |
| `public-admissions.controller.ts` | Unauthenticated form retrieval + application submission |
| `parent-applications.controller.ts` | Parent-authenticated application management |

### Frontend Pages (`apps/web/src/app/[locale]/(school)/admissions/`)

| Route | Purpose |
|-------|---------|
| `/admissions` | Application list with funnel summary |
| `/admissions/[id]` | Application detail (form data, notes, timeline, actions) |
| `/admissions/[id]/convert` | Convert accepted application to student |
| `/admissions/forms` | Form management (list, create, publish, archive) |
| `/admissions/forms/new` | Form builder |
| `/admissions/forms/[id]` | Edit form |
| `/admissions/analytics` | Funnel analytics |

### Registration Wizard (the internal equivalent)

**Location**: `apps/web/src/app/[locale]/(school)/_components/registration-wizard/registration-wizard.tsx`

The wizard has 5 steps:
1. Parent & Household (parent first/last name, email, phone, relationship, second parent, household address, emergency contact)
2. Students (first name, middle name, last name, DOB, gender, year group, national ID, medical notes, allergies)
3. Fee Summary
4. Payment
5. Complete

**This wizard's field set is the canonical template for the public application form.**

---

## Changes Required

### 1. Sidebar Restructure

Split current "Operations" section:

```
Operations:              Financials:
  - Admissions             - Finance
  - Communications         - Payroll
  - Approvals
```

**File**: `apps/web/src/app/[locale]/(school)/layout.tsx` — note this file has been modified by other sessions (scheduling restructure collapsed items, some icons removed). Read the current state before editing.

Add nav translation keys: `nav.financials` in both `en.json` and `ar.json`.

### 2. Public Application Form = Wizard Template

**Hard requirement**: The published admission form MUST have fields that match exactly what the Registration Wizard collects, plus email as mandatory.

**Approach**: Instead of using the generic form builder, create a **system form** that is auto-generated with the correct fields. The form builder can still exist for customisation, but the default published form must include these mandatory system fields:

**Parent/Guardian section:**
- `parent1_first_name` (required)
- `parent1_last_name` (required)
- `parent1_email` (required — **mandatory for online, optional in wizard**)
- `parent1_phone` (required)
- `parent1_relationship` (required — father/mother/guardian/other)
- `parent2_first_name` (optional)
- `parent2_last_name` (optional)
- `parent2_email` (optional)
- `parent2_phone` (optional)
- `parent2_relationship` (optional)

**Household section:**
- `household_name` (optional — auto-generated from student last name if blank)
- `address_line_1` (required)
- `address_line_2` (optional)
- `city` (required)
- `country` (required)
- `postal_code` (optional)

**Emergency contact section:**
- `emergency_name` (optional)
- `emergency_phone` (optional)
- `emergency_relationship` (optional)

**Student section (per student — support multiple):**
- `student_first_name` (required)
- `student_middle_name` (optional)
- `student_last_name` (required)
- `student_dob` (required)
- `student_gender` (required)
- `student_year_group` (required — dropdown of year groups)
- `student_national_id` (required)
- `student_medical_notes` (optional)
- `student_allergies` (boolean)

These fields ensure 1:1 mapping when converting an accepted application to a student record. No data is lost, no fields are missing.

### 3. Household Reference Number — Randomised Format

**Current**: Sequential via `tenant_sequences` table (e.g., `HH-202603-00001`).

**New format**: `XXX999-9` — three random uppercase letters + three random digits + hyphen + single random digit.

Example: `SJF558-5`, `MKR221-8`, `BYT903-1`

**Why**: This reference number doubles as the parent's **initial login password** for the parent portal. Sequential numbers are predictable and insecure. Randomised references are effectively one-time passwords.

**Implementation**:
- Modify the household reference generation in the sequence service or wherever household references are created
- Add collision check (generate, check uniqueness within tenant, retry if collision)
- This applies to ALL household creation paths: wizard, convert-from-application, manual creation
- The reference is displayed to the parent after application submission: "Your login credentials: Email: [their email], Password: [household reference]"

**Files to modify**:
- Search for household reference/number generation — likely in `apps/api/src/modules/households/` or the sequence service
- The Registration Wizard completion step should display these credentials
- The public application confirmation should display these credentials

### 4. Payment-Gated Registration (Stripe) — No Pay = No Register

**This is NOT an application fee. This is the full tuition/registration fee.** Schools suffer from bad debts (parents refusing to pay). This system enforces: no payment = no registration. Either pay in full online, or speak to admin for a payment plan — but the application does not enter the queue without payment.

**Flow for online applications:**

```
Parent fills form → Fee Summary step shows:
  - Year group fee (from fee structure)
  - Early bird discount (if applicable based on current date)
  - Total due

Parent selects payment method:

  Option A: Pay Online (Stripe)
    → Stripe checkout for the full fee amount (with early bird discount applied)
    → On successful payment → Application status = 'submitted'
    → Application enters the admissions queue
    → Parent receives confirmation with credentials

  Option B: Arrange Payment with School (Cash/Payment Plan)
    → Application status = 'draft' (NOT submitted)
    → Parent sees warning message:
      "Your application is saved but NOT complete. Please contact the school
       to arrange payment within 14 days. After 14 days, your application
       will expire and you will need to resubmit."
    → Application has `payment_deadline` = now + 14 days
    → A scheduled job checks for expired draft applications and auto-cancels them
    → School admin can:
      a) Mark full payment received → transitions to 'submitted'
      b) Set up a payment plan → transitions to 'submitted' with plan attached
      c) Waive fees (exceptional cases) → transitions to 'submitted'
```

**Early Bird Discount Configuration (tenant settings):**

The school owner configures discount tiers in settings. Each tier has a deadline date and a discount percentage. The system automatically applies the best applicable discount based on the submission date.

```typescript
// In tenant settings schema under admissions:
earlyBirdDiscounts: z.array(z.object({
  deadline: z.string(), // ISO date, e.g. "2025-08-01"
  discount_percent: z.number().min(0).max(100), // e.g. 10
  label: z.string(), // e.g. "Early Bird - 10% off"
})).default([])

// Example configuration:
[
  { deadline: "2025-08-01", discount_percent: 10, label: "Early Bird — 10% off" },
  { deadline: "2025-09-01", discount_percent: 5, label: "Early Registration — 5% off" }
]
```

The fee summary step calculates:
1. Look up the fee structure for the selected year group
2. Check today's date against early bird tiers (sorted by deadline ascending)
3. Apply the first tier where `today < deadline`
4. Display: original fee, discount amount, final amount due

**Database changes needed:**
- Add to `Application` model:
  - `payment_status` (enum: `pending`, `paid_online`, `paid_cash`, `payment_plan`, `waived`)
  - `payment_amount` (Decimal, nullable — the amount actually paid/owed)
  - `discount_applied` (Decimal, nullable — early bird discount amount)
  - `payment_deadline` (Timestamptz, nullable — set to +14 days for cash option)
  - `stripe_payment_intent_id` (VARCHAR, nullable)
- Add `earlyBirdDiscounts` to tenant settings under `admissions` section
- The fee structure per year group already exists in the finance module — reuse it

**Stripe integration:**
- The project already has Stripe config (`apps/api/src/modules/configuration/stripe-config.service.ts`)
- The finance module already has payment processing patterns to follow
- Create a Stripe PaymentIntent when the parent selects "Pay Online"
- On webhook confirmation, transition the application to 'submitted'

**Admin manual payment:**
- Add endpoint: `POST /api/v1/applications/:id/mark-payment-received`
- Permission: `admissions.manage`
- Transitions `payment_status` from `pending` to `paid_cash` and application status from `draft` to `submitted`

**Auto-expiry job:**
- Add a scheduled job (BullMQ repeatable) that runs daily
- Finds applications where `status = 'draft'` AND `payment_deadline < now()`
- Transitions them to `withdrawn` with an auto-note: "Application expired — payment not received within 14 days"

### 5. Rejection Requires a Note

When transitioning an application to `rejected`, the `note` field must be mandatory.

**Implementation:**
- Modify `ApplicationsService.review()` — when `status = 'rejected'`, require a `rejection_reason` in the request body
- Store as an `ApplicationNote` (internal) attached to the application
- Frontend: show a text area that is required before the reject button is enabled

---

## Bugs to Fix

### Bug 1: Summary counts don't match row statuses
**Location**: `/admissions` page
**Issue**: Top cards show zeros (submitted: 0, under review: 0, accepted: 0) but rows show various statuses.
**Likely cause**: The analytics endpoint (`GET /api/v1/applications/analytics`) may be filtering by date range or form_definition_id in a way that excludes existing records. Or the frontend is reading the response incorrectly.
**Fix**: Check what params the frontend sends to the analytics endpoint. Check if the response structure matches what the frontend expects.

### Bug 2: "No admission form yet" on application detail
**Location**: `/admissions/[id]` → Application tab
**Issue**: Shows "Create your first form" message despite a form existing.
**Likely cause**: The application detail page tries to load the form definition via `form_definition_id` on the application, but the query fails or returns null (possibly the form was archived, or the include/relation isn't resolving).
**Fix**: Check the application detail API response — does it include the `form_definition` relation? Check the frontend — does it look at the right property?

### Bug 3: "Start Review" fails with 404
**Location**: `/admissions/[id]` → "Start Review" button
**Root cause found**: Frontend calls `POST /api/v1/applications/{id}/start-review` but the backend route is `POST /api/v1/applications/{id}/review`. URL mismatch.
**Additional issue**: The `/review` endpoint expects a body with `{ status: 'under_review' }` but the frontend sends an empty body.
**Fix**: Change the frontend `handleStatusAction` to call the correct URL with the correct body.

### Bug 4: Convert to student breaks
**Location**: `/admissions/[id]/convert`
**Likely cause**: Conversion requires `year_group_id` in the request body. If the form didn't collect year group, or the conversion page doesn't map it, the API rejects it. Also, the form fields may not provide all required student fields (gender, national_id, household info).
**Fix**: After implementing change #2 (form = wizard template), conversion will have all required fields. In the meantime, fix the conversion page to properly collect missing fields.

### Bug 5: Form fields don't match student creation fields
**This is addressed by Change #2 above** — making the admission form mirror the wizard template.

---

## Key Files to Reference

| Purpose | Path |
|---------|------|
| Registration Wizard (canonical field template) | `apps/web/src/app/[locale]/(school)/_components/registration-wizard/registration-wizard.tsx` |
| Admissions backend | `apps/api/src/modules/admissions/` |
| Application service (lifecycle, conversion) | `apps/api/src/modules/admissions/applications.service.ts` |
| Admission forms service | `apps/api/src/modules/admissions/admission-forms.service.ts` |
| Public admissions controller | `apps/api/src/modules/admissions/public-admissions.controller.ts` |
| Admissions frontend pages | `apps/web/src/app/[locale]/(school)/admissions/` |
| Public application page | `apps/web/src/app/[locale]/(public)/admissions/` |
| Stripe config service | `apps/api/src/modules/configuration/stripe-config.service.ts` |
| Finance payment patterns | `apps/api/src/modules/finance/` |
| Household service (reference generation) | `apps/api/src/modules/households/` |
| Sequence service | `apps/api/src/modules/` (search for SequenceService) |
| Tenant settings schema | `packages/shared/src/schemas/tenant.schema.ts` |
| Sidebar navigation | `apps/web/src/app/[locale]/(school)/layout.tsx` |
| Translation files | `apps/web/messages/en.json`, `apps/web/messages/ar.json` |

---

## Implementation Order

```
Phase A (bug fixes)
  - Fix start-review URL mismatch
  - Fix summary count disconnect
  - Fix "no form" message on application detail
  - Fix convert to student

Phase B (sidebar + form alignment)
  - Split Operations → Operations + Financials in sidebar
  - Create system admission form matching wizard fields
  - Make email mandatory for online submissions
  - Randomise household reference number format (XXX999-9)

Phase C (payment gate)
  - Add payment fields to Application model (migration)
  - Add application fee setting to tenant settings
  - Implement Stripe PaymentIntent for online payment
  - Implement cash fallback with 14-day deadline
  - Add admin "mark payment received" endpoint
  - Add auto-expiry scheduled job for unpaid drafts
  - Add rejection-requires-note enforcement

Phase D (parent portal credentials)
  - Display household reference as initial password after submission
  - Ensure parent portal login accepts email + household reference
  - First-login password change flow (optional, but recommended)
```

**Prompt for the new session:**

```
Read plans/admissions-redesign-handover.md. Start with Phase A — fix the 4 bugs (start-review URL mismatch is confirmed, others need investigation). Then proceed to Phase B (sidebar split, form alignment with wizard, randomised household reference). Phase C (Stripe payment gate) is the largest piece and may need its own session.
```
