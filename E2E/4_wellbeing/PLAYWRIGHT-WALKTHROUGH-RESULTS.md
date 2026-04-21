# Wellbeing — Exhaustive Playwright Walkthrough Results

**Executed:** 2026-04-21
**Tenant:** NHQS pilot (`https://nhqs.edupod.app`, tenant `3ba9b02c-0339-49b8-8583-a06e05a32ac5`)
**Commit at test time:** `2d7b93a9` (main — post impl-24 sign-off)
**Methodology:** exhaustive — every sub-module walked page-by-page as admin, plus teacher / parent / student scoped variants. Forms driven through categorical selection, student search, submission; admin-only URLs attempted by non-admin roles; Arabic locale + mobile viewport probed.
**Agent:** headless Playwright MCP (Chromium, desktop 1280×800 + iPhone SE 375×667 probe)
**Test policy:** NHQS is a test tenant (fake data per `feedback_prod_tenants_are_test.md`); mutating actions were allowed where intended to verify write-path. In practice every mutating form submit tested failed to fire a POST — see WB-104 class.

---

## Headline verdict

**❌ NOT release-ready.** The wellbeing umbrella has substantial functional gaps:

- **2 pages crash** with `ReferenceError: t is not defined` (P0)
- **4 core create-flows are non-functional**: incident, pastoral concern, exclusion case, recognition award — submit button emits no POST (P0)
- **18+ documented routes return 404** — half the admin surface is missing or unreachable (P1)
- **≥ 40 translation keys** either missing (`MISSING_MESSAGE`) or visible as raw text (e.g. `"behaviour.components.quickLog.title"`) in English (P2)
- **Several page-to-API wires are broken**: `/behaviour/alerts` fetches HTML instead of JSON; behaviour-policies calls a missing `/academic/year-groups` endpoint; behaviour-awards calls a missing `/award-types` endpoint; safeguarding-settings calls a missing endpoint (P1)
- **Permission toasts leak raw backend strings** ("Missing required permission: parent.view_behaviour") directly into the UI (P2)
- **Quick Log floating action button** is shipped with raw keys visible in every behaviour page (P2)
- **ISSUE-24-01..04 regressions**: 3/4 closed; 1 (wellbeing/staff) is toast-free but still emits 3× 404s to console (partial)

ISSUE-24-01..04 regression verification:

| Ticket | URL                                        | Expected                   | Observed                                        | Verdict             |
| ------ | ------------------------------------------ | -------------------------- | ----------------------------------------------- | ------------------- |
| 24-01  | `/en/safeguarding`                         | clean, no toasts           | 4 endpoints 200, 0 console errors               | ✅ Pass             |
| 24-02  | `/en/early-warnings`                       | no 500                     | `/pastoral/interventions?status=active` 200     | ✅ Pass             |
| 24-03  | `/en/behaviour/analytics`                  | no 500                     | 8 analytics endpoints all 200                   | ✅ Pass             |
| 24-04  | `/en/wellbeing/staff` (non-teaching admin) | no 404 toasts, empty state | no toasts, **but 3× 404 console errors remain** | ⚠️ Partial (WB-002) |

---

## Exhaustive per-page matrix — Admin role (`owner@nhqs.test`)

### Behaviour sub-module (14 hub tiles + 24 probed routes)

