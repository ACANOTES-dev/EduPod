# Implementation 22 — Pastoral Hidden-Feature UI

> **Wave:** 6 (**parallel-risky** — apply rules H1–H10)
> **Classification:** frontend
> **Depends on:** 08
> **Deploys:** Web restart only

---

## Goal

Surface five pastoral capabilities (impl 08) in the UI: DSAR review queue + decide flow, CSV/Excel import wizard, critical-incident response-plan editor + per-affected-person support log, SST agenda AI refresh button (already partially in impl 19; this impl polishes the result rendering), and the wellbeing check-in flagged queue with escalate/dismiss actions.

The user said `/pastoral` is **untouched** — so this impl adds these features as **new sub-pages** under the existing pastoral surface, not as modifications to `/pastoral` itself. The pastoral page's tab strip (Overview / Concerns / Cases / etc.) is already the navigation surface; this impl adds new entries (or links from existing tabs to the new pages).

## Shared files this impl touches

- `apps/web/messages/en.json` + `ar.json` — add `dsarReview.*`, `pastoralImport.*`, `responsePlans.*`, `checkinFlagged.*` namespaces. Apply Rules H8 + H9.
- `apps/web/src/app/[locale]/(school)/pastoral/critical-incidents/[id]/page.tsx` — embed response-plan editor + support log. Pathspec edit. ⚠️ Pastoral page modification but only inside an existing detail route, not the main `/pastoral` page.
- `apps/web/src/app/[locale]/(school)/pastoral/sst/[id]/page.tsx` — extend AI agenda result rendering (basic refresh in impl 19). Pathspec edit.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **MEDIUM** (translations).

## What to build

### 1. DSAR review queue (`/pastoral/dsar`)

NEW. List of pending review items grouped by compliance request:

- Each compliance request card: requester name, requested at, items count, "Review" button
- Click "Review" → detail page (`/pastoral/dsar/[complianceRequestId]`) listing each item (concern or case) with a 3-button decision panel: Include / Redact / Exclude + justification text
- "Submit decisions" persists all and routes back to queue

Permission: `pastoral.dsar_review`.

### 2. Pastoral CSV import wizard (`/pastoral/import`)

NEW. 3-step wizard:

- Step 1: Download template + drag-drop upload area
- Step 2: Validation results — green count of valid rows, red error list per invalid row, "Confirm import" button enabled only if valid_rows > 0
- Step 3: Confirmation success page with row count + back to /pastoral

Permission: `pastoral.import`.

### 3. Critical-incident response-plan editor

Embed on critical-incident detail page. Component `_components/response-plan-editor.tsx`:

- Lists plan items (template-instantiated). Each item: title, assigned-to, due-at, status (pending / in_progress / completed / blocked), notes
- Editable inline (status dropdown, notes textarea)
- "Add item" button to extend the plan
- Save button persists changes via PATCH

### 4. Per-affected-person support log

Same detail page. New section. Lists affected persons (students + staff impacted). For each:

- Name, role, status (under support / monitoring / closed)
- Support log: append-only entries (date, type [conversation / referral / service offered], notes, by whom)
- "Log support" button opens modal to add new entry

### 5. SST agenda AI result rendering

Extend the existing SST meeting detail page. After the impl 19 refresh button completes, the agenda items it generated render in a structured panel:

- Per-student agenda items grouped by student
- Cross-cutting themes panel at the top
- Each item: title, source ("AI" badge), edit/dismiss actions
- Manual agenda items co-exist alongside AI ones

### 6. Check-in flagged queue (`/pastoral/checkins/flagged`)

NEW (the existing `/pastoral/checkins` shows all check-ins; this is the escalation queue). List of flagged check-ins ordered by severity then time:

- Each row: student, check-in date, mood score, flag reason, actions (Escalate to concern, Dismiss)
- Escalate opens a small modal to confirm the auto-creation of a pastoral concern
- Dismiss requires a justification

Permission: `pastoral.checkin.review`.

### 7. Add nav links

The pastoral page's existing tab strip needs entries (or sub-actions) for these new pages. Investigate the current pastoral page structure; add navigation either as additional tabs or as cards within an "Operations" lane on `/pastoral`. Coordinate via the user (pastoral is generally untouched but this is necessary discoverability).

### 8. Translation additions

Four namespaces. Apply Rule H8.

## Tests

- DSAR queue + detail decide flow
- Import wizard 3-step flow with validation
- Response-plan editor inline edits
- Support log append-only
- SST agenda result rendering with AI / manual sources
- Check-in flagged queue actions

## Watch out for

- **Pastoral untouched promise** — keep `/pastoral` itself unchanged. This impl only adds NEW sub-routes. Discoverability happens via direct links (perhaps quick-action pills inside the existing tabs, with surgical edits) — coordinate with the user before any visual change to `/pastoral`'s landing.
- **DSAR sensitivity** — every action is audit-logged backend-side. Frontend should also surface a "This action will be logged" tooltip on the decide buttons.
- **CSV import row limits** — UI should warn if file > 5MB or > 5000 rows before upload, to match the backend limit.
- **Response plan templates** — backend instantiates from a template. Frontend should show which template was used + offer "switch template" action (out of scope; flag as follow-up if not present).

## Deployment notes

- Restart: web only.
- Smoke: visit each of `/en/pastoral/dsar`, `/en/pastoral/import`, `/en/pastoral/checkins/flagged`, all render. Open a critical incident, embed sections render.
