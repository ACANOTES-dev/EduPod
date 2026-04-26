# Implementation 19 — AI Features UI

> **Wave:** 6 (**parallel-risky** — apply rules H1–H10)
> **Classification:** frontend
> **Depends on:** 05, 14, 18
> **Deploys:** Web restart only

---

## Goal

Surface the three behaviour AI capabilities (impl 05) in the UI: an AI incident-parse modal callable from the new-incident form and the behaviour sub-hub teaser, an AI student-summary panel embedded on the student detail page, and a richer AI NL-query interface on `/behaviour/analytics/ai`. Plus the SST agenda AI refresh button (impl 08) on the SST meeting detail page. All AI surfaces gracefully hide when the relevant module's AI flag (impl 04) is off.

## Shared files this impl touches

- `apps/web/messages/en.json` + `ar.json` — add `aiFeatures.*` namespace. Apply Rules H8 + H9.
- `apps/web/src/app/[locale]/(school)/behaviour/incidents/new/page.tsx` — embed AI parse modal trigger. Pathspec edit.
- `apps/web/src/app/[locale]/(school)/behaviour/students/[studentId]/page.tsx` — embed AI summary panel. Pathspec edit.
- `apps/web/src/app/[locale]/(school)/pastoral/sst/[id]/page.tsx` — add SST agenda refresh button. Pathspec edit.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **HIGH** (translations + multiple page edits).

## What to build

### 1. AI parse modal (`_components/ai-parse-modal.tsx`)

Located under `apps/web/src/app/[locale]/(school)/behaviour/_components/ai-parse-modal.tsx`. Reusable.

- Trigger: a "✨ Parse with AI" button on the new-incident form header AND on the behaviour sub-hub's inline composer.
- Modal: a textarea for free-text description, a "Parse" button, a results panel showing suggested category/severity/polarity/students/when/location/confidence with one-click "Apply" to inject into the parent form.
- Hide entirely if `aiFlags.behaviour === false`.
- Loading state during parse (1–3s typical). Error state with retry.

### 2. Student AI summary panel (`_components/ai-student-summary.tsx`)

Embedded on the student detail page. Compact card with:

- Title: "AI summary" + last-generated timestamp + "Refresh" button (calls endpoint with `?force_refresh=true`)
- Summary paragraph
- Highlights list (3–5 items: trends, key incidents, recommended interventions, recognitions)
- Period selector (last 30/90/180 days)

Hide if AI flag off.

### 3. NL query interface upgrade

Edit `apps/web/src/app/[locale]/(school)/behaviour/analytics/ai/page.tsx`. Today it has a textarea + suggested queries + history. Upgrade to:

- Bigger query textarea (8 rows on focus)
- Suggested queries as polished pills with examples (the audit showed they're currently raw translation keys — fix in this impl alongside)
- Submit button with keyboard shortcut hint (⌘+Enter)
- Results panel: structured answer + chart-spec rendering (Recharts) + citations (clickable links to incidents)
- Query history: paginated, click to re-load a past query into the editor, delete-history option (per-user)

Hide entire page (or render a clean "AI features are disabled for this tenant" placeholder) if AI flag off.

### 4. SST agenda refresh button

Edit `apps/web/src/app/[locale]/(school)/pastoral/sst/[id]/page.tsx`. Add a "✨ Refresh agenda with AI" button on the meeting detail. Calls the impl 08 endpoint, polls until the agenda items appear (or shows a "Refreshing..." spinner). Hide if `aiFlags.pastoral === false`.

### 5. AI flag hook

Add a small hook `useAiFlag(moduleKey: WellbeingAiModuleKey): boolean` at `apps/web/src/hooks/use-ai-flag.ts`. Fetches `/api/v1/admin/ai-flags` once per session (memoised), returns the flag value. All AI surfaces in this impl use it for visibility gating.

### 6. Translation additions

Namespace `aiFeatures.*`. Apply Rule H8.

## Tests

- `ai-parse-modal.spec.tsx`: parse flow, apply-to-form, error retry
- `ai-student-summary.spec.tsx`: refresh flow, period selector, hide-when-flag-off
- `ai-query/page.spec.tsx`: history pagination, citation click, delete-history
- `useAiFlag.spec.ts`: caches per-session, exposes flag value

## Watch out for

- **Citations safety** — when the LLM returns citation incident IDs, the page must filter to only those the user has access to before rendering. Backend already filters (impl 05); frontend trusts but renders the resulting list.
- **Cost UX** — make the "Refresh" / "Submit" buttons subtle; users shouldn't feel like they're spending money on every click. But also don't hide the action.
- **Accessibility** — modals need focus trapping + ESC dismiss; AI summary panel needs aria-live for dynamic updates.

## Deployment notes

- Restart: web only.
- Smoke: with AI flag on for behaviour, click "Parse with AI" on new-incident form, type a description, parse, apply to form. Open a student detail page, observe AI summary panel rendering. Open `/behaviour/analytics/ai`, run a query, confirm response renders. Toggle AI flag off via impl 18, refresh — all AI surfaces should disappear cleanly.
