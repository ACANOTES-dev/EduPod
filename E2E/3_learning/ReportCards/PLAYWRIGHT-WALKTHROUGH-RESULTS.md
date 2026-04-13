# Report Cards — Playwright Walkthrough Results

**Executed:** 2026-04-13
**Target:** `https://nhqs.edupod.app` (Nurul Huda School production tenant)
**Accounts exercised:** Yusuf Rahman (owner@nhqs.test, School Owner), Sarah Daly (sarah.daly@nhqs.test, Teacher), Zainab Ali (parent@nhqs.test, Parent), Adam Moore (adam.moore@nhqs.test, Student — login failed)
**Playwright mode:** snapshot-based (no screenshots). Safety rule: no mutating actions on production — all create/update/delete/publish flows verified up to modal/form shape only.
**Pack source of truth:** `E2E/3_learning/ReportCards/{admin,teacher,parent,student}_view/report-cards-e2e-spec.md` + `{integration,worker,perf,security}/*.md` + `RELEASE-READINESS.md`.

---

## Summary verdict

| Spec        | Verdict           | Rationale                                                                                                                                                                                                                                               |
| ----------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin UI    | **Partial**       | Every documented route loads, PDF download works, settings/library/wizard all reachable. But analytics is missing sections §44 (class comparison) + §45 (per-class progress), and dashboard/analytics completion-rate figures disagree with each other. |
| Teacher UI  | **Partial**       | Dashboard reduces to 2 tiles ✓, settings enforces read-only ✓, library scope-filters destructive actions ✓. BUT teacher can access `/report-cards/analytics` (admin-only) and dashboard classes grid shows non-taught classes (6A/6B for Sarah).        |
| Parent UI   | **Partial**       | Admin URL denials work ✓. BUT "View Grades" button on parent dashboard links to 404 (`/learning/reports`), dashboard has no report-cards surface. Authenticated probes (acknowledgment IDOR, list API) not testable — JWT is in-memory only.            |
| Student UI  | **Blocked**       | Student account login fails with documented password. No `/dashboard/student` route exists regardless. Anonymous probes confirm 401 on all endpoints.                                                                                                   |
| Integration | N/A               | Not UI-runnable — mapped to bug log via cross-reference.                                                                                                                                                                                                |
| Worker      | N/A               | Not UI-runnable — mapped to bug log via cross-reference.                                                                                                                                                                                                |
| Perf        | **Informational** | No endpoint budgets measured (belongs to k6). Observed dashboard fetches twice (waterfall); Analytics makes only 1 call (spec §42 expected 2).                                                                                                          |
| Security    | **Informational** | One pre-populated P1 finding **disproved** live (rate limit exists on `/verify`). Other P0/P1 findings not UI-testable.                                                                                                                                 |

Severity tally of new live-verified findings: **P1 = 4, P2 = 8, P3 = 1** (15 total). Plus **1 hypothesis refuted** (F-003 rate limit).

---

## Immediate-action shortlist (top 3 for the user)

1. **[L-001 P1] Teacher can view tenant-wide report-card analytics.** Sarah Daly navigates directly to `/en/report-cards/analytics` and gets Total=50 / Published=26 / Draft=24 / etc. Spec says admin-only. Page should 403 or redirect.
2. **[L-002 P1] Parent dashboard CTA "View Grades" links to a 404.** Hard-coded href `/learning/reports`. Parents who click their primary grades CTA hit a Next.js "404 Page not found".
3. **[L-004 P1] Analytics page is missing the class-comparison chart + per-class progress sections** that the admin spec §44-§45 require. Page renders only the 6 summary cards. Also "Completion Rate 0.0%" contradicts Dashboard's "Completion 12.9%".

---

## 1) Admin walkthrough (owner@nhqs.test, Yusuf Rahman) — logged onto `/en/dashboard`

### 1.1 Dashboard — `/en/report-cards`

- Loaded clean. 4 tiles present: Generate report cards / Write comments / Library (50 documents) / Teacher requests (No pending) ✓
- Live generation run panel: "No runs in progress" ✓
- Analytics snapshot panel: Total 50 / Published 26 / **Completion 12.9%** / Overall comments 25/25 / Subject comments 1/1
- Classes grid: 7 year groups × 13 classes (K1A, 1A, 1B, 2A, 2B, 3A, 3B, 4A, 4B, 5A, 5B, 6A, 6B) ✓
- Network: `GET /analytics/dashboard` called **twice** (once without period, once with explicit period id) — minor double-fetch
- Console: 0 errors, 0 warnings ✓
- `/en/report-cards/analytics/class-comparison` was NOT called (per spec §42 it should be)
- **Pass with observations** → see L-005, perf-waterfall

