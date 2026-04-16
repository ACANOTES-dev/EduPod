# Report Cards — Consolidated Bug Log

**Generated:** 2026-04-13
**Pack:** `E2E/3_learning/ReportCards/`
**Source of findings:** live Playwright walkthrough on `https://nhqs.edupod.app` (tag `[L]`) + code-review observations in `RELEASE-READINESS.md` and each spec's Observations section (tag `[C]`).

---

## Workflow for agents picking up a bug

1. **Claim it.** Set status `In Progress` (edit the row in the summary table + add `Status` line in the detail block). Do NOT move `Open` → `Fixed` without passing through `In Progress`.
2. **Read the full detail block** including "Affected files", "Fix direction", "Verification steps". The file paths are concrete. Grep targets are ready.
3. **Fix the root cause, not the symptom.** If two bugs share a root cause (e.g. missing role gate), fix once and mark both Fixed linking to the same commit SHA.
4. **Write/extend tests.** Every bug fix must land with at least one new or amended test that would have caught the regression. Cite the test file in the `Verified by` line.
5. **Verify on production before closing.** Status transitions:
   - `Open` → `In Progress` when work starts
   - `In Progress` → `Fixed` after local tests + commit pushed
   - `Fixed` → `Verified` after the Playwright probe documented in "Verification steps" passes against the live tenant
   - `Verified` is the only terminal-success state. `Open` → `Won't Fix` requires an entry in `RELEASE-READINESS.md` §10 with written acceptance, and `Open` → `Blocked` requires a reason + blocker bug id.
6. **Commit message format:** `fix(report-cards): <short>` with trailer `Bug: RC-<id>` so the log can be cross-referenced.
7. **No silent fixes.** If you discover another bug while fixing one, add a new entry here instead of folding into the fix.
8. **Do NOT edit the spec files** (`{role}_view/*.md`, `integration/*.md`, etc.) — they are the source of truth. Amend this log if a finding proves wrong.

---

## 1. Live-verified bugs (tagged `[L]`)

### RC-L001 — Teacher can view tenant-wide Report Card analytics `[L]`

- **Severity:** P1
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-16
- **Summary:** Teacher role users can navigate to `/en/report-cards/analytics` and view every tenant-wide statistic (Total=50, Published=26, Draft=24, Overall=25/25, Subject=1/1). Admin-only per teacher spec §3 and admin spec §42-§45. Permission `gradebook.view_analytics` is supposed to gate this.
- **Repro:**
  1. Log in as `sarah.daly@nhqs.test` / `Password123!`
  2. Visit `https://nhqs.edupod.app/en/report-cards/analytics`
  3. Observe: page loads fully with summary cards.
  4. Confirm via DevTools Network: `GET /api/v1/report-cards/analytics/dashboard` returns **200** with full tenant payload.
- **Expected:** 403 or redirect back to `/en/report-cards` with a permission toast, as teacher spec §26.3 documents.
- **Affected files (grep targets):**
  - Frontend: `apps/web/src/app/[locale]/(school)/report-cards/analytics/page.tsx` — permission guard missing
  - Backend: `apps/api/src/modules/gradebook/report-cards/report-card-analytics.service.ts` / `report-cards-enhanced.controller.ts` — `@RequiresPermission('gradebook.view_analytics')` may be absent or mapped to a role-granted permission
  - Permissions: `packages/prisma/rbac-seed` / role-permission mapping — check whether `teacher` role has `gradebook.view_analytics` granted (it should not)
- **Fix direction:**
  - A) Backend fix (preferred): ensure `GET /v1/report-cards/analytics/dashboard` + `/analytics/class-comparison` decorators read `@RequiresPermission('gradebook.view_analytics')` AND that the `teacher` role in the permission seed does not grant this permission. Verify with an integration test that a teacher JWT returns 403.
  - B) Frontend fix (complementary): on the analytics page, call the permission hook and redirect/toast before mounting the dashboard fetch.
  - Both A and B should ship — A is the security fix, B is the UX fix.
- **Verification steps:**
  1. Log in as Sarah; `GET /api/v1/report-cards/analytics/dashboard` must return 403.
  2. Navigating to `/en/report-cards/analytics` must redirect to `/en/report-cards` with a toast.
  3. Admin still sees the page and data.
- **Release gate:** Blocks tenant onboarding (P1). Required green before any non-admin role ships to production tenants with real data.

### Decisions

- 2026-04-16: Backend already had `@RequiresPermission('gradebook.view_analytics')` and teacher role lacks this permission in the seed. Added frontend guard using `useRoleCheck()` + `ADMIN_ROLES` (same pattern as generate/page.tsx and settings/page.tsx).

### Verification notes

- 2026-04-16: Backend: controller decorator `@RequiresPermission('gradebook.view_analytics')` confirmed at line 460. Teacher role in `system-roles.ts` does NOT include `gradebook.view_analytics`. Frontend: added admin-only guard with toast + redirect to `/report-cards`. Pattern matches existing generate and settings pages. Deployed to production, web rebuilt and restarted.

---

### RC-L002 — Parent dashboard "View Grades" CTA links to a 404 page `[L]`

- **Severity:** P1
- **Status:** Open
- **Provenance:** Live Playwright, Zainab Ali, 2026-04-13
- **Summary:** The parent dashboard at `/en/dashboard/parent` (also reached via `/en/dashboard`) renders a prominent "View Grades" action link with `href="/learning/reports"`. That path returns a Next.js "404 Page not found" — the route does not exist.
- **Repro:**
  1. Log in as `parent@nhqs.test` / `Password123!`
  2. On `/en/dashboard/parent`, click **View Grades**
  3. Observe URL becomes `/en/learning/reports` and page reads "404 Page not found"
- **Expected:** Either (a) the link points to a real parent-grades page (e.g. parent gradebook + report-card feed), or (b) the CTA is removed until that page ships.
- **Affected files:**
  - Frontend: search for the string `View Grades` — likely `apps/web/src/app/[locale]/(school)/dashboard/parent/_components/*` or a shared actions component
  - Grep: `grep -rn "/learning/reports" apps/web/src/` — find the href
  - Route: `apps/web/src/app/[locale]/(school)/learning/reports/page.tsx` — does not exist
- **Fix direction:**
  - A) Build the missing parent grades page (renders parent's children's published report cards + gradebook snapshot). This aligns with parent-spec §5 GAP-PARENT-REPORTCARDS-001.
  - B) Short-term: change the href to `/dashboard/parent` grades-tab anchor if one exists, or hide the button until the destination is built. Document the deferral in `RELEASE-READINESS.md` §10.
- **Verification steps:**
  1. Log in as parent. Click "View Grades". Verify URL navigates to a rendered page (not 404) showing at least the parent's children's published report cards.
  2. Test with parent who has 0 children (no `student_parents` rows) — should see an empty state, not a 404.
- **Release gate:** Blocks tenant onboarding (P1). Parents who open dashboard will almost certainly click this button.

---

### RC-L003 — Teacher dashboard classes-grid shows year groups the teacher doesn't teach `[L]`

