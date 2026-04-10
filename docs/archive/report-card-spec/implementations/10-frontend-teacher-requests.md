# Implementation 10 — Frontend Teacher Requests

**Wave:** 3 (frontend fan-out)
**Depends on:** 01, 05 (teacher requests backend)
**Blocks:** nothing
**Can run in parallel with:** 07, 08, 09
**Complexity:** low-medium

---

## 1. Purpose

Build the teacher requests frontend: a submission flow for teachers (submit window-reopen or regenerate requests), a queue for principals to review, and a detail view for individual requests. Approved requests route the principal into the pre-filled wizard or modal from impl 08/09.

**Authoritative design:** `report-card-spec/design-spec.md` Section 10.

---

## 2. Scope

### In scope

1. `/[locale]/(school)/report-cards/requests/page.tsx` — list view (teacher "my requests" + admin pending queue)
2. `/[locale]/(school)/report-cards/requests/new/page.tsx` — submit new request
3. `/[locale]/(school)/report-cards/requests/[id]/page.tsx` — request detail + approve/reject actions
4. Translation keys
5. E2E tests

### Out of scope

- Request backend (impl 05)
- Window modal (already in impl 08)
- Wizard pre-fill logic (already in impl 09 — this impl just routes to it with query params)

---

## 3. Prerequisites

1. Impl 05 merged
2. Impl 08 and 09 ideally merged (for the routing targets), but not strictly required — the routing can be a TODO if those pages don't exist yet

---

## 4. Task breakdown

### 4.1 List view

**File:** `apps/web/src/app/[locale]/(school)/report-cards/requests/page.tsx`

**Two personas, one page:**

- **Teacher view** (`report_cards.comment` without `manage`): shows "My requests" — `GET /v1/report-card-teacher-requests?my=true`
- **Admin view** (`report_cards.manage`): shows a tab-switcher:
  - "Pending review" (default) — `GET /v1/report-card-teacher-requests?status=pending`
  - "All requests" — `GET /v1/report-card-teacher-requests`
  - "My requests" — `GET /v1/report-card-teacher-requests?my=true`

**Table columns:**

- Requester (admin view only)
- Type (window reopen / regenerate)
- Period
- Scope summary (for regenerate: "2A — English" or "3 students")
- Reason (truncated, full on hover)
- Status badge
- Requested at
- Actions:
  - Teacher: "Cancel" (own pending only)
  - Admin: "Review" → opens detail page

Header "New request" button (teachers only, or admins submitting on behalf).

### 4.2 Submit request page

**File:** `apps/web/src/app/[locale]/(school)/report-cards/requests/new/page.tsx`

**Form (react-hook-form + zodResolver):**

- Request type radio (window reopen / regenerate)
- Academic period select
- If regenerate:
  - Scope mode radio (year group / class / individual)
  - Scope selector (multi-select for year/class, search for individual)
- Reason textarea (required, ≥ 10 chars)
- Submit button

**Pre-fill support via query params:** if the user arrives with `?type=regenerate_reports&class_id=X&period_id=P`, pre-fill those fields. This is how impl 08's "Request window reopen" button routes here.

**On submit:** `POST /v1/report-card-teacher-requests`. On success: redirect to list page with toast.

### 4.3 Detail view

**File:** `apps/web/src/app/[locale]/(school)/report-cards/requests/[id]/page.tsx`

**Layout:**

- Header: request type + status badge
- Details card: requester, period, scope, reason, review note (if any), timestamps
- Admin actions (visible only to `report_cards.manage` and only on `pending` requests):
  - **Approve & open** — sends `PATCH /.../approve` with `auto_execute = false`, then navigates the admin to:
    - For `open_comment_window`: `/report-comments` with `?open_window_period=<id>` query param → impl 08's page reads this and opens the window modal pre-filled
    - For `regenerate_reports`: `/report-cards/generate?scope_mode=<>&scope_ids=<>&period_id=<>` → impl 09's wizard reads this and skips to the review step
  - **Auto-approve & execute** — sends `PATCH /.../approve` with `auto_execute = true` → backend immediately opens the window or starts the run, no further UI
  - **Reject** — opens a modal with a review note textarea → sends `PATCH /.../reject`

**Teacher view:**

- Read-only details
- If `status = pending`, show a "Cancel request" button

### 4.4 Approval routing implementation details

- **Open comment window redirect:** impl 08 must be updated to detect the query param `?open_window_period=<id>` and automatically open the window modal with that period pre-selected. This is a small addition to impl 08's landing page — coordinate with whoever did impl 08 to land this change in a small PR, or include it here if impl 08 is already merged.
- **Wizard pre-fill:** similarly, impl 09's wizard must detect query params `?scope_mode=...&scope_ids=...&period_id=...` and jump to step 6 (review) with these selections. Coordinate or add.

### 4.5 Translation keys