### 1.2 Class matrix — `/en/report-cards/{classId}` (2A, classId `76ce55f7-…`)

- 25 students × 7 subjects + Overall column rendered ✓
- Grade/Score toggle, period filter present ✓
- **Top 1/2/3 badges rendered on Roisin Dunne, Isla Evans, Adam Moore** — even though tenant setting "Show top-3 rank badge on the PDF" is OFF. Confirms admin spec observation 12.4 → **L-006 P2**
- Typing `/en/report-cards/2a` (non-UUID slug) surfaces raw backend error as a toast: "Validation failed (uuid is expected)" → **L-007 P2**
- **Pass with observations**

### 1.3 Settings — `/en/report-cards/settings`

- All documented sections render: Display defaults, Comment gate, Personal info fields (Identity/Dates/Academic/Media), Default template ("Editorial Academic (EN)"), Grade thresholds link, Principal details + signature upload, Save changes ✓
- Top-rank badge switch = OFF (precondition for L-006) ✓
- **Pass**. Mutating save not exercised per safety rule.

### 1.4 Generation wizard — `/en/report-cards/generate`

- Entry gated; as admin, page loads. Safety: did not submit to avoid a real generation run on prod.
- 🚫 Blocked (mutating) for step-submit verification.

### 1.5 Library — `/en/report-cards/library`

- 2 runs visible (Apr 10 6:31 PM and 1:27 PM, each "1 class · 25 documents · Editorial Academic") ✓
- By run / By year group / By class toggles present ✓
- Expand run → expand class → 25 student rows (Student / Status / Locale / Generated / Actions)
- Actions: Download ✓, Unpublish ✓, Delete (disabled when Published) with tooltip "Published report cards can't be deleted. Unpublish first." ✓
- **PDF download tested** — `Dunne Sinead - Report Card - S1 (EN).pdf` downloaded correctly with surname-first, period code, locale suffix. Good UX. ✓
- One student listed as `FGFHTRHYRT FGFHTRHYRT STU-000002` — obvious tenant test data, not a code bug
- 🚫 Blocked (mutating) for delete/unpublish/bulk.
- **Pass**

### 1.6 Analytics — `/en/report-cards/analytics`

- Page renders 6 summary cards: Total 50 / Published 26 / **Draft 24** / **Completion Rate 0.0%** / Overall comments 25/25 / Subject comments 1/1
- **Missing sections:** class comparison chart (admin spec §44) + per-class generation progress (§45). Page has ONLY the summary cards.
- Network: `GET /analytics/dashboard` fires, `GET /analytics/class-comparison` does NOT. → **L-004 P1**
- **Completion-rate disagreement:** Dashboard said 12.9%; this page says 0.0%; simple math (26/50) = 52.0%. Neither matches; one is outright wrong. → **L-005 P2**
- **Partial** (page loads, but spec-documented sections are absent and numbers are inconsistent)

### 1.7 Teacher requests — `/en/report-cards/requests`

- Page loads; Pending review / All tabs present ✓
- Empty state rendered as admin
- Detail page not exercised (requires a request to exist in Pending state — none in this tenant)
- **Pass**

### 1.8 Report comments landing — `/en/report-comments`

- Window banner shows: "Comment window open for S1 — closes 17 Apr 2026, 19:16. Principal's note: Opened in response to teacher request #d25234ef-98bc-4c0d-8b81-144149d84a55"
- **Raw UUID exposed in note to all viewers.** Polish / PII concern → **L-008 P2**
- 13 "Overall comments / {class} / No comments yet" cards (every class says No comments yet despite analytics reporting 25/25 overall comments)
- Subject cards grouped by year group × subject ✓
- **Pass with observations**

### 1.9 Console + network health across admin walk

- 0 console errors on dashboard + settings + library; 2 errors on `/report-cards/2a` (the UUID-validation probe) expected
- All `/api/v1/report-cards*` requests 200 or 404 (404 only on the intentional slug-probe)

### 1.10 Retired redirect stubs

- Not exercised (no blocker; spec says both `/approvals` and `/bulk` 302 to dashboard — spot-check deferred)

---

## 2) Teacher walkthrough (sarah.daly@nhqs.test, Sarah Daly) — logged onto `/en/dashboard/teacher`

### 2.1 Dashboard — `/en/report-cards`