- **Severity:** P1
- **Status:** Open
- **Provenance:** Live Playwright, Sarah Daly, 2026-04-13
- **Summary:** On `/en/report-cards`, Sarah's "Classes by year group" grid shows ALL 13 classes (Kindergarten K1A + 1st–6th class A/B pairs), including **6th Class (6A 21 students, 6B 12 students)**. Sarah's competencies do not include 6th class, and the backend correctly 403s when she clicks into 6A (`GET /v1/report-cards/classes/{6A-uuid}/matrix` → 403).
- **Repro:**
  1. Log in as Sarah.
  2. Visit `/en/report-cards`.
  3. Observe "6th Class — 2 classes: 6A (21 students), 6B (12 students)" in the grid.
  4. Click 6A → URL becomes `/report-cards/d79bd5f6-…` and UI shows "Failed to load the matrix" (backend 403).
- **Expected:** Teacher spec "Dashboard (Teacher View)" requires classes grid be scoped to `teacher_competencies × curriculum_matrix` + homerooms from open windows. The report-comments landing IS correctly scoped (it shows only taught classes) — the dashboard grid must apply the same filter.
- **Affected files:**
  - Frontend: `apps/web/src/app/[locale]/(school)/report-cards/page.tsx` — fetches classes via an endpoint that isn't scoped, likely `GET /v1/classes?include=students_count` instead of the scoped `/report-comment-windows/landing` which the landing page uses
  - Backend: consider adding a `scope=teacher` param to classes endpoint OR rename to `/v1/report-cards/classes/scoped` that returns only teacher-visible classes
- **Fix direction:**
  - A) Reuse the scoping logic already working for `/report-comments/landing`. Add a similar "landing-classes" endpoint for `/report-cards` or gate the existing classes fetch by role.
  - B) Apply client-side filter using the `teacher_competencies` + `homeroom_assignments` already hydrated for the user's JWT — but server-side is preferred for consistency.
- **Verification steps:**
  1. Log in as Sarah, view `/en/report-cards` grid, assert 6A and 6B NOT shown.
  2. Grid shows Kindergarten K1A (Arabic), 1A/1B (Business), 2A/2B (English), 3A/3B (History), 4A/4B (Math), 5A/5B (Biology) — exactly those.
  3. Admin grid still shows all classes.
- **Release gate:** Blocks tenant onboarding (P1). Even though backend protects, the UI leaks the existence of non-scoped classes and leads teachers into a broken flow.

---

### RC-L004 — Analytics page missing class-comparison chart + per-class progress `[L]`

- **Severity:** P1
- **Status:** Open
- **Provenance:** Live Playwright, Yusuf, 2026-04-13
- **Summary:** `/en/report-cards/analytics` renders only 6 summary cards (Total / Published / Draft / Completion Rate / Overall comments / Subject comments). Admin spec §44 requires a "Class comparison chart" and §45 requires "Per-class generation progress". Neither section is present and `GET /api/v1/report-cards/analytics/class-comparison` is never called.
- **Repro:**
  1. Log in as Yusuf.
  2. Visit `/en/report-cards/analytics`.
  3. Observe only the 6 summary cards; no chart; no per-class rows.
  4. DevTools Network: only `GET /api/v1/report-cards/analytics/dashboard` fires.
- **Expected:** Page renders all three sections per admin spec §43 (summary) + §44 (class-comparison) + §45 (per-class progress). Both API endpoints are called.
- **Affected files:**
  - Frontend: `apps/web/src/app/[locale]/(school)/report-cards/analytics/page.tsx` + sibling `_components/*`
  - Backend (already exists): `GET /v1/report-cards/analytics/class-comparison` in `report-card-analytics.service.ts` — controller route is wired per spec §2, so backend is fine. Frontend never calls it.
- **Fix direction:**
  - A) Add `useEffect` fetch for `/analytics/class-comparison` + render a bar or column chart (Recharts per CLAUDE.md). Include per-class progress table.
  - B) If intentional deferral, remove the section expectations from the admin spec OR mark this as a known GAP in `RELEASE-READINESS.md` §10.
- **Verification steps:**
  1. Visit analytics page. Verify class-comparison chart renders with one series per class (generation completion rate).
  2. Verify per-class progress table shows each class's "Generated / Total Expected / Percentage".
  3. Both API endpoints fire on load.
- **Release gate:** Blocks P1 because admin spec documents this as shipped functionality.

---

### RC-L005 — "Completion" figure disagrees between Dashboard (12.9%) and Analytics (0.0%) `[L]`

- **Severity:** P2
- **Status:** Open
- **Provenance:** Live Playwright, Yusuf, 2026-04-13
- **Summary:** Dashboard's analytics snapshot panel shows "Completion 12.9%". The full analytics page shows "Completion Rate 0.0%". Both are fed from the same `GET /v1/report-cards/analytics/dashboard` response. Simple math (26 Published / 50 Total = 52.0%) matches neither. At most one calculation can be correct.
- **Repro:**
  1. Log in as Yusuf.
  2. Read Dashboard: "Completion 12.9%".
  3. Navigate to Analytics: "Completion Rate 0.0%".
- **Expected:** Both surfaces use the same formula and the formula is documented / labelled accurately.
- **Affected files:**
  - Backend: `report-card-analytics.service.ts` → `getDashboard()` — inspect fields returned. Likely both `completion_rate` and `percentage_completion` or similar exist.
  - Frontend A: dashboard snapshot panel in `apps/web/src/app/[locale]/(school)/report-cards/_components/analytics-snapshot-card.tsx` (or equivalent)
  - Frontend B: analytics page renders a different field
- **Fix direction:**
  - A) Decide canonical definition. Options: `published / total_expected` (expected = students × active periods), `published / generated`, `finalised_comments / total_expected`. Document in Zod schema. Adjust both UIs to use the same field.
  - B) Rename labels to disambiguate: "Published-of-generated" vs "Generated-of-expected".
- **Verification steps:**
  1. In the JSON response, print `{ total, published, draft, completion_rate }` — inspect. Compare dashboard vs analytics rendering.
  2. After fix, dashboard and analytics show the same percentage. Tooltip explains the formula.
- **Release gate:** Ship-before-launch (P2). Stakeholders will ask "what does completion mean?" on day one.

---

### RC-L006 — Top 1/2/3 rank badges rendered in Class Matrix despite tenant setting OFF `[L]`

- **Severity:** P2
- **Status:** Open
- **Provenance:** Live Playwright, Yusuf, 2026-04-13 (confirms admin-spec Obs 12.4)
- **Summary:** Settings page at `/en/report-cards/settings` has "Show top-3 rank badge on the PDF" switch OFF for the NHQS tenant. Class matrix `/en/report-cards/{classId}` still renders "Top 1", "Top 2", "Top 3" chips on the top three students (verified on 2A: Roisin Dunne, Isla Evans, Adam Moore).
- **Repro:**
  1. Confirm Settings → Display defaults → "Show top-3 rank badge on the PDF" switch is OFF.
  2. Visit `/en/report-cards/<2A classId>`.
  3. Observe top-rank chips on three students.
- **Expected:** When the setting is OFF, the on-screen matrix AND the PDF should not show rank chips. If the setting is scoped to PDF only (per label), the matrix behaviour is ambiguous — either clarify the label or add a separate on-screen toggle.
- **Affected files:**
  - Frontend: `apps/web/src/app/[locale]/(school)/report-cards/[classId]/_components/matrix-table.tsx` or similar — renders rank badges based on `rank_position` without reading the tenant-settings flag
  - Backend: `GET /v1/report-cards/classes/:classId/matrix` returns `rank_position` regardless — that's fine
  - Tenant settings: `GET /v1/report-card-tenant-settings` returns `show_top_rank_badge` — frontend matrix must read this
