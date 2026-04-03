# Phase F — Frontend Core Shell

**Wave**: 4
**Deploy Order**: d6
**Depends On**: A, E

## Scope

Establishes the frontend routing structure, sidebar navigation, shared layout components, and the core pages that don't depend on domain-specific APIs (dashboard, calendar, submissions, safeguarding). This phase creates the regulatory section shell that Phases G and H build upon, including the sub-navigation component, compliance status cards, and the deadline timeline. The dashboard page consumes the dashboard API from Phase E.

## Deliverables

### Layout & Navigation

- `apps/web/src/app/[locale]/(school)/layout.tsx` — **modify** sidebar to add Regulatory item with Shield icon and child links
- `apps/web/src/app/[locale]/(school)/regulatory/_components/regulatory-nav.tsx` — sub-navigation within regulatory section

### Dashboard Page

- `apps/web/src/app/[locale]/(school)/regulatory/page.tsx` — compliance dashboard (main landing page)
- `apps/web/src/app/[locale]/(school)/regulatory/_components/compliance-status-card.tsx` — status card per domain
- `apps/web/src/app/[locale]/(school)/regulatory/_components/deadline-timeline.tsx` — scrollable deadline timeline

### Calendar Page

- `apps/web/src/app/[locale]/(school)/regulatory/calendar/page.tsx` — regulatory calendar view

### Submissions & Safeguarding

- `apps/web/src/app/[locale]/(school)/regulatory/submissions/page.tsx` — submission audit log
- `apps/web/src/app/[locale]/(school)/regulatory/_components/submission-history-table.tsx` — audit log table
- `apps/web/src/app/[locale]/(school)/regulatory/safeguarding/page.tsx` — safeguarding compliance view (links to existing safeguarding module)

### i18n

- `apps/web/messages/en.json` — **add** `regulatory` namespace (core keys: nav items, dashboard labels, calendar labels, submission labels)
- `apps/web/messages/ar.json` — **add** `regulatory` namespace (Arabic translations for core keys)

## Out of Scope

- Tusla pages and components (Phase G)
- DES Returns and October Returns pages (Phase G)
- Anti-bullying page (Phase G)
- P-POD/POD pages and components (Phase H)
- CBA sync page (Phase H)
- Transfer pages (Phase H)

## Dependencies

**Phase A** provides:

- API endpoints for calendar CRUD, submission listing, and regulatory permissions
- Shared types and constants for domain labels, status enums

**Phase E** provides:

- `GET /v1/regulatory/dashboard` — compliance status aggregation across all domains
- `GET /v1/regulatory/dashboard/overdue` — overdue items for the dashboard

## Implementation Notes

- **Sidebar**: Add after existing nav items. Use `Shield` icon from `lucide-react`. Permission: `regulatory.view`. Include all child links (dashboard, calendar, tusla, des-returns, october-returns, ppod, cba, transfers, anti-bullying, submissions).
- **RTL compliance**: All components must use logical CSS properties (`ms-`/`me-`/`ps-`/`pe-`/`start`/`end`). Zero `left`/`right` physical properties.
- **Mobile**: Dashboard cards stack single-column on mobile, 2-column at `md:`, 3-column at `lg:`. Timeline scrolls horizontally on mobile. Tables wrap in `overflow-x-auto`.
- **Data fetching**: Use `apiClient<T>()` with `useEffect` — no server-component data fetching. Calendar and submission tables use client-managed pagination (`{ data, meta: { page, pageSize, total } }`).
- **i18n**: Only core keys in this phase. Tusla/DES/PPOD-specific keys are added in Phases G and H respectively. Platform admin routes are English-only.
- The safeguarding page is a thin link page pointing to the existing safeguarding module's pages — no new API calls needed.