- 2 tiles: Write comments + Library (50 documents) ✓ (matches teacher spec "2-tile view")
- **BUT classes-by-year-group grid shows ALL 13 classes**, including 6th Class (6A 21 students, 6B 12 students) — which Sarah does NOT teach.
- Sarah's competencies: Business (1st), English (2nd), History (3rd), Math (4th), Biology (5th), Arabic (KG/Junior/Senior infants). She should NOT see 6th class. → **L-003 P1** (UI scope leak)
- Library count "50 documents" — same as admin. Unclear whether this is scope-correct (matches admin because both of Sarah's cards fall into the 1A scope) or scope-leaked. Worth confirming server-side. → **L-011 P3**
- Morph bar sub-strip shows: Assessment / Homework / Attendance / Report Cards — no Classes/Curriculum ✓
- Top nav shows Home / People / Learning / Wellbeing / Operations / Inbox / Reports — no Finance/Regulatory/Settings ✓
- **Partial** (scope leak in grid)

### 2.2 Class matrix direct URL to non-taught 6A

- `/en/report-cards/d79bd5f6-4382-4be9-8820-09357a59d4cd` (6A)
- Backend correctly returns **403** on `GET /v1/report-cards/classes/.../matrix?academic_period_id=all` ✓
- UI shows "Failed to load the matrix." — **generic error, not permission-specific** → **L-009 P2**
- **Pass** (backend protects; UX could be clearer)

### 2.3 Library — `/en/report-cards/library`

- Shows 2 admin-generated runs (1A) — correctly scoped to Sarah's Business-on-1A access ✓
- **Destructive "Delete entire run" button NOT rendered** for teacher ✓ (admin spec said hide)
- **Pass**

### 2.4 Settings — `/en/report-cards/settings`

- Loads with banner **"You have read-only access to these settings."** ✓
- Save Changes button NOT present ✓
- **Pass** (matches spec §14 read-only expectation)

### 2.5 Generation wizard — `/en/report-cards/generate`

- Redirects to `/en/report-cards` ✓ (admin-only denial)
- **Pass**

### 2.6 Analytics — `/en/report-cards/analytics` ← **FINDING**

- **Page loads fully as teacher.** Shows Total=50 / Published=26 / Draft=24 / Completion 0.0% / Overall 25/25 / Subject 1/1 — same tenant-wide numbers as admin.
- Teacher spec §3 explicitly says analytics is admin-only. Backend `/api/v1/report-cards/analytics/dashboard` returns 200 for teacher role → **L-001 P1** (scope break)

### 2.7 Requests — `/en/report-cards/requests`

- Loads; Sarah sees 3 historical Approved requests (by other users) + "New request" button ✓
- Approve/Reject buttons not visible to her (just a "Review" link) ✓ (matches teacher spec §25)
- **Pass**

### 2.8 Report comments landing — `/en/report-comments`

- Correctly scoped: 1 Overall card (2A 25/25 finalised, Sarah's homeroom) + Subject cards scoped to competencies only (Arabic K1A, Business 1A/1B, English 2A/2B, History 3A/3B, Math 4A/4B, Biology 5A/5B)
- **No 6th Class cards** ✓
- **Pass** — so the landing page IS scoped properly, while the dashboard grid (§2.1) is NOT. Inconsistency.

### 2.9 Teacher pages NOT exercised (out of safety scope)

- Overall comment editor — would need to write/save text
- Subject comment editor — same; also AI draft flow (non-mutating but costs AI quota)
- Request creation form (mutating)

---

## 3) Parent walkthrough (parent@nhqs.test, Zainab Ali) — logged onto `/en/dashboard/parent`

### 3.1 Parent dashboard

- "Good morning, Zainab" header ✓
- Cards: Privacy & Consent / Your Students (**No results found**) / Outstanding Invoices / Recent Announcements
- **"Your Students: No results found"** — parent account is NOT linked to any student in production. Not a code bug; tenant-state setup issue.
- **NO "Recent Report Cards" card** → **confirms GAP-PARENT-REPORTCARDS-001** (parent spec observation)

### 3.2 Admin URL denials as parent

- `/en/report-cards` → redirects to `/dashboard` ✓
- `/en/report-cards/analytics` → redirects to `/dashboard` ✓
- Parent morph bar shows only: Home / Learning / Reports ✓

### 3.3 Parent dashboard primary CTA — `/en/dashboard` "View Grades" button

- Button `link "View Grades" → /learning/reports`
- Navigating to `/en/learning/reports` returns **404 Page not found** → **L-002 P1**

### 3.4 Authenticated API probes as parent (via `fetch()` with `credentials: include`)

- All endpoints (`/report-cards/library`, `/report-cards`, `/report-cards/:id`, `/report-cards/:id/acknowledge` with random parent_id, `/report-cards/library`, `/report-comment-windows/*`) return **401 "Missing authentication token"** — because JWT is in-memory only and isn't sent as a cookie
- Cannot reproduce acknowledgment IDOR (F-001) live from parent context — left as `[C]` code-review only
- 🚫 **Acknowledgment IDOR**: unverified live; **remains open** pending server-side confirmation

### 3.5 Public `/verify/:token` probed from parent window

- Anonymous (credentials: omit) `GET /api/v1/verify/{64 chars}` → **404** with body `{"error":{"code":"TOKEN_NOT_FOUND","message":"Verification token not found. This report card may not be authentic."}}` ✓ (clean error, non-leaking)
- Rate limit headers present: `x-ratelimit-limit: 100`, `x-ratelimit-remaining: 99` after first hit, `74` after 26 hits → **REFUTES RELEASE-READINESS F-003 / GAP-PARENT-VERIFY-002** (rate limit exists)
- **Cache-Control header: not set** on 404 responses → perf observation (CDN caching claim unverified)

---

## 4) Student walkthrough (adam.moore@nhqs.test, Adam Moore) — **BLOCKED**

### 4.1 Login failure

- Form submit with `adam.moore@nhqs.test` / `Password123!` returns **"Invalid email or password"**
- Memory references this account as created via direct DB insert on 2026-04-11; possibly the account was removed, password rotated, or email case matters
- → **L-014 P3** (test data hygiene)

### 4.2 Anonymous attack surface probed

- 11 endpoints tested unauthenticated (`fetch` with `credentials: omit`):
  - `/api/v1/report-cards` → 401
  - `/api/v1/report-cards/library` → 401
  - `/api/v1/report-cards/library/grouped` → 401
  - `/api/v1/report-cards/analytics/dashboard` → 401
  - `/api/v1/report-cards/classes/76ce55f7-.../matrix` → 401
  - `/api/v1/report-card-tenant-settings` → 401
  - `/api/v1/report-card-overall-comments` → 401
  - `/api/v1/report-card-subject-comments` → 401
  - `/api/v1/report-card-teacher-requests` → 401
  - `/api/v1/report-comment-windows/active` → 401
  - `/api/v1/report-cards/generation-runs` → 401
- **All 11 correctly 401.** No anonymous leak. ✓

### 4.3 Student spec §2-§3 confirmation

- No `/dashboard/student` route exists (per student-spec code-review finding). Login-based verification deferred.

---

## 5) Critical probes (§5 in task brief)

| Probe                                  | Result                                                                    | Impact                                                          |
| -------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Public `/verify/:token` anonymous      | 404 without credentials ✓ (public, non-leaking)                           | Design-by-spec ✓                                                |
| Public `/verify/:token` rate limit     | 100 req limit, `x-ratelimit-remaining` header visible, counter decrements | **DISPROVES F-003 P1** — rate limit exists. Demote to Resolved. |
| Public `/verify/:token` Cache-Control  | not set on 404                                                            | Perf gap (CDN caching claim unverified)                         |
| Acknowledgment IDOR (F-001)            | Not reproducible from browser (JWT in-memory only)                        | Remains `[C]` unverified                                        |
| Anonymous full-surface probe           | 11/11 return 401                                                          | No anon leak ✓                                                  |
| Slug-not-UUID matrix URL               | 400 with raw "Validation failed (uuid is expected)" toast                 | L-007 polish                                                    |
| Non-taught class direct URL as teacher | 403 from backend, generic "Failed to load the matrix" UI                  | L-009 polish                                                    |

---

## 6) Arabic + mobile pass

### 6.1 `/ar/report-cards` (admin)

- `document.dir = rtl`, `document.lang = ar` ✓
- Dashboard header "بطاقات التقارير", tiles translated ("إصدار بطاقات التقارير", "كتابة التعليقات", "المكتبة", "طلبات المعلمين"), analytics card labels translated ("الإجمالي", "منشور", "الإنجاز", "التعليقات العامة")
- **Year-group names NOT translated** — "Kindergarten", "1st class", "2nd class", ... render in English while surrounding Arabic text flows right-to-left. Student-count uses proper Arabic plural ("فصلان", "طالبًا") ✓
- Class codes (K1A, 1A, 2A) stay in Latin (expected) ✓
- Western numerals (0-9) used per CLAUDE.md ✓
- → **L-010 P3** (year-group translation gap)

### 6.2 Mobile viewport 375×667 on `/en/report-cards` (admin)

- `window.innerWidth=375`, `scrollWidth=375`, overflowX `false` ✓
- Main element: `scrollWidth === clientWidth` ✓ (no horizontal overflow)
- All dashboard sections render stacked (tiles, live-run, analytics snapshot with `TOTAL / PUBLISHED / COMPLETION / OVERALL COMMENTS / SUBJECT COMMENTS` labels in uppercase, classes grid)
- **Pass** — layout is mobile-safe at 375px

---

## 7) Network + console health

- `/en/report-cards` dashboard: 0 console errors, 0 warnings, 5 API calls all 200
- Teacher `/en/report-cards/analytics` (the scope break): 200 from `/analytics/dashboard` → data populated with tenant-wide numbers
- Library: all API calls 200. `GET /library/grouped` is the expansion endpoint.
- Analytics page: only 1 API call (`/analytics/dashboard`). `/analytics/class-comparison` not fired → confirms missing chart (L-004)
- Logo image: occasionally falls back to text "N" instead of the Nurul Huda logo on re-renders → **L-013 P3** (tenant-branding flash/fallback)
- `/en/logout` URL → 404 page (logout only via avatar menu) → **L-012 P3**

---

## 8) Findings registered (unique IDs in BUG-LOG.md)

| ID      | Severity | Short title                                                                   | Origin |
| ------- | -------- | ----------------------------------------------------------------------------- | ------ |
| RC-L001 | P1       | Teacher can access `/report-cards/analytics` with full tenant numbers         | Live   |
| RC-L002 | P1       | Parent dashboard "View Grades" → `/learning/reports` returns 404              | Live   |
| RC-L003 | P1       | Teacher classes-grid shows non-taught year groups (UI scope leak)             | Live   |
| RC-L004 | P1       | Analytics page missing class-comparison chart + per-class progress            | Live   |
| RC-L005 | P2       | Dashboard 12.9% vs Analytics 0.0% "Completion" disagreement                   | Live   |
| RC-L006 | P2       | Top 1/2/3 rank badge renders despite tenant setting OFF                       | Live   |
| RC-L007 | P2       | Non-UUID class slug surfaces "Validation failed (uuid is expected)" raw toast | Live   |
| RC-L008 | P2       | Report-comments window banner exposes raw teacher-request UUID                | Live   |
| RC-L009 | P2       | Class matrix 403 surfaces as generic "Failed to load the matrix"              | Live   |
| RC-L010 | P3       | Arabic locale: year-group names not translated                                | Live   |
| RC-L011 | P3       | Teacher library count "50 documents" matches admin — scope unclear            | Live   |
| RC-L012 | P3       | `/en/logout` URL returns 404 page                                             | Live   |
| RC-L013 | P3       | Tenant logo flashes to text "N" fallback on some renders                      | Live   |
| RC-L014 | P3       | Student test account login rejects documented password                        | Live   |
| RC-L015 | P2       | `/verify/:token` 404 responses have no `Cache-Control` header                 | Live   |

Plus carry-overs from pack:

- RC-C001…C0N — code-review hypotheses from RELEASE-READINESS.md that the walkthrough could not reproduce (IDOR, SSTI, SSRF, TTL, RLS-PgBouncer, NullStorageWriter, etc.)

---

## 9) What was NOT covered (scope notes)

- Mutating flows: publish/unpublish/revise/delete/generate/submit-approval/approve/reject/bulk-delete/bundle-delete → 🚫 blocked per safety rule
- Signature upload (file mutation) → blocked
- Comment editor autosave (would persist comment text)
- AI draft invocation (would spend OpenAI quota + leave audit log)
- Teacher request submission (would create a request)
- Student portal: no valid test login; server-side behaviour only testable with a working student session
- Acknowledgment IDOR F-001: requires a JWT in a cookie — authenticated `fetch` is blocked because the app stores JWT in-memory only. This was a known limitation before the walkthrough.

---

## 10) Conclusion

- **15 new live-verified findings** (4× P1, 8× P2, 3× P3) ready for the bug log.
- **1 pre-populated spec finding refuted** live (`F-003` rate limit).
- **RC-L001** (teacher analytics leak) and **RC-L002** (parent "View Grades" 404) are blocking for tenant onboarding.
- Pack format held up: each leg surfaced signal during walkthrough, and no spec claim had to be silently edited.

See `BUG-LOG.md` for actionable remediation direction per finding.
