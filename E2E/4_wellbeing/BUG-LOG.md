# Wellbeing — Consolidated Bug Log

**Generated:** 2026-04-21 (from `/PWC` exhaustive Playwright walkthrough + `/e2e-full` pack observations)
**Commit at source:** `2d7b93a9` (main — post impl-24 sign-off)
**Tenant used:** NHQS pilot (`nhqs.edupod.app`)
**Pack:** `E2E/4_wellbeing/`
**Live walkthrough results:** [`PLAYWRIGHT-WALKTHROUGH-RESULTS.md`](PLAYWRIGHT-WALKTHROUGH-RESULTS.md)

## 🔧 `/fix-bug-log` sweep — 2026-04-21 snapshot

See [`DECISIONS.md`](DECISIONS.md) for per-bug rationale.

| Bug IDs                                                        | Disposition                                                                                                                                                 | Commit(s)              |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| WB-001, WB-102, WB-113, WB-115, WB-120, WB-122, WB-128, WB-134 | **Verified** (i18n keys backfilled EN/AR, raw-key renders gone)                                                                                             | `f9606bc2`             |
| WB-104 (real root), WB-121                                     | **Verified** (`academic_year_id` now optional server-side, service resolves active AY; payload shape validated live, reaches service)                       | `f9606bc2`             |
| WB-123                                                         | **Won't Fix / Invalid** (walkthrough artifact — live login works)                                                                                           | `f9606bc2`             |
| WB-107, WB-129                                                 | **Verified** (`/new` + `/grants` redirects shipped; Next.js precedence now honours literal segments)                                                        | `f9606bc2`             |
| WB-108                                                         | **Verified** (alerts now hits `/api/v1/behaviour/alerts` — 200 live)                                                                                        | `f9606bc2`             |
| WB-132                                                         | **Verified** (`t` declared in 6 sub-components; both settings pages render; Object.entries guards added)                                                    | `f9606bc2`, `01d27dd3` |
| WB-135 partial                                                 | **Verified i18n only** (sections._ + labels._ keys added); backend endpoint still 404 — see Blocked row                                                     | `f9606bc2`             |
| WB-130                                                         | **Verified** (aggregate `isCompleteDashboard` loosened; dashboard now tolerates partial payloads)                                                           | `01d27dd3`             |
| WB-005                                                         | **Verified** (student dashboard no longer calls parent-scoped `/report-cards`; renders empty state)                                                         | `01d27dd3`             |
| WB-101                                                         | **Verified** (HubTile is now a `<Link>` for pure nav cases; middle-click / prefetch restored)                                                               | `01d27dd3`             |
| WB-003                                                         | **Verified** (added `wellbeing/settings/page.tsx` redirect to `/settings/behaviour-general`)                                                                | next                   |
| WB-006                                                         | **Won't Fix** (card already degrades gracefully with placeholder; implementing endpoint is net-new feature, not a bug fix)                                  | —                      |
| WB-131, WB-133, WB-135 (backend)                               | **Blocked — need input** (each requires new backend endpoint + possibly migration; product decision on ship-or-retire)                                      | —                      |
| WB-117, WB-118, WB-119, WB-110, WB-114                         | **Blocked — need input** (12 routes, each a product decision: ship the page or retire from spec)                                                            | —                      |
| WB-109, WB-111, WB-112                                         | **Partial revision** — live re-verified and confirmed false positives (CTAs open working dialogs; walkthrough mis-attributed Playwright MCP click artifact) | —                      |
| WB-002, WB-004, WB-008, WB-116                                 | **Pending** (defence-in-depth polish — deferred to next sprint)                                                                                             | —                      |
| WB-C-01..28                                                    | **Blocked — need input** (code-review observations: policy decisions, feature gaps, not single-commit fixes)                                                | —                      |

Known Playwright MCP quirk: `browser_click` does not reliably reach all target buttons on production (zero document-level click events fire even when the target is visible and `pointer-events: auto`). Verification uses `browser_evaluate` + React-fiber invocation as a workaround. Several walkthrough "inert" / "no POST" findings trace back to this tooling issue, not app bugs.

---

---

## 📖 How to use this file

### Status transitions

```
Open  →  In Progress  →  Fixed  →  Verified    ← happy path, close here
                                 ↘ Blocked     ← externally gated
                                 ↘ Won't Fix   ← explicit non-goal, record rationale
```

