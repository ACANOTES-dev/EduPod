# Phase 9 — Safeguarding Regulatory Hub

**Goal:** `/regulatory/safeguarding` becomes a real regulatory-oversight sub-hub — **not** a redirect to the standalone Safeguarding module, but a dedicated compliance lens over that module's data. Mandatory reporting status, designated liaison person (DLP) register, staff vetting register, annual review, policy compliance.

**Dependencies:** Phases 1, 2. Cross-references the standalone Safeguarding module for deep actions (opening a concern, etc.).

**Estimated effort:** 5–6 hours.

---

## Scope — in

- Rewrite `apps/web/src/app/[locale]/(school)/regulatory/safeguarding/page.tsx` as a sub-hub.
- Introduce up to 4 sub-pages under `/regulatory/safeguarding/*`:
  - `/regulatory/safeguarding/mandatory-reporting` — tracked reports to Tusla under Children First Act 2015
  - `/regulatory/safeguarding/staff-vetting` — Garda vetting register with expiry tracking
  - `/regulatory/safeguarding/annual-review` — annual child-protection review status
  - `/regulatory/safeguarding/dlp-register` — designated liaison persons + deputies
- Each deep action ("open concern", "log vetting") links to the standalone `/safeguarding` or `/people/staff` surfaces.
- The old `/safeguarding` module continues to exist unchanged; this phase adds a new regulatory view on top.

## Scope — out

- Changes to the standalone Safeguarding module's data model or workflows.
- New GDPR / privacy surfaces (Phase 10 owns those).

---

## Page composition

### `/regulatory/safeguarding` (sub-hub)

```
PageHeader
  title: 'Safeguarding Compliance'
  description: 'Child-protection oversight, mandatory reporting, and staff vetting.'
  back: { href: '/{locale}/regulatory' }

Context banner (rounded-2xl slate tint, §14.3 item 2)
  Brief explainer: "Deep actions (log a concern, file a report) happen in the Safeguarding module. This hub shows your regulatory compliance posture."

KPI strip (4 tiles)
  1. Open concerns (danger tone if > 0)
  2. Pending Tusla reports (warning if > 0)
  3. Vetting expiring in 60 days (warning tone)
  4. Days until annual review due

HubTile grid (4 tiles, teal accent)
  1. Mandatory Reporting    → /regulatory/safeguarding/mandatory-reporting
  2. Staff Vetting          → /regulatory/safeguarding/staff-vetting
  3. Annual Review          → /regulatory/safeguarding/annual-review
  4. DLP Register           → /regulatory/safeguarding/dlp-register

Recent Tusla reports list (rounded-2xl, last 5)
  Row link → report detail.

Audit footer (thin dashed border)
  Reminder: who's the DLP, who's the deputy, who has safeguarding view permission.
```

### `/regulatory/safeguarding/mandatory-reporting`

- List of Children First Act reports made to Tusla.
- `PageHeader.back` → `/regulatory/safeguarding`, actions: "Log new report" (could deep-link into Safeguarding module).
- Table: child (anonymised reference), reason category, reported by, submitted at, Tusla reference, status.
- Export to PDF for audit.

### `/regulatory/safeguarding/staff-vetting`

- List of staff with Garda vetting status + expiry dates.
- `PageHeader.back` → `/regulatory/safeguarding`, actions: "Upload vetting letter" (deep-link into /people/staff).
- Table: staff name, role, vetting date, expiry date, days remaining (color-coded), notes.

### `/regulatory/safeguarding/annual-review`

- Annual CPP review tracker: when was the last review, when is the next due, what's in the review packet.
- Form-style page with `react-hook-form` for marking reviews complete.

### `/regulatory/safeguarding/dlp-register`

- Register of designated liaison persons and deputies.
- `PageHeader.back` → `/regulatory/safeguarding`.
- List + create dialog.

---

## Concrete changes

### Files rewritten

- `apps/web/src/app/[locale]/(school)/regulatory/safeguarding/page.tsx`

### Files created

- `apps/web/src/app/[locale]/(school)/regulatory/safeguarding/mandatory-reporting/page.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/safeguarding/staff-vetting/page.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/safeguarding/annual-review/page.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/safeguarding/dlp-register/page.tsx`
- Shared `_components/` for vetting-expiry badge, compliance-status card.

### Backend (if needed)

- Either reuse `/api/v1/safeguarding/*` endpoints scoped with a `regulatory.view` lens, OR add thin wrappers under `/api/v1/regulatory/safeguarding/*` that cross-reference safeguarding + HR data.
- Prefer adding a single `/api/v1/regulatory/safeguarding/dashboard` that returns the KPI strip + recent reports in one call.

### Translation keys

`regulatory.safeguarding.*` — top up under new namespaces: `mandatoryReporting`, `staffVetting`, `annualReview`, `dlpRegister`.

---

## Success criteria

- [ ] `/regulatory/safeguarding` no longer looks like a redirect stub.
- [ ] Sub-pages render real data (even if empty state) on NHQS.
- [ ] Deep-link back-out to standalone Safeguarding module works for "open concern" etc.
- [ ] Vetting expiry warnings trigger correctly (color-coded 60d / 30d / overdue).
- [ ] Mobile and RTL clean.
- [ ] Lint + type-check + tests pass. CI green.

---

## Testing

- Playwright: `apps/web/e2e/regulatory-safeguarding.spec.ts`.
- Manual: create a DLP entry on NHQS, confirm it appears.
- Manual: upload a fake vetting record on a staff profile, confirm the expiry warning propagates.

---

## Risks

- **Cross-module data fetch.** Vetting data lives on staff records; report data in safeguarding. Rather than have the UI juggle two APIs, ship the single `/v1/regulatory/safeguarding/dashboard` composite endpoint.
- **Permissions.** A teacher can't see safeguarding data at all. The regulatory.safeguarding view belongs to admin + DLPs only. Gate every page with `@RequiresPermission('safeguarding.view')` at API and mirror at UI.
- **Anonymisation in mandatory-reporting table.** Referenced children must not be name-rendered to non-DLP admins. Follow the same redaction rules the standalone Safeguarding module uses.
