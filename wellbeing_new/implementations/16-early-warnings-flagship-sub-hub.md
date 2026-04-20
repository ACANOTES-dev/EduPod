# Implementation 16 — Early-Warnings Flagship Sub-Hub

> **Wave:** 5 (**parallel-risky** — apply rules H1–H10)
> **Classification:** frontend
> **Depends on:** 03, 12
> **Deploys:** Web restart only
>
> **🌟 FLAGSHIP.** The user has called this "one of the biggest key differentiators of my product" and asked for the full 6 yards. Allocate Ultrathink-grade attention. Use the `frontend-design` skill aggressively.

---

## Goal

Rebuild `/early-warnings` from a sparse list-and-filter page into the most distinctive page in the wellbeing module. KPI strip + at-risk student visualisation + indicator drill-down (by domain) + cohort analytics charts (year group / class / demographic) + AI narrative ("Of the 14 amber students this week, 9 are concentrated in Year 5; the dominant indicator is attendance below 85%") + intervention triggering UI. The page should make a school admin think "I genuinely cannot run a school without this."

## Shared files this impl touches

- `apps/web/messages/en.json` + `ar.json` — add `earlyWarningsHub.*` namespace. Apply Rules H8 + H9.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **HIGH** (translations).

## What to build

### 1. New landing `apps/web/src/app/[locale]/(school)/early-warnings/page.tsx`

Replace the existing list-only page. Sections:

#### A. Hero KPI strip (4 stat tiles, large)

Each tile is bigger than a standard KpiTile — use a `KpiTileLarge` variant (extend `@/components/kpi-tile.tsx` with a `size: 'sm' | 'lg'` prop). Tiles:

- **Students at Red Risk** — number, with sparkline of last 30 days, click → filtered list
- **Students at Amber Risk** — same
- **New Flags This Week** — with delta vs prior week
- **Active Interventions** — with completion rate

Tiles include a small severity indicator (left border colour = risk tier).

#### B. AI Narrative panel (gated by AI flag for `early_warning`)

Subtle gradient card. Renders 1–3 paragraphs of LLM-generated narrative summarising the current state of at-risk students, dominant indicators, and recommended actions. Backed by a new endpoint to be added inline as part of this impl (or as a small follow-up to impl 05): `GET /api/v1/early-warning/narrative` returning `{ data: { narrative: string, generated_at: string, key_themes: Array<{ theme: string, weight: number }> }}`.

If AI flag off, hide the panel entirely (no "enable AI" prompt — that's noise).

#### C. At-Risk Student matrix

Two-column responsive layout:

- **Left panel:** flagged student list — virtualised (use `react-window` if not in deps, or a manual windowing pattern if it is). Each row: avatar, full name, year group, risk tier badge, primary concern domain, trend arrow, assigned-to. Click → student detail.
- **Right panel:** filter chips (status, year group, class, indicator domain) + the full list controls.

#### D. Indicator drill-down

5 sub-tabs (or a chip strip), one per indicator domain: Attendance / Grades / Behaviour / Wellbeing / Engagement. Selecting a tab filters the list AND shows a per-domain mini-chart at the top of the right panel (e.g. attendance domain: "Students below 85% attendance this term — distribution histogram").

#### E. Cohort analysis section

A separate region below. Three chart panels side-by-side (stacks on mobile):

1. **By Year Group** — bar chart, students at risk per year group, stacked by tier (red on bottom, amber on top)
2. **By Class** — sortable table, top 10 classes by at-risk concentration
3. **By Demographic** (gender / SEN status / EAL — whatever the tenant tracks) — anonymised aggregated cards

Each panel has a "Drill in" link that navigates to a dedicated cohort page (existing `/early-warnings/cohort` — reuse, don't rebuild).

#### F. Intervention trigger CTA bar

Sticky at the bottom of the page when there are unactioned at-risk students. Single CTA: "Trigger interventions for selected students" — links to a multi-select flow (`/early-warnings/intervene`). The flow itself is **out of scope for this impl** (file a follow-up); this impl just surfaces the CTA so the workflow is discoverable.

#### G. Settings & cohort sub-pages

Header CTAs: "Cohort analysis" (existing `/early-warnings/cohort`) and "Settings" (existing `/early-warnings/settings`, fixed by impl 10). Keep the existing pages reachable; this hub is the new front door.

### 2. Visual treatment

This page deserves the most opinionated design treatment in the rebuild. Permitted moves:

- Subtle amber-themed gradient background panel for the hero KPI strip
- Sparklines on each KPI tile (small SVGs — Recharts is already in deps)
- Risk tier colour coding consistent across every component (red = critical, amber = warning, green = monitoring, blue = resolved)
- AI narrative panel: distinct typography treatment (slightly larger leading, italic accent on key phrases), maybe a soft animated shimmer on first load to communicate "thinking"
- Use `frontend-design` skill heavily. Iterate.

### 3. Translation additions

Namespace `earlyWarningsHub.*`. Mirror prior structure. Apply Rule H8.

## Tests

- `early-warnings/page.spec.tsx`:
  - All sections render under principal
  - AI narrative hidden when flag off
  - Risk tier filter works
  - Indicator drill-down switches correctly
- Playwright walkthrough: visit, switch indicator tabs, hover sparklines, click "Drill in" → cohort page.

## Watch out for

- **Performance** — virtualised list essential if NHQS or future tenants have 200+ at-risk students. Don't render 500 rows in DOM at once.
- **AI narrative cost** — cache for 24h server-side (impl 05 pattern). Frontend can request a refresh via a small "Refresh narrative" button on the panel.
- **Risk tier colour conventions** — must match every other surface (behaviour incidents, pastoral concerns) so users build a single mental model. Verify against existing components before introducing new colours.
- **Demographic visibility** — anonymise. Never show "John Smith — SEN: yes" on the cohort panel; only aggregated counts. Privacy first.
- **Interventions CTA scope** — explicit out-of-scope for this impl. The CTA links to a placeholder that says "Coming soon" plus a follow-up record. Better to ship the discovery surface than to hide it until the flow is built.

## Deployment notes

- Restart: web only.
- Smoke: `/en/early-warnings` renders the flagship hub. Compare visually against the old list — should feel like a different product entirely. Show it to the user for early feedback before signing off — this is the showpiece.