| Path                               | HTTP    | UI renders         | Core interaction                                                                                       |                                                Console errors | Verdict                   |
| ---------------------------------- | ------- | ------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------: | ------------------------- |
| `/behaviour`                       | 200     | Hub                | **Tiles are `<button>` with no onClick** (WB-101)                                                      |                                                             0 | ❌ Partial                |
| `/behaviour/incidents`             | 200     | List + filters     | Tab filters don't update URL / fire API (WB-103); QuickLog raw key visible (WB-102)                    |                                           2 (MISSING_MESSAGE) | ❌ Partial                |
| `/behaviour/incidents/new`         | 200     | Form               | **Submit fires no POST** (WB-104) + **no selection feedback** (WB-105) + **no validation UI** (WB-106) |                                           4 (MISSING_MESSAGE) | ❌ Fail                   |
| `/behaviour/sanctions`             | 200     | List               | **Calendar toggle doesn't switch view** (WB-109); no direct create (WB-110 confirmed by 404)           |                                                             0 | ⚠️ Partial                |
| `/behaviour/sanctions/today`       | 200     | List               | Empty state                                                                                            |                                                             0 | ✅ Pass                   |
| `/behaviour/sanctions/new`         | **404** | —                  | —                                                                                                      |                                                             — | ❌ Route missing (WB-110) |
| `/behaviour/exclusions`            | 200     | List               | **"Open case" CTA has no onClick** (WB-111)                                                            |                                                             0 | ❌ Partial                |
| `/behaviour/exclusions/new`        | 200     | Detail (wrong!)    | **"new" parsed as grant ID → 400 UUID error** (WB-107); "Exclusion not found" message                  |                                         6 (400 + page errors) | ❌ Fail                   |
| `/behaviour/appeals`               | 200     | List               | No create CTA (by design)                                                                              |                                                             0 | ✅ Pass                   |
| `/behaviour/appeals/new`           | 200     | Form (?)           | Not deeply tested — form exists                                                                        |                                                             0 | ⚠️ Unverified             |
| `/behaviour/documents`             | 200     | List               | **"Generate document" CTA has no onClick** (WB-112)                                                    |                                                             0 | ❌ Partial                |
| `/behaviour/recognition`           | 200     | Wall + 4 tabs      | 4 tab `Short` keys missing (WB-113)                                                                    |                                           4 (MISSING_MESSAGE) | ⚠️ Partial                |
| `/behaviour/recognition/new`       | **404** | —                  | —                                                                                                      |                                                             — | ❌ Route missing (WB-114) |
| `/behaviour/students`              | 200     | Overview           | —                                                                                                      |                                  2 (quickLog MISSING_MESSAGE) | ⚠️ Partial                |
| `/behaviour/tasks`                 | 200     | Stats + tabs       | Empty state                                                                                            |                                                  2 (quickLog) | ⚠️ Partial                |
| `/behaviour/alerts`                | 200     | List + tabs        | **Alerts fetcher calls page URL, parses HTML as JSON → SyntaxError** (WB-108)                          |                                               1 (SyntaxError) | ❌ Fail                   |
| `/behaviour/amendments`            | 200     | Queue              | Empty state                                                                                            |                                                             0 | ✅ Pass                   |
| `/behaviour/guardian-restrictions` | 200     | List               | "Add Restriction" CTA visible but untested                                                             |                                                             0 | ✅ Pass (structural)      |
| `/behaviour/analytics`             | 200     | Overview           | 8 analytics endpoints all 200                                                                          |                                                             0 | ✅ Pass                   |
| `/behaviour/analytics/ai`          | 200     | AI flag-off banner | 5 suggestion keys × 3 renders missing (WB-115); 403 on history read (WB-116)                           |                                                            17 | ❌ Partial                |
| `/behaviour/analytics/heatmap`     | **404** | —                  | —                                                                                                      |                                                             — | ❌ Route missing (WB-117) |
| `/behaviour/analytics/staff`       | **404** | —                  | —                                                                                                      |                                                             — | ❌ Route missing (WB-117) |
| `/behaviour/analytics/comparisons` | **404** | —                  | —                                                                                                      |                                                             — | ❌ Route missing (WB-117) |
| `/behaviour/analytics/subjects`    | **404** | —                  | —                                                                                                      |                                                             — | ❌ Route missing (WB-117) |
| `/behaviour/analytics/categories`  | **404** | —                  | —                                                                                                      |                                                             — | ❌ Route missing (WB-117) |
| `/behaviour/policy-replay`         | **404** | —                  | —                                                                                                      |                                                             — | ❌ Route missing (WB-118) |
| `/behaviour/houses`                | **404** | —                  | —                                                                                                      |                                                             — | ❌ Route missing (WB-119) |
| `/behaviour/leaderboard`           | **404** | —                  | —                                                                                                      |                                                             — | ❌ Route missing (WB-119) |
| `/behaviour/policies`              | **404** | —                  | —                                                                                                      |                                                             — | ❌ Route missing (WB-119) |
| `/behaviour/templates`             | **404** | —                  | —                                                                                                      |                                                             — | ❌ Route missing (WB-119) |
| `/behaviour/admin`                 | 200     | Repair console     | 6 one-click actions + legal holds                                                                      | 1 (MISSING_MESSAGE `behaviourAdmin.legalHolds.body` — WB-120) | ⚠️ Partial                |

**Behaviour result: 13/30 functional, 11 404, 6 partial.** The module's core create paths (incident, sanction, exclusion, document, recognition) are all non-functional.

### Pastoral sub-module (18 probed routes)

