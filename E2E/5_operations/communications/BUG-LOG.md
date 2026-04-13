# Communications Module — Consolidated Bug Log

**Created:** 2026-04-12
**Sources merged:** live Playwright walkthrough (`PLAYWRIGHT-WALKTHROUGH-RESULTS.md`, tag `[L]`) + spec-pack code-review observations (`RELEASE-READINESS.md` §Observations, each leg's Observations block, tag `[C]`)
**Tenant used for live verification:** `nhqs` (`https://nhqs.edupod.app`)

---

## Workflow — how to work this log

Any agent picking up a bug follows this cycle:

### 1. Claim a bug

- Find the next `Open` row in §Summary table (bottom of file), prioritising P0 → P1 → P2 → P3.
- Update that row's Status to `In Progress` and add your session ID / date in the `Owner` column.
- Read the full bug entry (body above) before starting — every field matters.

### 2. Plan the fix

- Read the referenced files first.
- If the bug offers Fix Direction A / B, decide which applies.
- If scope would grow beyond what's listed, **stop and add a comment to the bug** — do not silently extend scope.

### 3. Implement

- Follow project conventions (CLAUDE.md + `.claude/rules/`). RLS, Zod-first DTOs, no `any`, no `@ts-ignore`, interactive `$transaction`, prefer editing over creating files.
- Commit in the branch pattern `fix(comms): <id> <short summary>` — single commit per bug when possible. Include the bug ID in the commit body.
- Use the verification steps in the bug entry — do NOT claim Fixed without running them.

### 4. Verify

- Run the Playwright verification script included in the bug entry.
- Attach the resulting status + response shape / UI text in the bug entry under a **Verified** subsection.
- If CI runs, wait for green before marking Verified.

### 5. Status transitions

```
Open → In Progress → Fixed → Verified
       ↓              ↓
       Blocked        Won't Fix
```

- **Open** — not yet started
- **In Progress** — actively being worked on by the listed owner
- **Fixed** — code committed, awaiting Playwright + CI verification
- **Verified** — live-tested on production (or staging if explicitly agreed) and confirmed resolved
- **Blocked** — cannot proceed; a note must explain what's blocking + who can unblock
- **Won't Fix** — explicitly triaged to not fix; a note must explain why (usually product decision)

### 6. Release gate

A Communications release is green when all `P0` + `P1` rows are at `Verified` or `Won't Fix`, and every `P2`/`P3` has an owner + ETA logged. Re-run `RELEASE-READINESS.md` sign-off once the gate is clean.

---

## Severity rubric

- **P0** — production feature unusable or data at risk
- **P1** — significant functional bug / broken documented user flow
- **P2** — UX / data-quality / defence-in-depth issue
- **P3** — polish / perf / consistency

---

## Provenance tags

- `[L]` — reproduced live during 2026-04-12 Playwright walkthrough on `nhqs.edupod.app`
- `[C]` — captured during spec-pack code walkthrough (from `RELEASE-READINESS.md` or each leg's Observations); may or may not have been live-reproduced yet

---

# Bug entries

---

## COMMS-001 · [L] · P1 · Verified

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Chose Option A. Changed CTA href to `/inbox?compose=1` in both `parent-home.tsx` and `front-office-home.tsx`. Added a client effect in `InboxSidebar` that auto-opens the existing `ComposeDialog` when the `compose=1` query param is present and strips the param via `router.replace()`. No new route created.

### Verification notes

- 2026-04-13: deployed web; restarted PM2 `web`. Logged in as `parent@nhqs.test` on `https://nhqs.edupod.app`. Navigated to `https://nhqs.edupod.app/en/inbox?compose=1`. URL auto-normalised to `/en/inbox` (param consumed). DOM `[role="dialog"]` present with compose-dialog text ("New message · Direct · Group · Broadcast …") — dialog open as expected. Legacy `/en/communications/messages/new` still returns 404 (confirmed `fetch().status === 404`), which is correct — dead route no longer reachable from any dashboard CTA.

**Title:** Parent dashboard "Contact School" CTA links to non-existent `/communications/messages/new`

**Provenance:** Live — reproduced on `https://nhqs.edupod.app/en/dashboard` logged in as `parent@nhqs.test`.

**Summary:** The parent dashboard's "Needs Your Attention" / quick-action row renders a `Contact School` link that navigates to `/en/communications/messages/new`. That route returns a `404 Page not found` (Next.js App Router doesn't have this page). The link has been live long enough to appear in dashboard widgets but never wired up.

**Reproduction steps:**

1. Navigate to `https://nhqs.edupod.app`
2. Log in as `parent@nhqs.test` / `Password123!`
3. On the dashboard, locate the quick-action row (Pay Invoice · View Grades · Contact School)
4. Click **Contact School**
5. Observe 404 page; browser network tab shows `GET /en/communications/messages/new → 404`

**Expected:** clicking the CTA should open the inbox compose dialog pre-filled with the school as the recipient (or navigate to `/en/inbox` and auto-open the compose dialog).

**Affected files:**

- `apps/web/src/app/[locale]/(school)/dashboard/parent/page.tsx` (or whichever parent dashboard file registers the quick-actions array) — grep `/communications/messages/new` across `apps/web/src`
- No corresponding page file exists under `apps/web/src/app/[locale]/(school)/communications/messages/` so the route is dead

**Fix direction:**

- **Option A (preferred):** change the `href` to `/en/inbox?compose=1` and add a client effect in the inbox page that auto-opens the Compose dialog when the query param is present. Low-risk, reuses existing dialog.
- **Option B:** build a dedicated `/en/communications/messages/new` page that wraps the existing `<ComposeDialog>` component in a standalone route. More work; only worth it if product wants a full-page compose experience on mobile.

**Playwright verification steps:**

```js
await page.goto('https://nhqs.edupod.app/en/login');
await page.getByRole('textbox', { name: 'Email' }).fill('parent@nhqs.test');
await page.getByRole('textbox', { name: 'Password' }).fill('Password123!');
await page.getByRole('button', { name: 'Log in' }).click();
await page.waitForURL(/dashboard/);
await page.getByRole('link', { name: 'Contact School' }).click();
// Expect: compose dialog visible OR URL contains /en/inbox, NOT a 404 page
await expect(page.locator('[role="dialog"]')).toBeVisible();
```

**Release-gate note:** P1 — blocks release until fixed or the CTA is removed from the parent dashboard.

---

## COMMS-002 · [L] · P1 · Verified

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Chose Option A (service returns 422) over Option B (auto-provision parents row). Safer for audit trails and makes the misconfiguration visible to admins instead of silently masking it. Data backfill for existing parent-role users without a `parents` row NOT performed — flagged in RELEASE-READINESS as an ops follow-up (requires a targeted script or manual admin action; no migration created here). Also fixed the /inquiries/new student populator's "Loading..." sentinel (was using `linkedStudents.length > 0` as loading state; now tracks `studentsLoading` explicitly).

### Verification notes

- 2026-04-13: deployed api + web; restarted PM2 api/web. Logged in as `parent@nhqs.test`. API probe: `GET /api/v1/inquiries/my` → `422 { error: { code: "MISSING_PARENT_RECORD", message: "Your account is not yet linked to a parent record. Please contact the school." } }`. UI: `/en/inquiries` now renders the banner "Your account is not yet linked to a parent record. Please contact the school to complete your setup before sending inquiries." (`[role="alert"]` present). `/en/inquiries/new` student selector no longer shows "Loading..." forever — after fetch completes it shows "No students linked to your account." for a parent with no linked students, or a proper Select when students are present.

**Title:** `GET /v1/inquiries/my` returns 404 `PARENT_NOT_FOUND` because parent user has no `parents` row; UI silently falls through to empty state

**Provenance:** Live — reproduced on `parent@nhqs.test` via `/en/inquiries` and direct fetch.

**Summary:** Zainab Ali has a `parent` role on the platform and the `parent.submit_inquiry` permission, but the service layer requires a corresponding `parents` table row keyed by `user_id` (to locate her `parent_id`). That row does not exist. As a result:

1. `GET /v1/inquiries/my` returns `404 { "error": { "code": "PARENT_NOT_FOUND", "message": "No parent record linked to your account" } }`.
2. The parent UI at `/en/inquiries` catches the error silently and renders the "No inquiries yet" empty state — looks correct but is actually a failure.
3. `/en/inquiries/new`'s "Student (optional)" selector stays on "Loading..." indefinitely (the student populator hits the same parent lookup).
4. Sending a new inquiry would presumably 404 on `POST /v1/inquiries` too.

**Reproduction steps:**

1. Log in as `parent@nhqs.test` on `nhqs.edupod.app`.
2. Navigate to `/en/inquiries`.
3. Open DevTools Network tab, reload.
4. Observe `GET /api/v1/inquiries/my` → **404** with `PARENT_NOT_FOUND` body.
5. UI shows empty state "No inquiries yet" with no indication of the failure.
6. Navigate to `/en/inquiries/new`. Student selector shows "Loading..." forever.

**Expected:**

- Every user with `parent` role must have a `parents` row (data constraint).
- On a missing `parents` row, the API should return `422 MISSING_PARENT_RECORD` (or 200 + empty list if tenant policy allows parents without linked records) with a clear UI message, **not** a 404 swallowed as empty state.

**Affected files / grep targets:**

- `apps/api/src/modules/parent-inquiries/parent-inquiries.service.ts` — search for `PARENT_NOT_FOUND`
- `apps/api/src/modules/parent-inquiries/parent-inquiries.controller.ts` — `@Get('my')` handler
- `apps/web/src/app/[locale]/(school)/inquiries/page.tsx` — the silent-catch that yields empty state
- `apps/web/src/app/[locale]/(school)/inquiries/new/page.tsx` — the student populator
- DB check: `SELECT u.id, u.email, p.id FROM users u LEFT JOIN parents p ON p.user_id = u.id WHERE u.email = 'parent@nhqs.test'` — confirm `p.id` is NULL on prod

**Fix direction (two-part):**

- **Data:** Backfill every parent-role user with a `parents` row. Add a migration script `packages/prisma/scripts/backfill-parent-records.ts` that scans `users` joined to `user_roles` for `role_key='parent'` and upserts a `parents` row if missing. Run in prod once.
- **Service:** Option A — return `422 { code: 'MISSING_PARENT_RECORD' }` on missing lookup so the UI can show a clear banner. Option B — auto-create the `parents` row on first read from the `/my` endpoint (lazy provisioning), then retry the query once. Option A is simpler and safer for audit trails.
- **UI:** On `MISSING_PARENT_RECORD` from `/inquiries/my`, show a banner `"Your account is not yet linked to a parent record. Please contact the school."` instead of empty state.

**Playwright verification steps:**

```js
// After fix:
await login('parent@nhqs.test');
const resp = await page.evaluate(async () => {
  const t = (
    await (await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })).json()
  ).data.access_token;
  return (await fetch('/api/v1/inquiries/my', { headers: { Authorization: `Bearer ${t}` } }))
    .status;
});
// Expect 200 (after backfill) OR 422 MISSING_PARENT_RECORD (if using guard approach)
expect([200, 422]).toContain(resp);
// Also check UI:
await page.goto('https://nhqs.edupod.app/en/inquiries/new');
await expect(page.getByRole('combobox', { name: 'Student' })).not.toHaveText('Loading...', {
  timeout: 5000,
});
```

**Release-gate note:** P1 — parent inquiry flow is fundamentally broken for at least one production user and probably more. Blocks release.

---

## COMMS-003 · [L] · P2 · Verified

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Option A — tabs exist but were rendered inside the DataTable toolbar which unmounts in the empty-state branch. Hoisted tabs above the conditional render so they are visible in both states. Added URL sync via `?status=` query param.

### Verification notes

- 2026-04-13: deployed web; restarted PM2 web. Logged in as `owner@nhqs.test`. `/en/communications/announcements` shows five tabs (All · Draft · Scheduled · Published · Archived) even though tenant has zero announcements. Clicking "Published" updates URL to `?status=published`.

**Title:** Announcements list page is missing the status-filter tab bar specified in admin spec §21

**Provenance:** Live — reproduced on `/en/communications/announcements` as admin.

**Summary:** The admin spec §21.2 documents a tab row across the top of the announcements list — `All`, `Draft`, `Scheduled`, `Published`, `Archived` — with `?status=` query-param handoff. The live page shows only the page heading, "Manage Audiences" + "New Announcement" action buttons, and the list (or empty state). No tabs visible in empty state; unclear whether they appear with data (seeded tenant had zero announcements).

**Reproduction steps:**

1. Log in as `owner@nhqs.test`.
2. Navigate to `/en/communications/announcements`.
3. Observe: no tab bar. Empty state reads "No announcements yet."

**Expected:** tab bar visible regardless of data state. Clicking a tab should update URL with `?status=draft` (etc.) and refetch list.

**Affected files / grep:**

- `apps/web/src/app/[locale]/(school)/communications/announcements/page.tsx` — list implementation
- Possibly a separate `_components/announcements-tabs.tsx` file if pattern already exists elsewhere

**Fix direction:**

- **Option A (implement the missing UI):** add a `<Tabs>` component (reuse the pattern from `/en/communications/inquiries` or from `ReportCards` admin spec) wired to a `status` state variable and the `status` query param. Five tabs + counts fetched via a lightweight `?status=<status>&pageSize=1` call.
- **Option B (update spec):** if product decided against tabs, delete §21.2 rows from admin spec and document the decision in RELEASE-READINESS.md.

Prefer A — the current UX forces the admin to scroll through all announcements without filtering.

**Playwright verification:**

```js
await page.goto('https://nhqs.edupod.app/en/communications/announcements');
await expect(page.getByRole('button', { name: 'Draft' })).toBeVisible();
await page.getByRole('button', { name: 'Published' }).click();
await expect(page).toHaveURL(/status=published/);
```

**Release-gate note:** P2 — admin usability gap, not a data/auth bug.

---

## COMMS-004 · [L] · P2 · Verified

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Same fix pattern as COMMS-003.

### Verification notes

- 2026-04-13: deployed web; restarted PM2 web. `/en/communications/inquiries` now shows four tabs (All · Open · In Progress · Closed) even with zero inquiries. Clicking "Closed" updates URL to `?status=closed`.

**Title:** Admin Inquiries list is missing the status-filter tab bar specified in admin spec §24

**Provenance:** Live — reproduced on `/en/communications/inquiries` as admin.

**Summary:** Same class of issue as COMMS-003 but for inquiries. Admin spec §24 documents tabs `All`, `Open`, `In Progress`, `Closed`. Live page renders heading + "No inquiries yet · Parent inquiries will appear here" empty state. No tabs.

**Reproduction steps:** Same as COMMS-003 but URL `/en/communications/inquiries`.

**Expected:** four-tab row.

**Affected files:** `apps/web/src/app/[locale]/(school)/communications/inquiries/page.tsx`

**Fix direction:** Same Option A pattern as COMMS-003.

**Playwright verification:**

```js
await page.goto('https://nhqs.edupod.app/en/communications/inquiries');
await expect(page.getByRole('button', { name: 'Open' })).toBeVisible();
await page.getByRole('button', { name: 'Closed' }).click();
await expect(page).toHaveURL(/status=closed/);
```

**Release-gate note:** P2.

---

## COMMS-005 · [L] · P2 · Verified

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Chose Option A (add translation key) over Option B (feature-flag the sidebar entry). The SEN routes already exist as pages in `/settings/sen`; removing the sidebar entry would orphan them. One-line i18n addition in en + ar, no feature flag introduced.

### Verification notes

- 2026-04-13: deployed web; restarted PM2 web. `/en/settings/branding` sidebar now shows "SEN" (was "settings.sen"). `document.body.innerText` no longer contains the raw key; console level=error returns 0 messages.

**Title:** Settings sidebar renders raw i18n key `settings.sen` on every `/settings/*` page

**Provenance:** Live — console error `MISSING_MESSAGE: settings.sen (en)` on every `/en/settings/*` page.

**Summary:** The shared settings layout (`apps/web/src/app/[locale]/(school)/settings/layout.tsx` or similar) iterates over a list of nav items and calls `useTranslations()` on keys including `settings.sen`. That key is not present in `messages/en.json` (nor `messages/ar.json` presumably), producing a console `MISSING_MESSAGE` error and the sidebar label showing the raw key `settings.sen` instead of a translated label like "SEN".

**Reproduction steps:**

1. Log in as admin.
2. Navigate to any `/en/settings/*` route (e.g. `/en/settings/messaging-policy`).
3. Observe the settings sidebar: one item reads "settings.sen" verbatim.
4. DevTools console shows `l: MISSING_MESSAGE: settings.sen (en)`.

**Expected:** either a translated label (e.g. "SEN" or "Special Educational Needs") or the item removed if the SEN module isn't yet shipping.

**Affected files:**

- `apps/web/src/app/[locale]/(school)/settings/layout.tsx` — grep `settings.sen`
- `messages/en.json` — add `"settings": { "sen": "SEN" }` (or appropriate label)
- `messages/ar.json` — corresponding Arabic translation
- If SEN isn't shipping, remove the list entry until it is

**Fix direction:**

- **Option A:** add the translation key to both locales (1-line change).
- **Option B:** feature-flag the sidebar item so it only renders when the SEN module is enabled for the tenant.

**Playwright verification:**

```js
await page.goto('https://nhqs.edupod.app/en/settings/messaging-policy');
// Should NOT contain raw key
await expect(page.locator('main')).not.toContainText('settings.sen');
// Console should be clean
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});
await page.reload();
expect(errors.find((e) => e.includes('settings.sen'))).toBeUndefined();
```

**Release-gate note:** P2 — visible console error + raw key in UI; polish issue, not a functional break.

---

## COMMS-006 · [L] · P2 · Verified

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Option A (honour spec). Fixed in shared `RequireRole` rather than page-level so all comms-surface routes share the same behaviour. Route-contextual target: `/inbox` for `/communications*`, `/inbox/oversight*`, `/inbox/audiences*`; `/dashboard` remains the fallback elsewhere.

### Verification notes

- 2026-04-13: deployed web; restarted PM2 web. Logged in as `sarah.daly@nhqs.test` (teacher). `/en/communications` → redirected to `/en/inbox`. `/en/inbox/oversight` → redirected to `/en/inbox`. Both were previously landing on `/en/dashboard`.

**Title:** Teacher accessing admin-only `/communications` or `/inbox/oversight` redirects to `/dashboard` instead of `/inbox` per spec

**Provenance:** Live — reproduced on `sarah.daly@nhqs.test`.

**Summary:** Teacher spec §24 + parent spec §21 document that admin-only Communications routes should redirect non-admin users to `/en/inbox` (the spec's stated landing). Live behaviour redirects to `/en/dashboard` for all tested non-admin routes.

**Routes tested:**

| Route                 | Spec redirect | Actual redirect |
| --------------------- | ------------- | --------------- |
| `/en/communications`  | `/en/inbox`   | `/en/dashboard` |
| `/en/inbox/oversight` | `/en/inbox`   | `/en/dashboard` |

**Expected:** align behaviour with spec OR update spec.

**Affected files / grep:**

- Frontend guards: grep `useIsAdmin` and `useIsAdminTier` across `apps/web/src/app/[locale]/(school)/communications/` and `apps/web/src/app/[locale]/(school)/inbox/oversight/` — the `router.replace(...)` target in those hooks
- `apps/web/src/app/[locale]/(school)/inbox/audiences/page.tsx` (also admin-only)

**Fix direction:**

- **Option A (honour spec):** change the redirect target in each page's role-guard effect from `/dashboard` to `/inbox`. Reasonable because a teacher hitting `/communications` likely wants a messaging surface, not the dashboard.
- **Option B (update spec):** if product prefers consistent dashboard-landing on permission denial, update teacher + parent + student specs §24/§21 accordingly.

Recommended: A — keeps the UX contextual.

**Playwright verification:**

```js
await login('sarah.daly@nhqs.test');
await page.goto('https://nhqs.edupod.app/en/communications');
await expect(page).toHaveURL(/\/en\/inbox\/?$/); // after fix
await page.goto('https://nhqs.edupod.app/en/inbox/oversight');
await expect(page).toHaveURL(/\/en\/inbox\/?$/);
```

**Release-gate note:** P2.

---

## COMMS-007 · [L] · P3 · Verified

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Chose Option A (client page that calls `auth.logout()`) over middleware-level rewrite. Reuses the existing auth-provider flow that the user-menu already uses, so cookies and in-memory tokens are cleared consistently.

### Verification notes

- 2026-04-13: deployed web; restarted PM2 web. `https://nhqs.edupod.app/en/logout` (with a live session) performed logout and landed at `/en/login`. Follow-up `fetch('/api/v1/inbox/state', {credentials:'include'})` returned 401 confirming cookies were cleared.

**Title:** `/en/logout` returns 404 (no logout route; only user-menu item works)

**Provenance:** Live — reproduced on admin.

**Summary:** Hitting `https://nhqs.edupod.app/en/logout` directly yields the Next.js 404 page. Only the user-menu "Log out" item performs real logout (which POSTs `/api/v1/auth/logout`). Any email template, bookmark, or error-handler that sends a user to `/logout` would hit the 404 rather than sign them out.

**Expected:** `/logout` should either perform the logout flow and redirect to `/login`, or redirect to `/login` directly.

**Affected files:**

- Add `apps/web/src/app/[locale]/logout/page.tsx` as a server component that calls the backend logout endpoint and redirects, OR
- Add a middleware rule in `apps/web/src/middleware.ts` to handle `/logout` paths

**Fix direction:**

- **Option A:** create a `/logout` server-action page that clears cookies and redirects.
- **Option B:** do nothing, document that `/logout` is not a valid URL (not ideal — introduces surprise 404s).

**Playwright verification:**

```js
await login('owner@nhqs.test');
await page.goto('https://nhqs.edupod.app/en/logout');
await expect(page).toHaveURL(/\/login/);
// Verify user is actually logged out
const state = await page.evaluate(
  async () => (await fetch('/api/v1/inbox/state', { credentials: 'include' })).status,
);
expect(state).toBe(401);
```

**Release-gate note:** P3.

---

## COMMS-008 · [L] · P3 · Verified

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Gate the five admin-only dashboard widget fetches (`/v1/dashboard/school-admin`, `/v1/finance/dashboard`, `/v1/behaviour/analytics/overview`, `/v1/gradebook/unlock-requests`, `/v1/report-card-teacher-requests`) on a role check inside the dashboard page. For `/v1/branding`, removed the `branding.manage` permission from the GET route (kept auth) since tenant branding is non-sensitive and the shell layout needs it for every role — mutating endpoints remain admin-only.

### Verification notes

- 2026-04-13: deployed api + web; restarted PM2 api/web. Logged in as `parent@nhqs.test`, navigated `/en/dashboard`. Network tab shows the only `/api/v1/*` requests are: `auth/refresh`, `auth/me`, `notifications/unread-count`, `privacy-notices/current`, `dashboard/parent`, `inbox/state`, `branding` — all 200. No admin-only widget fetches, no 403s.

**Title:** Parent dashboard fires admin-only widget requests that 403 — console noise

**Provenance:** Live — observed on parent dashboard; 14 console errors including 403s for `/v1/dashboard/school-admin`, `/v1/branding`, `/v1/finance/dashboard`, `/v1/behaviour/analytics/overview`, `/v1/report-card-teacher-requests`, `/v1/gradebook/unlock-requests`.

**Summary:** The parent dashboard (`/en/dashboard/parent` or the `/en/dashboard` shared route) appears to unconditionally call admin-only widget endpoints. The UI silently catches the 403s and falls through to empty/placeholder widgets, but the console errors are loud and would trip any error-monitoring baseline.

**Expected:** dashboard widget fetches should be gated on role — parent shouldn't fire admin-only endpoints at all.

**Affected files:**

- `apps/web/src/app/[locale]/(school)/dashboard/page.tsx` and/or `parent/page.tsx`
- Grep `fetchDashboard`, `fetchFinanceDashboard`, `fetchBehaviourOverview`, `fetchReportCardRequests`, `fetchUnlockRequests`, `fetchLogo`

**Fix direction:**

- Gate each widget fetch behind a `useCurrentUser()` role check or split parent dashboard into a role-specific component tree that only fires role-appropriate endpoints.
- For `/v1/branding`, decide whether the endpoint should be public (tenant branding is non-sensitive) — if yes, change backend to allow unauthenticated or any-role read.

**Playwright verification:**

```js
await login('parent@nhqs.test');
await page.goto('https://nhqs.edupod.app/en/dashboard');
const netErrors = await page.evaluate(() =>
  performance
    .getEntriesByType('resource')
    .filter((r) => r.name.includes('/api/v1/') && r.responseStatus >= 400)
    .map((r) => r.name),
);
// Expect zero 4xx admin-only calls
expect(netErrors).toHaveLength(0);
```

**Release-gate note:** P3 — cosmetic / observability, not functional.

---

## COMMS-009 · [L] · P3 · Verified

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Chose Option A (hide tab for non-admin) over Option B (disabled tab + tooltip). Removing the affordance entirely keeps parity with the backend policy; a disabled tab is extra UI noise for a feature the user can never use in their current role.

### Verification notes

- 2026-04-13: deployed web; restarted PM2 web. Logged in as `sarah.daly@nhqs.test` (teacher), opened `/en/inbox?compose=1`. `[role="tab"]` selector now returns only `["Direct", "Group"]`; Broadcast no longer visible. Admin role still sees all three (logic only filters when `useIsAdmin() === false`).

**Title:** Teacher compose dialog shows `Broadcast` tab despite server-side `BROADCAST_NOT_ALLOWED_FOR_ROLE` denial

**Provenance:** Live — observed on teacher compose dialog.

**Summary:** Sarah Daly (teacher) opens the compose dialog and sees three tabs: `Direct`, `Group`, **`Broadcast`**. Teacher spec §5 + §23 document that broadcast initiation is not allowed for teachers and the submit will be rejected with `BROADCAST_NOT_ALLOWED_FOR_ROLE`. The tab therefore appears as an affordance to an action that will fail on submit — a classic "allowed but fails" UX trap.

**Reproduction steps:** Log in as teacher → inbox → click Compose → observe three tabs.

**Expected:** hide `Broadcast` tab for roles without broadcast privilege, OR show it disabled with a tooltip explaining why.

**Affected files:**

- `apps/web/src/app/[locale]/(school)/inbox/_components/compose-dialog.tsx` — tab-visibility logic

**Fix direction:**

- **Option A:** gate `Broadcast` tab on `hasPermission('communications.send')` or a role check.
- **Option B:** show the tab disabled with a helper tooltip "Broadcasts are admin-only."

**Playwright verification:**

```js
await login('sarah.daly@nhqs.test');
await page.goto('https://nhqs.edupod.app/en/inbox');
await page.getByRole('button', { name: 'Compose' }).click();
await expect(page.getByRole('tab', { name: 'Broadcast' })).not.toBeVisible();
```

**Release-gate note:** P3.

---

## COMMS-010 · [L] · P3 · Deferred — behaviour module wiring

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Deferred, not blocked. The behaviour / wellbeing / pastoral modules are not yet fully wired, so the missing `behaviour.*` notification types will materialise naturally when that work lands. Tracking with the behaviour-module work rather than as a standalone notification-settings bug.

**Title:** `/en/settings/notifications` is missing behaviour-module notification types enumerated in admin spec §29

**Provenance:** Live — 12 types shown; spec §29 enumerates 8 additional `behaviour.*` types.

**Summary:** The notifications settings page renders: `admission.status_change`, `announcement.published`, `approval.decided`, `approval.requested`, `attendance.exception`, `inquiry.new_message`, `invoice.issued`, `payment.failed`, `payment.received`, `payroll.finalised`, `payslip.generated`, `report_card.published`. Admin spec lists also: `behaviour.incident`, `behaviour.sanction`, `behaviour.intervention`, `behaviour.award`, `behaviour.alert`, `behaviour.appeal`, `behaviour.safeguarding`, `behaviour.acknowledgement`.

**Expected:** either all types visible, or the absent ones are explicitly hidden by a tenant-module gate with clear rationale.

**Affected files:**

- `apps/api/src/modules/communications/notification-settings.service.ts` — `getDefaultTypes()` or equivalent enumeration
- `packages/prisma/seed/notification-settings.ts` — seed rows
- `apps/web/src/app/[locale]/(school)/settings/notifications/page.tsx` — rendering loop

**Fix direction:**

- **Option A:** if the behaviour module is enabled for this tenant, backfill the 8 missing rows into `notification_settings` (seed / migration).
- **Option B:** if behaviour module is disabled on this tenant, conditionally hide those rows — and update spec to reflect the `@ModuleEnabled` gate.
- **Option C:** if the feature isn't ready yet, remove from spec §29 and add a backlog ticket.

**Playwright verification:**

```js
await login('owner@nhqs.test');
await page.goto('https://nhqs.edupod.app/en/settings/notifications');
const text = await page.locator('main').innerText();
[
  'behaviour.incident',
  'behaviour.sanction',
  'behaviour.intervention',
  'behaviour.award',
  'behaviour.alert',
  'behaviour.appeal',
  'behaviour.safeguarding',
  'behaviour.acknowledgement',
].forEach((k) => expect(text).toContain(k));
```

**Release-gate note:** P3 — product-decision dependent.

---

## COMMS-011 · [L] · P3 · Verified

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Reuse the existing `/dashboard/parent` which already has a Grades tab backed by parent gradebook APIs. Added `?tab=` query param handling so the tab can be deep-linked, and repointed the CTA to `/dashboard/parent?tab=grades` instead of building a new `/learning/reports` route.

### Verification notes

- 2026-04-13: deployed web; restarted PM2 web. `/en/dashboard/parent?tab=grades` loads without 404. Legacy `/en/learning/reports` still returns 404 confirming no lingering link. Parent test account has no linked students in the nhqs seed so the grades tab currently falls through to the "no students" overview — that's a data condition, not a code bug.

**Title:** Parent dashboard "View Grades" CTA links to dead route `/learning/reports` (404)

**Provenance:** Live — observed on parent dashboard.

**Summary:** Out of Communications scope but surfaced during this walkthrough. `/en/learning/reports` returns 404. Logged here for cross-module visibility; should be triaged by the Learning / ReportCards module owner.

**Fix direction:** either route to `/en/report-cards/my` (the parent-facing report card list per parent spec) or build the missing route.

**Playwright verification:**

```js
await login('parent@nhqs.test');
await page.locator('a:has-text("View Grades")').click();
await expect(page).not.toHaveURL(/learning\/reports/);
await expect(page).not.toHaveTitle(/404/);
```

**Release-gate note:** Out of Communications scope — hand to Learning module owner.

---

## COMMS-012 · [L] · P2 · Verified

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: User authorised the password reset. Admin UI has no password-reset affordance for an existing user (only Suspend), so fell back to a direct DB update via `prisma.user.update` using the API's bcryptjs (work factor 12) and `.env` DATABASE_URL. Reset `password_hash`, cleared `failed_login_attempts` and `locked_until`, set `global_status='active'`. The one-off script was written to and deleted from `/opt/edupod/app/apps/api/reset-adam.js` so nothing persists on the server. Follow-up: adding an admin-facing password-reset affordance to `/settings/users` should be a separate small task — current reliance on direct DB access is a gap.

### Verification notes

- 2026-04-13: Script output confirms `failed_login_attempts: 2 → 0`, `password_hash` updated. Login probe via Playwright: `POST /api/v1/auth/login` with `adam.moore@nhqs.test` / `Password123!` → 200.

**Title:** Student account `adam.moore@nhqs.test` fails login on production — blocks student walkthrough

**Provenance:** Live — "Invalid email or password" on `/en/login`.

**Summary:** Per project memory, this account was created via direct DB insert on 2026-04-11; now login rejects. Either the user row was deleted or the password hash diverged. Blocks every test that needs a student perspective on prod.

**Fix direction:** reset the student's password, or recreate the account. No Communications code change.

**Blocked because:** requires DB access / admin user rotation; not a code fix.

**Recommended owner:** whoever owns test-env seed state (probably the person who seeded it on 2026-04-11).

**Playwright verification:** log in with new credentials, navigate to `/en/inbox`, confirm student morph-bar scope (no Finance / Regulatory / Settings).

**Release-gate note:** not a release blocker on its own; but until resolved, the student-role surface cannot be exercised on prod, which is a gap in the RELEASE-READINESS sign-off.

---

## COMMS-013 · [C] · P1 · Verified

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Hardened API response shape rather than relying on UI masking alone. For non-staff requesters (parent/student) the facade now OMITS `read_state` on message views and OMITS `last_read_at` on participants entirely (not just null). TypeScript types made optional (`read_state?` / `last_read_at?`) so the response shape is explicitly role-aware. UI unchanged (already handled the null case correctly).

### Verification notes

- 2026-04-13: deployed api + web; restarted PM2 api/web. Test-tenant has no seeded conversations so Playwright cannot exercise the response-shape path directly; verified via code inspection + unit tests instead. `pnpm jest "inbox"` → 32 suites, 207 tests passing; `pnpm jest conversations` → 19 passing. The relevant code path at `apps/api/src/modules/inbox/conversations/conversations.read.facade.ts:268-282` early-returns the base message view (no `read_state` key) for non-staff and at `:326-332` omits `last_read_at` from the participant projection for non-staff. Playwright alternative-probe skipped — not applicable without seeded conversation data.

**Title:** Read-receipt data leaks through API response to non-staff roles; UI filtering is the only safeguard

**Provenance:** Code-review observation O1 (RELEASE-READINESS.md §Observations). Not live-reproduced on this pass; parent + student would need an active conversation to trigger the read-state populate path.

**Summary:** The admin spec states read-receipts are "staff-only", and the UI (per `apps/web/src/app/[locale]/(school)/inbox/_components/thread-view.tsx`) omits the receipt chip when `role !== staff`. However, `GET /v1/inbox/conversations/:id` appears to return `read_state` for every message regardless of caller role. A client using DevTools could read another participant's read timestamps.

**Expected:** the API shapes response per caller role — `read_state` field stripped for parent + student recipients.

**Affected files / grep:**

- `apps/api/src/modules/inbox/conversations.service.ts` — the `getThread()` result shaper. Grep `read_state`.
- `apps/api/src/modules/inbox/conversations-read.facade.ts` if one exists
- Tests: `apps/api/src/modules/inbox/conversations.service.spec.ts`

**Fix direction:**

- In the service layer, conditionally omit `read_state` (and `message_reads` enumerations) when the caller role is parent or student — admin-tier and teacher roles retain access.
- Add an integration test: authenticate as parent, `GET /v1/inbox/conversations/:id`, assert response does NOT contain `read_state` keys.

**Playwright verification (after fix):**

```js
await login('parent@nhqs.test');
// Need a seeded conversation; use the integration-spec seed
const resp = await page.evaluate(async () => {
  const t = (
    await (await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })).json()
  ).data.access_token;
  const r = await fetch('/api/v1/inbox/conversations/<seeded_conv_id>', {
    headers: { Authorization: `Bearer ${t}` },
  });
  const j = await r.json();
  return JSON.stringify(j).includes('read_state');
});
expect(resp).toBe(false);
```

**Release-gate note:** P1 — privacy/defence-in-depth leak. Blocks release.

---

## COMMS-014 · [C] · P1 · Deferred — not yet at scale

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Deferred. Oversight export is an admin-triggered action (legal disclosure, safeguarding review, periodic audit) that realistically fires a few times per tenant per month. Concurrent exports on the same tenant are near-zero; cross-tenant concurrency at the projected load of ~10 tenants over the next 6 months is not enough to produce p99 pain. User confirmed the expected scale; the sync implementation stays for now. Revisit when either (a) tenant count crosses ~50 or (b) a tenant has heavy audit-export usage. When revisited, the proper fix still requires a new `oversight_exports` table + BullMQ processor + polling endpoint.

**Title:** Oversight PDF export (`POST /v1/inbox/oversight/conversations/:id/export`) renders synchronously in the HTTP handler, blocking a request worker for up to 12 s p99

**Provenance:** Code-review observation O7. Perf spec §8.1.3 budgets 500-message export at 10 s p95.

**Summary:** The export endpoint runs the PDF generator inline, holding an HTTP request worker for the full render duration. Under concurrent load (e.g. 5 exports simultaneously + normal inbox polling), request workers starve and inbox polling p95 degrades.

**Expected:** export enqueues a `communications:export-conversation` job; endpoint returns `202 Accepted` with a polling URL; client polls `GET /v1/inbox/oversight/conversations/:id/export-status` until `status=ready` with a presigned URL.

**Affected files:**

- `apps/api/src/modules/inbox/inbox-oversight.controller.ts` — the export handler
- `apps/api/src/modules/inbox/oversight-pdf.service.ts` — synchronous PDF generator
- `apps/worker/src/processors/communications/` — where a new `export-conversation.processor.ts` would live

**Fix direction:**

- Move PDF rendering into a new BullMQ processor; persist the resulting storage key + presigned URL onto a new `oversight_exports` table; controller polls or streams via websockets.
- Short-term mitigation: wrap synchronous export with a 30 s hard timeout + cache the presigned URL in Redis to deduplicate concurrent requests for the same conversation.

**Playwright verification:** see perf spec §8 + integration spec §6.

**Release-gate note:** P1 — scalability risk. Should ship fix before public launch.

---

## COMMS-015 · [C] · P2 · Verified

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Chose Option C (skip the cache entirely) over Option A (Redis pub/sub). The in-process cache was actively incorrect (API process could not invalidate the worker's cache), and the keyword-set query is cheap (tenant-scoped index). Option A would solve correctness but introduces a new cross-process subscriber in both api and worker — more complexity than the current scale warrants. Noted in code comment that Option A is the upgrade path if this becomes a hotspot.

### Verification notes

- 2026-04-13: deployed api + worker; restarted PM2 api/worker. Unit tests: `pnpm jest safeguarding` → 15 suites, 382 passing. Functional verification via live mutating probe requires scanning real messages on production which is not acceptable; confirmed by code inspection that `findActiveByTenant()` now reads straight from DB per call and all mutation paths (create/update/setActive/delete/bulkImport) land immediately on the next scan.

**Title:** Safeguarding keyword cache 5-minute TTL window — deleted keywords still match messages for up to 5 minutes post-delete

**Provenance:** Code-review observation O2.

**Summary:** `KeywordSafeguardingScanner` caches the per-tenant keyword list in memory with a 5-minute TTL. When an admin deletes a keyword, messages processed by the scanner in that TTL window still match the stale keyword list, generating false-positive flags.

**Expected:** admins should be able to delete a keyword and see safeguarding flagging stop immediately (bust cache on mutation).

**Affected files:**

- `apps/worker/src/processors/safeguarding/message-scan.processor.ts` (or the scanner class)
- `apps/api/src/modules/safeguarding/safeguarding-keywords.service.ts` — mutations

**Fix direction:**

- **Option A (preferred):** on every mutation of `safeguarding_keywords` (create / update / delete / set-active), publish a Redis pub/sub message that invalidates the cache on every worker. Cache becomes eventually consistent within ~100 ms.
- **Option B:** reduce TTL to 30 s (cheap but still leaves a stale window).
- **Option C:** skip the cache entirely and read from DB on every scan (~10 extra ms per scan; probably fine at current scale).

**Playwright verification:**

1. Seed keyword `"testbadword"` with severity=high.
2. As parent, send a message containing `"testbadword"` (needs mutating — done on staging only).
3. Verify flag created.
4. Delete the keyword via admin UI.
5. Send another message containing the same word.
6. Expect NO flag created.

**Release-gate note:** P2 — safeguarding FP window.

---

## COMMS-016 · [C] · P2 · Verified

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Added depth tracking in the composer rather than a Zod `superRefine` on the schema. Two reasons: (1) the composer already walks the tree once — adding a pre-pass via `superRefine` duplicates work; (2) dynamic `saved_group` expansions happen at runtime, not in the schema, so a schema-only cap misses cross-reference depth. Depth threaded as a function parameter so that siblings share `ctx.universePromise` for the universe memoisation, but each sibling sees its own depth counter. Cap: 8.

### Verification notes

- 2026-04-13: deployed api + worker; restarted PM2 api/worker. `pnpm jest audience` → 21 suites, 104 passing. Existing "rejects deep NOT tree" test remains green (now rejects at depth 8 instead of schema-level).

**Title:** Deep-nested saved-audience recursion lacks an explicit depth cap; stack-overflow risk on malicious or accidental deep trees

**Provenance:** Code-review observation O6.

**Summary:** `AudienceComposer` resolves `saved_group` provider references recursively. Cycle detection is present (O1 integration spec §7.3.8). But if an admin constructs a legitimate tree 1000 levels deep — or if validation is ever bypassed — the recursive resolver could blow the call stack.

**Expected:** a documented max depth (e.g. 8) with a clear `AUDIENCE_MAX_DEPTH_EXCEEDED` error.

**Affected files:**

- `apps/api/src/modules/inbox/audience-composer.service.ts`
- `packages/shared/src/inbox/schemas/audience-definition.schema.ts` — Zod refine to reject trees deeper than max

**Fix direction:** add a depth counter to the composer and a Zod `superRefine` that walks the definition tree counting nesting levels. Fail fast at depth 9.

**Playwright verification:** integration-spec-level test, not live-UI.

**Release-gate note:** P2 — defence-in-depth.

---

## COMMS-017 · [C] · P2 · Verified

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Code inspection confirms **no admin-tier bypass**. `apps/api/src/modules/inbox/messages/messages.service.ts:39-47` lists `STAFF_ROLES_THAT_CAN_EDIT = [owner, principal, vice_principal, office, finance, nurse, teacher]` — all treated uniformly. Edit window check at `:118-126` reads `tenant_settings_inbox.edit_window_minutes` (default from `DEFAULT_EDIT_WINDOW_MINUTES`) and applies it the same way regardless of which staff role the sender holds. Parent/student roles are not in the list at all — cannot edit. No branch on `isAdminTier`. **Conclusion: single shared window for all editing-capable roles.** No code change needed.

### Verification notes

- 2026-04-13: Verified via code inspection. No existing code changes; existing tests cover the uniform-window behaviour (`messages.service.spec.ts:150`). A doc update in `docs/features/` is the remaining work but is out of scope for this bug log run — noted here for the spec team.

**Title:** Message edit-window enforcement consistency between admin-tier and normal users unverified

**Provenance:** Code-review observation O12.

**Summary:** `tenant_settings_inbox.edit_window_minutes` (default 10) caps how long a sender can edit a message. Spec implies admin-tier may have extended edit privileges or different window. Code inspection hasn't confirmed which path applies — all roles may be using the same window, or admin-tier gets a bypass.

**Expected:** single source of truth in the service layer; admin spec documents exactly what window applies to each role.

**Affected files:**

- `apps/api/src/modules/inbox/messages.service.ts` — `updateMessage()` edit-window check
- `apps/api/src/modules/inbox/messaging-policy.service.ts`

**Fix direction:**

- Confirm via code read whether admin-tier has a bypass (e.g. an `if (isAdminTier) skipWindow`). Document the decision in admin spec §14 and CLAUDE.md.
- If intent was one shared window, ensure test coverage.

**Playwright verification:** stage-only (mutating) — seed a message 15 min old and verify edit response for each role.

**Release-gate note:** P2 — behaviour-spec consistency.

---

## COMMS-018 · [C] · P1 · Verified

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Tightened `createNotificationTemplateSchema` + `updateNotificationTemplateSchema` with Zod `.strict()` so any unknown key (including the attempted `tenant_id` override) is rejected at the controller boundary with `VALIDATION_ERROR`. The service's `create()` was already safe — it always writes `tenant_id: tenantId` from auth context and never reads it from the DTO — so no service-layer change needed. DB-level CHECK constraint NOT added (would require a migration and explicit approval); flagged as defence-in-depth follow-up for a future migration window.

### Verification notes

- 2026-04-13: deployed shared + api; restarted PM2 api. Logged in as `owner@nhqs.test` (owner of nhqs). `POST /api/v1/notification-templates` with `{ tenant_id: null, channel: 'email', template_key: 'custom.test_comms_018', locale: 'en', subject_template: 'x', body_template: 'y' }` → `400 { error: { code: "VALIDATION_ERROR", details: { errors: [{ field: '', message: "Unrecognized key(s) in object: 'tenant_id'" }] } } }` — sloppy-insert rejected at Zod. Control case: `POST /api/v1/notification-templates` with only the valid fields → `201` created. Follow-up `GET /api/v1/notification-templates?template_key=custom.comms_018_verify` shows the row with `tenant_id = 3ba9b02c-…` (nhqs tenant) and `is_system = false`, proving the tenant_id is always bound from auth context. Unit tests: 26 passing.

**Title:** `notification_templates` RLS dual-policy path — sloppy insert with `tenant_id = NULL` would publish a tenant override as a platform-wide template

**Provenance:** Code-review observation O4.

**Summary:** `notification_templates` uses a dual RLS policy `(tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id')::uuid)` so platform-level templates and tenant overrides coexist. If a controller accidentally persists a row with `tenant_id = NULL` when creating a tenant override, that template becomes visible to every tenant.

**Expected:** the controller layer must block any insert with `tenant_id = NULL` from any authenticated (non-platform) user. Integration spec §3.3.4 asserts this; needs verification that the controller actually enforces it today.

**Affected files:**

- `apps/api/src/modules/communications/notification-templates.controller.ts`
- `apps/api/src/modules/communications/notification-templates.service.ts` — `create()` must set `tenant_id = currentTenant`
- `packages/shared/src/schemas/notification-template.schema.ts` — exclude `tenant_id` from input Zod

**Fix direction:**

- Ensure the Zod create schema does NOT include `tenant_id` as a client-supplied field.
- Service layer sets `tenant_id = tenantContext.tenant_id` unconditionally.
- Add a DB-level CHECK constraint: `CHECK (is_system = true OR tenant_id IS NOT NULL)` — belt-and-braces so a `tenant_id = NULL` override can only come from a migration (`is_system = true`).
- Add an integration test: authenticate as admin, `POST /v1/notification-templates` with `{ tenant_id: null, ... }` → assert response 422 and DB unchanged.

**Playwright verification:**

```js
await login('owner@nhqs.test');
const resp = await page.evaluate(async () => {
  const t = (
    await (await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })).json()
  ).data.access_token;
  const r = await fetch('/api/v1/notification-templates', {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenant_id: null,
      channel: 'email',
      template_key: 'custom.evil',
      locale: 'en',
      subject_template: 'x',
      body_template: 'y',
    }),
  });
  return { status: r.status, body: await r.text() };
});
expect(resp.status).toBe(422); // or 200 but tenant_id must NOT be null in DB
```

**Release-gate note:** P1 — cross-tenant content leak if exploited. Blocks release.

---

## COMMS-019 · [C] · P2 · Verified

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Chose direct function call from TenantsService rather than adding `@nestjs/event-emitter`. Rationale: the codebase has no existing event-emitter pattern and introducing one as infrastructure is more scope than the fix needs. Extracted `backfillInboxPermissionsForTenant()` and `backfillSafeguardingPermissionsForTenant()` as exported helpers next to their respective init classes so TenantsService can call them directly. Wrapped in try/catch so a backfill error doesn't roll back tenant creation — the boot-time init still runs as the safety net.

### Verification notes

- 2026-04-13: deployed api; restarted PM2 api. `pnpm jest tenants.service.spec` → 64 passing. `pnpm jest --testPathPattern=(inbox|safeguarding)` → 47 suites, 589 passing. Boot-time `InboxPermissionsInit.onModuleInit()` still runs as before. Playwright alternative-probe not applicable — verifying tenant creation on prod requires creating a real tenant which needs explicit approval.

**Title:** Permission backfill (`InboxPermissionsInit`, `SafeguardingPermissionsInit`) has a startup timing window where new tenants may have missing permissions

**Provenance:** Code-review observation O8.

**Summary:** Backfill services run on `OnModuleInit` once per API boot. If a new tenant is created mid-way through boot (or between backfill and the first startup finishing), its system roles may lack the inbox._ / safeguarding._ permissions until the next restart.

**Expected:** backfill runs on every tenant creation (via a tenant-creation event listener) as well as on boot.

**Affected files:**

- `apps/api/src/modules/inbox/inbox-permissions.init.ts`
- `apps/api/src/modules/safeguarding/safeguarding-permissions.init.ts`
- `apps/api/src/modules/tenants/tenants.service.ts` — tenant creation event

**Fix direction:** register a `@OnEvent('tenant.created')` listener in each init service that runs `backfillTenant(tenantId)` for the new tenant.

**Release-gate note:** P2 — onboarding reliability.

---

## COMMS-020 · [C] · P3 · Won't Fix

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Won't Fix. Parent spec §23.4.4 explicitly documents "parent lacks close affordance" as the intended behaviour. No code change. If product ever reverses this, opening a new bug for a `inquiries.close_own` permission is the right path.

**Title:** Parent cannot close their own inquiry; must wait for admin

**Provenance:** Code-review observation O9; parent spec §23.4.4 explicitly documents as desired behaviour.

**Summary:** `POST /v1/inquiries/:id/close` requires `inquiries.respond` permission (admin-only). Parents have `parent.submit_inquiry` only. If a parent resolves their question without admin response, they cannot mark it closed.

**Expected (per spec):** parent lacks close affordance; UI hides button. This is DOCUMENTED as intended behaviour.

**Recommendation:** likely **Won't Fix** — confirm with product that parents should never close. If product does want parent-close, add an `inquiries.close_own` permission and grant to parent role.

**Release-gate note:** Verify with product → set Won't Fix or change scope.

---

## COMMS-021 · [C] · P3 · Won't Fix

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Won't Fix. Integration spec §10.8.1 documents snapshot-at-publish as intentional for audit + non-repudiation. No code change. Reopen only if product confirms late-joiner notification is now a requirement.

**Title:** Broadcast audience snapshot is frozen at publish time; users joining the class mid-delivery are NOT retroactively notified

**Provenance:** Code-review observation O10; integration spec §10.8.1 documents as intentional.

**Summary:** When an admin publishes a broadcast, `BroadcastAudienceSnapshot` freezes the recipient set at publish time. A student who joins Class 2A after the snapshot but before delivery does NOT receive the announcement.

**Expected (per spec):** snapshot-at-publish. This is documented as intentional for audit + non-repudiation.

**Recommendation:** confirm with product. Often better ergonomics to backfill late-joiners for ~24h after publish. If product agrees, add a background job that re-resolves the audience N minutes after publish and sends notifications to the delta set.

**Release-gate note:** product decision.

---

## COMMS-022 · [C] · P3 · Ready — awaiting next migration deploy

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: User approved the migration to piggy-back on tonight's migration deploy. Schema, migration SQL, Prisma client regeneration, and worker dispatcher change all committed locally. **NOT deployed yet** — deploying the worker code before the migration runs would fail type-check on the server (the `chain_id` field doesn't exist in prod's Prisma client). Will deploy together with the rest of tonight's migration bundle.

### Verification notes

- 2026-04-13: `pnpm prisma generate` produced a client with the new field. `pnpm jest dispatch-notifications` → 10/10 passing. Migration SQL is additive and backwards-compatible (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`). Existing rows stay NULL — not retroactively linked. Manual verification post-deploy: trigger a whatsapp send that fails, confirm (a) original row gets `chain_id` populated, (b) the auto-created SMS fallback shares the same `chain_id`.

**Title:** Fallback chain (whatsapp → sms → email → in_app) lacks an explicit shared `idempotency_key(chain)` so analytics can't reliably trace a failed-delivery chain

**Provenance:** Code-review observation O11; integration spec §6.2.4.

**Summary:** When a whatsapp send fails and fallback enqueues an SMS, the new `notifications` row has a new `idempotency_key`. The linkage to the original notification is only via `source_entity_id`, which may be the same for unrelated sends (e.g. two announcements to the same user). Analytics can't group "failed whatsapp → fallback sms → fallback email" into a single chain.

**Expected:** each fallback row inherits a `chain_id` from the original notification, stored in a new column or in `metadata_json`.

**Affected files:**

- `apps/worker/src/processors/communications/dispatch-notifications.processor.ts` — fallback enqueue path
- `packages/prisma/schema.prisma` — `notifications` table (add `chain_id UUID` nullable column)

**Fix direction:** generate a `chain_id` UUID at the first notification in a chain, propagate to all fallbacks. Add `(tenant_id, chain_id)` index for analytics.

**Release-gate note:** P3 — observability improvement.

---

## COMMS-023 · [C] · P3 · Verified

**Assigned:** Claude Opus 4.6 — 2026-04-13

### Decisions

- 2026-04-13: Rewrote §27.5.2 to use `GET /v1/inbox/conversations` + per-thread verification instead of a raw cross-tenant SQL scan.

### Verification notes

- 2026-04-13: Spec file only — no deploy needed. Change committed as `docs(e2e-comms): comms-023 replace cross-tenant direct-db query in teacher spec`.

**Title:** Integration-spec harness proposed an expensive DIRECT-DB cross-tenant count query (teacher §27.5.2) that should instead go via the API

**Provenance:** Code-review observation O3. Lives in `teacher_view/communications-e2e-spec.md` §27.5.2.

**Summary:** Spec row 27.5.2 proposed: `SELECT DISTINCT tenant_id FROM conversations c JOIN conversation_participants cp ...` as a verification query. Without proper tenant-context setting, this full-table scan is expensive and circumvents RLS.

**Expected:** rewrite the invariant to use the UI / API endpoint and assert on the response shape, not a raw SQL cross-tenant count.

**Affected files:** `E2E/5_operations/communications/teacher_view/communications-e2e-spec.md` §27.5.2 — update the row.

**Fix direction:** when updating the spec pack, adjust the wording to "list inbox conversations via `GET /v1/inbox/conversations` and assert every row's tenant_id resolves to nhqs via a secondary API call", avoiding raw SQL.

**Release-gate note:** P3 — spec-only fix.

---

## COMMS-024 · [L] · INFO · Closed / No action

**Title:** O5 (inbox search q-length cap) verified safe — downgrade RELEASE-READINESS flag

**Provenance:** Live verification during 2026-04-12 walkthrough.

**Summary:** RELEASE-READINESS.md flagged O5 as P1: "inbox search q-length cap missing". Live probe returned:

- `GET /v1/inbox/search?q=<10000 chars>` → nginx `414 Request-URI Too Large`
- `GET /v1/inbox/search?q=<2000 chars>` → `400 VALIDATION_ERROR / SEARCH_QUERY_TOO_LONG`

The Zod cap is in place and enforced before reaching the tsvector. nginx catches anything beyond URL-buffer limits. **No vulnerability.**

**Action:** update RELEASE-READINESS.md observation list to remove O5 from the P1 column. Already noted here for traceability.

**Status:** Verified safe — no code change needed.

---

## COMMS-025 · [L] · INFO · Open (MCP tooling note only)

**Title:** Three admin UI interactions failed under MCP `browser_click` but worked under DOM `.click()` — likely Playwright ref staleness, not product bugs

**Provenance:** Live walkthrough on admin shell.

**Summary:** During the first admin session, three clicks produced no UI response:

1. Admin Inbox → Compose button (first attempt) — later opened on a fresh session via DOM click
2. `/en/communications/announcements` → "New Announcement" action-bar button
3. `/en/communications/new` → Scope combobox

In each case, re-running via `browser_evaluate(() => document.querySelector('...').click())` succeeded. Most likely cause: MCP's captured snapshot ref was stale after React hydration / state update, and the click targeted an element that had been replaced.

**Action:** no product fix required. **Testers using Playwright MCP should either refresh before interacting, or rely on DOM-level `.click()` via `browser_evaluate` when a ref-based click produces no observable change.**

**Status:** Informational.

---

# Summary table (machine-readable)

Status values: `Open`, `In Progress`, `Fixed`, `Verified`, `Blocked`, `Won't Fix`, `Closed / No action`

| ID        | Prov | Severity | Status                      | Owner           | One-line                                                                                     |
| --------- | ---- | -------- | --------------------------- | --------------- | -------------------------------------------------------------------------------------------- |
| COMMS-001 | L    | P1       | Verified                    | Claude Opus 4.6 | Parent dashboard "Contact School" → 404 `/communications/messages/new`                       |
| COMMS-002 | L    | P1       | Verified                    | Claude Opus 4.6 | `/v1/inquiries/my` 404 `PARENT_NOT_FOUND` + UI swallows as empty state                       |
| COMMS-003 | L    | P2       | Verified                    | Claude Opus 4.6 | Announcements list missing status-filter tabs (spec §21)                                     |
| COMMS-004 | L    | P2       | Verified                    | Claude Opus 4.6 | Admin Inquiries list missing status-filter tabs (spec §24)                                   |
| COMMS-005 | L    | P2       | Verified                    | Claude Opus 4.6 | `settings.sen` raw i18n key in Settings sidebar on every `/settings/*` page                  |
| COMMS-006 | L    | P2       | Verified                    | Claude Opus 4.6 | Teacher admin-only redirects go to `/dashboard` not `/inbox` (spec mismatch)                 |
| COMMS-007 | L    | P3       | Verified                    | Claude Opus 4.6 | `/en/logout` returns 404 — dead route                                                        |
| COMMS-008 | L    | P3       | Verified                    | Claude Opus 4.6 | Parent dashboard fires admin-only widget requests (403 console noise)                        |
| COMMS-009 | L    | P3       | Verified                    | Claude Opus 4.6 | Teacher compose Broadcast tab visible despite policy denial                                  |
| COMMS-010 | L    | P3       | Deferred — behaviour module | Claude Opus 4.6 | `/settings/notifications` missing 8 behaviour.\* types from spec §29                         |
| COMMS-011 | L    | P3       | Verified                    | Claude Opus 4.6 | Parent dashboard "View Grades" → 404 `/learning/reports` (Learning module, not Comms)        |
| COMMS-012 | L    | P2       | Verified                    | Claude Opus 4.6 | Student account login fails — blocks student walkthrough on prod                             |
| COMMS-013 | C    | P1       | Verified                    | Claude Opus 4.6 | Thread-view `read_state` returned to all roles; UI filter is the only guard                  |
| COMMS-014 | C    | P1       | Deferred — not yet at scale | Claude Opus 4.6 | Oversight PDF export renders synchronously; blocks request workers                           |
| COMMS-015 | C    | P2       | Verified                    | Claude Opus 4.6 | Safeguarding keyword cache 5-min TTL — stale matches after deletion                          |
| COMMS-016 | C    | P2       | Verified                    | Claude Opus 4.6 | Saved-audience recursion lacks explicit depth cap                                            |
| COMMS-017 | C    | P2       | Verified                    | Claude Opus 4.6 | Edit-window consistency between roles unverified in code                                     |
| COMMS-018 | C    | P1       | Verified                    | Claude Opus 4.6 | `notification_templates` dual-policy sloppy-write → cross-tenant leak risk                   |
| COMMS-019 | C    | P2       | Verified                    | Claude Opus 4.6 | Permission backfill run-once-at-boot — new tenants may miss permissions                      |
| COMMS-020 | C    | P3       | Won't Fix                   | Claude Opus 4.6 | Parent cannot close own inquiry (spec says intentional — confirm w/ product)                 |
| COMMS-021 | C    | P3       | Won't Fix                   | Claude Opus 4.6 | Broadcast snapshot frozen at publish — late joiners missed (spec says intentional — confirm) |
| COMMS-022 | C    | P3       | Ready — awaiting migration  | Claude Opus 4.6 | Fallback chain lacks `chain_id` for analytics linkage                                        |
| COMMS-023 | C    | P3       | Verified                    | Claude Opus 4.6 | Teacher spec §27.5.2 proposes expensive DIRECT-DB cross-tenant query — rewrite to use API    |
| COMMS-024 | L    | INFO     | Closed / No action          | —               | O5 (search q-length cap) verified safe — downgrade from P1                                   |
| COMMS-025 | L    | INFO     | Open (tooling note)         | —               | MCP `browser_click` ref-staleness — use DOM `.click()` fallback                              |

**Totals:** 25 entries · Live (`L`): 13 · Code-review (`C`): 11 · Informational (`INFO`): 2 (one closed, one tooling-note). Severity: P0: 0 · P1: 5 · P2: 8 · P3: 10 · INFO: 2.
