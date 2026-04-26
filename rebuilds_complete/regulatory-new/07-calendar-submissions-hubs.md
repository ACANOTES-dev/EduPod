# Phase 7 — Calendar + Submissions Hubs

**Goal:** turn `/regulatory/calendar` and `/regulatory/submissions` into real sub-hubs. Both are "records" surfaces (deadlines + audit log respectively) but they need the same polish as the domain hubs.

**Dependencies:** Phases 1, 2.

**Estimated effort:** 4–5 hours.

---

## Scope — in

### Calendar

- Rewrite `/regulatory/calendar/page.tsx` as a proper sub-hub with month view + upcoming list view.
- Add a "New event" dialog (backend already supports `POST /v1/regulatory/calendar`).
- Seed-defaults action preserved (the backend has `POST /v1/regulatory/calendar/seed-defaults` for bootstrapping with DES / Tusla / etc. defaults).
- Fix the duplicate `EVENT TYPE` column header.

### Submissions

- Rewrite `/regulatory/submissions/page.tsx` with a proper filters section, summary strip (submitted / pending / failed totals), and a detail drawer for per-submission view.
- Detail drawer shows validation errors, file hash, recorded-at timestamp, actor.

## Scope — out

- Backend calendar recurrence logic — unchanged.
- Submissions search / full-text search — not introduced here unless trivial.

---

## Page composition

### `/regulatory/calendar` (sub-hub)

```
PageHeader
  title: 'Regulatory Calendar'
  description: 'Upcoming deadlines and recurring obligations.'
  back: { href: '/{locale}/regulatory' }
  actions:
    - Button "Seed defaults" (if calendar is empty, admin only)
    - Button "+ New event" → opens dialog

KPI strip (4 tiles)
  1. Upcoming this month
  2. Overdue
  3. Completed this year
  4. Next deadline (relative)

View toggle [ Month view | Upcoming list ]

Month view
  Calendar grid with event pins, colored by domain.

Upcoming list view
  Rounded-2xl with divided list of next 20 events.
  Filters: domain, status.

Event row click → detail dialog showing notes, completion action, reminder config.
```

### `/regulatory/submissions` (sub-hub)

```
PageHeader
  title: 'Submissions History'
  description: 'Audit log of every regulatory submission.'
  back: { href: '/{locale}/regulatory' }

Summary strip (3 tiles)
  1. This year (total)
  2. Failed (danger tone if > 0)
  3. Pending (warning tone if > 0)

Filters section
  Domain, type, academic year, status, date range.

Results
  Table: domain, type, academic year, status badge, submitted at, records, actions.
  Row click opens detail drawer.

Detail drawer
  Submission ref, status, validation errors list, download file (if stored),
  resubmit button (for failed items, admin only).
```

---

## Concrete changes

### Files rewritten

- `apps/web/src/app/[locale]/(school)/regulatory/calendar/page.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/submissions/page.tsx`

### Files created

- `apps/web/src/app/[locale]/(school)/regulatory/calendar/_components/calendar-month-view.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/calendar/_components/calendar-event-dialog.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/submissions/_components/submission-detail-drawer.tsx`
- Co-located specs.

### Translation keys

`regulatory.calendar.*` and `regulatory.submissions.*` — fill any gaps, EN + AR.

---

## Success criteria

- [ ] Both routes load cleanly with sub-hub layout.
- [ ] Calendar create event end-to-end works on NHQS.
- [ ] Calendar seed-defaults works and shows confirmation.
- [ ] Duplicate `EVENT TYPE` header gone.
- [ ] Submissions detail drawer shows validation errors for at least one failed submission (or empty state if none).
- [ ] Mobile and RTL clean.
- [ ] Lint + type-check + tests pass. CI green.

---

## Testing

- Playwright: `apps/web/e2e/regulatory-calendar.spec.ts` and `regulatory-submissions.spec.ts`.
- Manual: create a calendar event on NHQS, verify it shows up in the super-dashboard feed.

---

## Risks

- **Calendar month view.** Building a calendar grid from scratch is non-trivial. If the project already has a shared calendar primitive (check `packages/ui` and `apps/web/src/components`), reuse it. Otherwise budget extra time or skip the month view in this phase and ship the upcoming-list view only.
- **Seed-defaults idempotency.** Confirm the backend doesn't double-insert if clicked twice. If it does, add a client-side confirm dialog.
