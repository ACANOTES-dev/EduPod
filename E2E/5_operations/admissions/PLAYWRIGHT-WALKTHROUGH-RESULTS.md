# Admissions Module — Playwright Walkthrough Results

**Date:** 2026-04-12
**Tenant under test:** Nurul Huda School (`nhqs.edupod.app`)
**Browser:** Chromium (Playwright MCP) @ 1440×900 desktop + 375×667 mobile + RTL
**Spec pack reference:** `E2E/5_operations/admissions/RELEASE-READINESS.md`
**Format:** chronological log; each entry names the section of the spec it corresponds to, the live outcome, and any console/network anomalies.

Verdict legend: ✅ Pass · ⚠️ Partial · ❌ Fail · 🚫 Blocked-mutating · 🔒 Blocked-infra

---

## Session 1 — Admin/Owner (`owner@nhqs.test`, Yusuf Rahman)

### §3 Global UI Shell — Morph Bar

**Verdict:** ⚠️ Partial.

- Morph bar renders across every admissions page — logo, navigation tabs (Home, People, Learning, Wellbeing, Operations, Inbox, Finance, Reports, Regulatory, Settings), plus Inbox/Notifications/avatar buttons.
- **Deviation from spec §3.1**: the admin spec predicted a **sub-strip** below the morph bar with admissions-specific tabs (Dashboard, Ready-to-Admit, Waiting List, …). **No such sub-strip exists in production.** Admissions sections are reachable only via the hub cards or direct URL. This is a documentation mismatch — the redesign never shipped the admissions sub-strip.
- Back-to-hub navigation uses a "Back to Admissions" button on each queue page instead. Functional but less discoverable.

### §4 Admissions Dashboard — `/en/admissions`

**Verdict:** ✅ Pass (with 1 minor cosmetic bug).

- Page loaded at `2026-04-12T21:40:26Z`. Network: single `GET /api/v1/admissions/dashboard-summary` → 200.
- Zero console errors.
- 5 KPI tiles: **Ready to Admit** 0, **Waiting List** 0, **Conditional Approval** 0, **Approved this month** 5, **Rejected this month** 1. (Spec §4.1.2 listed only 4 cards — actual UI is richer.)
- 8 section tiles below the KPIs: Ready to Admit, Conditional Approval, Waiting List, Approved, Rejected, **Admission Form**, **Overrides Log**, **Settings**.
- The Overrides Log tile summary reads **"1 admin overrides granted"** — real count wired.
- **Cosmetic:** Rejected tile says **"1 applications rejected to date"** (plural "applications" for count 1).

### §5 Ready-to-Admit — `/en/admissions/ready-to-admit`

**Verdict:** ✅ Pass (empty state).

- Page header shows "Ready to Admit (0 waiting)" with empty-state illustration + "Nothing waiting for a decision".
- Network: `GET /api/v1/applications/queues/ready-to-admit` → 200.
- Zero console errors.

### §6 Waiting List — `/en/admissions/waiting-list`

**Verdict:** ✅ Pass (empty state).

- Similar empty state, zero errors.

### §7 Conditional-Approval — `/en/admissions/conditional-approval`

**Verdict:** ✅ Pass (empty state).

- Empty-state rendered, zero errors.

### §8 Approved Archive — `/en/admissions/approved`

**Verdict:** ⚠️ Partial — works but date format inconsistency.

- Table with 5 approved applications: Omar / Aisha / Gamma JuniorApplicant (SGW109-01/02/03 numbering), Beta JuniorApplicant (STU-000211), Test Applicant (STU-000210).
- Columns: Student # · Student · Household · Class · Admitted by · Admitted on · (View).
- All rows show Class = **"Not assigned"** — expected per spec.
- **Date format:** `11-04-2026` (DD-MM-YYYY with dashes). The detail page uses `11/04/2026` (slashes). **Two date formats in the same module.**
- Search box present (not exercised).
- Zero console errors.

### §9 Rejected Archive — `/en/admissions/rejected`

**Verdict:** ✅ Pass.

- 1 row: `APP-000002 · Alpha JuniorApplicant · Alice Parent1 · Test rejection to free seat for auto-promotion verification · Yusuf Rahman · 11-04-2026`.
- Search works (not mutated).
- Same `11-04-2026` date format.