| Path                               | HTTP    | UI renders                                             | Core interaction                                                                                                                  |      Console errors | Verdict          |
| ---------------------------------- | ------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------: | ---------------- |
| `/pastoral`                        | 200     | Hub (rich)                                             | Real `<link>` sub-nav ✅; operational lanes ✅                                                                                    |       3 (see below) | ✅ Pass          |
| `/pastoral/concerns`               | 200     | List + filter                                          | Raw key visible `pastoral.concerns.shared.minSearchLength` (WB-122)                                                               | 2 (MISSING_MESSAGE) | ⚠️ Partial       |
| `/pastoral/concerns/new`           | 200     | Comprehensive form                                     | **Save button fires no POST** (WB-121 — same class as WB-104). Student picker + category selector click-able but no visual state. |                   0 | ❌ Fail          |
| `/pastoral/cases`                  | 200     | List                                                   | Empty state                                                                                                                       |                   0 | ✅ Pass          |
| `/pastoral/cases/new`              | 200     | Form (?)                                               | Not deeply tested                                                                                                                 |                   0 | ⚠️ Unverified    |
| `/pastoral/interventions`          | 200     | List                                                   | "Create intervention" CTA                                                                                                         |                   0 | ✅ Pass          |
| `/pastoral/interventions/new`      | 200     | Form (?)                                               | Not deeply tested                                                                                                                 |                   0 | ⚠️ Unverified    |
| `/pastoral/referrals`              | 200     | List                                                   | "Create referral" CTA                                                                                                             |                   0 | ✅ Pass          |
| `/pastoral/referrals/new`          | 200     | Form (?)                                               | Not deeply tested                                                                                                                 |                   0 | ⚠️ Unverified    |
| `/pastoral/sst`                    | 200     | List                                                   | "Schedule meeting" + "Create meeting" CTAs                                                                                        |                   0 | ✅ Pass          |
| `/pastoral/sst/new`                | 200     | Form (?)                                               | Not deeply tested                                                                                                                 |                   0 | ⚠️ Unverified    |
| `/pastoral/critical-incidents`     | 200     | List                                                   | "Declare incident" CTA                                                                                                            |                   0 | ✅ Pass          |
| `/pastoral/critical-incidents/new` | 200     | Form (?)                                               | Not deeply tested                                                                                                                 |                   0 | ⚠️ Unverified    |
| `/pastoral/checkins`               | 200     | Monitor config + queue + history + aggregate analytics | Comprehensive                                                                                                                     |                   0 | ✅ Pass          |
| `/pastoral/checkins/flagged`       | 200     | Queue                                                  | Empty state "Monitoring backlog is clear"                                                                                         |                   0 | ✅ Pass          |
| `/pastoral/dsar`                   | 200     | Review queue                                           | 5 KPI tiles, empty state                                                                                                          |                   0 | ✅ Pass          |
| `/pastoral/import`                 | 200     | CSV wizard (3-step)                                    | Upload / Validate / Review                                                                                                        |                   0 | ✅ Pass          |
| `/pastoral/admin`                  | **404** | —                                                      | —                                                                                                                                 |                   — | ❌ Route missing |
| `/pastoral/external-providers`     | **404** | —                                                      | —                                                                                                                                 |                   — | ❌ Route missing |
| `/pastoral/reports`                | **404** | —                                                      | —                                                                                                                                 |                   — | ❌ Route missing |

**Pastoral result: 15/18 functional at surface level, 3 404. Unlike behaviour, tiles are real `<link>` elements so navigation works.** However, the flagship concern-create form has the same broken-submit bug (WB-121).

### Safeguarding sub-module (11 probed routes)

| Path                               | HTTP    | UI renders                                | Notes                                                                                              | Verdict             |
| ---------------------------------- | ------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------- |
| `/safeguarding`                    | 200     | Hub                                       | KPIs + quick actions + nav grid                                                                    | ✅ Pass             |
| `/safeguarding/concerns`           | 200     | **Redirects to `/pastoral/concerns`**     | Same inherited `minSearchLength` missing key                                                       | ⚠️ Re-uses pastoral |
| `/safeguarding/concerns/new`       | 200     | **Redirects to `/pastoral/concerns/new`** | Same broken submit                                                                                 | ❌ Inherited fail   |
| `/safeguarding/break-glass`        | 200     | Grants list                               | Raw key `safeguardingBreakGlass.request` + 2× `INSUFFICIENT_PATH` errors (WB-128)                  | ⚠️ Partial          |
| `/safeguarding/break-glass/new`    | 200     | **"Grant not found"**                     | **"new" parsed as grant ID** — 400 `/break-glass/new` + 400 `/break-glass/new/access-log` (WB-129) | ❌ Fail             |
| `/safeguarding/break-glass/grants` | 200     | **"Grant not found"**                     | Same bug — "grants" parsed as grant ID (WB-129)                                                    | ❌ Fail             |
| `/safeguarding/actions`            | **404** | —                                         | Spec admin §30 references this page                                                                | ❌ Route missing    |
| `/safeguarding/cp-records`         | **404** | —                                         | Spec admin §29.4 references this page                                                              | ❌ Route missing    |
| `/safeguarding/seal`               | **404** | —                                         | Spec admin §31 references this page                                                                | ❌ Route missing    |
| `/safeguarding/admin`              | **404** | —                                         | —                                                                                                  | ❌ Route missing    |
| `/safeguarding/reports`            | **404** | —                                         | —                                                                                                  | ❌ Route missing    |