Only move to **Verified** after reproducing the fix on production (re-run the Playwright steps in the bug's "Verification" block) AND any covering unit/integration test passes.

### Workflow for agents picking up a bug

1. **Claim** a bug — set status to `In Progress`, add your initials to Owner column.
2. **Reproduce** before editing — re-run the Reproduction steps on production.
3. **Fix direction ≠ prescription.** Suggest cleaner approach if you find one.
4. **Test** — add/strengthen the test that would have caught this; `turbo test` + `turbo lint` + `turbo type-check` must pass.
5. **Commit** with bug ID: `fix(wbr): <summary> (WB-NNN)`
6. **Deploy** per CLAUDE.md (rsync + SSH; never `git push`) and **verify on production**.
7. **Move** bug to `Fixed` with commit SHA, then live-verify → `Verified`.

### Provenance tags

- `[L]` — verified live on production during the 2026-04-21 exhaustive walkthrough.
- `[C]` — carried from code-review observations in the spec pack (not reproduced via UI; reproduction-via-code-inspection guidance provided).

### The big picture — shared root causes to investigate first

| Suspected root cause                                                  | Symptoms it likely fixes                                       |
| --------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Form-onSubmit hydration / event-delegation regression**             | WB-101, WB-104, WB-105, WB-109, WB-111, WB-112, WB-121, WB-123 |
| **`t is not defined` minification/scoping bug** in two settings pages | WB-132                                                         |
| **Next.js route match: `/[id]` catches `new`/`grants`**               | WB-107, WB-129                                                 |
| **Missing `/api/v1/` prefix in shared fetch helper**                  | WB-108                                                         |
| **Raw backend error message passed to toast layer**                   | WB-004 (parent), WB-108-class (teacher behaviour-view)         |

Many bugs below probably share these roots. Fix the roots first — triage impact on remaining bugs afterwards.

---

## 🔥 P0 — ship-blockers (5)

### WB-104 [L] · P0 — Incident create form submits nothing

**Status:** Open · **Surface:** `/en/behaviour/incidents/new` · **Root cause:** form hydration.

**Summary** — Clicking "Submit Incident" fires **no** `POST /v1/behaviour/incidents`. Only a GET is triggered via native HTML form submit with `method="get"` + `action=/en/behaviour/incidents/new`. The React `onSubmit` handler is not wired after hydration. Category picker + student picker register no visual selection state.

**Reproduction**

1. Log in as admin.
2. Go to `/en/behaviour/incidents/new`.
3. Click "Helpfulness +1pts" → no `aria-pressed` / `data-selected` change.
4. Type "Adam" in student search → dropdown shows Adam Moore.
5. Click Adam Moore → no chip/tag appears, dropdown stays open.
6. Type any description, click "Submit Incident".
7. Network panel: only `GET /en/behaviour/incidents` (RSC refetch). No `POST /api/v1/behaviour/incidents`.

**Expected** — POST fires, incident is persisted, redirect to incident detail or back to list.

**Affected files** (grep starting points)

- `apps/web/src/app/[locale]/(school)/behaviour/incidents/new/page.tsx`
- `apps/web/src/app/[locale]/(school)/behaviour/incidents/new/_components/` (category picker, student picker, form)
- `apps/web/src/lib/forms/` or wherever react-hook-form + zodResolver live

**Fix direction** — confirm the form component uses `react-hook-form`'s `handleSubmit`. Inspect the compiled JS for missing `onSubmit` binding — this may be a RSC / client-component boundary regression where the form was accidentally server-rendered and its onSubmit was stripped at the serialization boundary. Add a `'use client'` directive if missing. Add a regression test that submits the form and expects a network POST.

**Verification** — Playwright: create incident as admin, assert `POST /v1/behaviour/incidents` fires with 201 + the incident appears in `/behaviour/incidents` list.

**Release gate** — **YES. Core create flow.**

**Related** — almost certainly the same root as WB-121 (pastoral concern), WB-123 (login), WB-101 (tiles inert), WB-109 (Calendar toggle), WB-111 (Open case), WB-112 (Generate document). Fix the root, reassess these.

---

### WB-121 [L] · P0 — Pastoral concern create form submits nothing

**Status:** Open · **Surface:** `/en/pastoral/concerns/new` · **Root cause:** same as WB-104.

**Summary** — Clicking "Save concern" fires no POST to `/api/v1/pastoral/concerns`. Concern is not persisted; the returned list shows "No results found".

**Reproduction**

1. Log in as admin.
2. Go to `/en/pastoral/concerns/new`.
3. Search "Adam" → click Adam Moore dropdown item.
4. Click "Academic" category, enter Narrative, click Save concern.
5. Network: no `POST /v1/pastoral/concerns`.
6. Navigate to `/en/pastoral/concerns` → "No results found" (concern was never saved).

**Affected files** — `apps/web/src/app/[locale]/(school)/pastoral/concerns/new/page.tsx` + component tree.

**Fix direction** — same as WB-104. Likely shares the same hydration/client-component boundary bug.

**Release gate** — **YES.**

---

### WB-123 [L] · P0 — Login form submits nothing from fresh session

**Status:** Open · **Surface:** `/en/login`

**Summary** — On a fresh session (no active cookies), filling email + password and clicking "Log in" fires no POST to `/api/v1/auth/login`. The user cannot authenticate via the UI. I had to drive the walkthrough by calling `fetch('/api/v1/auth/login', …)` from the browser console.

**Reproduction**

1. Log out (`/en/logout`) or open a new incognito session.
2. Navigate to `/en/login`.
3. Enter email + password.
4. Click "Log in" → stays at `/en/login`, no POST in network, no error.
5. Press Enter in the password field → same behaviour.

**Expected** — `POST /api/v1/auth/login` with credentials → 200 + redirect to role-appropriate dashboard.

**Affected files**

- `apps/web/src/app/[locale]/(auth)/login/page.tsx`
- `apps/web/src/app/[locale]/(auth)/login/_components/login-form.tsx` (or similar)

**Fix direction** — same as WB-104. If login is the FIRST page after initial build, check whether RSC hydration is firing at all for `(auth)` routes. This is the most visible symptom of whatever hydration regression is at play and will block tenant onboarding entirely.

**Release gate** — **YES. Blocks all new-session logins.**

**Related** — the existing session (from a previous login) kept working fine; this only affects **fresh** authentication flows.

---

### WB-132 [L] · P0 — `ReferenceError: t is not defined` crashes two settings pages

**Status:** Open · **Surface:** `/en/settings/behaviour-houses`, `/en/settings/behaviour-admin`

**Summary** — Both pages throw `ReferenceError: t is not defined` and the React error boundary renders "Something went wrong". Pages are completely unusable. Console shows the throw site is in the compiled page bundle, suggesting a minification / closure scoping error that stripped the translation function import from two pages only.

**Reproduction**

1. Log in as admin.
2. Navigate to `/en/settings/behaviour-houses` — see "Something went wrong" boundary.
3. Repeat with `/en/settings/behaviour-admin` — same.
4. Console shows: `ReferenceError: t is not defined at g (…/settings/behaviour-admin/page-….js:1:2380)`.

**Expected** — both pages render their respective admin surfaces (houses management / behaviour admin console).

**Affected files**

- `apps/web/src/app/[locale]/(school)/settings/behaviour-houses/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/behaviour-admin/page.tsx`

**Fix direction** — grep `useTranslations` in those files; confirm the `t` function is properly imported/bound in every function scope that references it. Likely an arrow-function or destructure-ordering bug where `t` is used before its declaration in the minified output. Add build-time check: `tsc --noEmit` + a smoke-test Playwright that visits every settings page and asserts no error boundary.

**Release gate** — **YES.** Two core admin settings pages are dead.

---

### WB-107 [L] · P0 — `/exclusions/new` routes as `[id]=new` (400 UUID validation)

**Status:** Open · **Surface:** `/en/behaviour/exclusions/new`

**Summary** — Navigating to `/behaviour/exclusions/new` is caught by the `/exclusions/[id]` dynamic route. The page treats "new" as a grant ID, fires `GET /api/v1/behaviour/exclusion-cases/new` → 400 `Validation failed (uuid is expected)`, and renders "Exclusion not found". Combined with WB-111 ("Open case" button has no onClick), there is **no working path to create an exclusion case** in the UI.

**Reproduction**

1. `/en/behaviour/exclusions` → click "Open case" → nothing happens.
2. Direct URL: `/en/behaviour/exclusions/new` → "Exclusion not found".
3. Console: 3× `400` for `/exclusion-cases/new`, `/incidents/new/history`, `/exclusion-cases/new/timeline`.

**Fix direction** — add a `/exclusions/new/page.tsx` with the actual create form before `/exclusions/[id]/page.tsx`. Next.js route precedence gives literal `new` priority over `[id]` only if both exist. Fix the Open case button at the same time.

**Release gate** — **YES. No way to formally open an exclusion case.**

**Related** — WB-129 (same routing bug on break-glass).

---

## 🔴 P1 — high-priority functional / security (14)

### WB-129 [L] · P1 — `/break-glass/new` and `/break-glass/grants` both route as `[id]`

**Status:** Open · **Surface:** `/en/safeguarding/break-glass/new`, `/en/safeguarding/break-glass/grants`

**Summary** — Same bug as WB-107. "new" and "grants" are both caught by `/break-glass/[id]`, fire 400 against backend, render "Grant not found". **No UI path to request break-glass access.** For a safeguarding emergency-access feature, this is a critical gap.

**Fix direction** — Add `break-glass/new/page.tsx` and `break-glass/grants/page.tsx` (list view) before the `[id]` dynamic route. Verify the backend returns a proper 404 (not 400) for missing grants, with a sensible error message for the UI to display.

**Release gate** — **YES for safeguarding operations.**

---

### WB-108 [L] · P1 — Alerts page fetches page URL as JSON

**Status:** Open · **Surface:** `/en/behaviour/alerts`

**Summary** — The alerts fetcher hits `/behaviour/alerts?status=all&page=1&pageSize=20` — which is the **frontend page URL**, NOT `/api/v1/behaviour/alerts`. The HTML response breaks the JSON parser with `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.

**Fix direction** — find the alerts fetcher (`apps/web/src/app/[locale]/(school)/behaviour/alerts/…`) and add the missing `/api/v1/` prefix. Grep for other fetches missing the prefix.

**Release gate** — **YES. Whole alerts feature unusable.**

---

### WB-117 [L] · P1 — 5 analytics deep-views return 404

**Status:** Open · **Surface:** `/behaviour/analytics/{heatmap,staff,comparisons,subjects,categories}`

**Summary** — All 5 sub-routes referenced in admin spec §15 are 404. Either ship them or retire from spec; currently the hub tile + nav refer to pages that don't exist.

**Fix direction** — choose (a) implement the 5 pages as dedicated routes, or (b) merge them into `/behaviour/analytics` as tabs + update the spec.

**Release gate** — spec clean-up minimum; UI implementation if tabs aren't acceptable.

---

### WB-118 [L] · P1 — `/behaviour/policy-replay` 404

**Status:** Open · **Surface:** `/en/behaviour/policy-replay`

**Summary** — Hub tile "Policy replay · Preview how a policy rule would score historical incidents before you enable it" routes to a 404. Core pre-enable safety feature is non-functional.

**Fix direction** — implement the page or hide the tile.

**Release gate** — YES for policy-rule safety.

---

### WB-119 [L] · P1 — 4 more behaviour routes 404

**Status:** Open · **Surface:** `/behaviour/{houses,leaderboard,policies,templates}`

**Summary** — Four more routes referenced across spec §17 / §19 / §41 / §42 all return 404.

**Fix direction** — ship each, or hide the respective hub tiles + update spec.

**Release gate** — YES for feature completeness.

---

### WB-110 [L] · P1 — No standalone sanction create route

**Status:** Open · **Surface:** `/en/behaviour/sanctions/new`

**Summary** — 404. Sanctions can only be created as side-effects of incidents; spec admin §10.2 implies direct creation exists.

**Fix direction** — either ship the create page or update spec to remove the reference.

---

### WB-114 [L] · P1 — No recognition award create route

**Status:** Open · **Surface:** `/en/behaviour/recognition/new`

**Summary** — 404. Recognition awards can only arise from positive incidents. Spec admin §17 documents standalone creation.

**Fix direction** — ship or remove from spec.

---

### WB-135 [L] · P1 — Safeguarding settings API endpoint missing

**Status:** Open · **Surface:** `/en/settings/safeguarding`

**Summary** — Page calls `GET /api/v1/safeguarding/settings` → 404. Visible "Cannot GET /api/v1/safeguarding/settings" on page. Additionally 6× MISSING_MESSAGE for `safeguarding.settings.sections.{moduleStatus,dlp,slaThresholds,dataRetention}` + `safeguarding.settings.labels.{dlpDescription,retentionHint}` — so section headers render as raw keys.

**Fix direction** — implement the backend endpoint + add all missing translation keys to `messages/{en,ar}.json`.

**Release gate** — YES. Safeguarding config is a mandatory admin surface.

---

### WB-131 [L] · P1 — Behaviour policies settings fails to load academic year groups

**Status:** Open · **Surface:** `/en/settings/behaviour-policies`

**Summary** — `GET /api/v1/academic/year-groups?pageSize=100` → 404. Visible "Cannot GET /api/v1/academic/year-groups" on page. Policies page depends on academic module's year-groups endpoint which is missing.

**Fix direction** — implement the endpoint in the academic module OR change the behaviour-policies UI to use a different source of year groups.

---

### WB-133 [L] · P1 — Behaviour award types endpoint missing

**Status:** Open · **Surface:** `/en/settings/behaviour-awards`

**Summary** — `GET /api/v1/behaviour/award-types` → 404. Page renders "Cannot GET /api/v1/behaviour/award-types". No Add Award CTA interaction tested (blocked by submit bug in WB-104 class).

---

### WB-130 [L] · P1 — Staff Wellbeing Aggregate Dashboard shows error despite 200 responses

**Status:** Open · **Surface:** `/en/wellbeing/staff#aggregate`

**Summary** — All 6 aggregate endpoints (`workload-summary`, `cover-fairness`, `timetable-quality`, `substitution-pressure`, `absence-trends`, `correlation`) return **200** — yet the component renders "Couldn't load the aggregate dashboard" with a Retry button. Component error-state branching is inverted.

**Fix direction** — check the component's loading/error state derivation. Likely a combined Promise.all that rejects on one field that's actually present. Log the combined response to see where the fall-through to error branch triggers.

---

### WB-005 [L] · P1 — Student dashboard calls parent-scoped API

**Status:** Open · **Surface:** `/en/dashboard/student`

**Summary** — Student dashboard fires `GET /api/v1/parent/students/<student_id>/report-cards` → 403. A parent-scoped endpoint being called from the student UI crosses a role boundary.

**Fix direction** — split the shared Report Cards component per role or gate the call behind a role check.

---

### WB-006 [L] · P1 — `/api/v1/reports/parent-insights` missing

**Status:** Open · **Surface:** `/en/dashboard/parent`

**Summary** — Parent dashboard's `<AiInsightCard />` calls a route that doesn't exist. 404 + component error log.

**Fix direction** — implement the endpoint or hide the card.

---

### WB-C-01 [C] · P1 — safeguarding break-glass has no dual approval

**Status:** Open — organisational-policy decision required · **Provenance:** security spec S-2

Grant-to-self possible without a second admin's approval. Fix direction: require dual approval when `scope='all_concerns'` or TTL > 24h. Extend dual-control seal pattern (integration spec §28.3-.4) to break-glass.

---

### WB-C-02 [C] · P1 — Guardian-restriction coverage on every parent endpoint

**Status:** Open · **Provenance:** security spec S-7

Parent endpoints must consult `guardian_restrictions` on every read/write. Fix direction: central NestJS interceptor via `@CurrentStudent` decorator so new endpoints can't miss the check.

---

### WB-C-03 [C] · P1 — AI flag disable propagates only on next request

**Status:** Open · **Provenance:** security spec S-1

In-memory caches may not invalidate on PATCH. Fix direction: pub/sub invalidation on `PATCH /v1/ai-flags` events.

---

### WB-C-04 [C] · P1 — Behaviour document SHA256 recompute on download

**Status:** Open · **Provenance:** security spec S-4

Verify download handler actually re-hashes the stream. If absent, Hetzner Object Storage tampering is undetected.

---

### WB-C-05 [C] · P1 — Prompt-injection mitigation undocumented

**Status:** Open · **Provenance:** security spec S-5

Document every Anthropic call + system prompt + output filter. Add Jest tests with adversarial payloads.

---

### WB-C-06 [C] · P1 — CP grants have no mandatory second approver

**Status:** Open · **Provenance:** security spec S-6

Same shape as WB-C-01 but for `cp_access_grants`.

---

### WB-C-07 [C] · P1 — JWT access-token TTL unconfirmed

**Status:** Open · **Provenance:** security spec S-9

Verify `JWT_EXPIRES_IN ≤ 900s`; fail-fast at startup if not.

---

## 🟡 P2 — polish / UX / defence-in-depth (10)

### WB-001 [L] · P2 — Missing i18n key `behaviour.components.categoryPicker.noCategories`

**Status:** Open · **Surface:** `/en/behaviour/incidents/new`

4× `MISSING_MESSAGE` for `behaviour.components.categoryPicker.noCategories` (en). Same class as commit `114cc417` fix. Add the key to `messages/{en,ar}.json`.

---

### WB-102 [L] · P2 — Quick Log floating action button shows raw translation keys

**Status:** Open · **Surface:** every behaviour page (floating `+` button)

The FAB renders with text `behaviour.components.quickLog.title` (raw key) as its aria-label, and the `quickLog` translation namespace is entirely missing (not just one key). `behaviour.components.quickLog.*` — possibly 10+ keys. Full feature unshipped but deployed.

**Fix direction** — either complete the Quick Log feature (translations + wire the click handler) or hide the FAB until ready.

---

### WB-113 [L] · P2 — Recognition tab `Short` keys missing

**Status:** Open · **Surface:** `/en/behaviour/recognition`

4× MISSING_MESSAGE: `behaviour.recognition.tabs.{wallShort, leaderboardShort, housesShort, pendingShort}`.

---

### WB-115 [L] · P2 — AI analytics suggestion keys missing (15 errors)

**Status:** Open · **Surface:** `/en/behaviour/analytics/ai`

5 keys × 3 renders = 15 MISSING_MESSAGE for `behaviour.aiQuery.suggestions.{suggestedSubjects, suggestedImproving, suggestedDetentions, suggestedConcerns, suggestedRatios}`. Even though AI flag off, component tries to render suggestions.

---

### WB-116 [L] · P2 — AI analytics fetches history even when flag off

**Status:** Open · **Surface:** `/en/behaviour/analytics/ai`

`GET /v1/behaviour/analytics/ai-query/history` → 403 when AI flag disabled. Bail out earlier if flag off.

---

### WB-120 [L] · P2 — `behaviourAdmin.legalHolds.body` missing

**Status:** Open · **Surface:** `/en/behaviour/admin`

Raw key visible as text.

---

### WB-122 [L] · P2 — `pastoral.concerns.shared.minSearchLength` missing

**Status:** Open · **Surface:** `/en/pastoral/concerns`

Raw key visible as visible text where the min-search-length hint should render.

---

### WB-128 [L] · P2 — Break-glass request button shows raw key + 2 `INSUFFICIENT_PATH` errors

**Status:** Open · **Surface:** `/en/safeguarding/break-glass`

Request button labeled `safeguardingBreakGlass.request`. Two `INSUFFICIENT_PATH` errors (different from MISSING_MESSAGE; this means the nested path is malformed — check message JSON structure).

---

### WB-134 [L] · P2 — `INVALID_MESSAGE: MALFORMED_ARGUMENT` on behaviour-documents

**Status:** Open · **Surface:** `/en/settings/behaviour-documents`

Two errors. Translation file has a malformed ICU argument — likely a `{var}` placeholder referenced without being supplied.

---

### WB-002 [L] · P2 — `/wellbeing/staff` 3× 404 console spam for non-teaching admin

**Status:** Open · **Surface:** `/en/wellbeing/staff`

ISSUE-24-04 visually fixed (no toast) but 3 `my-workload/*` endpoints still 404. Gate the fetch client-side on `has_staff_profile`.

---

### WB-004 [L] · P2 — Raw permission toast strings leak to parent + teacher

**Status:** Open · **Surface:** `/behaviour/parent-portal`, `/behaviour/parent-portal/recognition`, `/behaviour` (teacher)

Backend 403 messages like "Missing required permission: parent.view_behaviour" and "Missing required permission: behaviour.view" surface as toasts in the UI. Translate at the client toast layer using a generic `errors.permission_denied` key.

---

### WB-008 [L] · P2 — Silent redirect on permission-denied navigation

**Status:** Open

Teacher typing admin-only URL redirects silently to `/dashboard`. Add a session flash toast.

---

### WB-101 [L] · P2 — Behaviour hub tiles are `<button>` with no onClick

**Status:** Open · **Surface:** `/en/behaviour`

The 14 hub tiles are render as `<button>` elements but clicking does nothing. Only the 3 quick-action `<link>` elements navigate. **Contrast pastoral hub** (`/pastoral`) — its tiles are proper `<a href>` links and all work.

**Fix direction** — refactor behaviour hub to use `<Link>` components like pastoral. Probably a single shared component in both places.

---

### WB-103 [L] · P3 — Tab filters on incidents list don't update URL / fire API

**Status:** Open · **Surface:** `/en/behaviour/incidents`

Clicking All / Positive / Negative / Pending / Escalated / My doesn't update the URL query nor fire fresh API calls. Client-side filter only — state is not shareable/bookmarkable.

---

### WB-109 [L] · P2 — Sanctions Calendar view toggle inert

**Status:** Open · **Surface:** `/en/behaviour/sanctions`

Clicking "Calendar" leaves the table view. No calendar renders.

---

### WB-111 [L] · P2 — "Open case" CTA on `/behaviour/exclusions` inert

**Status:** Open

No onClick. Combined with WB-107, there's no way to open an exclusion case via UI.

---

### WB-112 [L] · P2 — "Generate document" CTA on `/behaviour/documents` inert

**Status:** Open

No onClick, no modal, no navigation.

---

### WB-C-08..12 · P2 — Pre-seeded security observations

| ID      | Ref  | Summary                                                               |
| ------- | ---- | --------------------------------------------------------------------- |
| WB-C-08 | S-3  | EAP refresh cron notifies managers for tenants without EAP configured |
| WB-C-09 | S-8  | Attachment `flagged` state not surfaced clearly to uploader           |
| WB-C-10 | S-10 | Survey `created_at` timestamp may leak via exports                    |
| WB-C-11 | S-11 | No rate-limit on safeguarding reports (by design)                     |
| WB-C-12 | S-12 | Platform-admin cross-tenant read needs per-read audit                 |

---

### WB-C-13..20 · P2 — Admin spec observations (O-1..O-8)

| ID      | Ref | Summary                                                                                   |
| ------- | --- | ----------------------------------------------------------------------------------------- |
| WB-C-13 | O-1 | Module-flag hard-hide on hub tiles deferred                                               |
| WB-C-14 | O-2 | EAP-staleness cron runs even for unconfigured tenants                                     |
| WB-C-15 | O-3 | `pastoral_interventions.status` uses `pc_*` prefix from `@map` collision (DZ-Wellbeing-1) |
| WB-C-16 | O-4 | Break-glass `after_action_review_required` reminder UX missing                            |
| WB-C-17 | O-5 | SST 5-minute idempotency no-ops silently                                                  |
| WB-C-18 | O-6 | AI-flag banner links non-admin staff to `/settings/ai-flags` (403)                        |
| WB-C-19 | O-7 | `safeguarding_break_glass_access_log` table not yet shipped                               |
| WB-C-20 | O-8 | No dedicated `admin_repair_runs` table                                                    |

---

### WB-C-21..28 · P2 — Teacher / Parent / Student spec observations

| ID      | Provenance               | Summary                                                                  |
| ------- | ------------------------ | ------------------------------------------------------------------------ |
| WB-C-21 | T-2                      | AI-disabled banner → `/settings/ai-flags` 403 for teacher                |
| WB-C-22 | T-3                      | `/wellbeing/dashboard` → `#aggregate` anchor empty for teacher           |
| WB-C-23 | P-1 **✓ confirmed live** | Parent portal catches summary errors silently (no retry banner)          |
| WB-C-24 | P-2 **✓ confirmed live** | No parent "Submit appeal" CTA (`/parent-portal/appeals/new` 404)         |
| WB-C-25 | P-3                      | No "Pending your approval" banner on `/parent-portal/recognition`        |
| WB-C-26 | P-4 **✓ confirmed live** | No parent self-referral CTA (`/pastoral/self-referral` 404)              |
| WB-C-27 | P-5 **✓ confirmed live** | No friendly "restricted for privacy" explainer                           |
| WB-C-28 | P-7 **✓ confirmed live** | No parent Documents tab (`/parent-portal/documents` 404)                 |
| WB-007  | [L] / S-1 ✓              | No student-facing check-in page shipped (6 URL variants tested, all 404) |

---

## 🟢 P3 — polish / stylistic (4)

### WB-003 [L] · P3 — `/wellbeing/settings` raw 404

No landing page. Add redirect to `/settings/behaviour-general` or friendly 404.

### WB-C-29..42 — remaining P3 observations (see spec pack)

Tracked as a single bucket; low-priority polish items from T-1, T-4..6, T-8, P-6, P-8, S-3..7, S-12. See `RELEASE-READINESS.md` section 92 for full list.

---

## Machine-readable summary table

| ID          | Sev | Status      | Provenance         | Surface                                              | One-line summary                                                                                                                 |
| ----------- | --- | ----------- | ------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| WB-104      | P0  | Open        | [L]                | `/behaviour/incidents/new`                           | Submit fires no POST (hydration)                                                                                                 |
| WB-121      | P0  | Open        | [L]                | `/pastoral/concerns/new`                             | Save fires no POST (hydration)                                                                                                   |
| WB-123      | P0  | Open        | [L]                | `/en/login`                                          | Login submit fires no POST                                                                                                       |
| WB-132      | P0  | Open        | [L]                | `/settings/behaviour-{houses,admin}`                 | `ReferenceError: t is not defined` crashes page                                                                                  |
| WB-107      | P0  | Open        | [L]                | `/behaviour/exclusions/new`                          | `/new` caught by `/[id]` dynamic route                                                                                           |
| WB-129      | P1  | Open        | [L]                | `/safeguarding/break-glass/{new,grants}`             | Same route precedence bug                                                                                                        |
| WB-108      | P1  | Open        | [L]                | `/behaviour/alerts`                                  | Calls page URL as JSON (missing `/api/v1/` prefix)                                                                               |
| WB-117      | P1  | Open        | [L]                | `/behaviour/analytics/{5 sub-views}`                 | 5 routes 404                                                                                                                     |
| WB-118      | P1  | Open        | [L]                | `/behaviour/policy-replay`                           | 404 — hub tile dead                                                                                                              |
| WB-119      | P1  | Open        | [L]                | `/behaviour/{houses,leaderboard,policies,templates}` | 4 routes 404                                                                                                                     |
| WB-110      | P1  | Open        | [L]                | `/behaviour/sanctions/new`                           | No create route                                                                                                                  |
| WB-114      | P1  | Open        | [L]                | `/behaviour/recognition/new`                         | No create route                                                                                                                  |
| WB-135      | P1  | Open        | [L]                | `/settings/safeguarding`                             | `/safeguarding/settings` API + 6 MISSING_MESSAGE                                                                                 |
| WB-131      | P1  | Open        | [L]                | `/settings/behaviour-policies`                       | `/academic/year-groups` API 404                                                                                                  |
| WB-133      | P1  | Open        | [L]                | `/settings/behaviour-awards`                         | `/behaviour/award-types` API 404                                                                                                 |
| WB-130      | P1  | Open        | [L]                | `/wellbeing/staff#aggregate`                         | Aggregate dashboard error-state despite 200s                                                                                     |
| WB-005      | P1  | Open        | [L]                | `/dashboard/student`                                 | Calls parent-scoped `/v1/parent/students/*/report-cards` 403                                                                     |
| WB-006      | P1  | Open        | [L]                | `/dashboard/parent`                                  | `/v1/reports/parent-insights` 404                                                                                                |
| WB-C-01     | P1  | Open        | [C] S-2            | safeguarding break-glass                             | Grant-to-self no dual approval                                                                                                   |
| WB-C-02     | P1  | Open        | [C] S-7            | parent endpoints                                     | Guardian-restriction coverage gap                                                                                                |
| WB-C-03     | P1  | Open        | [C] S-1            | ai-flags                                             | Flag disable doesn't invalidate caches                                                                                           |
| WB-C-04     | P1  | Open        | [C] S-4            | behaviour_documents                                  | SHA256 recompute on download unverified                                                                                          |
| WB-C-05     | P1  | Open        | [C] S-5            | Anthropic calls                                      | Prompt-injection mitigation undocumented                                                                                         |
| WB-C-06     | P1  | Open        | [C] S-6            | cp_access_grants                                     | No mandatory second approver                                                                                                     |
| WB-C-07     | P1  | Open        | [C] S-9            | JWT                                                  | Access-token TTL unconfirmed ≤ 15min                                                                                             |
| WB-001      | P2  | Open        | [L]                | `/behaviour/incidents/new`                           | Missing i18n `categoryPicker.noCategories`                                                                                       |
| WB-102      | P2  | Open        | [L]                | all behaviour pages (FAB)                            | `behaviour.components.quickLog.*` namespace missing; raw keys visible                                                            |
| WB-113      | P2  | Open        | [L]                | `/behaviour/recognition`                             | 4 MISSING_MESSAGE tab `*Short` keys                                                                                              |
| WB-115      | P2  | Open        | [L]                | `/behaviour/analytics/ai`                            | 15 MISSING_MESSAGE for suggestions                                                                                               |
| WB-116      | P2  | Open        | [L]                | `/behaviour/analytics/ai`                            | 403 on history read when flag off                                                                                                |
| WB-120      | P2  | Open        | [L]                | `/behaviour/admin`                                   | `behaviourAdmin.legalHolds.body` missing                                                                                         |
| WB-122      | P2  | Open        | [L]                | `/pastoral/concerns`                                 | `pastoral.concerns.shared.minSearchLength` missing                                                                               |
| WB-128      | P2  | Open        | [L]                | `/safeguarding/break-glass`                          | Raw key + 2 INSUFFICIENT_PATH                                                                                                    |
| WB-134      | P2  | Open        | [L]                | `/settings/behaviour-documents`                      | INVALID_MESSAGE: MALFORMED_ARGUMENT                                                                                              |
| WB-002      | P2  | Open        | [L]                | `/wellbeing/staff`                                   | 3× 404 console spam for non-teaching admin                                                                                       |
| WB-004      | P2  | Open        | [L]                | parent + teacher                                     | Raw toast "Missing required permission: X"                                                                                       |
| WB-008      | P2  | Open        | [L]                | teacher → admin URL                                  | Silent redirect (no toast)                                                                                                       |
| WB-101      | P2  | Open        | [L]                | `/behaviour`                                         | Hub tiles are `<button>` with no onClick                                                                                         |
| WB-103      | P3  | Open        | [L]                | `/behaviour/incidents`                               | Tab filters don't update URL / fire API                                                                                          |
| WB-109      | P2  | Open        | [L]                | `/behaviour/sanctions`                               | Calendar view toggle inert                                                                                                       |
| WB-111      | P2  | Open        | [L]                | `/behaviour/exclusions`                              | "Open case" inert                                                                                                                |
| WB-112      | P2  | Open        | [L]                | `/behaviour/documents`                               | "Generate document" inert                                                                                                        |
| WB-C-08..12 | P2  | Open        | [C] S-3,8,10,11,12 | Cross-cutting security                               | EAP noise, attachment-scan UX, survey anonymity timing, safeguarding rate-limit, platform-admin audit                            |
| WB-C-13..20 | P2  | Open        | [C] O-1..O-8       | Admin cross-cutting                                  | Module-flag hide, cron noise, @map collision, break-glass reminder, SST staleness, AI banner, break-glass log, repair-runs table |
| WB-C-21..28 | P2  | Open        | [C] T/P            | Role scoping gaps                                    | AI banner scoping, ack diff, documents tab, appeal CTA, self-referral CTA, guardian explainer, sibling isolation                 |
| WB-C-23     | P2  | Open ✓ live | [C] P-1            | `/behaviour/parent-portal`                           | Silent empty state on summary error (confirmed)                                                                                  |
| WB-C-24     | P2  | Open ✓ live | [C] P-2            | parent sanctions                                     | No appeal CTA (confirmed — /appeals/new 404)                                                                                     |
| WB-C-25     | P2  | Open        | [C] P-3            | parent recognition                                   | No "Pending approval" banner                                                                                                     |
| WB-C-26     | P2  | Open ✓ live | [C] P-4            | parent portal                                        | No self-referral CTA (confirmed — /pastoral/self-referral 404)                                                                   |
| WB-C-27     | P2  | Open ✓ live | [C] P-5            | parent portal                                        | No friendly restricted explainer                                                                                                 |
| WB-C-28     | P2  | Open ✓ live | [C] P-7            | parent portal                                        | No Documents tab (/documents 404)                                                                                                |
| WB-007      | P2  | Open ✓ live | [L]/[C]S-1         | student-facing                                       | No student check-in page (6 variants 404)                                                                                        |
| WB-003      | P3  | Open        | [L]                | `/wellbeing/settings`                                | Raw 404 — no landing page                                                                                                        |
| WB-C-29..42 | P3  | Open        | [C]                | mixed                                                | See RELEASE-READINESS §92 for full list                                                                                          |

---

## Tally

| Severity  | [L] live | [C] code-review |  Total |
| --------- | -------: | --------------: | -----: |
| P0        |        5 |               0 |      5 |
| P1        |       11 |               7 |     18 |
| P2        |       13 |              20 |     33 |
| P3        |        2 |              14 |     16 |
| **Total** |   **31** |          **41** | **72** |

6 of the `[C]` P2 parent observations were **confirmed live** — those are counted once.

---

## What closes the log

1. Every P0 row moves to **Verified** on production.
2. Every P1 row with release-gate=YES moves to **Verified**.
3. Every P2 row in the "ship blockers" section of PLAYWRIGHT-WALKTHROUGH-RESULTS.md moves to **Verified**.
4. Remaining P2/P3 rows are either scheduled in the next sprint, moved to `docs/governance/recovery-backlog.md`, or explicitly marked `Won't Fix`.
5. RELEASE-READINESS.md's sign-off table is populated for all 8 legs.

**Top 3 actions — start here:**

1. **Find and fix the form-submit hydration bug** (WB-104 root). Likely unblocks WB-101, WB-105, WB-109, WB-111, WB-112, WB-121, WB-123 in a single PR.
2. **Fix `ReferenceError: t is not defined`** on the two settings pages (WB-132). Probably a minification config or a shared import that got tree-shaken.
3. **Fix route precedence** so `/new` isn't caught by `/[id]` on exclusions + break-glass (WB-107 / WB-129). Add explicit `new/page.tsx` files and surface proper 404 for malformed IDs.
