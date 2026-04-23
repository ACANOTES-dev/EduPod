# Phase 2 — Super Dashboard (`/regulatory`)

**Goal:** rewrite `/regulatory/page.tsx` as a beautiful, information-dense landing page that makes the whole module feel coherent and approachable.

**Dependencies:** Phase 1 complete (teal accent registered, sub-strip removed, envelope convention decided).

**Estimated effort:** 4–6 hours.

---

## Why this phase

The hub is the first thing anyone sees when they click Regulatory in the morph bar. Today it crashes. Fixing the crash isn't enough — we need the hub to be the visual reference for the rest of the module. If Wellbeing is the bar, Regulatory has to clear it.

---

## Scope — in

- Full rewrite of `apps/web/src/app/[locale]/(school)/regulatory/page.tsx`.
- All 10-ish sub-module tiles defined, including placeholder tiles for sub-hubs not yet built (those links point to their target route — the destinations may still be broken until later phases).
- KPI strip wired to backend data.
- Quick action row wired (role-gated).
- Contextual feed section for upcoming deadlines.
- Translation keys added to both `en.json` and `ar.json` under `regulatory.superHub.*`.
- Fix the hub-level response-envelope unwrap at call sites (per Phase 1 convention).

## Scope — out

- Sub-hub pages themselves (Phases 3–10 own their own rewrites).
- Backend changes unless the existing `/api/v1/regulatory/dashboard` response shape doesn't carry what the redesign needs — in that case, extend the dashboard service in this phase (small, targeted additions) and record the new fields in `docs/architecture/event-job-catalog.md` if relevant.

---

## Page composition

```
┌────────────────────────────────────────────────────────────────────┐
│ PageHeader                                                         │
│   title: t('regulatory.superHub.title')                            │
│   description: t('regulatory.superHub.description')                │
│   (no back button — this is the hub root)                          │
├────────────────────────────────────────────────────────────────────┤
│ ErrorBanner (conditional)                                          │
├────────────────────────────────────────────────────────────────────┤
│ KPI strip (4 tiles)                                                │
│   1. Overdue items       (danger tone if > 0)                      │
│   2. Upcoming deadlines  (30-day window)                           │
│   3. PPOD sync health    (% synced)                                │
│   4. Last DES submission (relative date, "Never" if null)          │
├────────────────────────────────────────────────────────────────────┤
│ QuickAction row (4 pills, role-gated)                              │
│   1. Generate Tusla SAR        → /regulatory/tusla/sar             │
│   2. Start PPOD export         → /regulatory/ppod/export           │
│   3. New calendar event        → /regulatory/calendar?new=1        │
│   4. View submissions log      → /regulatory/submissions           │
├────────────────────────────────────────────────────────────────────┤
│ HubTile grid (3-col, teal accent, staggered fade-in)               │
│   Row 1: Tusla     │ P-POD / POD │ DES Returns                     │
│   Row 2: October   │ CBA Sync    │ Transfers                       │
│   Row 3: Calendar  │ Submissions │ Anti-Bullying                   │
│   Row 4: Safeguarding │ GDPR     │ (reserved / inspectorate)       │
├────────────────────────────────────────────────────────────────────┤
│ Contextual feed: Upcoming deadlines (next 5)                       │
│   List of next calendar events, each row links to its domain page. │
├────────────────────────────────────────────────────────────────────┤
│ Recent submissions mini-feed (optional, admin only)                │
└────────────────────────────────────────────────────────────────────┘
```

---

## Tile catalogue (source of truth for this module)

| Tile            | Href                          | Icon (lucide)     | Count source                  | Roles |
| --------------- | ----------------------------- | ----------------- | ----------------------------- | ----- |
| Tusla           | `/regulatory/tusla`           | `ShieldCheck`     | `tusla.active_alerts`         | staff |
| P-POD / POD     | `/regulatory/ppod`            | `Database`        | `ppod.pending`                | admin |
| DES Returns     | `/regulatory/des-returns`     | `FileSpreadsheet` | —                             | admin |
| October Returns | `/regulatory/october-returns` | `CalendarCheck2`  | —                             | admin |
| CBA Sync        | `/regulatory/cba`             | `Award`           | `cba.pending_sync`            | admin |
| Transfers       | `/regulatory/transfers`       | `ArrowLeftRight`  | `transfers.pending_count`     | admin |
| Calendar        | `/regulatory/calendar`        | `Calendar`        | `calendar.upcoming_deadlines` | staff |
| Submissions     | `/regulatory/submissions`     | `History`         | `submissions.this_year_count` | staff |
| Anti-Bullying   | `/regulatory/anti-bullying`   | `ShieldAlert`     | `antiBullying.open_count`     | admin |
| Safeguarding    | `/regulatory/safeguarding`    | `ShieldHeart`     | `safeguarding.open_count`     | admin |
| GDPR / Privacy  | `/regulatory/gdpr`            | `Lock`            | `gdpr.open_dsar_count`        | admin |