**Safeguarding result: 4/11 functional, 5 404, 2 broken detail routes.** Break-glass grant creation has no working UI path — same routing bug as exclusions/new.

### Early Warnings (4 probed routes)

| Path                          | HTTP    | UI renders           | Notes                                                           | Verdict          |
| ----------------------------- | ------- | -------------------- | --------------------------------------------------------------- | ---------------- |
| `/early-warnings`             | 200     | Hub + summary + tabs | `/pastoral/interventions?status=active` 200 (ISSUE-24-02 fixed) | ✅ Pass          |
| `/early-warnings/settings`    | 200     | Full settings form   | Domain weights + tier thresholds + routing + weekly digest      | ✅ Pass          |
| `/early-warnings/suppression` | **404** | —                    | Spec admin §34 references                                       | ❌ Route missing |
| `/early-warnings/triggers`    | **404** | —                    | Spec admin §34 references                                       | ❌ Route missing |

### Staff Wellbeing (single page with 5 anchored sections)

| Section                            | UI renders                                                                                    | Notes                                                                                           | Verdict    |
| ---------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------- |
| My Workload (`#my`)                | Proper empty state for non-teaching admin                                                     | ISSUE-24-04 _visually_ fixed, but 3× 404 console errors remain (WB-002)                         | ⚠️ Partial |
| Aggregate Dashboard (`#aggregate`) | **"Couldn't load the aggregate dashboard" + Retry**                                           | All 6 aggregate endpoints actually return 200 — component error-states despite success (WB-130) | ❌ Fail    |
| Staff Surveys (`#surveys`)         | List + Create Survey CTA                                                                      | Empty state                                                                                     | ✅ Pass    |
| Board Report (`#board-report`)     | **"Not yet available" + Retry**                                                               | `/reports/termly-summary` returned 200 but UI shows error                                       | ⚠️ Partial |
| EAP & Resources (`#resources`)     | "No EAP configured" + 6 crisis helplines (Pieta / Samaritans / Text50808 / INTO / TUI / ASTI) | Good content                                                                                    | ✅ Pass    |

