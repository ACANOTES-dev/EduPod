# Admissions

The Admissions module manages the pipeline from public application through financially-gated approval to Student record creation.

## Source of truth

- **Plan:** `new-admissions/PLAN.md` — product vision, state machine, data model, capacity math, payment flow, component map.
- **Implementation log:** `new-admissions/IMPLEMENTATION_LOG.md` — wave structure, per-impl completion records, deployment matrix.
- **Implementation files:** `new-admissions/implementations/*.md` — per-step recipes.

## Capabilities

- **Two application paths**: the existing walk-in `RegistrationWizard` (desk-side, unchanged) and the new public form under `/apply/[tenantSlug]` (rate-limited, honeypot, tenant slug resolution).
- **Financial gate**: no student is created until the upfront admission fee is paid in full (Stripe Checkout, cash, or bank transfer) or an authorised admin force-approves with a justification recorded on `AdmissionOverride`.
- **Capacity-aware state machine**: every transition re-checks year-group seat availability inside the caller's RLS transaction; `conditional_approval` holds a seat so concurrent approvals cannot oversubscribe.
- **FIFO waiting list** with auto-promotion when a new class is added, when a year group is activated for the first time, or when a conditional approval lapses past its 7-day payment deadline.
- **Admin dashboard**: hub with KPI strip, role-filtered card grid, and four queue sub-pages (Ready to Admit, Waiting List, Conditional Approval, Rejected). Detail page with Timeline and Payment tabs.
- **Public form**: QR code on posters / school website resolves `[tenantSlug]` → tenant, renders the system form via `DynamicFormRenderer`, submits through rate-limited `POST /v1/public/admissions/applications`.
- **Audit trail**: every override writes to `AdmissionOverride`; the Overrides Log page (pending) surfaces them to the principal/owner.

## Permissions

- `admissions.view`: read access to applications, queues, dashboard.
- `admissions.manage`: full lifecycle actions (approve, reject, record payment, manual promote).
- Admin override (`forceApproveWithOverride`) is additionally gated to `school_owner` / tenant-configured `require_override_approval_role` (default `school_principal`).

Default role assignments: `school_owner`, `school_principal`, `school_vice_principal`, `admin`, `front_office` get both. Teachers and parents get neither.

## Architecture touch-points

See `docs/architecture/module-blast-radius.md` (AdmissionsModule entry) for imports/exports and cross-module hooks, `docs/architecture/state-machines.md` (ApplicationStatus section) for the full state graph, and `docs/architecture/event-job-catalog.md` (admissions queues + notifications jobs) for the job flows.

## Tenant settings

Under `tenant.settings.admissions`:

- `upfront_percentage` (default 100) — percent of net annual fees due upfront.
- `payment_window_days` (default 7) — days before conditional approval lapses.
- `max_application_horizon_years` (default 2) — how far ahead parents can apply.
- `allow_cash` / `allow_bank_transfer` — payment channel toggles.
- `bank_iban` — shown on bank transfer instructions.
- `require_override_approval_role` — role allowed to force-approve without payment.