### §10 Admissions Analytics — `/en/admissions/analytics`

**Verdict:** ⚠️ Partial — works but missing spec-required KPI + chart warning.

- 3 KPI cards: **Total applications 6**, **Conversion rate 83.3%**, **Avg. days to decision 0.1**.
- Spec §10.1 expected **4 KPIs** — "Currently in waiting list (N)" KPI is missing.
- "Admissions Funnel" Recharts bar chart with labels "Submitted, Ready to Admit, **ConditionalApproval**, Approved".
- **Cosmetic:** chart label "ConditionalApproval" has no space (should be "Conditional Approval").
- No date-range picker, no form-definition filter, no export CSV, no rejection-reason breakdown chart — all present in spec but absent in UI. Analytics is much simpler than spec predicted.
- **Console warning:** `The width(-1) and height(-1) of chart should be greater than 0` (Recharts complaining about initial container measurement). Non-blocking but flaged.

### §11 Form Preview — `/en/admissions/form-preview`

**Verdict:** ✅ Pass.

- Version header shows "Version 40 · 28 fields".
- Public link surfaced: `https://nhqs.edupod.app/en/apply/nhqs`. "Copy link" + "Download QR code" buttons present (not clicked — skipped to avoid any unintended side effect).
- All 28 fields rendered with labels matching expected field inventory (parent1, parent2, address, emergency, target academic year/year group, student first/middle/last, DOB, gender, national ID, medical notes, has allergies, consents implied).
- "Rebuild form" action button present near the bottom (🚫 not clicked — mutating; UI shape verified only).
- The preview DOES render a "Submit application" label/button within the preview card. Spec §11.9 said Submit should be disabled or warn "Preview only" — **need to confirm** whether this is an actual button (not just a label). Flag for verification.

### §12 Admissions Settings — `/en/admissions/settings`

**Verdict:** ✅ Pass.

