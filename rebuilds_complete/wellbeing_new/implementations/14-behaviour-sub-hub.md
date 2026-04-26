# Implementation 14 — Behaviour Sub-Hub (flagship rewrite)

> **Wave:** 5 (**parallel-risky** — apply rules H1–H10)
> **Classification:** frontend
> **Depends on:** 03, 12
> **Deploys:** Web restart only

---

## Goal

Replace the existing "Behaviour Pulse" landing at `/behaviour` (the broken page that today shows raw translation keys, fires the validation toast, and uses an outdated layout) with a flagship sub-hub matching the design language of `/wellbeing`. KPI strip + quick actions + hub navigation cards for every behaviour sub-page (~13 cards including the hidden ones being surfaced) + recent activity + a small "AI quick parse" inline composer (gated by the AI flag). All localised both `en` and `ar`.

This is the second-most-important UI page in the rebuild after `/wellbeing` itself. Same WOW bar.

## Shared files this impl touches

- `apps/web/messages/en.json` + `ar.json` — add `behaviourHub.*` namespace. Apply Rules H8 + H9.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **HIGH** (translations).

## What to build

### 1. Replace the landing

Edit `apps/web/src/app/[locale]/(school)/behaviour/page.tsx` — full rewrite. Keep the file path; replace contents.

### 2. Page structure (top-down)

1. **PageHeader** — title `Behaviour`, description copy ("Track incidents, recognise positive behaviour, manage sanctions and exclusions, and run policy automation"), header CTA: "Log incident" button + "Parse with AI" button (gated; renders only when AI flag is on for behaviour).
2. **KPI strip (4 tiles)** — sourced from `/api/v1/behaviour/incidents/stats` + `/api/v1/behaviour/tasks/stats`:
   - Incidents this week (with delta vs last week)
   - Positive : Negative ratio
   - Open tasks
   - Overdue actions
3. **Quick actions (4 pills)**:
   - All incidents → `/behaviour/incidents`
   - By student → `/behaviour/students`
   - Run AI query → `/behaviour/analytics/ai` (gated by AI flag; hidden if off)
   - Generate document → `/behaviour/documents` (jumps to documents list with the "Generate" CTA prominent)
4. **Hub navigation card grid (12–13 cards, 2-col responsive, 3-col on xl)** — every behaviour sub-page reachable here:
   - Incidents (count badge from stats)
   - Sanctions (count from `/api/v1/behaviour/sanctions/stats` if exists, otherwise omit)
   - Exclusions (count of open exclusion cases)
   - Appeals (count of in-flight appeals)
   - Recognition Wall (positive incidents this term)
   - Houses & Leaderboard
   - Documents
   - Tasks (count of overdue)
   - Alerts (count of unseen)
   - Amendments (count pending)
   - Guardian Restrictions
   - Analytics
   - AI Analytics (gated; hidden if AI flag off)

   Each card: gradient accent, icon, title, description, dynamic count badge, hover lift + glow, tooltip.

5. **Recent activity feed** — last 8 behaviour events (incidents logged, sanctions served, recognitions awarded). Same shape as super-hub feed.
6. **Recognition Wall preview row** — last 4 recognitions with student photo + category + awarded-by. Click → `/behaviour/recognition`. Encourages positive engagement up front (per the user's "key product differentiator" framing for the hub).
7. **Inline AI quick parse** (collapsible, gated by AI flag) — small textarea with "Parse and prefill" button. Submits to `/api/v1/behaviour/incidents/ai-parse`, then opens the new-incident form pre-filled with the parsed values. (Wave 6 impl 19 owns the parse modal in full; this is a teaser surface in the dashboard.)

### 3. Visual treatment

- Same component vocabulary as `/wellbeing` super-hub — KpiTile, QuickAction, HubTile from `@/components/...`.
- Distinctive sub-hub identity: rose accent (matching the parent hub tile's color in impl 13).
- Use `frontend-design` skill for the polish pass — opinionated section dividers, Recognition Wall preview should feel celebratory (subtle confetti or sparkle motif if it earns its keep — taste).

### 4. Translation additions

Namespace `behaviourHub.*` mirroring the structure of `wellbeingHub.*`. Apply Rule H8.

### 5. Coordinate with impl 13

Wait for impl 13 to commit the extracted components (`@/components/kpi-tile`, `quick-action`, `hub-tile`) before importing. Read its completion record to confirm the import paths and the prop signatures.

## Tests

- `behaviour/page.spec.tsx`:
  - All 13 cards render
  - AI cards hidden when flag off (mock the endpoint)
  - KPI strip shows skeleton during load
  - Recognition preview hidden when no positive incidents
- Playwright: visit `/en/behaviour` after deploy, confirm all sections present, click 3–4 random tiles, confirm navigation works.

## Watch out for

- **Don't ship if impl 13's component extractions haven't landed yet.** Sibling impls 15, 16, 17 face the same constraint. Stagger your starts behind 13 by 10–15 minutes if running fully parallel.
- **Recognition preview empty state** — render nothing (collapse the section) if zero positives. Don't show "no recognitions yet" front-and-centre — feels deflating.
- **AI flag check** — call `/api/v1/admin/ai-flags` once on mount; cache the result for the page render. The decorator-based 403 from the backend is a fallback safety net.

## Deployment notes

- Restart: web only.
- Smoke: `/en/behaviour` renders the flagship sub-hub end-to-end. Compare against the old "Behaviour Pulse" page (no longer exists) — should feel like a different product.