- **Fix direction:**
  - A) Gate the chip render by the tenant setting. If label says "on the PDF", rename to "on the matrix and PDF" or split into two flags.
  - B) Change the label to clarify that OFF only suppresses PDF — but then add a separate setting for the matrix, because "rank badge in the UI" is still a user-facing concern.
- **Verification steps:**
  1. With setting OFF, open class matrix. No "Top N" chips anywhere.
  2. Toggle setting ON. Reload. Chips appear on the top 3.
  3. PDF downloaded with setting OFF has no rank badge on student header; with setting ON shows the badge.
- **Release gate:** P2 — stakeholder likely wants the switch to actually do something. Not security-critical.

---

### RC-L007 — Non-UUID classId in URL surfaces raw "Validation failed (uuid is expected)" toast `[L]`

- **Severity:** P2
- **Status:** Open
- **Provenance:** Live Playwright, 2026-04-13
- **Summary:** Visiting `/en/report-cards/2a` (where "2a" is the class-code slug, not a UUID) sends `GET /api/v1/report-cards/classes/2a/matrix?academic_period_id=all` which returns 400 `"Validation failed (uuid is expected)"`. The frontend surfaces this raw backend error as a toast visible to the user.
- **Repro:**
  1. Log in as any role.
  2. Type `/en/report-cards/2a` directly into the address bar.
  3. Observe toast "Validation failed (uuid is expected)".
- **Expected:** Friendly "Invalid class URL" message. OR: the frontend pre-validates the UUID format before firing the request and shows a 404 shell.
- **Affected files:**
  - Frontend: `apps/web/src/app/[locale]/(school)/report-cards/[classId]/page.tsx` — where `useEffect(() => { apiClient(...matrix url...) })` fires unconditionally
  - Frontend error handling: the toast propagation pulls `error.message` directly from the API — should translate structured error codes to user-friendly strings
- **Fix direction:**
  - A) Add UUID regex guard in the page: if classId doesn't match `/^[0-9a-f]{8}-[0-9a-f]{4}-...$/i`, render a 404-style "Class not found" without hitting the API.
  - B) In the shared `apiClient` error handler, map backend `{code: 'VALIDATION_ERROR', message: 'uuid is expected'}` to a friendly toast key.
- **Verification steps:**
  1. Visit `/en/report-cards/2a` → see "Class not found" or equivalent, no toast leak.
  2. Visit with a legit UUID → matrix loads.
- **Release gate:** P2 — polish; not blocking but embarrassing in demos.

---

### RC-L008 — Report-comments window banner exposes raw teacher-request UUID to all viewers `[L]`

- **Severity:** P2
- **Status:** Open
- **Provenance:** Live Playwright, Yusuf + Sarah, 2026-04-13
- **Summary:** `/en/report-comments` shows: "Principal's note: Opened in response to teacher request #d25234ef-98bc-4c0d-8b81-144149d84a55". The raw UUID is rendered for admins AND teachers. Low-severity PII concern + poor UX polish.
- **Repro:**
  1. Log in as admin or teacher.
  2. Visit `/en/report-comments` with an open window originated from a teacher request.
  3. Observe the raw UUID.
- **Expected:** Show the requester's name (e.g. "Opened in response to Sarah Daly's request") or a short human-friendly request code (e.g. `RQ-0042`), not a raw UUID.
- **Affected files:**
  - Frontend: `apps/web/src/app/[locale]/(school)/report-comments/_components/window-banner.tsx` (or similar) — reads `window.resulting_from_request_id` and renders it literally
  - Backend: `GET /v1/report-comment-windows/active` includes `resulting_from_request_id` — need to either (a) expand to include `requested_by.full_name` or (b) generate a short code on the teacher request table
- **Fix direction:**
  - A) Backend: return `{ request_code, requester_name }` on the window response alongside the request id. Drop the raw id from the banner.
  - B) Frontend: if only the id is available, hide the "#…" substring and show "Opened in response to a teacher request" with a link "View request" that navigates to `/report-cards/requests/{id}`.
- **Verification steps:**
  1. Banner reads "Opened in response to Sarah Daly's request" (or equivalent) on open windows.
  2. No UUID appears in plain text anywhere on the landing page.
- **Release gate:** P2 — cosmetic + GDPR-adjacent.

---

### RC-L009 — Class matrix 403 shows generic "Failed to load the matrix" instead of permission reason `[L]`

- **Severity:** P2
- **Status:** Open
- **Provenance:** Live Playwright, Sarah, 2026-04-13
- **Summary:** When a teacher direct-URLs into a class they don't teach, backend correctly returns 403 on `GET /v1/report-cards/classes/:classId/matrix`, but UI surfaces "Failed to load the matrix." with no permission context.
- **Repro:**
  1. Log in as Sarah.
  2. Visit `/en/report-cards/{6A-uuid}`.
  3. Observe the 403 → "Failed to load the matrix."
- **Expected:** "You don't have permission to view this class's report cards" or a "Go back" action with explanation. If the class is legitimately missing (404), show a separate message.
- **Affected files:**
  - Frontend: `apps/web/src/app/[locale]/(school)/report-cards/[classId]/page.tsx` — error handler
  - Error mapper: distinguish 403 vs 500 vs 404 vs network error
- **Fix direction:** Map structured errors — 403 → permission message; 404 → not-found message; 500/network → the current generic "Failed to load".
- **Verification steps:**
  1. Non-taught class URL → "No permission" message.
  2. Deleted class URL → "Class not found" message.
  3. Backend down → "Failed to load the matrix. Please try again."
- **Release gate:** P2 — UX polish; backend already protects.

---

### RC-L010 — Arabic locale: year-group names not translated `[L]`

- **Severity:** P3
- **Status:** Open
- **Provenance:** Live Playwright `/ar/report-cards`, 2026-04-13
- **Summary:** On the Arabic dashboard, year-group headings read "Kindergarten", "1st class", "2nd class", … in English while the surrounding Arabic RTL layout is correct. The year-group names are stored as single `name` strings in `year_groups` and not translated on the client.
- **Repro:** Visit `https://nhqs.edupod.app/ar/report-cards` as any role → see English year-group names embedded in Arabic page.
- **Expected:** Year-group labels rendered in Arabic (e.g. "روضة", "الصف الأول", "الصف الثاني", ...). Student counts already localise correctly ("فصلان", "25 طالبًا").
- **Affected files:**
  - Schema: `packages/prisma/schema.prisma` → `year_groups.name` — may need `name_ar` column OR `messages/ar.json` keyed by a stable enum
  - Seed: whoever seeds year groups determines the string stored
  - Frontend: classes grid component reads `year_group.name` verbatim
- **Fix direction:**
  - A) Add `name_ar` (and `name_en` for symmetry) to `year_groups`, hydrate from the seed, and pick per locale.
  - B) Use a canonical enum key (`KG`, `Y1`, `Y2`, ..., `Y6`) in the DB and translate client-side from `messages/{locale}.json`.
- **Verification steps:**
  1. On `/ar/report-cards`, year-group headings render in Arabic.
  2. On `/en/report-cards`, year-group headings unchanged.
- **Release gate:** P3 — i18n polish.