Note: CBA and Transfers are currently reachable as `/regulatory/ppod/cba` and `/regulatory/ppod/transfers`. Phase 4 decides whether they stay nested under PPOD or get promoted to top-level `/regulatory/cba` and `/regulatory/transfers`. The tile catalogue above reflects the target post-Phase 4 state; use `/regulatory/ppod/cba` and `/regulatory/ppod/transfers` as the `href` in Phase 2 and update in Phase 4.

---

## Concrete changes

### Files modified / rewritten

- `apps/web/src/app/[locale]/(school)/regulatory/page.tsx` — full rewrite.
- `apps/web/messages/en.json` — add `regulatory.superHub.*` keys (title, description, KPI labels, tile titles + descriptions, quick-action labels, feed headers, empty-state copy).
- `apps/web/messages/ar.json` — same keys in Arabic.
- `apps/api/src/modules/regulatory/services/regulatory-dashboard.service.ts` — if current shape doesn't carry `ppod.health_percent`, `des.last_submission_at`, `antiBullying.open_count`, `safeguarding.open_count`, `gdpr.open_dsar_count`, add them (small composite query).
- `packages/shared/src/regulatory/regulatory.schemas.ts` — update the dashboard response Zod schema to match any backend additions.

### Files potentially deleted

- `apps/web/src/app/[locale]/(school)/regulatory/_components/compliance-status-card.tsx` — if no remaining consumer after hub rewrite.
- `apps/web/src/app/[locale]/(school)/regulatory/_components/deadline-timeline.tsx` — if superseded by the new contextual feed.

### Files created

- `apps/web/src/app/[locale]/(school)/regulatory/_components/hub-tile-catalogue.ts` (or co-located in `page.tsx`) — single source of truth for tile configs.
- `apps/web/src/app/[locale]/(school)/regulatory/_components/upcoming-deadlines-feed.tsx` — section component.
- `apps/web/src/app/[locale]/(school)/regulatory/_components/error-banner.tsx` — shared for this module's pages (could also live module-wide).
- Unit spec: `apps/web/src/app/[locale]/(school)/regulatory/_components/hub-tile-catalogue.spec.ts` (simple: every tile has a valid href + role entry).

---

## Success criteria

- [ ] `/regulatory` loads on NHQS prod without an error boundary.
- [ ] Visual parity with `/wellbeing`: same spacing, same typography, same grid breakpoints.
- [ ] KPI numbers reflect real data (verify by comparing to `/api/v1/regulatory/dashboard` payload).
- [ ] Every hub tile links to a route that returns HTTP 200 (even if the destination is still visually off-pattern in Phase 2).
- [ ] Staggered fade-in works (60ms per tile).
- [ ] Upcoming deadlines feed shows 5 most-imminent calendar items; empty state renders when there are none.
- [ ] Role gating: a teacher sees only the `staff` tiles (Tusla, Calendar, Submissions). A principal sees all tiles.
- [ ] Mobile (375px width) lays out correctly — 2-col KPI, 1-col tile grid, no overflow.
- [ ] RTL: switch locale to `ar` and verify chevrons flip, text aligns right, spacing logical-property correct.
- [ ] Lint + type-check + relevant tests pass.
- [ ] No new Sentry signatures post-deploy.

---

## Testing

### Local

- `pnpm dev`, log in as principal → visual walk-through of every tile.
- Log in as teacher → confirm role gating hides admin tiles.

### Playwright

Write one spec: `apps/web/e2e/regulatory-super-hub.spec.ts`:

1. Login as principal
2. Navigate to `/en/regulatory`
3. Assert page renders without the error-boundary heading
4. Assert each hub tile is present and links to the expected href
5. Assert KPI numbers come from the dashboard API payload (stub or snapshot)
6. Resize viewport to 375px and re-assert layout

### Post-deploy

- Run the same spec against prod.
- Browse every hub tile target manually to confirm morph-bar hub pill stays active.

---

## Risks

- **Backend shape may need extension.** If adding fields to `/api/v1/regulatory/dashboard`, do it as an additive change (never break the existing shape until all consumers are on the new schema). Prefer a single unified shape.
- **Role-gating inconsistencies.** Current backend permissions are split across `regulatory.view`, `regulatory.manage`, `regulatory.manage_tusla`, `regulatory.manage_des`, `regulatory.manage_ppod`, `regulatory.manage_october_returns`. The UI role gating should mirror the most permissive "view" level per tile so users can discover sub-hubs they can read but not edit.
- **Coming-soon tiles.** GDPR and promoted CBA/Transfers routes don't exist until their phases. Link them to their final hrefs but treat the intermediate 404 as expected. Phases 4 and 10 fix those.
