# Exhaustive Wellbeing Walkthrough — Live Log

**Started:** 2026-04-21
**Tenant:** NHQS pilot (https://nhqs.edupod.app)
**Policy:** test tenant, fake data → mutating actions allowed (per memory `feedback_prod_tenants_are_test.md`)
**Scratchpad only — findings consolidated into BUG-LOG.md + PLAYWRIGHT-WALKTHROUGH-RESULTS.md at the end.**

Convention:

- ✅ Pass (no issues)
- ⚠️ Partial (cosmetic / polish)
- ❌ Fail (functional bug)
- 🐛 `WB-NNN` live bug id (extended series)

---

## Phase 1 — Admin: Behaviour sub-module

### §1.1 `/en/behaviour` (hub)

- 14 hub tiles render: Incidents, Sanctions, Exclusions, Appeals, Recognition Wall, Houses & Leaderboard, Documents, Tasks, Alerts, Amendments, Guardian Restrictions, Analytics, Policy replay, Admin console.
- KPI strip: Incidents this week (0), Positive:Negative (—), Open tasks (0), Overdue actions (0).
- Quick actions: All incidents, By student, Generate document.
- Empty state "Nothing to show yet · Log your first incident or award to bring this dashboard to life" → Log an incident CTA.
- Console errors: 0 on hub load.
- 🐛 WB-101 ❌ **P2 — hub tiles are `<button>` elements with no onClick handler.** Clicking e.g. "Incidents" tile does NOT navigate to `/behaviour/incidents`. Keyboard/mouse interaction dead. Only the quick-action links + KPI links work. Spec admin §4.5 explicitly says tiles should navigate.

### §1.2 `/en/behaviour/incidents` (list)

- H1 "Behaviour Incidents" + New Incident CTA.
- Filter tabs: All / Positive / Negative / Pending / Escalated / My.
- Controls: Date from, Date to, All Categories combo, All Statuses combo.
- Table columns: Date / Category / Student(s) / Status / Reporter.
- Empty state "No results found" + paginator 1/1 disabled.
- API: `GET /v1/behaviour/incidents?page=1&pageSize=20` → 200; `GET /v1/behaviour/categories?pageSize=100&is_active=true` → 200.
- 🐛 WB-102 ❌ **P2 — MISSING_MESSAGE `behaviour.components.quickLog.title` and `behaviour.components.quickLog.*`** (en). The floating action button at the bottom renders raw key "behaviour.components.quickLog.title" as its label — visible text, not just console noise.
- 🐛 WB-103 ⚠️ **P3 — Tab filters don't update URL query string.** Clicking Positive / Negative / Pending / Escalated / My doesn't add `?tab=...` or fire a new API call. Client-side filter only; state is not shareable/bookmarkable. Spec admin §6 implies URL-backed filtering.

### §1.3 `/en/behaviour/incidents/new` (create form)

- Form renders: category picker (32 categories — 21 negative with +1/+3/+5 pts, 11 positive), student search, description + parent-facing description, context (when/context-type/location/notes), auto-submit toggle, Cancel + Submit buttons.
- **Student search** works correctly: typed "Adam" → dropdown returned "Charlotte Adams" + "Adam Moore" with class labels. 👍
- 🐛 **WB-104 ❌ P0 — Incident create form submit fires no POST request.** Clicking "Submit Incident" button (type=submit) never sends a `POST /v1/behaviour/incidents`. The enclosing `<form>` has `method="get"` and `action="/en/behaviour/incidents/new"` (the same page), so the native browser fallback kicks in — the React onSubmit handler is not wired. Root cause is hydration-level. **No category/student selection appears to persist** — see WB-105 below.
- 🐛 **WB-105 ❌ P1 — Category + student pickers show no visual selection state.** Clicking "Helpfulness +1pts" category leaves `aria-pressed: null`, `data-selected: null`, no colour change, no ring, no check-mark. Same for clicking "Adam Moore" in the student dropdown — it does NOT render as a selected chip/tag, and the dropdown stays open. Users have no way to confirm their selection registered. Combined with WB-104 this means the entire create-incident flow is non-functional in production right now.
- 🐛 **WB-106 ⚠️ P2 — Form validation gives no feedback on empty-submit.** Submit click with blank form: no toast, no inline error, no red border. User cannot tell what's wrong.

### §1.4 `/en/behaviour/sanctions` (list)

- H1 "Sanctions" + "Today's Detentions" CTA. View toggle: List / Calendar. Filters: search, Type, Status, date range. Table: # / Student / Type / Status / Scheduled / Supervised / Incident. Empty state. Console 0 errors. API `GET /v1/behaviour/sanctions?page=1&pageSize=20` → 200.
- 🐛 WB-109 ⚠️ **P2 — Calendar view toggle button has no effect.** Clicking "Calendar" leaves the table view; no calendar renders; no API call to a range-based endpoint.
- 🐛 WB-110 ⚠️ **P1 — No standalone Sanction create route.** `/behaviour/sanctions/new` returns 404. Sanctions must be created only as side-effects of incidents — this is the documented design but there's no explicit affordance explaining that to users, and the spec's admin §10.2 implies direct create is supported.

### §1.5 `/en/behaviour/sanctions/today`

✅ Clean. "No sanctions scheduled for today" empty state. API 200.

### §1.6 `/en/behaviour/exclusions` (list)

- H1 "Exclusion Cases". Status tabs (8): All / Initiated / Notice Issued / Hearing Scheduled / Decision Made / Appeal Window / Finalised / Overturned. "Open case" CTA. Table columns: Case # / Student / Type / Status / Notice Issued / Hearing / Decision / Appeal Deadline. Empty state. Console 0 errors. NO API call recorded on initial load (likely RSC-served).
- 🐛 WB-111 ❌ **P1 — "Open case" button has no onClick.** Clicking does nothing — no modal, no drawer, no navigation.

### §1.7 `/en/behaviour/exclusions/new` (create)

- 🐛 **WB-107 ❌ P1 — `/exclusions/new` is misrouted as a detail page.** URL treats "new" as the exclusion ID. Backend emits 3× 400 `Validation failed (uuid is expected)` for `/exclusion-cases/new`, `/incidents/new/history`, `/exclusion-cases/new/timeline`. Frontend shows "Exclusion not found". No create form exists. Combined with WB-111 this means there is **no working path to create an exclusion case** in the UI.

### §1.8 `/en/behaviour/appeals` (list)

✅ Clean. H1 "Behaviour Appeals". Status tabs (6): All / Submitted / Under Review / Hearing Scheduled / Decided / Withdrawn. Filters: search, grounds, date range. Columns: Appeal # / Student / Entity / Grounds / Submitted / Status / Reviewer / Hearing / Decision + actions. No create CTA here (by design — parents submit appeals). Console 0 errors.

### §1.9 `/en/behaviour/appeals/new` (admin reviewer entry? or misroute?)

Returns 200 — needs separate inspection. Deferred.

### §1.10 `/en/behaviour/documents` (list)

- H1 "Documents". "Generate document" CTA. Filters: search by student, All types, All statuses, All sources. Columns: Document / Student / Generated / Status + actions. Empty state. Console 0 errors.
- 🐛 WB-112 ❌ **P1 — "Generate document" button has no onClick.** Click fires no modal/navigation. The primary create CTA on the page is dead.

### §1.11 `/en/behaviour/recognition`

- H1 "Recognition Wall". Hero banner "Every merit, every milestone — right here". 4 view tabs: Wall / Leaderboard / Houses / Pending Approvals. Year filter combo. Empty state.
- 🐛 WB-113 ⚠️ **P2 — 4× MISSING_MESSAGE for tab short labels**: `behaviour.recognition.tabs.wallShort`, `.leaderboardShort`, `.housesShort`, `.pendingShort` (en).

### §1.12 `/en/behaviour/recognition/new`

- 🐛 WB-114 ❌ **P1 — `/behaviour/recognition/new` 404.** No dedicated create form for recognition awards. Spec admin §17 documents a standalone recognition create flow. The behaviour hub has no visible "Create recognition award" button either (you can only log a positive incident which _becomes_ recognition via pipeline).

### §1.13 `/en/behaviour/students` (By student overview)

✅ Renders with H1 "Student Behaviour Overview", columns Student name / Year group / Points / Positive / Negative / Last incident, empty state. Same `quickLog` 2× MISSING_MESSAGE floating button issue (WB-102).

### §1.14 `/en/behaviour/tasks`

✅ H1 "Behaviour Tasks". 3 KPI stats: Pending (0), Overdue (0), Completed Today (0). Filter tabs "My Tasks / All Tasks". Empty state "No tasks match the current filters." Same WB-102 translation-key spam persists.

### §1.15 `/en/behaviour/alerts`

- H1 "Behaviour Alerts". 5 filter tabs: All / Unseen / Acknowledged / Snoozed / Resolved. Empty state.
- 🐛 **WB-108 ❌ P1 — Alerts page fetches the page URL as JSON, not `/api/v1/behaviour/alerts`.** Network log shows `GET /behaviour/alerts?status=all&page=1&pageSize=20` → 307 → `GET /en/behaviour/alerts?…` → 200 (HTML, not JSON). Client parser throws `SyntaxError: Unexpected token '<', "<!DOCTYPE "...`. Missing `/api/v1/` prefix in the alerts fetch helper.

### §1.16 `/en/behaviour/amendments`

✅ H1 "Amendment Notices". Back link + Pending/All tabs. Empty state "No corrections pending · All amendment notices have been sent." Console 0 errors.

### §1.17 `/en/behaviour/guardian-restrictions`

✅ H1 "Guardian Restrictions". "Add Restriction" CTA. Filters: All Types, All Statuses. Columns: Student / Guardian / Type / Status / Effective from / Effective until + actions. Empty state. Console 0 errors. Did not click "Add Restriction" yet — will probe shortly.

### §1.18 `/en/behaviour/analytics` (already smoke-tested)

✅ 8 analytics sub-endpoints 200. No console errors on initial overview load.

### §1.19 `/en/behaviour/analytics/ai`

- Page renders "AI Analytics" H1 + "AI features are off" banner. Correct gating — but the component still tries to render suggestions + fetch history, producing noise.
- 🐛 WB-115 ⚠️ **P2 — 15× MISSING_MESSAGE** for `behaviour.aiQuery.suggestions.{suggestedSubjects, suggestedImproving, suggestedDetentions, suggestedConcerns, suggestedRatios}` (en). 5 keys × 3 re-renders.
- 🐛 WB-116 ⚠️ **P2 — AI page fires `GET /v1/behaviour/analytics/ai-query/history?page=1&pageSize=10` → 403** even when AI flag is off. Bail out earlier.

### §1.20 `/en/behaviour/analytics/{heatmap,staff,comparisons,subjects,categories}` sub-pages

🐛 **WB-117 ❌ P1 — Five deep analytics routes return 404:**

- `/behaviour/analytics/heatmap` — 404
- `/behaviour/analytics/staff` — 404
- `/behaviour/analytics/comparisons` — 404
- `/behaviour/analytics/subjects` — 404
- `/behaviour/analytics/categories` — 404
  All referenced in the admin spec §15 as separately navigable views. If these were intended as tabs on `/behaviour/analytics` only, the spec is stale. If they should exist as deep links, the pages are missing.

### §1.21 `/en/behaviour/policy-replay`

🐛 **WB-118 ❌ P1 — `/behaviour/policy-replay` returns 404.** The hub tile "Policy replay · Preview how a policy rule would score historical incidents before you enable it" routes nowhere. Core pre-enable safety feature is non-functional.

### §1.22 `/en/behaviour/{houses,leaderboard,policies,templates}`

🐛 **WB-119 ❌ P1 — Four more behaviour routes 404:**

- `/behaviour/houses` — 404 (hub tile "Houses & Leaderboard")
- `/behaviour/leaderboard` — 404
- `/behaviour/policies` — 404 (behaviour policy rules UI — sanction escalation thresholds)
- `/behaviour/templates` — 404 (document template library)
  These are in the admin spec §17, §19, §41, §42 respectively.

### §1.23 `/en/behaviour/admin` (Admin console)

- Page renders 6 one-click actions: Recompute points, Rebuild awards, Recompute pulse, Backfill tasks, Reindex search, Retention sweep. Plus a Legal holds side card. Preview + Execute buttons per action.
- 🐛 WB-120 ⚠️ **P2 — MISSING_MESSAGE `behaviourAdmin.legalHolds.body`** (en).
- Did not click Execute on any repair action (risk-mitigation — these are explicitly flagged "operations bypass normal guardrails").

### §1.24 — quickLog floating action button

The floating "+" button at bottom-right of every behaviour page shows raw translation key `behaviour.components.quickLog.title` as its label (WB-102). It's visible in the DOM as a button with no onClick handler when clicked from the snapshot (similar to WB-101). **The Quick Log feature is entirely broken / unshipped.**

### Phase 1 summary — behaviour sub-module

- 24 pages / routes probed
- 13 found working at some level; 11 return 404
- 15+ unique live bugs discovered
- Core "create an incident" flow is non-functional (WB-104 + WB-105)
- Core "create an exclusion case" flow is non-functional (WB-107 + WB-111)
- Core "generate a document" flow is non-functional (WB-112)
- Core "create recognition award" flow is non-functional (WB-114)
- All analytics deep-views (heatmap, staff, comparisons, subjects, categories) 404 (WB-117)
- Policy replay 404 (WB-118)
- Houses + Leaderboard + Policies + Templates all 404 (WB-119)

**The behaviour sub-module is NOT release-ready in its current shipped form.** ~50% of documented admin pages either missing entirely or broken on interaction.