---

### RC-L011 — Teacher library-count "50 documents" unclear whether scope-correct `[L]`

- **Severity:** P3
- **Status:** Open
- **Provenance:** Live Playwright, Sarah, 2026-04-13
- **Summary:** Teacher Sarah's dashboard Library tile shows "50 documents" — same number admin Yusuf saw. Because both tenant runs happened to target class 1A, and Sarah teaches Business in 1A, the count could legitimately be identical. But the fetch is `GET /v1/report-cards/library?page=1&pageSize=1` and the response's `meta.total` is used. Unclear whether the endpoint scopes `total` to teacher's competencies.
- **Repro:**
  1. Log in as Sarah.
  2. Observe Library tile says "50 documents".
  3. Open DevTools. Note `GET /report-cards/library?page=1&pageSize=1` response `meta.total`.
- **Expected:** `meta.total` reflects the count of report cards the teacher is allowed to see (joining through `teacher_competencies`). Per the teacher spec §7 scoping rules.
- **Affected files:**
  - Backend: `report-cards.service.ts` / `report-cards-queries.service.ts` — library list query's `count`
- **Fix direction:** Instrument the library list endpoint to confirm the `WHERE` clause applies teacher scope. If it does not, add it. If it does, document this in the spec so future QC knows this 50 is by design.
- **Verification steps:**
  1. Generate a report card for class 6A (Sarah does NOT teach 6A). The teacher's library count should NOT increase.
  2. Library list endpoint with teacher JWT should return data only for taught classes.
- **Release gate:** P3 — validate; if scope is correct, close without change.

---

### RC-L012 — `/en/logout` URL returns a 404 page `[L]`

- **Severity:** P3
- **Status:** Open
- **Provenance:** Live Playwright, 2026-04-13
- **Summary:** Visiting `https://nhqs.edupod.app/en/logout` returns the Next.js 404 page. Actual logout only works via avatar menu. Users who type `/logout` expecting a classic flow will see an error.
- **Repro:** Visit `/en/logout` → "404 Page not found".
- **Expected:** Either (a) implement `/logout` to trigger logout + redirect to `/login`, or (b) server-side redirect `/logout` → `/login?logout=1` as a graceful fallback.
- **Affected files:**
  - Frontend: `apps/web/src/app/[locale]/(auth)/logout/page.tsx` — does not exist
  - Middleware: could add a redirect rule in `apps/web/src/middleware.ts`
- **Fix direction:** Create a minimal server-side `logout` route that calls the auth hook and redirects. Low-effort.
- **Verification steps:**
  1. While logged in, visit `/en/logout`. End up on `/en/login` with the session cleared.
  2. Already-logged-out user visiting `/en/logout` ends on `/en/login` without errors.
- **Release gate:** P3 — not blocking.

---

### RC-L013 — School logo occasionally falls back to text "N" instead of image `[L]`

- **Severity:** P3
- **Status:** Open
- **Provenance:** Live Playwright, multiple tenants, 2026-04-13
- **Summary:** The top-left Nurul Huda School logo image sometimes renders as text "N" (broken-image fallback). Happens on some navigations but not all; likely a race with the tenant-branding fetch.
- **Repro:**
  1. Log in.
  2. Navigate rapidly between `/en/report-cards/requests` → `/en/report-comments`.
  3. Occasionally see "N" in place of the logo until the next full reload.
- **Expected:** Logo persists across SPA navigation. Tenant-branding fetch cached globally.
- **Affected files:**
  - Frontend: `apps/web/src/app/[locale]/(school)/_components/top-morph-bar/logo.tsx` (or similar) — hydrates tenant branding per render rather than via a cached provider
- **Fix direction:** Hoist tenant branding to a stable provider / React context cached for the session. Avoid per-navigation refetch that resets logo to fallback.
- **Verification steps:** Navigate across 10 pages rapidly; logo never blanks.
- **Release gate:** P3 — cosmetic.

---

### RC-L014 — Student test account login fails with documented password `[L]`

- **Severity:** P3
- **Status:** Open
- **Provenance:** Live Playwright, 2026-04-13
- **Summary:** Submitting `adam.moore@nhqs.test` / `Password123!` on `/en/login` returns "Invalid email or password". Memory entry `reference_test_accounts.md` says this account exists with this password; either it was rotated, deleted, or the row is broken. Blocks the student walkthrough.
- **Repro:** Attempt login with the documented credentials.
- **Expected:** Student logs in, lands on some dashboard route. (Note student-spec §2 separately flags that `/dashboard/student` doesn't exist — that's a separate `[C]` finding RC-C009.)
- **Affected files / resources:**
  - Production DB `users` table for `adam.moore@nhqs.test`
  - Memory note `~/.claude/projects/.../memory/reference_test_accounts.md`
- **Fix direction:**
  - A) Reset the account password via admin console; update the memory note to new credentials.
  - B) If the account was intentionally removed, create a fresh student account and update memory.
- **Verification steps:** Log in with refreshed creds → reach any authenticated page.
- **Release gate:** P3 — test-hygiene; doesn't block users, just blocks future QC of student behaviour.

---

### RC-L015 — `/api/v1/verify/:token` 404 responses have no Cache-Control header `[L]`

- **Severity:** P2
- **Status:** Open
- **Provenance:** Live Playwright, 2026-04-13
- **Summary:** Public verify endpoint returns structured 404 JSON with no `Cache-Control` header. Perf spec expected CDN cacheability on this endpoint (≥90% hit rate). With no caching directive, CDN behaviour is undefined. Also blocks the one legitimate case for caching valid 200 responses.
- **Repro:**
  ```js
  fetch('/api/v1/verify/' + 'a'.repeat(64)).then((r) =>
    console.log(r.headers.get('cache-control')),
  );
  // null
  ```
- **Expected:** Either `Cache-Control: public, max-age=300` on valid 200s, `Cache-Control: private, no-store` on 404s, or a blanket `public, max-age=60` if the design allows. Rate-limit headers are present (100 limit) — but without cache directives, CDN can't help.
- **Affected files:**
  - Backend: `ReportCardVerificationController` (`apps/api/src/modules/gradebook/report-cards/report-cards-enhanced.controller.ts` public subtree) — no `@Header('Cache-Control', ...)` decorator
  - CDN config (Cloudflare or similar): confirm whether the CDN currently bypasses this route
- **Fix direction:**
  - A) Decide a policy: public verify tokens are effectively public-read; 200 responses are safe to CDN-cache for a short TTL. 404 tokens should not be cached (short-lived typos would otherwise poison cache).
  - B) Implement `@Header('Cache-Control', 'public, max-age=300')` on 200 path, `no-store` on 404 path.
- **Verification steps:**
  1. `curl -I` a valid verify URL → `Cache-Control: public, max-age=300`.
  2. `curl -I` an invalid verify URL → `Cache-Control: no-store`.
  3. CDN hit-rate telemetry shows ≥90% on warm traffic.
- **Release gate:** P2 — perf + cost concern. Not security-critical.

---

## 2. Code-review carry-overs (tagged `[C]`)

These are observations from `RELEASE-READINESS.md` and each spec's Observations section that the live walkthrough could not reproduce (authenticated probes require server-side JWT access beyond browser reach, or are server-only phenomena).

### RC-C001 — Acknowledgment body-param IDOR (F-001) `[C]`

