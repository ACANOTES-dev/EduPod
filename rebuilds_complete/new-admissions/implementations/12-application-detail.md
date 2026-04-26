# Implementation 12 — Application Detail Page Rewrite

> **Wave:** 4 (parallelizable with 10, 11, 13, 14)
> **Depends on:** 01, 03, 07
> **Deploys:** Web restart only

---

## Goal

Rewrite `apps/web/src/app/[locale]/(school)/admissions/[id]/page.tsx` so it reflects the new state machine and surfaces all the information an admin needs to decide on an application: student + parent + household payload, target year group + academic year, payment status (when relevant), notes timeline, override record (when relevant), and the materialised student link (when the app is `approved`).

The existing detail page is built around the old `RecordHub` component with status transition buttons. Keep the visual language — `RecordHub` with tabs is the project convention — but swap out the action set and add new panels.

## What the page must show

### Header

- `RecordHub` with:
  - `title`: student full name.
  - `reference`: application number.
  - `status`: badge reflecting the new `ApplicationStatus` values. Map:
    - `submitted` → info
    - `waiting_list` → neutral (sub-status shown as secondary chip if `awaiting_year_setup`)
    - `ready_to_admit` → warning (action needed)
    - `conditional_approval` → warning (payment pending)
    - `approved` → success
    - `rejected` → danger
    - `withdrawn` → neutral
  - `metrics`:
    - "Submitted" → `submitted_at`
    - "Apply date" → `apply_date` (might differ from submitted for imports)
    - "Target year group" → name
    - "Target academic year" → label
    - "Days in current state" → computed

### Action row (context-sensitive)

The old page has a switch statement on `status`. Keep that pattern but update it:

```ts
switch (application.status) {
  case 'ready_to_admit':
    // Approve → conditional_approval (+ capacity re-check)
    // Reject (with reason)
    // Withdraw (on behalf of parent)
    break;
  case 'conditional_approval':
    // Copy Payment Link
    // Record Cash Payment → opens modal
    // Record Bank Transfer → opens modal
    // Force Approve (role-gated)
    // Reject
    // Withdraw
    break;
  case 'waiting_list':
    // Manual Promote (if seat available — capacity re-check)
    // Reject
    // Withdraw
    break;
  case 'approved':
    // View Student (deep-link to /students/<materialised_student_id>)
    // No state transitions — terminal
    break;
  case 'rejected':
  case 'withdrawn':
    // No actions — terminal
    break;
}
```

Reuse the shared modal components built in impl 11 (`payment-record-modal`, `force-approve-modal`, `reject-dialog`). Don't duplicate.

### Tabs

1. **Application** — the existing `DynamicFormRenderer` read-only view of the payload. No changes needed to the renderer.
2. **Timeline** — new tab. Chronological activity feed:
   - Application submitted at X.
   - Moved to ready_to_admit (auto) / waiting_list (auto with reason) / awaiting_year_setup.
   - Auto-promoted from waiting list at Y.
   - Moved to conditional_approval by <admin> at Z. Payment amount: €X. Deadline: D.
   - Stripe checkout session created at T.
   - Payment received via <source> for €X at P.
   - Override granted by <admin> at Q (if applicable).
   - Approved at R. Student record: <link>.
   - Rejected at S by <admin>. Reason: "…".
   - Withdrawn at U.
   - Note: "…" (from admin or parent)

   Built from the `ApplicationNote` table (which accumulates system-written and admin-written entries) plus any state-transition metadata we store. If the existing table lacks a discriminator between admin notes and system events, add a `source` column (`system` / `admin` / `parent`) in a small follow-up migration in this impl.

3. **Notes** — existing admin-only internal note composer. Reuse existing code.
4. **Payment** — new tab, visible only when the application has ever been in `conditional_approval` or later. Shows:
   - Expected amount (with currency).
   - Payment deadline.
   - Checkout session status (active / expired / consumed).
   - Payment events (`AdmissionsPaymentEvent` rows, if any).
   - Override record (if present): type, justification, approved by, approved at, expected vs actual cents.

### Capacity sidebar panel

Above the tabs, add a small panel: "Target year group capacity". Shows a capacity chip for the app's target (year, year_group). Helps the admin decide at a glance whether Approve is even possible.

## API changes needed

The existing `GET /v1/applications/:id` should return everything the page needs. Extend its response shape to include:

- `target_academic_year: { id, label }`
- `target_year_group: { id, name }`
- `materialised_student: { id, first_name, last_name } | null`
- `override_record: AdmissionOverride | null`
- `payment_events: AdmissionsPaymentEvent[]`
- `capacity: { total, enrolled, conditional, available }` — computed at read time via the capacity service
- `timeline: TimelineEvent[]` — server-assembled from notes + state-transition events

Keep the existing `payload_json` + `form_definition.fields` in the response so the Application tab still renders.

## Notes timeline integration

The old `ApplicationNote` table is append-only. Add a `note_type` column in a small migration:

```prisma
model ApplicationNote {
  // ... existing ...
  note_type ApplicationNoteType @default(admin_note)
}

enum ApplicationNoteType {
  admin_note
  system_event
  parent_action
}
```

Every state-machine transition writes a `system_event` note with a structured description. This lets the timeline tab render without a separate events table.

## Role gates

- `admissions.view`: can see the page.
- `admissions.manage`: can act (approve, reject, record payment).
- Override role: can see/use Force Approve button.
- Navigating to a page for an application whose tenant the user doesn't belong to → 404 (RLS handles this, but render an explicit 404 UX).

## Tests

- Detail page renders with all tabs for an application in each status.
- Action buttons render correctly per status.
- Capacity sidebar shows correct numbers.
- Timeline tab renders system events chronologically.
- Payment tab appears only for applications with payment history.
- Materialised student link appears only for `approved` applications.
- Role gates hide override button.

## Deployment

1. Commit locally.
2. Patch → production (includes small `note_type` migration if following that route — otherwise coordinate with impl 01 or defer).
3. Build `@school/web` (and `@school/api` if the migration is in this impl), restart services.
4. Smoke test: navigate to an application detail page from each queue and verify the correct actions appear.
5. Update `IMPLEMENTATION_LOG.md`.

## Definition of done

- Detail page rewritten with new action set.
- Timeline tab added.
- Payment tab added.
- Capacity sidebar added.
- `note_type` column added (if not already in impl 01).
- Web restarted on production.
- Completion record added to the log.

## Notes for downstream implementations

- **15 (cleanup)** deletes `/admissions/[id]/convert/page.tsx` entirely — this page replaces it.