```json
{
  "reportCards": {
    "requests": {
      "title": "Report Card Requests",
      "newRequest": "New request",
      "tabPending": "Pending review",
      "tabAll": "All",
      "tabMine": "My requests",
      "colRequester": "Requester",
      "colType": "Type",
      "colPeriod": "Period",
      "colScope": "Scope",
      "colReason": "Reason",
      "colStatus": "Status",
      "colRequestedAt": "Requested",
      "colActions": "Actions",
      "typeWindow": "Window reopen",
      "typeRegenerate": "Regenerate reports",
      "status": {
        "pending": "Pending",
        "approved": "Approved",
        "rejected": "Rejected",
        "completed": "Completed",
        "cancelled": "Cancelled"
      },
      "submit": {
        "title": "New Report Card Request",
        "requestType": "Request type",
        "period": "Period",
        "scopeMode": "Scope",
        "reason": "Reason",
        "reasonPlaceholder": "Explain why this request is needed",
        "submit": "Submit request",
        "success": "Request submitted. You'll be notified when it's reviewed."
      },
      "detail": {
        "approveAndOpen": "Approve & open",
        "autoApprove": "Auto-approve & execute",
        "reject": "Reject",
        "rejectModal": {
          "title": "Reject request",
          "notePlaceholder": "Tell the teacher why",
          "submit": "Reject"
        },
        "cancel": "Cancel request"
      }
    }
  }
}
```

Arabic translations required.

### 4.6 Navigation wiring

Add "Requests" to the Report Cards sub-strip. Visible to anyone with `report_cards.comment` or `manage`. Badge with a count of pending requests for admins.

---

## 5. Files to create

- `apps/web/src/app/[locale]/(school)/report-cards/requests/page.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/requests/new/page.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/requests/[id]/page.tsx`
- `apps/web/src/app/[locale]/(school)/report-cards/requests/_components/reject-modal.tsx`
- `apps/web/e2e/report-cards-requests.spec.ts`

## 6. Files to modify

- `apps/web/messages/en.json`, `apps/web/messages/ar.json`
- Nav config
- (coordinate) `apps/web/src/app/[locale]/(school)/report-comments/page.tsx` — add query param handling for `open_window_period`
- (coordinate) `apps/web/src/app/[locale]/(school)/report-cards/generate/page.tsx` — add query param handling for pre-filled wizard state

---

## 7. Testing requirements

### 7.1 E2E

**`report-cards-requests.spec.ts`:**

- Teacher submits a request → it appears in their "My requests" list as pending
- Teacher cancels their own pending request → status becomes cancelled
- Admin sees the pending request in the "Pending review" tab
- Admin approves → request becomes approved
- Admin rejects with a note → request becomes rejected, note shown to teacher
- Teacher cannot approve another teacher's request (UI disabled + backend 403)
- RLS implicit via the backend

### 7.2 Regression

```bash
turbo test && turbo lint && turbo type-check && turbo build --filter=@school/web
```

---

## 8. Mobile / RTL checklist

- [ ] List page table wraps in `overflow-x-auto`, pinned first column on mobile
- [ ] Submit form single column on mobile
- [ ] Detail page stacks on mobile
- [ ] All physical classes replaced with logical
- [ ] Arabic RTL verified

---

## 9. Acceptance criteria

1. Teachers can submit, view, and cancel their own requests
2. Admins can view, approve, and reject pending requests
3. Approve-and-open routes to the correct target page pre-filled
4. Auto-approve triggers the backend action immediately
5. Query-param pre-fill works in both impl 08 and impl 09
6. Arabic RTL renders
7. Mobile usable
8. E2E tests pass
9. `turbo test/lint/type-check/build` green
10. Log entry added

---

## 10. Architecture doc update check

None. Frontend only.

---

## 11. Completion log stub

```markdown
### Implementation 10: Frontend Teacher Requests

- **Completed at:** YYYY-MM-DD HH:MM
- **Completed by:** <agent>
- **Branch / commit:** `<branch>` @ `<sha>`
- **Status:** ✅ complete
- **Summary:** Built teacher requests submit/list/detail pages with approval routing into impls 08 and 09. Coordinated query-param handoff into those pages.

**What changed:**

- 3 new pages + 1 component under `/report-cards/requests/`
- Query-param pre-fill wired in `/report-comments/page.tsx` and `/report-cards/generate/page.tsx`
- Translation keys
- E2E test

**Test coverage:**

- E2E: full submit → review → approve/reject flow
- `turbo test/lint/type-check/build`: ✅

**Blockers or follow-ups:**

- None
```

---

## 12. If you get stuck

- **Query-param handoff:** use `useSearchParams()` from `next/navigation` and build initial state from the params in a `useEffect`. Clear the params after processing so they don't stick on refresh.
- **Scope selector reuse:** the wizard's scope step (impl 09) has a scope selector component. Extract it to a shared location (`_components/scope-selector.tsx`) and reuse here.