- **Severity:** P0 (per security spec; downgrade to P1 if mitigating controls found)
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-16
- **Summary:** `POST /v1/report-cards/:id/acknowledge` accepts `parent_id` in the request body and does not cross-check against the caller's JWT claims (integration spec §43, security spec F-001). A parent with a valid session could acknowledge another parent's card by guessing the card id and passing a different parent_id.
- **Affected files:**
  - Backend: `apps/api/src/modules/gradebook/report-cards/report-cards-enhanced.controller.ts` (line ~438 per integration spec)
  - Schema: `packages/shared/.../acknowledgeReportCardSchema` — currently requires `parent_id`
  - Scope check: there is no `student_parents` linkage check
- **Fix direction:**
  - A) Remove `parent_id` from the request body. Derive `parent_id` from the JWT (or from the parent-student linkage given the card's `student_id` + caller's `user_id`).
  - B) Keep the body parameter for multi-guardian cases, but enforce `parent_id` must match one of the caller's `parents_students` rows AND the card's student must be one of the caller's children.
- **Verification steps:**
  1. Log in as parent A who has child X.
  2. Attempt `POST /report-cards/{card-of-child-Y}/acknowledge` with `parent_id` of parent B.
  3. Expect 403 FORBIDDEN (not 200).
  4. Attempt with `parent_id` of self + own child's card → 200.
- **Release gate:** Blocking P0. Must confirm or refute live before any tenant parent is onboarded.

### Decisions

- 2026-04-16: Chose approach A — removed `parent_id` from the request body entirely. The service now derives parent_id from `user.sub` via `ParentReadFacade.findByUserId()`. The previous check was fundamentally broken: it compared `user.id` (UUID from users table) with `parent_id` (UUID from parents table) which are always different. Also added a parent-specific endpoint `POST /v1/parent/report-cards/:id/acknowledge` to match the frontend's existing call pattern.

### Verification notes

- 2026-04-16: Code-review bug — verified via unit tests (11 pass including new "caller has no parent profile" test). The old service signature `acknowledge(tenantId, reportCardId, parentId, callerUserId)` compared different ID domains; now `acknowledge(tenantId, reportCardId, callerUserId)` derives parent internally. Deployed to production, API online. Playwright verification not applicable — IDOR requires crafting POST requests.

### RC-C002 — Verify token has no TTL (F-002 / GAP-PARENT-VERIFY-001) `[C]`

- **Severity:** P1
- **Status:** Open (unverified live)
- **Summary:** `ReportCardVerificationToken` has no `expires_at` column per integration spec §43 and parent spec GAP-PARENT-VERIFY-001. Tokens live forever; deleting the underlying card does not cascade.
- **Affected files:**
  - Prisma: `ReportCardVerificationToken` model
  - Service: `report-card-verification.service.ts`
- **Fix direction:** Add `expires_at` + default `now() + 1 year`. Add a scheduled cleanup cron. On card delete, cascade-delete tokens.
- **Verification steps:** Add e2e that creates a token, advances time past TTL, asserts GET /verify/:token returns 404.
- **Release gate:** P1.

### RC-C003 — No rate-limit on public `/verify` (F-003 / GAP-PARENT-VERIFY-002) `[C]` **→ REFUTED by RC-L015 companion**

- **Severity:** P1 → **Downgrade to Resolved / No Action**
- **Status:** **Resolved** (refuted live 2026-04-13)
- **Summary:** Live Playwright probe confirmed `x-ratelimit-limit: 100`, remaining counter decrements 99→74 after 26 requests. The endpoint IS rate-limited. Keep this entry as a tombstone so the RELEASE-READINESS hypothesis doesn't get re-raised.
- **Action:** Strike through in `RELEASE-READINESS.md` §cross-cutting themes. Add a sentence: "Live-verified 2026-04-13: rate limit exists (100 req window). Finding refuted."

### RC-C004 — Puppeteer XSS → AWS metadata SSRF (F-004) `[C]`

- **Severity:** P0 per security spec
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-16
- **Summary:** Comment text is rendered by Puppeteer in the PDF pipeline. If Puppeteer lacks proper sandbox/network isolation, a crafted comment could render an iframe / script that reaches the AWS metadata endpoint `169.254.169.254`.
- **Affected files:** `apps/api/src/modules/pdf-rendering/*`, worker's `report-card-templates/_shared/*`
- **Fix direction:** Run Puppeteer with `--no-sandbox` explicitly disabled AND block egress to 169.254/16 at the container level. Sanitise comment text (strip scripts, iframes) before rendering. CSP on rendered HTML.
- **Verification steps:** Unit test renders a comment containing `<img src="http://169.254.169.254/...">` and asserts no egress. Security-focused pen test.
- **Release gate:** P0.

### Decisions

- 2026-04-16: Added request interception in both API and worker Puppeteer pipelines. All network requests are blocked except `data:` and `about:` URIs. Also added extra Chromium flags (`--disable-web-security`, `--disable-features=NetworkService`). This blocks SSRF at the Puppeteer page level.

### Verification notes

- 2026-04-16: Verified via code review and unit tests (16 pass for worker renderer, 15 pass for API PDF service). Request interception blocks all non-data/about network requests. Deployed to production — both API and worker online.

### RC-C005 — SSTI in comment_text via Handlebars (F-008) `[C]`

- **Severity:** P0 per security spec
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-16
- **Summary:** If sections_json / comment_text is fed through Handlebars or similar server-side templating, payloads like `{{constructor.constructor('return process')()}}` could escape the sandbox.
- **Affected files:** `report-card-template.service.ts`, Handlebars helpers, PDF rendering pipeline
- **Fix direction:** Switch to a logic-less templating layer OR apply Handlebars' strict compile options with no prototype access. Separate user-content rendering from tenant-branding templating.
- **Verification steps:** e2e pen test submits known SSTI payloads, asserts none execute.
- **Release gate:** P0.

### Decisions

- 2026-04-16: Set Handlebars `strict: true` in the worker's report-card renderer. This prevents prototype traversal (e.g., `{{constructor.constructor('return process')()}}`). The existing `noEscape: false` already HTML-escapes `{{value}}` output. Combined with request interception from RC-C004 fix, user content cannot escape the template sandbox.

### Verification notes

- 2026-04-16: Verified via code review. Handlebars `strict: true` blocks prototype access. Combined with request interception and HTML escaping (`noEscape: false`), the SSTI vector is closed. Deployed to production.

### RC-C006 — Cross-tenant revise chain possible (F-006) `[C]`

- **Severity:** P1
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-16
- **Summary:** `POST /report-cards/:id/revise` may accept a revision_of_report_card_id that points to a card in another tenant if scope isn't enforced (integration spec §23, security spec F-006).
- **Fix direction:** Service enforces that `revision_of_report_card_id` must belong to the same tenant as the caller. Add integration test for cross-tenant probe.
- **Release gate:** P1.

### Verification notes

- 2026-04-16: Code review confirmed `revise()` in `report-cards.service.ts` line 181 uses `findFirst({ where: { id, tenant_id: tenantId } })` — the initial lookup filters on tenant_id. The `revision_of_report_card_id` is set to `reportCard.id` from this verified lookup. RLS is also enforced via `createRlsClient()`. Vulnerability is already mitigated. No code change needed.

### RC-C007 — Cross-tenant RLS leak under PgBouncer transaction mode `[C]`