- Settings page renders all expected controls: Upfront percentage (%), Payment window (days), Cash payment toggle + deadline, Bank transfer toggle + IBAN, Max application horizon (years), Require approval toggle, Override approval role dropdown ("School Principal" selected), Stripe configuration with "Manage" CTA, "Save changes" button.
- Richer than spec §12 predicted (has cash-payment deadline + IBAN + max-horizon which the spec didn't enumerate).
- 🚫 Not mutated.

### §13–§17 Application Detail (approved) — `/en/admissions/35f30e73-739b-48a1-9e67-a6fb01ded9f3`

Target: Test Applicant / APP-000001 (approved).

#### §13 Header & Meta Strip

**Verdict:** ⚠️ Partial.

- Header: `Test Applicant`, `APP-000001` (monospace), status chip "Approved".
- Meta strip: Submitted 11/04/2026, Apply date 11/04/2026, Target year group **Kindergarten**, Academic year **2025-2026**, Days in state 1.
- "View student" link leads to `/en/students/6bb1493c-...` — correct.
- Capacity panel: Total 50, Enrolled 1, Cond. holds 0, Available 49 — looks correct.

#### §14 Application Tab (default active)

**Verdict:** ❌ Fail (partial data rendering).

- Form renders all applicant fields disabled correctly.
- **BUG:** two combobox fields come through empty: `Target Academic Year*` and `Target Year Group*` — even though the meta strip at top shows these values ("Kindergarten" / "2025-2026"). Country combobox shows "United Arab Emirates", Gender "Male", Relationship "Father", all correctly. So the bug is isolated to these two target-scope fields.

#### §15 Timeline Tab

**Verdict:** ❌ Fail (three distinct bugs).

4 events visible, newest-first:

1. Submitted — 11/04/2026, 12:57:19.
2. **Admin note** — "Moved to Conditional Approval. Seat held. Payment deadline: **2026-04-18T12:13:50.094Z**." — **raw ISO timestamp leaks into UI copy.** Unformatted.
3. **Admin note** — "Application approved via cash." 11/04/2026, 13:14:27 · Yusuf Rahman.
4. **Admin note** — "Cash payment recorded: **€5000.00**." — **wrong currency symbol** (tenant is AED, shown as EUR) + no thousands separator.

Additional bug: **every event type uses the generic label "Admin note"** instead of distinct labels per spec §15.3-§15.10 (Auto-routed, Moved to Conditional Approval, Cash payment recorded). This prevents machine-parseable audit-by-action.

#### §16 Notes Tab

**Verdict:** ⚠️ Partial.

- Same 3 system-generated notes visible as free text, each with author `Yusuf Rahman` (no "System" badge).
- **No `is_internal` chip visible on any note** — spec §16.1 expected a green "Internal" or blue "Parent-visible" chip. UI has no visual differentiation.
- "Add note" button is the only composer control visible — textarea + is_internal toggle not rendered before button is clicked (acceptable pattern, just flagging it differs from spec).
- Payment-deadline ISO leak repeats here inside the auto-generated note body.
- 🚫 Composer not exercised (mutating).

#### §17 Payment Tab

**Verdict:** ❌ Fail (currency inconsistency + event-log gap).

- Expected payment section: **Amount 5000.00 AED**, Deadline —, Stripe checkout session —, Current status **approved**.
- **BUG:** Timeline tab showed `€5000.00`, Payment tab shows `5000.00 AED`. Two different currency renderings for the same amount in the same application. Timeline uses the wrong symbol.
- Amount format `5000.00` has no thousands separator.
- Status renders in lowercase ("approved") — inconsistent with header chip "Approved".
- **"Payment events — No payment events recorded"** — the cash payment that materialised this approved application did not create an `admissions_payment_events` ledger row. The table is Stripe-only by design, but the "Payment events" panel title is misleading for non-Stripe paths. Either rename the panel or write a cash-source event for audit symmetry.

### §17.4 Regenerate Payment Link

🚫 Not exercised — button only exists for conditional_approval state, and there are no conditional_approval applications seeded.

### §18–§21 Detail Actions per state

- §18 (ready_to_admit): 🚫 **not exercised** — no ready_to_admit applications seeded.
- §19 (conditional_approval): 🚫 **not exercised** — no conditional_approval applications seeded.
- §20 (waiting_list): 🚫 **not exercised** — empty queue.
- §21 (approved/terminal): ✅ verified on APP-000001 — detail page correctly shows no mutating CTAs.

### §22–§26 Modals (Reject, Force-Approve, Cash, Bank, Manual-Promote)

🚫 **Not exercised** — require pre-seeded applications in specific states, which the tenant does not have. Modal shape verification not performed. Recommendation: seed a fresh cohort in the staging tenant for a modal-level pass.

### §27 Queue Components (ApplicationRow, CapacityChip, QueueHeader)

- ✅ **CapacityChip**: verified on detail page's "Target year group capacity" panel (Total 50 / Enrolled 1 / Cond. holds 0 / Available 49) — green-ish tone appropriate for low utilisation.
- ⚠️ **ApplicationRow**: only exercised on the Approved archive. Kebab menu not visible on approved rows (expected — terminal state). Row click navigates to detail correctly.
- ⚠️ **QueueHeader**: queue pages have a simple H1 + "(N waiting)" counter rather than the sticky group-header-per-year-group pattern the spec §27.3 predicted. All approved rows are one flat table with no year-group grouping. Deviation from spec.

### §28 State Machine

Not live-exercised end-to-end. Data invariants verified from seed data: approved terminal states do not offer mutating UIs (§21 verified).

### §31 Arabic / RTL — `/ar/admissions`

**Verdict:** ✅ Pass.

- `<html dir="rtl" lang="ar">` applied.
- H1 = "القبول". Hub tiles fully translated. KPI numerals remain Western (5, 1, 0).
- Zero console errors at the hub (not exercised on every sub-page).

### §32 Console & Network Health

- Hub page: 0 console errors/warnings. Network: 1× dashboard-summary, 1× branding, 1× notifications/unread-count, 1× inbox/state, 1× auth/me, 1× privacy-notices/current — all 200.
- Analytics page: 1 Recharts warning about `width(-1) height(-1)` container measurement.
- Detail page: 0 console errors on the approved application.
- Settings page: 0 errors.
- Overall admin-side logs clean.

### §33 Permission Matrix (admin rows)

- `school_owner`: verified — can see every admissions page, including Settings and Overrides Log.
- Other roles: covered via the parent negative probe below.

### Mobile (375×667) — hub

**Verdict:** ✅ Pass.

- `document.scrollWidth` = `clientWidth` = 375. **No horizontal overflow.**
- KPI tiles and section tiles stack vertically; all interactive targets remain usable.
- The top morph bar collapses gracefully at 375px.

---

## Session 2 — Parent (`parent@nhqs.test`, Zainab Ali)

### Pre-existing issue before admissions pages

Parent dashboard at `/en/dashboard/parent` fires **13 console errors on load**, including `404 /api/v1/parent/finances`, `403 /api/v1/branding`, `403 /api/v1/parent/engagement/pending-forms`, `403 /api/v1/parent/homework/today/overdue`, `403 /api/v1/parent/engagement/events`. Most are outside admissions scope (captured in the finance pack already) but they surround and obscure any admissions-specific errors.

Interesting secondary finding: `/en/dashboard` (without `/parent` suffix) renders a different dashboard template showing **"Term 2 Fee Invoice €450 due in 3 days"** — tenant is AED but the fee is displayed in EUR. Same currency bug as the admin Timeline tab. Recorded because it may share root cause.

### §3 Parent Apply Landing — `/en/apply`

**Verdict:** ❌ Fail — page crashes.

- Navigation to `/en/apply` renders **"Something went wrong — An unexpected error occurred. The error has been reported."**
- Console: `TypeError: Cannot read properties of undefined (reading 'length')` at `/_next/static/chunks/app/[locale]/(public)/apply/page-*.js`.
- This is the tenant-picker landing page — anyone hitting `edupod.app/en/apply` lands on an error page instead of a tenant selector.
- Severity: **P1**. Public applicants who go to the root apply page cannot proceed.

### §4 Tenant Apply Form — `/en/apply/nhqs`

**Verdict:** ✅ Pass.

- Unauthenticated navigation works. No morph bar (public shell). H1 "ADMISSION APPLICATION" / "Nurul Huda School".
- Mode picker renders both options: "New family applying for the first time" + "Adding a child to an existing family".
- 🚫 Full form fill + submit **not exercised** (would leave durable side effects on prod).

### §8 Parent Portal Applications List — `/en/applications`

**Verdict:** ❌ Fail (console error even though UI renders).

- UI renders "No applications yet" empty state for Zainab Ali.
- **Console error** during mount: `[ApplicationsPage] TypeError: Cannot read properties of undefined (reading 'total')` at `/_next/static/chunks/app/[locale]/(school)/applications/page-*.js`.
- This means the parent applications endpoint response does not match the `{ data, meta: { total } }` shape the client expects when there are zero rows. The error is visually swallowed (empty state renders), but the swallow means real regressions here would go undetected. Severity **P2**.
- 403 on `/api/v1/branding` also observed — cross-cutting with other parent pages.

### §9 Parent Portal Detail — `/en/applications/:id`

🚫 **Not exercised** — Zainab has no applications to drill into. Covered only by the code-review section of the spec.

### §3.6 Parent negative probe — direct URL `/en/admissions`

**Verdict:** ✅ Pass (correct negative).

- Logged in as parent, navigating to `/en/admissions` → silent 302 redirect to `/en/dashboard`. Parent shell never exposes the admissions hub or sub-pages.
- No console error for this redirect.
- Parent's morph bar shows only: Home, Learning, Finance, Reports — Admissions is correctly absent.

---

## Session 3 — Teacher + Student negative probes (re-attempted 2026-04-13)

**Context:** the original Playwright attempt on 2026-04-12 was blocked when the MCP browser crashed during a logout. Re-attempted the next day via direct HTTP (curl + JWT) against production — this is the authoritative security boundary; the browser-side redirect behaviour is the UX layer on top.

### 3.1 Teacher — `Sarah.daly@nhqs.test` (role: `teacher`)

**Login:** `POST /api/v1/auth/login` → 200 with access_token. JWT payload `{ sub: 2638ae0a-c39f-49e0-bcad-b2a3837cbe0b, tenant_id: 3ba9b02c-..., type: access }` (no role claim in JWT — roles resolved server-side per membership).

**Probe matrix** — every admissions endpoint the admin/parent specs enumerate:

| #   | Method | Endpoint                                           | Expected     | Actual                                        | Verdict |
| --- | ------ | -------------------------------------------------- | ------------ | --------------------------------------------- | ------- |
| 1   | GET    | `/v1/admissions/dashboard-summary`                 | 403          | 403 `PERMISSION_DENIED` / `admissions.view`   | ✅      |
| 2   | GET    | `/v1/applications`                                 | 403          | 403 `PERMISSION_DENIED` / `admissions.view`   | ✅      |
| 3   | GET    | `/v1/applications/queues/ready-to-admit`           | 403          | 403 `PERMISSION_DENIED` / `admissions.view`   | ✅      |
| 4   | GET    | `/v1/applications/queues/waiting-list`             | 403          | 403 `PERMISSION_DENIED` / `admissions.view`   | ✅      |
| 5   | GET    | `/v1/applications/queues/conditional-approval`     | 403          | 403 `PERMISSION_DENIED` / `admissions.view`   | ✅      |
| 6   | GET    | `/v1/applications/queues/approved`                 | 403          | 403 `PERMISSION_DENIED` / `admissions.view`   | ✅      |
| 7   | GET    | `/v1/applications/queues/rejected`                 | 403          | 403 `PERMISSION_DENIED` / `admissions.view`   | ✅      |
| 8   | GET    | `/v1/applications/analytics`                       | 403          | 403 `PERMISSION_DENIED` / `admissions.view`   | ✅      |
| 9   | GET    | `/v1/applications/35f30e73-...` (real approved id) | 403 (or 404) | 403 `PERMISSION_DENIED` / `admissions.view`   | ✅      |
| 10  | GET    | `/v1/admission-forms/system`                       | 403          | 403 `PERMISSION_DENIED` / `admissions.view`   | ✅      |
| 11  | GET    | `/v1/admission-overrides`                          | 403          | 403 `PERMISSION_DENIED` / `admissions.manage` | ✅      |
| 12  | POST   | `/v1/applications/35f30e73-.../review`             | 403          | 403 `PERMISSION_DENIED` / `admissions.manage` | ✅      |
| 13  | POST   | `/v1/admission-forms/system/rebuild`               | 403          | 403 `PERMISSION_DENIED` / `admissions.manage` | ✅      |

**Verdict:** ✅ **Pass** — 13/13 admissions endpoints correctly deny the teacher role with structured `{ error: { code, message } }` responses.

### 3.2 Student — `adam.moore@nhqs.test` (role: `student`)

**Login:** `POST /api/v1/auth/login` → 200 with access_token for `adam.moore@nhqs.test`.

**Probe matrix** (same 13 endpoints as teacher):

- Rows 1–13: **all returned 403 `PERMISSION_DENIED`** with correct permission code (`admissions.view` for reads, `admissions.manage` for the two mutating POSTs and `/admission-overrides`).

**Extra probe (parent portal endpoint):**

| #   | Method | Endpoint                  | Expected (per spec §33.25) | Actual                                         | Verdict    |
| --- | ------ | ------------------------- | -------------------------- | ---------------------------------------------- | ---------- |
| 14  | GET    | `/v1/parent/applications` | 200 empty for non-parent   | **200** with `{ data: [] }` — NO `meta` object | ⚠️ Partial |

**Verdict:** ✅ Admissions endpoints all 403. ⚠️ `/v1/parent/applications` is AuthGuard-only (not permission-gated) so a student authenticates past the guard and receives an empty-filtered list. This is the correct **row filter** behaviour (ownership-scoped). **However, the response shape `{ data: [] }` omits the `meta` object** — confirming the root cause of ADM-016 (frontend parent portal reads `res.meta.total` on undefined).

### 3.3 Unauthenticated probes

| #   | Method | Endpoint                           | Actual                                                          | Verdict |
| --- | ------ | ---------------------------------- | --------------------------------------------------------------- | ------- |
| 1   | GET    | `/v1/admissions/dashboard-summary` | 401 `UNAUTHORIZED` / "Missing authentication token"             | ✅      |
| 2   | GET    | `/v1/applications`                 | 401 `UNAUTHORIZED`                                              | ✅      |
| 3   | GET    | `/v1/admission-overrides`          | 401 `UNAUTHORIZED`                                              | ✅      |
| 4   | GET    | `/v1/public/admissions/form`       | 200 with form definition (24 fields) — public, no auth required | ✅      |

**Verdict:** ✅ All unauth negative assertions pass; the public form endpoint correctly served without a token.

### 3.4 Page-level redirect behaviour (HTTP HEAD)

`GET /en/admissions` with teacher or student JWT in `Authorization` header → **HTTP 200 with zero redirects** (Next.js ships the page shell regardless of role). The redirect to `/en/dashboard` that was observed during the parent session happens **client-side** after the admissions page's `apiClient` call returns 403 and the page router `.push()` fires.

**Implication:** the true security gate is the API layer — verified above as 403 across all admissions endpoints for teacher and student. The client-side redirect is a UX nicety; an attacker with a forged-but-unsigned JWT would still hit a 200 page shell but every API call would fail with 401/403, rendering no data. Defensible design.

### Session 3 summary

**Verdict:** ✅ Pass — teacher and student are correctly locked out of admissions at the API layer.

**New finding surfaced during the API probes:**

- **ADM-016 root cause confirmed.** `GET /v1/parent/applications` returns `{ data: [] }` with no `meta` object for any non-parent caller (and likely the same for parents with zero rows — the prior parent walkthrough saw the same TypeError). See BUG-LOG `ADM-016` (status updated to "verified repro").

---

## Summary — severity tally from live walkthrough

| Severity | Count | Notes                                                                                                                                                        |
| -------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P0       | 0     | No data-loss or unusable-feature issues found in the live walkthrough.                                                                                       |
| P1       | 4     | Overrides Log broken CTA, Public `/en/apply` page crash, Timeline wrong currency, Application-tab empty target-year combos.                                  |
| P2       | 6     | Two date formats, parent applications console error, "1 applications" grammar, currency `€450` on parent dashboard, Recharts warning, raw ISO in notes copy. |
| P3       | 3     | Chart label "ConditionalApproval" spacing, lowercase "approved" status, missing analytics KPI.                                                               |

(Full context + reproduction steps live in `BUG-LOG.md` alongside the 62 code-review findings from the spec pack.)

---

## Recommended immediate actions

1. **Fix `/en/admissions/overrides`** — the hub's "Overrides Log" tile sends admins to a route that falls through to `[id]/page.tsx` and returns "Application not found". Either add a dedicated `/admissions/overrides/page.tsx` or rewrite the tile's navigation to `/admissions/overrides-log` and ensure the corresponding page exists. (See BUG-LOG `ADM-001`.)
2. **Fix the Timeline tab currency + ISO-timestamp bug** — cash/stripe amounts are rendered with `€` regardless of tenant currency, and the conditional_approval transition note contains a raw `2026-04-18T12:13:50.094Z` instead of a formatted date. Shared root cause for the "€450 on parent dashboard" finding — likely a single currency-formatting util missing the tenant code, plus a bare `.toString()` on a Date. (See `ADM-003`, `ADM-004`.)
3. **Fix `/en/apply` landing page crash** — `TypeError: Cannot read properties of undefined (reading 'length')`. Likely the tenant-list fetch returns a 4xx or a shape mismatch; page template then reads `.length` on undefined. Priority because this is the public entry point for new applicants. (See `ADM-002`.)

---

## Coverage note

Every spec in the pack was **referenced** in this walkthrough:

- Admin spec: §3, §4, §5, §6, §7, §8, §9, §10, §11, §12, §13–17 (approved), §21, §27, §31, §32, §33, mobile — all exercised live.
- Admin spec §18–§20 + §22–§26: blocked by seed data (no ready_to_admit / conditional_approval / waiting_list rows in the live tenant).
- Parent spec: §3, §4, §8, parent negative probe — exercised in browser. Teacher + student negatives re-attempted and confirmed via direct API probes on 2026-04-13 (Session 3 above).
- Parent spec: §5 (students repeater), §6 (submit), §7 (payment callbacks), §9 (detail) — blocked by "don't-mutate-prod" + no existing parent application.
- Security spec §3 (permission matrix): teacher + student rows (3.1-3.13 plus 3.25) now verified live via curl — 13/13 admissions endpoints 403 with correct codes; `/v1/parent/applications` returns 200 empty for non-parent with a malformed payload shape (surfaces ADM-016 root cause).
- Integration spec, worker spec, perf spec, security spec (remainder): by design not live-walkable — code-review findings from those specs are carried forward into BUG-LOG.md with `[C]` tags.

End of walkthrough log.