Sub-routes `/wellbeing/staff/surveys`, `/aggregate`, `/reports`, `/eap` all 404 (intended — they're anchors on one page).

### Settings (11 probed routes)

| Path                                    | HTTP    | UI renders                                                                 | Notes                                                                                    | Verdict          |
| --------------------------------------- | ------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------- |
| `/settings/behaviour-general`           | 200     | 7 config sections                                                          | QuickLog / Points / House Teams / Awards / Sanctions / Parent vis                        | ✅ Pass          |
| `/settings/behaviour-categories`        | 200     | 32 categories table                                                        | Add / Edit / Delete actions                                                              | ✅ Pass          |
| `/settings/behaviour-policies`          | 200     | 5 policy stages + replay                                                   | **404 on `/academic/year-groups` — visible error on page** (WB-131)                      | ❌ Partial       |
| `/settings/behaviour-houses`            | 200     | **ERROR BOUNDARY** "Something went wrong"                                  | **`ReferenceError: t is not defined`** (WB-132) — page dead                              | ❌ P0            |
| `/settings/behaviour-awards`            | 200     | List + Add Award                                                           | **404 on `/behaviour/award-types` — visible error** (WB-133)                             | ❌ Partial       |
| `/settings/behaviour-documents`         | 200     | Template list                                                              | 2× `INVALID_MESSAGE: MALFORMED_ARGUMENT` console (WB-134)                                | ⚠️ Partial       |
| `/settings/behaviour-admin`             | 200     | **ERROR BOUNDARY** "Something went wrong"                                  | **`ReferenceError: t is not defined`** (WB-132) — page dead                              | ❌ P0            |
| `/settings/safeguarding`                | 200     | Settings form                                                              | 6× MISSING_MESSAGE (safeguarding.settings.\*) + 404 on `/safeguarding/settings` (WB-135) | ❌ Fail          |
| `/settings/ai-flags`                    | 200     | 4 flag toggles (Behaviour/Pastoral/Staff/Early Warnings) — all Disabled    | Clean, timestamps shown                                                                  | ✅ Pass          |
| `/settings/communications/safeguarding` | 200     | Keyword list (~20 entries across Abuse / Bullying / Inappropriate contact) | Clean                                                                                    | ✅ Pass          |
| `/settings/wellbeing-notifications`     | **404** | —                                                                          | Spec admin §42 references this page                                                      | ❌ Route missing |

**Settings result: 3/11 fully clean, 2 P0 crashes, 6 partial.**

### Wellbeing super-hub + cross-cutting

| Probe                            | Observed                                                                                                                                | Verdict   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `/wellbeing` super-hub           | 4 KPIs + 4 quick actions + 6 module tiles + resources tray. **Tiles are real `<link>` tags** (unlike /behaviour) — all navigation works | ✅ Pass   |
| `/wellbeing/settings`            | Raw 404 — no landing page / redirect (WB-003)                                                                                           | ❌ Polish |
| `/wellbeing/settings/categories` | Raw 404                                                                                                                                 | ❌ Polish |
| `/ar/wellbeing` (Arabic / RTL)   | `dir="rtl"`, `lang="ar"`, 0 console errors                                                                                              | ✅ Pass   |
| Mobile viewport 375×667          | `scrollWidth === 375`, no horizontal overflow                                                                                           | ✅ Pass   |

---

## Exhaustive per-page matrix — Teacher (`Sarah.daly@nhqs.test`)

| Surface                           | Verdict & notes                                                                                                                                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Morph bar                         | Correctly hides Finance / Regulatory / Settings. Shows Home / People / Learning / Wellbeing / Operations / Inbox / Reports                                                                                | ✅         |
| `/wellbeing`                      | Hub renders. KPIs + tiles visible                                                                                                                                                                         | ✅         |
| `/behaviour`                      | Hub loads. 14 tiles shown. **But KPIs all 403 `behaviour.view`** — 4× raw toasts "Missing required permission: behaviour.view" (WB-004 class) + generic "We could not load the behaviour overview" banner | ❌ Partial |
| `/settings/behaviour-categories`  | **Silent redirect to /dashboard** — no explanation toast (WB-008)                                                                                                                                         | ⚠️ Partial |
| `/safeguarding` (earlier session) | Clean "Restricted workspace" empty state with guidance to DSL                                                                                                                                             | ✅         |
| Login form submit                 | **Clicking "Log in" fires no POST** (WB-123 — same class as WB-104). Had to auth via direct API call.                                                                                                     | ❌ P0      |

**Observations:** teacher has `parent.view_behaviour` 403 cascade and permission-grant gap per user directive. Main new findings are (a) WB-123 login form broken — and (b) admin-only pages silently redirect to /dashboard without toast.

---

## Exhaustive per-page matrix — Parent (`parent@nhqs.test`, Zainab Ali)

| Surface                                | HTTP    | Renders                               | Notes                                                                                     | Verdict    |
| -------------------------------------- | ------- | ------------------------------------- | ----------------------------------------------------------------------------------------- | ---------- |
| Morph bar                              | —       | Home / Learning / Reports             | Correctly hides Wellbeing / People / Operations / Inbox / Finance / Regulatory / Settings | ✅         |
| `/dashboard/parent`                    | 200     | Dashboard                             | 7× 403 on child-scoped endpoints + 1× 404 on `/reports/parent-insights` (WB-006 missing)  | ❌ Partial |
| `/behaviour/parent-portal`             | 200     | "No children linked" empty state      | **Raw toast "Missing required permission: parent.view_behaviour"** (WB-004)               | ❌ Partial |
| `/behaviour/parent-portal/recognition` | 200     | "No awards published yet" empty state | Same raw 403 toast                                                                        | ❌ Partial |
| `/behaviour/parent-portal/sanctions`   | **404** | —                                     | Not shipped (P-2 confirmed live)                                                          | ❌ Missing |
| `/behaviour/parent-portal/appeals`     | **404** | —                                     | Not shipped (P-2 confirmed live)                                                          | ❌ Missing |
| `/behaviour/parent-portal/appeals/new` | **404** | —                                     | Not shipped — parents cannot submit appeals via UI                                        | ❌ Missing |
| `/behaviour/parent-portal/documents`   | **404** | —                                     | Not shipped (P-7 confirmed live)                                                          | ❌ Missing |
| `/pastoral/self-referral`              | **404** | —                                     | Not shipped (P-4 confirmed live)                                                          | ❌ Missing |
| `/parent/pastoral/self-referral`       | **404** | —                                     | Not shipped                                                                               | ❌ Missing |

**Parent portal is missing every secondary surface the spec describes** — only the landing + recognition tab exist.

---

## Exhaustive per-page matrix — Student (`adam.moore@nhqs.test`, Adam Moore)

| Surface                                 | HTTP     | Notes                                                                          | Verdict              |
| --------------------------------------- | -------- | ------------------------------------------------------------------------------ | -------------------- |
| Morph bar                               | —        | Only Home + Reports (extremely minimal)                                        | ✅                   |
| `/dashboard/student`                    | 200      | Schedule / Homework / Report Cards tiles                                       | ✅                   |
| `/wellbeing`, `/behaviour`, `/pastoral` | 200 each | Page-level routes accessible via RSC; actual content would be permission-gated | ⚠️ not deeply tested |
| `/pastoral/checkins`                    | 200      | Redirected to student dashboard (staff-only page)                              | ✅ correct gate      |
| `/en/checkin`                           | **404**  | Confirms S-1: no student check-in page                                         | ❌ Missing           |
| `/en/student/checkin`                   | **404**  | —                                                                              | ❌ Missing           |
| `/en/me/checkin`                        | **404**  | —                                                                              | ❌ Missing           |
| `/en/dashboard/student/checkin`         | **404**  | —                                                                              | ❌ Missing           |
| `/en/dashboard/student/wellbeing`       | **404**  | —                                                                              | ❌ Missing           |
| `/en/my/checkin`                        | **404**  | —                                                                              | ❌ Missing           |
| `POST /api/v1/pastoral/checkins`        | 401      | Endpoint exists, requires bearer token (not cookie)                            | ✅ correct           |
| `GET /api/v1/pastoral/checkins/today`   | **404**  | Endpoint does not exist despite appearing in spec                              | ❌ Missing           |

**Student wellbeing surface = 0 pages shipped.** The permission-less POST endpoint exists, but there is no UI a student can reach to exercise it. S-1 observation confirmed with 6 URL variants probed.

---

## Complete console / network summary

| Locale | Role    | Page                                                                 |   Errors | Notable failures                                                           |
| ------ | ------- | -------------------------------------------------------------------- | -------: | -------------------------------------------------------------------------- |
| en     | admin   | /wellbeing                                                           |        0 | —                                                                          |
| en     | admin   | /behaviour                                                           |        0 | tiles inert (WB-101)                                                       |
| en     | admin   | /behaviour/incidents                                                 |        2 | MISSING_MESSAGE × 2 (quickLog)                                             |
| en     | admin   | /behaviour/incidents/new                                             |        4 | MISSING_MESSAGE × 4 (categoryPicker.noCategories); submit dead (WB-104)    |
| en     | admin   | /behaviour/sanctions                                                 |        0 | Calendar toggle inert (WB-109)                                             |
| en     | admin   | /behaviour/sanctions/today                                           |        0 | —                                                                          |
| en     | admin   | /behaviour/exclusions                                                |        0 | "Open case" CTA dead (WB-111)                                              |
| en     | admin   | /behaviour/exclusions/new                                            |        6 | 400 × 3 (misrouting); client error × 3                                     |
| en     | admin   | /behaviour/appeals                                                   |        0 | —                                                                          |
| en     | admin   | /behaviour/documents                                                 |        0 | "Generate" CTA dead (WB-112)                                               |
| en     | admin   | /behaviour/recognition                                               |        4 | MISSING_MESSAGE × 4 (tabs.\*Short)                                         |
| en     | admin   | /behaviour/recognition/new                                           |      404 | not shipped                                                                |
| en     | admin   | /behaviour/students                                                  |        2 | quickLog × 2                                                               |
| en     | admin   | /behaviour/tasks                                                     |        2 | quickLog × 2                                                               |
| en     | admin   | /behaviour/alerts                                                    |        1 | JSON parse error (WB-108)                                                  |
| en     | admin   | /behaviour/amendments                                                |        0 | —                                                                          |
| en     | admin   | /behaviour/guardian-restrictions                                     |        0 | —                                                                          |
| en     | admin   | /behaviour/analytics                                                 |        0 | —                                                                          |
| en     | admin   | /behaviour/analytics/ai                                              |       17 | MISSING_MESSAGE × 15 (aiQuery.suggestions.\*) + 403 × 2 (ai-query/history) |
| en     | admin   | /behaviour/analytics/{heatmap/staff/comparisons/subjects/categories} | 404 each | Not shipped                                                                |
| en     | admin   | /behaviour/{houses/leaderboard/policies/templates/policy-replay}     | 404 each | Not shipped                                                                |
| en     | admin   | /behaviour/admin                                                     |        1 | MISSING_MESSAGE (legalHolds.body)                                          |
| en     | admin   | /pastoral                                                            |        3 | 3× 404 for `/pastoral/{admin,external-providers,reports}` pre-fetch        |
| en     | admin   | /pastoral/concerns                                                   |        2 | MISSING_MESSAGE × 2 (minSearchLength)                                      |
| en     | admin   | /pastoral/concerns/new                                               |        0 | Submit dead (WB-121)                                                       |
| en     | admin   | /pastoral/cases                                                      |        0 | —                                                                          |
| en     | admin   | /pastoral/interventions                                              |        0 | —                                                                          |
| en     | admin   | /pastoral/referrals                                                  |        0 | —                                                                          |
| en     | admin   | /pastoral/sst                                                        |        0 | —                                                                          |
| en     | admin   | /pastoral/critical-incidents                                         |        0 | —                                                                          |
| en     | admin   | /pastoral/checkins                                                   |        0 | —                                                                          |
| en     | admin   | /pastoral/checkins/flagged                                           |        0 | —                                                                          |
| en     | admin   | /pastoral/dsar                                                       |        0 | —                                                                          |
| en     | admin   | /pastoral/import                                                     |        0 | —                                                                          |
| en     | admin   | /safeguarding                                                        |        0 | —                                                                          |
| en     | admin   | /safeguarding/break-glass                                            |        2 | INSUFFICIENT_PATH × 2 + raw key visible                                    |
| en     | admin   | /safeguarding/break-glass/new                                        |        2 | 400 × 2 (misrouting)                                                       |
| en     | admin   | /safeguarding/break-glass/grants                                     |        2 | 400 × 2 (misrouting)                                                       |
| en     | admin   | /safeguarding/{actions/cp-records/seal/admin/reports}                | 404 each | Not shipped                                                                |
| en     | admin   | /early-warnings                                                      |        0 | —                                                                          |
| en     | admin   | /early-warnings/settings                                             |        0 | —                                                                          |
| en     | admin   | /wellbeing/staff                                                     |        3 | 404 × 3 (my-workload/\*) — WB-002                                          |
| en     | admin   | /settings/behaviour-general                                          |        0 | —                                                                          |
| en     | admin   | /settings/behaviour-categories                                       |        0 | —                                                                          |
| en     | admin   | /settings/behaviour-policies                                         |        2 | 404 × 2 (`/academic/year-groups`)                                          |
| en     | admin   | /settings/behaviour-houses                                           |        2 | **`t is not defined`** — page dead                                         |
| en     | admin   | /settings/behaviour-awards                                           |        2 | 404 × 2 (`/behaviour/award-types`)                                         |
| en     | admin   | /settings/behaviour-documents                                        |        2 | INVALID_MESSAGE: MALFORMED_ARGUMENT × 2                                    |
| en     | admin   | /settings/behaviour-admin                                            |        2 | **`t is not defined`** — page dead                                         |
| en     | admin   | /settings/safeguarding                                               |        8 | MISSING_MESSAGE × 6 + 404 × 1 (`/safeguarding/settings`) + client × 1      |
| en     | admin   | /settings/ai-flags                                                   |        0 | —                                                                          |
| en     | admin   | /settings/communications/safeguarding                                |        0 | —                                                                          |
| en     | admin   | /wellbeing/settings                                                  |      404 | No landing (WB-003)                                                        |
| ar     | admin   | /ar/wellbeing                                                        |        0 | RTL confirmed                                                              |
| en     | teacher | /wellbeing                                                           |        0 | —                                                                          |
| en     | teacher | /behaviour                                                           |        9 | 403 × 5 + raw toast × 4 (permission gap)                                   |
| en     | teacher | /settings/behaviour-categories                                       |        1 | silent redirect (WB-008)                                                   |
| en     | parent  | /behaviour/parent-portal                                             |        2 | 403 + raw toast (WB-004)                                                   |
| en     | parent  | /behaviour/parent-portal/recognition                                 |        2 | 403 + raw toast                                                            |
| en     | parent  | /dashboard/parent                                                    |       15 | 7× 403 (child-scoped) + 1× 404 (`/reports/parent-insights`) (WB-006)       |
| en     | student | /dashboard/student                                                   |       3+ | 404 gradebook + 403 parent-scope leak (WB-005)                             |

---

## Form-submit bug — the single biggest finding (WB-104 class)

Across the entire module, every `<button type="submit">` I tested on a create form:

- **Incident create** (`/behaviour/incidents/new`) — button click, no POST, no error, no redirect.
- **Pastoral concern create** (`/pastoral/concerns/new`) — Save button click, no POST, no error, no redirect.
- **Login page** (`/en/login`) — Log in button click as teacher or parent, no POST to `/api/v1/auth/login`. **The login form itself is broken** for subsequent authentication attempts. I had to use direct API login via `fetch()` to continue role testing.

The enclosing `<form>` elements all have `method="get"` and `action` pointing to the current URL — so browser native GET submit is running on click, causing a page reload with form values as query params (hence the `_rsc` refetch of the same page). The React onSubmit handler is **not being wired on hydration**. The same hydration glitch would explain WB-101 (tiles-as-buttons with no onClick), WB-109 (calendar toggle inert), WB-111 ("Open case" inert), WB-112 ("Generate document" inert).

**This is most likely a single root cause — a build/hydration regression affecting a shared form primitive or event-delegation layer.** One fix probably clears dozens of symptoms.

---

## Severity tally — live [L] findings only

| Severity  |  Count |
| --------- | -----: |
| P0        |      5 |
| P1        |     14 |
| P2        |     10 |
| P3        |      4 |
| **Total** | **33** |

Plus 41 pre-seeded code-review [C] observations from the spec pack — total 74 unique bugs in BUG-LOG.md.

---

## Recommended release blockers (must fix before ship)

1. **WB-104 / WB-121 / WB-123 — form submit hydration bug** (P0). Every create/login form in the module silently fails. Fix the underlying hydration glitch → probably unblocks ≥ 6 other symptoms (WB-101, 109, 111, 112, 105).
2. **WB-132 — `ReferenceError: t is not defined`** on `/settings/behaviour-houses` and `/settings/behaviour-admin` (P0). Both pages crash with error boundary; likely the same minification bug stripping the `t` translator import from the minified build.
3. **WB-107 / WB-129 — `/new` treated as an ID** on exclusions and break-glass. Route-matching precedence is wrong; dynamic `[id]` is catching literal `new`.
4. **WB-117 / WB-118 / WB-119 — 11 documented routes return 404.** Either ship the pages or retire them from the spec + remove the hub-tile affordances.
5. **WB-108 — `/behaviour/alerts` fetches HTML instead of JSON.** Missing `/api/v1/` prefix.
6. **WB-131 / WB-133 / WB-135 — missing backend endpoints** called from settings pages (`/academic/year-groups`, `/behaviour/award-types`, `/safeguarding/settings`).
7. **WB-004 — raw permission toast strings** ("Missing required permission: X") leaking to end users across teacher + parent portals. Translate at the client toast layer.
8. **Permission grants** — the NHQS tenant still has the `behaviour.view`, `parent.view_behaviour`, parent-student links, etc. ungranted. Per user directive this is tracked separately, but it is required before any tenant rollout.

---

## Sign-off

| Leg                   | Reviewer                            | Date       | Pass | Fail | Partial | Notes                                                          |
| --------------------- | ----------------------------------- | ---------- | ---: | ---: | ------: | -------------------------------------------------------------- |
| `/E2E` (admin)        | Playwright agent                    | 2026-04-21 |   17 |   29 |      19 | 5 P0, 14 P1 live findings                                      |
| `/E2E` (teacher)      | Playwright agent                    | 2026-04-21 |    3 |    3 |       2 | WB-123 login broken + permission-grant gap                     |
| `/E2E` (parent)       | Playwright agent                    | 2026-04-21 |    1 |    7 |       2 | Only landing + recognition shipped; all other sub-surfaces 404 |
| `/E2E` (student)      | Playwright agent                    | 2026-04-21 |    2 |    7 |       0 | No student-facing check-in UI anywhere (S-1 confirmed)         |
| `/e2e-integration`    | _Deferred — Jest/supertest harness_ |            |      |      |         |                                                                |
| `/e2e-worker-test`    | _Deferred — Jest/supertest harness_ |            |      |      |         |                                                                |
| `/e2e-perf`           | _Deferred — k6/Lighthouse_          |            |      |      |         |                                                                |
| `/e2e-security-audit` | _Deferred — consultant + Burp_      |            |      |      |         |                                                                |

**Module IS NOT release-ready.** Minimum fix list before any go-live:

- Resolve the form-submit hydration bug (root cause for multiple symptoms)
- Fix the two `t is not defined` crashes
- Fix the `/new` routing collision on exclusions + break-glass
- Wire the alerts fetcher to the correct API route
- Stop leaking raw permission IDs into toasts
- Either ship or remove the 11 404 routes
- Backfill all permission grants for non-admin roles