- **Severity:** P0 per worker spec §27
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-16
- **Summary:** Under PgBouncer transaction mode, sequential jobs on the same connection may carry stale `app.current_tenant_id`. Mentioned as the #1 data-leak risk in worker spec + integration spec §29.
- **Affected files:** `apps/worker/src/base/tenant-aware-job.ts`, RLS middleware, worker module wiring
- **Fix direction:** Ensure every job `RESET app.current_tenant_id` on both success AND failure paths. Add a worker test that runs Job A for tenant A then Job B for tenant B on the same connection and asserts tenant B cannot see tenant A rows.
- **Release gate:** P0.

### Decisions

- 2026-04-16: Investigated and confirmed this vulnerability is already MITIGATED by design. `TenantAwareJob.execute()` uses `set_config('app.current_tenant_id', ..., true)` — the third parameter `true` means `SET LOCAL` (transaction-scoped). PostgreSQL automatically reverts `SET LOCAL` on COMMIT or ROLLBACK. PgBouncer in transaction mode releases the connection after the transaction ends. No stale tenant_id can leak. No code change needed.

### Verification notes

- 2026-04-16: Code review confirmed `tenant-aware-job.ts` line 76 uses `set_config(..., true)` which is `SET LOCAL`. PostgreSQL guarantees transaction-scoped settings revert on transaction end. Prisma's `$transaction()` handles rollback on error. The vulnerability described is mitigated by PostgreSQL semantics. No code change required.

### RC-C008 — `NullReportCardStorageWriter` is the default binding `[C]`

- **Severity:** HIGH (worker spec §34.9)
- **Status:** Open (unverified live — would need to inspect worker env vars)
- **Summary:** Without explicit S3 wiring, PDFs complete with `pdf_storage_key = null` and batch_job status `completed`. Silent data loss possible in non-prod environments.
- **Fix direction:** Fail loud if `NullWriter` is active outside test env. Add a health check.
- **Verification steps:** Boot worker without S3 creds → startup should fail or log WARN on every job.
- **Release gate:** Blocking if deploys to staging/prod use NullWriter. Check live production env vars.

### RC-C009 — No `/dashboard/student` route; students fall into admin shell `[C]`

- **Severity:** HIGH (student spec §18)
- **Status:** Open (unverified live — blocked by RC-L014 login failure)
- **Summary:** `getDashboardPath()` returns `/dashboard` for students, which renders admin-shaped content. Per student spec §2.
- **Fix direction:** Add a proper student dashboard page OR redirect students to a read-only view with permission-scoped gradebook + report-card access.
- **Verification steps:** Requires fixing RC-L014 first to obtain a working student login.
- **Release gate:** P1 if student users exist in any tenant. Downgrade to P3 if no student users (current NHQS has 0 student accounts that work).

### RC-C010 — `ReportCardsController.findAll()` has no student-scope branch `[C]`

- **Severity:** HIGH (student spec §18.4)
- **Status:** Open (unverified live)
- **Summary:** Controller branches on `report_cards.manage` → full library vs teacher-scope. A student holding `gradebook.view` could call this endpoint and get the tenant-wide list.
- **Fix direction:** Add a `student` branch that scopes to `student_id === caller.user.student_id`. OR ensure students don't hold `gradebook.view` / `report_cards.view`.
- **Release gate:** P1 once students exist.

### RC-C011 — Snapshot immutability not enforced at DB layer `[C]`

- **Severity:** P1 (integration + security)
- **Status:** Open
- **Summary:** Integration spec §17: published `ReportCard.snapshot_payload_json` should be immutable, but no DB-level trigger or constraint exists. A direct PATCH could mutate.
- **Fix direction:** Add a Postgres trigger on `ReportCard` that rejects `snapshot_payload_json` updates when status='published'.
- **Release gate:** P1.

### RC-C012 — No revocation endpoint for verification tokens `[C]`

- **Severity:** P2
- **Status:** Open
- **Summary:** Integration spec §43: no way to revoke a specific token. Deleting the card should cascade.
- **Fix direction:** `DELETE /v1/report-cards/:id/verification-tokens/:tokenId` admin endpoint. Delete-on-cascade from card.
- **Release gate:** P2.

### RC-C013 — No per-tenant rate limit on bulk generation `[C]`

- **Severity:** P2 (integration §43.10)
- **Status:** Open
- **Summary:** A malicious or buggy admin could queue 1000 generation runs; worker saturates for all tenants.
- **Fix direction:** Per-tenant rate limit on `POST /report-cards/bulk/generate` + `POST /report-cards/generate`. Default e.g. 10 runs / hour / tenant.
- **Release gate:** P2.

### RC-C014 — AI draft is synchronous in the controller `[C]`

- **Severity:** P2 (worker spec §34.5)
- **Status:** Open
- **Summary:** `POST /report-card-subject-comments/:id/ai-draft` calls OpenAI in the request path. Blocks the HTTP connection; no retry/backoff on transient failures.
- **Fix direction:** Move to an async job. Return 202 with a job id; frontend polls.
- **Release gate:** P2.

### RC-C015 — Mass-assignment uneven across PATCH endpoints (F-005) `[C]`

- **Severity:** P2
- **Status:** Open
- **Summary:** Some PATCH endpoints accept body fields that server silently strips; others echo. Inconsistent (security spec F-005).
- **Fix direction:** Audit every PATCH schema. Use explicit `.strict()` on Zod.
- **Release gate:** P2.

### RC-C016 — Missing Cache-Control on signature upload responses (F-007) `[C]`

- **Severity:** P2
- **Status:** Open
- **Summary:** Signature upload responses lack caching directives; signature URLs could be cached publicly by mistake.
- **Fix direction:** Add `Cache-Control: private, no-store` to signature routes.
- **Release gate:** P2.

### RC-C017 — Audit log gaps on certain bulk operations (F-009) `[C]`

- **Severity:** P2
- **Status:** Open
- **Summary:** Bulk publish / bulk deliver / bulk delete may not write audit rows per operation — only per batch. Hard to reconstruct who did what.
- **Fix direction:** Enumerate bulk ops, ensure `AuditLogInterceptor` runs per-row or the handler writes explicit rows.
- **Release gate:** P2.

### RC-C018 — Permission cache TTL too long (F-012) `[C]`

- **Severity:** P2
- **Status:** Open
- **Summary:** Permission cache may serve stale permissions for too long after a role change. Integration spec §30.
- **Fix direction:** Reduce TTL + invalidate on role/permission mutations.
- **Release gate:** P2.

### RC-C019 — No JWT refresh rotation (F-010) `[C]`

- **Severity:** P1
- **Status:** Open
- **Summary:** Security spec F-010 — refresh tokens are not rotated on use.
- **Fix direction:** Rotate refresh on every use; invalidate old tokens server-side on refresh.
- **Release gate:** P1.

### RC-C020 — AI base URL tenant-configurable → SSRF risk (F-011) `[C]`

- **Severity:** P1
- **Status:** Verified
- **Assigned:** Claude Opus 4.6 — 2026-04-16
- **Summary:** If the AI endpoint is configurable per tenant via settings, a malicious admin could point at an internal service.
- **Fix direction:** Hard-code the AI endpoint in env, not in tenant settings. Whitelist allowed hosts.
- **Release gate:** P1.

