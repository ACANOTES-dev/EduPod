# Implementation 17 — Safeguarding Sub-Hub

> **Wave:** 5 (**parallel-risky** — apply rules H1–H10)
> **Classification:** frontend
> **Depends on:** 09, 12
> **Deploys:** Web restart only

---

## Goal

Today `/safeguarding` 302-redirects to `/pastoral`, hiding the dedicated safeguarding routes that exist in code (`safeguarding/concerns`, `safeguarding/my-reports`, plus the new endpoints from impl 09 — break-glass, sealing, SLA dashboard). This impl removes the redirect and builds a flagship sub-hub for the designated safeguarding workspace, with privacy-aware tier-3 access controls baked in.

## Shared files this impl touches

- `apps/web/src/app/[locale]/(school)/safeguarding/page.tsx` — replace the redirect with the new sub-hub. Yours.
- `apps/web/src/lib/nav-config.ts` — possibly add `/safeguarding` to a hub's basePaths if not present. Edit late, deep-merge with sibling 13's edits.
- `apps/web/messages/en.json` + `ar.json` — add `safeguardingHub.*` namespace. Apply Rules H8 + H9.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **HIGH** (translations + nav-config).

## What to build

### 1. Replace the redirect

Edit `apps/web/src/app/[locale]/(school)/safeguarding/page.tsx`. Remove the `redirect(...)` line. Replace with the sub-hub.

### 2. Page structure

- **PageHeader** — title "Safeguarding", description ("Designated safeguarding lead workspace. Tier-3 records, SLA tracking, emergency access, and irreversible sealing."). Include a small privacy banner at the top: "All actions audited. Access scope controlled by your role."
- **Permission gate** — entire page requires `safeguarding.dedicated_view` (added in impl 01). Render a polite "You do not have access to the safeguarding workspace. Speak to the school's designated safeguarding lead." page if not granted.
- **KPI strip (4 tiles)**:
  - Open concerns (with severity breakdown sublabel)
  - SLA breaches in last 7 days
  - Critical concerns awaiting acknowledgement
  - Sealed records this academic year
- **Quick actions (4 pills)**:
  - Report a concern → `/safeguarding/concerns/new`
  - View my reports → `/safeguarding/my-reports`
  - Request break-glass → opens dialog (defined in impl 23) — surface CTA only here
  - Run after-action review → opens list of pending reviews
- **Hub navigation cards (6 cards)**:
  - All Concerns → `/safeguarding/concerns`
  - SLA Dashboard → `/safeguarding/sla` (NEW — see step 3)
  - Sealed Records → `/safeguarding/sealed` (NEW — see step 4)
  - Break-Glass Grants → `/safeguarding/break-glass` (NEW — surface for impl 23)
  - After-Action Reviews → `/safeguarding/reviews` (NEW — surface for impl 23)
  - Settings → `/settings/safeguarding`
- **SLA breach feed** (admin only) — last 5 SLA breaches with overdue duration + "View concern" link. Renders only if `kpis.sla_breaches > 0`.
- **Recent concerns** (filtered to those visible to the current user's role and break-glass scope, if any active) — last 8 items.

### 3. New SLA dashboard page (`/safeguarding/sla`)

`apps/web/src/app/[locale]/(school)/safeguarding/sla/page.tsx`. Lists all open concerns with their SLA progress as horizontal bars (green = within deadline, amber = approaching, red = breached). Sortable by deadline-soonest. Filterable by severity and assignee.

### 4. New sealed records page (`/safeguarding/sealed`)

`apps/web/src/app/[locale]/(school)/safeguarding/sealed/page.tsx`. Requires `safeguarding.seal.view`. Lists sealed concerns with redacted titles ("Sealed concern · sealed 2026-04-10 · approved by Yusuf Rahman"). Click → detail page with full concern visible (audit-logged access).

### 5. Visual treatment

Slate gradient identity (matching the parent hub tile colour). Privacy-first design: subtle "audit eye" iconography in headers, restraint on motion (this is serious-business surface), denser typography than the celebratory behaviour hub.

### 6. Translation additions

Namespace `safeguardingHub.*`. Apply Rule H8.

## Tests

- `safeguarding/page.spec.tsx`:
  - Renders under DSL/principal/owner roles
  - Permission-denied screen for teacher role
  - All 6 hub cards visible to admin; sealed-records hidden if `safeguarding.seal.view` missing
  - Privacy banner always present
- Playwright: visit `/en/safeguarding` as principal, confirm new hub renders (no redirect to /pastoral). Visit as teacher, confirm permission-denied screen.

## Watch out for

- **Permission gate is critical** — a teacher accidentally seeing the safeguarding workspace is a privacy incident. Belt-and-braces: page-level guard, plus each section also gates internally.
- **Break-glass surfacing** — the CTA opens a dialog but the dialog's actual implementation is in impl 23 (Wave 6). Surface a placeholder "Open break-glass request" button that, when clicked before impl 23 ships, shows a "This feature is coming next wave" toast. After impl 23 lands, the placeholder gets replaced with the real dialog import.
- **Sub-strip removal in nav-config** — already handled by impl 13. This impl just adds `/safeguarding` to the wellbeing hub's basePaths if it's missing (it should be there already; verify).

## Deployment notes

- Restart: web only.
- Smoke: `/en/safeguarding` renders the new sub-hub (no redirect). Verify privacy banner. Confirm `/safeguarding/sla` and `/safeguarding/sealed` render placeholder pages (they're new). All hub tile clicks navigate.