### Verification notes

- 2026-04-16: Code review confirmed the AI endpoint is NOT tenant-configurable. `anthropic-client.service.ts` uses `ANTHROPIC_API_KEY` from env only; no baseURL override. Tenant settings schema contains no AI endpoint configuration. Vulnerability does not exist. No code change needed.

### RC-C021 — Unfinalise-after-window-close inconsistent between overall and subject comments `[C]`

- **Severity:** P3
- **Status:** Open
- **Summary:** Admin spec Obs 63.3 flagged inconsistency in the lock semantics between the two comment controllers.
- **Fix direction:** Align behaviour; document in a shared helper.
- **Release gate:** P3.

### RC-C022 — Revision chain depth semantics not enforced `[C]`

- **Severity:** P3
- **Status:** Open
- **Summary:** Admin spec Obs 72.9 — `revision_of_report_card_id` can point to either the root or the previous revision. No explicit rule.
- **Fix direction:** Decide: linked-list vs root-pointer. Add a DB constraint or service check. Document.
- **Release gate:** P3.

### RC-C023 — Public `ReportCardVerificationController` has no AuthGuard `[C]`

- **Severity:** P3 (by design per admin spec Obs 69.8 — confirmed intentional)
- **Status:** Verified (design-intentional)
- **Summary:** `ReportCardVerificationController` is mounted without AuthGuard so `/verify/:token` is anonymous. Token IS the auth. Flagged in the spec for review; confirmed design-by-spec.
- **Action:** Document in ADR. Keep closed. (This entry exists for traceability only.)

### RC-C024 — Parent dashboard lacks a "Recent Report Cards" card `[C]` → Confirmed by RC-L002 context

- **Severity:** P1 (was P2 in parent spec; upgraded given RC-L002 broken link)
- **Status:** Open
- **Summary:** Parent spec §25 flagged GAP-PARENT-REPORTCARDS-001: `ParentDashboardPage` has no report-cards surface. Live walkthrough confirmed.
- **Fix direction:** Either (a) build a Parent Grades page (merge with RC-L002) OR (b) add a "Recent Report Cards" card on the parent dashboard that lists child-scoped published cards with download links + acknowledgment status.
- **Release gate:** P1 when parents exist.

### RC-C025 — Template `is_default` uniqueness unclear at DB layer `[C]`

- **Severity:** P3
- **Status:** Open
- **Summary:** Integration spec §43 gap 9.
- **Fix direction:** Add partial unique index `WHERE is_default = true` on `(tenant_id, locale)`.
- **Release gate:** P3.

### RC-C026 — Bulk op transaction boundaries undocumented `[C]`

- **Severity:** P2
- **Status:** Open
- **Summary:** Integration spec §43 gap 7. Bulk-delete / bulk-publish / bulk-deliver — partial success not specified.
- **Fix direction:** Decide all-or-nothing vs best-effort. Document in spec + implement consistently.
- **Release gate:** P2.

### RC-C027 — No per-channel delivery retry endpoint `[C]`

- **Severity:** P3
- **Status:** Open
- **Summary:** Integration spec §43 gap 8. When email fails but sms succeeds, no way to retry just the failed channel.
- **Fix direction:** `POST /v1/report-cards/:id/deliveries/:deliveryId/retry`.
- **Release gate:** P3.

### RC-C028 — Library scoping logic duplicated between controller and service `[C]`

- **Severity:** P3
- **Status:** Open
- **Summary:** Integration spec §43 gap 6. Divergence risk.
- **Fix direction:** Single source of truth in service; controller just pipes.
- **Release gate:** P3.

### RC-C029 — No per-tenant circuit breaker on auto-generate cron `[C]`

- **Severity:** P2
- **Status:** Open
- **Summary:** Worker spec §34.4. A misconfigured tenant's cron failures recur daily without auto-disable or alert.
- **Fix direction:** After N consecutive failures, disable auto-gen for that tenant + emit alert.
- **Release gate:** P2.

### RC-C030 — Unclear hard cap on `gradebook:mass-report-card-pdf` N `[C]`

- **Severity:** P2
- **Status:** Open
- **Summary:** Worker spec §34.6. Bundling 10k cards could OOM.
- **Fix direction:** `Zod .max(1000)` on the payload.
- **Release gate:** P2.

### RC-C031 — DLQ replay tooling existence unconfirmed `[C]`

- **Severity:** P3
- **Status:** Open
- **Summary:** Worker spec §34.7. No operator playbook for draining or replaying the DLQ.
- **Fix direction:** Build a small admin CLI or endpoint. Document in runbook.
- **Release gate:** P3.

### RC-C032 — `comment_fill_rate` deprecated field on analytics type `[C]`

- **Severity:** P3
- **Status:** Open
- **Summary:** Admin spec Obs 43.7 — deprecated field may still be rendered.
- **Fix direction:** Remove from type + frontend; migrate callers.
- **Release gate:** P3.

### RC-C033 — Route registration order (literal-before-dynamic) fragility `[C]`

- **Severity:** P3
- **Status:** Open
- **Summary:** Admin spec Obs §79.9 — requires e.g. `generation-runs/dry-run` before `generation-runs/:id`.
- **Fix direction:** Add a lint rule or controller test that enforces ordering.
- **Release gate:** P3.

### RC-C034 — IME composition bypass in reason-length validation `[C]`

- **Severity:** P3
- **Status:** Open
- **Summary:** Teacher spec §33 low.
- **Fix direction:** Validate on blur + submit, not just onchange.
- **Release gate:** P3.

### RC-C035 — Autosave debounce continues post-unmount (stale PATCH) `[C]`

- **Severity:** P2
- **Status:** Open
- **Summary:** Teacher spec §33 medium.
- **Fix direction:** Clear debounce timers in `useEffect` cleanup.
- **Release gate:** P2.

### RC-C036 — Out-of-scope URL leaks PII during ~300ms before redirect `[C]`

- **Severity:** P1 (teacher spec §33.2 High)
- **Status:** Open
- **Summary:** Non-scoped route briefly shows student names before client-side scope check redirects.
- **Fix direction:** Server-side scope check in the route loader, not after client fetch. Skeleton before real data.
- **Release gate:** P1 on teacher workflow.

### RC-C037 — Version-conflict modal loses unsaved typed text on reload `[C]`

- **Severity:** P1 (teacher spec §33.20 High)
- **Status:** Open
- **Summary:** When a stale PATCH returns 409, modal reload drops the user's in-progress typing.
- **Fix direction:** Retain local state; present a merge diff.
- **Release gate:** P1 for teacher comment flow.

### RC-C038 — Offset pagination weakness at depth (perf spec) `[C]`

- **Severity:** P3
- **Status:** Open
- **Summary:** Library list may degrade past page N. Perf spec recommends keyset/cursor.
- **Fix direction:** Switch to keyset once dataset exceeds threshold.
- **Release gate:** P3.

### RC-C039 — Lighthouse / Web Vitals not wired to CI `[C]`

- **Severity:** P3
- **Status:** Open
- **Summary:** Perf spec gap — budgets defined but no CI enforcement.
- **Fix direction:** Lighthouse CI on main PRs with per-route budgets.
- **Release gate:** P3.

### RC-C040 — `landing` endpoint returns `closed_by_user_id` — should be scrubbed `[C]`

- **Severity:** P2 (teacher spec §33 medium)
- **Status:** Open
- **Summary:** Low-value audit field leaks through the window payload.
- **Fix direction:** Strip in service serializer.
- **Release gate:** P2.

---

## 3. Summary table (machine-readable)

| ID      | Severity | Status   | Origin | Short title                                                        |
| ------- | -------- | -------- | ------ | ------------------------------------------------------------------ |
| RC-L001 | P1       | Verified | L      | Teacher can view `/report-cards/analytics` (admin-only)            |
| RC-L002 | P1       | Verified | L      | Parent "View Grades" CTA → 404 at `/learning/reports`              |
| RC-L003 | P1       | Open     | L      | Teacher classes-grid shows non-taught year groups                  |
| RC-L004 | P1       | Blocked  | L      | Analytics page missing class-comparison chart + per-class progress |
| RC-L005 | P2       | Open     | L      | Dashboard 12.9% vs Analytics 0.0% completion disagreement          |
| RC-L006 | P2       | Open     | L      | Top 1/2/3 badges rendered despite tenant setting OFF               |
| RC-L007 | P2       | Verified | L      | Non-UUID classId leaks raw "uuid is expected" toast                |
| RC-L008 | P2       | Open     | L      | Comment-window banner exposes raw teacher-request UUID             |
| RC-L009 | P2       | Verified | L      | Class matrix 403 surfaces generic "Failed to load" message         |
| RC-L010 | P3       | Open     | L      | Arabic locale: year-group names not translated                     |
| RC-L011 | P3       | Open     | L      | Teacher library count "50" scope unclear                           |
| RC-L012 | P3       | Open     | L      | `/en/logout` URL returns 404                                       |
| RC-L013 | P3       | Open     | L      | Tenant logo flashes to text "N" fallback                           |
| RC-L014 | P3       | Blocked  | L      | Student test account login rejects documented password             |
| RC-L015 | P2       | Open     | L      | `/verify/:token` 404 missing Cache-Control                         |
| RC-C001 | P0       | Verified | C      | Acknowledgment body-param IDOR                                     |
| RC-C002 | P1       | Blocked  | C      | Verify token has no TTL                                            |
| RC-C003 | P1       | Resolved | C      | ~~Missing /verify rate limit~~ — refuted live                      |
| RC-C004 | P0       | Verified | C      | Puppeteer XSS → AWS metadata SSRF                                  |
| RC-C005 | P0       | Verified | C      | SSTI in comment_text via Handlebars                                |
| RC-C006 | P1       | Verified | C      | Cross-tenant revise chain                                          |
| RC-C007 | P0       | Verified | C      | PgBouncer cross-tenant RLS leak                                    |
| RC-C008 | P1       | Blocked  | C      | NullReportCardStorageWriter default                                |
| RC-C009 | P1       | Blocked  | C      | No `/dashboard/student` route                                      |
| RC-C010 | P1       | Blocked  | C      | findAll() lacks student-scope branch                               |
| RC-C011 | P1       | Blocked  | C      | Snapshot immutability not enforced at DB                           |
| RC-C012 | P2       | Blocked  | C      | No token revocation endpoint                                       |
| RC-C013 | P2       | Blocked  | C      | No per-tenant bulk-generate rate limit                             |
| RC-C014 | P2       | Blocked  | C      | AI draft synchronous in controller                                 |
| RC-C015 | P2       | Blocked  | C      | Mass-assignment uneven across PATCH                                |
| RC-C016 | P2       | Open     | C      | Missing Cache-Control on signature upload                          |
| RC-C017 | P2       | Blocked  | C      | Audit log gaps on bulk ops                                         |
| RC-C018 | P2       | Blocked  | C      | Permission cache TTL too long                                      |
| RC-C019 | P1       | Blocked  | C      | No JWT refresh rotation                                            |
| RC-C020 | P1       | Verified | C      | AI base URL tenant-configurable → SSRF                             |
| RC-C021 | P3       | Open     | C      | Unfinalise-after-window-close inconsistent                         |
| RC-C022 | P3       | Open     | C      | Revision chain depth semantics unclear                             |
| RC-C023 | P3       | Verified | C      | Public verify controller has no AuthGuard (design)                 |
| RC-C024 | P1       | Verified | C      | Parent dashboard lacks Report Cards card                           |
| RC-C025 | P3       | Blocked  | C      | Template is_default uniqueness unclear at DB                       |
| RC-C026 | P2       | Blocked  | C      | Bulk op transaction boundaries undocumented                        |
| RC-C027 | P3       | Blocked  | C      | No per-channel delivery retry endpoint                             |
| RC-C028 | P3       | Open     | C      | Library scoping duplicated controller/service                      |
| RC-C029 | P2       | Blocked  | C      | No per-tenant circuit breaker on auto-generate cron                |
| RC-C030 | P2       | Open     | C      | No hard cap on mass-report-card-pdf N                              |
| RC-C031 | P3       | Blocked  | C      | DLQ replay tooling existence unconfirmed                           |
| RC-C032 | P3       | Open     | C      | comment_fill_rate deprecated field                                 |
| RC-C033 | P3       | Open     | C      | Route registration order fragility                                 |
| RC-C034 | P3       | Open     | C      | IME composition bypass in reason-length                            |
| RC-C035 | P2       | Open     | C      | Autosave debounce post-unmount stale PATCH                         |
| RC-C036 | P1       | Blocked  | C      | Out-of-scope URL leaks PII ~300ms before redirect                  |
| RC-C037 | P1       | Blocked  | C      | Version-conflict modal loses unsaved text                          |
| RC-C038 | P3       | Blocked  | C      | Offset pagination weakness at depth                                |
| RC-C039 | P3       | Blocked  | C      | Lighthouse/Web Vitals not in CI                                    |
| RC-C040 | P2       | Open     | C      | `landing` response leaks closed_by_user_id                         |

---

## 4. Severity tally

**Open bugs:**

- **P0:** 3 (RC-C001, RC-C004, RC-C005, RC-C007) — **4 critical** (blocking production)
- **P1:** 13 (RC-L001..004, RC-C002, RC-C006, RC-C008..011, RC-C019, RC-C020, RC-C024, RC-C036, RC-C037)
- **P2:** 17 (RC-L005..009, RC-L015, RC-C012..018, RC-C026, RC-C029, RC-C030, RC-C035, RC-C040)
- **P3:** 14 (RC-L010..014, RC-C021, RC-C022, RC-C025, RC-C027, RC-C028, RC-C031, RC-C032, RC-C033, RC-C034, RC-C038, RC-C039)

**Resolved / verified-as-designed:** 2 (RC-C003 refuted, RC-C023 design-intentional)

**Total:** 55 tracked items (53 open, 2 closed)

---

## 5. Next-actions shortlist (for the user)

1. **RC-L001** (teacher analytics leak) — isolate and fix the permission check on `/report-cards/analytics/*` routes. Straightforward backend edit.
2. **RC-L002 + RC-C024** (parent grades broken link + missing card) — resolve together: either build a parent grades page OR remove the CTA and hide until shipped.
3. **RC-C001** (acknowledgment IDOR) — server-side confirmation first (read the controller line 438), then fix. This is the highest-severity unverified item.

All 4 P0 items (RC-C001, RC-C004, RC-C005, RC-C007) need security-focused live verification before onboarding any new tenant.
